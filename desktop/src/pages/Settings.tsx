import { useState, useEffect } from "react";
import { getHealth, getAgentInfo, listAgentProfiles, addAgentProfile, removeAgentProfile, setActiveAgent, getSettings } from "../api/client";
import { useI18n } from "../i18n";
import { useToast } from "../components/Toast";
import { Skeleton } from "../components/Skeleton";
import type { HealthResponse, AgentInfoResponse } from "../types";

interface AgentProfile {
  name: string;
  url: string;
  token: string;
}

export default function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
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
      <div className="page-header">
        <h2>{t("settings.title")}</h2>
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
      <div className="glass-panel" style={{ marginBottom: 16 }}>
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

      {/* Language */}
      <div className="glass-panel" style={{ marginBottom: 16 }}>
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

      <div className="glass-panel">
        <div className="panel-header"><h3>{t("settings.about")}</h3></div>
        <div className="panel-body">
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, whiteSpace: "pre-line" }}>
            {t("settings.aboutText")}
          </p>
        </div>
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}
