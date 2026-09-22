import React, { useState, useRef, useEffect } from 'react';
import { useChatbotContext } from '../context/ChatbotContext';
import { useAppContext } from '../context/AppContext';
import { ethers } from 'ethers';
import { SessionKeyValidatorABI, SmartAccountABI } from '../utils/abis';
import { buildAndSendAccountOp, encodeERC7579Single, encodeERC7579Batch, getActiveSessionKeysOnChain, getPrevValidator } from '../utils/helpers';
import { estimateUserOperationGas, sendUserOperation, getUserOpReceipt, getDynamicGasFees, applyBufferedGasEstimate } from '../utils/bundler';
import "./agent-ui.css";

/* ---------- icons ---------- */
const BotIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="8" width="16" height="12" rx="3" />
    <path d="M12 8V4M9 14h.01M15 14h.01M2 13h2M20 13h2" />
  </svg>
);

const KeyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="15" r="4" />
    <path d="M10.8 12.2 21 2M17 6l3 3M14 9l2.5 2.5" />
  </svg>
);

const CheckCircle = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </svg>
);

const ShieldIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />
  </svg>
);

const ExternalLink = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);

const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12 21 4l-7 17-2.5-7.5L4 12z" />
  </svg>
);

const UserIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="3.4" />
    <path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" />
  </svg>
);

const SpinnerIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

/* ---------- shared bits ---------- */
const Progress = ({ active = 1, total = 3 }) => (
  <div className="progress">
    {Array.from({ length: total }).map((_, i) => (
      <span key={i} className={`progress__bar ${i < active ? "is-on" : ""}`} />
    ))}
  </div>
);

const CardHeader = ({ title, subtitle }) => (
  <div className="card__head">
    <div className="card__headRow">
      <span className="iconBox"><BotIcon size={17} /></span>
      <h2 className="card__title">{title}</h2>
    </div>
    <p className="card__sub">{subtitle}</p>
  </div>
);

/* ---------- scope definitions ---------- */
const SCOPES = [
  { id: "uniswap", emoji: "🦄", name: "Uniswap V3", desc: "Swaps on Sepolia", suggestions: ['Swap 0.001 ETH for USDC', 'Swap 0.001 ETH for USDC 3 times'] },
  { id: "erc20",   emoji: "💸", name: "ERC-20",     desc: "USDC transfers", suggestions: ['Send 0.5 USDC to 0x1234...', 'Send 1 USDC to my friend 3 times'] },
  { id: "custom",  emoji: "⚙️", name: "Custom",     desc: "Contract + selector", suggestions: ['Call the target contract'] },
];

const TABS = [
  { id: "setup",     label: "Configure", step: 1 },
  { id: "authorize", label: "Authorize", step: 2 },
  { id: "workspace", label: "Workspace", step: 3 },
];

const DEFAULT_AGENT_VALIDITY_DAYS = "30";
const SECONDS_PER_DAY = 86400;

const getRemainingValidityDays = (validUntil) => {
  const timestamp = Number(validUntil || 0);
  if (!timestamp) return DEFAULT_AGENT_VALIDITY_DAYS;
  const remainingSeconds = timestamp - Math.floor(Date.now() / 1000);
  return String(Math.max(1, Math.ceil(remainingSeconds / SECONDS_PER_DAY)));
};

const formatExpiry = (validUntil) => {
  const timestamp = Number(validUntil || 0);
  if (!timestamp) return "No expiry saved";
  return new Date(timestamp * 1000).toLocaleString();
};

