import hre from "hardhat";
import "dotenv/config";

async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();

  console.log("Deployer:", deployer.address);

  // Address of the modular account to install the module on
  const smartAccountAddress = process.env.SMART_ACCOUNT_ADDRESS;
  if (!smartAccountAddress) {
    throw new Error("Missing SMART_ACCOUNT_ADDRESS in environment. Please set it before running.");
  }

  // 1. Deploy Social Recovery Validator
  console.log("Deploying SocialRecoveryValidator...");
  const SocialRecoveryValidator = await ethers.getContractFactory("SocialRecoveryValidator");
  const recoveryValidator = await SocialRecoveryValidator.deploy();
  await recoveryValidator.waitForDeployment();
  const recoveryValidatorAddr = await recoveryValidator.getAddress();
  console.log("SocialRecoveryValidator deployed at:", recoveryValidatorAddr);

  // 2. Install Module
  const account = await ethers.getContractAt("ModularImplementation", smartAccountAddress);

  // Replace these dummy addresses with your actual guardian addresses
  const guardians: string[] = [
    "0x436aE29537d69235089508dd60ac9c389Dcc0A68", // Dummy Guardian 1
    "0x5e07EA93960BbE67251758FaE191B464CeaF41bb",
    "0xb5FDBf06a1fC067583164e94acc925008aD3FAc9"
      // Dummy Guardian 2
  ];
  const threshold = 2; // Number of required approvals
  const delay = 0; // Delay in seconds before recovery is active

  const initData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address[]", "uint16", "uint48"],
    [guardians, threshold, delay]
  );

  console.log("Installing social recovery validator...");
  
  try {
    // Simulate the transaction to catch the revert reason
    await account.getFunction("installModule").staticCall(1, recoveryValidatorAddr, initData);
    
    // If simulation succeeds, send the actual transaction
    const tx = await account.getFunction("installModule")(1, recoveryValidatorAddr, initData);
    await tx.wait();
    console.log("Social recovery installed successfully");
  } catch (error: any) {
    console.error("\n❌ Transaction reverted during simulation. Possible reasons:");
    console.error("1. SMART_ACCOUNT_ADDRESS is incorrect or not a deployed Modular Account.");
    console.error("2. The deployer (your private key) is NOT the owner of this smart account.");
    console.error("3. The contract is paused or uninitialized.\n");
    console.error("Revert Details:", error.reason || error.message);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

/**
 * 
jatinsharma@Akshay-709-M1-C07JY0FDQ6P0 Modular_SA % npx hardhat run scripts/deployEmptyRecovery.ts --network sepolia

Deployer: 0x878344AF84A404439Ea37cFB9b30DeFd7938741C
Deploying SocialRecoveryValidator...
SocialRecoveryValidator deployed at: 0x9F610079905994f44968428fdA4c0a806f8C99df
Installing social recovery validator...
Social recovery installed successfully
jatinsharma@Akshay-709-M1-C07JY0FDQ6P0 Modular_SA % 
 */
