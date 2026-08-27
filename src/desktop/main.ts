import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { basename, join } from "node:path";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import * as pty from "node-pty";
import type { IPty } from "node-pty";
import { randomUUID } from "node:crypto";
import { ChatLog, type ChatMessage } from "../chatroom/log.js";
import { CursorCliBackend } from "../backend/cursorCliBackend.js";
import { ClaudeCliBackend } from "../backend/claudeCliBackend.js";
import type { AgentBackend } from "../backend/agentBackend.js";
import { runRoom } from "../orchestrator/orchestrator.js";
import { loadRole } from "../roles.js";

interface AgentRef {
  id: string; // role file id (library agent) or a generated uuid (custom agent)
  name: string; // display name from the role file heading, or user-chosen for custom agents
  systemPrompt?: string; // present for custom agents only — overrides the role-file lookup
  model?: string; // per-agent model override; falls back to the project's model
  extraArgs?: string[]; // raw CLI flags from the new-agent modal's "CLI flags" field
}

interface Project {
  id: string;
  name: string;
  path: string;
  backend: "cursor" | "claude";
  model?: string;
  agents?: AgentRef[];
  repoUrl?: string; // present when this room was created by cloning a repository
}

const rolesDir = join(__dirname, "..", "..", "roles");
let win: BrowserWindow | undefined;
const running = new Set<string>(); // "projectId" (room run) or "projectId:agentId" (direct send)
const runningProcs = new Map<string, ChildProcess>(); // "projectId:agentId" -> in-flight direct-send child process
const ptySessions = new Map<string, IPty>(); // "projectId:agentId" -> live interactive PTY session (M1)

// ── real pause: kill the in-flight child process for a direct-send agent ──
// Windows: these backends may spawn through a shell shim (claude) or a
// resolved node.exe launcher (cursor-agent) — taskkill /t walks the whole
// descendant tree regardless of which. Non-Windows: the backends spawn with
// detached:true (own process group), so killing -pid reaches the whole group.
function killProcessTree(child: ChildProcess): void {
  if (!child.pid) return;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/pid", String(child.pid), "/t", "/f"]);
    } catch {
      // already exited
    }
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      try { child.kill("SIGTERM"); } catch { /* already exited */ }
    }
  }
}

// ── needs-input heuristic (SPEC's M2 state inference — a heuristic with
// acknowledged limits, not real intent detection) — conservative on purpose:
// a false "needs input" is annoying, a false "done" just looks like a normal
// miss, so we only trigger on a clear question anchored to the final line.
function isQuestionLike(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const lastLine = trimmed.split("\n").filter((l) => l.trim()).pop() ?? trimmed;
  if (/\?\s*$/.test(lastLine)) return true;
  return /^(should i|do you want|which |what |could you|can you|would you like|shall i)\b/i.test(lastLine.trim());
}

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

// ── repository clone (Launcher's "Repository" tab) ─────────────

// Accepts http(s)/git/ssh URLs and SCP-like git@host:path syntax; rejects
// anything that could be parsed as a git option (leading "-") or an
// alternate transport known for remote-helper command execution (ext::/fd::).
function isSafeRepoUrl(url: string): boolean {
  if (!url || url.startsWith("-")) return false;
  if (/^(ext|fd)::/i.test(url)) return false;
  return /^(https?|git|ssh):\/\/\S+$/i.test(url) || /^[\w.-]+@[\w.-]+:\S+$/.test(url);
}

function repoNameFrom(url: string): string {
  const cleaned = url.replace(/\.git$/i, "").replace(/\/+$/, "");
  const last = cleaned.split(/[\\/:]/).filter(Boolean).pop();
  return (last || "repo").replace(/[^\w.-]/g, "_");
}

// ── working-tree diff (Review pane) ─────────────────────────────
// Diff is per-PROJECT (git working tree), not per-agent — we don't have
// per-agent worktrees yet (that's the modal's inert "new worktree per
// agent" option), so this shows the whole room's uncommitted changes.

interface DiffLine { kind: "add" | "del" | "ctx"; text: string; ln: number }
interface DiffFile { name: string; plus: number; minus: number; lines: DiffLine[] }
interface DiffResult { files: DiffFile[]; plus: number; minus: number; notGitRepo: boolean }

