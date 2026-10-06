# Stabilization Plan and Risk Register

This pass is deliberately additive. Frozen AA behavior, contract storage, selectors,
CREATE3 inputs, EntryPoint packing, and applied migrations are unchanged.

## Phases and rollback

1. Behavior freeze and characterization
   - Files: `docs/behavior-contract.md`, action-tag and security tests.
   - Rollback: remove documentation/tests only; runtime is unaffected.
2. Explicit multi-effect action tags
   - Files: frontend action-tag constants, `trackOp` metadata, chatbot `ops[].tags`.
   - Compatibility: legacy label fallback remains byte-for-byte equivalent in outcome.
   - Rollback: remove explicit `tags`; the fallback resumes current behavior.
3. Verified backend action events
   - Route: additive `POST /actions/events`.
   - Compatibility: legacy `/accounts/:address/sync` remains available and accepts the original singular `actionTag`.
   - Rollback: frontend automatically falls back to the legacy route when the new route is unavailable.
4. State and error UX
   - Versioned storage helpers read existing values in place; no key is renamed.
   - Browser popups are replaced by toasts and an accessible confirmation dialog.
   - Rollback: UI components can be reverted without changing APIs or persisted data.
5. Arbitrum Sepolia boundary and presentation polish
   - Public config, chatbot and financial service reject other chain IDs.
   - Explorer helpers use the env-configured Arbiscan base URL.
   - Route lazy-loading, safe Markdown, responsive rules and reduced-motion support are presentation-only.

## Risk register

| Risk | Severity | Mitigation/status |
|---|---:|---|
| Server-held signing endpoints have no SIWE/JWT guard | Critical | Not changed in this pass because authentication is a separate roadmap phase; restrict network access until Phase 2 auth ships. |
| Internal agent endpoint can return a plaintext private key | Critical | Existing behavior preserved; keep internal-only and add service authentication before public exposure. |
| Browser legacy activation stores burner private keys in localStorage | High | Flagged; removal needs an explicit migration because existing sessions depend on it. |
| `SessionKeyValidator.maxUses` is never incremented | High | Frozen contract issue; requires separate audited deployment and migration plan. |
| ERC20 agent policy is wildcard target/selector | High | Server tool allowlist and selector regression guards retained; on-chain policy redesign requires approval. |
| Swap uses `amountOutMinimum = 0` | High | Existing execution behavior preserved; slippage protection would change transaction behavior and needs separate approval. |
| Repetition applies spend limit per operation, not aggregate | High | Characterized and documented; changing it may reject previously working requests. |
| Action event cannot prove semantic effects absent matching logs | Medium | Backend syncs only receipt-derived effects and safely widens them; legacy fallback remains for older deployments. |
| No durable ActionEvent table | Medium | Existing UserOperation uniqueness supplies idempotency for UserOps; tx-only durable lifecycle remains a follow-up requiring a new migration. |
| Frontend bundle remains large | Medium | Route-level lazy loading added; wallet/provider dependencies remain in the initial graph. |
| Hook warnings remain | Medium | Zero lint errors; warnings are pre-existing dependency-lifecycle work and should be addressed with characterization tests. |
| Financial-agent Prisma schema drifts from backend schema | Medium | No schema mutation in this pass; designate the Nest schema as canonical before the next migration. |
| Arbitrum WETH addresses disagree across services | High | Not guessed or changed; verify deployed protocol address before synchronizing config. |

## Intentionally deferred

- Contract changes, including `maxUses` accounting.
- Replacing the in-memory `agentConfigs` fallback.
- Encrypting/migrating stored session keys.
- SIWE/JWT authorization.
- Aave repay, which does not currently exist.
- A durable action-event migration and push transport.
- Live-wallet screenshots and Lighthouse baselines; these require a running funded test environment.

## Verification evidence from this pass

- Post-change unauthenticated landing captures exist at 320, 375, 768, 1024, and 1440 px in `docs/ui-screenshots/`.
- Exact CDP viewport checks found no horizontal overflow.
- The production-build Lighthouse result is stored at `docs/lighthouse-after.json` (performance 72, accessibility 93, CLS 0).
- Wallet-gated screen captures and an equivalent pre-change Lighthouse baseline remain deferred; reporting them without a funded wallet or baseline would be misleading.
