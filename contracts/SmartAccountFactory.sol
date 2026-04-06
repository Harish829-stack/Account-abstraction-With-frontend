// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "@openzeppelin/contracts/utils/Create2.sol";

import "./SmartAccount.sol";
import "./Interfaces.sol"; 

contract SmartAccountFactory {

    SmartAccount public immutable implementation;
    constructor(
        IEntryPoint entryPoint
    ) {

        implementation =
            new SmartAccount(
                entryPoint
            );
    }

    function createAccount(
        address owner,
        uint256 salt
    )
        public
        returns (SmartAccount ret)
    {

        address addr =
            getAddress(owner, salt);

        uint256 codeSize;

        assembly {

            codeSize := extcodesize(addr)
        }

        if (codeSize > 0) {

            return SmartAccount(
                payable(addr)
            );
        }

        ret =
            SmartAccount(
                payable(
                    new ERC1967Proxy{
                        salt: bytes32(salt)
                    }(
                        address(implementation),

                        abi.encodeCall(
                            SmartAccount.initialize,
                            (owner)
                        )
                    )
                )
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

        return Create2.computeAddress(

            bytes32(salt),

            keccak256(

                abi.encodePacked(

                    type(ERC1967Proxy)
                        .creationCode,

                    abi.encode(

                        address(
                            implementation
                        ),

                        abi.encodeCall(
                            SmartAccount.initialize,
                            (owner)
                        )
                    )
                )
            )
        );
    }
}