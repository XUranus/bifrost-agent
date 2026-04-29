import { useState, useEffect } from "react";
import { getHealth, getAgentInfo } from "../api/client";
import type { HealthResponse, AgentInfoResponse } from "../types";

export default function SettingsPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [info, setInfo] = useState<AgentInfoResponse | null>(null);

  useEffect(() => {
    Promise.all([getHealth(), getAgentInfo()])
      .then(([h, i]) => { setHealth(h); setInfo(i); })
      .catch(console.error);
  }, []);

  return (
    <div>
      <h2 style={styles.heading}>Settings &amp; Info</h2>

      <div style={styles.grid}>
        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>Agent Health</h3>
          {health ? (
            <dl style={styles.dl}>
              <Dt label="Status" value={health.status} />
              <Dt label="Version" value={health.version} />
              <Dt label="Uptime" value={formatUptime(health.uptime_seconds)} />
              <Dt label="Database" value={health.db_ok ? "Connected" : "Disconnected"} />
              <Dt label="Queue Depth" value={String(health.queue_depth)} />
            </dl>
          ) : (
            <p style={styles.loading}>Loading...</p>
          )}
        </div>

        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>Agent Info</h3>
          {info ? (
            <dl style={styles.dl}>
              <Dt label="Version" value={info.version} />
              <Dt label="Platform" value={info.platform} />
              <Dt label="Uptime" value={formatUptime(info.uptime_seconds)} />
              <Dt label="Backends" value={info.backends.join(", ") || "None"} />
              <Dt label="Capabilities" value={info.capabilities.join(", ") || "None"} />
            </dl>
          ) : (
            <p style={styles.loading}>Loading...</p>
          )}
        </div>
      </div>

      <div style={styles.panel}>
        <h3 style={styles.panelTitle}>About</h3>
        <p style={styles.about}>
          Bifrost Desktop v0.1.0<br />
          Cross-platform backup application powered by bifrost (file backup) and vpt-rs (volume backup) engines.
        </p>
      </div>
    </div>
  );
}

function Dt({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt style={styles.dt}>{label}</dt>
      <dd style={styles.dd}>{value}</dd>
    </>
  );
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

const styles: Record<string, React.CSSProperties> = {
  heading: { fontSize: 22, fontWeight: 700, marginBottom: 24, color: "#1a1a2e" },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 },
  panel: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 20,
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    marginBottom: 16,
  },
  panelTitle: { fontSize: 15, fontWeight: 600, color: "#1a1a2e", marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid #eee" },
  dl: { display: "grid", gridTemplateColumns: "120px 1fr", gap: "6px 12px" },
  dt: { fontSize: 12, fontWeight: 600, color: "#888", textTransform: "uppercase" as const },
  dd: { fontSize: 13, color: "#333" },
  loading: { color: "#888", fontSize: 13 },
  about: { fontSize: 13, color: "#666", lineHeight: 1.6 },
};
