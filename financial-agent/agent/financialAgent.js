// financial-agent/agent/financialAgent.js
// ─────────────────────────────────────────────────────────────────────────────
// Groq-powered Financial Intelligence Agent.
//
// Tool taxonomy:
//   READ_ONLY  — never create transactions, safe to run automatically
//   PREPARATION — create a proposal awaiting user confirmation
//
// The agent NEVER calls execute_confirmed_transaction_proposal autonomously.
// That endpoint is user-facing only (via REST).
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const { ethers } = require('ethers');
const { Groq } = require('groq-sdk');
const { getChainConfig } = require('../config/chains');
const { getPortfolioSnapshot } = require('../financial/portfolioService');
const { getAllPrices } = require('../financial/chainlinkPriceService');
const { calculateYieldScenario, calculatePortfolioScenario } = require('../financial/yieldCalculator');
const { getAaveUsdcMarket } = require('../defi/aave/aaveService');
const { assessAaveSupplyRisk } = require('../defi/aave/aaveRiskService');
const { getUniswapQuote } = require('../defi/uniswap/uniswapQuoteService');
const { createProposal } = require('../transactions/proposalService');
const { getPrismaClient } = require('../db/prismaClient');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const MAX_ITERATIONS = Number(process.env.AGENT_MAX_TOOL_ITERATIONS || 8);

// ── Provider cache ────────────────────────────────────────────────────────────
const _providers = {};
function getProvider(chainId) {
  if (!_providers[chainId]) {
    const chain = getChainConfig(chainId);
    _providers[chainId] = new ethers.JsonRpcProvider(chain.rpcUrl);
  }
  return _providers[chainId];
}

