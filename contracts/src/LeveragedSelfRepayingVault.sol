// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IPool, IFlashLoanSimpleReceiver, ReserveDataLegacy} from "./interfaces/IAaveV3.sol";
import {CarryMath} from "./libraries/CarryMath.sol";

/// @title  LeveragedSelfRepayingVault
/// @notice ERC-4626 vault that gives same-asset leveraged exposure on Aave V3
///         (supply X, borrow X, re-supply — up to `maxCycles` at `targetLtvBps`)
///         and a self-repaying mode that routes harvested rewards into debt repayment.
/// @dev    SINGLE-ASSET design: collateral == debt == `asset()`.
///         - Net equity (`totalAssets`) = aToken balance − variableDebt balance.
///         - Same-asset loops are NEGATIVE CARRY on Aave's rate spread, so the
///           "self-repaying" source here is harvested incentive rewards, NOT yield.
///           A yield-differential variant (supply wstETH / borrow WETH) is the v2 path.
///         NOT AUDITED. Testnet only. See README security section.
contract LeveragedSelfRepayingVault is ERC4626, Ownable, Pausable, ReentrancyGuard, IFlashLoanSimpleReceiver {
    using SafeERC20 for IERC20;

    uint256 internal constant VARIABLE_RATE = 2; // Aave V3 variable interest rate mode
    uint256 internal constant BPS = 10_000;
    uint256 public constant MAX_LTV_BPS = 9_000; // hard ceiling regardless of config
    uint256 public constant MAX_CYCLES_LIMIT = 10; // hard ceiling regardless of config
    uint256 public constant RECO_BUFFER_BPS = 1_000; // recommended LTV sits 10% below break-even

    IPool public immutable pool;
    IERC20 public immutable aToken; // Aave receipt for supplied collateral
    IERC20 public immutable variableDebtToken; // Aave variable debt receipt

    uint256 public targetLtvBps = 7_000; // user's intended leverage setpoint
    uint256 public maxCycles = 4; // 4 loops per spec
    // The ONLY stored safety knob is a RELATIVE buffer: the guard keeps LTV at or below this
    // fraction of the asset's LIVE Aave liquidation threshold. The absolute safe LTV is never
    // stored — it's computed on every call from the current threshold (see maxSafeLtvBps), so it
    // adapts per-asset and can never go stale. 9000 = stay at ≤ 90% of the liquidation threshold.
    uint256 public safetyBufferBps = 9_000;

    event StrategyUpdated(uint256 targetLtvBps, uint256 maxCycles);
    event SafetyBufferUpdated(uint256 safetyBufferBps);
    event Leveraged(uint256 cyclesRun, uint256 totalSupplied, uint256 totalBorrowed);
    event Deleveraged(uint256 repaid, uint256 withdrawn);
    event Guarded(uint256 ltvBefore, uint256 ltvAfter);
    event Harvested(uint256 repaidFromRewards);
    event EModeSet(uint8 categoryId);

    error LtvTooHigh(uint256 requested, uint256 max);
    error CyclesTooHigh(uint256 requested, uint256 max);
    error NothingToHarvest();
    error PositionSafe(uint256 ltv, uint256 maxSafeLtv);

    /// @param asset_ the single underlying token (collateral == debt)
    constructor(IERC20 asset_, IPool pool_, address owner_, string memory name_, string memory symbol_)
        ERC4626(asset_)
        ERC20(name_, symbol_)
        Ownable(owner_)
    {
        pool = pool_;
        ReserveDataLegacy memory r = pool_.getReserveData(address(asset_));
        require(r.aTokenAddress != address(0), "asset not listed on Aave");
        aToken = IERC20(r.aTokenAddress);
        variableDebtToken = IERC20(r.variableDebtTokenAddress);
        // Max-approve the pool once for supply/repay; SafeERC20 forceApprove handles
        // tokens (e.g. USDT) that require allowance reset to zero first.
        IERC20(asset_).forceApprove(address(pool_), type(uint256).max);
    }

    // ───────────────────────────── ERC-4626 accounting ─────────────────────────────

    /// @notice Net equity in underlying units: supplied collateral minus outstanding debt.
    function totalAssets() public view override returns (uint256) {
        uint256 collateral = aToken.balanceOf(address(this));
        uint256 debt = variableDebtToken.balanceOf(address(this));
        return collateral > debt ? collateral - debt : 0;
    }

    /// @dev On deposit, supply the freshly received underlying straight to Aave.
    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        super._deposit(caller, receiver, assets, shares); // pulls `assets` into this contract
        pool.supply(asset(), assets, address(this), 0);
    }

    /// @notice Migrate an EXISTING Aave supply position into the vault without new funds: a user who
    ///         already supplied this asset to Aave (and holds aTokens) transfers those aTokens in and
    ///         receives vault shares for the equity. No re-supply, no swap. Note: only the COLLATERAL
    ///         (aTokens) can move — Aave debt is non-transferable, so a user with existing debt must
    ///         repay/unwind it on their own account first.
    function depositAToken(uint256 aTokenAmount, address receiver)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 shares)
    {
        require(aTokenAmount > 0, "zero");
        shares = previewDeposit(aTokenAmount); // value the incoming aTokens add, in shares
        aToken.safeTransferFrom(msg.sender, address(this), aTokenAmount); // aTokens already on Aave
        _mint(receiver, shares);
        emit Deposit(msg.sender, receiver, aTokenAmount, shares);
    }

    /// @dev On withdraw, pull from Aave. Aave reverts if this would break the health
    ///      factor, so a leveraged user must `deleverage()` enough first. ponytail:
    ///      no proportional auto-unwind yet — Aave's HF check is the safety net.
    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares)
        internal
        override
    {
        _burnSharesAndCheck(caller, owner, shares);
        pool.withdraw(asset(), assets, address(this));
        IERC20(asset()).safeTransfer(receiver, assets);
        emit Withdraw(caller, receiver, owner, assets, shares);
    }

    function _burnSharesAndCheck(address caller, address owner, uint256 shares) private {
        if (caller != owner) {
            _spendAllowance(owner, caller, shares);
        }
        _burn(owner, shares);
    }

    // ───────────────────────────── Leverage mode ─────────────────────────────

    /// @notice Loop borrow→supply up to `maxCycles`, borrowing `targetLtvBps` of the
    ///         supplied amount each cycle. Stops early if a cycle would borrow ~0.
    function leverage() external whenNotPaused nonReentrant onlyOwner returns (uint256 cyclesRun) {
        uint256 totalSupplied;
        uint256 totalBorrowed;
        for (uint256 i = 0; i < maxCycles; i++) {
            uint256 supplied = aToken.balanceOf(address(this));
            uint256 debt = variableDebtToken.balanceOf(address(this));
            // Borrow up to target LTV against current collateral, net of existing debt.
            uint256 borrowCap = (supplied * targetLtvBps) / BPS;
            if (borrowCap <= debt) break;
            uint256 toBorrow = borrowCap - debt;
            if (toBorrow < 1e6) break; // dust threshold; avoids pointless micro-loops

            pool.borrow(asset(), toBorrow, VARIABLE_RATE, 0, address(this));
            pool.supply(asset(), toBorrow, address(this), 0);

            totalBorrowed += toBorrow;
            totalSupplied += toBorrow;
            cyclesRun++;
        }
        emit Leveraged(cyclesRun, totalSupplied, totalBorrowed);
    }

    /// @notice Unwind leverage: withdraw collateral and repay `repayAmount` of debt.
    ///         Pass type(uint256).max to fully unwind.
    function deleverage(uint256 repayAmount) external whenNotPaused nonReentrant onlyOwner {
        uint256 debt = variableDebtToken.balanceOf(address(this));
        if (repayAmount > debt) repayAmount = debt;
        if (repayAmount == 0) return;

        // Pull the underlying to repay with from the collateral side. Aave's HF check gates
        // how much we can withdraw at once. For a one-shot unwind use deleverageFlash().
        pool.withdraw(asset(), repayAmount, address(this));
        uint256 repaid = pool.repay(asset(), repayAmount, VARIABLE_RATE, address(this));
        emit Deleveraged(repaid, repayAmount);
    }

    // ───────────────────────────── Flash-loan one-shot (fast paths) ─────────────────────────────
    //
    // Same-asset means collateral and debt are the SAME token, so these need NO swap — the flash
    // borrow is repaid 1:1 from the (re)borrow / withdrawal. leverageFlash reaches the EXACT target
    // LTV in one tx (vs the loop's cycle-limited ~64%); deleverageFlash fully unwinds in one tx
    // (vs deleverage()'s several health-factor-gated passes).

    uint8 private constant FLASH_LEVER = 0;
    uint8 private constant FLASH_UNWIND = 1;

    /// @notice Leverage to the exact target LTV in a single transaction. Unlevered start only.
    function leverageFlash() external whenNotPaused nonReentrant onlyOwner {
        require(variableDebtToken.balanceOf(address(this)) == 0, "flash entry requires no debt");
        uint256 equity = aToken.balanceOf(address(this)); // no debt → collateral == equity
        // To reach LTV L: flash D = L·E/(1−L) of the asset, supply it, borrow D(+premium), repay flash.
        uint256 flashAmt = (equity * targetLtvBps) / (BPS - targetLtvBps);
        if (flashAmt < 1e6) return;
        pool.flashLoanSimple(address(this), asset(), flashAmt, abi.encode(FLASH_LEVER), 0);
        emit Leveraged(1, flashAmt, flashAmt);
    }

    /// @notice Fully unwind (repay all debt, no residual) in a single transaction.
    function deleverageFlash() external whenNotPaused nonReentrant onlyOwner {
        _flashUnwind(variableDebtToken.balanceOf(address(this)));
    }

    /// @notice The asset's LIVE Aave liquidation threshold (bps). Reads the position's effective
    ///         threshold when there is collateral, else decodes the reserve's configured value, so
    ///         it always reflects current Aave governance — never a value we hardcoded.
    function liquidationThresholdBps() public view returns (uint256) {
        (,,, uint256 lt,,) = pool.getUserAccountData(address(this));
        if (lt != 0) return lt;
        return (pool.getReserveData(asset()).configuration >> 16) & 0xFFFF; // bits 16-31 = liq threshold
    }

    /// @notice The dynamic safe-LTV ceiling = liveLiquidationThreshold × safetyBufferBps. Computed
    ///         on every call, so it tracks the asset and the market — guard() fires above this.
    function maxSafeLtvBps() public view returns (uint256) {
        return (liquidationThresholdBps() * safetyBufferBps) / BPS;
    }

    /// @notice PERMISSIONLESS safety guard. Anyone (typically a keeper bot) may call this, but it
    ///         only acts when LTV has drifted ABOVE the LIVE maxSafeLtvBps() — it then
    ///         flash-deleverages the position back to a safe LTV, protecting it from liquidation even
    ///         if the owner never checks in. Reverts when the position is already safe (no griefing).
    ///         Same-asset, so no swap is needed. The trigger adapts to live rates/threshold; nothing
    ///         is hardcoded.
    function guard() external whenNotPaused nonReentrant {
        uint256 ltv = currentLtvBps();
        uint256 maxSafe = maxSafeLtvBps();
        if (ltv <= maxSafe) revert PositionSafe(ltv, maxSafe);
        // Restore to the user's target if it's safe, otherwise to 90% of the live safe ceiling.
        uint256 restore = targetLtvBps < maxSafe ? targetLtvBps : (maxSafe * 9000) / BPS;
        uint256 c = aToken.balanceOf(address(this));
        uint256 d = variableDebtToken.balanceOf(address(this));
        uint256 deltaD = (d * BPS - restore * c) / (BPS - restore); // ΔD to restore `restore` LTV
        _flashUnwind(deltaD);
        emit Guarded(ltv, currentLtvBps());
    }

    function _flashUnwind(uint256 repayAmt) internal {
        uint256 debt = variableDebtToken.balanceOf(address(this));
        if (repayAmt > debt) repayAmt = debt;
        if (repayAmt == 0) return;
        pool.flashLoanSimple(address(this), asset(), repayAmt, abi.encode(FLASH_UNWIND), 0);
        emit Deleveraged(repayAmt, repayAmt);
    }

    /// @inheritdoc IFlashLoanSimpleReceiver
    /// @dev Aave calls this mid-flash. Gated to pool + self; runs inside the caller's lock.
    function executeOperation(address asset_, uint256 amount, uint256 premium, address initiator, bytes calldata params)
        external
        returns (bool)
    {
        require(msg.sender == address(pool), "caller not pool");
        require(initiator == address(this), "initiator not self");
        uint256 owed = amount + premium;

        if (abi.decode(params, (uint8)) == FLASH_LEVER) {
            // supply the flashed collateral, borrow what we owe back (same asset, no swap)
            pool.supply(asset_, amount, address(this), 0);
            pool.borrow(asset_, owed, VARIABLE_RATE, 0, address(this));
        } else {
            // repay all debt, then withdraw the owed amount of now-freed collateral
            pool.repay(asset_, amount, VARIABLE_RATE, address(this));
            pool.withdraw(asset_, owed, address(this));
        }
        return true; // collateral already max-approved to the pool, which pulls `owed`
    }

    // ───────────────────────────── Self-repaying mode ─────────────────────────────

    /// @notice Repay debt using any underlying sitting idle in this contract — e.g.
    ///         incentive rewards that a keeper has already claimed and swapped into
    ///         the underlying and transferred here. This is the same-asset self-repay
    ///         source (the rate spread is negative, so it cannot be the source).
    /// @dev    The reward-claim/swap step lives off-chain (keeper) for now; this
    ///         function is the on-chain sink. v2 wires Aave RewardsController directly.
    function harvestAndRepay() external whenNotPaused nonReentrant returns (uint256 repaid) {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        uint256 debt = variableDebtToken.balanceOf(address(this));
        uint256 amount = idle < debt ? idle : debt;
        if (amount == 0) revert NothingToHarvest();
        repaid = pool.repay(asset(), amount, VARIABLE_RATE, address(this));
        emit Harvested(repaid);
    }

    // ───────────────────────────── Views / risk ─────────────────────────────

    /// @return healthFactor 1e18-scaled; below 1e18 is liquidatable. type(uint256).max = no debt.
    function healthFactor() external view returns (uint256) {
        (,,,,, uint256 hf) = pool.getUserAccountData(address(this));
        return hf;
    }

    /// @notice Live Aave rates for the underlying, in ray (1e27).
    /// @dev Supply yield is earned on the (larger) collateral, borrow interest paid on the
    ///      (smaller) debt — so the position's NET interest is positive while LTV stays below
    ///      the break-even (see breakEvenLtvBps), not "always negative". See FINANCIAL-REVIEW.md.
    /// @return supplyRateRay current liquidity (supply) rate
    /// @return borrowRateRay current variable borrow rate
    function currentRates() public view returns (uint256 supplyRateRay, uint256 borrowRateRay) {
        ReserveDataLegacy memory r = pool.getReserveData(asset());
        return (r.currentLiquidityRate, r.currentVariableBorrowRate);
    }

    /// @notice Break-even LTV in bps: the position earns more supply interest than it pays in
    ///         borrow interest — it self-repays from yield — while currentLtvBps() stays BELOW
    ///         this. Equals supplyRate/borrowRate (≈ utilization·(1−reserveFactor) on Aave).
    ///         Above it the debt interest outruns the collateral yield and the position bleeds.
    function breakEvenLtvBps() public view returns (uint256) {
        (uint256 s, uint256 b) = currentRates();
        return CarryMath.breakEvenLtvBps(s, b);
    }

    /// @notice Net interest the equity earns at a given LTV, in ray (signed). (s − b·L)/(1 − L).
    ///         The dashboard reads this across LTVs to plot the carry curve for any asset.
    function netCarryRayAt(uint256 ltvBps) public view returns (int256) {
        (uint256 s, uint256 b) = currentRates();
        return CarryMath.netCarryRay(s, b, ltvBps);
    }

    /// @notice Recommended LTV (bps): the highest self-repaying LTV minus a 10% safety buffer,
    ///         capped at the vault's hard ceiling. The "best" LTV to borrow at given live rates.
    function recommendedLtvBps() public view returns (uint256) {
        (uint256 s, uint256 b) = currentRates();
        uint256 r = CarryMath.recommendedLtvBps(s, b, RECO_BUFFER_BPS);
        return r > MAX_LTV_BPS ? MAX_LTV_BPS : r;
    }

    /// @notice True when the live position is self-repaying (currentLtvBps < breakEvenLtvBps).
    function isSelfRepaying() external view returns (bool) {
        return currentLtvBps() < breakEvenLtvBps();
    }

    /// @return current loan-to-value of the vault's Aave position, in bps.
    function currentLtvBps() public view returns (uint256) {
        uint256 collateral = aToken.balanceOf(address(this));
        if (collateral == 0) return 0;
        uint256 debt = variableDebtToken.balanceOf(address(this));
        return (debt * BPS) / collateral;
    }

    // ───────────────────────────── Admin ─────────────────────────────

    function setStrategy(uint256 targetLtvBps_, uint256 maxCycles_) external onlyOwner {
        if (targetLtvBps_ > MAX_LTV_BPS) revert LtvTooHigh(targetLtvBps_, MAX_LTV_BPS);
        if (maxCycles_ > MAX_CYCLES_LIMIT) revert CyclesTooHigh(maxCycles_, MAX_CYCLES_LIMIT);
        targetLtvBps = targetLtvBps_;
        maxCycles = maxCycles_;
        emit StrategyUpdated(targetLtvBps_, maxCycles_);
    }

    /// @notice Set the safety buffer (bps) — guard() keeps LTV at ≤ this fraction of the live
    ///         liquidation threshold. A relative ratio, not a hardcoded LTV. 9000 = 90%.
    function setSafetyBuffer(uint256 safetyBufferBps_) external onlyOwner {
        require(safetyBufferBps_ > 0 && safetyBufferBps_ <= BPS, "bad buffer");
        safetyBufferBps = safetyBufferBps_;
        emit SafetyBufferUpdated(safetyBufferBps_);
    }

    /// @notice Opt the vault into an Aave e-mode category (high-LTV for correlated assets).
    function setEMode(uint8 categoryId) external onlyOwner {
        pool.setUserEMode(categoryId);
        emit EModeSet(categoryId);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Break-glass: repay all debt then withdraw all collateral to the owner.
    ///         May need several calls if Aave's HF gate limits a single withdraw pass.
    function emergencyUnwind() external onlyOwner nonReentrant {
        uint256 debt = variableDebtToken.balanceOf(address(this));
        if (debt > 0) {
            pool.withdraw(asset(), debt, address(this));
            pool.repay(asset(), debt, VARIABLE_RATE, address(this));
        }
        uint256 remaining = aToken.balanceOf(address(this));
        if (remaining > 0) {
            pool.withdraw(asset(), remaining, owner());
        }
    }
}
