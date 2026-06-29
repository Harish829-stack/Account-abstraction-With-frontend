import React, { useState } from 'react';
import { Wallet, Puzzle, Zap, Fuel, MapPin, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SectionHeading } from './Shared';

const stackTabs = [
  {
    label: "Smart Accounts",
    icon: <Wallet size={32} />,
    color: "violet",
    title: "ERC-4337 Smart Accounts",
    body: "Replace EOAs with programmable smart contract wallets. Batch calls, custom signature logic, and automated actions without touching the base Ethereum protocol.",
    pills: ["UserOperations", "EntryPoint v0.7", "Custom Signatures", "Nonce Manager", "Batched Calls", "Counterfactual Deploy"],
    file: "UserOperation.sol",
    code: `struct UserOperation {\n  address sender;           // your smart account\n  uint256 nonce;\n  bytes   initCode;         // deploy if not yet live\n  bytes   callData;         // what to execute\n  uint256 callGasLimit;\n  uint256 verificationGasLimit;\n  uint256 preVerificationGas;\n  uint256 maxFeePerGas;\n  bytes   paymasterAndData; // optional gas sponsor\n  bytes   signature;\n}`,
  },
  {
    label: "ERC-7579 Modules",
    icon: <Puzzle size={32} />,
    color: "cyan",
    title: "ERC-7579 Modular Accounts",
    body: "Install and remove modules at runtime with no redeployment. Validators authorize UserOps, executors perform actions, hooks run before and after, and fallbacks extend the interface.",
    pills: ["Validators", "Executors", "Hooks", "Fallbacks", "Plug & Play", "No Migration", "Composable"],
    file: "IModule.ts",
    code: `// Install a validator module\naccount.installModule({\n  moduleType: ModuleType.Validator,\n  module: SESSION_KEY_VALIDATOR,\n  initData: encodeAbiParameters([\n    { name: 'validUntil', type: 'uint48' },\n    { name: 'validAfter', type: 'uint48' },\n    { name: 'sessionKey', type: 'address' },\n  ], [expiry, 0, signerAddress])\n})`,
  },
  {
    label: "Bundler",
    icon: <Zap size={32} />,
    color: "yellow",
    title: "High-Performance Bundler",
    body: "Aggregates UserOperations, simulates them pre-submission, and lands them on-chain with MEV-aware batching. Auto-retry on reorgs. No mempool to operate.",
    pills: ["Pre-flight Simulation", "MEV-aware", "Auto-retry", "Multi-chain", "Alt Mempool Compatible"],
    file: "sendUserOp.ts",
    code: `const userOpHash = await bundler.sendUserOperation({\n  sender: smartAccountAddress,\n  nonce: await account.getNonce(),\n  callData: encodeFunctionData({ ... }),\n  signature: await owner.signMessage(userOpHash),\n  paymasterAndData: '0x',\n})\n\nconst receipt = await bundler.waitForUserOperationReceipt({\n  hash: userOpHash\n})`,
  },
  {
    label: "Paymaster",
    icon: <Fuel size={32} />,
    color: "green",
    title: "Flexible Paymaster",
    body: "Sponsor gas entirely, or let users pay in USDC, DAI, or any ERC-20. Set per-wallet budgets, whitelist contracts, and enforce method-level rules with no redeployment.",
    pills: ["Gas Sponsorship", "ERC-20 Gas", "Verifying Paymaster", "Deposit Paymaster", "Policy Rules", "Stablecoin Support"],
    file: "paymaster.ts",
    code: `// Verifying Paymaster — sponsor gas off-chain\nconst paymasterData = await paymaster.sponsorUserOperation({\n  userOperation: userOp,\n  entryPoint: ENTRY_POINT_ADDRESS,\n})\n\n// ERC-20 Paymaster — pay gas in USDC\nconst paymasterData = await paymaster.erc20Sponsor({\n  token: USDC_ADDRESS,\n  userOp: userOp,\n})`,
  },
  {
    label: "Deterministic Deploy",
    icon: <MapPin size={32} />,
    color: "orange",
    title: "Same Address. Every Chain.",
    body: "CREATE2 factory computes your account address before deployment. Share your address, receive funds, and deploy only when needed with the same address on every EVM chain.",
    pills: ["CREATE2", "Counterfactual", "Factory Pattern", "Pre-compute Address", "Cross-chain Consistent"],
    file: "getAddress.ts",
    code: `// Same address on every EVM chain\nconst accountAddress = await factory.getAddress({\n  owner: ownerAddress,\n  salt: 0n,\n})\n\n// initCode triggers deployment on first UserOp\nconst initCode = encodePacked(\n  ['address', 'bytes'],\n  [FACTORY_ADDRESS, createCalldata]\n)`,
  },
  {
    label: "Upgradable Accounts",
    icon: <RefreshCw size={32} />,
    color: "pink",
    title: "Forward-Compatible Upgrades",
    body: "UUPS proxy separates storage from logic. Upgrade implementation without migrating assets or changing address. EIP-7702 lets EOAs delegate to smart account logic.",
    pills: ["UUPS Proxy", "EIP-7702", "No Migration", "Zero Downtime", "Storage Preserved"],
    file: "upgrade.ts",
    code: `// Upgrade implementation via UUPS\nawait smartAccount.write.upgradeToAndCall([\n  NEW_IMPLEMENTATION_ADDRESS,\n  '0x', // optional init calldata\n])\n\n// EIP-7702 — EOA delegates to smart account\nconst auth = await eoa.signAuthorization({\n  contractAddress: SMART_ACCOUNT_IMPL,\n  chainId: base.id,\n  nonce: await eoa.getNonce(),\n})`,
  },
];

function CodeBlock({ tab }) {
  return (
    <div className="aa-code-block">
      <div className="aa-code-topbar">
        <i /><i /><i />
        <span>{tab.file}</span>
      </div>
      <pre><code>{tab.code}</code></pre>
    </div>
  );
}

export default function CoreStackTabs() {
  const [active, setActive] = useState(0);
  const tab = stackTabs[active];
  return (
    <motion.section 
      className="aa-stack-section"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
    >
      <SectionHeading eyebrow="CORE STACK" title="One SDK. The entire AA stack." sub="Everything you need to build production-grade smart accounts." />
      
      <div className="aa-tab-row">
        {stackTabs.map((item, i) => (
          <button key={item.label} className={i === active ? 'is-active' : ''} onClick={() => setActive(i)}>
            {item.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div 
          className="aa-tab-panel" 
          key={tab.label}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.25 }}
        >
          <div className={`aa-tab-copy aa-color-${tab.color}`}>
            <div className="aa-tab-icon">{tab.icon}</div>
            <h3>{tab.title}</h3>
            <p>{tab.body}</p>
            <div className="aa-pill-row">
              {tab.pills.map(p => <span key={p}>{p}</span>)}
            </div>
          </div>
          <CodeBlock tab={tab} />
        </motion.div>
      </AnimatePresence>
    </motion.section>
  );
}
