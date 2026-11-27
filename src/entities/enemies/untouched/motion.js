import { lookOf } from '../duelist/lookSwitch.js';
import { DIM } from '../../player/model.js';
import { TUNING_MELEE } from './tuningMelee.js';

// Bai Wuji's melee MOTION takes (round 3; the MOTION AGENT's file), behind the live look switch
// `?wjMotion=0|a|b|c` ('0' = his melee as it first shipped; the owner picked b, glide: lookSwitch PICKED).
// The owner (2026-11-26): his kicks and punches "do not look natural and look off"; "faster and cooler";
// "effortless, one-handed": the hands in his pockets most of phase 1 (short sharp kicks, a flick, a palm,
// blinks behind the hero), one hand out in phase 2, both in phase 3; fast snaps, no big wind-ups; long held
// poses only on the blue / red cues. Hand-keyed poses only (ADR-236).
//
// HOW A TAKE PLAYS (moves/melee.js): each melee move's `beats` and `recovery` are live getters that read
// the switch, so the realiser (duelist/realise.js) plays the take's beats from his next move. A take's beat
// is the shipped beat with (1) its pose keys rebuilt from this file's pose tables (by the beat's `mo`, the
// builder it came from, or its own kind: Dark Spark, the plant, the stomp, the lariat), (2) its windup and
// cock retimed (THE TIMING, below), (3) a string's later beat out of a short blink when the hero slid out of
// reach (`wjBlink.near`: moves/melee.js beatMotion skips the blink when he is still in reach), and (4)
// `wjHands`, the hands the blow uses ('R', 'L', 'RL'): THE HAND LAYER (poses.js wjHandsLayer) keeps the
// others in his pockets (phase 1 both, phase 2 the left, phase 3 none; pilot.wjPin, eased by the handler).
// Gameplay that does not move: every tell, zone, damage, knockback, root motion field but `close` /
// `wjBlink`, the impact's own fields. The engine's floors hold (veil.mjs DATA, MOTION).
//
// THE TIMING (per take, TAKES[t].time): a normal blow's windup is cut toward the engine's floors (the first
// real blow of a move >= minFirstWindup after the phase's scale, a later one so its impact stays >= minHitGap
// after the last), a blue / red one keeps most of its windup (the held pose IS the read); the cock moves late
// (`snap` of the windup left for the strike: contact a few frames after the release); recoveries x `rec`.
// THE HELD POSE (blue / red): reached by `heldAt` of the windup and held, tightening a few cm, to the cock.

const ANK = DIM.ankle;
export const MOTION_OPTS = Object.freeze(['0', 'a', 'b', 'c']);
/** The take being played ('0' = as shipped). */
export function wjMotionNow() {
  const v = lookOf('wjMotion', '0');
  return MOTION_OPTS.includes(v) ? v : '0';
}

// ---------------------------------------------------------------- the takes
/** Each take's numbers (THE TIMING above; `blink`: a string's later beat blinks to `at` round the hero when
 *  he is further than `near` m; `anim`: the animator's limb rules while it plays: legs that land straight,
 *  long arms, Xin Yi's numbers, ADR-221). */
export const TAKES = Object.freeze({
  a: {
    label: 'pocket kicks', heldAt: 0.3,
    time: { first: 0.42, next: 0.32, normalK: 0.8, heldK: 0.92, snapN: 0.2, snapH: 0.13, rec: 0.72 },
    blink: { near: 2.6, r: 1.65, u: 0.22, pattern: [0] },
  },
  b: {
    label: 'glide', heldAt: 0.28,
    time: { first: 0.42, next: 0.32, normalK: 0.8, heldK: 0.92, snapN: 0.18, snapH: 0.12, rec: 0.66 },
    // (every later beat of a string out of a blink, round the hero: his flank, behind, the other flank)
    blink: { near: 0, r: 1.6, u: 0.22, pattern: [1.5708, Math.PI, -1.5708, 0.7854, -0.7854] },
  },
  c: {
    label: 'turned away', heldAt: 0.3,
    time: { first: 0.42, next: 0.32, normalK: 0.8, heldK: 0.92, snapN: 0.2, snapH: 0.13, rec: 0.7 },
    blink: { near: 2.6, r: 1.65, u: 0.22, pattern: [0] },
  },
});
export const ANIM = Object.freeze({ legSoft: [0.95, 0.998], armSoft: [0.95, 0.996], kickStretch: [0.62, 0.86, 0.3, 0.28, 0.5] });

