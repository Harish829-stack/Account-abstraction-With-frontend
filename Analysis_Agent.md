Full Implementation Plan: Financial Assistant for Your Blockchain Platform

Based on your existing codebase, you do not need to rebuild the wallet, UserOperation history, session-key system, or transaction executor.

You need to add a Financial Intelligence and DeFi Planning layer on top of your current chatbot.

Your existing infrastructure already provides:

Smart account address

ETH/POL balance reading

USDC balance reading

UserOperation history

Agent authorization

Session-key validation

UserOperation construction

Bundler submission

Existing ETH/ERC-20 transfer execution

Existing Uniswap swap execution

The new system should add:

Portfolio aggregation

On-chain price feeds

Aave market analytics

Uniswap quote and price-impact analysis

Financial calculations

Risk analysis

Transaction proposal and confirmation

Aave supply execution

Stronger execution permissions

1. Target Architecture
                    React Chatbot UI
                           │
                           ▼
                    POST /api/chat
                           │
                           ▼
                    Financial Agent
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
        Portfolio       Market        DeFi
         Service        Service      Analytics
              │            │            │
              ▼            ▼            ▼
          Blockchain    Chainlink    Aave /
             RPC         Feeds      Uniswap
              │            │            │
              └────────────┼────────────┘
                           ▼
                  Financial Analysis
                           │
                           ▼
                Opportunity / Recommendation
                           │
                           ▼
                 Transaction Proposal
                           │
                           ▼
                  Explicit Confirmation
                           │
                           ▼
                  Existing Validation
                           │
                           ▼
                    Session Key
                           │
                           ▼
                    UserOperation
                           │
                           ▼
                       Bundler
                           │
                           ▼
                       EntryPoint
                           │
                           ▼
                    Smart Account

The key architectural principle is:

The AI may analyze and prepare actions, but it must not directly execute financial transactions without explicit user confirmation.

2. Required Infrastructure
2.1 Blockchain RPC providers

You need an RPC URL for every supported network.

For your current development environment, this could include:

Network

	

Purpose




Ethereum Sepolia

	

Aave and Uniswap testing, if supported by the relevant deployments




Base Sepolia

	

Aave/DeFi testing, if required




Arbitrum Sepolia

	

Chainlink and future DeFi testing




Polygon Amoy

	

Existing smart-account testing




Mainnets later

	

Real user funds and production DeFi

For each chain, configure:

ETHEREUM_SEPOLIA_RPC_URL=
BASE_SEPOLIA_RPC_URL=
ARBITRUM_SEPOLIA_RPC_URL=
POLYGON_AMOY_RPC_URL=

You may use your existing RPC provider. There is no need to introduce another provider immediately.

Required RPC capabilities

Your RPC provider should support:

eth_call

eth_getBalance

eth_getLogs

eth_blockNumber

eth_getTransactionReceipt

ERC-20 contract reads

Contract simulation

ERC-4337-related RPC methods if required by your bundler

Reasonable request limits

For production, use a dedicated RPC provider rather than relying on a public endpoint.

3. Chain Registry

Create one central registry containing all chain-specific configuration.

chatbot-server/
└── config/
    ├── chains.ts
    ├── chainValidation.ts
    ├── protocolAddresses.ts
    └── priceFeeds.ts

Example:

export interface ChainConfig {
  chainId: number;
  name: string;
  nativeSymbol: string;
  rpcUrl: string;
  bundlerUrl: string;

  entryPointAddress: string;
  sessionKeyValidatorAddress: string;

  usdcAddress: string;
  wethAddress?: string;

  uniswapRouterAddress?: string;
  uniswapQuoterAddress?: string;
  aavePoolAddress?: string;
  aaveDataProviderAddress?: string;
  aavePoolAddressesProvider?: string;
}

Example registry:

export const CHAIN_CONFIGS: Record<number, ChainConfig> = {
  11155111: {
    chainId: 11155111,
    name: "Ethereum Sepolia",
    nativeSymbol: "ETH",
    rpcUrl: process.env.ETHEREUM_SEPOLIA_RPC_URL!,
    bundlerUrl: process.env.ETHEREUM_SEPOLIA_BUNDLER_URL!,

    entryPointAddress: "...",
    sessionKeyValidatorAddress: "...",

    usdcAddress: "...",
    wethAddress: "...",

    uniswapRouterAddress: "...",
    uniswapQuoterAddress: "...",

    aavePoolAddress: "...",
    aaveDataProviderAddress: "...",
    aavePoolAddressesProvider: "..."
  }
};
Important

