import hre from "hardhat";
import "dotenv/config";

async function main() {
  console.log("Starting UUPS Proxy Deployment to Sepolia...\n");

  // 1. Get the primary deployer account
  const { ethers } = await (hre as any).network.connect();
  const signers = await ethers.getSigners();
  const deployer = signers[0];

  // We use the official EntryPoint v0.7 address
  const ENTRY_POINT = process.env.ENTRY_POINT || "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
  const ERC20_TOKEN_ADDRESS = process.env.USDC_TOKEN_ADDRESS || "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
  const PRICE_FEED = process.env.PRICE_FEED || "0x694AA1769357215DE4FAC081bf1f309aDC325306";

  
  
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

  // Fetch the automatically deployed implementation address
  const implAddr = await factory.implementation();
  console.log(`✅ ModularImplementation deployed at: ${implAddr}`);

  // 3. Deploy a sample Smart Account (Proxy) for the deployer
  console.log("Deploying a sample Smart Account Proxy (owned by Deployer)...");
  const salt = 1;
  const predictedAddr = await factory.getFunction("getAddress")(deployer.address, salt);
  
  const tx = await factory.createAccount(deployer.address, salt);
  await tx.wait();
  
  console.log(`✅ Sample Smart Account Proxy deployed at: ${predictedAddr}\n`);

  // 4. Deploy Custom Paymaster
  console.log("Deploying ERC20 Paymaster...");
  const CustomPaymaster = await ethers.getContractFactory("ERC20Paymaster");
  const paymaster = await CustomPaymaster.deploy(ENTRY_POINT, ERC20_TOKEN_ADDRESS,PRICE_FEED);
  await paymaster.waitForDeployment();
  const pmAddr = await paymaster.getAddress();
  console.log(`✅ Custom Paymaster deployed at: ${pmAddr}\n`);

  console.log("Deployment Complete!");
  console.log("-------------------------------------------------");
  console.log("Add these addresses to your frontend .env file:");
  console.log(`VITE_ENTRY_POINT="${ENTRY_POINT}"`);
  console.log(`VITE_FACTORY="${factoryAddr}"`);
  console.log(`VITE_PAYMASTER="${pmAddr}"`);
  console.log(`VITE_SAMPLE_PROXY_ADDRESS="${predictedAddr}"`);
  console.log("-------------------------------------------------");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


/**
 * 
jatinsharma@Akshay-709-M1-C07JY0FDQ6P0 Modular_SA % 



Starting UUPS Proxy Deployment to Sepolia...

Deployer: 0x878344AF84A404439Ea37cFB9b30DeFd7938741C
Using EntryPoint: 0x0000000071727De22E5E9d8BAf0edAc6f37da032

Deploying ProxyFactory...
✅ ProxyFactory deployed at: 0xc1e43D59A13C612a43a04eB609344762c8ec297D
✅ ModularImplementation deployed at: 0xa5565f35526C9742182504AdAf3505F0afc68C55
Deploying a sample Smart Account Proxy (owned by Deployer)...
✅ Sample Smart Account Proxy deployed at: 0xBD8b6d105bea1ADCd77e2dA6A2bF358dA24a8e04

Deploying ERC20 Paymaster...
✅ Custom Paymaster deployed at: 0x000637bEca5d34edEf518f0f90a1Ce72acB32879

Deployment Complete!
-------------------------------------------------
Add these addresses to your frontend .env file:
VITE_ENTRY_POINT="0x0000000071727De22E5E9d8BAf0edAc6f37da032"
VITE_FACTORY="0xc1e43D59A13C612a43a04eB609344762c8ec297D"
VITE_PAYMASTER="0x000637bEca5d34edEf518f0f90a1Ce72acB32879"
VITE_SAMPLE_PROXY_ADDRESS="0xBD8b6d105bea1ADCd77e2dA6A2bF358dA24a8e04"
-------------------------------------------------
jatinsharma@Akshay-709-M1-C07JY0FDQ6P0 Modular_SA % 

 */
