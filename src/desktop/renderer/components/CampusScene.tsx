import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { OfficeSession, Project } from "../types";

import "./CampusScene.css";
import campusImage from "../assets/office/living-campus.png";

export interface CampusSceneProps {
  project: Project;
  sessions: OfficeSession[];
  agentStates: Record<string, string>;
  selectedAgent: string | null;
  onSelectAgent: (id: string) => void;
  onRoom: (kind: "meeting" | "planning" | "debate" | "board" | "workflows" | "results") => void;
}

const PAGE_SIZE = 12;
const roomDefs = [
  { id: "research", label: "Research library", kind: "meeting" as const, x: 4.5, y: 7.5, w: 25, h: 24 },
  { id: "strategy", label: "Strategy room", kind: "planning" as const, x: 37, y: 5.5, w: 26, h: 24 },
  { id: "lab", label: "Experiment lab", kind: "workflows" as const, x: 70, y: 8, w: 25, h: 23 },
  { id: "review", label: "Review room", kind: "debate" as const, x: 8, y: 66, w: 25, h: 23 },
  { id: "gallery", label: "Results gallery", kind: "results" as const, x: 68, y: 66, w: 25, h: 23 },
];
const activityRoom: Record<OfficeSession["kind"], string> = { planning: "strategy", meeting: "research", debate: "review" };
const stateText = (state?: string) => ({ working: "Working", done: "Completed", needs: "Needs input", idle: "Idle" }[state ?? ""] ?? state ?? "Idle");

