import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useAppContext } from '../context/AppContext';
import { IEntryPointABI, ERC20_ABI } from '../utils/abis';
import { shortenAddress, toHex, packUserOp, encodeERC7579Single } from '../utils/helpers';
import { sendUserOperation, estimateUserOperationGas, getDynamicGasFees, applyBufferedGasEstimate } from '../utils/bundler';
import { useToast } from '../context/ToastContext';
import { DollarSign } from 'lucide-react';

export default function PaymasterView() {
  const { 
    provider, signer, smartAccountAddress, paymasterAddress, env,
    saETHBalance, saEntryPointDeposit,
    trackOp, setCurrentView, setGlobalLoading, chainId, nativeToken, refreshTrigger
  } = useAppContext();
  const toast = useToast();

  const [approveAmount, setApproveAmount] = useState('10');
  const [approving, setApproving] = useState(false);
  const [currentAllowance, setCurrentAllowance] = useState('0.00');

  useEffect(() => {
    let active = true;
    const fetchAllowance = async () => {
      if (!provider || !smartAccountAddress || !paymasterAddress || !env.USDC_TOKEN) return;
      try {
        const usdc = new ethers.Contract(env.USDC_TOKEN, ["function allowance(address, address) view returns (uint256)"], provider);
        const allowance = await usdc.allowance(smartAccountAddress, paymasterAddress);
        if (active) setCurrentAllowance(ethers.formatUnits(allowance, 6));
      } catch (err) {
        console.warn("Failed to fetch USDC allowance:", err);
      }
    };
    fetchAllowance();
    return () => { active = false; };
  }, [provider, smartAccountAddress, paymasterAddress, env.USDC_TOKEN, refreshTrigger]);

  const handleApprovePaymaster = async () => {
    const targetToken = env.USDC_TOKEN;
    if (!smartAccountAddress || !approveAmount || !signer || !paymasterAddress || !targetToken) {
      toast.error("Missing inputs: Smart Account, Paymaster, or USDC Token address.");
      return;
    }
    setApproving(true);
    setGlobalLoading(true, "Approving Paymaster via Smart Account...");
    try {
      const { maxPriorityFeePerGas, maxFeePerGas } = await getDynamicGasFees(provider, chainId);

      const totalGasLimit = 150000n + 150000n + 50000n;
      const requiredPrefundWei = totalGasLimit * maxFeePerGas;
      const requiredPrefundEth = parseFloat(ethers.formatEther(requiredPrefundWei));

      const saBalanceEth = parseFloat(ethers.formatEther(saETHBalance || "0"));
      const saDepositEth = parseFloat(ethers.formatEther(saEntryPointDeposit || "0"));
      const totalAvailableEth = saBalanceEth + saDepositEth;

      if (totalAvailableEth < requiredPrefundEth) {
        toast.error(
          `Insufficient ${nativeToken} for prefund! The EntryPoint requires your Smart Account to have at least ${requiredPrefundEth.toFixed(4)} ${nativeToken} to cover the worst-case gas cost of this transaction. You currently have ${totalAvailableEth.toFixed(4)} ${nativeToken} total (Balance + Deposit). Please deposit more ${nativeToken} into your Smart Account first.`
        );
        setApproving(false);
        setGlobalLoading(false);
        return;
      }

      const parsedAmount = ethers.parseUnits(approveAmount, 6); // USDC uses 6 decimals
      
      const erc20 = new ethers.Interface(ERC20_ABI);
      const inner = erc20.encodeFunctionData("approve", [paymasterAddress, parsedAmount]);
      
      const callData = encodeERC7579Single(targetToken, 0n, inner);

      const entryPoint = new ethers.Contract(env.ENTRY_POINT, IEntryPointABI, provider);
      const nonce = await entryPoint.getNonce(smartAccountAddress, 0);

      const userOp = {
        sender: smartAccountAddress,
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
        signature: "0x"
      };

      try {
        const est = await estimateUserOperationGas(userOp, chainId);
        applyBufferedGasEstimate(userOp, est);
      } catch (err) {
        console.warn("Estimation failed, using defaults", err);
        userOp.callGasLimit = toHex(150000);
        userOp.verificationGasLimit = toHex(150000);
        userOp.preVerificationGas = toHex(50000);
      }

      const hash = await entryPoint.getUserOpHash(packUserOp(userOp));
      userOp.signature = await signer.signMessage(ethers.getBytes(hash));

      toast.info("Sending UserOp to approve Gas Sponsorship...");
      const opHash = await sendUserOperation(userOp, chainId);

      trackOp(opHash, 'USDC Gas Sponsorship Approval', { calldata: userOp.callData });
      toast.withAction(
        'UserOp submitted to bundler!',
        'View in History →',
        () => setCurrentView('history'),
        'info'
      );
    } catch (err) {
      if (err.code === 4001) toast.error("Transaction rejected by user");
      else toast.error(err.reason || err.message || "Failed to approve Gas Sponsorship");
    } finally {
      setApproving(false);
      setGlobalLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1720px] mx-auto h-[calc(100vh-140px)] overflow-y-auto pb-10 px-4 pt-6">
      <div className="glass-card w-full max-w-[1720px] mx-auto animate-fade-in border-stone-300 shadow-md">
        <h3 className="mb-2 flex items-center gap-2 text-secondary text-2xl font-bold"><DollarSign size={28} /> Gas Sponsorship</h3>
        <div className="bg-secondary/5 border border-secondary/10 p-5 rounded-lg mb-6">
           <p className="text-sm text-muted mb-0 leading-relaxed">
             Enable <b>Gas Sponsorship</b> to pay for transaction fees using <b>USDC</b> instead of native {nativeToken}. 
             You simply need to grant an allowance to the Paymaster contract, which will automatically deduct the required USDC for your gasless transactions.
           </p>
        </div>
        
        <div className="flex flex-col gap-4 p-6 border border-white/5 bg-white/5 rounded-xl shadow-sm">
          <div className="flex justify-between items-center bg-secondary/10 px-4 py-3 rounded-lg border border-secondary/20 mb-2">
             <span className="text-sm font-semibold text-secondary/90">Remaining Sponsored Gas</span>
             <span className="text-lg font-bold text-gradient-secondary">{Number(currentAllowance).toFixed(2)} USDC</span>
          </div>

          <div>
            <label className="text-sm text-muted mb-2 block font-semibold">Update USDC Allowance</label>
            <div className="relative">
              <input 
                type="number" 
                className="input-field w-full py-3 pl-4 pr-16 text-lg font-bold" 
                placeholder="10.00" 
                value={approveAmount} 
                onChange={e=>setApproveAmount(e.target.value)} 
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-muted">USDC</span>
            </div>
            <p className="text-xs text-muted mt-3">This is the maximum amount of USDC the Paymaster can use to sponsor your transaction fees over time.</p>
          </div>
          <button className={`btn btn-primary w-full mt-2 py-3 text-base font-bold ${approving ? 'opacity-50 cursor-not-allowed' : ''}`} onClick={handleApprovePaymaster} disabled={approving || !approveAmount}>
            {approving ? "Approving USDC..." : "Approve Gas Sponsorship"}
          </button>
        </div>
      </div>
    </div>
  );
}
