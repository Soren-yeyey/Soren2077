(function(root){
'use strict';
const fail=message=>{throw Error('资产登记无效：'+message);};
const positive=x=>Number.isFinite(x)&&x>0;
function safePath(value){return typeof value==='string'&&/^[a-zA-Z0-9_./-]+$/.test(value)&&!value.startsWith('/')&&!value.split('/').some(p=>p==='..'||p===''||p==='.');}
function normalize(manifest){
 if(!manifest||![1,2].includes(manifest.version)||manifest.units!=='metres'||!Array.isArray(manifest.assets)||!manifest.assets.length)fail('版本、单位或列表错误');
 if(manifest.version===2&&(manifest.runtimeUpAxis!=='Y'||!manifest.files||typeof manifest.files!=='object'))fail('缺少坐标系或文件清单');
 if(manifest.version===2)for(const [file,info] of Object.entries(manifest.files)){
  if(!safePath(file)||!Number.isSafeInteger(info?.bytes)||info.bytes<=0||!/^[a-f0-9]{64}$/.test(info.sha256||''))fail('文件清单错误：'+file);
 }
 const ids=new Set();return manifest.assets.map(a=>{
  if(!a||typeof a.id!=='string'||!/^[a-z][a-z0-9-]*$/.test(a.id)||ids.has(a.id))fail('编号重复或格式错误');ids.add(a.id);
  if(typeof a.name!=='string'||!a.name.trim()||!safePath(a.source)||typeof a.node!=='string'||!a.node||!positive(a.scale)||!Array.isArray(a.footprint)||a.footprint.length!==2||!a.footprint.every(positive))fail('模型路径、比例或占地错误：'+a.id);
  if(manifest.version===2){
   if(!Number.isSafeInteger(a.revision)||a.revision<1||a.category!=='building'||!['legacy-review','approved','draft'].includes(a.status))fail('分类或状态错误：'+a.id);
   if(!manifest.files[a.source])fail('模型未登记哈希：'+a.id);
   if(!Number.isSafeInteger(a.triangles)||a.triangles<1||a.geometry?.triangles!==a.triangles)fail('面数错误：'+a.id);
   const g=a.geometry;
   if(!Array.isArray(g.dimensionsM)||g.dimensionsM.length!==3||!g.dimensionsM.every(positive)||!Array.isArray(g.pivotM)||g.pivotM.length!==3||!g.pivotM.every(Number.isFinite))fail('尺寸或原点错误：'+a.id);
   if(!g.boundsM||!['min','max'].every(k=>Array.isArray(g.boundsM[k])&&g.boundsM[k].length===3&&g.boundsM[k].every(Number.isFinite)))fail('边界错误：'+a.id);
   for(let i=0;i<3;i++)if(g.boundsM.max[i]<=g.boundsM.min[i]||Math.abs(g.boundsM.max[i]-g.boundsM.min[i]-g.dimensionsM[i])>.001)fail('尺寸与边界不一致：'+a.id);
   if(!Number.isSafeInteger(a.materials?.slots)||a.materials.slots<1||!Array.isArray(a.materials.names)||a.materials.names.length!==a.materials.slots)fail('材质统计错误：'+a.id);
   if(!['footprint-aabb','compound-boxes'].includes(a.collision?.kind))fail('碰撞类型错误：'+a.id);
   if(a.collision.kind==='compound-boxes'&&(!safePath(a.collision.source)||!manifest.files[a.collision.source]))fail('碰撞文件错误：'+a.id);
   if(!a.quality||!['pending-review','passed','failed'].includes(a.quality.status)||!Array.isArray(a.quality.issues))fail('质量状态错误：'+a.id);
   if(a.status==='approved'&&(a.quality.status!=='passed'||!safePath(a.quality.report)||!manifest.files[a.quality.report]||a.quality.issues.length))fail('通过状态缺少完整报告：'+a.id);
   if(a.status==='draft')fail('草稿资产不能加入运行库：'+a.id);
  }
  return {...a,footprint:[...a.footprint]};
 });
}
const api={normalize,safePath};root.CityAssets=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