// ---------------------------------------------------------------- the poses (right side; `left` mirrors)
// Body space as ascendant/moves.js: +x his LEFT, +y up, +z forward; hands = offsets from each shoulder;
// feet model space [x, y, z]. Every pose is a whole pose over his stance (WJ: the head on the hero).
const HIP_Y = DIM.pivot + DIM.pelvis[1] + DIM.hip[1]; // the hip joint's height standing straight (0.89 m)
const LEG = DIM.thigh + DIM.shin;
/** In his pockets (the pin layer keeps them there; authored too, so a pose reads the same without it). */
const PK = { rH: [0.065, -0.43, 0.05], rP: [-1, -0.1, -0.45], lH: [-0.065, -0.43, 0.05], lP: [1, -0.1, -0.45] };
/** Hands out and easy (a free hand in a kick: a little out for balance, never a boxer's guard). */
const EASY = { rH: [-0.06, -0.46, 0.1], rP: [-0.9, -0.1, -0.35], lH: [0.07, -0.44, 0.12], lP: [0.9, -0.1, -0.35] };
const EASY_OUT = { rH: [-0.16, -0.36, 0.08], rP: [-0.9, 0.1, -0.3], lH: [0.18, -0.34, 0.1], lP: [0.9, 0.1, -0.3] };
/** The standing leg (the left) planted under him for a kick: a little bent, the foot turned out `fy`. */
const STAND_L = (fy = 0.2, x = 0.1, z = 0.0) => ({ lF: [x, ANK, z], lK: [0.25, 0, 1], lFy: fy });
/** A kick's contact foot `k` x the leg from the hip (straight), along (dx, dy, dz) from it (model space). */
function legOut(yaw, bY, dir, k = 1.06) {
  const hx = -0.105 * Math.cos(yaw), hz = 0.105 * Math.sin(yaw), hy = HIP_Y + bY;
  const n = Math.hypot(...dir) || 1, L = LEG * k;
  return [hx + (dir[0] / n) * L, Math.max(ANK + 0.02, hy + (dir[1] / n) * L), hz + (dir[2] / n) * L];
}

