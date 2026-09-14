import { randomUUID } from 'node:crypto';
import type { Attempt, RunScope } from './types.js';

export function assertIdentity(value: unknown, field: string): asserts value is string {
 if (typeof value !== 'string' || !value.trim() || value.length > 200 ||
     /[\x00-\x1f\x7f/\\]/.test(value) || value === '.' || value === '..') {
  throw new Error(`Invalid ${field}`);
 }
}
export function assertRunScope(value: unknown): asserts value is RunScope {
 if (!value || typeof value !== 'object') throw new Error('Invalid run scope');
 const scope = value as RunScope;
 for (const field of ['projectId', 'runId', 'agentId', 'taskId'] as const) assertIdentity(scope[field], field);
 if (scope.parentTaskId !== undefined) assertIdentity(scope.parentTaskId, 'parentTaskId');
}
function snapshot(scope: RunScope): RunScope {
 assertRunScope(scope);
 return Object.freeze({ projectId: scope.projectId, runId: scope.runId, agentId: scope.agentId,
  taskId: scope.taskId, ...(scope.parentTaskId === undefined ? {} : { parentTaskId: scope.parentTaskId }) });
}
export function createRunScope(projectId: string, agentId: string): RunScope {
 return snapshot({ projectId, agentId, runId: randomUUID(), taskId: randomUUID() });
}
export function createChildScope(parent: RunScope, agentId: string): RunScope {
 assertRunScope(parent);
 return snapshot({ projectId: parent.projectId, runId: parent.runId, agentId,
  taskId: randomUUID(), parentTaskId: parent.taskId });
}
export function createAttempt(scope: RunScope, provider: string, model: string): Attempt {
 assertIdentity(provider, 'provider');
 // An empty model means the provider's configured default, not a guessed model.
 if (typeof model !== 'string' || model.length > 200 || /[\x00-\x1f\x7f]/.test(model)) throw new Error('Invalid model');
 return Object.freeze({ scope: snapshot(scope), provider, model, callId: randomUUID(),
  attemptId: randomUUID(), startedAt: new Date().toISOString() });
}
export function retryAttempt(previous: Attempt): Attempt {
 assertIdentity(previous.callId, 'callId');
 assertIdentity(previous.attemptId, 'attemptId');
 return Object.freeze({ ...createAttempt(previous.scope, previous.provider, previous.model), callId: previous.callId });
}
