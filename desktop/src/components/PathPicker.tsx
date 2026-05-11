import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { browseLocal } from "../api/client";
import { useI18n } from "../i18n";
import type { DirEntry } from "../types";

interface Props {
  onSelect: (path: string) => void;
  onClose: () => void;
  initialPath?: string;
}

function getFileIcon(name: string, kind: string): string {
  if (kind === "dir") return "📁";
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const iconMap: Record<string, string> = {
    pdf: "📄",
    doc: "📄", docx: "📄",
    xls: "📄", xlsx: "📄",
    ppt: "📄", pptx: "📄",
    txt: "📄", md: "📄", csv: "📄",
    log: "📄",
    jpg: "🖼️", jpeg: "🖼️", png: "🖼️",
    gif: "🖼️", svg: "🖼️", bmp: "🖼️", webp: "🖼️",
    mp4: "🎥", avi: "🎥", mkv: "🎥", mov: "🎥",
    mp3: "🎵", wav: "🎵", flac: "🎵", ogg: "🎵",
    zip: "🗄️", rar: "🗄️", "7z": "🗄️",
    tar: "🗄️", gz: "🗄️", bz2: "🗄️", xz: "🗄️",
    json: "💾", xml: "💾", yaml: "💾", yml: "💾",
    html: "💾", css: "💾", js: "💾", ts: "💾",
    py: "⚙️", rs: "⚙️", go: "⚙️", c: "⚙️",
    cpp: "⚙️", h: "⚙️", java: "⚙️", rb: "⚙️",
    sh: "⚙️", bash: "⚙️", zsh: "⚙️",
    iso: "💿", img: "💿", dmg: "💿",
    exe: "⚙️", bin: "⚙️", so: "⚙️", dll: "⚙️",
  };
  return iconMap[ext] || "📄";
}

export default function PathPicker({ onSelect, onClose, initialPath }: Props) {
  const { t } = useI18n();
  const [currentPath, setCurrentPath] = useState(initialPath || "/");
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null);

  useEffect(() => {
    loadDir(currentPath);
  }, []);

  async function loadDir(path: string) {
    setLoading(true);
    setError(null);
    setSelectedEntry(null);
    try {
      const result = await browseLocal(path);
      const dirs = result.filter((e) => e.kind === "dir");
      const files = result.filter((e) => e.kind !== "dir");
      dirs.sort((a, b) => a.name.localeCompare(b.name));
      files.sort((a, b) => a.name.localeCompare(b.name));
      setEntries([...dirs, ...files]);
      setCurrentPath(path);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function navigateUp() {
    const parent = currentPath.replace(/\/+$/, "").split("/").slice(0, -1).join("/") || "/";
    loadDir(parent);
  }

  function handleItemClick(entry: DirEntry) {
    if (entry.kind === "dir") {
      loadDir(entry.path);
    } else {
      setSelectedEntry(entry.path);
    }
  }

  function handleSelect() {
    if (selectedEntry) {
      // Select the parent directory of the selected file
      const dir = selectedEntry.replace(/\/+$/, "").split("/").slice(0, -1).join("/") || "/";
      onSelect(dir);
    } else {
      onSelect(currentPath);
    }
  }

  const pathParts = currentPath.split("/").filter(Boolean);

  return createPortal(
    <div className="path-picker-overlay" onClick={onClose}>
      <div className="path-picker-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="path-picker-header">
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{t("pathPicker.title")}</h3>
          <button className="btn-ghost btn-sm" onClick={onClose}>{t("common.cancel")}</button>
        </div>

        {/* Actions at top */}
        <div className="path-picker-footer">
          <span className="path-picker-current" title={selectedEntry || currentPath}>
            {selectedEntry || currentPath}
          </span>
          <button className="btn-primary btn-sm" onClick={handleSelect}>
            {t("pathPicker.select")}
          </button>
        </div>

        {/* Breadcrumb */}
        <div className="path-picker-breadcrumb">
          <button className="btn-ghost btn-sm" onClick={() => loadDir("/")}>/</button>
          {pathParts.map((part, i) => (
            <span key={i}>
              <span style={{ color: "var(--text-tertiary)", margin: "0 2px" }}>/</span>
              <button
                className="btn-ghost btn-sm"
                onClick={() => loadDir("/" + pathParts.slice(0, i + 1).join("/"))}
              >
                {part}
              </button>
            </span>
          ))}
        </div>

        {/* Directory listing */}
        <div className="path-picker-list">
          {loading ? (
            <p style={{ padding: 20, textAlign: "center", color: "var(--text-tertiary)" }}>{t("pathPicker.loading")}</p>
          ) : error ? (
            <p style={{ padding: 20, color: "var(--status-error)" }}>{error}</p>
          ) : (
            <>
              {currentPath !== "/" && (
                <div className="path-picker-item" onClick={navigateUp}>
                  <span className="path-picker-item-icon">📁</span>
                  <span style={{ color: "var(--text-tertiary)" }}>..</span>
                  <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>{t("pathPicker.parentDir")}</span>
                </div>
              )}
              {entries.length === 0 ? (
                <p style={{ padding: 20, textAlign: "center", color: "var(--text-tertiary)" }}>{t("pathPicker.empty")}</p>
              ) : (
                entries.map((entry) => (
                  <div
                    key={entry.path}
                    className={`path-picker-item${selectedEntry === entry.path ? " path-picker-item-selected" : ""}`}
                    onClick={() => handleItemClick(entry)}
                    onDoubleClick={() => {
                      if (entry.kind === "dir") loadDir(entry.path);
                    }}
                  >
                    <span className="path-picker-item-icon">{getFileIcon(entry.name, entry.kind)}</span>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.name}</span>
                    {entry.kind !== "dir" && (
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)", flexShrink: 0 }}>
                        {formatBytes(entry.size)}
                      </span>
                    )}
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) {
    const val = bytes / 1_073_741_824;
    return Number.isInteger(val) ? `${val} GiB` : `${val.toFixed(1)} GiB`;
  }
  if (bytes >= 1_048_576) {
    const val = bytes / 1_048_576;
    return Number.isInteger(val) ? `${val} MiB` : `${val.toFixed(1)} MiB`;
  }
  if (bytes >= 1_024) {
    const val = bytes / 1_024;
    return Number.isInteger(val) ? `${val} KiB` : `${val.toFixed(1)} KiB`;
  }
  return `${bytes} B`;
}
