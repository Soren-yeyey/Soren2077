/* Shared model requests and authored scene placements; extends data/assets.json. */
(function(root){'use strict';
function create(T,renderer,host){
 const requests=new Map(),owned=new Set(),preparedMaterials=new Set(),resources={geometries:new Set(),materials:new Set(),textures:new Set()},errors=new Map();let disposed=false;
 const manager=new T.LoadingManager();
 manager.onError=url=>{errors.set(url,'resource');publish();};
 manager.onProgress=(url,loaded,total)=>{host.dataset.assetProgress=String(Math.round(loaded/total*100));};
 const loader=new T.GLTFLoader(manager);
 function publish(){host.dataset.assetErrors=JSON.stringify([...errors.keys()]);host.dataset.modelRequests=String(requests.size);}
 function load(source){
  if(!requests.has(source)){
   const request=new Promise((resolve,reject)=>loader.load(source,gltf=>{
    if(disposed){release(gltf.scene);reject(new Error('Scene disposed'));return;}
    owned.add(gltf.scene);collect(gltf.scene,resources);gltf.scene.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material]){
     // GLTFLoader establishes sRGB for colour/emissive and linear data maps.
     // Never replace albedo, tint every building, or reinterpret data-map gamma.
     for(const key of ['map','normalMap','roughnessMap','metalnessMap','emissiveMap','aoMap'])if(m[key])m[key].anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    }});errors.delete(source);publish();resolve(gltf);
   },undefined,error=>{errors.set(source,'model');requests.delete(source);publish();reject(error);}));
   requests.set(source,request);publish();
  }
  return requests.get(source);
 }
 const configuration=fetch('data/city-scenes.json?v=scene-layout-20261029-2').then(r=>{if(!r.ok)throw Error('Scene layout HTTP '+r.status);return r.json();}).then(config=>{
  if(config.version!==1||config.upAxis!=='Y'||config.units!=='metres')throw Error('Unsupported scene coordinates');return config;
 });
 function instantiate(gltf,asset,placement){
  prepare(asset,gltf);
  const source=asset.node?gltf.scene.getObjectByName(asset.node):asset.nodePrefix?gltf.scene.children.find(o=>o.name.startsWith(asset.nodePrefix)):gltf.scene;
  if(!source)throw Error('Missing source node: '+placement.id);
  const model=source.clone(true),pivot=new T.Group();pivot.name=placement.id;pivot.userData={asset:placement.asset,source:asset.source};
  // Rotate before measuring, then normalize uniformly and ground the actual bounds.
  if(asset.rotation)model.rotation.set(...asset.rotation);model.updateMatrixWorld(true);
  const box=new T.Box3().setFromObject(model),size=box.getSize(new T.Vector3());
  if(!size.y||!placement.height)throw Error('Invalid model size: '+placement.id);
  const scale=placement.height/size.y,centre=box.getCenter(new T.Vector3());
  model.position.add(new T.Vector3(-centre.x,-box.min.y,-centre.z));pivot.add(model);pivot.scale.setScalar(scale);
  pivot.rotation.y=placement.yaw||0;pivot.position.fromArray(placement.position);
  model.traverse(o=>{if(o.isMesh){o.castShadow=!!placement.shadow;o.receiveShadow=true;o.frustumCulled=true;}});
  pivot.updateMatrixWorld(true);return pivot;
 }
 function prepare(asset,gltf){
  if(!asset.nightEmission)return;
  gltf.scene.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material]){
   if(!m.map||m.emissiveMap||preparedMaterials.has(m))continue;preparedMaterials.add(m);
   const previous=m.onBeforeCompile;
   m.onBeforeCompile=function(shader,renderer){previous.call(this,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
     // Only bright, saturated pixels already present in the source atlas emit.
     float sourcePeak=max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b));
     float sourceLow=min(diffuseColor.r,min(diffuseColor.g,diffuseColor.b));
     float sourceChroma=(sourcePeak-sourceLow)/max(.001,sourcePeak);
     float sourceNeon=smoothstep(.14,.7,sourcePeak)*smoothstep(.5,.85,sourceChroma);
     totalEmissiveRadiance+=diffuseColor.rgb*sourceNeon*.65;`);};
   m.customProgramCacheKey=()=> 'source-atlas-night-emission-v1';m.needsUpdate=true;
  }});
 }
 async function populate(name,scene,onPlaced){
  const config=await configuration,layout=config[name],placements=layout.placements;
  const results=await Promise.allSettled(placements.map(async p=>{
   const asset=config.assets[p.asset];if(!asset)throw Error('Unknown asset '+p.asset);
   const gltf=await load(asset.source);if(disposed)return;
   const object=instantiate(gltf,asset,p);let bounds=new T.Box3().setFromObject(object);
   // Only straight streets define left/right limits. Curved routes validate their
   // full footprint in their own onPlaced callback instead.
   if(layout.clearance&&p.bank==='left'&&bounds.max.x>layout.clearance.left)object.position.x-=bounds.max.x-layout.clearance.left;
   if(layout.clearance&&p.bank==='right'&&bounds.min.x<layout.clearance.right)object.position.x+=layout.clearance.right-bounds.min.x;
   object.updateMatrixWorld(true);bounds=new T.Box3().setFromObject(object);
   scene.add(object);if(onPlaced)onPlaced(object,p,bounds);return object;
  }));
  const failed=results.flatMap((r,i)=>r.status==='rejected'?[{id:placements[i].id,error:String(r.reason)}]:[]);
  host.dataset.scenePlacements=String(results.filter(r=>r.status==='fulfilled').length);host.dataset.sceneFailures=JSON.stringify(failed);
  if(failed.length)throw Error('Asset placements failed: '+failed.map(f=>f.id).join(', '));
  return {config,objects:results.map(r=>r.value)};
 }
 function collect(scene,target){scene.traverse(o=>{if(o.geometry)target.geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material]){target.materials.add(m);for(const v of Object.values(m))if(v?.isTexture)target.textures.add(v);}});}
 function free(target){target.geometries.forEach(g=>g.dispose());target.materials.forEach(m=>m.dispose());target.textures.forEach(t=>t.dispose());Object.values(target).forEach(s=>s.clear());}
 function release(scene){const target={geometries:new Set(),materials:new Set(),textures:new Set()};collect(scene,target);free(target);}
 function dispose(){if(disposed)return;disposed=true;free(resources);owned.clear();requests.clear();}
 return {load,configuration,populate,instantiate,prepare,dispose,manager,track:object=>collect(object,resources)};
}
root.CitySceneAssets={create};
})(typeof window!=='undefined'?window:globalThis);
