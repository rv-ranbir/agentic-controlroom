import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough, Writable} from 'node:stream';
import {CodexCliBackend,CodexOutput,codexArgs} from './codexCliBackend.js';
import {classifyLine} from './streamBlocks.js';
const role={id:'a',name:'Agent',systemPrompt:'Role rules'};
const events=[{type:'thread.started',thread_id:'test-thread'},{type:'item.completed',item:{type:'agent_message',text:'42'}},{type:'turn.completed',usage:{input_tokens:10,output_tokens:2}}];
test('Codex parses final messages, usage and failure without treating tools as answers',()=>{
 const p=new CodexOutput();for(const e of events)p.consume(JSON.stringify(e));assert.equal(p.result().reply,'42');assert.equal(p.result().sessionId,'test-thread');assert.equal(p.result().usage?.inputTokens,10);
 p.consume(JSON.stringify({type:'turn.failed',error:{message:'Quota exceeded'}}));assert.throws(()=>p.result(),/Quota/);assert.throws(()=>new CodexOutput().result(),/completed response/);
 assert.equal(classifyLine(JSON.stringify(events[1])).kind,'prose');
});
test('Codex args preserve named resume, stdin and sandbox without broad permissions',()=>{
 const args=codexArgs('chosen-model',['--sandbox','read-only','-c','model_reasoning_effort=low'],'test-thread');assert.deepEqual(args.slice(-3),['resume','test-thread','-']);assert.ok(args.includes('sandbox_mode="read-only"'));assert.ok(args.includes('chosen-model'));
 assert.throws(()=>codexArgs('', ['--dangerously-bypass-approvals-and-sandbox']));assert.throws(()=>codexArgs('',[], '--last')); // cannot select another session by flag
});
test('Codex backend uses ChatGPT auth, stdin, direct spawn and resumes the exact session',async()=>{
 const calls:any[]=[];const inputs:string[]=[];
 const spawnProcess=((bin:any,args:any,options:any)=>{calls.push({bin,args,options});const child:any=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();let input='';child.stdin=new Writable({write(chunk,_enc,done){input+=String(chunk);done();},final(done){inputs.push(input);queueMicrotask(()=>{child.stdout.write(args[0]==='login'?'Logged in using ChatGPT':events.map(e=>JSON.stringify(e)).join('\n'));child.emit('close',0);});done();}});return child;}) as any;
 const b=new CodexCliBackend({bin:'codex.exe',spawnProcess,env:{OPENAI_API_KEY:'do-not-use',CODEX_API_KEY:'do-not-use'}});assert.equal((await b.start(role,'Task')).reply,'42');await b.resume('test-thread','Follow-up',role);
 assert.equal(calls[1].options.shell,false);assert.equal(calls[1].options.env.OPENAI_API_KEY,undefined);assert.equal(inputs[1],'Role rules\n\nTask');assert.equal(inputs[3],'Follow-up');assert.deepEqual(calls[3].args.slice(-3),['resume','test-thread','-']);
});
test('Codex API-key login is rejected before a model request',async()=>{
 let count=0;const spawnProcess=(()=>{count++;const child:any=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new Writable({write(_c,_e,d){d();},final(done){queueMicrotask(()=>{child.stdout.write('Logged in using an API key');child.emit('close',0);});done();}});return child;}) as any;
 await assert.rejects(new CodexCliBackend({bin:'codex.exe',spawnProcess}).start(role,'Task'),/ChatGPT login/);assert.equal(count,1);
});
