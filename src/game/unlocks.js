// What the hero has learned (ADR-146): the fixed rewards of the bosses, the smallest store the
// technique system of ROADMAP M2 can later read. Saved per browser in localStorage (key
// `gcd.unlocks.v1`, a JSON list of ids); a storage argument for tests (as Bindings takes one).
// `?tech=draw` turns One Breath on without the kill, `?tech=none` off (this page load only).
//   has(id) · grant(id) → true when it is new · all() → [ids] · clear()
// Ids: 'oneBreath' (the Sheathed's draw-slash), 'longSecond' (Xin Yi's lean; ADR-158: ?tech=lean).
export const UNLOCK_KEY = 'gcd.unlocks.v1';
const TECH = { draw: 'oneBreath', lean: 'longSecond' };

export class Unlocks {
  /** storage: a localStorage-like object, or null (nothing saved); search: the URL's query (?tech=). */
  constructor(storage = globalThis.localStorage ?? null, search = globalThis.location?.search ?? '') {
    this.storage = storage;
    this.set = new Set();
    try {
      const raw = storage?.getItem?.(UNLOCK_KEY);
      const list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list)) for (const id of list) if (typeof id === 'string') this.set.add(id);
    } catch {
      // blocked or broken storage: nothing learned yet
    }
    this.forced = null; // id → true / false for this page load (?tech=)
    try {
      const t = new URLSearchParams(search).get('tech');
      if (t === 'none') this.forced = false;
      else if (t && TECH[t]) this.forced = TECH[t];
    } catch {
      this.forced = null;
    }
  }

  has(id) {
    if (this.forced === false) return false;
    if (typeof this.forced === 'string' && this.forced === id) return true;
    return this.set.has(id);
  }

  /** Learn `id`; true if it is new. */
  grant(id) {
    if (typeof id !== 'string' || !id || this.set.has(id)) return false;
    this.set.add(id);
    this._save();
    return true;
  }

  /** Set it on or off by hand (the Lab). */
  toggle(id, on) {
    if (on) this.set.add(id);
    else this.set.delete(id);
    if (this.forced !== null) this.forced = null;
    this._save();
    return this.has(id);
  }

  all() {
    return [...this.set];
  }

  clear() {
    this.set.clear();
    this._save();
  }

  _save() {
    try {
      this.storage?.setItem?.(UNLOCK_KEY, JSON.stringify([...this.set]));
    } catch {
      // private mode / quota: kept for this session
    }
  }
}
