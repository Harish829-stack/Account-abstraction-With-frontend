import hre from "hardhat";
import "dotenv/config";

const ENTRYPOINT = process.env.ENTRY_POINT!;
const FACTORY = process.env.FACTORY!;
const PAYMASTER = process.env.PAYMASTER!;

const TOKEN =
"0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";



async function main() {

 const { ethers } =
 await hre.network.connect();

 const [owner] =
 await ethers.getSigners();

 console.log("EOA:", owner.address);

 const smartAccountAddress = "0xD73e74C58C6593B1070bA4561b2fbd2746b3d29b";

 console.log(
 "SmartAccount:",
 smartAccountAddress
 );


 const usdc =
 await ethers.getContractAt(
  "IERC20",
  TOKEN
 );
const bal = await usdc.balanceOf(smartAccountAddress);
console.log("USDC:", bal.toString());
}

main().catch(console.error);