import type { AuditEvent } from "../../harness/audit";
import type { EffectivePolicy, ExecutionPolicy } from "../../harness/types";
import type { ExecutionState } from "../../harness/projectHarness";

export type { AuditEvent, EffectivePolicy, ExecutionPolicy, ExecutionState };

export interface AgentRef {
  id: string;
  roleId?: string;
  name: string;
  systemPrompt?: string;
  model?: string;
  extraArgs?: string[];
  worktreePath?: string;
  skillIds?: string[];
  provider?: Project["backend"];
  keyEnv?: string;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  backend: "codex" | "cursor" | "claude" | "openrouter" | "openai" | "anthropic" | "gemini" | "ollama";
  model?: string;
  agents: AgentRef[];
  repoUrl?: string;
  zone?: "Work" | "Personal" | "Side";
  lastOpenedAt?: number;
  dbPath?: string;
  activeAccountId?: string;
  allowedBackends?: Project["backend"][];
}

export interface Msg {
  ts: string;
  agentId?: string;
  role: string;
  message: string;
  viewId?: string;
  revision?: number;
  previousArtifactId?: string;
  artifactId?: string;
  rawReply?: string;
}

export interface LibraryAgent {
  id: string;
  name: string;
  systemPrompt: string;
  model?: string;
  extraArgs?: string[];
  skillIds?: string[];
  createdAt: string;
}

export interface TeamMember {
  source: "role" | "library";
  refId: string;
}
export interface Team {
  id: string;
  name: string;
  members: TeamMember[];
  createdAt: string;
}

export interface Category {
  id: string;
  label: string;
  order: number;
  members: TeamMember[];
}
export interface AdminConfig {
  tokenSaving: boolean;
  globalAllowlist: Project["backend"][];
  categoryAllowlist: Record<string, Project["backend"][]>;
  categories: Category[];
}

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "done";
  assigneeAgentId?: string;
  createdBy: string;
  attachments?: string[];
  createdAt: string;
  sourcePlanningMessageId?: string;
}

export interface PlanningMessage {
  viewId?: string;
  revision?: number;
  previousArtifactId?: string;
  artifactId?: string;
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  attachments?: string[];
  createdAt: string;
}

export interface RoomEvent {
  projectId: string;
  kind: "message" | "status" | "agentState" | "activity" | "running" | "done";
  [k: string]: unknown;
}

/** An active meeting/debate session, as tracked by the main-process office presence registry. */
export interface OfficeSession {
  id: string;
  projectId: string;
  kind: "meeting" | "debate" | "planning";
  agentIds: string[];
}

export type Bucket = "needs" | "review" | "active" | "seen" | "idle";

export interface StreamItem {
  ts: string;
  agentId: string;
  kind: "tool";
  text: string;
  raw?: string;
}

export interface DiffLine { kind: "add" | "del" | "ctx"; text: string; ln: number; oldLn?: number; newLn?: number }
export interface DiffFile { name: string; plus: number; minus: number; lines: DiffLine[] }
export interface DiffResult { files: DiffFile[]; plus: number; minus: number; notGitRepo: boolean }

export interface CommitRecord {
  sha: string;
  agentId: string;
  agentName: string;
  message: string;
  ts: string;
  conversationSnippet: string;
}

