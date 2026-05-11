import { useState, useRef, useEffect } from "react";
import { useI18n } from "../i18n";

export interface AppNotification {
  id: number;
  title: string;
  body: string;
  type: "success" | "error" | "info";
  timestamp: number;
  read: boolean;
}

interface Props {
  notifications: AppNotification[];
  onMarkRead: (id: number) => void;
  onClearAll: () => void;
}

export default function NotificationCenter({ notifications, onMarkRead, onClearAll }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="notif-wrapper">
      <button className="notif-bell" onClick={() => setOpen(!open)} title={t("notif.title")}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && <span className="notif-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-header">
            <span style={{ fontWeight: 600, fontSize: 14 }}>{t("notif.title")}</span>
            {notifications.length > 0 && (
              <button className="btn-ghost btn-sm" onClick={onClearAll}>{t("notif.clearAll")}</button>
            )}
          </div>
          <div className="notif-list">
            {notifications.length === 0 ? (
              <p className="notif-empty">{t("notif.empty")}</p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`notif-item${n.read ? " notif-read" : ""}`}
                  onClick={() => onMarkRead(n.id)}
                >
                  <div className="notif-item-dot-row">
                    {!n.read && <span className={`notif-dot notif-dot-${n.type}`} />}
                    <span className="notif-item-title">{n.title}</span>
                  </div>
                  <p className="notif-item-body">{n.body}</p>
                  <span className="notif-item-time">{formatTime(n.timestamp, t)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(ts: number, t: (k: string, p?: Record<string, string | number>) => string): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return t("notif.justNow");
  if (diff < 3_600_000) return t("notif.mAgo", { m: Math.floor(diff / 60_000) });
  if (diff < 86_400_000) return t("notif.hAgo", { h: Math.floor(diff / 3_600_000) });
  return new Date(ts).toLocaleDateString();
}
