// The fixed rewards (ADR-140; ADR-059: a boss gives the same reward every time): what the hero has
// learned on this browser, kept across page loads and levels. One reward today: ONE BLOW, the charged
// punch, for beating Gu Shan, the One-Blow Hermit (the level `peak`; player.js reads it on a held
// heavy, combat.js PUNCH).
//
//   has(id)        learned? (the page's URL override first, then what this browser keeps)
//   grant(id)      learn it (kept); returns true when it was not learned before
//   revoke(id)     forget it (kept)
//   set(id, on)    either (the Lab's toggle: it also drops the URL's override for that id)
//   list()         every reward as { id, kind, label, level, on, kept }
//   forLevel(id)   the reward a level's victory grants (null: none)
//   line(id)       the victory banner's line ("TECHNIQUE LEARNED: ONE BLOW")
//
// Kept in localStorage `abyss.rewards.v1` as a JSON list of ids. Every storage access is guarded: it
// can throw (private mode, blocked site data) or be absent (the headless tests): the rewards then hold
// for this page load only. `?rewards=all|none` overrides for the page load (read once at load; the
// tests call readRewardUrl / resetRewards as lookSwitch.js readLookUrl is called).

export const REWARD_KEY = 'abyss.rewards.v1';

/** The rewards, as data: `kind` is the word the banner uses, `level` the level whose victory grants it. */
export const REWARDS = Object.freeze({
  oneBlow: Object.freeze({ kind: 'TECHNIQUE', label: 'ONE BLOW', level: 'peak' }),
});

const IDS = Object.keys(REWARDS);
const kept = new Set(); // what this browser keeps (mirrors the storage)
const force = new Map(); // id → bool: the URL's override for this page load
let store = null; // a localStorage-like object, or null
let loaded = false;

function defaultStore() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function load() {
  if (loaded) return;
  loaded = true;
  kept.clear();
  try {
    const raw = store?.getItem?.(REWARD_KEY);
    const v = raw ? JSON.parse(raw) : null;
    if (Array.isArray(v)) for (const id of v) if (typeof id === 'string' && REWARDS[id]) kept.add(id);
  } catch {
    // unreadable or blocked: nothing learned on this page load (a grant still holds for it)
  }
}

function save() {
  try {
    store?.setItem?.(REWARD_KEY, JSON.stringify([...kept]));
  } catch {
    // quota / private mode: the reward holds for this page load
  }
}

/** Read the `rewards` parameter of a URL query (`?rewards=all` every reward on, `none` all off, for
 *  this page load; anything else: no override). Done once at load from `location.search`. Returns
 *  'all', 'none' or null. */
export function readRewardUrl(search) {
  force.clear();
  let v = null;
  try {
    v = new URLSearchParams(search ?? '').get('rewards');
  } catch {
    v = null;
  }
  v = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (v !== 'all' && v !== 'none') return null;
  for (const id of IDS) force.set(id, v === 'all');
  return v;
}

/** Start over (the tests): `storage` a localStorage-like object or null (nothing kept beyond the
 *  module), `search` the URL query to read. */
export function resetRewards({ storage = null, search = '' } = {}) {
  store = storage;
  loaded = false;
  readRewardUrl(search);
  load();
}

export function has(id) {
  if (!REWARDS[id]) return false;
  if (force.has(id)) return force.get(id);
  load();
  return kept.has(id);
}

export function grant(id) {
  if (!REWARDS[id]) return false;
  load();
  const fresh = !kept.has(id);
  kept.add(id);
  if (fresh) save();
  return fresh;
}

export function revoke(id) {
  if (!REWARDS[id]) return false;
  load();
  const was = kept.delete(id);
  if (was) save();
  return was;
}

/** The Lab's toggle: kept on or off, and the URL's override for it dropped (the toggle wins). */
export function set(id, on) {
  if (!REWARDS[id]) return false;
  force.delete(id);
  if (on) grant(id);
  else revoke(id);
  return true;
}

export function list() {
  load();
  return IDS.map((id) => ({ id, ...REWARDS[id], on: has(id), kept: kept.has(id) }));
}

/** The reward the victory over level `levelId` grants (null: none). */
export function forLevel(levelId) {
  for (const id of IDS) if (REWARDS[id].level === levelId) return id;
  return null;
}

/** The victory banner's line for reward `id` ("TECHNIQUE LEARNED: ONE BLOW"). */
export function line(id) {
  const R = REWARDS[id];
  return R ? `${R.kind} LEARNED: ${R.label}` : '';
}

store = defaultStore();
// (the headless tests have no `location`)
readRewardUrl(globalThis.location?.search ?? '');