function parseUnifiedDiff(raw: string): DiffFile[] {
  const files: DiffFile[] = [];
  let cur: DiffFile | null = null;
  let oldLine = 0, newLine = 0;
  for (const line of raw.split("\n")) {
    if (line.startsWith("diff --git ")) {
      if (cur) files.push(cur);
      const m = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      cur = { name: m ? m[2] : line.slice(11), plus: 0, minus: 0, lines: [] };
      continue;
    }
    if (!cur) continue;
    if (line.startsWith("@@")) {
      const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) { oldLine = Number(m[1]); newLine = Number(m[2]); }
      continue;
    }
    if (
      line.startsWith("+++") || line.startsWith("---") || line.startsWith("index ") ||
      line.startsWith("new file") || line.startsWith("deleted file") ||
      line.startsWith("similarity ") || line.startsWith("rename ") || line.startsWith("\\ No newline")
    ) continue;
    if (line.startsWith("+")) {
      cur.lines.push({ kind: "add", text: line.slice(1), ln: newLine++ });
      cur.plus++;
    } else if (line.startsWith("-")) {
      cur.lines.push({ kind: "del", text: line.slice(1), ln: oldLine++ });
      cur.minus++;
    } else if (line.startsWith(" ")) {
      cur.lines.push({ kind: "ctx", text: line.slice(1), ln: newLine });
      oldLine++; newLine++;
    }
  }
  if (cur) files.push(cur);
  return files;
}

function getDiff(path: string): DiffResult {
  try {
    const raw = execFileSync("git", ["diff", "--no-color"], { cwd: path, maxBuffer: 1024 * 1024 * 16 }).toString();
    const files = parseUnifiedDiff(raw);
    return {
      files,
      plus: files.reduce((n, f) => n + f.plus, 0),
      minus: files.reduce((n, f) => n + f.minus, 0),
      notGitRepo: false,
    };
  } catch {
    // not a git repo, or git missing — either way there's nothing to show
    return { files: [], plus: 0, minus: 0, notGitRepo: true };
  }
}

function cloneRepo(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["clone", "--", url, dest], { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `git clone exited with code ${code}`));
    });
  });
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

function makeBackend(project: Project, agent?: AgentRef): AgentBackend {
  const opts = {
    cwd: project.path,
    model: agent?.model || project.model || undefined,
    extraArgs: agent?.extraArgs,
  };
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
    const role = agent.systemPrompt
      ? { id: agent.id, name: agent.name, systemPrompt: agent.systemPrompt }
      : loadRole(rolesDir, agent.id, agent.name, `${agent.id}.md`);
    const tail = log
      .tail(20)
      .map((m) => `[${m.role}] ${m.message}`)
      .join("\n\n");
    const fullPrompt = `Chatroom so far:\n${tail}\n\nThe user is addressing you directly:\n${prompt}`;
    const backend = makeBackend(project, agent);
    const onLine = (line: string) => log.activity(agent.id, line);
    const onProcess = (child: ChildProcess) => runningProcs.set(key, child);
    const sessionId = loadSessions(project)[agent.id];
    let reply: string;
    if (sessionId) {
      reply = (await backend.resume(sessionId, fullPrompt, role, onLine, onProcess)).reply;
    } else {
      const r = await backend.start(role, fullPrompt, onLine, onProcess);
      if (r.sessionId) saveSession(project, agent.id, r.sessionId);
      reply = r.reply;
    }
    log.post(agent.id, agent.name, reply);
    log.agentState(agent.id, isQuestionLike(reply) ? "needs" : "done");
  } catch (err) {
    postError(project, err);
    log.agentState(agent.id, "idle");
  } finally {
    running.delete(key);
    runningProcs.delete(key);
    log.status("");
  }
}

// ── interactive PTY terminal (M1: real node-pty session, not headless exec) ──
// The CLI runs through the user's own shell (cmd/bash) rather than being
// resolved/exec'd directly like the headless backends: here the user types
// live, so there's no untrusted-argv content to protect against, and running
// through the shell means PATH/aliases/shims behave exactly like a real
// terminal the user opened themselves.
//
// "Session persists across restart" (SPEC M1) relies on the CLI's own
// directory-scoped conversation continuity, not on us keeping the OS process
// alive — closing the pane (or the whole app) and reopening it re-spawns the
// CLI fresh in the same project directory, and `claude`/`cursor-agent` pick
// their own prior conversation back up from there.

function ptyKey(projectId: string, agentId: string): string {
  return `${projectId}:${agentId}`;
}

