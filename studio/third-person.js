/* Camera follows the controlled body; gameplay keeps its own position/collisions. */
(function(root,factory){const api=factory();root.CityThirdPerson=api;if(typeof module==='object')module.exports=api;})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
function create(T,camera,{distance=6.4,bounds=null}={}){
 let initialized=false;const target=new T.Vector3(),desired=new T.Vector3(),look=new T.Vector3();
 function constrain(origin,end,boxes,ceilingAt){
  const result=end.clone();
  if(bounds){result.x=T.MathUtils.clamp(result.x,bounds.minX+.32,bounds.maxX-.32);result.z=T.MathUtils.clamp(result.z,bounds.minZ+.32,bounds.maxZ-.32);}
  let limit=1;const dx=result.x-origin.x,dz=result.z-origin.z;
  for(const box of boxes||[]){
   // Slab intersection against the camera's swept horizontal radius.
   let lo=0,hi=1;
   for(const [axis,delta]of [['X',dx],['Z',dz]]){
    const from=axis==='X'?origin.x:origin.z,min=box['min'+axis]-.24,max=box['max'+axis]+.24;
    if(Math.abs(delta)<1e-8){if(from<min||from>max){lo=2;break;}}
    else{const a=(min-from)/delta,b=(max-from)/delta;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));}
   }
   if(lo<=hi&&hi>=0&&lo<=1&&lo>0)limit=Math.min(limit,Math.max(.02,lo-.06));
  }
  result.lerpVectors(origin,result,limit);
  if(ceilingAt){const ceiling=ceilingAt(result.x,result.z);if(Number.isFinite(ceiling))result.y=Math.min(result.y,ceiling-.25);}
  return result;
 }
 function update(feet,yaw,pitch,dt,{obstacles=[],ceilingAt=null,snap=false}={}){
  target.copy(feet);target.y+=1.25;const elevation=T.MathUtils.clamp(.31-pitch,-.08,.9),flat=distance*Math.cos(elevation);
  desired.set(target.x+Math.sin(yaw)*flat,target.y+.4+Math.sin(elevation)*distance,target.z+Math.cos(yaw)*flat);
  const safe=constrain(target,desired,obstacles,ceilingAt);
  if(!initialized||snap){camera.position.copy(safe);initialized=true;}else camera.position.lerp(safe,1-Math.exp(-12*Math.min(dt,.1)));
  camera.position.copy(constrain(target,camera.position,obstacles,ceilingAt));
  look.set(feet.x-Math.sin(yaw)*1.1,feet.y+1.32,feet.z-Math.cos(yaw)*1.1);camera.lookAt(look);camera.updateMatrixWorld(true);
  return camera.position.distanceTo(target);
 }
 return {update,reset(){initialized=false;},zoom(delta){distance=T.MathUtils.clamp(distance+delta,2.5,10);},get distance(){return distance;}};
}
return {create};
});
