const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('./gameplay.js');

test('guidance follows evidence, delivery and both endings without dead ends', () => {
  for (const ending of ['open', 'seal']) {
    let state = game.createState();
    for (const id of ['market', 'homes', 'tower']) {
      assert.deepEqual(game.objective(state), { id, key: 'terminal', phase: 'accept' });
      state = game.transition(state, { type: 'accept', mission: id });
      for (const key of game.missions[id].evidence) {
        assert.deepEqual(game.objective(state), { id, key, phase: 'investigate' });
        state = game.transition(state, { type: 'evidence', mission: id, key });
      }
      assert.deepEqual(game.objective(state), { id, key: 'terminal', phase: 'deliver' });
      state = game.transition(state, { type: 'resolve', mission: id, choice: id === 'tower' ? ending : id === 'homes' ? 'protect' : 'return' });
      state = game.restore(JSON.stringify(state));
    }
    assert.equal(game.objective(state), null);
    assert.equal(state.tokens, ending === 'open' ? 90 : 160);
  }
});

test('corrupt saves cannot lock the first quest or use inherited branch names', () => {
  const locked = game.createState();
  locked.missions.market.status = 'locked';
  assert.throws(() => game.restore(JSON.stringify(locked)), /initial mission/);
  const forged = firstMission();
  forged.missions.market.choice = 'toString';
  assert.throws(() => game.restore(JSON.stringify(forged)), /choice/);
});

function firstMission(choice = 'return') {
  let state = game.createState();
  state = game.transition(state, { type: 'accept', mission: 'market' });
  state = game.transition(state, { type: 'evidence', mission: 'market', key: 'chip' });
  state = game.transition(state, { type: 'evidence', mission: 'market', key: 'receipt' });
  return game.transition(state, { type: 'resolve', mission: 'market', choice });
}

test('district consequences survive saves and retain earlier choices for all branches', () => {
  for (const market of ['return', 'sell']) for (const homes of ['protect', 'trade']) for (const tower of ['open', 'seal']) {
    let state = firstMission(market);
    state = game.transition(state, { type: 'accept', mission: 'homes' });
    for (const key of ['resident', 'relay']) state = game.transition(state, { type: 'evidence', mission: 'homes', key });
    state = game.transition(state, { type: 'resolve', mission: 'homes', choice: homes });
    const beforeEnding = game.districtStatus(state);
    assert.match(beforeEnding.homes.label, homes === 'protect' ? /匿名/ : /交换/);
    state = game.transition(state, { type: 'accept', mission: 'tower' });
    state = game.transition(state, { type: 'evidence', mission: 'tower', key: 'ledger' });
    state = game.transition(state, { type: 'resolve', mission: 'tower', choice: tower });
    const snapshot = JSON.stringify(state), status = game.districtStatus(state);
    assert.deepEqual(game.districtStatus(game.restore(snapshot)), status);
    assert.equal(JSON.stringify(state), snapshot, 'deriving visuals must not change money or missions');
    assert.match(status.market.label, market === 'return' ? /归还/ : /出售/);
    assert.match(status.homes.note, homes === 'protect' ? /没有随证词公开/ : /交换资料/);
    assert.match(status.homes.label, tower === 'open' ? /接通/ : /许可/);
    assert.match(status.tower.label, tower === 'open' ? /公开/ : /封存/);
    assert.notEqual(status.tower.color, game.districtStatus(game.createState()).tower.color);
    assert.equal(status.tower.color, status.homes.color);
  }
});

test('reward is paid once and next mission unlocks', () => {
  const state = firstMission();
  assert.equal(state.tokens, 60);
  assert.equal(state.missions.homes.status, 'available');
  assert.throws(() => game.transition(state, { type: 'resolve', mission: 'market', choice: 'sell' }), /unavailable/);
  assert.equal(state.tokens, 60);
});

