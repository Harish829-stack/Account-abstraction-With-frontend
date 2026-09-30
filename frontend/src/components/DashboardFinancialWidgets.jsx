import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { buildAndSendAccountOp, encodeERC7579Batch } from '../utils/helpers';
import { getDefaultChainId } from '../config/chains';
import { getFriendlyErrorMessage } from '../utils/errors';

const fmt = (n, dec = 2) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtUsd = (n) => '$' + fmt(n, 2);
const truncAddr = (a) => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : '';

const CHART_COLORS = ['#00f59b', '#38bdf8'];
const getAssetValue = (asset) => Number(asset?.valueUsd || 0);
const getPortfolioAssets = (portfolio) => (portfolio?.assets || [])
  .filter((asset) => !asset.tokenAddress || String(asset.symbol || '').toUpperCase().includes('USDC'))
  .map((asset) => ({ ...asset, isEth: !asset.tokenAddress, valueUsd: getAssetValue(asset) }));

const buildDonutSegments = (assets) => {
  const total = assets.reduce((sum, asset) => sum + asset.valueUsd, 0);
  let offset = 0;
  return assets.map((asset, index) => {
    const percentage = total ? (asset.valueUsd / total) * 100 : 0;
    const segment = { ...asset, percentage, offset, color: CHART_COLORS[index % CHART_COLORS.length] };
    offset += percentage;
    return segment;
  });
};

const buildSparklinePoints = (values, width = 300, height = 100) => {
  if (!values.length) return '';
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  return values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - 12 - ((value - min) / range) * (height - 24);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
};

