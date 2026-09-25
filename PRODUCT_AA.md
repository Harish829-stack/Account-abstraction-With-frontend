Phase 1: Onboarding And Predicted Wallet
Goal: connecting an injected wallet (MetaMask or another EIP-1193 provider) creates/returns an EOA, and the app immediately shows the predicted Smart Account without deploying it.
Files to touch:
frontend/src/context/AppContext.jsx
frontend/src/config/chains.js
frontend/src/views/HomeView.jsx
optionally frontend/src/utils/accountPrediction.js
Implementation:
Add a static salt/index constant:

export const DEFAULT_ACCOUNT_INDEX = 0;

After connecting an injected wallet, populate the app state used across the app:
provider
signer
eoaAddress
chainId

const provider = new ethers.BrowserProvider(window.ethereum);
const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
const signer = await provider.getSigner();
const eoaAddress = accounts[0];
const { chainId } = await provider.getNetwork();

The rest of the app only ever deals with this single injected-wallet code path.

Predict Smart Account address using existing factory:

const factory = new ethers.Contract(env.FACTORY, K1ValidatorFactoryABI, provider);

const predicted = await factory.getFunction("computeAccountAddress")(
  eoaAddress,
  DEFAULT_ACCOUNT_INDEX,
  [],
  0
);

Store this predicted address in existing smartAccountAddress state even when not deployed.

Add deployment-status state:

smartAccountStatus: "predicted" | "deployed" | "agent_ready"
isSmartAccountDeployed
hasSessionKeyValidator
Check deployment with:

const code = await provider.getCode(predicted);
const isDeployed = code !== "0x";

If deployed, call existing refreshInstalledModules. If installedModules.hasSessionKey === true, status becomes agent_ready.
Dashboard behavior:
User connects an injected wallet.
Dashboard opens normally.
Smart Account address is visible immediately.
Tabs are visible.
Actions that require deployment show: Activate Agentic Wallet to continue.
Do not redirect the user to the old setup wizard.

Phase 2: Agentic Wallet Activation
Goal: one button performs a resumable two-step activation using existing contracts.
Files to touch:
frontend/src/context/AppContext.jsx
frontend/src/views/HomeView.jsx
frontend/src/utils/helpers.js
optionally new file: frontend/src/utils/agenticActivation.js
Add a dashboard CTA:
Activate Agentic Wallet
Activation state machine:
predicted
deploying_account
account_deployed_module_missing
installing_session_validator
agent_ready
low_balance
failed
Activation function:

async function activateAgenticWallet() {
  // 1. confirm signer/eoa/smartAccountAddress/provider
  // 2. check smart account code
  // 3. deploy if missing
  // 4. refresh code
  // 5. check SessionKeyValidator
  // 6. install if missing
  // 7. refresh modules
}

Step 1: balance check before deployment.
Use the injected wallet's EOA native balance:

const eoaBalance = await provider.getBalance(eoaAddress);

If too low, stop early:
Low account balance. Add native token to activate your Agentic Wallet.
Do not attempt tx.
Step 2: deploy Smart Account with existing factory.

const factory = new ethers.Contract(env.FACTORY, K1ValidatorFactoryABI, signer);

const tx = await factory.createAccount(
  eoaAddress,
  DEFAULT_ACCOUNT_INDEX,
  [],
  0
);

await tx.wait();

After confirmation:

const code = await provider.getCode(smartAccountAddress);
if (code === "0x") throw new Error("Smart Account deployment was not detected.");

Step 3: install SessionKeyValidator as second tx via existing UserOp flow.
Encode install call:

const accountIface = new ethers.Interface(SmartAccountABI);

const installModuleCall = accountIface.encodeFunctionData("installModule", [
  1,
  env.SESSION_KEY_VALIDATOR,
  "0x"
]);

const callData = encodeERC7579Single(
  smartAccountAddress,
  0n,
  installModuleCall
);

Submit through existing owner/K1 UserOp helper:

const opHash = await buildAndSendAccountOp(
  signer,
  provider,
  smartAccountAddress,
  callData,
  env.ENTRY_POINT,
  env.K1_VALIDATOR,
  chainId
);

Track it:

trackOp(opHash, "Install SessionKeyValidator", { calldata: callData });

Then refresh:

await refreshInstalledModules(smartAccountAddress, provider, null, { force: true });

