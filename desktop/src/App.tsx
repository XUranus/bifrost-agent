import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { connectAgent, disconnectAgent, getSettings } from "./api/client";
import { ToastProvider } from "./components/Toast";
import { I18nProvider, useI18n } from "./i18n";
import { useAgentEvents } from "./hooks/useAgentEvents";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { type AppNotification } from "./components/NotificationCenter";
import ErrorBoundary from "./components/ErrorBoundary";
import { SkeletonPanel } from "./components/Skeleton";
import CommandPalette from "./components/CommandPalette";
import Layout from "./components/Layout";

// Lazy-loaded pages
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AssetsPage = lazy(() => import("./pages/Assets"));
const AssetDetail = lazy(() => import("./pages/AssetDetail"));
const NewAsset = lazy(() => import("./pages/NewAsset"));
const EditAsset = lazy(() => import("./pages/EditAsset"));
const JobsPage = lazy(() => import("./pages/Jobs"));
const JobDetail = lazy(() => import("./pages/JobDetail"));
const SLAPolicies = lazy(() => import("./pages/SLAPolicies"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const NotificationsPage = lazy(() => import("./pages/Notifications"));
const BackupReport = lazy(() => import("./pages/BackupReport"));

function PageSuspense({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div style={{ padding: 32 }}><SkeletonPanel rows={6} /></div>}>{children}</Suspense>;
}

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
      invoke("start_event_stream").catch((e) => console.warn("WS stream start failed:", e));
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
      <I18nProvider>
        <ConnectPage
          onConnect={handleConnect}
          error={error}
          initialUrl={initialUrl}
          initialToken={initialToken}
        />
      </I18nProvider>
    );
  }

  return (
    <I18nProvider>
      <ConnectedApp agentUrl={agentUrl} onDisconnect={handleDisconnect} />
    </I18nProvider>
  );
}

function ConnectPage({ onConnect, error, initialUrl, initialToken }: {
  onConnect: (url: string, token: string) => void;
  error: string | null;
  initialUrl?: string;
  initialToken?: string;
}) {
  const { t } = useI18n();
  const [url, setUrl] = useState(initialUrl || "http://localhost:7711");
  const [token, setToken] = useState(initialToken || "");
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (initialUrl) setUrl(initialUrl);
    if (initialToken) setToken(initialToken);
  }, [initialUrl, initialToken]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setConnecting(true);
    await onConnect(url, token);
    setConnecting(false);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
      <form className="glass-panel" style={{ padding: 32, width: 380 }} onSubmit={handleSubmit}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20, color: "var(--text-primary)" }}>{t("connect.title")}</h2>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>{t("connect.url")}</span>
          <input className="glass-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:7711" />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>{t("connect.token")}</span>
          <input className="glass-input" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Agent token" />
        </label>
        {error && <p className="connect-error" style={{ marginBottom: 16 }}>{error}</p>}
        <button className="btn-primary" type="submit" disabled={connecting} style={{ width: "100%" }}>
          {connecting ? t("connect.connecting") : t("connect.connect")}
        </button>
      </form>
    </div>
  );
}

function ConnectedApp({ agentUrl, onDisconnect }: { agentUrl: string; onDisconnect: () => void }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const notifIdRef = useRef(0);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [healthMap, setHealthMap] = useState<Map<string, { status: string; message: string | null }>>(new Map());

  useKeyboardShortcuts();

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    isPermissionGranted().then((granted) => {
      if (!granted) requestPermission();
    }).catch(() => {});
  }, []);

  const addNotification = useCallback((title: string, body: string, type: AppNotification["type"]) => {
    notifIdRef.current += 1;
    const id = notifIdRef.current;
    setNotifications((prev) => [{ id, title, body, type, timestamp: Date.now(), read: false }, ...prev].slice(0, 50));
  }, []);

  useAgentEvents({
    onJobStatus: (e) => {
      if (e.status === "completed") {
        const title = t("notif.jobCompleted");
        const body = t("notif.jobCompletedBody", { id: e.job_id.slice(0, 8) });
        addNotification(title, body, "success");
        isPermissionGranted().then((ok) => ok && sendNotification({ title, body })).catch(() => {});
      } else if (e.status === "failed") {
        const title = t("notif.jobFailed");
        const body = t("notif.jobFailedBody", { id: e.job_id.slice(0, 8), error: e.error_message ? `: ${e.error_message}` : "" });
        addNotification(title, body, "error");
        isPermissionGranted().then((ok) => ok && sendNotification({ title, body })).catch(() => {});
      }
    },
    onAssetHealth: (e) => {
      setHealthMap((prev) => {
        const m = new Map(prev);
        m.set(e.asset_id, { status: e.status, message: e.message });
        return m;
      });
    },
  });

  function handleMarkRead(id: number) {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  }

  function handleClearAll() {
    setNotifications([]);
  }

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    listen<string>("tray:navigate", (event) => {
      navigate(event.payload);
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [navigate]);

  return (
    <ToastProvider>
      <Layout>
        <ErrorBoundary name="routes">
          <Routes>
            <Route path="/" element={<PageSuspense><Dashboard /></PageSuspense>} />
            <Route path="/assets" element={<PageSuspense><AssetsPage healthMap={healthMap} /></PageSuspense>} />
            <Route path="/assets/new" element={<PageSuspense><NewAsset /></PageSuspense>} />
            <Route path="/assets/:id/edit" element={<PageSuspense><EditAsset /></PageSuspense>} />
            <Route path="/assets/:id" element={<PageSuspense><AssetDetail /></PageSuspense>} />
            <Route path="/jobs" element={<PageSuspense><JobsPage /></PageSuspense>} />
            <Route path="/jobs/:id" element={<PageSuspense><JobDetail /></PageSuspense>} />
            <Route path="/jobs/:id/report" element={<PageSuspense><BackupReport /></PageSuspense>} />
            <Route path="/sla-policies" element={<PageSuspense><SLAPolicies /></PageSuspense>} />
            <Route path="/notifications" element={<PageSuspense><NotificationsPage notifications={notifications} onMarkRead={handleMarkRead} onClearAll={handleClearAll} /></PageSuspense>} />
            <Route path="/settings" element={<PageSuspense><SettingsPage onDisconnect={onDisconnect} agentUrl={agentUrl} /></PageSuspense>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </Layout>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </ToastProvider>
  );
}
