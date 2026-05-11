import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getAsset, updateAsset } from "../api/client";
import { useToast } from "../components/Toast";
import { Skeleton, SkeletonPanel } from "../components/Skeleton";
import { useI18n } from "../i18n";
import type { AssetResponse, AssetConfig } from "../types";

export default function EditAsset() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [asset, setAsset] = useState<AssetResponse | null>(null);

  // Editable fields
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [paths, setPaths] = useState<string[]>([""]);
  const [consistency, setConsistency] = useState(false);
  const [excludePatterns, setExcludePatterns] = useState<string[]>([]);
  const [volumeBackend, setVolumeBackend] = useState("btrfs");
  const [volumeId, setVolumeId] = useState("");
  const [nasUrl, setNasUrl] = useState("");
  const [nasCredential, setNasCredential] = useState("");

  useEffect(() => {
    if (!id) return;
    getAsset(id)
      .then((a) => {
        setAsset(a);
        setName(a.name);
        setEnabled(a.enabled);
        populateConfig(a.config);
      })
      .catch((e) => pushToast(t("editAsset.loadFailed") + `: ${e}`, "error"))
      .finally(() => setLoading(false));
  }, [id]);

  function populateConfig(config: AssetConfig) {
    switch (config.type) {
      case "Fileset":
        setPaths(config.paths?.length ? config.paths : [""]);
        setConsistency(config.consistency_mode ?? false);
        setExcludePatterns(config.exclude_patterns ?? []);
        break;
      case "Volume":
        setVolumeBackend(config.backend || "btrfs");
        setVolumeId(config.volume_id || "");
        break;
      case "NasShare":
        setNasUrl(config.url || "");
        setNasCredential(config.credential_id || "");
        break;
    }
  }

  function buildConfig(): Record<string, unknown> {
    if (!asset) return {};
    switch (asset.config.type) {
      case "Fileset":
        return {
          type: "Fileset",
          paths: paths.filter((p) => p.trim()),
          consistency_mode: consistency,
          exclude_patterns: excludePatterns,
        };
      case "Volume":
        return { type: "Volume", backend: volumeBackend, volume_id: volumeId };
      case "NasShare":
        return { type: "NasShare", url: nasUrl, credential_id: nasCredential || null };
    }
  }

  async function handleSubmit() {
    if (!id || !asset || !name.trim()) return;
    setSubmitting(true);
    try {
      await updateAsset(id, {
        name,
        kind: asset.kind,
        config: buildConfig(),
        sla_policy: {
          name: asset.sla_policy.name,
          copy_mode: asset.sla_policy.copy_mode,
          backup_type: asset.sla_policy.backup_type,
          schedule_cron: asset.sla_policy.schedule_cron,
          block_size: asset.sla_policy.block_size,
          subtask_count: asset.sla_policy.subtask_count,
          memory_limit_mb: asset.sla_policy.memory_limit_mb,
          retention_kind: asset.sla_policy.retention_kind,
          retention_value: asset.sla_policy.retention_value,
        },
      });
      pushToast(t("editAsset.assetUpdated"), "success");
      navigate(`/assets/${id}`);
    } catch (e) {
      pushToast(t("editAsset.updateFailed") + `: ${e}`, "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div>
        <div className="page-header"><Skeleton width="25%" height={22} /></div>
        <SkeletonPanel rows={5} />
      </div>
    );
  }
  if (!asset) return <p className="error-msg">{t("editAsset.assetNotFound")}</p>;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button className="btn-ghost" onClick={() => navigate(`/assets/${id}`)}>&larr; {t("editAsset.back")}</button>
          <h2>{t("editAsset.title")}</h2>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: 28, marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>{t("editAsset.configTitle")}</h3>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <label style={labelStyle}>
            {t("editAsset.assetName")}
            <input className="glass-input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>{t("editAsset.enabled")}</span>
          </label>

          {asset.config.type === "Fileset" && (
            <>
              <label style={labelStyle}>
                {t("editAsset.backupPaths")}
                {paths.map((p, i) => (
                  <div key={i} style={{ display: "flex", gap: 8 }}>
                    <input
                      className="glass-input"
                      value={p}
                      onChange={(e) => {
                        const next = [...paths];
                        next[i] = e.target.value;
                        setPaths(next);
                      }}
                      placeholder="/path/to/backup"
                    />
                    {paths.length > 1 && (
                      <button className="btn-ghost btn-sm" onClick={() => setPaths(paths.filter((_, j) => j !== i))}>{t("editAsset.remove")}</button>
                    )}
                  </div>
                ))}
              </label>
              <button className="btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setPaths([...paths, ""])}>{t("editAsset.addPath")}</button>
              <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={consistency} onChange={(e) => setConsistency(e.target.checked)} />
                <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>{t("editAsset.consistencyMode")}</span>
              </label>
            </>
          )}

          {asset.config.type === "Volume" && (
            <>
              <label style={labelStyle}>
                {t("editAsset.backend")}
                <select className="glass-input" value={volumeBackend} onChange={(e) => setVolumeBackend(e.target.value)}>
                  <option value="btrfs">btrfs</option>
                  <option value="lvm">LVM</option>
                  <option value="zfs">ZFS</option>
                </select>
              </label>
              <label style={labelStyle}>
                {t("editAsset.volumeId")}
                <input className="glass-input" value={volumeId} onChange={(e) => setVolumeId(e.target.value)} />
              </label>
            </>
          )}

          {asset.config.type === "NasShare" && (
            <>
              <label style={labelStyle}>
                {t("editAsset.nasUrl")}
                <input className="glass-input" value={nasUrl} onChange={(e) => setNasUrl(e.target.value)} />
              </label>
              <label style={labelStyle}>
                {t("editAsset.credentialId")}
                <input className="glass-input" value={nasCredential} onChange={(e) => setNasCredential(e.target.value)} />
              </label>
            </>
          )}
        </div>
      </div>

      {/* SLA info (read-only) */}
      <div className="glass-panel" style={{ padding: 28, marginBottom: 16 }}>
        <div className="panel-header" style={{ marginBottom: 12 }}>
          <h3>{t("editAsset.slaPolicy")}: {asset.sla_policy.name}</h3>
        </div>
        <dl className="detail-list">
          <dt>{t("editAsset.copyMode")}</dt><dd>{asset.sla_policy.copy_mode}</dd>
          <dt>{t("editAsset.backupType")}</dt><dd>{asset.sla_policy.backup_type}</dd>
          <dt>{t("editAsset.schedule")}</dt><dd>{asset.sla_policy.schedule_cron}</dd>
          <dt>{t("editAsset.retention")}</dt><dd>{`${asset.sla_policy.retention_kind}=${asset.sla_policy.retention_value}`}</dd>
        </dl>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 8 }}>
          {t("editAsset.slaHint")} <a href="#/sla-policies" style={{ color: "var(--accent)" }} onClick={(e) => { e.preventDefault(); navigate("/sla-policies"); }}>{t("editAsset.slaLink")}</a>.
        </p>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 16 }}>
        <button className="btn-secondary" onClick={() => navigate(`/assets/${id}`)}>{t("common.cancel")}</button>
        <button className="btn-primary" onClick={handleSubmit} disabled={submitting || !name.trim()}>
          {submitting ? t("editAsset.saving") : t("editAsset.saveChanges")}
        </button>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-secondary)",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  textTransform: "uppercase",
  letterSpacing: "0.3px",
};
