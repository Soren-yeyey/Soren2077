/* Deterministic arcade driving and closed-track geometry, shared by browser/tests. */
(function(root){'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const wrap=(v,n)=>(v%n+n)%n;
function frameTiming(delta,active,paused){
  if(!Number.isFinite(delta)||delta<0)return {delta:0,suspend:false};
  const suspend=active&&!paused&&delta>.5;
  return {delta:suspend?0:Math.min(delta,.5),suspend};
}
function makeTrack(count=1600){
  const controls=[[284.464742,202,280.79833],[139.011635,207,388.818661],[-27.871553,220,388.830886],[-188.771854,235,261.508103],[-360.163601,250,64.976005],[-555.523571,270,-122.865626],[-759.404571,283,-66.673675],[-815.11266,278,199.684364],[-584.253655,259,321.459224],[-434.908615,239,172.391934],[-285.720787,200,-77.793972],[-120.348602,170,-254.57643],[89.986924,179,-134.747536],[220.633913,194,93.246676]];
  const raw=[];let length=0;
  for(let i=0;i<=count;i++){
    const u=(i/count)*controls.length,k=Math.floor(u),t=u-k;
    const p=[-1,0,1,2].map(d=>controls[wrap(k+d,controls.length)]);
    const v=[0,1,2].map(a=>.5*((2*p[1][a])+(-p[0][a]+p[2][a])*t+
      (2*p[0][a]-5*p[1][a]+4*p[2][a]-p[3][a])*t*t+
      (-p[0][a]+3*p[1][a]-3*p[2][a]+p[3][a])*t*t*t));
    if(i)length+=Math.hypot(v[0]-raw[i-1].x,v[2]-raw[i-1].z);
    raw.push({x:v[0],y:v[1],z:v[2],s:length});
  }
  function sample(s){
    s=wrap(s,length);let lo=0,hi=raw.length-1;
    while(hi-lo>1){const m=(lo+hi)>>1;if(raw[m].s>s)hi=m;else lo=m;}
    const a=raw[lo],b=raw[hi],t=(s-a.s)/(b.s-a.s||1),dx=b.x-a.x,dz=b.z-a.z;
    const mag=Math.hypot(dx,dz)||1;
    return {x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t),z:lerp(a.z,b.z,t),s,
      tx:dx/mag,tz:dz/mag,nx:-dz/mag,nz:dx/mag,slope:(b.y-a.y)/mag};
  }
  function nearest(x,z){
    let best=Infinity,result;
    for(let i=0;i<raw.length-1;i++){
      const a=raw[i],b=raw[i+1],dx=b.x-a.x,dz=b.z-a.z;
      const t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);
      const px=a.x+t*dx,pz=a.z+t*dz,d=(x-px)**2+(z-pz)**2;
      if(d<best){best=d;const v=sample(a.s+t*(b.s-a.s));
        result={...v,distance:Math.sqrt(d),lateral:(x-px)*v.nx+(z-pz)*v.nz};}
    }return result;
  }
  return {raw,length,sample,nearest,width:40};
}
class Driver{
  constructor(track){this.track=track;this.best=null;this.reset();}
  reset(){const p=this.track.sample(8);Object.assign(this,{x:p.x,y:p.y,z:p.z,
    yaw:Math.atan2(-p.tx,-p.tz),travelYaw:Math.atan2(-p.tx,-p.tz),speed:0,steer:0,boost:1,wall:0,
    lapTime:0,lap:1,checkpoint:0,lastS:p.s,running:false,completed:0});}
  step(input,delta){
    if(input.pause)return;
    // Subdivide the actual elapsed time so lower frame rates do not slow the race.
    const dt=Number.isFinite(delta)?clamp(delta,0,.5):0;if(!dt)return;
    const steps=Math.max(1,Math.ceil(dt/.008));
    for(let i=0;i<steps;i++)this.integrate(input,dt/steps);
  }
  integrate(input,dt){
    this.wall=Math.max(0,this.wall-dt*3);
    const gas=Number(!!input.forward)-Number(!!input.reverse),hand=!!input.drift;
    const boosting=!!input.boost&&input.forward&&this.boost>.03&&this.speed>8;
    if(boosting)this.boost=Math.max(0,this.boost-dt*.24);
    else this.boost=Math.min(1,this.boost+dt*.09);
    const brake=!!input.brake;
    const targetSteer=Number(!!input.left)-Number(!!input.right);
    this.steer=lerp(this.steer,targetSteer,1-Math.exp(-dt*9));
    if(brake){const loss=(hand?39:27)*dt;this.speed=Math.sign(this.speed)*Math.max(0,Math.abs(this.speed)-loss);}
    else if(gas){
      if(gas*this.speed<0)this.speed+=gas*29*dt;
      else this.speed+=gas*(boosting?22:12)*dt;
    }else this.speed*=Math.exp(-.48*dt);
    this.speed-=this.speed*Math.abs(this.speed)*.00125*dt;
    this.speed=clamp(this.speed,-13,boosting?78:58);
    const steering=.42/(1+Math.abs(this.speed)*.065);
    this.yaw+=this.speed/3.4*Math.tan(this.steer*steering)*(hand?1.7:1)*dt;
    const directionError=Math.atan2(Math.sin(this.yaw-this.travelYaw),Math.cos(this.yaw-this.travelYaw));
    this.travelYaw+=directionError*(1-Math.exp(-(hand?1.9:12)*dt));
    const nx=this.x-Math.sin(this.travelYaw)*this.speed*dt;
    const nz=this.z-Math.cos(this.travelYaw)*this.speed*dt;
    const p=this.track.nearest(nx,nz),limit=this.track.width/2-1.9;
    if(Math.abs(p.lateral)>limit){
      const sign=Math.sign(p.lateral);
      this.x=p.x+p.nx*sign*limit;this.z=p.z+p.nz*sign*limit;
      this.speed*=Math.exp(-dt*6);this.wall=1;
      // Gradually align forward travel with the wall instead of pinning the car in place.
      if(this.speed>2){const wanted=Math.atan2(-p.tx,-p.tz);
        const difference=Math.atan2(Math.sin(wanted-this.yaw),Math.cos(wanted-this.yaw));
        this.yaw+=clamp(difference,-dt*1.8,dt*1.8);}
    }else{this.x=nx;this.z=nz;}
    this.y=p.y;this.road=p;
    if(Math.abs(this.speed)>1)this.running=true;
    if(this.running)this.lapTime+=dt;
    const q=p.s/this.track.length;
    if(this.checkpoint<3&&q>(this.checkpoint+1)/4&&q<(this.checkpoint+1)/4+.06&&this.speed>0)this.checkpoint++;
    if(this.lastS>this.track.length*.94&&p.s<this.track.length*.06&&this.speed>0&&this.checkpoint===3){
      this.best=this.best===null?this.lapTime:Math.min(this.best,this.lapTime);
      this.completed++;this.lap++;this.lapTime=0;this.checkpoint=0;
    }this.lastS=p.s;
  }
}
function resolveTraffic(driver,other){
  const p=driver.track.sample(other.s),x=p.x+p.nx*other.lane,z=p.z+p.nz*other.lane;
  const dx=driver.x-x,dz=driver.z-z;
  const along=dx*p.tx+dz*p.tz,side=dx*p.nx+dz*p.nz;
  if(Math.abs(driver.y-p.y)>3||Math.abs(along)>=5||Math.abs(side)>=3.25)return false;
  if(Math.abs(along)>3.5){
    const direction=Math.sign(along)||-1,amount=5-Math.abs(along);
    driver.x+=p.tx*direction*amount;driver.z+=p.tz*direction*amount;
    driver.speed=Math.min(driver.speed,other.speed*.92);
  }else{
    const amount=(3.25-Math.abs(side))*(Math.sign(side)||1);
    driver.x+=p.nx*amount;driver.z+=p.nz*amount;driver.speed*=.9;
  }
  const road=driver.track.nearest(driver.x,driver.z),limit=driver.track.width/2-1.9;
  const lane=clamp(road.lateral,-limit,limit);
  driver.x=road.x+road.nx*lane;driver.z=road.z+road.nz*lane;driver.y=road.y;driver.wall=1;
  return true;
}
function advanceRace(driver,traffic,input,delta){
  if(input.pause||!Number.isFinite(delta)||delta<=0)return;
  const dt=Math.min(delta,.5),steps=Math.max(1,Math.ceil(dt/(1/60))),h=dt/steps;
  // Advance every vehicle and resolve contacts together, even on a slow render frame.
  for(let i=0;i<steps;i++){
    traffic.forEach(a=>{a.s+=a.speed*h;});
    driver.step(input,h);
    traffic.forEach(a=>resolveTraffic(driver,a));
  }
}
const api={makeTrack,Driver,clamp,resolveTraffic,frameTiming,advanceRace};root.BoozeRacing=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
