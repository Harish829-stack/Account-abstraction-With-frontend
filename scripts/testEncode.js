import { ethers } from "ethers";
const abiCoder = new ethers.AbiCoder();
const target = "0x878344AF84A404439Ea37cFB9b30DeFd7938741C";
const value = 0n;
const callData = "0x";
const executionCalldata = abiCoder.encode(["address", "uint256", "bytes"], [target, value, callData]);
console.log(executionCalldata);
