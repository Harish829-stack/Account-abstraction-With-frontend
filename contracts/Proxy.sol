//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";


contract ModularProxy is BeaconProxy , Initializable{
    constructor(address beacon, bytes memory _data) BeaconProxy(beacon, _data) {}
    
}
