import hre from "hardhat";
import "dotenv/config";

async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners(); // The deployer will act as the Bundler for the UserOp

  console.log("Executing with Deployer:", deployer.address);

  const smartAccountAddress = process.env.SMART_ACCOUNT_ADDRESS;
  if (!smartAccountAddress) throw new Error("Missing SMART_ACCOUNT_ADDRESS in environment.");

  // 1. Configuration
  // Put the validator address that was deployed in the previous step
  const recoveryValidatorAddr = "0x9F610079905994f44968428fdA4c0a806f8C99df";
  
  // The address that will become the new owner of the smart account
  const newOwnerAddress = "0x8375c615DEdf492B1B2036c786EDBcfB0801c3cb"; 
  if (!newOwnerAddress) {
      throw new Error("Please specify the NEW_OWNER_ADDRESS in your .env file or modify the script.");
  }
  
  // 2. Guardian Wallets
  // To approve the recovery, we must send a transaction from the guardian's address.
  // Because you used dummy addresses during installation, you do not have their private keys.
  // You will need to reinstall the module with real guardian addresses to execute this successfully.
  const guardian1Pk = process.env.GUARDIAN_1_PK;
  const guardian2Pk = process.env.GUARDIAN_2_PK;
  
  if (!guardian1Pk || !guardian2Pk) {
    console.warn("\n⚠️GUARDIAN_1_PK or GUARDIAN_2_PK not found in env.");
    console.warn("Since this script needs to send transactions from the guardians, you MUST provide their private keys.");
    console.warn("You also MUST have installed the validator using the public addresses of these keys!");
    console.warn("Exiting script...\n");
    return;
  }

  const guardianOne = new ethers.Wallet(guardian1Pk, ethers.provider);
  const guardianTwo = new ethers.Wallet(guardian2Pk, ethers.provider);

  console.log(`\n--- Step 1: Guardians Approve Recovery ---`);
  const recoveryValidator = await ethers.getContractAt("SocialRecoveryValidator", recoveryValidatorAddr);
  
  const hasApp1 = await recoveryValidator.hasApproved(smartAccountAddress, newOwnerAddress, guardianOne.address);
  if (!hasApp1) {
      console.log(`Guardian 1 (${guardianOne.address}) approving recovery...`);
      let tx = await recoveryValidator.connect(guardianOne).approveRecovery(smartAccountAddress, newOwnerAddress);
      await tx.wait();
      console.log("Guardian 1 approved.");
  } else {
      console.log(`Guardian 1 (${guardianOne.address}) already approved.`);
  }

  const hasApp2 = await recoveryValidator.hasApproved(smartAccountAddress, newOwnerAddress, guardianTwo.address);
  if (!hasApp2) {
      console.log(`Guardian 2 (${guardianTwo.address}) approving recovery...`);
      let tx = await recoveryValidator.connect(guardianTwo).approveRecovery(smartAccountAddress, newOwnerAddress);
      await tx.wait();
      console.log("Guardian 2 approved.");
  } else {
      console.log(`Guardian 2 (${guardianTwo.address}) already approved.`);
  }

  const canRecover = await recoveryValidator.canRecover(smartAccountAddress, newOwnerAddress);
  console.log("Can recover now?", canRecover);
  
  if (!canRecover) {
      console.log("Threshold not met or delay hasn't passed.");
      return;
  }

  console.log(`\n--- Step 2: Construct and Send UserOperation ---`);
  const account = await ethers.getContractAt("ModularImplementation", smartAccountAddress);
  const entryPointAddress = process.env.ENTRY_POINT || "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
  const entryPoint = await ethers.getContractAt("IEntryPoint", entryPointAddress);

  // A. Prepare callData (execute changeOwner)
  const callData = account.interface.encodeFunctionData("changeOwner", [newOwnerAddress]);

  // B. Prepare the ERC-7579 modular signature: validator_address + abi.encode(newOwner)
  const signature = ethers.concat([
    recoveryValidatorAddr,
    ethers.AbiCoder.defaultAbiCoder().encode(["address"], [newOwnerAddress])
  ]);

  // C. Set UserOp gas limits
  // We use reduced defaults here to avoid "prefund failed" due to high required deposit
  const verificationGasLimit = 150000n;
  const callGasLimit = 100000n;
  const maxPriorityFeePerGas = 1500000000n;
  const maxFeePerGas = 5000000000n; // 5 gwei

  const accountGasLimits = ethers.concat([
    ethers.zeroPadValue(ethers.toBeHex(verificationGasLimit), 16),
    ethers.zeroPadValue(ethers.toBeHex(callGasLimit), 16)
  ]);

  const gasFees = ethers.concat([
    ethers.zeroPadValue(ethers.toBeHex(maxPriorityFeePerGas), 16),
    ethers.zeroPadValue(ethers.toBeHex(maxFeePerGas), 16)
  ]);
  
  const nonce = await entryPoint.getNonce(smartAccountAddress, 0);

  const userOp = {
    sender: smartAccountAddress,
    nonce: nonce,
    initCode: "0x",
    callData: callData,
    accountGasLimits: accountGasLimits,
    preVerificationGas: 50000n,
    gasFees: gasFees,
    paymasterAndData: "0x",
    signature: signature
  };

  console.log("Simulating UserOperation via staticCall...");
  
  const deposit = await entryPoint.balanceOf(smartAccountAddress);
  if (deposit === 0n) {
      console.warn("\n⚠️ WARNING: Smart Account has 0 ETH deposited in EntryPoint!");
      console.warn("The UserOperation will likely fail with 'AA21 didn't pay prefund'.");
      console.warn("Please deposit ETH into the EntryPoint for the smart account first.\n");
  }

  try {
      await entryPoint.getFunction("handleOps").staticCall([userOp], deployer.address);
      console.log("Simulation successful! Sending actual transaction...");
      
      const handleOpsTx = await entryPoint.handleOps([userOp], deployer.address);
      await handleOpsTx.wait();
      console.log("✅ Recovery complete! Ownership transferred to:", newOwnerAddress);
  } catch (error: any) {
      console.error("\n❌ Failed to execute UserOperation:");
      if (error.data) {
          console.error("Revert Data:", error.data);
          try {
              const decodedError = entryPoint.interface.parseError(error.data);
              console.error("Decoded Error:", decodedError?.name, decodedError?.args);
          } catch(e) {
              console.error("Could not decode custom error from EntryPoint.");
          }
      } else {
          console.error("Revert Reason:", error.reason || error.message);
      }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


/**
 * jatinsharma@Akshay-709-M1-C07JY0FDQ6P0 Modular_SA % npx hardhat run scripts/executeRecovery.ts --network sepolia


Executing with Deployer: 0x878344AF84A404439Ea37cFB9b30DeFd7938741C

--- Step 1: Guardians Approve Recovery ---
Guardian 1 (0x436aE29537d69235089508dd60ac9c389Dcc0A68) already approved.
Guardian 2 (0x5e07EA93960BbE67251758FaE191B464CeaF41bb) already approved.
Can recover now? true

--- Step 2: Construct and Send UserOperation ---
Simulating UserOperation via staticCall...
Simulation successful! Sending actual transaction...
✅ Recovery complete! Ownership transferred to: 0x8375c615DEdf492B1B2036c786EDBcfB0801c3cb
jatinsharma@Akshay-709-M1-C07JY0FDQ6P0 Modular_SA % 
 */