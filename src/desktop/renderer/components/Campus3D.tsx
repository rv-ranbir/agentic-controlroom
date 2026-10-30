import {campusTrafficClear} from '../../campus3dTraffic';
import {campusDelegates} from '../../campus3dDelegation';
import type {SubagentRecord} from '../../subagentPresence';
import {campusRoute,campusSegmentClear,type Obstacle,type Point} from '../../campus3dNavigation';
import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import type {CampusSceneProps} from './CampusScene';
import {CAMPUS_ROOMS,createCampusPerson,createCampusWorld,setCampusSeated} from '../lib/campus3dWorld';
import './Campus3D.css';

function label(text:string,background='#202923',color='#f5eddd') {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle=background;ctx.fillRect(0,0,512,96);
  ctx.fillStyle=color;ctx.font='500 32px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,48,480);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false}));sprite.scale.set(4,.75,1);sprite.renderOrder=5;return sprite;
}
function disposeTree(root:THREE.Object3D){
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  root.traverse(node=>{const mesh=node as THREE.Mesh;if(mesh.geometry)geometries.add(mesh.geometry);if(mesh.material)for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(material);});
  for(const material of materials){const map=(material as THREE.MeshStandardMaterial).map;if(map)textures.add(map);material.dispose();}
  geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());
}
type GalleryArtifact={id:string;title:string;kind:string;createdAt:string};
type GalleryApi={listArtifacts:(projectId:string)=>Promise<GalleryArtifact[]>;openArtifact:(projectId:string,id:string,mode:"app"|"browser")=>Promise<void>};
type Seat={x:number;z:number;rotation:number;room:string};
type Runtime={seats:Seat[];settle:(person:THREE.Group)=>void;gallery:THREE.Group;scene:THREE.Scene;camera:THREE.PerspectiveCamera;controls:OrbitControls;people:THREE.Group;renderer:THREE.WebGLRenderer;reset:()=>void;render:()=>void;obstacles:Obstacle[];clearWalks:()=>void;walk:(person:THREE.Group,path:Point[])=>void;snapWalks:()=>void};
const statusText=(state:string)=>({working:'Working',done:'Completed',needs:'Needs input',idle:'Idle'}[state]??state);

