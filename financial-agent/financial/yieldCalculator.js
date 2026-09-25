// financial-agent/financial/yieldCalculator.js
// ─────────────────────────────────────────────────────────────────────────────
// Pure calculation module — no network calls.
// Estimates yield from a principal, APY, and duration.
// All results are explicitly labelled as estimates.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

/**
 * Calculate a simple linear yield estimate.
 *
 * Formula: Interest = Principal × (APY / 100) × (Days / 365)
 * This is a linear approximation — not compound interest.
 *
 * @param {{
 *   principalUsdc: string,    // e.g. "1000.00"
 *   supplyApyPercentage: number, // e.g. 4.82
 *   durationDays: number      // e.g. 30
 * }} input
 * @returns {{
 *   principalUsdc: string,
 *   estimatedInterestUsdc: string,
 *   estimatedEndingBalanceUsdc: string,
 *   effectiveApyUsed: number,
 *   durationDays: number,
 *   assumptions: string[]
 * }}
 */
function calculateYieldScenario({ principalUsdc, supplyApyPercentage, durationDays }) {
  const principal = parseFloat(principalUsdc);
  if (!isFinite(principal) || principal <= 0) {
    throw new Error('principalUsdc must be a positive number');
  }
  if (!isFinite(supplyApyPercentage) || supplyApyPercentage < 0) {
    throw new Error('supplyApyPercentage must be non-negative');
  }
  if (!Number.isInteger(durationDays) || durationDays <= 0 || durationDays > 3650) {
    throw new Error('durationDays must be a positive integer up to 3650');
  }

  const interest = principal * (supplyApyPercentage / 100) * (durationDays / 365);
  const endingBalance = principal + interest;

  return {
    principalUsdc: principal.toFixed(6),
    estimatedInterestUsdc: interest.toFixed(6),
    estimatedEndingBalanceUsdc: endingBalance.toFixed(6),
    effectiveApyUsed: supplyApyPercentage,
    durationDays,
    assumptions: [
      `APY of ${supplyApyPercentage}% is the current displayed rate — it is variable and not guaranteed`,
      'Interest is calculated as a linear (simple) approximation, not compound',
      'No fees, slippage, or liquidity constraints are included',
      'USDC is assumed to maintain $1.00 peg throughout the period',
      'Aave protocol, smart-contract, and counterparty risks are not quantified here',
    ],
  };
}

/**
 * Calculate a portfolio scenario: how does portfolio value change if a price moves?
 * @param {{
 *   totalValueUsd: number,
 *   ethValueUsd: number,
 *   ethPriceUsd: number,
 *   priceChangePercent: number  // e.g. -10 means -10%
 * }} input
 * @returns {{
 *   originalValueUsd: number,
 *   newEthPriceUsd: number,
 *   newEthValueUsd: number,
 *   newTotalValueUsd: number,
 *   changeUsd: number,
 *   changePercent: number
 * }}
 */
function calculatePortfolioScenario({ totalValueUsd, ethValueUsd, ethPriceUsd, priceChangePercent }) {
  const newEthPriceUsd = ethPriceUsd * (1 + priceChangePercent / 100);
  const ethAmount = ethPriceUsd > 0 ? ethValueUsd / ethPriceUsd : 0;
  const newEthValueUsd = ethAmount * newEthPriceUsd;
  const stableValueUsd = totalValueUsd - ethValueUsd;
  const newTotalValueUsd = stableValueUsd + newEthValueUsd;
  const changeUsd = newTotalValueUsd - totalValueUsd;
  const changePercent = totalValueUsd > 0 ? (changeUsd / totalValueUsd) * 100 : 0;

  return {
    originalValueUsd: totalValueUsd,
    newEthPriceUsd,
    newEthValueUsd,
    newTotalValueUsd,
    changeUsd,
    changePercent,
  };
}

module.exports = { calculateYieldScenario, calculatePortfolioScenario };
