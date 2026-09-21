# AGENTS.md — frontend/ (Phase 0 detail)

Save this as frontend/AGENTS.md. It loads only when Codex works inside frontend/, on top
of the root AGENTS.md — assume that one has already been read.

## Phase 0 — build the seam

Create src/config/chains.js: CHAIN_REGISTRY, SHARED_CONTRACTS, `getChainConfig(chainId)`,
`getSupportedChainIds()`, and an async `getSharedContracts()` stub — static now, becomes
a fetch in Phase 1 with no caller changes.

Fix in this order:

- **utils/bundler.js** — every exported function takes `chainId` as a parameter; delete
  all `window.ethereum`/chainId-detection logic inside it.
- **context/AppContext.jsx** — delete the `isAmoy`/`nativeToken`/`getUsdcAddress`
  ternaries; derive `currentChain` from `getChainConfig(chainId)`. Fix
  loadEOABalances, loadSmartAccountDetails, connectWallet, autoConnect, switchNetwork,
  fetchRecentOps, and the `env` export to read from `currentChain`/`getChainConfig`.
  Chain-specific token presence (e.g. Sepolia has eurcToken, Amoy doesn't) is a presence
  check — `if (chainConfig.contracts.eurcToken)` — never a boolean flag like `!amoy`.
- **App.jsx** — `SUPPORTED_CHAINS` from `getSupportedChainIds()`; default-chain button
  text pulled from the registry, not a literal.
- **wagmiConfig.js** — build `activeChains` from `CHAIN_REGISTRY` and pass to
  RainbowKit's `getDefaultConfig`; guard against an empty array. Keep
  holesky/baseSepolia/optimismSepolia as `isActive: false, viewOnly: true` entries —
  this becomes the Phase 5 zero-deploy proof.

## Done when

`rg "80002|11155111" src` matches only config/chains.js. Lint and build pass. No caller
of bundler.js or AppContext still infers chainId locally.

## Frozen, restated for this directory

This is an extraction, not a rewrite: don't change validateUserOp/execute call sites'
authorization logic, gas-field sourcing, or the signature-check path while doing this
refactor. If a fix here seems to require touching one of those, stop and flag it instead.
