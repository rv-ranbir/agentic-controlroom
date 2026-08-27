import { useEffect, useState } from "react";
import { useStore } from "../store";
import { agentIdOf, colorFor, initials } from "../lib/agents";

export function Review() {
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const project = useStore((s) => s.projects.find((p) => p.id === selectedProjectId));
  const selectedAgent = useStore((s) => s.selectedAgent);
  const messages = useStore((s) => s.messages);
  const branch = useStore((s) => s.branch);
  const theme = useStore((s) => s.theme);
  const toast = useStore((s) => s.toast);
  const diff = useStore((s) => s.diff);
  const diffLoading = useStore((s) => s.diffLoading);
  const { toggleTheme, showView, approve, reject, showToast, fetchDiff } = useStore.getState();
  const [verdict, setVerdict] = useState<"pending" | "approved" | "rejected">("pending");

  useEffect(() => { void fetchDiff(); }, [project?.path, fetchDiff]);

  const agent = project?.agents.find((a) => a.id === selectedAgent);
  if (!project || !agent || !selectedAgent) {
    return (
      <div className="viewRoot">
        <header className="rvHeader">
          <button className="pillBtn ghostBtn mono" onClick={() => showView("room")}>&larr; back</button>
        </header>
        <div className="rvEmpty">No agent selected.</div>
      </div>
    );
  }

  const lastTask = [...messages].reverse().find((m) => agentIdOf(m) === "user")?.message ?? "Task";
  const turns = messages.filter((m) => { const id = agentIdOf(m); return id === selectedAgent || id === "user"; });

  return (
    <div className="viewRoot">
      <header className="rvHeader">
        <button className="pillBtn ghostBtn mono" onClick={() => showView("room")}>&larr; back</button>
        <div className="monogram mono" style={{ width: 26, height: 26, fontSize: 10, background: colorFor(selectedAgent) }}>{initials(agent.name)}</div>
        <span className="rvName">{agent.name}</span>
        <span className="dim mono" style={{ fontSize: 10.5 }}>{project.name}{branch ? ` · ${branch}` : ""}</span>
        <div className="spacer" />
        {toast && <span className="mono dim toast">{toast}</span>}
        <button className="pillBtn iconBtn" onClick={toggleTheme}>{theme === "light" ? "☀" : "☽"}</button>
      </header>
      <div className="rvBody">
        <div className="rvLeft">
          <div className="rvSummary">
            <span>{lastTask.slice(0, 90)}</span>
            <span className="mono dim">
              {diffLoading
                ? "loading…"
                : diff && !diff.notGitRepo
                  ? `+${diff.plus} −${diff.minus} · ${diff.files.length} file${diff.files.length === 1 ? "" : "s"}`
                  : "no diff"}
            </span>
          </div>
          <div className="rvFiles">
            {diffLoading && <div className="rvEmpty">Loading diff&hellip;</div>}
            {!diffLoading && diff?.notGitRepo && (
              <div className="rvEmpty">Not a git repository &mdash; no diff available.</div>
            )}
            {!diffLoading && diff && !diff.notGitRepo && diff.files.length === 0 && (
              <div className="rvEmpty">Clean working tree &mdash; no uncommitted changes. (This shows the whole room's working-tree diff, not per-agent — per-agent worktrees aren't built yet.)</div>
            )}
            {!diffLoading && diff?.files.map((f) => (
              <div key={f.name}>
                <div className="rvFileHead">
                  <span>{f.name}</span>
                  <span className="rvFileStat"><span className="p">+{f.plus}</span><span className="m">&minus;{f.minus}</span></span>
                </div>
                {f.lines.map((l, i) => (
                  <div key={i} className={`diffLine${l.kind === "add" ? " add" : l.kind === "del" ? " del" : ""}`}>
                    <span className="ln">{l.ln}</span>
                    <span>{l.text}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <aside className="rvRight">
          <div className="rvEyebrow dim mono">Conversation</div>
          <div className="rvConvo">
            {turns.length === 0
              ? <div className="rvEmpty">No conversation yet.</div>
              : turns.map((m, i) => (
                  <div key={i} className={`rvTurn${agentIdOf(m) === "user" ? " user" : ""}`}>
                    <div className="rvSender">{agentIdOf(m) === "user" ? "you" : agent.name}</div>
                    <div>{m.message}</div>
                  </div>
                ))}
          </div>
          <div className="rvActions">
            <div className="rvBtnRow">
              <button
                className="pillBtn sageBtn mono"
                disabled={verdict !== "pending"}
                onClick={() => {
                  approve(selectedAgent); setVerdict("approved");
                  showToast(`Approved · ${agent.name} merged ${branch || "branch"}`);
                }}
              >
                approve
              </button>
              <button
                className="pillBtn ghostBtn mono"
                disabled={verdict !== "pending"}
                onClick={() => {
                  reject(selectedAgent); setVerdict("rejected");
                  showToast(`Rejected · ${agent.name} back to active`);
                }}
              >
                reject
              </button>
            </div>
            <div className="dim mono" style={{ fontSize: 10.5, marginTop: 6 }}>
              {verdict === "pending" ? "awaiting review" : verdict === "approved" ? `approved · merged ${branch || "branch"}` : "rejected · back to active"}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
