import { lookOf } from '../duelist/lookSwitch.js';
import { MOTION as ASC_MOTION } from '../ascendant/moves.js';
import { ANK } from '../ascendant/motion.js';
import { TUNING } from './tuning.js';
import { legsFor, limbKeys, flyKeys } from './limbs.js';

// Halcyon's reworked motion (ADR-225), `?halMotion=a`, played through his realiser's `keysOf`
// (moves.js). His blows are Tian Lei's builders' (ascendant/moves.js), keyed for a fighter standing on
// the floor; he never stands. What the audit measured on them (city.mjs AUDIT): his feet sat exactly at
// his root's height in every blow, a planted fighting stance 0.5 m up (he stood on air); every punch
// landed at 1.9 - 2.0 m, over the hero's head, with the elbow at ~130°. Under the switch:
//   1. Tian Lei's held windups for the blue and red blows (ascendant/motion.js).
//   2. THE FLIER'S LEGS on every builder blow: his hover's legs through the coil (the right knee drawn
//      up, the left hanging, the toes pointed), both trailing back through the strike as he drives in;
//      a kick keeps its striking leg and the other hangs.
//   3. THE BLOW AIMED DOWN at the hero: the striking hand lower, the body pitched over it, and his root
//      dips from the hover to `motion.dip` m through the strike (flight.js _want), so the fist meets
//      the hero's chest and head, not the air over him.
//   4. His arms open at the end of a blow (anim.js armSoft, Tian Lei's ADR-162 kit; halcyon.js).

const M = TUNING.motion;
/** His hover's legs (poses.js hoverLoco): the coil's, so a blow starts from the legs he flies on. */
const LEGS_COIL = { rF: [-0.1, ANK + 0.32, 0.1], lF: [0.12, ANK, -0.06], rK: [-0.1, 0.4, 1], lK: [0.1, 0, 1], flat: 0.2, rFy: -0.12, lFy: 0.1 };
/** Both legs trailing back as he drives in, the toes pointed. */
const LEGS_HIT = { rF: [-0.1, ANK + 0.24, -0.3], lF: [0.1, ANK + 0.06, -0.36], rK: [-0.1, -0.2, 1], lK: [0.1, -0.1, 1], flat: 0.1, rFy: -0.1, lFy: 0.1 };
/** A kick's other leg, hanging. */
const HANG_R = { rF: [-0.1, ANK + 0.04, -0.12], rK: [-0.1, 0, 1], rFy: -0.1 };
const HANG_L = { lF: [0.1, ANK + 0.04, -0.12], lK: [0.1, 0, 1], lFy: 0.1 };
const LEG_FIELDS = ['rF', 'lF', 'rK', 'lK', 'flat', 'rFy', 'lFy'];

const cache = new WeakMap();

/** The striking hand(s) of a beat: 'rH', 'lH' or both. */
function hands(beat) {
  const p = beat.part ?? 'fistR';
  if (p === 'palms') return ['rH', 'lH'];
  return p === 'fistL' || p === 'elbowL' ? ['lH'] : ['rH'];
}

/** One key's pose as he flies it (see the header). `strike`: the key is at or past the cock. */
function fly(pose, beat, strike) {
  const o = { ...pose };
  const fam = beat.mo?.fam, kick = fam === 'kick';
  if (kick) {
    // (the striking leg is the kick's: the other hangs)
    // (moves.js kick: `part` is already the mirrored limb for a left kick)
    Object.assign(o, (beat.part ?? 'footR').endsWith('R') ? HANG_L : HANG_R);
  } else {
    const L = strike ? LEGS_HIT : LEGS_COIL;
    for (const f of LEG_FIELDS) o[f] = Array.isArray(L[f]) ? L[f].slice() : L[f];
  }
  if (strike && !kick) {
    for (const h of hands(beat)) if (Array.isArray(o[h])) o[h] = [o[h][0], o[h][1] + M.aim.hand, o[h][2]];
    o.pitch = (o.pitch ?? 0) + M.aim.pitch;
  }
  return o;
}

const cacheB = new WeakMap();
/** His keys for a beat under the switch (null: the beat's own). `b` (ADR-254, limbs.js): `a`'s, then the
 *  flier's long legs in place of the folded ones, the straight blows on the line, the kicks long; his
 *  flying beats (the pass, the tower) their level flier's line. */
export function halKeys(beat) {
  const m = lookOf('halMotion', '0');
  if (m === '0' || !beat) return null;
  if (m === 'b' && !beat.mo) return flyKeys(beat);
  if (!beat.mo) return null;
  const C = m === 'b' ? cacheB : cache;
  if (C.has(beat)) return C.get(beat);
  const base = ASC_MOTION.keysFor(beat) ?? beat.keys ?? [];
  const cock = beat.cock ?? 0.7;
  let keys = base.map(([u, pose]) => [u, fly(pose, beat, u >= cock - 1e-6)]);
  if (m === 'b') {
    const kick = beat.mo.fam === 'kick';
    if (!kick) keys = keys.map(([u, p]) => [u, legsFor(p, u >= cock - 1e-6)]);
    else {
      // (a kick: the other leg hangs long, not folded under him as if he stood on air)
      const other = (beat.part ?? 'footR').endsWith('R') ? 'L' : 'R';
      keys = keys.map(([u, p]) => [u, legsFor(p, u >= cock - 1e-6, other)]);
    }
    keys = limbKeys(beat, keys);
  }
  C.set(beat, keys);
  return keys;
}

/** True when the switch is on (flight.js: the dip; halcyon.js: the open arms). */
export const halMotionOn = () => lookOf('halMotion', '0') !== '0';
/** True under `b` (ADR-254: the flier's limbs, the level pass; read live). */
export const halLimbsOn = () => lookOf('halMotion', '0') === 'b';
