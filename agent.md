# AGENTS.md — AA Smart Wallet (ERC-4337)

## Mission

Ship the dynamic-chain plan in phases (0→5 below). One phase per session/branch.
Behavior-preserving unless a phase says otherwise. Smallest diff that satisfies that
phase's "Done when" line. Read the nested AGENTS.md for whichever directory you're
working in (frontend/, apps/backend/ once it exists) before editing — this file only
holds what's true everywhere.

## Repo map

- contracts/, scripts/, ignition/ — Hardhat 3, Solidity 0.8.27, viaIR, EVM cancun
- frontend/src/ — React 19 + Vite, wagmi + RainbowKit, ethers v6.
  config/chains.js is the chain seam. Full Phase 0 detail: frontend/AGENTS.md
- apps/backend/ — NestJS + Prisma + Postgres + Redis, created in Phase 1.
  Detail lives in apps/backend/AGENTS.md once that directory exists.

## Commands (narrowest first, then the gate; report exact commands + output)

- Contracts: `npx hardhat compile && npx hardhat test`
- Frontend: `cd frontend && npm run lint && npm run build`
- Backend (Phase 1+): `cd apps/backend && npm run lint && npm test && npx prisma validate`
- DB (Phase 1+, local only): `npx prisma migrate dev`

## Workflow

1. `rg` before opening files — never load whole dirs, lockfiles, node_modules, build output.
2. Name which Phase (0–5) this session runs before writing code. Ask if a request spans phases.
3. Give a 5–8 line plan (files, risk, tests) before non-trivial edits. Stop for approval on
   anything in Frozen.
4. Nothing here has tests yet — write a characterization test before refactoring untested
   logic, so a behavior change shows up as a failing test, not a surprise later.
5. One concern per change. No drive-by renames, formatting sweeps, or dependency bumps.
6. End with: files changed, why, test results, open risks, next phase. Max 15 lines.

## 🔴 Before anything else (not a phase — do in parallel, separately)

Rotate: frontend/.env lines 9–12, VITE_GROK_API_KEY, VITE_ETHERSPOT_API_KEY, the Infura
key at AppContext.jsx:604. Check `git log --all --full-history -- frontend/.env`; if it
was ever committed, treat all keys as burned regardless of rotation. Never open, print,
or commit frontend/.env — use .env.example names only.

## Phase roadmap (full detail in the relevant nested AGENTS.md)

0. **frontend** — build the config/chains.js seam; zero chainId literals outside it.
   Done: `rg "80002|11155111" frontend/src` matches only chains.js.
1. **apps/backend scaffold** — NestJS + Prisma + Postgres + Redis, `GET /config`.
   Done: the only frontend diff is inside chains.js's fetch layer.
2. **SIWE auth** — JWT + guards on `/accounts/*` and `/admin/*`. Done: unauth calls 401.
3. **BullMQ indexer** — per-chain isolation, N-block confirmation, stale-op TTL sweep.
   Done: one chain's RPC outage doesn't stop the others.
4. **History endpoint swap** — AppContext.fetchRecentOps → `GET /accounts/:address/history`.
5. **Admin CRUD** — `POST`/`PATCH /admin/chains` with cache invalidation. Done: toggling an
   existing viewOnly chain to isActive is the entire "add a chain" operation.

## Frozen (stop and ask — don't touch without explicit approval)

CREATE3Factory salt/initCode (counterfactual addresses) · deployed contract storage
layout/selectors/events/errors · EntryPoint address/version, UserOp packing, 2D nonce ·
SessionKeyValidator's on-chain permission encoding · 2-of-3 multisig threshold logic ·
applied Prisma migrations · `GET /config` response shape once Phase 1 ships.

## AA invariants

validateUserOp: EntryPoint only. execute: EntryPoint or an authorized owner/module.
Validation phase obeys ERC-7562 — minimal, no new external calls introduced there. Gas
fields (gas limits, priority/fee floors) are never hardcoded — always via
chains.js/getChainConfig or the bundler's own estimator. Signature checks
(ECDSA/ERC-1271/WebAuthn) go through one shared path; never log raw signatures or
session keys.

## Backend & DB rules (Phase 1+)

Controller → service → repository — no DB calls in controllers, no business logic in
Prisma calls. Validate external input at the edge; typed errors, no swallowed catches.
One chain-I/O client wrapper (timeout, retry, chainId assertion) — no RPC URLs or
contract addresses hardcoded outside the Chain/SharedContract tables. UserOp and
webhook handlers idempotent (unique on hash, or (chainId, txHash, logIndex)). Wei
amounts as String, never float or JS number. Schema change = new migration
(expand→migrate data→contract); never edit an applied one. No destructive SQL; local
DB only.

## Hygiene

Never read, print, or commit .env or secrets. No new dependencies without asking; pin
versions. Don't hand-edit generated files (ABIs, typechain output, Prisma client) —
regenerate via the proper command. Match existing style; comment only non-obvious "why".
Keep chat replies short — edit files directly, don't paste full file contents back.
