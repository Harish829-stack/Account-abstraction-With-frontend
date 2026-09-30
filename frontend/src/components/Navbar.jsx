import React, { useRef, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { shortenAddress } from '../utils/helpers';
import { getDefaultChainId, getSupportedChains } from '../config/chains';
import { useToast } from '../context/ToastContext';

export default function Navbar() {
  const { eoaAddress, smartAccountAddress, disconnect, currentView, setCurrentView, chainId, switchNetwork, isMultisigOwner } = useAppContext();
  const activeChains = getSupportedChains();
  const defaultChainId = getDefaultChainId();
  const toast = useToast();

  if (!eoaAddress) return null;

  const NavItem = ({ viewId, icon, label, disabled = false, specialClasses = "", labelClasses = "" }) => {
    const isActive = currentView === viewId;

    return (
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          if (!disabled) setCurrentView(viewId);
        }}
        className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl transition-all text-sm ${
          isActive 
            ? 'bg-mint text-obsidian-950 font-bold shadow-mint-sm' 
            : 'text-slate-400 hover:text-obsidian-950 hover:bg-mint'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        title={disabled ? "Connect Smart Account First" : ""}
      >
        {icon}
        <span className={labelClasses}>{label}</span>
        {specialClasses && <span className={specialClasses}>{specialClasses.includes("Paymaster") ? "Paymaster" : specialClasses.includes("AI") ? "AI AGENT" : ""}</span>}
      </a>
    );
  };

  const copyToClipboard = (text, notificationMsg) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.info(notificationMsg);
    });
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-obsidian-950/85 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Primary Top Row */}
        <div className="h-20 flex items-center justify-between gap-4">
          
          {/* Left: Logo & Smart Account Identifier Badge */}
          <div className="flex items-center gap-5">
            <a className="flex items-center gap-3 group" href="#" onClick={(e) => { e.preventDefault(); setCurrentView("home"); }}>
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-mint to-cyan-400 p-[1px] shadow-mint-sm transition-transform group-hover:scale-105">
                <div className="w-full h-full bg-obsidian-950 rounded-[15px] flex items-center justify-center">
                  <svg className="w-6 h-6 text-mint" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round"></path>
                  </svg>
                </div>
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-xl tracking-tight text-white flex items-center gap-1.5">
                  Wallet<span className="text-mint font-extrabold">Copilot</span>
                </span>
                <span className="text-xs uppercase font-mono tracking-widest text-slate-400 -mt-1">ERC-4337 AA Vault</span>
              </div>
            </a>
            
            {/* Smart Account Pill Badge */}
            {smartAccountAddress && (
              <div 
                className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full bg-mint/10 border border-mint/30 hover:border-mint/60 transition-all cursor-pointer group"
                onClick={() => copyToClipboard(smartAccountAddress, 'Smart Account Copied!')}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-mint animate-pulse"></span>
                <span className="text-sm font-mono font-semibold tracking-wide text-mint group-hover:text-white transition-colors">
                  SMART ACCOUNT: {shortenAddress(smartAccountAddress)}
                </span>
                <svg className="w-4 h-4 text-mint/70 group-hover:text-mint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                </svg>
              </div>
            )}
          </div>

          {/* Right: Network Selector + EOA Info + Disconnect Button */}
          <div className="flex items-center gap-4">
            {/* Chain Selector Pill */}
            <div className="relative">
              <select 
                className="appearance-none flex items-center gap-2 px-4 py-2 pl-10 pr-7 rounded-full text-sm font-semibold bg-emerald-950/40 border border-mint/25 text-mint hover:bg-mint/10 hover:border-mint/50 transition-all cursor-pointer focus:outline-none"
                value={chainId ? chainId.toString() : String(defaultChainId)}
                onChange={(e) => switchNetwork(Number(e.target.value))}
              >
                {activeChains.map((chain) => (
                  <option key={chain.chainId} value={chain.chainId}>{chain.name.toUpperCase()}</option>
                ))}
                <option value="coming_soon" disabled>MORE NETWORKS SOON...</option>
              </select>
              <svg className="w-4 h-4 text-mint absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" fill="none" r="9" stroke="currentColor" strokeWidth="2"></circle>
                <path d="M12 3v18M3 12h18" stroke="currentColor" strokeWidth="1.5"></path>
              </svg>
              <svg className="w-4 h-4 opacity-75 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-mint" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5"></path></svg>
            </div>

            {/* Connected EOA Signer */}
            <div className="hidden lg:flex items-center gap-2 px-4 py-2 rounded-full bg-obsidian-900 border border-white/10 text-sm font-mono text-slate-300">
              <span className="text-slate-500">EOA:</span>
              <span className="text-slate-200">{shortenAddress(eoaAddress)}</span>
            </div>

            {/* Disconnect Button with Neon Border */}
            <button 
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-rose-400 bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 hover:border-rose-400/50 transition-all active:scale-95" 
              onClick={() => {
                toast.info('Disconnected signer session');
                disconnect();
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
              </svg>
              <span className="">Disconnect</span>
            </button>
          </div>
        </div>

        {/* Secondary Sub-Navigation Tabs */}
        <nav aria-label="Sub Tabs" className="flex items-center gap-2 overflow-x-auto py-3.5 border-t border-white/5 scrollbar-none">
          <NavItem 
            viewId="home" 
            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><rect height="7" rx="1.5" width="7" x="3" y="3"></rect><rect height="7" rx="1.5" width="7" x="14" y="3"></rect><rect height="7" rx="1.5" width="7" x="3" y="14"></rect><rect height="7" rx="1.5" width="7" x="14" y="14"></rect></svg>} 
            label={<span className="font-semibold">Dashboard</span>} 
          />
          <NavItem 
            viewId="paymaster" 
            icon={<span className="text-base font-bold text-mint">$</span>} 
            label={<span className="font-semibold">Gas Sponsorship</span>} 
            disabled={!smartAccountAddress} 
            specialClasses="text-[10px] px-2 py-0.5 rounded bg-mint/15 text-mint font-bold"
          />
          <NavItem 
            viewId="chatbot" 
            icon={<svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>} 
            label={<span className="font-semibold">Wallet Copilot</span>} 
            disabled={!smartAccountAddress} 
          />
          <NavItem 
            viewId="history" 
            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>} 
            label={<span className="font-semibold">UserOp History</span>} 
            disabled={!smartAccountAddress} 
          />
          <NavItem 
            viewId="mint-usdc" 
            icon={<svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" strokeWidth="2"></circle><path d="M12 8v8M8 12h8" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>} 
            label={<span className="font-semibold">Mint USDC (Faucet)</span>} 
            disabled={!smartAccountAddress} 
          />
          {isMultisigOwner && (
            <NavItem 
              viewId="admin" 
              icon={<svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>} 
              label={<span className="font-semibold">Admin Control</span>} 
            />
          )}
        </nav>
      </div>
    </header>
  );
}