export interface DesktopApi {
  getAgentContexts(projectId:string,agentId:string):Promise<import('../../harness/contextSession').ContextInspection[]>;
  getContextSource(projectId:string,agentId:string,id:string,checkpointId:string):Promise<import('../../harness/context').ContextManifest>;
  compactAgentContext(projectId:string,agentId:string,id:string):Promise<void>;
  reconcileAgentContext(projectId:string,agentId:string,id:string):Promise<void>;
  saveProjectUsage(projectId:string,format:'json'|'csv',filter?:import('../../harness/usage').UsageFilter):Promise<boolean>;
  getProjectUsage(projectId:string,filter?:import('../../harness/usage').UsageFilter):Promise<import('../../harness/usage').UsageReport>;
  exportProjectUsage(projectId:string,format:'json'|'csv',filter?:import('../../harness/usage').UsageFilter):Promise<string>;
  getExecutionState(projectId: string): Promise<ExecutionState>;
  saveExecutionPolicy(projectId: string, policy: ExecutionPolicy): Promise<ExecutionState>;
  cancelExecutionRun(projectId: string, runId: string): Promise<boolean>;
  updateAgentRuntime(id:string,agentId:string,config:{provider:string;model:string;keyEnv:string}):Promise<void>;
  listRoles(): Promise<AgentRef[]>;
  listProjects(): Promise<Project[]>;
  getProjectDashboard(id:string):Promise<{label:string;url:string}|null>;
  openProjectDashboard(id:string):Promise<void>;
  addProject(): Promise<Project | null>;
  cloneRepo(url: string): Promise<Project | null>;
  githubConnect(token: string): Promise<{ login: string }>;
  githubStatus(): Promise<{ connected: boolean; login?: string }>;
  githubDisconnect(): Promise<void>;
  githubListRepos(): Promise<{ name: string; fullName: string; cloneUrl: string; private: boolean; updatedAt: string }[]>;
  cloneGithubRepo(cloneUrl: string, name: string): Promise<Project | null>;
  updateProject(u: Partial<Project> & { id: string }): Promise<Project>;
  removeProject(id: string): Promise<void>;
  addAgent(projectId: string, roleId: string, model?: string, extraArgs?: string[], useWorktree?: boolean): Promise<Project | null>;
  addCustomAgent(projectId: string, name: string, systemPrompt: string, model?: string, extraArgs?: string[], useWorktree?: boolean): Promise<Project | null>;
  removeAgent(projectId: string, agentId: string): Promise<Project | null>;
  getLog(id: string): Promise<Msg[]>;
  runTask(projectId: string, task: string): Promise<void>;
  sendToAgent(projectId: string, agentId: string, prompt: string): Promise<void>;
  pauseAgent(projectId: string, agentId: string): Promise<boolean>;
  getProjectStats(): Promise<Record<string, { blocked: number; lastActivityAt: number }>>;
  approveDiff(projectId: string, agentId: string): Promise<{ sha: string; message: string }>;
  getCommits(projectId: string): Promise<CommitRecord[]>;
  getCommitDiff(projectId: string, agentId: string, sha: string): Promise<DiffResult>;
  postBroadcast(projectId: string, text: string): Promise<void>;
  listLibrary(): Promise<LibraryAgent[]>;
  importAgentFromGithub(url: string): Promise<LibraryAgent>;
  addToLibrary(name: string, systemPrompt: string, model: string | undefined, extraArgs: string[] | undefined, skillIds: string[] | undefined): Promise<LibraryAgent>;
  removeFromLibrary(id: string): Promise<void>;
  listTeams(): Promise<Team[]>;
  addTeam(name: string, members: TeamMember[]): Promise<Team>;
  removeTeam(id: string): Promise<void>;

