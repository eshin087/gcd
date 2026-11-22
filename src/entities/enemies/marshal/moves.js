import { TELL } from '../../../combat/rules.js';
import { DIM } from '../../player/model.js';
import { makeRealise } from '../duelist/realise.js';
import { GUARD_CLIPS } from '../duelist/guard.js';
import { BODY_POSES } from './poses.js';
import { TUNING } from './tuning.js';

// The Clockwork Marshal's moves and reaction clips, as data (COMBAT.md → "The Clockwork Marshal"). The
// format is the duelist's (ashDisciple/moves.js header; duelist/realise.js). Phases 1 - 3 are the SUIT,
// phase 4 the PILOT; a move's `weight` is per phase [1, 2, 3, 4]. His own beat fields:
//   bolt: true                 the Fire Lance: a line from the lance's muzzle (marshal.js draws it, a
//                              perfect parry returns it onto the plate facing the hero)
//   fromPhase / untilPhase: n  the beat is in the move only from / until phase n (realise below)
//   ifBreastLost: true         the beat is in the move only once the breastplate is gone (one more bolt)
//   power: 'hammer' | ...      the world power of its impact (TUNING.world[power], marshal.js onImpact)
//   charge: true               Iron Charge: the dash sweeps the world along its path
//   cast: { kind: 'mortar' }   Sky-Splitting Mortars (marshal.js onCast, fx.js callStrike)
//   release: { style: 'fire' } the pilot's fire bolts thrown at the impact (duelist fx crescents)
//   burn: { kind: 'across' }   Sweeping Fire leaves its arc alight (ashDisciple/moveFx.js)
//   vent: true                 Bellows Vent: fire off his back (marshal.js lights the world round him)
//   part: 'muzzle'             the glint at the lance's fire tube (marshal.js tellPoint)
// Rules (tests/integration/marshal.mjs DATA): a tell on every real hit; in the suit a move's first real
// windup >= TUNING.suitTiming.minFirstWindup and impacts >= .minHitGap apart, in the pilot the
// pilotTiming pair; each glint after the blow before it lands; a red ring marks the ground.

const N = TELL.NORMAL, B = TELL.BLUE, R = TELL.RED;
const TAU = Math.PI * 2;
const PIV = DIM.pivot, ANK = DIM.ankle;
const w2b = (w, y) => [w[0] - y, w[1]];

// ---------------------------------------------------------------- pose fragments (duelist/poses.js)
const SET = { rF: [-0.14, 0.36], lF: [0.22, -0.3] };
const SET_L = { lF: [0.14, 0.32], rF: [-0.2, -0.26], rFy: -0.8, lFy: 0.3 };
const STEP_IN = { rF: [-0.14, 0.66], lF: [0.24, -0.4], rK: [-0.25, 0, 1], lK: [0.6, -0.2, 0.8], lFy: 0.95 };
const STEP_L = { lF: [0.14, 0.6], rF: [-0.2, -0.36], lK: [0.25, 0, 1], rK: [-0.6, -0.2, 0.8], rFy: -0.95, lFy: 0.25 };
const WIDE = { rF: [-0.3, 0.3], lF: [0.3, -0.26] };
const LUNGE_FEET = { rF: [-0.08, 0.9], lF: [0.22, -0.62], rK: [-0.1, 0, 1], lK: [0.35, -0.3, 0.9], rFy: -0.05, lFy: 0.95 };
const STEP_BACK = { rF: [-0.12, 0.18], lF: [0.2, -0.38] };
const KNEEL = { bY: -0.52, pitch: 0.22, spX: 0.1, hdX: 0.5, rF: [-0.12, 0.32], lF: [0.17, -0.42], rK: [0, 0, 1], lK: [0.1, -0.85, 0.5], flat: 0.7 };
const CROUCH = { bY: -0.5, pitch: 0.18, rF: [-0.42, 0.22], lF: [0.22, -0.12], rK: [-0.6, 0.3, 0.7], lK: [0.4, 0.2, 0.9], rFy: -0.7, flat: 0.8 };
const COIL = { bY: -0.24, bZ: -0.08, yaw: 0.85, hip: 0.14, spX: 0.06, rH: [-0.08, -0.22, 0.0], rP: [-0.6, -0.6, -0.5], sw: [-0.9, 0.04], swF: [1, 0.1, 0], lH: [0.02, 0.0, 0.42], lP: [0.6, -0.3, 0.5], hdY: -0.75, ...SET };
const LUNGE = {
  bY: -0.3, bZ: 0.22, pitch: 0.1, yaw: 0.3, hip: -0.06, spX: 0.18, spY: -0.04, hdY: -0.26, hdX: 0.02,
  rH: [0.04, -0.04, 0.56], rP: [-0.7, -0.3, -0.2], sw: [-0.3, 0.02], swF: [1, 0.1, 0], lH: [0.2, -0.04, -0.34], lP: [0.7, -0.3, -0.6],
  ...LUNGE_FEET,
};
const RAISED = { two: 1, rH: [0.1, 0.42, 0.08], rP: [-0.8, 0.4, -0.3], sw: [-0.2, 2.0], swF: [1, 0, 0], pitch: -0.12, bY: -0.04, spX: -0.06, hdX: 0.02, yaw: 0.2 };
const CHOP = { two: 1, rH: [0.1, -0.3, 0.46], rP: [-0.8, -0.3, 0], sw: [-0.12, -0.62], swF: [1, 0, 0], pitch: 0.24, bY: -0.32, spX: 0.16, hdX: -0.16, yaw: 0.12, rF: [-0.1, 0.76], lF: [0.22, -0.5] };