test('evidence, prerequisites and upgrade costs cannot be bypassed', () => {
  const initial = game.createState();
  assert.throws(() => game.transition(initial, { type: 'accept', mission: 'tower' }), /unavailable/);
  assert.throws(() => game.transition(initial, { type: 'purchase', upgrade: 'optic' }), /unavailable/);
  const active = game.transition(initial, { type: 'accept', mission: 'market' });
  assert.throws(() => game.transition(active, { type: 'resolve', mission: 'market', choice: 'return' }), /incomplete/);
  const purchased = game.transition(firstMission(), { type: 'purchase', upgrade: 'optic' });
  assert.equal(purchased.tokens, 30);
  assert.throws(() => game.transition(purchased, { type: 'purchase', upgrade: 'optic' }), /already owned/);
  assert.throws(() => game.transition(purchased, { type: 'purchase', upgrade: 'ai2' }), /Insufficient|unavailable/);
});

test('save restoration preserves branch and rejects corrupt economy', () => {
  const state = firstMission('sell');
  const restored = game.restore(JSON.stringify(state));
  assert.deepEqual(restored, state);
  assert.equal(restored.missions.market.choice, 'sell');
  assert.throws(() => game.restore(JSON.stringify({ ...state, tokens: -1 })), /Invalid/);
  const forged = structuredClone(state);
  forged.missions.market.evidence = [];
  assert.throws(() => game.restore(JSON.stringify(forged)), /Incomplete/);
});

test('portable progress imports only campaign files and round-trips branch feedback', () => {
  const state = firstMission('sell');
  assert.deepEqual(game.importProgress(game.exportProgress(state)), state);
  assert.throws(() => game.importProgress(JSON.stringify({ version: 1, placements: [] })), /format/);
  assert.throws(() => game.importProgress('x'.repeat(32769)), /size/);
  assert.throws(() => game.importProgress('{'), SyntaxError);
  const invalid = JSON.parse(game.exportProgress(state));
  invalid.state.tokens = -1;
  assert.throws(() => game.importProgress(JSON.stringify(invalid)), /Invalid/);
});

test('restart and restore swap campaign backups without changing the city layout', () => {
  const current = firstMission('sell'), fresh = game.createState();
  const values = new Map([['rain-city-layout-v1', 'original-layout'], ['rain-city-campaign-v1', JSON.stringify(current)]]);
  const storage = { setItem: (key, value) => values.set(key, value) };
  assert.deepEqual(game.replaceSaved(storage, current, fresh), fresh);
  assert.deepEqual(game.restore(values.get('rain-city-campaign-previous-v1')), current);
  const previous = game.restore(values.get('rain-city-campaign-previous-v1'));
  assert.deepEqual(game.replaceSaved(storage, fresh, previous), current);
  assert.deepEqual(game.restore(values.get('rain-city-campaign-v1')), current);
  assert.deepEqual(game.restore(values.get('rain-city-campaign-previous-v1')), fresh);
  assert.equal(values.get('rain-city-layout-v1'), 'original-layout');
});

test('backup or replacement write failure keeps the active saved campaign', () => {
  for (const failAt of [1, 2]) {
    const current = firstMission(), original = JSON.stringify(current);
    const values = new Map([['rain-city-campaign-v1', original]]);
    let writes = 0;
    const storage = { setItem(key, value) { if (++writes === failAt) throw Error('quota'); values.set(key, value); } };
    assert.throws(() => game.replaceSaved(storage, current, game.createState()), /quota/);
    assert.equal(values.get('rain-city-campaign-v1'), original);
    assert.equal(JSON.stringify(current), original);
  }
});

