const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const c=require('./core.js'),base=path.join(__dirname,'..'),w=JSON.parse(fs.readFileSync(path.join(base,'data/world.json'))),manifest=JSON.parse(fs.readFileSync(path.join(base,'data/assets.json'))),assetApi=require('./assets.js'),a=assetApi.normalize(manifest);
test('1000 seeds produce repeatable, spaced layouts with a landmark',()=>{for(let seed=0;seed<1000;seed++){const config={...w,seed},l=c.generate(config);assert.deepEqual(l,c.generate(config));assert.equal(c.validate(l,w,a),true);assert(l.placements.some(p=>p.asset==='central'));}});
test('reject malformed, road-occupying, overlapping and oversized placements',()=>{const l=c.generate(w);for(const change of [p=>p.x=0,p=>p.x=100,p=>p.scale=9,p=>p.x=NaN,p=>p.zone='missing',p=>p.asset='missing']){const copy=structuredClone(l);change(copy.placements[0]);assert.throws(()=>c.validate(copy,w,a));}const copy=structuredClone(l);copy.placements[1]={...copy.placements[0],id:'duplicate'};assert.throws(()=>c.validate(copy,w,a));});
test('high speed movement cannot cross solid furniture or street ends',()=>{const b=[{minX:-1,maxX:1,minZ:4,maxZ:6}];const p=c.move({x:0,z:0},0,100,b);assert(p.z<3.65);let pos={x:6,z:0},r=c.random(4);for(let i=0;i<10000;i++){pos=c.move(pos,(r()-.5)*40,(r()-.5)*40,b);assert(!c.blocked(pos.x,pos.z,b));}});
test('zone seam assignment and JSON roundtrip remain stable',()=>{assert.equal(c.zoneAt(80,w).id,'market');assert.equal(c.zoneAt(0,w).id,'tower');assert.equal(c.zoneAt(-80,w).id,'homes');const l=c.generate(w);assert.deepEqual(JSON.parse(JSON.stringify(l)),l);});
const interior=JSON.parse(fs.readFileSync(path.join(base,'data/workshop-collision.json')));
test('shop door admits entry and exit across rotation and scale while windows block',()=>{
 for(const rotation of [0,Math.PI/2,-Math.PI/2,Math.PI/4])for(const scale of [.5,1,1.4]){
  const placement={x:-20,z:65,rotation},boxes=c.workshopBoxes(placement,interior,scale);
  const at=(x,z)=>c.toWorld(x,z,placement,scale);
  const start=at(0,6.5),end=at(0,1),inside=c.move(start,end.x-start.x,end.z-start.z,boxes);
  assert(Math.hypot(inside.x-end.x,inside.z-end.z)<.02,'door must remain passable');
  const outside=c.move(inside,start.x-inside.x,start.z-inside.z,boxes);
  assert(Math.hypot(outside.x-start.x,outside.z-start.z)<.02,'exit must remain passable');
  const windowStart=at(3.5,7),windowEnd=at(3.5,2),stopped=c.move(windowStart,windowEnd.x-windowStart.x,windowEnd.z-windowStart.z,boxes);
  assert(c.toLocal(stopped.x,stopped.z,placement,scale).z>4.8,'window must stop player');
 }
});
test('shop furniture and walls block high speed movement',()=>{
 const p={x:-20,z:65,rotation:0},boxes=c.workshopBoxes(p,interior,1);
 for(const x of [-2,0,2]){const start=c.toWorld(x,0,p),stop=c.move(start,0,-20,boxes);assert(stop.z>60,'cannot escape through rear wall');}
});
test('ground surfaces have one visible top across zone seams and survive streaming',()=>{
 const vm=require('node:vm'),T=require('../libs/three.min.js');
 const context={window:{},CityCore:c};vm.createContext(context);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'materials.js'),'utf8'),context);
 context.CityMaterials=context.window.CityMaterials;
 vm.runInContext(fs.readFileSync(path.join(__dirname,'world.js'),'utf8'),context);
 const scene=new T.Scene(),prefabs=new Map(a.map(asset=>[asset.id,new T.Mesh(new T.BoxGeometry(1,1,1))]));
 const world=new context.window.CityWorld(T,scene,a,w,prefabs,interior);
 scene.updateMatrixWorld(true);
 const ray=new T.Raycaster(),down=new T.Vector3(0,-1,0);
 for(const z of [-48.001,-47.999,47.999,48.001,23.17])for(const [x,height] of [[2,.04],[13,0],[30,0],[6.3,.18]]){
  ray.set(new T.Vector3(x,2,z),down);
  const tops=ray.intersectObject(world.infrastructure,true).filter(hit=>hit.face.normal.z>.9&&hit.object===world.roadSurface||hit.face.normal.y>.9);
  assert(tops.length>0,'ground must be continuous');
  assert(Math.abs(tops[0].point.y-height)<1e-6,'ground elevation must match');
  assert.equal(tops.filter(hit=>Math.abs(hit.point.y-height)<.001).length,1,'no coincident ground tops');
 }
 const road=world.roadSurface,count=world.infrastructure.children.length;
 world.setLayout(c.generate(w));for(const z of [96,0,-96,0,96])world.update(z);
 assert.equal(world.roadSurface,road);assert.equal(world.infrastructure.children.length,count);
 assert.equal(road.parent,world.infrastructure,'streaming must preserve the road');
 for(const rotation of [0,Math.PI/2,Math.PI/4])for(const scale of [.5,1,1.4]){
  const p={x:-20,z:65,rotation};world.shops=[{placement:p,scale}];
  const front=c.toWorld(0,5.7,p,scale),room=c.toWorld(0,0,p,scale);
  assert(Math.abs(world.ceilingAt(front.x,front.z)-4.08*scale)<1e-9);
  let jump=null;
  for(let i=0;i<90;i++){
   jump=c.jumpStep(jump,1/60,world.groundAt(front.x,front.z),world.ceilingAt(front.x,front.z),i===0);
   assert(jump.feet+1.9<=4.08*scale+1e-8,'head cannot penetrate adapted canopy');
  }
  assert(Math.abs(world.ceilingAt(room.x,room.z)-interior.roofHeight*scale)<1e-9);
 }
 assert.equal(world.ceilingAt(0,0),Infinity,'street allows unobstructed jumping');
});
test('jump arc lands consistently at different frame rates without a double jump',()=>{
 for(const fps of [20,30,60,120]){
  let state=null,peak=0;
  for(let i=0;i<fps*2;i++){state=c.jumpStep(state,1/fps,.18,Infinity,i===0||i===Math.floor(fps*.2));peak=Math.max(peak,state.feet-.18);}
  assert(peak>.75&&peak<.79,'consistent jump height');assert(state.grounded);assert.equal(state.feet,.18);assert.equal(state.velocity,0);
  const second=c.jumpStep(state,1/fps,.18,Infinity,true);assert(!second.grounded,'can jump after landing');
 }
});
test('jump respects low ceilings and lands on raised interior floor',()=>{
 let state=null;
 for(let i=0;i<120;i++){state=c.jumpStep(state,1/60,.16,2.08,i===0);assert(state.feet+1.9<=2.08+1e-9);}
 assert(state.grounded);assert.equal(state.feet,.16);
 state=c.jumpStep(null,1/60,.05,Infinity,true);
 for(let i=0;i<120;i++)state=c.jumpStep(state,1/60,.32,Infinity,false);
 assert(state.grounded);assert.equal(state.feet,.32);
});
test('v2 keeps v1 placement footprints for saved layouts and 1000 generated seeds',()=>{
 const old=[['commercial',.65,[15,12]],['orion',.7,[19,14]],['nc77',.65,[18,15]],['advert',.6,[11.6,11.6]],['central',.55,[29,29]],['kael',.65,[21,14]],['workshop',1,[12.6,11.5]]].map(([id,scale,footprint])=>({id,name:id,source:id==='workshop'?'models/workshop.glb':'models/city-kit.gltf',node:id,scale,footprint}));
 const legacy=assetApi.normalize({version:1,units:'metres',assets:old});
 const layouts=[JSON.parse(fs.readFileSync(path.join(base,'data/default-layout.json')))];for(let seed=0;seed<1000;seed++)layouts.push(c.generate({...w,seed}));
 for(const layout of layouts){assert(c.validate(layout,w,a));for(const p of layout.placements)assert.deepEqual(c.footprint(p,a),c.footprint(p,legacy));}
});
test('registry rejects corrupted fields, unsafe paths and unjustified approval',()=>{
 for(const change of [m=>m.version=99,m=>m.units='centimetres',m=>m.assets[1].id=m.assets[0].id,m=>m.assets[0].source='../escape.glb',m=>m.assets[0].scale=0,m=>m.assets[0].geometry.dimensionsM[0]=NaN,m=>m.assets[0].geometry.dimensionsM[0]=2,m=>m.assets[0].triangles=42,m=>m.assets[0].status='approved',m=>m.assets[0].status='draft',m=>m.files['models/city-kit.gltf'].sha256='invalid']){
  const copy=structuredClone(manifest);change(copy);assert.throws(()=>assetApi.normalize(copy));
 }
 assert.equal(assetApi.normalize(manifest).length,7);
});
test('file validator detects changed payload and missing dependency',()=>{
 const os=require('node:os'),{check}=require('../scripts/validate-assets.cjs');
 assert.equal(check(base).valid,true);
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'city-assets-test-'));
 try{
  fs.mkdirSync(path.join(tmp,'data'),{recursive:true});fs.writeFileSync(path.join(tmp,'data/assets.json'),JSON.stringify(manifest));
  for(const file of Object.keys(manifest.files)){fs.mkdirSync(path.dirname(path.join(tmp,file)),{recursive:true});fs.copyFileSync(path.join(base,file),path.join(tmp,file));}
  assert.equal(check(tmp).valid,true);
  fs.appendFileSync(path.join(tmp,'models/city-kit.bin'),Buffer.from([0]));
  assert(check(tmp).errors.some(e=>e.includes('Hash/size mismatch')));
  fs.unlinkSync(path.join(tmp,'models/workshop.glb'));
  assert(check(tmp).errors.some(e=>e.includes('Missing file: models/workshop.glb')));
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
