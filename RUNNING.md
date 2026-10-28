# Running the project

This repository is an Arbitrum Sepolia (`421614`) smart-wallet platform. It has a React frontend, NestJS API, PostgreSQL/Prisma persistence, Redis, a chatbot service, a financial-agent service, and Hardhat contracts/scripts.

## Prerequisites

- Node.js 20+
- npm
- Docker Desktop with Docker Compose
- An Arbitrum Sepolia RPC URL and the public contract/bundler values required by the app

Never commit `.env` files, private keys, API keys, or session keys.

## First-time setup

From the repository root:

```bash
npm ci                         # Hardhat/contracts
cp .env.example .env
cp frontend/.env.example frontend/.env
cp apps/backend/.env.example apps/backend/.env
cp chatbot-server/.env.example chatbot-server/.env
cp financial-agent/.env.example financial-agent/.env
```

Fill in the required values in each `.env`. The frontend uses `VITE_*` variables; server-only secrets belong in the relevant service `.env`.

## Recommended: Docker services

Docker Compose starts PostgreSQL, Redis, the backend, chatbot server, and financial agent. It does not start the frontend.

```bash
docker compose up --build
```

The backend container waits for PostgreSQL, runs `prisma migrate deploy`, bootstraps seed data, and then starts on `http://localhost:3001`. Other services listen on `3002` and `3003`.

Stop services while keeping the database volume:

```bash
docker compose down
```

To remove the local database volume too (destructive):

```bash
docker compose down -v
```

## Frontend

With the Docker services running, in a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open the Vite URL shown in the terminal, normally `http://localhost:5173`. Useful checks:

```bash
npm run lint
npm run build
```

## Run services without Docker

Start PostgreSQL and Redis locally first, then use the connection values in `apps/backend/.env` and `financial-agent/.env`.

Backend:

```bash
cd apps/backend
npm ci
npm run prisma:generate
npx prisma migrate deploy
npm run prisma:seed
npm run start:dev
```

Financial agent:

```bash
cd financial-agent
npm ci
npm run db:generate
npm run dev
```

Chatbot server:

```bash
cd chatbot-server
npm ci
npm start
```

## Prisma and database

- Backend schema: `apps/backend/prisma/schema.prisma`
- Backend migrations: `apps/backend/prisma/migrations/`
- Financial-agent schema: `financial-agent/prisma/schema.prisma` (shared PostgreSQL database)
- Validate/generate backend Prisma Client:

  ```bash
  cd apps/backend
  npm run prisma:validate
  npm run prisma:generate
  ```

- For a development schema change, use a new migration rather than editing an applied migration:

  ```bash
  npx prisma migrate dev --name <migration-name>
  ```

## Contracts and Hardhat

Install root dependencies, configure the root `.env`, then run the narrow checks from the root:

```bash
npx hardhat compile
npx hardhat test
```

Deployment scripts under `scripts/` can affect live contracts and require configured keys and addresses. Review the script and target network before running one.

## Verification

```bash
cd apps/backend && npm run lint && npm test && npm run prisma:validate && npm run build
cd ../../chatbot-server && npm test
cd ../frontend && npm run lint && npm run build
```

Health endpoints include `http://localhost:3001/health` and `http://localhost:3003/health` when the corresponding services are running.
