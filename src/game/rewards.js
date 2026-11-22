// The fixed rewards (ADR-134; ROADMAP M2's reward system is the full version: slots, a meter, an equip
// screen, a hub, a save). What ships now is the smallest real one: a level may name a `reward`
// ({ id, name, line }: levels/index.js); its boss's death grants it (game/flow.js) and the line is
// shown; what is held is kept in localStorage under `abyss.rewards` (a JSON list of ids), and
// `?reward=<id>[,<id>]` grants for the page's session (the Lab, a preview, a test). A move that a
// reward unlocks asks hasReward(id) where it starts (player.js: Falling Heaven).
//   hasReward(id) → bool   grantReward(id) → true when new   listRewards() → ids   clearRewards()
// Every call is safe without a window or storage (the headless tests): the list then lives in memory.

const KEY = 'abyss.rewards';
let mem = null; // the ids held (a Set), read once
const session = new Set(); // granted by the URL for this page only (never written)

function store() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function load() {
  if (mem) return mem;
  mem = new Set();
  try {
    const raw = store()?.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list)) for (const id of list) if (typeof id === 'string' && id) mem.add(id);
  } catch {
    // a broken entry: start empty
  }
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? '').get('reward');
    if (q) for (const id of q.split(',')) if (id.trim()) session.add(id.trim());
  } catch {
    // no URL
  }
  return mem;
}

function save() {
  try {
    store()?.setItem(KEY, JSON.stringify([...mem]));
  } catch {
    // storage full or blocked: kept for this page
  }
}

/** Is reward `id` held (kept, or granted by the URL for this session)? */
export function hasReward(id) {
  return typeof id === 'string' && (load().has(id) || session.has(id));
}

/** Grant reward `id`: true when it is new. */
export function grantReward(id) {
  if (typeof id !== 'string' || !id) return false;
  const m = load();
  if (m.has(id)) return false;
  m.add(id);
  save();
  return true;
}

/** Every reward held (kept and session). */
export function listRewards() {
  return [...new Set([...load(), ...session])];
}

/** Take every reward away (the Lab, tests). */
export function clearRewards() {
  load().clear();
  session.clear();
  save();
}

/** Take one reward away (the Lab's toggle). */
export function takeReward(id) {
  load().delete(id);
  session.delete(id);
  save();
}
