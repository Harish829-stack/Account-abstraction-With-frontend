import { lazy, Suspense } from 'react';
import { useAppContext } from './context/AppContext';
import Navbar from './components/Navbar';
import HomeView from './views/HomeView';
import { AlertTriangle } from 'lucide-react';
import { getDefaultChainId, getSupportedChainIds } from './config/chains';

const ModulesView = lazy(() => import('./views/ModulesView'));
const SendOpView = lazy(() => import('./views/SendOpView'));
const PaymasterView = lazy(() => import('./views/PaymasterView'));
const HistoryView = lazy(() => import('./views/HistoryView'));
const BatchSendView = lazy(() => import('./views/BatchSendView'));
const AdminView = lazy(() => import('./views/AdminView'));
const UnifiedAgentView = lazy(() => import('./views/UnifiedAgentView'));
const MintUSDCView = lazy(() => import('./views/MintUSDCView'));

function App() {
  const { currentView, eoaAddress, chainId, switchNetwork, isTxLoading, txLoadingMessage } = useAppContext();
  const isConnected = !!eoaAddress;
  
  const SUPPORTED_CHAINS = getSupportedChainIds();
  const defaultChainId = getDefaultChainId();
  const isNetworkMismatch = isConnected && chainId && !SUPPORTED_CHAINS.includes(Number(chainId));

  const renderCurrentView = () => {
    if (!isConnected) return <HomeView />;
    if (isNetworkMismatch) {
      return (
        <section className="wallet-card network-blocked-state" role="alert">
          <AlertTriangle size={28} aria-hidden="true" />
          <h2>Switch networks to continue</h2>
          <p>This platform is available on Arbitrum Sepolia only. Transactions and account data are paused on other networks.</p>
          <button className="btn btn-primary" type="button" onClick={() => switchNetwork(defaultChainId)}>
            Switch to Arbitrum Sepolia
          </button>
        </section>
      );
    }

    switch (currentView) {
      case "modules":
        return <ModulesView />;
      case "send":
        return <SendOpView />;
      case "batch-send":
        return <BatchSendView />;
      case "paymaster":
        return <PaymasterView />;
      case "history":
        return <HistoryView />;
      case "admin":
        return <AdminView />;
      case "chatbot":
        return <UnifiedAgentView />;
      case "mint-usdc":
        return <MintUSDCView />;
      case "home":
      default:
        return <HomeView />;
    }
  };

  const renderGlobalLoader = () => {
    if (!isTxLoading) return null;
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(7, 9, 14, 0.86)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
      }}>
        <div className="wallet-card flex flex-col items-center justify-center text-center max-w-sm w-full py-8 px-6 shadow-2xl animate-fade-in" style={{ border: '1px solid rgba(0, 245, 155, 0.24)' }}>
          <div className="global-loader-spinner"></div>
          <h3 style={{ marginTop: '1.5rem', color: '#f8fafc', fontWeight: 800, fontSize: '1.25rem' }}>
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
    <div className={isConnected ? "min-h-screen animate-fade-in relative" : "min-h-screen animate-fade-in relative"}>
      {isNetworkMismatch && (
        <div className="network-alert">
          <div className="network-alert__content">
            <div className="network-alert__icon">
              <AlertTriangle size={20} />
            </div>
            <div className="network-alert__text">
              <h4>Network Mismatch</h4>
              <p>
                Connected to Chain ID <b>{chainId}</b>, but this app requires a supported active chain.
              </p>
            </div>
          </div>
          <button 
            className="network-alert__action"
            onClick={() => switchNetwork(defaultChainId)}
          >
            Switch to Arbitrum Sepolia
          </button>
        </div>
      )}

      {isConnected && <Navbar />}
      <main className={isConnected && currentView !== "home" ? "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7 animate-fade-in" : "animate-fade-in"}>
        <Suspense fallback={<div className="wallet-card route-loading" role="status">Loading view…</div>}>
          {renderCurrentView()}
        </Suspense>
      </main>
      {renderGlobalLoader()}
    </div>
  );
}

export default App;
