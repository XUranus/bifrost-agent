import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getAsset, updateAsset } from "../api/client";
import { useToast } from "../components/Toast";
import { Skeleton, SkeletonPanel } from "../components/Skeleton";
import { useI18n } from "../i18n";
import PathPicker from "../components/PathPicker";
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
  const [nasProtocol, setNasProtocol] = useState<"smb" | "nfs">("smb");
  const [nasHost, setNasHost] = useState("");
  const [nasShare, setNasShare] = useState("");
  const [nasExport, setNasExport] = useState("");
  const [nasSubpath, setNasSubpath] = useState("");
  const [nasUsername, setNasUsername] = useState("");
  const [nasPassword, setNasPassword] = useState("");
  const [nasPort, setNasPort] = useState("");
  const [nasUid, setNasUid] = useState("0");
  const [nasGid, setNasGid] = useState("0");
  const [pathPickerIndex, setPathPickerIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    getAsset(id)
      .then((a) => {
        setAsset(a);
        setName(a.name);
        setEnabled(a.enabled);
        if (a.config) populateConfig(a.config);
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
        parseNasUrl(config.url || "");
        break;
    }
  }

  function buildConfig(): Record<string, unknown> {
    if (!asset?.config) return {};
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
        return { type: "NasShare", url: buildNasUrl(), credential_id: null };
    }
  }

  function parseNasUrl(url: string) {
    if (url.startsWith("smb://")) {
      setNasProtocol("smb");
      const rest = url.slice(6);
      const [hostPart, ...pathParts] = rest.split("/");
      const [host, port] = hostPart.split(":");
      setNasHost(host || "");
      setNasPort(port || "");
      const shareAndPath = pathParts.join("/");
      const [shareWithParams] = shareAndPath.split("?");
      const shareParts = shareWithParams.split("/");
      setNasShare(shareParts[0] || "");
      setNasSubpath(shareParts.slice(1).join("/") ? "/" + shareParts.slice(1).join("/") : "");
      const params = new URLSearchParams(shareParts.length > 1 ? "" : rest.split("?")[1] || "");
      setNasUsername(params.get("username") || "");
      setNasPassword(params.get("password") || "");
    } else if (url.startsWith("nfs://")) {
      setNasProtocol("nfs");
      const rest = url.slice(6);
      const [hostPart, ...pathParts] = rest.split("/");
      const [host, port] = hostPart.split(":");
      setNasHost(host || "");
      setNasPort(port || "");
      const fullPath = "/" + pathParts.join("/");
      const [pathOnly] = fullPath.split("?");
      const pathSegments = pathOnly.split("/").filter(Boolean);
      setNasExport(pathSegments.length > 0 ? "/" + pathSegments[0] : "/");
      setNasSubpath(pathSegments.length > 1 ? "/" + pathSegments.slice(1).join("/") : "");
      const qs = fullPath.includes("?") ? fullPath.split("?")[1] : "";
      const params = new URLSearchParams(qs);
      setNasUid(params.get("uid") || "0");
      setNasGid(params.get("gid") || "0");
    }
  }

  function buildNasUrl(): string {
    if (nasProtocol === "smb") {
      let url = `smb://${nasHost}`;
      if (nasPort && nasPort !== "445") url += `:${nasPort}`;
      url += `/${nasShare}`;
      if (nasSubpath) url += nasSubpath.startsWith("/") ? nasSubpath : `/${nasSubpath}`;
      const params = new URLSearchParams();
      if (nasUsername) params.set("username", nasUsername);
      if (nasPassword) params.set("password", nasPassword);
      const qs = params.toString();
      if (qs) url += `?${qs}`;
      return url;
    } else {
      let url = `nfs://${nasHost}`;
      if (nasPort && nasPort !== "2049") url += `:${nasPort}`;
      url += nasExport.startsWith("/") ? nasExport : `/${nasExport}`;
      if (nasSubpath) url += nasSubpath.startsWith("/") ? nasSubpath : `/${nasSubpath}`;
      const params = new URLSearchParams();
      if (nasUid !== "0") params.set("uid", nasUid);
      if (nasGid !== "0") params.set("gid", nasGid);
      const qs = params.toString();
      if (qs) url += `?${qs}`;
      return url;
    }
  }

  async function handleSubmit() {
    if (!id || !asset || !name.trim() || !asset.sla_policy) return;
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

          {asset.config?.type === "Fileset" && (
            <>
              <label style={labelStyle}>
                {t("editAsset.backupPaths")}
                {paths.map((p, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className="glass-input" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minHeight: 38, display: "flex", alignItems: "center", fontFamily: "'SF Mono', monospace", fontSize: 13 }}>
                      {p || "/path/to/backup"}
                    </span>
                    <button className="btn-secondary btn-sm" onClick={() => setPathPickerIndex(i)}>{t("pathPicker.browse")}</button>
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

          {asset.config?.type === "Volume" && (
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

          {asset.config?.type === "NasShare" && (
            <>
              <div>
                <span style={labelStyle}>{t("editAsset.nasProtocol")}</span>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <button className={`btn-pill${nasProtocol === "smb" ? " btn-pill-active" : ""}`} onClick={() => setNasProtocol("smb")}>{t("editAsset.nasSmb")}</button>
                  <button className={`btn-pill${nasProtocol === "nfs" ? " btn-pill-active" : ""}`} onClick={() => setNasProtocol("nfs")}>{t("editAsset.nasNfs")}</button>
                </div>
              </div>

              <label style={labelStyle}>
                {t("editAsset.nasServer")}
                <input className="glass-input" value={nasHost} onChange={(e) => setNasHost(e.target.value)} placeholder="192.168.1.10" />
              </label>

              {nasProtocol === "smb" ? (
                <>
                  <label style={labelStyle}>
                    {t("editAsset.nasShareName")}
                    <input className="glass-input" value={nasShare} onChange={(e) => setNasShare(e.target.value)} placeholder="shared" />
                  </label>
                  <label style={labelStyle}>
                    {t("editAsset.nasSubpath")}
                    <input className="glass-input" value={nasSubpath} onChange={(e) => setNasSubpath(e.target.value)} placeholder="/backup/data" />
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <label style={labelStyle}>
                      {t("editAsset.nasUsername")}
                      <input className="glass-input" value={nasUsername} onChange={(e) => setNasUsername(e.target.value)} />
                    </label>
                    <label style={labelStyle}>
                      {t("editAsset.nasPassword")}
                      <input className="glass-input" type="password" value={nasPassword} onChange={(e) => setNasPassword(e.target.value)} />
                    </label>
                  </div>
                  <label style={labelStyle}>
                    {t("editAsset.nasPort")}
                    <input className="glass-input" value={nasPort} onChange={(e) => setNasPort(e.target.value)} placeholder="445" />
                  </label>
                </>
              ) : (
                <>
                  <label style={labelStyle}>
                    {t("editAsset.nasExport")}
                    <input className="glass-input" value={nasExport} onChange={(e) => setNasExport(e.target.value)} placeholder="/export/data" />
                  </label>
                  <label style={labelStyle}>
                    {t("editAsset.nasSubpath")}
                    <input className="glass-input" value={nasSubpath} onChange={(e) => setNasSubpath(e.target.value)} placeholder="/backup" />
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                    <label style={labelStyle}>
                      {t("editAsset.nasUid")}
                      <input className="glass-input" type="number" value={nasUid} onChange={(e) => setNasUid(e.target.value)} />
                    </label>
                    <label style={labelStyle}>
                      {t("editAsset.nasGid")}
                      <input className="glass-input" type="number" value={nasGid} onChange={(e) => setNasGid(e.target.value)} />
                    </label>
                    <label style={labelStyle}>
                      {t("editAsset.nasPort")}
                      <input className="glass-input" value={nasPort} onChange={(e) => setNasPort(e.target.value)} placeholder="2049" />
                    </label>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* SLA info (read-only) */}
      <div className="glass-panel" style={{ padding: 28, marginBottom: 16 }}>
        <div className="panel-header" style={{ marginBottom: 12 }}>
          <h3>{t("editAsset.slaPolicy")}: {asset.sla_policy?.name ?? "-"}</h3>
        </div>
        {asset.sla_policy ? (
          <dl className="detail-list">
            <dt>{t("editAsset.copyMode")}</dt><dd>{asset.sla_policy.copy_mode}</dd>
            <dt>{t("editAsset.backupType")}</dt><dd>{asset.sla_policy.backup_type}</dd>
            <dt>{t("editAsset.schedule")}</dt><dd>{asset.sla_policy.schedule_cron}</dd>
            <dt>{t("editAsset.retention")}</dt><dd>{`${asset.sla_policy.retention_kind}=${asset.sla_policy.retention_value}`}</dd>
          </dl>
        ) : (
          <p className="empty-state">{t("assetDetail.noSlaPolicy")}</p>
        )}
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

      {pathPickerIndex !== null && (
        <PathPicker
          initialPath={paths[pathPickerIndex] || "/"}
          onSelect={(p) => {
            const next = [...paths];
            next[pathPickerIndex] = p;
            setPaths(next);
            setPathPickerIndex(null);
          }}
          onClose={() => setPathPickerIndex(null)}
        />
      )}
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
