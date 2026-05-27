import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useAppContext } from '../context/AppContext';
import { ERC20PaymasterABI, IEntryPointABI, ERC20_ABI, SmartAccountABI } from '../utils/abis';
import pmArtifact from '../utils/ERC20Paymaster.json';
import { shortenAddress, formatNum, toHex } from '../utils/helpers';
import { sendUserOperation, getUserOpReceipt, estimateUserOperationGas } from '../utils/bundler';
import { useToast } from '../context/ToastContext';
import { DollarSign, ShieldAlert, ArrowDownCircle, ArrowUpCircle, Lock, Unlock, PlayCircle, CheckCircle, RotateCcw, ChevronRight, Info } from 'lucide-react';
import Stepper from '../components/Stepper';


export default function PaymasterView() {
  const { 
    provider, signer, eoaAddress, smartAccountAddress, paymasterAddress, setPaymasterAddress, refreshAllData, env,
    pmETHBalance, pmUSDCBalance, pmDeposit, pmStake, pmUnstakeDelay, pmTokenSymbol, pmTokenDecimals, loadPaymasterDetails,
    saETHBalance, saUSDCBalance, saEntryPointDeposit,
    trackOp, setCurrentView
  } = useAppContext();
  const toast = useToast();


  // Stepper State
  const [currentStep, setCurrentStep] = useState(1);
  const steps = ["Deploy / Connect", "Approve", "Fund & Stake"];


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
  const [pmAllowance, setPmAllowance] = useState('0');
  const [lastOpHash, setLastOpHash] = useState('');

  const fetchPmAllowance = async () => {
    if (!signer || !dToken || !smartAccountAddress || !paymasterAddress) return;
    try {
      const usdc = new ethers.Contract(dToken, ["function allowance(address owner, address spender) view returns (uint256)"], provider);
      const allowance = await usdc.allowance(smartAccountAddress, paymasterAddress);
      setPmAllowance(ethers.formatUnits(allowance, pmTokenDecimals || 6));
    } catch (err) {
      console.error("Error fetching pm allowance:", err);
    }
  };

  useEffect(() => {
    fetchPmAllowance();
  }, [smartAccountAddress, paymasterAddress, provider, dToken]);

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
    }
  };

  const handleConnectPaymaster = async () => {
    if (!connectPmAddress || !ethers.isAddress(connectPmAddress)) {
      alert("Invalid Address format");
      return;
    }
    setConnecting(true);
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
    }
  };

  const executePmAction = async (actionFn, actionName) => {
    if (!signer || !paymasterAddress) return;
    setFunding(true); setWithdrawing(true);
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
    }
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
    console.log("[Approve-V3] Starting approval flow via Smart Account...");
    if (!smartAccountAddress || !approveAmount || !signer || !paymasterAddress || !dToken) {
      toast.error("Missing inputs: Smart Account, Paymaster, or Token address.");
      return;
    }
    setApproving(true);
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

      const saBalanceEth = parseFloat(saETHBalance || "0");
      const saDepositEth = parseFloat(ethers.formatEther(saEntryPointDeposit || "0"));
      const totalAvailableEth = saBalanceEth + saDepositEth;

      console.log(`[Prefund-Check] Required max prefund: ${requiredPrefundEth.toFixed(5)} ETH. Available: ${totalAvailableEth.toFixed(5)} ETH.`);

      if (totalAvailableEth < requiredPrefundEth) {
        toast.error(
          `Insufficient ETH for prefund! The EntryPoint requires your Smart Account to have at least ${requiredPrefundEth.toFixed(4)} ETH to cover the worst-case gas cost of this transaction (based on current network fee of ${ethers.formatUnits(maxFeePerGas, "gwei")} Gwei). You currently have ${totalAvailableEth.toFixed(4)} ETH. Please deposit more ETH into your Smart Account first.`
        );
        setApproving(false);
        return;
      }

      const parsedAmount = ethers.parseUnits(approveAmount, pmTokenDecimals || 6);
      
      const erc20 = new ethers.Interface(ERC20_ABI);
      const inner = erc20.encodeFunctionData("approve", [paymasterAddress, parsedAmount]);
      
      const saInterface = new ethers.Interface(SmartAccountABI);
      const callData = saInterface.encodeFunctionData("execute", [dToken, 0, inner]);

      const entryPoint = new ethers.Contract(env.ENTRY_POINT, IEntryPointABI, provider);
      const nonce = await entryPoint.getNonce(smartAccountAddress, 0);

      const userOp = {
        sender: smartAccountAddress,
        nonce: toHex(nonce),
        initCode: "0x", 
        callData: callData,
        callGasLimit: toHex(150000), 
        verificationGasLimit: toHex(150000),
        preVerificationGas: toHex(50000),
        maxFeePerGas: toHex(maxFeePerGas),
        maxPriorityFeePerGas: toHex(maxPriorityFeePerGas),
        paymasterAndData: "0x", // SA pays gas in ETH for its own approval
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

      const hash = await entryPoint.getUserOpHash(userOp);
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
          <div className="glass-card border border-primary/30 shadow-[0_0_40px_rgba(124,58,237,0.18)] relative overflow-hidden mb-2">
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
              <div className="glass-stat-card group">
                <span className="text-xs text-muted uppercase tracking-wider font-semibold mb-1 block">PM {pmTokenSymbol}</span>
                <span className="font-bold text-xl text-gradient-secondary truncate">{pmUSDCBalance}</span>
              </div>
              <div className="glass-stat-card group">
                <span className="text-xs text-muted uppercase tracking-wider font-semibold mb-1 block">Approved</span>
                <span className="font-bold text-xl text-gradient-secondary truncate">{pmAllowance}</span>
              </div>
              <div className="glass-stat-card group">
                <span className="text-xs text-muted uppercase tracking-wider font-semibold mb-1 block">Token</span>
                <span className="font-bold text-sm truncate uppercase tracking-widest text-[#94A3B8]">{shortenAddress(dToken)}</span>
              </div>
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
                <b>Why approval?</b> The Paymaster needs permission to take USDC from your wallet to pay for your Smart Account's transaction gas. 
                This enables "gasless" transactions where you pay in USDC instead of ETH.
                <br/><br/>
                <b className="text-white">Current Approved Amount:</b> {pmAllowance} {pmTokenSymbol || 'Tokens'}
             </span>
           </p>
        </div>
        
        <div className="flex items-center gap-4 p-4 border border-white/5 bg-white/5 rounded-xl">
          <input 
            type="number" 
            className="input-field flex-1" 
            placeholder={`Amount in ${pmTokenSymbol || 'Tokens'}`} 
            value={approveAmount} 
            onChange={e=>setApproveAmount(e.target.value)} 
          />
          <button className={`btn btn-primary ${approving ? 'opacity-50 cursor-not-allowed' : ''}`} onClick={handleApprovePaymaster} disabled={approving || !approveAmount}>
            {approving ? "Approving..." : "Approve from Smart Account"}
          </button>
        </div>

        {lastOpHash && (
          <div className="mt-4 p-4 rounded-xl border" style={{
            background: 'rgba(139, 92, 246, 0.08)',
            borderColor: 'rgba(139, 92, 246, 0.3)',
          }}>
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#a78bfa' }}>UserOperation Submitted</span>
            <p className="font-mono text-xs break-all text-muted mt-2 mb-3" title={lastOpHash}>{lastOpHash}</p>
            <p className="text-xs text-muted mb-3">Approval is being tracked in the background. The UI is unlocked — you can continue using the application.</p>
            <button
              onClick={() => setCurrentView('history')}
              className="btn btn-primary py-1.5 px-4 text-xs flex items-center gap-2"
            >
              View TX Status in History →
            </button>
          </div>
        )}
      </div>
    </div>
  );

}
