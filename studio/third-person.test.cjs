const {test}=require('node:test'),assert=require('node:assert/strict');
const T=require('../libs/three.min.js'),Rig=require('./third-person.js'),Avatar=require('./player-avatar.js');
test('third-person camera stays behind the body while looking at the player',()=>{
 const camera=new T.PerspectiveCamera(62,16/9,.1,100),rig=Rig.create(T,camera),feet=new T.Vector3(3,22,20);
 rig.update(feet,0,.25,1/60);assert.ok(camera.position.z>feet.z+5);assert.ok(camera.position.y>feet.y+1.5);assert.equal(feet.z,20);
 const dir=new T.Vector3();camera.getWorldDirection(dir);assert.ok(dir.z<-.9);
 rig.update(feet,Math.PI/2,.25,1/60,{snap:true});assert.ok(camera.position.x>feet.x+5);assert.equal(feet.x,3);
});
test('camera boom retracts before walls and stays within playable bounds',()=>{
 const camera=new T.PerspectiveCamera(),rig=Rig.create(T,camera,{bounds:{minX:-10,maxX:10,minZ:-10,maxZ:10}}),feet=new T.Vector3();
 rig.update(feet,0,.25,1/60);rig.update(feet,0,.25,1/60,{obstacles:[{minX:-1,maxX:1,minZ:2,maxZ:3}]});assert.ok(camera.position.z<1.76);
 feet.set(9,0,9);rig.update(feet,Math.PI/4,.25,1/60,{snap:true});assert.ok(camera.position.x<=9.68);assert.ok(camera.position.z<=9.68);
});
test('zoom is bounded and ceilings constrain the follow camera without moving the body',()=>{
 const camera=new T.PerspectiveCamera(),rig=Rig.create(T,camera),feet=new T.Vector3();rig.zoom(-100);assert.equal(rig.distance,2.5);rig.zoom(100);assert.equal(rig.distance,10);
 rig.update(feet,0,-.5,1/60,{ceilingAt:()=>2.5});assert.ok(camera.position.y<=2.25);assert.equal(feet.y,0);
});
function source(){
 const root=new T.Group(),hip=new T.Bone();hip.name='pelvis';
 for(const side of ['L','R']){const foot=new T.Bone(),toe=new T.Bone();foot.name=side+'_Foot';foot.position.set(side==='L'?-.15:.15,0,0);toe.name=side+'_ToeBase';toe.position.z=.2;foot.add(toe);hip.add(foot);}
 root.add(hip);const geometry=new T.BoxGeometry(.6,1.8,.4);geometry.translate(0,.9,0);const count=geometry.attributes.position.count;
 geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(new Uint16Array(count*4),4));const weights=new Float32Array(count*4);for(let i=0;i<count;i++)weights[i*4]=1;geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
 const mesh=new T.SkinnedMesh(geometry,new T.MeshStandardMaterial({color:0xabcdef,map:new T.Texture()}));root.add(mesh);root.updateMatrixWorld(true);mesh.bind(new T.Skeleton([hip,...hip.children.flatMap(b=>[b,...b.children])]));
 const track=new T.QuaternionKeyframeTrack('pelvis.quaternion',[0,.5,1],[0,0,0,1,0,.198669,0,.980067,0,0,0,1]);
 return {scene:root,animations:[new T.AnimationClip('Walk',1,[track])]};
}
test('player and NPC clones have independent bones and share original geometry/material',()=>{
 const gltf=source(),a=Avatar.create(T,gltf),b=Avatar.create(T,gltf);let originalMesh,copyMesh;gltf.scene.traverse(o=>{if(o.isSkinnedMesh)originalMesh=o;});a.model.traverse(o=>{if(o.isSkinnedMesh)copyMesh=o;});
 assert.equal(originalMesh.geometry,copyMesh.geometry);assert.equal(originalMesh.material,copyMesh.material);assert.notEqual(originalMesh.skeleton.bones[0],copyMesh.skeleton.bones[0]);assert.notEqual(a.model.getObjectByName('pelvis'),b.model.getObjectByName('pelvis'));
 const before=b.model.getObjectByName('pelvis').quaternion.toArray();for(let i=0;i<20;i++)a.update(1/60,3.5,0);assert.deepEqual(b.model.getObjectByName('pelvis').quaternion.toArray(),before);assert.equal(a.root.userData.clip,'walk');a.dispose();b.dispose();
});
test('idle uses the source cycle rest and imported toe direction resolves the forward axis',()=>{
 const a=Avatar.create(T,source());a.update(.1,0,0);assert.equal(a.root.userData.clip,'idle');a.root.updateMatrixWorld(true);
 const toe=a.model.getObjectByName('L_ToeBase').getWorldPosition(new T.Vector3()),foot=a.model.getObjectByName('L_Foot').getWorldPosition(new T.Vector3()),direction=toe.sub(foot);assert.ok(direction.z<0);assert.ok(Math.abs(direction.x)<.001);a.dispose();
});
