import {useEffect,useState} from 'react';
export interface OfficePreferences {studio:string;meeting:string;debate:string;planning:string;labels:boolean}
export const defaults:OfficePreferences={studio:'Work studio',meeting:'Meeting',debate:'Boardroom',planning:'Strategy',labels:true};
export function readOfficePreferences(projectId:string):OfficePreferences {
 try{const value=JSON.parse(localStorage.getItem('office-preferences:v1:'+projectId)||'{}');const result={...defaults};for(const key of ['studio','meeting','debate','planning'] as const)if(typeof value?.[key]==='string'&&value[key].trim())result[key]=value[key].trim().slice(0,48);if(typeof value?.labels==='boolean')result.labels=value.labels;return result;}catch{return {...defaults};}
}
export function OfficeSettings({projectId,preferences,onSave,onClose}:{projectId:string;preferences:OfficePreferences;onSave:(p:OfficePreferences)=>void;onClose:()=>void}){
 const [draft,setDraft]=useState(preferences),[error,setError]=useState('');
 useEffect(()=>{const previous=document.activeElement as HTMLElement | null;return()=>{const trigger=document.getElementById("office-settings-trigger");(trigger ?? previous)?.focus();};},[]);
 function save(){const value={...draft};for(const key of ['studio','meeting','debate','planning'] as const)value[key]=value[key].trim()||defaults[key];try{localStorage.setItem('office-preferences:v1:'+projectId,JSON.stringify(value));onSave(value);onClose();}catch{setError('Could not save office settings on this device.');}}
 return <div className="osSettingsBackdrop"><section role="dialog" aria-modal="true" aria-label="Office settings" className="osSettings" onKeyDown={e=>{if(e.key==='Escape')onClose();if(e.key==='Tab'){const items=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('input,button'));const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}>
 <h2>Make this office yours</h2><p>Saved for this project on this device.</p>
 {(['studio','meeting','debate','planning'] as const).map((key,i)=><label key={key}>{({studio:'Studio name',meeting:'Meeting room name',debate:'Boardroom name',planning:'Strategy room name'})[key]}<input autoFocus={i===0} maxLength={48} value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>)}
 <label><input type="checkbox" checked={draft.labels} onChange={e=>setDraft({...draft,labels:e.target.checked})}/> Always show agent labels</label>
 {error&&<p role="alert">{error}</p>}<footer><button className="pillBtn ghostBtn" onClick={()=>setDraft({...defaults})}>Restore defaults</button><button className="pillBtn ghostBtn" onClick={onClose}>Cancel</button><button className="pillBtn" onClick={save}>Save office</button></footer>
 </section></div>;
}
