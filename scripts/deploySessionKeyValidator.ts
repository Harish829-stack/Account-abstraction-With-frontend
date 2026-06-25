import hre from "hardhat";
import "dotenv/config";

// ─── Config ────────────────────────────────────────────────────────────────────
const CREATE3_FACTORY_ADDRESS = "0xb31fd259D799Fa4AdAdc64726B75E6195D635C59";

// The salt determines the final address. Change this string to get a new address.
// Use a new salt (V2) because the old V1 address already has the previous contract on-chain.
const SALT_STRING = "NEXUS_SESSION_KEY_V4";

// Networks to deploy to. Keys must match your hardhat.config networks.
const CHAINS: { name: string; network: string }[] = [
  { name: "Sepolia",      network: "sepolia" },
  { name: "Polygon Amoy", network: "amoy"    },
];
// ───────────────────────────────────────────────────────────────────────────────

async function deployOnChain(networkName: string, chainLabel: string): Promise<string> {
  console.log("\n" + "═".repeat(60));
  console.log(`  Deploying SessionKeyValidator (CREATE3) → ${chainLabel}`);
  console.log("═".repeat(60));

  const { ethers } = await hre.network.connect(networkName);
  const [deployer] = await ethers.getSigners();

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`  Deployer  : ${deployer.address}`);
  console.log(`  Balance   : ${ethers.formatEther(balance)} native`);

  if (balance === 0n) {
    throw new Error(`Deployer has 0 balance on ${chainLabel}. Fund it first.`);
  }

  // Connect to the already-deployed CREATE3 factory
  const create3Factory = await ethers.getContractAt(
    "CREATE3Factory",
    CREATE3_FACTORY_ADDRESS,
    deployer
  );

  const salt = ethers.id(SALT_STRING);

  // Pre-compute the deterministic address (same on every chain)
  const expectedAddress = await create3Factory.getDeployed(deployer.address, salt);
  console.log(`  Salt      : "${SALT_STRING}"`);
  console.log(`  Expected  : ${expectedAddress}  (same on every chain)`);

  // Check if already deployed at that address
  const existingCode = await ethers.provider.getCode(expectedAddress);
  if (existingCode !== "0x") {
    console.log(`  Already deployed at ${expectedAddress} — skipping.`);
    return expectedAddress;
  }

  // Build creation bytecode (no constructor args for SessionKeyValidator)
  const Factory = await ethers.getContractFactory("SessionKeyValidator");
  const deployTx = await Factory.getDeployTransaction();
  const creationCode = deployTx.data;

  console.log(`  Deploying via CREATE3...`);
  const tx = await create3Factory.deploy(salt, creationCode);
  const receipt = await tx.wait();

  console.log(`\n  SessionKeyValidator deployed!`);
  console.log(`     Address : ${expectedAddress}`);
  console.log(`     Tx hash : ${receipt?.hash ?? tx.hash}`);

  return expectedAddress;
}

async function main() {
  console.log("\n  SessionKeyValidator — CREATE3 Multi-Chain Deployment");
  console.log(`  Salt: "${SALT_STRING}"`);

  const results: Record<string, string> = {};

  for (const chain of CHAINS) {
    try {
      results[chain.name] = await deployOnChain(chain.network, chain.name);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\n  FAILED on ${chain.name}: ${msg}`);
      results[chain.name] = "FAILED";
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("  DEPLOYMENT SUMMARY");
  console.log("═".repeat(60));
  for (const [chain, address] of Object.entries(results)) {
    const tag = address === "FAILED" ? "FAILED" : "OK";
    console.log(`  [${tag}] ${chain.padEnd(18)}: ${address}`);
  }

  const successAddresses = Object.values(results).filter(a => a !== "FAILED");
  const allMatch = successAddresses.length > 0 && successAddresses.every(a => a === successAddresses[0]);

  console.log("\n" + "─".repeat(60));
  if (allMatch) {
    console.log("  Same address on all chains (CREATE3 success!):");
    console.log(`  ${successAddresses[0]}`);
  } else {
    console.log("  WARNING: Addresses differ between chains.");
  }

  console.log("\n  Update your frontend/.env file:");
  console.log("─".repeat(60));
  const finalAddr = successAddresses[0] ?? "<deploy failed>";
  console.log(`  VITE_SESSION_KEY_VALIDATOR="${finalAddr}"`);
  console.log(`  (Same address for both chains — CREATE3 ensures determinism)`);
  console.log("\n  Then restart the frontend dev server: npm run dev");
  console.log("─".repeat(60) + "\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