function startPty(project: Project, agentId: string): { alreadyRunning: boolean } {
  const key = ptyKey(project.id, agentId);
  if (ptySessions.has(key)) return { alreadyRunning: true };
  const bin = project.backend === "claude" ? (process.env.CLAUDE_BIN ?? "claude") : (process.env.CURSOR_AGENT_BIN ?? "cursor-agent");
  const shell = process.platform === "win32" ? "cmd.exe" : (process.env.SHELL ?? "/bin/bash");
  const shellArgs = process.platform === "win32" ? ["/c", bin] : ["-lc", bin];
  const child = pty.spawn(shell, shellArgs, {
    name: "xterm-256color",
    cols: 80,
    rows: 30,
    cwd: project.path,
    env: process.env as Record<string, string>,
  });
  ptySessions.set(key, child);
  child.onData((data) => send("pty:data", { key, data }));
  child.onExit(({ exitCode }) => {
    ptySessions.delete(key);
    send("pty:exit", { key, exitCode });
  });
  return { alreadyRunning: false };
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

  ipcMain.handle("projects:addRepo", async (_e, { url }: { url: string }) => {
    const trimmed = (url || "").trim();
    if (!isSafeRepoUrl(trimmed)) throw new Error("That doesn't look like a valid repository URL.");
    const projects = loadProjects();
    const existingByUrl = projects.find((p) => p.repoUrl === trimmed);
    if (existingByUrl) return existingByUrl;
    const name = repoNameFrom(trimmed);
    const workspace = join(app.getPath("documents"), "AgentRoom");
    const dest = join(workspace, name);
    if (existsSync(dest)) {
      const existingByPath = projects.find((p) => p.path === dest);
      if (existingByPath) return existingByPath;
      throw new Error(`Destination already exists and isn't a tracked room: ${dest}`);
    }
    mkdirSync(workspace, { recursive: true });
    await cloneRepo(trimmed, dest);
    const project: Project = {
      id: randomUUID(),
      name,
      path: dest,
      backend: "cursor",
      repoUrl: trimmed,
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

  ipcMain.handle(
    "agents:add",
    (_e, { projectId, roleId, model, extraArgs }: { projectId: string; roleId: string; model?: string; extraArgs?: string[] }) => {
      const projects = loadProjects();
      const p = projects.find((x) => x.id === projectId);
      if (!p) return null;
      if (!p.agents!.some((a) => a.id === roleId)) {
        const role = listRoles().find((r) => r.id === roleId);
        if (role) {
          p.agents!.push({ ...role, model: model || undefined, extraArgs: extraArgs?.length ? extraArgs : undefined });
          saveProjects(projects);
        }
      }
      return p;
    },
  );

  ipcMain.handle(
    "agents:addCustom",
    (
      _e,
      { projectId, name, systemPrompt, model, extraArgs }: {
        projectId: string; name: string; systemPrompt: string; model?: string; extraArgs?: string[];
      },
    ) => {
      const projects = loadProjects();
      const p = projects.find((x) => x.id === projectId);
      if (!p) return null;
      p.agents!.push({ id: randomUUID(), name, systemPrompt, model: model || undefined, extraArgs: extraArgs?.length ? extraArgs : undefined });
      saveProjects(projects);
      return p;
    },
  );

  ipcMain.handle("agent:pause", (_e, { projectId, agentId }: { projectId: string; agentId: string }) => {
    const child = runningProcs.get(`${projectId}:${agentId}`);
    if (!child) return false;
    killProcessTree(child);
    return true;
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

  ipcMain.handle("git:branch", (_e, path: string) => {
    try {
      return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: path, timeout: 2000 })
        .toString()
        .trim();
    } catch {
      return "";
    }
  });

  ipcMain.handle("room:diff", (_e, path: string) => getDiff(path));

  ipcMain.handle("pty:start", (_e, { projectId, agentId }: { projectId: string; agentId: string }) => {
    const project = loadProjects().find((p) => p.id === projectId);
    if (!project) throw new Error("Unknown project");
    if (!project.agents!.some((a) => a.id === agentId)) throw new Error("Unknown agent");
    return startPty(project, agentId);
  });

  ipcMain.handle("pty:write", (_e, { projectId, agentId, data }: { projectId: string; agentId: string; data: string }) => {
    ptySessions.get(ptyKey(projectId, agentId))?.write(data);
  });

  ipcMain.handle(
    "pty:resize",
    (_e, { projectId, agentId, cols, rows }: { projectId: string; agentId: string; cols: number; rows: number }) => {
      try {
        ptySessions.get(ptyKey(projectId, agentId))?.resize(cols, rows);
      } catch {
        // pty already exited between the resize observer firing and this handler running
      }
    },
  );

  ipcMain.handle("pty:stop", (_e, { projectId, agentId }: { projectId: string; agentId: string }) => {
    const key = ptyKey(projectId, agentId);
    ptySessions.get(key)?.kill();
    ptySessions.delete(key);
  });

  win = new BrowserWindow({
    width: 1440,
    height: 920,
    title: "AgentRoom",
    backgroundColor: "#1B1814",
    webPreferences: { preload: join(__dirname, "preload.cjs") },
  });
  win.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId.split(/[\\/]/).pop()}:${line})`);
  });
  void win.loadFile(join(__dirname, "index.html"));
});

app.on("window-all-closed", () => {
  for (const child of ptySessions.values()) child.kill();
  ptySessions.clear();
  app.quit();
});
