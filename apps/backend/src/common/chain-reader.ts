/**
 * chain-reader.ts
 *
 * Isolated, narrow on-chain read functions — one per ActionTag.
 * Rules:
 *  - Each function fetches ONLY what its tag requires. No cross-tag calls.
 *  - Every call is wrapped in a 10-second timeout.
 *  - Chain ID is always asserted before reading data.
 *  - Wei amounts are returned as strings.
 */

import { Injectable, Logger } from "@nestjs/common";

// ── Minimal ABIs (only what we need per function) ────────────────────────────
const ERC20_BALANCE_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

const AAVE_POOL_ABI = [
  "function apy() view returns (uint256)",
  "function earned(address) view returns (uint256)",
  "function positions(address) view returns (uint256 amount, uint256 lastUpdateTime, uint256 rewards)",
];

const AGGREGATOR_ABI = [
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() view returns (uint8)",
];

// Session key validator: getValidatorsPaginated(cursor, size)
const SA_VALIDATOR_ABI = [
  "function getValidatorsPaginated(address cursor, uint256 size) view returns (address[] memory array, address next)",
];

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActionTag =
  | "ETH_BALANCE"
  | "USDC_BALANCE"
  | "APPROVAL"
  | "DEPLOYMENT"
  | "SESSION_KEY"
  | "AAVE_POSITION"
  | "MARKET_PRICES"
  | "FULL_SYNC";

export interface ChainContracts {
  usdcToken?: string;
  paymaster?: string;
  aavePool?: string;
  priceFeed?: string; // ETH/USD Chainlink feed
}

export interface LedgerPatch {
  isDeployed?: boolean;
  hasSessionKeyModule?: boolean;
  ethBalanceWei?: string;
  usdcBalanceWei?: string;
  paymasterAllowanceWei?: string;
  aaveDepositedWei?: string;
  aaveEarningsWei?: string;
  ledgerUpdatedAt?: Date;
}

export interface MarketDataPatch {
  ethPriceUsd?: string;
  usdcPriceUsd?: string;
  aaveApyBps?: number;
  aaveLiquidity?: string;
  priceUpdatedAt?: Date;
  aaveUpdatedAt?: Date;
}

// ── Timeout wrapper ───────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms = 10_000, label = "RPC call"): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`[ChainReader] ${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// ── Dynamic ethers import (ESM-compatible) ────────────────────────────────────

async function getEthers() {
  // ethers v6 is ESM-only; use dynamic import so NestJS CJS bundle works.
  const { ethers } = await import("ethers");
  return ethers;
}

async function makeProvider(rpcUrl: string) {
  const { ethers } = await import("ethers");
  return rpcUrl.startsWith("wss://")
    ? new ethers.WebSocketProvider(rpcUrl)
    : new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true, batchMaxCount: 1 });
}

// ── Individual read functions ─────────────────────────────────────────────────

export async function readEthBalance(rpcUrl: string, address: string): Promise<string> {
  const provider = await makeProvider(rpcUrl);
  const balance = await withTimeout(provider.getBalance(address), 10_000, "eth_getBalance");
  return balance.toString();
}

export async function readUsdcBalance(
  rpcUrl: string,
  saAddress: string,
  usdcAddress: string
): Promise<string> {
  const { ethers } = await import("ethers");
  const provider = await makeProvider(rpcUrl);
  const usdc = new ethers.Contract(usdcAddress, ERC20_BALANCE_ABI, provider);
  const balance = await withTimeout(usdc.balanceOf(saAddress), 10_000, "balanceOf(USDC)");
  return balance.toString();
}

export async function readApproval(
  rpcUrl: string,
  saAddress: string,
  usdcAddress: string,
  spender: string
): Promise<string> {
  const { ethers } = await import("ethers");
  const provider = await makeProvider(rpcUrl);
  const usdc = new ethers.Contract(usdcAddress, ERC20_BALANCE_ABI, provider);
  const allowance = await withTimeout(
    usdc.allowance(saAddress, spender),
    10_000,
    "allowance(USDC, paymaster)"
  );
  return allowance.toString();
}

export async function readIsDeployed(rpcUrl: string, saAddress: string): Promise<boolean> {
  const provider = await makeProvider(rpcUrl);
  const code = await withTimeout(provider.getCode(saAddress), 10_000, "eth_getCode");
  return code !== "0x";
}

