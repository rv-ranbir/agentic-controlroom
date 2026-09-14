// Protocol references and tested Cursor version are recorded in docs/OFFICE-ROUTING-AND-PROVIDERS.md.
export function subagentEvents(provider:string,e:any):any[]{
 if(provider==='claude')return [e];
 if(provider==='codex'){
  const i=e?.item;if(!['item.started','item.updated','item.completed'].includes(e?.type)||i?.type!=='collab_tool_call'||typeof i.sender_thread_id!=='string'||!Array.isArray(i.receiver_thread_ids))return [];
  const result:any[]=[];
  for(const id of i.receiver_thread_ids.slice(0,100)){
   if(typeof id!=='string'||!id)continue;
   const base={type:'system',session_id:i.sender_thread_id,task_id:id};
   const state=i.agents_states?.[id];
   if(i.tool==='spawn_agent'&&i.status!=='failed')result.push({...base,subtype:'task_started',task_type:'remote_agent',description:typeof i.prompt==='string'?i.prompt.slice(0,160):'Codex delegated agent'});
   const status=state?.status;
   if(i.tool==='send_input'&&e.type==='item.completed'&&i.status==='completed'&&status==='running'&&typeof i.id==='string')result.push({...base,subtype:'task_started',task_type:'remote_agent',is_resume:true,invocation_id:i.id});
   if(['pending_init','running'].includes(status))result.push({...base,subtype:'task_progress',summary:state.message,last_tool_name:i.tool});
   const terminal:Record<string,string>={completed:'completed',errored:'failed',shutdown:'stopped',interrupted:'stopped'};
   if(terminal[status])result.push({...base,subtype:'task_notification',status:terminal[status],summary:state.message});
   if(status==='not_found')result.push({...base,subtype:'task_unobserved',summary:'Provider could not find this delegated agent.'});
  }
  return result;
 }
 if(provider==='cursor'){
  if(e?.type!=='tool_call'||!['started','completed'].includes(e.subtype)||typeof e.session_id!=='string'||typeof e.call_id!=='string')return [];
  const task=e.tool_call?.taskToolCall;if(!task)return [];
  const type=task.args?.subagentType;
  // Shell tools are not agent identities, including typed Task shell helpers.
  if(type&&(Object.hasOwn(type,'shell')||Object.hasOwn(type,'bash')))return [];
  const base={type:'system',session_id:e.session_id,task_id:e.call_id,tool_use_id:e.call_id};
  if(e.subtype==='started')return [{...base,subtype:'task_started',task_type:'remote_agent',description:task.args?.description||'Cursor delegated agent'}];
  const result=task.result;
  if(result?.error)return [{...base,subtype:'task_notification',status:'failed',summary:result.error.error}];
  if(result?.success){
   if(result.success.isBackground===true)return [{...base,subtype:'task_progress',summary:'Running in background; awaiting provider completion evidence.'}];
   return [{...base,subtype:'task_notification',status:'completed',summary:result.success.resultSuffix||'Cursor reported the delegated task completed.'}];
  }
 }
 return [];
}