export function Campus3D(props:CampusSceneProps & {onFallback:()=>void;subagents:SubagentRecord[];selectedSubagent:string|null;onSelectSubagent:(record:SubagentRecord)=>void}){
  const {project,sessions,agentStates,selectedAgent,onSelectAgent,onRoom,onFallback,subagents,selectedSubagent,onSelectSubagent}=props;
  const host=useRef<HTMLDivElement>(null),runtime=useRef<Runtime|null>(null),latest=useRef(props);latest.current=props;
  const [artifacts,setArtifacts]=useState<GalleryArtifact[]>([]),[galleryMessage,setGalleryMessage]=useState('Loading results…'),[galleryOpen,setGalleryOpen]=useState(false),[galleryRevision,setGalleryRevision]=useState(0);
  const [galleryImages,setGalleryImages]=useState(0);
  const artifactScope=useRef(project.id);artifactScope.current=project.id;
  useEffect(()=>{
    let active=true,busy=false;setArtifacts([]);setGalleryMessage('Loading results…');
    const refresh=async()=>{if(busy||document.hidden)return;busy=true;try{const items=await (api as unknown as GalleryApi).listArtifacts(project.id);if(active){setArtifacts([...items].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));setGalleryMessage(items.length?'':'No published results yet');}}catch{if(active){setArtifacts([]);setGalleryMessage('Could not load results. Refresh to try again.');}}finally{busy=false;}};
    void refresh();const interval=setInterval(()=>void refresh(),10000);const visible=()=>{if(!document.hidden)void refresh();};document.addEventListener('visibilitychange',visible);
    return()=>{active=false;clearInterval(interval);document.removeEventListener('visibilitychange',visible);};
  },[project.id,galleryRevision]);
  async function openGalleryArtifact(id:string){const scope=project.id;try{await (api as unknown as GalleryApi).openArtifact(scope,id,'app');}catch{if(artifactScope.current===scope)setGalleryMessage('Could not open that result. It may have been removed.');}}
  const galleryAction=useRef(openGalleryArtifact);galleryAction.current=openGalleryArtifact;
  const [delegatePage,setDelegatePage]=useState(0),[delegatesOpen,setDelegatesOpen]=useState(false);
  const [trafficWaiting,setTrafficWaiting]=useState(0);
  const [moving,setMoving]=useState(0),[unreachable,setUnreachable]=useState<string[]>([]);
  const [failure,setFailure]=useState(''),[ready,setReady]=useState(false),[wing,setWing]=useState(0),[roster,setRoster]=useState(false);
  const pages=Math.max(1,Math.ceil(project.agents.length/12)),page=Math.min(wing,pages-1);
  const visibleParentIds=new Set(project.agents.slice(page*12,(page+1)*12).map(a=>a.id));
  const delegateResult=campusDelegates(subagents,project.id,visibleParentIds,delegatePage+1);
  const delegated={...delegateResult,page:delegateResult.page-1};
  useEffect(()=>{if(selectedSubagent){const records=subagents.filter(r=>r.projectId===project.id&&visibleParentIds.has(r.parentAgentId)&&(r.status==='running'||r.status==='unobserved'));const i=records.findIndex(r=>r.id===selectedSubagent);if(i>=0)setDelegatePage(Math.floor(i/12));}},[selectedSubagent,subagents,page,project.id]);
  useEffect(()=>{if(selectedAgent){const i=project.agents.findIndex(a=>a.id===selectedAgent);if(i>=0)setWing(Math.floor(i/12));}},[selectedAgent,project.agents]);
  useEffect(()=>{
    const container=host.current;if(!container)return;
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});}catch{setFailure('3D rendering is unavailable on this device. You can continue in the original office.');return;}
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
    renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','3D campus. Drag to orbit, right-drag to pan, wheel to zoom.');container.appendChild(renderer.domElement);
    const scene=new THREE.Scene();scene.background=new THREE.Color('#202925');
    const camera=new THREE.PerspectiveCamera(40,1,.1,150);camera.position.set(18.5,21.5,25);
    const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,0,0);controls.enableDamping=false;controls.minDistance=10;controls.maxDistance=85;controls.minPolarAngle=.15;controls.maxPolarAngle=Math.PI*.47;
    const ambient=new THREE.HemisphereLight('#fff2d6','#62726a',2.2);scene.add(ambient);
    const sun=new THREE.DirectionalLight('#fff0d5',3.2);sun.position.set(-12,25,10);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-25;sun.shadow.camera.right=25;sun.shadow.camera.top=25;sun.shadow.camera.bottom=-25;sun.shadow.normalBias=.035;scene.add(sun);
    const world=createCampusWorld();scene.add(world);world.updateMatrixWorld(true);
    const seats:Seat[]=[];
    world.traverse(node=>{if(node.name==='sage chair'){let parent=node.parent;while(parent&&!parent.userData.room)parent=parent.parent;if(parent){const p=node.getWorldPosition(new THREE.Vector3());seats.push({x:p.x,z:p.z,rotation:node.rotation.y,room:parent.userData.room});}}});
    const obstacles:Obstacle[]=[];
    world.traverse(node=>{const mesh=node as THREE.Mesh;if(!mesh.isMesh)return;const box=new THREE.Box3().setFromObject(mesh);if(box.max.y>.4&&box.min.y<1.7)obstacles.push({minX:box.min.x,maxX:box.max.x,minZ:box.min.z,maxZ:box.max.z});});
    for(const room of CAMPUS_ROOMS){const title=label(room.label);title.position.set(room.x,3.7,room.z-2.8);title.userData.room=room.kind;scene.add(title);}
    const people=new THREE.Group();scene.add(people);const gallery=new THREE.Group();scene.add(gallery);
    const render=()=>{renderer.domElement.dataset.seated=String(people.children.filter(person=>person.userData.seated).length);if(!document.hidden)renderer.render(scene,camera);};
    const walking=new Map<THREE.Group,{path:Point[];step:number;phase:number;wait:number}>();
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');let frame=0,lastTime=0,disposed=false;
    const settle=(person:THREE.Group)=>{const seat=person.userData.seat as Seat|undefined;if(seat){person.position.set(seat.x,-.14,seat.z);person.rotation.y=seat.rotation;setCampusSeated(person,true);person.userData.seated=true;}};
    const resetPose=(person:THREE.Group)=>{for(const name of ['leg-left','leg-right','arm-left','arm-right']){const limb=person.getObjectByName(name);if(limb)limb.rotation.x=0;}};
    const clearWalks=()=>{setTrafficWaiting(0);cancelAnimationFrame(frame);frame=0;lastTime=0;walking.forEach((_,person)=>resetPose(person));walking.clear();};
    const snapWalks=()=>{walking.forEach((motion,person)=>{const end=motion.path.at(-1)!;person.position.set(end.x,.27,end.z);});const arrivals=[...walking.keys()];clearWalks();arrivals.forEach(settle);if(!disposed)setMoving(0);render();};
    const tick=(time:number)=>{
      frame=0;if(disposed)return;if(document.hidden||reduced.matches){snapWalks();return;}
      const dt=lastTime?Math.min((time-lastTime)/1000,.06):0;lastTime=time;
      let waiting=0;
      walking.forEach((motion,person)=>{
        let blocked=false;const others=people.children.filter(other=>other!==person).map(other=>({x:other.position.x,z:other.position.z}));
        let distance=dt*3.4;
        while(distance>0&&motion.step<motion.path.length){const target=motion.path[motion.step],dx=target.x-person.position.x,dz=target.z-person.position.z,length=Math.hypot(dx,dz);person.rotation.y=Math.atan2(dx,dz);
          const step=Math.min(length,distance),candidate={x:person.position.x+(length?dx/length*step:0),z:person.position.z+(length?dz/length*step:0)};
          if(!campusTrafficClear({x:person.position.x,z:person.position.z},candidate,others)){blocked=true;break;}
          if(length<=distance){person.position.set(target.x,.27,target.z);distance-=length;motion.step++;}else{person.position.x+=dx/length*distance;person.position.z+=dz/length*distance;distance=0;}}
        if(blocked){waiting++;resetPose(person);motion.wait+=dt;if(motion.wait>=1){motion.wait=0;const occupied=others.map(p=>({minX:p.x-.4,maxX:p.x+.4,minZ:p.z-.4,maxZ:p.z+.4}));const route=campusRoute({x:person.position.x,z:person.position.z},motion.path.at(-1)!,[...obstacles,...occupied]);if(route){motion.path=route;motion.step=1;}}return;}
        motion.wait=0;motion.phase+=dt*10;const gait=Math.sin(motion.phase)*.38;
        for(const [name,angle] of [['leg-left',gait],['leg-right',-gait],['arm-left',-gait*.65],['arm-right',gait*.65]] as const){const limb=person.getObjectByName(name);if(limb)limb.rotation.x=angle;}
        if(motion.step>=motion.path.length){resetPose(person);settle(person);walking.delete(person);setMoving(walking.size);}
      });setTrafficWaiting(waiting);render();if(walking.size)frame=requestAnimationFrame(tick);else lastTime=0;
    };
    const walk=(person:THREE.Group,path:Point[])=>{if(path.length<2)return;walking.set(person,{path,step:1,phase:0,wait:0});setMoving(walking.size);if(document.hidden||reduced.matches){snapWalks();return;}if(!frame)frame=requestAnimationFrame(tick);};
    const onVisibility=()=>{if(document.hidden)snapWalks();else render();};
    const onMotion=()=>{if(reduced.matches)snapWalks();};reduced.addEventListener('change',onMotion);
    const reset=()=>{camera.position.set(18.5,21.5,25);controls.target.set(0,0,0);controls.update();render();};
    runtime.current={seats,settle,gallery,scene,camera,controls,people,renderer,reset,render,obstacles,clearWalks,walk,snapWalks};
    const resize=()=>{const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);render();};
    const observer=new ResizeObserver(resize);observer.observe(container);controls.addEventListener('change',render);
    const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let down={x:0,y:0};
    const pointerDown=(e:PointerEvent)=>{down={x:e.clientX,y:e.clientY};};
    const pointerUp=(e:PointerEvent)=>{if(e.button!==0||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;const box=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-box.left)/box.width*2-1,-(e.clientY-box.top)/box.height*2+1);ray.setFromCamera(pointer,camera);
      for(const hit of ray.intersectObjects(scene.children,true)){let node:THREE.Object3D|null=hit.object;while(node){if(node.userData.artifactId){void galleryAction.current(node.userData.artifactId);return;}if(node.userData.subagentId){const record=latest.current.subagents.find(r=>r.id===node!.userData.subagentId&&r.projectId===latest.current.project.id);if(record)latest.current.onSelectSubagent(record);return;}if(node.userData.agentId){latest.current.onSelectAgent(node.userData.agentId);return;}if(node.userData.room){latest.current.onRoom(node.userData.room);return;}node=node.parent;}}
    };
    const onKey=(e:KeyboardEvent)=>{if(e.key==='0'){reset();e.preventDefault();}if(e.key==='+'||e.key==='-'||e.key==='='){camera.position.sub(controls.target).multiplyScalar(e.key==='-'?1.1:.9).add(controls.target);controls.update();render();e.preventDefault();}};
    const lost=(e:Event)=>{e.preventDefault();clearWalks();setMoving(0);setFailure('The 3D graphics connection was interrupted. Return to the original office, then reopen 3D.');};
    renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pointerUp);renderer.domElement.addEventListener('keydown',onKey);renderer.domElement.addEventListener('webglcontextlost',lost);
    document.addEventListener('visibilitychange',onVisibility);resize();controls.update();setReady(true);
    return()=>{disposed=true;clearWalks();reduced.removeEventListener('change',onMotion);runtime.current=null;observer.disconnect();controls.removeEventListener('change',render);controls.dispose();document.removeEventListener('visibilitychange',onVisibility);renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('keydown',onKey);renderer.domElement.removeEventListener('webglcontextlost',lost);disposeTree(scene);renderer.dispose();renderer.domElement.remove();};
  },[project.id]);
  useEffect(()=>{
    const r=runtime.current;if(!r)return;
    const previous=new Map(r.people.children.map(person=>[person.userData.actorKey??person.userData.agentId,person.userData.seated?person.userData.approach:{x:person.position.x,z:person.position.z}]));
    r.clearWalks();setMoving(0);disposeTree(r.people);r.people.clear();const failed:string[]=[];const obstacles=r.obstacles;const reserved:Point[]=[];const claimed=new Set<Seat>();
    function freeAnchor(x:number,z:number):Point {
      const desired={x,z};if(campusSegmentClear(desired,desired,obstacles)&&reserved.every(p=>Math.hypot(p.x-x,p.z-z)>.8))return desired;
      // Choose a nearby free standing anchor, never animate through an occupied seat.
      for(let radius=.35;radius<=1.75;radius+=.35)for(let i=0;i<16;i++){const p={x:x+Math.cos(i*Math.PI/8)*radius,z:z+Math.sin(i*Math.PI/8)*radius};if(campusSegmentClear(p,p,obstacles)&&reserved.every(q=>Math.hypot(q.x-p.x,q.z-p.z)>.8))return p;}
      return desired;
    }
    const visible=project.agents.slice(page*12,(page+1)*12);
    const active=new Map<string,string>();for(const session of sessions.filter(s=>s.projectId===project.id))for(const id of session.agentIds)active.set(id,session.kind);
    const used=new Map<string,number>(),destinations=new Map<string,Point>();
    const home=[[-11,-1.8],[-8,-1.8],[-4.5,-1.8],[-2,-1.8],[2,-1.8],[8,-1.8],[11,-1.8],[-11,8],[-7,8],[7,8],[10,8],[12,8]];
    visible.forEach((agent,index)=>{
      const person=createCampusPerson(page*12+index);person.userData.agentId=agent.id;
      const session=active.get(agent.id),state=session==='planning'?'Planning':statusText(agentStates[agent.id]??'idle');
      let [x,z]=home[index];if(session){const key=session;const slot=used.get(key)??0;used.set(key,slot+1);const room=CAMPUS_ROOMS.find(room=>room.kind===session)!;x=room.x-2.4+(slot%4)*1.6;z=room.z+2.6+Math.floor(slot/4)*.85;}
      let seat:Seat|undefined,approach:Point|undefined;
      if(session)for(const candidate of r.seats.filter(s=>s.room===session&&!claimed.has(s))){
        for(let i=0;i<16;i++){const angle=candidate.rotation+i*Math.PI/8;const p={x:candidate.x+Math.sin(angle)*1.1,z:candidate.z+Math.cos(angle)*1.1};
          if(campusSegmentClear(p,p,obstacles)&&reserved.every(q=>Math.hypot(q.x-p.x,q.z-p.z)>.8)){seat=candidate;approach=p;break;}}
        if(seat)break;
      }
      if(seat){claimed.add(seat);person.userData.seat=seat;person.userData.approach=approach;}
      const destination=approach??freeAnchor(x,z),origin=previous.get(agent.id);reserved.push(destination);destinations.set(agent.id,destination);
      const route=origin?campusRoute(origin,destination,r.obstacles):null;
      person.position.set(destination.x,.27,destination.z);person.rotation.y=-.25;
      if(origin&&Math.hypot(origin.x-destination.x,origin.z-destination.z)>.02){if(route){person.position.set(origin.x,.27,origin.z);r.walk(person,route);}else failed.push(agent.name);}else r.settle(person);
      const name=label(`${agent.name} · ${state}`,selectedAgent===agent.id?'#685438':'#202923');name.position.set(0,2.35,0);name.scale.set(3.2,.6,1);person.add(name);
      const ring=new THREE.Mesh(new THREE.RingGeometry(.38,.46,32),new THREE.MeshBasicMaterial({color:selectedAgent===agent.id?'#ffcf7d':state==='Working'?'#9cbf8d':'#a9a99b',side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.025;person.add(ring);r.people.add(person);
    });
    const childSlots=new Map<string,number>();
    delegated.items.forEach((record,index)=>{
      const parent=destinations.get(record.parentAgentId);if(!parent)return;
      const slot=childSlots.get(record.parentAgentId)??0;childSlots.set(record.parentAgentId,slot+1);
      const angle=slot*Math.PI/3,radius=1.2+Math.floor(slot/6)*.8;
      const destination=freeAnchor(parent.x+Math.cos(angle)*radius,parent.z+Math.sin(angle)*radius);
      reserved.push(destination);
      const key='child:'+record.id,origin=previous.get(key),person=createCampusPerson(index+20);person.scale.setScalar(.78);
      person.userData.actorKey=key;person.userData.subagentId=record.id;person.userData.agentId=record.parentAgentId;
      person.position.set(destination.x,.27,destination.z);
      if(origin&&Math.hypot(origin.x-destination.x,origin.z-destination.z)>.02){const route=campusRoute(origin,destination,r.obstacles);if(route){person.position.set(origin.x,.27,origin.z);r.walk(person,route);}else failed.push(record.description);}
      const state=record.status==='running'?'Working':'Status unavailable';
      const name=label(`${record.description} · ${state}`,selectedSubagent===record.id?'#685438':'#29434b');name.position.set(0,2.4,0);name.scale.set(4,.65,1);person.add(name);
      const ring=new THREE.Mesh(new THREE.RingGeometry(.38,.47,32),new THREE.MeshBasicMaterial({color:selectedSubagent===record.id?'#ffcf7d':record.status==='running'?'#83b8c5':'#a5a49d',side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.025;person.add(ring);r.people.add(person);
    });setUnreachable(failed);r.render();
  },[ready,project.agents,project.id,page,sessions,agentStates,selectedAgent,subagents,selectedSubagent,delegated.page]);
  useEffect(()=>{
    const r=runtime.current;if(!r)return;let active=true;setGalleryImages(0);disposeTree(r.gallery);r.gallery.clear();
    const recent=artifacts.slice(0,3);
    for(let index=0;index<3;index++){
      const artifact=recent[index],canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
      const ctx=canvas.getContext('2d')!;ctx.fillStyle='#202d29';ctx.fillRect(0,0,512,512);
      ctx.fillStyle='#a7bb99';ctx.fillRect(38,40,54,5);ctx.font='22px system-ui';ctx.fillText(artifact?artifact.kind.toUpperCase():'PROJECT GALLERY',38,95);
      ctx.fillStyle='#f0e7d7';ctx.font='500 38px system-ui';
      const text=artifact?.title??(index===0?galleryMessage:'Space for your next result');
      const words=text.split(/\s+/);let line='',row=0;
      for(const word of words){const candidate=line?line+' '+word:word;if(ctx.measureText(candidate).width>430&&line){ctx.fillText(line,38,170+row*52,430);row++;line=word;if(row>=4)break;}else line=candidate;}
      if(row<4)ctx.fillText(line,38,170+row*52,430);
      ctx.fillStyle='#a7bb99';ctx.font='22px system-ui';ctx.fillText(artifact?'Open result ↗':'Published by this project',38,450,430);
      const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
      const panel=new THREE.Mesh(new THREE.PlaneGeometry(1.21,1.21),new THREE.MeshBasicMaterial({map}));const room=CAMPUS_ROOMS.find(room=>room.kind==='results')!;panel.position.set(room.x-2.6+index*2.6,1.55,room.z-2.80);
      if(artifact)panel.userData.artifactId=artifact.id;else panel.userData.room='results';r.gallery.add(panel);
      if(artifact?.kind==='image')void api.getArtifactThumbnail(project.id,artifact.id).then(async thumbnail=>{
        if(!active||runtime.current!==r)return;
        const image=new Image();image.src=thumbnail.dataUrl;await image.decode();
        if(!active||runtime.current!==r)return;
        ctx.fillStyle='#202d29';ctx.fillRect(0,0,512,512);
        const scale=Math.min(464/image.naturalWidth,366/image.naturalHeight),width=image.naturalWidth*scale,height=image.naturalHeight*scale;
        ctx.drawImage(image,(512-width)/2,24+(366-height)/2,width,height);
        ctx.fillStyle='#f0e7d7';ctx.font='500 26px system-ui';ctx.fillText(artifact.title,24,430,464);
        ctx.fillStyle='#a7bb99';ctx.font='20px system-ui';ctx.fillText('Open image ↗',24,474,464);
        map.needsUpdate=true;setGalleryImages(count=>count+1);r.render();
      }).catch(()=>{/* Keep the title card when this image cannot be decoded. */});
    }r.render();return()=>{active=false;};
  },[ready,artifacts,galleryMessage,project.id]);
  function zoom(factor:number){const r=runtime.current;if(!r)return;const offset=r.camera.position.clone().sub(r.controls.target);offset.setLength(THREE.MathUtils.clamp(offset.length()*factor,10,85));r.camera.position.copy(r.controls.target).add(offset);r.controls.update();r.render();}
  return <section className="campus3d" aria-label="3D campus" data-ready={ready&&!failure} data-subagents={delegated.items.length} data-gallery-results={Math.min(3,artifacts.length)} data-gallery-images={galleryImages}>
    <header className="campus3dToolbar"><div><strong>{project.name}</strong><span>3D campus · {project.agents.length} agents</span></div><div><button onClick={()=>setRoster(v=>!v)} aria-expanded={roster}>People</button><button onClick={()=>setDelegatesOpen(v=>!v)} aria-expanded={delegatesOpen}>Delegated work ({delegated.total})</button><button onClick={()=>setGalleryOpen(v=>!v)} aria-expanded={galleryOpen}>Gallery ({artifacts.length})</button><button onClick={()=>runtime.current?.reset()}>Reset camera</button><button aria-label="Zoom out 3D" onClick={()=>zoom(1.15)}>−</button><button aria-label="Zoom in 3D" onClick={()=>zoom(.85)}>+</button></div></header>
    <div className="campus3dStage" ref={host} />
    {failure&&<div className="campus3dFallback" role="alert"><p>{failure}</p><button onClick={onFallback}>Open original office</button></div>}
    {!failure&&<div className="campus3dMotion" role="status">{trafficWaiting?`${trafficWaiting} waiting for a clear path · ${moving} travelling`:moving?`${moving} walking to their workspace`:unreachable.length?`Placed directly: route unavailable for ${unreachable.join(', ')}`:'Everyone is in place'}</div>}
    {!failure&&<div className="campus3dHint">Drag to orbit · Right-drag to pan · Scroll to zoom</div>}
    {pages>1&&<nav className="campus3dWings" aria-label="3D wings"><button disabled={page===0} onClick={()=>setWing(page-1)}>Previous wing</button><span>Wing {page+1} / {pages}</span><button disabled={page+1===pages} onClick={()=>setWing(page+1)}>Next wing</button></nav>}
    <nav className="campus3dRooms" aria-label="Campus rooms">{CAMPUS_ROOMS.map(room=><button key={room.id} onClick={()=>onRoom(room.kind)}>{room.label}</button>)}</nav>
    {delegatesOpen&&<aside className="campus3dPeople campus3dDelegates" aria-label="3D delegated work"><header><strong>This wing · {delegated.total} tasks</strong><button onClick={()=>setDelegatesOpen(false)}>Close delegated work</button></header>
      {!delegated.total&&<p>No active delegated work reported in this wing.</p>}
      {delegated.items.map(record=><button key={record.id} data-subagent-id={record.id} data-status={record.status} aria-label={`Subagent ${record.description}`} aria-pressed={selectedSubagent===record.id} onClick={()=>onSelectSubagent(record)}><strong>{record.description}</strong><span>For {project.agents.find(a=>a.id===record.parentAgentId)?.name} · {record.status==='running'?'Working':'Status unavailable'}</span></button>)}
      {delegated.pages>1&&<nav aria-label="3D delegated pages"><button disabled={delegated.page===0} onClick={()=>setDelegatePage(delegated.page-1)}>Previous tasks</button><span>{delegated.page+1} / {delegated.pages}</span><button disabled={delegated.page+1>=delegated.pages} onClick={()=>setDelegatePage(delegated.page+1)}>Next tasks</button></nav>}
    </aside>}
    {galleryOpen&&<aside className="campus3dPeople campus3dGallery" aria-label="3D gallery results"><header><strong>Published results</strong><button onClick={()=>setGalleryOpen(false)}>Close gallery</button></header><button onClick={()=>setGalleryRevision(v=>v+1)}>Refresh gallery</button>
      {galleryMessage&&<p role="status">{galleryMessage}</p>}
      {artifacts.slice(0,20).map(artifact=><button key={artifact.id} onClick={()=>void openGalleryArtifact(artifact.id)}><strong>{artifact.title}</strong><span>{artifact.kind} · Open preview</span></button>)}
      <button onClick={()=>onRoom('results')}>View all project results</button>
    </aside>}
    {roster&&<aside className="campus3dPeople" aria-label="Campus people"><header><strong>Project team</strong><button onClick={()=>setRoster(false)}>Close people</button></header>{project.agents.map(agent=><button key={agent.id} aria-pressed={agent.id===selectedAgent} onClick={()=>{onSelectAgent(agent.id);setRoster(false);}}><strong>{agent.name}</strong><span>{statusText(agentStates[agent.id]??'idle')}</span></button>)}</aside>}
  </section>;
}