function DonutChart({ segments, totalValue, ethEquivalent }) {
  const circumference = 2 * Math.PI * 62;
  return (
    <div className="relative w-48 h-48 flex items-center justify-center">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160" role="img" aria-label="Portfolio allocation chart">
        <circle cx="80" cy="80" r="62" fill="none" stroke="#1c2333" strokeWidth="18" />
        {segments.map((segment) => (
          <circle key={segment.symbol} cx="80" cy="80" r="62" fill="none" stroke={segment.color} strokeWidth="18" strokeDasharray={`${(segment.percentage / 100) * circumference} ${circumference}`} strokeDashoffset={-(segment.offset / 100) * circumference} />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-9">
        <span className="max-w-full text-[15px] font-bold font-mono text-white leading-none whitespace-nowrap tracking-normal">{fmtUsd(totalValue)}</span>
        <span className="text-[10px] font-mono text-emerald-400 mt-1">≈ {fmt(ethEquivalent, 4)} ETH</span>
        <span className="text-[10px] text-slate-500 mt-1">Smart Vault TVL</span>
      </div>
    </div>
  );
}

function Sparkline({ values }) {
  const points = buildSparklinePoints(values);
  const areaPoints = points ? `0,100 ${points} 300,100` : '';
  return (
    <div className="relative w-full h-24 mt-2">
      <div className="absolute inset-0 flex flex-col justify-between opacity-15 pointer-events-none"><div className="border-b border-white" /><div className="border-b border-white" /><div className="border-b border-white" /></div>
      <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 300 100" role="img" aria-label="Current Chainlink feed snapshot">
        <defs><linearGradient id="chainlinkFeedGradient" x1="0%" x2="0%" y1="0%" y2="100%"><stop offset="0%" stopColor="#00f59b" stopOpacity="0.3" /><stop offset="100%" stopColor="#00f59b" stopOpacity="0" /></linearGradient></defs>
        {areaPoints && <polygon points={areaPoints} fill="url(#chainlinkFeedGradient)" />}
        {points && <polyline points={points} fill="none" stroke="#00f59b" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />}
      </svg>
    </div>
  );
}

function AavePricePulse() {
  return (
    <div className="absolute right-3 top-20 w-36 h-28 opacity-35 pointer-events-none select-none overflow-hidden">
      <div className="absolute inset-x-8 bottom-1 h-10 rounded-[50%] bg-[#00f59b]/15 blur-sm animate-pulse" />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 150 120" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="aavePulseLine" x1="0" y1="90" x2="125" y2="20" gradientUnits="userSpaceOnUse">
            <stop stopColor="#38bdf8" />
            <stop offset="0.45" stopColor="#00f59b" />
            <stop offset="1" stopColor="#7cffc4" />
          </linearGradient>
          <linearGradient id="aavePulseDisc" x1="35" y1="82" x2="115" y2="82" gradientUnits="userSpaceOnUse">
            <stop stopColor="#38bdf8" stopOpacity="0.05" />
            <stop offset="1" stopColor="#00f59b" stopOpacity="0.28" />
          </linearGradient>
          <filter id="aavePulseGlow" x="-20" y="-20" width="180" height="150" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path d="M20 88C40 72 63 72 85 86C105 98 124 93 141 78" stroke="#00f59b" strokeOpacity="0.22" strokeWidth="1" />
        <ellipse cx="82" cy="92" rx="48" ry="12" fill="url(#aavePulseDisc)" stroke="#00f59b" strokeOpacity="0.3" />
        <path d="M2 82L34 50L62 70L116 24" stroke="url(#aavePulseLine)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" filter="url(#aavePulseGlow)" />
        <path d="M109 18L133 9L126 35Z" fill="#00f59b" filter="url(#aavePulseGlow)" />
        <circle cx="28" cy="18" r="1.5" fill="#38bdf8" opacity="0.65" />
        <circle cx="66" cy="11" r="2" fill="#00f59b" opacity="0.7" />
        <circle cx="116" cy="53" r="1.4" fill="#38bdf8" opacity="0.55" />
      </svg>
    </div>
  );
}

function RefreshIcon({ spinning = false }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-3.5 h-3.5 ${spinning ? 'animate-spin' : ''}`}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></svg>;
}

export function SmartVaultPortfolioWidget() {
  const { smartAccountAddress, chainId, sharedDataCache, refreshFinancialPortfolio } = useAppContext();
  const resolvedChainId = Number(chainId) || getDefaultChainId();
  const portfolioKey = smartAccountAddress && resolvedChainId ? `${resolvedChainId}:${smartAccountAddress.toLowerCase()}` : null;
  const portfolioEntry = portfolioKey ? sharedDataCache.portfolio?.[portfolioKey] : null;
  const portfolio = portfolioEntry?.data || null;
  const isLoadingPortfolio = Boolean(portfolioEntry?.loading);

  const loadPortfolio = useCallback(async ({ force = false } = {}) => {
    if (!smartAccountAddress) return;
    try {
      await refreshFinancialPortfolio({ force });
    } catch {
      // Full error is logged by the shared loader; keep the card on its last good value.
    }
  }, [smartAccountAddress, refreshFinancialPortfolio]);

  useEffect(() => {
    if (smartAccountAddress && !portfolioEntry?.data && !portfolioEntry?.loading) loadPortfolio();
  }, [smartAccountAddress, loadPortfolio, portfolioEntry?.data, portfolioEntry?.loading]);

  const assets = getPortfolioAssets(portfolio);
  const totalValue = assets.reduce((sum, asset) => sum + asset.valueUsd, 0);
  const ethAsset = assets.find((asset) => asset.isEth);
  const ethEquivalent = ethAsset?.priceUsd > 0 ? totalValue / Number(ethAsset.priceUsd) : 0;
  const segments = buildDonutSegments(assets);

  return (
    <div className="wallet-card flex flex-col gap-4 p-5 h-full transition-all duration-300 hover:border-[#00f59b] hover:shadow-[0_0_24px_rgba(0,245,155,0.15)]">
      <div className="flex items-center justify-between flex-shrink-0 border-b border-white/5 pb-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-obsidian-900 border border-white/10 text-mint flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"></path><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"></path></svg>
          </div>
          <h3 className="text-sm font-bold text-white">Smart Vault Portfolio</h3>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-md border border-emerald-500/20">USDC + ETH</span>
        </div>
        <span className="text-[10px] font-mono text-slate-500">{smartAccountAddress ? truncAddr(smartAccountAddress) : 'Not connected'}</span>
      </div>

      {assets.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          <div className="md:col-span-5 flex justify-center"><DonutChart segments={segments} totalValue={totalValue} ethEquivalent={ethEquivalent} /></div>
          <div className="md:col-span-7 flex flex-col gap-2.5">
            <div className="flex items-center justify-between bg-[#171d29] border border-white/5 rounded-xl p-3"><div><p className="text-[11px] text-slate-400 font-medium">Portfolio contribution</p><p className="text-lg font-bold font-mono text-white">ETH + USDC</p></div><span className="text-[11px] font-mono text-slate-400 border border-white/10 px-2 py-0.5 rounded bg-black/20">{fmtUsd(totalValue)}</span></div>
            {assets.map((asset, index) => (
              <div key={`${asset.symbol}-${asset.tokenAddress || 'native'}`} className="flex items-center justify-between bg-white/[0.02] hover:bg-white/[0.04] p-2.5 rounded-lg border border-white/[0.04] transition">
                <div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ color: CHART_COLORS[index % CHART_COLORS.length], backgroundColor: `${CHART_COLORS[index % CHART_COLORS.length]}20`, border: `1px solid ${CHART_COLORS[index % CHART_COLORS.length]}66` }}>{asset.isEth ? 'Ξ' : '$'}</div><div><p className="text-xs font-semibold text-white leading-tight">{asset.symbol}</p><p className="text-[10px] font-mono text-slate-400">{fmt(asset.balanceFormatted, asset.isEth ? 5 : 2)} {asset.symbol}</p></div></div>
                <div className="text-right flex items-center gap-2"><div><p className="text-xs font-bold font-mono text-white leading-tight">{fmtUsd(asset.valueUsd)}</p><p className="text-[10px] text-slate-500">USD value</p></div><span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded" style={{ color: CHART_COLORS[index % CHART_COLORS.length], backgroundColor: `${CHART_COLORS[index % CHART_COLORS.length]}20` }}>{fmt((asset.valueUsd / totalValue) * 100, 1)}%</span></div>
              </div>
            ))}
          </div>
        </div>
      ) : <div className="text-xs text-slate-500 text-center py-12 bg-obsidian-900/30 rounded-xl border border-white/5 border-dashed">{isLoadingPortfolio ? 'Loading portfolio...' : 'No USDC or ETH balances found.'}</div>}

      <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between mt-auto"><span className="text-[10px] text-slate-500 font-mono">Live smart vault balance</span><button onClick={() => loadPortfolio({ force: true })} disabled={isLoadingPortfolio} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#171d29] hover:bg-[#1f2736] text-xs font-medium text-emerald-400 border border-emerald-500/30 rounded-lg transition active:scale-[0.98]"><RefreshIcon spinning={isLoadingPortfolio} /><span>{isLoadingPortfolio ? 'Loading...' : 'Refresh Portfolio'}</span></button></div>
    </div>
  );
}


export function ChainlinkPricesWidget() {
  const { chainId, sharedDataCache, refreshMarketPrices } = useAppContext();
  const resolvedChainId = Number(chainId) || getDefaultChainId();
  const pricesKey = String(resolvedChainId);
  const pricesEntry = sharedDataCache.prices?.[pricesKey];
  const prices = pricesEntry?.data || null;
  const isLoadingPrices = Boolean(pricesEntry?.loading);

  const loadPrices = useCallback(async ({ force = false } = {}) => {
    try {
      await refreshMarketPrices({ force });
    } catch {
      // Full error is logged by the shared loader; keep the card on its last good value.
    }
  }, [refreshMarketPrices]);

  useEffect(() => {
    if (!pricesEntry?.data && !pricesEntry?.loading) loadPrices();
  }, [loadPrices, pricesEntry?.data, pricesEntry?.loading]);

  const priceEntries = Object.entries(prices || {}).filter(([, data]) => Number.isFinite(Number(data?.priceUsd)));
  const primaryEntry = priceEntries.find(([symbol]) => symbol.includes('ETH')) || priceEntries[0];
  const graphValues = priceEntries.map(([, data]) => Number(data.priceUsd));

  return (
    <div className="wallet-card flex flex-col gap-4 p-5 h-full transition-all duration-300 hover:border-[#00f59b] hover:shadow-[0_0_24px_rgba(0,245,155,0.15)]">
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-obsidian-900 border border-white/10 text-cyan-400 flex items-center justify-center shadow-[0_0_12px_-2px_rgba(0,242,254,0.3)]">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M16 7h6v6"></path><path d="m22 7-8.5 8.5-5-5L2 17"></path></svg>
          </div>
          <div><h3 className="text-sm font-bold text-white">Chainlink Prices</h3><div className="text-[10px] text-slate-500 font-mono mt-0.5">Decentralized feed snapshot</div></div>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 bg-cyan-400/10 border border-cyan-400/20 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
          <span className="text-[9px] font-mono font-bold text-cyan-400 tracking-wider">LIVE</span>
        </div>
      </div>

      {priceEntries.length > 0 ? <><div className="grid grid-cols-2 gap-2 pb-2.5 border-b border-white/[0.06]">{priceEntries.slice(0, 4).map(([symbol, data]) => <div key={symbol} className="bg-[#171d29] border border-white/5 rounded-lg p-2"><div className="flex items-center justify-between mb-1 gap-1"><span className="text-[10px] text-slate-400 font-medium flex items-center gap-1 truncate"><span className={`w-1.5 h-1.5 rounded-full ${data.isStale ? 'bg-rose-400' : 'bg-[#00f59b]'}`} />{symbol.replace('_USD', '')} / USD</span><span className={`text-[9px] font-mono px-1 rounded ${data.isStale ? 'text-rose-400 bg-rose-950/50' : 'text-emerald-400 bg-emerald-950/80'}`}>{data.isStale ? 'Stale' : 'Live'}</span></div><p className="text-xs font-bold font-mono text-white">{fmtUsd(data.priceUsd)}</p></div>)}</div><div><div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold text-white">Live feed view</h3><p className="text-xs text-slate-500 mt-0.5">One point per returned Chainlink feed</p></div>{primaryEntry && <span className="text-sm font-bold text-white font-mono">{fmtUsd(primaryEntry[1].priceUsd)}</span>}</div><Sparkline values={graphValues} /></div></> : <div className="text-xs text-slate-500 text-center py-12 bg-obsidian-900/30 rounded-xl border border-white/5 border-dashed">{isLoadingPrices ? 'Loading price feeds...' : 'Price feeds unavailable.'}</div>}

      <div className="pt-2.5 mt-auto border-t border-white/[0.06] flex items-center justify-between"><span className="text-[10px] text-slate-500 font-mono">Chainlink decentralized feeds</span><button onClick={() => loadPrices({ force: true })} disabled={isLoadingPrices} className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-emerald-400 transition"><RefreshIcon spinning={isLoadingPrices} /><span>{isLoadingPrices ? 'Loading...' : 'Refresh Prices'}</span></button></div>
    </div>
  );
}


export function AaveV3Widget() {
  const { smartAccountAddress, chainId, env, provider, signer, sharedDataCache, refreshAaveData, trackOp } = useAppContext();
  const { error } = useToast();
  const resolvedChainId = Number(chainId) || getDefaultChainId();
  const usdcAddress = env?.USDC_TOKEN || '';
  const aaveKey = smartAccountAddress && resolvedChainId ? `${resolvedChainId}:${smartAccountAddress.toLowerCase()}` : null;
  const aaveEntry = aaveKey ? sharedDataCache.aave?.[aaveKey] : null;
  const aaveMarket = aaveEntry?.data?.market || null;
  const aavePoolAddress = aaveMarket?.poolAddress || env?.AAVE_POOL || '';
  const aaveError = aaveEntry?.error || null;
  const aaveEarnings = aaveEntry?.data?.position?.earnings || '0';
  const aavePrincipal = aaveEntry?.data?.position?.principal || '0';
  const aaveTotalBalance = aaveEntry?.data?.position?.totalBalance || '0';
  const isLoadingAave = Boolean(aaveEntry?.loading);
  
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isOpPending, setIsOpPending] = useState(false);

  const loadAave = useCallback(async ({ force = false } = {}) => {
    try {
      await refreshAaveData({ force });
    } catch (e) {
      console.error("Aave market load failed:", e);
    }
  }, [refreshAaveData]);

  useEffect(() => {
    if (smartAccountAddress && !aaveEntry?.data && !aaveEntry?.loading) loadAave();
  }, [smartAccountAddress, loadAave, aaveEntry?.data, aaveEntry?.loading]);

  const handleAaveDepositOp = async () => {
    if (!depositAmount || isNaN(depositAmount) || parseFloat(depositAmount) <= 0) {
      error('Please enter a valid amount');
      return;
    }
    if (!usdcAddress || !aavePoolAddress) {
      error('USDC or Aave pool address is missing from chain config.');
      return;
    }
    try {
      setIsOpPending(true);
      const amountToDeposit = ethers.parseUnits(depositAmount.toString(), 6);
      const mockToken = new ethers.Contract(usdcAddress, ['function approve(address spender, uint256 amount) external returns (bool)'], signer);
      const pool = new ethers.Contract(aavePoolAddress, ['function deposit(uint256 _amount) external'], signer);
      const approveData = mockToken.interface.encodeFunctionData('approve', [aavePoolAddress, amountToDeposit]);
      const depositData = pool.interface.encodeFunctionData('deposit', [amountToDeposit]);
      const callData = encodeERC7579Batch(
        [usdcAddress, aavePoolAddress],
        [0n, 0n],
        [approveData, depositData]
      );
      const opHash = await buildAndSendAccountOp(signer, provider, smartAccountAddress, callData, env?.ENTRY_POINT, env?.K1_VALIDATOR, chainId);
      trackOp(opHash, "Aave Deposit");
      setDepositAmount('');
    } catch (err) {
      console.error("Dashboard Aave deposit failed:", err);
      error(getFriendlyErrorMessage(err, 'We could not submit the Aave deposit. Please check your USDC balance and try again.'));
    } finally {
      setIsOpPending(false);
    }
  };

  const handleAaveWithdrawClaimOp = async () => {
    if (!withdrawAmount || isNaN(withdrawAmount) || parseFloat(withdrawAmount) <= 0) {
      error('Please enter a valid amount');
      return;
    }
    if (!aavePoolAddress) {
      error('Aave pool address is missing from chain config.');
      return;
    }
    try {
      setIsOpPending(true);
      const amountToWithdraw = ethers.parseUnits(withdrawAmount.toString(), 6);
      const pool = new ethers.Contract(aavePoolAddress, ['function withdraw(uint256 _amount) external', 'function claimReward() external'], signer);
      const withdrawData = pool.interface.encodeFunctionData('withdraw', [amountToWithdraw]);
      const claimData = pool.interface.encodeFunctionData('claimReward', []);
      const callData = encodeERC7579Batch(
        [aavePoolAddress, aavePoolAddress],
        [0n, 0n],
        [claimData, withdrawData]
      );
      const opHash = await buildAndSendAccountOp(signer, provider, smartAccountAddress, callData, env?.ENTRY_POINT, env?.K1_VALIDATOR, chainId);
      trackOp(opHash, "Aave Claim & Withdraw");
      setWithdrawAmount('');
    } catch (err) {
      console.error("Dashboard Aave withdraw failed:", err);
      error(getFriendlyErrorMessage(err, 'We could not submit the Aave withdrawal. Please check your position and try again.'));
    } finally {
      setIsOpPending(false);
    }
  };

  const supplyApy = Number(aaveMarket?.supplyApyPercentage || 0);
  const availableLiquidity = Number(aaveMarket?.availableLiquidity || 0);
  const supplyCap = Number(aaveMarket?.supplyCap || 0);
  const liquidityPercent = supplyCap > 0 ? Math.min((availableLiquidity / supplyCap) * 100, 100) : 0;
  const principal = Number(aavePrincipal || 0);
  const earnings = Number(aaveEarnings || 0);
  const totalBalance = Number(aaveTotalBalance || 0);
  const principalPercent = totalBalance > 0 ? (principal / totalBalance) * 100 : 100;

  return (
    <div className="wallet-card relative overflow-hidden flex flex-col gap-4 p-5 h-full transition-all duration-300 border-[#00f59b]/25 hover:border-[#00f59b] hover:shadow-[0_0_24px_rgba(0,245,155,0.15)]">
      <AavePricePulse />
      <div className="relative z-10 flex items-center justify-between border-b border-white/5 pb-3"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-xl bg-obsidian-900 border border-white/10 text-[#00f59b] flex items-center justify-center shadow-[0_0_12px_-2px_rgba(0,245,155,0.35)]"><span className="text-sm font-bold">A</span></div><div><h3 className="text-sm font-bold text-white">Aave V3 Yield Pool</h3><div className="text-[10px] text-slate-500 font-mono mt-0.5">USDC · {resolvedChainId === 421614 ? 'Arbitrum Sepolia' : 'Sepolia testnet'}</div></div></div><div className="flex items-center gap-1.5 px-2 py-1 bg-[#00f59b]/10 border border-[#00f59b]/20 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-[#00f59b] animate-pulse" /><span className="text-[9px] font-mono font-bold text-[#00f59b] tracking-wider">ACTIVE</span></div></div>
      {aaveError && <div className="relative z-10 text-xs p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">{aaveError}</div>}
      <div className="relative z-10 grid grid-cols-[auto_1fr] gap-4 items-center"><div className="relative w-24 h-24 flex items-center justify-center"><svg className="w-full h-full -rotate-90" viewBox="0 0 100 100"><circle cx="50" cy="50" r="38" fill="none" stroke="#1c2333" strokeWidth="10" /><circle cx="50" cy="50" r="38" fill="none" stroke="#00f59b" strokeWidth="10" strokeDasharray={`${Math.min(supplyApy, 100) * 2.387} 238.7`} strokeLinecap="round" /></svg><span className="absolute text-sm font-bold font-mono text-white">{aaveMarket ? `${fmt(supplyApy, 2)}%` : '--'}</span></div><div><p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Current supply APY</p><p className="text-2xl font-extrabold text-[#00f59b] font-mono">{aaveMarket ? `${fmt(supplyApy, 4)}%` : isLoadingAave ? 'Loading' : 'N/A'}</p><p className="text-[10px] text-slate-500">Live Aave market data</p></div></div>
      <div className="relative z-10 space-y-3 text-xs"><div className="flex justify-between"><span className="text-slate-400">Available liquidity</span><span className="font-mono text-slate-200">{aaveMarket ? `${fmt(availableLiquidity, 0)} USDC` : '—'}</span></div><div className="h-1.5 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-[#00f59b] rounded-full transition-all" style={{ width: `${liquidityPercent}%` }} /></div><div className="flex justify-between"><span className="text-slate-400">Total position</span><span className="font-mono font-bold text-white">{fmt(totalBalance, 6)} USDC</span></div><div className="h-2 bg-white/10 rounded-full overflow-hidden flex"><div className="h-full bg-[#00f59b]" style={{ width: `${principalPercent}%` }} /><div className="h-full bg-cyan-400" style={{ width: `${100 - principalPercent}%` }} /></div><div className="flex justify-between py-2 px-3 bg-gradient-to-r from-[#00f59b]/20 to-transparent border-l-2 border-[#00f59b] rounded-r-lg"><span className="text-[#00f59b]">Principal / earnings</span><span className="font-mono text-white">{fmt(principal, 6)} / +{fmt(earnings, 6)}</span></div></div>
      <div className="relative z-10 space-y-2 mt-auto"><div className="flex gap-2"><input type="number" placeholder="Deposit amount" className="w-full px-3 py-2 text-xs bg-obsidian-900 border border-white/10 rounded-xl font-mono focus:outline-none focus:border-[#00f59b]/50 text-white placeholder-slate-600" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} disabled={isOpPending || !aaveMarket} /><button onClick={handleAaveDepositOp} disabled={isOpPending || !aaveMarket} className="px-4 py-2 bg-[#00f59b] text-obsidian-950 rounded-xl text-xs font-bold whitespace-nowrap hover:bg-[#1affab] disabled:opacity-50">Deposit</button></div><div className="flex gap-2"><input type="number" placeholder="Withdraw amount" className="w-full px-3 py-2 text-xs bg-obsidian-900 border border-white/10 rounded-xl font-mono focus:outline-none focus:border-slate-500 text-white placeholder-slate-600" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} disabled={isOpPending || !aaveMarket} /><button onClick={handleAaveWithdrawClaimOp} disabled={isOpPending || !aaveMarket} className="px-4 py-2 bg-slate-800 text-slate-300 border border-slate-700 rounded-xl text-xs font-bold whitespace-nowrap hover:bg-slate-700 disabled:opacity-50">Withdraw</button></div></div>
      <button onClick={() => loadAave({ force: true })} disabled={isLoadingAave} className="relative z-10 w-full py-2 bg-obsidian-900 hover:bg-obsidian-800 border border-white/10 text-slate-300 hover:text-[#00f59b] text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2"><RefreshIcon spinning={isLoadingAave} /><span>{isLoadingAave ? 'Loading...' : 'Refresh Aave Market'}</span></button>
    </div>
  );
}
