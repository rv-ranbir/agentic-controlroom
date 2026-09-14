import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ChatLog } from '../chatroom/log.js';
import type { AgentBackend, RoleConfig } from '../backend/agentBackend.js';
import { executeWorkflow, listRuns, recoverInterruptedRuns, type WorkflowDefinition } from './runtime.js';

function tmp(prefix: string) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function log(root: string) {
  return new ChatLog(join(root, 'chat.jsonl'));
}

function backendFor(calls: string[], reply: (role: RoleConfig, prompt: string) => string): (role: RoleConfig) => AgentBackend {
  return (_role) => ({
    start: async (role, prompt) => {
      calls.push(role.id);
      return { sessionId: 's-' + role.id, reply: reply(role, prompt) };
    },
    resume: async () => ({ reply: '' }),
  });
}

const dev: RoleConfig = { id: 'dev', name: 'Dev', systemPrompt: 'code' };
const qa: RoleConfig = { id: 'qa', name: 'QA', systemPrompt: 'review' };

test('executeWorkflow calls only chosen agent, chains shared context', async () => {
  const root = tmp('wf-basic-');
  const calls: string[] = [];
  const definition: WorkflowDefinition = { id: 'wf1', name: 'wf1', steps: [{ id: 's1', agentId: 'dev' }] };
  const run = await executeWorkflow({
    directory: root,
    definition,
    agents: [dev, qa],
    backendFor: backendFor(calls, () => 'built it'),
    log: log(root),
    input: 'build feature x',
  });
  assert.equal(run.status, 'complete');
  assert.deepEqual(calls, ['dev']);
  assert.equal(run.steps.length, 1);
  assert.equal(run.steps[0].status, 'complete');
  assert.ok(run.steps[0].outputArtifactId);
});

test('unknown agent reference fails validation with no backend calls', async () => {
  const root = tmp('wf-unknown-');
  const calls: string[] = [];
  const definition: WorkflowDefinition = { id: 'wf1', name: 'wf1', steps: [{ id: 's1', agentId: 'ghost' }] };
  await assert.rejects(
    executeWorkflow({
      directory: root,
      definition,
      agents: [dev],
      backendFor: backendFor(calls, () => 'x'),
      log: log(root),
      input: 'task',
    }),
    /unknown agent/,
  );
  assert.deepEqual(calls, []);
  assert.deepEqual(listRuns(root), []);
});

test('empty steps rejected with no backend calls', async () => {
  const root = tmp('wf-empty-');
  const calls: string[] = [];
  const definition: WorkflowDefinition = { id: 'wf1', name: 'wf1', steps: [] };
  await assert.rejects(
    executeWorkflow({
      directory: root,
      definition,
      agents: [dev],
      backendFor: backendFor(calls, () => 'x'),
      log: log(root),
      input: 'task',
    }),
    /invalid steps/,
  );
  assert.deepEqual(calls, []);
});

test('step requiring exactly one action rejects zero and multiple', async () => {
  const root = tmp('wf-actions-');
  const calls: string[] = [];
  const zero: WorkflowDefinition = { id: 'wf1', name: 'wf1', steps: [{ id: 's1' }] };
  await assert.rejects(
    executeWorkflow({ directory: root, definition: zero, agents: [dev], backendFor: backendFor(calls, () => 'x'), log: log(root), input: 't' }),
    /exactly one action/,
  );
  const multi: WorkflowDefinition = { id: 'wf1', name: 'wf1', steps: [{ id: 's1', agentId: 'dev', tool: 't1' }] };
  await assert.rejects(
    executeWorkflow({ directory: root, definition: multi, agents: [dev], tools: { t1: async () => 'x' }, backendFor: backendFor(calls, () => 'x'), log: log(root), input: 't' }),
    /exactly one action/,
  );
  assert.deepEqual(calls, []);
});

