export interface OfficePoint { x:number; y:number }
export interface RouteRoom { x:number; y:number; height:number }
// Coordinates refer to the avatar button's top-left; feet are 48px right, 78px down.
export function officeRoute(from:OfficePoint,to:OfficePoint,rooms:RouteRoom[],previousRooms:RouteRoom[]=rooms):OfficePoint[] {
  const corridorX=1000;
  function exit(p:OfficePoint,geometry:RouteRoom[]):OfficePoint[] {
    if(p.x<928){
      const wing=Math.max(0,Math.floor((p.y+78)/1024));
      const row=Math.max(0,Math.min(2,Math.round((p.y-wing*1024-218)/282)));
      const aisle=wing*1024+250+row*282;
      return [p,{x:p.x,y:aisle},{x:corridorX,y:aisle}];
    }
    const room=geometry.find(r=>p.x>=r.x-48 && p.y+78>=r.y && p.y+78<=r.y+r.height);
    if(room){
      const doorway=room.y+122;
      const left=room.x+30;
      // The right aisle reaches the doorway via the clear space above the table.
      return p.x>room.x+200 ? [p,{x:p.x,y:room.y+12},{x:left,y:room.y+12},{x:left,y:doorway},{x:corridorX,y:doorway}]
        : [p,{x:left,y:p.y},{x:left,y:doorway},{x:corridorX,y:doorway}];
    }
    return [p,{x:corridorX,y:p.y}];
  }
  const points=[...exit(from,previousRooms),...exit(to,rooms).reverse()];
  return points.filter((p,i)=>!i||p.x!==points[i-1].x||p.y!==points[i-1].y);
}
export function routeFrames(points:OfficePoint[],home:OfficePoint) {
  const lengths=points.map((p,i)=>i?Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y):0);
  const total=lengths.reduce((a,b)=>a+b,0);let distance=0;
  return points.map((p,i)=>{distance+=lengths[i];return {transform:`translate(${p.x-home.x}px, ${p.y-home.y}px)`,offset:total?distance/total:1};});
}
