import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, Info, X, ExternalLink } from 'lucide-react';

const ToastContext = createContext(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'info', action = null, duration = 4000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type, action }]);
    setTimeout(() => removeToast(id), duration);
  }, [removeToast]);

  const success = useCallback((message) => addToast(message, 'success'), [addToast]);
  const error = useCallback((message) => addToast(message, 'error', null, 6000), [addToast]);
  const info = useCallback((message) => addToast(message, 'info'), [addToast]);

  // Toast with an action button: toast.withAction("msg", "Label", () => doSomething(), 'success')
  const withAction = useCallback((message, buttonLabel, onButtonClick, type = 'success') => {
    addToast(message, type, { label: buttonLabel, onClick: onButtonClick }, 8000);
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ success, error, info, withAction }}>
      {children}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast-item toast-${toast.type}`}>
            <div className="toast-icon">
              {toast.type === 'success' && <CheckCircle2 size={20} className="text-secondary" />}
              {toast.type === 'error' && <XCircle size={20} className="text-danger" />}
              {toast.type === 'info' && <Info size={20} className="text-primary" />}
            </div>
            <div className="toast-message" style={{ flex: 1 }}>{toast.message}</div>
            {toast.action && (
              <button
                onClick={() => { toast.action.onClick(); removeToast(toast.id); }}
                style={{
                  background: 'rgba(91, 62, 232, 0.12)',
                  border: '1px solid rgba(91, 62, 232, 0.28)',
                  color: 'var(--primary)',
                  borderRadius: '6px',
                  padding: '3px 10px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  flexShrink: 0,
                  marginLeft: '8px',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(91, 62, 232, 0.18)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(91, 62, 232, 0.12)'}
              >
                <ExternalLink size={11} />
                {toast.action.label}
              </button>
            )}
            <button className="toast-close" onClick={() => removeToast(toast.id)}>
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