test('failed agent step marks run and step failed, no stuck running state', async () => {
  const root = tmp('wf-fail-');
  const definition: WorkflowDefinition = { id: 'wf1', name: 'wf1', steps: [{ id: 's1', agentId: 'dev' }] };
  const failingBackendFor = (_role: RoleConfig): AgentBackend => ({
    start: async () => { throw new Error('boom'); },
    resume: async () => ({ reply: '' }),
  });
  const run = await executeWorkflow({
    directory: root,
    definition,
    agents: [dev],
    backendFor: failingBackendFor,
    log: log(root),
    input: 'task',
  });
  assert.equal(run.status, 'failed');
  assert.equal(run.steps[0].status, 'failed');
  assert.ok(run.error?.includes('boom'));
  assert.equal(run.finishedAt !== undefined, true);
});

test('aborted signal cancels run before starting next step, no orphan work', async () => {
  const root = tmp('wf-cancel-');
  const calls: string[] = [];
  const controller = new AbortController();
  const definition: WorkflowDefinition = {
    id: 'wf1',
    name: 'wf1',
    steps: [{ id: 's1', agentId: 'dev' }, { id: 's2', agentId: 'qa' }],
  };
  const run = await executeWorkflow({
    directory: root,
    definition,
    agents: [dev, qa],
    backendFor: backendFor(calls, () => { controller.abort(); return 'first reply'; }),
    log: log(root),
    input: 'task',
    signal: controller.signal,
  });
  assert.equal(run.status, 'cancelled');
  assert.deepEqual(calls, ['dev']);
  assert.equal(run.steps[1].status, 'cancelled');
});

test('child workflow executes with parentRunId link, and shared step budget bounds total', async () => {
  const root = tmp('wf-child-');
  const calls: string[] = [];
  const child: WorkflowDefinition = { id: 'child', name: 'child', steps: [{ id: 'c1', agentId: 'qa' }] };
  const parent: WorkflowDefinition = { id: 'parent', name: 'parent', steps: [{ id: 'p1', agentId: 'dev' }, { id: 'p2', workflow: child }] };
  const run = await executeWorkflow({
    directory: root,
    definition: parent,
    agents: [dev, qa],
    backendFor: backendFor(calls, () => 'ok'),
    log: log(root),
    input: 'task',
  });
  assert.equal(run.status, 'complete');
  assert.deepEqual(calls, ['dev', 'qa']);
  assert.ok(run.steps[1].outputArtifactId);

  await assert.rejects(
    executeWorkflow({
      directory: root,
      definition: parent,
      agents: [dev, qa],
      backendFor: backendFor(calls, () => 'ok'),
      log: log(root),
      input: 'task',
      limits: { maxSteps: 1 },
    }),
    /shared step budget/,
  );
});

test('child workflow failure fails parent', async () => {
  const root = tmp('wf-childfail-');
  const child: WorkflowDefinition = { id: 'child', name: 'child', steps: [{ id: 'c1', agentId: 'ghost2' }] };
  const parent: WorkflowDefinition = { id: 'parent', name: 'parent', steps: [{ id: 'p1', workflow: child }] };
  await assert.rejects(
    executeWorkflow({
      directory: root,
      definition: parent,
      agents: [dev],
      backendFor: backendFor([], () => 'ok'),
      log: log(root),
      input: 'task',
    }),
    /unknown agent/,
  );
});

test('cyclic workflow object reference is rejected', async () => {
  const root = tmp('wf-cycle-');
  const definition: WorkflowDefinition = { id: 'wf1', name: 'wf1', steps: [] as any };
  const step: any = { id: 's1', workflow: definition };
  (definition.steps as any) = [step];
  await assert.rejects(
    executeWorkflow({ directory: root, definition, agents: [dev], backendFor: backendFor([], () => 'x'), log: log(root), input: 't' }),
    /cyclic/,
  );
});

test('depth over max is rejected', async () => {
  const root = tmp('wf-depth-');
  let inner: WorkflowDefinition = { id: 'd8', name: 'd8', steps: [{ id: 's', agentId: 'dev' }] };
  for (let i = 7; i >= 1; i--) {
    inner = { id: `d${i}`, name: `d${i}`, steps: [{ id: `s${i}`, workflow: inner }] };
  }
  await assert.rejects(
    executeWorkflow({ directory: root, definition: inner, agents: [dev], backendFor: backendFor([], () => 'x'), log: log(root), input: 't', limits: { maxDepth: 3 } }),
    /max depth/,
  );
});

