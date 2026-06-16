import hre from "hardhat";
const {ethers}= await hre.network.connect();
import "dotenv/config";

// =============================================================================
//  addToken.ts  –  Register tokens with MultiTokenPaymaster dynamically
//
//  Usage:
//    npx hardhat run scripts/addToken.ts --network sepolia
//    npx hardhat run scripts/addToken.ts --network amoy
// =============================================================================

interface TokenEntry {
  symbol:          string;
  tokenAddress:    string;
  feedAddress:     string;
  minTokenPriceUsd: bigint;
}

// Dynamic floor price calculation implemented below

async function main() {
  const [owner] = await ethers.getSigners();

  const networkName = (await ethers.provider.getNetwork()).name || "unknown";
  console.log(`\nNetwork : ${networkName}`);
  console.log(`Account : ${owner.address}`);

  // Fetch dynamic addresses from .env
  const create3FactoryAddress = process.env.CREATE3FACTORY || "0xb31fd259D799Fa4AdAdc64726B75E6195D635C59";
  const create3Factory = await ethers.getContractAt(
    "CREATE3Factory",
    create3FactoryAddress,
    owner,
  );

  let PAYMASTER_ADDRESS = process.env.MULTITOKEN_PAYMASTER || process.env.PAYMASTER;
  if (!PAYMASTER_ADDRESS || PAYMASTER_ADDRESS === "0x") {
    const paymasterSalt = ethers.id("MULTI_TOKEN_PAYMASTER_SALT_V5");
    PAYMASTER_ADDRESS = await create3Factory.getDeployed(
      owner.address,
      paymasterSalt,
    );
  }

  console.log(`Paymaster: ${PAYMASTER_ADDRESS}`);

  const paymaster = await ethers.getContractAt(
    "contracts/Erc20Paymaster.sol:MultiTokenPaymaster",
    PAYMASTER_ADDRESS,
    owner,
  );

  // Dynamic token config based on network and .env
  const tokens: TokenEntry[] = [];
  
  if (networkName === "sepolia") {
    tokens.push({
      symbol: "USDC",
      tokenAddress: process.env.SEPOLIA_USDC_TOKEN || process.env.USDC_TOKEN_ADDRESS || "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
      feedAddress: process.env.MOCK_AGGREGATOR || "0x79167C9Dccc113Da5b0B03425098bfD0cE211b8e",
      minTokenPriceUsd: 0n, // calculated dynamically
    });
    tokens.push({
      symbol: "EURC",
      tokenAddress: "0x08210f9170f89ab7658f0b5e3ff39b0e03c594d4",
      feedAddress: process.env.MOCK_AGGREGATOR || "0x79167C9Dccc113Da5b0B03425098bfD0cE211b8e", // Re-using mock aggregator for testing
      minTokenPriceUsd: 0n,
    });
  } else if (networkName === "amoy" || networkName === "polygonAmoy") {
    tokens.push({
      symbol: "USDC",
      tokenAddress: process.env.AMOY_USDC || "0xA0C3907b1fc323AdB95dA27e08e289deaE87BD8C",
      feedAddress: process.env.AMOY_MOCKAGG || "0x2A60D7e36FC5FDa6e97aE2C7d054656382f730D7",
      minTokenPriceUsd: 0n,
    });
  }

  // If a MOCK_AGGREGATOR and MOCK_TOKEN exist in .env, add them regardless of network
  if (process.env.MOCK_TOKEN_ADDRESS && process.env.MOCK_AGGREGATOR) {
    tokens.push({
      symbol: "MOCK",
      tokenAddress: process.env.MOCK_TOKEN_ADDRESS,
      feedAddress: process.env.MOCK_AGGREGATOR,
      minTokenPriceUsd: 0n,
    });
  }

  if (tokens.length === 0) {
    console.log(`\nNo tokens configured. Exiting.`);
    return;
  }

  // ── Register each token ───────────────────────────────────────────────────
  for (const t of tokens) {
    console.log(`\n─── ${t.symbol} ───────────────────────────────────────────`);
    console.log(`  Token : ${t.tokenAddress}`);
    console.log(`  Feed  : ${t.feedAddress}`);
    console.log(`  Floor : Pending dynamic calculation...`);

    // Check if already registered (enabled flag)
    const cfg = await paymaster.tokenConfigs(t.tokenAddress);
    if (cfg.enabled) {
      console.log(`  ℹ  Already enabled — skipping addToken.`);
      continue;
    }

    // If registered but disabled, just re-enable
    if (cfg.decimals > 0 && !cfg.enabled) {
      console.log(`  Token exists but is disabled — re-enabling…`);
      const txEnable = await paymaster.setTokenEnabled(t.tokenAddress, true);
      await txEnable.wait();
      console.log(`  ✅ Re-enabled ${t.symbol}.`);
      continue;
    }

    // Fetch feed decimals dynamically
    const feedContract = await ethers.getContractAt(["function decimals() view returns (uint8)"], t.feedAddress, owner);
    const feedDecimals = await feedContract.decimals();
    const dynamicFloor = ethers.parseUnits("0.95", feedDecimals);
    
    console.log(`  Calculated dynamic floor ($0.95): ${dynamicFloor.toString()} (feed decimals: ${feedDecimals})`);

    // Fresh registration
    console.log(`  Calling addToken…`);
    const tx = await paymaster.addToken(
      t.tokenAddress,
      t.feedAddress,
      dynamicFloor,
    );
    await tx.wait();
    console.log(`  ✅ ${t.symbol} added successfully!  (tx: ${tx.hash})`);
  }

  // ── Final status summary ──────────────────────────────────────────────────
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Registered tokens:`);
  const count = await paymaster.supportedTokenCount();
  for (let i = 0n; i < count; i++) {
    const addr = await paymaster.supportedTokens(i);
    const cfg  = await paymaster.tokenConfigs(addr);
    console.log(
      `  [${i}] ${addr}  enabled=${cfg.enabled}  decimals=${cfg.decimals}`,
    );
  }
  console.log(`${"=".repeat(60)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


/**
 *  npx hardhat run scripts/addToken.ts --network amoy


Network : amoy
Account : 0x878344AF84A404439Ea37cFB9b30DeFd7938741C
Paymaster: 0x9f6142e7212E73925bEC550F303Cd19d466C5a88

─── USDC ───────────────────────────────────────────
  Token : 0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582
  Feed  : 0x1b8739bB4CdF0089d07097A9Ae5Bd274b29C6F16
  Floor : $0.95
  ℹ  Already enabled — skipping addToken.

============================================================
Registered tokens:
  [0] 0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582  enabled=true  decimals=6
============================================================

jatinsharma@Akshay-709-M1-C07JY0FDQ6P0 Account-abstraction-With-frontend % 

jatinsharma@Akshay-709-M1-C07JY0FDQ6P0 Account-abstraction-With-frontend % npx hardhat run scripts/addToken.ts --network sepolia


Network : sepolia
Account : 0x878344AF84A404439Ea37cFB9b30DeFd7938741C
Paymaster: 0x9f6142e7212E73925bEC550F303Cd19d466C5a88

─── USDC ───────────────────────────────────────────
  Token : 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
  Feed  : 0x79167C9Dccc113Da5b0B03425098bfD0cE211b8e
  Floor : $0.95
  ℹ  Already enabled — skipping addToken.

============================================================
Registered tokens:
  [0] 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238  enabled=true  decimals=6
============================================================

 */