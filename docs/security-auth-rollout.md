# Phase 2 authentication and signing rollout

Status: implementation for local review; no deployment or real-fund verification.
See `security-remediation-progress.md` for the append-only record and open phases.

## Required configuration

Use the service `.env.example` templates. Do not put these secrets in `VITE_*`.

| Setting | Services | Requirement |
| --- | --- | --- |
| `AUTH_ORIGIN` | Backend | Exact frontend origin, e.g. `http://localhost:5173`; HTTPS outside loopback development. No path, query, or credentials. |
| `AUTH_JWT_SECRET` | Backend only | Independent random secret of at least 32 bytes. |
| `SIGNING_SERVICE_TOKEN` | Backend and chatbot only | Matching independent random secret of at least 32 bytes; must differ from the JWT secret. |
| `AGENT_KEY_ENCRYPTION_KEY` | Backend only | Base64-encoded 32 random bytes; retain securely for the lifetime of the encrypted agents. |
| `REDIS_URL` | Backend | Redis is required for authentication. Auth must fail closed during outages. |
| `VITE_CONFIG_API_URL` | Frontend | Browser-accessible backend URL, without a trailing slash. |
| `AGENT_STORE_API_URL` | Chatbot | Trusted backend URL; no standalone/in-memory signing fallback. |
| `BACKEND_API_URL` | Financial agent | Trusted backend URL. |

Generate each secret independently using your secret manager. Encryption-key
rotation needs a reviewed re-encryption procedure; changing or losing the key
without that procedure makes existing encrypted keys unusable. Revoke and recreate
affected agents using the owner wallet. Never print secrets in logs or tickets.

Provision `AdminUser` records with `role = admin` through trusted database
administration. There is no public endpoint to grant yourself administrator access.
Keep RPC and bundler credentials server-side or use restricted browser-public
credentials; the public config response shape is unchanged by this phase.

## Session and access behavior

- `POST /auth/challenge { address, chainId }` returns an exact server-issued
  ERC-4361 message, a random challenge ID, and a five-minute expiry.
- `POST /auth/verify { challengeId, signature }` verifies that exact message and
  signer, atomically consumes the challenge, and returns a 15-minute HS256 JWT.
  JWT algorithm, issuer, audience, expiry, issuance time, and Redis session state
  are checked on every protected request. Challenge/verification rates are bounded.
- `GET /auth/session` returns the authenticated identity. `POST /auth/authorize`
  additionally checks optional `{ account, chainId }`. `POST /auth/logout` revokes
  the current session. Bearer tokens remain in browser memory; disconnect and
  account/network changes clear them and request revocation.
- `GET /config` and `GET /health` remain public. Other backend routes require a
  session. Admin, observability, and worker-control routes require an admin role.
- Account access uses the configured RPC's chain ID and live K1 validator owner.
  Undeployed accounts must match the existing factory prediction with index 1,
  empty attesters, and threshold 0. The database's historical `ownerEoa` is not an
  authorization proof. RPC failures deny account access.
- Sidecars authorize against the backend and forward the same request's Bearer
  token using async request context. Financial `userId` comes from that session;
  caller-supplied conflicting identities are rejected.
- Current sign-in supports EOA owners using ERC-191 signatures. Multisig/contract
  owner authentication and passkey-native SIWE remain follow-ups; unsupported
  ownership fails closed. Existing on-chain owner execution is unchanged.

## Signing-key migration

- New managed agents are generated in the backend. Only their public address and
  metadata leave it. Keys are AES-256-GCM encrypted in the existing `privateKey`
  database column, with account/chain/agent bound as authenticated data. There is
  no schema change and no automatic rewrite of existing records.
- Public key import is rejected. The internal agent read endpoint returns
  metadata only. Internal reads/signing require both the owner's session and the
  separate service credential. The chatbot requests a packed-UserOp signature;
  the backend independently checks scope/call shape, amounts, chain, validator
  nonce, active on-chain permission, and the EntryPoint hash before signing.
- Existing plaintext database agents deliberately cannot sign. Owners must revoke
  their old on-chain keys and recreate agents before restoring autonomous use.
- Dashboard activation uses backend-managed keys. The manual session-key tool
  retains a temporary key only in component memory; it no longer reads or writes
  browser-stored private keys. Old localStorage entries are retained until the
  existing revoke/uninstall flow removes them. Revoke legacy keys and clear those
  entries during migration; previously exposed keys must be considered compromised.
- This is application-level encryption and a backend-controlled signing boundary,
  not an HSM/TEE. The backend process can access the master key. External key
  isolation, signing-key rotation, audited on-chain spending enforcement, and an
  independent audit remain release gates.

## Local checks

Run backend `npm run lint`, `npm test -- --runInBand`, `npm run build`, and
`npx prisma validate`; chatbot `npm test`; frontend `npm run lint`,
`node --test src/utils/auth-session.test.js src/constants/actionTags.test.js`, and
`npm run build`. To preserve the repository's generated-output rule, build the
frontend into a dedicated temporary directory using `--outDir` during review.

The HTTP security suite binds only an ephemeral loopback port and mocks chain/DB
dependencies. Sandbox permission for that listener may be required. No test sends
a UserOperation, funds a wallet, deploys contracts, or migrates the database.

With the monorepo Docker build context, build the financial sidecar using
`docker build -f financial-agent/Dockerfile .`; its shared authentication adapter
is copied from `packages/server-auth`. Docker excludes service secrets.

Before deployment, manually verify wallet sign-in/rejection, account and network
switches, logout, authorized admin access, legacy-agent rejection, and an explicitly
approved testnet agent lifecycle against the configured services. Automated tests
do not establish deployed-contract compatibility or production readiness.
