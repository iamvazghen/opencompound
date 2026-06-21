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

import {IPool, ReserveDataLegacy} from "./interfaces/IAaveV3.sol";

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
contract LeveragedSelfRepayingVault is ERC4626, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 internal constant VARIABLE_RATE = 2; // Aave V3 variable interest rate mode
    uint256 internal constant BPS = 10_000;
    uint256 public constant MAX_LTV_BPS = 9_000; // hard ceiling regardless of config
    uint256 public constant MAX_CYCLES_LIMIT = 10; // hard ceiling regardless of config

    IPool public immutable pool;
    IERC20 public immutable aToken; // Aave receipt for supplied collateral
    IERC20 public immutable variableDebtToken; // Aave variable debt receipt

    uint256 public targetLtvBps = 7_000; // 70% per spec
    uint256 public maxCycles = 4; // 4 loops per spec

    event StrategyUpdated(uint256 targetLtvBps, uint256 maxCycles);
    event Leveraged(uint256 cyclesRun, uint256 totalSupplied, uint256 totalBorrowed);
    event Deleveraged(uint256 repaid, uint256 withdrawn);
    event Harvested(uint256 repaidFromRewards);
    event EModeSet(uint8 categoryId);

    error LtvTooHigh(uint256 requested, uint256 max);
    error CyclesTooHigh(uint256 requested, uint256 max);
    error NothingToHarvest();

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

        // Pull the underlying to repay with from the collateral side. Aave's HF check
        // gates how much we can withdraw at once; callers may need several passes for
        // deeply leveraged positions. ponytail: iterative caller-driven unwind, no
        // flash-loan one-shot yet (add when single-pass UX matters).
        pool.withdraw(asset(), repayAmount, address(this));
        uint256 repaid = pool.repay(asset(), repayAmount, VARIABLE_RATE, address(this));
        emit Deleveraged(repaid, repayAmount);
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

    /// @return current loan-to-value of the vault's Aave position, in bps.
    function currentLtvBps() external view returns (uint256) {
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
