import hre from "hardhat";
import "dotenv/config";
async function main() {
  const { ethers } = await (hre as any).network.connect();
  const entryPoint = await ethers.getContractAt("IEntryPoint", "0x0000000071727De22E5E9d8BAf0edAc6f37da032");
  const paymaster = process.env.VITE_PAYMASTER;
  const info = await entryPoint.getDepositInfo(paymaster);
  console.log("Deposit Info:", info);
}
main();
