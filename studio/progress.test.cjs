const { test } = require('node:test');
const assert = require('node:assert/strict');
const progress = require('./progress.js');
const gameplay = require('./gameplay.js');

function storage(entries = []) {
  const values = new Map(entries);
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

function resolvedCampaign() {
  let state = gameplay.createState();
  state = gameplay.transition(state, { type: 'accept', mission: 'market' });
  for (const key of ['chip', 'receipt']) state = gameplay.transition(state, { type: 'evidence', mission: 'market', key });
  return gameplay.transition(state, { type: 'resolve', mission: 'market', choice: 'return' });
}

test('shared progress starts safely and accepts early version-one saves with defaulted fields', () => {
  const state = progress.createState();
  assert.deepEqual(state.renovation, { material: 'neon', environment: 'night', sound: 'rain', applied: false });
  assert.equal(state.race.completed, 0);
  assert.deepEqual(progress.read(storage()), state);
  assert.deepEqual(progress.restore('{"version":1}'), state);
  assert.deepEqual(progress.restore('{"version":1,"renovation":{"material":"industrial"}}').renovation, { material: 'industrial', environment: 'night', sound: 'rain', applied: false });
  assert.notEqual(progress.createState().race.settledRunIds, state.race.settledRunIds);
});

test('renovation permission follows the real first quest and rejects inherited permissions', () => {
  assert.equal(progress.canRenovate(gameplay.createState()), false);
  assert.equal(progress.canRenovate(resolvedCampaign()), true);
  for (const value of [null, {}, { missions: {} }, Object.create({ missions: { market: { status: 'resolved' } } }), { missions: Object.create({ market: { status: 'resolved' } }) }, { missions: { market: Object.create({ status: 'resolved' }) } }]) assert.equal(progress.canRenovate(value), false);
  assert.throws(() => progress.applySelections(progress.createState(), progress.DEFAULT_SELECTIONS, gameplay.createState()), /permission/);
});

test('applying or repeating a preset is free and does not mutate the campaign or existing progress', () => {
  const campaign = resolvedCampaign(), current = progress.createState(), before = JSON.stringify({ campaign, current });
  const choice = { material: 'industrial', environment: 'mist', sound: 'quiet' };
  const applied = progress.applySelections(current, choice, campaign);
  assert.deepEqual(applied.renovation, { ...choice, applied: true });
  assert.equal(JSON.stringify({ campaign, current }), before);
  assert.equal(campaign.tokens, 60);
  assert.deepEqual(progress.applySelections(applied, choice, campaign), applied);
  applied.renovation.material = 'neon';
  assert.equal(current.renovation.applied, false);
});

test('preset identifiers reject incomplete, unknown, inherited and extra selections', () => {
  const current = progress.createState(), campaign = resolvedCampaign();
  for (const choice of [{}, { material: 'neon', environment: 'night' }, { ...progress.DEFAULT_SELECTIONS, material: 'toString' }, { ...progress.DEFAULT_SELECTIONS, environment: 'sunrise' }, { ...progress.DEFAULT_SELECTIONS, sound: 'song' }, Object.create(progress.DEFAULT_SELECTIONS), { ...progress.DEFAULT_SELECTIONS, tokens: 900 }]) assert.throws(() => progress.applySelections(current, choice, campaign), /selections/);
});

test('renovation and race state survive independent page reads without overwriting older saves', () => {
  const campaign = resolvedCampaign(), saved = storage([['rain-city-campaign-v1', JSON.stringify(campaign)], ['rain-city-layout-v1', 'layout'], ['rain-city-audio-v1', 'audio']]);
  let state = progress.applySelections(progress.createState(), { material: 'industrial', environment: 'mist', sound: 'quiet' }, campaign);
  state = progress.finishRace(state, 123.45, 'run-one');
  const written = progress.persist(saved, state);
  assert.deepEqual(progress.read(saved), state);
  assert.notEqual(written, state);
  assert.equal(saved.values.get('rain-city-campaign-v1'), JSON.stringify(campaign));
  assert.equal(saved.values.get('rain-city-layout-v1'), 'layout');
  assert.equal(saved.values.get('rain-city-audio-v1'), 'audio');
  assert.equal(saved.values.size, 4);
});

test('two run identifiers settle once each even when an earlier result is delivered again after reload', () => {
  let state = progress.finishRace(progress.createState(), 140, 'first-run');
  assert.equal(state.race.completed, 1);
  assert.deepEqual(progress.finishRace(state, 130, 'first-run'), state);
  state = progress.finishRace(progress.restore(JSON.stringify(state)), 120, 'second-run');
  assert.equal(state.race.completed, 2);
  assert.equal(state.race.best, 120);
  assert.deepEqual(progress.finishRace(state, 140, 'first-run'), state);
  assert.deepEqual(progress.finishRace(state, 120, 'second-run'), state);
  state = progress.finishRace(state, 150, 'third-run');
  assert.equal(state.race.best, 120);
  assert.equal(state.race.last, 150);
});

test('invalid or implausible results do not mutate the previous save', () => {
  const current = progress.createState(), before = JSON.stringify(current);
  for (const seconds of [NaN, Infinity, -1, 0, 7201, '100']) assert.throws(() => progress.finishRace(current, seconds, 'valid-run'), /result/);
  for (const id of ['', ' ', '\nrun', 'x'.repeat(129), null, 8]) assert.throws(() => progress.finishRace(current, 120, id), /result/);
  assert.equal(JSON.stringify(current), before);
});

test('corrupt save structures fail restore and read falls back safely', () => {
  const examples = [null, [], {}, { version: 2 }, { version: 1, renovation: null }, { version: 1, renovation: { material: 'missing' } }, { version: 1, renovation: { applied: 'yes' } }, { version: 1, race: { completed: -1 } }, { version: 1, race: { completed: 1.5 } }, { version: 1, race: { best: 0 } }, { version: 1, race: { completed: 1 } }, { version: 1, race: { best: 100, last: 110, completed: 0, lastRunId: 'fake' } }];
  for (const value of examples) {
    const text = JSON.stringify(value);
    assert.throws(() => progress.restore(text));
    assert.deepEqual(progress.read(storage([[progress.KEY, text]])), progress.createState());
  }
  assert.throws(() => progress.restore('not json'));
  assert.throws(() => progress.restore('x'.repeat(16385)), /size/);
  assert.deepEqual(progress.read({ getItem() { throw Error('disabled storage'); } }), progress.createState());
});

test('quota failure leaves the caller and saved campaign unchanged', () => {
  const current = progress.createState(), saved = storage([[progress.KEY, JSON.stringify(current)], ['rain-city-campaign-v1', 'existing campaign']]);
  const next = progress.finishRace(current, 100, 'run-one');
  const locked = { setItem() { throw Error('quota'); } };
  assert.throws(() => progress.persist(locked, next), /quota/);
  assert.equal(current.race.completed, 0);
  assert.equal(progress.read(saved).race.completed, 0);
  assert.equal(saved.values.get('rain-city-campaign-v1'), 'existing campaign');
  assert.throws(() => progress.persist(null, next), /unavailable/);
});

test('settlement history is bounded and older four-field race saves migrate safely', () => {
  let state = progress.createState();
  for (let i = 0; i < 70; i++) state = progress.finishRace(state, 150 - i, 'run-' + i);
  assert.equal(state.race.completed, 70);
  assert.equal(state.race.settledRunIds.length, 64);
  assert.equal(progress.restore(JSON.stringify(state)).race.best, 81);
  delete state.race.settledRunIds;
  assert.deepEqual(progress.restore(JSON.stringify(state)).race.settledRunIds, ['run-69']);
});

test('unknown future fields and layout geometry are never copied to the shared persisted payload', () => {
  const current = progress.createState();
  current.layout = { placements: [{ asset: 'unrelated' }] };
  current.futureFeature = true;
  const saved = storage();
  progress.persist(saved, current);
  const raw = JSON.parse(saved.values.get(progress.KEY));
  assert.deepEqual(Object.keys(raw), ['version', 'renovation', 'race']);
  assert.equal(Object.hasOwn(raw, 'layout'), false);
});
