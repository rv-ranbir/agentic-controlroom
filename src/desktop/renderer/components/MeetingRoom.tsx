import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { agentIdOf, colorFor, initials } from "../lib/agents";
import { AgentMessage } from "./AgentMessage";
import { RoomScene } from "./RoomScene";

export function MeetingRoom() {
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const project = useStore((s) => s.projects.find((p) => p.id === selectedProjectId));
  const messages = useStore((s) => s.messages);
  const running = useStore((s) => !!s.runningKeys[selectedProjectId ?? ""]);
  const { showView, showToast } = useStore.getState();

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [topic, setTopic] = useState("");
  const [rounds, setRounds] = useState(2);
  const [startedTs, setStartedTs] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  if (!project) {
    return (
      <div className="viewRoot">
        <header className="rvHeader">
          <button className="pillBtn ghostBtn mono" onClick={() => showView("room")}>&larr; back</button>
        </header>
        <div className="rvEmpty">No project selected.</div>
      </div>
    );
  }

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const start = () => {
    if (picked.size < 2) { showToast("Pick at least 2 agents"); return; }
    if (!topic.trim()) { showToast("Give the meeting a topic"); return; }
    setStartedTs(new Date().toISOString());
    void api.startMeeting(project.id, [...picked], topic.trim(), rounds)
      .catch((err) => showToast(err instanceof Error ? err.message : String(err)));
  };

  const transcript = startedTs
    ? messages.filter((m) => m.ts >= startedTs && (picked.has(agentIdOf(m)) || agentIdOf(m) === "orchestrator"))
    : [];

  return (
    <div className="viewRoot">
      <header className="rvHeader">
        <button className="pillBtn ghostBtn mono" onClick={() => showView("room")}>&larr; back</button>
        <span className="rvName">{project.name}</span>
        <span className="dim mono" style={{ fontSize: 10.5 }}>Meeting room</span>
      </header>
      <RoomScene agents={startedTs ? project.agents.filter((a) => picked.has(a.id)) : project.agents} />

      {!startedTs && (
        <div style={{ padding: 20, maxWidth: 640 }}>
          <div className="fField">
            <span className="fLabel">Who's in the meeting</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {project.agents.map((a) => (
                <div
                  key={a.id}
                  className={`roleOpt${picked.has(a.id) ? " chosen" : ""}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => toggle(a.id)}
                >
                  <div className="monogram mono" style={{ width: 22, height: 22, fontSize: 9.5, background: colorFor(a.id) }}>{initials(a.name)}</div>
                  <span>{a.name}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="fField">
            <span className="fLabel">Topic</span>
            <textarea className="fInput" rows={3} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What should they discuss?" />
          </div>
          <div className="fField">
            <span className="fLabel">Rounds</span>
            <div className="segGroup">
              {[1, 2, 3].map((r) => (
                <div key={r} className={`segOpt${rounds === r ? " on" : ""}`} onClick={() => setRounds(r)}>{r}</div>
              ))}
            </div>
          </div>
          <button className="pillBtn fillBtn mono" onClick={start}>start meeting</button>
        </div>
      )}

      {startedTs && (
        <>
          <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 20 }}>
            <div className="dim mono" style={{ fontSize: 10.5, marginBottom: 14 }}>
              {running ? "meeting in progress…" : "meeting ended"}
            </div>
            {transcript.map((m, i) => {
              const id = agentIdOf(m);
              const name = id === "orchestrator" ? "system" : (project.agents.find((a) => a.id === id)?.name ?? id);
              return (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                  <div className="monogram mono" style={{ width: 22, height: 22, fontSize: 9.5, flexShrink: 0, background: colorFor(id) }}>{initials(name)}</div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="mono dim" style={{ fontSize: 10.5, marginBottom: 2 }}>{name}</div>
                    <AgentMessage message={m} />
                  </div>
                </div>
              );
            })}
          </div>
          {!running && (
            <div style={{ padding: "0 20px 20px" }}>
              <button className="pillBtn ghostBtn mono" onClick={() => { setStartedTs(null); setPicked(new Set()); setTopic(""); }}>new meeting</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
