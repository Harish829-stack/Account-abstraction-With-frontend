import React, { useState } from 'react';
import { ethers } from 'ethers';
import { useAppContext } from '../context/AppContext';
import { SmartAccountABI, ERC20_ABI, IEntryPointABI } from '../utils/abis';
import { sendUserOperation, getUserOpReceipt } from '../utils/bundler';
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
    env
  } = useAppContext();

  const [operations, setOperations] = useState([
    { receiver: '', amount: '', token: 'ETH' }
  ]);
  const [usePaymaster, setUsePaymaster] = useState(false);
  
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [callGasLimit, setCallGasLimit] = useState('1000000'); // higher default for batch
  const [verificationGasLimit, setVerificationGasLimit] = useState('700000');
  const [preVerificationGas, setPreVerificationGas] = useState('200000');

  const [pending, setPending] = useState(false);
  const [userOpHashResult, setUserOpHashResult] = useState('');
  const [txHashResult, setTxHashResult] = useState('');
  const [waitingForTx, setWaitingForTx] = useState(false);
  const [countdown, setCountdown] = useState(7);

  const addOperation = () => {
    setOperations([...operations, { receiver: '', amount: '', token: 'ETH' }]);
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

  const buildBatchCalldata = () => {
    const dest = [];
    const value = [];
    const func = [];

    const usdcInterface = new ethers.Interface(ERC20_ABI);

    for (const op of operations) {
      if (op.token === 'ETH') {
        const parsedAmount = op.amount ? ethers.parseEther(op.amount) : 0n;
        dest.push(op.receiver);
        value.push(parsedAmount);
        func.push("0x");
      } else {
        // USDC Token Transfer
        const parsedAmount = op.amount ? ethers.parseUnits(op.amount, 6) : 0n;
        
        // SmartAccount pulls from EOA -> Receiver
        const innerCall = usdcInterface.encodeFunctionData("transferFrom", [
           eoaAddress,
           op.receiver,
           parsedAmount
        ]);

        dest.push(env.USDC_TOKEN);
        value.push(0n);
        func.push(innerCall);
      }
    }

    const saInterface = new ethers.Interface(SmartAccountABI);
    return saInterface.encodeFunctionData("executeBatch", [dest, value, func]);
  };

  const isFormValid = () => {
    for (const op of operations) {
      if (!op.receiver || !ethers.isAddress(op.receiver) || !op.amount || Number(op.amount) < 0) {
        return false;
      }
    }
    return true;
  };

  const handleSendBatchOp = async () => {
    if (!isFormValid()) {
      alert("Please ensure all receivers are valid addresses and amounts are > 0");
      return;
    }
    if (!smartAccountAddress || !signer) return;

    setPending(true);
    setUserOpHashResult('');
    try {
      const entryPoint = new ethers.Contract(env.ENTRY_POINT, IEntryPointABI, provider);
      const nonce = await entryPoint.getNonce(smartAccountAddress, 0);
      const fee = await provider.getFeeData();

      const calldata = buildBatchCalldata();

      const userOp = {
         sender: smartAccountAddress,
         nonce: toHex(nonce),
         initCode: "0x",
         callData: calldata,
         callGasLimit: toHex(callGasLimit),
         verificationGasLimit: toHex(verificationGasLimit),
         preVerificationGas: toHex(preVerificationGas),
         maxFeePerGas: toHex(fee.maxFeePerGas),
         maxPriorityFeePerGas: toHex(fee.maxPriorityFeePerGas),
         paymasterAndData: "0x",
         signature: "0x"
      };

      if (usePaymaster) {
         if (!paymasterAddress) throw new Error("Paymaster address not set in State!");
         userOp.paymasterAndData = paymasterAddress;
      }

      // Get UserOp Hash from EntryPoint
      const userOpHash = await entryPoint.getUserOpHash(userOp);
      
      // Sign full UserOp
      const saSig = await signer.signMessage(ethers.getBytes(userOpHash));
      userOp.signature = saSig;

      // Send to bundler
      const finalHash = await sendUserOperation(userOp);
      setUserOpHashResult(finalHash);
      addPendingUserOp(finalHash);

      // Wait 7 seconds and poll for transaction hash
      setWaitingForTx(true);
      setCountdown(7);
      const timer = setInterval(() => {
         setCountdown(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);

      setTimeout(async () => {
         clearInterval(timer);
         let receipt = null;
         for (let i = 0; i < 3; i++) { // poll up to 3 times
            receipt = await getUserOpReceipt(finalHash);
            if (receipt && receipt.receipt && receipt.receipt.transactionHash) break;
            await new Promise(res => setTimeout(res, 2000));
         }
         
         if (receipt && receipt.receipt && receipt.receipt.transactionHash) {
            const actualTxHash = receipt.receipt.transactionHash;
            setTxHashResult(actualTxHash);
            addPendingUserOp(finalHash, actualTxHash);
            refreshAllData();
         } else {
            // fallback if not found
            addPendingUserOp(finalHash);
         }
         setWaitingForTx(false);
      }, 7000);

    } catch (err) {
      console.error(err);
      if (err.code === 4001) alert("Transaction rejected by user");
      else alert(err.reason || err.message || "Failed to submit UserOp");
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
            Add multiple operations to execute them all in a single transaction. This saves gas and ensures atomic execution.
         </p>

         <div className="flex flex-col gap-4">
            {operations.map((op, idx) => (
              <div key={idx} className="p-4 bg-black/20 rounded-lg border border-white/5 relative group transition-all hover:border-white/10">
                 <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-bold text-muted bg-white/5 px-2 py-1 rounded">Operation {idx + 1}</span>
                    <button 
                      onClick={() => removeOperation(idx)}
                      disabled={operations.length <= 1}
                      className={`p-1.5 rounded-md transition-colors ${operations.length > 1 ? 'text-red-400 hover:bg-red-500/20' : 'text-gray-600 cursor-not-allowed'}`}
                      title={operations.length <= 1 ? "Cannot remove last operation" : "Remove operation"}
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
                       </select>
                    </div>
                    <div className="flex flex-col gap-1 w-full sm:w-3/4">
                       <label className="text-xs text-muted">Amount</label>
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
                    <label className="text-xs text-muted">Receiver Address</label>
                    <input 
                      type="text" 
                      className="input-field py-2 text-sm font-mono" 
                      placeholder="0x..." 
                      value={op.receiver}
                      onChange={(e) => updateOperation(idx, 'receiver', e.target.value)}
                    />
                 </div>
              </div>
            ))}
         </div>

         <button 
           className="btn border border-secondary text-secondary hover:bg-secondary/10 flex justify-center items-center gap-2 py-3 mt-2 border-dashed"
           onClick={addOperation}
         >
           <Plus size={18} /> Add Another Operation
         </button>

         {/* Paymaster Toggle */}
         <div className="flex items-center gap-3 p-3 bg-white/5 rounded-md border border-white/5 mt-4">
            <input 
               type="checkbox" 
               id="pmBatchToggle" 
               className="w-4 h-4 accent-primary"
               checked={usePaymaster}
               onChange={(e) => setUsePaymaster(e.target.checked)}
            />
            <label htmlFor="pmBatchToggle" className="text-sm flex-1 cursor-pointer">
               Sponsor gas with Paymaster (ERC20)
            </label>
         </div>

         {/* Gas Settings */}
         <div className="mt-2 text-sm">
            <button 
              className="flex items-center gap-1 text-muted hover:text-white transition-colors py-2"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
               <Settings size={16} /> Advanced Gas Settings
            </button>
            {showAdvanced && (
               <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3 bg-black/20 p-4 rounded-md border border-white/5">
                  <div className="flex flex-col gap-1">
                     <label className="text-xs text-muted">Call Gas Limit</label>
                     <input type="number" className="input-field py-1 text-xs" value={callGasLimit} onChange={e=>setCallGasLimit(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1">
                     <label className="text-xs text-muted">Verification Gas</label>
                     <input type="number" className="input-field py-1 text-xs" value={verificationGasLimit} onChange={e=>setVerificationGasLimit(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1">
                     <label className="text-xs text-muted">Pre-Verification Gas</label>
                     <input type="number" className="input-field py-1 text-xs" value={preVerificationGas} onChange={e=>setPreVerificationGas(e.target.value)} />
                  </div>
               </div>
            )}
         </div>

         <button 
           className="btn btn-primary mt-2 flex justify-center items-center py-3" 
           disabled={pending || !isFormValid()}
           onClick={handleSendBatchOp}
         >
            {pending ? (
              <><div className="loader mx-2 w-4 h-4 border-2"></div> Bundling Multi-Op...</>
            ) : (
              <><Send size={18} /> Execute Batch Operation</>
            )}
         </button>

         {/* Result */}
         {userOpHashResult && (
           <div className="mt-4 p-4 border border-secondary/30 bg-secondary/10 rounded-md">
             <h4 className="flex items-center gap-2 text-secondary mb-1">
                <ExternalLink size={18} /> Batch UserOperation Sent!
             </h4>
             <p className="text-xs break-all text-muted font-mono mb-2">OpHash: {userOpHashResult}</p>
             
             {waitingForTx && (
                <div className="text-xs text-yellow-400 flex items-center gap-2 mb-2">
                   <div className="loader" style={{width: '12px', height: '12px', borderWidth: '2px'}}></div>
                   Waiting for on-chain inclusion... (checking in {countdown}s)
                </div>
             )}

             {txHashResult && (
               <a 
                 href={`https://sepolia.etherscan.io/tx/${txHashResult}`}
                 target="_blank"
                 rel="noreferrer"
                 className="text-sm font-bold text-secondary hover:underline flex items-center gap-1"
               >
                 View on Sepolia Etherscan &rarr;
               </a>
             )}
           </div>
         )}
      </div>
    </div>
  );
}
