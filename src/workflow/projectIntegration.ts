import { existsSync,readFileSync,realpathSync,statSync } from 'node:fs';
import { join,resolve,relative,isAbsolute,extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AgentBackend,RoleConfig } from '../backend/agentBackend.js';
import type { RunContext } from './context.js';
import type { ArtifactKind } from './artifacts.js';
import type { WorkflowDefinition,WorkflowTool,WorkflowAgentArgs,PreparedAgent } from './runtime.js';
export type IntegrationProvider='claude'|'cursor'|'openrouter'|'openai'|'anthropic'|'gemini'|'ollama';
export interface IntegrationAgent extends RoleConfig {provider?:IntegrationProvider;model?:string;keyEnv?:string;extraArgs?:string[]}
export interface ProjectIntegrationDescriptor {version:1;id:string;name:string;module:string;envKeys:string[];agents:IntegrationAgent[];workflow:WorkflowDefinition}
export interface ProjectIntegration {
 tools:Record<string,WorkflowTool>;
 prepareAgent?:(args:WorkflowAgentArgs)=>Promise<PreparedAgent>|PreparedAgent;
 afterAgent?:(args:WorkflowAgentArgs&{reply:string})=>Promise<unknown>|unknown;
 fixtureBackendFor?:(role:RoleConfig)=>AgentBackend;
 artifacts?:(context:RunContext)=>Array<{title:string;kind:ArtifactKind;path?:string;url?:string;runId:string;agentId?:string}>;
}
const providers=['claude','cursor','openrouter','openai','anthropic','gemini','ollama'];
function within(root:string,path:string){const rel=relative(root,path);return !!rel&&!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('../')&&!rel.startsWith('..\\');}
export function readProjectIntegration(projectPath:string):ProjectIntegrationDescriptor|undefined {
 const root=realpathSync(projectPath),file=join(root,'agent-room.integration.json');if(!existsSync(file))return undefined;
 if(!within(root,realpathSync(file))||statSync(file).size>128*1024)throw new Error('Invalid project integration manifest');
 const v=JSON.parse(readFileSync(file,'utf8')) as ProjectIntegrationDescriptor;
 if(!v||v.version!==1||typeof v.id!=='string'||!v.id.trim()||v.id.length>200||typeof v.name!=='string'||!v.name.trim()||v.name.length>300||typeof v.module!=='string'||!v.module||v.module.length>4096)throw new Error('Invalid project integration metadata');
 const modulePath=resolve(root,v.module);if(!within(root,modulePath)||!['.js','.mjs'].includes(extname(modulePath)))throw new Error('Integration module must be a project-local JavaScript file');
 if(!existsSync(modulePath))throw new Error('Project tools are not built. Run the project build first.');
 if(!within(root,realpathSync(modulePath))||!statSync(modulePath).isFile())throw new Error('Integration module outside project');
 if(!Array.isArray(v.agents)||v.agents.length<1||v.agents.length>100)throw new Error('Invalid project integration team');
 const ids=new Set<string>();for(const a of v.agents){if(!a||typeof a.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(a.id)||ids.has(a.id)||typeof a.name!=='string'||!a.name.trim()||a.name.length>200||typeof a.systemPrompt!=='string'||!a.systemPrompt.trim()||a.systemPrompt.length>16000)throw new Error('Invalid project agent');ids.add(a.id);if(a.provider&&!providers.includes(a.provider))throw new Error('Unknown project agent provider');if(a.model!==undefined&&(typeof a.model!=='string'||!/^[A-Za-z0-9_.:/@+-]{0,200}$/.test(a.model)))throw new Error('Invalid project agent model');if(a.keyEnv!==undefined&&(typeof a.keyEnv!=='string'||!/^[A-Z][A-Z0-9_]{0,199}$/.test(a.keyEnv)))throw new Error('Invalid credential binding');if(a.extraArgs!==undefined&&(!Array.isArray(a.extraArgs)||a.extraArgs.length>20||a.extraArgs.some(arg=>typeof arg!=='string'||arg.length>300||/[;&|<>`$\r\n]/.test(arg))))throw new Error('Invalid project agent arguments');}
 if(!Array.isArray(v.envKeys)||v.envKeys.length>20||v.envKeys.some(key=>typeof key!=='string'||!/^[A-Z][A-Z0-9_]{0,199}$/.test(key)))throw new Error('Invalid project environment bindings');
 if(!v.workflow||typeof v.workflow.id!=='string'||typeof v.workflow.name!=='string'||!Array.isArray(v.workflow.steps)||!v.workflow.steps.length||v.workflow.steps.length>100)throw new Error('Invalid project workflow');
 return structuredClone({...v,module:realpathSync(modulePath)});
}
/** Project modules are trusted local executable code, loaded only when the operator runs its workflow. */
export async function loadProjectIntegration(projectPath:string,options:{fixture:boolean;environment:Record<string,string>}):Promise<ProjectIntegration|undefined>{
 const descriptor=readProjectIntegration(projectPath);if(!descriptor)return undefined;
 const mod=await import(pathToFileURL(descriptor.module).href);if(typeof mod.createIntegration!=='function')throw new Error('Project module must export createIntegration');
 const environment=Object.fromEntries(descriptor.envKeys.filter(key=>typeof options.environment[key]==='string').map(key=>[key,options.environment[key]]));
 const integration=await mod.createIntegration({projectPath:realpathSync(projectPath),fixture:options.fixture,environment}) as ProjectIntegration;
 if(!integration||!integration.tools||typeof integration.tools!=='object'||Array.isArray(integration.tools)||Object.keys(integration.tools).length>100||Object.values(integration.tools).some(tool=>typeof tool!=='function'))throw new Error('Invalid project tool registry');
 for(const key of ['prepareAgent','afterAgent','fixtureBackendFor','artifacts'] as const)if(integration[key]!==undefined&&typeof integration[key]!=='function')throw new Error('Invalid project workflow hook');
 return integration;
}
