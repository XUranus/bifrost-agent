import { useState, useEffect, useRef } from "react";
import { getJobLogs } from "../api/client";

interface LogLine {
  level: string;
  message: string;
  timestamp: string;
}

interface Props {
  jobId: string;
  onClose: () => void;
}

export default function LogViewer({ jobId, onClose }: Props) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function fetchLogs() {
    try {
      const result = await getJobLogs(jobId);
      setLines(result.lines || []);
    } catch (e) {
      console.error("Failed to fetch logs:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, [jobId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <span style={styles.title}>Job Logs: {jobId.slice(0, 8)}...</span>
          <button style={styles.closeBtn} onClick={onClose}>
            Close
          </button>
        </div>
        <div ref={scrollRef} style={styles.logArea}>
          {loading ? (
            <p style={styles.loading}>Loading logs...</p>
          ) : lines.length === 0 ? (
            <p style={styles.loading}>No log entries yet</p>
          ) : (
            lines.map((line, i) => (
              <div key={i} style={styles.line}>
                <span style={styles.timestamp}>
                  {new Date(line.timestamp).toLocaleTimeString()}
                </span>
                <span style={{ ...styles.level, color: levelColor(line.level) }}>
                  {line.level.toUpperCase()}
                </span>
                <span style={styles.message}>{line.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function levelColor(level: string): string {
  switch (level) {
    case "error": return "#e53e3e";
    case "warn": return "#d69e2e";
    case "info": return "#3182ce";
    default: return "#888";
  }
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  panel: {
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    width: 700,
    maxWidth: "90vw",
    height: 500,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    backgroundColor: "#2d2d44",
  },
  title: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "monospace",
  },
  closeBtn: {
    padding: "4px 12px",
    backgroundColor: "#444",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 12,
  },
  logArea: {
    flex: 1,
    overflow: "auto",
    padding: 12,
    fontFamily: "monospace",
    fontSize: 12,
  },
  line: {
    display: "flex",
    gap: 8,
    padding: "2px 0",
    borderBottom: "1px solid #2d2d44",
  },
  timestamp: {
    color: "#666",
    minWidth: 70,
  },
  level: {
    minWidth: 45,
    fontWeight: 600,
    fontSize: 11,
  },
  message: {
    color: "#ddd",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-all" as const,
  },
  loading: {
    color: "#666",
    textAlign: "center" as const,
    padding: 20,
  },
};