If hasSessionKey is true, mark wallet agent_ready.
Important: activation must be resumable. If Tx 1 succeeded but Tx 2 failed, next click should skip deployment and only install the module.

Phase 3: Navigation And Tab Gating
Goal: tabs are always visible, but execution paths are gated by readiness.
Files:
frontend/src/components/Navbar.jsx
frontend/src/App.jsx
frontend/src/views/HomeView.jsx
Tab order:
Gasless Tx
Batch Tx
AI Agents
UserOp History
Recommended mapping:
paymaster -> "Gasless Tx"
batch-send -> "Batch Tx"
chatbot -> "AI Agents"
history -> "UserOp History"
Do not hide these tabs just because the account is predicted. Instead, each tab decides what can run.
Shared guard:

const requiresAgenticWallet = !isSmartAccountDeployed || !installedModules.hasSessionKey;

For tabs that need deployment, show the actual UI plus a top inline prompt:
Activate Agentic Wallet to use this feature.
This preserves the product feel: user sees the full platform immediately.

Phase 4: Gasless Tx Tab
Goal: "Approve USDC for Gasless Txs" works using current Paymaster logic, but with cleaner UX.
Files:
frontend/src/views/PaymasterView.jsx
frontend/src/utils/helpers.js
frontend/src/context/AppContext.jsx
Behavior:
If Smart Account not deployed:
Activate Agentic Wallet before enabling gasless transactions.
If deployed but no SessionKeyValidator:
Finish Agentic Wallet activation first.
If agent-ready, show:
Pay network fees in USDC
Approve USDC for Gasless Txs
Current allowance
Paymaster address
USDC balance
Approval uses existing Smart Account UserOp pattern.
Current flow should be preserved:
target: USDC token
calldata: approve(paymaster, amount)
wrapper: encodeERC7579Single
signer: owner EOA (injected wallet)
validator: K1 validator
submit UserOp
After approval, save local preference:
usePaymaster = true
This can live in ChatbotContext or AppContext.
Future UserOps should only attach paymaster fields if:
usePaymaster === true
allowance > 0
env.PAYMASTER exists
env.USDC_TOKEN exists
Add a central helper later:
applyPaymasterFields(userOp, { paymaster, token })
Avoid copying paymaster injection across many files.

Phase 5: Batch Tx Tab
Goal: preserve current working batch functionality.
Files:
frontend/src/views/BatchSendView.jsx
Keep existing behavior:
user adds multiple operations
app builds arrays:
targets[]
values[]
calldatas[]
app encodes:
encodeERC7579Batch(targets, values, calldatas)
app sends UserOp using K1 owner signature
Required changes:
Add readiness guard at execution time:
Activate Agentic Wallet before sending batch transactions.
Keep batch UI visible even before activation.

If paymaster preference is enabled and approval exists, let Batch Tx use sponsored mode.

Do not alter encoding unless needed. This tab is already working and should stay boring.

Acceptance:
existing batch tx still works after activation
no behavior change for calldata construction
UserOp history still tracks batch op

Phase 6: AI Agents Tab
Goal: after activation, AI Agents no longer install SessionKeyValidator. They only configure permissions and authorize session keys.
Files:
frontend/src/views/ChatbotView.jsx
frontend/src/context/ChatbotContext.jsx
chatbot-server/server.js
chatbot-server/userOpBuilder.js
Before activation:
Activate Agentic Wallet to use AI Agents.
After activation:
AI Agent flow:

Select capability
Generate agent key
Authorize agent
Chat / execute
Authorize agent:
backend generates/stores session key
frontend encodes SessionKeyValidator.addSessionKey
frontend sends UserOp from Smart Account
no module installation step
Current handleInstall should be renamed conceptually to handleAuthorizeAgent.
The UserOp should call:
validatorIface.encodeFunctionData("addSessionKey", [keyData])

Target should be:
env.SESSION_KEY_VALIDATOR
Wrapped with:
encodeERC7579Single(env.SESSION_KEY_VALIDATOR, 0n, innerCallData)
AI Agent capabilities:
Native transfer
Backend tool:
transferNative(recipient, amount)
Encoding:
target = recipient
value = ethers.parseEther(amount)
innerCallData = "0x"
callData = encodeERC7579Single(target, value, "0x")
Policy:
session key target can be recipient or wildcard-like configured target depending current validator limits
safest first version: configure native-transfer agent with target chosen during setup
USDC transfer
Backend tool:
transferUSDC(recipient, amount)
Encoding:

