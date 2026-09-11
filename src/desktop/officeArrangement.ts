export const defaultRoomOrder=['meeting','debate','planning'] as const;
export type OfficeRoomKind=typeof defaultRoomOrder[number];
export function roomOrder(value:unknown):OfficeRoomKind[]{return Array.isArray(value)&&value.length===3&&new Set(value).size===3&&value.every(v=>defaultRoomOrder.includes(v))?[...value]:[...defaultRoomOrder];}
export function arrangeDesks(base:Map<string,number>,saved:unknown):Map<string,number>{
 const result=new Map<string,number>(),used=new Set<number>();
 const valid=(n:unknown):n is number=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<10000;
 const entries=typeof saved==='object'&&saved!==null&&!Array.isArray(saved)?saved as Record<string,unknown>:{};
 for(const id of base.keys()){const n=Object.hasOwn(entries,id)?entries[id]:undefined;if(valid(n)&&!used.has(n)){result.set(id,n);used.add(n);}}
 for(const [id,slot] of base){if(result.has(id))continue;let n=slot;if(!valid(n)||used.has(n)){n=0;while(used.has(n))n++;}result.set(id,n);used.add(n);}
 return result;
}
export function swapDesk(slots:Map<string,number>,agentId:string,target:number):Map<string,number>{
 if(!slots.has(agentId)||!Number.isSafeInteger(target)||target<0||target>=10000)throw Error('Invalid desk assignment');
 const next=new Map(slots),old=slots.get(agentId)!;for(const [id,n] of slots)if(id!==agentId&&n===target)next.set(id,old);next.set(agentId,target);return next;
}
