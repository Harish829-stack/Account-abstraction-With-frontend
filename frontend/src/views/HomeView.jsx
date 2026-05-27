import React, { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { formatNum, shortenAddress, toHex } from '../utils/helpers';
import { sendUserOperation, getUserOpReceipt, estimateUserOperationGas } from '../utils/bundler';
import { IEntryPointABI, SmartAccountABI } from '../utils/abis';
import {
  Zap, ShieldCheck, Layers, Gift, Clock, Network,
  CheckCircle2, XCircle, ArrowRight, ArrowUpRight,
  RefreshCw, TrendingUp, Activity, Wallet, Box, BarChart3
} from 'lucide-react';

const UNISWAP_ROUTER = '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E';
const WETH_SEPOLIA = '0xfff9976782d46cc05630d1f6ebab18b2324d6b14';

const features = [
  { icon: <Zap size={28} />, title: "Gas Abstraction", description: "Pay fees in USDC, no ETH required." },
  { icon: <ShieldCheck size={28} />, title: "Smart Ownership", description: "Upgrade, transfer, or recover ownership anytime." },
  { icon: <Layers size={28} />, title: "Batch Transactions", description: "Execute multiple actions in one UserOperation." },
  { icon: <Gift size={28} />, title: "Sponsored Transactions", description: "Let a Paymaster cover gas costs entirely." },
  { icon: <Clock size={28} />, title: "Session-based Signing", description: "Time-bounded validity windows, no permanent approvals." },
  { icon: <Network size={28} />, title: "Bundler Network", description: "Relayed through Skandha bundler, not your EOA." },
];



// ─── Mini Donut Chart (pure CSS) ─────────────────────────────────────────────
function DonutChart({ eoaUSDC, saUSDC }) {
  const total = eoaUSDC + saUSDC;
  if (total === 0) {
    return (
      <div className="flex items-center justify-center" style={{ width: 120, height: 120 }}>
        <div style={{
          width: 110, height: 110, borderRadius: '50%',
          border: '10px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.65rem', color: 'var(--color-muted)', textAlign: 'center'
        }}>No USDC</div>
      </div>
    );
  }
  const eoaPct = (eoaUSDC / total) * 100;
  const saPct = (saUSDC / total) * 100;
  // conic-gradient donut
  const gradient = `conic-gradient(
    var(--primary) 0% ${eoaPct}%,
    var(--accent-blue) ${eoaPct}% 100%
  )`;
  return (
    <div className="flex flex-col items-center gap-3">
      <div style={{ position: 'relative', width: 110, height: 110 }}>
        <div style={{
          width: 110, height: 110, borderRadius: '50%',
          background: gradient,
        }} />
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          width: 72, height: 72, borderRadius: '50%',
          background: 'var(--color-bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.65rem', color: 'var(--color-muted)', textAlign: 'center',
          lineHeight: 1.3,
        }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-main)' }}>{total.toFixed(2)}</div>
            <div style={{ fontSize: '0.6rem' }}>USDC total</div>
          </div>
        </div>
      </div>
      <div className="flex gap-4 text-xs">
        <span className="flex items-center gap-1"><span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--primary)', display: 'inline-block' }} />EOA {eoaPct.toFixed(0)}%</span>
        <span className="flex items-center gap-1"><span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent-blue)', display: 'inline-block' }} />SA {saPct.toFixed(0)}%</span>
      </div>
    </div>
  );
}

