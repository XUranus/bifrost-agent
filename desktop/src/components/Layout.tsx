import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";

interface Props {
  agentUrl: string;
  onDisconnect: () => void;
  children: ReactNode;
}

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/assets", label: "Assets" },
  { to: "/jobs", label: "Jobs" },
  { to: "/settings", label: "Settings" },
];

export default function Layout({ agentUrl, onDisconnect, children }: Props) {
  const navigate = useNavigate();

  function handleDisconnect() {
    onDisconnect();
    navigate("/");
  }

  return (
    <div style={styles.root}>
      <aside style={styles.sidebar}>
        <div style={styles.brand}>
          <h1 style={styles.title}>Bifrost</h1>
          <p style={styles.subtitle}>Desktop</p>
        </div>
        <nav style={styles.nav}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                ...styles.navLink,
                ...(isActive ? styles.navLinkActive : {}),
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div style={styles.footer}>
          <p style={styles.agentUrl}>{agentUrl}</p>
          <button style={styles.disconnectBtn} onClick={handleDisconnect}>
            Disconnect
          </button>
        </div>
      </aside>
      <main style={styles.main}>{children}</main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    height: "100vh",
    backgroundColor: "#f5f5f5",
  },
  sidebar: {
    width: 220,
    backgroundColor: "#1a1a2e",
    color: "#fff",
    display: "flex",
    flexDirection: "column",
    padding: "20px 0",
    flexShrink: 0,
  },
  brand: {
    padding: "0 20px 24px",
    borderBottom: "1px solid rgba(255,255,255,0.1)",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    opacity: 0.5,
    marginTop: 2,
  },
  nav: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  navLink: {
    display: "block",
    padding: "10px 20px",
    color: "rgba(255,255,255,0.7)",
    textDecoration: "none",
    fontSize: 14,
    transition: "background 0.15s",
  },
  navLinkActive: {
    color: "#fff",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRight: "3px solid #6c63ff",
  },
  footer: {
    padding: "16px 20px",
    borderTop: "1px solid rgba(255,255,255,0.1)",
  },
  agentUrl: {
    fontSize: 11,
    opacity: 0.5,
    wordBreak: "break-all",
    marginBottom: 8,
  },
  disconnectBtn: {
    width: "100%",
    padding: "8px 0",
    backgroundColor: "rgba(255,255,255,0.1)",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
  },
  main: {
    flex: 1,
    overflow: "auto",
    padding: 32,
  },
};