/** The kicks, per style: { load?, held, red?, hit, re } (re: the leg drawn back, the chamber again). */
function kicks(style) {
  const lean = style === 'b' ? 1.25 : 1; // the glide whips a little further
  const K = {};
  // FRONT: the knee up to the belt, the foot snapped straight out at his belly, the body tall, leaning back
  // a hair over it; the head never moves
  K.front = {
    load: { yaw: -0.12, bY: -0.03, ...STAND_L(0.15), rF: [-0.13, ANK + 0.06, 0.0] },
    held: { yaw: -0.1, bY: -0.06, pitch: -0.05, ...STAND_L(0.15), rF: [-0.1, 0.55, 0.34], rK: [0, 1, 0.5], rFy: -0.2 },
    hit: { yaw: -0.04, bY: -0.06, pitch: -0.14 * lean, spX: -0.04, ...STAND_L(0.15), rF: legOut(-0.04, -0.06, [0, 0.2, 1]), rK: [0, 1, 0.2], rFy: -0.1 },
  };
  // SIDE: turned side-on, the knee drawn up across, the heel driven out along the hips, the body tilted
  // away only as far as the leg goes up (the blue cue chambered tall, the red one sunk and wound tighter)
  K.side = {
    load: { yaw: 0.6, bY: -0.04, ...STAND_L(0.8, 0.1, 0.0), rF: [-0.14, ANK + 0.06, 0.0] },
    held: { yaw: 1.15, roll: -0.06, bY: -0.07, pitch: -0.03, ...STAND_L(1.2, 0.1, -0.03), rF: [-0.04, 0.6, 0.14], rK: [-0.85, 0.45, 0.35], rFy: 0.2 },
    red: { yaw: 1.3, roll: -0.1, bY: -0.16, pitch: 0.06, ...STAND_L(1.3, 0.12, -0.06), lK: [0.4, 0, 1], rF: [0.0, 0.48, 0.04], rK: [-0.9, 0.35, 0.2], rFy: 0.3 },
    hit: { yaw: 1.42, roll: -0.2 * lean, bY: -0.08, pitch: 0.02, ...STAND_L(1.4, 0.1, -0.05), rF: legOut(1.42, -0.08, [0, 0.16, 1]), rK: [-0.95, 0.3, 0.15], rFy: 0.1 },
  };
  // ROUND: the hip turned over, the shin whipped round level at the ribs, the leg straight at the contact
  K.round = {
    load: { yaw: 0.25, bY: -0.04, ...STAND_L(0.6), rF: [-0.16, ANK + 0.06, -0.02] },
    held: { yaw: 0.55, roll: -0.08, bY: -0.08, ...STAND_L(0.9), rF: [-0.36, 0.56, 0.06], rK: [-0.6, 0.8, 0.4], rFy: -0.2 },
    hit: { yaw: 1.25, roll: -0.24 * lean, bY: -0.08, ...STAND_L(1.5), rF: legOut(1.25, -0.08, [0.18, 0.28, 1]), rK: [-0.4, 0.85, 0.35], rFy: 0.3 },
  };
  // AXE: the leg swung up straight over his head (the red cue: held up there), the heel down through the road
  K.axe = {
    load: { yaw: 0.2, bY: -0.04, ...STAND_L(0.3), rF: [-0.4, 0.55, 0.3], rK: [-0.6, 0.2, 0.6] },
    held: { yaw: -0.08, bY: -0.04, pitch: -0.2, spX: -0.06, ...STAND_L(0.2), rF: legOut(-0.08, -0.04, [-0.02, 0.86, 0.5]), rK: [0, 0, 1], rFy: -0.1 },
    hit: { yaw: -0.04, bY: -0.26, pitch: 0.2, hdX: 0.12, lF: [0.15, ANK, -0.18], lK: [0.25, 0, 1], lFy: 0.2, rF: [-0.1, ANK + 0.02, 0.8], rK: [0, 0, 1], rFy: -0.1 },
  };
  // KNEE: the knee driven up into the belly, the body upright, the hands where the phase keeps them
  K.knee = {
    load: { yaw: -0.2, bY: -0.03, ...STAND_L(0.15), rF: [-0.15, ANK + 0.05, -0.08] },
    held: { yaw: -0.2, bY: -0.06, ...STAND_L(0.15), rF: [-0.14, 0.3, -0.06], rK: [0, 0.6, 1] },
    hit: { yaw: -0.08, bY: -0.03, bZ: 0.06, pitch: -0.04, ...STAND_L(0.12), rF: [-0.1, 0.46, 0.2], rK: [0, 1, 0.6], rFy: -0.1 },
  };
  // BACK (take c): his back to the hero, the head over his shoulder, the heel driven straight back at him
  K.back = {
    load: { yaw: 1.6, bY: -0.04, ...STAND_L(1.8, 0.08, 0.0), rF: [-0.12, ANK + 0.05, 0.02] },
    held: { yaw: 2.6, bY: -0.1, pitch: 0.12, ...STAND_L(2.6, 0.06, -0.04), rF: [-0.02, 0.42, 0.18], rK: [0, 0.4, -1], rFy: 2.6, hdY: 1.0 },
    red: { yaw: 2.7, bY: -0.18, pitch: 0.2, ...STAND_L(2.7, 0.08, -0.06), lK: [0.4, 0, -1], rF: [0.0, 0.36, 0.12], rK: [0, 0.3, -1], rFy: 2.7, hdY: 1.05 },
    hit: { yaw: 2.85, bY: -0.1, pitch: 0.26, ...STAND_L(2.8, 0.06, -0.1), rF: legOut(2.85, -0.1, [0, 0.12, 1]), rK: [0, 0.3, -1], rFy: 2.9, hdY: 0.95 },
  };
  // HOOK (take c's spinning heel): turned away, the leg out straight and swept back across at the head
  K.hook = {
    load: { yaw: 1.4, bY: -0.04, ...STAND_L(1.6), rF: [-0.14, ANK + 0.05, 0.0] },
    held: { yaw: 2.3, roll: 0.08, bY: -0.08, ...STAND_L(2.4), rF: [-0.1, 0.5, 0.0], rK: [-0.6, 0.6, -0.5], rFy: 2.2, hdY: 1.0 },
    hit: { yaw: 3.6, roll: 0.22, bY: -0.08, pitch: 0.06, ...STAND_L(3.4), rF: legOut(3.6, -0.08, [-0.4, 0.32, 1]), rK: [0.5, 0.8, 0.3], rFy: 3.4, hdY: 0.1 },
  };
  for (const k of Object.keys(K)) {
    const s = K[k];
    s.red ??= { ...s.held, bY: (s.held.bY ?? -0.06) - 0.08, pitch: (s.held.pitch ?? 0) + 0.06, lK: [0.4, 0, 1] };
    // the leg drawn back to the chamber after the contact (the knee stays up a moment)
    s.re ??= { ...s.held, bY: (s.held.bY ?? -0.06) + 0.02 };
  }
  return K;
}

