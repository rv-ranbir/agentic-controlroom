export interface AgentRef {
  id: string;
  roleId?: string;
  name: string;
  systemPrompt?: string;
  model?: string;
  extraArgs?: string[];
  worktreePath?: string;
  skillIds?: string[];
}

export interface Project {
  id: string;
  name: string;
  path: string;
  backend: "cursor" | "claude";
  model?: string;
  agents: AgentRef[];
  repoUrl?: string;
  zone?: "Work" | "Personal" | "Side";
  lastOpenedAt?: number;
  dbPath?: string;
  activeAccountId?: string;
}

export interface Msg {
  ts: string;
  agentId?: string;
  role: string;
  message: string;
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

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "done";
  assigneeAgentId?: string;
  createdBy: "pm" | "sm" | "user";
  createdAt: string;
}

export interface RoomEvent {
  projectId: string;
  kind: "message" | "status" | "agentState" | "activity" | "running" | "done";
  [k: string]: unknown;
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
  listRoles(): Promise<AgentRef[]>;
  listProjects(): Promise<Project[]>;
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
  addToLibrary(name: string, systemPrompt: string, model: string | undefined, extraArgs: string[] | undefined, skillIds: string[] | undefined): Promise<LibraryAgent>;
  removeFromLibrary(id: string): Promise<void>;
  listTeams(): Promise<Team[]>;
  addTeam(name: string, members: TeamMember[]): Promise<Team>;
  removeTeam(id: string): Promise<void>;
  startMeeting(projectId: string, agentIds: string[], topic: string, rounds: number): Promise<void>;
  listTasks(projectId: string): Promise<TaskItem[]>;
  createTask(projectId: string, title: string, description: string, assigneeAgentId: string | undefined, createdBy: TaskItem["createdBy"]): Promise<TaskItem>;
  updateTask(projectId: string, id: string, patch: Partial<TaskItem>): Promise<TaskItem>;
  removeTask(projectId: string, id: string): Promise<void>;
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
  addAccount(provider: "claude" | "cursor", name: string, env: Record<string, string>): Promise<{ id: string; provider: string; name: string; envKeys: string[] }[]>;
  removeAccount(id: string): Promise<{ id: string; provider: string; name: string; envKeys: string[] }[]>;
  setActiveAccount(projectId: string, accountId?: string): Promise<Project>;
  onQuotaEvent(cb: (e: { projectId: string; agentId: string }) => void): () => void;
  listSkills(): Promise<{ id: string; name: string }[]>;
  setAgentSkills(projectId: string, agentId: string, skillIds: string[]): Promise<AgentRef>;
  getMemory(projectId: string): Promise<string>;
  setMemory(projectId: string, text: string): Promise<void>;
  getRunning(): Promise<string[]>;
  gitBranch(path: string): Promise<string>;
  getDiff(path: string): Promise<DiffResult>;
  onEvent(cb: (e: RoomEvent) => void): void;
}

declare global {
  // exposed by preload.ts via contextBridge
  const api: DesktopApi;
}
