// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PositionFactory} from "../src/PositionFactory.sol";
import {IPool} from "../src/interfaces/IAaveV3.sol";

/// @notice Deploy the PositionFactory (isolated per-user LeveragePosition clones).
/// Required env: PRIVATE_KEY, AAVE_POOL.
contract DeployFactory is Script {
    function run() external {
        address pool = vm.envAddress("AAVE_POOL");
        vm.startBroadcast();
        PositionFactory factory = new PositionFactory(IPool(pool));
        vm.stopBroadcast();
        console.log("PositionFactory:", address(factory));
        console.log("implementation: ", factory.implementation());
    }
}
