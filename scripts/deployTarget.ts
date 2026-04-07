import hre from "hardhat";
import { verifyContract } from "@nomicfoundation/hardhat-verify/verify";


async function main() {

  const { ethers } = await hre.network.connect();

  // deploy
  const target = await ethers.deployContract("Target");

  await target.waitForDeployment();

  const address = await target.getAddress();

  console.log("Target deployed to:", address);

  
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});