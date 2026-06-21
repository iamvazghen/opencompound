// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CarryMath} from "../src/libraries/CarryMath.sol";

/// Asset-agnostic checks of the carry math. The same formulas drive ETH/ETH, BTC/BTC,
/// USDC/USDC (v1) and wstETH/WETH (v2) — only the input rates differ.
contract CarryMathTest is Test {
    function test_BreakEven_isSupplyOverBorrow() public pure {
        assertEq(CarryMath.breakEvenLtvBps(0.02e27, 0.035e27), 5714); // ETH-ish
        assertEq(CarryMath.breakEvenLtvBps(0.02e27, 0.04e27), 5000); // the 2%/4% example → 50%
        assertEq(CarryMath.breakEvenLtvBps(0.05e27, 0.08e27), 6250); // USDC-ish
        assertEq(CarryMath.breakEvenLtvBps(0.01e27, 0.02e27), 5000); // BTC-ish
    }

    function test_BreakEven_edgeCases() public pure {
        assertEq(CarryMath.breakEvenLtvBps(0.02e27, 0), 10000); // no borrow cost → any LTV
        assertEq(CarryMath.breakEvenLtvBps(0.05e27, 0.03e27), 10000); // s>b → capped at 100%
        assertEq(CarryMath.breakEvenLtvBps(0, 0.04e27), 0); // no yield → break-even 0
    }

    function test_NetCarry_signAndValue() public pure {
        // s=2%, b=3.5%: at 50% LTV → (0.02 − 0.0175)/0.5 = 0.005 ray (0.5%)
        assertEq(CarryMath.netCarryRay(0.02e27, 0.035e27, 5000), 0.005e27);
        // at LTV 0 → equals supply rate
        assertEq(CarryMath.netCarryRay(0.02e27, 0.035e27, 0), int256(0.02e27));
        // above break-even (5714) → negative
        assertLt(CarryMath.netCarryRay(0.02e27, 0.035e27, 7000), 0);
        // monotonic decreasing: higher LTV → lower carry
        assertGt(
            CarryMath.netCarryRay(0.02e27, 0.035e27, 2000), CarryMath.netCarryRay(0.02e27, 0.035e27, 4000)
        );
    }

    function test_Recommended_belowBreakEvenByBuffer() public pure {
        // break-even 5000, 10% buffer → 4500
        assertEq(CarryMath.recommendedLtvBps(0.02e27, 0.04e27, 1000), 4500);
        // recommended is always < break-even, so net carry there is positive
        uint256 reco = CarryMath.recommendedLtvBps(0.02e27, 0.035e27, 1000);
        assertLt(reco, CarryMath.breakEvenLtvBps(0.02e27, 0.035e27));
        assertGt(CarryMath.netCarryRay(0.02e27, 0.035e27, reco), 0);
    }

    /// Fuzz over realistic APRs (0.1%–100% in ray) and any LTV: clearly below break-even the
    /// carry is non-negative; clearly above, non-positive. The ±2bps band around break-even is
    /// skipped (integer flooring of s/b makes the exact crossover sub-bps).
    function testFuzz_BreakEvenSeparatesSign(uint256 s, uint256 b, uint256 ltv) public pure {
        s = bound(s, 1e24, 1e27);
        b = bound(b, 1e24, 1e27);
        ltv = bound(ltv, 0, 9000);
        uint256 be = CarryMath.breakEvenLtvBps(s, b);
        int256 carry = CarryMath.netCarryRay(s, b, ltv);
        if (ltv + 2 < be) assertGe(carry, 0);
        else if (ltv > be + 2) assertLe(carry, 0);
    }
}
