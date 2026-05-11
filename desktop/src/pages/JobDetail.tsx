import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getJob, cancelJob, getJobLogs } from "../api/client";
import { useToast } from "../components/Toast";
import { useAgentEvents } from "../hooks/useAgentEvents";
import { useI18n } from "../i18n";
import JobProgress from "../components/JobProgress";
import { Skeleton, SkeletonPanel } from "../components/Skeleton";
import type { JobResponse } from "../types";

interface LogEntry {
  level: string;
  message: string;
  timestamp: string;
}

interface ProgressData {
  phase: string;
  percent: number;
  throughput_bytes_per_sec: number;
  eta_seconds: number;
  current_item: string;
}

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const { t } = useI18n();
  const [job, setJob] = useState<JobResponse | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<ProgressData | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const [jobResult, logsResult] = await Promise.allSettled([
      getJob(id),
      getJobLogs(id),
    ]);
    if (jobResult.status === "fulfilled") {
      setJob(jobResult.value);
    } else {
      pushToast(t("jobDetail.loadFailed") + `: ${jobResult.reason}`, "error");
    }
    if (logsResult.status === "fulfilled") {
      setLogs(logsResult.value.lines || []);
    }
    setLoading(false);
  }, [id, pushToast, t]);

  useEffect(() => { load(); }, [load]);

  // Real-time updates via WS
  useAgentEvents({
    onJobStatus: (e) => {
      if (e.job_id === id) {
        setJob((prev) => prev ? { ...prev, status: e.status } : null);
        if (e.status === "completed" || e.status === "failed" || e.status === "cancelled") {
          setProgress(null);
          setTimeout(load, 500);
        }
      }
    },
    onJobLog: (e) => {
      if (e.job_id === id) {
        setLogs((prev) => [...prev, { level: e.level, message: e.message, timestamp: e.timestamp }]);
      }
    },
    onJobProgress: (e) => {
      if (e.job_id === id) {
        setProgress({
          phase: e.phase,
          percent: e.percent,
          throughput_bytes_per_sec: e.throughput_bytes_per_sec,
          eta_seconds: e.eta_seconds,
          current_item: e.current_item,
        });
      }
    },
  });

  async function handleCancel() {
    if (!id) return;
    try {
      await cancelJob(id);
      pushToast(t("jobDetail.cancelled"), "info");
    } catch {
      pushToast(t("jobDetail.cancelFailed"), "error");
    }
  }

  if (loading) {
    return (
      <div>
        <div className="page-header"><Skeleton width="25%" height={22} /></div>
        <SkeletonPanel rows={8} />
      </div>
    );
  }

  if (!job) {
    return (
      <div>
        <div className="page-header">
          <button className="btn-ghost" onClick={() => navigate("/jobs")}>&larr; {t("jobDetail.back")}</button>
        </div>
        <div className="empty-state">
          <p style={{ color: "var(--status-error)", fontWeight: 600 }}>{t("jobDetail.jobNotFound")}</p>
        </div>
      </div>
    );
  }

  const isActive = job.status === "running" || job.status === "pending";

  return (
    <div>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button className="btn-ghost" onClick={() => navigate("/jobs")}>&larr; {t("jobDetail.back")}</button>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>
            {t("jobDetail.job")} {job.id.slice(0, 8)}...
          </h2>
          <span className={`badge badge-${job.status}`}>{job.status}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {isActive && (
            <button className="btn-danger btn-sm" onClick={handleCancel}>{t("jobDetail.cancel")}</button>
          )}
          <button className="btn-secondary btn-sm" onClick={() => navigate(`/jobs/${id}/report`)}>{t("jobDetail.report")}</button>
        </div>
      </div>

      <div className="card-grid-2col" style={{ marginBottom: 16 }}>
        <div className="glass-panel">
          <div className="panel-header"><h3>{t("jobDetail.details")}</h3></div>
          <div className="panel-body">
            <dl className="detail-list">
              <dt>{t("jobDetail.operation")}</dt><dd>{job.operation}</dd>
              <dt>{t("jobDetail.status")}</dt><dd><span className={`badge badge-${job.status}`}>{job.status}</span></dd>
              <dt>{t("jobDetail.asset")}</dt>
              <dd>
                <span className="td-link" style={{ cursor: "pointer" }} onClick={() => navigate(`/assets/${job.asset_id}`)}>
                  {job.asset_id.slice(0, 8)}...
                </span>
              </dd>
              <dt>{t("jobDetail.size")}</dt><dd>{job.size_bytes ? formatBytes(job.size_bytes) : "-"}</dd>
              <dt>{t("jobDetail.files")}</dt><dd>{job.file_count ?? "-"}</dd>
              <dt>{t("jobDetail.errors")}</dt><dd>{job.error_count}</dd>
              <dt>{t("jobDetail.started")}</dt><dd>{job.started_at ? new Date(job.started_at).toLocaleString() : "-"}</dd>
              <dt>{t("jobDetail.ended")}</dt><dd>{job.ended_at ? new Date(job.ended_at).toLocaleString() : "-"}</dd>
            </dl>
          </div>
        </div>

        <div className="glass-panel">
          <div className="panel-header"><h3>{t("jobDetail.progress")}</h3></div>
          <div className="panel-body">
            {progress ? (
              <JobProgress data={progress} />
            ) : job.progress ? (
              <JobProgress data={job.progress} />
            ) : (
              <p className="empty-state">{isActive ? t("jobDetail.waiting") : t("jobDetail.noProgress")}</p>
            )}
          </div>
        </div>
      </div>

      <div className="glass-panel">
        <div className="panel-header"><h3>{t("jobDetail.logs")} ({logs.length})</h3></div>
        <div className="panel-body">
          {logs.length === 0 ? (
            <p className="empty-state">{t("jobDetail.noLogs")}</p>
          ) : (
            <div className="log-inline">
              {logs.map((entry, i) => (
                <div key={i} className={`log-line log-${entry.level}`}>
                  <span className="log-ts">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                  <span className="log-lvl">[{entry.level.toUpperCase()}]</span>
                  <span className="log-msg">{entry.message}</span>
                </div>
              ))}
            </div>
          )}
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
