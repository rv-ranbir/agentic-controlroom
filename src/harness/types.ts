/** App-owned identity; never a provider session or a filesystem path. */
export interface RunScope {
 readonly projectId: string;
 readonly runId: string;
 readonly agentId: string;
 readonly taskId: string;
 readonly parentTaskId?: string;
}
export interface Attempt {
 readonly scope: RunScope;
 readonly callId: string;
 readonly attemptId: string;
 readonly provider: string;
 readonly model: string;
 readonly startedAt: string;
}
export type Protection = 'provider-managed' | 'read-only' | 'isolated-workspace';
export interface ExecutionPolicy {
 mode: Protection;
 network: 'provider-managed' | 'off' | 'allowlist';
 domains: string[];
 maxWallMs: number;
 maxCalls: number;
 maxConcurrent: number;
}
export interface EffectivePolicy {
 requested: ExecutionPolicy;
 enforced: boolean;
 mechanism: string;
 unsupported: string[];
}
