/* Tripo assets assembled, scaled, and checked in the Blender production scene. */
(()=>{'use strict';
// Screen size matters: a 350 m tower remains a foreground object beyond 680 m.
// Hysteresis keeps the selected mesh stable while driving near a boundary.
function needsDetail(radius,distance,fov,height,previous=false){
  const pixels=radius*height/(Math.max(1,distance-radius)*Math.tan(fov*Math.PI/360));
  return pixels>(previous?110:150);
}
window.RacingWorld={needsDetail,create(T,scene,renderer,roadMaterial,sceneAssets){
  const host=document.getElementById('race-world');
  const groups=[],lodGroups=[],upgrades=new Map(),upgradedGeometry=new Map();let root=null,lastUpdate=-1,referenceView=null,cityScale=1;
  function loadWorld(){return new Promise((resolve,reject)=>{
    const success=gltf=>{
      root=gltf.scene;root.name='blender-complete-racing-world';
      root.updateMatrixWorld(true);
      // Shrink each authored city cluster around its own centre, including the
      // source's explicitly mounted signs/windows. Roads and traffic keep their scale.
      if(cityScale<1){
        const mounts=new Map();let mounted=0;
        root.traverse(o=>{if(!o.isMesh||!o.userData.principal_building)return;o.geometry.computeBoundingBox();const centre=o.geometry.boundingBox.getCenter(new T.Vector3()).applyMatrix4(o.matrixWorld);
          const transform=new T.Matrix4().makeTranslation(centre.x,centre.y,centre.z).multiply(new T.Matrix4().makeScale(cityScale,cityScale,cityScale)).multiply(new T.Matrix4().makeTranslation(-centre.x,-centre.y,-centre.z));mounts.set(o.name,transform);});
        root.traverse(o=>{if(!o.isMesh)return;const name=o.userData.principal_building?o.name:o.userData.mounted_on,transform=name&&(mounts.get(name)||mounts.get(T.PropertyBinding.sanitizeNodeName(name)));if(transform){o.matrixWorld.premultiply(transform);mounted++;}});
        host.dataset.cityClusterScale=String(cityScale);host.dataset.clusterObjects=String(mounted);
      }
      const batches=new Map(),lods=new Map();let sourceMeshes=0;
      root.traverse(o=>{if(o.isMesh&&o.userData.role==='lod-prototype')lods.set(o.userData.asset_number,o);});
      root.traverse(o=>{
        if(!o.isMesh||o.userData.role==='lod-prototype')return;
        const upgrade=upgrades.get(o.userData.asset_number);
        if(upgrade){
          if(!upgradedGeometry.has(o.geometry.uuid)){
            o.geometry.computeBoundingBox();const old=o.geometry.boundingBox,centre=old.getCenter(new T.Vector3());
            const geometry=upgrade.geometry.clone();geometry.computeBoundingBox();const size=geometry.boundingBox.getSize(new T.Vector3()),envelope=old.getSize(new T.Vector3());
            // Stay inside the previously checked road-clearance envelope on every axis.
            const scale=Math.min(envelope.x/size.x,envelope.y/size.y,envelope.z/size.z);
            geometry.center();geometry.scale(scale,scale,scale);geometry.translate(centre.x,centre.y,centre.z);
            upgradedGeometry.set(o.geometry.uuid,geometry);
          }
          o.geometry=upgradedGeometry.get(o.geometry.uuid);o.material=upgrade.material;sceneAssets.track(o);
        }
        sourceMeshes++;
        const materials=Array.isArray(o.material)?o.material:[o.material];
        for(const m of materials){
          if(m.name.startsWith('rw-road-surface')){
            if(Array.isArray(o.material))o.material=o.material.map(x=>x===m?roadMaterial:x);
            else o.material=roadMaterial;
          }else if(m.map){
            m.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
          }
        }
        const mats=Array.isArray(o.material)?o.material:[o.material];
        const key=o.geometry.uuid+'|'+mats.map(m=>m.uuid).join(',');
        const prototype=lods.get(o.userData.asset_number);
        // A simplified mesh must retain both UVs and its own material bindings.
        const lod=prototype&&(!materials.some(m=>m.map)||prototype.geometry.attributes.uv)?prototype:null;
        if(!batches.has(key))batches.set(key,{geometry:o.geometry,material:o.material,items:[],lod});
        batches.get(key).items.push(o);
      });
      for(const b of batches.values()){
        if(b.lod){
          const high=new T.InstancedMesh(b.geometry,b.material,b.items.length);
          const low=new T.InstancedMesh(b.lod.geometry,b.lod.material,b.items.length);
          high.name='racing-world-detail-'+groups.length;low.name='racing-world-distance-'+groups.length;
          high.frustumCulled=low.frustumCulled=false;high.count=0;
          if(!b.geometry.boundingSphere)b.geometry.computeBoundingSphere();
          const items=b.items.map((o,i)=>{
            low.setMatrixAt(i,o.matrixWorld);
            const scale=new T.Vector3().setFromMatrixScale(o.matrixWorld);
            const radius=b.geometry.boundingSphere.radius*Math.max(Math.abs(scale.x),Math.abs(scale.y),Math.abs(scale.z));
            return {matrix:o.matrixWorld.clone(),position:b.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld),radius,detailed:false};
          });
          low.instanceMatrix.needsUpdate=true;scene.add(high,low);groups.push(high,low);
          lodGroups.push({high,low,items});continue;
        }
        if(b.items.length===1){
          const o=b.items[0];o.matrixAutoUpdate=false;o.matrix.copy(o.matrixWorld);
          o.matrixWorld.copy(o.matrix);o.removeFromParent();scene.add(o);groups.push(o);
          continue;
        }
        const inst=new T.InstancedMesh(b.geometry,b.material,b.items.length);
        inst.name='racing-world-batch-'+groups.length;inst.frustumCulled=false;
        b.items.forEach((o,i)=>inst.setMatrixAt(i,o.matrixWorld));
        inst.instanceMatrix.needsUpdate=true;scene.add(inst);groups.push(inst);
      }
      host.dataset.racingWorld='ready';host.dataset.racingWorldSource='blender';
      host.dataset.worldMeshes=String(sourceMeshes);host.dataset.worldBatches=String(groups.length);
      host.dataset.buildings=String(gltf.scene.userData.building_instances||0);
      host.dataset.tripoAssets=String(gltf.scene.userData.asset_kinds||26);
      resolve(root);
    };
    const progress=event=>{
      if(event.total)host.dataset.worldLoading=String(Math.round(event.loaded/event.total*100));
    };
    if(sceneAssets)sceneAssets.load('models/racing-world.glb').then(success,reject);
    else new T.GLTFLoader().load('models/racing-world.glb',success,progress,reject);
  });}
  async function load(){
    if(sceneAssets){
      const config=await sceneAssets.configuration;
      cityScale=T.MathUtils.clamp(config.race.existingCityScale||1,.5,1);
      await Promise.all([[3,'commercial-island'],[4,'mechanical-tower'],[26,'portrait-tower']].map(async([number,id])=>{
        const asset=config.assets[id],gltf=await sceneAssets.load(asset.source);let mesh;sceneAssets.prepare(asset,gltf);
        gltf.scene.updateMatrixWorld(true);gltf.scene.traverse(o=>{if(o.isMesh&&!mesh)mesh=o;});
        if(!mesh)throw Error('Missing detailed Tripo prototype: '+id);
        const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
        if(asset.rotation)geometry.applyMatrix4(new T.Matrix4().makeRotationFromEuler(new T.Euler(...asset.rotation)));
        upgrades.set(number,{geometry,material:mesh.material});sceneAssets.track(new T.Mesh(geometry,mesh.material));
      }));
      host.dataset.upgradedPrototypes='3,4,26';host.dataset.upgradeEnvelope='contained';
    }
    await loadWorld();
    if(sceneAssets){
      // Check the full rotated footprint against the player's closed route.
      const track=BoozeRacing.makeTrack();let corrections=0;
      const result=await sceneAssets.populate('race',scene,(object,placement,bounds)=>{
        const intrudes=()=>track.raw.some(p=>p.y+4>=bounds.min.y&&p.y-1<=bounds.max.y&&p.x>=bounds.min.x-24&&p.x<=bounds.max.x+24&&p.z>=bounds.min.z-24&&p.z<=bounds.max.z+24);
        let attempts=0;
        while(intrudes()&&attempts++<30){object.position.x+=object.position.x<-200?-32:32;object.updateMatrixWorld(true);bounds.setFromObject(object);corrections++;}
        if(intrudes()){object.removeFromParent();throw Error('Building blocks route: '+placement.id);}
        if(placement.foundation){const size=bounds.getSize(new T.Vector3()),centre=bounds.getCenter(new T.Vector3());
          const base=new T.Mesh(new T.BoxGeometry(size.x+8,8,size.z+8),new T.MeshStandardMaterial({color:0x172733,roughness:.8}));base.position.set(centre.x,bounds.min.y-4,centre.z);scene.add(base);groups.push(base);
        }
        groups.push(object);
      });
      referenceView=result.config.race.referenceCamera;
      host.dataset.routeClearance='verified';host.dataset.clearanceCorrections=String(corrections);host.dataset.routeSamples=String(track.raw.length);
      host.dataset.materialPolicy='source-textures';host.dataset.heroAssets=String(result.config.race.placements.filter(p=>!p.id.startsWith('race-depth-')).length);host.dataset.totalCityInstances=String(Number(host.dataset.buildings)+result.objects.length);
    }
    return root;
  }
  function update(time,camera){
    if(time-lastUpdate<.2&&lastUpdate>=0)return;lastUpdate=time;
    let detailed=0,distant=0;const height=renderer.getSize(new T.Vector2()).y;
    for(const group of lodGroups){
      let near=0,far=0;
      for(const item of group.items){
        item.detailed=needsDetail(item.radius,item.position.distanceTo(camera.position),camera.fov,height,item.detailed);
        if(item.detailed)group.high.setMatrixAt(near++,item.matrix);
        else group.low.setMatrixAt(far++,item.matrix);
      }
      group.high.count=near;group.low.count=far;
      group.high.instanceMatrix.needsUpdate=true;group.low.instanceMatrix.needsUpdate=true;
      detailed+=near;distant+=far;
    }
    host.dataset.detailedInstances=String(detailed);host.dataset.distantInstances=String(distant);host.dataset.lodPolicy='screen-size';
  }
  return {load,update,getReferenceView:()=>referenceView||(root&&root.userData.reference_camera)};
}};
})();
