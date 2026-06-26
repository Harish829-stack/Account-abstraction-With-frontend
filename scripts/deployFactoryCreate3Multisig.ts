import hre from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  // @ts-ignore
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();
  const CREATE3_FACTORY_ADDRESS = "0xb31fd259D799Fa4AdAdc64726B75E6195D635C59";

  console.log("Deploying New Factory via CREATE3 deterministically with account:", deployer.address);

  const create3Factory = await ethers.getContractAt("CREATE3Factory", CREATE3_FACTORY_ADDRESS, deployer);

  // Helper function to deploy and/or get address
  async function deployViaCreate3(contractName: string, saltString: string, args: any[] = []) {
    const salt = ethers.id(saltString);
    const expectedAddress = await create3Factory.getDeployed(deployer.address, salt);
    
    // Check if deployed
    const code = await ethers.provider.getCode(expectedAddress);
    if (code === "0x") {
      const Factory = await ethers.getContractFactory(contractName);
      const tx = await Factory.getDeployTransaction(...args);
      const creationCode = tx.data;
      
      console.log(`Deploying ${contractName} to ${expectedAddress}...`);
      const deployTx = await create3Factory.deploy(salt, creationCode);
      await deployTx.wait();
      console.log(`${contractName} deployed successfully!`);
    } else {
      console.log(`${contractName} already exists at ${expectedAddress}`);
    }
    
    return expectedAddress;
  }

  // Use the exact same pre-calculated addresses from the original script
  const k1Salt = ethers.id("NEXUS_K1_VALIDATOR_V1");
  const k1Expected = await create3Factory.getDeployed(deployer.address, k1Salt);

  const nexusSalt = ethers.id("NEXUS_IMPLEMENTATION_V1");
  const nexusExpected = await create3Factory.getDeployed(deployer.address, nexusSalt);

  const bootstrapSalt = ethers.id("NEXUS_BOOTSTRAP_V1");
  const bootstrapExpected = await create3Factory.getDeployed(deployer.address, bootstrapSalt);

  // The new Multisig Proxy Address (get from env or default to your deployed proxy)
  const MULTISIG_PROXY = process.env.PROXYV1 || "0x9165d460fB04aae3975d8E1b12af13d4Da32eEaE";

  console.log("\n=================================");
  console.log("Using Existing Deterministic Addresses:");
  console.log("Nexus Implementation:", nexusExpected);
  console.log("K1Validator:", k1Expected);
  console.log("NexusBootstrap:", bootstrapExpected);
  console.log("Multisig Owner:", MULTISIG_PROXY);
  console.log("=================================\n");

  // Deploy NEW K1ValidatorFactory with a NEW SALT, but pointing to existing addresses
  // We use V5 salt to get a fresh deterministic address across all chains
  const factoryExpected = await deployViaCreate3("K1ValidatorFactory", "NEXUS_K1_FACTORY_V5_MULTISIG", [
    nexusExpected,
    MULTISIG_PROXY, // Factory owner is now the Multisig!
    k1Expected,
    bootstrapExpected,
    ethers.ZeroAddress
  ]);

  console.log("\n✅ New Factory deployed at deterministic address:", factoryExpected);
  console.log("Don't forget to update VITE_FACTORY in your frontend .env!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

/**
 *  npx hardhat run scripts/deployFactoryCreate3Multisig.ts --network amoy && npx hardhat run scripts/deployFactoryCreate3Multisig.ts --network sepolia

[dotenv@17.3.1] injecting env (0) from .env -- tip: ⚙️  override existing env vars with { override: true }
Deploying New Factory via CREATE3 deterministically with account: 0x878344AF84A404439Ea37cFB9b30DeFd7938741C

=================================
Using Existing Deterministic Addresses:
Nexus Implementation: 0xD44bB5500FF30B30Ea2488ca3Df9c27bb76A4498
K1Validator: 0x6e003A2a991ebad2978666A74C5b1AfeA4D3fB3c
NexusBootstrap: 0x88727A0b41e236459476235119A219e9872A0d19
Multisig Owner: 0x9165d460fB04aae3975d8E1b12af13d4Da32eEaE
=================================

Deploying K1ValidatorFactory to 0x9Bd9388594F25a37BCa80c4DA83274bBFf555786...
K1ValidatorFactory deployed successfully!

✅ New Factory deployed at deterministic address: 0x9Bd9388594F25a37BCa80c4DA83274bBFf555786
Don't forget to update VITE_FACTORY in your frontend .env!

[dotenv@17.3.1] injecting env (0) from .env -- tip: ⚙️  enable debug logging with { debug: true }
Deploying New Factory via CREATE3 deterministically with account: 0x878344AF84A404439Ea37cFB9b30DeFd7938741C

=================================
Using Existing Deterministic Addresses:
Nexus Implementation: 0xD44bB5500FF30B30Ea2488ca3Df9c27bb76A4498
K1Validator: 0x6e003A2a991ebad2978666A74C5b1AfeA4D3fB3c
NexusBootstrap: 0x88727A0b41e236459476235119A219e9872A0d19
Multisig Owner: 0x9165d460fB04aae3975d8E1b12af13d4Da32eEaE
=================================

Deploying K1ValidatorFactory to 0x9Bd9388594F25a37BCa80c4DA83274bBFf555786...
K1ValidatorFactory deployed successfully!

✅ New Factory deployed at deterministic address: 0x9Bd9388594F25a37BCa80c4DA83274bBFf555786
Don't forget to update VITE_FACTORY in your frontend .env!
jatinsharma@Akshay-709-M1-C07JY0FDQ6P0 Account-abstraction-With-frontend % 
 */
