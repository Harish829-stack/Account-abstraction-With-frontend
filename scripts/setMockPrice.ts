import hre from "hardhat";
import "dotenv/config";

async function main() {
  const { ethers } = await hre.network.connect();
  const [owner] = await ethers.getSigners();
  
  const mockAggregatorAddress = process.env.MOCK_AGGREGATOR;
  if (!mockAggregatorAddress) {
    throw new Error("MOCK_AGGREGATOR environment variable is not set");
  }

  console.log("Setting price in MockAggregator at:", mockAggregatorAddress);
  console.log("Using account:", owner.address);

  // Get the new price from environment variable or use a default
  // Default: 2.00 (assuming 6 decimals, 2000000)
  const newPriceStr = process.env.NEW_PRICE ? process.env.NEW_PRICE : "1000000";
  const newPrice = BigInt(newPriceStr);

  const MockAggregator = await ethers.getContractFactory("contracts/MockAggregator.sol:MockAggregator");
  const mockAggregator = MockAggregator.attach(mockAggregatorAddress);

  // console.log(`Setting new answer to: ${newPrice.toString()}`);
  
  // const tx = await mockAggregator.connect(owner).setAnswer(newPrice);
  // console.log("Transaction hash:", tx.hash);
  
  // await tx.wait();
  // console.log("Price updated successfully!")
  // 
  
  const currentPrice = await mockAggregator.answer();
  console.log("Current price:", currentPrice.toString());



}

main().catch(console.error);
