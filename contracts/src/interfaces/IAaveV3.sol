// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ponytail: hand-rolled minimal Aave V3 surface instead of pulling aave-v3-origin
// (it's ~200 files for the 6 functions we touch). Upgrade to the full package only
// if we start needing structs beyond these.

/// @notice Aave V3 Pool — the single entry point for supply/borrow/repay/withdraw.
interface IPool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;

    function withdraw(address asset, uint256 amount, address to) external returns (uint256);

    /// @param interestRateMode 2 = variable (only mode Aave V3 supports for most reserves)
    function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)
        external;

    function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf)
        external
        returns (uint256);

    /// @notice e-mode lets correlated assets (e.g. ETH/wstETH) share a high LTV category.
    function setUserEMode(uint8 categoryId) external;

    /// @dev Returns (totalCollateralBase, totalDebtBase, availableBorrowsBase,
    ///      currentLiquidationThreshold, ltv, healthFactor). Base-currency values are
    ///      8-decimal; healthFactor is 1e18-scaled.
    function getUserAccountData(address user)
        external
        view
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        );

    function getReserveData(address asset) external view returns (ReserveDataLegacy memory);

    function ADDRESSES_PROVIDER() external view returns (IPoolAddressesProvider);

    /// @notice Single-asset flash loan. Calls `receiver.executeOperation(...)`, then pulls
    ///         `amount + premium` back from the receiver.
    function flashLoanSimple(address receiver, address asset, uint256 amount, bytes calldata params, uint16 referralCode)
        external;
}

/// @notice Implemented by a flash-loan receiver (here, the vault itself).
interface IFlashLoanSimpleReceiver {
    function executeOperation(address asset, uint256 amount, uint256 premium, address initiator, bytes calldata params)
        external
        returns (bool);
}

interface IPoolAddressesProvider {
    function getPriceOracle() external view returns (address);
}

/// @notice Aave price oracle — asset prices in the protocol base currency (USD, 8 decimals).
interface IPriceOracleGetter {
    function getAssetPrice(address asset) external view returns (uint256);
}

/// @dev Trimmed to the two token addresses we need from Aave's reserve struct.
struct ReserveDataLegacy {
    uint256 configuration;
    uint128 liquidityIndex;
    uint128 currentLiquidityRate;
    uint128 variableBorrowIndex;
    uint128 currentVariableBorrowRate;
    uint128 currentStableBorrowRate;
    uint40 lastUpdateTimestamp;
    uint16 id;
    address aTokenAddress;
    address stableDebtTokenAddress;
    address variableDebtTokenAddress;
    address interestRateStrategyAddress;
    uint128 accruedToTreasury;
    uint128 unbacked;
    uint128 isolationModeTotalDebt;
}
