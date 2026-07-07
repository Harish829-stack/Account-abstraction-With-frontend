import React, { useState } from 'react';
import { ethers } from 'ethers';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { SmartAccountABI, ERC20_ABI, IEntryPointABI } from '../utils/abis';
import { sendUserOperation, estimateUserOperationGas, getDynamicGasFees } from '../utils/bundler';
import { toHex, getEthPriceInUsd, formatNum, packUserOp, encodeERC7579Batch } from '../utils/helpers';
import { Layers, Settings, ExternalLink, Plus, Trash2, Send, CheckCircle2, RotateCcw } from 'lucide-react';

const UNISWAP_ROUTER = '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E';
const WETH_SEPOLIA = '0xfff9976782d46cc05630d1f6ebab18b2324d6b14';

export default function BatchSendView() {
  const { 
    provider, 
    signer, 
    eoaAddress,
    smartAccountAddress, 
    paymasterAddress,
    refreshAllData,
    env,
    trackOp,
    setCurrentView,
    setGlobalLoading,
    nativeToken,
    isAmoy
  } = useAppContext();
  const toast = useToast();

  const [operations, setOperations] = useState([
    { receiver: '', amount: '', token: 'ETH', functionSig: '', parameters: '' }
  ]);
  const [usePaymaster, setUsePaymaster] = useState(false);
  const [selectedGasToken, setSelectedGasToken] = useState(env?.USDC_TOKEN || '');

  const trackedTokens = isAmoy 
    ? [{ symbol: 'USDC', address: env?.USDC_TOKEN, decimals: 6 }]
    : [
        { symbol: 'USDC', address: env?.USDC_TOKEN, decimals: 6 },
        { symbol: 'EURC', address: '0x08210f9170f89ab7658f0b5e3ff39b0e03c594d4', decimals: 6 }
      ];

  const [showAdvanced, setShowAdvanced] = useState(false);

  const [callGasLimit, setCallGasLimit] = useState('');
  const [verificationGasLimit, setVerificationGasLimit] = useState('');
  const [preVerificationGas, setPreVerificationGas] = useState('');

  const [pending, setPending] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [userOpHashResult, setUserOpHashResult] = useState('');
  const [estimatedFee, setEstimatedFee] = useState(null);

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
      if (op.token !== 'UNISWAP_V3' && !ethers.isAddress(op.receiver)) throw new Error("Invalid address in one of the operations");
      
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
      } else if (op.token === 'UNISWAP_V3') {
        const parsedAmount = op.amount ? ethers.parseEther(op.amount) : 0n;
        const swapIface = new ethers.Interface([
          "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
        ]);
        const params = {
          tokenIn: WETH_SEPOLIA,
          tokenOut: env.USDC_TOKEN,
          fee: 3000,
          recipient: smartAccountAddress,
          amountIn: parsedAmount,
          amountOutMinimum: 0,
          sqrtPriceLimitX96: 0
        };
        const innerCall = swapIface.encodeFunctionData("exactInputSingle", [
          [params.tokenIn, params.tokenOut, params.fee, params.recipient, params.amountIn, params.amountOutMinimum, params.sqrtPriceLimitX96]
        ]);
        dest.push(UNISWAP_ROUTER);
        value.push(parsedAmount);
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

    return encodeERC7579Batch(dest, value, func);
  };

  const handleEstimateGas = async () => {
    if (!smartAccountAddress) return;
    setIsEstimating(true);
    try {
      const entryPoint = new ethers.Contract(env.ENTRY_POINT, IEntryPointABI, provider);
      const nonce = await entryPoint.getNonce(smartAccountAddress, 0);

      const { maxPriorityFeePerGas, maxFeePerGas } = await getDynamicGasFees(provider);

      const userOp = {
        sender: smartAccountAddress,
        nonce: toHex(nonce),
        factory: "0x",
        factoryData: "0x",
        callData: buildBatchCalldata(),
        callGasLimit: "0x0",
        verificationGasLimit: "0x0",
        preVerificationGas: "0x0",
        maxFeePerGas: toHex(maxFeePerGas),
        maxPriorityFeePerGas: toHex(maxPriorityFeePerGas),
        paymaster: usePaymaster ? (paymasterAddress || "0x") : "0x",
        paymasterVerificationGasLimit: usePaymaster ? toHex(2000000) : "0x",
        paymasterPostOpGasLimit: usePaymaster ? toHex(2000000) : "0x",
        paymasterData: usePaymaster ? selectedGasToken : "0x",
        signature: "0x"
      };

      const est = await estimateUserOperationGas(userOp);
      
      const callGasWithMargin = (BigInt(est.callGasLimit) * 12n) / 10n;
      const vgfWithMargin = (BigInt(est.verificationGasLimit) * 12n) / 10n;
      const pvgWithMargin = (BigInt(est.preVerificationGas) * 12n) / 10n;

      setCallGasLimit(callGasWithMargin.toString());
      setVerificationGasLimit(vgfWithMargin.toString());
      const pvg = pvgWithMargin.toString();
      setPreVerificationGas(pvg);

      // Compute dual-currency gas fees
      const totalGas = BigInt(est.callGasLimit) + BigInt(est.verificationGasLimit) + BigInt(pvg);
      const maxFee = totalGas * BigInt(maxFeePerGas);
      const ethFee = ethers.formatEther(maxFee);
      const ethPrice = await getEthPriceInUsd(provider, env.PRICE_FEED);
      const rawUsdcFee = parseFloat(ethFee) * ethPrice;
      const usdcFee = rawUsdcFee > 0 && rawUsdcFee < 0.01 ? "< 0.01" : rawUsdcFee.toFixed(2);
      setEstimatedFee({ eth: ethFee, usdc: usdcFee });
      
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
    setGlobalLoading(true, "Sending Batch UserOperation...");
    setUserOpHashResult('');

    try {
      const entryPoint = new ethers.Contract(env.ENTRY_POINT, IEntryPointABI, provider);
      const nonce = await entryPoint.getNonce(smartAccountAddress, 0);

      const { maxPriorityFeePerGas, maxFeePerGas } = await getDynamicGasFees(provider);

      const userOp = {
        sender: smartAccountAddress,
        nonce: toHex(nonce),
        factory: "0x",
        factoryData: "0x",
        callData: buildBatchCalldata(),
        callGasLimit: "0x0",
        verificationGasLimit: "0x0",
        preVerificationGas: "0x0",
        maxFeePerGas: toHex(maxFeePerGas),
        maxPriorityFeePerGas: toHex(maxPriorityFeePerGas),
        paymaster: "0x",
        paymasterVerificationGasLimit: "0x",
        paymasterPostOpGasLimit: "0x",
        paymasterData: "0x",
        signature: "0x"
      };

      // Try to estimate gas dynamically right before sending WITHOUT the paymaster
      try {
        const est = await estimateUserOperationGas(userOp);
        
        const callGasWithMargin = (BigInt(est.callGasLimit) * 12n) / 10n;
        const vgfWithMargin = (BigInt(est.verificationGasLimit) * 12n) / 10n;
        const pvgWithMargin = (BigInt(est.preVerificationGas) * 12n) / 10n;

        userOp.callGasLimit = toHex(callGasWithMargin);
        userOp.verificationGasLimit = toHex(vgfWithMargin);
        userOp.preVerificationGas = toHex(pvgWithMargin);
      } catch (err) {
        console.warn("Estimation failed, using UI inputs as fallback", err);
        if (callGasLimit && verificationGasLimit && preVerificationGas) {
            userOp.callGasLimit = toHex(callGasLimit);
            userOp.verificationGasLimit = toHex(verificationGasLimit);
            userOp.preVerificationGas = toHex(preVerificationGas);
        } else {
            throw err;
        }
      }

      // Attach Paymaster exactly after estimation is done
      if (usePaymaster) {
         if (!paymasterAddress) throw new Error("Paymaster address not set!");
         userOp.paymaster = paymasterAddress;
         userOp.paymasterVerificationGasLimit = toHex(2000000); // match estimation phase to avoid inconsistency
         userOp.paymasterPostOpGasLimit = toHex(2000000);       // match estimation phase to avoid inconsistency
         userOp.paymasterData = selectedGasToken;
      }

      const hash = await entryPoint.getUserOpHash(packUserOp(userOp));
      userOp.signature = await signer.signMessage(ethers.getBytes(hash));

      const opHash = await sendUserOperation(userOp);
      toast.success("Bundler accepted the transaction!");
      setUserOpHashResult(opHash);

      // Fire and forget — global tracker handles confirmation in background
      trackOp(opHash, 'Batch UserOperation');

      setPending(false);
      setGlobalLoading(false);
    } catch (err) {
      toast.error("Bundler rejected the transaction!");
      toast.error(err.reason || err.message || "Failed to execute batch operation");
      setPending(false);
      setGlobalLoading(false);
    }
  };

  const resetForm = () => {
    setUserOpHashResult('');
    setOperations([{ receiver: '', amount: '', token: 'ETH', functionSig: '', parameters: '' }]);
    setUsePaymaster(false);
    setShowAdvanced(false);
    setEstimatedFee(null);
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
        {/* ── Form ──────────────────────────────────── */}
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
                             <option value="ETH">{nativeToken}</option>
                             <option value="USDC">USDC</option>
                             {!isAmoy && (
                               <option value="UNISWAP_V3">Uniswap V3 ({nativeToken} → USDC)</option>
                             )}
                             <option value="CONTRACT_CALL">Contract Call</option>
                           </select>
                        </div>
                        <div className="flex flex-col gap-1 w-full sm:w-3/4">
                           <label className="text-xs text-muted">{op.token === 'CONTRACT_CALL' ? `Value (${nativeToken})` : op.token === 'UNISWAP_V3' ? `Swap Amount (${nativeToken})` : 'Amount'}</label>
                           <input 
                             type="number" 
                             className="input-field py-2 text-sm" 
                             placeholder="0.00" 
                             value={op.amount}
                             onChange={(e) => updateOperation(idx, 'amount', e.target.value)}
                           />
                        </div>
                     </div>

                     {op.token !== 'UNISWAP_V3' && (
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
                     )}

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
               className="flex justify-center items-center gap-2 w-full py-2 mt-1 text-sm font-semibold text-slate-700 hover:bg-white transition-all"
               style={{
                 background: 'rgba(255, 255, 255, 0.72)',
                 border: '1px solid rgba(22, 163, 74, 0.12)',
                 borderRadius: '12px',
                 boxShadow: '0 4px 12px rgba(22, 163, 74, 0.03)'
               }}
               onClick={addOperation}
             >
               <Plus size={16} /> Add Operation
             </button>

             <div className="flex flex-col gap-2 p-3 bg-white/5 rounded-md border border-white/5 mt-4">
                <div className="flex items-center gap-3">
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
                {usePaymaster && (
                  <div className="flex items-center gap-3 mt-1 pl-7">
                    <label className="text-sm text-muted">Gas Token</label>
                    <select 
                      className="input-field px-2 py-1 text-sm bg-black/20" 
                      value={selectedGasToken} 
                      onChange={(e) => setSelectedGasToken(e.target.value)}
                    >
                      {trackedTokens.map(t => (
                        <option key={t.symbol} value={t.address}>{t.symbol}</option>
                      ))}
                    </select>
                  </div>
                )}
             </div>

             <div className="mt-2 text-sm">
                <button 
                  className="btn-advanced-toggle"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                >
                   <Settings size={16} /> Advanced Gas Settings
                </button>
                {showAdvanced && (
                   <div className="advanced-gas-panel">
                      <div className="flex flex-col gap-1">
                         <label>Call Gas</label>
                         <input type="number" className="input-field py-1 text-xs" value={callGasLimit} onChange={e=>setCallGasLimit(e.target.value)} />
                      </div>
                      <div className="flex flex-col gap-1">
                         <label>Verif Gas</label>
                         <input type="number" className="input-field py-1 text-xs" value={verificationGasLimit} onChange={e=>setVerificationGasLimit(e.target.value)} />
                      </div>
                      <div className="flex flex-col gap-1">
                         <label>PreVerif Gas</label>
                         <input type="number" className="input-field py-1 text-xs" value={preVerificationGas} onChange={e=>setPreVerificationGas(e.target.value)} />
                      </div>
                   </div>
                )}
             </div>

             {estimatedFee && (
               <div className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-xl animate-fade-in flex flex-col gap-2 shadow-sm">
                 <div className="flex justify-between items-center text-xs text-muted">
                   <span className="font-bold">Estimated Gas Fee ({usePaymaster ? "Paymaster Sponsored" : "Self-Paid"})</span>
                   <span className="font-semibold text-primary">{usePaymaster ? `Paid in ${trackedTokens.find(t => t.address === selectedGasToken)?.symbol || 'Token'}` : `Paid in ${nativeToken}`}</span>
                 </div>
                 <div className="flex justify-between items-baseline mt-1">
                   <span className="text-sm font-bold font-mono text-slate-700">
                     {usePaymaster ? `${estimatedFee.usdc} ${trackedTokens.find(t => t.address === selectedGasToken)?.symbol || 'Token'}` : `${parseFloat(estimatedFee.eth).toFixed(6)} ${nativeToken}`}
                   </span>
                   <span className="text-sm font-bold font-mono text-slate-500">
                     {usePaymaster ? `~ ${parseFloat(estimatedFee.eth).toFixed(6)} ${nativeToken}` : `~ ${estimatedFee.usdc} ${trackedTokens.find(t => t.address === selectedGasToken)?.symbol || 'Token'}`}
                   </span>
                 </div>
               </div>
             )}

             <div className="flex gap-3 mt-4">
                <button 
                  className={`btn btn-secondary flex-1 ${(pending || isEstimating || operations.some(op => op.token !== 'UNISWAP_V3' && !op.receiver)) ? 'opacity-50 cursor-not-allowed' : ''}`} 
                  disabled={pending || isEstimating || operations.some(op => op.token !== 'UNISWAP_V3' && !op.receiver)}
                  onClick={handleEstimateGas}
                >
                   {isEstimating ? (
                      <div className="flex items-center justify-center gap-2">
                         <div className="loader" style={{width: '14px', height: '14px', borderWidth: '2px'}}></div>
                         Estimating...
                      </div>
                   ) : "Estimate Batch Gas"}
                </button>
                <button 
                  className={`btn btn-primary flex-2 ${(pending || isEstimating || operations.some(op => op.token !== 'UNISWAP_V3' && !op.receiver)) ? 'opacity-50 cursor-not-allowed' : ''}`} 
                  disabled={pending || isEstimating || operations.some(op => op.token !== 'UNISWAP_V3' && !op.receiver)}
                  onClick={handleSendBatchOp}
                  style={{ flex: 2 }}
                >
                   {pending ? "Sending Op..." : "Sign & Execute Batch"}
                </button>
             </div>

      </div>
    </div>
  );
}