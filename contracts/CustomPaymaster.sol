// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@account-abstraction/contracts/interfaces/IPaymaster.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Paymaster is IPaymaster, Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    IEntryPoint public immutable entryPoint;
    address public verifyingSigner;

    constructor(IEntryPoint _entryPoint, address _verifyingSigner) Ownable(msg.sender) {
        entryPoint = _entryPoint;
        verifyingSigner = _verifyingSigner;
    }

    function validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 /*userOpHash*/,
        uint256 /*maxCost*/
    ) external override returns (bytes memory context, uint256 validationData) {
        require(msg.sender == address(entryPoint), "Paymaster: not EntryPoint");

        // v0.7 paymasterAndData = [paymaster (20 bytes) | paymasterVerificationGasLimit (16 bytes) | paymasterPostOpGasLimit (16 bytes) | validUntil (6 bytes) | validAfter (6 bytes) | signature (dynamic)]
        // Custom data starts at index 52
        uint48 validUntil = uint48(bytes6(userOp.paymasterAndData[52:58]));
        uint48 validAfter = uint48(bytes6(userOp.paymasterAndData[58:64]));
        bytes calldata signature = userOp.paymasterAndData[64:];

        bytes32 hash = getHash(userOp, validUntil, validAfter);
        
        // Use OpenZeppelin's MessageHashUtils for the "Ethereum Signed Message" prefix
        if (verifyingSigner != hash.toEthSignedMessageHash().recover(signature)) {
            // Return 1 in the least significant bit to indicate signature failure
            return ("", _packValidationData(true, validUntil, validAfter));
        }

        return ("", _packValidationData(false, validUntil, validAfter));
    }

    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 actualUserOpFeePerGas
    ) external override {
        // No-op for verifying paymaster
    }

    function getHash(
    PackedUserOperation calldata userOp, 
    uint48 validUntil, 
    uint48 validAfter
) public view returns (bytes32) {
    // We hash the bulk of the UserOp first to clear the stack
    bytes32 userOpHash = keccak256(abi.encode(
        userOp.sender,
        userOp.nonce,
        keccak256(userOp.initCode),
        keccak256(userOp.callData),
        userOp.accountGasLimits,
        userOp.preVerificationGas,
        userOp.gasFees
    ));

    // Then we hash the result with the paymaster-specific fields
    return keccak256(abi.encode(
        userOpHash,
        block.chainid,
        address(this),
        validUntil,
        validAfter
    ));
}

    function _packValidationData(bool sigFailed, uint48 validUntil, uint48 validAfter) internal pure returns (uint256) {
        return (sigFailed ? 1 : 0) | (uint256(validUntil) << 160) | (uint256(validAfter) << (160 + 48));
    }

    // --- Deposit Management ---
    function deposit() public payable {
        entryPoint.depositTo{value: msg.value}(address(this));
    }

    function addStake(uint32 unstakeDelaySec) external payable onlyOwner {
        entryPoint.addStake{value: msg.value}(unstakeDelaySec);
    }
}