import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProjectHarness} from './projectHarness.js';
import {createRunScope,createChildScope} from './runScope.js';
const setup=()=>new ProjectHarness('p',mkdtempSync(join(tmpdir(),'project-harness-')));
test('unavailable policies persist and reject all execution before a call',async()=>{
 const h=setup(),scope=createRunScope('p','a');
 assert.equal(h.state().canRun,true);
 const policy={...h.state().policy,mode:'isolated-workspace' as const,network:'off' as const};
 h.savePolicy(policy);assert.equal(h.state().canRun,false);
 let calls=0;await assert.rejects(h.tool(scope,'scrape',async()=>{calls++;}),/unavailable/i);
 assert.equal(calls,0);assert.throws(()=>h.begin(scope),/unavailable/i);
 assert.ok(h.state().events.some(e=>e.kind==='policy-denied'));
 h.savePolicy({...policy,mode:'provider-managed',network:'provider-managed'});
 const handle=h.begin(scope);assert.throws(()=>h.savePolicy(policy),/running/i);handle.finish();
});
test('grouped runs remain active across children and cancellation blocks future dispatch',async()=>{
 const h=setup(),scope=createRunScope('p','orchestrator'),root=h.begin(scope);
 const child=h.begin(createChildScope(scope,'analyst'));
 assert.equal(h.state().active.length,1);
 assert.equal(h.cancel(scope.runId),true);assert.equal(child.signal.aborted,true);
 child.finish();assert.equal(h.state().active[0].state,'cancel-requested');
 assert.throws(()=>h.begin(createChildScope(scope,'later')),/cancel/i);
 root.finish();assert.deepEqual(h.state().active,[]);
 assert.equal(h.cancel(scope.runId),false);
});
test('tool failures persist safe terminal events and do not expose arguments or errors',async()=>{
 const h=setup(),scope=createRunScope('p','a');
 await assert.rejects(h.tool(scope,'scrape',async()=>{throw Error('private credential')}));
 const events=h.state().events;
 assert.equal(events.filter(e=>e.kind==='tool-started').length,1);
 assert.equal(events.filter(e=>e.kind==='tool-settled'&&e.metadata?.status==='failed').length,1);
 assert.equal(JSON.stringify(events).includes('private credential'),false);
});
test('external abort cancels run, project identity cannot cross, and policies survive restart',()=>{
 const dir=mkdtempSync(join(tmpdir(),'harness-policy-')),h=new ProjectHarness('p',dir),signal=new AbortController();
 const handle=h.begin(createRunScope('p','a'),signal.signal);signal.abort();assert.equal(handle.signal.aborted,true);handle.finish();
 assert.throws(()=>h.begin(createRunScope('other','a')),/project/i);
 h.savePolicy({...h.state().policy,mode:'read-only'});assert.equal(new ProjectHarness('p',dir).state().canRun,false);
});

test('reopening a journal under another project cannot expose its history',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'harness-owner-')),h=new ProjectHarness('owner',directory);
 await h.tool(createRunScope('owner','a'),'collect',async()=>1);
 assert.throws(()=>new ProjectHarness('other',directory),/ownership/i);
});
test('cancellation remains accepted when its audit write fails',()=>{
 const h=setup(),scope=createRunScope('p','a'),handle=h.begin(scope);
 h.journal.append=()=>{throw Error('disk failure')};
 assert.equal(h.cancel(scope.runId),true);assert.equal(handle.signal.aborted,true);
 assert.ok(h.state().diagnostics.length>0);handle.finish();
});
