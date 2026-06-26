// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "./Multisig.sol";

/**
 * @title SafeMultiSigFactory
 * @notice Factory for deploying minimal ERC1967 proxies pointing to the SafeMultiSigUUPS implementation.
 */
contract SafeMultiSigFactory {

    address public immutable implementation;

    /**
     * @notice Emitted when a new wallet proxy is deployed.
     * @param proxy      Address of the newly deployed proxy.
     * @param ownersHash Hash of the owners array.
     * @param ownerCount Number of initial owners.
     * @param threshold  Required signature threshold.
     * @param salt       The CREATE2 salt used (zero for CREATE deployments).
     */
    event WalletCreated(
        address indexed proxy,
        bytes32 indexed ownersHash,
        uint256 ownerCount,
        uint256 threshold,
        bytes32 salt
    );

    error InvalidImplementation();
    error DeploymentFailed();
    error WalletAlreadyExists(address predicted);

    constructor(address _implementation) {
        if (_implementation == address(0)) revert InvalidImplementation();
        implementation = _implementation;
    }

    /**
     * @notice Deploys a new multisig wallet using standard CREATE.
     * @param owners    Initial owner addresses.
     * @param threshold Required confirmations.
     * @param guardian  Optional upgrade guardian (address(0) to disable).
     * @return proxy    Address of the deployed wallet.
     */

    /**
     * @notice Deploys a new multisig wallet using CREATE2 for a deterministic address.
     * @param owners    Initial owner addresses.
     * @param threshold Required confirmations.
     * @param guardian  Optional upgrade guardian.
     * @param salt      Caller-chosen bytes32 salt for CREATE2.
     * @return proxy    Address of the deployed wallet.
     */
    function createWallet(
        address[] memory owners,
        uint256 threshold,
        address guardian,
        bytes32 salt
    ) external returns (address proxy) {
        address predicted = computeAddress(owners, threshold, guardian, salt);
        if (predicted.code.length > 0) revert WalletAlreadyExists(predicted);

        bytes memory initData = _encodeInit(owners, threshold, guardian);
        bytes memory bytecode = _proxybytecode(initData);

        assembly {
            proxy := create2(
                0,
                add(bytecode, 0x20),
                mload(bytecode),
                salt
            )
        }

        if (proxy == address(0)) revert DeploymentFailed();

        emit WalletCreated(
            proxy,
            keccak256(abi.encode(owners)),
            owners.length,
            threshold,
            salt
        );
    }

    /**
     * @notice Computes the CREATE2 address for a wallet before deployment.
     * @param owners    Same owners array used for deployment.
     * @param threshold Same threshold.
     * @param guardian  Same guardian.
     * @param salt      Same salt.
     * @return predicted The address the wallet will be deployed to.
     */
    function computeAddress(
        address[] memory owners,
        uint256 threshold,
        address guardian,
        bytes32 salt
    ) public view returns (address predicted) {
        bytes memory initData = _encodeInit(owners, threshold, guardian);
        bytes32 bytecodeHash = keccak256(_proxybytecode(initData));

        predicted = address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xFF),
            address(this),
            salt,
            bytecodeHash
        )))));
    }

    /**
     * @notice Generates a collision-resistant salt.
     * @param  userNonce Any uint256 chosen by the deployer.
     * @return salt      A bytes32 suitable for createWallet2().
     */
    function buildSalt(uint256 userNonce) external view returns (bytes32 salt) {
        salt = keccak256(abi.encode(msg.sender, userNonce));
    }

    function _encodeInit(
        address[] memory owners,
        uint256 threshold,
        address guardian
    ) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(
            SafeMultiSigUUPS.initialize.selector,
            owners,
            threshold,
            guardian
        );
    }

    function _proxybytecode(bytes memory initData)
        internal
        view
        returns (bytes memory)
    {
        return abi.encodePacked(
            type(ERC1967Proxy).creationCode,
            abi.encode(implementation, initData)
        );
    }
}
