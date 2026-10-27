/* Local synthesized ambience and interface sounds. No song recording is bundled. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CitySound = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const KEY = 'rain-city-audio-v1';
  const DEFAULTS = { master: .6, music: .4, rain: .3, effects: .55, muted: false };
  const CUES = {
    scan: [420, 840, 1260], accept: [330, 440], evidence: [660, 880],
    resolve: [440, 550, 660], purchase: [390, 780], calibrate: [440, 660, 880], 'calibration-node': [520], 'calibration-error': [220, 160]
  };
  const NAMES = { scan: '侦察扫描', accept: '接取委托', evidence: '记录线索', resolve: '交付委托', purchase: '义体升级', calibrate: '校准成功', 'calibration-node': '连接接口', 'calibration-error': '校准失败' };
  function settings(value) {
    const result = { ...DEFAULTS };
    for (const key of ['master', 'music', 'rain', 'effects']) if (typeof value?.[key] === 'number' && Number.isFinite(value[key])) result[key] = Math.max(0, Math.min(1, value[key]));
    if (typeof value?.muted === 'boolean') result.muted = value.muted;
    return result;
  }
  function soundtrack(value) {
    if (value?.version !== 1 || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 120 || !Array.isArray(value.artists) || !value.artists.length || value.artists.some(a => typeof a !== 'string' || a.length > 120) || typeof value.album !== 'string' || value.album.length > 200 || typeof value.loop !== 'boolean') throw Error('Invalid soundtrack');
    if (value.src !== null) {
      if (typeof value.src !== 'string' || value.src.length > 1000) throw Error('Invalid soundtrack URL');
      if (!/^audio\/[a-z0-9/-]+\.(mp3|ogg|m4a|wav)$/.test(value.src)) {
        const url = new URL(value.src);
        if (url.protocol !== 'https:' || url.username || url.password || !/\.(mp3|ogg|m4a|wav)$/i.test(url.pathname)) throw Error('Invalid soundtrack URL');
      }
    }
    return { version: 1, title: value.title, artists: [...value.artists], album: value.album, src: value.src, loop: value.loop };
  }
  class Engine {
    constructor(app, env = {}) {
      this.app = app; this.document = env.document === undefined ? root.document : env.document;
      this.storage = env.storage;
      if (this.storage === undefined) { try { this.storage = root.localStorage; } catch (_) { this.storage = null; } }
      this.contextFactory = env.contextFactory || (() => { const Context = root.AudioContext || root.webkitAudioContext; if (!Context) throw Error('unsupported'); return new Context(); });
      this.preferences = settings();
      try { this.preferences = settings(JSON.parse(this.storage?.getItem(KEY) || 'null')); } catch (_) { /* Keep usable defaults. */ }
      this.enabled = false; this.busy = false; this.hidden = Boolean(this.document?.hidden); this.context = null;
      this.track = null; this.media = env.media || null; this.songWanted = true; this.trackMessage = '歌曲信息载入中';
      this.inside = false; this.zone = app.config.zones[0]; this.lastCue = '';
      if (this.document) { this.mount(); this.document.addEventListener('visibilitychange', () => this.visibility(this.document.hidden)); }
    }
    build() {
      const c = this.contextFactory(); this.context = c;
      this.master = c.createGain(); this.rainBus = c.createGain(); this.effectsBus = c.createGain(); this.rainLevel = c.createGain();
      this.limiter = c.createDynamicsCompressor(); this.limiter.threshold.value = -12; this.limiter.knee.value = 12; this.limiter.ratio.value = 4;
      this.master.connect(this.limiter); this.limiter.connect(c.destination); this.rainBus.connect(this.master); this.effectsBus.connect(this.master); this.rainLevel.connect(this.rainBus);
      // Seeded noise is created only after the user enables game audio.
      const buffer = c.createBuffer(1, Math.floor(c.sampleRate * 2), c.sampleRate), data = buffer.getChannelData(0);
      let seed = 2077, smooth = 0;
      for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; smooth = smooth * .6 + (seed / 4294967296 * 2 - 1) * .4; data[i] = smooth; }
      this.rainSource = c.createBufferSource(); this.rainSource.buffer = buffer; this.rainSource.loop = true;
      this.rainFilter = c.createBiquadFilter(); this.rainFilter.type = 'lowpass';
      this.rainSource.connect(this.rainFilter); this.rainFilter.connect(this.rainLevel); this.rainSource.start();
      c.onstatechange = () => this.render(); this.apply();
    }
    apply() {
      if (!this.context) return;
      const now = this.context.currentTime, p = this.preferences;
      this.master.gain.setTargetAtTime(p.muted ? 0 : p.master, now, .06);
      this.rainBus.gain.setTargetAtTime(p.rain, now, .08); this.effectsBus.gain.setTargetAtTime(p.effects, now, .08);
      this.rainLevel.gain.setTargetAtTime(this.inside ? .025 : .1, now, .35);
      this.rainFilter.frequency.setTargetAtTime(this.inside ? 1100 : 6000, now, .35);
      if (this.media) { this.media.volume = p.master * p.music; this.media.muted = p.muted; }
    }
    setTrack(value) {
      const next = soundtrack(value);
      if (this.media) { this.media.pause(); this.media.removeAttribute('src'); this.media.load(); }
      this.track = next; this.songWanted = true;
      this.trackMessage = next.src ? '歌曲已配置，点击开启声音播放' : '歌曲暂未上架，尚无公共播放音源';
      this.render();
    }
    async startTrack() {
      if (!this.track?.src || !this.songWanted || this.hidden) return;
      if (!this.media) {
        this.media = this.document.createElement('audio'); this.media.preload = 'none';
        this.media.addEventListener('error', () => { this.trackMessage = '歌曲加载失败，请检查公共音源'; this.render(); });
        this.media.addEventListener('playing', () => { this.trackMessage = '游戏内歌曲正在播放'; this.render(); });
      }
      if (!this.media.getAttribute('src')) this.media.setAttribute('src', this.track.src);
      this.media.loop = this.track.loop; this.apply();
      try { await this.media.play(); this.trackMessage = '游戏内歌曲正在播放'; }
      catch (_) { this.trackMessage = '歌曲未能播放，请点击播放歌曲重试'; }
      this.render();
    }
    async toggleSong() {
      if (!this.track?.src) return;
      if (!this.enabled) { this.songWanted = true; await this.toggle(); return; }
      this.songWanted = !this.songWanted;
      if (this.songWanted) await this.startTrack(); else { this.media?.pause(); this.trackMessage = '歌曲已暂停'; this.render(); }
    }
    async toggle() {
      if (this.busy) return; this.busy = true; this.render();
      try {
        if (this.enabled) { this.enabled = false; this.media?.pause(); if (this.track?.src) this.trackMessage = '游戏声音已暂停'; await this.context.suspend(); }
        else { if (!this.context) this.build(); await this.context.resume(); this.enabled = true; if (this.hidden) await this.context.suspend(); else await this.startTrack(); }
      } catch (_) { this.enabled = false; this.app.notify('游戏声音暂时无法开启，请再次点击重试'); }
      finally { this.busy = false; this.render(); }
    }
    async visibility(hidden) {
      this.hidden = Boolean(hidden);
      if (!this.context || !this.enabled) { this.render(); return; }
      try { if (this.hidden) { this.media?.pause(); await this.context.suspend(); } else { await this.context.resume(); await this.startTrack(); } }
      catch (_) { this.enabled = false; }
      this.render();
    }
    setPreferences(patch) {
      this.preferences = settings({ ...this.preferences, ...patch });
      try { this.storage?.setItem(KEY, JSON.stringify(this.preferences)); } catch (_) { this.app.notify('本次音量已生效，但浏览器未能保存设置'); }
      this.apply(); this.render();
    }
    update(zone, inside) {
      if (this.zone.id === zone.id && this.inside === Boolean(inside)) return;
      this.zone = zone; this.inside = Boolean(inside); this.apply(); this.render();
    }
    play(type) {
      const notes = CUES[type], c = this.context;
      if (!notes || !this.enabled || this.hidden || !c || c.state !== 'running' || this.preferences.muted || !this.preferences.master || !this.preferences.effects) return false;
      const now = c.currentTime;
      notes.forEach((frequency, i) => {
        const oscillator = c.createOscillator(), envelope = c.createGain(), start = now + i * .085;
        oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, start);
        envelope.gain.setValueAtTime(0, start); envelope.gain.linearRampToValueAtTime(.065, start + .012); envelope.gain.exponentialRampToValueAtTime(.0001, start + .19);
        oscillator.connect(envelope); envelope.connect(this.effectsBus); oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
        oscillator.start(start); oscillator.stop(start + .21);
      });
      this.lastCue = NAMES[type]; this.render(); return true;
    }
    mount() {
      const d = this.document, panel = d.createElement('details'); panel.id = 'audio-panel';
      this.summary = d.createElement('summary'); panel.append(this.summary);
      const menu = d.createElement('div'); menu.className = 'audio-menu'; panel.append(menu);
      const title = d.createElement('strong'); title.textContent = '游戏环境与交互声音'; menu.append(title);
      this.toggleButton = d.createElement('button'); this.toggleButton.onclick = () => this.toggle(); menu.append(this.toggleButton);
      this.status = d.createElement('p'); this.status.setAttribute('role', 'status'); menu.append(this.status);
      this.trackTitle = d.createElement('p'); menu.append(this.trackTitle);
      this.trackStatus = d.createElement('p'); this.trackStatus.setAttribute('role', 'status'); menu.append(this.trackStatus);
      this.songButton = d.createElement('button'); this.songButton.onclick = () => this.toggleSong(); menu.append(this.songButton);
      this.sliders = {};
      for (const [key, name] of Object.entries({ master: '游戏总音量', music: '歌曲音量', rain: '雨声', effects: '交互音效' })) {
        const label = d.createElement('label'); label.textContent = name; const output = d.createElement('output'); label.append(output);
        const input = d.createElement('input'); input.type = 'range'; input.min = '0'; input.max = '100'; input.step = '1'; input.value = String(Math.round(this.preferences[key] * 100)); input.setAttribute('aria-label', name);
        input.oninput = () => this.setPreferences({ [key]: Number(input.value) / 100 }); label.append(input); menu.append(label); this.sliders[key] = { input, output };
      }
      const muteLabel = d.createElement('label'); this.mute = d.createElement('input'); this.mute.type = 'checkbox'; this.mute.onchange = () => this.setPreferences({ muted: this.mute.checked }); muteLabel.append(this.mute, d.createTextNode('游戏静音')); menu.append(muteLabel);
      this.feedback = d.createElement('p'); menu.append(this.feedback);
      const note = d.createElement('p'); note.textContent = '点击开启后播放游戏声音；音量设置只作用于此游戏。'; menu.append(note);
      this.panel = panel; d.body.append(panel); this.render();
    }
    render() {
      if (!this.panel) return;
      const state = !this.enabled ? '未开启' : this.hidden ? '后台暂停' : this.preferences.muted ? '已静音' : this.context?.state === 'running' ? '已开启' : '等待恢复';
      this.summary.textContent = '声音 · ' + state; this.toggleButton.textContent = this.enabled ? '暂停游戏声音' : '开启游戏声音'; this.toggleButton.disabled = this.busy;
      this.status.textContent = state + ' · ' + this.zone.name + ' · ' + (this.inside ? '室内雨声减弱' : '室外雨声');
      this.trackTitle.textContent = this.track ? this.track.title + ' · ' + this.track.artists.join(' / ') + ' · ' + this.track.album : '指定游戏歌曲';
      this.trackStatus.textContent = this.trackMessage; this.songButton.disabled = !this.track?.src || this.busy;
      this.songButton.textContent = this.enabled && this.songWanted && this.media && !this.media.paused ? '暂停歌曲' : '播放歌曲';
      for (const [key, control] of Object.entries(this.sliders)) { control.input.value = String(Math.round(this.preferences[key] * 100)); control.output.textContent = control.input.value + '%'; }
      this.mute.checked = this.preferences.muted; this.feedback.textContent = this.lastCue ? '最近声音反馈：' + this.lastCue : '接取、调查、扫描、交付和升级时提供声音反馈。';
      this.panel.dataset.audioState = JSON.stringify({ enabled: this.enabled, state: this.context?.state || 'uninitialized', hidden: this.hidden, inside: this.inside, zone: this.zone.id, ...this.preferences, lastCue: this.lastCue, trackConfigured: Boolean(this.track?.src), trackPlaying: Boolean(this.media && !this.media.paused) });
    }
  }
  return { settings, soundtrack, Engine };
});
