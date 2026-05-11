import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getHealth, getAgentInfo, listAssets, listJobs, listBackupCopies } from "../api/client";
import { useI18n } from "../i18n";
import { Skeleton, SkeletonPanel } from "../components/Skeleton";
import ScheduleTimeline from "../components/ScheduleTimeline";
import type { HealthResponse, AgentInfoResponse, AssetResponse, JobResponse, BackupCopyResponse } from "../types";

export default function Dashboard() {
  const { t } = useI18n();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [info, setInfo] = useState<AgentInfoResponse | null>(null);
  const [assets, setAssets] = useState<AssetResponse[]>([]);
  const [recentJobs, setRecentJobs] = useState<JobResponse[]>([]);
  const [copiesByAsset, setCopiesByAsset] = useState<Map<string, BackupCopyResponse[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const [h, i, a, j] = await Promise.all([
          getHealth(),
          getAgentInfo(),
          listAssets(),
          listJobs({ limit: 20 }),
        ]);
        setHealth(h);
        setInfo(i);
        setAssets(a);
        setRecentJobs(j);

        const copyMap = new Map<string, BackupCopyResponse[]>();
        await Promise.all(a.map(async (asset) => {
          try {
            const copies = await listBackupCopies(asset.id);
            copyMap.set(asset.id, copies);
          } catch { /* skip */ }
        }));
        setCopiesByAsset(copyMap);
      } catch (e) {
        console.error("Dashboard load error:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div>
        <div className="page-header"><h2>{t("dashboard.title")}</h2></div>
        <div className="stat-grid">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="glass-card stat-card"><Skeleton width="60%" height={12} style={{ marginBottom: 8 }} /><Skeleton width="40%" height={22} /></div>
          ))}
        </div>
        <div className="card-grid-2col"><SkeletonPanel rows={3} /><SkeletonPanel rows={3} /></div>
      </div>
    );
  }

  const healthyCount = assets.filter((a) => a.health === "ok").length;
  const warnCount = assets.filter((a) => a.health === "warn").length;
  const errorCount = assets.filter((a) => a.health === "error").length;

  const completedJobs = recentJobs.filter((j) => j.status === "completed").length;
  const failedJobs = recentJobs.filter((j) => j.status === "failed").length;
  const runningJobs = recentJobs.filter((j) => j.status === "running" || j.status === "pending").length;

  const nextBackup = findNextBackup(assets);

  const storageByAsset = assets.map((a) => {
    const copies = copiesByAsset.get(a.id) || [];
    const totalBytes = copies.reduce((sum, c) => sum + (c.size_bytes || 0), 0);
    return { name: a.name, bytes: totalBytes };
  }).filter((s) => s.bytes > 0).sort((a, b) => b.bytes - a.bytes).slice(0, 5);
  const totalStorage = storageByAsset.reduce((sum, s) => sum + s.bytes, 0);
  const maxStorage = storageByAsset.length > 0 ? storageByAsset[0].bytes : 0;

  return (
    <div>
      <div className="page-header">
        <h2>{t("dashboard.title")}</h2>
        <button className="btn-primary btn-sm" onClick={() => navigate("/assets/new")}>{t("dashboard.newAsset")}</button>
      </div>

      <div className="stat-grid">
        <StatCard label={t("dashboard.agent")} value={health?.status === "ok" ? t("dashboard.online") : t("dashboard.offline")} color={health?.status === "ok" ? "var(--status-ok)" : "var(--status-error)"} />
        <StatCard label={t("dashboard.uptime")} value={info ? formatUptimeCompact(info.uptime_seconds) : "-"} color="var(--accent)" />
        <StatCard label={t("dashboard.assets")} value={`${assets.length} ${t("dashboard.total")}`} color="var(--status-info)" />
        <StatCard label={t("dashboard.nextBackup")} value={nextBackup || t("dashboard.noneScheduled")} color="var(--status-warn)" />
      </div>

      <ScheduleTimeline />

      <div className="card-grid-3col" style={{ marginBottom: 16 }}>
        <div className="glass-panel">
          <div className="panel-header"><h3>{t("dashboard.assetHealth")}</h3></div>
          <div className="panel-body">
            {assets.length === 0 ? (
              <p className="empty-state">{t("dashboard.noAssets")}</p>
            ) : (
              <div className="health-bar">
                {healthyCount > 0 && (
                  <div className="health-segment health-ok" style={{ flex: healthyCount }}>
                    <span>{healthyCount} {t("dashboard.healthy")}</span>
                  </div>
                )}
                {warnCount > 0 && (
                  <div className="health-segment health-warn" style={{ flex: warnCount }}>
                    <span>{warnCount} {t("dashboard.warning")}</span>
                  </div>
                )}
                {errorCount > 0 && (
                  <div className="health-segment health-error" style={{ flex: errorCount }}>
                    <span>{errorCount} {t("dashboard.error")}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="glass-panel">
          <div className="panel-header"><h3>{t("dashboard.recentJobs")}</h3></div>
          <div className="panel-body">
            {recentJobs.length === 0 ? (
              <p className="empty-state">{t("dashboard.noJobs")}</p>
            ) : (
              <div className="job-stats-row">
                {runningJobs > 0 && <span className="badge badge-running">{runningJobs} {t("dashboard.running")}</span>}
                {completedJobs > 0 && <span className="badge badge-completed">{completedJobs} {t("dashboard.completed")}</span>}
                {failedJobs > 0 && <span className="badge badge-failed">{failedJobs} {t("dashboard.failed")}</span>}
                {runningJobs === 0 && completedJobs === 0 && failedJobs === 0 && (
                  <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{t("dashboard.noRecentActivity")}</span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="glass-panel">
          <div className="panel-header"><h3>{t("dashboard.storage")}</h3></div>
          <div className="panel-body">
            {totalStorage === 0 ? (
              <p className="empty-state">{t("dashboard.noBackupData")}</p>
            ) : (
              <>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
                  {t("dashboard.totalStorage")}: <strong style={{ color: "var(--text-primary)" }}>{formatBytes(totalStorage)}</strong>
                </div>
                <div className="storage-bars">
                  {storageByAsset.map((s, i) => (
                    <div key={i} className="storage-bar-row">
                      <span className="storage-bar-label">{s.name}</span>
                      <div className="storage-bar-track">
                        <div className="storage-bar-fill" style={{ width: `${(s.bytes / maxStorage) * 100}%` }} />
                      </div>
                      <span className="storage-bar-size">{formatBytes(s.bytes)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="card-grid-2col">
        <div className="glass-panel">
          <div className="panel-header">
            <h3>{t("dashboard.assets")}</h3>
            <button className="btn-ghost btn-sm" onClick={() => navigate("/assets")}>{t("dashboard.viewAll")}</button>
          </div>
          {assets.length === 0 ? (
            <div className="empty-state">
              <p>{t("dashboard.noAssets")}</p>
              <button className="btn-primary btn-sm" onClick={() => navigate("/assets/new")} style={{ marginTop: 8 }}>
                {t("dashboard.createFirst")}
              </button>
            </div>
          ) : (
            <table className="glass-table">
              <thead>
                <tr><th>{t("dashboard.tableName")}</th><th>{t("dashboard.tableKind")}</th><th>{t("dashboard.tableHealth")}</th></tr>
              </thead>
              <tbody>
                {assets.slice(0, 5).map((a) => (
                  <tr key={a.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/assets/${a.id}`)}>
                    <td>{a.name}</td>
                    <td>{a.kind}</td>
                    <td><span className={`badge badge-${a.health}`}>{a.health}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="glass-panel">
          <div className="panel-header">
            <h3>{t("dashboard.recentJobs")}</h3>
            <button className="btn-ghost btn-sm" onClick={() => navigate("/jobs")}>{t("dashboard.viewAll")}</button>
          </div>
          {recentJobs.length === 0 ? (
            <p className="empty-state">{t("dashboard.noJobs")}</p>
          ) : (
            <table className="glass-table">
              <thead>
                <tr><th>{t("dashboard.tableId")}</th><th>{t("dashboard.tableOperation")}</th><th>{t("dashboard.tableStatus")}</th></tr>
              </thead>
              <tbody>
                {recentJobs.slice(0, 5).map((j) => (
                  <tr key={j.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/jobs/${j.id}`)}>
                    <td className="td-mono td-link">{j.id.slice(0, 8)}...</td>
                    <td>{j.operation}</td>
                    <td><span className={`badge badge-${j.status}`}>{j.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {info && (
        <div className="glass-panel info-bar">
          <span>{t("dashboard.infoVersion")}: {info.version}</span>
          <span>{t("dashboard.infoPlatform")}: {info.platform}</span>
          <span>{t("dashboard.infoBackends")}: {info.backends.join(", ") || "none"}</span>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="glass-card stat-card" style={{ borderLeftColor: color }}>
      <p className="stat-label">{label}</p>
      <p className="stat-value" style={{ color }}>{value}</p>
    </div>
  );
}

function formatUptimeCompact(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GiB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MiB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KiB`;
  return `${bytes} B`;
}

function findNextBackup(assets: AssetResponse[]): string | null {
  const now = Date.now();
  let nearest: number | null = null;
  for (const a of assets) {
    if (!a.next_backup) continue;
    const t = new Date(a.next_backup).getTime();
    if (t > now && (nearest === null || t < nearest)) {
      nearest = t;
    }
  }
  if (nearest === null) return null;
  const diff = nearest - now;
  const hours = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
