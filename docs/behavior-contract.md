# AA Smart Wallet Behavior Contract

Status: frozen baseline for the stabilization pass.

## Supported network

- The interactive product runs on Arbitrum Sepolia (`421614`).
- Transaction links use `https://sepolia.arbiscan.io`.
- Existing API response fields remain backward compatible; additive fields are allowed.

## UserOperation invariants

- ERC-4337 v0.7 packing is unchanged.
- Owner operations use the existing owner-validator nonce path.
- Agent operations use the SessionKeyValidator address as the 2D nonce key.
- Agent signatures remain exactly 85 bytes: session-key address (20) followed by ECDSA signature (65).
- EntryPoint, validator addresses, calldata packing, CREATE3 inputs, selectors, events, storage layouts, and multisig threshold logic are unchanged.

## Session-agent behavior

- `native` exposes only `transfer_eth`.
- `uniswap` exposes only `uniswap_swap`.
- `erc20` exposes `erc20_transfer` and `aave_supply`.
- Groq keeps `tool_choice: auto`; executable chat processes the first returned tool call.
- Spend limits are checked by the server before building a UserOperation.
- Arbitrary `approve`, `increaseAllowance`, `setApprovalForAll`, and `transferOwnership` calls remain blocked for agent execution.
- The sanctioned Aave supply batch may include its internally generated USDC approval.
- Owner-controlled account ownership transfer is not an agent action and remains available.

## Existing HTTP shapes

- `POST /api/chat` accepts `{ message, smartAccountAddress, agentAddress, chainId }` and returns `{ reply, ops }`.
- `ops[]` retains `iteration`, `opHash`, and `txUrl`; additive `tags` are allowed.
- `POST /accounts/:address/sync` retains `{ chainId, actionTag, txHash? }` and `202 { queued: true }` behavior. Additive `actionTags` are allowed.
- `GET /config` retains `{ chains, sharedContracts }`.
- UserOperation lifecycle values remain `pending | confirmed | reverted | dropped`.

## Storage compatibility

The existing keys remain readable: `currentView`, `pendingUserOps`, `trackedOps`,
`userDisconnected`, `aa_wallet_shared_data_cache`, `aa_wallet_agent_ready_accounts`,
`aa_wallet_config`, `session_burner_key`, `session_burner_keys_map`, and
`webauthn_credential`. New structured values must migrate legacy values on read.

## Legacy label fallback

`labelToActionTag` is deprecated but frozen as an ordered fallback:

1. `deploy` -> `DEPLOYMENT`
2. `agent` or `session` -> `SESSION_KEY`
3. `approv` -> `APPROVAL`
4. `aave`, `supply`, `deposit`, or `repay` -> `AAVE_POSITION`
5. `usdc` or `swap` -> `USDC_BALANCE`
6. `eth`, `send`, or `withdraw` -> `ETH_BALANCE`
7. fallback -> `FULL_SYNC`

Explicit event tags do not change this fallback's output.

## Resource invalidation

- `SWAP` affects USDC and ETH balances.
- `AAVE_SUPPLY`, `AAVE_REPAY`, and `AAVE_WITHDRAW` affect the Aave position, USDC balance, and ETH balance.
- `ERC20_TRANSFER` affects USDC and ETH balances.
- `ETH_TRANSFER` affects the ETH balance.
- `ACCOUNT_ACTIVATION` affects deployment, session-key state, and ETH balance.
- `PAYMASTER_APPROVAL` affects allowance and ETH balance.
- `FULL_SYNC` invalidates all account resources.

## Error presentation

- Expected failures are shown in the application, never with browser `alert()`.
- Destructive confirmation remains mandatory but is rendered as an accessible in-app dialog.
- Raw JSON, stack traces, private keys, raw signatures, and internal tool names are never shown to users.

