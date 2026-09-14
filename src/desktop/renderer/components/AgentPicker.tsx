import { useState } from 'react';
import { initials, colorFor } from '../lib/agents';
export function AgentPicker({agents,value,onToggle,blocked,label}:{agents:{id:string;name:string}[];value:Set<string>;onToggle:(id:string)=>void;blocked?:string;label:string}){
 const [query,setQuery]=useState('');const visible=agents.filter(a=>a.name.toLowerCase().includes(query.toLowerCase()));
 return <fieldset className="agentPicker"><legend>{label} <span>{value.size} selected</span></legend><input className="fInput" aria-label={`Search ${label.toLowerCase()}`} placeholder="Find an agent…" value={query} onChange={e=>setQuery(e.target.value)}/><div className="agentPickerList">{visible.map(a=><button type="button" key={a.id} aria-pressed={value.has(a.id)} disabled={a.id===blocked} onClick={()=>onToggle(a.id)}><span className="monogram" style={{background:colorFor(a.id)}}>{initials(a.name)}</span><span>{a.name}</span><span className="agentPickerCheck" aria-hidden="true">{value.has(a.id)?'✓':'+'}</span></button>)}</div>{!visible.length&&<p className="dim">{agents.length?'No matching agents.':'Add agents to this project first.'}</p>}</fieldset>;
}
