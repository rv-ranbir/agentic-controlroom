import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ChatLog } from '../chatroom/log.js';
import { createRunScope } from '../harness/runScope.js';
import type { RunScope } from '../harness/types.js';
import { executeWorkflow, listRuns } from './runtime.js';
const role = { id:'analyst', name:'Analyst', systemPrompt:'' };

test('nested workflow scopes retain a shared run and immediate parents, including repeated agents', async () => {
 const root=mkdtempSync(join(tmpdir(),'wf-scopes-'));
 const calls: RunScope[]=[];
 const scope=createRunScope('project','orchestrator');
 const run=await executeWorkflow({directory:root,scope,agents:[role],log:new ChatLog(join(root,'chat.jsonl')),input:'task',
  definition:{id:'parent',name:'parent',steps:[{id:'first',agentId:role.id},{id:'nested',workflow:{id:'child',name:'child',steps:[{id:'inside',agentId:role.id}]}},{id:'last',agentId:role.id}]},
  backendFor:(_role,execution)=>{assert.ok(execution);calls.push(execution);return {start:async()=>({sessionId:'',reply:'done'}),resume:async()=>({reply:'done'})};}});
 assert.equal(run.status,'complete');
 assert.equal(calls.length,3);
 assert.equal(new Set(calls.map(s=>s.taskId)).size,3);
 assert.ok(calls.every(s=>s.projectId===scope.projectId&&s.runId===scope.runId));
 assert.equal(calls[0].parentTaskId,scope.taskId);
 assert.equal(calls[2].parentTaskId,scope.taskId);
 const saved=listRuns(root);
 const parent=saved.find(r=>r.id===run.id)!;
 const child=saved.find(r=>r.parentRunId===run.id)!;
 assert.deepEqual(parent.scope,scope);
 assert.deepEqual(parent.steps[0].scope,calls[0]);
 assert.equal(child.scope?.taskId,parent.steps[1].scope?.taskId);
 assert.equal(calls[1].parentTaskId,child.scope?.taskId);
 assert.deepEqual(child.steps[0].scope,calls[1]);
});
test('invalid workflow scope fails before storage or provider dispatch', async () => {
 const parent=mkdtempSync(join(tmpdir(),'wf-invalid-scope-')),directory=join(parent,'runs');
 let calls=0;
 await assert.rejects(executeWorkflow({directory,scope:{...createRunScope('p','orchestrator'),runId:''},agents:[role],
  definition:{id:'wf',name:'wf',steps:[{id:'step',agentId:role.id}]},log:new ChatLog(join(parent,'chat.jsonl')),input:'task',
  backendFor:()=>{calls++;throw Error('must not dispatch');}}),/runId/i);
 assert.equal(calls,0);assert.equal(existsSync(directory),false);
});
