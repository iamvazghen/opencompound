// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {YieldDifferentialVault} from "../src/YieldDifferentialVault.sol";
import {
    IPool,
    IPoolAddressesProvider,
    IPriceOracleGetter,
    IFlashLoanSimpleReceiver,
    ReserveDataLegacy
} from "../src/interfaces/IAaveV3.sol";
import {ISwapRouter} from "../src/interfaces/ISwapRouter.sol";

contract MockToken is ERC20 {
    constructor(string memory n, string memory s) ERC20(n, s) {}
    function mint(address to, uint256 a) external { _mint(to, a); }
    function burn(address from, uint256 a) external { _burn(from, a); }
}

contract MockOracle is IPriceOracleGetter {
    mapping(address => uint256) public price; // base currency, 8 decimals
    function set(address a, uint256 p) external { price[a] = p; }
    function getAssetPrice(address a) external view returns (uint256) { return price[a]; }
}

contract MockProvider is IPoolAddressesProvider {
    address public oracle;
    constructor(address o) { oracle = o; }
    function getPriceOracle() external view returns (address) { return oracle; }
}

/// @dev Two-asset Aave mock: 1:1 aToken/debtToken, base-currency account data from the oracle.
contract MockPool is IPool {
    MockOracle public oracle;
    MockProvider public provider;
    mapping(address => MockToken) public aTok;
    mapping(address => MockToken) public dTok;

    constructor(MockOracle o) { oracle = o; provider = new MockProvider(address(o)); }

    function register(address asset) external {
        aTok[asset] = new MockToken("a", "a");
        dTok[asset] = new MockToken("d", "d");
    }

    function supply(address asset, uint256 amt, address onBehalf, uint16) external {
        MockToken(asset).transferFrom(msg.sender, address(this), amt);
        aTok[asset].mint(onBehalf, amt);
    }
    function withdraw(address asset, uint256 amt, address to) external returns (uint256) {
        aTok[asset].burn(msg.sender, amt);
        MockToken(asset).mint(to, amt); // pool always has liquidity in the mock
        return amt;
    }
    function borrow(address asset, uint256 amt, uint256, uint16, address onBehalf) external {
        dTok[asset].mint(onBehalf, amt);
        MockToken(asset).mint(msg.sender, amt);
    }
    function repay(address asset, uint256 amt, uint256, address onBehalf) external returns (uint256) {
        MockToken(asset).transferFrom(msg.sender, address(this), amt);
        dTok[asset].burn(onBehalf, amt);
        return amt;
    }
    function setUserEMode(uint8) external {}

    // Aggregate across the two assets we care about in the test (set via testAssets).
    address[] public testAssets;
    function track(address a) external { testAssets.push(a); }

    function getUserAccountData(address user)
        external view returns (uint256, uint256, uint256, uint256, uint256, uint256)
    {
        uint256 collBase;
        uint256 debtBase;
        for (uint256 i; i < testAssets.length; i++) {
            address a = testAssets[i];
            collBase += (aTok[a].balanceOf(user) * oracle.price(a)) / 1e18;
            debtBase += (dTok[a].balanceOf(user) * oracle.price(a)) / 1e18;
        }
        uint256 hf = debtBase == 0 ? type(uint256).max : (collBase * 9500 * 1e18) / (10_000 * debtBase);
        return (collBase, debtBase, 0, 9500, 9300, hf);
    }
    function getReserveData(address asset) external view returns (ReserveDataLegacy memory r) {
        r.aTokenAddress = address(aTok[asset]);
        r.variableDebtTokenAddress = address(dTok[asset]);
        r.currentLiquidityRate = 0.03e27;
        r.currentVariableBorrowRate = 0.025e27;
    }
    function ADDRESSES_PROVIDER() external view returns (IPoolAddressesProvider) { return provider; }

    // Flash loan: mint `amount` to receiver, call back, then pull amount+premium (9bps).
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

/// @dev Swaps at the oracle mid price (no real slippage), enforcing amountOutMinimum.
contract MockRouter is ISwapRouter {
    MockOracle public oracle;
    constructor(MockOracle o) { oracle = o; }
    function exactInputSingle(ExactInputSingleParams calldata p) external payable returns (uint256 out) {
        MockToken(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        out = (p.amountIn * oracle.price(p.tokenIn)) / oracle.price(p.tokenOut);
        require(out >= p.amountOutMinimum, "slippage");
        MockToken(p.tokenOut).mint(p.recipient, out);
    }
}

contract YieldDifferentialVaultTest is Test {
    MockToken wsteth;
    MockToken weth;
    MockOracle oracle;
    MockPool poolMock;
    MockRouter router;
    YieldDifferentialVault vault;
    address user = address(0xBEEF);

    function setUp() public {
        wsteth = new MockToken("Wrapped stETH", "wstETH");
        weth = new MockToken("Wrapped ETH", "WETH");
        oracle = new MockOracle();
        oracle.set(address(wsteth), 3300e8); // wstETH worth more than ETH (staking accrual)
        oracle.set(address(weth), 3000e8);
        poolMock = new MockPool(oracle);
        poolMock.register(address(wsteth));
        poolMock.register(address(weth));
        poolMock.track(address(wsteth));
        poolMock.track(address(weth));
        router = new MockRouter(oracle);
        vault = new YieldDifferentialVault(
            IERC20(address(wsteth)), IERC20(address(weth)), IPool(address(poolMock)),
            ISwapRouter(address(router)), 100, 1, address(this), "OC wstETH/WETH", "ocLEV"
        );
    }

    function _deposit(uint256 amt) internal {
        wsteth.mint(user, amt);
        vm.startPrank(user);
        wsteth.approve(address(vault), amt);
        vault.deposit(amt, user);
        vm.stopPrank();
    }

    function test_DepositSupplies() public {
        _deposit(1 ether);
        assertEq(poolMock.aTok(address(wsteth)).balanceOf(address(vault)), 1 ether);
        assertApproxEqAbs(vault.totalAssets(), 1 ether, 2);
    }

    function test_LeverageBuildsHealthyPosition() public {
        _deposit(1 ether);
        uint256 cycles = vault.leverage();
        assertGt(cycles, 0, "looped");
        assertGt(poolMock.dTok(address(weth)).balanceOf(address(vault)), 0, "has WETH debt");
        assertGt(poolMock.aTok(address(wsteth)).balanceOf(address(vault)), 1 ether, "grew collateral");
        // Equity is preserved by leverage (collateral grows, debt offsets it).
        assertApproxEqRel(vault.totalAssets(), 1 ether, 0.01e18);
        // Health factor stays well above 1.0.
        assertGt(vault.healthFactor(), 1e18);
    }

    /// Self-repaying is PASSIVE: as wstETH appreciates, the WETH debt cheapens in collateral
    /// terms, so equity (totalAssets / share value) rises on its own — no transaction needed.
    function test_AppreciationCompoundsEquityPassively() public {
        _deposit(1 ether);
        vault.leverage();
        uint256 equityBefore = vault.totalAssets();
        oracle.set(address(wsteth), uint256(3300e8) * 110 / 100); // +10% staking accrual
        assertGt(vault.totalAssets(), equityBefore, "equity compounded with no tx");
    }

    /// Rebalance pulls an over-levered position (debt asset spiked) back down to target LTV.
    function test_RebalanceDeleveragesWhenOverTarget() public {
        _deposit(1 ether);
        vault.leverage();
        oracle.set(address(weth), uint256(3000e8) * 130 / 100); // debt spikes -> LTV over target
        uint256 debtBefore = poolMock.dTok(address(weth)).balanceOf(address(vault));
        vault.rebalance(0);
        assertLt(poolMock.dTok(address(weth)).balanceOf(address(vault)), debtBefore, "deleveraged");
    }

    /// Flash-loan entry should reach ~target LTV (80%) in one tx, beating the cycle-limited loop.
    function test_LeverageFlashReachesTarget() public {
        _deposit(1 ether);
        vault.leverageFlash();
        (uint256 collBase, uint256 debtBase,,,,) = poolMock.getUserAccountData(address(vault));
        uint256 ltvBps = (debtBase * 10_000) / collBase;
        assertApproxEqAbs(ltvBps, 8000, 150, "within ~1.5% of 80% target");
        assertGt(vault.healthFactor(), 1e18, "healthy");
        // Tighter than the iterative loop, which tops out ~70% after 4 cycles.
        assertGt(ltvBps, 7700);
    }

    function test_DeleverageReducesDebt() public {
        _deposit(1 ether);
        vault.leverage();
        uint256 debt = poolMock.dTok(address(weth)).balanceOf(address(vault));
        vault.deleverage(debt / 2);
        assertLt(poolMock.dTok(address(weth)).balanceOf(address(vault)), debt, "debt reduced");
    }
}
