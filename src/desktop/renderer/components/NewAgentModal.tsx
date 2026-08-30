import { useEffect, useState } from "react";
import {
  Accessibility, Activity, Award, Bot, BrainCircuit, ClipboardList, Compass, Database, FileText,
  FlaskConical, Gauge, Infinity as InfinityIcon, Languages, Layers, LayoutPanelLeft, LifeBuoy, Lock,
  PenLine, Server, ShieldCheck, Smartphone, TrendingUp, Users, type LucideIcon,
} from "lucide-react";
import { useStore } from "../store";
import { colorFor, initials } from "../lib/agents";
import type { LibraryAgent, Project } from "../types";

const ENGINES: { id: string; label: string }[] = [
  { id: "cursor", label: "Cursor CLI" },
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex" },
];
const MODELS = [
  { id: "", label: "Default", hint: "project default" },
  { id: "opus", label: "Opus", hint: "most capable" },
  { id: "sonnet", label: "Sonnet", hint: "balanced" },
  { id: "haiku", label: "Haiku", hint: "fastest" },
  { id: "custom", label: "Custom…", hint: "your own model id" },
];

// Groups + icons for the role picker — matches the design handoff's ROLE_GROUPS/ROLE_ICONS.
// Role content itself (name, system prompt) lives in roles/*.md; this table is purely
// presentation, same as the design's own hardcoded JS constants.
const ROLE_GROUPS: { label: string; ids: string[] }[] = [
  { label: "Core team", ids: ["dev", "frontend", "backend", "qa", "devops", "security", "architect", "pm", "sm", "fullstack", "lead"] },
  { label: "Specialists", ids: ["ml-engineer", "data-engineer", "mobile", "ux-writer", "accessibility", "performance", "localization", "playwright"] },
  { label: "Community", ids: ["tech-writer", "sre", "growth", "support-triage"] },
];
const ROLE_ICONS: Record<string, LucideIcon> = {
  dev: Bot, frontend: LayoutPanelLeft, backend: Server, qa: ShieldCheck, devops: InfinityIcon,
  security: Lock, architect: Compass, pm: ClipboardList, sm: Users, fullstack: Layers, lead: Award,
  "ml-engineer": BrainCircuit, "data-engineer": Database, mobile: Smartphone, "ux-writer": PenLine,
  accessibility: Accessibility, performance: Gauge, localization: Languages, playwright: FlaskConical,
  "tech-writer": FileText, sre: Activity, growth: TrendingUp, "support-triage": LifeBuoy,
};

