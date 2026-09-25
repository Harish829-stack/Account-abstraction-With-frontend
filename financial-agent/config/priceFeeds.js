// financial-agent/config/priceFeeds.js
// ─────────────────────────────────────────────────────────────────────────────
// Chainlink Data Feed address registry.
// Live here — NOT in .env — because these are public on-chain addresses,
// not secrets.
//
// Verification checklist per feed:
//   ✓ Correct chain
//   ✓ Reports the intended asset pair
//   ✓ Decimals read via decimals() at runtime (not assumed)
//   ✓ Freshness validated against CHAINLINK_MAX_PRICE_AGE_SECONDS at runtime
//
// Sources:
//   Ethereum Sepolia:  https://docs.chain.link/data-feeds/price-feeds/addresses?network=ethereum#sepolia-testnet
//   Arbitrum Sepolia:  https://docs.chain.link/data-feeds/price-feeds/addresses?network=arbitrum#arbitrum-sepolia
//   Polygon Amoy:      https://docs.chain.link/data-feeds/price-feeds/addresses?network=polygon#amoy-testnet
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

/**
 * @type {Record<number, Record<string, string>>}
 * chainId → SYMBOL_USD → feed proxy address (checksummed)
 */
const CHAINLINK_FEEDS = {

  // ── Ethereum Sepolia (11155111) ────────────────────────────────────────────
  11155111: {
    ETH_USD:  '0x694AA1769357215DE4FAC081bf1f309aDC325306',
    // Corrected checksum (user-verified, ethers-validated)
    USDC_USD: '0xA2F78aB2355fE2F91b2813184337B31b504c2513',
    BTC_USD:  '0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43',
    LINK_USD: '0xc59E3633BAAC79493d908e63626716e204A45EdF',
  },

  // ── Arbitrum Sepolia (421614) ─────────────────────────────────────────────
  421614: {
    ETH_USD:  '0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165',
    USDC_USD: '0x011e525c56c2d1323b73373fa9f993d6b0521e8e',
  },

  // ── Polygon Amoy (80002) ──────────────────────────────────────────────────
  // Limited feed coverage — only use verified addresses
  80002: {
    MATIC_USD: '0x001382149eBa3441043c1c66972b4772963f5D43',
    ETH_USD:   '0xF0d50568e3A7e8259E16663972b11910F89BD8e7',
  },
};

/**
 * Get the proxy address for a feed symbol on a chain.
 * @param {number} chainId
 * @param {string} symbol  e.g. 'ETH_USD'
 * @returns {string|null}
 */
function getFeedAddress(chainId, symbol) {
  return CHAINLINK_FEEDS[chainId]?.[symbol] ?? null;
}

/**
 * List all feed symbols configured for a chain.
 * @param {number} chainId
 * @returns {string[]}
 */
function listFeeds(chainId) {
  return Object.keys(CHAINLINK_FEEDS[chainId] ?? {});
}

module.exports = { CHAINLINK_FEEDS, getFeedAddress, listFeeds };
