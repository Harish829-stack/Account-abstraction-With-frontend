import { ethers } from "ethers";
const abiCoder = new ethers.AbiCoder();
const executions = [{target: "0x1111111111111111111111111111111111111111", value: 0n, callData: "0x1234"}];
const executionCalldata = abiCoder.encode(["tuple(address target, uint256 value, bytes callData)[]"], [executions]);
console.log(executionCalldata);
