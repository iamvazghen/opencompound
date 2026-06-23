// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IPool} from "./interfaces/IAaveV3.sol";
import {LeveragePosition} from "./LeveragePosition.sol";

/// @title  PositionFactory
/// @notice Deploys an ISOLATED LeveragePosition (EIP-1167 minimal-proxy clone) per user per asset.
///         Each clone is its own Aave V3 account owned solely by that user — true multi-tenant
///         isolation: one user's leverage / liquidation never affects another's. The user manages
///         their own LTV and can draw tax-free liquidity from their own position. NOT AUDITED.
contract PositionFactory {
    IPool public immutable pool;
    address public immutable implementation;

    mapping(address => mapping(address => address)) public positionOf; // user => asset => position
    address[] public allPositions;

    event PositionCreated(address indexed user, address indexed asset, address position);

    constructor(IPool pool_) {
        pool = pool_;
        implementation = address(new LeveragePosition());
    }

    /// @notice Create the caller's isolated position for `asset` (one per user per asset).
    function createPosition(IERC20 asset) external returns (address position) {
        require(positionOf[msg.sender][address(asset)] == address(0), "position exists");
        position = Clones.clone(implementation);
        LeveragePosition(position).initialize(msg.sender, asset, pool);
        positionOf[msg.sender][address(asset)] = position;
        allPositions.push(position);
        emit PositionCreated(msg.sender, address(asset), position);
    }

    function positionsCount() external view returns (uint256) {
        return allPositions.length;
    }
}
