(async()=>{
'use strict';const T=THREE,$=id=>document.getElementById(id),host=$('viewport');T.ColorManagement.legacyMode=false;
const app={mode:'walk',layout:null,clip:'walk',keys:new Set(),yaw:0,pitch:0,drag:null,filmTime:0,jump:null,jumpRequested:false};
app.notify=text=>{$('message').textContent=text;$('message').classList.add('show');clearTimeout(app.timer);app.timer=setTimeout(()=>$('message').classList.remove('show'),3600);};
app.download=(blob,name)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);};
try{
 const responses=await Promise.all(['data/assets.json?v=registry-2','data/world.json','data/default-layout.json','data/workshop-collision.json'].map(async url=>{const r=await fetch(url);if(!r.ok)throw Error('配置载入失败：'+url);return r.json();}));
 app.registry=CityAssets.normalize(responses[0]);host.dataset.assetVersion=String(responses[0].version);host.dataset.assetsPendingReview=String(app.registry.filter(a=>a.quality?.status==='pending-review').length);app.config=responses[1];let layout=responses[2];
 try{const saved=localStorage.getItem('rain-city-layout-v1');if(saved){const l=JSON.parse(saved);CityCore.validate(l,app.config,app.registry);layout=l;}}catch(e){app.notify('已忽略不兼容的本地布局，载入默认街区');}
 const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;host.append(renderer.domElement);app.renderer=renderer;
 const scene=new T.Scene();scene.background=new T.Color(0x122332);scene.fog=new T.FogExp2(0x122332,.006);app.scene=scene;
 const camera=new T.PerspectiveCamera(62,innerWidth/innerHeight,.15,850);camera.rotation.order='YXZ';app.camera=camera;
 const ambient=new T.HemisphereLight(0x9abada,0x25313a,1.45);scene.add(ambient);const sun=new T.DirectionalLight(0x9ac8ee,2.2);sun.position.set(30,70,40);scene.add(sun);
 const loader=new T.GLTFLoader(),sources=new Map(),prefabs=new Map();
 for(const source of [...new Set(app.registry.map(a=>a.source))]){sources.set(source,await loader.loadAsync(source));$('load-status').textContent='模型已载入 '+sources.size+' / 2';}
 for(const a of app.registry){let node; sources.get(a.source).scene.traverse(o=>{if(!node&&o.name.startsWith(a.node))node=o;});if(!node)throw Error('模型缺失：'+a.name);node=node.clone(true);node.position.set(0,0,0);node.traverse(o=>{if(o.isMesh){for(const m of Array.isArray(o.material)?o.material:[o.material]){if(m.map){m.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());m.map.magFilter=T.LinearFilter;}if(m.transparent)m.depthWrite=false;if(m.emissiveIntensity>1.5)m.emissiveIntensity=1.5;}}});prefabs.set(a.id,node);}
 const world=new CityWorld(T,scene,app.registry,app.config,prefabs,responses[3]);app.world=world;
 const floor=new T.Mesh(new T.PlaneGeometry(1800,1800),world.materials.dark);floor.rotation.x=-Math.PI/2;floor.position.y=-.8;scene.add(floor);
 const composer=new T.EffectComposer(renderer);composer.addPass(new T.RenderPass(scene,camera));const bloom=new T.UnrealBloomPass(new T.Vector2(innerWidth,innerHeight),.38,.5,1.1);composer.addPass(bloom);
 const grade=new T.ShaderPass({uniforms:{tDiffuse:{value:null}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform sampler2D tDiffuse;varying vec2 vUv;void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;c=(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14);gl_FragColor=vec4(pow(clamp(c,0.,1.),vec3(1./2.2)),1.);}'});grade.material.toneMapped=false;composer.addPass(grade);
 // Actual planar reflection, shared along the continuously connected roadway.
 const reflection=new T.WebGLRenderTarget(768,512),mirror=new T.PerspectiveCamera(),matrix=new T.Matrix4(),bias=new T.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1);
 const wet=new T.ShaderMaterial({uniforms:{map:{value:reflection.texture},project:{value:matrix},time:{value:0}},vertexShader:'uniform mat4 project;varying vec4 coord;varying vec3 world;void main(){vec4 p=modelMatrix*vec4(position,1.);world=p.xyz;coord=project*p;gl_Position=projectionMatrix*viewMatrix*p;}',fragmentShader:'uniform sampler2D map;uniform float time;varying vec4 coord;varying vec3 world;void main(){vec2 uv=coord.xy/coord.w;uv+=vec2(sin(world.z*1.8+time*.8),cos(world.x*2.1-time*.7))*.00065;vec3 c=texture2D(map,clamp(uv,0.,1.)).rgb;float puddle=.35+.30*sin(world.x*1.8+sin(world.z*.6))*sin(world.z*.53);gl_FragColor=vec4(mix(vec3(.025,.04,.05),c,.3+puddle*.6),1.);}'});
 const roadMirror=world.roadSurface;roadMirror.material=wet;const mirrorHeight=roadMirror.position.y;
 const rainCount=800,positions=new Float32Array(rainCount*6),rg=new T.BufferGeometry(),random=CityCore.random(11),seeds=Array.from({length:rainCount},()=>[random()*60-30,random()*32,random()*80-50]);rg.setAttribute('position',new T.BufferAttribute(positions,3));const rain=new T.LineSegments(rg,new T.LineBasicMaterial({color:0xa3cad8,transparent:true,opacity:.16,depthWrite:false}));rain.frustumCulled=false;scene.add(rain);
 const actor=CityMotions.createActor(T,world.materials);actor.root.position.set(6.1,.19,74);scene.add(actor.root);app.actor=actor;
 const vehicle=CityMotions.vehicle(T,world.materials);scene.add(vehicle);let vehicleZ=125;
 for(const p of [[-20,5,65,0xffb467],[-20,5,0,0x6adeff],[20,5,-96,0xe58cf1]]){const l=new T.PointLight(p[3],2,30,2);l.position.set(...p.slice(0,3));scene.add(l);}
 app.lookAt=(target)=>{camera.lookAt(target);const e=new T.Euler().setFromQuaternion(camera.quaternion,'YXZ');app.yaw=e.y;app.pitch=e.x;};
 app.applyLayout=l=>{app.layout=JSON.parse(JSON.stringify(l));world.setLayout(app.layout);world.update(camera.position.z,true);host.dataset.layoutSeed=l.seed;host.dataset.placements=l.placements.length;};
 app.zone=zone=>{app.jump=null;app.jumpRequested=false;camera.position.set(6.8,2.05,zone.center-6);app.lookAt(new T.Vector3(-20,4,zone.center-31));actor.root.position.z=zone.center-12;app.route={min:zone.center-27,max:zone.center+25};app.keys.clear();app.world.update(camera.position.z);app.editor?.outline();};
 app.focus=p=>{camera.position.set(p.x<0?2:-2,9,p.z+22);app.lookAt(new T.Vector3(p.x,5,p.z));world.update(p.z);app.editor.outline();};
 app.applyLayout(layout);app.zone(app.config.zones[0]);app.editor=new CityEditor(app);
 function setMode(mode){app.mode=mode;app.jump=null;app.jumpRequested=false;app.keys.clear();app.drag=null;document.body.classList.toggle('editing',mode==='edit');document.body.classList.toggle('filming',mode==='film');$('editor').hidden=mode!=='edit';for(const m of ['walk','edit','film'])$('mode-'+m).classList.toggle('active',mode===m);$('help').textContent=mode==='edit'?'点击建筑选择 · 右侧修改并保存 · 按住鼠标环顾':mode==='film'?'自动镜头预览 · 可切回漫游继续搭建':'W A S D 行走 · 空格跳跃 · 按住鼠标环顾 · Shift 快走';if(mode==='walk')app.zone(CityCore.zoneAt(camera.position.z,app.config));if(mode==='film')app.filmTime=0;if(mode==='edit')app.focus(app.layout.placements.find(p=>p.id===app.editor.selected)||app.layout.placements[0]);app.editor.outline();host.dataset.mode=mode;}
 for(const mode of ['walk','edit','film'])$('mode-'+mode).onclick=()=>setMode(mode);
 for(const z of app.config.zones){const b=document.createElement('button');b.textContent=z.name;b.dataset.zone=z.id;b.onclick=()=>{if(app.mode==='film')setMode('walk');app.zone(z);};$('zones').append(b);}
 $('visit-workshop').onclick=()=>{
  const zone=CityCore.zoneAt(camera.position.z,app.config),shop=world.shops.find(s=>s.placement.zone===zone.id)||world.shops[0];
  if(!shop){app.notify('当前布局没有样板店，请先添加一间');return;}
  let entry;for(const distance of [6.5,7,8,9]){const p=CityCore.toWorld(0,distance,shop.placement,shop.scale);if(!CityCore.blocked(p.x,p.z,world.getColliders())){entry=p;break;}}
  if(!entry){app.notify('店门前没有安全落脚点，请调整建筑位置');return;}
  setMode('walk');camera.position.set(entry.x,1.86+world.groundAt(entry.x,entry.z),entry.z);app.lookAt(new T.Vector3(shop.placement.x,camera.position.y,shop.placement.z));world.update(entry.z);host.focus();app.notify('已到店门前，按 W 进入，按住鼠标环顾');
 };
 $('motion').onchange=e=>app.clip=e.target.value;
 $('lighting').onchange=e=>{const blue=e.target.value==='blue';ambient.intensity=blue?2:1.45;sun.intensity=blue?3:2.2;scene.background.set(blue?0x46637a:0x122332);scene.fog.color.copy(scene.background);};
 let high=true;$('quality').onchange=e=>{high=e.target.value==='high';renderer.setPixelRatio(Math.min(devicePixelRatio,high?1.5:1));composer.setPixelRatio(Math.min(devicePixelRatio,high?1.5:1));reflection.setSize(high?768:512,high?512:320);};
 $('capture').onclick=()=>{renderReflection();composer.render();renderer.domElement.toBlob(b=>{if(b)app.download(b,'rain-city-studio.png');else app.notify('截图失败，请重试');});};
 const raycaster=new T.Raycaster();renderer.domElement.addEventListener('pointerdown',e=>{app.drag={x:e.clientX,y:e.clientY,originX:e.clientX,originY:e.clientY};renderer.domElement.setPointerCapture(e.pointerId);host.focus();});
 renderer.domElement.addEventListener('pointermove',e=>{if(!app.drag||app.mode==='film')return;app.yaw-=(e.clientX-app.drag.x)*.0025;app.pitch=T.MathUtils.clamp(app.pitch-(e.clientY-app.drag.y)*.0025,-1.2,1.2);app.drag.x=e.clientX;app.drag.y=e.clientY;});
 renderer.domElement.addEventListener('pointerup',e=>{if(app.mode==='edit'&&app.drag&&Math.hypot(e.clientX-app.drag.originX,e.clientY-app.drag.originY)<5){raycaster.setFromCamera(new T.Vector2(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2),camera);const hit=raycaster.intersectObjects([...world.objects.values()],true)[0];if(hit)app.editor.select(hit.object.userData.placementId);}app.drag=null;});
 renderer.domElement.addEventListener('pointercancel',()=>app.drag=null);
 addEventListener('keydown',e=>{if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||e.target.isContentEditable)return;if(e.code==='Space'){if(app.mode==='walk'&&!/^(BUTTON|A)$/.test(e.target.tagName)){e.preventDefault();if(!e.repeat)app.jumpRequested=true;}return;}if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();app.keys.add(e.code);});addEventListener('keyup',e=>app.keys.delete(e.code));addEventListener('blur',()=>{app.keys.clear();app.jumpRequested=false;app.drag=null;});document.addEventListener('visibilitychange',()=>{app.keys.clear();app.jumpRequested=false;});
 addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);});
 renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();$('error').hidden=false;$('error-text').textContent='图形设备已断开，请重新载入。';});
 const dir=new T.Vector3(),target=new T.Vector3(),clip=new T.Plane(new T.Vector3(0,1,0),-.06);
 function renderReflection(){camera.updateMatrixWorld();camera.getWorldDirection(dir);target.copy(camera.position).add(dir);target.y=2*mirrorHeight-target.y;mirror.copy(camera);mirror.position.y=2*mirrorHeight-camera.position.y;mirror.up.set(0,-1,0);mirror.lookAt(target);mirror.updateMatrixWorld();matrix.copy(bias).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);roadMirror.visible=false;rain.visible=false;if(app.editor.box)app.editor.box.visible=false;renderer.clippingPlanes=[clip];renderer.setRenderTarget(reflection);renderer.render(scene,mirror);renderer.setRenderTarget(null);renderer.clippingPlanes=[];roadMirror.visible=true;rain.visible=true;if(app.editor.box)app.editor.box.visible=true;}
 const clock=new T.Clock();let time=0,frame=0,measureTime=0,measureFrames=0;
 function animate(){requestAnimationFrame(animate);const real=clock.getDelta(),dt=Math.min(real,.05);if(document.hidden)return;time+=dt;frame++;
  if(app.mode==='walk'){
   const k=app.keys,s=(k.has('KeyD')?1:0)-(k.has('KeyA')?1:0),f=(k.has('KeyW')||k.has('ArrowUp')?1:0)-(k.has('KeyS')||k.has('ArrowDown')?1:0);if(k.has('ArrowLeft'))app.yaw+=dt;if(k.has('ArrowRight'))app.yaw-=dt;const pace=(k.has('ShiftLeft')?7:3.5)*dt/Math.max(1,Math.hypot(s,f));
   const dx=(s*Math.cos(app.yaw)-f*Math.sin(app.yaw))*pace,dz=(-s*Math.sin(app.yaw)-f*Math.cos(app.yaw))*pace;
   const obstacles=world.getColliders().concat([{minX:actor.root.position.x-.3,maxX:actor.root.position.x+.3,minZ:actor.root.position.z-.3,maxZ:actor.root.position.z+.3},{minX:vehicle.position.x-1,maxX:vehicle.position.x+1,minZ:vehicle.position.z-2.1,maxZ:vehicle.position.z+2.1}]);
   let p=CityCore.move(camera.position,dx,dz,obstacles);
   if(app.jump&&!app.jump.grounded&&app.jump.feet+1.9>world.ceilingAt(p.x,p.z))p={x:camera.position.x,z:camera.position.z};
   camera.position.x=p.x;camera.position.z=p.z;
   const wasAirborne=app.jump&&!app.jump.grounded;
   if(app.jumpRequested&&!wasAirborne){host.dataset.jumpCount=String(Number(host.dataset.jumpCount||0)+1);host.dataset.jumpPeak='0';}
   app.jump=CityCore.jumpStep(app.jump,dt,world.groundAt(p.x,p.z),world.ceilingAt(p.x,p.z),app.jumpRequested);app.jumpRequested=false;
   const eye=app.jump.feet+1.86;camera.position.y=wasAirborne||!app.jump.grounded?eye:T.MathUtils.damp(camera.position.y,eye,12,dt);
   host.dataset.grounded=String(app.jump.grounded);host.dataset.jumpHeight=(app.jump.feet-world.groundAt(p.x,p.z)).toFixed(3);host.dataset.jumpPeak=String(Math.max(Number(host.dataset.jumpPeak||0),Number(host.dataset.jumpHeight)));
  }else if(app.mode==='film'){
   app.filmTime+=dt;const t=app.filmTime%24;camera.position.set(6+Math.sin(t/24*Math.PI*2)*2,3+t*.28,125-t*6);app.lookAt(new T.Vector3(-24,5,65-t*2));
  }
  camera.rotation.set(app.pitch,app.yaw,0,'YXZ');const zone=world.update(camera.position.z);
  const actorStep=(CityMotions.clips[app.clip]?.speed||0)*dt*actor.direction;const actorBlocked=app.mode==="walk"&&Math.abs(camera.position.x-actor.root.position.x)<.75&&Math.abs(camera.position.z-(actor.root.position.z+actorStep))<.85;CityMotions.update(actor,dt,actorBlocked?"idle":app.clip,app.route);const nextZ=vehicleZ-dt*5;const nearPlayer=Math.abs(camera.position.x+2)<1.6&&Math.abs(camera.position.z-nextZ)<4;const nearActor=Math.abs(actor.root.position.x+2)<1.6&&Math.abs(actor.root.position.z-nextZ)<4;if(!nearPlayer&&!nearActor)vehicleZ=nextZ;if(vehicleZ< -160)vehicleZ=160;vehicle.position.set(-2,.06,vehicleZ);vehicle.visible=vehicleZ>=-142&&vehicleZ<=142;
  for(let i=0;i<rainCount;i++){const s=seeds[i],j=i*6,y=((s[1]-time*13)%32+32)%32;positions[j]=s[0]+camera.position.x;positions[j+1]=y;positions[j+2]=s[2]+camera.position.z;const sheltered=world.underRoof(positions[j],y,positions[j+2]);positions[j+3]=positions[j]-(sheltered?0:.06);positions[j+4]=y+(sheltered?0:.6);positions[j+5]=positions[j+2];}rg.attributes.position.needsUpdate=true;wet.uniforms.time.value=time;renderReflection();composer.render();
  measureTime+=real;measureFrames++;if(frame%20===0){const inside=world.roomAt(camera.position.x,camera.position.z);host.dataset.interior=inside?'workshop':'';$('zone-title').textContent=inside?'样板店 · 室内':zone.name;$('stream-state').textContent=world.chunks.size+' 个分区已展开 · 远景保持可见';document.querySelectorAll('[data-zone]').forEach(b=>b.classList.toggle('active',b.dataset.zone===zone.id));host.dataset.zone=zone.id;host.dataset.loadedZones=[...world.chunks.keys()].join(',');host.dataset.position=camera.position.x.toFixed(2)+','+camera.position.z.toFixed(2);host.dataset.clip=app.clip;host.dataset.actorZ=actor.root.position.z.toFixed(2);$('stats').textContent=app.layout.placements.length+' 栋建筑 / '+world.objects.size+' 栋近景';}
  if(measureTime>3){host.dataset.fps=(measureFrames/measureTime).toFixed(1);measureTime=0;measureFrames=0;}
 }
 $('loading').hidden=true;host.dataset.ready='true';host.dataset.mode='walk';animate();
}catch(e){console.error(e);$('loading').hidden=true;$('error').hidden=false;$('error-text').textContent=e.message+'。请使用本地服务器打开，并确认模型与配置文件完整。';}
})();


