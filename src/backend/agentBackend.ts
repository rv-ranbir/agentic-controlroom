export interface RoleConfig {
  id: string;
  name: string;
  systemPrompt: string;
}

export interface StartResult {
  sessionId: string;
  reply: string;
}

export interface AgentBackend {
  start(role: RoleConfig, prompt: string): Promise<StartResult>;
  resume(sessionId: string, prompt: string, role: RoleConfig): Promise<{ reply: string }>;
}