Do not assume that:

Aave exists on every testnet

Uniswap has the same deployment on every chain

USDC has the same address on every chain

Chainlink feeds exist for every token on every chain

A specific Quoter address is valid across all networks

Every address must be verified against the official deployment documentation or explorer.

4. Portfolio Service

You mentioned that user-related information can already be fetched through RPC calls.

That is correct.

You can read the following directly from the blockchain:

Data

	

Source




Native balance

	

eth_getBalance




USDC balance

	

ERC-20 balanceOf()




Token decimals

	

ERC-20 decimals()




Token symbol

	

ERC-20 symbol()




Smart account address

	

Existing frontend/backend context




UserOperation history

	

Existing codebase




Transaction receipts

	

RPC




Current block/timestamp

	

RPC

4.1 Portfolio service responsibilities

Create:

financial/portfolioService.ts

It should return normalized data:

interface PortfolioAsset {
  chainId: number;
  symbol: string;
  tokenAddress?: string;
  balanceRaw: string;
  balanceFormatted: string;
  decimals: number;
  priceUsd?: number;
  valueUsd?: number;
  allocationPercentage?: number;
}

interface PortfolioSnapshot {
  walletAddress: string;
  timestamp: number;
  totalValueUsd: number;
  assets: PortfolioAsset[];
}

Example response:

{
  "walletAddress": "0x...",
  "chainId": 11155111,
  "totalValueUsd": 5230.42,
  "assets": [
    {
      "symbol": "ETH",
      "balanceFormatted": "1.12",
      "priceUsd": 4200,
      "valueUsd": 4704,
      "allocationPercentage": 89.94
    },
    {
      "symbol": "USDC",
      "balanceFormatted": "526.42",
      "priceUsd": 1,
      "valueUsd": 526.42,
      "allocationPercentage": 10.06
    }
  ]
}
Avoid this mistake

Do not calculate portfolio value from balances alone.

You need:

balance × verified market price = asset value
5. Market Price Service Using Chainlink

Since you discovered Chainlink feeds, you can use Chainlink as your primary price source where feeds are available.

Create:

financial/marketDataService.ts
financial/chainlinkPriceService.ts
config/priceFeeds.ts
5.1 Chainlink feed registry
export const CHAINLINK_FEEDS = {
  421614: {
    ETH_USD: "...",
    ARB_USD: "...",
    AAVE_USD: "..."
  },

  11155111: {
    ETH_USD: "...",
    AAVE_USD: "..."
  }
};

Do not add a feed unless:

It belongs to the correct chain.

It reports the intended asset.

Its decimals are read correctly.

Its latest update is sufficiently recent.

Its answer is positive and valid.

5.2 Price service output
interface TokenPrice {
  chainId: number;
  symbol: string;
  priceUsd: string;
  feedAddress: string;
  feedDecimals: number;
  updatedAt: number;
  isStale: boolean;
}

The service should:

Read latestRoundData().

Read decimals().

Normalize the answer.

Check the timestamp.

Reject stale or invalid data.

Return the price and source.

Price freshness

Define a configurable staleness threshold:

CHAINLINK_MAX_PRICE_AGE_SECONDS=3600

For highly volatile assets, use a shorter threshold.

6. USDC Price Handling

USDC is generally intended to track USD, but your system should not blindly assume that its price is always exactly $1.

You have two options:

Option A: Use $1 as an accounting assumption

Useful for simple portfolio estimates:

const USDC_ACCOUNTING_PRICE_USD = 1;

Clearly label it as an assumption.

Option B: Use an oracle or market price

Use this if you require:

Stablecoin depeg monitoring

More accurate portfolio valuation

Risk alerts

Stablecoin comparisons

For V1, $1 accounting is acceptable if explicitly disclosed.

7. Aave Market Analytics

Your Aave research is relevant and can be implemented without the large Aave SDK.

