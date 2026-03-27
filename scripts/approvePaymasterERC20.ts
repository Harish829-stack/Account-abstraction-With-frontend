
//before approving,transfer usdc  tokens and some amount to SmartAccount


import hre from "hardhat";
import axios from "axios";
import "dotenv/config";

const ENTRYPOINT = process.env.ENTRY_POINT!;
const FACTORY = process.env.FACTORY!;
const PAYMASTER = process.env.ERC20PAYMASTER!;

const TOKEN =
"0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";

const SALT = 1;

const SKANDHA_URL =
"http://127.0.0.1:14337/rpc";

function toHex(v: bigint | number) {
 return "0x" + v.toString(16);
}

async function main() {

 const { ethers } =
 await hre.network.connect();

 const [owner] =
 await ethers.getSigners();

 console.log("EOA:", owner.address);

 const factory =
 await ethers.getContractAt(
  "SmartAccountFactory",
  FACTORY
 );

 const entryPoint =
 await ethers.getContractAt(
  "IEntryPoint",
  ENTRYPOINT
 );

 const smartAccountAddress =
 await factory
   .getFunction("getAddress")(
     owner.address,
     SALT
   );

 console.log(
 "SmartAccount:",
 smartAccountAddress
 );

 const smartAccount =
 await ethers.getContractAt(
  "SmartAccount",
  smartAccountAddress
 );

 const usdc =
 await ethers.getContractAt(
  "IERC20",
  TOKEN
 );

 const approveCallData =
 usdc.interface.encodeFunctionData(
  "approve",
  [
   PAYMASTER,
   ethers.parseUnits(
    "100000",
    6
   )
  ]
 );

 const callData =
 smartAccount.interface.encodeFunctionData(
  "execute",
  [
   TOKEN,
   0,
   approveCallData
  ]
 );

 const nonce =
 await entryPoint.getNonce(
  smartAccountAddress,
  0
 );

 const fee =
 await ethers.provider.getFeeData();

 let userOp: any = {

  sender:
  smartAccountAddress,

  nonce:
  toHex(BigInt(nonce)),

  initCode:
  "0x",

  callData,

  callGasLimit:
  toHex(300000n),

  verificationGasLimit:
  toHex(300000n),

  preVerificationGas:
  toHex(80000n),

  maxFeePerGas:
  toHex(
   BigInt(
    fee.maxFeePerGas!
   )
  ),

  maxPriorityFeePerGas:
  toHex(
   BigInt(
    fee.maxPriorityFeePerGas!
   )
  ),

  paymasterAndData:
  "0x",

  signature:
  "0x"
 };

 const hash =
 await entryPoint.getUserOpHash(
  userOp
 );

 userOp.signature =
 await owner.signMessage(
  ethers.getBytes(hash)
 );

 const res =
 await axios.post(
  SKANDHA_URL,
  {
   jsonrpc: "2.0",
   id: 1,
   method:
   "eth_sendUserOperation",
   params:
   [
    userOp,
    ENTRYPOINT
   ]
  }
 );

 console.log(
 "approve hash:",
 res.data.result
 );
}

main().catch(console.error);

/**
 * npx hardhat run scripts/approvePaymasterERC20.ts --network sepolia

EOA: 0x878344AF84A404439Ea37cFB9b30DeFd7938741C
SmartAccount: 0xD73e74C58C6593B1070bA4561b2fbd2746b3d29b
approve hash: 0x091e038a2444871ffa5b0e622c9208e1cffd479879423fc5d81b2ee4369b5d42
harish@harish-Vostro:~/Desktop/Working_AA_v0.6$ 
 */