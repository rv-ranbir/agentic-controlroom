import { useEffect, useState } from "react";
import { useStore } from "../store";
import { colorFor, initials } from "../lib/agents";
import type { LibraryAgent, Team, TeamMember } from "../types";

export function TeamsModal({ onClose }: { onClose: () => void }) {
  const roles = useStore((s) => s.roles);
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const { addAgent, addCustomAgent, showToast, refreshProjects } = useStore.getState();

  const [teams, setTeams] = useState<Team[]>([]);
  const [library, setLibrary] = useState<LibraryAgent[]>([]);
  const [mode, setMode] = useState<"pick" | "create">("pick");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set()); // "role:id" or "library:id"
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.listTeams().then(setTeams);
    void api.listLibrary().then(setLibrary);
  }, []);

  const toggle = (key: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const createTeam = async () => {
    if (!name.trim() || picked.size === 0) { showToast("Name it and pick at least one member"); return; }
    const members: TeamMember[] = [...picked].map((k) => {
      const [source, refId] = k.split(":") as [TeamMember["source"], string];
      return { source, refId };
    });
    const team = await api.addTeam(name.trim(), members);
    setTeams((t) => [...t, team]);
    setMode("pick");
    setName("");
    setPicked(new Set());
  };

  const addTeamToProject = async (team: Team) => {
    if (!selectedProjectId) return;
    setBusy(true);
    try {
      for (const m of team.members) {
        if (m.source === "role") {
          await addAgent(m.refId, undefined, undefined, false);
        } else {
          const entry = library.find((l) => l.id === m.refId);
          if (entry) await addCustomAgent(entry.name, entry.systemPrompt, entry.model, entry.extraArgs, false);
        }
      }
      await refreshProjects();
      showToast(`Added team "${team.name}" (${team.members.length} agents)`);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const removeTeam = async (id: string) => {
    await api.removeTeam(id);
    setTeams((t) => t.filter((x) => x.id !== id));
  };

  return (
    <div className="dialogBackdrop open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div id="modalBox" className="dialogBox">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>Teams</h3>
          <button className="pillBtn iconBtn ghostBtn" onClick={onClose}>&times;</button>
        </div>

        <div className="segGroup" style={{ marginBottom: 14 }}>
          <div className={`segOpt${mode === "pick" ? " on" : ""}`} onClick={() => setMode("pick")}>Add a team</div>
          <div className={`segOpt${mode === "create" ? " on" : ""}`} onClick={() => setMode("create")}>+ New team</div>
        </div>

        {mode === "pick" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {teams.length === 0 && <div className="dim" style={{ fontSize: 12.5 }}>No teams saved yet — create one.</div>}
            {teams.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 8 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ font: "600 12.5px/1.3 var(--font-body)", color: "var(--ink)" }}>{t.name}</div>
                  <div className="dim mono" style={{ fontSize: 10.5 }}>{t.members.length} agent{t.members.length === 1 ? "" : "s"}</div>
                </div>
                <button className="pillBtn ghostBtn mono" style={{ fontSize: 10 }} onClick={() => void removeTeam(t.id)}>remove</button>
                <button className="pillBtn fillBtn mono" style={{ fontSize: 10 }} disabled={busy} onClick={() => void addTeamToProject(t)}>add to project</button>
              </div>
            ))}
          </div>
        )}

        {mode === "create" && (
          <>
            <div className="fField"><span className="fLabel">Team name</span>
              <input className="fInput" placeholder="e.g. Feature squad" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="fField">
              <span className="fLabel">Members</span>
              <div className="dim mono" style={{ fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase", margin: "8px 0 6px" }}>Roles</div>
              <div className="roleGrid">
                {roles.map((r) => {
                  const key = `role:${r.id}`;
                  return (
                    <div key={key} className={`roleOpt${picked.has(key) ? " chosen" : ""}`} onClick={() => toggle(key)}>
                      <div className="monogram mono" style={{ width: 24, height: 24, fontSize: 9.5, background: colorFor(r.id) }}>{initials(r.name)}</div>
                      <span>{r.name}</span>
                    </div>
                  );
                })}
              </div>
              {library.length > 0 && (
                <>
                  <div className="dim mono" style={{ fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase", margin: "12px 0 6px" }}>Library</div>
                  <div className="roleGrid">
                    {library.map((l) => {
                      const key = `library:${l.id}`;
                      return (
                        <div key={key} className={`roleOpt${picked.has(key) ? " chosen" : ""}`} onClick={() => toggle(key)}>
                          <div className="monogram mono" style={{ width: 24, height: 24, fontSize: 9.5, background: colorFor(l.id) }}>{initials(l.name)}</div>
                          <span>{l.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button className="pillBtn fillBtn" onClick={() => void createTeam()}>save team</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