I recommend using direct contract reads with Viem for your backend.

This keeps the dependency footprint small and fits your existing TypeScript architecture.

Create:

defi/
├── aave/
│   ├── aaveService.ts
│   ├── aaveContracts.ts
│   ├── aaveDataProvider.ts
│   ├── aaveRiskService.ts
│   └── aaveTypes.ts
7.1 Required Aave configuration

For each supported network:

interface AaveDeployment {
  chainId: number;
  poolAddress: string;
  poolAddressesProvider: string;
  protocolDataProvider: string;
  usdcAddress: string;
  usdcDecimals: number;
}

You need to verify:

Aave V3 is deployed on the network.

The supplied Data Provider address is correct.

The USDC address is the actual reserve asset.

The reserve is active.

The reserve is not frozen.

The pool accepts supply transactions.

The deployment is appropriate for your testnet.

Important correction

The availableLiquidity, liquidityRate, and cap values are raw protocol values.

You must not automatically assume:

availableLiquidity / 1e6

unless the reserve asset actually has 6 decimals.

Likewise, the liquidity rate is expressed in Ray units:

1 Ray = 10^27

but the exact human-readable APY calculation should be handled carefully.

The raw liquidity rate is an annualized rate representation, but it is not necessarily identical to a guaranteed future return.

7.2 Aave data required

Your normalized Aave response should look like:

interface AaveReserveMetrics {
  chainId: number;
  asset: string;
  symbol: string;
  underlyingAddress: string;

  availableLiquidity: string;
  supplyCap: string;

  liquidityRateRay: string;
  supplyApyPercentage: string;

  totalStableDebt: string;
  totalVariableDebt: string;

  isActive: boolean;
  isFrozen: boolean;

  poolAddress: string;
  dataProviderAddress: string;

  timestamp: number;
}

Example:

{
  "symbol": "USDC",
  "availableLiquidity": "12500000",
  "supplyCap": "50000000",
  "supplyApyPercentage": "4.82",
  "isActive": true,
  "isFrozen": false
}
8. Aave Risk Analysis

Do not show only APY.

The financial assistant should also analyze:

Available liquidity

Supply cap utilization

Reserve active/frozen status

Stablecoin depeg risk

Smart-contract risk

Variable interest rate

Protocol dependency

Incentive APY versus base supply APY

Withdrawal liquidity

Create:

defi/aave/aaveRiskService.ts

Example output:

interface AaveRiskAssessment {
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  reasons: string[];
  warnings: string[];
}

Example:

{
  "riskLevel": "MEDIUM",
  "reasons": [
    "USDC supply rate is variable",
    "Funds depend on Aave smart contracts",
    "Stablecoin price may deviate from $1"
  ],
  "warnings": [
    "APY is not guaranteed",
    "Liquidity and protocol parameters can change"
  ]
}

Avoid claiming that an investment is safe or guaranteed.

9. Aave Yield Calculator

The calculator should be a pure backend function.

financial/yieldCalculator.ts

Inputs:

interface YieldScenarioInput {
  principalUsdc: string;
  supplyApyPercentage: number;
  durationDays: number;
}

Outputs:

interface YieldScenarioOutput {
  principalUsdc: string;
  estimatedInterestUsdc: string;
  estimatedEndingBalanceUsdc: string;
  assumptions: string[];
}

For a simple estimate:

Interest=Principal×
100
APY
	​

×
365
Days
	​


Example explanation:

At a constant 4.8% annualized rate, supplying 1,000 USDC for 30 days would produce an estimated return of approximately 3.95 USDC before fees, rate changes, incentives, or losses.

The UI must label this as an estimate, not a promise.

10. Uniswap Quote Service

Your current Uniswap tool executes swaps. Add a separate read-only quote service first.

Create:

defi/uniswap/
├── uniswapQuoteService.ts
├── uniswapContracts.ts
├── uniswapPriceImpact.ts
└── uniswapTypes.ts
10.1 Required Uniswap configuration

For every supported chain:

interface UniswapDeployment {
  chainId: number;
  routerAddress: string;
  quoterV2Address: string;
  factoryAddress?: string;
  supportedPools: {
    tokenIn: string;
    tokenOut: string;
    fee: number;
    poolAddress?: string;
  }[];
}