export function CampusScene({ project, sessions, agentStates, selectedAgent, onSelectAgent, onRoom }: CampusSceneProps) {
  const viewport=useRef<HTMLDivElement>(null);
  const [artifacts,setArtifacts]=useState<Array<{id:string;title:string}>>([]);
  const [artifactStatus,setArtifactStatus]=useState('Loading results');
  useEffect(()=>{
    let active=true,busy=false;
    async function refresh(){if(busy||document.hidden)return;busy=true;try{const items=await (api as unknown as {listArtifacts:(id:string)=>Promise<Array<{id:string;title:string;createdAt:string}>>}).listArtifacts(project.id);if(active){setArtifacts([...items].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,2));setArtifactStatus(items.length?'':'No published results');}}catch{if(active)setArtifactStatus('Results unavailable');}finally{busy=false;}}
    setArtifacts([]);void refresh();const timer=setInterval(()=>void refresh(),15000);
    return()=>{active=false;clearInterval(timer);};
  },[project.id]);
  function findRoom(x:number,y:number){setZoom(1.5);requestAnimationFrame(()=>requestAnimationFrame(()=>{const el=viewport.current;if(el)el.scrollTo({left:el.scrollWidth*x/100-el.clientWidth/2,top:el.scrollHeight*y/100-el.clientHeight/2,behavior:'auto'});}));}
  const [wing, setWing] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rosterOpen, setRosterOpen] = useState(false);
  const pages = Math.max(1, Math.ceil(project.agents.length / PAGE_SIZE));
  const currentWing = Math.min(wing, pages - 1);
  const visibleAgents = project.agents.slice(currentWing * PAGE_SIZE, (currentWing + 1) * PAGE_SIZE);
  useEffect(() => { if(selectedAgent) { const index=project.agents.findIndex(a=>a.id===selectedAgent); if(index>=0)setWing(Math.floor(index/PAGE_SIZE)); } }, [selectedAgent, project.agents]);
  const assignments = useMemo(() => {
    const result: Record<string, string> = {};
    for (const session of sessions.filter(s=>s.projectId===project.id)) for (const id of session.agentIds) result[id] = activityRoom[session.kind];
    return result;
  }, [sessions, project.id]);
  const roomStyle = (x: number, y: number, w: number, h: number): CSSProperties => ({ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` });
  const people = visibleAgents.map((agent, index) => {
    const room = assignments[agent.id] ?? "work";
    const indexInRoom = visibleAgents.slice(0, index).filter(a => (assignments[a.id] ?? "work") === room).length;
    const homePoints = [[13,35],[26,36],[35,49],[44,44],[58,47],[70,45],[87,48],[12,78],[28,79],[41,85],[66,93],[83,94]];
    const roomPoints:Record<string,number[][]> = {
      research:[[10,31],[27,35],[14,39],[30,31]],
      strategy:[[37,31],[52,35],[56,30],[42,37]],
      review:[[10,73],[28,78],[15,81],[30,70]]
    };
    const points=roomPoints[room];
    const p=points ? points[indexInRoom%points.length] : homePoints[index];
    const overflow=points?Math.floor(indexInRoom/points.length):0;
    const state=room==='strategy' ? 'Planning' : agentStates[agent.id] ?? 'idle';
    return { agent, x:p[0]+overflow*3, y:p[1]+overflow*5, state, sprite:project.agents.indexOf(agent)%4 };

  });

  return <section className="campusScene" aria-label={`${project.name} campus`}>
    <header className="campusToolbar">
      <div className="campusHeading"><span className="campusEyebrow">LIVING CAMPUS</span><strong>{project.name}</strong><span className="campusCount">{project.agents.length} agents · Wing {currentWing + 1} of {pages}</span></div>
      <div className="campusActions">
        {pages > 1 && <div className="campusPaging"><button type="button" aria-label="Previous wing" disabled={currentWing === 0} onClick={() => setWing(v => Math.max(0, v - 1))}>‹</button><span>Wing {currentWing + 1}/{pages}</span><button type="button" aria-label="Next wing" disabled={currentWing + 1 >= pages} onClick={() => setWing(v => Math.min(pages - 1, v + 1))}>›</button></div>}
        <button type="button" className="campusRosterToggle" aria-expanded={rosterOpen} onClick={() => setRosterOpen(v => !v)}>{rosterOpen ? "Close roster" : "Roster"}</button>
        <div className="campusZoom"><button type="button" aria-label="Zoom out" onClick={() => setZoom(v => Math.max(.75, +(v - .1).toFixed(2)))}>−</button><button type="button" aria-label="Reset zoom" onClick={() => setZoom(1)}>{Math.round(zoom*100)}%</button><button type="button" aria-label="Zoom in" onClick={() => setZoom(v => Math.min(1.5, +(v + .1).toFixed(2)))}>+</button></div>
      </div>
    </header>
    <div className="campusViewport" ref={viewport}><div className="campusCanvas" style={{ width: `${zoom*100}%` }}>
      <img className="campusArchitecture" src={campusImage} alt="Isometric illustration of a connected living campus" draggable={false} />
      {roomDefs.map(room => <button key={room.id} type="button" className={`campusRoom campusRoom-${room.id}`} style={roomStyle(room.x, room.y, room.w, room.h)} onClick={() => onRoom(room.kind)}><span>{room.label}</span></button>)}
      <div className="campusGalleryDisplay" aria-label="Published campus results">
        {artifacts.length ? artifacts.map(a=><button key={a.id} onClick={()=>onRoom('results')} title={a.title}><small>Published result</small><strong>{a.title}</strong><span>Open gallery ↗</span></button>) : <button onClick={()=>onRoom('results')}><small>PROJECT GALLERY</small><strong>{artifactStatus}</strong><span>Open results ↗</span></button>}
      </div>
      {people.map(({ agent, x, y, state, sprite }) => <button key={agent.id} type="button" className={`campusAgent ${selectedAgent === agent.id ? "isSelected" : ""}`} style={{ left: `${x}%`, top: `${y}%` }} aria-label={`${agent.name}, ${stateText(state)}`} aria-pressed={selectedAgent === agent.id} title={`${agent.name} · ${stateText(state)}`} onClick={() => onSelectAgent(agent.id)}><i className="campusPerson" aria-hidden="true" style={{backgroundPosition:`${sprite*100/3}% center`}} /><span>{agent.name}</span></button>)}
    </div></div>
    <nav className="campusMinimap" aria-label="Campus map">
      <span>Explore campus</span><div>{roomDefs.map(room=><button key={room.id} aria-label={`Find ${room.label}`} title={room.label} onClick={()=>findRoom(room.x+room.w/2,room.y+room.h/2)} style={{left:`${room.x}%`,top:`${room.y}%`,width:`${room.w}%`,height:`${room.h}%`}} />)}</div>
    </nav>
    {rosterOpen && <aside className="campusRoster" aria-label="Agent roster"><div className="campusRosterHead"><strong>Project roster</strong><span>{project.agents.length} agents</span></div>{project.agents.map(agent => { const state = agentStates[agent.id] ?? "idle"; return <button type="button" key={agent.id} className={selectedAgent === agent.id ? "isSelected" : ""} onClick={() => {setWing(Math.floor(project.agents.indexOf(agent)/PAGE_SIZE));onSelectAgent(agent.id);setRosterOpen(false);}}><span className="campusRosterDot" data-state={state} /><span className="campusRosterName">{agent.name}</span><span className="campusRosterState">{stateText(state)}</span></button>; })}{pages > 1 && <div className="campusRosterPages"><button type="button" disabled={currentWing === 0} onClick={() => setWing(v => Math.max(0, v - 1))}>Previous wing</button><button type="button" disabled={currentWing + 1 >= pages} onClick={() => setWing(v => Math.min(pages - 1, v + 1))}>Next wing</button></div>}</aside>}
  </section>;
}
