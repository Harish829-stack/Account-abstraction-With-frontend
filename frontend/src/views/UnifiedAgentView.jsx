import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import SafeMarkdown from '../components/SafeMarkdown';
import { useChatbotContext } from '../context/ChatbotContext';
import { useAppContext } from '../context/AppContext';
import { ethers } from 'ethers';
import { SessionKeyValidatorABI, SmartAccountABI } from '../utils/abis';
import { buildAndSendAccountOp, encodeERC7579Single, encodeERC7579Batch, getActiveSessionKeysOnChain, getPrevValidator } from '../utils/helpers';
import { estimateUserOperationGas, sendUserOperation, getUserOpReceipt, getDynamicGasFees, applyBufferedGasEstimate } from '../utils/bundler';
import { getDefaultChainId } from '../config/chains';
import { getFriendlyErrorMessage } from '../utils/errors';
import { ActionTag } from '../constants/actionTags';
import { useToast } from '../context/ToastContext';
import { useConfirmDialog } from '../components/ConfirmDialog';

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
  { id: "uniswap", emoji: "🦄", name: "Uniswap V3", desc: "Swaps on Arbitrum Sepolia", suggestions: ['Swap 0.001 ETH for USDC', 'Swap 0.001 ETH for USDC 3 times'] },
  { id: "erc20",   emoji: "💸", name: "ERC-20",     desc: "USDC transfers + Aave deposits", suggestions: ['Send 0.5 USDC to 0x1234...', 'Deposit 100 USDC into Aave', 'Send 1 USDC to my friend 3 times'] }
];

const TABS = [
  { id: "setup",     label: "Configure Assistants", step: 1 },
  { id: "workspace", label: "Workspace", step: 2 },
];

