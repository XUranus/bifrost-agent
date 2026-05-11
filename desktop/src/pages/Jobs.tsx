import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { listJobs, cancelJob, deleteJob, listAssets } from "../api/client";
import { useToast } from "../components/Toast";
import { useAgentEvents } from "../hooks/useAgentEvents";
import { useI18n } from "../i18n";
import LogViewer from "../components/LogViewer";
import JobProgress from "../components/JobProgress";
import { SkeletonCard } from "../components/Skeleton";
import type { JobResponse, AssetResponse } from "../types";

interface ProgressData {
  phase: string;
  percent: number;
  throughput_bytes_per_sec: number;
  eta_seconds: number;
  current_item: string;
}

export default function JobsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobResponse[]>([]);
  const [assetMap, setAssetMap] = useState<Map<string, AssetResponse>>(new Map());
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [logJobId, setLogJobId] = useState<string | null>(null);
  const [progressMap, setProgressMap] = useState<Map<string, ProgressData>>(new Map());
  const { pushToast } = useToast();

  const load = useCallback(async () => {
    try {
      const params: { status?: string; limit?: number } = { limit: 50 };
      if (statusFilter) params.status = statusFilter;
      const [jobList, assetList] = await Promise.all([
        listJobs(params),
        listAssets().catch(() => [] as AssetResponse[]),
      ]);
      setJobs(jobList);
      const m = new Map<string, AssetResponse>();
      for (const a of assetList) m.set(a.id, a);
      setAssetMap(m);
    } catch (e) {
      console.error("Failed to load jobs:", e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  useAgentEvents({
    onJobStatus: (e) => {
      setJobs((prev) => prev.map((j) =>
        j.id === e.job_id ? { ...j, status: e.status } : j
      ));
      if (e.status === "completed" || e.status === "failed" || e.status === "cancelled") {
        setProgressMap((prev) => { const m = new Map(prev); m.delete(e.job_id); return m; });
        setTimeout(load, 1000);
      }
    },
    onJobProgress: (e) => {
      setProgressMap((prev) => {
        const m = new Map(prev);
        m.set(e.job_id, {
          phase: e.phase,
          percent: e.percent,
          throughput_bytes_per_sec: e.throughput_bytes_per_sec,
          eta_seconds: e.eta_seconds,
          current_item: e.current_item,
        });
        return m;
      });
    },
  });

  async function handleCancel(jobId: string) {
    try {
      await cancelJob(jobId);
      pushToast(t("jobs.cancelledToast"), "info");
      load();
    } catch {
      pushToast(t("jobs.cancelFailed"), "error");
    }
  }

  async function handleDelete(jobId: string) {
    if (!confirm(t("jobs.confirmDelete"))) return;
    try {
      await deleteJob(jobId);
      pushToast(t("jobs.deletedToast"), "info");
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    } catch {
      pushToast(t("jobs.deleteFailed"), "error");
    }
  }

  function getOpLabel(op: string): string {
    const key = `jobs.op.${op}` as string;
    const label = t(key);
    return label === key ? op.charAt(0).toUpperCase() + op.slice(1) : label;
  }

  function getStatusLabel(status: string): string {
    const key = `jobs.status.${status}` as string;
    const label = t(key);
    return label === key ? status.charAt(0).toUpperCase() + status.slice(1) : label;
  }

  if (loading) {
    return (
      <div>
        <div className="page-header"><h2>{t("jobs.title")}</h2></div>
        <div className="card-grid">{Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />)}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>{t("jobs.title")}</h2>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["", "running", "completed", "failed", "pending", "cancelled"].map((s) => (
          <button
            key={s}
            className={`btn-pill${statusFilter === s ? " btn-pill-active" : ""}`}
            onClick={() => setStatusFilter(s)}
          >
            {s === "" ? t("jobs.all") : t(`jobs.status.${s}`)}
          </button>
        ))}
      </div>

      {jobs.length === 0 ? (
        <div className="empty-state">
          <p>{t("jobs.noJobs")}</p>
        </div>
      ) : (
        <div className="card-grid">
          {jobs.map((j) => {
            const asset = assetMap.get(j.asset_id);
            const progress = progressMap.get(j.id);
            return (
              <div key={j.id} className="glass-card glass-card-lift" style={{ padding: 18 }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
                      {getOpLabel(j.operation)}
                    </span>
                    <span className={`badge badge-${j.status}`} style={{ marginLeft: 8 }}>
                      {getStatusLabel(j.status)}
                    </span>
                  </div>
                  <span className="td-mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                    {j.id.slice(0, 8)}
                  </span>
                </div>

                {/* Asset info */}
                <div
                  style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, cursor: "pointer" }}
                  onClick={() => navigate(`/assets/${j.asset_id}`)}
                >
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--accent)" }}>
                    {asset?.name || t("jobs.noAssetName")}
                  </span>
                  {asset && (
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                      {asset.kind}
                    </span>
                  )}
                </div>

                {/* Stats */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
                  <div>
                    <span style={{ color: "var(--text-tertiary)" }}>{t("jobs.size")}:</span>{" "}
                    {j.size_bytes ? formatBytes(j.size_bytes) : "-"}
                  </div>
                  <div>
                    <span style={{ color: "var(--text-tertiary)" }}>{t("jobs.files")}:</span>{" "}
                    {j.file_count ?? "-"}
                  </div>
                  <div>
                    <span style={{ color: "var(--text-tertiary)" }}>{t("jobs.errors")}:</span>{" "}
                    {j.error_count}
                  </div>
                </div>

                {/* Progress */}
                {j.status === "running" && progress && (
                  <div style={{ marginBottom: 12 }}>
                    <JobProgress data={progress} compact />
                  </div>
                )}

                {/* Started time */}
                {j.started_at && (
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 12 }}>
                    {t("jobs.started")}: {new Date(j.started_at).toLocaleString()}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: "flex", gap: 6, paddingTop: 10, borderTop: "1px solid var(--glass-border-subtle)" }}>
                  <button className="btn-primary btn-sm" onClick={() => navigate(`/jobs/${j.id}`)}>
                    {t("jobs.detail")}
                  </button>
                  <button className="btn-secondary btn-sm" onClick={() => setLogJobId(j.id)}>
                    {t("jobs.logs")}
                  </button>
                  {(j.status === "running" || j.status === "pending") && (
                    <button className="btn-danger btn-sm" onClick={() => handleCancel(j.id)}>
                      {t("jobs.cancel")}
                    </button>
                  )}
                  {(j.status === "completed" || j.status === "failed" || j.status === "cancelled") && (
                    <button className="btn-danger btn-sm" onClick={() => handleDelete(j.id)}>
                      {t("common.delete")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {logJobId && (
        <LogViewer jobId={logJobId} onClose={() => setLogJobId(null)} />
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GiB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MiB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KiB`;
  return `${bytes} B`;
}
