import {providerUsage} from '../harness/usage.js';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import type { AgentBackend, RoleConfig, OnLine, OnProcess, StartResult } from './agentBackend.js';
export function resolveCodexBinary(env: NodeJS.ProcessEnv = process.env): string {
 if (env.CODEX_BIN) return env.CODEX_BIN;
 if (process.platform !== 'win32') return 'codex';
 for (const dir of (env.PATH || env.Path || '').split(delimiter)) { const p = join(dir,'codex.exe'); if (existsSync(p)) return p; }
 const root=join(env.LOCALAPPDATA || '', 'OpenAI','Codex','bin');
 try { for(const dir of readdirSync(root).sort().reverse()){const p=join(root,dir,'codex.exe');if(existsSync(p))return p;} }catch{}
 return 'codex.exe';
}
export class CodexOutput {
 sessionId='';reply='';completed=false;failure='';usage:StartResult['usage'];
 consume(line:string){let e:any;try{e=JSON.parse(line);}catch{return;}if(!e)return;
  if(e.type==='thread.started'&&typeof e.thread_id==='string')this.sessionId=e.thread_id;
  if(e.type==='item.completed'&&e.item?.type==='agent_message'&&typeof e.item.text==='string')this.reply=e.item.text;
  if(e.type==='turn.failed')this.failure=typeof e.error?.message==='string'?e.error.message:'Codex turn failed.';
  if(e.type==='turn.completed'){this.completed=true;this.usage=providerUsage('codex',e);}
 }
 result():StartResult{if(this.failure)throw Error(this.failure);if(!this.completed||!this.reply.trim())throw Error('Codex ended without a completed response. Check login, usage limits and app diagnostics.');return{sessionId:this.sessionId,reply:this.reply,usage:this.usage};}
}
export function codexArgs(model?:string,extra:string[]=[],sessionId?:string):string[]{
 let sandbox='workspace-write';const config:string[]=[];
 for(let i=0;i<extra.length;i++){
  if(extra[i]==='--sandbox'&&['read-only','workspace-write'].includes(extra[i+1])){sandbox=extra[++i];continue;}
  if(['-c','--config'].includes(extra[i])&&/^model_reasoning_effort=(minimal|low|medium|high|xhigh)$/.test(extra[i+1]||'')){config.push('-c',extra[++i]);continue;}
  throw Error('Codex flags support --sandbox read-only/workspace-write and -c model_reasoning_effort=low (or another supported effort).');
 }
 if(sessionId&&!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,127}$/.test(sessionId))throw Error('Invalid Codex session ID.');
 const args=['-a','never','exec','--json','--skip-git-repo-check','-c','model_provider="openai"','-c',`sandbox_mode="${sandbox}"`,...config];
 if(model)args.push('--model',model);if(sessionId)args.push('resume',sessionId);args.push('-');return args;
}
export class CodexCliBackend implements AgentBackend {
 private bin:string;
 constructor(private opts:{bin?:string;model?:string;cwd?:string;extraArgs?:string[];env?:Record<string,string>;spawnProcess?:typeof spawn}={}){
  this.bin=opts.bin||resolveCodexBinary();if(/\.(cmd|bat|ps1)$/i.test(this.bin))throw Error('Set CODEX_BIN to the native codex.exe executable; shell launchers are not supported.');
 }
 private run(args:string[],prompt:string,onLine?:OnLine,onProcess?:OnProcess):Promise<string>{
  const env={...process.env,...this.opts.env};delete env.OPENAI_API_KEY;delete env.CODEX_API_KEY;
  return new Promise((resolve,reject)=>{
   const child=(this.opts.spawnProcess||spawn)(this.bin,args,{cwd:this.opts.cwd,env,shell:false,windowsHide:true,detached:process.platform!=='win32'});onProcess?.(child);
   let output='',pending='',stderr='',failure:Error|undefined;
   child.stdout!.on('data',chunk=>{const text=String(chunk);if(output.length+text.length>16*1024*1024){failure=Error('Codex output exceeded 16 MiB.');child.kill();return;}output+=text;pending+=text;const lines=pending.split('\n');pending=lines.pop()!;for(const line of lines)if(line.trim())onLine?.(line);});
   child.stderr!.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-4000);});child.stdin!.on('error',error=>{failure=error;});
   child.on('error',error=>reject(Error(`Cannot launch Codex: ${error.message}. Install Codex CLI or set CODEX_BIN to its native executable.`)));
   child.on('close',code=>{if(pending.trim())onLine?.(pending);if(failure)reject(failure);else if(code!==0)reject(Error(`Codex exited (${code}): ${stderr||output.slice(-1000)}`));else resolve(output+(args[0]==='login'?stderr:''));});child.stdin!.end(prompt);
  });
 }
 private async execute(prompt:string,sessionId?:string,onLine?:OnLine,onProcess?:OnProcess):Promise<StartResult>{
  const args=codexArgs(this.opts.model,this.opts.extraArgs,sessionId);
  const status=await this.run(['login','status'],'',undefined,onProcess);
  if(!/logged in using chatgpt/i.test(status))throw Error('Codex needs ChatGPT login. Run codex login and choose ChatGPT. OpenAI API is a separate provider.');
  const result=new CodexOutput();try{await this.run(args,prompt,line=>{result.consume(line);onLine?.(line);},onProcess);return result.result();}catch(error){throw Object.assign(error instanceof Error?error:Error('Codex failed'),{usage:result.usage});}
 }
 start(role:RoleConfig,prompt:string,onLine?:OnLine,onProcess?:OnProcess){return this.execute(`${role.systemPrompt}\n\n${prompt}`,undefined,onLine,onProcess);}
 resume(sessionId:string,prompt:string,role:RoleConfig,onLine?:OnLine,onProcess?:OnProcess){return this.execute(sessionId?prompt:`${role.systemPrompt}\n\n${prompt}`,sessionId||undefined,onLine,onProcess);}
}
