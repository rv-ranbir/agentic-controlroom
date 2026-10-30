import type {SubagentRecord} from './subagentPresence.js';

export function campusDelegates(
 records:SubagentRecord[],projectId:string,visibleParentIds:ReadonlySet<string>,page:number,pageSize=12,
):{items:SubagentRecord[];total:number;page:number;pages:number} {
 const size=Number.isInteger(pageSize)&&pageSize>=1&&pageSize<=12?pageSize:12;
 const seen=new Set<string>();
 const filtered:SubagentRecord[]=[];
 for(const record of records){
  if(record.projectId!==projectId||!visibleParentIds.has(record.parentAgentId)||
   (record.status!=='running'&&record.status!=='unobserved')||seen.has(record.id))continue;
  seen.add(record.id);
  filtered.push(record);
 }
 const pages=Math.max(1,Math.ceil(filtered.length/size));
 const requested=Number.isFinite(page)?Math.floor(page):1;
 const current=Math.min(pages,Math.max(1,requested));
 const start=(current-1)*size;
 return {items:filtered.slice(start,start+size),total:filtered.length,page:current,pages};
}
