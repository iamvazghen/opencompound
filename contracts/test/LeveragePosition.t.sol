// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {LeveragePosition} from "../src/LeveragePosition.sol";
import {PositionFactory} from "../src/PositionFactory.sol";
import {IPool, IPoolAddressesProvider, IFlashLoanSimpleReceiver, ReserveDataLegacy} from "../src/interfaces/IAaveV3.sol";

contract MockToken is ERC20 {
    constructor(string memory n, string memory s) ERC20(n, s) {}
    function mint(address to, uint256 a) external { _mint(to, a); }
    function burn(address from, uint256 a) external { _burn(from, a); }
}

/// 1:1 Aave mock with a settable liquidation threshold (to exercise the guard).
contract MockPool is IPool {
    MockToken public immutable underlying;
    MockToken public immutable aToken;
    MockToken public immutable debtToken;
    uint256 public liqThreshold = 8000;

    constructor(MockToken u) {
        underlying = u;
        aToken = new MockToken("aTKN", "aTKN");
        debtToken = new MockToken("dTKN", "dTKN");
    }

    function setLiqThreshold(uint256 t) external { liqThreshold = t; }

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
        uint256 hf = d == 0 ? type(uint256).max : (c * liqThreshold * 1e18) / (10_000 * d);
        return (c, d, 0, liqThreshold, liqThreshold, hf);
    }
    function getReserveData(address) external view returns (ReserveDataLegacy memory r) {
        r.aTokenAddress = address(aToken);
        r.variableDebtTokenAddress = address(debtToken);
        r.currentLiquidityRate = 0.02e27; // 2%
        r.currentVariableBorrowRate = 0.035e27; // 3.5% -> break-even 5714 bps
        r.configuration = (uint256(1) << 56);
    }
    function ADDRESSES_PROVIDER() external pure returns (IPoolAddressesProvider) { return IPoolAddressesProvider(address(0)); }
    function flashLoanSimple(address receiver, address asset, uint256 amount, bytes calldata params, uint16) external {
        uint256 premium = (amount * 9) / 10_000;
        MockToken(asset).mint(receiver, amount);
        require(IFlashLoanSimpleReceiver(receiver).executeOperation(asset, amount, premium, receiver, params), "cb");
        MockToken(asset).transferFrom(receiver, address(this), amount + premium);
    }
}

