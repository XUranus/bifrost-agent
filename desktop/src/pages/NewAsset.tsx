import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createAsset } from "../api/client";
import { useToast } from "../components/Toast";
import { useI18n } from "../i18n";
import PathPicker from "../components/PathPicker";

type AssetKind = "fileset" | "volume" | "nas_share";

export default function NewAsset() {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Step 0: type
  const [kind, setKind] = useState<AssetKind>("fileset");

  // Step 1: config
  const [name, setName] = useState("");
  const [paths, setPaths] = useState<string[]>([""]);
  const [consistency, setConsistency] = useState(false);
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

  function canProceed(): boolean {
    switch (step) {
      case 0: return true;
      case 1:
        if (!name.trim()) return false;
        if (kind === "fileset") return paths.some((p) => p.trim());
        if (kind === "volume") return volumeId.trim() !== "";
        if (kind === "nas_share") return nasHost.trim() !== "" && (nasProtocol === "smb" ? nasShare.trim() !== "" : nasExport.trim() !== "");
        return false;
      default: return false;
    }
  }

  async function handleCreate() {
    setSubmitting(true);
    try {
      const config = buildConfig();
      const body = { name, kind, config };
      await createAsset(body);
      pushToast(t("newAsset.created"), "success");
      navigate("/assets");
    } catch (e) {
      pushToast(t("newAsset.createFailed") + `: ${e}`, "error");
    } finally {
      setSubmitting(false);
    }
  }

  function buildConfig() {
    switch (kind) {
      case "fileset":
        return {
          type: "Fileset",
          paths: paths.filter((p) => p.trim()),
          consistency_mode: consistency,
          exclude_patterns: [] as string[],
        };
      case "volume":
        return { type: "Volume", backend: volumeBackend, volume_id: volumeId };
      case "nas_share":
        return { type: "NasShare", url: buildNasUrl(), credential_id: null };
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

  return (
    <div>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button className="btn-ghost" onClick={() => navigate("/assets")}>&larr; {t("newAsset.back")}</button>
          <h2>{t("newAsset.title")}</h2>
        </div>
      </div>

      {/* Step indicator */}
      <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
        {[t("newAsset.stepType"), t("newAsset.stepConfig")].map((label, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              padding: "10px 16px",
              borderRadius: 10,
              textAlign: "center",
              fontSize: 13,
              fontWeight: 600,
              cursor: i < step ? "pointer" : "default",
              background: i === step ? "var(--accent-soft)" : i < step ? "var(--glass-bg)" : "var(--input-bg)",
              color: i === step ? "var(--accent)" : i < step ? "var(--text-primary)" : "var(--text-tertiary)",
              border: i === step ? "1px solid var(--input-focus-border)" : "1px solid var(--glass-border-subtle)",
              transition: "all 0.15s ease",
            }}
            onClick={() => { if (i < step) setStep(i); }}
          >
            {i + 1}. {label}
          </div>
        ))}
      </div>

      <div className="glass-panel" style={{ padding: 28 }}>
        {step === 0 && (
          <StepType kind={kind} onSelect={setKind} />
        )}
        {step === 1 && (
          <StepConfig
            kind={kind}
            name={name} setName={setName}
            paths={paths} setPaths={setPaths}
            consistency={consistency} setConsistency={setConsistency}
            volumeBackend={volumeBackend} setVolumeBackend={setVolumeBackend}
            volumeId={volumeId} setVolumeId={setVolumeId}
            nasProtocol={nasProtocol} setNasProtocol={setNasProtocol}
            nasHost={nasHost} setNasHost={setNasHost}
            nasShare={nasShare} setNasShare={setNasShare}
            nasExport={nasExport} setNasExport={setNasExport}
            nasSubpath={nasSubpath} setNasSubpath={setNasSubpath}
            nasUsername={nasUsername} setNasUsername={setNasUsername}
            nasPassword={nasPassword} setNasPassword={setNasPassword}
            nasPort={nasPort} setNasPort={setNasPort}
            nasUid={nasUid} setNasUid={setNasUid}
            nasGid={nasGid} setNasGid={setNasGid}
          />
        )}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--glass-border-subtle)" }}>
          <button
            className="btn-secondary"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            {t("common.back")}
          </button>
          {step < 1 ? (
            <button
              className="btn-primary"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canProceed()}
            >
              {t("common.next")}
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={handleCreate}
              disabled={!canProceed() || submitting}
            >
              {submitting ? t("newAsset.creating") : t("newAsset.createAsset")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* --- Step 0: Asset Type --- */

function StepType({ kind, onSelect }: { kind: AssetKind; onSelect: (k: AssetKind) => void }) {
  const { t } = useI18n();

  const types: { value: AssetKind; label: string; desc: string }[] = [
    { value: "fileset", label: t("newAsset.fileset"), desc: t("newAsset.filesetDesc") },
    { value: "volume", label: t("newAsset.volume"), desc: t("newAsset.volumeDesc") },
    { value: "nas_share", label: t("newAsset.nasShare"), desc: t("newAsset.nasShareDesc") },
  ];

  return (
    <div>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>{t("newAsset.selectType")}</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {types.map((tp) => (
          <div
            key={tp.value}
            onClick={() => onSelect(tp.value)}
            style={{
              padding: "16px 20px",
              borderRadius: 12,
              cursor: "pointer",
              border: kind === tp.value ? "2px solid var(--accent)" : "1px solid var(--glass-border-subtle)",
              background: kind === tp.value ? "var(--accent-soft)" : "var(--input-bg)",
              transition: "all 0.15s ease",
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{tp.label}</span>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{tp.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --- Step 1: Configuration --- */

interface StepConfigProps {
  kind: AssetKind;
  name: string; setName: (v: string) => void;
  paths: string[]; setPaths: (v: string[]) => void;
  consistency: boolean; setConsistency: (v: boolean) => void;
  volumeBackend: string; setVolumeBackend: (v: string) => void;
  volumeId: string; setVolumeId: (v: string) => void;
  nasProtocol: "smb" | "nfs"; setNasProtocol: (v: "smb" | "nfs") => void;
  nasHost: string; setNasHost: (v: string) => void;
  nasShare: string; setNasShare: (v: string) => void;
  nasExport: string; setNasExport: (v: string) => void;
  nasSubpath: string; setNasSubpath: (v: string) => void;
  nasUsername: string; setNasUsername: (v: string) => void;
  nasPassword: string; setNasPassword: (v: string) => void;
  nasPort: string; setNasPort: (v: string) => void;
  nasUid: string; setNasUid: (v: string) => void;
  nasGid: string; setNasGid: (v: string) => void;
}

function StepConfig(props: StepConfigProps) {
  const { t } = useI18n();
  const { kind, name, setName, paths, setPaths, consistency, setConsistency,
    volumeBackend, setVolumeBackend, volumeId, setVolumeId,
    nasProtocol, setNasProtocol, nasHost, setNasHost,
    nasShare, setNasShare, nasExport, setNasExport, nasSubpath, setNasSubpath,
    nasUsername, setNasUsername, nasPassword, setNasPassword,
    nasPort, setNasPort, nasUid, setNasUid, nasGid, setNasGid } = props;
  const [pathPickerIndex, setPathPickerIndex] = useState<number | null>(null);

  return (
    <div>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>{t("newAsset.configTitle")}</h3>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <label style={labelStyle}>
          {t("newAsset.assetName")}
          <input className="glass-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("newAsset.assetNamePlaceholder")} />
        </label>

        {kind === "fileset" && (
          <>
            <label style={labelStyle}>
              {t("newAsset.backupPaths")}
              {paths.map((p, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="glass-input" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minHeight: 38, display: "flex", alignItems: "center", fontFamily: "'SF Mono', monospace", fontSize: 13 }}>
                    {p || t("newAsset.assetNamePlaceholder")}
                  </span>
                  <button className="btn-secondary btn-sm" onClick={() => setPathPickerIndex(i)}>{t("pathPicker.browse")}</button>
                  {paths.length > 1 && (
                    <button className="btn-ghost btn-sm" onClick={() => setPaths(paths.filter((_, j) => j !== i))}>{t("newAsset.remove")}</button>
                  )}
                </div>
              ))}
            </label>
            <button className="btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setPaths([...paths, ""])}>{t("newAsset.addPath")}</button>
            <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={consistency} onChange={(e) => setConsistency(e.target.checked)} />
              <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>{t("newAsset.consistencyMode")}</span>
            </label>
          </>
        )}

        {kind === "volume" && (
          <>
            <label style={labelStyle}>
              {t("newAsset.backend")}
              <select className="glass-input" value={volumeBackend} onChange={(e) => setVolumeBackend(e.target.value)}>
                <option value="btrfs">btrfs</option>
                <option value="lvm">LVM</option>
                <option value="zfs">ZFS</option>
              </select>
            </label>
            <label style={labelStyle}>
              {t("newAsset.volumeId")}
              <input className="glass-input" value={volumeId} onChange={(e) => setVolumeId(e.target.value)} placeholder="e.g. /dev/sda1 or pool/volume" />
            </label>
          </>
        )}

        {kind === "nas_share" && (
          <>
            <div>
              <span style={labelStyle}>{t("newAsset.nasProtocol")}</span>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button className={`btn-pill${nasProtocol === "smb" ? " btn-pill-active" : ""}`} onClick={() => setNasProtocol("smb")}>{t("newAsset.nasSmb")}</button>
                <button className={`btn-pill${nasProtocol === "nfs" ? " btn-pill-active" : ""}`} onClick={() => setNasProtocol("nfs")}>{t("newAsset.nasNfs")}</button>
              </div>
            </div>

            <label style={labelStyle}>
              {t("newAsset.nasServer")}
              <input className="glass-input" value={nasHost} onChange={(e) => setNasHost(e.target.value)} placeholder="192.168.1.10" />
            </label>

            {nasProtocol === "smb" ? (
              <>
                <label style={labelStyle}>
                  {t("newAsset.nasShareName")}
                  <input className="glass-input" value={nasShare} onChange={(e) => setNasShare(e.target.value)} placeholder="shared" />
                </label>
                <label style={labelStyle}>
                  {t("newAsset.nasSubpath")}
                  <input className="glass-input" value={nasSubpath} onChange={(e) => setNasSubpath(e.target.value)} placeholder="/backup/data" />
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <label style={labelStyle}>
                    {t("newAsset.nasUsername")}
                    <input className="glass-input" value={nasUsername} onChange={(e) => setNasUsername(e.target.value)} />
                  </label>
                  <label style={labelStyle}>
                    {t("newAsset.nasPassword")}
                    <input className="glass-input" type="password" value={nasPassword} onChange={(e) => setNasPassword(e.target.value)} />
                  </label>
                </div>
                <label style={labelStyle}>
                  {t("newAsset.nasPort")}
                  <input className="glass-input" value={nasPort} onChange={(e) => setNasPort(e.target.value)} placeholder="445" />
                </label>
              </>
            ) : (
              <>
                <label style={labelStyle}>
                  {t("newAsset.nasExport")}
                  <input className="glass-input" value={nasExport} onChange={(e) => setNasExport(e.target.value)} placeholder="/export/data" />
                </label>
                <label style={labelStyle}>
                  {t("newAsset.nasSubpath")}
                  <input className="glass-input" value={nasSubpath} onChange={(e) => setNasSubpath(e.target.value)} placeholder="/backup" />
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                  <label style={labelStyle}>
                    {t("newAsset.nasUid")}
                    <input className="glass-input" type="number" value={nasUid} onChange={(e) => setNasUid(e.target.value)} />
                  </label>
                  <label style={labelStyle}>
                    {t("newAsset.nasGid")}
                    <input className="glass-input" type="number" value={nasGid} onChange={(e) => setNasGid(e.target.value)} />
                  </label>
                  <label style={labelStyle}>
                    {t("newAsset.nasPort")}
                    <input className="glass-input" value={nasPort} onChange={(e) => setNasPort(e.target.value)} placeholder="2049" />
                  </label>
                </div>
              </>
            )}
          </>
        )}
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
