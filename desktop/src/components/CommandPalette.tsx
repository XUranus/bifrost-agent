import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { listAssets, listJobs } from "../api/client";
import { useI18n } from "../i18n";
import type { AssetResponse, JobResponse } from "../types";

interface SearchResult {
  id: string;
  label: string;
  sublabel: string;
  category: string;
  action: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [assets, setAssets] = useState<AssetResponse[]>([]);
  const [jobs, setJobs] = useState<JobResponse[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const PAGES: { label: string; path: string }[] = [
    { label: t("nav.dashboard"), path: "/" },
    { label: t("nav.assets"), path: "/assets" },
    { label: t("cmd.newAsset"), path: "/assets/new" },
    { label: t("nav.jobs"), path: "/jobs" },
    { label: t("nav.sla"), path: "/sla-policies" },
    { label: t("nav.settings"), path: "/settings" },
  ];

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIdx(0);
    listAssets().then(setAssets).catch(() => setAssets([]));
    listJobs({ limit: 30 }).then(setJobs).catch(() => setJobs([]));
    setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  const buildResults = useCallback((): SearchResult[] => {
    const q = query.toLowerCase().trim();
    const results: SearchResult[] = [];

    for (const p of PAGES) {
      if (!q || p.label.toLowerCase().includes(q)) {
        results.push({
          id: `page-${p.path}`,
          label: p.label,
          sublabel: p.path,
          category: t("cmd.pages"),
          action: () => { navigate(p.path); onClose(); },
        });
      }
    }

    const matchedAssets = assets.filter((a) =>
      !q || a.name.toLowerCase().includes(q) || a.kind.toLowerCase().includes(q) || a.health.toLowerCase().includes(q)
    ).slice(0, 5);
    for (const a of matchedAssets) {
      results.push({
        id: `asset-${a.id}`,
        label: a.name,
        sublabel: `${a.kind} · ${a.health}`,
        category: t("cmd.assets"),
        action: () => { navigate(`/assets/${a.id}`); onClose(); },
      });
    }

    const matchedJobs = jobs.filter((j) =>
      !q || j.id.toLowerCase().includes(q) || j.operation.toLowerCase().includes(q) || j.status.toLowerCase().includes(q)
    ).slice(0, 5);
    for (const j of matchedJobs) {
      results.push({
        id: `job-${j.id}`,
        label: `${j.operation} #${j.id.slice(0, 8)}`,
        sublabel: j.status,
        category: t("cmd.jobs"),
        action: () => { navigate("/jobs"); onClose(); },
      });
    }

    return results;
  }, [query, assets, jobs, navigate, onClose, t, PAGES]);

  const results = buildResults();

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[selectedIdx]) {
        e.preventDefault();
        results[selectedIdx].action();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, results, selectedIdx, onClose]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.children[selectedIdx] as HTMLElement;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  if (!open) return null;

  const grouped: { category: string; items: SearchResult[] }[] = [];
  let lastCat = "";
  for (const r of results) {
    if (r.category !== lastCat) {
      grouped.push({ category: r.category, items: [] });
      lastCat = r.category;
    }
    grouped[grouped.length - 1].items.push(r);
  }

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd-palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="cmd-input"
          placeholder={t("cmd.placeholder")}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelectedIdx(0); }}
        />
        <div ref={listRef} className="cmd-results">
          {results.length === 0 ? (
            <p className="cmd-empty">{t("cmd.noResults")}</p>
          ) : (
            grouped.map((group) => (
              <div key={group.category}>
                <div className="cmd-group-label">{group.category}</div>
                {group.items.map((item) => {
                  const globalIdx = results.indexOf(item);
                  return (
                    <div
                      key={item.id}
                      className={`cmd-item${globalIdx === selectedIdx ? " cmd-item-selected" : ""}`}
                      onClick={item.action}
                      onMouseEnter={() => setSelectedIdx(globalIdx)}
                    >
                      <span className="cmd-item-label">{item.label}</span>
                      <span className="cmd-item-sub">{item.sublabel}</span>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="cmd-footer">
          <span>↑↓ {t("cmd.navigate")}</span>
          <span>↵ {t("cmd.select")}</span>
          <span>Esc {t("cmd.close")}</span>
        </div>
      </div>
    </div>
  );
}
