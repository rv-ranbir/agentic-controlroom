import { useEffect, useState, type CSSProperties } from "react";
import { useStore } from "../store";
import { colorFor, initials } from "../lib/agents";
import type { Project, TaskItem } from "../types";

const COLUMNS: { id: TaskItem["status"]; label: string }[] = [
  { id: "todo", label: "To do" },
  { id: "in_progress", label: "In progress" },
  { id: "done", label: "Done" },
];

// M10 phase 4a: sticky-note corkboard. Deterministic per-task tilt/color so a card
// doesn't jump to a different look every refresh — hashed from the task id, not random.
const NOTE_COLORS = ["#E8C468", "#D9917A", "#9DBB9A", "#8FA8C9"];
const NOTE_TILTS = ["-2deg", "-1deg", "0deg", "1deg", "2deg", "-1.5deg"];
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function noteStyle(id: string): CSSProperties {
  const h = hashCode(id);
  return { "--note-color": NOTE_COLORS[h % NOTE_COLORS.length], "--tilt": NOTE_TILTS[h % NOTE_TILTS.length] } as CSSProperties;
}

export function TaskBoard() {
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const project = useStore((s) => s.projects.find((p) => p.id === selectedProjectId));
  const { showView, assignTask, showToast } = useStore.getState();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [formOpen, setFormOpen] = useState(false);

  const refresh = () => {
    if (selectedProjectId) void api.listTasks(selectedProjectId).then(setTasks);
  };
  useEffect(refresh, [selectedProjectId]);

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

  const setStatus = async (t: TaskItem, status: TaskItem["status"]) => {
    await api.updateTask(project.id, t.id, { status });
    refresh();
  };

  const setAssignee = async (t: TaskItem, assigneeAgentId: string) => {
    await api.updateTask(project.id, t.id, { assigneeAgentId: assigneeAgentId || undefined });
    refresh();
  };

  const remove = async (t: TaskItem) => {
    await api.removeTask(project.id, t.id);
    refresh();
  };

  const send = (t: TaskItem) => {
    if (!t.assigneeAgentId) { showToast("Pick an assignee first"); return; }
    const agent = project.agents.find((a) => a.id === t.assigneeAgentId);
    assignTask(t.assigneeAgentId, `[Task] ${t.title}${t.description ? `\n\n${t.description}` : ""}`);
    void api.updateTask(project.id, t.id, { status: "in_progress" });
    showToast(`Sent "${t.title}" to ${agent?.name ?? "agent"}`);
    refresh();
  };

  return (
    <div className="viewRoot">
      <header className="rvHeader">
        <button className="pillBtn ghostBtn mono" onClick={() => showView("room")}>&larr; back</button>
        <span className="rvName">{project.name}</span>
        <span className="dim mono" style={{ fontSize: 10.5 }}>Task board</span>
        <div className="spacer" />
        <button className="pillBtn fillBtn mono" onClick={() => setFormOpen(true)}>+ task</button>
      </header>
      <div className="corkboard" style={{ flex: 1, minHeight: 0, display: "flex", gap: 14, padding: 16, overflowX: "auto" }}>
        {COLUMNS.map((col) => (
          <div key={col.id} style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div className="bucketHead corkColHead">
              <span>{col.label}</span>
              <span className="n">{tasks.filter((t) => t.status === col.id).length}</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, padding: "6px 4px" }}>
              {tasks.filter((t) => t.status === col.id).map((t) => {
                const agent = project.agents.find((a) => a.id === t.assigneeAgentId);
                return (
                  <div key={t.id} className="stickyNote" style={noteStyle(t.id)}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                      <span className="stickyTitle">{t.title}</span>
                      <span className="pillBtn ghostBtn mono" style={{ padding: "1px 7px", cursor: "pointer" }} onClick={() => void remove(t)}>&times;</span>
                    </div>
                    {t.description && <div className="stickyBody" style={{ fontSize: 11.5, marginTop: 4 }}>{t.description}</div>}
                    {!!t.attachments?.length && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
                        {t.attachments.map((path) => (
                          <span
                            key={path}
                            className="mono stickyMeta"
                            title={path}
                            style={{ fontSize: 10, border: "1px solid rgba(42,36,32,.3)", borderRadius: 999, padding: "2px 8px", cursor: "pointer" }}
                            onClick={() => void api.openAttachment(path)}
                          >
                            &#128206; {path.split(/[\\/]/).pop()}
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                      {agent && <div className="monogram mono" style={{ width: 18, height: 18, fontSize: 8.5, background: colorFor(agent.id) }}>{initials(agent.name)}</div>}
                      <select
                        className="mono"
                        style={{ background: "rgba(0,0,0,.06)", color: "#2A2420", border: "1px solid rgba(42,36,32,.3)", borderRadius: 5, fontSize: 10, flex: 1 }}
                        value={t.assigneeAgentId ?? ""}
                        onChange={(e) => void setAssignee(t, e.target.value)}
                      >
                        <option value="">Unassigned</option>
                        {project.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      {COLUMNS.filter((c) => c.id !== t.status).map((c) => (
                        <button key={c.id} className="pillBtn ghostBtn mono" style={{ fontSize: 10 }} onClick={() => void setStatus(t, c.id)}>
                          &rarr; {c.label}
                        </button>
                      ))}
                      {t.assigneeAgentId && (
                        <button className="pillBtn fillBtn mono" style={{ fontSize: 10 }} onClick={() => send(t)}>send</button>
                      )}
                    </div>
                    <div className="mono stickyMeta" style={{ fontSize: 9.5, marginTop: 6 }}>{t.createdBy}</div>
                  </div>
                );
              })}
              {tasks.filter((t) => t.status === col.id).length === 0 && <div className="rvEmpty" style={{ fontSize: 11.5 }}>Nothing here.</div>}
            </div>
          </div>
        ))}
      </div>
      {formOpen && <NewTaskModal project={project} onClose={() => setFormOpen(false)} onCreated={refresh} />}
    </div>
  );
}

export function NewTaskModal({ project, onClose, onCreated, defaultReportedBy, defaultAssignee, defaultTitle, defaultDescription, defaultAttachments, sourcePlanningMessageId }: {
  project: Project; onClose: () => void; onCreated: () => void; defaultReportedBy?: string; defaultAssignee?: string;
  defaultTitle?: string; defaultDescription?: string; defaultAttachments?: string[]; sourcePlanningMessageId?: string;
}) {
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [description, setDescription] = useState(defaultDescription ?? "");
  const [assignee, setAssignee] = useState(defaultAssignee ?? "");
  const [createdBy, setCreatedBy] = useState<string>(defaultReportedBy ?? "pm");
  const [attachments, setAttachments] = useState<string[]>(defaultAttachments ?? []);
  const [pathInput, setPathInput] = useState("");
  const [capturing, setCapturing] = useState(false);

  const addScreenshot = async () => {
    setCapturing(true);
    try {
      const path = await api.captureScreenshot(project.id, assignee || undefined);
      setAttachments((a) => [...a, path]);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setCapturing(false);
    }
  };

  const addFile = async () => {
    const path = await api.pickAttachment();
    if (path) setAttachments((a) => [...a, path]);
  };

  const create = async () => {
    if (!title.trim()) return;
    await api.createTask(project.id, title.trim(), description.trim(), assignee || undefined, createdBy, attachments.length ? attachments : undefined, sourcePlanningMessageId);
    onCreated();
    onClose();
  };

  return (
    <div className="dialogBackdrop open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div id="modalBox" className="dialogBox">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>New task &mdash; <span className="dim" style={{ fontFamily: "var(--font-body)", fontSize: 13 }}>{project.name}</span></h3>
          <button className="pillBtn iconBtn ghostBtn" onClick={onClose}>&times;</button>
        </div>
        <div className="fField"><span className="fLabel">Title</span>
          <input className="fInput" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Add enemy AI" />
        </div>
        <div className="fField"><span className="fLabel">Description</span>
          <textarea className="fInput" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What needs doing" />
        </div>
        <div className="fField"><span className="fLabel">Assignee</span>
          <select className="fInput mono" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Unassigned</option>
            {project.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="fField"><span className="fLabel">Created by</span>
          {defaultReportedBy ? (
            <div className="dim mono" style={{ fontSize: 12 }}>{defaultReportedBy}</div>
          ) : (
            <div className="segGroup">
              {(["pm", "sm", "user"] as const).map((r) => (
                <div key={r} className={`segOpt${createdBy === r ? " on" : ""}`} onClick={() => setCreatedBy(r)}>{r.toUpperCase()}</div>
              ))}
            </div>
          )}
        </div>
        <div className="fField">
          <span className="fLabel">Attachments &mdash; <span style={{ textTransform: "none", letterSpacing: 0 }}>evidence, design files</span></span>
          {attachments.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
              {attachments.map((p, i) => (
                <div key={i} className="mono dim" style={{ display: "flex", justifyContent: "space-between", fontSize: 11, gap: 8 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p}</span>
                  <span style={{ cursor: "pointer", flexShrink: 0 }} onClick={() => setAttachments((a) => a.filter((_, j) => j !== i))}>&times;</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <input
              className="fInput mono"
              style={{ flex: 1 }}
              placeholder="paste a file path, or…"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && pathInput.trim()) { setAttachments((a) => [...a, pathInput.trim()]); setPathInput(""); } }}
            />
            <button className="pillBtn ghostBtn mono" disabled={capturing} onClick={() => void addScreenshot()}>{capturing ? "…" : "+ screenshot"}</button>
            <button className="pillBtn ghostBtn mono" onClick={() => void addFile()}>+ file</button>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button className="pillBtn ghostBtn" onClick={onClose}>cancel</button>
          <button className="pillBtn fillBtn" onClick={() => void create()}>create task</button>
        </div>
      </div>
    </div>
  );
}