test('calibration validates the sequence and pays only once across save restoration', () => {
  const initial = game.createState(), pattern = game.calibrationPattern('market');
  assert.throws(() => game.transition(initial, { type: 'calibrate', district: 'homes', sequence: game.calibrationPattern('homes') }), /unavailable/);
  for (const sequence of [[], pattern.slice(1), [3, 3, 3], [...pattern, 0]]) assert.throws(() => game.transition(initial, { type: 'calibrate', district: 'market', sequence }), /incomplete/);
  assert.equal(initial.tokens, 20); assert.equal(initial.calibrations.market, false);
  const earned = game.transition(initial, { type: 'calibrate', district: 'market', sequence: pattern });
  assert.equal(earned.tokens, 30); assert.equal(earned.calibrations.market, true); assert.equal(earned.missions.market.status, 'available');
  assert.throws(() => game.transition(game.restore(JSON.stringify(earned)), { type: 'calibrate', district: 'market', sequence: pattern }), /unavailable/);
  const copy = game.calibrationPattern('market'); copy[0] = 3; assert.deepEqual(game.calibrationPattern('market'), pattern);
  assert.throws(() => game.calibrationPattern('constructor'), /district/);
  const homes = game.transition(firstMission(), { type: 'calibrate', district: 'homes', sequence: game.calibrationPattern('homes') });
  assert.equal(homes.tokens, 70); assert.equal(homes.calibrations.homes, true);
});

test('legacy campaign and exported files gain default calibration flags without losing choices', () => {
  const legacy = firstMission('sell'); delete legacy.calibrations;
  const restored = game.restore(JSON.stringify(legacy));
  assert.deepEqual(restored.calibrations, { market: false, homes: false, tower: false });
  assert.equal(restored.tokens, 80); assert.equal(restored.missions.market.choice, 'sell');
  assert.deepEqual(game.importProgress(JSON.stringify({ format: 'rain-city-campaign', version: 1, state: legacy })), restored);
  for (const calibrations of [null, {}, { market: false, homes: true, tower: false }]) assert.throws(() => game.restore(JSON.stringify({ ...game.createState(), calibrations })), /calibration/);
});

test('calibration reward is not applied in memory when persistence fails', () => {
  const fs = require('node:fs'), vm = require('node:vm'), messages = [], sounds = [];
  let failWrite = true;
  const Campaign = vm.runInNewContext(fs.readFileSync(require.resolve('./campaign.js'), 'utf8') + '\nCityCampaign;', { CityGameplay: game, localStorage: { setItem() { if (failWrite) throw Error('quota'); } } });
  const campaign = Object.create(Campaign.prototype); campaign.state = game.createState();campaign.render = campaign.tick = () => {};
  campaign.app = { notify: text => messages.push(text), audio: { play: type => sounds.push(type) } };
  const event = { type: 'calibrate', district: 'market', sequence: game.calibrationPattern('market') };
  assert.equal(campaign.send(event), false); assert.equal(campaign.state.tokens, 20); assert.equal(campaign.state.calibrations.market, false); assert.equal(sounds.length, 0); assert.match(messages.at(-1), /未结算/);
  failWrite = false; assert.equal(campaign.send(event), true); assert.equal(campaign.state.tokens, 30); assert.deepEqual(sounds, ['calibrate']);
});

test('scanner range and analysis upgrade independently without collecting evidence', () => {
  let state = game.transition(game.createState(), { type: 'accept', mission: 'market' });
  const points = [{ id: 'market', key: 'receipt', x: 18, z: 0 }, { id: 'market', key: 'chip', x: 9, z: 0 }, { id: 'homes', key: 'resident', x: 3, z: 0 }, { id: 'market', key: 'terminal', x: 0, z: 0 }];
  const snapshot = JSON.stringify(state);
  assert.deepEqual(game.scanCandidates(state, { x: 0, z: 0 }, points).map(p => p.key), ['chip']);
  assert.equal(JSON.stringify(state), snapshot);
  assert.deepEqual(game.scanProfile(state), { range: 12, cooldown: 6, duration: 4, analysis: false });
  let upgraded = game.transition(firstMission(), { type: 'purchase', upgrade: 'optic' });
  upgraded = game.transition(upgraded, { type: 'accept', mission: 'homes' });
  assert.deepEqual(game.scanProfile(upgraded), { range: 24, cooldown: 4, duration: 6, analysis: false });
  const homes = [{ id: 'homes', key: 'resident', x: 24, z: 0 }, { id: 'homes', key: 'relay', x: 24.01, z: 0 }];
  assert.deepEqual(game.scanCandidates(upgraded, { x: 0, z: 0 }, homes).map(p => p.key), ['resident']);
  upgraded = game.transition(upgraded, { type: 'evidence', mission: 'homes', key: 'resident' });
  assert.equal(game.scanCandidates(upgraded, { x: 0, z: 0 }, homes).length, 0);
  assert.throws(() => game.scanCandidates(state, { x: NaN, z: 0 }, points), /position/);
});

