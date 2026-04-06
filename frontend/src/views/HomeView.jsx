import React from 'react';
import { useAppContext } from '../context/AppContext';
import { Zap, ShieldCheck, Layers, Gift, Clock, Network } from 'lucide-react';

const features = [
  {
    icon: <Zap className="text-gradient" size={32} />,
    title: "Gas Abstraction",
    description: "Pay transaction fees in USDC instead of ETH. No need to hold ETH just for gas."
  },
  {
    icon: <ShieldCheck className="text-gradient" size={32} />,
    title: "Smart Account Ownership",
    description: "Your account is a smart contract you fully control — upgrade, transfer, or recover ownership anytime."
  },
  {
    icon: <Layers className="text-gradient" size={32} />,
    title: "Batch Transactions",
    description: "Execute multiple on-chain actions in a single UserOperation — saves time and reduces fees."
  },
  {
    icon: <Gift className="text-gradient" size={32} />,
    title: "Sponsored Transactions",
    description: "Let a Paymaster cover gas costs entirely. Ideal for onboarding users with zero ETH."
  },
  {
    icon: <Clock className="text-gradient" size={32} />,
    title: "Session-based Signing",
    description: "Sign operations with time-bounded validity windows — no permanent approvals needed."
  },
  {
    icon: <Network className="text-gradient" size={32} />,
    title: "Bundler Network",
    description: "Operations are relayed through a decentralized bundler (Skandha), not directly from your EOA."
  }
];

export default function HomeView() {
  const { connectWallet, isConnecting } = useAppContext();

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '4rem' }}>
      {/* Hero Section */}
      <div className="flex flex-col items-center justify-center text-center mt-8 mb-8" style={{ minHeight: '40vh' }}>
        <h1 style={{ fontSize: '4rem', marginBottom: '1rem' }}>
          Smart <span className="text-gradient">Account</span> Hub
        </h1>
        <p className="text-muted" style={{ fontSize: '1.25rem', maxWidth: '600px', marginBottom: '2.5rem' }}>
          Gasless, flexible transactions powered by ERC-4337 Account Abstraction. Experience the future of Web3.
        </p>
        <button 
          className="btn btn-primary" 
          onClick={connectWallet} 
          disabled={isConnecting}
          style={{ fontSize: '1.2rem', padding: '1rem 3rem' }}
        >
          {isConnecting ? (
            <><div className="loader" style={{ width: '1rem', height: '1rem', borderWidth: '2px' }}></div> Connecting...</>
          ) : (
            <><Zap size={20} /> Connect Wallet</>
          )}
        </button>
      </div>

      {/* Features Section */}
      <h2 className="text-center mb-4 text-gradient" style={{ fontSize: '2rem' }}>Why ERC-4337?</h2>
      <div className="grid-features mt-4">
        {features.map((f, i) => (
          <div key={i} className="glass-card flex flex-col gap-2">
            <div className="mb-2">{f.icon}</div>
            <h3 style={{ fontSize: '1.25rem' }}>{f.title}</h3>
            <p className="text-muted text-sm">{f.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
