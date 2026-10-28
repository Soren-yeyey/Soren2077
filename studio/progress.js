/* Small shared experience save. Existing campaign, layout and audio saves stay independent. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CityProgress = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const KEY = 'rain-city-experience-v1';
  const DEFAULT_SELECTIONS = Object.freeze({ material: 'neon', environment: 'night', sound: 'rain' });
  const OPTIONS = Object.freeze({ material: ['neon', 'industrial'], environment: ['night', 'mist'], sound: ['rain', 'quiet'] });
  const MAX_SECONDS = 7200, MAX_RUN_IDS = 64, MAX_SAVE_CHARS = 16384;
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const plain = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
  const fail = message => { throw new Error(message); };
  const validSeconds = value => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_SECONDS;
  const validRunId = value => typeof value === 'string' && value.length > 0 && value.length <= 128 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);

  function createState() {
    return {
      version: 1,
      renovation: { ...DEFAULT_SELECTIONS, applied: false },
      race: { best: null, last: null, completed: 0, lastRunId: null, settledRunIds: [] }
    };
  }

  function selections(value) {
    if (!plain(value) || Object.keys(value).length !== 3 || Object.keys(OPTIONS).some(key => !own(value, key) || !OPTIONS[key].includes(value[key]))) fail('Invalid renovation selections');
    return { material: value.material, environment: value.environment, sound: value.sound };
  }

  function normalize(value) {
    if (!plain(value) || !own(value, 'version') || value.version !== 1) fail('Unsupported experience save');
    const state = createState();
    if (own(value, 'renovation')) {
      const r = value.renovation;
      if (!plain(r)) fail('Invalid renovation state');
      for (const key of Object.keys(OPTIONS)) {
        if (own(r, key)) {
          if (!OPTIONS[key].includes(r[key])) fail('Invalid renovation preset');
          state.renovation[key] = r[key];
        }
      }
      if (own(r, 'applied')) {
        if (typeof r.applied !== 'boolean') fail('Invalid renovation flag');
        state.renovation.applied = r.applied;
      }
    }
    if (own(value, 'race')) {
      const r = value.race;
      if (!plain(r)) fail('Invalid race state');
      for (const key of ['best', 'last']) if (own(r, key)) {
        if (r[key] !== null && !validSeconds(r[key])) fail('Invalid race time');
        state.race[key] = r[key];
      }
      if (own(r, 'completed')) {
        if (!Number.isSafeInteger(r.completed) || r.completed < 0 || r.completed > 1000000) fail('Invalid race count');
        state.race.completed = r.completed;
      }
      if (own(r, 'lastRunId')) {
        if (r.lastRunId !== null && !validRunId(r.lastRunId)) fail('Invalid race id');
        state.race.lastRunId = r.lastRunId;
      }
      if (own(r, 'settledRunIds')) {
        if (!Array.isArray(r.settledRunIds) || r.settledRunIds.length > MAX_RUN_IDS || r.settledRunIds.some(id => !validRunId(id)) || new Set(r.settledRunIds).size !== r.settledRunIds.length) fail('Invalid race settlements');
        state.race.settledRunIds = [...r.settledRunIds];
      } else if (state.race.lastRunId !== null) state.race.settledRunIds = [state.race.lastRunId];
      const race = state.race;
      if (race.completed === 0) {
        if (race.best !== null || race.last !== null || race.lastRunId !== null || race.settledRunIds.length) fail('Premature race result');
      } else if (!validSeconds(race.best) || !validSeconds(race.last) || race.best > race.last || !validRunId(race.lastRunId) || !race.settledRunIds.includes(race.lastRunId) || race.settledRunIds.length > race.completed) fail('Incomplete race result');
    }
    return state;
  }

  function restore(text) {
    if (typeof text !== 'string' || text.length > MAX_SAVE_CHARS) fail('Invalid experience save size');
    return normalize(JSON.parse(text));
  }

  function read(storage) {
    try {
      const text = storage?.getItem(KEY);
      return text === null || text === undefined ? createState() : restore(text);
    } catch (_) { return createState(); }
  }

  function canRenovate(campaign) {
    if (!plain(campaign) || !own(campaign, 'missions') || !plain(campaign.missions) || !own(campaign.missions, 'market')) return false;
    const market = campaign.missions.market;
    return plain(market) && own(market, 'status') && market.status === 'resolved';
  }

  function applySelections(current, choice, campaign) {
    const state = normalize(current);
    if (!canRenovate(campaign)) fail('Renovation permission required');
    state.renovation = { ...selections(choice), applied: true };
    return state;
  }

  function finishRace(current, seconds, runId) {
    const state = normalize(current);
    if (!validSeconds(seconds) || !validRunId(runId)) fail('Invalid race result');
    if (state.race.settledRunIds.includes(runId)) return state;
    if (state.race.completed >= 1000000) fail('Race count limit reached');
    const previous = state.race;
    state.race = {
      best: previous.best === null ? seconds : Math.min(previous.best, seconds),
      last: seconds,
      completed: previous.completed + 1,
      lastRunId: runId,
      settledRunIds: [...previous.settledRunIds, runId].slice(-MAX_RUN_IDS)
    };
    return state;
  }

  function persist(storage, next) {
    const replacement = normalize(next);
    if (!storage || typeof storage.setItem !== 'function') fail('Experience storage unavailable');
    storage.setItem(KEY, JSON.stringify(replacement));
    return normalize(replacement);
  }

  return { KEY, DEFAULT_SELECTIONS, createState, restore, read, canRenovate, applySelections, finishRace, persist };
});
