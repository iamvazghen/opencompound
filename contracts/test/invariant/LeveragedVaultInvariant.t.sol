// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {LeveragedSelfRepayingVault} from "../../src/LeveragedSelfRepayingVault.sol";
import {IPool, IPoolAddressesProvider, IFlashLoanSimpleReceiver, ReserveDataLegacy} from "../../src/interfaces/IAaveV3.sol";

contract MockToken is ERC20 {
    constructor(string memory n, string memory s) ERC20(n, s) {}
    function mint(address to, uint256 a) external { _mint(to, a); }
    function burn(address from, uint256 a) external { _burn(from, a); }
}

/// Minimal 1:1 Aave pool mock (same behavior as the unit suite's), with an active reserve config.
contract MockPool is IPool {
    MockToken public immutable underlying;
    MockToken public immutable aToken;
    MockToken public immutable debtToken;

    constructor(MockToken u) {
        underlying = u;
        aToken = new MockToken("aTKN", "aTKN");
        debtToken = new MockToken("dTKN", "dTKN");
    }

    function supply(address, uint256 amount, address onBehalfOf, uint16) external {
        underlying.transferFrom(msg.sender, address(this), amount);
        aToken.mint(onBehalfOf, amount);
    }
    function withdraw(address, uint256 amount, address to) external returns (uint256) {
        aToken.burn(msg.sender, amount);
        underlying.transfer(to, amount);
        return amount;
    }
    function borrow(address, uint256 amount, uint256, uint16, address onBehalfOf) external {
        debtToken.mint(onBehalfOf, amount);
        underlying.mint(msg.sender, amount);
    }
    function repay(address, uint256 amount, uint256, address onBehalfOf) external returns (uint256) {
        underlying.transferFrom(msg.sender, address(this), amount);
        debtToken.burn(onBehalfOf, amount);
        return amount;
    }
    function setUserEMode(uint8) external {}
    function getUserAccountData(address user) external view returns (uint256, uint256, uint256, uint256, uint256, uint256) {
        uint256 c = aToken.balanceOf(user);
        uint256 d = debtToken.balanceOf(user);
        uint256 hf = d == 0 ? type(uint256).max : (c * 1e18) / d;
        return (c, d, 0, 8000, 8000, hf);
    }
    function getReserveData(address) external view returns (ReserveDataLegacy memory r) {
        r.aTokenAddress = address(aToken);
        r.variableDebtTokenAddress = address(debtToken);
        r.currentLiquidityRate = 0.02e27;
        r.currentVariableBorrowRate = 0.035e27;
        r.configuration = (uint256(1) << 56); // active, uncapped
    }
    function ADDRESSES_PROVIDER() external pure returns (IPoolAddressesProvider) { return IPoolAddressesProvider(address(0)); }
    function flashLoanSimple(address receiver, address asset, uint256 amount, bytes calldata params, uint16) external {
        uint256 premium = (amount * 9) / 10_000;
        MockToken(asset).mint(receiver, amount);
        require(IFlashLoanSimpleReceiver(receiver).executeOperation(asset, amount, premium, receiver, params), "cb");
        MockToken(asset).transferFrom(receiver, address(this), amount + premium);
    }
}

/// Drives the vault with bounded random actions from 3 actors. Owner-gated actions run as the
/// handler itself (the vault's owner); deposits/redeems run as pranked actors. fail_on_revert is
/// off (foundry default) so guard()/leverageFlash() reverting when not applicable is just skipped.
contract Handler is Test {
    LeveragedSelfRepayingVault public vault;
    MockToken public underlying;
    MockPool public pool;
    address[3] public actors = [address(0xA1), address(0xA2), address(0xA3)];

    constructor(LeveragedSelfRepayingVault v, MockToken u, MockPool p) {
        vault = v;
        underlying = u;
        pool = p;
    }

    function deposit(uint256 seed, uint256 amt) external {
        address a = actors[seed % 3];
        amt = bound(amt, 1e6, 1e24);
        underlying.mint(a, amt);
        vm.startPrank(a);
        underlying.approve(address(vault), amt);
        vault.deposit(amt, a);
        vm.stopPrank();
    }

    function redeem(uint256 seed, uint256 pct) external {
        address a = actors[seed % 3];
        uint256 bal = vault.balanceOf(a);
        if (bal == 0) return;
        uint256 shares = (bal * bound(pct, 1, 100)) / 100;
        if (shares == 0) return;
        vm.prank(a);
        vault.redeem(shares, a, a);
    }

    function setStrategy(uint256 ltv, uint256 cycles) external {
        vault.setStrategy(bound(ltv, 0, 9000), bound(cycles, 0, 10));
    }

    function leverage() external { vault.leverage(); }
    function leverageFlash() external { vault.leverageFlash(); }
    function deleverage(uint256 amt) external { vault.deleverage(bound(amt, 0, type(uint128).max)); }
    function deleverageFlash() external { vault.deleverageFlash(); }
    function guard() external { vault.guard(); }
}

contract LeveragedVaultInvariant is Test {
    MockToken underlying;
    MockPool pool;
    LeveragedSelfRepayingVault vault;
    Handler handler;

    function setUp() public {
        underlying = new MockToken("Wrapped ETH", "WETH");
        pool = new MockPool(underlying);
        vault = new LeveragedSelfRepayingVault(
            IERC20(address(underlying)), IPool(address(pool)), address(this), "OC WETH", "ocWETH"
        );
        handler = new Handler(vault, underlying, pool);
        vault.transferOwnership(address(handler)); // handler drives owner-gated actions
        targetContract(address(handler));
    }

    /// The vault is never insolvent: collateral always covers debt (equity ≥ 0).
    function invariant_neverInsolvent() public view {
        assertGe(pool.aToken().balanceOf(address(vault)), pool.debtToken().balanceOf(address(vault)), "bad debt");
    }

    /// Shares are always fully backed: the total redeemable value never exceeds the collateral held.
    function invariant_sharesBacked() public view {
        if (vault.totalSupply() == 0) return;
        assertLe(vault.convertToAssets(vault.totalSupply()), pool.aToken().balanceOf(address(vault)) + 1, "shares over-backed");
    }

    /// LTV stays within the hard ceiling (target ≤ 90% + flash/premium slack).
    function invariant_ltvBounded() public view {
        assertLe(vault.currentLtvBps(), 9300, "ltv escaped ceiling");
    }
}
