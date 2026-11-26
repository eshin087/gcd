import { TELL } from '../../../combat/rules.js';
import { DIM } from '../../player/model.js';
import { lookOf } from '../duelist/lookSwitch.js';

// The reworked motion of the bare-handed blows (ADR-225), played through the realiser's `keysOf`
// (duelist/realise.js) behind a live look switch, so a beat's gameplay (tell, windup, zone, damage,
// root motion) never moves; only its pose keys do:
//   ?ascMotion=a   Tian Lei (ascendant/moves.js MOTION.ascKeys)
//   ?halMotion=a   Halcyon: these keys and his flier's legs on top (halcyon/motion.js)
// The builders' beats (moves.js punch / kick / elbow / shoulder; melee.js bolt, the aura burst) carry
// `mo` = { fam, kind, left, step, tell, sign? } saying what they were built from; the shared builders
// themselves are unchanged (the Fox and Xin Yi use them and have no keysOf: their blows are as before).
//
// THE HELD WINDUP (the owner, 2026-11-26: every blue and red blow reads from a held pose). A blue
// (parry) or red (perfect-dodge) blow no longer drifts into its coil at u 0.7 and snaps out of it:
// the body is IN the coil by u HELD_AT (0.36 of the windup), a pose of its own that says which blow
// and which answer, held there while it tightens a little (the striking limb drawn a few cm further,
// the weight a little lower: a held pose that still lives), until the cock; the strike from the cock
// is the beat's own (its timing unchanged). Red holds sink deeper and wider than blue ones: a parry's
// blow is chambered high and close, a perfect dodge's is loaded low. A normal blow keeps its keys.
// HELD (below) is each blow's held pose over its coil; a kind not in it holds its own coil.

const B = TELL.BLUE, R = TELL.RED;
const ANK = DIM.ankle;
/** Where in the windup (u) the held pose is reached; never later than 0.2 before the cock. */
export const HELD_AT = 0.36;

/** The held poses, over each blow's coil (right-side authoring: +x his LEFT, hands off the shoulders,
 *  feet model space). Keyed `fam:kind`, a red one `fam:kind:red` first. */
const HELD = {
  // the rear fist dropped low beside the hip, the elbow back, the lead hand up: the chin tucked over it
  'punch:uppercut': { yaw: -0.62, bY: -0.46, pitch: 0.28, hip: -0.16, spY: -0.08, hdX: 0.2, rH: [-0.02, -0.42, 0.04], rP: [-0.9, -0.4, -0.5], lH: [0.0, 0.14, 0.36], lP: [0.8, -0.6, -0.1] },
  // the right palm drawn back to the hip, the lead hand out flat at the target (a sight)
  'punch:palm': { yaw: -0.8, bY: -0.3, pitch: 0.08, hip: -0.16, rH: [-0.02, -0.17, -0.04], rP: [-0.8, -0.5, -0.6], lH: [0.04, 0.08, 0.5], lP: [0.8, -0.6, -0.2] },
  // the red palm (a perilous thrust): sunk deeper and wider, the body wound further round
  'punch:palm:red': { yaw: -0.95, bY: -0.38, pitch: 0.14, hip: -0.2, spY: -0.06, rH: [-0.05, -0.18, -0.1], rP: [-0.8, -0.5, -0.6], lH: [0.06, 0.1, 0.5], lP: [0.8, -0.6, -0.2], lF: [0.3, 0.44], rF: [-0.3, -0.38], rK: [-0.6, 0, 0.8], lK: [0.6, 0, 0.8], lFy: 0.3, rFy: -0.6 },
  // the rear fist cocked back by the ear, the elbow up, the lead arm out to aim it
  'punch:cross': { yaw: -0.84, bY: -0.22, pitch: 0.04, hip: -0.16, rH: [-0.02, 0.13, 0.0], rP: [-0.85, 0.3, -0.45], lH: [-0.02, 0.1, 0.46], lP: [0.8, -0.5, -0.2] },
  // the arm folded across the chest, the shoulder turned in to show his back
  'punch:backfist': { yaw: 0.8, bY: -0.22, hip: 0.14, rH: [0.36, 0.1, 0.12], rP: [-0.5, 0.3, 0.6], lH: [0.02, 0.02, 0.26] },
  // both fists high over the head, the back arched: the whole body a drawn bow
  'punch:hammer': { bY: -0.02, pitch: -0.22, spX: -0.14, hdX: -0.12, rH: [0.14, 0.58, -0.02], lH: [-0.14, 0.58, -0.02], rP: [-0.7, 0.6, -0.4], lP: [0.7, 0.6, -0.4] },
  // the crane: the kicking knee chambered high and across, the body leaning away, a hand out for balance
  'kick:round': { yaw: 0.55, bY: -0.12, roll: -0.14, rF: [-0.32, 0.62, 0.06], rK: [-0.6, 0.8, 0.4], rH: [0.14, 0.12, 0.2], lH: [0.24, 0.14, 0.24] },
  // the leg held straight up at the top, the arms opened for balance
  'kick:axe': { bY: -0.04, pitch: -0.26, spX: -0.1, rH: [-0.16, 0.2, 0.2], lH: [0.24, 0.22, 0.22] },
  // turned side-on, the heel chambered high and tight
  'kick:side': { yaw: 1.1, roll: -0.16, bY: -0.16, rF: [0.0, 0.56, 0.06], rK: [-0.7, 0.4, 0.5], rH: [0.1, 0.12, 0.22], lH: [0.06, 0.08, 0.22] },
  // the bolt: the right hand raised high by the ear, two fingers up, the lead hand aimed
  bolt: { yaw: -0.7, bY: -0.2, rH: [-0.12, 0.42, 0.0], rP: [-0.7, 0.5, -0.4], lH: [-0.04, 0.08, 0.5] },
  // the burst: crouched lower, the fists pressed down at the hips, the head bowed
  burst: { bY: -0.46, pitch: 0.2, hdX: 0.3, rH: [-0.06, -0.44, -0.02], lH: [0.06, -0.44, -0.02] },
};