  getAdminConfig(): Promise<AdminConfig>;
  setTokenSaving(enabled: boolean): Promise<AdminConfig>;
  setGlobalAllowlist(list: Project["backend"][]): Promise<AdminConfig>;
  setCategoryAllowlist(categoryId: string, list: Project["backend"][]): Promise<AdminConfig>;
  addCategory(label: string): Promise<AdminConfig>;
  renameCategory(id: string, label: string): Promise<AdminConfig>;
  removeCategory(id: string): Promise<AdminConfig>;
  reorderCategories(orderedIds: string[]): Promise<AdminConfig>;
  setCategoryMembers(categoryId: string, members: TeamMember[]): Promise<AdminConfig>;
  startMeeting(projectId: string, agentIds: string[], topic: string, rounds: number): Promise<void>;
  startDebate(projectId: string, analystIds: string[], managerId: string, topic: string, maxRounds: number): Promise<void>;
  listTasks(projectId: string): Promise<TaskItem[]>;
  createTask(projectId: string, title: string, description: string, assigneeAgentId: string | undefined, createdBy: TaskItem["createdBy"], attachments?: string[], sourcePlanningMessageId?: string): Promise<TaskItem>;
  pickAttachment(): Promise<string | null>;
  openAttachment(path: string): Promise<void>;
  updateTask(projectId: string, id: string, patch: Partial<TaskItem>): Promise<TaskItem>;
  removeTask(projectId: string, id: string): Promise<void>;
  listPlanning(projectId: string): Promise<PlanningMessage[]>;
  postPlanning(projectId: string, authorId: string, authorName: string, text: string, attachments?: string[]): Promise<PlanningMessage>;
  commentPlanning(projectId: string, agentId: string): Promise<PlanningMessage>;
  listDir(projectPath: string, sub: string): Promise<{ name: string; path: string; isDir: boolean }[]>;
  readFile(projectPath: string, sub: string): Promise<{ content: string } | { error: string }>;
  writeFile(projectPath: string, sub: string, content: string): Promise<void>;
  startPty(projectId: string, agentId: string): Promise<{ alreadyRunning: boolean }>;
  writePty(projectId: string, agentId: string, data: string): Promise<void>;
  resizePty(projectId: string, agentId: string, cols: number, rows: number): Promise<void>;
  stopPty(projectId: string, agentId: string): Promise<void>;
  onPtyData(cb: (e: { key: string; data: string }) => void): () => void;
  onPtyExit(cb: (e: { key: string; exitCode: number }) => void): () => void;
  startShellPty(projectId: string): Promise<{ alreadyRunning: boolean }>;
  writeShellPty(projectId: string, data: string): Promise<void>;
  resizeShellPty(projectId: string, cols: number, rows: number): Promise<void>;
  stopShellPty(projectId: string): Promise<void>;
  captureScreenshot(projectId: string, agentId?: string): Promise<string>;
  transcribeAudio(audio: Uint8Array): Promise<string>;
  startTunnel(projectId: string, port: number): Promise<void>;
  stopTunnel(projectId: string): Promise<void>;
  getTunnelStatus(projectId: string): Promise<boolean>;
  onTunnelEvent(cb: (e: { projectId: string; kind: string; url?: string; message?: string }) => void): () => void;
  pickDbFile(): Promise<string | null>;
  setDbPath(projectId: string, path: string): Promise<Project>;
  runDbQuery(projectId: string, sql: string): Promise<{ columns: string[]; rows: unknown[][] }>;
  listSecretKeys(projectId: string): Promise<string[]>;
  setSecret(projectId: string, key: string, value: string): Promise<string[]>;
  removeSecret(projectId: string, key: string): Promise<string[]>;
  setAgentModel(projectId: string, agentId: string, model: string): Promise<AgentRef>;
  listAccounts(): Promise<{ id: string; provider: string; name: string; envKeys: string[] }[]>;
  addAccount(provider: "codex" | "claude" | "cursor" | "openrouter" | "openai" | "anthropic" | "gemini" | "ollama", name: string, env: Record<string, string>): Promise<{ id: string; provider: string; name: string; envKeys: string[] }[]>;
  removeAccount(id: string): Promise<{ id: string; provider: string; name: string; envKeys: string[] }[]>;
  setActiveAccount(projectId: string, accountId?: string): Promise<Project>;
  onQuotaEvent(cb: (e: { projectId: string; agentId: string }) => void): () => void;
  listSkills(): Promise<{ id: string; name: string }[]>;
  importSkillFromGithub(url: string): Promise<{ id: string; name: string }>;
  setAgentSkills(projectId: string, agentId: string, skillIds: string[]): Promise<AgentRef>;
  getMemory(projectId: string): Promise<string>;
  setMemory(projectId: string, text: string): Promise<void>;
  getRunning(): Promise<string[]>;
  getOfficePresence(): Promise<OfficeSession[]>;
  onOfficePresence(cb: (sessions: OfficeSession[]) => void): () => void;
  gitBranch(path: string): Promise<string>;
  getDiff(path: string): Promise<DiffResult>;
  getArtifactThumbnail(projectId:string,artifactId:string):Promise<{dataUrl:string;width:number;height:number}>;
  getArtifactPreview(projectId: string, artifactId: string): Promise<{ title: string; html: string }>;
  onEvent(cb: (e: RoomEvent) => void): void;
}

declare global {
  // exposed by preload.ts via contextBridge
  const api: DesktopApi;
}
