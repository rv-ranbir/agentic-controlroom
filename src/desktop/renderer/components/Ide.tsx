import { EmptyState } from "./EmptyState";
import { TopBar } from "./TopBar";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../store";

const editorDrafts = new Map<string, { filePath: string | null; content: string; original: string }>();

interface Entry { name: string; path: string; isDir: boolean }

export function Ide() {
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const project = useStore((s) => s.projects.find((p) => p.id === selectedProjectId));
  const { showView, showToast } = useStore.getState();

  const draft = editorDrafts.get(selectedProjectId ?? "");
  const readRequest = useRef(0);
  const [loading, setLoading] = useState(false);
  const [children, setChildren] = useState<Record<string, Entry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filePath, setFilePath] = useState<string | null>(draft?.filePath ?? null);
  const [content, setContent] = useState(draft?.content ?? "");
  const [original, setOriginal] = useState(draft?.original ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [treeError, setTreeError] = useState("");

  useEffect(() => {
    if (selectedProjectId) editorDrafts.set(selectedProjectId, {filePath, content, original});
  }, [selectedProjectId, filePath, content, original]);

  const loadDir = useCallback((path: string) => {
    if (!project) return;
    void api.listDir(project.path, path).then((entries) => {
      setChildren((c) => ({ ...c, [path]: entries }));
      setTreeError("");
    }).catch(err=>setTreeError(err instanceof Error?err.message:"Could not load project files"));
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
    if (!project || saving) return;
    if (content !== original && !confirm("Discard unsaved changes before opening another file?")) return;
    const request = ++readRequest.current;
    setLoading(true);
    setFilePath(path);
    setContent("");
    setOriginal("");
    setError("");
    void api.readFile(project.path, path).then((res) => {
      if (request !== readRequest.current) return;
      if ("error" in res) { setError(res.error); setContent(""); setOriginal(""); return; }
      setContent(res.content);
      setOriginal(res.content);
    }).catch(err => { if (request === readRequest.current) setError(String(err)); })
      .finally(() => { if (request === readRequest.current) setLoading(false); });
  };

  const dirty = content !== original;

  const save = useCallback(() => {
    if (!project || !filePath || !dirty || saving || loading) return;
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
      <div className="viewRoot workspaceView viewIde">
      <TopBar />
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
        <button type="button"
          className={`ideRow${filePath === e.path ? " sel" : ""}`}
          style={{ paddingLeft: 10 + depth * 14 }}
          onClick={() => (e.isDir ? toggleDir(e.path) : openFile(e.path))}
        >
          <span className="ideIcon mono">{e.isDir ? (expanded.has(e.path) ? "▾" : "▸") : ""}</span>
          <span className="mono" style={{ fontSize: 12.5 }}>{e.name}</span>
        </button>
        {e.isDir && expanded.has(e.path) && renderEntries(e.path, depth + 1)}
      </div>
    ));
  };

  return (
    <div className="viewRoot workspaceView viewIde">
      <TopBar />
      <header className="rvHeader">
        <button className="pillBtn ghostBtn mono" onClick={() => showView("room")}>&larr; back</button>
        <span className="rvName">{project.name}</span>
        <span className="dim mono" style={{ fontSize: 10.5 }}>Files</span>
        <div className="spacer" />
        {filePath && (
          <>
            <span className="dim mono" style={{ fontSize: 10.5 }}>{filePath}{dirty ? " · edited" : ""}</span>
            <button className="pillBtn fillBtn mono" disabled={!dirty || saving || loading} onClick={save}>
              {saving ? "saving…" : "save"}
            </button>
          </>
        )}
      </header>
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <div style={{ width: 260, flexShrink: 0, borderRight: "1px solid var(--rule)", overflowY: "auto", padding: "8px 0" }}>
          <div className="filesTreePath">{project.path}</div>
          {treeError ? <div role="alert" className="filesTreeNotice">{treeError}<button className="pillBtn" onClick={()=>loadDir("")}>Retry</button></div> : !children[""] ? <div className="filesTreeNotice">Loading project files…</div> : children[""].length === 0 ? <div className="filesTreeNotice">This project folder is empty.</div> : renderEntries("", 0)}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {!filePath && <EmptyState title="Explore your project files" description="Choose a file from the project tree to read or edit it. Your project folder is shown on the left." />}
          {filePath && error && <div className="rvEmpty">{error}</div>}
          {loading && <div role="status">Loading file…</div>}
          {filePath && !error && !loading && (
            <textarea
              className="mono"
              aria-label="File contents"
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
