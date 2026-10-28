const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('./presets.js'),T=require('../libs/three.min.js');
test('surface categories preserve people and differentiate glass, metal, facade, signs and ground',()=>{
 for(const [name,expected]of [['city-skin','preserve'],['city-cloth','preserve'],['glass','glass'],['Metal','metal'],['blue-enamel','facade'],['screen_orion','sign'],['city-walk','ground']])assert.equal(P.category(name),expected);
});
test('material presets keep texture maps and are reversible without accumulating tint',()=>{
 const scene=new T.Scene(),materials=['Concrete','Metal','glass','screen','city-skin'].map(name=>{const m=new T.MeshStandardMaterial({color:0x668899});m.name=name;m.map=new T.Texture();scene.add(new T.Mesh(new T.BoxGeometry(),m));return m;});
 const maps=materials.map(m=>m.map),skin=materials[4].color.clone(),host={dataset:{}},app={scene,renderer:{domElement:{parentElement:host}},sky:{material:{uniforms:{}}}};
 scene.background=new T.Color();scene.fog=new T.FogExp2();const lights={ambient:{},sun:{},bloom:{}},presets=P.create(T,app,lights);
 presets.apply('neon','night');const original=materials[0].color.clone();presets.apply('industrial','mist');assert.notDeepEqual(materials[0].color,original);
 presets.apply('neon','night');assert.deepEqual(materials[0].color,original);assert.deepEqual(materials[4].color,skin);materials.forEach((m,i)=>assert.equal(m.map,maps[i]));assert.equal(host.dataset.environmentPreset,'night');
});
