import hre from "hardhat";
import * as dotenv from "dotenv";

dotenv.config({ path: "./frontend/.env" });

async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();
  
  const smartAccountAddress = process.env.VITE_SMART_ACCOUNT_ADDRESS;
  const newImpl = "0xA156274b547FcC5a3965214A294999a581fAfEd3";
  
  console.log("Upgrading account:", smartAccountAddress, "to new impl:", newImpl);
  
  const account = await ethers.getContractAt("ModularImplementation", smartAccountAddress, deployer);
  
  const tx = await account.upgradeToAndCall(newImpl, "0x");
  await tx.wait();
  
  console.log("Upgraded successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
