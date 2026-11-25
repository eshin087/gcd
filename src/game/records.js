import { compareRank, rankRun } from './rank.js';

// Saved records (ADR-179): the run record a later leaderboard takes, and the bests kept per browser.
//
// THE RUN RECORD (buildRecord, the one function that writes one; docs/ARCHITECTURE.md → "Records"):
//   { v, id, kind: 'boss' | 'rush', level (a boss: its id; a rush: the ordered ids), gameVersion, at,
//     timeMs, deaths, damageTaken, maxHp, flasksUsed, grade, marks, stats, device, techniques, style,
//     rush (a boss fought inside a rush: the rush's id; else null), splits (a rush: one per level) }
// Plain JSON, no player name, no network code. Only an ELIGIBLE run (game/eligibility.js) is stored.
//
// THE STORE (`Records`, the pattern of unlocks.js): localStorage key `gcd.records.v1`, an injectable
// storage for tests; blocked, corrupt or full storage never throws (what cannot be saved is kept for
// this page load). It keeps:
//   levels[id]  { clears, bestTime, bestGrade }    a boss's bests (from a rush's fights too)
//   rush        { clears, bestTime, bestGrade }    the whole rush's bests
//   recent      the last RECENT run records in full, oldest first: the queue a later uploader drains
// bestTime = { timeMs, grade, marks, id, at } of the fastest run; bestGrade = the same of the best
// graded run (the better grade, then within a grade the faster): two separate bests, which may come
// from different runs.
//
//   new Records(storage?)  .best(levelId) / .rushBest() → { clears, bestTime, bestGrade } | null
//   .add(record) → { newBestTime, newBestGrade, prevTime, prevGrade }   .recent() → [records]
//   .clear()

export const RECORDS_KEY = 'gcd.records.v1';
export const RECORD_VERSION = 1;
export const RECENT = 24; // a full rush (eight fights and the rush) and the runs before it

const fin = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
let seq = 0;

/** A run's id: unique per run (crypto when there is one; never Math.random: the tests seed it). */
export function newRunId() {
  try {
    const u = globalThis.crypto?.randomUUID?.();
    if (typeof u === 'string' && u) return u;
  } catch {
    // no crypto: the clock and a counter
  }
  seq = (seq + 1) % 1e6;
  return `r${Date.now().toString(36)}-${seq.toString(36)}-${Math.floor(fin(globalThis.performance?.now?.()) * 1000).toString(36)}`;
}

/**
 * The run record. `o`: { kind, level, timeMs, deaths, damageTaken, maxHp, flasksUsed, stats, device,
 * techniques, style, rush, splits, gameVersion, id?, at? }. The grade and marks come from rankRun on
 * the clean-play inputs (a rush: its totals).
 */
export function buildRecord(o = {}) {
  const deaths = Math.max(0, Math.floor(fin(o.deaths)));
  const damageTaken = Math.max(0, Math.round(fin(o.damageTaken)));
  const maxHp = Math.max(1, Math.round(fin(o.maxHp, 1)));
  const flasksUsed = Math.max(0, Math.floor(fin(o.flasksUsed)));
  const { grade, marks } = rankRun({ deaths, damageTaken, maxHp, flasksUsed });
  const rec = {
    v: RECORD_VERSION,
    id: typeof o.id === 'string' && o.id ? o.id : newRunId(),
    kind: o.kind === 'rush' ? 'rush' : 'boss',
    level: o.kind === 'rush' ? (Array.isArray(o.level) ? o.level.map(String) : []) : String(o.level ?? ''),
    gameVersion: String(o.gameVersion ?? ''),
    at: typeof o.at === 'string' ? o.at : new Date().toISOString(),
    timeMs: Math.max(0, Math.round(fin(o.timeMs))),
    deaths,
    damageTaken,
    maxHp,
    flasksUsed,
    grade,
    marks,
    stats: o.stats && typeof o.stats === 'object' ? { ...o.stats } : {},
    device: ['keyboard', 'pad', 'touch'].includes(o.device) ? o.device : 'keyboard',
    techniques: Array.isArray(o.techniques) ? o.techniques.filter((t) => typeof t === 'string') : [],
    style: typeof o.style === 'string' ? o.style : null,
    rush: typeof o.rush === 'string' ? o.rush : null,
  };
  if (rec.kind === 'rush') rec.splits = Array.isArray(o.splits) ? o.splits.map((s) => ({ ...s })) : [];
  return rec;
}

