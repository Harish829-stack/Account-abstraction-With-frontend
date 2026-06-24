// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.27;

import { PackedUserOperation } from "account-abstraction/interfaces/PackedUserOperation.sol";
import "@openzeppelin/contracts/utils/cryptography/WebAuthn.sol";
import "@openzeppelin/contracts/utils/cryptography/P256.sol";
import { IValidator } from "./interfaces/modules/IValidator.sol";
import { MODULE_TYPE_VALIDATOR } from "./types/Constants.sol";

/**
 * @title WebAuthnValidator
 * @notice ERC-7579 Validator module that verifies WebAuthn (Passkey/biometric) signatures.
 *
 * DROP-IN INTEGRATION: Plugs into your existing ModuleManager as a TYPE_VALIDATOR module.
 * No changes needed to Implementation.sol or ModuleManager.sol.
 *
 * ─── Signature Layout (bytes passed to validateUserOp after stripping first 20 bytes) ───
 *
 *  Offset │ Length  │ Field
 *  ───────┼─────────┼──────────────────────────────
 *   0     │ 32      │ r  (P256 signature component)
 *   32    │ 32      │ s  (P256 signature component)
 *   64    │ 32      │ challengeIndex (uint256)
 *   96    │ 32      │ typeIndex      (uint256)
 *   128   │ 32      │ authenticatorData offset (ABI-encoded bytes)
 *   160+  │ dynamic │ authenticatorData + clientDataJSON (ABI-encoded)
 *
 * Encode on frontend with:
 *   encodeAbiParameters([r, s, challengeIndex, typeIndex, authenticatorData, clientDataJSON])
 *
 * ─── Installation ──────────────────────────────────────────────────────────────────────
 *
 * Call installModule(1, webAuthnValidatorAddress, abi.encode(qx, qy))
 * where qx, qy are the P256 public key coordinates from the passkey credential.
 *
 * ─── UserOp Signature Assembly ─────────────────────────────────────────────────────────
 *
 * userOp.signature = abi.encodePacked(
 *     address(webAuthnValidator),   // 20 bytes — validator routing prefix
 *     encodedWebAuthnSignature      // variable — decoded by this contract
 * );
 */
