import { TopBar } from "./TopBar";
import { useState } from "react";
import { useStore } from "../store";
import { EnvTerminalTab } from "./env/EnvTerminalTab";
import { EnvTunnelTab } from "./env/EnvTunnelTab";
import { EnvDatabaseTab } from "./env/EnvDatabaseTab";
import { EnvSecretsTab } from "./env/EnvSecretsTab";
import { EnvSkillsTab } from "./env/EnvSkillsTab";
import { EnvMemoryTab } from "./env/EnvMemoryTab";
import { ExecutionPolicyPanel } from "./ExecutionPolicyPanel";

type Tab = "terminal" | "tunnel" | "database" | "secrets" | "skills" | "memory" | "execution";
const TABS: { id: Tab; label: string }[] = [
  { id: "terminal", label: "Terminal" },
  { id: "tunnel", label: "Tunnel" },
  { id: "database", label: "Database" },
  { id: "secrets", label: "Secrets" },
  { id: "skills", label: "Skills" },
  { id: "memory", label: "Memory" },
  { id: "execution", label: "Execution" },
];

export function Environment() {
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const project = useStore((s) => s.projects.find((p) => p.id === selectedProjectId));
  const { showView } = useStore.getState();
  const [tab, setTab] = useState<Tab>("terminal");

  if (!project) {
    return (
      <div className="viewRoot workspaceView viewEnvironment">
      <TopBar />
        <header className="rvHeader">
          <button className="pillBtn ghostBtn mono" onClick={() => showView("room")}>&larr; back</button>
        </header>
        <div className="rvEmpty">No project selected.</div>
      </div>
    );
  }

  return (
    <div className="viewRoot workspaceView viewEnvironment">
      <TopBar />
      <header className="rvHeader">
        <button className="pillBtn ghostBtn mono" onClick={() => showView("room")}>&larr; back</button>
        <span className="rvName">{project.name}</span>
        <span className="dim mono" style={{ fontSize: 10.5 }}>Environment</span>
      </header>
      <div className="segGroup environmentTabs" role="tablist" aria-label="Environment tools">
        {TABS.map((t) => (
          <button type="button" role="tab" aria-selected={tab === t.id} key={t.id} className={`segOpt${tab === t.id ? " on" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      <div className="environmentContent" role="tabpanel" aria-label={TABS.find(t=>t.id===tab)?.label}>
        {tab === "terminal" && <EnvTerminalTab project={project} />}
        {tab === "tunnel" && <EnvTunnelTab project={project} />}
        {tab === "database" && <EnvDatabaseTab project={project} />}
        {tab === "secrets" && <EnvSecretsTab project={project} />}
        {tab === "skills" && <EnvSkillsTab project={project} />}
        {tab === "memory" && <EnvMemoryTab project={project} />}
        {tab === "execution" && <ExecutionPolicyPanel project={project} />}
      </div>
    </div>
  );
}
