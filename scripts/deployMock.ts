import hre from "hardhat";
import fs from "fs";
import path from "path";
import "dotenv/config";

async function main() {
  const { ethers } = await hre.network.connect();
  const [owner] = await ethers.getSigners();
  console.log("Deploying MockAggregator with account:", owner.address);

  // Deploy MockAggregator for USDC with initial answer of $1.00 (100000000)
  const MockAggregator = await ethers.getContractFactory("contracts/MockAggregator.sol:MockAggregator");
  const mockAggregator = await MockAggregator.deploy(100000000);
  await mockAggregator.waitForDeployment();
  const address = await mockAggregator.getAddress();
  
  console.log("MockAggregator deployed to:", address);

  // Update .env file
  const envPath = path.resolve(__dirname, "../.env");
  let envContent = fs.readFileSync(envPath, "utf-8");
  
  if (envContent.includes("MOCK_AGGREGATOR=")) {
    envContent = envContent.replace(/MOCK_AGGREGATOR=.*/, `MOCK_AGGREGATOR="${address}"`);
  } else {
    envContent += `\nMOCK_AGGREGATOR="${address}"`;
  }
  
  fs.writeFileSync(envPath, envContent);
  console.log(".env updated with new MOCK_AGGREGATOR address");
}

main().catch(console.error);
