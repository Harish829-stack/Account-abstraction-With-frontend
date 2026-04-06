import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { shortenAddress } from '../utils/helpers';
import { Activity, Clock } from 'lucide-react';
import { IEntryPointABI } from '../utils/abis';

export default function HistoryView() {
  const { smartAccountAddress, provider, env, pendingUserOps } = useAppContext();
  const toast = useToast();
  
  const [recentOps, setRecentOps] = useState([]);
  const [loadingOps, setLoadingOps] = useState(false);

  const fetchRecentOps = async () => {
    if (!smartAccountAddress || !provider || !env.ENTRY_POINT) return;
    setLoadingOps(true);
    try {
      const epContract = new ethers.Contract(env.ENTRY_POINT, IEntryPointABI, provider);
      const filter = epContract.filters.UserOperationEvent(null, smartAccountAddress);
      
      const blockNum = await provider.getBlockNumber();
      const events = await epContract.queryFilter(filter, Math.max(0, blockNum - 20000), "latest");
      
      const last5 = events.slice(-5).reverse();
      const formattedOps = last5.map(e => ({
        userOpHash: e.args[0],
        status: e.args[4] ? 'Success' : 'Reverted',
        txHash: e.transactionHash
      }));
      setRecentOps(formattedOps);
    } catch (err) {
      console.error("Error fetching UserOps:", err);
    } finally {
      setLoadingOps(false);
    }
  };

  useEffect(() => {
    fetchRecentOps();
  }, [smartAccountAddress, provider, env.ENTRY_POINT]);

  const displayOps = [
    ...recentOps
  ].slice(0, 5);

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto pb-10">
      
      <div className="glass-card flex items-center justify-between p-4 bg-white/5 border-white/10 mb-2">
         <div className="flex items-center gap-3 text-gradient">
            <Clock size={24} />
            <h2 className="m-0 text-xl">UserOp History</h2>
         </div>
      </div>

      {!smartAccountAddress ? (
         <div className="glass-card text-center p-8">
            <p className="text-muted text-sm border border-red-500/30 px-3 py-1 rounded-md bg-red-500/5 inline-block">
               Please connect or deploy a Smart Account to view its UserOp History.
            </p>
         </div>
      ) : (
        <div className="glass-card">
          <div className="flex items-center justify-between mb-4">
             <h2 className="flex items-center gap-2 text-gradient"><Activity size={24} /> Recent Transactions</h2>
             <button className="btn btn-secondary py-1 text-xs" onClick={fetchRecentOps} disabled={loadingOps}>
               {loadingOps ? 'Refreshing...' : 'Refresh'}
             </button>
          </div>
          
          {loadingOps && displayOps.length === 0 ? (
             <div className="text-sm text-muted">Loading recent operations...</div>
          ) : displayOps.length === 0 ? (
             <div className="text-sm text-muted">No recent UserOperations found for this Smart Account.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {displayOps.map((op, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white/5 p-3 rounded-md border border-white/10 transition-colors hover:bg-white/10">
                  <div className="flex flex-col w-full sm:w-auto overflow-hidden pr-4">
                    <span className="text-xs text-muted mb-1 flex items-center gap-2">
                       {op.txHash ? 'Transaction Hash' : 'UserOp Hash'}
                       <button 
                         onClick={() => {
                             navigator.clipboard.writeText(op.txHash || op.userOpHash);
                             toast.success(`${op.txHash ? 'Transaction' : 'UserOp'} Hash copied to clipboard!`);
                          }}
                         className="text-primary hover:text-white transition-colors"
                         title="Copy Hash"
                       >
                         <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                       </button>
                    </span>
                    <span className="font-mono text-xs sm:text-sm truncate w-full" title={op.txHash || op.userOpHash}>
                       {op.txHash || op.userOpHash}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-3 sm:mt-0 whitespace-nowrap">

                    {op.status === 'Success' && (
                       <span className="text-xs font-bold text-green-400 bg-green-400/10 px-2 py-1 rounded-full border border-green-400/20">Success</span>
                    )}
                    {op.status === 'Reverted' && (
                       <span className="text-xs font-bold text-red-400 bg-red-400/10 px-2 py-1 rounded-full border border-red-400/20">Reverted</span>
                    )}
                    
                    <div className="flex items-center gap-2">
                       <a 
                          href={`https://sepolia.etherscan.io/tx/${op.txHash}`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="btn btn-secondary py-1 px-3 text-xs"
                       >
                         Etherscan
                       </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
