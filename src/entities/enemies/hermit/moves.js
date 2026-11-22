import { TELL } from '../../../combat/rules.js';
import { DIM } from '../../player/model.js';
import { makeRealise } from '../duelist/realise.js';
import { PHASE_POSES, PALM_UP, PALM_FLAT, BEHIND } from './poses.js';
import { TUNING } from './tuning.js';

// Gu Shan's moves and reaction clips, as data (the duelist's format: ashDisciple/moves.js header,
// duelist/realise.js; bare hands as Tian Lei's, ascendant/moves.js). EVERY BLOW KILLS (ADR-139): each
// beat's `damage` is the bar (160, the hero's whole health; hermit.js passes `lethal` with it), so the
// numbers that matter are the tells: every windup at least TUNING.minFirstWindup in every phase, a
// bait hold at the cock that is never the same, impacts at least TUNING.minHitGap apart, the flare
// TUNING.flashLead before the impact (tests/integration/hermit.mjs DATA, TIMING).
//
// His own beat fields (hermit.js; the engine's are in duelist/brain.js):
//   part: 'fistR' | 'fistL' | 'palms' | 'feet'   the limb his "blade" is (the glint, the trail, a parry's contact)
//   step: { r }   at the windup's start he is gone and stands `r` m off the hero, then winds up
//                 (One Step, Closing Mountains: an afterimage where he stood)
//   wind: true    (engine, ADR-138) a line blow the first cover between him and the hero stops: the
//                 cover takes T.world.wind and the hero behind it is untouched (brain._coverFor)
//   carry         hermit.js onImpact: what the force does past the zone ('palm', 'lane', 'crater',
//                 'stamp', 'clap')
//   release: { style: 'fissure', fan: [n per phase] }   Split Earth: fissures in the crescent pool
// A move's `weight` is per PHASE [1, 2, 3] (0 = not in that phase). Exactly one black move.

const N = TELL.NORMAL, B = TELL.BLUE, R = TELL.RED, K = TELL.BLACK;
const ANK = DIM.ankle;
const DMG = 160; // the bar: an unanswered blow is the whole of the hero's life (the lethal rule decides)

// ---------------------------------------------------------------- pose helpers
// (body space: +x his LEFT, +y up, +z forward; hands = offsets from each shoulder; feet model space
// [x, z] on the floor or [x, y, z]; the left hand is left out of a one-hand blow: it stays where his
// stance holds it, behind his back in phases 1 - 2, out in phase 3)
const NEUTRAL = {
  bX: 0, bZ: 0, pitch: 0, roll: 0, hip: 0, hipZ: 0, hipX: 0, spX: 0, spY: 0, spZ: 0, hdX: 0.06, hdZ: 0,
  flat: 0.95, rK: [-0.25, 0, 1], lK: [0.4, 0, 0.9], rFy: -0.15, lFy: 0.5, swF: PALM_FLAT, sw: PALM_UP,
  rP: [-0.8, -0.6, -0.2],
};
/** A key's pose: the neutral fields, then the pose; the head turned back onto the opponent. */
function F(p) {
  const out = { ...NEUTRAL, ...p };
  if (p.hdY === undefined) out.hdY = -((p.yaw ?? 0) + (p.spY ?? 0)) * 0.85;
  return out;
}
const NEG = ['bX', 'yaw', 'roll', 'hip', 'hipZ', 'spY', 'spZ', 'hdY', 'hdZ'];
const PAIRS = [['rH', 'lH'], ['rP', 'lP'], ['rK', 'lK'], ['rF', 'lF']];
const flipX = (v) => (Array.isArray(v) ? [-v[0], ...v.slice(1)] : v);
/** The mirror image of a pose (his left side for his right). */
function mirror(p) {
  const o = { ...p };
  for (const k of NEG) if (k in p) o[k] = -p[k];
  for (const [a, b] of PAIRS) {
    if (a in p || b in p) {
      o[a] = flipX(p[b] ?? NEUTRAL[b]);
      o[b] = flipX(p[a] ?? NEUTRAL[a]);
    }
  }
  if ('rFy' in p || 'lFy' in p) {
    o.rFy = -(p.lFy ?? NEUTRAL.lFy);
    o.lFy = -(p.rFy ?? NEUTRAL.rFy);
  }
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}
const v3 = (p) => (p.length === 2 ? [p[0], ANK, p[1]] : p);
/** A key between two key poses at k (every field), the feet that move between them lifted 0.1 m. */
function stepMid(a, b, k) {
  const o = {};
  for (const f of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (f === 'e') continue;
    const x = a[f] ?? b[f], y = b[f] ?? a[f];
    if (f === 'rF' || f === 'lF') {
      const p = v3(x), q = v3(y), d = Math.hypot(q[0] - p[0], q[2] - p[2]);
      o[f] = [p[0] + (q[0] - p[0]) * 0.5, (p[1] + q[1]) * 0.5 + (d > 0.12 ? 0.1 : 0), p[2] + (q[2] - p[2]) * 0.5];
    } else if (Array.isArray(x)) o[f] = x.map((v, i) => v + ((y[i] ?? v) - v) * k);
    else if (typeof x === 'number') o[f] = x + (y - x) * k;
    else o[f] = y;
  }
  return o;
}
/** A hand pulled `k` of the way back toward `g` (a follow-through). */
const back = (v, g, k) => v.map((x, i) => x + (g[i] - x) * k);
/** The follow-through: the striking hand(s) drawn back a little, the rest held. */
function follow(hit, k = 0.2) {
  const o = { ...hit };
  if (hit.rH) o.rH = back(hit.rH, [0.04, -0.06, 0.34], k);
  if (hit.lH) o.lH = back(hit.lH, [-0.02, -0.06, 0.38], k);
  return o;
}

