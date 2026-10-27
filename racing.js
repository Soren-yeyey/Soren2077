/* Booze sky circuit: Blender prefabs, magnetic-drive visuals, deterministic arcade handling. */
(()=>{'use strict';
const T=THREE,$=id=>document.getElementById(id),host=$('race-world');
const track=BoozeRacing.makeTrack(),driver=new BoozeRacing.Driver(track);
const scene=new T.Scene();scene.background=new T.Color(0x0c1830);scene.fog=new T.FogExp2(0x6c91b8,.00035);
T.ColorManagement.legacyMode=false;
const renderer=new T.WebGLRenderer({antialias:false,powerPreference:'high-performance'});
renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.18;renderer.setPixelRatio(Math.min(devicePixelRatio,1));
renderer.setSize(innerWidth,innerHeight);host.appendChild(renderer.domElement);
// Count the whole frame, including every post-processing pass in high quality.
renderer.info.autoReset=false;
const camera=new T.PerspectiveCamera(63,innerWidth/innerHeight,.25,5500);
scene.add(new T.HemisphereLight(0xb5d8fb,0x243352,1.25));
const moon=new T.DirectionalLight(0xa6d5fc,1.3);moon.position.set(-300,700,150);scene.add(moon);
const magenta=new T.DirectionalLight(0xdf83ca,.8);magenta.position.set(600,200,-300);scene.add(magenta);
const clock=new T.Clock(),keys=new Set();let ready=false,active=false,paused=false,time=0,camMode=0;
let perfSeconds=0,perfFrames=0,perfCpuMs=0,hudDirty=true;
// Explicit diagnostic URL only: compare an empty framebuffer against the full scene.
const diagnosticMode=new URLSearchParams(location.search).get('diagnostics');
host.dataset.renderMode=diagnosticMode==='empty'?'empty':'scene';
if(diagnosticMode){let lastTick=performance.now();setInterval(()=>{
  const now=performance.now();host.dataset.timerMs=(now-lastTick).toFixed(2);lastTick=now;
},250);}
let car,kit,quality=false,lastLap=0,previousInput={},frame=0,cruise=false;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const materials={};
function material(name,color,metal=.4,rough=.4,glow=0){
  const m=new T.MeshStandardMaterial({color,metalness:metal,roughness:rough,
    emissive:glow?color:0x000000,emissiveIntensity:glow});materials[name]=m;return m;
}
const steel=material('steel',0x182838,.75,.33),edge=material('edge',0x364c60,.7,.28);
const cyan=material('cyan',0x44dce9,.3,.25,2.3),pink=material('pink',0xee368f,.2,.3,2);
const amber=material('amber',0xe8be82,.2,.35,1.5);
function canvasMap(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const tex=new T.CanvasTexture(c);tex.encoding=T.sRGBEncoding;return tex;}
const roadTexture=canvasMap(512,512,(c,w,h)=>{
  c.fillStyle='#182333';c.fillRect(0,0,w,h);let seed=77;
  const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<19000;i++){const a=.025+rnd()*.08;c.fillStyle=`rgba(130,170,190,${a})`;c.fillRect(rnd()*w,rnd()*h,1+rnd()*3,1);}
  c.fillStyle='#70a0b31a';for(let y=0;y<h;y+=128)c.fillRect(0,y,w,2);
  c.fillStyle='#95b7bd';c.fillRect(254,20,4,40);c.fillRect(254,276,4,40);
  for(const x of [12,498]){c.fillStyle='#324755';c.fillRect(x,0,3,h);}
});
roadTexture.wrapS=roadTexture.wrapT=T.RepeatWrapping;roadTexture.anisotropy=4;
const roadMat=new T.MeshStandardMaterial({map:roadTexture,color:0x8596a9,metalness:.62,roughness:.29});
const batches=new Map(),boxGeometry=new T.BoxGeometry(1,1,1),dummy=new T.Object3D();
function box(x,y,z,w,h,d,mat=steel,yaw=0){
  if(!batches.has(mat))batches.set(mat,[]);batches.get(mat).push({x,y,z,w,h,d,yaw});
}
function flush(){for(const [mat,list]of batches){const inst=new T.InstancedMesh(boxGeometry,mat,list.length);
  list.forEach((v,i)=>{dummy.position.set(v.x,v.y,v.z);dummy.scale.set(v.w,v.h,v.d);dummy.rotation.set(0,v.yaw,0);dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);});
  inst.instanceMatrix.needsUpdate=true;scene.add(inst);}batches.clear();}
