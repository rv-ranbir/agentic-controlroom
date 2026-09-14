import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunScope, createChildScope, createAttempt, retryAttempt, assertRunScope } from './runScope.js';

test('project scopes and runs never share identity even for the same agent', () => {
 const a = createRunScope('project-a', 'analyst');
 const b = createRunScope('project-b', 'analyst');
 assert.notEqual(a.runId, b.runId);
 assert.notEqual(a.taskId, b.taskId);
 assert.equal(a.projectId, 'project-a');
 assert.ok(Object.isFrozen(a));
});
test('children retain run and immediate parent without mutating the parent', () => {
 const parent = createRunScope('project', 'manager');
 const child = createChildScope(parent, 'researcher');
 const grandchild = createChildScope(child, 'checker');
 assert.equal(child.runId, parent.runId);
 assert.equal(child.projectId, parent.projectId);
 assert.equal(child.parentTaskId, parent.taskId);
 assert.equal(grandchild.parentTaskId, child.taskId);
 assert.notEqual(child.taskId, parent.taskId);
 assert.equal(parent.parentTaskId, undefined);
});
test('retry retains logical call and scope but continuation starts a new call', () => {
 const scope = createRunScope('project', 'agent');
 const first = createAttempt(scope, 'codex', 'default');
 const retry = retryAttempt(first);
 const continuation = createAttempt(scope, 'codex', 'default');
 assert.equal(first.callId, retry.callId);
 assert.notEqual(first.attemptId, retry.attemptId);
 assert.notEqual(first.callId, continuation.callId);
 assert.deepEqual(retry.scope, first.scope);
 assert.ok(Object.isFrozen(first));
 assert.ok(Number.isFinite(Date.parse(first.startedAt)));
});
test('invalid identity rejects before any execution and copied scopes are immutable', () => {
 for (const value of ['', ' ', '../escape', 'bad\\path', 'a/b', 'x\n']) {
  assert.throws(() => createRunScope(value, 'agent'));
 }
 const scope = createRunScope('project', 'agent');
 assert.throws(() => assertRunScope({ ...scope, runId: '' }));
 assert.throws(() => assertRunScope({ ...scope, projectId: undefined }));
 assert.throws(() => createAttempt(scope, '', 'default'));
 const mutable = { ...scope };
 const attempt = createAttempt(mutable, 'provider', '');
 mutable.projectId = 'other';
 assert.equal(attempt.scope.projectId, 'project');
 assert.ok(Object.isFrozen(attempt.scope));
});
