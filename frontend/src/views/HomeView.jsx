import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ethers } from 'ethers';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { formatNum, shortenAddress, toHex, getEthPriceInUsd, packUserOp, encodeERC7579Single } from '../utils/helpers';
import { sendUserOperation, getUserOpReceipt, estimateUserOperationGas, getDynamicGasFees } from '../utils/bundler';
import { IEntryPointABI, SmartAccountABI } from '../utils/abis';
import {
  Zap, ShieldCheck, Layers, Gift, Clock, Network,
  CheckCircle2, XCircle, ArrowRight, ArrowUpRight,
  RefreshCw, TrendingUp, Activity, Wallet, Box, BarChart3,
  ChevronDown, ArrowDown, Puzzle, Fuel, MapPin, Key, Users,
  Fingerprint, Check, ChevronRight
} from 'lucide-react';

import ChainMarquee from '../components/ChainMarquee';
import CoreStackTabs from '../components/CoreStackTabs';
import AAStackDeepDive from '../components/AAStackDeepDive';
import ModulesShowcase from '../components/ModulesShowcase';
import FAQAccordion from '../components/FAQAccordion';
import FinalCTA from '../components/FinalCTA';
import Newsletter from '../components/Newsletter';
import LandingFooter from '../components/LandingFooter';
const UNISWAP_ROUTER = '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E';
const WETH_SEPOLIA = '0xfff9976782d46cc05630d1f6ebab18b2324d6b14';

const features = [
  { icon: <Zap size={28} />, title: "Gas Abstraction", description: "Pay fees in USDC, no native token required." },
  { icon: <ShieldCheck size={28} />, title: "Smart Ownership", description: "Upgrade, transfer, or recover ownership anytime." },
  { icon: <Layers size={28} />, title: "Batch Transactions", description: "Execute multiple actions in one UserOperation." },
  { icon: <Gift size={28} />, title: "Sponsored Transactions", description: "Let a Paymaster cover gas costs entirely." },
  { icon: <Clock size={28} />, title: "Session-based Signing", description: "Time-bounded validity windows, no permanent approvals." },
  { icon: <Network size={28} />, title: "Bundler Network", description: "Relayed through Skandha bundler, not your EOA." },
];



// ─── Number Formatter for Large Balances ────────────────────────────────────────
const formatCurrencyCompact = (val) => {
  return new Intl.NumberFormat('en-US', {
    notation: val >= 1000000 ? 'compact' : 'standard',
    maximumFractionDigits: 2,
    minimumFractionDigits: val < 1000000 ? 2 : 0
  }).format(val);
};

// ─── Premium SVG Donut Chart ──────────────────────────────────────────────────
function DonutChart({ eoaUSDC, saUSDC }) {
  const total = eoaUSDC + saUSDC;
  const size = 150;
  const strokeWidth = 18;
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const cx = size / 2, cy = size / 2;

  if (total === 0) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap: 8 }}>
        <div style={{ position: 'relative', width: size, height: size }}>
          <svg width={size} height={size}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(22, 163, 74,0.08)" strokeWidth={strokeWidth} />
          </svg>
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize:'1.4rem', fontWeight:800, color:'#141827' }}>0.00</span>
            <span style={{ fontSize:'0.75rem', color:'var(--text-muted)', fontWeight:500, marginTop: 2 }}>USDC total</span>
          </div>
        </div>
      </div>
    );
  }

  const saPct  = saUSDC  / total;
  const saDash  = saPct  * circ;

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap: 10 }}>
      <div className="donut-wrapper" style={{ width: size, height: size, position: 'relative' }}>
        <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
          <defs>
            <linearGradient id="donutGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#111110" />
              <stop offset="100%" stopColor="#16a34a" />
            </linearGradient>
          </defs>
          {/* Base track (represents total balance) */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="url(#donutGradient)" strokeWidth={strokeWidth} />
          {/* SA segment */}
          {saPct > 0 && (
            <circle cx={cx} cy={cy} r={r} fill="none"
              stroke="#111110" strokeWidth={strokeWidth}
              strokeDasharray={`${saDash} ${circ - saDash}`}
              strokeDashoffset={0}
              strokeLinecap="round" />
          )}
        </svg>
        <div className="donut-center-text" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize:'1.4rem', fontWeight:800, color:'#141827' }}>{formatCurrencyCompact(total)}</span>
          <span style={{ fontSize:'0.75rem', color:'var(--text-muted)', fontWeight:500, marginTop: 2 }}>USDC total</span>
        </div>
      </div>
    </div>
  );
}


