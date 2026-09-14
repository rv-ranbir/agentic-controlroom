import "./Navigation.css";
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
  const view = useStore(s => s.view);
  const moreRef = useRef<HTMLDetailsElement>(null);
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

  useEffect(() => {
    const close = (event: MouseEvent) => { if (moreRef.current && !moreRef.current.contains(event.target as Node)) moreRef.current.open = false; };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && moreRef.current?.open) { moreRef.current.open = false; moreRef.current.querySelector('summary')?.focus(); } };
    document.addEventListener('click', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', escape); };
  }, []);

  return (
    <header id="topbar" className="projectTopbar">
      {capabilitiesOpen&&selected&&<CapabilityPanel key={selected.id} project={selected} onClose={()=>setCapabilitiesOpen(false)}/>}
      <div className="projectIdentityRow">
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
      <button className="pillBtn ghostBtn mono" onClick={() => showView("admin")}>settings</button>
      <button className="pillBtn iconBtn" title="Toggle theme" onClick={toggleTheme}>
        {theme === "light" ? "☀" : "☽"}
      </button>

      </div>
      {selected && <nav className="projectNavigation" aria-label="Project navigation">
        {([{id:'room',label:'room'},{id:'floor',label:'floor'},{id:'planning',label:'planning'},{id:'board',label:'board'},{id:'workflows',label:'workflows & artifacts'}] as const).map(item => <button key={item.id} type="button" aria-current={view === item.id ? 'page' : undefined} onClick={() => showView(item.id)}>{item.label}</button>)}
        <details ref={moreRef} className="projectMore"><summary>More <span aria-hidden="true">▾</span></summary><div className="projectMorePanel">
          {([{id:'meeting',label:'meeting'},{id:'debate',label:'debate'},{id:'chat',label:'chat'},{id:'ide',label:'files'},{id:'env',label:'env'}] as const).map(item => <button key={item.id} type="button" onClick={() => { if(moreRef.current) moreRef.current.open=false; showView(item.id); }}>{item.label}</button>)}
          <button type="button" onClick={() => {if(moreRef.current)moreRef.current.open=false;setCapabilitiesOpen(true);}}>capabilities</button>
        </div></details>
      </nav>}
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
