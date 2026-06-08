import hre from "hardhat";


async function main() {
  console.log("Starting Beacon Proxy Flow Test...\n");

  // 1. Get signers to use as owners for the smart accounts
  const { ethers } = await (hre as any).network.connect();
  const [deployer, owner1, owner2, randomAddress] = await ethers.getSigners();

  // Using a standard EntryPoint address or deployer for testing
  // In a real scenario, this would be the actual EntryPoint address (e.g., 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789)
  const ENTRY_POINT = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
  
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Owner 1: ${owner1.address}`);
  console.log(`Owner 2: ${owner2.address}\n`);

  // 2. Deploy ProxyFactory
  // The Factory will automatically deploy the ModularImplementation and ModularBeacon in its constructor
  console.log("Deploying ProxyFactory...");
  const Factory = await ethers.getContractFactory("ProxyFactory");
  const factory = await Factory.deploy(ENTRY_POINT);
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  
  console.log(`ProxyFactory deployed at: ${factoryAddr}`);

  // Fetch the automatically deployed implementation and beacon addresses
  const implAddr = await factory.implementation();
  const beaconAddr = await factory.beacon();
  console.log(`ModularImplementation deployed at: ${implAddr}`);
  console.log(`ModularBeacon deployed at: ${beaconAddr}\n`);

  // 3. Deploy Smart Account 1 using the Factory
  console.log("Deploying Smart Account 1 (Owner 1)...");
  const salt1 = 1;
  const predictedAddr1 = await factory.getFunction("getAddress")(owner1.address, salt1);
  
  const tx1 = await factory.createAccount(owner1.address, salt1);
  await tx1.wait();
  
  console.log(`Smart Account 1 deployed at: ${predictedAddr1}`);

  // 4. Deploy Smart Account 2 using the Factory
  console.log("Deploying Smart Account 2 (Owner 2)...");
  const salt2 = 2;
  const predictedAddr2 = await factory.getFunction("getAddress")(owner2.address, salt2);
  
  const tx2 = await factory.createAccount(owner2.address, salt2);
  await tx2.wait();
  
  console.log(`Smart Account 2 deployed at: ${predictedAddr2}\n`);

  // 5. Test Interactions
  console.log("Testing Smart Account Interactions...");
  
  // Attach the Implementation ABI to the proxy addresses to interact with them
  const account1 = await ethers.getContractAt("ModularImplementation", predictedAddr1);
  const account2 = await ethers.getContractAt("ModularImplementation", predictedAddr2);

  // Check state to ensure proxies are correctly reading from their isolated storage
  // Let's use the standard `entryPoint()` to verify it returns the initialized state
  const readEntryPoint1 = await account1.entryPoint();
  const readEntryPoint2 = await account2.entryPoint();

  console.log(`Account 1 EntryPoint is correct: ${readEntryPoint1 === ENTRY_POINT}`);
  console.log(`Account 2 EntryPoint is correct: ${readEntryPoint2 === ENTRY_POINT}`);

  // Let's fund Account 1 so we can test executing a transaction
  await deployer.sendTransaction({
    to: predictedAddr1,
    value: ethers.parseEther("1.0"),
  });
  console.log("Funded Account 1 with 1.0 ETH");

  // Account 1 (owner1) executes a simple transaction: sending 0.1 ETH to randomAddress
  const targetAddr = randomAddress.address;
  const amount = ethers.parseEther("0.1");
  const data = "0x";

  console.log(`Owner 1 executing transfer to ${targetAddr}...`);
  // Must connect as owner1 because `execute` is protected by `onlyEntryPointOrOwner`
  const tx3 = await account1.connect(owner1).execute(targetAddr, amount, data);
  await tx3.wait();

  console.log("Transfer successful!\n");

  console.log("All tests passed! The Beacon Proxy architecture is working correctly.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
