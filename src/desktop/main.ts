import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, Notification, safeStorage, screen } from "electron";
import { basename, join, relative, resolve, sep } from "node:path";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import * as pty from "node-pty";
import type { IPty } from "node-pty";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { ChatLog, type ChatMessage } from "../chatroom/log.js";
import { CursorCliBackend } from "../backend/cursorCliBackend.js";
import { ClaudeCliBackend } from "../backend/claudeCliBackend.js";
import type { AgentBackend, RoleConfig } from "../backend/agentBackend.js";
import { runRoom } from "../orchestrator/orchestrator.js";
import { runMeeting } from "../orchestrator/meeting.js";
import { isQuestionLike } from "../orchestrator/needsInput.js";
import { loadRole } from "../roles.js";

interface AgentRef {
  id: string; // unique per instance — always a generated id, never the bare role id (M9: multiple instances of the same role are allowed)
  roleId?: string; // which roles/*.md this instance was created from, when it was; absent for custom agents (systemPrompt carries their identity instead)
  name: string; // display name from the role file heading, or user-chosen for custom agents
  systemPrompt?: string; // present for custom agents only — overrides the role-file lookup
  model?: string; // per-agent model override; falls back to the project's model
  extraArgs?: string[]; // raw CLI flags from the new-agent modal's "CLI flags" field
  worktreePath?: string; // present when this agent got its own git worktree (M5)
  skillIds?: string[]; // attached skills/*.md files, appended to the system prompt (M7)
}

interface Project {
  id: string;
  name: string;
  path: string;
  backend: "cursor" | "claude";
  model?: string;
  agents?: AgentRef[];
  repoUrl?: string; // present when this room was created by cloning a repository
  zone?: "Work" | "Personal" | "Side";
  lastOpenedAt?: number; // ms epoch, bumped on selectProject — drives the Launcher's recents ordering
  dbPath?: string; // path to a SQLite file the Environment panel's read-only Database tab queries
  activeAccountId?: string; // selected credential profile (M8 multi-account quota switching)
}

const rolesDir = join(__dirname, "..", "..", "roles");
let win: BrowserWindow | undefined;
const running = new Set<string>(); // "projectId" (room run) or "projectId:agentId" (direct send)
const runningProcs = new Map<string, ChildProcess>(); // "projectId:agentId" -> in-flight direct-send child process
const ptySessions = new Map<string, IPty>(); // "projectId:agentId" -> live interactive PTY session (M1)

// ── Process Guard (M8): every child process AgentRoom itself spawns must
// resolve to a recognized binary — catches a misconfigured CLAUDE_BIN /
// CURSOR_AGENT_BIN / SHELL env override before it silently executes
// something else. Not a sandbox: a provider CLI's own tool calls (e.g. its
// bash tool) run inside that CLI's process and are outside our reach —
// this only gates what AgentRoom itself decides to spawn.
const ALLOWED_BIN_NAMES = new Set([
  "claude", "cursor-agent", "cloudflared", "whisper",
  "cmd", "powershell", "pwsh",
  "bash", "sh", "zsh", "fish", "dash", "ash", "ksh", "tcsh", "csh",
]);

function assertAllowedBin(bin: string): void {
  // npm-global installs on Windows shim CLIs as .cmd/.bat/.ps1, not a bare .exe
  const base = basename(bin).toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, "");
  if (!ALLOWED_BIN_NAMES.has(base)) {
    throw new Error(`Process Guard blocked an unrecognized binary: "${bin}". Allowed: ${[...ALLOWED_BIN_NAMES].join(", ")}.`);
  }
}

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

// ── skills library (M7): markdown files, same shape as roles/, but attached
// to an agent (possibly several) and appended to its system prompt rather
// than defining the agent outright.
const skillsDir = join(__dirname, "..", "..", "skills");

function skillTitle(file: string): string {
  const firstLine = readFileSync(join(skillsDir, file), "utf8").split("\n", 1)[0];
  return firstLine.replace(/^#\s*Skill:\s*/i, "").trim() || file.replace(/\.md$/, "");
}

function listSkills(): { id: string; name: string }[] {
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ id: f.replace(/\.md$/, ""), name: skillTitle(f) }));
}

function appendSkills<T extends { systemPrompt: string }>(role: T, agent: AgentRef): T {
  if (!agent.skillIds?.length) return role;
  const bodies = agent.skillIds
    .map((id) => { try { return readFileSync(join(skillsDir, `${id}.md`), "utf8").trim(); } catch { return ""; } })
    .filter(Boolean);
  return bodies.length ? { ...role, systemPrompt: `${role.systemPrompt}\n\n${bodies.join("\n\n")}` } : role;
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

interface DiffLine { kind: "add" | "del" | "ctx"; text: string; ln: number; oldLn?: number; newLn?: number }
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
      cur.lines.push({ kind: "add", text: line.slice(1), ln: newLine, newLn: newLine });
      newLine++;
      cur.plus++;
    } else if (line.startsWith("-")) {
      cur.lines.push({ kind: "del", text: line.slice(1), ln: oldLine, oldLn: oldLine });
      oldLine++;
      cur.minus++;
    } else if (line.startsWith(" ")) {
      cur.lines.push({ kind: "ctx", text: line.slice(1), ln: newLine, oldLn: oldLine, newLn: newLine });
      oldLine++; newLine++;
    }
  }
  if (cur) files.push(cur);
  return files;
}

