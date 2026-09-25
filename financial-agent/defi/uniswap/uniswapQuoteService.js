// financial-agent/defi/uniswap/uniswapQuoteService.js
// ─────────────────────────────────────────────────────────────────────────────
// Read-only Uniswap V3 QuoterV2 integration.
// Calls quoteExactInputSingle() — does NOT execute any swap.
// Reference: https://docs.uniswap.org/contracts/v3/reference/periphery/lens/QuoterV2
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const { ethers } = require('ethers');
const { getChainConfig } = require('../../config/chains');
const { cacheGet, cacheSet } = require('../../db/redisClient');

const CACHE_TTL = Number(process.env.UNISWAP_QUOTE_CACHE_SECONDS || 15);

// QuoterV2 ABI — quoteExactInputSingle is a static call
const QUOTER_V2_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
];

// Minimal ERC-20 ABI
const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

/**
 * Fee tier constants (basis points × 100)
 * @type {Record<string, number>}
 */
const FEE_TIERS = {
  LOW: 500,    // 0.05%
  MEDIUM: 3000, // 0.30%
  HIGH: 10000, // 1.00%
};

/**
 * Get a Uniswap V3 quote for an exact-input swap.
 * This is a STATIC CALL — no transaction is created.
 *
 * @param {ethers.Provider} provider
 * @param {number} chainId
 * @param {{
 *   tokenIn: string,    // token address
 *   tokenOut: string,   // token address
 *   amountIn: string,   // human-readable amount (e.g. "1.0")
 *   feeTier?: number    // 500 | 3000 | 10000
 * }} params
 * @returns {Promise<{
 *   chainId: number,
 *   tokenIn: string,
 *   tokenInSymbol: string,
 *   tokenOut: string,
 *   tokenOutSymbol: string,
 *   amountIn: string,
 *   quotedAmountOut: string,
 *   quotedAmountOutFormatted: string,
 *   feeTier: number,
 *   gasEstimate: string,
 *   timestamp: number
 * }>}
 */
async function getUniswapQuote(provider, chainId, { tokenIn, tokenOut, amountIn, feeTier }) {
  const chain = getChainConfig(chainId);

  if (!chain.uniswapQuoterV2Address) {
    throw new Error(`Uniswap QuoterV2 is not configured for chain ${chainId}`);
  }

  const fee = feeTier ?? FEE_TIERS.MEDIUM;
  const cacheKey = `uniswap:quote:${chainId}:${tokenIn}:${tokenOut}:${amountIn}:${fee}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  // Fetch decimals for both tokens
  const tokenInContract = new ethers.Contract(tokenIn, ERC20_ABI, provider);
  const tokenOutContract = new ethers.Contract(tokenOut, ERC20_ABI, provider);

  const [inDecimals, inSymbol, outDecimals, outSymbol] = await Promise.all([
    tokenInContract.decimals(),
    tokenInContract.symbol(),
    tokenOutContract.decimals(),
    tokenOutContract.symbol(),
  ]);

  const amountInWei = ethers.parseUnits(amountIn, inDecimals);

  // QuoterV2.quoteExactInputSingle is a view function that must be called statically
  const quoter = new ethers.Contract(chain.uniswapQuoterV2Address, QUOTER_V2_ABI, provider);

  let quoteResult;
  try {
    quoteResult = await quoter.quoteExactInputSingle.staticCall({
      tokenIn,
      tokenOut,
      amountIn: amountInWei,
      fee,
      sqrtPriceLimitX96: 0n, // no price limit
    });
  } catch (err) {
    throw new Error(`Uniswap QuoterV2 call failed: ${err.message}. Check pool exists for fee tier ${fee}`);
  }

  const [amountOut, , , gasEstimate] = quoteResult;
  const quotedAmountOutFormatted = ethers.formatUnits(amountOut, outDecimals);

  const result = {
    chainId,
    tokenIn,
    tokenInSymbol: inSymbol,
    tokenOut,
    tokenOutSymbol: outSymbol,
    amountIn,
    quotedAmountOut: amountOut.toString(),
    quotedAmountOutFormatted,
    feeTier: fee,
    gasEstimate: gasEstimate.toString(),
    timestamp: Math.floor(Date.now() / 1000),
    disclaimer: 'This is an indicative quote only. Actual execution price may differ due to slippage, MEV, and market movement between quote and execution.',
  };

  await cacheSet(cacheKey, result, CACHE_TTL);
  return result;
}

module.exports = { getUniswapQuote, FEE_TIERS };
