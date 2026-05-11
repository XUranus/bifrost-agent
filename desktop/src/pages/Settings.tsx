import { useState, useEffect } from "react";
import { getHealth, getAgentInfo, listAgentProfiles, addAgentProfile, removeAgentProfile, setActiveAgent, getSettings, getAgentConfig, updateAgentConfig } from "../api/client";
import { useI18n } from "../i18n";
import { useTheme } from "../theme";
import { useToast } from "../components/Toast";
import { Skeleton } from "../components/Skeleton";
import PathPicker from "../components/PathPicker";
import type { HealthResponse, AgentInfoResponse } from "../types";

interface AgentProfile {
  name: string;
  url: string;
  token: string;
}

type SettingsTab = "connection" | "appearance" | "storage" | "about";

interface Props {
  onDisconnect: () => void;
  agentUrl: string;
}

export default function SettingsPage({ onDisconnect, agentUrl }: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<SettingsTab>("connection");

  return (
    <div>
      <div className="page-header">
        <h2>{t("settings.title")}</h2>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {(["connection", "appearance", "storage", "about"] as SettingsTab[]).map((tp) => (
          <button
            key={tp}
            className={`btn-pill${tab === tp ? " btn-pill-active" : ""}`}
            onClick={() => setTab(tp)}
          >
            {t(`settings.tab${tp.charAt(0).toUpperCase() + tp.slice(1)}` as string)}
          </button>
        ))}
      </div>

      {tab === "connection" && <ConnectionTab onDisconnect={onDisconnect} agentUrl={agentUrl} />}
      {tab === "appearance" && <AppearanceTab />}
      {tab === "storage" && <StorageTab />}
      {tab === "about" && <AboutTab />}
    </div>
  );
}

/* --- Connection Tab --- */