// Plain `git diff` only shows changes to already-tracked files — a brand
// new file an agent creates never appears, since git has nothing to diff
// it against. Fix: mark untracked files "intent to add" (-N stages the
// path with no content, so diff treats it as a pure addition against
// empty) and reset immediately after — the working tree itself is never
// touched, this only affects what `git diff` chooses to show.
// AgentRoom's own bookkeeping (chat log, sessions, commit records) lives
// inside the project directory and would otherwise show up as untracked
// files in every diff/commit — not something that belongs in the user's
// actual history. Best-effort and idempotent; never fatal if it can't write.
function ensureAgentRoomGitignored(projectPath: string): void {
  try {
    if (!existsSync(join(projectPath, ".agent-room"))) return; // not this directory's concern (e.g. an agent worktree)
    const gitignorePath = join(projectPath, ".gitignore");
    const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";
    if (existing.split("\n").some((l) => l.trim() === ".agent-room/" || l.trim() === ".agent-room")) return;
    const sep = existing && !existing.endsWith("\n") ? "\n" : "";
    writeFileSync(gitignorePath, `${existing}${sep}.agent-room/\n`);
  } catch {
    // not fatal — worst case .agent-room/ shows up as untracked, same as before this fix
  }
}

function gitDiffIncludingUntracked(path: string): string {
  ensureAgentRoomGitignored(path);
  execFileSync("git", ["add", "-A", "-N"], { cwd: path });
  try {
    return execFileSync("git", ["diff", "--no-color"], { cwd: path, maxBuffer: 1024 * 1024 * 16 }).toString();
  } finally {
    execFileSync("git", ["reset"], { cwd: path });
  }
}

function getDiff(path: string): DiffResult {
  try {
    const raw = gitDiffIncludingUntracked(path);
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

// ── Task board (M9): PM/SM creates tasks, assigns to agents ────────
interface TaskItem {
  id: string;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "done";
  assigneeAgentId?: string;
  createdBy: "pm" | "sm" | "user";
  createdAt: string;
}

function tasksFile(project: Project): string {
  return join(project.path, ".agent-room", "tasks.json");
}

function loadTasks(project: Project): TaskItem[] {
  try {
    return JSON.parse(readFileSync(tasksFile(project), "utf8"));
  } catch {
    return [];
  }
}

function saveTasks(project: Project, tasks: TaskItem[]): void {
  mkdirSync(join(project.path, ".agent-room"), { recursive: true });
  writeFileSync(tasksFile(project), JSON.stringify(tasks, null, 2));
}

// ── File IDE (M9): sandboxed browse/edit/save under the project root ──
const IDE_IGNORE = new Set([".git", "node_modules", "dist", "out", ".agent-room"]);
const IDE_MAX_BYTES = 2 * 1024 * 1024;

function resolveInProject(root: string, sub: string): string {
  const target = resolve(root, sub || ".");
  const rootResolved = resolve(root);
  if (target !== rootResolved && !target.startsWith(rootResolved + sep)) {
    throw new Error("Path escapes project root");
  }
  return target;
}

interface IdeEntry { name: string; path: string; isDir: boolean }

function listProjectDir(root: string, sub: string): IdeEntry[] {
  const dir = resolveInProject(root, sub);
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => !IDE_IGNORE.has(e.name) && !e.name.startsWith("."))
    .map((e) => ({ name: e.name, path: relative(root, join(dir, e.name)).split(sep).join("/"), isDir: e.isDirectory() }))
    .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
}

function readProjectFile(root: string, sub: string): { content: string } | { error: string } {
  const file = resolveInProject(root, sub);
  const st = statSync(file);
  if (st.size > IDE_MAX_BYTES) return { error: `File too large to edit here (${Math.round(st.size / 1024)}KB, limit 2MB)` };
  const buf = readFileSync(file);
  if (buf.subarray(0, 8000).includes(0)) return { error: "Binary file — can't edit as text" };
  return { content: buf.toString("utf8") };
}

function writeProjectFile(root: string, sub: string, content: string): void {
  writeFileSync(resolveInProject(root, sub), content, "utf8");
}

function getCommitDiff(path: string, sha: string): DiffResult {
  try {
    const raw = execFileSync("git", ["show", "--no-color", sha], { cwd: path, maxBuffer: 1024 * 1024 * 16 }).toString();
    const files = parseUnifiedDiff(raw);
    return {
      files,
      plus: files.reduce((n, f) => n + f.plus, 0),
      minus: files.reduce((n, f) => n + f.minus, 0),
      notGitRepo: false,
    };
  } catch {
    return { files: [], plus: 0, minus: 0, notGitRepo: true };
  }
}

// ── approve → real commit, AI Conventional Commit message (M5) ─────
// "Conversation attached to commits": each commit record keeps a snippet
// of the exchange that led to it, so a later reviewer can see why, not
// just what. Stored in the PROJECT's .agent-room/ (not the agent's
// worktree) so it survives even if that worktree is later removed.

interface CommitRecord {
  sha: string;
  agentId: string;
  agentName: string;
  message: string;
  ts: string;
  conversationSnippet: string;
}

function commitsFile(project: Project): string {
  return join(project.path, ".agent-room", "commits.json");
}

function loadCommits(project: Project): CommitRecord[] {
  try {
    return JSON.parse(readFileSync(commitsFile(project), "utf8"));
  } catch {
    return [];
  }
}

function saveCommit(project: Project, record: CommitRecord): void {
  const commits = loadCommits(project);
  commits.push(record);
  mkdirSync(join(project.path, ".agent-room"), { recursive: true });
  writeFileSync(commitsFile(project), JSON.stringify(commits, null, 2));
}

async function generateCommitMessage(project: Project, agent: AgentRef, diffText: string): Promise<string> {
  const role: RoleConfig = {
    id: "committer",
    name: "Committer",
    systemPrompt:
      "You write concise git commit messages in the Conventional Commits format (type(scope): summary). " +
      "Output ONLY the commit message — a summary line under 72 characters, optionally a short body after a " +
      "blank line. No commentary, no markdown fences.",
  };
  const backend = makeBackend(project, agent);
  const truncated = diffText.length > 8000 ? diffText.slice(0, 8000) + "\n… (truncated)" : diffText;
  const { reply } = await backend.start(role, `Write a Conventional Commits message for this diff:\n\n${truncated}`);
  const cleaned = reply.trim().replace(/^```[a-z]*\n?/i, "").replace(/```\s*$/, "").trim();
  return cleaned || "chore: agent changes";
}

async function approveAndCommit(project: Project, agent: AgentRef, log: ChatLog): Promise<{ sha: string; message: string }> {
  const target = agent.worktreePath ?? project.path;
  const diffText = gitDiffIncludingUntracked(target);
  if (!diffText.trim()) throw new Error("Nothing to commit — the working tree is clean.");
  const message = await generateCommitMessage(project, agent, diffText);
  execFileSync("git", ["add", "-A"], { cwd: target });
  execFileSync("git", ["commit", "-m", message], { cwd: target });
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: target }).toString().trim();
  const conversationSnippet = log
    .tail(20)
    .filter((m) => m.agentId === agent.id || m.agentId === "user")
    .slice(-6)
    .map((m) => `[${m.role}] ${m.message}`)
    .join("\n\n");
  saveCommit(project, { sha, agentId: agent.id, agentName: agent.name, message, ts: new Date().toISOString(), conversationSnippet });
  return { sha, message };
}

