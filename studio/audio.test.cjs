const { test } = require('node:test');
const assert = require('node:assert/strict');
const { settings, soundtrack, Engine, createRaceSound } = require('./audio.js');

function setup(media, saved) {
  const values = new Map(saved === undefined ? [] : [['rain-city-audio-v1', saved]]), messages = [], sources = [], oscillators = [];
  let contexts = 0;
  function parameter() { return { value: 0, calls: [], setTargetAtTime(...args) { this.calls.push(args); }, setValueAtTime(...args) { this.calls.push(args); }, linearRampToValueAtTime(...args) { this.calls.push(args); }, exponentialRampToValueAtTime(...args) { this.calls.push(args); } }; }
  function node() { return { gain: parameter(), frequency: parameter(), connections: [], connect(target) { this.connections.push(target); }, disconnect() { this.disconnected = true; }, start(at) { this.started = at ?? 0; }, stop(at) { this.stopped = at; } }; }
  const context = { state: 'suspended', sampleRate: 8000, currentTime: 5, destination: {}, resumes: 0, suspends: 0,
    createGain: node, createBiquadFilter: node,
    createDynamicsCompressor() { return { ...node(), threshold: parameter(), knee: parameter(), ratio: parameter() }; },
    createBuffer(_channels, length) { const data = new Float32Array(length); return { getChannelData: () => data }; },
    createBufferSource() { const source = node(); sources.push(source); return source; },
    createOscillator() { const oscillator = node(); oscillators.push(oscillator); return oscillator; },
    async resume() { this.resumes++; this.state = 'running'; }, async suspend() { this.suspends++; this.state = 'suspended'; }
  };
  const app = { config: { zones: [{ id: 'market', name: '商业街' }] }, notify: text => messages.push(text) };
  const engine = new Engine(app, { document: null, media, storage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }, contextFactory: () => { contexts++; return context; } });
  return { engine, context, values, messages, sources, oscillators, contexts: () => contexts };
}

function raceSetup(saved) {
  const base=setup(),gains=[],filters=[],events=new Map();let contexts=0;
  for(const [name,list]of [['createGain',gains],['createBiquadFilter',filters]]){const original=base.context[name];base.context[name]=()=>{const node=original();list.push(node);return node;};}
  const view={addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)},document={...view,hidden:false};
  const sound=createRaceSound({document,window:view,storage:{getItem:()=>saved||null},contextFactory:()=>{contexts++;return base.context;}});
  return {...base,sound,gains,filters,events,document,contexts:()=>contexts};
}

test('race engine is lazy, changes pitch with speed and reuses its graph after manual toggles',async()=>{
  const s=raceSetup();assert.equal(s.sound.getState().enabled,false);s.sound.update(100,true,false);assert.equal(s.contexts(),0);
  assert.equal((await s.sound.start()).active,true);assert.equal(s.contexts(),1);assert.equal(s.oscillators.length,2);
  s.sound.update(0,false,false);const idle=s.oscillators[0].frequency.calls.at(-1)[0];
  s.sound.update(200,true,false);assert.ok(s.oscillators[0].frequency.calls.at(-1)[0]>idle);assert.ok(s.gains[0].gain.calls.at(-1)[0]>0);
  await s.sound.toggle();assert.equal(s.sound.getState().enabled,false);assert.equal(s.gains[0].gain.calls.at(-1)[0],0);
  s.sound.update(200,true,false);assert.equal(s.gains[0].gain.calls.at(-1)[0],0);
  await s.sound.toggle();assert.equal(s.contexts(),1);assert.equal(s.oscillators.length,2);
  s.sound.dispose();assert.equal(s.sound.getState().disposed,true);assert.ok(s.oscillators.every(node=>node.disconnected));assert.equal(s.events.size,0);
});

test('race pause, background visibility, blur and saved mute all silence the engine',async()=>{
  const s=raceSetup();await s.sound.start();s.sound.update(160,false,true);assert.equal(s.sound.getState().active,false);assert.equal(s.gains[0].gain.calls.at(-1)[0],0);
  s.sound.update(160,false,false);assert.equal(s.sound.getState().active,true);
  s.document.hidden=true;s.events.get('visibilitychange')();assert.equal(s.sound.getState().active,false);
  s.document.hidden=false;s.events.get('visibilitychange')();assert.equal(s.sound.getState().active,true);
  s.events.get('blur')();assert.equal(s.sound.getState().active,false);s.events.get('focus')();assert.equal(s.sound.getState().active,true);
  const muted=raceSetup(JSON.stringify({muted:true}));await muted.sound.start();muted.sound.update(200,true,false);assert.equal(muted.sound.getState().muted,true);assert.equal(muted.gains[0].gain.calls.at(-1)[0],0);
});

