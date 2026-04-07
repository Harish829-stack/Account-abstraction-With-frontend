// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

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

    function exactInputSingle(
        ExactInputSingleParams calldata params
    ) external payable returns (uint256);
}

contract SimpleSwap {

    address public constant ROUTER =
        0xE592427A0AEce92De3Edee1F18E0157C05861564;

    function swapETHForToken(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external payable {

        ISwapRouter(ROUTER).exactInputSingle{value: amountIn}(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: 3000,
                recipient: msg.sender,
                amountIn: amountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            })
        );
    }
}     