export function NewAgentModal({ onClose }: { onClose: () => void }) {
  const roles = useStore((s) => s.roles);
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const project = useStore((s) => s.projects.find((p) => p.id === selectedProjectId));
  const { addAgent, addCustomAgent, updateProjectBackend, showToast, refreshProjects } = useStore.getState();

  const [ctab, setCtab] = useState<"template" | "library" | "custom">("template");
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [roleSearch, setRoleSearch] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(["Core team"]));
  const [library, setLibrary] = useState<LibraryAgent[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [saveToLibrary, setSaveToLibrary] = useState(false);

  useEffect(() => { void api.listLibrary().then(setLibrary); }, []);
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
      await addCustomAgent(name, systemPrompt, finalModel || undefined, extraArgs, advWorktree);
      if (saveToLibrary) await api.addToLibrary(name, systemPrompt, finalModel || undefined, extraArgs, skills.length ? skills : undefined);
    } else if (ctab === "library") {
      const entry = library.find((l) => l.id === selectedLibraryId);
      if (!entry) { showToast("Pick a library agent"); return; }
      await addCustomAgent(entry.name, entry.systemPrompt, finalModel || entry.model, extraArgs ?? entry.extraArgs, advWorktree);
    } else if (override) {
      const role = roles.find((r) => r.id === selectedRoleId);
      await addCustomAgent(role?.name ?? "Custom agent", override, finalModel || undefined, extraArgs, advWorktree);
    } else {
      if (!selectedRoleId) { showToast("Pick a role"); return; }
      await addAgent(selectedRoleId, finalModel || undefined, extraArgs, advWorktree);
    }
    await refreshProjects();
    onClose();
  }

  return (
    <div className="dialogBackdrop open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div id="modalBox" className="dialogBox">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>New agent <span className="dim" style={{ fontFamily: "var(--font-body)", fontSize: 13 }}>&mdash; adds to {project.name}</span></h3>
          <button className="pillBtn iconBtn ghostBtn" onClick={onClose}>&times;</button>
        </div>

        <div className="segGroup" style={{ marginBottom: 14 }}>
          <div className={`segOpt${ctab === "template" ? " on" : ""}`} onClick={() => setCtab("template")}>From template</div>
          <div className={`segOpt${ctab === "library" ? " on" : ""}`} onClick={() => setCtab("library")}>From library</div>
          <div className={`segOpt${ctab === "custom" ? " on" : ""}`} onClick={() => setCtab("custom")}>Custom</div>
        </div>

        {ctab === "library" && (
          <div className="fField">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
              <span className="fLabel" style={{ marginBottom: 0 }}>Your agent library <span style={{ textTransform: "none", letterSpacing: 0 }}>&mdash; reusable in any project</span></span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="dim mono" style={{ fontSize: 10.5 }}>{library.length} saved</span>
                <button
                  className="pillBtn ghostBtn mono"
                  style={{ fontSize: 10 }}
                  onClick={() => { setCtab("custom"); setSaveToLibrary(true); }}
                >
                  + new
                </button>
              </div>
            </div>
            {library.length === 0 && (
              <div className="dim" style={{ fontSize: 12.5, padding: "12px 0" }}>
                Nothing saved yet — click "+ new" above to define one.
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {library.map((l) => {
                const on = selectedLibraryId === l.id;
                return (
                  <div
                    key={l.id}
                    onClick={() => setSelectedLibraryId(l.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", cursor: "pointer",
                      background: on ? "var(--ink-16)" : "var(--paper)", border: `1px solid ${on ? "var(--ink-50)" : "var(--rule)"}`, borderRadius: 8,
                    }}
                  >
                    <div className="monogram mono" style={{ width: 24, height: 24, fontSize: 9.5, flexShrink: 0, background: colorFor(l.id) }}>{initials(l.name)}</div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ font: "600 12.5px/1.3 var(--font-body)", color: "var(--ink)" }}>{l.name}</div>
                      <div className="dim" style={{ fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.systemPrompt}</div>
                    </div>
                    <button
                      className="pillBtn ghostBtn mono"
                      style={{ fontSize: 10, flexShrink: 0 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        void api.removeFromLibrary(l.id).then(() => setLibrary((ls) => ls.filter((x) => x.id !== l.id)));
                      }}
                    >
                      remove
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {ctab === "template" && (
          <div className="fField">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
              <span className="fLabel" style={{ marginBottom: 0 }}>Agent template</span>
              <span className="dim mono" style={{ fontSize: 10.5 }}>{roles.length} available</span>
            </div>
            <input
              className="fInput"
              style={{ marginBottom: 12 }}
              placeholder="Search templates by name or skill…"
              value={roleSearch}
              onChange={(e) => setRoleSearch(e.target.value)}
            />
            {(() => {
              const q = roleSearch.trim().toLowerCase();
              const byId = new Map(roles.map((r) => [r.id, r]));
              const grouped = new Set<string>();
              const groups = ROLE_GROUPS.map((g) => {
                const entries = g.ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r);
                entries.forEach((r) => grouped.add(r.id));
                return { label: g.label, roles: entries };
              });
              const other = roles.filter((r) => !grouped.has(r.id));
              if (other.length) groups.push({ label: "Other", roles: other });
              return groups
                .map((g) => ({ ...g, roles: g.roles.filter((r) => !q || r.name.toLowerCase().includes(q) || r.id.includes(q)) }))
                .filter((g) => g.roles.length > 0)
                .map((g) => {
                  const isOpen = q.length > 0 || openGroups.has(g.label);
                  return (
                  <div key={g.label} style={{ marginBottom: 8, border: "1px solid var(--rule)", borderRadius: 8, overflow: "hidden" }}>
                    <div
                      className="dim mono"
                      style={{
                        display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none",
                        fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase", padding: "8px 10px",
                        background: "var(--sink)",
                      }}
                      onClick={() => setOpenGroups((prev) => {
                        const next = new Set(prev);
                        if (next.has(g.label)) next.delete(g.label); else next.add(g.label);
                        return next;
                      })}
                    >
                      <span style={{ fontSize: 9, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .1s" }}>&#9656;</span>
                      {g.label} <span style={{ opacity: .7 }}>&middot; {g.roles.length}</span>
                    </div>
                    {isOpen && (
                    <div className="roleGrid" style={{ padding: 9 }}>
                      {g.roles.map((r) => {
                        const count = project.agents.filter((a) => a.roleId === r.id || a.id === r.id).length;
                        const Icon = ROLE_ICONS[r.id] ?? Bot;
                        const on = selectedRoleId === r.id;
                        return (
                          <div key={r.id} className={`roleOpt${on ? " chosen" : ""}`} onClick={() => setSelectedRoleId(r.id)}>
                            <Icon size={18} color={on ? "var(--ink)" : "var(--ink-50)"} />
                            <div className="monogram mono" style={{ width: 26, height: 26, fontSize: 10, background: colorFor(r.id) }}>{initials(r.name)}</div>
                            <span>{r.name}{count > 0 ? ` (${count})` : ""}</span>
                          </div>
                        );
                      })}
                    </div>
                    )}
                  </div>
                  );
                });
            })()}
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
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, cursor: "pointer" }}>
              <input type="checkbox" checked={saveToLibrary} onChange={(e) => setSaveToLibrary(e.target.checked)} />
              Save to agent library (reusable in any project)
            </label>
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {MODELS.map((m) => {
              const on = model === m.id;
              return (
                <div
                  key={m.id}
                  onClick={() => setModel(m.id)}
                  style={{
                    textAlign: "left", cursor: "pointer", minWidth: 90,
                    font: "600 12px/1.3 var(--font-body)", color: on ? "var(--ink)" : "var(--ink-70)",
                    background: on ? "var(--ink-16)" : "var(--paper)",
                    border: `1px solid ${on ? "var(--ink-50)" : "var(--rule)"}`,
                    borderRadius: 8, padding: "9px 13px",
                  }}
                >
                  <span style={{ display: "block" }}>{m.label}</span>
                  <span className="mono" style={{ display: "block", fontSize: 10, color: "var(--ink-34)", marginTop: 3 }}>{m.hint}</span>
                </div>
              );
            })}
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
