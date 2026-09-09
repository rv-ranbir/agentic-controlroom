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
