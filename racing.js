/* Booze sky circuit: Blender prefabs, magnetic-drive visuals, deterministic arcade handling. */
(()=>{'use strict';
const T=THREE,$=id=>document.getElementById(id),host=$('race-world');
const track=BoozeRacing.makeTrack(),driver=new BoozeRacing.Driver(track);
const scene=new T.Scene();scene.background=new T.Color(0x091b35);scene.fog=new T.FogExp2(0x4b78a2,.00028);
T.ColorManagement.legacyMode=false;
const renderer=new T.WebGLRenderer({antialias:false,powerPreference:'high-performance'});
renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.05;renderer.setPixelRatio(Math.min(devicePixelRatio,1));
renderer.setSize(innerWidth,innerHeight);host.appendChild(renderer.domElement);
// Count the whole frame, including every post-processing pass in high quality.
renderer.info.autoReset=false;
const camera=new T.PerspectiveCamera(63,innerWidth/innerHeight,.25,5500);
scene.add(new T.HemisphereLight(0xa6d5fb,0x101c31,.85));
const moon=new T.DirectionalLight(0xa6d5fc,1.65);moon.position.set(-300,700,150);scene.add(moon);
const magenta=new T.DirectionalLight(0xdf83ca,.20);magenta.position.set(600,200,-300);scene.add(magenta);
const clock=new T.Clock(),keys=new Set();let ready=false,active=false,paused=false,time=0,camMode=3;
let perfSeconds=0,perfFrames=0,perfCpuMs=0,hudDirty=true;
// Explicit diagnostic URL only: compare an empty framebuffer against the full scene.
const diagnosticMode=new URLSearchParams(location.search).get('diagnostics');
host.dataset.renderMode=diagnosticMode==='empty'?'empty':'scene';
if(diagnosticMode){let lastTick=performance.now();setInterval(()=>{
  const now=performance.now();host.dataset.timerMs=(now-lastTick).toFixed(2);lastTick=now;
},250);}
let car,quality=true,lastLap=0,previousInput={},frame=0,cruise=false;
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
const roadMat=new T.MeshStandardMaterial({map:roadTexture,color:0x63758e,metalness:.82,roughness:.22});
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
    totalEmissiveRadiance+=reflected*(.18+fine*.8)*ripple*.7;`);
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
roadMat.envMap=reflectionTarget.texture;roadMat.envMapIntensity=1.0;
scene.environment=reflectionTarget.texture;
// Checkpoint rings and the road infrastructure are part of the Blender scene.
// Geometry and layout are authored and checked in Blender before importing.
const environment=RacingEnvironment.create(T,scene,renderer);
const importedWorld=RacingWorld.create(T,scene,renderer,roadMat);
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
const grade=new T.ShaderPass({uniforms:{tDiffuse:{value:null}},vertexShader:'varying vec2 uv0;void main(){uv0=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
fragmentShader:'uniform sampler2D tDiffuse;varying vec2 uv0;void main(){vec3 c=texture2D(tDiffuse,uv0).rgb*1.08;c=(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14);gl_FragColor=vec4(pow(clamp(c,0.,1.),vec3(1./2.2)),1.);}'});grade.material.toneMapped=false;composer.addPass(grade);
return composer;
}
function toast(t){$('race-toast').textContent=t;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('race-toast').textContent='',2600);}
function getModel(url){return new Promise((resolve,reject)=>new T.GLTFLoader().load(url,resolve,undefined,reject));}
const ai=[],rotors=[],wheels=[],steering=[];
const exhaustMaterial=new T.MeshBasicMaterial({color:0x52edff,transparent:true,opacity:.65,depthWrite:false,side:T.DoubleSide});
let exhaust=[];
function positionCar(o,s,offset=0){const p=track.sample(s);o.position.set(p.x+p.nx*offset,p.y+.08,p.z+p.nz*offset);o.rotation.y=Math.atan2(-p.tx,-p.tz);return p;}
function attachVehicle(gltf){
  car=new T.Group();car.name='yuheng-player';scene.add(car);const visual=gltf.scene;car.add(visual);
  visual.traverse(o=>{
    if(/-rotor$/.test(o.name))rotors.push(o);if(/-wheel$/.test(o.name))wheels.push(o);if(/front-.*-steer/.test(o.name))steering.push(o);
    if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material]){m.envMap=reflectionTarget.texture;m.envMapIntensity=1.25;}
  });
  for(const side of [-1,1]){const flame=new T.Mesh(new T.ConeGeometry(.15,1,8,1,true),exhaustMaterial);flame.rotation.x=-Math.PI/2;flame.position.set(side*.6,.56,3.02);car.add(flame);exhaust.push(flame);}
  for(let i=0;i<8;i++){
    const o=visual.clone(true),aiWheels=[];scene.add(o);
    o.traverse(part=>{if(/-wheel$/.test(part.name))aiWheels.push(part);
      if(part.isMesh&&part.name.includes('racing-body')){part.material=part.material.clone();part.material.color.setHex([0x093f78,0x6b082b,0x32102f,0x093f78][i%4]);}
    });
    ai.push({object:o,wheels:aiWheels,s:35+i*i*24,speed:24+(i%4)*2,lane:i%2?4:-4});
  }
  positionCar(car,8);camera.position.copy(car.position).add(new T.Vector3(0,5,11));
  host.dataset.vehicle='ready';host.dataset.rotors=String(rotors.length);host.dataset.wheels=String(wheels.length);
}
Promise.all([getModel('models/racing-vehicle.glb?v=tripo-replacement'),environment.load(),importedWorld.load()]).then(([vehicle])=>{
  attachVehicle(vehicle);ready=true;
  $('start').disabled=false;$('start').textContent='进入驾驶 ↗';$('load-status').textContent='W 前进 · A D 转向 · 空格刹车';
  $('track-length').textContent=(track.length/1000).toFixed(2)+' 公里';
  host.dataset.ready='true';host.dataset.trackLength=track.length.toFixed(1);
  ensureComposer();$('quality').textContent='画质 · 高';
  console.info('BOOZE_READY',{trackMeters:track.length,buildings:Number(host.dataset.buildings||0),wheels:wheels.length});
}).catch(error=>{console.error('BOOZE_LOAD_FAILED',error);$('race-error').hidden=false;});

function setCruise(v){cruise=v;$('cruise').setAttribute('aria-pressed',String(v));$('cruise').textContent=v?'巡航油门 · 开':'巡航油门';}
function setPaused(v,reason='manual'){paused=v;keys.clear();if(v)setCruise(false);hudDirty=true;host.dataset.pauseReason=v?reason:'none';$('paused').hidden=!v;$('pause').textContent=v?'继续':'暂停';clock.getDelta();}
function startRace(){if(!ready)return;active=true;camMode=0;setPaused(false);$('race-start').hidden=true;$('race-hud').hidden=false;host.focus();toast('磁驱上线 · 按 C 切换参考构图与驾驶视角');}
$('start').onclick=startRace;$('pause').onclick=()=>{if(active)setPaused(!paused);};$('resume').onclick=()=>setPaused(false);
$('restart').onclick=()=>{driver.reset();setCruise(false);setPaused(false);toast('已返回发车位');};
$('cruise').onclick=()=>{if(active&&!paused){setCruise(!cruise);host.focus();}};
$('camera').onclick=()=>{camMode=(camMode+1)%4;orbitYaw=0;orbitPitch=0;orbitZoom=1;toast(['追逐视角','近车视角','俯瞰视角','参考构图'][camMode]);};
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
    if(!paused){rotors.forEach(o=>o.rotateY(driver.speed*dt*.7));wheels.forEach(o=>o.rotateX(-driver.speed*dt/.51));}
    const boosting=input.boost&&driver.boost>.02&&driver.speed>8&&!paused;
    exhaust.forEach(o=>{o.visible=Math.abs(driver.speed)>1;o.scale.set(1,boosting?3:Math.max(.1,Math.abs(driver.speed)*.02),1);});
    document.body.classList.toggle('boosting',boosting&&!reduced);document.body.classList.toggle('hit',driver.wall>.3&&!reduced);
    ai.forEach(a=>{const p=positionCar(a.object,a.s,a.lane);a.object.rotation.x=Math.atan(p.slope);
      if(!paused&&active)a.wheels.forEach(w=>w.rotateX(-a.speed*dt/.49));
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
    if(hudDirty||frame%4===0){hudDirty=false;$('speed').textContent=String(Math.round(Math.abs(driver.speed)*3.6)).padStart(3,'0');
      $('timer').textContent=fmt(driver.lapTime);$('lap').textContent=String(driver.lap).padStart(2,'0');
      $('checkpoint').textContent='检查点 '+driver.checkpoint+' / 3';$('boost').style.transform=`scaleX(${driver.boost})`;
      $('drive-state').textContent=paused?'已暂停':driver.wall>.2?'护栏接触':input.brake?'制动':driver.speed<-.5?'倒车':boosting?'氮气推进':input.drift&&Math.abs(driver.speed)>3?'磁场漂移':'磁驱在线';
      host.dataset.speed=driver.speed.toFixed(3);host.dataset.position=`${driver.x.toFixed(2)},${driver.y.toFixed(2)},${driver.z.toFixed(2)}`;
      host.dataset.paused=String(paused);host.dataset.checkpoint=String(driver.checkpoint);miniMap();}
    if(driver.completed>lastLap){lastLap=driver.completed;$('best').textContent='最佳 '+fmt(driver.best);toast('完成一圈 · '+fmt(driver.best));}
  }else{const p=track.sample(8);camera.position.set(p.x+12,p.y+6,p.z+19);camera.lookAt(p.x,p.y+2,p.z-10);}
  environment.update(time,camera);importedWorld.update(time,camera);renderer.info.reset();
  if(diagnosticMode==='empty')renderer.clear();else if(quality)ensureComposer().render();else renderer.render(scene,camera);
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
