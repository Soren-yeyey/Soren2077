const { test } = require('node:test');
const assert = require('node:assert/strict');
const { settings, soundtrack, Engine } = require('./audio.js');

function setup(media) {
  const values = new Map(), messages = [], sources = [], oscillators = [];
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
