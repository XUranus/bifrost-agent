import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getAsset,
  deleteAsset,
  testAsset,
  startJob,
  listBackupCopies,
  deleteBackupCopy,
  browseCopy,
  startRestore,
} from "../api/client";
import { useToast } from "../components/Toast";
import { Skeleton, SkeletonPanel, SkeletonTable } from "../components/Skeleton";
import { useI18n } from "../i18n";
import type { AssetResponse, BackupCopyResponse, DirEntry } from "../types";

export default function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const { t } = useI18n();
  const [asset, setAsset] = useState<AssetResponse | null>(null);
  const [copies, setCopies] = useState<BackupCopyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [browseCopyId, setBrowseCopyId] = useState<string | null>(null);
  const [browseEntries, setBrowseEntries] = useState<DirEntry[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browsePath, setBrowsePath] = useState<string>("");
  const [testing, setTesting] = useState(false);
  const [restoreCopyId, setRestoreCopyId] = useState<string | null>(null);

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
      pushToast(t("assetDetail.backupStarted"), "success");
      navigate("/jobs");
    } catch (e) {
      pushToast(t("assetDetail.backupFailed"), "error");
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!confirm(t("assetDetail.confirmDeleteAsset"))) return;
    try {
      await deleteAsset(id);
      pushToast(t("assetDetail.assetDeleted"), "success");
      navigate("/assets");
    } catch (e) {
      pushToast(t("assetDetail.deleteFailed"), "error");
    }
  }

  async function handleTest() {
    if (!id) return;
    setTesting(true);
    try {
      const result = await testAsset(id) as { healthy: boolean; message: string };
      pushToast(result.message, result.healthy ? "success" : "error");
    } catch (e) {
      pushToast(`Test failed: ${e}`, "error");
    } finally {
      setTesting(false);
    }
  }

  async function handleDeleteCopy(copyId: string) {
    if (!confirm(t("assetDetail.confirmDeleteCopy"))) return;
    try {
      await deleteBackupCopy(copyId);
      pushToast(t("assetDetail.copyDeleted"), "success");
      setCopies((prev) => prev.filter((c) => c.id !== copyId));
    } catch (e) {
      pushToast(t("assetDetail.copyDeleteFailed") + `: ${e}`, "error");
    }
  }

  async function handleBrowse(copyId: string) {
    if (browseCopyId === copyId) { setBrowseCopyId(null); return; }
    setBrowseCopyId(copyId);
    setBrowsePath("");
    setBrowseLoading(true);
    try {
      setBrowseEntries(await browseCopy(copyId));
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
      setBrowseEntries(await browseCopy(copyId, subpath));
    } catch (e) {
      pushToast(`Browse failed: ${e}`, "error");
    } finally {
      setBrowseLoading(false);
    }
  }

  async function handleRestoreConfirm(opts: { copyId: string; sourcePath: string; destination: { kind: string; path?: string }; conflictPolicy: string }) {
    if (!id || !asset) return;
    setRestoreCopyId(opts.copyId);
    try {
      await startRestore({
        asset_id: id,
        copy_id: opts.copyId,
        entries: [{ path: opts.sourcePath, kind: "file" }],
        destination: opts.destination.kind === "Original"
          ? { kind: "Original" }
          : { kind: "New", path: opts.destination.path },
        conflict_policy: opts.conflictPolicy,
      });
      pushToast(t("assetDetail.restoreStarted"), "success");
      navigate("/jobs");
    } catch (e) {
      pushToast(t("assetDetail.restoreFailed") + `: ${e}`, "error");
    } finally {
      setRestoreCopyId(null);
    }
  }

  if (loading) {
    return (
      <div>
        <div className="page-header"><Skeleton width="30%" height={22} /></div>
        <div className="card-grid-2col"><SkeletonPanel rows={6} /><SkeletonPanel rows={6} /></div>
        <SkeletonTable rows={3} cols={6} />
      </div>
    );
  }
  if (!asset) return <p className="error-msg">{t("assetDetail.assetNotFound")}</p>;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button className="btn-ghost" onClick={() => navigate("/assets")}>&larr; {t("common.back")}</button>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>{asset.name}</h2>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-secondary btn-sm" onClick={() => navigate(`/assets/${id}/edit`)}>{t("assetDetail.edit")}</button>
          <button className="btn-secondary btn-sm" onClick={handleTest} disabled={testing}>
            {testing ? t("assetDetail.testing") : t("assetDetail.test")}
          </button>
        </div>
      </div>
      {error && <p className="error-msg">{error}</p>}

      <div className="card-grid-2col">
        <div className="glass-panel">
          <div className="panel-header"><h3>{t("assetDetail.details")}</h3></div>
          <div className="panel-body">
            <dl className="detail-list">
              <dt>{t("assetDetail.kind")}</dt><dd>{asset.kind}</dd>
              <dt>{t("assetDetail.health")}</dt><dd><span className={`badge badge-${asset.health}`}>{asset.health}</span></dd>
              <dt>{t("assetDetail.enabled")}</dt><dd>{asset.enabled ? t("assetDetail.yes") : t("assetDetail.no")}</dd>
              <dt>{t("assetDetail.lastBackup")}</dt><dd>{asset.last_backup ? new Date(asset.last_backup).toLocaleString() : t("assetDetail.never")}</dd>
              <dt>{t("assetDetail.nextBackup")}</dt><dd>{asset.next_backup ? new Date(asset.next_backup).toLocaleString() : t("assetDetail.notScheduled")}</dd>
              <dt>{t("assetDetail.created")}</dt><dd>{new Date(asset.created_at).toLocaleString()}</dd>
              <dt>{t("assetDetail.config")}</dt><dd className="code">{JSON.stringify(asset.config, null, 2)}</dd>
            </dl>
          </div>
        </div>

        <div className="glass-panel">
          <div className="panel-header"><h3>{t("assetDetail.slaPolicy")}: {asset.sla_policy.name}</h3></div>
          <div className="panel-body">
            <dl className="detail-list">
              <dt>{t("assetDetail.copyMode")}</dt><dd>{asset.sla_policy.copy_mode}</dd>
              <dt>{t("assetDetail.backupType")}</dt><dd>{asset.sla_policy.backup_type}</dd>
              <dt>{t("assetDetail.schedule")}</dt><dd>{asset.sla_policy.schedule_cron}</dd>
              <dt>{t("assetDetail.blockSize")}</dt><dd>{formatBytes(asset.sla_policy.block_size)}</dd>
              <dt>{t("assetDetail.subtasks")}</dt><dd>{String(asset.sla_policy.subtask_count)}</dd>
              <dt>{t("assetDetail.retention")}</dt><dd>{`${asset.sla_policy.retention_kind}=${asset.sla_policy.retention_value}`}</dd>
            </dl>
          </div>
        </div>
      </div>

      <div className="glass-panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <h3>{t("assetDetail.backupCopies")} ({copies.length})</h3>
        </div>
        {copies.length === 0 ? (
          <p className="empty-state">{t("assetDetail.noCopies")}</p>
        ) : (
          <table className="glass-table">
            <thead>
              <tr>
                <th>{t("assetDetail.tableKind")}</th><th>{t("assetDetail.tableSize")}</th><th>{t("assetDetail.tableFiles")}</th><th>{t("assetDetail.tableStatus")}</th><th>{t("assetDetail.tableCreated")}</th><th>{t("assetDetail.tableActions")}</th>
              </tr>
            </thead>
            <tbody>
              {copies.map((c) => (
                <tr key={c.id}>
                  <td>{c.kind}</td>
                  <td>{c.size_bytes ? formatBytes(c.size_bytes) : "-"}</td>
                  <td>{c.file_count ?? "-"}</td>
                  <td><span className={`badge badge-${c.status}`}>{c.status}</span></td>
                  <td>{new Date(c.created_at).toLocaleString()}</td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <button className="btn-primary btn-sm" onClick={() => handleBrowse(c.id)}>
                      {browseCopyId === c.id ? t("assetDetail.hide") : t("assetDetail.browse")}
                    </button>
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => setRestoreCopyId(c.id)}
                      disabled={restoreCopyId === c.id}
                    >
                      {t("assetDetail.restore")}
                    </button>
                    <button
                      className="btn-danger btn-sm"
                      onClick={() => handleDeleteCopy(c.id)}
                    >
                      {t("common.delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {browseCopyId && (
          <div className="browse-panel">
            <div className="browse-header">
              <span>{t("assetDetail.browseTitle")}: /{browsePath}</span>
              {browsePath && (
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => {
                    const parent = browsePath.split("/").slice(0, -1).join("/");
                    handleBrowseSubpath(browseCopyId, parent);
                  }}
                >
                  &larr; {t("assetDetail.up")}
                </button>
              )}
            </div>
            {browseLoading ? (
              <p className="loading-text" style={{ padding: 16 }}>{t("assetDetail.loadingDir")}</p>
            ) : browseEntries.length === 0 ? (
              <p className="loading-text" style={{ padding: 16 }}>{t("assetDetail.emptyDir")}</p>
            ) : (
              <table className="glass-table">
                <thead>
                  <tr><th>{t("assetDetail.tableName")}</th><th>{t("assetDetail.tableType")}</th><th>{t("assetDetail.tableSize")}</th><th>{t("assetDetail.tableModified")}</th></tr>
                </thead>
                <tbody>
                  {browseEntries.map((entry, i) => (
                    <tr key={i}>
                      <td
                        className={entry.kind === "dir" ? "td-link" : ""}
                        style={{ cursor: entry.kind === "dir" ? "pointer" : undefined, fontWeight: entry.kind === "dir" ? 600 : 400 }}
                        onClick={() => {
                          if (entry.kind === "dir" && browseCopyId) {
                            handleBrowseSubpath(browseCopyId, browsePath ? `${browsePath}/${entry.name}` : entry.name);
                          }
                        }}
                      >
                        {entry.kind === "dir" ? "📁 " : "  "}{entry.name}
                      </td>
                      <td>{entry.kind}</td>
                      <td>{entry.kind === "file" ? formatBytes(entry.size) : "-"}</td>
                      <td>{entry.modified ? new Date(entry.modified).toLocaleString() : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, paddingTop: 16 }}>
        <button className="btn-primary btn-lg" onClick={handleBackup}>{t("assetDetail.backupNow")}</button>
        <button className="btn-danger" onClick={handleDelete}>{t("assetDetail.deleteAsset")}</button>
      </div>

      {restoreCopyId && (
        <RestoreModal
          copyId={restoreCopyId}
          defaultSourcePath={browseCopyId === restoreCopyId && browsePath ? browsePath : "/"}
          onConfirm={handleRestoreConfirm}
          onCancel={() => setRestoreCopyId(null)}
          restoring={restoreCopyId !== null}
        />
      )}
    </div>
  );
}

/* --- Restore Modal --- */

interface RestoreModalProps {
  copyId: string;
  defaultSourcePath: string;
  onConfirm: (opts: { copyId: string; sourcePath: string; destination: { kind: string; path?: string }; conflictPolicy: string }) => void;
  onCancel: () => void;
  restoring: boolean;
}

function RestoreModal({ copyId, defaultSourcePath, onConfirm, onCancel, restoring }: RestoreModalProps) {
  const { t } = useI18n();
  const [sourcePath, setSourcePath] = useState(defaultSourcePath);
  const [destKind, setDestKind] = useState<"Original" | "New">("Original");
  const [destPath, setDestPath] = useState("");
  const [conflictPolicy, setConflictPolicy] = useState("replace");

  function handleSubmit() {
    onConfirm({
      copyId,
      sourcePath,
      destination: destKind === "Original" ? { kind: "Original" } : { kind: "New", path: destPath },
      conflictPolicy,
    });
  }

  return (
    <div className="log-overlay" onClick={onCancel}>
      <div className="glass-modal" style={{ width: 480, padding: 28, maxHeight: "80vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>
          {t("restore.title")}
        </h3>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 16 }}>
          {t("restore.copy")}: {copyId.slice(0, 8)}...
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <label style={labelStyle}>
            {t("restore.sourcePath")}
            <input className="glass-input" value={sourcePath} onChange={(e) => setSourcePath(e.target.value)} placeholder="/" />
          </label>

          <div>
            <span style={labelStyle}>{t("restore.destination")}</span>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button
                className={`btn-pill${destKind === "Original" ? " btn-pill-active" : ""}`}
                onClick={() => setDestKind("Original")}
              >
                {t("restore.original")}
              </button>
              <button
                className={`btn-pill${destKind === "New" ? " btn-pill-active" : ""}`}
                onClick={() => setDestKind("New")}
              >
                {t("restore.custom")}
              </button>
            </div>
            {destKind === "New" && (
              <input
                className="glass-input"
                style={{ marginTop: 8 }}
                value={destPath}
                onChange={(e) => setDestPath(e.target.value)}
                placeholder="/path/to/restore"
              />
            )}
          </div>

          <label style={labelStyle}>
            {t("restore.conflictPolicy")}
            <select className="glass-input" value={conflictPolicy} onChange={(e) => setConflictPolicy(e.target.value)}>
              <option value="replace">{t("restore.replace")}</option>
              <option value="skip">{t("restore.skip")}</option>
              <option value="rename">{t("restore.rename")}</option>
            </select>
          </label>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--glass-border-subtle)" }}>
          <button className="btn-secondary" onClick={onCancel}>{t("common.cancel")}</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={restoring || (destKind === "New" && !destPath.trim())}>
            {restoring ? t("restore.starting") : t("restore.start")}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GiB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MiB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KiB`;
  return `${bytes} B`;
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-secondary)",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  textTransform: "uppercase",
  letterSpacing: "0.3px",
};
