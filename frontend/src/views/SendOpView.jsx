import React, { useState } from 'react';
import { ethers } from 'ethers';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { SmartAccountABI, ERC20_ABI, IEntryPointABI } from '../utils/abis';
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
  const [token, setToken] = useState('ETH'); // ETH, USDC, or CONTRACT_CALL

  const [functionSig, setFunctionSig] = useState('');
  const [parameters, setParameters] = useState('');

  const [usePaymaster, setUsePaymaster] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [callGasLimit, setCallGasLimit] = useState('120000');
  const [verificationGasLimit, setVerificationGasLimit] = useState('120000');
  const [preVerificationGas, setPreVerificationGas] = useState('50000');

  const [pending, setPending] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [userOpHashResult, setUserOpHashResult] = useState('');
  const [txHashResult, setTxHashResult] = useState('');
  const [waitingForTx, setWaitingForTx] = useState(false);
  const [countdown, setCountdown] = useState(7);

  const normalize = (val) => {
    if (Array.isArray(val)) return val.map(normalize);
    if (typeof val === "string" && /^\d+$/.test(val)) return BigInt(val);
    return val;
  };

  const buildCalldata = () => {
    const saInterface = new ethers.Interface(SmartAccountABI);

    if (token === 'ETH') {
      const val = amount ? ethers.parseEther(amount) : 0n;
      return saInterface.encodeFunctionData("execute", [receiver, val, "0x"]);
    }

    if (token === 'USDC') {
      const erc20 = new ethers.Interface(ERC20_ABI);
      const amt = amount ? ethers.parseUnits(amount, 6) : 0n;
      const inner = erc20.encodeFunctionData("transferFrom", [eoaAddress, receiver, amt]);
      return saInterface.encodeFunctionData("execute", [env.USDC_TOKEN, 0, inner]);
    }

    if (token === 'CONTRACT_CALL') {
      try {
        const iface = new ethers.Interface([`function ${functionSig}`]);
        const method = functionSig.substring(0, functionSig.indexOf("(")).trim();
        let params = [];
        if (parameters) {
          // Attempt JSON parse or fallback to comma-split
          try {
            params = normalize(JSON.parse(parameters));
          } catch {
             params = parameters.split(',').map(p => p.trim()).map(p => normalize(p));
          }
        }
        const inner = iface.encodeFunctionData(method, params);
        const val = amount ? ethers.parseEther(amount) : 0n;
        return saInterface.encodeFunctionData("execute", [receiver, val, inner]);
      } catch (err) {
        throw new Error("encoding failed: " + err.message);
      }
    }
    return "0x";
  };

  const handleEstimateGas = async () => {
    if (!receiver || !smartAccountAddress) return;
    if (!ethers.isAddress(receiver)) {
       toast.error("Invalid receiver address");
       return;
    }

    setIsEstimating(true);
    try {
      const entryPoint = new ethers.Contract(env.ENTRY_POINT, IEntryPointABI, provider);
      const nonce = await entryPoint.getNonce(smartAccountAddress, 0);
      const fee = await provider.getFeeData();

      const userOp = {
        sender: smartAccountAddress,
        nonce: toHex(nonce),
        initCode: "0x",
        callData: buildCalldata(),
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
      const pvg = (BigInt(est.preVerificationGas) + 5000n).toString();
      setPreVerificationGas(pvg);
      
      toast.success("Gas estimated successfully! Advanced settings updated.");
      setShowAdvanced(true);
    } catch (err) {
      console.error("Estimation error:", err);
      toast.error("Estimation failed: " + err.message);
    } finally {
      setIsEstimating(false);
    }
  };

  const handleSendOp = async () => {
    if (!receiver || !smartAccountAddress || !signer) return;
    if (!ethers.isAddress(receiver)) {
       toast.error("Invalid receiver address");
       return;
    }

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
        callData: buildCalldata(),
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

      // We use the values already in state (which might have been auto-filled or manually edited)
      // but ensure they are in hex for the bundler
      userOp.callGasLimit = toHex(callGasLimit);
      userOp.verificationGasLimit = toHex(verificationGasLimit);
      userOp.preVerificationGas = toHex(preVerificationGas);

      const hash = await entryPoint.getUserOpHash(userOp);
      userOp.signature = await signer.signMessage(ethers.getBytes(hash));

      const opHash = await sendUserOperation(userOp);
      setUserOpHashResult(opHash);
      addPendingUserOp(opHash);
      toast.success("UserOperation sent!");

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
          toast.success("Confirmed!");
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

         <div className="flex flex-col gap-1">
            <label className="text-sm text-muted">{token === 'CONTRACT_CALL' ? 'Target Address' : 'Receiver Address'}</label>
            <input 
              type="text" 
              className="input-field" 
              placeholder="0x..." 
              value={receiver}
              onChange={(e) => setReceiver(e.target.value)}
            />
         </div>

         {token === 'CONTRACT_CALL' && (
            <div className="flex flex-col gap-4 p-4 bg-white/5 rounded-md border border-white/10">
               <div className="flex flex-col gap-1">
                  <label className="text-sm text-muted">Function Signature</label>
                  <input 
                    type="text" 
                    className="input-field font-mono" 
                    placeholder="myMethod(address,uint256)" 
                    value={functionSig}
                    onChange={(e) => setFunctionSig(e.target.value)}
                  />
               </div>
               <div className="flex flex-col gap-1">
                  <label className="text-sm text-muted">Parameters (JSON or Comma Split)</label>
                  <input 
                    type="text" 
                    className="input-field font-mono" 
                    placeholder='["0x...", 100]' 
                    value={parameters}
                    onChange={(e) => setParameters(e.target.value)}
                  />
               </div>
            </div>
         )}

         <div className="flex items-center gap-3 p-3 bg-white/5 rounded-md border border-white/5">
            <input 
               type="checkbox" 
               id="pmToggle" 
               className="w-4 h-4 accent-primary"
               checked={usePaymaster}
               onChange={(e) => setUsePaymaster(e.target.checked)}
            />
            <label htmlFor="pmToggle" className="text-sm flex-1 cursor-pointer">
               Sponsor gas with Paymaster
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
              disabled={pending || isEstimating || !receiver}
              onClick={handleEstimateGas}
            >
               {isEstimating ? (
                  <div className="flex items-center gap-2">
                     <div className="loader" style={{width: '14px', height: '14px', borderWidth: '2px'}}></div>
                     Estimating...
                  </div>
               ) : "Estimate Gas"}
            </button>
            <button 
              className="btn btn-primary flex-2" 
              disabled={pending || isEstimating || !receiver}
              onClick={handleSendOp}
              style={{ flex: 2 }}
            >
               {pending ? "Bundling..." : "Sign & Send"}
            </button>
         </div>

         {userOpHashResult && (
           <div className="mt-4 p-4 border border-secondary/30 bg-secondary/10 rounded-md">
             <h4 className="text-secondary mb-1">UserOperation Sent!</h4>
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