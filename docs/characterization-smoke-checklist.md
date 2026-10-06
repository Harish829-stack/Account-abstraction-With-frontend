# Production Flow Characterization Checklist

Run on Arbitrum Sepolia (`421614`) with disposable test accounts and test funds. Record
the UserOp hash, transaction hash, expected balance delta, and actual result. Never put
private keys or signatures in the report.

## Automated baseline

- `node --test frontend/src/constants/actionTags.test.js`
- `cd chatbot-server && npm test`
- `cd apps/backend && npm test`
- `cd apps/backend && npm run lint && npm run build && npx prisma validate`
- `cd frontend && npm run lint && npm run build`
- `npx hardhat compile`

## Transaction smoke matrix

- [ ] Counterfactual deployment: predicted address deploys once; address remains unchanged; `DEPLOYMENT` and `SESSION_KEY` resources refresh.
- [ ] Session-key creation: key appears on-chain and in backend status; private key is never returned by public endpoints or logged.
- [ ] Paymaster approval: exact allowance is visible after confirmation; rejected wallet signature leaves allowance unchanged.
- [ ] Native ETH send: recipient receives the requested amount; sender ETH refreshes; wrong recipient and insufficient balance show friendly errors.
- [ ] EntryPoint withdrawal: account/deposit balance refreshes and only Arbiscan links are shown.
- [ ] ERC20 transfer: recipient and account USDC balances refresh; amount remains within the configured server-side limit.
- [ ] Swap: USDC and ETH balances both refresh; receipt contains the expected router event.
- [ ] Aave supply: sanctioned approve+deposit batch succeeds; Aave position and USDC/ETH balances refresh.
- [ ] Aave withdraw: Aave position and USDC/ETH balances refresh.
- [ ] Aave repay: not implemented in the current product; do not add it under the no-new-features rule without separate approval.
- [ ] Reverted UserOp: lifecycle is `reverted`, never `confirmed`; no success notification appears.
- [ ] Dropped UserOp: lifecycle becomes `dropped` after the configured timeout and the UI points to History/Arbiscan.

## AA/security invariants

- [ ] Agent signature length is exactly 85 bytes.
- [ ] Agent nonce uses `BigInt(SessionKeyValidatorAddress)` as the 2D nonce key.
- [ ] Owner operations continue to use the owner-validator nonce path.
- [ ] Amount equal to the spend limit succeeds; amount above it is rejected before UserOp submission.
- [ ] Repeated operations are reviewed for aggregate spend; current behavior applies the limit per repetition.
- [ ] Agent-requested arbitrary `approve` is blocked.
- [ ] Agent-requested `transferOwnership` is blocked.
- [ ] Sanctioned Aave internal approval still succeeds.
- [ ] Owner-controlled account ownership transfer remains available.
- [ ] Revoked and expired session keys cannot submit UserOps.
- [ ] One chain RPC outage cannot mark a UserOp successful or overwrite another chain/account record.

## UI/state checks

- [ ] Check dashboard, chat, confirmation dialog, history, and assistant setup at 320, 375, 768, 1024, and 1440 px.
- [ ] No horizontal page scrolling, clipped hashes, or touch targets below 44 px on mobile.
- [ ] Refresh/reconnect and a second tab preserve cached data and pending operation state.
- [ ] Wallet/account/chain changes do not show the prior account's chat or balances.
- [ ] Keyboard navigation reaches confirmation actions; Escape/cancel behavior is verified.
- [ ] Reduced-motion mode removes nonessential animation.
- [ ] Lighthouse performance, accessibility and CLS are captured before deployment.

