const { ethers } = require("ethers");
async function main() {
  const provider = new ethers.JsonRpcProvider("https://sepolia-rollup.arbitrum.io/rpc");
  const code = await provider.getCode("0x9Bd9388594F25a37BCa80c4DA83274bBFf555786");
  console.log("Code:", code);
}
main().catch(console.error);
