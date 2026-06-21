// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {LeveragedSelfRepayingVault} from "../src/LeveragedSelfRepayingVault.sol";
import {IPool} from "../src/interfaces/IAaveV3.sol";

/// @notice Deploy the vault for one asset on a network with Aave V3.
/// Required env: PRIVATE_KEY, AAVE_POOL, ASSET. Optional: VAULT_NAME, VAULT_SYMBOL.
/// Example (Sepolia):
///   forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC --broadcast \
///     --private-key $PRIVATE_KEY
contract Deploy is Script {
    function run() external {
        address pool = vm.envAddress("AAVE_POOL");
        address asset = vm.envAddress("ASSET");
        string memory name = vm.envOr("VAULT_NAME", string("OpenCompound Vault"));
        string memory symbol = vm.envOr("VAULT_SYMBOL", string("ocVAULT"));

        vm.startBroadcast();
        LeveragedSelfRepayingVault vault =
            new LeveragedSelfRepayingVault(IERC20(asset), IPool(pool), msg.sender, name, symbol);
        vm.stopBroadcast();

        console.log("Vault deployed:", address(vault));
        console.log("Set NEXT_PUBLIC_VAULT_ADDRESS_<chainId> in web/.env.local to this address.");
    }
}