/** A cut (duelist/poses.js `arm`: the hand follows the blade). World-relative blade [az, el]. */
function slash({ from, through, to, yaw: [y0, y1, y2], cock = 0.7, sink = 0, two = 0, step = 'R' }) {
  const dir = Math.sign(to[0] - from[0]) || 0;
  const gy = (y0 + 0.3) / 2;
  const T = two ? { two: 1 } : {};
  const free = (v, pole) => (two ? {} : pole ? { lH: v, lP: pole } : { lH: v });
  const set = step === 'L' ? SET_L : SET, into = step === 'L' ? STEP_L : STEP_IN;
  return [
    [cock * 0.45, { gather: true, ...T, arm: 0.7, ext: 0.6, lead: 0.05 * dir, yaw: gy, sw: w2b([from[0] * 0.55, from[1] * 0.55 + 0.08], gy), bY: -0.18 - sink * 0.5, bZ: -0.03, roll: 0.03 * dir, ...free([0.04, -0.1, 0.32]), ...set }],
    [cock, { ...T, arm: 1, ext: 0.5, lead: 0.22 * dir, yaw: y0, sw: w2b(from, y0), bY: -0.23 - sink, bZ: -0.07, pitch: 0.06, roll: 0.08 * dir, hip: 0.1 * dir, ...free([0.0, -0.13, 0.32], [0.6, -0.8, 0.1]), ...set }],
    [1.0, { ...T, e: 'i', arm: 1, ext: 1, lead: 0, yaw: y1, sw: w2b(through, y1), bY: -0.3 - sink, bZ: 0.12, pitch: 0.13, roll: -0.05 * dir, hip: -0.06 * dir, ...free([0.26, -0.1, -0.16], [0.8, -0.4, -0.5]), ...into }],
    [1.6, { ...T, e: 'o', arm: 1, ext: 0.88, lead: -0.32 * dir, yaw: y2, sw: w2b(to, y2), bY: -0.25 - sink, bZ: 0.1, pitch: 0.06, roll: -0.1 * dir, hip: -0.12 * dir, ...free([0.3, -0.04, -0.22]), ...into }],
    [2.0, { settle: true, ...T, arm: 1, ext: 0.84, lead: -0.26 * dir, yaw: y2, sw: w2b([to[0] * 0.94, to[1] * 0.9], y2), bY: -0.23 - sink, bZ: 0.08, roll: -0.06 * dir, ...free([0.28, -0.06, -0.18]), ...into }],
  ];
}
const PATHS = {
  rise: { from: [-2.0, -0.62], through: [0.0, 0.05], to: [1.55, 0.95], yaw: [0.1, 0.5, 0.85], ang: 0.95 },
  back: { from: [1.55, 0.8], through: [0.0, -0.02], to: [-1.75, -0.5], yaw: [0.95, 0.55, 0.12], ang: 0.95 },
  flat: { from: [-1.95, 0.1], through: [0.0, 0.04], to: [1.75, 0.06], yaw: [0.05, 0.5, 0.95], ang: 1.0 },
  flatBack: { from: [1.85, 0.14], through: [0.0, 0.04], to: [-1.8, 0.02], yaw: [1.0, 0.55, 0.1], ang: 1.0 },
  diag: { from: [-1.2, 1.1], through: [0.0, 0.15], to: [1.4, -0.75], yaw: [0.25, 0.55, 0.9], ang: 0.85 },
  // the suit's lance swept wide and low across his whole front (and back)
  sweep: { from: [-2.3, -0.1], through: [0.0, -0.12], to: [2.1, -0.08], yaw: [-0.1, 0.5, 1.1], ang: 1.1 },
  sweepBack: { from: [2.1, -0.06], through: [0.0, -0.12], to: [-2.2, -0.1], yaw: [1.1, 0.55, -0.1], ang: 1.1 },
};

const overKeys = (cock = 0.7, feet = null) => [
  [cock * 0.5, { gather: true, ...RAISED, rH: [0.1, 0.3, 0.14], sw: [-0.2, 1.5], bY: -0.1, ...SET }],
  [cock, { ...RAISED, sw: [-0.2, 2.05], rF: [-0.12, 0.42], lF: [0.2, -0.28] }],
  [1.0, { ...CHOP, e: 'i', ...(feet ?? {}) }],
  [1.6, { ...CHOP, e: 'o', bY: -0.42, pitch: 0.3, sw: [-0.12, -0.82], rH: [0.1, -0.36, 0.42], ...(feet ?? {}) }],
  [2.0, { settle: true, ...CHOP, bY: -0.36, ...(feet ?? {}) }],
];
const thrustKeys = (two = 0, cock = 0.74) => {
  const T = two ? { two: 1 } : {};
  return [
    [cock * 0.5, { gather: true, ...COIL, ...T, bY: -0.18, rH: [-0.04, -0.18, 0.12] }],
    [cock, { ...COIL, ...T, rH: [-0.08, -0.24, -0.02], bY: -0.26 }],
    [1.0, { ...LUNGE, ...T, e: 'i', bZ: 0.16, rH: [0.04, -0.05, 0.49] }],
    [1.6, { ...LUNGE, ...T, e: 'o', bZ: 0.27, rH: [0.05, -0.03, 0.58] }],
    [2.0, { settle: true, ...LUNGE, ...T, bZ: 0.2 }],
  ];
};
const PERIL_COIL = { ...COIL, bY: -0.34, bZ: -0.14, yaw: 0.95, rH: [-0.12, -0.32, -0.08], sw: [-1.0, -0.08], lH: [0.28, 0.06, 0.1], lP: [0.9, 0.2, -0.2], hdY: -0.8, rF: [-0.12, 0.34], lF: [0.2, -0.38] };
const PERIL_LUNGE = { ...LUNGE, bZ: 0.3, bY: -0.34, rF: [-0.08, 1.05], lF: [0.22, -0.68], lH: [0.2, 0.08, -0.44] };
const perilKeys = () => [[0.4, { gather: true, ...PERIL_COIL }], [0.84, { ...PERIL_COIL, bY: -0.36 }], [1.0, { ...PERIL_LUNGE, e: 'i' }], [1.6, { ...PERIL_LUNGE, e: 'o', bZ: 0.34 }], [2.0, { ...PERIL_LUNGE }]];

