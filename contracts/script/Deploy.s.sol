// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {LeveragedSelfRepayingVault} from "../src/LeveragedSelfRepayingVault.sol";
import {IPool} from "../src/interfaces/IAaveV3.sol";

/// @notice Deploy the v1 vault for one asset on a network with Aave V3.
/// Required env: PRIVATE_KEY, AAVE_POOL, ASSET. Optional: VAULT_NAME, VAULT_SYMBOL, VAULT_OWNER.
/// For production set VAULT_OWNER to a Safe multisig / timelock so owner-gated actions
/// (leverage, setStrategy, pause, emergencyUnwind) aren't controlled by a single EOA.
/// Example (Base mainnet):
///   forge script script/Deploy.s.sol --rpc-url $BASE_MAINNET_RPC --broadcast \
///     --private-key $PRIVATE_KEY --verify --etherscan-api-key $BASESCAN_API_KEY
contract Deploy is Script {
    function run() external {
        address pool = vm.envAddress("AAVE_POOL");
        address asset = vm.envAddress("ASSET");
        string memory name = vm.envOr("VAULT_NAME", string("OpenCompound Vault"));
        string memory symbol = vm.envOr("VAULT_SYMBOL", string("ocVAULT"));
        // Default owner = deployer; override with a multisig for production.
        address owner = vm.envOr("VAULT_OWNER", msg.sender);

        vm.startBroadcast();
        LeveragedSelfRepayingVault vault =
            new LeveragedSelfRepayingVault(IERC20(asset), IPool(pool), owner, name, symbol);
        vm.stopBroadcast();

        console.log("v1 vault deployed:", address(vault));
        console.log("owner:", owner);
        console.log("Set NEXT_PUBLIC_VAULT_V1_<chainId> in web/.env.local to this address.");
    }
}
