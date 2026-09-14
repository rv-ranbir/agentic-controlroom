import type { EffectivePolicy, ExecutionPolicy } from './types.js';
export interface EnforcementCapabilities {
 mechanism: string;
 verified: boolean;
 readOnly: boolean;
 workspace: boolean;
 networkOff: boolean;
 networkAllowlist: boolean;
 descendants: boolean;
 wallTime: boolean;
 calls: boolean;
 concurrency: boolean;
}
/** Zero means no app-enforced bound; existing provider restrictions still apply. */
export function defaultPolicy(): ExecutionPolicy {
 return { mode: 'provider-managed', network: 'provider-managed', domains: [], maxWallMs: 0, maxCalls: 0, maxConcurrent: 0 };
}
export function resolvePolicy(policy: ExecutionPolicy, capabilities?: EnforcementCapabilities): EffectivePolicy {
 if (!policy || !['provider-managed', 'read-only', 'isolated-workspace'].includes(policy.mode) ||
     !['provider-managed', 'off', 'allowlist'].includes(policy.network)) throw new Error('Invalid execution policy');
 for (const field of ['maxWallMs', 'maxCalls', 'maxConcurrent'] as const) {
  if (!Number.isSafeInteger(policy[field]) || policy[field] < 0) throw new Error(`Invalid ${field}`);
 }
 if (!Array.isArray(policy.domains) || policy.domains.length > 100 || policy.domains.some(d => typeof d !== 'string' || d.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(d))) throw new Error('Invalid domain allowlist');
 const requested = { ...policy, domains: [...policy.domains] };
 const unsupported: string[] = [];
 if (policy.mode === 'provider-managed') unsupported.push('app-enforced filesystem isolation');
 else {
  if (!capabilities?.verified) unsupported.push('verified isolation boundary');
  if (policy.mode === 'read-only' && !capabilities?.readOnly) unsupported.push('read-only filesystem');
  if (policy.mode === 'isolated-workspace' && !capabilities?.workspace) unsupported.push('workspace boundary');
  if (!capabilities?.descendants) unsupported.push('descendant containment');
 }
 if (policy.network === 'off' && !capabilities?.networkOff) unsupported.push('network off');
 if (policy.network === 'allowlist' && !capabilities?.networkAllowlist) unsupported.push('network allowlist');
 if (policy.maxWallMs > 0 && !capabilities?.wallTime) unsupported.push('wall time');
 if (policy.maxCalls > 0 && !capabilities?.calls) unsupported.push('call budget');
 if (policy.maxConcurrent > 0 && !capabilities?.concurrency) unsupported.push('concurrency budget');
 return { requested, enforced: unsupported.length === 0, mechanism: capabilities?.mechanism ?? 'Provider-managed permissions; no verified app isolation driver', unsupported };
}
