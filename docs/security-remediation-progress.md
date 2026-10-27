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

## 2026-10-27 — Signing boundary and wallet clients completed

- Backend generates managed agents and encrypts keys with AES-256-GCM, binding
  ciphertext to the account, chain, and agent. The existing database column is
  reused; public key import and plaintext legacy signing are rejected. Internal
  reads now return metadata only. Signing requires an authenticated current owner
  and an independent service credential, checks deterministic scope/call/amount
  rules and live on-chain key validity, and signs the configured EntryPoint hash.
- Chatbot no longer creates, retrieves, or retains private keys. It forwards the
  requesting user's session and requests signatures from the backend; its local
  in-memory agent fallback was removed. The builder verifies the returned signer
  against its own UserOperation hash before submission.
- Both sidecars use the shared `packages/server-auth` adapter, with request-scoped
  credential propagation, bounded authorization timeouts, and fail-closed backend
  authorization. Financial proposal identity comes from the verified session.
- Browser clients authenticate backend/agent requests and coordinate concurrent
  requests through one SIWE prompt. Tokens stay in memory and are cleared/revoked
  on disconnect or wallet/network changes. Dashboard activation uses managed
  agents. Manual keys remain temporary component state, with no storage reads or
  writes. Existing browser-stored keys are intentionally not silently erased;
  revoke old on-chain keys and clear their legacy entries during rollout.
- Final review closed conflicting query/body account and chain selectors. A new
  HTTP regression test ensures a request cannot authorize one resource while
  acting on another. Signing tests also caught valid zero-padded ethers quantities
  being rejected; uint256 input validation now accepts them without changing nonce
  semantics or packing.
- Added `docs/security-auth-rollout.md` with configuration, admin provisioning,
  legacy-agent migration, Docker context changes, and release limitations. Only
  empty secret placeholders were appended to service `.env.example` templates.
- Final verification:
  - Backend: `npm run lint`, `npm run build`, and `npm test -- --runInBand`
    passed; 48 tests across 13 suites. HTTP tests used an ephemeral local listener
    with sandbox permission. Chain and database behavior is mocked in those tests.
  - Backend: `DATABASE_URL=<local-validation-placeholder> npx prisma validate`
    passed; schema validation only, no database connection or migration.
  - Chatbot: `npm test` passed, 28 tests.
  - Frontend: `npm run lint` passed with the same 14 pre-existing hook warnings;
    an introduced unused binding was fixed before final verification.
  - Frontend: `node --test src/utils/auth-session.test.js src/constants/actionTags.test.js`
    passed, 15 tests. `npm run build -- --outDir /private/tmp/aa-wallet-phase2-verified-build`
    passed; repository build output was left untouched.
  - `node --check` passed for chatbot server/builder, financial server/backend
    client, and the shared auth adapter. `git diff --check` passed.
- Remaining release gates: configure the new secrets and admin role; test the real
  wallet/agent lifecycle on an explicitly approved testnet; verify container builds;
  migrate/revoke legacy plaintext agents and browser entries; provide contract-owner
  and passkey-native sign-in; independently review the auth and signing boundary.
  Backend application encryption is not an HSM/TEE.
- Critical on-chain permission/usage, recovery, upgrade, slippage, aggregate/gas
  budgets, nonce concurrency, and reorg issues from the review remain open. No
  claim of production readiness or completion of the entire remediation is made.
- Next phase: add contract characterization/invariant tests and design audited
  session-permission, recovery, and upgrade fixes on a separate phase branch,
  preserving CREATE3 addresses and planning explicit deployment/migration steps.
