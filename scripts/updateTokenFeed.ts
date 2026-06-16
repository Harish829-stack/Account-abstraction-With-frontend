import hre from "hardhat";
import "dotenv/config";

async function main() {
  const { ethers } = await hre.network.connect();
  const [owner] = await ethers.getSigners();
  
  const paymasterAddress = process.env.MULTITOKEN_PAYMASTER || process.env.PAYMASTER;
  if (!paymasterAddress) {
    throw new Error("MULTITOKEN_PAYMASTER environment variable is not set");
  }

  // Token and Feed to update
  const tokenToUpdate = process.env.SEPOLIA_USDC_TOKEN || process.env.USDC_TOKEN_ADDRESS || "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"; // Update this logic if using amoy
  const newFeedAddress = process.env.MOCK_AGGREGATOR;

  if (!newFeedAddress) {
    throw new Error("MOCK_AGGREGATOR environment variable is not set");
  }

  console.log(`Updating Paymaster at: ${paymasterAddress}`);
  console.log(`Setting new feed for Token: ${tokenToUpdate}`);
  console.log(`New Feed Address: ${newFeedAddress}`);

  const paymaster = await ethers.getContractAt(
    "contracts/Erc20Paymaster.sol:MultiTokenPaymaster",
    paymasterAddress,
    owner
  );

  console.log("Sending updateTokenFeed transaction...");
  const tx = await paymaster.updateTokenFeed(tokenToUpdate, newFeedAddress);
  console.log("Tx hash:", tx.hash);
  
  await tx.wait();
  console.log("Token feed updated successfully!");
}

main().catch(console.error);
