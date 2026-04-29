import { useState, useCallback, useEffect } from "react";
import { getHealth } from "../api/client";

export interface AgentState {
  connected: boolean;
  url: string | null;
  loading: boolean;
  error: string | null;
}

export function useAgent() {
  const [state, setState] = useState<AgentState>({
    connected: false,
    url: null,
    loading: false,
    error: null,
  });

  const checkConnection = useCallback(async () => {
    try {
      await getHealth();
      setState((s) => ({ ...s, connected: true, error: null }));
    } catch {
      setState((s) => ({ ...s, connected: false }));
    }
  }, []);

  // Periodically check connection
  useEffect(() => {
    if (state.connected) {
      const interval = setInterval(checkConnection, 30_000);
      return () => clearInterval(interval);
    }
  }, [state.connected, checkConnection]);

  return { state, setState, checkConnection };
}
