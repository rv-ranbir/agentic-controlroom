import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeUsage,providerUsage,usageReport,exportUsage} from './usage.js';
import {AuditJournal} from './audit.js';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRunScope} from './runScope.js';
import {withInvocation} from './invocation.js';
test('usage normalization does not turn missing or invalid measurements into zero',()=>{
 assert.equal(normalizeUsage(undefined).input,null);
 assert.equal(normalizeUsage({inputTokens:NaN,outputTokens:-1}).source,'unavailable');
 assert.equal(normalizeUsage({inputTokens:0,outputTokens:0}).source,'provider');
 assert.equal(providerUsage('anthropic',{usage:{input_tokens:10,cache_read_input_tokens:4,cache_creation_input_tokens:3,output_tokens:5}}).inputTokens,17);
 const g=providerUsage('gemini',{usageMetadata:{promptTokenCount:10,candidatesTokenCount:5,thoughtsTokenCount:3}});assert.equal(g.outputTokens,5);assert.equal(g.reasoningTokens,3);
 assert.equal(providerUsage('cursor',{usage:{input_tokens:999}}).inputTokens,null);
});
test('per-attempt usage persists, unknown attempts count, replay and filters do not inflate totals',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'usage-'));try{
 const journal=new AuditJournal(dir,{projectId:'p'}),scope=createRunScope('p','a');
 const backend=withInvocation({start:async()=>({sessionId:'',reply:'private',usage:{inputTokens:10,outputTokens:5,costUsd:null}}),resume:async()=>({reply:'private'})},{scope,provider:'codex',model:'sample',journal});
 await backend.start({id:'a',name:'a',systemPrompt:''},'private');await backend.resume('','next',{id:'a',name:'a',systemPrompt:''});
 const settled=journal.query({limit:500}).find(e=>e.kind==='attempt-settled')!;journal.append(settled);
 const report=usageReport(new AuditJournal(dir,{projectId:'p'}));assert.equal(report.totals.knownInput,10);assert.equal(report.totals.knownOutput,5);assert.equal(report.totals.unknownAttempts,1);assert.equal(report.totals.attempts,2);
 assert.equal(usageReport(journal,{agentId:'other'}).totals.attempts,0);assert.equal(report.rows[0].billing,'subscription');assert.equal(JSON.stringify(report).includes('private'),false);
 assert.ok(exportUsage(report,'csv').startsWith('attemptId,'));assert.equal(JSON.parse(exportUsage(report,'json')).totals.attempts,2);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('failed provider call retains safe reported measurement',async()=>{
 const events:any[]=[];const wrapped=withInvocation({start:async()=>{throw Object.assign(Error('secret'),{usage:{inputTokens:12,outputTokens:null,costUsd:null}});},resume:async()=>({reply:''})},{scope:createRunScope('p','a'),provider:'openai',model:'m',journal:{append:e=>events.push(e)}});
 await assert.rejects(wrapped.start({id:'a',name:'a',systemPrompt:''},'task'));const done=events.find(e=>e.kind==='attempt-settled');assert.equal(done.metadata.input,12);assert.equal(JSON.stringify(events).includes('secret'),false);
});

test('HTTP resume and failures retain measurements per response',async()=>{
 const config={provider:'openai' as const,model:'m',keyEnv:'OPENAI_API_KEY',maxTokens:20,timeoutMs:1000};
 const {createHttpBackend}=await import('../backend/httpBackend.js');const role={id:'a',name:'a',systemPrompt:''};
 const good=createHttpBackend(config,{OPENAI_API_KEY:'fixture'},async()=>Response.json({choices:[{message:{content:'ok'}}],usage:{prompt_tokens:10,completion_tokens:5,prompt_tokens_details:{cached_tokens:4},completion_tokens_details:{reasoning_tokens:2}}}));
 assert.equal((await good.resume('','x',role)).usage?.inputTokens,10);assert.equal((await good.start(role,'x')).usage?.cacheReadTokens,4);
 const bad=createHttpBackend(config,{OPENAI_API_KEY:'fixture'},async()=>Response.json({error:'private',usage:{prompt_tokens:12}},{status:400}));
 await assert.rejects(bad.start(role,'x'),(e:any)=>e.usage.inputTokens===12&&!e.message.includes('private'));
});

test('Claude result usage excludes cumulative price estimates and survives failed results',async()=>{
 const {claudeResult}=await import('../backend/claudeCliBackend.js');
 const result={type:'result',result:'done',session_id:'fixture',total_cost_usd:100,usage:{input_tokens:10,output_tokens:5,cache_read_input_tokens:4,cache_creation_input_tokens:3}};
 assert.equal(claudeResult(JSON.stringify(result)).usage?.inputTokens,17);assert.equal(claudeResult(JSON.stringify(result)).usage?.costUsd,null);
 assert.throws(()=>claudeResult(JSON.stringify({...result,is_error:true,result:'private error'})),(e:any)=>e.usage.inputTokens===17&&!e.message.includes('private'));
});
test('estimated tokens never inflate measured totals',()=>{
 const directory=mkdtempSync(join(tmpdir(),'usage-estimated-'));try{const journal=new AuditJournal(directory,{projectId:'p'});journal.append({eventId:'estimate',scope:createRunScope('p','a'),attemptId:'estimated',kind:'attempt-settled',metadata:{input:900,output:90,source:'estimated'}});
 const report=usageReport(journal);assert.equal(report.totals.knownInput,0);assert.equal(report.totals.knownOutput,0);assert.equal(report.totals.unknownAttempts,1);assert.equal(report.rows[0].input,900);
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('agent and compaction attempts remain separate while measured totals count each attempt once',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'usage-purpose-'));try{
  const journal=new AuditJournal(directory,{projectId:'p'}),scope=createRunScope('p','a');
  const provider={start:async()=>({sessionId:'',reply:'ok',usage:{inputTokens:10,outputTokens:5,costUsd:null}}),resume:async()=>({reply:'ok'})};
  await withInvocation(provider,{scope,provider:'codex',model:'m',journal}).start({id:'a',name:'a',systemPrompt:''},'agent');
  await withInvocation(provider,{scope,provider:'codex',model:'m',purpose:'compaction',journal}).start({id:'a',name:'a',systemPrompt:''},'compact');
  const report=usageReport(new AuditJournal(directory,{projectId:'p'}));
  assert.equal(report.totals.attempts,2);assert.equal(report.totals.knownInput,20);assert.equal(report.totals.knownOutput,10);
  assert.deepEqual(report.rows.map(row=>row.purpose).sort(),['agent','compaction']);
  const csv=exportUsage(report,'csv');assert.match(csv,/purpose/);assert.match(csv,/compaction/);
  const json=JSON.parse(exportUsage(report,'json'));assert.deepEqual(json.rows.map((row:any)=>row.purpose).sort(),['agent','compaction']);
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('legacy usage events default to agent purpose',()=>{
 const directory=mkdtempSync(join(tmpdir(),'usage-legacy-purpose-'));try{
  const journal=new AuditJournal(directory,{projectId:'p'}),scope=createRunScope('p','a');
  journal.append({eventId:'legacy',scope,attemptId:'legacy-attempt',kind:'attempt-settled',metadata:{provider:'codex',model:'m',input:3,output:2,source:'provider'}});
  assert.equal(usageReport(journal).rows[0].purpose,'agent');
 }finally{rmSync(directory,{recursive:true,force:true});}
});
