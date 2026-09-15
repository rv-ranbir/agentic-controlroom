import type { BackendUsage } from '../backend/agentBackend.js';
import type { AuditJournal, AuditEvent } from './audit.js';
export interface UsageSample {input:number|null;output:number|null;cacheRead:number|null;cacheWrite:number|null;reasoning:number|null;source:'provider'|'estimated'|'unavailable';reportedCost:number|null;currency:string|null}
export const count=(v:unknown):number|null=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:null;
const obj=(v:unknown):Record<string,any>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
export function normalizeUsage(value:unknown):UsageSample {
 const u=obj(value),input=count(u.inputTokens),output=count(u.outputTokens);
 const cost=u.reportedCost??u.costUsd;const validCost=typeof cost==='number'&&Number.isFinite(cost)&&cost>=0;const currency=u.reportedCost!==undefined?(u.currency==='credits'?'credits':u.currency==='USD'?'USD':null):'USD';
 return {input,output,cacheRead:count(u.cacheReadTokens),cacheWrite:count(u.cacheWriteTokens),reasoning:count(u.reasoningTokens),source:input===null&&output===null?'unavailable':u.source==='estimated'?'estimated':'provider',reportedCost:validCost&&currency?cost:null,currency:validCost?currency:null};
}
/** Provider counts retain their documented semantics; detail counts are not added by totals. */
export function providerUsage(provider:string,value:unknown):BackendUsage {
 const d=obj(value),u=obj(d.usage),g=obj(d.usageMetadata);
 let input:unknown,output:unknown,cacheRead:unknown,cacheWrite:unknown,reasoning:unknown;
 if(provider==='ollama'){input=d.prompt_eval_count;output=d.eval_count;cacheRead=d.prompt_eval_cached_count;}
 else if(provider==='gemini'){input=g.promptTokenCount;output=g.candidatesTokenCount;cacheRead=g.cachedContentTokenCount;reasoning=g.thoughtsTokenCount;}
 else if(provider==='anthropic'||provider==='claude'){
  input=u.input_tokens;output=u.output_tokens;cacheRead=u.cache_read_input_tokens;cacheWrite=u.cache_creation_input_tokens;
  if(count(input)!==null){const read=cacheRead===undefined?0:count(cacheRead),write=cacheWrite===undefined?0:count(cacheWrite);input=read===null||write===null?null:count(input)!+read+write;}
 }else if(provider==='codex'){input=u.input_tokens;output=u.output_tokens;cacheRead=u.cached_input_tokens;reasoning=u.reasoning_output_tokens;}
 else if(provider==='openai'||provider==='openrouter'){input=u.prompt_tokens;output=u.completion_tokens;cacheRead=obj(u.prompt_tokens_details).cached_tokens;cacheWrite=obj(u.prompt_tokens_details).cache_write_tokens;reasoning=obj(u.completion_tokens_details).reasoning_tokens;}
 return {inputTokens:count(input),outputTokens:count(output),costUsd:null,...(provider==='openrouter'&&typeof u.cost==='number'&&Number.isFinite(u.cost)&&u.cost>=0?{reportedCost:u.cost,currency:'credits'}:{}),...(cacheRead===undefined?{}:{cacheReadTokens:count(cacheRead)}),...(cacheWrite===undefined?{}:{cacheWriteTokens:count(cacheWrite)}),...(reasoning===undefined?{}:{reasoningTokens:count(reasoning)})};
}
export function cliUsage(provider:string,output:string):BackendUsage {
 for(const line of output.trim().split('\n').reverse()){try{const d=JSON.parse(line);if(d.type==='result')return providerUsage(provider,d);}catch{}}
 return providerUsage(provider,{});
}
export interface UsageFilter {agentId?:string;model?:string;runId?:string}
export interface UsageRow extends UsageSample {attemptId:string;runId:string;agentId:string;model:string;provider:string;purpose:'agent'|'compaction';billing:'subscription'|'api'|'local'|'unknown';status:string;durationMs:number|null;timestamp:string}
export interface UsageReport {events:AuditEvent[];rows:UsageRow[];totals:{knownInput:number;knownOutput:number;unknownAttempts:number;attempts:number;durationMs:number;toolCalls:number;reasoning:number;cacheRead:number;cacheWrite:number};retention:string}
export function retainedEvents(journal:AuditJournal):AuditEvent[]{
 const events:AuditEvent[]=[];let afterSequence=0;
 for(;;){const batch=journal.query({afterSequence,limit:500});events.push(...batch);if(batch.length<500)break;afterSequence=batch[batch.length-1].sequence;}
 return events;
}
export function usageReport(journal:AuditJournal,filter:UsageFilter={}):UsageReport {
 if(!filter||typeof filter!=='object'||Array.isArray(filter))throw Error('Invalid usage filter');
 for(const [key,value] of Object.entries(filter))if(!['agentId','model','runId'].includes(key)||typeof value!=='string'||value.length>200)throw Error('Invalid usage filter');
 const records=retainedEvents(journal),map=new Map<string,UsageRow>();
 for(const e of records){if(!e.attemptId||!e.kind.startsWith('attempt-'))continue;const m=e.metadata??{};
  const previous=map.get(e.attemptId),provider=String(m.provider??previous?.provider??''),model=String(m.model??previous?.model??''),purpose=m.purpose==='compaction'||previous?.purpose==='compaction'?'compaction':'agent';
  const row:UsageRow=previous??{attemptId:e.attemptId,runId:e.scope.runId,agentId:e.scope.agentId,provider,model,purpose,billing:provider==='codex'?'subscription':['openai','anthropic','gemini','openrouter'].includes(provider)?'api':provider==='ollama'?'local':'unknown',status:'unresolved',durationMs:null,timestamp:e.timestamp,...normalizeUsage(undefined)};
  if(e.kind==='attempt-failed')row.status='failed';else if(e.kind==='attempt-completed')row.status='completed';
  if(e.kind==='attempt-settled'){row.durationMs=count(m.durationMs);row.input=count(m.input);row.output=count(m.output);row.cacheRead=count(m.cacheRead);row.cacheWrite=count(m.cacheWrite);row.reasoning=count(m.reasoning);row.source=m.source==='provider'||m.source==='estimated'?m.source:'unavailable';row.reportedCost=typeof m.reportedCost==='number'&&m.reportedCost>=0?m.reportedCost:null;row.currency=row.reportedCost===null?null:m.currency==='credits'?'credits':m.currency==='USD'?'USD':null;}
  map.set(e.attemptId,row);
 }
 const rows=[...map.values()].filter(r=>(!filter.agentId||r.agentId===filter.agentId)&&(!filter.model||r.model===filter.model)&&(!filter.runId||r.runId===filter.runId)).reverse();
 const totals={knownInput:0,knownOutput:0,unknownAttempts:0,attempts:rows.length,durationMs:0,toolCalls:0,reasoning:0,cacheRead:0,cacheWrite:0};
 for(const r of rows){totals.knownInput+=r.source==='provider'?(r.input??0):0;totals.knownOutput+=r.source==='provider'?(r.output??0):0;totals.unknownAttempts+=Number(r.source!=='provider'||r.input===null||r.output===null);totals.durationMs+=r.durationMs??0;totals.reasoning+=r.reasoning??0;totals.cacheRead+=r.cacheRead??0;totals.cacheWrite+=r.cacheWrite??0;}
 totals.toolCalls=records.filter(e=>e.kind==='tool-started'&&(!filter.agentId||e.scope.agentId===filter.agentId)&&(!filter.runId||e.scope.runId===filter.runId)&&!filter.model).length;
 const events=records.filter(e=>(!filter.agentId||e.scope.agentId===filter.agentId)&&(!filter.runId||e.scope.runId===filter.runId)&&(!filter.model||e.metadata?.model===filter.model));
 return {events,rows,totals,retention:'Retained project history (up to five 5 MiB journal files), not lifetime totals. Tool calls cannot be assigned to a model; model filters exclude them.'};
}
export function exportUsage(report:UsageReport,format:'json'|'csv'):string {
 if(format==='json')return JSON.stringify(report,null,2);
 if(format!=='csv')throw Error('Invalid export format');
 const keys:(keyof UsageRow)[]=['attemptId','runId','agentId','provider','model','purpose','billing','status','timestamp','input','output','cacheRead','cacheWrite','reasoning','source','reportedCost','currency','durationMs'];
 const cell=(v:unknown)=>{const s=v===null?'':String(v??'');return '"'+(/^[=+@\-\t\r]/.test(s)?"'":'')+s.replace(/"/g,'""')+'"';};
 return keys.join(',')+'\n'+report.rows.map(row=>keys.map(k=>cell(row[k])).join(',')).join('\n');
}
