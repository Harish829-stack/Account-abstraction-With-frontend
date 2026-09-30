import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ethers } from 'ethers';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { shortenAddress, toHex, getEthPriceInUsd, packUserOp, encodeERC7579Single, buildAndSendAccountOp } from '../utils/helpers';
import { sendUserOperation, estimateUserOperationGas, getDynamicGasFees, applyBufferedGasEstimate } from '../utils/bundler';
import { IEntryPointABI, SmartAccountABI, K1ValidatorFactoryABI } from '../utils/abis';
import { getDashboardSummary } from '../utils/backendApi';
import { getSupportedChains } from '../config/chains';
import {
  CheckCircle2, XCircle, ArrowRight, ArrowUpRight,
  RefreshCw, TrendingUp, Activity, Wallet, Box, BarChart3,
  ChevronDown, ArrowDown, Puzzle, Fuel, MapPin, Key, Users,
  Fingerprint, Check, ChevronRight, Copy
} from 'lucide-react';

import './new-landing.css';
import { SmartVaultPortfolioWidget, ChainlinkPricesWidget, AaveV3Widget } from '../components/DashboardFinancialWidgets';
import AgentDemoView from '../components/AgentDemoView';
const UNISWAP_ROUTER = '0x1e473E7A8C2EB73B744321D4CFD73195B1Ed996F';
const WETH_SEPOLIA = '0xfff9976782d46cc05630d1f6ebab18b2324d6b14';

