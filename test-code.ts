import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();
  const code = await ethers.provider.getCode("0x1d07DB529e376BFaf7309Bf17D815d9363199bAb");
  console.log("Code length:", code.length);
  if (code.length <= 2) {
    console.log("No contract is deployed here!");
  }
}
main().catch(console.error);