test('run snapshot persists atomically and listRuns reads it back', async () => {
  const root = tmp('wf-persist-');
  const definition: WorkflowDefinition = { id: 'wf1', name: 'wf1', steps: [{ id: 's1', agentId: 'dev' }] };
  const run = await executeWorkflow({
    directory: root,
    definition,
    agents: [dev],
    backendFor: backendFor([], () => 'ok'),
    log: log(root),
    input: 'task',
  });
  const runs = listRuns(root);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].id, run.id);
  assert.equal(runs[0].status, 'complete');
  const runFile = join(root, run.id, 'run.json');
  assert.ok(existsSync(runFile));
  assert.doesNotThrow(() => JSON.parse(readFileSync(runFile, 'utf8')));
});

test('recoverInterruptedRuns marks stuck running runs interrupted, no side-effect replay', async () => {
  const root = tmp('wf-recover-');
  const definition: WorkflowDefinition = { id: 'wf1', name: 'wf1', steps: [{ id: 's1', agentId: 'dev' }] };
  const calls: string[] = [];
  const run = await executeWorkflow({
    directory: root,
    definition,
    agents: [dev],
    backendFor: backendFor(calls, () => 'ok'),
    log: log(root),
    input: 'task',
  });
  const runFile = join(root, run.id, 'run.json');
  const stuck = { ...run, status: 'running', steps: run.steps.map((s) => ({ ...s, status: 'running' })) };
  writeFileSync(runFile, JSON.stringify(stuck));

  recoverInterruptedRuns(root);

  const recovered = listRuns(root)[0];
  assert.equal(recovered.status, 'interrupted');
  assert.equal(recovered.steps[0].status, 'interrupted');
  assert.equal(calls.length, 1);
});

test('successful agents become done and child findings reach subsequent parent agents', async()=>{
 const root=tmp('wf-lineage-');const logger=log(root);const states:string[]=[];logger.on('agentState',e=>states.push(e.state));let finalPrompt='';
 const run=await executeWorkflow({directory:root,definition:{id:'parent',name:'Parent',steps:[{id:'child',workflow:{id:'child',name:'Child',steps:[{id:'research',agentId:'dev'}]}},{id:'review',agentId:'qa'}]},agents:[dev,qa],backendFor:backendFor([], (role,prompt)=>{if(role.id==='qa')finalPrompt=prompt;return 'unique-child-finding';}),log:logger,input:'task'});
 assert.equal(run.status,'complete');assert.equal(states.at(-1),'done');assert.match(finalPrompt,/unique-child-finding/);
});
test('invalid budgets and inherited tool names are rejected before work',async()=>{
 const root=tmp('wf-invalid-');const base={directory:root,definition:{id:'wf',name:'WF',steps:[{id:'one',tool:'toString'}]},agents:[dev],backendFor:backendFor([],()=>''),log:log(root),input:'task',tools:{}};
 await assert.rejects(executeWorkflow(base),/unknown tool/);
 await assert.rejects(executeWorkflow({...base,definition:{id:'wf',name:'WF',steps:[{id:'one',agentId:'dev'}]},limits:{maxSteps:NaN}}),/limit|budget/);
});

test('unknown ownerId and non-boolean continueOnError are rejected',async()=>{
 const root=tmp('wf-owner-invalid-');
 await assert.rejects(executeWorkflow({directory:root,definition:{id:'wf',name:'WF',steps:[{id:'s1',tool:'t',ownerId:'ghost'}]},agents:[dev],tools:{t:async()=>'x'},backendFor:backendFor([],()=>''),log:log(root),input:'t'}),/unknown owner/);
 await assert.rejects(executeWorkflow({directory:root,definition:{id:'wf',name:'WF',steps:[{id:'s1',agentId:'dev',continueOnError:'yes' as any}]},agents:[dev],backendFor:backendFor([],()=>''),log:log(root),input:'t'}),/continueOnError/);
});

