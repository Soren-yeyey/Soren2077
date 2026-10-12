window.CityWorld=class {
 constructor(T,scene,registry,config,prefabs,interior){this.T=T;this.scene=scene;this.registry=registry;this.config=config;this.prefabs=prefabs;this.interior=interior;this.materials=CityMaterials(T);this.chunks=new Map();this.objects=new Map();this.proxies=new Map();this.furniture=[];this.buildingColliders=[];this.shops=[];this.layout=null;this.makeInfrastructure();}
 mesh(w,h,d,x,y,z,m,parent=this.scene){const o=new this.T.Mesh(new this.T.BoxGeometry(w,h,d),m);o.position.set(x,y,z);parent.add(o);return o;}
 makeInfrastructure(){
  const T=this.T,m=this.materials;this.infrastructure=new T.Group();this.scene.add(this.infrastructure);
  for(const zone of this.config.zones){
   const g=new T.Group();g.position.z=zone.center;this.infrastructure.add(g);
   this.mesh(90,.6,96,0,-.3,0,m.steel,g);this.mesh(40,.08,96,0,-.04,0,m.walk,g);this.mesh(11,.04,96,0,.02,0,m.road,g);
   for(const x of [-7.5,7.5])this.mesh(4,.18,96,x,.09,0,m.walk,g);
   for(const x of [-5.6,5.6])this.mesh(.14,.22,96,x,.11,0,m.edge,g);
   for(let z=-46;z<48;z+=8)this.mesh(.12,.025,3,0,.052,z,m.amber,g);
   for(const x of [-8.7,8.7])for(const z of [-36,-12,12,36]){
    this.mesh(.13,6,.13,x,3,z,m.steel,g);this.mesh(.55,.1,.55,x,6,z,m.cyan,g);
    this.furniture.push({minX:x-.12,maxX:x+.12,minZ:zone.center+z-.12,maxZ:zone.center+z+.12});
   }
   for(const side of [-1,1])for(let z=-43;z<48;z+=4){this.mesh(.035,.012,3.95,side*7.5,.187,z,m.edge,g);}
   for(const x of [-44.7,44.7])this.mesh(.25,1.2,96,x,.6,0,m.steel,g);
   for(const side of [-1,1]){
    for(let z=-46;z<48;z+=3)this.mesh(7,.02,.035,side*13.5,.025,z,m.steel,g);
    for(const z of [-45,-15,16,45]){
     this.mesh(1.2,.75,2.8,side*11,.375,z,m.steel,g);this.mesh(1,.05,2.5,side*11,.77,z,m.dark,g);
     const leaves=new T.Mesh(new T.IcosahedronGeometry(.7,1),new T.MeshStandardMaterial({color:0x24493d,roughness:.8}));leaves.position.set(side*11,1,z);leaves.scale.set(.8,.55,1.7);g.add(leaves);
     this.mesh(.07,.06,2.1,side*10.37,.60,z,m.amber,g);
     this.furniture.push({minX:side*11-.7,maxX:side*11+.7,minZ:zone.center+z-1.5,maxZ:zone.center+z+1.5});
    }
   }
  }
  for(const z of [-144,144]){this.mesh(90,.7,.4,0,.35,z,m.steel);this.mesh(90,.06,.42,0,.72,z,m.cyan);}
  // Distant skyline remains as cheap instances; no generation work in the render loop.
  const r=CityCore.random(81),geo=new T.BoxGeometry(1,1,1),facade=new T.MeshStandardMaterial({color:0x142939,roughness:.65,metalness:.25});
  const count=100,inst=new T.InstancedMesh(geo,facade,count),o=new T.Object3D();
  for(let i=0;i<count;i++){const h=20+r()*100;o.position.set((i%2?1:-1)*(65+r()*220),h/2-6,-290+r()*590);o.scale.set(8+r()*16,h,10+r()*12);o.updateMatrix();inst.setMatrixAt(i,o.matrix);}this.scene.add(inst);
 }
 setLayout(layout){
  CityCore.validate(layout,this.config,this.registry);this.layout=JSON.parse(JSON.stringify(layout));
  this.buildingColliders=[];this.shops=[];
  for(const p of this.layout.placements){const a=this.registry.find(a=>a.id===p.asset),s=a.scale*p.scale;if(p.asset==='workshop'){this.buildingColliders.push(...CityCore.workshopBoxes(p,this.interior,s));this.shops.push({placement:p,scale:s});}else this.buildingColliders.push(CityCore.footprint(p,this.registry));}
  this.colliders=this.furniture.concat(this.buildingColliders);
  for(const g of this.chunks.values())this.scene.remove(g);this.chunks.clear();this.objects.clear();
  for(const o of this.proxies.values()){this.scene.remove(o);o.geometry.dispose();}this.proxies.clear();
  for(const p of layout.placements){const b=CityCore.footprint(p,this.registry),a=this.registry.find(a=>a.id===p.asset),src=this.prefabs.get(a.id);src.updateMatrixWorld(true);const height=new this.T.Box3().setFromObject(src).getSize(new this.T.Vector3()).y*a.scale*p.scale;const o=this.mesh(b.maxX-b.minX,height,b.maxZ-b.minZ,p.x,height/2,p.z,this.materials.steel);this.proxies.set(p.id,o);}
  this.activeKey='';
 }
 update(z,force=false){
  const zone=CityCore.zoneAt(z,this.config),idx=this.config.zones.indexOf(zone);const near=this.config.zones.filter((_,i)=>Math.abs(i-idx)<=1).map(x=>x.id),key=near.join();
  if(!force&&key===this.activeKey)return zone;this.activeKey=key;
  for(const [id,g] of this.chunks)if(!near.includes(id)){this.scene.remove(g);this.chunks.delete(id);for(const p of this.layout.placements.filter(p=>p.zone===id)){this.objects.delete(p.id);this.proxies.get(p.id).visible=true;}}
  for(const id of near)if(!this.chunks.has(id)){
   const group=new this.T.Group();group.name=id;this.scene.add(group);this.chunks.set(id,group);
   for(const p of this.layout.placements.filter(p=>p.zone===id)){
    const a=this.registry.find(a=>a.id===p.asset),o=this.prefabs.get(a.id).clone(true);o.position.set(p.x,0,p.z);o.rotation.y=p.rotation;o.scale.setScalar(a.scale*p.scale);o.userData.placementId=p.id;
    o.traverse(c=>{c.userData.placementId=p.id;});group.add(o);this.objects.set(p.id,o);this.proxies.get(p.id).visible=false;
   }
  }return zone;
 }
 getColliders(){return this.colliders||this.furniture;}
 roomAt(x,z){const f=this.interior.floor;for(const shop of this.shops){const p=CityCore.toLocal(x,z,shop.placement,shop.scale);if(p.x>f.minX&&p.x<f.maxX&&p.z>f.minZ&&p.z<f.maxZ)return shop;}return null;}
 groundAt(x,z){const shop=this.roomAt(x,z);if(shop)return this.interior.floor.height*shop.scale;return Math.abs(x)>5.6&&Math.abs(x)<9.5?.18:.05;}
 underRoof(x,y,z){const shop=this.roomAt(x,z);return shop&&y<this.interior.roofHeight*shop.scale;}
};