/**
 * A blow's keys. He is slow and plain: (pre) the weight settles, (cock) the coil, held through the bait
 * hold, (1.0) the strike, easing in like a blow that accelerates, (1.6 - 2.0) a long follow-through:
 * he stays in it (his recovery is the punish window).
 */
function strikeKeys({ coil, hit, after = null, pre = null, cock = 0.75, left = false }) {
  const m = left ? mirror : (p) => p;
  const fo = after ?? follow(hit);
  const keys = [];
  if (pre) keys.push([cock * 0.4, F(m(pre))]);
  const c = F(m(coil)), h = F(m(hit));
  keys.push([cock, c]);
  keys.push([cock + (1 - cock) * 0.5, { ...stepMid(c, h, 0.22), e: 'i' }]);
  keys.push([1.0, { ...h, e: 'l' }]);
  keys.push([1.6, { ...F(m(fo)), e: 'o' }]);
  keys.push([2.0, F(m(fo))]);
  return keys;
}

// ---------------------------------------------------------------- the blows (right-side authoring)
const BLOW = {
  // Mountain-Moving Palm: the palm drawn back to the hip on a long coil, thrown out on a lunge
  palm: {
    part: 'fistR',
    pre: { bY: -0.16, yaw: 0.1, hip: 0.0, rH: [0.06, -0.2, 0.2], rP: [-0.8, -0.5, -0.4] },
    coil: { yaw: -0.5, bY: -0.3, pitch: 0.04, hip: -0.22, spY: -0.06, rH: [0.02, -0.26, -0.06], rP: [-0.8, -0.4, -0.6], sw: [0.1, 1.15], rF: [-0.18, -0.06], lF: [0.18, 0.2], rK: [-0.4, 0, 0.9], lK: [0.4, 0, 0.9], rFy: -0.4, lFy: 0.3 },
    hit: { yaw: 0.6, bY: -0.32, bZ: 0.18, pitch: 0.12, hip: 0.26, spY: 0.08, rH: [0.12, 0.02, 0.55], rP: [-0.8, -0.5, -0.2], sw: [0.1, 1.3], rF: [-0.18, 0.62], lF: [0.2, -0.36], rK: [-0.2, 0, 1], lK: [0.4, -0.2, 0.9], rFy: -0.1, lFy: 0.6 },
  },
  // Peak Falls: the arm raised high over his head, a hammer fist brought down into the floor before him
  peak: {
    part: 'fistR',
    pre: { bY: -0.04, pitch: -0.04, rH: [0.06, 0.2, 0.18], rP: [-0.8, 0.2, -0.4] },
    coil: { bY: 0.0, pitch: -0.16, spX: -0.1, yaw: 0.22, hdX: -0.12, rH: [0.04, 0.52, 0.02], rP: [-0.7, 0.5, -0.5], sw: [0.0, 1.5] },
    hit: { bY: -0.56, pitch: 0.55, spX: 0.24, hdX: 0.34, yaw: 0.1, rH: [0.12, -0.3, 0.5], rP: [-0.7, -0.2, -0.3], sw: [0.0, -0.4], rF: [-0.2, 0.44], lF: [0.22, -0.3], rK: [-0.3, 0.3, 0.9], lK: [0.4, -0.5, 0.8], flat: 0.8 },
  },
  // The One Blow: he sinks, the fist drawn to his hip; the air goes still; a plain straight punch
  one: {
    part: 'fistR',
    pre: { bY: -0.2, yaw: -0.1, hip: -0.06, rH: [0.04, -0.22, 0.12], rP: [-0.8, -0.5, -0.5], sw: [0.05, 0.6] },
    coil: { yaw: -0.72, bY: -0.38, pitch: 0.05, hip: -0.32, spY: -0.1, hdY: 0.6, rH: [0.0, -0.24, -0.12], rP: [-0.7, -0.4, -0.7], sw: [0.0, 0.05], rF: [-0.22, -0.18], lF: [0.22, 0.34], rK: [-0.5, 0, 0.8], lK: [0.5, 0, 0.85], rFy: -0.6, lFy: 0.2 },
    hit: { yaw: 0.36, bY: -0.35, bZ: 0.16, pitch: 0.1, hip: 0.3, spY: 0.1, hdY: -0.32, rH: [0.1, 0.06, 0.55], rP: [-0.9, -0.3, -0.2], sw: [0.05, 0.0], rF: [-0.2, -0.22], lF: [0.22, 0.4], rK: [-0.5, 0, 0.85], lK: [0.4, 0, 0.9], rFy: -0.4, lFy: 0.3 },
  },
  // Idle Finger: two fingers raised, flicked at the hero across the ledge
  finger: {
    part: 'fistR',
    coil: { yaw: 0.0, bY: -0.06, rH: [0.06, 0.14, 0.2], rP: [-0.8, -0.3, -0.4], sw: [0.4, 1.0] },
    hit: { yaw: 0.36, bY: -0.08, rH: [0.1, 0.1, 0.5], rP: [-0.8, -0.4, -0.2], sw: [0.0, 0.2] },
  },
  // Reproach: out of the palm's ward, the back of the hand swept across
  reproach: {
    part: 'fistR',
    coil: { yaw: -0.5, bY: -0.12, rH: [0.3, 0.06, 0.22], rP: [-0.6, 0.2, 0.5], sw: [0.9, 0.9] },
    hit: { yaw: 0.55, bY: -0.14, bZ: 0.08, rH: [-0.3, 0.02, 0.46], rP: [-0.9, 0.2, -0.2], sw: [-0.9, 0.9], rF: [-0.16, 0.36], lF: [0.18, -0.2] },
  },
  // Two Peaks' first: the arm swung wide and low round him, a backfist at the shins
  low: {
    part: 'fistR',
    coil: { yaw: 1.0, bY: -0.3, pitch: 0.18, rH: [0.34, -0.3, 0.14], rP: [-0.6, -0.2, 0.6], sw: [1.4, -0.2], rF: [-0.2, 0.1], lF: [0.22, -0.1] },
    hit: { yaw: -0.7, bY: -0.44, pitch: 0.3, rH: [-0.4, -0.36, 0.3], rP: [-0.9, 0.0, -0.2], sw: [-1.4, -0.3], rF: [-0.26, 0.3], lF: [0.26, -0.22], rK: [-0.5, 0, 0.8], lK: [0.5, -0.3, 0.8] },
  },
  // One Step's strike: a short palm pushed into the hero from close
  short: {
    part: 'fistR',
    coil: { yaw: -0.3, bY: -0.2, rH: [0.04, -0.12, 0.08], rP: [-0.8, -0.5, -0.5] },
    hit: { yaw: 0.4, bY: -0.24, bZ: 0.12, pitch: 0.08, rH: [0.1, 0.0, 0.5], sw: [0.1, 1.3], rF: [-0.16, 0.42], lF: [0.2, -0.24] },
  },
  // Split Earth: the palm raised, slammed flat onto the floor
  split: {
    part: 'fistR',
    coil: { bY: -0.1, pitch: -0.1, rH: [0.06, 0.32, 0.12], rP: [-0.8, 0.3, -0.4], sw: [0.0, 0.4] },
    hit: { bY: -0.6, pitch: 0.5, hdX: 0.3, rH: [0.1, -0.42, 0.42], sw: [0.0, -0.1], rF: [-0.22, 0.36], lF: [0.22, -0.3], lK: [0.4, -0.6, 0.7], flat: 0.8 },
  },
  // the hook (Heaven and Earth's second): the right hand swung round level at the head
  hook: {
    part: 'fistR',
    coil: { yaw: -0.7, bY: -0.22, rH: [-0.24, 0.06, 0.18], rP: [-0.9, 0.1, -0.3] },
    hit: { yaw: 0.6, bY: -0.24, bZ: 0.1, rH: [0.28, 0.02, 0.46], rP: [-0.6, 0.5, 0.2], rF: [-0.2, 0.2], lF: [0.22, -0.12] },
  },
  // both fists raised over the head, brought down together onto the floor
  hammer: {
    part: 'palms',
    coil: { bY: -0.04, pitch: -0.14, spX: -0.08, rH: [0.16, 0.5, 0.1], lH: [-0.16, 0.5, 0.1], rP: [-0.7, 0.5, -0.4], lP: [0.7, 0.5, -0.4], sw: [0, 1.5] },
    hit: { bY: -0.5, pitch: 0.44, spX: 0.2, hdX: 0.3, rH: [0.14, -0.24, 0.46], lH: [-0.14, -0.24, 0.46], rP: [-0.7, -0.2, -0.3], lP: [0.7, -0.2, -0.3], sw: [0, -0.4], rF: [-0.28, 0.3], lF: [0.28, -0.3], rK: [-0.5, 0.2, 0.8], lK: [0.5, 0.2, 0.8] },
  },
  // Closing Mountains: the arms flung wide, both palms clapped shut before him
  clap: {
    part: 'palms',
    coil: { bY: -0.2, pitch: -0.04, rH: [-0.52, 0.1, 0.08], lH: [0.52, 0.1, 0.08], rP: [-0.6, 0.3, -0.6], lP: [0.6, 0.3, -0.6], sw: [-0.9, 0.9] },
    hit: { bY: -0.26, bZ: 0.16, pitch: 0.12, rH: [0.14, 0.04, 0.5], lH: [-0.14, 0.04, 0.5], rP: [-0.8, -0.3, -0.2], lP: [0.8, -0.3, -0.2], sw: [0.1, 1.2], rF: [-0.24, 0.3], lF: [0.24, -0.2] },
  },
};
const PART_MIRROR = { fistR: 'fistL', fistL: 'fistR' };

