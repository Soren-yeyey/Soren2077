/* Clear daylight and one display transform across the three playable pages. */
(function(root){'use strict';
function create(T,renderer,scene,{radius=2000,fog=.0004,sunPosition=[-120,280,110]}={}){
 scene.background=new T.Color(0x8fb9dc);scene.fog=new T.FogExp2(0xa9c7e2,fog*.8);renderer.toneMappingExposure=1.04;
 const ambient=new T.HemisphereLight(0xe1eeff,0x858b8f,1.8),sun=new T.DirectionalLight(0xffefd5,2.2),fill=new T.DirectionalLight(0xc1dcfa,.8);
 sun.position.fromArray(sunPosition);fill.position.set(160,180,-200);scene.add(ambient,sun,fill);
 const uniforms={time:{value:0},skyTint:{value:new T.Color(0xffffff)},skyGain:{value:1}};
 const sky=new T.Mesh(new T.SphereGeometry(radius,32,16),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,fog:false,uniforms,
 vertexShader:'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:`varying vec3 direction;uniform float time;uniform vec3 skyTint;uniform float skyGain;
 float h(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
 float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1)),f.x),f.y),f.z);}
 void main(){vec3 d=normalize(direction);float horizon=pow(1.-max(d.y,0.),2.6);vec3 color=mix(vec3(.10,.34,.70),vec3(.55,.72,.90),horizon);vec3 p=d*5.+vec3(time*.0015,0,0);float n=noise(p)*.57+noise(p*2.1)*.28+noise(p*4.2)*.15;float clouds=smoothstep(.66,.80,n)*smoothstep(-.05,.25,d.y);color=mix(color,vec3(.97,.98,1.),clouds*.72);gl_FragColor=vec4(color*skyTint*skyGain,1.);
 #include <tonemapping_fragment>
 #include <encodings_fragment>
 }`}));sky.frustumCulled=false;scene.add(sky);
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=64;const c=canvas.getContext('2d'),gradient=c.createLinearGradient(0,0,0,64);gradient.addColorStop(0,'#b2d1ed');gradient.addColorStop(.48,'#e7edf1');gradient.addColorStop(.6,'#bec7cf');gradient.addColorStop(1,'#90989d');c.fillStyle=gradient;c.fillRect(0,0,128,64);
 const source=new T.CanvasTexture(canvas);source.encoding=T.sRGBEncoding;source.mapping=T.EquirectangularReflectionMapping;
 const pmrem=new T.PMREMGenerator(renderer),environment=pmrem.fromEquirectangular(source);scene.environment=environment.texture;pmrem.dispose();source.dispose();
 function update(camera,time){sky.position.copy(camera.position);uniforms.time.value=time;}
 function dispose(){environment.dispose();sky.geometry.dispose();sky.material.dispose();}
 return {sky,ambient,sun,fill,update,dispose};
}
function grade(T,renderer,composer,bloom){
 renderer.toneMapping=T.NoToneMapping;
 const hdr=renderer.capabilities.isWebGL2&&renderer.extensions.has('EXT_color_buffer_float');
 if(hdr)for(const rt of [composer.renderTarget1,composer.renderTarget2,bloom.renderTargetBright,...bloom.renderTargetsHorizontal,...bloom.renderTargetsVertical])rt.texture.type=T.HalfFloatType;
 const pass=new T.ShaderPass({uniforms:{tDiffuse:{value:null},exposure:{value:1.08}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform sampler2D tDiffuse;uniform float exposure;varying vec2 vUv;void main(){vec3 c=texture2D(tDiffuse,vUv).rgb*exposure;c=(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14);gl_FragColor=vec4(pow(clamp(c,0.,1.),vec3(1./2.2)),1.);}'});pass.material.toneMapped=false;composer.addPass(pass);return pass;
}
root.CityDaylight={create,grade};
})(typeof window!=='undefined'?window:globalThis);
