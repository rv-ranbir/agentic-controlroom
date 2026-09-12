import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createErrorLog, appErrorLogPath } from './errorLog.js';
test('error log persists stack and context while redacting credentials and rotating', () => {
 const path = join(mkdtempSync(join(tmpdir(), 'error-log-')), 'errors.jsonl');
 const log = createErrorLog(path, 1);
 log('agent.run', new Error('token=private Bearer private sk-private'), { projectId: 'project-one', agentId: 'agent-one' });
 const entry = JSON.parse(readFileSync(path, 'utf8'));
 assert.equal(entry.projectId, 'project-one'); assert.equal(entry.app, 'Agent Room'); assert.equal(entry.agentId, 'agent-one'); assert.ok(entry.error.includes('Error:')); assert.ok(!entry.error.includes('private'));
 log('renderer.error', 'second');
 assert.equal(JSON.parse(readFileSync(path, 'utf8')).error, 'second');
 assert.equal(JSON.parse(readFileSync(path + '.1', 'utf8')).source, 'agent.run');
});
test('diagnostic write failures do not throw', () => {
 const path = join(mkdtempSync(join(tmpdir(), 'error-log-')));
 assert.doesNotThrow(() => createErrorLog(path)('test', new Error('failure')));
});

test('app diagnostics have their own folder and custom profiles stay isolated', () => {
 const base = join(tmpdir(), 'app-data');
 assert.equal(appErrorLogPath(base, join(base, 'Electron')), join(base, 'Agent Room', 'logs', 'errors.jsonl'));
 const custom = join(tmpdir(), 'isolated-profile');
 assert.equal(appErrorLogPath(base, custom), join(custom, 'Agent Room', 'logs', 'errors.jsonl'));
});