const DEFAULT_AGENT_VALIDITY_DAYS = "30";
const SECONDS_PER_DAY = 86400;
const FINANCIAL_CONTEXT_TTL_MS = 15000;

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
  isRevokingAll,
  isFinancialContextRefreshing = false,
  financialContextUpdatedAt = null,
  financialContextError = "",
  onRefreshFinancialContext
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
          {activeAgentAddress === 'financial' && (
            <>
              <span className="pill">
                Balances: {financialContextUpdatedAt ? new Date(financialContextUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Not synced"}
              </span>
              {financialContextError && <span className="pill pill--danger">Sync issue</span>}
              <button
                className="pill pill--action"
                type="button"
                disabled={isFinancialContextRefreshing}
                onClick={onRefreshFinancialContext}
                title="Refresh portfolio, prices, and Aave context for the financial agent"
              >
                {isFinancialContextRefreshing ? "Refreshing..." : "Refresh Balances"}
              </button>
            </>
          )}
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
              <div className="bubble markdown-body"><SafeMarkdown>{m.content}</SafeMarkdown></div>
              <span className="avatar"><UserIcon /></span>
            </div>
          ) : (
            <div className="row row--agent" key={i}>
              <span className="avatar avatar--bot"><BotIcon size={15} /></span>
              <div className="stack">
                <div className="bubble markdown-body"><SafeMarkdown>{m.content}</SafeMarkdown></div>
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

export default function UnifiedAgentView() {
    const toast = useToast();
    const [confirmAction, confirmDialog] = useConfirmDialog();
    const {
        isAgentConfigured,
        agentStatus,
        agents,
        activeAgentAddress: rawActiveAgentAddress,
        setActiveAgentAddress,
        messages: chatbotMessages,
        sendMessage: sendChatbotMessage,
        generateAgent,
        authorizeAgent,
        deleteAgent,
        clearAgents,
        refreshAgents,
        isChatLoading: isChatbotLoading
    } = useChatbotContext();
    const { 
        smartAccountAddress, provider, signer, eoaAddress, env, chainId, 
        refreshInstalledModules, trackOp, refreshLightData, refreshTrigger,
        financeAgentMessages, setFinanceAgentMessages, 
        financeAgentHistory, setFinanceAgentHistory
    } = useAppContext();

    const activeAgentAddress = rawActiveAgentAddress || 'financial';
    const isFinancialAgent = activeAgentAddress === 'financial';
    
    const [isFinancialLoading, setIsFinancialLoading] = useState(false);
    
    // Derived state
    const messages = isFinancialAgent ? financeAgentMessages : chatbotMessages;
    const isChatLoading = isFinancialAgent ? isFinancialLoading : isChatbotLoading;
    const activeAgent = isFinancialAgent ? null : agents.find(a => a.agentAddress === activeAgentAddress);
    
    const FINANCIAL_API = (import.meta.env.VITE_FINANCIAL_AGENT_URL || 'http://127.0.0.1:3003').replace(/\/$/, '');

    const fmtTime = () => new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const [portfolio, setPortfolio] = useState(null);
    const [prices, setPrices] = useState(null);
    const [aaveMarket, setAaveMarket] = useState(null);
    const [isFinancialContextRefreshing, setIsFinancialContextRefreshing] = useState(false);
    const [financialContextUpdatedAt, setFinancialContextUpdatedAt] = useState(null);
    const [financialContextError, setFinancialContextError] = useState("");
    const financialContextRef = useRef({ portfolio: null, prices: null, aaveMarket: null });
    const financialContextInFlightRef = useRef(null);
    const financialContextFetchedAtRef = useRef(0);
    const refreshLightDataRef = useRef(refreshLightData);

    useEffect(() => {
        financialContextRef.current = { portfolio, prices, aaveMarket };
    }, [portfolio, prices, aaveMarket]);

    useEffect(() => {
        refreshLightDataRef.current = refreshLightData;
    }, [refreshLightData]);

    const loadFinancialContext = useCallback(async ({ force = false, includePlatformRefresh = false } = {}) => {
        const now = Date.now();
        if (!smartAccountAddress) return financialContextRef.current;
        if (financialContextInFlightRef.current) return financialContextInFlightRef.current;
        if (!force && now - financialContextFetchedAtRef.current < FINANCIAL_CONTEXT_TTL_MS) {
            return financialContextRef.current;
        }

        const resolvedChainId = Number(chainId) || getDefaultChainId();
        financialContextInFlightRef.current = (async () => {
            setIsFinancialContextRefreshing(true);
            setFinancialContextError("");

            if (includePlatformRefresh && refreshLightDataRef.current) {
                await refreshLightDataRef.current({ force: true }).catch((error) => {
                    console.warn("Platform balance refresh failed before financial context sync:", error);
                });
            }

            const next = { ...financialContextRef.current };
            try {
                const [portfolioRes, pricesRes, aaveRes] = await Promise.allSettled([
                    axios.get(`${FINANCIAL_API}/api/financial/portfolio/${resolvedChainId}/${smartAccountAddress}`),
                    axios.get(`${FINANCIAL_API}/api/financial/market/prices?chainId=${resolvedChainId}`),
                    axios.get(`${FINANCIAL_API}/api/financial/aave/${resolvedChainId}/usdc`)
                ]);

                if (portfolioRes.status === "fulfilled") {
                    next.portfolio = portfolioRes.value.data;
                    setPortfolio(next.portfolio);
                }

                if (pricesRes.status === "fulfilled") {
                    next.prices = pricesRes.value.data.prices;
                    setPrices(next.prices);
                }

                if (aaveRes.status === "fulfilled" && aaveRes.value.data && !aaveRes.value.data.error) {
                    next.aaveMarket = { ...aaveRes.value.data, supplyCap: "12000000000" };
                    setAaveMarket(next.aaveMarket);
                }

                const failed = [portfolioRes, pricesRes, aaveRes].some((result) => result.status === "rejected");
                if (failed) {
                    setFinancialContextError("Some financial data could not be refreshed.");
                }

                const refreshedAt = Date.now();
                financialContextFetchedAtRef.current = refreshedAt;
                setFinancialContextUpdatedAt(refreshedAt);
                financialContextRef.current = next;
                return next;
            } finally {
                setIsFinancialContextRefreshing(false);
                financialContextInFlightRef.current = null;
            }
        })();

        return financialContextInFlightRef.current;
    }, [FINANCIAL_API, chainId, smartAccountAddress]);

    useEffect(() => {
        if (!smartAccountAddress) return;
        void loadFinancialContext({ force: true });
    }, [smartAccountAddress, chainId, refreshTrigger, loadFinancialContext]);

    const sendFinancialMessage = async (text) => {
        const userMsg = { id: Date.now(), role: 'user', content: text, time: fmtTime(), toolCalls: [] };
        setFinanceAgentMessages(prev => [...prev, userMsg]);
        setIsFinancialLoading(true);
        const newHistory = [...financeAgentHistory, { role: 'user', content: text }];
        try {
            const latestContext = await loadFinancialContext();
            const latestPortfolio = latestContext.portfolio || portfolio;
            const latestPrices = latestContext.prices || prices;
            const latestAaveMarket = latestContext.aaveMarket || aaveMarket;
            const { data } = await axios.post(`${FINANCIAL_API}/api/financial/chat`, {
                message: text,
                smartAccountAddress,
                chainId: Number(chainId) || getDefaultChainId(),
                userId: eoaAddress,
                conversationHistory: newHistory.slice(-10),
                liveContext: {
                    smartAccountAddress,
                    portfolioBalances: latestPortfolio?.assets,
                    totalPortfolioValueUsd: latestPortfolio?.totalValueUsd,
                    aaveSupplyApy: latestAaveMarket?.supplyApyPercentage,
                    ethPriceUsd: latestPrices?.ETH_USD?.priceUsd,
                    ethTrend: latestPrices?.ETH_USD?.priceChange24h > 0 ? 'rising' : 'crashing',
                    allMarketPrices: latestPrices
                }
            });
            const agentMsg = {
                id: Date.now() + 1,
                role: 'agent',
                content: data.reply || "No response received.",
                time: fmtTime(),
                toolCalls: data.toolCalls || []
            };
            setFinanceAgentMessages(prev => [...prev, agentMsg]);
            setFinanceAgentHistory([...newHistory, { role: 'assistant', content: data.reply }]);
            
            if (data.portfolio) setPortfolio(data.portfolio);
            if (data.marketPrices) setPrices(data.marketPrices);
            if (data.aaveMarket) setAaveMarket(data.aaveMarket);
        } catch (error) {
            console.error("Financial agent request failed:", error);
            setFinanceAgentMessages(prev => [...prev, {
                id: Date.now() + 2,
                role: 'agent',
                content: getFriendlyErrorMessage(error, "Sorry, I could not refresh the latest financial context. Please try again."),
                time: fmtTime()
            }]);
        } finally {
            setIsFinancialLoading(false);
        }
    };

    const sendMessage = async (text) => {
        if (isFinancialAgent) {
            await sendFinancialMessage(text);
        } else {
            await sendChatbotMessage(text);
        }
    };

    const handleRefreshFinancialContext = async () => {
        await loadFinancialContext({ force: true, includePlatformRefresh: true });
    };

    const [tab, setTab] = useState("setup");
    const [visited, setVisited] = useState(["setup"]);
    
    const [isCreating, setIsCreating] = useState(false);
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
        const parsedValidityDays = Number(validityDays || DEFAULT_AGENT_VALIDITY_DAYS);
        if (!Number.isFinite(parsedValidityDays) || parsedValidityDays < 1 || parsedValidityDays > 365) {
            toast.error("Assistant access duration must be between 1 and 365 days.");
            return;
        }
        
        const selectedScopes = SCOPES.filter(s => scopesConfig[s.id].enabled);
        if (selectedScopes.length === 0) return;

        setIsCreating(true);
        try {
            // 1. Generate keys from backend for all selected scopes
            const genAgents = [];
            for (const scope of selectedScopes) {
                const limit = scopesConfig[scope.id].limit;
                const name = `${scope.name} Assistant`;
                const addr = await generateAgent(scope.id, limit, name);
                genAgents.push({
                    agentAddress: addr,
                    name,
                    scope,
                    limit,
                    validityDays: String(Math.floor(parsedValidityDays))
                });
            }

            // 2. Build Authorize UserOp
            const SESSION_KEY_VALIDATOR = env.SESSION_KEY_VALIDATOR;
            if (!SESSION_KEY_VALIDATOR) throw new Error("SessionKeyValidator address missing from chain config.");
            const validUntil = Math.floor(Date.now() / 1000) + (Math.floor(parsedValidityDays) * SECONDS_PER_DAY);

            const allKeyData = [];
            for (const gen of genAgents) {
                const { target, selector, maxValue } = getAgentRule({ scope: gen.scope, limit: gen.limit });
                gen.target = target;
                gen.selector = selector;
                gen.maxValue = maxValue;
                allKeyData.push([gen.agentAddress, target, selector, maxValue, 0, validUntil, 0]);
            }

            const accountContract = new ethers.Contract(smartAccountAddress, SmartAccountABI, provider);
            const isInstalled = await accountContract.isModuleInstalled(1, SESSION_KEY_VALIDATOR, "0x");

            let callData;
            if (!isInstalled) {
                const coder = new ethers.AbiCoder();
                const initData = coder.encode(
                    ["tuple(address sessionKey, address target, bytes4 selector, uint256 maxValue, uint48 validAfter, uint48 validUntil, uint256 maxUses)[]"],
                    [allKeyData]
                );
                const accountIface = new ethers.Interface(SmartAccountABI);
                callData = accountIface.encodeFunctionData("installModule", [1, SESSION_KEY_VALIDATOR, initData]);
            } else {
                const validatorIface = new ethers.Interface(SessionKeyValidatorABI);
                const innerCalls = allKeyData.map(keyData => 
                    validatorIface.encodeFunctionData("addSessionKey", [keyData])
                );
                const batchedData = encodeERC7579Batch(
                    innerCalls.map(() => SESSION_KEY_VALIDATOR),
                    innerCalls.map(() => 0n),
                    innerCalls
                );
                callData = batchedData;
            }

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
            trackOp(returnedHash, 'Batch Create AI Assistants', { calldata: userOp.callData, tags: [ActionTag.SESSION_KEY] });

            const receipt = await waitForReceipt(returnedHash);

            if (receipt && receipt.success) {
                for (const gen of genAgents) {
                    const authorizedAgent = {
                        agentAddress: gen.agentAddress,
                        name: gen.name,
                        scope: gen.scope.id,
                        maxAmount: gen.limit,
                        maxValueWei: gen.maxValue.toString(),
                        target: gen.target,
                        selector: gen.selector,
                        validAfter: 0,
                        validUntil,
                        txHashInstall: returnedHash,
                        authorized: true
                    };
                    await authorizeAgent(authorizedAgent);
                }
                go("workspace");
            } else {
                toast.error("Assistant creation failed or timed out. Please try again.");
            }
        } catch (e) {
            console.error("Assistant creation failed:", e);
            toast.error(getFriendlyErrorMessage(e, "We could not create the assistant. Please check your wallet and try again."));
        } finally {
            setIsCreating(false);
        }
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
            if (!env.UNISWAP_ROUTER) throw new Error("Uniswap router address missing from chain config.");
            target = env.UNISWAP_ROUTER;
            selector = "0x00000000";
            maxValue = ethers.parseEther(limit);
        } else if (scope.id === 'erc20') {
            if (!env.USDC_TOKEN) throw new Error("USDC token address missing from chain config.");
            // ERC-20 scope supports USDC transfer and Aave approve+deposit batches.
            // The current on-chain validator has one target/selector slot, so this
            // scope is zero-native-value limited rather than target-selector limited.
            target = "0x0000000000000000000000000000000000000000";
            selector = "0x00000000";
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
            console.error("Agent sync failed:", e);
            toast.error(getFriendlyErrorMessage(e, "We could not sync agents right now. Please try again."));
        } finally {
            setIsSyncing(false);
        }
    };

    const handleDeleteAgent = async (agentAddress) => {
        if (!agentAddress) return;
        const confirmed = await confirmAction({
            title: "Revoke assistant?",
            message: "This revokes the assistant on-chain and removes its signing key from the backend.",
            confirmLabel: "Revoke assistant",
            danger: true,
        });
        if (!confirmed) return;
        setIsDeleting(true);
        try {
            const validatorAddr = env.SESSION_KEY_VALIDATOR;
            if (!validatorAddr) throw new Error("SessionKeyValidator address missing from chain config.");

            const skValidator = new ethers.Contract(validatorAddr, SessionKeyValidatorABI, provider);
            const innerCall = skValidator.interface.encodeFunctionData("revokeSessionKey", [agentAddress]);
            const callData = encodeERC7579Single(validatorAddr, 0n, innerCall);
            const opHash = await buildAndSendAccountOp(signer, provider, smartAccountAddress, callData, env.ENTRY_POINT, env.K1_VALIDATOR, chainId);
            trackOp(opHash, 'Revoke AI Agent', { calldata: callData, tags: [ActionTag.SESSION_KEY] });

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
            console.error("Agent revoke failed:", e);
            toast.error(getFriendlyErrorMessage(e, "We could not revoke this agent. Please check your wallet and try again."));
        } finally {
            setIsDeleting(false);
        }
    };

    const handleRevokeAllAgents = async () => {
        const confirmed = await confirmAction({
            title: "Revoke all assistants?",
            message: "This uninstalls the session-key validator and revokes every AI assistant on-chain.",
            confirmLabel: "Revoke all",
            danger: true,
        });
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
            trackOp(opHash, 'Revoke All AI Agents', { calldata: callData, tags: [ActionTag.SESSION_KEY] });

            const receipt = await waitForReceipt(opHash);
            if (!receipt?.success) throw new Error("Revoke all agents failed or timed out.");

            await clearAgents({ txHashRevoke: opHash });
            window.dispatchEvent(new CustomEvent("aa-session-key-module-revoked", {
                detail: { smartAccountAddress, chainId, txHashRevoke: opHash }
            }));
            await refreshInstalledModules();
            handleNewAgent();
        } catch (e) {
            console.error("Revoke all agents failed:", e);
            toast.error(getFriendlyErrorMessage(e, "We could not revoke all agents. Please check your wallet and try again."));
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

    const workspaceScope = SCOPES.find(s => s.id === activeAgent?.scope) || config.scope;
    const workspaceLimit = activeAgent?.maxAmount || config.limit;

    return (
        <div className="stage">
          {confirmDialog}
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
                                isFinancialContextRefreshing={isFinancialContextRefreshing}
                                financialContextUpdatedAt={financialContextUpdatedAt}
                                financialContextError={financialContextError}
                                onRefreshFinancialContext={handleRefreshFinancialContext}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
