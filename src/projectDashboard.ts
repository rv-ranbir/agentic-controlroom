import {existsSync,readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
export interface ProjectDashboard {label:string;url:string}
export function readProjectDashboard(projectPath:string):ProjectDashboard|null{
  const file=join(projectPath,'agent-room.project.json');if(!existsSync(file))return null;
  if(statSync(file).size>8192)throw new Error('Project dashboard manifest is too large');
  const manifest=JSON.parse(readFileSync(file,'utf8'));if(!manifest.dashboard)return null;
  const {label,url}=manifest.dashboard;if(typeof label!=='string'||!label.trim()||label.length>50||typeof url!=='string')throw new Error('Invalid project dashboard manifest');
  const target=new URL(url);
  if(target.protocol!=='http:'||target.hostname!=='127.0.0.1'||target.username||target.password||!target.port||Number(target.port)<1024)throw new Error('Project dashboard must use a local HTTP endpoint on 127.0.0.1');
  return {label:label.trim(),url:target.href};
}
