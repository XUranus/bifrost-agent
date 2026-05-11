import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
  action?: { label: string; onClick: () => void };
  persistent?: boolean;
}

interface ToastContextValue {
  pushToast: (message: string, type?: "success" | "error" | "info", opts?: { action?: Toast["action"]; persistent?: boolean }) => void;
}

const ToastContext = createContext<ToastContextValue>({
  pushToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = { current: 0 };

  const pushToast = useCallback(
    (message: string, type: "success" | "error" | "info" = "info", opts?: { action?: Toast["action"]; persistent?: boolean }) => {
      // Dedup: if same message exists, bump its timeout
      setToasts((prev) => {
        const existing = prev.find((t) => t.message === message && t.type === type);
        if (existing) return prev;
        counterRef.current += 1;
        const id = counterRef.current;
        const toast: Toast = { id, message, type, ...opts };
        if (!opts?.persistent) {
          setTimeout(() => {
            setToasts((p) => p.filter((t) => t.id !== id));
          }, 4000);
        }
        return [...prev, toast];
      });
    },
    []
  );

  function dismissToast(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <ToastContext.Provider value={{ pushToast }}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span>{t.message}</span>
            {t.action && (
              <button className="toast-action" onClick={t.action.onClick}>{t.action.label}</button>
            )}
            {t.persistent && (
              <button className="toast-close" onClick={() => dismissToast(t.id)}>&times;</button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
