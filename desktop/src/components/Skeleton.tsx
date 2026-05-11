interface SkeletonProps {
  width?: string;
  height?: number;
  style?: React.CSSProperties;
}

export function Skeleton({ width = "100%", height = 16, style }: SkeletonProps) {
  return (
    <div
      className="skeleton-bar"
      style={{ width, height, borderRadius: height > 20 ? 10 : 6, ...style }}
    />
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="skeleton-table">
      <div className="skeleton-table-header">
        {Array.from({ length: cols }, (_, i) => (
          <Skeleton key={i} height={12} style={{ flex: 1 }} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="skeleton-table-row">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} height={14} style={{ flex: 1 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="glass-card" style={{ padding: 20 }}>
      <Skeleton width="60%" height={18} style={{ marginBottom: 12 }} />
      <Skeleton width="40%" height={14} style={{ marginBottom: 8 }} />
      <Skeleton width="80%" height={14} />
    </div>
  );
}

export function SkeletonPanel({ rows = 4 }: { rows?: number }) {
  return (
    <div className="glass-panel">
      <div className="panel-header">
        <Skeleton width="40%" height={18} />
      </div>
      <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
            <Skeleton width="30%" height={14} />
            <Skeleton width="50%" height={14} />
          </div>
        ))}
      </div>
    </div>
  );
}
