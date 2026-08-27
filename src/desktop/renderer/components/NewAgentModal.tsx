import { useState } from "react";
import { useStore } from "../store";
import { colorFor, initials } from "../lib/agents";
import type { Project } from "../types";

const ENGINES: { id: string; label: string }[] = [
  { id: "cursor", label: "Cursor CLI" },
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex" },
];
const MODELS = [
  { id: "", label: "Default" },
  { id: "opus", label: "Opus" },
  { id: "sonnet", label: "Sonnet" },
  { id: "haiku", label: "Haiku" },
  { id: "custom", label: "Custom…" },
];

export function NewAgentModal({ onClose }: { onClose: () => void }) {
  const roles = useStore((s) => s.roles);
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const project = useStore((s) => s.projects.find((p) => p.id === selectedProjectId));
  const { addAgent, addCustomAgent, updateProjectBackend, showToast, refreshProjects } = useStore.getState();

  const [ctab, setCtab] = useState<"template" | "custom">("template");
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [cName, setCName] = useState("");
  const [cRules, setCRules] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [engine, setEngine] = useState<string>(project?.backend ?? "cursor");
  const [model, setModel] = useState("");
  const [modelCustom, setModelCustom] = useState("");
  const [ctx, setCtx] = useState<"standard" | "large">("standard");
  const [effort, setEffort] = useState<"medium" | "high">("medium");
  const [advOpenBody, setAdvOpenBody] = useState(false);
  const [advOpenNow, setAdvOpenNow] = useState(false);
  const [advWorktree, setAdvWorktree] = useState(false);
  const [advBrowser, setAdvBrowser] = useState(false);
  const [advFlags, setAdvFlags] = useState("");
  const [advPrompt, setAdvPrompt] = useState("");

  if (!project) return null;

  async function create() {
    if (engine === "codex") { showToast("Codex engine — not wired yet"); return; }
    if (engine !== project!.backend) updateProjectBackend(project!.id, engine as Project["backend"]);
    const finalModel = model === "custom" ? modelCustom.trim() : model;
    const override = advPrompt.trim();
    const extraArgs = advFlags.trim() ? advFlags.trim().split(/\s+/) : undefined;

    if (ctab === "custom") {
      const name = cName.trim() || "Custom agent";
      const rules = cRules.trim();
      const skillsLine = skills.length ? `Skills: ${skills.join(", ")}` : "";
      const systemPrompt = override || [rules, skillsLine].filter(Boolean).join("\n\n") || `You are ${name}.`;
      await addCustomAgent(name, systemPrompt, finalModel || undefined, extraArgs);
    } else if (override) {
      const role = roles.find((r) => r.id === selectedRoleId);
      await addCustomAgent(role?.name ?? "Custom agent", override, finalModel || undefined, extraArgs);
    } else {
      if (!selectedRoleId) { showToast("Pick a role"); return; }
      await addAgent(selectedRoleId, finalModel || undefined, extraArgs);
    }
    await refreshProjects();
    onClose();
  }

  return (
    <div className="dialogBackdrop open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div id="modalBox" className="dialogBox">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>New agent &mdash; <span className="dim" style={{ fontFamily: "var(--font-body)", fontSize: 13 }}>{project.name}</span></h3>
          <button className="pillBtn iconBtn ghostBtn" onClick={onClose}>&times;</button>
        </div>

        <div className="segGroup" style={{ marginBottom: 14 }}>
          <div className={`segOpt${ctab === "template" ? " on" : ""}`} onClick={() => setCtab("template")}>From template</div>
          <div className={`segOpt${ctab === "custom" ? " on" : ""}`} onClick={() => setCtab("custom")}>Custom</div>
        </div>

        {ctab === "template" && (
          <div className="fField">
            <span className="fLabel">Role</span>
            <div className="roleGrid">
              {roles.map((r) => {
                const taken = project.agents.some((a) => a.id === r.id);
                return (
                  <div
                    key={r.id}
                    className={`roleOpt${taken ? " taken" : ""}${selectedRoleId === r.id ? " chosen" : ""}`}
                    onClick={() => !taken && setSelectedRoleId(r.id)}
                  >
                    <div className="monogram mono" style={{ width: 26, height: 26, fontSize: 10, background: colorFor(r.id) }}>{initials(r.name)}</div>
                    <span>{r.name}{taken ? " (added)" : ""}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {ctab === "custom" && (
          <>
            <div className="fField"><span className="fLabel">Name</span>
              <input className="fInput" placeholder="e.g. Migration bot" value={cName} onChange={(e) => setCName(e.target.value)} />
            </div>
            <div className="fField"><span className="fLabel">Rules — how should it behave</span>
              <textarea className="fInput" rows={4} placeholder="You are..." value={cRules} onChange={(e) => setCRules(e.target.value)} />
            </div>
            <div className="fField">
              <span className="fLabel">Skills</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                {skills.map((s, i) => (
                  <span className="chip" key={i}>
                    <span>{s}</span>
                    <span className="x" onClick={() => setSkills(skills.filter((_, j) => j !== i))}>&times;</span>
                  </span>
                ))}
              </div>
              <input
                className="fInput"
                placeholder="Type a skill, press Enter"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const v = skillInput.trim();
                  if (v) setSkills([...skills, v]);
                  setSkillInput("");
                }}
              />
            </div>
          </>
        )}

        <div className="fField">
          <span className="fLabel">Engine</span>
          <div className="segGroup">
            {ENGINES.map((e) => (
              <div key={e.id} className={`segOpt${engine === e.id ? " on" : ""}`} title={e.id === "codex" ? "Not wired yet" : undefined} onClick={() => setEngine(e.id)}>
                {e.label}
              </div>
            ))}
          </div>
        </div>

        <div className="fField">
          <span className="fLabel">Model</span>
          <div className="segGroup">
            {MODELS.map((m) => (
              <div key={m.id} className={`segOpt${model === m.id ? " on" : ""}`} onClick={() => setModel(m.id)}>{m.label}</div>
            ))}
          </div>
          {model === "custom" && (
            <input className="fInput mono" style={{ marginTop: 6 }} placeholder="model id" value={modelCustom} onChange={(e) => setModelCustom(e.target.value)} />
          )}
        </div>

        <div style={{ display: "flex", gap: 14 }}>
          <div className="fField" style={{ flex: 1 }}>
            <span className="fLabel">Context window</span>
            <div className="segGroup">
              <div className={`segOpt${ctx === "standard" ? " on" : ""}`} onClick={() => setCtx("standard")}>Standard</div>
              <div className={`segOpt${ctx === "large" ? " on" : ""}`} onClick={() => setCtx("large")}>Large</div>
            </div>
          </div>
          <div className="fField" style={{ flex: 1 }}>
            <span className="fLabel">Reasoning effort</span>
            <div className="segGroup">
              <div className={`segOpt${effort === "medium" ? " on" : ""}`} onClick={() => setEffort("medium")}>Medium</div>
              <div className={`segOpt${effort === "high" ? " on" : ""}`} onClick={() => setEffort("high")}>High</div>
            </div>
          </div>
        </div>

        <div className="fField">
          <div style={{ cursor: "pointer", fontSize: 11, color: "var(--ink-70)" }} onClick={() => setAdvOpenBody(!advOpenBody)}>
            <span>{advOpenBody ? "▾" : "▸"}</span> Advanced options
          </div>
          {advOpenBody && (
            <div style={{ marginTop: 10 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, marginBottom: 6 }}>
                <input type="checkbox" checked={advOpenNow} onChange={(e) => setAdvOpenNow(e.target.checked)} /> Open right away
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, marginBottom: 6 }}>
                <input type="checkbox" checked={advWorktree} onChange={(e) => setAdvWorktree(e.target.checked)} /> New worktree per agent
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, marginBottom: 10 }}>
                <input type="checkbox" checked={advBrowser} onChange={(e) => setAdvBrowser(e.target.checked)} /> Browser access
              </label>
              <div className="fField"><span className="fLabel">CLI flags</span>
                <input className="fInput mono" placeholder="--flag value" value={advFlags} onChange={(e) => setAdvFlags(e.target.value)} />
              </div>
              <div className="fField"><span className="fLabel">System prompt override</span>
                <textarea className="fInput" rows={3} placeholder="Inherits role default" value={advPrompt} onChange={(e) => setAdvPrompt(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button className="pillBtn ghostBtn" onClick={onClose}>cancel</button>
          <button className="pillBtn fillBtn" onClick={() => void create()}>create agent</button>
        </div>
      </div>
    </div>
  );
}