You must verify:

Quoter deployment

Router deployment

Token addresses

Pool address

Pool fee tier

Whether the pool has sufficient liquidity

Whether the selected route is supported

Do not assume that a Quoter address is valid on every chain.

10.2 Quote tool

Add:

get_uniswap_quote({
  chainId,
  tokenIn,
  tokenOut,
  amountIn,
  fee
})

Return:

interface SwapQuote {
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  quotedAmountOut: string;
  quotedAmountOutFormatted: string;
  feeTier: number;
  priceImpactPercentage?: string;
  gasEstimate?: string;
  timestamp: number;
}

Example:

{
  "tokenIn": "ETH",
  "tokenOut": "USDC",
  "amountIn": "1",
  "quotedAmountOutFormatted": "4180.25",
  "priceImpactPercentage": "0.42",
  "feeTier": 3000
}
11. Important Correction to Your Price Impact Code

The code you shared calculates price impact using:

const priceBefore = Number(sqrtPriceX96Before) ** 2;
const priceAfter = Number(sqrtPriceX96After) ** 2;

This is not safe or universally correct.

Problems include:

JavaScript Number loses precision for large integers.

The square-root price orientation depends on token ordering.

Token decimal differences must be considered.

Pool price movement is not exactly the same as execution price impact.

Fee impact and price impact are separate concepts.

The pool's price movement can include effects unrelated to the conventional quoted price-impact definition.

For V1, prefer:

Use Uniswap SDK's priceImpact where correctly initialized, or

Use quote output versus an appropriate reference execution price, or

Use a trusted quoting/routing provider.

Do not expose a misleading price-impact percentage to users.

12. Financial Agent Tools

Separate tools into two categories.

12.1 Read-only tools

These tools must never create transactions.

const READ_ONLY_TOOLS = [
  "get_portfolio_snapshot",
  "get_market_prices",
  "get_aave_usdc_market",
  "get_uniswap_quote",
  "calculate_yield_scenario",
  "calculate_portfolio_scenario",
  "get_user_transaction_history"
];
12.2 Preparation tools

These tools create transaction proposals but do not submit UserOperations.

const PREPARATION_TOOLS = [
  "prepare_uniswap_swap",
  "prepare_aave_supply",
  "prepare_erc20_transfer",
  "prepare_native_transfer"
];
12.3 Execution tool

Only one controlled execution path should exist:

execute_confirmed_transaction_proposal

The LLM should not receive unrestricted access to a generic:

execute_any_contract_call

That would create a serious security risk.

13. Example User Flow

User:

Analyze my portfolio and tell me whether I could supply some USDC to Aave.

Step 1: Fetch portfolio
get_portfolio_snapshot()
Step 2: Fetch prices
get_market_prices()
Step 3: Fetch Aave metrics
get_aave_usdc_market()
Step 4: Calculate allocation
USDC balance
÷
Total portfolio value
Step 5: Calculate scenario
calculate_yield_scenario()
Step 6: Explain result

The assistant responds:

You currently hold 1,200 USDC. Aave's current displayed supply rate is 4.7% annualized. Supplying 500 USDC for 30 days would produce an estimated 1.93 USDC before rate changes and other risks.

No transaction is created unless the user requests it.

14. Transaction Proposal Architecture

This is the most important new backend component.

Create:

transactions/
├── transactionProposalService.ts
├── transactionProposalRepository.ts
├── transactionValidator.ts
├── transactionSimulator.ts
└── transactionExecutionService.ts
14.1 Proposal lifecycle
DRAFT
  │
  ▼
AWAITING_CONFIRMATION
  │
  ├── User rejects → CANCELLED
  │
  ├── Timeout → EXPIRED
  │
  ▼
CONFIRMED
  │
  ▼
REVALIDATING
  │
  ▼
SIMULATING
  │
  ├── Failure → FAILED
  │
  ▼
EXECUTING
  │
  ▼
SUBMITTED
  │
  ▼
CONFIRMED_ONCHAIN
14.2 Proposal data model
interface TransactionProposal {
  id: string;

