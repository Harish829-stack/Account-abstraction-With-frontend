# Full ERC-4337 + ERC-7579 + Bundler Compliance Audit

**Contracts Audited:**
- `Implementation.sol` (Smart Account Core)
- `ModuleManager.sol` (Module Registry)
- `SessionKeyValidator.sol` (Validator + Executor)
- `SocialRecoveryValidator.sol` (Validator + Executor)

---

## Implementation.sol

### ✅ Passing

| Rule | Detail |
|---|---|
| **ERC-4337 §3.1** — `validateUserOp` only called by EntryPoint | `onlyEntryPoint` modifier is correctly enforced. |
| **ERC-4337** — Prefund payment | `_payPrefund` correctly sends ETH to EntryPoint. |
| **ERC-7579** — `accountId()` | Returns a non-empty string. ✅ |
| **ERC-7579** — `executeFromExecutor` | Correctly checks `executors[msg.sender]`. ✅ |
| **ERC-7579** — `installModule / uninstallModule` | Correctly delegates to `ModuleManager`. ✅ |
| **ERC-7579** — `supportsModule` | Correctly calls `_supportsModule`. ✅ |
| **UUPS** — `_authorizeUpgrade` | Correctly protected by `onlyEntryPointOrOwner`. ✅ |
| **ERC-1271** — `isValidSignature` | Owner ECDSA path and validator routing both implemented. ✅ |
| **ERC-165** — `supportsInterface` | Reports both `IAccount` and `IERC7579Account`. ✅ |

### ❌ Bugs / Non-Compliance

#### 1. `validateUserOp` — CRITICAL: No Nonce Replay Protection in Routing
**Location:** `Implementation.sol` L67–69

The account trusts `userOp.signature[0:20]` to identify the validator, but there is **no check** that the `userOp.nonce` format is compatible with the chosen validator. An attacker can theoretically replay a UserOp against a different (weaker) installed validator by substituting its address in the signature bytes. The industry standard (Biconomy, Kernel) uses the **nonce key space** (the upper `uint192` of the nonce) to bind the UserOp to a specific validator address, making substitution impossible.

> [!CAUTION]
> This is the most significant ERC-4337 compliance gap in this codebase. The `nonce.key` should encode the validator address. Bundlers on mainnet will not reject this, but it is a known attack vector.

**Suggested Fix (in `validateUserOp`):**
```solidity
// Extract the validator address from the nonce key (upper 20 bytes of uint192)
// userOp.nonce layout: [uint192 key][uint64 sequence]
// key layout: [address validatorAddr][uint32 extra]
address validatorFromNonce = address(uint160(userOp.nonce >> 64));
require(validatorFromNonce == validatorFromSig, "validator mismatch");
```

#### 2. `execute(ModeCode, bytes)` — Ignores ModeCode Entirely
**Location:** `Implementation.sol` L148–151

The ERC-7579 standard defines a `ModeCode` that encodes `CallType` (single, batch, delegatecall) and `ExecType` (default, try). This implementation completely ignores the `mode` parameter and always performs a single call. Passing a batch `ModeCode` would silently succeed but only execute the first call — a severe, silent data loss bug.

> [!WARNING]
> All production ERC-7579 accounts (e.g., Safe7579, Rhinestone) parse the full `ModeCode`. Bundlers targeting ERC-7579 strictly will expect `mode` to be respected.

#### 3. `executeFromExecutor` — Also Ignores ModeCode
**Location:** `Implementation.sol` L153–160

Same issue as above. The `mode` parameter is completely ignored.

#### 4. `isInitialized` in `SessionKeyValidator` — Always Returns `true`
**Location:** `SessionKeyValidator.sol` L191–193

`isInitialized` always returns `true` regardless of whether the module was actually installed for a given account. `ModuleManager._installModule` calls `IModule(module).isInitialized(account)` before installing and would be expected to check this as a guard. This is not how the standard works, but it means there is no protection against double-initialisation if `onInstall` is called twice.

#### 5. `onUninstall` in `SessionKeyValidator` — Crashes on Empty Data
**Location:** `SessionKeyValidator.sol` L74–80

Unlike `SocialRecoveryValidator` (which was already patched), `SessionKeyValidator.onUninstall` does not handle empty `deInitData`. If the frontend sends `0x`, the `abi.decode` at L75 will revert, making the module **permanently un-uninstallable** until a valid key list is provided.

> [!CAUTION]
> **This is a live bug.** Immediately apply the same `if (data.length >= 32)` guard that was applied to `SocialRecoveryValidator`.

---

## ModuleManager.sol

### ✅ Passing

| Rule | Detail |
|---|---|
| **ERC-7579** — Module type constants (1–4) | Correctly defined. ✅ |
| **ERC-7579** — `onInstall` / `onUninstall` lifecycle | Correctly called for all module types. ✅ |
| **ERC-7579** — `isModuleType` check before install | `_validateModule` calls `IModule(module).isModuleType(moduleTypeId)`. ✅ |
| **ERC-7579** — Duplicate guard on install | `ModuleAlreadyInstalled` revert correctly prevents double-install. ✅ |
| **ERC-7579** — Hook array management | `_removeHook` uses swap-and-pop (gas efficient). ✅ |

