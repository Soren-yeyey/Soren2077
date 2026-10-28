/* Rain District. All six foreground building prefabs come from the Blender delivery. */
(() => {
'use strict';
const $=id=>document.getElementById(id), T=THREE;
T.ColorManagement.legacyMode=false;
const canvasHost=$('world'), scene=new T.Scene();
scene.background=new T.Color(0x0b1524);scene.fog=new T.FogExp2(0x182d41,.00135);
let renderer;
try{renderer=new T.WebGLRenderer({antialias:false,powerPreference:'high-performance',alpha:false});}
catch(e){fail('当前浏览器无法启动三维渲染，请使用支持硬件加速的桌面浏览器。');return;}
renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(innerWidth,innerHeight);
canvasHost.appendChild(renderer.domElement);
// Decorative imports (facades, sky platforms, billboard) are ~13 MB together. They are
// started only after the street is walkable, so they never hold up the enter button.
function loadDecorations(){
loadImportedScenery(T,scene,renderer,canvasHost,[
 ['importedFacade','models/neon-facade.glb',[[-48,22,5,50,Math.PI/2],[22,22,-30,48,-Math.PI/2]]],
 ['importedSkyCity','models/floating-city.glb',[[95,70,-120,35,.15]]],
 // Tripo masters (1.9M faces, 4K textures) re-exported at 55k/1024: the library is a
 // sky-city kit, so these hang over the street the way the reference does.
 ['importedSkyA','models/sky-platform-a.glb',[[-34,116,-72,72,.35],[86,152,-250,62,-.22]]],
 ['importedSkyB','models/sky-platform-b.glb',[[46,102,-150,58,.1],[-96,132,-196,54,-.4]]],
 ['importedBillboard','models/billboard-tower.glb',[[31,22,-104,44,Math.PI]]]
]);
// The overhead platforms sit above every street lamp, so give them their own rim lights.
light(-34,96,-72,0x6ad8ff,46,120);light(46,84,-150,0xff5fbe,40,120);light(-96,112,-196,0x59e8ff,34,110);
}
const camera=new T.PerspectiveCamera(65,innerWidth/innerHeight,.12,2600);camera.rotation.order='YXZ';
const clock=new T.Clock(),obstacles=[],traffic=[],humans=[],animated=[];
let active=false,ready=false,quality='high',dragging=false,yaw=-.155,pitch=.073,elapsed=0,frame=0;
const keys=new Set(),mouse={x:0,y:0},speed=new T.Vector2();
const views={street:{x:-5,z:62,yaw:.09,pitch:.073,name:'南侧街口'},overlook:{x:-1.8,z:-60,yaw:-.38,pitch:.11,name:'中央塔观景台'},neon:{x:-20,z:-20,yaw:.88,pitch:.17,name:'霓虹长街'}};
let seed=2077;
function rand(){seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;}
const range=(a,b)=>a+(b-a)*rand();
function fail(message){$('error').hidden=false;$('error-message').textContent=message;}
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('show'),3300);}
function canvasTexture(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new T.CanvasTexture(c);t.encoding=T.sRGBEncoding;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return t;}
function standard(color,metalness=.4,roughness=.5){return new T.MeshStandardMaterial({color,metalness,roughness});}
const mat={steel:standard(0x17232d,.68,.39),edge:standard(0x34444e,.65,.3),concrete:standard(0x222d38,.12,.88),black:standard(0x080e16,.55,.24),lane:standard(0x99a5a5,.12,.65),soil:standard(0x091615,0,1),leaf:standard(0x182c28,0,1)};
for(const [key,color] of Object.entries({cyan:0x59ccff,pink:0xfc389e,white:0xc6e9ff,amber:0xffc482,red:0xff354e}))mat[key]=new T.MeshStandardMaterial({color,emissive:color,emissiveIntensity:key==='white'?2.2:3.2,metalness:.1,roughness:.4});
scene.add(new T.HemisphereLight(0x8cbbdf,0x172735,.9));
const sun=new T.DirectionalLight(0x97bee6,.85);sun.position.set(-140,250,80);scene.add(sun);
const rim=new T.DirectionalLight(0x406d99,.7);rim.position.set(140,90,-200);scene.add(rim);

// Static street geometry is instanced by material, rather than hundreds of draw calls.
const batches=new Map(),dummy=new T.Object3D(),cube=new T.BoxGeometry(1,1,1);
function box(x,y,z,w,h,d,material='steel',ry=0){
  const m=typeof material==='string'?mat[material]:material;
  if(!batches.has(m))batches.set(m,[]);batches.get(m).push({x,y,z,w,h,d,ry});
}
function finishBatches(){for(const [m,items] of batches){const geom=m===mat.leaf?new T.IcosahedronGeometry(.64,1):cube;const inst=new T.InstancedMesh(geom,m,items.length);for(let i=0;i<items.length;i++){const a=items[i];dummy.position.set(a.x,a.y,a.z);dummy.scale.set(a.w,a.h,a.d);dummy.rotation.set(0,a.ry,0);dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);}inst.instanceMatrix.needsUpdate=true;inst.frustumCulled=false;scene.add(inst);}batches.clear();}
function beam(a,b,width,material='steel'){const d=new T.Vector3().subVectors(b,a),mesh=new T.Mesh(new T.BoxGeometry(width,d.length,width),mat[material]);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());scene.add(mesh);return mesh;}
function light(x,y,z,color,intensity=12,distance=22){const l=new T.PointLight(color,intensity*.07,distance,2);l.position.set(x,y,z);scene.add(l);return l;}

