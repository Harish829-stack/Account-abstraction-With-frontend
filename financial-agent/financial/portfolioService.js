// financial-agent/financial/portfolioService.js
// ─────────────────────────────────────────────────────────────────────────────
// Portfolio aggregation: reads native + all chain.tokens ERC-20 balances from
// the blockchain, enriches with Chainlink prices, returns a PortfolioSnapshot.
//
// Token list is driven entirely by config/chains.js — no hardcoding here.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const { ethers } = require('ethers');
const { getChainConfig } = require('../config/chains');
const { getPriceUsd } = require('./chainlinkPriceService');

// Minimal ERC-20 ABI — only what we need
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

// Stablecoin accounting fallback when Chainlink is unavailable
const STABLE_ACCOUNTING_PRICE_USD = 1.0;

// Tokens with zero balance are excluded from the snapshot to keep output clean
const INCLUDE_ZERO_BALANCE = false;

/**
 * Build a portfolio snapshot for a smart account on a given chain.
 * Reads native ETH + every token listed in chain.tokens.
 *
 * @param {ethers.Provider} provider
 * @param {number} chainId
 * @param {string} walletAddress
 * @returns {Promise<PortfolioSnapshot>}
 */
async function getPortfolioSnapshot(provider, chainId, walletAddress) {
  const chain = getChainConfig(chainId);
  const assets = [];

  // ── 1. Native balance (ETH / POL / etc.) ───────────────────────────────────
  const nativeBalRaw   = await provider.getBalance(walletAddress);
  const nativeDecimals = 18;
  const nativeFmt      = ethers.formatUnits(nativeBalRaw, nativeDecimals);

  let nativePrice = await getPriceUsd(provider, chainId, chain.nativeSymbol);
  if (nativePrice === null) nativePrice = 0;

  const nativeValueUsd = parseFloat(nativeFmt) * nativePrice;

  assets.push({
    symbol:               chain.nativeSymbol,
    tokenAddress:         null,
    balanceRaw:           nativeBalRaw.toString(),
    balanceFormatted:     nativeFmt,
    decimals:             nativeDecimals,
    priceUsd:             nativePrice,
    valueUsd:             nativeValueUsd,
    allocationPercentage: 0,
  });

  // ── 2. ERC-20 tokens from chain.tokens list ────────────────────────────────
  const knownTokens = chain.tokens ?? [];

  for (const tokenCfg of knownTokens) {
    try {
      const contract = new ethers.Contract(tokenCfg.address, ERC20_ABI, provider);

      // Read balance, decimals, symbol in one round-trip
      const [balRaw, decimals, onChainSymbol] = await Promise.all([
        contract.balanceOf(walletAddress),
        contract.decimals(),
        contract.symbol(),
      ]);

      const balFmt = ethers.formatUnits(balRaw, decimals);

      // Skip zero-balance tokens unless configured to include them
      if (!INCLUDE_ZERO_BALANCE && balRaw === 0n) continue;

      // Price lookup — use the tokenCfg.priceSymbol hint (e.g. 'USDC' or 'ETH')
      let priceUsd = await getPriceUsd(provider, chainId, tokenCfg.priceSymbol);
      if (priceUsd === null) {
        // For stablecoins fall back to $1.00 accounting assumption
        const isStable = ['USDC', 'USDT', 'DAI', 'EURS', 'GHO'].some(s =>
          tokenCfg.symbol.toUpperCase().includes(s)
        );
        priceUsd = isStable ? STABLE_ACCOUNTING_PRICE_USD : 0;
      }

      const valueUsd = parseFloat(balFmt) * priceUsd;

      assets.push({
        symbol:               tokenCfg.symbol,       // configured label (e.g. "USDC", "aaveUSDC", "WETH")
        onChainSymbol:        onChainSymbol,          // raw on-chain symbol() return
        tokenAddress:         tokenCfg.address,
        balanceRaw:           balRaw.toString(),
        balanceFormatted:     balFmt,
        decimals:             Number(decimals),
        priceUsd,
        valueUsd,
        allocationPercentage: 0,
        priceNote: priceUsd === STABLE_ACCOUNTING_PRICE_USD && tokenCfg.priceSymbol === 'USDC'
          ? 'Accounting assumption: 1 USDC ≈ $1.00 (Chainlink feed unavailable)'
          : undefined,
      });
    } catch (err) {
      console.error(`[Portfolio] Failed to read ${tokenCfg.symbol} (${tokenCfg.address}):`, err.message);
    }
  }

  // ── 3. Totals and allocation percentages ───────────────────────────────────
  const totalValueUsd = assets.reduce((sum, a) => sum + a.valueUsd, 0);
  for (const asset of assets) {
    asset.allocationPercentage =
      totalValueUsd > 0 ? (asset.valueUsd / totalValueUsd) * 100 : 0;
  }

  return {
    walletAddress,
    chainId,
    timestamp:    Math.floor(Date.now() / 1000),
    totalValueUsd,
    assets,
  };
}

module.exports = { getPortfolioSnapshot };
