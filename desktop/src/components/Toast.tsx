import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

interface ToastContextValue {
  pushToast: (message: string, type?: "success" | "error" | "info") => void;
}

const ToastContext = createContext<ToastContextValue>({
  pushToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [counter, setCounter] = useState(0);

  const pushToast = useCallback(
    (message: string, type: "success" | "error" | "info" = "info") => {
      const id = counter + 1;
      setCounter(id);
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    [counter]
  );

  return (
    <ToastContext.Provider value={{ pushToast }}>
      {children}
      <div style={styles.container}>
        {toasts.map((t) => (
          <div key={t.id} style={{ ...styles.toast, ...stylesByType[t.type] }}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const stylesByType: Record<string, React.CSSProperties> = {
  success: { backgroundColor: "#38a169", color: "#fff" },
  error: { backgroundColor: "#e53e3e", color: "#fff" },
  info: { backgroundColor: "#3182ce", color: "#fff" },
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "fixed",
    bottom: 20,
    right: 20,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    zIndex: 9999,
  },
  toast: {
    padding: "12px 20px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
    minWidth: 250,
    maxWidth: 400,
  },
};