// ─── Connected Dashboard ──────────────────────────────────────────────────────
function ConnectedDashboard() {
  const {
    eoaAddress, eoaETHBalance, eoaUSDCBalance,
    smartAccountAddress, smartAccountStatus, isSmartAccountDeployed, saETHBalance, saUSDCBalance, saEntryPointDeposit, saOwner,
    paymasterAddress,
    setCurrentView, refreshAllData, signer, provider, env, chainId, nativeToken, isAmoy,
    trackOp, setGlobalLoading, refreshTrigger
  } = useAppContext();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [, setDashboardSummary] = useState(null);
  const [, setLoadingDashboardSummary] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadDashboardSummary = async () => {
      if (!smartAccountAddress || !chainId) {
        setDashboardSummary(null);
        return;
      }

      setLoadingDashboardSummary(true);
      try {
        const summary = await getDashboardSummary({ smartAccountAddress, chainId });
        if (!cancelled) setDashboardSummary(summary);
      } catch (err) {
        console.warn("Failed to load dashboard summary:", err);
        if (!cancelled) setDashboardSummary(null);
      } finally {
        if (!cancelled) setLoadingDashboardSummary(false);
      }
    };

    loadDashboardSummary();
    return () => {
      cancelled = true;
    };
  }, [smartAccountAddress, chainId, refreshTrigger]);


  // Swap state
  const [swapAmount, setSwapAmount] = useState('0.001');
  const [swapping, setSwapping] = useState(false);
  const [usePmForSwap, setUsePmForSwap] = useState(false);
  const [selectedGasToken, setSelectedGasToken] = useState(env?.USDC_TOKEN || '');
  
  const trackedTokens = [{ symbol: 'USDC', address: env?.USDC_TOKEN, decimals: 6 }].filter(t => t.address);

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
          tokenOut: env.VITE_USDC_TOKEN,
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
  const eoaETH = parseFloat(ethers.formatEther(eoaETHBalance || '0'));
  const saETH = parseFloat(ethers.formatEther(saETHBalance || '0'));
  const eoaValueUsd = eoaETH * ethPrice + eoaUSDC;
  const smartValueUsd = saETH * ethPrice + saUSDC;
  const entryPointDeposit = parseFloat(ethers.formatEther(saEntryPointDeposit || '0'));
  const agentIsReady = smartAccountStatus === "agent_ready";
  const smartStatusLabel = agentIsReady ? "Agent Ready" : (isSmartAccountDeployed ? "Needs Session Key" : "Predicted");
  const chainLabel = isAmoy ? "Amoy Testnet" : "Sepolia Testnet";
  const fmtUsdShort = (value) => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshAllData();
    setRefreshing(false);
  };

  const handleActivateAgenticAI = async () => {
    if (!smartAccountAddress || !signer || !env.SESSION_KEY_VALIDATOR) {
      toast.error("Connect wallet and ensure env is configured.");
      return;
    }
    
    // Safety check: ensure user has some ETH in the predicted address
    if (parseFloat(saETHBalance || "0") < 0.0001) {
      toast.error(`Please fund your predicted address ${shortenAddress(smartAccountAddress)} with some ${nativeToken} first!`);
      // Copy to clipboard to help the user
      navigator.clipboard.writeText(smartAccountAddress);
      toast.info("Address copied to clipboard!");
      return;
    }

    setGlobalLoading(true, "Activating Agentic AI...");
    try {
      const wallet = ethers.Wallet.createRandom();
      const burnerKey = wallet.privateKey;
      const sessionKeyAddr = wallet.address;

      localStorage.setItem("session_burner_key", burnerKey);
      try {
          const mapStr = localStorage.getItem("session_burner_keys_map");
          const map = mapStr ? JSON.parse(mapStr) : {};
          map[sessionKeyAddr.toLowerCase()] = burnerKey;
          localStorage.setItem("session_burner_keys_map", JSON.stringify(map));
      } catch {
          localStorage.setItem("session_burner_keys_map", JSON.stringify({ [sessionKeyAddr.toLowerCase()]: burnerKey }));
      }

      const parsedValue = ethers.parseEther("0.1"); // Default max value
      const validUntilTimestamp = Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7); // 7 days

      const keyData = [
          sessionKeyAddr,
          ethers.ZeroAddress,
          "0x00000000",
          parsedValue,
          0,
          validUntilTimestamp,
          0
      ];

      const initData = ethers.AbiCoder.defaultAbiCoder().encode(
          ["tuple(address,address,bytes4,uint256,uint48,uint48,uint256)[]"],
          [[keyData]]
      );
      const accountIface = new ethers.Interface(SmartAccountABI);
      const callData = accountIface.encodeFunctionData("installModule", [1, env.SESSION_KEY_VALIDATOR, initData]);
      
      let initCodeObj = null;
      if (!isSmartAccountDeployed) {
          const factoryIface = new ethers.Interface(K1ValidatorFactoryABI);
          const factoryData = factoryIface.encodeFunctionData("createAccount", [eoaAddress, 1, [], 0]);
          initCodeObj = { factory: env.FACTORY, factoryData };
      }

      const opHash = await buildAndSendAccountOp(signer, provider, smartAccountAddress, callData, env.ENTRY_POINT, env.K1_VALIDATOR, chainId, initCodeObj);
      trackOp(opHash, 'Activate Agentic Wallet', { calldata: callData });
      toast.success(`Agentic Wallet Activating! OpHash: ${shortenAddress(opHash)}...`);
      setTimeout(() => refreshAllData(), 4000);
    } catch (err) {
      console.error(err);
      toast.error(err.reason || err.message || "Failed to activate Agentic AI");
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleQuickSwap = async () => {
    if (!signer || !smartAccountAddress) {
      toast.error("Connect Smart Account first!");
      return;
    }
    
    if (!isSmartAccountDeployed) {
      toast.error("Please deploy your Smart Account first to use Quick Swap!");
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
        tokenOut: env.VITE_USDC_TOKEN,
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
      const { maxPriorityFeePerGas, maxFeePerGas } = await getDynamicGasFees(provider, chainId);

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
        const est = await estimateUserOperationGas(userOp, chainId);
        applyBufferedGasEstimate(userOp, est);
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
      const opHash = await sendUserOperation(userOp, chainId);
      toast.success("Bundler accepted the transaction!");

      // Fire and forget — global tracker handles confirmation in background
      trackOp(opHash, `${nativeToken} → USDC Swap`, { calldata: userOp.callData });
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7 space-y-6">

      {/* BEGIN: Greeting & Header Bar */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex flex-wrap items-center gap-2">
            <span>Welcome back,</span>
            <span className="bg-gradient-to-r from-mint via-emerald-300 to-cyan-400 bg-clip-text text-transparent font-mono">{shortenAddress(eoaAddress)}</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 flex items-center gap-2">
            <span>Your Smart Account Dashboard</span>
            <span className="inline-block w-1 h-1 rounded-full bg-slate-600"></span>
            <span className="text-mint font-mono text-xs">{chainLabel}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center gap-2 text-[11px] font-mono text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full bg-mint animate-pulse"></span>
            Live chain data
          </span>
          <button 
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-obsidian-900 border border-white/10 text-slate-200 hover:text-mint hover:border-mint/40 transition-all shadow-sm active:scale-95 group" 
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <svg className={`w-3.5 h-3.5 text-slate-400 group-hover:text-mint transition-transform duration-700 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            <span>Refresh</span>
          </button>
        </div>
      </section>

      {/* BEGIN: Top Overview Cards */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        
        {/* Card 1: Signer Wallet (Connected EOA) */}
        <article className="wallet-card p-5 sm:p-6 relative overflow-hidden group">
          <div className="absolute -right-12 -top-12 w-36 h-36 bg-slate-700/10 rounded-full blur-2xl pointer-events-none group-hover:bg-mint/5 transition-all"></div>
          <div className="flex items-center justify-between pb-4 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-obsidian-900 border border-white/10 flex items-center justify-center text-slate-300">
                <Wallet size={20} />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Signer Wallet (Connected)</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-mono text-sm font-semibold text-slate-100">{shortenAddress(eoaAddress)}</span>
                  <button 
                    className="text-slate-500 hover:text-mint" 
                    onClick={() => {
                      navigator.clipboard.writeText(eoaAddress);
                      toast.success("Signer EOA Copied!");
                    }}
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
              EOA Signer
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-5 pb-2">
            <div>
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400">{nativeToken}</span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-bold font-mono text-white tracking-tight">{eoaETH.toFixed(4)}</span>
                <span className="hidden sm:inline text-xs text-slate-500">≈ {fmtUsdShort(eoaETH * ethPrice)}</span>
              </div>
            </div>
            <div>
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400">USDC</span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-bold font-mono text-white tracking-tight">{eoaUSDC.toFixed(2)}</span>
                <span className="hidden sm:inline text-xs text-slate-500">{fmtUsdShort(eoaUSDC)}</span>
              </div>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>Signer total</span>
            <span className="text-slate-300">{fmtUsdShort(eoaValueUsd)}</span>
          </div>
        </article>

        {/* Card 2: Smart Vault */}
        <article className={`wallet-card p-5 sm:p-6 relative overflow-hidden transition-all duration-300 ${smartAccountAddress ? 'hover:border-[#00f59b] hover:shadow-[0_0_24px_rgba(0,245,155,0.15)] group' : 'opacity-80'}`}>
          {smartAccountAddress && <div className="absolute -right-12 -top-12 w-36 h-36 bg-mint/10 rounded-full blur-2xl pointer-events-none group-hover:bg-mint/15 transition-all"></div>}
          <div className="flex items-center justify-between pb-4 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-mint/15 border border-mint/40 flex items-center justify-center text-mint shadow-mint-sm">
                <Box size={20} />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Smart Vault (Modular Account)</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {smartAccountAddress ? (
                    <>
                      <span className="font-mono text-sm font-bold text-mint">{shortenAddress(smartAccountAddress)}</span>
                      <button 
                        className="text-slate-400 hover:text-white" 
                        onClick={() => {
                          navigator.clipboard.writeText(smartAccountAddress);
                          toast.success("Smart Vault Address Copied!");
                        }}
                      >
                        <Copy size={14} />
                      </button>
                      {isSmartAccountDeployed && saOwner && (
                        <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">Owner: {shortenAddress(saOwner)}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-500">Loading...</span>
                  )}
                </div>
              </div>
            </div>
            
            {agentIsReady ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-mint/15 text-mint border border-mint/30">
                <span className="w-1.5 h-1.5 rounded-full bg-mint animate-ping"></span>
                <span>{smartStatusLabel}</span>
              </div>
            ) : (
              <button 
                className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-cyan-400 text-obsidian-950 border border-cyan-400 hover:bg-cyan-300 transition-colors" 
                onClick={handleActivateAgenticAI}
              >
                {smartAccountStatus === "predicted" ? "Activate Agent" : "Finish Setup"}
              </button>
            )}
          </div>
          
          {isSmartAccountDeployed ? (
            <div className="grid grid-cols-3 gap-2 sm:gap-4 pt-5 pb-2">
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-slate-400">{nativeToken}</span>
                <div className="mt-1">
                  <span className="text-xl sm:text-2xl font-bold font-mono text-white tracking-tight">{saETH.toFixed(4)}</span>
                  <p className="text-[11px] text-slate-500 hidden sm:block">≈ {fmtUsdShort(saETH * ethPrice)}</p>
                </div>
              </div>
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-slate-400">USDC</span>
                <div className="mt-1">
                  <span className="text-xl sm:text-2xl font-bold font-mono text-white tracking-tight">{saUSDC.toFixed(2)}</span>
                  <p className="text-[11px] text-slate-500 hidden sm:block">{fmtUsdShort(saUSDC)}</p>
                </div>
              </div>
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-slate-400">EP Deposit</span>
                <div className="mt-1">
                  <span className="text-xl sm:text-2xl font-bold font-mono text-mint tracking-tight">{entryPointDeposit.toFixed(4)}</span>
                  <p className="text-[11px] text-slate-500 font-mono hidden sm:block">Gas Tank</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="pt-5 pb-2">
              <p className="text-sm text-slate-400 mb-2">Predicted address. Fund it with {nativeToken} to pre-load gas, then activate.</p>
              {saETH > 0 && (
                <div className="mt-2">
                  <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">{nativeToken} (pre-funded)</div>
                  <div className="font-bold text-lg text-mint">{saETH.toFixed(4)}</div>
                </div>
              )}
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-white/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-[11px] text-slate-500 font-mono">
            <span className="inline-flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${agentIsReady ? 'bg-mint' : 'bg-slate-600'}`}></span>
              Session Keys: <b className={agentIsReady ? 'text-mint' : 'text-slate-300'}>{agentIsReady ? '1 Active' : 'Not active'}</b>
            </span>
            <span className="text-slate-300">Vault total {fmtUsdShort(smartValueUsd)}</span>
          </div>
        </article>
      </section>

      <section className="wallet-card p-4 sm:p-5 relative overflow-hidden transition-all duration-300 hover:border-[#00f59b] hover:shadow-[0_0_24px_rgba(0,245,155,0.15)] group">
        <div className="absolute inset-y-0 left-0 w-1 bg-mint"></div>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pl-2">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-mint/10 border border-mint/30 text-mint grid place-items-center flex-shrink-0">
              <Activity size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded bg-mint/15 text-mint text-[10px] font-mono font-bold uppercase tracking-wider">Non-custodial Policy</span>
                <h2 className="text-sm sm:text-base font-bold text-white">AI Agent Policy & Access Control</h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-4xl">
                Your smart account keeps custody. Session-key automation only uses the scoped permissions already managed by this platform.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono text-slate-500">
                <span>Enforced via ERC-7579 scoped Session Key Validator</span>
                <span>On-chain non-custodial architecture</span>
              </div>
            </div>
          </div>
          {agentIsReady ? (
            <button
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold bg-mint/10 text-mint border border-mint/30 hover:bg-mint/15 transition-all"
              onClick={() => setCurrentView('chatbot')}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-mint animate-pulse"></span>
              Agent Active
            </button>
          ) : (
            <button
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold bg-mint text-obsidian-950 hover:bg-mint-400 transition-all"
              onClick={handleActivateAgenticAI}
            >
              Activate Agent
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      </section>

      {/* ── Middle Row: Widgets ─── */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* ─ Dashboard Financial Widgets ─ */}
        <SmartVaultPortfolioWidget />
        <ChainlinkPricesWidget />
        <AaveV3Widget />
      </section>

      {/* ── Quick Swap Modal ────────────────────────────── */}
      {showSwapModal && createPortal(
        <div
          onClick={() => {
            setShowSwapModal(false);
            setShowSellDropdown(false);
            setShowBuyDropdown(false);
          }}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-obsidian-950/80 backdrop-blur-md"
        >
          <div
            onClick={e => {
              e.stopPropagation();
              // close dropdowns if clicking elsewhere in modal
              setShowSellDropdown(false);
              setShowBuyDropdown(false);
            }}
            className="w-full max-w-[440px] bg-obsidian-900 border border-white/10 rounded-[24px] p-4 shadow-card-glass relative"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 px-2">
              <div className="text-lg font-bold text-white">Swap</div>
              <button onClick={() => setShowSwapModal(false)} className="text-slate-400 hover:text-white transition-colors"><XCircle size={22} /></button>
            </div>

            {/* Sell Card */}
            <div className="bg-obsidian-850 rounded-[20px] p-4 relative border border-white/5">
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">Sell</div>
              <div className="flex items-center justify-between">
                <input
                  type="number"
                  placeholder="0"
                  value={swapAmount}
                  onChange={e => setSwapAmount(e.target.value)}
                  className="border-none bg-transparent outline-none text-3xl font-mono font-bold text-white w-full p-0 focus:ring-0 placeholder-slate-700"
                />
                
                <div className="relative z-20">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowSellDropdown(!showSellDropdown);
                      setShowBuyDropdown(false);
                    }}
                    className="flex items-center gap-1.5 bg-obsidian-950 rounded-full py-1 pr-2.5 pl-1 border border-white/10 hover:border-mint/30 transition-all shadow-sm"
                  >
                    <span className="w-6 h-6 rounded-full bg-[#627EEA] grid place-items-center">
                      <svg viewBox="0 0 32 32" width="14" height="14">
                        <path d="M15.925 23.969L15.875 24.02l-9.819-5.799L15.925 32l9.897-13.78-9.897 5.749z" fill="#fff" opacity="0.6"/>
                        <path d="M16.075 23.969l9.897-5.749-9.897-4.426v10.175z" fill="#fff" opacity="0.4"/>
                        <path d="M15.925 13.794L6.056 18.22l9.869 4.426v-8.852z" fill="#fff" opacity="0.8"/>
                        <path d="M15.925 0L6.056 16.485l9.869 4.373V0z" fill="#fff"/>
                        <path d="M16.075 0v20.858l9.897-4.373L16.075 0z" fill="#fff" opacity="0.6"/>
                        <path d="M15.925 20.858l-9.869-4.373L15.925 0v20.858z" fill="#fff" opacity="0.4"/>
                      </svg>
                    </span>
                    <span className="text-sm font-bold text-white">{nativeToken}</span>
                    <ChevronDown size={14} className="text-slate-500" />
                  </button>

                  {/* Sell Dropdown */}
                  {showSellDropdown && (
                    <div className="absolute top-full right-0 mt-2 bg-obsidian-900 border border-white/10 rounded-xl p-2 w-[220px] shadow-card-glass z-30">
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                        <span className="w-6 h-6 rounded-full bg-[#627EEA] grid place-items-center">
                          <svg viewBox="0 0 32 32" width="14" height="14">
                            <path d="M15.925 0L6.056 16.485l9.869 4.373V0z" fill="#fff"/>
                            <path d="M16.075 0v20.858l9.897-4.373L16.075 0z" fill="#fff" opacity="0.6"/>
                          </svg>
                        </span>
                        <span className="font-bold text-white">{nativeToken}</span>
                      </div>
                      <div className="mt-2 pt-2 border-t border-white/5 text-center text-xs text-slate-500">
                        More currencies coming soon
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="text-xs text-slate-500 font-mono mt-1">
                ${(parseFloat(swapAmount || 0) * ethPrice).toFixed(2)}
              </div>
            </div>

            {/* Overlapping Arrow */}
            <div className="h-1 flex justify-center relative z-10">
              <div className="absolute -top-4 w-9 h-9 bg-obsidian-950 rounded-xl grid place-items-center border-[4px] border-obsidian-900 text-slate-400">
                <ArrowDown size={14} />
              </div>
            </div>

            {/* Buy Card */}
            <div className="bg-obsidian-850 rounded-[20px] p-4 relative border border-white/5">
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">Buy</div>
              <div className="flex items-center justify-between">
                {isEstimatingOutput ? (
                  <div className="text-3xl font-mono font-bold text-slate-700 animate-pulse">...</div>
                ) : (
                  <input
                    type="number"
                    readOnly
                    value={parseFloat(estimatedUsdcOutput || 0).toFixed(2)}
                    className="border-none bg-transparent outline-none text-3xl font-mono font-bold text-white w-full p-0 focus:ring-0"
                  />
                )}
                
                <div className="relative z-15">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowBuyDropdown(!showBuyDropdown);
                      setShowSellDropdown(false);
                    }}
                    className="flex items-center gap-1.5 bg-obsidian-950 rounded-full py-1 pr-2.5 pl-1 border border-white/10 hover:border-cyan-400/30 transition-all shadow-sm"
                  >
                    <span className="w-6 h-6 rounded-full bg-[#2775CA] grid place-items-center">
                      <svg viewBox="0 0 32 32" width="14" height="14">
                        <circle cx="16" cy="16" r="16" fill="#fff" opacity="0.15"/>
                        <path d="M20.25 18.91c0-1.84-1.25-2.73-3.92-3.14-1.92-.3-2.31-.77-2.31-1.5 0-.74.67-1.35 2-1.35 1.25 0 2.22.42 2.65.88l1.35-2.07c-.77-.77-2-1.35-3.35-1.5v-2.7h-2.31v2.7c-2 .23-3.65 1.42-3.65 3.35 0 1.92 1.42 2.65 3.85 3.08 2 .35 2.38.92 2.38 1.62 0 .88-.81 1.46-2.08 1.46-1.54 0-2.81-.62-3.42-1.23l-1.42 2.15c.88.92 2.31 1.65 3.96 1.88v2.73h2.31v-2.73c2.08-.27 3.96-1.5 3.96-3.65z" fill="#FFF"/>
                      </svg>
                    </span>
                    <span className="text-sm font-bold text-white">USDC</span>
                    <ChevronDown size={14} className="text-slate-500" />
                  </button>

                  {/* Buy Dropdown */}
                  {showBuyDropdown && (
                    <div className="absolute top-full right-0 mt-2 bg-obsidian-900 border border-white/10 rounded-xl p-2 w-[220px] shadow-card-glass z-30">
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                        <span className="w-6 h-6 rounded-full bg-[#2775CA] grid place-items-center">
                          <svg viewBox="0 0 32 32" width="14" height="14">
                            <path d="M20.25 18.91c0-1.84-1.25-2.73-3.92-3.14-1.92-.3-2.31-.77-2.31-1.5 0-.74.67-1.35 2-1.35 1.25 0 2.22.42 2.65.88l1.35-2.07c-.77-.77-2-1.35-3.35-1.5v-2.7h-2.31v2.7c-2 .23-3.65 1.42-3.65 3.35 0 1.92 1.42 2.65 3.85 3.08 2 .35 2.38.92 2.38 1.62 0 .88-.81 1.46-2.08 1.46-1.54 0-2.81-.62-3.42-1.23l-1.42 2.15c.88.92 2.31 1.65 3.96 1.88v2.73h2.31v-2.73c2.08-.27 3.96-1.5 3.96-3.65z" fill="#FFF"/>
                          </svg>
                        </span>
                        <span className="font-bold text-white">USDC</span>
                      </div>
                      <div className="mt-2 pt-2 border-t border-white/5 text-center text-xs text-slate-500">
                        More currencies coming soon
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="text-xs text-slate-500 font-mono mt-1">
                ≈ ${parseFloat(estimatedUsdcOutput || 0).toFixed(2)}
              </div>
            </div>

            {/* Paymaster Toggle */}
            <div className="flex flex-col gap-2 my-4 p-3 bg-mint/5 rounded-xl border border-mint/20">
              <div className="flex items-center gap-2.5">
                <input type="checkbox" id="pmSwapModalToggle" checked={usePmForSwap} onChange={e => setUsePmForSwap(e.target.checked)} className="accent-mint w-4 h-4 rounded border-white/10 bg-obsidian-950 text-mint focus:ring-mint focus:ring-offset-obsidian-900 cursor-pointer" />
                <label htmlFor="pmSwapModalToggle" className="text-sm text-slate-200 cursor-pointer flex-1 font-semibold">
                  Sponsor gas with Paymaster
                </label>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-mint/20 text-mint border border-mint/30 transition-opacity ${usePmForSwap ? 'opacity-100' : 'opacity-0'}`}>Gasless</span>
              </div>
              {usePmForSwap && (
                <div className="flex items-center gap-2.5 pl-7 mt-1">
                  <label className="text-xs text-slate-400">Gas Token</label>
                  <select 
                    className="bg-obsidian-950 border border-white/10 rounded-lg py-1 px-2 text-xs text-slate-200 outline-none focus:border-mint/50"
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
              className="w-full font-bold text-lg py-3.5 rounded-xl transition-all shadow-[0_0_15px_-3px_rgba(0,245,155,0.3)] bg-mint text-obsidian-950 hover:bg-mint-400 disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="text-center mt-3 text-xs text-slate-500 font-mono">
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
  const [mockPopupState, setMockPopupState] = useState('hidden'); // hidden, showing, signing, confirmed
  const [mockTxConfirmed, setMockTxConfirmed] = useState(false);
  const [activeTab, setActiveTab] = useState('agent');
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const getRandomHash = () => "0x" + Math.random().toString(16).slice(2, 6) + "..." + Math.random().toString(16).slice(2, 6);

    const getAgentPatterns = () => {
      const aId = getRandomHash();
      const sKey = getRandomHash();
      return [
        `${aId} executed swap on uniswap using ${sKey}`,
        `${aId} blocked for usdc transfer (reason - policy reached)`,
        `${aId} executed deposit on aave yield - +200$`,
        `${aId} executed 45$ transfer .`
      ];
    };
    
    const getSessionPatterns = () => {
      const aId = getRandomHash();
      const sKey = getRandomHash();
      return [
        `session key activated for agent ${aId}`,
        `session key revoked`,
        `agent ${aId} executed deposit in aave yield using session key ${sKey}`,
        `agent ${aId} executed swap on uniswap using session key ${sKey}`
      ];
    };
    
    const getAccountPatterns = () => {
      const aId = getRandomHash();
      const eoa = getRandomHash();
      return [
        `smart account created using eoa ${eoa}`,
        `smart account approved agent ${aId}`,
        `smart account revoked agent ${aId}`
      ];
    };

    const interval = setInterval(() => {
      let patterns = [];
      if (activeTab === 'agent') patterns = getAgentPatterns();
      else if (activeTab === 'session') patterns = getSessionPatterns();
      else if (activeTab === 'account') patterns = getAccountPatterns();

      const randomLog = patterns[Math.floor(Math.random() * patterns.length)];
      setLogs(prev => {
        const newLogs = [...prev, { id: Date.now(), text: randomLog }];
        if (newLogs.length > 10) return newLogs.slice(newLogs.length - 10);
        return newLogs;
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [activeTab]);

  useEffect(() => {
    setLogs([]);
  }, [activeTab]);
  const activeChains = getSupportedChains();
  const viewOnlyChains = getSupportedChains({ includeViewOnly: true }).filter((chain) => !chain.isActive);
  const chainNames = activeChains.map((chain) => chain.name);
  const chainLabel = chainNames.length > 1 ? chainNames.join(', ') : (chainNames[0] || 'supported testnets');

  const features = [
    {
      title: 'Smart account dashboard',
      body: 'See your signer wallet, predicted smart account, deployed status, owner, EntryPoint deposit, and token balances in one place.',
      example: 'EOA + Smart Vault balances',
    },
    {
      title: 'Agentic session keys',
      body: 'Activate a scoped session key module so the agent can prepare routine actions without exposing your owner key.',
      example: 'ERC-7579 SessionKeyValidator',
    },
    {
      title: 'USDC paymaster flows',
      body: 'Route UserOps through the paymaster path and test gas sponsorship or ERC-20 gas payment from the app.',
      example: 'Gas sponsored by Paymaster',
    },
    {
      title: 'Swap, Aave, and portfolio tools',
      body: 'Use Uniswap V3 quotes, Aave V3 USDC actions, Chainlink pricing, UserOp history, batch sends, and minting utilities.',
      example: 'Swap ETH to USDC',
    },
  ];

  const guardrails = [
    ['SK', 'Scoped keys', 'The agent demo uses a limited key concept instead of asking for your owner key on every move.'],
    ['PM', 'Paymaster aware', 'Sponsored or token-paid gas stays visible before the UserOperation is sent.'],
    ['4337', 'Bundler path', 'Actions are packed as ERC-4337 UserOps and tracked after submission.'],
    ['HIST', 'Audit trail', 'Submitted operations can be followed from the History view after you connect.'],
  ];

  const faqs = [
    ['What kind of product is this?', 'This app is an account abstraction wallet interface. It focuses on smart accounts, modules, paymasters, swaps, Aave actions, balances, and UserOp history.'],
    ['Which chains are active right now?', `The active chain registry currently includes ${chainLabel}. Additional view-only chains appear as roadmap entries until they are activated.`],
    ['Does the agent hold funds?', 'No. Funds stay in your smart account. The agent flow demonstrates scoped permissions and still shows the proposed move before confirmation.'],
    ['What happens after I connect?', 'The existing HomeView dashboard takes over: wallet cards, smart account activation, portfolio widgets, paymaster data, swap modal, and quick navigation all remain intact.'],
  ];

  const handleDemoConfirm = () => {
    if (mockTxConfirmed) return;
    const amountVal = parseFloat(mockAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      setMockTxError("Transaction blocked: Amount must be greater than 0 USDC.");
      return;
    }
    if (amountVal > 500) {
      setMockTxError("Transaction blocked: Exceeds remaining daily limit of $500.");
      return;
    }
    setMockTxError(null);
    setMockPopupState('showing');
  };

  const handleMockSign = () => {
    setMockPopupState('signing');
    setTimeout(() => {
      setMockPopupState('confirmed');
      setMockTxConfirmed(true);
      setTimeout(() => {
        setMockPopupState('hidden');
      }, 1500);
    }, 1500);
  };

  return (
    <div className="new-landing-wrap animate-fade-in relative">
      {/* Mock MetaMask Popup */}
      {mockPopupState !== 'hidden' && (
        <div className="new-wallet-popover">
          <div className="new-wallet-popover__top">
            <div className="new-wallet-mark">M</div>
            <span>MetaMask</span>
          </div>
          
          <div className="new-wallet-popover__body">
            {mockPopupState === 'showing' && (
              <>
                <h3>Signature Request</h3>
                <p>
                  WalletCopilot is requesting a session key approval for the demo move.
                </p>
                <div className="new-wallet-request">
                  Action: Allow up to $1,000 daily spend<br/>
                  Target: 0x4a1…F2c9
                </div>
                <div className="new-wallet-actions">
                  <button onClick={() => setMockPopupState('hidden')}>Reject</button>
                  <button onClick={handleMockSign}>Sign</button>
                </div>
              </>
            )}
            
            {mockPopupState === 'signing' && (
              <div className="new-wallet-state">
                <div className="global-loader-spinner"></div>
                <span>Signing approval...</span>
              </div>
            )}

            {mockPopupState === 'confirmed' && (
              <div className="new-wallet-state">
                <div className="new-wallet-success">
                  <Check size={24} />
                </div>
                <span>Confirmed</span>
              </div>
            )}
          </div>
        </div>
      )}
      <header className="new-header">
        <div className="new-bar">
          <a className="new-brand" href="#">
            <span className="new-brand-mark" aria-hidden="true">
              <span></span><span></span><span></span>
            </span>
            <span className="new-word">wallet<span>copilot</span></span>
          </a>
          <nav className="new-nav" aria-label="Landing navigation">
            <a href="#chains">Chains</a>
            <a href="#agent-demo">Agent Demo</a>
            <a href="#security">Security</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="new-header-actions">
            <button className="new-icon-button" type="button" aria-label="Dark mode active">
              <span aria-hidden="true">◐</span>
            </button>
            <button className="new-btn new-btn-ghost" type="button" onClick={connectWallet} disabled={isConnecting}>
              Sign In
            </button>
            <button className="new-btn new-btn-mint" type="button" onClick={connectWallet} disabled={isConnecting}>
              {isConnecting ? 'Connecting...' : 'Launch App'}
            </button>
          </div>
        </div>
      </header>
      
      <main className="new-main-wrap">
        <section className="new-hero" id="agent-demo">
          <div className="new-phero-inner">
            <div className="new-badge-row">
              <a href="#security" className="new-badge">MODULAR SMART ACCOUNTS <ArrowUpRight size={13} /></a>
              <a href="#architecture" className="new-badge"><span className="new-live-dot"></span> ERC-4337 + ERC-7579</a>
              <a href="#agent-demo" className="new-badge"><span className="new-live-pill">LIVE</span> AGENT DEMO</a>
            </div>
            <h1>
              Say the move.
              <span> It handles the UserOp.</span>
            </h1>
            <p className="new-lede">A smart account wallet for the flows this platform already ships: deterministic account setup, session-key activation, paymaster-aware gas, USDC tools, swaps, Aave actions, portfolio widgets, and UserOperation history.</p>
            <div className="new-cta-row">
              <button className="new-btn new-btn-mint" onClick={connectWallet} disabled={isConnecting}>
                {isConnecting ? 'Connecting...' : 'Try Wallet Copilot'}
              </button>
              <a className="new-btn new-btn-panel" href="#how">
                <ArrowRight size={16} /> See how it works
              </a>
            </div>
            <div className="new-chain-row" id="chains">
              {activeChains.map((chain) => (
                <span key={chain.chainId}><span className="new-chip-dot"></span>{chain.name}</span>
              ))}
              {viewOnlyChains.slice(0, 3).map((chain) => (
                <span className="new-chip-muted" key={chain.chainId}>{chain.name} view-only</span>
              ))}
            </div>
          </div>

          <div className="new-agent-shell">
            <div className="new-agent-top">
              <div className="new-window-dots"><span></span><span></span><span></span></div>
              <div className="new-agent-status"><span></span> agent demo active</div>
              <div className="new-agent-meta">Sepolia / Amoy / Arbitrum Sepolia</div>
            </div>
            <div className="new-agent-grid">
              <aside className="new-agent-sidebar">
                <div>
                  <div className="new-sidebar-label">Workspace</div>
                  <button type="button" style={{ width: '100%', textAlign: 'left', border: 'none', background: 'none' }} className={`new-side-tab ${activeTab === 'agent' ? 'new-side-tab--active' : ''}`} onClick={() => setActiveTab('agent')}><Activity size={15} /> Agent stream</button>
                  <button type="button" style={{ width: '100%', textAlign: 'left', border: 'none', background: 'none' }} className={`new-side-tab ${activeTab === 'session' ? 'new-side-tab--active' : ''}`} onClick={() => setActiveTab('session')}><Key size={15} /> Session key</button>
                  <button type="button" style={{ width: '100%', textAlign: 'left', border: 'none', background: 'none' }} className={`new-side-tab ${activeTab === 'account' ? 'new-side-tab--active' : ''}`} onClick={() => setActiveTab('account')}><Box size={15} /> Smart account</button>
                </div>

              </aside>
              <section className="new-agent-main">
                <div className="new-metrics">
                  <div><strong>4337</strong><span>UserOps</span></div>
                  <div><strong>3</strong><span>Active chains</span></div>
                  <div><strong>USDC</strong><span>Gas token path</span></div>
                  <div><strong>Aave</strong><span>Widget enabled</span></div>
                </div>
                <div className="new-stream-head">
                  <span>{activeTab === 'agent' ? 'Execution Stream' : activeTab === 'session' ? 'Session Key Logs' : 'Smart Account Logs'}</span>
                  <span><span className="new-live-dot"></span> live activity parser</span>
                </div>
                <div className="new-chat-stack" style={{ height: '250px', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: '8px' }}>
                  {logs.map((log) => (
                    <div key={log.id} className="new-chat-line new-chat-line--agent">
                      <span style={{ fontSize: '10px', color: '#00f59b' }}>LOG</span>
                      <p style={{ fontFamily: 'monospace', fontSize: '12px' }}>{log.text}</p>
                    </div>
                  ))}
                </div>
                <div className="new-terminal-hint">
                  Protected by session-key boundaries and the existing smart account flow from HomeView.
                </div>
              </section>
            </div>
          </div>

          <div style={{ maxWidth: '750px', margin: '5rem auto 3rem', textAlign: 'center', padding: '0 20px' }}>
            <h3 style={{ fontSize: '1.8rem', marginBottom: '1rem', color: '#fff', fontWeight: '600' }}>Experience the Smart Wallet AI</h3>
            <p style={{ color: '#9ca3af', lineHeight: '1.7', fontSize: '1.1rem' }}>
              Imagine having a personal financial assistant that can securely execute trades and transfers for you, day or night. 
              Our smart wallet platform makes this a reality by letting you grant strict, temporary spending limits to an AI agent. 
              You remain entirely in control of your funds, while the AI does the heavy lifting.
              <br/><br/>
              The interactive demo below shows exactly how this feels. Go ahead and try it out—configure an agent, set a limit, and chat with it!
            </p>
          </div>

          <div className="new-agent-shell">
            <div className="new-agent-top">
              <div className="new-window-dots"><span></span><span></span><span></span></div>
              <div className="new-agent-status"><span></span> agent demo execution</div>
              <div className="new-agent-meta">Interactive Demo</div>
            </div>
            <AgentDemoView />
          </div>
        </section>

        <section id="how" className="new-section">
          <div className="new-head new-head--center">
            <span className="new-section-kicker">Simple onboarding</span>
            <h2>Three things to set up. Then use the actual dashboard.</h2>
            <p>Connecting still drops you into the existing platform experience. The landing page only changes how the product is introduced.</p>
          </div>
          <div className="new-steps">
            <div className="new-step">
              <div className="new-num new-mono">01</div>
              <h3>Connect your wallet</h3>
              <p>Use the same connect flow already in AppContext. Your EOA remains the owner-side signer.</p>
            </div>
            <div className="new-step">
              <div className="new-num new-mono">02</div>
              <h3>Activate the Smart Vault</h3>
              <p>Fund the predicted smart account, deploy when needed, and install the session key validator module.</p>
            </div>
            <div className="new-step">
              <div className="new-num new-mono">03</div>
              <h3>Run UserOps</h3>
              <p>Swap, batch-send, mint test USDC, use paymaster gas, open the agent, and track every submitted UserOperation.</p>
            </div>
          </div>
        </section>

        <section className="new-section">
          <div className="new-head new-head--center">
            <span className="new-section-kicker">Capabilities</span>
            <h2>What this platform actually does</h2>
            <p>No generic enterprise copy. This is the account abstraction surface already wired into the app.</p>
          </div>
          <div className="new-cap-grid">
            {features.map((feature) => (
              <div className="new-cap" key={feature.title}>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
                <div className="new-ex new-mono">{feature.example}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="new-section" id="security">
          <div className="new-head new-head--center">
            <span className="new-section-kicker">Security by design</span>
            <h2>You keep the keys. The platform handles the AA plumbing.</h2>
            <p>Security copy is grounded in the existing app flows: scoped modules, EntryPoint/UserOp submission, paymaster visibility, and tracked operation history.</p>
          </div>
          <div className="new-sec-grid">
            {guardrails.map(([mark, title, body]) => (
              <div className="new-sec-item" key={title}>
                <div className="new-sec-mark">{mark}</div>
                <div><h3>{title}</h3><p>{body}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section className="new-section" id="architecture">
          <div className="new-head new-head--center">
            <span className="new-section-kicker">Infrastructure</span>
            <h2>The stack already under the dashboard</h2>
            <p>A compact map of the pieces users meet after they connect.</p>
          </div>
          <div className="new-arch-stack">
            <details open>
              <summary><span>01</span> ERC-4337 Smart Account</summary>
              <p>Predicted and deployed smart accounts, owner metadata, EntryPoint deposits, balances, and module status are surfaced in HomeView.</p>
            </details>
            <details>
              <summary><span>02</span> Bundler + UserOperation Tracker</summary>
              <p>The app builds, estimates, signs, sends, and tracks UserOps through the bundler utilities and History view.</p>
            </details>
            <details>
              <summary><span>03</span> ERC-20 Paymaster</summary>
              <p>Paymaster screens expose deposits, token balances, and sponsored or token-paid gas paths for smart-account actions.</p>
            </details>
            <details>
              <summary><span>04</span> Session Key Validator</summary>
              <p>The agent activation flow installs a session key validator so automation can be scoped without changing smart account ownership.</p>
            </details>
          </div>
        </section>

        <section className="new-section" id="faq">
          <div className="new-head new-head--center">
            <span className="new-section-kicker">FAQs</span>
            <h2>Questions people actually ask</h2>
          </div>
          <div className="new-faq-grid">
            <div className="new-faq-panel">
              {faqs.map(([question, answer], index) => (
                <details open={index === 0} className="new-details" id={`faq-${index}`} key={question}>
                  <summary className="new-summary">{question} <span className="new-plus">+</span></summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="new-final-cta">
          <h2>Connect once. Build your Smart Vault. Run the agent demo for real.</h2>
          <p>The connected dashboard, modules, paymaster, history, mint, and unified agent views stay exactly where users expect them.</p>
          <div className="new-cta-row">
            <button className="new-btn new-btn-mint" onClick={connectWallet} disabled={isConnecting}>
              {isConnecting ? 'Connecting...' : 'Launch WalletCopilot'}
            </button>
            <a className="new-btn new-btn-panel" href="#agent-demo">Replay demo</a>
          </div>
        </section>

        <footer className="new-footer">
          <div className="new-brand">
            <span className="new-brand-mark" aria-hidden="true"><span></span><span></span><span></span></span>
            <span className="new-word">wallet<span>copilot</span></span>
          </div>
          <div>Non-custodial · Smart accounts · Paymaster-aware UserOps</div>
        </footer>
      </main>
    </div>
  );
}

// ─── Root Export ──────────────────────────────────────────────────────────────
export default function HomeView() {
  const { eoaAddress } = useAppContext();
  return eoaAddress ? <ConnectedDashboard /> : <LandingPage />;
}
