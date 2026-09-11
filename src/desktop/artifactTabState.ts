export interface SavedArtifactTab {id:string;projectId:string;artifactId:string;title?:string}
export interface SavedArtifactTabs {version:1;tabs:SavedArtifactTab[];selectedTabId:string|null;minimized:boolean}
export function parseArtifactTabs(raw:string|null):SavedArtifactTabs {
 const empty:SavedArtifactTabs={version:1,tabs:[],selectedTabId:null,minimized:false};
 if(!raw||raw.length>131072)return empty;
 try{
  const value=JSON.parse(raw);if(value?.version!==1||!Array.isArray(value.tabs))return empty;
  const seen=new Set<string>();
  for(const item of value.tabs.slice(0,100)){
   if(typeof item?.projectId!=='string'||typeof item?.artifactId!=='string'||!item.projectId||!item.artifactId||item.projectId.length>300||item.artifactId.length>300)continue;
   const id=item.projectId+':'+item.artifactId;if(seen.has(id))continue;seen.add(id);
   empty.tabs.push({id,projectId:item.projectId,artifactId:item.artifactId,...(typeof item.title==='string'?{title:item.title.slice(0,160)}:{})});
   if(empty.tabs.length===20)break;
  }
  empty.selectedTabId=empty.tabs.some(t=>t.id===value.selectedTabId)?value.selectedTabId:empty.tabs[0]?.id??null;
  empty.minimized=value.minimized===true;return empty;
 }catch{return empty;}
}
export function serializeArtifactTabs(tabs:SavedArtifactTab[],selectedTabId:string|null,minimized:boolean):string {
 const references=tabs.map(({projectId,artifactId,title})=>({projectId,artifactId,title}));
 return JSON.stringify(parseArtifactTabs(JSON.stringify({version:1,tabs:references,selectedTabId,minimized})));
}
