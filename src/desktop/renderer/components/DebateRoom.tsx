import { AgentPicker } from "./AgentPicker";
import { TopBar } from "./TopBar";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { agentIdOf, colorFor, initials } from "../lib/agents";
import { AgentMessage } from "./AgentMessage";
import { RoomScene } from "./RoomScene";

export function DebateRoom() {
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const project = useStore((s) => s.projects.find((p) => p.id === selectedProjectId));
  const messages = useStore((s) => s.messages);
  const running = useStore((s) => !!s.runningKeys[selectedProjectId ?? ""]);
  const { showView, showToast } = useStore.getState();

  const [analysts, setAnalysts] = useState<Set<string>>(new Set());
  const [manager, setManager] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [maxRounds, setMaxRounds] = useState(2);
  const [startedTs, setStartedTs] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);

  useEffect(() => {
    if (scrollRef.current && follow.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  if (!project) {
    return (
      <div className="viewRoot workspaceView viewDebateRoom">
      <TopBar />
        <header className="rvHeader">
          <button className="pillBtn ghostBtn mono" onClick={() => showView("room")}>&larr; back</button>
        </header>
        <div className="rvEmpty">No project selected.</div>
      </div>
    );
  }

  const toggleAnalyst = (id: string) => {
    if (id === manager) return; // mutually exclusive with the manager pick
    setAnalysts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const pickManager = (id: string) => {
    if (analysts.has(id)) return; // mutually exclusive with the analyst picks
    setManager((prev) => (prev === id ? null : id));
  };

  const start = () => {
    if (analysts.size < 2) { showToast("Pick at least 2 analysts"); return; }
    if (!manager) { showToast("Pick a manager to judge the debate"); return; }
    if (!topic.trim()) { showToast("Give the debate a topic"); return; }
    setStartedTs(new Date().toISOString());
    void api.startDebate(project.id, [...analysts], manager, topic.trim(), maxRounds)
      .catch((err) => {setStartedTs(null);showToast(err instanceof Error ? err.message : String(err));});
  };

  const participantIds = manager ? [...analysts, manager] : [...analysts];
  const transcript = startedTs
    ? messages.filter((m) => m.ts >= startedTs && (participantIds.includes(agentIdOf(m)) || agentIdOf(m) === "orchestrator"))
    : [];
  const lastSystemMsg = [...transcript].reverse().find((m) => agentIdOf(m) === "orchestrator");
  const outcome = !running && lastSystemMsg
    ? lastSystemMsg.message.includes("Consensus reached") ? "consensus"
      : lastSystemMsg.message.includes("No consensus") ? "no-consensus"
        : null
    : null;

  return (
    <div className="viewRoot workspaceView viewDebateRoom">
      <TopBar />
      <header className="rvHeader">
        <button className="pillBtn ghostBtn mono" onClick={() => showView("room")}>&larr; back</button>
        <span className="rvName">{project.name}</span>
        <span className="dim mono" style={{ fontSize: 10.5 }}>Debate room</span>
      </header>


      {!startedTs && (
        <div className="sessionSetup"><div className="sessionSetupIntro"><span className="dim">Team collaboration</span><h1>Compare perspectives, reach a decision</h1><p>Choose two or more analysts and a separate manager to review their arguments.</p></div>
          <AgentPicker agents={project.agents} value={analysts} onToggle={toggleAnalyst} blocked={manager??undefined} label="Analysts" />
          <label className="sessionManager"><span>Manager · reviews the outcome</span><select className="fInput" aria-label="Debate manager" value={manager??''} onChange={e=>setManager(e.target.value||null)}><option value="">Choose a manager</option>{project.agents.filter(a=>!analysts.has(a.id)).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <div className="fField">
            <span className="fLabel">Topic</span>
            <textarea aria-label="Discussion topic" className="fInput" rows={3} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What should they debate?" />
          </div>
          <div className="fField">
            <span className="fLabel">Max rounds</span>
            <div className="segGroup">
              {[1, 2, 3].map((r) => (
                <button type="button" key={r} className={`segOpt${maxRounds === r ? " on" : ""}`} onClick={() => setMaxRounds(r)}>{r}</button>
              ))}
            </div>
          </div>
          <button className="pillBtn fillBtn mono" disabled={running || analysts.size < 2 || !manager || !topic.trim()} onClick={start}>start debate</button>
        </div>
      )}

      {startedTs && (
        <>
          <div className="conversationHistory" ref={scrollRef} onScroll={e=>{const el=e.currentTarget;follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;}} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 20 }}>
            <div className="dim mono" style={{ fontSize: 10.5, marginBottom: 14 }}>
              {running ? "debate in progress…" : outcome === "consensus" ? "consensus reached" : outcome === "no-consensus" ? "no consensus reached" : "debate ended"}
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
              <button className="pillBtn ghostBtn mono" onClick={() => { setStartedTs(null); setAnalysts(new Set()); setManager(null); setTopic(""); }}>new debate</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
