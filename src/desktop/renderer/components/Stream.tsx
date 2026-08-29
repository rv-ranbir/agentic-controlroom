import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { agentIdOf, bucketOf } from "../lib/agents";
import { classifyLine } from "../../../backend/streamBlocks";
import { Markdown } from "./Markdown";
import type { Msg } from "../types";

export function Stream({ agentId, interactive = true }: { agentId?: string; interactive?: boolean } = {}) {
  const messages = useStore((s) => s.messages);
  const storeSelectedAgent = useStore((s) => s.selectedAgent);
  const selectedAgent = agentId ?? storeSelectedAgent;
  const activityLog = useStore((s) => s.activityLog);
  const rawMode = useStore((s) => s.rawMode);
  const agentStates = useStore((s) => s.agentStates);
  const localSeen = useStore((s) => s.localSeen);
  const localForceActive = useStore((s) => s.localForceActive);
  const project = useStore((s) => s.projects.find((p) => p.id === s.selectedProjectId));
  const fetchDiff = useStore((s) => s.fetchDiff);
  const streamRef = useRef<HTMLDivElement>(null);

  const bucket = selectedAgent ? bucketOf(selectedAgent, { agentStates, localSeen, localForceActive }) : null;

  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [messages, activityLog, selectedAgent, rawMode]);

  useEffect(() => {
    if (interactive && bucket === "review") void fetchDiff();
  }, [interactive, bucket, selectedAgent, fetchDiff]);

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

  // the message that put the agent into "needs" gets the full ask-card treatment
  // instead of a plain paragraph — find it once so only that occurrence renders specially.
  let askIndex = -1;
  if (interactive && bucket === "needs" && selectedAgent) {
    for (let i = combined.length - 1; i >= 0; i--) {
      const item = combined[i];
      if ("m" in item && agentIdOf(item.m) === selectedAgent) { askIndex = i; break; }
    }
  }

  const agentName = project?.agents.find((a) => a.id === selectedAgent)?.name ?? "Agent";

  return (
    <div id="stream" ref={streamRef}>
      {combined.map((item, i) =>
        "m" in item
          ? (i === askIndex
              ? <AskBlock key={`m${i}`} m={item.m} />
              : <MsgBlock key={`m${i}`} m={item.m} />)
          : <ToolBlock key={`a${i}`} text={item.a.text} raw={item.a.raw} ts={item.a.ts} />,
      )}
      {interactive && bucket === "review" && selectedAgent && (
        <ReviewDiffBlock agentId={selectedAgent} agentName={agentName} />
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
      <div className="content"><Markdown text={m.message} /></div>
    </div>
  );
}

function AskBlock({ m }: { m: Msg }) {
  return (
    <div className="blk ask">
      <div className="gutter">{new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
      <div className="content">
        <div className="askEyebrow">Needs input</div>
        <div className="askText">{m.message}</div>
      </div>
    </div>
  );
}

function ReviewDiffBlock({ agentId, agentName }: { agentId: string; agentName: string }) {
  const diff = useStore((s) => s.diff);
  const diffLoading = useStore((s) => s.diffLoading);
  const { approve, reject, showToast } = useStore.getState();
  const [verdict, setVerdict] = useState<"pending" | "approved" | "rejected">("pending");
  const [busy, setBusy] = useState(false);

  if (diffLoading) return null;
  if (!diff || diff.notGitRepo || diff.files.length === 0) return null;

  const verdictText = verdict === "pending" ? "awaiting review" : verdict === "approved" ? "approved" : "rejected";

  return (
    <div className="blk diff">
      <div className="gutter" />
      <div className="content">
        {diff.files.map((f) => (
          <div key={f.name}>
            <div className="diffHead">
              <span className="fname mono">{f.name}</span>
              <span className="stat mono"><span className="p">+{f.plus}</span> <span className="m">&minus;{f.minus}</span></span>
              <span className={`verdict ${verdict}`}>{verdictText}</span>
            </div>
            {f.lines.map((l, i) => (
              <div key={i} className={`diffLine${l.kind === "add" ? " add" : l.kind === "del" ? " del" : ""}`}>
                <span className="ln">{l.ln}</span><span>{l.text}</span>
              </div>
            ))}
          </div>
        ))}
        {verdict === "pending" && (
          <div className="diffFooter">
            <button
              className="pillBtn sageBtn mono"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                approve(agentId)
                  .then(({ sha }) => { setVerdict("approved"); showToast(`Committed ${sha.slice(0, 7)} · ${agentName}`); })
                  .catch((err) => showToast(err instanceof Error ? err.message : String(err)))
                  .finally(() => setBusy(false));
              }}
            >
              {busy ? "committing…" : "approve"}
            </button>
            <button
              className="pillBtn ghostBtn mono"
              disabled={busy}
              onClick={() => { reject(agentId); setVerdict("rejected"); showToast(`Rejected · ${agentName} back to active`); }}
            >
              reject
            </button>
            <span className="dim mono" style={{ fontSize: 10.5 }}>&#8984;&#9166; approves</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolBlock({ text, raw, ts }: { text: string; raw?: string; ts: string }) {
  const block = classifyLine(raw ?? text);
  const sig = block.kind === "tool" ? (block.toolName ?? "tool") : block.kind;
  return (
    <div className="blk tool">
      <div className="gutter">{new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
      <div className="content">
        <div className="toolHead">
          <span className="sig mono">{sig}</span>
          <span className="res mono">{block.text.slice(0, 80)}</span>
        </div>
      </div>
    </div>
  );
}
