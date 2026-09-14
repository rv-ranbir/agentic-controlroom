import {subagentEvents} from './subagentAdapters.js';
export interface SubagentRecord {
 id:string;projectId:string;parentAgentId:string;sessionId:string;taskId:string;toolUseId?:string;
 description:string;status:'running'|'completed'|'failed'|'stopped'|'unobserved';summary?:string;lastTool?:string;updatedAt:number;
 background:boolean;provider?:string;lastResumeId?:string;
}
const text=(v:unknown,max=500)=>typeof v==='string'?v.slice(0,max):'';
export class SubagentRegistry {
 private records=new Map<string,SubagentRecord>();
 snapshot(){return [...this.records.values()].map(r=>({...r}));}
 consume(projectId:string,parentAgentId:string,line:string,provider:string="claude"):boolean {
  if(line.length>262144)return false;let e:any;try{e=JSON.parse(line);}catch{return false;}
  if(provider!=='claude'){let changed=false;for(const event of subagentEvents(provider,e))changed=this.consumeNormalized(projectId,parentAgentId,event,provider)||changed;return changed;}
  return this.consumeNormalized(projectId,parentAgentId,e,provider);
 }
 private consumeNormalized(projectId:string,parentAgentId:string,e:any,provider:string):boolean {
  const rawSession=text(e?.session_id,200);
  const sessionId=rawSession?(provider==='claude'?rawSession:provider+':'+rawSession):'';if(!sessionId)return false;
  const find=(taskId:string,toolId:string)=>[...this.records.values()].find(r=>r.projectId===projectId&&r.parentAgentId===parentAgentId&&r.sessionId===sessionId&&(r.provider??'claude')===provider&&((taskId&&r.taskId===taskId)||(toolId&&r.toolUseId===toolId)));
  const start=(taskId:string,toolUseId:string,description:string,background:boolean)=>{
   if(!taskId)return false;const prior=find(taskId,toolUseId);if(prior){if(e.is_resume===true&&text(e.invocation_id,200)&&prior.lastResumeId!==e.invocation_id){prior.status='running';prior.lastResumeId=text(e.invocation_id,200);prior.summary=undefined;}if(prior.status!=='running'&&prior.status!=='unobserved')return false;prior.taskId=taskId;prior.background=background;prior.description=description||prior.description;prior.updatedAt=Date.now();return true;}
   if(this.records.size>=500){const oldest=[...this.records.values()].find(r=>r.status!=='running');if(oldest)this.records.delete(oldest.id);else return false;}
   const id=JSON.stringify([projectId,parentAgentId,provider,sessionId,toolUseId||taskId]);
   this.records.set(id,{id,projectId,parentAgentId,sessionId,taskId,toolUseId:toolUseId||undefined,description:description||'Delegated agent',status:'running',provider,background,updatedAt:Date.now()});return true;
  };
  if(e.type==='system'){
   const taskId=text(e.task_id,200),toolId=text(e.tool_use_id,200);
   if(e.subtype==='task_started')return ['local_agent','remote_agent'].includes(e.task_type)&&start(taskId,toolId,text(e.description),true);
   const record=find(taskId,toolId);if(!record)return false;
   if(e.subtype==='task_unobserved'&&record.status==='running'){record.status='unobserved';record.summary=text(e.summary,1000);record.updatedAt=Date.now();return true;}
   if(e.subtype==='task_progress'&&(record.status==='running'||record.status==='unobserved')){record.status='running';record.description=text(e.description)||record.description;record.summary=text(e.summary,1000)||record.summary;record.lastTool=text(e.last_tool_name,100)||record.lastTool;record.updatedAt=Date.now();return true;}
   if(e.subtype==='task_notification'&&['completed','failed','stopped'].includes(e.status)&&(record.status==='running'||record.status==='unobserved')){record.status=e.status;record.summary=text(e.summary,1000);record.updatedAt=Date.now();return true;}
  }
  const content=e.message?.content;if(!Array.isArray(content))return false;let changed=false;
  for(const block of content){
   if(e.type==='assistant'&&block?.type==='tool_use'&&['Agent','Task'].includes(block.name)&&typeof block.input?.subagent_type==='string')changed=start(text(block.id,200),text(block.id,200),text(block.input.description)||text(block.input.subagent_type),block.input.run_in_background===true)||changed;
   if(e.type==='user'&&block?.type==='tool_result'){
    const record=find('',text(block.tool_use_id,200));if(record&&!record.background&&(record.status==='running'||record.status==='unobserved')){record.status=block.is_error?'failed':'completed';record.summary=text(block.content,1000);record.updatedAt=Date.now();changed=true;}
   }
  }
  return changed;
 }
 stopObserving(projectId:string,parentAgentId:string){let changed=false;for(const r of this.records.values())if(r.projectId===projectId&&r.parentAgentId===parentAgentId&&r.status==='running'){r.status='unobserved';r.summary='Parent stream ended before a completion event was observed.';r.updatedAt=Date.now();changed=true;}return changed;}
}
