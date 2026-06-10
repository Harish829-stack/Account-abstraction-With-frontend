import hre from "hardhat";
import "dotenv/config";

const SMART_ACCOUNT = process.env.SMART_ACCOUNT;
const EXISTING_SESSION_VALIDATOR = process.env.SESSION_KEY_VALIDATOR;
const SESSION_KEY = process.env.SESSION_KEY;
const TARGET = process.env.TARGET ?? "0x0000000000000000000000000000000000000000";
const SELECTOR = process.env.SELECTOR ?? "0x00000000";
const MAX_VALUE_ETH = process.env.MAX_VALUE_ETH ?? "0";
const VALID_AFTER = Number(process.env.VALID_AFTER ?? "0");
const VALID_UNTIL = Number(process.env.VALID_UNTIL ?? "0");
const REMAINING_USES = Number(process.env.REMAINING_USES ?? "1");

async function main() {
  if (!SMART_ACCOUNT) throw new Error("Missing SMART_ACCOUNT in environment");
  if (!SESSION_KEY) throw new Error("Missing SESSION_KEY in environment");

  const { ethers } = await hre.network.connect();

  if (!ethers.isAddress(SMART_ACCOUNT)) throw new Error("SMART_ACCOUNT is not a valid address");
  if (!ethers.isAddress(SESSION_KEY)) throw new Error("SESSION_KEY is not a valid address");
  if (!ethers.isAddress(TARGET)) throw new Error("TARGET is not a valid address");
  if (EXISTING_SESSION_VALIDATOR && !ethers.isAddress(EXISTING_SESSION_VALIDATOR)) {
    throw new Error("SESSION_KEY_VALIDATOR is not a valid address");
  }
  if (!/^0x[0-9a-fA-F]{8}$/.test(SELECTOR)) {
    throw new Error("SELECTOR must be a 4-byte hex string like 0xa9059cbb");
  }
  if (VALID_UNTIL !== 0 && VALID_AFTER > VALID_UNTIL) {
    throw new Error("VALID_AFTER cannot be greater than VALID_UNTIL");
  }
  if (REMAINING_USES <= 0) {
    throw new Error("REMAINING_USES must be greater than 0");
  }

  const [deployer] = await ethers.getSigners();
  console.log("Installer:", deployer.address);
  console.log("SmartAccount:", SMART_ACCOUNT);

  let sessionValidatorAddress = EXISTING_SESSION_VALIDATOR;
  if (!sessionValidatorAddress) {
    const sessionValidator = await ethers.deployContract("SessionKeyValidator");
    await sessionValidator.waitForDeployment();
    sessionValidatorAddress = await sessionValidator.getAddress();
  }

  console.log("SessionKeyValidator:", sessionValidatorAddress);

  const account = await ethers.getContractAt("ModularImplementation", SMART_ACCOUNT);
  const alreadyInstalled = await account.isModuleInstalled(1, sessionValidatorAddress, "0x");

  const sessionKeyData = {
    sessionKey: SESSION_KEY,
    target: TARGET,
    selector: SELECTOR,
    maxValue: ethers.parseEther(MAX_VALUE_ETH),
    validAfter: VALID_AFTER,
    validUntil: VALID_UNTIL,
    remainingUses: REMAINING_USES
  };

  const initData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(address sessionKey,address target,bytes4 selector,uint256 maxValue,uint48 validAfter,uint48 validUntil,uint48 remainingUses)[]"],
    [[sessionKeyData]]
  );

  if (!alreadyInstalled) {
    console.log("Installing validator and first session key...");
    const tx = await account.installModule(1, sessionValidatorAddress, initData);
    await tx.wait();
  } else {
    console.log("Validator already installed; adding session key...");
    const sessionValidator = await ethers.getContractAt("SessionKeyValidator", sessionValidatorAddress);
    const tx = await account.getFunction("execute(address,uint256,bytes)")(
      sessionValidatorAddress,
      0,
      sessionValidator.interface.encodeFunctionData("addSessionKey", [sessionKeyData])
    );
    await tx.wait();
  }

  console.log("\nDONE");
  console.log("SessionKeyValidator:", sessionValidatorAddress);
  console.log("SessionKey:", SESSION_KEY);
  console.log("Target:", TARGET);
  console.log("Selector:", SELECTOR);
  console.log("Max value ETH:", MAX_VALUE_ETH);
  console.log("Valid after:", VALID_AFTER);
  console.log("Valid until:", VALID_UNTIL);
  console.log("Remaining uses:", REMAINING_USES);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
