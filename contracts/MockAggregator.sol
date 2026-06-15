// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

contract MockAggregator {
    uint8 public decimals = 8;
    int256 public answer;

    constructor(int256 _initialAnswer) {
        answer = _initialAnswer;
    }

    function latestRoundData() external view returns (
        uint80 roundId,
        int256 _answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        return (1, answer, block.timestamp, block.timestamp, 1);
    }

    function setAnswer(int256 _answer) external {
        answer = _answer;
    }
}
