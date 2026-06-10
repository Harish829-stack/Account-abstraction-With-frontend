import hre from "hardhat";
import "dotenv/config";

async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();

  console.log("Deploying SessionKeyValidator with account:", deployer.address);

  // Deploy the Validator Contract
  const SessionKeyValidator = await ethers.getContractFactory("SessionKeyValidator");
  const sessionKeyValidator = await SessionKeyValidator.deploy();
  await sessionKeyValidator.waitForDeployment();

  const validatorAddress = await sessionKeyValidator.getAddress();
  
  console.log("=========================================");
  console.log("SessionKeyValidator deployed to:", validatorAddress);
  console.log("=========================================");
  console.log("You can now copy this address and paste it into the 'Validator Address' field on the Session Keys frontend!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});



/**
 * jatinsharma@Akshay-709-M1-C07JY0FDQ6P0 Modular_SA % npx hardhat run scripts/deploySessionKeyValidator.ts --network sepolia

Deploying SessionKeyValidator with account: 0x878344AF84A404439Ea37cFB9b30DeFd7938741C
=========================================
SessionKeyValidator deployed to: 0xa2f110D308563Dc994F8a69115eFb60E7B57660E
=========================================
You can now copy this address and paste it into the 'Validator Address' field on the Session Keys frontend!
jatinsharma@Akshay-709-M1-C07JY0FDQ6P0 Modular_SA % 
 */