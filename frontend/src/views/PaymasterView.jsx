import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useAppContext } from '../context/AppContext';
import { IEntryPointABI, ERC20_ABI } from '../utils/abis';
import { toHex, packUserOp, encodeERC7579Single } from '../utils/helpers';
import { sendUserOperation, estimateUserOperationGas, getDynamicGasFees, applyBufferedGasEstimate } from '../utils/bundler';
import { useToast } from '../context/ToastContext';
import { Fuel, ShieldCheck, Zap, Info, ArrowUpRight, CheckCircle2, Lock } from 'lucide-react';

export default function PaymasterView() {
  const { 
    provider, signer, smartAccountAddress, paymasterAddress, env,
    saETHBalance, saEntryPointDeposit,
    trackOp, setCurrentView, setGlobalLoading, chainId, nativeToken, refreshTrigger
  } = useAppContext();
  const toast = useToast();

  const [approveAmount, setApproveAmount] = useState('10');
  const [approving, setApproving] = useState(false);
  const [currentAllowance, setCurrentAllowance] = useState('0.00');

  useEffect(() => {
    let active = true;
    const fetchAllowance = async () => {
      if (!provider || !smartAccountAddress || !paymasterAddress || !env.USDC_TOKEN) return;
      try {
        const usdc = new ethers.Contract(env.USDC_TOKEN, ["function allowance(address, address) view returns (uint256)"], provider);
        const allowance = await usdc.allowance(smartAccountAddress, paymasterAddress);
        if (active) setCurrentAllowance(ethers.formatUnits(allowance, 6));
      } catch (err) {
        console.warn("Failed to fetch USDC allowance:", err);
      }
    };
    fetchAllowance();
    return () => { active = false; };
  }, [provider, smartAccountAddress, paymasterAddress, env.USDC_TOKEN, refreshTrigger]);

  const handleApprovePaymaster = async () => {
    const targetToken = env.USDC_TOKEN;
    if (!smartAccountAddress || !approveAmount || !signer || !paymasterAddress || !targetToken) {
      toast.error("Missing inputs: Smart Account, Paymaster, or USDC Token address.");
      return;
    }
    setApproving(true);
    setGlobalLoading(true, "Approving Paymaster via Smart Account...");
    try {
      const { maxPriorityFeePerGas, maxFeePerGas } = await getDynamicGasFees(provider, chainId);

      const totalGasLimit = 150000n + 150000n + 50000n;
      const requiredPrefundWei = totalGasLimit * maxFeePerGas;
      const requiredPrefundEth = parseFloat(ethers.formatEther(requiredPrefundWei));

      const saBalanceEth = parseFloat(ethers.formatEther(saETHBalance || "0"));
      const saDepositEth = parseFloat(ethers.formatEther(saEntryPointDeposit || "0"));
      const totalAvailableEth = saBalanceEth + saDepositEth;

      if (totalAvailableEth < requiredPrefundEth) {
        toast.error(
          `Insufficient ${nativeToken} for prefund! The EntryPoint requires your Smart Account to have at least ${requiredPrefundEth.toFixed(4)} ${nativeToken} to cover the worst-case gas cost of this transaction. You currently have ${totalAvailableEth.toFixed(4)} ${nativeToken} total (Balance + Deposit). Please deposit more ${nativeToken} into your Smart Account first.`
        );
        setApproving(false);
        setGlobalLoading(false);
        return;
      }

      const parsedAmount = ethers.parseUnits(approveAmount, 6); // USDC uses 6 decimals
      
      const erc20 = new ethers.Interface(ERC20_ABI);
      const inner = erc20.encodeFunctionData("approve", [paymasterAddress, parsedAmount]);
      
      const callData = encodeERC7579Single(targetToken, 0n, inner);

      const entryPoint = new ethers.Contract(env.ENTRY_POINT, IEntryPointABI, provider);
      const nonce = await entryPoint.getNonce(smartAccountAddress, 0);

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

      try {
        const est = await estimateUserOperationGas(userOp, chainId);
        applyBufferedGasEstimate(userOp, est);
      } catch (err) {
        console.warn("Estimation failed, using defaults", err);
        userOp.callGasLimit = toHex(150000);
        userOp.verificationGasLimit = toHex(150000);
        userOp.preVerificationGas = toHex(50000);
      }

      const hash = await entryPoint.getUserOpHash(packUserOp(userOp));
      userOp.signature = await signer.signMessage(ethers.getBytes(hash));

      toast.info("Sending UserOp to approve Gas Sponsorship...");
      const opHash = await sendUserOperation(userOp, chainId);

      trackOp(opHash, 'USDC Gas Sponsorship Approval', { calldata: userOp.callData });
      toast.withAction(
        'UserOp submitted to bundler!',
        'View in History →',
        () => setCurrentView('history'),
        'info'
      );
    } catch (err) {
      if (err.code === 4001) toast.error("Transaction rejected by user");
      else toast.error(err.reason || err.message || "Failed to approve Gas Sponsorship");
    } finally {
      setApproving(false);
      setGlobalLoading(false);
    }
  };

  return (
    <div className="w-full min-h-[calc(100vh-140px)] bg-[#07090e] text-gray-100 font-sans px-4 sm:px-6 lg:px-8 py-6 pb-16 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header Breadcrumb & Status */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00f59b]/10 border border-[#00f59b]/30 flex items-center justify-center text-[#00f59b] shadow-[0_0_20px_rgba(0,245,155,0.15)]">
              <Fuel className="w-5 h-5 text-[#00f59b]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">Gas Sponsorship</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono tracking-wider bg-emerald-500/10 text-[#00f59b] border border-[#00f59b]/30">
                  ERC-4337 v0.7
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">Paymaster token settlement & gas abstraction</p>
            </div>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs">
            <div className="px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/5 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00f59b] animate-pulse"></span>
              <span className="text-gray-400">Paymaster:</span>
              <span className="text-white font-medium">
                {paymasterAddress ? `${paymasterAddress.slice(0, 6)}...${paymasterAddress.slice(-4)}` : 'Connecting...'}
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
                <span>Gasless Execution via USDC Settlement</span>
              </div>
              <p className="text-gray-400 leading-relaxed font-normal">
                Enable <span className="text-white font-medium">Gas Sponsorship</span> to sponsor transaction fees directly using <span className="text-[#00f59b] font-medium font-mono">USDC</span> instead of holding native <span className="text-white font-mono">{nativeToken || 'ETH'}</span>. Granting an allowance lets the Paymaster deduct exact fee equivalents atomically per UserOperation with zero gas markups.
              </p>
            </div>
          </div>
        </div>

        {/* Main Sponsorship Interactive Card */}
        <div className="rounded-2xl bg-white/[0.02] backdrop-blur-xl border border-[#00f59b]/35 p-6 sm:p-8 space-y-6 shadow-2xl relative transition-all duration-300 hover:border-[#00f59b] hover:shadow-[0_0_24px_rgba(0,245,155,0.15)] group">
          
          {/* Allowance Telemetry Meter */}
          <div className="p-4 sm:p-5 rounded-xl bg-black/40 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-[11px] font-mono tracking-wider uppercase text-gray-500 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#00f59b]" />
                Effective Paymaster Allowance
              </div>
              <div className="text-xs text-gray-400">
                Available gas fee sponsorship buffer
              </div>
            </div>
            
            <div className="flex items-baseline gap-2 text-right">
              <span className="text-3xl sm:text-4xl font-extrabold font-mono text-[#00f59b] drop-shadow-[0_0_15px_rgba(0,245,155,0.3)]">
                {Number(currentAllowance).toFixed(2)}
              </span>
              <span className="text-sm font-bold font-mono text-gray-400">USDC</span>
            </div>
          </div>

          {/* Form Controls */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="approveAmount" className="text-xs font-mono uppercase tracking-wider text-gray-400 font-medium">
                Update USDC Allowance
              </label>
              <div className="flex items-center gap-1.5">
                {['5', '10', '25', '50'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setApproveAmount(preset)}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all ${
                      approveAmount === preset
                        ? 'bg-[#00f59b]/20 text-[#00f59b] border border-[#00f59b]/40'
                        : 'bg-white/5 text-gray-400 border border-white/5 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    +{preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative group">
              <input 
                id="approveAmount"
                type="number" 
                step="any"
                min="0"
                placeholder="10.00" 
                value={approveAmount} 
                onChange={e => setApproveAmount(e.target.value)} 
                className="w-full bg-black/60 border border-white/10 rounded-xl py-3.5 pl-4 pr-20 text-lg font-mono font-bold text-white placeholder-gray-600 focus:outline-none focus:border-[#00f59b] focus:ring-1 focus:ring-[#00f59b] transition-all"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
                <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-white/10 text-gray-300">
                  USDC
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2 pt-1 text-xs text-gray-500 leading-relaxed font-mono">
              <Info className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
              <span>
                Maximum USDC the Paymaster can deduct for UserOps over time. Funds remain under your smart account custody until an actual transaction executes.
              </span>
            </div>
          </div>

          {/* Action Button */}
          <div className="pt-2">
            <button 
              type="button"
              onClick={handleApprovePaymaster} 
              disabled={approving || !approveAmount || parseFloat(approveAmount) <= 0}
              className={`w-full py-3.5 px-6 rounded-xl font-bold font-mono text-sm tracking-wide transition-all flex items-center justify-center gap-2 ${
                approving || !approveAmount || parseFloat(approveAmount) <= 0
                  ? 'bg-white/10 text-gray-500 cursor-not-allowed border border-white/5'
                  : 'bg-[#00f59b] text-black hover:bg-[#1affab] hover:shadow-[0_0_25px_rgba(0,245,155,0.45)] hover:-translate-y-0.5 active:scale-[0.99] active:translate-y-0'
              }`}
            >
              {approving ? (
                <>
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  <span>Approving USDC via Smart Account...</span>
                </>
              ) : (
                <>
                  <Fuel className="w-4 h-4" />
                  <span>Approve Gas Sponsorship</span>
                  <ArrowUpRight className="w-4 h-4 opacity-75" />
                </>
              )}
            </button>
          </div>

          {/* Verification Protocol Badges */}
          <div className="pt-4 border-t border-white/5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono text-gray-400">
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white/[0.015] border border-white/5">
              <CheckCircle2 className="w-4 h-4 text-[#00f59b] shrink-0" />
              <span>ERC-7579 Scoped Execution</span>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white/[0.015] border border-white/5">
              <Lock className="w-4 h-4 text-[#00f59b] shrink-0" />
              <span>Non-Custodial Escrow</span>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white/[0.015] border border-white/5">
              <Zap className="w-4 h-4 text-[#00f59b] shrink-0" />
              <span>Zero Native Gas Required</span>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}