import hre from "hardhat"

async function main() {
  // @ts-ignore
  const { ethers } = await hre.network.connect();
  console.log("Starting Paymaster CREATE3 deterministic deployment...");

  const [deployer] = await ethers.getSigners();
  console.log(`Deploying with account: ${deployer.address}`);

  // Use the already deployed CREATE3Factory address from deployCreate3.ts
  const create3FactoryAddress = "0xb31fd259D799Fa4AdAdc64726B75E6195D635C59";
  
  // Note: This script assumes CREATE3Factory is already deployed via the main script.
  const create3Factory = await ethers.getContractAt("CREATE3Factory", create3FactoryAddress, deployer);

  // Deploy MultiTokenPaymaster via CREATE3
  console.log("\n--- Deploying MultiTokenPaymaster ---");
  const entryPointAddress = "0x0000000071727De22E5E9d8BAf0edAc6f37da032"; // v0.7 EntryPoint
  const nativeUsdFeedSepolia = "0x694AA1769357215DE4FAC081bf1f309aDC325306"; // ETH/USD

  const PaymasterArtifact = await ethers.getContractFactory("contracts/Erc20Paymaster.sol:MultiTokenPaymaster");
  
  const chainId = (await ethers.provider.getNetwork()).chainId;
  
  let nativeUsdFeed;
  if (chainId === 80002n) {
    // We are on Amoy, deploy MockAggregator for Native(POL)/USD
    console.log("Deploying MockAggregator for POL/USD on Amoy...");
    const MockAggregatorArtifact = await ethers.getContractFactory("MockAggregator");
    // $0.50 with 8 decimals = 0.50 * 10^8 = 50000000
    const mockFeed = await MockAggregatorArtifact.deploy(50000000n);
    await mockFeed.waitForDeployment();
    nativeUsdFeed = await mockFeed.getAddress();
    console.log("MockAggregator deployed at:", nativeUsdFeed);
  } else {
    // Sepolia or others
    nativeUsdFeed = nativeUsdFeedSepolia; 
  }
  
  const paymasterTx = await PaymasterArtifact.getDeployTransaction(deployer.address, entryPointAddress, nativeUsdFeed);
  const paymasterCreationCode = paymasterTx.data;

  const paymasterSalt = ethers.id("MULTI_TOKEN_PAYMASTER_SALT_V5");
  const paymasterExpectedAddress = await create3Factory.getDeployed(deployer.address, paymasterSalt);

  const codeAtPaymaster = await ethers.provider.getCode(paymasterExpectedAddress);
  if (codeAtPaymaster === "0x") {
    console.log(`Deploying MultiTokenPaymaster to ${paymasterExpectedAddress}...`);
    const txData = create3Factory.interface.encodeFunctionData("deploy", [paymasterSalt, paymasterCreationCode]);
    const tx = await deployer.sendTransaction({
      to: create3FactoryAddress,
      data: txData
    });
    await tx.wait();
    console.log("MultiTokenPaymaster deployed!");
  } else {
    console.log(`MultiTokenPaymaster already exists at ${paymasterExpectedAddress}`);
  }

  console.log("\nDeployment Complete!");
  console.log("MultiTokenPaymaster:", paymasterExpectedAddress);

  const fs = require("fs");
  const path = require("path");
  const envPath = path.resolve(process.cwd(), ".env");
  let envContent = fs.readFileSync(envPath, "utf-8");
  if (envContent.includes("MULTITOKEN_PAYMASTER=")) {
    envContent = envContent.replace(/MULTITOKEN_PAYMASTER=.*/, `MULTITOKEN_PAYMASTER="${paymasterExpectedAddress}"`);
  } else {
    envContent += `\nMULTITOKEN_PAYMASTER="${paymasterExpectedAddress}"`;
  }
  fs.writeFileSync(envPath, envContent);

  const frontendEnvPath = path.resolve(process.cwd(), "frontend/.env");
  let fEnvContent = fs.readFileSync(frontendEnvPath, "utf-8");
  if (fEnvContent.includes("VITE_MULTITOKEN_PAYMASTER=")) {
    fEnvContent = fEnvContent.replace(/VITE_MULTITOKEN_PAYMASTER=.*/, `VITE_MULTITOKEN_PAYMASTER="${paymasterExpectedAddress}"`);
  } else {
    fEnvContent += `\nVITE_MULTITOKEN_PAYMASTER="${paymasterExpectedAddress}"`;
  }
  fs.writeFileSync(frontendEnvPath, fEnvContent);
  console.log(".env files updated with new Paymaster Address!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


/**
 * npx hardhat run scripts/deployPaymasterOnly.ts --network amoy


Starting Paymaster CREATE3 deterministic deployment...
Deploying with account: 0x878344AF84A404439Ea37cFB9b30DeFd7938741C

--- Deploying MultiTokenPaymaster ---
Deploying MockAggregator for POL/USD on Amoy...
MockAggregator deployed at: 0xc796c365AA70EA6C72cFaA888E4121833EB5a197
Deploying MultiTokenPaymaster to 0x51D0de56Ef2d9a8d13A1c81364992FD89f38C762...
MultiTokenPaymaster deployed!

Deployment Complete!
MultiTokenPaymaster: 0x51D0de56Ef2d9a8d13A1c81364992FD89f38C762
jatinsharma@Akshay-709-M1-C07JY0FDQ6P0 Account-abstraction-With-frontend % 
 */