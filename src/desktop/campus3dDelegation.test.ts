import {test} from 'node:test';
import assert from 'node:assert/strict';
import {campusDelegates} from './campus3dDelegation.js';
import type {SubagentRecord} from './subagentPresence.js';

const record=(id:string,overrides:Partial<SubagentRecord>={}):SubagentRecord=>({id,projectId:'p',parentAgentId:'parent',sessionId:id,taskId:id,description:id,status:'running',updatedAt:1,background:true,...overrides});

test('excludes other projects and records whose parent is not visible',()=>{
 const result=campusDelegates([record('ok'),record('other',{projectId:'q'}),record('orphan',{parentAgentId:'missing'})],'p',new Set(['parent']),1);
 assert.deepEqual(result.items.map(x=>x.id),['ok']);
});

test('removes terminal records and retains unobserved records',()=>{
 const result=campusDelegates([record('done',{status:'completed'}),record('failed',{status:'failed'}),record('stopped',{status:'stopped'}),record('unknown',{status:'unobserved'})],'p',new Set(['parent']),1);
 assert.deepEqual(result.items.map(x=>x.id),['unknown']);
});

test('paginates in input order and clamps invalid, excessive, and shrunken pages',()=>{
 const rows=Array.from({length:14},(_,i)=>record(String(i)));
 assert.deepEqual(campusDelegates(rows,'p',new Set(['parent']),Number.NaN).items.map(x=>x.id),rows.slice(0,12).map(x=>x.id));
 assert.equal(campusDelegates(rows,'p',new Set(['parent']),99).page,2);
 assert.equal(campusDelegates(rows,'p',new Set(['parent']),-4).page,1);
 assert.equal(campusDelegates(rows.slice(0,2),'p',new Set(['parent']),2).page,1);
 assert.deepEqual(campusDelegates(rows,'p',new Set(['parent']),1,0).items.length,12);
});

test('deduplicates by id while preserving the first input record',()=>{
 const first=record('same',{description:'first'}),second=record('same',{description:'second'});
 const result=campusDelegates([first,second],'p',new Set(['parent']),1);
 assert.equal(result.total,1);
 assert.equal(result.items[0].description,'first');
});
test('defaults invalid page sizes and reports the filtered page count',()=>{
 const rows=Array.from({length:13},(_,i)=>record(String(i)));
 const result=campusDelegates(rows,'p',new Set(['parent']),1,13);
 assert.equal(result.total,13);
 assert.equal(result.pages,2);
 assert.equal(result.page,1);
 assert.equal(result.items.length,12);
});