/* ---------- 1. setup step ---------- */
function SetupStep({ onGenerate, isGenerating, initialName, initialScopeId, initialLimit, initialValidityDays, initialTarget, initialSelector }) {
  const [name, setName] = useState(initialName || "");
  const [scope, setScope] = useState(initialScopeId || "uniswap");
  const [limit, setLimit] = useState(initialLimit || "0.01");
  const [validityDays, setValidityDays] = useState(initialValidityDays || DEFAULT_AGENT_VALIDITY_DAYS);
  const [customTarget, setCustomTarget] = useState(initialTarget || "");
  const [customSelector, setCustomSelector] = useState(initialSelector || "");

  return (
    <div className="card card--setup">
      <Progress active={1} />
      <CardHeader
        title="Initialize AI agent"
        subtitle="Create an ephemeral session key so the agent can act on your behalf, within limits you set below."
      />

      <p className="label">1. Name your agent</p>
      <div className="field">
        <input
          className="field__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Trading agent"
          maxLength={64}
        />
      </div>

      <p className="label">2. Select capability scope</p>
      <div className="scopeGrid">
        {SCOPES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setScope(s.id)}
            className={`scope ${scope === s.id ? "is-selected" : ""}`}
          >
            <span className="scope__name">
              <span className="scope__emoji">{s.emoji}</span>{s.name}
            </span>
            <span className="scope__desc">{s.desc}</span>
          </button>
        ))}
      </div>

      {scope === 'custom' && (
        <div style={{ marginBottom: 20 }}>
          <p className="label">Target contract</p>
          <div className="field">
            <input className="field__input" placeholder="0x..." value={customTarget} onChange={e => setCustomTarget(e.target.value)} />
          </div>
          <p className="label" style={{ marginTop: 10 }}>Function selector</p>
          <div className="field">
            <input className="field__input" placeholder="0x..." value={customSelector} onChange={e => setCustomSelector(e.target.value)} />
          </div>
        </div>
      )}

      <p className="label">
        3. Set hard limit <span className="label__muted">(enforced on-chain)</span>
      </p>
      <div className="field">
        <input
          className="field__input"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          inputMode="decimal"
        />
        <span className="field__suffix">{scope === 'erc20' ? 'USDC' : 'ETH'}</span>
      </div>

      <p className="label">
        4. Set access duration <span className="label__muted">(valid before expiry)</span>
      </p>
      <div className="field">
        <input
          className="field__input"
          type="number"
          min="1"
          max="365"
          step="1"
          value={validityDays}
          onChange={(e) => setValidityDays(e.target.value)}
          inputMode="numeric"
        />
        <span className="field__suffix">days</span>
      </div>

      <button className="agent-btn" disabled={isGenerating} onClick={() => onGenerate?.({ name, scope, limit, validityDays, customTarget, customSelector })}>
        {isGenerating ? <SpinnerIcon /> : <KeyIcon />}
        {isGenerating ? 'Generating...' : 'Generate secure agent key'}
      </button>
    </div>
  );
}

