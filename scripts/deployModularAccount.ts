import hre from "hardhat";
import "dotenv/config";

const ENTRY_POINT = process.env.ENTRY_POINT;
const EXISTING_FACTORY = process.env.PROXY_FACTORY;
const EXISTING_RECOVERY_VALIDATOR = process.env.SOCIAL_RECOVERY_VALIDATOR;

const SALT = BigInt(process.env.SALT ?? "1");
const DEPOSIT_ETH = process.env.DEPOSIT_ETH ?? "0";
const RECOVERY_THRESHOLD = Number(process.env.RECOVERY_THRESHOLD ?? "0");
const RECOVERY_DELAY = Number(process.env.RECOVERY_DELAY ?? "0");

function parseAddressList(value: string | undefined): string[] {
  if (!value) return [];

  return value
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
}

async function main() {
  if (!ENTRY_POINT) {
    throw new Error("Missing ENTRY_POINT in environment");
  }

  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();
  const accountOwner = process.env.ACCOUNT_OWNER ?? deployer.address;
  const guardians = parseAddressList(process.env.GUARDIANS);

  if (!ethers.isAddress(ENTRY_POINT)) throw new Error("ENTRY_POINT is not a valid address");
  if (!ethers.isAddress(accountOwner)) throw new Error("ACCOUNT_OWNER is not a valid address");
  if (EXISTING_FACTORY && !ethers.isAddress(EXISTING_FACTORY)) {
    throw new Error("PROXY_FACTORY is not a valid address");
  }
  if (EXISTING_RECOVERY_VALIDATOR && !ethers.isAddress(EXISTING_RECOVERY_VALIDATOR)) {
    throw new Error("SOCIAL_RECOVERY_VALIDATOR is not a valid address");
  }
  for (const guardian of guardians) {
    if (!ethers.isAddress(guardian)) throw new Error(`Invalid guardian address: ${guardian}`);
  }

  console.log("Deployer:", deployer.address);
  console.log("Account owner:", accountOwner);
  console.log("EntryPoint:", ENTRY_POINT);
  console.log("Salt:", SALT.toString());

  const factory = EXISTING_FACTORY
    ? await ethers.getContractAt("ProxyFactory", EXISTING_FACTORY)
    : await ethers.deployContract("ProxyFactory", [ENTRY_POINT]);

  if (!EXISTING_FACTORY) {
    await factory.waitForDeployment();
  }

  const factoryAddress = await factory.getAddress();
  const implementationAddress = await factory.implementation();

  console.log("ProxyFactory:", factoryAddress);
  console.log("ModularImplementation:", implementationAddress);

  const smartAccountAddress = await factory.getFunction("getAddress")(accountOwner, SALT);
  console.log("Predicted smart account:", smartAccountAddress);

  const accountCode = await ethers.provider.getCode(smartAccountAddress);
  if (accountCode === "0x") {
    console.log("Deploying smart account...");
    const tx = await factory.getFunction("createAccount")(accountOwner, SALT);
    await tx.wait();
    console.log("Smart account deployed");
  } else {
    console.log("Smart account already deployed");
  }

  if (DEPOSIT_ETH !== "0") {
    const entryPoint = await ethers.getContractAt("IEntryPoint", ENTRY_POINT);
    const depositAmount = ethers.parseEther(DEPOSIT_ETH);

    console.log(`Depositing ${DEPOSIT_ETH} ETH to smart account EntryPoint balance...`);
    const tx = await entryPoint.depositTo(smartAccountAddress, { value: depositAmount });
    await tx.wait();

    const deposit = await entryPoint.balanceOf(smartAccountAddress);
    console.log("Smart account EntryPoint deposit:", deposit.toString());
  }

  let recoveryValidatorAddress = EXISTING_RECOVERY_VALIDATOR;

  if (guardians.length > 0) {
    if (accountOwner.toLowerCase() !== deployer.address.toLowerCase()) {
      throw new Error("Cannot install social recovery unless deployer is the current account owner");
    }

    if (RECOVERY_THRESHOLD <= 0 || RECOVERY_THRESHOLD > guardians.length) {
      throw new Error("RECOVERY_THRESHOLD must be greater than 0 and less than or equal to guardian count");
    }

    if (!recoveryValidatorAddress) {
      const recoveryValidator = await ethers.deployContract("SocialRecoveryValidator");
      await recoveryValidator.waitForDeployment();
      recoveryValidatorAddress = await recoveryValidator.getAddress();
    }

    const account = await ethers.getContractAt("ModularImplementation", smartAccountAddress);
    const alreadyInstalled = await account.isModuleInstalled(1, recoveryValidatorAddress, "0x");

    console.log("SocialRecoveryValidator:", recoveryValidatorAddress);

    if (!alreadyInstalled) {
      const initData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address[]", "uint16", "uint48"],
        [guardians, RECOVERY_THRESHOLD, RECOVERY_DELAY]
      );

      console.log("Installing social recovery validator...");
      const tx = await account.installModule(1, recoveryValidatorAddress, initData);
      await tx.wait();
      console.log("Social recovery installed");
    } else {
      console.log("Social recovery validator already installed");
    }
  } else {
    console.log("No GUARDIANS provided; skipping social recovery install");
  }

  console.log("\nDONE");
  console.log("ProxyFactory:", factoryAddress);
  console.log("ModularImplementation:", implementationAddress);
  console.log("SmartAccount:", smartAccountAddress);
  if (recoveryValidatorAddress) {
    console.log("SocialRecoveryValidator:", recoveryValidatorAddress);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
/**
 *  npx hardhat run scripts/deployModularAccount.ts --network sepolia

Deployer: 0x878344AF84A404439Ea37cFB9b30DeFd7938741C
Account owner: 0x878344AF84A404439Ea37cFB9b30DeFd7938741C
EntryPoint: 0x0000000071727De22E5E9d8BAf0edAc6f37da032
Salt: 1
ProxyFactory: 0x219594234CAa35332880caB773a537D6214fBF52
ModularImplementation: 0xb07497aa37aa6F66c3B3E60632C820969050F9Fb
Predicted smart account: 0x660C572C77897dcD1A0fdc27E84f3a1FE7fa28C0
Deploying smart account...
Smart account deployed
No GUARDIANS provided; skipping social recovery install

DONE
ProxyFactory: 0x219594234CAa35332880caB773a537D6214fBF52
ModularImplementation: 0xb07497aa37aa6F66c3B3E60632C820969050F9Fb
SmartAccount: 0x660C572C77897dcD1A0fdc27E84f3a1FE7fa28C0
jatinsharma@Akshay-709-M1-C07JY0FDQ6P0 Modular_SA % 
 */
