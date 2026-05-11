import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { listAssets, startJob, updateAsset, deleteAsset } from "../api/client";
import { useToast } from "../components/Toast";
import { useI18n } from "../i18n";
import { SkeletonCard } from "../components/Skeleton";
import type { AssetResponse } from "../types";

interface Props {
  healthMap?: Map<string, { status: string; message: string | null }>;
}

export default function AssetsPage({ healthMap }: Props) {
  const { t } = useI18n();
  const [assets, setAssets] = useState<AssetResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);
  const navigate = useNavigate();
  const { pushToast } = useToast();

  async function load() {
    try {
      setAssets(await listAssets());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleBackup(assetId: string) {
    try {
      await startJob(assetId, "backup");
      pushToast(t("assetDetail.backupStarted"), "success");
      navigate("/jobs");
    } catch (e) {
      setError(String(e));
      pushToast(t("assetDetail.backupFailed"), "error");
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  async function batchBackup() {
    setBatchLoading(true);
    let ok = 0;
    for (const id of selected) {
      try { await startJob(id, "backup"); ok++; } catch { /* skip */ }
    }
    pushToast(`Started ${ok}/${selected.size} backup jobs`, ok > 0 ? "success" : "error");
    setSelected(new Set());
    setSelectMode(false);
    setBatchLoading(false);
    if (ok > 0) navigate("/jobs");
  }

  async function batchDisable() {
    setBatchLoading(true);
    let ok = 0;
    for (const id of selected) {
      const a = assets.find((x) => x.id === id);
      if (!a) continue;
      try { await updateAsset(id, { name: a.name, config_json: JSON.stringify(a.config), enabled: false }); ok++; } catch { /* skip */ }
    }
    pushToast(`Disabled ${ok}/${selected.size} assets`, "success");
    setSelected(new Set());
    setSelectMode(false);
    setBatchLoading(false);
    load();
  }

  async function batchDelete() {
    if (!confirm(t("assets.confirmBatchDelete", { count: selected.size }))) return;
    setBatchLoading(true);
    let ok = 0;
    for (const id of selected) {
      try { await deleteAsset(id); ok++; } catch { /* skip */ }
    }
    pushToast(`Deleted ${ok}/${selected.size} assets`, "success");
    setSelected(new Set());
    setSelectMode(false);
    setBatchLoading(false);
    load();
  }

  function getHealth(a: AssetResponse): string {
    return healthMap?.get(a.id)?.status || a.health;
  }

  if (loading) {
    return (
      <div>
        <div className="page-header"><h2>{t("assets.title")}</h2></div>
        <div className="card-grid">{Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />)}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>{t("assets.title")}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {selectMode ? (
            <>
              <button className="btn-ghost btn-sm" onClick={() => {
                if (selected.size === assets.length) setSelected(new Set());
                else setSelected(new Set(assets.map((a) => a.id)));
              }}>
                {selected.size === assets.length ? t("common.deselectAll") : t("common.selectAll")}
              </button>
              <button className="btn-ghost btn-sm" onClick={() => { setSelectMode(false); setSelected(new Set()); }}>
                {t("common.cancel")}
              </button>
            </>
          ) : (
            <>
              {assets.length > 0 && (
                <button className="btn-secondary btn-sm" onClick={() => setSelectMode(true)}>{t("assets.select")}</button>
              )}
              <button className="btn-primary" onClick={() => navigate("/assets/new")}>{t("assets.newAsset")}</button>
            </>
          )}
        </div>
      </div>
      {error && <p className="error-msg">{error}</p>}
      {assets.length === 0 ? (
        <div className="empty-state">
          <p>{t("assets.noAssets")}</p>
          <p>{t("assets.createHint")}</p>
        </div>
      ) : (
        <div className="card-grid">
          {assets.map((asset) => {
            const health = getHealth(asset);
            return (
              <div
                key={asset.id}
                className={`glass-card glass-card-lift${selected.has(asset.id) ? " glass-card-selected" : ""}`}
                style={{ padding: 20, cursor: "pointer" }}
                onClick={() => selectMode ? toggleSelect(asset.id) : navigate(`/assets/${asset.id}`)}
              >
                {selectMode && (
                  <div style={{ position: "absolute", top: 12, right: 12 }}>
                    <input type="checkbox" checked={selected.has(asset.id)} readOnly />
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>{asset.name}</span>
                  <span className={`badge badge-${asset.kind === "fileset" ? "info" : asset.kind === "volume" ? "warn" : "ok"}`}>
                    {asset.kind}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
                  <span>{t("assets.health")}: <strong style={{ color: health === "ok" ? "var(--status-ok)" : "var(--status-error)" }}>{health}</strong></span>
                  <span>{t("assets.sla")}: {asset.sla_policy.name}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, borderTop: "1px solid var(--glass-border-subtle)" }}>
                  <button
                    className="btn-primary btn-sm"
                    onClick={(e) => { e.stopPropagation(); handleBackup(asset.id); }}
                  >
                    {t("assets.backupNow")}
                  </button>
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                    {t("assets.last")}: {asset.last_backup ? new Date(asset.last_backup).toLocaleDateString() : t("assets.never")}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectMode && selected.size > 0 && (
        <div className="batch-bar">
          <span className="batch-count">{selected.size} {t("assets.selected")}</span>
          <button className="btn-primary btn-sm" onClick={batchBackup} disabled={batchLoading}>{t("assets.batchBackup")}</button>
          <button className="btn-secondary btn-sm" onClick={batchDisable} disabled={batchLoading}>{t("assets.batchDisable")}</button>
          <button className="btn-danger btn-sm" onClick={batchDelete} disabled={batchLoading}>{t("assets.batchDelete")}</button>
        </div>
      )}
    </div>
  );
}