### ⚠️ Minor Issues

#### 1. No Re-entrancy Guard on `_installModule`
During `_installModule`, the code calls `IModule(module).onInstall(initData)` after writing state. A malicious module could re-enter `installModule` during its `onInstall` callback to install additional unauthorized modules. A `nonReentrant` guard on `installModule` in `Implementation.sol` would close this.

#### 2. `_validateModule` — Does NOT Call `isInitialized`
The standard suggests checking `!isInitialized(account)` before calling `onInstall` to prevent re-initialization of already-active modules. While `ModuleAlreadyInstalled` partially handles this, it only tracks the registry flag — it does not catch a module that was externally initialized via a direct `onInstall` call from some other pathway.

---

## SessionKeyValidator.sol

### ✅ Passing

| Rule | Detail |
|---|---|
| **ERC-4337 Associated Storage** | `sessionKeys[sessionKey][smartAccount]` — `smartAccount` is the innermost key. ✅ |
| **ERC-4337 No SSTORE in validate** | No storage writes in `validateUserOp`. `uses` increment is in `executeSession`. ✅ |
| **ERC-4337 Time window** | `validUntil`/`validAfter` correctly packed into `validationData` return value. ✅ |
| **ERC-7579 Executor type** | `isModuleType` returns true for both type 1 and 2. ✅ |
| **ERC-7579 Executor routing** | `executeSession` correctly calls `executeFromExecutor`. ✅ |

### ❌ Bugs / Non-Compliance

#### 1. CRITICAL: `onUninstall` Crashes on Empty `deInitData`
(Same as Issue #5 above — apply the `data.length >= 32` guard.)

#### 2. `validateUserOp` — Only Accepts `execute(address,uint256,bytes)` Wrapper
The current `_decodeExecution` only validates `EXECUTE_SELECTOR` as the outer wrapper. If the UserOp is constructed to call `execute(ModeCode, bytes)` (the ERC-7579 form), validation will fail silently (return 1). This means the session key can only work with the legacy `execute` path.

---

## SocialRecoveryValidator.sol

### ✅ Passing

| Rule | Detail |
|---|---|
| **ERC-4337 No SSTORE in validate** | `validateUserOp` is `view`. All state changes are in `executeRecovery`. ✅ |
| **ERC-4337 Associated Storage** | `recoveryRequests[smartAccount][newOwner]` — `smartAccount` is outermost; read via `msg.sender` in validate. ✅ |
| **Replay protection** | `delete recoveryRequests` is called before `executeFromExecutor`. ✅ |
| **ERC-7579 Dual module type** | Correctly returns true for type 1 and 2. ✅ |
| **Timelock enforcement** | `executeAfter` delay correctly enforced in `_canRecover`. ✅ |
| **Guardian dedup** | `DuplicateGuardian` revert prevents double-counting approvals. ✅ |
| **`onUninstall` robustness** | Correctly handles empty `deInitData` with `data.length >= 32` guard. ✅ |

### ⚠️ Minor Issues

#### 1. `hasApproved` Mapping Not Cleared on Uninstall
**Location:** `SocialRecoveryValidator.sol` L90–102

The `onUninstall` function correctly deletes `recoveryConfigs` and `isGuardian`, but does **not** clean up the `hasApproved` mapping. If the module is re-installed later with a new guardian set, old `hasApproved` entries from the previous installation could be stale and potentially cause unexpected behavior (e.g., a formerly-revoked guardian could still appear to have approved a past request).

> [!NOTE]
> This is a minor hygiene issue, not a critical security bug (since `recoveryConfigs` is wiped and threshold checks would fail), but it is a storage leak.

---

## Summary Table

| Contract | ERC-4337 | ERC-7579 | Bundler Safe | Critical Bugs |
|---|---|---|---|---|
| `Implementation.sol` | ⚠️ Mostly | ⚠️ Partial (ModeCode ignored) | ✅ | Nonce-key validator binding missing |
| `ModuleManager.sol` | ✅ | ✅ | ✅ | Re-entrancy on install |
| `SessionKeyValidator.sol` | ✅ | ✅ | ✅ | `onUninstall` crash on empty data |
| `SocialRecoveryValidator.sol` | ✅ | ✅ | ✅ | `hasApproved` not cleaned on uninstall |

## Recommended Immediate Fixes (Priority Order)

1. **[CRITICAL]** Fix `SessionKeyValidator.onUninstall` to handle empty data (same pattern as `SocialRecoveryValidator`).
2. **[HIGH]** Implement `ModeCode` parsing in `Implementation.execute` and `executeFromExecutor` to be truly ERC-7579 compliant.
3. **[MEDIUM]** Clean up `hasApproved` in `SocialRecoveryValidator.onUninstall`.
4. **[LOW]** Add nonce-key-based validator binding to `validateUserOp` in `Implementation.sol`.
5. **[LOW]** Add `nonReentrant` guard to `installModule` in `Implementation.sol`.
