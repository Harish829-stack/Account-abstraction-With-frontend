import React, { useState, useEffect } from 'react';
import { ethers, getAddress } from 'ethers';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { shortenAddress, formatNum } from '../utils/helpers';
import { SmartAccountFactoryABI, SmartAccountABI } from '../utils/abis';
import { PlusCircle, Link as LinkIcon, AlertTriangle, ArrowRight, Shield, Download, RotateCcw, Coins, Landmark, ChevronRight } from 'lucide-react';
import Stepper from '../components/Stepper';


export default function AccountSetupView() {
  const { 
    eoaAddress, 
    signer, 
    provider,
    smartAccountAddress, 
    setSmartAccountAddress,
    saETHBalance,
    saUSDCBalance,
    saEntryPointDeposit,
    saOwner,
    loadSmartAccountDetails,
    refreshAllData,
    env
  } = useAppContext();
  const toast = useToast();

  // Stepper State
  const [currentStep, setCurrentStep] = useState(1);
  const steps = ["Deploy / Connect", "Fund ETH", "Approve USDC", "EntryPoint"];

  // Option A State
  const [salt, setSalt] = useState('');
  const [predictedAddress, setPredictedAddress] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [predicting, setPredicting] = useState(false);

  // Option B State
  const [connectAddress, setConnectAddress] = useState('');
  const [connecting, setConnecting] = useState(false);

  // Actions State
  const [depositSAmount, setDepositSAmount] = useState('');
  const [pendingSDeposit, setPendingSDeposit] = useState(false);

  const [depositEPAmount, setDepositEPAmount] = useState('');
  const [pendingEPDeposit, setPendingEPDeposit] = useState(false);

  const [withdrawEPTo, setWithdrawEPTo] = useState('');
  const [withdrawEPAmount, setWithdrawEPAmount] = useState('');
  const [pendingEPWithdraw, setPendingEPWithdraw] = useState(false);

  const [newOwner, setNewOwner] = useState('');
  const [pendingOwnerXfer, setPendingOwnerXfer] = useState(false);

  const [approveAmount, setApproveAmount] = useState('1000');
  const [approving, setApproving] = useState(false);

  // UX: Double click to confirm transfer
  const [confirmTransfer, setConfirmTransfer] = useState(false);


  useEffect(() => {
    let active = true;
    const predictAddress = async () => {
      if (!salt || !eoaAddress || !provider) {
        if (active) setPredictedAddress('');
        return;
      }
      setPredicting(true);
      try {
        const factory = new ethers.Contract(env.FACTORY, SmartAccountFactoryABI, provider);
        const predicted = await factory.getFunction("getAddress")(eoaAddress, salt);
        if (active) setPredictedAddress(predicted);
      } catch (err) {
        console.error("Failed to predict:", err);
      } finally {
        if (active) setPredicting(false);
      }
    };
    
    // Add small debounce
    const timeout = setTimeout(predictAddress, 300);
    return () => { 
      active = false; 
      clearTimeout(timeout);
    };
  }, [salt, eoaAddress, provider, env.FACTORY]);

  const handleDeploy = async () => {
    if (!salt || !eoaAddress || !signer) return;
    setDeploying(true);
    try {
      const factory = new ethers.Contract(env.FACTORY, SmartAccountFactoryABI, signer);
      const tx = await factory.createAccount(eoaAddress, salt);
      await tx.wait();
      const deployedAddress = await factory.getFunction("getAddress")(eoaAddress, salt);
      setSmartAccountAddress(deployedAddress);
      toast.success("Smart Account deployed successfully!");
    } catch (err) {
      if (err.code === 4001) toast.error("Transaction rejected by user");
      else toast.error(err.reason || err.message || "Failed to deploy");
    } finally {
      setDeploying(false);
    }
  };

  const handleConnect = async () => {
    if (!connectAddress || !ethers.isAddress(connectAddress) || !provider) return;
    setConnecting(true);
    try {
      const code = await provider.getCode(connectAddress);
      if (code === '0x') {
        toast.error("No contract found at this address!");
      } else {
         setSmartAccountAddress(connectAddress);
         toast.success("Smart Account connected!");
         setConnectAddress('');
      }
    } catch (err) {
       toast.error("Error connecting: " + err.message);
    } finally {
       setConnecting(false);
    }
  };

  // Auto-redirect logic
  useEffect(() => {
    if (smartAccountAddress) {
       if (currentStep === 1) setCurrentStep(2);
    }
  }, [smartAccountAddress]);

  useEffect(() => {
    if (Number(saETHBalance) > 0 && currentStep === 2) {
      // Don't auto-redirect immediately, let user see they have balance
      // But we can hint it
    }
  }, [saETHBalance]);

  const disconnectSA = () => {
    setSmartAccountAddress(null);
    setCurrentStep(1);
  };


  // Action Handlers
  const handleDepositSA = async () => {
    if (!depositSAmount || !smartAccountAddress || !signer) return;
    setPendingSDeposit(true);
    try {
      const tx = await signer.sendTransaction({
        to: smartAccountAddress,
        value: ethers.parseEther(depositSAmount)
      });
      await tx.wait();
      setDepositSAmount('');
      await refreshAllData();
      toast.success("ETH deposited to Smart Account!");
    } catch (err) {
      if (err.code === 4001) toast.error("Transaction rejected by user");
      else toast.error(err.reason || err.message || "Failed to deposit");
    } finally {
      setPendingSDeposit(false);
    }
  };

  const handleDepositEP = async () => {
    if (!depositEPAmount || !smartAccountAddress || !signer) return;
    setPendingEPDeposit(true);
    try {
      const saContract = new ethers.Contract(smartAccountAddress, SmartAccountABI, signer);
      const tx = await saContract.addDeposit({ value: ethers.parseEther(depositEPAmount) });
      await tx.wait();
      setDepositEPAmount('');
      await refreshAllData();
      toast.success("ETH deposited to EntryPoint!");
    } catch (err) {
      if (err.code === 4001) toast.error("Transaction rejected by user");
       else toast.error(err.reason || err.message || "Failed to deposit to EntryPoint");
    } finally {
      setPendingEPDeposit(false);
    }
  };

  const handleWithdrawEP = async () => {
    if (!withdrawEPAmount || !withdrawEPTo || !smartAccountAddress || !signer) return;
    setPendingEPWithdraw(true);
    try {
      const saContract = new ethers.Contract(smartAccountAddress, SmartAccountABI, signer);
      const tx = await saContract.withdrawDepositTo(withdrawEPTo, ethers.parseEther(withdrawEPAmount));
      await tx.wait();
      setWithdrawEPAmount('');
      setWithdrawEPTo('');
      await refreshAllData();
      toast.success("Deposit successfully withdrawn from EntryPoint!");
    } catch (err) {
      if (err.code === 4001) toast.error("Transaction rejected by user");
       else toast.error(err.reason || err.message || "Failed to withdraw");
    } finally {
       setPendingEPWithdraw(false);
    }
  };

  const handleTransferOwnership = async () => {
    if (!newOwner || !ethers.isAddress(newOwner) || !smartAccountAddress || !signer) return;
    
    if (!confirmTransfer) {
      setConfirmTransfer(true);
      toast.info("Click again to confirm ownership transfer.");
      setTimeout(() => setConfirmTransfer(false), 5000); // Clear after 5s
      return;
    }

    setPendingOwnerXfer(true);
    try {
      const saContract = new ethers.Contract(smartAccountAddress, SmartAccountABI, signer);
      const tx = await saContract.changeOwner(newOwner);
      await tx.wait();
      setNewOwner('');
      setConfirmTransfer(false);
      await refreshAllData();
      toast.success("Ownership transferred successfully!");
    } catch (err) {
       if (err.code === 4001) toast.error("Transaction rejected by user");
       else toast.error(err.reason || err.message || "Failed to transfer ownership");
    } finally {
       setPendingOwnerXfer(false);
    }
  };

  const handleApproveUSDC = async () => {
    if (!smartAccountAddress || !approveAmount || !signer || !env.USDC_TOKEN) return;
    setApproving(true);
    try {
      const usdc = new ethers.Contract(env.USDC_TOKEN, ["function approve(address spender, uint256 amount) public returns (bool)"], signer);
      const tx = await usdc.approve(smartAccountAddress, ethers.parseUnits(approveAmount, 6));
      await tx.wait();
      await refreshAllData();
      toast.success("USDC approval successful!");
      setCurrentStep(4);
    } catch (err) {
      if (err.code === 4001) toast.error("Transaction rejected by user");
      else toast.error(err.reason || err.message || "Approval failed");
    } finally {
      setApproving(false);
    }
  };


  const completedSteps = [];
  if (smartAccountAddress) completedSteps.push(1);
  if (Number(saETHBalance) > 0) completedSteps.push(2);
  if (Number(saUSDCBalance) > 0) {
    // This is a proxy for "already has money", but approval is hard to check without custom hook
    // We'll just rely on user moving forward or manual check
  }
  if (Number(saEntryPointDeposit) > 0) completedSteps.push(4);

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-12">
      
      {/* Details Section (Shown under navbar if connected) */}
      {smartAccountAddress && (
        <div className="glass-card border border-primary/30 flex flex-col gap-4 mb-2 shadow-[0_0_40px_rgba(79,70,229,0.15)] relative overflow-hidden">
           <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
           {/* Header */}
           <div className="flex justify-between items-center bg-primary/10 p-4 rounded-xl border border-primary/20 z-10">
             <div className="flex items-center gap-3">
               <Shield className="text-primary" size={28} />
               <div>
                  <h3 className="text-xl font-bold m-0 leading-tight">Smart Account Active</h3>
                  <span className="text-sm text-primary/80 font-mono tracking-wide">{smartAccountAddress}</span>
               </div>
             </div>
             <div className="flex items-center gap-3">
               <button 
                 className="p-2 rounded-full bg-white/5 border border-white/10 shadow-sm hover:bg-white/10 hover:border-white/20 transition-all text-muted hover:text-white"
                 onClick={refreshAllData}
                 title="Refresh Smart Account data"
               >
                 <RotateCcw size={18} />
               </button>
               <button className="btn btn-secondary text-sm py-1.5 px-4" onClick={disconnectSA}>
                 Disconnect
               </button>
             </div>
           </div>
           
           {/* Stats Grid */}
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4 z-10">
             <div className="glass-stat-card group">
               <span className="text-xs text-muted uppercase tracking-wider font-semibold mb-1 block">ETH Balance</span>
               <span className="font-bold text-2xl text-gradient-primary">{formatNum(saETHBalance, 18)} <span className="text-sm font-normal text-muted">ETH</span></span>
             </div>
             <div className="glass-stat-card group">
               <span className="text-xs text-muted uppercase tracking-wider font-semibold mb-1 block">USDC Balance</span>
               <span className="font-bold text-2xl text-gradient-secondary truncate">{formatNum(saUSDCBalance, 6)} <span className="text-sm font-normal text-muted">USDC</span></span>
             </div>
             <div className="glass-stat-card group">
               <span className="text-xs text-muted uppercase tracking-wider font-semibold mb-1 block">EP Deposit</span>
               <span className="font-bold text-2xl text-gradient-primary">{formatNum(saEntryPointDeposit, 18)} <span className="text-sm font-normal text-muted">ETH</span></span>
             </div>
           </div>
        </div>
      )}

      {/* Top Navbar / Stepper View */}
      <div className="glass-card mb-4 relative overflow-hidden">
        <div className="flex justify-between items-center mb-8 relative z-10">
          <h2 className="m-0 text-gradient text-2xl">Account Setup Journey</h2>
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




      {/* Step Content */}
      <div className="step-content-area">
        
        {/* STEP 1: Deploy / Connect */}
        {currentStep === 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
            {/* Option A: Create */}
            <div className={`glass-card flex flex-col gap-4 ${smartAccountAddress ? 'opacity-50' : ''}`}>
              <h3 className="flex items-center gap-2 text-gradient"><PlusCircle size={20} /> 1. Deploy New Account</h3>
              <p className="text-sm text-muted">Create a brand new Smart Account. The address is deterministically generated based on your salt.</p>
              
              <div className="flex flex-col gap-1">
                <label className="text-sm text-muted">Owner (Your EOA)</label>
                <input type="text" className="input-field" disabled value={eoaAddress || ''} />
              </div>

              <div className="flex flex-col gap-1">
                 <label className="text-sm text-muted">Salt (Unique Number)</label>
                 <input 
                   type="number" 
                   className="input-field" 
                   placeholder="e.g. 88888" 
                   value={salt} 
                   onChange={(e) => setSalt(e.target.value)} 
                 />
              </div>

              <div className="flex items-center gap-2 mt-2">
                 <button 
                    className="btn btn-primary w-full" 
                    onClick={handleDeploy} 
                    disabled={deploying || !salt || !!smartAccountAddress}
                 >
                   {deploying ? "Deploying..." : "Deploy Smart Account"}
                 </button>
              </div>

              {predictedAddress && (
                 <div className="mt-2 p-3 bg-white/5 border border-white/10 rounded-md text-sm text-center">
                    Predicted: <span className="font-mono text-primary">{predictedAddress}</span>
                 </div>
              )}
            </div>

            {/* Option B: Connect */}
            <div className={`glass-card flex flex-col gap-4 ${smartAccountAddress ? 'opacity-50 border-secondary/50' : ''}`}>
              <h3 className="flex items-center gap-2 text-gradient"><LinkIcon size={20} /> 2. Connect Existing</h3>
              
              <div className="flex flex-col gap-1 flex-1">
                 <label className="text-sm text-muted">Smart Account Address</label>
                 <input 
                   type="text" 
                   className="input-field" 
                   placeholder="0x..." 
                   value={connectAddress} 
                   onChange={(e) => setConnectAddress(e.target.value)} 
                 />
                 <p className="text-xs text-muted mt-2">If you already deployed an account, paste it here.</p>
              </div>

              <div className="mt-auto pt-4 flex gap-2">
                 <button 
                    className="btn btn-secondary flex-1"
                    onClick={handleConnect}
                    disabled={connecting || !connectAddress || !!smartAccountAddress}
                 >
                   {connecting ? "Verifying..." : "Connect"}
                 </button>
                 {smartAccountAddress && (
                   <button className="btn btn-danger" onClick={disconnectSA}>
                     Disconnect
                   </button>
                 )}
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Fund ETH */}
        {currentStep === 2 && (
          <div className="glass-card max-w-2xl mx-auto animate-fade-in">
             <h3 className="flex items-center gap-2 text-gradient mb-2"><Coins size={24} /> Step 2: Fund Smart Account</h3>
             <p className="text-sm text-muted mb-6">
               Your Smart Account needs ETH to pay for gas fees (if not using a paymaster) or to send funds to others. 
               Current Balance: <b>{formatNum(saETHBalance, 18)} ETH</b>
             </p>

             <div className="flex flex-col gap-4 p-6 bg-white/5 rounded-xl border border-white/10">
                <div className="flex flex-col gap-1">
                  <label className="text-sm text-muted">Amount to Deposit (ETH)</label>
                  <div className="flex gap-2">
                    <input 
                        type="number" 
                        className="input-field flex-1" 
                        placeholder="0.01" 
                        value={depositSAmount}
                        onChange={(e) => setDepositSAmount(e.target.value)}
                    />
                    <button 
                      className="btn btn-primary"
                      onClick={handleDepositSA}
                      disabled={pendingSDeposit || !depositSAmount}
                    >
                      {pendingSDeposit ? "Depositing..." : "Deposit ETH"}
                    </button>
                  </div>
                </div>
                
                {Number(saETHBalance) > 0 && (
                  <div className="flex items-center justify-between mt-4 p-3 bg-secondary/10 border border-secondary/30 rounded-lg">
                    <span className="text-sm font-medium text-secondary">Balance detected! Safe to proceed.</span>
                    <button className="btn btn-secondary py-1 px-4 text-sm" onClick={() => setCurrentStep(3)}>
                      Next Step <ChevronRight size={16} />
                    </button>
                  </div>
                )}
             </div>
          </div>
        )}

        {/* STEP 3: Approve USDC */}
        {currentStep === 3 && (
          <div className="glass-card max-w-2xl mx-auto animate-fade-in">
             <h3 className="flex items-center gap-2 text-gradient mb-2"><Shield size={24} /> Step 3: Approve USDC Usage</h3>
             <p className="text-sm text-muted mb-6">
               In order for your Smart Account to manage and trade USDC from your wallet, you must grant it permission (approval).
             </p>

             <div className="flex flex-col gap-4 p-6 bg-white/5 rounded-xl border border-white/10">
                <div className="flex flex-col gap-1">
                  <label className="text-sm text-muted">Approval Limit (USDC)</label>
                  <div className="flex gap-2">
                    <input 
                        type="number" 
                        className="input-field flex-1" 
                        placeholder="1000" 
                        value={approveAmount}
                        onChange={(e) => setApproveAmount(e.target.value)}
                    />
                    <button 
                      className="btn btn-primary"
                      onClick={handleApproveUSDC}
                      disabled={approving || !approveAmount}
                    >
                      {approving ? "Approving..." : "Approve Smart Account"}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-muted text-center italic mt-2">
                  This transaction will be sent from your EOA wallet (MetaMask).
                </p>
             </div>
          </div>
        )}

        {/* STEP 4: EntryPoint Deposit */}
        {currentStep === 4 && (
          <div className="glass-card max-w-2xl mx-auto animate-fade-in">
             <h3 className="flex items-center gap-2 text-gradient mb-2"><Landmark size={24} /> Step 4: EntryPoint Deposit</h3>
             <p className="text-sm text-muted mb-6">
               If you don't want to use a Paymaster, you must deposit ETH into the EntryPoint for your Smart Account. 
               Current Deposit: <b>{formatNum(saEntryPointDeposit, 18)} ETH</b>
             </p>

             <div className="flex flex-col gap-6">
               <div className="p-6 bg-white/5 rounded-xl border border-white/10 space-y-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm text-muted">Amount to Deposit (ETH)</label>
                    <div className="flex gap-2">
                      <input 
                          type="number" 
                          className="input-field flex-1" 
                          placeholder="0.005" 
                          value={depositEPAmount}
                          onChange={(e) => setDepositEPAmount(e.target.value)}
                      />
                      <button 
                        className="btn btn-primary"
                        onClick={handleDepositEP}
                        disabled={pendingEPDeposit || !depositEPAmount}
                      >
                        {pendingEPDeposit ? "..." : "Deposit to EP"}
                      </button>
                    </div>
                  </div>
               </div>

               {/* Utils grid */}
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 border border-white/5 bg-white/20 rounded-lg">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted mb-3 flex items-center gap-2">
                      <Download size={14} /> Withdraw from EP
                    </h4>
                    <div className="space-y-2">
                      <input type="text" className="input-field py-1 text-xs" placeholder="To Address" value={withdrawEPTo} onChange={e=>setWithdrawEPTo(e.target.value)} />
                      <div className="flex gap-2">
                        <input type="number" className="input-field py-1 text-xs" placeholder="Amount" value={withdrawEPAmount} onChange={e=>setWithdrawEPAmount(e.target.value)} />
                        <button className="btn btn-secondary py-1 px-3 text-xs" onClick={handleWithdrawEP} disabled={pendingEPWithdraw || !withdrawEPAmount}>Go</button>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 border border-red-500/20 bg-red-500/5 rounded-lg">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-danger mb-3 flex items-center gap-2">
                      <AlertTriangle size={14} /> Ownership
                    </h4>
                      <div className="flex gap-2">
                        <input type="text" className="input-field py-1 text-xs" placeholder="New Owner Address" value={newOwner} onChange={e=>setNewOwner(e.target.value)} />
                        <button 
                          className={`btn ${confirmTransfer ? 'btn-primary animate-pulse' : 'btn-danger'} py-1 px-3 text-xs`} 
                          onClick={handleTransferOwnership} 
                          disabled={pendingOwnerXfer}
                        >
                          {pendingOwnerXfer ? 'Xfer...' : confirmTransfer ? 'Confirm?' : 'Xfer'}
                        </button>
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
