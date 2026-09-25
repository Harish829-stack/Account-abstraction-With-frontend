// financial-agent/financial/chainlinkPriceService.js
// ─────────────────────────────────────────────────────────────────────────────
// On-chain Chainlink price feed reader.
// Reads latestRoundData() + decimals() per feed, validates freshness,
// and caches results in Redis.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const { ethers } = require('ethers');
const { getFeedAddress, listFeeds } = require('../config/priceFeeds');
const { cacheGet, cacheSet } = require('../db/redisClient');

// Minimal ABI for Chainlink AggregatorV3Interface
const AGGREGATOR_ABI = [
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() view returns (uint8)',
];

const MAX_AGE_SECONDS = Number(process.env.CHAINLINK_MAX_PRICE_AGE_SECONDS || 3600);
const CACHE_TTL = 60; // 1 minute for price data

/**
 * Fetch the USD price for a symbol from Chainlink.
 * @param {ethers.Provider} provider
 * @param {number} chainId
 * @param {string} symbol  e.g. 'ETH_USD'
 * @returns {Promise<{symbol: string, priceUsd: string, feedAddress: string, feedDecimals: number, updatedAt: number, isStale: boolean}|null>}
 */
async function getChainlinkPrice(provider, chainId, symbol) {
  const cacheKey = `price:${chainId}:${symbol}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const feedAddress = getFeedAddress(chainId, symbol);
  if (!feedAddress) {
    console.warn(`[Chainlink] No feed configured for ${symbol} on chain ${chainId}`);
    return null;
  }

  try {
    const feed = new ethers.Contract(feedAddress, AGGREGATOR_ABI, provider);
    const [roundData, decimals] = await Promise.all([
      feed.latestRoundData(),
      feed.decimals(),
    ]);

    const { answer, updatedAt } = roundData;

    // Validate: answer must be positive
    if (answer <= 0n) {
      console.error(`[Chainlink] Non-positive answer for ${symbol}: ${answer}`);
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const updatedAtNum = Number(updatedAt);
    const isStale = (now - updatedAtNum) > MAX_AGE_SECONDS;

    if (isStale) {
      console.warn(`[Chainlink] ${symbol} feed is stale — last updated ${now - updatedAtNum}s ago`);
    }

    // Normalize: price = answer / 10^decimals
    const divisor = 10n ** BigInt(decimals);
    const priceUsd = (Number(answer) / Number(divisor)).toFixed(6);

    const result = {
      chainId,
      symbol,
      priceUsd,
      feedAddress,
      feedDecimals: Number(decimals),
      updatedAt: updatedAtNum,
      isStale,
    };

    if (!isStale) {
      await cacheSet(cacheKey, result, CACHE_TTL);
    }

    return result;
  } catch (err) {
    console.error(`[Chainlink] Failed to fetch ${symbol} on chain ${chainId}:`, err.message);
    return null;
  }
}

/**
 * Fetch all configured prices for a chain.
 * Returns a map of symbol → price object (null entries are omitted).
 * @param {ethers.Provider} provider
 * @param {number} chainId
 * @returns {Promise<Record<string, object>>}
 */
async function getAllPrices(provider, chainId) {
  const symbols = listFeeds(chainId);
  const results = await Promise.allSettled(
    symbols.map((sym) => getChainlinkPrice(provider, chainId, sym))
  );

  const prices = {};
  results.forEach((result, i) => {
    if (result.status === 'fulfilled' && result.value) {
      prices[symbols[i]] = result.value;
    }
  });
  return prices;
}

/**
 * Get USD price as a plain number for a given asset symbol.
 * Returns null if unavailable or stale.
 * @param {ethers.Provider} provider
 * @param {number} chainId
 * @param {string} assetSymbol  'ETH' | 'USDC' | 'BTC' etc.
 * @returns {Promise<number|null>}
 */
async function getPriceUsd(provider, chainId, assetSymbol) {
  const feedKey = `${assetSymbol.toUpperCase()}_USD`;
  const data = await getChainlinkPrice(provider, chainId, feedKey);
  if (!data || data.isStale) return null;
  return parseFloat(data.priceUsd);
}

module.exports = { getChainlinkPrice, getAllPrices, getPriceUsd };