  userId: string;
  smartAccountAddress: string;
  agentAddress: string;
  chainId: number;

  action:
    | "UNISWAP_SWAP"
    | "AAVE_SUPPLY"
    | "ERC20_TRANSFER"
    | "NATIVE_TRANSFER";

  calls: {
    target: string;
    value: string;
    callData: string;
  }[];

  displayedSummary: {
    inputAsset?: string;
    inputAmount?: string;
    outputAsset?: string;
    estimatedOutput?: string;
    protocol?: string;
  };

  financialContext: {
    portfolioValueUsd?: string;
    prices?: Record<string, string>;
    apy?: string;
    quoteTimestamp?: number;
  };

  status: string;
  createdAt: number;
  expiresAt: number;
}

The frontend should display the exact proposal stored on the backend.

15. Aave Supply Execution

Aave supply normally requires:

USDC.approve(AavePool, amount)
        │
        ▼
AavePool.supply(
  USDC,
  amount,
  smartAccount,
  0
)

Therefore, your Aave supply proposal may contain two calls:

[
  {
    target: usdcAddress,
    value: "0",
    callData: approveCallData
  },
  {
    target: aavePoolAddress,
    value: "0",
    callData: supplyCallData
  }
]
15.1 Required validations

Before execution:

User owns sufficient USDC.

USDC address matches the selected chain.

Aave Pool address is allowlisted.

Approval amount equals the intended amount.

Beneficiary is the user's smart account.

The amount has not changed.

The proposal has not expired.

The reserve is active.

The reserve is not frozen.

The session key is authorized for the operation.

The transaction simulation succeeds.

Approval recommendation

Do not use unlimited approval by default.

Prefer:

approve(aavePool, exactAmount)

or a supported permit flow later.

16. Session-Key Permission Changes

Your existing session-key system currently supports scopes such as:

native
erc20
uniswap

Add a separate DeFi permission model.

Example:

interface AgentCapabilities {
  readPortfolio: boolean;
  readMarketData: boolean;
  readAaveMarkets: boolean;
  readUniswapQuotes: boolean;

  executeNativeTransfer: boolean;
  executeErc20Transfer: boolean;
  executeUniswapSwap: boolean;
  executeAaveSupply: boolean;
}

However, backend flags alone are not sufficient.

The on-chain validator should ideally restrict:

Chain ID

Target contract

Function selector

Token address

Maximum amount

Expiry

Agent address

Allowed operation type

For Aave:

Allowed target:
  Aave Pool

Allowed selectors:
  supply(...)

Allowed token:
  USDC

Allowed maximum:
  Configured amount

Allowed beneficiary:
  Smart account

Expiry:
  Session key expiration

Also remember that the USDC approval call targets the USDC token contract, so your validator must support the exact approval pattern safely.

17. Backend Endpoints

You can keep your existing endpoint:

POST /api/chat

Add supporting endpoints:

Endpoint

	

Purpose




GET /api/portfolio/:chainId/:wallet

	

Fetch portfolio




GET /api/market/prices

	

Fetch Chainlink prices




GET /api/aave/:chainId/usdc

	

Fetch Aave metrics




GET /api/uniswap/quote

	

Fetch swap quote




POST /api/transaction-proposals

	

Create proposal




GET /api/transaction-proposals/:id

	

Get proposal




POST /api/transaction-proposals/:id/confirm

	

Confirm proposal




POST /api/transaction-proposals/:id/reject

	

Reject proposal




POST /api/transaction-proposals/:id/execute

	

Execute confirmed proposal




GET /api/transactions/:hash/status

	

Track transaction

18. Database Requirements

You need at least these tables.

transaction_proposals
id
user_id
smart_account_address
agent_address
chain_id
action
calls
financial_context
status
expires_at
created_at
confirmed_at
executed_at
user_op_hash
transaction_hash
financial_snapshots

Optional for V1:

id
user_id
smart_account_address
chain_id
portfolio_json
created_at
financial_audit_logs

Recommended:

id
user_id
proposal_id
event_type
metadata
created_at

Audit events may include:

