import hre from "hardhat";
const {ethers}= await hre.network.connect();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Running script with account:", deployer.address);

  // ---------------------------------------------------------
  // 1. Get the target Multisig Address (PROXYV1)
  // ---------------------------------------------------------
  // From your .env: PROXYV1="0x9165d460fB04aae3975d8E1b12af13d4Da32eEaE"
  const MULTISIG_PROXY_ADDRESS = process.env.MULTISIG_PROXY!;
  console.log("Target Multisig Wallet Address:", MULTISIG_PROXY_ADDRESS);

  // ---------------------------------------------------------
  // 2. Transfer Ownership of K1 Validator Factory
  // ---------------------------------------------------------
  // NOTE: You need to specify your actual K1ValidatorFactory address here
  const K1_FACTORY_ADDRESS = process.env.FACTORY!;
  
  if (K1_FACTORY_ADDRESS !== "0xYOUR_K1_FACTORY_ADDRESS") {
    console.log(`Transferring K1ValidatorFactory (${K1_FACTORY_ADDRESS}) ownership...`);
    const K1Factory = await ethers.getContractAt("K1ValidatorFactory", K1_FACTORY_ADDRESS);
    const tx1 = await K1Factory.transferOwnership(MULTISIG_PROXY_ADDRESS);
    await tx1.wait();
    console.log("✅ K1ValidatorFactory ownership transferred to Multisig!");
  } else {
    console.log("⚠️ Please set K1_FACTORY_ADDRESS in your .env or script to transfer factory ownership.");
  }

  // ---------------------------------------------------------
  // 3. Transfer Ownership of ERC20 Paymaster
  // ---------------------------------------------------------
  // NOTE: You need to specify your actual Erc20Paymaster address here
  const PAYMASTER_ADDRESS = process.env.MULTITOKEN_PAYMASTER!;

  if (PAYMASTER_ADDRESS) {
    console.log(`Transferring Erc20Paymaster (${PAYMASTER_ADDRESS}) ownership...`);
    const Paymaster = await ethers.getContractAt("MultiTokenPaymaster", PAYMASTER_ADDRESS);
    const tx2 = await Paymaster.transferOwnership(MULTISIG_PROXY_ADDRESS);
    await tx2.wait();
    console.log("✅ ERC20 Paymaster ownership transferred to Multisig!");
  } else {
    console.log("⚠️ Please set ERC20_PAYMASTER_ADDRESS in your .env or script to transfer paymaster ownership.");
  }

  console.log("🎉 Transfer script complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});



/**
 * npx hardhat run scripts/transferToMultisig.ts --network sepolia

Warning: Function state mutability can be restricted to view
   --> ./contracts/multisig/Multisig.sol:454:5:
    |
454 |     function _authorizeUpgrade(address) internal override onlyProxy {
    |     ^ (Relevant source part starts here and spans across multiple lines).


Running script with account: 0x878344AF84A404439Ea37cFB9b30DeFd7938741C
Target Multisig Wallet Address: 0x9165d460fB04aae3975d8E1b12af13d4Da32eEaE
Transferring K1ValidatorFactory (0x17249378E661929b73277c9E5B815716b9bb2D1B) ownership...
✅ K1ValidatorFactory ownership transferred to Multisig!
Transferring Erc20Paymaster (0x7d045fA2F7DE36fB537852442bb2693D2a6b5Aa3) ownership...
✅ ERC20 Paymaster ownership transferred to Multisig!
🎉 Transfer script complete.
jatinsharma@Akshay-709-M1-C07JY0FDQ6P0 Account-abstraction-With-frontend % 
 */