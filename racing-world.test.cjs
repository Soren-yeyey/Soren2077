const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const T=require('./libs/three.min.js');
let host;
const context={window:{},document:{getElementById:()=>host}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'racing-world.js'),'utf8'),context);
const world=context.window.RacingWorld;
const renderer={capabilities:{getMaxAnisotropy:()=>8},getSize:v=>v.set(1280,720)};
function fixture(withUV=true){
  host={dataset:{}};
  const root=new T.Group(),texture=new T.Texture();
  const highMaterial=new T.MeshStandardMaterial({map:texture});
  const lowMaterial=new T.MeshStandardMaterial({map:texture});
  const high=new T.Mesh(new T.BoxGeometry(200,300,200),highMaterial);
  high.position.set(0,0,-1200);high.userData.asset_number=3;
  const low=new T.Mesh(new T.BoxGeometry(200,300,200),lowMaterial);
  low.userData={asset_number:3,role:'lod-prototype'};
  if(!withUV)low.geometry.deleteAttribute('uv');
  root.add(high,low);
  T.GLTFLoader=class{load(url,callback){callback({scene:root});}};
  const scene=new T.Scene();
  return {scene,high,low,runtime:world.create(T,scene,renderer,new T.MeshStandardMaterial())};
}
test('large towers retain facade detail beyond the old fixed 680m cutoff',()=>{
  assert.equal(world.needsDetail(180,1200,63,720),true);
  assert.equal(world.needsDetail(8,1200,63,720),false);
});
test('LOD has hysteresis and safe near-camera handling',()=>{
  assert.equal(world.needsDetail(60,700,63,720,false),false);
  assert.equal(world.needsDetail(60,700,63,720,true),true);
  assert.equal(world.needsDetail(180,20,63,720),true);
});
test('distance instances keep prototype material and switch exclusively',async()=>{
  const {scene,low,runtime}=fixture();await runtime.load();
  const camera=new T.PerspectiveCamera(63,16/9,.1,10000);
  runtime.update(0,camera);
  assert.equal(scene.children[0].count,1);assert.equal(scene.children[1].count,0);
  assert.equal(scene.children[1].material,low.material);
  camera.position.z=10000;runtime.update(1,camera);
  assert.equal(scene.children[0].count,0);assert.equal(scene.children[1].count,1);
});
test('invalid textured LOD without UV falls back to original mesh',async()=>{
  const {scene,high,runtime}=fixture(false);await runtime.load();
  assert.equal(scene.children.length,1);assert.equal(scene.children[0],high);
});
function readGLB(file){
  const bytes=fs.readFileSync(path.join(__dirname,'models',file)),length=bytes.readUInt32LE(12);
  const doc=JSON.parse(bytes.subarray(20,20+length));
  const binary=bytes.subarray(28+length);
  const view=i=>{const v=doc.bufferViews[i];return binary.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);};
  return {doc,view};
}
const source=readGLB('racing-world.glb'),subset=readGLB('homepage-buildings.glb');
for(const number of [3,4,26])test(`reused Tripo building ${number} preserves geometry, UV, indices and texture payloads`,()=>{
  const before=source.doc.nodes.find(n=>n.extras?.principal_building&&n.extras.asset_number===number);
  const after=subset.doc.nodes.find(n=>n.extras?.asset_number===number);
  const high=source.doc.meshes[before.mesh].primitives[0],copy=subset.doc.meshes[after.mesh].primitives[0];
  for(const semantic of Object.keys(high.attributes)){
    const a=source.doc.accessors[high.attributes[semantic]],b=subset.doc.accessors[copy.attributes[semantic]];
    assert.deepEqual({...a,bufferView:0},{...b,bufferView:0});
    assert.deepEqual(source.view(a.bufferView),subset.view(b.bufferView));
  }
  const a=source.doc.accessors[high.indices],b=subset.doc.accessors[copy.indices];
  assert.deepEqual(source.view(a.bufferView),subset.view(b.bufferView));
  const image=(asset,p)=>{
    const material=asset.doc.materials[p.material],texture=asset.doc.textures[material.pbrMetallicRoughness.baseColorTexture.index];
    return asset.view(asset.doc.images[texture.source].bufferView);
  };
  assert.deepEqual(image(source,high),image(subset,copy));
  assert.equal(after.extras.source_id,before.extras.source_id);
});