test('scene scanner respects actual wall geometry and cooldown without awarding evidence', () => {
  const fs = require('node:fs'), vm = require('node:vm'), T = require('../libs/three.min.js');
  let now = 10000;
  const Campaign = vm.runInNewContext(fs.readFileSync(require.resolve('./campaign.js'), 'utf8') + '\nCityCampaign;', { THREE: T, CityGameplay: game, performance: { now: () => now } });
  const campaign = Object.create(Campaign.prototype), scene = new T.Scene(), infrastructure = new T.Group();
  const wall = new T.Mesh(new T.BoxGeometry(3, 4, .3), new T.MeshBasicMaterial());wall.position.set(0, 2, 4);scene.add(wall, infrastructure);
  const marker = new T.Object3D();marker.position.set(0, 1.2, 9);scene.add(marker);
  const messages = [];
  campaign.app = { mode: 'walk', scene, camera: { position: new T.Vector3(0, 2, 0) }, world: { objects: new Map([['wall', wall]]), infrastructure }, notify: text => messages.push(text) };
  campaign.state = game.transition(game.createState(), { type: 'accept', mission: 'market' });
  campaign.points = [{ id: 'market', key: 'chip', x: 0, z: 9, mesh: marker }];campaign.copy = { market: { clues: { chip: ['芯片', '分析'] } } };campaign.scanReadyAt = 0;campaign.tick = () => {};
  const snapshot = JSON.stringify(campaign.state);
  campaign.scan();assert.match(messages.at(-1), /遮挡/);assert.equal(campaign.scanned.size, 0);
  wall.position.x = 5;campaign.scan();assert.match(messages.at(-1), /冷却/);
  now = 17000;campaign.scan();assert.equal(campaign.scanned.has('market/chip'), true);assert.match(messages.at(-1), /发现 1/);
  assert.equal(JSON.stringify(campaign.state), snapshot);
  campaign.app.mode = 'edit';now = 24000;campaign.scan();assert.equal(campaign.scanReadyAt, 23);
  wall.geometry.dispose();wall.material.dispose();
});

test('a complete low-reward route can buy one cyberware and AI level two', () => {
  let state = game.transition(firstMission('return'), { type: 'purchase', upgrade: 'mobility' });
  state = game.transition(state, { type: 'accept', mission: 'homes' });
  state = game.transition(state, { type: 'evidence', mission: 'homes', key: 'resident' });
  state = game.transition(state, { type: 'evidence', mission: 'homes', key: 'relay' });
  state = game.transition(state, { type: 'resolve', mission: 'homes', choice: 'protect' });
  state = game.transition(state, { type: 'purchase', upgrade: 'ai2' });
  assert.equal(state.tokens, 10);
  assert.equal(state.upgrades.aiLevel, 2);
  assert.equal(game.scanProfile(state).analysis, true);
  assert.equal(game.scanProfile(state).range, 12, 'AI analysis does not grant optic range');
  state = game.transition(state, { type: 'accept', mission: 'tower' });
  state = game.transition(state, { type: 'evidence', mission: 'tower', key: 'ledger' });
  state = game.transition(state, { type: 'resolve', mission: 'tower', choice: 'open' });
  assert.equal(state.tokens, 10);
  assert.equal(state.missions.tower.status, 'resolved');
});
