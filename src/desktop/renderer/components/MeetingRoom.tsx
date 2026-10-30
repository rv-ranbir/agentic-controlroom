import { AgentPicker } from "./AgentPicker";
import { TopBar } from "./TopBar";
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
  const { showView, showToast, setActiveRoomRoster } = useStore.getState();

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [topic, setTopic] = useState("");
  const [rounds, setRounds] = useState(2);
  const [startedTs, setStartedTs] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);

  useEffect(() => {
    if (scrollRef.current && follow.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  if (!project) {
    return (
      <div className="viewRoot workspaceView viewMeetingRoom">
      <TopBar />
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
      .catch((err) => {setStartedTs(null);showToast(err instanceof Error ? err.message : String(err));});
  };

  const transcript = startedTs
    ? messages.filter((m) => m.ts >= startedTs && (picked.has(agentIdOf(m)) || agentIdOf(m) === "orchestrator"))
    : [];

  return (
    <div className="viewRoot workspaceView viewMeetingRoom">
      <TopBar />
      <header className="rvHeader">
        <button className="pillBtn ghostBtn mono" onClick={() => showView("room")}>&larr; back</button>
        <span className="rvName">{project.name}</span>
        <span className="dim mono" style={{ fontSize: 10.5 }}>Meeting room</span>
      </header>


      {!startedTs && (
        <div className="sessionSetup"><div className="sessionSetupIntro"><span className="dim">Team collaboration</span><h1>Bring the right people together</h1><p>Choose at least two agents and give them a focused topic.</p></div>
          <AgentPicker agents={project.agents} value={picked} onToggle={toggle} label="Participants" />
          <div className="fField">
            <span className="fLabel">Topic</span>
            <textarea aria-label="Discussion topic" className="fInput" rows={3} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What should they discuss?" />
          </div>
          <div className="fField">
            <span className="fLabel">Rounds</span>
            <div className="segGroup">
              {[1, 2, 3].map((r) => (
                <button type="button" key={r} className={`segOpt${rounds === r ? " on" : ""}`} onClick={() => setRounds(r)}>{r}</button>
              ))}
            </div>
          </div>
          <button className="pillBtn fillBtn mono" disabled={running || picked.size < 2 || !topic.trim()} onClick={start}>start meeting</button>
        </div>
      )}

      {startedTs && (
        <>
          <div className="conversationHistory" ref={scrollRef} onScroll={e=>{const el=e.currentTarget;follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;}} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 20 }}>
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
