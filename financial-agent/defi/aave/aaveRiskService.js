// financial-agent/defi/aave/aaveRiskService.js
// ─────────────────────────────────────────────────────────────────────────────
// Risk analysis layer for Aave USDC supply.
// Produces structured risk assessment based on reserve metrics.
// Never claims an investment is safe or guaranteed.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

/**
 * @typedef {'LOW'|'MEDIUM'|'HIGH'|'UNKNOWN'} RiskLevel
 * @typedef {{ riskLevel: RiskLevel, reasons: string[], warnings: string[] }} AaveRiskAssessment
 */

/**
 * Assess risk of supplying USDC to an Aave reserve.
 * @param {{
 *   isActive: boolean,
 *   isFrozen: boolean,
 *   supplyApyPercentage: string,
 *   availableLiquidity: string,
 *   supplyCap: string,
 *   totalVariableDebt: string,
 * }} aaveMetrics
 * @returns {AaveRiskAssessment}
 */
function assessAaveSupplyRisk(aaveMetrics) {
  const reasons = [];
  const warnings = [];
  let riskScore = 0; // 0 = low, higher = higher risk

  // ── Hard blockers ─────────────────────────────────────────────────────────
  if (!aaveMetrics.isActive) {
    return {
      riskLevel: 'UNKNOWN',
      reasons: ['The reserve is not currently active'],
      warnings: ['Supplying is not possible when the reserve is inactive'],
    };
  }

  if (aaveMetrics.isFrozen) {
    return {
      riskLevel: 'HIGH',
      reasons: ['The reserve is currently frozen'],
      warnings: [
        'A frozen reserve does not accept new supply transactions',
        'Existing positions may be withdrawn but no new deposits are allowed',
      ],
    };
  }

  // ── Variable rate risk ────────────────────────────────────────────────────
  reasons.push('USDC supply rate is variable — it changes based on market conditions');
  riskScore += 1;

  // ── Supply cap proximity ──────────────────────────────────────────────────
  const supplyCapNum = parseFloat(aaveMetrics.supplyCap);
  const availLiqNum = parseFloat(aaveMetrics.availableLiquidity);
  if (supplyCapNum > 0) {
    const capUsageRatio = 1 - availLiqNum / supplyCapNum;
    if (capUsageRatio > 0.9) {
      reasons.push(`Supply cap is ${(capUsageRatio * 100).toFixed(1)}% utilized — near full`);
      warnings.push('The reserve may reject new deposits if the supply cap is reached');
      riskScore += 2;
    } else if (capUsageRatio > 0.7) {
      reasons.push(`Supply cap is ${(capUsageRatio * 100).toFixed(1)}% utilized — elevated`);
      riskScore += 1;
    }
  }

  // ── Liquidity availability ────────────────────────────────────────────────
  if (availLiqNum < 10_000) {
    reasons.push(`Low available liquidity ($${availLiqNum.toFixed(2)} USDC) may impact withdrawal timing`);
    warnings.push('Withdrawal may require waiting for borrower repayments if liquidity is low');
    riskScore += 2;
  }

  // ── Protocol and asset risks (always present) ─────────────────────────────
  reasons.push('Funds are held by Aave V3 smart contracts — subject to smart-contract risk');
  reasons.push('USDC stablecoin peg may temporarily deviate from $1.00');

  warnings.push('APY is not guaranteed and can change at any time');
  warnings.push('Aave protocol parameters (liquidation thresholds, caps) can change via governance');
  warnings.push('This is an estimate only — always verify current conditions on the Aave app');

  // ── Final risk level ──────────────────────────────────────────────────────
  let riskLevel;
  if (riskScore === 0) riskLevel = 'LOW';
  else if (riskScore <= 2) riskLevel = 'MEDIUM';
  else riskLevel = 'HIGH';

  return { riskLevel, reasons, warnings };
}

module.exports = { assessAaveSupplyRisk };
