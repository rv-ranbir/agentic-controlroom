import test from 'node:test';
import assert from 'node:assert/strict';
import type { AgentBackend } from '../backend/agentBackend.js';
import { withCapabilities } from '../backend/capabilityBackend.js';
import { withInvocation } from './invocation.js';
import { createRunScope } from './runScope.js';
import type { AuditInput } from './audit.js';
const role = { id: 'a', name: 'Agent', systemPrompt: '' };
function setup(backend: AgentBackend, signal?: AbortSignal) {
 const events: AuditInput[] = [];
 const wrapped = withInvocation(backend, { scope: createRunScope('p', 'a'), provider: 'fixture', model: '',
  journal: { append: event => { events.push(event); } }, signal });
 return { wrapped, events };
}
test('capability follow-ups are individually tracked beneath the loop', async () => {
 const { wrapped, events } = setup({start: async () => ({sessionId:'s',reply: JSON.stringify({agent_room:{tool:'list_capabilities',arguments:{}}})}),resume:async()=>({reply:'done'})});
 const backend = withCapabilities(wrapped, {catalogue:()=>[],execute:async()=>[]});
 assert.equal((await backend.start(role,'task')).reply,'done');
 assert.equal(events.filter(e=>e.kind==='attempt-started').length,2);
 assert.equal(events.filter(e=>e.kind==='attempt-settled').length,2);
 assert.equal(new Set(events.filter(e=>e.kind==='attempt-started').map(e=>e.callId)).size,2);
 assert.equal(new Set(events.map(e=>e.scope.runId)).size,1);
});
test('failure is settled without copying private provider text', async () => {
 const secret = 'private prompt and credential';
 const { wrapped, events } = setup({start:async()=>{throw Error(secret)},resume:async()=>({reply:''})});
 await assert.rejects(wrapped.start(role,'task'),/private/);
 assert.deepEqual(events.map(e=>e.kind),['attempt-started','attempt-failed','attempt-settled']);
 assert.equal(JSON.stringify(events).includes(secret),false);
});
test('cancellation records request without inventing process termination, and blocks follow-ups', async () => {
 const controller = new AbortController();
 let finish!: () => void;
 const { wrapped, events } = setup({start:async()=>{await new Promise<void>(r=>finish=r);return {sessionId:'s',reply:'result'}},resume:async()=>({reply:''})},controller.signal);
 const pending = wrapped.start(role,'task');
 controller.abort();
 assert.equal(events.filter(e=>e.kind==='attempt-cancel-requested').length,1);
 assert.equal(events.filter(e=>e.kind==='attempt-settled').length,0);
 finish(); await pending;
 await assert.rejects(wrapped.resume('s','next',role),/cancel/i);
 assert.equal(events.filter(e=>e.kind==='attempt-started').length,1);
 assert.equal(events.filter(e=>e.kind==='attempt-settled').length,1);
});
test('identity mismatch and journal failure reject before provider execution', async () => {
 let calls = 0;
 const backend = {start:async()=>{calls++;return {sessionId:'',reply:''}},resume:async()=>({reply:''})};
 const {wrapped} = setup(backend);
 await assert.rejects(wrapped.start({...role,id:'other'},'task'),/identity/i);
 const failing = withInvocation(backend,{scope:createRunScope('p','a'),provider:'fixture',model:'',journal:{append:()=>{throw Error('disk failure')}}});
 await assert.rejects(failing.start(role,'task'),/disk failure/);
 assert.equal(calls,0);
});

test('audit failure during abort stays in the invocation instead of escaping the event listener', async () => {
 const controller = new AbortController();
 let finish!: () => void;
 const events: string[] = [];
 const wrapped = withInvocation({ start: async()=>{await new Promise<void>(r=>finish=r);return {sessionId:'',reply:'done'}},resume:async()=>({reply:''}) },
 {scope:createRunScope('p','a'),provider:'fixture',model:'',signal:controller.signal,journal:{append:event=>{
  events.push(event.kind);if(event.kind==='attempt-cancel-requested')throw Error('audit disk failure');
 }}});
 const pending = wrapped.start(role,'task');
 controller.abort();finish();
 await assert.rejects(pending,/audit disk failure/);
 assert.ok(events.includes('attempt-completed'));
 assert.ok(events.includes('attempt-settled'));
 assert.equal(events.includes('attempt-failed'),false);
});