function ribbon(offset,width,material,height=0){
  const n=1100,positions=[],uvs=[],indices=[];
  for(let i=0;i<=n;i++){
    const p=track.sample(i===n?0:track.length*i/n);
    for(const sign of [-1,1]){const d=offset+sign*width/2;positions.push(p.x+p.nx*d,p.y+height,p.z+p.nz*d);uvs.push((sign+1)/2,i/n*track.length/12);}
    if(i<n){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();
  const mesh=new T.Mesh(g,material);scene.add(mesh);return mesh;
}
ribbon(0,24,roadMat);ribbon(-12.2,.22,cyan,.12);ribbon(12.2,.22,pink,.12);
// Watertight deck side walls and underside; each strip occupies a separate surface.
for(const side of [-1,1]){
  const positions=[],indices=[],n=1100;
  for(let i=0;i<=n;i++){const p=track.sample(i===n?0:track.length*i/n);
    for(const y of [-1.9,-.03])positions.push(p.x+p.nx*side*12.6,p.y+y,p.z+p.nz*side*12.6);
    if(i<n){const a=i*2;if(side===1)indices.push(a,a+1,a+2,a+1,a+3,a+2);else indices.push(a,a+2,a+1,a+1,a+2,a+3);}}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();scene.add(new T.Mesh(g,edge));
}
const undersideMat=steel.clone();undersideMat.side=T.DoubleSide;ribbon(0,25.2,undersideMat,-1.9);
for(let s=0;s<track.length;s+=4){const p=track.sample(s),yaw=Math.atan2(p.tx,p.tz);
  for(const side of [-1,1]){
    const x=p.x+p.nx*side*12.4,z=p.z+p.nz*side*12.4;
    box(x,p.y+.68,z,.38,1.36,4.12,edge,yaw);
    box(x,p.y+1.37,z,.42,.13,4.16,side<0?cyan:pink,yaw);
    if(s%16<4)box(x,p.y-3,z,1,3,2,steel,yaw);
  }
  if(s%20<4)box(p.x,p.y-1.45,p.z,25.2,.6,.65,steel,yaw);
}
// The pit is an extension of the starting road, never a floating colliding slab.
const start=track.sample(0),pit=new T.Group();pit.position.set(start.x,start.y,start.z);
pit.rotation.y=Math.atan2(-start.tx,-start.tz);scene.add(pit);
function localBox(parent,x,y,z,w,h,d,mat){const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);parent.add(m);return m;}
localBox(pit,-24,-.95,0,25,1.8,85,steel);
localBox(pit,-24,.04,0,24,.08,84,edge);
for(const z of [-34,0,34]){localBox(pit,-33,7,z,.5,14,.5,edge);localBox(pit,-24,14,z,19,.5,.6,steel);localBox(pit,-24,13.7,z,18,.12,.3,cyan);}

function textSprite(text,color='#b8f8ff',width=12,height=2){
  const tex=canvasMap(1024,128,(c,w,h)=>{c.fillStyle='#091521';c.fillRect(0,0,w,h);c.strokeStyle=color;c.lineWidth=3;c.strokeRect(3,3,w-6,h-6);c.fillStyle=color;c.font='bold 65px Microsoft YaHei';c.textAlign='center';c.textBaseline='middle';c.fillText(text,w/2,h/2);});
  const m=new T.MeshBasicMaterial({map:tex,side:T.DoubleSide});return new T.Mesh(new T.PlaneGeometry(width,height),m);
}
const title=textSprite('BOOZE 赛车城','#c9fbff',22,2.75);title.position.set(-24,11,-34);pit.add(title);
// Segmented magnetic gates identify check points without obstructing the road.
function gate(s,color,finish=false){const p=track.sample(s),g=new T.Group();g.position.set(p.x,p.y,p.z);g.rotation.y=Math.atan2(-p.tx,-p.tz);scene.add(g);
  const arch=new T.Mesh(new T.TorusGeometry(18,.7,5,64,Math.PI),edge);arch.position.y=.5;g.add(arch);
  const inside=new T.Mesh(new T.TorusGeometry(17.3,.14,4,64,Math.PI),color);inside.position.y=.5;g.add(inside);
  for(const x of [-18,18])localBox(g,x,.4,0,3,2,5,steel);
  if(finish){const label=textSprite('天穹环线 · 出发','#aceefa',14,1.7);label.position.set(0,14,-.85);g.add(label);}
  return g;
}
gate(0,cyan,true);for(let i=1;i<=3;i++)gate(track.length*i/4,i%2?pink:cyan);

// Geometry and layout are authored and checked in Blender before importing.
const environment=RacingEnvironment.create(T,scene,renderer);
// Inspect the complete sky and lower environment without changing vehicle controls.
let orbitYaw=0,orbitPitch=0,orbitZoom=1,orbitDrag=null;
renderer.domElement.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;orbitDrag={x:e.clientX,y:e.clientY};
  renderer.domElement.setPointerCapture(e.pointerId);host.focus();
});
renderer.domElement.addEventListener('pointermove',e=>{
  if(!orbitDrag)return;
  orbitYaw-=(e.clientX-orbitDrag.x)*.006;
  orbitPitch=T.MathUtils.clamp(orbitPitch+(e.clientY-orbitDrag.y)*.005,-.35,1.12);
  orbitDrag={x:e.clientX,y:e.clientY};
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])renderer.domElement.addEventListener(type,()=>orbitDrag=null);
addEventListener('blur',()=>orbitDrag=null);
renderer.domElement.addEventListener('wheel',e=>{
  e.preventDefault();orbitZoom=T.MathUtils.clamp(orbitZoom*Math.exp(e.deltaY*.0012),.8,8);
},{passive:false});

