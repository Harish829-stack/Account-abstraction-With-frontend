import hre from "hardhat";
import "dotenv/config";

async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();

  console.log("Deploying WebAuthnValidator with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Deploy the WebAuthn Validator Contract (no constructor args needed)
  const WebAuthnValidator = await ethers.getContractFactory("WebAuthnValidator");
  const webAuthnValidator = await WebAuthnValidator.deploy();
  await webAuthnValidator.waitForDeployment();

  const validatorAddress = await webAuthnValidator.getAddress();

  console.log("=========================================");
  console.log("WebAuthnValidator deployed to:", validatorAddress);
  console.log("=========================================");
  console.log("\nNext steps:");
  console.log("1. Copy the address above");
  console.log("2. Paste it into frontend/.env as: VITE_WEBAUTHN_VALIDATOR=\"" + validatorAddress + "\"");
  console.log("3. Restart the frontend dev server");
  console.log("4. In the app, go to Profile → WebAuthn Passkey → paste the address and follow the 2-step setup");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