contract WebAuthnValidator is IValidator {

    // ─── Constants ───────────────────────────────────────────────────────────────

    // MODULE_TYPE_VALIDATOR imported from types/Constants.sol
    bytes4  internal constant ERC1271_MAGIC_VALUE   = 0x1626ba7e;
    bytes4  internal constant ERC1271_INVALID       = 0xffffffff;

    // ─── Storage ─────────────────────────────────────────────────────────────────

    /// @dev P256 public key stored per smart account address.
    ///      Set once during onInstall — cannot be changed (immutable signer pattern).
    mapping(address => bytes32) public pubKeyX;
    mapping(address => bytes32) public pubKeyY;

    // ─── Events & Errors ─────────────────────────────────────────────────────────

    event WebAuthnKeyRegistered(address indexed smartAccount, bytes32 qx, bytes32 qy);

    error InvalidPublicKey();
    error AlreadyInitialized();
    error NotInitialized();

    // ─── IModule: Lifecycle ───────────────────────────────────────────────────────

    /**
     * @notice Called by ModuleManager._installModule() during installModule().
     * @param data ABI-encoded (bytes32 qx, bytes32 qy) — the P256 public key
     *             derived from the user's passkey credential during registration.
     */
    function onInstall(bytes calldata data) external override {
        if (pubKeyX[msg.sender] != bytes32(0)) revert AlreadyInitialized();

        (bytes32 qx, bytes32 qy) = abi.decode(data, (bytes32, bytes32));
        if (qx == bytes32(0) || qy == bytes32(0)) revert InvalidPublicKey();

        pubKeyX[msg.sender] = qx;
        pubKeyY[msg.sender] = qy;

        emit WebAuthnKeyRegistered(msg.sender, qx, qy);
    }

    /**
     * @notice Called during uninstallModule(). Clears the stored public key.
     */
    function onUninstall(bytes calldata /*data*/) external override {
        delete pubKeyX[msg.sender];
        delete pubKeyY[msg.sender];
    }

    // ─── IValidator: Signature Validation ────────────────────────────────────────

    /**
     * @notice Validates a UserOperation signed by a WebAuthn passkey.
     * @dev Called by Implementation.validateUserOp() after stripping the first 20
     *      bytes (validator address prefix). The remaining bytes are the WebAuthn
     *      assertion encoded as (r, s, challengeIndex, typeIndex, authData, clientDataJSON).
     *
     * @param userOp  The packed user operation — userOp.signature IS the WebAuthn payload
     * @param userOpHash  The EIP-4337 user operation hash — used as the WebAuthn challenge
     * @dev In Nexus the validator address comes from the nonce key, NOT from the signature.
     *      So the full signature bytes are the raw WebAuthn assertion with no prefix.
     */
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash
    ) external override returns (uint256 validationData) {
        // In Nexus: no validator address prefix in signature
        // The entire signature IS the WebAuthn assertion payload
        bytes calldata webAuthnSig = userOp.signature;

        bool valid = _verifyWebAuthn(userOp.sender, userOpHash, webAuthnSig);
        return valid ? 0 : 1;
    }

    /**
     * @notice ERC-1271 signature validation — for off-chain signature checks (e.g. sign-in).
     */
    function isValidSignatureWithSender(
        address sender,
        bytes32 hash,
        bytes calldata signature
    ) external view override returns (bytes4) {
        bool valid = _verifyWebAuthn(sender, hash, signature);
        return valid ? ERC1271_MAGIC_VALUE : ERC1271_INVALID;
    }

    // ─── IModule: Module Metadata ─────────────────────────────────────────────────

    function isModuleType(uint256 moduleTypeId) external pure override returns (bool) {
        return moduleTypeId == MODULE_TYPE_VALIDATOR;
    }

    function isInitialized(address smartAccount) external view override returns (bool) {
        return pubKeyX[smartAccount] != bytes32(0);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────────

    /**
     * @dev Decodes and verifies a WebAuthn assertion using OZ's WebAuthn.sol library.
     *
     * @param smartAccount  The account whose registered public key is used for verification
     * @param challenge     The bytes32 hash that was signed (userOpHash or ERC-1271 hash)
     * @param sigData       ABI-encoded WebAuthn assertion:
     *                      (bytes32 r, bytes32 s, uint256 challengeIndex,
     *                       uint256 typeIndex, bytes authenticatorData, string clientDataJSON)
     */
    function _verifyWebAuthn(
        address smartAccount,
        bytes32 challenge,
        bytes calldata sigData
    ) internal view returns (bool) {
        bytes32 qx = pubKeyX[smartAccount];
        bytes32 qy = pubKeyY[smartAccount];

        // Guard: account must have a registered passkey
        if (qx == bytes32(0)) return false;

        // Decode the WebAuthn assertion components produced by WebAuthnP256.sign()
        // Layout: (bytes32 r, bytes32 s, uint256 challengeIndex, uint256 typeIndex, bytes authData, string clientDataJSON)
        (
            bytes32 r,
            bytes32 s,
            uint256 challengeIndex,
            uint256 typeIndex,
            bytes memory authenticatorData,
            string memory clientDataJSON
        ) = abi.decode(sigData, (bytes32, bytes32, uint256, uint256, bytes, string));

        // OZ WebAuthn.sol v5.6.x API:
        //   verify(bytes memory challenge, WebAuthnAuth memory auth, bytes32 qx, bytes32 qy)
        // The challenge must be passed as raw bytes — OZ base64url-encodes it internally
        // to compare against the "challenge" field in clientDataJSON.
        return WebAuthn.verify(
            abi.encodePacked(challenge), // bytes — the raw userOpHash (32 bytes)
            WebAuthn.WebAuthnAuth({
                r:                 r,
                s:                 s,
                challengeIndex:    challengeIndex,
                typeIndex:         typeIndex,
                authenticatorData: authenticatorData,
                clientDataJSON:    clientDataJSON
            }),
            qx,
            qy
        );
    }
}
