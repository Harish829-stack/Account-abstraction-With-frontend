// financial-agent/defi/aave/aaveService.js
// ─────────────────────────────────────────────────────────────────────────────
// Reads data from our custom AaveYieldPool contract.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const { ethers } = require('ethers');
const { getChainConfig } = require('../../config/chains');
const { cacheGet, cacheSet } = require('../../db/redisClient');

const CACHE_TTL = Number(process.env.AAVE_MARKET_DATA_CACHE_SECONDS || 300);

const AAVE_YIELD_POOL_ABI = [
  'function apy() view returns (uint256)',
];
const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
];

/**
 * Read custom AaveYieldPool metrics on a chain.
 * @param {ethers.Provider} provider
 * @param {number} chainId
 */
async function getAaveUsdcMarket(provider, chainId) {
  const cacheKey = `financial:aave:${chainId}:usdc`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const chain = getChainConfig(chainId);
  if (!chain.aavePoolAddress) {
    throw new Error(`AaveYieldPool is not configured for chain ${chainId}`);
  }

  const usdcAddr = chain.usdcAddress;
  if (!usdcAddr) {
    throw new Error(`No USDC address configured for chain ${chainId}`);
  }

  const pool = new ethers.Contract(chain.aavePoolAddress, AAVE_YIELD_POOL_ABI, provider);
  const usdc = new ethers.Contract(usdcAddr, ERC20_ABI, provider);

  // Read APY from pool
  const apyRaw = await pool.apy();
  
  // Read available liquidity from USDC balance of the pool
  const balanceRaw = await usdc.balanceOf(chain.aavePoolAddress);
  
  const decimals = 6; // MockUSDC has 6 decimals
  const availableLiquidity = ethers.formatUnits(balanceRaw, decimals);
  
  // APY is in basis points (100 = 1%)
  const supplyApyPercentage = (Number(apyRaw) / 100).toFixed(4);

  const result = {
    chainId,
    asset: 'USDC',
    symbol: 'USDC',
    underlyingAddress: usdcAddr,
    availableLiquidity,
    supplyCap: '0', // Unlimited in Mock pool
    liquidityRateRay: '0',
    supplyApyPercentage,
    totalStableDebt: '0',
    totalVariableDebt: '0',
    isActive: true,
    isFrozen: false,
    poolAddress: chain.aavePoolAddress,
    dataProviderAddress: undefined,
    timestamp: Math.floor(Date.now() / 1000),
  };

  await cacheSet(cacheKey, result, CACHE_TTL);
  return result;
}

module.exports = { getAaveUsdcMarket };
