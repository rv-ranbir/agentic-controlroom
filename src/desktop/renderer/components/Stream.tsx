import { EmptyState } from "./EmptyState";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { agentIdOf, bucketOf } from "../lib/agents";
import { extractChoices } from "../../../orchestrator/needsInput";
import { classifyLine } from "../../../backend/streamBlocks";
import { AgentMessage } from "./AgentMessage";
import type { CommitRecord, DiffResult, Msg } from "../types";

export function Stream({ agentId, interactive = true }: { agentId?: string; interactive?: boolean } = {}) {
  const messages = useStore((s) => s.messages);
  const storeSelectedAgent = useStore((s) => s.selectedAgent);
  const selectedAgent = agentId ?? storeSelectedAgent;
  const activityLog = useStore((s) => s.activityLog);
  const rawMode = useStore((s) => s.rawMode);
  const agentStates = useStore((s) => s.agentStates);
  const localSeen = useStore((s) => s.localSeen);
  const localForceActive = useStore((s) => s.localForceActive);
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const project = useStore((s) => s.projects.find((p) => p.id === s.selectedProjectId));
  const fetchDiff = useStore((s) => s.fetchDiff);
  const streamRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useEffect(() => { follow.current=true; }, [selectedAgent]);
  const [commits, setCommits] = useState<CommitRecord[]>([]);

  const bucket = selectedAgent ? bucketOf(selectedAgent, { agentStates, localSeen, localForceActive }) : null;
  const agentName = project?.agents.find((a) => a.id === selectedAgent)?.name;

  useEffect(() => {
    if (streamRef.current && follow.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [messages, activityLog, selectedAgent, rawMode]);

  useEffect(() => {
    if (interactive && bucket === "review") void fetchDiff();
  }, [interactive, bucket, selectedAgent, fetchDiff]);

  // committed diffs are permanent history — shown regardless of current review/seen
  // state, so "what code did this agent touch" never disappears once approved.
  useEffect(() => {
    if (!selectedProjectId || !selectedAgent) { setCommits([]); return; }
    let cancelled = false;
    void api.getCommits(selectedProjectId).then((all) => {
      if (!cancelled) setCommits(all.filter((c) => c.agentId === selectedAgent));
    });
    return () => { cancelled = true; };
  }, [selectedProjectId, selectedAgent, bucket]);

  // a message is visible in this agent's stream if it's their own reply, a system/
  // orchestrator note, or a user message not explicitly @mentioning a DIFFERENT agent
  // (an unaddressed/broadcast message is shown everywhere; a targeted one is not).
  const otherAgentNames = (project?.agents ?? []).filter((a) => a.id !== selectedAgent).map((a) => a.name);
  function userMsgVisible(text: string): boolean {
    if (agentName && text.startsWith(`@${agentName} `)) return true;
    return !otherAgentNames.some((n) => text.startsWith(`@${n} `));
  }

  const visibleMessages = selectedAgent
    ? messages.filter((m) => {
        const id = agentIdOf(m);
        if (id === selectedAgent || id === "system" || id === "orchestrator") return true;
        if (id === "user") return userMsgVisible(m.message);
        return false;
      })
    : messages;
  const acts = selectedAgent ? (activityLog[selectedAgent] ?? []) : [];

  if (visibleMessages.length === 0 && acts.length === 0 && commits.length === 0) {
    return <div id="stream" ref={streamRef} onScroll={e=>{const el=e.currentTarget;follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;}}><EmptyState title={project?.agents.length ? (agentName ? `Work with ${agentName}` : 'Start a conversation or workflow') : 'Build your project team'} description={project?.agents.length ? 'Describe a task below. Agent replies, evidence and interactive results will appear here.' : 'Add agents with the roles and providers your project needs. No default team is required.'}>{!project?.agents.length ? <button className="pillBtn fillBtn" onClick={()=>document.querySelector<HTMLButtonElement>('#rosterTop button:last-child')?.click()}>Add your first agent</button> : <button className="pillBtn" onClick={()=>useStore.getState().showView('workflows')}>Explore workflows</button>}</EmptyState></div>;
  }

  if (rawMode) {
    const lines = [
      ...visibleMessages.map((m) => `[${m.role}] ${m.message}`),
      ...acts.map((a) => `$ ${a.raw ?? a.text}`),
    ];
    return (
      <div id="stream" ref={streamRef} onScroll={e=>{const el=e.currentTarget;follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;}}>
        <pre className="mono" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 11, color: "var(--ink-70)", margin: 0 }}>
          {lines.join("\n\n")}
        </pre>
      </div>
    );
  }

  const combined = [
    ...visibleMessages.map((m) => ({ ts: m.ts, m })),
    ...acts.map((a) => ({ ts: a.ts, a })),
    ...commits.map((c) => ({ ts: c.ts, c })),
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

  return (
    <div id="stream" ref={streamRef} onScroll={e=>{const el=e.currentTarget;follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;}}>
      {combined.map((item, i) => {
        if ("m" in item) {
          return i === askIndex
            ? <AskBlock key={`m${i}`} m={item.m} />
            : <MsgBlock key={`m${i}`} m={item.m} mentionPrefix={agentName} />;
        }
        if ("c" in item) {
          return <CommitDiffBlock key={`c${item.c.sha}`} commit={item.c} projectId={selectedProjectId ?? ""} />;
        }
        return <ToolBlock key={`a${i}`} text={item.a.text} raw={item.a.raw} ts={item.a.ts} />;
      })}
      {interactive && bucket === "review" && selectedAgent && (
        <ReviewDiffBlock agentId={selectedAgent} agentName={agentName ?? "Agent"} />
      )}
    </div>
  );
}

function MsgBlock({ m, mentionPrefix }: { m: Msg; mentionPrefix?: string }) {
  const id = agentIdOf(m);
  const isUser = id === "user";
  const isSystem = m.role === "system" || id === "orchestrator";
  const text = isUser && mentionPrefix && m.message.startsWith(`@${mentionPrefix} `)
    ? m.message.slice(mentionPrefix.length + 2)
    : m.message;
  return (
    <div className={`blk ${isUser ? "user" : isSystem ? "note" : "prose"}`}>
      <div className="gutter">{isUser ? "you" : new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
      <div className="content"><AgentMessage message={m} text={text} /></div>
    </div>
  );
}

function AskBlock({ m }: { m: Msg }) {
  const choices = extractChoices(m.message);
  const submitComposer = useStore((s) => s.submitComposer);
  return (
    <div className="blk ask">
      <div className="gutter">{new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
      <div className="content">
        <div className="askEyebrow">Needs input</div>
        <div className="askText">{m.message}</div>
        {choices && (
          <div className="askChoices">
            {choices.map((c) => (
              <button key={c} className="askChoice mono" onClick={() => submitComposer(c)}>{c}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DiffFiles({ diff, verdict, verdictText }: { diff: DiffResult; verdict: string; verdictText: string }) {
  return (
    <>
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
    </>
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
        <DiffFiles diff={diff} verdict={verdict} verdictText={verdictText} />
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

function CommitDiffBlock({ commit, projectId }: { commit: CommitRecord; projectId: string }) {
  const [diff, setDiff] = useState<DiffResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api.getCommitDiff(projectId, commit.agentId, commit.sha).then((d) => { if (!cancelled) setDiff(d); });
    return () => { cancelled = true; };
  }, [projectId, commit.agentId, commit.sha]);

  if (!diff || diff.notGitRepo || diff.files.length === 0) return null;

  return (
    <div className="blk diff">
      <div className="gutter">{new Date(commit.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
      <div className="content">
        <DiffFiles diff={diff} verdict="approved" verdictText={`committed ${commit.sha.slice(0, 7)}`} />
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