const rotXZ = (x, z, a) => [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
const spinFeet = (ph, y = ANK) => {
  const r = rotXZ(-0.15, 0.3, ph), l = rotXZ(0.22, -0.28, ph);
  return { rF: [r[0], y, r[1]], lF: [l[0], y, l[1]], rFy: -0.25 + ph, lFy: 0.9 + ph };
};
/** A whirl: wound up, then a full turn with the steel out level (a ring). `low`: at the ankles. */
const spinKeys = (cock = 0.66, { low = false, two = 0 } = {}) => {
  const Bd = low ? { ...CROUCH } : { bY: -0.22 };
  const T = two ? { two: 1 } : {};
  const out = { ...T, arm: 1, ext: 1, lead: 0, sw: low ? [-1.45, -0.44] : [-1.45, -0.04], ...(two ? {} : { lH: [0.3, low ? -0.12 : 0.04, 0.08], lP: [0.9, 0.1, -0.2] }) };
  const wound = { ...Bd, ...T, arm: 1, ext: 0.55, lead: -0.2, yaw: 1.2, sw: low ? [-2.1, -0.5] : [-2.15, -0.12], hdY: -1.0 };
  if (low) {
    return [[cock, { ...wound }], [1.0, { ...Bd, ...out, e: 'i', yaw: 0.9, hdY: -0.6 }], [2.0, { ...Bd, ...out, e: 'l', yaw: 0.9 - TAU, hdY: -0.6 }], [2.001, { e: 'h', yaw: 0.9 }]];
  }
  const turn = (u, k, hop) => [u, { e: 'l', yaw: 0.9 - TAU * k, bY: -0.22 + 0.06 * hop, ...spinFeet(-TAU * k, ANK + 0.08 * hop), flat: 0.95 - 0.4 * hop }];
  return [
    [cock, { ...wound, bY: -0.3, ...spinFeet(0.3) }],
    [1.0, { ...Bd, ...out, e: 'i', yaw: 0.9, hdY: -0.6, ...spinFeet(0), flat: 0.95 }],
    turn(1.25, 0.25, 1), turn(1.5, 0.5, 1), turn(1.75, 0.75, 0.7),
    [2.0, { ...Bd, ...out, e: 'l', yaw: 0.9 - TAU, hdY: -0.6, ...spinFeet(-TAU), flat: 0.95 }],
    [2.001, { e: 'h', yaw: 0.9, ...spinFeet(0) }],
  ];
};
const flipFoot = (th, x, L = 0.5) => [x, PIV - 0.12 - L * Math.cos(th), -L * Math.sin(th)];
/** The backflip away (the beat's travel and lift), a level cut as she lands. */
function backflipKeys({ cock = 0.3 } = {}) {
  const u = (k) => cock + (1 - cock) * k;
  const air = (k, e = 'l') => {
    const th = -TAU * k;
    return [u(k), { e, arm: 0, pitch: th, bY: -0.1, yaw: 0.2, rH: [-0.2, 0.0, 0.26], rP: [-0.8, -0.2, -0.3], sw: [-1.5, 0.2], lH: [0.26, 0.04, 0.2], rF: flipFoot(th, -0.11, 0.46), lF: flipFoot(th, 0.13, 0.4), rK: [-0.2, 0.4, 1], lK: [0.2, 0.4, 1], flat: 0 }];
  };
  const shot = { arm: 0, yaw: 0.3, bY: -0.32, bZ: 0.06, pitch: 0.12, rH: [-0.16, -0.3, 0.1], sw: [-1.3, -0.4], lH: [0.04, 0.04, 0.54], lP: [0.7, -0.4, 0.1], rF: [-0.12, 0.3], lF: [0.2, -0.4], flat: 0.95 };
  return [
    [cock * 0.55, { bY: -0.42, pitch: 0.12, yaw: 0.3, rH: [-0.1, -0.24, 0.26], sw: [-0.4, 0.3], rF: [-0.13, 0.22], lF: [0.17, -0.1], rK: [-0.2, 0.2, 1], lK: [0.3, 0.2, 1] }],
    air(0, 'o'), air(0.3), air(0.6), air(0.86),
    [1.0, { ...shot, e: 'l', pitch: -TAU + 0.12 }],
    [1.001, { e: 'h', pitch: 0.12 }],
    [2.0, { ...shot }],
  ];
}
const FLIP_LIFT = (cock = 0.36, apex = 1.5) => [[cock, 0], [cock + (1 - cock) * 0.5, apex], [1.0, 0]];
/** A forward somersault (the beat's lift / travel carries her), a two-handed chop down as she lands. */
function flipKeys({ cock = 0.36 } = {}) {
  const air = (u, th, sw, e = 'l') => [u, { e, two: 1, pitch: th, bY: -0.08, rH: [0.1, 0.2, 0.16], sw, rF: flipFoot(th, -0.1), lF: flipFoot(th, 0.12), rK: [-0.2, 0.4, 1], lK: [0.2, 0.4, 1], flat: 0 }];
  const u = (k) => cock + (1 - cock) * k;
  return [
    [cock * 0.6, { two: 1, bY: -0.42, pitch: 0.2, yaw: 0.1, rH: [0.08, -0.2, 0.3], sw: [0.0, 0.4], rF: [-0.12, 0.25], lF: [0.15, -0.25], rK: [-0.2, 0.2, 1], lK: [0.3, 0.2, 1] }],
    air(cock, 0.3, [0.0, 1.3], 'o'),
    air(u(0.3), TAU * 0.3, [0.0, 2.2]),
    air(u(0.6), TAU * 0.62, [0.0, 2.5]),
    air(u(0.86), TAU * 0.9, [0.0, 2.3]),
    [1.0, { ...CHOP, e: 'l', pitch: TAU + 0.32 }],
    [1.001, { e: 'h', pitch: 0.32 }],
    [1.6, { ...CHOP, e: 'o', bY: -0.4, pitch: 0.36, sw: [-0.12, -0.78] }],
    [2.0, { ...CHOP, bY: -0.36 }],
  ];
}

// ---------------------------------------------------------------- the suit's own keys
/** The lance levelled at the hero, the fire tube under its blade hot: braced, then the shot's recoil. */
const lanceKeys = (cock = 0.7) => [
  [cock * 0.5, { two: 1, gather: true, yaw: 0.5, bY: -0.2, rH: [0.04, -0.12, 0.3], sw: [-0.4, 0.05], ...WIDE }],
  [cock, { two: 1, yaw: 0.36, bY: -0.24, pitch: 0.04, rH: [0.06, -0.06, 0.36], sw: [-0.04, 0.02], hdY: -0.2, ...WIDE }],
  [1.0, { two: 1, e: 'i', yaw: 0.4, bY: -0.22, bZ: -0.08, pitch: -0.08, rH: [0.04, -0.02, 0.26], sw: [-0.04, 0.12], ...WIDE }],
  [2.0, { two: 1, yaw: 0.38, bY: -0.24, pitch: -0.02, rH: [0.06, -0.06, 0.34], sw: [-0.04, 0.04], ...WIDE }],
];
/** Treading Mountain: the right foot raised high, then stamped down. */
const stompKeys = () => [
  [0.4, { two: 1, bY: -0.12, pitch: -0.06, yaw: 0.3, rF: [-0.16, 0.32, 0.22], rK: [-0.3, 0.4, 1], rH: [0.06, -0.2, 0.28], sw: [-0.6, 0.3], flat: 0.6 }],
  [0.84, { two: 1, bY: -0.06, pitch: -0.12, yaw: 0.28, rF: [-0.18, 0.62, 0.3], rK: [-0.3, 0.7, 1], rH: [0.06, -0.12, 0.3], sw: [-0.6, 0.5], flat: 0.3 }],
  [1.0, { two: 1, e: 'i', bY: -0.34, pitch: 0.16, yaw: 0.34, rF: [-0.24, ANK, 0.32], rK: [-0.4, 0, 1], rH: [0.06, -0.3, 0.26], sw: [-0.5, -0.3], flat: 1 }],
  [2.0, { two: 1, bY: -0.3, pitch: 0.12, yaw: 0.34, rF: [-0.24, ANK, 0.32], rH: [0.06, -0.3, 0.26], sw: [-0.5, -0.3] }],
];
/** Iron Charge: the lance lowered like a ram, the body hunched behind it, legs driving. */
const chargeKeys = () => [
  [0.5, { two: 1, gather: true, bY: -0.3, pitch: 0.2, yaw: 0.25, rH: [0.04, -0.2, 0.3], sw: [-0.2, -0.1], ...WIDE }],
  [0.9, { two: 1, bY: -0.38, pitch: 0.32, yaw: 0.18, rH: [0.04, -0.16, 0.36], sw: [-0.08, -0.05], hdX: -0.2, ...LUNGE_FEET }],
  [1.0, { two: 1, e: 'i', bY: -0.36, pitch: 0.36, bZ: 0.2, yaw: 0.16, rH: [0.04, -0.12, 0.46], sw: [-0.04, -0.02], ...LUNGE_FEET }],
  [2.0, { two: 1, bY: -0.32, pitch: 0.24, bZ: 0.14, yaw: 0.2, rH: [0.04, -0.14, 0.42], sw: [-0.06, -0.08], ...LUNGE_FEET }],
];
/** Bellows Vent: hunched, then the arms flung wide and the back arched as the furnace vents. */
const ventKeys = () => [
  [0.6, { two: 0, bY: -0.36, pitch: 0.3, yaw: 0.1, rH: [0.02, -0.2, 0.32], sw: [0.2, -0.6], lH: [-0.02, -0.2, 0.32], hdX: 0.3, ...WIDE }],
  [1.0, { two: 0, e: 'i', bY: -0.06, pitch: -0.22, yaw: 0.05, rH: [-0.38, 0.0, 0.0], rP: [-0.9, 0.2, -0.3], sw: [-1.6, 0.4], lH: [0.38, 0.0, 0.0], lP: [0.9, 0.2, -0.3], hdX: -0.3, spX: -0.12, ...WIDE }],
  [2.0, { two: 0, bY: -0.08, pitch: -0.18, yaw: 0.05, rH: [-0.36, -0.02, 0.02], sw: [-1.5, 0.3], lH: [0.36, -0.02, 0.02], ...WIDE }],
];
/** The mortars: the lance driven up at the sky, the gears' shells thrown out of his back. */
const mortarKeys = () => [
  [0.5, { two: 1, bY: -0.3, pitch: 0.12, yaw: 0.2, rH: [0.06, -0.3, 0.24], sw: [-0.4, -0.3], hdX: 0.2, ...WIDE }],
  [1.0, { two: 1, e: 'i', bY: -0.04, pitch: -0.18, yaw: 0.1, rH: [0.02, 0.4, 0.12], rP: [-0.9, 0.4, -0.2], sw: [-0.1, 1.45], hdX: -0.3, spX: -0.1, ...WIDE }],
  [2.0, { two: 1, bY: -0.04, pitch: -0.16, yaw: 0.1, rH: [0.02, 0.38, 0.12], sw: [-0.1, 1.4], hdX: -0.28, ...WIDE }],
];
/** A transition (the furnace opens, the works run wild): braced on the lance, then reared up, arms wide. */
const shockKeys = () => [
  [0.0, { two: 0, bY: -0.42, pitch: 0.26, yaw: 0.1, hdX: 0.4, rH: [-0.1, -0.36, 0.3], sw: [-0.2, 1.3], lH: [0.1, -0.42, 0.18], ...WIDE }],
  [0.5, { two: 0, bY: -0.44, pitch: 0.24, yaw: 0.1, hdX: 0.36, rH: [-0.1, -0.34, 0.3], sw: [-0.2, 1.3], lH: [0.1, -0.4, 0.18], ...WIDE }],
  [0.82, { two: 0, bY: -0.14, pitch: 0.08, yaw: 0.06, hdX: 0.1, rH: [0.06, -0.2, 0.3], sw: [0.4, 0.8], lH: [-0.06, -0.24, 0.3], ...WIDE }],
  [1.0, { e: 'i', two: 0, bY: -0.04, pitch: -0.22, yaw: 0.05, hdX: -0.3, spX: -0.1, rH: [-0.38, -0.06, 0.08], rP: [-0.9, 0.2, -0.3], sw: [-1.5, 0.5], lH: [0.38, -0.06, 0.08], lP: [0.9, 0.2, -0.3], ...WIDE }],
  [2.0, { two: 0, bY: -0.06, pitch: -0.18, yaw: 0.05, hdX: -0.24, rH: [-0.36, -0.08, 0.1], sw: [-1.5, 0.4], lH: [0.36, -0.08, 0.1], ...WIDE }],
];
/** The pilot's hand-lance levelled from the off hand (point-blank), the sabre held back. */
const handShotKeys = (cock = 0.7) => [
  [cock, { two: 0, yaw: 0.6, bY: -0.16, lH: [0.22, 0.1, 0.18], lP: [0.9, 0.1, -0.4], rH: [-0.1, -0.3, 0.1], sw: [-1.2, -0.3], hdY: -0.5 }],
  [1.0, { e: 'i', two: 0, yaw: 0.14, bY: -0.2, bZ: 0.04, lH: [0.02, 0.04, 0.55], lP: [0.7, -0.4, 0.1], rH: [-0.14, -0.3, 0.04], sw: [-1.5, -0.3], hdY: -0.1 }],
  [2.0, { two: 0, yaw: 0.14, bY: -0.2, lH: [0.02, 0.04, 0.54], rH: [-0.14, -0.3, 0.04], sw: [-1.5, -0.3] }],
];
/** A fan of bolts: the hand-lance swept across her front as it fires. */
const fanKeys = () => [
  [0.7, { two: 0, yaw: 0.7, bY: -0.18, lH: [0.3, 0.02, 0.3], lP: [0.9, 0.0, -0.3], rH: [-0.1, -0.3, 0.1], sw: [-1.2, -0.3], hdY: -0.4 }],
  [1.0, { e: 'i', two: 0, yaw: 0.2, bY: -0.22, lH: [0.02, 0.04, 0.54], lP: [0.7, -0.4, 0.1], rH: [-0.14, -0.3, 0.04], sw: [-1.5, -0.3] }],
  [2.0, { two: 0, yaw: -0.1, bY: -0.2, lH: [-0.2, 0.04, 0.48], rH: [-0.14, -0.3, 0.04], sw: [-1.5, -0.3] }],
];

// ---------------------------------------------------------------- beat builders
/** The suit's reach (gameplay metres) and the pilot's. */
const PILOT_REACH = 2.6;

/** A sweep of the lance (suit): wide and low across his front. */
const sweep = (path, tell, windup, damage, o = {}) => {
  const P = PATHS[path];
  return { tell, windup, active: 0.12, damage, knockback: 2.2, zone: { kind: 'sector', r: 4.0, ang: P.ang }, keys: slash({ ...P, cock: o.cock ?? 0.72, two: 1 }), track: 0.6, power: 'sweep', ...o };
};
/** A pilot's sabre cut. */
const cut = (path, tell, windup, damage, o = {}) => {
  const { step = 'R', ...extra } = o;
  const P = PATHS[path];
  return { tell, windup, active: 0.08, damage, knockback: tell === N ? 0.7 : 1.5, zone: { kind: 'sector', r: PILOT_REACH, ang: P.ang }, keys: slash({ ...P, cock: extra.cock ?? 0.7, step }), ...extra };
};
/** The Fire Lance as a beat: a long line from the muzzle (blue: parry it; perfect: it returns). */
const lanceBolt = (windup, damage = 26, o = {}) => ({
  tell: B, windup, active: 0.08, damage, knockback: 1.6, zone: { kind: 'line', r: TUNING.lance.range, w: TUNING.lance.width }, bolt: true, part: 'muzzle',
  track: 0.92, close: 0, keys: lanceKeys(o.cock ?? 0.7), ...o,
});
/** A red shock ring round him (the transitions). */
const shockRing = (S) => ({
  tell: R, windup: 2.0, fixed: true, active: 0.15, damage: S.damage, knockback: S.knockback,
  zone: { kind: 'ring', r: S.ringRadius }, ring: S.ringRadius, part: 'feet', track: 0, close: 0, keys: shockKeys(),
});

// ---------------------------------------------------------------- the moves
const W = (p, w) => [1, 2, 3, 4].map((k) => (k === p ? w : 0));

export const MOVES = {
  // ============================================================== the SUIT (phases 1 - 3)
  /** Drill-Yard Sweep: the lance swept across his front and back; from phase 2 the butt slammed down. */
  yardSweep: {
    label: 'Drill-Yard Sweep', phase: 1, weight: [2.4, 2.2, 1.8, 0], cooldown: 5, band: [0, 4.2], recovery: 0.9,
    beats: [
      sweep('sweep', N, 0.8, 22),
      sweep('sweepBack', N, 0.55, 22, { cock: 0.6 }),
      { tell: B, windup: 0.6, active: 0.12, damage: 30, knockback: 2.6, zone: { kind: 'sector', r: 3.4, ang: 0.5 }, keys: overKeys(0.7), track: 0.5, fromPhase: 2, power: 'stomp' },
    ],
  },
  /** Ram's Horn: a dash and a thrust of the lance down a long line (blue; a parry moment from phase 2). */
  ramThrust: {
    label: "Ram's Horn", phase: 1, weight: [1.6, 1.6, 1.4, 0], cooldown: 5, band: [3, 8.5], recovery: 0.9, gapCloser: true,
    beats: [
      { tell: B, windup: 0.85, active: 0.1, damage: 32, knockback: 2.4, zone: { kind: 'line', r: 5.2, w: 0.9 }, dash: { from: 0.7, to: 1.0, stop: 3.0, max: 4.5 }, close: 0, track: 0.7, keys: thrustKeys(1, 0.74), untilPhase: 1 },
      { tell: B, windup: 0.85, active: 0.1, damage: 32, knockback: 2.4, zone: { kind: 'line', r: 5.2, w: 0.9 }, dash: { from: 0.7, to: 1.0, stop: 3.0, max: 4.5 }, close: 0, track: 0.7, keys: thrustKeys(1, 0.74), fromPhase: 2, flare: true },
    ],
  },
  /** Hammer of the Works: the lance raised and brought down like a forge hammer (red ring: roll). */
  worksHammer: {
    label: 'Hammer of the Works', phase: 1, weight: [1.4, 1.5, 1.5, 0], cooldown: 6, band: [0, 3.6], recovery: 1.0,
    beats: [{ tell: R, windup: 0.95, active: 0.14, damage: 36, knockback: 3.5, knockdown: true, zone: { kind: 'ring', r: 3.2 }, ring: 3.2, part: 'feet', keys: overKeys(0.72), track: 0.55, power: 'hammer' }],
  },
  /** Treading Mountain: a foot raised and stamped (red ring: roll). */
  treadStomp: {
    label: 'Treading Mountain', phase: 1, weight: [0.8, 0.9, 1.0, 0], cooldown: 5, band: [0, 3.0], recovery: 0.8,
    beats: [{ tell: R, windup: 0.8, active: 0.12, damage: 26, knockback: 3.2, knockdown: true, zone: { kind: 'ring', r: 2.8 }, ring: 2.8, part: 'feet', keys: stompKeys(), track: 0.4, close: 0, power: 'stomp' }],
  },
  /** Fire Lance: the lance levelled and fired, one bolt a phase (one more with the breastplate gone). */
  fireLance: {
    label: 'Fire Lance', phase: 1, weight: [1.4, 1.6, 1.8, 0], cooldown: 6, band: [5, 18], recovery: 0.8,
    beats: [
      lanceBolt(0.9, 26),
      { ...lanceBolt(0.55, 24, { cock: 0.6 }), fixed: true, fromPhase: 2 },
      { ...lanceBolt(0.55, 24, { cock: 0.6 }), fixed: true, fromPhase: 3 },
      { ...lanceBolt(0.55, 24, { cock: 0.6 }), fixed: true, ifBreastLost: true },
    ],
  },
  /** Iron Charge: the lance lowered, a long charge (red: roll); it ploughs through the yard. */
  ironCharge: {
    label: 'Iron Charge', phase: 1, weight: [1.0, 1.2, 1.3, 0], cooldown: 8, band: [4, 14], recovery: 1.1, gapCloser: true,
    beats: [{ tell: R, windup: 0.9, active: 0.14, damage: 30, knockback: 4, knockdown: true, zone: { kind: 'line', r: 2.4, w: 1.6 }, dash: { from: 0.55, to: 1.0, stop: 0.8, max: 9 }, close: 0, track: 0.7, keys: chargeKeys(), charge: true }],
  },
  /** Sweeping Fire: the fire tube swept across his front (red); the arc is left burning. Phase 2 on,
   *  any phase once the breastplate is gone (marshal.js weigh). */
  fireSweep: {
    label: 'Sweeping Fire', phase: 1, weight: [1.2, 1.6, 1.8, 0], cooldown: 8, band: [0, 5.0], recovery: 0.9,
    beats: [{ ...sweep('sweep', R, 0.9, 24), zone: { kind: 'sector', r: 5.5, ang: 1.2 }, knockback: 2.6, burn: { kind: 'across', at: 2.6, len: 5.2 }, part: 'muzzle', fire: true, power: 'sweepFire' }],
  },
  /** Bellows Vent: the furnace on his back vents in a ring of fire (red ring: roll). Weighs double with
   *  the back plate gone and the hero behind him. */
  ventBurst: {
    label: 'Bellows Vent', phase: 2, weight: [0, 1.2, 1.4, 0], cooldown: 7, band: [0, 3.8], recovery: 0.9,
    beats: [{ tell: R, windup: 0.8, active: 0.14, damage: 20, knockback: 5, zone: { kind: 'ring', r: 3.6 }, ring: 3.6, part: 'feet', keys: ventKeys(), track: 0.2, close: 0, vent: true, power: 'vent' }],
  },
  /** Grinding Wheel: the lance whirled round him three times, then hammered down (red ring). */
  grindingWheel: {
    label: 'Grinding Wheel', phase: 3, weight: W(3, 1.8), cooldown: 8, band: [0, 4.0], recovery: 1.0,
    beats: [
      { tell: N, windup: 0.8, active: 0.2, damage: 20, knockback: 1.6, zone: { kind: 'ring', r: 3.6 }, keys: spinKeys(0.66, { two: 1 }), track: 0.6 },
      { tell: N, windup: 0.5, active: 0.2, damage: 20, knockback: 1.6, zone: { kind: 'ring', r: 3.6 }, keys: spinKeys(0.6, { two: 1 }), track: 0.6 },
      { tell: N, windup: 0.5, active: 0.2, damage: 20, knockback: 1.6, zone: { kind: 'ring', r: 3.6 }, keys: spinKeys(0.6, { two: 1 }), track: 0.6 },
      { tell: R, windup: 0.7, active: 0.14, damage: 34, knockback: 3.5, knockdown: true, zone: { kind: 'ring', r: 3.2 }, ring: 3.2, part: 'feet', keys: overKeys(0.7), track: 0.5, power: 'hammer' },
    ],
  },
  /** Sky-Splitting Mortars: shells thrown out of his back fall on the yard one by one (red rings). */
  mortarRain: {
    label: 'Sky-Splitting Mortars', phase: 3, weight: W(3, 1.0), cooldown: 14, band: [0, 18], recovery: 1.2, cat: 'hazard',
    beats: [{ tell: R, windup: 1.0, fixed: true, active: 0.1, damage: TUNING.mortar.damage, knockback: TUNING.mortar.knockback, cast: { kind: 'mortar', selfCue: true }, part: 'feet', close: 0, track: 0.3, keys: mortarKeys() }],
  },
  /** The transitions: the furnace opens (phase 2), the works run wild (phase 3); plates blow off. */
  openFurnace: { label: 'The Furnace Opens', phase: 2, weight: 0, transition: true, cooldown: 0, band: [0, 99], recovery: 0.6, beats: [shockRing(TUNING.shock)] },
  runWild: { label: 'The Works Run Wild', phase: 3, weight: 0, transition: true, cooldown: 0, band: [0, 99], recovery: 0.6, beats: [shockRing(TUNING.shock)] },

  // ============================================================== the PILOT (phase 4)
  /** The hand-over: she climbs out of the hatch, somersaults forward and lands in a shock ring (red). */
  eject: {
    label: 'The Marshal Climbs Out', phase: 4, weight: 0, transition: true, cooldown: 0, band: [0, 99], recovery: 0.5,
    beats: [{
      tell: R, windup: 1.5, fixed: true, active: 0.15, damage: TUNING.eject.damage, knockback: TUNING.eject.knockback,
      zone: { kind: 'ring', r: TUNING.eject.ringRadius }, ring: TUNING.eject.ringRadius, part: 'feet', track: 0.9, close: 0,
      travel: [[0.36, 0], [1.0, TUNING.eject.travel]], lift: [[0, TUNING.eject.hatchY], [0.36, TUNING.eject.hatchY], [0.68, TUNING.eject.hatchY + 1.0], [1.0, 0]], cock: 0.36,
      keys: flipKeys({ cock: 0.36 }), eject: true,
    }],
  },
  /** Fuse-Light Cuts: five cuts, the fourth blue; one beat a drawn alternative. */
  fuseCuts: {
    label: 'Fuse-Light Cuts', phase: 4, weight: W(4, 2.6), cooldown: 6, band: [0, 3.6], recovery: 0.7,
    beats: [
      cut('rise', N, 0.42, 12),
      cut('back', N, 0.34, 11, { step: 'L' }),
      { pick: [cut('flat', N, 0.34, 12), cut('diag', N, 0.34, 12)] },
      { ...thrustBeat(B, 0.4, 18), lock: false },
      cut('flatBack', N, 0.36, 12, { step: 'L' }),
    ],
  },
  /** Spark and Steel: two cuts, then the hand-lance at point-blank (blue: a perfect parry returns it). */
  sparkSteel: {
    label: 'Spark and Steel', phase: 4, weight: W(4, 2.0), cooldown: 7, band: [0, 4.0], recovery: 0.7,
    beats: [
      cut('diag', N, 0.42, 12),
      cut('flat', N, 0.34, 12, { step: 'L' }),
      { tell: B, windup: 0.44, active: 0.08, damage: 22, knockback: 1.6, zone: { kind: 'line', r: 9, w: 1.2 }, bolt: true, part: 'hand', track: 0.9, close: 0, keys: handShotKeys(0.66) },
    ],
  },
  /** Marshal's Lunge: a dash and a perilous thrust (red: a mikiri answers it). */
  marshalLunge: {
    label: "Marshal's Lunge", phase: 4, weight: W(4, 1.6), cooldown: 4, band: [2.4, 7], recovery: 0.55, gapCloser: true,
    beats: [{ tell: R, windup: 0.62, active: 0.12, damage: 24, knockback: 2.5, zone: { kind: 'line', r: 3.0, w: 0.7 }, mikiri: true, dash: { from: 0.84, to: 1.0, stop: 1.2, max: 4.0 }, close: 0, track: 0.7, keys: perilKeys() }],
  },
  /** Last Charge: a long dash into an overhead (blue: a parry moment; perfect: the blades lock). */
  lastCharge: {
    label: 'Last Charge', phase: 4, weight: W(4, 1.4), cooldown: 6, band: [3, 9], recovery: 0.6, gapCloser: true,
    beats: [{ tell: B, flare: true, lock: true, windup: 0.66, active: 0.1, damage: 24, knockback: 1.6, zone: { kind: 'sector', r: PILOT_REACH + 0.05, ang: 0.5 }, dash: { from: 0.45, to: 0.96, stop: 1.2, max: 7 }, close: 0, track: 0.55, keys: overKeys(0.72), cock: 0.72 }],
  },
  /** Parting Shot: a backflip away, two fire bolts thrown as she lands (white). */
  leapShot: {
    label: 'Parting Shot', phase: 4, weight: W(4, 1.0), cooldown: 7, band: [0, 4.5], recovery: 0.55,
    beats: [{ tell: N, windup: 0.66, fixed: true, active: 0.1, damage: 14, knockback: 1.2, release: { style: 'fire', count: 2, spread: 0.26, speed: TUNING.shot.speed, from: 0.5 }, close: 0, track: 0.3, travel: [[0.3, 0], [1.0, -4.0]], lift: FLIP_LIFT(0.3, 1.35), keys: backflipKeys({ cock: 0.3 }), cock: 0.3, part: 'hand' }],
  },
  /** Scatter of Sparks: a fan of three fire bolts from the hand-lance (white). */
  scatterShot: {
    label: 'Scatter of Sparks', phase: 4, weight: W(4, 1.2), cooldown: 6, band: [4, 11], recovery: 0.6,
    beats: [{ tell: N, windup: 0.6, active: 0.1, damage: 12, knockback: 1.0, release: { style: 'fire', count: 3, spread: 0.32, speed: TUNING.shot.speed, from: 0.8 }, close: 0, track: 0.85, keys: fanKeys(), part: 'hand' }],
  },
  /** Sweeping the Yard: dropped low, the sabre swept round at the ankles (red ring: roll). */
  lowReap: {
    label: 'Sweeping the Yard', phase: 4, weight: W(4, 1.4), cooldown: 6, band: [0, 3.2], recovery: 0.6,
    beats: [{ tell: R, windup: 0.62, active: 0.22, damage: 20, knockback: 2.6, knockdown: true, zone: { kind: 'ring', r: 2.6 }, ring: 2.6, part: 'feet', close: 1.2, track: 0.65, keys: spinKeys(0.62, { low: true }) }],
  },
  /** Her counter out of a guard: a diagonal cut, then a thrust. */
  riposteCut: {
    label: 'Riposte', phase: 4, weight: 0, counter: true, cooldown: 0, band: [0, 5], recovery: 0.55,
    beats: [cut('diag', N, 0.46, 15, { track: 0.7 }), thrustBeat(B, 0.36, 21)],
  },
};
/** A pilot's thrust beat. */
function thrustBeat(tell, windup, damage) {
  return { tell, windup, active: 0.1, damage, knockback: 1.5, zone: { kind: 'line', r: PILOT_REACH - 0.25, w: 0.7 }, dash: { from: 0.7, to: 1.0, stop: 1.0, max: 2.4 }, keys: thrustKeys(0, 0.74) };
}
// Her answer to a streak of guards (duelist.js `streak`, DEFENSE.foeStreak): as many cuts as the streak
// counts, each after the first from another side of the hero (`flit`). Realised with { count }.
MOVES.fuseFlurry = {
  label: 'Fuse Flurry', phase: 4, weight: 0, counter: true, streak: true, cooldown: 0, band: [0, 6], recovery: 0.75,
  beats: ['diag', 'flat', 'rise', 'back'].map((k, i) => cut(k, N, i ? 0.48 : 0.62, 13, i ? { flit: { r: 2.7 } } : { track: 0.7 })),
};
export const MOVE_NAMES = Object.keys(MOVES);
export const TRANSITIONS = Object.freeze({ 2: 'openFurnace', 3: 'runWild', 4: 'eject' });
export const COUNTER = 'riposteCut';
export const STREAK = 'fuseFlurry';
/** Which body a move is the suit's (1) or the pilot's (2). */
export const bodyOfMove = (def) => ((def?.phase ?? 1) >= 4 ? 2 : 1);

// ---------------------------------------------------------------- reaction clips (no hits)
/** Kneeling before the furnace: one knee down, the lance upright in his right hand, head bowed. */
const KNEEL_LANCE = { two: 0, ...KNEEL, rH: [-0.06, -0.22, 0.3], rP: [-0.8, -0.4, -0.3], sw: [-0.15, 1.35], swF: [1, 0, 0], lH: [0.12, -0.42, 0.22], lP: [0.6, -0.3, 0.3] };

const SUIT_CLIPS = {
  ...GUARD_CLIPS,
  // (the suit has no sword guard: its wardHold is its stance, so the raised guard changes nothing)
  wardHold: { dur: 1, hold: true, keys: [[0, {}]] },
  flinch: { dur: 0.3, keys: [[0.08, { e: 'o', spX: -0.05, hdX: -0.1, bZ: -0.04, yaw: 0.5 }]] },
  backstep: { dur: 0.5, keys: [[0.16, { bY: -0.1, pitch: -0.1, ...STEP_BACK }], [0.44, { bY: -0.18, ...WIDE }]] },
  sidestep: { dur: 0.46, keys: [[0.14, { bY: -0.1, roll: 0.1 }], [0.36, { bY: -0.16, roll: 0.04 }]] },
  stagger: { dur: 0.9, keys: [[0.14, { e: 'o', pitch: -0.2, bZ: -0.1, bY: -0.18, two: 0, rH: [-0.3, -0.2, 0.1], sw: [-1.6, 0.2], lH: [0.3, 0.0, 0.1], hdX: -0.2, ...STEP_BACK }], [0.6, { pitch: -0.08, bY: -0.2 }]] },
  recoil: { dur: 1.1, keys: [[0.12, { e: 'o', pitch: -0.24, bZ: -0.1, rH: [-0.1, 0.2, 0.15], sw: [-0.5, 1.2], hdX: -0.2, ...STEP_BACK }], [0.7, { pitch: -0.12, sw: [-0.6, 0.6] }]] },
  reeling: { dur: 1.5, keys: [[0.14, { e: 'o', two: 0, pitch: -0.32, bZ: -0.14, bY: -0.14, yaw: -0.2, rH: [-0.34, 0.05, 0.05], sw: [-2.2, 0.4], lH: [0.32, 0.1, 0.0], hdX: -0.3 }], [1.1, { pitch: -0.05, bY: -0.2 }]] },
  trampled: { dur: 1.5, keys: [[0.12, { e: 'o', pitch: 0.4, bY: -0.34, bZ: 0.1, hdX: 0.45 }], [1.0, { e: 'o', pitch: -0.2, bY: -0.18, ...STEP_BACK }]] },
  lock: { dur: 3, hold: true, keys: [[0.1, { e: 'o', two: 1, bY: -0.24, bZ: 0.08, pitch: 0.12, yaw: 0.3, sw: [0.3, 0.6] }], [3, { two: 1, bY: -0.26, bZ: 0.1, pitch: 0.14, yaw: 0.3, sw: [0.3, 0.62] }]] },
  /** Broken: the suit down on one knee, the lance's butt planted, the helm bowed (the deathblow's opening). */
  broken: { dur: 4.5, hold: true, keys: [[0.3, { e: 'o', ...KNEEL_LANCE, sw: [-0.4, 0.9] }], [4.5, { ...KNEEL_LANCE, hdX: 0.45, sw: [-0.4, 0.85] }]] },
  executed: { dur: 1.2, hold: true, keys: [[0.0, { ...KNEEL_LANCE }], [0.22, { e: 'o', ...KNEEL_LANCE, pitch: -0.3, hdX: -0.35 }], [1.2, { ...KNEEL_LANCE, pitch: 0.3, hdX: 0.55 }]] },
  death: { dur: 2.6, hold: true, keys: [[0.5, { e: 'o', ...KNEEL_LANCE }], [2.6, { ...KNEEL_LANCE, bY: -0.7, pitch: 0.9 }]] },
  meditate: { dur: 1, hold: true, keys: [[0, { ...KNEEL_LANCE }]] },
  /** The intro: gears turn, the suit rises off its knee and swings the lance down into its guard. */
  intro: {
    dur: TUNING.intro.dur,
    keys: [
      [0, { ...KNEEL_LANCE }],
      [0.8, { ...KNEEL_LANCE, hdX: 0.3 }],
      [1.6, { two: 0, bY: -0.12, pitch: 0.0, yaw: 0.2, hdX: 0.05, rH: [-0.06, -0.16, 0.3], sw: [-0.2, 1.3], swF: [1, 0, 0], lH: [0.14, -0.4, 0.1], ...WIDE }],
      [2.2, { two: 1, bY: -0.22, pitch: 0.1, yaw: 0.4, rH: [0.06, -0.2, 0.3], sw: [-0.8, 0.3], ...WIDE }],
    ],
  },
};
const PILOT_CLIPS = {
  ...GUARD_CLIPS,
  flinch: { dur: 0.26, keys: [[0.07, { e: 'o', spX: -0.06, hdX: -0.12, bZ: -0.05, yaw: 0.46 }]] },
  backstep: { dur: 0.42, keys: [[0.14, { bY: -0.04, pitch: -0.12, rF: [-0.1, 0.14, 0.3], lF: [0.13, 0.16, 0.12], flat: 0.3 }], [0.38, { bY: -0.14, ...STEP_BACK, flat: 0.9 }]] },
  sidestep: { dur: 0.38, keys: [[0.12, { bY: -0.06, roll: 0.14 }], [0.3, { bY: -0.1, roll: 0.06 }]] },
  stagger: { dur: 0.8, keys: [[0.12, { e: 'o', pitch: -0.2, bZ: -0.1, bY: -0.14, rH: [-0.3, -0.2, 0.1], sw: [-1.7, 0.2], lH: [0.3, 0.0, 0.1], hdX: -0.2, ...STEP_BACK }], [0.5, { pitch: -0.08, bY: -0.16 }]] },
  recoil: { dur: 1.0, keys: [[0.1, { e: 'o', pitch: -0.24, bZ: -0.1, rH: [-0.1, 0.2, 0.15], sw: [-0.5, 1.4], lH: [0.3, 0.05, 0.05], hdX: -0.2, ...STEP_BACK }], [0.6, { pitch: -0.12, sw: [-0.6, 0.8] }]] },
  reeling: { dur: 1.45, keys: [[0.12, { e: 'o', pitch: -0.32, bZ: -0.14, bY: -0.12, yaw: -0.2, rH: [-0.34, 0.05, 0.05], sw: [-2.3, 0.45], lH: [0.32, 0.1, 0.0], hdX: -0.3 }], [1.1, { pitch: -0.05, bY: -0.18 }]] },
  trampled: { dur: 1.5, keys: [[0.1, { e: 'o', pitch: 0.42, bY: -0.34, bZ: 0.1, hdX: 0.45, rF: [-0.08, 0.7], lF: [0.22, -0.48] }], [1.0, { e: 'o', pitch: -0.2, bY: -0.16, ...STEP_BACK }]] },
  lock: { dur: 3, hold: true, keys: [[0.1, { e: 'o', two: 0.8, bY: -0.22, bZ: 0.08, pitch: 0.12, yaw: 0.3, rH: [0.08, 0.0, 0.44], sw: [0.5, 0.95], swF: [0, 0.3, -1], rF: [-0.1, 0.4], lF: [0.2, -0.42] }], [3, { two: 0.8, bY: -0.24, bZ: 0.1, pitch: 0.14, yaw: 0.3, rH: [0.08, 0.0, 0.45], sw: [0.46, 0.97], swF: [0, 0.3, -1] }]] },
  broken: { dur: 4.5, hold: true, keys: [[0.25, { e: 'o', two: 0, ...KNEEL, rH: [-0.15, -0.4, 0.3], sw: [-0.6, -1.0], lH: [0.05, -0.45, 0.15] }], [4.5, { two: 0, ...KNEEL, hdX: 0.4, rH: [-0.15, -0.38, 0.3], sw: [-0.6, -0.95], lH: [0.05, -0.43, 0.15] }]] },
  executed: { dur: 1.2, hold: true, keys: [[0.0, { two: 0, ...KNEEL, sw: [-0.6, -1.0] }], [0.2, { e: 'o', two: 0, ...KNEEL, pitch: -0.3, hdX: -0.35, sw: [-1.4, -0.4] }], [1.2, { two: 0, ...KNEEL, pitch: 0.24, hdX: 0.5, sw: [-0.5, -1.0] }]] },
  death: { dur: 2.6, hold: true, keys: [[0.4, { e: 'o', two: 0, ...KNEEL, sw: [-0.8, -0.9] }], [1.3, { two: 0, bY: -0.62, pitch: 0.16, hdX: 0.5, sw: [-1.0, -1.1], rF: [-0.13, -0.3], lF: [0.13, -0.3], rK: [-0.05, -0.6, 0.8], lK: [0.05, -0.6, 0.8], flat: 0.2 }], [2.6, { two: 0, bY: -0.8, pitch: 1.2, hdX: 0.3, sw: [-1.2, -0.3], rF: [-0.13, -0.5], lF: [0.13, -0.5], flat: 0.1 }]] },
  meditate: { dur: 1, hold: true, keys: [[0, { two: 0, ...KNEEL }]] },
  intro: { dur: 1.0, keys: [[0, { two: 0, ...KNEEL }], [0.8, {}]] },
};

/** Compiled reaction clips, one set per body (index 0 = the suit, 1 = the pilot). */
export const CLIPS_BY_BODY = [SUIT_CLIPS, PILOT_CLIPS].map((CL, i) => {
  const K = BODY_POSES[i];
  const out = Object.fromEntries(Object.entries(CL).map(([k, c]) => [k, K.compileClip(c.keys.map(([t, pose]) => ({ t, ...pose })), c.dur, { hold: !!c.hold })]));
  for (const [k, c] of Object.entries(out)) c.name = k;
  return out;
});
export const CLIP = CLIPS_BY_BODY[0];

// ---------------------------------------------------------------- realising a move
/** The moves as they are in phase `phase` with the breastplate on / off: the beats a phase or a plate
 *  decides are left out (`fromPhase`, `untilPhase`, `ifBreastLost`). */
const variant = (phase, breastLost) => Object.fromEntries(Object.entries(MOVES).map(([k, def]) => [k, {
  ...def, beats: def.beats.filter((b) => !(b.fromPhase > phase) && !(b.untilPhase < phase) && !(b.ifBreastLost && !breastLost)),
}]));
const REALISERS = new Map();
/** The realiser for (phase, breast lost), compiled round the stance of the body that phase is. */
function realiserFor(phase, breastLost) {
  const key = phase * 2 + (breastLost ? 1 : 0);
  let r = REALISERS.get(key);
  if (!r) {
    const K = BODY_POSES[phase >= 4 ? 1 : 0];
    r = makeRealise({ TUNING, MOVES: variant(phase, breastLost), compileClip: (keys, dur) => K.compileClip(keys, dur), completeBeat: K.completeBeat });
    REALISERS.set(key, r);
  }
  return r;
}
/**
 * A move as it will play this time (duelist/realise.js), compiled round its body's stance. A
 * transition is compiled in the phase it begins (the eject in the pilot's stance). `opts.breastLost`:
 * the Fire Lance's extra bolt (marshal.js passes the plate state); `opts.count`: his flurry's length.
 */
export function realise(name, phase = 1, rnd = Math.random, opts = null) {
  const def = MOVES[name];
  if (!def) return null;
  const ph = Math.max(1, Math.min(4, def.transition ? def.phase : phase));
  return realiserFor(ph, !!opts?.breastLost)(name, phase, rnd, opts);
}
