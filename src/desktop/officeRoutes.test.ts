import {test} from 'node:test';import assert from 'node:assert/strict';import {officeRoute,routeFrames} from './officeRoutes.js';
const rooms=[{x:1120,y:0,height:320},{x:1120,y:342,height:320}];
test('desk to right room seat uses aisle, corridor and doorway with orthogonal segments',()=>{
 const from={x:142,y:218},to={x:1430,y:140};const path=officeRoute(from,to,rooms);
 assert.deepEqual(path[0],from);assert.deepEqual(path.at(-1),to);
 assert.ok(path.some(p=>p.x===1000&&p.y===250));assert.ok(path.some(p=>p.x===1150&&p.y===122));
 for(let i=1;i<path.length;i++)assert.ok(path[i].x===path[i-1].x||path[i].y===path[i-1].y);
 // No segment crosses the conference tabletop (including the character's feet).
 for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i];for(let t=0;t<=1;t+=.02){const x=a.x+(b.x-a.x)*t+48,y=a.y+(b.y-a.y)*t+78;assert.ok(!(x>1230&&x<1430&&y>140&&y<250));}}
});
test('return route reverses the same safe path and additional wings have local aisles',()=>{
 const a={x:142,y:1242},b={x:1170,y:482};assert.deepEqual(officeRoute(a,b,rooms).reverse(),officeRoute(b,a,rooms));assert.ok(officeRoute(a,b,rooms).some(p=>p.y===1274));
});
test('animation offsets follow travelled distance',()=>{const frames=routeFrames([{x:0,y:0},{x:0,y:100},{x:300,y:100}],{x:0,y:0});assert.deepEqual(frames.map(f=>f.offset),[0,.25,1]);});

test('return from a removed session retains its old doorway geometry',()=>{
 const from={x:1430,y:482},home={x:142,y:218};
 const path=officeRoute(from,home,[],rooms);
 assert.ok(path.some(p=>p.x===1150&&p.y===464));
 assert.deepEqual(path[0],from);assert.deepEqual(path.at(-1),home);
 // Previous room table remains an obstacle for the departing character.
 for(let i=1;i<path.length;i++)for(let t=0;t<=1;t+=.01){const a=path[i-1],b=path[i];const x=a.x+(b.x-a.x)*t+48,y=a.y+(b.y-a.y)*t+78;assert.ok(!(x>1230&&x<1430&&y>482&&y<592));}
});
