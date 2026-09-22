# Architecture And Phase Status

Last updated: 2026-09-22

## Current Architecture

```text
Frontend (Vite React)
  - Wallet UX, account setup, paymaster flows, UserOp sending, modules UI, AI agent UI
  - Reads chain/shared contract config from the Nest backend when VITE_CONFIG_API_URL is set
  - Falls back to static frontend config if backend config is unavailable
  - Uses VITE_CHATBOT_API_URL for chatbot and AI-agent routes

Nest backend (apps/backend)
  - GET /config
  - POST /accounts/upsert
  - GET /accounts/:address
  - GET /accounts/:address/history
  - POST /user-ops
  - GET /user-ops
  - PATCH /user-ops/:hash/status
  - POST /agents
  - GET /agents
  - GET /agents/internal/:smartAccount/:agentAddress
  - PATCH /agents/:smartAccount/:agentAddress/authorize
  - PATCH /agents/:smartAccount/:agentAddress/revoke
  - DELETE /agents/:smartAccount
  - GET /dashboard/:smartAccountAddress?chainId=
  - Prisma + Postgres for chain config, contract config, smart accounts, UserOps, and AI agents/session keys
  - Redis cache for config responses

Chatbot server (chatbot-server)
  - /api/chat
  - /api/agent/status/:smartAccountAddress
  - /api/agent/generate
  - /api/agent/:smartAccountAddress/:agentAddress/authorize
  - /api/agent/:smartAccountAddress/:agentAddress/revoke
  - /api/agent/:smartAccountAddress
  - Still separate from Nest backend
  - Persists agent/session state through the Nest backend when AGENT_STORE_API_URL is configured
  - Falls back to in-memory agent/session state only when no backend URL is configured

Contracts / deployment scripts
  - Frozen for this refactor phase
  - No contract logic, EntryPoint packing, CREATE3, or storage layout changes so far
```

## Environment URLs

Frontend uses two separate API origins now:

```env
VITE_CONFIG_API_URL="http://127.0.0.1:3001"
VITE_CHATBOT_API_URL="http://127.0.0.1:3002"
```

Backend uses:

```env
DATABASE_URL="postgresql://..."
REDIS_URL="rediss://..."
CORS_ORIGINS="http://127.0.0.1:5173,http://localhost:5173"
RATE_LIMIT_MAX=0
RATE_LIMIT_WINDOW_MS=60000
USEROP_RECEIPT_WORKER_ENABLED=true
USEROP_RECEIPT_POLL_INTERVAL_MS=15000
USEROP_RECEIPT_BATCH_SIZE=25
USEROP_RECEIPT_STALE_MINUTES=20
USEROP_RECEIPT_FALLBACK_BLOCKS=150
USEROP_INDEXER_ENABLED=true
USEROP_INDEXER_POLL_INTERVAL_MS=30000
USEROP_INDEXER_CONFIRMATIONS=2
USEROP_INDEXER_BLOCK_RANGE=150
USEROP_INDEXER_START_LOOKBACK_BLOCKS=300
```

Chatbot server uses:

```env
AGENT_STORE_API_URL="http://127.0.0.1:3001"
CHAIN_ID=11155111
CHATBOT_CORS_ORIGINS="http://127.0.0.1:5173,http://localhost:5173"
JSON_BODY_LIMIT="1mb"
RATE_LIMIT_MAX=0
RATE_LIMIT_WINDOW_MS=60000
```

For Supabase local dev, use the Supabase Session Pooler URL, not the direct `db.<project>.supabase.co:5432` URL unless IPv6/direct connectivity is available.

## Data Currently Stored

### Postgres

Written by `npm run prisma:seed`:

- `Chain`
- `ChainContract`
- `SharedContract`

These store active chain config, view-only chain config, RPC URLs, bundler URLs, explorer metadata, gas fee floors, per-chain contract addresses, shared contract addresses, and per-chain indexer cursor/error metadata.

Written by normal runtime flows after Phase 2 and Phase 3:

- `SmartAccount`
- `UserOperation`
- `SessionKey`

These store owner EOA, smart account address, chain ID, salt/deployment metadata when available, UserOp hash, label, calldata, pending/confirmed/reverted/dropped status, receipt JSON, tx hash, block number, confirmation/drop timestamps, agent address, agent name, scope, target, selector, max amount/value, validity window, install/revoke hashes, lifecycle status, and the server-side agent signing key for the current dev architecture.

The schema already includes these future tables, but the app does not yet write them in normal runtime flows:

- `AdminUser`
- `SiweSession`
- `Guardian`
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

Browser local storage is now a fallback/cache for UserOp history. When `VITE_CONFIG_API_URL` is set and the backend is reachable, the frontend writes UserOps to Postgres and reads history from the backend first.

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

### Phase 2: Smart Account And UserOperation Persistence

Done:

