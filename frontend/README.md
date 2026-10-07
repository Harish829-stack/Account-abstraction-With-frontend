# Smart Wallet Frontend

React and Vite interface for the Arbitrum Sepolia smart-wallet platform.
Runtime chain and contract configuration is loaded from the backend, with the
public values in `.env` acting as startup fallbacks.

## Setup

```bash
cp .env.example .env
npm ci
npm run dev
```

The backend, chatbot server, and financial agent URLs must match the locally
running services. Only Arbitrum Sepolia (`421614`) is supported, and transaction
links must use `https://sepolia.arbiscan.io`.

Do not place private keys, guardian keys, or server credentials in any
`VITE_*` variable; Vite exposes these values to the browser.

## Verification

```bash
npm run lint
npm run build
```

See the repository [runbook](../docs/RUNBOOK.md) for the complete environment,
deployment, synchronization, and troubleshooting reference.
