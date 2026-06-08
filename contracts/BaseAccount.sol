// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import "./Interfaces.sol";

abstract contract BaseAccount is IAccount {

    function entryPoint() public view virtual returns (IEntryPoint);

    modifier onlyEntryPoint() {
        require(msg.sender == address(entryPoint()), "account: not EntryPoint");
        _;
    }

    modifier onlyEntryPointOrOwner() {
        _requireFromEntryPointOrOwner();
        _;
    }

    function _requireFromEntryPointOrOwner() internal view virtual;

}