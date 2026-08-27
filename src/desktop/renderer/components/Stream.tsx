import { useEffect, useRef } from "react";
import { useStore } from "../store";
import { agentIdOf, describeLine } from "../lib/agents";
import type { Msg } from "../types";

export function Stream({ agentId }: { agentId?: string } = {}) {
  const messages = useStore((s) => s.messages);
  const storeSelectedAgent = useStore((s) => s.selectedAgent);
  const selectedAgent = agentId ?? storeSelectedAgent;
  const activityLog = useStore((s) => s.activityLog);
  const rawMode = useStore((s) => s.rawMode);
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [messages, activityLog, selectedAgent, rawMode]);

  const visibleMessages = selectedAgent
    ? messages.filter((m) => {
        const id = agentIdOf(m);
        return id === selectedAgent || id === "user" || id === "system" || id === "orchestrator";
      })
    : messages;
  const acts = selectedAgent ? (activityLog[selectedAgent] ?? []) : [];

  if (visibleMessages.length === 0 && acts.length === 0) {
    return <div id="stream" ref={streamRef}><div className="streamEmpty">No activity yet.</div></div>;
  }

  if (rawMode) {
    const lines = [
      ...visibleMessages.map((m) => `[${m.role}] ${m.message}`),
      ...acts.map((a) => `$ ${a.raw ?? a.text}`),
    ];
    return (
      <div id="stream" ref={streamRef}>
        <pre className="mono" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 11, color: "var(--ink-70)", margin: 0 }}>
          {lines.join("\n\n")}
        </pre>
      </div>
    );
  }

  const combined = [
    ...visibleMessages.map((m) => ({ ts: m.ts, m })),
    ...acts.map((a) => ({ ts: a.ts, a })),
  ].sort((x, y) => x.ts.localeCompare(y.ts));

  return (
    <div id="stream" ref={streamRef}>
      {combined.map((item, i) =>
        "m" in item ? <MsgBlock key={`m${i}`} m={item.m} /> : <ToolBlock key={`a${i}`} text={item.a.text} raw={item.a.raw} ts={item.a.ts} />,
      )}
    </div>
  );
}

function MsgBlock({ m }: { m: Msg }) {
  const id = agentIdOf(m);
  const isUser = id === "user";
  const isSystem = m.role === "system" || id === "orchestrator";
  return (
    <div className={`blk ${isUser ? "user" : isSystem ? "note" : "prose"}`}>
      <div className="gutter">{isUser ? "you" : new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
      <div className="content">{m.message}</div>
    </div>
  );
}

function ToolBlock({ text, raw, ts }: { text: string; raw?: string; ts: string }) {
  const { kind, text: body } = describeLine(raw ?? text);
  return (
    <div className="blk tool">
      <div className="gutter">{new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
      <div className="content">
        <div className="toolHead">
          <span className="sig mono">{kind}</span>
          <span className="res mono">{body.slice(0, 80)}</span>
        </div>
      </div>
    </div>
  );
}
