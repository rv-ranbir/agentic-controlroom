import { roomOrder, swapDesk, type OfficeRoomKind } from "../../officeArrangement";
import {useEffect,useState} from 'react';
export interface OfficePreferences {studio:string;meeting:string;debate:string;planning:string;labels:boolean;roomOrder:OfficeRoomKind[];desks:Record<string,number>}
export const defaults:OfficePreferences={studio:'Work studio',meeting:'Meeting',debate:'Boardroom',planning:'Strategy',labels:true,roomOrder:['meeting','debate','planning'],desks:{}};
export function readOfficePreferences(projectId:string):OfficePreferences {
 try{const value=JSON.parse(localStorage.getItem('office-preferences:v1:'+projectId)||'{}');const result={...defaults};for(const key of ['studio','meeting','debate','planning'] as const)if(typeof value?.[key]==='string'&&value[key].trim())result[key]=value[key].trim().slice(0,48);if(typeof value?.labels==='boolean')result.labels=value.labels;result.roomOrder=roomOrder(value?.roomOrder);if(value?.desks&&typeof value.desks==='object'&&!Array.isArray(value.desks))result.desks=value.desks;return result;}catch{return {...defaults};}
}
export function OfficeSettings({projectId,preferences,agents,homes,layoutLocked,onSave,onClose}:{projectId:string;preferences:OfficePreferences;agents:Array<{id:string;name:string}>;homes:Map<string,number>;layoutLocked:boolean;onSave:(p:OfficePreferences)=>void;onClose:()=>void}){
 const [draft,setDraft]=useState(preferences),[desks,setDesks]=useState(()=>new Map(homes)),[error,setError]=useState('');
 useEffect(()=>{const previous=document.activeElement as HTMLElement | null;return()=>{const trigger=document.getElementById("office-settings-trigger");(trigger ?? previous)?.focus();};},[]);
 function save(){const layoutChanged=JSON.stringify([...desks])!==JSON.stringify([...homes])||JSON.stringify(draft.roomOrder)!==JSON.stringify(preferences.roomOrder);if(layoutLocked&&layoutChanged){setError('Wait for active sessions to finish before rearranging the office.');return;}const value={...draft,desks:Object.fromEntries(desks)};for(const key of ['studio','meeting','debate','planning'] as const)value[key]=value[key].trim()||defaults[key];try{localStorage.setItem('office-preferences:v1:'+projectId,JSON.stringify(value));onSave(value);onClose();}catch{setError('Could not save office settings on this device.');}}
 return <div className="osSettingsBackdrop"><section role="dialog" aria-modal="true" aria-label="Office settings" className="osSettings" onKeyDown={e=>{if(e.key==='Escape')onClose();if(e.key==='Tab'){const items=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('input:not(:disabled),select:not(:disabled),button:not(:disabled)'));const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}>
 <h2>Make this office yours</h2><p>Saved for this project on this device.</p>
 {(['studio','meeting','debate','planning'] as const).map((key,i)=><label key={key}>{({studio:'Studio name',meeting:'Meeting room name',debate:'Boardroom name',planning:'Strategy room name'})[key]}<input autoFocus={i===0} maxLength={48} value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>)}
 <label><input type="checkbox" checked={draft.labels} onChange={e=>setDraft({...draft,labels:e.target.checked})}/> Always show agent labels</label>
 <fieldset disabled={layoutLocked} className="osArrangement"><legend>Office layout</legend>
 {layoutLocked&&<p>Layout changes are paused while sessions are active.</p>}
 <p>Room order, from the top of the corridor</p>
 {draft.roomOrder.map((kind,index)=><label key={kind}>{draft[kind]}<select aria-label={`Position of ${kind}`} value={index} onChange={e=>{const next=[...draft.roomOrder],target=Number(e.target.value);[next[index],next[target]]=[next[target],next[index]];setDraft({...draft,roomOrder:next});}}>{[0,1,2].map(n=><option value={n} key={n}>{n+1}</option>)}</select></label>)}
 <p>Agent desks · choosing an occupied desk swaps agents</p>
 <div className="osDeskAssignments">{agents.map(a=><label key={a.id}>{a.name}<select aria-label={`Desk for ${a.name}`} value={desks.get(a.id)} onChange={e=>setDesks(swapDesk(desks,a.id,Number(e.target.value)))}>{Array.from({length:Math.max(12,Math.ceil((Math.max(0,...desks.values())+1)/12)*12)},(_,n)=><option key={n} value={n}>Wing {Math.floor(n/12)+1} · Desk {n%12+1}</option>)}</select></label>)}</div>
 <button type="button" className="pillBtn ghostBtn" onClick={()=>{setDesks(new Map(agents.map((a,i)=>[a.id,i])));setDraft({...draft,roomOrder:[...defaults.roomOrder]});}}>Reset arrangement</button>
 </fieldset>
 {error&&<p role="alert">{error}</p>}<footer><button className="pillBtn ghostBtn" onClick={()=>{setDraft({...defaults});setDesks(new Map(agents.map((a,i)=>[a.id,i])));}}>Restore defaults</button><button className="pillBtn ghostBtn" onClick={onClose}>Cancel</button><button className="pillBtn" onClick={save}>Save office</button></footer>
 </section></div>;
}
