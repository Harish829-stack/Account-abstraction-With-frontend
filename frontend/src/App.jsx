import { useAppContext } from './context/AppContext';
import Navbar from './components/Navbar';
import HomeView from './views/HomeView';
import ProfileView from './views/ProfileView';
import AccountSetupView from './views/AccountSetupView';
import SendOpView from './views/SendOpView';
import PaymasterView from './views/PaymasterView';
import HistoryView from './views/HistoryView';
import BatchSendView from './views/BatchSendView';

function App() {
  const { currentView } = useAppContext();

  return (
    <div className="container min-h-screen py-6 animate-fade-in">
      {currentView === "home" ? (
        <HomeView />
      ) : (
        <>
          <Navbar />
          <main className="animate-fade-in">
            {currentView === "profile" && <ProfileView />}
            {currentView === "setup" && <AccountSetupView />}
            {currentView === "send" && <SendOpView />}
            {currentView === "batch-send" && <BatchSendView />}
            {currentView === "paymaster" && <PaymasterView />}
            {currentView === "history" && <HistoryView />}
          </main>
        </>
      )}
    </div>
  );
}

export default App;
