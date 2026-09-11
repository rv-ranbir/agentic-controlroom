import {useEffect,useState} from 'react';
type Artifact={id:string;title:string;kind:string;createdAt:string};
type Run={id:string;name:string;status:string;parentRunId?:string};
type WallApi={listWorkflowRuns:(projectId:string)=>Promise<Run[]>;listArtifacts:(projectId:string)=>Promise<Artifact[]>;openArtifact:(projectId:string,id:string,mode:'app'|'browser')=>Promise<void>};
export function OfficeResultsWall({projectId,onClose}:{projectId:string;onClose:()=>void}){
 const [runs,setRuns]=useState<Run[]>([]);
 const [artifacts,setArtifacts]=useState<Artifact[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;setLoading(true);setArtifacts([]);setRuns([]);setError('');Promise.all([(api as unknown as WallApi).listArtifacts(projectId),(api as unknown as WallApi).listWorkflowRuns(projectId)]).then(([items,work])=>{if(active){setArtifacts([...items].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));setRuns(work);}}).catch(()=>{if(active)setError('Could not load results. Try refreshing.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[projectId,revision]);
 async function open(id:string,mode:'app'|'browser'){try{await (api as unknown as WallApi).openArtifact(projectId,id,mode);}catch{setError('Could not open this result.');}}
 return <section className="osResultsWall" aria-label="Project results wall">
 <header><div><strong>Results wall</strong><span> Published by this project</span></div><div><button className="pillBtn ghostBtn" onClick={()=>setRevision(v=>v+1)}>Refresh results</button><button className="pillBtn ghostBtn" onClick={onClose}>Close results</button></div></header>
 {error&&<p role="alert">{error}</p>}{loading?<p role="status">Loading results…</p>:artifacts.length===0?<p>No published results yet. Agent-created reports and views will appear here.</p>:<div className="osResultCards">{artifacts.map(a=><article key={a.id}><span>{a.kind}</span><h3>{a.title}</h3><div><button className="pillBtn" onClick={()=>open(a.id,'app')}>Preview in app</button><button className="pillBtn ghostBtn" onClick={()=>open(a.id,'browser')}>Open in browser</button></div></article>)}</div>}
 {runs.some(r=>r.parentRunId)&&<details className="osDelegatedWork"><summary>Delegated workflows ({runs.filter(r=>r.parentRunId).length})</summary>{runs.filter(r=>r.parentRunId).map(r=><p key={r.id}><strong>{r.name}</strong> · {r.status}<span> From {runs.find(parent=>parent.id===r.parentRunId)?.name ?? "parent workflow"}</span></p>)}</details>}
 </section>;
}
