import React, { useState } from 'react';
import { ethers } from 'ethers';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { SmartAccountABI, ERC20_ABI, IEntryPointABI } from '../utils/abis';
import { sendUserOperation, estimateUserOperationGas } from '../utils/bundler';
import { toHex, getEthPriceInUsd, formatNum } from '../utils/helpers';
import { Send, Settings, CheckCircle2, RotateCcw, ExternalLink } from 'lucide-react';

const UNISWAP_ROUTER = '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E';
const WETH_SEPOLIA = '0xfff9976782d46cc05630d1f6ebab18b2324d6b14';

export default function SendOpView() {
  const {
    provider,
    signer,
    eoaAddress,
    smartAccountAddress,
    paymasterAddress,
    refreshAllData,
    env,
    trackOp,
    setCurrentView
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
  const [estimatedFee, setEstimatedFee] = useState(null);

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
      const inner = erc20.encodeFunctionData("transfer", [receiver, amt]);
      return saInterface.encodeFunctionData("execute", [env.USDC_TOKEN, 0, inner]);
    }

    if (token === 'UNISWAP_V3') {
      const amtIn = amount ? ethers.parseEther(amount) : 0n;
      const swapIface = new ethers.Interface([
        "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
      ]);
      const params = {
        tokenIn: WETH_SEPOLIA,
        tokenOut: env.USDC_TOKEN,
        fee: 3000,
        recipient: smartAccountAddress,
        amountIn: amtIn,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0
      };
      const innerCallData = swapIface.encodeFunctionData("exactInputSingle", [
        [params.tokenIn, params.tokenOut, params.fee, params.recipient, params.amountIn, params.amountOutMinimum, params.sqrtPriceLimitX96]
      ]);
      return saInterface.encodeFunctionData("execute", [UNISWAP_ROUTER, amtIn, innerCallData]);
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
    let targetReceiver = receiver;
    if (token === 'UNISWAP_V3') {
      targetReceiver = UNISWAP_ROUTER;
    }
    if (!targetReceiver || !smartAccountAddress) return;
    if (!ethers.isAddress(targetReceiver)) {
       toast.error("Invalid receiver address");
       return;
    }

    setIsEstimating(true);
    try {
      const entryPoint = new ethers.Contract(env.ENTRY_POINT, IEntryPointABI, provider);
      const nonce = await entryPoint.getNonce(smartAccountAddress, 0);

      // Robust fee calculation bypassing eth_maxPriorityFeePerGas
      let maxFeePerGas = 20000000000n;
      let maxPriorityFeePerGas = 1500000000n;
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
          maxFeePerGas = fee.maxFeePerGas || (fee.gasPrice ? fee.gasPrice * 2n : maxFeePerGas);
          maxPriorityFeePerGas = fee.maxPriorityFeePerGas || maxPriorityFeePerGas;
        } catch (e) {
          console.error("Failed to load fee fallback:", e);
        }
      }

      const userOp = {
        sender: smartAccountAddress,
        nonce: toHex(nonce),
        initCode: "0x",
        callData: buildCalldata(),
        callGasLimit: toHex(callGasLimit),
        verificationGasLimit: toHex(verificationGasLimit),
        preVerificationGas: toHex(preVerificationGas),
        maxFeePerGas: toHex(maxFeePerGas),
        maxPriorityFeePerGas: toHex(maxPriorityFeePerGas),
        paymasterAndData: usePaymaster ? (paymasterAddress || "0x") : "0x",
        signature: "0x"
      };

      const est = await estimateUserOperationGas(userOp);
      
      setCallGasLimit(BigInt(est.callGasLimit).toString());
      setVerificationGasLimit(BigInt(est.verificationGasLimit).toString());
      const pvg = (BigInt(est.preVerificationGas) + 5000n).toString();
      setPreVerificationGas(pvg);

      // Compute dual-currency gas fees
      const totalGas = BigInt(est.callGasLimit) + BigInt(est.verificationGasLimit) + BigInt(pvg);
      const maxFee = totalGas * BigInt(maxFeePerGas);
      const ethFee = ethers.formatEther(maxFee);
      const ethPrice = await getEthPriceInUsd(provider, env.PRICE_FEED);
      const usdcFee = (parseFloat(ethFee) * ethPrice).toFixed(2);
      setEstimatedFee({ eth: ethFee, usdc: usdcFee });
      
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
    let targetReceiver = receiver;
    if (token === 'UNISWAP_V3') {
      targetReceiver = UNISWAP_ROUTER;
    }
    if (!targetReceiver || !smartAccountAddress || !signer) return;
    if (!ethers.isAddress(targetReceiver)) {
       toast.error("Invalid receiver address");
       return;
    }

    setPending(true);
    setUserOpHashResult('');

    try {
      const entryPoint = new ethers.Contract(env.ENTRY_POINT, IEntryPointABI, provider);
      const nonce = await entryPoint.getNonce(smartAccountAddress, 0);

      // Robust fee calculation bypassing eth_maxPriorityFeePerGas
      let maxFeePerGas = 20000000000n;
      let maxPriorityFeePerGas = 1500000000n;
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
          maxFeePerGas = fee.maxFeePerGas || (fee.gasPrice ? fee.gasPrice * 2n : maxFeePerGas);
          maxPriorityFeePerGas = fee.maxPriorityFeePerGas || maxPriorityFeePerGas;
        } catch (e) {
          console.error("Failed to load fee fallback:", e);
        }
      }

      const userOp = {
        sender: smartAccountAddress,
        nonce: toHex(nonce),
        initCode: "0x",
        callData: buildCalldata(),
        callGasLimit: toHex(callGasLimit),
        verificationGasLimit: toHex(verificationGasLimit),
        preVerificationGas: toHex(preVerificationGas),
        maxFeePerGas: toHex(maxFeePerGas),
        maxPriorityFeePerGas: toHex(maxPriorityFeePerGas),
        paymasterAndData: "0x",
        signature: "0x"
      };

      if (usePaymaster) {
         if (!paymasterAddress) throw new Error("Paymaster address not set!");
         userOp.paymasterAndData = paymasterAddress;
      }

      userOp.callGasLimit = toHex(callGasLimit);
      userOp.verificationGasLimit = toHex(verificationGasLimit);
      userOp.preVerificationGas = toHex(preVerificationGas);

      const hash = await entryPoint.getUserOpHash(userOp);
      userOp.signature = await signer.signMessage(ethers.getBytes(hash));

      const opHash = await sendUserOperation(userOp);
      toast.success("Bundler accepted the transaction!");

      // Fire and forget — global tracker handles confirmation in background
      trackOp(opHash, 'Send UserOperation');
      setUserOpHashResult(opHash);
      setPending(false);
    } catch (err) {
      toast.error("Bundler rejected the transaction!");
      toast.error(err.reason || err.message || "Failed to execute operation");
      setPending(false);
    }
  };

  const resetForm = () => {
    setUserOpHashResult('');
    setReceiver('');
    setAmount('');
    setToken('ETH');
    setFunctionSig('');
    setParameters('');
    setUsePaymaster(false);
    setShowAdvanced(false);
    setEstimatedFee(null);
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

        {/* ── Form ──────────────────────────────────── */}
        <h2 className="flex items-center gap-2 text-gradient"><Send size={24} /> New UserOperation</h2>

            <div className="flex gap-4">
              <div className="flex flex-col gap-1 w-1/3">
                <label className="text-sm text-muted">Asset</label>
                <select className="input-field px-3" value={token} onChange={(e) => setToken(e.target.value)}>
                  <option value="ETH">ETH</option>
                  <option value="USDC">USDC</option>
                  <option value="UNISWAP_V3">Uniswap V3 (ETH → USDC)</option>
                  <option value="CONTRACT_CALL">Contract Call</option>
                </select>
              </div>
              <div className="flex flex-col gap-1 w-2/3">
                <label className="text-sm text-muted">{token === 'CONTRACT_CALL' ? 'Value (ETH)' : token === 'UNISWAP_V3' ? 'Swap Amount (ETH)' : 'Amount'}</label>
                <input type="number" className="input-field" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </div>

            {token !== 'UNISWAP_V3' && (
              <div className="flex flex-col gap-1">
                <label className="text-sm text-muted">{token === 'CONTRACT_CALL' ? 'Target Address' : 'Receiver Address'}</label>
                <input type="text" className="input-field" placeholder="0x..." value={receiver} onChange={(e) => setReceiver(e.target.value)} />
              </div>
            )}

            {token === 'CONTRACT_CALL' && (
              <div className="flex flex-col gap-4 p-4 bg-white/5 rounded-md border border-white/10">
                <div className="flex flex-col gap-1">
                  <label className="text-sm text-muted">Function Signature</label>
                  <input type="text" className="input-field font-mono" placeholder="myMethod(address,uint256)" value={functionSig} onChange={(e) => setFunctionSig(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm text-muted">Parameters (JSON or Comma Split)</label>
                  <input type="text" className="input-field font-mono" placeholder='["0x...", 100]' value={parameters} onChange={(e) => setParameters(e.target.value)} />
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-md border border-white/5">
              <input type="checkbox" id="pmToggle" className="w-4 h-4 accent-primary" checked={usePaymaster} onChange={(e) => setUsePaymaster(e.target.checked)} />
              <label htmlFor="pmToggle" className="text-sm flex-1 cursor-pointer">Sponsor gas with Paymaster</label>
            </div>

            <div className="mt-2 text-sm">
              <button className="flex items-center gap-1 text-primary hover:text-primary-hover font-medium transition-colors" onClick={() => setShowAdvanced(!showAdvanced)}>
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

            {estimatedFee && (
              <div className="mt-3 p-4 bg-white/5 border border-white/10 rounded-xl animate-fade-in flex flex-col gap-2">
                <div className="flex justify-between items-center text-xs text-muted">
                  <span>Estimated Gas Fee ({usePaymaster ? "Paymaster Sponsored" : "Self-Paid"})</span>
                  <span className="font-semibold text-primary">{usePaymaster ? "Paid in USDC" : "Paid in ETH"}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-xl font-bold font-mono text-white">
                    {usePaymaster ? `${estimatedFee.usdc} USDC` : `${parseFloat(estimatedFee.eth).toFixed(6)} ETH`}
                  </span>
                  <span className="text-xs font-mono text-muted">
                    {usePaymaster ? `~ ${parseFloat(estimatedFee.eth).toFixed(6)} ETH` : `~ ${estimatedFee.usdc} USDC`}
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <button 
                className={`btn btn-secondary flex-1 ${(pending || isEstimating || (token !== 'UNISWAP_V3' && !receiver)) ? 'opacity-50 cursor-not-allowed' : ''}`} 
                disabled={pending || isEstimating || (token !== 'UNISWAP_V3' && !receiver)} 
                onClick={handleEstimateGas}
              >
                {isEstimating ? <div className="flex items-center justify-center gap-2"><div className="loader" style={{width:'14px',height:'14px',borderWidth:'2px'}}></div>Estimating...</div> : 'Estimate Gas'}
              </button>
              <button 
                className={`btn btn-primary ${(pending || isEstimating || (token !== 'UNISWAP_V3' && !receiver)) ? 'opacity-50 cursor-not-allowed' : ''}`} 
                disabled={pending || isEstimating || (token !== 'UNISWAP_V3' && !receiver)} 
                onClick={handleSendOp} 
                style={{ flex: 2 }}
              >
                {pending ? 'Sending Op...' : 'Sign & Execute Operation'}
              </button>
            </div>

            {userOpHashResult && (
              <div className="mt-4 p-4 rounded-xl border animate-fade-in" style={{
                background: 'rgba(139, 92, 246, 0.08)',
                borderColor: 'rgba(139, 92, 246, 0.3)',
              }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#a78bfa' }}>UserOperation Submitted</span>
                </div>
                <p className="font-mono text-xs break-all text-muted mb-3" title={userOpHashResult}>{userOpHashResult}</p>
                <p className="text-xs text-muted mb-3">Your operation is being tracked in the background. You can continue using the app.</p>
                <div className="flex items-center gap-3 mt-2">
                   <button
                     onClick={() => setCurrentView('history')}
                     className="btn btn-primary py-1.5 px-4 text-xs flex items-center justify-center gap-2 flex-1"
                   >
                     View TX Status in History →
                   </button>
                   <button
                     onClick={resetForm}
                     className="btn btn-secondary py-1.5 px-4 text-xs flex items-center justify-center gap-2 flex-1"
                   >
                     Send Another
                   </button>
                </div>
              </div>
            )}
      </div>
    </div>
  );
}