let composer=null;
function ensureComposer(){
if(composer)return composer;
composer=new T.EffectComposer(renderer);composer.addPass(new T.RenderPass(scene,camera));
const bloom=new T.UnrealBloomPass(new T.Vector2(innerWidth,innerHeight),.33,.45,1.15);composer.addPass(bloom);
const grade=new T.ShaderPass({uniforms:{tDiffuse:{value:null}},vertexShader:'varying vec2 uv0;void main(){uv0=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
fragmentShader:'uniform sampler2D tDiffuse;varying vec2 uv0;void main(){vec3 c=texture2D(tDiffuse,uv0).rgb*1.08;c=(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14);gl_FragColor=vec4(pow(clamp(c,0.,1.),vec3(1./2.2)),1.);}'});grade.material.toneMapped=false;composer.addPass(grade);
return composer;
}
function toast(t){$('race-toast').textContent=t;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('race-toast').textContent='',2600);}
function getModel(url){return new Promise((resolve,reject)=>new T.GLTFLoader().load(url,resolve,undefined,reject));}
const ai=[],crew=[],rotors=[],steering=[],sparkles=[],buildings=[];
const portrait=new T.TextureLoader().load('images/booze-portrait.png');portrait.encoding=T.sRGBEncoding;
const portraitMat=new T.MeshStandardMaterial({map:portrait,emissiveMap:portrait,
  emissive:0xffffff,emissiveIntensity:.6,roughness:.4,metalness:.1});
