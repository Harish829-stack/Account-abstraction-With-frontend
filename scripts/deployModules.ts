import hre from "hardhat";
import "dotenv/config";

async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();

  console.log("Deploying Modules with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // 1. Deploy SessionKeyValidator
  console.log("\nDeploying SessionKeyValidator...");
  const SessionKeyValidator = await ethers.getContractFactory("SessionKeyValidator");
  const sessionKeyValidator = await SessionKeyValidator.deploy();
  await sessionKeyValidator.waitForDeployment();
  const sessionKeyValidatorAddress = await sessionKeyValidator.getAddress();
  console.log("✅ SessionKeyValidator deployed to:", sessionKeyValidatorAddress);

  // 2. Deploy SocialRecoveryValidator
  console.log("\nDeploying SocialRecoveryValidator...");
  const SocialRecoveryValidator = await ethers.getContractFactory("SocialRecoveryValidator");
  const socialRecoveryValidator = await SocialRecoveryValidator.deploy();
  await socialRecoveryValidator.waitForDeployment();
  const socialRecoveryValidatorAddress = await socialRecoveryValidator.getAddress();
  console.log("✅ SocialRecoveryValidator deployed to:", socialRecoveryValidatorAddress);

  console.log("\n=========================================");
  console.log("Deployment Summary:");
  console.log("SessionKeyValidator:", sessionKeyValidatorAddress);
  console.log("SocialRecoveryValidator:", socialRecoveryValidatorAddress);
  console.log("=========================================");
  console.log("\nNext steps:");
  console.log("1. Add these addresses to your .env file or configuration where needed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
