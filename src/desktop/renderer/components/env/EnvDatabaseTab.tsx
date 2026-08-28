import { useState } from "react";
import { useStore } from "../../store";
import type { Project } from "../../types";

export function EnvDatabaseTab({ project }: { project: Project }) {
  const { refreshProjects } = useStore.getState();
  const [sql, setSql] = useState("SELECT * FROM sqlite_master LIMIT 20;");
  const [result, setResult] = useState<{ columns: string[]; rows: unknown[][] } | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  const choose = async () => {
    const path = await api.pickDbFile();
    if (!path) return;
    await api.setDbPath(project.id, path);
    await refreshProjects();
  };

  const run = async () => {
    setError(""); setRunning(true);
    try {
      setResult(await api.runDbQuery(project.id, sql));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0 }}>
      <div className="fField">
        <span className="fLabel">Database file</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="mono dim" style={{ fontSize: 12 }}>{project.dbPath ?? "none selected"}</span>
          <button className="pillBtn ghostBtn" onClick={() => void choose()}>choose…</button>
        </div>
      </div>
      <div className="fField">
        <span className="fLabel">SELECT query</span>
        <textarea className="fInput mono" rows={3} value={sql} onChange={(e) => setSql(e.target.value)} />
      </div>
      <div>
        <button className="pillBtn fillBtn" disabled={running || !project.dbPath} onClick={() => void run()}>
          {running ? "running…" : "run query"}
        </button>
      </div>
      {error && <div className="dim" style={{ color: "var(--danger, #c0392b)", fontSize: 12 }}>{error}</div>}
      {result && (
        <div style={{ overflow: "auto", flex: 1, minHeight: 0, border: "1px solid var(--rule)", borderRadius: 8 }}>
          <table className="mono" style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
            <thead>
              <tr>{result.columns.map((c) => <th key={c} style={{ textAlign: "left", padding: "6px 10px", borderBottom: "1px solid var(--rule)" }}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i}>{row.map((cell, j) => <td key={j} style={{ padding: "5px 10px", borderBottom: "1px solid var(--rule)" }}>{String(cell)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
