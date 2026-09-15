import { useState } from "react";
import { useStore } from "../store";
import type { Bucket } from "../types";
import { bucketOf, colorFor, CONTEXT_WARN_CHARS, elapsedLabel, initials, transcriptSize } from "../lib/agents";
import { useNow } from "../lib/useNow";
import { NewTaskModal } from "./TaskBoard";
import { ContextInspector } from "./ContextInspector";

const PIP_COLOR: Record<Bucket, string> = {
  needs: "var(--signal)", review: "var(--ink)", active: "var(--live)", seen: "var(--rule)", idle: "var(--ink-34)",
};
const STATE_LABEL: Record<Bucket, string> = {
  needs: "needs input", review: "to review", active: "active", seen: "seen", idle: "idle",
};

// `agentId`/`interactive` let this same header render a read-only split-view
// pane for a second agent — actions here (terminal, review, mark-reviewed)
// assume "the" selected agent elsewhere in the store, so they're hidden
// rather than wired twice for a first split-view pass.
export function AgentHeader({ onOpenReview, agentId, interactive = true }: { onOpenReview?: () => void; agentId?: string; interactive?: boolean }) {
  useNow();
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const project = useStore((s) => s.projects.find((p) => p.id === selectedProjectId));
  const storeSelectedAgent = useStore((s) => s.selectedAgent);
  const selectedAgent = agentId ?? storeSelectedAgent;
  const agentStates = useStore((s) => s.agentStates);
  const stateSince = useStore((s) => s.stateSince);
  const localSeen = useStore((s) => s.localSeen);
  const localForceActive = useStore((s) => s.localForceActive);
  const localPaused = useStore((s) => s.localPaused);
  const rawMode = useStore((s) => s.rawMode);
  const messages = useStore((s) => s.messages);
  const modelSuggestion = useStore((s) => s.modelSuggestion);
  const { togglePaused, markReviewed, toggleRawMode, showToast, showView, bumpAgentModel, dismissModelSuggestion } = useStore.getState();
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [contextInspectorOpen, setContextInspectorOpen] = useState(false);

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
          <div className="mono dim ahMeta">shared chatroom · runs this project's workflow</div>
        </div>
      </div>
    );
  }

  const agent = project.agents.find((a) => a.id === selectedAgent);
  const bucket = bucketOf(selectedAgent, { agentStates, localSeen, localForceActive });
  const paused = !!localPaused[selectedAgent];
  const contextLarge = transcriptSize(messages, selectedAgent) > CONTEXT_WARN_CHARS;
  const suggestedModel = modelSuggestion[selectedAgent];

  return (
    <div id="agentHeader">
      {taskModalOpen && (
        <NewTaskModal
          project={project}
          defaultReportedBy={agent?.name}
          onClose={() => setTaskModalOpen(false)}
          onCreated={() => showToast(`Task filed by ${agent?.name ?? "agent"}`)}
        />
      )}
      {interactive && contextInspectorOpen && (
        <ContextInspector projectId={project.id} agentId={selectedAgent} onClose={() => setContextInspectorOpen(false)} />
      )}
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
        {contextLarge && <span className="pill on mono" title="Long transcript — consider starting a fresh session soon">context large</span>}
        {interactive && suggestedModel && (
          <span className="chip mono" title="Repeated needs-input cycles — this task may need a stronger model">
            <span onClick={() => void bumpAgentModel(project.id, selectedAgent, suggestedModel)}>try {suggestedModel}?</span>
            <span className="x" onClick={() => dismissModelSuggestion(selectedAgent)}>&times;</span>
          </span>
        )}
        {interactive && bucket === "review" && <button className="pillBtn ghostBtn mono" onClick={onOpenReview}>review &rarr;</button>}
        {interactive && <button className="pillBtn ghostBtn mono" onClick={toggleRawMode}>{rawMode ? "raw" : "structured"}</button>}
      </div>
      {interactive && (
        <div className="ahActions">
          <button className="pillBtn ghostBtn mono" onClick={() => { togglePaused(selectedAgent); showToast(`${paused ? "Resumed" : "Paused"} · ${agent?.name}`); }}>
            {paused ? "resume" : "pause"}
          </button>
          <button className="pillBtn ghostBtn mono" disabled title="Reassign is not available yet">reassign</button>
          <button className="pillBtn ghostBtn mono" disabled title="Fork is not available yet">fork</button>
          <button className="pillBtn ghostBtn mono" onClick={() => showView("terminal")}>terminal ↗</button>
          <button className="pillBtn ghostBtn mono" onClick={() => setTaskModalOpen(true)}>+ task</button>
          <button className="pillBtn ghostBtn mono" onClick={() => setContextInspectorOpen(true)}>context</button>
          {bucket === "review" && (
            <button className="pillBtn fillBtn mono" onClick={() => { markReviewed(selectedAgent); showToast(`Marked reviewed · ${agent?.name}`); }}>
              mark-reviewed
            </button>
          )}
          {bucket === "seen" && (
            <button className="pillBtn ghostBtn mono" disabled style={{ opacity: 0.5, cursor: "default" }}>reviewed ✓</button>
          )}
        </div>
      )}
    </div>
  );
}
