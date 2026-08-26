import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { basename, join } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { ChatLog, type ChatMessage } from "../chatroom/log.js";
import { CursorCliBackend } from "../backend/cursorCliBackend.js";
import { ClaudeCliBackend } from "../backend/claudeCliBackend.js";
import type { AgentBackend } from "../backend/agentBackend.js";
import { runRoom } from "../orchestrator/orchestrator.js";
import { loadRole } from "../roles.js";

interface Project {
  id: string;
  name: string;
  path: string;
  backend: "cursor" | "claude";
  model?: string;
}

const rolesDir = join(__dirname, "..", "..", "roles");
let win: BrowserWindow | undefined;
const running = new Set<string>(); // project ids with active runs

function projectsFile(): string {
  return join(app.getPath("userData"), "projects.json");
}

function loadProjects(): Project[] {
  try {
    return JSON.parse(readFileSync(projectsFile(), "utf8"));
  } catch {
    return [];
  }
}

function saveProjects(projects: Project[]): void {
  writeFileSync(projectsFile(), JSON.stringify(projects, null, 2));
}

function send(channel: string, payload: unknown): void {
  win?.webContents.send(channel, payload);
}

function makeBackend(project: Project): AgentBackend {
  const opts = { cwd: project.path, model: project.model || undefined };
  return project.backend === "claude" ? new ClaudeCliBackend(opts) : new CursorCliBackend(opts);
}

async function runTask(project: Project, task: string): Promise<void> {
  if (running.has(project.id)) throw new Error("A run is already in progress for this project.");
  running.add(project.id);
  send("room:event", { projectId: project.id, kind: "running", running: true });

  const log = new ChatLog(join(project.path, ".agent-room", "log.jsonl"));
  log.on("message", (m: ChatMessage) => send("room:event", { projectId: project.id, kind: "message", ...m }));
  log.on("status", (text: string) => send("room:event", { projectId: project.id, kind: "status", text }));
  log.on("agentState", (s: { agentId: string; state: string }) =>
    send("room:event", { projectId: project.id, kind: "agentState", ...s }),
  );
  log.on("activity", (a: { agentId: string; line: string }) =>
    send("room:event", { projectId: project.id, kind: "activity", ...a }),
  );

  try {
    const result = await runRoom(
      task,
      makeBackend(project),
      log,
      loadRole(rolesDir, "dev", "Dev", "dev.md"),
      loadRole(rolesDir, "qa", "QA", "qa.md"),
      { streamActivity: true },
    );
    send("room:event", { projectId: project.id, kind: "done", result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    send("room:event", {
      projectId: project.id,
      kind: "message",
      ts: new Date().toISOString(),
      agentId: "orchestrator",
      role: "system",
      message: `Error: ${msg}`,
    });
    send("room:event", { projectId: project.id, kind: "done", result: "error" });
  } finally {
    running.delete(project.id);
    send("room:event", { projectId: project.id, kind: "running", running: false });
  }
}

app.whenReady().then(() => {
  ipcMain.handle("projects:list", () => loadProjects());

  ipcMain.handle("projects:add", async () => {
    const res = await dialog.showOpenDialog(win!, { properties: ["openDirectory"] });
    if (res.canceled || !res.filePaths[0]) return null;
    const path = res.filePaths[0];
    const projects = loadProjects();
    const existing = projects.find((p) => p.path === path);
    if (existing) return existing;
    const project: Project = { id: randomUUID(), name: basename(path), path, backend: "cursor" };
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

  ipcMain.handle("room:running", () => [...running]);

  win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "Agent Room",
    backgroundColor: "#16161e",
    webPreferences: { preload: join(__dirname, "preload.cjs") },
  });
  void win.loadFile(join(__dirname, "index.html"));
});

app.on("window-all-closed", () => app.quit());
