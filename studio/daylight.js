/* Shared space sky and one display transform across the three playable pages. */
(function(root){'use strict';
function create(T,renderer,scene,{radius=2000,fog=.0004,sunPosition=[-120,280,110]}={}){
 scene.background=new T.Color(0x19213d);scene.fog=new T.FogExp2(0x394566,fog*.8);renderer.toneMappingExposure=1.04;
 const ambient=new T.HemisphereLight(0xe1eeff,0x858b8f,1.8),sun=new T.DirectionalLight(0xffefd5,2.2),fill=new T.DirectionalLight(0xc1dcfa,.8);
 sun.position.fromArray(sunPosition);fill.position.set(160,180,-200);scene.add(ambient,sun,fill);
 const uniforms={time:{value:0},skyTint:{value:new T.Color(0xffffff)},skyGain:{value:1}};
 const sky=new T.Mesh(new T.SphereGeometry(radius,32,16),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,fog:false,uniforms,
 vertexShader:'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:`varying vec3 direction;uniform float time;uniform vec3 skyTint;uniform float skyGain;
 float h(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
 float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1)),f.x),f.y),f.z);}
 float stars(vec2 uv,vec2 grid,float cutoff){
  vec2 p=uv*grid,id=floor(p),cell=fract(p)-.5;
  float seed=h(vec3(id,17.3));
  vec2 offset=vec2(h(vec3(id,3.7)),h(vec3(id,9.1)))-.5;
  float point=1.-smoothstep(.015,.085,length(cell-offset*.65));
  return step(cutoff,seed)*point*(.45+.55*h(vec3(id,27.1)));
 }
 vec3 planetSky(vec3 color,vec3 d,vec3 centre,float radius){
  centre=normalize(centre);float dist=length(d-centre);
  float disc=1.-smoothstep(radius-.003,radius+.003,dist);
  vec3 east=normalize(cross(vec3(0.,1.,0.),centre)),north=cross(centre,east);
  vec2 xy=vec2(dot(d,east),dot(d,north))/radius;
  float depth=sqrt(max(0.,1.-dot(xy,xy)));
  vec3 normal=normalize(east*xy.x+north*xy.y-centre*depth);
  float sunward=max(0.,dot(normal,normalize(vec3(.7,.8,.25))));
  float ground=noise(normal*5.2+3.)*.6+noise(normal*12.3)*.4;
  vec3 planet=mix(vec3(.012,.022,.055),vec3(.13,.17,.27),sunward*.55+ground*.22);
  float rim=pow(1.-depth,2.8);
  planet+=vec3(.12,.27,.48)*rim*(.35+.65*sunward);
  color=mix(color,planet,disc);
  return color+vec3(.11,.19,.38)*exp(-abs(dist-radius)*38.)*(1.-disc)*.25;
 }
 void main(){
  vec3 d=normalize(direction);
  float horizon=pow(1.-max(d.y,0.),2.0);
  vec3 color=mix(vec3(.009,.014,.045),vec3(.045,.062,.13),horizon);
  vec3 p=d*8.;float n=noise(p)*.56+noise(p*2.05)*.28+noise(p*4.1)*.16;
  float band=exp(-abs(dot(d,normalize(vec3(.34,.92,.18))))*5.0);
  float cloud=smoothstep(.34,.74,n)*band;
  color+=cloud*mix(vec3(.045,.055,.16),vec3(.20,.065,.27),noise(p*.63+12.));
  vec2 uv=vec2(atan(d.x,-d.z)/6.2831853+.5,asin(clamp(d.y,-1.,1.))/3.14159265+.5);
  float st=stars(uv,vec2(420.,210.),.925)+stars(uv,vec2(170.,85.),.975)*1.9;
  color+=st*vec3(.68,.79,1.);
  // Distant planets are drawn on the sky, outside all playable space.
  color=planetSky(color,d,vec3(.27,.22,-.94),.20);
  color=planetSky(color,d,vec3(-.96,.21,.18),.20);
  gl_FragColor=vec4(color*skyTint*skyGain,1.);
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
