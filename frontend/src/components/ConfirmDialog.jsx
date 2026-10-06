import React, { useCallback, useEffect, useRef, useState } from 'react';

export function useConfirmDialog() {
  const resolverRef = useRef(null);
  const [request, setRequest] = useState(null);

  const confirm = useCallback((options) => new Promise((resolve) => {
    resolverRef.current = resolve;
    setRequest({
      title: 'Confirm action',
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel',
      danger: false,
      ...options,
    });
  }), []);

  const close = useCallback((result) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setRequest(null);
  }, []);

  useEffect(() => {
    if (!request) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') close(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [request, close]);

  const dialog = request ? (
    <div className="confirm-dialog__backdrop" role="presentation" onMouseDown={() => close(false)}>
      <section
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title">{request.title}</h2>
        <p id="confirm-dialog-description">{request.message}</p>
        <div className="confirm-dialog__actions">
          <button type="button" className="btn btn-secondary" onClick={() => close(false)} autoFocus>
            {request.cancelLabel}
          </button>
          <button
            type="button"
            className={request.danger ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={() => close(true)}
          >
            {request.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  ) : null;

  return [confirm, dialog];
}
