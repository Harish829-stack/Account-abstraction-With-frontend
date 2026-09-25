// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/access/Ownable.sol";

contract CustomPriceFeed is Ownable {
    int256 private answer;
    uint8 private constant DECIMALS = 8;
    
    event PriceUpdated(int256 newPrice);

    constructor(int256 _initialPrice) Ownable(msg.sender) {
        answer = _initialPrice;
    }

    function setPrice(int256 _newPrice) external onlyOwner {
        answer = _newPrice;
        emit PriceUpdated(_newPrice);
    }

    // Mock Chainlink AggregatorV3Interface method
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 _answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (0, answer, 0, block.timestamp, 0);
    }

    function decimals() external pure returns (uint8) {
        return DECIMALS;
    }
}
