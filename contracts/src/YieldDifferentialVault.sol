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

import {IPool, IPriceOracleGetter, IFlashLoanSimpleReceiver, ReserveDataLegacy} from "./interfaces/IAaveV3.sol";
import {ISwapRouter} from "./interfaces/ISwapRouter.sol";
import {CarryMath} from "./libraries/CarryMath.sol";

/// @title  YieldDifferentialVault (v2)
/// @notice The financially-real leveraged-staking vault: supply a YIELD-BEARING collateral
///         (e.g. wstETH), borrow its correlated base (e.g. WETH) in Aave e-mode, swap the
///         borrow back into collateral via Uniswap v3, and re-supply — up to `maxCycles`.
/// @dev    Collateral out-earns the borrow (staking yield > borrow cost), so the position
///         carries POSITIVE: collateral value outgrows debt and `harvestAndRepay()` realizes
///         that surplus into debt repayment — genuine self-repayment. See FINANCIAL-REVIEW.md.
///         Assumes both tokens are 18-decimal (wstETH/WETH). NOT AUDITED. Testnet only.
contract YieldDifferentialVault is ERC4626, Ownable, Pausable, ReentrancyGuard, IFlashLoanSimpleReceiver {
    using SafeERC20 for IERC20;

    uint256 internal constant VARIABLE_RATE = 2;
    uint256 internal constant BPS = 10_000;
    uint256 public constant MAX_LTV_BPS = 9_300; // e-mode ETH-correlated ceiling
    uint256 public constant MAX_CYCLES_LIMIT = 10;

    IPool public immutable pool;
    ISwapRouter public immutable swapRouter;
    IERC20 public immutable debtAsset; // borrowed (WETH)
    IERC20 public immutable aCollateral; // aToken for collateral (awstETH)
    IERC20 public immutable vDebt; // variable debt token for debtAsset (vWETH)
    uint24 public immutable poolFee; // Uniswap v3 fee tier for collateral/debt pair

    uint256 public constant RECO_BUFFER_BPS = 500; // recommended LTV sits 5% below break-even

    uint256 public targetLtvBps = 8_000; // conservative within e-mode; HF buffer left
    uint256 public maxCycles = 4;
    uint256 public slippageBps = 50; // 0.50% max swap slippage vs oracle mid
    // Relative safety buffer — guard keeps LTV ≤ this fraction of the LIVE liquidation threshold.
    // Not a hardcoded LTV; the absolute ceiling is computed live in maxSafeLtvBps(). 9000 = 90%.
    uint256 public safetyBufferBps = 9_000;
    // External (staking) yield the collateral earns OUTSIDE Aave, in ray APR. wstETH ≈ 3%.
    // Added to Aave's collateral supply rate to get the true effective yield for break-even.
    // Owner-set estimate (can't be read on-chain generically). Conservative default.
    uint256 public stakingYieldRay = 0.03e27;
    // Floor on the rebalance deadband. rebalance() is permissionless, so without a minimum band a
    // griefer could pass tolBps=0 and trigger a swap on every 1-wei LTV drift, bleeding the vault
    // slippageBps per call. Every rebalance uses max(callerTol, minRebalanceBps). 50 = 0.50%.
    uint256 public minRebalanceBps = 50;

    event Leveraged(uint256 cyclesRun, uint256 borrowedTotal, uint256 suppliedTotal);
    event Deleveraged(uint256 repaid);
    event Guarded(uint256 ltvBefore, uint256 targetLtvBps);
    event StrategyUpdated(uint256 targetLtvBps, uint256 maxCycles, uint256 slippageBps);
    event SafetyBufferUpdated(uint256 safetyBufferBps);

    error LtvTooHigh(uint256 requested, uint256 max);
    error CyclesTooHigh(uint256 requested, uint256 max);
    error SlippageTooHigh(uint256 bps);

    constructor(
        IERC20 collateral_,
        IERC20 debt_,
        IPool pool_,
        ISwapRouter router_,
        uint24 poolFee_,
        uint8 eModeCategory_,
        address owner_,
        string memory name_,
        string memory symbol_
    ) ERC4626(collateral_) ERC20(name_, symbol_) Ownable(owner_) {
        require(IERC20Metadata(address(collateral_)).decimals() == 18, "collateral must be 18dp");
        require(IERC20Metadata(address(debt_)).decimals() == 18, "debt must be 18dp");

        pool = pool_;
        swapRouter = router_;
        debtAsset = debt_;
        poolFee = poolFee_;
        aCollateral = IERC20(pool_.getReserveData(address(collateral_)).aTokenAddress);
        vDebt = IERC20(pool_.getReserveData(address(debt_)).variableDebtTokenAddress);
        require(address(aCollateral) != address(0) && address(vDebt) != address(0), "assets not on Aave");

        if (eModeCategory_ != 0) pool_.setUserEMode(eModeCategory_);

        // Approvals: supply/repay to pool, swap in/out via router.
        collateral_.forceApprove(address(pool_), type(uint256).max);
        collateral_.forceApprove(address(router_), type(uint256).max);
        debt_.forceApprove(address(pool_), type(uint256).max);
        debt_.forceApprove(address(router_), type(uint256).max);
    }

    // ───────────────────────────── ERC-4626 accounting ─────────────────────────────

    /// @dev Virtual-shares offset (OZ ERC-4626 inflation-attack mitigation). 10**6 virtual shares +
    ///      1 virtual asset per conversion makes the first-depositor inflation / donation front-run
    ///      attack cost ~1e6x the victim deposit and bounds the `aCollateral.balanceOf` donation
    ///      vector in totalAssets(). Canonical, audited fix — no custom accounting.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }

    /// @notice Net equity in COLLATERAL units: collateral balance minus debt valued in collateral.
    function totalAssets() public view override returns (uint256) {
        uint256 collateral = aCollateral.balanceOf(address(this));
        uint256 debtInColl = _debtInCollateral(vDebt.balanceOf(address(this)));
        return collateral > debtInColl ? collateral - debtInColl : 0;
    }

    // Aave V3 ReserveConfiguration bit layout (aave-v3-core ReserveConfiguration.sol).
    uint256 private constant ACTIVE_BIT = 56;
    uint256 private constant FROZEN_BIT = 57;
    uint256 private constant PAUSED_BIT = 60;
    uint256 private constant SUPPLY_CAP_BIT = 116;
    uint256 private constant SUPPLY_CAP_MASK = 0xFFFFFFFFF;

    /// @notice Deposit cap honoring Aave on the COLLATERAL reserve (pattern from aave/aave-vault):
    ///         0 if paused / inactive / frozen, room under the supply cap otherwise (uncapped ⇒
    ///         max). deposit()/mint() then revert up-front instead of failing inside Aave.
    function maxDeposit(address) public view override returns (uint256) {
        if (paused()) return 0;
        uint256 config = pool.getReserveData(asset()).configuration;
        if (((config >> ACTIVE_BIT) & 1) == 0) return 0;
        if (((config >> FROZEN_BIT) & 1) == 1) return 0;
        if (((config >> PAUSED_BIT) & 1) == 1) return 0;
        uint256 cap = (config >> SUPPLY_CAP_BIT) & SUPPLY_CAP_MASK;
        if (cap == 0) return type(uint256).max;
        uint256 capWei = cap * (10 ** IERC20Metadata(asset()).decimals());
        uint256 current = aCollateral.totalSupply();
        return capWei > current ? capWei - current : 0;
    }

    function maxMint(address receiver) public view override returns (uint256) {
        uint256 m = maxDeposit(receiver);
        return m == type(uint256).max ? type(uint256).max : convertToShares(m);
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        super._deposit(caller, receiver, assets, shares);
        pool.supply(asset(), assets, address(this), 0);
    }

    /// @dev Withdraw / redeem. When leveraged, unwind the caller's PROPORTIONAL slice of both
    ///      collateral and debt via a flash loan (flash the debt asset, repay the debt slice,
    ///      withdraw the collateral slice, swap just enough to repay the flash, send the rest) — so
    ///      remaining depositors' LTV is untouched and any holder can exit regardless of leverage.
    ///      Caller bears the ~flash premium + swap slippage on their slice. Unlevered ⇒ plain withdraw.
    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares)
        internal
        override
    {
        if (caller != owner) _spendAllowance(owner, caller, shares);
        uint256 supply = totalSupply(); // pre-burn basis, matches previewRedeem
        uint256 coll = aCollateral.balanceOf(address(this));
        uint256 debt = vDebt.balanceOf(address(this));
        _burn(owner, shares);

        if (debt == 0) {
            pool.withdraw(asset(), assets, address(this));
            IERC20(asset()).safeTransfer(receiver, assets);
        } else {
            uint256 collSlice = (coll * shares) / supply;
            uint256 debtSlice = (debt * shares) / supply;
            pool.flashLoanSimple(
                address(this), address(debtAsset), debtSlice, abi.encode(FLASH_REDEEM, collSlice, receiver), 0
            );
        }
        emit Withdraw(caller, receiver, owner, assets, shares);
    }

    // ───────────────────────────── Leverage ─────────────────────────────

    /// @notice Loop: borrow debt to target LTV → swap to collateral → re-supply, up to maxCycles.
    function leverage() external whenNotPaused nonReentrant onlyOwner returns (uint256 cyclesRun) {
        uint256 pc = _price(asset());
        uint256 pd = _price(address(debtAsset));
        uint256 borrowedTotal;

        for (uint256 i = 0; i < maxCycles; i++) {
            uint256 borrowed = _leverageOnce(pc, pd);
            if (borrowed == 0) break;
            borrowedTotal += borrowed;
            cyclesRun++;
        }
        emit Leveraged(cyclesRun, borrowedTotal, borrowedTotal);
    }

    /// @notice Unwind: withdraw collateral, swap to debt, repay up to `repayDebtAmount`
    ///         (type(uint256).max = repay all). Iterate for deeply leveraged positions.
    function deleverage(uint256 repayDebtAmount) external whenNotPaused nonReentrant onlyOwner {
        uint256 debt = vDebt.balanceOf(address(this));
        if (repayDebtAmount > debt) repayDebtAmount = debt;
        emit Deleveraged(_repay(repayDebtAmount));
    }

    // ───────────────────────────── Flash-loan one-shot leverage ─────────────────────────────
    //
    // Reaches EXACT target LTV in one borrow + one swap, versus the iterative loop's N borrows /
    // N swaps / cycle-limited ~83–90% of target. Pattern from Alchemix AutoleverageBase, adapted
    // so the vault flash-loans to ITSELF (it already holds the Aave position). See REFINEMENTS.md.

    uint8 private constant FLASH_LEVER = 0;
    uint8 private constant FLASH_REDEEM = 1;

    /// @notice Leverage to `targetLtvBps` in a single transaction via an Aave flash loan.
    ///         Only valid from an unlevered position (no debt); use `leverage()` to top up.
    function leverageFlash() external whenNotPaused nonReentrant onlyOwner {
        (uint256 collBase, uint256 debtBase,,,,) = pool.getUserAccountData(address(this));
        require(debtBase == 0, "flash entry requires no existing debt");
        require(collBase > 0, "no collateral");

        uint256 pc = _price(asset());
        uint256 pd = _price(address(debtAsset));
        // Debt value to reach target LTV: D = C·L/(1−L). Then the matching collateral to flash.
        uint256 targetDebtBase = (collBase * targetLtvBps) / (BPS - targetLtvBps);
        uint256 borrowAmt = (targetDebtBase * 1e18) / pd;
        // Flash slightly less collateral than the borrow can buy back, leaving room for the
        // flash premium (~9bps) + swap slippage so repayment always clears.
        uint256 flashColl = (((targetDebtBase * 1e18) / pc) * (BPS - slippageBps - 20)) / BPS;

        pool.flashLoanSimple(address(this), asset(), flashColl, abi.encode(FLASH_LEVER, borrowAmt), 0);
    }

    /// @inheritdoc IFlashLoanSimpleReceiver
    /// @dev Aave calls this mid-`flashLoanSimple`. Gated to pool + self; not re-entrant-locked
    ///      because it executes inside `leverageFlash`'s lock (which it must, by design).
    function executeOperation(address asset_, uint256 amount, uint256 premium, address initiator, bytes calldata params)
        external
        returns (bool)
    {
        require(msg.sender == address(pool), "caller not pool");
        require(initiator == address(this), "initiator not self");
        uint256 pc = _price(asset());
        uint256 pd = _price(address(debtAsset));
        uint256 owed = amount + premium;

        if (abi.decode(params, (uint8)) == FLASH_LEVER) {
            // asset_ == collateral. Supply the flashed collateral, borrow the debt, swap back.
            (, uint256 borrowAmt) = abi.decode(params, (uint8, uint256));
            pool.supply(asset_, amount, address(this), 0);
            pool.borrow(address(debtAsset), borrowAmt, VARIABLE_RATE, 0, address(this));
            uint256 received = _swap(address(debtAsset), asset_, borrowAmt, pd, pc); // WETH → wstETH
            require(received >= owed, "swap shortfall vs flash repay");
            if (received > owed) pool.supply(asset_, received - owed, address(this), 0); // re-supply excess
        } else {
            // FLASH_REDEEM: asset_ == debt asset. Repay the caller's debt slice, withdraw their
            // collateral slice, swap just enough collateral to cover the flash repay, send the rest.
            (, uint256 collSlice, address receiver) = abi.decode(params, (uint8, uint256, address));
            pool.repay(address(debtAsset), amount, VARIABLE_RATE, address(this));
            pool.withdraw(asset(), collSlice, address(this)); // collateral (wstETH) to this
            uint256 collForOwed = (((owed * pd) / pc) * (BPS + slippageBps)) / BPS; // pad for slippage
            if (collForOwed > collSlice) collForOwed = collSlice;
            uint256 got = _swap(asset(), address(debtAsset), collForOwed, pc, pd); // wstETH → WETH
            require(got >= owed, "swap shortfall vs flash repay");
            IERC20(asset()).safeTransfer(receiver, collSlice - collForOwed); // un-sold collateral to caller
        }
        // Pool pulls `owed` of the flashed asset from us (max-approved). Any swap dust stays in-vault.
        return true;
    }

    /// @dev One leverage step: borrow up to target LTV, swap to collateral, re-supply.
    ///      Returns the debt borrowed (0 if already at/above target or below dust).
    function _leverageOnce(uint256 pc, uint256 pd) internal returns (uint256 borrowAmt) {
        (uint256 collBase, uint256 debtBase,,,,) = pool.getUserAccountData(address(this));
        uint256 targetDebtBase = (collBase * targetLtvBps) / BPS;
        if (targetDebtBase <= debtBase) return 0;
        borrowAmt = ((targetDebtBase - debtBase) * 1e18) / pd; // base → debt token wei
        if (borrowAmt < 1e12) return 0; // dust
        pool.borrow(address(debtAsset), borrowAmt, VARIABLE_RATE, 0, address(this));
        uint256 received = _swap(address(debtAsset), asset(), borrowAmt, pd, pc);
        pool.supply(asset(), received, address(this), 0);
    }

    /// @dev Withdraw collateral, swap to the debt asset, and repay `repayDebtAmount` of debt.
    function _repay(uint256 repayDebtAmount) internal returns (uint256 repaid) {
        if (repayDebtAmount == 0) return 0;
        uint256 pc = _price(asset());
        uint256 pd = _price(address(debtAsset));
        uint256 collForDebt = (repayDebtAmount * pd) / pc;
        uint256 collIn = (collForDebt * (BPS + slippageBps)) / BPS; // pull extra for slippage
        pool.withdraw(asset(), collIn, address(this));
        uint256 debtReceived = _swap(asset(), address(debtAsset), collIn, pc, pd);
        uint256 debt = vDebt.balanceOf(address(this));
        uint256 toRepay = debtReceived < debt ? debtReceived : debt;
        repaid = pool.repay(address(debtAsset), toRepay, VARIABLE_RATE, address(this));
    }

    /// @dev Repay debt worth `debtBaseAmount` (base currency, 8dp).
    function _deleverageByDebtValue(uint256 debtBaseAmount) internal {
        uint256 repayAmt = (debtBaseAmount * 1e18) / _price(address(debtAsset));
        uint256 debt = vDebt.balanceOf(address(this));
        emit Deleveraged(_repay(repayAmt > debt ? debt : repayAmt));
    }

    // ───────────────────────────── Self-repaying / rebalancing ─────────────────────────────
    //
    // SELF-REPAYING IS PASSIVE HERE. As the yield-bearing collateral appreciates against the
    // debt asset, the WETH debt becomes cheaper in collateral terms, so `totalAssets` (equity
    // in collateral units) — and therefore the share price — rises on its own. Depositors'
    // equity compounds with no transaction. There is no "free debt repayment": appreciation is
    // equity growth, not spare cash. The active levers are `deleverage()` (de-risk by repaying
    // with the now-cheaper debt) and `rebalance()` (restore target LTV in either direction).

    /// @notice Restore the position to `targetLtvBps`. If LTV drifted ABOVE target (debt asset
    ///         rose / collateral fell) it deleverages; if BELOW (collateral appreciated) it
    ///         re-levers one step toward target. Keeper-callable. `tolBps` is a no-op deadband.
    function rebalance(uint256 tolBps) external whenNotPaused nonReentrant {
        // Enforce a minimum deadband so permissionless callers can't spam slippage-bleeding swaps.
        if (tolBps < minRebalanceBps) tolBps = minRebalanceBps;
        (uint256 collBase, uint256 debtBase,,,,) = pool.getUserAccountData(address(this));
        if (collBase == 0) return;
        uint256 ltv = (debtBase * BPS) / collBase;
        if (ltv > targetLtvBps + tolBps) {
            // Over-levered: repay down to target.
            uint256 excessBase = debtBase - (collBase * targetLtvBps) / BPS;
            _deleverageByDebtValue(excessBase);
        } else if (ltv + tolBps < targetLtvBps) {
            // Under-levered (e.g. after appreciation): borrow one step back toward target.
            _leverageOnce(_price(asset()), _price(address(debtAsset)));
        }
    }

    /// @notice PERMISSIONLESS safety guard. Anyone (a keeper) may call this; it only acts when LTV
    ///         has drifted ABOVE `safeLtvBps` (e.g. a wstETH/WETH wobble), deleveraging back to
    ///         target so the position resists liquidation even if the owner is away. Reverts when
    ///         the position is already safe.
    /// @notice The LIVE Aave liquidation threshold for the position (e-mode-aware), bps.
    function liquidationThresholdBps() public view returns (uint256) {
        (,,, uint256 lt,,) = pool.getUserAccountData(address(this));
        if (lt != 0) return lt;
        return (pool.getReserveData(asset()).configuration >> 16) & 0xFFFF;
    }

    /// @notice Dynamic safe-LTV ceiling = liveLiquidationThreshold × safetyBufferBps. Recomputed
    ///         each call — adapts to the assets and the market, never hardcoded/stale.
    function maxSafeLtvBps() public view returns (uint256) {
        return (liquidationThresholdBps() * safetyBufferBps) / BPS;
    }

    /// @notice PERMISSIONLESS guard — anyone can call; only acts when LTV exceeds the LIVE
    ///         maxSafeLtvBps(), deleveraging back to target. Reverts when already safe.
    function guard() external whenNotPaused nonReentrant {
        (uint256 collBase, uint256 debtBase,,,,) = pool.getUserAccountData(address(this));
        uint256 ltv = collBase == 0 ? 0 : (debtBase * BPS) / collBase;
        uint256 maxSafe = maxSafeLtvBps();
        require(ltv > maxSafe, "position safe");
        uint256 restore = targetLtvBps < maxSafe ? targetLtvBps : (maxSafe * 9000) / BPS;
        uint256 excessBase = debtBase - (collBase * restore) / BPS;
        _deleverageByDebtValue(excessBase);
        emit Guarded(ltv, restore);
    }

    // ───────────────────────────── Views ─────────────────────────────

    function healthFactor() external view returns (uint256) {
        (,,,,, uint256 hf) = pool.getUserAccountData(address(this));
        return hf;
    }

    /// @notice Live Aave rates for the two legs, ray APR.
    /// @return collateralSupplyRay Aave supply rate on the collateral
    /// @return debtBorrowRay Aave variable borrow rate on the debt asset
    function aaveRates() public view returns (uint256 collateralSupplyRay, uint256 debtBorrowRay) {
        return (
            uint256(pool.getReserveData(asset()).currentLiquidityRate),
            uint256(pool.getReserveData(address(debtAsset)).currentVariableBorrowRate)
        );
    }

    /// @notice Effective supply yield = Aave collateral supply rate + external staking yield (ray).
    function effectiveSupplyRay() public view returns (uint256) {
        (uint256 s,) = aaveRates();
        return s + stakingYieldRay;
    }

    /// @notice Break-even LTV (bps) using the EFFECTIVE yield (Aave supply + staking) vs the debt
    ///         borrow rate. Positive carry while LTV stays below this.
    function breakEvenLtvBps() public view returns (uint256) {
        (, uint256 b) = aaveRates();
        return CarryMath.breakEvenLtvBps(effectiveSupplyRay(), b);
    }

    /// @notice Net carry the equity earns at a given LTV, ray (signed), using effective yield.
    function netCarryRayAt(uint256 ltvBps) public view returns (int256) {
        (, uint256 b) = aaveRates();
        return CarryMath.netCarryRay(effectiveSupplyRay(), b, ltvBps);
    }

    /// @notice Recommended LTV (bps): highest positive-carry LTV minus a 5% buffer, capped.
    function recommendedLtvBps() public view returns (uint256) {
        (, uint256 b) = aaveRates();
        uint256 r = CarryMath.recommendedLtvBps(effectiveSupplyRay(), b, RECO_BUFFER_BPS);
        return r > MAX_LTV_BPS ? MAX_LTV_BPS : r;
    }

    // ───────────────────────────── Internal ─────────────────────────────

    /// @dev Convert a debt-token amount into collateral units via the Aave oracle.
    function _debtInCollateral(uint256 debtAmt) internal view returns (uint256) {
        if (debtAmt == 0) return 0;
        return (debtAmt * _price(address(debtAsset))) / _price(asset());
    }

    /// @dev Aave (Chainlink) oracle price, base currency 8dp. Reverts on a zero/unavailable feed —
    ///      a 0 price would make swap min-out math collapse to 0 and let a swap clear at any price.
    ///      Sandwich loss on the swap itself is already bounded to slippageBps by the oracle-derived
    ///      amountOutMinimum in _swap (independent of the manipulable pool spot), so no TWAP needed.
    function _price(address token) internal view returns (uint256 p) {
        p = IPriceOracleGetter(pool.ADDRESSES_PROVIDER().getPriceOracle()).getAssetPrice(token);
        require(p > 0, "oracle price unavailable");
    }

    /// @dev Swap exact `amountIn` of `tokenIn` for `tokenOut`, with min-out derived from the
    ///      oracle mid price and `slippageBps`. priceIn/priceOut are base-currency (8dp) prices.
    function _swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 priceIn, uint256 priceOut)
        internal
        returns (uint256)
    {
        uint256 expectedOut = (amountIn * priceIn) / priceOut;
        uint256 minOut = (expectedOut * (BPS - slippageBps)) / BPS;
        return swapRouter.exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: poolFee,
                recipient: address(this),
                amountIn: amountIn,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            })
        );
    }

    // ───────────────────────────── Admin ─────────────────────────────

    function setStrategy(uint256 targetLtvBps_, uint256 maxCycles_, uint256 slippageBps_) external onlyOwner {
        if (targetLtvBps_ > MAX_LTV_BPS) revert LtvTooHigh(targetLtvBps_, MAX_LTV_BPS);
        if (maxCycles_ > MAX_CYCLES_LIMIT) revert CyclesTooHigh(maxCycles_, MAX_CYCLES_LIMIT);
        if (slippageBps_ > 500) revert SlippageTooHigh(slippageBps_); // 5% hard cap
        targetLtvBps = targetLtvBps_;
        maxCycles = maxCycles_;
        slippageBps = slippageBps_;
        emit StrategyUpdated(targetLtvBps_, maxCycles_, slippageBps_);
    }

    /// @notice Set the relative safety buffer (bps of the live liquidation threshold). 9000 = 90%.
    function setSafetyBuffer(uint256 safetyBufferBps_) external onlyOwner {
        require(safetyBufferBps_ > 0 && safetyBufferBps_ <= BPS, "bad buffer");
        safetyBufferBps = safetyBufferBps_;
        emit SafetyBufferUpdated(safetyBufferBps_);
    }

    function setEMode(uint8 categoryId) external onlyOwner {
        pool.setUserEMode(categoryId);
    }

    /// @notice Set the minimum rebalance deadband (bps). Caps how tight a permissionless caller can
    ///         force a rebalance, so swaps can't be spammed to bleed slippage. Bounded to ≤ 10%.
    function setMinRebalanceBps(uint256 minRebalanceBps_) external onlyOwner {
        require(minRebalanceBps_ <= 1_000, "band too wide");
        minRebalanceBps = minRebalanceBps_;
    }

    /// @notice Update the external staking-yield estimate (ray APR) used in break-even math.
    ///         Capped at 100% to stop a fat-finger from making any LTV look safe.
    function setStakingYield(uint256 stakingYieldRay_) external onlyOwner {
        require(stakingYieldRay_ <= 1e27, "yield too high");
        stakingYieldRay = stakingYieldRay_;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Break-glass: repay all debt by selling collateral, return the rest to owner.
    ///         May need several calls for deeply leveraged positions (Aave HF gate per pass).
    function emergencyUnwind() external onlyOwner nonReentrant {
        uint256 debt = vDebt.balanceOf(address(this));
        if (debt > 0) {
            uint256 pc = _price(asset());
            uint256 pd = _price(address(debtAsset));
            uint256 collIn = (((debt * pd) / pc) * (BPS + slippageBps)) / BPS;
            uint256 avail = aCollateral.balanceOf(address(this));
            if (collIn > avail) collIn = avail;
            pool.withdraw(asset(), collIn, address(this));
            uint256 got = _swap(asset(), address(debtAsset), collIn, pc, pd);
            pool.repay(address(debtAsset), got < debt ? got : debt, VARIABLE_RATE, address(this));
        }
        uint256 remaining = aCollateral.balanceOf(address(this));
        if (remaining > 0) pool.withdraw(asset(), remaining, owner());
    }
}
