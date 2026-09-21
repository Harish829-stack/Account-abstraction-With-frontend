# Architecture And Phase Status

Last updated: 2026-09-21

## Current Architecture

```text
Frontend (Vite React)
  - Wallet UX, account setup, paymaster flows, UserOp sending, modules UI, AI agent UI
  - Reads chain/shared contract config from the Nest backend when VITE_CONFIG_API_URL is set
  - Falls back to static frontend config if backend config is unavailable
  - Uses VITE_CHATBOT_API_URL for chatbot and AI-agent routes

Nest backend (apps/backend)
  - GET /config
  - Prisma + Postgres for chain and contract configuration
  - Redis cache for config responses

Chatbot server (chatbot-server)
  - /api/chat
  - /api/agent/status/:smartAccountAddress
  - /api/agent/generate
  - Still separate from Nest backend
  - Still uses in-memory agent/session state unless later migrated

Contracts / deployment scripts
  - Frozen for this refactor phase
  - No contract logic, EntryPoint packing, CREATE3, or storage layout changes so far
```

## Environment URLs

Frontend uses two separate API origins now:

```env
VITE_CONFIG_API_URL="http://127.0.0.1:3001"
VITE_CHATBOT_API_URL="https://your-chatbot-service.example"
```

Backend uses:

```env
DATABASE_URL="postgresql://..."
REDIS_URL="rediss://..."
```

For Supabase local dev, use the Supabase Session Pooler URL, not the direct `db.<project>.supabase.co:5432` URL unless IPv6/direct connectivity is available.

## Data Currently Stored

### Postgres

Currently written by `npm run prisma:seed`:

- `Chain`
- `ChainContract`
- `SharedContract`

These store active chain config, view-only chain config, RPC URLs, bundler URLs, explorer metadata, gas fee floors, per-chain contract addresses, and shared contract addresses.

The schema already includes these future tables, but the app does not yet write them in normal runtime flows:

- `AdminUser`
- `SiweSession`
- `SmartAccount`
- `Guardian`
- `SessionKey`
- `UserOperation`
- `MultisigProposal`

### Redis

Currently stores only the backend config response cache:

```text
key: app_config
ttl: 60 seconds
value: { chains, sharedContracts }
```

Redis is not yet used for queues, indexing, session storage, or pub/sub beyond the scaffolded service method.

### Browser Local Storage

Still used for some frontend state:

- current view
- selected smart account address
- pending UserOps
- tracked UserOps
- cached frontend config response

## Completed Work

### Phase 0: Frontend Chain Config Seam

Done:

- Centralized chain metadata in `frontend/src/config/chains.js`
- Added helpers for chain config, contracts, native currency, RPC, bundler, explorer URLs
- Refactored frontend code to use the chain config seam
- Preserved existing macro flows: paymaster approval, send op, batch send, AI agent, modules
- Cleaned frontend build/lint blockers

Known remaining frontend warnings:

- React hook dependency warnings still exist in legacy view/context code
- Vite chunk-size warning still exists

### Phase 1: Backend Config Scaffold

Done:

- Added `apps/backend` NestJS service
- Added Prisma schema
- Added Postgres config models
- Added Redis service
- Added `GET /config`
- Added static fallback config
- Added seed script
- Added backend tests/lint/build setup
- Added local `docker-compose.yml` for Postgres and Redis
- Added backend `.env.example`
- Frontend now fetches remote config from `VITE_CONFIG_API_URL`
- Chatbot calls now use `VITE_CHATBOT_API_URL`
- Redis URL handling hardened so malformed Redis URLs do not stall config requests
- Module refresh no longer clears known installed validator state on transient RPC read failures

Verified:

- Backend lint passes
- Backend build passes
- Backend tests pass
- Prisma schema validates
- Frontend lint passes with existing warnings
- Frontend build passes
- Local `GET /config` returns DB-backed Sepolia and Amoy config

## Current Runtime Behavior

### Config Flow

```text
Frontend
  -> GET {VITE_CONFIG_API_URL}/config
  -> backend checks Redis app_config
  -> if cache miss, backend reads Postgres
  -> backend returns { chains, sharedContracts }
  -> frontend merges remote chain rows with local client-only metadata such as switchNetwork
```

If `VITE_CONFIG_API_URL` is missing or the request fails, the frontend continues with static config.

### UserOp History Flow

Current behavior:

- Frontend tracks pending ops in local storage
- Frontend polls bundler receipt
- Frontend falls back to EntryPoint logs
- History view still depends on frontend/explorer/RPC behavior

Not done yet:

- backend UserOp persistence
- backend receipt worker
- DB-backed history endpoint

### AI Agent Flow

Current behavior:

- Chatbot server generates agent keys
- Frontend installs session key on-chain
- Chatbot server executes agent requests
- Agent/session state is not yet stored in the new Nest backend database

