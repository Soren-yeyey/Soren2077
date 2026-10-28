/* Small game-loop adapter; campaign, layouts and audio retain their own saves. */
window.CityRenovation=class{
 constructor(app,presets){
  this.app=app;this.presets=presets;this.storage=null;try{this.storage=localStorage;}catch(_){}
  this.state=CityProgress.read(this.storage);this.signature='';this.open=false;
  this.panel=document.createElement('aside');this.panel.id='renovation-panel';this.panel.hidden=true;document.body.append(this.panel);
  this.goal=document.createElement('section');this.goal.id='experience-goal';this.goal.setAttribute('aria-label','当前游戏目标');document.body.append(this.goal);
  this.applySaved();this.render();
 }
 unlocked(){return CityProgress.canRenovate(this.app.campaign?.state);}
 applySaved(){
  const p=this.state.renovation;
  if(p.applied){this.presets.apply(p.material,p.environment);this.app.audio.setPreset(p.sound);}
 }
 button(label,fn,disabled=false){const b=document.createElement('button');b.textContent=label;b.disabled=disabled;b.onclick=fn;return b;}
 show(){this.open=true;this.panel.hidden=false;this.app.keys.clear();this.app.guide=null;this.render();}
 hide(){this.open=false;this.panel.hidden=true;this.app.keys.clear();document.getElementById('viewport').focus();}
 select(label,id,values){
  const row=document.createElement('label');row.textContent=label;const s=document.createElement('select');s.id='preset-'+id;s.setAttribute('aria-label',label);
  for(const [value,text]of values){const o=document.createElement('option');o.value=value;o.textContent=text;s.append(o);}
  s.value=this.state.renovation[id];row.append(s);this.panel.append(row);return s;
 }
 apply(selections){
  try{
   const next=CityProgress.applySelections(CityProgress.read(this.storage),selections,this.app.campaign.state);
   this.state=CityProgress.persist(this.storage,next);this.applySaved();this.app.audio.play('purchase');this.app.notify('城市改造已应用并保存 · 本次消耗 0 券');this.signature='';this.render();
  }catch(error){this.app.notify(this.unlocked()?'未能保存改造，当前场景保持原状；请检查浏览器存储空间':'改造权限不足：完成断电委托后解锁，不扣算力券');}
 }
 render(){
  const allowed=this.unlocked(),p=this.state.renovation;this.panel.replaceChildren();
  const h=document.createElement('h2');h.textContent='城市改造工坊';this.panel.append(h);
  const note=document.createElement('p');note.textContent=allowed?'改造权限已解锁 · 每次切换所需 0 券，不扣算力券':'改造权限未解锁 · 先完成断电委托，当前不扣费';this.panel.append(note);
  const material=this.select('城市材质','material',Object.entries(CityPresets.MATERIALS).map(([id,x])=>[id,x.label]));
  const environment=this.select('灯光与环境','environment',Object.entries(CityPresets.ENVIRONMENTS).map(([id,x])=>[id,x.label]));
  const sound=this.select('环境声景','sound',[['rain','雨夜街声'],['quiet','静谧工坊']]);
  this.panel.append(this.button('应用并保存',()=>this.apply({material:material.value,environment:environment.value,sound:sound.value}),!allowed));
  this.panel.append(this.button('恢复默认搭配',()=>this.apply(CityProgress.DEFAULT_SELECTIONS),!allowed));
  this.panel.append(this.button('取消选择',()=>{this.render();this.app.notify('已取消未应用的选择，没有扣费');}));
  this.panel.append(this.button('返回街区',()=>this.hide()));
  const current=document.createElement('p');current.className='preset-current';current.textContent='当前：'+(p.applied?`${CityPresets.MATERIALS[p.material].label} / ${CityPresets.ENVIRONMENTS[p.environment].label} / ${p.sound==='rain'?'雨夜街声':'静谧工坊'}`:'原始街区搭配');this.panel.append(current);
  const hint=document.createElement('p');hint.textContent='声景使用本地合成。点击“声音”并开启后播放；不依赖外部歌曲。';this.panel.append(hint);
  this.goal.replaceChildren();const title=document.createElement('strong');title.textContent='当前目标';this.goal.append(title);
  const text=document.createElement('p');
  if(!allowed){text.textContent='完成断电委托：接取 → 调查两条线索 → 返回交付。';this.goal.append(text);}
  else if(!p.applied){text.textContent='改造权限已获得。进入工坊，应用材质、环境和声景。';this.goal.append(text,this.button('打开城市改造',()=>this.show()));}
  else if(this.state.race.completed<1){text.textContent='城市搭配已保存。前往赛车城，完成一圈计时。';this.goal.append(text,this.button('进入赛车城',()=>this.enterRace()));}
  else{text.textContent='体验已完成：委托、城市改造和计时赛已保存。已获得城市纪念章，可继续探索。';this.goal.append(text,this.button('查看城市搭配',()=>this.show()),this.button('再跑一圈',()=>this.enterRace()));}
  const all=document.createElement('button');all.className='renovation-toggle';all.textContent='城市改造';all.onclick=()=>this.show();this.goal.append(all);
  const host=this.app.renderer.domElement.parentElement;host.dataset.experience=JSON.stringify(this.state);host.dataset.renovationUnlocked=String(allowed);
  this.panel.hidden=!this.open;
 }
 enterRace(){
  if(!this.unlocked()||!this.state.renovation.applied){this.app.notify('先完成委托并保存一次城市改造');return;}
  location.href='booze.html?from=studio';
 }
 tick(){
  const signature=JSON.stringify([this.app.campaign.state.missions.market.status,this.state.renovation,this.state.race]);
  if(signature!==this.signature){this.signature=signature;this.render();}
  this.goal.hidden=this.app.mode==='film';
 }
};
