import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { shortenAddress, encodeERC7579Single, packUserOp, toHex } from '../utils/helpers';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { Shield, CheckCircle, UserPlus, PlayCircle, Settings, ChevronRight, XCircle, Trash2 } from 'lucide-react';
import { SmartAccountABI, IEntryPointABI, SocialRecoveryValidatorABI } from '../utils/abis';
import { estimateUserOperationGas, getDynamicGasFees } from '../utils/bundler';
import SessionKeyView from './SessionKeyView';

export default function ProfileView() {
  const { eoaAddress, smartAccountAddress, signer, provider, env, refreshAllData, refreshTrigger, setGlobalLoading, isAmoy } = useAppContext();
  const toast = useToast();

  // --- SOCIAL RECOVERY STATE ---
  const [showRecovery, setShowRecovery] = useState(false);
  const defaultValidator = isAmoy ? (import.meta.env.VITE_AMOY_SOCIAL_RECOVERY || "") : (import.meta.env.VITE_SEPOLIA_SOCIAL_RECOVERY || "");
  const [validatorAddr, setValidatorAddr] = useState(defaultValidator);

  useEffect(() => {
    setValidatorAddr(
      isAmoy
        ? (import.meta.env.VITE_AMOY_SOCIAL_RECOVERY || "")
        : (import.meta.env.VITE_SEPOLIA_SOCIAL_RECOVERY || "")
    );
  }, [isAmoy]);
  const [isRecoveryInstalled, setIsRecoveryInstalled] = useState(false);
  const [checkingRecovery, setCheckingRecovery] = useState(true);
  const [recoveryDetails, setRecoveryDetails] = useState(null);
  const [queryingRecovery, setQueryingRecovery] = useState(false);

  // Install State
  const [guardianOne, setGuardianOne] = useState("");
  const [guardianTwo, setGuardianTwo] = useState("");
  const [guardianThree, setGuardianThree] = useState("");
  const [threshold, setThreshold] = useState("2");
  const [isInstalling, setIsInstalling] = useState(false);

  // Installed Action State
  const [activeTab, setActiveTab] = useState('approve'); // 'approve' | 'revoke' | 'execute' | 'uninstall'
  
  // Shared Form State for actions
  const [targetSmartAccount, setTargetSmartAccount] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const [appStatus, setAppStatus] = useState("idle");
  const [isExecuting, setIsExecuting] = useState(false);

  const checkRecoveryModule = async () => {
      if (!smartAccountAddress || !provider || !validatorAddr) {
          setCheckingRecovery(false);
          return;
      }
      setCheckingRecovery(true);
      try {
          const account = new ethers.Contract(smartAccountAddress, SmartAccountABI, provider);
          const installed = await account.isModuleInstalled(1, validatorAddr, "0x");
          setIsRecoveryInstalled(installed);
          if (installed) {
              setTargetSmartAccount(smartAccountAddress); // default value
          }
      } catch (err) {
          console.error("Error checking recovery module:", err);
          setIsRecoveryInstalled(false);
      } finally {
          setCheckingRecovery(false);
      }
  };

  useEffect(() => {
    checkRecoveryModule();
  }, [smartAccountAddress, signer, refreshTrigger, validatorAddr]);


  // === SOCIAL RECOVERY ACTIONS ===

  const handleInstallRecovery = async () => {
    if (!smartAccountAddress || !signer) return;
    if (!validatorAddr || !guardianOne || !guardianTwo || !guardianThree) {
        toast.error("Please fill in validator and all 3 guardian addresses.");
        return;
    }
    setIsInstalling(true);
    setGlobalLoading(true, "Installing Recovery Module...");
    try {
      const initData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address[]", "uint16", "uint48"],
        [[guardianOne, guardianTwo, guardianThree], Number(threshold), 0]
      );
      const account = new ethers.Contract(smartAccountAddress, SmartAccountABI, signer);
      const { maxPriorityFeePerGas, maxFeePerGas } = await getDynamicGasFees(provider);
      const overrides = { maxPriorityFeePerGas, maxFeePerGas };
      const tx = await account.installModule(1, validatorAddr, initData, overrides);
      await tx.wait();
      
      toast.success("Social Recovery Module Installed Successfully!");
      await checkRecoveryModule();
    } catch (err) {
      console.error(err);
      toast.error(err.reason || err.message || "Failed to install module");
    } finally {
      setIsInstalling(false);
      setGlobalLoading(false);
    }
  };

  const queryRecoveryDetails = async () => {
      if (!smartAccountAddress || !provider || !validatorAddr) return;
      setQueryingRecovery(true);
      try {
          const recoveryValidator = new ethers.Contract(validatorAddr, SocialRecoveryValidatorABI, provider);
          
          const config = await recoveryValidator.recoveryConfigs(smartAccountAddress);
          if (config.threshold === 0n) {
              setRecoveryDetails(null);
              return;
          }

          const filter = recoveryValidator.filters.SocialRecoveryInstalled(smartAccountAddress);
          let events = [];
          try {
             events = await recoveryValidator.queryFilter(filter, -50000, "latest");
          } catch(e) {
             console.warn("Query from -50000 failed, trying from 0", e);
             events = await recoveryValidator.queryFilter(filter, 0, "latest");
          }
          
          let guardians = [];
          if (events.length > 0) {
              const latestEvent = events[events.length - 1];
              guardians = [...latestEvent.args.guardians];
          }

          setRecoveryDetails({
              threshold: Number(config.threshold),
              delay: Number(config.delay),
              guardianCount: Number(config.guardianCount),
              guardians: guardians
          });
      } catch (err) {
          console.error("Error querying recovery details:", err);
          toast.error("Failed to query recovery details");
      } finally {
          setQueryingRecovery(false);
      }
  };

  const handleUninstallRecovery = async () => {
    if (!smartAccountAddress || !signer || !validatorAddr) return;
    setGlobalLoading(true, "Uninstalling Module...");
    try {
        const account = new ethers.Contract(smartAccountAddress, SmartAccountABI, signer);
        
        // Pass the actual guardians to properly delete them from the mapping on-chain
        let guardiansToClear = [];
        if (recoveryDetails && recoveryDetails.guardians) {
            guardiansToClear = recoveryDetails.guardians;
        }

        const deInitData = ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [guardiansToClear]);
        const { maxPriorityFeePerGas, maxFeePerGas } = await getDynamicGasFees(provider);
        const overrides = { maxPriorityFeePerGas, maxFeePerGas };
        const tx = await account.uninstallModule(1, validatorAddr, deInitData, overrides);
        await tx.wait();
        toast.success("Module Uninstalled.");
        await checkRecoveryModule();
        setShowRecovery(false); // Close the view on success
    } catch (err) {
        toast.error("Uninstall failed: " + (err.reason || err.message));
    } finally {
        setGlobalLoading(false);
    }
  };

  const handleApproveRecovery = async () => {
    if (!targetSmartAccount || !newOwner || !signer) {
        toast.error("Please enter the Smart Account and New Owner addresses.");
        return;
    }
    setAppStatus("loading");
    setGlobalLoading(true, "Approving Recovery...");
    try {
        const recoveryValidator = new ethers.Contract(validatorAddr, SocialRecoveryValidatorABI, signer);
        
        const hasApproved = await recoveryValidator.hasApproved(targetSmartAccount, newOwner, eoaAddress);
        if (hasApproved) {
            toast.success("You have already approved this recovery request.");
            setAppStatus("done");
            return;
        }

        const { maxPriorityFeePerGas, maxFeePerGas } = await getDynamicGasFees(provider);
        const overrides = { maxPriorityFeePerGas, maxFeePerGas };
        const tx = await recoveryValidator.approveRecovery(targetSmartAccount, newOwner, overrides);
        await tx.wait();
        toast.success(`Approval successful!`);
        setAppStatus("done");
    } catch (err) {
        console.error(err);
        toast.error("Approval failed: " + (err.reason || err.message));
        setAppStatus("idle");
    } finally {
        setGlobalLoading(false);
    }
  };

  const handleRevokeRecovery = async () => {
    if (!targetSmartAccount || !newOwner || !signer) {
        toast.error("Please enter the Smart Account and New Owner addresses.");
        return;
    }
    setAppStatus("loading");
    setGlobalLoading(true, "Revoking Recovery...");
    try {
        const recoveryValidator = new ethers.Contract(validatorAddr, SocialRecoveryValidatorABI, signer);
        const { maxPriorityFeePerGas, maxFeePerGas } = await getDynamicGasFees(provider);
        const overrides = { maxPriorityFeePerGas, maxFeePerGas };
        const tx = await recoveryValidator.revokeRecovery(targetSmartAccount, newOwner, overrides);
        await tx.wait();
        toast.success(`Revoked successfully!`);
        setAppStatus("idle");
    } catch (err) {
        console.error(err);
        toast.error("Revoke failed: " + (err.reason || err.message));
        setAppStatus("idle");
    } finally {
        setGlobalLoading(false);
    }
  };

  const handleExecuteRecovery = async () => {
      if (!targetSmartAccount || !newOwner || !signer) return;
      setIsExecuting(true);
      setGlobalLoading(true, "Executing Recovery...");
      try {
          const recoveryValidator = new ethers.Contract(validatorAddr, SocialRecoveryValidatorABI, provider);
          const canRecover = await recoveryValidator.canRecover(targetSmartAccount, newOwner);
          if (!canRecover) {
              throw new Error("Cannot recover yet. Threshold not met or delay hasn't passed.");
          }

          const account = new ethers.Contract(targetSmartAccount, SmartAccountABI, provider);
          const callData = account.interface.encodeFunctionData("changeOwner", [newOwner]);
          const signature = ethers.concat([
              validatorAddr,
              ethers.AbiCoder.defaultAbiCoder().encode(["address"], [newOwner])
          ]);

          const entryPoint = new ethers.Contract(env.ENTRY_POINT, IEntryPointABI, signer);
          const nonce = await entryPoint.getNonce(targetSmartAccount, 0);

          const { maxPriorityFeePerGas, maxFeePerGas } = await getDynamicGasFees(provider);

          const userOp = {
              sender: targetSmartAccount,
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
              signature: signature
          };

          try {
             const est = await estimateUserOperationGas(userOp);
             userOp.callGasLimit = toHex(est.callGasLimit);
             userOp.verificationGasLimit = toHex(est.verificationGasLimit);
             userOp.preVerificationGas = toHex(est.preVerificationGas);
          } catch(e) {
             console.warn("Bundler estimation failed, using fallback limits", e);
             userOp.callGasLimit = toHex(100000);
             userOp.verificationGasLimit = toHex(150000);
             userOp.preVerificationGas = toHex(50000);
          }

          const packedOp = packUserOp(userOp);

          try {
              await entryPoint.getFunction("handleOps").staticCall([packedOp], await signer.getAddress());
          } catch(simErr) {
              if (simErr.data) {
                 try {
                     const decoded = entryPoint.interface.parseError(simErr.data);
                     throw new Error(`Simulation Failed: ${decoded?.name}`);
                 } catch(e) {}
              }
              throw simErr;
          }

          const tx = await entryPoint.handleOps([packedOp], await signer.getAddress());
          await tx.wait();
          
          toast.success("Recovery Executed Successfully!");
          await refreshAllData();
          setNewOwner("");
          setAppStatus("idle");
      } catch (err) {
          console.error(err);
          toast.error(err.message || "Failed to execute recovery");
      } finally {
          setIsExecuting(false);
          setGlobalLoading(false);
      }
  };


  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto pb-12 animate-fade-in">
        
        {/* Main Entry Button */}
        {!showRecovery && (
            <button 
                className="glass-card flex items-center justify-between hover:bg-white/5 transition-all cursor-pointer group border border-emerald-500/20 shadow-xl hover:shadow-[0_0_40px_rgba(16,185,129,0.15)] bg-gradient-to-r from-black/60 to-emerald-950/20"
                onClick={() => setShowRecovery(true)}
            >
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400 group-hover:bg-emerald-500/20 group-hover:scale-110 transition-all border border-emerald-500/10">
                        <Shield size={32} />
                    </div>
                    <div className="text-left">
                        <h2 className="text-xl font-bold m-0 text-slate-100 group-hover:text-emerald-400 transition-colors">Social Recovery</h2>
                        <p className="text-sm text-slate-400 m-0 group-hover:text-slate-300">Manage guardians, approve recovery, or rescue an account.</p>
                    </div>
                </div>
                <ChevronRight className="text-slate-500 group-hover:text-emerald-400 transition-colors" size={24} />
            </button>
        )}

        {/* Expanded Recovery View */}
        {showRecovery && (
            <div className="glass-card border border-emerald-500/30 flex flex-col gap-6 shadow-[0_0_50px_rgba(16,185,129,0.1)] relative overflow-hidden animate-slide-up bg-gradient-to-b from-black/80 to-slate-900/90">
                <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-500/10 rounded-full blur-[80px] -mr-20 -mt-20 pointer-events-none"></div>
                
                {/* Header */}
                <div className="flex items-center justify-between z-10 border-b border-emerald-500/20 pb-4">
                    <div className="flex items-center gap-3">
                        <Shield className="text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]" size={28} />
                        <div>
                            <h2 className="text-xl font-bold m-0 bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent drop-shadow-sm">Social Recovery</h2>
                            <p className="text-sm text-emerald-400/70 m-0 font-medium">
                                {checkingRecovery ? "Checking status..." : (isRecoveryInstalled ? "Module Active" : "Module Not Installed")}
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={() => setShowRecovery(false)}
                        className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-all"
                    >
                        <XCircle size={20} />
                    </button>
                </div>

                {/* CONTENT: Always show Sub-Navbar & Action Forms */}
                {!checkingRecovery && (
                    <div className="z-10 animate-fade-in flex flex-col gap-5">
                        
                        {/* Sub Navbar */}
                        <div className="flex bg-black/60 rounded-lg border border-emerald-500/20 p-1.5 gap-1.5 overflow-x-auto no-scrollbar shadow-[inset_0_0_20px_rgba(16,185,129,0.05)]">
                            <button 
                                className={`px-4 py-2 text-sm font-bold rounded-md whitespace-nowrap transition-all flex items-center gap-2 ${activeTab === 'setup' ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-black shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'text-emerald-500/70 hover:text-emerald-400 hover:bg-emerald-500/10'}`}
                                onClick={() => setActiveTab('setup')}
                            >
                                <Settings size={15} /> Setup
                            </button>
                            <button 
                                className={`px-4 py-2 text-sm font-bold rounded-md whitespace-nowrap transition-all flex items-center gap-2 ${activeTab === 'query' ? 'bg-gradient-to-r from-indigo-500 to-blue-400 text-black shadow-[0_0_15px_rgba(99,102,241,0.4)]' : 'text-emerald-500/70 hover:text-emerald-400 hover:bg-emerald-500/10'}`}
                                onClick={() => { setActiveTab('query'); queryRecoveryDetails(); }}
                            >
                                <Settings size={15} /> Query Details
                            </button>
                            <button 
                                className={`px-4 py-2 text-sm font-bold rounded-md whitespace-nowrap transition-all flex items-center gap-2 ${activeTab === 'approve' ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-black shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'text-emerald-500/70 hover:text-emerald-400 hover:bg-emerald-500/10'}`}
                                onClick={() => setActiveTab('approve')}
                            >
                                <CheckCircle size={15} /> Approve
                            </button>
                            <button 
                                className={`px-4 py-2 text-sm font-bold rounded-md whitespace-nowrap transition-all flex items-center gap-2 ${activeTab === 'revoke' ? 'bg-gradient-to-r from-orange-500 to-amber-400 text-black shadow-[0_0_15px_rgba(249,115,22,0.4)]' : 'text-emerald-500/70 hover:text-emerald-400 hover:bg-emerald-500/10'}`}
                                onClick={() => setActiveTab('revoke')}
                            >
                                <XCircle size={15} /> Revoke
                            </button>
                            <button 
                                className={`px-4 py-2 text-sm font-bold rounded-md whitespace-nowrap transition-all flex items-center gap-2 ${activeTab === 'execute' ? 'bg-gradient-to-r from-teal-500 to-cyan-400 text-black shadow-[0_0_15px_rgba(20,184,166,0.4)]' : 'text-emerald-500/70 hover:text-emerald-400 hover:bg-emerald-500/10'}`}
                                onClick={() => setActiveTab('execute')}
                            >
                                <PlayCircle size={15} /> Execute
                            </button>
                        </div>

                        {/* Forms Container */}
                        <div className="p-6 bg-black/40 rounded-xl border border-emerald-500/10 mt-1 min-h-[240px] shadow-[inset_0_0_30px_rgba(16,185,129,0.02)]">
                            
                            {/* SETUP TAB */}
                            {activeTab === 'setup' && (
                                <div className="flex flex-col gap-5 animate-fade-in">
                                    {!isRecoveryInstalled ? (
                                        <>
                                            <div>
                                                <h3 className="text-lg font-bold text-emerald-400 drop-shadow-sm">Setup & Install Module</h3>
                                                <p className="text-xs text-emerald-100/50 mt-1">Configure guardians to protect your smart account.</p>
                                            </div>
                                            <div className="flex flex-col gap-4">
                                                <div>
                                                    <label className="text-xs text-slate-400 mb-1 block">Validator Address</label>
                                                    <input type="text" className="input-field bg-slate-900/50 border-emerald-500/20 text-slate-200 text-sm focus:border-emerald-500" value={validatorAddr} onChange={(e) => setValidatorAddr(e.target.value)} />
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                    <div>
                                                        <label className="text-xs text-slate-400 mb-1 block">Guardian 1 Address</label>
                                                        <input type="text" className="input-field bg-slate-900/50 border-emerald-500/20 text-slate-200 text-sm focus:border-emerald-500" placeholder="0x..." value={guardianOne} onChange={(e) => setGuardianOne(e.target.value)} />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs text-slate-400 mb-1 block">Guardian 2 Address</label>
                                                        <input type="text" className="input-field bg-slate-900/50 border-emerald-500/20 text-slate-200 text-sm focus:border-emerald-500" placeholder="0x..." value={guardianTwo} onChange={(e) => setGuardianTwo(e.target.value)} />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs text-slate-400 mb-1 block">Guardian 3 Address</label>
                                                        <input type="text" className="input-field bg-slate-900/50 border-emerald-500/20 text-slate-200 text-sm focus:border-emerald-500" placeholder="0x..." value={guardianThree} onChange={(e) => setGuardianThree(e.target.value)} />
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="text-xs text-slate-400 mb-1 block">Threshold</label>
                                                    <input type="number" className="input-field bg-slate-900/50 border-emerald-500/20 text-slate-200 text-sm focus:border-emerald-500" value={threshold} onChange={(e) => setThreshold(e.target.value)} min="1" max="3" disabled />
                                                    <p className="text-xs text-emerald-500/60 mt-1">Threshold is fixed at 2 for this setup.</p>
                                                </div>
                                            </div>
                                            <button 
                                                className="w-full mt-2 py-3 rounded-lg font-bold text-black bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border-none"
                                                onClick={handleInstallRecovery}
                                                disabled={isInstalling || !smartAccountAddress}
                                            >
                                                <UserPlus size={18} /> {isInstalling ? "Installing..." : "Install Recovery Module"}
                                            </button>
                                        </>
                                    ) : (
                                        <div className="text-center p-6 bg-emerald-950/20 border border-emerald-500/20 rounded-xl">
                                            <CheckCircle className="text-emerald-400 mx-auto mb-3" size={32} />
                                            <h3 className="text-emerald-300 font-bold">Module is Installed</h3>
                                            <p className="text-emerald-400/60 text-sm mt-2">Go to the "Query Details" tab to view your guardians or uninstall the module.</p>
                                            <button 
                                                className="mt-4 px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-md text-sm font-bold hover:bg-emerald-500/30 transition-all"
                                                onClick={() => { setActiveTab('query'); queryRecoveryDetails(); }}
                                            >
                                                View Details
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* QUERY TAB */}
                            {activeTab === 'query' && (
                                <div className="flex flex-col gap-4 animate-fade-in">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="text-lg font-bold text-indigo-400 drop-shadow-sm">Social Recovery Configuration</h3>
                                            <p className="text-xs text-indigo-100/50 mt-1">View your current threshold and guardians.</p>
                                        </div>
                                        <button 
                                            onClick={queryRecoveryDetails}
                                            disabled={queryingRecovery}
                                            className="px-3 py-1.5 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-md text-xs font-bold hover:bg-indigo-500/30 transition-all disabled:opacity-50"
                                        >
                                            {queryingRecovery ? "Querying..." : "Refresh"}
                                        </button>
                                    </div>
                                    
                                    {!recoveryDetails && !queryingRecovery && (
                                        <div className="text-center p-6 bg-white/5 rounded-xl border border-white/10 text-slate-400 text-sm">
                                            No active social recovery configuration found.
                                        </div>
                                    )}

                                    {recoveryDetails && (
                                        <>
                                            <div className="grid grid-cols-3 gap-4 mb-2">
                                                <div className="p-4 bg-indigo-950/20 border border-indigo-500/30 rounded-xl text-center">
                                                    <div className="text-2xl font-bold text-indigo-300">{recoveryDetails.guardianCount}</div>
                                                    <div className="text-xs text-indigo-400/70">Guardians</div>
                                                </div>
                                                <div className="p-4 bg-indigo-950/20 border border-indigo-500/30 rounded-xl text-center">
                                                    <div className="text-2xl font-bold text-indigo-300">{recoveryDetails.threshold}</div>
                                                    <div className="text-xs text-indigo-400/70">Threshold</div>
                                                </div>
                                                <div className="p-4 bg-indigo-950/20 border border-indigo-500/30 rounded-xl text-center">
                                                    <div className="text-2xl font-bold text-indigo-300">{recoveryDetails.delay}s</div>
                                                    <div className="text-xs text-indigo-400/70">Execution Delay</div>
                                                </div>
                                            </div>

                                            {recoveryDetails.guardians.length > 0 && (
                                                <div className="bg-black/40 rounded-xl border border-white/5 overflow-hidden">
                                                    <div className="px-4 py-2 bg-white/5 text-xs font-bold text-slate-400 border-b border-white/5">
                                                        Registered Guardians
                                                    </div>
                                                    {recoveryDetails.guardians.map((g, i) => (
                                                        <div key={i} className="px-4 py-3 border-b border-white/5 last:border-0 text-sm font-mono text-slate-200">
                                                            {g}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            <div className="mt-4 p-4 bg-red-950/20 border border-red-500/20 rounded-xl">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <h4 className="text-sm font-bold text-red-400">Uninstall Module</h4>
                                                        <p className="text-xs text-red-400/70 mt-1">Completely disable social recovery for this account.</p>
                                                    </div>
                                                    <button 
                                                        onClick={handleUninstallRecovery}
                                                        className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 font-bold rounded-lg border border-red-500/50 transition-all text-sm"
                                                    >
                                                        Uninstall Now
                                                    </button>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* APPROVE TAB */}
                            {activeTab === 'approve' && (
                                <div className="flex flex-col gap-5 animate-fade-in">
                                    <div>
                                        <h3 className="text-lg font-bold text-emerald-400 drop-shadow-sm">Approve Recovery</h3>
                                        <p className="text-xs text-emerald-100/50 mt-1">Approve a recovery request for a smart account.</p>
                                    </div>
                                    <div className="grid gap-4">
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">Target Smart Account</label>
                                            <input type="text" className="input-field bg-slate-900/50 border-slate-700 text-slate-200 text-sm" placeholder="Address to recover..." value={targetSmartAccount} onChange={(e) => setTargetSmartAccount(e.target.value)} />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">New Owner Address</label>
                                            <input type="text" className="input-field bg-slate-900/50 border-slate-700 text-slate-200 text-sm" placeholder="The new owner..." value={newOwner} onChange={(e) => setNewOwner(e.target.value)} />
                                        </div>
                                    </div>
                                    <button 
                                        className="w-full py-3.5 rounded-lg font-bold text-black bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all mt-2 border-none"
                                        onClick={handleApproveRecovery}
                                    >
                                        Approve Recovery
                                    </button>
                                </div>
                            )}

                            {/* REVOKE TAB */}
                            {activeTab === 'revoke' && (
                                <div className="flex flex-col gap-5 animate-fade-in">
                                    <div>
                                        <h3 className="text-lg font-bold text-orange-400 drop-shadow-sm">Revoke Approval</h3>
                                        <p className="text-xs text-orange-100/50 mt-1">Cancel your previous approval for a recovery request.</p>
                                    </div>
                                    <div className="grid gap-4">
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">Target Smart Account</label>
                                            <input type="text" className="input-field bg-slate-900/50 border-slate-700 text-slate-200 text-sm" placeholder="Address to recover..." value={targetSmartAccount} onChange={(e) => setTargetSmartAccount(e.target.value)} />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">New Owner Address</label>
                                            <input type="text" className="input-field bg-slate-900/50 border-slate-700 text-slate-200 text-sm" placeholder="The new owner..." value={newOwner} onChange={(e) => setNewOwner(e.target.value)} />
                                        </div>
                                    </div>
                                    <button 
                                        className="w-full py-3.5 rounded-lg font-bold text-black bg-gradient-to-r from-orange-500 to-amber-400 hover:from-orange-400 hover:to-amber-300 shadow-[0_0_20px_rgba(249,115,22,0.3)] transition-all mt-2 border-none"
                                        onClick={handleRevokeRecovery}
                                    >
                                        Revoke Approval
                                    </button>
                                </div>
                            )}

                            {/* EXECUTE TAB */}
                            {activeTab === 'execute' && (
                                <div className="flex flex-col gap-5 animate-fade-in">
                                    <div>
                                        <h3 className="text-lg font-bold text-teal-400 drop-shadow-sm">Execute Recovery</h3>
                                        <p className="text-xs text-teal-100/50 mt-1">Finalize the recovery process once the threshold is met.</p>
                                    </div>
                                    <div className="grid gap-4">
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">Target Smart Account</label>
                                            <input type="text" className="input-field bg-slate-900/50 border-slate-700 text-slate-200 text-sm" placeholder="Address to recover..." value={targetSmartAccount} onChange={(e) => setTargetSmartAccount(e.target.value)} />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">New Owner Address</label>
                                            <input type="text" className="input-field bg-slate-900/50 border-slate-700 text-slate-200 text-sm" placeholder="The new owner..." value={newOwner} onChange={(e) => setNewOwner(e.target.value)} />
                                        </div>
                                    </div>
                                    <button 
                                        className="w-full py-3.5 rounded-lg font-bold text-black bg-gradient-to-r from-teal-500 to-cyan-400 hover:from-teal-400 hover:to-cyan-300 shadow-[0_0_20px_rgba(20,184,166,0.3)] transition-all mt-2 border-none disabled:opacity-50 disabled:cursor-not-allowed"
                                        onClick={handleExecuteRecovery}
                                        disabled={isExecuting}
                                    >
                                        {isExecuting ? "Executing..." : "Execute On-Chain"}
                                    </button>
                                </div>
                            )}


                        </div>
                    </div>
                )}
            </div>
        )}

        <SessionKeyView />
    </div>
  );
}
