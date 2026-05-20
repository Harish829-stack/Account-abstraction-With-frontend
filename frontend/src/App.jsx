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
        <div 
          className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 w-11/12 max-w-2xl p-4 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xl backdrop-blur-xl"
          style={{
            background: "rgba(239, 68, 68, 0.08)",
            borderColor: "rgba(239, 68, 68, 0.3)",
            boxShadow: "0 8px 32px 0 rgba(239, 68, 68, 0.15), inset 0 1px 1px rgba(255,255,255,0.05)",
          }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20 text-red-400">
              <AlertTriangle size={20} className="animate-pulse" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-red-200 m-0">Network Mismatch</h4>
              <p className="text-xs text-red-300/80 m-0 mt-0.5">
                Connected to Chain ID <b>{chainId}</b>, but this app requires Sepolia (Chain ID <b>{expectedChainId}</b>).
              </p>
            </div>
          </div>
          <button 
            className="btn py-1.5 px-4 text-xs font-semibold rounded-xl bg-red-500 hover:bg-red-600 text-white transition-all duration-300 shadow-[0_0_15px_rgba(239, 68, 68, 0.4)] hover:shadow-[0_0_25px_rgba(239, 68, 68, 0.6)] whitespace-nowrap"
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


