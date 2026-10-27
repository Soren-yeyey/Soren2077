/* Deterministic campaign state. Scene interaction and UI consume this module. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CityGameplay = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = 1;
  const missions = Object.freeze({
    market: { requires: null, evidence: ['chip', 'receipt'], choices: { return: 40, sell: 60 } },
    homes: { requires: 'market', evidence: ['resident', 'relay'], choices: { protect: 30, trade: 50 } },
    tower: { requires: 'homes', evidence: ['ledger'], choices: { open: 0, seal: 70 } }
  });
  const upgrades = Object.freeze({ optic: 30, mobility: 30, ai2: 50 });

  function createState() {
    return {
      version: VERSION,
      tokens: 20,
      missions: Object.fromEntries(Object.keys(missions).map(id => [id, { status: id === 'market' ? 'available' : 'locked', evidence: [], choice: null }])),
      calibrations: { market: false, homes: false, tower: false },
      upgrades: { optic: false, mobility: false, aiLevel: 1 }
    };
  }

  function clone(state) { return JSON.parse(JSON.stringify(state)); }
  function fail(message) { throw new Error(message); }
  function assertState(state) {
    if (!state || state.version !== VERSION || !Number.isSafeInteger(state.tokens) || state.tokens < 0) fail('Invalid campaign state');
    for (const id of Object.keys(missions)) {
      const entry = state.missions?.[id];
      if (!entry || !['locked', 'available', 'active', 'resolved'].includes(entry.status) || !Array.isArray(entry.evidence)) fail('Invalid mission state');
      if (entry.evidence.some(key => !missions[id].evidence.includes(key)) || new Set(entry.evidence).size !== entry.evidence.length) fail('Invalid evidence');
      if (entry.choice !== null && !Object.hasOwn(missions[id].choices, entry.choice)) fail('Invalid mission choice');
      if (id === 'market' && entry.status === 'locked') fail('Invalid initial mission');
      if (entry.status === 'resolved' && (entry.choice === null || !missions[id].evidence.every(key => entry.evidence.includes(key)))) fail('Incomplete resolved mission');
      if (entry.status !== 'resolved' && entry.choice !== null) fail('Premature mission choice');
      if (['locked', 'available'].includes(entry.status) && entry.evidence.length) fail('Premature evidence');
      const prerequisite = missions[id].requires;
      if (prerequisite && (entry.status === 'locked') === (state.missions[prerequisite]?.status === 'resolved')) fail('Invalid mission prerequisite');
      if (state.calibrations !== undefined && (typeof state.calibrations?.[id] !== 'boolean' || (state.calibrations[id] && entry.status === 'locked'))) fail('Invalid calibration state');
    }
    if (!state.upgrades || typeof state.upgrades.optic !== 'boolean' || typeof state.upgrades.mobility !== 'boolean' || ![1, 2].includes(state.upgrades.aiLevel)) fail('Invalid upgrades');
    if ((state.upgrades.optic || state.upgrades.mobility) && state.missions.market.status !== 'resolved') fail('Invalid upgrade prerequisite');
    if (state.upgrades.aiLevel === 2 && state.missions.homes.status !== 'resolved') fail('Invalid AI prerequisite');
    return state;
  }

  function transition(current, event) {
    assertState(current);
    if (!event || typeof event !== 'object') fail('Invalid event');
    const state = clone(current);
    if (event.type === 'accept') {
      const mission = state.missions[event.mission];
      if (!mission || mission.status !== 'available') fail('Mission unavailable');
      mission.status = 'active';
    } else if (event.type === 'evidence') {
      const mission = state.missions[event.mission];
      if (!mission || mission.status !== 'active' || !missions[event.mission].evidence.includes(event.key)) fail('Evidence unavailable');
      if (!mission.evidence.includes(event.key)) mission.evidence.push(event.key);
    } else if (event.type === 'resolve') {
      const mission = state.missions[event.mission];
      const config = missions[event.mission];
      if (!mission || mission.status !== 'active' || !config || !Object.hasOwn(config.choices, event.choice)) fail('Mission resolution unavailable');
      if (!config.evidence.every(key => mission.evidence.includes(key))) fail('Evidence incomplete');
      mission.status = 'resolved';
      mission.choice = event.choice;
      state.tokens += config.choices[event.choice];
      for (const [id, next] of Object.entries(missions)) {
        if (next.requires === event.mission && state.missions[id].status === 'locked') state.missions[id].status = 'available';
      }
    } else if (event.type === 'calibrate') {
      const pattern = calibrationPattern(event.district);
      if (state.missions[event.district].status === 'locked' || state.calibrations?.[event.district]) fail('Calibration unavailable');
      if (!Array.isArray(event.sequence) || event.sequence.length !== pattern.length || event.sequence.some((node, index) => node !== pattern[index])) fail('Calibration incomplete');
      state.calibrations = { market: false, homes: false, tower: false, ...state.calibrations, [event.district]: true };
      state.tokens += 10;
    } else if (event.type === 'purchase') {
      const price = upgrades[event.upgrade];
      if (price === undefined || state.missions.market.status !== 'resolved') fail('Upgrade unavailable');
      if (state.tokens < price) fail('Insufficient tokens');
      if (event.upgrade === 'ai2') {
        if (state.upgrades.aiLevel !== 1 || state.missions.homes.status !== 'resolved') fail('AI upgrade unavailable');
        state.upgrades.aiLevel = 2;
      } else {
        if (state.upgrades[event.upgrade]) fail('Upgrade already owned');
        state.upgrades[event.upgrade] = true;
      }
      state.tokens -= price;
    } else fail('Unknown event');
    return assertState(state);
  }

  function restore(serialized) {
    const data = JSON.parse(serialized);
    const state = clone(assertState(data));
    if (state.calibrations === undefined) state.calibrations = { market: false, homes: false, tower: false };
    return state;
  }

  function calibrationPattern(district) {
    const patterns = { market: [0, 2, 1], homes: [2, 0, 3, 1], tower: [1, 3, 0, 2, 1] };
    if (!Object.hasOwn(patterns, district)) fail('Invalid calibration district');
    return [...patterns[district]];
  }

  function objective(state) {
    assertState(state);
    const id = Object.keys(missions).find(id => state.missions[id].status !== 'resolved');
    if (!id) return null;
    const entry = state.missions[id];
    const key = entry.status === 'active' ? missions[id].evidence.find(key => !entry.evidence.includes(key)) : null;
    return { id, key: key || 'terminal', phase: entry.status === 'available' ? 'accept' : key ? 'investigate' : 'deliver' };
  }

  // Derived from saved choices so revisiting or reloading has the same result.
  function districtStatus(state) {
    assertState(state);
    const market = state.missions.market.choice, homes = state.missions.homes.choice, ending = state.missions.tower.choice;
    return {
      market: { label: market === 'return' ? '资料已归还' : market === 'sell' ? '副本已出售' : '委托待处理',
        color: market === 'return' ? 0x78eee5 : 0xffc56c,
        note: market === 'return' ? '委托人收回了身份记录，商业街升级终端已开放。' : market === 'sell' ? '资料副本流入交易网络，你获得了较高报酬。' : '身份记录仍在等待调查。' },
      homes: { label: ending === 'open' ? '公共接口已接通' : ending === 'seal' ? '塔方许可维持' : homes === 'protect' ? '证词已匿名封存' : homes === 'trade' ? '证词已提交交换' : '中继等待核查',
        color: ending === 'open' ? 0x78eee5 : ending === 'seal' ? 0xff795e : homes === 'protect' ? 0x78eee5 : 0xffc56c,
        note: (homes === 'protect' ? '证人身份没有随证词公开。' : homes === 'trade' ? '证词与身份记录一起作为交换资料提交。' : '居民仍在等待迟到的消息。') + (ending === 'open' ? '街区终端现已接通公共身份接口。' : ending === 'seal' ? '街区身份许可继续由塔方管理。' : '') },
      tower: { label: ending === 'open' ? '接口公开' : ending === 'seal' ? '账本封存' : '账本尚未裁定',
        color: ending === 'open' ? 0x78eee5 : ending === 'seal' ? 0xff795e : 0xffc56c,
        note: ending === 'open' ? '公共接口已经开放，居民区同步显示接通状态。' : ending === 'seal' ? '账本继续由塔方保管，封存报酬已结算。' : '取得账本后，可在这里决定接口归属。' }
    };
  }

  function exportProgress(state) {
    return JSON.stringify({ format: 'rain-city-campaign', version: VERSION, state: assertState(state) }, null, 2);
  }

  function importProgress(text) {
    if (typeof text !== 'string' || text.length > 32768) fail('Invalid save size');
    const data = JSON.parse(text);
    if (data?.format !== 'rain-city-campaign' || data.version !== VERSION) fail('Unsupported save format');
    return restore(JSON.stringify(data.state));
  }

  function replaceSaved(storage, current, next) {
    const previous = JSON.stringify(assertState(current));
    const replacement = JSON.stringify(assertState(next));
    // Each localStorage write is atomic. Do not replace the live state until both succeed.
    storage.setItem('rain-city-campaign-previous-v1', previous);
    storage.setItem('rain-city-campaign-v1', replacement);
    return clone(next);
  }

  function scanProfile(state) {
    assertState(state);
    return { range: state.upgrades.optic ? 24 : 12, cooldown: state.upgrades.optic ? 4 : 6,
      duration: state.upgrades.optic ? 6 : 4, analysis: state.upgrades.aiLevel === 2 };
  }

  function scanCandidates(state, position, points) {
    const profile = scanProfile(state);
    if (!Number.isFinite(position?.x) || !Number.isFinite(position?.z)) fail('Invalid scan position');
    return points.filter(p => {
      const mission = state.missions[p.id], config = missions[p.id];
      return Number.isFinite(p.x) && Number.isFinite(p.z) && config?.evidence.includes(p.key) &&
        mission?.status === 'active' && !mission.evidence.includes(p.key) && Math.hypot(position.x - p.x, position.z - p.z) <= profile.range;
    }).map(p => ({ id: p.id, key: p.key, distance: Math.hypot(position.x - p.x, position.z - p.z) })).sort((a, b) => a.distance - b.distance);
  }

  return { VERSION, missions, upgrades, createState, assertState, transition, restore, objective, districtStatus, exportProgress, importProgress, replaceSaved, scanProfile, scanCandidates, calibrationPattern };
});
