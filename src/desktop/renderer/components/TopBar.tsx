import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import type { Project } from "../types";

function isRunning(runningKeys: Record<string, true>, p: Project): boolean {
  return Object.keys(runningKeys).some((k) => k === p.id || k.startsWith(p.id + ":"));
}

export function TopBar() {
  const projects = useStore((s) => s.projects);
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const branch = useStore((s) => s.branch);
  const toast = useStore((s) => s.toast);
  const runningKeys = useStore((s) => s.runningKeys);
  const theme = useStore((s) => s.theme);
  // "needs input" has no real trigger yet (state inference is SPEC's M2) — always 0.
  const blocked = 0;
  const { selectProject, createProject, removeProject, updateProjectBackend, toggleTheme, showView } = useStore.getState();
  const selected = projects.find((p) => p.id === selectedProjectId);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);

  return (
    <header id="topbar">
      <div className="statusDot" />
      <span className="wordmark">AgentRoom</span>
      <div className="vDivider" />
      <button ref={btnRef} className="pillBtn switcher" onClick={() => setOpen((v) => !v)}>
        {selected ? selected.name : "No project"} <span className="chev">▾</span>
      </button>
      {branch && <span className="mono dim branch">{branch}</span>}
      <div className="spacer" />
      {toast && <span className="mono dim toast">{toast}</span>}
      <div className="blockedWrap">
        <span className="mono dim">Blocked</span>
        <span className={`pill${blocked > 0 ? " on" : ""}`}>{blocked}</span>
      </div>
      <button className="pillBtn iconBtn" title="Toggle theme" onClick={toggleTheme}>
        {theme === "light" ? "☀" : "☽"}
      </button>

      {open && (
        <div id="projectMenu" ref={menuRef}>
          {projects.length === 0 && <div className="menuEmpty">No projects yet.</div>}
          {projects.map((p) => (
            <div
              key={p.id}
              className="menuItem"
              onClick={() => { void selectProject(p); setOpen(false); }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (confirm(`Remove project "${p.name}" from AgentRoom? (files untouched)`)) {
                  void removeProject(p.id);
                  setOpen(false);
                }
              }}
            >
              <span className="statusDot" style={{ background: isRunning(runningKeys, p) ? "var(--live)" : "var(--rule)" }} />
              <span className="mName" title={p.path}>{p.name}</span>
              <select
                className="mono"
                value={p.backend}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => updateProjectBackend(p.id, e.target.value as Project["backend"])}
              >
                <option value="cursor">cursor</option>
                <option value="claude">claude</option>
              </select>
            </div>
          ))}
          <div className="menuDivider" />
          <div className="menuItem" onClick={() => { setOpen(false); void createProject(); }}>
            <span className="mName">+ New project&hellip;</span>
          </div>
          <div className="menuItem" onClick={() => { setOpen(false); showView("launcher"); }}>
            <span className="mName">Back to launcher</span>
          </div>
        </div>
      )}
    </header>
  );
}