function ConnectionTab({ onDisconnect, agentUrl }: { onDisconnect: () => void; agentUrl: string }) {
  const { t } = useI18n();
  const { pushToast } = useToast();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [info, setInfo] = useState<AgentInfoResponse | null>(null);
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newToken, setNewToken] = useState("");

  async function load() {
    try {
      const [h, i, p, s] = await Promise.all([
        getHealth(),
        getAgentInfo(),
        listAgentProfiles(),
        getSettings(),
      ]);
      setHealth(h);
      setInfo(i);
      setProfiles(p);
      setActiveProfile((s as { active_profile?: string }).active_profile || null);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleAddProfile() {
    if (!newName.trim() || !newUrl.trim()) return;
    try {
      await addAgentProfile(newName.trim(), newUrl.trim(), newToken);
      pushToast(t("settings.profileAdded"), "success");
      setNewName("");
      setNewUrl("");
      setNewToken("");
      setShowAddForm(false);
      load();
    } catch (e) {
      pushToast(t("settings.profileAddFailed") + `: ${e}`, "error");
    }
  }

  async function handleRemoveProfile(name: string) {
    if (!confirm(t("settings.confirmRemove", { name }))) return;
    try {
      await removeAgentProfile(name);
      pushToast(t("settings.profileRemoved"), "success");
      load();
    } catch (e) {
      pushToast(t("settings.profileRemoveFailed") + `: ${e}`, "error");
    }
  }

  async function handleSwitchProfile(name: string) {
    try {
      await setActiveAgent(name);
      pushToast(t("settings.switchedTo", { name }), "success");
      load();
    } catch (e) {
      pushToast(t("settings.switchFailed") + `: ${e}`, "error");
    }
  }

  return (
    <div>
      {/* Agent URL + Disconnect */}
      <div className="glass-panel" style={{ marginBottom: 16 }}>
        <div className="panel-header"><h3>{t("settings.agentUrl")}</h3></div>
        <div className="panel-body" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontFamily: "'SF Mono', monospace", fontSize: 13, color: "var(--text-secondary)" }}>{agentUrl}</span>
          <button className="btn-danger btn-sm" onClick={onDisconnect}>{t("settings.disconnect")}</button>
        </div>
      </div>

      <div className="card-grid-2col">
        <div className="glass-panel">
          <div className="panel-header"><h3>{t("settings.agentHealth")}</h3></div>
          <div className="panel-body">
            {health ? (
              <dl className="detail-list">
                <dt>{t("settings.status")}</dt><dd><span className={`badge badge-${health.status}`}>{health.status}</span></dd>
                <dt>{t("settings.version")}</dt><dd>{health.version}</dd>
                <dt>{t("settings.uptime")}</dt><dd>{formatUptime(health.uptime_seconds)}</dd>
                <dt>{t("settings.database")}</dt><dd>{health.db_ok ? t("settings.connected") : t("settings.disconnected")}</dd>
                <dt>{t("settings.queueDepth")}</dt><dd>{String(health.queue_depth)}</dd>
              </dl>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {Array.from({ length: 5 }, (_, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
                    <Skeleton width="30%" height={14} />
                    <Skeleton width="45%" height={14} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="glass-panel">
          <div className="panel-header"><h3>{t("settings.agentInfo")}</h3></div>
          <div className="panel-body">
            {info ? (
              <dl className="detail-list">
                <dt>{t("settings.version")}</dt><dd>{info.version}</dd>
                <dt>{t("settings.platform")}</dt><dd>{info.platform}</dd>
                <dt>{t("settings.uptime")}</dt><dd>{formatUptime(info.uptime_seconds)}</dd>
                <dt>{t("settings.backends")}</dt><dd>{info.backends.join(", ") || t("common.none")}</dd>
                <dt>{t("settings.capabilities")}</dt><dd>{info.capabilities.join(", ") || t("common.none")}</dd>
              </dl>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {Array.from({ length: 5 }, (_, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
                    <Skeleton width="30%" height={14} />
                    <Skeleton width="45%" height={14} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Agent Profiles */}
      <div className="glass-panel" style={{ marginTop: 16 }}>
        <div className="panel-header">
          <h3>{t("settings.agentProfiles")}</h3>
          <button className="btn-ghost btn-sm" onClick={() => setShowAddForm(!showAddForm)}>
            {showAddForm ? t("common.cancel") : t("settings.addProfile")}
          </button>
        </div>
        <div className="panel-body">
          {showAddForm && (
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <input className="glass-input" style={{ flex: "0 0 120px" }} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("settings.profileName")} />
              <input className="glass-input" style={{ flex: 1, minWidth: 200 }} value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder={t("settings.profileUrl")} />
              <input className="glass-input" style={{ flex: "0 0 160px" }} type="password" value={newToken} onChange={(e) => setNewToken(e.target.value)} placeholder={t("settings.profileToken")} />
              <button className="btn-primary btn-sm" onClick={handleAddProfile}>{t("common.create")}</button>
            </div>
          )}
          {profiles.length === 0 ? (
            <p className="empty-state">{t("settings.noProfiles")}</p>
          ) : (
            <div className="agent-profiles">
              {profiles.map((p) => (
                <div key={p.name} className="agent-profile-row">
                  <div className="agent-profile-info">
                    <span className="agent-profile-name">
                      {p.name}
                      {activeProfile === p.name && <span className="agent-active-badge" style={{ marginLeft: 8 }}>{t("settings.active")}</span>}
                    </span>
                    <span className="agent-profile-url">{p.url}</span>
                  </div>
                  <div className="agent-profile-actions">
                    {activeProfile !== p.name && (
                      <button className="btn-primary btn-sm" onClick={() => handleSwitchProfile(p.name)}>{t("settings.switch")}</button>
                    )}
                    <button className="btn-danger btn-sm" onClick={() => handleRemoveProfile(p.name)}>{t("settings.removeProfile")}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* --- Appearance Tab --- */

function AppearanceTab() {
  const { t, locale, setLocale } = useI18n();
  const { theme, toggle } = useTheme();

  return (
    <div>
      <div className="glass-panel" style={{ marginBottom: 16 }}>
        <div className="panel-header"><h3>{t("settings.theme")}</h3></div>
        <div className="panel-body">
          <div style={{ display: "flex", gap: 8 }}>
            <button className={`btn-pill${theme === "light" ? " btn-pill-active" : ""}`} onClick={() => { if (theme !== "light") toggle(); }}>
              {t("settings.light")}
            </button>
            <button className={`btn-pill${theme === "dark" ? " btn-pill-active" : ""}`} onClick={() => { if (theme !== "dark") toggle(); }}>
              {t("settings.dark")}
            </button>
          </div>
        </div>
      </div>

      <div className="glass-panel">
        <div className="panel-header"><h3>{t("settings.language")}</h3></div>
        <div className="panel-body">
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className={`btn-pill${locale === "en" ? " btn-pill-active" : ""}`}
              onClick={() => setLocale("en")}
            >
              English
            </button>
            <button
              className={`btn-pill${locale === "zh" ? " btn-pill-active" : ""}`}
              onClick={() => setLocale("zh")}
            >
              中文
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --- Storage Tab --- */

function StorageTab() {
  const { t } = useI18n();
  const { pushToast } = useToast();
  const [storageDir, setStorageDir] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPathPicker, setShowPathPicker] = useState(false);

  useEffect(() => {
    getAgentConfig()
      .then((cfg) => { setStorageDir(cfg.copy_storage_dir); })
      .catch(() => {})
      .finally(() => { setLoading(false); });
  }, []);

  async function handleSave() {
    if (!storageDir.trim()) return;
    setSaving(true);
    try {
      await updateAgentConfig({ copy_storage_dir: storageDir.trim() });
      pushToast(t("settings.storageSaved"), "success");
    } catch (e) {
      pushToast(t("settings.storageSaveFailed") + `: ${e}`, "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <div className="glass-panel">
          <div className="panel-header"><h3>{t("settings.storageTitle")}</h3></div>
          <div className="panel-body"><Skeleton width="80%" height={38} /></div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="glass-panel">
        <div className="panel-header"><h3>{t("settings.storageTitle")}</h3></div>
        <div className="panel-body">
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 6, textTransform: "uppercase", letterSpacing: "0.3px" }}>
            {t("settings.copyStorageDir")}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                className="glass-input"
                style={{ flex: 1, fontFamily: "'SF Mono', monospace", fontSize: 13 }}
                value={storageDir}
                onChange={(e) => setStorageDir(e.target.value)}
              />
              <button className="btn-secondary btn-sm" onClick={() => setShowPathPicker(true)}>
                {t("pathPicker.browse")}
              </button>
            </div>
          </label>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
            <button className="btn-primary" onClick={handleSave} disabled={saving || !storageDir.trim()}>
              {saving ? t("common.loading") : t("settings.saveStorage")}
            </button>
          </div>
        </div>
      </div>

      {showPathPicker && (
        <PathPicker
          onSelect={(path) => { setStorageDir(path); setShowPathPicker(false); }}
          onClose={() => setShowPathPicker(false)}
          initialPath={storageDir}
        />
      )}
    </div>
  );
}

/* --- About Tab --- */

function AboutTab() {
  const { t } = useI18n();
  const [info, setInfo] = useState<AgentInfoResponse | null>(null);

  useEffect(() => {
    getAgentInfo().then(setInfo).catch(() => {});
  }, []);

  return (
    <div>
      <div className="glass-panel" style={{ marginBottom: 16 }}>
        <div className="panel-header"><h3>{t("settings.about")}</h3></div>
        <div className="panel-body">
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, whiteSpace: "pre-line" }}>
            {t("settings.aboutText")}
          </p>
        </div>
      </div>

      {info && (
        <div className="glass-panel">
          <div className="panel-header"><h3>{t("settings.agentInfo")}</h3></div>
          <div className="panel-body">
            <dl className="detail-list">
              <dt>{t("settings.version")}</dt><dd>{info.version}</dd>
              <dt>{t("settings.platform")}</dt><dd>{info.platform}</dd>
              <dt>{t("settings.backends")}</dt><dd>{info.backends.join(", ") || t("common.none")}</dd>
              <dt>{t("settings.capabilities")}</dt><dd>{info.capabilities.join(", ") || t("common.none")}</dd>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}
