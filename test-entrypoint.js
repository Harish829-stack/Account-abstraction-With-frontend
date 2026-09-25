const { ethers } = require("ethers");
async function main() {
  const provider = new ethers.JsonRpcProvider("https://sepolia-rollup.arbitrum.io/rpc");
  const code = await provider.getCode("0x0000000071727De22E5E9d8BAf0edAc6f37da032");
  console.log("Code length:", code.length);
}
main();
