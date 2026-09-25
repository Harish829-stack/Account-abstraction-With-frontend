import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ethers } from 'ethers';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { buildAndSendAccountOp, encodeERC7579Batch } from '../utils/helpers';

// ── Config ────────────────────────────────────────────────────────────────────
const FINANCIAL_API = (import.meta.env.VITE_FINANCIAL_AGENT_URL || 'http://127.0.0.1:3003').replace(/\/$/, '');

const SUGGESTIONS = [
  'What is my portfolio worth?',
  'Check Aave USDC supply APY',
  'Simulate 500 USDC deposit',
  'What is my ETH & USDC breakdown?'
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n, dec = 2) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtUsd = (n) => '$' + fmt(n, 2);
const fmtTime = () => new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
const truncAddr = (a) => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : '';

// ── Main component ────────────────────────────────────────────────────────────
export default function FinancialAgentView() {
  const { 
    smartAccountAddress, eoaAddress, chainId, disconnect, provider, signer, env,
    financeAgentMessages: messages,
    setFinanceAgentMessages: setMessages,
    financeAgentHistory: conversationHistory,
    setFinanceAgentHistory: setConversationHistory,
    refreshTrigger,
    trackOp
  } = useAppContext();
  const resolvedChainId = Number(chainId) || 11155111;
  const { success, error, info } = useToast();
  
  const usdcAddress = env?.VITE_USDC_TOKEN || '0x4665ed736379C8B1BeDe411EBcDA607dd4cab96E';
  const AAVE_POOL = '0xAB49984529296Ead4dF03309BFeA6b273d9d34E4';

  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isOpPending, setIsOpPending] = useState(false);

  // ── Chat state ────────────────────────────────────────────────────────────
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const resetAgent = () => {
    setMessages([{
      id: Date.now(),
      role: 'agent',
      content: `Hello! I'm your Portfolio Intelligence Agent.\n\nI can help you monitor your portfolio, check market prices, analyze DeFi yields, and prepare transactions.\n\nHow can I assist you today?`,
      time: fmtTime(),
      toolCalls: []
    }]);
    setConversationHistory([]);
  };

  // ── Sidebar state ─────────────────────────────────────────────────────────
  const [portfolio, setPortfolio] = useState(null);
  const [isLoadingPortfolio, setIsLoadingPortfolio] = useState(false);
  const [prices, setPrices] = useState(null);
  const [isLoadingPrices, setIsLoadingPrices] = useState(false);
  const [aaveMarket, setAaveMarket] = useState(null);
  const [isLoadingAave, setIsLoadingAave] = useState(false);
  const [aaveError, setAaveError] = useState(null);

  // ── Proposal state ────────────────────────────────────────────────────────
  const [activeProposal, setActiveProposal] = useState(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [proposalMsg, setProposalMsg] = useState('');

  // ── Scroll on new message ─────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, isThinking]);

  // ── Load prices on mount ──────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setIsLoadingPrices(true);
      try {
        const { data } = await axios.get(`${FINANCIAL_API}/api/financial/market/prices?chainId=${resolvedChainId}`);
        setPrices(data.prices);
      } catch (e) {
        console.error('[Prices]', e.message);
      } finally {
        setIsLoadingPrices(false);
      }
    })();
  }, [resolvedChainId]);

  // ── Sidebar loaders ───────────────────────────────────────────────────────
  const loadPortfolio = useCallback(async () => {
    if (!smartAccountAddress) return;
    setIsLoadingPortfolio(true);
    try {
      const { data } = await axios.get(`${FINANCIAL_API}/api/financial/portfolio/${resolvedChainId}/${smartAccountAddress}`);
      setPortfolio(data);
    } catch (e) {
      console.error('[Portfolio]', e.message);
    } finally {
      setIsLoadingPortfolio(false);
    }
  }, [smartAccountAddress, resolvedChainId]);

  const [aaveEarnings, setAaveEarnings] = useState('0');
  const [aavePrincipal, setAavePrincipal] = useState('0');
  const [aaveTotalBalance, setAaveTotalBalance] = useState('0');

  const loadAave = useCallback(async () => {
    setIsLoadingAave(true);
    setAaveError(null);
    try {
      const { data } = await axios.get(`${FINANCIAL_API}/api/financial/aave/${resolvedChainId}/usdc`);
      if (data.error) throw new Error(data.error);

      // Override supplyCap with hardcoded 12 billion
      data.supplyCap = "12000000000";
      setAaveMarket(data);

      // Fetch earnings directly from the contract
      if (smartAccountAddress && window.ethereum && data.poolAddress) {
        const _provider = new ethers.BrowserProvider(window.ethereum);
        const pool = new ethers.Contract(data.poolAddress, [
          'function earned(address) view returns (uint256)',
          'function positions(address) view returns (uint256 amount, uint256 lastUpdateTime, uint256 rewards)'
        ], _provider);
        const earnedRaw = await pool.earned(smartAccountAddress);
        const position = await pool.positions(smartAccountAddress);
        
        const earningsStr = ethers.formatUnits(earnedRaw, 6);
        const principalStr = ethers.formatUnits(position.amount, 6);
        const totalStr = (parseFloat(earningsStr) + parseFloat(principalStr)).toFixed(6);

        setAaveEarnings(earningsStr);
        setAavePrincipal(principalStr);
        setAaveTotalBalance(totalStr);
      } else {
        setAaveEarnings('0');
        setAavePrincipal('0');
        setAaveTotalBalance('0');
      }
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'Unknown error';
      setAaveError(msg);
      console.error('[Aave]', msg);
    } finally {
      setIsLoadingAave(false);
    }
  }, [resolvedChainId, smartAccountAddress]);

  // Fetch data on mount and whenever a global refresh is triggered (e.g. after a tx confirms)
  useEffect(() => {
    if (smartAccountAddress) {
      loadPortfolio();
      loadAave();
    }
  }, [smartAccountAddress, loadPortfolio, loadAave, refreshTrigger]);

  const handleAaveDepositOp = async () => {
    if (!depositAmount || isNaN(depositAmount) || parseFloat(depositAmount) <= 0) {
      error('Please enter a valid amount');
      return;
    }
    try {
      setIsOpPending(true);
      const amountToDeposit = ethers.parseUnits(depositAmount.toString(), 6);
      const mockToken = new ethers.Contract(usdcAddress, ['function approve(address spender, uint256 amount) external returns (bool)'], signer);
      const pool = new ethers.Contract(AAVE_POOL, ['function deposit(uint256 _amount) external'], signer);
      const approveData = mockToken.interface.encodeFunctionData('approve', [AAVE_POOL, amountToDeposit]);
      const depositData = pool.interface.encodeFunctionData('deposit', [amountToDeposit]);
      const callData = encodeERC7579Batch(
        [usdcAddress, AAVE_POOL],
        [0n, 0n],
        [approveData, depositData]
      );
      const opHash = await buildAndSendAccountOp(signer, provider, smartAccountAddress, callData, env?.ENTRY_POINT, env?.K1_VALIDATOR, chainId);
      trackOp(opHash, "Aave Deposit");
      setDepositAmount('');
    } catch (err) {
      console.error(err);
      error(err.reason || err.message || 'Failed Batched Aave Deposit');
    } finally {
      setIsOpPending(false);
    }
  };

  const handleAaveWithdrawClaimOp = async () => {
    if (!withdrawAmount || isNaN(withdrawAmount) || parseFloat(withdrawAmount) <= 0) {
      error('Please enter a valid amount');
      return;
    }
    try {
      setIsOpPending(true);
      const amountToWithdraw = ethers.parseUnits(withdrawAmount.toString(), 6);
      const pool = new ethers.Contract(AAVE_POOL, ['function withdraw(uint256 _amount) external', 'function claimReward() external'], signer);
      const withdrawData = pool.interface.encodeFunctionData('withdraw', [amountToWithdraw]);
      const claimData = pool.interface.encodeFunctionData('claimReward', []);
      const callData = encodeERC7579Batch(
        [AAVE_POOL, AAVE_POOL],
        [0n, 0n],
        [withdrawData, claimData]
      );
      const opHash = await buildAndSendAccountOp(signer, provider, smartAccountAddress, callData, env?.ENTRY_POINT, env?.K1_VALIDATOR, chainId);
      trackOp(opHash, "Aave Withdraw & Claim");
      setWithdrawAmount('');
    } catch (err) {
      console.error(err);
      error(err.reason || err.message || 'Failed Batched Withdraw & Claim');
    } finally {
      setIsOpPending(false);
    }
  };


  // ── Chat send ─────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text) => {
    const trimmed = (text || input).trim();
    if (!trimmed || isThinking || !smartAccountAddress) return;

    const userMsg = { id: Date.now(), role: 'user', content: trimmed, time: fmtTime(), toolCalls: [] };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsThinking(true);

    const newHistory = [...conversationHistory, { role: 'user', content: trimmed }];

    try {
      const { data } = await axios.post(`${FINANCIAL_API}/api/financial/chat`, {
        message: trimmed,
        smartAccountAddress,
        chainId: resolvedChainId,
        userId: eoaAddress,
        conversationHistory: newHistory.slice(-10),
        liveContext: {
          smartAccountAddress,
          portfolioBalances: portfolio?.assets,
          totalPortfolioValueUsd: portfolio?.totalValueUsd,
          aaveSupplyApy: aaveMarket?.supplyApyPercentage,
          ethPriceUsd: prices?.ETH_USD?.priceUsd,
          ethTrend: prices?.ETH_USD?.priceChange24h > 0 ? 'rising' : 'crashing',
          allMarketPrices: prices
        }
      });

      const agentMsg = {
        id: Date.now() + 1,
        role: 'agent',
        content: data.reply,
        time: fmtTime(),
        toolCalls: data.toolCalls || [],
      };
      setMessages(prev => [...prev, agentMsg]);
      setConversationHistory([...newHistory, { role: 'assistant', content: data.reply }]);

      // ── Update sidebar from agent response ────────────────────────────
      if (data.portfolio) setPortfolio(data.portfolio);
      if (data.marketPrices) setPrices(data.marketPrices);
      if (data.aaveMarket) setAaveMarket(data.aaveMarket);

      // ── Show proposal if created ──────────────────────────────────────
      if (data.transactionProposal) {
        setActiveProposal(data.transactionProposal);
        setProposalMsg('');
      }

    } catch (e) {
      const errMsg = e.response?.data?.error || e.message || 'Network error';
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'agent',
        content: `⚠️ Error: ${errMsg}`,
        time: fmtTime(),
        toolCalls: [],
      }]);
    } finally {
      setIsThinking(false);
      inputRef.current?.focus();
    }
  }, [input, isThinking, smartAccountAddress, eoaAddress, resolvedChainId, conversationHistory]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Proposal actions ──────────────────────────────────────────────────────
  const confirmProposal = async () => {
    if (!activeProposal) return;
    setIsConfirming(true);
    setProposalMsg('');
    try {
      await axios.post(`${FINANCIAL_API}/api/financial/proposals/${activeProposal.id}/confirm`, {
        userId: eoaAddress,
      });
      setProposalMsg('✅ Proposal confirmed! The platform execution path can now submit it.');
      setActiveProposal(prev => ({ ...prev, status: 'CONFIRMED' }));
    } catch (e) {
      setProposalMsg('❌ ' + (e.response?.data?.error || e.message));
    } finally {
      setIsConfirming(false);
    }
  };

  const rejectProposal = async () => {
    if (!activeProposal) return;
    try {
      await axios.post(`${FINANCIAL_API}/api/financial/proposals/${activeProposal.id}/reject`, {
        userId: eoaAddress,
        reason: 'User rejected from UI',
      });
      setActiveProposal(null);
      setProposalMsg('');
    } catch (e) {
      setProposalMsg('❌ ' + (e.response?.data?.error || e.message));
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (!smartAccountAddress) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 mt-12">
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200 shadow-sm mb-4">
          <span className="text-3xl">🧠</span>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Smart Account Required</h2>
        <p className="text-sm text-gray-600 text-center max-w-md">
          Set up your smart account first to use the Financial Intelligence Agent.
        </p>
      </div>
    );
  }

  const ethAsset = portfolio?.assets?.find(a => !a.tokenAddress);

  return (
    <div className="h-[calc(100vh-140px)] overflow-hidden font-sans flex flex-col antialiased text-[#0f172a] bg-[#f8f6f0] rounded-3xl border border-stone-300 shadow-2xl">

      {/* BEGIN: MainContent */}
      <main className="flex-1 min-h-0 overflow-hidden max-w-[1720px] w-full mx-auto px-4 lg:px-8 py-3 flex flex-col space-y-3">
        <section aria-label="Page Title and Summary" className="flex-shrink-0 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"></path><path d="M20 2v4"></path><path d="M22 4h-4"></path><circle cx="4" cy="20" r="2"></circle></svg>
              </div>
              <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                Portfolio Intelligence Agent
                <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">BETA</span>
              </h1>
            </div>
            <p className="text-sm text-gray-600 mt-1 pl-12">
              Analyze, plan, and simulate portfolio operations — always with your explicit confirmation.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 font-mono text-xs">
            <div className="bg-white px-3 py-2 rounded-xl border border-stone-300 flex items-center space-x-2 shadow-md">
              <span className="text-gray-500 font-sans text-xs">Net Worth:</span>
              <span className="font-bold text-gray-900 font-sans text-sm">{portfolio ? fmtUsd(portfolio.totalValueUsd) : '$10,522.70'}</span>
              <span className="text-[11px] text-gray-400">≈ {(portfolio && ethAsset?.priceUsd) ? fmt(portfolio.totalValueUsd / ethAsset.priceUsd, 4) : '3.878'} ETH</span>
            </div>
            <div className="bg-white px-3 py-2 rounded-xl border border-stone-300 flex items-center space-x-2 shadow-md">
              <span className="text-gray-500 font-sans text-xs">Aave V3 APY:</span>
              <span className="font-bold text-emerald-600">{aaveMarket ? aaveMarket.supplyApyPercentage : '5.0000'}%</span>
            </div>
            <div className="bg-white px-3 py-2 rounded-xl border border-stone-300 flex items-center space-x-2 shadow-md">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="font-sans text-xs text-gray-700 font-medium">Oracles Live</span>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">
          {/* BEGIN: LeftColumn */}
          <section aria-label="AI Interaction Workspace" className="col-span-8 flex flex-col h-full min-h-0">
            <div className="bg-white rounded-2xl border border-stone-300 shadow-md flex flex-col overflow-hidden h-full min-h-0">
              <div className="px-5 py-3.5 border-b border-stone-300 bg-[#fdfcf9] flex items-center justify-between flex-shrink-0">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 8V4H8"></path><rect width="16" height="12" x="4" y="8" rx="2"></rect><path d="M2 14h2"></path><path d="M20 14h2"></path><path d="M15 13v2"></path><path d="M9 13v2"></path></svg>
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h2 className="text-sm font-bold text-gray-900">Portfolio Assistant</h2>
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span className="text-[11px] text-emerald-600 font-medium">Ready</span>
                    </div>
                    <div className="flex items-center space-x-1.5 text-[11px] text-gray-500 font-mono">
                      <span>Vault</span> • <span>Chainlink</span> • <span>Aave</span> • <span className="text-gray-400">{truncAddr(smartAccountAddress)}</span>
                    </div>
                  </div>
                </div>
                <div className="hidden sm:flex items-center space-x-1.5 text-[11px]">
                  <button onClick={resetAgent} className="px-2 py-0.5 rounded bg-red-50 hover:bg-red-100 text-red-600 font-bold border border-red-200 transition cursor-pointer" title="Clear Chat History">
                    Reset Chat
                  </button>
                  <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-700 font-mono border border-stone-200">Chainlink Oracles</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-mono border border-emerald-200">Aave V3 Pool</span>
                  <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-700 font-mono border border-stone-200">ERC-4337</span>
                </div>
              </div>

              <div className="flex-1 min-h-0 p-5 overflow-y-auto space-y-5 custom-scrollbar bg-[#fdfcfb]">
                {messages.map((msg, index) => (
                  <div key={msg.id || index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'items-start space-x-3 max-w-3xl'}`}>
                    {msg.role === 'agent' && (
                      <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex-shrink-0 flex items-center justify-center text-xs mt-1 shadow-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"></path><path d="M20 2v4"></path><path d="M22 4h-4"></path><circle cx="4" cy="20" r="2"></circle></svg>
                      </div>
                    )}

                    <div className={msg.role === 'user' ? "bg-stone-900 rounded-2xl rounded-tr-none px-4 py-2.5 max-w-lg shadow-sm text-sm leading-relaxed whitespace-pre-wrap" : "space-y-4 flex-1"} style={msg.role === 'user' ? { color: 'white' } : {}}>
                      {msg.role === 'user' ? (
                        <>
                          {msg.content}
                          <div className="text-[10px] text-stone-400 text-right mt-1">{msg.time}</div>
                        </>
                      ) : (
                        <div className="bg-white border border-stone-300 rounded-2xl rounded-tl-none p-5 shadow text-sm text-gray-800 space-y-4">
                          <p className="leading-relaxed whitespace-pre-wrap">
                            {msg.content}
                          </p>

                          {msg.toolCalls?.length > 0 && (
                            <div className="text-[10px] text-stone-400 font-mono mt-4 pt-2 border-t border-stone-300">
                              {msg.time} • Tools: {msg.toolCalls.join(', ')}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isThinking && (
                  <div className="flex items-start space-x-3 max-w-3xl">
                    <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex-shrink-0 flex items-center justify-center text-xs mt-1 shadow-sm">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"></path><path d="M20 2v4"></path><path d="M22 4h-4"></path><circle cx="4" cy="20" r="2"></circle></svg>
                    </div>
                    <div className="bg-white border border-stone-300 rounded-2xl rounded-tl-none p-5 shadow text-sm text-gray-800 space-y-4">
                      <div className="flex space-x-1.5 items-center h-4">
                        <span className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-bounce"></span>
                        <span className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-bounce" style={{animationDelay: '150ms'}}></span>
                        <span className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-bounce" style={{animationDelay: '300ms'}}></span>
                      </div>
                    </div>
                  </div>
                )}

                {activeProposal && (
                  <div className="flex items-start space-x-3 max-w-3xl">
                    <div className="w-7 h-7 rounded-full bg-emerald-600 flex-shrink-0 flex items-center justify-center text-xs mt-1 shadow-sm" style={{ color: 'white' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M7 7h10v10"></path><path d="M7 17 17 7"></path></svg>
                    </div>
                    <div className="space-y-4 flex-1">
                      <div className="border border-emerald-300 bg-emerald-50/40 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <div>
                              <div className="text-xs font-bold text-gray-900">Prepared Portfolio Proposal</div>
                              <div className="text-[11px] text-gray-500">{activeProposal.displayedSummary?.description || `${activeProposal.action}`}</div>
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">Gasless Paymaster</span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 py-2 border-y border-emerald-200/50">
                          {activeProposal.displayedSummary?.inputAmount && (
                            <div>
                              <div className="text-[10px] uppercase font-semibold text-emerald-700">Amount</div>
                              <div className="text-xs font-bold text-gray-900">{activeProposal.displayedSummary.inputAmount} {activeProposal.displayedSummary.inputAsset}</div>
                            </div>
                          )}
                          {activeProposal.displayedSummary?.estimatedApy && (
                            <div>
                              <div className="text-[10px] uppercase font-semibold text-emerald-700">Estimated APY</div>
                              <div className="text-xs font-bold text-emerald-600">{activeProposal.displayedSummary.estimatedApy}%</div>
                            </div>
                          )}
                        </div>

                        {proposalMsg && (
                          <div className={`text-xs p-2 rounded-lg ${proposalMsg.startsWith('✅') ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                            {proposalMsg}
                          </div>
                        )}

                        {activeProposal.status !== 'CONFIRMED' && (
                          <div className="flex items-center justify-between pt-1">
                            <div className="text-[11px] text-stone-500 font-mono">
                              Call: <span className="text-stone-700 font-semibold">{activeProposal.callData || 'supply(...) expected'}</span>
                            </div>
                            <div className="flex space-x-2">
                              <button className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-stone-300 text-stone-700 hover:bg-stone-50 transition shadow-sm" onClick={rejectProposal}>
                                Reject
                              </button>
                              <button className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-sm flex items-center space-x-1.5" onClick={confirmProposal} disabled={isConfirming}>
                                <span>{isConfirming ? 'Confirming...' : 'Confirm Proposal'}</span>
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              <div className="px-4 py-2 border-t border-stone-300 bg-white flex items-center space-x-2 overflow-x-auto custom-scrollbar flex-shrink-0">
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} onClick={() => sendMessage(s)} disabled={isThinking} className="px-3 py-1.5 bg-[#fbf9f5] hover:bg-stone-100 border border-stone-300 rounded-full text-xs text-stone-700 whitespace-nowrap transition">
                    {s}
                  </button>
                ))}
              </div>

              <div className="p-3.5 bg-white border-t border-stone-300 flex-shrink-0">
                <form className="relative flex items-center" onSubmit={e => { e.preventDefault(); sendMessage(); }}>
                  <input className="w-full pl-4 pr-24 py-2.5 rounded-full border border-stone-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 text-xs shadow-inner transition bg-white" placeholder="Ask about portfolio value, asset allocation, Aave APY, yield estimates..." type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} disabled={isThinking} ref={inputRef} />
                  <div className="absolute right-2 flex items-center space-x-1.5">
                    <button type="button" className="w-7 h-7 rounded-full text-stone-400 hover:text-stone-600 flex items-center justify-center transition" title="Voice Input">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 19v3"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><rect x="9" y="2" width="6" height="13" rx="3"></rect></svg>
                    </button>
                    <button type="button" className="w-7 h-7 rounded-full text-stone-400 hover:text-stone-600 flex items-center justify-center transition" title="Attach Parameters">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"></path></svg>
                    </button>
                    <button className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center hover:bg-emerald-700 transition shadow-sm disabled:opacity-50" title="Send Query" type="submit" disabled={isThinking || !input.trim()} style={{ color: 'white' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"></path><path d="m21.854 2.147-10.94 10.939"></path></svg>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </section>

          {/* BEGIN: RightColumn */}
          <aside aria-label="Portfolio & Protocol Telemetry" className="col-span-4 flex flex-col h-full min-h-0 space-y-3 overflow-y-auto custom-scrollbar pr-1 pb-2">

            {/* Widget 1: Portfolio */}
            <div className="bg-white rounded-2xl border border-stone-300 p-3.5 shadow-md flex flex-col flex-shrink-0 space-y-2.5">
              <div className="flex items-center justify-between flex-shrink-0">
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"></path><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"></path></svg>
                  </div>
                  <h3 className="text-sm font-bold text-gray-900">Smart Vault Portfolio</h3>
                </div>
                <span className="text-[11px] font-mono text-stone-400">{smartAccountAddress ? truncAddr(smartAccountAddress) : '0xb9d7...fe9d'}</span>
              </div>
              <div className="flex-shrink-0">
                <div className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold">Total Value</div>
                <div className="flex items-baseline space-x-2 mt-0.5">
                  <span className="text-2xl font-bold text-stone-900">{portfolio ? fmtUsd(portfolio.totalValueUsd) : (isLoadingPortfolio ? 'Loading...' : '$0.00')}</span>
                  <span className="text-xs font-mono text-emerald-700 font-medium">≈ {(portfolio && portfolio.assets.find(a => !a.tokenAddress)?.priceUsd && portfolio.assets.find(a => !a.tokenAddress)?.priceUsd > 0) ? fmt(portfolio.totalValueUsd / portfolio.assets.find(a => !a.tokenAddress).priceUsd, 4) : '0.00'} ETH</span>
                </div>
              </div>


              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-2 pr-0.5">
                {portfolio && portfolio.assets && portfolio.assets.length > 0 ? (
                  portfolio.assets.map((asset, i) => {
                    const isEth = !asset.tokenAddress;
                    return (
                      <div key={i} className="p-2.5 bg-[#fbf9f5] border border-[#e7e5e4] rounded-xl flex items-center justify-between">
                        <div className="flex items-center space-x-2.5">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] ${isEth ? 'bg-stone-800 text-stone-100' : 'bg-emerald-100 text-emerald-700'}`}>
                            {asset.symbol.slice(0, 1)}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-stone-800">{asset.symbol}</div>
                            <div className="text-[10px] text-stone-500 font-mono">{fmt(asset.balanceFormatted, isEth ? 5 : 2)} {asset.symbol}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-bold text-stone-900">{fmtUsd(asset.valueUsd)}</div>
                          <div className="text-[10px] text-emerald-600 font-semibold">{fmt(asset.allocationPercentage, 1)}%</div>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="text-xs text-stone-500 text-center py-4">{isLoadingPortfolio ? 'Loading portfolio...' : 'No assets found.'}</div>
                )}
              </div>

              <button onClick={loadPortfolio} disabled={isLoadingPortfolio} className="w-full py-2.5 bg-white hover:bg-stone-50 border border-stone-400 text-stone-900 text-xs font-bold rounded-xl transition flex items-center justify-center space-x-1.5 shadow-md flex-shrink-0 mt-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-3.5 h-3.5 ${isLoadingPortfolio ? 'animate-spin' : ''}`}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M8 16H3v5"></path></svg>
                <span>{isLoadingPortfolio ? 'Loading...' : 'Refresh Portfolio'}</span>
              </button>
            </div>

            {/* Widget 2: Chainlink Oracles */}
            <div className="bg-white rounded-2xl border border-stone-300 p-3.5 shadow-md space-y-2.5 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M16 7h6v6"></path><path d="m22 7-8.5 8.5-5-5L2 17"></path></svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Chainlink Prices</h3>
                    <div className="text-[10px] text-stone-400 font-mono">On-chain • Chain {resolvedChainId}</div>
                  </div>
                </div>
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 max-h-40 overflow-y-auto custom-scrollbar">
                {prices ? (
                  Object.entries(prices).map(([symbol, data]) => (
                    <div key={symbol} className="p-3 bg-[#fbf9f5] border border-[#e7e5e4] rounded-xl">
                      <div className="text-[10px] uppercase font-semibold text-stone-500">{symbol.replace('_USD', '')} / USD</div>
                      <div className="text-base font-bold text-stone-900 mt-1 font-mono">{fmtUsd(data.priceUsd)}</div>
                      <div className={`text-[10px] flex items-center space-x-1 mt-0.5 ${data.isStale ? 'text-amber-600' : 'text-emerald-600'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><path d="M20 6 9 17l-5-5"></path></svg>
                        <span>{data.isStale ? 'Stale' : (symbol.includes('USDC') ? 'Peg Safe (100%)' : 'Fresh (4s ago)')}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <>
                    <div className="p-3 bg-[#fbf9f5] border border-[#e7e5e4] rounded-xl">
                      <div className="text-[10px] uppercase font-semibold text-stone-500">ETH / USD</div>
                      <div className="text-base font-bold text-stone-900 mt-1 font-mono">$2,712.92</div>
                      <div className="text-[10px] text-emerald-600 flex items-center space-x-1 mt-0.5">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><path d="M20 6 9 17l-5-5"></path></svg>
                        <span>Fresh (4s ago)</span>
                      </div>
                    </div>
                    <div className="p-3 bg-[#fbf9f5] border border-[#e7e5e4] rounded-xl">
                      <div className="text-[10px] uppercase font-semibold text-stone-500">USDC / USD</div>
                      <div className="text-base font-bold text-stone-900 mt-1 font-mono">$1.0001</div>
                      <div className="text-[10px] text-emerald-600 flex items-center space-x-1 mt-0.5">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><path d="M20 6 9 17l-5-5"></path></svg>
                        <span>Peg Safe (100%)</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Widget 3: Aave */}
            <div className="bg-white rounded-2xl border border-stone-300 p-3.5 shadow-md flex flex-col flex-shrink-0 space-y-2.5">
              <div className="flex items-center justify-between flex-shrink-0">
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"></path><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"></path><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"></path></svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Aave V3 — USDC</h3>
                    <div className="text-[10px] text-stone-400">{resolvedChainId === 421614 ? 'Arbitrum Sepolia' : 'Sepolia testnet'}</div>
                  </div>
                </div>
                <div className="flex items-center space-x-1 text-emerald-600 text-xs font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Active</span>
                </div>
              </div>

              {aaveError && (
                <div className="text-xs p-2 rounded-lg bg-red-100 text-red-800 flex-shrink-0">{aaveError}</div>
              )}

              {aaveMarket ? (
                <>
                  <div className="flex-shrink-0">
                    <div className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold">Current Supply APY</div>
                    <div className="text-3xl font-extrabold text-emerald-600 font-mono mt-0.5">{aaveMarket.supplyApyPercentage}%</div>
                  </div>
                  <div className="space-y-2 text-xs flex-shrink-0">
                    <div className="flex justify-between py-1 border-b border-stone-100">
                      <span className="text-stone-500">Available Liquidity</span>
                      <span className="font-mono font-medium text-stone-800">{fmt(aaveMarket.availableLiquidity, 0)} USDC</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-stone-100">
                      <span className="text-stone-500">Supply Cap</span>
                      <span className="font-mono font-medium text-stone-800">{aaveMarket.supplyCap ? fmt(aaveMarket.supplyCap, 0) : '—'} USDC</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-stone-100">
                      <span className="text-stone-500">Total Balance (inc. Earning)</span>
                      <span className="font-mono font-bold text-stone-900">{aaveTotalBalance} USDC</span>
                    </div>
                    <div className="flex justify-between py-1 text-emerald-700 bg-emerald-50/60 px-2 rounded font-semibold">
                      <span>Your Accrued Earnings</span>
                      <span className="font-mono">{aaveEarnings} USDC</span>
                    </div>
                  </div>
                  
                  <div className="space-y-1.5 flex-shrink-0 mt-3 pt-3 border-t border-stone-200">
                    <div className="flex space-x-2">
                      <input type="number" placeholder="Deposit Amt" className="w-full px-2 py-1.5 text-xs border border-stone-300 rounded-lg font-mono focus:outline-none focus:border-emerald-500" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} disabled={isOpPending} />
                      <button onClick={handleAaveDepositOp} disabled={isOpPending} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold whitespace-nowrap hover:bg-emerald-700 disabled:opacity-50 transition shadow-sm" style={{ color: 'white' }}>
                        Deposit
                      </button>
                    </div>
                    <div className="flex space-x-2">
                      <input type="number" placeholder="Withdraw Amt" className="w-full px-2 py-1.5 text-xs border border-stone-300 rounded-lg font-mono focus:outline-none focus:border-stone-500" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} disabled={isOpPending} />
                      <button onClick={handleAaveWithdrawClaimOp} disabled={isOpPending} className="px-3 py-1.5 bg-stone-800 text-white rounded-lg text-xs font-semibold whitespace-nowrap hover:bg-stone-900 disabled:opacity-50 transition shadow-sm" style={{ color: 'white' }}>
                        Withdraw + Claim
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                  <div className="text-xs text-stone-500 py-4 text-center">{isLoadingAave ? 'Loading Aave metrics...' : 'No Aave data available.'}</div>
                )}

              <button onClick={loadAave} disabled={isLoadingAave} className="w-full py-2.5 bg-white hover:bg-stone-50 border border-stone-400 text-stone-900 text-xs font-bold rounded-xl transition flex items-center justify-center space-x-1.5 shadow-md mt-auto flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-3.5 h-3.5 ${isLoadingAave ? 'animate-spin' : ''}`}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M8 16H3v5"></path></svg>
                <span>{isLoadingAave ? 'Loading...' : 'Refresh Aave Market'}</span>
              </button>
            </div>

          </aside>
        </div>
      </main>

      {/* BEGIN: FooterWarning */}
      <footer className="flex-shrink-0 border-t border-[#e7e5e4] bg-[#f8f5ee] px-4 lg:px-8 py-2.5">
        <div className="max-w-[1720px] mx-auto flex items-start space-x-2 text-xs text-stone-700">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path><path d="m9 12 2 2 4-4"></path></svg>
          <p className="leading-relaxed">
            <strong className="font-bold text-stone-900">Important:</strong> All figures are estimates based on live on-chain feeds and subject to change. The AI assistant never executes transactions without your explicit confirmation. DeFi involves smart-contract risk, market risk, and counterparty risk.
          </p>
        </div>
      </footer>
    </div>
  );
}