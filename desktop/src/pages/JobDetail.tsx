import { useState, useEffect, useCallback, useMemo } from "react";
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

function getOpLabel(op: string, t: (k: string) => string): string {
  const key = `jobs.op.${op}`;
  const label = t(key);
  return label === key ? op.charAt(0).toUpperCase() + op.slice(1) : label;
}

function getStatusLabel(status: string, t: (k: string) => string): string {
  const key = `jobs.status.${status}`;
  const label = t(key);
  return label === key ? status.charAt(0).toUpperCase() + status.slice(1) : label;
}

function CopyableId({ fullId, label }: { fullId: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const { t } = useI18n();

  function handleClick() {
    navigator.clipboard.writeText(fullId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const segments = fullId.split("-");
  return (
    <span
      className="copyable-id"
      onClick={handleClick}
      title={label || t("jobDetail.clickToCopy")}
      style={{ cursor: "pointer", fontFamily: "'SF Mono', monospace", fontSize: 13 }}
    >
      {segments.map((seg, i) => (
        <span key={i}>
          {i > 0 && <span style={{ color: "var(--text-tertiary)", userSelect: "none" }}>-</span>}
          <span className="id-segment">{seg}</span>
        </span>
      ))}
      {copied && (
        <span style={{ marginLeft: 8, fontSize: 11, color: "var(--status-ok)" }}>
          {t("jobDetail.copied")}
        </span>
      )}
    </span>
  );
}

// Filter log lines that represent progress milestones (not noise)
function isMilestone(entry: LogEntry): boolean {
  return entry.level === "info" && parseMilestone(entry.message) !== null;
}

// Parse a raw backend log message into an i18n key + params.
// Returns null for non-milestone messages.
interface MilestoneI18n {
  key: string;
  params?: Record<string, string>;
}

function parseMilestone(raw: string): MilestoneI18n | null {
  // "Job submitted: asset=xxx, operation=backup"
  if (raw.startsWith("Job submitted")) {
    const op = raw.match(/operation=(\w+)/)?.[1] || "";
    return { key: "milestone.jobSubmitted", params: { op } };
  }
  // "Fileset backup: 1 paths -> /opt/backup/... (consistency=false)"
  if (raw.startsWith("Fileset backup:")) {
    const m = raw.match(/(\d+) paths? -> (\S+)/);
    return { key: "milestone.filesetBackup", params: { paths: m?.[1] || "?", target: m?.[2] || "?" } };
  }
  // "Initializing backup job" / "Initializing restore job" / "Initializing volume backup"
  if (raw.startsWith("Initializing")) {
    return { key: "milestone.initializing", params: { what: raw.replace("Initializing ", "") } };
  }
  // "Starting file backup scan phase..."
  if (raw.startsWith("Starting")) {
    return { key: "milestone.starting", params: { what: raw.replace("Starting ", "").replace("...", "") } };
  }
  // "Backup config: mode=common, type=full_incremental, target=/opt/backup/..."
  if (raw.includes("Backup config:")) {
    const mode = raw.match(/mode=(\w+)/)?.[1] || "";
    const type = raw.match(/type=([\w_]+)/)?.[1] || "";
    return { key: "milestone.backupConfig", params: { mode, type } };
  }
  // "Scanning 1 source path(s): /opt/dataset/ds2"
  if (raw.startsWith("Scanning")) {
    const m = raw.match(/(\d+) source path\(s\): (.+)/);
    return { key: "milestone.scanning", params: { count: m?.[1] || "?", paths: m?.[2] || "" } };
  }
  // "Backup engine started, scanning files..."
  if (raw.startsWith("Backup engine started")) {
    return { key: "milestone.engineStarted" };
  }
  // "Scan complete: 3905 files, 0 directories, 39987200 bytes"
  if (raw.startsWith("Scan complete:")) {
    const m = raw.match(/(\d+) files?, (\d+) director\w+, (\d+) bytes/);
    const size = m ? formatBytes(parseInt(m[3])) : "?";
    return { key: "milestone.scanComplete", params: { files: m?.[1] || "?", dirs: m?.[2] || "?", size } };
  }
  // "Subtasks: 1 succeeded, 0 failed"
  if (raw.startsWith("Subtasks:")) {
    const m = raw.match(/(\d+) succeeded?, (\d+) failed/);
    return { key: "milestone.subtasks", params: { ok: m?.[1] || "?", failed: m?.[2] || "?" } };
  }
  // "Backup complete: 3905 files, 39987200 bytes, copy_uuid=xxx"
  if (raw.startsWith("Backup complete:")) {
    const m = raw.match(/(\d+) files?, (\d+) bytes/);
    const size = m ? formatBytes(parseInt(m[2])) : "?";
    return { key: "milestone.backupComplete", params: { files: m?.[1] || "?", size } };
  }
  // "Backup copy recorded: uuid=xxx"
  if (raw.startsWith("Backup copy recorded:") || raw.startsWith("Consistency backup copy recorded:")) {
    const uuid = raw.match(/uuid=([\w-]+)/)?.[1] || "";
    return { key: "milestone.copyRecorded", params: { uuid: uuid.slice(0, 8) } };
  }
  // "Job completed in 1.2s: 3905 files, 39987200 bytes, 0 errors, copy=xxx"
  if (raw.startsWith("Job completed")) {
    const elapsed = raw.match(/completed in ([^:]+)/)?.[1] || "";
    const m = raw.match(/(\d+) files?, (\d+) bytes/);
    const size = m ? formatBytes(parseInt(m[2])) : "?";
    const errors = raw.match(/(\d+) errors?/)?.[1] || "0";
    return { key: "milestone.jobCompleted", params: { elapsed, files: m?.[1] || "?", size, errors } };
  }
  // "Job failed after Xs: error"
  if (raw.startsWith("Job failed")) {
    const elapsed = raw.match(/after ([^:]+)/)?.[1] || "";
    return { key: "milestone.jobFailed", params: { elapsed } };
  }
  // "Finalizing backup copy"
  if (raw.startsWith("Finalizing")) {
    return { key: "milestone.finalizing" };
  }
  return null;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GiB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MiB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KiB`;
  return `${bytes} B`;
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

  // Derive milestones from persisted logs (works on initial load)
  const milestones = useMemo(() => logs.filter(isMilestone), [logs]);

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
            {t("jobDetail.job")}
          </h2>
          <span className={`badge badge-${job.status}`}>{getStatusLabel(job.status, t)}</span>
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
              <dt>ID</dt>
              <dd><CopyableId fullId={job.id} /></dd>
              <dt>{t("jobDetail.operation")}</dt><dd>{getOpLabel(job.operation, t)}</dd>
              <dt>{t("jobDetail.status")}</dt><dd><span className={`badge badge-${job.status}`}>{getStatusLabel(job.status, t)}</span></dd>
              <dt>{t("jobDetail.asset")}</dt>
              <dd><CopyableId fullId={job.asset_id} label={t("jobDetail.clickToCopy")} /></dd>
              <dt>{t("jobDetail.size")}</dt><dd>{job.size_bytes ? formatBytes(job.size_bytes) : "-"}</dd>
              <dt>{t("jobDetail.files")}</dt><dd>{job.file_count != null ? job.file_count.toLocaleString() : "-"}</dd>
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
            ) : milestones.length > 0 ? (
              <div>
                {milestones.map((entry, i) => {
                  const parsed = parseMilestone(entry.message);
                  const label = parsed ? t(parsed.key, parsed.params) : entry.message;
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0",
                      borderBottom: i < milestones.length - 1 ? "1px solid var(--glass-border-subtle)" : "none",
                      fontSize: 12,
                    }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: "50%", marginTop: 4, flexShrink: 0,
                        background: "var(--status-ok)",
                      }} />
                      <span style={{ color: "var(--text-secondary)", flex: 1, lineHeight: 1.5 }}>
                        {label}
                      </span>
                      <span style={{ color: "var(--text-tertiary)", fontSize: 11, whiteSpace: "nowrap", flexShrink: 0 }}>
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  );
                })}
              </div>
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
