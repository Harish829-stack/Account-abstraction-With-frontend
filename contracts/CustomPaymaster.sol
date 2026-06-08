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
        UserOperation calldata userOp,
        bytes32 /*userOpHash*/,
        uint256 /*maxCost*/
    ) external view override returns (bytes memory context, uint256 validationData) {
        require(msg.sender == address(entryPoint), "Paymaster: not EntryPoint");

        // paymasterAndData = [address(this) (20 bytes) | validUntil (6 bytes) | validAfter (6 bytes) | signature (dynamic)]
        uint48 validUntil = uint48(bytes6(userOp.paymasterAndData[20:26]));
        uint48 validAfter = uint48(bytes6(userOp.paymasterAndData[26:32]));
        bytes calldata signature = userOp.paymasterAndData[32:];

        bytes32 hash = getHash(userOp, validUntil, validAfter);
        
        // Use OpenZeppelin's MessageHashUtils for the "Ethereum Signed Message" prefix
        if (verifyingSigner != hash.toEthSignedMessageHash().recover(signature)) {
            // Return 1 in the least significant bit to indicate signature failure
            return ("", _packValidationData(true, validUntil, validAfter));
        }

        return ("", _packValidationData(false, validUntil, validAfter));
    }

    function postOp(PostOpMode mode, bytes calldata context, uint256 actualGasCost) external override {
        // No-op for verifying paymaster
    }

    function getHash(
    UserOperation calldata userOp, 
    uint48 validUntil, 
    uint48 validAfter
) public view returns (bytes32) {
    // We hash the bulk of the UserOp first to clear the stack
    bytes32 userOpHash = keccak256(abi.encode(
        userOp.sender,
        userOp.nonce,
        keccak256(userOp.initCode),
        keccak256(userOp.callData),
        userOp.callGasLimit,
        userOp.verificationGasLimit,
        userOp.preVerificationGas,
        userOp.maxFeePerGas,
        userOp.maxPriorityFeePerGas
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