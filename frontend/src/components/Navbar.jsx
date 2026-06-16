import React from 'react';
import { useAppContext } from '../context/AppContext';
import { shortenAddress } from '../utils/helpers';
import { LogOut, User, Settings, Send, DollarSign, Activity, Clock, LayoutDashboard, Shield } from 'lucide-react';

export default function Navbar() {
  const { eoaAddress, smartAccountAddress, disconnect, currentView, setCurrentView, chainId, switchNetwork } = useAppContext();

  if (!eoaAddress) return null;

  const NavItem = ({ viewId, icon, label, disabled = false }) => {
    const isActive = currentView === viewId;
    return (
      <button
        className={`wallet-nav-item ${isActive ? 'is-active' : ''}`}
        onClick={() => !disabled && setCurrentView(viewId)}
        title={disabled ? "Connect Smart Account First" : ""}
        disabled={disabled}
      >
        <span className="wallet-nav-item__inner">
          {icon}
          <span className="wallet-nav-item__label">{label}</span>
        </span>
      </button>
    );
  };

  return (
    <>
      {/* Top Banner */}
      <div className="wallet-topbar">
        <div className="wallet-topbar__brand">
          <div className="wallet-brand text-gradient">
            <Activity size={24} /> Smart Wallet
          </div>
          {smartAccountAddress && (
            <div className="badge badge-success hidden md:flex">
              Smart Account: {shortenAddress(smartAccountAddress)}
            </div>
          )}
        </div>

        <div className="wallet-topbar__actions flex items-center gap-3">
          <select 
            className="text-xs font-semibold bg-slate-800 text-white border border-slate-600 rounded px-3 py-1.5 outline-none cursor-pointer focus:border-primary/50"
            value={chainId ? chainId.toString() : "11155111"}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "11155111") switchNetwork(11155111);
              if (val === "80002") switchNetwork(80002);
            }}
          >
            <option value="11155111">Sepolia</option>
            <option value="80002">Amoy</option>
            <option value="coming_soon" disabled>Coming Soon...</option>
          </select>

          <div className="wallet-eoa">
            EOA: {shortenAddress(eoaAddress)}
          </div>

          <button className="wallet-disconnect" onClick={disconnect}>
            <LogOut size={16} /> Disconnect
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="wallet-nav-shell">
        <div className="wallet-nav-scroll" aria-label="Primary navigation">
          <NavItem viewId="home" icon={<LayoutDashboard size={18} />} label="Dashboard" />
          <NavItem viewId="setup" icon={<Settings size={18} />} label="Account Setup" />
          <NavItem viewId="paymaster" icon={<DollarSign size={18} />} label="Paymaster" />
          <NavItem viewId="profile" icon={<User size={18} />} label="Profile" />
          <NavItem viewId="send" icon={<Send size={18} />} label="Send Ops" disabled={!smartAccountAddress} />
          <NavItem viewId="batch-send" icon={<Send size={18} />} label="Batch Ops" disabled={!smartAccountAddress} />
          <NavItem viewId="history" icon={<Clock size={18} />} label="UserOp History" disabled={!smartAccountAddress} />
        </div>
      </div>
    </>
  );
}
