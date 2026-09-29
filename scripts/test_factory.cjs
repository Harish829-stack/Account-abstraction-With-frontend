const { ethers } = require("ethers");
async function main() {
  const provider = new ethers.JsonRpcProvider("https://sepolia-rollup.arbitrum.io/rpc");
  const factory = new ethers.Contract("0xEaa1ae3Ad4B332eF702ab230211f6E3CdbcC9C35", [
    "function computeAccountAddress(address,uint256,address[],uint8) view returns (address)"
  ], provider);
  const addr = await factory.computeAccountAddress("0x8375c615DEdf492B1B2036c786EDBcfB0801c3cb", 1, [], 0);
  console.log("Predicted:", addr);
}
main().catch(console.error);
