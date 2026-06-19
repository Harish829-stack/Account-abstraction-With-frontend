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
    uint256 internal constant MODULE_TYPE_EXECUTOR = 2;
    bytes4 internal constant EXECUTE_SELECTOR = bytes4(keccak256("execute(address,uint256,bytes)"));
    bytes4 internal constant EXECUTE_BATCH_SELECTOR = bytes4(keccak256("executeBatch(address[],uint256[],bytes[])"));
    bytes4 internal constant EXECUTE_7579_SELECTOR = bytes4(keccak256("execute(bytes32,bytes)"));
    bytes4 internal constant EXECUTE_SESSION_SELECTOR = bytes4(keccak256("executeSession(address,address,uint256,bytes)"));
    bytes4 internal constant EXECUTE_SESSION_BATCH_SELECTOR = bytes4(keccak256("executeSessionBatch(address,address[],uint256[],bytes[])"));

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
        uint48 validUntil
    );
    event SessionKeyRevoked(address indexed smartAccount, address indexed sessionKey);

    error InvalidSessionKey();
    error InvalidValidityWindow();
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
            delete sessionKeys[keys[i]][msg.sender];
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

    error MaxUsesExceeded();

    function executeSession(address sessionKey, address target, uint256 value, bytes calldata callData) external {
        address smartAccount = msg.sender;
        SessionKey storage policy = sessionKeys[sessionKey][smartAccount];
        
        if (!policy.enabled) revert SessionKeyNotEnabled();
        if (policy.maxUses > 0 && policy.uses >= policy.maxUses) revert MaxUsesExceeded();
        
        policy.uses += 1;

        bytes memory executionCalldata = abi.encode(
            target,
            value,
            callData
        );
        ModeCode mode = ModeCode.wrap(bytes32(0));
        
        IERC7579Account(smartAccount).executeFromExecutor(mode, executionCalldata);
    }
    
    function executeSessionBatch(address sessionKey, address[] calldata targets, uint256[] calldata values, bytes[] calldata callDatas) external {
        address smartAccount = msg.sender;
        SessionKey storage policy = sessionKeys[sessionKey][smartAccount];
        
        if (!policy.enabled) revert SessionKeyNotEnabled();
        if (policy.maxUses > 0 && policy.uses >= policy.maxUses) revert MaxUsesExceeded();
        
        policy.uses += 1;

        bytes memory executionCalldata = abi.encode(
            smartAccount,
            uint256(0),
            abi.encodeWithSignature("executeBatch(address[],uint256[],bytes[])", targets, values, callDatas)
        );
        ModeCode mode = ModeCode.wrap(bytes32(0));
        
        IERC7579Account(smartAccount).executeFromExecutor(mode, executionCalldata);
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

        // Session keys are now strictly time-bounded to comply with ERC-4337 SSTORE rules

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
        return moduleTypeId == MODULE_TYPE_VALIDATOR || moduleTypeId == MODULE_TYPE_EXECUTOR;
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

    function _isPolicyActive(SessionKey memory policy) internal pure returns (bool) {
        if (!policy.enabled) return false;
        // NOTE: We cannot check block.timestamp during validateUserOp per ERC-4337 rules.
        // The EntryPoint handles timestamp validation via the returned validUntil/validAfter in validationData.
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

    function _decodeExecution(
        bytes calldata callData
    ) internal view returns (bool decoded, address[] memory targets, uint256[] memory values, bytes4[] memory selectors) {
        if (callData.length < 4) return (false, new address[](0), new uint256[](0), new bytes4[](0));

        bytes4 accountSelector = bytes4(callData[0:4]);
        bytes calldata params = callData[4:];

        if (accountSelector == EXECUTE_SELECTOR) {
            bytes memory innerData;
            address target;
            uint256 value;
            (target, value, innerData) = abi.decode(params, (address, uint256, bytes));
            
            if (target != address(this)) return (false, new address[](0), new uint256[](0), new bytes4[](0));
            if (innerData.length < 4) return (false, new address[](0), new uint256[](0), new bytes4[](0));

            bytes4 sessionSelector = bytes4(innerData[0:4]);
            if (sessionSelector == EXECUTE_SESSION_SELECTOR) {
                (, address t, uint256 v, bytes memory cd) = abi.decode(innerData[4:], (address, address, uint256, bytes));
                targets = new address[](1);
                values = new uint256[](1);
                selectors = new bytes4[](1);
                
                targets[0] = t;
                values[0] = v;
                selectors[0] = cd.length >= 4 ? bytes4(cd) : bytes4(0);
                
                return (true, targets, values, selectors);
            } else if (sessionSelector == EXECUTE_SESSION_BATCH_SELECTOR) {
                (, address[] memory ts, uint256[] memory vs, bytes[] memory cds) = abi.decode(innerData[4:], (address, address[], uint256[], bytes[]));
                if (ts.length != vs.length || ts.length != cds.length) return (false, new address[](0), new uint256[](0), new bytes4[](0));
                
                targets = ts;
                values = vs;
                selectors = new bytes4[](ts.length);
                for (uint256 i = 0; i < ts.length; i++) {
                    selectors[i] = cds[i].length >= 4 ? bytes4(cds[i]) : bytes4(0);
                }
                return (true, targets, values, selectors);
            }
        }

        return (false, new address[](0), new uint256[](0), new bytes4[](0));
    }
}