contract LeveragePositionTest is Test {
    MockToken underlying;
    MockPool pool;
    PositionFactory factory;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    LeveragePosition posA;
    LeveragePosition posB;

    function setUp() public {
        underlying = new MockToken("Wrapped ETH", "WETH");
        pool = new MockPool(underlying);
        factory = new PositionFactory(IPool(address(pool)));

        vm.prank(alice);
        posA = LeveragePosition(factory.createPosition(IERC20(address(underlying))));
        vm.prank(bob);
        posB = LeveragePosition(factory.createPosition(IERC20(address(underlying))));

        // Fund and seed each with 1 ETH of collateral.
        _seed(alice, posA, 1 ether);
        _seed(bob, posB, 1 ether);
    }

    function _seed(address who, LeveragePosition pos, uint256 amt) internal {
        underlying.mint(who, 10 ether);
        vm.startPrank(who);
        underlying.approve(address(pos), type(uint256).max);
        pos.deposit(amt);
        vm.stopPrank();
    }

    function test_FactoryIsolatesUsers() public view {
        assertTrue(address(posA) != address(posB), "distinct positions");
        assertEq(posA.owner(), alice);
        assertEq(posB.owner(), bob);
        assertEq(factory.positionOf(alice, address(underlying)), address(posA));
        assertEq(factory.positionsCount(), 2);
    }

    function test_OnenPositionPerUserPerAsset() public {
        vm.prank(alice);
        vm.expectRevert(bytes("position exists"));
        factory.createPosition(IERC20(address(underlying)));
    }

    function test_DepositSupplied() public view {
        assertEq(pool.aToken().balanceOf(address(posA)), 1 ether, "collateral supplied");
        assertEq(posA.equity(), 1 ether, "equity = deposit");
    }

    /// The headline use case: draw tax-free cash to your own wallet, position stays self-repaying.
    function test_DrawLiquiditySendsCashToOwner() public {
        // Self-repaying draw cap = break-even 57.14% of 1 ETH collateral.
        assertApproxEqAbs(posA.drawableSelfRepaying(), 0.5714 ether, 1e14, "self-repaying drawable");
        assertApproxEqAbs(posA.drawableToSafe(), 0.72 ether, 1e14, "safe drawable");

        uint256 balBefore = underlying.balanceOf(alice);
        vm.prank(alice);
        posA.drawLiquidity(0.5 ether); // borrow 0.5 ETH to alice's wallet, no sale

        assertEq(underlying.balanceOf(alice) - balBefore, 0.5 ether, "cash received");
        assertEq(pool.debtToken().balanceOf(address(posA)), 0.5 ether, "debt opened");
        assertEq(posA.currentLtvBps(), 5000, "LTV 50%");
        assertTrue(posA.isSelfRepaying(), "50% < 57% break-even -> self-repaying");
    }

    function test_DrawRevertsAboveSafeLtv() public {
        vm.prank(alice);
        vm.expectRevert(); // 0.8 ETH on 1 ETH = 80% > 72% safe ceiling
        posA.drawLiquidity(0.8 ether);
    }

    function test_LeverageLoopCapIsFive() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LeveragePosition.CyclesTooHigh.selector, 6, 5));
        posA.leverage(5000, 6);
    }

    function test_LeverageRejectsAboveSafeTarget() public {
        vm.prank(alice);
        vm.expectRevert(); // 80% target > 72% safe
        posA.leverage(8000, 4);
    }

    function test_LeverageLoops() public {
        vm.prank(alice);
        uint256 ran = posA.leverage(5000, 5);
        assertGt(ran, 0, "looped");
        assertGt(pool.debtToken().balanceOf(address(posA)), 0, "has debt");
        assertApproxEqAbs(posA.equity(), 1 ether, 2, "equity preserved by leverage");
        assertLe(posA.currentLtvBps(), 5000, "approaches 50% target from below");
    }

    function test_RepayReducesDebt() public {
        vm.startPrank(alice);
        posA.drawLiquidity(0.5 ether);
        posA.repay(0.2 ether);
        vm.stopPrank();
        assertEq(pool.debtToken().balanceOf(address(posA)), 0.3 ether, "debt reduced");
    }

    function test_CloseUnwindsToOwner() public {
        vm.startPrank(alice);
        posA.leverage(5000, 4);
        uint256 balBefore = underlying.balanceOf(alice);
        posA.close();
        vm.stopPrank();
        assertEq(pool.debtToken().balanceOf(address(posA)), 0, "debt cleared");
        assertEq(pool.aToken().balanceOf(address(posA)), 0, "collateral withdrawn");
        assertApproxEqAbs(underlying.balanceOf(alice) - balBefore, 1 ether, 2e15, "owner got ~equity back");
    }

    function test_GuardIsPermissionlessWhenUnsafe() public {
        vm.prank(alice);
        posA.leverage(7000, 5); // ~68% LTV, within the 72% safe ceiling
        pool.setLiqThreshold(7000); // market tightens -> maxSafe = 6300, now below current LTV

        assertGt(posA.currentLtvBps(), posA.maxSafeLtvBps(), "now unsafe");
        vm.prank(address(0xCAFE)); // NOT the owner
        posA.guard();
        assertLe(posA.currentLtvBps(), posA.maxSafeLtvBps(), "guarded back under safe");

        vm.prank(address(0xCAFE));
        vm.expectRevert(); // already safe -> no griefing
        posA.guard();
    }

    function test_OnlyOwnerActions() public {
        vm.startPrank(bob); // bob is not posA's owner
        vm.expectRevert(LeveragePosition.NotOwner.selector);
        posA.deposit(1 ether);
        vm.expectRevert(LeveragePosition.NotOwner.selector);
        posA.drawLiquidity(0.1 ether);
        vm.expectRevert(LeveragePosition.NotOwner.selector);
        posA.leverage(5000, 2);
        vm.expectRevert(LeveragePosition.NotOwner.selector);
        posA.withdraw(0.1 ether);
        vm.stopPrank();
    }

    /// Multi-tenant isolation: alice maxing out her LTV doesn't touch bob's position at all.
    function test_PositionsAreIsolated() public {
        vm.prank(alice);
        posA.drawLiquidity(0.7 ether); // alice goes to 70% LTV

        assertEq(posA.currentLtvBps(), 7000, "alice levered");
        assertEq(posB.currentLtvBps(), 0, "bob untouched");
        assertEq(pool.debtToken().balanceOf(address(posB)), 0, "bob has no debt");
        assertEq(posB.equity(), 1 ether, "bob's equity intact");
    }
}
