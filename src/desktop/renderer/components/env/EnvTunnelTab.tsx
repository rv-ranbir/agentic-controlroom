import { useEffect, useState } from "react";
import type { Project } from "../../types";

export function EnvTunnelTab({ project }: { project: Project }) {
  const [port, setPort] = useState("3000");
  const [running, setRunning] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    void api.getTunnelStatus(project.id).then(setRunning);
    return api.onTunnelEvent((e) => {
      if (e.projectId !== project.id) return;
      if (e.kind === "url") { setUrl(e.url ?? ""); setRunning(true); setStarting(false); }
      if (e.kind === "stopped") { setRunning(false); setUrl(""); }
      if (e.kind === "error") { setError(e.message ?? "Tunnel error"); setRunning(false); setStarting(false); }
    });
  }, [project.id]);

  const start = async () => {
    setError(""); setUrl(""); setStarting(true);
    try {
      await api.startTunnel(project.id, Number(port) || 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStarting(false);
    }
  };

  const stop = async () => {
    await api.stopTunnel(project.id);
    setRunning(false);
    setUrl("");
  };

  return (
    <div className="fField" style={{ maxWidth: 480 }}>
      <span className="fLabel">Local port</span>
      <div style={{ display: "flex", gap: 8 }}>
        <input className="fInput mono" style={{ width: 100 }} value={port} disabled={running || starting} onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))} />
        {!running
          ? <button className="pillBtn fillBtn" disabled={starting} onClick={() => void start()}>{starting ? "starting…" : "start tunnel"}</button>
          : <button className="pillBtn ghostBtn" onClick={() => void stop()}>stop tunnel</button>}
      </div>
      {url && (
        <div className="fField">
          <span className="fLabel">Public URL</span>
          <div className="chip mono" style={{ display: "inline-flex" }}>
            <span>{url}</span>
            <span className="x" onClick={() => void navigator.clipboard.writeText(url)} title="Copy">&#x2398;</span>
          </div>
        </div>
      )}
      {error && <div className="dim" style={{ color: "var(--danger, #c0392b)", fontSize: 12, marginTop: 8 }}>{error}</div>}
      <p className="dim" style={{ fontSize: 11, marginTop: 14 }}>Uses cloudflared's quick tunnels — no account needed. Install it to enable this.</p>
    </div>
  );
}
