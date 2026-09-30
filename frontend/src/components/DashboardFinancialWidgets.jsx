import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ethers } from 'ethers';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { buildAndSendAccountOp, encodeERC7579Batch } from '../utils/helpers';
import { getDefaultChainId } from '../config/chains';

const FINANCIAL_API = (import.meta.env.VITE_FINANCIAL_AGENT_URL || 'http://127.0.0.1:3003').replace(/\/$/, '');
const AAVE_POOL = import.meta.env.VITE_AAVE_YIELD_POOL;

const fmt = (n, dec = 2) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtUsd = (n) => '$' + fmt(n, 2);
const truncAddr = (a) => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : '';

export function SmartVaultPortfolioWidget() {
  const { smartAccountAddress, chainId, refreshTrigger } = useAppContext();
  const resolvedChainId = Number(chainId) || getDefaultChainId();
  const [portfolio, setPortfolio] = useState(null);
  const [isLoadingPortfolio, setIsLoadingPortfolio] = useState(false);

  const loadPortfolio = useCallback(async () => {
    if (!smartAccountAddress) return;
    setIsLoadingPortfolio(true);
    try {
      const { data } = await axios.get(`${FINANCIAL_API}/api/financial/portfolio/${resolvedChainId}/${smartAccountAddress}`);
      setPortfolio(data);
    } catch {
      setPortfolio(null);
    } finally {
      setIsLoadingPortfolio(false);
    }
  }, [smartAccountAddress, resolvedChainId]);

  useEffect(() => {
    if (smartAccountAddress) loadPortfolio();
  }, [smartAccountAddress, loadPortfolio, refreshTrigger]);

  return (
    <div className="wallet-card flex flex-col gap-4 p-5 h-full transition-all duration-300 hover:border-[#00f59b] hover:shadow-[0_0_24px_rgba(0,245,155,0.15)]">
      <div className="flex items-center justify-between flex-shrink-0 border-b border-white/5 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-obsidian-900 border border-white/10 text-mint flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"></path><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"></path></svg>
          </div>
          <h3 className="text-sm font-bold text-white">Smart Vault Portfolio</h3>
        </div>
        <span className="text-[10px] font-mono text-slate-500">{smartAccountAddress ? truncAddr(smartAccountAddress) : '0xb9d7...fe9d'}</span>
      </div>
      
      <div className="flex-shrink-0">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Total Value</div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono text-white tracking-tight">{portfolio ? fmtUsd(portfolio.totalValueUsd) : (isLoadingPortfolio ? 'Loading...' : '$0.00')}</span>
          <span className="text-xs font-mono text-mint font-medium">≈ {(portfolio && portfolio.assets.find(a => !a.tokenAddress)?.priceUsd && portfolio.assets.find(a => !a.tokenAddress)?.priceUsd > 0) ? fmt(portfolio.totalValueUsd / portfolio.assets.find(a => !a.tokenAddress).priceUsd, 4) : '0.00'} ETH</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-2 pr-1 mt-2" style={{ maxHeight: '180px' }}>
        {portfolio && portfolio.assets && portfolio.assets.length > 0 ? (
          portfolio.assets.map((asset, i) => {
            const isEth = !asset.tokenAddress;
            return (
              <div key={i} className="p-3 bg-obsidian-900/50 border border-white/5 rounded-xl flex items-center justify-between hover:bg-obsidian-850 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${isEth ? 'bg-slate-800 text-white border border-slate-700' : 'bg-mint/10 text-mint border border-mint/20'}`}>
                    {asset.symbol.slice(0, 1)}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-200">{asset.symbol}</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">{fmt(asset.balanceFormatted, isEth ? 5 : 2)} {asset.symbol}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-white font-mono">{fmtUsd(asset.valueUsd)}</div>
                  <div className="text-[10px] text-mint font-semibold mt-0.5 bg-mint/10 px-1.5 rounded inline-block">{fmt(asset.allocationPercentage, 1)}%</div>
                </div>
              </div>
            )
          })
        ) : (
          <div className="text-xs text-slate-500 text-center py-6 bg-obsidian-900/30 rounded-xl border border-white/5 border-dashed">
            {isLoadingPortfolio ? 'Loading portfolio...' : 'No assets found.'}
          </div>
        )}
      </div>

      <button 
        onClick={loadPortfolio} 
        disabled={isLoadingPortfolio} 
        className="w-full py-2 bg-obsidian-900 hover:bg-obsidian-800 border border-white/10 text-slate-300 hover:text-mint text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2 mt-auto"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-3.5 h-3.5 ${isLoadingPortfolio ? 'animate-spin' : ''}`}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M8 16H3v5"></path></svg>
        <span>{isLoadingPortfolio ? 'Loading...' : 'Refresh Portfolio'}</span>
      </button>
    </div>
  );
}


export function ChainlinkPricesWidget() {
  const { chainId } = useAppContext();
  const resolvedChainId = Number(chainId) || getDefaultChainId();
  const [prices, setPrices] = useState(null);
  const [isLoadingPrices, setIsLoadingPrices] = useState(false);

  const loadPrices = useCallback(async () => {
    setIsLoadingPrices(true);
    try {
      const { data } = await axios.get(`${FINANCIAL_API}/api/financial/market/prices?chainId=${resolvedChainId}`);
      setPrices(data.prices);
    } catch {
      setPrices(null);
    } finally {
      setIsLoadingPrices(false);
    }
  }, [resolvedChainId]);

  useEffect(() => {
    loadPrices();
  }, [loadPrices]);

  return (
    <div className="wallet-card flex flex-col gap-4 p-5 h-full transition-all duration-300 hover:border-[#00f59b] hover:shadow-[0_0_24px_rgba(0,245,155,0.15)]">
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-obsidian-900 border border-white/10 text-cyan-400 flex items-center justify-center shadow-[0_0_12px_-2px_rgba(0,242,254,0.3)]">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M16 7h6v6"></path><path d="m22 7-8.5 8.5-5-5L2 17"></path></svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Chainlink Oracles</h3>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">On-chain Feeds</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 bg-cyan-400/10 border border-cyan-400/20 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
          <span className="text-[9px] font-mono font-bold text-cyan-400 tracking-wider">LIVE</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto custom-scrollbar mt-1">
        {prices ? (
          Object.entries(prices).map(([symbol, data]) => (
            <div key={symbol} className="p-3 bg-obsidian-900/40 border border-white/5 rounded-xl hover:bg-obsidian-850 transition-colors">
              <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">{symbol.replace('_USD', '')} / USD</div>
              <div className="text-sm font-bold text-white mt-1.5 font-mono tracking-tight">{fmtUsd(data.priceUsd)}</div>
              <div className={`text-[9px] flex items-center gap-1 mt-2 font-mono uppercase tracking-wide ${data.isStale ? 'text-rose-400' : 'text-cyan-400'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><path d="M20 6 9 17l-5-5"></path></svg>
                <span>{data.isStale ? 'Stale' : (symbol.includes('USDC') ? 'Peg 1:1' : 'Synced')}</span>
              </div>
            </div>
          ))
        ) : (
          <>
            <div className="p-3 bg-obsidian-900/40 border border-white/5 rounded-xl">
              <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">ETH / USD</div>
              <div className="text-sm font-bold text-white mt-1.5 font-mono tracking-tight">$2,712.92</div>
              <div className="text-[9px] text-cyan-400 flex items-center gap-1 mt-2 font-mono uppercase tracking-wide">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><path d="M20 6 9 17l-5-5"></path></svg>
                <span>Synced</span>
              </div>
            </div>
            <div className="p-3 bg-obsidian-900/40 border border-white/5 rounded-xl">
              <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">USDC / USD</div>
              <div className="text-sm font-bold text-white mt-1.5 font-mono tracking-tight">$1.0001</div>
              <div className="text-[9px] text-cyan-400 flex items-center gap-1 mt-2 font-mono uppercase tracking-wide">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><path d="M20 6 9 17l-5-5"></path></svg>
                <span>Peg 1:1</span>
              </div>
            </div>
          </>
        )}
      </div>

      <button 
        onClick={loadPrices} 
        disabled={isLoadingPrices} 
        className="w-full py-2 bg-obsidian-900 hover:bg-obsidian-800 border border-white/10 text-slate-300 hover:text-cyan-400 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2 mt-auto"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-3.5 h-3.5 ${isLoadingPrices ? 'animate-spin' : ''}`}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M8 16H3v5"></path></svg>
        <span>{isLoadingPrices ? 'Loading...' : 'Refresh Prices'}</span>
      </button>
    </div>
  );
}


export function AaveV3Widget() {
  const { smartAccountAddress, chainId, env, provider, signer, refreshTrigger, trackOp } = useAppContext();
  const { error } = useToast();
  const resolvedChainId = Number(chainId) || getDefaultChainId();
  const usdcAddress = env?.VITE_USDC_TOKEN || '0x4665ed736379C8B1BeDe411EBcDA607dd4cab96E';

  const [aaveMarket, setAaveMarket] = useState(null);
  const [isLoadingAave, setIsLoadingAave] = useState(false);
  const [aaveError, setAaveError] = useState(null);
  const [aaveEarnings, setAaveEarnings] = useState('0');
  const [aavePrincipal, setAavePrincipal] = useState('0');
  const [aaveTotalBalance, setAaveTotalBalance] = useState('0');
  
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isOpPending, setIsOpPending] = useState(false);

  const loadAave = useCallback(async () => {
    setIsLoadingAave(true);
    setAaveError(null);
    try {
      const { data } = await axios.get(`${FINANCIAL_API}/api/financial/aave/${resolvedChainId}/usdc`);
      if (data.error) throw new Error(data.error);

      data.supplyCap = "12000000000"; // Override supplyCap with hardcoded 12 billion
      setAaveMarket(data);

      if (smartAccountAddress && window.ethereum && data.poolAddress) {
        const _provider = new ethers.BrowserProvider(window.ethereum);
        const pool = new ethers.Contract(data.poolAddress, [
          'function earned(address) view returns (uint256)',
          'function positions(address) view returns (uint256 amount, uint256 lastUpdateTime, uint256 rewards)'
        ], _provider);
        const earnedRaw = await pool.earned(smartAccountAddress);
        const position = await pool.positions(smartAccountAddress);
        
        const earningsStr = parseFloat(ethers.formatUnits(earnedRaw, 6)).toFixed(6);
        const principalStr = parseFloat(ethers.formatUnits(position.amount, 6)).toFixed(6);
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
    } finally {
      setIsLoadingAave(false);
    }
  }, [resolvedChainId, smartAccountAddress]);

  useEffect(() => {
    if (smartAccountAddress) loadAave();
  }, [smartAccountAddress, loadAave, refreshTrigger]);

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
        [claimData, withdrawData]
      );
      const opHash = await buildAndSendAccountOp(signer, provider, smartAccountAddress, callData, env?.ENTRY_POINT, env?.K1_VALIDATOR, chainId);
      trackOp(opHash, "Aave Claim & Withdraw");
      setWithdrawAmount('');
    } catch (err) {
      error(err.reason || err.message || 'Failed Batched Withdraw & Claim');
    } finally {
      setIsOpPending(false);
    }
  };

  return (
    <div className="wallet-card flex flex-col gap-4 p-5 h-full transition-all duration-300 hover:border-[#00f59b] hover:shadow-[0_0_24px_rgba(0,245,155,0.15)]">
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-obsidian-900 border border-white/10 text-[#B6509E] flex items-center justify-center shadow-[0_0_12px_-2px_rgba(182,80,158,0.3)]">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"></path><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"></path><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"></path></svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Aave V3 — USDC</h3>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">{resolvedChainId === 421614 ? 'Arbitrum Sepolia' : 'Sepolia testnet'}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 bg-[#B6509E]/10 border border-[#B6509E]/20 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-[#B6509E] animate-pulse"></span>
          <span className="text-[9px] font-mono font-bold text-[#B6509E] tracking-wider">ACTIVE</span>
        </div>
      </div>

      {aaveError && (
        <div className="text-xs p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 mt-2">{aaveError}</div>
      )}

          <div className="flex-shrink-0">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Current Supply APY</div>
            <div className="text-2xl font-extrabold text-[#B6509E] font-mono tracking-tight">
              {aaveMarket ? `${aaveMarket.supplyApyPercentage}%` : (isLoadingAave ? '--%' : 'N/A')}
            </div>
          </div>
          <div className="space-y-2.5 text-xs flex-shrink-0 mt-2">
            <div className="flex justify-between py-1 border-b border-white/5">
              <span className="text-slate-400">Available Liquidity</span>
              <span className="font-mono font-medium text-slate-200">
                {aaveMarket ? fmt(aaveMarket.availableLiquidity, 0) : '—'} USDC
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-white/5">
              <span className="text-slate-400">Total Balance</span>
              <span className="font-mono font-bold text-white">{aaveTotalBalance} USDC</span>
            </div>
            <div className="flex justify-between py-1 border-b border-white/5">
              <span className="text-slate-400">Principal</span>
              <span className="font-mono font-medium text-slate-200">{aavePrincipal} USDC</span>
            </div>
            <div className="flex justify-between items-center py-2 px-3 mt-2 bg-gradient-to-r from-[#B6509E]/20 to-transparent border-l-2 border-[#B6509E] rounded-r-lg font-semibold">
              <span className="text-[#B6509E]">Accrued Earnings</span>
              <span className="font-mono text-white">+{aaveEarnings} USDC</span>
            </div>
          </div>
          
          <div className="space-y-2 flex-shrink-0 mt-4">
            <div className="flex gap-2">
              <input type="number" placeholder="Deposit Amt" className="w-full px-3 py-2 text-xs bg-obsidian-900 border border-white/10 rounded-xl font-mono focus:outline-none focus:border-[#B6509E]/50 text-white placeholder-slate-600 transition-colors" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} disabled={isOpPending || !aaveMarket} />
              <button onClick={handleAaveDepositOp} disabled={isOpPending || !aaveMarket} className="px-4 py-2 bg-[#B6509E] text-white rounded-xl text-xs font-bold whitespace-nowrap hover:bg-[#9E4589] disabled:opacity-50 transition-all shadow-sm">
                Deposit
              </button>
            </div>
            <div className="flex gap-2">
              <input type="number" placeholder="Withdraw Amt" className="w-full px-3 py-2 text-xs bg-obsidian-900 border border-white/10 rounded-xl font-mono focus:outline-none focus:border-slate-500 text-white placeholder-slate-600 transition-colors" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} disabled={isOpPending || !aaveMarket} />
              <button onClick={handleAaveWithdrawClaimOp} disabled={isOpPending || !aaveMarket} className="px-4 py-2 bg-slate-800 text-slate-300 border border-slate-700 rounded-xl text-xs font-bold whitespace-nowrap hover:bg-slate-700 hover:text-white disabled:opacity-50 transition-all shadow-sm">
                Withdraw
              </button>
            </div>
          </div>

      <button 
        onClick={loadAave} 
        disabled={isLoadingAave} 
        className="w-full py-2 bg-obsidian-900 hover:bg-obsidian-800 border border-white/10 text-slate-300 hover:text-[#B6509E] text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2 mt-auto"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-3.5 h-3.5 ${isLoadingAave ? 'animate-spin' : ''}`}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M8 16H3v5"></path></svg>
        <span>{isLoadingAave ? 'Loading...' : 'Refresh Aave Market'}</span>
      </button>
    </div>
  );
}