/** A hand drawn `k` m further back from where it strikes (the held pose tightening). */
function drawn(h, hit, k) {
  if (!Array.isArray(h) || !Array.isArray(hit)) return h;
  const dx = h[0] - hit[0], dy = h[1] - hit[1], dz = h[2] - hit[2], n = Math.hypot(dx, dy, dz) || 1;
  return [h[0] + (dx / n) * k, h[1] + (dy / n) * k, h[2] + (dz / n) * k];
}

/**
 * The motion's keys for the builders. `X` (moves.js X), the builders' own tables (PUNCH, KICK, ELBOW,
 * SHOULDER: { coil, hit, pre? }), moves.js stepMid (a key between two poses, a moving foot lifted) and
 * melee.js signKeys (a strike re-keyed out of THE SIGN). Returns { keysFor(beat), ascKeys(beat) }.
 */
export function makeMotion({ X, PUNCH, KICK, ELBOW, SHOULDER, stepMid, signKeys }) {
  const { F, mirror, follow } = X;
  const cache = new WeakMap();

  /** The keys of a held-windup strike (see the header). */
  function heldKeys({ coil, held, hit, pre = null, cock, left, tight = 0.045, sink = 0.025 }) {
    const m = left ? mirror : (p) => p;
    const at = Math.min(HELD_AT, cock - 0.2);
    const H = { ...coil, ...held };
    // tightening through the hold: the hands drawn further from their strike, the weight lower
    const T = { ...H, bY: (H.bY ?? -0.16) - sink, rH: drawn(H.rH, hit.rH, tight), lH: drawn(H.lH, hit.lH, tight) };
    const c = F(m(T)), h = F(m(hit)), fo = F(m(follow(hit)));
    const keys = [];
    if (pre) keys.push([at * 0.5, F(m(pre))]);
    keys.push([at, { ...F(m(H)), e: 'o' }]);
    keys.push([cock, c]);
    keys.push([cock + (1 - cock) * 0.5, { ...stepMid(c, h, 0.25), e: 'i' }]);
    keys.push([1.0, { ...h, e: 'l' }]);
    keys.push([1.6, { ...fo, e: 'o' }]);
    keys.push([2.0, fo]);
    return keys;
  }

  /** The source a builder's beat was made from: { coil, hit, pre } or null. */
  function source(mo) {
    switch (mo.fam) {
      case 'punch': return PUNCH[mo.kind] ?? null;
      case 'kick': return mo.kind === 'sweep' ? null : KICK[mo.kind] ?? null;
      case 'elbow': return ELBOW;
      case 'shoulder': return SHOULDER;
      case 'bolt':
      case 'burst': return mo.coil && mo.hit ? { coil: mo.coil, hit: mo.hit } : null;
      default: return null;
    }
  }

  /** The reworked keys of a beat (null: its own keys). Cached per beat. */
  function keysFor(beat) {
    if (!beat?.mo) return null;
    if (cache.has(beat)) return cache.get(beat);
    let keys = null;
    const mo = beat.mo;
    // (the blows that ask for a parry or a perfect dodge; a stepped string blow keeps its own: its feet
    // walk the string)
    if ((mo.tell === B || mo.tell === R) && !mo.step) {
      const src = source(mo);
      if (src) {
        const key = mo.kind ? `${mo.fam}:${mo.kind}` : mo.fam;
        const held = (mo.tell === R ? HELD[`${key}:red`] : null) ?? HELD[key] ?? {};
        const red = mo.tell === R;
        keys = heldKeys({ coil: src.coil, held, hit: src.hit, pre: src.pre ?? null, cock: beat.cock ?? 0.7, left: !!mo.left, tight: red ? 0.06 : 0.045, sink: red ? 0.04 : 0.025 });
        if (mo.sign) keys = signKeys(X, { keys, cock: beat.cock ?? 0.76 });
      }
    }
    cache.set(beat, keys);
    return keys;
  }

  return {
    keysFor,
    /** Tian Lei's realiser hook: his reworked keys under `?ascMotion=a`. */
    ascKeys: (beat) => (lookOf('ascMotion', '0') === '0' ? null : keysFor(beat)),
  };
}

