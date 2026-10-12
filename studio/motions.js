/* Independent clips use a shared named joint contract. Routes are separate from clips. */
window.CityMotions={
 clips:{idle:{speed:0,frequency:1,amplitude:.025},walk:{speed:1.2,frequency:7,amplitude:.5},run:{speed:2.8,frequency:11,amplitude:.85}},
 createActor(T,m){
  const root=new T.Group(),joints={};
  function box(w,h,d,x,y,z,mat,parent=root){const o=new T.Mesh(new T.BoxGeometry(w,h,d),mat);o.position.set(x,y,z);parent.add(o);return o;}
  box(.45,.62,.25,0,1.22,0,m.cloth);box(.28,.18,.25,0,1.62,0,m.dark);
  const head=new T.Mesh(new T.SphereGeometry(.15,12,8),m.skin);head.position.y=1.76;root.add(head);
  for(const side of [-1,1])for(const limb of ['arm','leg']){
   const joint=new T.Group();joint.position.set(side*(limb==='arm'?.30:.13),limb==='arm'?1.5:.9,0);root.add(joint);joints[limb+side]=joint;
   box(limb==='arm'?.13:.18,limb==='arm'?.58:.77,.19,0,limb==='arm'?-.26:-.37,0,limb==='arm'?m.cloth:m.dark,joint);
   if(limb==='leg')box(.19,.1,.32,0,-.78,.05,m.dark,joint);
  }return{root,joints,time:0,clip:'walk',direction:1};
 },
 update(actor,dt,clip,route){
  const c=this.clips[clip]||this.clips.idle;actor.time+=dt;actor.clip=clip;
  for(const side of [-1,1]){actor.joints['leg'+side].rotation.x=Math.sin(actor.time*c.frequency)*c.amplitude*side;actor.joints['arm'+side].rotation.x=-Math.sin(actor.time*c.frequency)*c.amplitude*side*.8;}
  if(route&&c.speed){actor.root.position.z+=actor.direction*c.speed*dt;if(actor.root.position.z>route.max){actor.root.position.z=route.max;actor.direction=-1;}if(actor.root.position.z<route.min){actor.root.position.z=route.min;actor.direction=1;}actor.root.rotation.y=actor.direction>0?0:Math.PI;}
 },
 vehicle(T,m){const g=new T.Group();const part=(w,h,d,x,y,z,mat)=>{const o=new T.Mesh(new T.BoxGeometry(w,h,d),mat);o.position.set(x,y,z);g.add(o);};part(1.8,.5,3.8,0,.65,0,m.steel);part(1.45,.5,1.9,0,1.05,0,m.dark);part(1.5,.07,.06,0,.7,1.93,m.pink);part(1.5,.07,.06,0,.7,-1.93,m.cyan);for(const x of [-.86,.86])for(const z of [-1.2,1.2])part(.18,.5,.65,x,.35,z,m.dark);return g;}
};
