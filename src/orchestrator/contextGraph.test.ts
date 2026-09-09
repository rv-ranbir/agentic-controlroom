import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {RunContext} from '../workflow/context.js';
import {runGraph} from './graph.js';
import {ChatLog} from '../chatroom/log.js';
test('generic graph nodes can read and append the same persistent context',async()=>{
 const root=mkdtempSync(join(tmpdir(),'graph-context-'));const context=new RunContext(join(root,'context'));const source=context.add({type:'input',producer:'user',key:'task',data:'source data',parents:[]});
 let received='';
 const result=await runGraph('prepare',[
  {kind:'gate',id:'prepare',run:state=>{state.context!.add({type:'finding',producer:'validator',key:'task',data:{text:state.context!.get(source.id)!.data},parents:[source.id]});}},
  {kind:'agent',id:'review',role:{id:'reviewer',name:'Reviewer',systemPrompt:'Review data'},backend:{start:async(_role,prompt)=>{received=prompt;return {sessionId:'',reply:'reviewed'};},resume:async()=>({reply:''})},buildPrompt:state=>JSON.stringify(state.context!.latest('finding','task')!.data)},
  {kind:'terminal',id:'done',result:'done'}
 ],[{from:'prepare',to:'review',condition:()=>true},{from:'review',to:'done',condition:()=>true}],new ChatLog(join(root,'chat.jsonl')),{context});
 assert.equal(result,'done');assert.equal(received,'{"text":"source data"}');assert.equal(new RunContext(join(root,'context')).list().length,2);
});
