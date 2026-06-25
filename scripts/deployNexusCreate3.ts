import hre from "hardhat";

async function main() {
  // @ts-ignore
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();
  const ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
  const CREATE3_FACTORY_ADDRESS = "0xb31fd259D799Fa4AdAdc64726B75E6195D635C59";

  console.log("Deploying Nexus via CREATE3 deterministically with account:", deployer.address);

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

  // Pre-calculate addresses for those needed in constructors
  const k1Salt = ethers.id("NEXUS_K1_VALIDATOR_V1");
  const k1Expected = await create3Factory.getDeployed(deployer.address, k1Salt);

  const nexusSalt = ethers.id("NEXUS_IMPLEMENTATION_V1");
  const nexusExpected = await create3Factory.getDeployed(deployer.address, nexusSalt);

  const sessionKeySalt = ethers.id("NEXUS_SESSION_KEY_V1");
  const sessionKeyExpected = await create3Factory.getDeployed(deployer.address, sessionKeySalt);

  const bootstrapSalt = ethers.id("NEXUS_BOOTSTRAP_V1");
  const bootstrapExpected = await create3Factory.getDeployed(deployer.address, bootstrapSalt);

  // 1. Deploy K1Validator
  await deployViaCreate3("K1Validator", "NEXUS_K1_VALIDATOR_V1", []);

  // 2. Deploy Nexus implementation
  await deployViaCreate3("Nexus", "NEXUS_IMPLEMENTATION_V1", [
    ENTRY_POINT,
    k1Expected,
    deployer.address // Must be at least 20 bytes for K1Validator.onInstall
  ]);

  // 3. Deploy SessionKeyValidator
  await deployViaCreate3("SessionKeyValidator", "NEXUS_SESSION_KEY_V1", []);

  // 4. Deploy NexusBootstrap
  await deployViaCreate3("NexusBootstrap", "NEXUS_BOOTSTRAP_V1", [
    sessionKeyExpected,
    "0x"
  ]);

  // 5. Deploy K1ValidatorFactory
  const factoryExpected = await deployViaCreate3("K1ValidatorFactory", "NEXUS_K1_FACTORY_V1", [
    nexusExpected,
    deployer.address,
    k1Expected,
    bootstrapExpected,
    ethers.ZeroAddress
  ]);

  // 6. Deploy SocialRecoveryValidator
  const socialExpected = await deployViaCreate3("SocialRecoveryValidator", "NEXUS_SOCIAL_RECOVERY_V1", []);

  // 7. Deploy WebAuthnValidator
  const webAuthnExpected = await deployViaCreate3("WebAuthnValidator", "NEXUS_WEBAUTHN_V1", []);

  console.log("\n=================================");
  console.log("Deterministic Addresses:");
  console.log("K1Validator:", k1Expected);
  console.log("Nexus Implementation:", nexusExpected);
  console.log("SessionKeyValidator:", sessionKeyExpected);
  console.log("NexusBootstrap:", bootstrapExpected);
  console.log("K1ValidatorFactory:", factoryExpected);
  console.log("SocialRecoveryValidator:", socialExpected);
  console.log("WebAuthnValidator:", webAuthnExpected);
  console.log("=================================\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
/*
npx hardhat run scripts/deployNexusCreate3.ts --network amoy

Deploying Nexus via CREATE3 deterministically with account: 0x878344AF84A404439Ea37cFB9b30DeFd7938741C
Deploying K1Validator to 0x6e003A2a991ebad2978666A74C5b1AfeA4D3fB3c...
K1Validator deployed successfully!
Deploying Nexus to 0xD44bB5500FF30B30Ea2488ca3Df9c27bb76A4498...
Nexus deployed successfully!
Deploying SessionKeyValidator to 0xa5d0847AEb41866EcFEB8BAF0c9163566aD9E373...
SessionKeyValidator deployed successfully!
Deploying NexusBootstrap to 0x88727A0b41e236459476235119A219e9872A0d19...
NexusBootstrap deployed successfully!
Deploying K1ValidatorFactory to 0x17249378E661929b73277c9E5B815716b9bb2D1B...
K1ValidatorFactory deployed successfully!
Deploying SocialRecoveryValidator to 0xcc9bA7b65f6E5468608F7803Edbab5348Cd3A9Ff...
SocialRecoveryValidator deployed successfully!
Deploying WebAuthnValidator to 0xe89c5d5468Cd3F6d700C7Aaed3Ae3a867C6944cE...
WebAuthnValidator deployed successfully!

=================================
Deterministic Addresses:
K1Validator: 0x6e003A2a991ebad2978666A74C5b1AfeA4D3fB3c
Nexus Implementation: 0xD44bB5500FF30B30Ea2488ca3Df9c27bb76A4498
SessionKeyValidator: 0xa5d0847AEb41866EcFEB8BAF0c9163566aD9E373
NexusBootstrap: 0x88727A0b41e236459476235119A219e9872A0d19
K1ValidatorFactory: 0x17249378E661929b73277c9E5B815716b9bb2D1B
SocialRecoveryValidator: 0xcc9bA7b65f6E5468608F7803Edbab5348Cd3A9Ff
WebAuthnValidator: 0xe89c5d5468Cd3F6d700C7Aaed3Ae3a867C6944cE
=================================

jatinsharma@Akshay-709-M1-C07JY0FDQ6P0 Account-abstraction-With-frontend % 



 npx hardhat run scripts/deployNexusCreate3.ts --network sepolia

Deploying Nexus via CREATE3 deterministically with account: 0x878344AF84A404439Ea37cFB9b30DeFd7938741C
Deploying K1Validator to 0x6e003A2a991ebad2978666A74C5b1AfeA4D3fB3c...
K1Validator deployed successfully!
Deploying Nexus to 0xD44bB5500FF30B30Ea2488ca3Df9c27bb76A4498...
Nexus deployed successfully!
Deploying SessionKeyValidator to 0xa5d0847AEb41866EcFEB8BAF0c9163566aD9E373...
SessionKeyValidator deployed successfully!
Deploying NexusBootstrap to 0x88727A0b41e236459476235119A219e9872A0d19...
NexusBootstrap deployed successfully!
Deploying K1ValidatorFactory to 0x17249378E661929b73277c9E5B815716b9bb2D1B...
K1ValidatorFactory deployed successfully!
Deploying SocialRecoveryValidator to 0xcc9bA7b65f6E5468608F7803Edbab5348Cd3A9Ff...
SocialRecoveryValidator deployed successfully!
Deploying WebAuthnValidator to 0xe89c5d5468Cd3F6d700C7Aaed3Ae3a867C6944cE...
WebAuthnValidator deployed successfully!

=================================
Deterministic Addresses:
K1Validator: 0x6e003A2a991ebad2978666A74C5b1AfeA4D3fB3c
Nexus Implementation: 0xD44bB5500FF30B30Ea2488ca3Df9c27bb76A4498
SessionKeyValidator: 0xa5d0847AEb41866EcFEB8BAF0c9163566aD9E373
NexusBootstrap: 0x88727A0b41e236459476235119A219e9872A0d19
K1ValidatorFactory: 0x17249378E661929b73277c9E5B815716b9bb2D1B
SocialRecoveryValidator: 0xcc9bA7b65f6E5468608F7803Edbab5348Cd3A9Ff
WebAuthnValidator: 0xe89c5d5468Cd3F6d700C7Aaed3Ae3a867C6944cE
=================================

jatinsharma@Akshay-709-M1-C07JY0FDQ6P0 Account-abstraction-With-frontend % 


*/