PORTFOLIO_READ
MARKET_PRICE_READ
AAVE_METRICS_READ
PROPOSAL_CREATED
PROPOSAL_CONFIRMED
PROPOSAL_REJECTED
SIMULATION_FAILED
USEROP_SUBMITTED
TRANSACTION_CONFIRMED
19. Frontend Changes

Your existing chatbot UI should support structured financial responses.

Instead of only:

{
  "reply": "...",
  "ops": []
}

return:

{
  "reply": "...",
  "portfolio": {
    "totalValueUsd": "5230.42",
    "assets": []
  },
  "insights": [],
  "opportunities": [],
  "transactionProposal": null,
  "ops": []
}

For an Aave opportunity:

{
  "reply": "You could supply 500 USDC to Aave...",
  "opportunities": [
    {
      "type": "AAVE_SUPPLY",
      "asset": "USDC",
      "amount": "500",
      "estimatedApy": "4.7",
      "estimated30DayInterest": "1.93",
      "riskLevel": "MEDIUM"
    }
  ],
  "transactionProposal": {
    "id": "proposal_123",
    "status": "AWAITING_CONFIRMATION"
  }
}

The frontend should show:

Portfolio cards

Asset allocation

Current prices

APY

Estimated interest

Risk warnings

Exact transaction details

Confirm and reject buttons

Transaction status

20. API and Service Inventory

Here is the complete requirement matrix.

Component

	

Required?

	

Purpose




Blockchain RPC

	

Yes

	

Balances, contract reads, simulation




Bundler RPC

	

Already available

	

UserOperation submission




Chainlink feeds

	

Recommended

	

On-chain asset prices




CoinGecko

	

Optional fallback

	

Prices unavailable through Chainlink




Aave Data Provider

	

Yes for Aave analytics

	

Liquidity, rates, caps




Aave Pool

	

Yes for execution

	

Supply transactions




Uniswap Quoter

	

Yes for swap quotes

	

Expected output and quote




Uniswap Router

	

Already available / verify

	

Swap execution




PostgreSQL

	

Strongly recommended

	

Proposals, audit, history




Redis

	

Optional

	

Caching




Groq

	

Already available

	

AI reasoning and tool calling




Simulation provider

	

Optional

	

Advanced transaction simulation




WebSocket RPC

	

Optional

	

Faster status monitoring




Indexer

	

Not required initially

	

Historical token/activity indexing

21. Environment Variables

A realistic initial .env could be:

# AI
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-120b

# RPC
ETHEREUM_SEPOLIA_RPC_URL=
BASE_SEPOLIA_RPC_URL=
ARBITRUM_SEPOLIA_RPC_URL=
POLYGON_AMOY_RPC_URL=

# Bundlers
ETHEREUM_SEPOLIA_BUNDLER_URL=
BASE_SEPOLIA_BUNDLER_URL=
ARBITRUM_SEPOLIA_BUNDLER_URL=
POLYGON_AMOY_BUNDLER_URL=

# Database
DATABASE_URL=

# Existing account-abstraction contracts
ENTRY_POINT_ADDRESS=
SESSION_KEY_VALIDATOR_ADDRESS=

# Chainlink
CHAINLINK_MAX_PRICE_AGE_SECONDS=3600

# Aave
AAVE_MARKET_DATA_CACHE_SECONDS=300

# Uniswap
UNISWAP_QUOTE_CACHE_SECONDS=15

# Proposal security
TRANSACTION_PROPOSAL_TTL_SECONDS=300
AGENT_MAX_TOOL_ITERATIONS=8

Protocol addresses should preferably be stored in version-controlled chain configuration rather than exposed as arbitrary environment variables.