const iface = new ethers.Interface([
  "function transfer(address to, uint256 amount) returns (bool)"
]);

target = process.env.USDC_TOKEN;
innerCallData = iface.encodeFunctionData("transfer", [
  recipient,
  ethers.parseUnits(amount, 6)
]);

Policy:
target = USDC token
selector = 0xa9059cbb
maxValue = 0
Swap
Backend tool:
swapExactInputSingle(tokenIn, tokenOut, amountIn, minOut)
Encoding with Uniswap V3 router snippet:
exactInputSingle((tokenIn, tokenOut, fee, recipient, deadline, amountIn, amountOutMinimum, sqrtPriceLimitX96))
Target:
UNISWAP_ROUTER for current chain
Policy:
target = Uniswap router
selector = exactInputSingle selector
maxValue = configured limit
Keep first version conservative: known token pairs only, known router only, no arbitrary router from LLM.
Dynamic contract interaction
Frontend:
detect contract address in chat or provide "Custom Contract" subflow
call:
GET /api/contract/abi?chainId=...&address=...
Backend:
fetch verified ABI from explorer
if not verified, return 400:
Contract source code is not verified. Halting execution for safety.
Frontend renders:
function dropdown
input fields for selected function
preview target/function/params
execute button
Backend safe encoding:

const iface = new ethers.Interface(savedAbi);
const callData = iface.encodeFunctionData(functionName, parameters);

Security restrictions:
block dangerous selectors initially:approve
increaseAllowance
setApprovalForAll
transferOwnership
upgrade/admin selectors

require explicit user confirmation
only execute if selected session-key policy allows target/selector

Phase 7: Persistent Gas Sponsorship For Agents
Goal: AI Agent respects the user's Gasless preference.
Files:
frontend/src/context/ChatbotContext.jsx
frontend/src/views/ChatbotView.jsx
chatbot-server/server.js
chatbot-server/userOpBuilder.js
Frontend state:

const [usePaymaster, setUsePaymaster] = useState(false);

AI Agent UI toggle:
Sponsor Agent Operations with USDC
Chat payload:

{
  message,
  smartAccountAddress,
  agentAddress,
  chainId,
  usePaymaster
}

Backend:
Pass into:
buildAndSendAgentOp(..., { usePaymaster })
In userOpBuilder.js, apply paymaster fields before final hash/sign/send. Prefer estimating with paymaster fields included if bundler/paymaster requires that path.

if (usePaymaster && process.env.PAYMASTER && process.env.USDC_TOKEN) {
  rpcUserOp.paymaster = process.env.PAYMASTER;
  rpcUserOp.paymasterVerificationGasLimit = toHex(150000);
  rpcUserOp.paymasterPostOpGasLimit = toHex(150000);
  rpcUserOp.paymasterData = process.env.USDC_TOKEN;
}

If paymaster send fails, return clear error:
Gas sponsorship failed. Check USDC allowance or disable sponsored mode.

Phase 8: UserOp History
Goal: preserve current functionality and make all new flows visible.
Files:
frontend/src/views/HistoryView.jsx
frontend/src/context/AppContext.jsx
frontend/src/utils/backendApi.js
Every submitted UserOp should call trackOp:

trackOp(opHash, "Install SessionKeyValidator", { calldata });
trackOp(opHash, "Approve Paymaster", { calldata });
trackOp(opHash, "Batch UserOperation", { calldata });
trackOp(opHash, "Authorize AI Agent", { calldata });
trackOp(opHash, "AI Agent Native Transfer", { calldata });
trackOp(opHash, "AI Agent USDC Transfer", { calldata });
trackOp(opHash, "AI Agent Swap", { calldata });
trackOp(opHash, "AI Agent Contract Call", { calldata });

History source priority remains:
backend history if configured
explorer fallback
RPC fallback
Add labels so users understand what happened. Do not expose raw signatures or sensitive UserOp data.

Verification Gates
Run after each phase that touches relevant surface:

npx hardhat compile
npx hardhat test

Frontend:

cd frontend
npm run lint
npm run build

Chatbot server:

cd chatbot-server
npm test

If no test script exists, at least start the server and hit:
GET /health
POST /api/chat
GET /api/agent/status/:smartAccountAddress