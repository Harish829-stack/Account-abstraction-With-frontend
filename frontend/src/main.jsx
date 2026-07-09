import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { AppProvider } from './context/AppContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { ChatbotProvider } from './context/ChatbotContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <AppProvider>
        <ChatbotProvider>
          <App />
        </ChatbotProvider>
      </AppProvider>
    </ToastProvider>
  </React.StrictMode>,
)
