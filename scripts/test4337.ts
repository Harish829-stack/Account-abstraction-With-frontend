// import hre from "hardhat";

// const ENTRYPOINT =
// process.env.ENTRY_POINT;

// const FACTORY =
// process.env.FACTORY;

// const SALT = 1;

// async function main() {

//  const { ethers } =
//    await hre.network.connect();

//  const [owner] =
//    await ethers.getSigners();

//  console.log("EOA:", owner.address);

//  /*
//  factory instance
//  */

//  const factory =
//    await ethers.getContractAt(
//      "SmartAccountFactory",
//      FACTORY!
//    );

//  /*
//  get smart account address
//  */

//  const smartAccountAddress =
//    await factory
//    .getFunction("getAddress")(
//      owner.address,
//      SALT
//    );

//  console.log(
//    "SmartAccount:",
//    smartAccountAddress
//  );

//  /*
//  check deployed
//  */

//  const code =
//    await ethers.provider.getCode(
//      smartAccountAddress
//    );

//  if (code === "0x") {

//    throw Error(
//      "SmartAccount not deployed"
//    );

//  }

//  /*
//  entrypoint
//  */

//  const entryPoint =
//    await ethers.getContractAt(
//      "IEntryPoint",
//      ENTRYPOINT!
//    );

//  /*
//  ensure deposit exists
//  */

//  const deposit =
//    await entryPoint.balanceOf(
//      smartAccountAddress
//    );

//  console.log(
//    "deposit:",
//    deposit.toString()
//  );

//  if (deposit === 0n) {

//    console.log(
//      "depositing 0.01 ETH"
//    );

//    await entryPoint.depositTo(
//      smartAccountAddress,
//      {
//        value:
//        ethers.parseEther("0.01")
//      }
//    );

//  }

//  /*
//  encode call
//  */

//  const smartAccount =
//    await ethers.getContractAt(
//      "SmartAccount",
//      smartAccountAddress
//    );

//  const callData =
//    smartAccount.interface
//    .encodeFunctionData(
//      "execute",
//      [
//        owner.address,
//        0,
//        "0x"
//      ]
//    );

//  /*
//  nonce
//  */

//  const nonce =
//    await entryPoint.getNonce(
//      smartAccountAddress,
//      0
//    );

//  console.log(
//    "nonce:",
//    nonce.toString()
//  );

//  /*
//  fees
//  */

//  const fee =
//    await ethers.provider
//    .getFeeData();

//  /*
//  userOp
//  */

//  const userOp = {

//    sender:
//      smartAccountAddress,

//    nonce,

//    initCode: "0x",

//    callData,

//    callGasLimit: 500000,

//    verificationGasLimit:
//      500000,

//    preVerificationGas:
//      100000,

//    maxFeePerGas:
//      fee.maxFeePerGas!,

//    maxPriorityFeePerGas:
//      fee.maxPriorityFeePerGas!,

//    paymasterAndData:
//      "0x",

//    signature: "0x"

//  };

//  /*
//  sign
//  */

//  const userOpHash =
//    await entryPoint.getUserOpHash(
//      userOp
//    );

//  const signature =
//    await owner.signMessage(
//      ethers.getBytes(
//        userOpHash
//      )
//    );

//  userOp.signature =
//    signature;

//  console.log("signed");

//  /*
//  send
//  */

//  const tx =
//    await entryPoint.handleOps(
//      [userOp],
//      owner.address
//    );

//  await tx.wait();

//  console.log(
//    "UserOp SUCCESS"
//  );

// }

// main().catch(console.error);


/**
 * 
harish@harish-Vostro:~/Desktop/v0.6$ npx hardhat run scripts/test4337.ts --network sepolia

EOA: 0x878344AF84A404439Ea37cFB9b30DeFd7938741C
SmartAccount: 0xD73e74C58C6593B1070bA4561b2fbd2746b3d29b
deposit: 10000000000000000
nonce: 0
signed
UserOp SUCCESS
harish@harish-Vostro:~/Desktop/v0.6$ 
 */













import hre from "hardhat";
import axios from "axios";

const ENTRYPOINT = process.env.ENTRY_POINT;
const FACTORY = process.env.FACTORY;
const SALT = 1;

const SKANDHA_URL = process.env.SKANDHA_RPC_URL; // local Skandha v1 HTTP

function toHex(value: bigint | number) {
  return "0x" + value.toString(16);
}

async function main() {
  const { ethers } = await hre.network.connect();
  const [owner] = await ethers.getSigners();

  console.log("EOA:", owner.address);

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

  const callData = smartAccount.interface.encodeFunctionData("execute", [
    owner.address,
    0,
    "0x",
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

  const userOpHash = await entryPoint.getUserOpHash(userOp);
  const signature = await owner.signMessage(ethers.getBytes(userOpHash));
  userOp.signature = signature;

  console.log("signed");

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
}

main().catch(console.error);