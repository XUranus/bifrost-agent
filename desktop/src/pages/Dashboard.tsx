import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getHealth, getAgentInfo, listAssets, listJobs } from "../api/client";
import type { HealthResponse, AgentInfoResponse, AssetResponse, JobResponse } from "../types";

export default function Dashboard() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [info, setInfo] = useState<AgentInfoResponse | null>(null);
  const [assets, setAssets] = useState<AssetResponse[]>([]);
  const [recentJobs, setRecentJobs] = useState<JobResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const [h, i, a, j] = await Promise.all([
          getHealth(),
          getAgentInfo(),
          listAssets(),
          listJobs({ limit: 10 }),
        ]);
        setHealth(h);
        setInfo(i);
        setAssets(a);
        setRecentJobs(j);
      } catch (e) {
        console.error("Dashboard load error:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return <p style={{ color: "#666" }}>Loading dashboard...</p>;
  }

  const healthyAssets = assets.filter((a) => a.health === "ok").length;

  return (
    <div>
      <h2 style={styles.heading}>Dashboard</h2>

      <div style={styles.grid}>
        <StatCard label="Agent Status" value={health?.status ?? "unknown"} color={health?.status === "ok" ? "#38a169" : "#e53e3e"} />
        <StatCard label="Uptime" value={info ? `${Math.floor(info.uptime_seconds / 3600)}h ${Math.floor((info.uptime_seconds % 3600) / 60)}m` : "-"} color="#6c63ff" />
        <StatCard label="Assets" value={`${healthyAssets}/${assets.length} healthy`} color="#3182ce" />
        <StatCard label="Queue Depth" value={String(health?.queue_depth ?? 0)} color="#d69e2e" />
      </div>

      <div style={styles.row}>
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <h3 style={styles.panelTitle}>Assets</h3>
            <button style={styles.linkBtn} onClick={() => navigate("/assets")}>View all</button>
          </div>
          {assets.length === 0 ? (
            <p style={styles.empty}>No assets configured</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Kind</th>
                  <th style={styles.th}>Health</th>
                </tr>
              </thead>
              <tbody>
                {assets.slice(0, 5).map((a) => (
                  <tr key={a.id} style={styles.tr} onClick={() => navigate(`/assets/${a.id}`)}>
                    <td style={styles.td}>{a.name}</td>
                    <td style={styles.td}>{a.kind}</td>
                    <td style={styles.td}>
                      <StatusBadge status={a.health} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <h3 style={styles.panelTitle}>Recent Jobs</h3>
            <button style={styles.linkBtn} onClick={() => navigate("/jobs")}>View all</button>
          </div>
          {recentJobs.length === 0 ? (
            <p style={styles.empty}>No jobs yet</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>ID</th>
                  <th style={styles.th}>Operation</th>
                  <th style={styles.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map((j) => (
                  <tr key={j.id} style={styles.tr}>
                    <td style={styles.tdMono}>{j.id.slice(0, 8)}...</td>
                    <td style={styles.td}>{j.operation}</td>
                    <td style={styles.td}>
                      <StatusBadge status={j.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {info && (
        <div style={styles.infoBar}>
          <span>Version: {info.version}</span>
          <span>Platform: {info.platform}</span>
          <span>Backends: {info.backends.join(", ") || "none"}</span>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ ...styles.statCard, borderLeftColor: color }}>
      <p style={styles.statLabel}>{label}</p>
      <p style={{ ...styles.statValue, color }}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ok: "#38a169",
    healthy: "#38a169",
    completed: "#38a169",
    running: "#3182ce",
    pending: "#d69e2e",
    failed: "#e53e3e",
    error: "#e53e3e",
    cancelled: "#718096",
  };
  const bg = colors[status] || "#a0aec0";
  return (
    <span style={{ ...styles.badge, backgroundColor: bg }}>
      {status}
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  heading: { fontSize: 22, fontWeight: 700, marginBottom: 24, color: "#1a1a2e" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 },
  statCard: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: "16px 20px",
    borderLeft: "4px solid",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  },
  statLabel: { fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  statValue: { fontSize: 22, fontWeight: 700 },
  row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 },
  panel: {
    backgroundColor: "#fff",
    borderRadius: 8,
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    overflow: "hidden",
  },
  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    borderBottom: "1px solid #eee",
  },
  panelTitle: { fontSize: 15, fontWeight: 600, color: "#1a1a2e" },
  linkBtn: {
    background: "none",
    border: "none",
    color: "#6c63ff",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  },
  empty: { padding: 20, color: "#888", fontSize: 13 },
  table: { width: "100%", borderCollapse: "collapse" as const },
  th: { textAlign: "left", padding: "10px 20px", fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase" as const, letterSpacing: 0.5 },
  tr: { borderTop: "1px solid #f5f5f5", cursor: "pointer" },
  td: { padding: "10px 20px", fontSize: 13, color: "#333" },
  tdMono: { padding: "10px 20px", fontSize: 12, fontFamily: "monospace", color: "#666" },
  badge: { display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, color: "#fff", textTransform: "capitalize" as const },
  infoBar: { display: "flex", gap: 24, padding: "12px 16px", backgroundColor: "#fff", borderRadius: 8, fontSize: 12, color: "#666", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" },
};
