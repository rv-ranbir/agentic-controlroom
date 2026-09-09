import { randomUUID } from 'node:crypto';
import { mkdirSync,readdirSync,readFileSync,writeFileSync,unlinkSync,linkSync,lstatSync,realpathSync,existsSync } from 'node:fs';
import { join,resolve,relative,isAbsolute } from 'node:path';
export type ArtifactKind='report'|'table'|'image'|'file'|'dashboard';
export interface ProjectArtifact {id:string;title:string;kind:ArtifactKind;path?:string;url?:string;runId:string;agentId?:string;createdAt:string}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export class ArtifactStore {
 private root:string; private directory:string;
 constructor(projectPath:string){
  this.root=realpathSync(projectPath);
  const base=join(this.root,'.agentic-controlroom');
  for(const dir of [base,join(base,'artifacts')]){
   if(existsSync(dir)&&!this.inside(realpathSync(dir)))throw new Error('Artifact storage outside project');
   mkdirSync(dir,{recursive:true});
  }
  this.directory=join(base,'artifacts');
 }
 private inside(path:string){const rel=relative(this.root,path);return rel!==''&&!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..\\')&&!rel.startsWith('../');}
 private checkStorage(){if(!this.inside(realpathSync(this.directory)))throw new Error('Artifact storage outside project');}
 private files(){this.checkStorage();const files=readdirSync(this.directory).filter(f=>uuid.test(f.slice(0,-5))&&f.endsWith('.json'));if(files.length>10000)throw new Error('Artifact limit exceeded');return files;}
 private validate(input:Omit<ProjectArtifact,'id'|'createdAt'>){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid artifact metadata');
  const allowed=['title','kind','path','url','runId','agentId'];
  if(Object.keys(input).some(k=>!allowed.includes(k))||!['report','table','image','file','dashboard'].includes(input.kind))throw new Error('Invalid artifact metadata');
  for(const k of ['title','runId','agentId'] as const){const v=input[k];if(k==='agentId'&&v===undefined)continue;if(typeof v!=='string'||!v.trim()||v.length>500)throw new Error('Invalid artifact metadata');}
  if((input.path===undefined)===(input.url===undefined))throw new Error('Invalid artifact destination');
  if(input.path!==undefined){
   if(typeof input.path!=='string'||!input.path||input.path.length>4096)throw new Error('Invalid artifact path');
   let path:string;try{path=realpathSync(resolve(this.root,input.path));}catch{throw new Error('Artifact file does not exist');}
   if(!this.inside(path)||!lstatSync(path).isFile())throw new Error('Artifact file path outside project or not a file');
  }else{
   const value=input.url;
   if(typeof value!=='string'||value.length>4096||!/^http:\/\/127\.0\.0\.1:[0-9]+(?:[/?#]|$)/.test(value)||value.includes('\\'))throw new Error('Invalid artifact URL');
   let url:URL;try{url=new URL(value);}catch{throw new Error('Invalid artifact URL');}
   if(url.hostname!=='127.0.0.1'||url.username||url.password||!url.port||+url.port<1024||+url.port>65535)throw new Error('Invalid artifact URL');
  }
 }
 add(input:Omit<ProjectArtifact,'id'|'createdAt'>):ProjectArtifact{
  this.validate(input);if(this.files().length>=10000)throw new Error('Artifact limit exceeded');
  const artifact={...input,id:randomUUID(),createdAt:new Date().toISOString()};const raw=JSON.stringify(artifact);
  if(Buffer.byteLength(raw)>16384)throw new Error('Artifact metadata limit exceeded');
  const temp=join(this.directory,`.pending-${randomUUID()}`);writeFileSync(temp,raw,{flag:'wx',flush:true});
  try{linkSync(temp,join(this.directory,`${artifact.id}.json`));}finally{unlinkSync(temp);}
  return structuredClone(artifact);
 }
 resolve(id:string):ProjectArtifact|undefined{
  if(typeof id!=='string'||!uuid.test(id))throw new Error('Invalid artifact identifier');this.checkStorage();
  const file=join(this.directory,`${id}.json`);if(!existsSync(file))return undefined;
  if(lstatSync(file).isSymbolicLink()||lstatSync(file).size>16384)throw new Error('Artifact metadata limit or redirected file');
  let a:ProjectArtifact;try{a=JSON.parse(readFileSync(file,'utf8'));}catch{throw new Error('Invalid artifact metadata');}
  if(!a||a.id!==id||typeof a.createdAt!=='string'||!Number.isFinite(Date.parse(a.createdAt)))throw new Error('Invalid artifact metadata');
  const {id:storedId,createdAt,...input}=a;this.validate(input);return structuredClone(a);
 }
 list():ProjectArtifact[]{return this.files().map(f=>this.resolve(f.slice(0,-5))!).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
}
