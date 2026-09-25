const { ethers } = require("hardhat");
async function main() {
  const code = await ethers.provider.getCode("0x1d07DB529e376BFaf7309Bf17D815d9363199bAb");
  console.log("Code length:", code.length);
}
main().catch(console.error);
