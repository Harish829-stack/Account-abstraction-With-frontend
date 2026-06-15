import { ethers } from "ethers";

const EXEC_MODE_DEFAULT = "0x0100000000000000000000000000000000000000000000000000000000000000";
const EXEC_MODE_BATCH = "0x0100000000000000000000000000000000000000000000000000000000000001";

function encodeERC7579Single(target, value, callData) {
    const executionCalldata = ethers.solidityPacked(
        ["address", "uint256", "bytes"],
        [target, value, callData]
    );
    const nexusIface = new ethers.Interface(["function execute(bytes32 mode, bytes calldata executionCalldata)"]);
    return nexusIface.encodeFunctionData("execute", [EXEC_MODE_DEFAULT, executionCalldata]);
}

function encodeERC7579Batch(targets, values, callDatas) {
    const abiCoder = new ethers.AbiCoder();
    const executions = targets.map((target, i) => ({
        target,
        value: values[i],
        callData: callDatas[i]
    }));
    // Execution[] is tuple(address target, uint256 value, bytes callData)[]
    const executionCalldata = abiCoder.encode(
        ["tuple(address target, uint256 value, bytes callData)[]"],
        [executions]
    );
    const nexusIface = new ethers.Interface(["function execute(bytes32 mode, bytes calldata executionCalldata)"]);
    return nexusIface.encodeFunctionData("execute", [EXEC_MODE_BATCH, executionCalldata]);
}

console.log("Single:", encodeERC7579Single("0x1111111111111111111111111111111111111111", 0, "0x"));
console.log("Batch:", encodeERC7579Batch(["0x1111111111111111111111111111111111111111"], [0], ["0x"]));
