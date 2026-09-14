import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import type { AuditEvent, ExecutionPolicy, ExecutionState, Project } from "../types";
import { ProjectUsage } from "./ProjectUsage";
import "./ExecutionPolicyPanel.css";

const MODES: { value: ExecutionPolicy["mode"]; label: string; description: string }[] = [
  { value: "provider-managed", label: "Provider-managed", description: "Use the provider's own permissions and controls." },
  { value: "read-only", label: "Read-only", description: "Permit inspection while blocking writes when enforced." },
  { value: "isolated-workspace", label: "Isolated workspace", description: "Constrain work to an isolated workspace when supported." },
];

function shortId(value: string | undefined): string {
  return value ? value.slice(0, 8) : "—";
}

function readable(value: string | undefined): string {
  return value ? value.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Unknown";
}

function eventStatus(event: AuditEvent): string {
  const status = event.metadata?.status;
  return status === undefined || status === null ? "Recorded" : readable(String(status));
}

function eventDetail(event: AuditEvent): string {
  const metadata = event.metadata ?? {};
  const details = Object.entries(metadata)
    .filter(([key]) => key !== "status")
    .map(([key, value]) => `${readable(key)}: ${String(value)}`);
  return details.join(" · ");
}

export function ExecutionPolicyPanel({ project }: { project: Project }) {
  const [state, setState] = useState<ExecutionState | null>(null);
  const [policy, setPolicy] = useState<ExecutionPolicy | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [runFilter, setRunFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [canceling, setCanceling] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const generation = useRef(0);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const dirtyRef = useRef(false);

  const load = useCallback(async (initial = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const requestGeneration = generation.current;
    try {
      const next = await api.getExecutionState(project.id);
      if (!mounted.current || requestGeneration !== generation.current) return;
      setState(next);
      if (!dirtyRef.current) setPolicy(next.policy);
      setLoadError("");
    } catch (cause) {
      if (!mounted.current || requestGeneration !== generation.current) return;
      setLoadError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (requestGeneration === generation.current) {
        inFlight.current = false;
        if (initial) setLoading(false);
      }
    }
  }, [project.id]);

  useEffect(() => {
    mounted.current = true;
    generation.current += 1;
    inFlight.current = false;
    dirtyRef.current = false;
    setDirty(false);
    setState(null);
    setPolicy(null);
    setLoading(true);
    setSaving(false);
    setLoadError("");
    setActionError("");
    setCanceling([]);
    void load(true);
    const timer = window.setInterval(() => void load(), 2000);
    return () => {
      mounted.current = false;
      generation.current += 1;
      window.clearInterval(timer);
    };
  }, [load]);

  const chooseMode = (mode: ExecutionPolicy["mode"]) => {
    if (!policy || saving) return;
    const next = { ...policy, mode };
    setPolicy(next);
    dirtyRef.current = true;
    setDirty(true);
  };

  const chooseLimit = (key: "maxCalls" | "maxConcurrent" | "maxWallMs", value: string) => {
    if (!policy || saving) return;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0) return;
    const next = { ...policy, [key]: parsed };
    setPolicy(next);
    dirtyRef.current = true;
    setDirty(true);
  };

  const save = async () => {
    if (!policy) return;
    const requestGeneration = generation.current;
    const draft = policy;
    setSaving(true);
    setActionError("");
    try {
      const next = await api.saveExecutionPolicy(project.id, draft);
      if (!mounted.current || requestGeneration !== generation.current) return;
      setState(next);
      setPolicy(next.policy);
      dirtyRef.current = false;
      setDirty(false);
    } catch (cause) {
      if (mounted.current && requestGeneration === generation.current) setActionError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (mounted.current && requestGeneration === generation.current) setSaving(false);
    }
  };

  const requestStop = async (runId: string) => {
    const requestGeneration = generation.current;
    setCanceling((current) => current.includes(runId) ? current : [...current, runId]);
    setActionError("");
    try {
      const accepted = await api.cancelExecutionRun(project.id, runId);
      if (!mounted.current || requestGeneration !== generation.current) return;
      if (!accepted) setActionError("The stop request was not accepted.");
      await load();
    } catch (cause) {
      if (mounted.current && requestGeneration === generation.current) setActionError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (mounted.current && requestGeneration === generation.current) setCanceling((current) => current.filter((id) => id !== runId));
    }
  };

  if (!state || !policy) return <div className="executionPanel executionStateMessage"><p>{loadError ? "Could not load execution state." : loading ? "Loading execution state…" : "Execution state is unavailable."}</p>{loadError && <><div className="executionError" role="alert">{loadError}</div><button type="button" className="pillBtn fillBtn" onClick={() => { setLoading(true); void load(true); }}>Retry</button></>}</div>;

  const visibleEvents = state.events.filter((event) => {
    const runMatches = !runFilter || event.scope.runId.toLowerCase().includes(runFilter.toLowerCase());
    const agentMatches = !agentFilter || event.scope.agentId.toLowerCase().includes(agentFilter.toLowerCase());
    const kindMatches = !kindFilter || event.kind === kindFilter;
    return runMatches && agentMatches && kindMatches;
  });
  const kinds = Array.from(new Set(state.events.map((event) => event.kind)));
  const currentUnavailable = policy.mode !== "provider-managed";

  return (
    <div className="executionPanel executionInline">
      <div className="executionScroll">
        {!state.canRun && <div className="executionNotice" role="status">Runs are blocked by this project’s protection policy. Open Activity history → Advanced protection to review it.</div>}
        {loadError && <div className="executionError" role="alert">Refresh failed: {loadError}</div>}
        {actionError && <div className="executionError" role="alert">{actionError}</div>}

        <section className="executionSection">
          <div className="executionSectionHead"><div><h2>Project activity</h2></div></div>
          {state.active.length === 0 ? <p className="executionEmpty">No active runs. Activity is recorded automatically.</p> : <div className="executionRuns">{state.active.map((run) => { const stopRequested = canceling.includes(run.runId) || run.state === "cancel-requested"; return <div className="executionRun" key={run.runId}><div><strong>{run.agentIds.map(id => project.agents.find(agent => agent.id === id)?.name ?? id).join(", ") || "Project workflow"}</strong><div className="dim">{run.agentIds.length} agent{run.agentIds.length === 1 ? "" : "s"} · {readable(run.state)}</div>{stopRequested && <small>Stop requested; waiting for current call</small>}{!run.canInterrupt && !stopRequested && <small>Provider process interruption is unavailable; the run can still stop between calls.</small>}</div><button type="button" className="pillBtn ghostBtn" disabled={stopRequested} onClick={() => void requestStop(run.runId)}>{stopRequested ? "requested" : "request stop"}</button></div>; })}</div>}
        </section>

        <details className="executionHistory" open={historyOpen}>
          <summary onClick={(event) => { event.preventDefault(); setHistoryOpen((open) => !open); }}>Activity history</summary>
          {historyOpen && <ProjectUsage project={project} />}
        <section className="executionSection executionTimelineSection">
          <div className="executionSectionHead"><div><h2>Recent activity</h2><p className="dim">Newest events first. Showing the latest 200 events.</p><p className="dim">Timeline and stop controls cover app-managed runs. Interactive terminal activity is not recorded here.</p></div></div>
          <div className="executionFilters"><input className="fInput" aria-label="Filter by run ID" placeholder="Filter run ID" value={runFilter} onChange={(event: ChangeEvent<HTMLInputElement>) => setRunFilter(event.target.value)} /><input className="fInput" aria-label="Filter by agent ID" placeholder="Filter agent ID" value={agentFilter} onChange={(event: ChangeEvent<HTMLInputElement>) => setAgentFilter(event.target.value)} /><select className="fInput" aria-label="Filter by event kind" value={kindFilter} onChange={(event: ChangeEvent<HTMLSelectElement>) => setKindFilter(event.target.value)}><option value="">All event kinds</option>{kinds.map((kind: string) => <option key={kind} value={kind}>{readable(kind)}</option>)}</select></div>
          {visibleEvents.length === 0 ? <p className="executionEmpty">No audit events match these filters.</p> : <div className="executionTimeline">{visibleEvents.map((event) => <details className="executionEvent" key={event.eventId}><summary><span className="executionEventMain"><strong>{readable(event.kind)}</strong><span className="executionEventStatus">{eventStatus(event)}</span></span><span className="mono executionEventMeta">{new Date(event.timestamp).toLocaleString()} · {shortId(event.scope.agentId)} · run {shortId(event.scope.runId)}</span></summary><div className="executionEventDetail"><span>Event {event.eventId}</span><span>Agent {event.scope.agentId}</span><span>Run {event.scope.runId}</span><span>Sequence {event.sequence}</span>{eventDetail(event) && <span>{eventDetail(event)}</span>}{typeof event.metadata?.artifactId === "string" && <button type="button" className="pillBtn ghostBtn" onClick={() => window.dispatchEvent(new CustomEvent("openArtifactTab", { detail: { projectId: project.id, artifactId: event.metadata!.artifactId } }))}>Open artifact</button>}</div></details>)}</div>}
        </section>
        <details className="executionAdvanced"><summary>Advanced protection</summary>
        <section className="executionSection">
          <div className="executionSectionHead">
            <div><h2>Requested protection</h2><p className="dim">Unavailable protection blocks new runs instead of falling back to broader permissions.</p></div>
            {dirty && <span className="mono executionUnsaved">Unsaved</span>}
          </div>
          <label className="executionField">
            <span className="fLabel">Execution mode</span>
            <select className="fInput" aria-label="Execution mode" value={policy.mode} disabled={saving} onChange={(event: ChangeEvent<HTMLSelectElement>) => chooseMode(event.target.value as ExecutionPolicy["mode"])}>
              {MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}{mode.value !== "provider-managed" ? " (unavailable)" : ""}</option>)}
            </select>
          </label>
          <p className="executionModeDescription dim">{MODES.find((mode) => mode.value === policy.mode)?.description}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <label className="executionField"><span className="fLabel">App invocations</span><input className="fInput" type="number" min="0" step="1" inputMode="numeric" aria-label="App invocations" value={policy.maxCalls} disabled={saving} onChange={(event) => chooseLimit("maxCalls", event.target.value)} /><span className="dim" style={{ display: "block", marginTop: 4, fontSize: 10 }}>0 = unlimited</span></label>
            <label className="executionField"><span className="fLabel">Concurrent app invocations</span><input className="fInput" type="number" min="0" step="1" inputMode="numeric" aria-label="Concurrent app invocations" value={policy.maxConcurrent} disabled={saving} onChange={(event) => chooseLimit("maxConcurrent", event.target.value)} /><span className="dim" style={{ display: "block", marginTop: 4, fontSize: 10 }}>0 = unlimited</span></label>
            <label className="executionField"><span className="fLabel">Stop after milliseconds</span><input className="fInput" type="number" min="0" step="1" inputMode="numeric" aria-label="Stop after milliseconds" value={policy.maxWallMs} disabled={saving} onChange={(event) => chooseLimit("maxWallMs", event.target.value)} /><span className="dim" style={{ display: "block", marginTop: 4, fontSize: 10 }}>0 = unlimited</span></label>
          </div>
          <p className="executionModeDescription dim">A provider may settle after stop is requested.</p>
          {currentUnavailable && <p className="executionNotice">No compatible isolation driver is available. Saving this mode blocks future runs until it can be enforced.</p>}
          <p className="dim">Limits apply to app-dispatched invocations per run, shared with child tasks. A native provider may make several internal model calls. Token and cost caps are unavailable. The stop deadline requests cancellation; an in-flight provider call may still settle later.</p>
          <div className="executionSaveRow"><button type="button" className="pillBtn fillBtn" disabled={!dirty || saving} onClick={() => void save()}>{saving ? "saving…" : "Save execution policy"}</button></div>
        </section>

        <section className="executionSection">
          <div className="executionSectionHead"><div><h2>Effective protection</h2><p className="dim">Protection depends on your provider and the available execution controls.</p></div></div>
          <dl className="executionFacts"><div><dt>Declared mechanism</dt><dd>{state.effective.mechanism}</dd></div><div><dt>Run availability</dt><dd>{state.canRun ? "Available" : "Blocked"}</dd></div></dl>
          {state.effective.unsupported.length > 0 && <div className="executionUnsupported"><span className="fLabel">Unavailable controls</span><ul>{state.effective.unsupported.map((item: string) => <li key={item}>{item}</li>)}</ul></div>}
          {state.diagnostics.length > 0 && <div className="executionDiagnostics"><span className="fLabel">Diagnostics</span>{state.diagnostics.map((item: string) => <p key={item}>{item}</p>)}</div>}
        </section>

        </details>
        </details>
      </div>
    </div>
  );
}
