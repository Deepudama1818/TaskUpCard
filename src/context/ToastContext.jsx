import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback((message, type = 'info') => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const confirm = useCallback(({ title, message, confirmLabel = 'Confirm', danger = false }) => {
    return new Promise((resolve) => {
      setConfirmState({ title, message, confirmLabel, danger, resolve });
    });
  }, []);

  const handleConfirmChoice = (accepted) => {
    if (confirmState?.resolve) {
      confirmState.resolve(accepted);
    }
    setConfirmState(null);
  };

  return (
    <ToastContext.Provider value={{ notify, confirm }}>
      {children}

      {/* Toast stack */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl glass-surface text-sm text-slate-900 dark:text-slate-100"
          >
            {t.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
            {t.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />}
            {t.type === 'info' && <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />}
            <span className="flex-1 leading-snug">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Confirmation dialog */}
      {confirmState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl glass-surface p-6">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {confirmState.title}
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {confirmState.message}
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => handleConfirmChoice(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmChoice(true)}
                className={`px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors ${
                  confirmState.danger
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
