import { ethers } from "ethers";

const abi = [
  "function deposit() payable",
  "function addStake(uint32 unstakeDelaySec) payable"
];

const contract = new ethers.Contract("0x1234567890123456789012345678901234567890", abi);
console.log("deposit function data:", contract.interface.encodeFunctionData("deposit"));
console.log("addStake function data:", contract.interface.encodeFunctionData("addStake", [86400]));