/** The hand blows (the right hand; `left` mirrors): { held, red?, hit }. Upright: no lunge, the feet stay
 *  where they stand; the arm goes out long (ANIM.armSoft). */
const STAND_FT = { rF: [-0.15, ANK, -0.05], lF: [0.12, ANK, 0.08], rFy: -0.35, lFy: 0.15, rK: [-0.25, 0, 1], lK: [0.2, 0, 1] };
function hands(style) {
  const H = {};
  // PALM: the right palm drawn back by the hip, turned a little away, then out flat to the chest, the arm long
  H.palm = {
    load: { yaw: -0.3, ...STAND_FT, rH: [0.0, -0.36, 0.06], rP: [-0.8, -0.5, -0.5] },
    held: { yaw: -0.55, bY: -0.06, ...STAND_FT, rH: [0.0, -0.2, -0.05], rP: [-0.8, -0.6, -0.6] },
    red: { yaw: -0.7, bY: -0.14, pitch: 0.06, ...STAND_FT, rF: [-0.2, ANK, -0.16], lF: [0.15, ANK, 0.18], rH: [-0.02, -0.22, -0.1], rP: [-0.8, -0.6, -0.6] },
    hit: { yaw: 0.22, bY: -0.07, bZ: 0.06, pitch: 0.04, ...STAND_FT, rFy: -0.1, rH: [0.12, -0.02, 0.62], rP: [-0.8, -0.5, -0.3] },
  };
  // FLICK: the back of the right hand, two fingers out, flicked across from by his left shoulder: barely a blow
  H.flick = {
    load: { yaw: 0.2, ...STAND_FT, rH: [0.2, -0.2, 0.14], rP: [-0.6, 0.0, 0.5] },
    held: { yaw: 0.4, bY: -0.04, ...STAND_FT, rH: [0.32, 0.02, 0.16], rP: [-0.5, 0.2, 0.6] },
    hit: { yaw: -0.35, bY: -0.05, bZ: 0.04, ...STAND_FT, rH: [-0.3, 0.06, 0.52], rP: [-0.9, 0.2, -0.2] },
  };
  // POKE (the straight blows: jab, cross): two fingers straight out at the throat, the shoulder behind them
  H.poke = {
    load: { yaw: -0.3, ...STAND_FT, rH: [0.04, -0.1, 0.14], rP: [-0.8, -0.6, -0.3] },
    held: { yaw: -0.5, bY: -0.05, ...STAND_FT, rH: [0.02, 0.02, 0.06], rP: [-0.85, -0.3, -0.5] },
    hit: { yaw: 0.25, bY: -0.06, bZ: 0.05, ...STAND_FT, rFy: -0.1, rH: [0.12, 0.12, 0.62], rP: [-0.8, -0.3, -0.4] },
  };
  // RISING PALM (the uppercut): from low by the hip up under the chin
  H.rise = {
    load: { yaw: -0.25, bY: -0.06, ...STAND_FT, rH: [0.02, -0.4, 0.14], rP: [-0.8, -0.6, 0.0] },
    held: { yaw: -0.4, bY: -0.12, ...STAND_FT, rH: [0.02, -0.42, 0.16], rP: [-0.8, -0.6, 0.0] },
    hit: { yaw: 0.2, bY: -0.04, pitch: -0.06, ...STAND_FT, rH: [0.1, 0.28, 0.46], rP: [-0.8, -0.6, 0.3] },
  };
  // BOTH PALMS: drawn to the hips, out together into the chest, square on
  H.double = {
    load: { yaw: -0.08, ...STAND_FT, rH: [0.06, -0.3, 0.08], lH: [-0.06, -0.3, 0.08] },
    held: { yaw: -0.05, bY: -0.1, ...STAND_FT, rH: [0.06, -0.22, 0.0], lH: [-0.06, -0.22, 0.0], rP: [-0.8, -0.7, -0.4], lP: [0.8, -0.7, -0.4] },
    hit: { yaw: 0.0, bY: -0.1, bZ: 0.08, pitch: 0.06, ...STAND_FT, rH: [0.15, -0.04, 0.6], lH: [-0.15, -0.04, 0.6], rP: [-0.8, -0.4, -0.2], lP: [0.8, -0.4, -0.2] },
  };
  // REVERSE PALM (take c): his back half turned, the palm thrown back past his hip at the hero, looking over
  H.reverse = {
    load: { yaw: 1.2, ...STAND_FT, rH: [0.2, -0.3, 0.2], rP: [-0.6, -0.3, 0.6] },
    held: { yaw: 1.7, bY: -0.06, ...STAND_FT, rFy: 1.2, lFy: 1.6, rH: [0.28, -0.24, 0.24], rP: [-0.6, -0.3, 0.6], hdY: 1.1 },
    hit: { yaw: 1.85, bY: -0.07, ...STAND_FT, rFy: 1.3, lFy: 1.7, rH: [-0.6, -0.12, -0.1], rP: [-0.4, 0.3, -0.8], hdY: 1.25 },
  };
  if (style === 'c') H.flick = { ...H.flick, hit: { ...H.flick.hit, yaw: -0.6, hdY: 0.6 } };
  for (const k of Object.keys(H)) {
    const s = H[k];
    s.red ??= { ...s.held, bY: (s.held.bY ?? -0.05) - 0.08 };
    s.re ??= { ...s.held, ...(s.load ?? {}) };
  }
  return H;
}

