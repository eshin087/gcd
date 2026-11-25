// What each of the boss's moves did to the hero (ADR-108): the per-move telemetry the balance is
// tuned from, the killing move on the death screen and the totals kept across sessions.
//
// Every blow the hero answers arrives as 'combat:answer' (player.js takeHit): { attack, tell, result,
// damage, dead, stream }. A move's row counts its BLOWS (a string of seven is seven): how many came
// (`seen`), how each was answered and what it cost:
//   hit       it landed (a guard break and a knocked-open guard too: the answer failed)
//   blocked   met on the held guard          parried  deflected (perfect: `perfectParry` of those)
//   clashed   met by the hero's own cut      dodged   rolled through (`perfectDodge` of those)
//   damage    HP it took in all              kills    deaths it dealt
// A contact stream (the fire breath's ticks, burning ground: `stream`) ticks many times a second:
// its damage always counts, but it is counted as one blow per STREAM_GAP s.
//
// Two tables: `attempt` (since the last respawn: the death screen reads it) and the stored totals
// per level (`commit` adds the attempt to them; localStorage 'gcd.telemetry.v1').

const storeKey = 'gcd.telemetry.v1'; // (not an UPPER_CASE const: the glyph check reads those as glyph strings)
const STREAM_GAP = 1.5; // s
const fin = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const FIELDS = ['seen', 'hit', 'blocked', 'parried', 'perfectParry', 'clashed', 'dodged', 'perfectDodge', 'damage', 'kills'];
const blank = () => Object.fromEntries(FIELDS.map((k) => [k, 0]));

/** 'heavenFall' / 'ash_rain' → 'Heaven Fall' / 'Ash Rain' (a move without a label of its own). */
export function prettyMove(id) {
  const s = String(id ?? '').replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim();
  return s ? s.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : 'A blow';
}

function load(storage) {
  try {
    const o = JSON.parse(storage?.getItem?.(storeKey) ?? 'null');
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

export class MoveLog {
  /** storage: a localStorage-like object, or null (nothing kept); level: the level's id. */
  constructor(storage = null, level = 'cinderwood') {
    this.storage = storage;
    this.level = String(level || 'cinderwood');
    this.attempt = new Map();
    this.killedBy = null; // { attack, tell } of the blow that killed him this attempt
    this._streamT = new Map();
  }

  /** A new attempt: the table starts over. */
  reset() {
    this.attempt.clear();
    this._streamT.clear();
    this.killedBy = null;
  }

  /** One answered blow ('combat:answer'); `time`: game seconds (for the stream gap). */
  answer(d, time = 0) {
    const r = d?.result;
    if (!r || r === 'ignored') return;
    const id = typeof d.attack === 'string' && d.attack ? d.attack : 'blow';
    let row = this.attempt.get(id);
    if (!row) this.attempt.set(id, (row = blank()));
    const dmg = Math.max(0, fin(d.damage));
    row.damage += dmg;
    if (d.dead) {
      row.kills++;
      this.killedBy = { attack: id, tell: d.tell ?? null };
    }
    if (d.stream) {
      // a stream's ticks are one blow per STREAM_GAP s
      const t = fin(time), last = this._streamT.get(id);
      if (last !== undefined && t - last < STREAM_GAP && t >= last) return;
      this._streamT.set(id, t);
    }
    row.seen++;
    if (r === 'hit') row.hit++;
    else if (r === 'blocked') row.blocked++;
    else if (r === 'parried') {
      row.parried++;
      if (d.perfect) row.perfectParry++;
    } else if (r === 'clashed') row.clashed++;
    else if (r === 'dodged') row.dodged++;
    else if (r === 'perfectDodge') {
      row.dodged++;
      row.perfectDodge++;
    }
  }

  /** The moves that struck him this attempt, the worst first: [{ id, hit, seen, damage }], `n` at most. */
  worst(n = 3) {
    const out = [];
    for (const [id, r] of this.attempt) if (r.hit > 0 || r.damage > 0) out.push({ id, hit: r.hit, seen: r.seen, damage: Math.round(r.damage) });
    out.sort((a, b) => b.hit - a.hit || b.damage - a.damage);
    return out.slice(0, Math.max(0, n));
  }

  /** Add this attempt to the level's stored totals (outcome 'death' | 'victory') and keep them. */
  commit(outcome) {
    const all = load(this.storage);
    const L = (all[this.level] ??= { attempts: 0, deaths: 0, wins: 0, killedBy: {}, moves: {} });
    L.attempts = fin(L.attempts) + 1;
    if (outcome === 'victory') L.wins = fin(L.wins) + 1;
    else L.deaths = fin(L.deaths) + 1;
    L.killedBy = L.killedBy && typeof L.killedBy === 'object' ? L.killedBy : {};
    L.moves = L.moves && typeof L.moves === 'object' ? L.moves : {};
    if (outcome !== 'victory' && this.killedBy) L.killedBy[this.killedBy.attack] = fin(L.killedBy[this.killedBy.attack]) + 1;
    for (const [id, r] of this.attempt) {
      const T = (L.moves[id] ??= blank());
      for (const k of FIELDS) T[k] = Math.round((fin(T[k]) + fin(r[k])) * 10) / 10;
    }
    try {
      this.storage?.setItem?.(storeKey, JSON.stringify(all));
    } catch {
      /* storage full or blocked: the attempt is simply not kept */
    }
    return L;
  }

  /** Everything stored, every level: { [level]: { attempts, deaths, wins, killedBy, moves } }. */
  totals() {
    return load(this.storage);
  }

  /** Forget the stored totals. */
  clear() {
    try {
      this.storage?.removeItem?.(storeKey);
    } catch {
      /* nothing to forget */
    }
  }

  /**
   * The stored totals of one level as rows for a table, the deadliest first:
   * [{ move, seen, hit, 'hit %', blocked, parried, dodged, clashed, damage, kills }].
   * `label`: id → the move's name (default: prettyMove).
   */
  table(level = this.level, label = prettyMove) {
    const L = this.totals()[level];
    if (!L?.moves) return [];
    const rows = Object.entries(L.moves).map(([id, r]) => ({
      move: label(id), seen: fin(r.seen), hit: fin(r.hit), 'hit %': r.seen > 0 ? Math.round((100 * fin(r.hit)) / r.seen) : 0,
      blocked: fin(r.blocked), parried: fin(r.parried), dodged: fin(r.dodged), clashed: fin(r.clashed), damage: Math.round(fin(r.damage)), kills: fin(r.kills),
    }));
    rows.sort((a, b) => b.kills - a.kills || b.damage - a.damage);
    return rows;
  }
}
