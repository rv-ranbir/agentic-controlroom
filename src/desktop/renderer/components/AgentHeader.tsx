import { useStore } from "../store";
import type { Bucket } from "../types";
import { bucketOf, colorFor, elapsedLabel, initials } from "../lib/agents";
import { useNow } from "../lib/useNow";

const PIP_COLOR: Record<Bucket, string> = {
  needs: "var(--signal)", review: "var(--ink)", active: "var(--live)", seen: "var(--rule)", idle: "var(--ink-34)",
};
const STATE_LABEL: Record<Bucket, string> = {
  needs: "needs input", review: "to review", active: "active", seen: "seen", idle: "idle",
};

export function AgentHeader({ onOpenReview }: { onOpenReview: () => void }) {
  useNow();
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const project = useStore((s) => s.projects.find((p) => p.id === selectedProjectId));
  const selectedAgent = useStore((s) => s.selectedAgent);
  const agentStates = useStore((s) => s.agentStates);
  const stateSince = useStore((s) => s.stateSince);
  const localSeen = useStore((s) => s.localSeen);
  const localForceActive = useStore((s) => s.localForceActive);
  const localPaused = useStore((s) => s.localPaused);
  const rawMode = useStore((s) => s.rawMode);
  const { togglePaused, markReviewed, toggleRawMode, showToast } = useStore.getState();

  if (!project) {
    return (
      <div id="agentHeader">
        <div className="monogram mono">RM</div>
        <div className="ahInfo">
          <div className="ahTitleRow"><span className="identDot" style={{ background: "var(--rule)" }} /><span className="ahTask">Room</span></div>
          <div className="mono dim ahMeta">no project selected</div>
        </div>
      </div>
    );
  }

  if (!selectedAgent) {
    return (
      <div id="agentHeader">
        <div className="monogram mono" style={{ background: "var(--sink)" }}>RM</div>
        <div className="ahInfo">
          <div className="ahTitleRow"><span className="identDot" style={{ background: "var(--rule)" }} /><span className="ahTask">Room — {project.name}</span></div>
          <div className="mono dim ahMeta">shared chatroom · runs the Dev→QA loop</div>
        </div>
      </div>
    );
  }

  const agent = project.agents.find((a) => a.id === selectedAgent);
  const bucket = bucketOf(selectedAgent, { agentStates, localSeen, localForceActive });
  const paused = !!localPaused[selectedAgent];

  return (
    <div id="agentHeader">
      <div className="monogram mono" style={{ background: colorFor(selectedAgent) }}>{agent ? initials(agent.name) : "?"}</div>
      <div className="ahInfo">
        <div className="ahTitleRow">
          <span className="identDot" style={{ background: colorFor(selectedAgent) }} />
          <span className="ahTask">{agent?.name ?? selectedAgent}</span>
        </div>
        <div className="mono dim ahMeta">{project.name} · {project.backend}</div>
      </div>
      <div className="ahRight">
        <div className="statePip">
          <span className="pipDot" style={{ background: PIP_COLOR[bucket] }} />
          <span>{STATE_LABEL[bucket]}</span>
          <span className="dim">{bucket === "active" ? elapsedLabel(stateSince[selectedAgent]) : ""}</span>
        </div>
        {bucket === "review" && <button className="pillBtn ghostBtn mono" onClick={onOpenReview}>review &rarr;</button>}
        <button className="pillBtn ghostBtn mono" onClick={toggleRawMode}>{rawMode ? "raw" : "structured"}</button>
      </div>
      <div className="ahActions">
        <button className="pillBtn ghostBtn mono" onClick={() => { togglePaused(selectedAgent); showToast(`${paused ? "Resumed" : "Paused"} · ${agent?.name}`); }}>
          {paused ? "resume" : "pause"}
        </button>
        <button className="pillBtn ghostBtn mono" onClick={() => showToast("Reassign — not wired yet")}>reassign</button>
        <button className="pillBtn ghostBtn mono" onClick={() => showToast("Fork — not wired yet")}>fork</button>
        <button className="pillBtn ghostBtn mono" onClick={() => showToast("Terminal — not wired yet (needs PTY, M1)")}>terminal ↗</button>
        {bucket === "review" && (
          <button className="pillBtn fillBtn mono" onClick={() => { markReviewed(selectedAgent); showToast(`Marked reviewed · ${agent?.name}`); }}>
            mark-reviewed
          </button>
        )}
        {bucket === "seen" && (
          <button className="pillBtn ghostBtn mono" disabled style={{ opacity: 0.5, cursor: "default" }}>reviewed ✓</button>
        )}
      </div>
    </div>
  );
}
