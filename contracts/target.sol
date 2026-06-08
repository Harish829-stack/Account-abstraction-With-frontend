// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract Target {
    uint8 public number;
    event NumberSet(uint8);

    function setNumber(uint8 _number) external payable {
        // Just a dummy function to receive calls
        number = _number;
        emit NumberSet(_number);
    }


    receive() external payable {}
}