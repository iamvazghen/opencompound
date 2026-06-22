// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ponytail: just the one Uniswap v3 router method we use. No need for the full periphery.
//
// This is the SwapRouter02 signature (NO per-call `deadline`). SwapRouter02 is the canonical
// Uniswap v3 router on Base (0x2626664c2603336E57B271c5C0b26F421741e481) AND Ethereum mainnet
// (0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45). The original SwapRouter (with `deadline`) is not
// deployed on Base, so targeting SwapRouter02 keeps the vault deployable on our actual chain.

interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}
