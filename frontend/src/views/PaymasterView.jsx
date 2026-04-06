import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useAppContext } from '../context/AppContext';
import { ERC20PaymasterABI, IEntryPointABI, ERC20_ABI, SmartAccountABI } from '../utils/abis';
import pmArtifact from '../utils/ERC20Paymaster.json';
import { shortenAddress, formatNum } from '../utils/helpers';
import { DollarSign, ShieldAlert, ArrowDownCircle, ArrowUpCircle, Lock, Unlock, PlayCircle, CheckCircle, RotateCcw } from 'lucide-react';

export default function PaymasterView() {
  const { 
    provider, signer, eoaAddress, smartAccountAddress, paymasterAddress, setPaymasterAddress, refreshAllData, env,
    pmETHBalance, pmUSDCBalance, pmDeposit, pmStake, pmUnstakeDelay, pmTokenSymbol, pmTokenDecimals, loadPaymasterDetails
  } = useAppContext();

  // Deploy States
  const [dEntryPoint, setDEntryPoint] = useState(env.ENTRY_POINT || '');
  const [dToken, setDToken] = useState(env.USDC_TOKEN || '');
  const [dPriceFeed, setDPriceFeed] = useState(env.PRICE_FEED || '');
  const [deploying, setDeploying] = useState(false);

  // Connect States
  const [connectPmAddress, setConnectPmAddress] = useState('');
  const [connecting, setConnecting] = useState(false);

  // Fund States
  const [depositAmount, setDepositAmount] = useState('');
  const [stakeAmount, setStakeAmount] = useState('');
  const [unstakeDelay, setUnstakeDelay] = useState('86400');
  const [funding, setFunding] = useState(false);

  // Withdraw / Unstake States
  const [wEthAddress, setWEthAddress] = useState('');
  const [wEthAmount, setWEthAmount] = useState('');
  const [wUsdcAddress, setWUsdcAddress] = useState('');
  const [wUsdcAmount, setWUsdcAmount] = useState('');
  const [wStakeAddress, setWStakeAddress] = useState('');
  const [unlockedState, setUnlockedState] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  // Approve State
  const [approveAmount, setApproveAmount] = useState('');
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    if (paymasterAddress && dEntryPoint && dToken && provider) {
      loadPaymasterDetails(paymasterAddress, provider);
    }
  }, [paymasterAddress, dEntryPoint, dToken, provider]);

  const handleDeploy = async () => {
    if (!signer || !dEntryPoint || !dToken || !dPriceFeed) return;
    setDeploying(true);
    try {
      const pmFactory = new ethers.ContractFactory(pmArtifact.abi, pmArtifact.bytecode, signer);
      
      const pmContract = await pmFactory.deploy(
         dEntryPoint,
         dToken,
         dPriceFeed
      );
      
      await pmContract.waitForDeployment();
      const deployedAddress = await pmContract.getAddress();
      setPaymasterAddress(deployedAddress);
      alert(`Paymaster successfully deployed at: ${deployedAddress}`);
    } catch (err) {
      if (err.code === 4001) alert("Transaction rejected by user");
      else alert(err.reason || err.message || "Deployment failed");
    } finally {
      setDeploying(false);
    }
  };

  const handleConnectPaymaster = async () => {
    if (!connectPmAddress || !ethers.isAddress(connectPmAddress)) {
      alert("Invalid Address format");
      return;
    }
    setConnecting(true);
    try {
      const code = await provider.getCode(connectPmAddress);
      if (code === "0x") {
        alert("No contract deployed at this address!");
        return;
      }
      setPaymasterAddress(connectPmAddress);
      alert(`Paymaster successfully connected at ${connectPmAddress}`);
    } catch(err) {
      alert("Error connecting: " + err.message);
    } finally {
      setConnecting(false);
    }
  };

  const executePmAction = async (actionFn, actionName) => {
    if (!signer || !paymasterAddress) return;
    setFunding(true); setWithdrawing(true);
    try {
       const pmContract = new ethers.Contract(paymasterAddress, ERC20PaymasterABI, signer);
       const tx = await actionFn(pmContract);
       await tx.wait();
       await refreshAllData();
       alert(`${actionName} completed successfully!`);
    } catch (err) {
       if (err.code === 4001) alert("Transaction rejected by user");
       else alert(err.reason || err.message || `${actionName} failed`);
    } finally {
       setFunding(false); setWithdrawing(false);
    }
  };

  const handleDeposit = () => executePmAction(
    pm => pm.deposit({ value: ethers.parseEther(depositAmount) }), "Deposit ETH"
  );

  const handleStake = () => executePmAction(
    pm => pm.addStake(unstakeDelay, { value: ethers.parseEther(stakeAmount) }), "Add Stake"
  );

  const handleWithdrawEth = () => executePmAction(
    pm => pm.withdrawTo(wEthAddress, ethers.parseEther(wEthAmount)), "Withdraw ETH"
  );
  
  const handleWithdrawUsdc = () => executePmAction(
    pm => pm.withdrawToken(wUsdcAddress, ethers.parseUnits(wUsdcAmount, 6)), "Withdraw USDC"
  );

  const handleUnlockStake = () => executePmAction(
    pm => pm.unlockStake(), "Unlock Stake"
  );

  const handleWithdrawStake = () => executePmAction(
    pm => pm.withdrawStake(wStakeAddress), "Withdraw Stake"
  );

  const handleApprovePaymaster = async () => {
    console.log("[Approve-V3] Starting approval flow...");
    if (!smartAccountAddress || !approveAmount || !signer || !paymasterAddress || !dToken) {
      alert("[Approve-V3] Missing inputs: SA, PM, or Token address.");
      return;
    }
    setApproving(true);
    try {
      // 1. Check EOA ETH Balance (MetaMask wallet)
      const balance = await provider.getBalance(eoaAddress);
      console.log("[Approve-V3] EOA Balance:", ethers.formatEther(balance));
      if (balance === 0n) {
          alert("[Approve-V3] Your EOA (MetaMask) has 0 ETH! You need ETH to pay for gas to send the approval transaction to your Smart Account.");
          setApproving(false);
          return;
      }

      // 2. Check if Smart Account is deployed
      console.log("[Approve-V3] Verifying deployment for:", smartAccountAddress);
      const code = await provider.getCode(smartAccountAddress);
      if (code === "0x") {
          alert("[Approve-V3] Smart Account NOT detected on-chain. Did you deploy it in 'Account Setup'?");
          setApproving(false);
          return;
      }

      console.log("[Approve-V3] Initializing contracts...");
      
      const tokenContract = new ethers.Contract(dToken, ERC20_ABI, signer);
      const amountToApprove = ethers.parseUnits(approveAmount, pmTokenDecimals);
      
      console.log("[Approve-V3] Dispatching approve() transaction from EOA...");
      
      try {
        const tx = await tokenContract.approve(paymasterAddress, amountToApprove);
        console.log("[Approve-V3] Transaction Hash:", tx.hash);
        
        await tx.wait();
        await refreshAllData();
        alert("[Approve-V3] Success! Paymaster is approved.");
      } catch (err) {
        console.error("[Approve-V3] Execution failed during estimateGas or sending:", err);
        throw err; // rethrow to be caught by outer catch
      }
    } catch (err) {
      console.error("[Approve-V3] FINAL CATCH ERROR:", err);
      
      let errorMessage = "Unknown Error";
      if (err.reason) errorMessage = err.reason;
      else if (err.message) errorMessage = err.message;
      else if (typeof err === 'string') errorMessage = err;
      
      if (err.data) {
          console.log("[Approve-V3] Revert Data:", err.data);
          errorMessage += ` (Data: ${err.data})`;
      }
      
      if (err.code === "CALL_EXCEPTION") {
          errorMessage = "Execution Reverted. Possible reasons: 1. You are not the owner of this Smart Account. 2. Insufficient ETH for gas in EOA. 3. Smart Account logic error.";
      }

      alert("[Approve-V3] FAILED: " + errorMessage);
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto pb-10">
      
      {/* Configuration Action Bar */}
      <div className="glass-card flex items-amountToApprovecenter justify-between p-4 bg-white/5 border-white/10">
         <div className="flex items-center gap-3 text-gradient">
            <DollarSign size={24} />
            <h2 className="m-0 text-xl">Paymaster Admin</h2>
         </div>
         {paymasterAddress ? (
            <div className="text-sm bg-white/10 px-3 py-1 rounded-md border border-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)]">
               Active PM: <b>{shortenAddress(paymasterAddress)}</b>
            </div>
         ) : (
            <div className="text-sm text-red-400 border border-red-500/30 px-3 py-1 rounded-md bg-red-500/5">
               No Paymaster Connected
            </div>
         )}
      </div>

      <div className="grid grid-cols-1 gap-6">

        {paymasterAddress && (
          <div className="glass-card mb-2 border border-primary/30">
             <div className="flex justify-between items-center mb-4">
                <h3 className="m-0 text-gradient">Paymaster Details Dashboard</h3>
                <button 
                  className="p-1.5 rounded-full hover:bg-white/10 transition-all text-muted hover:text-white"
                  onClick={async () => {
                     await refreshAllData();
                  }}
                  title="Refresh dashboard"
                >
                  <RotateCcw size={18} />
                </button>
             </div>
             <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="p-3 bg-white/5 rounded-md border border-white/5 flex flex-col">
                   <span className="text-xs text-muted">EntryPoint Deposit</span>
                   <span className="font-bold text-lg text-primary">{formatNum(pmDeposit, 18)}</span>
                </div>
                <div className="p-3 bg-white/5 rounded-md border border-white/5 flex flex-col">
                   <span className="text-xs text-muted">EntryPoint Stake</span>
                   <span className="font-bold text-lg text-primary flex items-center gap-2">
                     {formatNum(pmStake, 18)}
                     {Number(pmUnstakeDelay) > 0 && <span className="text-[10px] bg-white/10 px-1 rounded-sm">Delay: {pmUnstakeDelay}s</span>}
                   </span>
                </div>
                <div className="p-3 bg-white/5 rounded-md border border-white/5 flex flex-col">
                   <span className="text-xs text-muted">PM ETH Balance</span>
                   <span className="font-bold text-lg text-primary">{formatNum(pmETHBalance, 18)}</span>
                </div>
                <div className="p-3 bg-white/5 rounded-md border border-white/5 flex flex-col">
                   <span className="text-xs text-muted">PM {pmTokenSymbol || 'Token'} Balance</span>
                   <span className="font-bold text-lg text-secondary truncate">{pmUSDCBalance}</span>
                </div>
                <div className="p-3 bg-white/5 rounded-md border border-white/5 flex flex-col">
                   <span className="text-xs text-muted">Supported Token</span>
                   <span className="font-bold text-sm truncate">{dToken}</span>
                </div>
             </div>
          </div>
        )}

        {paymasterAddress && smartAccountAddress && (
          <div className="glass-card mb-2 border border-secondary/30">
            <h3 className="mb-2 flex items-center gap-2 text-secondary"><CheckCircle size={20} /> Approve Paymaster</h3>
            <p className="text-sm text-muted mb-4">
              <b>Crucial Step:</b> You must approve the Paymaster to pull ERC20 tokens for gas from your EOA wallet! 
              Use this button to dispatch an approval transaction directly from your EOA wallet (MetaMask).
            </p>
            <div className="flex items-center gap-4">
              <input 
                type="number" 
                className="input-field flex-1" 
                placeholder={`Amount in ${pmTokenSymbol || 'Tokens'}`} 
                value={approveAmount} 
                onChange={e=>setApproveAmount(e.target.value)} 
              />
              <button className="btn btn-secondary" onClick={handleApprovePaymaster} disabled={approving || !approveAmount}>
                {approving ? "Approving..." : "Approve from EOA Wallet"}
              </button>
            </div>
          </div>
        )}

        {/* 5.1 Deploy */}
        <details className="glass-card cursor-pointer group" open={!paymasterAddress}>
           <summary className="font-heading font-bold text-lg list-none flex items-center gap-2 m-0 p-0 outline-none select-none">
             <PlayCircle size={20} className="text-primary group-open:text-white transition-colors" /> 
             1. Deploy or Connect Paymaster
           </summary>
           <div className="mt-4 pt-4 border-t border-light grid grid-cols-1 md:grid-cols-2 gap-8 cursor-default">
              
              {/* Deploy custom Paymaster */}
              <div className="flex flex-col gap-4 border-r-0 md:border-r border-dotted border-white/20 pr-0 md:pr-8">
                 <h4 className="text-sm font-bold text-gradient">Deploy Custom Paymaster</h4>
                 <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted">EntryPoint Address</label>
                    <input type="text" className="input-field py-1.5 text-sm" value={dEntryPoint} onChange={e=>setDEntryPoint(e.target.value)} />
                 </div>
                 <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted">USDC Token Address</label>
                    <input type="text" className="input-field py-1.5 text-sm" value={dToken} onChange={e=>setDToken(e.target.value)} />
                 </div>
                 <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted">Price Feed (Chainlink) Address</label>
                    <input type="text" className="input-field py-1.5 text-sm" value={dPriceFeed} onChange={e=>setDPriceFeed(e.target.value)} />
                 </div>
  
                 <div className="pt-2 mt-auto">
                    <button 
                       className="btn btn-primary w-full" 
                       onClick={handleDeploy} 
                       disabled={deploying || !dEntryPoint || !dToken || !dPriceFeed}
                    >
                       {deploying ? "Deploying..." : "Deploy ERC20Paymaster"}
                    </button>
                 </div>
              </div>

              {/* Connect Existing */}
              <div className="flex flex-col gap-4">
                 <h4 className="text-sm font-bold text-gradient">Connect Existing Paymaster</h4>
                 <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted">Paymaster Contract Address</label>
                    <input 
                      type="text" 
                      className="input-field py-1.5 text-sm" 
                      value={connectPmAddress} 
                      onChange={e=>setConnectPmAddress(e.target.value)} 
                      placeholder="0x..." 
                    />
                 </div>
                 <div className="mt-auto pt-2">
                    <button 
                      className="btn btn-secondary w-full"
                      onClick={handleConnectPaymaster}
                      disabled={connecting || !connectPmAddress}
                    >
                      {connecting ? "Verifying..." : "Connect Paymaster"}
                    </button>
                 </div>
              </div>

           </div>
        </details>

        {/* 5.2 Fund Paymaster */}
        {paymasterAddress && (
          <details className="glass-card cursor-pointer group" open>
             <summary className="font-heading font-bold text-lg list-none flex items-center gap-2 m-0 p-0 outline-none select-none">
               <ArrowUpCircle size={20} className="text-secondary group-open:text-white transition-colors" /> 
               2. Fund Paymaster
             </summary>
             <div className="mt-4 pt-4 border-t border-light grid grid-cols-1 md:grid-cols-2 gap-6 cursor-default">
                
                <div className="flex flex-col gap-3 p-4 bg-black/20 rounded-md border border-white/5">
                   <h4 className="text-sm text-gradient">Deposit Gas (ETH)</h4>
                   <p className="text-xs text-muted m-0">Used to pay bundlers on behalf of users.</p>
                   <input 
                      type="number" 
                      className="input-field py-1.5 text-sm" 
                      placeholder="Amount of ETH" 
                      value={depositAmount} 
                      onChange={e=>setDepositAmount(e.target.value)} 
                   />
                   <button className="btn btn-secondary text-sm" onClick={handleDeposit} disabled={funding || !depositAmount}>
                     Deposit
                   </button>
                </div>

                <div className="flex flex-col gap-3 p-4 bg-black/20 rounded-md border border-white/5">
                   <h4 className="text-sm text-gradient">Add Stake (ETH)</h4>
                   <p className="text-xs text-muted m-0">Required for reputation in the bundler mempool.</p>
                   <div className="flex gap-2">
                     <input 
                        type="number" 
                        className="input-field py-1.5 text-sm w-1/2" 
                        placeholder="ETH Stake" 
                        value={stakeAmount} 
                        onChange={e=>setStakeAmount(e.target.value)} 
                     />
                     <input 
                        type="number" 
                        className="input-field py-1.5 text-sm w-1/2" 
                        placeholder="Delay (sec)" 
                        value={unstakeDelay} 
                        onChange={e=>setUnstakeDelay(e.target.value)} 
                     />
                   </div>
                   <button className="btn btn-secondary text-sm" onClick={handleStake} disabled={funding || !stakeAmount}>
                     Stake
                   </button>
                </div>

             </div>
          </details>
        )}

        {/* 5.3 Withdraw / Unstake */}
        {paymasterAddress && (
          <details className="glass-card cursor-pointer group border-red-500/20">
             <summary className="font-heading font-bold text-lg list-none flex items-center gap-2 m-0 p-0 outline-none select-none text-red-200">
               <ArrowDownCircle size={20} className="text-red-400 group-open:text-red-300 transition-colors" /> 
               3. Withdraw & Unstake
             </summary>
             <div className="mt-4 pt-4 border-t border-red-500/20 grid grid-cols-1 md:grid-cols-2 gap-6 cursor-default">
                
                <div className="flex flex-col gap-3">
                   <h4 className="text-sm text-red-300">Withdraw Gas (ETH)</h4>
                   <input type="text" className="input-field py-1.5 text-sm border-red-500/30 bg-red-500/5 focus:border-red-400" placeholder="Destination Address" value={wEthAddress} onChange={e=>setWEthAddress(e.target.value)} />
                   <input type="number" className="input-field py-1.5 text-sm border-red-500/30 bg-red-500/5 focus:border-red-400" placeholder="Amount ETH" value={wEthAmount} onChange={e=>setWEthAmount(e.target.value)} />
                   <button className="btn btn-danger text-sm" onClick={handleWithdrawEth} disabled={withdrawing || !wEthAddress || !wEthAmount}>Withdraw</button>
                </div>

                <div className="flex flex-col gap-3">
                   <h4 className="text-sm text-red-300">Withdraw Fees (USDC)</h4>
                   <input type="text" className="input-field py-1.5 text-sm border-red-500/30 bg-red-500/5 focus:border-red-400" placeholder="Destination Address" value={wUsdcAddress} onChange={e=>setWUsdcAddress(e.target.value)} />
                   <input type="number" className="input-field py-1.5 text-sm border-red-500/30 bg-red-500/5 focus:border-red-400" placeholder="Amount USDC" value={wUsdcAmount} onChange={e=>setWUsdcAmount(e.target.value)} />
                   <button className="btn btn-danger text-sm" onClick={handleWithdrawUsdc} disabled={withdrawing || !wUsdcAddress || !wUsdcAmount}>Withdraw</button>
                </div>

                <div className="sm:col-span-2 pt-4 border-t border-red-500/20 mt-2 flex flex-col sm:flex-row items-center gap-4">
                   <button className="btn btn-secondary flex-1 border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10" onClick={handleUnlockStake} disabled={withdrawing}>
                     <Unlock size={18} /> Unlock Stake Timer
                   </button>
                   
                   <div className="flex flex-col sm:flex-row items-center gap-2 flex-1">
                      <input type="text" className="input-field py-1.5 text-sm border-red-500/30 bg-red-500/5 focus:border-red-400" placeholder="Withdraw Stake To" value={wStakeAddress} onChange={e=>setWStakeAddress(e.target.value)} />
                      <button className="btn btn-danger text-sm whitespace-nowrap" onClick={handleWithdrawStake} disabled={withdrawing || !wStakeAddress}>
                        <Lock size={18} /> Perform Unstake
                      </button>
                   </div>
                </div>

             </div>
          </details>
        )}
      </div>
    </div>
  );
}
