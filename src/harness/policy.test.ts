import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPolicy, resolvePolicy } from './policy.js';
import { launchWithPolicy, unavailableIsolationDriver } from './isolation.js';
import { createRunScope, createAttempt } from './runScope.js';

test('provider-managed remains explicit about absent app enforcement', () => {
 const report = resolvePolicy(defaultPolicy());
 assert.equal(report.enforced, false);
 assert.match(report.mechanism, /provider/i);
 assert.ok(report.unsupported.length > 0);
});
test('unavailable isolation rejects before launching anything', async () => {
 const requested = { ...defaultPolicy(), mode: 'isolated-workspace' as const, network: 'off' as const };
 const report = resolvePolicy(requested);
 assert.equal(report.enforced, false);
 const attempt = createAttempt(createRunScope('p', 'a'), 'codex', '');
 await assert.rejects(launchWithPolicy(unavailableIsolationDriver, attempt, { executable: 'never-spawn', args: [], cwd: '.' }, requested), /unavailable/i);
});
test('capability gaps are independent and cannot be hidden by a mode label', () => {
 const requested = { ...defaultPolicy(), mode: 'isolated-workspace' as const, network: 'off' as const, maxWallMs: 10 };
 const report = resolvePolicy(requested, { mechanism: 'test-only', verified: false, readOnly: true, workspace: true, networkOff: true, networkAllowlist: true, descendants: true, wallTime: true, calls: true, concurrency: true });
 assert.equal(report.enforced, false);
 assert.ok(report.unsupported.includes('verified isolation boundary'));
 const partial = resolvePolicy(requested, { mechanism: 'test-only', verified: true, readOnly: true, workspace: true, networkOff: false, networkAllowlist: false, descendants: false, wallTime: false, calls: false, concurrency: false });
 assert.equal(partial.enforced, false);
 assert.ok(partial.unsupported.includes('network off'));
 assert.ok(partial.unsupported.includes('descendant containment'));
 assert.ok(partial.unsupported.includes('wall time'));
});
test('invalid policy rejects; reports snapshot caller-owned arrays', () => {
 for (const patch of [{maxCalls:-1},{maxWallMs:NaN},{maxConcurrent:1.5},{mode:'host'},{network:'anything'},{domains:['https://example.com/path']}]) {
  assert.throws(() => resolvePolicy({...defaultPolicy(),...patch} as never));
 }
 const policy = defaultPolicy();
 const report = resolvePolicy(policy);
 policy.domains.push('changed.example');
 assert.deepEqual(report.requested.domains, []);
});
