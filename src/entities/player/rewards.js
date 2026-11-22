// What the hero has won (ADR-137; roadmap M2's technique slots are not built yet). A small store of reward
// ids: a boss's level may carry `reward: '<id>'` and GameFlow grants it when the boss dies; what a reward
// does lives with it (the fire lance: player/fireLance.js). Kept in localStorage `abyss.rewards.v1` (a
// list of ids); `?reward=<id>[,<id>]` forces ids for the session (the Lab, a test run, the owner's phone);
// a store without storage (the headless tests, a private window) keeps them for the page load only.
//   REWARDS.has(id) · REWARDS.grant(id) → true when it is new · REWARDS.revoke(id) (the Lab) · REWARDS.list()

export const REWARDS_KEY = 'abyss.rewards.v1';
/** What each reward is called where the player sees it (the victory screen). */
export const REWARD_NAMES = Object.freeze({ fireLance: 'FIRE LANCE · press TECHNIQUE' });

function defaultStorage() {
  try {
    const s = globalThis.localStorage;
    return s && typeof s.getItem === 'function' ? s : null;
  } catch {
    return null;
  }
}

export class RewardStore {
  /** `storage`: a localStorage-like object or null; `search`: a URL query (`?reward=` forces ids). */
  constructor(storage = defaultStorage(), search = globalThis.location?.search ?? '') {
    this.storage = storage;
    this.ids = new Set();
    this.forced = new Set();
    try {
      const raw = storage?.getItem?.(REWARDS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list)) for (const id of list) if (typeof id === 'string' && id) this.ids.add(id);
    } catch {
      // (a broken entry: start empty)
    }
    try {
      const q = new URLSearchParams(search ?? '').get('reward');
      if (q) for (const id of q.split(',')) if (id.trim()) this.forced.add(id.trim());
    } catch {
      // no URL
    }
  }

  has(id) {
    return this.ids.has(id) || this.forced.has(id);
  }

  /** Grant `id` (kept). True when the hero did not have it before. */
  grant(id) {
    if (typeof id !== 'string' || !id) return false;
    const fresh = !this.has(id);
    this.ids.add(id);
    this._save();
    return fresh;
  }

  /** Take `id` away (the Lab's toggle; a forced one stays forced). */
  revoke(id) {
    this.ids.delete(id);
    this._save();
  }

  list() {
    return [...new Set([...this.ids, ...this.forced])];
  }

  _save() {
    try {
      this.storage?.setItem?.(REWARDS_KEY, JSON.stringify([...this.ids]));
    } catch {
      // (storage full or blocked: kept for this page load)
    }
  }
}

/** The page's store (main.js puts it on game.rewards). */
export const REWARDS = new RewardStore();