// Distant city is instanced; only the nearby modular landmarks use individual prefabs.
const facade=canvasMap(128,256,(c,w,h)=>{
  c.fillStyle='#091526';c.fillRect(0,0,w,h);let state=901;
  for(let y=3;y<h;y+=7)for(let x=3;x<w;x+=8){state=(Math.imul(state,1664525)+1013904223)>>>0;
    const k=state/4294967296;c.fillStyle=k<.44?'#11283b':k<.8?'#486a7c':k<.96?'#d0b089':'#47d7f5';c.fillRect(x,y,4,3);}
});
const farMat=new T.MeshStandardMaterial({map:facade,emissiveMap:facade,
  emissive:0x89b7de,emissiveIntensity:.7,color:0x70899a,roughness:.65,metalness:.35});
for(let i=0;i<160;i++){
  const angle=i*2.399963,radius=870+(i%7)*60;
  const x=120+Math.cos(angle)*radius,z=Math.sin(angle)*radius,h=110+(i*37)%260;
  box(x,65+h/2,z,22+(i%4)*7,h,22+(i%5)*5,farMat);
  if(i%3===0)box(x,65+h+8,z,.5,16,.5,cyan);
}
const exhaustMaterial=new T.MeshBasicMaterial({color:0x52edff,transparent:true,opacity:.65,depthWrite:false,side:T.DoubleSide});
let exhaust=[];
function fitScene(gltf){kit=gltf.scene;
  const prefabs=Object.fromEntries(kit.children.map(c=>[c.name,c]));
  const displays={
    'b03-portrait-tower':[[0,50,9.5,12,58]],
    'b01-commercial-island':[[14,24,20.8,18,29]],
    'b05-bridge-tower':[[-27,55,11.8,12,35],[27,55,11.8,12,35]],
    'b06-track-hub':[[-12,41,22.8,12,27],[9,45,22.8,13,24]]
  };
  for(const [name,panels]of Object.entries(displays))if(prefabs[name])for(const [x,y,z,w,h]of panels){
    const panel=new T.Mesh(new T.PlaneGeometry(w,h),portraitMat);panel.position.set(x,y,z);prefabs[name].add(panel);
  }
  const names=['b01-commercial-island','b03-portrait-tower','b05-bridge-tower','b06-track-hub','b14-far-cluster'];
  // Each block is placed by its actual footprint beyond the track clearance envelope.
  for(let i=0;i<48;i++){
    const p=track.sample(i/48*track.length+35),side=i%2?-1:1,name=names[i%names.length],source=prefabs[name];
    if(!source)throw new Error('缺少建筑组件 '+name);
    const o=source.clone(true),scale=name==='b14-far-cluster'?2.2:1.2+(i%4)*.15;
    const bounds=new T.Box3().setFromObject(o),size=bounds.getSize(new T.Vector3());
    const radius=Math.hypot(size.x,size.z)*scale/2;
    const offset=radius+34+(i%3)*12;
    o.scale.setScalar(scale);o.position.set(p.x+p.nx*side*offset,p.y-32-(i%4)*7,p.z+p.nz*side*offset);
    o.rotation.y=Math.atan2(-p.nx*side,-p.nz*side);
    // Reject a candidate whose footprint approaches any other portion of the track.
    if(track.nearest(o.position.x,o.position.z).distance<radius+25)continue;
    scene.add(o);buildings.push(o);
    if(i%5===0){const inv=source.clone(true);inv.scale.setScalar(scale*.9);inv.rotation.x=Math.PI;
      inv.position.set(o.position.x,p.y+200,o.position.z);scene.add(inv);buildings.push(inv);}
  }
  const npc=prefabs['pit-crew-proxy'];
  if(npc)for(let i=0;i<7;i++){const o=npc.clone(true);o.position.set(-25+(i%2)*4,.10,-27+i*8);o.rotation.y=.8;pit.add(o);crew.push(o);}
  host.dataset.buildings=String(buildings.length);host.dataset.crew=String(crew.length);
  host.dataset.farTowers='160';
}
function positionCar(o,s,offset=0){const p=track.sample(s);o.position.set(p.x+p.nx*offset,p.y+.08,p.z+p.nz*offset);o.rotation.y=Math.atan2(-p.tx,-p.tz);return p;}
function attachVehicle(gltf){
  car=new T.Group();car.name='yuheng-player';scene.add(car);const visual=gltf.scene;car.add(visual);
  visual.traverse(o=>{if(/-rotor$/.test(o.name))rotors.push(o);if(/front-.*-steer/.test(o.name))steering.push(o);});
  for(const side of [-1,1]){const flame=new T.Mesh(new T.ConeGeometry(.15,1,8,1,true),exhaustMaterial);flame.rotation.x=-Math.PI/2;flame.position.set(side*.35,.8,2.3);car.add(flame);exhaust.push(flame);}
  for(let i=0;i<3;i++){const o=visual.clone(true);scene.add(o);ai.push({object:o,s:100+i*55,speed:24+i*2,lane:(i-1)*4});}
  positionCar(car,8);camera.position.copy(car.position).add(new T.Vector3(0,5,11));
  host.dataset.vehicle='ready';host.dataset.rotors=String(rotors.length);
}
Promise.all([getModel('models/booze-city-kit.glb'),getModel('models/yuheng-drive.glb'),environment.load()]).then(([city,vehicle])=>{
  fitScene(city);attachVehicle(vehicle);flush();ready=true;
  $('start').disabled=false;$('start').textContent='进入驾驶 ↗';$('load-status').textContent='W 前进 · A D 转向 · 空格刹车';
  $('track-length').textContent=(track.length/1000).toFixed(2)+' 公里';
  host.dataset.ready='true';host.dataset.trackLength=track.length.toFixed(1);
  console.info('BOOZE_READY',{trackMeters:track.length,buildings:buildings.length,pitCrew:crew.length,rotors:rotors.length});
}).catch(error=>{console.error('BOOZE_LOAD_FAILED',error);$('race-error').hidden=false;});

