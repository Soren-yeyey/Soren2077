/* Blender-authored racing sky, closed cloud sea, and floating lower city. */
(() => {
'use strict';
window.RacingEnvironment={create(T,scene,renderer,sceneAssets){
  let sky=null,cloudMaterial=null,root=null;
  const uniforms={time:{value:0}};
  const loadModel=url=>sceneAssets?sceneAssets.load(url):new Promise((resolve,reject)=>new T.GLTFLoader().load(url,resolve,undefined,reject));
  function cloudShader(){
    const m=new T.MeshStandardMaterial({color:0xffffff,roughness:1,metalness:0,
      emissive:0x101c30,emissiveIntensity:.12});
    m.onBeforeCompile=shader=>{
      shader.uniforms.cloudTime=uniforms.time;
      shader.vertexShader=shader.vertexShader.replace('#include <common>',
        '#include <common>\nvarying vec3 cloudWorld;');
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        vec4 cloudPoint=vec4(transformed,1.);
        #ifdef USE_INSTANCING
        cloudPoint=instanceMatrix*cloudPoint;
        #endif
        cloudWorld=(modelMatrix*cloudPoint).xyz;`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
        varying vec3 cloudWorld; uniform float cloudTime;
        float cloudHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
        float cloudNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          return mix(mix(mix(cloudHash(i),cloudHash(i+vec3(1,0,0)),f.x),mix(cloudHash(i+vec3(0,1,0)),cloudHash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(cloudHash(i+vec3(0,0,1)),cloudHash(i+vec3(1,0,1)),f.x),mix(cloudHash(i+vec3(0,1,1)),cloudHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
        float cloudFbm(vec3 p){float a=.55,v=0.;for(int i=0;i<4;i++){v+=a*cloudNoise(p);p=p*2.03+11.7;a*=.48;}return v;}`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float density=cloudFbm(cloudWorld*.009+vec3(cloudTime*.0014,0.,0.));
        float detail=cloudFbm(cloudWorld*.038);
        diffuseColor.rgb=mix(vec3(.015,.028,.055),vec3(.075,.11,.17),smoothstep(.26,.68,density*.82+detail*.18));`);
    };
    m.customProgramCacheKey=()=> 'racing-cloud-world-v1';return m;
  }
  function skyShader(){
    // Night clouds are environment geometry/shading, independent of building textures.
    return new T.ShaderMaterial({side:T.FrontSide,depthWrite:false,fog:false,
      uniforms:{time:uniforms.time},
      vertexShader:`varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`precision highp float;varying vec3 direction;uniform float time;
        float hash(vec3 p){p=fract(p*.3183099+vec3(.13,.29,.73));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
        float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
        float fbm(vec3 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.07+13.1;a*=.5;}return v;}
        void main(){vec3 d=normalize(direction);float horizon=pow(1.-max(d.y,0.),3.);vec3 col=mix(vec3(.006,.012,.025),vec3(.045,.075,.12),horizon);vec3 p=d*5.6+vec3(time*.001,0.,0.);float n=fbm(p+fbm(p*2.));col+=smoothstep(.35,.69,n)*vec3(.028,.045,.073);gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
        }`});
  }
  function batchStaticMeshes(model){
    model.updateMatrixWorld(true);const batches=new Map();
    model.traverse(o=>{
      if(!o.isMesh||o===sky||o.name==='cloud-sea')return;
      const cloud=o.name.startsWith('cloud-bank-');
      if(cloud){o.visible=false;return;}
      else{
        const mats=Array.isArray(o.material)?o.material:[o.material];
        for(const m of mats)if(m.map)m.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
      }
      const key=o.geometry.uuid+'|'+o.material.uuid;
      if(!batches.has(key))batches.set(key,{geometry:o.geometry,material:o.material,items:[],cloud});
      batches.get(key).items.push(o);
    });
    for(const b of batches.values()){
      const inst=new T.InstancedMesh(b.geometry,b.material,b.items.length);
      inst.name=b.cloud?'racing-cloud-banks':'racing-lower-city';
      b.items.forEach((o,i)=>{inst.setMatrixAt(i,o.matrixWorld);o.visible=false;});
      inst.instanceMatrix.needsUpdate=true;inst.frustumCulled=false;scene.add(inst);
    }
    return batches.size;
  }
  return {
    async load(){
      const gltf=await loadModel('models/racing-environment.glb');
      root=gltf.scene;root.name='blender-racing-environment';scene.add(root);
      sky=root.getObjectByName('sky-dome');const sea=root.getObjectByName('cloud-sea');
      if(!sky||!sea)throw new Error('赛车环境缺少天空或云海');
      sky.material=skyShader();sky.visible=false;sky.renderOrder=-20;sky.frustumCulled=false;
      cloudMaterial=cloudShader();sea.material=cloudMaterial;sea.visible=false;
      const batches=batchStaticMeshes(root);
      if(sceneAssets)sceneAssets.track(root);
      const host=document.getElementById('race-world');
      host.dataset.environment='ready';host.dataset.environmentSource='blender';
      host.dataset.lowerCities='0';host.dataset.cloudBanks='0';host.dataset.environmentBatches=String(batches+1);
      return root;
    },
    update(time,camera){uniforms.time.value=time;if(sky)sky.position.copy(camera.position);}
  };
}};
})();
