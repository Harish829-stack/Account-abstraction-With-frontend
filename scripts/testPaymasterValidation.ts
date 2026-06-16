import hre from "hardhat";
import "dotenv/config";
import { ethers } from "hardhat";

async function main() {
  const paymasterAddress = process.env.VITE_MULTITOKEN_PAYMASTER || process.env.MULTITOKEN_PAYMASTER || process.env.PAYMASTER;
  const ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

  console.log(`Testing Paymaster: ${paymasterAddress}`);

  // Impersonate EntryPoint
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [ENTRY_POINT],
  });

  // Fund EntryPoint so it can send transactions
  const [signer] = await ethers.getSigners();
  await signer.sendTransaction({
    to: ENTRY_POINT,
    value: ethers.parseEther("1.0")
  });

  const entryPointSigner = await ethers.getSigner(ENTRY_POINT);
  
  const paymaster = await ethers.getContractAt(
    "contracts/Erc20Paymaster.sol:MultiTokenPaymaster",
    paymasterAddress,
    entryPointSigner
  );

  const userOp = {
    sender: "0x68b70CD8277b3379931c222282F9F78831076363",
    nonce: "0x11",
    initCode: "0x",
    callData: "0x", // Mock calldata
    accountGasLimits: ethers.concat([
        ethers.zeroPadValue("0x542a", 16),
        ethers.zeroPadValue("0xf4fb", 16)
    ]),
    preVerificationGas: "0xd7b1",
    gasFees: ethers.concat([
        ethers.zeroPadValue("0xdce9bae0", 16),
        ethers.zeroPadValue("0x59682f00", 16)
    ]),
    paymasterAndData: ethers.concat([
        paymasterAddress,
        ethers.zeroPadValue("0x249f0", 16),
        ethers.zeroPadValue("0x249f0", 16),
        "0x08210f9170f89ab7658f0b5e3ff39b0e03c594d4" // EURC
    ]),
    signature: "0x"
  };

  const userOpHash = ethers.id("test");

  const maxCost = ethers.parseEther("0.005"); // Simulate a maxCost

  console.log("Simulating validatePaymasterUserOp for EURC...");
  try {
    await paymaster.validatePaymasterUserOp(userOp, userOpHash, maxCost, { gasLimit: 2000000 });
    console.log("Validation Succeeded!");
  } catch (error: any) {
    console.error("Validation Failed!");
    console.error(error.message);
  }

  console.log("\nSimulating validatePaymasterUserOp for USDC...");
  userOp.paymasterAndData = ethers.concat([
        paymasterAddress,
        ethers.zeroPadValue("0x249f0", 16),
        ethers.zeroPadValue("0x249f0", 16),
        "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" // USDC
  ]);

  try {
    await paymaster.validatePaymasterUserOp(userOp, userOpHash, maxCost, { gasLimit: 2000000 });
    console.log("Validation Succeeded!");
  } catch (error: any) {
    console.error("Validation Failed!");
    console.error(error.message);
  }
}

main().catch(console.error);
