import { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { connectAgent, disconnectAgent, getSettings } from "./api/client";
import { ToastProvider } from "./components/Toast";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import AssetsPage from "./pages/Assets";
import AssetDetail from "./pages/AssetDetail";
import JobsPage from "./pages/Jobs";
import SettingsPage from "./pages/Settings";
import ConnectPage from "./pages/Connect";

export default function App() {
  const [connected, setConnected] = useState(false);
  const [agentUrl, setAgentUrl] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [initialUrl, setInitialUrl] = useState<string | undefined>();
  const [initialToken, setInitialToken] = useState<string | undefined>();

  useEffect(() => {
    getSettings()
      .then((s) => {
        if (s.agent_url) setInitialUrl(s.agent_url);
        if (s.agent_token) setInitialToken(s.agent_token);
      })
      .catch(() => {});
  }, []);

  async function handleConnect(url: string, token: string) {
    setError(null);
    try {
      await connectAgent(url, token);
      setAgentUrl(url);
      setConnected(true);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleDisconnect() {
    try {
      await disconnectAgent();
    } catch {
      // ignore
    }
    setConnected(false);
    setAgentUrl("");
  }

  if (!connected) {
    return (
      <ConnectPage
        onConnect={handleConnect}
        error={error}
        initialUrl={initialUrl}
        initialToken={initialToken}
      />
    );
  }

  return (
    <ToastProvider>
      <Layout agentUrl={agentUrl} onDisconnect={handleDisconnect}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/assets" element={<AssetsPage />} />
          <Route path="/assets/:id" element={<AssetDetail />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </ToastProvider>
  );
}
