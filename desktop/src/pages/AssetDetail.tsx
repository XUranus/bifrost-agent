import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getAsset, deleteAsset, startJob, listBackupCopies } from "../api/client";
import type { AssetResponse, BackupCopyResponse } from "../types";

export default function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [asset, setAsset] = useState<AssetResponse | null>(null);
  const [copies, setCopies] = useState<BackupCopyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!id) return;
    try {
      const [a, c] = await Promise.all([getAsset(id), listBackupCopies(id)]);
      setAsset(a);
      setCopies(c);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function handleBackup() {
    if (!id) return;
    try {
      await startJob(id, "backup");
      navigate("/jobs");
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!confirm("Delete this asset? This cannot be undone.")) return;
    try {
      await deleteAsset(id);
      navigate("/assets");
    } catch (e) {
      setError(String(e));
    }
  }

  if (loading) return <p style={{ color: "#666" }}>Loading asset...</p>;
  if (!asset) return <p style={{ color: "#e53e3e" }}>Asset not found</p>;

  return (
    <div>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate("/assets")}>&larr; Back</button>
        <h2 style={styles.heading}>{asset.name}</h2>
      </div>
      {error && <p style={styles.error}>{error}</p>}

      <div style={styles.grid}>
        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>Details</h3>
          <dl style={styles.dl}>
            <Dt label="Kind" value={asset.kind} />
            <Dt label="Health" value={asset.health} />
            <Dt label="Enabled" value={asset.enabled ? "Yes" : "No"} />
            <Dt label="Last Backup" value={asset.last_backup ? new Date(asset.last_backup).toLocaleString() : "Never"} />
            <Dt label="Next Backup" value={asset.next_backup ? new Date(asset.next_backup).toLocaleString() : "Not scheduled"} />
            <Dt label="Created" value={new Date(asset.created_at).toLocaleString()} />
            <Dt label="Config" value={JSON.stringify(asset.config, null, 2)} isCode />
          </dl>
        </div>

        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>SLA Policy: {asset.sla_policy.name}</h3>
          <dl style={styles.dl}>
            <Dt label="Copy Mode" value={asset.sla_policy.copy_mode} />
            <Dt label="Backup Type" value={asset.sla_policy.backup_type} />
            <Dt label="Schedule" value={asset.sla_policy.schedule_cron} />
            <Dt label="Block Size" value={formatBytes(asset.sla_policy.block_size)} />
            <Dt label="Subtasks" value={String(asset.sla_policy.subtask_count)} />
            <Dt label="Retention" value={`${asset.sla_policy.retention_kind}=${asset.sla_policy.retention_value}`} />
          </dl>
        </div>
      </div>

      <div style={styles.panel}>
        <h3 style={styles.panelTitle}>Backup Copies ({copies.length})</h3>
        {copies.length === 0 ? (
          <p style={styles.empty}>No backup copies yet</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Kind</th>
                <th style={styles.th}>Size</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Created</th>
              </tr>
            </thead>
            <tbody>
              {copies.map((c) => (
                <tr key={c.id}>
                  <td style={styles.td}>{c.kind}</td>
                  <td style={styles.td}>{c.size_bytes ? formatBytes(c.size_bytes) : "-"}</td>
                  <td style={styles.td}>{c.status}</td>
                  <td style={styles.td}>{new Date(c.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={styles.actions}>
        <button style={styles.backupBtn} onClick={handleBackup}>Backup Now</button>
        <button style={styles.deleteBtn} onClick={handleDelete}>Delete Asset</button>
      </div>
    </div>
  );
}

function Dt({ label, value, isCode }: { label: string; value: string; isCode?: boolean }) {
  return (
    <>
      <dt style={styles.dt}>{label}</dt>
      <dd style={{ ...styles.dd, fontFamily: isCode ? "monospace" : undefined, whiteSpace: isCode ? "pre-wrap" : undefined, fontSize: isCode ? 12 : 13 }}>
        {value}
      </dd>
    </>
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GiB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MiB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KiB`;
  return `${bytes} B`;
}

const styles: Record<string, React.CSSProperties> = {
  header: { display: "flex", alignItems: "center", gap: 16, marginBottom: 24 },
  backBtn: { background: "none", border: "none", color: "#6c63ff", cursor: "pointer", fontSize: 14, fontWeight: 600 },
  heading: { fontSize: 22, fontWeight: 700, color: "#1a1a2e" },
  error: { color: "#e53e3e", fontSize: 13, marginBottom: 16, padding: "8px 12px", backgroundColor: "#fff5f5", borderRadius: 6 },
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
  empty: { color: "#888", fontSize: 13, padding: 20 },
  table: { width: "100%", borderCollapse: "collapse" as const },
  th: { textAlign: "left", padding: "10px 16px", fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase" as const },
  td: { padding: "10px 16px", fontSize: 13, color: "#333", borderTop: "1px solid #f5f5f5" },
  actions: { display: "flex", gap: 12, paddingTop: 16 },
  backupBtn: {
    padding: "10px 24px",
    backgroundColor: "#6c63ff",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
  },
  deleteBtn: {
    padding: "10px 24px",
    backgroundColor: "#fff",
    color: "#e53e3e",
    border: "1px solid #e53e3e",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
  },
};
