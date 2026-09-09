import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, unlinkSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ArtifactStore, type ProjectArtifact } from './artifacts.js';

const input = { title: 'Preview', kind: 'dashboard' as const, runId: 'run-1', url: 'http://127.0.0.1:3000/view' };
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'artifact-store-'));
  return { root, store: new ArtifactStore(root), directory: join(root, '.agentic-controlroom', 'artifacts') };
}

test('roundtrip persists all kinds, UUIDs, timestamps and independent copies', () => {
  const { root, store, directory } = fixture();
  writeFileSync(join(root, 'result.txt'), 'result');
  for (const kind of ['report', 'table', 'image', 'file', 'dashboard'] as const) {
    const artifact = store.add({ title: kind, kind, runId: 'run', agentId: 'agent', path: 'result.txt' });
    assert.match(artifact.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(new Date(artifact.createdAt).toISOString(), artifact.createdAt);
    assert.deepEqual(new ArtifactStore(root).resolve(artifact.id), artifact);
    artifact.title = 'mutated';
    assert.equal(store.resolve(artifact.id)?.title, kind);
  }
  const dashboard = store.add(input);
  assert.equal(store.resolve(dashboard.id)?.url, input.url);
  assert.equal(store.list().length, 6);
  assert.equal(store.resolve(randomUUID()), undefined);
  assert.throws(() => store.resolve('../bad'), /identifier/i);
  writeFileSync(join(directory, '.pending-interrupted'), '{');
  assert.equal(store.list().length, 6);
});

test('rejects unsafe URLs, ambiguous destinations and oversized metadata', () => {
  const { store } = fixture();
  for (const url of ['https://127.0.0.1:3000', 'http://localhost:3000', 'http://127.0.0.1', 'http://127.0.0.1:80', 'http://127.0.0.1:1023', 'http://127.0.0.1:65536', 'http://user:pass@127.0.0.1:3000', 'http://127.1:3000', 'http://2130706433:3000', 'http://127.0.0.1:3000@evil.com', 'file:///tmp/a', 'http://127.0.0.1:3000\\@evil.com']) {
    assert.throws(() => store.add({ ...input, url }), /url/i, url);
  }
  for (const extra of [{ path: 'x' }, { url: undefined }, { title: '' }, { title: 'x'.repeat(501) }, { kind: 'other' }, { agentId: 1 }, { extra: true }]) {
    assert.throws(() => store.add({ ...input, ...extra } as unknown as Omit<ProjectArtifact, 'id' | 'createdAt'>), /metadata|destination/i);
  }
});

test('rejects traversal, missing files, directories and symlink escapes; revalidates files', () => {
  const { root, store } = fixture();
  const outside = mkdtempSync(join(tmpdir(), 'artifact-outside-'));
  writeFileSync(join(outside, 'secret'), 'secret');
  symlinkSync(outside, join(root, 'escape'), 'junction');
  for (const path of ['../secret', 'a/../secret', '..\\secret', 'missing', '.', join(outside, 'secret'), 'escape/secret']) {
    assert.throws(() => store.add({ title: 'file', kind: 'file', runId: 'run', path }), /path|file|project/i);
  }
  writeFileSync(join(root, 'ok'), 'ok');
  const a = store.add({ title: 'file', kind: 'file', runId: 'run', path: 'ok' });
  unlinkSync(join(root, 'ok'));
  assert.throws(() => store.resolve(a.id), /file|path/i);
  assert.throws(() => store.list(), /file|path/i);
});

test('rejects redirected storage directories', () => {
  const root = mkdtempSync(join(tmpdir(), 'artifact-root-'));
  const outside = mkdtempSync(join(tmpdir(), 'artifact-outside-'));
  symlinkSync(outside, join(root, '.agentic-controlroom'), 'junction');
  assert.throws(() => new ArtifactStore(root), /storage|project/i);
  assert.deepEqual(readdirSync(outside), []);
});

test('malformed, oversized, redirected and mismatched stored metadata fail clearly', () => {
  for (const replacement of ['{', '{}', 'null', 'x'.repeat(16385)]) {
    const { store, directory } = fixture();
    const a = store.add(input);
    writeFileSync(join(directory, `${a.id}.json`), replacement);
    assert.throws(() => store.list(), /metadata|limit/i);
    assert.throws(() => store.resolve(a.id), /metadata|limit/i);
  }
  const { store, directory } = fixture();
  const a = store.add(input);
  writeFileSync(join(directory, `${a.id}.json`), JSON.stringify({ ...a, id: randomUUID() }));
  assert.throws(() => store.list(), /metadata/i);
});

test('bounds entry count without overwriting existing artifacts', () => {
  const { store, directory } = fixture();
  const a = store.add(input);
  for (let i = 1; i < 10000; i++) {
    const id = randomUUID();
    writeFileSync(join(directory, `${id}.json`), JSON.stringify({ ...a, id }));
  }
  assert.throws(() => store.add(input), /limit/i);
  assert.deepEqual(store.resolve(a.id), a);
});
