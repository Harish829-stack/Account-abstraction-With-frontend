// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import "./Interfaces.sol";
import "./BaseAccount.sol";

contract ModularImplementation is BaseAccount, ERC165, Initializable, UUPSUpgradeable, IERC7579Account {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    IEntryPoint private _entryPoint;

    address private owner;

    // ERC-7579 Module Storage
    mapping(address => bool) public executors;
    mapping(address => bool) public validators;
    mapping(bytes4 => address) public fallbacks;
    address[] public activeHooks;
    
    event OwnerChanged(address indexed oldOwner, address indexed newOwner);
    event ExecutedFromExecutor(address target, uint256 value);

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

    function _authorizeUpgrade(address newImplementation) internal override onlyEntryPointOrOwner {}

    function _requireFromEntryPointOrOwner() internal view override {
        require(
            msg.sender == address(entryPoint()) || msg.sender == owner,
            "not owner or EntryPoint"
        );
    }

    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external override onlyEntryPoint returns (uint256 validationData) {
        // Native ECDSA Owner validation (65 bytes)
        if (userOp.signature.length == 65) {
            validationData = _validateSignature(userOpHash, userOp.signature);
        } else {
            // ERC-7579 Validator Routing
            // We assume the first 20 bytes is the validator address
            address validator = address(bytes20(userOp.signature[0:20]));
            require(validators[validator], "Validator not installed");
            validationData = IValidator(validator).validateUserOp(userOp, userOpHash);
        }

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
        bytes[] memory hookDataList = new bytes[](activeHooks.length);
        for (uint256 i = 0; i < activeHooks.length; i++) {
            hookDataList[i] = IHook(activeHooks[i]).preCheck(msg.sender, value, data);
        }

        (bool success, bytes memory result) = target.call{value: value}(data);

        for (uint256 i = 0; i < activeHooks.length; i++) {
            IHook(activeHooks[i]).postCheck(hookDataList[i]);
        }

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

    // --- ERC-7579 Methods ---

    function execute(ModeCode mode, bytes calldata executionCalldata) external onlyEntryPointOrOwner {
        (address target, uint256 value, bytes memory data) = abi.decode(executionCalldata, (address, uint256, bytes));
        _call(target, value, data);
    }

    function executeFromExecutor(ModeCode mode, bytes calldata executionCalldata) external returns (bytes[] memory returnData) {
        require(executors[msg.sender], "Not authorized executor");
        (address target, uint256 value, bytes memory data) = abi.decode(executionCalldata, (address, uint256, bytes));
        emit ExecutedFromExecutor(target, value);
        _call(target, value, data);
        returnData = new bytes[](0);
        return returnData;
    }

    function installModule(uint256 moduleTypeId, address module, bytes calldata initData) external onlyEntryPointOrOwner {
        if (moduleTypeId == 1) validators[module] = true;
        else if (moduleTypeId == 2) executors[module] = true;
        else if (moduleTypeId == 3) {
            require(initData.length >= 4, "Fallback requires selector init data");
            bytes4 selector = bytes4(initData[0:4]);
            fallbacks[selector] = module;
        }
        else if (moduleTypeId == 4) activeHooks.push(module);
        else revert("Unsupported module type");

        if (initData.length > 0) IModule(module).onInstall(initData);
    }

    function uninstallModule(uint256 moduleTypeId, address module, bytes calldata deInitData) external onlyEntryPointOrOwner {
        if (moduleTypeId == 1) validators[module] = false;
        else if (moduleTypeId == 2) executors[module] = false;
        else if (moduleTypeId == 3) {
            require(deInitData.length >= 4, "Fallback requires selector deInit data");
            bytes4 selector = bytes4(deInitData[0:4]);
            fallbacks[selector] = address(0);
        }
        else if (moduleTypeId == 4) {
            for (uint256 i = 0; i < activeHooks.length; i++) {
                if (activeHooks[i] == module) {
                    activeHooks[i] = activeHooks[activeHooks.length - 1];
                    activeHooks.pop();
                    break;
                }
            }
        }
        else revert("Unsupported module type");

        if (deInitData.length > 0) IModule(module).onUninstall(deInitData);
    }

    function supportsModule(uint256 moduleTypeId) external pure returns (bool) {
        return moduleTypeId >= 1 && moduleTypeId <= 4;
    }

    function isModuleInstalled(uint256 moduleTypeId, address module, bytes calldata additionalContext) external view returns (bool) {
        if (moduleTypeId == 1) return validators[module];
        if (moduleTypeId == 2) return executors[module];
        if (moduleTypeId == 3) {
            bytes4 selector = bytes4(additionalContext[0:4]);
            return fallbacks[selector] == module;
        }
        if (moduleTypeId == 4) {
            for (uint256 i = 0; i < activeHooks.length; i++) {
                if (activeHooks[i] == module) return true;
            }
            return false;
        }
        return false;
    }

    function accountId() external pure returns (string memory) {
        return "ModularAccount.v1";
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

    fallback() external payable {
        address handler = fallbacks[msg.sig];
        require(handler != address(0), "No fallback handler installed");
        
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := call(gas(), handler, callvalue(), 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 {
                revert(0, returndatasize())
            }
            default {
                return(0, returndatasize())
            }
        }
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        if (signature.length == 65) {
            address recovered = ECDSA.recover(hash, signature);
            if (recovered == owner) {
                return 0x1626ba7e;
            }
        } else if (signature.length > 20) {
            address validator = address(bytes20(signature[0:20]));
            if (validators[validator]) {
                return IValidator(validator).isValidSignatureWithSender(msg.sender, hash, signature[20:]);
            }
        }
        return 0xffffffff;
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public pure override returns (bool) {
        return interfaceId == type(IAccount).interfaceId || interfaceId == type(IERC7579Account).interfaceId;
    }
}

