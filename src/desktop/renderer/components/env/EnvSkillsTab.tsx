import { useEffect, useState } from "react";
import { useStore } from "../../store";
import type { Project } from "../../types";

export function EnvSkillsTab({ project }: { project: Project }) {
  const { refreshProjects, showToast } = useStore.getState();
  const [skills, setSkills] = useState<{ id: string; name: string }[]>([]);
  const [agentId, setAgentId] = useState(project.agents[0]?.id ?? "");
  const [githubUrl, setGithubUrl] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => { void api.listSkills().then(setSkills); }, []);

  const importFromGithub = async () => {
    if (!githubUrl.trim()) return;
    setImporting(true);
    try {
      const skill = await api.importSkillFromGithub(githubUrl.trim());
      setSkills((s) => [...s, skill]);
      setGithubUrl("");
      showToast(`Imported skill "${skill.name}"`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  };

  const agent = project.agents.find((a) => a.id === agentId);
  const attached = new Set(agent?.skillIds ?? []);

  const toggle = async (skillId: string) => {
    if (!agent) return;
    const next = attached.has(skillId) ? [...attached].filter((s) => s !== skillId) : [...attached, skillId];
    await api.setAgentSkills(project.id, agent.id, next);
    await refreshProjects();
  };

  return (
    <div style={{ maxWidth: 480 }}>
      <div className="fField">
        <span className="fLabel">Import from GitHub</span>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            className="fInput mono"
            style={{ flex: 1 }}
            placeholder="https://github.com/org/repo/blob/main/skill.md"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void importFromGithub(); }}
          />
          <button className="pillBtn fillBtn mono" disabled={importing || !githubUrl.trim()} onClick={() => void importFromGithub()}>
            {importing ? "importing…" : "import"}
          </button>
        </div>
        <p className="dim" style={{ fontSize: 11, marginTop: 6 }}>
          github.com or raw.githubusercontent.com only. npx-package skills aren't supported yet.
        </p>
      </div>
      {skills.length === 0 && <div className="rvEmpty">No skills found. Add markdown files under skills/, or import one above.</div>}
      {skills.length > 0 && (
        <div className="fField">
          <span className="fLabel">Agent</span>
          <select className="fInput" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            {project.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      )}
      {agent && skills.map((s) => (
        <label key={s.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 8 }}>
          <input type="checkbox" checked={attached.has(s.id)} onChange={() => void toggle(s.id)} />
          {s.name}
        </label>
      ))}
    </div>
  );
}
