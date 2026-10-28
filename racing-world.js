/* Tripo assets assembled, scaled, and checked in the Blender production scene. */
(()=>{'use strict';
// Screen size matters: a 350 m tower remains a foreground object beyond 680 m.
// Hysteresis keeps the selected mesh stable while driving near a boundary.
function needsDetail(radius,distance,fov,height,previous=false){
  const pixels=radius*height/(Math.max(1,distance-radius)*Math.tan(fov*Math.PI/360));
  return pixels>(previous?110:150);
}
window.RacingWorld={needsDetail,create(T,scene,renderer,roadMaterial){
  const host=document.getElementById('race-world');
  const groups=[],lodGroups=[];let root=null,lastUpdate=-1;
  function load(){return new Promise((resolve,reject)=>{
    new T.GLTFLoader().load('models/racing-world.glb?v=tripo-replacement',gltf=>{
      root=gltf.scene;root.name='blender-complete-racing-world';
      root.updateMatrixWorld(true);
      const batches=new Map(),lods=new Map();let sourceMeshes=0;
      root.traverse(o=>{if(o.isMesh&&o.userData.role==='lod-prototype')lods.set(o.userData.asset_number,o);});
      root.traverse(o=>{
        if(!o.isMesh||o.userData.role==='lod-prototype')return;
        sourceMeshes++;
        const materials=Array.isArray(o.material)?o.material:[o.material];
        for(const m of materials){
          if(m.name.startsWith('rw-road-surface')){
            if(Array.isArray(o.material))o.material=o.material.map(x=>x===m?roadMaterial:x);
            else o.material=roadMaterial;
          }else if(m.map){
            m.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
            m.roughness=Math.max(.36,m.roughness);m.metalness=Math.min(.6,m.metalness);
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
    },event=>{
      if(event.total)host.dataset.worldLoading=String(Math.round(event.loaded/event.total*100));
    },reject);
  });}
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
  return {load,update,getReferenceView:()=>root&&root.userData.reference_camera};
}};
})();
