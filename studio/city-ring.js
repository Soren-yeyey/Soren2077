/* Load the already-authored Blender ring; caller retains a visible fallback on error. */
window.loadExistingCityRing = function(T, renderer, parent, diameter) {
 return new Promise(resolve=>new T.GLTFLoader().load('models/city-ring.glb',gltf=>{
  const source=gltf.scene.getObjectByName('city-ring-20');
  if(!source){resolve(false);return;}
  const bounds=new T.Box3().setFromObject(source), size=bounds.getSize(new T.Vector3());
  if(!size.y||!size.z){resolve(false);return;}
  const center=bounds.getCenter(new T.Vector3()), materials=new Set();
  source.position.sub(center);
  source.traverse(o=>{if(!o.isMesh)return;o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.map)materials.add(m);});
  const model=new T.Group();model.rotation.y=Math.PI/2;model.scale.setScalar(diameter/Math.max(size.y,size.z));model.add(source);parent.add(model);
  new T.TextureLoader().load('images/city-ring-detail.webp',texture=>{
   texture.flipY=false;texture.encoding=T.sRGBEncoding;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
   for(const material of materials){material.map=texture;material.needsUpdate=true;}
  },undefined,()=>{});
  resolve(true);
 },undefined,()=>resolve(false)));
};
