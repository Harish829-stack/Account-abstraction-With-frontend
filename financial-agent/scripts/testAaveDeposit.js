const { ethers } = require('ethers');
require('dotenv').config();

// ── OFFICIAL VERIFIED ETHEREUM SEPOLIA ADDRESSES (AAVE V3) ──
const SEPOLIA_LINK = '0xf8Fb3713D459D7C1018BD0A49D19b4C44290EBE5'; // Using LINK (mintable + uncapped supply)
const SEPOLIA_FAUCET = '0xC959483DBa39aa9E78757139af0e9a2EDEb3f42D';
const SEPOLIA_AAVE_POOL = '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951';

// Minimal ABIs
const FAUCET_ABI = [
  'function mint(address token, address to, uint256 amount) external'
];
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)'
];
const AAVE_POOL_ABI = [
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external'
];

async function executeSepoliaAaveWorkflow() {
  if (!process.env.AGENT_PRIVATE_KEY) {
    throw new Error('AGENT_PRIVATE_KEY is missing from .env');
  }
  
  console.log('🔗 Connecting to Sepolia...');
  const provider = new ethers.JsonRpcProvider(process.env.ETHEREUM_SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY, provider);
  
  console.log(`👤 Using Account: ${wallet.address}`);

  // 100 LINK (18 decimals)
  const amountToMintAndSupply = ethers.parseUnits('10000', 18);

  // -------------------------------------------------------------
  // STEP 1: Direct Faucet Call (Minting mock Sepolia LINK)
  // -------------------------------------------------------------
  console.log('\n🚰 Invoking Aave Faucet directly...');
  const faucet = new ethers.Contract(SEPOLIA_FAUCET, FAUCET_ABI, wallet);
  try {
    const mintTx = await faucet.mint(SEPOLIA_LINK, wallet.address, amountToMintAndSupply);
    console.log(`   ⏳ Mint Tx sent: ${mintTx.hash}`);
    await mintTx.wait(1);
    console.log(`   ✅ Faucet Mint Success!`);
  } catch (error) {
    console.error(`   ❌ Mint failed:`, error.message);
    return;
  }

  // -------------------------------------------------------------
  // STEP 2: ERC-20 Approve Call (Allowing Aave Pool to withdraw LINK)
  // -------------------------------------------------------------
  console.log('\n🔓 Granting token allowance to Aave Pool...');
  const link = new ethers.Contract(SEPOLIA_LINK, ERC20_ABI, wallet);
  try {
    const approveTx = await link.approve(SEPOLIA_AAVE_POOL, amountToMintAndSupply);
    console.log(`   ⏳ Approve Tx sent: ${approveTx.hash}`);
    await approveTx.wait(1);
    console.log(`   ✅ Token Approval Confirmed!`);
  } catch (error) {
    console.error(`   ❌ Approval failed:`, error.message);
    return;
  }

  // -------------------------------------------------------------
  // STEP 3: Direct Pool Supply Call (Submitting to Yield Pool)
  // -------------------------------------------------------------
  console.log('\n💰 Depositing LINK directly into the Sepolia Yield Pool...');
  const pool = new ethers.Contract(SEPOLIA_AAVE_POOL, AAVE_POOL_ABI, wallet);
  try {
    const supplyTx = await pool.supply(
      SEPOLIA_LINK, 
      amountToMintAndSupply, 
      wallet.address, 
      0 // referral code
    );
    console.log(`   ⏳ Supply Tx sent: ${supplyTx.hash}`);
    await supplyTx.wait(1);
    console.log(`   🎉 Success! Funds are earning testnet APY.`);
  } catch (error) {
    console.error(`   ❌ Supply failed:`, error.message);
  }
}

executeSepoliaAaveWorkflow().catch(console.error);
