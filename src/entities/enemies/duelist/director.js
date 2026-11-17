// The duelist's director: what kind of move each one is and what it asks of the hero. Pure helpers
// the brain (brain.js: the pick, the links, the footwork's seek), the PACE meter and the Lab share.

import { TELL } from '../../../combat/rules.js';
import { wrapAngle } from '../../../core/math.js';
import { perPhase } from './realise.js';

/**
 * A move's category (the second pass's contract). A move may carry `cat`; without it one is derived
 * from its data, in this order:
 *   terrain   a `terrain` move (a piece of the level)
 *   hazard    a beat that calls a strike down or leaves something lingering (cast storm / star, a
 *             beat marked `hazard` or `burn`)
 *   string    three or more real blade hits (a string with a spell inside it stays a string)
 *   spell     a bolt / pull / grip / push / rift beat (the Void as the move's main beat)
 *   ranged    crescents, the returning blade, torn stones
 *   area      a single blow on a ring zone
 *   closer    `gapCloser`, a dash of 3 m or more, or a leap
 *   single    anything else
 */
export const CATEGORIES = Object.freeze(['string', 'single', 'closer', 'area', 'ranged', 'spell', 'terrain', 'hazard']);

const _cats = new WeakMap();
const _answers = new WeakMap();

/** The beats of a move as authored (a `pick`: every alternative). */
function* allBeats(def) {
  for (const b of def?.beats ?? []) {
    if (Array.isArray(b.pick)) yield* b.pick;
    else yield b;
  }
}

/** A beat that is the blade's own blow (a zone, not a spell, not a thrown thing). */
export const isBlade = (b) => !!b && !b.feint && !!b.zone && !b.bolt && !b.pull && !b.grip && !b.release && !b.cast;
const isSpell = (b) => !!b && !!(b.bolt || b.pull || b.grip || b.release?.style === 'push' || b.release?.style === 'rift');
const isRanged = (b) => !!b && !!((b.release && (!b.release.style || b.release.style === 'crescent')) || b.cast?.kind === 'glaive' || b.cast?.kind === 'debris');
const isHazard = (b) => !!b && !!(b.hazard || b.burn || b.cast?.kind === 'storm' || b.cast?.kind === 'star');

/** The category of a move definition (cached per definition). */
export function categoryOf(def) {
  if (!def) return 'single';
  let c = _cats.get(def);
  if (c) return c;
  c = deriveCategory(def);
  _cats.set(def, c);
  return c;
}

function deriveCategory(def) {
  if (typeof def.cat === 'string' && def.cat) return def.cat;
  if (def.terrain) return 'terrain';
  // (the first alternative of a `pick` stands for the beat: what the move usually is)
  const bs = (def.beats ?? []).map((b) => (Array.isArray(b.pick) ? b.pick[0] : b));
  if (bs.some(isHazard)) return 'hazard';
  const blade = bs.filter(isBlade).length;
  if (blade >= 3) return 'string';
  if (bs.some(isSpell)) return 'spell';
  if (bs.some(isRanged)) return 'ranged';
  if (blade === 1 && bs.some((b) => isBlade(b) && b.zone?.kind === 'ring')) return 'area';
  if (def.gapCloser || bs.some((b) => b.dash?.max >= 3 || b.leap)) return 'closer';
  return 'single';
}

/** What a move asks of the hero: a bit mask of GUARD (a block or a parry answers it: normal, blue)
 *  and DODGE (red, black). Every beat and every alternative counts, and what it throws (the great
 *  torn stone is red). */
export const GUARD = 1;
export const DODGE = 2;
export const answerOf = (tell) => (tell === TELL.RED || tell === TELL.BLACK ? DODGE : GUARD);

export function answersOf(def) {
  if (!def) return 0;
  let m = _answers.get(def);
  if (m !== undefined) return m;
  m = 0;
  for (const b of allBeats(def)) {
    if (b.feint) continue;
    m |= answerOf(b.tell);
    if (b.cast?.big) m |= DODGE;
  }
  _answers.set(def, m);
  return m;
}

// ================================================================== the director (brain.js calls)
// Everything below reads the boss's `TUNING.pressure` block (brain.P); the brain calls it only when
// there is one, so a kit without it picks and paces exactly as before the second pass.

/** The categories a phase's moveset has (the moves the AI may pick in it), cached per brain. */
function phaseCats(br, ph) {
  const C = (br._phaseCats ??= {});
  if (C[ph]) return C[ph];
  const out = new Set();
  for (const name of br.names) {
    const def = br.M[name];
    if (def.counter || def.transition || def.manual || (def.phase ?? 1) > ph || !(perPhase(def.weight, ph) > 0)) continue;
    out.add(categoryOf(def));
  }
  return (C[ph] = out);
}

