import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { listSLAPolicies, createSLAPolicy, updateSLAPolicy, deleteSLAPolicy } from "../api/client";
import { useToast } from "../components/Toast";
import { SkeletonTable } from "../components/Skeleton";
import { useI18n } from "../i18n";
import type { SLAPolicyResponse } from "../types";

function getSchedulePresets(t: (k: string) => string) {
  return [
    { label: t("sla.everyHour"), cron: "0 * * * *" },
    { label: t("sla.daily2am"), cron: "0 2 * * *" },
    { label: t("sla.weeklySunday"), cron: "0 2 * * 0" },
  ];
}

function friendlyCopyMode(mode: string, t: (k: string) => string): string {
  if (mode === "common") return t("sla.standard");
  if (mode === "aggregate") return t("sla.aggregate");
  return mode;
}

function friendlyBackupType(type: string, t: (k: string) => string): string {
  if (type === "full") return t("sla.full");
  if (type === "full_incremental") return t("sla.incremental");
  return type;
}

function friendlySchedule(cron: string, t: (k: string) => string): string {
  const presets: Record<string, string> = {
    "0 * * * *": t("sla.everyHour"),
    "0 2 * * *": t("sla.daily2am"),
    "0 2 * * 0": t("sla.weeklySunday"),
  };
  return presets[cron] || cron;
}

function friendlyRetention(kind: string, value: number, t: (k: string) => string): string {
  if (kind === "by_count") return t("sla.retentionByCount").replace("{n}", String(value));
  if (kind === "by_days") return t("sla.retentionByDays").replace("{n}", String(value));
  return `${kind}=${value}`;
}

