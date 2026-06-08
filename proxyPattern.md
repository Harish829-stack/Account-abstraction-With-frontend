# Smart Account Proxy Architecture

This document explains the proxy architecture used in this Modular Smart Account infrastructure, specifically why the standard **Beacon Proxy** pattern is fundamentally incompatible with ERC-4337, and why we utilize the **UUPS (Universal Upgradeable Proxy Standard)** instead.

---

## 1. Why Beacon Proxies Fail in ERC-4337

A **Beacon Proxy** is a popular upgrade pattern where multiple proxies point to a single "Beacon" contract. When an upgrade happens, the developer updates the Beacon, and instantly all proxies point to the new implementation.

**The Intuition:**
`Proxy -> asks Beacon for Address -> Delegates to Implementation`

### The ERC-4337 Conflict
To prevent Denial of Service (DoS) attacks on the network, ERC-4337 Bundlers run a strict local simulation of your `validateUserOp` before submitting it to the blockchain. 

One of the strictest rules in this simulation is the **Storage Access Rule**: 
> *During validation, a Smart Account is strictly forbidden from reading the storage of ANY external contract (except the EntryPoint, or a staked Factory/Paymaster).*

When a Beacon Proxy receives a transaction, it MUST read the storage of the external `Beacon` contract to find out where to route the call. When the Bundler simulator sees your Account Proxy trying to read from an external, unstaked contract, it immediately throws an `AA23` or `unstaked account accessed` error and rejects the UserOperation.

---

## 2. The Solution: UUPS (ERC-1967) Proxies

Because of the strict storage rules, ERC-4337 Smart Accounts almost universally use **UUPS (ERC-1967)** proxies.

### What is UUPS?
UUPS stands for *Universal Upgradeable Proxy Standard*. Instead of asking an external contract where the implementation is, a UUPS proxy stores the implementation address safely **inside its own internal storage**. 

To avoid accidentally overwriting this address with user data, it is saved in a very specific, randomized slot defined by the ERC-1967 standard: `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`.

### Why it solves the problem
Because the proxy is reading the implementation address from its *own* internal storage rather than an external contract, the Bundler simulation allows it. The storage access rules are respected, and the transaction succeeds.

---

## 3. The UUPS Flow & Intuition

If you are new to UUPS, the most important concept to grasp is **where the upgrade logic lives**. 

In older proxy patterns (like Transparent Proxies), the upgrade logic lives inside the Proxy itself. In UUPS, **the proxy is entirely "dumb"**, and the upgrade logic lives inside the **Implementation contract**.

### The Architecture
1. **The Proxy (`contracts/Proxy.sol`)**: A lightweight contract that does exactly two things:
   - Reads the implementation address from its own internal slot.
   - `delegatecall`s all incoming data to that implementation.
2. **The Implementation (`contracts/Implementation.sol`)**: Contains all the logic (execution, ERC-7579 modules, WebAuthn, etc.) AND the `upgradeToAndCall` function.

### The Upgrade Flow
When you want to upgrade your smart accounts to a new version:
1. You deploy `NewImplementation.sol`.
2. You send a UserOperation to your Smart Account calling `upgradeToAndCall(NewImplementationAddress)`.
3. The Proxy delegates this call to the *current* Implementation.
4. The *current* Implementation verifies you are the owner (using `_authorizeUpgrade`).
5. The *current* Implementation reaches back into the Proxy's storage and overwrites the ERC-1967 slot with the `NewImplementationAddress`.

> [!TIP]
> **The Golden Rule of UUPS:** Because the upgrade logic lives in the implementation, if you ever deploy a new implementation that accidentally forgets to inherit `UUPSUpgradeable`, your proxy will be bricked forever! Always ensure your new logic contracts include the upgrade functions.
