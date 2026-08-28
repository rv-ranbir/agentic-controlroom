import { useEffect, useState } from "react";
import { useStore } from "../../store";
import type { Project } from "../../types";

export function EnvSkillsTab({ project }: { project: Project }) {
  const { refreshProjects } = useStore.getState();
  const [skills, setSkills] = useState<{ id: string; name: string }[]>([]);
  const [agentId, setAgentId] = useState(project.agents[0]?.id ?? "");

  useEffect(() => { void api.listSkills().then(setSkills); }, []);

  const agent = project.agents.find((a) => a.id === agentId);
  const attached = new Set(agent?.skillIds ?? []);

  const toggle = async (skillId: string) => {
    if (!agent) return;
    const next = attached.has(skillId) ? [...attached].filter((s) => s !== skillId) : [...attached, skillId];
    await api.setAgentSkills(project.id, agent.id, next);
    await refreshProjects();
  };

  if (skills.length === 0) return <div className="rvEmpty">No skills found. Add markdown files under skills/.</div>;

  return (
    <div style={{ maxWidth: 480 }}>
      <div className="fField">
        <span className="fLabel">Agent</span>
        <select className="fInput" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
          {project.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      {agent && skills.map((s) => (
        <label key={s.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 8 }}>
          <input type="checkbox" checked={attached.has(s.id)} onChange={() => void toggle(s.id)} />
          {s.name}
        </label>
      ))}
    </div>
  );
}