test('race audio device failure is recoverable and never throws into the race loop',async()=>{
  let fail=true;const s=setup(),sound=createRaceSound({document:null,window:null,storage:null,contextFactory:()=>{if(fail)throw Error('device');return s.context;}});
  assert.equal((await sound.start()).available,false);assert.doesNotThrow(()=>sound.update(120,true,false));
  fail=false;assert.equal((await sound.start()).active,true);sound.dispose();assert.equal((await sound.start()).disposed,true);
});

test('audio settings normalize corrupt values and clamp valid volumes', () => {
  assert.deepEqual(settings(null), { master: .6, music: .4, rain: .3, effects: .55, muted: false });
  assert.deepEqual(settings({ master: 2, rain: -1, effects: NaN, muted: 'yes' }), { master: 1, music: .4, rain: 0, effects: .55, muted: false });
  assert.equal(settings({ master: '0' }).master, .6);
});

test('game audio starts only after explicit enable and reuses one noise graph', async () => {
  const s = setup(); assert.equal(s.contexts(), 0); assert.equal(s.engine.play('scan'), false);
  await s.engine.toggle(); assert.equal(s.contexts(), 1); assert.equal(s.context.state, 'running'); assert.equal(s.sources.length, 1);
  const noise = s.sources[0].buffer.getChannelData(0);
  assert.ok(noise.some(n => n !== 0)); assert.ok(noise.every(n => Number.isFinite(n) && Math.abs(n) <= 1));
  assert.equal(s.engine.play('scan'), true); assert.equal(s.oscillators.length, 3); assert.equal(s.engine.lastCue, '侦察扫描');
  assert.equal(s.engine.play('unknown'), false);
  for (const voice of s.oscillators) { assert.ok(voice.stopped > voice.started); voice.onended(); assert.equal(voice.disconnected, true); }
  await s.engine.toggle(); await s.engine.toggle(); assert.equal(s.contexts(), 1); assert.equal(s.sources.length, 1);
});

test('indoor filtering, saved volume and mute affect game audio only', async () => {
  const s = setup(); s.values.set('rain-city-campaign-v1', 'quest'); await s.engine.toggle();
  s.engine.update({ id: 'homes', name: '居住区' }, true);
  assert.equal(s.engine.rainFilter.frequency.calls.at(-1)[0], 1100);
  assert.equal(s.engine.rainLevel.gain.calls.at(-1)[0], .025);
  s.engine.setPreferences({ muted: true }); assert.equal(s.engine.master.gain.calls.at(-1)[0], 0); assert.equal(s.engine.play('resolve'), false);
  s.engine.setPreferences({ muted: false, effects: 0 }); assert.equal(s.engine.play('scan'), false);
  s.engine.setPreferences({ effects: .5 }); assert.equal(s.engine.play('evidence'), true);
  assert.equal(s.values.get('rain-city-campaign-v1'), 'quest'); assert.equal(JSON.parse(s.values.get('rain-city-audio-v1')).effects, .5);
  s.engine.update({ id: 'homes', name: '居住区' }, false); assert.equal(s.engine.rainFilter.frequency.calls.at(-1)[0], 6000);
});

test('background tabs suspend sound and an explicit pause stays paused', async () => {
  const s = setup(); await s.engine.toggle(); await s.engine.visibility(true);
  assert.equal(s.context.state, 'suspended'); assert.equal(s.engine.play('purchase'), false);
  await s.engine.visibility(false); assert.equal(s.context.state, 'running'); assert.equal(s.engine.play('purchase'), true);
  await s.engine.toggle(); const resumes = s.context.resumes;
  await s.engine.visibility(true); await s.engine.visibility(false); assert.equal(s.context.resumes, resumes); assert.equal(s.engine.enabled, false);
});

test('soundscape selection saves without enabling or constructing audio', () => {
  const s = setup(); s.values.set('rain-city-campaign-v1', 'quest');
  s.engine.setPreferences({ master: .7, rain: .45, muted: true });
  assert.equal(s.engine.getPreset(), 'rain');
  assert.equal(s.engine.setPreset('quiet'), 'quiet');
  assert.equal(s.engine.getPreset(), 'quiet'); assert.equal(s.contexts(), 0); assert.equal(s.sources.length, 0);
  assert.equal(s.engine.enabled, false); assert.equal(s.context.resumes, 0);
  assert.deepEqual(JSON.parse(s.values.get('rain-city-audio-v1')), { master: .7, music: .4, rain: .45, effects: .55, muted: true, preset: 'quiet' });
  assert.equal(s.values.get('rain-city-campaign-v1'), 'quest');
  s.engine.setPreferences({ effects: .2 });
  assert.equal(JSON.parse(s.values.get('rain-city-audio-v1')).preset, 'quiet', 'volume changes must retain the selected soundscape');
});

