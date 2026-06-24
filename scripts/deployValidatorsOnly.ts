import hre from "hardhat";
const { ethers } = await hre.network.connect()

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // Deploy SessionKeyValidator
  const SessionKey = await ethers.getContractFactory("SessionKeyValidator");
  const sessionKey = await SessionKey.deploy();
  await sessionKey.waitForDeployment();
  console.log("SessionKeyValidator:", await sessionKey.getAddress());

  // Deploy SocialRecoveryValidator
  const SocialRecovery = await ethers.getContractFactory("SocialRecoveryValidator");
  const socialRecovery = await SocialRecovery.deploy();
  await socialRecovery.waitForDeployment();
  console.log("SocialRecoveryValidator:", await socialRecovery.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
