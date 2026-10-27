const {test}=require('node:test');
const assert=require('node:assert/strict');
const {makeTrack,Driver,resolveTraffic,frameTiming,advanceRace}=require('./racing-core.js');
const track=makeTrack();
function simulate(d,input,seconds){for(let t=0;t<seconds;t+=1/60)d.step(input,1/60);}

test('normal and low frame rates consume the same elapsed driving time',()=>{
  const fast=new Driver(track),slow=new Driver(track);
  for(let i=0;i<120;i++)fast.step({forward:true},1/60);
  for(let i=0;i<20;i++)slow.step({forward:true},.1);
  assert.ok(Math.abs(fast.speed-slow.speed)<.05);
  assert.ok(Math.hypot(fast.x-slow.x,fast.z-slow.z)<.2);
  assert.ok(Math.abs(fast.lapTime-slow.lapTime)<.05);
});
test('long active frame gap suspends without advancing the driver',()=>{
  const d=new Driver(track);d.speed=30;d.running=true;
  const before=JSON.stringify(d),timing=frameTiming(1.016,true,false);
  assert.equal(timing.suspend,true);assert.equal(timing.delta,0);
  d.step({forward:true,pause:timing.suspend},timing.delta);
  assert.equal(JSON.stringify(d),before);
});
test('frame gap policy accepts normal frames and ignores inactive/invalid input',()=>{
  assert.deepEqual(frameTiming(.1,true,false),{delta:.1,suspend:false});
  assert.equal(frameTiming(.5,true,false).suspend,false);
  assert.equal(frameTiming(1,false,false).suspend,false);
  assert.equal(frameTiming(1,true,true).suspend,false);
  for(const delta of [NaN,Infinity,-1])assert.deepEqual(frameTiming(delta,true,false),{delta:0,suspend:false});
});
test('traffic and player advance equally at 10 and 60 render frames per second',()=>{
  const a=new Driver(track),b=new Driver(track),ta=[{s:100,lane:4,speed:24}],tb=[{...ta[0]}];
  for(let i=0;i<120;i++)advanceRace(a,ta,{forward:true},1/60);
  for(let i=0;i<20;i++)advanceRace(b,tb,{forward:true},.1);
  assert.ok(Math.abs(a.speed-b.speed)<.001);assert.ok(Math.abs(ta[0].s-tb[0].s)<.001);
  assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<.001);
});
test('slow render frame cannot skip a fast closing traffic contact',()=>{
  const d=new Driver(track),p=track.sample(95),cars=[{s:101,lane:0,speed:24}];
  Object.assign(d,{x:p.x,y:p.y,z:p.z,yaw:Math.atan2(-p.tx,-p.tz),travelYaw:Math.atan2(-p.tx,-p.tz),speed:78});
  advanceRace(d,cars,{},.2);
  assert.ok(d.wall>0);assert.ok(d.speed<30);
  assert.ok(track.nearest(d.x,d.z).s<cars[0].s-4.5);
});
test('paused race freezes the player and all traffic during a long gap',()=>{
  const d=new Driver(track),cars=[{s:101,lane:0,speed:24}],before=JSON.stringify({d,cars});
  advanceRace(d,cars,{forward:true,pause:true},1);
  assert.equal(JSON.stringify({d,cars}),before);
});
test('closed track has stable wrap and length',()=>{assert.ok(track.length>2500);assert.deepEqual(track.sample(0),track.sample(track.length));});
test('nearest projects lane offsets accurately',()=>{const p=track.sample(500),n=track.nearest(p.x+p.nx*4,p.z+p.nz*4);assert.ok(Math.abs(n.lateral-4)<.1);});
test('throttle moves car forward and increases speed',()=>{const d=new Driver(track),p={x:d.x,z:d.z};simulate(d,{forward:true},1);assert.ok(d.speed>8);assert.ok(Math.hypot(d.x-p.x,d.z-p.z)>3);});
test('reverse drives backwards from rest',()=>{const d=new Driver(track);simulate(d,{reverse:true},1);assert.ok(d.speed<-8);});
test('brake stops both directions without reversing velocity',()=>{for(const speed of [20,-10]){const d=new Driver(track);d.speed=speed;simulate(d,{brake:true},1);assert.equal(d.speed,0);}});
test('steering only rotates a moving vehicle',()=>{const d=new Driver(track),yaw=d.yaw;simulate(d,{left:true},1);assert.equal(d.yaw,yaw);simulate(d,{forward:true,left:true},.5);assert.ok(d.yaw>yaw);});
test('drift retains a travel direction different from body heading',()=>{const d=new Driver(track);d.speed=20;simulate(d,{left:true,drift:true},.3);assert.ok(Math.abs(d.yaw-d.travelYaw)>.03);});
test('pause freezes position, clock and boost',()=>{const d=new Driver(track);d.speed=30;const before=JSON.stringify(d);d.step({forward:true,pause:true},.04);assert.equal(JSON.stringify(d),before);});
test('boost consumes bounded charge and regenerates',()=>{const d=new Driver(track);d.speed=20;simulate(d,{forward:true,boost:true},1);assert.ok(d.boost<1&&d.boost>=0);const before=d.boost;simulate(d,{brake:true},1);assert.ok(d.boost>before);});
test('wall contacts cannot leave the road at high speed',()=>{const d=new Driver(track);d.speed=70;simulate(d,{forward:true,right:true},5);assert.ok(track.nearest(d.x,d.z).distance<=track.width/2-1.7);});
test('reset restores drivable starting state',()=>{const d=new Driver(track);simulate(d,{forward:true},2);d.reset();assert.equal(d.speed,0);assert.equal(d.checkpoint,0);assert.equal(d.lapTime,0);assert.ok(track.nearest(d.x,d.z).distance<.001);});
test('traffic contact separates player and keeps vehicle inside road',()=>{
  const d=new Driver(track),p=track.sample(100);d.x=p.x;d.z=p.z;d.y=p.y;d.speed=30;
  assert.equal(resolveTraffic(d,{s:100,lane:0,speed:20}),true);
  assert.ok(track.nearest(d.x,d.z).distance>3);
  assert.ok(track.nearest(d.x,d.z).distance<track.width/2-1.9);
});
test('crossing start without checkpoints cannot count a lap',()=>{const d=new Driver(track),p=track.sample(1);d.x=p.x;d.z=p.z;d.speed=3;d.lastS=track.length-2;d.step({},.01);assert.equal(d.completed,0);});
test('valid checkpoint progression counts forward finish',()=>{const d=new Driver(track),p=track.sample(1);d.x=p.x;d.z=p.z;d.y=p.y;d.yaw=Math.atan2(-p.tx,-p.tz);d.speed=3;d.checkpoint=3;d.lastS=track.length-2;d.lapTime=100;d.step({},.01);assert.equal(d.completed,1);assert.ok(d.best>=100);});
test('feedback driver completes a full lap through every checkpoint',()=>{
  const d=new Driver(track);let maximumLateral=0;
  for(let i=0;i<60*180&&!d.completed;i++){
    const p=track.nearest(d.x,d.z),a=track.sample(p.s+Math.max(12,d.speed*.7));
    const wanted=Math.atan2(-(a.x-d.x),-(a.z-d.z));
    const error=Math.atan2(Math.sin(wanted-d.yaw),Math.cos(wanted-d.yaw));
    d.step({forward:true,left:error>.018,right:error<-.018,brake:Math.abs(error)>.6&&d.speed>18},1/60);
    maximumLateral=Math.max(maximumLateral,Math.abs(p.lateral));
  }
  assert.equal(d.completed,1);assert.ok(d.best>40&&d.best<180);
  assert.ok(maximumLateral<track.width/2-1.9);
});
