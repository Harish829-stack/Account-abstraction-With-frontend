// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";

import "./Interfaces.sol";

interface IRecoveryAccount {
    function changeOwner(address newOwner) external;
}

contract SocialRecoveryValidator is IValidator {
    bytes4 internal constant ERC1271_INVALID_VALUE = 0xffffffff;
    uint256 internal constant MODULE_TYPE_VALIDATOR = 1;

    struct RecoveryConfig {
        uint48 delay;
        uint16 threshold;
        uint16 guardianCount;
    }

    struct RecoveryRequest {
        uint48 executeAfter;
        uint16 approvalCount;
    }

    mapping(address => RecoveryConfig) public recoveryConfigs;
    mapping(address => mapping(address => bool)) public isGuardian;
    mapping(address => mapping(address => RecoveryRequest)) public recoveryRequests;
    mapping(address => mapping(address => mapping(address => bool))) public hasApproved;

    event SocialRecoveryInstalled(
        address indexed smartAccount,
        uint16 threshold,
        uint48 delay,
        address[] guardians
    );
    event SocialRecoveryUninstalled(address indexed smartAccount);
    event RecoveryApproved(
        address indexed smartAccount,
        address indexed guardian,
        address indexed newOwner,
        uint16 approvalCount,
        uint48 executeAfter
    );
    event RecoveryRevoked(
        address indexed smartAccount,
        address indexed guardian,
        address indexed newOwner,
        uint16 approvalCount
    );

    error InvalidGuardian();
    error InvalidNewOwner();
    error InvalidThreshold();
    error DuplicateGuardian();
    error NotGuardian();
    error AlreadyApproved();
    error ApprovalNotFound();

    function onInstall(bytes calldata data) external override {
        (address[] memory guardians, uint16 threshold, uint48 delay) =
            abi.decode(data, (address[], uint16, uint48));

        if (threshold == 0 || threshold > guardians.length) revert InvalidThreshold();
        if (guardians.length > type(uint16).max) revert InvalidThreshold();

        address smartAccount = msg.sender;
        RecoveryConfig storage config = recoveryConfigs[smartAccount];
        config.threshold = threshold;
        config.delay = delay;
        config.guardianCount = uint16(guardians.length);

        for (uint256 i = 0; i < guardians.length; i++) {
            address guardian = guardians[i];
            if (guardian == address(0) || guardian == smartAccount) revert InvalidGuardian();
            if (isGuardian[smartAccount][guardian]) revert DuplicateGuardian();
            isGuardian[smartAccount][guardian] = true;
        }

        emit SocialRecoveryInstalled(smartAccount, threshold, delay, guardians);
    }

    function onUninstall(bytes calldata data) external override {
        address[] memory guardians = abi.decode(data, (address[]));
        address smartAccount = msg.sender;

        for (uint256 i = 0; i < guardians.length; i++) {
            delete isGuardian[smartAccount][guardians[i]];
        }

        delete recoveryConfigs[smartAccount];
        emit SocialRecoveryUninstalled(smartAccount);
    }

    function approveRecovery(address smartAccount, address newOwner) external {
        if (!isGuardian[smartAccount][msg.sender]) revert NotGuardian();
        if (newOwner == address(0) || newOwner == smartAccount) revert InvalidNewOwner();
        if (hasApproved[smartAccount][newOwner][msg.sender]) revert AlreadyApproved();

        RecoveryConfig memory config = recoveryConfigs[smartAccount];
        if (config.threshold == 0) revert NotGuardian();

        RecoveryRequest storage request = recoveryRequests[smartAccount][newOwner];
        request.approvalCount += 1;
        if (request.executeAfter == 0) {
            request.executeAfter = uint48(block.timestamp) + config.delay;
        }

        hasApproved[smartAccount][newOwner][msg.sender] = true;

        emit RecoveryApproved(
            smartAccount,
            msg.sender,
            newOwner,
            request.approvalCount,
            request.executeAfter
        );
    }

    function revokeRecovery(address smartAccount, address newOwner) external {
        if (!hasApproved[smartAccount][newOwner][msg.sender]) revert ApprovalNotFound();

        RecoveryRequest storage request = recoveryRequests[smartAccount][newOwner];
        request.approvalCount -= 1;
        hasApproved[smartAccount][newOwner][msg.sender] = false;

        if (request.approvalCount == 0) {
            request.executeAfter = 0;
        }

        emit RecoveryRevoked(smartAccount, msg.sender, newOwner, request.approvalCount);
    }

    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32
    ) external view override returns (uint256) {
        if (userOp.sender != msg.sender || userOp.signature.length < 52) {
            return 1;
        }

        (address newOwner) = abi.decode(userOp.signature[20:], (address));
        if (!_canRecover(msg.sender, newOwner)) {
            return 1;
        }

        bytes memory expectedCallData =
            abi.encodeCall(IRecoveryAccount.changeOwner, (newOwner));

        if (keccak256(userOp.callData) != keccak256(expectedCallData)) {
            return 1;
        }

        return 0;
    }

    function isValidSignatureWithSender(
        address,
        bytes32,
        bytes calldata
    ) external pure override returns (bytes4) {
        return ERC1271_INVALID_VALUE;
    }

    function isModuleType(uint256 moduleTypeId) external pure override returns (bool) {
        return moduleTypeId == MODULE_TYPE_VALIDATOR;
    }

    function isInitialized(address smartAccount) external view override returns (bool) {
        return recoveryConfigs[smartAccount].threshold != 0;
    }

    function canRecover(address smartAccount, address newOwner) external view returns (bool) {
        return _canRecover(smartAccount, newOwner);
    }

    function _canRecover(address smartAccount, address newOwner) internal view returns (bool) {
        RecoveryConfig memory config = recoveryConfigs[smartAccount];
        RecoveryRequest memory request = recoveryRequests[smartAccount][newOwner];

        return config.threshold != 0
            && request.approvalCount >= config.threshold
            && request.executeAfter != 0
            && block.timestamp >= request.executeAfter;
    }
}
