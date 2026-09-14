import type { RunScope } from '../harness/types.js';
import { createRunScope } from '../harness/runScope.js';
import { randomUUID } from 'node:crypto';
import { wrapPresentation, inlinePresentation } from '../workflow/presentation.js';
import { BrowserWindow,ipcMain,shell } from 'electron';
import { existsSync,mkdirSync,readFileSync,writeFileSync,renameSync,statSync,realpathSync } from 'node:fs';
import { join,resolve,relative,isAbsolute,dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AgentBackend,RoleConfig } from '../backend/agentBackend.js';
import type { ChatLog } from '../chatroom/log.js';
import { executeWorkflow,listRuns,recoverInterruptedRuns,type WorkflowDefinition } from '../workflow/runtime.js';
import { readProjectIntegration, loadProjectIntegration } from '../workflow/projectIntegration.js';
import { ArtifactStore } from '../workflow/artifacts.js';
import { RunContext } from '../workflow/context.js';
import { readProjectDashboard } from '../projectDashboard.js';
import { createDashboardWindowManager } from './projectDashboardWindow.js';
export interface RuntimeAgent {id:string;name:string;roleId?:string;systemPrompt?:string;provider?:"codex"|"cursor"|"claude"|"openrouter"|"openai"|"anthropic"|"gemini"|"ollama";model?:string;keyEnv?:string}
export interface RuntimeProject {id:string;name:string;path:string;agents?:RuntimeAgent[]}
interface Options {tokenSaving?():boolean;environment?(p:RuntimeProject):Record<string,string|undefined>;projects():RuntimeProject[];role(p:RuntimeProject,a:RuntimeAgent):RoleConfig;backend(p:RuntimeProject,a:RuntimeAgent,scope?:RunScope):AgentBackend;running:Set<string>;log(p:RuntimeProject):ChatLog;event(id:string,event:Record<string,unknown>):void}
export function createWorkflowHost(o:Options){
 const controllers=new Map<string,AbortController>();
 const windows=createDashboardWindowManager(options=>new BrowserWindow(options));
 const directory=(p:RuntimeProject)=>{new ArtifactStore(p.path);const path=join(p.path,'.agentic-controlroom','runs');if(existsSync(path)){const rel=relative(realpathSync(p.path),realpathSync(path));if(isAbsolute(rel)||rel==='..'||rel.startsWith('../')||rel.startsWith('..\\'))throw new Error('Run storage outside project');}return path;};
 const project=(id:string)=>{const p=o.projects().find(p=>p.id===id);if(!p)throw new Error('Unknown project');return p;};
 const file=(p:RuntimeProject)=>join(p.path,'.agentic-controlroom','workflow.json');
 function validate(p:RuntimeProject,d:WorkflowDefinition,depth=0,allowTools=false){
  if(!d||typeof d.id!=='string'||!d.id.trim()||typeof d.name!=='string'||!d.name.trim()||!Array.isArray(d.steps)||!d.steps.length||d.steps.length>100||depth>3)throw new Error('Choose a workflow name and at least one agent step.');
  const ids=new Set<string>();for(const s of d.steps){if(!s||typeof s.id!=='string'||!s.id.trim()||ids.has(s.id))throw new Error('Step IDs must be unique');ids.add(s.id);if([s.agentId,s.workflow,s.tool].filter(a=>a!==undefined).length!==1 || (s.tool!==undefined&&!allowTools))throw new Error('Choose an agent or a child workflow');if(s.workflow)validate(p,s.workflow,depth+1,allowTools);else if(s.tool===undefined&&!p.agents?.some(a=>a.id===s.agentId))throw new Error('Workflow references a missing agent');}
 }
 function get(p:RuntimeProject):(WorkflowDefinition & {projectManaged?:boolean})|null{const template=readProjectIntegration(p.path);if(template){validate(p,template.workflow,0,true);return {...template.workflow,projectManaged:true};}if(!existsSync(file(p)))return null;const raw=readFileSync(file(p),'utf8');if(raw.length>65536)throw new Error('Workflow is too large');const d=JSON.parse(raw);validate(p,d);return d;}
 async function start(p:RuntimeProject,input:string,fixture=false){
  if(fixture&&typeof input==='string'&&!input.trim())input='Run the project fixture';
  if(typeof input!=='string'||!input.trim()||input.length>20000)throw new Error('Enter a task of at most 20,000 characters');
  if(!p.agents?.length)throw new Error('Add agents to this project before running a task.');
  if([...o.running].some(k=>k===p.id||k.startsWith(p.id+':')))throw new Error('This project has agents already working.');
  const definition=get(p)??{id:'team',name:'Project team',steps:p.agents.map((a,i)=>({id:`step-${i+1}`,agentId:a.id}))};validate(p,definition,0,!!readProjectIntegration(p.path));
  const roles=p.agents.map(a=>o.role(p,a)); new ArtifactStore(p.path);
  const controller=new AbortController();controllers.set(p.id,controller);o.running.add(p.id);o.event(p.id,{kind:'running',running:true});
  const log=o.log(p);log.post('user','user',`${fixture?'[FIXTURE] ':''}${input}`);
  void (async()=>{const integration=await loadProjectIntegration(p.path,{fixture,environment:Object.fromEntries(Object.entries(o.environment?.(p)??process.env).filter((entry):entry is [string,string]=>typeof entry[1]==='string'))});return {integration,run:await executeWorkflow({scope:createRunScope(p.id,'orchestrator'),tokenSaving:o.tokenSaving?.()===true,publishPresentation:artifact=>new ArtifactStore(p.path).add({...artifact,kind:'dashboard'}).id,tools:integration?.tools,prepareAgent:integration?.prepareAgent,afterAgent:integration?.afterAgent,directory:directory(p),definition,agents:roles,log,input:fixture?`SYNTHETIC FIXTURE: ${input}`:input,signal:controller.signal,backendFor:(role,scope)=>fixture?(integration?.fixtureBackendFor?.(role)??{
   start:async()=>({sessionId:'',reply:`SYNTHETIC FIXTURE — ${role.name} completed its assigned step. No external model or tool was called.`}),resume:async()=>({reply:'SYNTHETIC FIXTURE'})
  }):o.backend(p,p.agents!.find(a=>a.id===role.id)!,scope)} )};})().then(({run,integration})=>{
   const context=new RunContext(join(directory(p),run.id,'context'));const output=join('.agentic-controlroom','runs',run.id,'report.html');
   const report=JSON.stringify({fixture,run,artifacts:context.list()},null,2).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
   writeFileSync(join(p.path,output),'<meta charset="utf-8"><title>Workflow report</title><style>body{font:15px system-ui;margin:32px}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>Workflow report</h1><pre>'+report+'</pre>');
   new ArtifactStore(p.path).add({title:`${fixture?'Fixture: ':''}${run.name}`,kind:'report',path:output,runId:run.id});
   for(const artifact of integration?.artifacts?.(context)??[])new ArtifactStore(p.path).add({...artifact,runId:run.id});
   log.post('orchestrator','Workflow',`${run.name}: ${run.status}${run.error?` — ${run.error}`:''}. Report available in Artifacts.`);o.event(p.id,{kind:'done',result:run.status});
  }).catch(error=>{log.post('orchestrator','Workflow',`Error: ${String(error)}`);o.event(p.id,{kind:'done',result:'error'});}).finally(()=>{log.status('');controllers.delete(p.id);o.running.delete(p.id);o.event(p.id,{kind:'running',running:false});});
 }
 function register(){
  for(const p of o.projects()){try{if(existsSync(directory(p)))recoverInterruptedRuns(directory(p));}catch(error){console.error('Run recovery failed for project',p.id,String(error));}}
  ipcMain.handle('workflow:get',(_e,id:string)=>get(project(id)));
  ipcMain.handle('workflow:save',(_e,id:string,d:WorkflowDefinition)=>{const p=project(id);if(readProjectIntegration(p.path))throw new Error('This workflow is defined by the project template');if(controllers.has(id))throw new Error('Wait for the run to finish');if(JSON.stringify(d).length>65536)throw new Error('Workflow is too large');validate(p,d);mkdirSync(join(p.path,'.agentic-controlroom'),{recursive:true});writeFileSync(file(p)+'.pending',JSON.stringify(d,null,2));renameSync(file(p)+'.pending',file(p));});
  ipcMain.handle('workflow:start',(_e,id:string,input:string,fixture:boolean)=>start(project(id),input,fixture===true));
  ipcMain.handle('workflow:cancel',(_e,id:string)=>{project(id);controllers.get(id)?.abort();});
  ipcMain.handle('workflow:runs',(_e,id:string)=>listRuns(directory(project(id))));
  ipcMain.handle('artifacts:list',(_e,id:string)=>{const p=project(id),store=new ArtifactStore(p.path);const items=store.list();const dashboard=readProjectDashboard(p.path);if(dashboard&&!items.some(a=>a.url===dashboard.url)){store.add({title:dashboard.label,kind:'dashboard',url:dashboard.url,runId:'project'});return store.list();}return items;});
  ipcMain.handle('artifacts:preview',(_e,id:string,artifactId:string)=>{const p=project(id),a=new ArtifactStore(p.path).resolve(artifactId);if(!a?.path||a.kind!=='dashboard'||! /\.html?$/i.test(a.path))throw new Error('Inline preview is available for local visual artifacts');const path=resolve(p.path,a.path);if(statSync(path).size>1024*1024)throw new Error('Inline preview exceeds 1 MiB');const raw=readFileSync(path,'utf8');if(Buffer.byteLength(raw)>1024*1024)throw new Error('Inline preview exceeds 1 MiB');return {title:a.title,html:inlinePresentation(raw,a.title)};});
  ipcMain.handle('artifacts:open',async(_e,id:string,artifactId:string,mode:string)=>{
   const p=project(id),a=new ArtifactStore(p.path).resolve(artifactId);if(!a)throw new Error('Artifact no longer exists');if(mode!=='app'&&mode!=='browser')throw new Error('Unknown preview mode');
   if(a.url){if(mode==='browser')await shell.openExternal(a.url);else await windows.open(a.id,{label:a.title,url:a.url});return;}
   const path=resolve(p.path,a.path!);if(!/\.(json|txt|md|csv|html?)$/i.test(path))throw new Error('This artifact type does not yet support preview');
   if(mode==='browser'){
    if(a.kind==='dashboard'&&/\.html?$/i.test(path)){
     if(statSync(path).size>4*1024*1024)throw new Error('Preview exceeds 4 MiB');
     const wrapped=wrapPresentation(readFileSync(path,'utf8'),a.title);const exported=join(dirname(path),`${randomUUID()}.preview.html`);writeFileSync(exported,wrapped,{flag:'wx'});await shell.openExternal(pathToFileURL(exported).href);
    }else await shell.openExternal(pathToFileURL(path).href);return;}
   if(statSync(path).size>4*1024*1024)throw new Error('Preview exceeds 4 MiB');const raw=readFileSync(path);if(raw.length>4*1024*1024)throw new Error('Preview exceeds 4 MiB');
   const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
   const interactive=a.kind==='dashboard'&&/\.html?$/i.test(path);
   const preview=new BrowserWindow({title:a.title,width:1100,height:800,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
   preview.webContents.setWindowOpenHandler(()=>({action:'deny'}));preview.webContents.on('will-navigate',e=>e.preventDefault());
   preview.webContents.on('will-frame-navigate',e=>{if(!e.url.startsWith('about:srcdoc')&&!e.url.startsWith('data:text/html'))e.preventDefault();});
   if(interactive){await preview.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(wrapPresentation(raw.toString('utf8'),a.title)));return;}
   await preview.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${escape(a.title)}</title><style>body{background:#1b1814;color:#f2eadb;font:15px system-ui;padding:24px}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>${escape(a.title)}</h1>${/\.html?$/i.test(path)?raw.toString('utf8'):'<pre>'+escape(raw.toString('utf8'))+'</pre>'}`));
  });
 }
 return {start,register};
}
