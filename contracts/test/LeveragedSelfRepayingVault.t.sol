// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {LeveragedSelfRepayingVault} from "../src/LeveragedSelfRepayingVault.sol";
import {IPool, ReserveDataLegacy} from "../src/interfaces/IAaveV3.sol";

/// @dev Mintable test token used for the underlying, aToken and debtToken.
contract MockToken is ERC20 {
    constructor(string memory n, string memory s) ERC20(n, s) {}

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }

    function burn(address from, uint256 amt) external {
        _burn(from, amt);
    }
}

/// @notice Minimal Aave Pool mock: 1:1 aToken on supply, 1:1 variableDebt on borrow.
/// @dev    Models the bookkeeping the vault relies on — enough to exercise the loop
///         math and self-repay sink. Not an interest/oracle simulation.
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
        underlying.mint(msg.sender, amount); // pool hands out borrowed underlying
    }

    function repay(address, uint256 amount, uint256, address onBehalfOf) external returns (uint256) {
        underlying.transferFrom(msg.sender, address(this), amount);
        debtToken.burn(onBehalfOf, amount);
        return amount;
    }

    function setUserEMode(uint8) external {}

    function getUserAccountData(address user)
        external
        view
        returns (uint256, uint256, uint256, uint256, uint256, uint256)
    {
        uint256 c = aToken.balanceOf(user);
        uint256 d = debtToken.balanceOf(user);
        uint256 hf = d == 0 ? type(uint256).max : (c * 1e18) / d; // crude 1:1-collateral HF
        return (c, d, 0, 8000, 8000, hf);
    }

    function getReserveData(address) external view returns (ReserveDataLegacy memory r) {
        r.aTokenAddress = address(aToken);
        r.variableDebtTokenAddress = address(debtToken);
    }
}

contract LeveragedSelfRepayingVaultTest is Test {
    MockToken underlying;
    MockPool poolMock;
    LeveragedSelfRepayingVault vault;
    address user = address(0xA11CE);

    function setUp() public {
        underlying = new MockToken("Wrapped ETH", "WETH");
        poolMock = new MockPool(underlying);
        vault = new LeveragedSelfRepayingVault(
            IERC20(address(underlying)), IPool(address(poolMock)), address(this), "OpenCompound WETH", "ocWETH"
        );
    }

    function _deposit(uint256 amt) internal {
        underlying.mint(user, amt);
        vm.startPrank(user);
        underlying.approve(address(vault), amt);
        vault.deposit(amt, user);
        vm.stopPrank();
    }

    function test_DepositSuppliesToAave() public {
        _deposit(1 ether);
        assertEq(poolMock.aToken().balanceOf(address(vault)), 1 ether, "collateral supplied");
        assertEq(vault.totalAssets(), 1 ether, "net equity == deposit");
        assertEq(vault.balanceOf(user), 1 ether, "shares minted 1:1");
    }

    /// 70% LTV, 4 cycles on 1e18: geometric sum 0.7+0.49+0.343+0.2401 = 1.7731e18 debt.
    function test_LeverageLoopsToTargetExposure() public {
        _deposit(1 ether);
        uint256 cycles = vault.leverage();
        assertEq(cycles, 4, "ran 4 cycles");

        uint256 debt = poolMock.debtToken().balanceOf(address(vault));
        assertEq(debt, 1.7731 ether, "geometric debt sum");
        assertEq(poolMock.aToken().balanceOf(address(vault)), 1 ether + 1.7731 ether, "collateral = deposit + borrowed");
        // Net equity is unchanged by leverage (debt cancels the extra collateral).
        assertEq(vault.totalAssets(), 1 ether, "equity preserved");
        // LTV sits just under the 70% target after the final partial loop.
        assertLt(vault.currentLtvBps(), 7000);
        assertGt(vault.currentLtvBps(), 6300);
    }

    function test_HarvestRepaysFromIdleRewards() public {
        _deposit(1 ether);
        vault.leverage();
        uint256 debtBefore = poolMock.debtToken().balanceOf(address(vault));

        // Simulate a keeper dropping 0.1 WETH of claimed rewards into the vault.
        underlying.mint(address(vault), 0.1 ether);
        uint256 repaid = vault.harvestAndRepay();

        assertEq(repaid, 0.1 ether, "repaid the reward amount");
        assertEq(poolMock.debtToken().balanceOf(address(vault)), debtBefore - 0.1 ether, "debt reduced");
    }

    function test_DeleverageUnwinds() public {
        _deposit(1 ether);
        vault.leverage();
        vault.deleverage(type(uint256).max);
        assertEq(poolMock.debtToken().balanceOf(address(vault)), 0, "debt cleared");
        assertEq(poolMock.aToken().balanceOf(address(vault)), 1 ether, "back to unlevered collateral");
    }

    function test_SetStrategyRejectsAboveCeilings() public {
        vm.expectRevert();
        vault.setStrategy(9_500, 4); // > 90% LTV ceiling
        vm.expectRevert();
        vault.setStrategy(7_000, 11); // > 10 cycle ceiling
    }
}