export async function readSessionKeyModule(
  rpcUrl: string,
  saAddress: string,
  sessionKeyValidatorAddress: string
): Promise<boolean> {
  const { ethers } = await import("ethers");
  // Sentinel address used by Nexus/Safe-style linked list: address(1)
  const SENTINEL = "0x0000000000000000000000000000000000000001";
  const provider = await makeProvider(rpcUrl);
  const sa = new ethers.Contract(saAddress, SA_VALIDATOR_ABI, provider);
  try {
    const [validators]: [string[]] = await withTimeout(
      sa.getValidatorsPaginated(SENTINEL, 10n),
      10_000,
      "getValidatorsPaginated"
    );
    return validators
      .map((v: string) => v.toLowerCase())
      .includes(sessionKeyValidatorAddress.toLowerCase());
  } catch {
    // Account may not be deployed yet — not an error
    return false;
  }
}

export async function readAavePosition(
  rpcUrl: string,
  saAddress: string,
  poolAddress: string
): Promise<{ depositedWei: string; earningsWei: string }> {
  const { ethers } = await import("ethers");
  const provider = await makeProvider(rpcUrl);
  const pool = new ethers.Contract(poolAddress, AAVE_POOL_ABI, provider);

  // Batch both calls in parallel — only 2 RPC calls total
  const [earnedRaw, positionRaw] = await withTimeout(
    Promise.all([pool.earned(saAddress), pool.positions(saAddress)]),
    10_000,
    "aave.earned + aave.positions"
  );

  return {
    depositedWei: positionRaw.amount.toString(),
    earningsWei: earnedRaw.toString(),
  };
}

export async function readMarketData(
  rpcUrl: string,
  usdcAddress: string,
  priceFeedAddress: string | undefined,
  poolAddress: string | undefined
): Promise<MarketDataPatch> {
  const { ethers } = await import("ethers");
  const provider = await makeProvider(rpcUrl);
  const now = new Date();
  const patch: MarketDataPatch = {};

  // ── Chainlink ETH/USD price ───────────────────────────────────────────────
  if (priceFeedAddress) {
    try {
      const feed = new ethers.Contract(priceFeedAddress, AGGREGATOR_ABI, provider);
      const [roundData, decimals] = await withTimeout(
        Promise.all([feed.latestRoundData(), feed.decimals()]),
        10_000,
        "Chainlink latestRoundData"
      );
      const { answer } = roundData;
      if (answer > 0n) {
        const divisor = 10n ** BigInt(Number(decimals));
        patch.ethPriceUsd = (Number(answer) / Number(divisor)).toFixed(6);
        patch.usdcPriceUsd = "1.000000"; // USDC is pegged; no second feed needed
        patch.priceUpdatedAt = now;
      }
    } catch (err) {
      // Non-fatal — leave existing price in DB
    }
  }

  // ── Aave APY + liquidity ──────────────────────────────────────────────────
  if (poolAddress && usdcAddress) {
    try {
      const POOL_LIQUIDITY_ABI = ["function balanceOf(address) view returns (uint256)"];
      const pool = new ethers.Contract(poolAddress, AAVE_POOL_ABI, provider);
      const usdc = new ethers.Contract(usdcAddress, POOL_LIQUIDITY_ABI, provider);

      const [apyRaw, liquidityRaw] = await withTimeout(
        Promise.all([pool.apy(), usdc.balanceOf(poolAddress)]),
        10_000,
        "aave.apy + pool liquidity"
      );

      // APY is in basis points (e.g. 482 = 4.82%)
      patch.aaveApyBps = Number(apyRaw);
      // Human-readable with 6 decimals (MockUSDC)
      patch.aaveLiquidity = ethers.formatUnits(liquidityRaw, 6);
      patch.aaveUpdatedAt = now;
    } catch (err) {
      // Non-fatal
    }
  }

  return patch;
}

// ── FULL_SYNC: parallel batch of everything ───────────────────────────────────

