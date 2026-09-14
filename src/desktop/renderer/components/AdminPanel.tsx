import "./Settings.css";
import { AppearanceSettings } from "./AppearanceSettings";
import { useEffect, useState } from "react";
import { useStore } from "../store";
import { colorFor, initials } from "../lib/agents";
import { BACKENDS } from "../lib/backends";
import type { AdminConfig, LibraryAgent, Project, TeamMember } from "../types";

export function AdminPanel() {
  const roles = useStore((s) => s.roles);
  const projects = useStore((s) => s.projects);
  const { showView, showToast, refreshProjects } = useStore.getState();

  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [library, setLibrary] = useState<LibraryAgent[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [newCategoryLabel, setNewCategoryLabel] = useState("");
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentPrompt, setNewAgentPrompt] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = () => {
    void api.getAdminConfig().then(setConfig);
    void api.listLibrary().then(setLibrary);
  };
  useEffect(refresh, []);

  const project = projects.find((p) => p.id === projectId) ?? null;

  if (!config) {
    return (
      <div className="viewRoot settingsRoot">
        <header className="rvHeader">
          <button className="pillBtn ghostBtn mono" onClick={() => showView("launcher")}>&larr; back</button>
        </header>
        <div className="rvEmpty">Loading admin config&hellip;</div>
      </div>
    );
  }

  const toggleGlobal = (id: Project["backend"]) => {
    const next = config.globalAllowlist.includes(id) ? config.globalAllowlist.filter((b) => b !== id) : [...config.globalAllowlist, id];
    void api.setGlobalAllowlist(next).then(setConfig);
  };

  const toggleProjectAllow = (id: Project["backend"]) => {
    if (!project) return;
    const current = project.allowedBackends ?? config.globalAllowlist;
    const next = current.includes(id) ? current.filter((b) => b !== id) : [...current, id];
    void api.updateProject({ id: project.id, allowedBackends: next }).then(() => refreshProjects());
  };

  const toggleCategoryAllow = async (categoryId: string, id: Project["backend"]) => {
    const current = config.categoryAllowlist[categoryId] ?? config.globalAllowlist;
    const next = current.includes(id) ? current.filter((b) => b !== id) : [...current, id];
    setConfig(await api.setCategoryAllowlist(categoryId, next));
  };

  const addCategory = async () => {
    if (!newCategoryLabel.trim()) return;
    await api.addCategory(newCategoryLabel.trim());
    setNewCategoryLabel("");
    refresh();
  };

  const renameCategory = async (id: string, label: string) => {
    await api.renameCategory(id, label);
    refresh();
  };

  const removeCategory = async (id: string) => {
    await api.removeCategory(id);
    refresh();
  };

  const moveCategory = async (id: string, dir: -1 | 1) => {
    const ordered = [...config.categories].sort((a, b) => a.order - b.order);
    const idx = ordered.findIndex((c) => c.id === id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= ordered.length) return;
    [ordered[idx], ordered[swapIdx]] = [ordered[swapIdx], ordered[idx]];
    await api.reorderCategories(ordered.map((c) => c.id));
    refresh();
  };

  const removeMember = async (categoryId: string, member: TeamMember) => {
    const cat = config.categories.find((c) => c.id === categoryId);
    if (!cat) return;
    await api.setCategoryMembers(categoryId, cat.members.filter((m) => !(m.source === member.source && m.refId === member.refId)));
    refresh();
  };

  const addMember = async (categoryId: string, member: TeamMember) => {
    const cat = config.categories.find((c) => c.id === categoryId);
    if (!cat || cat.members.some((m) => m.source === member.source && m.refId === member.refId)) return;
    await api.setCategoryMembers(categoryId, [...cat.members, member]);
    refresh();
  };

  const nameFor = (m: TeamMember) =>
    (m.source === "role" ? roles.find((r) => r.id === m.refId)?.name : library.find((l) => l.id === m.refId)?.name) ?? m.refId;

  const createLibraryAgent = async () => {
    if (!newAgentName.trim() || !newAgentPrompt.trim()) { showToast("Name and system prompt required"); return; }
    await api.addToLibrary(newAgentName.trim(), newAgentPrompt.trim(), undefined, undefined, undefined);
    setNewAgentName("");
    setNewAgentPrompt("");
    refresh();
  };

  const importFromGithub = async () => {
    if (!githubUrl.trim()) return;
    setBusy(true);
    try {
      await api.importAgentFromGithub(githubUrl.trim());
      setGithubUrl("");
      refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const removeLibraryAgent = async (id: string) => {
    await api.removeFromLibrary(id);
    refresh();
  };

  const sortedCategories = [...config.categories].sort((a, b) => a.order - b.order);

  return (
    <div className="viewRoot settingsRoot">
      <header className="rvHeader">
        <button className="pillBtn ghostBtn mono" onClick={() => showView("launcher")}>&larr; back</button>
        <span className="rvName">Settings</span>
      </header>
      <div className="settingsScroll"><main className="settingsContent">
        <div className="settingsIntro"><span className="settingsEyebrow">Agent Room / Preferences</span><h1>Workspace settings</h1><p>Choose your workspace’s appearance and how your agents use context.</p></div>
        <div className="settingsGrid">
        <AppearanceSettings />
        <section aria-label="Token saving" className="settingsCard savingCard">
          <div className="settingsCardHeading"><div><span className="settingsEyebrow">Efficiency</span><h2>Token saving</h2></div><span className="settingsBadge">Experimental</span></div>
          <p className="settingsDescription">Give your agents the same data in a smaller format.</p>
          <label className="savingControl">
            <input aria-label="Save tokens (experimental)" type="checkbox" checked={config.tokenSaving} disabled={saving} onChange={async e => {
              const enabled = e.target.checked;
              const previous = config;
              setConfig({ ...config, tokenSaving: enabled });
              setSaving(true);
              try { setConfig(await api.setTokenSaving(enabled)); }
              catch (error) { setConfig(previous); showToast(error instanceof Error ? error.message : 'Could not save setting'); }
              finally { setSaving(false); }
            }} />
            <span className="savingControlText"><strong>Save tokens</strong><span>{saving ? 'Saving preference…' : config.tokenSaving ? 'Enabled for new tasks' : 'Off by default'}</span></span>
            <span className="savingTrack" aria-hidden="true"><span /></span>
          </label>
          <ul className="savingBenefits"><li>Compact large tables without losing values</li><li>Avoid repeating results already in a session</li><li>Keep original data and instructions intact</li></ul>
          <details className="savingDetails"><summary>What’s included?</summary><p>Applies to new tasks across projects. Small or unsupported results stay unchanged. Covers app-managed data; native provider tools and custom project prompts are excluded. Savings vary and are not a subscription quota measurement.</p></details>
          <div className="savingFootnote"><span aria-hidden="true">↳</span> Change this any time. Applies when an agent starts its next task.</div>
        </section>
        </div>
        <details className="settingsAdvanced"><summary><span><strong>Providers &amp; agents</strong><span>Provider access, project permissions and your agent library</span></span><span className="settingsExpand" aria-hidden="true">+</span></summary><div className="settingsAdvancedContent">
        <section>
          <div className="dim mono" style={{ fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 8 }}>Global provider allow-list</div>
          <div className="segGroup">
            {BACKENDS.map((b) => (
              <div key={b.id} className={`segOpt${config.globalAllowlist.includes(b.id) ? " on" : ""}`} onClick={() => toggleGlobal(b.id)}>{b.label}</div>
            ))}
          </div>
        </section>

        <section>
          <div className="dim mono" style={{ fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 8 }}>Per-project override</div>
          <select className="fInput mono" style={{ maxWidth: 260, marginBottom: 8 }} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Select a project&hellip;</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {project && (
            <div className="segGroup">
              {config.globalAllowlist.map((id) => {
                const label = BACKENDS.find((b) => b.id === id)?.label ?? id;
                const on = (project.allowedBackends ?? config.globalAllowlist).includes(id);
                return <div key={id} className={`segOpt${on ? " on" : ""}`} onClick={() => toggleProjectAllow(id)}>{label}</div>;
              })}
            </div>
          )}
        </section>

        <section>
          <div className="dim mono" style={{ fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 8 }}>Categories</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sortedCategories.map((c, i) => (
              <div key={c.id} style={{ border: "1px solid var(--rule)", borderRadius: 8, padding: 10, background: "var(--paper)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button className="pillBtn ghostBtn mono" style={{ padding: "1px 7px" }} disabled={i === 0} onClick={() => void moveCategory(c.id, -1)}>&uarr;</button>
                  <button className="pillBtn ghostBtn mono" style={{ padding: "1px 7px" }} disabled={i === sortedCategories.length - 1} onClick={() => void moveCategory(c.id, 1)}>&darr;</button>
                  <input
                    className="fInput mono"
                    style={{ flex: 1, fontWeight: 600 }}
                    defaultValue={c.label}
                    onBlur={(e) => { if (e.target.value.trim() && e.target.value !== c.label) void renameCategory(c.id, e.target.value.trim()); }}
                  />
                  <button className="pillBtn ghostBtn mono" style={{ fontSize: 10 }} onClick={() => void removeCategory(c.id)}>delete</button>
                </div>
                <div className="segGroup" style={{ margin: "8px 0" }}>
                  {config.globalAllowlist.map((id) => {
                    const label = BACKENDS.find((b) => b.id === id)?.label ?? id;
                    const on = (config.categoryAllowlist[c.id] ?? config.globalAllowlist).includes(id);
                    return <div key={id} className={`segOpt${on ? " on" : ""}`} onClick={() => void toggleCategoryAllow(c.id, id)}>{label}</div>;
                  })}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {c.members.map((m) => (
                    <span
                      key={`${m.source}:${m.refId}`}
                      className="mono dim"
                      style={{ fontSize: 10.5, border: "1px solid var(--rule)", borderRadius: 999, padding: "2px 8px", display: "flex", alignItems: "center", gap: 5 }}
                    >
                      {nameFor(m)}
                      <span style={{ cursor: "pointer" }} onClick={() => void removeMember(c.id, m)}>&times;</span>
                    </span>
                  ))}
                </div>
                <details style={{ marginTop: 8 }}>
                  <summary className="dim mono" style={{ fontSize: 10.5, cursor: "pointer" }}>+ add member</summary>
                  <div className="roleGrid" style={{ marginTop: 6 }}>
                    {roles.filter((r) => !c.members.some((m) => m.source === "role" && m.refId === r.id)).map((r) => (
                      <div key={r.id} className="roleOpt" onClick={() => void addMember(c.id, { source: "role", refId: r.id })}>
                        <div className="monogram mono" style={{ width: 22, height: 22, fontSize: 9, background: colorFor(r.id) }}>{initials(r.name)}</div>
                        <span>{r.name}</span>
                      </div>
                    ))}
                    {library.filter((l) => !c.members.some((m) => m.source === "library" && m.refId === l.id)).map((l) => (
                      <div key={l.id} className="roleOpt" onClick={() => void addMember(c.id, { source: "library", refId: l.id })}>
                        <div className="monogram mono" style={{ width: 22, height: 22, fontSize: 9, background: colorFor(l.id) }}>{initials(l.name)}</div>
                        <span>{l.name}</span>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <input
              className="fInput"
              style={{ maxWidth: 220 }}
              placeholder="New category name"
              value={newCategoryLabel}
              onChange={(e) => setNewCategoryLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void addCategory(); }}
            />
            <button className="pillBtn ghostBtn mono" onClick={() => void addCategory()}>+ category</button>
          </div>
        </section>

        <section>
          <div className="dim mono" style={{ fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 8 }}>Agent library</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {library.length === 0 && <div className="dim" style={{ fontSize: 12 }}>No library agents yet.</div>}
            {library.map((l) => (
              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", border: "1px solid var(--rule)", borderRadius: 8 }}>
                <div className="monogram mono" style={{ width: 22, height: 22, fontSize: 9, background: colorFor(l.id) }}>{initials(l.name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: "600 12px/1.3 var(--font-body)" }}>{l.name}</div>
                  <div className="dim" style={{ fontSize: 10.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.systemPrompt}</div>
                </div>
                <button className="pillBtn ghostBtn mono" style={{ fontSize: 10 }} onClick={() => void removeLibraryAgent(l.id)}>remove</button>
              </div>
            ))}
          </div>
          <div className="fField">
            <span className="fLabel">New library agent</span>
            <input className="fInput" placeholder="Name" value={newAgentName} onChange={(e) => setNewAgentName(e.target.value)} style={{ marginBottom: 6 }} />
            <textarea className="fInput" rows={2} placeholder="System prompt" value={newAgentPrompt} onChange={(e) => setNewAgentPrompt(e.target.value)} />
            <button className="pillBtn fillBtn mono" style={{ marginTop: 6 }} onClick={() => void createLibraryAgent()}>+ add to library</button>
          </div>
          <div className="fField">
            <span className="fLabel">Import from GitHub</span>
            <div style={{ display: "flex", gap: 6 }}>
              <input className="fInput mono" style={{ flex: 1 }} placeholder="https://github.com/.../role.md" value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} />
              <button className="pillBtn ghostBtn mono" disabled={busy} onClick={() => void importFromGithub()}>{busy ? "…" : "import"}</button>
            </div>
          </div>
        </section>
        </div></details>
        <p className="settingsLocalNote">Appearance preferences are saved on this device. Project presets override the app default.</p>
      </main></div>
    </div>
  );
}
