export interface AgentRef {
  id: string;
  name: string;
  systemPrompt?: string;
  model?: string;
  extraArgs?: string[];
}

export interface Project {
  id: string;
  name: string;
  path: string;
  backend: "cursor" | "claude";
  model?: string;
  agents: AgentRef[];
  repoUrl?: string;
}

export interface Msg {
  ts: string;
  agentId?: string;
  role: string;
  message: string;
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

export interface DiffLine { kind: "add" | "del" | "ctx"; text: string; ln: number }
export interface DiffFile { name: string; plus: number; minus: number; lines: DiffLine[] }
export interface DiffResult { files: DiffFile[]; plus: number; minus: number; notGitRepo: boolean }

export interface DesktopApi {
  listRoles(): Promise<AgentRef[]>;
  listProjects(): Promise<Project[]>;
  addProject(): Promise<Project | null>;
  cloneRepo(url: string): Promise<Project | null>;
  updateProject(u: Partial<Project> & { id: string }): Promise<Project>;
  removeProject(id: string): Promise<void>;
  addAgent(projectId: string, roleId: string, model?: string, extraArgs?: string[]): Promise<Project | null>;
  addCustomAgent(projectId: string, name: string, systemPrompt: string, model?: string, extraArgs?: string[]): Promise<Project | null>;
  removeAgent(projectId: string, agentId: string): Promise<Project | null>;
  getLog(id: string): Promise<Msg[]>;
  runTask(projectId: string, task: string): Promise<void>;
  sendToAgent(projectId: string, agentId: string, prompt: string): Promise<void>;
  pauseAgent(projectId: string, agentId: string): Promise<boolean>;
  startPty(projectId: string, agentId: string): Promise<{ alreadyRunning: boolean }>;
  writePty(projectId: string, agentId: string, data: string): Promise<void>;
  resizePty(projectId: string, agentId: string, cols: number, rows: number): Promise<void>;
  stopPty(projectId: string, agentId: string): Promise<void>;
  onPtyData(cb: (e: { key: string; data: string }) => void): () => void;
  onPtyExit(cb: (e: { key: string; exitCode: number }) => void): () => void;
  getRunning(): Promise<string[]>;
  gitBranch(path: string): Promise<string>;
  getDiff(path: string): Promise<DiffResult>;
  onEvent(cb: (e: RoomEvent) => void): void;
}

declare global {
  // exposed by preload.ts via contextBridge
  const api: DesktopApi;
}