/**
 * Before a pick (brain._choose): the floors. A category the phase has that has not been picked for
 * `floorAfter` × `floorForce` s is forced (every other move × 0.02) when one of its moves can be used
 * from here; when its moves are only usable from another range, the footwork seeks that range for
 * at most `seek.max` s (brain.seek), not more often than every `seek.every` s.
 */
export function prepareChoose(br, dist) {
  const P = br.P, d = br.d, ph = d.phase;
  if (br._phaseSeen !== ph) {
    br._phaseSeen = ph;
    br.floorT0 = br.clock;
    br.catSeen = {};
    br.seek = null;
  }
  br.forceCat = null;
  const after = perPhase(P.floorAfter ?? 0, ph), force = P.floorForce ?? 0;
  if (!(after > 0) || !(force > 0)) return;
  let worst = null, worstAbs = after * force;
  for (const c of phaseCats(br, ph)) {
    const abs = br.clock - (br.catSeen[c] ?? br.floorT0);
    if (abs > worstAbs) {
      worst = c;
      worstAbs = abs;
    }
  }
  if (!worst) return;
  let usable = false, band = null;
  for (const name of br.names) {
    const def = br.M[name];
    if (categoryOf(def) !== worst || def.counter || def.transition || def.manual || (def.phase ?? 1) > ph || (br.cooldowns[name] ?? 0) > 0) continue;
    if (!(perPhase(def.weight, ph) > 0) || (d.weigh && !(d.weigh(name, def, 1, dist) > 0))) continue;
    if (dist >= def.band[0] && dist <= def.band[1]) {
      usable = true;
      break;
    }
    if (!band || Math.abs(def.band[0] - dist) < Math.abs(band[0] - dist)) band = def.band;
  }
  if (usable) {
    br.forceCat = worst;
    br.stats.floors++;
    return;
  }
  const S = P.seek;
  if (band && S && !br.seek && br.clock >= (br.seekNext ?? 0)) {
    const lo = band[0] + 0.3, hi = Math.max(lo + 0.4, Math.min(band[1] - 0.3, band[0] + 3));
    br.seek = { cat: worst, band: [lo, hi], until: br.clock + (S.max ?? 2.5) };
    br.seekNext = br.clock + (S.every ?? 8);
    br.stats.seeks++;
  }
}

/** A move's weight as the director sees it (brain._choose, after the old damping). */
export function directWeight(br, name, def, w, dist) {
  const P = br.P, ph = br.d.phase, cat = categoryOf(def);
  if (cat === br.lastCat) {
    w *= P.sameCat ?? 1;
    if (br.catRun >= perPhase(P.maxRun ?? 99, ph)) w *= P.overRun ?? 1;
  }
  const bias = P.bias?.[cat];
  if (bias !== undefined) w *= perPhase(bias, ph);
  // the busier moves (cues a second as authored, against 1 a second) weigh more: × density^k
  const k = perPhase(P.density ?? 0, ph);
  if (k > 0) w *= Math.pow(Math.max(0.2, densityOf(def)), k);
  const after = perPhase(P.floorAfter ?? 0, ph);
  if (after > 0) {
    const abs = br.clock - (br.catSeen[cat] ?? br.floorT0);
    if (abs > after) w *= (P.floorBoost ?? 1) * Math.min(3, abs / after);
  }
  if (br.forceCat && cat !== br.forceCat) w *= 0.02;
  if (P.farDist > 0 && dist > P.farDist && (cat === 'closer' || def.gapCloser)) w *= P.closerBoost ?? 1;
  const L = br.ledger;
  if (cat === 'hazard' && L.liveHazards() >= perPhase(P.maxLive ?? 99, ph)) w *= 0.05;
  const mixed = P.mixed ?? 1;
  if (mixed < 1) {
    const ans = answersOf(def), H = P.guard?.horizon ?? 1.4;
    if (((ans & GUARD) && L.pending(DODGE, H)) || ((ans & DODGE) && L.pending(GUARD, H))) w *= mixed;
  }
  return w;
}

const _density = new WeakMap();
/** A move's cues a second as authored (its real hits over its windups, active frames and recovery;
 *  a `pick`: the first alternative; a thrown thing counts as one). */