/**
 * One blow. `kind`: a BLOW name; `o`: { left (the mirror: the other hand), cock, ...beat overrides }.
 * Every blow is the bar's damage; its knock-back is the lethal rule's (a Last Breath throws 10 m).
 */
function blow(kind, tell, windup, zone, o = {}) {
  const P = BLOW[kind];
  if (!P) throw new Error(`hermit: no blow "${kind}"`);
  const { left = false, cock = 0.75, ...extra } = o;
  return {
    tell, windup, active: 0.1, damage: DMG, knockback: 2.5, knockdown: true, zone,
    part: left ? PART_MIRROR[P.part] ?? P.part : P.part,
    keys: strikeKeys({ coil: P.coil, hit: P.hit, pre: P.pre ?? null, cock, left }), ...extra, cock,
  };
}

// ---------------------------------------------------------------- the transitions (scripted)
const STAND = { bY: -0.08, pitch: 0.05, yaw: 0.0, hip: 0, spX: 0.06, hdX: 0.08, rH: [0.04, -0.06, 0.34], rF: [-0.16, 0.06], lF: [0.17, -0.06] };
/** THE MOUNTAIN ANSWERS (phase 2): the right knee drawn up to his chest, held, and stamped down: the
 *  floor heaves round him (a ring of 6.5 m) and the inner stones crack. */
