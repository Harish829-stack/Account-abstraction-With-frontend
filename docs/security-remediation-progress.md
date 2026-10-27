# Security remediation progress (append-only)

Append new dated entries; never rewrite or delete earlier entries. Entries record
scope, decisions, verification, commits, limitations, and the next safe step. Never
include credentials, private keys, signatures, or signed UserOperations.

## 2026-10-27 — Work authorized and Phase 2 started

- User authorized implementation and commits, with this append-only record.
- Baseline branch: `product/agentic-aa-platform`; working tree was clean.
- Working branch: `codex/security-phase2-auth`.
- Active phase: roadmap Phase 2, API authentication and signing access. Scope:
  server-issued SIWE challenges, short-lived revocable JWT sessions, account/admin
  authorization, authenticated sidecar requests, browser integration, and removal
  of private-key export from the agent API.
- Characterization tests precede behavioral edits. Security regression tests will
  cover unauthenticated requests, cross-account access, replay/expiry, admin access,
  signing-service access, and key disclosure.
- Preserve deployed contracts, CREATE3 address derivation, EntryPoint/UserOp
  encoding, applied migrations, and the public `GET /config` response shape.
- Future phases remain: audited on-chain session permissions and usage accounting;
  recovery and upgrade restrictions; unified transaction simulation/approval and
  slippage protection; durable execution/nonce queues and reorg-safe indexing;
  verified protocol/configuration integration; broader wallet UX and CI/audit gates.
- No deployment, live-fund transaction, database migration, or secret inspection is
  authorized by this implementation step.

## 2026-10-27 — Authentication core implemented and verified

- Added exact server-issued ERC-4361 challenges (five-minute validity), atomic
  one-time consumption, short-lived JWTs (15 minutes), issuer/audience/algorithm
  checks, logout revocation, and Redis-backed rate limits. Security storage fails
  closed; optional non-security caching retains its previous behavior.
- Added a global default-protected backend guard. Admin/configuration and worker
  controls require the database admin role. Account access verifies the current
  K1 owner through a chain-checked RPC, or the existing index-1 factory prediction
  for undeployed accounts. Client identity and historical owner metadata are not
  ownership proofs. Account responses without an explicit chain retain their
  array shape but are restricted to the authenticated chain.
- Added characterization and regression tests before/alongside implementation.
  Initial auth test run failed as expected before the new module existed.
- Backend HTTP tests initially could not bind a loopback port under the sandbox;
  rerunning with permission for that local-only test listener passed. This was an
  environment restriction, not an HTTP assertion failure.
- Verification at this checkpoint: backend `npm test -- --runInBand` passed 43
  tests in 12 suites; `npm run lint` and `npm run build` passed. A schema-only
  `DATABASE_URL=<local-validation-placeholder> npx prisma validate` passed without
  connecting to a database. Existing Redis fallback and Prisma deprecation warnings
  were observed.
- Signing isolation/browser integration are implemented in the working tree and
  are being checked as the next Phase 2 commit. No contracts or migrations changed.
