import React, { useState } from 'react';
import { ethers } from 'ethers';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { SmartAccountABI, ERC20_ABI, IEntryPointABI } from '../utils/abis';
import { sendUserOperation, getUserOpReceipt, estimateUserOperationGas } from '../utils/bundler';
import { toHex } from '../utils/helpers';
import { Layers, Settings, ExternalLink, Plus, Trash2, Send } from 'lucide-react';

export default function BatchSendView() {
  const { 
    provider, 
    signer, 
    eoaAddress,
    smartAccountAddress, 
    paymasterAddress,
    addPendingUserOp,
    refreshAllData,
    env
  } = useAppContext();
  const toast = useToast();

  const [operations, setOperations] = useState([
    { receiver: '', amount: '', token: 'ETH', functionSig: '', parameters: '' }
  ]);
  const [usePaymaster, setUsePaymaster] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [callGasLimit, setCallGasLimit] = useState('300000');
  const [verificationGasLimit, setVerificationGasLimit] = useState('200000');
  const [preVerificationGas, setPreVerificationGas] = useState('70000');

  const [pending, setPending] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [userOpHashResult, setUserOpHashResult] = useState('');
  const [txHashResult, setTxHashResult] = useState('');
  const [waitingForTx, setWaitingForTx] = useState(false);
  const [countdown, setCountdown] = useState(7);

  const addOperation = () => {
    setOperations([...operations, { receiver: '', amount: '', token: 'ETH', functionSig: '', parameters: '' }]);
  };

  const removeOperation = (index) => {
    if (operations.length <= 1) return;
    const newOps = [...operations];
    newOps.splice(index, 1);
    setOperations(newOps);
  };

  const updateOperation = (index, field, value) => {
    const newOps = [...operations];
    newOps[index][field] = value;
    setOperations(newOps);
  };

  const normalize = (val) => {
    if (Array.isArray(val)) return val.map(normalize);
    if (typeof val === "string" && /^\d+$/.test(val)) return BigInt(val);
    return val;
  };

  const buildBatchCalldata = () => {
    const dest = [];
    const value = [];
    const func = [];

    const usdcInterface = new ethers.Interface(ERC20_ABI);

    for (const op of operations) {
      if (!ethers.isAddress(op.receiver)) throw new Error("Invalid address in one of the operations");
      
      if (op.token === 'ETH') {
        const parsedAmount = op.amount ? ethers.parseEther(op.amount) : 0n;
        dest.push(op.receiver);
        value.push(parsedAmount);
        func.push("0x");
      } else if (op.token === 'USDC') {
        const parsedAmount = op.amount ? ethers.parseUnits(op.amount, 6) : 0n;
        const innerCall = usdcInterface.encodeFunctionData("transfer", [op.receiver, parsedAmount]);
        dest.push(env.USDC_TOKEN);
        value.push(0n);
        func.push(innerCall);
      } else if (op.token === 'CONTRACT_CALL') {
        try {
          const iface = new ethers.Interface([`function ${op.functionSig}`]);
          const methodName = op.functionSig.split('(')[0].trim();
          let params = [];
          if (op.parameters) {
             try {
                params = normalize(JSON.parse(op.parameters));
             } catch {
                params = op.parameters.split(',').map(p => p.trim()).map(p => normalize(p));
             }
          }
          const innerCall = iface.encodeFunctionData(methodName, params);
          const parsedAmount = op.amount ? ethers.parseEther(op.amount) : 0n;

          dest.push(op.receiver);
          value.push(parsedAmount);
          func.push(innerCall);
        } catch (err) {
          throw new Error(`Failed to encode Operation ${operations.indexOf(op) + 1}: ${err.message}`);
        }
      }
    }

    const saInterface = new ethers.Interface(SmartAccountABI);
    return saInterface.encodeFunctionData("executeBatch", [dest, value, func]);
  };

  const handleEstimateGas = async () => {
    if (!smartAccountAddress) return;
    setIsEstimating(true);
    try {
      const entryPoint = new ethers.Contract(env.ENTRY_POINT, IEntryPointABI, provider);
      const nonce = await entryPoint.getNonce(smartAccountAddress, 0);
      const fee = await provider.getFeeData();

      const userOp = {
        sender: smartAccountAddress,
        nonce: toHex(nonce),
        initCode: "0x",
        callData: buildBatchCalldata(),
        callGasLimit: toHex(callGasLimit),
        verificationGasLimit: toHex(verificationGasLimit),
        preVerificationGas: toHex(preVerificationGas),
        maxFeePerGas: toHex(fee.maxFeePerGas),
        maxPriorityFeePerGas: toHex(fee.maxPriorityFeePerGas),
        paymasterAndData: usePaymaster ? (paymasterAddress || "0x") : "0x",
        signature: "0x"
      };

      const est = await estimateUserOperationGas(userOp);
      
      setCallGasLimit(BigInt(est.callGasLimit).toString());
      setVerificationGasLimit(BigInt(est.verificationGasLimit).toString());
      const pvg = (BigInt(est.preVerificationGas) + 10000n).toString();
      setPreVerificationGas(pvg);
      
      toast.success("Batch gas estimated! Advanced settings updated.");
      setShowAdvanced(true);
    } catch (err) {
      console.error("Batch estimation error:", err);
      toast.error("Estimation failed: " + err.message);
    } finally {
      setIsEstimating(false);
    }
  };

  const handleSendBatchOp = async () => {
    if (!smartAccountAddress || !signer) return;

    setPending(true);
    setUserOpHashResult('');
    setTxHashResult('');

    try {
      const entryPoint = new ethers.Contract(env.ENTRY_POINT, IEntryPointABI, provider);
      const nonce = await entryPoint.getNonce(smartAccountAddress, 0);
      const fee = await provider.getFeeData();

      const userOp = {
        sender: smartAccountAddress,
        nonce: toHex(nonce),
        initCode: "0x",
        callData: buildBatchCalldata(),
        callGasLimit: toHex(callGasLimit),
        verificationGasLimit: toHex(verificationGasLimit),
        preVerificationGas: toHex(preVerificationGas),
        maxFeePerGas: toHex(fee.maxFeePerGas),
        maxPriorityFeePerGas: toHex(fee.maxPriorityFeePerGas),
        paymasterAndData: "0x",
        signature: "0x"
      };

      if (usePaymaster) {
         if (!paymasterAddress) throw new Error("Paymaster address not set!");
         userOp.paymasterAndData = paymasterAddress;
      }

      // Use the values already in state
      userOp.callGasLimit = toHex(callGasLimit);
      userOp.verificationGasLimit = toHex(verificationGasLimit);
      userOp.preVerificationGas = toHex(preVerificationGas);

      const hash = await entryPoint.getUserOpHash(userOp);
      userOp.signature = await signer.signMessage(ethers.getBytes(hash));

      const opHash = await sendUserOperation(userOp);
      setUserOpHashResult(opHash);
      addPendingUserOp(opHash);
      toast.success("Batch UserOperation sent!");

      setWaitingForTx(true);
      setCountdown(7);
      const timer = setInterval(() => setCountdown(c => c > 0 ? c - 1 : 0), 1000);

      setTimeout(async () => {
        clearInterval(timer);
        const receiptResult = await getUserOpReceipt(opHash);
        if (receiptResult?.receipt) {
          setTxHashResult(receiptResult.receipt.transactionHash);
          addPendingUserOp(opHash, receiptResult.receipt.transactionHash);
          refreshAllData();
          toast.success("Batch confirmed!");
        }
        setWaitingForTx(false);
      }, 7000);

    } catch (err) {
      toast.error(err.message);
    } finally {
      setPending(false);
    }
  };

  if (!smartAccountAddress) {
    return (
      <div className="glass-card max-w-3xl mx-auto text-center py-10 border border-red-500/30">
        <h3 className="text-danger mb-2">Smart Account Required</h3>
        <p className="text-muted text-sm">You must set up or connect a Smart Account before sending operations.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      <div className="glass-card flex flex-col gap-5">
         <div className="flex justify-between items-center border-b border-white/10 pb-3">
           <h2 className="flex items-center gap-2 text-gradient"><Layers size={24} /> Batch Operations</h2>
           <div className="badge badge-secondary">{operations.length} Items</div>
         </div>
         
         <p className="text-sm text-muted">
            Execute multiple operations in a single atomic transaction.
         </p>

         <div className="flex flex-col gap-4">
            {operations.map((op, idx) => (
              <div key={idx} className="p-4 bg-black/20 rounded-lg border border-white/5 relative group transition-all hover:border-white/10">
                 <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-bold text-muted bg-white/5 px-2 py-1 rounded">Operation {idx + 1}</span>
                    <button 
                      onClick={() => removeOperation(idx)}
                      disabled={operations.length <= 1}
                      className="p-1.5 rounded-md text-red-400 hover:bg-red-500/20 disabled:text-gray-600 disabled:cursor-not-allowed"
                    >
                      <Trash2 size={16} />
                    </button>
                 </div>
                 
                 <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex flex-col gap-1 w-full sm:w-1/4">
                       <label className="text-xs text-muted">Asset</label>
                       <select 
                         className="input-field px-3 py-2 text-sm" 
                         value={op.token} 
                         onChange={(e) => updateOperation(idx, 'token', e.target.value)}
                       >
                         <option value="ETH">ETH</option>
                         <option value="USDC">USDC</option>
                         <option value="CONTRACT_CALL">Contract Call</option>
                       </select>
                    </div>
                    <div className="flex flex-col gap-1 w-full sm:w-3/4">
                       <label className="text-xs text-muted">Amount / Value</label>
                       <input 
                         type="number" 
                         className="input-field py-2 text-sm" 
                         placeholder="0.00" 
                         value={op.amount}
                         onChange={(e) => updateOperation(idx, 'amount', e.target.value)}
                       />
                    </div>
                 </div>

                 <div className="flex flex-col gap-1 mt-3">
                    <label className="text-xs text-muted">Target Address</label>
                    <input 
                      type="text" 
                      className="input-field py-2 text-sm font-mono" 
                      placeholder="0x..." 
                      value={op.receiver}
                      onChange={(e) => updateOperation(idx, 'receiver', e.target.value)}
                    />
                 </div>

                 {op.token === 'CONTRACT_CALL' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 p-3 bg-white/5 rounded border border-white/5">
                       <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-muted uppercase">Function Sig</label>
                          <input 
                            type="text" 
                            className="input-field py-1.5 text-xs font-mono" 
                            placeholder="func(type1)" 
                            value={op.functionSig}
                            onChange={(e) => updateOperation(idx, 'functionSig', e.target.value)}
                          />
                       </div>
                       <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-muted uppercase">Parameters</label>
                           <input 
                            type="text" 
                            className="input-field py-1.5 text-xs font-mono" 
                            placeholder="val1, val2" 
                            value={op.parameters}
                            onChange={(e) => updateOperation(idx, 'parameters', e.target.value)}
                          />
                       </div>
                    </div>
                 )}
              </div>
            ))}
         </div>

         <button 
           className="btn border border-secondary/50 text-secondary hover:bg-secondary/10 flex justify-center items-center gap-2 py-2 mt-2 border-dashed"
           onClick={addOperation}
         >
           <Plus size={18} /> Add Operation
         </button>

         <div className="flex items-center gap-3 p-3 bg-white/5 rounded-md border border-white/5 mt-4">
            <input 
               type="checkbox" 
               id="pmBatchToggle" 
               className="w-4 h-4 accent-primary"
               checked={usePaymaster}
               onChange={(e) => setUsePaymaster(e.target.checked)}
            />
            <label htmlFor="pmBatchToggle" className="text-sm flex-1 cursor-pointer">
               Sponsor with Paymaster
            </label>
         </div>

         <div className="mt-2 text-sm">
            <button 
              className="flex items-center gap-1 text-muted hover:text-white transition-colors"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
               <Settings size={16} /> Advanced Gas Settings
            </button>
            {showAdvanced && (
               <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3 bg-black/20 p-4 rounded-md border border-white/5">
                  <div className="flex flex-col gap-1">
                     <label className="text-xs text-muted">Call Gas</label>
                     <input type="number" className="input-field py-1 text-xs" value={callGasLimit} onChange={e=>setCallGasLimit(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1">
                     <label className="text-xs text-muted">Verif Gas</label>
                     <input type="number" className="input-field py-1 text-xs" value={verificationGasLimit} onChange={e=>setVerificationGasLimit(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1">
                     <label className="text-xs text-muted">PreVerif Gas</label>
                     <input type="number" className="input-field py-1 text-xs" value={preVerificationGas} onChange={e=>setPreVerificationGas(e.target.value)} />
                  </div>
               </div>
            )}
         </div>

         <div className="flex gap-3 mt-4">
            <button 
              className="btn btn-secondary flex-1" 
              disabled={pending || isEstimating || operations.some(op => !op.receiver)}
              onClick={handleEstimateGas}
            >
               {isEstimating ? (
                  <div className="flex items-center gap-2">
                     <div className="loader" style={{width: '14px', height: '14px', borderWidth: '2px'}}></div>
                     Estimating...
                  </div>
               ) : "Estimate Batch Gas"}
            </button>
            <button 
              className="btn btn-primary flex-2" 
              disabled={pending || isEstimating || operations.some(op => !op.receiver)}
              onClick={handleSendBatchOp}
              style={{ flex: 2 }}
            >
               {pending ? "Bundling..." : "Sign & Execute Batch"}
            </button>
         </div>

         {userOpHashResult && (
           <div className="mt-4 p-4 border border-secondary/30 bg-secondary/10 rounded-md">
             <h4 className="text-secondary mb-1">Batch Operation Sent!</h4>
             <p className="text-xs break-all text-muted font-mono mb-2">{userOpHashResult}</p>
             {waitingForTx && (
                <p className="text-xs text-yellow-400 italic">Waiting for on-chain inclusion... {countdown}s</p>
             )}
             {txHashResult && (
               <a 
                 href={`https://sepolia.etherscan.io/tx/${txHashResult}`}
                 target="_blank"
                 rel="noreferrer"
                 className="text-sm font-bold text-secondary hover:underline"
               >
                 View on Etherscan &rarr;
               </a>
             )}
           </div>
         )}
      </div>
    </div>
  );
}