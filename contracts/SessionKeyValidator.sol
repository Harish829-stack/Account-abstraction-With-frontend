// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.27;

import { PackedUserOperation } from "account-abstraction/interfaces/PackedUserOperation.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { IValidator } from "./interfaces/modules/IValidator.sol";
import { MODULE_TYPE_VALIDATOR } from "./types/Constants.sol";

/// @title SessionKeyValidator
/// @notice ERC-7579 compliant session key validator for Nexus accounts.
/// @dev In Nexus, the validator address is embedded in the nonce key — not in the signature prefix.
///      Signature layout for validateUserOp: [sessionKey(20)] ++ [sig(65)] = 85 bytes total
contract SessionKeyValidator is IValidator {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    bytes4 internal constant ERC1271_INVALID_VALUE = 0xffffffff;
    bytes4 internal constant EXECUTE_7579_SELECTOR = bytes4(keccak256("execute(bytes32,bytes)"));

    struct SessionKeyData {
        address sessionKey;
        address target;
        bytes4 selector;
        uint256 maxValue;
        uint48 validAfter;
        uint48 validUntil;
        uint256 maxUses;
    }

    struct SessionKey {
        address target;
        bytes4 selector;
        uint256 maxValue;
        uint48 validAfter;
        uint48 validUntil;
        bool enabled;
        uint256 maxUses;
        uint256 uses;
    }

    struct Execution {
        address target;
        uint256 value;
        bytes callData;
    }

    // ERC-4337 Associated Storage Rule:
    // mapping(sessionKey => mapping(smartAccount => SessionKey))
    mapping(address => mapping(address => SessionKey)) public sessionKeys;

    // Track number of active session keys per account for isInitialized
    mapping(address => uint256) private _sessionKeyCount;

    // On-chain enumerable list of active session key addresses per account
    // Enables getActiveSessionKeys() without event log scanning
    mapping(address => address[]) private _accountSessionKeys;

    // Index of each session key in _accountSessionKeys for O(1) removal
    mapping(address => mapping(address => uint256)) private _sessionKeyIndex;

    event SessionKeyAdded(
        address indexed smartAccount,
        address indexed sessionKey,
        address indexed target,
        bytes4 selector,
        uint256 maxValue,
        uint48 validAfter,
        uint48 validUntil
    );
    event SessionKeyRevoked(address indexed smartAccount, address indexed sessionKey);

    error InvalidSessionKey();
    error InvalidValidityWindow();
    error SessionKeyNotEnabled();

    // ─── IModule ────────────────────────────────────────────────────────────────

    function onInstall(bytes calldata data) external override {
        if (data.length == 0) return;
        SessionKeyData[] memory keys = abi.decode(data, (SessionKeyData[]));
        for (uint256 i = 0; i < keys.length; i++) {
            _addSessionKey(msg.sender, keys[i]);
        }
    }

    function onUninstall(bytes calldata /*data*/) external override {
        address smartAccount = msg.sender;
        address[] storage keys = _accountSessionKeys[smartAccount];
        for (uint256 i = 0; i < keys.length; i++) {
            address key = keys[i];
            delete sessionKeys[key][smartAccount];
            delete _sessionKeyIndex[smartAccount][key];
            emit SessionKeyRevoked(smartAccount, key);
        }
        delete _accountSessionKeys[smartAccount];
        delete _sessionKeyCount[smartAccount];
    }

    function isModuleType(uint256 moduleTypeId) external pure override returns (bool) {
        return moduleTypeId == MODULE_TYPE_VALIDATOR;
    }

    /// @notice Required by Nexus — indicates whether this module is initialized for a given account.
    function isInitialized(address smartAccount) external view override returns (bool) {
        return _sessionKeyCount[smartAccount] > 0;
    }

    // ─── IValidator ─────────────────────────────────────────────────────────────

    /// @notice Validates a UserOp signed by a session key.
    /// @dev In Nexus, the validator address is in the nonce key — NOT in the signature prefix.
    ///      Signature layout: [sessionKey(20 bytes)] ++ [ecdsa sig(65 bytes)] = 85 bytes
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash
    ) external override returns (uint256) {
        // Expect exactly 85 bytes: 20 (sessionKey) + 65 (sig)
        if (userOp.sender != msg.sender || userOp.signature.length != 85) {
            return 1;
        }

        address sessionKey = address(bytes20(userOp.signature[0:20]));
        SessionKey storage policyRef = sessionKeys[sessionKey][userOp.sender];
        SessionKey memory policy = policyRef;

        if (!_isPolicyActive(policy)) {
            return 1;
        }

        bytes calldata signature = userOp.signature[20:85];
        address recovered = userOpHash.toEthSignedMessageHash().recover(signature);
        if (recovered != sessionKey) {
            return 1;
        }

        // Decode the ERC-7579 execute calldata and check policy
        (bool decoded, address[] memory targets, uint256[] memory values, bytes4[] memory selectors) 
            = _decodeExecution(userOp.callData);
        if (!decoded) {
            return 1;
        }

        for (uint256 i = 0; i < targets.length; i++) {
            if (!_isCallAllowed(policy, targets[i], values[i], selectors[i])) {
                return 1;
            }
        }

        // Pack validAfter and validUntil into the return value for EntryPoint time-range validation
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
            return bytes4(0x1626ba7e);
        }
        return ERC1271_INVALID_VALUE;
    }

    // ─── Session Key Management ──────────────────────────────────────────────────

    function addSessionKey(SessionKeyData calldata keyData) external {
        _addSessionKey(msg.sender, keyData);
    }

    function revokeSessionKey(address sessionKey) external {
        if (!sessionKeys[sessionKey][msg.sender].enabled) revert SessionKeyNotEnabled();
        delete sessionKeys[sessionKey][msg.sender];
        _removeFromList(msg.sender, sessionKey);
        if (_sessionKeyCount[msg.sender] > 0) _sessionKeyCount[msg.sender]--;
        emit SessionKeyRevoked(msg.sender, sessionKey);
    }

    /// @notice Returns all currently active session key addresses for a given smart account.
    /// @dev Reads directly from on-chain storage — no event scanning needed.
    function getActiveSessionKeys(address smartAccount) external view returns (address[] memory) {
        return _accountSessionKeys[smartAccount];
    }

    // ─── Internal ────────────────────────────────────────────────────────────────

    function _addSessionKey(address smartAccount, SessionKeyData memory keyData) internal {
        if (keyData.sessionKey == address(0) || keyData.sessionKey == smartAccount) {
            revert InvalidSessionKey();
        }
        if (keyData.validUntil != 0 && keyData.validAfter > keyData.validUntil) {
            revert InvalidValidityWindow();
        }

        sessionKeys[keyData.sessionKey][smartAccount] = SessionKey({
            target: keyData.target,
            selector: keyData.selector,
            maxValue: keyData.maxValue,
            validAfter: keyData.validAfter,
            validUntil: keyData.validUntil,
            enabled: true,
            maxUses: keyData.maxUses,
            uses: 0
        });

        // Add to the enumerable list (only if not already present)
        if (_sessionKeyIndex[smartAccount][keyData.sessionKey] == 0 &&
            (_accountSessionKeys[smartAccount].length == 0 ||
             _accountSessionKeys[smartAccount][0] != keyData.sessionKey)) {
            _accountSessionKeys[smartAccount].push(keyData.sessionKey);
            // Store 1-based index to distinguish "not in list" (0) from "index 0"
            _sessionKeyIndex[smartAccount][keyData.sessionKey] = _accountSessionKeys[smartAccount].length;
        }

        _sessionKeyCount[smartAccount]++;

        emit SessionKeyAdded(
            smartAccount,
            keyData.sessionKey,
            keyData.target,
            keyData.selector,
            keyData.maxValue,
            keyData.validAfter,
            keyData.validUntil
        );
    }

    /// @dev Removes a session key from _accountSessionKeys using swap-and-pop (O(1)).
    function _removeFromList(address smartAccount, address sessionKey) internal {
        uint256 idx1Based = _sessionKeyIndex[smartAccount][sessionKey];
        if (idx1Based == 0) return; // Not in list

        uint256 idx = idx1Based - 1;
        address[] storage list = _accountSessionKeys[smartAccount];
        uint256 lastIdx = list.length - 1;

        if (idx != lastIdx) {
            address lastKey = list[lastIdx];
            list[idx] = lastKey;
            _sessionKeyIndex[smartAccount][lastKey] = idx1Based; // update moved key index
        }

        list.pop();
        delete _sessionKeyIndex[smartAccount][sessionKey];
    }

    function _isPolicyActive(SessionKey memory policy) internal pure returns (bool) {
        if (!policy.enabled) return false;
        if (policy.maxUses > 0 && policy.uses >= policy.maxUses) return false;
        return true;
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

    /// @dev Decodes ERC-7579 execute(bytes32 mode, bytes calldata executionCalldata) calldata
    ///      and returns the targets, values, and selectors for policy checking.
    function _decodeExecution(
        bytes calldata callData
    ) internal view returns (
        bool decoded,
        address[] memory targets,
        uint256[] memory values,
        bytes4[] memory selectors
    ) {
        if (callData.length < 4) return (false, new address[](0), new uint256[](0), new bytes4[](0));

        bytes4 accountSelector = bytes4(callData[0:4]);
        if (accountSelector != EXECUTE_7579_SELECTOR) {
            return (false, new address[](0), new uint256[](0), new bytes4[](0));
        }

        // Decode: (bytes32 mode, bytes calldata executionCalldata)
        (bytes32 mode, bytes memory execData) = abi.decode(callData[4:], (bytes32, bytes));
        bytes1 callType = bytes1(mode);

        if (callType == 0x00) {
            // Single execution: raw packed address(20) ++ uint256(32) ++ calldata
            if (execData.length < 52) return (false, new address[](0), new uint256[](0), new bytes4[](0));
            address target;
            uint256 value;
            bytes memory cd;
            assembly {
                target := shr(96, mload(add(execData, 32)))
                value := mload(add(execData, 52))
            }
            cd = new bytes(execData.length - 52);
            for (uint256 i = 0; i < cd.length; i++) {
                cd[i] = execData[52 + i];
            }
            targets = new address[](1);
            values = new uint256[](1);
            selectors = new bytes4[](1);
            targets[0] = target;
            values[0] = value;
            selectors[0] = cd.length >= 4 ? bytes4(cd) : bytes4(0);
            return (true, targets, values, selectors);
        } else if (callType == 0x01) {
            // Batch execution: abi.encode(tuple(address,uint256,bytes)[])
            // Nexus encodes batch as: Execution[] = abi.encode(tuple(address target, uint256 value, bytes callData)[])
            (address[] memory bTargets, uint256[] memory bValues, bytes[] memory bCallDatas) =
                _decodeBatch(execData);
            selectors = new bytes4[](bTargets.length);
            for (uint256 i = 0; i < bTargets.length; i++) {
                selectors[i] = bCallDatas[i].length >= 4 ? bytes4(bCallDatas[i]) : bytes4(0);
            }
            return (true, bTargets, bValues, selectors);
        }

        return (false, new address[](0), new uint256[](0), new bytes4[](0));
    }

    function _decodeBatch(bytes memory data) internal view returns (
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory callDatas
    ) {
        // Nexus batch = abi.encode(tuple(address target, uint256 value, bytes callData)[])
        (targets, values, callDatas) = (new address[](0), new uint256[](0), new bytes[](0));
        // Use a simple approach: decode as a dynamic struct array
        // Struct: (address target, uint256 value, bytes callData)
        // abi.decode works here since batch is abi-encoded
        bytes memory wrapped = abi.encode(data); // wrap for decoding
        // Actually decode directly:
        try this._tryDecodeBatch(data) returns (
            address[] memory t,
            uint256[] memory v,
            bytes[] memory c
        ) {
            return (t, v, c);
        } catch {
            return (new address[](0), new uint256[](0), new bytes[](0));
        }
    }

    function _tryDecodeBatch(bytes calldata data) external pure returns (
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory callDatas
    ) {
        Execution[] memory execs = abi.decode(data, (Execution[]));
        targets = new address[](execs.length);
        values = new uint256[](execs.length);
        callDatas = new bytes[](execs.length);
        for (uint256 i = 0; i < execs.length; i++) {
            targets[i] = execs[i].target;
            values[i] = execs[i].value;
            callDatas[i] = execs[i].callData;
        }
    }
}
