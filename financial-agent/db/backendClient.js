// financial-agent/db/backendClient.js
// ─────────────────────────────────────────────────────────────────────────────
// Reads cached on-chain state and market data from the NestJS backend REST API.
// The financial-agent NEVER calls the blockchain for portfolio or price data —
// it reads the DB-backed cache served by apps/backend.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const BACKEND_URL = (process.env.BACKEND_API_URL || 'http://localhost:3001').replace(/\/$/, '');
const TIMEOUT_MS  = 8_000;

async function _get(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `Backend ${path} returned ${res.status}`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Get the cached on-chain ledger for a smart account from the NestJS backend.
 * Returns null if the account is not yet in the DB.
 *
 * @param {string} smartAccountAddress
 * @param {number} chainId
 * @returns {Promise<{
 *   isDeployed: boolean,
 *   hasSessionKeyModule: boolean,
 *   ethBalanceWei: string,
 *   usdcBalanceWei: string,
 *   paymasterAllowanceWei: string,
 *   aaveDepositedWei: string,
 *   aaveEarningsWei: string,
 *   ledgerUpdatedAt: string | null
 * } | null>}
 */
async function getLedger(smartAccountAddress, chainId) {
  try {
    return await _get(`/accounts/${smartAccountAddress}/ledger?chainId=${chainId}`);
  } catch (err) {
    console.warn('[BackendClient] getLedger failed:', err.message);
    return null;
  }
}

/**
 * Get cached Chainlink price + Aave market data for a chain from the NestJS backend.
 * Returns null if no market data has been synced yet.
 *
 * @param {number} chainId
 * @returns {Promise<{
 *   ethPriceUsd: string,
 *   usdcPriceUsd: string,
 *   aaveApyBps: number,
 *   aaveLiquidity: string,
 *   priceUpdatedAt: string | null,
 *   aaveUpdatedAt: string | null
 * } | null>}
 */
async function getMarketData(chainId) {
  try {
    return await _get(`/market/${chainId}`);
  } catch (err) {
    console.warn('[BackendClient] getMarketData failed:', err.message);
    return null;
  }
}

module.exports = { getLedger, getMarketData };
