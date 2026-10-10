(function(root){
  'use strict';
  const bounds={minX:-30.2,maxX:-1.05,minZ:-170,maxZ:80};
  function blocked(x,z,obstacles,r=.42){
    if(x<bounds.minX+r||x>bounds.maxX-r||z<bounds.minZ+r||z>bounds.maxZ-r)return true;
    return obstacles.some(b=>x>b.minX-r&&x<b.maxX+r&&z>b.minZ-r&&z<b.maxZ+r);
  }
  function move(position,dx,dz,obstacles,r=.42){
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.18));
    let x=position.x,z=position.z;
    for(let i=0;i<steps;i++){
      if(!blocked(x+dx/steps,z,obstacles,r))x+=dx/steps;
      if(!blocked(x,z+dz/steps,obstacles,r))z+=dz/steps;
    }
    return{x,z};
  }
  const api={bounds,blocked,move};root.CityNavigation=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