// A continuous procedural cloud dome, never a billboard with a visible edge.
const sky=new T.Mesh(new T.SphereGeometry(1400,40,20),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{time:{value:0}},vertexShader:`varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`
precision highp float;varying vec3 direction;uniform float time;
float hash(vec3 p){p=fract(p*.3183099+vec3(.13,.29,.73));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.07+13.1;a*=.5;}return v;}
void main(){vec3 dir=normalize(direction);float horizon=pow(1.-max(dir.y,0.),3.);vec3 col=mix(vec3(.008,.017,.035),vec3(.09,.16,.24),horizon);vec3 p=dir*5.6+vec3(time*.003,0.,0.);float n=fbm(p+fbm(p*2.));float cloud=smoothstep(.35,.69,n);float silver=pow(max(dot(dir,normalize(vec3(-.3,.6,-.6))),0.),8.);col+=cloud*(vec3(.04,.065,.095)+silver*vec3(.10,.15,.20));col*=1.-.3*smoothstep(.62,.82,n);gl_FragColor=vec4(col,1.);}
`}));scene.add(sky);

// Shared night-window maps provide facade rhythm without increasing mesh count.
const windows=canvasTexture(256,512,(c,w,h)=>{
  c.fillStyle='#111c28';c.fillRect(0,0,w,h);
  for(let y=4;y<h;y+=12)for(let x=4;x<w;x+=12){const r=rand();c.fillStyle=r<.47?'#162635':r<.74?'#47728d':r<.9?'#91a7b3':'#caad88';c.fillRect(x,y,rand()<.2?3:7,5);c.fillStyle='#101926';c.fillRect(x+3,y,1,5);}
});
const farMat=new T.MeshStandardMaterial({map:windows,emissiveMap:windows,emissive:0x779abd,emissiveIntensity:.8,color:0x6b8599,roughness:.76,metalness:.25});
const midMat=farMat.clone();midMat.color.set(0x7193ab);midMat.emissiveIntensity=.7;
function backgroundCity(){
  const placements=[];
  for(let i=0;i<200;i++){
    let x=range(-470,500),z=range(-850,140),w=range(9,25),d=range(10,25),h=range(30,140);
    if(z>-340&&x>-95&&x<130)continue;
    if(Math.abs(x-66)<142&&z>-615&&z<-310)continue;
    if(z<-600)h*=1.5;
    placements.push({x,z,w,d,h,base:-65});
    if(rand()<.7){box(x,-65+h+.7,z,w*1.04,1.4,d*1.04,'steel');box(x,-65+h+range(3,11),z,.36,range(6,18),.36,'steel');box(x,-65+h+2,z+.5,w*.55,.20,.22,rand()<.8?'cyan':'pink');}
    if(rand()<.23)box(x+w*.5+.08,-65+h*.53,z,.16,h*.76,.2,rand()<.75?'cyan':'pink');
  }
  const inst=new T.InstancedMesh(cube,farMat,placements.length);
  placements.forEach((p,i)=>{dummy.position.set(p.x,p.base+p.h/2,p.z);dummy.scale.set(p.w,p.h,p.d);dummy.rotation.set(0,0,0);dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);});inst.frustumCulled=false;scene.add(inst);
  // Foreground canyon buildings have real roofs and close the city below the promenade.
  for(let i=0;i<34;i++){
    const x=range(20,122),z=range(-240,140),h=range(18,47),w=range(9,17),d=range(10,21);
    box(x,-64+h/2,z,w,h,d,midMat);box(x,-64+h+.6,z,w+1,1.2,d+1,'steel');
    box(x,-64+h+1.8,z,3,2.4,4,'edge');
    if(i%3===0)box(x+w/2+.1,-64+h*.6,z,.15,h*.6,.6,'cyan');
  }
}
backgroundCity();

// Road construction: solid deck, piers, pavement, collision boundaries and guard rails.
box(-18,20.7,-48,36,2.6,310,'concrete');box(-18,19.1,-48,35,1.0,310,'steel');
box(-8,21.91,-48,14,.18,310,'edge');
for(let z=-180;z<=95;z+=21){box(-2,1,z,2.3,38,3.4,'concrete');box(-31,1,z,2.3,38,3.4,'concrete');box(-16.5,17.7,z,33,1.8,2.8,'steel');}
for(let z=-198;z<104;z+=3.5){box(-7.5,22.009,z,13.8,.018,.045,'steel');box(-29.8,22.014,z,4,.02,.05,'steel');}
for(const x of [-13.8,-1])box(x,22.11,-48,.22,.22,310,'edge');
for(let z=-190;z<99;z+=7.6){box(-24.3,22.034,z,.12,.02,3.5,'lane');box(-14.3,22.034,z,.10,.02,3.5,'lane');}
for(let z=-197;z<104;z+=4){
  box(-.2,22.6,z,.25,1.2,.26,'steel');box(-.2,23.12,z+2,.23,.16,4.1,'edge');box(-.2,22.52,z+2,.12,.12,4.1,'edge');
  box(-.23,22.1,z+2,.6,.15,4.1,'concrete');
  if(Math.round(z)%3===0)box(-.36,23.02,z,.045,.1,.65,'cyan');
}
for(const z of [-171,81]){box(-17.8,22.6,z,35.2,1.2,.55,'steel');box(-17.8,23.25,z,35.2,.16,.6,'edge');}
for(let z=-173;z<=83;z+=26){
  box(-10.2,26.1,z,.19,8.2,.19,'black');box(-8.6,30.13,z,3.4,.24,.25,'steel');box(-7.4,30.01,z,1.5,.08,.24,'white');
  box(-10.2,24.6,z,.21,2.8,.21,'cyan');
  obstacles.push({minX:-10.45,maxX:-9.95,minZ:z-.25,maxZ:z+.25});
  if(z>-95)light(-7.4,28,z,Math.round(z)%2?0xff58c0:0xb5dcff,14,19);
}
// Benches and planting boxes sit outside the clear walking line.
for(let z=-150;z<90;z+=36){
  box(-2.4,22.65,z,1.8,1.3,5,'steel');box(-2.4,23.32,z,1.6,.12,4.8,'soil');
  for(let i=0;i<4;i++)box(-2.4+range(-.3,.3),23.8,z-1.6+i*1.05,1.1,range(.5,1.1),1.2,'leaf',range(-.3,.3));
  obstacles.push({minX:-3.35,maxX:-1.45,minZ:z-2.6,maxZ:z+2.6});
  box(-11.7,22.62,z-8,1.05,.16,2.8,'edge');box(-12.12,23,z-8,.13,.85,2.8,'steel');
  for(const zz of [-9,-7])box(-11.7,22.3,z+zz,.65,.6,.22,'steel');
  obstacles.push({minX:-12.3,maxX:-11.1,minZ:z-9.6,maxZ:z-6.4});
}

// Bridges have substantial decks, underside beams and railings on both sides.
function bridge(z,y,x1,x2,width=7){const cx=(x1+x2)/2,len=x2-x1;box(cx,y-1,z,len,2,width,'concrete');box(cx,y-2.5,z,len,1,width-1,'steel');for(const zz of [z-width/2,z+width/2]){box(cx,y+.9,zz,len,.12,.16,'edge');box(cx,y+.1,zz,len,.10,.14,'cyan');for(let x=x1;x<x2;x+=5)box(x,y+.5,zz,.12,1,.12,'steel');}for(let x=x1+15;x<x2;x+=42)box(x,(y-65)/2,z,2.8,y+65,3.4,'concrete');}
bridge(-157,13,-3,154,7);bridge(-290,4,-50,245,10);bridge(5,-14,18,235,9);bridge(-53,-35,-70,180,12);
box(82,-67,-180,1000,4,1700,'black');

// A planar wet-road reflection is distorted in world space to read as rainwater.
const reflection=new T.WebGLRenderTarget(1024,768,{minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:true});
const mirrorCam=new T.PerspectiveCamera(),reflectionMatrix=new T.Matrix4(),bias=new T.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1);
const groundFallback=new T.DataTexture(new Uint8Array([0,0,0,255]),1,1,T.RGBAFormat);groundFallback.needsUpdate=true;
const wetMaterial=new T.ShaderMaterial({uniforms:{reflection:{value:reflection.texture},groundTexture:{value:groundFallback},groundStrength:{value:0},reflectionMatrix:{value:reflectionMatrix},time:{value:0},eye:{value:camera.position},fogColor:{value:new T.Color(0x203347)}},vertexShader:`uniform mat4 reflectionMatrix;varying vec4 projected;varying vec3 world;void main(){vec4 p=modelMatrix*vec4(position,1.);world=p.xyz;projected=reflectionMatrix*p;gl_Position=projectionMatrix*viewMatrix*p;}`,fragmentShader:`
precision highp float;uniform sampler2D reflection;uniform sampler2D groundTexture;uniform float groundStrength;uniform float time;uniform vec3 eye;uniform vec3 fogColor;varying vec4 projected;varying vec3 world;
vec3 groundLinear(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
vec3 groundSample(vec2 p){vec2 edge=smoothstep(vec2(.30),vec2(.48),abs(fract(p)-.5));vec3 a=texture2D(groundTexture,p).rgb,b=texture2D(groundTexture,p+vec2(.5,0.)).rgb,c=texture2D(groundTexture,p+vec2(0.,.5)).rgb,d=texture2D(groundTexture,p+vec2(.5)).rgb;return groundLinear(mix(mix(a,b,edge.x),mix(c,d,edge.x),edge.y));}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
void main(){vec2 uv=projected.xy/projected.w;float n=noise(world.xz*2.5);float puddle=smoothstep(.22,.74,noise(world.xz*.23));vec2 ripple=vec2(sin(world.z*52.+world.x*29.+time*2.),cos(world.x*43.-time*3.))*.00075;uv+=ripple+vec2(n-.5,noise(world.xz*4.3)-.5)*.003;vec3 refl=texture2D(reflection,clamp(uv,0.,1.)).rgb;float fres=pow(1.-max(normalize(eye-world).y,0.),3.);vec3 base=vec3(.014,.022,.028)*( .75+n*.5);vec3 asphalt=groundSample(world.xz/12.);base=mix(base,asphalt,groundStrength);vec3 col=mix(base,refl,.18+.64*puddle*fres);float seam=step(.98,fract(world.z*.5));col*=1.-seam*.23;float fog=1.-exp(-pow(distance(eye,world)*.0017,2.));gl_FragColor=vec4(mix(col,fogColor,fog),1.);
#include <tonemapping_fragment>
#include <encodings_fragment>
}`});
canvasHost.dataset.groundTexture='loading';
new T.TextureLoader().load('images/neon-wet-asphalt.webp',texture=>{texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());wetMaterial.uniforms.groundTexture.value=texture;wetMaterial.uniforms.groundStrength.value=.65;canvasHost.dataset.groundTexture='ready';},undefined,()=>{canvasHost.dataset.groundTexture='fallback';});
const wetRoad=new T.Mesh(new T.PlaneGeometry(35.4,308),wetMaterial);wetRoad.rotation.x=-Math.PI/2;wetRoad.position.set(-18,22.025,-48);scene.add(wetRoad);
// Shared landmark language with the playable commission street.
const cityRing=new T.Group();cityRing.position.set(-10.2,31,16);scene.add(cityRing);
for(const [radius,tube,material,z] of [[12,.55,mat.steel,0],[11.45,.16,mat.pink,.45],[12.6,.1,mat.cyan,-.1]]){
 const part=new T.Mesh(new T.TorusGeometry(radius,tube,10,100),material);part.position.z=z;cityRing.add(part);
}
const existingCityRing=new T.Group();existingCityRing.position.copy(cityRing.position);scene.add(existingCityRing);
loadExistingCityRing(T,renderer,existingCityRing,30).then(ok=>{if(ok){cityRing.visible=false;const accent=new T.Mesh(new T.TorusGeometry(14.2,.055,8,100),mat.pink);accent.position.z=.5;existingCityRing.add(accent);}canvasHost.dataset.cityRing=ok?'blender':'fallback';});
const cityGlow=canvasTexture(256,256,(c,w,h)=>{const g=c.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,'rgba(100,235,255,.68)');g.addColorStop(.35,'rgba(25,170,220,.3)');g.addColorStop(1,'rgba(0,100,200,0)');c.fillStyle=g;c.fillRect(0,0,w,h);});
const cityGlowPlane=new T.Mesh(new T.PlaneGeometry(70,70),new T.MeshBasicMaterial({map:cityGlow,transparent:true,opacity:.7,depthWrite:false,fog:false,blending:T.AdditiveBlending}));cityGlowPlane.position.set(-10.2,38,-15);scene.add(cityGlowPlane);
light(-10.2,31,16,0xff5bc6,32,52);light(-10.2,35,-15,0x48dfff,38,75);
const waterMaterial=new T.MeshStandardMaterial({color:0x0b2232,metalness:.85,roughness:.18,emissive:0x0c1e2d,emissiveIntensity:.3});
const water=new T.Mesh(new T.PlaneGeometry(130,1100),waterMaterial);water.rotation.x=-Math.PI/2;water.position.set(70,-61,-350);scene.add(water);
for(let i=0;i<95;i++)box(range(10,126),-60.96,range(-650,130),range(.1,.6),.014,range(.8,6),i%3?'cyan':'pink');

// Neon shop signs are original, readable Chinese typography on physical housings.
function sign(text,x,y,z,w,h,color,rotation=0){
  const tex=canvasTexture(256,512,(c,W,H)=>{c.fillStyle='#07131b';c.fillRect(0,0,W,H);c.strokeStyle=color;c.lineWidth=5;c.strokeRect(9,9,W-18,H-18);c.fillStyle=color;c.textAlign='center';c.textBaseline='middle';c.font='bold 62px Microsoft YaHei';const chars=[...text];chars.forEach((ch,i)=>c.fillText(ch,W/2,55+i*(H-100)/Math.max(chars.length-1,1)));});
  const m=new T.MeshStandardMaterial({map:tex,emissiveMap:tex,emissive:0xffffff,emissiveIntensity:2.5,roughness:.38});
  const group=new T.Group();group.position.set(x,y,z);group.rotation.y=rotation;
  const housing=new T.Mesh(new T.BoxGeometry(w+.25,h+.25,.35),mat.steel);group.add(housing);
  const panel=new T.Mesh(new T.PlaneGeometry(w,h),m);panel.position.z=.184;group.add(panel);scene.add(group);return group;
}
for(let i=0;i<8;i++){const z=64-i*30;sign(i%2?'夜行酒馆':'未来生活',-35.4,32+((i+1)%3)*3,z,1.9,7.5,i%2?'#ff55ba':'#9affef',Math.PI/2);box(-35.9,34,z,1.1,.2,.25,'steel');}
// Same signage on the right-hand shop row, so the corridor is lit on both sides.
for(let i=0;i<6;i++){const z=56-i*30;sign(i%2?'未来生活':'夜行酒馆',8.9,30+((i+2)%3)*3.4,z,1.85,7.2,i%2?'#9affef':'#ff55ba',-Math.PI/2);box(9.4,32,z,1.1,.2,.25,'steel');}

// Six approved Blender prefabs. Model origins are floor-centred and in metres.
const manager=new T.LoadingManager();
manager.onProgress=(url,loaded,total)=>{$('loading-bar').style.width=Math.round(loaded/total*92)+'%';};
const loader=new T.GLTFLoader(manager);
function loadCity(){return new Promise((resolve,reject)=>loader.load('models/city-kit.gltf',resolve,undefined,reject));}
// Three existing Tripo buildings, extracted from the approved Blender racing
// export without rebaking, decimating, recolouring or changing their UVs.
function loadDetailedBuildings(){return new Promise(resolve=>new T.GLTFLoader().load('models/homepage-buildings.glb',gltf=>{
  const detailMaterials=new Map([[3,new Set()],[4,new Set()],[26,new Set()]]);
  const placements=[
    [3,130,-62,-120,118,.20],
    [4,120,-62,-43,92,-.30],
    [26,160,-62,-272,162,-.12],
    [4,-80,-62,-70,125,.35],
    [26,153,-62,-90,145,.12],
    [3,-120,-62,-280,155,-.25]
  ];
  for(const [number,x,y,z,height,rotation] of placements){
    const source=gltf.scene.getObjectByName('tripo-building-'+String(number).padStart(2,'0'));
    if(!source)continue;
    const obj=source.clone(true),bounds=new T.Box3().setFromObject(obj),size=bounds.getSize(new T.Vector3());
    const scale=height/size.y,center=bounds.getCenter(new T.Vector3());
    // A wrapper preserves original mesh coordinates, and gives a floor-centred pivot.
    const group=new T.Group();obj.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);obj.scale.setScalar(scale);
    group.add(obj);group.position.set(x,y,z);group.rotation.y=rotation;
    group.updateMatrixWorld(true);bounds.setFromObject(group);
    // Keep the entire building envelope outside the walkable deck, including
    // rotated overhangs. Existing collision and portal paths stay usable.
    if(x>0&&bounds.min.x<4)group.position.x+=4-bounds.min.x;
    if(x<0&&bounds.max.x>-40)group.position.x-=bounds.max.x+40;
    scene.add(group);
    obj.traverse(o=>{if(!o.isMesh)return;if(detailMaterials.has(number))o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();for(const m of Array.isArray(o.material)?o.material:[o.material]){
      if(m.map)m.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
      // The Tripo prototypes are baked from pale grey concrete. Cool and darken them so
      // they read as night-time massing instead of lit rubble next to the neon street.
      m.color.setRGB(.34,.40,.52);m.emissiveIntensity=.55;
      if(m.map)detailMaterials.get(number)?.add(m);
    }});
  }
  // Only the base colour is swapped. The baked emissive map keeps its own mask, so
  // windows and screens glow while concrete stays in shadow.
  for(const [number,materials] of detailMaterials)new T.TextureLoader().load('images/building-'+String(number).padStart(2,'0')+'-detail.webp',texture=>{texture.flipY=false;texture.encoding=T.sRGBEncoding;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());for(const m of materials){m.map=texture;m.needsUpdate=true;}canvasHost.dataset['building'+number+'Texture']='2048';},undefined,()=>{canvasHost.dataset['building'+number+'Texture']='original';});
  canvasHost.dataset.tripoBuildings=String(placements.length);canvasHost.dataset.buildingDetail='ready';resolve();
},undefined,error=>{canvasHost.dataset.buildingDetail='fallback';console.warn('CITY_OPTIONAL_BUILDINGS',error);resolve();}));}
function addPrefab(prefabs,id,x,y,z,scale=1,rotation=0){
  const source=prefabs.find(o=>o.name.startsWith(id));if(!source)throw new Error('建筑资源缺失：'+id);
  const obj=source.clone(true);obj.position.set(x,y,z);obj.scale.setScalar(scale);obj.rotation.y=rotation;scene.add(obj);
  obj.traverse(o=>{if(o.isMesh){o.frustumCulled=true;o.castShadow=false;o.receiveShadow=false;}});
  if(y===22){obj.updateMatrixWorld(true);const b=new T.Box3().setFromObject(obj);if(b.max.x>-30.7)obstacles.push({minX:b.min.x,maxX:b.max.x,minZ:b.min.z,maxZ:b.max.z});}
  return obj;
}

function car(x,y,z,color=0x0c1b2a,scale=1){
  const group=new T.Group();const bodyMat=standard(color,.85,.23);
  function part(w,h,d,px,py,pz,m){const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),m);mesh.position.set(px,py,pz);group.add(mesh);return mesh;}
  part(2.3,.65,4.7,0,.75,0,bodyMat);part(1.78,.55,2.1,0,1.32,-.35,mat.black);part(2.44,.18,4.25,0,.38,0,mat.steel);
  part(1.8,.075,.08,0,.85,2.39,mat.red);for(const xx of [-.77,.77])part(.5,.095,.07,xx,.77,-2.39,mat.white);
  part(1.85,.035,1.2,0,1.62,-.35,mat.edge);
  for(const xx of [-1.14,1.14])for(const zz of [-1.5,1.5])part(.28,.65,.9,xx,.36,zz,mat.black);
  group.position.set(x,y,z);group.scale.setScalar(scale);scene.add(group);return group;
}
// Parked road traffic is tangible, the aerial lanes stay outside buildings.
const parked=car(-21.0,22.05,36,0x12243a,1.05);obstacles.push({minX:-22.5,maxX:-19.5,minZ:33,maxZ:39});
// Owned Tripo vehicle: lazy-loaded after entry, with the original car as fallback.
const yuhengCollider=obstacles[obstacles.length-1];
let yuhengState='idle';
function loadYuheng(){
  if(yuhengState==='loading'||yuhengState==='ready')return;
  yuhengState='loading';canvasHost.dataset.yuheng='loading';
  new T.GLTFLoader().load('models/yuheng-preview.glb',gltf=>{
    const vehicle=gltf.scene;vehicle.name='玉衡展示车';
    vehicle.position.copy(parked.position);vehicle.rotation.y=0;
    vehicle.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});
    vehicle.updateMatrixWorld(true);
    const bounds=new T.Box3().setFromObject(vehicle);
    const dims=bounds.getSize(new T.Vector3());
    if(!Number.isFinite(dims.length())||dims.z<4||dims.z>7){
      yuhengState='failed';canvasHost.dataset.yuheng='failed';
      toast('玉衡尺寸检查失败，保留原车辆');return;
    }
    // Keep the tires above the wet road and use the true vehicle footprint.
    vehicle.position.y+=22.07-bounds.min.y;vehicle.updateMatrixWorld(true);
    bounds.setFromObject(vehicle);
    Object.assign(yuhengCollider,{minX:bounds.min.x-.15,maxX:bounds.max.x+.15,
      minZ:bounds.min.z-.15,maxZ:bounds.max.z+.15});
    scene.add(vehicle);parked.visible=false;yuhengState='ready';
    light(-18.5,25.5,38,0xb4e3ff,24,11);
    canvasHost.dataset.yuheng='ready';canvasHost.dataset.yuhengDimensions=
      `${dims.x.toFixed(2)},${dims.y.toFixed(2)},${dims.z.toFixed(2)}`;
    console.info('YUHENG_READY',{dimensions:dims.toArray(),staticPreview:true});
    toast('玉衡已停靠街口，可从观景位置近看');
  },undefined,error=>{
    yuhengState='failed';canvasHost.dataset.yuheng='failed';
    console.error('YUHENG_LOAD_FAILED',error);toast('玉衡暂未载入，保留原车辆');
  });
}
views.yuheng={x:-15.5,z:43.5,yaw:.63,pitch:-.12,name:'玉衡停靠位'};
const yuhengView=document.createElement('button');yuhengView.dataset.view='yuheng';
yuhengView.textContent='玉衡';document.querySelector('.views').appendChild(yuhengView);
// A real 3D portal links the existing district to the separate racing scene.
const racingPortal=new T.Group();racingPortal.position.set(-5.5,24.2,76);
const portalFrame=new T.Mesh(new T.TorusGeometry(2.05,.17,8,48),mat.edge);
const portalEnergy=new T.Mesh(new T.TorusGeometry(1.83,.045,5,48),mat.cyan);
racingPortal.add(portalFrame,portalEnergy);scene.add(racingPortal);
let portalMembrane=null;
new T.GLTFLoader().load('models/racing-portal.glb',gltf=>{
  const model=gltf.scene;model.position.y=-2.15;racingPortal.add(model);
  portalFrame.visible=false;portalEnergy.visible=false;
  model.traverse(o=>{
    if(o.name==='portal-membrane'){
      portalMembrane=o;
      o.material=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,
        uniforms:{time:{value:0}},
        vertexShader:'varying vec2 pUv;void main(){pUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:`precision highp float;varying vec2 pUv;uniform float time;
          void main(){vec2 p=pUv-.5;float r=length(p)*2.;float a=atan(p.y,p.x);
          float rings=pow(.5+.5*sin(r*33.-time*2.5+a*2.),5.);
          float rim=smoothstep(.35,1.,r);float alpha=(.14+rings*.25+rim*.28)*(1.-smoothstep(.86,1.03,r));
          gl_FragColor=vec4(mix(vec3(.055,.45,.8),vec3(.55,.08,.6),rings*.5),alpha);}`});
    }
  });
  canvasHost.dataset.racingPortal='blender';
},undefined,error=>{console.warn('RACING_PORTAL_MODEL_FAILED',error);canvasHost.dataset.racingPortal='fallback';});
const portalSign=canvasTexture(512,128,(c,w,h)=>{c.fillStyle='#071522';c.fillRect(0,0,w,h);c.fillStyle='#a5f5ff';c.font='bold 30px Microsoft YaHei';c.textAlign='center';c.textBaseline='middle';c.fillText('Booze 赛车城 · E 传送',w/2,h/2);});
const portalLabel=new T.Mesh(new T.PlaneGeometry(3.8,.95),new T.MeshBasicMaterial({map:portalSign}));
portalLabel.position.y=2.65;racingPortal.add(portalLabel);
const racingLink=document.createElement('a');racingLink.href='booze.html';racingLink.textContent='传送赛车城 ↗';
racingLink.style.cssText='color:#baffee;text-decoration:none;font-size:12px';
document.querySelector('.top-actions').prepend(racingLink);
car(-27.1,22.05,67,0x171b26,.95);obstacles.push({minX:-28.6,maxX:-25.6,minZ:64,maxZ:70});
car(-21.0,22.05,-66,0x142b31);obstacles.push({minX:-22.5,maxX:-19.5,minZ:-69,maxZ:-63});
for(let i=0;i<4;i++){
  const o=car(range(40,70),range(38,78),-40-i*85,0x0c1926,range(.7,1.2));
  o.rotation.y=i%2?Math.PI/2:-Math.PI/2;traffic.push({object:o,baseX:o.position.x,baseY:o.position.y,baseZ:o.position.z,phase:rand()*6.28,speed:range(.09,.2),radius:range(12,18)});
  const thruster=new T.Mesh(new T.BoxGeometry(1.6,.12,.18),mat.cyan);thruster.position.set(0,.55,2.52);o.add(thruster);
}

// Simplified physical pedestrians, distributed clear of the player spawn and street furniture.
function pedestrian(x,z,coatColor){
  const group=new T.Group(),coat=standard(coatColor,.05,.85),skin=standard(0x735c57,0,.9);
  const body=new T.Mesh(new T.CylinderGeometry(.19,.27,.78,5),coat);body.position.y=1.03;group.add(body);
  const head=new T.Mesh(new T.SphereGeometry(.14,6,5),skin);head.position.y=1.6;group.add(head);
  const legs=[];for(const side of [-1,1]){const leg=new T.Mesh(new T.BoxGeometry(.15,.70,.18),mat.black);leg.position.set(side*.13,.4,0);group.add(leg);legs.push(leg);const arm=new T.Mesh(new T.BoxGeometry(.11,.65,.13),coat);arm.position.set(side*.29,1.06,0);group.add(arm);}
  group.position.set(x,22.06,z);scene.add(group);humans.push({object:group,legs,phase:rand()*6.28});
  obstacles.push({minX:x-.38,maxX:x+.38,minZ:z-.38,maxZ:z+.38});
}
for(const p of [[-4,42],[-8,8],[-28,24],[-29,-34],[-4,-123],[-6,-155]])pedestrian(p[0],p[1],[0x25283b,0x142b34,0x382039][Math.floor(rand()*3)]);

// The rigged Blender character (2.2万面, 41 bones) replaces three of the block
// pedestrians. Each copy loads the same 1.26 MB file, which the HTTP cache serves once.
const operativeSpots=[[-7,46,.35],[-7,-89,3.1],[-27,-108,-1.2]];
const operatives=[];
function loadOperatives(){
for(const [x,z,ry] of operativeSpots){
  new T.GLTFLoader().load('models/operative-walk.glb',gltf=>{
    const model=gltf.scene,box=new T.Box3().setFromObject(model),size=box.getSize(new T.Vector3());
    if(!size.y)return;
    const s=1.74/size.y;
    model.scale.setScalar(s);
    model.position.y=-box.min.y*s;
    model.traverse(o=>{if(o.isMesh){o.frustumCulled=false;if(o.material&&o.material.map)o.material.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}});
    const wrap=new T.Group();wrap.add(model);wrap.position.set(x,22.06,z);scene.add(wrap);
    // Baked 24-frame walk clip; a short patrol makes the in-place cycle read as walking.
    let mixer=null;
    if(gltf.animations.length){mixer=new T.AnimationMixer(model);const act=mixer.clipAction(gltf.animations[0]);act.play();act.timeScale=.9+rand()*.25;}
    operatives.push({wrap,mixer,baseX:x,baseZ:z,baseRot:Math.PI+ry,phase:rand()*6.28,span:5+rand()*4});
    obstacles.push({minX:x-.4,maxX:x+.4,minZ:z-.4,maxZ:z+.4});
    canvasHost.dataset.operative=String((Number(canvasHost.dataset.operative)||0)+1);
  },undefined,error=>{canvasHost.dataset.operative='fallback';console.warn('Optional character:',error);});
}
}

// Camera-local rain occupies a bounded volume and never crosses the UI layer.
const rainCount=1600,rainGeo=new T.BufferGeometry(),rainPos=new Float32Array(rainCount*6),rainSeeds=[];
for(let i=0;i<rainCount;i++)rainSeeds.push([range(-47,47),range(0,43),range(-75,30),range(.45,1.3)]);
rainGeo.setAttribute('position',new T.BufferAttribute(rainPos,3).setUsage(T.DynamicDrawUsage));
const rain=new T.LineSegments(rainGeo,new T.LineBasicMaterial({color:0x9bbdd0,transparent:true,opacity:.12,depthWrite:false}));rain.frustumCulled=false;scene.add(rain);
const composer=new T.EffectComposer(renderer);composer.addPass(new T.RenderPass(scene,camera));
const bloom=new T.UnrealBloomPass(new T.Vector2(innerWidth,innerHeight),.48,.62,.95);composer.addPass(bloom);
// Convert the composer's linear HDR output once, after bloom. Without this pass,
// mid-tones are crushed and luminous displays clip to featureless white.
const grade=new T.ShaderPass({uniforms:{tDiffuse:{value:null}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`uniform sampler2D tDiffuse;varying vec2 vUv;void main(){vec3 c=texture2D(tDiffuse,vUv).rgb*.93;c=(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14);c=pow(clamp(c,0.,1.),vec3(1./2.2));gl_FragColor=vec4(c,1.);}`});grade.material.toneMapped=false;composer.addPass(grade);

function setView(name){const v=views[name];camera.position.set(v.x,24.4,v.z);yaw=v.yaw;pitch=v.pitch;speed.set(0,0);keys.clear();camera.rotation.set(pitch,yaw,0,'YXZ');$('location-name').textContent=v.name;document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));}
setView('street');
function setQuality(value){quality=value;const ratio=Math.min(devicePixelRatio,value==='high'?1.6:1);renderer.setPixelRatio(ratio);composer.setPixelRatio(ratio);reflection.setSize(value==='high'?1024:640,value==='high'?768:480);bloom.strength=value==='high'?.48:.36;rain.geometry.setDrawRange(0,value==='high'?rainCount*2:rainCount);resize();}
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);}
addEventListener('resize',resize);
const touchOnly=matchMedia('(hover: none) and (pointer: coarse)').matches;
if(touchOnly){const note=document.querySelector('.desktop-note');if(note)note.textContent='手机暂不支持行走 · 请用电脑体验完整街区';}
$('enter').addEventListener('click',()=>{if(!ready)return;active=true;$('welcome').hidden=true;$('walking-hud').hidden=false;canvasHost.focus();toast(touchOnly?'手机暂不支持行走 · 可拖动环顾，请用电脑体验完整街区':'按住鼠标拖动环顾；W A S D 沿步道行走');loadYuheng();});
$('reset').addEventListener('click',()=>{setView('street');toast('已返回南侧街口');});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{setView(b.dataset.view);if(b.dataset.view==='yuheng')loadYuheng();canvasHost.focus();}));
$('quality').addEventListener('change',e=>setQuality(e.target.value));
$('photo').addEventListener('click',()=>{if(!ready)return;renderReflection();composer.render();renderer.domElement.toBlob(blob=>{if(!blob){toast('画面保存失败，请重试');return;}const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='rain-district.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('已保存无界面场景图');},'image/png');});
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(e){toast('浏览器未允许全屏，可使用浏览器的全屏功能');}});
renderer.domElement.addEventListener('pointerdown',e=>{if(!active)return;dragging=true;mouse.x=e.clientX;mouse.y=e.clientY;renderer.domElement.setPointerCapture(e.pointerId);canvasHost.focus();});
renderer.domElement.addEventListener('pointermove',e=>{if(!dragging)return;yaw-=(e.clientX-mouse.x)*.0023;pitch-= (e.clientY-mouse.y)*.0023;pitch=T.MathUtils.clamp(pitch,-.9,1.12);mouse.x=e.clientX;mouse.y=e.clientY;});
for(const ev of ['pointerup','pointercancel','lostpointercapture'])renderer.domElement.addEventListener(ev,()=>dragging=false);
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('keydown',e=>{if(!active||/SELECT|INPUT|TEXTAREA/.test(e.target.tagName))return;if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.code==='KeyH'&&!e.repeat){document.body.classList.toggle('clean');if(document.body.classList.contains('clean'))toast('按 H 恢复界面');}if(e.code==='Escape'){dragging=false;document.body.classList.remove('clean');}});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>{keys.clear();dragging=false;speed.set(0,0);});
document.addEventListener('visibilitychange',()=>{keys.clear();speed.set(0,0);clock.getDelta();});
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();fail('图形设备暂时断开，请重新连接城区。');});

const cameraDir=new T.Vector3(),target=new T.Vector3(),clipPlane=new T.Plane(new T.Vector3(0,1,0),-22.04);
function renderReflection(){
  camera.updateMatrixWorld();camera.getWorldDirection(cameraDir);target.copy(camera.position).add(cameraDir);target.y=44.05-target.y;
  mirrorCam.copy(camera);mirrorCam.position.copy(camera.position);mirrorCam.position.y=44.05-camera.position.y;mirrorCam.up.set(0,-1,0);mirrorCam.lookAt(target);mirrorCam.updateMatrixWorld();mirrorCam.projectionMatrix.copy(camera.projectionMatrix);
  reflectionMatrix.copy(bias).multiply(mirrorCam.projectionMatrix).multiply(mirrorCam.matrixWorldInverse);
  wetRoad.visible=false;rain.visible=false;renderer.clippingPlanes=[clipPlane];renderer.setRenderTarget(reflection);renderer.clear();renderer.render(scene,mirrorCam);renderer.setRenderTarget(null);renderer.clippingPlanes=[];wetRoad.visible=true;rain.visible=true;
}
let perfFrames=0,perfTime=0,adapted=false;
function animate(){
  requestAnimationFrame(animate);const realDelta=clock.getDelta(),dt=Math.min(realDelta,.04);if(document.hidden)return;elapsed+=dt;frame++;
  if(active){
    if(keys.has('KeyE')&&Math.hypot(camera.position.x+5.5,camera.position.z-76)<3){location.href='booze.html';return;}
    portalEnergy.rotation.z=elapsed*.25;
    if(portalMembrane)portalMembrane.material.uniforms.time.value=elapsed;
    const side=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0),forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0);
    if(keys.has('ArrowLeft'))yaw+=dt;if(keys.has('ArrowRight'))yaw-=dt;
    const length=Math.max(1,Math.hypot(side,forward)),pace=keys.has('ShiftLeft')||keys.has('ShiftRight')?7:3.6;
    const dx=(side*Math.cos(yaw)-forward*Math.sin(yaw))/length*pace,dz=(-side*Math.sin(yaw)-forward*Math.cos(yaw))/length*pace;
    speed.x=T.MathUtils.damp(speed.x,dx,12,dt);speed.y=T.MathUtils.damp(speed.y,dz,12,dt);
    const next=CityNavigation.move(camera.position,speed.x*dt,speed.y*dt,obstacles);camera.position.x=next.x;camera.position.z=next.z;
    camera.position.y=24.4+Math.sin(elapsed*8)*Math.min(speed.length(),4)*.008;
  }
  camera.rotation.set(pitch,yaw,0,'YXZ');sky.position.copy(camera.position);sky.material.uniforms.time.value=elapsed;wetMaterial.uniforms.time.value=elapsed;
  for(const a of traffic){a.object.position.x=a.baseX+Math.sin(elapsed*a.speed+a.phase)*a.radius;a.object.position.y=a.baseY+Math.sin(elapsed*.7+a.phase)*.3;}
  humans.forEach(h=>{h.object.rotation.y=Math.sin(elapsed*.25+h.phase)*.08;});
  // Patrol the three rigged characters: the baked clip is in place, so the wrapper
  // slides along the street and flips heading at each end of its short beat.
  for(const o of operatives){
    if(o.mixer)o.mixer.update(dt);
    const swing=Math.sin(elapsed*.55+o.phase);
    o.wrap.position.z=o.baseZ+swing*o.span;
    o.wrap.position.x=o.baseX+Math.sin(elapsed*.32+o.phase)*1.1;
    o.wrap.rotation.y=o.baseRot+(Math.cos(elapsed*.55+o.phase)>0?0:Math.PI);
  }
  rain.position.set(camera.position.x,22,camera.position.z);
  for(let i=0;i<rainCount;i++){const s=rainSeeds[i],j=i*6;const y=((s[1]-elapsed*16)%43+43)%43;rainPos[j]=s[0];rainPos[j+1]=y;rainPos[j+2]=s[2];rainPos[j+3]=s[0]-.13;rainPos[j+4]=y+s[3];rainPos[j+5]=s[2]+.04;}
  rainGeo.attributes.position.needsUpdate=true;
  if(quality==='high'||frame%2===0)renderReflection();composer.render();
  if(frame%15===0){$('map-player').setAttribute('transform',`translate(${39+(camera.position.x+6)*.4},${17+(80-camera.position.z)/250*111}) rotate(${-yaw*180/Math.PI})`);canvasHost.dataset.position=`${camera.position.x.toFixed(2)},${camera.position.z.toFixed(2)}`;}
  if(ready&&!adapted){perfFrames++;perfTime+=realDelta;if(perfTime>7){adapted=true;canvasHost.dataset.initialFps=(perfFrames/perfTime).toFixed(1);if(perfFrames/perfTime<27&&quality==='high'){setQuality('balanced');$('quality').value='balanced';toast('已切换均衡画质，让漫游更流畅');}}}
}

// Only the street prefabs block the enter button. Tripo towers, imported facades,
// sky platforms and the rigged characters stream in after the walk is already usable.
setTimeout(()=>{if(!ready)$('loading').textContent='网络较慢，街道仍在载入…';},12000);
loadCity().then(gltf=>{
  const prefabs=gltf.scene.children;
  prefabs.forEach(o=>o.traverse(m=>{if(m.isMesh){const mats=Array.isArray(m.material)?m.material:[m.material];mats.forEach(mm=>{if(mm.name==='Glass'){mm.depthWrite=false;mm.opacity=.12;}if(mm.map){mm.map.minFilter=T.LinearMipmapLinearFilter;mm.map.magFilter=T.LinearFilter;mm.map.anisotropy=8;}if(['ORION','AD','HOLO'].includes(mm.name))mm.emissiveIntensity=.85;
    // Baked window factors are 0.10 (Apartment) and 0.32 (Windows), and their emissive
    // map is the albedo itself, so the glass reads as dead. Derive a brightened copy of
    // that same map: layout and per-pane colour stay pixel-aligned, only the gain changes.
    if((mm.name==='Apartment'||mm.name==='Windows')&&mm.map&&mm.map.image&&mm.map.image.width){
      const img=mm.map.image,c=document.createElement('canvas');
      c.width=img.width*2;c.height=img.height*2;
      const cx=c.getContext('2d');cx.filter='brightness(2.0) saturate(1.12)';cx.drawImage(img,0,0,c.width,c.height);
      const lit=new T.CanvasTexture(c);
      lit.encoding=T.sRGBEncoding;lit.flipY=mm.map.flipY;lit.wrapS=mm.map.wrapS;lit.wrapT=mm.map.wrapT;
      lit.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
      lit.minFilter=T.LinearMipmapLinearFilter;lit.magFilter=T.LinearFilter;
      mm.emissiveMap=lit;mm.emissive.setRGB(1,1,1);mm.emissiveIntensity=.78;mm.needsUpdate=true;
    }
    // Ground-floor shop interiors glow warm through the glass.
    if(mm.name==='Interior'){mm.emissive.setRGB(.62,.36,.15);mm.emissiveIntensity=.38;}
  });}}));
  // Eight shopfronts from one prefab read as a copy-paste wall, so heights and yaw drift
  // slightly per slot; the roofline and the sign spacing stop marching in lockstep.
  for(const [z,sc,ry] of [[68,1.82,.02],[36,1.73,-.03],[4,1.91,.015],[-28,1.77,.035],[-60,1.86,-.02],[-92,1.7,.03],[-124,1.88,-.03],[-156,1.75,.012]])addPrefab(prefabs,'07',-44,22,z,sc,Math.PI/2+ry);
  // Right-hand terrace and shop row: without it the street reads as a bridge with a
  // single wall. This mirrors the left row so the corridor closes on both sides.
  const terrace=standard(0x0d1621,.18,.94);
  box(19,20.6,-48,38,2.8,310,terrace);
  box(37.9,22.6,-48,.34,1.15,310,'edge');
  box(37.9,23.22,-48,.11,.11,310,'cyan');
  for(let z=-186;z<98;z+=32){box(35,4.6,z,2.6,36,3.0,'steel');}
  for(let z=92;z>-170;z-=4){box(37.6,22.05,z,.1,.02,3.2,'lane');}
  for(const z of [44,4,-36,-76,-116,-152])light(9,28.5,z,z%2?0xff58c0:0x59ccff,10,30);
  for(const [z,id,sc] of [[58,'07',1.75],[26,'09',1.05],[-8,'07',1.9],[-80,'07',1.65],[-116,'10',1.45],[-148,'07',1.8]])addPrefab(prefabs,id,22,22,z,sc,-Math.PI/2);
  // The hologram pylon faces down the street rather than sideways, so its screen reads
  // head-on from the walkway instead of edge-on.
  addPrefab(prefabs,'12',11,22,-52,0.9,0);
  addPrefab(prefabs,'08',-57,18,-97,2.05,Math.PI/4);
  addPrefab(prefabs,'09',-49,-8,-225,2.0,.1);
  addPrefab(prefabs,'10',-17,22,-112,1.36,0);
  const central=addPrefab(prefabs,'11',66,-68,-458,4.4,0);central.scale.x*=1.65;central.scale.z*=1.65;
  addPrefab(prefabs,'12',143,-30,-126,2.6,-.17);
  addPrefab(prefabs,'08',163,-58,59,1.3,0);
  addPrefab(prefabs,'09',196,-60,-355,2.6,0);
  addPrefab(prefabs,'12',-113,-48,-326,1.7,.22);
  addPrefab(prefabs,'10',67,-62,-43,1.1,0);
  addPrefab(prefabs,'09',209,-60,-84,1.7,0);
  addPrefab(prefabs,'08',-122,-42,75,1.5,0);
  finishBatches();ready=true;$('enter').disabled=false;$('enter-label').textContent='观景漫游';$('loading').textContent='街道已就绪 · 细节陆续到场';$('loading-bar').style.width='100%';canvasHost.dataset.ready='true';canvasHost.dataset.assets='6';
  console.info('CITY_READY',{sourceModels:6,sourceTriangles:11984,colliders:obstacles.length});
  // Everything below is decoration: it must not delay the first walkable frame.
  loadDetailedBuildings();
  loadDecorations();
  loadOperatives();
  $('enter').addEventListener('click',()=>{canvasHost.dataset.decorations='streaming';},{once:true});
}).catch(e=>{console.error('CITY_LOAD_FAILED',e);fail('建筑资源未能载入。请从本地服务器或网站链接打开页面，并检查网络后重试。');});
animate();
})();
