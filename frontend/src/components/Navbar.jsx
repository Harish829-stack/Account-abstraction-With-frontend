import React from 'react';
import { useAppContext } from '../context/AppContext';
import { shortenAddress } from '../utils/helpers';
import { LogOut, User, Settings, Send, DollarSign, Activity, Clock, Sun, Moon } from 'lucide-react';

export default function Navbar() {
  const { eoaAddress, smartAccountAddress, disconnect, currentView, setCurrentView, theme, setTheme } = useAppContext();

  if (!eoaAddress) return null;

  const NavItem = ({ viewId, icon, label, disabled = false }) => {
    const isActive = currentView === viewId;
    return (
      <button 
        className={`btn ${isActive ? 'btn-primary' : 'btn-secondary'} whitespace-nowrap`}
        style={{ padding: '0.5rem 1.25rem', opacity: disabled ? 0.4 : 1, filter: disabled ? 'grayscale(100%)' : 'none' }}
        onClick={() => !disabled && setCurrentView(viewId)}
        title={disabled ? "Connect Smart Account First" : ""}
        disabled={disabled}
      >
        <span className="flex items-center gap-2">
           {icon}
           <span className="text-sm">{label}</span>
        </span>
      </button>
    );
  };

  return (
    <>
      {/* Top Banner */}
      <div className="flex justify-between items-center py-3 border-b border-light mb-6" style={{ borderColor: 'var(--border-light)' }}>
        <div className="flex items-center gap-4">
          <div className="font-heading font-bold text-gradient flex items-center gap-2">
            <Activity size={24} /> AA Hub
          </div>
          {smartAccountAddress && (
            <div className="badge badge-success hidden md:flex">
              Smart Account: {shortenAddress(smartAccountAddress)}
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-sm text-muted hidden sm:block">
            EOA: {shortenAddress(eoaAddress)}
          </div>
          <button 
             className="btn btn-secondary flex items-center justify-center p-2 rounded-full border border-white/10 hover:bg-white/5" 
             onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
             title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
             style={{ padding: '0.4rem', borderRadius: '50%' }}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="btn btn-danger! flex items-center gap-2 py-1 px-3 text-sm rounded-md hover:bg-red-500/10 transition-colors text-red-400 border border-red-500/30" onClick={disconnect}>
            <LogOut size={16} /> Disconnect
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2" style={{ borderBottom: '1px solid var(--border-light)' }}>
         <NavItem viewId="profile" icon={<User size={18} />} label="EOA Profile" />
         <NavItem viewId="setup" icon={<Settings size={18} />} label="Account Setup" />
         <NavItem viewId="send" icon={<Send size={18} />} label="Send Ops" disabled={!smartAccountAddress} />
         <NavItem viewId="batch-send" icon={<Send size={18} />} label="Batch Ops" disabled={!smartAccountAddress} />
         <NavItem viewId="paymaster" icon={<DollarSign size={18} />} label="Paymaster" />
         <NavItem viewId="history" icon={<Clock size={18} />} label="UserOp History" disabled={!smartAccountAddress} />
      </div>
    </>
  );
}
