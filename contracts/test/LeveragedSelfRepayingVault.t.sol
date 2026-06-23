// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {LeveragedSelfRepayingVault} from "../src/LeveragedSelfRepayingVault.sol";
import {IPool, IPoolAddressesProvider, IFlashLoanSimpleReceiver, ReserveDataLegacy} from "../src/interfaces/IAaveV3.sol";

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

    uint256 public reserveConfig = (uint256(1) << 56); // active, not frozen/paused, uncapped
    function setReserveConfig(uint256 c) external { reserveConfig = c; }

    function getReserveData(address) external view returns (ReserveDataLegacy memory r) {
        r.aTokenAddress = address(aToken);
        r.variableDebtTokenAddress = address(debtToken);
        // Realistic single-asset spread: supply 2% < borrow 3.5% (ray = 1e27).
        r.currentLiquidityRate = 0.02e27;
        r.currentVariableBorrowRate = 0.035e27;
        r.configuration = reserveConfig;
    }

    function ADDRESSES_PROVIDER() external pure returns (IPoolAddressesProvider) {
        return IPoolAddressesProvider(address(0)); // unused by the single-asset vault
    }

    function flashLoanSimple(address receiver, address asset, uint256 amount, bytes calldata params, uint16) external {
        uint256 premium = (amount * 9) / 10_000;
        MockToken(asset).mint(receiver, amount);
        require(
            IFlashLoanSimpleReceiver(receiver).executeOperation(asset, amount, premium, receiver, params),
            "callback failed"
        );
        MockToken(asset).transferFrom(receiver, address(this), amount + premium);
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
        // Shares carry a 1e6 virtual offset, so assert redeemable value, not raw count.
        assertApproxEqAbs(vault.convertToAssets(vault.balanceOf(user)), 1 ether, 1, "shares worth the deposit");
    }

    /// First-depositor inflation / donation front-run is defeated by the 1e6 virtual-shares
    /// offset: even after the attacker donates 1000x the victim's deposit, the victim still mints
    /// a fair, non-zero share of the pool (pre-offset this rounded the victim to 0 shares).
    function test_InflationAttackMitigated() public {
        address attacker = address(0xBAD);
        address victim = address(0x71C);

        // Attacker seeds 1 wei, then donates 1000 ETH of aTokens straight to the vault.
        underlying.mint(attacker, 1);
        vm.startPrank(attacker);
        underlying.approve(address(vault), 1);
        vault.deposit(1, attacker);
        vm.stopPrank();
        poolMock.aToken().mint(address(vault), 1000 ether); // donation to inflate share price

        // Victim deposits 1 ETH and must still receive shares worth ~1 ETH back.
        underlying.mint(victim, 1 ether);
        vm.startPrank(victim);
        underlying.approve(address(vault), 1 ether);
        uint256 shares = vault.deposit(1 ether, victim);
        vm.stopPrank();
        assertGt(shares, 0, "victim not rounded to zero shares");
        assertGt(vault.convertToAssets(shares), 0.99 ether, "victim keeps ~all of their value");
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

    /// Corrected economics: the position is self-repaying while LTV < break-even = s/b.
    /// Mock s=2%, b=3.5% → break-even = 0.02/0.035 = 5714 bps (~57%). See FINANCIAL-REVIEW.md.
    function test_BreakEvenLtvDefinesSelfRepayingBand() public {
        assertEq(vault.breakEvenLtvBps(), 5714, "break-even = supply/borrow");

        _deposit(1 ether); // no debt yet → trivially self-repaying
        assertTrue(vault.isSelfRepaying(), "unlevered position earns net yield");

        // Default 70% target loops to ~63–70% LTV, which is ABOVE break-even → bleeds.
        vault.leverage();
        assertGt(vault.currentLtvBps(), vault.breakEvenLtvBps());
        assertFalse(vault.isSelfRepaying(), "70% LTV > 57% break-even bleeds");
    }

    /// Managed below break-even, the same loop IS self-repaying.
    function test_LowLtvLoopIsSelfRepaying() public {
        _deposit(1 ether);
        vault.setStrategy(4000, 4); // 40% target — below the 57% break-even
        vault.leverage();
        assertLt(vault.currentLtvBps(), vault.breakEvenLtvBps());
        assertTrue(vault.isSelfRepaying(), "40% LTV < 57% break-even self-repays");
    }

    /// Flash leverage reaches the EXACT 70% target in one tx (vs the loop's ~64%).
    function test_LeverageFlashReachesExactTarget() public {
        _deposit(1 ether);
        vault.leverageFlash();
        assertApproxEqAbs(vault.currentLtvBps(), 7000, 60, "hits target LTV");
        assertGt(vault.currentLtvBps(), 6900, "tighter than the cycle-limited loop");
        // Equity preserved minus the ~0.09% flash premium on the flashed amount.
        assertApproxEqAbs(vault.totalAssets(), 1 ether, 3e15);
    }

    /// Flash unwind clears ALL debt in a single tx (no multi-pass health-factor gating).
    function test_DeleverageFlashFullyUnwindsInOneTx() public {
        _deposit(1 ether);
        vault.leverage();
        assertGt(poolMock.debtToken().balanceOf(address(vault)), 0, "has debt");
        vault.deleverageFlash();
        assertEq(poolMock.debtToken().balanceOf(address(vault)), 0, "debt fully cleared");
        assertEq(vault.currentLtvBps(), 0, "fully unlevered");
    }

    /// Safe LTV is DYNAMIC: liveLiquidationThreshold (8000 in the mock) × buffer (90%) = 7200.
    function test_MaxSafeLtvIsDynamic() public view {
        assertEq(vault.liquidationThresholdBps(), 8000, "live threshold");
        assertEq(vault.maxSafeLtvBps(), 7200, "threshold x 90pct buffer, not hardcoded");
    }

    /// Permissionless guard fires when LTV exceeds the LIVE safe ceiling, no stored LTV involved.
    function test_GuardIsPermissionlessAboveLiveSafeLtv() public {
        _deposit(1 ether);
        vault.setStrategy(8000, 4);
        vault.leverageFlash(); // LTV ~80% > maxSafe 72%
        assertGt(vault.currentLtvBps(), vault.maxSafeLtvBps());

        vm.prank(address(0xCAFE)); // NOT the owner — permissionless
        vault.guard();
        assertLe(vault.currentLtvBps(), vault.maxSafeLtvBps(), "guarded under the live safe ceiling");

        vm.prank(address(0xCAFE));
        vm.expectRevert(); // already safe → reverts (no griefing)
        vault.guard();
    }

    /// Migrate an existing Aave supply position (aTokens) into the vault — no new funds.
    function test_DepositATokenMigratesExistingPosition() public {
        underlying.mint(user, 1 ether);
        vm.startPrank(user);
        underlying.approve(address(poolMock), 1 ether);
        poolMock.supply(address(underlying), 1 ether, user, 0); // user supplies to Aave directly
        poolMock.aToken().approve(address(vault), 1 ether);
        uint256 shares = vault.depositAToken(1 ether, user); // brings the aTokens into the vault
        vm.stopPrank();
        assertGt(shares, 0, "shares for migrated collateral");
        assertApproxEqAbs(vault.convertToAssets(shares), 1 ether, 2, "migrated collateral worth ~1 ETH");
        assertApproxEqAbs(vault.totalAssets(), 1 ether, 2);
    }

    /// A depositor can fully exit a LEVERAGED vault in one redeem (proportional flash-unwind),
    /// and doing so leaves the remaining depositor's LTV unchanged — risk isn't shifted onto them.
    function test_RedeemUnwindsProportionallyWhenLeveraged() public {
        address other = address(0xB0B);
        _deposit(1 ether); // `user` deposits 1
        underlying.mint(other, 1 ether); // `other` deposits 1
        vm.startPrank(other);
        underlying.approve(address(vault), 1 ether);
        vault.deposit(1 ether, other);
        vm.stopPrank();

        vault.leverageFlash(); // lever the pooled 2 ETH to ~70%
        uint256 ltvBefore = vault.currentLtvBps();
        assertGt(ltvBefore, 6900, "leveraged");

        // `user` redeems ALL shares while leveraged — would revert on a naive pool.withdraw.
        uint256 shares = vault.balanceOf(user);
        vm.prank(user);
        uint256 got = vault.redeem(shares, user, user);

        assertGt(underlying.balanceOf(user), 0, "received funds");
        assertApproxEqAbs(got, 1 ether, 3e15, "~ their 1 ETH equity (minus flash premium)");
        assertEq(vault.balanceOf(user), 0, "fully exited");
        // The remaining depositor's leverage is unchanged (collateral & debt fell proportionally).
        assertApproxEqAbs(vault.currentLtvBps(), ltvBefore, 5, "other's LTV untouched");
        assertApproxEqAbs(vault.totalAssets(), 1 ether, 3e15, "~ 1 ETH equity left for `other`");
    }

    /// maxDeposit honors the Aave supply cap (aave-vault pattern) so deposits revert up-front.
    function test_MaxDepositRespectsAaveSupplyCap() public {
        assertEq(vault.maxDeposit(user), type(uint256).max, "uncapped by default");
        poolMock.setReserveConfig((uint256(1) << 56) | (uint256(100) << 116)); // active, cap 100
        assertEq(vault.maxDeposit(user), 100 ether, "room under the cap");
        _deposit(40 ether);
        assertEq(vault.maxDeposit(user), 60 ether, "cap minus supplied");

        underlying.mint(user, 100 ether);
        vm.startPrank(user);
        underlying.approve(address(vault), 100 ether);
        vm.expectRevert(); // ERC4626ExceededMaxDeposit — clean revert before touching Aave
        vault.deposit(61 ether, user);
        vm.stopPrank();

        poolMock.setReserveConfig(uint256(1) << 57); // frozen
        assertEq(vault.maxDeposit(user), 0, "frozen reserve takes no deposits");
    }

    function test_SetStrategyRejectsAboveCeilings() public {
        vm.expectRevert();
        vault.setStrategy(9_500, 4); // > 90% LTV ceiling
        vm.expectRevert();
        vault.setStrategy(7_000, 6); // > 5 cycle ceiling
    }
}