// ---------------------------------------------------------------- the snap blows (ADR-225)
// A SNAP is a normal (white) blow with a short windup (TUNING.snap: ~0.3 s, unscaled by form or phase),
// thrown from the guard he stands in: its keys move only the striking arm and the hips that drive it, so
// every field it does not key is his stance's (duelist/poses.js completeBeat) and the blow reads from
// the stance itself, not from a wind-up. The coil at u 0.5 is a few centimetres of draw and a shoulder
// loading; the strike eases in from there. Its fairness: white (block or parry), little damage, short
// range (he does not lunge for it), and the flash still comes after the tell (tests DATA).
const hd = (p, yaw0 = -0.42) => ({ ...p, hdY: p.hdY ?? -((p.yaw ?? yaw0) + (p.spY ?? 0)) * 0.82 });
/** The keys of each snap (right-side authoring as the builders'; the lead hand is the LEFT). */
export const SNAP_KEYS = Object.freeze({
  // the lead hand straight out from the guard
  jab: [
    [0.5, hd({ lH: [0.02, 0.05, 0.27], yaw: -0.5, bY: -0.17 })],
    [0.75, hd({ lH: [0.0, 0.05, 0.42], yaw: -0.6, bZ: 0.04, e: 'i' })],
    [1.0, hd({ lH: [-0.04, 0.03, 0.56], lP: [0.8, -0.3, -0.4], yaw: -0.72, bZ: 0.1, bY: -0.2, pitch: 0.08, spY: -0.1, e: 'l' })],
    [1.6, hd({ lH: [-0.02, 0.05, 0.42], lP: [0.8, -0.5, -0.25], yaw: -0.6, bZ: 0.06, e: 'o' })],
    [2.0, hd({ lH: [0.0, 0.07, 0.34], yaw: -0.5, bZ: 0.02 })],
  ],
  // the rear fist turned over short and level, the hips snapping round behind it
  hook: [
    [0.5, hd({ rH: [-0.16, 0.06, 0.16], rP: [-0.9, 0.1, -0.3], yaw: -0.58, hip: -0.12 })],
    [0.75, hd({ rH: [0.0, 0.06, 0.34], rP: [-0.8, 0.4, 0.0], yaw: -0.1, hip: 0.04, e: 'i' })],
    [1.0, hd({ rH: [0.26, 0.04, 0.42], rP: [-0.6, 0.5, 0.2], yaw: 0.5, hip: 0.2, spY: 0.1, bZ: 0.08, roll: -0.05, e: 'l' })],
    [1.6, hd({ rH: [0.16, 0.05, 0.3], rP: [-0.7, 0.2, -0.1], yaw: 0.25, hip: 0.1, bZ: 0.05, e: 'o' })],
    [2.0, hd({ rH: [0.12, 0.06, 0.24], yaw: -0.2 })],
  ],
  // the back of the right hand flicked out across him (Halcyon's contempt: barely a blow)
  flick: [
    [0.5, hd({ rH: [0.2, -0.16, 0.16], rP: [-0.6, 0.1, 0.5], yaw: 0.3 })],
    [0.75, hd({ rH: [0.0, -0.1, 0.34], rP: [-0.8, 0.2, 0.1], yaw: 0.0, e: 'i' })],
    [1.0, hd({ rH: [-0.24, -0.1, 0.5], rP: [-0.9, 0.2, -0.2], yaw: -0.5, bZ: 0.06, pitch: 0.06, e: 'l' })],
    [1.6, hd({ rH: [-0.2, -0.1, 0.36], rP: [-0.9, -0.1, -0.3], yaw: -0.35, e: 'o' })],
    [2.0, hd({ rH: [-0.08, -0.3, 0.16], yaw: -0.15 })],
  ],
});

/** The switch's options (the Lab's LOOKS row). */
export const MOTION_OPTS = Object.freeze(['0', 'a']);
/** (ANK for the flier's legs: halcyon/motion.js) */
export { ANK };