// ── Tool definitions ──────────────────────────────────────────────────────────
const READ_ONLY_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_portfolio_snapshot',
      description: 'Get the current portfolio balances and USD values for a smart account. Returns ETH and USDC balances with prices.',
      parameters: {
        type: 'object',
        properties: {
          chainId: { type: 'number', description: 'Chain ID (e.g. 11155111 for Sepolia)' },
          walletAddress: { type: 'string', description: 'Smart account address (0x...)' },
        },
        required: ['chainId', 'walletAddress'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_market_prices',
      description: 'Get current on-chain Chainlink price feed data for assets on a given chain.',
      parameters: {
        type: 'object',
        properties: {
          chainId: { type: 'number', description: 'Chain ID' },
        },
        required: ['chainId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_aave_usdc_market',
      description: 'Get Aave V3 USDC reserve metrics including supply APY, available liquidity, and reserve status.',
      parameters: {
        type: 'object',
        properties: {
          chainId: { type: 'number', description: 'Chain ID. Aave V3 is available on Ethereum Sepolia (11155111).' },
        },
        required: ['chainId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_uniswap_quote',
      description: 'Get a read-only Uniswap V3 swap quote. Does NOT execute any swap.',
      parameters: {
        type: 'object',
        properties: {
          chainId: { type: 'number', description: 'Chain ID' },
          tokenIn: { type: 'string', description: 'Input token address' },
          tokenOut: { type: 'string', description: 'Output token address' },
          amountIn: { type: 'string', description: 'Human-readable amount (e.g. "1.0")' },
          feeTier: { type: 'number', enum: [500, 3000, 10000], description: 'Pool fee tier (default 3000)' },
        },
        required: ['chainId', 'tokenIn', 'tokenOut', 'amountIn'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate_yield_scenario',
      description: 'Calculate estimated yield for supplying USDC to Aave over a period. Returns estimate with explicit assumptions.',
      parameters: {
        type: 'object',
        properties: {
          principalUsdc: { type: 'string', description: 'Amount of USDC to supply (e.g. "500")' },
          supplyApyPercentage: { type: 'number', description: 'Current APY as a percentage (e.g. 4.82)' },
          durationDays: { type: 'number', description: 'Duration in days (e.g. 30)' },
        },
        required: ['principalUsdc', 'supplyApyPercentage', 'durationDays'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate_portfolio_scenario',
      description: 'Calculate how a portfolio value would change if ETH price changes by a given percentage.',
      parameters: {
        type: 'object',
        properties: {
          totalValueUsd: { type: 'number', description: 'Current total portfolio value in USD' },
          ethValueUsd: { type: 'number', description: 'Current ETH portion value in USD' },
          ethPriceUsd: { type: 'number', description: 'Current ETH price in USD' },
          priceChangePercent: { type: 'number', description: 'Price change percentage (e.g. -10 for -10%)' },
        },
        required: ['totalValueUsd', 'ethValueUsd', 'ethPriceUsd', 'priceChangePercent'],
      },
    },
  },
];

const PREPARATION_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'prepare_aave_supply',
      description: 'Prepare (but do NOT execute) an Aave USDC supply transaction. Creates a proposal that requires explicit user confirmation before execution.',
      parameters: {
        type: 'object',
        properties: {
          chainId: { type: 'number' },
          smartAccountAddress: { type: 'string' },
          amountUsdc: { type: 'string', description: 'Human-readable USDC amount (e.g. "500")' },
          estimatedApy: { type: 'string', description: 'The APY shown to user (e.g. "4.82")' },
        },
        required: ['chainId', 'smartAccountAddress', 'amountUsdc', 'estimatedApy'],
      },
    },
  },
];

const ALL_TOOLS = [...READ_ONLY_TOOLS, ...PREPARATION_TOOLS];
const READ_ONLY_NAMES = new Set(READ_ONLY_TOOLS.map((t) => t.function.name));

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a Financial Intelligence Assistant for a blockchain smart account platform.

Your role:
- Analyze portfolio data, market prices, and DeFi opportunities
- Provide clear, honest financial analysis with explicit risk disclosures
- Prepare (but NEVER automatically execute) transaction proposals
- Always label estimates as estimates — never as guarantees

Key rules:
1. NEVER claim an investment is safe or guaranteed
2. ALWAYS label APY, yield, and price figures as estimates
3. When a price feed shows "isStale: true", warn the user prominently
4. prepare_aave_supply creates a PROPOSAL — the user must explicitly confirm it before anything executes
5. For USDC: 6 decimal places. For ETH/WETH: 18 decimal places
6. Reject requests to execute directly without showing analysis first
7. ABSOLUTELY NO MARKDOWN. You must output 100% plain text. Do NOT use bolding (**), italics, headers (#), or Markdown tables (|---|---|). Format lists with simple dashes or numbers.
8. STOP HALLUCINATING BALANCES: The user ALREADY sees their live portfolio, prices, and Aave APY in the beautiful graphical sidebar right next to your chat! If they ask "What is my portfolio worth?" or "What are my balances?", DO NOT list them out manually in text or try to calculate them! Just politely point them to the "Smart Vault Portfolio" sidebar on the right side of the screen. Only analyze or break down assets if they specifically ask you to simulate a transaction or explain something.

Supported chains and key addresses:

Ethereum Sepolia (chainId: 11155111)
  USDC (canonical MockUSDC): 0x4665ed736379C8B1BeDe411EBcDA607dd4cab96E
  WETH (Aave Mock):  0xfF970A61A56b169541a77a2221c9443e3f7c41bd
  Aave YieldPool V2: 0xAB49984529296Ead4dF03309BFeA6b273d9d34E4
  Uniswap Router:    0x1e473E7A8C2EB73B744321D4CFD73195B1Ed996F
  ETH/USD Price Feed: 0x5e3075cbd05214408d32935D0f498b3B5676b280

Arbitrum Sepolia (chainId: 421614)
  USDC (canonical MockUSDC): 0x4665ed736379C8B1BeDe411EBcDA607dd4cab96E
  WETH:              0x980B3b374E3C40ffbf522c74C3470D4e01b7c773
  Aave YieldPool V2: 0xAB49984529296Ead4dF03309BFeA6b273d9d34E4
  Uniswap Router:    0x1e473E7A8C2EB73B744321D4CFD73195B1Ed996F
  ETH/USD Price Feed: 0x5e3075cbd05214408d32935D0f498b3B5676b280

Polygon Amoy (chainId: 80002) — portfolio read only, no DeFi protocols verified`;

// ── Main agent function ───────────────────────────────────────────────────────

/**
 * Run the financial agent for a user message.
 * @param {{
 *   message: string,
 *   smartAccountAddress: string,
 *   chainId: number,
 *   userId: string,            // EOA address used as user ID
 *   agentAddress?: string,
 *   conversationHistory?: Array<{role: string, content: string}>,
 *   liveContext?: object
 * }} params
 * @returns {Promise<{
 *   reply: string,
 *   portfolio?: object,
 *   marketPrices?: object,
 *   aaveMarket?: object,
 *   riskAssessment?: object,
 *   yieldScenario?: object,
 *   opportunities?: object[],
 *   transactionProposal?: object,
 *   toolCalls?: string[]
 * }>}
 */
async function runFinancialAgent({ message, smartAccountAddress, chainId, userId, agentAddress, conversationHistory = [], liveContext }) {
  let prompt = SYSTEM_PROMPT;
  if (liveContext) {
    prompt += `\n\n=== LIVE USER CONTEXT ===\nYou ALREADY have the user's chainId, smartAccountAddress, and live portfolio context below. DO NOT ask the user for their address or chain. DO NOT call tools to fetch data that is already provided here. Treat this data as the absolute current truth for the user's balances and market rates:\n${JSON.stringify(liveContext)}`;
  }

  const messages = [
    { role: 'system', content: prompt },
    ...conversationHistory.slice(-10), // last 10 turns for context
    { role: 'user', content: message },
  ];

  const context = {
    chainId,
    smartAccountAddress,
    userId,
    agentAddress: agentAddress || 'financial-agent',
  };

  const accumulator = {
    portfolio: null,
    marketPrices: null,
    aaveMarket: null,
    riskAssessment: null,
    yieldScenario: null,
    opportunities: [],
    transactionProposal: null,
    toolCalls: [],
  };

  // ── Agentic loop ──────────────────────────────────────────────────────────
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages,
      tools: ALL_TOOLS,
      tool_choice: 'auto',
    });

    const response = completion.choices[0].message;
    messages.push(response);

    // No more tool calls — final answer
    if (!response.tool_calls || response.tool_calls.length === 0) {
      return {
        reply: response.content || '',
        ...accumulator,
      };
    }

    // Process tool calls
    for (const toolCall of response.tool_calls) {
      const { name, arguments: argsStr } = toolCall.function;
      let args;
      try {
        args = JSON.parse(argsStr);
      } catch {
        args = {};
      }

      accumulator.toolCalls.push(name);
      let toolResult;

      try {
        toolResult = await _executeTool(name, args, context, accumulator);
      } catch (err) {
        toolResult = { error: err.message };
      }

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult),
      });
    }
  }

  // Max iterations reached
  return {
    reply: 'I reached the maximum number of analysis steps. Please ask a more specific question.',
    ...accumulator,
  };
}

// ── Tool executor ─────────────────────────────────────────────────────────────

async function _executeTool(name, args, context, accumulator) {
  const provider = getProvider(args.chainId ?? context.chainId);
  const chainId = args.chainId ?? context.chainId;

  switch (name) {
    case 'get_portfolio_snapshot': {
      const snapshot = await getPortfolioSnapshot(provider, chainId, args.walletAddress);
      accumulator.portfolio = snapshot;

      // Audit
      await _auditLog(context.userId, null, 'PORTFOLIO_READ', { chainId, walletAddress: args.walletAddress });
      return snapshot;
    }

    case 'get_market_prices': {
      const prices = await getAllPrices(provider, chainId);
      accumulator.marketPrices = prices;
      await _auditLog(context.userId, null, 'MARKET_PRICE_READ', { chainId });
      return prices;
    }

    case 'get_aave_usdc_market': {
      const market = await getAaveUsdcMarket(provider, chainId);
      const risk = assessAaveSupplyRisk(market);
      accumulator.aaveMarket = market;
      accumulator.riskAssessment = risk;
      await _auditLog(context.userId, null, 'AAVE_METRICS_READ', { chainId });
      return { ...market, riskAssessment: risk };
    }

    case 'get_uniswap_quote': {
      return getUniswapQuote(provider, chainId, {
        tokenIn: args.tokenIn,
        tokenOut: args.tokenOut,
        amountIn: args.amountIn,
        feeTier: args.feeTier,
      });
    }

    case 'calculate_yield_scenario': {
      const result = calculateYieldScenario({
        principalUsdc: args.principalUsdc,
        supplyApyPercentage: args.supplyApyPercentage,
        durationDays: args.durationDays,
      });
      accumulator.yieldScenario = result;
      return result;
    }

    case 'calculate_portfolio_scenario': {
      return calculatePortfolioScenario(args);
    }

    case 'prepare_aave_supply': {
      const chain = getChainConfig(chainId);
      if (!chain.usdcAddress || !chain.aavePoolAddress) {
        throw new Error(`Aave supply not supported on chain ${chainId}`);
      }

      // Build call data for: approve(aavePool, amount) + deposit(amount)
      const usdcAmount = ethers.parseUnits(args.amountUsdc, 6);

      const erc20Iface = new ethers.Interface([
        'function approve(address spender, uint256 amount) returns (bool)',
      ]);
      const aaveIface = new ethers.Interface([
        'function deposit(uint256 amount)',
      ]);

      const approveCallData = erc20Iface.encodeFunctionData('approve', [
        chain.aavePoolAddress,
        usdcAmount,
      ]);
      const supplyCallData = aaveIface.encodeFunctionData('deposit', [
        usdcAmount,
      ]);

      const proposal = await createProposal({
        userId: context.userId,
        smartAccountAddress: args.smartAccountAddress,
        agentAddress: context.agentAddress,
        chainId,
        action: 'AAVE_SUPPLY',
        calls: [
          { target: chain.usdcAddress, value: '0', callData: approveCallData },
          { target: chain.aavePoolAddress, value: '0', callData: supplyCallData },
        ],
        displayedSummary: {
          inputAsset: 'USDC',
          inputAmount: args.amountUsdc,
          protocol: 'Aave V3',
          estimatedApy: args.estimatedApy,
          description: `Supply ${args.amountUsdc} USDC to Aave V3 on ${chain.name}`,
        },
        financialContext: {
          apy: args.estimatedApy,
          amountUsdc: args.amountUsdc,
          chainId,
          quoteTimestamp: Math.floor(Date.now() / 1000),
        },
      });

      accumulator.transactionProposal = {
        id: proposal.id,
        status: proposal.status,
        action: proposal.action,
        displayedSummary: proposal.displayedSummary,
        expiresAt: proposal.expiresAt,
      };

      accumulator.opportunities.push({
        type: 'AAVE_SUPPLY',
        asset: 'USDC',
        amount: args.amountUsdc,
        estimatedApy: args.estimatedApy,
        proposalId: proposal.id,
      });

      return {
        proposalId: proposal.id,
        status: 'AWAITING_CONFIRMATION',
        message: `Proposal created. The user must explicitly confirm proposal ${proposal.id} before any transaction is executed.`,
        expiresAt: proposal.expiresAt,
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function _auditLog(userId, proposalId, eventType, metadata) {
  try {
    const prisma = getPrismaClient();
    await prisma.financialAuditLog.create({
      data: { userId, proposalId: proposalId ?? null, eventType, metadata: metadata ?? {} },
    });
  } catch (err) {
    console.error('[AuditLog]', err.message);
  }
}

module.exports = { runFinancialAgent };
