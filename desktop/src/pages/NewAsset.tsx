import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createAsset } from "../api/client";
import { useToast } from "../components/Toast";
import { useI18n } from "../i18n";

type AssetKind = "fileset" | "volume" | "nas_share";

interface SLAForm {
  name: string;
  copy_mode: string;
  backup_type: string;
  schedule_cron: string;
  block_size: number;
  subtask_count: number;
  memory_limit_mb: number;
  retention_kind: string;
  retention_value: number;
}

const DEFAULT_SLA: SLAForm = {
  name: "Default",
  copy_mode: "common",
  backup_type: "full",
  schedule_cron: "0 2 * * *",
  block_size: 1_048_576,
  subtask_count: 4,
  memory_limit_mb: 512,
  retention_kind: "by_count",
  retention_value: 7,
};

function getSchedulePresets(t: (k: string) => string) {
  return [
    { label: t("newAsset.everyHour"), cron: "0 * * * *" },
    { label: t("newAsset.daily2am"), cron: "0 2 * * *" },
    { label: t("newAsset.weeklySunday"), cron: "0 2 * * 0" },
    { label: t("newAsset.custom"), cron: "" },
  ];
}

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
  const [nasUrl, setNasUrl] = useState("");
  const [nasCredential, setNasCredential] = useState("");

  // Step 2: SLA
  const [sla, setSla] = useState<SLAForm>(DEFAULT_SLA);
  const [customCron, setCustomCron] = useState(false);

  function updateSla(field: keyof SLAForm, value: string | number) {
    setSla((prev) => ({ ...prev, [field]: value }));
  }

  function canProceed(): boolean {
    switch (step) {
      case 0: return true;
      case 1:
        if (!name.trim()) return false;
        if (kind === "fileset") return paths.some((p) => p.trim());
        if (kind === "volume") return volumeId.trim() !== "";
        if (kind === "nas_share") return nasUrl.trim() !== "";
        return false;
      case 2: return sla.name.trim() !== "" && sla.schedule_cron.trim() !== "";
      default: return false;
    }
  }

  async function handleCreate() {
    setSubmitting(true);
    try {
      const config = buildConfig();
      const body = {
        name,
        kind,
        config,
        sla_policy: {
          name: sla.name,
          copy_mode: sla.copy_mode,
          backup_type: sla.backup_type,
          schedule_cron: sla.schedule_cron,
          block_size: sla.block_size,
          subtask_count: sla.subtask_count,
          memory_limit_mb: sla.memory_limit_mb,
          retention_kind: sla.retention_kind,
          retention_value: sla.retention_value,
        },
      };
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
        return { type: "NasShare", url: nasUrl, credential_id: nasCredential || null };
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
        {[t("newAsset.stepType"), t("newAsset.stepConfig"), t("newAsset.stepSla")].map((label, i) => (
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
            nasUrl={nasUrl} setNasUrl={setNasUrl}
            nasCredential={nasCredential} setNasCredential={setNasCredential}
          />
        )}
        {step === 2 && (
          <StepSLA
            sla={sla}
            updateSla={updateSla}
            customCron={customCron}
            setCustomCron={setCustomCron}
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
          {step < 2 ? (
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
  nasUrl: string; setNasUrl: (v: string) => void;
  nasCredential: string; setNasCredential: (v: string) => void;
}

function StepConfig(props: StepConfigProps) {
  const { t } = useI18n();
  const { kind, name, setName, paths, setPaths, consistency, setConsistency,
    volumeBackend, setVolumeBackend, volumeId, setVolumeId,
    nasUrl, setNasUrl, nasCredential, setNasCredential } = props;

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
                <div key={i} style={{ display: "flex", gap: 8 }}>
                  <input
                    className="glass-input"
                    value={p}
                    onChange={(e) => {
                      const next = [...paths];
                      next[i] = e.target.value;
                      setPaths(next);
                    }}
                    placeholder="/home/user/data"
                  />
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
            <label style={labelStyle}>
              {t("newAsset.nasUrl")}
              <input className="glass-input" value={nasUrl} onChange={(e) => setNasUrl(e.target.value)} placeholder="nfs://server/share or smb://server/share" />
            </label>
            <label style={labelStyle}>
              {t("newAsset.credentialId")}
              <input className="glass-input" value={nasCredential} onChange={(e) => setNasCredential(e.target.value)} placeholder="Leave empty if not needed" />
            </label>
          </>
        )}
      </div>
    </div>
  );
}

/* --- Step 2: SLA Policy --- */

function StepSLA({ sla, updateSla, customCron, setCustomCron }: {
  sla: SLAForm;
  updateSla: (field: keyof SLAForm, value: string | number) => void;
  customCron: boolean;
  setCustomCron: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const schedulePresets = getSchedulePresets(t);

  return (
    <div>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>{t("newAsset.slaTitle")}</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <label style={labelStyle}>
          {t("newAsset.policyName")}
          <input className="glass-input" value={sla.name} onChange={(e) => updateSla("name", e.target.value)} placeholder={t("newAsset.policyNamePlaceholder")} />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <label style={labelStyle}>
            {t("newAsset.copyMode")}
            <select className="glass-input" value={sla.copy_mode} onChange={(e) => updateSla("copy_mode", e.target.value)}>
              <option value="common">{t("newAsset.standard")}</option>
              <option value="aggregate">{t("newAsset.aggregate")}</option>
            </select>
          </label>
          <label style={labelStyle}>
            {t("newAsset.backupType")}
            <select className="glass-input" value={sla.backup_type} onChange={(e) => updateSla("backup_type", e.target.value)}>
              <option value="full">{t("newAsset.full")}</option>
              <option value="full_incremental">{t("newAsset.incremental")}</option>
            </select>
          </label>
        </div>

        <div>
          <span style={labelStyle}>{t("newAsset.schedule")}</span>
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            {schedulePresets.map((p) => (
              <button
                key={p.label}
                className={`btn-pill${!customCron && sla.schedule_cron === p.cron ? " btn-pill-active" : ""}`}
                onClick={() => {
                  if (p.cron) {
                    setCustomCron(false);
                    updateSla("schedule_cron", p.cron);
                  } else {
                    setCustomCron(true);
                  }
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          {customCron && (
            <input
              className="glass-input"
              style={{ marginTop: 8 }}
              value={sla.schedule_cron}
              onChange={(e) => updateSla("schedule_cron", e.target.value)}
              placeholder="0 2 * * *"
            />
          )}
          <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>
            {t("newAsset.currentSchedule")}: <code style={{ fontFamily: "'SF Mono', monospace" }}>{sla.schedule_cron}</code>
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <label style={labelStyle}>
            {t("newAsset.blockSize")}
            <select className="glass-input" value={String(sla.block_size)} onChange={(e) => updateSla("block_size", Number(e.target.value))}>
              <option value="262144">256 KB</option>
              <option value="1048576">1 MB</option>
              <option value="4194304">4 MB</option>
              <option value="16777216">16 MB</option>
            </select>
          </label>
          <label style={labelStyle}>
            {t("newAsset.subtasks")}
            <input className="glass-input" type="number" min={1} max={16} value={sla.subtask_count} onChange={(e) => updateSla("subtask_count", Number(e.target.value))} />
          </label>
          <label style={labelStyle}>
            {t("newAsset.memoryLimit")}
            <input className="glass-input" type="number" min={128} value={sla.memory_limit_mb} onChange={(e) => updateSla("memory_limit_mb", Number(e.target.value))} />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <label style={labelStyle}>
            {t("newAsset.retention")}
            <select className="glass-input" value={sla.retention_kind} onChange={(e) => updateSla("retention_kind", e.target.value)}>
              <option value="by_count">{t("newAsset.byCount")}</option>
              <option value="by_days">{t("newAsset.byDays")}</option>
            </select>
          </label>
          <label style={labelStyle}>
            {t("newAsset.retentionValue")}
            <input className="glass-input" type="number" min={1} value={sla.retention_value} onChange={(e) => updateSla("retention_value", Number(e.target.value))} />
          </label>
        </div>
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