/* ---------- 2. authorize step ---------- */
function AuthorizeStep({ scope, limit, validityDays, address, onAuthorize, isInstalling }) {
  const isErc20 = scope.id === 'erc20';
  const rows = [
    { k: "Scope", v: <><span className="scope__emoji">{scope.emoji}</span>{scope.name}</> },
    { k: "Agent address", v: <span className="mono">{address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Generating...'}</span> },
    { k: "Hard limit", v: `${limit} ${isErc20 ? 'USDC' : 'ETH'}` },
    { k: "Access duration", v: `${validityDays || DEFAULT_AGENT_VALIDITY_DAYS} day(s)` },
  ];

  return (
    <div className="card card--auth">
      <Progress active={2} />
      <CardHeader
        title="Initialize AI agent"
        subtitle="Review and authorize the agent on-chain."
      />

      <div className="panel">
        {rows.map((r) => (
          <div className="panel__row" key={r.k}>
            <span className="panel__k">{r.k}</span>
            <span className="panel__v">{r.v}</span>
          </div>
        ))}
      </div>

      <p className="note">
        <span className="note__icon"><ShieldIcon /></span>
        The key is stored in backend memory and enforced on-chain by the session key validator.
      </p>

      <button className="agent-btn" disabled={isInstalling || !address} onClick={onAuthorize}>
        {isInstalling ? <SpinnerIcon /> : <CheckCircle />}
        {isInstalling ? 'Installing on-chain...' : 'Authorize agent'}
      </button>
    </div>
  );
}

/* ---------- 3. workspace ---------- */
function AgentWorkspace({
  agents,
  activeAgent,
  activeAgentAddress,
  setActiveAgentAddress,
  scope,
  maxAmount,
  messages,
  sendMessage,
  isChatLoading,
  onNewAgent,
  onDeleteAgent,
  isDeleting,
  onRevokeAll,
  isRevokingAll
}) {
  const [value, setValue] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
      scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isChatLoading]);

  const submit = (e) => {
    e.preventDefault();
    if (!value.trim() || isChatLoading) return;
    sendMessage?.(value.trim());
    setValue("");
  };

  return (
    <div className="card card--ws">
      <header className="ws__head">
        <span className="iconBox"><BotIcon size={17} /></span>
        <div className="ws__id">
          <span className="ws__title">{activeAgent?.name || "Agent workspace"}</span>
          <span className="ws__status">
            <i className="dot" />
            {activeAgentAddress ? `${activeAgentAddress.slice(0, 6)}...${activeAgentAddress.slice(-4)}` : "No active agent"}
          </span>
        </div>
        <div className="ws__pills">
          <span className="pill">{scope.name.toUpperCase()}</span>
          <span className="pill">Max: {maxAmount}</span>
          <span className="pill">Expires: {activeAgent?.validUntil ? formatExpiry(activeAgent.validUntil) : "Pending"}</span>
          <button className="pill pill--action" type="button" onClick={onNewAgent} title="Create another agent">+ New Agent</button>
          <button
            className="pill pill--danger"
            type="button"
            disabled={isRevokingAll}
            onClick={onRevokeAll}
            title="Uninstall SessionKeyValidator and revoke all agents"
          >
            {isRevokingAll ? "Revoking..." : "Revoke All Agents"}
          </button>
          <button
            className="pill pill--danger"
            type="button"
            disabled={!activeAgentAddress || isDeleting}
            onClick={() => onDeleteAgent?.(activeAgentAddress)}
            title="Revoke this agent on-chain"
          >
            {isDeleting ? "Revoking..." : "Revoke Agent"}
          </button>
        </div>
      </header>

      <div className="agentRail">
        {agents.length === 0 ? (
          <span className="agentRail__empty">No agents configured</span>
        ) : agents.map((agent) => {
          const selected = agent.agentAddress?.toLowerCase() === activeAgentAddress?.toLowerCase();
          const agentScope = SCOPES.find(s => s.id === agent.scope) || SCOPES[0];
          return (
            <button
              key={agent.agentAddress}
              type="button"
              className={`agentChip ${selected ? "is-selected" : ""}`}
              onClick={() => setActiveAgentAddress(agent.agentAddress)}
            >
              <span className="agentChip__name">{agent.name || "Agent"}</span>
              <span className="agentChip__meta">
                {agentScope.name} · {agent.agentAddress.slice(0, 6)}...{agent.agentAddress.slice(-4)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="ws__thread">
        {messages.length === 0 && (
          <div className="ws__empty">
            <div className="ws__empty-icon"><BotIcon size={22} /></div>
            <p className="ws__empty-title">How can I help?</p>
            <p className="ws__empty-sub">Describe what you want me to do and I'll execute it using your session key.</p>
            <div className="suggestions">
              {scope.suggestions?.map(s => (
                <button key={s} onClick={() => setValue(s)} className="suggestion-btn">"{s}"</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div className="row row--user" key={i}>
              <div className="bubble">{m.content}</div>
              <span className="avatar"><UserIcon /></span>
            </div>
          ) : (
            <div className="row row--agent" key={i}>
              <span className="avatar avatar--bot"><BotIcon size={15} /></span>
              <div className="stack">
                <div className="bubble">{m.content}</div>
                {m.ops?.map((op) => (
                  <div className="op" key={op.iteration}>
                    <span className="op__check"><CheckCircle size={15} /></span>
                    <span className="op__label">Operation {op.iteration}</span>
                    <a className="op__link" href={op.txUrl} target="_blank" rel="noreferrer">
                      View tx <ExternalLink />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )
        )}
        
        {isChatLoading && (
          <div className="row row--agent">
            <span className="avatar avatar--bot"><BotIcon size={15} /></span>
            <div className="bubble">
              <div className="typing-dots">
                <span /> <span /> <span />
              </div>
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      <form className="composer" onSubmit={submit}>
        <input
          className="composer__input"
          placeholder="Ask the agent to do something..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!activeAgentAddress}
        />
        <button className="composer__send" type="submit" aria-label="Send" disabled={!value.trim() || isChatLoading}>
          <SendIcon />
        </button>
      </form>
    </div>
  );
}

/* ---------- main UI shell ---------- */
export default function ChatbotView() {
    const {
        isAgentConfigured,
        agentStatus,
        agents,
        activeAgent,
        activeAgentAddress,
        setActiveAgentAddress,
        messages,
        sendMessage,
        generateAgent,
        authorizeAgent,
        deleteAgent,
        clearAgents,
        isChatLoading
    } = useChatbotContext();
    const { smartAccountAddress, provider, signer, eoaAddress, env, chainId, installedModules, loadingModules, refreshInstalledModules, trackOp } = useAppContext();

    const [tab, setTab] = useState("setup");
    const [visited, setVisited] = useState(["setup"]);
    
    const [isGenerating, setIsGenerating] = useState(false);
    const [isInstalling, setIsInstalling] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isRevokingAll, setIsRevokingAll] = useState(false);
    const [generatedAgentAddress, setGeneratedAgentAddress] = useState('');
    const [generatedAgent, setGeneratedAgent] = useState(null);
    const [config, setConfig] = useState({
        name: '',
        scope: SCOPES[0],
        limit: "0.01",
        validityDays: DEFAULT_AGENT_VALIDITY_DAYS,
        customTarget: '',
        customSelector: ''
    });

    useEffect(() => {
        if (isAgentConfigured && agentStatus && !visited.includes("workspace")) {
            const scopeObj = SCOPES.find(s => s.id === agentStatus.scope) || SCOPES[0];
            setConfig({
                name: agentStatus.name || '',
                scope: scopeObj,
                limit: agentStatus.maxAmount,
                validityDays: getRemainingValidityDays(agentStatus.validUntil),
                customTarget: '',
                customSelector: ''
            });
            setGeneratedAgentAddress(agentStatus.agentAddress);
            setVisited(v => [...new Set([...v, "setup", "authorize", "workspace"])]);
            setTab("workspace");
        }
    }, [isAgentConfigured, agentStatus, visited]);

    const go = (id) => {
        setTab(id);
        setVisited((v) => (v.includes(id) ? v : [...v, id]));
    };

    const handleNewAgent = () => {
        setGeneratedAgentAddress('');
        setGeneratedAgent(null);
        setConfig({
            name: '',
            scope: SCOPES[0],
            limit: "0.01",
            validityDays: DEFAULT_AGENT_VALIDITY_DAYS,
            customTarget: '',
            customSelector: ''
        });
        setTab("setup");
        setVisited(v => [...new Set([...v, "setup"])]);
    };

    const handleGenerate = async ({ name, scope, limit, validityDays, customTarget, customSelector }) => {
        const found = SCOPES.find((s) => s.id === scope) || SCOPES[0];
        const parsedValidityDays = Number(validityDays || DEFAULT_AGENT_VALIDITY_DAYS);
        if (!Number.isFinite(parsedValidityDays) || parsedValidityDays < 1 || parsedValidityDays > 365) {
            alert("Agent access duration must be between 1 and 365 days.");
            return;
        }
        setConfig({ name, scope: found, limit, validityDays: String(Math.floor(parsedValidityDays)), customTarget, customSelector });
        
        setIsGenerating(true);
        try {
            const addr = await generateAgent(scope, limit, name);
            setGeneratedAgent({
                agentAddress: addr,
                name: name?.trim() || "Agent",
                scope,
                maxAmount: limit,
                validityDays: String(Math.floor(parsedValidityDays))
            });
            setGeneratedAgentAddress(addr);
            go("authorize");
        } catch (e) {
            alert("Failed to generate agent: " + e.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const getAgentRule = ({ scope, limit, customTarget, customSelector }) => {
        let target = "0x0000000000000000000000000000000000000000";
        let selector = "0x00000000";
        let maxValue = 0n;

        if (scope.id === 'uniswap') {
            target = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E";
            selector = "0x00000000";
            maxValue = ethers.parseEther(limit);
        } else if (scope.id === 'erc20') {
            target = customTarget || "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
            selector = "0xa9059cbb";
            maxValue = 0n;
        } else if (scope.id === 'custom') {
            target = customTarget || "0x0000000000000000000000000000000000000000";
            selector = customSelector === "0x00" ? "0x00000000" : (customSelector || "0x00000000");
            maxValue = ethers.parseEther(limit);
        }

        return { target, selector, maxValue };
    };

    const waitForReceipt = async (opHash) => {
        let receipt = null;
        let retries = 45;
        while (!receipt && retries > 0) {
            await new Promise(r => setTimeout(r, 2000));
            receipt = await getUserOpReceipt(opHash, chainId);
            retries--;
        }
        return receipt;
    };

    const handleInstall = async () => {
        setIsInstalling(true);
        try {
            const SESSION_KEY_VALIDATOR = env.SESSION_KEY_VALIDATOR;
            if (!SESSION_KEY_VALIDATOR) throw new Error("SessionKeyValidator address missing from chain config.");
            const parsedValidityDays = Number(config.validityDays || DEFAULT_AGENT_VALIDITY_DAYS);
            if (!Number.isFinite(parsedValidityDays) || parsedValidityDays < 1 || parsedValidityDays > 365) {
                throw new Error("Agent access duration must be between 1 and 365 days.");
            }
            const validUntil = Math.floor(Date.now() / 1000) + (Math.floor(parsedValidityDays) * SECONDS_PER_DAY);

            const { target, selector, maxValue } = getAgentRule(config);

            const keyData = [generatedAgentAddress, target, selector, maxValue, 0, validUntil, 0];

            const validatorIface = new ethers.Interface(SessionKeyValidatorABI);
            const innerCallData = validatorIface.encodeFunctionData("addSessionKey", [keyData]);
            const callData = encodeERC7579Single(SESSION_KEY_VALIDATOR, "0x0", innerCallData);

            const entryPoint = new ethers.Contract(
                env.ENTRY_POINT,
                ["function getNonce(address sender, uint192 key) view returns (uint256)"],
                provider
            );

            const nonce = await entryPoint.getNonce(smartAccountAddress, 0);
            const { maxFeePerGas, maxPriorityFeePerGas } = await getDynamicGasFees(provider, chainId);

            const userOp = {
                sender: smartAccountAddress,
                nonce: ethers.toBeHex(nonce),
                factory: "0x",
                factoryData: "0x",
                callData,
                callGasLimit: "0x0",
                verificationGasLimit: "0x0",
                preVerificationGas: "0x0",
                maxFeePerGas: ethers.toBeHex(maxFeePerGas),
                maxPriorityFeePerGas: ethers.toBeHex(maxPriorityFeePerGas),
                paymaster: "0x",
                paymasterVerificationGasLimit: "0x",
                paymasterPostOpGasLimit: "0x",
                paymasterData: "0x",
                signature: "0x"
            };

            const est = await estimateUserOperationGas(userOp, chainId);
            applyBufferedGasEstimate(userOp, est);

            const packUserOp = (op) => {
                const accountGasLimits = ethers.concat([
                    ethers.zeroPadValue(ethers.toBeHex(op.verificationGasLimit), 16),
                    ethers.zeroPadValue(ethers.toBeHex(op.callGasLimit), 16)
                ]);
                const gasFees = ethers.concat([
                    ethers.zeroPadValue(ethers.toBeHex(op.maxPriorityFeePerGas), 16),
                    ethers.zeroPadValue(ethers.toBeHex(op.maxFeePerGas), 16)
                ]);
                return {
                    sender: op.sender,
                    nonce: op.nonce,
                    initCode: "0x",
                    callData: op.callData,
                    accountGasLimits,
                    preVerificationGas: op.preVerificationGas,
                    gasFees,
                    paymasterAndData: "0x",
                    signature: op.signature
                };
            };

            const packedForHash = packUserOp(userOp);
            const epHashContract = new ethers.Contract(
                env.ENTRY_POINT,
                ["function getUserOpHash(tuple(address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature) userOp) view returns (bytes32)"],
                provider
            );

            const userOpHash = await epHashContract.getUserOpHash(packedForHash);
            const sig = await signer.signMessage(ethers.getBytes(userOpHash));
            userOp.signature = sig;

            const returnedHash = await sendUserOperation(userOp, chainId);
            trackOp(returnedHash, 'Authorize AI Agent', { calldata: userOp.callData });

            const receipt = await waitForReceipt(returnedHash);

            if (receipt && receipt.success) {
                const authorizedAgent = {
                    ...(generatedAgent || {}),
                    agentAddress: generatedAgentAddress,
                    name: config.name?.trim() || generatedAgent?.name || "Agent",
                    scope: config.scope.id,
                    maxAmount: config.limit,
                    maxValueWei: maxValue.toString(),
                    target,
                    selector,
                    validAfter: 0,
                    validUntil,
                    txHashInstall: returnedHash,
                    authorized: true
                };
                await authorizeAgent(authorizedAgent);
                go("workspace");
            } else {
                alert("Agent installation failed or timed out.");
            }
        } catch (e) {
            console.error(e);
            alert("Error installing agent: " + e.message);
        } finally {
            setIsInstalling(false);
        }
    };

    const handleDeleteAgent = async (agentAddress) => {
        if (!agentAddress) return;
        const confirmed = window.confirm("Revoke this agent on-chain and remove its signing key from the backend?");
        if (!confirmed) return;
        setIsDeleting(true);
        try {
            const validatorAddr = env.SESSION_KEY_VALIDATOR;
            if (!validatorAddr) throw new Error("SessionKeyValidator address missing from chain config.");

            const skValidator = new ethers.Contract(validatorAddr, SessionKeyValidatorABI, provider);
            const innerCall = skValidator.interface.encodeFunctionData("revokeSessionKey", [agentAddress]);
            const callData = encodeERC7579Single(validatorAddr, 0n, innerCall);
            const opHash = await buildAndSendAccountOp(signer, provider, smartAccountAddress, callData, env.ENTRY_POINT, env.K1_VALIDATOR, chainId);
            trackOp(opHash, 'Revoke AI Agent', { calldata: callData });

            const receipt = await waitForReceipt(opHash);
            if (!receipt?.success) throw new Error("Agent revocation failed or timed out.");

            await deleteAgent(agentAddress, { txHashRevoke: opHash });
            window.dispatchEvent(new CustomEvent("aa-session-key-agent-revoked", {
                detail: { smartAccountAddress, chainId, agentAddress, txHashRevoke: opHash }
            }));
            if (agents.length <= 1) {
                handleNewAgent();
            }
        } catch (e) {
            alert("Failed to delete agent: " + (e.response?.data?.error || e.message));
        } finally {
            setIsDeleting(false);
        }
    };

    const handleRevokeAllAgents = async () => {
        const confirmed = window.confirm("This uninstalls SessionKeyValidator from your smart account and revokes all AI agents on-chain.");
        if (!confirmed) return;
        setIsRevokingAll(true);
        try {
            const validatorAddr = env.SESSION_KEY_VALIDATOR;
            if (!validatorAddr) throw new Error("SessionKeyValidator address missing from chain config.");

            const skValidator = new ethers.Contract(validatorAddr, SessionKeyValidatorABI, provider);
            const activeKeys = await getActiveSessionKeysOnChain(validatorAddr, smartAccountAddress, provider);
            const prev = await getPrevValidator(smartAccountAddress, validatorAddr, provider);
            const deInitData = ethers.AbiCoder.defaultAbiCoder().encode(["address", "bytes"], [prev, "0x"]);
            const accountIface = new ethers.Interface(SmartAccountABI);
            const uninstallCallData = accountIface.encodeFunctionData("uninstallModule", [1, validatorAddr, deInitData]);
            const revokeCallDatas = activeKeys.map((key) => (
                skValidator.interface.encodeFunctionData("revokeSessionKey", [key.address])
            ));
            const callData = revokeCallDatas.length > 0
                ? encodeERC7579Batch(
                    [...revokeCallDatas.map(() => validatorAddr), smartAccountAddress],
                    [...revokeCallDatas.map(() => 0n), 0n],
                    [...revokeCallDatas, uninstallCallData]
                )
                : uninstallCallData;
            const opHash = await buildAndSendAccountOp(signer, provider, smartAccountAddress, callData, env.ENTRY_POINT, env.K1_VALIDATOR, chainId);
            trackOp(opHash, 'Revoke All AI Agents', { calldata: callData });

            const receipt = await waitForReceipt(opHash);
            if (!receipt?.success) throw new Error("Revoke all agents failed or timed out.");

            await clearAgents({ txHashRevoke: opHash });
            window.dispatchEvent(new CustomEvent("aa-session-key-module-revoked", {
                detail: { smartAccountAddress, chainId, txHashRevoke: opHash }
            }));
            await refreshInstalledModules();
            handleNewAgent();
        } catch (e) {
            alert("Failed to revoke all agents: " + (e.response?.data?.error || e.message));
        } finally {
            setIsRevokingAll(false);
        }
    };

    if (!eoaAddress || !smartAccountAddress) {
        return (
            <div className="guard-card">
                <div className="guard-icon guard-icon--neutral"><ShieldIcon /></div>
                <h2 className="guard-title">Connect your account</h2>
                <p className="guard-sub">Connect your EOA and initialize your smart account to use the AI agent.</p>
            </div>
        );
    }

    const hasSessionKeyValidator = installedModules?.hasSessionKey || installedModules?.rawValidators?.some(
        v => v.toLowerCase() === env.SESSION_KEY_VALIDATOR?.toLowerCase()
    );
    const workspaceScope = SCOPES.find(s => s.id === activeAgent?.scope) || config.scope;
    const workspaceLimit = activeAgent?.maxAmount || config.limit;

    if (loadingModules && !installedModules?.rawValidators?.length) {
        return (
            <div className="guard-card">
                <div className="guard-icon guard-icon--neutral"><SpinnerIcon /></div>
                <h2 className="guard-title">Checking validator module</h2>
                <p className="guard-sub">Reading your smart account modules from the selected chain.</p>
            </div>
        );
    }

    if (!hasSessionKeyValidator) {
        return (
            <div className="guard-card">
                <div className="guard-icon guard-icon--warning"><KeyIcon /></div>
                <h2 className="guard-title">Missing validator module</h2>
                <p className="guard-sub">Install the SessionKeyValidator on your account first, from the Modules tab.</p>
            </div>
        );
    }

    return (
        <div className="stage">
          <div className="shell">
                <nav className="tabs" role="tablist">
                    {TABS.map((t) => (
                        <button
                            key={t.id}
                            role="tab"
                            aria-selected={tab === t.id}
                            className={`tab ${tab === t.id ? "is-active" : ""} ${
                                visited.includes(t.id) ? "is-visited" : ""
                            }`}
                            onClick={() => go(t.id)}
                        >
                            <span className="tab__num">{t.step}</span>
                            {t.label}
                        </button>
                    ))}
                    <span
                        className="tabs__ink"
                        style={{
                            width: `calc(100% / ${TABS.length})`,
                            transform: `translateX(${TABS.findIndex((t) => t.id === tab) * 100}%)`,
                        }}
                    />
                </nav>

                <div className="panes">
                    {tab === "setup" && (
                        <div className="pane">
                            <SetupStep 
                                onGenerate={handleGenerate} 
                                isGenerating={isGenerating} 
                                initialName={config.name}
                                initialScopeId={config.scope.id}
                                initialLimit={config.limit}
                                initialValidityDays={config.validityDays}
                                initialTarget={config.customTarget}
                                initialSelector={config.customSelector}
                            />
                        </div>
                    )}
                    {tab === "authorize" && (
                        <div className="pane">
                            <AuthorizeStep
                                scope={config.scope}
                                limit={config.limit}
                                validityDays={config.validityDays}
                                address={generatedAgentAddress}
                                onAuthorize={handleInstall}
                                isInstalling={isInstalling}
                            />
                        </div>
                    )}
                    {tab === "workspace" && (
                        <div className="pane">
                            <AgentWorkspace
                                agents={agents}
                                activeAgent={activeAgent}
                                activeAgentAddress={activeAgentAddress}
                                setActiveAgentAddress={setActiveAgentAddress}
                                scope={workspaceScope}
                                maxAmount={workspaceLimit}
                                messages={messages}
                                sendMessage={sendMessage}
                                isChatLoading={isChatLoading}
                                onNewAgent={handleNewAgent}
                                onDeleteAgent={handleDeleteAgent}
                                isDeleting={isDeleting}
                                onRevokeAll={handleRevokeAllAgents}
                                isRevokingAll={isRevokingAll}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