test('invalid soundscape IDs leave settings and audio untouched', () => {
  const s = setup(); s.engine.setPreset('quiet'); const saved = s.values.get('rain-city-audio-v1');
  for (const id of [undefined, null, '', 'storm', 'constructor', '__proto__', 'toString', {}, ['rain']]) assert.throws(() => s.engine.setPreset(id), /Invalid audio preset/);
  assert.equal(s.engine.getPreset(), 'quiet'); assert.equal(s.values.get('rain-city-audio-v1'), saved);
  assert.equal(s.contexts(), 0); assert.equal(s.engine.enabled, false);
});

test('soundscape preferences restore safely from current, older and corrupt saves', () => {
  const cases = [
    [JSON.stringify({ preset: 'quiet', master: .8, rain: .2 }), 'quiet', .8],
    [JSON.stringify({ master: .8 }), 'rain', .8],
    [JSON.stringify({ preset: 'constructor', master: .8 }), 'rain', .8],
    [JSON.stringify({ preset: 'storm', master: .8 }), 'rain', .8],
    ['{corrupt', 'rain', .6], ['null', 'rain', .6]
  ];
  for (const [saved, preset, master] of cases) {
    const s = setup(undefined, saved);
    assert.equal(s.engine.getPreset(), preset); assert.equal(s.engine.preferences.master, master);
    assert.equal(s.contexts(), 0); assert.equal(s.engine.enabled, false);
  }
});

test('soundscapes change rain level and filtering while reusing the audio graph', async () => {
  const s = setup(); await s.engine.toggle();
  assert.equal(s.engine.rainLevel.gain.calls.at(-1)[0], .1); assert.equal(s.engine.rainFilter.frequency.calls.at(-1)[0], 6000);
  s.engine.setPreferences({ master: .75, rain: .5, effects: .2, muted: true });
  s.engine.setPreset('quiet');
  assert.equal(s.engine.rainLevel.gain.calls.at(-1)[0], .035); assert.equal(s.engine.rainFilter.frequency.calls.at(-1)[0], 1600);
  assert.equal(s.engine.master.gain.calls.at(-1)[0], 0); assert.equal(s.engine.rainBus.gain.calls.at(-1)[0], .5);
  assert.equal(s.engine.effectsBus.gain.calls.at(-1)[0], .2);
  s.engine.update({ id: 'homes', name: '居住区' }, true);
  assert.equal(s.engine.rainLevel.gain.calls.at(-1)[0], .012); assert.equal(s.engine.rainFilter.frequency.calls.at(-1)[0], 650);
  s.engine.setPreset('rain');
  assert.equal(s.engine.rainLevel.gain.calls.at(-1)[0], .025); assert.equal(s.engine.rainFilter.frequency.calls.at(-1)[0], 1100);
  assert.equal(s.engine.preferences.master, .75); assert.equal(s.engine.preferences.muted, true);
  assert.equal(s.contexts(), 1); assert.equal(s.sources.length, 1); assert.equal(s.context.resumes, 1);
});

test('background soundscape changes preserve pause and restore the selected ambience', async () => {
  const s = setup(); await s.engine.toggle(); await s.engine.visibility(true);
  const resumes = s.context.resumes; s.engine.setPreset('quiet');
  assert.equal(s.context.state, 'suspended'); assert.equal(s.context.resumes, resumes);
  assert.equal(s.engine.play('scan'), false);
  await s.engine.visibility(false);
  assert.equal(s.context.state, 'running'); assert.equal(s.engine.getPreset(), 'quiet');
  assert.equal(s.engine.rainLevel.gain.calls.at(-1)[0], .035); assert.equal(s.engine.rainFilter.frequency.calls.at(-1)[0], 1600);
  await s.engine.toggle(); const pausedResumes = s.context.resumes;
  s.engine.setPreset('rain'); await s.engine.visibility(true); await s.engine.visibility(false);
  assert.equal(s.engine.enabled, false); assert.equal(s.context.resumes, pausedResumes);
  assert.equal(s.contexts(), 1); assert.equal(s.sources.length, 1);
});

test('a storage failure still applies the soundscape without enabling audio', () => {
  const s = setup(); s.engine.storage = { setItem() { throw Error('quota'); } };
  assert.doesNotThrow(() => s.engine.setPreset('quiet'));
  assert.equal(s.engine.getPreset(), 'quiet'); assert.equal(s.contexts(), 0);
  assert.match(s.messages[0], /声景已生效.*未能保存/);
});

