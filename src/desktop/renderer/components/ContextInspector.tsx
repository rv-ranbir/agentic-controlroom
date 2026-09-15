import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Checkpoint } from "../../../harness/checkpoint";
import type { ContextManifest } from "../../../harness/context";
import type { ContextInspection } from "../../../harness/contextSession";
import "./ContextInspector.css";

interface ContextApi {
  getAgentContexts(projectId: string, agentId: string): Promise<ContextInspection[]>;
  getContextSource(projectId: string, agentId: string, contextId: string, checkpointId: string): Promise<ContextManifest>;
  compactAgentContext(projectId: string, agentId: string, contextId: string): Promise<void>;
  reconcileAgentContext(projectId: string, agentId: string, contextId: string): Promise<void>;
}

const contextApi = api as unknown as ContextApi;

function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function tokens(value: number): string { return `${value.toLocaleString()} tokens`; }
function taskSuffix(taskId: string): string { return taskId.length > 10 ? `…${taskId.slice(-8)}` : taskId; }
function stateFor(context: ContextInspection): { label: string; className: string } {
  if (context.pending) return { label: "pending review", className: "pending" };
  if (context.busy) return { label: "busy", className: "busy" };
  if (context.legacy) return { label: "legacy", className: "legacy" };
  return { label: "ready", className: "ready" };
}

function SummaryText({ value }: { value: string }) {
  if (!value) return <p className="contextEmpty">No checkpoint summary recorded.</p>;
  try {
    const parsed = JSON.parse(value) as Partial<Checkpoint["summary"]>;
    if (parsed && typeof parsed === "object" && typeof parsed.summary === "string") return <p className="contextSummaryText">{parsed.summary}</p>;
  } catch { /* Older summaries may be plain text. */ }
  return <p className="contextSummaryText">{value}</p>;
}

function Layer({ label, values }: { label: string; values: string[] }) {
  return <details className="contextLayer"><summary>{label}<span className="mono contextCount">{values.length}</span></summary>{values.length ? <ul>{values.map((value, index) => <li key={`${index}-${value}`}>{value}</li>)}</ul> : <p className="contextEmpty">Nothing recorded.</p>}</details>;
}

