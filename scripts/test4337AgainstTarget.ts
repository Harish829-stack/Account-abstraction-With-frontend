

import hre from "hardhat";
import axios from "axios";
import "dotenv/config"
const targetAddress = process.env.TARGET_CONTRACT_ADDRESS;
const ENTRYPOINT = process.env.ENTRY_POINT;
const FACTORY = process.env.FACTORY;
const SALT = 1;
const PAYMASTER_ADDRESS= process.env.PAYMASTER;

const SKANDHA_URL = process.env.SKANDHA_RPC_URL; // local Skandha v1 HTTP
const targetAbi = [
  "function setNumber(uint8 _number) external payable",
  "function number() public view returns (uint8)",
  "event NumberSet(uint8)"
];

function toHex(value: bigint | number) {
  return "0x" + value.toString(16);
}

async function main() {
  const { ethers } = await hre.network.connect();
  const [owner] = await ethers.getSigners();
  const paymasterSigner = owner;

  console.log("EOA:", owner.address);
  const validUntil = Math.floor(Date.now() / 1000) + 600; // 10 minutes---FOR PAYMASTER
  const validAfter = 0;
  const paymasterContract = await ethers.getContractAt("Paymaster", PAYMASTER_ADDRESS!);

  const factory = await ethers.getContractAt("SmartAccountFactory", FACTORY!);
  const smartAccountAddress = await factory.getFunction("getAddress")(
    owner.address,
    SALT
  );
  console.log("SmartAccount:", smartAccountAddress);


  const code = await ethers.provider.getCode(smartAccountAddress);
  if (code === "0x") throw Error("SmartAccount not deployed");

  const entryPoint = await ethers.getContractAt("IEntryPoint", ENTRYPOINT!);

  const deposit = await entryPoint.balanceOf(smartAccountAddress);
  console.log("deposit:", deposit.toString());

  if (deposit === 0n) {
    console.log("depositing 0.01 ETH");
    await entryPoint.depositTo(smartAccountAddress, {
      value: ethers.parseEther("0.01"),
    });
  }

  const smartAccount = await ethers.getContractAt(
    "SmartAccount",
    smartAccountAddress
  );
  const targetContract = new ethers.Contract(targetAddress!, targetAbi, owner);
  const targetFunctionData = targetContract.interface.encodeFunctionData("setNumber", [55]);

  const callData = smartAccount.interface.encodeFunctionData("execute", [
    targetAddress!,
    0,
     targetFunctionData,
  ]);

  const nonce = await entryPoint.getNonce(smartAccountAddress, 0);
  console.log("nonce:", nonce.toString());

  const fee = await ethers.provider.getFeeData();

  // convert BigInts to hex strings
  const userOp = {
    sender: smartAccountAddress,
    nonce: toHex(BigInt(nonce)),
    initCode: "0x",
    callData,
    callGasLimit: toHex(500_000n),
    verificationGasLimit: toHex(500_000n),
    preVerificationGas: toHex(100_000n),
    maxFeePerGas: toHex(BigInt(fee.maxFeePerGas!)),
    maxPriorityFeePerGas: toHex(BigInt(fee.maxPriorityFeePerGas!)),
    paymasterAndData: "0x",
    signature: "0x",
  };
  const paymasterHash = await paymasterContract.getHash(
    { ...userOp, paymasterAndData: PAYMASTER_ADDRESS! },
    validUntil,
    validAfter
  );
  const paymasterSignature = await paymasterSigner.signMessage(ethers.getBytes(paymasterHash));
  // 4. Pack the paymasterAndData field
  // [20 bytes Address][6 bytes validUntil][6 bytes validAfter][Dynamic Signature]
  const encodedTimeBounds = ethers.solidityPacked(
    ["uint48", "uint48"],
    [validUntil, validAfter]
  );

  userOp.paymasterAndData = ethers.concat([
    PAYMASTER_ADDRESS!,
    encodedTimeBounds,
    paymasterSignature
  ]);
  // --- END PAYMASTER LOGIC ---

  // 5. NOW generate the UserOp Hash and Account Signature
  const userOpHash = await entryPoint.getUserOpHash(userOp);
  const signature = await owner.signMessage(ethers.getBytes(userOpHash));
  userOp.signature = signature;



  console.log("signed");

  const currentNumber = await targetContract.number();
  console.log("Current number on target contract:", currentNumber.toString());

  // send UserOp via axios to local Skandha
  try {
    const res = await axios.post(SKANDHA_URL!, {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_sendUserOperation",
      params: [userOp, ENTRYPOINT],
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    console.log("UserOp sent to Skandha:", res.data.result);
  } catch (err) {
    console.error("Error sending UserOp:", err);
  }


//number will be updated in target contract
//you can see in next ops or write another script to check
}

main().catch(console.error);




/**
 * npx hardhat run scripts/test4337WithPaymaster.ts --network sepolia

EOA: 0x878344AF84A404439Ea37cFB9b30DeFd7938741C
SmartAccount: 0xD73e74C58C6593B1070bA4561b2fbd2746b3d29b
deposit: 9999444974541300
nonce: 4
signed
UserOp sent to Skandha: 0x4b9d7a824a8388637d44bf8bf09486f70c08c023120cc24d348e4b3f134494cb
harish@harish-Vostro:~/Desktop/v0.6$ 
 */