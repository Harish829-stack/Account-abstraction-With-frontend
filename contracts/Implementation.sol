// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "./UserOperation.sol";
import "./Interfaces.sol";
import "./BaseAccount.sol";

contract ModularImplementation is BaseAccount, ERC165, Initializable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    IEntryPoint private _entryPoint;

    address private owner;

    event OwnerChanged(address indexed oldOwner, address indexed newOwner);

    event SmartAccountInitialized(
        IEntryPoint indexed entryPoint,
        address indexed owner
    );

    constructor() {
        _disableInitializers();
    }

    function initialize(address anOwner, IEntryPoint anEntryPoint) external initializer {
        _entryPoint = anEntryPoint;

        owner = anOwner;

        emit SmartAccountInitialized(_entryPoint, anOwner);
    }

    function entryPoint() public view override returns (IEntryPoint) {
        return _entryPoint;
    }

    function _requireFromEntryPointOrOwner() internal view override {
        require(
            msg.sender == address(entryPoint()) || msg.sender == owner,
            "not owner or EntryPoint"
        );
    }

    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external override onlyEntryPoint returns (uint256 validationData) {
        validationData = _validateSignature(userOpHash, userOp.signature);

        _payPrefund(missingAccountFunds);
    }

    function _validateSignature(
        bytes32 userOpHash,
        bytes calldata signature
    ) internal view returns (uint256) {
        bytes32 hash = userOpHash.toEthSignedMessageHash();

        address recovered = ECDSA.recover(hash, signature);

        if (recovered != owner) {
            return 1;
        }

        return 0;
    }

    function _payPrefund(uint256 missingAccountFunds) internal {
        if (missingAccountFunds > 0) {
            (bool success, ) = payable(msg.sender).call{
                value: missingAccountFunds
            }("");

            require(success, "prefund failed");
        }
    }

    function execute(
        address dest,
        uint256 value,
        bytes calldata func
    ) external onlyEntryPointOrOwner {
        _call(dest, value, func);
    }

    function executeBatch(
        address[] calldata dest,
        uint256[] calldata value,
        bytes[] calldata func
    ) external onlyEntryPointOrOwner {
        require(
            dest.length == func.length && dest.length == value.length,
            "length mismatch"
        );

        for (uint256 i = 0; i < dest.length; i++) {
            _call(dest[i], value[i], func[i]);
        }
    }

    function _call(address target, uint256 value, bytes memory data) internal {
        (bool success, bytes memory result) = target.call{value: value}(data);

        if (!success) {
            if (result.length > 0) {
                assembly {
                    revert(add(result, 32), mload(result))
                }
            } else {
                revert("call failed");
            }
        }
    }

    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external pure returns (bytes4) {
        return 0x150b7a02;
    }

    function addDeposit() public payable {
        entryPoint().depositTo{value: msg.value}(address(this));
    }

    function withdrawDepositTo(
        address payable withdrawAddress,
        uint256 amount
    ) public onlyEntryPointOrOwner {
        entryPoint().withdrawTo(withdrawAddress, amount);
    }

    function getDeposit() public view returns (uint256) {
        return entryPoint().balanceOf(address(this));
    }

    function changeOwner(address newOwner) external onlyEntryPointOrOwner {
        require(newOwner != address(0), "invalid owner");

        address oldOwner = owner;

        owner = newOwner;

        emit OwnerChanged(oldOwner, newOwner);
    }

    receive() external payable {}

    function supportsInterface(
        bytes4 interfaceId
    ) public pure override returns (bool) {
        return interfaceId == type(IAccount).interfaceId;
    }
}

