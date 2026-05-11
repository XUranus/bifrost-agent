import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getJob, listBackupCopies } from "../api/client";
import { Skeleton, SkeletonPanel } from "../components/Skeleton";
import { useI18n } from "../i18n";
import type { JobResponse, BackupCopyResponse } from "../types";

export default function BackupReport() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<JobResponse | null>(null);
  const [copy, setCopy] = useState<BackupCopyResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const j = await getJob(id);
        setJob(j);
        // Find associated copy
        const copies = await listBackupCopies(j.asset_id);
        const found = copies.find((c) => c.job_id === j.id) || null;
        setCopy(found);
      } catch (e) {
        console.error("Failed to load report:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div>
        <div className="page-header"><Skeleton width="30%" height={22} /></div>
        <SkeletonPanel rows={6} />
      </div>
    );
  }

  if (!job) return <p className="error-msg">{t("report.jobNotFound")}</p>;

  const duration = job.started_at && job.ended_at
    ? (new Date(job.ended_at).getTime() - new Date(job.started_at).getTime()) / 1000
    : null;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button className="btn-ghost" onClick={() => navigate(`/jobs/${job.id}`)}>&larr; {t("report.backToJob")}</button>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>{t("report.title")}</h2>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <StatCard label={t("report.status")} value={job.status} color={job.status === "completed" ? "var(--status-ok)" : "var(--status-error)"} />
        <StatCard label={t("report.files")} value={job.file_count != null ? String(job.file_count) : "-"} color="var(--accent)" />
        <StatCard label={t("report.size")} value={job.size_bytes ? formatBytes(job.size_bytes) : "-"} color="var(--status-info)" />
        <StatCard label={t("report.duration")} value={duration != null ? `${Math.floor(duration / 60)}m ${Math.floor(duration % 60)}s` : "-"} color="var(--status-warn)" />
      </div>

      <div className="card-grid-2col">
        <div className="glass-panel">
          <div className="panel-header"><h3>{t("report.jobSummary")}</h3></div>
          <div className="panel-body">
            <dl className="detail-list">
              <dt>{t("report.jobId")}</dt><dd className="td-mono">{job.id}</dd>
              <dt>{t("report.operation")}</dt><dd>{job.operation}</dd>
              <dt>{t("report.asset")}</dt>
              <dd>
                <span className="td-link" style={{ cursor: "pointer" }} onClick={() => navigate(`/assets/${job.asset_id}`)}>
                  {job.asset_id.slice(0, 8)}...
                </span>
              </dd>
              <dt>{t("report.started")}</dt><dd>{job.started_at ? new Date(job.started_at).toLocaleString() : "-"}</dd>
              <dt>{t("report.ended")}</dt><dd>{job.ended_at ? new Date(job.ended_at).toLocaleString() : "-"}</dd>
              <dt>{t("report.errors")}</dt><dd style={{ color: job.error_count > 0 ? "var(--status-error)" : undefined }}>{job.error_count}</dd>
            </dl>
          </div>
        </div>

        {copy ? (
          <div className="glass-panel">
            <div className="panel-header"><h3>{t("report.backupCopy")}</h3></div>
            <div className="panel-body">
              <dl className="detail-list">
                <dt>{t("report.copyId")}</dt><dd className="td-mono">{copy.id.slice(0, 12)}...</dd>
                <dt>{t("report.kind")}</dt><dd>{copy.kind}</dd>
                <dt>{t("report.copySize")}</dt><dd>{copy.size_bytes ? formatBytes(copy.size_bytes) : "-"}</dd>
                <dt>{t("report.copyFiles")}</dt><dd>{copy.file_count ?? "-"}</dd>
                <dt>{t("report.copyStatus")}</dt><dd><span className={`badge badge-${copy.status}`}>{copy.status}</span></dd>
                <dt>{t("report.created")}</dt><dd>{new Date(copy.created_at).toLocaleString()}</dd>
                {copy.expires_at && (<><dt>{t("report.expires")}</dt><dd>{new Date(copy.expires_at).toLocaleString()}</dd></>)}
              </dl>
            </div>
          </div>
        ) : (
          <div className="glass-panel">
            <div className="panel-header"><h3>{t("report.backupCopy")}</h3></div>
            <div className="panel-body">
              <p className="empty-state">{t("report.noCopy")}</p>
            </div>
          </div>
        )}
      </div>
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

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GiB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MiB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KiB`;
  return `${bytes} B`;
}
