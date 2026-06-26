import hre from "hardhat"
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const { ethers } = await hre.network.connect()
  const [deployer] = await ethers.getSigners();

  console.log("Deploying new Factory with account:", deployer.address);

  // Set these addresses based on your existing deployed instances in .env
  const NEXUS_IMPLEMENTATION = process.env.IMPL_V1_ADDRESS || "0xD44bB5500FF30B30Ea2488ca3Df9c27bb76A4498";
  const MULTISIG_PROXY = process.env.PROXYV1 || "0x9165d460fB04aae3975d8E1b12af13d4Da32eEaE";
  const K1_VALIDATOR = process.env.K1_VALIDATOR || "0x6e003A2a991ebad2978666A74C5b1AfeA4D3fB3c";
  const NEXUS_BOOTSTRAP = process.env.NEXUS_BOOTSTRAP || "0x88727A0b41e236459476235119A219e9872A0d19";

  console.log("Using existing contracts:");
  console.log("Implementation:", NEXUS_IMPLEMENTATION);
  console.log("Multisig Owner:", MULTISIG_PROXY);
  console.log("K1Validator:", K1_VALIDATOR);
  console.log("NexusBootstrap:", NEXUS_BOOTSTRAP);

  const Factory = await ethers.getContractFactory("K1ValidatorFactory");
  const factory = await Factory.deploy(
    NEXUS_IMPLEMENTATION,
    MULTISIG_PROXY, // Set multisig as the owner from the start
    K1_VALIDATOR,
    NEXUS_BOOTSTRAP,
    ethers.ZeroAddress
  );
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  
  console.log("✅ New K1ValidatorFactory deployed at:", factoryAddress);
  console.log("Remember to update VITE_FACTORY in your frontend .env and FACTORY_ADDRESS in hardhat .env!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