function cloneRepo(url: string, dest: string, token?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // token, when present, goes through a per-invocation git config override
    // (http.extraHeader) — never embedded in the URL, so it's never written
    // to .git/config or persisted anywhere in projects.json's repoUrl field.
    const args = token
      ? ["-c", `http.extraHeader=Authorization: Bearer ${token}`, "clone", "--", url, dest]
      : ["clone", "--", url, dest];
    const child = spawn("git", args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `git clone exited with code ${code}`));
    });
  });
}

async function cloneAndRegister(url: string, name: string, token?: string): Promise<Project> {
  const projects = loadProjects();
  const existingByUrl = projects.find((p) => p.repoUrl === url);
  if (existingByUrl) return existingByUrl;
  const workspace = join(app.getPath("documents"), "AgentRoom");
  const dest = join(workspace, name);
  if (existsSync(dest)) {
    const existingByPath = projects.find((p) => p.path === dest);
    if (existingByPath) return existingByPath;
    throw new Error(`Destination already exists and isn't a tracked room: ${dest}`);
  }
  mkdirSync(workspace, { recursive: true });
  await cloneRepo(url, dest, token);
  const project: Project = {
    id: randomUUID(),
    name,
    path: dest,
    backend: "cursor",
    repoUrl: url,
    agents: [{ id: "dev", name: "Developer" }, { id: "qa", name: "QA" }],
  };
  projects.push(project);
  saveProjects(projects);
  return project;
}

// ── per-agent git worktrees (M5) ─────────────────────────────────
// Wires up the new-agent modal's "new worktree per agent" checkbox, which
// existed in the UI but was inert until now. Each worktree gets its own
// branch (agent/<id>) so an agent's changes are genuinely isolated — the
// Review pane's per-agent diff (see getDiff) only works meaningfully once
// this exists; before it, "per-agent diff" was really "whole project diff".

function worktreePathFor(project: Project, agentId: string): string {
  return join(project.path, ".agent-room", "worktrees", agentId);
}

function createWorktree(project: Project, agentId: string): string {
  const path = worktreePathFor(project, agentId);
  if (existsSync(path)) return path; // idempotent — reuse an existing worktree
  mkdirSync(join(project.path, ".agent-room", "worktrees"), { recursive: true });
  try {
    execFileSync("git", ["worktree", "add", "-B", `agent/${agentId}`, path], { cwd: project.path });
  } catch (err) {
    throw new Error(
      `Couldn't create a worktree for this agent (is "${project.path}" a git repo with at least one commit?): ` +
        (err instanceof Error ? err.message : String(err)),
    );
  }
  return path;
}

function removeWorktree(project: Project, worktreePath: string): void {
  try {
    execFileSync("git", ["worktree", "remove", "--force", worktreePath], { cwd: project.path });
  } catch {
    // already gone, or project.path itself no longer exists — nothing to clean up
  }
}

