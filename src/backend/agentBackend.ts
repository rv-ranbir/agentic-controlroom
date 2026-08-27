import type { ChildProcess } from "node:child_process";

export interface RoleConfig {
  id: string;
  name: string;
  systemPrompt: string;
}

export interface StartResult {
  sessionId: string;
  reply: string;
}

/** Called with each raw output line while the agent works (tool calls, text deltas). */
export type OnLine = (line: string) => void;

/** Called once with the spawned child process, so callers can track/kill it (e.g. a real "pause"). */
export type OnProcess = (child: ChildProcess) => void;

export interface AgentBackend {
  start(role: RoleConfig, prompt: string, onLine?: OnLine, onProcess?: OnProcess): Promise<StartResult>;
  resume(sessionId: string, prompt: string, role: RoleConfig, onLine?: OnLine, onProcess?: OnProcess): Promise<{ reply: string }>;
}
