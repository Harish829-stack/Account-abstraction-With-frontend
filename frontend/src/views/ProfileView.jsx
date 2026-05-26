import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { shortenAddress, formatNum, toHex } from '../utils/helpers';
import { Copy, Wallet, CheckCircle2, ShieldAlert, RotateCcw, ArrowDownCircle } from 'lucide-react';
import { ERC20_ABI, SmartAccountABI, IEntryPointABI } from '../utils/abis';
import { sendUserOperation, getUserOpReceipt, estimateUserOperationGas } from '../utils/bundler';

export default function ProfileView() {
  const { eoaAddress, eoaETHBalance, eoaUSDCBalance, smartAccountAddress, paymasterAddress, signer, provider, env, loadEOABalances, refreshAllData, saETHBalance, saEntryPointDeposit, trackOp, setCurrentView } = useAppContext();
  const toast = useToast();

  const [copied, setCopied] = useState(false);
  const [pmAllowance, setPmAllowance] = useState('0');


  const [inputPmAllowance, setInputPmAllowance] = useState('');

  const [pendingSa, setPendingSa] = useState(false);
  const [pendingPm, setPendingPm] = useState(false);
  const [lastOpHash, setLastOpHash] = useState('');

  const usdcAddress = import.meta.env.VITE_USDC_TOKEN;

  const copyAddress = () => {
    navigator.clipboard.writeText(eoaAddress);
    setCopied(true);
    toast.success("Address copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const fetchAllowances = async () => {
    if (!signer || !usdcAddress || !smartAccountAddress) return;
    try {
      const usdc = new ethers.Contract(usdcAddress, ERC20_ABI, provider);
      if (paymasterAddress) {
        // Fetch allowance that the Smart Account gave to the Paymaster
        const allowance2 = await usdc.allowance(smartAccountAddress, paymasterAddress);
        setPmAllowance(allowance2.toString());
      }
    } catch (err) {
      console.error("Error fetching allowances:", err);
    }
  };

  useEffect(() => {
    fetchAllowances();
  }, [smartAccountAddress, paymasterAddress, signer]);



  const handleApprovePM = async (amountStr) => {
    if (!signer || !usdcAddress || !smartAccountAddress || !paymasterAddress) return;
    setPendingPm(true);
    try {
      // Robust EIP-1559 gas fee estimation for public bundlers
      let maxFeePerGas = 25000000000n; // 25 Gwei fallback
      let maxPriorityFeePerGas = 1500000000n; // 1.5 Gwei fallback
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
          maxFeePerGas = fee.maxFeePerGas || maxFeePerGas;
          maxPriorityFeePerGas = fee.maxPriorityFeePerGas || maxPriorityFeePerGas;
        } catch (e) {
          console.error("Failed to load fee fallback:", e);
        }
      }

      // EntryPoint gas prefund (maxCost) validation check
      const totalGasLimit = 150000n + 150000n + 50000n; // callGasLimit + verificationGasLimit + preVerificationGas
      const requiredPrefundWei = totalGasLimit * maxFeePerGas;
      const requiredPrefundEth = parseFloat(ethers.formatEther(requiredPrefundWei));

      const saBalanceEth = parseFloat(saETHBalance || "0");
      const saDepositEth = parseFloat(ethers.formatEther(saEntryPointDeposit || "0"));
      const totalAvailableEth = saBalanceEth + saDepositEth;

      console.log(`[Profile-Prefund-Check] Required max prefund: ${requiredPrefundEth.toFixed(5)} ETH. Available: ${totalAvailableEth.toFixed(5)} ETH.`);

      if (totalAvailableEth < requiredPrefundEth) {
        toast.error(
          `Insufficient ETH for prefund! The EntryPoint requires your Smart Account to have at least ${requiredPrefundEth.toFixed(4)} ETH to cover the worst-case gas cost of this transaction (based on current network fee of ${ethers.formatUnits(maxFeePerGas, "gwei")} Gwei). You currently have ${totalAvailableEth.toFixed(4)} ETH. Please deposit more ETH into your Smart Account first.`
        );
        setPendingPm(false);
        return;
      }

      const parsedAmount = amountStr ? ethers.parseUnits(amountStr, 6) : 0n;

      const erc20 = new ethers.Interface(ERC20_ABI);
      const inner = erc20.encodeFunctionData("approve", [paymasterAddress, parsedAmount]);

      const saInterface = new ethers.Interface(SmartAccountABI);
      const callData = saInterface.encodeFunctionData("execute", [usdcAddress, 0, inner]);

      const entryPoint = new ethers.Contract(env.ENTRY_POINT, IEntryPointABI, provider);
      const nonce = await entryPoint.getNonce(smartAccountAddress, 0);

      const userOp = {
        sender: smartAccountAddress,
        nonce: toHex(nonce),
        initCode: "0x",
        callData: callData,
        callGasLimit: toHex(150000),
        verificationGasLimit: toHex(150000),
        preVerificationGas: toHex(50000),
        maxFeePerGas: toHex(maxFeePerGas),
        maxPriorityFeePerGas: toHex(maxPriorityFeePerGas),
        paymasterAndData: "0x", // SA pays gas in ETH for its own approval
        signature: "0x"
      };

      const est = await estimateUserOperationGas(userOp);
      userOp.callGasLimit = toHex(est.callGasLimit);
      userOp.verificationGasLimit = toHex(est.verificationGasLimit);
      userOp.preVerificationGas = toHex(BigInt(est.preVerificationGas) + 5000n);

      const hash = await entryPoint.getUserOpHash(userOp);
      userOp.signature = await signer.signMessage(ethers.getBytes(hash));

      toast.info("Sending UserOp to approve Paymaster...");
      const opHash = await sendUserOperation(userOp);

      // Fire and forget — global tracker handles confirmation in background
      trackOp(opHash, 'USDC Allowance Update');
      setLastOpHash(opHash);
      toast.withAction(
        'UserOp submitted to bundler!',
        'View in History →',
        () => setCurrentView('history'),
        'info'
      );
      setInputPmAllowance('');
    } catch (err) {
      if (err.code === 4001) toast.error("Transaction rejected by user");
      else toast.error(err.reason || err.message || "Failed to approve Paymaster");
    } finally {
      setPendingPm(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      {/* EOA Details Card */}
      <div className="glass-card flex flex-col gap-4">
        <div className="flex justify-between items-center mb-0">
          <h2 className="flex items-center gap-2 text-gradient m-0"><Wallet size={24} /> EOA Profile</h2>
          <button
            className="p-1.5 rounded-full hover:bg-white/10 transition-all text-muted hover:text-white"
            onClick={async () => {
              await refreshAllData();
              await fetchAllowances();
            }}
            title="Refresh profile"
          >
            <RotateCcw size={18} />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white/5 p-4 rounded-md border border-white/10">
          <div>
            <div className="text-sm text-muted mb-1">Externally Owned Account</div>
            <div className="font-heading font-medium text-lg flex items-center gap-2">
              {shortenAddress(eoaAddress)}
              <button onClick={copyAddress} className="text-muted hover:text-white transition-colors" title="Copy Address">
                {copied ? <CheckCircle2 size={18} className="text-secondary" /> : <Copy size={18} />}
              </button>
            </div>
          </div>

          <div className="mt-4 sm:mt-0 flex flex-col gap-2 min-w-[200px]">
            <div className="flex justify-between items-center border-b border-light pb-2">
              <span className="text-sm text-muted">ETH Balance</span>
              <span className="font-bold">{formatNum(eoaETHBalance, 18)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted">USDC Balance</span>
              <span className="font-bold">{formatNum(eoaUSDCBalance, 6)}</span>
            </div>
          </div>
        </div>
      </div>


      {/* Allowances Card */}
      <div className="glass-card">
        <h2 className="flex items-center gap-2 text-gradient mb-4"><ShieldAlert size={24} /> Paymaster Approval</h2>
        <p className="text-sm text-muted mb-4">Approve the Paymaster to pull USDC from your Smart Account's balance for gas fees (Requires ETH in SA for this first UserOp).</p>

        <div className="overflow-x-auto">
          <table className="styled-table">
            <thead>
              <tr>
                <th>Spender</th>
                <th>Approved Amount</th>
                <th>Update Allowance</th>
                <th>Revoke</th>
              </tr>
            </thead>
            <tbody>
              {/* Paymaster Row */}
              <tr>
                <td>
                  <div className="font-medium">Paymaster</div>
                  {paymasterAddress ? (
                    <div className="text-xs text-muted">{shortenAddress(paymasterAddress)}</div>
                  ) : (
                    <div className="text-xs text-red-400">Not Setup</div>
                  )}
                </td>
                <td>
                  <span className="font-bold">{formatNum(pmAllowance, 6)}</span>
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      className="input-field py-1 px-2 text-sm w-24"
                      placeholder="Amount"
                      value={inputPmAllowance}
                      onChange={(e) => setInputPmAllowance(e.target.value)}
                      disabled={!paymasterAddress || pendingPm}
                    />
                    <button
                      className="btn btn-primary py-1 px-3 text-sm"
                      disabled={!paymasterAddress || !inputPmAllowance || pendingPm}
                      title={!paymasterAddress ? "Set up paymaster first" : ""}
                      onClick={() => handleApprovePM(inputPmAllowance)}
                    >
                      {pendingPm ? '...' : 'Approve'}
                    </button>
                  </div>
                </td>
                <td>
                  <button
                    className="btn btn-danger py-1 px-3 text-sm"
                    disabled={!paymasterAddress || pendingPm}
                    onClick={() => handleApprovePM("0")}
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {lastOpHash && (
          <div className="mt-4 p-4 rounded-xl border" style={{
            background: 'rgba(139, 92, 246, 0.08)',
            borderColor: 'rgba(139, 92, 246, 0.3)',
          }}>
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#a78bfa' }}>UserOperation Submitted</span>
            <p className="font-mono text-xs break-all text-muted mt-2 mb-3" title={lastOpHash}>{lastOpHash}</p>
            <p className="text-xs text-muted mb-3">Your allowance update is being tracked in the background. The UI is fully unlocked.</p>
            <button
              onClick={() => setCurrentView('history')}
              className="btn btn-primary py-1.5 px-4 text-xs flex items-center gap-2"
            >
              View TX Status in History →
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
