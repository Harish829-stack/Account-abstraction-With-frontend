import hre from "hardhat";
import "dotenv/config";

async function main() {
  const { ethers } = await hre.network.connect();
  const paymasterAddress = process.env.VITE_MULTITOKEN_PAYMASTER || process.env.MULTITOKEN_PAYMASTER || process.env.PAYMASTER;
  
  if (!paymasterAddress) {
    throw new Error("Paymaster address not found in environment.");
  }

  const paymaster = await ethers.getContractAt(
    "contracts/Erc20Paymaster.sol:MultiTokenPaymaster",
    paymasterAddress
  );

  console.log(`Checking Paymaster at: ${paymasterAddress}`);
  
  const NATIVE_USD_FEED_DECIMALS = await paymaster.NATIVE_USD_FEED_DECIMALS();
  const maxNativePriceUsd = await paymaster.maxNativePriceUsd();
  
  console.log(`NATIVE_USD_FEED_DECIMALS: ${NATIVE_USD_FEED_DECIMALS}`);
  console.log(`maxNativePriceUsd: ${maxNativePriceUsd.toString()}`);

  const tokens = [
    { symbol: 'USDC', address: process.env.SEPOLIA_USDC_TOKEN || process.env.USDC_TOKEN_ADDRESS || "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" },
    { symbol: 'EURC', address: '0x08210f9170f89ab7658f0b5e3ff39b0e03c594d4' }
  ];

  for (const t of tokens) {
    console.log(`\nChecking ${t.symbol} (${t.address})...`);
    const cfg = await paymaster.tokenConfigs(t.address);
    console.log(`Enabled: ${cfg.enabled}`);
    console.log(`Token Decimals: ${cfg.decimals}`);
    console.log(`Feed Decimals: ${cfg.feedDecimals}`);
    console.log(`Token USD Feed: ${cfg.tokenUsdFeed}`);
    console.log(`Min Token Price USD: ${cfg.minTokenPriceUsd.toString()}`);
  }

  // Also check the user's Smart Account balance
  const saAddress = "0x68b70CD8277b3379931c222282F9F78831076363";
  console.log(`\nChecking balances for Smart Account: ${saAddress}`);
  for (const t of tokens) {
    const erc20 = await ethers.getContractAt([
      "function balanceOf(address) view returns (uint256)",
      "function allowance(address, address) view returns (uint256)"
    ], t.address);
    
    try {
      const bal = await erc20.balanceOf(saAddress);
      const allow = await erc20.allowance(saAddress, paymasterAddress);
      console.log(`${t.symbol} Balance: ${ethers.formatUnits(bal, 6)}`);
      console.log(`${t.symbol} Allowance to PM: ${ethers.formatUnits(allow, 6)}`);
    } catch (e) {
      console.log(`Could not read balance for ${t.symbol}`);
    }
  }
}

main().catch(console.error);
