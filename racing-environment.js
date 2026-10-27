/* Blender-authored racing sky, closed cloud sea, and floating lower city. */
(() => {
'use strict';
window.RacingEnvironment={create(T,scene,renderer){
  let sky=null,cloudMaterial=null,root=null;
  const uniforms={time:{value:0}};
  const loadModel=url=>new Promise((resolve,reject)=>new T.GLTFLoader().load(url,resolve,undefined,reject));
  const loadTexture=url=>new Promise((resolve,reject)=>new T.TextureLoader().load(url,resolve,undefined,reject));
  function cloudShader(){
    const m=new T.MeshStandardMaterial({color:0xffffff,roughness:1,metalness:0,
      emissive:0x263d58,emissiveIntensity:.32});
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
        diffuseColor.rgb=mix(vec3(.17,.30,.49),vec3(.72,.84,.98),smoothstep(.26,.68,density*.82+detail*.18));`);
    };
    m.customProgramCacheKey=()=> 'racing-cloud-world-v1';return m;
  }
  function skyShader(tex){
    tex.flipY=false;tex.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
    return new T.ShaderMaterial({side:T.FrontSide,depthWrite:false,fog:false,toneMapped:false,
      uniforms:{skyMap:{value:tex}},
      vertexShader:`varying vec2 skyUv;varying vec3 skyDirection;
        void main(){skyUv=uv;skyDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`precision highp float;uniform sampler2D skyMap;varying vec2 skyUv;varying vec3 skyDirection;
        float starHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
        void main(){vec3 d=normalize(skyDirection);float altitude=max(d.y,0.);
          vec3 base=mix(vec3(.16,.28,.46),vec3(.009,.025,.07),pow(altitude,.6));
          vec3 picture=pow(texture2D(skyMap,skyUv).rgb,vec3(2.2));
          float edge=smoothstep(0.,.025,skyUv.x)*smoothstep(0.,.025,1.-skyUv.x);
          float pole=smoothstep(0.,.045,skyUv.y)*smoothstep(0.,.045,1.-skyUv.y);
          vec3 color=mix(base,picture,edge*pole*.93);
          float star=step(.99925,starHash(floor(d*1350.)))*smoothstep(.2,.7,d.y);
          gl_FragColor=vec4(color+vec3(.45,.65,1.)*star*.55,1.);
          #include <encodings_fragment>
        }`});
  }
  function batchStaticMeshes(model){
    model.updateMatrixWorld(true);const batches=new Map();
    model.traverse(o=>{
      if(!o.isMesh||o===sky||o.name==='cloud-sea')return;
      const cloud=o.name.startsWith('cloud-bank-');
      if(cloud)o.material=cloudMaterial;
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
      const [gltf,texture]=await Promise.all([loadModel('models/racing-environment.glb'),loadTexture('images/racing-sky.jpg')]);
      root=gltf.scene;root.name='blender-racing-environment';scene.add(root);
      sky=root.getObjectByName('sky-dome');const sea=root.getObjectByName('cloud-sea');
      if(!sky||!sea)throw new Error('赛车环境缺少天空或云海');
      sky.material=skyShader(texture);sky.renderOrder=-20;sky.frustumCulled=false;
      cloudMaterial=cloudShader();sea.material=cloudMaterial;
      const batches=batchStaticMeshes(root);
      const host=document.getElementById('race-world');
      host.dataset.environment='ready';host.dataset.environmentSource='blender';
      host.dataset.lowerCities='0';host.dataset.cloudBanks='62';host.dataset.environmentBatches=String(batches+2);
      return root;
    },
    update(time,camera){uniforms.time.value=time;if(sky)sky.position.copy(camera.position);}
  };
}};
})();
