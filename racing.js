/* Booze sky circuit: Blender prefabs, magnetic-drive visuals, deterministic arcade handling. */
(()=>{'use strict';
const T=THREE,$=id=>document.getElementById(id),host=$('race-world');
const track=BoozeRacing.makeTrack(),driver=new BoozeRacing.Driver(track);
const scene=new T.Scene();scene.background=new T.Color(0x09121e);scene.fog=new T.FogExp2(0x1a304b,.00038);
T.ColorManagement.legacyMode=false;
const renderer=new T.WebGLRenderer({antialias:false,powerPreference:'high-performance'});
renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.05;renderer.setPixelRatio(Math.min(devicePixelRatio,1));
renderer.setSize(innerWidth,innerHeight);host.appendChild(renderer.domElement);
const sceneAssets=CitySceneAssets.create(T,renderer,host);
// Count the whole frame, including every post-processing pass in high quality.
renderer.info.autoReset=false;
const camera=new T.PerspectiveCamera(63,innerWidth/innerHeight,.25,5500);
const daylight=CityDaylight.create(T,renderer,scene,{radius:4800,fog:.00028,sunPosition:[-300,700,150]});host.dataset.lighting='daylight';
const clock=new T.Clock(),keys=new Set();let ready=false,active=false,paused=false,time=0,camMode=3;
let perfSeconds=0,perfFrames=0,perfCpuMs=0,hudDirty=true;
// Explicit diagnostic URL only: compare an empty framebuffer against the full scene.
const diagnosticMode=new URLSearchParams(location.search).get('diagnostics');
host.dataset.renderMode=diagnosticMode==='empty'?'empty':'scene';
if(diagnosticMode){let lastTick=performance.now();setInterval(()=>{
  const now=performance.now();host.dataset.timerMs=(now-lastTick).toFixed(2);lastTick=now;
},250);}
let car,quality=true,lastLap=0,previousInput={},frame=0,cruise=false;
let phase='intro',countdown=3,runId=null,pendingResult=null,raceSound=null,soundEnabled=false;
function readProgress(){try{return CityProgress.read(localStorage);}catch(_){return CityProgress.createState();}}
let progress=readProgress();
host.dataset.phase=phase;
function showBest(){
  $('best').textContent=progress.race.best===null?'最佳 —':'最佳 '+fmt(progress.race.best);
  $('race-progress').textContent=progress.race.completed?'已完成 '+progress.race.completed+' 圈 · 最佳 '+fmt(progress.race.best)+' · 城市进度保留':'城市改造与委托进度保留，首次完赛解锁天穹纪念。';
}
showBest();
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const materials={};
function material(name,color,metal=.4,rough=.4,glow=0){
  const m=new T.MeshStandardMaterial({color,metalness:metal,roughness:rough,
    emissive:glow?color:0x000000,emissiveIntensity:glow});materials[name]=m;return m;
}
const steel=material('steel',0x182838,.75,.33),edge=material('edge',0x364c60,.7,.28);
const cyan=material('cyan',0x44dce9,.3,.25,2.3),pink=material('pink',0xee368f,.2,.3,2);
const amber=material('amber',0xe8be82,.2,.35,1.5);
// A single merged mesh keeps the driving direction readable without extra lights.
const arrowPositions=[];
for(let s=30;s<track.length;s+=68){
  const p=track.sample(s),point=(side,along)=>[p.x+p.nx*side+p.tx*along,p.y+.13+p.slope*along,p.z+p.nz*side+p.tz*along];
  for(const [side,along] of [[0,4],[-1.4,-2],[0,-.5],[0,4],[0,-.5],[1.4,-2]])arrowPositions.push(...point(side,along));
}
const arrowGeometry=new T.BufferGeometry();arrowGeometry.setAttribute('position',new T.Float32BufferAttribute(arrowPositions,3));
const routeArrows=new T.Mesh(arrowGeometry,new T.MeshBasicMaterial({color:0x6aebf3,side:T.DoubleSide,transparent:true,opacity:.65,depthWrite:false}));
routeArrows.name='race-route-arrows';scene.add(routeArrows);
// Neon edge strips: the reference circuit reads as two glowing rails around a dark
// deck, so each border gets a bright ribbon plus a wider dim halo. Both are single
// merged strips, not one mesh per sample, so the draw-call cost stays at four.
function neonEdge(offset,color,width,gain){
  const step=2.6,pos=[],index=[];let n=0;
  for(let s=0;s<=track.length;s+=step){
    const p=track.sample(s),cx=p.x+p.nx*offset,cz=p.z+p.nz*offset,y=p.y+.12;
    pos.push(cx+p.nx*width,y,cz+p.nz*width);
    pos.push(cx-p.nx*width,y,cz-p.nz*width);
    if(n>0){const a=(n-1)*2;index.push(a,a+1,a+2,a+1,a+3,a+2);}
    n++;
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  const material=new T.MeshBasicMaterial({color,transparent:true,opacity:.85,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending});
  material.color.multiplyScalar(gain||1);
  const mesh=new T.Mesh(geometry,material);mesh.name='race-edge-'+offset;mesh.frustumCulled=false;scene.add(mesh);
  return {mesh,v:index.length/3,sphere:geometry.boundingSphere};
}
for(const [offset,color] of [[-19.3,0x6ef2ff],[19.3,0xff4aa8]]){
  const halo=neonEdge(offset,color,1.3,1.5);      // soft shoulder around the line
  const core=neonEdge(offset,color,.4,2.2);       // hot core that feeds the bloom pass
  host.dataset.edgeStrips=String((Number(host.dataset.edgeStrips)||0)+2);
  host.dataset.edgeVertices=String(halo.v+core.v);
  host.dataset.edgeRadius=halo.sphere?halo.sphere.radius.toFixed(0):'none';
}
function canvasMap(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const tex=new T.CanvasTexture(c);tex.encoding=T.sRGBEncoding;return tex;}
const roadTexture=canvasMap(512,512,(c,w,h)=>{
  c.fillStyle='#596a77';c.fillRect(0,0,w,h);let seed=77;
  const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<19000;i++){const a=.025+rnd()*.08;c.fillStyle=`rgba(130,170,190,${a})`;c.fillRect(rnd()*w,rnd()*h,1+rnd()*3,1);}
  c.fillStyle='#70a0b31a';for(let y=0;y<h;y+=128)c.fillRect(0,y,w,2);
  c.fillStyle='#dce6e9';c.fillRect(254,20,4,40);c.fillRect(254,276,4,40);
  for(const x of [12,498]){c.fillStyle='#324755';c.fillRect(x,0,3,h);}
});
roadTexture.wrapS=roadTexture.wrapT=T.RepeatWrapping;roadTexture.anisotropy=4;
const roadMat=new T.MeshStandardMaterial({map:roadTexture,color:0xffffff,metalness:.22,roughness:.48});
// Road-local light streaks follow every bend. Broken longitudinal ripples keep
// the wet surface legible without reflecting an unrelated static sky picture.
roadMat.onBeforeCompile=shader=>{
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
    float wetHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
    float fine=wetHash(floor(vec2(vUv.x*420.,vUv.y*20.)));
    float ripple=.55+.45*sin(vUv.y*39.+sin(vUv.x*91.)*2.);
    float blue=exp(-pow((vUv.x-.075)/.115,2.));
    float rose=exp(-pow((vUv.x-.92)/.13,2.));
    float interior=pow(max(0.,sin(vUv.x*39.+sin(vUv.y*.63)*2.)),12.)*.14;
    vec3 reflected=vec3(.015,.45,.90)*(blue+interior)+vec3(.90,.008,.22)*rose;
    totalEmissiveRadiance+=reflected*(.18+fine*.8)*ripple*.24;`);
};
roadMat.customProgramCacheKey=()=> 'wet-neon-road-v3';
// Broad blue and magenta light sources give the assembled metallic car readable reflections.
const reflectionSource=canvasMap(1024,512,(c,w,h)=>{
  const gradient=c.createLinearGradient(0,0,0,h);gradient.addColorStop(0,'#213952');
  gradient.addColorStop(.47,'#8daec9');gradient.addColorStop(.53,'#17243d');gradient.addColorStop(1,'#080f20');
  c.fillStyle=gradient;c.fillRect(0,0,w,h);
  for(const [x,color]of [[50,'#7eeaff'],[380,'#f670bc'],[720,'#c4e7ff']]){
    c.fillStyle=color;c.fillRect(x,160,125,75);c.fillStyle='#e2eeff';c.fillRect(x+20,105,80,18);
  }
});
reflectionSource.mapping=T.EquirectangularReflectionMapping;
const reflectionGenerator=new T.PMREMGenerator(renderer);
const reflectionTarget=reflectionGenerator.fromEquirectangular(reflectionSource);
reflectionGenerator.dispose();reflectionSource.dispose();
roadMat.envMap=reflectionTarget.texture;roadMat.envMapIntensity=.55;
// Daylight environment stays active for city materials; the car retains its own softbox map.
// Checkpoint rings and the road infrastructure are part of the Blender scene.
// Geometry and layout are authored and checked in Blender before importing.
const environment=RacingEnvironment.create(T,scene,renderer,sceneAssets);
const importedWorld=RacingWorld.create(T,scene,renderer,roadMat,sceneAssets);
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
const bloom=new T.UnrealBloomPass(new T.Vector2(innerWidth,innerHeight),.55,.55,1.05);composer.addPass(bloom);
const grade=CityDaylight.grade(T,renderer,composer,bloom);grade.uniforms.exposure.value=1.08;bloom.strength=.14;bloom.threshold=1.4;
return composer;
}
function toast(t){$('race-toast').textContent=t;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('race-toast').textContent='',2600);}
function getModel(url){return sceneAssets.load(url);}
const ai=[],rotors=[],wheels=[],steering=[];
const exhaustMaterial=new T.MeshBasicMaterial({color:0x52edff,transparent:true,opacity:.65,depthWrite:false,side:T.DoubleSide});
let exhaust=[];
// These are existing owned models; the four single-mesh Blender exports retain
// their authored textures and have no separately animated wheel objects.
const vehicleOptions={
 original:{label:'原有组装赛车',source:null},
 'blender-01':{label:'黑橙赛车',source:'models/race-car-01.glb',yaw:Math.PI/2},
 'blender-02':{label:'紫蓝赛车',source:'models/race-car-02.glb',yaw:-Math.PI/2},
 'blender-03':{label:'银白赛车',source:'models/race-car-03.glb',yaw:0},
 'blender-04':{label:'紫铜赛车',source:'models/race-car-04.glb',yaw:Math.PI/2},
 yuheng:{label:'玉衡',source:'models/yuheng-drive.glb',yaw:0},
 'red-assembled':{label:'红色组装赛车',source:'models/kit/car-red.glb',yaw:-Math.PI/2}
};
const vehicleSelect=$('vehicle-select'),vehicleStatus=$('vehicle-status');
let originalVisual=null,currentVehicleVisual=null,currentVehicle='original',vehicleLoading=false,pageDisposed=false;
for(const [id,spec] of Object.entries(vehicleOptions)){const option=document.createElement('option');option.value=id;option.textContent=spec.label;vehicleSelect.append(option);}
function releasePrivateVehicle(object){
 const geometries=new Set(),materials=new Set(),textures=new Set(),images=new Set();
 object.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const value of Object.values(m))if(value?.isTexture&&value!==reflectionTarget.texture&&value!==scene.environment)textures.add(value);}});
 for(const texture of textures){if(texture.image&&typeof texture.image.close==='function')images.add(texture.image);texture.dispose();}
 for(const material of materials)material.dispose();for(const geometry of geometries)geometry.dispose();for(const image of images)image.close();
}
function installVehicle(visual,key){
 const previous=currentVehicleVisual;
 if(previous)car.remove(previous);
 currentVehicleVisual=visual;currentVehicle=key;car.add(visual);
 rotors.length=wheels.length=steering.length=0;
 visual.traverse(o=>{if(/-rotor$/.test(o.name))rotors.push(o);if(/-wheel$/.test(o.name))wheels.push(o);if(/front-.*-steer/.test(o.name))steering.push(o);
  if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material]){m.envMap=reflectionTarget.texture;m.envMapIntensity=1.25;}});
 if(previous&&previous!==originalVisual)releasePrivateVehicle(previous);
 host.dataset.selectedVehicle=key;host.dataset.wheels=String(wheels.length);host.dataset.rotors=String(rotors.length);
}
function loadPrivateVehicle(spec){
 return new Promise((resolve,reject)=>new T.GLTFLoader().load(spec.source,gltf=>{
  const oriented=new T.Group();oriented.rotation.y=spec.yaw;oriented.add(gltf.scene);oriented.updateMatrixWorld(true);
  const box=new T.Box3().setFromObject(oriented),size=box.getSize(new T.Vector3()),centre=box.getCenter(new T.Vector3());
  if(!Number.isFinite(size.length())||size.z<=0||size.y<=0){releasePrivateVehicle(oriented);reject(Error('车辆尺寸不可用'));return;}
  oriented.position.set(-centre.x,-box.min.y,-centre.z);
  const root=new T.Group();root.add(oriented);root.scale.setScalar(5.8/size.z);root.name='selected-race-vehicle';resolve(root);
 },undefined,reject));
}
async function selectVehicle(key){
 if(vehicleLoading||!Object.hasOwn(vehicleOptions,key)||!car)return;
 if(key===currentVehicle){vehicleSelect.value=key;return;}
 vehicleLoading=true;vehicleSelect.disabled=true;$('start').disabled=true;vehicleStatus.textContent='正在载入赛车…';
 try{
  const spec=vehicleOptions[key],visual=key==='original'?originalVisual:await loadPrivateVehicle(spec);
  if(pageDisposed){if(visual!==originalVisual)releasePrivateVehicle(visual);return;}
  installVehicle(visual,key);vehicleSelect.value=key;vehicleStatus.textContent=spec.label+'已就绪';
  try{localStorage.setItem('rain-city-race-car-v1',key);}catch(_){}
 }catch(error){vehicleSelect.value=currentVehicle;vehicleStatus.textContent='赛车载入失败，保留当前赛车';console.warn('BOOZE_VEHICLE_LOAD_FAILED',error);}
 finally{vehicleLoading=false;vehicleSelect.disabled=false;$('start').disabled=!ready;}
}
vehicleSelect.addEventListener('change',()=>selectVehicle(vehicleSelect.value));
function positionCar(o,s,offset=0){const p=track.sample(s);o.position.set(p.x+p.nx*offset,p.y+.08,p.z+p.nz*offset);o.rotation.y=Math.atan2(-p.tx,-p.tz);return p;}
function attachVehicle(gltf){
  car=new T.Group();car.name='yuheng-player';scene.add(car);const visual=gltf.scene;originalVisual=visual;installVehicle(visual,'original');
  for(const side of [-1,1]){const flame=new T.Mesh(new T.ConeGeometry(.15,1,8,1,true),exhaustMaterial);flame.rotation.x=-Math.PI/2;flame.position.set(side*.6,.56,3.02);car.add(flame);exhaust.push(flame);}
  for(let i=0;i<3;i++){
    const o=visual.clone(true),aiWheels=[];scene.add(o);
    o.traverse(part=>{if(/-wheel$/.test(part.name))aiWheels.push(part);
      if(part.isMesh&&part.name.includes('racing-body')){part.material=part.material.clone();part.material.color.setHex([0x093f78,0x6b082b,0x32102f,0x093f78][i%4]);}
    });
    ai.push({object:o,wheels:aiWheels,s:35+i*i*24,startS:35+i*i*24,speed:24+(i%4)*2,lane:i%2?4:-4});
  }
  positionCar(car,8);camera.position.copy(car.position).add(new T.Vector3(0,5,11));
  host.dataset.vehicle='ready';host.dataset.rotors=String(rotors.length);host.dataset.wheels=String(wheels.length);
}
Promise.all([getModel('models/racing-vehicle.glb?v=experience-1'),environment.load().catch(error=>{host.dataset.environment='fallback';console.warn('BOOZE_OPTIONAL_ENVIRONMENT',error);}),importedWorld.load()]).then(([vehicle])=>{
  attachVehicle(vehicle);ready=true;
  $('start').disabled=false;$('start').textContent='开始单圈计时 ↗';$('load-status').textContent='3 秒倒计时后发车 · W 前进 · A D 转向 · 空格刹车';
  vehicleSelect.disabled=false;let saved='original';try{saved=localStorage.getItem('rain-city-race-car-v1')||saved;}catch(_){}
  if(Object.hasOwn(vehicleOptions,saved)&&saved!=='original')selectVehicle(saved);
  $('track-length').textContent=(track.length/1000).toFixed(2)+' 公里';
  host.dataset.ready='true';host.dataset.trackLength=track.length.toFixed(1);
  ensureComposer();$('quality').textContent='画质 · 高';
  console.info('BOOZE_READY',{trackMeters:track.length,buildings:Number(host.dataset.buildings||0),wheels:wheels.length});
}).catch(error=>{console.error('BOOZE_LOAD_FAILED',error);$('race-error').hidden=false;});

function setCruise(v){cruise=v;$('cruise').setAttribute('aria-pressed',String(v));$('cruise').textContent=v?'巡航油门 · 开':'巡航油门';}
function setPhase(next){phase=next;active=next==='countdown'||next==='racing';host.dataset.phase=next;$('race-countdown').hidden=next!=='countdown';$('race-result').hidden=next!=='finished';$('pause').disabled=!active;$('cruise').disabled=next!=='racing';hudDirty=true;}
function setPaused(v,reason='manual'){paused=v;keys.clear();if(v){setCruise(false);raceSound?.update(driver.speed*3.6,false,true);}hudDirty=true;host.dataset.pauseReason=v?reason:'none';$('paused').hidden=!v;$('pause').textContent=v?'继续':'暂停';clock.getDelta();}
function startRace(){
  if(!ready||vehicleLoading)return;
  driver.reset();driver.best=null;lastLap=0;previousInput={};pendingResult=null;countdown=3;keys.clear();setCruise(false);
  for(const a of ai)a.s=a.startS;
  runId=typeof globalThis.crypto?.randomUUID==='function'?crypto.randomUUID():'race-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  host.dataset.runId=runId;host.dataset.saved='pending';$('countdown-number').textContent='3';
  camMode=0;orbitYaw=0;orbitPitch=0;orbitZoom=1;setPhase('countdown');setPaused(false);
  $('race-start').hidden=true;$('race-hud').hidden=false;showBest();host.focus();toast('依次通过 3 个检查点，返回起点完赛');
}
function saveResult(){
  if(!pendingResult)return;
  try{
    const current=readProgress(),first=current.race.completed===0;
    const next=CityProgress.finishRace(current,pendingResult.seconds,pendingResult.runId);
    progress=CityProgress.persist(localStorage,next);pendingResult.saved=true;showBest();
    $('result-best').textContent=fmt(progress.race.best);
    $('result-reward').textContent=first?'首次完赛 · 天穹纪念已解锁':'天穹纪念已解锁 · 已完成 '+progress.race.completed+' 圈';
    $('result-save').textContent='成绩与纪念已保存，刷新后保留。';$('result-save').dataset.saved='true';
    $('result-retained').textContent='返回街区后，委托、城市改造与赛车成绩均保留。';$('save-result').hidden=true;host.dataset.saved='true';
  }catch(error){
    $('result-save').textContent='保存失败，本次成绩尚未写入。请重试保存。';$('result-save').dataset.saved='false';
    $('result-reward').textContent='完赛纪念待保存';$('result-retained').textContent='原城市进度保留；离开或重新比赛会丢失本次未保存成绩。';
    $('save-result').hidden=false;host.dataset.saved='false';console.warn('BOOZE_SAVE_FAILED',error);
  }
}
function finishRun(seconds){
  pendingResult={seconds,runId,saved:false};setPhase('finished');setPaused(false);setCruise(false);keys.clear();
  $('result-time').textContent=fmt(seconds);$('result-best').textContent=fmt(progress.race.best===null?seconds:Math.min(progress.race.best,seconds));
  saveResult();$('race-again').focus();
}
$('start').onclick=startRace;$('pause').onclick=()=>{if(active)setPaused(!paused);};$('resume').onclick=()=>setPaused(false);
$('restart').onclick=startRace;$('race-again').onclick=startRace;$('save-result').onclick=saveResult;
$('sound').onclick=async()=>{
  $('sound').disabled=true;
  try{
    let state;
    if(!raceSound){if(typeof window.CitySound?.createRaceSound!=='function'){toast('声音暂不可用，仍可继续比赛');return;}raceSound=CitySound.createRaceSound();state=await raceSound.start();}
    else state=await raceSound.toggle();
    soundEnabled=Boolean(state?.enabled);
    $('sound').textContent=soundEnabled?'声音 · 开':'声音 · 关';$('sound').setAttribute('aria-pressed',String(soundEnabled));
    if(state?.available===false||state?.error)toast('声音暂不可用，仍可继续比赛');
  }catch(error){soundEnabled=false;$('sound').textContent='声音 · 关';$('sound').setAttribute('aria-pressed','false');toast('声音未能开启，可稍后重试');console.warn('BOOZE_SOUND_FAILED',error);}
  finally{$('sound').disabled=false;}
};
addEventListener('pagehide',event=>{raceSound?.dispose();raceSound=null;soundEnabled=false;$('sound').textContent='声音 · 关';$('sound').setAttribute('aria-pressed','false');if(event.persisted)return;pageDisposed=true;if(currentVehicleVisual&&currentVehicleVisual!==originalVisual)releasePrivateVehicle(currentVehicleVisual);sceneAssets.dispose();daylight.dispose();reflectionTarget.dispose();if(composer)composer.dispose();renderer.dispose();});
$('cruise').onclick=()=>{if(phase==='racing'&&!paused){setCruise(!cruise);host.focus();}};
$('camera').onclick=()=>{camMode=(camMode+1)%4;orbitYaw=0;orbitPitch=0;orbitZoom=1;toast(['追逐视角','近车视角','俯瞰视角','参考构图'][camMode]);};
$('quality').onclick=()=>{quality=!quality;renderer.setPixelRatio(Math.min(devicePixelRatio,quality?1.6:1));if(quality)ensureComposer();if(composer)composer.setPixelRatio(renderer.getPixelRatio());$('quality').textContent=quality?'画质 · 高':'画质 · 均衡';resize();};
addEventListener('keydown',e=>{
  if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  if(e.repeat){keys.add(e.code);return;}
  if(e.code==='Escape'||e.code==='KeyP'){if(active)setPaused(!paused);return;}
  if(['Space','KeyS','ArrowDown','KeyR'].includes(e.code))setCruise(false);
  if(e.code==='KeyR'&&active){startRace();return;}
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
    if(phase==='countdown'&&!paused){
      countdown=Math.max(0,countdown-dt);$('countdown-number').textContent=String(Math.max(1,Math.ceil(countdown)));host.dataset.countdown=countdown.toFixed(3);
      if(countdown===0){setPhase('racing');driver.running=true;toast('出发 · 跟随青色箭头通过检查点');}
    }
    const input={forward:cruise||keys.has('KeyW')||keys.has('ArrowUp'),reverse:keys.has('KeyS')||keys.has('ArrowDown'),
      left:keys.has('KeyA')||keys.has('ArrowLeft'),right:keys.has('KeyD')||keys.has('ArrowRight'),
      brake:keys.has('Space'),drift:keys.has('ControlLeft')||keys.has('ControlRight'),
      boost:keys.has('ShiftLeft')||keys.has('ShiftRight'),pause:paused||phase!=='racing'};
    BoozeRacing.advanceRace(driver,ai,input,dt);previousInput=input;
    if(driver.completed>lastLap){lastLap=driver.completed;finishRun(driver.best);}
    const driving=phase==='racing'&&!paused,p=track.nearest(driver.x,driver.z,{s:driver.lastS,y:driver.y});
    car.position.set(driver.x,driver.y+.08,driver.z);car.rotation.order='YXZ';car.rotation.y=driver.yaw;
    car.rotation.x=Math.atan(p.slope);car.rotation.z=-driver.steer*Math.min(Math.abs(driver.speed)*.002,.055);
    steering.forEach(o=>o.rotation.y=driver.steer*.18);
    if(driving){rotors.forEach(o=>o.rotateY(driver.speed*dt*.7));wheels.forEach(o=>o.rotateX(-driver.speed*dt/.51));}
    const boosting=input.boost&&driver.boost>.02&&driver.speed>8&&driving;
    raceSound?.update(driver.speed*3.6,boosting,!driving);
    exhaust.forEach(o=>{o.visible=currentVehicle==='original'&&Math.abs(driver.speed)>1;o.scale.set(1,boosting?3:Math.max(.1,Math.abs(driver.speed)*.02),1);});
    document.body.classList.toggle('boosting',boosting&&!reduced);document.body.classList.toggle('hit',driver.wall>.3&&!reduced);
    ai.forEach(a=>{const p=positionCar(a.object,a.s,a.lane);a.object.rotation.x=Math.atan(p.slope);
      if(driving)a.wheels.forEach(w=>w.rotateX(-a.speed*dt/.49));
    });
    const reference=importedWorld.getReferenceView();
    host.dataset.camera=String(camMode);
    if(camMode===3&&reference){
      camera.position.fromArray(reference.position);camera.lookAt(new T.Vector3().fromArray(reference.target));
      camera.fov=T.MathUtils.radToDeg(2*Math.atan(Math.tan(T.MathUtils.degToRad(reference.fov)/2)*Math.max(1,(reference.aspect||16/9)/camera.aspect)));
      camera.updateProjectionMatrix();
    }else{
    const yaw=driver.yaw,dist=(camMode===1?7:camMode===2?20:11)*orbitZoom,height=(camMode===1?3:camMode===2?15:5)*orbitZoom;
    const viewYaw=yaw+orbitYaw,flatDistance=dist*Math.cos(orbitPitch);
    const camTarget=new T.Vector3(driver.x+Math.sin(viewYaw)*flatDistance,driver.y+height+Math.sin(orbitPitch)*dist,driver.z+Math.cos(viewYaw)*flatDistance);
    const orbiting=Math.abs(orbitYaw)+Math.abs(orbitPitch)>.001;
    const look=new T.Vector3(driver.x-(orbiting?0:Math.sin(yaw)*9),driver.y+1.4,driver.z-(orbiting?0:Math.cos(yaw)*9));
    camera.position.lerp(camTarget,1-Math.exp(-dt*5));camera.lookAt(look);
    camera.fov=T.MathUtils.damp(camera.fov,reduced?63:63+Math.max(driver.speed,0)*.16,4,dt);camera.updateProjectionMatrix();
    }
    if(hudDirty||frame%4===0){hudDirty=false;$('speed').textContent=String(phase==='finished'?0:Math.round(Math.abs(driver.speed)*3.6)).padStart(3,'0');
      $('timer').textContent=fmt(phase==='finished'?pendingResult.seconds:driver.lapTime);$('lap').textContent='01';
      $('checkpoint').textContent=phase==='finished'?'全部检查点已完成':driver.checkpoint<3?'下一目标：检查点 '+(driver.checkpoint+1)+' / 3':'下一目标：回到起点完赛';$('boost').style.transform=`scaleX(${driver.boost})`;
      $('drive-state').textContent=paused?'已暂停':phase==='countdown'?'准备发车':phase==='finished'?'比赛完成':driver.wall>.2?'护栏接触':input.brake?'制动':driver.speed<-.5?'倒车':boosting?'氮气推进':input.drift&&Math.abs(driver.speed)>3?'磁场漂移':'磁驱在线';
      host.dataset.speed=driver.speed.toFixed(3);host.dataset.position=`${driver.x.toFixed(2)},${driver.y.toFixed(2)},${driver.z.toFixed(2)}`;host.dataset.heading=driver.yaw.toFixed(4);host.dataset.route=driver.lastS.toFixed(2);
      host.dataset.paused=String(paused);host.dataset.checkpoint=String(driver.checkpoint);host.dataset.completed=String(driver.completed);miniMap();}
  }else{const p=track.sample(8);camera.position.set(p.x+12,p.y+6,p.z+19);camera.lookAt(p.x,p.y+2,p.z-10);}
  daylight.update(camera,time);environment.update(time,camera);importedWorld.update(time,camera);renderer.info.reset();
  if(diagnosticMode==='empty')renderer.clear();else if(quality){renderer.toneMapping=T.NoToneMapping;ensureComposer().render();}else{renderer.toneMapping=T.ACESFilmicToneMapping;renderer.render(scene,camera);}
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
