import { createHash,randomUUID } from 'node:crypto';
import { mkdirSync,readdirSync,readFileSync,writeFileSync,linkSync,unlinkSync } from 'node:fs';
import { join } from 'node:path';

export interface ArtifactInput<T=unknown> { type:string; producer:string; key:string; data:T; parents:string[] }
export interface Artifact<T=unknown> extends ArtifactInput<T> { id:string; createdAt:string; revision:number }
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validId=(id:string)=>typeof id==='string'&&/^[a-f0-9]{64}$/.test(id);

/** Domain-neutral, single-writer artifact store. Each run owns a directory.
 * Readers receive copies; new findings append versions rather than mutate inputs.
 * Hashes verify persisted content and parent IDs provide explicit provenance.
 */
export class RunContext {
  private artifacts=new Map<string,Artifact>();
  constructor(private readonly directory:string){
    mkdirSync(directory,{recursive:true});
    const files=readdirSync(directory).filter(name=>/^[a-f0-9]{64}\.json$/.test(name));
    if(files.length>10000)throw new Error('Run context artifact limit exceeded');
    for(const name of files){
      const raw=readFileSync(join(directory,name),'utf8');if(Buffer.byteLength(raw)>4*1024*1024)throw new Error('Run context artifact limit exceeded');
      const artifact=JSON.parse(raw) as Artifact;const {id,...body}=artifact;
      if(!validId(id)||`${id}.json`!==name||digest(body)!==id)throw new Error('Run context integrity check failed');
      this.artifacts.set(id,artifact);
    }
    for(const a of this.artifacts.values())if(!Array.isArray(a.parents)||a.parents.some(id=>!this.artifacts.has(id)))throw new Error('Run context parent integrity check failed');
  }
  add<T>(input:ArtifactInput<T>):Artifact<T>{
    for(const value of [input.type,input.producer,input.key])if(typeof value!=='string'||!value.trim()||value.length>500)throw new Error('Invalid artifact metadata');
    if(!Array.isArray(input.parents)||input.parents.length>1000||input.parents.some(id=>!this.artifacts.has(id)))throw new Error('Unknown artifact parent');
    if(this.artifacts.size>=10000)throw new Error('Run context artifact limit exceeded');
    const body=JSON.parse(JSON.stringify({type:input.type,producer:input.producer,key:input.key,data:input.data,parents:[...new Set(input.parents)],createdAt:new Date().toISOString(),revision:this.artifacts.size+1}));
    const id=digest(body);const artifact={id,...body} as Artifact<T>;const raw=JSON.stringify(artifact);
    if(Buffer.byteLength(raw)>4*1024*1024)throw new Error('Run context artifact limit exceeded');
    const temporary=join(this.directory,`.pending-${randomUUID()}`);
    writeFileSync(temporary,raw,{flag:'wx',flush:true});
    try{linkSync(temporary,join(this.directory,`${id}.json`));}
    finally{try{unlinkSync(temporary);}catch{/* An abandoned temporary file is ignored on reload. */}}
    this.artifacts.set(id,artifact);return structuredClone(artifact);
  }
  get(id:string):Artifact|undefined{if(!validId(id))throw new Error('Invalid artifact identifier');const item=this.artifacts.get(id);return item?structuredClone(item):undefined;}
  list(type?:string,key?:string):Artifact[]{return [...this.artifacts.values()].filter(a=>(!type||a.type===type)&&(!key||a.key===key)).sort((a,b)=>a.revision-b.revision).map(a=>structuredClone(a));}
  latest(type:string,key:string):Artifact|undefined{return this.list(type,key).at(-1);}
}