// ── screenshot capture (M6): full-res primary display, saved next to the
// agent's own worktree (or the project root without one) ──────────────
async function captureScreenshot(project: Project, agentId?: string): Promise<string> {
  const primary = screen.getPrimaryDisplay();
  const scale = primary.scaleFactor || 1;
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: Math.round(primary.size.width * scale), height: Math.round(primary.size.height * scale) },
  });
  const source = sources[0];
  if (!source) throw new Error("No screen source available.");
  const agent = agentId ? project.agents!.find((a) => a.id === agentId) : undefined;
  const dir = join(agent?.worktreePath ?? project.path, ".agent-room", "screenshots");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${Date.now()}.png`);
  writeFileSync(file, source.thumbnail.toPNG());
  return file;
}

// ── secret manager (M7): per-project key/value secrets, encrypted at rest
// via safeStorage (same OS keychain mechanism already used for the GitHub
// token). Values never round-trip to the renderer — it only ever sees keys.
interface StoredSecret { key: string; enc: string } // enc = base64(safeStorage.encryptString(value))

function secretsFile(): string {
  return join(app.getPath("userData"), "secrets.json");
}

function loadAllSecrets(): Record<string, StoredSecret[]> {
  try {
    return JSON.parse(readFileSync(secretsFile(), "utf8"));
  } catch {
    return {};
  }
}

function saveAllSecrets(all: Record<string, StoredSecret[]>): void {
  writeFileSync(secretsFile(), JSON.stringify(all, null, 2));
}

function listSecretKeys(projectId: string): string[] {
  return (loadAllSecrets()[projectId] ?? []).map((s) => s.key);
}

function setSecret(projectId: string, key: string, value: string): void {
  const all = loadAllSecrets();
  const list = (all[projectId] ??= []);
  const enc = safeStorage.encryptString(value).toString("base64");
  const i = list.findIndex((s) => s.key === key);
  if (i >= 0) list[i] = { key, enc }; else list.push({ key, enc });
  saveAllSecrets(all);
}

function removeSecret(projectId: string, key: string): void {
  const all = loadAllSecrets();
  all[projectId] = (all[projectId] ?? []).filter((s) => s.key !== key);
  saveAllSecrets(all);
}

// injected as env at spawn — never logged, never sent back to the renderer
function resolveSecretsEnv(projectId: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const s of loadAllSecrets()[projectId] ?? []) {
    try {
      env[s.key] = safeStorage.decryptString(Buffer.from(s.enc, "base64"));
    } catch {
      // corrupted entry (e.g. OS keychain changed) — skip rather than crash the spawn
    }
  }
  return env;
}

// ── project memory (M7): free-text notes, prepended into every agent's
// system prompt for this project — durable context that survives restarts
// and isn't tied to any one agent, unlike a role's system prompt.
function memoryFile(project: Project): string {
  return join(project.path, ".agent-room", "memory.md");
}

function loadMemory(project: Project): string {
  try {
    return readFileSync(memoryFile(project), "utf8");
  } catch {
    return "";
  }
}

function saveMemory(project: Project, text: string): void {
  mkdirSync(join(project.path, ".agent-room"), { recursive: true });
  writeFileSync(memoryFile(project), text);
}

function prependMemory<T extends { systemPrompt: string }>(role: T, project: Project): T {
  const memory = loadMemory(project).trim();
  return memory ? { ...role, systemPrompt: `Project memory:\n${memory}\n\n---\n\n${role.systemPrompt}` } : role;
}

// ── multi-account quota switching (M8): named credential profiles per
// provider (encrypted env-var overrides, same mechanism as secrets), so a
// project can switch which login/key an agent spawns with once a provider's
// quota is hit. AgentRoom can't reliably auto-detect *which* account failed
// or auto-switch mid-run — it surfaces the option and lets the user pick.
interface Account { id: string; provider: "claude" | "cursor"; name: string; env: StoredSecret[] }

function accountsFile(): string {
  return join(app.getPath("userData"), "accounts.json");
}

function loadAccounts(): Account[] {
  try {
    return JSON.parse(readFileSync(accountsFile(), "utf8"));
  } catch {
    return [];
  }
}

function saveAccounts(list: Account[]): void {
  writeFileSync(accountsFile(), JSON.stringify(list, null, 2));
}

function listAccountsSafe(): { id: string; provider: string; name: string; envKeys: string[] }[] {
  return loadAccounts().map((a) => ({ id: a.id, provider: a.provider, name: a.name, envKeys: a.env.map((e) => e.key) }));
}

function addAccount(provider: "claude" | "cursor", name: string, env: Record<string, string>): void {
  const list = loadAccounts();
  list.push({
    id: randomUUID(),
    provider,
    name,
    env: Object.entries(env).map(([key, value]) => ({ key, enc: safeStorage.encryptString(value).toString("base64") })),
  });
  saveAccounts(list);
}

function removeAccount(id: string): void {
  saveAccounts(loadAccounts().filter((a) => a.id !== id));
  const projects = loadProjects();
  let changed = false;
  for (const p of projects) {
    if (p.activeAccountId === id) { p.activeAccountId = undefined; changed = true; }
  }
  if (changed) saveProjects(projects);
}

function resolveAccountEnv(accountId?: string): Record<string, string> {
  const account = accountId ? loadAccounts().find((a) => a.id === accountId) : undefined;
  if (!account) return {};
  const env: Record<string, string> = {};
  for (const e of account.env) {
    try {
      env[e.key] = safeStorage.decryptString(Buffer.from(e.enc, "base64"));
    } catch {
      // corrupted entry — skip rather than crash the spawn
    }
  }
  return env;
}

const QUOTA_PATTERN = /rate.?limit|quota exceeded|usage limit reached|too many requests|\b429\b/i;
const quotaNotified = new Set<string>(); // "projectId:agentId" already notified this run — checkQuota fires from multiple points (streamed lines, final reply, thrown error) on the same underlying message

function checkQuota(project: Project, agent: AgentRef, text: string): void {
  const key = `${project.id}:${agent.id}`;
  if (quotaNotified.has(key) || !QUOTA_PATTERN.test(text)) return;
  quotaNotified.add(key);
  send("quota:hit", { projectId: project.id, agentId: agent.id });
}

// ── localhost tunnel (M7): shells out to `cloudflared` (quick tunnels need
// no account/config) — detection, not a bundled tunneling stack ─────────
const tunnelProcs = new Map<string, ChildProcess>(); // projectId -> cloudflared child

function detectTunnelCli(): string | null {
  try {
    execFileSync("cloudflared", ["--version"], { timeout: 3000, stdio: "ignore" });
    return "cloudflared";
  } catch {
    return null;
  }
}

function startTunnel(project: Project, port: number): void {
  if (tunnelProcs.has(project.id)) throw new Error("Tunnel already running for this project.");
  const bin = detectTunnelCli();
  if (!bin) {
    throw new Error(
      "Install cloudflared for local tunnels: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
    );
  }
  const child = spawn(bin, ["tunnel", "--url", `http://localhost:${port}`], { windowsHide: true });
  tunnelProcs.set(project.id, child);
  let found = false;
  const onChunk = (d: Buffer) => {
    if (found) return;
    const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i.exec(String(d));
    if (m) { found = true; send("tunnel:event", { projectId: project.id, kind: "url", url: m[0] }); }
  };
  // cloudflared logs its assigned URL to stderr, not stdout
  child.stdout.on("data", onChunk);
  child.stderr.on("data", onChunk);
  child.on("exit", () => {
    tunnelProcs.delete(project.id);
    send("tunnel:event", { projectId: project.id, kind: "stopped" });
  });
  child.on("error", (err) => {
    tunnelProcs.delete(project.id);
    send("tunnel:event", { projectId: project.id, kind: "error", message: err.message });
  });
}

function stopTunnel(projectId: string): void {
  const child = tunnelProcs.get(projectId);
  if (!child) return;
  killProcessTree(child);
  tunnelProcs.delete(projectId);
}

