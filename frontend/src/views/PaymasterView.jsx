import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useAppContext } from '../context/AppContext';
import { ERC20PaymasterABI, IEntryPointABI, ERC20_ABI, SmartAccountABI } from '../utils/abis';
import pmArtifact from '../utils/ERC20Paymaster.json';
import { shortenAddress, formatNum } from '../utils/helpers';
import { useToast } from '../context/ToastContext';
import { DollarSign, ShieldAlert, ArrowDownCircle, ArrowUpCircle, Lock, Unlock, PlayCircle, CheckCircle, RotateCcw, ChevronRight, Info } from 'lucide-react';
import Stepper from '../components/Stepper';


export default function PaymasterView() {
  const { 
    provider, signer, eoaAddress, smartAccountAddress, paymasterAddress, setPaymasterAddress, refreshAllData, env,
    pmETHBalance, pmUSDCBalance, pmDeposit, pmStake, pmUnstakeDelay, pmTokenSymbol, pmTokenDecimals, loadPaymasterDetails,
    saETHBalance, saUSDCBalance
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
    console.log("[Approve-V3] Starting approval flow...");
    if (!smartAccountAddress || !approveAmount || !signer || !paymasterAddress || !dToken) {
      toast.error("Missing inputs: Smart Account, Paymaster, or Token address.");
      return;
    }
    setApproving(true);
    try {
      // 1. Check EOA ETH Balance (MetaMask wallet)
      const balance = await provider.getBalance(eoaAddress);
      console.log("[Approve-V3] EOA Balance:", ethers.formatEther(balance));
      if (balance === 0n) {
          toast.error("Your EOA (MetaMask) has 0 ETH! You need ETH to pay for gas.");
          setApproving(false);
          return;
      }

      // 2. Check if Smart Account is deployed
      console.log("[Approve-V3] Verifying deployment for:", smartAccountAddress);
      const code = await provider.getCode(smartAccountAddress);
      if (code === "0x") {
          toast.error("Smart Account NOT detected on-chain. Deploy it first!");
          setApproving(false);
          return;
      }

      console.log("[Approve-V3] Initializing contracts...");
      
      const tokenContract = new ethers.Contract(dToken, ERC20_ABI, signer);
      const amountToApprove = ethers.parseUnits(approveAmount, pmTokenDecimals);
      
      console.log("[Approve-V3] Dispatching approve() transaction from EOA...");
      
      try {
        const tx = await tokenContract.approve(paymasterAddress, amountToApprove);
        console.log("[Approve-V3] Transaction Hash:", tx.hash);
        
        await tx.wait();
        await refreshAllData();
        toast.success("Success! Paymaster is approved.");
      } catch (err) {
        console.error("[Approve-V3] Execution failed during estimateGas or sending:", err);
        throw err; // rethrow to be caught by outer catch
      }
    } catch (err) {
      console.error("[Approve-V3] FINAL CATCH ERROR:", err);
      
      let errorMessage = "Unknown Error";
      if (err.reason) errorMessage = err.reason;
      else if (err.message) errorMessage = err.message;
      else if (typeof err === 'string') errorMessage = err;
      
      if (err.data) {
          console.log("[Approve-V3] Revert Data:", err.data);
          errorMessage += ` (Data: ${err.data})`;
      }
      
      if (err.code === "CALL_EXCEPTION") {
          errorMessage = "Execution Reverted. Check ownership and ETH balance.";
      }

      toast.error("FAILED: " + errorMessage);
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
          <div className="glass-card border border-primary/30 shadow-[0_0_40px_rgba(79,70,229,0.15)] relative overflow-hidden mb-2">
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

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 z-10 relative">
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
                <span className="text-xs text-muted uppercase tracking-wider font-semibold mb-1 block">Token</span>
                <span className="font-bold text-sm truncate uppercase tracking-widest text-[#94A3B8]">{shortenAddress(dToken)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Top Navbar / Stepper View */}
      <div className="glass-card mb-4 relative overflow-hidden">
        <div className="flex justify-between items-center mb-8 relative z-10">
           <h2 className="m-0 text-gradient text-2xl">Paymaster Admin Flow</h2>
        </div>
        <div className="relative z-10">
          <Stepper 
            steps={steps} 
            currentStep={currentStep} 
            setStep={setCurrentStep} 
            completedSteps={completedSteps}
          />
        </div>
      </div>


      <div className="step-content-area">
        
        {/* STEP 1: Deploy / Connect */}
        {currentStep === 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in">
              {/* Deploy custom Paymaster */}
              <div className="glass-card flex flex-col gap-4">
                 <h4 className="text-lg font-bold text-gradient flex items-center gap-2"><PlayCircle /> 1.1 Deploy New Paymaster</h4>
                 <div className="space-y-4">
                   <div className="flex flex-col gap-1">
                      <label className="text-xs text-muted font-bold">EntryPoint Address</label>
                      <input type="text" className="input-field py-1.5 text-sm" value={dEntryPoint} onChange={e=>setDEntryPoint(e.target.value)} />
                   </div>
                   <div className="flex flex-col gap-1">
                      <label className="text-xs text-muted font-bold">USDC Token Address</label>
                      <input type="text" className="input-field py-1.5 text-sm" value={dToken} onChange={e=>setDToken(e.target.value)} />
                   </div>
                   <div className="flex flex-col gap-1">
                      <label className="text-xs text-muted font-bold">Price Feed (Chainlink) Address</label>
                      <input type="text" className="input-field py-1.5 text-sm" value={dPriceFeed} onChange={e=>setDPriceFeed(e.target.value)} />
                   </div>
    
                   <div className="pt-2 mt-auto">
                      <button 
                         className="btn btn-primary w-full" 
                         onClick={handleDeploy} 
                         disabled={deploying || !dEntryPoint || !dToken || !dPriceFeed || !!paymasterAddress}
                      >
                         {deploying ? "Deploying..." : "Deploy ERC20Paymaster"}
                      </button>
                   </div>
                 </div>
              </div>

              {/* Connect Existing */}
              <div className="glass-card flex flex-col gap-4">
                 <h4 className="text-lg font-bold text-gradient flex items-center gap-2"><Lock /> 1.2 Connect Existing</h4>
                 <div className="flex flex-col gap-1 mb-4">
                    <label className="text-xs text-muted font-bold">Paymaster Contract Address</label>
                    <input 
                      type="text" 
                      className="input-field py-1.5 text-sm" 
                      value={connectPmAddress} 
                      onChange={e=>setConnectPmAddress(e.target.value)} 
                      placeholder="0x..." 
                    />
                 </div>
                 <div className="mt-auto space-y-2">
                    <button 
                      className="btn btn-secondary w-full"
                      onClick={handleConnectPaymaster}
                      disabled={connecting || !connectPmAddress || !!paymasterAddress}
                    >
                      {connecting ? "Verifying..." : "Connect Paymaster"}
                    </button>
                    {paymasterAddress && (
                      <button className="btn btn-danger w-full text-xs" onClick={() => setPaymasterAddress("")}>
                        Change Paymaster
                      </button>
                    )}
                 </div>
              </div>
          </div>
        )}

        {/* STEP 2: Approve */}
        {currentStep === 2 && (
          <div className="glass-card max-w-2xl mx-auto animate-fade-in border-secondary/30">
            <h3 className="mb-2 flex items-center gap-2 text-secondary"><CheckCircle size={28} /> Step 2: Approve Paymaster</h3>
            <div className="bg-secondary/5 border border-secondary/10 p-4 rounded-lg mb-6">
               <p className="text-sm text-muted mb-0 flex gap-3">
                 <Info className="flex-shrink-0 text-secondary" />
                 <span>
                    <b>Why approval?</b> The Paymaster needs permission to take USDC from your wallet to pay for your Smart Account's transaction gas. 
                    This enables "gasless" transactions where you pay in USDC instead of ETH.
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
              <button className="btn btn-primary" onClick={handleApprovePaymaster} disabled={approving || !approveAmount}>
                {approving ? "Approving..." : "Approve from EOA"}
              </button>
            </div>

            <div className="mt-8 flex justify-end">
               <button className="btn btn-secondary text-sm" onClick={() => setCurrentStep(3)}>
                 Forward to Funding <ChevronRight size={16} />
               </button>
            </div>
          </div>
        )}

        {/* STEP 3: Fund */}
        {currentStep === 3 && (
          <div className="space-y-6 animate-fade-in">
             <div className="glass-card border-primary/30">
                <h3 className="mb-2 flex items-center gap-2 text-primary"><ArrowUpCircle size={28} /> Step 3: Fund & Stake Paymaster</h3>
                <div className="bg-primary/5 border border-primary/10 p-4 rounded-lg mb-6">
                   <p className="text-sm text-muted mb-0 flex gap-3">
                     <Info className="flex-shrink-0 text-primary" />
                     <span>
                        <b>Admin Only:</b> This section is essentially for the <b>owner</b> of the paymaster contract. 
                        The paymaster needs a "Deposit" in the EntryPoint to cover users' gas, and a "Stake" to build reputation among bundlers.
                     </span>
                   </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-3 p-4 bg-black/20 rounded-md border border-white/5">
                     <h4 className="text-sm text-gradient">Deposit Gas (ETH)</h4>
                     <p className="text-xs text-muted m-0">Stored in EntryPoint to pay bundlers.</p>
                     <input 
                        type="number" 
                        className="input-field py-1.5 text-sm" 
                        placeholder="Amount of ETH" 
                        value={depositAmount} 
                        onChange={e=>setDepositAmount(e.target.value)} 
                     />
                     <button className="btn btn-secondary text-sm" onClick={handleDeposit} disabled={funding || !depositAmount}>
                       Deposit ETH
                     </button>
                  </div>

                  <div className="flex flex-col gap-3 p-4 bg-black/20 rounded-md border border-white/5">
                     <h4 className="text-sm text-gradient">Add Stake (ETH)</h4>
                     <p className="text-xs text-muted m-0">Locked for bundler reputation.</p>
                     <div className="flex gap-2">
                       <input 
                          type="number" 
                          className="input-field py-1.5 text-sm w-1/2" 
                          placeholder="ETH Stake" 
                          value={stakeAmount} 
                          onChange={e=>setStakeAmount(e.target.value)} 
                       />
                       <input 
                          type="number" 
                          className="input-field py-1.5 text-sm w-1/2" 
                          placeholder="Delay (sec)" 
                          value={unstakeDelay} 
                          onChange={e=>setUnstakeDelay(e.target.value)} 
                       />
                     </div>
                     <button className="btn btn-secondary text-sm" onClick={handleStake} disabled={funding || !stakeAmount}>
                       Add Stake
                     </button>
                  </div>
                </div>
             </div>

             {/* Stats View */}
             <div className="glass-card bg-white/5 border-white/10">
               <h4 className="text-sm font-bold mb-4 uppercase tracking-tighter opacity-70">Current Paymaster Stats</h4>
               <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="stat-card">
                     <span className="text-xs text-muted">EP Deposit</span>
                     <span className="font-bold text-primary">{formatNum(pmDeposit, 18)} ETH</span>
                  </div>
                  <div className="stat-card">
                     <span className="text-xs text-muted">EP Stake</span>
                     <span className="font-bold text-primary">{formatNum(pmStake, 18)} ETH</span>
                  </div>
                  <div className="stat-card">
                     <span className="text-xs text-muted">PM Balance</span>
                     <span className="font-bold text-secondary">{formatNum(pmETHBalance, 18)} ETH</span>
                  </div>
                  <div className="stat-card">
                     <span className="text-xs text-muted">PM {pmTokenSymbol}</span>
                     <span className="font-bold text-secondary">{pmUSDCBalance}</span>
                  </div>
               </div>
             </div>

             {/* Danger Zone: Withdrawals */}
             <div className="glass-card border-red-500/20 bg-red-500/5">
                <h4 className="text-sm text-danger font-bold mb-4 flex items-center gap-2"><ShieldAlert size={16}/> Withdrawal Controls</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                   <div className="flex flex-col gap-2">
                     <label className="text-xs text-muted">Withdraw ETH to</label>
                     <input type="text" className="input-field py-1 text-xs" placeholder="0x..." value={wEthAddress} onChange={e=>setWEthAddress(e.target.value)} />
                     <div className="flex gap-2">
                        <input type="number" className="input-field py-1 text-xs w-full" placeholder="Amt" value={wEthAmount} onChange={e=>setWEthAmount(e.target.value)} />
                        <button className="btn btn-danger py-1 px-3 text-xs" onClick={handleWithdrawEth}>Run</button>
                     </div>
                   </div>
                   <div className="flex flex-col gap-2">
                     <label className="text-xs text-muted">Withdraw Fees (USDC) to</label>
                     <input type="text" className="input-field py-1 text-xs" placeholder="0x..." value={wUsdcAddress} onChange={e=>setWUsdcAddress(e.target.value)} />
                     <div className="flex gap-2">
                        <input type="number" className="input-field py-1 text-xs w-full" placeholder="Amt" value={wUsdcAmount} onChange={e=>setWUsdcAmount(e.target.value)} />
                        <button className="btn btn-danger py-1 px-3 text-xs" onClick={handleWithdrawUsdc}>Run</button>
                     </div>
                   </div>
                   <div className="flex flex-col gap-2">
                     <label className="text-xs text-muted">Unlock & Stake Action</label>
                     <button className="btn btn-secondary py-1 text-xs" onClick={handleUnlockStake}>Unlock Timer</button>
                     <div className="flex gap-2">
                        <input type="text" className="input-field py-1 text-xs w-full" placeholder="To" value={wStakeAddress} onChange={e=>setWStakeAddress(e.target.value)} />
                        <button className="btn btn-danger py-1 px-3 text-xs" onClick={handleWithdrawStake}>Unstake</button>
                     </div>
                   </div>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );

}
