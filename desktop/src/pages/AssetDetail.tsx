import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getAsset,
  deleteAsset,
  startJob,
  listBackupCopies,
  browseCopy,
  startRestore,
} from "../api/client";
import { useToast } from "../components/Toast";
import type { AssetResponse, BackupCopyResponse, DirEntry } from "../types";

export default function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [asset, setAsset] = useState<AssetResponse | null>(null);
  const [copies, setCopies] = useState<BackupCopyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [browseCopyId, setBrowseCopyId] = useState<string | null>(null);
  const [browseEntries, setBrowseEntries] = useState<DirEntry[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browsePath, setBrowsePath] = useState<string>("");
  const [restoring, setRestoring] = useState<string | null>(null);

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

  useEffect(() => {
    load();
  }, [id]);

  async function handleBackup() {
    if (!id) return;
    try {
      await startJob(id, "backup");
      pushToast("Backup job started", "success");
      navigate("/jobs");
    } catch (e) {
      setError(String(e));
      pushToast("Failed to start backup", "error");
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!confirm("Delete this asset? This cannot be undone.")) return;
    try {
      await deleteAsset(id);
      pushToast("Asset deleted", "success");
      navigate("/assets");
    } catch (e) {
      setError(String(e));
      pushToast("Failed to delete asset", "error");
    }
  }

  async function handleBrowse(copyId: string) {
    if (browseCopyId === copyId) {
      // Toggle off
      setBrowseCopyId(null);
      return;
    }
    setBrowseCopyId(copyId);
    setBrowsePath("");
    setBrowseLoading(true);
    try {
      const entries = await browseCopy(copyId);
      setBrowseEntries(entries);
    } catch (e) {
      pushToast(`Browse failed: ${e}`, "error");
      setBrowseEntries([]);
    } finally {
      setBrowseLoading(false);
    }
  }

  async function handleBrowseSubpath(copyId: string, subpath: string) {
    setBrowsePath(subpath);
    setBrowseLoading(true);
    try {
      const entries = await browseCopy(copyId, subpath);
      setBrowseEntries(entries);
    } catch (e) {
      pushToast(`Browse failed: ${e}`, "error");
    } finally {
      setBrowseLoading(false);
    }
  }

  async function handleRestore(copyId: string) {
    if (!id || !asset) return;
    const target =
      asset.config.type === "Fileset"
        ? { kind: "Original" as const }
        : { kind: "Original" as const };
    const confirmed = window.confirm(
      `Restore from copy ${copyId.slice(0, 8)}... to original location?`
    );
    if (!confirmed) return;

    setRestoring(copyId);
    try {
      await startRestore({
        asset_id: id,
        copy_id: copyId,
        entries: [{ path: "/", kind: "file" }],
        destination: target,
        conflict_policy: "replace",
      });
      pushToast("Restore job started", "success");
      navigate("/jobs");
    } catch (e) {
      pushToast(`Restore failed: ${e}`, "error");
    } finally {
      setRestoring(null);
    }
  }

  if (loading) return <p style={{ color: "#666" }}>Loading asset...</p>;
  if (!asset) return <p style={{ color: "#e53e3e" }}>Asset not found</p>;

  return (
    <div>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate("/assets")}>
          &larr; Back
        </button>
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
            <Dt
              label="Last Backup"
              value={
                asset.last_backup
                  ? new Date(asset.last_backup).toLocaleString()
                  : "Never"
              }
            />
            <Dt
              label="Next Backup"
              value={
                asset.next_backup
                  ? new Date(asset.next_backup).toLocaleString()
                  : "Not scheduled"
              }
            />
            <Dt
              label="Created"
              value={new Date(asset.created_at).toLocaleString()}
            />
            <Dt
              label="Config"
              value={JSON.stringify(asset.config, null, 2)}
              isCode
            />
          </dl>
        </div>

        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>
            SLA Policy: {asset.sla_policy.name}
          </h3>
          <dl style={styles.dl}>
            <Dt label="Copy Mode" value={asset.sla_policy.copy_mode} />
            <Dt label="Backup Type" value={asset.sla_policy.backup_type} />
            <Dt label="Schedule" value={asset.sla_policy.schedule_cron} />
            <Dt
              label="Block Size"
              value={formatBytes(asset.sla_policy.block_size)}
            />
            <Dt
              label="Subtasks"
              value={String(asset.sla_policy.subtask_count)}
            />
            <Dt
              label="Retention"
              value={`${asset.sla_policy.retention_kind}=${asset.sla_policy.retention_value}`}
            />
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
                <th style={styles.th}>Files</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Created</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {copies.map((c) => (
                <tr key={c.id}>
                  <td style={styles.td}>{c.kind}</td>
                  <td style={styles.td}>
                    {c.size_bytes ? formatBytes(c.size_bytes) : "-"}
                  </td>
                  <td style={styles.td}>{c.file_count ?? "-"}</td>
                  <td style={styles.td}>
                    <span
                      style={{
                        ...styles.statusBadge,
                        backgroundColor:
                          c.status === "active" ? "#38a169" : "#718096",
                      }}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {new Date(c.created_at).toLocaleString()}
                  </td>
                  <td style={styles.td}>
                    <button
                      style={styles.actionBtn}
                      onClick={() => handleBrowse(c.id)}
                    >
                      {browseCopyId === c.id ? "Hide" : "Browse"}
                    </button>
                    <button
                      style={{ ...styles.actionBtn, marginLeft: 8 }}
                      onClick={() => handleRestore(c.id)}
                      disabled={restoring === c.id}
                    >
                      {restoring === c.id ? "Restoring..." : "Restore"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {browseCopyId && (
          <div style={styles.browsePanel}>
            <div style={styles.browseHeader}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e" }}>
                Browse: /{browsePath}
              </span>
              {browsePath && (
                <button
                  style={styles.backBtn}
                  onClick={() => {
                    const parent = browsePath.split("/").slice(0, -1).join("/");
                    handleBrowseSubpath(browseCopyId, parent);
                  }}
                >
                  &larr; Up
                </button>
              )}
            </div>
            {browseLoading ? (
              <p style={{ color: "#888", padding: 16 }}>Loading...</p>
            ) : browseEntries.length === 0 ? (
              <p style={{ color: "#888", padding: 16 }}>Empty directory</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Name</th>
                    <th style={styles.th}>Type</th>
                    <th style={styles.th}>Size</th>
                    <th style={styles.th}>Modified</th>
                  </tr>
                </thead>
                <tbody>
                  {browseEntries.map((entry, i) => (
                    <tr key={i}>
                      <td
                        style={{
                          ...styles.td,
                          cursor: entry.kind === "dir" ? "pointer" : undefined,
                          color: entry.kind === "dir" ? "#6c63ff" : "#333",
                          fontWeight: entry.kind === "dir" ? 600 : 400,
                        }}
                        onClick={() => {
                          if (
                            entry.kind === "dir" &&
                            browseCopyId
                          ) {
                            handleBrowseSubpath(
                              browseCopyId,
                              browsePath ? `${browsePath}/${entry.name}` : entry.name
                            );
                          }
                        }}
                      >
                        {entry.kind === "dir" ? "📁 " : "  "}
                        {entry.name}
                      </td>
                      <td style={styles.td}>{entry.kind}</td>
                      <td style={styles.td}>
                        {entry.kind === "file" ? formatBytes(entry.size) : "-"}
                      </td>
                      <td style={styles.td}>
                        {entry.modified
                          ? new Date(entry.modified).toLocaleString()
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <div style={styles.actions}>
        <button style={styles.backupBtn} onClick={handleBackup}>
          Backup Now
        </button>
        <button style={styles.deleteBtn} onClick={handleDelete}>
          Delete Asset
        </button>
      </div>
    </div>
  );
}

function Dt({
  label,
  value,
  isCode,
}: {
  label: string;
  value: string;
  isCode?: boolean;
}) {
  return (
    <>
      <dt style={styles.dt}>{label}</dt>
      <dd
        style={{
          ...styles.dd,
          fontFamily: isCode ? "monospace" : undefined,
          whiteSpace: isCode ? "pre-wrap" : undefined,
          fontSize: isCode ? 12 : 13,
        }}
      >
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
  backBtn: {
    background: "none",
    border: "none",
    color: "#6c63ff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
  },
  heading: { fontSize: 22, fontWeight: 700, color: "#1a1a2e" },
  error: {
    color: "#e53e3e",
    fontSize: 13,
    marginBottom: 16,
    padding: "8px 12px",
    backgroundColor: "#fff5f5",
    borderRadius: 6,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
    marginBottom: 16,
  },
  panel: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 20,
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    marginBottom: 16,
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: "#1a1a2e",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: "1px solid #eee",
  },
  dl: { display: "grid", gridTemplateColumns: "120px 1fr", gap: "6px 12px" },
  dt: {
    fontSize: 12,
    fontWeight: 600,
    color: "#888",
    textTransform: "uppercase" as const,
  },
  dd: { fontSize: 13, color: "#333" },
  empty: { color: "#888", fontSize: 13, padding: 20 },
  table: { width: "100%", borderCollapse: "collapse" as const },
  th: {
    textAlign: "left" as const,
    padding: "10px 16px",
    fontSize: 11,
    fontWeight: 600,
    color: "#888",
    textTransform: "uppercase" as const,
  },
  td: { padding: "10px 16px", fontSize: 13, color: "#333", borderTop: "1px solid #f5f5f5" },
  statusBadge: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 600,
    color: "#fff",
    textTransform: "capitalize" as const,
  },
  actionBtn: {
    padding: "4px 10px",
    backgroundColor: "#6c63ff",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 600,
  },
  browsePanel: {
    marginTop: 16,
    border: "1px solid #eee",
    borderRadius: 6,
    overflow: "hidden",
  },
  browseHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 16px",
    backgroundColor: "#f7f7ff",
    borderBottom: "1px solid #eee",
  },
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
