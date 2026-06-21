// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CarryMath
/// @notice Single source of truth for the self-repaying / net-carry math, asset-agnostic.
///         Works for ETH/ETH, BTC/BTC, USDC/USDC (v1) or wstETH/WETH (v2) — it only takes
///         a supply rate and a borrow rate (Aave APRs in ray, 1e27) plus an LTV in bps.
/// @dev    Rates are Aave APRs (currentLiquidityRate / currentVariableBorrowRate), in ray.
///         APR (not APY) is the right basis for a rate-spread comparison — both sides share
///         the same compounding period, so the ratio is what matters.
library CarryMath {
    uint256 internal constant BPS = 10_000;
    uint256 internal constant RAY = 1e27;

    /// @notice Break-even LTV (bps): the position's net interest is positive (self-repaying)
    ///         while LTV stays below this. break-even = supplyRate / borrowRate.
    /// @dev    For v2 with a yield-bearing collateral, pass supplyRay = Aave supply + external
    ///         (staking) yield, so the break-even reflects the true effective yield.
    function breakEvenLtvBps(uint256 supplyRay, uint256 borrowRay) internal pure returns (uint256) {
        if (borrowRay == 0) return supplyRay == 0 ? 0 : BPS; // no borrow cost → any LTV is fine
        uint256 be = (supplyRay * BPS) / borrowRay;
        return be > BPS ? BPS : be; // cap at 100%
    }

    /// @notice Net interest the EQUITY earns, in ray (signed), at a given LTV:
    ///         (s − b·L) / (1 − L). Positive below break-even, negative above.
    /// @dev    This is what the user's deposit actually yields. It is monotonically DECREASING
    ///         in LTV (each borrowed slice adds the s−b spread), so max yield is at LTV 0 —
    ///         borrowing trades yield for liquidity, it doesn't boost it.
    function netCarryRay(uint256 supplyRay, uint256 borrowRay, uint256 ltvBps) internal pure returns (int256) {
        if (ltvBps >= BPS) return type(int256).min;
        int256 num = int256(supplyRay) - int256((borrowRay * ltvBps) / BPS);
        return (num * int256(BPS)) / int256(BPS - ltvBps);
    }

    /// @notice Highest LTV that still self-repays, minus a relative safety buffer (bufferBps,
    ///         e.g. 1000 = leave 10% headroom below break-even). The "recommended" LTV for a
    ///         user who wants maximum self-repaying liquidity without crossing the line.
    function recommendedLtvBps(uint256 supplyRay, uint256 borrowRay, uint256 bufferBps)
        internal
        pure
        returns (uint256)
    {
        uint256 be = breakEvenLtvBps(supplyRay, borrowRay);
        return (be * (BPS - bufferBps)) / BPS;
    }
}