// ── read-only DB panel (M7): better-sqlite3 was already a dependency, unused
// until now. SELECT-only is enforced here, on top of opening the file
// `readonly: true` — belt and suspenders per spec's "enforced our side" ──
function assertSelectOnly(sql: string): string {
  const stmts = sql.split(";").map((s) => s.trim()).filter(Boolean);
  if (stmts.length !== 1) throw new Error("Enter exactly one SELECT statement.");
  if (!/^select\b/i.test(stmts[0])) throw new Error("Only SELECT statements are allowed here.");
  return stmts[0];
}

function runReadOnlyQuery(project: Project, sql: string): { columns: string[]; rows: unknown[][] } {
  if (!project.dbPath) throw new Error("No database file configured for this project.");
  const stmt = assertSelectOnly(sql);
  const db = new Database(project.dbPath, { readonly: true, fileMustExist: true });
  try {
    const prepared = db.prepare(stmt);
    const rows = prepared.all() as Record<string, unknown>[];
    const columns = prepared.columns().map((c) => c.name);
    return { columns, rows: rows.map((r) => columns.map((c) => r[c])) };
  } finally {
    db.close();
  }
}

// ── local dictation (M6): shells out to a `whisper` CLI on PATH — no bundled
// model, matching the "detection, not configuration" BYOK stance ─────────
async function transcribeAudio(buffer: Buffer): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "agent-room-dictate-"));
  try {
    const input = join(dir, "audio.webm");
    writeFileSync(input, buffer);
    try {
      execFileSync("whisper", [input, "--model", "tiny", "--output_format", "txt", "--output_dir", dir], {
        timeout: 60_000,
        stdio: ["ignore", "ignore", "pipe"],
      });
    } catch {
      throw new Error("Local dictation needs the `whisper` CLI on PATH (pip install -U openai-whisper).");
    }
    const txtFile = join(dir, "audio.txt");
    return existsSync(txtFile) ? readFileSync(txtFile, "utf8").trim() : "";
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── GitHub connect (M4): PAT stored via OS keychain (safeStorage, ADR-003) ──

function githubTokenFile(): string { return join(app.getPath("userData"), "github-token.enc"); }
function githubUserFile(): string { return join(app.getPath("userData"), "github-user.json"); }

function saveGithubToken(token: string): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("OS keychain encryption isn't available on this machine.");
  writeFileSync(githubTokenFile(), safeStorage.encryptString(token));
}

function loadGithubToken(): string | null {
  try {
    return safeStorage.decryptString(readFileSync(githubTokenFile()));
  } catch {
    return null;
  }
}

function clearGithubToken(): void {
  try { unlinkSync(githubTokenFile()); } catch { /* not connected */ }
  try { unlinkSync(githubUserFile()); } catch { /* not connected */ }
}