function mountainAnswers() {
  return {
    label: 'The Mountain Answers', phase: 2, weight: 0, transition: true, cooldown: 0, band: [0, 99], recovery: 1.0,
    beats: [{
      tell: R, windup: 2.0, fixed: true, active: 0.15, damage: DMG, knockback: 3, knockdown: true,
      zone: { kind: 'ring', r: 6.5 }, ring: 6.5, part: 'feet', track: 0, close: 0, carry: 'stamp', cock: 0.9,
      keys: [
        [0.0, F({ ...STAND, ...BEHIND })],
        [0.3, F({ ...STAND, ...BEHIND, bY: -0.14, hdX: 0.2 })],
        // the knee comes up slowly, the palm out before him for balance
        [0.62, F({ bY: -0.02, pitch: -0.04, yaw: 0.1, rF: [-0.14, 0.62, 0.2], rK: [0, 0.7, 1], lF: [0.15, -0.02], lK: [0.2, 0, 1], rH: [0.06, 0.0, 0.42], ...BEHIND, hdX: -0.04 })],
        [0.9, F({ bY: 0.02, pitch: -0.06, yaw: 0.1, rF: [-0.14, 0.72, 0.22], rK: [0, 0.8, 1], lF: [0.15, -0.02], lK: [0.2, 0, 1], rH: [0.06, 0.04, 0.44], ...BEHIND, hdX: -0.08 })],
        // the stamp
        [1.0, { ...F({ bY: -0.32, pitch: 0.16, yaw: 0.1, rF: [-0.22, 0.24], rK: [-0.4, 0, 0.9], lF: [0.2, -0.12], lK: [0.4, 0, 0.9], rH: [0.06, -0.16, 0.4], ...BEHIND, hdX: 0.2 }), e: 'i' }],
        [2.0, F({ bY: -0.18, pitch: 0.08, yaw: 0.2, rF: [-0.2, 0.24], lF: [0.2, -0.16], rH: [0.04, -0.04, 0.38], ...BEHIND, hdX: 0.1 })],
      ],
    }],
  };
}
/** BOTH HANDS (phase 3): the left hand comes out from behind his back; both arms flung wide, a clap:
 *  the air bursts out of it (a ring of 7 m) and the inner stones are felled outward. */
