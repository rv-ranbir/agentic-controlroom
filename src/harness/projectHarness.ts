import {randomUUID} from 'node:crypto';
import {existsSync,lstatSync,readFileSync,writeFileSync,renameSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import type {ChildProcess} from 'node:child_process';
import type {AgentBackend,OnProcess} from '../backend/agentBackend.js';
import {AuditJournal,type AuditEvent} from './audit.js';
import {assertRunScope} from './runScope.js';
import {withInvocation} from './invocation.js';
import {defaultPolicy,resolvePolicy} from './policy.js';
import type {RunScope,ExecutionPolicy,EffectivePolicy} from './types.js';
export interface ExecutionState {
 policy:ExecutionPolicy;effective:EffectivePolicy;canRun:boolean;events:AuditEvent[];diagnostics:string[];
 active:{runId:string;agentIds:string[];state:'running'|'cancel-requested';canInterrupt:boolean}[];
}
interface ActiveRun {scope:RunScope;controller:AbortController;refs:number;agents:Map<string,number>;processes:Set<ChildProcess>}
export interface RunHandle {signal:AbortSignal;finish():void}
export class ProjectHarness {
 readonly journal:AuditJournal;
 private readonly path:string;
 private readonly runs=new Map<string,ActiveRun>();
 constructor(readonly projectId:string,readonly directory:string,private readonly interrupt?:(child:ChildProcess)=>void) {
  this.journal=new AuditJournal(directory,{projectId});this.path=join(directory,'.agentic-controlroom','harness','policy.json');
 }
 private checkPaths():void {
  for(const path of [this.directory,join(this.directory,'.agentic-controlroom'),join(this.directory,'.agentic-controlroom','harness'),this.path]) {
   if(existsSync(path)&&lstatSync(path).isSymbolicLink())throw new Error('Execution settings cannot use symbolic links');
  }
 }
 private policy():ExecutionPolicy {
  this.checkPaths();
  if(!existsSync(this.path))return defaultPolicy();
  if(lstatSync(this.path).size>16384)throw new Error('Execution policy is too large');
  return this.cleanPolicy(JSON.parse(readFileSync(this.path,'utf8')));
 }
 private cleanPolicy(policy:ExecutionPolicy):ExecutionPolicy {
  const p=resolvePolicy(policy).requested;
  return {mode:p.mode,network:p.network,domains:[...p.domains],maxCalls:p.maxCalls,maxWallMs:p.maxWallMs,maxConcurrent:p.maxConcurrent};
 }
 private allowed(policy:ExecutionPolicy):boolean {
  // This release has no verified isolated driver or app resource controls.
  return policy.mode==='provider-managed'&&policy.network==='provider-managed'&&policy.maxCalls===0&&policy.maxWallMs===0&&policy.maxConcurrent===0;
 }
 assertAllowed(scope?:RunScope):void {
  if(scope){assertRunScope(scope);if(scope.projectId!==this.projectId)throw new Error('Harness project mismatch');}
  const policy=this.policy();
  if(!this.allowed(policy)){
   if(scope)this.journal.append({eventId:randomUUID(),scope,kind:'policy-denied',metadata:{status:'unavailable'}});
   throw new Error('Requested execution protection is unavailable. Choose provider-managed execution or configure a verified isolation driver.');
  }
 }
 savePolicy(policy:ExecutionPolicy):ExecutionState {
  if(this.runs.size)throw new Error('Wait for running executions to settle before changing policy');
  const clean=this.cleanPolicy(policy);this.checkPaths();
  const temporary=this.path+'.'+randomUUID()+'.pending';
  try{writeFileSync(temporary,JSON.stringify(clean),{flag:'wx',flush:true});renameSync(temporary,this.path);}finally{if(existsSync(temporary))unlinkSync(temporary);}
  return this.state();
 }
 state():ExecutionState {
  const policy=this.policy(),effective=resolvePolicy(policy);
  effective.mechanism='Provider-managed permissions. Native CLI flags and HTTP-provider capabilities differ; the app has no verified OS isolation driver.';
  return {policy,effective,canRun:this.allowed(policy),events:this.journal.query({limit:200,order:'desc'}),diagnostics:[...this.journal.diagnostics],
   active:[...this.runs.entries()].map(([runId,r])=>({runId,agentIds:[...r.agents.keys()].filter(id=>id!=='orchestrator'),state:r.controller.signal.aborted?'cancel-requested':'running',canInterrupt:!!this.interrupt&&r.processes.size>0}))};
 }
 begin(scope:RunScope,external?:AbortSignal):RunHandle {
  this.assertAllowed(scope);
  let run=this.runs.get(scope.runId);
  if(external?.aborted||run?.controller.signal.aborted)throw new Error('Execution cancelled before dispatch');
  if(!run){run={scope,controller:new AbortController(),refs:0,agents:new Map(),processes:new Set()};this.runs.set(scope.runId,run);}
  run.refs++;run.agents.set(scope.agentId,(run.agents.get(scope.agentId)??0)+1);
  const abort=()=>{try{this.cancel(scope.runId);}catch{/* The cancellation itself is applied even when its audit write fails. */}};
  if(external!==run.controller.signal)external?.addEventListener('abort',abort,{once:true});
  let finished=false;
  return {signal:run.controller.signal,finish:()=>{
   if(finished)return;finished=true;external?.removeEventListener('abort',abort);
   const count=(run!.agents.get(scope.agentId)??1)-1;if(count)run!.agents.set(scope.agentId,count);else run!.agents.delete(scope.agentId);
   if(--run!.refs===0)this.runs.delete(scope.runId);
  }};
 }
 cancel(runId:string):boolean {
  const run=this.runs.get(runId);if(!run)return false;if(run.controller.signal.aborted)return true;
  try{this.journal.append({eventId:randomUUID(),scope:run.scope,kind:'run-cancel-requested',metadata:{status:'requested'}});}
  catch{if(this.journal.diagnostics.length>=50)this.journal.diagnostics.shift();this.journal.diagnostics.push('Stop requested, but its audit record could not be written.');}
  finally{
   run.controller.abort();
   for(const child of run.processes){if(child.exitCode!==null||child.signalCode!==null)continue;try{this.interrupt?.(child);}catch{/* Request is logged; never claim termination succeeded. */}}
  }
  return true;
 }
 cancelAgent(agentId:string):boolean {let found=false;for(const [id,run] of this.runs)if(run.agents.has(agentId)){this.cancel(id);found=true;}return found;}
 async tool<T>(scope:RunScope,name:string,execute:()=>Promise<T>,signal?:AbortSignal):Promise<T> {
  this.assertAllowed(scope);if(signal?.aborted||this.runs.get(scope.runId)?.controller.signal.aborted)throw new Error('Execution cancelled before tool dispatch');
  const callId=randomUUID(),start=Date.now();
  const emit=(kind:string,status:string)=>this.journal.append({eventId:randomUUID(),scope,callId,kind,metadata:{tool:name,status,durationMs:Math.max(0,Date.now()-start)}});
  emit('tool-started','started');let status='failed';
  try{const result=await execute();status='completed';return result;}finally{emit('tool-settled',status);}
 }
 backend(backend:AgentBackend,scope:RunScope,provider:string,model:string,signal:AbortSignal):AgentBackend {
  const wrapped=withInvocation(backend,{scope,provider,model,signal,journal:this.journal,beforeInvoke:()=>this.assertAllowed(scope)});
  const execute=async<T>(call:(capture:OnProcess)=>Promise<T>,onProcess?:OnProcess):Promise<T>=>{
   const processes:ChildProcess[]=[];
   try{return await call(child=>{processes.push(child);this.runs.get(scope.runId)?.processes.add(child);onProcess?.(child);});}
   finally{for(const child of processes)this.runs.get(scope.runId)?.processes.delete(child);}
  };
  return {start:(role,prompt,onLine,onProcess)=>execute(capture=>wrapped.start(role,prompt,onLine,capture),onProcess),
   resume:(id,prompt,role,onLine,onProcess)=>execute(capture=>wrapped.resume(id,prompt,role,onLine,capture),onProcess)};
 }
}