- Added account API module with `POST /accounts/upsert`, `GET /accounts/:address`, and `GET /accounts/:address/history`
- Added UserOp API module with `POST /user-ops`, `GET /user-ops`, and `PATCH /user-ops/:hash/status`
- Added runtime validators for addresses, hashes, hex calldata, chain IDs, pagination limits, strings, and dates
- Added repository/service boundaries for account and UserOp persistence
- Made UserOp writes idempotent by `hash`
- Linked UserOps to durable `SmartAccount` rows
- Updated the Prisma `UserOperation` model with label, calldata, status, tx hash, receipt, and update timestamp fields
- Updated frontend tracking so manual sends, batch sends, paymaster approval, swaps, setup actions, module actions, session-key actions, WebAuthn actions, and AI-agent ops can be persisted
- Updated `HistoryView` to read backend history first and keep the existing explorer/RPC/local fallback
- Updated AI-agent chat flow to register returned operation hashes with the shared history path

Verified:

- Backend Prisma schema validates
- Backend Prisma Client generation passes
- Backend tests pass
- Backend lint passes
- Backend build passes
- Frontend lint passes with existing warnings
- Frontend build passes

### Phase 3: Multi-Agent AI Session Keys

Done:

- Added backend `AgentsModule` backed by the existing `SessionKey` table
- Extended `SessionKey` with agent metadata, rule details, lifecycle status, install/revoke hashes, timestamps, and server-side signing key storage for the dev architecture
- Added persistent agent APIs for create, list, internal signer lookup, authorize, revoke one, and revoke all
- Refactored chatbot server agent routes to use the Nest backend as the agent store when `AGENT_STORE_API_URL` is configured
- Kept chatbot memory fallback for isolated local demos without the backend
- Updated React chatbot context for N:1 agents per smart account, active-agent selection, per-agent chat history, persisted status reads, authorization, revoke one, and revoke all
- Updated Chatbot UI to show all agents, switch active agents, create new agents without wiping existing ones, revoke one agent, and revoke all agents
- Individual revoke now sends a UserOp calling `SessionKeyValidator.revokeSessionKey(agentAddress)`
- Revoke all now sends a UserOp calling `uninstallModule(1, SESSION_KEY_VALIDATOR, deInitData)`, then marks all persisted agents revoked

Verified:

- Backend Prisma schema validates
- Backend Prisma Client generation passes
- Backend lint passes
- Backend tests pass
- Backend build passes
- Chatbot server syntax check passes
- Frontend lint passes with existing warnings
- Frontend build passes

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

- Frontend tracks pending ops in local storage for immediate UI feedback
- Frontend saves tracked UserOps to the backend when `VITE_CONFIG_API_URL` is set
- Backend persists UserOps in Postgres and links them to a smart account
- Frontend marks backend UserOps confirmed or dropped when its current polling path resolves
- History view reads backend history first
- If backend history is unavailable or empty, the frontend falls back to explorer/RPC/local behavior

Not done yet:

- backend receipt worker
- backend-owned pending-op sweep
- backend-owned EntryPoint log indexing

### AI Agent Flow

Current behavior:

- Chatbot server generates agent keys
- Frontend installs session key on-chain
- Nest backend persists agent/session-key metadata and lifecycle state in Postgres
- Chatbot server loads the selected agent by smart account + chain + agent address
- Chatbot server executes agent requests with the selected persisted signing key
- Frontend can switch between multiple active agents for one smart account
- Frontend can revoke one agent on-chain
- Frontend can revoke all agents by uninstalling the SessionKeyValidator

Recent fix:

- A failed module refresh no longer makes the Chatbot view incorrectly show "Missing validator module" when the previous known state had the SessionKeyValidator installed.
- AI-agent UserOp hashes returned from the chatbot are now handed to the shared frontend tracking path, so they can persist to backend history when the backend URL is configured.

Not done yet:

- persisted AI messages
- production-grade key custody or KMS-backed signing
- SIWE-authenticated agent APIs

## Pending Phases And Feature List

### Phase 2A: Smart Account Persistence

Status: complete.

Implemented features:

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

Status: complete.

Implemented features:

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
- stale pending-op sweep
- chain-aware processing

Benefits:

- frontend no longer owns receipt polling as the source of truth
- lower RPC pressure from every browser tab

Status: complete.

Implemented:

- Added `ReceiptsModule`
- Added background worker controlled by `USEROP_RECEIPT_WORKER_ENABLED`
- Polls pending `UserOperation` rows from Postgres in bounded batches
- Uses bundler `eth_getUserOperationReceipt`
- Falls back to bounded EntryPoint `UserOperationEvent` log lookup through chain RPC
- Marks UserOps `confirmed`, `reverted`, or `dropped`
- Stores tx hash, confirmed block, receipt JSON, and timestamps
- Added manual `POST /receipts/poll` endpoint for local testing
- Frontend tracker now reads backend status before doing local receipt checks
- Frontend no longer writes final receipt status as the authority

### Phase 3: AI Agent Persistence

Status: complete for dev architecture.

Implemented features:

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

Remaining hardening:

- encrypt or KMS-store agent private keys instead of plain DB storage
- protect `/agents/internal/*` behind service-to-service auth
- persist AI conversation transcripts if needed

### Phase 5: Agent Chain Sync

