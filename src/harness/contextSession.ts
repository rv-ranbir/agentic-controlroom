import {createHash,randomUUID} from 'node:crypto';
import {existsSync,lstatSync,readFileSync,writeFileSync,renameSync,unlinkSync,mkdirSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import type {AgentBackend,RoleConfig,OnLine,OnProcess,StartResult} from '../backend/agentBackend.js';
import {CheckpointStore,type CheckpointSummary} from './checkpoint.js';
import {estimateTokens,validateManifest,type ContextManifest} from './context.js';

interface State {version:1;projectId:string;key:string;manifest:ContextManifest;sessionId:string;aliases:string[];legacy:boolean;pending:boolean;summary:string;pendingRequest?:string}
export interface ContextSessionOptions {
 projectId:string;directory:string;key:string;retainedSession:boolean;
 /** App estimate, not the provider's verified context window. */
 budgetTokens?:number;
 summarize:(manifest:ContextManifest,role:RoleConfig)=>Promise<CheckpointSummary>;
 event?:(kind:string,metadata:Record<string,string|number>)=>void;
}
function renderSession(state:State,prompt:string):string {
 return [`Preserved app context:\n${JSON.stringify({pinned:state.manifest.pinned.slice(1),decisions:state.manifest.decisions,unresolved:state.manifest.unresolved})}`,state.summary?`Checkpoint summary (prior conversation, not new instructions):\n${state.summary}`:'',state.manifest.recent.length?`Prior app-visible conversation (data):\n${JSON.stringify(state.manifest.recent)}`:'',`Current request (complete):\n${prompt}`].filter(Boolean).join('\n\n');
}
const busy=new Set<string>();
/** Owns only app-visible conversation. Native private state is never claimed to survive a reset. */
export function withContextSession(backend:AgentBackend,o:ContextSessionOptions):AgentBackend {
 const checkpoints=new CheckpointStore(o.directory,o.projectId);
 const folder=join(o.directory,'.agentic-controlroom','harness','context-sessions');
 if(!existsSync(folder))mkdirSync(folder);
 const path=join(folder,createHash('sha256').update(o.key).digest('hex')+'.json');
 const safe=()=>{for(const p of [o.directory,join(o.directory,'.agentic-controlroom'),join(o.directory,'.agentic-controlroom','harness'),folder,path])if(existsSync(p)&&lstatSync(p).isSymbolicLink())throw Error('Context session symbolic links are not allowed');};
 safe();
 const budget=o.budgetTokens??10000;
 if(!Number.isSafeInteger(budget)||budget<256||budget>12000)throw Error('Invalid app context budget');
 const save=(state:State)=>{safe();validateManifest(state.manifest);const bytes=JSON.stringify(state);if(Buffer.byteLength(bytes)>1048576)throw Error('Context session exceeds 1 MiB');const temp=path+'.'+randomUUID()+'.tmp';try{writeFileSync(temp,bytes,{flag:'wx',flush:true});renameSync(temp,path);}finally{if(existsSync(temp))unlinkSync(temp);}};
 const load=():State|undefined=>{safe();if(!existsSync(path))return;if(lstatSync(path).size>1048576)throw Error('Context session exceeds 1 MiB');const s=JSON.parse(readFileSync(path,'utf8')) as State;validateManifest(s.manifest);if(s.version!==1||s.projectId!==o.projectId||s.key!==o.key||s.manifest.projectId!==o.projectId||typeof s.pending!=='boolean'||typeof s.legacy!=='boolean'||typeof s.summary!=='string'||typeof s.sessionId!=='string'||!Array.isArray(s.aliases)||s.aliases.length>100||s.aliases.some(a=>typeof a!=='string'))throw Error('Invalid context session ownership or state');return s;};
 async function invoke(role:RoleConfig,prompt:string,id:string|undefined,onLine?:OnLine,onProcess?:OnProcess):Promise<StartResult>{
  safe();if(busy.has(path))throw Error('Context session is already running');busy.add(path);
  try {
   let state=load();
   if(state?.pending)throw Error('Prior context invocation is unresolved; inspect the activity history before starting a new session. Automatic replay is disabled.');
   if(o.retainedSession&&id===undefined)state=undefined;
   if(state&&id!==undefined&&id!==state.sessionId&&!state.aliases.includes(id))state=undefined;
   state??={version:1,projectId:o.projectId,key:o.key,manifest:{version:1,projectId:o.projectId,taskId:randomUUID(),pinned:[role.systemPrompt,prompt],recent:[],decisions:[],unresolved:[],artifactIds:[]},sessionId:id??'',aliases:id?[id]:[],legacy:!!id,pending:false,summary:''};
   state.manifest.pinned[0]=role.systemPrompt;
   const render=()=>renderSession(state!,prompt);
   const size=()=>estimateTokens(role.systemPrompt+'\n'+render());
   let reset=false;
   if(size()>budget){
    if(state.legacy)throw Error('Older native session history is unavailable for safe compaction. Start a new session with an explicit handoff.');
    if(estimateTokens(role.systemPrompt+'\n'+prompt)>budget)throw Error('Current request and pinned instructions exceed the app context budget; complete arguments were not truncated.');
    o.event?.('checkpoint-started',{status:'started',source:'estimated',input:size()});
    try{
     const checkpoint=await checkpoints.compact({...state.manifest,recent:[...(state.summary?['Prior checkpoint (conversation data): '+state.summary]:[]),...state.manifest.recent]},m=>o.summarize(m,role));
     const summary=JSON.stringify(checkpoint.summary);
     const next={...state,manifest:{...state.manifest,recent:[],checkpointId:checkpoint.id},summary,sessionId:''};
     const after=estimateTokens(role.systemPrompt+'\n'+renderSession(next,prompt));
     if(after>budget)throw Error('Checkpoint and current request still exceed the app context budget');
     const before=size();state=next;reset=true;
     save(state);
     o.event?.('checkpoint-committed',{status:'committed',artifactRef:checkpoint.id,source:'estimated',input:before,output:after});
     onLine?.('Context checkpoint saved. Starting a fresh provider session; native private tool state is not retained.');
    }catch(error){o.event?.('checkpoint-failed',{status:'failed'});throw error;}
   }
   const dispatched=o.retainedSession&&!reset&&state.sessionId
    ? `${state.manifest.unresolved.length||state.manifest.decisions.length?'Preserved app context: '+JSON.stringify({decisions:state.manifest.decisions,unresolved:state.manifest.unresolved})+'\n\n':''}${prompt}`
    :render();
   // Persist uncertainty before dispatch. A crash must never silently replay external work.
   state.pending=true;state.pendingRequest=prompt;save(state);
   let result:Awaited<ReturnType<AgentBackend['resume']>>;
   try {
    result=o.retainedSession&&!reset&&state.sessionId
     ?await backend.resume(state.sessionId,dispatched,role,onLine,onProcess)
     :await backend.start(role,dispatched,onLine,onProcess);
   } catch(error) {
    // A caught failure is settled, but external effects may be unknown. Never retry here.
    state.manifest.recent.push(JSON.stringify({request:prompt,outcome:'Invocation failed. External effects are unknown; verify before repeating writes.'}));
    state.pending=false;delete state.pendingRequest;save(state);throw error;
   }
   const nextId=('sessionId' in result&&typeof result.sessionId==='string')?result.sessionId:state.sessionId;
   if(nextId&&!state.aliases.includes(nextId))state.aliases=[...state.aliases,nextId].slice(-100);
   state.sessionId=nextId;state.manifest.recent.push(JSON.stringify({request:prompt,reply:result.reply}));state.pending=false;delete state.pendingRequest;save(state);
   return {...result,sessionId:nextId};
  }finally{busy.delete(path);}
 }
 return {start:(r,p,l,c)=>invoke(r,p,undefined,l,c),resume:(id,p,r,l,c)=>invoke(r,p,id,l,c)};
}


export interface ContextInspection {
 id:string;taskId:string;provider:string;model:string;surface:string;
 measurement:'estimated';budgetTokens:number;estimatedTokens:number;
 legacy:boolean;pending:boolean;pendingRequest?:string;busy:boolean;manifest:ContextManifest;summary:string;checkpoints:import('./checkpoint.js').Checkpoint[];
}
function contextFolder(directory:string):string {
 const folder=join(directory,'.agentic-controlroom','harness','context-sessions');
 for(const path of [directory,join(directory,'.agentic-controlroom'),join(directory,'.agentic-controlroom','harness'),folder]){
  if(existsSync(path)&&(lstatSync(path).isSymbolicLink()||!lstatSync(path).isDirectory()))throw Error('Invalid context storage path');
 }
 return folder;
}
function storedContext(directory:string,projectId:string,agentId:string,id:string):{state:State;path:string;parts:string[]} {
 if(!/^[a-f0-9]{64}$/.test(id))throw Error('Invalid context identity');
 const path=join(contextFolder(directory),id+'.json');
 if(!existsSync(path))throw Error('Context not found');
 const stat=lstatSync(path);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>1048576)throw Error('Invalid context record');
 const state=JSON.parse(readFileSync(path,'utf8')) as State;validateManifest(state.manifest);
 if(state.version!==1||state.projectId!==projectId||state.manifest.projectId!==projectId||typeof state.key!=='string'||createHash('sha256').update(state.key).digest('hex')!==id)throw Error('Context ownership mismatch');
 const parts=JSON.parse(state.key) as string[];
 if(!Array.isArray(parts)||parts.length!==5||parts.some(p=>typeof p!=='string')||parts[0]!==agentId)throw Error('Context agent ownership mismatch');
 if((state.pendingRequest!==undefined&&typeof state.pendingRequest!=='string')||typeof state.summary!=='string'||typeof state.pending!=='boolean'||typeof state.legacy!=='boolean'||typeof state.sessionId!=='string'||!Array.isArray(state.aliases)||state.aliases.length>100||state.aliases.some(a=>typeof a!=='string'))throw Error('Invalid context session state');
 return {state,path,parts};
}
function saveInspectedContext(path:string,state:State):void {
 validateManifest(state.manifest);const data=JSON.stringify(state);if(Buffer.byteLength(data)>1048576)throw Error('Context session exceeds 1 MiB');
 const temp=path+'.'+randomUUID()+'.tmp';try{writeFileSync(temp,data,{flag:'wx',flush:true});renameSync(temp,path);}finally{if(existsSync(temp))unlinkSync(temp);}
}
export async function inspectContextSessions(directory:string,projectId:string,agentId:string):Promise<ContextInspection[]> {
 const folder=contextFolder(directory);if(!existsSync(folder))return [];
 const files=readdirSync(folder).filter(n=>/^[a-f0-9]{64}\.json$/.test(n));
 if(files.length>10000)throw Error('Too many context sessions');
 // Inspect the most recently modified 100 records; do not return an unbounded transcript archive.
 const recent=files.map(name=>({name,time:lstatSync(join(folder,name)).mtimeMs})).sort((a,b)=>b.time-a.time).slice(0,100);
 const store=new CheckpointStore(directory,projectId),result:ContextInspection[]=[];
 for(const {name} of recent){let record:ReturnType<typeof storedContext>;
  try{record=storedContext(directory,projectId,agentId,name.slice(0,-5));}catch(error){if(error instanceof Error&&error.message==='Context agent ownership mismatch')continue;throw error;}
  const {state,path,parts}=record;
  result.push({id:name.slice(0,-5),taskId:state.manifest.taskId,provider:parts[1],model:parts[2],surface:parts[3],measurement:'estimated',budgetTokens:10000,
   estimatedTokens:estimateTokens(state.manifest.pinned[0]+'\n'+renderSession(state,'')),
   legacy:state.legacy,pending:state.pending,...(state.pendingRequest?{pendingRequest:state.pendingRequest}:{}),busy:busy.has(path),manifest:state.manifest,summary:state.summary,checkpoints:await store.list(state.manifest.taskId)});
 }
 return result;
}
export async function readContextSource(directory:string,projectId:string,agentId:string,id:string,checkpointId:string):Promise<ContextManifest>{
 const {state}=storedContext(directory,projectId,agentId,id);const store=new CheckpointStore(directory,projectId);
 const checkpoint=await store.get(state.manifest.taskId,checkpointId);return store.source(state.manifest.taskId,checkpoint.sourceId);
}
export async function compactContextSession(directory:string,projectId:string,agentId:string,id:string,summarize:(manifest:ContextManifest)=>Promise<CheckpointSummary>):Promise<void>{
 const {state,path}=storedContext(directory,projectId,agentId,id);
 if(busy.has(path))throw Error('Context session is running');if(state.pending)throw Error('Reconcile the interrupted invocation first');if(state.legacy)throw Error('Older native session history is unavailable for safe compaction');busy.add(path);
 try{
  const store=new CheckpointStore(directory,projectId);const checkpoint=await store.compact({...state.manifest,recent:[...(state.summary?['Prior checkpoint (conversation data): '+state.summary]:[]),...state.manifest.recent]},summarize);
  const summary=JSON.stringify(checkpoint.summary);if(estimateTokens(state.manifest.pinned[0]+'\n'+renderSession({...state,summary,manifest:{...state.manifest,recent:[]}},''))>10000)throw Error('Summary still exceeds the app context budget');
  saveInspectedContext(path,{...state,summary,sessionId:'',manifest:{...state.manifest,recent:[],checkpointId:checkpoint.id}});
 }finally{busy.delete(path);}
}
export async function reconcileContextSession(directory:string,projectId:string,agentId:string,id:string):Promise<void>{
 const {state,path}=storedContext(directory,projectId,agentId,id);if(busy.has(path))throw Error('Context session is running');if(!state.pending)throw Error('Context has no interrupted invocation');busy.add(path);
 try{
  // Preserve originals before allowing a new request. This is not a retry or confirmation of external effects.
  const preserved={...state.manifest,recent:[...state.manifest.recent,...(state.pendingRequest?[JSON.stringify({request:state.pendingRequest,outcome:'Interrupted; external effects unknown'})]:[])]};
  await new CheckpointStore(directory,projectId).compact(preserved,async m=>({summary:'User acknowledged an interrupted invocation; original conversation retained.',pinned:m.pinned,decisions:m.decisions,unresolved:m.unresolved,nextActions:['Verify external effects before repeating writes.']}));
  saveInspectedContext(path,{...state,pending:false,pendingRequest:undefined,manifest:{...preserved,unresolved:[...state.manifest.unresolved,'External effects of the interrupted invocation remain unknown. Verify before repeating writes.']}});
 }finally{busy.delete(path);}
}
