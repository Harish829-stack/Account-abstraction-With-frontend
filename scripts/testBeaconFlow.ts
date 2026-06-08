import hre from "hardhat";
import "dotenv/config";

async function main() {
  console.log("Starting Beacon Proxy Deployment to Sepolia...\n");

  // 1. Get the primary deployer account
  const { ethers } = await (hre as any).network.connect();
  const signers = await ethers.getSigners();
  const deployer = signers[0];

  // We use the ENTRY_POINT from .env, or fallback to the standard one if not set
  const ENTRY_POINT = process.env.ENTRY_POINT || "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
  
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Using EntryPoint: ${ENTRY_POINT}\n`);

  // 2. Deploy ProxyFactory
  // The Factory automatically deploys the ModularImplementation and ModularBeacon in its constructor
  console.log("Deploying ProxyFactory...");
  const Factory = await ethers.getContractFactory("ProxyFactory");
  const factory = await Factory.deploy(ENTRY_POINT);
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  
  console.log(`✅ ProxyFactory deployed at: ${factoryAddr}`);

  // Fetch the automatically deployed implementation and beacon addresses
  const implAddr = await factory.implementation();
  const beaconAddr = await factory.beacon();
  console.log(`✅ ModularImplementation deployed at: ${implAddr}`);
  console.log(`✅ ModularBeacon deployed at: ${beaconAddr}\n`);

  // 3. Deploy a sample Smart Account (Proxy) for the deployer
  console.log("Deploying a sample Smart Account Proxy (owned by Deployer)...");
  const salt = 1;
  const predictedAddr = await factory.getFunction("getAddress")(deployer.address, salt);
  
  const tx = await factory.createAccount(deployer.address, salt);
  await tx.wait();
  
  console.log(`✅ Sample Smart Account Proxy deployed at: ${predictedAddr}\n`);

  console.log("Deployment Complete!");
  console.log("-------------------------------------------------");
  console.log("Add these addresses to your frontend .env file:");
  console.log(`NEXT_PUBLIC_IMPLEMENTATION_ADDRESS="${implAddr}"`);
  console.log(`NEXT_PUBLIC_BEACON_ADDRESS="${beaconAddr}"`);
  console.log(`NEXT_PUBLIC_FACTORY_ADDRESS="${factoryAddr}"`);
  console.log(`NEXT_PUBLIC_SAMPLE_PROXY_ADDRESS="${predictedAddr}"`);
  console.log("-------------------------------------------------");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


/**
 * 
Starting Beacon Proxy Deployment to Sepolia...

Deployer: 0x878344AF84A404439Ea37cFB9b30DeFd7938741C
Using EntryPoint: 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789

Deploying ProxyFactory...
✅ ProxyFactory deployed at: 0xeCE78496efc042fe23c16a04dA618e46EE42DB86
✅ ModularImplementation deployed at: 0x67343B3f8eb3514Ab2e33BdD95CD8b419a243c94
✅ ModularBeacon deployed at: 0x04Be57Dc81A5913e23235B4D8aA575877fC37e25

Deploying a sample Smart Account Proxy (owned by Deployer)...

 */