Status: complete for dev architecture.

Implemented:

- Added `POST /agents/:smartAccount/sync`
- Frontend AI Agent view can read current `isModuleInstalled` and `getActiveSessionKeys`
- Backend reconciles saved agents with observed on-chain active keys
- Marks active DB agents revoked when the module is uninstalled
- Marks active DB agents revoked when they disappear from on-chain active keys
- Marks expired agents as `expired` and clears their signing key
- Keeps generated-but-not-yet-authorized pending agents pending
- Chatbot server refuses to sign for pending, revoked, expired, or keyless agents
- AI Agent UI has a `Sync Agents` action and shows each agent lifecycle status

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

Status: complete for dev/non-custody architecture, excluding auth/key-custody security work by request.

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

Implemented:

- `GET /health`
- `GET /health/ready`
- DB/Redis/config readiness checks
- backend request logging with method/path/status/duration
- backend `CORS_ORIGINS`
- backend optional in-memory `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS`
- chatbot `GET /health`
- chatbot `CHATBOT_CORS_ORIGINS`
- chatbot `JSON_BODY_LIMIT`
- chatbot optional in-memory `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS`

Deployment:

- Railway `config-api` service from `apps/backend`
- Railway or Render `chatbot-api` service from `chatbot-server`
- frontend env split:
  - `VITE_CONFIG_API_URL`
  - `VITE_CHATBOT_API_URL`

### Phase 7: Indexing And Observability

Status: complete for known-account UserOp indexing and basic platform observability.

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

Implemented:

- `IndexerModule`
- background known-account EntryPoint `UserOperationEvent` scanner
- bounded per-chain block ranges
- configurable confirmation depth
- `Chain.lastIndexedBlock`, `lastSyncAt`, and `lastSyncError` updates
- `POST /indexer/poll` for manual local indexing
- `ObservabilityModule`
- `GET /observability/summary`
- `GET /observability/user-ops?status=&chainId=&limit=`
- UserOp status counts
- agent lifecycle status counts
- average confirmation latency from persisted operations
- chain indexer status summary
- History rows now include compact backend-generated debug details for dropped/reverted/indexed operations

### Phase 8: Operational UX

Status: complete for admin-facing operational controls.

Implemented:

- AdminView now has workspace modes:
  - Protocol Ops
  - Operations
  - Chain Config
- Operations panel reads `GET /observability/summary`
- Operations panel shows UserOp counts, agent lifecycle counts, average confirmation latency, chain indexer state, and recent dropped ops
- Operations panel can manually trigger:
  - `POST /receipts/poll`
  - `POST /indexer/poll`
- History rows retain compact backend-generated debug details

### Phase 9: Admin Config CRUD

Status: complete for dev architecture, intentionally unauthenticated until the deferred auth/security phase.

Implemented:

- Added backend `AdminModule`
- Added `GET /admin/config`
- Added `POST /admin/chains`
- Added `PATCH /admin/chains/:chainId`
- Added `PATCH /admin/chains/:chainId/contracts`
- Added `PATCH /admin/shared-contracts`
- Admin writes invalidate Redis `app_config`
- AdminView Chain Config panel can edit chain metadata, activate/deactivate chains, update per-chain contracts, and update shared contracts
- Frontend chain registry can refresh remote config after admin saves
- App context listens for config updates and re-renders chain-dependent views

### Phase 10: Product Dashboard Readiness

Status: complete for the current productization pass.

Implemented:

- Added backend `DashboardModule`
- Added `GET /dashboard/:smartAccountAddress?chainId=`
- Dashboard summary joins smart account persistence, chain config, UserOp counts, recent UserOps, agent lifecycle counts, active agents, and indexer cursor state
- Endpoint returns a product-readiness checklist and score for the connected account
- Frontend Home dashboard now loads this single backend summary instead of inferring product state from multiple scattered reads
- Home dashboard shows readiness, confirmed/pending UserOps, active/expiring agents, chain/indexer state, checklist items, and recent backend-tracked operations
- The summary API returns an empty known-account state instead of 404, so first-run demos still render cleanly

## Recommended Next Step

With the product dashboard summary in place, the next non-security phase should be:

```text
Product demo packaging
```

Focus:

- scripted demo accounts and seeded sample data
- a polished first-run onboarding path for empty accounts
- role-based demo/admin navigation once auth is reintroduced
- public product landing page only after the app experience is stable

## Known Risks / Notes

- Frontend/public RPC and bundler URLs are browser-visible by design. Do not put private provider secrets in values returned by `/config`.
- Supabase direct database URLs may fail locally if IPv6 is unavailable. Use the Supabase Session Pooler for local dev.
- Upstash Redis URLs must start with `rediss://`, not `rrediss://`.
- Phase 2 changed the Prisma schema. Run `npx prisma db push` against the dev database before testing the new backend history endpoints.
- The chatbot server uses backend persistence when `AGENT_STORE_API_URL` is configured; without it, agent state falls back to process memory.
- Contracts and AA invariants have not been changed and should remain frozen unless a dedicated review phase is started.
