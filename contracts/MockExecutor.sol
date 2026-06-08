// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "../contracts/Interfaces.sol";

contract MockExecutor is IModule {
    function onInstall(bytes calldata data) external override {}
    function onUninstall(bytes calldata data) external override {}
    function isModuleType(uint256 moduleTypeId) external pure override returns (bool) {
        return moduleTypeId == 2;
    }
    function isInitialized(address smartAccount) external pure override returns (bool) {
        return true;
    }

    // Custom executor function to trigger an action on the smart account
    function executeAction(address account, address target, uint256 value, bytes calldata data) external {
        // ModeCode is not heavily parsed in our minimal Implementation, so we just pass bytes32(0)
        ModeCode mode = ModeCode.wrap(bytes32(0));
        bytes memory executionCalldata = abi.encode(target, value, data);
        (bool success, bytes memory result) = account.call(abi.encodeWithSelector(IERC7579Account.executeFromExecutor.selector, mode, executionCalldata));
        require(success, string(result));
    }
}
