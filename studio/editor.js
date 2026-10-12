window.CityEditor=class{
 constructor(app){this.app=app;this.history=[];this.selected=null;this.box=null;this.bind();this.refresh();}
 bind(){const $=id=>document.getElementById(id),a=this.app;
  for(const item of a.registry){const o=document.createElement('option');o.value=item.id;o.textContent=item.name;$('asset').append(o);}
  $('building').onchange=e=>this.select(e.target.value);
  $('apply').onclick=()=>this.change(p=>{p.x=Math.round(Number($('pos-x').value));p.z=Math.round(Number($('pos-z').value));p.rotation=Number($('rotation').value)*Math.PI/180;p.scale=Number($('scale').value);p.asset=$('asset').value;});
  $('rotate').onclick=()=>this.change(p=>p.rotation+=Math.PI/2);
  $('focus').onclick=()=>{const p=a.layout.placements.find(p=>p.id===this.selected);if(p)a.focus(p);};
  $('add-building').onclick=()=>{const zone=CityCore.zoneAt(a.camera.position.z,a.config);const next=JSON.parse(JSON.stringify(a.layout));let n=1;while(next.placements.some(p=>p.id==='added-'+n))n++;for(const x of [-35,35,-20,20])for(const offset of [-31,0,31]){const p={id:'added-'+n,zone:zone.id,asset:$('asset').value,x,z:zone.center+offset,rotation:x<0?Math.PI/2:-Math.PI/2,scale:1};const candidate={...next,placements:[...next.placements,p]};try{CityCore.validate(candidate,a.config,a.registry);this.selected=p.id;this.commit(candidate);a.focus(p);return;}catch(e){}}a.notify('当前分区没有合适空地，请先移动或移除建筑');};
  $('remove-building').onclick=()=>{if(a.layout.placements.length<=1){a.notify('请至少保留一栋建筑');return;}this.commit({...a.layout,placements:a.layout.placements.filter(p=>p.id!==this.selected)});};
  $('undo').onclick=()=>{if(!this.history.length)return;const l=this.history.pop();a.applyLayout(l);this.refresh();a.notify('已撤销上一次修改');};
  $('generate').onclick=()=>{const seed=Number($('seed').value);if(!Number.isSafeInteger(seed)){a.notify('请输入整数种子');return;}this.commit(CityCore.generate({...a.config,seed}));};
  $('save').onclick=()=>{try{localStorage.setItem('rain-city-layout-v1',JSON.stringify(a.layout));a.notify('布局已保存到此浏览器');}catch(e){a.notify('浏览器无法保存，请使用导出布局');}};
  $('export').onclick=()=>a.download(new Blob([JSON.stringify(a.layout,null,2)],{type:'application/json'}),'rain-city-layout.json');
  $('import').onchange=async e=>{const f=e.target.files[0];try{if(!f)return;if(f.size>150000)throw Error('文件过大');this.commit(JSON.parse(await f.text()));}catch(err){a.notify('导入失败：'+err.message);}finally{e.target.value='';}};
 }
 commit(next){try{CityCore.validate(next,this.app.config,this.app.registry);this.history.push(JSON.parse(JSON.stringify(this.app.layout)));if(this.history.length>40)this.history.shift();this.app.applyLayout(next);this.refresh();this.app.notify('布局已更新，道路与建筑间距检查通过');}catch(e){this.app.notify(e.message);}}
 change(fn){const l=JSON.parse(JSON.stringify(this.app.layout)),p=l.placements.find(p=>p.id===this.selected);if(!p)return;fn(p);this.commit(l);}
 refresh(){const select=document.getElementById('building');select.replaceChildren();for(const p of this.app.layout.placements){const opt=document.createElement('option');opt.value=p.id;opt.textContent=this.app.config.zones.find(z=>z.id===p.zone).name+' / '+this.app.registry.find(a=>a.id===p.asset).name;select.append(opt);}document.getElementById('seed').value=this.app.layout.seed;this.select(this.app.layout.placements.some(p=>p.id===this.selected)?this.selected:this.app.layout.placements[0]?.id);document.getElementById('undo').disabled=!this.history.length;}
 select(id){this.selected=id;const p=this.app.layout.placements.find(p=>p.id===id);if(!p)return;document.getElementById('building').value=id;document.getElementById('asset').value=p.asset;document.getElementById('pos-x').value=p.x;document.getElementById('pos-z').value=p.z;document.getElementById('rotation').value=Math.round(p.rotation*180/Math.PI);document.getElementById('scale').value=p.scale;this.outline();}
 outline(){if(this.box){this.app.scene.remove(this.box);this.box.geometry.dispose();this.box.material.dispose();this.box=null;}const o=this.app.world.objects.get(this.selected);if(o&&this.app.mode==='edit'){o.updateMatrixWorld(true);this.box=new THREE.BoxHelper(o,0x93f7e0);this.app.scene.add(this.box);}}
};
