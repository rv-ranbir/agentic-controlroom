import { useCallback, useEffect, useState } from "react";
import { useStore } from "../store";

interface Entry { name: string; path: string; isDir: boolean }

export function Ide() {
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const project = useStore((s) => s.projects.find((p) => p.id === selectedProjectId));
  const { showView, showToast } = useStore.getState();

  const [children, setChildren] = useState<Record<string, Entry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filePath, setFilePath] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadDir = useCallback((path: string) => {
    if (!project) return;
    void api.listDir(project.path, path).then((entries) => {
      setChildren((c) => ({ ...c, [path]: entries }));
    });
  }, [project]);

  useEffect(() => { if (project) loadDir(""); }, [project, loadDir]);

  const toggleDir = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else { next.add(path); if (!children[path]) loadDir(path); }
      return next;
    });
  };

  const openFile = (path: string) => {
    if (!project) return;
    setFilePath(path);
    setError("");
    void api.readFile(project.path, path).then((res) => {
      if ("error" in res) { setError(res.error); setContent(""); setOriginal(""); return; }
      setContent(res.content);
      setOriginal(res.content);
    });
  };

  const dirty = content !== original;

  const save = useCallback(() => {
    if (!project || !filePath || !dirty || saving) return;
    setSaving(true);
    void api.writeFile(project.path, filePath, content)
      .then(() => { setOriginal(content); showToast(`Saved ${filePath}`); })
      .catch((err) => showToast(err instanceof Error ? err.message : String(err)))
      .finally(() => setSaving(false));
  }, [project, filePath, content, dirty, saving, showToast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); save(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  if (!project) {
    return (
      <div className="viewRoot">
        <header className="rvHeader">
          <button className="pillBtn ghostBtn mono" onClick={() => showView("room")}>&larr; back</button>
        </header>
        <div className="rvEmpty">No project selected.</div>
      </div>
    );
  }

  const renderEntries = (path: string, depth: number) => {
    const entries = children[path];
    if (!entries) return null;
    return entries.map((e) => (
      <div key={e.path}>
        <div
          className={`ideRow${filePath === e.path ? " sel" : ""}`}
          style={{ paddingLeft: 10 + depth * 14 }}
          onClick={() => (e.isDir ? toggleDir(e.path) : openFile(e.path))}
        >
          <span className="ideIcon mono">{e.isDir ? (expanded.has(e.path) ? "▾" : "▸") : ""}</span>
          <span className="mono" style={{ fontSize: 12.5 }}>{e.name}</span>
        </div>
        {e.isDir && expanded.has(e.path) && renderEntries(e.path, depth + 1)}
      </div>
    ));
  };

  return (
    <div className="viewRoot">
      <header className="rvHeader">
        <button className="pillBtn ghostBtn mono" onClick={() => showView("room")}>&larr; back</button>
        <span className="rvName">{project.name}</span>
        <span className="dim mono" style={{ fontSize: 10.5 }}>Files</span>
        <div className="spacer" />
        {filePath && (
          <>
            <span className="dim mono" style={{ fontSize: 10.5 }}>{filePath}{dirty ? " · edited" : ""}</span>
            <button className="pillBtn fillBtn mono" disabled={!dirty || saving} onClick={save}>
              {saving ? "saving…" : "save"}
            </button>
          </>
        )}
      </header>
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <div style={{ width: 260, flexShrink: 0, borderRight: "1px solid var(--rule)", overflowY: "auto", padding: "8px 0" }}>
          {renderEntries("", 0)}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {!filePath && <div className="rvEmpty">Select a file to edit.</div>}
          {filePath && error && <div className="rvEmpty">{error}</div>}
          {filePath && !error && (
            <textarea
              className="mono"
              spellCheck={false}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              style={{
                flex: 1, minHeight: 0, resize: "none", border: "none", outline: "none",
                background: "var(--sink)", color: "var(--ink)", fontSize: 12.5, lineHeight: 1.6,
                padding: "14px 16px", tabSize: 2,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
