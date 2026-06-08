import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();

  console.log("Deploying SimpleSwap...");
  const SimpleSwap = await ethers.getContractFactory("SimpleSwap");
  const simpleSwap = await SimpleSwap.deploy();

  await simpleSwap.waitForDeployment();
  const address = await simpleSwap.getAddress();

  console.log("SimpleSwap deployed to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
