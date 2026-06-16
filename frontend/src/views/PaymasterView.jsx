import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useAppContext } from '../context/AppContext';
import { ERC20PaymasterABI, IEntryPointABI, ERC20_ABI, SmartAccountABI } from '../utils/abis';
import pmArtifact from '../utils/ERC20Paymaster.json';
import { shortenAddress, formatNum, toHex, packUserOp, encodeERC7579Single } from '../utils/helpers';
import { sendUserOperation, getUserOpReceipt, estimateUserOperationGas } from '../utils/bundler';
import { useToast } from '../context/ToastContext';
import { DollarSign, ShieldAlert, ArrowDownCircle, ArrowUpCircle, Lock, Unlock, PlayCircle, CheckCircle, RotateCcw, ChevronRight, Info, Settings, X, Plus, AlertTriangle } from 'lucide-react';
import Stepper from '../components/Stepper';


export default function PaymasterView() {
  const { 
    provider, signer, eoaAddress, smartAccountAddress, paymasterAddress, setPaymasterAddress, refreshAllData, env,
    pmETHBalance, pmUSDCBalance, pmDeposit, pmStake, pmUnstakeDelay, pmTokenSymbol, pmTokenDecimals, loadPaymasterDetails,
    saETHBalance, saUSDCBalance, saEntryPointDeposit,
    trackOp, setCurrentView, setGlobalLoading, refreshTrigger
  } = useAppContext();
  const toast = useToast();


  // Stepper State
  const [currentStep, setCurrentStep] = useState(1);
  const steps = ["Deploy / Connect", "Approve", "Fund & Stake"];

  // Admin State
  const [pmOwner, setPmOwner] = useState('');
  const [showAdminModal, setShowAdminModal] = useState(false);
  
  // Admin Action States
  const [adminDepositAmount, setAdminDepositAmount] = useState('');
  const [adminStakeAmount, setAdminStakeAmount] = useState('');
  const [adminEthAddress, setAdminEthAddress] = useState('');
  const [adminWithdrawEthAmount, setAdminWithdrawEthAmount] = useState('');
  const [adminTokenAddress, setAdminTokenAddress] = useState('');
  const [adminTokenAmount, setAdminTokenAmount] = useState('');
  const [adminUnstakeDelay, setAdminUnstakeDelay] = useState('86400');
  
  // Admin Add Token States
  const [adminNewToken, setAdminNewToken] = useState('');
  const [adminNewTokenFeed, setAdminNewTokenFeed] = useState('');
  const [adminNewTokenMinPrice, setAdminNewTokenMinPrice] = useState('950000'); // $0.95 with 6 decimals


  // Deploy States
  const [dEntryPoint, setDEntryPoint] = useState(env.ENTRY_POINT || '');
  const [dToken, setDToken] = useState(env.USDC_TOKEN || '');
  const [dPriceFeed, setDPriceFeed] = useState(env.PRICE_FEED || '');
  const [deploying, setDeploying] = useState(false);

  // Connect States
  const [connectPmAddress, setConnectPmAddress] = useState('');
  const [connecting, setConnecting] = useState(false);

  // Fund States
  const [depositAmount, setDepositAmount] = useState('');
  const [stakeAmount, setStakeAmount] = useState('');
  const [unstakeDelay, setUnstakeDelay] = useState('86400');
  const [funding, setFunding] = useState(false);

  // Withdraw / Unstake States
  const [wEthAddress, setWEthAddress] = useState('');
  const [wEthAmount, setWEthAmount] = useState('');
  const [wUsdcAddress, setWUsdcAddress] = useState('');
  const [wUsdcAmount, setWUsdcAmount] = useState('');
  const [wStakeAddress, setWStakeAddress] = useState('');
  const [unlockedState, setUnlockedState] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  // Approve State
  const [approveAmount, setApproveAmount] = useState('10');
  const [approving, setApproving] = useState(false);
  const [lastOpHash, setLastOpHash] = useState('');

  const [selectedApproveToken, setSelectedApproveToken] = useState(env.USDC_TOKEN || '');
  const [tokenAllowances, setTokenAllowances] = useState({});
  const [pmTokenBalances, setPmTokenBalances] = useState({});

  const trackedTokens = [
    { symbol: 'USDC', address: env.USDC_TOKEN, decimals: 6 },
    { symbol: 'EURC', address: '0x08210f9170f89ab7658f0b5e3ff39b0e03c594d4', decimals: 6 }
  ];

  const fetchTokenData = async () => {
    if (!signer || !smartAccountAddress || !paymasterAddress) return;
    const allowances = {};
    const pmBalances = {};
    for (const t of trackedTokens) {
      if (!t.address) continue;
      try {
        const erc20 = new ethers.Contract(t.address, [
          "function allowance(address owner, address spender) view returns (uint256)",
          "function balanceOf(address account) view returns (uint256)"
        ], provider);
        const allowance = await erc20.allowance(smartAccountAddress, paymasterAddress);
        allowances[t.symbol] = ethers.formatUnits(allowance, t.decimals || 6);

        const pmBal = await erc20.balanceOf(paymasterAddress);
        pmBalances[t.symbol] = ethers.formatUnits(pmBal, t.decimals || 6);
      } catch (err) {
        allowances[t.symbol] = "0.0";
        pmBalances[t.symbol] = "0.0";
      }
    }
    setTokenAllowances(allowances);
    setPmTokenBalances(pmBalances);
  };

  const fetchPmOwner = async () => {
    if (!provider || !paymasterAddress) return;
    try {
      const pmContract = new ethers.Contract(paymasterAddress, ERC20PaymasterABI, provider);
      const owner = await pmContract.owner();
      setPmOwner(owner);
    } catch (err) {
      console.error("Error fetching pm owner:", err);
    }
  };

  useEffect(() => {
    fetchTokenData();
    fetchPmOwner();
  }, [smartAccountAddress, paymasterAddress, provider, refreshTrigger]);

  // Auto-redirect
  useEffect(() => {
    if (paymasterAddress && currentStep === 1) {
       setCurrentStep(2);
    }
  }, [paymasterAddress]);


  useEffect(() => {
    if (paymasterAddress && dEntryPoint && dToken && provider) {
      loadPaymasterDetails(paymasterAddress, provider);
    }
  }, [paymasterAddress, dEntryPoint, dToken, provider]);

  const handleDeploy = async () => {
    if (!signer || !dEntryPoint || !dToken || !dPriceFeed) return;
    setDeploying(true);
    setGlobalLoading(true, "Deploying Paymaster...");
    try {
      const pmFactory = new ethers.ContractFactory(pmArtifact.abi, pmArtifact.bytecode, signer);
      
      const pmContract = await pmFactory.deploy(
         dEntryPoint,
         dToken,
         dPriceFeed
      );
      
      await pmContract.waitForDeployment();
      const deployedAddress = await pmContract.getAddress();
      setPaymasterAddress(deployedAddress);
      toast.success(`Paymaster successfully deployed at: ${deployedAddress}`);
    } catch (err) {
      if (err.code === 4001) toast.error("Transaction rejected by user");
      else toast.error(err.reason || err.message || "Deployment failed");
    } finally {
      setDeploying(false);
      setGlobalLoading(false);
    }
  };

  const handleConnectPaymaster = async () => {
    if (!connectPmAddress || !ethers.isAddress(connectPmAddress)) {
      alert("Invalid Address format");
      return;
    }
    setConnecting(true);
    setGlobalLoading(true, "Connecting Paymaster...");
    try {
      const code = await provider.getCode(connectPmAddress);
      if (code === "0x") {
        toast.error("No contract deployed at this address!");
        return;
      }
      setPaymasterAddress(connectPmAddress);
      toast.success(`Paymaster successfully connected at ${connectPmAddress}`);
    } catch(err) {
      toast.error("Error connecting: " + err.message);
    } finally {
      setConnecting(false);
      setGlobalLoading(false);
    }
  };

  const executePmAction = async (actionFn, actionName) => {
    if (!signer || !paymasterAddress) return;
    setFunding(true); setWithdrawing(true);
    setGlobalLoading(true, `Processing ${actionName}...`);
    try {
       const pmContract = new ethers.Contract(paymasterAddress, ERC20PaymasterABI, signer);
       const tx = await actionFn(pmContract);
       await tx.wait();
       await refreshAllData();
       toast.success(`${actionName} completed successfully!`);
    } catch (err) {
       if (err.code === 4001) toast.error("Transaction rejected by user");
       else toast.error(err.reason || err.message || `${actionName} failed`);
    } finally {
       setFunding(false); setWithdrawing(false);
       setGlobalLoading(false);
    }
  };

  // --- Admin Handlers ---
  const handleAdminDeposit = async () => {
    if (!adminDepositAmount) return;
    await executePmAction(async (pm) => pm.deposit({ value: ethers.parseEther(adminDepositAmount) }), "Deposit ETH to EntryPoint");
  };

  const handleAdminStake = async () => {
    if (!adminStakeAmount || !adminUnstakeDelay) return;
    await executePmAction(async (pm) => pm.addStake(adminUnstakeDelay, { value: ethers.parseEther(adminStakeAmount) }), "Stake ETH to EntryPoint");
  };

  const handleAdminWithdrawETH = async () => {
    if (!adminWithdrawEthAmount || !adminEthAddress) return;
    await executePmAction(async (pm) => pm.withdrawTo(adminEthAddress.trim(), ethers.parseEther(adminWithdrawEthAmount.trim())), "Withdraw ETH from EntryPoint");
  };

  const handleAdminWithdrawToken = async () => {
    if (!adminTokenAmount || !adminTokenAddress || !adminEthAddress) return;
    await executePmAction(async (pm) => {
        const tokenAddr = adminTokenAddress.trim();
        const toAddr = adminEthAddress.trim();
        const decimals = await (new ethers.Contract(tokenAddr, ERC20_ABI, provider)).decimals();
        return pm.withdrawToken(tokenAddr, toAddr, ethers.parseUnits(adminTokenAmount.trim(), Number(decimals)));
    }, "Withdraw Token from Paymaster");
  };

  const handleAdminAddToken = async () => {
    if (!adminNewToken || !adminNewTokenFeed || !adminNewTokenMinPrice) return;
    await executePmAction(async (pm) => pm.addToken(adminNewToken, adminNewTokenFeed, BigInt(adminNewTokenMinPrice)), "Add Token Support");
  };

  const handleDeposit = () => executePmAction(
    pm => pm.deposit({ value: ethers.parseEther(depositAmount) }), "Deposit ETH"
  );

  const handleStake = () => executePmAction(
    pm => pm.addStake(unstakeDelay, { value: ethers.parseEther(stakeAmount) }), "Add Stake"
  );

  const handleWithdrawEth = () => executePmAction(
    pm => pm.withdrawTo(wEthAddress, ethers.parseEther(wEthAmount)), "Withdraw ETH"
  );
  
  const handleWithdrawUsdc = () => executePmAction(
    pm => pm.withdrawToken(wUsdcAddress, ethers.parseUnits(wUsdcAmount, 6)), "Withdraw USDC"
  );

  const handleUnlockStake = () => executePmAction(
    pm => pm.unlockStake(), "Unlock Stake"
  );

  const handleWithdrawStake = () => executePmAction(
    pm => pm.withdrawStake(wStakeAddress), "Withdraw Stake"
  );

  const handleApprovePaymaster = async () => {
    const targetToken = selectedApproveToken || dToken;
    console.log("[Approve-V3] Starting approval flow via Smart Account...");
    if (!smartAccountAddress || !approveAmount || !signer || !paymasterAddress || !targetToken) {
      toast.error("Missing inputs: Smart Account, Paymaster, or Token address.");
      return;
    }
    setApproving(true);
    setGlobalLoading(true, "Approving Paymaster via Smart Account...");
    try {
      // Robust EIP-1559 gas fee estimation for public bundlers
      let maxFeePerGas = 25000000000n; // 25 Gwei fallback
      let maxPriorityFeePerGas = 1500000000n; // 1.5 Gwei fallback
      try {
        const block = await provider.getBlock("latest");
        if (block && block.baseFeePerGas) {
          maxFeePerGas = block.baseFeePerGas * 2n + maxPriorityFeePerGas;
        } else {
          const fee = await provider.getFeeData();
          maxFeePerGas = fee.maxFeePerGas || (fee.gasPrice ? fee.gasPrice * 2n : maxFeePerGas);
          maxPriorityFeePerGas = fee.maxPriorityFeePerGas || maxPriorityFeePerGas;
        }
      } catch (feeErr) {
        console.warn("Failed to get EIP-1559 fees via block, using getFeeData fallback:", feeErr);
        try {
          const fee = await provider.getFeeData();
          maxFeePerGas = fee.maxFeePerGas || maxFeePerGas;
          maxPriorityFeePerGas = fee.maxPriorityFeePerGas || maxPriorityFeePerGas;
        } catch (e) {
          console.error("Failed to load fee fallback:", e);
        }
      }

      // EntryPoint gas prefund (maxCost) validation check
      const totalGasLimit = 150000n + 150000n + 50000n; // callGasLimit + verificationGasLimit + preVerificationGas
      const requiredPrefundWei = totalGasLimit * maxFeePerGas;
      const requiredPrefundEth = parseFloat(ethers.formatEther(requiredPrefundWei));

      const saBalanceEth = parseFloat(ethers.formatEther(saETHBalance || "0"));
      const saDepositEth = parseFloat(ethers.formatEther(saEntryPointDeposit || "0"));
      const totalAvailableEth = saBalanceEth + saDepositEth;

      console.log(`[Prefund-Check] Required max prefund: ${requiredPrefundEth.toFixed(5)} ETH. Available: ${totalAvailableEth.toFixed(5)} ETH.`);

      if (totalAvailableEth < requiredPrefundEth) {
        toast.error(
          `Insufficient ETH for prefund! The EntryPoint requires your Smart Account to have at least ${requiredPrefundEth.toFixed(4)} ETH to cover the worst-case gas cost of this transaction. You currently have ${totalAvailableEth.toFixed(4)} ETH total (Balance + Deposit). Please deposit more ETH into your Smart Account first.`
        );
        setApproving(false);
        setGlobalLoading(false);
        return;
      }

      const targetDecimals = trackedTokens.find(t => t.address.toLowerCase() === targetToken.toLowerCase())?.decimals || pmTokenDecimals || 6;
      const parsedAmount = ethers.parseUnits(approveAmount, targetDecimals);
      
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
        callGasLimit: toHex(150000), 
        verificationGasLimit: toHex(150000),
        preVerificationGas: toHex(50000),
        maxFeePerGas: toHex(maxFeePerGas),
        maxPriorityFeePerGas: toHex(maxPriorityFeePerGas),
        paymaster: "0x", // SA pays gas in ETH for its own approval
        paymasterVerificationGasLimit: "0x",
        paymasterPostOpGasLimit: "0x",
        paymasterData: "0x",
        signature: "0x"
      };

      try {
        const est = await estimateUserOperationGas(userOp);
        userOp.callGasLimit = toHex(est.callGasLimit);
        userOp.verificationGasLimit = toHex(est.verificationGasLimit);
        userOp.preVerificationGas = toHex(BigInt(est.preVerificationGas) + 5000n);
      } catch (err) {
        console.warn("Estimation failed, using defaults", err);
      }

      const hash = await entryPoint.getUserOpHash(packUserOp(userOp));
      userOp.signature = await signer.signMessage(ethers.getBytes(hash));

      toast.info("Sending UserOp to approve Paymaster...");
      const opHash = await sendUserOperation(userOp);

      // Fire and forget — global tracker handles confirmation in background
      trackOp(opHash, 'USDC Approval to Paymaster');
      setLastOpHash(opHash);
      toast.withAction(
        'UserOp submitted to bundler!',
        'View in History →',
        () => setCurrentView('history'),
        'info'
      );
      setCurrentStep(3); // Optimistically advance stepper
    } catch (err) {
      if (err.code === 4001) toast.error("Transaction rejected by user");
      else toast.error(err.reason || err.message || "Failed to approve Paymaster");
    } finally {
      setApproving(false);
      setGlobalLoading(false);
    }
  };

  const completedSteps = [];
  if (paymasterAddress) completedSteps.push(1);
  // Approval is hard to check without custom hook, but we can assume if they have a balance or moved manually
  if (pmDeposit !== "0" || pmStake !== "0") completedSteps.push(3);

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto pb-10">
      
      {/* Details Section (Shown under navbar if connected) */}
      <div className="flex flex-col gap-4">
        {/* Smart Account Banner for context */}
        {smartAccountAddress && (
          <div className="glass-card flex justify-between items-center py-3 bg-secondary/5 border-secondary/20">
             <div className="flex items-center gap-3">
               <ShieldAlert className="text-secondary" size={20} />
               <div>
                  <h4 className="text-sm font-bold m-0 leading-tight">Linked Smart Account</h4>
                  <span className="text-xs text-muted font-mono">{smartAccountAddress}</span>
               </div>
             </div>
             <div className="flex gap-6">
               <div className="text-right">
                  <div className="text-[10px] text-muted uppercase tracking-wider">SA ETH</div>
                  <div className="text-xs font-bold text-gradient-primary">{formatNum(saETHBalance, 18)} <span className="font-normal text-muted">ETH</span></div>
               </div>
               <div className="text-right">
                  <div className="text-[10px] text-muted uppercase tracking-wider">SA {pmTokenSymbol}</div>
                  <div className="text-xs font-bold text-gradient-secondary">{formatNum(saUSDCBalance, 6)} <span className="font-normal text-muted">{pmTokenSymbol}</span></div>
               </div>
             </div>
          </div>
        )}

        {paymasterAddress && (
          <div className="glass-card border border-primary/30 shadow-[0_0_40px_rgba(22, 163, 74,0.18)] relative overflow-hidden mb-2">
            <div className="absolute top-0 left-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -ml-20 -mt-20 pointer-events-none"></div>
            <div className="flex justify-between items-center bg-primary/10 p-4 rounded-xl border border-primary/20 mb-4 z-10 relative">
              <div className="flex items-center gap-3">
                <DollarSign className="text-primary" size={28} />
                <div>
                   <h3 className="text-xl font-bold m-0 leading-tight text-gradient">Paymaster Details Dashboard</h3>
                   <span className="text-sm text-primary/80 font-mono tracking-wide">Active: {shortenAddress(paymasterAddress)}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {pmOwner && eoaAddress && pmOwner.toLowerCase() === eoaAddress.toLowerCase() && (
                   <button 
                     className="btn btn-secondary flex items-center gap-2 py-1.5 px-3"
                     onClick={() => setShowAdminModal(true)}
                   >
                     <Settings size={16} /> Admin
                   </button>
                )}
                <button 
                  className="p-2 rounded-full bg-white/5 border border-white/10 shadow-sm hover:bg-white/10 hover:border-white/20 transition-all text-muted hover:text-white"
                  onClick={refreshAllData}
                  title="Refresh Paymaster data"
                >
                  <RotateCcw size={18} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 z-10 relative">
              <div className="glass-stat-card group">
                <span className="text-xs text-muted uppercase tracking-wider font-semibold mb-1 block">EP Deposit</span>
                <span className="font-bold text-xl text-gradient-primary">{formatNum(pmDeposit, 18)}</span>
              </div>
              <div className="glass-stat-card group">
                <span className="text-xs text-muted uppercase tracking-wider font-semibold mb-1 block">EP Stake</span>
                <span className="font-bold text-xl text-gradient-primary">{formatNum(pmStake, 18)}</span>
              </div>
              <div className="glass-stat-card group">
                <span className="text-xs text-muted uppercase tracking-wider font-semibold mb-1 block">PM ETH</span>
                <span className="font-bold text-xl text-gradient-primary">{formatNum(pmETHBalance, 18)}</span>
              </div>
              {trackedTokens?.map(t => {
                const pmBal = pmTokenBalances[t.symbol] || "0.0";
                const approvedAmt = tokenAllowances[t.symbol] || "0.0";
                return (
                  <div key={t.address} className="glass-stat-card group">
                    <span className="text-xs text-muted uppercase tracking-wider font-semibold mb-1 block">PM {t.symbol} / Approved</span>
                    <span className="font-bold text-xl text-gradient-secondary truncate">{formatNum(pmBal, 0)} / <span className="text-sm font-normal text-white">{approvedAmt}</span></span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {/* Paymaster Approval Flow */}
      <div className="glass-card max-w-2xl mx-auto animate-fade-in border-secondary/30">
        <h3 className="mb-2 flex items-center gap-2 text-secondary"><CheckCircle size={28} /> Approve Paymaster</h3>
        <div className="bg-secondary/5 border border-secondary/10 p-4 rounded-lg mb-6">
           <p className="info-callout text-sm text-muted mb-0">
             <Info className="flex-shrink-0 text-secondary" />
             <span>
                <b>Why approval?</b> The Paymaster needs permission to take tokens from your wallet to pay for your Smart Account's transaction gas. 
                This enables "gasless" transactions where you pay in tokens instead of ETH.
             </span>
           </p>
        </div>
        
        <div className="flex flex-col gap-4 p-4 border border-black/5 bg-white/5 rounded-xl shadow-sm">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-sm text-muted mb-2 block font-semibold">Asset</label>
              <select 
                className="input-field w-full py-2 text-base font-semibold" 
                value={selectedApproveToken} 
                onChange={e=>setSelectedApproveToken(e.target.value)}
              >
                {trackedTokens?.map(t => (
                  <option key={t.address} value={t.address}>{t.symbol}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-sm text-muted mb-2 block font-semibold">Amount</label>
              <input 
                type="number" 
                className="input-field w-full py-2 text-base font-bold" 
                placeholder="0.00" 
                value={approveAmount} 
                onChange={e=>setApproveAmount(e.target.value)} 
              />
            </div>
          </div>
          <button className={`btn btn-primary w-full mt-2 ${approving ? 'opacity-50 cursor-not-allowed' : ''}`} onClick={handleApprovePaymaster} disabled={approving || !approveAmount}>
            {approving ? "Approving..." : "Approve from Smart Account"}
          </button>
        </div>
      </div>

      {showAdminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass-card max-w-2xl w-full max-h-[90vh] overflow-y-auto border-secondary/30 relative shadow-2xl">
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/10">
              <h2 className="text-xl font-bold flex items-center gap-2 text-gradient-secondary">
                <Settings size={24} className="text-secondary" /> Paymaster Admin Controls
              </h2>
              <button onClick={() => setShowAdminModal(false)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-muted transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-8">
              {/* Stake & Deposit */}
              <section>
                <h3 className="text-sm font-semibold uppercase tracking-widest text-muted mb-3 flex items-center gap-2"><Lock size={16}/> EntryPoint ETH</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-white/5 rounded-xl border border-white/10 flex flex-col gap-3">
                    <label className="text-xs text-muted mb-[-4px]">Deposit Amount</label>
                    <input type="number" className="input-field py-2 text-sm" placeholder="0.01 ETH" value={adminDepositAmount} onChange={e=>setAdminDepositAmount(e.target.value)} />
                    <button className="btn btn-secondary w-full text-sm py-2 mt-1" onClick={handleAdminDeposit} disabled={!adminDepositAmount}>Deposit ETH</button>
                  </div>
                  <div className="p-4 bg-white/5 rounded-xl border border-white/10 flex flex-col gap-3">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-xs text-muted mb-[-4px]">Stake Amount</label>
                        <input type="number" className="input-field py-2 text-sm w-full" placeholder="0.01 ETH" value={adminStakeAmount} onChange={e=>setAdminStakeAmount(e.target.value)} />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-muted mb-[-4px]">Unstake Delay (Sec)</label>
                        <input type="number" className="input-field py-2 text-sm w-full" placeholder="86400" value={adminUnstakeDelay} onChange={e=>setAdminUnstakeDelay(e.target.value)} />
                      </div>
                    </div>
                    <button className="btn btn-secondary w-full text-sm py-2 mt-1" onClick={handleAdminStake} disabled={!adminStakeAmount || !adminUnstakeDelay}>Stake ETH</button>
                  </div>
                </div>
              </section>

              {/* Withdrawals */}
              <section>
                <h3 className="text-sm font-semibold uppercase tracking-widest text-muted mb-3 flex items-center gap-2"><ArrowUpCircle size={16}/> Withdrawals</h3>
                <div className="p-4 bg-white/5 rounded-xl border border-white/10 flex flex-col gap-4">
                  <div className="flex gap-4">
                     <div className="flex-1">
                        <label className="text-xs text-muted mb-1 block">Recipient Address</label>
                        <input type="text" className="input-field py-2 text-sm font-mono" placeholder="0x..." value={adminEthAddress} onChange={e=>setAdminEthAddress(e.target.value)} />
                     </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-4 items-end">
                     <div className="flex-1 w-full">
                        <label className="text-xs text-muted mb-1 block">ETH Amount to Withdraw (From EntryPoint)</label>
                        <div className="flex gap-2">
                          <input type="number" className="input-field py-2 text-sm w-1/3" placeholder="0.01" value={adminWithdrawEthAmount} onChange={e=>setAdminWithdrawEthAmount(e.target.value)} />
                          <button className="btn btn-secondary py-2 px-4 whitespace-nowrap text-sm flex-1" onClick={handleAdminWithdrawETH} disabled={!adminWithdrawEthAmount || !adminEthAddress}>Withdraw ETH</button>
                        </div>
                     </div>
                     <div className="flex-1 w-full">
                        <label className="text-xs text-muted mb-1 block">ERC20 Token & Amount to Withdraw</label>
                        <div className="flex gap-2">
                          <input type="text" className="input-field py-2 text-sm font-mono w-1/2" placeholder="Token 0x..." value={adminTokenAddress} onChange={e=>setAdminTokenAddress(e.target.value)} />
                          <input type="number" className="input-field py-2 text-sm w-1/4" placeholder="Amt" value={adminTokenAmount} onChange={e=>setAdminTokenAmount(e.target.value)} />
                          <button className="btn btn-secondary py-2 px-3 text-sm flex-1" onClick={handleAdminWithdrawToken} disabled={!adminTokenAddress || !adminTokenAmount || !adminEthAddress}>Withdraw Token</button>
                        </div>
                     </div>
                  </div>
                </div>
              </section>

              {/* Add Token Support */}
              <section>
                <h3 className="text-sm font-semibold uppercase tracking-widest text-muted mb-3 flex items-center gap-2"><Plus size={16}/> Add Payment Token</h3>
                <div className="p-4 bg-white/5 rounded-xl border border-white/10 flex flex-col gap-4">
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-muted mb-1 block">Token Address</label>
                        <input type="text" className="input-field py-2 text-sm font-mono" placeholder="0x..." value={adminNewToken} onChange={e=>setAdminNewToken(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-xs text-muted mb-1 block">Chainlink USD Feed</label>
                        <input type="text" className="input-field py-2 text-sm font-mono" placeholder="0x..." value={adminNewTokenFeed} onChange={e=>setAdminNewTokenFeed(e.target.value)} />
                      </div>
                   </div>
                   <div>
                      <label className="text-xs text-muted mb-1 block">Min Token Price (in feed decimals, e.g. 950000 for $0.95 w/ 6 decimals)</label>
                      <input type="number" className="input-field py-2 text-sm" placeholder="950000" value={adminNewTokenMinPrice} onChange={e=>setAdminNewTokenMinPrice(e.target.value)} />
                   </div>
                   <button className="btn btn-secondary w-full text-sm py-2 mt-2" onClick={handleAdminAddToken} disabled={!adminNewToken || !adminNewTokenFeed || !adminNewTokenMinPrice}>Add Token Configuration</button>
                   <div className="bg-orange-500/10 border border-orange-500/20 p-3 rounded-md mt-2 flex gap-3 text-orange-200/80 text-xs items-start">
                      <AlertTriangle size={16} className="text-orange-400 flex-shrink-0 mt-0.5" />
                      <p>Token must have a valid Chainlink feed. Decimals will be fetched automatically from the token and feed contracts.</p>
                   </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );

}
