import React, { useState } from 'react';
import { ethers } from 'ethers';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { 
  Coins, 
  CheckCircle2, 
  RotateCcw, 
  ExternalLink, 
  Zap, 
  Layers, 
  ShieldCheck, 
  ArrowUpRight, 
  Sparkles, 
  Info,
  AlertCircle
} from 'lucide-react';
import { getExplorerTxUrl } from '../config/chains';
import { buildAndSendAccountOp, encodeERC7579Batch } from '../utils/helpers';
import { getFriendlyErrorMessage } from '../utils/errors';

const MOCK_USDC_ABI = [
  "function mint(address to, uint256 amount) public",
  "function decimals() public view returns (uint8)"
];

export default function MintUSDCView() {
  const {
    signer,
    provider,
    smartAccountAddress,
    chainId,
    env
  } = useAppContext();

  const [amount, setAmount] = useState('100');
  const [pending, setPending] = useState(false);
  const [txHash, setTxHash] = useState(null);

  // Aave Deposit State
  const [aaveAmount, setAaveAmount] = useState('100');
  const [isAavePending, setIsAavePending] = useState(false);
  const [aaveStatus, setAaveStatus] = useState('');

  const { success, error, info } = useToast();

  const usdcAddress = env.USDC_TOKEN || '';
  const aavePoolAddress = env.AAVE_POOL || '';

  if (!smartAccountAddress) {
    return (
      <div className="w-full min-h-[calc(100vh-140px)] bg-[#07090e] text-gray-100 font-sans px-4 sm:px-6 lg:px-8 py-10 flex items-center justify-center">
        <div className="max-w-md w-full rounded-2xl bg-white/[0.02] backdrop-blur-xl border border-red-500/30 p-8 text-center space-y-4 shadow-[0_0_40px_rgba(239,68,68,0.1)]">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">Smart Account Required</h3>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              You must set up or connect a Smart Account before accessing testnet faucet and yield facilities.
            </p>
          </div>
          <div className="pt-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono bg-white/5 border border-white/10 text-gray-400">
              ERC-4337 v0.7 · Non-Custodial Vault
            </span>
          </div>
        </div>
      </div>
    );
  }

  const handleMint = async () => {
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      error('Please enter a valid amount');
      return;
    }
    
    if (parseFloat(amount) > 10000) {
      error('You can only mint up to 10,000 USDC at a time');
      return;
    }

    try {
      setPending(true);
      setTxHash(null);
      if (!usdcAddress) throw new Error("USDC token address is missing from chain config.");

      const usdcContract = new ethers.Contract(usdcAddress, MOCK_USDC_ABI, signer);
      const amountToMint = ethers.parseUnits(amount.toString(), 6);

      const tx = await usdcContract.mint(smartAccountAddress, amountToMint);
      info('Mint transaction submitted');
      
      const receipt = await tx.wait();
      
      setTxHash(receipt.hash);
      success(`Successfully minted ${amount} USDC`);
      setAmount('');
    } catch (err) {
      console.error("USDC mint failed:", err);
      error(getFriendlyErrorMessage(err, 'We could not mint USDC. Please check your wallet and try again.'));
    } finally {
      setPending(false);
    }
  };

  const handleAaveDeposit = async () => {
    if (!aaveAmount || isNaN(aaveAmount) || parseFloat(aaveAmount) <= 0) {
      error('Please enter a valid amount');
      return;
    }

    try {
      setIsAavePending(true);
      setAaveStatus('Preparing batched UserOp...');
      if (!usdcAddress || !aavePoolAddress) throw new Error("USDC or Aave pool address is missing from chain config.");
      
      const amountToDeposit = ethers.parseUnits(aaveAmount.toString(), 6);
      
      const mockToken = new ethers.Contract(usdcAddress, ['function approve(address spender, uint256 amount) external returns (bool)'], signer);
      const pool = new ethers.Contract(aavePoolAddress, ['function deposit(uint256 _amount) external'], signer);
      
      const approveData = mockToken.interface.encodeFunctionData('approve', [aavePoolAddress, amountToDeposit]);
      const depositData = pool.interface.encodeFunctionData('deposit', [amountToDeposit]);
      
      const callData = encodeERC7579Batch(
        [usdcAddress, aavePoolAddress],
        [0n, 0n],
        [approveData, depositData]
      );
      
      setAaveStatus('Sign UserOp in Wallet...');
      
      const opHash = await buildAndSendAccountOp(
        signer, 
        provider, 
        smartAccountAddress, 
        callData, 
        env.ENTRY_POINT, 
        env.K1_VALIDATOR, 
        chainId
      );
      
      setAaveStatus('✅ Success! UserOp submitted.');
      success(`Batched UserOp submitted: ${opHash.slice(0, 10)}...`);
      setAaveAmount('');
      setTimeout(() => setAaveStatus(''), 5000);
    } catch (err) {
      console.error("Batched Aave deposit failed:", err);
      const msg = getFriendlyErrorMessage(err, 'We could not submit the Aave deposit. Please check your USDC balance and try again.');
      setAaveStatus('Error: ' + msg.slice(0, 80));
      error(msg);
    } finally {
      setIsAavePending(false);
    }
  };

  const resetForm = () => {
    setTxHash(null);
    setAmount('100');
  };

  if (txHash) {
    return (
      <div className="w-full min-h-[calc(100vh-140px)] bg-[#07090e] text-gray-100 font-sans px-4 sm:px-6 lg:px-8 py-10 flex items-center justify-center">
        <div className="max-w-lg w-full rounded-2xl bg-white/[0.02] backdrop-blur-xl border border-[#00f59b]/30 p-8 sm:p-10 text-center space-y-6 shadow-[0_0_50px_rgba(0,245,155,0.15)] relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-[#00f59b]/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="w-16 h-16 rounded-2xl bg-[#00f59b]/10 border border-[#00f59b]/30 flex items-center justify-center text-[#00f59b] mx-auto shadow-[0_0_25px_rgba(0,245,155,0.25)]">
            <CheckCircle2 className="w-8 h-8 text-[#00f59b]" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-mono bg-emerald-500/10 border border-[#00f59b]/30 text-[#00f59b]">
              <Sparkles className="w-3 h-3" /> Faucet Execution Confirmed
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white">Mint Successful</h2>
            <p className="text-sm text-gray-400 max-w-sm mx-auto leading-relaxed">
              Testnet USDC has been successfully credited directly to your Smart Account vault.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-black/50 border border-white/5 font-mono text-xs text-gray-400 flex items-center justify-between">
            <span className="text-gray-500">Destination:</span>
            <span className="text-gray-200 font-medium">{smartAccountAddress.slice(0, 10)}...{smartAccountAddress.slice(-8)}</span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button 
              onClick={resetForm}
              className="w-full sm:w-auto px-5 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-gray-300 hover:text-white font-mono text-xs font-semibold transition-all flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Mint More</span>
            </button>
            
            <a
              href={getExplorerTxUrl(chainId, txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-5 py-3 rounded-xl bg-[#00f59b] text-black hover:bg-[#1affab] hover:shadow-[0_0_25px_rgba(0,245,155,0.4)] font-mono text-xs font-bold transition-all flex items-center justify-center gap-2"
            >
              <span>View on Explorer</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-[calc(100vh-140px)] bg-[#07090e] text-gray-100 font-sans px-4 sm:px-6 lg:px-8 py-6 pb-16 overflow-y-auto">
      <div className="w-full space-y-6">
        
        {/* Header Breadcrumb & Status */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00f59b]/10 border border-[#00f59b]/30 flex items-center justify-center text-[#00f59b] shadow-[0_0_20px_rgba(0,245,155,0.15)]">
              <Coins className="w-5 h-5 text-[#00f59b]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">USDC Testnet Faucet & Yield</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono tracking-wider bg-emerald-500/10 text-[#00f59b] border border-[#00f59b]/30">
                  ERC-7579 BATCH
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">Testnet token minting & atomic batched UserOp liquidity routing</p>
            </div>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs">
            <div className="px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/5 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00f59b] animate-pulse"></span>
              <span className="text-gray-400">Vault Target:</span>
              <span className="text-white font-medium">
                {smartAccountAddress.slice(0, 6)}...{smartAccountAddress.slice(-4)}
              </span>
            </div>
          </div>
        </div>

        {/* Informational Hero Banner */}
        <div className="rounded-2xl bg-gradient-to-r from-emerald-950/20 via-[#07090e] to-white/[0.02] border border-[#00f59b]/20 p-5 relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-40 h-40 bg-[#00f59b]/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-start gap-4 relative z-10">
            <div className="w-8 h-8 rounded-lg bg-[#00f59b]/10 border border-[#00f59b]/25 flex items-center justify-center text-[#00f59b] shrink-0 mt-0.5">
              <Zap className="w-4 h-4 text-[#00f59b]" />
            </div>
            <div className="space-y-1.5 text-xs sm:text-sm">
              <div className="font-semibold text-white flex items-center gap-2">
                <span>Instant Testnet Mock Assets & 1-Signature Execution</span>
              </div>
              <p className="text-gray-400 leading-relaxed font-normal">
                Mint synthetic testnet <span className="text-[#00f59b] font-medium font-mono">USDC</span> directly into your Smart Account to test gas sponsorship, AI copilot sessions, or execute an <span className="text-white font-medium">atomic batched UserOperation</span> that approves and deposits into Aave with zero multi-transaction friction.
              </p>
            </div>
          </div>
        </div>

        {/* ── CARD 1: Direct Mint Faucet ── */}
        <div className="rounded-2xl bg-white/[0.02] backdrop-blur-xl border border-[#00f59b]/35 p-6 sm:p-8 space-y-5 shadow-2xl relative transition-all duration-300 hover:border-[#00f59b] hover:shadow-[0_0_24px_rgba(0,245,155,0.15)] group">
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#00f59b]/10 border border-[#00f59b]/30 flex items-center justify-center text-[#00f59b]">
                <Coins className="w-4 h-4 text-[#00f59b]" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white tracking-tight">Mint Mock USDC</h2>
                <p className="text-[11px] text-gray-400 font-mono">Direct minting to smart account storage</p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/5 text-gray-400 border border-white/5">
              Max 10,000 / Tx
            </span>
          </div>

          {/* Account Target Telemetry */}
          <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-xs font-mono uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#00f59b]" />
              Mint Destination (Smart Account)
            </span>
            <span className="font-mono text-xs text-white break-all bg-white/[0.03] px-2.5 py-1 rounded-md border border-white/5">
              {smartAccountAddress}
            </span>
          </div>

          {/* Amount Form Controls */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label htmlFor="mintAmount" className="text-xs font-mono uppercase tracking-wider text-gray-400 font-medium">
                Amount to Mint
              </label>
              <div className="flex items-center gap-1.5">
                {['50', '100', '500', '1000'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAmount(preset)}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all ${
                      amount === preset
                        ? 'bg-[#00f59b]/20 text-[#00f59b] border border-[#00f59b]/40'
                        : 'bg-white/5 text-gray-400 border border-white/5 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative group">
              <input
                id="mintAmount"
                type="number"
                max="10000"
                min="1"
                placeholder="100"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-black/60 border border-white/10 rounded-xl py-3.5 pl-4 pr-20 text-lg font-mono font-bold text-white placeholder-gray-600 focus:outline-none focus:border-[#00f59b] focus:ring-1 focus:ring-[#00f59b] transition-all"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
                <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-white/10 text-gray-300">
                  USDC
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500 font-mono">
              <Info className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span>Free mock ERC-20 tokens for sandbox simulation on connected testnet.</span>
            </div>
          </div>

          <button
            onClick={handleMint}
            disabled={pending || !amount}
            className={`w-full py-3.5 px-6 rounded-xl font-bold font-mono text-sm tracking-wide transition-all flex items-center justify-center gap-2 ${
              pending || !amount
                ? 'bg-white/10 text-gray-500 cursor-not-allowed border border-white/5'
                : 'bg-[#00f59b] text-black hover:bg-[#1affab] hover:shadow-[0_0_25px_rgba(0,245,155,0.4)] hover:-translate-y-0.5 active:scale-[0.99] active:translate-y-0'
            }`}
          >
            {pending ? (
              <>
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                <span>Minting USDC to Smart Account...</span>
              </>
            ) : (
              <>
                <Coins className="w-4 h-4" />
                <span>Mint USDC to Smart Account</span>
                <ArrowUpRight className="w-4 h-4 opacity-75" />
              </>
            )}
          </button>
        </div>

        {/* Verification Protocol Badges */}
        <div className="pt-2 border-t border-white/5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono text-gray-400">
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white/[0.015] border border-white/5">
            <CheckCircle2 className="w-4 h-4 text-[#00f59b] shrink-0" />
            <span>ERC-7579 Multi-Call Batch</span>
          </div>
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white/[0.015] border border-white/5">
            <Zap className="w-4 h-4 text-[#00f59b] shrink-0" />
            <span>Gas Sponsorship Compatible</span>
          </div>
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white/[0.015] border border-white/5">
            <ShieldCheck className="w-4 h-4 text-[#00f59b] shrink-0" />
            <span>Non-Custodial Settlement</span>
          </div>
        </div>

      </div>
    </div>
  );
}
