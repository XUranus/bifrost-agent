import { useState, useEffect } from "react";
import { listJobs, cancelJob } from "../api/client";
import { useToast } from "../components/Toast";
import LogViewer from "../components/LogViewer";
import type { JobResponse } from "../types";

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [logJobId, setLogJobId] = useState<string | null>(null);
  const { pushToast } = useToast();

  async function load() {
    try {
      const params: { status?: string; limit?: number } = { limit: 50 };
      if (statusFilter) params.status = statusFilter;
      setJobs(await listJobs(params));
    } catch (e) {
      console.error("Failed to load jobs:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Auto-refresh while there are running jobs
    const interval = setInterval(() => {
      const hasRunning = jobs.some((j) => j.status === "running" || j.status === "pending");
      if (hasRunning || jobs.length === 0) load();
    }, 5000);
    return () => clearInterval(interval);
  }, [statusFilter]);

  useEffect(() => {
    if (logJobId) {
      const job = jobs.find((j) => j.id === logJobId);
      if (job && job.status !== "running" && job.status !== "pending") {
        // Job finished, keep logs visible
      }
    }
  }, [jobs, logJobId]);

  async function handleCancel(jobId: string) {
    try {
      await cancelJob(jobId);
      pushToast("Job cancelled", "info");
      load();
    } catch (e) {
      console.error("Cancel error:", e);
      pushToast("Failed to cancel job", "error");
    }
  }

  if (loading) return <p style={{ color: "#666" }}>Loading jobs...</p>;

  return (
    <div>
      <h2 style={styles.heading}>Jobs</h2>

      <div style={styles.filters}>
        {["", "running", "completed", "failed", "pending", "cancelled"].map((s) => (
          <button
            key={s}
            style={{
              ...styles.filterBtn,
              ...(statusFilter === s ? styles.filterBtnActive : {}),
            }}
            onClick={() => setStatusFilter(s)}
          >
            {s || "All"}
          </button>
        ))}
      </div>

      {jobs.length === 0 ? (
        <div style={styles.emptyState}>
          <p>No jobs found.</p>
        </div>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>ID</th>
                <th style={styles.th}>Asset</th>
                <th style={styles.th}>Operation</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Size</th>
                <th style={styles.th}>Files</th>
                <th style={styles.th}>Errors</th>
                <th style={styles.th}>Started</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td style={styles.tdMono}>{j.id.slice(0, 8)}...</td>
                  <td style={styles.tdMono}>{j.asset_id.slice(0, 8)}...</td>
                  <td style={styles.td}>{j.operation}</td>
                  <td style={styles.td}>
                    <span
                      style={{
                        ...styles.statusBadge,
                        backgroundColor: statusColor(j.status),
                      }}
                    >
                      {j.status}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {j.size_bytes ? formatBytes(j.size_bytes) : "-"}
                  </td>
                  <td style={styles.td}>{j.file_count ?? "-"}</td>
                  <td style={styles.td}>{j.error_count}</td>
                  <td style={styles.td}>
                    {j.started_at
                      ? new Date(j.started_at).toLocaleString()
                      : "-"}
                  </td>
                  <td style={styles.td}>
                    <button
                      style={styles.logBtn}
                      onClick={() => setLogJobId(j.id)}
                    >
                      Logs
                    </button>
                    {(j.status === "running" || j.status === "pending") && (
                      <button
                        style={{ ...styles.cancelBtn, marginLeft: 8 }}
                        onClick={() => handleCancel(j.id)}
                      >
                        Cancel
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

function statusColor(status: string): string {
  switch (status) {
    case "completed": return "#38a169";
    case "running": return "#3182ce";
    case "pending": return "#d69e2e";
    case "failed": return "#e53e3e";
    case "cancelled": return "#718096";
    default: return "#a0aec0";
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GiB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MiB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KiB`;
  return `${bytes} B`;
}

const styles: Record<string, React.CSSProperties> = {
  heading: { fontSize: 22, fontWeight: 700, marginBottom: 24, color: "#1a1a2e" },
  filters: { display: "flex", gap: 8, marginBottom: 16 },
  filterBtn: {
    padding: "6px 16px",
    borderRadius: 16,
    border: "1px solid #ddd",
    backgroundColor: "#fff",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
    color: "#666",
  },
  filterBtnActive: {
    backgroundColor: "#6c63ff",
    color: "#fff",
    borderColor: "#6c63ff",
  },
  emptyState: { textAlign: "center" as const, padding: 60, color: "#888" },
  tableWrap: {
    backgroundColor: "#fff",
    borderRadius: 8,
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    overflow: "auto",
  },
  table: { width: "100%", borderCollapse: "collapse" as const },
  th: {
    textAlign: "left" as const,
    padding: "12px 16px",
    fontSize: 11,
    fontWeight: 600,
    color: "#888",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    borderBottom: "1px solid #eee",
  },
  td: { padding: "10px 16px", fontSize: 13, color: "#333", borderTop: "1px solid #f5f5f5" },
  tdMono: {
    padding: "10px 16px",
    fontSize: 12,
    fontFamily: "monospace",
    color: "#666",
    borderTop: "1px solid #f5f5f5",
  },
  statusBadge: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 600,
    color: "#fff",
    textTransform: "capitalize" as const,
  },
  logBtn: {
    padding: "4px 10px",
    backgroundColor: "#3182ce",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 600,
  },
  cancelBtn: {
    padding: "4px 10px",
    backgroundColor: "#e53e3e",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 600,
  },
};
