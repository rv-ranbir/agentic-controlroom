import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OfficePresenceRegistry } from './officePresence.js';

test('start adds a session to the snapshot', () => {
  const registry = new OfficePresenceRegistry();
  registry.start('s1', 'p1', 'meeting', ['a1', 'a2']);
  assert.deepEqual(registry.snapshot(), [{ id: 's1', projectId: 'p1', kind: 'meeting', agentIds: ['a1', 'a2'] }]);
});

test('end removes the session by id, leaving others untouched', () => {
  const registry = new OfficePresenceRegistry();
  registry.start('s1', 'p1', 'meeting', ['a1']);
  registry.start('s2', 'p1', 'debate', ['a2', 'a3']);
  registry.end('s1');
  assert.deepEqual(registry.snapshot(), [{ id: 's2', projectId: 'p1', kind: 'debate', agentIds: ['a2', 'a3'] }]);
});

test('end on an unknown id is a no-op', () => {
  const registry = new OfficePresenceRegistry();
  registry.start('s1', 'p1', 'meeting', ['a1']);
  registry.end('does-not-exist');
  assert.equal(registry.snapshot().length, 1);
});

test('forProject isolates sessions by project, concurrent sessions coexist', () => {
  const registry = new OfficePresenceRegistry();
  registry.start('s1', 'p1', 'meeting', ['a1', 'a2']);
  registry.start('s2', 'p2', 'debate', ['b1', 'b2']);
  registry.start('s3', 'p1', 'debate', ['a3', 'a4']);
  assert.deepEqual(registry.forProject('p1').map((s) => s.id).sort(), ['s1', 's3']);
  assert.deepEqual(registry.forProject('p2').map((s) => s.id), ['s2']);
  assert.deepEqual(registry.forProject('p3'), []);
});

test('agentIds is copied, not aliased, so caller mutation cannot corrupt state', () => {
  const registry = new OfficePresenceRegistry();
  const ids = ['a1', 'a2'];
  registry.start('s1', 'p1', 'meeting', ids);
  ids.push('a3');
  assert.deepEqual(registry.snapshot()[0].agentIds, ['a1', 'a2']);
});
