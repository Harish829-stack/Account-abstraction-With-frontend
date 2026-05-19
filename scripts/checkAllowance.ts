import hre from "hardhat";
import "dotenv/config";
import { ethers } from "ethers";

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  
  const usdcAddr = process.env.USDC_TOKEN_ADDRESS;
  const pmAddr = process.env.PAYMASTER;
  const saAddr = process.env.SMART_ACCOUNT_ADDRESS;

  console.log("USDC:", usdcAddr);
  console.log("Paymaster:", pmAddr);
  console.log("Smart Account:", saAddr);

  const abi = ["function allowance(address owner, address spender) view returns (uint256)", "function balanceOf(address) view returns (uint256)"];
  const usdc = new ethers.Contract(usdcAddr!, abi, provider);

  const bal = await usdc.balanceOf(saAddr!);
  const all = await usdc.allowance(saAddr!, pmAddr!);

  console.log("SA USDC Balance:", ethers.formatUnits(bal, 6));
  console.log("SA Allowance to PM:", ethers.formatUnits(all, 6));
}

main().catch(console.error);