// ─── Connected Dashboard ──────────────────────────────────────────────────────
function ConnectedDashboard() {
  const {
    eoaAddress, eoaETHBalance, eoaUSDCBalance,
    smartAccountAddress, saETHBalance, saUSDCBalance, saEntryPointDeposit,
    paymasterAddress, pmDeposit,
    pendingUserOps,
    setCurrentView, refreshAllData, signer, provider, env,
    trackOp
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

  // Stats derived from balances
  const eoaUSDC = parseFloat(ethers.formatUnits(eoaUSDCBalance || '0', 6));
  const saUSDC = parseFloat(ethers.formatUnits(saUSDCBalance || '0', 6));
  const eoaETH = parseFloat(ethers.formatEther(eoaETHBalance || '0'));
  const saETH = parseFloat(ethers.formatEther(saETHBalance || '0'));
  const confirmedOps = (pendingUserOps || []).filter(op => typeof op === 'object' && op.txHash);

  // Checklist
  const checklist = [
    { label: 'EOA Wallet Connected', done: !!eoaAddress },
    { label: 'Smart Account Deployed', done: !!smartAccountAddress },
    { label: 'Smart Account Funded (USDC)', done: saUSDC > 0 },
    { label: 'Paymaster Approved', done: !!pmDeposit && pmDeposit !== '0' },
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
      toast.error("Not enough ETH in Smart Account to swap!");
      return;
    }

    setSwapping(true);
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

      const saInterface = new ethers.Interface(SmartAccountABI);
      const callData = saInterface.encodeFunctionData("execute", [UNISWAP_ROUTER, amtIn, innerCallData]);

      const entryPoint = new ethers.Contract(env.ENTRY_POINT, IEntryPointABI, provider);
      const nonce = await entryPoint.getNonce(smartAccountAddress, 0);
      const fee = await provider.getFeeData();

      const userOp = {
        sender: smartAccountAddress,
        nonce: toHex(nonce),
        initCode: "0x",
        callData: callData,
        callGasLimit: toHex(300000), // Swaps take more gas
        verificationGasLimit: toHex(150000),
        preVerificationGas: toHex(50000),
        maxFeePerGas: toHex(fee.maxFeePerGas),
        maxPriorityFeePerGas: toHex(fee.maxPriorityFeePerGas),
        paymasterAndData: usePmForSwap ? paymasterAddress : "0x",
        signature: "0x"
      };

      // Try to estimate gas
      try {
        const est = await estimateUserOperationGas(userOp);
        userOp.callGasLimit = toHex(est.callGasLimit);
        userOp.verificationGasLimit = toHex(est.verificationGasLimit);
        userOp.preVerificationGas = toHex(BigInt(est.preVerificationGas) + 5000n);
      } catch (err) {
        console.warn("Estimation failed, using defaults", err);
      }

      const hash = await entryPoint.getUserOpHash(userOp);
      userOp.signature = await signer.signMessage(ethers.getBytes(hash));

      toast.info("Sending UserOp to swap ETH for USDC...");
      const opHash = await sendUserOperation(userOp);

      // Fire and forget — global tracker handles confirmation in background
      trackOp(opHash, 'ETH → USDC Swap');
      toast.withAction(
        'Swap submitted to bundler!',
        'View in History →',
        () => setCurrentView('history'),
        'info'
      );

    } catch (err) {
      if (err.code === 4001) toast.error("Transaction rejected by user");
      else toast.error(err.reason || err.message || "Failed to execute swap");
    } finally {
      setSwapping(false);
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
          <p className="text-sm text-muted">Your Smart Account Dashboard — Sepolia Testnet</p>
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
                <div className="text-xs text-muted">Signer Wallet</div>
                <div className="font-mono text-sm font-semibold">{shortenAddress(eoaAddress)}</div>
              </div>
            </div>
            <div className="wallet-summary-card__pill">EOA</div>
          </div>
          <div className="wallet-summary-card__divider" />
          <div className="flex justify-between">
            <div>
              <div className="text-xs text-muted mb-1">ETH</div>
              <div className="font-bold text-lg">{eoaETH.toFixed(4)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted mb-1">USDC</div>
              <div className="font-bold text-lg">{eoaUSDC.toFixed(2)}</div>
            </div>
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
                <div className="text-xs text-muted mb-1">ETH</div>
                <div className="font-bold text-lg">{saETH.toFixed(4)}</div>
              </div>
              <div>
                <div className="text-xs text-muted mb-1">USDC</div>
                <div className="font-bold text-lg">{saUSDC.toFixed(2)}</div>
              </div>
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

      {/* ── Middle Row: Checklist + Portfolio Chart + Quick Swap ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Setup Checklist */}
        <div className="glass-card flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontSize: '1rem', margin: 0 }}>Setup Progress</h3>
            <span className="ml-auto text-xs text-muted">{checklistPct}%</span>
          </div>
          {/* Progress bar */}
          <div className="progress-track">
            <div style={{
              width: `${checklistPct}%`, height: '100%', borderRadius: 99,
              background: 'linear-gradient(90deg, var(--primary), var(--accent-blue))',
              transition: 'width 0.5s ease'
            }} />
          </div>
          <div className="flex flex-col gap-2">
            {checklist.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                {item.done
                  ? <CheckCircle2 size={16} className="text-green-400 flex-shrink-0" />
                  : <XCircle size={16} className="text-muted flex-shrink-0" />
                }
                <span className={item.done ? 'text-white' : 'text-muted'}>
                  {item.label}
                  {item.label === 'Paymaster Approved' && ` (${parseFloat(ethers.formatUnits(pmAllowance, 6)).toFixed(2)} USDC)`}
                </span>
              </div>
            ))}
          </div>
          {checklistPct < 100 && (
            <button className="btn btn-secondary text-sm" onClick={() => setCurrentView('setup')}>
              Continue Setup <ArrowRight size={14} />
            </button>
          )}
        </div>

        {/* Portfolio Donut Chart */}
        <div className="glass-card flex flex-col items-center justify-center gap-4">
          <div className="flex items-center gap-2 self-start">
            <BarChart3 size={18} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontSize: '1rem', margin: 0 }}>USDC Portfolio</h3>
          </div>
          <DonutChart eoaUSDC={eoaUSDC} saUSDC={saUSDC} />
          <div className="flex flex-col gap-1 w-full text-sm">
            <div className="flex justify-between">
              <span className="text-muted">EOA</span>
              <span className="font-bold">{eoaUSDC.toFixed(2)} USDC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Smart Account</span>
              <span className="font-bold">{saUSDC.toFixed(2)} USDC</span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="glass-card flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Zap size={18} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontSize: '1rem', margin: 0 }}>Quick Actions</h3>
          </div>

          <button className="btn btn-primary text-sm flex items-center justify-between" onClick={() => setCurrentView('send')}>
            <span>Send USDC</span>
            <ArrowRight size={14} />
          </button>
          <button className="btn btn-secondary text-sm flex items-center justify-between" onClick={() => setCurrentView('setup')}>
            <span>Manage Account</span>
            <ArrowRight size={14} />
          </button>
          <button className="btn btn-secondary text-sm flex items-center justify-between" onClick={() => setCurrentView('paymaster')}>
            <span>Paymaster Info</span>
            <ArrowRight size={14} />
          </button>

          {/* Mini Swap Widget */}
          <div className="quick-swap-panel">
            <div className="text-xs text-muted mb-2">⚡ Quick Swap (Uniswap V3)</div>
            <div className="flex gap-2">
              <input
                type="number"
                className="input-field py-1 px-2 text-sm flex-1"
                placeholder="ETH amount"
                value={swapAmount}
                onChange={(e) => setSwapAmount(e.target.value)}
                style={{ fontSize: '0.8rem' }}
              />
              <button
                className="btn btn-primary text-sm"
                style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                onClick={handleQuickSwap}
                disabled={swapping}
              >
                {swapping ? '...' : 'ETH→USDC'}
              </button>
            </div>
            
            <div className="flex items-center gap-2 mt-2">
              <input 
                 type="checkbox" 
                 id="pmSwapToggle" 
                 className="w-3 h-3 accent-primary"
                 checked={usePmForSwap}
                 onChange={(e) => setUsePmForSwap(e.target.checked)}
              />
              <label htmlFor="pmSwapToggle" className="text-xs text-muted cursor-pointer hover:text-white transition-colors">
                 Sponsor gas with Paymaster
              </label>
            </div>

            <p className="text-xs text-muted mt-2">Via Smart Account → {shortenAddress(UNISWAP_ROUTER)}</p>
          </div>
        </div>
      </div>


    </div>
  );
}

