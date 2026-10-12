(function(root){
'use strict';
function random(seed){let n=seed>>>0;return()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296);}
function generate(config){
 const out=[];for(const [zi,zone] of config.zones.entries()){
  const r=random(config.seed+zi*719),pool=zone.theme==='market'?['workshop','commercial','advert']:zone.theme==='tower'?['orion','central','kael']:['nc77','commercial','workshop'];
  for(let row=0;row<3;row++)for(const side of [-1,1])out.push({id:zone.id+'-'+row+'-'+side,zone:zone.id,asset:pool[Math.floor(r()*pool.length)],x:side*20,z:zone.center-31+row*31,rotation:side<0?Math.PI/2:-Math.PI/2,scale:1});
 }
 out[0].asset='workshop';const landmark=out.find(p=>p.id==='tower-1--1');if(landmark)landmark.asset='central';return {version:1,seed:config.seed,placements:out};
}
function footprint(p,registry){const a=registry.find(x=>x.id===p.asset);if(!a)throw Error('未知模型');const s=a.scale*p.scale,c=Math.abs(Math.cos(p.rotation)),n=Math.abs(Math.sin(p.rotation));return{minX:p.x-(a.footprint[0]*c+a.footprint[1]*n)*s/2,maxX:p.x+(a.footprint[0]*c+a.footprint[1]*n)*s/2,minZ:p.z-(a.footprint[0]*n+a.footprint[1]*c)*s/2,maxZ:p.z+(a.footprint[0]*n+a.footprint[1]*c)*s/2};}
function overlap(a,b,gap=.4){return a.minX<b.maxX+gap&&a.maxX>b.minX-gap&&a.minZ<b.maxZ+gap&&a.maxZ>b.minZ-gap;}
function validate(layout,config,registry){
 if(!layout||layout.version!==1||!Number.isSafeInteger(layout.seed)||!Array.isArray(layout.placements)||layout.placements.length<1||layout.placements.length>100)throw Error('布局须包含 1 至 100 栋建筑');
 const ids=new Set(),boxes=[];
 for(const p of layout.placements){
  if(typeof p.id!=='string'||p.id.length>80||ids.has(p.id))throw Error('建筑编号重复或无效');ids.add(p.id);
  if(![p.x,p.z,p.rotation,p.scale].every(Number.isFinite)||p.scale<.5||p.scale>1.4)throw Error('位置或比例无效');
  const zone=config.zones.find(z=>z.id===p.zone);if(!zone)throw Error('分区不存在');
  const b=footprint(p,registry);if(b.minX< -45||b.maxX>45||!(b.maxX< -10||b.minX>10)||b.minZ<zone.center-47.5||b.maxZ>zone.center+47.5)throw Error('建筑越过地块边界或占用道路');
  if(boxes.some(x=>overlap(x,b)))throw Error('建筑之间需要留出间距');boxes.push(b);
 }return true;
}
function toLocal(x,z,p,s=1){const dx=x-p.x,dz=z-p.z,c=Math.cos(p.rotation),n=Math.sin(p.rotation);return{x:(c*dx-n*dz)/s,z:(n*dx+c*dz)/s};}
function toWorld(x,z,p,s=1){const c=Math.cos(p.rotation),n=Math.sin(p.rotation);return{x:p.x+(c*x+n*z)*s,z:p.z+(-n*x+c*z)*s};}
function hits(x,z,b,r=.36){
 if(b.halfX!==undefined){const p=toLocal(x,z,{x:b.x,z:b.z,rotation:b.rotation||0});const dx=Math.max(Math.abs(p.x)-b.halfX,0),dz=Math.max(Math.abs(p.z)-b.halfZ,0);return dx*dx+dz*dz<r*r;}
 return x>b.minX-r&&x<b.maxX+r&&z>b.minZ-r&&z<b.maxZ+r;
}
function workshopBoxes(p,definition,s){return definition.boxes.map(b=>({...toWorld(b.x,b.z,p,s),halfX:b.halfX*s,halfZ:b.halfZ*s,rotation:p.rotation}));}
function blocked(x,z,boxes,r=.36){return x< -44.4+r||x>44.4-r||z< -143+r||z>143-r||boxes.some(b=>hits(x,z,b,r));}
function move(p,dx,dz,boxes){let{x,z}=p;const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.15));for(let i=0;i<steps;i++){if(!blocked(x+dx/steps,z,boxes))x+=dx/steps;if(!blocked(x,z+dz/steps,boxes))z+=dz/steps;}return{x,z};}
// Feet use world height, so stepping onto a raised shop floor cannot sink the player.
function jumpStep(state,dt,ground,ceiling=Infinity,request=false){
 let {feet=ground,velocity=0,grounded=true}=state||{};
 if(grounded){feet=ground;velocity=0;if(request){velocity=5;grounded=false;}}
 const steps=Math.max(1,Math.ceil(Math.min(dt,.1)/(1/120))),h=Math.min(dt,.1)/steps;
 for(let i=0;i<steps&&!grounded;i++){
  feet+=velocity*h-8*h*h;velocity-=16*h;
  const limit=Math.max(ground,ceiling-1.9);
  if(feet>limit){feet=limit;velocity=Math.min(velocity,0);}
  if(feet<=ground&&velocity<=0){feet=ground;velocity=0;grounded=true;}
 }
 return{feet,velocity,grounded};
}
function zoneAt(z,config){return config.zones.reduce((a,b)=>Math.abs(a.center-z)<Math.abs(b.center-z)?a:b);}
const api={random,generate,footprint,validate,overlap,blocked,move,zoneAt,toLocal,toWorld,hits,workshopBoxes,jumpStep};root.CityCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

