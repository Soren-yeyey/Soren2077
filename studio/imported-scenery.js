/* Optional decorations extracted from the user's Blender scene. */
window.loadImportedScenery = function(T, scene, renderer, host, layout) {
 const loader = new T.GLTFLoader();
 for (const [key, url, placements] of layout) {
  host.dataset[key] = 'loading';
  loader.load(url, gltf => {
   const source = gltf.scene;
   const bounds = new T.Box3().setFromObject(source);
   const size = bounds.getSize(new T.Vector3());
   if (!size.y) { host.dataset[key] = 'fallback'; return; }
   const center = bounds.getCenter(new T.Vector3());
   source.traverse(object => {
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
     if (material.map) material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }
   });
   for (const [x,y,z,height,rotation] of placements) {
    const model = source.clone(true), wrapper = new T.Group();
    model.position.sub(new T.Vector3(center.x,bounds.min.y,center.z));
    wrapper.add(model); wrapper.scale.setScalar(height/size.y);
    wrapper.position.set(x,y,z); wrapper.rotation.y=rotation; scene.add(wrapper);
   }
   host.dataset[key] = 'ready';
  }, undefined, error => { host.dataset[key] = 'fallback'; console.warn('Optional Blender scenery:', url, error); });
 }
};
