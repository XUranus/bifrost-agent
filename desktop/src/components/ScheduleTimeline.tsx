import { useState, useEffect } from "react";
import { listAssets } from "../api/client";

interface ScheduleEntry {
  assetName: string;
  assetId: string;
  time: Date;
}

export default function ScheduleTimeline() {
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const assets = await listAssets();
        const schedule: ScheduleEntry[] = [];
        for (const a of assets) {
          if (a.next_backup) {
            schedule.push({ assetName: a.name, assetId: a.id, time: new Date(a.next_backup) });
          }
        }
        // Sort by time
        schedule.sort((a, b) => a.time.getTime() - b.time.getTime());
        setEntries(schedule);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading || entries.length === 0) return null;

  // Group by day (next 7 days)
  const days: { label: string; entries: ScheduleEntry[] }[] = [];
  const now = new Date();
  for (let d = 0; d < 7; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() + d);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const dayEntries = entries.filter((e) => e.time >= dayStart && e.time < dayEnd);
    const label = d === 0 ? "Today" : d === 1 ? "Tomorrow" : dayStart.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    days.push({ label, entries: dayEntries });
  }

  const hasAny = days.some((d) => d.entries.length > 0);
  if (!hasAny) return null;

  return (
    <div className="glass-panel" style={{ marginBottom: 16 }}>
      <div className="panel-header"><h3>Upcoming Backups</h3></div>
      <div className="timeline-grid">
        {days.map((day, i) => (
          <div key={i} className="timeline-day">
            <div className="timeline-day-label">{day.label}</div>
            <div className="timeline-day-entries">
              {day.entries.length === 0 ? (
                <span className="timeline-empty">-</span>
              ) : (
                day.entries.map((e, j) => (
                  <div key={j} className="timeline-entry">
                    <span className="timeline-time">{e.time.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="timeline-asset">{e.assetName}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
