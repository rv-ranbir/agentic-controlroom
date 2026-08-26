import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { basename, join } from "node:path";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { ChatLog, type ChatMessage } from "../chatroom/log.js";
import { CursorCliBackend } from "../backend/cursorCliBackend.js";
import { ClaudeCliBackend } from "../backend/claudeCliBackend.js";
import type { AgentBackend } from "../backend/agentBackend.js";
import { runRoom } from "../orchestrator/orchestrator.js";
import { loadRole } from "../roles.js";

interface AgentRef {
  id: string; // role file id, e.g. "frontend"
  name: string; // display name from the role file heading
}

interface Project {
  id: string;
  name: string;
  path: string;
  backend: "cursor" | "claude";
  model?: string;
  agents?: AgentRef[];
}

const rolesDir = join(__dirname, "..", "..", "roles");
let win: BrowserWindow | undefined;
const running = new Set<string>(); // "projectId" (room run) or "projectId:agentId" (direct send)

// ── role library ───────────────────────────────────────────────

function roleName(file: string): string {
  const firstLine = readFileSync(join(rolesDir, file), "utf8").split("\n", 1)[0];
  return firstLine.replace(/^#\s*Role:\s*/i, "").trim() || file.replace(/\.md$/, "");
}

function listRoles(): AgentRef[] {
  return readdirSync(rolesDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ id: f.replace(/\.md$/, ""), name: roleName(f) }));
}

// ── project store ──────────────────────────────────────────────

function projectsFile(): string {
  return join(app.getPath("userData"), "projects.json");
}

function loadProjects(): Project[] {
  try {
    const projects: Project[] = JSON.parse(readFileSync(projectsFile(), "utf8"));
    for (const p of projects) {
      if (!p.agents?.length) p.agents = [{ id: "dev", name: "Developer" }, { id: "qa", name: "QA" }];
    }
    return projects;
  } catch {
    return [];
  }
}

function saveProjects(projects: Project[]): void {
  writeFileSync(projectsFile(), JSON.stringify(projects, null, 2));
}

// per-project persisted agent CLI sessions (direct chat resume across restarts)
function sessionsFile(project: Project): string {
  return join(project.path, ".agent-room", "sessions.json");
}

function loadSessions(project: Project): Record<string, string> {
  try {
    return JSON.parse(readFileSync(sessionsFile(project), "utf8"));
  } catch {
    return {};
  }
}

function saveSession(project: Project, agentId: string, sessionId: string): void {
  const sessions = loadSessions(project);
  sessions[agentId] = sessionId;
  writeFileSync(sessionsFile(project), JSON.stringify(sessions, null, 2));
}

// ── shared helpers ─────────────────────────────────────────────

function send(channel: string, payload: unknown): void {
  win?.webContents.send(channel, payload);
}

function makeBackend(project: Project): AgentBackend {
  const opts = { cwd: project.path, model: project.model || undefined };
  return project.backend === "claude" ? new ClaudeCliBackend(opts) : new CursorCliBackend(opts);
}

function wiredLog(project: Project): ChatLog {
  const log = new ChatLog(join(project.path, ".agent-room", "log.jsonl"));
  log.on("message", (m: ChatMessage) => send("room:event", { projectId: project.id, kind: "message", ...m }));
  log.on("status", (text: string) => send("room:event", { projectId: project.id, kind: "status", text }));
  log.on("agentState", (s: { agentId: string; state: string }) =>
    send("room:event", { projectId: project.id, kind: "agentState", ...s }),
  );
  log.on("activity", (a: { agentId: string; line: string }) =>
    send("room:event", { projectId: project.id, kind: "activity", ...a }),
  );
  return log;
}

function postError(project: Project, err: unknown): void {
  send("room:event", {
    projectId: project.id,
    kind: "message",
    ts: new Date().toISOString(),
    agentId: "orchestrator",
    role: "system",
    message: `Error: ${err instanceof Error ? err.message : String(err)}`,
  });
}

// ── orchestrated room run (Dev implements → QA verifies) ───────

async function runTask(project: Project, task: string): Promise<void> {
  if (running.has(project.id)) throw new Error("A run is already in progress for this project.");
  running.add(project.id);
  send("room:event", { projectId: project.id, kind: "running", running: true });
  const log = wiredLog(project);
  try {
    const result = await runRoom(
      task,
      makeBackend(project),
      log,
      loadRole(rolesDir, "dev", "Developer", "dev.md"),
      loadRole(rolesDir, "qa", "QA", "qa.md"),
      { streamActivity: true },
    );
    send("room:event", { projectId: project.id, kind: "done", result });
  } catch (err) {
    postError(project, err);
    send("room:event", { projectId: project.id, kind: "done", result: "error" });
  } finally {
    running.delete(project.id);
    send("room:event", { projectId: project.id, kind: "running", running: false });
  }
}

// ── direct message to one agent ────────────────────────────────

