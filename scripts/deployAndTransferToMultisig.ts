import hre from "hardhat";
const { ethers } = await hre.network.connect();
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Starting deployment with account:", deployer.address);

  // ---------------------------------------------------------
  // 1. Set up the Owners for the Multisig
  // ---------------------------------------------------------
  // These are derived from the private keys in your .env
  const owner1 = new ethers.Wallet(process.env.SEPOLIA_PRIVATE_KEY_1 || "").address;
  const owner2 = new ethers.Wallet(process.env.SEPOLIA_PRIVATE_KEY_2 || "").address;
  const owner3 = new ethers.Wallet(process.env.SEPOLIA_PRIVATE_KEY_3 || "").address;

  const owners = [owner1, owner2, owner3];
  const threshold = 2; // e.g., 2 out of 3 signatures required
  const guardian = ethers.ZeroAddress; // Optional guardian

  console.log("Multisig Owners:", owners);
  console.log("Threshold:", threshold);

  // ---------------------------------------------------------
  // 2. Deploy Multisig Implementation and Factory
  // ---------------------------------------------------------
  const SafeMultiSigUUPS = await ethers.getContractFactory("SafeMultiSigUUPS");
  const multisigImpl = await SafeMultiSigUUPS.deploy();
  await multisigImpl.waitForDeployment();
  const implAddress = await multisigImpl.getAddress();
  console.log("SafeMultiSigUUPS Implementation deployed to:", implAddress);

  const SafeMultiSigFactory = await ethers.getContractFactory("SafeMultiSigFactory");
  const factory = await SafeMultiSigFactory.deploy(implAddress);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("SafeMultiSigFactory deployed to:", factoryAddress);

  // ---------------------------------------------------------
  // 3. Create the Actual Multisig Wallet Proxy
  // ---------------------------------------------------------
  const salt = ethers.encodeBytes32String("my-project-multisig");

  console.log("Creating multisig wallet...");
  const createTx = await factory.createWallet(owners, threshold, guardian, salt);
  const receipt = await createTx.wait();

  // Find the WalletCreated event to get the new proxy address
  const event = receipt?.logs.find(
    (log) => log.topics[0] === factory.interface.getEvent("WalletCreated").topicHash
  );

  let multisigProxyAddress;
  if (event) {
    const decoded = factory.interface.parseLog({ topics: event.topics as string[], data: event.data });
    multisigProxyAddress = decoded?.args.proxy;
  } else {
    // Fallback: compute it
    multisigProxyAddress = await factory.computeAddress(owners, threshold, guardian, salt);
  }

  console.log("✅ Multisig Wallet created at:", multisigProxyAddress);

  // ---------------------------------------------------------
  // 4. Transfer Ownership of AA Contracts to the Multisig
  // ---------------------------------------------------------
  // Update these addresses from your deployed AA environment
  const AA_FACTORY_ADDRESS = process.env.FACTORY_ADDRESS || "0x7C5f2728Fb4EDA8210e11afD9D8675fd35942c0A";

  // NOTE: You didn't provide the Paymaster address in your snippet. 
  // Replace this with your actual Paymaster address:
  const PAYMASTER_ADDRESS = process.env.PAYMASTER_ADDRESS || "0xYOUR_PAYMASTER_ADDRESS_HERE";

  console.log("Transferring ownership of AA Factory...");
  const K1Factory = await ethers.getContractAt("K1ValidatorFactory", AA_FACTORY_ADDRESS);
  const tx1 = await K1Factory.transferOwnership(multisigProxyAddress);
  await tx1.wait();
  console.log("✅ AA Factory ownership transferred to Multisig!");

  // Uncomment and configure this when you have your Paymaster address ready:
  /*
  console.log("Transferring ownership of Paymaster...");
  // Use "MultiTokenPaymaster" or "MockPaymaster" depending on what you deployed
  const Paymaster = await ethers.getContractAt("MultiTokenPaymaster", PAYMASTER_ADDRESS);
  const tx2 = await Paymaster.transferOwnership(multisigProxyAddress);
  await tx2.wait();
  console.log("✅ Paymaster ownership transferred to Multisig!");
  */

  console.log("🎉 All done! Your protocol is now secured by the Multisig.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
