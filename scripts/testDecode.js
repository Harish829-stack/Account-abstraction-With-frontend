import { ethers } from "ethers";

async function main() {
  const ExecABI = "tuple(address target, uint256 value, bytes callData)[]";

  const data = [{ target: ethers.ZeroAddress, value: 0n, callData: "0x1234" }];
  
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode([ExecABI], [data]);
  console.log("Encoded struct array:", encoded);

  try {
    const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["address[]", "uint256[]", "bytes[]"], encoded);
    console.log("Decoded successfully!");
  } catch (e) {
    console.error("Decode failed!", e.message);
  }
}

main();
