import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { shortenAddress } from '../utils/helpers';
import { Activity, Clock } from 'lucide-react';
import { IEntryPointABI } from '../utils/abis';

export default function HistoryView() {
  const { smartAccountAddress, provider, env, pendingUserOps, recentOps, loadingOps, fetchRecentOps } = useAppContext();
  const toast = useToast();

  const timeAgo = (ms) => {
    if (!ms) return '';
    const diff = Date.now() - ms;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    if (Math.floor(diff / 1000) > 10) return `${Math.floor(diff / 1000)}s ago`;
    return 'Just now';
  };

  const displayOps = [
    ...recentOps
  ].slice(0, 10);

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
            <button className="btn btn-secondary py-1 text-xs" onClick={() => fetchRecentOps()} disabled={loadingOps}>
              {loadingOps ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {loadingOps && displayOps.length === 0 ? (
            <div className="text-sm text-muted">Loading recent operations...</div>
          ) : displayOps.length === 0 ? (
            <div className="text-sm text-muted">No recent UserOperations found for this Smart Account.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {displayOps.map((op, idx) => (
                <div key={idx} className="glass-history-card flex flex-col sm:flex-row justify-between items-start sm:items-center group">
                  <div className="flex flex-col w-full sm:w-auto overflow-hidden pr-4 gap-1">
                    <div className="flex items-center gap-2 mb-1">
                       <span className="text-xs font-bold tracking-wide">On-Chain Transaction</span>
                       {op.timestamp && <span className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full">{timeAgo(op.timestamp)}</span>}
                    </div>
                    <div className="flex items-center gap-2 bg-primary/5 px-3 py-1.5 rounded-lg border border-primary/10 w-fit">
                      <span className="font-mono text-xs text-muted truncate max-w-[200px] sm:max-w-[300px]" title={op.txHash || op.userOpHash}>
                        {op.txHash || op.userOpHash}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(op.txHash || op.userOpHash);
                          toast.success(`${op.txHash ? 'Transaction' : 'UserOp'} Hash copied!`);
                        }}
                        className="text-muted hover:text-primary transition-colors"
                        title="Copy Hash"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-4 sm:mt-0 whitespace-nowrap">

                    {op.status === 'Success' && (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-green-400 bg-green-400/10 px-3 py-1.5 rounded-lg border border-green-400/20">Success</span>
                    )}
                    {op.status === 'Reverted' && (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-red-400 bg-red-400/10 px-3 py-1.5 rounded-lg border border-red-400/20">Reverted</span>
                    )}

                    <div className="flex items-center gap-2">
                      <a
                        href={`https://sepolia.etherscan.io/tx/${op.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary py-1.5 px-3 text-xs opacity-80 group-hover:opacity-100 transition-opacity"
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