Recent fix:

- A failed module refresh no longer makes the Chatbot view incorrectly show "Missing validator module" when the previous known state had the SessionKeyValidator installed.

Not done yet:

- persistent agent/session records
- persisted AI messages
- persisted agent permissions
- backend-managed session key lifecycle

## Pending Phases And Feature List

### Phase 2A: Smart Account Persistence

Features:

- `POST /accounts/upsert`
- `GET /accounts/:address`
- store owner EOA
- store chain ID
- store smart account address
- store salt
- store deployment status or deployment timestamp
- update frontend after account prediction/deployment

Benefits:

- backend knows which smart accounts exist
- later history/session/user-op records can link to a durable account row

### Phase 2B: UserOperation Persistence

Features:

- `POST /user-ops`
- `GET /user-ops?smartAccount=&chainId=`
- `PATCH /user-ops/:hash/status`
- store op hash
- store chain
- store sender/smart account
- store label
- store calldata
- store pending/confirmed/reverted/dropped status
- store receipt JSON
- store confirmed tx hash/block/time

Frontend changes:

- after `sendUserOperation`, save op to backend
- History view reads backend first
- keep current explorer/RPC fallback

Benefits:

- history survives browser refresh and device changes
- AI-agent ops and manual ops share the same history source

### Phase 2C: UserOperation Receipt Worker

Features:

- poll bundler `eth_getUserOperationReceipt`
- fallback to EntryPoint `UserOperationEvent`
- mark pending ops confirmed/reverted/dropped
- retry with backoff
- stale pending-op sweep
- chain-aware processing

Benefits:

- frontend no longer owns receipt polling as the source of truth
- lower RPC pressure from every browser tab

### Phase 3: AI Agent Persistence

Features:

- persist generated agent address
- persist smart account + chain relation
- persist scope
- persist max amount
- persist target and selector
- persist expiry
- persist enabled/revoked state
- persist install op hash
- optionally persist conversation/message records

Chatbot server changes:

- replace in-memory agent config with Postgres reads/writes
- survive Render/Railway restarts
- support multiple devices for the same account

Options:

- keep chatbot as a separate Railway service sharing the same database
- later merge chatbot routes into Nest

### Phase 4: Auth And Admin

Features:

- SIWE nonce endpoint
- SIWE verify endpoint
- JWT session
- `AdminUser` role checks
- admin allowlist
- protected admin routes

Admin config APIs:

- create/update chains
- activate/deactivate chains
- update per-chain contracts
- update shared contracts
- invalidate Redis `app_config`

Frontend admin changes:

- AdminView writes chain/config updates to backend
- no redeploy needed for chain activation or contract address updates

### Phase 5: Multichain Expansion

Features:

- activate Holesky/Base Sepolia/Optimism Sepolia from DB
- per-chain RPC and bundler config
- per-chain explorer config
- per-chain contract rows
- view-only chain support
- chain health checks

Health checks:

- RPC reachable
- bundler reachable
- explorer config valid
- EntryPoint code exists
- expected shared contracts have code

### Phase 6: Production Hardening

Features:

- DTO validation
- address validation
- chain ID validation
- typed error responses
- CORS allowlist
- request rate limits
- structured logging
- `GET /health`
- DB connectivity check
- Redis connectivity check
- config freshness check

Deployment:

- Railway `config-api` service from `apps/backend`
- Railway or Render `chatbot-api` service from `chatbot-server`
- frontend env split:
  - `VITE_CONFIG_API_URL`
  - `VITE_CHATBOT_API_URL`

### Phase 7: Indexing And Observability

Features:

- per-chain indexer
- EntryPoint `UserOperationEvent` indexing
- account deployment event indexing if available
- module install/uninstall event indexing if available
- UserOp latency metrics
- bundler failure metrics
- paymaster failure metrics
- AI-agent execution metrics
- retry/debug tooling for dropped ops

## Recommended Next Step

Implement Phase 2A and Phase 2B together:

```text
SmartAccount persistence + UserOperation persistence + HistoryView backend read path
```

This stabilizes the workflows currently being tested:

- manual send op
- batch send
- paymaster approval
- AI-agent execution
- post-execution history refresh

## Known Risks / Notes

- Frontend/public RPC and bundler URLs are browser-visible by design. Do not put private provider secrets in values returned by `/config`.
- Supabase direct database URLs may fail locally if IPv6 is unavailable. Use the Supabase Session Pooler for local dev.
- Upstash Redis URLs must start with `rediss://`, not `rrediss://`.
- The chatbot server still needs persistence; otherwise agent state can disappear on process restart.
- Contracts and AA invariants have not been changed and should remain frozen unless a dedicated review phase is started.