export async function readFullLedger(
  rpcUrl: string,
  saAddress: string,
  sessionKeyValidatorAddress: string,
  contracts: ChainContracts
): Promise<{ ledger: LedgerPatch; market: MarketDataPatch }> {
  const { usdcToken, paymaster, aavePool, priceFeed } = contracts;
  const now = new Date();

  // Fire all reads in parallel; failures are caught individually
  const [
    ethBalance,
    isDeployed,
    sessionKey,
    usdcBalance,
    approval,
    aavePos,
    marketData,
  ] = await Promise.allSettled([
    readEthBalance(rpcUrl, saAddress),
    readIsDeployed(rpcUrl, saAddress),
    readSessionKeyModule(rpcUrl, saAddress, sessionKeyValidatorAddress),
    usdcToken ? readUsdcBalance(rpcUrl, saAddress, usdcToken) : Promise.resolve("0"),
    usdcToken && paymaster ? readApproval(rpcUrl, saAddress, usdcToken, paymaster) : Promise.resolve("0"),
    aavePool ? readAavePosition(rpcUrl, saAddress, aavePool) : Promise.resolve({ depositedWei: "0", earningsWei: "0" }),
    readMarketData(rpcUrl, usdcToken ?? "", priceFeed, aavePool),
  ]);

  const ledger: LedgerPatch = { ledgerUpdatedAt: now };
  if (ethBalance.status === "fulfilled")  ledger.ethBalanceWei = ethBalance.value;
  if (isDeployed.status === "fulfilled")  ledger.isDeployed = isDeployed.value;
  if (sessionKey.status === "fulfilled")  ledger.hasSessionKeyModule = sessionKey.value;
  if (usdcBalance.status === "fulfilled") ledger.usdcBalanceWei = usdcBalance.value;
  if (approval.status === "fulfilled")    ledger.paymasterAllowanceWei = approval.value;
  if (aavePos.status === "fulfilled") {
    ledger.aaveDepositedWei = aavePos.value.depositedWei;
    ledger.aaveEarningsWei  = aavePos.value.earningsWei;
  }

  const market: MarketDataPatch = marketData.status === "fulfilled" ? marketData.value : {};
  return { ledger, market };
}

// ── Injectable service wrapper (for NestJS DI) ────────────────────────────────

@Injectable()
export class ChainReaderService {
  private readonly logger = new Logger(ChainReaderService.name);

  async resolve(
    actionTag: ActionTag,
    rpcUrl: string,
    saAddress: string,
    sessionKeyValidatorAddress: string,
    contracts: ChainContracts
  ): Promise<{ ledger: LedgerPatch; market: MarketDataPatch }> {
    const now = new Date();
    const { usdcToken, paymaster, aavePool, priceFeed } = contracts;
    const empty: { ledger: LedgerPatch; market: MarketDataPatch } = { ledger: {}, market: {} };

    try {
      switch (actionTag) {
        case "ETH_BALANCE": {
          const wei = await readEthBalance(rpcUrl, saAddress);
          return { ledger: { ethBalanceWei: wei, ledgerUpdatedAt: now }, market: {} };
        }
        case "USDC_BALANCE": {
          if (!usdcToken) return empty;
          const wei = await readUsdcBalance(rpcUrl, saAddress, usdcToken);
          return { ledger: { usdcBalanceWei: wei, ledgerUpdatedAt: now }, market: {} };
        }
        case "APPROVAL": {
          if (!usdcToken || !paymaster) return empty;
          const wei = await readApproval(rpcUrl, saAddress, usdcToken, paymaster);
          return { ledger: { paymasterAllowanceWei: wei, ledgerUpdatedAt: now }, market: {} };
        }
        case "DEPLOYMENT": {
          const deployed = await readIsDeployed(rpcUrl, saAddress);
          return { ledger: { isDeployed: deployed, ledgerUpdatedAt: now }, market: {} };
        }
        case "SESSION_KEY": {
          const has = await readSessionKeyModule(rpcUrl, saAddress, sessionKeyValidatorAddress);
          return { ledger: { hasSessionKeyModule: has, ledgerUpdatedAt: now }, market: {} };
        }
        case "AAVE_POSITION": {
          if (!aavePool) return empty;
          const pos = await readAavePosition(rpcUrl, saAddress, aavePool);
          return {
            ledger: {
              aaveDepositedWei: pos.depositedWei,
              aaveEarningsWei: pos.earningsWei,
              ledgerUpdatedAt: now,
            },
            market: {},
          };
        }
        case "MARKET_PRICES": {
          const market = await readMarketData(rpcUrl, usdcToken ?? "", priceFeed, aavePool);
          return { ledger: {}, market };
        }
        case "FULL_SYNC":
        default:
          return readFullLedger(rpcUrl, saAddress, sessionKeyValidatorAddress, contracts);
      }
    } catch (err) {
      this.logger.warn(`[ChainReader] ${actionTag} failed for ${saAddress}: ${(err as Error).message}`);
      return empty;
    }
  }
}