// ─── Landing (Not Connected) ──────────────────────────────────────────────────
function LandingPage() {
  const { connectWallet, isConnecting } = useAppContext();
  return (
    <div className="animate-fade-in" style={{ paddingBottom: '4rem' }}>
      <div className="flex flex-col items-center justify-center text-center mt-8 mb-12" style={{ minHeight: '45vh' }}>
        <div
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            padding: '6px 16px', borderRadius: 99, marginBottom: '1.5rem',
            background: 'rgba(124,58,237,0.14)', border: '1px solid rgba(124,58,237,0.34)',
            fontSize: '0.8rem', color: 'var(--primary)',
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--secondary)', animation: 'pulse 2s infinite' }} />
          Live on Sepolia Testnet
        </div>
        <h1 style={{ fontSize: '3.5rem', marginBottom: '1rem', lineHeight: 1.15 }}>
          Smart <span className="text-gradient">Account</span> Hub
        </h1>
        <p className="text-muted" style={{ fontSize: '1.15rem', maxWidth: '540px', marginBottom: '2.5rem', lineHeight: 1.7 }}>
          Gasless, flexible, and programmable transactions powered by ERC-4337 Account Abstraction.
        </p>
        <button
          className="btn btn-primary"
          onClick={connectWallet}
          disabled={isConnecting}
          style={{ fontSize: '1.1rem', padding: '0.9rem 2.5rem' }}
        >
          {isConnecting ? (
            <><div className="loader" style={{ width: '1rem', height: '1rem', borderWidth: '2px' }} /> Connecting...</>
          ) : (
            <><Zap size={20} /> Connect Wallet</>
          )}
        </button>
      </div>
      <h2 className="text-center mb-6 text-gradient" style={{ fontSize: '1.75rem' }}>Why ERC-4337?</h2>
      <div className="grid-features">
        {features.map((f, i) => (
          <div key={i} className="glass-card feature-card" style={{ animationDelay: `${i * 0.05}s` }}>
            <div className="feature-card__header">
              <div className="feature-card__icon">
                {f.icon}
              </div>
              <h3>{f.title}</h3>
            </div>
            <p className="text-muted text-sm">{f.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Root Export ──────────────────────────────────────────────────────────────
export default function HomeView() {
  const { eoaAddress } = useAppContext();
  return eoaAddress ? <ConnectedDashboard /> : <LandingPage />;
}
