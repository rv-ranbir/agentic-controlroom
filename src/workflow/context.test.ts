import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RunContext } from './context.js';
test('shared artifacts survive restarts, retain lineage, and cannot be changed by readers',()=>{
 const dir=mkdtempSync(join(tmpdir(),'run-context-'));const store=new RunContext(dir);
 const source=store.add({type:'source',producer:'collector',key:'company',data:{price:12},parents:[]});
 const finding=store.add({type:'finding',producer:'analyst',key:'company',data:{summary:'Observed price'},parents:[source.id]});
 const read=store.get(source.id)!;(read.data as {price:number}).price=999;
 assert.equal((store.get(source.id)!.data as {price:number}).price,12);
 const resumed=new RunContext(dir);assert.deepEqual(resumed.get(finding.id)?.parents,[source.id]);assert.equal(resumed.list('source').length,1);
});
test('rejects dangling parents and invalid IDs',()=>{
 const store=new RunContext(mkdtempSync(join(tmpdir(),'run-context-')));
 assert.throws(()=>store.add({type:'finding',producer:'agent',key:'x',data:{},parents:['missing']}),/parent/i);
 assert.throws(()=>store.get('../secret'),/identifier/i);
});
test('detects tampered persisted artifacts instead of trusting them',()=>{
 const dir=mkdtempSync(join(tmpdir(),'run-context-'));const store=new RunContext(dir);const a=store.add({type:'source',producer:'test',key:'x',data:{a:1},parents:[]});
 writeFileSync(join(dir,`${a.id}.json`),JSON.stringify({...a,data:{a:2}}));assert.throws(()=>new RunContext(dir),/integrity/i);
});
test('unfinished temporary writes do not hide previously committed artifacts',()=>{
 const dir=mkdtempSync(join(tmpdir(),'run-context-'));const store=new RunContext(dir);const a=store.add({type:'input',producer:'user',key:'x',data:'saved',parents:[]});
 writeFileSync(join(dir,'.pending-interrupted'),'{partial');const resumed=new RunContext(dir);assert.equal(resumed.get(a.id)?.data,'saved');assert.equal(resumed.list().length,1);
});
