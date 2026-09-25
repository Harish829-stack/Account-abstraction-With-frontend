import hre from "hardhat";

// ─────────────────────────────────────────────────────────────────────────────
// Deploy AaveYieldPool via CREATE3 — deterministic across all chains.
//
// Canonical USDC: reuses the MockUSDC deployed by deployUniswapMock.ts
//   salt "MOCK_USDC_V1" → 0x4665ed736379C8B1BeDe411EBcDA607dd4cab96E
//
// We no longer deploy a separate MockERC20 (aMOCK). One token for everything.
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  // @ts-ignore
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();
  const CREATE3_FACTORY_ADDRESS =
    process.env.CREATE3_FACTORY || "0x220FF47e4E2094857e7e4FF4a5069fad5367EA3C";

  console.log(
    "Deploying AaveYieldPool via CREATE3 deterministically with account:",
    deployer.address
  );

  const create3Factory = await ethers.getContractAt(
    "CREATE3Factory",
    CREATE3_FACTORY_ADDRESS,
    deployer
  );

  // ── Helper ──────────────────────────────────────────────────────────────────
  async function deployViaCreate3(
    contractName: string,
    saltString: string,
    args: any[] = []
  ): Promise<string> {
    const salt = ethers.id(saltString);
    const expectedAddress = await create3Factory.getDeployed(deployer.address, salt);

    const code = await ethers.provider.getCode(expectedAddress);
    if (code === "0x") {
      const Factory = await ethers.getContractFactory(contractName);
      const tx = await Factory.getDeployTransaction(...args);
      const creationCode = tx.data;

      console.log(`Deploying ${contractName} to ${expectedAddress}...`);
      const deployTx = await create3Factory.deploy(salt, creationCode, {
        gasLimit: 8_000_000,
      });
      await deployTx.wait();
      console.log(`${contractName} deployed successfully!`);
    } else {
      console.log(`${contractName} already exists at ${expectedAddress}`);
    }

    return expectedAddress;
  }

  // ── Step 1: resolve canonical MockUSDC address (already deployed by deployUniswapMock.ts) ──
  // Same salt, same deployer → same deterministic address on every chain.
  const usdcSalt = "MOCK_USDC_V1";
  const usdcAddress = await create3Factory.getDeployed(
    deployer.address,
    ethers.id(usdcSalt)
  );
  const usdcCode = await ethers.provider.getCode(usdcAddress);
  if (usdcCode === "0x") {
    console.error(
      `\n❌  MockUSDC not found at ${usdcAddress}.\n` +
      `    Run deployUniswapMock.ts first to deploy the canonical MockUSDC.\n`
    );
    process.exitCode = 1;
    return;
  }
  console.log(`\nUsing canonical MockUSDC at ${usdcAddress}`);

  // ── Step 2: deploy AaveYieldPool using the canonical MockUSDC ──────────────
  // Salt V2 ensures a fresh pool that receives the right token.
  // Initial APY: 500 basis points = 5%
  const aaveYieldPoolSalt = "AAVE_YIELD_POOL_V2";
  const aaveYieldPoolAddress = await deployViaCreate3(
    "AaveYieldPool",
    aaveYieldPoolSalt,
    [usdcAddress, 500]
  );

  console.log("\n=================================");
  console.log("Deterministic Addresses:");
  console.log("MockUSDC (shared):  ", usdcAddress);
  console.log("AaveYieldPool:      ", aaveYieldPoolAddress);
  console.log("=================================\n");
  console.log("Update your .env / frontend config:");
  console.log(`  USDC_TOKEN="${usdcAddress}"`);
  console.log(`  AAVE_YIELD_POOL="${aaveYieldPoolAddress}"`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
