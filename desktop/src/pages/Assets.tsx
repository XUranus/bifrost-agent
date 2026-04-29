import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { listAssets, startJob } from "../api/client";
import type { AssetResponse } from "../types";

export default function AssetsPage() {
  const [assets, setAssets] = useState<AssetResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function load() {
    try {
      setAssets(await listAssets());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleBackup(assetId: string) {
    try {
      await startJob(assetId, "backup");
      navigate("/jobs");
    } catch (e) {
      setError(String(e));
    }
  }

  if (loading) return <p style={{ color: "#666" }}>Loading...</p>;

  return (
    <div>
      <div style={styles.header}>
        <h2 style={styles.heading}>Protected Assets</h2>
        <button style={styles.addBtn} onClick={() => navigate("/assets/new")}>+ New Asset</button>
      </div>
      {error && <p style={styles.error}>{error}</p>}
      {assets.length === 0 ? (
        <div style={styles.emptyState}>
          <p>No assets configured yet.</p>
          <p>Create a protected asset to start backing up your data.</p>
        </div>
      ) : (
        <div style={styles.grid}>
          {assets.map((asset) => (
            <div key={asset.id} style={styles.card} onClick={() => navigate(`/assets/${asset.id}`)}>
              <div style={styles.cardHeader}>
                <h3 style={styles.cardTitle}>{asset.name}</h3>
                <span style={{ ...styles.kindBadge, backgroundColor: kindColor(asset.kind) }}>
                  {asset.kind}
                </span>
              </div>
              <div style={styles.cardMeta}>
                <span>Health: <strong>{asset.health}</strong></span>
                <span>SLA: {asset.sla_policy.name}</span>
              </div>
              <div style={styles.cardActions}>
                <button
                  style={styles.backupBtn}
                  onClick={(e) => { e.stopPropagation(); handleBackup(asset.id); }}
                >
                  Backup Now
                </button>
                <span style={styles.lastBackup}>
                  Last: {asset.last_backup ? new Date(asset.last_backup).toLocaleDateString() : "never"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function kindColor(kind: string): string {
  switch (kind) {
    case "fileset": return "#3182ce";
    case "volume": return "#d69e2e";
    case "nas_share": return "#38a169";
    default: return "#718096";
  }
}

const styles: Record<string, React.CSSProperties> = {
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  heading: { fontSize: 22, fontWeight: 700, color: "#1a1a2e" },
  addBtn: {
    padding: "10px 20px",
    backgroundColor: "#6c63ff",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
  },
  error: { color: "#e53e3e", fontSize: 13, marginBottom: 16, padding: "8px 12px", backgroundColor: "#fff5f5", borderRadius: 6 },
  emptyState: { textAlign: "center", padding: 60, color: "#888" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 20,
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    cursor: "pointer",
  },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: 600, color: "#1a1a2e" },
  kindBadge: { padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600, color: "#fff", textTransform: "capitalize" as const },
  cardMeta: { display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "#666", marginBottom: 12 },
  cardActions: { display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, borderTop: "1px solid #f5f5f5" },
  backupBtn: {
    padding: "6px 14px",
    backgroundColor: "#6c63ff",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
  },
  lastBackup: { fontSize: 12, color: "#888" },
};
