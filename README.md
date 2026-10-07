# Agentic Account-Abstraction Platform

A production-oriented ERC-4337/ERC-7579 smart-wallet platform running on
Arbitrum Sepolia (`421614`).

## Services

- `frontend/` — React wallet, dashboard, agent, and transaction UI.
- `apps/backend/` — NestJS API, PostgreSQL ledger, Redis cache, configuration,
  receipt reconciliation, and event indexing.
- `chatbot-server/` — Groq tool planning and guarded session-key UserOperation
  construction.
- `financial-agent/` — Portfolio, market, Aave, Uniswap, and transaction
  proposal APIs.
- `contracts/` and `scripts/` — ERC-4337/ERC-7579 contracts and controlled
  deployment utilities.

## Local development

1. Copy each service's `.env.example` to `.env` and provide the required
   Arbitrum Sepolia values.
2. Start the backend dependencies and services:

   ```bash
   docker compose up --build
   ```

3. Start the frontend:

   ```bash
   cd frontend
   npm ci
   npm run dev
   ```

Never commit `.env` files, private keys, session keys, or keyed RPC URLs.

## Documentation

- [Operations and deployment runbook](docs/RUNBOOK.md)
- [Frozen behavior contract](docs/behavior-contract.md)
- [Characterization smoke checklist](docs/characterization-smoke-checklist.md)
- [Stabilization plan](docs/stabilization-plan.md)
- [Smart-account proxy architecture](proxyPattern.md)

## Verification

```bash
cd apps/backend && npm run lint && npm test && npx prisma validate && npm run build
cd ../../chatbot-server && npm test
cd ../frontend && npm run lint && npm run build
```

Contract compilation and deployment checks should be run separately and only
when the contract or deployment phase explicitly requires them.
