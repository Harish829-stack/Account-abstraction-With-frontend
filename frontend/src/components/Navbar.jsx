import React from 'react';
import { useAppContext } from '../context/AppContext';
import { shortenAddress } from '../utils/helpers';
import { LogOut, User, Settings, Send, DollarSign, Activity, Clock, Sun, Moon, LayoutDashboard } from 'lucide-react';

export default function Navbar() {
  const { eoaAddress, smartAccountAddress, disconnect, currentView, setCurrentView, theme, setTheme } = useAppContext();

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

        <div className="wallet-topbar__actions">
          <div className="wallet-eoa">
            EOA: {shortenAddress(eoaAddress)}
          </div>
          <button
            className="wallet-icon-button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
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
          <NavItem viewId="send" icon={<Send size={18} />} label="Send Ops" disabled={!smartAccountAddress} />
          <NavItem viewId="batch-send" icon={<Send size={18} />} label="Batch Ops" disabled={!smartAccountAddress} />
          <NavItem viewId="history" icon={<Clock size={18} />} label="UserOp History" disabled={!smartAccountAddress} />
        </div>
      </div>
    </>
  );
}
