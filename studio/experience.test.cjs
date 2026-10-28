const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('./gameplay.js');
const progress = require('./progress.js');

const CAMPAIGN_KEY = 'rain-city-campaign-v1';
function memoryStorage() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function completeMarket(storage, choice = 'return') {
  let campaign = game.createState();
  for (const event of [
    { type: 'accept', mission: 'market' },
    { type: 'evidence', mission: 'market', key: 'chip' },
    { type: 'evidence', mission: 'market', key: 'receipt' },
    { type: 'resolve', mission: 'market', choice }
  ]) {
    campaign = game.transition(campaign, event);
    storage.setItem(CAMPAIGN_KEY, JSON.stringify(campaign));
    campaign = game.restore(storage.getItem(CAMPAIGN_KEY));
  }
  return campaign;
}

test('the minimum quest, renovation and race loop survives page reloads without duplicate rewards', () => {
  for (const choice of ['return', 'sell']) {
    const storage = memoryStorage();
    let campaign = game.createState(), experience = progress.read(storage);
    assert.equal(game.objective(campaign).phase, 'accept');
    assert.equal(progress.canRenovate(campaign), false);
    assert.throws(() => progress.applySelections(experience, progress.DEFAULT_SELECTIONS, campaign), /permission/);

    campaign = completeMarket(storage, choice);
    const rewardBalance = choice === 'return' ? 60 : 80;
    assert.equal(campaign.tokens, rewardBalance);
    assert.equal(progress.canRenovate(campaign), true);
    assert.equal(game.objective(campaign).id, 'homes');
    const selections = { material: 'industrial', environment: 'mist', sound: 'quiet' };
    experience = progress.persist(storage, progress.applySelections(experience, selections, campaign));

    // The racing page reads only the shared experience key. It cannot award campaign currency.
    experience = progress.read(storage);
    experience = progress.persist(storage, progress.finishRace(experience, 113.48, 'demonstration-one'));
    assert.equal(experience.race.completed, 1);
    assert.equal(experience.race.best, 113.48);

    // A fresh city page restores both saves and repeated result delivery cannot pay or settle again.
    campaign = game.restore(storage.getItem(CAMPAIGN_KEY));
    experience = progress.read(storage);
    assert.deepEqual(experience.renovation, { ...selections, applied: true });
    assert.equal(campaign.tokens, rewardBalance);
    assert.throws(() => game.transition(campaign, { type: 'resolve', mission: 'market', choice }), /unavailable/);
    experience = progress.persist(storage, progress.finishRace(experience, 113.48, 'demonstration-one'));
    experience = progress.persist(storage, progress.applySelections(experience, selections, campaign));
    assert.equal(experience.race.completed, 1);
    assert.equal(game.restore(storage.getItem(CAMPAIGN_KEY)).tokens, rewardBalance);
  }
});

test('resetting and restoring campaign progress preserves city results but recomputes renovation permission', () => {
  const storage = memoryStorage();
  const completedCampaign = completeMarket(storage);
  let experience = progress.applySelections(progress.createState(), { material: 'industrial', environment: 'mist', sound: 'quiet' }, completedCampaign);
  experience = progress.persist(storage, progress.finishRace(experience, 115, 'before-quest-reset'));
  const savedExperience = storage.getItem(progress.KEY);

  let campaign = game.replaceSaved(storage, completedCampaign, game.createState());
  assert.equal(progress.canRenovate(campaign), false);
  assert.throws(() => progress.applySelections(experience, progress.DEFAULT_SELECTIONS, campaign), /permission/);
  assert.equal(storage.getItem(progress.KEY), savedExperience);
  assert.equal(progress.read(storage).race.completed, 1);
  assert.equal(progress.read(storage).renovation.material, 'industrial');

  const backup = game.restore(storage.getItem('rain-city-campaign-previous-v1'));
  campaign = game.replaceSaved(storage, campaign, backup);
  assert.equal(progress.canRenovate(campaign), true);
  assert.equal(campaign.tokens, 60);
  assert.equal(storage.getItem(progress.KEY), savedExperience);
});

test('a broken experience save or failed race save cannot erase the completed quest or pay extra currency', () => {
  const storage = memoryStorage();
  const campaign = completeMarket(storage);
  const savedCampaign = storage.getItem(CAMPAIGN_KEY);
  storage.setItem(progress.KEY, '{broken');
  let experience = progress.read(storage);
  assert.deepEqual(experience, progress.createState());
  assert.equal(progress.canRenovate(game.restore(savedCampaign)), true);
  experience = progress.persist(storage, progress.applySelections(experience, progress.DEFAULT_SELECTIONS, campaign));
  const savedExperience = storage.getItem(progress.KEY);
  const blockedStorage = { setItem() { throw Error('quota'); } };
  assert.throws(() => progress.persist(blockedStorage, progress.finishRace(experience, 120, 'unsaved-run')), /quota/);
  assert.equal(experience.race.completed, 0);
  assert.equal(storage.getItem(progress.KEY), savedExperience);
  assert.equal(storage.getItem(CAMPAIGN_KEY), savedCampaign);
  assert.equal(game.restore(savedCampaign).tokens, 60);
});
