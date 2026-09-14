import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuditJournal } from './audit.js';
import { createRunScope } from './runScope.js';

function folder(): string { return mkdtempSync(join(tmpdir(), 'agent-room-audit-')); }
function event(scope = createRunScope('project', 'agent'), eventId = 'event-1') {
 return { eventId, scope, kind: 'attempt-started' as const, metadata: { status: 'started', mechanism: 'provider-managed' } };
}

test('appends, queries, resumes sequence, and de-duplicates event IDs', () => {
 const directory = folder();
 const scope = createRunScope('project', 'agent');
 const first = new AuditJournal(directory);
 first.append(event(scope, 'same'));
 first.append(event(scope, 'same'));
 first.append({ ...event(scope, 'two'), kind: 'attempt-completed' });
 const before = first.query({ limit: 100 });
 assert.equal(before.length, 2);
 assert.deepEqual(before.map(item => item.sequence), [1, 2]);
 const restarted = new AuditJournal(directory);
 restarted.append(event(scope, 'three'));
 assert.deepEqual(restarted.query({ afterSequence: 2, limit: 100 }).map(item => item.sequence), [3]);
});

test('redacts secrets and rejects unallowlisted metadata', () => {
 const journal = new AuditJournal(folder());
 const scope = createRunScope('project', 'agent');
 journal.append({ ...event(scope), metadata: { provider: 'Bearer super-secret-token' } });
 assert.equal(JSON.stringify(journal.query({ limit: 100 })).includes('super-secret-token'), false);
 assert.throws(() => journal.append({ ...event(scope, 'bad'), metadata: { prompt: 'private prompt' } }), /metadata/i);
});

test('repairs a torn final line and rejects corrupt interior records', () => {
 const directory = folder();
 const scope = createRunScope('project', 'agent');
 const journal = new AuditJournal(directory);
 journal.append(event(scope));
 const path = join(directory, '.agentic-controlroom', 'harness', 'audit-0.jsonl');
 writeFileSync(path, readFileSync(path, 'utf8') + '{"torn":');
 const repaired = new AuditJournal(directory);
 assert.equal(repaired.diagnostics.length, 1);
 repaired.append(event(scope, 'after-torn'));
 assert.equal(repaired.query({ limit: 100 }).length, 2);
 writeFileSync(path, '{"broken":\n' + readFileSync(path, 'utf8'));
 assert.throws(() => new AuditJournal(directory), /corrupt|invalid/i);
});

test('bounds events and queries, rotates into five retained files, and rejects traversal or symlinks', () => {
 const directory = folder();
 const scope = createRunScope('project', 'agent');
 const journal = new AuditJournal(directory, { rotationBytes: 500 });
 for (let i = 0; i < 20; i++) journal.append({ ...event(scope, `event-${i}`), metadata: { mechanism: 'x'.repeat(100) } });
 assert.throws(() => journal.query({ limit: 1000 }), /500/);
 assert.throws(() => journal.query({ limit: 501 }), /500/);
 assert.throws(() => journal.append({ ...event(scope, 'huge'), metadata: { mechanism: 'x'.repeat(40000) } }), /32|size|large/i);
 assert.throws(() => journal.append({ ...event(scope), eventId: '../escape' }), /eventId/i);
 assert.throws(() => new AuditJournal(join(directory, '..', 'escape')), /directory|path/i);
 const linkedProject = folder();
 mkdirSync(join(linkedProject, '.agentic-controlroom'));
 symlinkSync(folder(), join(linkedProject, '.agentic-controlroom', 'harness'), 'junction');
 assert.throws(() => new AuditJournal(linkedProject), /symlink|link|directory/i);
 assert.throws(() => journal.append({ ...event(createRunScope('other', 'agent'), 'other-project') }), /ownership/i);
});

test('restart rejects malformed persisted identities and strips unknown payload fields', () => {
 const directory = folder(), scope = createRunScope('project', 'agent');
 const journal = new AuditJournal(directory);
 journal.append(event(scope));
 const path = join(directory, '.agentic-controlroom', 'harness', 'audit-0.jsonl');
 const stored = JSON.parse(readFileSync(path, 'utf8'));
 writeFileSync(path, JSON.stringify({...stored, privatePayload:'do not expose'})+'\n');
 assert.equal(JSON.stringify(new AuditJournal(directory).query({limit:5})).includes('do not expose'),false);
 writeFileSync(path, JSON.stringify({...stored, callId:'../escape'})+'\n');
 assert.throws(()=>new AuditJournal(directory),/corrupt|invalid/i);
});
test('rotation retains bounded history consistently after restart and freezes records', () => {
 const directory = folder(), scope = createRunScope('project', 'agent');
 const journal = new AuditJournal(directory,{rotationBytes:500});
 for(let i=0;i<15;i++)journal.append(event(scope,'id-'+i));
 const before = journal.query({limit:500});
 assert.ok(before.length<=5);
 const restarted = new AuditJournal(directory,{rotationBytes:500});
 assert.deepEqual(restarted.query({limit:500}),before);
 assert.ok(Object.isFrozen(restarted.query({limit:1})[0]));
 restarted.append(event(scope,'last'));
 assert.equal(restarted.query({limit:500}).at(-1)?.sequence,16);
 assert.throws(()=>journal.query({limit:5,afterSequence:NaN}),/sequence/i);
});