test('prepareAgent skip runs no backend call and marks step skipped',async()=>{
 const root=tmp('wf-skip-');const calls:string[]=[];
 const run=await executeWorkflow({directory:root,definition:{id:'wf',name:'WF',steps:[{id:'s1',agentId:'dev'}]},agents:[dev],backendFor:backendFor(calls,()=>'x'),log:log(root),input:'t',prepareAgent:()=>({prompt:'',skipReason:'not needed'})});
 assert.equal(run.status,'complete');
 assert.equal(run.steps[0].status,'skipped');
 assert.deepEqual(calls,[]);
});

test('prepareAgent overrides prompt and systemPrompt; afterAgent overrides output, undefined keeps reply',async()=>{
 const root=tmp('wf-prepare-');let seenPrompt='';let seenSystemPrompt='';
 const backend=(_role:RoleConfig):AgentBackend=>({start:async(r,prompt)=>{seenPrompt=prompt;seenSystemPrompt=r.systemPrompt;return {sessionId:'s',reply:'original'};},resume:async()=>({reply:''})});
 const run=await executeWorkflow({directory:root,definition:{id:'wf',name:'WF',steps:[{id:'s1',agentId:'dev'}]},agents:[dev],backendFor:backend,log:log(root),input:'t',
  prepareAgent:()=>({prompt:'custom prompt',systemPrompt:'custom system'}),
  afterAgent:({reply})=>reply==='original'?'transformed':undefined});
 assert.equal(seenPrompt,'custom prompt');
 assert.ok(seenSystemPrompt.startsWith('custom system'));
 assert.match(seenSystemPrompt,/Optional visual output/);
 const {RunContext}=await import('./context.js');
 const context=new RunContext(join(root,run.id,'context'));
 assert.equal(context.list('step-output')[0].data,'transformed');
});

test('continueOnError stores step-error artifact and continues; cancellation never continues',async()=>{
 const root=tmp('wf-continue-');
 const failThenOk=(_role:RoleConfig):AgentBackend=>({start:async(role)=>{if(role.id==='dev')throw new Error('boom');return {sessionId:'s',reply:'ok'};},resume:async()=>({reply:''})});
 const run=await executeWorkflow({directory:root,definition:{id:'wf',name:'WF',steps:[{id:'s1',agentId:'dev',continueOnError:true},{id:'s2',agentId:'qa'}]},agents:[dev,qa],backendFor:failThenOk,log:log(root),input:'t'});
 assert.equal(run.status,'complete');
 assert.equal(run.steps[0].status,'failed');
 assert.equal(run.steps[1].status,'complete');

 const root2=tmp('wf-continue-cancel-');const controller=new AbortController();
 const abortingBackend=(_role:RoleConfig):AgentBackend=>({start:async()=>{controller.abort();throw new Error('boom');},resume:async()=>({reply:''})});
 const run2=await executeWorkflow({directory:root2,definition:{id:'wf',name:'WF',steps:[{id:'s1',agentId:'dev',continueOnError:true},{id:'s2',agentId:'qa'}]},agents:[dev,qa],backendFor:abortingBackend,log:log(root2),input:'t',signal:controller.signal});
 assert.equal(run2.status,'cancelled');
 assert.equal(run2.steps[1].status,'cancelled');
});

test('tool ownerId emits working/done/idle agent state around the call',async()=>{
 const root=tmp('wf-tool-owner-');const states:string[]=[];const logger=log(root);logger.on('agentState',e=>states.push(`${e.agentId}:${e.state}`));
 const ok=await executeWorkflow({directory:root,definition:{id:'wf',name:'WF',steps:[{id:'s1',tool:'t',ownerId:'dev'}]},agents:[dev],tools:{t:async()=>'done-value'},backendFor:backendFor([],()=>''),log:logger,input:'t'});
 assert.equal(ok.status,'complete');
 assert.deepEqual(states,['dev:working','dev:done']);

 const root2=tmp('wf-tool-owner-fail-');const states2:string[]=[];const logger2=log(root2);logger2.on('agentState',e=>states2.push(`${e.agentId}:${e.state}`));
 const failed=await executeWorkflow({directory:root2,definition:{id:'wf',name:'WF',steps:[{id:'s1',tool:'t',ownerId:'dev'}]},agents:[dev],tools:{t:async()=>{throw new Error('tool boom');}},backendFor:backendFor([],()=>''),log:logger2,input:'t'});
 assert.equal(failed.status,'failed');
 assert.deepEqual(states2,['dev:working','dev:idle']);
});

