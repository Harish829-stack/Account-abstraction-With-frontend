# Financial Agent

Express sidecar for the existing Arbitrum Sepolia smart-wallet product. It
provides portfolio, market, Aave, Uniswap, chat, and transaction-proposal APIs
using the platform's existing data sources.

## Setup

```bash
cp .env.example .env
npm ci
npm start
```

The service uses the same PostgreSQL and Redis instances as the backend.
`apps/backend/prisma/schema.prisma` and its migrations are the canonical
database definition; do not run `prisma db push` against a shared or production
database.

## Boundaries

- Arbitrum Sepolia (`421614`) is the supported runtime chain.
- The service can analyze data and persist transaction proposals.
- Proposal confirmation does not itself prove on-chain execution.
- Private keys and session keys must not be added to service configuration.

See the repository [runbook](../docs/RUNBOOK.md) for endpoints, environment
variables, deployment responsibilities, and known operational limitations.