export function ContextInspector({ projectId, agentId, onClose }: { projectId: string; agentId: string; onClose: () => void }) {
  const [contexts, setContexts] = useState<ContextInspection[]>([]);
  const [selectedContextId, setSelectedContextId] = useState("");
  const [selectedCheckpointId, setSelectedCheckpointId] = useState("");
  const [source, setSource] = useState<ContextManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [action, setAction] = useState<"compact" | "reconcile" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const generation = useRef(0);
  const sourceGeneration = useRef(0);
  const previousFocus = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const current = ++generation.current;
    sourceGeneration.current += 1;
    setLoading(true); setError(""); setNotice(""); setContexts([]); setSelectedContextId(""); setSelectedCheckpointId(""); setAction(null); setSource(null); setShowSource(false); setConfirmed(false); setSourceLoading(false);
    void contextApi.getAgentContexts(projectId, agentId).then((items) => {
      if (generation.current !== current) return;
      setContexts(items); setSelectedContextId(items[0]?.id ?? "");
    }).catch((reason) => { if (generation.current === current) setError(errorText(reason)); }).finally(() => {
      if (generation.current === current) setLoading(false);
    });
    return () => { generation.current += 1; };
  }, [projectId, agentId, refreshKey]);

  const selectedContext = useMemo(() => contexts.find((context) => context.id === selectedContextId), [contexts, selectedContextId]);
  const checkpoints = useMemo(() => selectedContext?.checkpoints ?? [], [selectedContext]);
  useEffect(() => {
    setSelectedCheckpointId(checkpoints[0]?.id ?? ""); setSource(null); setShowSource(false); setConfirmed(false);
  }, [selectedContextId, checkpoints]);

  useEffect(() => {
    if (!selectedContext || !selectedCheckpointId) return;
    const current = ++sourceGeneration.current;
    setSourceLoading(true); setError(""); setShowSource(false);
    void contextApi.getContextSource(projectId, agentId, selectedContext.id, selectedCheckpointId).then((manifest) => {
      if (sourceGeneration.current === current) setSource(manifest);
    }).catch((reason) => { if (sourceGeneration.current === current) setError(errorText(reason)); }).finally(() => {
      if (sourceGeneration.current === current) setSourceLoading(false);
    });
    return () => { sourceGeneration.current += 1; };
  }, [projectId, agentId, selectedContext, selectedCheckpointId]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const controls = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button, input, select, summary, [tabindex="0"]') ?? []).filter((item) => !item.hasAttribute("disabled") && item.getClientRects().length > 0);
    previousFocus.current = document.activeElement as HTMLElement | null;
    controls()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab") return;
      const items = controls(); const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previousFocus.current?.focus(); };
  }, []);

  async function runAction(kind: "compact" | "reconcile") {
    if (!selectedContext || action) return;
    const current = generation.current;
    setAction(kind); setError(""); setNotice("");
    try {
      if (kind === "compact") await contextApi.compactAgentContext(projectId, agentId, selectedContext.id);
      else await contextApi.reconcileAgentContext(projectId, agentId, selectedContext.id);
      if (generation.current !== current) return;
      setNotice(kind === "compact" ? "Compaction requested." : "Prior activity marked reconciled. A new request is now allowed.");
      setRefreshKey((value) => value + 1);
    } catch (reason) {
      if (generation.current === current) setError(errorText(reason));
    } finally {
      if (generation.current === current) setAction(null);
    }
  }

  const state = selectedContext ? stateFor(selectedContext) : null;
  const compactDisabled = !selectedContext || !!action || selectedContext.busy || selectedContext.pending || selectedContext.legacy;
  const reconcileDisabled = !selectedContext || !!action || !selectedContext.pending || selectedContext.busy || !confirmed;

  return createPortal(
    <div className="contextInspectorBackdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="contextInspector" role="dialog" aria-modal="true" aria-labelledby="contextInspectorTitle">
        <header className="contextInspectorHeader"><div><span className="contextKicker mono">Agent memory</span><h2 id="contextInspectorTitle">Context inspector</h2><p className="dim">Review what the app can see before starting a new request. Recent stored contexts.</p></div><button type="button" aria-label="Close context inspector" className="pillBtn iconBtn ghostBtn" onClick={onClose}>&times;</button></header>
        <div className="contextInspectorBody">
          {loading && <p className="contextStatus">Loading context records…</p>}
          {error && <div className="contextError" role="alert">{error}</div>}
          {notice && <div className="contextNotice" role="status">{notice}</div>}
          {!loading && !contexts.length && !error && <p className="contextStatus">No app-managed context records are available for this agent.</p>}
          {contexts.length > 0 && <><label className="contextField"><span className="fLabel">Context</span><select className="fInput" disabled={!!action} value={selectedContextId} onChange={(event) => setSelectedContextId(event.target.value)}>{contexts.map((context) => <option key={context.id} value={context.id}>{context.provider} · {context.model} · {context.surface} · task {taskSuffix(context.taskId)}</option>)}</select></label>
            {selectedContext && state && <><div className="contextStateRow"><span className={`contextState ${state.className}`}>{state.label}</span><span className="mono dim">{selectedContext.provider} · {selectedContext.model} · {selectedContext.surface}</span></div>
              <div className="contextFacts"><div><span className="fLabel">Estimated usage</span><strong>{tokens(selectedContext.estimatedTokens)}</strong><small>app estimate</small></div><div><span className="fLabel">Estimated budget</span><strong>{tokens(selectedContext.budgetTokens)}</strong><small>model window not verified</small></div><div><span className="fLabel">Measurement</span><strong>{selectedContext.measurement}</strong><small>token count is approximate</small></div></div>
              <section className="contextSection"><div className="contextSectionHead"><div><h3>Current context</h3><SummaryText value={selectedContext.summary} /><p className="contextActionHint">Manual compaction uses this agent’s model. The next request uses the saved summary in a fresh provider session; native private tool state is not carried.</p>{selectedContext.legacy && <p className="contextActionHint">Compaction is unavailable because this legacy context’s older native session history cannot be safely compacted.</p>}</div><button type="button" className="pillBtn ghostBtn mono" disabled={compactDisabled} onClick={() => void runAction("compact")}>{action === "compact" ? "compacting…" : "compact context"}</button></div><div className="contextLayers"><Layer label="Pinned" values={selectedContext.manifest.pinned} /><Layer label="Recent" values={selectedContext.manifest.recent} /><Layer label="Decisions" values={selectedContext.manifest.decisions} /><Layer label="Unresolved" values={selectedContext.manifest.unresolved} /></div></section>
              <section className="contextSection"><div className="contextSectionHead"><div><h3>Checkpoints</h3><p className="dim">Saved summaries are inspectable before any new request.</p></div><label className="contextCheckpointField"><span className="fLabel">Selected checkpoint</span><select className="fInput" disabled={!!action} value={selectedCheckpointId} onChange={(event) => setSelectedCheckpointId(event.target.value)}>{checkpoints.length ? checkpoints.map((checkpoint) => <option key={checkpoint.id} value={checkpoint.id}>{new Date(checkpoint.createdAt).toLocaleString()}</option>) : <option value="">No checkpoints</option>}</select></label></div>
                {selectedCheckpointId && <><div className="contextCheckpointSummary"><SummaryText value={checkpoints.find((checkpoint) => checkpoint.id === selectedCheckpointId)?.summary.summary ?? ""} /></div><button type="button" className="pillBtn ghostBtn mono" disabled={sourceLoading || !source} onClick={() => setShowSource((value) => !value)}>{sourceLoading ? "loading source…" : showSource ? "hide selected source" : "show selected source"}</button>{showSource && source && <pre className="contextSource">{JSON.stringify(source, null, 2)}</pre>}</>}</section>
              {selectedContext.pending && <section className="contextRecovery"><h3>Prior activity needs review</h3><p>The last request may have had external effects. Review the activity before allowing another request. This action does not replay or run anything automatically.</p>{selectedContext.pendingRequest && <details className="contextInterrupted" open><summary>Interrupted-state details</summary><span className="fLabel">Complete last submitted request</span><pre>{selectedContext.pendingRequest}</pre></details>}<label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I checked prior activity and external effects</label><button type="button" className="pillBtn fillBtn mono" disabled={reconcileDisabled} onClick={() => void runAction("reconcile")}>{action === "reconcile" ? "checking…" : "Allow a new request"}</button></section>}
            </>}</>}
        </div>
      </section>
    </div>, document.body,
  );
}