const brief = (r) => ({ timeMs: r.timeMs, grade: r.grade, marks: [...(r.marks ?? [])], id: r.id, at: r.at });
const blank = () => ({ v: RECORD_VERSION, levels: {}, rush: null, recent: [] });

const validBest = (b) => !!b && typeof b === 'object' && Number.isFinite(b.timeMs) && typeof b.grade === 'string';
function cleanEntry(e) {
  if (!e || typeof e !== 'object') return null;
  return { clears: Math.max(0, Math.floor(fin(e.clears))), bestTime: validBest(e.bestTime) ? e.bestTime : null, bestGrade: validBest(e.bestGrade) ? e.bestGrade : null };
}

function load(storage) {
  let o = null;
  try {
    o = JSON.parse(storage?.getItem?.(RECORDS_KEY) ?? 'null');
  } catch {
    o = null;
  }
  // (another version in this key, or anything that is not ours: start over; a later version reads
  // this one's key and carries it forward)
  if (!o || typeof o !== 'object' || Array.isArray(o) || o.v !== RECORD_VERSION) return blank();
  const out = blank();
  if (o.levels && typeof o.levels === 'object') {
    for (const [k, e] of Object.entries(o.levels)) {
      const c = cleanEntry(e);
      if (c) out.levels[k] = c;
    }
  }
  out.rush = cleanEntry(o.rush);
  if (Array.isArray(o.recent)) out.recent = o.recent.filter((r) => r && typeof r === 'object' && r.v === RECORD_VERSION).slice(-RECENT);
  return out;
}

export class Records {
  constructor(storage = globalThis.localStorage ?? null) {
    this.storage = storage;
    this.data = load(storage);
    this.saved = true; // false: the last write failed (kept for this page load)
  }

  best(level) {
    const e = this.data.levels[String(level)];
    return e ? { ...e } : null;
  }

  rushBest() {
    return this.data.rush ? { ...this.data.rush } : null;
  }

  recent() {
    return this.data.recent.slice();
  }

  /** Store an eligible run record: its bests and the recent queue. */
  add(rec) {
    const res = { newBestTime: false, newBestGrade: false, prevTime: null, prevGrade: null };
    if (!rec || typeof rec !== 'object' || rec.v !== RECORD_VERSION) return res;
    const D = this.data;
    let e;
    if (rec.kind === 'rush') e = D.rush ??= { clears: 0, bestTime: null, bestGrade: null };
    else e = D.levels[rec.level] ??= { clears: 0, bestTime: null, bestGrade: null };
    res.prevTime = e.bestTime ? { ...e.bestTime } : null;
    res.prevGrade = e.bestGrade ? { ...e.bestGrade } : null;
    e.clears++;
    if (!e.bestTime || rec.timeMs < e.bestTime.timeMs) {
      e.bestTime = brief(rec);
      res.newBestTime = true;
    }
    if (!e.bestGrade || compareRank(rec, e.bestGrade) < 0) {
      e.bestGrade = brief(rec);
      res.newBestGrade = true;
    }
    D.recent.push(rec);
    if (D.recent.length > RECENT) D.recent.splice(0, D.recent.length - RECENT);
    this._save();
    return res;
  }

  clear() {
    this.data = blank();
    this._save();
  }

  _save() {
    const s = this.storage;
    if (!s?.setItem) return;
    try {
      s.setItem(RECORDS_KEY, JSON.stringify(this.data));
      this.saved = true;
      return;
    } catch {
      // full (or blocked): drop the oldest half of the queue and try once more; the bests matter most
    }
    try {
      const keep = { ...this.data, recent: this.data.recent.slice(-Math.floor(RECENT / 4)) };
      s.setItem(RECORDS_KEY, JSON.stringify(keep));
      this.saved = true;
    } catch {
      this.saved = false; // kept for this page load
    }
  }
}

/** m:ss.hh (a run's time to the hundredth); '--:--.--' for none. */
export function formatTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '--:--.--';
  const cs = Math.floor(ms / 10);
  const h = cs % 100, s = Math.floor(cs / 100) % 60, m = Math.floor(cs / 6000);
  return `${m}:${s < 10 ? '0' : ''}${s}.${h < 10 ? '0' : ''}${h}`;
}
