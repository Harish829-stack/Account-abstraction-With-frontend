# Account Abstraction (ERC-4337) Smart Wallet Hub

This project is a fully functional **Account Abstraction (ERC-4337)** smart wallet dashboard. It acts as a comprehensive "Hub" for interacting with Ethereum smart accounts, bypassing the strict limitations of traditional Externally Owned Accounts (EOAs) like standard MetaMask wallets.

## Why is this better than standard MetaMask?
A traditional EOA (MetaMask) requires you to:
1. Always have native ETH to pay for gas on the specific network you are using.
2. Sign multiple pop-ups for multi-step transactions (e.g., Approve -> Transfer -> Swap).
3. Secure a 12-word seed phrase (if lost or phished, your funds are gone forever).

**Our Smart Account Hub solves this:**
- **Gas Abstraction:** Pay for gas using ERC-20 tokens (like USDC) instead of ETH, or have your transactions entirely **sponsored** by a Paymaster so you experience true gasless transactions.
- **Batching:** Execute multiple operations (e.g., Approve + Transfer + Swap) in a *single atomic transaction* with a single signature.
- **Programmable Security:** Smart accounts are smart contracts. They can be upgraded, require multi-sig setups, or have social account recovery modules enabled.
- **Session Keys:** You can grant limited permissions to apps without needing to sign every single action.

## Core Components
- **EOA (Signer):** Your standard MetaMask wallet. In this project, it doesn't hold your main funds. It acts merely as the cryptographic "key" to unlock and command the Smart Account.
- **Smart Account:** A deployed smart contract on the blockchain that actually holds your assets and executes your business logic.
- **EntryPoint Contract:** The central trusted global contract that validates and executes all UserOperations on behalf of Smart Accounts.
- **Bundler (Etherspot Public Bundler):** An off-chain node that collects `UserOperations` from users, bundles them into a standard Ethereum transaction, and submits them to the network. We utilize the **Etherspot Skandha Public Bundler** for reliable, fast relaying.
- **Paymaster:** A specialized smart contract that agrees to sponsor the gas fees for your Smart Account (either for free, or in exchange for ERC-20 tokens like USDC).

## Environment Setup
Create a `.env` file in the `frontend/` directory with the following structure:

```env
VITE_RPC_URL="<YOUR_SEPOLIA_RPC_URL>"
VITE_SKANDHA_RPC_URL="<ETHERSPOT_BUNDLER_URL>"

# Global Contracts (Sepolia)
VITE_ENTRY_POINT="0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"
VITE_FACTORY_ADDRESS="<SMART_ACCOUNT_FACTORY_ADDRESS>"
VITE_PAYMASTER_ADDRESS="<PAYMASTER_ADDRESS>"

# Tokens
VITE_USDC_TOKEN="<USDC_TEST_TOKEN_ADDRESS>"
```
*(Note: Polygon Amoy credentials have been omitted for this specific deployment).*

## Core Workflows (ASCII Diagrams)

### 1. Smart Account Funding & Deployment
Smart accounts use counterfactual deployment. The address is mathematically known *before* the contract is actually deployed on-chain.

```text
[ EOA ] --(Generates Salt)--> [ Factory Address ]
                                     |
[ Send ETH/USDC ] ------------------>| (Funds sit safely at pre-computed address)
                                     |
[ First UserOperation ] ------------>| (Deploys contract & executes tx in 1 step)
```

### 2. Standard UserOperation (SendOp / Contract Call)
```text
[ App UI ] --(Creates UserOp)--> [ EOA Signs Hash ]
                                        |
[ Etherspot Bundler ] <-----------------+
         |
[ EntryPoint ] --(Validates Sig)--> [ Smart Account ] --(Executes)--> [ Target Contract/Receiver ]
```

### 3. Batch Operations (Approve + Swap in 1 Click)
Instead of waiting for an Approval block to mine, then signing a Swap, everything happens instantly.
```text
[ App UI: Array of Ops ]
  1. Approve Token
  2. Swap Token
           |
     (Sign ONCE)
           |
[ Smart Account ]
  |-- Executes 1: Approve 100 USDC to Router
  |-- Executes 2: Swap 100 USDC for ETH
```

### 4. Quick Swap (ETH → USDC)
```text
[ App UI: Quick Swap Widget ]
         |
[ Uniswap V3 exactInputSingle Params Built ]
         |
[ UserOp encoded as 'execute' on Smart Account ]
         |
[ EntryPoint ] --> [ Smart Account ] --> [ Uniswap V3 Router ] --> [ Returns USDC to Smart Account ]
```

### 5. Paymaster Allowance & Sponsoring
To use an ERC-20 Paymaster (paying gas in USDC), the Smart Account must first approve the Paymaster to withdraw its tokens.
```text
[ Smart Account ] --(Approve Paymaster to spend 10 USDC)--> [ USDC Contract ]
```

## Gas Payment Structure

### Option A: Without Paymaster (Smart Account Pays in ETH)
The Smart Account must hold native ETH to pay the bundler for relaying the transaction.
1. The Bundler simulates the transaction to ensure it won't fail.
2. The EntryPoint requires the Smart Account to pre-fund `maxFeePerGas * gasLimit`.
3. The Smart Account executes the transaction, and the EntryPoint refunds any unused ETH back to the Smart Account.
4. If the Smart Account has no ETH, the transaction is rejected instantly by the bundler.

### Option B: Sponsored with Paymaster (Gasless / Pay in USDC)
The Smart Account holds **no ETH**, only USDC (or nothing at all if it's a completely sponsored dApp).
1. User checks **"Sponsor gas with Paymaster"** in the UI.
2. `paymasterAndData` (containing the Paymaster contract address) is appended to the `UserOperation`.
3. The Bundler asks the Paymaster: *"Will you pay for this?"*
4. Paymaster verifies the Smart Account has enough USDC allowance and balance.
5. EntryPoint charges the Paymaster's ETH deposit to pay the Bundler.
6. Paymaster automatically withdraws the exact equivalent value in USDC from the Smart Account.
