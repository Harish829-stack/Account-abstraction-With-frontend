
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";

contract ModularBeacon is UpgradeableBeacon {
    constructor(address implementation) UpgradeableBeacon(implementation,msg.sender) {}
}