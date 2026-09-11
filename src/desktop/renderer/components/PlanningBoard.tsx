import { AgentMessage } from "./AgentMessage";
import { useEffect, useState } from "react";
import { useStore } from "../store";
import { colorFor, initials } from "../lib/agents";
import { NewTaskModal } from "./TaskBoard";
import type { PlanningMessage, Project } from "../types";

export function PlanningBoard() {
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const project = useStore((s) => s.projects.find((p) => p.id === selectedProjectId));
  const { showView, showToast } = useStore.getState();
  const [messages, setMessages] = useState<PlanningMessage[]>([]);
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [pathInput, setPathInput] = useState("");
  const [busyAgentId, setBusyAgentId] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<PlanningMessage | null>(null);

  const refresh = () => {
    if (selectedProjectId) void api.listPlanning(selectedProjectId).then(setMessages);
  };
  useEffect(refresh, [selectedProjectId]);

  if (!project) return null;

  const post = async () => {
    if (!text.trim()) return;
    await api.postPlanning(project.id, "user", "You", text.trim(), attachments.length ? attachments : undefined);
    setText("");
    setAttachments([]);
    refresh();
  };

  const addFile = async () => {
    const path = await api.pickAttachment();
    if (path) setAttachments((a) => [...a, path]);
  };

  const askAgent = async (agentId: string) => {
    setBusyAgentId(agentId);
    try {
      await api.commentPlanning(project.id, agentId);
      refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Agent comment failed");
    } finally {
      setBusyAgentId(null);
    }
  };

  return (
    <div className="viewRoot">
      <header className="rvHeader">
        <button className="pillBtn ghostBtn mono" onClick={() => showView("room")}>&larr; back</button>
        <span className="rvName">Planning &mdash; {project.name}</span>
      </header>
      <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 }}>
        {messages.length === 0 && <div className="dim" style={{ fontSize: 12.5 }}>No ideas posted yet — start the thread below.</div>}
        {messages.map((m) => (
          <div key={m.id} style={{ display: "flex", gap: 10, padding: "10px 12px", border: "1px solid var(--rule)", borderRadius: 8, background: "var(--paper)" }}>
            <div className="monogram mono" style={{ width: 26, height: 26, fontSize: 10, background: colorFor(m.authorId), flexShrink: 0 }}>{initials(m.authorName)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <span style={{ font: "600 12.5px/1.3 var(--font-body)" }}>{m.authorName}</span>
                <span className="dim mono" style={{ fontSize: 10 }}>{new Date(m.createdAt).toLocaleString()}</span>
              </div>
              <div style={{ fontSize: 13, whiteSpace: "pre-wrap", marginTop: 3 }}><AgentMessage message={{ts:m.createdAt,agentId:m.authorId,role:m.authorName,message:m.text,artifactId:m.artifactId}} /></div>
              {m.attachments && m.attachments.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6 }}>
                  {m.attachments.map((p, i) => (
                    <span key={i} className="mono dim" style={{ fontSize: 10.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p}</span>
                  ))}
                </div>
              )}
              <button className="pillBtn ghostBtn mono" style={{ fontSize: 10, marginTop: 8 }} onClick={() => setPromoting(m)}>promote to task</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: "12px 20px", borderTop: "1px solid var(--rule)", display: "flex", flexDirection: "column", gap: 8, maxWidth: 720 }}>
        {project.agents.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {project.agents.map((a) => (
              <button key={a.id} className="pillBtn ghostBtn mono" style={{ fontSize: 10.5 }} disabled={busyAgentId === a.id} onClick={() => void askAgent(a.id)}>
                {busyAgentId === a.id ? "…" : `ask ${a.name}`}
              </button>
            ))}
          </div>
        )}
        {attachments.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {attachments.map((p, i) => (
              <div key={i} className="mono dim" style={{ display: "flex", justifyContent: "space-between", fontSize: 11, gap: 8 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p}</span>
                <span style={{ cursor: "pointer", flexShrink: 0 }} onClick={() => setAttachments((a) => a.filter((_, j) => j !== i))}>&times;</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 6 }}>
          <textarea
            className="fInput"
            rows={2}
            style={{ flex: 1 }}
            placeholder="Post an idea…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void post(); } }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button className="pillBtn ghostBtn mono" onClick={() => void addFile()}>+ file</button>
            <button className="pillBtn fillBtn mono" onClick={() => void post()}>post</button>
          </div>
        </div>
        <input
          className="fInput mono"
          style={{ fontSize: 11 }}
          placeholder="…or paste a file path, enter to attach"
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && pathInput.trim()) { setAttachments((a) => [...a, pathInput.trim()]); setPathInput(""); } }}
        />
      </div>

      {promoting && (
        <NewTaskModal
          project={project}
          onClose={() => setPromoting(null)}
          onCreated={() => { showToast("Task created"); refresh(); }}
          defaultTitle={promoting.text.slice(0, 80)}
          defaultDescription={promoting.text}
          defaultAttachments={promoting.attachments}
          sourcePlanningMessageId={promoting.id}
        />
      )}
    </div>
  );
}
