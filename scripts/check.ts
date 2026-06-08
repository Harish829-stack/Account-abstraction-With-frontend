import hre from "hardhat";
import "dotenv/config";

const ENTRYPOINT = process.env.ENTRY_POINT!;
const FACTORY = process.env.FACTORY!;
const PAYMASTER = process.env.PAYMASTER!;

const TOKEN =process.env.USDC_TOKEN_ADDRESS;



async function main() {

 const { ethers } =
 await hre.network.connect();

 const [owner] =
 await ethers.getSigners();

 console.log("EOA:", owner.address);

 const smartAccountAddress = process.env.SMART_ACCOUNT_ADDRESS;

 console.log(
 "SmartAccount:",
 smartAccountAddress
 );


 const usdc =
 await ethers.getContractAt(
  "IERC20",
  TOKEN!
 );
const bal = await usdc.balanceOf(smartAccountAddress!);
console.log("USDC:", bal.toString());
}

main().catch(console.error);