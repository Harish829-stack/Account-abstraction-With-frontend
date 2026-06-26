import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useAppContext } from '../context/AppContext';
import { Shield, CheckCircle, Clock, Send, Hash } from 'lucide-react';
import { MultisigABI, ERC20PaymasterABI, StakeableABI } from '../utils/abis';

export default function AdminView() {
  const { eoaAddress } = useAppContext();
  
  const [targetType, setTargetType] = useState('paymaster'); // 'paymaster' or 'factory'
  const [action, setAction] = useState('unlockStake');
  
  const [targetAddress, setTargetAddress] = useState(import.meta.env.VITE_PAYMASTER || "");
  const [newImplAddress, setNewImplAddress] = useState("");
  const [nativeValue, setNativeValue] = useState("");
  const [tokenAddress, setTokenAddress] = useState("");
  const [tokenAmount, setTokenAmount] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [currentTxValue, setCurrentTxValue] = useState("0");
  
  const [txHash, setTxHash] = useState('');
  const [isApproved, setIsApproved] = useState(false);
  const [nonce, setNonce] = useState('0');
  const [encodedData, setEncodedData] = useState('');

  const MULTISIG_ADDRESS = import.meta.env.VITE_MULTISIG_PROXY;

  useEffect(() => {
    if (targetType === 'paymaster') {
      setTargetAddress(import.meta.env.VITE_PAYMASTER || "");
      setAction('unlockStake');
    } else {
      setTargetAddress(import.meta.env.VITE_FACTORY || "");
      setAction('unlockStake');
    }
  }, [targetType]);

  useEffect(() => {
    if (eoaAddress && targetAddress && MULTISIG_ADDRESS) {
      calculateTxHash();
    }
  }, [action, eoaAddress, targetAddress, MULTISIG_ADDRESS, newImplAddress, nativeValue, tokenAddress, tokenAmount, recipientAddress]);

  const calculateTxHash = async () => {
    try {
      if (!window.ethereum) return;
      const ethersProvider = new ethers.BrowserProvider(window.ethereum);
      
      const multisig = new ethers.Contract(MULTISIG_ADDRESS, MultisigABI, ethersProvider);
      const currentNonce = await multisig.nonce();
      setNonce(currentNonce.toString());

      let data = "0x";
      let val = "0";
      
      const parsedNativeValue = nativeValue && !isNaN(Number(nativeValue)) ? ethers.parseEther(nativeValue).toString() : "0";

      if (targetType === 'paymaster') {
        const pmInterface = new ethers.Interface(ERC20PaymasterABI);
        const recipient = recipientAddress || eoaAddress;
        
        if (action === 'unlockStake') data = pmInterface.encodeFunctionData("unlockStake");
        if (action === 'withdrawStake') data = pmInterface.encodeFunctionData("withdrawStake", [recipient]);
        if (action === 'addStake') {
          data = pmInterface.encodeFunctionData("addStake", [86400]);
          val = parsedNativeValue;
        }
        if (action === 'deposit') {
          data = pmInterface.encodeFunctionData("deposit");
          val = parsedNativeValue;
        }
        if (action === 'withdrawTo') {
          const amount = tokenAmount ? ethers.parseEther(tokenAmount) : 0n;
          data = pmInterface.encodeFunctionData("withdrawTo", [recipient, amount]);
        }
        if (action === 'withdrawToken') {
          const amount = tokenAmount ? ethers.parseUnits(tokenAmount, 18) : 0n;
          if (tokenAddress && ethers.isAddress(tokenAddress)) {
            data = pmInterface.encodeFunctionData("withdrawToken", [tokenAddress, recipient, amount]);
          }
        }
      } else {
        const factoryInterface = new ethers.Interface(StakeableABI);
        const recipient = recipientAddress || eoaAddress;
        if (action === 'unlockStake') data = factoryInterface.encodeFunctionData("unlockStake");
        if (action === 'withdrawStake') data = factoryInterface.encodeFunctionData("withdrawStake", [recipient]);
        if (action === 'addStake') {
          data = factoryInterface.encodeFunctionData("addStake", [targetAddress, 86400]); // 1 day
          val = parsedNativeValue;
        }
        if (action === 'setImplementation') {
          if (newImplAddress && ethers.isAddress(newImplAddress)) {
            data = factoryInterface.encodeFunctionData("setImplementation", [newImplAddress]);
          } else {
            data = "0x";
          }
        }
      }
      
      setEncodedData(data);
      setCurrentTxValue(val);
      
      const hash = await multisig.getTransactionHash(
        targetAddress,
        val, // value
        data,
        0, // Call operation
        currentNonce
      );
      setTxHash(hash);
      
      // Check if current user has already approved
      const hasApproved = await multisig.approvedHashes(eoaAddress, hash);
      setIsApproved(hasApproved);
    } catch (error) {
      console.error("Error calculating hash:", error);
    }
  };

  const approveHash = async () => {
    try {
      const ethersProvider = new ethers.BrowserProvider(window.ethereum);
      const signer = await ethersProvider.getSigner();
      const multisig = new ethers.Contract(MULTISIG_ADDRESS, MultisigABI, signer);
      
      const tx = await multisig.approveHash(txHash);
      await tx.wait();
      setIsApproved(true);
      alert("Hash approved on-chain!");
    } catch (error) {
      console.error("Error approving hash:", error);
      alert("Failed to approve hash.");
    }
  };

  const executeTx = async () => {
    try {
      const ethersProvider = new ethers.BrowserProvider(window.ethereum);
      const signer = await ethersProvider.getSigner();
      const multisig = new ethers.Contract(MULTISIG_ADDRESS, MultisigABI, signer);

      // Automatically find which owners have approved this hash on-chain
      const owners = await multisig.getOwners();
      const approvedOwners = [];
      
      for (const owner of owners) {
        const hasApp = await multisig.approvedHashes(owner, txHash);
        if (hasApp) {
          approvedOwners.push(owner);
        }
      }

      const threshold = await multisig.threshold();
      
      if (approvedOwners.length < threshold) {
        alert(`Not enough approvals. Found ${approvedOwners.length}, but need ${threshold}. Another owner must connect and click 'Approve Hash On-Chain'.`);
        return;
      }

      // We only need exactly 'threshold' number of signatures
      const signers = approvedOwners.slice(0, Number(threshold)).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
      
      // Build dummy signatures with SigType.Approved (0x02)
      let signatures = "0x";
      for (const owner of signers) {
        const r = ethers.zeroPadValue(owner, 32).substring(2);
        const s = "0000000000000000000000000000000000000000000000000000000000000000";
        const v = "02";
        signatures += r + s + v;
      }

      const tx = await multisig.execTransaction(
        targetAddress,
        currentTxValue,
        encodedData,
        0,
        signatures,
        true,
        { value: currentTxValue } // Pass the ETH directly from the executor's wallet!
      );
      await tx.wait();
      alert("Transaction Executed Successfully!");
      calculateTxHash(); // Refresh
    } catch (error) {
      console.error("Error executing tx:", error);
      alert("Execution failed. See console for details.");
    }
  };

  if (!MULTISIG_ADDRESS) {
    return (
      <div className="glass-card p-6 mt-6 text-center">
        <Shield size={48} className="mx-auto mb-4 opacity-50 text-purple-400" />
        <h2 className="text-xl font-bold mb-2">Multisig Not Configured</h2>
        <p className="text-gray-500">Please add <code className="bg-gray-100 px-2 py-1 rounded">VITE_MULTISIG_PROXY</code> to your frontend .env file.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="icon-box bg-purple-500/20 text-purple-600">
            <Shield size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold m-0 text-gradient">Admin Control Panel</h2>
            <p className="text-sm text-gray-500">Manage protocol contracts via 2-of-3 Multisig</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="input-group">
              <label>Target Contract</label>
              <select value={targetType} onChange={(e) => setTargetType(e.target.value)} className="w-full p-3 rounded-xl border border-gray-200 bg-white/50">
                <option value="paymaster">ERC20 Paymaster</option>
                <option value="factory">K1 Validator Factory</option>
              </select>
            </div>

            <div className="input-group">
              <label>Target Address</label>
              <input 
                type="text" 
                value={targetAddress}
                onChange={(e) => setTargetAddress(e.target.value)}
                className="w-full p-3 rounded-xl border border-gray-200 bg-white/50 font-mono text-sm"
              />
            </div>

            <div className="input-group">
              <label>Action</label>
              <select value={action} onChange={(e) => setAction(e.target.value)} className="w-full p-3 rounded-xl border border-gray-200 bg-white/50">
                <option value="unlockStake">Unlock Stake (7 Days Delay)</option>
                <option value="withdrawStake">Withdraw Stake (After Delay)</option>
                {targetType === 'paymaster' && (
                  <>
                    <option value="addStake">Add Stake</option>
                    <option value="deposit">Deposit to EntryPoint</option>
                    <option value="withdrawTo">Withdraw Deposit (ETH)</option>
                    <option value="withdrawToken">Withdraw Collected ERC20 Tokens</option>
                  </>
                )}
                {targetType === 'factory' && <option value="addStake">Add Stake</option>}
                {targetType === 'factory' && <option value="setImplementation">Set Implementation</option>}
              </select>
            </div>

            {(action === 'addStake' || action === 'deposit') && (
              <div className="input-group animate-fade-in">
                <label>Native ETH Value (to send)</label>
                <input 
                  type="number" 
                  value={nativeValue}
                  onChange={(e) => setNativeValue(e.target.value)}
                  placeholder="0.1"
                  className="w-full p-3 rounded-xl border border-gray-200 bg-white/50 text-sm"
                />
              </div>
            )}

            {(action === 'withdrawTo' || action === 'withdrawToken' || action === 'withdrawStake') && (
              <div className="input-group animate-fade-in">
                <label>Recipient Address (defaults to your address)</label>
                <input 
                  type="text" 
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  placeholder={eoaAddress}
                  className="w-full p-3 rounded-xl border border-gray-200 bg-white/50 font-mono text-sm"
                />
              </div>
            )}

            {(action === 'withdrawTo' || action === 'withdrawToken') && (
              <div className="input-group animate-fade-in">
                <label>Amount (Assuming 18 decimals)</label>
                <input 
                  type="number" 
                  value={tokenAmount}
                  onChange={(e) => setTokenAmount(e.target.value)}
                  placeholder="100"
                  className="w-full p-3 rounded-xl border border-gray-200 bg-white/50 text-sm"
                />
              </div>
            )}

            {action === 'withdrawToken' && (
              <div className="input-group animate-fade-in">
                <label>ERC20 Token Address</label>
                <input 
                  type="text" 
                  value={tokenAddress}
                  onChange={(e) => setTokenAddress(e.target.value)}
                  placeholder="0x..."
                  className="w-full p-3 rounded-xl border border-gray-200 bg-white/50 font-mono text-sm"
                />
              </div>
            )}

            {targetType === 'factory' && action === 'setImplementation' && (
              <div className="input-group">
                <label>New Implementation Address</label>
                <input 
                  type="text" 
                  value={newImplAddress}
                  onChange={(e) => setNewImplAddress(e.target.value)}
                  placeholder="0x..."
                  className="w-full p-3 rounded-xl border border-gray-200 bg-white/50 font-mono text-sm"
                />
              </div>
            )}
          </div>

          <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100 space-y-4">
            <h3 className="font-bold flex items-center gap-2 text-gray-700"><Hash size={18}/> Transaction Details</h3>
            
            <div className="text-sm">
              <p className="text-gray-500 mb-1">Nonce: <span className="font-mono text-black">{nonce}</span></p>
              <p className="text-gray-500 mb-1">Data: <span className="font-mono text-xs break-all bg-gray-100 p-1 rounded text-black">{encodedData}</span></p>
            </div>

            <div className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
              <p className="text-xs font-bold text-gray-500 mb-2">Tx Hash (to approve):</p>
              <code className="text-xs text-purple-600 break-all">{txHash || 'Loading...'}</code>
            </div>

            <div className="flex flex-col gap-3 pt-4">
              {isApproved ? (
                <div className="flex items-center gap-2 text-green-600 font-medium p-3 bg-green-50 border border-green-100 rounded-xl">
                  <CheckCircle size={18} /> You have approved this hash.
                </div>
              ) : (
                <button 
                  onClick={approveHash}
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
                >
                  <CheckCircle size={18} /> 1. Approve Hash On-Chain
                </button>
              )}

              <button 
                onClick={executeTx}
                className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20"
              >
                <Send size={18} /> 2. Execute Transaction
              </button>
              
              <p className="text-xs text-center text-gray-500 mt-2">
                Execution requires 2 approved owners.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