// ---------------------------------------------------------------- which pose for which blow
/** (fam:kind of the shipped beat → the take's blow, and the hands it uses) */
const MAP = {
  a: {
    'kick:front': 'front', 'kick:side': 'side', 'kick:round': 'round', 'kick:axe': 'axe', 'kick:knee': 'knee',
    'punch:palm': 'palm', 'punch:jab': 'poke', 'punch:cross': 'poke', 'punch:hook': 'flick', 'punch:uppercut': 'rise', 'punch:double': 'double',
  },
  b: {
    'kick:front': 'front', 'kick:side': 'side', 'kick:round': 'round', 'kick:axe': 'axe', 'kick:knee': 'knee',
    'punch:palm': 'palm', 'punch:jab': 'flick', 'punch:cross': 'poke', 'punch:hook': 'flick', 'punch:uppercut': 'rise', 'punch:double': 'double',
  },
  c: {
    'kick:front': 'back', 'kick:side': 'side', 'kick:round': 'hook', 'kick:axe': 'axe', 'kick:knee': 'knee',
    'punch:palm': 'reverse', 'punch:jab': 'flick', 'punch:cross': 'reverse', 'punch:hook': 'flick', 'punch:uppercut': 'rise', 'punch:double': 'double',
  },
};
/** The shortest strike of each blow (s from the release out of the cock to the contact, in its fastest phase). */
const SNAP_MIN = { front: 0.08, side: 0.09, round: 0.11, axe: 0.12, knee: 0.08, back: 0.09, hook: 0.13, palm: 0.07, poke: 0.07, flick: 0.08, rise: 0.08, double: 0.08, reverse: 0.09, spark: 0.1, plant: 0.12, stomp: 0.1, own: 0.11 };
const KICK_PART = new Set(['front', 'side', 'round', 'axe', 'knee', 'back', 'hook']);