test('agent presentations retain original reply, validate data before publishing, and log readable summary',async()=>{
 const root=tmp('wf-visual-');const logger=log(root);let validated='';let published='';
 const reply=JSON.stringify({findings:[{value:42}],presentation:{title:'Overview',summary:'One verified result.',html:'<h1>42</h1><button onclick="this.textContent=43">Update</button>'}});
 const run=await executeWorkflow({directory:root,definition:{id:'wf',name:'WF',steps:[{id:'one',agentId:'dev'}]},agents:[dev],backendFor:backendFor([],()=>reply),log:logger,input:'task',afterAgent:({reply})=>{validated=reply;return JSON.parse(reply);},publishPresentation:async(a)=>{published=a.path;return 'artifact-id';}});
 assert.equal(run.status,'complete');assert.deepEqual(JSON.parse(validated),{findings:[{value:42}]});assert.ok(existsSync(published));
 const message=logger.tail(1)[0];assert.equal(message.message,'One verified result.');assert.equal(message.artifactId,'artifact-id');assert.equal(message.rawReply,reply);
 const {RunContext}=await import('./context.js');const context=new RunContext(join(root,run.id,'context'));assert.equal(context.latest('raw-output','one')?.data,reply);
});
test('failed domain validation cannot publish an agent visual',async()=>{
 const root=tmp('wf-invalid-visual-');let published=false;
 const run=await executeWorkflow({directory:root,definition:{id:'wf',name:'WF',steps:[{id:'one',agentId:'dev'}]},agents:[dev],backendFor:backendFor([],()=>JSON.stringify({data:1,presentation:{title:'Bad',summary:'Unverified',html:'<h1>bad</h1>'}})),log:log(root),input:'task',afterAgent:()=>{throw new Error('invalid evidence');},publishPresentation:async()=>{published=true;return 'id';}});
 assert.equal(run.status,'failed');assert.equal(published,false);
});

test('visual markup never crowds out structured context for following agents',async()=>{
 const root=tmp('wf-visual-context-');let following='';
 const reply=JSON.stringify({finding:'verified-data',presentation:{title:'Report',summary:'Summary',html:'<p>'+ 'VISUALONLY'.repeat(1000)+'</p>'}});
 await executeWorkflow({directory:root,definition:{id:'wf',name:'WF',steps:[{id:'one',agentId:'dev'},{id:'two',agentId:'qa'}]},agents:[dev,qa],backendFor:backendFor([], (role,prompt)=>{if(role.id==='qa'){following=prompt;return 'review';}return reply;}),log:log(root),input:'task'});
 assert.match(following,/verified-data/);assert.doesNotMatch(following,/VISUALONLY/);
});

test('token saving compacts workflow context without changing task or stored evidence', async () => {
 const rows=Array.from({length:60},(_,i)=>({symbol:`TEST${i}`,price:i===41?-1:i,currency:'INR',evidence:'source-'+i,timestamp:'2026-09-13T06:00:00Z'}));
 for(const tokenSaving of [false,true]){
  const root=tmp('wf-saving-');let captured='';
  const run=await executeWorkflow({directory:root,tokenSaving,definition:{id:'saving',name:'Saving',steps:[{id:'data',tool:'collect'},{id:'analysis',agentId:'dev'}]},agents:[dev],tools:{collect:async()=>rows},backendFor:backendFor([],(_role,p)=>{captured=p;return 'done';}),log:log(root),input:'EXACT USER CONSTRAINT'});
  assert.equal(run.status,'complete');assert.match(captured,/TASK:\nEXACT USER CONSTRAINT/);
  if(tokenSaving)assert.match(captured,/TOON data:/);else assert.doesNotMatch(captured,/TOON data:/);
  const { RunContext }=await import('./context.js');
  const context=new RunContext(join(root,run.id,'context'));
  assert.deepEqual(context.list().find(a=>a.key==='data')?.data,rows);
 }
});
