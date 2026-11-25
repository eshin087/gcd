// THE BOSS RUSH (ADR-179): every level in LEVELS order, back to back, each still its own page load.
// The run lives in sessionStorage (key `gcd.rush.v1`, this tab only), read at boot; a rush page
// (`?rush` in the URL, rushUrl) skips the title and starts its fight. Health and flasks are full at
// every fight (each is a fresh page, and a retry respawns him full). A death is the normal retry of the
// same boss: the rush clock keeps its time and counts the death.
//
// The clock is the boss state's real time (the flow's `boss` state, as a boss's fight time), every
// attempt counted; loads, walks, intros, death screens and the record screen never count. It is banked
// to sessionStorage about once a second and on `pagehide`, and `live` says a fight was running when it
// was banked: a reload or a closed (and reopened) tab mid-fight resumes that boss with the time kept and
// counts as a death. Quitting from the pause menu ends the rush with no record; so does opening any
// page of the game outside the rush (a URL without `?rush`).
//
//   const rush = new Rush(sessionStorage, location.search)   rush.active, rush.level, rush.index / .count
//   Rush.start(session, order) → the state (then location.assign(rushUrl(...)))
//   rush.arrive()            at boot on a rush page: a fight that was live is a death
//   rush.tick(dt, fighting)  every flow frame (dt real s; fighting: the boss state)
//   rush.death()  rush.void(reason)  rush.win(split) → true when it was the last
//   rush.totalMs  rush.levelMs  rush.deaths  rush.splits  rush.abandon()  rush.bank()

export const RUSH_KEY = 'gcd.rush.v1';
const VERSION = 1;
const BANK_EVERY = 1; // s of real time between banks while the clock runs

const fin = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function load(session) {
  try {
    const o = JSON.parse(session?.getItem?.(RUSH_KEY) ?? 'null');
    if (!o || typeof o !== 'object' || o.v !== VERSION || !Array.isArray(o.order) || !o.order.length) return null;
    return {
      v: VERSION,
      id: typeof o.id === 'string' ? o.id : '',
      order: o.order.map(String),
      index: Math.max(0, Math.floor(fin(o.index))),
      levelMs: Math.max(0, fin(o.levelMs)),
      deaths: Math.max(0, Math.floor(fin(o.deaths))),
      flasks: Math.max(0, Math.floor(fin(o.flasks))),
      live: !!o.live,
      splits: Array.isArray(o.splits) ? o.splits.filter((s) => s && typeof s === 'object') : [],
      void: typeof o.void === 'string' && o.void ? o.void : null,
      startedAt: typeof o.startedAt === 'string' ? o.startedAt : '',
      done: !!o.done,
    };
  } catch {
    return null;
  }
}

/** True when the query string is a rush page's (`?rush`). */
export function isRushPage(search) {
  try {
    return new URLSearchParams(search ?? '').has('rush');
  } catch {
    return false;
  }
}

/** `href` as the rush page of level `id` (`?level=<id>&rush=1`; the other parameters are kept). */
export function rushUrl(id, href) {
  const u = new URL(href);
  u.searchParams.set('level', id);
  u.searchParams.set('rush', '1');
  return u.toString();
}

export class Rush {
  /** session: a sessionStorage-like object (null: none kept); search: the page's query. */
  constructor(session = globalThis.sessionStorage ?? null, search = globalThis.location?.search ?? '') {
    this.session = session;
    this.state = load(session);
    this.page = isRushPage(search);
    this._bankT = 0;
    // a page outside the rush ends it; so does a finished one (its record was shown)
    if (this.state && (!this.page || this.state.done || this.state.index >= this.state.order.length)) this.abandon();
  }

  /** Begin a rush over `order` (level ids): returns the state written (the caller loads its first page). */
  static start(session, order, id = '') {
    const st = { v: VERSION, id, order: [...order].map(String), index: 0, levelMs: 0, deaths: 0, flasks: 0, live: false, splits: [], void: null, startedAt: new Date().toISOString(), done: false };
    try {
      session?.setItem?.(RUSH_KEY, JSON.stringify(st));
    } catch {
      // no session storage: the rush cannot carry over its pages
      return null;
    }
    return st;
  }

  get active() {
    return !!this.state && this.page;
  }

  get level() {
    return this.state?.order[this.state.index] ?? null;
  }

  get index() {
    return this.state?.index ?? 0;
  }

  get count() {
    return this.state?.order.length ?? 0;
  }

  get id() {
    return this.state?.id ?? '';
  }

  get levelMs() {
    return this.state?.levelMs ?? 0;
  }

  get deaths() {
    return this.state?.deaths ?? 0;
  }

  get flasks() {
    return this.state?.flasks ?? 0;
  }

  get splits() {
    return this.state?.splits.slice() ?? [];
  }

  get voided() {
    return this.state?.void ?? null;
  }

  /** The rush's time so far: the won fights' splits and this fight's time, ms. */
  get totalMs() {
    const S = this.state;
    if (!S) return 0;
    let t = S.levelMs;
    for (const s of S.splits) t += fin(s.timeMs);
    return t;
  }

  /** At boot on a rush page: a fight that was running when the page went (a reload, a closed tab) is a death. */
  arrive() {
    const S = this.state;
    if (!S || !this.page) return false;
    const reloaded = S.live;
    if (reloaded) {
      S.deaths++;
      S.live = false;
      this._save();
    }
    return reloaded;
  }

  /** The flow's frame: `dt` real s; `fighting` = the boss state (the clock runs). */
  tick(dt, fighting) {
    const S = this.state;
    if (!S || !this.page) return;
    if (fighting) {
      S.levelMs += Math.max(0, fin(dt)) * 1000;
      if (!S.live) {
        S.live = true;
        this._save();
        this._bankT = 0;
        return;
      }
      this._bankT += Math.max(0, fin(dt));
      if (this._bankT >= BANK_EVERY) {
        this._bankT = 0;
        this._save();
      }
    } else if (S.live) {
      S.live = false;
      this._save();
    }
  }

  /** Write the run now (pagehide, a death, a win). */
  bank() {
    if (this.state && this.page) this._save();
  }

  death() {
    const S = this.state;
    if (!S || !this.page) return;
    S.deaths++;
    S.live = false;
    this._save();
  }

  flask() {
    const S = this.state;
    if (!S || !this.page) return;
    S.flasks++;
  }

  /** The run stops counting as played as the game ships (game/eligibility.js): it stays void. */
  void(reason) {
    const S = this.state;
    if (!S || S.void) return;
    S.void = String(reason || 'void');
    this._save();
  }

  /** The fight is won: its split ({ level, timeMs, deaths, damageTaken, maxHp, flasksUsed, grade, ... }) is
   *  banked and the rush moves on. True when it was the last fight (the rush is done). */
  win(split) {
    const S = this.state;
    if (!S || !this.page) return false;
    S.splits.push({ ...split, level: this.level, timeMs: Math.round(S.levelMs), deaths: S.deaths });
    S.index++;
    S.levelMs = 0;
    S.deaths = 0;
    S.flasks = 0;
    S.live = false;
    S.done = S.index >= S.order.length;
    this._save();
    return S.done;
  }

  abandon() {
    this.state = null;
    try {
      this.session?.removeItem?.(RUSH_KEY);
    } catch {
      // nothing to forget
    }
  }

  _save() {
    try {
      if (this.state) this.session?.setItem?.(RUSH_KEY, JSON.stringify(this.state));
    } catch {
      // full or blocked: the run carries on in this page
    }
  }
}
