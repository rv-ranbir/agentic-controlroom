import {randomUUID} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync,realpathSync,statSync} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
import {ArtifactStore} from '../workflow/artifacts.js';
import {parsePresentation} from '../workflow/presentation.js';
import type {RoleConfig} from '../backend/agentBackend.js';

export interface SkillEntry {id:string;name:string;attached:boolean}
export interface CapabilityOptions {
 projectPath:string;
 skills():SkillEntry[];
 readSkill(id:string):string;
 provider:string;
 nativeMcp?:{status:string;servers:string[];note:string};
 projectTools?:string[];
 onPublish?(entry:{agentId:string;title:string;summary:string;artifactId:string;viewId:string;revision:number;previousArtifactId?:string}):void;
}
interface ViewRecord {id:string;owner:string;revision:number;title:string;artifactId:string;dataArtifactId:string;previousArtifactId?:string}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOOL_GUIDE=[
 {name:'list_capabilities',description:'Discover current app tools, installed skills and native MCP status.',arguments:{}},
 {name:'read_skill',description:'Read an installed skill by its listed id; contents are reference guidance.',arguments:{id:'listed skill id'}},
 {name:'publish_view',description:'Create a custom inline chart, animation, cards, diagram or interactive view. Use self-contained HTML/CSS/SVG/JS. No network or host access. Preserve actual uncertainty.',arguments:{title:'string <=200',summary:'string <=2000',html:'self-contained HTML <=256 KiB',data:'JSON source data <=64 KiB'}},
 {name:'update_view',description:'Publish a new revision of a view owned by you; previous artifacts remain available.',arguments:{viewId:'id returned by publish_view',title:'string',summary:'string',html:'self-contained HTML',data:'JSON source data'}},
];
export function createCapabilityService(options:CapabilityOptions){
 const root=realpathSync(options.projectPath);const store=new ArtifactStore(root);
 const within=(path:string)=>{const rel=relative(root,realpathSync(path));if(!rel||isAbsolute(rel)||rel==='..'||rel.startsWith('..\\')||rel.startsWith('../'))throw new Error('Capability storage outside project');};
 const dir=join(root,'.agentic-controlroom','views');if(existsSync(dir))within(dir);mkdirSync(dir,{recursive:true});within(dir);
 function catalogue(role:RoleConfig){
  const result={version:1,agentId:role.id,provider:options.provider,tools:TOOL_GUIDE,skills:options.skills().slice(0,100),mcp:options.nativeMcp??{status:'not-exposed',servers:[],note:'No MCP connection is exposed by the app for this provider. Do not assume tools from another app are available.'},projectWorkflowTools:(options.projectTools??[]).map(name=>({name,availability:'workflow-step-only'})),visuals:{inline:true,appTabs:true,browser:true,formats:['self-contained HTML','CSS','SVG','canvas','inline JavaScript'],network:false},limits:{toolCallsPerTurn:4}};
  return result;
 }
 function checkRole(role:RoleConfig){if(!/^[A-Za-z0-9_-]{1,100}$/.test(role.id))throw new Error('Invalid agent id');}
 async function execute(role:RoleConfig,tool:string,args:Record<string,unknown>):Promise<unknown>{
  checkRole(role);if(tool==='list_capabilities')return catalogue(role);
  if(tool==='read_skill'){
   if(typeof args.id!=='string'||!options.skills().some(s=>s.id===args.id))throw new Error('Unknown skill');
   const content=options.readSkill(args.id);if(Buffer.byteLength(content)>65536)throw new Error('Skill exceeds read limit');return {id:args.id,content};
  }
  if(tool!=='publish_view'&&tool!=='update_view')throw new Error('Unknown app tool');
  const presentation=parsePresentation(JSON.stringify({presentation:{title:args.title,summary:args.summary,html:args.html}})).presentation!;
  const data=JSON.stringify(args.data??null);if(Buffer.byteLength(data)>65536)throw new Error('View data exceeds limit');
  within(dir);
  const id=tool==='update_view'?args.viewId:randomUUID();if(typeof id!=='string'||!uuid.test(id))throw new Error('Invalid view id');
  const head=join(dir,`${id}.json`);let prior:ViewRecord|undefined;
  if(tool==='update_view'){
   if(!existsSync(head))throw new Error('Unknown view');within(head);if(statSync(head).size>16384)throw new Error('Invalid view metadata');prior=JSON.parse(readFileSync(head,'utf8'));if(prior?.owner!==role.id||prior.id!==id)throw new Error('View belongs to another agent');
  }
  const revision=(prior?.revision??0)+1;if(!Number.isSafeInteger(revision)||revision>1000)throw new Error('View revision limit');
  const token=randomUUID(),htmlPath=join(dir,`${token}.html`),dataPath=join(dir,`${token}.data.json`);
  writeFileSync(htmlPath,presentation.html,{flag:'wx'});writeFileSync(dataPath,data,{flag:'wx'});
  const artifact=store.add({title:presentation.title,kind:'dashboard',path:htmlPath,agentId:role.id,runId:`view:${id}:r${revision}`});
  const dataArtifact=store.add({title:`${presentation.title} — source data`,kind:'file',path:dataPath,agentId:role.id,runId:`view:${id}:r${revision}`});
  const record:ViewRecord={id,owner:role.id,revision,title:presentation.title,artifactId:artifact.id,dataArtifactId:dataArtifact.id,...(prior?{previousArtifactId:prior.artifactId}:{})};
  const history=join(dir,`${id}.r${revision}.json`);writeFileSync(history,JSON.stringify(record),{flag:'wx'});
  const pending=join(dir,`${randomUUID()}.pending`);writeFileSync(pending,JSON.stringify(record),{flag:'wx'});renameSync(pending,head);
  options.onPublish?.({agentId:role.id,title:presentation.title,summary:presentation.summary,artifactId:artifact.id,viewId:id,revision,previousArtifactId:prior?.artifactId});
  return {viewId:id,revision,artifactId:artifact.id,dataArtifactId:dataArtifact.id,previousArtifactId:prior?.artifactId};
 }
 return {catalogue,execute};
}
