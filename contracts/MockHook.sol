// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Interfaces.sol";

contract MockHook is IHook {
    bool public revertOnPreCheck;
    
    function setRevertOnPreCheck(bool _revert) external {
        revertOnPreCheck = _revert;
    }

    function preCheck(address, uint256, bytes calldata) external view returns (bytes memory hookData) {
        require(!revertOnPreCheck, "MockHook: Reverting in preCheck");
        return "";
    }

    function postCheck(bytes calldata hookData) external view {
        // success
    }

    function isInitialized(address smartAccount) external pure returns (bool) {
        return true;
    }

    function onInstall(bytes calldata data) external {
    }

    function onUninstall(bytes calldata data) external {
    }

    function isModuleType(uint256 moduleTypeId) external pure returns (bool) {
        return moduleTypeId == 4;
    }
}
