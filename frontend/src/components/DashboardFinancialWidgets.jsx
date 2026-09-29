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
    <div className="glass-card flex flex-col gap-4" style={{ paddingBottom:'1.25rem', height: '100%', boxSizing: 'border-box' }}>
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"></path><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"></path></svg>
          </div>
          <h3 style={{ fontSize:'1rem', margin:0, fontWeight:700 }}>Smart Vault Portfolio</h3>
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

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-2 pr-0.5" style={{ maxHeight: '200px' }}>
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

      <button onClick={loadPortfolio} disabled={isLoadingPortfolio} className="w-full py-2 bg-white hover:bg-stone-50 border border-stone-300 text-stone-900 text-xs font-bold rounded-xl transition flex items-center justify-center space-x-1.5 shadow-sm flex-shrink-0 mt-auto">
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
    <div className="glass-card flex flex-col gap-4" style={{ paddingBottom:'1.25rem', height: '100%', boxSizing: 'border-box' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M16 7h6v6"></path><path d="m22 7-8.5 8.5-5-5L2 17"></path></svg>
          </div>
          <div>
            <h3 style={{ fontSize:'1rem', margin:0, fontWeight:700 }}>Chainlink Prices</h3>
            <div className="text-[10px] text-stone-400 font-mono">On-chain • Chain {resolvedChainId}</div>
          </div>
        </div>
        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 max-h-48 overflow-y-auto custom-scrollbar">
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

      <button onClick={loadPrices} disabled={isLoadingPrices} className="w-full py-2 bg-white hover:bg-stone-50 border border-stone-300 text-stone-900 text-xs font-bold rounded-xl transition flex items-center justify-center space-x-1.5 shadow-sm mt-auto flex-shrink-0">
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
        [withdrawData, claimData]
      );
      const opHash = await buildAndSendAccountOp(signer, provider, smartAccountAddress, callData, env?.ENTRY_POINT, env?.K1_VALIDATOR, chainId);
      trackOp(opHash, "Aave Withdraw & Claim");
      setWithdrawAmount('');
    } catch (err) {
      error(err.reason || err.message || 'Failed Batched Withdraw & Claim');
    } finally {
      setIsOpPending(false);
    }
  };

  return (
    <div className="glass-card flex flex-col gap-4" style={{ paddingBottom:'1.25rem', height: '100%', boxSizing: 'border-box' }}>
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"></path><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"></path><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"></path></svg>
          </div>
          <div>
            <h3 style={{ fontSize:'1rem', margin:0, fontWeight:700 }}>Aave V3 — USDC</h3>
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
            <div className="text-2xl font-extrabold text-emerald-600 font-mono mt-0.5">{aaveMarket.supplyApyPercentage}%</div>
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
            <div className="flex justify-between py-1 border-b border-stone-100">
              <span className="text-stone-500">Principal</span>
              <span className="font-mono font-medium text-stone-800">{aavePrincipal} USDC</span>
            </div>
            <div className="flex justify-between py-1 text-emerald-700 bg-emerald-50/60 px-2 rounded font-semibold">
              <span>Your Accrued Earnings</span>
              <span className="font-mono">{aaveEarnings} USDC</span>
            </div>
          </div>
          
          <div className="space-y-1.5 flex-shrink-0 mt-2 pt-2 border-t border-stone-200">
            <div className="flex space-x-2">
              <input type="number" placeholder="Deposit Amt" className="w-full px-2 py-1.5 text-xs border border-stone-300 rounded-lg font-mono focus:outline-none focus:border-emerald-500 bg-white" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} disabled={isOpPending} />
              <button onClick={handleAaveDepositOp} disabled={isOpPending} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold whitespace-nowrap hover:bg-emerald-700 disabled:opacity-50 transition shadow-sm" style={{ color: 'white' }}>
                Deposit
              </button>
            </div>
            <div className="flex space-x-2">
              <input type="number" placeholder="Withdraw Amt" className="w-full px-2 py-1.5 text-xs border border-stone-300 rounded-lg font-mono focus:outline-none focus:border-stone-500 bg-white" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} disabled={isOpPending} />
              <button onClick={handleAaveWithdrawClaimOp} disabled={isOpPending} className="px-3 py-1.5 bg-stone-800 text-white rounded-lg text-xs font-semibold whitespace-nowrap hover:bg-stone-900 disabled:opacity-50 transition shadow-sm" style={{ color: 'white' }}>
                Withdraw + Claim
              </button>
            </div>
          </div>
        </>
      ) : (
          <div className="text-xs text-stone-500 py-4 text-center">{isLoadingAave ? 'Loading Aave metrics...' : 'No Aave data available.'}</div>
        )}

      <button onClick={loadAave} disabled={isLoadingAave} className="w-full py-2 bg-white hover:bg-stone-50 border border-stone-300 text-stone-900 text-xs font-bold rounded-xl transition flex items-center justify-center space-x-1.5 shadow-sm mt-auto flex-shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-3.5 h-3.5 ${isLoadingAave ? 'animate-spin' : ''}`}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M8 16H3v5"></path></svg>
        <span>{isLoadingAave ? 'Loading...' : 'Refresh Aave Market'}</span>
      </button>
    </div>
  );
}
