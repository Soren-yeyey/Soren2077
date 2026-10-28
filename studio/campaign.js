/* Scene adapter for the local campaign prototype. */
class CityCampaign {
 constructor(app){
  this.app=app;this.state=CityGameplay.createState();this.elapsed=0;this.signature='';this.nearest=null;this.scanReadyAt=0;this.scanUntil=0;this.scanned=new Set();this.scanMessage='按 Q 扫描附近线索';
  this.copy={market:{title:'断电委托',clues:{chip:['存储芯片','芯片里保存着一份被撤销的居民身份记录。'],receipt:['扣款收据','这个账户仍在扣费，登记人却已不在城市名册中。']},choices:{return:'交还委托人 · 40 券',sell:'出售副本 · 60 券'}},homes:{title:'迟到的讯息',clues:{resident:['居民证词','她等了多年。系统却说，那个发送消息的人从未存在。'],relay:['中继记录','讯息早已抵达，交付时间被人为改写。']},choices:{protect:'保护证人 · 30 券',trade:'交换记录 · 50 券'}},tower:{title:'账本的归属',clues:{ledger:['中央账本','账本记录了居民身份许可与塔方算力配额之间的关系。']},choices:{open:'公开接口',seal:'封存账本 · 70 券'}}};
  try{const saved=localStorage.getItem('rain-city-campaign-v1');if(saved)this.state=CityGameplay.restore(saved);}catch(e){app.notify('任务存档不可用，已启用新进度；旧布局不受影响');}
  this.panel=document.createElement('aside');this.panel.id='campaign-panel';this.panel.setAttribute('aria-label','街区委托');document.body.append(this.panel);
  this.group=new THREE.Group();app.scene.add(this.group);this.points=[];this.rebuild();this.render();
  addEventListener('keydown',e=>{if(this.challenge)return;if(!['KeyE','KeyQ'].includes(e.code)||e.repeat||/^(INPUT|SELECT|TEXTAREA|BUTTON|A)$/.test(e.target.tagName)||e.target.isContentEditable)return;if(app.mode==='walk'){e.preventDefault();if(e.code==='KeyQ')this.scan();else this.interact();}});
 }
 current(){return Object.keys(CityGameplay.missions).find(id=>this.state.missions[id].status!=='resolved')||'tower';}
 makeTerminal(p){
  // Holographic indicators have no solid housing and do not obstruct the sidewalk.
  const display=new THREE.Group();display.position.set(p.x+1.15,this.app.world.groundAt(p.x,p.z),p.z-2.2);this.group.add(display);
  const material=new THREE.MeshBasicMaterial({color:0xffc56c,transparent:true,opacity:.72,depthWrite:false});
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.42,.025,6,24),material);ring.rotation.x=-Math.PI/2;ring.position.y=.35;display.add(ring);
  for(let i=0;i<3;i++){const bar=new THREE.Mesh(new THREE.BoxGeometry(.08,.6+i*.3,.08),material);bar.position.set((i-1)*.2,1.05,0);display.add(bar);}
  p.display=display;p.statusMaterial=material;p.statusLabel='';return p;
 }
 updateTerminals(){
  const statuses=CityGameplay.districtStatus(this.state);
  for(const p of this.points){
   if(!p.display)continue;const status=statuses[p.id];p.statusMaterial.color.setHex(status.color);p.mesh.material.color.setHex(status.color);
   if(p.statusLabel===status.label)continue;
   p.statusLabel=status.label;
   if(p.label){p.display.remove(p.label);p.label.material.map.dispose();p.label.material.dispose();}
   const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');
   ctx.fillStyle='#09202ce8';ctx.fillRect(0,0,512,128);ctx.strokeStyle='#'+status.color.toString(16).padStart(6,'0');ctx.lineWidth=5;ctx.strokeRect(3,3,506,122);ctx.fillStyle=ctx.strokeStyle;ctx.font='bold 34px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(status.label,256,64);
   const texture=new THREE.CanvasTexture(canvas);texture.encoding=THREE.sRGBEncoding;
   p.label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));p.label.scale.set(1.6,.4,1);p.label.position.y=2.2;p.display.add(p.label);
  }
  this.app.renderer.domElement.parentElement.dataset.districtStatus=JSON.stringify(statuses);
 }
 rebuild(){
  for(const p of this.points){this.group.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();if(p.evidenceLabel){p.evidenceLabel.material.map.dispose();p.evidenceLabel.material.dispose();}if(p.display){this.group.remove(p.display);const materials=new Set();p.display.traverse(o=>{if(!o.isSprite)o.geometry?.dispose();if(o.material)materials.add(o.material);});for(const m of materials){m.map?.dispose();m.dispose();}}}this.points=[];
  for(const [id,config] of Object.entries(CityGameplay.missions)){
   const zone=this.app.config.zones.find(z=>z.id===id);if(!zone)continue;
   ['terminal',...config.evidence].forEach((key,i)=>{
    let position;for(const x of [6.8,7.6,5.8]){const z=zone.center-6-i*9;if(!CityCore.blocked(x,z,this.app.world.getColliders())){position={x,z};break;}}
    if(!position)return;
    const mesh=new THREE.Mesh(new THREE.OctahedronGeometry(.24),new THREE.MeshBasicMaterial({color:key==='terminal'?0xffc56c:0x78eee5}));
    mesh.position.set(position.x,this.app.world.groundAt(position.x,position.z)+1.2,position.z);this.group.add(mesh);const point={id,key,mesh,...position};if(key==='terminal')this.makeTerminal(point);else{
     const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const c=canvas.getContext('2d');c.fillStyle='rgba(5,25,38,.88)';c.fillRect(0,0,512,128);c.strokeStyle='#78eee5';c.lineWidth=4;c.strokeRect(3,3,506,122);c.fillStyle='#dcffff';c.textAlign='center';c.textBaseline='middle';c.font='bold 38px Microsoft YaHei, sans-serif';c.fillText(this.copy[id].clues[key][0],256,64,470);
     const texture=new THREE.CanvasTexture(canvas);texture.encoding=THREE.sRGBEncoding;const label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));label.scale.set(1.8,.45,1);label.position.y=.8;label.visible=false;mesh.add(label);point.evidenceLabel=label;
    }this.points.push(point);
   });
  }this.updateTerminals();
 }
 active(p){const m=this.state.missions[p.id];return p.key==='terminal'?m.status!=='locked':m.status==='active'&&!m.evidence.includes(p.key);}
 send(event){
  let next;try{next=CityGameplay.transition(this.state,event);}catch(e){this.app.notify('当前条件尚未满足');return false;}
  try{localStorage.setItem('rain-city-campaign-v1',JSON.stringify(next));}catch(e){this.app.notify('任务进度未能保存，本次操作未结算；请检查浏览器存储后重试');return false;}
  const reward=next.tokens-this.state.tokens;this.state=next;
  this.app.audio?.play(event.type);
  if(event.type==='accept')this.scanMessage='委托已接取，按 Q 查找附近信号。';
  if(event.type==='evidence'){this.scanned.delete(event.mission+'/'+event.key);this.scanMessage='线索已记录，可继续扫描其他信号。';}
  if(event.type==='resolve'){this.scanned.clear();this.scanMessage='委托已交付，可在下个任务区域继续扫描。';this.app.notify('委托已交付 · 获得 '+reward+' 券'+(event.mission==='market'?' · 城市改造权限已解锁':''));}
  this.render();this.tick(.2);return true;
 }
 interact(){
  if(this.app.mode!=='walk')return;
  const p=this.nearest;if(!p||this.distance(p)>2.6){this.app.notify('靠近发光信标后按 E 交互');return;}
  const m=this.state.missions[p.id];
  if(p.key==='terminal'){
   if(m.status==='available'){if(this.send({type:'accept',mission:p.id}))this.app.notify('委托已接取，沿街寻找青色线索信标');}
   else this.app.notify(m.status==='resolved'?CityGameplay.districtStatus(this.state)[p.id].note:'线索齐全后，可在委托面板选择交付');
  }else{if(this.send({type:'evidence',mission:p.id,key:p.key}))this.app.notify(this.copy[p.id].clues[p.key][1]);}
 }
 distance(p){return Math.hypot(this.app.camera.position.x-p.x,this.app.camera.position.z-p.z);}
 scan(){
  if(this.app.mode!=='walk')return;
  const now=performance.now()/1000;if(now<this.scanReadyAt){this.app.notify(`扫描冷却中，还需 ${Math.ceil(this.scanReadyAt-now)} 秒`);return;}
  const profile=CityGameplay.scanProfile(this.state),candidates=CityGameplay.scanCandidates(this.state,this.app.camera.position,this.points);
  this.app.audio?.play('scan');
  this.app.scene.updateMatrixWorld(true);
  const blockers=[...this.app.world.objects.values(),this.app.world.infrastructure];
  const visible=candidates.filter(c=>{const point=this.points.find(p=>p.id===c.id&&p.key===c.key),direction=point.mesh.position.clone().sub(this.app.camera.position),distance=direction.length();return distance<.3||!new THREE.Raycaster(this.app.camera.position,direction.normalize(),.05,distance-.24).intersectObjects(blockers,true).length;});
  this.scanned=new Set(visible.map(p=>p.id+'/'+p.key));this.scanReadyAt=now+profile.cooldown;this.scanUntil=now+profile.duration;
  this.scanMessage=visible.length?`发现 ${visible.length} 处线索：`+visible.map(p=>this.copy[p.id].clues[p.key][0]+`（${Math.round(p.distance)} 米）`).join('、')+(profile.analysis?'。智能体分析：'+this.copy[visible[0].id].clues[visible[0].key][1]:'。走近后按 E 调查。'):candidates.length?'信号被建筑遮挡，请改变位置后重试。':'附近没有待调查信号，请先接取委托或靠近任务区域。';
  this.app.notify(this.scanMessage);this.tick(.2);
 }
 button(text,fn,disabled=false){const b=document.createElement('button');b.textContent=text;b.disabled=disabled;b.onclick=fn;return b;}
 closeChallenge(message){
  if(!this.challenge)return;const dialog=this.challenge.dialog;this.challenge=null;dialog.close();dialog.remove();this.app.keys.clear();document.getElementById('viewport').focus();if(message)this.app.notify(message);
 }
 startChallenge(id){
  const terminal=this.points.find(p=>p.id===id&&p.key==='terminal');
  if(this.app.mode!=='walk'||!terminal||this.distance(terminal)>2.6||this.state.missions[id].status==='locked'||this.state.calibrations?.[id]){this.app.notify('请靠近尚未完成校准的终端');return;}
  this.closeChallenge();this.app.keys.clear();this.app.jumpRequested=false;
  const dialog=document.createElement('dialog');dialog.id='calibration-dialog';dialog.setAttribute('aria-labelledby','calibration-title');
  const title=document.createElement('h2');title.id='calibration-title';title.textContent='算力校准 · '+this.app.config.zones.find(z=>z.id===id).name;dialog.append(title);
  const description=document.createElement('p');description.textContent='记住连接顺序，随后按顺序选择接口，或按数字 1–4。每个区域首次完成奖励 10 券；出错可重试，不扣算力券。';dialog.append(description);
  const status=document.createElement('p');status.className='calibration-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');dialog.append(status);
  const grid=document.createElement('div');grid.className='calibration-grid';dialog.append(grid);
  const buttons=['一','二','三','四'].map((name,index)=>{const b=this.button('接口'+name,()=>this.calibrationInput(index));b.dataset.node=String(index);grid.append(b);return b;});
  const hint=document.createElement('p');hint.className='calibration-hint';dialog.append(hint);
  const retry=this.button('重新观察',()=>this.startChallenge(id));dialog.append(retry);
  dialog.append(this.button('取消校准',()=>this.closeChallenge('校准已取消，没有扣除算力券')));
  const pattern=CityGameplay.calibrationPattern(id);this.challenge={id,pattern,entered:[],phase:'preview',readyAt:performance.now()/1000+pattern.length,dialog,status,buttons,hint,retry};
  dialog.oncancel=e=>{e.preventDefault();this.closeChallenge('校准已取消，没有扣除算力券');};
  dialog.onkeydown=e=>{if(/^Digit[1-4]$/.test(e.code)||/^Numpad[1-4]$/.test(e.code)){e.preventDefault();e.stopPropagation();if(!e.repeat)this.calibrationInput(Number(e.code.slice(-1))-1);}};
  document.body.append(dialog);dialog.showModal();this.updateChallenge();
 }
 updateChallenge(){
  const c=this.challenge;if(!c)return;
  const terminal=this.points.find(p=>p.id===c.id&&p.key==='terminal');
  if(this.app.mode!=='walk'||!terminal||this.distance(terminal)>2.6){this.closeChallenge('已离开终端，校准取消');return;}
  if(c.phase==='preview'&&performance.now()/1000>=c.readyAt){c.phase='input';c.buttons[0].disabled=false;c.buttons[0].focus();}
  const names=['一','二','三','四'];
  const text=c.phase==='preview'?'观察连接顺序：'+c.pattern.map(i=>names[i]).join(' → '):c.phase==='failed'?'接线错误，本次没有奖励。可以重试。':`按顺序连接接口 · 已完成 ${c.entered.length} / ${c.pattern.length}`;
  if(c.status.textContent!==text)c.status.textContent=text;
  for(const b of c.buttons)b.disabled=c.phase!=='input';
  c.hint.textContent=c.phase==='input'&&this.state.upgrades.aiLevel===2?'智能体建议：下一步连接接口'+names[c.pattern[c.entered.length]]:c.phase==='preview'?'观察完成后，顺序将隐藏。':'智能体二级可提供下一节点提示。';
  c.retry.textContent=c.phase==='failed'?'重试校准':'重新观察';
 }
 calibrationInput(node){
  const c=this.challenge;if(!c||c.phase!=='input')return;
  const terminal=this.points.find(p=>p.id===c.id&&p.key==='terminal');
  if(this.app.mode!=='walk'||!terminal||this.distance(terminal)>2.6){this.closeChallenge('已离开终端，校准取消');return;}
  c.entered.push(node);
  if(node!==c.pattern[c.entered.length-1]){c.phase='failed';this.app.audio?.play('calibration-error');this.updateChallenge();return;}
  if(c.entered.length===c.pattern.length){const id=c.id,sequence=[...c.entered];this.closeChallenge();if(this.send({type:'calibrate',district:id,sequence}))this.app.notify('校准成功，获得 10 券；本区奖励已结算');return;}
  this.app.audio?.play('calibration-node');this.updateChallenge();
 }
 prepareProgress(next,label){
  this.pendingProgress=next;this.progressPrompt.textContent=label+`：算力券 ${next.tokens}，智能体 ${next.upgrades.aiLevel} 级。确认后自动备份当前任务进度，建筑布局保留。`;
  this.progressConfirm.hidden=false;this.progressCancel.hidden=false;
 }
 replaceProgress(){
  if(!this.pendingProgress)return;
  let next;try{next=CityGameplay.replaceSaved(localStorage,this.state,this.pendingProgress);}catch(e){this.app.notify('无法备份或保存，当前进度未替换；请先导出存档');return;}
  this.state=next;this.pendingProgress=null;this.scanReadyAt=0;this.scanUntil=0;this.scanned.clear();this.scanMessage='按 Q 扫描附近线索';this.render();
  const id=CityGameplay.objective(next)?.id||'tower';this.app.zone(this.app.config.zones.find(z=>z.id===id));this.tick(.2);this.app.notify('任务进度已切换，原进度可在任务存档中恢复');
 }
 progressControls(){
  const section=document.createElement('details'),summary=document.createElement('summary');summary.textContent='任务存档';section.append(summary);
  section.append(this.button('导出任务进度',()=>this.app.download(new Blob([CityGameplay.exportProgress(this.state)],{type:'application/json'}),'rain-city-campaign.json')));
  const label=document.createElement('label');label.textContent='导入任务进度';
  const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.setAttribute('aria-label','导入任务进度');
  input.onchange=async()=>{const file=input.files?.[0];try{if(!file)return;if(file.size>32768)throw Error('size');const next=CityGameplay.importProgress(await file.text());this.prepareProgress(next,'导入这份任务存档');}catch(e){this.app.notify('存档不可用：请选择小于 32 KB 的有效任务存档；当前进度保留');}finally{input.value='';}};
  label.append(input);section.append(label);
  section.append(this.button('重新开始任务',()=>this.prepareProgress(CityGameplay.createState(),'开始新的任务进度')));
  section.append(this.button('恢复上一份进度',()=>{try{const saved=localStorage.getItem('rain-city-campaign-previous-v1');if(!saved)throw Error('missing');this.prepareProgress(CityGameplay.restore(saved),'恢复上一份任务进度');}catch(e){this.app.notify('没有可恢复的备份；当前任务进度保留');}}));
  this.progressPrompt=document.createElement('p');section.append(this.progressPrompt);
  this.progressConfirm=this.button('确认切换进度',()=>this.replaceProgress());this.progressConfirm.hidden=true;section.append(this.progressConfirm);
  this.progressCancel=this.button('取消切换',()=>{this.pendingProgress=null;this.progressPrompt.textContent='已取消，当前进度保留';this.progressConfirm.hidden=true;this.progressCancel.hidden=true;});this.progressCancel.hidden=true;section.append(this.progressCancel);
  return section;
 }
 render(){
  const journalOpen=this.panel.querySelector('details')?.open||false;
  this.pendingProgress=null;
  this.actionKey=null;
  const id=this.current(),m=this.state.missions[id],c=this.copy[id];this.panel.replaceChildren();
  const finished=this.state.missions.market.status==='resolved';this.panel.classList.toggle('campaign-optional',finished);this.panel.classList.toggle('expanded',Boolean(this.showOptional));
  const heading=document.createElement('h2');heading.textContent=finished&&!this.showOptional?'断电委托已完成':'街区委托 · '+c.title;this.panel.append(heading);
  if(finished){const optional=this.button(this.showOptional?'收起可选委托':'继续可选委托',()=>{this.showOptional=!this.showOptional;this.render();});optional.className='optional-toggle';this.panel.append(optional);}
  const balance=document.createElement('p');balance.textContent=`算力券 ${this.state.tokens} · 随身智能体 ${this.state.upgrades.aiLevel} 级`;this.panel.append(balance);
  const objective=document.createElement('p');objective.className='campaign-objective';objective.textContent=m.status==='available'?'靠近金色终端，按 E 接取委托':m.status==='resolved'?(m.choice==='open'?'接口已公开。街区恢复了自己的身份记录。':'账本已封存。你获得了报酬，但许可仍握在塔方手中。'):`已取得 ${m.evidence.length} / ${CityGameplay.missions[id].evidence.length} 条线索`;this.panel.append(objective);
  this.navigation=document.createElement('p');this.navigation.className='campaign-objective';this.panel.append(this.navigation);
  this.hint=document.createElement('p');this.hint.className='campaign-hint';this.panel.append(this.hint);
  this.revisit=document.createElement('p');this.revisit.className='campaign-revisit';this.panel.append(this.revisit);
  this.actions=document.createElement('div');this.actions.className='campaign-actions';this.panel.append(this.actions);
  this.panel.append(this.button('交互 · E',()=>this.interact()));
  this.scanButton=this.button('侦察扫描 · Q',()=>this.scan());this.panel.append(this.scanButton);
  this.scanStatus=document.createElement('p');this.scanStatus.className='campaign-scan';this.scanStatus.setAttribute('aria-live','polite');this.panel.append(this.scanStatus);
  this.panel.append(this.button('引导步行至下一目标',()=>{if(this.target)this.app.guideTo(this.target);},!CityGameplay.objective(this.state)));
  const journal=document.createElement('details'),summary=document.createElement('summary');journal.open=journalOpen;summary.textContent='线索与抉择记录';journal.append(summary);
  for(const [mission,entry] of Object.entries(this.state.missions)){
   if(entry.status==='locked')continue;
   const title=document.createElement('p');title.textContent=this.copy[mission].title+(entry.status==='resolved'?' · 已完成':entry.status==='available'?' · 待接取':' · 进行中');journal.append(title);
   for(const key of entry.evidence){const line=document.createElement('p');line.textContent=this.copy[mission].clues[key].join('：');journal.append(line);}
   if(entry.choice){const line=document.createElement('p');line.textContent='选择：'+this.copy[mission].choices[entry.choice];journal.append(line);const consequence=document.createElement('p');consequence.textContent=CityGameplay.districtStatus(this.state)[mission].note;journal.append(consequence);}
   if(this.state.calibrations?.[mission]){const line=document.createElement('p');line.textContent='终端校准已完成 · 奖励 10 券已结算';journal.append(line);}
  }
  this.panel.append(journal);
  this.panel.append(this.progressControls());
  this.app.renderer.domElement.parentElement.dataset.campaign=JSON.stringify(this.state);
  this.updateTerminals();
 }
 tick(dt){
  this.elapsed+=dt;if(this.elapsed<.15)return;this.elapsed=0;this.panel.hidden=this.app.mode!=='walk'||Boolean(this.app.renovation?.open);this.group.visible=this.app.mode==='walk';
  const now=performance.now()/1000,profile=CityGameplay.scanProfile(this.state),remaining=Math.max(0,Math.ceil(this.scanReadyAt-now));
  this.scanButton.disabled=remaining>0;this.scanButton.textContent=remaining?`扫描冷却 · ${remaining} 秒`:'侦察扫描 · Q';
  const scanText=`${profile.range} 米范围 · ${profile.cooldown} 秒冷却。${this.scanMessage}`;if(this.scanStatus.textContent!==scanText)this.scanStatus.textContent=scanText;
  const signature=JSON.stringify(this.app.layout);if(signature!==this.signature){this.signature=signature;this.rebuild();}
  this.updateChallenge();
  const available=this.points.filter(p=>this.active(p));for(const p of this.points){p.mesh.visible=this.active(p);if(p.display){p.display.visible=this.active(p)&&this.distance(p)>3;if(p.label)p.label.visible=this.distance(p)>5;}p.mesh.rotation.y+=.12;}
  this.nearest=available.reduce((best,p)=>!best||this.distance(p)<this.distance(best)?p:best,null);
  const p=this.nearest,near=p&&this.distance(p)<=2.6;
  this.revisit.hidden=!near||p.key!=='terminal';if(!this.revisit.hidden){const status=CityGameplay.districtStatus(this.state)[p.id];this.revisit.textContent=status.label+'：'+status.note;}
  const goal=CityGameplay.objective(this.state);
  const target=goal&&this.points.find(p=>p.id===goal.id&&p.key===goal.key);
  this.target=target;
  this.navigation.textContent=target?`${this.app.config.zones.find(z=>z.id===target.id).name} · ${goal.phase==='accept'?'接取委托':goal.phase==='deliver'?'返回终端交付':this.copy[target.id].clues[target.key][0]} · ${Math.round(this.distance(target))} 米`:goal?'目标暂不可达，请恢复有效街区布局':'本章已结束，可继续漫游和返回商业街升级。';
  const scan=this.state.upgrades.optic?45:25;
  this.hint.textContent=near?'按 E 交互 · '+this.copy[p.id].title+' · '+(p.key==='terminal'?'委托终端':this.copy[p.id].clues[p.key][0]):'沿街前进，靠近信标后按 E';
  if(target&&this.distance(target)<=scan&&this.state.upgrades.aiLevel===2)this.hint.textContent+=' · 智能体：'+(goal.phase==='accept'?'在此接取委托':goal.phase==='deliver'?'线索齐全，可以交付':this.copy[target.id].clues[target.key][1]);
  for(const point of this.points){const highlighted=now<this.scanUntil&&this.scanned.has(point.id+'/'+point.key),scale=highlighted?2+.3*Math.sin(now*8):this.state.upgrades.optic&&this.distance(point)<scan?1.6:1;point.mesh.scale.setScalar(scale);if(point.key!=='terminal'){point.mesh.material.color.setHex(highlighted?0xffdf89:0x78eee5);if(point.evidenceLabel){point.evidenceLabel.visible=this.active(point)&&(highlighted||this.distance(point)<8);point.evidenceLabel.scale.set(1.8/scale,.45/scale,1);}}}
  const key=near?`${p.id}/${p.key}/${this.state.tokens}/${JSON.stringify(this.state.missions)}/${JSON.stringify(this.state.upgrades)}`:'';
  if(key===this.actionKey)return;this.actionKey=key;this.actions.replaceChildren();
  if(!near||p.key!=='terminal')return;
  const m=this.state.missions[p.id],config=CityGameplay.missions[p.id];
  this.actions.append(this.button(this.state.calibrations?.[p.id]?'本区校准已完成':'算力校准 · 首次奖励 10 券',()=>this.startChallenge(p.id),Boolean(this.state.calibrations?.[p.id])));
  if(m.status==='active'&&config.evidence.every(k=>m.evidence.includes(k)))for(const [choice,label] of Object.entries(this.copy[p.id].choices))this.actions.append(this.button(label,()=>{if(this.app.mode==='walk'&&this.distance(p)<=2.6)this.send({type:'resolve',mission:p.id,choice});}));
  if(p.id==='market'&&m.status==='resolved')for(const [upgrade,label] of Object.entries({optic:'侦察视觉 · 30 券',mobility:'机动辅助 · 30 券',ai2:'智能体二级 · 50 券'})){
   const owned=upgrade==='ai2'?this.state.upgrades.aiLevel===2:this.state.upgrades[upgrade];const locked=upgrade==='ai2'&&this.state.missions.homes.status!=='resolved';
   this.actions.append(this.button(owned?label.split(' · ')[0]+' · 已安装':locked?'智能体二级 · 先完成居民区委托':label,()=>{if(this.app.mode==='walk'&&this.distance(p)<=2.6)this.send({type:'purchase',upgrade});},owned||locked||this.state.tokens<CityGameplay.upgrades[upgrade]));
  }
 }
}
