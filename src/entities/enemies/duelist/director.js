// The duelist's director: what kind of move each one is and what it asks of the hero. Pure helpers
// the brain (brain.js: the pick, the links, the footwork's seek), the PACE meter and the Lab share.

import { TELL } from '../../../combat/rules.js';

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
