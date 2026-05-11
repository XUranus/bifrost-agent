import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { listJobs, cancelJob } from "../api/client";
import { useToast } from "../components/Toast";
import { useAgentEvents } from "../hooks/useAgentEvents";
import { useI18n } from "../i18n";
import LogViewer from "../components/LogViewer";
import JobProgress from "../components/JobProgress";
import { SkeletonTable } from "../components/Skeleton";
import type { JobResponse } from "../types";

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
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [logJobId, setLogJobId] = useState<string | null>(null);
  const [progressMap, setProgressMap] = useState<Map<string, ProgressData>>(new Map());
  const { pushToast } = useToast();

  const load = useCallback(async () => {
    try {
      const params: { status?: string; limit?: number } = { limit: 50 };
      if (statusFilter) params.status = statusFilter;
      setJobs(await listJobs(params));
    } catch (e) {
      console.error("Failed to load jobs:", e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  // Initial load + fallback poll (reduced frequency when WS is active)
  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  // WebSocket: update job status in real-time
  useAgentEvents({
    onJobStatus: (e) => {
      setJobs((prev) => prev.map((j) =>
        j.id === e.job_id ? { ...j, status: e.status } : j
      ));
      // Clear progress when job finishes
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

  if (loading) {
    return (
      <div>
        <div className="page-header"><h2>{t("jobs.title")}</h2></div>
        <SkeletonTable rows={8} cols={8} />
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
            {s === "" ? t("jobs.all") : t(`jobs.${s}`)}
          </button>
        ))}
      </div>

      {jobs.length === 0 ? (
        <div className="empty-state">
          <p>{t("jobs.noJobs")}</p>
        </div>
      ) : (
        <div className="glass-table-wrap">
          <table className="glass-table">
            <thead>
              <tr>
                <th>{t("jobs.tableId")}</th><th>{t("jobs.tableAsset")}</th><th>{t("jobs.tableOperation")}</th><th>{t("jobs.tableStatus")}</th>
                <th>{t("jobs.tableSize")}</th><th>{t("jobs.tableFiles")}</th><th>{t("jobs.tableErrors")}</th><th>{t("jobs.tableStarted")}</th><th>{t("jobs.tableActions")}</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td>
                    <span className="td-mono td-link" style={{ cursor: "pointer" }} onClick={() => navigate(`/jobs/${j.id}`)}>
                      {j.id.slice(0, 8)}...
                    </span>
                  </td>
                  <td>
                    <span className="td-mono td-link" style={{ cursor: "pointer" }} onClick={() => navigate(`/assets/${j.asset_id}`)}>
                      {j.asset_id.slice(0, 8)}...
                    </span>
                  </td>
                  <td>{j.operation}</td>
                  <td>
                    <span className={`badge badge-${j.status}`}>{j.status}</span>
                    {j.status === "running" && progressMap.has(j.id) && (
                      <div style={{ marginTop: 6 }}>
                        <JobProgress data={progressMap.get(j.id)!} compact />
                      </div>
                    )}
                  </td>
                  <td>{j.size_bytes ? formatBytes(j.size_bytes) : "-"}</td>
                  <td>{j.file_count ?? "-"}</td>
                  <td>{j.error_count}</td>
                  <td>{j.started_at ? new Date(j.started_at).toLocaleString() : "-"}</td>
                  <td style={{ display: "flex", gap: 6 }}>
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
