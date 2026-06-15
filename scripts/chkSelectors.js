import { ethers } from "ethers";
const iface = new ethers.Interface([
  "function execute(bytes32 mode, bytes calldata executionCalldata)",
  "function execute(address dest, uint256 value, bytes calldata func)",
  "function executeBatch(address[] calldata dest, uint256[] calldata value, bytes[] calldata func)"
]);
console.log("execute(bytes32,bytes):", iface.getFunction("execute(bytes32,bytes)").selector);
console.log("execute(address,uint256,bytes):", iface.getFunction("execute(address,uint256,bytes)").selector);
console.log("executeBatch:", iface.getFunction("executeBatch").selector);