export default function SLAPolicies() {
  const { t } = useI18n();
  const [policies, setPolicies] = useState<SLAPolicyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editPolicyId, setEditPolicyId] = useState<string | null>(null);
  const { pushToast } = useToast();

  const load = useCallback(async () => {
    try {
      const data = await listSLAPolicies();
      setPolicies(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to load SLA policies:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string, name: string) {
    if (!confirm(t("sla.confirmDelete", { name }))) return;
    try {
      await deleteSLAPolicy(id);
      pushToast(t("sla.policyDeleted"), "success");
      load();
    } catch (e) {
      pushToast(t("sla.deleteFailed") + `: ${e}`, "error");
    }
  }

  if (loading) {
    return (
      <div>
        <div className="page-header"><h2>{t("sla.title")}</h2></div>
        <SkeletonTable rows={5} cols={7} />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>{t("sla.title")}</h2>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>{t("sla.newPolicy")}</button>
      </div>

      {showCreate && createPortal(
        <div className="log-overlay" onClick={() => setShowCreate(false)}>
          <div className="glass-modal" style={{ width: 560, padding: 28, maxHeight: "85vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <CreatePolicyForm
              onDone={() => { setShowCreate(false); load(); }}
              onCancel={() => setShowCreate(false)}
            />
          </div>
        </div>,
        document.body
      )}

      {editPolicyId && createPortal(
        <div className="log-overlay" onClick={() => setEditPolicyId(null)}>
          <div className="glass-modal" style={{ width: 560, padding: 28, maxHeight: "85vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <EditPolicyForm
              policy={policies.find((p) => p.id === editPolicyId)!}
              onDone={() => { setEditPolicyId(null); load(); }}
              onCancel={() => setEditPolicyId(null)}
            />
          </div>
        </div>,
        document.body
      )}

      {policies.length === 0 && !showCreate ? (
        <div className="empty-state">
          <p>{t("sla.noPolicies")}</p>
          <p>{t("sla.createHint")}</p>
        </div>
      ) : (
        <div className="glass-table-wrap">
          <table className="glass-table">
            <thead>
              <tr>
                <th>{t("sla.tableName")}</th>
                <th>{t("sla.tableCopyMode")}</th>
                <th>{t("sla.tableBackupType")}</th>
                <th>{t("sla.tableSchedule")}</th>
                <th>{t("sla.tableSubtasks")}</th>
                <th>{t("sla.tableRetention")}</th>
                <th>{t("sla.tableActions")}</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>
                    {p.name}
                    {p.is_builtin && (
                      <span style={{ marginLeft: 8, fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 600 }}>
                        {t("sla.builtin")}
                      </span>
                    )}
                  </td>
                  <td>{friendlyCopyMode(p.copy_mode, t)}</td>
                  <td>{friendlyBackupType(p.backup_type, t)}</td>
                  <td>{friendlySchedule(p.schedule_cron, t)}</td>
                  <td>{p.subtask_count}</td>
                  <td>{friendlyRetention(p.retention_kind, p.retention_value, t)}</td>
                  <td style={{ display: "flex", gap: 6 }}>
                    {!p.is_builtin && (
                      <>
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => setEditPolicyId(p.id)}
                        >
                          {t("sla.edit")}
                        </button>
                        <button
                          className="btn-danger btn-sm"
                          onClick={() => handleDelete(p.id, p.name)}
                        >
                          {t("sla.delete")}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* --- Create Policy Form --- */

interface PolicyForm {
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

function CreatePolicyForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const { pushToast } = useToast();
  const SCHEDULE_PRESETS = getSchedulePresets(t);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<PolicyForm>({
    name: "",
    copy_mode: "common",
    backup_type: "full",
    schedule_cron: "0 2 * * *",
    block_size: 1_048_576,
    subtask_count: 4,
    memory_limit_mb: 512,
    retention_kind: "by_count",
    retention_value: 7,
  });
  const [customCron, setCustomCron] = useState(false);

  function update(field: keyof PolicyForm, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await createSLAPolicy(form);
      pushToast(t("sla.policyCreated"), "success");
      onDone();
    } catch (e) {
      pushToast(t("sla.createFailed") + `: ${e}`, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>{t("sla.createNew")}</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={labelStyle}>
          {t("sla.policyName")}
          <input className="glass-input" value={form.name} onChange={(e) => update("name", e.target.value)} placeholder={t("sla.nameOptional")} />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <span style={labelStyle}>{t("sla.copyMode")}</span>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              {[{ v: "common", l: t("sla.standard") }, { v: "aggregate", l: t("sla.aggregate") }].map((o) => (
                <button key={o.v} className={`btn-pill${form.copy_mode === o.v ? " btn-pill-active" : ""}`} onClick={() => update("copy_mode", o.v)}>{o.l}</button>
              ))}
            </div>
          </div>
          <div>
            <span style={labelStyle}>{t("sla.backupType")}</span>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              {[{ v: "full", l: t("sla.full") }, { v: "full_incremental", l: t("sla.incremental") }].map((o) => (
                <button key={o.v} className={`btn-pill${form.backup_type === o.v ? " btn-pill-active" : ""}`} onClick={() => update("backup_type", o.v)}>{o.l}</button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <span style={labelStyle}>{t("sla.schedule")}</span>
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            {SCHEDULE_PRESETS.map((p) => (
              <button
                key={p.label}
                className={`btn-pill${!customCron && form.schedule_cron === p.cron ? " btn-pill-active" : ""}`}
                onClick={() => { setCustomCron(false); update("schedule_cron", p.cron); }}
              >
                {p.label}
              </button>
            ))}
            <button
              className={`btn-pill${customCron ? " btn-pill-active" : ""}`}
              onClick={() => setCustomCron(true)}
            >
              {t("sla.custom")}
            </button>
          </div>
          {customCron && (
            <input className="glass-input" style={{ marginTop: 8 }} value={form.schedule_cron} onChange={(e) => update("schedule_cron", e.target.value)} placeholder="0 2 * * *" />
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <label style={labelStyle}>
            {t("sla.blockSize")}
            <select className="glass-input" value={String(form.block_size)} onChange={(e) => update("block_size", Number(e.target.value))}>
              <option value="262144">256 KB</option>
              <option value="1048576">1 MB</option>
              <option value="4194304">4 MB</option>
              <option value="16777216">16 MB</option>
            </select>
          </label>
          <label style={labelStyle}>
            {t("sla.subtasks")}
            <input className="glass-input" type="number" min={1} max={32} value={form.subtask_count} onChange={(e) => update("subtask_count", Number(e.target.value))} />
          </label>
          <label style={labelStyle}>
            {t("sla.memoryMb")}
            <input className="glass-input" type="number" min={128} max={8192} value={form.memory_limit_mb} onChange={(e) => update("memory_limit_mb", Number(e.target.value))} />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <span style={labelStyle}>{t("sla.retention")}</span>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              {[{ v: "by_count", l: t("sla.byCount") }, { v: "by_days", l: t("sla.byDays") }].map((o) => (
                <button key={o.v} className={`btn-pill${form.retention_kind === o.v ? " btn-pill-active" : ""}`} onClick={() => update("retention_kind", o.v)}>{o.l}</button>
              ))}
            </div>
          </div>
          <label style={labelStyle}>
            {t("sla.retentionValue")}
            <input className="glass-input" type="number" min={1} value={form.retention_value} onChange={(e) => update("retention_value", Number(e.target.value))} />
          </label>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8, paddingTop: 16, borderTop: "1px solid var(--glass-border-subtle)" }}>
          <button className="btn-secondary" onClick={onCancel}>{t("common.cancel")}</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? t("sla.creating") : t("sla.createPolicy")}
          </button>
        </div>
      </div>
    </>
  );
}

/* --- Edit Policy Form --- */

function EditPolicyForm({ policy, onDone, onCancel }: { policy: SLAPolicyResponse; onDone: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const { pushToast } = useToast();
  const SCHEDULE_PRESETS = getSchedulePresets(t);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<PolicyForm>({
    name: policy.name,
    copy_mode: policy.copy_mode,
    backup_type: policy.backup_type,
    schedule_cron: policy.schedule_cron,
    block_size: policy.block_size,
    subtask_count: policy.subtask_count,
    memory_limit_mb: policy.memory_limit_mb,
    retention_kind: policy.retention_kind,
    retention_value: policy.retention_value,
  });
  const presetCrons = SCHEDULE_PRESETS.map((p) => p.cron);
  const [customCron, setCustomCron] = useState(!presetCrons.includes(form.schedule_cron));

  function update(field: keyof PolicyForm, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      pushToast(t("sla.nameRequired"), "error");
      return;
    }
    setSubmitting(true);
    try {
      await updateSLAPolicy(policy.id, form);
      pushToast(t("sla.policyUpdated"), "success");
      onDone();
    } catch (e) {
      pushToast(t("sla.updateFailed") + `: ${e}`, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>{t("sla.editPolicy")}</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={labelStyle}>
          {t("sla.policyName")}
          <input className="glass-input" value={form.name} onChange={(e) => update("name", e.target.value)} />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <span style={labelStyle}>{t("sla.copyMode")}</span>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              {[{ v: "common", l: t("sla.standard") }, { v: "aggregate", l: t("sla.aggregate") }].map((o) => (
                <button key={o.v} className={`btn-pill${form.copy_mode === o.v ? " btn-pill-active" : ""}`} onClick={() => update("copy_mode", o.v)}>{o.l}</button>
              ))}
            </div>
          </div>
          <div>
            <span style={labelStyle}>{t("sla.backupType")}</span>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              {[{ v: "full", l: t("sla.full") }, { v: "full_incremental", l: t("sla.incremental") }].map((o) => (
                <button key={o.v} className={`btn-pill${form.backup_type === o.v ? " btn-pill-active" : ""}`} onClick={() => update("backup_type", o.v)}>{o.l}</button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <span style={labelStyle}>{t("sla.schedule")}</span>
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            {SCHEDULE_PRESETS.map((p) => (
              <button
                key={p.label}
                className={`btn-pill${!customCron && form.schedule_cron === p.cron ? " btn-pill-active" : ""}`}
                onClick={() => { setCustomCron(false); update("schedule_cron", p.cron); }}
              >
                {p.label}
              </button>
            ))}
            <button
              className={`btn-pill${customCron ? " btn-pill-active" : ""}`}
              onClick={() => setCustomCron(true)}
            >
              {t("sla.custom")}
            </button>
          </div>
          {customCron && (
            <input className="glass-input" style={{ marginTop: 8 }} value={form.schedule_cron} onChange={(e) => update("schedule_cron", e.target.value)} />
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <label style={labelStyle}>
            {t("sla.blockSize")}
            <select className="glass-input" value={String(form.block_size)} onChange={(e) => update("block_size", Number(e.target.value))}>
              <option value="262144">256 KB</option>
              <option value="1048576">1 MB</option>
              <option value="4194304">4 MB</option>
              <option value="16777216">16 MB</option>
            </select>
          </label>
          <label style={labelStyle}>
            {t("sla.subtasks")}
            <input className="glass-input" type="number" min={1} max={32} value={form.subtask_count} onChange={(e) => update("subtask_count", Number(e.target.value))} />
          </label>
          <label style={labelStyle}>
            {t("sla.memoryMb")}
            <input className="glass-input" type="number" min={128} max={8192} value={form.memory_limit_mb} onChange={(e) => update("memory_limit_mb", Number(e.target.value))} />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <span style={labelStyle}>{t("sla.retention")}</span>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              {[{ v: "by_count", l: t("sla.byCount") }, { v: "by_days", l: t("sla.byDays") }].map((o) => (
                <button key={o.v} className={`btn-pill${form.retention_kind === o.v ? " btn-pill-active" : ""}`} onClick={() => update("retention_kind", o.v)}>{o.l}</button>
              ))}
            </div>
          </div>
          <label style={labelStyle}>
            {t("sla.retentionValue")}
            <input className="glass-input" type="number" min={1} value={form.retention_value} onChange={(e) => update("retention_value", Number(e.target.value))} />
          </label>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8, paddingTop: 16, borderTop: "1px solid var(--glass-border-subtle)" }}>
          <button className="btn-secondary" onClick={onCancel}>{t("common.cancel")}</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? t("sla.saving") : t("sla.saveChanges")}
          </button>
        </div>
      </div>
    </>
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
