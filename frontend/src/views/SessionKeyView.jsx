import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { shortenAddress, packUserOp, encodeERC7579Single, toHex } from '../utils/helpers';
import { sendUserOperation, estimateUserOperationGas } from '../utils/bundler';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { Key, PlusCircle, Zap, Settings, ChevronRight, XCircle } from 'lucide-react';
import { SmartAccountABI, IEntryPointABI, SessionKeyValidatorABI } from '../utils/abis';

export default function SessionKeyView() {
  const { eoaAddress, smartAccountAddress, signer, provider, env, setGlobalLoading } = useAppContext();
  const toast = useToast();

  const [showSessionKeys, setShowSessionKeys] = useState(false);
  const [validatorAddr, setValidatorAddr] = useState("0xDb7D3A988EAb49957e4478138dD14bC9900BC4cC");
  const [isSkInstalled, setIsSkInstalled] = useState(false);
  const [checkingSk, setCheckingSk] = useState(true);

  // Form State
  const [burnerKey, setBurnerKey] = useState("");
  const [targetAddr, setTargetAddr] = useState(ethers.ZeroAddress);
  const [selector, setSelector] = useState("0x00000000");
  const [maxValue, setMaxValue] = useState("0.1");
  const [validForMinutes, setValidForMinutes] = useState("60");
  const [remainingUses, setRemainingUses] = useState("10");
  
  // Execution Form State
  const [execTarget, setExecTarget] = useState("");
  const [execValue, setExecValue] = useState("0");
  const [execData, setExecData] = useState("0x");

  const [activeTab, setActiveTab] = useState('setup');

  useEffect(() => {
    // Attempt to load burner key from local storage
    const storedKey = localStorage.getItem("session_burner_key");
    if (storedKey) {
        setBurnerKey(storedKey);
    }
  }, []);

  const checkSkModule = async () => {
      if (!smartAccountAddress || !provider || !validatorAddr) {
          setCheckingSk(false);
          return;
      }
      setCheckingSk(true);
      try {
          const account = new ethers.Contract(smartAccountAddress, SmartAccountABI, provider);
          const installed = await account.isModuleInstalled(1, validatorAddr, "0x");
          setIsSkInstalled(installed);
      } catch (err) {
          setIsSkInstalled(false);
      } finally {
          setCheckingSk(false);
      }
  };

  useEffect(() => {
    checkSkModule();
  }, [smartAccountAddress, signer, validatorAddr]);

  const generateKey = () => {
      const wallet = ethers.Wallet.createRandom();
      setBurnerKey(wallet.privateKey);
      localStorage.setItem("session_burner_key", wallet.privateKey);
      toast.success("New Burner Key generated and saved to Local Storage!");
  };

  const handleInstallAndAddKey = async () => {
    if (!smartAccountAddress || !signer || !validatorAddr || !burnerKey) {
        toast.error("Please fill in Validator Address and generate a Burner Key.");
        return;
    }
    
    setGlobalLoading(true, "Adding Session Key...");
    try {
      const burnerWallet = new ethers.Wallet(burnerKey);
      const sessionKeyAddr = burnerWallet.address;
      
      const parsedValue = ethers.parseEther(maxValue || "0");
      const validUntilTimestamp = Math.floor(Date.now() / 1000) + (Number(validForMinutes) * 60);
      
      const keyData = [
          sessionKeyAddr,
          targetAddr || ethers.ZeroAddress,
          selector || "0x00000000",
          parsedValue,
          0, // validAfter
          validUntilTimestamp,
          Number(remainingUses)
      ];

      const account = new ethers.Contract(smartAccountAddress, SmartAccountABI, signer);
      
      if (!isSkInstalled) {
          // Install module with the key data
          const initData = ethers.AbiCoder.defaultAbiCoder().encode(
              ["tuple(address,address,bytes4,uint256,uint48,uint48,uint48)[]"],
              [[keyData]]
          );
          const tx = await account.installModule(1, validatorAddr, initData);
          await tx.wait();
          toast.success("Module Installed & Session Key Added!");
          await checkSkModule();
      } else {
          // Module already installed, just add the key using execute
          const skValidator = new ethers.Contract(validatorAddr, SessionKeyValidatorABI, signer);
          const innerCall = skValidator.interface.encodeFunctionData("addSessionKey", [keyData]);
          const mode = "0x0100000000000000000000000000000000000000000000000000000000000000";
          const execData = ethers.solidityPacked(["address", "uint256", "bytes"], [validatorAddr, 0, innerCall]);
          const tx = await account["execute(bytes32,bytes)"](mode, execData);
          await tx.wait();
          toast.success("Session Key Added successfully!");
      }
    } catch (err) {
      console.error(err);
      toast.error(err.reason || err.message || "Failed to add session key");
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleExecuteSession = async () => {
      if (!smartAccountAddress || !burnerKey || !validatorAddr) {
          toast.error("Missing configuration");
          return;
      }
      setGlobalLoading(true, "Executing via Session Key...");
      try {
          const burnerWallet = new ethers.Wallet(burnerKey, provider);
          const entryPoint = new ethers.Contract(env.ENTRY_POINT, IEntryPointABI, provider);
          const account = new ethers.Contract(smartAccountAddress, SmartAccountABI, provider);

          const target = execTarget || targetAddr || smartAccountAddress;
          const value = ethers.parseEther(execValue || "0");
          const data = execData || "0x";
          
          const callData = account.interface.encodeFunctionData("execute(address,uint256,bytes)", [target, value, data]);

          const feeData = await provider.getFeeData();
          const verificationGasLimit = 250000n;
          const callGasLimit = 100000n;
          const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || 1500000000n;
          const maxFeePerGas = feeData.maxFeePerGas || (feeData.gasPrice ? feeData.gasPrice * 2n : 10000000000n);

          const nonce = await entryPoint.getNonce(smartAccountAddress, 0);

          const rpcUserOp = {
              sender: smartAccountAddress,
              nonce: toHex(nonce),
              factory: "0x",
              factoryData: "0x",
              callData: callData,
              callGasLimit: toHex(100000),
              verificationGasLimit: toHex(250000),
              preVerificationGas: toHex(50000),
              maxFeePerGas: toHex(maxFeePerGas),
              maxPriorityFeePerGas: toHex(maxPriorityFeePerGas),
              paymaster: "0x",
              paymasterVerificationGasLimit: "0x",
              paymasterPostOpGasLimit: "0x",
              paymasterData: "0x",
              signature: "0x" // Placeholder
          };

          try {
            const est = await estimateUserOperationGas(rpcUserOp);
            rpcUserOp.callGasLimit = toHex(est.callGasLimit);
            rpcUserOp.verificationGasLimit = toHex(est.verificationGasLimit);
            rpcUserOp.preVerificationGas = toHex(est.preVerificationGas);
          } catch (err) {
            console.warn("SessionKey estimation failed, using fallback:", err);
          }

          const packedOp = packUserOp(rpcUserOp);
          const userOpHash = await entryPoint.getUserOpHash(packedOp);
          
          // Sign the hash with the burner wallet
          const rawSignature = await burnerWallet.signMessage(ethers.getBytes(userOpHash));
          
          // Pack the signature: Validator (20) + SessionKey (20) + ECDSA (65)
          const packedSignature = ethers.concat([
              validatorAddr,
              burnerWallet.address,
              rawSignature
          ]);
          
          rpcUserOp.signature = ethers.hexlify(packedSignature);

          const opHash = await sendUserOperation(rpcUserOp);

          toast.success(`Bundler executing! OpHash: ${shortenAddress(opHash)}...`);
      } catch (err) {
          console.error(err);
          toast.error(err.reason || err.message || "Execution failed");
      } finally {
          setGlobalLoading(false);
      }
  };

  return (
    <div className="flex flex-col gap-6 w-full animate-fade-in mt-6">
        {!showSessionKeys && (
            <button 
                className="glass-card flex items-center justify-between hover:bg-white/5 transition-all cursor-pointer group border border-amber-500/20 shadow-xl hover:shadow-[0_0_40px_rgba(245,158,11,0.15)] bg-gradient-to-r from-black/60 to-amber-950/20"
                onClick={() => setShowSessionKeys(true)}
            >
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-amber-500/10 rounded-xl text-amber-400 group-hover:bg-amber-500/20 group-hover:scale-110 transition-all border border-amber-500/10">
                        <Key size={32} />
                    </div>
                    <div className="text-left">
                        <h2 className="text-xl font-bold m-0 text-slate-100 group-hover:text-amber-400 transition-colors">Session Keys</h2>
                        <p className="text-sm text-slate-400 m-0 group-hover:text-slate-300">Create burner keys with restricted permissions for seamless UX.</p>
                    </div>
                </div>
                <ChevronRight className="text-slate-500 group-hover:text-amber-400 transition-colors" size={24} />
            </button>
        )}

        {showSessionKeys && (
            <div className="glass-card border border-amber-500/30 flex flex-col gap-6 shadow-[0_0_50px_rgba(245,158,11,0.1)] relative overflow-hidden animate-slide-up bg-gradient-to-b from-black/80 to-slate-900/90">
                <div className="absolute top-0 right-0 w-72 h-72 bg-amber-500/10 rounded-full blur-[80px] -mr-20 -mt-20 pointer-events-none"></div>
                
                <div className="flex items-center justify-between z-10 border-b border-amber-500/20 pb-4">
                    <div className="flex items-center gap-3">
                        <Key className="text-amber-400 drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]" size={28} />
                        <div>
                            <h2 className="text-xl font-bold m-0 bg-gradient-to-r from-amber-400 to-yellow-300 bg-clip-text text-transparent drop-shadow-sm">Session Keys</h2>
                            <p className="text-sm text-amber-400/70 m-0 font-medium">
                                {checkingSk ? "Checking status..." : (isSkInstalled ? "Module Active" : "Module Not Installed")}
                            </p>
                        </div>
                    </div>
                    <button onClick={() => setShowSessionKeys(false)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-all">
                        <XCircle size={20} />
                    </button>
                </div>

                {!checkingSk && (
                    <div className="z-10 animate-fade-in flex flex-col gap-5">
                        <div className="flex bg-black/60 rounded-lg border border-amber-500/20 p-1.5 gap-1.5 overflow-x-auto no-scrollbar">
                            <button 
                                className={`px-4 py-2 text-sm font-bold rounded-md whitespace-nowrap transition-all flex items-center gap-2 ${activeTab === 'setup' ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-black shadow-[0_0_15px_rgba(245,158,11,0.4)]' : 'text-amber-500/70 hover:text-amber-400 hover:bg-amber-500/10'}`}
                                onClick={() => setActiveTab('setup')}
                            >
                                <Settings size={15} /> Setup
                            </button>
                            <button 
                                className={`px-4 py-2 text-sm font-bold rounded-md whitespace-nowrap transition-all flex items-center gap-2 ${activeTab === 'execute' ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-black shadow-[0_0_15px_rgba(59,130,246,0.4)]' : 'text-amber-500/70 hover:text-amber-400 hover:bg-amber-500/10'}`}
                                onClick={() => setActiveTab('execute')}
                            >
                                <Zap size={15} /> Demo Execution
                            </button>
                        </div>

                        <div className="p-6 bg-black/40 rounded-xl border border-amber-500/10 mt-1 min-h-[240px]">
                            {activeTab === 'setup' && (
                                <div className="flex flex-col gap-5 animate-fade-in">
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <h3 className="text-lg font-bold text-amber-400 drop-shadow-sm">Create Session Key</h3>
                                            <p className="text-xs text-amber-100/50 mt-1">Configure restrictions for your burner key.</p>
                                        </div>
                                        <button onClick={generateKey} className="px-3 py-1.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-md text-xs font-bold hover:bg-amber-500/30 transition-all flex items-center gap-1">
                                            <PlusCircle size={14}/> Generate Key
                                        </button>
                                    </div>
                                    
                                    <div className="grid gap-4">
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">Validator Address</label>
                                            <input type="text" className="input-field bg-slate-900/50 border-slate-700 text-slate-200 text-sm focus:border-amber-500" placeholder="0x..." value={validatorAddr} onChange={(e) => setValidatorAddr(e.target.value)} />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">Burner Private Key (Stored locally)</label>
                                            <input type="password" className="input-field bg-slate-900/50 border-slate-700 text-slate-200 text-sm focus:border-amber-500" placeholder="0x..." value={burnerKey} onChange={(e) => setBurnerKey(e.target.value)} />
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-xs text-slate-400 mb-1 block">Target Contract (0x0 for any)</label>
                                                <input type="text" className="input-field bg-slate-900/50 border-slate-700 text-slate-200 text-sm focus:border-amber-500" value={targetAddr} onChange={(e) => setTargetAddr(e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="text-xs text-slate-400 mb-1 block">Function Selector (0x0 for any)</label>
                                                <input type="text" className="input-field bg-slate-900/50 border-slate-700 text-slate-200 text-sm focus:border-amber-500" value={selector} onChange={(e) => setSelector(e.target.value)} />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-xs text-slate-400 mb-1 block">Max Value (ETH)</label>
                                                <input type="text" className="input-field bg-slate-900/50 border-slate-700 text-slate-200 text-sm focus:border-amber-500" value={maxValue} onChange={(e) => setMaxValue(e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="text-xs text-slate-400 mb-1 block">Valid For (Minutes)</label>
                                                <input type="number" className="input-field bg-slate-900/50 border-slate-700 text-slate-200 text-sm focus:border-amber-500" value={validForMinutes} onChange={(e) => setValidForMinutes(e.target.value)} />
                                            </div>
                                        </div>
                                    </div>

                                    <button 
                                        className="w-full mt-2 py-3 rounded-lg font-bold text-black bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-all border-none"
                                        onClick={handleInstallAndAddKey}
                                    >
                                        {isSkInstalled ? "Add Session Key" : "Install Module & Add Key"}
                                    </button>
                                </div>
                            )}

                            {activeTab === 'execute' && (
                                <div className="flex flex-col gap-5 animate-fade-in">
                                    <div>
                                        <h3 className="text-lg font-bold text-blue-400 drop-shadow-sm">Send Operation via Session Key</h3>
                                        <p className="text-xs text-blue-100/50 mt-1">Send a custom transaction signed solely by the burner key in your local storage.</p>
                                    </div>
                                    
                                    <div className="flex flex-col gap-4 p-4 bg-blue-950/20 border border-blue-500/20 rounded-xl">
                                        <div>
                                            <label className="text-xs text-blue-300 mb-1 block">Target Address</label>
                                            <input type="text" className="input-field bg-slate-900/50 border-slate-700 text-slate-200 text-sm focus:border-blue-500" placeholder="0x..." value={execTarget} onChange={(e) => setExecTarget(e.target.value)} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-xs text-blue-300 mb-1 block">Value (ETH)</label>
                                                <input type="text" className="input-field bg-slate-900/50 border-slate-700 text-slate-200 text-sm focus:border-blue-500" placeholder="0.0" value={execValue} onChange={(e) => setExecValue(e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="text-xs text-blue-300 mb-1 block">Data (Hex)</label>
                                                <input type="text" className="input-field bg-slate-900/50 border-slate-700 text-slate-200 text-sm focus:border-blue-500" placeholder="0x..." value={execData} onChange={(e) => setExecData(e.target.value)} />
                                            </div>
                                        </div>
                                    </div>

                                    <button 
                                        className="w-full py-3.5 rounded-lg font-bold text-black bg-gradient-to-r from-blue-500 to-cyan-400 hover:from-blue-400 hover:to-cyan-300 shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all mt-2 border-none"
                                        onClick={handleExecuteSession}
                                    >
                                        Send via Session Key
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        )}
    </div>
  );
}