/**
 * The takes' beats, built once from the shipped moves (`base`: { name: move }) with the builders `X`
 * (moves.js X). Returns { a: { name: { beats, recovery } }, b: ..., c: ... }; a move with nothing to
 * retake (none today) keeps its own.
 */
export function makeTakes(base, X, TUNING) {
  const { F, mirror } = X;
  const STAND = X.FRAGS?.STAND ?? {};
  const out = {};
  const ws = TUNING?.windupScale ?? [1, 1, 1];
  const minFirst = TUNING?.minFirstWindup ?? 0.4, minGap = TUNING?.minHitGap ?? 0.34;
  for (const t of ['a', 'b', 'c']) {
    const T = TAKES[t], K = kicks(t), H = hands(t), M = MAP[t];
    /** A whole pose: his stance, then the pose; the head on the hero unless the pose turns it. */
    const WJ = (p, left) => {
      const q = { ...p };
      if (q.hdY === undefined) q.hdY = -((q.yaw ?? 0) + (q.spY ?? 0)) * 0.82;
      const full = { ...STAND, spY: 0, spZ: 0, hip: 0, hipZ: 0, hdX: -0.03, hdZ: 0.05, ...q };
      return left ? mirror(full) : full;
    };
    out[t] = {};
    for (const [name, def] of Object.entries(base)) {
      if (def.transition) continue;
      // the phase floor of this move's windups: the fastest phase it is used in (counters: all)
      const used = def.counter ? [1, 2, 3] : [1, 2, 3].filter((f) => (Array.isArray(def.weight) ? def.weight[f - 1] : def.weight) > 0);
      const scale = Math.min(...(used.length ? used : [1]).map((f) => ws[f - 1] ?? 1));
      let prevReal = null, blinkI = 0;
      const beats = def.beats.map((raw, i) => {
        const one = (b) => {
          if (b.feint) return { ...b, keys: b.keys, wjHands: '' };
          const nb = retake(b, { t, T, K, H, M, WJ, F, i, prevReal, scale, minFirst, minGap, blinkI, name });
          return nb;
        };
        // (a pick of a blue and a red blow draws the blue one two times in three: the faster normal blows
        // left phase 1's blue cues under 12 % of his cues, veil.mjs MIX)
        const alts = Array.isArray(raw.pick) ? raw.pick.map(one) : null;
        if (alts && alts.length === 2 && alts[0].tell === 'blue' && alts[1].tell === 'red') alts.splice(1, 0, alts[0]);
        const r = alts ? { ...raw, pick: alts } : one(raw);
        const real = Array.isArray(r.pick) ? r.pick[0] : r;
        if (!real.feint) {
          prevReal = real;
          if (i > 0) blinkI++;
        }
        return r;
      });
      out[t][name] = { beats, recovery: def.recovery * T.time.rec };
    }
  }
  return out;
}