async function sendToAgent(project: Project, agent: AgentRef, prompt: string): Promise<void> {
  const key = `${project.id}:${agent.id}`;
  if (running.has(key)) throw new Error(`${agent.name} is still working.`);
  running.add(key);
  const log = wiredLog(project);
  log.post("user", "user", `@${agent.name} ${prompt}`);
  log.agentState(agent.id, "working");
  log.status(`${agent.name} is working…`);
  try {
    const role = loadRole(rolesDir, agent.id, agent.name, `${agent.id}.md`);
    const tail = log
      .tail(20)
      .map((m) => `[${m.role}] ${m.message}`)
      .join("\n\n");
    const fullPrompt = `Chatroom so far:\n${tail}\n\nThe user is addressing you directly:\n${prompt}`;
    const backend = makeBackend(project);
    const onLine = (line: string) => log.activity(agent.id, line);
    const sessionId = loadSessions(project)[agent.id];
    let reply: string;
    if (sessionId) {
      reply = (await backend.resume(sessionId, fullPrompt, role, onLine)).reply;
    } else {
      const r = await backend.start(role, fullPrompt, onLine);
      if (r.sessionId) saveSession(project, agent.id, r.sessionId);
      reply = r.reply;
    }
    log.post(agent.id, agent.name, reply);
    log.agentState(agent.id, "done");
  } catch (err) {
    postError(project, err);
    log.agentState(agent.id, "idle");
  } finally {
    running.delete(key);
    log.status("");
  }
}

// ── app ────────────────────────────────────────────────────────

app.whenReady().then(() => {
  ipcMain.handle("roles:list", () => listRoles());

  ipcMain.handle("projects:list", () => loadProjects());

  ipcMain.handle("projects:add", async () => {
    const res = await dialog.showOpenDialog(win!, { properties: ["openDirectory"] });
    if (res.canceled || !res.filePaths[0]) return null;
    const path = res.filePaths[0];
    const projects = loadProjects();
    const existing = projects.find((p) => p.path === path);
    if (existing) return existing;
    const project: Project = {
      id: randomUUID(),
      name: basename(path),
      path,
      backend: "cursor",
      agents: [{ id: "dev", name: "Developer" }, { id: "qa", name: "QA" }],
    };
    projects.push(project);
    saveProjects(projects);
    return project;
  });

  ipcMain.handle("projects:update", (_e, update: Partial<Project> & { id: string }) => {
    const projects = loadProjects();
    const p = projects.find((x) => x.id === update.id);
    if (p) {
      Object.assign(p, update);
      saveProjects(projects);
    }
    return p;
  });

  ipcMain.handle("projects:remove", (_e, id: string) => {
    saveProjects(loadProjects().filter((p) => p.id !== id));
  });

  ipcMain.handle("agents:add", (_e, { projectId, roleId }: { projectId: string; roleId: string }) => {
    const projects = loadProjects();
    const p = projects.find((x) => x.id === projectId);
    if (!p) return null;
    if (!p.agents!.some((a) => a.id === roleId)) {
      const role = listRoles().find((r) => r.id === roleId);
      if (role) {
        p.agents!.push(role);
        saveProjects(projects);
      }
    }
    return p;
  });

  ipcMain.handle("agents:remove", (_e, { projectId, agentId }: { projectId: string; agentId: string }) => {
    const projects = loadProjects();
    const p = projects.find((x) => x.id === projectId);
    if (!p) return null;
    p.agents = p.agents!.filter((a) => a.id !== agentId);
    saveProjects(projects);
    return p;
  });

  ipcMain.handle("room:log", (_e, id: string) => {
    const p = loadProjects().find((x) => x.id === id);
    if (!p) return [];
    const file = join(p.path, ".agent-room", "log.jsonl");
    if (!existsSync(file)) return [];
    return new ChatLog(file).tail(100);
  });

  ipcMain.handle("room:run", (_e, { projectId, task }: { projectId: string; task: string }) => {
    const p = loadProjects().find((x) => x.id === projectId);
    if (!p) throw new Error("Unknown project");
    void runTask(p, task);
  });

  ipcMain.handle("agent:send", (_e, { projectId, agentId, prompt }: { projectId: string; agentId: string; prompt: string }) => {
    const p = loadProjects().find((x) => x.id === projectId);
    if (!p) throw new Error("Unknown project");
    const agent = p.agents!.find((a) => a.id === agentId);
    if (!agent) throw new Error("Unknown agent");
    void sendToAgent(p, agent, prompt);
  });

  ipcMain.handle("room:running", () => [...running]);

  win = new BrowserWindow({
    width: 1440,
    height: 920,
    title: "Agent Room",
    backgroundColor: "#16161e",
    webPreferences: { preload: join(__dirname, "preload.cjs") },
  });
  void win.loadFile(join(__dirname, "index.html"));
});

app.on("window-all-closed", () => app.quit());
