import type { ChildProcess } from "node:child_process";

export interface RoleConfig {
  id: string;
  name: string;
  systemPrompt: string;
}

export interface BackendUsage { inputTokens:number|null; outputTokens:number|null; costUsd:number|null; reportedCost?:number|null; currency?:string|null; cacheReadTokens?:number|null; cacheWriteTokens?:number|null; reasoningTokens?:number|null; source?:"provider"|"estimated"|"unavailable" }
export interface ReplyResult {reply:string;usage?:BackendUsage}
export interface StartResult {
  sessionId: string;
  reply: string;
  usage?: BackendUsage;
}

/** Called with each raw output line while the agent works (tool calls, text deltas). */
export type OnLine = (line: string) => void;

/** Called once with the spawned child process, so callers can track/kill it (e.g. a real "pause"). */
export type OnProcess = (child: ChildProcess) => void;

export interface AgentBackend {
  start(role: RoleConfig, prompt: string, onLine?: OnLine, onProcess?: OnProcess): Promise<StartResult>;
  resume(sessionId: string, prompt: string, role: RoleConfig, onLine?: OnLine, onProcess?: OnProcess): Promise<ReplyResult>;
}
