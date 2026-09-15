import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CheckpointStore, type CheckpointSummary } from './checkpoint.js';
import type { ContextManifest } from './context.js';

const folder = () => mkdtempSync(join(tmpdir(), 'agent-room-checkpoint-'));
const manifest = (projectId: string = randomUUID(), taskId: string = randomUUID()): ContextManifest => ({
 version: 1, projectId, taskId, pinned: ['pinned'], recent: ['recent'], decisions: ['decision'],
 unresolved: ['unresolved'], artifactIds: ['artifact'], toolArguments: ['tool-argument']
});
const summary = (value: ContextManifest): CheckpointSummary => ({
 summary: `summary for ${value.taskId}`, pinned: [...value.pinned], decisions: [...value.decisions],
 unresolved: [...value.unresolved], nextActions: ['next']
});
const sourceDir = (project: string) => join(project, '.agentic-controlroom', 'harness', 'context-sources');
const checkpointDir = (project: string) => join(project, '.agentic-controlroom', 'harness', 'context-checkpoints');

test('compacts, lists, gets, sources, and survives restart without exposing extra fields', async () => {
 const project = folder(), value = manifest(), store = new CheckpointStore(project, value.projectId);
 const checkpoint = await store.compact(value, async input => summary(input));
 assert.match(checkpoint.id, /^[0-9a-f-]{36}$/i);
 assert.equal(checkpoint.projectId, value.projectId);
 assert.deepEqual(await store.list(value.taskId), [checkpoint]);
 assert.deepEqual(await store.get(value.taskId, checkpoint.id), checkpoint);
 assert.deepEqual(await store.source(value.taskId, checkpoint.sourceId), value);
 assert.equal(JSON.stringify(checkpoint).includes('tool-argument'), false);
 assert.equal(JSON.stringify(checkpoint).includes('private'), false);
 const restarted = new CheckpointStore(project, value.projectId);
 assert.deepEqual(await restarted.get(value.taskId, checkpoint.id), checkpoint);
});

test('persists immutable source before summary and keeps it when summary fails', async () => {
 const project = folder(), value = manifest(), store = new CheckpointStore(project, value.projectId);
 await assert.rejects(() => store.compact(value, async () => { throw new Error('summary failed'); }), /summary failed/);
 const sources = readdirSync(sourceDir(project));
 assert.equal(sources.length, 1);
 const sourceBytes = readFileSync(join(sourceDir(project), sources[0]!), 'utf8');
 assert.equal(createHash('sha256').update(sourceBytes).digest('hex'), sources[0]!.replace(/\.json$/, ''));
 assert.equal(readdirSync(checkpointDir(project)).length, 0);
});

test('does not let a summarizer mutate the original manifest to evade preservation checks', async () => {
 const project = folder(), value = manifest(), store = new CheckpointStore(project, value.projectId);
 await assert.rejects(() => store.compact(value, async input => {
  input.pinned.length = 0;
  input.decisions.length = 0;
  input.unresolved.length = 0;
  return { summary: 'mutated', pinned: [], decisions: [], unresolved: [], nextActions: [] };
 }), /pinned|decision|unresolved/i);
 assert.deepEqual(value.pinned, ['pinned']);
 assert.deepEqual(value.decisions, ['decision']);
 assert.deepEqual(value.unresolved, ['unresolved']);
});

test('rejects private cross-task reads, ownership mismatches, corrupt records, bad hashes, and torn files', async () => {
 const project = folder(), one = manifest(), two = manifest(one.projectId), store = new CheckpointStore(project, one.projectId);
 const checkpoint = await store.compact(one, async input => summary(input));
 const privateCheckpoint = await store.compact(two, async input => summary(input));
 assert.deepEqual(await store.list(one.taskId), [checkpoint]);
 await assert.rejects(() => store.get(two.taskId, checkpoint.id), /not found|ownership|task/i);
 await assert.rejects(() => store.source(two.taskId, checkpoint.sourceId), /not found|ownership|task/i);
 await assert.rejects(() => store.get(one.taskId, privateCheckpoint.id), /not found|ownership|task/i);
 await assert.rejects(() => new CheckpointStore(project, randomUUID()).get(one.taskId, checkpoint.id), /ownership/i);
 const path = join(checkpointDir(project), `${checkpoint.id}.json`);
 writeFileSync(path, '{"broken":');
 await assert.rejects(() => store.get(one.taskId, checkpoint.id), /corrupt|invalid/i);
 writeFileSync(path, JSON.stringify({ ...checkpoint, sourceId: 'bad' }));
 await assert.rejects(() => store.get(one.taskId, checkpoint.id), /corrupt|hash|invalid/i);
});

test('rejects symlinked or escaped storage paths and oversized or invalid inputs', async () => {
 const project = folder(), value = manifest(), base = join(project, '.agentic-controlroom');
 const linked = folder();
 writeFileSync(join(linked, 'sentinel'), 'x');
 symlinkSync(linked, base, 'junction');
 assert.throws(() => new CheckpointStore(project, value.projectId), /symlink|reparse|link/i);
 const store = new CheckpointStore(folder(), value.projectId);
 await assert.rejects(() => store.compact({ ...value, pinned: ['x'.repeat(1024 * 1024)] }, async input => summary(input)), /size|large|1MiB/i);
 await assert.rejects(() => store.compact({ ...value, pinned: ['lost'] }, async () => ({ summary: 'x', pinned: [], decisions: ['decision'], unresolved: ['unresolved'], nextActions: [] })), /pinned|lost/i);
});

test('preserves pinned, changed decisions, and unresolved issues across a 100-turn fixture', async () => {
 const project = folder(), value = manifest(), store = new CheckpointStore(project, value.projectId);
 let current = value;
 for (let turn = 0; turn < 100; turn++) current = { ...current, recent: [`turn-${turn}`], decisions: [`decision-${turn}`], unresolved: [`issue-${turn}`] };
 const checkpoint = await store.compact(current, async input => ({
  summary: `baseline summary ${input.recent[0]}`,
  pinned: [...input.pinned], decisions: [...input.decisions], unresolved: [...input.unresolved], nextActions: ['next']
 }));
 assert.deepEqual(checkpoint.summary.pinned, current.pinned);
 assert.deepEqual(checkpoint.summary.decisions, current.decisions);
 assert.deepEqual(checkpoint.summary.unresolved, current.unresolved);
 assert.equal(checkpoint.summary.summary, 'baseline summary turn-99');
});
