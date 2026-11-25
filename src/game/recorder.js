import { GAME_VERSION } from '../ui/changelog.js';
import { Eligibility } from './eligibility.js';
import { Records, buildRecord } from './records.js';
import { Rush, rushUrl } from './rush.js';
import { rankRun } from './rank.js';

// The flow's record keeper (ADR-179): between GameFlow and the three stores. It watches the run's
// eligibility, keeps the rush clock, turns a won fight into a run record (and, after a rush's last
// fight, the rush's record), stores the eligible ones and emits `game:record` for each stored record:
// the seam a future uploader subscribes to (ARCHITECTURE.md → "Records").
//
//   game.records (Records), game.eligibility (Eligibility), game.rush (Rush): main.js builds them; a
//   game without them (the tests) gets its own: no storage in node, so nothing persists.
//   recorder.frame(rdt, state)   recorder.death()   recorder.flask()   recorder.win(stats) → the view
//   recorder.next()  (a rush: the next boss's page, or the title after the last)   recorder.quit()
//   recorder.rushClock() → { index, count, ms } | null   (the HUD's rush line)

const fin = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export class Recorder {
  constructor(game) {
    this.game = game;
    const ls = (() => {
      try {
        return globalThis.localStorage ?? null;
      } catch {
        return null;
      }
    })();
    const ss = (() => {
      try {
        return globalThis.sessionStorage ?? null;
      } catch {
        return null;
      }
    })();
    this.records = game.records ?? (game.records = new Records(ls));
    this.elig = game.eligibility ?? (game.eligibility = new Eligibility(globalThis.location?.search ?? ''));
    this.rush = game.rush ?? (game.rush = new Rush(ss, globalThis.location?.search ?? ''));
    // a rush hears every void at once (the record of its last fight decides nothing alone)
    this.elig.onVoid = (r) => this.rush.void(r);
    if (this.rush.active && !this.elig.eligible) this.rush.void(this.elig.reason);
    this.view = null; // the last win's view (the record screen)
    this.reloadDeath = this.rush.active ? this.rush.arrive() : false;
  }

  get inRush() {
    return this.rush.active;
  }

  /** Per flow frame: notice cheats, run the rush clock (real time in the boss state). */
  frame(rdt, state) {
    this.elig.watch(this.game);
    if (this.rush.active) this.rush.tick(rdt, state === 'boss');
  }

  death() {
    if (this.rush.active) this.rush.death();
  }

  flask() {
    if (this.rush.active) this.rush.flask();
  }

  /** The page is going (pagehide): bank the rush clock now. */
  bank() {
    this.rush.bank();
  }

  device() {
    const g = this.game;
    return g.gamepad?.active ? 'pad' : g.touch?.active ? 'touch' : 'keyboard';
  }

  /** A fight is won: the run record (and after a rush's last fight, the rush's), stored when eligible.
   *  Returns the record screen's view. */
  win(stats) {
    const g = this.game, p = g.player, L = g.level;
    const level = typeof L?.id === 'string' ? L.id : 'cinderwood';
    const rush = this.rush.active ? this.rush : null;
    const deaths = rush ? rush.deaths : fin(stats.deaths);
    const flasks = rush ? rush.flasks : fin(stats.flasksUsed);
    const maxHp = Math.max(1, fin(p?.maxHp, 160));
    const common = {
      gameVersion: GAME_VERSION,
      device: this.device(),
      techniques: (() => {
        try {
          return g.unlocks?.all?.() ?? [];
        } catch {
          return [];
        }
      })(),
      style: typeof p?.moveStyle === 'string' ? p.moveStyle : null,
    };
    const rec = buildRecord({
      ...common,
      kind: 'boss',
      level,
      timeMs: fin(stats.attemptTime) * 1000,
      deaths,
      damageTaken: fin(stats.attemptDamage),
      maxHp,
      flasksUsed: flasks,
      stats: stats.snapshot(),
      rush: rush ? rush.id || null : null,
    });
    const eligible = this.elig.eligible && !(rush && rush.voided) && L?.stage !== 'lab';
    const view = { record: rec, eligible, note: eligible ? null : this.elig.note(rush?.voided ?? 'lab'), best: null, rush: null };
    if (eligible) view.best = this._store(rec);
    else view.prev = this.records.best(level);
    if (rush) {
      const split = { level, timeMs: 0, fightMs: rec.timeMs, damageTaken: rec.damageTaken, maxHp, flasksUsed: flasks, grade: rec.grade, eligible };
      const last = rush.win(split);
      const splits = rush.splits;
      const R = { index: rush.index, count: rush.count, last, totalMs: splits.reduce((a, s) => a + fin(s.timeMs), 0), split: splits[splits.length - 1] };
      if (last) {
        const tot = splits.reduce(
          (a, s) => ({ timeMs: a.timeMs + fin(s.timeMs), deaths: a.deaths + fin(s.deaths), damageTaken: a.damageTaken + fin(s.damageTaken), maxHp: a.maxHp + fin(s.maxHp, 1), flasksUsed: a.flasksUsed + fin(s.flasksUsed) }),
          { timeMs: 0, deaths: 0, damageTaken: 0, maxHp: 0, flasksUsed: 0 },
        );
        const rushRec = buildRecord({ ...common, ...tot, kind: 'rush', level: splits.map((s) => s.level), id: rush.id || undefined, splits, stats: {} });
        const ok = eligible && !rush.voided && splits.every((s) => s.eligible !== false);
        R.record = rushRec;
        R.eligible = ok;
        R.note = ok ? null : this.elig.note(rush.voided ?? 'lab');
        if (ok) R.best = this._store(rushRec);
        else R.prev = this.records.rushBest();
      }
      view.rush = R;
    }
    this.view = view;
    return view;
  }

  _store(rec) {
    const res = this.records.add(rec);
    try {
      this.game.events?.emit('game:record', { kind: rec.kind, record: rec, newBestTime: res.newBestTime, newBestGrade: res.newBestGrade });
    } catch {
      // a subscriber's failure is not the store's
    }
    return res;
  }

  /** The record screen's press in a rush: the next boss's page, or (after the last) the title. */
  next() {
    const g = this.game, R = this.rush;
    if (!R.state) return false;
    const href = globalThis.location?.href;
    if (R.state.done || !R.level) {
      const first = R.state.order[0] ?? g.levels?.[0]?.id ?? g.level?.id;
      R.abandon();
      if (typeof g.pickLevel === 'function') g.pickLevel(first);
      return true;
    }
    if (typeof href === 'string' && typeof globalThis.location?.assign === 'function') {
      globalThis.location.assign(rushUrl(R.level, href));
      return true;
    }
    return false;
  }

  /** Begin a boss rush over every level (the title's BOSS RUSH): its first page loads. */
  startRush() {
    const g = this.game;
    const order = (g.levels ?? []).map((L) => L.id).filter(Boolean);
    if (!order.length) return false;
    const ss = this.rush.session;
    const id = buildRecord({ kind: 'rush' }).id;
    if (!Rush.start(ss, order, id)) return false;
    const href = globalThis.location?.href;
    if (typeof href === 'string' && typeof globalThis.location?.assign === 'function') globalThis.location.assign(rushUrl(order[0], href));
    return true;
  }

  /** Quit from the pause menu: a rush ends, with no record. */
  quit() {
    if (this.rush.active) this.rush.abandon();
  }

  /** The HUD's rush line: the fight's number, the count, the rush's time so far (ms). */
  rushClock() {
    const R = this.rush;
    // (none on the record screen: it shows the rush's rows, and the clock has moved to the next fight)
    if (!R.active || !R.state || this.game.state === 'victory') return null;
    return { index: Math.min(R.count, R.index + 1), count: R.count, ms: R.totalMs };
  }

  /** The title's best for a level (or the rush with id 'rush'): { grade, marks, timeMs, gradeTimeMs } | null. */
  bestFor(id) {
    const b = id === 'rush' ? this.records.rushBest() : this.records.best(id);
    if (!b || !b.bestGrade) return null;
    return { grade: b.bestGrade.grade, marks: b.bestGrade.marks ?? [], timeMs: b.bestTime?.timeMs ?? b.bestGrade.timeMs, clears: b.clears };
  }
}

export { rankRun };
