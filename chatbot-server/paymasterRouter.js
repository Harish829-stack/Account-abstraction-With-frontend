/**
 * paymasterRouter.js
 *
 * Implements the "Waterfall" gas routing strategy for AI Agent UserOps.
 *
 * Route A — Paymaster path (preferred):
 *   tokenBalance >= requiredTokenCost  AND  tokenAllowance >= requiredTokenCost
 *   → attach paymaster + token address as paymasterData
 *
 * Route B — Native ETH fallback:
 *   Route A check failed, but nativeBalance >= worstCaseEthFee
 *   → send UserOp without paymaster (0x)
 *
 * Route C — Hard failure:
 *   Both routes fail → throw, agent informs user
 */

'use strict';

const { ethers } = require('ethers');

// ── ABI fragments ─────────────────────────────────────────────────────────────
const ERC20_ABI_FRAGMENT = [
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

const ENTRY_POINT_ABI_FRAGMENT = [
  'function getDepositInfo(address) view returns (uint112 deposit, bool staked, uint112 stake, uint32 unstakeDelaySec, uint48 withdrawTime)',
];

// ── Constants ─────────────────────────────────────────────────────────────────
const GAS_BUFFER_BPS = 120n; // 20% buffer expressed as a multiplier (120/100)

/**
 * Estimates the worst-case ETH cost from a gas estimate object.
 * Uses callGasLimit + verificationGasLimit + preVerificationGas
 * plus optional paymaster gas limits (set to zero for our pre-flight pass).
 *
 * @param {object} gasEstimate - Result of eth_estimateUserOperationGas
 * @param {bigint} maxFeePerGas - Current network maxFeePerGas
 * @returns {bigint} Worst-case ETH fee in wei
 */
function calcWorstCaseEthFee(gasEstimate, maxFeePerGas) {
  const callGas = BigInt(gasEstimate.callGasLimit || 0);
  const verGas = BigInt(gasEstimate.verificationGasLimit || 0);
  const pvg = BigInt(gasEstimate.preVerificationGas || 0);
  // Include extra headroom for paymaster gas limits (if paymaster is eventually added)
  const pmVerGas = BigInt(gasEstimate.paymasterVerificationGasLimit || 150000);
  const pmPostGas = BigInt(gasEstimate.paymasterPostOpGasLimit || 150000);

  const totalGas = callGas + verGas + pvg + pmVerGas + pmPostGas;
  return totalGas * maxFeePerGas;
}

/**
 * Fetches the Smart Account's EntryPoint deposit balance.
 * This counts towards native gas coverage (Route B).
 *
 * @param {ethers.Provider} provider
 * @param {string} entryPointAddress
 * @param {string} smartAccountAddress
 * @returns {Promise<bigint>} deposit in wei
 */
async function getEntryPointDeposit(provider, entryPointAddress, smartAccountAddress) {
  try {
    const ep = new ethers.Contract(entryPointAddress, ENTRY_POINT_ABI_FRAGMENT, provider);
    const info = await ep.getDepositInfo(smartAccountAddress);
    return BigInt(info.deposit || 0n);
  } catch {
    return 0n;
  }
}

/**
 * Core waterfall router.
 *
 * @param {object} opts
 * @param {ethers.Provider}  opts.provider
 * @param {string}           opts.smartAccountAddress
 * @param {string}           opts.paymasterAddress     - Deployed ERC-20 Paymaster contract address
 * @param {string}           opts.gasTokenAddress      - Custom ERC-20 token address used for gas payment
 * @param {bigint}           opts.tokenEthExchangeRate - How many token-wei equal 1 ETH-wei (i.e., token amount per 1e18 wei)
 *                                                       e.g. if 1 ETH = 2000 USDC (6 dec): 2000e6 / 1e18  →  pass (2000n * 10n**6n)
 *                                                       More precisely: worstCaseTokens = worstCaseEthFee * tokenEthExchangeRate / 1e18
 * @param {object}           opts.gasEstimate          - Result of eth_estimateUserOperationGas (without paymaster)
 * @param {bigint}           opts.maxFeePerGas         - Current network maxFeePerGas
 * @param {string}           opts.entryPointAddress
 *
 * @returns {Promise<{
 *   route: 'A' | 'B',
 *   paymaster: string,
 *   paymasterVerificationGasLimit: string,
 *   paymasterPostOpGasLimit: string,
 *   paymasterData: string,
 *   gasNote: string,
 * }>}
 *
 * @throws {Error} on Route C (no native ETH and no token coverage)
 */
async function resolvePaymasterRoute(opts) {
  const {
    provider,
    smartAccountAddress,
    paymasterAddress,
    gasTokenAddress,
    tokenEthExchangeRate, // bigint: token-wei per ETH-wei (scaled to 1e18)
    gasEstimate,
    maxFeePerGas,
    entryPointAddress,
  } = opts;

  // ── Step 1: worst-case ETH fee ─────────────────────────────────────────────
  const worstCaseEthFee = calcWorstCaseEthFee(gasEstimate, maxFeePerGas);

  // ── Step 2: required token cost (with 20% buffer) ─────────────────────────
  // requiredTokenAmount = worstCaseEthFee * tokenEthExchangeRate / 1e18 * 1.2
  const ETH_SCALE = 10n ** 18n;
  const rawTokenCost = (worstCaseEthFee * tokenEthExchangeRate) / ETH_SCALE;
  const requiredTokenAmount = (rawTokenCost * GAS_BUFFER_BPS) / 100n;

  // ── Step 3: query on-chain state ───────────────────────────────────────────
  const gasToken = new ethers.Contract(gasTokenAddress, ERC20_ABI_FRAGMENT, provider);

  const [tokenBalance, tokenAllowance, nativeBalance, epDeposit] = await Promise.all([
    gasToken.balanceOf(smartAccountAddress).then(BigInt).catch(() => 0n),
    gasToken.allowance(smartAccountAddress, paymasterAddress).then(BigInt).catch(() => 0n),
    provider.getBalance(smartAccountAddress).then(BigInt).catch(() => 0n),
    getEntryPointDeposit(provider, entryPointAddress, smartAccountAddress),
  ]);

  const totalNativeAvailable = nativeBalance + epDeposit;

  console.log(
    `[PaymasterRouter] worstCaseEthFee=${ethers.formatEther(worstCaseEthFee)} ETH | ` +
    `requiredToken=${requiredTokenAmount.toString()} raw-units | ` +
    `tokenBal=${tokenBalance} | tokenAllowance=${tokenAllowance} | ` +
    `nativeBal=${ethers.formatEther(totalNativeAvailable)} ETH`
  );

  // ── Route A: Paymaster ─────────────────────────────────────────────────────
  const canUsePaymaster =
    paymasterAddress &&
    gasTokenAddress &&
    tokenBalance >= requiredTokenAmount &&
    tokenAllowance >= requiredTokenAmount;

  if (canUsePaymaster) {
    // Standard ERC-20 paymasters expect the 20-byte token address unpadded.
    const paymasterData = gasTokenAddress;

    console.log('[PaymasterRouter] Route A selected — Custom Token Paymaster');
    return {
      route: 'A',
      paymaster: paymasterAddress,
      paymasterVerificationGasLimit: '0x' + (150000n).toString(16),
      paymasterPostOpGasLimit: '0x' + (150000n).toString(16),
      paymasterData,
      gasNote: `⛽ Gas paid via custom token (${gasTokenAddress.slice(0, 6)}…).`,
    };
  }

  // ── Route B: Native ETH fallback ──────────────────────────────────────────
  const worstCaseEthWithBuffer = (worstCaseEthFee * GAS_BUFFER_BPS) / 100n;
  const canUseNative = totalNativeAvailable >= worstCaseEthWithBuffer;

  if (canUseNative) {
    const reason = tokenBalance < requiredTokenAmount
      ? `token balance (${tokenBalance.toString()} raw) below required (${requiredTokenAmount.toString()} raw)`
      : `token allowance (${tokenAllowance.toString()} raw) below required (${requiredTokenAmount.toString()} raw)`;

    console.log(`[PaymasterRouter] Route B selected — Native ETH fallback. Reason: ${reason}`);
    return {
      route: 'B',
      paymaster: '0x',
      paymasterVerificationGasLimit: '0x',
      paymasterPostOpGasLimit: '0x',
      paymasterData: '0x',
      gasNote: `⛽ Gas paid in native ETH (custom token ${reason}). Visit Gas Sponsorship to top up.`,
    };
  }

  // ── Route C: Hard failure ──────────────────────────────────────────────────
  console.warn('[PaymasterRouter] Route C — insufficient funds on both paths.');
  throw new Error(
    `Insufficient gas funds on all paths.\n` +
    `• Custom token: balance=${tokenBalance.toString()}, allowance=${tokenAllowance.toString()}, required≈${requiredTokenAmount.toString()} raw-units.\n` +
    `• Native ETH: available=${ethers.formatEther(totalNativeAvailable)} ETH, required≈${ethers.formatEther(worstCaseEthWithBuffer)} ETH.\n` +
    `Please deposit native ETH into your Smart Account or approve more tokens in the Gas Sponsorship view.`
  );
}

module.exports = { resolvePaymasterRoute, calcWorstCaseEthFee };
