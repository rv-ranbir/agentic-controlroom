import {test} from 'node:test';import assert from 'node:assert/strict';import {SubagentRegistry} from './subagentPresence.js';
const line=(subtype:string,extra:object={})=>JSON.stringify({type:'system',subtype,session_id:'s',task_id:'t',...extra});
test('native lifecycle excludes shell tasks and tracks progress and completion',()=>{const r=new SubagentRegistry();assert.equal(r.consume('p','a',line('task_started',{task_type:'local_bash'})),false);assert.equal(r.consume('p','a',line('task_started',{task_type:'local_agent',description:'Research'})),true);r.consume('p','a',line('task_progress',{summary:'Checking evidence',last_tool_name:'Read'}));assert.equal(r.snapshot()[0].lastTool,'Read');r.consume('p','a',line('task_notification',{status:'completed'}));r.consume('p','a',line('task_progress'));assert.equal(r.snapshot()[0].status,'completed');});
test('parent/project/session isolation and stream end do not fake completion',()=>{const r=new SubagentRegistry();for(const p of ['p','q'])r.consume(p,'a',line('task_started',{task_type:'local_agent'}));r.stopObserving('p','a');assert.equal(r.snapshot()[0].status,'unobserved');assert.equal(r.snapshot()[1].status,'running');r.consume('q','a',line('task_notification',{status:'failed'}));assert.equal(r.snapshot()[1].status,'failed');assert.equal(r.consume('p','a','bad'),false);assert.equal(r.consume('p','a',line('task_notification',{task_id:'missing',status:'completed'})),false);});
test('foreground tools correlate results; background launch acknowledgement is not completion',()=>{const r=new SubagentRegistry();const tool=(id:string,bg:boolean)=>JSON.stringify({type:'assistant',session_id:'s',message:{content:[{type:'tool_use',id,name:'Agent',input:{subagent_type:'Explore',run_in_background:bg}}]}});const result=(id:string)=>JSON.stringify({type:'user',session_id:'s',message:{content:[{type:'tool_result',tool_use_id:id,content:'ok'}]}});r.consume('p','a',tool('foreground',false));r.consume('p','a',result('foreground'));assert.equal(r.snapshot()[0].status,'completed');r.consume('p','a',tool('background',true));r.consume('p','a',line('task_started',{task_type:'local_agent',tool_use_id:'background'}));r.consume('p','a',result('background'));assert.equal(r.snapshot().length,2);assert.equal(r.snapshot()[1].status,'running');});

test('Codex child state, not spawn-tool completion, controls lifecycle',()=>{
 const r=new SubagentRegistry();const event=(tool:string,status:string)=>JSON.stringify({type:'item.completed',item:{type:'collab_tool_call',tool,sender_thread_id:'s',receiver_thread_ids:['child'],status:'completed',agents_states:{child:{status,message:'Evidence'}}}});
 r.consume('p','a',event('spawn_agent','running'),'codex');assert.equal(r.snapshot()[0].status,'running');assert.equal(r.snapshot()[0].provider,'codex');
 r.consume('p','a',event('wait','completed'),'codex');assert.equal(r.snapshot()[0].status,'completed');r.consume('p','a',event('wait','running'),'codex');assert.equal(r.snapshot()[0].status,'completed');
 assert.equal(r.consume('p','a',JSON.stringify({type:'item.completed',item:{type:'command_execution'}}),'codex'),false);
});
test('Cursor Task success, error and background acknowledgement stay distinct',()=>{
 const r=new SubagentRegistry();const event=(id:string,subtype:string,result?:object,type:object={explore:{}})=>JSON.stringify({type:'tool_call',subtype,call_id:id,session_id:'s',tool_call:{taskToolCall:{args:{description:id,subagentType:type},result}}});
 for(const id of ['fg','bg','err'])r.consume('p','a',event(id,'started'),'cursor');
 r.consume('p','a',event('fg','completed',{success:{isBackground:false,resultSuffix:'Done'}}),'cursor');
 r.consume('p','a',event('bg','completed',{success:{isBackground:true}}),'cursor');
 r.consume('p','a',event('err','completed',{error:{error:'Failed'}}),'cursor');
 assert.deepEqual(r.snapshot().map(x=>x.status),['completed','running','failed']);
 assert.equal(r.consume('p','a',event('shell','started',undefined,{shell:{}}),'cursor'),false);
 r.stopObserving('p','a');assert.equal(r.snapshot()[1].status,'unobserved');
 // Same IDs from different providers remain isolated.
 r.consume('p','a',JSON.stringify({type:'system',subtype:'task_started',session_id:'s',task_id:'bg',task_type:'local_agent'}));assert.equal(r.snapshot().length,4);
});

test('explicit Codex follow-up reactivates a child but duplicate completed operation cannot resurrect it',()=>{
 const r=new SubagentRegistry();const event=(tool:string,status:string,id:string)=>JSON.stringify({type:'item.completed',item:{id,type:'collab_tool_call',tool,sender_thread_id:'s',receiver_thread_ids:['c'],status:'completed',agents_states:{c:{status}}}});
 r.consume('p','a',event('spawn_agent','completed','spawn'),'codex');assert.equal(r.snapshot()[0].status,'completed');
 r.consume('p','a',event('send_input','running','input1'),'codex');assert.equal(r.snapshot()[0].status,'running');
 r.consume('p','a',event('wait','completed','wait1'),'codex');r.consume('p','a',event('send_input','running','input1'),'codex');assert.equal(r.snapshot()[0].status,'completed');
});
