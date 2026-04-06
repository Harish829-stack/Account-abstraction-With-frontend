import React, { useState, useEffect } from 'react';
import { ethers, getAddress } from 'ethers';
import { useAppContext } from '../context/AppContext';
import { shortenAddress, formatNum } from '../utils/helpers';
import { SmartAccountFactoryABI, SmartAccountABI } from '../utils/abis';
import { PlusCircle, Link as LinkIcon, AlertTriangle, ArrowRight, Shield, Download, RotateCcw } from 'lucide-react';

export default function AccountSetupView() {
  const { 
    eoaAddress, 
    signer, 
    provider,
    smartAccountAddress, 
    setSmartAccountAddress,
    saETHBalance,
    saUSDCBalance,
    saEntryPointDeposit,
    saOwner,
    loadSmartAccountDetails,
    refreshAllData,
    env
  } = useAppContext();

  // Option A State
  const [salt, setSalt] = useState('');
  const [predictedAddress, setPredictedAddress] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [predicting, setPredicting] = useState(false);

  // Option B State
  const [connectAddress, setConnectAddress] = useState('');
  const [connecting, setConnecting] = useState(false);

  // Actions State
  const [depositSAmount, setDepositSAmount] = useState('');
  const [pendingSDeposit, setPendingSDeposit] = useState(false);

  const [depositEPAmount, setDepositEPAmount] = useState('');
  const [pendingEPDeposit, setPendingEPDeposit] = useState(false);

  const [withdrawEPTo, setWithdrawEPTo] = useState('');
  const [withdrawEPAmount, setWithdrawEPAmount] = useState('');
  const [pendingEPWithdraw, setPendingEPWithdraw] = useState(false);

  const [newOwner, setNewOwner] = useState('');
  const [pendingOwnerXfer, setPendingOwnerXfer] = useState(false);

  useEffect(() => {
    let active = true;
    const predictAddress = async () => {
      if (!salt || !eoaAddress || !provider) {
        if (active) setPredictedAddress('');
        return;
      }
      setPredicting(true);
      try {
        const factory = new ethers.Contract(env.FACTORY, SmartAccountFactoryABI, provider);
        const predicted = await factory.getFunction("getAddress")(eoaAddress, salt);
        if (active) setPredictedAddress(predicted);
      } catch (err) {
        console.error("Failed to predict:", err);
      } finally {
        if (active) setPredicting(false);
      }
    };
    
    // Add small debounce
    const timeout = setTimeout(predictAddress, 300);
    return () => { 
      active = false; 
      clearTimeout(timeout);
    };
  }, [salt, eoaAddress, provider, env.FACTORY]);

  const handleDeploy = async () => {
    if (!salt || !eoaAddress || !signer) return;
    setDeploying(true);
    try {
      const factory = new ethers.Contract(env.FACTORY, SmartAccountFactoryABI, signer);
      const tx = await factory.createAccount(eoaAddress, salt);
      await tx.wait();
      const deployedAddress = await factory.getFunction("getAddress")(eoaAddress, salt);
      setSmartAccountAddress(deployedAddress);
      alert("Smart Account deployed successfully!");
    } catch (err) {
      if (err.code === 4001) alert("Transaction rejected by user");
      else alert(err.reason || err.message || "Failed to deploy");
    } finally {
      setDeploying(false);
    }
  };

  const handleConnect = async () => {
    if (!connectAddress || !ethers.isAddress(connectAddress) || !provider) return;
    setConnecting(true);
    try {
      const code = await provider.getCode(connectAddress);
      if (code === '0x') {
        alert("No contract found at this address!");
      } else {
         setSmartAccountAddress(connectAddress);
         alert("Smart Account connected!");
         setConnectAddress('');
      }
    } catch (err) {
       alert("Error connecting: " + err.message);
    } finally {
       setConnecting(false);
    }
  };

  const disconnectSA = () => setSmartAccountAddress(null);

  // Action Handlers
  const handleDepositSA = async () => {
    if (!depositSAmount || !smartAccountAddress || !signer) return;
    setPendingSDeposit(true);
    try {
      const tx = await signer.sendTransaction({
        to: smartAccountAddress,
        value: ethers.parseEther(depositSAmount)
      });
      await tx.wait();
      setDepositSAmount('');
      await refreshAllData();
      alert("ETH deposited to Smart Account!");
    } catch (err) {
      if (err.code === 4001) alert("Transaction rejected by user");
      else alert(err.reason || err.message || "Failed to deposit");
    } finally {
      setPendingSDeposit(false);
    }
  };

  const handleDepositEP = async () => {
    if (!depositEPAmount || !smartAccountAddress || !signer) return;
    setPendingEPDeposit(true);
    try {
      const saContract = new ethers.Contract(smartAccountAddress, SmartAccountABI, signer);
      const tx = await saContract.addDeposit({ value: ethers.parseEther(depositEPAmount) });
      await tx.wait();
      setDepositEPAmount('');
      await refreshAllData();
      alert("ETH deposited to EntryPoint!");
    } catch (err) {
      if (err.code === 4001) alert("Transaction rejected by user");
       else alert(err.reason || err.message || "Failed to deposit to EntryPoint");
    } finally {
      setPendingEPDeposit(false);
    }
  };

  const handleWithdrawEP = async () => {
    if (!withdrawEPAmount || !withdrawEPTo || !smartAccountAddress || !signer) return;
    setPendingEPWithdraw(true);
    try {
      const saContract = new ethers.Contract(smartAccountAddress, SmartAccountABI, signer);
      const tx = await saContract.withdrawDepositTo(withdrawEPTo, ethers.parseEther(withdrawEPAmount));
      await tx.wait();
      setWithdrawEPAmount('');
      setWithdrawEPTo('');
      await refreshAllData();
      alert("Deposit successfully withdrawn from EntryPoint!");
    } catch (err) {
      if (err.code === 4001) alert("Transaction rejected by user");
       else alert(err.reason || err.message || "Failed to withdraw");
    } finally {
       setPendingEPWithdraw(false);
    }
  };

  const handleTransferOwnership = async () => {
    if (!newOwner || !ethers.isAddress(newOwner) || !smartAccountAddress || !signer) return;
    if (!window.confirm("Are you sure you want to transfer ownership? You will lose control if you don't own the new address.")) return;
    
    setPendingOwnerXfer(true);
    try {
      const saContract = new ethers.Contract(smartAccountAddress, SmartAccountABI, signer);
      const tx = await saContract.changeOwner(newOwner);
      await tx.wait();
      setNewOwner('');
      await refreshAllData();
      alert("Ownership transferred successfully!");
    } catch (err) {
       if (err.code === 4001) alert("Transaction rejected by user");
       else alert(err.reason || err.message || "Failed to transfer ownership");
    } finally {
       setPendingOwnerXfer(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
      
      {/* Banner if connected */}
      {smartAccountAddress && (
        <div className="glass-card flex justify-between items-center py-4 bg-primary/5 border-primary/30">
           <div className="flex items-center gap-3">
             <Shield className="text-primary" size={24} />
             <div>
               <h3 className="text-lg font-bold m-0 leading-tight">Smart Account Active</h3>
               <span className="text-sm text-muted">{smartAccountAddress}</span>
             </div>
           </div>
           <button className="btn btn-secondary text-sm py-1" onClick={disconnectSA}>
             Disconnect
           </button>
        </div>
      )}

      {/* Connection / Creation View */}
      {!smartAccountAddress && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Option A */}
          <div className="glass-card flex flex-col gap-4">
            <h3 className="flex items-center gap-2 text-gradient"><PlusCircle size={20} /> Deploy New properly</h3>
            
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted">Owner (Your EOA)</label>
              <input type="text" className="input-field" disabled value={eoaAddress || ''} />
            </div>

            <div className="flex flex-col gap-1">
               <label className="text-sm text-muted">Salt (Any Integer)</label>
               <input 
                 type="number" 
                 className="input-field" 
                 placeholder="e.g. 123456" 
                 value={salt} 
                 onChange={(e) => setSalt(e.target.value)} 
               />
            </div>

            <div className="flex items-center gap-2 mt-2">
               <button 
                  className="btn btn-primary w-full" 
                  onClick={handleDeploy} 
                  disabled={deploying || !salt}
               >
                 {deploying ? "Deploying..." : "Deploy"}
               </button>
            </div>

            {predictedAddress && (
               <div className="mt-2 p-3 bg-white/5 border border-white/10 rounded-md text-sm text-center">
                  Predicted: <span className="font-mono text-primary">{predictedAddress}</span>
               </div>
            )}
          </div>

          {/* Option B */}
          <div className="glass-card flex flex-col gap-4">
            <h3 className="flex items-center gap-2 text-gradient"><LinkIcon size={20} /> Connect Existing</h3>
            
            <div className="flex flex-col gap-1 flex-1">
               <label className="text-sm text-muted">Smart Account Address</label>
               <input 
                 type="text" 
                 className="input-field" 
                 placeholder="0x..." 
                 value={connectAddress} 
                 onChange={(e) => setConnectAddress(e.target.value)} 
               />
               <p className="text-xs text-muted mt-2">Connecting verifies that a contract is deployed at this address.</p>
            </div>

            <div className="mt-auto">
               <button 
                  className="btn btn-primary w-full"
                  onClick={handleConnect}
                  disabled={connecting || !connectAddress}
               >
                 {connecting ? "Verifying..." : "Connect"}
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail / Dashboard View */}
      {smartAccountAddress && (
        <div className="grid grid-cols-1 gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             {/* Balances */}
             <div className="glass-card">
               <div className="flex justify-between items-center mb-4">
                 <h3 className="m-0">Balances</h3>
                 <button 
                   className="p-1.5 rounded-full hover:bg-white/10 transition-all text-muted hover:text-white"
                   onClick={refreshAllData}
                   title="Refresh balances"
                 >
                   <RotateCcw size={18} />
                 </button>
               </div>
               <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/5">
                    <span className="text-muted">Smart Account ETH</span>
                    <span className="font-bold text-lg">{formatNum(saETHBalance, 18)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/5">
                    <span className="text-muted">Smart Account USDC</span>
                    <span className="font-bold text-lg text-secondary">{formatNum(saUSDCBalance, 6)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white/5 rounded-md border border-white/5 disabled">
                    <span className="text-muted">EntryPoint Deposit</span>
                    <span className="font-bold text-lg">{formatNum(saEntryPointDeposit, 18)}</span>
                  </div>
               </div>
             </div>

             {/* Fund Actions */}
             <div className="glass-card flex flex-col gap-4">
               <h3 className="mb-2">Fund Account</h3>

               <div className="flex items-center gap-2">
                 <input 
                    type="number" 
                    className="input-field flex-1" 
                    placeholder="ETH Amount" 
                    value={depositSAmount}
                    onChange={(e) => setDepositSAmount(e.target.value)}
                 />
                 <button 
                   className="btn btn-secondary whitespace-nowrap"
                   onClick={handleDepositSA}
                   disabled={pendingSDeposit || !depositSAmount}
                 >
                   {pendingSDeposit ? "..." : "Deposit to SA"}
                 </button>
               </div>

               <div className="flex items-center gap-2 mt-2">
                 <input 
                    type="number" 
                    className="input-field flex-1" 
                    placeholder="ETH Amount" 
                    value={depositEPAmount}
                    onChange={(e) => setDepositEPAmount(e.target.value)}
                 />
                 <button 
                   className="btn btn-secondary whitespace-nowrap"
                   onClick={handleDepositEP}
                   disabled={pendingEPDeposit || !depositEPAmount}
                 >
                   {pendingEPDeposit ? "..." : "Deposit to EntryPoint"}
                 </button>
               </div>
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Withdraw from EntryPoint */}
            <div className="glass-card flex flex-col gap-4">
               <h3 className="flex items-center gap-2 text-gradient"><Download size={20} /> Withdraw from EntryPoint</h3>
               <p className="text-sm text-muted">Withdraw previously deposited ETH from the EntryPoint back to any destination.</p>
               <input 
                 type="text" 
                 className="input-field" 
                 placeholder="Withdraw to Address (0x...)" 
                 value={withdrawEPTo}
                 onChange={(e) => setWithdrawEPTo(e.target.value)}
               />
               <div className="flex items-center gap-2">
                 <input 
                   type="number" 
                   className="input-field flex-1" 
                   placeholder="Amount (ETH)" 
                   value={withdrawEPAmount}
                   onChange={(e) => setWithdrawEPAmount(e.target.value)}
                 />
                 <button 
                   className="btn btn-primary whitespace-nowrap"
                   onClick={handleWithdrawEP}
                   disabled={pendingEPWithdraw || !withdrawEPAmount || !withdrawEPTo}
                 >
                   {pendingEPWithdraw ? "Withdrawing..." : "Withdraw"}
                 </button>
               </div>
            </div>

            {/* Ownership (Danger Zone) */}
            <div className="glass-card border border-red-500/30 bg-red-500/5">
                <h3 className="flex items-center gap-2 text-danger mb-4"><AlertTriangle size={20} /> Danger Zone</h3>
                
                <div className="mb-4">
                  <div className="text-sm text-muted mb-1">Current Owner:</div>
                  <div className="font-mono text-sm break-all">{saOwner}</div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm text-muted">Transfer Ownership</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="text" 
                      className="input-field flex-1" 
                      placeholder="New Owner (0x...)" 
                      value={newOwner}
                      onChange={(e) => setNewOwner(e.target.value)}
                    />
                    <button 
                      className="btn btn-danger whitespace-nowrap"
                      onClick={handleTransferOwnership}
                      disabled={pendingOwnerXfer || !newOwner}
                    >
                      {pendingOwnerXfer ? "Updating..." : "Transfer"}
                    </button>
                  </div>
                </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