/** The blow a shipped beat becomes in take t (null: its own keys, retimed). */
function blowOf(b, M) {
  const mo = b.mo;
  if (mo) return M[`${mo.fam}:${mo.kind}`] ?? null;
  return null;
}
/** Which hands a beat uses (THE HAND LAYER keeps the others pocketed). */
function handsOf(b, blow) {
  if (blow === 'double') return 'RL';
  if (blow && KICK_PART.has(blow)) return '';
  if (blow) return b.mo?.left ? 'L' : 'R';
  const p = b.part ?? '';
  if (b.wjSpark || p === 'fistR') return 'R';
  if (p === 'fistL') return 'L';
  if (p === 'palms') return 'RL';
  return '';
}

/** A pose between a and b at k (every field; a foot moving along the floor lifted a little). */
function mid(a, b, k) {
  const o = {};
  for (const f of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (f === 'e' || f === 'gather' || f === 'settle') continue;
    const x = a[f] ?? b[f], y = b[f] ?? a[f];
    if (Array.isArray(x)) o[f] = x.map((v, i) => v + ((y[i] ?? v) - v) * k);
    else if (typeof x === 'number') o[f] = x + (y - x) * k;
    else o[f] = y;
  }
  return o;
}

function retake(b, C) {
  const { T, K, H, M, WJ, F, i, prevReal, scale, minFirst, minGap } = C;
  const tm = T.time;
  const held = b.tell === 'blue' || b.tell === 'red' || b.tell === 'black';
  const red = b.tell === 'red' || b.tell === 'black';
  // ---- the timing
  let W = b.windup;
  if (!b.fixed && !b.wjSpark && !b.wjGhost) {
    if (held) W = Math.max(W * tm.heldK, prevReal ? (minGap - (prevReal.active ?? 0.1)) / scale + 0.04 : minFirst / scale + 0.02);
    else if (!prevReal) W = Math.max(minFirst / scale + 0.005, Math.min(W, Math.max(tm.first, W * tm.normalK)));
    else W = Math.max((minGap - (prevReal.active ?? 0.1)) / scale + 0.01, Math.min(W, Math.max(tm.next, W * tm.normalK)));
    // (a red cue after a guard cue keeps 0.36 s between their flashes: veil.mjs DATA)
    if (red && prevReal && !(prevReal.tell === 'red' || prevReal.tell === 'black')) W = Math.max(W, (0.36 - (prevReal.active ?? 0.1)) / scale + 0.01);
  }
  // (the strike's time: `snap` of the windup, never under the blow's own shortest (its path: a round
  // kick's foot travels a metre, a flick a hand's width), so the striking end stays near 10 - 15 m/s)
  const snap = held ? tm.snapH : tm.snapN;
  const blow0 = blowOf(b, M);
  const minT = SNAP_MIN[blow0 ?? (b.wjSpark ? 'spark' : b.part === 'palms' ? 'plant' : b.part === 'feet' ? 'stomp' : 'own')] ?? 0.1;
  const Wph = W * scale;
  const cock = Math.min(0.92, Math.max(b.cock ?? 0.7, 1 - Math.max(snap, minT / Math.max(0.2, Wph))));
  const nb = { ...b, windup: +W.toFixed(3) };
  // ---- the blink of a string's later beat (only when the hero slid out of reach: moves/melee.js)
  // (and a first blow that would close more than 3 m, the Long Step: one step that is ten is a blink)
  const far = i === 0 && !b.wjBlink && !b.dash && (b.close ?? 0) > 3;
  if (far) {
    nb.wjBlink = { at: 0, r: T.blink.r + 0.1, u: T.blink.u + 0.05 };
    nb.close = 1.0;
  } else if (i > 0 && !b.wjBlink && !b.dash && !b.flit && ((b.close ?? 0) > 2.5 || T.blink.near === 0)) {
    const at = T.blink.pattern[C.blinkI % T.blink.pattern.length];
    nb.wjBlink = { at, r: T.blink.r, u: T.blink.u, ...(T.blink.near > 0 ? { near: T.blink.near } : {}) };
    nb.close = 1.0;
    nb.track = Math.max(b.track ?? 0.7, 0.9);
  }
  // ---- the pose
  const blow = blowOf(b, M);
  nb.wjHands = handsOf(b, blow);
  if (blow && (K[blow] || H[blow])) {
    const S = K[blow] ?? H[blow];
    const left = !!b.mo?.left;
    const P = (p) => WJ(p, left);
    const hd = held ? (red ? S.red : S.held) : S.held;
    const kick = !!K[blow];
    // the hands each phase may free: authored easy (the layer pins them); a kick's free hands out for balance
    const hz = kick ? (held ? EASY_OUT : EASY) : {};
    const wrap = (p) => P({ ...(kick ? hz : EASY), ...p });
    const keys = [];
    if (held) {
      const at = Math.min(T.heldAt, cock - 0.25);
      if (S.load) keys.push([at * 0.45, { ...wrap(S.load), gather: true }]);
      keys.push([at, { ...wrap(hd), e: 'o' }]);
      // (tightening through the hold: a little lower, the limb drawn a little further)
      keys.push([cock, wrap({ ...hd, bY: (hd.bY ?? -0.06) - (red ? 0.03 : 0.02) })]);
    } else {
      if (S.load) keys.push([cock * 0.5, { ...wrap(S.load), gather: true }]);
      keys.push([cock, { ...wrap(S.held), e: 's' }]);
    }
    // (the strike: accelerating out of the cock, then at full speed into the contact: a snap, not a pop)
    const c = keys[keys.length - 1][1], h = wrap(S.hit);
    keys.push([cock + (1 - cock) * 0.45, { ...mid(c, h, 0.3), e: 'i' }]);
    keys.push([1.0, { ...h, e: 'l' }]);
    keys.push([1.22, { ...wrap(S.hit), e: 'l' }]);
    keys.push([1.62, { ...wrap(S.re), e: 'o' }]);
    keys.push([2.0, { ...wrap({ ...(S.load ?? S.held), ...(kick ? { rF: [-0.15, ANK, -0.04], rK: [-0.25, 0, 1] } : {}) }), e: 's', settle: true }]);
    nb.keys = keys;
    nb.cock = cock;
    // the trail and the glint on the hand that strikes (the one-handed blows are the right hand's)
    if (!kick && blow !== 'double') nb.part = left ? 'fistL' : 'fistR';
    if (!kick && b.mo?.fam === 'punch' && b.part === 'fistL' && !left) nb.part = 'fistR';
    void F;
    return nb;
  }
  // ---- a beat with keys of its own (Dark Spark, the plant, the stomp, the lariat, the lazy step): its
  // keys re-timed onto the new cock (the coil reached sooner and held), its strike kept
  if (b.keys?.length) {
    const c0 = b.cock ?? 0.8;
    const at = held ? Math.min(T.heldAt, cock - 0.2) : null;
    nb.keys = b.keys.map(([u, p]) => {
      if (u > 1 + 1e-6 || u >= 1 - 1e-6) return [u, p];
      if (u <= c0 + 1e-6) {
        // the coil keys: reached by `at` (held) or scaled onto the new cock
        const v = at != null ? (u >= c0 - 1e-6 ? cock : Math.min(at, (u / c0) * at)) : (u / c0) * cock;
        return [v, p];
      }
      return [cock + ((u - c0) / (1 - c0)) * (1 - cock), p];
    });
    nb.cock = cock;
  }
  return nb;
}

/**
 * The moves as the switch plays them: each move of `base` (moves/melee.js) gets live `beats` and
 * `recovery` (the take's, or its own on '0'); every other field is its own. Enumerable, so the suites and
 * the Lab see them as plain fields.
 */
export function liveTakes(base, X) {
  const takes = makeTakes(base, X, X.TUNING);
  const out = {};
  for (const [name, def] of Object.entries(base)) {
    const own = { beats: def.beats, recovery: def.recovery };
    const m = { ...def };
    for (const f of ['beats', 'recovery']) {
      Object.defineProperty(m, f, {
        enumerable: true, configurable: true,
        get() {
          const t = wjMotionNow();
          return t === '0' ? own[f] : takes[t]?.[name]?.[f] ?? own[f];
        },
      });
    }
    out[name] = m;
  }
  return out;
}
