// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {LeveragedSelfRepayingVault} from "../../src/LeveragedSelfRepayingVault.sol";
import {IPool} from "../../src/interfaces/IAaveV3.sol";

/// @notice v1 integration tests against REAL Ethereum-mainnet Aave V3 (same-asset, no swap).
///         Validates supply, flash-leverage to target, the live liquidation-threshold guardrail,
///         and proportional redeem-unwind on a real pool. Self-skips without FORK_RPC_URL.
///
///         Run: FORK_RPC_URL=<mainnet RPC> forge test --match-path test/fork/*
contract LeveragedSelfRepayingVaultForkTest is Test {
    address constant AAVE_POOL = 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2;
    address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    LeveragedSelfRepayingVault vault;
    address user = address(0xBEEF);
    bool forked;

    function setUp() public {
        string memory rpc = vm.envOr("FORK_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        uint256 blockNo = vm.envOr("FORK_BLOCK", uint256(0));
        if (blockNo == 0) vm.createSelectFork(rpc);
        else vm.createSelectFork(rpc, blockNo);
        forked = true;
        vault = new LeveragedSelfRepayingVault(
            IERC20(WETH), IPool(AAVE_POOL), address(this), "OpenCompound WETH", "ocWETH"
        );
    }

    modifier onlyFork() {
        if (!forked) {
            vm.skip(true);
            return;
        }
        _;
    }

    function _deposit(uint256 amt) internal {
        deal(WETH, user, amt);
        vm.startPrank(user);
        IERC20(WETH).approve(address(vault), amt);
        vault.deposit(amt, user);
        vm.stopPrank();
    }

    function test_Fork_DepositSupplies() public onlyFork {
        _deposit(5 ether);
        assertApproxEqAbs(vault.totalAssets(), 5 ether, 2, "equity ~= deposit");
        assertGt(vault.aToken().balanceOf(address(vault)), 0, "holds aWETH");
        // The dynamic guardrail reads Aave's live WETH liquidation threshold (non-zero on mainnet).
        assertGt(vault.maxSafeLtvBps(), 0, "live safe LTV");
    }

    function test_Fork_FlashLeverageReachesTarget() public onlyFork {
        _deposit(5 ether);
        vault.leverageFlash();
        assertGt(vault.healthFactor(), 1e18, "healthy");
        assertApproxEqAbs(vault.currentLtvBps(), vault.targetLtvBps(), 100, "near 70% target");
        assertApproxEqAbs(vault.totalAssets(), 5 ether, 8e15, "equity preserved minus flash premium");
    }

    function test_Fork_RedeemUnwinds() public onlyFork {
        _deposit(5 ether);
        vault.leverageFlash();
        uint256 shares = vault.balanceOf(user);
        uint256 before = IERC20(WETH).balanceOf(user);
        vm.prank(user);
        vault.redeem(shares, user, user);
        assertGt(IERC20(WETH).balanceOf(user) - before, 4.9 ether, "recovered ~equity via real unwind");
        assertEq(vault.balanceOf(user), 0, "fully exited");
    }
}
