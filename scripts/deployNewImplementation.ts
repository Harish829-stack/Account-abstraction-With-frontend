import hre from "hardhat";
import "dotenv/config";

async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();

  console.log("Deploying new ModularImplementation...");
  
  const Implementation = await ethers.getContractFactory("ModularImplementation");
  const implementation = await Implementation.deploy();
  await implementation.waitForDeployment();
  const implAddress = await implementation.getAddress();
  
  console.log("✅ New Implementation deployed to:", implAddress);
  console.log("Update VITE_IMPLEMENTATION in your .env if needed, but remember you must upgrade existing accounts via UUPS `upgradeToAndCall(newImplementation, \"0x\")`");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
