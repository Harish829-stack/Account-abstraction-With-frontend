import { useAppContext } from './context/AppContext';
import Navbar from './components/Navbar';
import HomeView from './views/HomeView';
import ProfileView from './views/ProfileView';
import AccountSetupView from './views/AccountSetupView';
import SendOpView from './views/SendOpView';
import PaymasterView from './views/PaymasterView';
import HistoryView from './views/HistoryView';
import BatchSendView from './views/BatchSendView';
import WebAuthnView from './views/WebAuthnView';
import { AlertTriangle } from 'lucide-react';

function App() {
  const { currentView, eoaAddress, chainId, switchNetwork, isTxLoading, txLoadingMessage } = useAppContext();
  const isConnected = !!eoaAddress;
  
  const SUPPORTED_CHAINS = [11155111, 80002];
  const isNetworkMismatch = isConnected && chainId && !SUPPORTED_CHAINS.includes(Number(chainId));

  const renderGlobalLoader = () => {
    if (!isTxLoading) return null;
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(244, 241, 255, 0.85)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
      }}>
        <div className="glass-card flex flex-col items-center justify-center text-center max-w-sm w-full py-8 px-6 shadow-2xl animate-fade-in" style={{ border: '1px solid rgba(22, 163, 74, 0.12)' }}>
          <div className="global-loader-spinner"></div>
          <h3 style={{ marginTop: '1.5rem', color: '#141827', fontWeight: 800, fontSize: '1.25rem' }}>
            {txLoadingMessage || 'Processing Transaction...'}
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem', fontWeight: 500 }}>
            Please wait. Do not close this window.
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="container min-h-screen py-6 animate-fade-in relative">
      {isNetworkMismatch && (
        <div className="network-alert">
          <div className="network-alert__content">
            <div className="network-alert__icon">
              <AlertTriangle size={20} />
            </div>
            <div className="network-alert__text">
              <h4>Network Mismatch</h4>
              <p>
                Connected to Chain ID <b>{chainId}</b>, but this app requires Sepolia or Amoy.
              </p>
            </div>
          </div>
          <button 
            className="network-alert__action"
            onClick={() => switchNetwork(11155111)}
          >
            Switch to Sepolia
          </button>
        </div>
      )}

      {isConnected && <Navbar />}
      <main className="animate-fade-in">
        <div style={{ display: currentView === "home" ? "block" : "none" }}>
          <HomeView />
        </div>
        {isConnected && (
          <>
            <div style={{ display: currentView === "profile" ? "block" : "none" }}>
              <ProfileView />
            </div>
            <div style={{ display: currentView === "setup" ? "block" : "none" }}>
              <AccountSetupView />
            </div>
            <div style={{ display: currentView === "send" ? "block" : "none" }}>
              <SendOpView />
            </div>
            <div style={{ display: currentView === "batch-send" ? "block" : "none" }}>
              <BatchSendView />
            </div>
            <div style={{ display: currentView === "paymaster" ? "block" : "none" }}>
              <PaymasterView />
            </div>
            <div style={{ display: currentView === "history" ? "block" : "none" }}>
              <HistoryView />
            </div>
            {Number(chainId) === 80002 && (
              <div style={{ display: currentView === "webauthn" ? "block" : "none" }}>
                <WebAuthnView />
              </div>
            )}
          </>
        )}
      </main>
      {renderGlobalLoader()}
    </div>
  );
}

export default App;