function bothHands() {
  return {
    label: 'Both Hands', phase: 3, weight: 0, transition: true, cooldown: 0, band: [0, 99], recovery: 1.0,
    beats: [{
      tell: R, windup: 2.0, fixed: true, active: 0.15, damage: DMG, knockback: 3, knockdown: true,
      zone: { kind: 'ring', r: 7 }, ring: 7, part: 'palms', track: 0, close: 0, carry: 'clap', cock: 0.9,
      keys: [
        [0.0, F({ ...STAND, ...BEHIND })],
        // the left hand brought round from behind his back, looked at
        [0.34, F({ ...STAND, bY: -0.1, hdX: 0.26, hdY: 0.3, lH: [0.06, -0.2, 0.26], lP: [0.8, -0.6, -0.2] })],
        [0.55, F({ ...STAND, bY: -0.12, hdX: 0.22, hdY: 0.1, lH: [0.0, -0.08, 0.34], lP: [0.8, -0.6, -0.2], rH: [0.0, -0.08, 0.34] })],
        // both arms flung wide, the chest open
        [0.9, F({ bY: -0.14, pitch: -0.08, spX: -0.1, yaw: 0, hdX: -0.06, rH: [-0.52, 0.14, 0.04], lH: [0.52, 0.14, 0.04], rP: [-0.6, 0.3, -0.6], lP: [0.6, 0.3, -0.6], rF: [-0.26, 0.04], lF: [0.26, -0.04], rK: [-0.5, 0, 0.85], lK: [0.5, 0, 0.85], sw: [-0.9, 0.9] })],
        // the clap
        [1.0, { ...F({ bY: -0.26, bZ: 0.1, pitch: 0.12, yaw: 0, hdX: 0.1, rH: [0.12, 0.04, 0.48], lH: [-0.12, 0.04, 0.48], rP: [-0.8, -0.3, -0.2], lP: [0.8, -0.3, -0.2], rF: [-0.26, 0.04], lF: [0.26, -0.04], rK: [-0.5, 0, 0.85], lK: [0.5, 0, 0.85], sw: [0.1, 1.2] }), e: 'i' }],
        [2.0, F({ bY: -0.2, pitch: 0.06, yaw: 0.06, rH: [0.08, 0.02, 0.34], lH: [-0.02, -0.04, 0.38], rP: [-0.8, -0.6, -0.2], lP: [0.8, -0.6, -0.2], rF: [-0.24, 0.08], lF: [0.24, -0.06] })],
      ],
    }],
  };
}

// ---------------------------------------------------------------- the moves
const W = (a, b, c) => [a, b, c];
/** The palm's line (its reach is a lunge: `close` steps him in through the windup). */
const PALM_LINE = () => ({ kind: 'line', r: 3.0, w: 1.1 });

export const MOVES = {
  // ---- phase 1: one blow at a time (four reads to learn)
  mountainPalm: {
    label: 'Mountain-Moving Palm', phase: 1, weight: W(2.2, 1.6, 1.2), cooldown: 2, band: [0, 6.2], recovery: 1.3,
    beats: [blow('palm', B, 1.35, PALM_LINE(), { flare: true, hold: [0.1, 0.5], close: 3.0, carry: 'palm', cock: 0.72 })],
  },
  fallingPeak: {
    label: 'Peak Falls', phase: 1, weight: W(2.0, 1.4, 1.1), cooldown: 2.5, band: [0, 5.6], recovery: 1.6,
    beats: [blow('peak', R, 1.5, { kind: 'ring', r: 3.6, fwd: 1.2 }, { hold: [0.15, 0.6], close: 2.4, carry: 'crater', track: 0.7, cock: 0.74 })],
  },
  oneBlow: {
    label: 'The One Blow', phase: 1, weight: W(1.0, 1.0, 1.0), cooldown: 14, band: [0, 14.2], recovery: 1.5,
    beats: [blow('one', K, 1.9, { kind: 'line', r: 14, w: 1.6 }, { fixed: true, hold: [0.1, 0.6], close: 0, cock: 0.88, track: 0.85, wind: true, carry: 'lane', active: 0.12 })],
  },
  idleFinger: {
    label: 'Idle Finger', phase: 1, weight: W(1.2, 1.2, 1.0), cooldown: 3, band: [7, 12.2], recovery: 0.7,
    beats: [blow('finger', N, 1.25, { kind: 'line', r: 12, w: 0.5 }, { hold: [0, 0.3], close: 0, wind: true, track: 0.85, active: 0.06, cock: 0.7 })],
  },
  // his counter out of the palm's ward (counterChance guarded cuts): never picked on its own
  reproach: {
    label: 'Reproach', phase: 1, weight: 0, counter: true, cooldown: 0, band: [0, 99], recovery: 1.0,
    beats: [blow('reproach', N, 1.0, { kind: 'sector', r: 2.4, ang: 1.2 }, { fixed: true, close: 0.8, cock: 0.7 })],
  },

  // ---- phase 2: two blows that ask two answers, and the ground itself
  twinPeaks: {
    label: 'Two Peaks', phase: 2, weight: W(0, 1.6, 1.2), cooldown: 3, band: [0, 5], recovery: 1.4,
    beats: [
      blow('low', R, 1.3, { kind: 'sector', r: 3.0, ang: 2.6 }, { hold: [0, 0.3], close: 2.0, cock: 0.72 }),
      blow('palm', B, 1.1, PALM_LINE(), { flare: true, close: 1.6, carry: 'palm', cock: 0.7 }),
    ],
  },
  oneStep: {
    label: 'One Step', phase: 2, weight: W(0, 1.4, 1.2), cooldown: 4, band: [6, 18], recovery: 1.0, gapCloser: true,
    beats: [blow('short', N, 1.25, { kind: 'sector', r: 2.4, ang: 1.0 }, { step: { r: 2.2 }, close: 0, cock: 0.7 })],
  },
  splitEarth: {
    label: 'Split Earth', phase: 2, weight: W(0, 1.3, 1.2), cooldown: 5, band: [3, 18], recovery: 1.2,
    beats: [{ ...blow('split', R, 1.25, null, { hold: [0.1, 0.4], close: 0, cock: 0.72, track: 0.9 }), zone: undefined, release: { style: 'fissure', fan: [1, 1, 3] } }],
  },

  // ---- phase 3: both hands, three-blow strings
  heavenEarth: {
    label: 'Heaven and Earth', phase: 3, weight: W(0, 0, 1.8), cooldown: 4, band: [0, 5], recovery: 1.6,
    beats: [
      blow('palm', B, 1.25, PALM_LINE(), { left: true, flare: true, close: 2.4, carry: 'palm', cock: 0.72 }),
      blow('hook', N, 1.15, { kind: 'sector', r: 2.6, ang: 1.1 }, { close: 1.2, cock: 0.7 }),
      blow('hammer', R, 1.1, { kind: 'ring', r: 3.6, fwd: 0.8 }, { close: 1.0, carry: 'crater', cock: 0.74 }),
    ],
  },
  closingMountains: {
    label: 'Closing Mountains', phase: 3, weight: W(0, 0, 1.5), cooldown: 4, band: [0, 14], recovery: 1.4, gapCloser: true,
    beats: [blow('clap', R, 1.25, { kind: 'sector', r: 3.4, ang: 0.9 }, { step: { r: 2.4 }, hold: [0.1, 0.4], close: 0, carry: 'clap', cock: 0.74 })],
  },

  // ---- the transitions
  mountainAnswers: mountainAnswers(),
  bothHands: bothHands(),
};
export const MOVE_NAMES = Object.keys(MOVES);
export const TRANSITIONS = Object.freeze({ 2: 'mountainAnswers', 3: 'bothHands' });
export const COUNTER = 'reproach';

