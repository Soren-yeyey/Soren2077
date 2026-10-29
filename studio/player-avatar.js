/* Reuse the authored skinned operative and its walk cycle for the player. */
(function(root,factory){const api=factory();root.CityPlayerAvatar=api;if(typeof module==='object')module.exports=api;})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
function cloneRig(source){
 const clone=source.clone(true),copies=new Map(),originals=new Map();
 function pair(a,b){copies.set(a,b);originals.set(b,a);a.children.forEach((child,i)=>pair(child,b.children[i]));}pair(source,clone);
 clone.traverse(o=>{if(!o.isSkinnedMesh)return;const original=originals.get(o);o.skeleton=original.skeleton.clone();o.bindMatrix.copy(original.bindMatrix);o.skeleton.bones=original.skeleton.bones.map(b=>copies.get(b));o.bind(o.skeleton,o.bindMatrix);});
 return clone;
}
function restClip(T,clip){
 const tracks=clip.tracks.map(track=>{
  const width=track.getValueSize(),values=track.values,n=values.length/width;let average;
  if(width===4&&track.ValueTypeName==='quaternion'){
   const q=new T.Quaternion().fromArray(values);for(let i=1;i<n;i++)q.slerp(new T.Quaternion().fromArray(values,i*4),1/(i+1));average=q.toArray();
  }else{average=Array(width).fill(0);for(let i=0;i<n;i++)for(let k=0;k<width;k++)average[k]+=values[i*width+k]/n;}
  return new track.constructor(track.name,[0,1],[...average,...average]);
 });return new T.AnimationClip('source-cycle-rest',1,tracks);
}
function create(T,gltf,height=1.78){
 const model=cloneRig(gltf.scene),root=new T.Group();root.name='controlled-operative';
 const bounds=new T.Box3().setFromObject(model),size=bounds.getSize(new T.Vector3()),centre=bounds.getCenter(new T.Vector3()),scale=height/size.y;
 model.position.set(-centre.x*scale,-bounds.min.y*scale,-centre.z*scale);model.scale.setScalar(scale);
 const forward=new T.Group();forward.add(model);root.add(forward);
 const shadow=new T.Mesh(new T.PlaneGeometry(3,3),new T.ShadowMaterial({opacity:.28,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.012;shadow.receiveShadow=true;root.add(shadow);
 model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}});
 const mixer=new T.AnimationMixer(model),clip=gltf.animations?.[0];let walk=null,idle=null,blend=0;
 if(clip){walk=mixer.clipAction(clip).play();idle=mixer.clipAction(restClip(T,clip)).play();walk.setEffectiveWeight(0);idle.setEffectiveWeight(1);mixer.update(0);}
 // Read the actual rig's toe direction instead of assuming its imported forward axis.
 root.updateMatrixWorld(true);const facing=new T.Vector3();
 for(const side of ['L','R']){const foot=model.getObjectByName(side+'_Foot'),toe=model.getObjectByName(side+'_ToeBase');if(foot&&toe)facing.add(toe.getWorldPosition(new T.Vector3()).sub(foot.getWorldPosition(new T.Vector3())));}
 if(facing.x*facing.x+facing.z*facing.z>.00001)forward.rotation.y=Math.PI-Math.atan2(facing.x,facing.z);
 root.userData.forwardCorrection=forward.rotation.y;
 function update(dt,speed,heading){
  if(Number.isFinite(heading)){const delta=Math.atan2(Math.sin(heading-root.rotation.y),Math.cos(heading-root.rotation.y));root.rotation.y+=delta*(1-Math.exp(-16*dt));}
  blend=T.MathUtils.damp(blend,speed>.12?1:0,10,dt);
  if(walk){walk.setEffectiveWeight(blend);idle.setEffectiveWeight(1-blend);walk.setEffectiveTimeScale(T.MathUtils.clamp(speed/2.1,.55,2.3));mixer.update(dt);}
  root.userData.moving=speed>.12;root.userData.clip=speed>.12?(speed>4.8?'run':'walk'):'idle';
 }
 function dispose(){mixer.stopAllAction();mixer.uncacheRoot(model);shadow.geometry.dispose();shadow.material.dispose();}
 return {root,model,mixer,update,dispose};
}
return {create,cloneRig};
});
