// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import "./Interfaces.sol";

contract SessionKeyValidator is IValidator {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    bytes4 internal constant ERC1271_INVALID_VALUE = 0xffffffff;
    uint256 internal constant MODULE_TYPE_VALIDATOR = 1;
    bytes4 internal constant EXECUTE_SELECTOR = bytes4(keccak256("execute(address,uint256,bytes)"));
    bytes4 internal constant EXECUTE_BATCH_SELECTOR = bytes4(keccak256("executeBatch(address[],uint256[],bytes[])"));
    bytes4 internal constant EXECUTE_7579_SELECTOR = bytes4(keccak256("execute(bytes32,bytes)"));

    struct SessionKeyData {
        address sessionKey;
        address target;
        bytes4 selector;
        uint256 maxValue;
        uint48 validAfter;
        uint48 validUntil;
        uint48 remainingUses;
    }

    struct SessionKey {
        address target;
        bytes4 selector;
        uint256 maxValue;
        uint48 validAfter;
        uint48 validUntil;
        uint48 remainingUses;
        bool enabled;
    }

    // ERC-4337 Associated Storage Rule: 
    // The Smart Account (sender) MUST be the innermost mapping key (the second address)
    // so that the final storage slot calculation is keccak256(sender . Y).
    // mapping(sessionKey => mapping(smartAccount => SessionKey))
    mapping(address => mapping(address => SessionKey)) public sessionKeys;

    event SessionKeyAdded(
        address indexed smartAccount,
        address indexed sessionKey,
        address indexed target,
        bytes4 selector,
        uint256 maxValue,
        uint48 validAfter,
        uint48 validUntil,
        uint48 remainingUses
    );
    event SessionKeyRevoked(address indexed smartAccount, address indexed sessionKey);

    error InvalidSessionKey();
    error InvalidValidityWindow();
    error InvalidUseLimit();
    error SessionKeyNotEnabled();

    function onInstall(bytes calldata data) external override {
        if (data.length == 0) return;

        SessionKeyData[] memory keys = abi.decode(data, (SessionKeyData[]));
        for (uint256 i = 0; i < keys.length; i++) {
            _addSessionKey(msg.sender, keys[i]);
        }
    }

    function onUninstall(bytes calldata data) external override {
        address[] memory keys = abi.decode(data, (address[]));
        for (uint256 i = 0; i < keys.length; i++) {
            delete sessionKeys[msg.sender][keys[i]];
            emit SessionKeyRevoked(msg.sender, keys[i]);
        }
    }

    function addSessionKey(SessionKeyData calldata keyData) external {
        _addSessionKey(msg.sender, keyData);
    }

    function revokeSessionKey(address sessionKey) external {
        if (!sessionKeys[sessionKey][msg.sender].enabled) revert SessionKeyNotEnabled();

        delete sessionKeys[sessionKey][msg.sender];
        emit SessionKeyRevoked(msg.sender, sessionKey);
    }

    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash
    ) external override returns (uint256) {
        if (userOp.sender != msg.sender || userOp.signature.length != 105) {
            return 1;
        }

        address sessionKey = address(bytes20(userOp.signature[20:40]));
        SessionKey storage policyRef = sessionKeys[sessionKey][userOp.sender];
        SessionKey memory policy = policyRef;

        if (!_isPolicyActive(policy)) {
            return 1;
        }

        bytes calldata signature = userOp.signature[40:105];
        address recovered = userOpHash.toEthSignedMessageHash().recover(signature);
        if (recovered != sessionKey) {
            return 1;
        }

        (bool decoded, address[] memory targets, uint256[] memory values, bytes4[] memory selectors) = _decodeExecution(userOp.callData);
        if (!decoded) {
            return 1;
        }

        for (uint256 i = 0; i < targets.length; i++) {
            if (!_isCallAllowed(policy, targets[i], values[i], selectors[i])) {
                return 1;
            }
        }

        // Removed remainingUses -= 1 to comply with ERC-4337 SSTORE rules
        // (Validators cannot write to their own storage during validation)

        uint256 validationData = 0;
        validationData |= uint256(policy.validUntil) << 160;
        validationData |= uint256(policy.validAfter) << (160 + 48);
        return validationData;
    }

    function isValidSignatureWithSender(
        address sender,
        bytes32 hash,
        bytes calldata signature
    ) external view override returns (bytes4) {
        if (signature.length != 65) return ERC1271_INVALID_VALUE;
        address recovered = hash.recover(signature);
        if (sessionKeys[recovered][sender].enabled) {
            return bytes4(0x1626ba7e); // ERC1271_MAGIC_VALUE
        }
        return ERC1271_INVALID_VALUE;
    }

    function isModuleType(uint256 moduleTypeId) external pure override returns (bool) {
        return moduleTypeId == MODULE_TYPE_VALIDATOR;
    }

    function isInitialized(address /*smartAccount*/) external pure override returns (bool) {
        return true;
    }

    function _addSessionKey(address smartAccount, SessionKeyData memory keyData) internal {
        if (keyData.sessionKey == address(0) || keyData.sessionKey == smartAccount) {
            revert InvalidSessionKey();
        }
        if (keyData.validUntil != 0 && keyData.validAfter > keyData.validUntil) {
            revert InvalidValidityWindow();
        }
        if (keyData.remainingUses == 0) {
            revert InvalidUseLimit();
        }

        sessionKeys[keyData.sessionKey][smartAccount] = SessionKey({
            target: keyData.target,
            selector: keyData.selector,
            maxValue: keyData.maxValue,
            validAfter: keyData.validAfter,
            validUntil: keyData.validUntil,
            remainingUses: keyData.remainingUses,
            enabled: true
        });

        emit SessionKeyAdded(
            smartAccount,
            keyData.sessionKey,
            keyData.target,
            keyData.selector,
            keyData.maxValue,
            keyData.validAfter,
            keyData.validUntil,
            keyData.remainingUses
        );
    }

    function _isPolicyActive(SessionKey memory policy) internal pure returns (bool) {
        if (!policy.enabled) return false;
        // NOTE: We cannot check block.timestamp during validateUserOp per ERC-4337 rules.
        // The EntryPoint handles timestamp validation via the returned validUntil/validAfter in validationData.
        return policy.remainingUses > 0;
    }

    function _isCallAllowed(
        SessionKey memory policy,
        address target,
        uint256 value,
        bytes4 selector
    ) internal pure returns (bool) {
        if (policy.target != address(0) && policy.target != target) return false;
        if (policy.selector != bytes4(0) && policy.selector != selector) return false;
        if (value > policy.maxValue) return false;
        return true;
    }

    function _decodeExecution(
        bytes calldata callData
    ) internal pure returns (bool decoded, address[] memory targets, uint256[] memory values, bytes4[] memory selectors) {
        if (callData.length < 4) return (false, new address[](0), new uint256[](0), new bytes4[](0));

        bytes4 accountSelector = bytes4(callData[0:4]);
        bytes calldata params = callData[4:];

        if (accountSelector == EXECUTE_SELECTOR) {
            bytes memory innerData;
            address target;
            uint256 value;
            (target, value, innerData) = abi.decode(params, (address, uint256, bytes));
            
            targets = new address[](1);
            values = new uint256[](1);
            selectors = new bytes4[](1);
            
            targets[0] = target;
            values[0] = value;
            selectors[0] = innerData.length >= 4 ? bytes4(innerData) : bytes4(0);
            
            return (true, targets, values, selectors);
        }

        if (accountSelector == EXECUTE_7579_SELECTOR) {
            bytes memory executionCalldata;
            (, executionCalldata) = abi.decode(params, (ModeCode, bytes));
            bytes memory innerData;
            address target;
            uint256 value;
            (target, value, innerData) = abi.decode(executionCalldata, (address, uint256, bytes));
            
            targets = new address[](1);
            values = new uint256[](1);
            selectors = new bytes4[](1);
            
            targets[0] = target;
            values[0] = value;
            selectors[0] = innerData.length >= 4 ? bytes4(innerData) : bytes4(0);
            
            return (true, targets, values, selectors);
        }

        if (accountSelector == EXECUTE_BATCH_SELECTOR) {
            bytes[] memory innerDataArray;
            (targets, values, innerDataArray) = abi.decode(params, (address[], uint256[], bytes[]));
            if (targets.length != values.length || targets.length != innerDataArray.length) {
                return (false, new address[](0), new uint256[](0), new bytes4[](0));
            }
            selectors = new bytes4[](targets.length);
            for (uint256 i = 0; i < targets.length; i++) {
                selectors[i] = innerDataArray[i].length >= 4 ? bytes4(innerDataArray[i]) : bytes4(0);
            }
            return (true, targets, values, selectors);
        }

        return (false, new address[](0), new uint256[](0), new bytes4[](0));
    }
}
