// financial-agent/server.js
// ─────────────────────────────────────────────────────────────────────────────
// Isolated Financial Intelligence Agent — Express sidecar on port 3003.
// Shares Postgres + Redis with apps/backend but adds only 3 new tables.
// Zero changes to chatbot-server/, apps/backend/, frontend/, or contracts.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');

const { runFinancialAgent } = require('./agent/financialAgent');
const { getLedger, getMarketData } = require('./db/backendClient');
const { assessAaveSupplyRisk } = require('./defi/aave/aaveRiskService');
const { getUniswapQuote } = require('./defi/uniswap/uniswapQuoteService');
const {
  createProposal,
  getProposal,
  confirmProposal,
  rejectProposal,
  advanceStatus,
  sweepExpiredProposals,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} = require('./transactions/proposalService');
const { getChainConfig } = require('./config/chains');
const { executeConfirmedProposal } = require('./transactions/executionService');

const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
const parseCorsOrigins = () => {
  const raw = process.env.CORS_ORIGINS || '';
  const origins = raw.split(',').map((o) => o.trim()).filter(Boolean);
  return origins.length > 0 ? origins : '*';
};

app.use(cors({ origin: parseCorsOrigins(), methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.options('/{*splat}', cors());
app.use(express.json({ limit: '1mb' }));

// ── Provider cache ────────────────────────────────────────────────────────────
const _providers = {};
function getProvider(chainId) {
  if (!_providers[chainId]) {
    const chain = getChainConfig(chainId);
    _providers[chainId] = chain.rpcUrl.startsWith('wss://')
      ? new ethers.WebSocketProvider(chain.rpcUrl)
      : new ethers.JsonRpcProvider(chain.rpcUrl);
  }
  return _providers[chainId];
}

// ── Error handler middleware ───────────────────────────────────────────────────
function handleError(err, res) {
  if (err instanceof NotFoundError || err instanceof ForbiddenError || err instanceof ConflictError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error('[Server Error]', err.message);
  return res.status(500).json({ error: err.message || 'Internal server error' });
}

// ── Validation helpers ────────────────────────────────────────────────────────
function requireAddress(value, field) {
  if (!value || !ethers.isAddress(value)) {
    throw Object.assign(new Error(`${field} must be a valid Ethereum address`), { statusCode: 400 });
  }
  return value.toLowerCase();
}

function requireChainId(value) {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) {
    throw Object.assign(new Error('chainId must be a positive integer'), { statusCode: 400 });
  }
  return id;
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'financial-agent',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

// ── POST /api/financial/chat ──────────────────────────────────────────────────
// Main agentic endpoint. The AI orchestrates read and prepare tools.
app.post('/api/financial/chat', async (req, res) => {
  try {
    const { message, smartAccountAddress, chainId, userId, agentAddress, conversationHistory, liveContext } = req.body;

    if (!message) return res.status(400).json({ error: 'message is required' });
    if (!smartAccountAddress) return res.status(400).json({ error: 'smartAccountAddress is required' });
    if (!userId) return res.status(400).json({ error: 'userId (EOA address) is required' });

    const resolvedChainId = requireChainId(chainId || 421614);
    requireAddress(smartAccountAddress, 'smartAccountAddress');

    const result = await runFinancialAgent({
      message,
      smartAccountAddress: smartAccountAddress.toLowerCase(),
      chainId: resolvedChainId,
      userId: userId.toLowerCase(),
      agentAddress,
      conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : [],
      liveContext,
    });

    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
});

// ── GET /api/financial/portfolio/:chainId/:wallet ─────────────────────────────
app.get('/api/financial/portfolio/:chainId/:wallet', async (req, res) => {
  try {
    const chainId = requireChainId(req.params.chainId);
    requireAddress(req.params.wallet, 'wallet');
    const ledger = await getLedger(req.params.wallet, chainId);
    const market = await getMarketData(chainId);

    const ethPrice  = market ? parseFloat(market.ethPriceUsd)  : 0;
    const usdcPrice = market ? parseFloat(market.usdcPriceUsd) : 1;
    
    const ethFormatted = ledger ? ethers.formatUnits(ledger.ethBalanceWei, 18) : '0';
    const usdcFormatted = ledger ? ethers.formatUnits(ledger.usdcBalanceWei, 6) : '0';
    
    const ethValueUsd = parseFloat(ethFormatted) * ethPrice;
    const usdcValueUsd = parseFloat(usdcFormatted) * usdcPrice;
    const totalValueUsd = ethValueUsd + usdcValueUsd;

    const snapshot = {
      walletAddress: req.params.wallet,
      chainId,
      timestamp: Math.floor(Date.now() / 1000),
      totalValueUsd,
      source: 'db_cache',
      ledgerUpdatedAt: ledger?.ledgerUpdatedAt ?? null,
      assets: [
        { symbol: 'ETH', tokenAddress: null, isEth: true, balanceRaw: ledger?.ethBalanceWei ?? '0', balanceFormatted: ethFormatted, decimals: 18, priceUsd: ethPrice, valueUsd: ethValueUsd, allocationPercentage: totalValueUsd > 0 ? (ethValueUsd / totalValueUsd) * 100 : 0 },
        { symbol: 'USDC', tokenAddress: getChainConfig(chainId).usdcAddress, isEth: false, balanceRaw: ledger?.usdcBalanceWei ?? '0', balanceFormatted: usdcFormatted, decimals: 6, priceUsd: usdcPrice, valueUsd: usdcValueUsd, allocationPercentage: totalValueUsd > 0 ? (usdcValueUsd / totalValueUsd) * 100 : 0 },
      ],
    };
    res.json(snapshot);
  } catch (err) {
    handleError(err, res);
  }
});

// ── GET /api/financial/market/prices ─────────────────────────────────────────
app.get('/api/financial/market/prices', async (req, res) => {
  try {
    const chainId = requireChainId(req.query.chainId || 421614);
    const market = await getMarketData(chainId);
    const prices = market ? {
      ETH_USD:  { priceUsd: market.ethPriceUsd, isStale: !market.priceUpdatedAt, updatedAt: market.priceUpdatedAt },
      USDC_USD: { priceUsd: market.usdcPriceUsd, isStale: false, updatedAt: market.priceUpdatedAt },
    } : {};
    res.json({ chainId, prices, timestamp: Math.floor(Date.now() / 1000) });
  } catch (err) {
    handleError(err, res);
  }
});

// ── GET /api/financial/aave/:chainId/usdc ────────────────────────────────────
app.get('/api/financial/aave/:chainId/usdc/:wallet?', async (req, res) => {
  try {
    const chainId = requireChainId(req.params.chainId);
    const wallet = req.params.wallet;
    const marketData = await getMarketData(chainId);
    const supplyApyPercentage = marketData ? (marketData.aaveApyBps / 100).toFixed(4) : "0.0000";
    const market = {
      chainId, asset: 'USDC', symbol: 'USDC',
      availableLiquidity: marketData?.aaveLiquidity ?? '0',
      supplyCap: '0', supplyApyPercentage, isActive: true, isFrozen: false, source: 'db_cache',
      timestamp: Math.floor(Date.now() / 1000),
    };

    let position = { earnings: "0", principal: "0", totalBalance: "0" };
    if (wallet) {
      const ledger = await getLedger(wallet, chainId);
      if (ledger) {
        const principalFloat = parseFloat(ethers.formatUnits(ledger.aaveDepositedWei || '0', 6));
        const earningsFloat = parseFloat(ethers.formatUnits(ledger.aaveEarningsWei || '0', 6));
        position = {
          principal: principalFloat.toFixed(6),
          earnings: earningsFloat.toFixed(6),
          totalBalance: (principalFloat + earningsFloat).toFixed(6),
        };
      }
    }

    const risk = assessAaveSupplyRisk({ supplyApyPercentage });
    res.json({ market, position, riskAssessment: risk });
  } catch (err) {
    handleError(err, res);
  }
});

// ── GET /api/financial/uniswap/quote ─────────────────────────────────────────
app.get('/api/financial/uniswap/quote', async (req, res) => {
  try {
    const { chainId, tokenIn, tokenOut, amountIn, feeTier } = req.query;
    if (!tokenIn || !tokenOut || !amountIn) {
      return res.status(400).json({ error: 'tokenIn, tokenOut, and amountIn are required' });
    }
    const resolvedChainId = requireChainId(chainId || 421614);
    requireAddress(tokenIn, 'tokenIn');
    requireAddress(tokenOut, 'tokenOut');

    const provider = getProvider(resolvedChainId);
    const quote = await getUniswapQuote(provider, resolvedChainId, {
      tokenIn,
      tokenOut,
      amountIn,
      feeTier: feeTier ? Number(feeTier) : undefined,
    });
    res.json(quote);
  } catch (err) {
    handleError(err, res);
  }
});

// ── POST /api/financial/proposals ────────────────────────────────────────────
// Create a proposal directly (without going through the agent).
app.post('/api/financial/proposals', async (req, res) => {
  try {
    const { userId, smartAccountAddress, agentAddress, chainId, action, calls, displayedSummary, financialContext } = req.body;
    if (!userId || !smartAccountAddress || !chainId || !action || !calls) {
      return res.status(400).json({ error: 'userId, smartAccountAddress, chainId, action, calls are required' });
    }

    const proposal = await createProposal({
      userId: userId.toLowerCase(),
      smartAccountAddress: requireAddress(smartAccountAddress, 'smartAccountAddress'),
      agentAddress: agentAddress ? requireAddress(agentAddress, 'agentAddress') : 'direct',
      chainId: requireChainId(chainId),
      action,
      calls,
      displayedSummary: displayedSummary || {},
      financialContext: financialContext || {},
    });

    res.status(201).json(proposal);
  } catch (err) {
    handleError(err, res);
  }
});

// ── GET /api/financial/proposals/:id ─────────────────────────────────────────
app.get('/api/financial/proposals/:id', async (req, res) => {
  try {
    const userId = (req.query.userId || req.headers['x-user-id'] || '').toLowerCase();
    if (!userId) return res.status(401).json({ error: 'userId query param or x-user-id header is required' });
    const proposal = await getProposal(req.params.id, userId);
    res.json(proposal);
  } catch (err) {
    handleError(err, res);
  }
});

// ── POST /api/financial/proposals/:id/confirm ────────────────────────────────
app.post('/api/financial/proposals/:id/confirm', async (req, res) => {
  let proposal;
  try {
    const userId = (req.body.userId || req.headers['x-user-id'] || '').toLowerCase();
    if (!userId) return res.status(401).json({ error: 'userId is required' });
    proposal = await confirmProposal(req.params.id, userId);
    const execution = await executeConfirmedProposal(proposal);
    res.json({
      ...execution.proposal,
      opHash: execution.opHash,
      txUrl: execution.txUrl,
      receipt: execution.receipt,
      message: `Proposal ${proposal.id} confirmed and submitted.`,
    });
  } catch (err) {
    if (proposal?.id) {
      await advanceStatus(proposal.id, 'FAILED').catch(() => {});
    }
    handleError(err, res);
  }
});

// ── POST /api/financial/proposals/:id/reject ─────────────────────────────────
app.post('/api/financial/proposals/:id/reject', async (req, res) => {
  try {
    const userId = (req.body.userId || req.headers['x-user-id'] || '').toLowerCase();
    if (!userId) return res.status(401).json({ error: 'userId is required' });
    const proposal = await rejectProposal(req.params.id, userId, req.body.reason);
    res.json(proposal);
  } catch (err) {
    handleError(err, res);
  }
});

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found', service: 'financial-agent' });
});

// ─────────────────────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT || 3003);
const HOST = process.env.HOST || '127.0.0.1';

async function start() {
  // Sweep expired proposals on startup
  try {
    await sweepExpiredProposals();
  } catch (err) {
    console.warn('[Startup] Could not sweep proposals (DB may not be migrated yet):', err.message);
  }

  // Periodic sweep every 60 seconds
  setInterval(async () => {
    try {
      await sweepExpiredProposals();
    } catch {
      // Non-fatal
    }
  }, 60_000);

  const server = app.listen(PORT, HOST, () => {
    console.log(`[Financial Agent] Listening on http://${HOST}:${PORT}`);
    console.log(`[Financial Agent] Health: http://${HOST}:${PORT}/health`);
    console.log(`[Financial Agent] Chat:   http://${HOST}:${PORT}/api/financial/chat`);
  });

  server.on('error', (err) => {
    console.error(`[Financial Agent] Failed to listen on ${HOST}:${PORT}:`, err.message);
    process.exit(1);
  });
}

start().catch((err) => {
  console.error('[Financial Agent] Fatal startup error:', err);
  process.exit(1);
});

module.exports = app;
