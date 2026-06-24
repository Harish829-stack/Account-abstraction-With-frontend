// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.27;

import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { PackedUserOperation } from "account-abstraction/interfaces/PackedUserOperation.sol";
import { IValidator } from "./interfaces/modules/IValidator.sol";
import { IERC7579Account } from "./interfaces/IERC7579Account.sol";
import { ModeLib, ExecutionMode } from "./lib/ModeLib.sol";
import { ExecLib } from "./lib/ExecLib.sol";
import { MODULE_TYPE_VALIDATOR } from "./types/Constants.sol";

/// @title SocialRecoveryValidator
/// @notice ERC-7579 compliant social recovery validator + executor module for Nexus accounts.
/// @dev Guardians approve a new owner off-chain. Once threshold is met and delay passes,
///      anyone can execute recovery which calls K1Validator.transferOwnership via executeFromExecutor.
contract SocialRecoveryValidator is IValidator {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    bytes4 internal constant ERC1271_INVALID_VALUE = 0xffffffff;

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
    mapping(address => address[]) public accountGuardians;

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

    // ─── IModule ────────────────────────────────────────────────────────────────

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
        
        accountGuardians[smartAccount] = guardians;

        emit SocialRecoveryInstalled(smartAccount, threshold, delay, guardians);
    }

    function onUninstall(bytes calldata /* data */) external override {
        address smartAccount = msg.sender;
        address[] memory keys = accountGuardians[smartAccount];
        
        for (uint256 i = 0; i < keys.length; i++) {
            if (isGuardian[smartAccount][keys[i]]) {
                isGuardian[smartAccount][keys[i]] = false;
            }
        }
        
        delete accountGuardians[smartAccount];
        delete recoveryConfigs[smartAccount];
        
        emit SocialRecoveryUninstalled(smartAccount);
    }

    function isModuleType(uint256 moduleTypeId) external pure override returns (bool) {
        return moduleTypeId == MODULE_TYPE_VALIDATOR;
    }

    /// @notice Required by Nexus — indicates whether this module is initialized for a given account.
    function isInitialized(address smartAccount) external view override returns (bool) {
        return recoveryConfigs[smartAccount].threshold != 0;
    }

    // ─── IValidator ─────────────────────────────────────────────────────────────

    /// @notice Validates a recovery UserOp.
    /// @dev In Nexus, the validator address is in the nonce key — NOT in the signature prefix.
    ///      Signature layout: abi.encode(newOwner) — 32 bytes
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash
    ) external view override returns (uint256) {
        // Signature layout: abi.encode(newOwner) ++ ecdsa_signature (97 bytes total)
        if (userOp.sender != msg.sender || userOp.signature.length != 97) {
            return 1;
        }

        address newOwner = abi.decode(userOp.signature[0:32], (address));
        if (!_canRecover(msg.sender, newOwner)) {
            return 1;
        }

        bytes memory sig = userOp.signature[32:];
        address recovered = userOpHash.toEthSignedMessageHash().recover(sig);
        if (recovered != newOwner) {
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

    // ─── Recovery Actions ────────────────────────────────────────────────────────

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



    // ─── View Helpers ────────────────────────────────────────────────────────────

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

    function clearRecovery(address newOwner) external {
        delete recoveryRequests[msg.sender][newOwner];
    }

    /// @notice Returns the list of registered guardians for an account
    function getGuardians(address account) external view returns (address[] memory) {
        return accountGuardians[account];
    }
}
