import {campusSegmentClear,type Point} from './campus3dNavigation.js';
/** Match the planner's square clearance, including the entire movement segment. */
export function campusTrafficClear(from:Point,to:Point,others:Point[],clearance=.65):boolean{
 return others.every(p=>{
  const before=Math.max(Math.abs(from.x-p.x),Math.abs(from.z-p.z));
  const after=Math.max(Math.abs(to.x-p.x),Math.abs(to.z-p.z));
  if(before<=clearance)return after>before;
  const half=clearance-.25;
  return campusSegmentClear(from,to,[{minX:p.x-half,maxX:p.x+half,minZ:p.z-half,maxZ:p.z+half}]);
 });
}
