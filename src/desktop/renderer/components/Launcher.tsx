import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { fuzzyMatch } from "../lib/fuzzy";
import { elapsedLabel } from "../lib/agents";
import { GithubPanel } from "./GithubPanel";
import type { Project } from "../types";

const ZONES: NonNullable<Project["zone"]>[] = ["Work", "Personal", "Side"];

function isRunning(runningKeys: Record<string, true>, p: Project): boolean {
  return Object.keys(runningKeys).some((k) => k === p.id || k.startsWith(p.id + ":"));
}

function LnItem({ p, withBadge, withZone }: { p: Project; withBadge?: boolean; withZone?: boolean }) {
  const runningKeys = useStore((s) => s.runningKeys);
  const stats = useStore((s) => s.projectStats[p.id]);
  const { selectProject, showView } = useStore.getState();
  return (
    <div className="lnItem" role="group" onClick={async () => { await selectProject(p); showView("room"); }}>
      <span className="statusDot" style={{ background: isRunning(runningKeys, p) ? "var(--live)" : "var(--rule)" }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <button className="projectOpenButton" onClick={async e=>{e.stopPropagation();await selectProject(p);showView("room");}}>{p.name}</button>
        <div className="liPath">{p.path}</div>
      </div>
      {withZone && (
        <select
          aria-label={`Zone for ${p.name}`} className="mono"
          style={{ background: "var(--sink)", color: "var(--ink)", border: "1px solid var(--rule)", borderRadius: 5, fontSize: 10 }}
          value={p.zone ?? ""}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const zone = (e.target.value || undefined) as Project["zone"];
            void useStore.getState().setZone(p.id, zone);
          }}
        >
          <option value="">No zone</option>
          {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
      )}
      {stats && stats.blocked > 0 && <span className="pill on">{stats.blocked} blocked</span>}
      {withBadge && (
        <span className="liMeta">
          {p.agents.length} agent{p.agents.length === 1 ? "" : "s"} · {p.backend}
          {stats?.lastActivityAt ? ` · ${elapsedLabel(stats.lastActivityAt)} ago` : ""}
        </span>
      )}
    </div>
  );
}

export function Launcher({ onNewAgent }: { onNewAgent: () => void }) {
  const projects = useStore((s) => s.projects);
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const toast = useStore((s) => s.toast);
  const theme = useStore((s) => s.theme);
  const repoCloning = useStore((s) => s.repoCloning);
  const { toggleTheme, createProject, createRepoProject, showToast, selectProject, showView } = useStore.getState();
  const [tab, setTab] = useState<"local" | "repo">("local");
  const [drag, setDrag] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [query, setQuery] = useState("");
  const fetchProjectStats = useStore.getState().fetchProjectStats;

  useEffect(() => {
    void fetchProjectStats();
    const id = setInterval(() => void fetchProjectStats(), 10000);
    return () => clearInterval(id);
  }, [fetchProjectStats]);

  async function handleNewAgent() {
    if (selectedProjectId) { onNewAgent(); return; }
    if (projects.length > 0) {
      await selectProject(projects[projects.length - 1]);
      onNewAgent();
      return;
    }
    showToast("Open a project first — no rooms yet");
  }

  const filtered = useMemo(
    () => projects.filter((p) => fuzzyMatch(query, p.name) || fuzzyMatch(query, p.path)),
    [projects, query],
  );
  const recent = useMemo(
    () => [...filtered].sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0)),
    [filtered],
  );
  const zoneGroups = useMemo(() => {
    const groups = new Map<string, Project[]>();
    for (const p of filtered) {
      const key = p.zone ?? "Unzoned";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }
    const order = [...ZONES, "Unzoned"];
    return order.filter((z) => groups.has(z)).map((z) => [z, groups.get(z)!] as const);
  }, [filtered]);
  const anyZoned = projects.some((p) => p.zone);

  return (
    <div className="viewRoot">
      <header className="lnHeader">
        <span className="wordmark">Agentic Control Room</span>
        <div className="spacer" />
        {toast && <span className="mono dim toast">{toast}</span>}
        <button className="pillBtn ghostBtn mono" onClick={() => showView("admin")}>settings</button>
        <button className="pillBtn iconBtn" title="Toggle theme" onClick={toggleTheme}>{theme === "light" ? "☀" : "☽"}</button>
      </header>
      <div className="lnScroll">
        <div className="lnCol">
          <div className="lnGreetRow">
            <h1>Projects</h1>
            <button className="pillBtn fillBtn" onClick={() => void handleNewAgent()}>
              + new agent
            </button>
          </div>
          <p className="lnSub dim">Open a workspace, assemble a team and keep its work in one place.</p>

          {projects.length > 0 && (
            <input
              className="fInput mono"
              style={{ marginBottom: 14 }}
              placeholder="Search projects…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}

          <div className="segGroup">
            <button type="button" className={`segOpt${tab === "local" ? " on" : ""}`} onClick={() => setTab("local")}>Local folder</button>
            <button type="button" className={`segOpt${tab === "repo" ? " on" : ""}`} onClick={() => setTab("repo")}>Repository</button>
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
                Choose a project folder <button className="pillBtn ghostBtn" onClick={(e) => { e.stopPropagation(); void createProject(); }}>browse&hellip;</button>
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
                Clones into ~/Documents/AgenticControlRoom/&lt;repo&gt; and opens a room on it. Requires <code className="mono">git</code> on PATH;
                per-branch worktrees and PR flow come with full multi-project support.
              </p>
              <GithubPanel />
            </div>
          )}

          <h6 className="lnRoomsHead dim">Your projects</h6>
          {filtered.length === 0 ? (
            <div className="lnList"><div className="lnEmpty">{query ? "No matches." : "No rooms yet — open a folder above."}</div></div>
          ) : anyZoned ? (
            zoneGroups.map(([zone, ps]) => (
              <div key={zone}>
                <div className="dim mono" style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", margin: "12px 0 2px" }}>{zone}</div>
                <div className="lnList">{ps.map((p) => <LnItem key={p.id} p={p} withBadge withZone />)}</div>
              </div>
            ))
          ) : (
            <div className="lnList">{filtered.map((p) => <LnItem key={p.id} p={p} withBadge withZone />)}</div>
          )}
        </div>
      </div>
    </div>
  );
}
