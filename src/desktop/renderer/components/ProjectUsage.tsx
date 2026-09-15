import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Project } from "../types";
import type { UsageFilter, UsageReport, UsageRow } from "../../../harness/usage";
import "./ProjectUsage.css";

type FilterKey = keyof UsageFilter;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "agentId", label: "Agent" },
  { key: "model", label: "Model" },
  { key: "runId", label: "Run" },
];

function formatCount(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatDuration(value: number): string {
  if (!value) return "0 ms";
  if (value < 1000) return `${formatCount(value)} ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function label(value: string): string {
  return value.replace(/[-_]/g, " ");
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function rowSource(row: UsageRow): string {
  return row.source === "provider" ? "measured" : row.source;
}

export function ProjectUsage({ project }: { project: Project }) {
  const [report, setReport] = useState<UsageReport | null>(null);
  const [options, setOptions] = useState<UsageReport | null>(null);
  const [filter, setFilter] = useState<UsageFilter>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState<"json" | "csv" | "">("");
  const generation = useRef(0);
  const mounted = useRef(false);
  const filterRef = useRef<UsageFilter>({});
  const requestId = useRef(0);
  const pollInFlight = useRef(false);

  const load = useCallback(async (nextFilter: UsageFilter, initial = false) => {
    const requestGeneration = generation.current;
    const currentRequest = ++requestId.current;
    try {
      const hasFilter = Object.values(nextFilter).some((value) => value !== undefined);
      const [next, nextOptions] = await Promise.all([
        api.getProjectUsage(project.id, nextFilter),
        hasFilter ? api.getProjectUsage(project.id) : Promise.resolve(null),
      ]);
      if (!mounted.current || requestGeneration !== generation.current || currentRequest !== requestId.current) return;
      setReport(next);
      setOptions(nextOptions ?? next);
      setError("");
      if (initial) setLoading(false);
    } catch (cause) {
      if (!mounted.current || requestGeneration !== generation.current || currentRequest !== requestId.current) return;
      setError(errorMessage(cause));
      if (initial) setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    mounted.current = true;
    generation.current += 1;
    requestId.current += 1;
    setReport(null);
    setOptions(null);
    setFilter({});
    filterRef.current = {};
    setLoading(true);
    setError("");
    void load({}, true);
    const timer = window.setInterval(() => {
      if (pollInFlight.current) return;
      pollInFlight.current = true;
      void load(filterRef.current).finally(() => { pollInFlight.current = false; });
    }, 2000);
    return () => {
      mounted.current = false;
      generation.current += 1;
      requestId.current += 1;
      pollInFlight.current = false;
      window.clearInterval(timer);
    };
  }, [load, project.id]);

  const optionValues = useMemo(() => ({
    agentId: Array.from(new Set(options?.rows.map((row) => row.agentId) ?? [])).filter(Boolean),
    model: Array.from(new Set(options?.rows.map((row) => row.model) ?? [])).filter(Boolean),
    runId: Array.from(new Set(options?.rows.map((row) => row.runId) ?? [])).filter(Boolean),
  }), [options]);

  const setFilterValue = (key: FilterKey, value: string) => {
    const next = { ...filter };
    if (value) next[key] = value;
    else delete next[key];
    generation.current += 1;
    requestId.current += 1;
    setExporting("");
    setFilter(next);
    filterRef.current = next;
    setLoading(true);
    void load(next, true);
  };

  const exportReport = async (format: "json" | "csv") => {
    const exportGeneration = generation.current;
    setExporting(format);
    setError("");
    try {
      await api.saveProjectUsage(project.id, format, filter);
    } catch (cause) {
      if (mounted.current && exportGeneration === generation.current) setError(errorMessage(cause));
    } finally {
      if (mounted.current && exportGeneration === generation.current) setExporting("");
    }
  };

  const current = report?.totals;

  return (
    <section className="projectUsage" aria-labelledby="project-usage-title">
      <div className="projectUsageHead">
        <div>
          <h2 id="project-usage-title">Usage</h2>
          <p className="dim">Measured provider data retained for this project.</p>
        </div>
        <div className="projectUsageExports" aria-label="Export usage">
          <button type="button" className="pillBtn ghostBtn" disabled={!!exporting || !report} onClick={() => void exportReport("json")}>{exporting === "json" ? "exporting…" : "JSON"}</button>
          <button type="button" className="pillBtn ghostBtn" disabled={!!exporting || !report} onClick={() => void exportReport("csv")}>{exporting === "csv" ? "exporting…" : "CSV"}</button>
        </div>
      </div>

      <div className="projectUsageFilters" aria-label="Usage filters">
        {FILTERS.map(({ key, label: filterLabel }) => (
          <label key={key}>
            <span className="fLabel">{filterLabel}</span>
            <select className="fInput" aria-label={filterLabel} value={filter[key] ?? ""} onChange={(event) => setFilterValue(key, event.target.value)}>
              <option value="">All {filterLabel.toLowerCase()}s</option>
              {optionValues[key].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        ))}
      </div>

      {error && <div className="projectUsageError" role="alert">Could not load usage: {error}</div>}
      {loading && !report ? <p className="executionEmpty">Loading usage…</p> : report && current ? <>
        <div className="projectUsageFacts" aria-label="Usage totals">
          <div className="projectUsageUnknown"><strong>{formatCount(current.unknownAttempts)}</strong><span>unknown attempts</span></div>
          <div><strong>{formatCount(current.knownInput)}</strong><span>measured input tokens</span></div>
          <div><strong>{formatCount(current.knownOutput)}</strong><span>measured output tokens</span></div>
          <div><strong>{formatDuration(current.durationMs)}</strong><span>total latency</span></div>
          <div><strong>{formatCount(current.toolCalls)}</strong><span>tool calls</span></div>
          <div><strong>{formatCount(current.attempts)}</strong><span>attempts</span></div>
        </div>

        {report.rows.length === 0 ? <p className="executionEmpty">No usage records match these filters.</p> : <div className="projectUsageTableWrap">
          <table className="projectUsageTable">
            <caption>Usage attempts</caption>
            <thead><tr><th scope="col">Attempt</th><th scope="col">Provider / model</th><th scope="col">Tokens</th><th scope="col">Latency</th><th scope="col">Status</th></tr></thead>
            <tbody>{report.rows.slice(0, 200).map((row) => <tr key={row.attemptId}>
              <td><span className="mono">{row.runId.slice(0, 8)}</span><small>{new Date(row.timestamp).toLocaleString()}</small></td>
              <td><strong>{row.provider || "Unknown provider"}</strong><small>{row.model || "Unknown model"}</small><span className="projectUsageTags"><span>{rowSource(row)}</span><span>{label(row.billing)}</span>{row.purpose === "compaction" && <span>context summary</span>}</span></td>
              <td><span className="mono">{row.input === null ? "—" : formatCount(row.input)} in · {row.output === null ? "—" : formatCount(row.output)} out</span><small>{row.cacheRead === null ? "cache —" : `cache read ${formatCount(row.cacheRead)}`} · {row.reasoning === null ? "reasoning —" : `reasoning ${formatCount(row.reasoning)}`}</small></td>
              <td className="mono">{row.durationMs === null ? "unavailable" : formatDuration(row.durationMs)}</td>
              <td><span className={`projectUsageStatus ${row.status === "completed" ? "complete" : row.status === "failed" ? "failed" : "pending"}`}>{label(row.status)}</span>{row.reportedCost !== null && <small>reported {row.reportedCost} {row.currency ?? "currency unknown"}</small>}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        <p className="projectUsageRetention">Showing up to 200 attempts; exports include all matching retained attempts. Cache and reasoning are separate details, not extra tokens to add to these totals. Compaction and retry overhead are unavailable until those operations are tracked separately.</p>
        <p className="projectUsageRetention">{report.retention} Charges are not estimated; reported cost is shown only when supplied by the provider.</p>
      </> : !error && <p className="executionEmpty">Usage is unavailable.</p>}
    </section>
  );
}
