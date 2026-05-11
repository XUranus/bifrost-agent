import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useTheme } from "../theme";
import { useI18n } from "../i18n";
import NotificationCenter, { type AppNotification } from "./NotificationCenter";

interface Props {
  agentUrl: string;
  onDisconnect: () => void;
  notifications: AppNotification[];
  onMarkRead: (id: number) => void;
  onClearNotifications: () => void;
  children: ReactNode;
}

export default function Layout({ agentUrl, onDisconnect, notifications, onMarkRead, onClearNotifications, children }: Props) {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const { t } = useI18n();

  const navItems = [
    { to: "/", label: t("nav.dashboard"), hint: "⌘1" },
    { to: "/assets", label: t("nav.assets"), hint: "⌘2" },
    { to: "/jobs", label: t("nav.jobs"), hint: "⌘3" },
    { to: "/sla-policies", label: t("nav.sla"), hint: "⌘4" },
    { to: "/settings", label: t("nav.settings"), hint: "⌘5" },
  ];

  function handleDisconnect() {
    onDisconnect();
    navigate("/");
  }

  return (
    <div className="layout-root">
      <aside className="glass-sidebar layout-sidebar">
        <div className="sidebar-brand">
          <h1>Bifrost</h1>
          <p>Desktop</p>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                "nav-link" + (isActive ? " nav-active" : "")
              }
            >
              <span>{item.label}</span>
              <span className="nav-hint">{item.hint}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <NotificationCenter
            notifications={notifications}
            onMarkRead={onMarkRead}
            onClearAll={onClearNotifications}
          />
          <button className="theme-toggle" onClick={toggle}>
            {theme === "dark" ? "☀  Light" : "☾  Dark"}
          </button>
          <span className="agent-url">{agentUrl}</span>
          <div className="sidebar-footer-actions">
            <button className="btn-ghost btn-sm" onClick={handleDisconnect}>
              {t("common.disconnect")}
            </button>
          </div>
        </div>
      </aside>
      <main className="layout-main app-bg">
        {children}
      </main>
    </div>
  );
}
