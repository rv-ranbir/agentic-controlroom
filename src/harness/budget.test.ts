import test from 'node:test';
import assert from 'node:assert/strict';
import { BudgetPool } from './budget.js';

test('reserves calls and concurrency across simultaneous tasks', () => {
 const pool = new BudgetPool({ maxCalls: 3, maxConcurrent: 2, maxWallMs: 0 });
 const first = pool.reserve('one', { calls: 2, attemptId: 'attempt-one' });
 const second = pool.reserve('two', { calls: 1 });
 assert.equal(first, 'attempt-one');
 assert.equal(pool.snapshot().callsSpent, 3);
 assert.equal(pool.snapshot().concurrent, 2);
 assert.throws(() => pool.reserve('three'), /concurrency exhausted/);
 pool.release(second);
 assert.equal(pool.snapshot().concurrent, 1);
 assert.throws(() => pool.reserve('three'), /calls exhausted/);
});

test('settlement and release are idempotent and keep dispatched calls spent', () => {
 const pool = new BudgetPool({ maxCalls: 2, maxConcurrent: 1, maxWallMs: 0 });
 const reservation = pool.reserve('task', { calls: 1, attemptId: 'attempt' });
 pool.settle('attempt');
 pool.settle('attempt');
 pool.release(reservation);
 pool.release(reservation);
 assert.deepEqual(pool.remaining(), { calls: 1, concurrent: 1, wallMs: 0 });
 assert.equal(pool.snapshot().settled, 1);
});

test('children share the root pool and cannot expand inherited limits', () => {
 const root = new BudgetPool({ maxCalls: 2, maxConcurrent: 2, maxWallMs: 100 });
 const child = root.child({ maxCalls: 2, maxConcurrent: 1, maxWallMs: 50 });
 assert.throws(() => root.child({ maxCalls: 3 }), /expand/);
 const reservation = child.reserve('child');
 assert.equal(root.snapshot().callsSpent, 1);
 assert.equal(root.snapshot().concurrent, 1);
 assert.throws(() => child.reserve('child-2'), /concurrency exhausted/);
 child.release(reservation);
 assert.equal(root.snapshot().concurrent, 0);
});

test('rejects invalid calls and unsupported output token reservations', () => {
 const pool = new BudgetPool({ maxCalls: 0, maxConcurrent: 0, maxWallMs: 0 });
 for (const calls of [0, -1, NaN, Infinity]) {
  assert.throws(() => pool.reserve('task', { calls }), /Invalid calls/);
 }
 assert.throws(() => pool.reserve('task', { outputTokens: 1 }), /outputTokens/);
});

test('enforces the shared wall deadline using the injected clock', () => {
 let now = 1_000;
 const pool = new BudgetPool({ maxCalls: 0, maxConcurrent: 0, maxWallMs: 100 }, { now: () => now });
 pool.reserve('before-deadline');
 now = 1_101;
 assert.throws(() => pool.reserve('after-deadline'), /deadline/);
});

test('recovered outstanding reservations remain spent and need reconciliation', () => {
 const original = new BudgetPool({ maxCalls: 3, maxConcurrent: 2, maxWallMs: 0 });
 original.reserve('crashed', { calls: 2, attemptId: 'crashed-attempt' });
 const restarted = new BudgetPool(original.snapshot().limits, { recovered: original.snapshot() });
 const snapshot = restarted.snapshot();
 assert.equal(snapshot.callsSpent, 2);
 assert.equal(snapshot.concurrent, 1);
 assert.deepEqual(snapshot.reconciliationNeeded, ['crashed-attempt']);
 assert.throws(() => restarted.reserve('new', { calls: 2 }), /calls exhausted/);
});


test('unresolved recovered reservations hold concurrency until explicitly reconciled',()=>{
 const first=new BudgetPool({maxCalls:3,maxConcurrent:1,maxWallMs:0});first.reserve('task',{attemptId:'pending'});
 const recovered=new BudgetPool(first.snapshot().limits,{recovered:first.snapshot()});
 assert.throws(()=>recovered.reserve('another'),/concurrency/);recovered.settle('pending');assert.equal(recovered.snapshot().concurrent,0);recovered.reserve('another');assert.equal(recovered.snapshot().callsSpent,2);
});
test('discard before dispatch refunds only the unused reservation once',()=>{
 const pool=new BudgetPool({maxCalls:1,maxConcurrent:1,maxWallMs:0});const id=pool.reserve('task');pool.discardBeforeDispatch(id);pool.discardBeforeDispatch(id);assert.equal(pool.snapshot().callsSpent,0);
 const next=pool.reserve('task');pool.settle(next);pool.discardBeforeDispatch(next);assert.equal(pool.snapshot().callsSpent,1);
});
