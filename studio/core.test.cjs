const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const c=require('./core.js'),base=path.join(__dirname,'..'),w=JSON.parse(fs.readFileSync(path.join(base,'data/world.json'))),a=JSON.parse(fs.readFileSync(path.join(base,'data/assets.json'))).assets;
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
