import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { shortenAddress, formatNum } from '../utils/helpers';
import { Copy, Wallet, CheckCircle2, ShieldAlert, RotateCcw } from 'lucide-react';
import { ERC20_ABI } from '../utils/abis';

export default function ProfileView() {
  const { eoaAddress, eoaETHBalance, eoaUSDCBalance, smartAccountAddress, paymasterAddress, signer, provider, env, loadEOABalances, refreshAllData } = useAppContext();
  const toast = useToast();
  
  const [copied, setCopied] = useState(false);
  const [saAllowance, setSaAllowance] = useState('0');
  const [pmAllowance, setPmAllowance] = useState('0');
  
  const [inputSaAllowance, setInputSaAllowance] = useState('');
  const [inputPmAllowance, setInputPmAllowance] = useState('');
  
  const [pendingSa, setPendingSa] = useState(false);
  const [pendingPm, setPendingPm] = useState(false);


  const usdcAddress = import.meta.env.VITE_USDC_TOKEN;

  const copyAddress = () => {
    navigator.clipboard.writeText(eoaAddress);
    setCopied(true);
    toast.success("Address copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const fetchAllowances = async () => {
    if (!signer || !usdcAddress || !eoaAddress) return;
    try {
      const usdc = new ethers.Contract(usdcAddress, ERC20_ABI, signer);
      if (smartAccountAddress) {
        const allowance1 = await usdc.allowance(eoaAddress, smartAccountAddress);
        setSaAllowance(allowance1.toString());
      }
      if (paymasterAddress) {
        const allowance2 = await usdc.allowance(eoaAddress, paymasterAddress);
        setPmAllowance(allowance2.toString());
      }
    } catch (err) {
      console.error("Error fetching allowances:", err);
    }
  };


  useEffect(() => {
    fetchAllowances();
  }, [smartAccountAddress, paymasterAddress, eoaAddress, signer]);


  const handleApprove = async (spenderType, amountStr) => {
    if (!signer || !usdcAddress) return;
    const isSa = spenderType === 'SA';
    const setPending = isSa ? setPendingSa : setPendingPm;
    const spenderParams = isSa ? smartAccountAddress : paymasterAddress;

    setPending(true);
    try {
      const usdc = new ethers.Contract(usdcAddress, ERC20_ABI, signer);
      
      // Amount provided is in USDC (6 decimals). 
      // If amountStr is empty/invalid, default to 0. 0 means Revoke exactly.
      const parsedAmount = amountStr ? ethers.parseUnits(amountStr, 6) : 0n;
      
      const tx = await usdc.approve(spenderParams, parsedAmount);
      await tx.wait();
      
      await fetchAllowances();
      if(eoaAddress) {
         await loadEOABalances(eoaAddress, signer.provider);
      }
      // Reset input
      if(isSa) setInputSaAllowance(''); else setInputPmAllowance('');
      toast.success("Approval transaction successful!");
    } catch (err) {
      if (err.code === 4001) toast.error("Transaction rejected by user");
      else toast.error(err.reason || err.message || "Failed to approve");
    } finally {
      setPending(false);
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
        <h2 className="flex items-center gap-2 text-gradient mb-4"><ShieldAlert size={24} /> Token Allowances (USDC)</h2>
        <p className="text-sm text-muted mb-4">Manage the amounts your Smart Account and Paymaster are allowed to pull from your EOA.</p>

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
              {/* Smart Account Row */}
              <tr>
                <td>
                  <div className="font-medium">Smart Account</div>
                  {smartAccountAddress ? (
                    <div className="text-xs text-muted">{shortenAddress(smartAccountAddress)}</div>
                  ) : (
                    <div className="text-xs text-red-400">Not Setup</div>
                  )}
                </td>
                <td>
                  <span className="font-bold">{formatNum(saAllowance, 6)}</span>
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number" 
                      className="input-field py-1 px-2 text-sm w-24" 
                      placeholder="Amount" 
                      value={inputSaAllowance}
                      onChange={(e) => setInputSaAllowance(e.target.value)}
                      disabled={!smartAccountAddress || pendingSa}
                    />
                    <button 
                      className="btn btn-primary py-1 px-3 text-sm" 
                      disabled={!smartAccountAddress || !inputSaAllowance || pendingSa}
                      title={!smartAccountAddress ? "Set up smart account first" : ""}
                      onClick={() => handleApprove("SA", inputSaAllowance)}
                    >
                      {pendingSa ? '...' : 'Update'}
                    </button>
                  </div>
                </td>
                <td>
                  <button 
                    className="btn btn-danger py-1 px-3 text-sm" 
                    disabled={!smartAccountAddress || pendingSa}
                    onClick={() => handleApprove("SA", "0")}
                  >
                    Revoke
                  </button>
                </td>
              </tr>

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
                      onClick={() => handleApprove("PM", inputPmAllowance)}
                    >
                      {pendingPm ? '...' : 'Update'}
                    </button>
                  </div>
                </td>
                <td>
                  <button 
                    className="btn btn-danger py-1 px-3 text-sm" 
                    disabled={!paymasterAddress || pendingPm}
                    onClick={() => handleApprove("PM", "0")}
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>


    </div>
  );
}
