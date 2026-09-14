import { normalizeUsage } from './usage.js';
import { randomUUID } from 'node:crypto';
import type { AgentBackend, RoleConfig } from '../backend/agentBackend.js';
import type { AuditInput } from './audit.js';
import type { BudgetPool } from './budget.js';
import type { RunScope } from './types.js';
import { assertRunScope, createAttempt } from './runScope.js';
interface Options {
 beforeInvoke?:()=>void;
 budget?:BudgetPool;
 scope: RunScope;
 provider: string;
 model: string;
 journal: { append(event: AuditInput): unknown };
 signal?: AbortSignal;
}
/** Wrap BELOW capability orchestration so each model invocation is counted once. */
export function withInvocation(backend: AgentBackend, options: Options): AgentBackend {
 assertRunScope(options.scope);
 const scope = Object.freeze({ ...options.scope });
 async function invoke<T>(role: RoleConfig, execute: () => Promise<T>): Promise<T> {
  if (role.id !== scope.agentId) throw new Error('Agent identity mismatch');
  if (options.signal?.aborted) throw new Error('Execution cancelled before dispatch');
  options.beforeInvoke?.();
  const attempt = createAttempt(scope, options.provider, options.model);
  const start = Date.now();
  let usage = normalizeUsage(undefined);
  const emit = (kind: string, status: string) => options.journal.append({eventId:randomUUID(),scope,
   callId:attempt.callId,attemptId:attempt.attemptId,kind,
   metadata:{provider:attempt.provider,model:attempt.model,status,durationMs:Math.max(0,Date.now()-start),...(kind==='attempt-settled'?usage:{})}});
  const reservation=options.budget?.reserve(scope.taskId,{attemptId:attempt.attemptId,calls:1});
  try{emit('attempt-started','started');}catch(error){if(reservation)options.budget?.discardBeforeDispatch(reservation);throw error;}
  // A request is distinct from termination: providers may only settle naturally.
  let cancellationAuditFailure: unknown;
  const cancelled = () => {
   try { emit('attempt-cancel-requested','requested'); } catch (error) { cancellationAuditFailure = error; }
  };
  options.signal?.addEventListener('abort',cancelled,{once:true});
  try {
   let result: T;
   try { result = await execute(); usage=normalizeUsage((result as {usage?:unknown})?.usage); } catch (error) {
    usage=normalizeUsage((error as {usage?:unknown})?.usage);
    emit('attempt-failed','failed');
    throw error;
   }
   emit('attempt-completed','completed');
   if (cancellationAuditFailure !== undefined) throw cancellationAuditFailure;
   return result;
  } finally {
   options.signal?.removeEventListener('abort',cancelled);
   try{emit('attempt-settled','settled');}finally{options.budget?.settle(attempt.attemptId);}
  }
 }
 return {
  start:(role,prompt,onLine,onProcess)=>invoke(role,()=>backend.start(role,prompt,onLine,onProcess)),
  resume:(sessionId,prompt,role,onLine,onProcess)=>invoke(role,()=>backend.resume(sessionId,prompt,role,onLine,onProcess)),
 };
}