export function densityOf(def) {
  let v = _density.get(def);
  if (v !== undefined) return v;
  let n = 0, T = def.recovery ?? 0.5;
  for (const raw of def.beats ?? []) {
    const b = Array.isArray(raw.pick) ? raw.pick[0] : raw;
    T += (b.windup ?? 0.5) + (b.active ?? 0.1) + (Array.isArray(b.hold) ? (b.hold[0] + b.hold[1]) / 2 : 0);
    if (!b.feint) n += b.chance !== undefined && b.chance < 1 ? b.chance : 1;
  }
  v = n / Math.max(0.3, T);
  _density.set(def, v);
  return v;
}

/** An AI pick was made (a footwork pick, a link, the flow): the run, the floors, the seek. */
export function booked(br, name) {
  const def = br.M[name];
  if (!def) return;
  const cat = categoryOf(def);
  br.catRun = cat === br.lastCat ? br.catRun + 1 : 1;
  br.lastCat = cat;
  br.catSeen[cat] = br.clock;
  if (br.forceCat === cat) br.forceCat = null;
  if (br.seek?.cat === cat) br.seek = null;
  br.stats.picks++;
}

/**
 * Where the hero is as a move ends, at a duelist's scale (a link's `when`):
 *   any · near (under pressure.near, 3.3 m) · mid (to pressure.far, 6 m) · far (beyond) ·
 *   front / side / behind (his bearing off the duelist's facing: front under pressure.front rad,
 *   behind over pressure.behind) · away (backing or rolling away: his speed away from the duelist
 *   over pressure.away m/s) · guarding (his guard held up)
 */
export function whenHolds(br, when, s) {
  const P = br.P, d = br.d, pl = d.game.player;
  const near = P.near ?? 3.3, far = P.far ?? 6;
  switch (when ?? 'any') {
    case 'any':
      return true;
    case 'near':
      return s.dist < near;
    case 'mid':
      return s.dist >= near && s.dist < far;
    case 'far':
      return s.dist >= far;
    case 'front':
    case 'side':
    case 'behind': {
      const b = Math.abs(wrapAngle(s.ang - d.yaw));
      const k = b < (P.front ?? 0.9) ? 'front' : b > (P.behind ?? 2.2) ? 'behind' : 'side';
      return k === when;
    }
    case 'away': {
      const radial = (s.vx * s.dx + s.vz * s.dz) / (s.dist || 1);
      return radial > (P.away ?? 1.2) || (pl?.state === 'roll' && radial > 0);
    }
    case 'guarding':
      return !!pl?.blocking;
    default:
      return false;
  }
}

/** The combo links of a move (the kit's LINKS table, `<boss>/links.js`). */
export const linksOf = (br, name) => br.d.LINKS?.[name] ?? br.K.LINKS?.[name] ?? null;

/** Is link L's target usable right now (phase, weight, cooldown unless `force`, band unless
 *  `band: false`, the actor's say)? */
export function linkUsable(br, L, s) {
  const d = br.d, ph = d.phase, def = br.M[L.to];
  if (!def || def.transition || (def.phase ?? 1) > ph) return false;
  if (!def.counter && !(perPhase(def.weight, ph) > 0)) return false;
  if (!L.force && (br.cooldowns[L.to] ?? 0) > 0) return false;
  if (L.band !== false && (s.dist < def.band[0] || s.dist > def.band[1])) return false;
  if (d.weigh && !(d.weigh(L.to, def, 1, s.dist) > 0)) return false;
  // (the mixed-answers rule: no link into a move asking a guard while a dodge is due, or the other
  // way round; the pick only damps such a move, a link is not taken)
  const P = br.P;
  if ((P?.mixed ?? 1) < 1) {
    const ans = answersOf(def), H = P.guard?.horizon ?? 1.4, Lg = br.ledger;
    if (((ans & GUARD) && Lg.pending(DODGE, H)) || ((ans & DODGE) && Lg.pending(GUARD, H))) return false;
  }
  return true;
}

/**
 * The link out of move `a` (its LINKS: the first whose `when` holds, whose `chance` roll passes and
 * whose target is usable), or null. `pursuit`: the string stopped because the hero left its reach:
 * only `far` / `away` links.
 */
export function linkFor(br, a, s, pursuit = false) {
  const list = linksOf(br, a.name);
  if (!Array.isArray(list) || !s) return null;
  const ph = br.d.phase;
  for (const L of list) {
    if (!L?.to || (pursuit && L.when !== 'far' && L.when !== 'away')) continue;
    if (!whenHolds(br, L.when, s)) continue;
    const ch = perPhase(L.chance ?? 1, ph);
    if (!(ch > 0) || (ch < 1 && !(Math.random() < ch))) continue;
    if (!linkUsable(br, L, s)) continue;
    return L;
  }
  return null;
}
