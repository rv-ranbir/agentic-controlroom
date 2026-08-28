import { useState } from "react";
import { useStore } from "../store";
import { EnvTerminalTab } from "./env/EnvTerminalTab";
import { EnvTunnelTab } from "./env/EnvTunnelTab";
import { EnvDatabaseTab } from "./env/EnvDatabaseTab";
import { EnvSecretsTab } from "./env/EnvSecretsTab";
import { EnvSkillsTab } from "./env/EnvSkillsTab";
import { EnvMemoryTab } from "./env/EnvMemoryTab";

type Tab = "terminal" | "tunnel" | "database" | "secrets" | "skills" | "memory";
const TABS: { id: Tab; label: string }[] = [
  { id: "terminal", label: "Terminal" },
  { id: "tunnel", label: "Tunnel" },
  { id: "database", label: "Database" },
  { id: "secrets", label: "Secrets" },
  { id: "skills", label: "Skills" },
  { id: "memory", label: "Memory" },
];

export function Environment() {
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const project = useStore((s) => s.projects.find((p) => p.id === selectedProjectId));
  const { showView } = useStore.getState();
  const [tab, setTab] = useState<Tab>("terminal");

  if (!project) {
    return (
      <div className="viewRoot">
        <header className="rvHeader">
          <button className="pillBtn ghostBtn mono" onClick={() => showView("room")}>&larr; back</button>
        </header>
        <div className="rvEmpty">No project selected.</div>
      </div>
    );
  }

  return (
    <div className="viewRoot">
      <header className="rvHeader">
        <button className="pillBtn ghostBtn mono" onClick={() => showView("room")}>&larr; back</button>
        <span className="rvName">{project.name}</span>
        <span className="dim mono" style={{ fontSize: 10.5 }}>Environment</span>
      </header>
      <div className="segGroup" style={{ margin: "10px 16px" }}>
        {TABS.map((t) => (
          <div key={t.id} className={`segOpt${tab === t.id ? " on" : ""}`} onClick={() => setTab(t.id)}>{t.label}</div>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "0 16px 16px" }}>
        {tab === "terminal" && <EnvTerminalTab project={project} />}
        {tab === "tunnel" && <EnvTunnelTab project={project} />}
        {tab === "database" && <EnvDatabaseTab project={project} />}
        {tab === "secrets" && <EnvSecretsTab project={project} />}
        {tab === "skills" && <EnvSkillsTab project={project} />}
        {tab === "memory" && <EnvMemoryTab project={project} />}
      </div>
    </div>
  );
}
