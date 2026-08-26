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

export interface AgentBackend {
  start(role: RoleConfig, prompt: string, onLine?: OnLine): Promise<StartResult>;
  resume(sessionId: string, prompt: string, role: RoleConfig, onLine?: OnLine): Promise<{ reply: string }>;
}
