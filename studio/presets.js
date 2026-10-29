/* Runtime variations preserve existing textures and classify surface roles. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CityPresets=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const MATERIALS=Object.freeze({
 neon:{label:'冷色霓虹',facade:0x7299b4,metal:0x9baebc,ground:0x607887,glass:0x8ab9d1,sign:0x91d8ff},
 industrial:{label:'暖色工业',facade:0xad8866,metal:0xb6a08b,ground:0x837468,glass:0x9cb7c5,sign:0xffc08a}
});
const ENVIRONMENTS=Object.freeze({
 night:{label:'明亮城区',background:0xc5dcee,fog:.0024,ambient:1.8,sun:2.2,exposure:1.08,bloom:.12,sky:0xffffff,skyGain:1},
 mist:{label:'明亮薄雾',background:0xdce7ef,fog:.0032,ambient:1.95,sun:1.7,exposure:1.10,bloom:.10,sky:0xf1f8ff,skyGain:1}
});
function category(name){
 name=String(name||'').toLowerCase();
 if(/skin|cloth|leaf|foliage|wood/.test(name))return 'preserve';
 if(/glass|glazing/.test(name))return 'glass';
 if(/screen|sign|neon|cyan|amber|pink|warm|bar|cafe|drink|future|orion|kael|access/.test(name))return 'sign';
 if(/city-road|city-walk|road|pavement|asphalt/.test(name))return 'ground';
 if(/metal|steel|frame|trim|edge/.test(name))return 'metal';
 if(/concrete|stone|enamel|wall|apartment|interior/.test(name))return 'facade';
 return 'preserve';
}
function create(T,app,lights){
 const originals=new WeakMap();let currentMaterial=null,currentEnvironment=null;
 function changeMaterial(id){
  const preset=MATERIALS[id];if(!preset)throw Error('未知材质预设');
  const seen=new Set();app.scene.traverse(o=>{
   if(!o.isMesh)return;
   for(const material of Array.isArray(o.material)?o.material:[o.material]){
    if(!material?.isMeshStandardMaterial||seen.has(material))continue;seen.add(material);
    if(!originals.has(material))originals.set(material,{color:material.color.clone(),emissive:material.emissive.clone(),roughness:material.roughness,metalness:material.metalness,intensity:material.emissiveIntensity});
    const base=originals.get(material),role=category(material.name);material.color.copy(base.color);material.emissive.copy(base.emissive);material.roughness=base.roughness;material.metalness=base.metalness;material.emissiveIntensity=base.intensity;
    if(role==='preserve')continue;
    if(role==='sign'){material.emissive.multiply(new T.Color(preset.sign));material.emissiveIntensity=Math.min(1.6,base.intensity*(id==='industrial'?.86:1));}
    else if(role==='glass'){material.color.lerp(new T.Color(preset.glass),.12);material.roughness=Math.min(base.roughness,.22);}
    else if(role==='metal'){material.color.lerp(new T.Color(preset.metal),.16);material.roughness=Math.max(.24,base.roughness*(id==='industrial'?1.08:.92));}
    else{material.color.lerp(new T.Color(preset[role]),role==='facade'?.33:.16);}
   }
  });
  currentMaterial=id;app.renderer.domElement.parentElement.dataset.materialPreset=id;
 }
 function changeEnvironment(id){
  const preset=ENVIRONMENTS[id];if(!preset)throw Error('未知环境预设');
  app.scene.background.setHex(preset.background);app.scene.fog.color.setHex(preset.background);app.scene.fog.density=preset.fog;
  lights.ambient.intensity=preset.ambient;lights.sun.intensity=preset.sun;app.renderer.toneMappingExposure=preset.exposure;lights.bloom.strength=preset.bloom;
  if(app.sky.material.uniforms.skyTint){app.sky.material.uniforms.skyTint.value.setHex(preset.sky);app.sky.material.uniforms.skyGain.value=preset.skyGain;}
  currentEnvironment=id;app.renderer.domElement.parentElement.dataset.environmentPreset=id;
 }
 return {apply(material,environment){changeMaterial(material);changeEnvironment(environment);},refresh(){if(currentMaterial)changeMaterial(currentMaterial);},get material(){return currentMaterial;},get environment(){return currentEnvironment;}};
}
return {MATERIALS,ENVIRONMENTS,category,create};
});
