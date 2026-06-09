// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import "./Interfaces.sol";

abstract contract ModuleManager {
    uint256 internal constant MODULE_TYPE_VALIDATOR = 1;
    uint256 internal constant MODULE_TYPE_EXECUTOR = 2;
    uint256 internal constant MODULE_TYPE_FALLBACK = 3;
    uint256 internal constant MODULE_TYPE_HOOK = 4;

    mapping(address => bool) public validators;
    mapping(address => bool) public executors;
    mapping(bytes4 => address) public fallbacks;
    address[] public activeHooks;

    event ModuleInstalled(uint256 indexed moduleTypeId, address indexed module);
    event ModuleUninstalled(uint256 indexed moduleTypeId, address indexed module);

    error InvalidModule();
    error UnsupportedModuleType(uint256 moduleTypeId);
    error MismatchedModuleType(uint256 moduleTypeId, address module);
    error ModuleAlreadyInstalled(uint256 moduleTypeId, address module);
    error ModuleNotInstalled(uint256 moduleTypeId, address module);
    error InvalidFallbackData();

    function _installModule(uint256 moduleTypeId, address module, bytes calldata initData) internal {
        _validateModule(moduleTypeId, module);

        if (moduleTypeId == MODULE_TYPE_VALIDATOR) {
            if (validators[module]) revert ModuleAlreadyInstalled(moduleTypeId, module);
            validators[module] = true;
        } else if (moduleTypeId == MODULE_TYPE_EXECUTOR) {
            if (executors[module]) revert ModuleAlreadyInstalled(moduleTypeId, module);
            executors[module] = true;
        } else if (moduleTypeId == MODULE_TYPE_FALLBACK) {
            bytes4 selector = _selectorFromData(initData);
            if (fallbacks[selector] != address(0)) revert ModuleAlreadyInstalled(moduleTypeId, module);
            fallbacks[selector] = module;
        } else if (moduleTypeId == MODULE_TYPE_HOOK) {
            if (_isHookInstalled(module)) revert ModuleAlreadyInstalled(moduleTypeId, module);
            activeHooks.push(module);
        } else {
            revert UnsupportedModuleType(moduleTypeId);
        }

        IModule(module).onInstall(initData);
        emit ModuleInstalled(moduleTypeId, module);
    }

    function _uninstallModule(uint256 moduleTypeId, address module, bytes calldata deInitData) internal {
        if (moduleTypeId == MODULE_TYPE_VALIDATOR) {
            if (!validators[module]) revert ModuleNotInstalled(moduleTypeId, module);
            validators[module] = false;
        } else if (moduleTypeId == MODULE_TYPE_EXECUTOR) {
            if (!executors[module]) revert ModuleNotInstalled(moduleTypeId, module);
            executors[module] = false;
        } else if (moduleTypeId == MODULE_TYPE_FALLBACK) {
            bytes4 selector = _selectorFromData(deInitData);
            if (fallbacks[selector] != module) revert ModuleNotInstalled(moduleTypeId, module);
            fallbacks[selector] = address(0);
        } else if (moduleTypeId == MODULE_TYPE_HOOK) {
            if (!_removeHook(module)) revert ModuleNotInstalled(moduleTypeId, module);
        } else {
            revert UnsupportedModuleType(moduleTypeId);
        }

        IModule(module).onUninstall(deInitData);
        emit ModuleUninstalled(moduleTypeId, module);
    }

    function _supportsModule(uint256 moduleTypeId) internal pure returns (bool) {
        return moduleTypeId >= MODULE_TYPE_VALIDATOR && moduleTypeId <= MODULE_TYPE_HOOK;
    }

    function _isModuleInstalled(
        uint256 moduleTypeId,
        address module,
        bytes calldata additionalContext
    ) internal view returns (bool) {
        if (moduleTypeId == MODULE_TYPE_VALIDATOR) return validators[module];
        if (moduleTypeId == MODULE_TYPE_EXECUTOR) return executors[module];
        if (moduleTypeId == MODULE_TYPE_FALLBACK) {
            return additionalContext.length >= 4 && fallbacks[bytes4(additionalContext[0:4])] == module;
        }
        if (moduleTypeId == MODULE_TYPE_HOOK) return _isHookInstalled(module);
        return false;
    }

    function _validateModule(uint256 moduleTypeId, address module) private view {
        if (module == address(0) || module.code.length == 0) revert InvalidModule();
        if (!_supportsModule(moduleTypeId)) revert UnsupportedModuleType(moduleTypeId);
        if (!IModule(module).isModuleType(moduleTypeId)) revert MismatchedModuleType(moduleTypeId, module);
    }

    function _selectorFromData(bytes calldata data) private pure returns (bytes4) {
        if (data.length < 4) revert InvalidFallbackData();
        return bytes4(data[0:4]);
    }

    function _isHookInstalled(address module) private view returns (bool) {
        for (uint256 i = 0; i < activeHooks.length; i++) {
            if (activeHooks[i] == module) return true;
        }
        return false;
    }

    function _removeHook(address module) private returns (bool) {
        for (uint256 i = 0; i < activeHooks.length; i++) {
            if (activeHooks[i] == module) {
                activeHooks[i] = activeHooks[activeHooks.length - 1];
                activeHooks.pop();
                return true;
            }
        }
        return false;
    }
}
