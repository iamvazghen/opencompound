// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {YieldDifferentialVault} from "../src/YieldDifferentialVault.sol";
import {IPool} from "../src/interfaces/IAaveV3.sol";
import {ISwapRouter} from "../src/interfaces/ISwapRouter.sol";

/// @notice Deploy the v2 yield-differential vault (e.g. wstETH collateral / WETH debt).
/// Required env: PRIVATE_KEY, AAVE_POOL, COLLATERAL, DEBT_ASSET, SWAP_ROUTER, POOL_FEE, EMODE_CATEGORY.
/// Optional: V2_VAULT_NAME, V2_VAULT_SYMBOL, VAULT_OWNER (set to a Safe multisig for production).
///
/// SWAP_ROUTER must be Uniswap SwapRouter02 (deadline-free):
///   Base    0x2626664c2603336E57B271c5C0b26F421741e481
///   Mainnet 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45
/// EMODE_CATEGORY is the Aave ETH-correlated e-mode id (1 on mainnet — confirm on the target chain).
///
/// Example (Base mainnet):
///   forge script script/DeployV2.s.sol --rpc-url $BASE_MAINNET_RPC --broadcast \
///     --private-key $PRIVATE_KEY --verify --etherscan-api-key $BASESCAN_API_KEY
contract DeployV2 is Script {
    function run() external {
        address pool = vm.envAddress("AAVE_POOL");
        address collateral = vm.envAddress("COLLATERAL");
        address debt = vm.envAddress("DEBT_ASSET");
        address router = vm.envAddress("SWAP_ROUTER");
        uint24 poolFee = uint24(vm.envUint("POOL_FEE"));
        uint8 eMode = uint8(vm.envUint("EMODE_CATEGORY"));
        string memory name = vm.envOr("V2_VAULT_NAME", string("OpenCompound wstETH/WETH"));
        string memory symbol = vm.envOr("V2_VAULT_SYMBOL", string("ocLEV"));
        address owner = vm.envOr("VAULT_OWNER", msg.sender);

        vm.startBroadcast();
        YieldDifferentialVault vault = new YieldDifferentialVault(
            IERC20(collateral), IERC20(debt), IPool(pool), ISwapRouter(router), poolFee, eMode, owner, name, symbol
        );
        vm.stopBroadcast();

        console.log("v2 vault deployed:", address(vault));
        console.log("owner:", owner);
        console.log("Set NEXT_PUBLIC_VAULT_V2_<chainId> in web/.env.local to this address.");
    }
}
