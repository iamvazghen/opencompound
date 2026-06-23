// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IPool, IFlashLoanSimpleReceiver, ReserveDataLegacy} from "./interfaces/IAaveV3.sol";
import {CarryMath} from "./libraries/CarryMath.sol";

/// @title  LeveragePosition
/// @notice An ISOLATED, single-owner Aave V3 position (same-asset). Each user owns their own clone
///         (deployed by PositionFactory), so users are fully isolated — one user's LTV, leverage, or
///         liquidation risk never touches another's. Unlike the pooled vaults, here the owner of the
///         position IS the end user, who can:
///           • deposit collateral,
///           • loop-leverage up to 5 cycles (amplify the self-repaying carry),
///           • DRAW LIQUIDITY — borrow cash to their own wallet WITHOUT selling (borrowing is not a
///             taxable event), keeping their asset exposure while the supply/borrow spread repays the
///             debt over time (self-repaying while LTV < break-even),
///           • repay, withdraw, one-shot close, and rely on a permissionless safety guard.
/// @dev    Clone-initializable (EIP-1167). NOT AUDITED. Testnet only.
contract LeveragePosition is IFlashLoanSimpleReceiver {
    using SafeERC20 for IERC20;

    uint256 internal constant BPS = 10_000;
    uint256 internal constant VARIABLE_RATE = 2;
    uint256 public constant MAX_LTV_BPS = 9_000;
    uint256 public constant MAX_CYCLES = 5; // hard loop cap

    address public owner;
    IPool public pool;
    IERC20 public asset;
    IERC20 public aToken;
    IERC20 public variableDebtToken;
    uint256 public safetyBufferBps; // relative to the LIVE liquidation threshold; 9000 = stay ≤ 90% of it
    uint256 private _lock; // 1 = unlocked, 2 = entered (set in initialize — clone-safe, no constructor)

    uint8 private constant FLASH_UNWIND = 1;

    event Deposited(uint256 amount);
    event LiquidityDrawn(uint256 amount, uint256 ltvAfterBps);
    event Repaid(uint256 amount);
    event Withdrawn(uint256 amount);
    event Leveraged(uint256 cyclesRun, uint256 borrowed);
    event Closed();
    event Guarded(uint256 ltvBeforeBps, uint256 ltvAfterBps);

    error AlreadyInitialized();
    error NotOwner();
    error Reentrancy();
    error LtvTooHigh(uint256 ltv, uint256 max);
    error CyclesTooHigh(uint256 requested, uint256 max);
    error PositionSafe(uint256 ltv, uint256 maxSafe);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier lock() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    /// @notice Clone initializer (called once by the factory). The implementation is never funded.
    function initialize(address owner_, IERC20 asset_, IPool pool_) external {
        if (_lock != 0) revert AlreadyInitialized();
        _lock = 1;
        owner = owner_;
        pool = pool_;
        asset = asset_;
        ReserveDataLegacy memory r = pool_.getReserveData(address(asset_));
        require(r.aTokenAddress != address(0), "asset not listed on Aave");
        aToken = IERC20(r.aTokenAddress);
        variableDebtToken = IERC20(r.variableDebtTokenAddress);
        safetyBufferBps = 9_000;
        asset_.forceApprove(address(pool_), type(uint256).max);
    }

    // ───────────────────────────── core user actions ─────────────────────────────

    /// @notice Supply `amount` of the asset as collateral.
    function deposit(uint256 amount) external onlyOwner lock {
        require(amount > 0, "zero");
        asset.safeTransferFrom(msg.sender, address(this), amount);
        pool.supply(address(asset), amount, address(this), 0);
        emit Deposited(amount);
    }

    /// @notice Borrow `amount` of the asset and send it to the owner — liquidity WITHOUT a sale
    ///         (borrowing is not a taxable event). Reverts if it would push LTV above the live safe
    ///         ceiling. While LTV stays below break-even, the supply yield repays this debt over time,
    ///         so the drawn cash is effectively self-repaying. Use drawableSelfRepaying() to size it.
    function drawLiquidity(uint256 amount) external onlyOwner lock {
        require(amount > 0, "zero");
        pool.borrow(address(asset), amount, VARIABLE_RATE, 0, address(this));
        uint256 ltv = currentLtvBps();
        uint256 maxSafe = maxSafeLtvBps();
        if (ltv > maxSafe) revert LtvTooHigh(ltv, maxSafe); // reverts the borrow too
        asset.safeTransfer(owner, amount);
        emit LiquidityDrawn(amount, ltv);
    }

    /// @notice Repay `amount` of debt from the owner's wallet (or type(uint256).max to clear all).
    function repay(uint256 amount) external onlyOwner lock {
        uint256 debt = variableDebtToken.balanceOf(address(this));
        if (amount > debt) amount = debt;
        require(amount > 0, "nothing to repay");
        asset.safeTransferFrom(msg.sender, address(this), amount);
        uint256 repaid = pool.repay(address(asset), amount, VARIABLE_RATE, address(this));
        emit Repaid(repaid);
    }

    /// @notice Withdraw `amount` of collateral to the owner. Aave reverts if it breaks the health
    ///         factor — repay or close() if you're leveraged.
    function withdraw(uint256 amount) external onlyOwner lock {
        pool.withdraw(address(asset), amount, owner);
        emit Withdrawn(amount);
    }

    // ───────────────────────────── leverage (loop, cap 5) ─────────────────────────────

    /// @notice Loop borrow→supply up to `cycles` (≤5), borrowing to `targetLtvBps` of current
    ///         collateral each cycle. Amplifies the self-repaying carry; no cash leaves the position.
    function leverage(uint256 targetLtvBps, uint256 cycles) external onlyOwner lock returns (uint256 cyclesRun) {
        if (targetLtvBps > maxSafeLtvBps()) revert LtvTooHigh(targetLtvBps, maxSafeLtvBps());
        if (cycles > MAX_CYCLES) revert CyclesTooHigh(cycles, MAX_CYCLES);
        uint256 borrowedTotal;
        for (uint256 i = 0; i < cycles; i++) {
            uint256 supplied = aToken.balanceOf(address(this));
            uint256 debt = variableDebtToken.balanceOf(address(this));
            uint256 cap = (supplied * targetLtvBps) / BPS;
            if (cap <= debt) break;
            uint256 toBorrow = cap - debt;
            if (toBorrow < 1e6) break;
            pool.borrow(address(asset), toBorrow, VARIABLE_RATE, 0, address(this));
            pool.supply(address(asset), toBorrow, address(this), 0);
            borrowedTotal += toBorrow;
            cyclesRun++;
        }
        emit Leveraged(cyclesRun, borrowedTotal);
    }

    /// @notice Repay ALL debt and withdraw ALL collateral to the owner in one tx (flash unwind).
    function close() external onlyOwner lock {
        uint256 debt = variableDebtToken.balanceOf(address(this));
        if (debt > 0) {
            pool.flashLoanSimple(address(this), address(asset), debt, abi.encode(FLASH_UNWIND), 0);
        }
        uint256 remaining = aToken.balanceOf(address(this));
        if (remaining > 0) pool.withdraw(address(asset), remaining, owner);
        emit Closed();
    }

    /// @notice PERMISSIONLESS safety guard. Anyone (a keeper) may call it, but it only acts when LTV
    ///         has drifted ABOVE the live safe ceiling — it flash-deleverages back to safety, then
    ///         reverts on a no-op (no griefing). Protects the owner even when they're away.
    function guard() external lock {
        uint256 ltv = currentLtvBps();
        uint256 maxSafe = maxSafeLtvBps();
        if (ltv <= maxSafe) revert PositionSafe(ltv, maxSafe);
        uint256 restore = (maxSafe * 9000) / BPS; // restore to 90% of the safe ceiling
        uint256 c = aToken.balanceOf(address(this));
        uint256 d = variableDebtToken.balanceOf(address(this));
        uint256 deltaD = (d * BPS - restore * c) / (BPS - restore);
        pool.flashLoanSimple(address(this), address(asset), deltaD, abi.encode(FLASH_UNWIND), 0);
        emit Guarded(ltv, currentLtvBps());
    }

    /// @inheritdoc IFlashLoanSimpleReceiver
    /// @dev Runs inside close()/guard()'s lock; gated to pool + self. Same-asset ⇒ no swap.
    function executeOperation(address asset_, uint256 amount, uint256 premium, address initiator, bytes calldata)
        external
        returns (bool)
    {
        require(msg.sender == address(pool), "caller not pool");
        require(initiator == address(this), "initiator not self");
        uint256 owed = amount + premium;
        pool.repay(asset_, amount, VARIABLE_RATE, address(this));
        pool.withdraw(asset_, owed, address(this)); // pool pulls `owed` back for the flash repay
        return true;
    }

    // ───────────────────────────── views ─────────────────────────────

    function currentLtvBps() public view returns (uint256) {
        uint256 c = aToken.balanceOf(address(this));
        if (c == 0) return 0;
        return (variableDebtToken.balanceOf(address(this)) * BPS) / c;
    }

    function liquidationThresholdBps() public view returns (uint256) {
        (,,, uint256 lt,,) = pool.getUserAccountData(address(this));
        if (lt != 0) return lt;
        return (pool.getReserveData(address(asset)).configuration >> 16) & 0xFFFF;
    }

    /// @notice Dynamic safe-LTV ceiling = liveLiquidationThreshold × safetyBufferBps (never hardcoded).
    function maxSafeLtvBps() public view returns (uint256) {
        return (liquidationThresholdBps() * safetyBufferBps) / BPS;
    }

    function currentRates() public view returns (uint256 supplyRateRay, uint256 borrowRateRay) {
        ReserveDataLegacy memory r = pool.getReserveData(address(asset));
        return (r.currentLiquidityRate, r.currentVariableBorrowRate);
    }

    /// @notice Break-even LTV (bps): below it the position self-repays from the supply/borrow spread.
    function breakEvenLtvBps() public view returns (uint256) {
        (uint256 s, uint256 b) = currentRates();
        return CarryMath.breakEvenLtvBps(s, b);
    }

    function isSelfRepaying() external view returns (bool) {
        return currentLtvBps() < breakEvenLtvBps();
    }

    function healthFactor() external view returns (uint256) {
        (,,,,, uint256 hf) = pool.getUserAccountData(address(this));
        return hf;
    }

    function equity() external view returns (uint256) {
        uint256 c = aToken.balanceOf(address(this));
        uint256 d = variableDebtToken.balanceOf(address(this));
        return c > d ? c - d : 0;
    }

    /// @notice Max asset you can still borrow-and-keep while staying ≤ the safe LTV ceiling.
    function drawableToSafe() public view returns (uint256) {
        uint256 cap = (aToken.balanceOf(address(this)) * maxSafeLtvBps()) / BPS;
        uint256 d = variableDebtToken.balanceOf(address(this));
        return cap > d ? cap - d : 0;
    }

    /// @notice Max asset you can borrow-and-keep while the position STAYS self-repaying (≤ break-even,
    ///         and never above the safe ceiling). This is the "tax-free cash you can take and the
    ///         yield still pays it back" figure.
    function drawableSelfRepaying() external view returns (uint256) {
        uint256 be = breakEvenLtvBps();
        uint256 safe = maxSafeLtvBps();
        uint256 ceiling = be < safe ? be : safe;
        uint256 cap = (aToken.balanceOf(address(this)) * ceiling) / BPS;
        uint256 d = variableDebtToken.balanceOf(address(this));
        return cap > d ? cap - d : 0;
    }

    // ───────────────────────────── admin (owner = the user) ─────────────────────────────

    function setSafetyBuffer(uint256 safetyBufferBps_) external onlyOwner {
        require(safetyBufferBps_ > 0 && safetyBufferBps_ <= BPS, "bad buffer");
        safetyBufferBps = safetyBufferBps_;
    }
}
