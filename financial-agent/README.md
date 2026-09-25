# Financial Agent — Isolated Sidecar

## What This Is

A **self-contained Express.js microservice** that adds a Financial Intelligence and DeFi Planning layer on top of the existing AA Smart Wallet platform.

- **Port**: 3003 (does NOT conflict with backend on 3001 or chatbot on 3002)
- **DB**: Same Postgres as `apps/backend` — adds 3 new tables via additive migration
- **Cache**: Same Redis instance — uses `financial:` key prefix
- **Zero impact**: Does NOT modify `chatbot-server/`, `apps/backend/`, `frontend/`, or any contract

## Architecture

```
User ──► POST /api/financial/chat
              │
              ▼
      Financial Agent (Groq)
              │
      ┌───────┼───────────┐
      ▼       ▼           ▼
  Portfolio  Market    DeFi Analytics
  Service    Prices    (Aave + Uniswap)
      │       │           │
      ▼       ▼           ▼
    RPC    Chainlink   Aave/Uniswap
              │
              ▼
       Transaction Proposal
              │
       [Explicit Confirm]
              │
              ▼
    (Execution via chatbot-server)
```

## Services Built

| Service | File | Purpose |
|---------|------|---------|
| Chain Registry | `config/chains.js` | Addresses per chain |
| Portfolio | `financial/portfolioService.js` | ETH + ERC-20 balances |
| Price Feeds | `financial/chainlinkPriceService.js` | On-chain Chainlink |
| Yield Calc | `financial/yieldCalculator.js` | APY estimator |
| Aave Service | `defi/aave/aaveService.js` | Reserve metrics |
| Aave Risk | `defi/aave/aaveRiskService.js` | Risk analysis |
| Uniswap Quote | `defi/uniswap/uniswapQuoteService.js` | Read-only quotes |
| Proposals | `transactions/proposalService.js` | Lifecycle state machine |
| Financial Agent | `agent/financialAgent.js` | Groq orchestrator |

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | /health | Health check |
| POST | /api/financial/chat | AI financial assistant |
| GET | /api/financial/portfolio/:chainId/:wallet | Portfolio snapshot |
| GET | /api/financial/market/prices | Chainlink prices |
| GET | /api/financial/aave/:chainId/usdc | Aave USDC metrics |
| GET | /api/financial/uniswap/quote | Swap quote (read-only) |
| POST | /api/financial/proposals | Create proposal |
| GET | /api/financial/proposals/:id | Get proposal |
| POST | /api/financial/proposals/:id/confirm | Confirm proposal |
| POST | /api/financial/proposals/:id/reject | Reject proposal |

## Quick Start

```bash
cd financial-agent
cp .env.example .env   # fill in values
npm install
npm run db:push         # adds 3 tables to existing DB
npm run dev
```

## Security Principles

- AI may **analyze and prepare** actions but **never executes** without explicit user confirmation
- Read-only tools are strictly separated from preparation tools
- A single controlled execution path exists: `execute_confirmed_transaction_proposal`
- All proposals expire after TTL (default 5 min)
- Audit log records every financial event