function setCruise(v){cruise=v;$('cruise').setAttribute('aria-pressed',String(v));$('cruise').textContent=v?'巡航油门 · 开':'巡航油门';}
function setPaused(v,reason='manual'){paused=v;keys.clear();if(v)setCruise(false);hudDirty=true;host.dataset.pauseReason=v?reason:'none';$('paused').hidden=!v;$('pause').textContent=v?'继续':'暂停';clock.getDelta();}
function startRace(){if(!ready)return;active=true;setPaused(false);$('race-start').hidden=true;$('race-hud').hidden=false;host.focus();toast('磁驱上线 · 拖动鼠标环顾天空与云海');}
$('start').onclick=startRace;$('pause').onclick=()=>{if(active)setPaused(!paused);};$('resume').onclick=()=>setPaused(false);
$('restart').onclick=()=>{driver.reset();setCruise(false);setPaused(false);toast('已返回发车位');};
$('cruise').onclick=()=>{if(active&&!paused){setCruise(!cruise);host.focus();}};
$('camera').onclick=()=>{camMode=(camMode+1)%3;orbitYaw=0;orbitPitch=0;orbitZoom=1;toast(['追逐视角','近车视角','俯瞰视角'][camMode]);};
$('quality').onclick=()=>{quality=!quality;renderer.setPixelRatio(Math.min(devicePixelRatio,quality?1.6:1));if(quality)ensureComposer();if(composer)composer.setPixelRatio(renderer.getPixelRatio());$('quality').textContent=quality?'画质 · 高':'画质 · 均衡';resize();};
addEventListener('keydown',e=>{
  if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  if(e.repeat){keys.add(e.code);return;}
  if(e.code==='Escape'||e.code==='KeyP'){if(active)setPaused(!paused);return;}
  if(['Space','KeyS','ArrowDown','KeyR'].includes(e.code))setCruise(false);
  if(e.code==='KeyR'&&active){driver.reset();hudDirty=true;toast('已返回发车位');}
  if(e.code==='KeyC')$('camera').click();keys.add(e.code);
});addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('blur',()=>{keys.clear();if(active)setPaused(true,'blur');});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)setPaused(true,'hidden');});
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);if(composer)composer.setSize(innerWidth,innerHeight);}
addEventListener('resize',resize);
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();setPaused(true);$('race-error').hidden=false;});
function fmt(t){const m=Math.floor(t/60),s=(t%60).toFixed(2).padStart(5,'0');return String(m).padStart(2,'0')+':'+s;}
const map=$('race-map'),ctx=map.getContext('2d'),mapBase=document.createElement('canvas');
mapBase.width=map.width;mapBase.height=map.height;
const mapContext=mapBase.getContext('2d'),sx=.17,sz=.17,ox=86,oy=83;
// The track never changes during a race. Rasterize its 1,601 points once.
mapContext.lineWidth=5;mapContext.strokeStyle='#142e49';mapContext.beginPath();
track.raw.forEach((p,i)=>{const x=ox+p.x*sx,y=oy+p.z*sz;i?mapContext.lineTo(x,y):mapContext.moveTo(x,y);});
mapContext.closePath();mapContext.stroke();mapContext.lineWidth=1.5;mapContext.strokeStyle='#679faf';mapContext.stroke();
function miniMap(){
  ctx.clearRect(0,0,map.width,map.height);ctx.drawImage(mapBase,0,0);
  for(const a of ai){const p=track.sample(a.s);ctx.fillStyle='#ee6fae';ctx.fillRect(ox+p.x*sx-1,oy+p.z*sz-1,3,3);}
  ctx.save();ctx.translate(ox+driver.x*sx,oy+driver.z*sz);ctx.rotate(-driver.yaw);ctx.fillStyle='#a8ffff';ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(3,4);ctx.lineTo(0,2);ctx.lineTo(-3,4);ctx.closePath();ctx.fill();ctx.restore();
}
document.addEventListener('visibilitychange',()=>{perfSeconds=0;perfFrames=0;perfCpuMs=0;clock.getDelta();});
function animate(){requestAnimationFrame(animate);const realDelta=clock.getDelta();if(document.hidden)return;
  const timing=BoozeRacing.frameTiming(realDelta,active,paused),dt=timing.delta;
  if(timing.suspend){setPaused(true,'frame-gap');toast('画面长时间停顿，已暂停驾驶');}
  const cpuStart=performance.now();time+=dt;frame++;
  if(car){
    const input={forward:cruise||keys.has('KeyW')||keys.has('ArrowUp'),reverse:keys.has('KeyS')||keys.has('ArrowDown'),
      left:keys.has('KeyA')||keys.has('ArrowLeft'),right:keys.has('KeyD')||keys.has('ArrowRight'),
      brake:keys.has('Space'),drift:keys.has('ControlLeft')||keys.has('ControlRight'),
      boost:keys.has('ShiftLeft')||keys.has('ShiftRight'),pause:paused||!active};
    BoozeRacing.advanceRace(driver,ai,input,dt);previousInput=input;
    const p=track.nearest(driver.x,driver.z);
    car.position.set(driver.x,driver.y+.08,driver.z);car.rotation.order='YXZ';car.rotation.y=driver.yaw;
    car.rotation.x=Math.atan(p.slope);car.rotation.z=-driver.steer*Math.min(Math.abs(driver.speed)*.002,.055);
    steering.forEach(o=>o.rotation.y=driver.steer*.18);
    if(!paused){rotors.forEach(o=>o.rotateY(driver.speed*dt*.7));}
    const boosting=input.boost&&driver.boost>.02&&driver.speed>8&&!paused;
    exhaust.forEach(o=>{o.visible=Math.abs(driver.speed)>1;o.scale.set(1,boosting?3:Math.max(.1,Math.abs(driver.speed)*.02),1);});
    document.body.classList.toggle('boosting',boosting&&!reduced);document.body.classList.toggle('hit',driver.wall>.3&&!reduced);
    ai.forEach(a=>{const p=positionCar(a.object,a.s,a.lane);a.object.rotation.x=Math.atan(p.slope);});
    const yaw=driver.yaw,dist=(camMode===1?7:camMode===2?20:11)*orbitZoom,height=(camMode===1?3:camMode===2?15:5)*orbitZoom;
    const viewYaw=yaw+orbitYaw,flatDistance=dist*Math.cos(orbitPitch);
    const camTarget=new T.Vector3(driver.x+Math.sin(viewYaw)*flatDistance,driver.y+height+Math.sin(orbitPitch)*dist,driver.z+Math.cos(viewYaw)*flatDistance);
    const orbiting=Math.abs(orbitYaw)+Math.abs(orbitPitch)>.001;
    const look=new T.Vector3(driver.x-(orbiting?0:Math.sin(yaw)*9),driver.y+1.4,driver.z-(orbiting?0:Math.cos(yaw)*9));
    camera.position.lerp(camTarget,1-Math.exp(-dt*5));camera.lookAt(look);
    camera.fov=T.MathUtils.damp(camera.fov,reduced?63:63+Math.max(driver.speed,0)*.16,4,dt);camera.updateProjectionMatrix();
    if(hudDirty||frame%4===0){hudDirty=false;$('speed').textContent=String(Math.round(Math.abs(driver.speed)*3.6)).padStart(3,'0');
      $('timer').textContent=fmt(driver.lapTime);$('lap').textContent=String(driver.lap).padStart(2,'0');
      $('checkpoint').textContent='检查点 '+driver.checkpoint+' / 3';$('boost').style.transform=`scaleX(${driver.boost})`;
      $('drive-state').textContent=paused?'已暂停':driver.wall>.2?'护栏接触':input.brake?'制动':driver.speed<-.5?'倒车':boosting?'氮气推进':input.drift&&Math.abs(driver.speed)>3?'磁场漂移':'磁驱在线';
      host.dataset.speed=driver.speed.toFixed(3);host.dataset.position=`${driver.x.toFixed(2)},${driver.y.toFixed(2)},${driver.z.toFixed(2)}`;
      host.dataset.paused=String(paused);host.dataset.checkpoint=String(driver.checkpoint);miniMap();}
    if(driver.completed>lastLap){lastLap=driver.completed;$('best').textContent='最佳 '+fmt(driver.best);toast('完成一圈 · '+fmt(driver.best));}
  }else{const p=track.sample(8);camera.position.set(p.x+12,p.y+6,p.z+19);camera.lookAt(p.x,p.y+2,p.z-10);}
  environment.update(time,camera);renderer.info.reset();
  if(diagnosticMode==='empty')renderer.clear();else if(quality)composer.render();else renderer.render(scene,camera);
  perfSeconds+=realDelta;perfFrames++;perfCpuMs+=performance.now()-cpuStart;
  if(perfSeconds>=2){host.dataset.fps=(perfFrames/perfSeconds).toFixed(1);
    host.dataset.drawCalls=String(renderer.info.render.calls);host.dataset.triangles=String(renderer.info.render.triangles);
    // CPU submission time is not a GPU timer; retain wall FPS to expose throttling.
    host.dataset.cpuMs=(perfCpuMs/perfFrames).toFixed(2);host.dataset.frameMs=(perfSeconds*1000/perfFrames).toFixed(2);
    host.dataset.pixelRatio=renderer.getPixelRatio().toFixed(2);host.dataset.quality=quality?'high':'balanced';
    host.dataset.postProcessing=String(quality);host.dataset.visibility=document.visibilityState;
    perfSeconds=0;perfFrames=0;perfCpuMs=0;}
}
animate();
})();