22. Recommended Folder Structure
chatbot-server/
├── server.ts
├── config/
│   ├── chains.ts
│   ├── protocols.ts
│   ├── priceFeeds.ts
│   └── permissions.ts
│
├── agent/
│   ├── agentOrchestrator.ts
│   ├── agentPrompt.ts
│   ├── agentTools.ts
│   ├── toolExecutor.ts
│   └── toolPermissions.ts
│
├── financial/
│   ├── portfolioService.ts
│   ├── marketDataService.ts
│   ├── chainlinkPriceService.ts
│   ├── financialContextBuilder.ts
│   ├── yieldCalculator.ts
│   └── portfolioScenarioService.ts
│
├── defi/
│   ├── aave/
│   │   ├── aaveService.ts
│   │   ├── aaveDataProvider.ts
│   │   ├── aavePoolService.ts
│   │   ├── aaveRiskService.ts
│   │   └── aaveTypes.ts
│   │
│   └── uniswap/
│       ├── uniswapQuoteService.ts
│       ├── uniswapSwapService.ts
│       ├── uniswapPriceImpact.ts
│       └── uniswapTypes.ts
│
├── transactions/
│   ├── transactionProposalService.ts
│   ├── transactionValidator.ts
│   ├── transactionSimulator.ts
│   ├── transactionExecutionService.ts
│   └── transactionProposalRepository.ts
│
├── execution/
│   ├── userOpBuilder.ts
│   ├── sessionKeyPolicy.ts
│   └── bundlerService.ts
│
├── db/
│   ├── schema.ts
│   ├── proposals.ts
│   └── auditLogs.ts
│
└── utils/
    ├── cache.ts
    ├── decimals.ts
    ├── addresses.ts
    └── validation.ts
23. Implementation Phases
Phase 0 — Audit Existing Execution

Before adding financial features, verify:

Agent authorization

Session-key expiry

Spending limits

Allowed target contracts

Allowed selectors

Chain validation

Token validation

UserOperation signature format

Transaction simulation

Replay protection

Proposal ownership checks

Deliverable: Existing transfer and swap flows remain secure and unchanged.

Phase 1 — Portfolio Intelligence

Implement:

Chain registry

Native balance reader

ERC-20 balance reader

Chainlink price reader

Portfolio aggregation

Portfolio valuation

get_portfolio_snapshot tool

Deliverable:

"Your portfolio is worth approximately $X, consisting of Y% ETH and Z% USDC."

Phase 2 — Market Intelligence

Implement:

Chainlink feed registry

Price freshness checks

Price caching

Market-price tool

Historical price fallback, if needed

Portfolio scenario calculator

Deliverable:

"If ETH falls by 10%, your estimated portfolio value would change from X to Y."

Phase 3 — Aave Analytics

Implement:

Aave deployment registry

Direct Viem contract reads

Reserve metrics

Supply APY conversion

Liquidity and cap calculations

Yield calculator

Risk warnings

get_aave_usdc_market tool

Deliverable:

"Aave currently displays an estimated supply APY of X%. Supplying Y USDC for Z days could produce approximately N USDC under these assumptions."

Phase 4 — Uniswap Quote Intelligence

Implement:

Quoter integration

Token and pool validation

Quote output

Minimum received calculation

Slippage configuration

Price-impact calculation

get_uniswap_quote tool

Deliverable:

"Swapping 1 ETH is currently estimated to return approximately X USDC, subject to slippage and market movement."

Phase 5 — Transaction Proposals

Implement:

Proposal database

Proposal creation

Proposal expiration

Confirmation UI

Rejection flow

Proposal ownership validation

Exact calldata persistence

Deliverable:

The AI prepares an action but does not execute it.

Phase 6 — Aave Supply Execution

Implement:

USDC approval calldata

Aave supply calldata

Exact amount validation

Aave target allowlisting

Session-key permissions

Simulation

UserOperation execution

Receipt monitoring

Deliverable:

User can explicitly confirm:

Supply 500 USDC to Aave on Ethereum Sepolia

and the system executes the approved proposal.

Phase 7 — Production Hardening

Add:

Redis caching

Rate limiting

RPC fallback

API retries

Monitoring

Structured logs

Alerting

Transaction reconciliation

Security tests

Contract audits where appropriate

User-facing risk disclosures

24. What You Do Not Need Initially

You do not need these for V1:

Aave SDK

CoinGecko if Chainlink covers your required prices

A separate AI model

A full blockchain indexer

Redis

Tenderly

WebSocket infrastructure

Cross-chain portfolio aggregation

Automated yield optimization

Autonomous rebalancing

Multiple lending protocols

Complex historical analytics

Start with:

One chain
ETH + USDC
Chainlink prices
Aave USDC metrics
Uniswap quote
Explicit confirmation
Existing session-key execution
25. Recommended V1 Scope

For your current platform, I would implement this exact first version:

Supported assets
ETH / native gas token
USDC
Supported financial actions
View portfolio
View asset allocation
View ETH and USDC prices
Analyze ETH price scenarios
Get Uniswap ETH/WETH → USDC quote
View Aave USDC supply APY
Calculate estimated yield
Prepare Aave USDC supply
Confirm and execute Aave supply











1. Ethereum Sepolia (Chain ID: 11155111)For Ethereum Sepolia, the core infrastructure addresses for ERC-20s, Aave V3, and Uniswap V3 are as follows:typescript// config/protocols.ts or config/chains.ts
export const ETHEREUM_SEPOLIA_CONFIG = {
  chainId: 11155111,
  tokens: {
    USDC: "0x94a9D9Ac88614159778177729875F12A7C36ea35", // Aave Mock USDC
    WETH: "0xfF970A61A56b169541a77a2221c9443e3f7c41bd", // Aave Mock WETH
  },
  uniswap: {
    factory: "0x0227628f3F023bb0B980b67D528571c95c6DaC1c",
    router: "0x3bFA4769FB09eefC5a80d6E87c3B91650a7ecf88",  // SwapRouter02
    quoterV2: "0xEdEA35800073054Fe6b994d240c0303756bd0453",
  },
  aave: {
    pool: "0x6Ae43d3271ff684083988ac1eC6C4CE2aA614f24",
    dataProvider: "0x3e7d1eAB13ad0104d2750B8863b489D65364e32D",
    poolAddressesProvider: "0x012bAC54348C0E635dCAc745A463ad3C1507C973",
  },
  chainlinkFeeds: {
    ETH_USD: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
    USDC_USD: "0xA2F78ab2355fe2f91B2813184337B31b504c2513"
  }
};
Use code with caution.2. Arbitrum Sepolia (Chain ID: 421614)For Arbitrum Sepolia, use these parameters:typescript// config/protocols.ts or config/chains.ts
export const ARBITRUM_SEPOLIA_CONFIG = {
  chainId: 421614,
  tokens: {
    USDC: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", // Native/Aave Mock USDC
    WETH: "0x980B3b374E3C40ffbf522c74C3470D4e01b7c773", // L2 WETH
  },
  uniswap: {
    factory: "0x248AB79AC9dC53E132f7797b9c9d0E4DccC32189",
    router: "0x101F443B4d1b059569D643917553c771E1b9663E",  // SwapRouter02
    quoterV2: "0x27F9712a3d0335C49aE639e1F1C1C52E58C28F2a",
  },
  aave: {
    pool: "0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff",
    dataProvider: "0x9859fCba1CDe1E14F9aB960662d5598687aE21fC",
    poolAddressesProvider: "0xB25a5D144626a0D488e52AE717A051a2E9997076",
  },
  chainlinkFeeds: {
    ETH_USD: "0xd30e2101a97d8b757c05d3dd15c2d33481232840",
    USDC_USD: "0x011e525c56c2d1323b73373fa9f993d6b0521e8e"
  }
};
Use code with caution.🛠️ Updated Clean Structural V1 Integration PlanFollowing Plan #5 and #6 of your architecture proposal, strip these values entirely from your .env to prevent bloat. Keep only your runtime keys there:ini# .env (V1 Production Ready)
NODE_ENV=development
PORT=4000
FRONTEND_URL=http://localhost:5173

GROQ_API_KEY=your_key_here
GROQ_MODEL=openai/gpt-oss-120b
DATABASE_URL=postgresql://...

# Network Secrets Only
ETHEREUM_SEPOLIA_RPC_URL=https://alchemy.com...
ARBITRUM_SEPOLIA_RPC_URL=https://alchemy.com...

# Account Abstraction Infrastructure Secrets (if applicable)
ETHEREUM_SEPOLIA_BUNDLER_URL=https://pimlico.io?...
ARBITRUM_SEPOLIA_BUNDLER_URL=https://pimlico.io?...

# Global Parameters
AGENT_MAX_TOOL_ITERATIONS=8
TRANSACTION_PROPOSAL_TTL_SECONDS=300
CHAINLINK_MAX_PRICE_AGE_SECONDS=3600
Use code with caution.