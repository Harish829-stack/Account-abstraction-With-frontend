
//before running this script- run approvePaymasterERC20 ,because the paymaster will pull 
//erc20 token from smartAccount,when it will execute userOp
// and before approving,transfer usdc  tokens and some amount to SmartAccount

import hre from "hardhat";
import axios from "axios";
import "dotenv/config";

const ENTRYPOINT = process.env.ENTRY_POINT!;
const FACTORY = process.env.FACTORY!;
const PAYMASTER_ADDRESS = process.env.ERC20PAYMASTER!; 

const SALT = 1;
const SKANDHA_URL = "http://127.0.0.1:14337/rpc";

function toHex(value: bigint | number) {
  return "0x" + value.toString(16);
}

async function main() {

  const { ethers } = await hre.network.connect();
  const [owner] = await ethers.getSigners();

  console.log("EOA:", owner.address);

  const paymasterSigner = owner;

  const validUntil =
    Math.floor(Date.now() / 1000) + 600;

  const validAfter = 0;

  // contracts
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

  const paymaster =
    await ethers.getContractAt(
      "ERC20Paymaster",
      PAYMASTER_ADDRESS
    );

  // smart account
  const smartAccountAddress =
    await factory.getFunction("getAddress")(
      owner.address,
      SALT
    );

  console.log(
    "SmartAccount:",
    smartAccountAddress
  );

  const code =
    await ethers.provider.getCode(
      smartAccountAddress
    );

  if (code === "0x")
    throw Error(
      "SmartAccount not deployed"
    );

  // ensure smart account has deposit
  const deposit =
    await entryPoint.balanceOf(
      smartAccountAddress
    );

  console.log(
    "deposit:",
    deposit.toString()
  );

  if (deposit === 0n) {

    console.log(
      "depositing 0.01 ETH"
    );

    await entryPoint.depositTo(
      smartAccountAddress,
      {
        value:
          ethers.parseEther(
            "0.01"
          )
      }
    );
  }

  const smartAccount =
    await ethers.getContractAt(
      "SmartAccount",
      smartAccountAddress
    );

  // simple tx
  const callData =
    smartAccount.interface.encodeFunctionData(
      "execute",
      [
        owner.address,
        0,
        "0x"
      ]
    );

  const nonce =
    await entryPoint.getNonce(
      smartAccountAddress,
      0
    );

  console.log(
    "nonce:",
    nonce.toString()
  );

  const fee =
    await ethers.provider.getFeeData();

  // build base userOp
  let userOp: any = {

    sender:
      smartAccountAddress,

    nonce:
      toHex(BigInt(nonce)),

    initCode:
      "0x",

    callData,

    callGasLimit:
      toHex(500000n),

    verificationGasLimit:
      toHex(500000n),

    preVerificationGas:
      toHex(100000n),

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

  // -------- PAYMASTER SIGNATURE --------

  // temporary paymasterAndData for hashing
  const tempUserOp = {
    ...userOp,
    paymasterAndData:
      PAYMASTER_ADDRESS
  };

  const paymasterHash =
    await paymaster.getHash(
      tempUserOp,
      validUntil,
      validAfter
    );

  const paymasterSignature =
    await paymasterSigner.signMessage(
      ethers.getBytes(
        paymasterHash
      )
    );

  // pack time bounds
  const encodedTimeBounds =
    ethers.solidityPacked(

      [
        "uint48",
        "uint48"
      ],

      [
        validUntil,
        validAfter
      ]
    );

  userOp.paymasterAndData =
    ethers.concat([

      PAYMASTER_ADDRESS,

      encodedTimeBounds,

      paymasterSignature

    ]);

  // -------- ACCOUNT SIGNATURE --------

  const userOpHash =
    await entryPoint.getUserOpHash(
      userOp
    );

  const signature =
    await owner.signMessage(

      ethers.getBytes(
        userOpHash
      )

    );

  userOp.signature =
    signature;

  console.log(
    "UserOp signed"
  );

  // send to skandha
  const res =
    await axios.post(

      SKANDHA_URL,

      {

        jsonrpc:
          "2.0",

        id:
          1,

        method:
          "eth_sendUserOperation",

        params:

          [
            userOp,
            ENTRYPOINT
          ]

      },

      {

        headers:

          {

            "Content-Type":
              "application/json"

          }

      }

    );

  console.log(
    "UserOp hash:",
    res.data.result
  );
}

main()
.catch(console.error);



/**
 *  npx hardhat run scripts/testWithErc20.ts --network sepolia

EOA: 0x878344AF84A404439Ea37cFB9b30DeFd7938741C
SmartAccount: 0xD73e74C58C6593B1070bA4561b2fbd2746b3d29b
deposit: 9998912142685740
nonce: 11
UserOp signed
UserOp hash: 0xf19669a60bfb9ddb7a87be04070b7b68d75ed0fcd485b12da037d2c1af729d98
 */