import type {OfficePoint,RouteRoom} from './officeRoutes.js';
export interface Obstacle {x:number;y:number;width:number;height:number;kind:'wall'|'desk'|'plant'|'table'|'cabinet'|'chair'}
export interface NavigationMap {width:number;height:number;obstacles:Obstacle[]}
// Physical footprints in floor coordinates, matching the cutaway's desk/room anchors.
// Characters navigate by their feet with a 10px clearance, not their label rectangles.
export function officeNavigation(rooms:RouteRoom[],height:number):NavigationMap {
 const obstacles:Obstacle[]=[];const add=(kind:Obstacle['kind'],x:number,y:number,width:number,h:number)=>obstacles.push({kind,x,y,width,height:h});
 const wings=Math.max(1,Math.ceil(height/1024));
 for(let wing=0;wing<wings;wing++){
  const y=wing*1024;
  add('wall',0,y,20,1024);add('wall',0,y,976,20);add('wall',0,y+1004,976,20);
  let edge=y;
  for(let row=0;row<3;row++){
   const door=y+290+row*282;add('wall',956,edge,20,door-edge);edge=door+76;
   for(let col=0;col<4;col++){add('desk',110+col*214,y+170+row*282,155,92);add('chair',170+col*214,y+276+row*282,40,40);}
   if(row<2)add('plant',454,y+355+row*282,100,64);
  }
  add('wall',956,edge,20,y+1024-edge);
  add('cabinet',300,y+36,430,55);add('plant',28,y+34,60,75);add('plant',854,y+32,60,75);
 }
 for(const room of rooms){
  const {x,y,height:h}=room;
  add('wall',x,y,416,12);add('wall',x,y+h-12,416,12);add('wall',x+404,y,12,h);
  add('wall',x,y,12,122);add('wall',x,y+230,12,Math.max(0,h-230));
  add('table',x+110,y+h*.34,200,h*.42);
  for(let row=0;row<Math.max(1,Math.floor((h-72)/190));row++)for(const seatX of [78,338])add('chair',x+seatX,y+198+row*190,40,40);
  add('cabinet',x+60,y+20,240,25);add('plant',x+355,y+30,30,35);
 }
 return {width:1536,height:Math.max(wings*1024,...rooms.map(r=>r.y+r.height)),obstacles};
}
const clearance=10,step=16;
const expanded=(o:Obstacle)=>({left:o.x-clearance,right:o.x+o.width+clearance,top:o.y-clearance,bottom:o.y+o.height+clearance});
export function clearSegment(a:OfficePoint,b:OfficePoint,map:NavigationMap):boolean {
 if([a,b].some(p=>p.x<clearance||p.y<clearance||p.x>map.width-clearance||p.y>map.height-clearance))return false;
 return !map.obstacles.some(o=>{
  const r=expanded(o);let lo=0,hi=1;
  for(const [origin,delta,min,max] of [[a.x,b.x-a.x,r.left,r.right],[a.y,b.y-a.y,r.top,r.bottom]]){
   if(Math.abs(delta)<1e-9){if(origin<=min||origin>=max)return false;continue;}
   let t1=(min-origin)/delta,t2=(max-origin)/delta;if(t1>t2)[t1,t2]=[t2,t1];lo=Math.max(lo,t1);hi=Math.min(hi,t2);if(lo>=hi)return false;
  }
  return hi>0&&lo<1;
 });
}
interface Grid {cols:number;rows:number;blocked:Uint8Array}
const cache=new Map<string,Grid>();
function gridFor(map:NavigationMap):Grid {
 const key=JSON.stringify(map);const prior=cache.get(key);if(prior)return prior;
 const cols=Math.floor(map.width/step)+1,rows=Math.floor(map.height/step)+1;
 if(cols*rows>250000)throw Error('Office navigation size limit');
 const blocked=new Uint8Array(cols*rows);
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)if(x*step<clearance||y*step<clearance||x*step>map.width-clearance||y*step>map.height-clearance)blocked[y*cols+x]=1;
 for(const obstacle of map.obstacles){const r=expanded(obstacle);const x0=Math.max(0,Math.floor(r.left/step)+1),x1=Math.min(cols-1,Math.ceil(r.right/step)-1),y0=Math.max(0,Math.floor(r.top/step)+1),y1=Math.min(rows-1,Math.ceil(r.bottom/step)-1);for(let y=y0;y<=y1;y++)blocked.fill(1,y*cols+x0,y*cols+x1+1);}
 const result={cols,rows,blocked};if(cache.size>=4)cache.delete(cache.keys().next().value!);cache.set(key,result);return result;
}
// A seated agent may leave/approach its own chair; all other chairs remain obstacles.
export function routeMap(map:NavigationMap,from:OfficePoint,to:OfficePoint):NavigationMap {
 const points=[from,to].map(p=>({x:p.x+48,y:p.y+78}));
 return {...map,obstacles:map.obstacles.filter(o=>o.kind!=='chair'||!points.some(p=>{const r=expanded(o);return p.x>=r.left&&p.x<=r.right&&p.y>=r.top&&p.y<=r.bottom;}))};
}
/** A* over the walkable floor. Returns null for a blocked/unreachable destination. */
export function furnitureRoute(from:OfficePoint,to:OfficePoint,map:NavigationMap):OfficePoint[]|null {
 map=routeMap(map,from,to);
 const a={x:from.x+48,y:from.y+78},b={x:to.x+48,y:to.y+78};
 if(!clearSegment(a,a,map)||!clearSegment(b,b,map))return null;
 const {cols,rows,blocked}=gridFor(map),point=(id:number)=>({x:id%cols*step,y:Math.floor(id/cols)*step});
 function neighbours(p:OfficePoint){const result:number[]=[];const cx=Math.round(p.x/step),cy=Math.round(p.y/step);for(let y=cy-2;y<=cy+2;y++)for(let x=cx-2;x<=cx+2;x++){if(x<0||y<0||x>=cols||y>=rows)continue;const id=y*cols+x;if(!blocked[id]&&clearSegment(p,point(id),map))result.push(id);}return result;}
 const starts=neighbours(a),ends=new Set(neighbours(b));if(!starts.length||!ends.size)return null;
 const costs=new Float64Array(cols*rows).fill(Infinity),parent=new Int32Array(cols*rows).fill(-1),closed=new Uint8Array(cols*rows);
 const heap:Array<{id:number;score:number}>=[];
 const heuristic=(id:number)=>Math.hypot(point(id).x-b.x,point(id).y-b.y);
 function push(id:number,score:number){let i=heap.length;heap.push({id,score});while(i){const p=(i-1)>>1;if(heap[p].score<=score)break;[heap[p],heap[i]]=[heap[i],heap[p]];i=p;}}
 function pop(){const first=heap[0],last=heap.pop()!;if(heap.length){heap[0]=last;let i=0;while(true){let j=i*2+1;if(j>=heap.length)break;if(j+1<heap.length&&heap[j+1].score<heap[j].score)j++;if(heap[i].score<=heap[j].score)break;[heap[i],heap[j]]=[heap[j],heap[i]];i=j;}}return first.id;}
 for(const id of starts){costs[id]=Math.hypot(point(id).x-a.x,point(id).y-a.y);push(id,costs[id]+heuristic(id));}
 let end=-1;
 while(heap.length){const id=pop();if(closed[id])continue;closed[id]=1;if(ends.has(id)){end=id;break;}
  const x=id%cols,y=Math.floor(id/cols);
  for(const n of [x? id-1:-1,x+1<cols?id+1:-1,y?id-cols:-1,y+1<rows?id+cols:-1]){
   if(n<0||blocked[n]||closed[n]||!clearSegment(point(id),point(n),map))continue;
   const cost=costs[id]+step;if(cost>=costs[n])continue;costs[n]=cost;parent[n]=id;push(n,cost+heuristic(n));
  }
 }
 if(end<0)return null;const path:OfficePoint[]=[b];for(let id=end;id>=0;id=parent[id])path.push(point(id));path.push(a);path.reverse();
 const smooth:OfficePoint[]=[path[0]];let i=0;while(i<path.length-1){let j=path.length-1;while(j>i+1&&!clearSegment(path[i],path[j],map))j--;smooth.push(path[j]);i=j;}
 return smooth.map(p=>({x:p.x-48,y:p.y-78}));
}
