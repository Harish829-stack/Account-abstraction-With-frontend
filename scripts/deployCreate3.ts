import hre from "hardhat"

async function main() {
  // @ts-ignore
  const { ethers } = await hre.network.connect();
  console.log("Starting CREATE3 deterministic deployments...");

  const [deployer] = await ethers.getSigners();
  console.log(`Deploying with account: ${deployer.address}`);

  // 1. Ensure CREATE3Factory is deployed at the exact same address via CREATE2
  const CREATE2_FACTORY_ADDRESS = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
  // EIP-2470 CREATE2 factory takes salt (32 bytes) + bytecode directly in msg.data

  const Create3FactoryArtifact = await ethers.getContractFactory("CREATE3Factory");
  const create3Bytecode = Create3FactoryArtifact.bytecode;
  const create3Salt = ethers.id("MULTI_TOKEN_CREATE3_FACTORY_V1");

  // Calculate what the CREATE3Factory address will be
  const create3FactoryAddress = ethers.getCreate2Address(
    CREATE2_FACTORY_ADDRESS,
    create3Salt,
    ethers.keccak256(create3Bytecode)
  );

  const codeAtCreate3 = await ethers.provider.getCode(create3FactoryAddress);
  if (codeAtCreate3 === "0x") {
    console.log(`Deploying CREATE3Factory to ${create3FactoryAddress}...`);
    const txData = ethers.concat([create3Salt, create3Bytecode]);
    const tx = await deployer.sendTransaction({
      to: CREATE2_FACTORY_ADDRESS,
      data: txData,
      gasLimit: 3000000, // Hardcoded gas limit to bypass estimateGas issues on testnet nodes
    });
    await tx.wait();
    console.log("CREATE3Factory deployed!");
  } else {
    console.log(`CREATE3Factory already exists at ${create3FactoryAddress}`);
  }

  const create3Factory = await ethers.getContractAt("CREATE3Factory", create3FactoryAddress, deployer);

  // 2. Deploy ProxyFactory via CREATE3
  // Since ProxyFactory deploys ModularImplementation in its constructor, 
  // ModularImplementation will also have the exact same address!
  console.log("\n--- Deploying ProxyFactory ---");
  const entryPointAddress = "0x0000000071727De22E5E9d8BAf0edAc6f37da032"; // v0.7 EntryPoint
  
  const ProxyFactoryArtifact = await ethers.getContractFactory("ProxyFactory");
  const proxyFactoryTx = await ProxyFactoryArtifact.getDeployTransaction(entryPointAddress);
  const proxyFactoryCreationCode = proxyFactoryTx.data;
  
  const proxyFactorySalt = ethers.id("PROXY_FACTORY_SALT_V1");
  const proxyFactoryExpectedAddress = await create3Factory.getDeployed(deployer.address, proxyFactorySalt);
  
  const codeAtProxyFactory = await ethers.provider.getCode(proxyFactoryExpectedAddress);
  if (codeAtProxyFactory === "0x") {
    console.log(`Deploying ProxyFactory to ${proxyFactoryExpectedAddress}...`);
    const txData2 = create3Factory.interface.encodeFunctionData("deploy", [proxyFactorySalt, proxyFactoryCreationCode]);
    const tx2 = await deployer.sendTransaction({
      to: create3FactoryAddress,
      data: txData2
    });
    await tx2.wait();
    console.log("ProxyFactory deployed!");
  } else {
    console.log(`ProxyFactory already exists at ${proxyFactoryExpectedAddress}`);
  }

  // 3. Deploy MultiTokenPaymaster via CREATE3
  console.log("\n--- Deploying MultiTokenPaymaster ---");
  const ethUsdFeedSepolia = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
  // You can change this to Amoy's feed when running on Amoy if needed.
  // Wait! If the constructor arguments differ between chains, the CREATE3 address 
  // REMAINS THE SAME because CREATE3 address depends ONLY on the salt and deployer!
  // This is the magic of CREATE3.

  const PaymasterArtifact = await ethers.getContractFactory("contracts/Erc20Paymaster.sol:MultiTokenPaymaster");
  // Assuming Sepolia feed by default. When running on Amoy, make sure to pass the Amoy feed address!
  const chainId = (await ethers.provider.getNetwork()).chainId;
  
  let ethUsdFeed;
  if (chainId === 80002n) {
    // We are on Amoy, deploy MockAggregator
    console.log("Deploying MockAggregator on Amoy...");
    const MockAggregatorArtifact = await ethers.getContractFactory("MockAggregator");
    // $3000 with 8 decimals = 3000 * 10^8
    const mockFeed = await MockAggregatorArtifact.deploy(300000000000n);
    await mockFeed.waitForDeployment();
    ethUsdFeed = await mockFeed.getAddress();
    console.log("MockAggregator deployed at:", ethUsdFeed);
  } else {
    // Sepolia or others
    ethUsdFeed = ethUsdFeedSepolia; 
  }
  
  const paymasterTx = await PaymasterArtifact.getDeployTransaction(entryPointAddress, ethUsdFeed);
  const paymasterCreationCode = paymasterTx.data;

  const paymasterSalt = ethers.id("MULTI_TOKEN_PAYMASTER_SALT_V1");
  const paymasterExpectedAddress = await create3Factory.getDeployed(deployer.address, paymasterSalt);

  const codeAtPaymaster = await ethers.provider.getCode(paymasterExpectedAddress);
  if (codeAtPaymaster === "0x") {
    console.log(`Deploying MultiTokenPaymaster to ${paymasterExpectedAddress}...`);
    const txData3 = create3Factory.interface.encodeFunctionData("deploy", [paymasterSalt, paymasterCreationCode]);
    const tx3 = await deployer.sendTransaction({
      to: create3FactoryAddress,
      data: txData3
    });
    await tx3.wait();
    console.log("MultiTokenPaymaster deployed!");
  } else {
    console.log(`MultiTokenPaymaster already exists at ${paymasterExpectedAddress}`);
  }

  console.log("\nDeployment Complete!");
  console.log("Addresses are deterministic across all chains:");
  console.log("CREATE3Factory:", create3FactoryAddress);
  console.log("ProxyFactory:", proxyFactoryExpectedAddress);
  console.log("MultiTokenPaymaster:", paymasterExpectedAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
/**\
 * 
 * Deployment Complete!
Addresses are deterministic across all chains:
CREATE3Factory: 0xb31fd259D799Fa4AdAdc64726B75E6195D635C59
ProxyFactory: 0x333E1c74a84F321D5CDb6bBd79cb9deDE8036880
MultiTokenPaymaster: 0xD8dc08A009C845676832cba5dDD6b940ABF75E2f
 */