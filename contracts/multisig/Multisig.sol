// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title SafeMultiSigUUPS
 * @notice An independent multisig wallet using UUPS proxy pattern.
 */
contract SafeMultiSigUUPS is Initializable, UUPSUpgradeable, ERC165 {

    string public constant VERSION = "1.1.0";
    address internal constant SENTINEL_OWNERS = address(0x1);
    uint256 public constant UPGRADE_TIMELOCK = 60 seconds;

    bytes32 private constant DOMAIN_SEPARATOR_TYPEHASH =
        0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218;

    bytes32 private constant MULTISIG_TX_TYPEHASH =
        keccak256("MultiSigTx(address to,uint256 value,bytes data,uint8 operation,uint256 nonce)");

    bytes4 private constant MULTISIG_INTERFACE_ID = 0xa5f47632; 

    enum Operation {
        Call,
        DelegateCall
    }

    enum SigType {
        EIP712,
        EthSign,
        Approved
    }

    mapping(address => address) internal owners;
    uint256 public ownerCount;
    uint256 public threshold;
    uint256 public nonce;
    mapping(address => mapping(bytes32 => bool)) public approvedHashes;
    mapping(address => bool) public delegateCallAllowlist;
    
    address public upgradeGuardian;

    struct PendingUpgrade {
        address newImplementation;
        uint256 proposedAt;
        bool    vetoed;
    }
    PendingUpgrade public pendingUpgrade;

    event AddedOwner(address indexed owner);
    event RemovedOwner(address indexed owner);
    event ChangedThreshold(uint256 threshold);
    event Received(address indexed sender, uint256 value);
    event ExecutionSuccess(bytes32 indexed txHash, uint256 nonce);
    event ExecutionFailure(bytes32 indexed txHash, uint256 nonce);
    event HashApproved(bytes32 indexed approvedHash, address indexed owner);
    event HashRevoked(bytes32 indexed revokedHash, address indexed owner);
    event DelegateCallTargetSet(address indexed target, bool allowed);
    event UpgradeProposed(address indexed newImplementation, uint256 executeAfter);
    event UpgradeExecuted(address indexed newImplementation);
    event UpgradeVetoed(address indexed newImplementation, address indexed vetoedBy);
    event UpgradeCancelled(address indexed newImplementation);
    event GuardianChanged(address indexed oldGuardian, address indexed newGuardian);

    error NotAuthorized();
    error InvalidOwner(address owner);
    error InvalidPrevOwner();
    error ThresholdExceedsOwners();
    error ThresholdTooLow();
    error SignaturesTooShort();
    error InvalidSignatureType(uint8 sigType);
    error InvalidSignature(uint256 index);
    error SignaturesNotOrdered(uint256 index);
    error HashNotApproved(address owner, bytes32 hash);
    error DelegateCallNotAllowed(address target);
    error TransactionFailed();
    error UpgradeTimelockActive(uint256 executeAfter);
    error UpgradeNotPending();
    error UpgradeWasVetoed();
    error NotGuardian();
    error ZeroAddress();

    modifier authorized() {
        if (msg.sender != address(this)) revert NotAuthorized();
        _;
    }



    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the multisig with owners, threshold, and optional upgrade guardian.
     * @param _owners    Initial owner addresses.
     * @param _threshold Minimum number of owner signatures required.
     * @param _guardian  Optional address that can veto pending upgrades.
     */
    function initialize(
        address[] memory _owners,
        uint256 _threshold,
        address _guardian
    ) public initializer {
        if (_threshold < 1) revert ThresholdTooLow();
        if (_threshold > _owners.length) revert ThresholdExceedsOwners();

        owners[SENTINEL_OWNERS] = SENTINEL_OWNERS;

        for (uint256 i = 0; i < _owners.length; i++) {
            address owner = _owners[i];
            if (
                owner == address(0)    ||
                owner == SENTINEL_OWNERS ||
                owner == address(this) ||
                owners[owner] != address(0)
            ) revert InvalidOwner(owner);

            owners[owner] = owners[SENTINEL_OWNERS];
            owners[SENTINEL_OWNERS] = owner;
            ownerCount++;
            emit AddedOwner(owner);
        }

        threshold = _threshold;
        emit ChangedThreshold(_threshold);

        upgradeGuardian = _guardian;
        if (_guardian != address(0)) {
            emit GuardianChanged(address(0), _guardian);
        }
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override
        returns (bool)
    {
        return
            interfaceId == MULTISIG_INTERFACE_ID ||
            super.supportsInterface(interfaceId);
    }

    function addOwnerWithThreshold(address owner, uint256 _threshold)
        public
        authorized
    {
        if (
            owner == address(0)    ||
            owner == SENTINEL_OWNERS ||
            owner == address(this) ||
            owners[owner] != address(0)
        ) revert InvalidOwner(owner);

        owners[owner] = owners[SENTINEL_OWNERS];
        owners[SENTINEL_OWNERS] = owner;
        ownerCount++;
        emit AddedOwner(owner);

        if (_threshold != threshold) {
            _changeThreshold(_threshold);
        }
    }

    function removeOwner(address prevOwner, address owner, uint256 _threshold)
        public
        authorized
    {
        uint256 newOwnerCount = ownerCount - 1;
        if (_threshold < 1) revert ThresholdTooLow();
        if (_threshold > newOwnerCount) revert ThresholdExceedsOwners();

        if (owner == address(0) || owner == SENTINEL_OWNERS) revert InvalidOwner(owner);
        if (owners[prevOwner] != owner) revert InvalidPrevOwner();

        owners[prevOwner] = owners[owner];
        owners[owner] = address(0);
        ownerCount = newOwnerCount;
        emit RemovedOwner(owner);

        if (_threshold != threshold) {
            _changeThreshold(_threshold);
        }
    }

    function replaceOwner(address prevOwner, address oldOwner, address newOwner)
        public
        authorized
    {
        if (
            newOwner == address(0)    ||
            newOwner == SENTINEL_OWNERS ||
            newOwner == address(this) ||
            owners[newOwner] != address(0)
        ) revert InvalidOwner(newOwner);

        if (oldOwner == address(0) || oldOwner == SENTINEL_OWNERS) revert InvalidOwner(oldOwner);
        if (owners[prevOwner] != oldOwner) revert InvalidPrevOwner();

        owners[prevOwner] = newOwner;
        owners[newOwner] = owners[oldOwner];
        owners[oldOwner] = address(0);

        emit RemovedOwner(oldOwner);
        emit AddedOwner(newOwner);
    }

    function changeThreshold(uint256 _threshold) public authorized {
        _changeThreshold(_threshold);
    }

    function _changeThreshold(uint256 _threshold) internal {
        if (_threshold < 1) revert ThresholdTooLow();
        if (_threshold > ownerCount) revert ThresholdExceedsOwners();
        threshold = _threshold;
        emit ChangedThreshold(_threshold);
    }

    function getOwners() public view returns (address[] memory array) {
        array = new address[](ownerCount);
        uint256 index = 0;
        address current = owners[SENTINEL_OWNERS];
        while (current != address(0) && current != SENTINEL_OWNERS) {
            array[index] = current;
            current = owners[current];
            index++;
        }
    }

    function isOwner(address account) public view returns (bool) {
        return account != SENTINEL_OWNERS && owners[account] != address(0);
    }

    function setDelegateCallTarget(address target, bool allowed)
        public
        authorized
    {
        if (target == address(0)) revert ZeroAddress();
        delegateCallAllowlist[target] = allowed;
        emit DelegateCallTargetSet(target, allowed);
    }

    function approveHash(bytes32 hashToApprove) external {
        if (!isOwner(msg.sender)) revert InvalidOwner(msg.sender);
        approvedHashes[msg.sender][hashToApprove] = true;
        emit HashApproved(hashToApprove, msg.sender);
    }

    function revokeApproveHash(bytes32 hashToRevoke) external {
        if (!isOwner(msg.sender)) revert InvalidOwner(msg.sender);
        approvedHashes[msg.sender][hashToRevoke] = false;
        emit HashRevoked(hashToRevoke, msg.sender);
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(
            DOMAIN_SEPARATOR_TYPEHASH,
            block.chainid,
            address(this)
        ));
    }

    function getTransactionHash(
        address to,
        uint256 value,
        bytes calldata data,
        Operation operation,
        uint256 _nonce
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(
            MULTISIG_TX_TYPEHASH,
            to,
            value,
            keccak256(data),
            operation,
            _nonce
        ));
        return keccak256(abi.encodePacked(
            bytes1(0x19),
            bytes1(0x01),
            domainSeparator(),
            structHash
        ));
    }

    function checkSignatures(bytes32 dataHash, bytes memory signatures) public view {
        uint256 _threshold = threshold;
        if (_threshold == 0) revert ThresholdTooLow();
        if (signatures.length < _threshold * 65) revert SignaturesTooShort();

        address lastOwner = address(0);

        for (uint256 i = 0; i < _threshold; i++) {
            (bytes32 r, bytes32 s, uint8 sigTypeByte) = _signatureSplit(signatures, i);

            address currentOwner;

            if (sigTypeByte == uint8(SigType.Approved)) {
                currentOwner = address(uint160(uint256(r)));

                if (msg.sender != currentOwner) {
                    if (!approvedHashes[currentOwner][dataHash]) {
                        revert HashNotApproved(currentOwner, dataHash);
                    }
                }

            } else if (sigTypeByte == uint8(SigType.EIP712)) {
                uint8 v = _vFromSigType(sigTypeByte, s);
                currentOwner = ECDSA.recover(dataHash, v, r, _cleanS(s));

            } else if (sigTypeByte == uint8(SigType.EthSign)) {
                bytes32 ethSignHash = keccak256(abi.encodePacked(
                    "\x19Ethereum Signed Message:\n32",
                    dataHash
                ));
                uint8 v = _vFromSigType(sigTypeByte, s);
                currentOwner = ECDSA.recover(ethSignHash, v, r, _cleanS(s));

            } else {
                revert InvalidSignatureType(sigTypeByte);
            }

            if (currentOwner <= lastOwner) revert SignaturesNotOrdered(i);
            if (!isOwner(currentOwner)) revert InvalidSignature(i);

            lastOwner = currentOwner;
        }
    }

    function _signatureSplit(bytes memory signatures, uint256 pos)
        internal
        pure
        returns (bytes32 r, bytes32 s, uint8 sigType)
    {
        assembly {
            let base := add(add(signatures, 0x20), mul(65, pos))
            r       := mload(base)
            s       := mload(add(base, 0x20))
            sigType := byte(0, mload(add(base, 0x40)))
        }
    }

    function _vFromSigType(uint8 /*sigType*/, bytes32 s_raw) internal pure returns (uint8 v) {
        v = (uint256(s_raw) >> 255 == 0) ? 27 : 28;
    }

    function _cleanS(bytes32 s_raw) internal pure returns (bytes32) {
        return bytes32(uint256(s_raw) & 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF);
    }

    /**
     * @notice Executes a transaction after verifying threshold signatures.
     * @param to             Destination address.
     * @param value          ETH value in wei.
     * @param data           Call data.
     * @param operation      Call or DelegateCall.
     * @param signatures     Packed 65-byte signature array.
     * @param requireSuccess If true, reverts on inner call failure.
     * @return success       True if the inner call succeeded.
     */
    function execTransaction(
        address to,
        uint256 value,
        bytes calldata data,
        Operation operation,
        bytes memory signatures,
        bool requireSuccess
    ) external payable returns (bool success) {
        uint256 txNonce = nonce;
        bytes32 txHash = getTransactionHash(to, value, data, operation, txNonce);
        nonce++;

        checkSignatures(txHash, signatures);

        if (operation == Operation.DelegateCall) {
            if (!delegateCallAllowlist[to]) revert DelegateCallNotAllowed(to);
            (success,) = to.delegatecall(data);
        } else {
            (success,) = to.call{value: value}(data);
        }

        if (success) {
            emit ExecutionSuccess(txHash, txNonce);
        } else {
            emit ExecutionFailure(txHash, txNonce);
            if (requireSuccess) revert TransactionFailed();
        }
    }

    function proposeUpgrade(address newImplementation)
        public
        authorized
        onlyProxy
    {
        if (newImplementation == address(0)) revert ZeroAddress();

        uint256 executeAfter = block.timestamp + UPGRADE_TIMELOCK;
        pendingUpgrade = PendingUpgrade({
            newImplementation: newImplementation,
            proposedAt: block.timestamp,
            vetoed: false
        });

        emit UpgradeProposed(newImplementation, executeAfter);
    }

    function executeUpgrade()
        public
        authorized
        onlyProxy
    {
        PendingUpgrade memory upgrade = pendingUpgrade;

        if (upgrade.newImplementation == address(0)) revert UpgradeNotPending();
        if (upgrade.vetoed) revert UpgradeWasVetoed();
        if (block.timestamp < upgrade.proposedAt + UPGRADE_TIMELOCK) {
            revert UpgradeTimelockActive(upgrade.proposedAt + UPGRADE_TIMELOCK);
        }

        delete pendingUpgrade;

        upgradeToAndCall(upgrade.newImplementation, "");
        emit UpgradeExecuted(upgrade.newImplementation);
    }

    function cancelUpgrade() public authorized {
        address impl = pendingUpgrade.newImplementation;
        if (impl == address(0)) revert UpgradeNotPending();
        delete pendingUpgrade;
        emit UpgradeCancelled(impl);
    }

    function vetoUpgrade() external {
        if (msg.sender != upgradeGuardian) revert NotGuardian();
        if (pendingUpgrade.newImplementation == address(0)) revert UpgradeNotPending();

        address impl = pendingUpgrade.newImplementation;
        pendingUpgrade.vetoed = true;
        emit UpgradeVetoed(impl, msg.sender);
    }

    function setGuardian(address newGuardian) public authorized {
        address old = upgradeGuardian;
        upgradeGuardian = newGuardian;
        emit GuardianChanged(old, newGuardian);
    }

    function _authorizeUpgrade(address) internal override onlyProxy {
        if (msg.sender != address(this)) revert NotAuthorized();
    }

    receive() external payable {
        if (msg.value > 0) {
            emit Received(msg.sender, msg.value);
        }
    }
}
