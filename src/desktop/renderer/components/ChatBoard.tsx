import { EmptyState } from "./EmptyState";
import { TopBar } from "./TopBar";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { agentIdOf, colorFor, initials } from "../lib/agents";
import { AgentMessage } from "./AgentMessage";
import { RoomScene } from "./RoomScene";

export function ChatBoard() {
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const project = useStore((s) => s.projects.find((p) => p.id === selectedProjectId));
  const messages = useStore((s) => s.messages);
  const { showView } = useStore.getState();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);

  useEffect(() => {
    if (scrollRef.current && follow.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  if (!project) {
    return (
      <div className="viewRoot workspaceView viewChatBoard">
      <TopBar />
        <header className="rvHeader">
          <button className="pillBtn ghostBtn mono" onClick={() => showView("room")}>&larr; back</button>
        </header>
        <div className="rvEmpty">No project selected.</div>
      </div>
    );
  }

  const senderName = (id: string) => {
    if (id === "user") return "you";
    if (id === "system" || id === "orchestrator") return "system";
    return project.agents.find((a) => a.id === id)?.name ?? id;
  };

  const send = () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    void api.postBroadcast(project.id, t)
      .then(() => setText(""))
      .catch(err=>useStore.getState().showToast(err instanceof Error?err.message:"Could not post message"))
      .finally(() => setSending(false));
  };

  return (
    <div className="viewRoot workspaceView viewChatBoard">
      <TopBar />
      <header className="rvHeader">
        <button className="pillBtn ghostBtn mono" onClick={() => showView("room")}>&larr; back</button>
        <span className="rvName">{project.name}</span>
        <span className="dim mono" style={{ fontSize: 10.5 }}>Chat board &middot; everyone sees this</span>
      </header>
      <div className="conversationContext">Shared with all {project.agents.length} agents in this project</div>
      <div className="conversationHistory" ref={scrollRef} onScroll={e=>{const el=e.currentTarget;follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;}} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "20px" }}>
        {messages.length === 0 && <EmptyState title="Keep your team in the loop" description="Share context, decisions and updates here. Every agent in this project can see the conversation." />}
        {messages.map((m, i) => {
          const id = agentIdOf(m);
          const name = senderName(id);
          const isUser = id === "user";
          return (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <div className="monogram mono" style={{ width: 22, height: 22, fontSize: 9.5, flexShrink: 0, background: colorFor(id) }}>
                {isUser ? "Y" : initials(name)}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="mono dim" style={{ fontSize: 10.5, marginBottom: 2 }}>
                  {name} <span style={{ opacity: .6 }}>&middot; {new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <AgentMessage message={m} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="conversationComposer" style={{ borderTop: "1px solid var(--rule)", background: "var(--deck)", padding: "11px 20px 13px", display: "flex", gap: 10 }}>
        <input
          className="fInput mono"
          style={{ flex: 1 }}
          placeholder="Post to the whole room…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
        />
        <button className="pillBtn fillBtn mono" disabled={sending || !text.trim()} onClick={send}>
          {sending ? "sending…" : "send"}
        </button>
      </div>
    </div>
  );
}
