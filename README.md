# ERC-4337 Smart Account with Skandha V1 + Paymaster

> Account Abstraction on Ethereum Sepolia — using a custom Smart Account Factory, a Verifying Paymaster, and the Skandha Bundler (EntryPoint v0.6)

[![Solidity](https://img.shields.io/badge/Solidity-^0.8-363636?logo=solidity)](https://soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Built%20with-Hardhat-f7dc6f?logo=ethereum)](https://hardhat.org/)
[![EntryPoint](https://img.shields.io/badge/EntryPoint-v0.6-blue)](https://eips.ethereum.org/EIPS/eip-4337)
[![Network](https://img.shields.io/badge/Network-Sepolia-purple)](https://sepolia.etherscan.io/)
[![AA Contracts](https://img.shields.io/badge/@account--abstraction%2Fcontracts-0.6.0-green)](https://www.npmjs.com/package/@account-abstraction/contracts)

---

## Overview

This repository demonstrates a complete [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337) Account Abstraction workflow, now extended with a **production-level Verifying Paymaster** that sponsors gas fees on behalf of users:

- Deploying a custom **Smart Account** and **Smart Account Factory** to Sepolia
- Deploying a **Custom Verifying Paymaster** compatible with EntryPoint v0.6
- Running a local **Skandha Bundler** (EntryPoint v0.6.0)
- Constructing, signing, and dispatching **sponsored UserOperations** via raw JSON-RPC

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js** v18 or v20 LTS | Node v22+ may break older OpenSSL deps in Skandha v1 |
| **Bun** | Used for fast dependency installation |
| **Ethereum RPC Provider** | Alchemy, Infura, or any Sepolia public node |
| **@account-abstraction/contracts v0.6.0** | Must use this exact version — compatible with EntryPoint v0.6 and Skandha v1 |

> **Important:** Install the AA contracts package with:
> ```bash
> npm install @account-abstraction/contracts@0.6.0
> ```
> This version exposes the correct `UserOperation` struct layout (with the single `paymasterAndData` bytes field) and the matching `IPaymaster` / `IEntryPoint` interfaces for EntryPoint v0.6. Using v0.7+ will cause ABI mismatches and struct incompatibilities.

---

## Environment Variables (.env)

Create a `.env` file in the root of the project with the following structure. Replace the placeholder values with your actual keys and deployed contract addresses:

```env
# Network and Keys
SEPOLIA_RPC_URL="https://sepolia.infura.io/v3/YOUR_INFURA_KEY"
PRIVATE_KEY="YOUR_PRIVATE_KEY"
ETHERSCAN_API_KEY="YOUR_ETHERSCAN_API_KEY"
ETHERSPOT_API_KEY="YOUR_ETHERSPOT_API_KEY"

# Core Account Abstraction Contracts (EntryPoint v0.6)
ENTRY_POINT="0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"
FACTORY="YOUR_FACTORY_ADDRESS"

# Paymasters
PAYMASTER="YOUR_PAYMASTER_ADDRESS"
ERC20PAYMASTER="YOUR_ERC20PAYMASTER_ADDRESS"

# ERC20 Paymaster Specific (If using USDC-sponsored txs)
USDC_TOKEN_ADDRESS="YOUR_USDC_TOKEN_ADDRESS"
PRICE_FEED="YOUR_PRICE_FEED_ADDRESS"

# User Specific / Deployed Account Info
RECIPIENT_ADDRESS="YOUR_RECIPIENT_ADDRESS"
SMART_ACCOUNT_ADDRESS="YOUR_SMART_ACCOUNT_ADDRESS"

# Miscellaneous Targets
TARGET_CONTRACT_ADDRESS="YOUR_TARGET_CONTRACT_ADDRESS"
NFT_ADDRESS="YOUR_NFT_ADDRESS"

# Local Skandha Bundler
SKANDHA_RPC_URL="http://127.0.0.1:14337/rpc"
```

---

## 1. Skandha Bundler Setup (EntryPoint v0.6.0)

> **Recommended approach:** Use **Bun** for installation and **Node.js** for execution to avoid module resolution errors.

### Clone & Build

```bash
# Clone Skandha and switch to the EntryPoint v0.6 branch
git clone https://github.com/etherspot/skandha
cd skandha
git checkout releases/v0.6

# Install dependencies with Bun
bun install

# Compile to standard JavaScript (prevents runtime TypeScript errors)
bun run build

# Bootstrap the monorepo (links internal packages)
bun run bootstrap
```

### Configure

Copy the default config and fill in your details:

```bash
cp config.json.default config.json
```

Edit `config.json`:

```json
{
  "entryPoints": [
    "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"
  ],
  "relayers": [
    "YOUR_RELAYER_PRIVATE_KEY"
  ],
  "beneficiary": "YOUR_BENEFICIARY_ADDRESS",
  "rpcEndpoint": "https://sepolia.infura.io/v3/YOUR_INFURA_KEY",
  "minInclusionDenominator": 10,
  "throttlingSlack": 10,
  "banSlack": 10,
  "bundleInterval": 2000,
  "bundleSize": 5
}
```

> **Tip:** `bundleInterval: 2000` introduces a 2-second batching window, allowing the bundler to group multiple UserOperations into a single on-chain transaction.

### Start the Bundler

```bash
bun packages/cli/bin/skandha.js standalone
```

---

## 2. Deploy Contracts

### Deploy Smart Account + Factory

```bash
npx hardhat run scripts/deploy.ts --network sepolia
```

This deploys both the **Smart Account Factory** and an initial **Smart Account** instance.

### Deploy the Paymaster

```bash
npx hardhat run scripts/deployPaymaster.ts --network sepolia
```

This deploys the `CustomPaymaster` contract and registers it with the EntryPoint. The deployment script outputs the Paymaster address — save it for the next steps.

---

## 3. Fund & Stake the Paymaster

The Paymaster requires two separate on-chain actions before Skandha will accept UserOps it sponsors:

### Check Current Balance & Stake Status

```bash
npx hardhat run scripts/checkStakeAndBal.ts --network sepolia
```

This queries `entryPoint.deposits(PAYMASTER_ADDR)` and prints the current deposit balance, stake amount, and whether the Paymaster is considered staked.

### Add Stake (Mandatory for Skandha)

Skandha enforces reputation rules and **will reject any UserOp if the Paymaster is not staked**. You must lock a bond for a minimum of 1 day (86400 seconds):

```bash
npx hardhat run scripts/addStake.ts --network sepolia
```

This calls `addStake(86400)` on the Paymaster with a bond of at least 0.01 ETH. You also need to deposit ETH into the EntryPoint to cover gas:

```bash
# Deposit is for gas; Stake is for bundler reputation
# Both are handled inside deployPaymaster.ts and addStake.ts
```

Expected output after staking:

```
Staking 0.01 ETH...
SUCCESS: Stake added to EntryPoint via Paymaster.
```

---

## 4. Send a Sponsored UserOperation

```bash
npx hardhat run scripts/test4337WithPaymaster.ts --network sepolia
```

This script implements the **double-signature flow** required for sponsored transactions:

1. **Paymaster Signature** — Your backend signs the `getHash(userOp, validUntil, validAfter)` result. This is encoded into `paymasterAndData` as:
   ```
   [20 bytes: Paymaster address][6 bytes: validUntil][6 bytes: validAfter][dynamic: signature]
   ```

2. **User Signature** — The account owner signs the `userOpHash`. This goes into the `signature` field of the UserOperation.

3. The fully constructed UserOp is submitted to the local Skandha bundler via `eth_sendUserOperation`.

A successful response returns the UserOpHash:

```
UserOp sent to Skandha: 0x4b9d7a824a8388637d44bf8bf09486f70c08c023120cc24d348e4b3f134494cb
```

---

## 5. Send a Regular (Non-Sponsored) UserOperation

```bash
npx hardhat run scripts/test4337.ts --network sepolia
```

This script constructs and sends a standard UserOperation **without** a Paymaster — the gas is paid directly from the Smart Account's own balance.

---

## Contract: CustomPaymaster.sol

The Paymaster uses a **nested hashing mechanism** to avoid Solidity's "Stack too deep" compiler errors when encoding the large `UserOperation` struct.

### Key design points

- **EntryPoint address**: Fixed at `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` (v0.6)
- **`paymasterAndData` layout** (v0.6 format):
  ```
  [20b: Paymaster address][6b: validUntil][6b: validAfter][dynamic: ECDSA signature]
  ```
- **`getHash` splits hashing into two steps** to stay within Solidity's stack depth limit
- **Signature verification** is performed against a configurable `verifyingSigner` address
- **`_packValidationData`** encodes `sigFailed`, `validUntil`, and `validAfter` into a single `uint256` as required by the EntryPoint

```solidity
function getHash(UserOperation calldata userOp, uint48 validUntil, uint48 validAfter)
    public view returns (bytes32)
{
    bytes32 userOpHash = keccak256(abi.encode(
        userOp.sender, userOp.nonce,
        keccak256(userOp.initCode), keccak256(userOp.callData),
        userOp.callGasLimit, userOp.verificationGasLimit,
        userOp.preVerificationGas, userOp.maxFeePerGas, userOp.maxPriorityFeePerGas
    ));
    return keccak256(abi.encode(userOpHash, block.chainid, address(this), validUntil, validAfter));
}
```

---

## Key Technical Notes

**`@account-abstraction/contracts@0.6.0`**
This exact version is required. It provides the v0.6-compatible `IPaymaster`, `IEntryPoint`, and `UserOperation` struct. The v0.7 packages split `paymasterAndData` into four separate fields and use a different `getDepositInfo` naming convention — these are incompatible with Skandha v1.

**`viaIR: true` in Hardhat config**
Required when compiling contracts that hash the full `UserOperation` struct. Without it, Solidity 0.8.x will throw "Stack too deep" errors.

**Axios for JSON-RPC**
Standard `ethers` providers do not expose native wrappers for `eth_sendUserOperation`. Raw Axios POST requests are used for direct bundler communication.

**Hex Encoding**
All `BigInt` values — gas limits, fees, nonces — must be converted to hex strings (e.g., `0x1a`) to comply with the Ethereum JSON-RPC specification.

**`entryPoint.deposits(address)` vs `getDepositInfo`**
In v0.6, use `entryPoint.deposits(address)` to query stake/balance info. `getDepositInfo` is a v0.7 naming convention and will fail against the v0.6 EntryPoint.

**EntryPoint Address (v0.6)**
```
0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789
```

---

## Quick Workflow Summary

```
# --- One-time Skandha Setup ---
1.  Clone Skandha → git checkout releases/v0.6
2.  bun install && bun run build && bun run bootstrap
3.  Configure config.json (RPC endpoint + relayer key)
4.  bun packages/cli/bin/skandha.js standalone

# --- Contract Deployment ---
5.  npx hardhat run scripts/deploy.ts --network sepolia
6.  npx hardhat run scripts/deployPaymaster.ts --network sepolia

# --- Paymaster Setup ---
7.  npx hardhat run scripts/checkStakeAndBal.ts --network sepolia
8.  npx hardhat run scripts/addStake.ts --network sepolia

# --- Send UserOperations ---
9.  npx hardhat run scripts/test4337WithPaymaster.ts --network sepolia   # sponsored
10. npx hardhat run scripts/test4337.ts --network sepolia                 # self-paid
```

---

## Paymaster Modes

This project supports **two Paymaster implementations** that can be used interchangeably depending on your use case.

### Verifying Paymaster (ETH-Sponsored)

The original paymaster — a backend-signed verifying paymaster where **your backend/protocol sponsors gas fees on behalf of the user**. The user pays nothing; gas is covered from the Paymaster's deposited ETH balance in the EntryPoint.

**Best for:**
- dApps that want to offer gasless transactions (e.g. onboarding new users with zero ETH)
- Subsidising specific actions (e.g. first mint, first swap)
- Any flow where the protocol absorbs the gas cost

**How it works:**
1. Backend verifies the UserOp and signs it with `verifyingSigner`
2. Paymaster validates the signature on-chain
3. Gas is deducted from the Paymaster's ETH deposit in the EntryPoint — user pays nothing

**Commands:**

```bash
# Deploy
npx hardhat run scripts/deployPaymaster.ts --network sepolia

# Stake & fund
npx hardhat run scripts/addStake.ts --network sepolia

# Send a sponsored (gasless) UserOp
npx hardhat run scripts/test4337WithPaymaster.ts --network sepolia
```

---

### ERC20 Paymaster (USDC / Token-Sponsored)

The extended paymaster — users pay for gas in **USDC instead of ETH**. No ETH balance is needed in the Smart Account. A Chainlink ETH/USD price feed converts the gas cost to USDC in real time, and a pre-charge / refund mechanism ensures users only pay for gas actually consumed.

**Best for:**
- Wallets and dApps targeting users who hold stablecoins but no ETH
- Cross-chain scenarios where the user's native asset is a token
- "Pay with any token" UX patterns

**How it works:**
1. User approves the Paymaster to spend their USDC
2. Backend signs the UserOp
3. `validatePaymasterUserOp` checks the signature, fetches the live ETH/USD price, and pre-charges the max USDC cost from the user
4. After execution, `postOp` calculates actual gas used and refunds excess USDC to the user

**Additional constructor parameters (Sepolia):**

| Parameter | Address |
|---|---|
| `token` (USDC) | `0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8` |
| `priceFeed` (ETH/USD) | `0x694AA1769357215DE4FAC081bf1f309aDC325306` |

**Commands:**

```bash
# User must approve the Paymaster to spend USDC first
# (wrap this in a UserOp callData or send as an EOA tx)
usdc.approve(PAYMASTER_ADDRESS, amount)

# Deploy (pass USDC token address + Chainlink feed to constructor)
npx hardhat run scripts/deployERC20Paymaster.ts --network sepolia

# Stake & fund
npx hardhat run scripts/addStake.ts --network sepolia

# Send a USDC-sponsored UserOp
npx hardhat run scripts/test4337WithERC20Paymaster.ts --network sepolia
```

---

### Choosing a Paymaster

| | Verifying Paymaster | ERC20 Paymaster |
|---|---|---|
| **User pays gas?** | No — protocol sponsors | Yes — in USDC, not ETH |
| **ETH required in Smart Account?** | No | No |
| **Token approval required?** | No | Yes (`USDC.approve`) |
| **Chainlink dependency?** | No | Yes |
| **Ideal for** | Gasless / subsidised UX | Stablecoin-native users |

Both paymasters share the same Smart Account, Factory, Skandha bundler setup, and `paymasterAndData` layout — only the deployed paymaster contract and the test script differ.

---

## Project Structure

```
.
├── artifacts/                      # Hardhat compilation artifacts
├── cache/                          # Hardhat cache
├── contracts/
│   ├── BaseAccount.sol             # Abstract base account logic
│   ├── CustomPaymaster.sol         # Verifying Paymaster (ETH-sponsored, EntryPoint v0.6)
│   ├── ERC20Paymaster.sol          # ERC20 Paymaster (USDC + Chainlink, EntryPoint v0.6)
│   ├── Interfaces.sol              # Shared interfaces (IEntryPoint, etc.)
│   ├── SmartAccount.sol            # ERC-4337 compatible smart account
│   ├── SmartAccountFactory.sol     # Factory for deploying smart accounts
│   └── UserOperation.sol           # UserOperation struct & helpers
├── ignition/                       # Hardhat Ignition deployment modules
├── scripts/
│   ├── addStake.ts                 # Stakes the Paymaster with the EntryPoint
│   ├── checkStakeAndBal.ts         # Queries Paymaster deposit & stake status
│   ├── deploy.ts                   # Deploys factory and account to Sepolia
│   ├── deployPaymaster.ts          # Deploys the Verifying Paymaster (ETH-sponsored)
│   ├── deployERC20Paymaster.ts     # Deploys the ERC20 Paymaster (USDC + Chainlink)
│   ├── test4337.ts                 # Sends a self-paid UserOperation
│   ├── test4337WithPaymaster.ts    # Sends a Verifying Paymaster-sponsored UserOperation
│   └── test4337WithERC20Paymaster.ts # Sends a USDC-sponsored UserOperation
├── skandha/                        # Skandha bundler (submodule / local clone)
├── test/                           # Contract test files
├── types/                          # TypeScript type definitions
├── .env                            # Environment variables (never commit this)
├── .gitignore
├── hardhat.config.ts
├── package.json
├── package-lock.json
├── README.md
└── tsconfig.json
```

---

## Resources

- [ERC-4337 Specification](https://eips.ethereum.org/EIPS/eip-4337)
- [Skandha Bundler](https://github.com/etherspot/skandha)
- [@account-abstraction/contracts v0.6.0](https://www.npmjs.com/package/@account-abstraction/contracts/v/0.6.0)
- [This Repository](https://github.com/Harish4586/smartAccount-skandhaV1-EntrypointV0.6)

---

## License

MIT

new smartaccount-0x1c2a3Adf859a5974bB6e770ccb9d641F17773bA4