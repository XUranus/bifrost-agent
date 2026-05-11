import { useI18n } from "../i18n";
import type { AppNotification } from "../components/NotificationCenter";

interface Props {
  notifications: AppNotification[];
  onMarkRead: (id: number) => void;
  onClearAll: () => void;
}

export default function NotificationsPage({ notifications, onMarkRead, onClearAll }: Props) {
  const { t } = useI18n();
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div>
      <div className="page-header">
        <h2>{t("nav.notifications")}</h2>
        {notifications.length > 0 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {unread > 0 && <span className="badge badge-info">{unread} {t("notif.unread")}</span>}
            <button className="btn-ghost btn-sm" onClick={onClearAll}>{t("notif.clearAll")}</button>
          </div>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="empty-state">
          <p>{t("notif.empty")}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`notif-page-item glass-panel${n.read ? " notif-read" : ""}`}
              onClick={() => onMarkRead(n.id)}
              style={{
                padding: "14px 18px",
                cursor: "pointer",
                opacity: n.read ? 0.6 : 1,
                transition: "opacity 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                {!n.read && <span className={`notif-dot notif-dot-${n.type}`} />}
                <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)" }}>{n.title}</span>
                <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-tertiary)" }}>
                  {formatTime(n.timestamp, t)}
                </span>
              </div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, paddingLeft: n.read ? 0 : 20 }}>
                {n.body}
              </p>
            </div>
          ))}
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