async function githubApi(path: string, token: string): Promise<Response> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "AgentRoom", Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub API error (HTTP ${res.status}) for ${path}`);
  return res;
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

// M2: desktop notification when an agent (heuristically) needs input. Skipped
// when the window already has focus — the user is already looking at it.
function notifyNeedsInput(project: Project, agentId: string): void {
  if (!Notification.isSupported() || win?.isFocused()) return;
  const name = project.agents?.find((a) => a.id === agentId)?.name ?? agentId;
  const n = new Notification({ title: "AgentRoom — needs input", body: `${name} is waiting on you in ${project.name}` });
  n.on("click", () => { win?.show(); win?.focus(); });
  n.show();
}

function makeBackend(project: Project, agent?: AgentRef): AgentBackend {
  assertAllowedBin(project.backend === "claude" ? (process.env.CLAUDE_BIN ?? "claude") : (process.env.CURSOR_AGENT_BIN ?? "cursor-agent"));
  const opts = {
    cwd: agent?.worktreePath ?? project.path,
    model: agent?.model || project.model || undefined,
    extraArgs: agent?.extraArgs,
    env: { ...process.env, ...resolveSecretsEnv(project.id), ...resolveAccountEnv(project.activeAccountId) } as Record<string, string>,
  };
  return project.backend === "claude" ? new ClaudeCliBackend(opts) : new CursorCliBackend(opts);
}

// M4 Launcher stats: main.ts is the one place that sees every project's
// events regardless of which project the renderer currently has open, so
// this is where cross-project "blocked count" / "last activity" have to
// live — the renderer's own state (store.ts) only ever tracks the ONE
// selected project.
interface ProjectStats {
  agentStates: Map<string, string>;
  lastActivityAt: number;
}
const projectStats = new Map<string, ProjectStats>();

function statsFor(projectId: string): ProjectStats {
  let s = projectStats.get(projectId);
  if (!s) { s = { agentStates: new Map(), lastActivityAt: 0 }; projectStats.set(projectId, s); }
  return s;
}

function wiredLog(project: Project): ChatLog {
  const log = new ChatLog(join(project.path, ".agent-room", "log.jsonl"));
  log.on("message", (m: ChatMessage) => {
    statsFor(project.id).lastActivityAt = Date.now();
    send("room:event", { projectId: project.id, kind: "message", ...m });
  });
  log.on("status", (text: string) => send("room:event", { projectId: project.id, kind: "status", text }));
  log.on("agentState", (s: { agentId: string; state: string }) => {
    statsFor(project.id).agentStates.set(s.agentId, s.state);
    send("room:event", { projectId: project.id, kind: "agentState", ...s });
    if (s.state === "needs") notifyNeedsInput(project, s.agentId);
  });
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
  quotaNotified.delete(key);
  const log = wiredLog(project);
  log.post("user", "user", `@${agent.name} ${prompt}`);
  log.agentState(agent.id, "working");
  log.status(`${agent.name} is working…`);
  try {
    const role = prependMemory(
      appendSkills(
        agent.systemPrompt
          ? { id: agent.id, name: agent.name, systemPrompt: agent.systemPrompt }
          : loadRole(rolesDir, agent.id, agent.name, `${agent.roleId ?? agent.id}.md`),
        agent,
      ),
      project,
    );
    const tail = log
      .tail(20)
      .map((m) => `[${m.role}] ${m.message}`)
      .join("\n\n");
    const fullPrompt = `Chatroom so far:\n${tail}\n\nThe user is addressing you directly:\n${prompt}`;
    const backend = makeBackend(project, agent);
    const onLine = (line: string) => { log.activity(agent.id, line); checkQuota(project, agent, line); };
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
    checkQuota(project, agent, reply);
    log.agentState(agent.id, isQuestionLike(reply) ? "needs" : "done");
  } catch (err) {
    postError(project, err);
    checkQuota(project, agent, err instanceof Error ? err.message : String(err));
    log.agentState(agent.id, "idle");
  } finally {
    running.delete(key);
    runningProcs.delete(key);
    log.status("");
  }
}

// ── Meeting room (M9): N-agent live discussion ──────────────────────
async function startMeeting(project: Project, agentIds: string[], topic: string, rounds: number): Promise<void> {
  const agents = agentIds.map((id) => project.agents?.find((a) => a.id === id)).filter((a): a is AgentRef => !!a);
  if (agents.length < 2) throw new Error("Pick at least 2 agents for a meeting.");
  const keys = agents.map((a) => `${project.id}:${a.id}`);
  const busy = keys.find((k) => running.has(k));
  if (busy) throw new Error(`${agents[keys.indexOf(busy)].name} is already busy.`);
  keys.forEach((k) => running.add(k));
  const log = wiredLog(project);
  send("room:event", { projectId: project.id, kind: "running", running: true });
  try {
    const participants = agents.map((agent) => ({
      agent: prependMemory(
        appendSkills(
          agent.systemPrompt
            ? { id: agent.id, name: agent.name, systemPrompt: agent.systemPrompt }
            : loadRole(rolesDir, agent.id, agent.name, `${agent.roleId ?? agent.id}.md`),
          agent,
        ),
        project,
      ),
      backend: makeBackend(project, agent),
    }));
    await runMeeting(topic, log, participants, rounds, true);
  } catch (err) {
    postError(project, err);
  } finally {
    keys.forEach((k) => running.delete(k));
    agents.forEach((a) => log.agentState(a.id, "idle"));
    log.status("");
    send("room:event", { projectId: project.id, kind: "running", running: false });
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
  assertAllowedBin(bin);
  const shell = process.platform === "win32" ? "cmd.exe" : (process.env.SHELL ?? "/bin/bash");
  assertAllowedBin(shell);
  const shellArgs = process.platform === "win32" ? ["/c", bin] : ["-lc", bin];
  const child = pty.spawn(shell, shellArgs, {
    name: "xterm-256color",
    cols: 80,
    rows: 30,
    cwd: project.path,
    env: { ...process.env, ...resolveSecretsEnv(project.id), ...resolveAccountEnv(project.activeAccountId) } as Record<string, string>,
  });
  ptySessions.set(key, child);
  child.onData((data) => send("pty:data", { key, data }));
  child.onExit(({ exitCode }) => {
    ptySessions.delete(key);
    send("pty:exit", { key, exitCode });
  });
  return { alreadyRunning: false };
}

// ── dev terminal (M7): a plain shell in the project directory, not tied to
// any agent — shares the ptySessions map/pty:data/pty:exit events via the
// reserved "__shell__" sentinel key, which can never collide with a real
// agent id (those come from role files or randomUUID()).
const SHELL_AGENT_KEY = "__shell__";

function startShellPty(project: Project): { alreadyRunning: boolean } {
  const key = ptyKey(project.id, SHELL_AGENT_KEY);
  if (ptySessions.has(key)) return { alreadyRunning: true };
  const shell = process.platform === "win32" ? "powershell.exe" : (process.env.SHELL ?? "/bin/bash");
  assertAllowedBin(shell);
  const child = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: 80,
    rows: 30,
    cwd: project.path,
    env: { ...process.env, ...resolveSecretsEnv(project.id), ...resolveAccountEnv(project.activeAccountId) } as Record<string, string>,
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
    return cloneAndRegister(trimmed, repoNameFrom(trimmed));
  });

  ipcMain.handle("github:connect", async (_e, { token }: { token: string }) => {
    const trimmed = (token || "").trim();
    if (!trimmed) throw new Error("Enter a GitHub personal access token.");
    const res = await githubApi("/user", trimmed);
    const user = (await res.json()) as { login: string };
    saveGithubToken(trimmed);
    writeFileSync(githubUserFile(), JSON.stringify({ login: user.login }));
    return { login: user.login };
  });

  ipcMain.handle("github:status", () => {
    const token = loadGithubToken();
    if (!token) return { connected: false as const };
    try {
      const user = JSON.parse(readFileSync(githubUserFile(), "utf8")) as { login: string };
      return { connected: true as const, login: user.login };
    } catch {
      return { connected: true as const };
    }
  });

  ipcMain.handle("github:disconnect", () => clearGithubToken());

  ipcMain.handle("github:listRepos", async () => {
    const token = loadGithubToken();
    if (!token) throw new Error("Not connected to GitHub.");
    const res = await githubApi("/user/repos?sort=updated&per_page=100", token);
    const repos = (await res.json()) as { name: string; full_name: string; clone_url: string; private: boolean; updated_at: string }[];
    return repos.map((r) => ({ name: r.name, fullName: r.full_name, cloneUrl: r.clone_url, private: r.private, updatedAt: r.updated_at }));
  });

  ipcMain.handle("projects:addGithubRepo", async (_e, { cloneUrl, name }: { cloneUrl: string; name: string }) => {
    const token = loadGithubToken();
    if (!token) throw new Error("Not connected to GitHub.");
    return cloneAndRegister(cloneUrl, name.replace(/[^\w.-]/g, "_"), token);
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
    (
      _e,
      { projectId, roleId, model, extraArgs, useWorktree }: {
        projectId: string; roleId: string; model?: string; extraArgs?: string[]; useWorktree?: boolean;
      },
    ) => {
      const projects = loadProjects();
      const p = projects.find((x) => x.id === projectId);
      if (!p) return null;
      const role = listRoles().find((r) => r.id === roleId);
      if (role) {
        // M9: multiple instances of the same role are allowed — each gets its own
        // unique id (and worktree/branch, if requested), never the bare role id.
        const existing = p.agents!.filter((a) => a.roleId === roleId || a.id === roleId).length;
        const id = existing === 0 ? roleId : `${roleId}-${randomUUID().slice(0, 8)}`;
        const name = existing === 0 ? role.name : `${role.name} ${existing + 1}`;
        const worktreePath = useWorktree ? createWorktree(p, id) : undefined;
        p.agents!.push({ id, roleId, name, model: model || undefined, extraArgs: extraArgs?.length ? extraArgs : undefined, worktreePath });
        saveProjects(projects);
      }
      return p;
    },
  );

  ipcMain.handle(
    "agents:addCustom",
    (
      _e,
      { projectId, name, systemPrompt, model, extraArgs, useWorktree }: {
        projectId: string; name: string; systemPrompt: string; model?: string; extraArgs?: string[]; useWorktree?: boolean;
      },
    ) => {
      const projects = loadProjects();
      const p = projects.find((x) => x.id === projectId);
      if (!p) return null;
      const id = randomUUID();
      const worktreePath = useWorktree ? createWorktree(p, id) : undefined;
      p.agents!.push({ id, name, systemPrompt, model: model || undefined, extraArgs: extraArgs?.length ? extraArgs : undefined, worktreePath });
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
    const agent = p.agents!.find((a) => a.id === agentId);
    if (agent?.worktreePath) removeWorktree(p, agent.worktreePath);
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

  ipcMain.handle("room:meeting", (_e, { projectId, agentIds, topic, rounds }: { projectId: string; agentIds: string[]; topic: string; rounds: number }) => {
    const p = loadProjects().find((x) => x.id === projectId);
    if (!p) throw new Error("Unknown project");
    void startMeeting(p, agentIds, topic, rounds);
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

  ipcMain.handle("projects:stats", () => {
    const out: Record<string, { blocked: number; lastActivityAt: number }> = {};
    for (const p of loadProjects()) {
      const live = projectStats.get(p.id);
      let lastActivityAt = live?.lastActivityAt ?? 0;
      if (!lastActivityAt) {
        // no live events yet this app session — fall back to the persisted log's last message
        try {
          const file = join(p.path, ".agent-room", "log.jsonl");
          const tail = existsSync(file) ? new ChatLog(file).tail(1) : [];
          lastActivityAt = tail[0] ? new Date(tail[0].ts).getTime() : 0;
        } catch {
          lastActivityAt = 0;
        }
      }
      const blocked = live ? [...live.agentStates.values()].filter((v) => v === "needs").length : 0;
      out[p.id] = { blocked, lastActivityAt };
    }
    return out;
  });

  ipcMain.handle("room:approve", async (_e, { projectId, agentId }: { projectId: string; agentId: string }) => {
    const project = loadProjects().find((p) => p.id === projectId);
    if (!project) throw new Error("Unknown project");
    const agent = project.agents!.find((a) => a.id === agentId);
    if (!agent) throw new Error("Unknown agent");
    const log = wiredLog(project);
    const { sha, message } = await approveAndCommit(project, agent, log);
    const branchLabel = agent.worktreePath ? `agent/${agent.id}` : "the working tree";
    log.post("orchestrator", "system", `Approved · ${agent.name} committed ${sha.slice(0, 7)} on ${branchLabel}: ${message.split("\n")[0]}`);
    return { sha, message };
  });

  ipcMain.handle("room:post", (_e, { projectId, text }: { projectId: string; text: string }) => {
    const project = loadProjects().find((p) => p.id === projectId);
    if (!project) throw new Error("Project not found");
    wiredLog(project).post("user", "user", text);
  });

  ipcMain.handle("tasks:list", (_e, projectId: string) => {
    const project = loadProjects().find((p) => p.id === projectId);
    return project ? loadTasks(project) : [];
  });
  ipcMain.handle("tasks:create", (_e, { projectId, title, description, assigneeAgentId, createdBy }: { projectId: string; title: string; description: string; assigneeAgentId?: string; createdBy: TaskItem["createdBy"] }) => {
    const project = loadProjects().find((p) => p.id === projectId);
    if (!project) throw new Error("Project not found");
    const task: TaskItem = { id: randomUUID(), title, description, status: "todo", assigneeAgentId, createdBy, createdAt: new Date().toISOString() };
    const tasks = loadTasks(project);
    tasks.push(task);
    saveTasks(project, tasks);
    return task;
  });
  ipcMain.handle("tasks:update", (_e, { projectId, id, patch }: { projectId: string; id: string; patch: Partial<TaskItem> }) => {
    const project = loadProjects().find((p) => p.id === projectId);
    if (!project) throw new Error("Project not found");
    const tasks = loadTasks(project);
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error("Task not found");
    tasks[idx] = { ...tasks[idx], ...patch };
    saveTasks(project, tasks);
    return tasks[idx];
  });
  ipcMain.handle("tasks:remove", (_e, { projectId, id }: { projectId: string; id: string }) => {
    const project = loadProjects().find((p) => p.id === projectId);
    if (!project) return;
    saveTasks(project, loadTasks(project).filter((t) => t.id !== id));
  });

  ipcMain.handle("fs:list", (_e, { path, sub }: { path: string; sub: string }) => listProjectDir(path, sub));
  ipcMain.handle("fs:read", (_e, { path, sub }: { path: string; sub: string }) => readProjectFile(path, sub));
  ipcMain.handle("fs:write", (_e, { path, sub, content }: { path: string; sub: string; content: string }) => writeProjectFile(path, sub, content));

  ipcMain.handle("room:commitDiff", (_e, { projectId, agentId, sha }: { projectId: string; agentId: string; sha: string }) => {
    const project = loadProjects().find((p) => p.id === projectId);
    const agent = project?.agents?.find((a) => a.id === agentId);
    const target = agent?.worktreePath ?? project?.path;
    if (!target) return { files: [], plus: 0, minus: 0, notGitRepo: true };
    return getCommitDiff(target, sha);
  });

  ipcMain.handle("room:commits", (_e, projectId: string) => {
    const project = loadProjects().find((p) => p.id === projectId);
    return project ? loadCommits(project) : [];
  });

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

  ipcMain.handle("shellpty:start", (_e, { projectId }: { projectId: string }) => {
    const project = loadProjects().find((p) => p.id === projectId);
    if (!project) throw new Error("Unknown project");
    return startShellPty(project);
  });

  ipcMain.handle("shellpty:write", (_e, { projectId, data }: { projectId: string; data: string }) => {
    ptySessions.get(ptyKey(projectId, SHELL_AGENT_KEY))?.write(data);
  });

  ipcMain.handle("shellpty:resize", (_e, { projectId, cols, rows }: { projectId: string; cols: number; rows: number }) => {
    try {
      ptySessions.get(ptyKey(projectId, SHELL_AGENT_KEY))?.resize(cols, rows);
    } catch {
      // shell already exited between the resize observer firing and this handler running
    }
  });

  ipcMain.handle("shellpty:stop", (_e, { projectId }: { projectId: string }) => {
    const key = ptyKey(projectId, SHELL_AGENT_KEY);
    ptySessions.get(key)?.kill();
    ptySessions.delete(key);
  });

  ipcMain.handle("screenshot:capture", (_e, { projectId, agentId }: { projectId: string; agentId?: string }) => {
    const project = loadProjects().find((p) => p.id === projectId);
    if (!project) throw new Error("Unknown project");
    return captureScreenshot(project, agentId);
  });

  ipcMain.handle("dictate:transcribe", (_e, { audio }: { audio: Uint8Array }) => transcribeAudio(Buffer.from(audio)));

  ipcMain.handle("tunnel:start", (_e, { projectId, port }: { projectId: string; port: number }) => {
    const project = loadProjects().find((p) => p.id === projectId);
    if (!project) throw new Error("Unknown project");
    startTunnel(project, port);
  });

  ipcMain.handle("tunnel:stop", (_e, { projectId }: { projectId: string }) => stopTunnel(projectId));

  ipcMain.handle("tunnel:status", (_e, { projectId }: { projectId: string }) => tunnelProcs.has(projectId));

  ipcMain.handle("db:pick", async () => {
    const res = await dialog.showOpenDialog(win!, {
      properties: ["openFile"],
      filters: [{ name: "SQLite database", extensions: ["db", "sqlite", "sqlite3"] }],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return res.filePaths[0];
  });

  ipcMain.handle("db:setPath", (_e, { projectId, path }: { projectId: string; path: string }) => {
    const projects = loadProjects();
    const p = projects.find((x) => x.id === projectId);
    if (!p) throw new Error("Unknown project");
    p.dbPath = path || undefined;
    saveProjects(projects);
    return p;
  });

  ipcMain.handle("db:query", (_e, { projectId, sql }: { projectId: string; sql: string }) => {
    const project = loadProjects().find((p) => p.id === projectId);
    if (!project) throw new Error("Unknown project");
    return runReadOnlyQuery(project, sql);
  });

  ipcMain.handle("secrets:list", (_e, { projectId }: { projectId: string }) => listSecretKeys(projectId));

  ipcMain.handle("secrets:set", (_e, { projectId, key, value }: { projectId: string; key: string; value: string }) => {
    setSecret(projectId, key, value);
    return listSecretKeys(projectId);
  });

  ipcMain.handle("secrets:remove", (_e, { projectId, key }: { projectId: string; key: string }) => {
    removeSecret(projectId, key);
    return listSecretKeys(projectId);
  });

  ipcMain.handle("accounts:list", () => listAccountsSafe());

  ipcMain.handle("accounts:add", (_e, { provider, name, env }: { provider: "claude" | "cursor"; name: string; env: Record<string, string> }) => {
    addAccount(provider, name, env);
    return listAccountsSafe();
  });

  ipcMain.handle("accounts:remove", (_e, { id }: { id: string }) => {
    removeAccount(id);
    return listAccountsSafe();
  });

  ipcMain.handle("accounts:setActive", (_e, { projectId, accountId }: { projectId: string; accountId?: string }) => {
    const projects = loadProjects();
    const project = projects.find((p) => p.id === projectId);
    if (!project) throw new Error("Unknown project");
    project.activeAccountId = accountId || undefined;
    saveProjects(projects);
    return project;
  });

  ipcMain.handle("agents:setModel", (_e, { projectId, agentId, model }: { projectId: string; agentId: string; model: string }) => {
    const projects = loadProjects();
    const agent = projects.find((p) => p.id === projectId)?.agents?.find((a) => a.id === agentId);
    if (!agent) throw new Error("Unknown agent");
    agent.model = model;
    saveProjects(projects);
    return agent;
  });

  ipcMain.handle("skills:list", () => listSkills());

  ipcMain.handle("skills:setForAgent", (_e, { projectId, agentId, skillIds }: { projectId: string; agentId: string; skillIds: string[] }) => {
    const projects = loadProjects();
    const project = projects.find((p) => p.id === projectId);
    const agent = project?.agents?.find((a) => a.id === agentId);
    if (!agent) throw new Error("Unknown agent");
    agent.skillIds = skillIds;
    saveProjects(projects);
    return agent;
  });

  ipcMain.handle("memory:get", (_e, { projectId }: { projectId: string }) => {
    const project = loadProjects().find((p) => p.id === projectId);
    if (!project) throw new Error("Unknown project");
    return loadMemory(project);
  });

  ipcMain.handle("memory:set", (_e, { projectId, text }: { projectId: string; text: string }) => {
    const project = loadProjects().find((p) => p.id === projectId);
    if (!project) throw new Error("Unknown project");
    saveMemory(project, text);
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
  for (const child of tunnelProcs.values()) killProcessTree(child);
  tunnelProcs.clear();
  app.quit();
});
