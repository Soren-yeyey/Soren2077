const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {normalize}=require('../studio/assets.js');
function check(root=path.resolve(__dirname,'..')){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/assets.json'),'utf8'));
 const assets=normalize(manifest),errors=[],warnings=[];let checkedFiles=0;
 const checkFile=(file,record)=>{
  const target=path.resolve(root,file);
  if(!target.startsWith(root+path.sep)){errors.push('Path outside project: '+file);return;}
  if(!fs.existsSync(target)){errors.push('Missing file: '+file);return;}
  // Windows tolerates wrong case; GitHub Pages does not.
  let directory=root;for(const part of file.split('/')){if(!fs.readdirSync(directory).includes(part)){errors.push('Path case mismatch: '+file);return;}directory=path.join(directory,part);}
  const bytes=fs.readFileSync(target);checkedFiles++;
  if(record&&(record.bytes!==bytes.length||record.sha256!==crypto.createHash('sha256').update(bytes).digest('hex')))errors.push('Hash/size mismatch: '+file);
 };
 for(const [file,record] of Object.entries(manifest.files||{}))checkFile(file,record);
 const docs=new Map();
 for(const source of new Set(assets.map(a=>a.source))){
  if(!fs.existsSync(path.join(root,source))){errors.push('Missing model: '+source);continue;}
  const data=fs.readFileSync(path.join(root,source));let doc;
  try{
   if(source.endsWith('.glb')){
    if(data.readUInt32LE(0)!==0x46546c67||data.readUInt32LE(4)!==2||data.readUInt32LE(8)!==data.length||data.readUInt32LE(16)!==0x4e4f534a)throw Error('Invalid GLB header');
    doc=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)).toString('utf8').trim());
   }else doc=JSON.parse(data.toString('utf8'));
   docs.set(source,doc);
   for(const item of [...(doc.buffers||[]),...(doc.images||[])])if(item.uri&&!item.uri.startsWith('data:')){
    const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(source),decodeURIComponent(item.uri)));
    if(!manifest.files?.[resolved])errors.push('Dependency missing from manifest: '+resolved);
    if(item.byteLength&&fs.existsSync(path.join(root,resolved))&&fs.statSync(path.join(root,resolved)).size!==item.byteLength)errors.push('Buffer size mismatch: '+resolved);
   }
  }catch(e){errors.push(source+': '+e.message);}
 }
 for(const a of assets){
  const doc=docs.get(a.source);if(!doc)continue;
  const nodes=doc.nodes||[],matches=nodes.map((n,i)=>n.name?.startsWith(a.node)?i:-1).filter(i=>i>=0);
  if(matches.length!==1){errors.push('Ambiguous or missing node: '+a.id);continue;}
  let triangles=0;const seen=new Set();
  function walk(i){if(seen.has(i))throw Error('Node cycle');seen.add(i);const n=nodes[i];
   if(n.mesh!==undefined)for(const primitive of doc.meshes[n.mesh].primitives){
    if((primitive.mode??4)!==4)throw Error('Non-triangle primitive');
    const count=doc.accessors[primitive.indices??primitive.attributes.POSITION].count;
    if(count%3)throw Error('Incomplete triangle');triangles+=count/3;
   }for(const child of n.children||[])walk(child);
  }
  try{walk(matches[0]);if(triangles!==a.triangles)errors.push('Triangle mismatch: '+a.id+' actual='+triangles);}catch(e){errors.push(a.id+': '+e.message);}
  if(a.status!=='approved')warnings.push(a.id+': '+a.status+' / '+a.quality?.status);
  if(a.collision.kind==='compound-boxes'&&fs.existsSync(path.join(root,a.collision.source))){
   try{const c=JSON.parse(fs.readFileSync(path.join(root,a.collision.source),'utf8'));
    if(c.asset!==a.id||c.units!=='metres'||!Array.isArray(c.boxes)||!c.boxes.length||!c.boxes.every(b=>[b.x,b.z,b.halfX,b.halfZ].every(Number.isFinite)&&b.halfX>0&&b.halfZ>0))throw Error('Invalid collision boxes');
   }catch(e){errors.push(a.id+': '+e.message);}
  }
 }
 let assetBytes=0;
 for(const folder of ['images','models'])for(const file of fs.readdirSync(path.join(root,folder),{recursive:true})){
  const target=path.join(root,folder,file);if(fs.statSync(target).isFile()){const size=fs.statSync(target).size;assetBytes+=size;if(/\.(png|jpe?g|webp)$/i.test(file)&&size>1000000)errors.push('Image exceeds 1 MB: '+file);}
 }
 if(assetBytes>5000000)errors.push('Assets exceed 5 MB');
 return {valid:errors.length===0,version:manifest.version,assets:assets.length,checkedFiles,assetBytes,triangles:assets.reduce((n,a)=>n+a.triangles,0),errors,warnings};
}
if(require.main===module){try{const result=check();console.log(JSON.stringify(result,null,2));if(!result.valid)process.exitCode=1;}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={check};
