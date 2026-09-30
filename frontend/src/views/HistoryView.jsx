import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { getExplorerTxUrl } from '../config/chains';
import { Activity, Clock } from 'lucide-react';

export default function HistoryView() {
  const { smartAccountAddress, chainId, recentOps, loadingOps, fetchRecentOps } = useAppContext();
  const toast = useToast();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  const timeAgo = (ms) => {
    if (!ms) return '';
    const diff = now - ms;
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
    <div className="flex flex-col gap-6 w-full h-[calc(100vh-140px)] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pb-10 px-4 pt-6">

      <div className="wallet-card flex items-center justify-between p-4 bg-obsidian-950 mb-2 w-full">
        <div className="flex items-center gap-3 text-slate-100">
          <Clock size={24} className="text-mint" />
          <h2 className="m-0 text-xl font-bold">UserOp History</h2>
        </div>
        <div className="text-sm font-mono text-slate-400">Recent Activity</div>
      </div>

      {!smartAccountAddress ? (
        <div className="wallet-card text-center p-8 w-full">
          <p className="text-slate-400 text-sm border border-red-500/30 px-3 py-1 rounded-md bg-red-500/5 inline-block">
            Please connect or deploy a Smart Account to view its UserOp History.
          </p>
        </div>
      ) : (
        <div className="wallet-card w-full p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="flex items-center gap-2 text-slate-100 font-bold"><Activity size={24} className="text-mint" /> Recent Transactions</h2>
            <button className="btn-ghost px-4 py-1.5 rounded-lg text-xs font-semibold" onClick={() => fetchRecentOps()} disabled={loadingOps}>
              {loadingOps ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {loadingOps && displayOps.length === 0 ? (
            <div className="text-sm text-slate-400">Loading recent operations...</div>
          ) : displayOps.length === 0 ? (
            <div className="text-sm text-slate-400">No recent UserOperations found for this Smart Account.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {displayOps.map((op, idx) => (
                <div key={idx} className="wallet-card p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center group">
                  <div className="flex flex-col w-full sm:w-auto overflow-hidden pr-4 gap-1">
                    <div className="flex items-center gap-2 mb-1">
                       <span className="text-xs font-bold tracking-wide text-slate-200">{op.label || 'On-Chain Transaction'}</span>
                       {op.timestamp && <span className="text-[10px] text-mint bg-mint/10 px-2 py-0.5 rounded-full">{timeAgo(op.timestamp)}</span>}
                    </div>
                    <div className="flex items-center gap-2 bg-mint/5 px-3 py-1.5 rounded-lg border border-mint/10 w-fit">
                      <span className="font-mono text-xs text-slate-400 truncate max-w-[200px] sm:max-w-[300px]" title={op.txHash || op.userOpHash}>
                        {op.txHash || op.userOpHash}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(op.txHash || op.userOpHash);
                          toast.success(`${op.txHash ? 'Transaction' : 'UserOp'} Hash copied!`);
                        }}
                        className="text-slate-500 hover:text-mint transition-colors"
                        title="Copy Hash"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                      </button>
                    </div>
                    {op.details && (
                      <p className="m-0 text-[11px] text-slate-300 max-w-[520px] font-medium">
                        {op.details}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-4 sm:mt-0 whitespace-nowrap">

                    {op.status === 'Success' && (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-[#00f59b] bg-[#00f59b]/20 px-3 py-1.5 rounded-lg border border-[#00f59b]/40">Success</span>
                    )}
                    {op.status === 'Reverted' && (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-red-500 bg-red-500/20 px-3 py-1.5 rounded-lg border border-red-500/40">Reverted</span>
                    )}
                    {op.status === 'Pending' && (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-yellow-500 bg-yellow-500/20 px-3 py-1.5 rounded-lg border border-yellow-500/40">Pending</span>
                    )}
                    {op.status === 'Dropped' && (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-slate-400 bg-slate-400/10 px-3 py-1.5 rounded-lg border border-slate-400/20">Dropped</span>
                    )}

                    <div className="flex items-center gap-2">
                      {op.txHash ? (
                        <a
                          href={getExplorerTxUrl(chainId, op.txHash)}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-ghost py-1.5 px-3 rounded-lg text-xs font-semibold opacity-80 hover:opacity-100 transition-opacity"
                        >
                          Explorer
                        </a>
                      ) : (
                        <span className="btn-ghost py-1.5 px-3 rounded-lg text-xs font-semibold opacity-50 cursor-not-allowed">Explorer</span>
                      )}
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
