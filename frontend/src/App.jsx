import { useAppContext } from './context/AppContext';
import Navbar from './components/Navbar';
import HomeView from './views/HomeView';
import ProfileView from './views/ProfileView';
import AccountSetupView from './views/AccountSetupView';
import SendOpView from './views/SendOpView';
import PaymasterView from './views/PaymasterView';
import HistoryView from './views/HistoryView';
import BatchSendView from './views/BatchSendView';
import { AlertTriangle } from 'lucide-react';

function App() {
  const { currentView, eoaAddress, chainId, expectedChainId, switchNetwork } = useAppContext();
  const isConnected = !!eoaAddress;
  const isNetworkMismatch = isConnected && chainId && Number(chainId) !== Number(expectedChainId);

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
                Connected to Chain ID <b>{chainId}</b>, but this app requires Sepolia (Chain ID <b>{expectedChainId}</b>).
              </p>
            </div>
          </div>
          <button 
            className="network-alert__action"
            onClick={switchNetwork}
          >
            Switch to Sepolia
          </button>
        </div>
      )}

      {isConnected && <Navbar />}
      <main className="animate-fade-in">
        {currentView === "home" && <HomeView />}
        {currentView === "profile" && <ProfileView />}
        {currentView === "setup" && <AccountSetupView />}
        {currentView === "send" && <SendOpView />}
        {currentView === "batch-send" && <BatchSendView />}
        {currentView === "paymaster" && <PaymasterView />}
        {currentView === "history" && <HistoryView />}
      </main>
    </div>
  );
}

export default App;

