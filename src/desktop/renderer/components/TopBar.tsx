import { CapabilityPanel } from "./CapabilityPanel";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { BACKENDS, effectiveBackends } from "../lib/backends";
import type { AdminConfig, Project } from "../types";

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
  const [capabilitiesOpen,setCapabilitiesOpen]=useState(false);
  const [dashboard,setDashboard]=useState<{label:string;url:string}|null>(null);
  useEffect(()=>{let active=true;setDashboard(null);if(selectedProjectId)void api.getProjectDashboard(selectedProjectId).then(value=>{if(active)setDashboard(value);}).catch(()=>{});return ()=>{active=false;};},[selectedProjectId]);
  const [adminConfig, setAdminConfig] = useState<AdminConfig | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { void api.getAdminConfig().then(setAdminConfig); }, []);

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
      {capabilitiesOpen&&selected&&<CapabilityPanel key={selected.id} project={selected} onClose={()=>setCapabilitiesOpen(false)}/>}
      <div className="statusDot" />
      <span className="wordmark">Agentic Control Room</span>
      <div className="vDivider" />
      <button ref={btnRef} className="pillBtn switcher" onClick={() => setOpen((v) => !v)}>
        {selected ? selected.name : "No project"} <span className="chev">▾</span>
      </button>
      {branch && <span className="mono dim branch">{branch}</span>}
      <div className="spacer" />
      {selectedProjectId&&dashboard&&<button className="pillBtn ghostBtn mono" onClick={()=>void api.openProjectDashboard(selectedProjectId).catch(error=>useStore.getState().showToast(String(error)))}>{dashboard.label}</button>}
      {toast && <span className="mono dim toast">{toast}</span>}
      <div className="blockedWrap">
        <span className="mono dim">Blocked</span>
        <span className={`pill${blocked > 0 ? " on" : ""}`}>{blocked}</span>
      </div>
      {selected && (
        <button className="pillBtn ghostBtn mono" onClick={() => showView("floor")}>floor</button>
      )}
      {selected && (
        <button className="pillBtn ghostBtn mono" onClick={() => showView("meeting")}>meeting</button>
      )}
      {selected && (
        <button className="pillBtn ghostBtn mono" onClick={() => showView("debate")}>debate</button>
      )}
      {selected && (
        <button className="pillBtn ghostBtn mono" onClick={() => showView("chat")}>chat</button>
      )}
      {selected && (
        <button className="pillBtn ghostBtn mono" onClick={() => showView("planning")}>planning</button>
      )}
      {selected && (
        <button className="pillBtn ghostBtn mono" onClick={() => showView("board")}>board</button>
      )}
      {selected && (
        <button className="pillBtn ghostBtn mono" onClick={() => showView("workflows")}>workflows & artifacts</button>
      )}
      {selected && (
        <button className="pillBtn ghostBtn mono" onClick={() => showView("ide")}>files</button>
      )}
      {selected && (
        <button className="pillBtn ghostBtn mono" onClick={() => showView("env")}>env</button>
      )}
      {selected&&<button className="pillBtn ghostBtn mono" onClick={()=>setCapabilitiesOpen(true)}>capabilities</button>}
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
                if (confirm(`Remove project "${p.name}" from Agentic Control Room? (files untouched)`)) {
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
                {(adminConfig ? effectiveBackends(adminConfig, p) : BACKENDS.map((b) => b.id)).map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
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
