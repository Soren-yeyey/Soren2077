const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const Three=require('../libs/three.min.js');
function fixture(){
 const config={version:1,units:'metres',upAxis:'Y',assets:{tower:{source:'models/tower.glb'}},home:{clearance:{left:-20,right:5},placements:[{id:'a',asset:'tower',position:[0,22,0],height:40,yaw:.6,bank:'left'},{id:'b',asset:'tower',position:[0,22,-60],height:30,yaw:-.6,bank:'right'}]}};
 const model=new Three.Group(),texture=new Three.Texture(),normal=new Three.Texture();
 const material=new Three.MeshStandardMaterial({map:texture,normalMap:normal,color:0x9acbdb,metalness:.22,roughness:.71});
 const mesh=new Three.Mesh(new Three.BoxGeometry(2,4,3),material);mesh.position.set(3,10,-2);model.add(mesh);model.rotation.z=.1;
 let loads=0,fail=false,pending=null;const T=Object.create(Three);
 T.GLTFLoader=class{load(url,success,progress,error){loads++;queueMicrotask(()=>{if(pending){pending.push(()=>success({scene:model}));return;}if(fail)error(Error('missing'));else success({scene:model});});}};
 const context={window:{},fetch:async()=>({ok:true,json:async()=>config}),queueMicrotask};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'scene-assets.js'),'utf8'),context);
 const host={dataset:{}},runtime=context.window.CitySceneAssets.create(T,{capabilities:{getMaxAnisotropy:()=>8}},host);
 return {runtime,T,host,config,model,material,texture,normal,get loads(){return loads;},setFail:v=>fail=v,setPending:v=>pending=v};
}
test('simultaneous placements request a shared GLB once, preserve authored material and ground rotated assets',async()=>{
 const f=fixture(),scene=new f.T.Scene(),before=f.material.color.getHex();const result=await f.runtime.populate('home',scene);
 assert.equal(f.loads,1);assert.equal(result.objects.length,2);assert.equal(f.material.color.getHex(),before);assert.equal(f.material.roughness,.71);assert.equal(f.material.metalness,.22);assert.equal(f.material.map,f.texture);assert.equal(f.material.normalMap,f.normal);
 const [a,b]=result.objects.map(o=>new f.T.Box3().setFromObject(o));assert.ok(Math.abs(a.min.y-22)<1e-6);assert.ok(Math.abs(a.max.y-a.min.y-40)<1e-6);assert.ok(a.max.x<=-20+1e-6);assert.ok(b.min.x>=5-1e-6);
 assert.equal(f.host.dataset.sceneFailures,'[]');
});
test('race placements with bank labels and no straight-street clearance reach the route validator',async()=>{
 const f=fixture(),scene=new f.T.Scene(),seen=[];
 f.config.race={placements:[{id:'turn-left',asset:'tower',position:[14,-62,-140],height:20,yaw:.4,bank:'left'},{id:'turn-right',asset:'tower',position:[-14,-62,-160],height:20,yaw:-.4,bank:'right'}]};
 const result=await f.runtime.populate('race',scene,(object,placement,bounds)=>seen.push({id:placement.id,x:object.position.x,minY:bounds.min.y}));
 assert.equal(result.objects.length,2);assert.deepEqual(seen.map(x=>x.id),['turn-left','turn-right']);
 assert.deepEqual(seen.map(x=>x.x),[14,-14]);for(const entry of seen)assert.ok(Math.abs(entry.minY+62)<1e-6);
 assert.equal(f.host.dataset.sceneFailures,'[]');
});
test('failed primary models stay visible in diagnostics and can retry without a poisoned cache',async()=>{
 const f=fixture();f.setFail(true);await assert.rejects(f.runtime.populate('home',new f.T.Scene()),/Asset placements failed/);assert.match(f.host.dataset.assetErrors,/tower.glb/);assert.equal(JSON.parse(f.host.dataset.sceneFailures).length,2);
 f.setFail(false);await f.runtime.load('models/tower.glb');assert.equal(f.loads,2);assert.equal(f.host.dataset.assetErrors,'[]');
});
test('disposal releases meshes moved out of their loader root, once for shared resources',async()=>{
 const f=fixture();await f.runtime.load('models/tower.glb');const mesh=f.model.children[0];mesh.removeFromParent();let geometry=0,material=0,texture=0;
 mesh.geometry.addEventListener('dispose',()=>geometry++);f.material.addEventListener('dispose',()=>material++);f.texture.addEventListener('dispose',()=>texture++);
 f.runtime.dispose();f.runtime.dispose();assert.deepEqual([geometry,material,texture],[1,1,1]);
});
test('a model resolving after scene disposal releases resources and rejects placement',async()=>{
 const f=fixture(),pending=[];f.setPending(pending);const request=f.runtime.load('models/tower.glb');await new Promise(resolve=>setImmediate(resolve));let disposed=0;f.model.children[0].geometry.addEventListener('dispose',()=>disposed++);f.runtime.dispose();pending[0]();await assert.rejects(request,/Scene disposed/);assert.equal(disposed,1);
});
