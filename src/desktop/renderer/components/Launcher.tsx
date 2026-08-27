import { useState } from "react";
import { useStore } from "../store";
import type { Project } from "../types";

function isRunning(runningKeys: Record<string, true>, p: Project): boolean {
  return Object.keys(runningKeys).some((k) => k === p.id || k.startsWith(p.id + ":"));
}

function LnItem({ p, withBadge }: { p: Project; withBadge?: boolean }) {
  const runningKeys = useStore((s) => s.runningKeys);
  const { selectProject, showView } = useStore.getState();
  return (
    <div className="lnItem" onClick={async () => { await selectProject(p); showView("room"); }}>
      <span className="statusDot" style={{ background: isRunning(runningKeys, p) ? "var(--live)" : "var(--rule)" }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="liName">{p.name}</div>
        <div className="liPath">{p.path}</div>
      </div>
      {withBadge && <span className="liMeta">{p.agents.length} agent{p.agents.length === 1 ? "" : "s"} · {p.backend}</span>}
    </div>
  );
}

export function Launcher({ onNewAgent }: { onNewAgent: () => void }) {
  const projects = useStore((s) => s.projects);
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const toast = useStore((s) => s.toast);
  const theme = useStore((s) => s.theme);
  const repoCloning = useStore((s) => s.repoCloning);
  const { toggleTheme, createProject, createRepoProject, showToast, selectProject } = useStore.getState();
  const [tab, setTab] = useState<"local" | "repo">("local");
  const [drag, setDrag] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");

  async function handleNewAgent() {
    if (selectedProjectId) { onNewAgent(); return; }
    if (projects.length > 0) {
      await selectProject(projects[projects.length - 1]);
      onNewAgent();
      return;
    }
    showToast("Open a project first — no rooms yet");
  }

  return (
    <div className="viewRoot">
      <header className="lnHeader">
        <span className="wordmark">AgentRoom</span>
        <div className="spacer" />
        {toast && <span className="mono dim toast">{toast}</span>}
        <button className="pillBtn iconBtn" title="Toggle theme" onClick={toggleTheme}>{theme === "light" ? "☀" : "☽"}</button>
      </header>
      <div className="lnScroll">
        <div className="lnCol">
          <div className="lnGreetRow">
            <h1>Open project</h1>
            <button className="pillBtn fillBtn" onClick={() => void handleNewAgent()}>
              + new agent
            </button>
          </div>
          <p className="lnSub dim">Open a local folder or connect a repository, then bring in the agents who'll work it.</p>

          <div className="segGroup">
            <div className={`segOpt${tab === "local" ? " on" : ""}`} onClick={() => setTab("local")}>Local folder</div>
            <div className={`segOpt${tab === "repo" ? " on" : ""}`} onClick={() => setTab("repo")}>Repository</div>
          </div>

          {tab === "local" && (
            <div className="lnPanel">
              <div
                className={`dropZone${drag ? " drag" : ""}`}
                onClick={() => void createProject()}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); void createProject(); }}
              >
                Drop a folder, or <button className="pillBtn ghostBtn" onClick={(e) => { e.stopPropagation(); void createProject(); }}>browse&hellip;</button>
              </div>
              <div className="lnList">
                {projects.length === 0
                  ? <div className="lnEmpty">No local folders opened yet.</div>
                  : projects.map((p) => <LnItem key={p.id} p={p} />)}
              </div>
            </div>
          )}

          {tab === "repo" && (
            <div className="lnPanel">
              <div className="repoRow">
                <input
                  className="fInput mono"
                  placeholder="https://github.com/org/repo"
                  value={repoUrl}
                  disabled={repoCloning}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && repoUrl.trim() && !repoCloning) void createRepoProject(repoUrl.trim()); }}
                />
                <button
                  className="pillBtn fillBtn"
                  disabled={repoCloning || !repoUrl.trim()}
                  onClick={() => void createRepoProject(repoUrl.trim())}
                >
                  {repoCloning ? "cloning…" : "connect"}
                </button>
              </div>
              <p className="dim" style={{ fontSize: 11.5, marginTop: 8 }}>
                Clones into ~/Documents/AgentRoom/&lt;repo&gt; and opens a room on it. Requires <code className="mono">git</code> on PATH;
                per-branch worktrees and PR flow come with full multi-project support.
              </p>
            </div>
          )}

          <h6 className="lnRoomsHead dim">Open rooms</h6>
          <div className="lnList">
            {projects.length === 0
              ? <div className="lnEmpty">No rooms yet — open a folder above.</div>
              : projects.map((p) => <LnItem key={p.id} p={p} withBadge />)}
          </div>
        </div>
      </div>
    </div>
  );
}
