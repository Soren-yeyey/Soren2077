/* Reusable, non-colliding scenery for the street reference view. */
window.CityAtmosphere = function(T, scene, renderer) {
 const group = new T.Group(); group.name = 'street-atmosphere'; scene.add(group);
 const metal = new T.MeshStandardMaterial({color:0x182936, metalness:.5, roughness:.42});
 const pink = new T.MeshBasicMaterial({color:0xff73d1});
 const cyan = new T.MeshBasicMaterial({color:0x65eaff});
 const ring = new T.Group(); ring.position.set(0,12.2,39); group.add(ring);
 for (const [radius,tube,mat,z] of [[12.1,.56,metal,0],[11.55,.16,pink,.48],[12.7,.12,cyan,-.1]]) {
  const mesh = new T.Mesh(new T.TorusGeometry(radius,tube,10,100),mat); mesh.position.z=z; ring.add(mesh);
 }
 for(let i=0;i<28;i++){
  const a=i*Math.PI*2/28, segment=new T.Mesh(new T.BoxGeometry(.34,.65,.9),metal);
  segment.position.set(Math.sin(a)*12.1,Math.cos(a)*12.1,0);segment.rotation.z=-a;ring.add(segment);
 }
 const existingRing=new T.Group();existingRing.position.copy(ring.position);group.add(existingRing);
 loadExistingCityRing(T,renderer,existingRing,24.2).then(ok=>{
  if(ok){ring.visible=false;const accent=new T.Mesh(new T.TorusGeometry(11.35,.055,8,100),pink);accent.position.z=.5;existingRing.add(accent);}
  renderer.domElement.parentElement.dataset.cityRing=ok?'blender':'fallback';
 });
 const glowCanvas=document.createElement('canvas');glowCanvas.width=glowCanvas.height=256;
 const ctx=glowCanvas.getContext('2d'), gradient=ctx.createRadialGradient(128,128,3,128,128,128);
 gradient.addColorStop(0,'rgba(104,245,255,.7)');gradient.addColorStop(.3,'rgba(28,194,240,.35)');gradient.addColorStop(1,'rgba(0,100,200,0)');
 ctx.fillStyle=gradient;ctx.fillRect(0,0,256,256);
 const glowTexture=new T.CanvasTexture(glowCanvas);glowTexture.encoding=T.sRGBEncoding;
 const glow=new T.Mesh(new T.PlaneGeometry(65,65),new T.MeshBasicMaterial({map:glowTexture,transparent:true,opacity:.75,depthWrite:false,fog:false,blending:T.AdditiveBlending}));
 glow.position.set(0,17,25);group.add(glow);
 // Elevated walkways and edge lighting stay above the playable street.
 function detailBox(w,h,d,x,y,z,material){const m=new T.Mesh(new T.BoxGeometry(w,h,d),material);m.position.set(x,y,z);group.add(m);return m;}
 for(const [z,y] of [[23,14],[12,21]]){
  detailBox(76,.55,3.2,0,y,z,metal);
  detailBox(76,.07,.08,0,y+.34,z+1.62,pink);
  detailBox(76,.06,.08,0,y-.22,z+1.64,cyan);
  for(let x=-36;x<=36;x+=6)detailBox(.12,1.0,.12,x,y+.7,z+1.55,metal);
 }
 for(const side of [-1,1])for(const z of [48,64]){
  detailBox(.15,5,.15,side*12,3,z,metal);
  detailBox(.08,3.4,.08,side*11.9,3.4,z,side<0?pink:cyan);
  detailBox(2.8,.06,.15,side*13.3,5.4,z,side<0?cyan:pink);
 }
 const lamps=[];
 for(const [x,y,z,color,power,range] of [[0,13,39,0xff49b6,3,50],[0,17,25,0x3bdfff,3,70],[-15,8,58,0xff57bc,1.7,35],[15,8,58,0x3bdfff,1.7,35]]){
  const light=new T.PointLight(color,power,range,2);light.position.set(x,y,z);group.add(light);lamps.push(light);
 }
 const signCanvas=document.createElement('canvas');signCanvas.width=512;signCanvas.height=128;
 const signTexture=new T.CanvasTexture(signCanvas);signTexture.encoding=T.sRGBEncoding;
 const sign=new T.Mesh(new T.PlaneGeometry(7,1.75),new T.MeshBasicMaterial({map:signTexture,transparent:true,side:T.DoubleSide}));sign.position.set(0,27,39);group.add(sign);
 const streetSign=new T.Mesh(new T.PlaneGeometry(4.8,1.2),new T.MeshBasicMaterial({map:signTexture,transparent:true,side:T.DoubleSide}));streetSign.position.set(11,5,65);group.add(streetSign);
 let previous='';
 function update(campaign,experience){
  const choice=campaign?.missions?.market?.choice, race=experience?.race;
  const state=choice==='return'?'资料已归还':choice==='sell'?'资料副本已出售':'城市信号在线';
  const result=race?.completed?' · 最佳 '+race.best.toFixed(1)+' 秒':'';
  const text=state+result;if(text===previous)return;previous=text;
  pink.color.setHex(choice==='sell'?0xc278ff:0xff73d1);
  renderer.domElement.parentElement.dataset.cityMemory=choice||'pending';
  const c=signCanvas.getContext('2d');c.clearRect(0,0,512,128);c.fillStyle='rgba(3,20,34,.88)';c.fillRect(0,0,512,128);
  c.strokeStyle=choice==='sell'?'#ff80d1':'#70efff';c.lineWidth=4;c.strokeRect(2,2,508,124);
  c.fillStyle='#dcfbff';c.font='bold 28px Microsoft YaHei, sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(text,256,64,480);signTexture.needsUpdate=true;
 }
 // Existing Tripo prototypes are decorative, outside the walkable deck and its colliders.
 new T.GLTFLoader().load('models/homepage-buildings.glb',gltf=>{
  const detailMaterials=new Map([[3,new Set()],[4,new Set()],[26,new Set()]]);
  for(const [number,x,z,height] of [[3,-56,44,52],[4,56,45,50],[26,-64,10,55],[3,66,5,48]]){
   const src=gltf.scene.getObjectByName('tripo-building-'+String(number).padStart(2,'0'));if(!src)continue;
   const model=src.clone(true),box=new T.Box3().setFromObject(model),size=box.getSize(new T.Vector3());if(!size.y)continue;
   const centre=box.getCenter(new T.Vector3());model.position.sub(new T.Vector3(centre.x,box.min.y,centre.z));
   model.traverse(o=>{if(!o.isMesh)return;if(detailMaterials.has(number))o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();for(const m of Array.isArray(o.material)?o.material:[o.material]){if(m.map)m.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());if(m.map)detailMaterials.get(number)?.add(m);}});
   const wrapper=new T.Group();wrapper.position.set(x,0,z);wrapper.scale.setScalar(height/size.y);wrapper.add(model);group.add(wrapper);
  }
  renderer.domElement.parentElement.dataset.atmosphereBuildings='ready';
  for(const [number,materials] of detailMaterials)new T.TextureLoader().load('images/building-'+String(number).padStart(2,'0')+'-detail.webp',texture=>{
   texture.flipY=false;texture.encoding=T.sRGBEncoding;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
   for(const m of materials){m.map=texture;m.needsUpdate=true;}
   renderer.domElement.parentElement.dataset['building'+number+'Texture']='2048';
  },undefined,()=>{renderer.domElement.parentElement.dataset['building'+number+'Texture']='original';});
 },undefined,()=>{renderer.domElement.parentElement.dataset.atmosphereBuildings='fallback';});
 return {update};
};
