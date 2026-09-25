
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

interface IPriceFeed {
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
    function decimals() external view returns (uint8);
}

interface IMockUSDC {
    function mint(address to, uint256 amount) external;
}

contract MockUniswapRouter {
    IPriceFeed public priceFeed;
    IMockUSDC public usdc;
    
    event SwapETHForUSDC(address indexed user, uint256 ethIn, uint256 usdcOut);

    constructor(address _priceFeed, address _usdc) {
        priceFeed = IPriceFeed(_priceFeed);
        usdc = IMockUSDC(_usdc);
    }

    // Swaps exact ETH for USDC
    function swapExactETHForTokens(
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external payable returns (uint[] memory amounts) {
        require(block.timestamp <= deadline, "Transaction expired");
        require(msg.value > 0, "Must send ETH");
        
        // Fetch ETH price in USD
        (, int256 price, , , ) = priceFeed.latestRoundData();
        require(price > 0, "Invalid price");
        
        // price decimals = 8
        // msg.value is in wei (18 decimals)
        // USDC decimals = 6
        // amountOut (USDC) = msg.value * price / 10^(18 + 8 - 6) => msg.value * price / 10^20
        uint256 ethAmount = msg.value;
        uint256 usdcAmountOut = (ethAmount * uint256(price)) / 1e20;
        
        require(usdcAmountOut >= amountOutMin, "Insufficient output amount");

        // Mint USDC to the user
        usdc.mint(to, usdcAmountOut);
        
        emit SwapETHForUSDC(to, ethAmount, usdcAmountOut);

        amounts = new uint[](2);
        amounts[0] = ethAmount;
        amounts[1] = usdcAmountOut;
        return amounts;
    }
    
    // To receive ETH (simulating WETH wrap / native ETH deposit)
    receive() external payable {}
}
