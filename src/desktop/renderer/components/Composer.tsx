import { useState } from "react";
import { useStore } from "../store";
import { bucketOf } from "../lib/agents";

export function Composer() {
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const project = useStore((s) => s.projects.find((p) => p.id === selectedProjectId));
  const selectedAgent = useStore((s) => s.selectedAgent);
  const agentStates = useStore((s) => s.agentStates);
  const localSeen = useStore((s) => s.localSeen);
  const localForceActive = useStore((s) => s.localForceActive);
  const localPaused = useStore((s) => s.localPaused);
  const runningKeys = useStore((s) => s.runningKeys);
  const { submitComposer } = useStore.getState();
  const [text, setText] = useState("");

  const busy = !project
    ? true
    : selectedAgent
      ? !!runningKeys[`${project.id}:${selectedAgent}`] || !!runningKeys[project.id] || !!localPaused[selectedAgent]
      : !!runningKeys[project.id];

  const agent = project?.agents.find((a) => a.id === selectedAgent);
  const bucket = selectedAgent ? bucketOf(selectedAgent, { agentStates, localSeen, localForceActive }) : "idle";
  const placeholder = !selectedAgent ? "Describe a task…" : bucket === "needs" ? `Answer ${agent?.name}…` : `Message ${agent?.name}…`;
  const sendLabel = busy ? (selectedAgent && localPaused[selectedAgent] ? "paused" : "working…") : selectedAgent ? "send" : "run";

  const submit = () => {
    const v = text.trim();
    if (!v || !project || busy) return;
    setText("");
    submitComposer(v);
  };

  return (
    <div id="composerWrap">
      <div className="composerRow">
        <input
          className="composerInput mono"
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); submit(); }
            if (e.key === "Escape") (e.target as HTMLInputElement).blur();
          }}
        />
        <button className="pillBtn sendBtn mono" disabled={busy} onClick={submit}>{sendLabel}</button>
      </div>
      <div className="hintRow dim mono">&crarr; send &middot; esc roster</div>
    </div>
  );
}
