// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/utils/Create2.sol";

import "./Proxy.sol";
import "./Implementation.sol";
import "./Interfaces.sol"; 

contract ProxyFactory {

    ModularImplementation public immutable implementation;
    IEntryPoint public immutable entryPoint;

    constructor(
        IEntryPoint _entryPoint
    ) {
        entryPoint = _entryPoint;
        implementation = new ModularImplementation();
    }

    function createAccount(
        address owner,
        uint256 salt
    )
        public
        returns (ModularProxy ret)
    {
        address addr = getAddress(owner, salt);

        uint256 codeSize;
        assembly {
            codeSize := extcodesize(addr)
        }
        if (codeSize > 0) {
            return ModularProxy(payable(addr));
        }

        bytes memory data = abi.encodeCall(
            ModularImplementation.initialize,
            (owner, entryPoint)
        );

        ret = new ModularProxy{salt: bytes32(salt)}(
            address(implementation),
            data
        );
    }

    function getAddress(
        address owner,
        uint256 salt
    )
        public
        view
        returns (address)
    {
        bytes memory data = abi.encodeCall(
            ModularImplementation.initialize,
            (owner, entryPoint)
        );

        return Create2.computeAddress(
            bytes32(salt),
            keccak256(
                abi.encodePacked(
                    type(ModularProxy).creationCode,
                    abi.encode(address(implementation), data)
                )
            )
        );
    }
}