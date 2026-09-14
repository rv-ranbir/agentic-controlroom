import {test} from 'node:test';import assert from 'node:assert/strict';
import {officeNavigation,furnitureRoute,clearSegment,routeMap} from './officeNavigation.js';
test('all 30 home desks reach every room side without furniture or wall crossings',()=>{
 const rooms=[{x:1120,y:0,height:320},{x:1120,y:342,height:700},{x:1120,y:1064,height:320}],map=officeNavigation(rooms,3072);
 for(let i=0;i<30;i++)for(const room of rooms)for(const x of [1170,1430]){
 const home={x:142+i%4*214,y:218+Math.floor(i/4)%3*282+Math.floor(i/12)*1024},dest={x,y:room.y+140};
 const path=furnitureRoute(home,dest,map);assert.ok(path,`No route for desk ${i} to ${JSON.stringify(dest)}`);assert.deepEqual(path[0],home);assert.deepEqual(path.at(-1),dest);
 for(let n=1;n<path.length;n++)assert.ok(clearSegment({x:path[n-1].x+48,y:path[n-1].y+78},{x:path[n].x+48,y:path[n].y+78},routeMap(map,home,dest)));
 }
});
test('interrupted walk can retarget safely and closed doorway is unreachable',()=>{
 const room={x:1120,y:0,height:320},map=officeNavigation([room],1024),home={x:142,y:218},dest={x:1430,y:140};
 const path=furnitureRoute(home,dest,map)!;assert.ok(path);const mid={x:(path[0].x+path[1].x)/2,y:(path[0].y+path[1].y)/2};assert.ok(furnitureRoute(mid,home,map));
 const closed={...map,obstacles:[...map.obstacles,{x:1120,y:122,width:12,height:108,kind:'wall' as const}]};assert.equal(furnitureRoute(home,dest,closed),null);
 assert.equal(furnitureRoute(home,{x:1300-48,y:180-78},map),null);
});