// ---------------------------------------------------------------- reaction clips (no hits)
// His guard is his bare PALM (the engine's guard keys, duelist/guard.js): `wardHold` the palm raised
// open before his face; `ward` / `wardR` the palm turned to the side the cut comes from; `wardHigh`
// the palm over his head; `deflect` two fingers catch the blade and turn it aside (the counter
// follows); `clash` as a ward. In phases 1 - 2 the left hand stays behind his back.
const PALM_L = { yaw: 0.0, bY: -0.12, bZ: -0.04, hdY: 0.2, rH: [0.2, 0.18, 0.34], rP: [-0.7, -0.4, 0.2], sw: [0.5, 1.2] };
const PALM_R = { yaw: 0.4, bY: -0.12, bZ: -0.04, hdY: -0.2, rH: [-0.14, 0.16, 0.34], rP: [-0.9, -0.4, -0.1], sw: [-0.3, 1.2] };
const PALM_HIGH = { yaw: 0.2, bY: -0.16, pitch: -0.06, hdX: -0.1, rH: [0.06, 0.44, 0.24], rP: [-0.8, 0.2, -0.3], sw: [0.1, 1.5] };
const HOLD = { yaw: 0.2, bY: -0.1, hdY: -0.1, rH: [0.06, 0.18, 0.36], rP: [-0.8, -0.5, -0.1], sw: PALM_UP };
const CATCH = { yaw: 0.5, bY: -0.12, bZ: 0.06, hdY: -0.3, rH: [-0.06, 0.12, 0.48], rP: [-0.9, -0.3, -0.2], sw: [-0.5, 0.6] };
const met = (Wd, dur = 0.34) => ({
  dur, hold: true,
  keys: [
    [0, { ...Wd }],
    [0.07, { e: 'o', ...Wd, bZ: (Wd.bZ ?? 0) - 0.1, bY: Wd.bY - 0.03, pitch: (Wd.pitch ?? 0) - 0.06 }],
    [0.2, { ...Wd, bZ: (Wd.bZ ?? 0) - 0.02 }],
  ],
});
/** On one knee, the palm on the floor, the head bowed (a posture break). */
const KNEEL = { bY: -0.52, pitch: 0.24, spX: 0.1, hdX: 0.5, yaw: 0, rF: [-0.12, 0.32], lF: [0.17, -0.42], rK: [0, 0, 1], lK: [0.1, -0.85, 0.5], flat: 0.7 };
/** He waits: his back to the path (the root faces the stone), the right palm laid on the stone. */
const AT_STONE = {
  bY: -0.04, bZ: 0.02, pitch: 0.06, yaw: 0, roll: 0, hip: 0, spX: 0.08, spY: 0, hdX: 0.18, hdY: 0,
  rH: [0.04, 0.02, 0.5], rP: [-0.8, -0.6, -0.2], ...BEHIND,
  rF: [-0.15, 0.02], lF: [0.15, -0.02], rK: [-0.1, 0, 1], lK: [0.1, 0, 1], rFy: -0.15, lFy: 0.15, flat: 1, sw: [0.0, 1.0],
};