// ─── Connected Dashboard ──────────────────────────────────────────────────────
function ConnectedDashboard() {
  const {
    eoaAddress, eoaETHBalance, eoaUSDCBalance, eoaEURCBalance,
    smartAccountAddress, saETHBalance, saUSDCBalance, saEURCBalance, saEntryPointDeposit, saOwner,
    paymasterAddress, pmDeposit,
    pendingUserOps,
    setCurrentView, refreshAllData, signer, provider, env, nativeToken, isAmoy,
    trackOp, setGlobalLoading, setSetupStep
  } = useAppContext();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [pmAllowance, setPmAllowance] = useState('0');

  const fetchPmAllowance = async () => {
    if (!signer || !env.USDC_TOKEN || !smartAccountAddress || !paymasterAddress) return;
    try {
      const usdc = new ethers.Contract(env.USDC_TOKEN, ["function allowance(address owner, address spender) view returns (uint256)"], provider);
      const allowance = await usdc.allowance(smartAccountAddress, paymasterAddress);
      setPmAllowance(allowance.toString());
    } catch (err) {
      console.error("Error fetching pm allowance:", err);
    }
  };

  useEffect(() => {
    fetchPmAllowance();
  }, [smartAccountAddress, paymasterAddress, provider]);


  // Swap state
  const [swapAmount, setSwapAmount] = useState('0.001');
  const [swapping, setSwapping] = useState(false);
  const [usePmForSwap, setUsePmForSwap] = useState(false);
  const [selectedGasToken, setSelectedGasToken] = useState(env?.USDC_TOKEN || '');
  
  const trackedTokens = isAmoy 
    ? [{ symbol: 'USDC', address: env?.USDC_TOKEN, decimals: 6 }]
    : [
        { symbol: 'USDC', address: env?.USDC_TOKEN, decimals: 6 },
        { symbol: 'EURC', address: '0x08210f9170f89ab7658f0b5e3ff39b0e03c594d4', decimals: 6 }
      ];

  const [ethPrice, setEthPrice] = useState(3300);
  const [estimatedUsdcOutput, setEstimatedUsdcOutput] = useState('0.00');
  const [isEstimatingOutput, setIsEstimatingOutput] = useState(false);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [showSellDropdown, setShowSellDropdown] = useState(false);
  const [showBuyDropdown, setShowBuyDropdown] = useState(false);

  useEffect(() => {
    const loadPrice = async () => {
      const price = await getEthPriceInUsd(provider, env.PRICE_FEED);
      setEthPrice(price);
    };
    loadPrice();
  }, [provider]);

  useEffect(() => {
    const fetchQuote = async () => {
      if (!provider || !swapAmount || parseFloat(swapAmount) <= 0) {
        setEstimatedUsdcOutput('0.00');
        return;
      }
      setIsEstimatingOutput(true);
      try {
        const QUOTER_V2 = "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3";
        const quoter = new ethers.Contract(
          QUOTER_V2,
          [
            "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"
          ],
          provider
        );
        const amountIn = ethers.parseEther(swapAmount);
        const params = {
          tokenIn: WETH_SEPOLIA,
          tokenOut: env.USDC_TOKEN,
          amountIn: amountIn,
          fee: 3000,
          sqrtPriceLimitX96: 0
        };
        const result = await quoter.quoteExactInputSingle.staticCall(params);
        setEstimatedUsdcOutput(ethers.formatUnits(result.amountOut, 6));
      } catch (err) {
        console.warn("Uniswap V3 quote exact input failed, falling back to Chainlink feed:", err);
        const rawOutput = parseFloat(swapAmount) * ethPrice;
        setEstimatedUsdcOutput(rawOutput > 0 && rawOutput < 0.01 ? "< 0.01" : rawOutput.toFixed(2));
      } finally {
        setIsEstimatingOutput(false);
      }
    };

    const delayDebounceFn = setTimeout(() => {
      fetchQuote();
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [swapAmount, provider, ethPrice]);

  // Stats derived from balances
  const eoaUSDC = parseFloat(ethers.formatUnits(eoaUSDCBalance || '0', 6));
  const saUSDC = parseFloat(ethers.formatUnits(saUSDCBalance || '0', 6));
  const eoaEURC = parseFloat(ethers.formatUnits(eoaEURCBalance || '0', 6));
  const saEURC = parseFloat(ethers.formatUnits(saEURCBalance || '0', 6));
  const eoaETH = parseFloat(ethers.formatEther(eoaETHBalance || '0'));
  const saETH = parseFloat(ethers.formatEther(saETHBalance || '0'));
  const confirmedOps = (pendingUserOps || []).filter(op => typeof op === 'object' && op.txHash);

  // Checklist
  const checklist = [
    { label: 'EOA Wallet Connected', done: !!eoaAddress },
    { label: 'Smart Account Deployed', done: !!smartAccountAddress },
    { label: 'Smart Account Funded (USDC)', done: saUSDC > 0 },
    { label: 'Paymaster Approved', done: Number(pmAllowance) > 0 },
  ];
  const checklistPct = Math.round((checklist.filter(c => c.done).length / checklist.length) * 100);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshAllData();
    await fetchPmAllowance();
    setRefreshing(false);
  };

  const handleQuickSwap = async () => {
    if (!signer || !smartAccountAddress) {
      toast.error("Connect Smart Account first!");
      return;
    }

    if (usePmForSwap && !paymasterAddress) {
      toast.error("Paymaster address not found! Please set up Paymaster first.");
      return;
    }

    if (parseFloat(saETHBalance || "0") < parseFloat(swapAmount || "0.001")) {
      toast.error(`Not enough ${nativeToken} in Smart Account to swap!`);
      return;
    }

    setSwapping(true);
    setGlobalLoading(true, `Swapping ${nativeToken} to USDC...`);
    try {
      const amtIn = ethers.parseEther(swapAmount || "0.001");

      // Uniswap V3 exactInputSingle interface
      const swapIface = new ethers.Interface([
        "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
      ]);

      const params = {
        tokenIn: WETH_SEPOLIA,
        tokenOut: env.USDC_TOKEN,
        fee: 3000,
        recipient: smartAccountAddress,
        amountIn: amtIn,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0
      };

      const innerCallData = swapIface.encodeFunctionData("exactInputSingle", [
        [params.tokenIn, params.tokenOut, params.fee, params.recipient, params.amountIn, params.amountOutMinimum, params.sqrtPriceLimitX96]
      ]);

      const callData = encodeERC7579Single(UNISWAP_ROUTER, amtIn, innerCallData);

      const entryPoint = new ethers.Contract(env.ENTRY_POINT, IEntryPointABI, provider);
      const nonce = await entryPoint.getNonce(smartAccountAddress, 0);
      const { maxPriorityFeePerGas, maxFeePerGas } = await getDynamicGasFees(provider);

      const userOp = {
        sender: smartAccountAddress,
        nonce: toHex(nonce),
        factory: "0x",
        factoryData: "0x",
        callData: callData,
        callGasLimit: "0x0",
        verificationGasLimit: "0x0",
        preVerificationGas: "0x0",
        maxFeePerGas: toHex(maxFeePerGas),
        maxPriorityFeePerGas: toHex(maxPriorityFeePerGas),
        paymaster: "0x",
        paymasterVerificationGasLimit: "0x",
        paymasterPostOpGasLimit: "0x",
        paymasterData: "0x",
        signature: "0x"
      };

      // Try to estimate gas WITHOUT paymaster to bypass paymaster simulation errors
      try {
        const est = await estimateUserOperationGas(userOp);
        userOp.callGasLimit = toHex(est.callGasLimit);
        userOp.verificationGasLimit = toHex(est.verificationGasLimit);
        userOp.preVerificationGas = toHex(est.preVerificationGas);
      } catch (err) {
        console.warn("Estimation failed, using defaults", err);
      }

      // Attach Paymaster exactly after estimation is done
      if (usePmForSwap) {
         if (!paymasterAddress) throw new Error("Paymaster address not set!");
         userOp.paymaster = paymasterAddress;
         userOp.paymasterVerificationGasLimit = toHex(150000); // enough for safeTransferFrom in validatePaymasterUserOp
         userOp.paymasterPostOpGasLimit = toHex(150000);       // enough for 2x Chainlink reads + safeTransfer in postOp
         userOp.paymasterData = selectedGasToken;
      }

      const hash = await entryPoint.getUserOpHash(packUserOp(userOp));
      userOp.signature = await signer.signMessage(ethers.getBytes(hash));

      toast.info(`Sending UserOp to swap ${nativeToken} for USDC...`);
      const opHash = await sendUserOperation(userOp);
      toast.success("Bundler accepted the transaction!");

      // Fire and forget — global tracker handles confirmation in background
      trackOp(opHash, `${nativeToken} → USDC Swap`);
      toast.withAction(
        'Swap submitted to bundler!',
        'View in History →',
        () => setCurrentView('history'),
        'info'
      );

    } catch (err) {
      toast.error("Bundler rejected the transaction!");
      if (err.code === 4001) toast.error("Transaction rejected by user");
      else toast.error(err.reason || err.message || "Failed to execute swap");
    } finally {
      setSwapping(false);
      setGlobalLoading(false);
    }
  };

  return (
    <div className="animate-fade-in flex flex-col gap-6" style={{ paddingBottom: '4rem' }}>

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>
            Welcome back, <span className="text-gradient">{shortenAddress(eoaAddress)}</span>
          </h1>
          <p className="text-sm text-muted">Your Smart Account Dashboard — {isAmoy ? "Amoy" : "Sepolia"} Testnet</p>
        </div>
        <button
          className="btn btn-secondary flex items-center gap-2"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* ── Wallet Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* EOA Card */}
        <div className="glass-card wallet-summary-card wallet-summary-card--signer flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="wallet-summary-card__icon">
                <Wallet size={18} />
              </div>
              <div>
                <div className="text-xs text-muted">Signer Wallet (Connected)</div>
                <div className="font-mono text-sm font-semibold">{shortenAddress(eoaAddress)}</div>
              </div>
            </div>
            <div className="wallet-summary-card__pill">EOA</div>
          </div>
          <div className="wallet-summary-card__divider" />
          <div className="flex justify-between">
            <div>
              <div className="text-xs text-muted mb-1">{nativeToken}</div>
              <div className="font-bold text-lg">{eoaETH.toFixed(4)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted mb-1">USDC</div>
              <div className="font-bold text-lg">{eoaUSDC.toFixed(2)}</div>
            </div>
            {!isAmoy && (
              <div className="text-right">
                <div className="text-xs text-muted mb-1">EURC</div>
                <div className="font-bold text-lg">{eoaEURC.toFixed(2)}</div>
              </div>
            )}
          </div>
        </div>

        {/* Smart Account Card */}
        <div className={`glass-card wallet-summary-card ${smartAccountAddress ? 'wallet-summary-card--smart' : 'wallet-summary-card--empty'} flex flex-col gap-4`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="wallet-summary-card__icon">
                <Box size={18} />
              </div>
              <div>
                <div className="text-xs text-muted">Smart Vault</div>
                <div className="font-mono text-sm font-semibold">
                  {smartAccountAddress ? shortenAddress(smartAccountAddress) : <span className="text-muted">Not deployed</span>}
                </div>
                {smartAccountAddress && saOwner && (
                  <div className="text-[10px] text-muted mt-0.5">Owner: {shortenAddress(saOwner)}</div>
                )}
              </div>
            </div>
            {smartAccountAddress
              ? <div className="wallet-summary-card__pill wallet-summary-card__pill--success">Active</div>
              : <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: '0.75rem' }} onClick={() => setCurrentView('setup')}>Setup →</button>
            }
          </div>
          <div className="wallet-summary-card__divider" />
          {smartAccountAddress ? (
            <div className="flex justify-between">
              <div>
                <div className="text-xs text-muted mb-1">{nativeToken}</div>
                <div className="font-bold text-lg">{saETH.toFixed(4)}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted mb-1">USDC</div>
                <div className="font-bold text-lg">{saUSDC.toFixed(2)}</div>
              </div>
              {!isAmoy && (
                <div className="text-center">
                  <div className="text-xs text-muted mb-1">EURC</div>
                  <div className="font-bold text-lg">{saEURC.toFixed(2)}</div>
                </div>
              )}
              <div className="text-right">
                <div className="text-xs text-muted mb-1">EP Deposit</div>
                <div className="font-bold text-lg">{parseFloat(ethers.formatEther(saEntryPointDeposit || '0')).toFixed(4)}</div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">Deploy a Smart Account to enable gasless transactions and token management.</p>
          )}
        </div>
      </div>

      {/* ── Middle Row: Setup + Portfolio + Quick Actions ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* ─ Setup Complete Card ─ */}
        <div className="glass-card flex flex-col gap-4" style={{ paddingBottom:'1.25rem' }}>
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 style={{ fontSize:'1rem', margin:0, fontWeight:700 }}>Setup Complete</h3>
              <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:2 }}>Your smart account is ready to go</p>
            </div>
            <span style={{
              padding:'3px 10px', borderRadius:99, fontSize:'0.65rem', fontWeight:700,
              background:'rgba(22, 163, 74,0.1)', color:'#16a34a',
              border:'1px solid rgba(22, 163, 74,0.22)'
            }}>Active</span>
          </div>

          {/* Progress Bar */}
          <div>
            <div className="flex justify-between" style={{ marginBottom:6 }}>
              <span style={{ fontSize:'0.72rem', color:'var(--text-muted)' }}>Progress</span>
              <span style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--primary)' }}>{checklistPct}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width:`${checklistPct}%` }} />
            </div>
          </div>

          {/* Timeline */}
          <div className="setup-timeline">
            {checklist.map((item, i) => (
              <div key={i} className="setup-timeline-item">
                <div className={`setup-timeline-icon ${item.done ? 'setup-timeline-icon--done' : 'setup-timeline-icon--pending'}`}>
                  {item.done
                    ? <CheckCircle2 size={15} />
                    : <XCircle size={15} />
                  }
                </div>
                <div style={{ flex:1, minWidth:0, paddingTop:2 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 }}>
                    <span style={{ fontSize:'0.8rem', fontWeight:600, color:'#141827' }}>{item.label}</span>
                    <span className={item.done ? 'setup-done-pill' : 'setup-pending-pill'}>
                      {item.done ? 'Done' : 'Pending'}
                    </span>
                  </div>
                  <p style={{ fontSize:'0.68rem', color:'var(--text-muted)', margin:'2px 0 0' }}>
                    {i === 0 && 'Your EOA wallet has been connected'}
                    {i === 1 && 'Your smart account is now live on-chain'}
                    {i === 2 && (saUSDC > 0 ? `Successfully funded with ${saUSDC.toFixed(2)} USDC` : 'Add USDC to enable gasless transactions')}
                    {i === 3 && `Gasless transactions enabled`}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* CTA Banner */}
          <div className="setup-cta-banner">
            <div className="setup-cta-icon">
              <Zap size={18} />
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:'0.8rem', fontWeight:700, color:'#141827' }}>Ready for Gasless Transactions</div>
              <div style={{ fontSize:'0.68rem', color:'var(--text-muted)', marginTop:2 }}>Powered by ERC-4337</div>
            </div>
          </div>
        </div>

        {/* ─ USDC Portfolio Card ─ */}
        <div className="glass-card flex flex-col gap-4" style={{ paddingBottom:'1.25rem' }}>
          <div className="flex items-center gap-2">
            <div style={{ width:32, height:32, borderRadius:9, background:'rgba(22, 163, 74,0.1)', display:'grid', placeItems:'center', color:'var(--primary)', flexShrink:0 }}>
              <BarChart3 size={16} />
            </div>
            <h3 style={{ fontSize:'1rem', margin:0, fontWeight:700 }}>USDC Portfolio</h3>
          </div>

          {/* Big balance */}
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:'1.8rem', fontWeight:800, color:'#141827', letterSpacing:'-0.02em' }}>
              ${formatCurrencyCompact(eoaUSDC + saUSDC)}
            </div>
            <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:3 }}>Total USDC Balance</div>
          </div>

          {/* Donut */}
          <div style={{ display:'flex', justifyContent:'center' }}>
            <DonutChart eoaUSDC={eoaUSDC} saUSDC={saUSDC} />
          </div>

          {/* Legend */}
          {(() => {
            const total = eoaUSDC + saUSDC;
            const eoaPct = total > 0 ? Math.round((eoaUSDC / total) * 100) : 0;
            const saPct  = total > 0 ? Math.round((saUSDC  / total) * 100) : 0;
            return (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:'0.78rem' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                    <span style={{ width:10, height:10, borderRadius:3, background:'#16a34a', display:'inline-block', flexShrink:0 }} />
                    <span style={{ color:'var(--text-muted)' }}>EOA Wallet</span>
                    <span style={{ fontWeight:700, color:'#141827' }}>{eoaPct}%</span>
                  </div>
                  <span style={{ fontWeight:700, color:'#141827' }}>${formatCurrencyCompact(eoaUSDC)}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:'0.78rem' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                    <span style={{ width:10, height:10, borderRadius:3, background:'#111110', display:'inline-block', flexShrink:0 }} />
                    <span style={{ color:'var(--text-muted)' }}>Smart Account</span>
                    <span style={{ fontWeight:700, color:'#141827' }}>{saPct}%</span>
                  </div>
                  <span style={{ fontWeight:700, color:'#141827' }}>${formatCurrencyCompact(saUSDC)}</span>
                </div>
              </div>
            );
          })()}

          {/* Allocation mini cards */}
          {(() => {
            const total = eoaUSDC + saUSDC;
            const eoaPct = total > 0 ? Math.round((eoaUSDC / total) * 100) : 0;
            const saPct  = total > 0 ? Math.round((saUSDC  / total) * 100) : 0;
            return (
              <div style={{ display:'flex', gap:8 }}>
                <div className="portfolio-alloc-card">
                  <div style={{ fontSize:'0.7rem', fontWeight:600, color:'var(--text-muted)' }}>EOA Wallet</div>
                  <div style={{ fontSize:'1rem', fontWeight:800, color:'#16a34a' }}>{eoaPct}%</div>
                  <div className="alloc-progress">
                    <div style={{ width:`${eoaPct}%`, height:'100%', background:'#16a34a', borderRadius:99 }} />
                  </div>
                  <div style={{ fontSize:'0.68rem', color:'var(--text-muted)', marginTop:4 }}>${formatCurrencyCompact(eoaUSDC)} USDC</div>
                </div>
                <div className="portfolio-alloc-card">
                  <div style={{ fontSize:'0.7rem', fontWeight:600, color:'var(--text-muted)' }}>Smart Account</div>
                  <div style={{ fontSize:'1rem', fontWeight:800, color:'#111110' }}>{saPct}%</div>
                  <div className="alloc-progress">
                    <div style={{ width:`${saPct}%`, height:'100%', background:'#111110', borderRadius:99 }} />
                  </div>
                  <div style={{ fontSize:'0.68rem', color:'var(--text-muted)', marginTop:4 }}>${formatCurrencyCompact(saUSDC)} USDC</div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* ─ Quick Actions + Swap Card ─ */}
        <div className="glass-card flex flex-col gap-2" style={{ height:'100%', boxSizing:'border-box', paddingBottom: '1rem' }}>
          <div className="flex items-center gap-2 mb-1">
            <div style={{ width:32, height:32, borderRadius:9, background:'rgba(22, 163, 74,0.1)', display:'grid', placeItems:'center', color:'var(--primary)', flexShrink:0 }}>
              <Zap size={16} />
            </div>
            <h3 style={{ fontSize:'1rem', margin:0, fontWeight:700 }}>Quick Actions</h3>
          </div>

          <button className="quick-action-btn quick-action-btn--primary" onClick={() => setCurrentView('send')}>
            <div className="quick-action-icon quick-action-icon--primary"><ArrowUpRight size={18} /></div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:'0.85rem', fontWeight:700 }}>Transfer Asset</div>
              <div style={{ fontSize:'0.65rem', opacity:0.8 }}>Send tokens to any address</div>
            </div>
            <ArrowRight size={15} style={{ opacity:0.7 }} />
          </button>

          <button 
            className="quick-action-btn quick-action-btn--secondary" 
            onClick={() => {
              setSetupStep(2); // Step 2 is Fund ETH
              setCurrentView('setup');
            }}
          >
            <div className="quick-action-icon quick-action-icon--secondary"><Wallet size={18} /></div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:'0.85rem', fontWeight:600, color:'#141827' }}>Fund {nativeToken}</div>
              <div style={{ fontSize:'0.65rem', color:'var(--text-muted)' }}>Top up your EOA wallet</div>
            </div>
            <ArrowRight size={15} style={{ color:'var(--text-muted)' }} />
          </button>

          <button 
            className="quick-action-btn quick-action-btn--secondary" 
            onClick={() => {
              setSetupStep(3); // Step 3 is Pull USDC
              setCurrentView('setup');
            }}
          >
            <div className="quick-action-icon quick-action-icon--secondary"><Box size={18} /></div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:'0.85rem', fontWeight:600, color:'#141827' }}>Fund USDC</div>
              <div style={{ fontSize:'0.65rem', color:'var(--text-muted)' }}>Fund Smart Account</div>
            </div>
            <ArrowRight size={15} style={{ color:'var(--text-muted)' }} />
          </button>

          <button className="quick-action-btn quick-action-btn--secondary" onClick={() => setCurrentView('paymaster')}>
            <div className="quick-action-icon quick-action-icon--secondary"><ShieldCheck size={18} /></div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:'0.85rem', fontWeight:600, color:'#141827' }}>Approve Paymaster</div>
              <div style={{ fontSize:'0.65rem', color:'var(--text-muted)' }}>Enable gas sponsorship</div>
            </div>
            <ArrowRight size={15} style={{ color:'var(--text-muted)' }} />
          </button>

          {/* Quick Swap button */}
          {!isAmoy && (
            <button className="quick-action-btn quick-action-btn--secondary" onClick={() => setShowSwapModal(true)}>
              <div className="quick-action-icon quick-action-icon--secondary"><Activity size={18} /></div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:'0.85rem', fontWeight:600, color:'#141827' }}>Quick Swap</div>
                <div style={{ fontSize:'0.65rem', color:'var(--text-muted)' }}>{nativeToken} → USDC via Uniswap V3</div>
              </div>
              <ArrowRight size={15} style={{ color:'var(--text-muted)' }} />
            </button>
          )}
        </div>
      </div>

      {/* ── Quick Swap Modal ────────────────────────────── */}
      {showSwapModal && createPortal(
        <div
          onClick={() => {
            setShowSwapModal(false);
            setShowSellDropdown(false);
            setShowBuyDropdown(false);
          }}
          style={{
            position:'fixed', inset:0, zIndex:9999,
            background:'rgba(244, 241, 255, 0.85)',
            backdropFilter:'blur(8px)',
            WebkitBackdropFilter:'blur(8px)',
            display:'flex', alignItems:'center', justifyContent:'center',
            padding:'1rem'
          }}
        >
          <div
            onClick={e => {
              e.stopPropagation();
              // close dropdowns if clicking elsewhere in modal
              setShowSellDropdown(false);
              setShowBuyDropdown(false);
            }}
            style={{
              background:'#fff',
              borderRadius:24,
              padding:'1rem',
              width:'100%',
              maxWidth:440,
              boxShadow:'0 32px 80px rgba(0, 0, 0,0.18)',
              position:'relative'
            }}
          >
            {/* Modal Header */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.5rem 0.5rem 1rem' }}>
              <div style={{ fontSize:'1.1rem', fontWeight:700, color:'#141827' }}>Swap</div>
              <button onClick={() => setShowSwapModal(false)} style={{ color:'#64748b' }}><XCircle size={22} /></button>
            </div>

            {/* Sell Card */}
            <div style={{ background:'rgba(242,244,248,0.7)', borderRadius:20, padding:'1rem 1.2rem', position:'relative' }}>
              <div style={{ fontSize:'0.85rem', color:'var(--text-muted)', marginBottom:4 }}>Sell</div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <input
                  type="number"
                  placeholder="0"
                  value={swapAmount}
                  onChange={e => setSwapAmount(e.target.value)}
                  style={{
                    border:'none', background:'transparent', outline:'none',
                    fontSize:'2.2rem', fontWeight:600, color:'#141827', width:'100%', padding:0
                  }}
                />
                
                <div style={{ position:'relative', zIndex:20 }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowSellDropdown(!showSellDropdown);
                      setShowBuyDropdown(false);
                    }}
                    style={{
                      display:'flex', alignItems:'center', gap:6, background:'#fff', borderRadius:99,
                      padding:'4px 10px 4px 4px', border:'1px solid rgba(0,0,0,0.05)', boxShadow:'0 2px 8px rgba(0,0,0,0.04)',
                      cursor:'pointer', transition:'all 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                  >
                    <span style={{ width:24, height:24, borderRadius:'50%', background:'#627EEA', display:'grid', placeItems:'center' }}>
                      <svg viewBox="0 0 32 32" width="14" height="14">
                        <path d="M15.925 23.969L15.875 24.02l-9.819-5.799L15.925 32l9.897-13.78-9.897 5.749z" fill="#fff" opacity="0.6"/>
                        <path d="M16.075 23.969l9.897-5.749-9.897-4.426v10.175z" fill="#fff" opacity="0.4"/>
                        <path d="M15.925 13.794L6.056 18.22l9.869 4.426v-8.852z" fill="#fff" opacity="0.8"/>
                        <path d="M15.925 0L6.056 16.485l9.869 4.373V0z" fill="#fff"/>
                        <path d="M16.075 0v20.858l9.897-4.373L16.075 0z" fill="#fff" opacity="0.6"/>
                        <path d="M15.925 20.858l-9.869-4.373L15.925 0v20.858z" fill="#fff" opacity="0.4"/>
                      </svg>
                    </span>
                    <span style={{ fontSize:'0.9rem', fontWeight:700, color:'#141827' }}>{nativeToken}</span>
                    <ChevronDown size={16} color="#64748b" />
                  </button>

                  {/* Sell Dropdown */}
                  {showSellDropdown && (
                    <div style={{
                      position:'absolute', top:'100%', right:0, marginTop:8, background:'#fff',
                      border:'1px solid rgba(0,0,0,0.08)', borderRadius:12, padding:'0.5rem',
                      width:220, boxShadow:'0 10px 25px rgba(0,0,0,0.1)', zIndex:30
                    }}>
                      <div style={{
                        display:'flex', alignItems:'center', gap:8, padding:'0.5rem',
                        borderRadius:8, background:'rgba(22, 163, 74,0.06)', cursor:'pointer'
                      }}>
                        <span style={{ width:24, height:24, borderRadius:'50%', background:'#627EEA', display:'grid', placeItems:'center' }}>
                          <svg viewBox="0 0 32 32" width="14" height="14">
                            <path d="M15.925 0L6.056 16.485l9.869 4.373V0z" fill="#fff"/>
                            <path d="M16.075 0v20.858l9.897-4.373L16.075 0z" fill="#fff" opacity="0.6"/>
                          </svg>
                        </span>
                        <span style={{ fontWeight:700, color:'#141827' }}>{nativeToken}</span>
                      </div>
                      <div style={{ marginTop:4, paddingTop:6, borderTop:'1px solid rgba(0,0,0,0.05)', textAlign:'center', fontSize:'0.7rem', color:'var(--text-muted)' }}>
                        More currencies coming soon
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ fontSize:'0.8rem', color:'var(--text-muted)' }}>
                ${(parseFloat(swapAmount || 0) * ethPrice).toFixed(2)}
              </div>
            </div>

            {/* Overlapping Arrow */}
            <div style={{ height:4, display:'flex', justifyContent:'center', position:'relative', zIndex:10 }}>
              <div style={{
                position:'absolute', top:-16, width:36, height:36, background:'#fff',
                borderRadius:12, display:'grid', placeItems:'center', border:'4px solid #fff'
              }}>
                <div style={{
                  width:'100%', height:'100%', background:'rgba(242,244,248,1)', borderRadius:8,
                  display:'grid', placeItems:'center', color:'#64748b'
                }}>
                  <ArrowDown size={16} />
                </div>
              </div>
            </div>

            {/* Buy Card */}
            <div style={{ background:'rgba(242,244,248,0.7)', borderRadius:20, padding:'1rem 1.2rem', marginTop:0 }}>
              <div style={{ fontSize:'0.85rem', color:'var(--text-muted)', marginBottom:4 }}>Buy</div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                {isEstimatingOutput ? (
                  <div style={{ fontSize:'2.2rem', fontWeight:600, color:'#aaa' }}>...</div>
                ) : (
                  <input
                    type="number"
                    readOnly
                    value={parseFloat(estimatedUsdcOutput || 0).toFixed(2)}
                    style={{
                      border:'none', background:'transparent', outline:'none',
                      fontSize:'2.2rem', fontWeight:600, color:'#141827', width:'100%', padding:0
                    }}
                  />
                )}
                
                <div style={{ position:'relative', zIndex:15 }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowBuyDropdown(!showBuyDropdown);
                      setShowSellDropdown(false);
                    }}
                    style={{
                      display:'flex', alignItems:'center', gap:6, background:'#fff', borderRadius:99,
                      padding:'4px 10px 4px 4px', border:'1px solid rgba(0,0,0,0.05)', boxShadow:'0 2px 8px rgba(0,0,0,0.04)',
                      cursor:'pointer', transition:'all 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                  >
                    <span style={{ width:24, height:24, borderRadius:'50%', background:'#2775CA', display:'grid', placeItems:'center' }}>
                      <svg viewBox="0 0 32 32" width="16" height="16">
                        <circle cx="16" cy="16" r="16" fill="#fff" opacity="0.15"/>
                        <path d="M20.25 18.91c0-1.84-1.25-2.73-3.92-3.14-1.92-.3-2.31-.77-2.31-1.5 0-.74.67-1.35 2-1.35 1.25 0 2.22.42 2.65.88l1.35-2.07c-.77-.77-2-1.35-3.35-1.5v-2.7h-2.31v2.7c-2 .23-3.65 1.42-3.65 3.35 0 1.92 1.42 2.65 3.85 3.08 2 .35 2.38.92 2.38 1.62 0 .88-.81 1.46-2.08 1.46-1.54 0-2.81-.62-3.42-1.23l-1.42 2.15c.88.92 2.31 1.65 3.96 1.88v2.73h2.31v-2.73c2.08-.27 3.96-1.5 3.96-3.65z" fill="#FFF"/>
                      </svg>
                    </span>
                    <span style={{ fontSize:'0.9rem', fontWeight:700, color:'#141827' }}>USDC</span>
                    <ChevronDown size={16} color="#64748b" />
                  </button>

                  {/* Buy Dropdown */}
                  {showBuyDropdown && (
                    <div style={{
                      position:'absolute', top:'100%', right:0, marginTop:8, background:'#fff',
                      border:'1px solid rgba(0,0,0,0.08)', borderRadius:12, padding:'0.5rem',
                      width:220, boxShadow:'0 10px 25px rgba(0,0,0,0.1)', zIndex:30
                    }}>
                      <div style={{
                        display:'flex', alignItems:'center', gap:8, padding:'0.5rem',
                        borderRadius:8, background:'rgba(22, 163, 74,0.06)', cursor:'pointer'
                      }}>
                        <span style={{ width:24, height:24, borderRadius:'50%', background:'#2775CA', display:'grid', placeItems:'center' }}>
                          <svg viewBox="0 0 32 32" width="16" height="16">
                            <path d="M20.25 18.91c0-1.84-1.25-2.73-3.92-3.14-1.92-.3-2.31-.77-2.31-1.5 0-.74.67-1.35 2-1.35 1.25 0 2.22.42 2.65.88l1.35-2.07c-.77-.77-2-1.35-3.35-1.5v-2.7h-2.31v2.7c-2 .23-3.65 1.42-3.65 3.35 0 1.92 1.42 2.65 3.85 3.08 2 .35 2.38.92 2.38 1.62 0 .88-.81 1.46-2.08 1.46-1.54 0-2.81-.62-3.42-1.23l-1.42 2.15c.88.92 2.31 1.65 3.96 1.88v2.73h2.31v-2.73c2.08-.27 3.96-1.5 3.96-3.65z" fill="#FFF"/>
                          </svg>
                        </span>
                        <span style={{ fontWeight:700, color:'#141827' }}>USDC</span>
                      </div>
                      <div style={{ marginTop:4, paddingTop:6, borderTop:'1px solid rgba(0,0,0,0.05)', textAlign:'center', fontSize:'0.7rem', color:'var(--text-muted)' }}>
                        More currencies coming soon
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ fontSize:'0.8rem', color:'var(--text-muted)' }}>
                ≈ ${parseFloat(estimatedUsdcOutput || 0).toFixed(2)}
              </div>
            </div>

            {/* Paymaster Toggle */}
            <div style={{
              display:'flex', flexDirection:'column', gap:8, margin:'1rem 0',
              padding:'0.85rem 1rem', background:'rgba(22, 163, 74,0.05)', borderRadius:16, border:'1px solid rgba(22, 163, 74,0.1)'
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <input type="checkbox" id="pmSwapModalToggle" checked={usePmForSwap} onChange={e => setUsePmForSwap(e.target.checked)} style={{ accentColor:'var(--primary)', width:16, height:16 }} />
                <label htmlFor="pmSwapModalToggle" style={{ fontSize:'0.85rem', color:'#141827', cursor:'pointer', flex:1, fontWeight:600 }}>
                  Sponsor gas with Paymaster
                </label>
                <span className="gasless-pill" style={{ opacity: usePmForSwap ? 1 : 0, transition: 'opacity 0.2s', pointerEvents: usePmForSwap ? 'auto' : 'none' }}>Gasless</span>
              </div>
              {usePmForSwap && (
                <div style={{ display:'flex', alignItems:'center', gap:10, paddingLeft:26 }}>
                  <label style={{ fontSize:'0.8rem', color:'var(--text-muted)' }}>Gas Token</label>
                  <select 
                    style={{ background:'rgba(0,0,0,0.05)', border:'none', borderRadius:8, padding:'4px 8px', fontSize:'0.8rem', outline:'none' }}
                    value={selectedGasToken} 
                    onChange={(e) => setSelectedGasToken(e.target.value)}
                  >
                    {trackedTokens.map(t => (
                      <option key={t.symbol} value={t.address}>{t.symbol}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Swap CTA */}
            <button
              className="btn btn-primary"
              style={{
                width:'100%', fontWeight:700, fontSize:'1.1rem', padding:'1rem', borderRadius:16,
                cursor:swapping ? 'not-allowed' : 'pointer', transition:'all 0.2s',
                opacity: swapping ? 0.7 : 1
              }}
              onClick={async () => {
                await handleQuickSwap();
                if (!swapping) {
                  setShowSwapModal(false);
                  setShowSellDropdown(false);
                  setShowBuyDropdown(false);
                }
              }}
              disabled={swapping}
            >
              {swapping ? 'Swapping...' : 'Swap'}
            </button>
            <div style={{ textAlign:'center', marginTop:12, fontSize:'0.7rem', color:'var(--text-muted)' }}>
              Via Smart Account → Uniswap V3 Router
            </div>
          </div>
        </div>,
        document.body
      )}



    </div>
  );
}

// ─── Landing (Not Connected) ──────────────────────────────────────────────────
function LandingPage() {
  const { connectWallet, isConnecting } = useAppContext();
  return (
    <div className="aa-landing animate-fade-in">
      <nav className="aa-landing-nav">
        <button className="aa-landing-logo" type="button" aria-label="Smart Wallet home">
          <span className="aa-logo-mark"><Zap size={18} /></span>
          <span>Smart Wallet</span>
        </button>
        <div className="aa-landing-nav-center" aria-hidden="true" />
        <button className="aa-connect-btn" onClick={connectWallet} disabled={isConnecting}>
          {isConnecting ? (
            <><div className="loader" /> Connecting</>
          ) : (
            <><Wallet size={17} /> Connect Wallet</>
          )}
        </button>
      </nav>

      <section className="aa-hero">
        <div className="aa-hero-grid" aria-hidden="true" />
        <div className="aa-hero-glow aa-hero-glow-one" />
        <div className="aa-hero-glow aa-hero-glow-two" />

        <div className="aa-announcement">
          <span />
          ERC-7579 Modular Accounts now live
        </div>

        <div className="aa-hero-content">
          <div className="aa-hero-badge">ERC-4337 · ERC-7579 · Modular · Gasless</div>
          <h1>
            Account Abstraction,
            <span>Done Right.</span>
          </h1>
          <p>
            Modular smart accounts powered by ERC-4337 and ERC-7579. Session keys,
            social recovery, WebAuthn, and gasless UX for production-ready wallets.
          </p>
          <div className="aa-hero-actions">
            <button className="aa-primary-cta" onClick={connectWallet} disabled={isConnecting}>
              {isConnecting ? 'Connecting...' : 'Start Building'}
              <ArrowRight size={18} />
            </button>
            <button className="aa-secondary-cta" type="button">
              Read the Docs
              <ArrowUpRight size={17} />
            </button>
          </div>
        </div>

        <div className="aa-feature-strip">
          {features.slice(0, 3).map((f, i) => (
            <div key={i} className="aa-mini-card">
              <div>{f.icon}</div>
              <span>{f.title}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="aa-feature-section">
        <div className="aa-section-heading">
          <span>Infrastructure stack</span>
          <h2>One wallet layer for modern Account Abstraction.</h2>
        </div>
        <div className="aa-feature-grid">
          {features.map((f, i) => (
            <div key={i} className="aa-feature-card" style={{ animationDelay: `${i * 0.05}s` }}>
              <div className="aa-feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.description}</p>
            </div>
          ))}
        </div>
      </section>
      <ChainMarquee />
      <CoreStackTabs />
      <AAStackDeepDive />
      <ModulesShowcase />
      <FAQAccordion />
      <FinalCTA connectWallet={connectWallet} isConnecting={isConnecting} />
      <Newsletter />
      <LandingFooter />
    </div>
  );
}

// ─── Root Export ──────────────────────────────────────────────────────────────
export default function HomeView() {
  const { eoaAddress } = useAppContext();
  return eoaAddress ? <ConnectedDashboard /> : <LandingPage />;
}
