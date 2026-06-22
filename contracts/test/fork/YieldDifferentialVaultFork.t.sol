// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {YieldDifferentialVault} from "../../src/YieldDifferentialVault.sol";
import {IPool} from "../../src/interfaces/IAaveV3.sol";
import {ISwapRouter} from "../../src/interfaces/ISwapRouter.sol";

/// @notice v2 integration tests against REAL Ethereum-mainnet Aave V3 + Uniswap V3.
///         The mock suite never proves the swap / e-mode / oracle paths on real liquidity — this
///         does. It is the gate before any mainnet deploy of YieldDifferentialVault.
///
///         Run:  FORK_RPC_URL=<mainnet archive/full RPC> forge test --match-path test/fork/*
///         Optional FORK_BLOCK=<n> pins a block for determinism (needs an archive node).
///         With no FORK_RPC_URL set, every test self-skips so the normal `forge test` stays green.
contract YieldDifferentialVaultForkTest is Test {
    // Ethereum mainnet.
    address constant AAVE_POOL = 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2;
    address constant WSTETH = 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0;
    address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    // Classic Uniswap V3 SwapRouter (the one whose exactInputSingle struct carries `deadline`).
    address constant UNISWAP_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    uint24 constant POOL_FEE = 100; // wstETH/WETH 0.01% pool
    uint8 constant EMODE_ETH = 1; // Aave ETH-correlated e-mode category

    YieldDifferentialVault vault;
    address user = address(0xBEEF);
    bool forked;

    function setUp() public {
        string memory rpc = vm.envOr("FORK_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return; // not forked → tests self-skip
        uint256 blockNo = vm.envOr("FORK_BLOCK", uint256(0));
        if (blockNo == 0) vm.createSelectFork(rpc);
        else vm.createSelectFork(rpc, blockNo);
        forked = true;

        vault = new YieldDifferentialVault(
            IERC20(WSTETH),
            IERC20(WETH),
            IPool(AAVE_POOL),
            ISwapRouter(UNISWAP_ROUTER),
            POOL_FEE,
            EMODE_ETH,
            address(this),
            "OC wstETH/WETH",
            "ocLEV"
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
        deal(WSTETH, user, amt);
        vm.startPrank(user);
        IERC20(WSTETH).approve(address(vault), amt);
        vault.deposit(amt, user);
        vm.stopPrank();
    }

    /// Deposit really supplies wstETH to Aave and mints awstETH to the vault.
    function test_Fork_DepositSuppliesToAave() public onlyFork {
        _deposit(5 ether);
        assertApproxEqRel(vault.totalAssets(), 5 ether, 0.002e18, "equity ~= deposit");
        assertGt(vault.aCollateral().balanceOf(address(vault)), 0, "holds awstETH");
    }

    /// Flash leverage borrows WETH, swaps WETH->wstETH on the real Uniswap pool, re-supplies, and
    /// lands near the target LTV with a healthy factor — the path the mocks can't validate.
    function test_Fork_LeverageFlashSwapsAndLevers() public onlyFork {
        _deposit(5 ether);
        vault.leverageFlash();

        assertGt(vault.healthFactor(), 1e18, "healthy after real leverage");
        (uint256 c, uint256 d,,,,) = IPool(AAVE_POOL).getUserAccountData(address(vault));
        assertGt(d, 0, "has WETH debt");
        uint256 ltv = (d * 10_000) / c;
        assertApproxEqAbs(ltv, vault.targetLtvBps(), 300, "near target after real swap + premium");
    }

    /// Full redeem unwinds the leveraged position via a real wstETH->WETH swap and returns the
    /// user's equity (minus flash premium + swap fee/slippage). Proves the v2 exit path on-chain.
    function test_Fork_RedeemUnwindsWithRealSwap() public onlyFork {
        _deposit(5 ether);
        vault.leverageFlash();

        uint256 shares = vault.balanceOf(user);
        uint256 before = IERC20(WSTETH).balanceOf(user);
        vm.prank(user);
        vault.redeem(shares, user, user);

        uint256 received = IERC20(WSTETH).balanceOf(user) - before;
        assertGt(received, 4.8 ether, "recovered most of 5 wstETH equity via real unwind");
        assertEq(vault.balanceOf(user), 0, "fully exited");
    }
}
