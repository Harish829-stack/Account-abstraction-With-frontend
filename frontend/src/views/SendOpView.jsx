import React, { useState } from 'react';
import { ethers } from 'ethers';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { SmartAccountABI, ERC20_ABI, IEntryPointABI } from '../utils/abis';
import { sendUserOperation, estimateUserOperationGas, getDynamicGasFees } from '../utils/bundler';
import { toHex, getEthPriceInUsd, formatNum, packUserOp, encodeERC7579Single } from '../utils/helpers';
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
    setCurrentView,
    setGlobalLoading,
    nativeToken,
    isAmoy
  } = useAppContext();

  const toast = useToast();

  const [receiver, setReceiver] = useState('');
  const [amount, setAmount] = useState('');
  const [token, setToken] = useState('ETH'); // ETH, USDC, or CONTRACT_CALL

  const [functionSig, setFunctionSig] = useState('');
  const [parameters, setParameters] = useState('');

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

  const normalize = (val) => {
    if (Array.isArray(val)) return val.map(normalize);
    if (typeof val === "string" && /^\d+$/.test(val)) return BigInt(val);
    return val;
  };

  const buildCalldata = () => {
    const saInterface = new ethers.Interface(SmartAccountABI);

    if (token === 'ETH') {
      const val = amount ? ethers.parseEther(amount) : 0n;
      return encodeERC7579Single(receiver, val, "0x");
    }

    if (token === 'USDC') {
      const erc20 = new ethers.Interface(ERC20_ABI);
      const amt = amount ? ethers.parseUnits(amount, 6) : 0n;
      const inner = erc20.encodeFunctionData("transfer", [receiver, amt]);
      return encodeERC7579Single(env.USDC_TOKEN, 0n, inner);
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
      return encodeERC7579Single(UNISWAP_ROUTER, amtIn, innerCallData);
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
        return encodeERC7579Single(receiver, val, inner);
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

      const { maxPriorityFeePerGas, maxFeePerGas } = await getDynamicGasFees(provider);

      const userOp = {
        sender: smartAccountAddress,
        nonce: toHex(nonce),
        factory: "0x",
        factoryData: "0x",
        callData: buildCalldata(),
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
      
      setCallGasLimit(BigInt(est.callGasLimit).toString());
      setVerificationGasLimit(BigInt(est.verificationGasLimit).toString());
      const pvg = BigInt(est.preVerificationGas).toString();
      setPreVerificationGas(pvg);

      // Compute dual-currency gas fees
      const totalGas = BigInt(est.callGasLimit) + BigInt(est.verificationGasLimit) + BigInt(pvg);
      const maxFee = totalGas * BigInt(maxFeePerGas);
      const ethFee = ethers.formatEther(maxFee);
      const ethPrice = await getEthPriceInUsd(provider, env.PRICE_FEED);
      const rawUsdcFee = parseFloat(ethFee) * ethPrice;
      const usdcFee = rawUsdcFee > 0 && rawUsdcFee < 0.01 ? "< 0.01" : rawUsdcFee.toFixed(2);
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
    setGlobalLoading(true, "Sending UserOperation...");
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
        callData: buildCalldata(),
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
      // This ensures we get real execution gas limits without paymaster simulation failing
      try {
        const est = await estimateUserOperationGas(userOp);
        userOp.callGasLimit = toHex(est.callGasLimit);
        userOp.verificationGasLimit = toHex(est.verificationGasLimit);
        userOp.preVerificationGas = toHex(est.preVerificationGas);
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
         userOp.paymasterVerificationGasLimit = toHex(300000);
         userOp.paymasterPostOpGasLimit = toHex(300000);
         userOp.paymasterData = selectedGasToken;
      }

      const hash = await entryPoint.getUserOpHash(packUserOp(userOp));
      userOp.signature = await signer.signMessage(ethers.getBytes(hash));

      const opHash = await sendUserOperation(userOp);
      toast.success("Bundler accepted the transaction!");

      // Fire and forget — global tracker handles confirmation in background
      trackOp(opHash, 'Send UserOperation');
      setUserOpHashResult(opHash);
      setPending(false);
      setGlobalLoading(false);
    } catch (err) {
      toast.error("Bundler rejected the transaction!");
      toast.error(err.reason || err.message || "Failed to execute operation");
      setPending(false);
      setGlobalLoading(false);
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
                  <option value="ETH">{nativeToken}</option>
                  <option value="USDC">USDC</option>
                  {!isAmoy && (
                    <option value="UNISWAP_V3">Uniswap V3 ({nativeToken} → USDC)</option>
                  )}
                  <option value="CONTRACT_CALL">Contract Call</option>
                </select>
              </div>
              <div className="flex flex-col gap-1 w-2/3">
                <label className="text-sm text-muted">{token === 'CONTRACT_CALL' ? `Value (${nativeToken})` : token === 'UNISWAP_V3' ? `Swap Amount (${nativeToken})` : 'Amount'}</label>
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

            <div className="flex flex-col gap-2 p-3 bg-white/5 rounded-md border border-white/5">
              <div className="flex items-center gap-3">
                <input type="checkbox" id="pmToggle" className="w-4 h-4 accent-primary" checked={usePaymaster} onChange={(e) => setUsePaymaster(e.target.checked)} />
                <label htmlFor="pmToggle" className="text-sm flex-1 cursor-pointer">Sponsor gas with Paymaster</label>
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
              <button className="btn-advanced-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>
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


      </div>
    </div>
  );
}