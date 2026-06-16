import hre from "hardhat";
import "dotenv/config";

async function main() {
  const { ethers } = await hre.network.connect();
  const [owner] = await ethers.getSigners();
  const networkName = (await ethers.provider.getNetwork()).name;
  
  const paymasterAddress = process.env.VITE_MULTITOKEN_PAYMASTER || process.env.MULTITOKEN_PAYMASTER || process.env.PAYMASTER;
  if (!paymasterAddress) {
    throw new Error("Paymaster address not found in environment.");
  }

  console.log(`Updating Paymaster at: ${paymasterAddress}`);
  console.log(`Current Network: ${networkName}`);

  const paymaster = await ethers.getContractAt(
    "contracts/Erc20Paymaster.sol:MultiTokenPaymaster",
    paymasterAddress,
    owner
  );

  // Set realistic price ceilings based on network
  // Sepolia (ETH) -> $4000
  // Amoy (POL/MATIC) -> $2
  let maxPriceStr = "3000"; 
  if (networkName === "amoy" || networkName === "polygonAmoy") {
    maxPriceStr = "2";
  }

  // The contract expects the value in NATIVE_USD_FEED_DECIMALS (which is usually 8)
  const feedDecimals = await paymaster.NATIVE_USD_FEED_DECIMALS();
  const maxNativePriceUsd = ethers.parseUnits(maxPriceStr, feedDecimals);

  console.log(`Setting maxNativePriceUsd to $${maxPriceStr} (${maxNativePriceUsd.toString()})...`);
  
  const tx = await paymaster.setMaxNativePriceUsd(maxNativePriceUsd);
  console.log("Tx hash:", tx.hash);
  
  await tx.wait();
  console.log("maxNativePriceUsd updated successfully!");
}

main().catch(console.error);
