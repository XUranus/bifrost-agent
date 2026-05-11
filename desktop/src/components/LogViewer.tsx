import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { getJobLogs } from "../api/client";
import { useJobLogEvents, useAgentEvents } from "../hooks/useAgentEvents";
import { useI18n } from "../i18n";
import JobProgress from "./JobProgress";

interface LogLine {
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

interface Props {
  jobId: string;
  onClose: () => void;
}

export default function LogViewer({ jobId, onClose }: Props) {
  const { t } = useI18n();
  const [lines, setLines] = useState<LogLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    getJobLogs(jobId)
      .then((result) => setLines(result.lines || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [jobId]);

  useEffect(() => {
    const interval = setInterval(() => {
      getJobLogs(jobId)
        .then((result) => setLines(result.lines || []))
        .catch(console.error);
    }, 10000);
    return () => clearInterval(interval);
  }, [jobId]);

  const appendLine = useCallback((entry: LogLine) => {
    setLines((prev) => [...prev, entry]);
  }, []);
  useJobLogEvents(jobId, appendLine);

  useAgentEvents({
    onJobProgress: (e) => {
      if (e.job_id === jobId) {
        setProgress({
          phase: e.phase,
          percent: e.percent,
          throughput_bytes_per_sec: e.throughput_bytes_per_sec,
          eta_seconds: e.eta_seconds,
          current_item: e.current_item,
        });
      }
    },
    onJobStatus: (e) => {
      if (e.job_id === jobId && (e.status === "completed" || e.status === "failed" || e.status === "cancelled")) {
        setProgress(null);
      }
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  return createPortal(
    <div className="log-overlay">
      <div className="glass-modal log-panel">
        <div className="log-header">
          <span>{t("log.title")}: {jobId.slice(0, 8)}...</span>
          <button className="btn-ghost btn-sm" onClick={onClose}>{t("log.close")}</button>
        </div>
        {progress && (
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--glass-border-subtle)" }}>
            <JobProgress data={progress} />
          </div>
        )}
        <div ref={scrollRef} className="log-area">
          {loading ? (
            <p className="log-loading">{t("log.loading")}</p>
          ) : lines.length === 0 ? (
            <p className="log-loading">{t("log.noEntries")}</p>
          ) : (
            lines.map((line, i) => (
              <div key={i} className="log-line">
                <span className="log-timestamp">
                  {new Date(line.timestamp).toLocaleTimeString()}
                </span>
                <span className="log-level" style={{ color: levelColor(line.level) }}>
                  {line.level.toUpperCase()}
                </span>
                <span className="log-message">{line.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function levelColor(level: string): string {
  switch (level) {
    case "error": return "var(--status-error)";
    case "warn": return "var(--status-warn)";
    case "info": return "var(--status-info)";
    default: return "var(--text-tertiary)";
  }
}
