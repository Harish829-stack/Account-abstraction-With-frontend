import { ethers } from "ethers";
function encodeERC7579Single(target, value, callData) {
    const EXEC_MODE_DEFAULT = "0x0100000000000000000000000000000000000000000000000000000000000000";
    const executionCalldata = ethers.solidityPacked(
        ["address", "uint256", "bytes"],
        [target, value, callData]
    );
    const nexusIface = new ethers.Interface(["function execute(bytes32 mode, bytes calldata executionCalldata)"]);
    return nexusIface.encodeFunctionData("execute", [EXEC_MODE_DEFAULT, executionCalldata]);
}
console.log(encodeERC7579Single("0x1111111111111111111111111111111111111111", 0, "0x1234"));