export const CLIPS = {
  ward: met(PALM_L),
  wardR: met(PALM_R),
  wardHigh: met(PALM_HIGH, 0.38),
  clash: met(PALM_L, 0.26),
  deflect: { dur: 0.26, keys: [[0, { ...PALM_L, bZ: 0.0 }], [0.07, { e: 'o', ...CATCH }], [0.18, { ...CATCH, bZ: 0.04 }]] },
  wardHold: { dur: 1, hold: true, keys: [[0, { ...HOLD }]] },
  flinch: { dur: 0.26, keys: [[0.07, { e: 'o', spX: -0.08, hdX: -0.12, bZ: -0.04, yaw: 0.1 }]] },
  backstep: {
    dur: 0.46,
    keys: [
      [0.12, { bY: -0.08, pitch: -0.08, rF: [-0.16, 0.1, -0.1], lF: [0.16, 0.14, 0.1], rK: [-0.2, 0.2, 1], lK: [0.2, 0.2, 1], flat: 0.3 }],
      [0.42, { bY: -0.12, pitch: 0.04, rF: [-0.15, 0.2], lF: [0.17, -0.16], flat: 0.95 }],
    ],
  },
  sidestep: {
    dur: 0.4,
    keys: [
      [0.12, { bY: -0.1, roll: 0.1, rF: [-0.2, 0.1, -0.1], lF: [0.2, 0.14, 0.1], rK: [-0.2, 0.2, 1], lK: [0.2, 0.2, 1], flat: 0.4 }],
      [0.3, { bY: -0.12, roll: 0.02, rF: [-0.15, 0.2], lF: [0.17, -0.16], flat: 0.9 }],
    ],
  },
  stagger: {
    dur: 0.8,
    keys: [
      [0.12, { e: 'o', pitch: -0.2, bZ: -0.1, bY: -0.14, rH: [-0.2, -0.1, 0.16], hdX: -0.2, rF: [-0.16, -0.3], lF: [0.2, 0.1] }],
      [0.5, { pitch: -0.08, bY: -0.16, rH: [-0.1, -0.12, 0.24] }],
    ],
  },
  // his blow parried: the hand knocked up and away, a step back
  recoil: {
    dur: 1.0,
    keys: [
      [0.1, { e: 'o', pitch: -0.22, bZ: -0.1, yaw: -0.4, rH: [-0.2, 0.32, 0.14], rP: [-0.8, 0.4, -0.4], hdX: -0.2, rF: [-0.18, -0.36], lF: [0.2, 0.08] }],
      [0.6, { pitch: -0.1, yaw: -0.3, rH: [-0.1, 0.1, 0.22] }],
    ],
  },
  reeling: {
    dur: 1.45,
    keys: [
      [0.12, { e: 'o', pitch: -0.32, bZ: -0.14, bY: -0.12, yaw: -0.3, rH: [-0.34, 0.08, 0.06], rP: [-0.9, 0.3, -0.3], hdX: -0.3, rF: [-0.12, 0.05], lF: [0.2, -0.5] }],
      [0.6, { pitch: -0.18, bY: -0.2, yaw: -0.1, rH: [-0.3, -0.05, 0.14], hdX: -0.1, rF: [-0.14, -0.15], lF: [0.18, -0.45] }],
      [1.1, { pitch: -0.05, bY: -0.16, rH: [-0.1, -0.1, 0.26] }],
    ],
  },
  trampled: {
    dur: 1.5,
    keys: [
      [0.1, { e: 'o', pitch: 0.4, bY: -0.32, bZ: 0.1, rH: [0.06, -0.36, 0.46], hdX: 0.42, rF: [-0.08, -0.46], lF: [0.22, 0.66] }],
      [1.0, { e: 'o', pitch: -0.18, bY: -0.16, bZ: -0.1, rH: [-0.2, 0.0, 0.18], hdX: -0.1, rF: [-0.18, -0.36], lF: [0.2, 0.08] }],
    ],
  },
  lock: {
    dur: 3, hold: true,
    keys: [
      [0.1, { e: 'o', bY: -0.22, bZ: 0.1, pitch: 0.12, yaw: 0.2, rH: [0.0, 0.16, 0.42], rP: [-0.8, -0.3, -0.2], rF: [-0.2, 0.36], lF: [0.2, -0.4], sw: PALM_UP }],
      [3, { bY: -0.24, bZ: 0.12, pitch: 0.14, yaw: 0.2, rH: [0.0, 0.16, 0.44], rF: [-0.2, 0.38], lF: [0.2, -0.42], sw: PALM_UP }],
    ],
  },
  broken: {
    dur: 4, hold: true,
    keys: [
      [0.25, { e: 'o', ...KNEEL, rH: [0.06, -0.52, 0.32], rP: [-0.7, -0.4, -0.3], sw: [0.2, -1.2] }],
      [3.7, { ...KNEEL, hdX: 0.4, rH: [0.06, -0.52, 0.32], sw: [0.2, -1.2] }],
      [4.0, { ...KNEEL, bY: -0.4, hdX: 0.2, rH: [0.04, -0.4, 0.3] }],
    ],
  },
  executed: {
    dur: 1.2, hold: true,
    keys: [
      [0.0, { ...KNEEL, rH: [0.06, -0.52, 0.32] }],
      [0.2, { e: 'o', ...KNEEL, pitch: -0.3, hdX: -0.36, bY: -0.45, rH: [-0.3, -0.2, 0.06] }],
      [0.75, { ...KNEEL, pitch: 0.3, hdX: 0.5, bY: -0.55, rH: [0.06, -0.52, 0.3] }],
      [1.2, { ...KNEEL, pitch: 0.26, hdX: 0.5, bY: -0.54, rH: [0.06, -0.52, 0.3] }],
    ],
  },
  // he bows: on one knee, the head down, the palm laid flat on the floor; then the ash
  death: {
    dur: 2.6, hold: true,
    keys: [
      [0.4, { e: 'o', ...KNEEL, pitch: 0.1, rH: [-0.1, -0.36, 0.2] }],
      [1.3, { ...KNEEL, pitch: 0.4, hdX: 0.6, rH: [0.04, -0.52, 0.36] }],
      [2.6, { bY: -0.8, pitch: 1.0, hdX: 0.4, rH: [0.0, -0.5, 0.4], rF: [-0.13, -0.5], lF: [0.13, -0.5], rK: [-0.05, -0.6, 0.8], lK: [0.05, -0.6, 0.8], flat: 0.1 }],
    ],
  },
  /** He waits: his palm on the stone. */
  meditate: { dur: 1, hold: true, keys: [[0, { ...AT_STONE }]] },
  /** The intro: he takes his palm from the stone and turns his head; he turns round (hermit.js turns
   *  his root), the left hand goes behind his back, and he beckons with two fingers. */
  intro: {
    dur: 2.6,
    keys: [
      [0, { ...AT_STONE }],
      [0.5, { ...AT_STONE, rH: [0.04, -0.02, 0.4], hdY: 0.0 }],
      [0.85, { ...AT_STONE, rH: [0.04, -0.18, 0.2], hdY: 0.9, hdX: 0.08 }],
      // (the turn: hermit.js swings his root round between 0.9 and 1.5 s)
      [1.5, { ...AT_STONE, rH: [0.04, -0.22, 0.14], hdY: 0.1, hdX: 0.06 }],
      // the beckon: the right hand up, palm to the sky, two fingers curled twice
      [1.85, { e: 'o', yaw: 0.2, bY: -0.06, hdY: -0.16, rH: [0.08, 0.04, 0.4], rP: [-0.8, -0.6, -0.2], ...BEHIND, sw: [0.3, 0.2] }],
      [2.05, { yaw: 0.2, bY: -0.06, hdY: -0.16, rH: [0.08, 0.08, 0.34], rP: [-0.8, -0.6, -0.2], ...BEHIND, sw: [0.3, 0.9] }],
      [2.25, { yaw: 0.2, bY: -0.06, hdY: -0.16, rH: [0.08, 0.04, 0.4], rP: [-0.8, -0.6, -0.2], ...BEHIND, sw: [0.3, 0.2] }],
      [2.45, { yaw: 0.2, bY: -0.06, hdY: -0.16, rH: [0.08, 0.08, 0.34], rP: [-0.8, -0.6, -0.2], ...BEHIND, sw: [0.3, 0.9] }],
    ],
  },
};

/** Compiled reaction clips, one set per phase (each round its phase's stance). */
export const CLIPS_BY_PHASE = PHASE_POSES.map((P) => {
  const out = Object.fromEntries(Object.entries(CLIPS).map(([k, c]) => [k, P.compileClip(c.keys.map(([t, pose]) => ({ t, ...pose })), c.dur, { hold: !!c.hold })]));
  for (const [k, c] of Object.entries(out)) c.name = k;
  return out;
});
/** (phase 1's set: the kit's default) */
export const CLIP = CLIPS_BY_PHASE[0];

// ---------------------------------------------------------------- realising a move
const REALISERS = PHASE_POSES.map((P) => makeRealise({ TUNING, MOVES, compileClip: (keys, dur) => P.compileClip(keys, dur), completeBeat: P.completeBeat }));
/** A move as it will play this time (duelist/realise.js), compiled round the stance of the phase it is
 *  used in; a transition round the NEW phase's stance, so it ends in that guard. */
export function realise(name, phase = 1, rnd = Math.random, opts = null) {
  const def = MOVES[name];
  if (!def) return null;
  const ph = def.transition ? def.phase : phase;
  return REALISERS[Math.min(REALISERS.length, Math.max(1, ph)) - 1](name, phase, rnd, opts);
}
