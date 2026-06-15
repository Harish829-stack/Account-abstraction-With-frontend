// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/**
 * @title  CREATE3Factory
 * @notice Deploys contracts to deterministic addresses using the CREATE3 pattern.
 *         The deployed address depends only on (deployer, salt) — not on the
 *         creation bytecode — so the same address can be reserved across chains
 *         before the final implementation is known.
 *
 * @dev    Deployment flow:
 *           1. A minimal 16-byte proxy is deployed via CREATE2 at an address
 *              determined by (factory, guardedSalt, PROXY_BYTECODE_HASH).
 *           2. The proxy is immediately called with the target creationCode.
 *              Internally it runs CREATE, producing the final contract at a
 *              deterministic address (RLP of proxy + nonce 1).
 *
 *         Salt namespacing:
 *           guardedSalt = keccak256(abi.encodePacked(msg.sender, salt))
 *           This prevents front-run griefing: two different callers using the
 *           same raw salt land at different proxy addresses, and therefore
 *           different deployed addresses.
 *
 *         Proxy bytecode (16 bytes):
 *           CALLDATASIZE RETURNDATASIZE RETURNDATASIZE CALLDATACOPY
 *           CALLDATASIZE RETURNDATASIZE CALLVALUE CREATE
 *           RETURNDATASIZE MSTORE PUSH1 0x08 PUSH1 0x18 RETURN
 *           hex: 67363d3d37363d34f03d5260086018f3
 *
 *         _deployedAddress relies on RLP nonce = 1, which is correct for a
 *         fresh proxy that has never deployed anything before.
 */
contract CREATE3Factory {

    // ── Errors ─────────────────────────────────────────────────────────────────

    /// @dev Thrown when the inner CREATE (inside the proxy) produces no bytecode.
    error DeploymentFailed();

    /// @dev Thrown when the target address already contains bytecode.
    error AlreadyDeployed();

    // ── Constants ──────────────────────────────────────────────────────────────

    /**
     * @dev Minimal 16-byte proxy that copies all calldata and runs CREATE.
     *      Stored as bytes16 so we can mstore it and slice from offset 16.
     */
    bytes16 private constant PROXY_BYTECODE =
        hex"67363d3d37363d34f03d5260086018f3";

    /**
     * @dev Keccak256 of the proxy bytecode — computed once at compile time and
     *      used as the CREATE2 init-code hash in _proxyAddress().
     *      Storing the hash avoids a runtime keccak256 call on every lookup.
     */
    bytes32 private constant PROXY_BYTECODE_HASH =
        keccak256(abi.encodePacked(hex"67363d3d37363d34f03d5260086018f3"));

    // ── External functions ─────────────────────────────────────────────────────

    /**
     * @notice Deploy `creationCode` to a deterministic address.
     * @param  salt         Caller-chosen salt. Combined with msg.sender to
     *                      produce a namespaced salt, preventing front-running.
     * @param  creationCode Contract creation bytecode (including constructor
     *                      arguments ABI-encoded at the end if required).
     * @return deployed     Address of the newly deployed contract.
     *
     * @dev    Any ETH attached to this call is forwarded to the contract
     *         constructor via the proxy's CALLVALUE opcode.
     *
     *         Reverts with AlreadyDeployed  if the target address is occupied.
     *         Reverts with DeploymentFailed if the inner CREATE returns nothing.
     */
    function deploy(
        bytes32 salt,
        bytes memory creationCode
    ) external payable returns (address deployed) {

        // Namespace the salt to the caller to prevent front-run griefing.
        bytes32 guardedSalt = keccak256(abi.encodePacked(msg.sender, salt));

        address proxy;
        assembly {
            let ptr := mload(0x40)
            // 0x67363d3d37363d34f03d5260086018f3 is 16 bytes.
            // We store it as a 32-byte word. It will be right-aligned.
            mstore(ptr, 0x67363d3d37363d34f03d5260086018f3)
            // The 16 bytes of bytecode are at [ptr+16 .. ptr+31].
            proxy := create2(0, add(ptr, 16), 16, guardedSalt)
        }

        // If CREATE2 returned address(0) the salt was already used.
        if (proxy == address(0)) {
            // Recompute where the proxy *would* live.
            proxy = _proxyAddress(guardedSalt);

            // If the final contract already exists there is nothing to do.
            deployed = _deployedAddress(proxy);
            if (deployed.code.length != 0) revert AlreadyDeployed();
        }

        // Sanity-guard: proxy must now be a live contract before we call it.
        // This catches the edge-case where CREATE2 returned 0 due to an
        // out-of-gas condition rather than a salt collision.
        require(proxy.code.length != 0, "CREATE3: proxy not deployed");

        // Call the proxy with the target creationCode.
        // The proxy forwards calldata to CREATE, passing msg.value along.
        assembly {
            let success := call(
                gas(),
                proxy,
                callvalue(),          // forward all ETH to the constructor
                add(creationCode, 32),// skip the ABI length prefix
                mload(creationCode),  // actual byte length
                0, 0
            )
            if iszero(success) {
                // DeploymentFailed() selector = 0x30116425
                mstore(0x00, 0x30116425)
                revert(0x1c, 0x04)
            }
        }

        deployed = _deployedAddress(proxy);

        // Confirm bytecode was actually written by the inner CREATE.
        if (deployed.code.length == 0) revert DeploymentFailed();
    }

    /**
     * @notice Predict the address that deploy(deployer, salt, ...) will use,
     *         without actually deploying anything.
     * @param  deployer Address that will call deploy().
     * @param  salt     The raw (un-namespaced) salt.
     * @return          Predicted deployment address.
     */
    function getDeployed(
        address deployer,
        bytes32 salt
    ) external view returns (address) {
        bytes32 guardedSalt = keccak256(abi.encodePacked(deployer, salt));
        return _deployedAddress(_proxyAddress(guardedSalt));
    }

    // ── Internal helpers ───────────────────────────────────────────────────────

    /**
     * @dev Compute the CREATE2 address of the intermediate proxy.
     *      Formula: keccak256(0xFF ++ factory ++ guardedSalt ++ initcodeHash)[12:]
     */
    function _proxyAddress(bytes32 guardedSalt) internal view returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xFF),
            address(this),
            guardedSalt,
            PROXY_BYTECODE_HASH
        )))));
    }

    /**
     * @dev Compute the CREATE address of the contract deployed by `proxy`.
     *      Uses RLP encoding of (proxy, nonce=1).
     *
     *      RLP breakdown for a 20-byte address at nonce 1:
     *        0xd6        — list of length 22 (0xc0 + 22)
     *        0x94        — string of length 20 (0x80 + 20)
     *        <20 bytes>  — proxy address
     *        0x01        — nonce (integer 1)
     *
     *      NOTE: This is correct only for a freshly deployed proxy (nonce = 1).
     *            Do not reuse this helper for contracts with a different nonce.
     */
    function _deployedAddress(address proxy) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xd6),
            bytes1(0x94),
            proxy,
            bytes1(0x01)
        )))));
    }
}