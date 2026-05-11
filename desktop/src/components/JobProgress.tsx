interface JobProgressData {
  phase: string;
  percent: number;
  throughput_bytes_per_sec: number;
  eta_seconds: number;
  current_item: string;
}

interface Props {
  data: JobProgressData;
  compact?: boolean;
}

export default function JobProgress({ data, compact }: Props) {
  const pct = Math.min(100, Math.max(0, data.percent));
  const eta = formatETA(data.eta_seconds);
  const throughput = formatThroughput(data.throughput_bytes_per_sec);

  return (
    <div className={`job-progress${compact ? " job-progress-compact" : ""}`}>
      <div className="progress-header-row">
        <span className="progress-phase">{data.phase}</span>
        <span className="progress-pct">{pct.toFixed(1)}%</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      {!compact && (
        <div className="progress-meta">
          {throughput && <span>{throughput}</span>}
          {eta && <span>ETA: {eta}</span>}
          {data.current_item && <span className="progress-item" title={data.current_item}>{data.current_item}</span>}
        </div>
      )}
    </div>
  );
}

function formatETA(seconds: number): string {
  if (seconds <= 0) return "";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function formatThroughput(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return "";
  if (bytesPerSec >= 1_073_741_824) return `${(bytesPerSec / 1_073_741_824).toFixed(1)} GiB/s`;
  if (bytesPerSec >= 1_048_576) return `${(bytesPerSec / 1_048_576).toFixed(1)} MiB/s`;
  if (bytesPerSec >= 1_024) return `${(bytesPerSec / 1_024).toFixed(0)} KiB/s`;
  return `${bytesPerSec} B/s`;
}
