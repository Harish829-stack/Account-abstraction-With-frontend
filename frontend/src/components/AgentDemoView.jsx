import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import { getDefaultChainId } from '../config/chains';
import "../views/agent-ui.css";

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

const SCOPES = [
  { id: "native",  emoji: "⚡", name: "Native Transfer", desc: "ETH transfers", suggestions: ['Send 0.001 ETH to 0x1234...', 'Send 0.01 ETH to my friend 3 times'] },
  { id: "uniswap", emoji: "🦄", name: "Uniswap V3", desc: "Swaps on Sepolia", suggestions: ['Swap 0.001 ETH for USDC', 'Swap 0.001 ETH for USDC 3 times'] },
  { id: "erc20",   emoji: "💸", name: "ERC-20",     desc: "USDC transfers", suggestions: ['Send 0.5 USDC to 0x1234...', 'Send 1 USDC to my friend 3 times'] }
];

const TABS = [
  { id: "setup",     label: "Configure Assistants", step: 1 },
  { id: "workspace", label: "Workspace", step: 2 },
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

function CreateAssistantStep({ onCreate, isCreating }) {
  const [scopesConfig, setScopesConfig] = useState({
    native: { enabled: false, limit: "0.01" },
    uniswap: { enabled: true, limit: "0.01" },
    erc20: { enabled: false, limit: "10" }
  });
  const [validityDays, setValidityDays] = useState(DEFAULT_AGENT_VALIDITY_DAYS);

  const handleToggle = (id) => {
    setScopesConfig(prev => ({
      ...prev,
      [id]: { ...prev[id], enabled: !prev[id].enabled }
    }));
  };

  const handleLimitChange = (id, val) => {
    setScopesConfig(prev => ({
      ...prev,
      [id]: { ...prev[id], limit: val }
    }));
  };

  const hasAnySelected = Object.values(scopesConfig).some(c => c.enabled);

  return (
    <div className="card card--setup">
      <Progress active={1} total={2} />
      <CardHeader
        title="Configure AI Assistants"
        subtitle="Select the capabilities you want to enable and set their on-chain spending limits."
      />

      <p className="label">1. Select capabilities & set limits</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {SCOPES.map((s) => {
          const config = scopesConfig[s.id];
          return (
            <div 
              key={s.id} 
              style={{
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                padding: '14px 16px',
                borderRadius: '14px', 
                border: config.enabled ? '1px solid #00f59b' : '1px solid rgba(255, 255, 255, 0.08)',
                backgroundColor: config.enabled ? 'rgba(0, 245, 155, 0.08)' : 'rgba(7, 9, 14, 0.55)',
                boxShadow: config.enabled ? '0 0 20px rgba(0, 245, 155, 0.12)' : 'none',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
            >
              <div 
                style={{ display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }}
                onClick={() => handleToggle(s.id)}
              >
                <div style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '6px',
                  border: config.enabled ? '1.5px solid #00f59b' : '1.5px solid rgba(255, 255, 255, 0.2)',
                  backgroundColor: config.enabled ? '#00f59b' : 'rgba(255, 255, 255, 0.05)',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#07090e',
                  fontSize: '12px',
                  fontWeight: 900,
                  transition: 'all 0.15s ease'
                }}>
                  {config.enabled && '✓'}
                </div>
                <div>
                  <div style={{ fontWeight: '700', fontSize: '14.5px', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{s.emoji}</span> 
                    <span>{s.name}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>{s.desc}</div>
                </div>
              </div>

              {config.enabled && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    value={config.limit}
                    onChange={(e) => handleLimitChange(s.id, e.target.value)}
                    style={{ 
                      width: '90px', 
                      padding: '8px 12px', 
                      fontSize: '14px', 
                      fontWeight: '600',
                      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                      backgroundColor: 'rgba(7, 9, 14, 0.85)',
                      color: '#ffffff',
                      border: '1px solid rgba(0, 245, 155, 0.4)', 
                      borderRadius: '8px', 
                      outline: 'none',
                      boxShadow: '0 0 10px rgba(0, 245, 155, 0.1)'
                    }}
                    placeholder="Limit"
                  />
                  <span style={{ 
                    fontSize: '11.5px', 
                    color: '#00f59b', 
                    fontWeight: '700',
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    backgroundColor: 'rgba(0, 245, 155, 0.1)',
                    border: '1px solid rgba(0, 245, 155, 0.2)',
                    padding: '4px 8px',
                    borderRadius: '6px'
                  }}>
                    {s.id === 'erc20' ? 'USDC' : 'ETH'}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="label" style={{ marginTop: '24px' }}>
        2. Set access duration <span className="label__muted">(days before expiry)</span>
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

      <button 
        className="agent-btn" 
        style={{ marginTop: '16px' }} 
        disabled={isCreating || !hasAnySelected} 
        onClick={() => onCreate?.({ scopesConfig, validityDays })}
      >
        {isCreating ? <SpinnerIcon /> : <CheckCircle />}
        {isCreating ? 'Creating & Authorizing Assistants...' : 'Create & Authorize Assistants'}
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
  onSyncAgents,
  isSyncing,
  onDeleteAgent,
  isDeleting,
  onRevokeAll,
  isRevokingAll
}) {
  const [value, setValue] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
      scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
          <select 
            className="agent-dropdown" 
            value={activeAgentAddress || "financial"} 
            onChange={(e) => setActiveAgentAddress(e.target.value)}
            style={{ 
              padding: '8px 36px 8px 14px', 
              borderRadius: '10px', 
              border: '1px solid rgba(255, 255, 255, 0.12)', 
              fontSize: '13.5px', 
              fontWeight: '700', 
              color: '#ffffff',
              backgroundColor: 'rgba(7, 9, 14, 0.9)', 
              appearance: 'none', 
              backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%2300f59b\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', 
              backgroundRepeat: 'no-repeat', 
              backgroundPosition: 'right 10px center', 
              backgroundSize: '15px',
              cursor: 'pointer',
              outline: 'none',
              boxShadow: '0 4px 15px rgba(0,0,0,0.4)',
              transition: 'all 0.15s ease'
            }}
          >
            <option value="financial" style={{ backgroundColor: '#0b0e14', color: '#00f59b' }}>
              💹 Financial Agent (Portfolio & Data)
            </option>
            {agents.map((a) => (
              <option key={a.agentAddress} value={a.agentAddress} style={{ backgroundColor: '#0b0e14', color: '#f3f4f6' }}>
                {a.name} ({a.scope.toUpperCase()})
              </option>
            ))}
          </select>
          <span className="ws__status">
            <i className="dot" />
            {activeAgentAddress && activeAgentAddress !== 'financial' 
              ? `${activeAgentAddress.slice(0, 6)}...${activeAgentAddress.slice(-4)}` 
              : "Read-Only Market Telemetry"}
          </span>
        </div>

        <div className="ws__pills">
          {activeAgentAddress && activeAgentAddress !== 'financial' && (
            <>
              <span className="pill">{scope.name.toUpperCase()}</span>
              <span className="pill">Max: {maxAmount}</span>
              <span className="pill">Expires: {activeAgent?.validUntil ? formatExpiry(activeAgent.validUntil) : "Pending"}</span>
            </>
          )}
          <button
            className="pill pill--action"
            type="button"
            disabled={isSyncing}
            onClick={onSyncAgents}
            title="Sync saved agents with active on-chain session keys"
          >
            {isSyncing ? "Syncing..." : "Sync Agents"}
          </button>
          <button className="pill pill--action" type="button" onClick={onNewAgent} title="Create another agent">+ New Agent</button>
          {activeAgentAddress && activeAgentAddress !== 'financial' && (
            <button
              className="pill pill--danger"
              type="button"
              disabled={isRevokingAll}
              onClick={onRevokeAll}
              title="Uninstall SessionKeyValidator and revoke all agents"
            >
              {isRevokingAll ? "Revoking..." : "Revoke All Agents"}
            </button>
          )}
          {activeAgentAddress && activeAgentAddress !== 'financial' && (
            <button
              className="pill pill--danger"
              type="button"
              disabled={isDeleting}
              onClick={() => onDeleteAgent?.(activeAgentAddress)}
              title="Revoke this agent on-chain"
            >
              {isDeleting ? "Revoking..." : "Revoke Agent"}
            </button>
          )}
        </div>
      </header>

      <div className="ws__thread">
        {messages.length === 0 && (
          <div className="ws__empty">
            <div className="ws__empty-icon"><BotIcon size={22} /></div>
            <p className="ws__empty-title">How can I help?</p>
            <p className="ws__empty-sub">
              {activeAgentAddress && activeAgentAddress !== 'financial' 
                ? "Describe what you want me to do and I'll execute it using your session key."
                : "I can help you monitor your portfolio, check market prices, and analyze DeFi yields."}
            </p>
            <div className="suggestions">
              {activeAgentAddress && activeAgentAddress !== 'financial' ? scope.suggestions?.map(s => (
                <button key={s} onClick={() => setValue(s)} className="suggestion-btn">"{s}"</button>
              )) : ['What is my portfolio worth?', 'Check Aave USDC supply APY', 'What is my ETH & USDC breakdown?'].map(s => (
                <button key={s} onClick={() => setValue(s)} className="suggestion-btn">"{s}"</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div className="row row--user" key={i}>
              <div className="bubble markdown-body"><ReactMarkdown>{m.content}</ReactMarkdown></div>
              <span className="avatar"><UserIcon /></span>
            </div>
          ) : (
            <div className="row row--agent" key={i}>
              <span className="avatar avatar--bot"><BotIcon size={15} /></span>
              <div className="stack">
                <div className="bubble markdown-body"><ReactMarkdown>{m.content}</ReactMarkdown></div>
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

      <div style={{ padding: '0 20px 12px', display: 'flex', gap: '8px', overflowX: 'auto', whiteSpace: 'nowrap' }} className="hide-scrollbar">
          {(activeAgentAddress === 'financial' ? [
              "What's my portfolio worth?",
              "Send 100 USDC to vitalik.eth",
              "Swap 0.5 ETH for USDC",
              "Where should I invest for max profit?"
          ] : (scope?.suggestions || [])).map((q) => (
              <button
                  key={q}
                  type="button"
                  onClick={() => {
                      if (!isChatLoading && activeAgentAddress && activeAgent?.authorized !== false) {
                          sendMessage(q);
                      }
                  }}
                  style={{
                      background: 'rgba(0, 245, 155, 0.1)',
                      border: '1px solid rgba(0, 245, 155, 0.2)',
                      color: '#00f59b',
                      padding: '6px 12px',
                      borderRadius: '16px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      flexShrink: 0,
                      transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(0, 245, 155, 0.2)'; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(0, 245, 155, 0.1)'; }}
              >
                  {q}
              </button>
          ))}
      </div>

      <form className="composer" onSubmit={submit}>
        <input
          className="composer__input"
          placeholder="Ask the agent to do something..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!activeAgentAddress || activeAgent?.authorized === false || activeAgent?.status === "revoked" || activeAgent?.status === "expired"}
        />
        <button
          className="composer__send"
          type="submit"
          aria-label="Send"
          disabled={!value.trim() || isChatLoading || activeAgent?.authorized === false || activeAgent?.status === "revoked" || activeAgent?.status === "expired"}
        >
          <SendIcon />
        </button>
      </form>
    </div>
  );
}

export default function AgentDemoView() {
    // --- Mock State ---
    const [mockBalances, setMockBalances] = useState({ eth: 2.4, usdc: 4700 });
    const [mockAgents, setMockAgents] = useState([]);
    const [mockActiveAgent, setMockActiveAgent] = useState('financial');
    const [mockMessages, setMockMessages] = useState([]);
    const [isCreating, setIsCreating] = useState(false);
    const [isChatbotLoading, setIsChatbotLoading] = useState(false);
    
    // Derived context
    const smartAccountAddress = "0xDemoSmartAccount1234567890abcdef12345678";
    const eoaAddress = "0xDemoUser1234567890abcdef1234567890abcdef";
    const chainId = 11155111;
    const provider = {}; 
    const signer = {};
    const env = { ENTRY_POINT: '0x' };
    const trackOp = () => {};
    const financeAgentMessages = mockMessages;
    const setFinanceAgentMessages = setMockMessages;
    const financeAgentHistory = [];
    const setFinanceAgentHistory = () => {};
    
    const isAgentConfigured = mockAgents.length > 0;
    const agentStatus = mockAgents[0];
    const agents = mockAgents;
    const activeAgentAddress = mockActiveAgent;
    const setActiveAgentAddress = setMockActiveAgent;
    const chatbotMessages = mockMessages;
    
    const sendChatbotMessage = (text) => {
        const userMsg = { id: Date.now(), role: 'user', content: text, time: new Date().toLocaleTimeString() };
        setMockMessages(prev => [...prev, userMsg]);
        setIsChatbotLoading(true);
        
        setTimeout(() => {
            let amount = 0;
            const match = text.match(/(\d+(\.\d+)?)/);
            if (match) amount = parseFloat(match[0]);
            
            const currentAgent = agents.find(a => a.agentAddress === activeAgentAddress);
            const limit = currentAgent ? parseFloat(currentAgent.maxAmount) : 0;
            
            let reply = "";
            let newEth = mockBalances.eth;
            let newUsdc = mockBalances.usdc;
            let actionObj = null;
            
            const lowerText = text.toLowerCase();
            const isAave = lowerText.includes('aave') || lowerText.includes('supply') || lowerText.includes('invest');
            const isSwap = lowerText.includes('swap');
            const isEth = /\d+\s*eth/i.test(lowerText);
            const isUsdc = /\d+\s*usdc/i.test(lowerText);
            const actionName = isAave ? 'Supply' : (isSwap ? 'Swap' : 'Transfer');
            const agentScope = isFinancialAgent ? 'financial' : currentAgent?.scope;
            
            if (lowerText.includes("portfolio worth")) {
                const ethVal = mockBalances.eth * 2500;
                const total = ethVal + mockBalances.usdc;
                reply = `💼 **Portfolio Summary**\n\nHere is your current balance:\n- **ETH:** ${mockBalances.eth.toFixed(4)} (~$${ethVal.toFixed(2)})\n- **USDC:** $${mockBalances.usdc.toFixed(2)}\n\n**Total Estimated Value:** $${total.toFixed(2)}`;
            } else if (lowerText.includes("where should i invest") || lowerText.includes("max profit")) {
                reply = `📊 **Market Analysis & Recommendation**\n\nBased on current market trends, ETH is experiencing a slight downtrend today.\n\nI recommend **swapping ETH for USDC** to preserve capital, and then **supplying your USDC to the Aave V3 Yield Pool** where it is currently earning **~4.2% APY**.`;
            } else if (isSwap) {
                if (agentScope !== 'uniswap') {
                    reply = "⚠️ **Scope Error**\n\nI am not configured for swaps. Please configure and select a **Uniswap V3** agent from the top dropdown to execute swaps.";
                } else {
                    const ethAmount = amount || 0.5;
                    if (ethAmount > limit && currentAgent) {
                        reply = `⚠️ **Action Blocked**\n\nI couldn't complete this swap because **${ethAmount} ETH** is higher than the spending limit you gave me.`;
                    } else if (ethAmount > mockBalances.eth) {
                        reply = `⚠️ **Not Enough Funds**\n\nYou only have **${mockBalances.eth.toFixed(4)} ETH**. Please try a smaller amount.`;
                    } else {
                        const usdcGained = ethAmount * 2500;
                        reply = `✅ **Transaction Executed**\n\nI successfully **swapped ${ethAmount} ETH for ${usdcGained.toFixed(2)} USDC** on Uniswap for you! Let me know if you need anything else.`;
                        newEth -= ethAmount;
                        newUsdc += usdcGained;
                        setMockBalances({ eth: newEth, usdc: newUsdc });
                        actionObj = { type: 'success', name: 'Swap', amount: ethAmount, id: Date.now()+1 };
                    }
                }
            } else if (amount > 0) {
                const asset = isEth ? 'ETH' : 'USDC';
                
                if (asset === 'ETH' && agentScope !== 'native') {
                    reply = "⚠️ **Scope Error**\n\nI am not configured for native ETH transfers. Please configure and select a **Native Transfer** agent to execute this transaction.";
                } else if (asset === 'USDC' && agentScope !== 'erc20') {
                    reply = "⚠️ **Scope Error**\n\nI am not configured for USDC transfers. Please configure and select an **ERC-20** agent to execute this transaction.";
                } else if (amount > limit && currentAgent) {
                    reply = `⚠️ **Action Blocked**\n\nI couldn't process this request because **${amount}** exceeds the spending limit you authorized for me.`;
                } else if (asset === 'USDC' && amount > mockBalances.usdc) {
                    reply = `⚠️ **Not Enough Funds**\n\nIt looks like you only have **${mockBalances.usdc.toFixed(2)} USDC**. Try a smaller amount.`;
                } else if (asset === 'ETH' && amount > mockBalances.eth) {
                    reply = `⚠️ **Not Enough Funds**\n\nYou only have **${mockBalances.eth.toFixed(4)} ETH**. Please try a smaller amount.`;
                } else {
                    reply = `✅ **Transaction Executed**\n\nI've successfully ${isAave ? "supplied" : "transferred"} **${amount} ${asset}** for you! The transaction is now complete.`;
                    if (asset === 'ETH') {
                        newEth -= amount;
                    } else {
                        newUsdc -= amount;
                    }
                    setMockBalances({ eth: newEth, usdc: newUsdc });
                    actionObj = { type: 'success', name: actionName, amount, id: Date.now()+1 };
                }
            } else {
                reply = "👋 **I am connected and ready!**\n\nHow can I help you today? Feel free to ask me to execute a transaction or click one of the suggested actions above.";
            }
            
            setMockMessages(prev => [...prev, { id: Date.now()+2, role: 'agent', content: reply, action: actionObj, time: new Date().toLocaleTimeString() }]);
            setIsChatbotLoading(false);
        }, 2500);
    };
    
    const generateAgent = async (scope, limit, name) => "0xAgent" + Math.random().toString(16).slice(2,8);
    const authorizeAgent = async (agent) => {
        setMockAgents(prev => [...prev, agent]);
    };
    const deleteAgent = async () => {};
    const clearAgents = async () => setMockAgents([]);
    const refreshAgents = async () => {};
    const refreshInstalledModules = async () => {};

    const isFinancialAgent = activeAgentAddress === 'financial';
    const activeAgent = isFinancialAgent ? null : agents.find(a => a.agentAddress === activeAgentAddress);
    const [isFinancialLoading, setIsFinancialLoading] = useState(false);
    
    // Derived state
    const messages = isFinancialAgent ? financeAgentMessages : chatbotMessages;
    const isChatLoading = isFinancialAgent ? isFinancialLoading : isChatbotLoading;
    
    const FINANCIAL_API = (import.meta.env.VITE_FINANCIAL_AGENT_URL || 'http://127.0.0.1:3003').replace(/\/$/, '');
    const fmtTime = () => new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const [portfolio, setPortfolio] = useState(null);
    const [prices, setPrices] = useState(null);
    const [aaveMarket, setAaveMarket] = useState(null);

    useEffect(() => {
        const resolvedChainId = Number(chainId) || getDefaultChainId();
        (async () => {
            try {
                const { data } = await axios.get(`${FINANCIAL_API}/api/financial/market/prices?chainId=${resolvedChainId}`);
                setPrices(data.prices);
            } catch {
                setPrices(null);
            }
        })();
    }, [chainId, FINANCIAL_API]);

    useEffect(() => {
        if (!smartAccountAddress) return;
        const resolvedChainId = Number(chainId) || getDefaultChainId();
        (async () => {
            try {
                const { data } = await axios.get(`${FINANCIAL_API}/api/financial/portfolio/${resolvedChainId}/${smartAccountAddress}`);
                setPortfolio(data);
            } catch {
                setPortfolio(null);
            }
        })();
        (async () => {
            try {
                const { data } = await axios.get(`${FINANCIAL_API}/api/financial/aave/${resolvedChainId}/usdc`);
                if (data && !data.error) {
                    data.supplyCap = "12000000000";
                    setAaveMarket(data);
                }
            } catch {
                setAaveMarket(null);
            }
        })();
    }, [smartAccountAddress, chainId, FINANCIAL_API]);

    const sendFinancialMessage = (text) => {
        sendChatbotMessage(text);
    };

    const sendMessage = async (text) => {
        if (isFinancialAgent) {
            await sendFinancialMessage(text);
        } else {
            await sendChatbotMessage(text);
        }
    };

    const [tab, setTab] = useState("setup");
    const [visited, setVisited] = useState(["setup"]);
    
    const [isDeleting, setIsDeleting] = useState(false);
    const [isRevokingAll, setIsRevokingAll] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [config, setConfig] = useState({
        name: '',
        scope: SCOPES[0],
        limit: "0.01",
        validityDays: DEFAULT_AGENT_VALIDITY_DAYS
    });

    useEffect(() => {
        if (isAgentConfigured && agentStatus && !visited.includes("workspace")) {
            const scopeObj = SCOPES.find(s => s.id === agentStatus.scope) || SCOPES[0];
            setConfig({
                name: agentStatus.name || '',
                scope: scopeObj,
                limit: agentStatus.maxAmount,
                validityDays: getRemainingValidityDays(agentStatus.validUntil)
            });
            setVisited(v => [...new Set([...v, "setup", "workspace"])]);
            setTab("workspace");
        }
    }, [isAgentConfigured, agentStatus, visited]);

    const go = (id) => {
        setTab(id);
        setVisited((v) => (v.includes(id) ? v : [...v, id]));
    };

    const handleNewAgent = () => {
        setConfig({
            name: '',
            scope: SCOPES[0],
            limit: "0.01",
            validityDays: DEFAULT_AGENT_VALIDITY_DAYS
        });
        setTab("setup");
        setVisited(v => [...new Set([...v, "setup"])]);
    };

    const handleCreateAssistant = async ({ scopesConfig, validityDays }) => {
        setIsCreating(true);
        setTimeout(async () => {
            const selectedScopes = SCOPES.filter(s => scopesConfig[s.id].enabled);
            for (const scope of selectedScopes) {
                const limit = scopesConfig[scope.id].limit;
                const name = scope.name + " Assistant";
                const addr = await generateAgent(scope.id, limit, name);
                await authorizeAgent({
                    agentAddress: addr,
                    name,
                    scope: scope.id,
                    maxAmount: limit,
                    maxValueWei: "0",
                    validUntil: Math.floor(Date.now() / 1000) + (validityDays * 86400),
                    authorized: true
                });
            }
            setIsCreating(false);
            go("workspace");
        }, 1500);
    };

    const getAgentRule = ({ scope, limit }) => {
        let target = "0x0000000000000000000000000000000000000000";
        let selector = "0x00000000";
        let maxValue = 0n;

        if (scope.id === 'native') {
            target = "0x0000000000000000000000000000000000000000";
            selector = "0x00000000";
            maxValue = ethers.parseEther(limit);
        } else if (scope.id === 'uniswap') {
            target = "0x1e473E7A8C2EB73B744321D4CFD73195B1Ed996F";
            selector = "0x00000000";
            maxValue = ethers.parseEther(limit);
        } else if (scope.id === 'erc20') {
            target = "0x4665ed736379C8B1BeDe411EBcDA607dd4cab96E";
            selector = "0xa9059cbb";
            maxValue = 0n;
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

    const handleSyncAgents = async () => {
        if (!smartAccountAddress || !provider) return;
        setIsSyncing(true);
        try {
            const validatorAddr = env.SESSION_KEY_VALIDATOR;
            if (!validatorAddr) throw new Error("SessionKeyValidator address missing from chain config.");

            const account = new ethers.Contract(smartAccountAddress, SmartAccountABI, provider);
            const moduleInstalled = await account.isModuleInstalled(1, validatorAddr, "0x");
            const activeKeys = moduleInstalled
                ? await getActiveSessionKeysOnChain(validatorAddr, smartAccountAddress, provider)
                : [];

            // Call the chatbot-server sync endpoint directly (not the NestJS backend)
            const CHATBOT_API_URL = import.meta.env.VITE_CHATBOT_API_URL || "";
            await axios.post(`${CHATBOT_API_URL}/api/agent/sync/${smartAccountAddress}`, {
                chainId,
                moduleInstalled,
                activeAgentAddresses: activeKeys.map((key) => key.address)
            });

            await refreshAgents();
            await refreshInstalledModules();

            if (!moduleInstalled) {
                window.dispatchEvent(new CustomEvent("aa-session-key-module-revoked", {
                    detail: { smartAccountAddress, chainId }
                }));
            }
        } catch (e) {
            alert("Failed to sync agents: " + (e.response?.data?.error || e.message));
        } finally {
            setIsSyncing(false);
        }
    };

    const handleDeleteAgent = async (agentAddress) => {
        if (!agentAddress) return;
        const confirmed = window.confirm("Revoke this agent on-chain and remove its signing key from the backend?");
        if (!confirmed) return;
        setIsDeleting(true);
        setTimeout(() => {
            setMockAgents(prev => prev.filter(a => a.agentAddress !== agentAddress));
            if (activeAgentAddress === agentAddress) {
                setMockActiveAgent('financial');
            }
            if (agents.length <= 1) {
                handleNewAgent();
            }
            setIsDeleting(false);
        }, 1000);
    };

    const handleRevokeAllAgents = async () => {
        const confirmed = window.confirm("This uninstalls SessionKeyValidator from your smart account and revokes all AI agents on-chain.");
        if (!confirmed) return;
        setIsRevokingAll(true);
        setTimeout(() => {
            setMockAgents([]);
            setMockMessages([]);
            setMockBalances({ eth: 2.4, usdc: 4700 });
            setMockActiveAgent('financial');
            handleNewAgent();
            setIsRevokingAll(false);
        }, 1500);
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

    const workspaceScope = SCOPES.find(s => s.id === activeAgent?.scope) || config.scope;
    const workspaceLimit = activeAgent?.maxAmount || config.limit;

    return (
        <div style={{ position: 'relative', width: '100%', minHeight: '600px', display: 'flex', flexDirection: 'column' }}>
        <div className="stage" style={{ flex: 1 }}>
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
                            <CreateAssistantStep 
                                onCreate={handleCreateAssistant} 
                                isCreating={isCreating} 
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
                                onSyncAgents={handleSyncAgents}
                                isSyncing={isSyncing}
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
        </div>
    );
}