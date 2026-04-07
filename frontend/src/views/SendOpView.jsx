import React, { useState } from 'react';
import { ethers } from 'ethers';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { SmartAccountABI, ERC20_ABI, IEntryPointABI, ERC20PaymasterABI } from '../utils/abis';
import { sendUserOperation, getUserOpReceipt, estimateUserOperationGas } from '../utils/bundler';
import { toHex } from '../utils/helpers';
import { Send, Settings, ExternalLink } from 'lucide-react';

export default function SendOpView() {
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

  const [receiver, setReceiver] = useState('');
  const [amount, setAmount] = useState('');
  const [token, setToken] = useState('ETH'); // ETH or USDC
  const [usePaymaster, setUsePaymaster] = useState(false);
  
  // Custom Contract Call fields
  const [functionSig, setFunctionSig] = useState('');
  const [parameters, setParameters] = useState('');

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [callGasLimit, setCallGasLimit] = useState('100000');
  const [verificationGasLimit, setVerificationGasLimit] = useState('120000');
  const [preVerificationGas, setPreVerificationGas] = useState('45000');

  const [pending, setPending] = useState(false);
  const [userOpHashResult, setUserOpHashResult] = useState('');
  const [txHashResult, setTxHashResult] = useState('');
  const [waitingForTx, setWaitingForTx] = useState(false);
  const [countdown, setCountdown] = useState(7);

  const buildCalldata = (amountStr) => {
     const saInterface = new ethers.Interface(SmartAccountABI);
     if (token === 'ETH') {
        const parsedAmount = ethers.parseEther(amountStr || '0');
        return saInterface.encodeFunctionData("execute", [
           receiver,
           parsedAmount,
           "0x"
        ]);
     } else if (token === 'USDC') {
        // USDC Token Transfer
        const usdcInterface = new ethers.Interface(ERC20_ABI);
        const parsedAmount = ethers.parseUnits(amountStr || '0', 6); // USDC has 6 decimals
        
        const innerCall = usdcInterface.encodeFunctionData("transferFrom", [
           eoaAddress,
           receiver,
           parsedAmount
        ]);

        return saInterface.encodeFunctionData("execute", [
           env.USDC_TOKEN,
           0,
           innerCall
        ]);
     } else if (token === 'CONTRACT_CALL') {
        try {
           // Parse function signature and parameters
           // Example signature: "setValue(uint256)"
           // Example parameters: "123"
           const iface = new ethers.Interface([`function ${functionSig}`]);
           const methodName = functionSig.split('(')[0].trim();
           
           // Split parameters by comma and trim
           const paramsArray = parameters ? parameters.split(',').map(p => p.trim()) : [];
           
           // Attempt to encode the call
           const innerCall = iface.encodeFunctionData(methodName, paramsArray);
           const parsedAmount = amountStr ? ethers.parseEther(amountStr) : 0n;

           return saInterface.encodeFunctionData("execute", [
              receiver, // Target contract address
              parsedAmount,
              innerCall
           ]);
        } catch (err) {
           console.error("Encoding error:", err);
           throw new Error("Failed to encode contract call. Check signature and parameters.");
        }
     }
     return "0x";
  };

  const handleSendOp = async () => {
     if (!receiver || !amount || !smartAccountAddress || !signer) return;
      if (!ethers.isAddress(receiver)) {
         toast.error("Invalid receiver address");
         return;
      }

     setPending(true);
     setUserOpHashResult('');
     try {
       const entryPoint = new ethers.Contract(env.ENTRY_POINT, IEntryPointABI, provider);
       const nonce = await entryPoint.getNonce(smartAccountAddress, 0);
       const fee = await provider.getFeeData();

       const calldata = buildCalldata(amount);

       const userOp = {
          sender: smartAccountAddress,
          nonce: toHex(nonce),
          initCode: "0x",
          callData: calldata,
          callGasLimit: toHex(callGasLimit), // Initial fallback
          verificationGasLimit: toHex(verificationGasLimit), // Initial fallback
          preVerificationGas: toHex(preVerificationGas), // Initial fallback
          maxFeePerGas: toHex(fee.maxFeePerGas),
          maxPriorityFeePerGas: toHex(fee.maxPriorityFeePerGas),
          paymasterAndData: "0x",
          signature: "0x"
       };

       if (usePaymaster) {
          if (!paymasterAddress) throw new Error("Paymaster address not set in State!");
          userOp.paymasterAndData = paymasterAddress;
       }

       // Estimate actual gas needed dynamically to prevent OOG and balance errors
       try {
           const estimated = await estimateUserOperationGas(userOp);
           
           // Apply padding to estimations for safety margins
           const safeCallGasLimit = BigInt(estimated.callGasLimit);
           const safeVerification = BigInt(estimated.verificationGasLimit);
           // Skandha sometimes returns low preVerificationGas, standard padding is + 5000
           const safePreVerification = BigInt(estimated.preVerificationGas) + 5000n;

           userOp.callGasLimit = toHex(safeCallGasLimit);
           userOp.verificationGasLimit = toHex(safeVerification);
           userOp.preVerificationGas = toHex(safePreVerification);

           setCallGasLimit(safeCallGasLimit.toString());
           setVerificationGasLimit(safeVerification.toString());
           setPreVerificationGas(safePreVerification.toString());
       } catch (estimateErr) {
           console.warn("Gas estimation failed, falling back to manual config:", estimateErr);
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
       toast.success("UserOperation submitted successfully!");

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
              toast.success("Transaction confirmed on-chain!");
           } else {
              // fallback if not found
              addPendingUserOp(finalHash);
           }
           setWaitingForTx(false);
        }, 7000);

      } catch (err) {
        console.error(err);
        if (err.code === 4001) toast.error("Transaction rejected by user");
        else toast.error(err.reason || err.message || "Failed to submit UserOp");
      } finally {
       setPending(false);
     }
  };

  if (!smartAccountAddress) {
    return (
      <div className="glass-card max-w-2xl mx-auto text-center py-10 border border-red-500/30">
        <h3 className="text-danger mb-2">Smart Account Required</h3>
        <p className="text-muted text-sm">You must set up or connect a Smart Account before sending operations.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <div className="glass-card flex flex-col gap-5">
         <h2 className="flex items-center gap-2 text-gradient"><Send size={24} /> New UserOperation</h2>
         
         {/* Token & Amount */}
         <div className="flex gap-4">
           <div className="flex flex-col gap-1 w-1/3">
             <label className="text-sm text-muted">Asset</label>
             <select 
               className="input-field px-3" 
               value={token} 
               onChange={(e) => setToken(e.target.value)}
             >
               <option value="ETH">ETH</option>
               <option value="USDC">USDC</option>
               <option value="CONTRACT_CALL">Contract Call</option>
             </select>
           </div>
           <div className="flex flex-col gap-1 w-2/3">
             <label className="text-sm text-muted">{token === 'CONTRACT_CALL' ? 'Value (ETH)' : 'Amount'}</label>
             <input 
               type="number" 
               className="input-field" 
               placeholder="0.00" 
               value={amount}
               onChange={(e) => setAmount(e.target.value)}
             />
           </div>
         </div>

         {/* Target/Receiver Address */}
         <div className="flex flex-col gap-1">
            <label className="text-sm text-muted">{token === 'CONTRACT_CALL' ? 'Target Contract Address' : 'Receiver Address'}</label>
            <input 
              type="text" 
              className="input-field" 
              placeholder="0x..." 
              value={receiver}
              onChange={(e) => setReceiver(e.target.value)}
            />
         </div>

         {/* Custom Contract Call Details */}
         {token === 'CONTRACT_CALL' && (
            <div className="flex flex-col gap-4 p-4 bg-white/5 rounded-md border border-white/10 animate-in fade-in slide-in-from-top-2 duration-300">
               <div className="flex flex-col gap-1">
                  <label className="text-sm text-muted">Function Signature</label>
                  <input 
                    type="text" 
                    className="input-field font-mono" 
                    placeholder="myFunction(address,uint256)" 
                    value={functionSig}
                    onChange={(e) => setFunctionSig(e.target.value)}
                  />
                  <p className="text-[10px] text-muted italic">Format: methodName(type1,type2)</p>
               </div>
               <div className="flex flex-col gap-1">
                  <label className="text-sm text-muted">Parameters</label>
                  <input 
                    type="text" 
                    className="input-field font-mono" 
                    placeholder="0x123..., 100" 
                    value={parameters}
                    onChange={(e) => setParameters(e.target.value)}
                  />
                  <p className="text-[10px] text-muted italic">Comma-separated values</p>
               </div>
            </div>
         )}

         {/* Paymaster Toggle */}
         <div className="flex items-center gap-3 p-3 bg-white/5 rounded-md border border-white/5">
            <input 
               type="checkbox" 
               id="pmToggle" 
               className="w-4 h-4 accent-primary"
               checked={usePaymaster}
               onChange={(e) => setUsePaymaster(e.target.checked)}
            />
            <label htmlFor="pmToggle" className="text-sm flex-1 cursor-pointer">
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
           className="btn btn-primary mt-4" 
           disabled={pending || (token !== 'CONTRACT_CALL' && !amount) || !receiver || (token === 'CONTRACT_CALL' && !functionSig)}
           onClick={handleSendOp}
         >
            {pending ? (
              <><div className="loader mx-2"></div> Bundling UserOp...</>
            ) : (
              <><Send size={18} /> Sign & Send Operation</>
            )}
         </button>

         {/* Result */}
         {userOpHashResult && (
           <div className="mt-4 p-4 border border-secondary/30 bg-secondary/10 rounded-md">
             <h4 className="flex items-center gap-2 text-secondary mb-1">
                <ExternalLink size={18} /> UserOperation Sent!
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