test('an unavailable audio device leaves the game usable', async () => {
  const messages = [], engine = new Engine({ config: { zones: [{ id: 'market', name: '商业街' }] }, notify: text => messages.push(text) }, { document: null, storage: null, contextFactory() { throw Error('device'); } });
  await engine.toggle(); assert.equal(engine.enabled, false); assert.equal(engine.busy, false); assert.equal(engine.play('scan'), false); assert.match(messages[0], /无法开启/);
});

const track = { version: 1, title: 'Plain Jane (Freestyle)', artists: ['Ombre2Choc Nation', 'Nicki Minaj', 'Cardi B'], album: 'Revenge Tour (Mixtape)', src: 'audio/plain-jane.mp3', loop: true };
function player() { return { paused: true, playCalls: 0, attrs: {}, pause() { this.paused = true; }, async play() { this.playCalls++; this.paused = false; }, load() {}, getAttribute(key) { return this.attrs[key]; }, setAttribute(key, value) { this.attrs[key] = value; }, removeAttribute(key) { delete this.attrs[key]; } }; }

test('public soundtrack accepts media sources and rejects pages or executable URLs', () => {
  assert.deepEqual(soundtrack(track), track);
  assert.equal(soundtrack({ ...track, src: null }).src, null);
  assert.equal(soundtrack({ ...track, src: 'https://cdn.example.com/plain-jane.ogg' }).src, 'https://cdn.example.com/plain-jane.ogg');
  for (const src of ['javascript:alert(1)', 'file:///C:/music.mp3', '../music.mp3', 'audio/../music.mp3', 'audio/%2e%2e/music.mp3', 'https://y.qq.com/songDetail/123', 'https://user:password@cdn.example.com/a.mp3']) assert.throws(() => soundtrack({ ...track, src }));
});

test('public song is lazy, loops, obeys game volume and pauses with the tab', async () => {
  const media = player(), s = setup(media); s.engine.setTrack(track);
  assert.equal(media.playCalls, 0); assert.equal(media.getAttribute('src'), undefined);
  await s.engine.toggle(); assert.equal(media.playCalls, 1); assert.equal(media.getAttribute('src'), track.src); assert.equal(media.loop, true); assert.equal(media.volume, .24);
  s.engine.setPreferences({ master: .5, music: .2, muted: true }); assert.equal(media.volume, .1); assert.equal(media.muted, true);
  await s.engine.visibility(true); assert.equal(media.paused, true);
  await s.engine.visibility(false); assert.equal(media.paused, false);
  await s.engine.toggleSong(); assert.equal(media.paused, true); const calls = media.playCalls;
  await s.engine.visibility(true); await s.engine.visibility(false); assert.equal(media.playCalls, calls, 'explicit song pause must survive tab switching');
});

test('missing or failing song does not claim playback or disable game ambience', async () => {
  const media = player(), s = setup(media); s.engine.setTrack({ ...track, src: null });
  await s.engine.toggle(); assert.equal(media.playCalls, 0); assert.match(s.engine.trackMessage, /尚无/); assert.equal(s.engine.play('scan'), true);
  s.engine.setTrack(track); media.play = async () => { throw Error('network'); };
  await s.engine.startTrack(); assert.match(s.engine.trackMessage, /未能播放/); assert.equal(s.engine.enabled, true);
});

test('the sound panel presents available procedural ambience when no song source exists', () => {
  const s = setup(); s.engine.setTrack({ ...track, src: null }); s.engine.setPreset('quiet');
  s.engine.panel = { dataset: {} }; s.engine.sliders = {};
  for (const key of ['summary', 'toggleButton', 'status', 'trackTitle', 'trackStatus', 'songButton', 'mute', 'feedback']) s.engine[key] = {};
  s.engine.render();
  assert.equal(s.engine.trackTitle.textContent, '程序化声景 · 静谧工坊');
  assert.match(s.engine.status.textContent, /静谧工坊/); assert.match(s.engine.trackStatus.textContent, /程序化声景可用/);
  assert.equal(s.engine.songButton.hidden, true); assert.equal(s.engine.songButton.disabled, true);
  assert.equal(JSON.parse(s.engine.panel.dataset.audioState).preset, 'quiet');
  s.engine.setTrack(track);
  assert.equal(s.engine.songButton.hidden, false); assert.equal(s.engine.songButton.disabled, false);
  assert.match(s.engine.trackTitle.textContent, /Plain Jane/);
  assert.equal(s.contexts(), 0);
});
