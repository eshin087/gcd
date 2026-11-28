import { TELL } from '../../../combat/rules.js';
import { DIM } from '../../player/model.js';
import { makeRealise } from '../duelist/realise.js';
import { GUARD_CLIPS } from '../duelist/guard.js';
import { lookOf } from '../duelist/lookSwitch.js';
import { motionize } from '../duelist/tellPose.js';
import { FORM_POSES, FORM_POSES_REF, GUARDS } from './poses.js';
import { refMove } from './refLook.js';
import { TUNING } from './tuning.js';
import { buildPace, paceOn, paceCue } from './pace.js';

// The Starless Lord's moves and reaction clips, as data (COMBAT.md → "The Starless Lord"). The format
// is the duelist's (ashDisciple/moves.js header; duelist/realise.js: `pick` alternatives, `fixed`
// windups). His own beat fields:
//   bolt: true            Void lightning: a long line zone from his casting hand (lord.js draws it)
//   pull: true            the Void pull: the hit drags the hero toward him instead of away
//   blink: { behind }     he vanishes as the windup starts and is behind the hero (lord.js beatMotion)
//   release: { style }    'push' (a wall of force) / 'crescent' (red sword-light) thrown at the impact
//   release: { style }    … or 'rift' (fissures of red light racing along the floor)
//   cast: { kind, ... }   'glaive' (the thrown blade), 'debris' (hurled stones), 'storm' (called lightning),
//                         'star' (the Dark Star: a drifting singularity that bursts)
//   grip: true            the Crushing Dark: the hit pins the hero to the floor (lord.js draws the crush)
//   cast: { kind }        … and 'hurl' / 'rain' / 'fall': the crater's pieces (terrain.js; the move is
//                         marked `terrain: kind`: his AI picks it only while there is a piece for it)
//   left: true            the off-hand blade strikes (form 2: its sweep trail, its glint)
// A move's `weight` is per FORM [1, 2, 3, 4] (0 = not in that form's moveset): each form has its own
// strings; a few spells are shared. Rules (checked by tests/integration/lord.mjs): a tell on every real
// hit, a move's first real windup >= TUNING.minFirstWindup in every form it is used in, impacts
// >= TUNING.minHitGap apart, feints never flash.

const N = TELL.NORMAL, B = TELL.BLUE, R = TELL.RED, K = TELL.BLACK;
const TAU = Math.PI * 2;
const PIV = DIM.pivot, ANK = DIM.ankle;

// ---------------------------------------------------------------- pose fragments
// (body-space hand offsets / blade [az, el]; feet model space [x, z] or [x, y, z]; see duelist/poses.js)
const SET = { rF: [-0.12, 0.36], lF: [0.2, -0.3] };
const SET_L = { lF: [0.14, 0.32], rF: [-0.2, -0.26], rFy: -0.8, lFy: 0.3 }; // the left foot leads
const STEP_IN = { rF: [-0.12, 0.64], lF: [0.22, -0.4], rK: [-0.25, 0, 1], lK: [0.6, -0.2, 0.8], lFy: 0.95 };
const STEP_L = { lF: [0.14, 0.6], rF: [-0.2, -0.36], lK: [0.25, 0, 1], rK: [-0.6, -0.2, 0.8], rFy: -0.95, lFy: 0.25 }; // the left foot steps in
const LUNGE_FEET = { rF: [-0.08, 0.9], lF: [0.22, -0.62], rK: [-0.1, 0, 1], lK: [0.35, -0.3, 0.9], rFy: -0.05, lFy: 0.95 };
const COIL = { bY: -0.22, bZ: -0.08, yaw: 0.85, hip: 0.14, spY: 0, spX: 0.06, rH: [-0.08, -0.22, 0.0], rP: [-0.6, -0.6, -0.5], sw: [-0.9, 0.04], swF: [1, 0.1, 0], lH: [0.02, 0.0, 0.42], lP: [0.6, -0.3, 0.5], hdY: -0.75, ...SET };
const LUNGE = {
  bY: -0.3, bZ: 0.22, pitch: 0.1, yaw: 0.3, hip: -0.06, spX: 0.18, spY: -0.04, hdY: -0.26, hdX: 0.02,
  rH: [0.04, -0.04, 0.56], rP: [-0.7, -0.3, -0.2], sw: [-0.3, 0.02], swF: [1, 0.1, 0], lH: [0.2, -0.04, -0.34], lP: [0.7, -0.3, -0.6],
  ...LUNGE_FEET,
};
// (the hands above the brow and the blade steep behind them: laid back flatter it lay through his
// hat; the chop ends with his eyes still on the opponent, not on the floor)
const RAISED = { two: 1, rH: [0.1, 0.42, 0.08], rP: [-0.8, 0.4, -0.3], sw: [-0.2, 2.0], swF: [1, 0, 0], pitch: -0.12, bY: -0.04, spX: -0.06, hdX: 0.02, yaw: 0.2 };
const CHOP = { two: 1, rH: [0.1, -0.3, 0.46], rP: [-0.8, -0.3, 0], sw: [-0.12, -0.62], swF: [1, 0, 0], pitch: 0.24, bY: -0.32, spX: 0.16, hdX: -0.16, yaw: 0.12, rF: [-0.1, 0.76], lF: [0.22, -0.5] };
const STEP_BACK = { rF: [-0.12, 0.18], lF: [0.2, -0.38] };
const CROUCH = { bY: -0.52, pitch: 0.16, rF: [-0.46, 0.22], lF: [0.2, -0.1], rK: [-0.6, 0.3, 0.7], lK: [0.4, 0.2, 0.9], rFy: -0.7, flat: 0.8 };
/** A world-relative blade direction [az, el] in body space at that body yaw. */
const w2b = (w, y) => [w[0] - y, w[1]];

/** Thrust keys: the blade drawn back along the body at the cock, driven home on a long lunge. */
const thrustKeys = (two = 0, cock = 0.74) => {
  const T = two ? { two: 1 } : {};
  return [
    [cock * 0.5, { gather: true, ...COIL, ...T, bY: -0.18, rH: [-0.04, -0.18, 0.12] }],
    [cock, { ...COIL, ...T, rH: [-0.08, -0.24, -0.02], bY: -0.24 }],
    [1.0, { ...LUNGE, ...T, e: 'i', bZ: 0.16, rH: [0.04, -0.05, 0.49] }],
    [1.6, { ...LUNGE, ...T, e: 'o', bZ: 0.27, rH: [0.05, -0.03, 0.58] }],
    [2.0, { settle: true, ...LUNGE, ...T, bZ: 0.2 }],
  ];
};

/**
 * A cut with the MAIN blade, as the blade's path (duelist/poses.js `arm`: the hand follows it).
 * World-relative blade directions [az, el] (az 0 = at the opponent, + = his left): `from` where it is
 * cocked, `through` at the impact, `to` the follow-through; `yaw` = the body's turn at the three
 * points. `two`: both hands on the hilt.
 */
function slash(o) {
  return withForm(slash0(o, FREE_0), slash0(o, FREE_F));
}
// (the form pass, ADR-251: each key helper pairs its keys with the form's through FORM; a beat's
// `formKeys` is made from them after the table is built, played while `?lordForm` is on)
const FORM = new WeakMap();
const withForm = (keys, alt) => (FORM.set(keys, alt), keys);
/** The free hand through a cut: gathered, cocked, at the strike, the follow-through, settled. */
const FREE_0 = { gather: [0.04, -0.1, 0.32], cock: [0.0, -0.13, 0.32], strike: [0.26, -0.1, -0.16], follow: [0.3, -0.04, -0.22], settle: [0.28, -0.06, -0.18] };
// (the form: gathered by the sternum, split to his left in opposition as the steel goes out: half the
// travel, so a string of cuts no longer pumps the arm back and forth through every blow; ADR-250's)
const FREE_F = { gather: [0.06, -0.08, 0.24], cock: [0.05, -0.1, 0.26], strike: [0.22, -0.06, -0.02], follow: [0.26, -0.03, -0.08], settle: [0.24, -0.05, -0.06] };
function slash0({ from, through, to, yaw: [y0, y1, y2], cock = 0.7, sink = 0, two = 0, step = 'R', extra = {} }, FH = FREE_0) {
  const dir = Math.sign(to[0] - from[0]) || 0;
  const gy = (y0 + 0.3) / 2;
  const T = two ? { two: 1 } : {};
  // the free hand: before the chest at the cock (the elbow down), swept back low in the strike
  const free = (v, pole) => (two ? {} : pole ? { lH: v, lP: pole } : { lH: v });
  // `step`: which foot drives into the cut ('R' / 'L'): a string alternates them, so he walks through it
  const set = step === 'L' ? SET_L : SET, into = step === 'L' ? STEP_L : STEP_IN;
  return [
    [cock * 0.45, { gather: true, ...T, arm: 0.7, ext: 0.6, lead: 0.05 * dir, yaw: gy, sw: w2b([from[0] * 0.55, from[1] * 0.55 + 0.08], gy), bY: -0.18 - sink * 0.5, bZ: -0.03, roll: 0.03 * dir, ...free(FH.gather), ...set }],
    [cock, { ...T, arm: 1, ext: 0.5, lead: 0.22 * dir, yaw: y0, sw: w2b(from, y0), bY: -0.23 - sink, bZ: -0.07, pitch: 0.06, roll: 0.08 * dir, hip: 0.1 * dir, ...free(FH.cock, [0.6, -0.8, 0.1]), ...set, ...extra.cocked }],
    [1.0, { ...T, e: 'i', arm: 1, ext: 1, lead: 0, yaw: y1, sw: w2b(through, y1), bY: -0.3 - sink, bZ: 0.12, pitch: 0.13, roll: -0.05 * dir, hip: -0.06 * dir, ...free(FH.strike, [0.8, -0.4, -0.5]), ...into, ...extra.strike }],
    [1.6, { ...T, e: 'o', arm: 1, ext: 0.88, lead: -0.32 * dir, yaw: y2, sw: w2b(to, y2), bY: -0.25 - sink, bZ: 0.1, pitch: 0.06, roll: -0.1 * dir, hip: -0.12 * dir, ...free(FH.follow), ...into, ...extra.follow }],
    [2.0, { settle: true, ...T, arm: 1, ext: 0.84, lead: -0.26 * dir, yaw: y2, sw: w2b([to[0] * 0.94, to[1] * 0.9], y2), bY: -0.23 - sink, bZ: 0.08, roll: -0.06 * dir, ...free(FH.settle), ...into }],
  ];
}

/** The same with the OFF-HAND blade (form 2): `lsw` and the left arm driven by it. */
function slashL({ from, through, to, yaw: [y0, y1, y2], cock = 0.7, sink = 0 }) {
  const dir = Math.sign(to[0] - from[0]) || 0;
  const gy = (y0 + 0.22) / 2;
  return [
    [cock * 0.45, { gather: true, larm: 0.7, lext: 0.6, llead: 0.05 * dir, yaw: gy, lsw: w2b([from[0] * 0.55, from[1] * 0.55 + 0.08], gy), bY: -0.2 - sink * 0.5, bZ: -0.03 }],
    [cock, { larm: 1, lext: 0.5, llead: 0.22 * dir, yaw: y0, lsw: w2b(from, y0), bY: -0.24 - sink, bZ: -0.06, pitch: 0.08, hip: 0.1 * dir }],
    [1.0, { e: 'i', larm: 1, lext: 1, llead: 0, yaw: y1, lsw: w2b(through, y1), bY: -0.28 - sink, bZ: 0.1, pitch: 0.1, hip: -0.06 * dir, ...STEP_L }],
    [1.6, { e: 'o', larm: 1, lext: 0.88, llead: -0.32 * dir, yaw: y2, lsw: w2b(to, y2), bY: -0.24 - sink, bZ: 0.08, pitch: 0.04, hip: -0.12 * dir, ...STEP_L }],
    [2.0, { settle: true, larm: 1, lext: 0.84, llead: -0.26 * dir, yaw: y2, lsw: w2b([to[0] * 0.94, to[1] * 0.9], y2), bY: -0.22 - sink, bZ: 0.06, ...STEP_L }],
  ];
}

/** The blade paths strings are made of (world-relative, see slash). */
const PATHS = {
  rise: { from: [-2.0, -0.62], through: [0.0, 0.05], to: [1.55, 0.95], yaw: [0.1, 0.5, 0.85], ang: 0.95 }, // low right → high left
  back: { from: [1.55, 0.8], through: [0.0, -0.02], to: [-1.75, -0.5], yaw: [0.95, 0.55, 0.12], ang: 0.95 }, // high left → low right
  flat: { from: [-1.95, 0.1], through: [0.0, 0.04], to: [1.75, 0.06], yaw: [0.05, 0.5, 0.95], ang: 1.0 }, // level, right → left
  flatBack: { from: [1.85, 0.14], through: [0.0, 0.04], to: [-1.8, 0.02], yaw: [1.0, 0.55, 0.1], ang: 1.0 }, // level, left → right
  diag: { from: [-1.2, 1.1], through: [0.0, 0.15], to: [1.4, -0.75], yaw: [0.25, 0.55, 0.9], ang: 0.85 }, // high right → low left
};
/** The off-hand blade's paths: the mirror images (it starts on his left). */
const mirror = (P) => ({ from: [-P.from[0], P.from[1]], through: [-P.through[0], P.through[1]], to: [-P.to[0], P.to[1]], yaw: P.yaw.map((y) => 0.3 - y), ang: P.ang });
const PATHS_L = Object.fromEntries(Object.entries(PATHS).map(([k, P]) => [k, mirror(P)]));

/** The overhead: raised two-handed, then a stepping chop. */
const CHOPS = new WeakSet(); // (the form pass: keys whose two-handed raise and chop it puts on a diagonal)
const overKeys = (cock = 0.7) => {
  const k = overKeys0(cock);
  CHOPS.add(k);
  return k;
};
const overKeys0 = (cock = 0.7) => [
  [cock * 0.5, { gather: true, ...RAISED, rH: [0.1, 0.3, 0.14], sw: [-0.2, 1.5], bY: -0.1, ...SET }],
  [cock, { ...RAISED, sw: [-0.2, 2.05], rF: [-0.12, 0.42], lF: [0.2, -0.28] }],
  [1.0, { ...CHOP, e: 'i' }],
  [1.6, { ...CHOP, e: 'o', bY: -0.4, pitch: 0.3, sw: [-0.12, -0.8], rH: [0.1, -0.36, 0.42] }],
  [2.0, { settle: true, ...CHOP, bY: -0.34 }],
];

/** A spin: wound up, then a full turn with the blade(s) out level (a ring). `twin`: both blades out;
 *  `two`: the staff held level across him (both its blades sweep). */
const rotXZ = (x, z, a) => [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
/** Both feet carried `ph` rad round with the body (a turn on the spot), `y` m off the floor: without
 *  it a full turn of the hips over planted feet winds the legs round each other. */
const spinFeet = (ph, y = ANK) => {
  const r = rotXZ(-0.13, 0.3, ph), l = rotXZ(0.2, -0.28, ph);
  return { rF: [r[0], y, r[1]], lF: [l[0], y, l[1]], rFy: -0.25 + ph, lFy: 0.9 + ph };
};
const spinKeys = (cock = 0.66, o = {}) => (o.low ? withForm(spinKeys0(cock, o), sweepKeysF(cock, o)) : spinKeys0(cock, o));
const spinKeys0 = (cock = 0.66, { low = false, twin = false, two = 0 } = {}) => {
  const Bd = low ? { ...CROUCH } : { bY: -0.22 };
  const T = two ? { two: 1 } : {};
  const out = { ...T, arm: 1, ext: 1, lead: 0, sw: low ? [-1.45, -0.44] : [-1.45, -0.04], ...(twin ? { larm: 1, lext: 1, llead: 0, lsw: low ? [1.45, -0.44] : [1.45, -0.04] } : two ? {} : { lH: [0.3, low ? -0.12 : 0.04, 0.08], lP: [0.9, 0.1, -0.2] }) };
  const wound = { ...Bd, ...T, arm: 1, ext: 0.55, lead: -0.2, yaw: 1.2, sw: low ? [-2.1, -0.5] : [-2.15, -0.12], ...(twin ? { larm: 1, lext: 0.55, lsw: low ? [0.9, -0.5] : [0.85, -0.12] } : {}), hdY: -1.0 };
  if (low) {
    // the low sweep: he drops and the blade goes round at the ankles; the feet stay under him
    return [
      [cock, { ...wound }],
      [1.0, { ...Bd, ...out, e: 'i', yaw: 0.9, hdY: -0.6 }],
      [2.0, { ...Bd, ...out, e: 'l', yaw: 0.9 - TAU, hdY: -0.6 }],
      [2.001, { e: 'h', yaw: 0.9 }],
    ];
  }
  // the whirl: wound up on bent legs, then a hop that carries the whole body round once
  const turn = (u, k, hop) => [u, { e: 'l', yaw: 0.9 - TAU * k, bY: -0.22 + 0.1 * hop, roll: -0.1 * hop, ...spinFeet(-TAU * k, ANK + 0.16 * hop), flat: 0.95 - 0.6 * hop }];
  return [
    [cock, { ...wound, bY: -0.3, ...spinFeet(0.3) }],
    [1.0, { ...Bd, ...out, e: 'i', yaw: 0.9, hdY: -0.6, roll: 0, ...spinFeet(0), flat: 0.95 }],
    turn(1.25, 0.25, 1),
    turn(1.5, 0.5, 1),
    turn(1.75, 0.75, 0.7),
    [2.0, { ...Bd, ...out, e: 'l', yaw: 0.9 - TAU, hdY: -0.6, roll: 0, ...spinFeet(-TAU), flat: 0.95 }],
    [2.001, { e: 'h', yaw: 0.9, ...spinFeet(0) }],
  ];
};

/** A foot's model-space target for a body pitched th rad forward round the waist (a flip: the legs
 *  go round with the body), the leg tucked to length L. */
const flipFoot = (th, x, L = 0.5) => [x, PIV - 0.12 - L * Math.cos(th), -L * Math.sin(th)];
/** The somersault: a crouch, a forward flip in the air (the beat's `lift` carries him up), and a
 *  two-handed chop as he lands. */
function flipKeys(o = {}) {
  const k = flipKeys0(o);
  CHOPS.add(k);
  return k;
}
function flipKeys0({ cock = 0.36 } = {}) {
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
    [1.6, { ...CHOP, e: 'o', bY: -0.34, pitch: 0.38, sw: [-0.12, -0.78] }],
    [2.0, { ...CHOP, bY: -0.32 }],
  ];
}
const FLIP_LIFT = (cock = 0.36, apex = 1.5) => [[cock, 0], [cock + (1 - cock) * 0.5, apex], [1.0, 0]];

/** A foot's model-space target for a body rolled ro rad round its fore-aft axis (a cartwheel: the
 *  legs go over with the body), `side` −1 right / +1 left, the legs split fore and aft. */
const rollFoot = (ro, side, L = 0.6) => {
  const bx = side * 0.14;
  return [bx * Math.cos(ro) + L * Math.sin(ro), PIV - 0.1 + bx * Math.sin(ro) - L * Math.cos(ro), -side * 0.16];
};
/** The aerial: a crouch, a hands-free cartwheel in the air with the blade carried round over him
 *  (the beat's `lift`), and a diagonal cut as he lands. `twin`: the off-hand blade goes round too. */
function aerialKeys({ cock = 0.34, two = 0, twin = false } = {}) {
  const T = two ? { two: 1 } : {};
  const u = (k) => cock + (1 - cock) * k;
  const L = twin ? { larm: 0, lH: [0.26, 0.26, 0.04], lP: [0.9, 0.4, -0.2], lsw: [0.4, 1.2] } : two ? {} : { lH: [0.3, 0.2, 0.0], lP: [0.9, 0.3, -0.3] };
  const air = (k, e = 'l') => {
    const ro = TAU * k;
    return [u(k), { e, ...T, arm: 0, roll: ro, bY: -0.1, pitch: 0.1, yaw: 0.35, rH: [-0.24, 0.28, 0.06], rP: [-0.9, 0.4, -0.2], sw: [-0.4, 1.25], ...L, rF: rollFoot(ro, -1), lF: rollFoot(ro, 1, 0.5), rK: [-0.2, 0.2, 1], lK: [0.2, 0.2, 1], flat: 0, hdY: -0.2 }];
  };
  const P = PATHS.diag, land = { ...T, arm: 1, ext: 1, lead: 0, yaw: P.yaw[1], sw: w2b(P.through, P.yaw[1]), bY: -0.36, bZ: 0.1, pitch: 0.16, ...STEP_IN, flat: 0.95, ...(twin ? { larm: 1, lext: 0.7, lsw: [1.5, 0.3] } : two ? {} : { lH: [0.3, 0.06, -0.24] }) };
  return [
    [cock * 0.6, { ...T, bY: -0.44, pitch: 0.16, yaw: 0.3, roll: -0.12, rH: [-0.16, -0.2, 0.2], sw: [-1.2, 0.5], rF: [-0.16, 0.24], lF: [0.18, -0.22], rK: [-0.3, 0.1, 1], lK: [0.4, 0.1, 1] }],
    air(0, 'o'),
    air(0.28),
    air(0.56),
    air(0.84),
    [1.0, { ...land, e: 'l', roll: TAU }],
    [1.001, { e: 'h', roll: 0 }],
    [1.6, { ...land, e: 'o', lead: -0.3, yaw: P.yaw[2], sw: w2b(P.to, P.yaw[2]), bY: -0.3, pitch: 0.08 }],
    [2.0, { ...land, lead: -0.26, yaw: P.yaw[2], sw: w2b([P.to[0] * 0.94, P.to[1] * 0.9], P.yaw[2]), bY: -0.26 }],
  ];
}
/** The backflip (he throws himself away from the opponent: the beat's `travel` and `lift`), and a
 *  level cut as he lands that lets fly whatever the beat releases. */
function backflipKeys({ cock = 0.3, two = 0 } = {}) {
  const T = two ? { two: 1 } : {};
  const u = (k) => cock + (1 - cock) * k;
  const air = (k, e = 'l') => {
    const th = -TAU * k;
    return [u(k), { e, ...T, arm: 0, pitch: th, bY: -0.1, yaw: 0.2, rH: [-0.2, 0.0, 0.26], rP: [-0.8, -0.2, -0.3], sw: [-1.5, 0.2], ...(two ? {} : { lH: [0.26, 0.04, 0.2] }), rF: flipFoot(th, -0.11, 0.46), lF: flipFoot(th, 0.13, 0.4), rK: [-0.2, 0.4, 1], lK: [0.2, 0.4, 1], flat: 0 }];
  };
  const cutPose = { ...T, arm: 1, ext: 1, lead: 0, yaw: 0.5, sw: w2b([0.0, 0.04], 0.5), bY: -0.32, bZ: 0.06, pitch: 0.12, rF: [-0.12, 0.3], lF: [0.2, -0.4], flat: 0.95, ...(two ? {} : { lH: [0.3, 0.06, -0.24] }) };
  return [
    [cock * 0.55, { ...T, bY: -0.42, pitch: 0.12, yaw: 0.3, rH: [-0.1, -0.24, 0.26], sw: [-0.4, 0.3], rF: [-0.13, 0.22], lF: [0.17, -0.1], rK: [-0.2, 0.2, 1], lK: [0.3, 0.2, 1] }],
    air(0, 'o'),
    air(0.3),
    air(0.6),
    [u(0.86), { ...air(0.86)[1], arm: 0.6, ext: 0.5, sw: w2b([-1.9, 0.1], 0.2) }],
    [1.0, { ...cutPose, e: 'l', pitch: -TAU + 0.12 }],
    [1.001, { e: 'h', pitch: 0.12 }],
    [1.6, { ...cutPose, e: 'o', lead: -0.3, yaw: 0.9, sw: w2b([1.7, 0.06], 0.9), bY: -0.28 }],
    [2.0, { ...cutPose, lead: -0.26, yaw: 0.9, sw: w2b([1.6, 0.05], 0.9), bY: -0.26 }],
  ];
}

/** The perilous thrust (red; a mikiri answers it): a deep coil, held a beat, then a long lunge. */
const PERIL_COIL = { ...COIL, bY: -0.34, bZ: -0.14, yaw: 0.95, rH: [-0.12, -0.32, -0.08], sw: [-1.0, -0.08], lH: [0.28, 0.06, 0.1], lP: [0.9, 0.2, -0.2], hdY: -0.8, rF: [-0.12, 0.34], lF: [0.2, -0.38] };
const PERIL_LUNGE = { ...LUNGE, bZ: 0.3, bY: -0.34, rF: [-0.08, 1.05], lF: [0.22, -0.68], lH: [0.2, 0.08, -0.44] };
const perilKeys = (two = 0) => {
  const T = two ? { two: 1 } : {};
  return [[0.4, { gather: true, ...PERIL_COIL, ...T }], [0.84, { ...PERIL_COIL, ...T, bY: -0.36, rH: [-0.14, -0.33, -0.1] }], [1.0, { ...PERIL_LUNGE, ...T, e: 'i' }], [1.6, { ...PERIL_LUNGE, ...T, e: 'o', bZ: 0.34 }], [2.0, { ...PERIL_LUNGE, ...T }]];
};

// ---------------------------------------------------------------- the form pass (ADR-251): fragments
// What the audit found at the impacts (tests/integration/swordAudit.mjs, `lord.mjs . audit` with
// GCD_AUDIT_IMPACT=1), after ADR-226: a thrust landed on a bent arm (121 - 140°) with the point 18 - 23° off
// the line of the arm, the long lunges on two locked knees (176 / 176°: the feet set wider than his legs
// reach); the two-handed overheads (Falling Star, Grasp and Sever's chop, Severance, every string's held
// chop) came straight down (the point's path 71 - 80° off level: one upright bar at the game camera); the low
// sweeps (Reaping Arc, Red Meridian's second blow, every red sweep that ends a string) turned his hips a full
// circle over feet that stayed put (the legs crossed by 0.73 m, the knee popped 630 mm a frame²); the front
// foot was still in the air at most impacts (15 - 25 cm: the foot planner steps only once the key has
// drifted 14 cm, then takes ~0.1 s). Played instead of the beats' own keys while `?lordForm` is on.
const G1 = GUARDS[0];
const LIFT = ANK + 0.08; // a foot in its step, off the floor (the planner leaves a foot this high to the clip)
/** The sword hand on the blade's own line out of the shoulder: [az, el] in body space, `r` m out. */
const reachLine = (az, el, r) => [Math.sin(az) * Math.cos(el) * r, Math.sin(el) * r - 0.02, Math.cos(az) * Math.cos(el) * r];
/** A lunge's feet round the hips at `bZ`: the front shin upright over its foot, the back leg long behind,
 *  as far as his legs reach at a lunge's depth. */
const lungeFeet = (bZ, front = 0.42, back = 0.62) => ({ rF: [-0.1, bZ + front], lF: [0.2, bZ - back], rK: [-0.15, 0, 1], lK: [0.35, -0.3, 0.9] });
/** The lunge (a thrust's strike): hips sunk, the arm long and the point on its line, the free hand back
 *  (both hands on the hilt in forms 3 - 4: the grip carries the free hand, the line the same). */
const lungeF = (k, u, deep = false) => {
  const bZ = k.bZ ?? G1.bZ, sw = k.sw ?? LUNGE.sw;
  return {
    bY: Math.min(k.bY ?? -0.3, deep ? -0.4 : -0.34),
    rH: reachLine(sw[0], sw[1], u < 1.3 ? 0.6 : 0.62), rP: [-0.75, -0.25, -0.3], // (past full reach: TUNING.formMotion.armSoft opens the arm to ~160°)
    ...lungeFeet(Math.min(bZ, 0.24), deep ? 0.48 : 0.44, deep ? 0.8 : 0.74),
    ...((k.two ?? 0) > 0.5 ? {} : { lH: [0.24, 0.08, -0.3], lP: [0.7, -0.2, -0.6] }),
  };
};
/** The low sweep: the same crouch, but the feet go round with him (the right leg sweeps the floor, the
 *  left turns on its ball), each just off the floor so the clip carries them. */
const sweepFeet = (ph) => {
  const r = rotXZ(CROUCH.rF[0], CROUCH.rF[1], ph), l = rotXZ(CROUCH.lF[0], CROUCH.lF[1], ph);
  return { rF: [r[0], ANK + 0.04, r[1]], lF: [l[0], ANK + 0.04, l[1]], rFy: CROUCH.rFy + ph, lFy: 0.9 + ph };
};
function sweepKeysF(cock, o) {
  const k = spinKeys0(cock, o);
  const at = (u, ph) => [u, { e: 'l', yaw: 0.9 + ph, ...sweepFeet(ph) }];
  return [
    k[0],
    [1.0, { ...k[1][1], ...sweepFeet(0) }],
    at(1.25, -TAU * 0.25),
    at(1.5, -TAU * 0.5),
    at(1.75, -TAU * 0.75),
    [2.0, { ...k[2][1], yaw: 0.9 - TAU, ...sweepFeet(-TAU) }],
    [2.001, { e: 'h', yaw: 0.9, ...sweepFeet(0), rF: CROUCH.rF, lF: CROUCH.lF }],
  ];
}
/** The two-handed chop (the overheads', the somersault's landing) as a diagonal: raised over his sword
 *  shoulder, it comes down through the opponent to low at his left (world [az, el] through a body yaw).
 *  His hands stay together on the hilt (the Lord's chop is two-handed; Shen Hui's became one-handed). */
const W2B = (az, yaw) => az - yaw;
const RAISED_F = { yaw: 0.1, sw: [W2B(-1.1, 0.1), 1.15], rH: [-0.1, 0.36, 0.08], rP: [-0.8, 0.4, -0.3] };
const CHOP_F = { yaw: 0.3, sw: [W2B(0.15, 0.3), -0.3], rH: [0.0, -0.2, 0.46], pitch: 0.18, spX: 0.12, hdX: -0.1 };
const CHOP_FOLLOW = { yaw: 0.55, sw: [W2B(1.0, 0.55), -0.85], rH: [0.12, -0.34, 0.36] };

// ---------------------------------------------------------------- the casting hand
/** The Void push: the free hand drawn back to the hip, then the palm thrown forward. */
const pushKeys = () => [
  [0.55, { two: 0, yaw: 0.7, bY: -0.22, bZ: -0.06, lH: [0.16, -0.3, 0.02], lP: [0.9, -0.3, -0.5], rH: [-0.1, -0.24, 0.12], sw: [-1.3, 0.2], hdY: -0.6, ...SET }],
  [1.0, { e: 'i', two: 0, yaw: 0.05, bY: -0.26, bZ: 0.12, pitch: 0.12, lH: [0.0, -0.02, 0.54], lP: [0.7, -0.5, 0.2], rH: [-0.16, -0.28, -0.05], sw: [-1.9, -0.1], hdY: -0.05, ...STEP_L }],
  [2.0, { two: 0, yaw: 0.05, bY: -0.24, bZ: 0.1, lH: [0.0, 0.0, 0.52], rH: [-0.16, -0.28, -0.05], sw: [-1.9, -0.1], ...STEP_L }],
];
/** Void lightning: the hand raised by the shoulder, crackling, then levelled at the hero. */
const boltKeys = (cock = 0.7) => [
  [cock, { two: 0, yaw: 0.55, bY: -0.16, pitch: -0.04, lH: [0.22, 0.14, 0.16], lP: [0.9, 0.1, -0.4], rH: [-0.08, -0.26, 0.16], sw: [-1.2, -0.3], hdY: -0.5 }],
  [1.0, { e: 'i', two: 0, yaw: 0.12, bY: -0.2, bZ: 0.06, pitch: 0.06, lH: [0.02, 0.03, 0.54], lP: [0.7, -0.4, 0.1], rH: [-0.12, -0.28, 0.05], sw: [-1.5, -0.3], hdY: -0.1 }],
  [2.0, { two: 0, yaw: 0.12, bY: -0.2, bZ: 0.06, lH: [0.02, 0.03, 0.54], rH: [-0.12, -0.28, 0.05], sw: [-1.5, -0.3] }],
];
/** The Void pull: the hand reaches out, closes, and is wrenched back to his chest. */
const pullKeys = () => [
  [0.6, { two: 0, yaw: 0.15, bY: -0.2, bZ: 0.08, lH: [0.02, 0.02, 0.54], lP: [0.7, -0.4, 0.1], rH: [-0.1, -0.2, 0.2], sw: [-1.1, 0.5], hdY: -0.1 }],
  [0.9, { two: 0, yaw: 0.15, bY: -0.22, bZ: 0.1, lH: [0.02, 0.0, 0.55], rH: [-0.1, -0.2, 0.2], sw: [-1.1, 0.5] }],
  [1.0, { e: 'i', two: 0, yaw: 0.6, bY: -0.2, bZ: -0.1, pitch: -0.1, lH: [0.12, -0.12, 0.12], lP: [0.9, -0.2, -0.5], rH: [-0.04, 0.0, 0.3], sw: [-0.5, 1.3], hdY: -0.5, ...STEP_BACK }],
  [2.0, { two: 0, yaw: 0.6, bY: -0.2, bZ: -0.1, lH: [0.12, -0.12, 0.12], rH: [-0.04, 0.0, 0.3], sw: [-0.5, 1.3], ...STEP_BACK }],
];
/** Hurled stones: the hand sweeps up from the floor (they rise with it), then is flung forward. */
const hurlKeys = () => [
  [0.3, { two: 0, yaw: 0.4, bY: -0.34, pitch: 0.14, lH: [0.2, -0.46, 0.2], lP: [0.9, -0.4, 0], rH: [-0.1, -0.24, 0.16], sw: [-1.2, 0.1], hdX: 0.2 }],
  [0.85, { two: 0, yaw: 0.5, bY: -0.12, pitch: -0.1, lH: [0.2, 0.42, 0.14], lP: [0.9, 0.3, -0.3], rH: [-0.1, -0.24, 0.16], sw: [-1.2, 0.1], hdX: -0.12 }],
  [1.0, { e: 'i', two: 0, yaw: 0.05, bY: -0.24, bZ: 0.1, pitch: 0.12, lH: [0.0, 0.0, 0.54], lP: [0.7, -0.5, 0.2], rH: [-0.14, -0.26, 0.0], sw: [-1.7, -0.1], ...STEP_L }],
  [2.0, { two: 0, yaw: 0.05, bY: -0.22, bZ: 0.08, lH: [0.0, 0.0, 0.52], rH: [-0.14, -0.26, 0.0], sw: [-1.7, -0.1], ...STEP_L }],
];
/** Called lightning: the blade and the free hand both thrown up to the sky. */
const stormKeys = () => [
  [0.5, { two: 0, yaw: 0.2, bY: -0.3, pitch: 0.12, lH: [0.14, -0.3, 0.2], rH: [-0.1, -0.3, 0.2], sw: [-0.6, -0.4], hdX: 0.2 }],
  [1.0, { e: 'i', two: 0, yaw: 0.1, bY: -0.04, pitch: -0.16, lH: [0.2, 0.5, 0.02], lP: [0.9, 0.5, -0.2], rH: [-0.16, 0.46, 0.06], rP: [-0.9, 0.4, -0.2], sw: [-0.1, 1.5], hdX: -0.3, spX: -0.1 }],
  [2.0, { two: 0, yaw: 0.1, bY: -0.04, pitch: -0.16, lH: [0.2, 0.5, 0.02], rH: [-0.16, 0.46, 0.06], sw: [-0.1, 1.5], hdX: -0.3 }],
];
/** The Crushing Dark: the open hand lifts toward the opponent, holds him in it, and closes: the
 *  fist is wrenched down. */
const gripKeys = () => [
  [0.3, { two: 0, yaw: 0.2, bY: -0.1, lH: [0.06, -0.02, 0.46], lP: [0.7, -0.4, 0.1], rH: [-0.08, -0.42, 0.02], sw: [-1.4, -0.7], hdX: 0.06, hdY: -0.1 }],
  [0.86, { two: 0, yaw: 0.14, bY: -0.07, pitch: -0.05, lH: [0.04, 0.13, 0.5], lP: [0.7, -0.2, 0.2], rH: [-0.1, -0.42, 0.0], sw: [-1.5, -0.7], hdX: 0.0, hdY: -0.06 }],
  [1.0, { e: 'i', two: 0, yaw: 0.32, bY: -0.18, pitch: 0.1, lH: [0.1, -0.2, 0.32], lP: [0.9, -0.3, -0.2], rH: [-0.1, -0.4, 0.0], sw: [-1.5, -0.6], hdX: 0.16, hdY: -0.2 }],
  [2.0, { two: 0, yaw: 0.32, bY: -0.18, pitch: 0.1, lH: [0.1, -0.2, 0.32], rH: [-0.1, -0.4, 0.0], sw: [-1.5, -0.6], hdX: 0.16 }],
];
/** The Rift: the staff raised upright in both hands, then driven point-down into the floor. */
const riftKeys = () => [
  [0.45, { two: 1, yaw: 0.1, bY: -0.05, pitch: -0.08, rH: [0.1, 0.22, 0.2], rP: [-0.8, 0.3, -0.3], sw: [0.0, 1.5], hdX: -0.08, ...SET }],
  [0.82, { two: 1, yaw: 0.08, bY: 0.0, pitch: -0.14, rH: [0.1, 0.3, 0.16], sw: [0.0, 1.62], hdX: -0.14 }],
  [1.0, { e: 'i', two: 1, yaw: 0.05, bY: -0.42, pitch: 0.3, spX: 0.16, rH: [0.1, -0.22, 0.36], rP: [-0.8, -0.3, 0], sw: [0.0, -1.3], hdX: 0.3, rF: [-0.14, 0.42], lF: [0.2, -0.38], rK: [-0.2, 0, 1], lK: [0.4, -0.4, 0.8] }],
  [2.0, { two: 1, yaw: 0.05, bY: -0.4, pitch: 0.28, rH: [0.1, -0.22, 0.36], sw: [0.0, -1.3], hdX: 0.26, rF: [-0.14, 0.42], lF: [0.2, -0.38] }],
];
/** The Dark Star: the free hand cupped before the chest while it gathers, then thrown up and out. */
const starKeys = () => [
  [0.55, { two: 0, yaw: 0.12, bY: -0.18, pitch: 0.1, lH: [-0.03, -0.14, 0.3], lP: [0.9, -0.5, 0.1], rH: [-0.2, -0.32, 0.14], sw: [-1.5, 0.3], hdX: 0.16 }],
  [0.85, { two: 0, yaw: 0.12, bY: -0.2, pitch: 0.12, lH: [-0.03, -0.12, 0.31], rH: [-0.2, -0.32, 0.14], sw: [-1.5, 0.3], hdX: 0.18 }],
  [1.0, { e: 'i', two: 0, yaw: 0.0, bY: -0.05, pitch: -0.12, spX: -0.08, lH: [0.06, 0.36, 0.34], lP: [0.9, 0.3, 0], rH: [-0.3, -0.2, 0.0], rP: [-0.9, 0.1, -0.3], sw: [-1.9, 0.5], hdX: -0.18 }],
  [2.0, { two: 0, yaw: 0.0, bY: -0.05, pitch: -0.12, lH: [0.06, 0.36, 0.34], rH: [-0.3, -0.2, 0.0], sw: [-1.9, 0.5], hdX: -0.18 }],
];
/** The thrown blade: wound far back across the body, then flung flat. */
const throwKeys = () => [
  [0.7, { two: 0, arm: 1, ext: 0.5, lead: 0.2, yaw: 1.15, bY: -0.24, bZ: -0.08, sw: w2b([2.4, 0.1], 1.15), hdY: -1.0, ...SET }],
  [1.0, { e: 'i', two: 0, arm: 1, ext: 1, lead: 0, yaw: 0.0, bY: -0.26, bZ: 0.14, pitch: 0.12, sw: w2b([0.0, 0.0], 0.0), hdY: 0, ...STEP_IN }],
  [2.0, { two: 0, arm: 0.6, ext: 0.8, yaw: -0.2, bY: -0.22, bZ: 0.1, sw: w2b([-0.9, -0.2], -0.2), ...STEP_IN }],
];

// ---------------------------------------------------------------- beat builders
/** The reach of each form's blade: sector / ring radius, a thrust's line. */
const REACH = [0, 2.3, 2.3, 2.95, 2.6];

/** One beat of a string. `kind`: a PATHS name, 'over', 'thrust', 'flip'; `o`: { form, left, ...overrides }. */
function cut(kind, tell, windup, damage, o = {}) {
  const { form = 1, left = false, step = 'R', ...extra } = o;
  const two = form >= 3 ? 1 : 0, r = REACH[form];
  const kb = tell === N ? 0.7 : 1.5;
  if (kind === 'thrust') {
    return { tell, windup, active: 0.1, damage, knockback: kb, zone: { kind: 'line', r: r - 0.25, w: 0.7 }, dash: { from: 0.7, to: 1.0, stop: 1.0, max: 2.4 }, keys: thrustKeys(two, extra.cock ?? 0.74), ...extra };
  }
  if (kind === 'over') {
    return { tell, windup, active: 0.1, damage, knockback: 1.6, zone: { kind: 'sector', r: r + 0.05, ang: 0.5 }, keys: overKeys(extra.cock ?? 0.7), ...extra };
  }
  if (kind === 'flip') {
    const cock = extra.cock ?? 0.36;
    return { tell, windup, active: 0.1, damage, knockback: 1.8, zone: { kind: 'sector', r: r + 0.1, ang: 0.6 }, close: 2.6, lift: FLIP_LIFT(cock, 1.5), track: 0.5, keys: flipKeys({ cock }), ...extra, cock };
  }
  if (kind === 'aerial') {
    const cock = extra.cock ?? 0.34;
    return { tell, windup, active: 0.1, damage, knockback: 1.6, zone: { kind: 'sector', r: r + 0.1, ang: 0.85 }, close: 2.4, lift: FLIP_LIFT(cock, 1.15), track: 0.5, keys: aerialKeys({ cock, two, twin: form === 2 }), ...extra, cock };
  }
  const P = (left ? PATHS_L : PATHS)[kind];
  const keys = left ? slashL({ ...P, cock: extra.cock ?? 0.7 }) : slash({ ...P, cock: extra.cock ?? 0.7, two, step });
  return { tell, windup, active: 0.08, damage, knockback: kb, zone: { kind: 'sector', r, ang: P.ang }, keys, ...(left ? { left: true, part: 'off' } : {}), ...extra };
}

/** A spinning cut (a ring round him). */
const spin = (tell, windup, damage, o = {}) => {
  const { form = 1, low = false, cock = 0.64, ...extra } = o;
  const r = REACH[form] + (low ? 0.6 : 0);
  return {
    tell, windup, active: low ? 0.22 : 0.2, damage, knockback: low ? 2.6 : 0.9, zone: { kind: 'ring', r }, track: 0.65,
    ...(low ? { knockdown: true, ring: r, part: 'feet', close: 1.2 } : {}),
    keys: spinKeys(cock, { low, twin: form === 2, two: form >= 3 ? 1 : 0 }), ...extra,
  };
};

/** Void lightning as a beat: a long line from his hand. Parry it (a perfect parry sends it back). */
const bolt = (windup, damage = 22, o = {}) => ({
  tell: B, windup, active: 0.08, damage, knockback: 1.4, zone: { kind: 'line', r: TUNING.bolt.range, w: TUNING.bolt.width }, bolt: true, part: 'hand',
  track: 0.92, close: 0, keys: boltKeys(o.cock ?? 0.7), ...o,
});
/** The Void push as a beat: a wall of force thrown along the ground. */
const push = (windup, o = {}) => ({ tell: N, windup, active: 0.1, damage: 15, knockback: 6.5, release: { style: 'push' }, part: 'hand', close: 0, track: 0.85, keys: pushKeys(), ...o });
/** The Void pull as a beat: red; the hero is dragged to him. */
const pull = (windup, o = {}) => ({
  tell: R, windup, active: 0.1, damage: 5, knockback: TUNING.pull.drag, zone: { kind: 'line', r: TUNING.pull.range, w: 2.4 }, pull: true, part: 'hand',
  track: 0.9, close: 0, keys: pullKeys(), ...o,
});

/** The Crushing Dark as a beat: red; a line from his hand. Caught, the hero is pinned and crushed. */
const grip = (windup, o = {}) => ({
  tell: R, windup, fixed: true, active: 0.1, damage: 30, knockback: 0.4, knockdown: true, zone: { kind: 'line', r: TUNING.grip.range, w: TUNING.grip.width }, grip: true, part: 'hand',
  track: 0.88, close: 0, keys: gripKeys(), ...o,
});
/** The Rift as a beat: `count` fissures of red light thrown along the floor from the staff's point. */
const rift = (windup, count, o = {}) => ({
  tell: N, windup, fixed: true, active: 0.1, damage: 16, knockback: 1.6, release: { style: 'rift', count, spread: 0.36 }, part: 'feet', close: 0, track: 0.8, keys: riftKeys(), groundMark: { kind: 'thrust', power: 0.9, fwd: 0.9 }, ...o,
});
/** Parting Light as a beat: a backflip away from the opponent and, landing, crescents of red light
 *  (`count`, a number or one per form). */
const parting = (count, o = {}) => {
  const cock = 0.3;
  return {
    // (thrown from 4 m further off and a little slower than Red Tide's: time for their cue from close in)
    tell: N, windup: 0.66, fixed: true, active: 0.1, damage: 14, knockback: 1.2, release: { style: 'crescent', count, spread: 0.3, speed: 12, from: 0.5 }, close: 0, track: 0.3,
    travel: [[cock, 0], [1.0, -4.0]], lift: FLIP_LIFT(cock, 1.35), keys: backflipKeys({ cock }), cock, ...o,
  };
};
/** The crossing cut (form 2): both blades drawn wide and crossed before him; two crescents fly. */
const crossCut = (windup, o = {}) => ({
  tell: N, windup, active: 0.1, damage: 14, knockback: 1.2, release: { style: 'crescent', count: 2, spread: 0.46 }, close: 0, track: 0.8,
  keys: [
    [0.7, { yaw: 0.1, bY: -0.2, bZ: -0.04, pitch: -0.04, arm: 1, ext: 0.5, sw: [-1.7, 0.5], larm: 1, lext: 0.5, lsw: [1.7, 0.5], hdY: -0.1, ...SET }],
    [1.0, { e: 'i', yaw: 0.06, bY: -0.32, bZ: 0.12, pitch: 0.16, arm: 1, ext: 1, sw: [0.9, -0.36], larm: 1, lext: 1, lsw: [-0.9, -0.36], hdY: 0, ...STEP_IN }],
    [2.0, { yaw: 0.06, bY: -0.3, bZ: 0.1, pitch: 0.12, arm: 1, ext: 0.9, sw: [1.1, -0.5], larm: 1, lext: 0.9, lsw: [-1.1, -0.5], ...STEP_IN }],
  ],
  ...o,
});

// ---------------------------------------------------------------- the second pass's beats
/** A feint: the free hand rises as if to cast, and nothing comes (no tell, no glint, no hit): the
 *  blade comes instead, out of the next beat. */
const feintHand = (windup, o = {}) => ({
  feint: true, tell: N, windup, active: 0.04, damage: 0, knockback: 0, close: 0, track: 0.9,
  keys: [[0.75, { two: 0, yaw: 0.5, bY: -0.17, pitch: -0.04, lH: [0.22, 0.16, 0.18], lP: [0.9, 0.1, -0.4], hdY: -0.4 }], [1.0, { two: 0, yaw: 0.42, bY: -0.19, lH: [0.2, 0.1, 0.26], lP: [0.9, 0.0, -0.3] }]],
  ...o,
});
/** The perilous thrust (red; a mikiri answers it) as a string's last word, any form. */
const peril = (form, damage = 26, o = {}) => ({
  tell: R, windup: 0.62, active: 0.12, damage, knockback: 2.5, zone: { kind: 'line', r: Math.max(2.4, REACH[form]), w: 0.7 }, mikiri: true,
  dash: { from: 0.84, to: 1.0, stop: 0.8, max: 2.8 }, close: 0, track: 0.7, keys: perilKeys(form >= 3 ? 1 : 0), ...o,
});
/** The twin thrust on a dash (form 2; Scissor's blow): blue, a parry moment. */
const twinThrust = (windup = 0.52, o = {}) => ({
  tell: B, flare: true, windup, active: 0.1, damage: 22, knockback: 1.6, zone: { kind: 'line', r: 2.1, w: 0.9 }, dash: { from: 0.7, to: 1.0, stop: 1.0, max: 5.0 }, close: 0, lock: true,
  keys: [
    [0.72, { yaw: 0.2, bY: -0.3, bZ: -0.1, arm: 1, ext: 0.3, sw: [-1.2, 0.0], larm: 1, lext: 0.3, lsw: [1.2, 0.0], hdY: -0.2, ...SET }],
    [1.0, { e: 'i', yaw: 0.05, bY: -0.32, bZ: 0.24, pitch: 0.14, arm: 1, ext: 1, sw: [0.12, 0.02], larm: 1, lext: 1, lsw: [-0.12, 0.02], hdY: 0, ...LUNGE_FEET }],
    [2.0, { yaw: 0.05, bY: -0.3, bZ: 0.2, arm: 1, ext: 0.95, sw: [-0.5, 0.05], larm: 1, lext: 0.95, lsw: [0.5, 0.05], ...LUNGE_FEET }],
  ],
  ...o,
});
/** The wheeling blade (form 2): the main blade flung wide, mid-string; it comes in on the hero from
 *  the side between the next off-hand cuts (spells.js) and home again at the `catch`. */
const wheelThrow = (windup, o = {}) => ({ tell: N, windup, active: 0.1, damage: 14, knockback: 1.2, cast: { kind: 'wheel', selfCue: true }, close: 0, track: 0.9, keys: throwKeys(), ...o });
/** The catch: the open sword hand out to his side and the blade back in it (no blow: a feint beat). */
const catchBeat = (windup, o = {}) => ({
  feint: true, catch: true, tell: N, windup, active: 0.06, damage: 0, knockback: 0, close: 0, track: 0.8,
  keys: [[0.6, { two: 0, arm: 0, yaw: 0.55, bY: -0.2, rH: [-0.44, 0.06, 0.26], rP: [-0.9, 0.3, -0.3], sw: [-1.9, 0.5], hdY: -0.5 }], [1.0, { two: 0, arm: 0, yaw: 0.45, bY: -0.22, rH: [-0.34, 0.02, 0.3], rP: [-0.9, 0.2, -0.3], sw: [-1.5, 0.9], hdY: -0.3 }]],
  ...o,
});
/** Torn stones that turn round him and fly into the gaps of the string (form 3; spells.js). */
const orbitCast = (windup, o = {}) => ({
  tell: N, windup, fixed: true, active: 0.1, damage: 14, knockback: 1.5, cast: { kind: 'debris', orbit: true, count: 3, selfCue: true }, part: 'hand', close: 0, track: 0.9, keys: hurlKeys(), ...o,
});
/** The Dark Star cast from inside a string: it drifts after the hero while the string runs and bursts
 *  just after its last blow (lord.js onCast, TUNING.star.after). */
const starCast = (windup, o = {}) => ({
  tell: R, windup, active: 0.1, damage: 26, knockback: 3.5, cast: { kind: 'star', selfCue: true, after: true }, part: 'hand', close: 0, track: 0.5, keys: starKeys(), ...o,
});
/** A beat's root motion: walking `m` m on through it (the staff's strings walk the hero down). */
const walk = (m, at = 1.0) => [[0, 0], [at, m * 0.66], [2.0, m]];

/** How each form's strings end: the steel brought back to its guard with a flourish (a move's
 *  `recoveryKeys`; times are fractions of its recovery). */
const FLOURISH = [
  // 1 — the blade rolled once round the wrist at his side: a wheel in the plane ACROSS him (as the
  // staff's), the fist held out before his hip. (Rolled in a fore-and-aft plane, at az -0.5 .. -0.7,
  // the back of the circle went through his hood, and through the line of his own forearm, where
  // the wrist cannot follow: the solver threw the blade from one side of it to the other.)
  [[0.2, { arm: 0, two: 0, rH: [-0.14, -0.3, 0.28], sw: [-1.45, 0.5], yaw: 0.3 }], [0.68, { e: 'l', rH: [-0.14, -0.34, 0.24], sw: [-1.45, 0.5 - TAU] }], [0.681, { e: 'h', sw: [-1.45, 0.5] }]],
  // 2 — both blades rolled, mirrored
  [
    [0.2, { arm: 0, larm: 0, rH: [-0.14, -0.3, 0.32], sw: [-1.45, 0.5], lH: [0.14, -0.3, 0.16], lsw: [1.45, 0.5], yaw: 0.08 }],
    [0.68, { e: 'l', rH: [-0.14, -0.34, 0.3], sw: [-1.45, 0.5 - TAU], lH: [0.14, -0.34, 0.14], lsw: [1.45, 0.5 - TAU] }],
    [0.681, { e: 'h', sw: [-1.45, 0.5], lsw: [1.45, 0.5] }],
  ],
  // 3 — the staff turned once like a mill wheel before him, and stopped level
  [[0.16, { arm: 0, two: 1, rH: [0.04, -0.26, 0.32], sw: [-1.4, 0.14], yaw: 0.14 }], [0.72, { e: 'l', rH: [0.04, -0.28, 0.32], sw: [-1.4, 0.14 + TAU] }], [0.721, { e: 'h', sw: [-1.4, 0.14] }]],
  // 4 — the blade swept down and out, the Void shaken off it, then raised to the vigil
  [[0.3, { e: 'o', arm: 0, two: 1, rH: [-0.08, -0.36, 0.12], sw: [-1.1, -0.72], yaw: 0.2, bY: -0.12 }], [0.56, { two: 1, rH: [-0.08, -0.36, 0.12], sw: [-1.15, -0.7] }]],
];

/** The ignition of a blade form (a transition): he rises, the blades light, a red shock ring. */
const ignite = (form) => ({
  label: `Ignition (form ${form})`, phase: form, weight: 0, transition: true, cooldown: 0, band: [0, 99], recovery: 0.6,
  beats: [{
    tell: R, windup: 2.1, fixed: true, active: 0.15, damage: TUNING.ignite.damage, knockback: TUNING.ignite.knockback,
    zone: { kind: 'ring', r: TUNING.ignite.ringRadius }, ring: TUNING.ignite.ringRadius, part: 'feet', track: 0, close: 0,
    keys: [
      // on one knee, run through; the hilt(s) held low
      [0.0, { two: 0, bY: -0.52, pitch: 0.24, yaw: 0.1, spX: 0.12, hdX: 0.5, rH: [-0.12, -0.42, 0.26], sw: [-0.5, -1.0], lH: [0.08, -0.44, 0.16], rF: [-0.12, 0.3], lF: [0.15, -0.42], rK: [0, 0, 1], lK: [0.1, -0.8, 0.6] }],
      [0.4, { two: 0, bY: -0.5, pitch: 0.2, yaw: 0.1, hdX: 0.4, rH: [-0.12, -0.4, 0.26], sw: [-0.5, -1.0], lH: [0.08, -0.42, 0.16], rF: [-0.12, 0.3], lF: [0.15, -0.42], rK: [0, 0, 1], lK: [0.1, -0.8, 0.6] }],
      // he stands, the arms cross low before him
      [0.8, { two: 0, bY: -0.1, pitch: 0.1, yaw: 0.05, hdX: 0.25, rH: [0.1, -0.3, 0.3], sw: [0.6, -0.6], lH: [-0.08, -0.3, 0.3], lsw: [-0.6, -0.6], rF: [-0.16, 0.05], lF: [0.16, -0.05] }],
      // and are thrown wide as the blades ignite
      [1.0, { e: 'i', two: 0, bY: -0.04, pitch: -0.18, yaw: 0.05, hdX: -0.25, spX: -0.1, rH: [-0.36, -0.12, 0.1], rP: [-0.9, 0.2, -0.3], sw: [-1.5, 0.35], lH: [0.36, -0.12, 0.1], lP: [0.9, 0.2, -0.3], lsw: [1.5, 0.35], rF: [-0.24, 0.05], lF: [0.24, -0.05] }],
      [2.0, { two: 0, bY: -0.04, pitch: -0.18, yaw: 0.05, hdX: -0.25, rH: [-0.36, -0.12, 0.1], sw: [-1.5, 0.35], lH: [0.36, -0.12, 0.1], lsw: [1.5, 0.35], rF: [-0.24, 0.05], lF: [0.24, -0.05] }],
    ],
  }],
});

// ---------------------------------------------------------------- the moves
// Weights are [form 1, form 2, form 3, form 4]. Authored at form 1's pace (a string's hits 0.34 s
// apart); TUNING.windupScale tightens the later forms to ~0.28 s.
const W = (f, w) => [1, 2, 3, 4].map((k) => (k === f ? w : 0));

export const MOVES = {
  // ============================================================== form 1: one blade, the free hand casts
  /** Crimson Litany: six cuts from every side; the fourth is a held overhead or a thrust, the last
   *  a somersault chop or a flat cut into a heavy thrust. */
  litany: {
    label: 'Crimson Litany', phase: 1, weight: W(1, 2.6), cooldown: 6, band: [0, 3.8], recovery: 0.78, recoveryKeys: FLOURISH[0],
    beats: [
      cut('rise', N, 0.48, 13),
      cut('back', N, 0.34, 12, { step: 'L' }),
      { pick: [spin(N, 0.38, 13, { form: 1, cock: 0.6 }), cut('flat', N, 0.34, 12)] },
      { pick: [cut('over', B, 0.42, 20, { hold: [0.1, 0.3], cock: 0.72, lock: true }), cut('thrust', B, 0.4, 19)] },
      cut('diag', N, 0.36, 12, { step: 'L' }),
      { pick: [cut('flip', B, 0.6, 24, { lock: true }), cut('aerial', B, 0.58, 22), cut('flatBack', N, 0.34, 12)] },
      cut('thrust', B, 0.4, 19, { chance: 0.5 }),
    ],
  },
  /** Void Cadence: cuts with the Void between them: two cuts, the push, two more, a heavy thrust. */
  cadence: {
    label: 'Void Cadence', phase: 1, weight: W(1, 2.4), cooldown: 7, band: [0, 4.2], recovery: 0.78, recoveryKeys: FLOURISH[0],
    beats: [
      cut('flat', N, 0.5, 13),
      cut('back', N, 0.34, 12, { step: 'L' }),
      push(0.55, { fixed: true }),
      cut('rise', N, 0.46, 12),
      cut('diag', N, 0.34, 12, { step: 'L' }),
      { pick: [cut('thrust', B, 0.4, 20), bolt(0.62, 20, { fixed: true })] },
    ],
  },
  /** Starless Dirge: a thrust that covers ground, a rising cut, a cartwheel over the hero's guard
   *  into a diagonal cut, a level cut, and a low red sweep (or lightning from the free hand). */
  dirge: {
    label: 'Starless Dirge', phase: 1, weight: W(1, 2.2), cooldown: 7, band: [1.6, 6], recovery: 0.78, recoveryKeys: FLOURISH[0], gapCloser: true,
    beats: [
      { ...cut('thrust', N, 0.5, 15, { cock: 0.72 }), dash: { from: 0.7, to: 1.0, stop: 1.0, max: 3.8 } },
      cut('rise', N, 0.36, 12, { step: 'L' }),
      cut('aerial', B, 0.58, 22),
      cut('flatBack', N, 0.36, 12, { step: 'L' }),
      { pick: [spin(R, 0.62, 22, { low: true, form: 1, cock: 0.62 }), bolt(0.56, 20, { fixed: true, cock: 0.6 })] },
    ],
  },
  /** Starless Lunge: a coiled thrust that covers ground. */
  lunge: {
    label: 'Starless Lunge', phase: 1, weight: [2.0, 0, 0, 0.8], cooldown: 2.5, band: [2.6, 7], recovery: 0.5, gapCloser: true,
    beats: [{ ...cut('thrust', N, 0.5, 17, { cock: 0.72 }), dash: { from: 0.7, to: 1.0, stop: 1.0, max: 5.0 }, close: 0 }],
  },
  /** Falling Star: a somersault over the gap and a two-handed chop where he lands. */
  skyfall: {
    label: 'Falling Star', phase: 1, weight: [2.0, 1.6, 0, 1.2], cooldown: 4, band: [2.2, 7.5], recovery: 0.55, gapCloser: true,
    beats: [{ ...cut('flip', B, 0.72, 26, { lock: true, cock: 0.34, flare: true }), dash: { from: 0.34, to: 0.98, stop: 1.3, max: 5.5 }, close: 0 }],
  },
  /** Reaping Arc: dropping low, the blade swept round at the ankles. Red: roll through it. */
  reap: {
    label: 'Reaping Arc', phase: 1, weight: [1.5, 0, 0, 0], cooldown: 6, band: [0, 3.4], recovery: 0.6,
    beats: [spin(R, 0.62, 22, { low: true, form: 1, cock: 0.62 })],
  },
  /** Void Lightning: levelled from the free hand. Parry it; a perfect parry sends it back. */
  voidBolt: {
    label: 'Void Lightning', phase: 1, weight: [1.0, 0.8, 0.5, 0], cooldown: 5, band: [4.5, 16], recovery: 0.5, gapCloser: true,
    beats: [bolt(0.78, 24), { ...bolt(0.5, 22), chance: 0.5 }],
  },
  /** Void Push: a wall of force along the floor. Cut it with a parry, or roll through. */
  voidPush: {
    label: 'Void Push', phase: 1, weight: [1.0, 0.8, 0.5, 0.7], cooldown: 5, band: [2.5, 11], recovery: 0.5,
    beats: [push(0.62)],
  },
  /** Grasp and Sever: the Void drags you to him (red: roll), and a two-handed chop is waiting. */
  grasp: {
    label: 'Grasp and Sever', phase: 1, weight: [1.4, 1.0, 1.2, 1.0], cooldown: 8, band: [4.5, 10.5], recovery: 0.6, gapCloser: true,
    beats: [pull(0.8, { fixed: true }), cut('over', B, 0.62, 24, { lock: true, fixed: true, cock: 0.7, flare: true })],
  },
  /** Crushing Dark: his open hand lifts, and the Void closes on whoever stands before it (red: roll
   *  through it or get out of its line). Caught, the hero is thrown to the floor and crushed. */
  grip: {
    label: 'Crushing Dark', phase: 1, weight: [0.9, 0, 0, 0.8], cooldown: 10, band: [3, 9], recovery: 0.7,
    beats: [grip(0.95)],
  },
  // -------------------------------------------------------------- the moments (ADR-118; every form)
  /** Severance: one long step and a two-handed chop out of the dark. A parry moment: the blue flare,
   *  and a parry of it is answered by the hero's counter. */
  severance: {
    label: 'Severance', phase: 1, weight: [1.5, 1.3, 1.0, 1.0], cooldown: 6, band: [3.4, 9.5], recovery: 0.6, gapCloser: true,
    beats: [{ ...cut('over', B, 0.66, 26, { lock: true, cock: 0.72, flare: true }), dash: { from: 0.45, to: 0.96, stop: 1.2, max: 7.5 }, close: 0, track: 0.55 }],
  },
  /** Red Meridian: two blows no guard holds: a dashing level cut, then the blade swept round at the
   *  ankles. Red, red: dodge, dodge. */
  meridian: {
    label: 'Red Meridian', phase: 1, weight: [1.5, 1.8, 1.2, 1.5], cooldown: 8, band: [2.4, 8], recovery: 0.65, gapCloser: true,
    beats: [
      { ...cut('flat', R, 0.66, 22, { cock: 0.76 }), knockback: 2.2, dash: { from: 0.55, to: 0.98, stop: 1.1, max: 6.0 }, close: 0, track: 0.6 },
      spin(R, 0.72, 24, { low: true, form: 1, cock: 0.62, close: 1.4 }),
    ],
  },
  /** Nightfall: the CHARGED blow. The blade is drawn back and the dark gathers on it (a second and a
   *  half, and a held beat that is never the same), then one long dashing cleave. Black: dodge it. A
   *  guard or a parry in its way is knocked wide open, the whole guard meter gone. */
  nightfall: {
    label: 'Nightfall', phase: 1, weight: [1.1, 1.1, 1.0, 1.0], cooldown: 12, band: [2.4, 9], recovery: 0.8, gapCloser: true,
    beats: [{
      ...cut('diag', K, 1.45, 36, { cock: 0.86 }), fixed: true, hold: [0.1, 0.5], active: 0.14, knockback: 4, knockdown: true,
      zone: { kind: 'sector', r: 2.9, ang: 1.05 }, dash: { from: 0.88, to: 1.0, stop: 1.2, max: 7.5 }, close: 0, track: 0.88,
    }],
  },
  /** His counter out of a guard (form 1): a diagonal cut, then a thrust. */
  riposte: {
    label: 'Riposte', phase: 1, weight: 0, counter: true, cooldown: 0, band: [0, 5], recovery: 0.55,
    beats: [cut('diag', N, 0.46, 15, { track: 0.7 }), cut('thrust', B, 0.36, 21)],
  },
  // -------------------------------------------------------------- form 1, the second pass: the hand inside the string
  /** Veiled Hand: two cuts, the free hand rises as if to cast (a feint: nothing comes), the blade
   *  comes instead, a fourth cut, and a perilous thrust or a held overhead (a parry moment). */
  veiledHand: {
    label: 'Veiled Hand', phase: 1, weight: W(1, 2.2), cooldown: 7, band: [0, 4.0], recovery: 0.75, recoveryKeys: FLOURISH[0],
    beats: [
      cut('rise', N, 0.48, 13),
      cut('back', N, 0.34, 12, { step: 'L' }),
      feintHand(0.28),
      cut('flat', N, 0.36, 12),
      cut('diag', N, 0.34, 12, { step: 'L' }),
      { pick: [peril(1), cut('over', B, 0.42, 20, { hold: [0.1, 0.25], cock: 0.72, lock: true, flare: true })] },
    ],
  },
  /** Lightning Verse: a cut, lightning from the free hand, two cuts, lightning again, and a heavy
   *  thrust or the somersault. Parry every one (a perfect parry sends the lightning back). */
  voidVerse: {
    label: 'Lightning Verse', phase: 1, weight: W(1, 2.4), cooldown: 7, band: [0, 4.4], recovery: 0.75, recoveryKeys: FLOURISH[0],
    beats: [
      cut('flat', N, 0.48, 13),
      bolt(0.42, 18, { cock: 0.6 }),
      cut('back', N, 0.34, 12, { step: 'L' }),
      cut('rise', N, 0.34, 12),
      bolt(0.42, 18, { cock: 0.6 }),
      { pick: [cut('thrust', B, 0.4, 19), cut('flip', B, 0.6, 24, { lock: true })] },
    ],
  },
  /** Drawn to the Blade: two cuts, and if the hero gave ground the Void drags him back (red: roll)
   *  into a rising cut and a two-handed chop (a parry moment). */
  drawnIn: {
    label: 'Drawn to the Blade', phase: 1, weight: W(1, 2.0), cooldown: 8, band: [0, 6], recovery: 0.7, recoveryKeys: FLOURISH[0],
    beats: [
      cut('diag', N, 0.48, 13),
      cut('flatBack', N, 0.34, 12, { step: 'L' }),
      pull(0.5, { knockback: 3.0 }),
      cut('rise', N, 0.4, 13),
      cut('over', B, 0.44, 22, { lock: true, flare: true, cock: 0.72 }),
    ],
  },
  /** Breaking Wave: the push opens it (a wall of force from afar), then he comes in behind it on a
   *  dashing thrust, two cuts and the red sweep at the ankles. */
  pushOpening: {
    label: 'Breaking Wave', phase: 1, weight: W(1, 1.8), cooldown: 8, band: [5, 8.5], recovery: 0.7, recoveryKeys: FLOURISH[0], gapCloser: true,
    beats: [
      // (a shove, not a throw: he rides in behind it; the thrust's glint comes after the wall has reached the hero)
      push(0.5, { knockback: 1.0 }),
      { ...cut('thrust', N, 0.72, 15, { cock: 0.76 }), dash: { from: 0.66, to: 1.0, stop: 1.0, max: 6.5 } },
      cut('rise', N, 0.34, 12, { step: 'L' }),
      cut('flat', N, 0.34, 12),
      spin(R, 0.6, 22, { low: true, form: 1, cock: 0.62 }),
    ],
  },
  /** Crushing Verse: four cuts, and the Crushing Dark as the string's last word (red: roll, or be
   *  out of its line). */
  crushingVerse: {
    label: 'Crushing Verse', phase: 1, weight: W(1, 2.0), cooldown: 9, band: [0, 4.0], recovery: 0.75,
    beats: [
      cut('rise', N, 0.48, 13),
      cut('back', N, 0.34, 12, { step: 'L' }),
      cut('flat', N, 0.34, 12),
      cut('diag', N, 0.36, 12, { step: 'L' }),
      grip(0.6, { fixed: false, damage: 26 }),
    ],
  },
  /** Hollow Step: he is gone, and behind the hero: one red cut out of the dark (roll). */
  hollowStep: {
    label: 'Hollow Step', phase: 1, weight: [1.8, 0, 0, 0], cooldown: 7, band: [2.0, 9], recovery: 0.6, gapCloser: true,
    beats: [{ ...cut('flat', R, 0.66, 24, { cock: 0.74, blink: { behind: 2.0 }, close: 1.2, track: 0.7 }), fixed: true, knockback: 2.4, knockdown: true }],
  },

  // ============================================================== form 2: twin blades
  /** Twin Tempest: the blades alternate, seven cuts in a breath; the fifth is both at once. */
  tempest: {
    label: 'Twin Tempest', phase: 2, weight: W(2, 2.4), cooldown: 6, band: [0, 3.8], recovery: 0.78, recoveryKeys: FLOURISH[1],
    beats: [
      cut('rise', N, 0.48, 11, { form: 2 }),
      cut('rise', N, 0.34, 11, { form: 2, left: true }),
      cut('flat', N, 0.34, 11, { form: 2 }),
      cut('flat', N, 0.34, 11, { form: 2, left: true }),
      { pick: [cut('over', B, 0.42, 20, { form: 2, hold: [0.1, 0.28], cock: 0.72, lock: true }), cut('thrust', B, 0.4, 18, { form: 2 })] },
      cut('diag', N, 0.36, 11, { form: 2, left: true }),
      cut('back', N, 0.34, 11, { form: 2 }),
    ],
  },
  /** Bladed Gale: two whirling rings, two rising cuts, and the somersault. */
  gale: {
    label: 'Bladed Gale', phase: 2, weight: W(2, 2.4), cooldown: 7, band: [0, 3.8], recovery: 0.7,
    beats: [
      spin(N, 0.5, 13, { form: 2 }),
      spin(N, 0.36, 13, { form: 2, cock: 0.6 }),
      cut('rise', N, 0.36, 11, { form: 2 }),
      cut('back', N, 0.34, 11, { form: 2, left: true }),
      { pick: [cut('flip', B, 0.6, 24, { form: 2, lock: true }), spin(R, 0.62, 22, { form: 2, low: true, cock: 0.62 })] },
      { ...parting(2), chance: 0.6 },
    ],
  },
  /** Pinwheel: a cartwheel over the gap with both blades going round, the off-hand blade behind it,
   *  and the blades crossed: two crescents of red light. */
  pinwheel: {
    label: 'Pinwheel', phase: 2, weight: W(2, 2.2), cooldown: 7, band: [1.5, 6.5], recovery: 0.78, recoveryKeys: FLOURISH[1], gapCloser: true,
    beats: [
      cut('aerial', B, 0.62, 22, { form: 2 }),
      cut('flat', N, 0.34, 11, { form: 2, left: true }),
      cut('back', N, 0.34, 11, { form: 2 }),
      crossCut(0.46),
    ],
  },
  /** Scissor: both blades thrust home on a dash. */
  scissor: {
    label: 'Scissor', phase: 2, weight: W(2, 2.0), cooldown: 3, band: [2.6, 7], recovery: 0.5, gapCloser: true,
    beats: [{
      tell: B, flare: true, windup: 0.52, active: 0.1, damage: 22, knockback: 1.6, zone: { kind: 'line', r: 2.1, w: 0.9 }, dash: { from: 0.7, to: 1.0, stop: 1.0, max: 5.0 }, close: 0, lock: true,
      keys: [
        [0.72, { yaw: 0.2, bY: -0.3, bZ: -0.1, arm: 1, ext: 0.3, sw: [-1.2, 0.0], larm: 1, lext: 0.3, lsw: [1.2, 0.0], hdY: -0.2, ...SET }],
        [1.0, { e: 'i', yaw: 0.05, bY: -0.32, bZ: 0.24, pitch: 0.14, arm: 1, ext: 1, sw: [0.12, 0.02], larm: 1, lext: 1, lsw: [-0.12, 0.02], hdY: 0, ...LUNGE_FEET }],
        [2.0, { yaw: 0.05, bY: -0.3, bZ: 0.2, arm: 1, ext: 0.95, sw: [-0.5, 0.05], larm: 1, lext: 0.95, lsw: [0.5, 0.05], ...LUNGE_FEET }],
      ],
    }],
  },
  /** Returning Blade: one blade thrown spinning; it comes back the way it went. Parry it twice. */
  glaive: {
    label: 'Returning Blade', phase: 2, weight: [0, 1.2, 0.6, 0], cooldown: 9, band: [4, 13], recovery: 1.15,
    beats: [{ tell: N, windup: 0.6, active: 0.1, damage: 16, knockback: 1.2, cast: { kind: 'glaive', selfCue: true }, close: 0, track: 0.9, keys: throwKeys() }],
    recoveryKeys: [[0.5, { two: 0, yaw: 0.3, bY: -0.2, rH: [-0.1, 0.1, 0.4], rP: [-0.8, 0.2, -0.2], sw: [-0.3, 0.6] }]],
  },
  /** Low double sweep (form 2's red). */
  reap2: {
    label: 'Reaping Arcs', phase: 2, weight: W(2, 2.0), cooldown: 6, band: [0, 3.4], recovery: 0.6,
    beats: [spin(N, 0.5, 13, { form: 2 }), spin(R, 0.6, 22, { form: 2, low: true, cock: 0.62 })],
  },
  riposte2: {
    label: 'Riposte (twin)', phase: 2, weight: 0, counter: true, cooldown: 0, band: [0, 5], recovery: 0.55,
    beats: [cut('diag', N, 0.46, 13, { form: 2, track: 0.7 }), cut('flat', N, 0.34, 13, { form: 2, left: true }), cut('thrust', B, 0.36, 20, { form: 2 })],
  },
  // -------------------------------------------------------------- form 2, the second pass: two things in the air
  /** Wheeling Blade: two cuts, the main blade flung wide (it wheels round the hero), two off-hand
   *  cuts while it flies, the blade coming in from the side (white: guard or parry it), the catch,
   *  and the caught blade brought down (a parry moment). */
  wheelingBlade: {
    label: 'Wheeling Blade', phase: 2, weight: W(2, 2.6), cooldown: 8, band: [0, 4.0], recovery: 0.75, recoveryKeys: FLOURISH[1],
    beats: [
      cut('rise', N, 0.48, 11, { form: 2 }),
      cut('flat', N, 0.34, 11, { form: 2, left: true }),
      wheelThrow(0.46),
      cut('back', N, 0.36, 11, { form: 2, left: true }),
      cut('diag', N, 0.34, 11, { form: 2, left: true }),
      catchBeat(0.3),
      cut('over', B, 0.44, 20, { form: 2, lock: true, flare: true, cock: 0.72 }),
    ],
  },
  /** Hunting Wings: every blow a step on: a dashing thrust, three cuts that each carry him after a
   *  hero who backs away, and both blades thrust home (a parry moment). */
  wingedPursuit: {
    label: 'Hunting Wings', phase: 2, weight: W(2, 2.0), cooldown: 7, band: [1.5, 8], recovery: 0.7, recoveryKeys: FLOURISH[1], gapCloser: true,
    beats: [
      { ...cut('thrust', N, 0.5, 14, { form: 2, cock: 0.72 }), dash: { from: 0.7, to: 1.0, stop: 1.0, max: 4.5 } },
      { ...cut('rise', N, 0.36, 11, { form: 2, left: true }), dash: { from: 0.35, to: 1.0, stop: 1.1, max: 3.0 }, close: 0 },
      { ...cut('flat', N, 0.36, 11, { form: 2 }), dash: { from: 0.35, to: 1.0, stop: 1.1, max: 3.0 }, close: 0 },
      { ...cut('back', N, 0.36, 11, { form: 2, left: true }), dash: { from: 0.35, to: 1.0, stop: 1.1, max: 3.0 }, close: 0 },
      twinThrust(0.5, { dash: { from: 0.7, to: 1.0, stop: 1.0, max: 4.0 } }),
    ],
  },
  /** Crossed Tides: three cuts, a backflip out of reach with two crescents off the crossed blades,
   *  and straight back in on the twin thrust (a parry moment). */
  crossedTides: {
    label: 'Crossed Tides', phase: 2, weight: W(2, 2.0), cooldown: 8, band: [0, 4.0], recovery: 0.7, recoveryKeys: FLOURISH[1],
    beats: [
      cut('flat', N, 0.48, 11, { form: 2 }),
      cut('flatBack', N, 0.34, 11, { form: 2, left: true }),
      cut('rise', N, 0.36, 11, { form: 2 }),
      parting(2),
      // (its glint after the crescents have reached the hero)
      twinThrust(0.72),
    ],
  },
  /** Twin Cartwheel: two cuts, the cartwheel with both blades going round, two more, and the
   *  perilous thrust (red: a mikiri) or a second cartwheel. */
  twinCartwheel: {
    label: 'Twin Cartwheel', phase: 2, weight: W(2, 2.2), cooldown: 7, band: [0, 4.0], recovery: 0.75, recoveryKeys: FLOURISH[1],
    beats: [
      cut('rise', N, 0.48, 11, { form: 2 }),
      cut('flat', N, 0.34, 11, { form: 2, left: true }),
      cut('aerial', B, 0.56, 20, { form: 2 }),
      cut('back', N, 0.36, 11, { form: 2 }),
      cut('diag', N, 0.34, 11, { form: 2, left: true }),
      cut('flatBack', N, 0.34, 11, { form: 2 }),
      { pick: [peril(2), cut('aerial', B, 0.58, 22, { form: 2 })] },
    ],
  },

  // ============================================================== form 3: the staff
  /** Cyclone: the long blades sweep wide; two level cuts, two full turns, a held overhead, a low red ring. */
  cyclone: {
    label: 'Cyclone', phase: 3, weight: W(3, 2.4), cooldown: 6, band: [0, 4.4], recovery: 0.8, recoveryKeys: FLOURISH[2],
    beats: [
      cut('flat', N, 0.5, 13, { form: 3 }),
      cut('flatBack', N, 0.34, 13, { form: 3, step: 'L' }),
      spin(N, 0.38, 14, { form: 3, cock: 0.6 }),
      spin(N, 0.36, 14, { form: 3, cock: 0.6 }),
      { pick: [cut('over', B, 0.44, 22, { form: 3, hold: [0.1, 0.3], cock: 0.72, lock: true }), cut('thrust', B, 0.4, 20, { form: 3 })] },
      { pick: [spin(R, 0.62, 24, { form: 3, low: true, cock: 0.62 }), cut('flip', B, 0.6, 26, { form: 3, lock: true })] },
    ],
  },
  /** Turning Mill: he walks forward inside the turning staff: four rings, then a thrust. */
  mill: {
    label: 'Turning Mill', phase: 3, weight: W(3, 1.3), cooldown: 7, band: [1.5, 6.5], recovery: 0.8, recoveryKeys: FLOURISH[2], gapCloser: true,
    beats: [
      spin(N, 0.52, 12, { form: 3, travel: [[0.2, 0], [1.0, 1.2], [2.0, 1.9]], close: 0 }),
      spin(N, 0.34, 12, { form: 3, cock: 0.55, travel: [[0, 0], [1.0, 0.9], [2.0, 1.5]], close: 0 }),
      spin(N, 0.34, 12, { form: 3, cock: 0.55, travel: [[0, 0], [1.0, 0.9], [2.0, 1.5]], close: 0 }),
      spin(N, 0.34, 12, { form: 3, cock: 0.55, travel: [[0, 0], [1.0, 0.9], [2.0, 1.5]], close: 0 }),
      cut('thrust', B, 0.42, 21, { form: 3 }),
    ],
  },
  /** Starfall: a great leap; the red ring follows the hero, locks, and he comes down on it. */
  starfall: {
    label: 'Starfall', phase: 3, weight: [0, 0, 1.0, 0.6], cooldown: 9, band: [4.2, 14], recovery: 0.75, gapCloser: true,
    beats: [{
      tell: R, windup: 1.15, active: 0.12, damage: 30, knockback: 4, knockdown: true, zone: { kind: 'ring', r: 2.8 }, ring: 2.8, part: 'feet',
      leap: { from: 0.36, lock: 0.66, apex: 3.8 }, track: 0.36, close: 0,
      keys: [
        [0.26, { two: 1, bY: -0.44, pitch: 0.18, yaw: 0.1, rH: [0.1, -0.22, 0.32], sw: [0.0, 0.35], rF: [-0.12, 0.25], lF: [0.15, -0.25], rK: [-0.2, 0.2, 1], lK: [0.3, 0.2, 1], hdY: -0.1 }],
        [0.36, { two: 1, bY: -0.1, pitch: -0.1, yaw: 0.1, rH: [0.1, 0.1, 0.22], sw: [0.0, 1.2], rF: [-0.1, 0.12], lF: [0.15, -0.12] }],
        [0.75, { ...RAISED, yaw: 0.1, bY: 0.05, sw: [0.0, 2.45], rF: [-0.1, 0.25], lF: [0.15, -0.05], rK: [-0.2, 0.3, 1], lK: [0.3, 0.3, 1] }],
        [0.9, { ...RAISED, yaw: 0.1, bY: 0.0, sw: [0.0, 2.6], rF: [-0.1, 0.2], lF: [0.15, -0.15] }],
        [1.0, { ...CHOP, e: 'i', bY: -0.36, pitch: 0.38, rF: [-0.12, 0.45], lF: [0.2, -0.42] }],
        [2.0, { ...CHOP, bY: -0.36, pitch: 0.38, rF: [-0.12, 0.45], lF: [0.2, -0.42] }],
      ],
    }],
    recoveryKeys: [[0.5, { ...CHOP, bY: -0.3, sw: [-0.2, -0.6] }]],
  },
  /** Torn Stone: he tears the floor up with the Void and hurls it: three stones, then a great one (red). */
  debris: {
    label: 'Torn Stone', phase: 3, weight: [0, 0, 1.2, 0.9], cooldown: 10, band: [5, 15], recovery: 0.6,
    beats: [{ tell: N, windup: 0.95, fixed: true, active: 0.1, damage: 14, knockback: 1.5, cast: { kind: 'debris', count: 3, big: 1, selfCue: true }, part: 'hand', close: 0, track: 0.9, keys: hurlKeys() }],
  },
  // ---------------------------------------------------------------- the crater (ADR-109, terrain.js)
  // Three moves on the pieces of the set (numbers: TUNING.terrain). `terrain: kind` marks one: his AI
  // picks it only while there is a piece for it, and it cannot start with none. Each is one long
  // windup (the piece rising out of its place is the tell, the Void gathering in his hand) and a cast:
  // what is thrown cues itself (nothing where it lands: the flare on the flying piece flashLead before
  // it lands, the owner's choice of 2026-11-16), what is pulled down is told by the world.
  /** Void Hurl: a piece of the crater (a stone already in the air; once those are spent a plate torn
   *  out of the floor near him; else a shard or a slab) rises, hangs over his hand and is thrown.
   *  Red: roll at its flare, or do not be where it comes down. */
  voidHurl: {
    label: 'Void Hurl', phase: 1, weight: [1.3, 1.1, 1.0, 1.2], cooldown: 9, band: [4.5, 16], recovery: 0.45, terrain: 'hurl', cat: 'terrain',
    beats: [{ tell: R, windup: 1.0, fixed: true, active: 0.1, damage: 26, knockback: 4, cast: { kind: 'hurl', selfCue: true }, part: 'hand', close: 0, track: 0.9, keys: hurlKeys() }],
  },
  /** Glass Rain: three pieces at once, thrown one after another where the hero is going. */
  glassRain: {
    label: 'Glass Rain', phase: 3, weight: [0, 0, 1.6, 1.6], cooldown: 13, band: [4.5, 16], recovery: 0.6, terrain: 'rain', cat: 'terrain',
    beats: [{ tell: R, windup: 1.2, fixed: true, active: 0.1, damage: 20, knockback: 3, cast: { kind: 'rain', count: 3, selfCue: true }, part: 'hand', close: 0, track: 0.9, keys: stormKeys() }],
  },
  /** Crown Fall: the open hand closes on a tall slab or shard beside the hero and wrenches it down
   *  on him. The fall is the world's: red, its strip marked, about a second from the wrench
   *  (BREAK.topple: 22 damage x the piece's weight; `damage` here is not used). */
  crownFall: {
    label: 'Crown Fall', phase: 2, weight: [0, 1.5, 1.4, 1.6], cooldown: 10, band: [2.5, 18], recovery: 0.55, terrain: 'fall', cat: 'terrain',
    beats: [{ tell: R, windup: 0.85, fixed: true, active: 0.1, damage: 0, knockback: 0, cast: { kind: 'fall', selfCue: true }, part: 'hand', close: 0, track: 0.9, keys: gripKeys() }],
  },
  /** Rupture (form 2 on): his hand closes and wrenches down, and the floor tears open in a line from
   *  him toward the hero, plate after plate bursting up out of it. Red: the flare on the plate that
   *  would reach you; step off the line, or roll at the flare. */
  plateRupture: {
    label: 'Rupture', phase: 2, weight: [0, 1.5, 1.4, 1.1], cooldown: 10, band: [3.5, 14], recovery: 0.5, terrain: 'rupture', cat: 'terrain',
    beats: [{ tell: R, windup: 0.9, fixed: true, active: 0.1, damage: 22, knockback: 3.5, cast: { kind: 'rupture', selfCue: true }, part: 'hand', close: 0, track: 0.9, keys: gripKeys() }],
  },
  /** Falling Halo (forms 3 and 4): the Void lifts a ring of plates round the hero, open on the side
   *  away from him, and drops them on him one after another. Each is red, the flare on the falling
   *  plate: roll at each, or run out through the opening. */
  plateHalo: {
    label: 'Falling Halo', phase: 3, weight: [0, 0, 1.6, 1.2], cooldown: 13, band: [2, 12], recovery: 0.6, terrain: 'halo', cat: 'terrain',
    beats: [{ tell: R, windup: 1.0, fixed: true, active: 0.1, damage: 22, knockback: 3, cast: { kind: 'halo', count: [0, 0, 4, 5], selfCue: true }, part: 'hand', close: 0, track: 0.9, keys: stormKeys() }],
  },
  /** Drawn Under: the pull, then the staff's low ring where you land. */
  undertow: {
    label: 'Drawn Under', phase: 3, weight: W(3, 1.0), cooldown: 8, band: [4.5, 10.5], recovery: 0.6, gapCloser: true,
    beats: [pull(0.8, { fixed: true }), spin(N, 0.62, 16, { form: 3, fixed: true }), cut('over', B, 0.42, 22, { form: 3, lock: true })],
  },
  /** The Rift: the staff driven into the floor; fissures of red light race out along it. Parry the
   *  one that comes for you, or step between them. */
  rift: {
    label: 'The Rift', phase: 3, weight: [0, 0, 1.1, 0.9], cooldown: 9, band: [3, 14], recovery: 0.7,
    beats: [rift(0.9, [3, 3, 3, 5])],
  },
  /** Parting Light: a backflip out of reach, and crescents of red light as he lands. */
  parting: {
    label: 'Parting Light', phase: 2, weight: [0, 1.0, 0.9, 0.9], cooldown: 8, band: [0, 3.0], recovery: 0.5,
    beats: [parting([1, 2, 2, 3])],
  },
  riposte3: {
    label: 'Riposte (staff)', phase: 3, weight: 0, counter: true, cooldown: 0, band: [0, 5], recovery: 0.6,
    beats: [cut('flatBack', N, 0.46, 15, { form: 3, track: 0.7 }), spin(N, 0.36, 14, { form: 3, cock: 0.6 })],
  },
  // -------------------------------------------------------------- form 3, the second pass: the floor is rarely empty
  /** Walking Mountain: he walks the hero down inside the turning staff (a ring, three cuts, a ring,
   *  each a stride on), then vaults back on it and drives it into the floor: fissures race out
   *  (parry the one that comes for you, or step between them). */
  walkingMountain: {
    label: 'Walking Mountain', phase: 3, weight: W(3, 3.4), cooldown: 7, band: [0, 5.5], recovery: 0.75, recoveryKeys: FLOURISH[2], gapCloser: true,
    beats: [
      spin(N, 0.5, 12, { form: 3, travel: walk(1.6), close: 0 }),
      cut('flat', N, 0.36, 12, { form: 3, travel: walk(1.1) }),
      cut('flatBack', N, 0.36, 12, { form: 3, step: 'L', travel: walk(1.1) }),
      spin(N, 0.36, 12, { form: 3, cock: 0.55, travel: walk(1.2), close: 0 }),
      cut('rise', N, 0.36, 13, { form: 3, travel: walk(1.0) }),
      cut('diag', N, 0.34, 13, { form: 3, step: 'L', travel: walk(0.9) }),
      rift(0.62, 3, { fixed: false, travel: [[0.08, 0], [0.7, -3.0]], lift: [[0.08, 0], [0.4, 0.8], [0.75, 0]], release: { style: 'rift', count: 3, spread: 0.32, speed: 10, from: 0.4 } }),
    ],
  },
  /** Wheel of Stones: he tears three stones out of the floor; they turn round him while he cuts,
   *  and one flies at the hero in each pause of the string (white: parry each). (Its band 0 - 6 m
   *  was wider than its cuts reach: picked past 4.4 m it tore the stones and stopped, no cue; the
   *  tuning pass, 2026-11-16) */
  stoneWheel: {
    label: 'Wheel of Stones', phase: 3, weight: W(3, 2.4), cooldown: 9, band: [0, 4.4], recovery: 0.75, recoveryKeys: FLOURISH[2], cat: 'string',
    beats: [
      // (the cuts a stone's flight apart: each stone's glint after the cut before it has landed,
      // its contact before the next cut's glint)
      orbitCast(0.5),
      cut('flat', N, 0.5, 13, { form: 3 }),
      cut('flatBack', N, 0.34, 13, { form: 3, step: 'L' }),
      spin(N, 0.74, 13, { form: 3, cock: 0.7 }),
      cut('rise', N, 0.34, 13, { form: 3 }),
      cut('flatBack', N, 0.78, 13, { form: 3, step: 'L', cock: 0.76 }),
      cut('diag', N, 0.34, 13, { form: 3 }),
      cut('thrust', B, 0.78, 21, { form: 3, cock: 0.8 }),
    ],
  },
  /** Star in the Hand: two cuts, the Dark Star thrown from the free hand, and the string goes on
   *  while it drifts after the hero: a ring, a rising cut, a held overhead; it bursts just after
   *  (red: be out of its ring, or roll). */
  starHand: {
    label: 'Star in the Hand', phase: 3, weight: W(3, 2.2), cooldown: 11, band: [0, 4.4], recovery: 0.75, recoveryKeys: FLOURISH[2], cat: 'string',
    beats: [
      cut('flat', N, 0.5, 13, { form: 3 }),
      cut('flatBack', N, 0.34, 13, { form: 3, step: 'L' }),
      starCast(0.46),
      spin(N, 0.38, 14, { form: 3, cock: 0.6 }),
      cut('rise', N, 0.36, 13, { form: 3 }),
      cut('diag', N, 0.34, 13, { form: 3, step: 'L' }),
      cut('over', B, 0.44, 22, { form: 3, lock: true, hold: [0.05, 0.2], cock: 0.72 }),
    ],
  },
  /** Grinding Wheel: two rings and a cut, the low red ring at the ankles, and the perilous thrust
   *  (a mikiri) or the somersault. */
  grindingWheel: {
    label: 'Grinding Wheel', phase: 3, weight: W(3, 2.8), cooldown: 7, band: [0, 4.4], recovery: 0.75, recoveryKeys: FLOURISH[2],
    beats: [
      spin(N, 0.5, 13, { form: 3 }),
      cut('flatBack', N, 0.34, 13, { form: 3, step: 'L' }),
      cut('flat', N, 0.34, 13, { form: 3 }),
      spin(N, 0.36, 13, { form: 3, cock: 0.6 }),
      cut('back', N, 0.34, 13, { form: 3, step: 'L' }),
      spin(R, 0.58, 22, { form: 3, low: true, cock: 0.62 }),
      { pick: [peril(3), cut('flip', B, 0.6, 24, { form: 3, lock: true })] },
    ],
  },

  // ============================================================== form 4: the cross-hilted blade, the Void's aura
  /** Judgment: six heavy two-handed blows; a held overhead in the middle, a perilous thrust to end. */
  judgment: {
    label: 'Judgment', phase: 4, weight: W(4, 2.8), cooldown: 6, band: [0, 4.0], recovery: 0.8, recoveryKeys: FLOURISH[3],
    beats: [
      cut('diag', N, 0.5, 14, { form: 4 }),
      cut('back', N, 0.34, 13, { form: 4, step: 'L' }),
      cut('flat', N, 0.34, 13, { form: 4 }),
      cut('over', B, 0.44, 22, { form: 4, hold: [0.1, 0.32], cock: 0.72, lock: true }),
      { pick: [cut('flatBack', N, 0.36, 13, { form: 4, step: 'L' }), cut('rise', N, 0.36, 13, { form: 4, step: 'L' })] },
      { pick: [
        { tell: R, windup: 0.62, active: 0.12, damage: 28, knockback: 2.5, zone: { kind: 'line', r: 2.4, w: 0.7 }, mikiri: true, dash: { from: 0.84, to: 1.0, stop: 0.8, max: 2.8 }, close: 0, track: 0.7, keys: perilKeys(1) },
        cut('flip', B, 0.6, 26, { form: 4, lock: true }),
        cut('aerial', B, 0.58, 24, { form: 4 }),
      ] },
    ],
  },
  /** Eclipse: steel and the Void in one breath: two cuts, a full turn, a bolt from the free hand,
   *  a rising cut, and the somersault (or a thrust). */
  eclipse: {
    label: 'Eclipse', phase: 4, weight: W(4, 2.4), cooldown: 7, band: [0, 4.0], recovery: 0.8, recoveryKeys: FLOURISH[3],
    beats: [
      cut('flat', N, 0.5, 13, { form: 4 }),
      cut('back', N, 0.34, 13, { form: 4, step: 'L' }),
      spin(N, 0.36, 14, { form: 4, cock: 0.6 }),
      bolt(0.6, 20, { cock: 0.6 }), // (the second pass: 0.5 s `fixed` before; the same in form 4, holdable)
      cut('rise', N, 0.42, 13, { form: 4 }),
      { pick: [cut('flip', B, 0.6, 26, { form: 4, lock: true }), cut('thrust', B, 0.4, 22, { form: 4 })] },
    ],
  },
  /** Void Rend: he is gone, and behind you: three cuts, each from a new side. */
  rend: {
    label: 'Void Rend', phase: 4, weight: W(4, 2.0), cooldown: 8, band: [0, 12], recovery: 0.65, gapCloser: true,
    beats: [
      // (the second pass: authored at form 1's pace instead of `fixed`, the same times in form 4
      // (x 0.83): a blow the fairness guard may hold at the cock rather than turn into a feint)
      cut('flat', N, 0.75, 14, { form: 4, blink: { behind: 2.0 }, close: 1.2 }),
      cut('flatBack', N, 0.6, 14, { form: 4, blink: { behind: 2.0 }, close: 1.2 }),
      cut('over', B, 0.675, 24, { form: 4, blink: { behind: 2.1 }, close: 1.2, lock: true }),
    ],
  },
  /** Chained Lightning: four bolts in rhythm. Deflect them all. */
  chain: {
    label: 'Chained Lightning', phase: 4, weight: W(4, 1.6), cooldown: 9, band: [4, 16], recovery: 0.6,
    beats: [bolt(0.8, 20), bolt(0.46, 20, { cock: 0.5 }), bolt(0.46, 20, { cock: 0.5 }), bolt(0.46, 24, { cock: 0.5 })],
  },
  /** Red Tide: three cuts that each throw a crescent of red light. */
  tide: {
    label: 'Red Tide', phase: 4, weight: W(4, 0.9), cooldown: 8, band: [6, 16], recovery: 0.55,
    beats: [
      { ...cut('flat', N, 0.5, 14, { form: 4 }), zone: undefined, release: { style: 'crescent', count: 1 }, close: 0 },
      { ...cut('flatBack', N, 0.44, 14, { form: 4 }), zone: undefined, release: { style: 'crescent', count: 3, spread: 0.34 }, close: 0 },
      { ...cut('diag', N, 0.44, 14, { form: 4 }), zone: undefined, release: { style: 'crescent', count: 1 }, close: 0 },
    ],
  },
  /** The Starless Sky: he calls the lightning down: marked ground, then the strikes (red). */
  storm: {
    label: 'The Starless Sky', phase: 4, weight: W(4, 1.0), cooldown: 14, band: [0, 16], recovery: 0.45,
    beats: [{ tell: R, windup: 0.95, fixed: true, active: 0.1, damage: 26, knockback: 3, cast: { kind: 'storm', count: 6, selfCue: true }, part: 'feet', close: 0, track: 0.3, keys: stormKeys() }],
  },
  /** Dark Star: a starless sun that drifts after the hero, drinking the light, and bursts (red: be
   *  out of its ring when it does). He does not wait for it. */
  star: {
    label: 'Dark Star', phase: 3, weight: [0, 0, 0.6, 0.9], cooldown: 12, band: [0, 16], recovery: 0.4,
    beats: [{ tell: R, windup: 0.9, fixed: true, active: 0.1, damage: 30, knockback: 3.5, cast: { kind: 'star', selfCue: true }, part: 'hand', close: 0, track: 0.5, keys: starKeys() }],
  },
  riposte4: {
    label: 'Riposte (cross)', phase: 4, weight: 0, counter: true, cooldown: 0, band: [0, 5], recovery: 0.55,
    beats: [cut('diag', N, 0.5, 16, { form: 4, track: 0.7 }), cut('thrust', B, 0.36, 22, { form: 4 })],
  },
  // -------------------------------------------------------------- form 4, the second pass: the Void as weather
  /** Void Waltz: six blinks, six cuts, each from a new side; the last a held chop (a lock). */
  voidWaltz: {
    label: 'Void Waltz', phase: 4, weight: W(4, 2.8), cooldown: 8, band: [0, 12], recovery: 0.7, recoveryKeys: FLOURISH[3], gapCloser: true,
    beats: [
      cut('flat', N, 0.6, 14, { form: 4, blink: { behind: 2.0 }, close: 1.2 }),
      cut('rise', N, 0.54, 13, { form: 4, blink: { behind: 2.0 }, close: 1.2 }),
      cut('flatBack', N, 0.54, 13, { form: 4, step: 'L', blink: { behind: 2.0 }, close: 1.2 }),
      cut('diag', N, 0.54, 13, { form: 4, blink: { behind: 2.0 }, close: 1.2 }),
      cut('back', N, 0.54, 13, { form: 4, step: 'L', blink: { behind: 2.0 }, close: 1.2 }),
      cut('over', B, 0.6, 24, { form: 4, blink: { behind: 2.1 }, close: 1.2, lock: true }),
    ],
  },
  /** Thunder Between: lightning between every two cuts, in rhythm (parry each), and a heavy thrust
   *  or the somersault to end. */
  thunderVerse: {
    label: 'Thunder Between', phase: 4, weight: W(4, 2.4), cooldown: 7, band: [0, 5], recovery: 0.75, recoveryKeys: FLOURISH[3],
    beats: [
      cut('flat', N, 0.6, 14, { form: 4 }),
      bolt(0.44, 18, { cock: 0.6 }),
      cut('back', N, 0.36, 13, { form: 4, step: 'L' }),
      bolt(0.44, 18, { cock: 0.6 }),
      cut('rise', N, 0.36, 13, { form: 4 }),
      cut('flatBack', N, 0.36, 13, { form: 4, step: 'L' }),
      bolt(0.44, 20, { cock: 0.6 }),
      { pick: [cut('thrust', B, 0.48, 22, { form: 4 }), cut('flip', B, 0.66, 26, { form: 4, lock: true })] },
    ],
  },
  /** Hollow Crown: two cuts, gone and behind the hero on a red cut (roll), lightning, gone again on
   *  a rising cut, and the low red ring. */
  hollowCrown: {
    label: 'Hollow Crown', phase: 4, weight: W(4, 2.2), cooldown: 8, band: [0, 4.4], recovery: 0.75, recoveryKeys: FLOURISH[3],
    beats: [
      cut('diag', N, 0.6, 14, { form: 4 }),
      cut('back', N, 0.42, 13, { form: 4, step: 'L' }),
      { ...cut('flat', R, 0.6, 22, { form: 4, cock: 0.76, blink: { behind: 2.2 }, close: 1.2 }), knockback: 2.2 },
      bolt(0.5, 18, { cock: 0.6 }),
      cut('rise', N, 0.48, 13, { form: 4, blink: { behind: 2.0 }, close: 1.2 }),
      cut('flat', N, 0.36, 13, { form: 4 }),
      spin(R, 0.62, 24, { form: 4, low: true, cock: 0.62 }),
    ],
  },
  /** Crimson Eclipse: four blows no guard holds, each a roll (red, red, red, and the perilous thrust a
   *  mikiri answers): a dashing cut, gone and behind the hero on the next, the low ring, the thrust.
   *  (Dodges only: what he does while his weather is falling.) */
  redEclipse: {
    label: 'Crimson Eclipse', phase: 4, weight: W(4, 1.6), cooldown: 8, band: [0, 6], recovery: 0.7, recoveryKeys: FLOURISH[3], gapCloser: true,
    beats: [
      { ...cut('flat', R, 0.72, 22, { form: 4, cock: 0.76 }), knockback: 2.2, dash: { from: 0.55, to: 0.98, stop: 1.1, max: 4.0 }, close: 0, track: 0.6 },
      { ...cut('back', R, 0.72, 22, { form: 4, cock: 0.76, step: 'L', blink: { behind: 2.0 }, close: 1.2 }), knockback: 2.2 },
      spin(R, 0.74, 24, { form: 4, low: true, cock: 0.62 }),
      peril(4, 26),
    ],
  },
  /** Starless Night, the great spell: the blade raised and driven into the floor (red: a ring at his
   *  feet, roll), and three waves of the Void run out over the whole crater from where he stands
   *  (red: roll through each as it reaches you). Once or twice a form. */
  starlessNight: {
    label: 'Starless Night', phase: 4, weight: [0, 0, 0, 1.3], cooldown: 32, band: [0, 16], recovery: 2.0, cat: 'hazard',
    beats: [
      { tell: R, windup: 1.2, fixed: true, active: 0.15, damage: 24, knockback: 4, knockdown: true, zone: { kind: 'ring', r: 3.0 }, ring: 3.0, part: 'feet', close: 0, track: 0.3, keys: riftKeys() },
      { tell: R, windup: 0.42, fixed: true, active: 0.1, damage: 22, knockback: 3.5, cast: { kind: 'night', selfCue: true }, part: 'feet', close: 0, track: 0, keys: [[1.0, { ...riftKeys()[3][1] }], [2.0, { ...riftKeys()[3][1] }]] },
    ],
    recoveryKeys: [[0.6, { ...riftKeys()[3][1] }]],
  },

  // ============================================================== the forms' ignitions (transitions)
  ignite2: ignite(2),
  ignite3: ignite(3),
  ignite4: ignite(4),
};
// His answer to a streak of guards (duelist.js `streak`, DEFENSE.foeStreak), one for each blade
// form: as many cuts as the streak counts, the first from where he stands, each of the others from
// another side of the hero (`flit`); a raised guard meets them from any side. Realised with
// { count } (realise.js): beat 0, then the others in turn.
const storm = (form, kinds) => ({
  label: `Starless Storm${form > 1 ? ` (${form})` : ''}`, phase: form, weight: 0, counter: true, streak: true, cooldown: 0, band: [0, 6], recovery: 0.75,
  beats: kinds.map((k, i) => cut(k, N, i ? 0.48 : 0.62, 13, i ? { form, flit: { r: 2.7 } } : { form, track: 0.7 })),
});
MOVES.streakFlurry = storm(1, ['diag', 'flat', 'rise', 'back']);
MOVES.streakFlurry2 = storm(2, ['diag', 'flat', 'rise', 'back']);
MOVES.streakFlurry3 = storm(3, ['flatBack', 'flat', 'diag', 'back']);
MOVES.streakFlurry4 = storm(4, ['diag', 'flatBack', 'rise', 'flat']);

// ---------------------------------------------------------------- the sword motion pass (ADR-226)
// Behind `?lordMotion=a` (duelist/lookSwitch.js, PENDING until the owner picks; '0' = as before): his
// blade held in line with his forearm and his arms opening at the end of a blow (TUNING.motion, his
// animator); every blue and red blade blow wound into its held tell pose (duelist/tellPose.js:
// `motionKeys`, the same windups); each string's end a shake of the steel held a beat instead of the
// roll round the wrist (`motionRecovery`: the roll's back half went through his hood and its stop
// jolted the point 1.5 - 2.5 m a frame²); and two QUICK blows out of his guard (`quick` beats: a normal
// tell, a windup of TUNING.minQuickWindup, fixed; `motionOnly`: his AI picks them only while it is on).
export const motionOn = () => lookOf('lordMotion', '0') !== '0';
/** The strings' ends, per form: the steel shaken off down and out, held, and back to the guard. */
const SHAKE = [
  [[0.24, { e: 'o', arm: 0, two: 0, rH: [-0.2, -0.38, 0.16], rP: [-0.8, -0.4, -0.4], sw: [-1.35, -0.56], yaw: 0.3, bY: -0.12 }], [0.62, { arm: 0, two: 0, rH: [-0.17, -0.4, 0.13], sw: [-1.25, -0.62] }]],
  [
    [0.24, { e: 'o', arm: 0, larm: 0, rH: [-0.2, -0.38, 0.16], sw: [-1.35, -0.56], lH: [0.2, -0.38, 0.16], lsw: [1.35, -0.56], yaw: 0.08, bY: -0.12 }],
    [0.62, { arm: 0, larm: 0, rH: [-0.17, -0.4, 0.13], sw: [-1.25, -0.6], lH: [0.17, -0.4, 0.13], lsw: [1.25, -0.6] }],
  ],
  [[0.24, { e: 'o', arm: 0, two: 1, rH: [0.0, -0.34, 0.28], sw: [-1.55, -0.24], yaw: 0.2, bY: -0.12 }], [0.62, { arm: 0, two: 1, rH: [0.03, -0.31, 0.3], sw: [-1.45, 0.06] }]],
  FLOURISH[3],
];
for (const def of Object.values(MOVES)) {
  const i = FLOURISH.indexOf(def.recoveryKeys);
  if (i >= 0) def.motionRecovery = SHAKE[i];
}
const quickCut = (path, o = {}) => ({
  tell: N, quick: true, fixed: true, windup: TUNING.minQuickWindup, active: 0.08, damage: 12, knockback: 0.6, track: 0.85,
  zone: { kind: 'sector', r: o.r ?? 2.3, ang: 0.8 }, keys: slash({ ...path, cock: 0.55, two: o.two ?? 0 }),
});
Object.assign(MOVES, {
  /** Rising Ember: from the blade hung low at his side, a cut straight up through you, no draw. A
   *  normal blow. Forms 1 - 3 (the twin blades' right one; the staff's lower end). */
  emberRise: {
    label: 'Rising Ember', phase: 1, weight: [1.5, 1.4, 1.2, 0], cooldown: 3.4, band: [0, 3.6], recovery: 0.45, motionOnly: true,
    beats: [quickCut({ from: [-0.8, -0.72], through: [0.0, 0.08], to: [1.0, 0.85], yaw: [0.24, 0.36, 0.6] })],
  },
  /** Vigil's Fall: form 4's blade already stands upright before his face; it falls straight down on
   *  you, both hands on the hilt. A normal blow. */
  vigilFall: {
    label: "Vigil's Fall", phase: 4, weight: [0, 0, 0, 1.6], cooldown: 3.4, band: [0, 3.8], recovery: 0.45, motionOnly: true,
    beats: [quickCut({ from: [0.05, 1.42], through: [0.0, 0.0], to: [-0.3, -0.78], yaw: [0.12, 0.14, 0.2] }, { two: 1, r: 2.6 })],
  },
});
motionize(MOVES);

// ---------------------------------------------------------------- the form pass (ADR-251): the keys
// Behind `?lordForm=a` ('0' = as before; duelist/lookSwitch.js): every beat's `formKeys` (and, for the
// blows ADR-226 holds, `formMotionKeys`), its move's `formRecovery`: the same windups, impacts, zones and
// root motion, only the poses (the fragments above). Read by the realisers through `keysOf`.
export const formOn = () => lookOf('lordForm', '0') !== '0';
const near = (a, b) => Math.abs(a - b) < 1e-6;
const voidBeat = (b) => !!(b.bolt || b.pull || b.grip || b.cast || b.release || b.feint);
/** One key of a beat in the form: a thrust's lunge, a two-handed chop's diagonal. */
function formKey(u, k, b, chop) {
  if (u >= 1 - 1e-6 && b.zone?.kind === 'line' && !voidBeat(b) && Array.isArray(k.sw) && !(k.arm > 0) && !(k.larm > 0)) {
    return { ...k, ...lungeF(k, u, !!b.mikiri) };
  }
  if (chop && Array.isArray(k.sw)) {
    // (a somersault's landing keeps its turn: pitch is the flip's, round TAU)
    const keepPitch = Math.abs(k.pitch ?? 0) > 1 ? { pitch: k.pitch } : {};
    if (u >= 1 - 1e-6 && k.sw[1] < -0.4) {
      const bZ = k.bZ ?? G1.bZ;
      return { ...k, ...(u < 1.3 ? CHOP_F : CHOP_FOLLOW), ...keepPitch, rF: [-0.1, bZ + 0.44], lF: [0.2, bZ - 0.58], rK: [-0.2, 0, 1], lK: [0.35, -0.2, 0.9] };
    }
    if (u < 1 - 1e-6 && k.sw[1] > 1.3 && Math.abs(k.pitch ?? 0) < 1) return { ...k, ...RAISED_F };
  }
  return k;
}
/** The value of a foot field at key i or before (the form-1 guard's before any key sets it). */
function footAt(keys, i, f) {
  for (let j = i; j >= 0; j--) if (keys[j][1][f]) return keys[j][1][f];
  return [G1[f][0], G1[f][2]];
}
/** The strike lands with the front footfall (ki-ken-tai-ichi): where a beat steps a foot in (the right,
 *  or the left in a string's left-foot cuts), the foot is keyed off the floor halfway through the step and
 *  down just before the impact, instead of the planner stepping it once the key has drifted (it came down
 *  0.05 - 0.1 s after the blade). Not in a dash, a leap, a flit or a lift (the root carries the feet), nor
 *  where the foot is already up. */
function stepIn(keys, b) {
  if (b.dash || b.lift || b.leap || b.flit || b.blink || b.travel) return keys;
  const hi = keys.findIndex(([u]) => near(u, 1));
  if (hi < 1) return keys;
  const zOf = (v) => (v.length === 2 ? v[1] : v[2]), yOf = (v) => (v.length === 3 ? v[1] : ANK);
  let best = null;
  for (const f of ['rF', 'lF']) {
    const to = keys[hi][1][f];
    if (!to) continue;
    const prev = footAt(keys, hi - 1, f);
    const dz = zOf(to) - zOf(prev);
    if (dz < 0.12 || yOf(to) > ANK + 0.02 || yOf(prev) > ANK + 0.02) continue;
    if (!best || dz > best.dz) best = { f, to, prev, dz };
  }
  if (!best) return keys;
  const { f, to, prev } = best;
  const u0 = keys[hi - 1][0], um = u0 + 0.5 * (1 - u0), ud = u0 + 0.86 * (1 - u0);
  const z0 = zOf(prev), z1 = zOf(to);
  const out = keys.slice(0, hi);
  out.push([um, { [f]: [(prev[0] + to[0]) / 2, LIFT, z0 + 0.55 * (z1 - z0)] }]);
  out.push([ud, { [f]: [to[0], ANK, z1] }]);
  return out.concat(keys.slice(hi));
}
const formBeat = (b, keys, chop) => stepIn(keys.map(([u, k]) => [u, formKey(u, k, b, chop)]), b);
const alts = (raw) => (Array.isArray(raw.pick) ? raw.pick : [raw]);
const DOWN = new WeakSet(); // beats that come down from overhead in the form (the diagonal ones)
for (const def of Object.values(MOVES)) for (const raw of def.beats ?? []) for (const b of alts(raw)) {
  if (!Array.isArray(b.keys)) continue;
  const alt = FORM.get(b.keys), chop = CHOPS.has(b.keys);
  b.formKeys = formBeat(b, alt ?? b.keys, chop);
  if (chop) DOWN.add(b);
}
/** The blue HIGH hold (duelist/tellPose.js) of a blow that comes down in the form: the same raised blade, a
 *  little further out over his sword shoulder (world az -1.1, not -0.42), so the strike from it comes ACROSS
 *  him (a diagonal at the game camera) instead of straight down the middle; its hold ends at 0.7 of the
 *  windup, not 0.8 (the wider strike gets half as long again). */
const HIGH_F = [-1.1, 1.15];
const widenHigh = (keys) => keys.map(([u, k]) => {
  if (!(u > 0.3 && u < 1 && k.sw && k.sw[1] > 1.1)) return [u, k];
  return [k.e === 'h' && u > 0.75 ? 0.7 : u, { ...k, sw: [W2B(HIGH_F[0], k.yaw ?? G1.yaw), HIGH_F[1]] }];
});
// the held tell poses (ADR-226) over the form's keys: motionize a shadow table, then keep its keys
{
  const shadow = {};
  for (const [n, def] of Object.entries(MOVES)) {
    shadow[n] = { ...def, beats: (def.beats ?? []).map((raw) => (Array.isArray(raw.pick) ? { pick: raw.pick.map((b) => ({ ...b, keys: b.formKeys ?? b.keys, motionKeys: undefined })) } : { ...raw, keys: raw.formKeys ?? raw.keys, motionKeys: undefined })) };
  }
  motionize(shadow);
  for (const [n, def] of Object.entries(MOVES)) (def.beats ?? []).forEach((raw, i) => {
    const S = alts(shadow[n].beats[i]);
    alts(raw).forEach((b, j) => {
      const m = S[j]?.motionKeys;
      if (m && b.motionKeys) b.formMotionKeys = stepIn(DOWN.has(b) && b.tell === B ? widenHigh(m) : m, b);
    });
  });
}
// a move's recovery in the form: a lunge held as the lunge now is
for (const def of Object.values(MOVES)) {
  const R = def.motionRecovery ?? def.recoveryKeys;
  if (!Array.isArray(R)) continue;
  const line = def.beats.some((raw) => alts(raw).some((b) => b.zone?.kind === 'line' && !voidBeat(b)));
  if (!line) continue;
  const mik = def.beats.some((raw) => alts(raw).some((b) => b.mikiri));
  def.formRecovery = R.map(([r, k]) => (Array.isArray(k.rF) && k.rF[k.rF.length - 1] > 0.8 ? [r, { ...k, ...lungeF(k, 1.6, mik), bY: -0.28 }] : [r, k]));
}
export const MOVE_NAMES = Object.keys(MOVES);
/** Each form's flurry (the kit's `streakMove`). */
export const STREAKS = Object.freeze(['streakFlurry', 'streakFlurry2', 'streakFlurry3', 'streakFlurry4']);
/** The transition that begins each later form, and each form's counter out of his guard. */
export const TRANSITIONS = Object.freeze({ 2: 'ignite2', 3: 'ignite3', 4: 'ignite4' });
export const COUNTERS = Object.freeze(['riposte', 'riposte2', 'riposte3', 'riposte4']);

// ---------------------------------------------------------------- reaction clips (no hits)
const KNEEL = { bY: -0.52, pitch: 0.22, spX: 0.1, hdX: 0.5, rF: [-0.12, 0.32], lF: [0.17, -0.42], rK: [0, 0, 1], lK: [0.1, -0.85, 0.5], flat: 0.7 };
/** Seated on the throne: the root is raised to the seat (lord.js), the hands on the arm rests. */
const THRONE = {
  two: 0, bY: -0.42, bZ: -0.04, pitch: -0.08, yaw: 0, hip: 0, hipX: 0, spX: 0.0, spY: 0, hdX: 0.12, hdY: 0,
  rF: [-0.17, 0.05, 0.52], lF: [0.17, 0.05, 0.52], rK: [-0.15, 0.2, 1], lK: [0.15, 0.2, 1], rFy: 0, lFy: 0, flat: 1,
  rH: [-0.14, -0.4, 0.2], rP: [-0.8, -0.3, -0.5], sw: [-0.3, -1.25], swF: [1, 0, 0], lH: [0.14, -0.4, 0.2], lP: [0.8, -0.3, -0.5],
};

export const CLIPS = {
  /** His guard: the wards that meet a strike, the deflect, the raised guard (duelist/guard.js). */
  ...GUARD_CLIPS,
  flinch: { dur: 0.26, keys: [[0.07, { e: 'o', spX: -0.06, hdX: -0.12, bZ: -0.05, yaw: 0.46 }]] },
  // (he does not hop back: the Void carries him, the feet off the floor: lord.js lifts the root)
  backstep: {
    dur: 0.46,
    keys: [
      [0.14, { bY: -0.04, pitch: -0.16, spX: 0.06, hdX: 0.1, rF: [-0.1, 0.14, 0.34], lF: [0.13, 0.2, 0.16], rK: [-0.2, 0, 1], lK: [0.2, 0, 1], flat: 0.2 }],
      [0.3, { bY: -0.05, pitch: -0.1, rF: [-0.11, 0.12, 0.26], lF: [0.14, 0.16, 0.06], flat: 0.3 }],
      [0.42, { bY: -0.16, pitch: 0.04, rF: [-0.14, 0.22], lF: [0.19, -0.2], flat: 0.9 }],
    ],
  },
  sidestep: {
    dur: 0.4,
    keys: [
      [0.12, { bY: -0.04, roll: 0.14, rF: [-0.14, 0.14, 0.12], lF: [0.16, 0.2, -0.1], rK: [-0.2, 0, 1], lK: [0.2, 0, 1], flat: 0.2 }],
      [0.3, { bY: -0.08, roll: 0.06, rF: [-0.15, 0.1, 0.16], lF: [0.18, 0.12, -0.14], flat: 0.5 }],
    ],
  },
  stagger: {
    dur: 0.8,
    keys: [
      [0.12, { e: 'o', pitch: -0.2, bZ: -0.1, bY: -0.14, rH: [-0.3, -0.2, 0.1], sw: [-1.7, 0.2], swF: [0, 1, 0], lH: [0.3, 0.0, 0.1], hdX: -0.2, ...STEP_BACK }],
      [0.5, { pitch: -0.08, bY: -0.16, rH: [-0.25, -0.2, 0.2], sw: [-1.3, 0.1], lH: [0.25, 0.0, 0.2] }],
    ],
  },
  /** His last hit parried (or a bolt thrown back): the blade knocked up and back, a step back. */
  recoil: {
    dur: 1.0,
    keys: [
      [0.1, { e: 'o', pitch: -0.24, bZ: -0.1, rH: [-0.1, 0.2, 0.15], rP: [-0.8, 0.4, -0.4], sw: [-0.5, 1.4], swF: [1, 0, 0], lH: [0.3, 0.05, 0.05], hdX: -0.2, ...STEP_BACK }],
      [0.6, { pitch: -0.12, rH: [-0.1, 0.05, 0.25], sw: [-0.6, 0.8], lH: [0.25, 0.1, 0.1] }],
    ],
  },
  reeling: {
    dur: 1.45,
    keys: [
      [0.12, { e: 'o', two: 0, pitch: -0.32, bZ: -0.14, bY: -0.12, yaw: -0.2, rH: [-0.34, 0.05, 0.05], rP: [-0.9, 0.3, -0.3], sw: [-2.3, 0.45], swF: [0, 1, 0], lH: [0.32, 0.1, 0.0], lP: [0.9, 0.3, 0.0], hdX: -0.3, rF: [-0.12, 0.05], lF: [0.2, -0.5] }],
      [0.6, { two: 0, pitch: -0.2, bY: -0.2, yaw: 0.0, rH: [-0.3, -0.05, 0.12], sw: [-2.0, 0.2], lH: [0.3, 0.0, 0.1], hdX: -0.1, rF: [-0.14, -0.15], lF: [0.18, -0.45] }],
      [1.1, { pitch: -0.05, bY: -0.18, rH: [-0.1, -0.1, 0.3], sw: [-0.9, 0.2], lH: [0.1, -0.05, 0.3] }],
    ],
  },
  trampled: {
    dur: 1.5,
    keys: [
      [0.1, { e: 'o', pitch: 0.42, bY: -0.34, bZ: 0.1, rH: [0.02, -0.38, 0.45], rP: [-0.6, -0.6, 0.2], sw: [-0.25, -1.15], swF: [1, 0, 0], lH: [0.2, -0.2, 0.2], hdX: 0.45, rF: [-0.08, 0.7], lF: [0.22, -0.48] }],
      [0.75, { pitch: 0.35, bY: -0.3, rH: [0.0, -0.36, 0.42], sw: [-0.3, -1.1], hdX: 0.4 }],
      [1.0, { e: 'o', pitch: -0.2, bY: -0.16, bZ: -0.1, rH: [-0.25, 0.0, 0.15], sw: [-1.9, 0.3], swF: [0, 1, 0], lH: [0.3, 0.05, 0.05], hdX: -0.1, ...STEP_BACK }],
    ],
  },
  lock: {
    dur: 3, hold: true,
    keys: [
      [0.1, { e: 'o', two: 0.8, bY: -0.22, bZ: 0.08, pitch: 0.12, yaw: 0.3, rH: [0.08, 0.0, 0.44], rP: [-0.7, -0.2, -0.3], sw: [0.5, 0.95], swF: [0, 0.3, -1], hdX: 0.1, hdY: -0.3, rF: [-0.1, 0.4], lF: [0.2, -0.42] }],
      [3, { two: 0.8, bY: -0.24, bZ: 0.1, pitch: 0.14, yaw: 0.3, rH: [0.08, 0.0, 0.45], sw: [0.46, 0.97], swF: [0, 0.3, -1], rF: [-0.1, 0.42], lF: [0.2, -0.44] }],
    ],
  },
  /** Broken: on one knee, the blade's point on the floor, the head bowed: the deathblow's opening. */
  broken: {
    dur: 4.5, hold: true,
    keys: [
      [0.25, { e: 'o', two: 0, ...KNEEL, rH: [-0.15, -0.4, 0.3], rP: [-0.7, -0.4, -0.3], sw: [-0.6, -1.0], swF: [1, 0, 0], lH: [0.05, -0.45, 0.15], lP: [0.6, -0.3, 0.3], lsw: [0.6, -1.0] }],
      [4.2, { two: 0, ...KNEEL, hdX: 0.4, rH: [-0.15, -0.38, 0.3], sw: [-0.6, -0.95], lH: [0.05, -0.43, 0.15], lsw: [0.6, -0.95] }],
      [4.5, { two: 0, ...KNEEL, bY: -0.4, hdX: 0.2, rH: [-0.1, -0.3, 0.32], sw: [-0.5, -0.6], lH: [0.05, -0.3, 0.2], lsw: [0.5, -0.6] }],
    ],
  },
  /** The deathblow lands: run through, he lurches, and is thrown back onto one knee. */
  executed: {
    dur: 1.2, hold: true,
    keys: [
      [0.0, { two: 0, ...KNEEL, rH: [-0.15, -0.4, 0.3], sw: [-0.6, -1.0], lH: [0.05, -0.45, 0.15], lsw: [0.6, -1.0] }],
      [0.2, { e: 'o', two: 0, ...KNEEL, pitch: -0.3, hdX: -0.35, bY: -0.45, rH: [-0.3, -0.2, 0.05], sw: [-1.4, -0.4], lH: [0.3, -0.1, 0.1], lsw: [1.4, -0.4] }],
      [0.75, { two: 0, ...KNEEL, pitch: 0.3, hdX: 0.5, bY: -0.54, rH: [-0.15, -0.42, 0.28], sw: [-0.6, -1.05], lH: [0.0, -0.4, 0.25], lsw: [0.6, -1.05] }],
      [1.2, { two: 0, ...KNEEL, pitch: 0.24, hdX: 0.5, bY: -0.52, rH: [-0.12, -0.42, 0.26], sw: [-0.5, -1.0], lH: [0.08, -0.44, 0.16], lsw: [0.6, -1.0] }],
    ],
  },
  /** Defeated: he sinks to his knees; the blade goes dark; he falls forward. */
  death: {
    dur: 2.6, hold: true,
    keys: [
      [0.4, { e: 'o', two: 0, ...KNEEL, pitch: 0.1, rH: [-0.2, -0.36, 0.2], sw: [-0.8, -0.9], lH: [0.2, -0.36, 0.2] }],
      [1.3, { two: 0, bY: -0.62, pitch: 0.16, hdX: 0.5, rH: [-0.22, -0.44, 0.16], sw: [-1.0, -1.1], lH: [0.22, -0.44, 0.16], rF: [-0.13, -0.3], lF: [0.13, -0.3], rK: [-0.05, -0.6, 0.8], lK: [0.05, -0.6, 0.8], flat: 0.2 }],
      [2.6, { two: 0, bY: -0.8, pitch: 1.2, hdX: 0.3, rH: [-0.3, -0.2, 0.3], sw: [-1.2, -0.3], lH: [0.3, -0.2, 0.3], rF: [-0.13, -0.5], lF: [0.13, -0.5], rK: [-0.05, -0.6, 0.8], lK: [0.05, -0.6, 0.8], flat: 0.1 }],
    ],
  },
  /** On the throne (asleep: the fight has not begun). */
  meditate: { dur: 1, hold: true, keys: [[0, { ...THRONE }]] },
  /** The intro: he lifts his head, rises from the throne, the blade ignites in his hand, and he
   *  leaps down to the seal (lord.js moves the root: TUNING.intro). */
  intro: {
    dur: 3.1,
    keys: [
      [0, { ...THRONE }],
      [0.5, { ...THRONE, hdX: -0.04 }],
      // standing before the throne, the hilt raised
      [1.2, { two: 0, bY: -0.06, bZ: 0.0, pitch: 0.0, yaw: 0.0, hdX: 0.0, rH: [-0.1, -0.1, 0.3], sw: [-0.2, 1.3], swF: [1, 0, 0], lH: [0.14, -0.4, 0.05], rF: [-0.14, 0.02, 0.1], lF: [0.14, 0.02, 0.1], rK: [-0.1, 0, 1], lK: [0.1, 0, 1] }],
      // the crouch before the leap
      [1.5, { two: 0, bY: -0.36, pitch: 0.2, yaw: 0.0, rH: [-0.1, -0.3, 0.2], sw: [-1.0, -0.2], lH: [0.2, -0.3, 0.1], rF: [-0.14, 0.02, 0.2], lF: [0.14, 0.02, -0.05], rK: [-0.2, 0.2, 1], lK: [0.2, 0.2, 1] }],
      // in the air, the blade swept back
      [2.0, { two: 0, bY: -0.1, pitch: 0.1, yaw: 0.2, rH: [-0.3, 0.0, -0.1], sw: [-2.2, 0.3], lH: [0.3, 0.1, 0.2], rF: [-0.12, 0.3, 0.3], lF: [0.14, 0.2, -0.3], rK: [-0.2, 0.3, 1], lK: [0.2, 0.1, 1], flat: 0 }],
      // the landing: low, one hand to the floor
      [2.5, { e: 'i', two: 0, bY: -0.5, pitch: 0.3, yaw: 0.3, hdX: 0.3, rH: [-0.3, -0.1, -0.05], sw: [-2.0, 0.15], lH: [0.12, -0.5, 0.3], rF: [-0.16, 0.46], lF: [0.2, -0.36], rK: [-0.3, 0.2, 0.8], lK: [0.4, -0.3, 0.8], flat: 0.8 }],
      [2.8, { two: 0, bY: -0.44, pitch: 0.22, yaw: 0.36, hdX: 0.0, rH: [-0.2, -0.14, 0.1], sw: [-1.4, 0.3], lH: [0.12, -0.36, 0.3], rF: [-0.14, 0.42], lF: [0.2, -0.34] }],
    ],
  },
};

/** Compiled reaction clips, one set per form (each round its form's guard). */
const compileClips = (K, edit = null) => {
  const out = Object.fromEntries(Object.entries(CLIPS).map(([k, c]) => [k, K.compileClip(c.keys.map(([t, pose]) => ({ t, ...(edit ? edit(k, pose) : pose) })), c.dur, { hold: !!c.hold })]));
  for (const [k, c] of Object.entries(out)) c.name = k;
  return out;
};
export const CLIPS_BY_FORM = FORM_POSES.map((K) => compileClips(K));

// ---------------------------------------------------------------- after the reference pack (ADR-277)
// `?lordRefMove=a` (refLook.js; '0' = as shipped): the reference pack's poses over whatever keys the
// shipped switches pick (ADR-226's held tells, ADR-251's form, the pace's holds): the same key times, the
// same eases, so every windup, impact, active window, zone, flash and cue lands where it did (the
// realiser times a beat from its windup, never from its poses), and no root motion is added (bX / bZ are
// pose offsets). What changes, from the strips (docs/art/character-packs-v04/varr-nihil, COVERAGE.md):
//   - each form's guard lower on wider feet (poses.js GUARDS_REF), so every clip starts and ends there;
//   - the load before a blow sinks a little (05 C1-C7 anticipation), the strike and its follow-through
//     sink further and lean into the cut (05 contact / follow: "full commit, weight forward"); feet on the
//     floor a little wider; not in the air (a flip's, a cartwheel's turn) and not on a leap;
//   - the free fist thrown out behind in opposition through a one-handed cut (06 F1-F3, 15);
//   - Vigil's Fall ends low with the point at the floor (13 H2, which replaces 08 M3);
//   - Starfall lands with the staff upright, its lower end driven into the floor (13 H3, replaces 07 A6);
//   - the reactions read bigger: the recoils further back, the stagger lower (03 R5 - R7); the carried
//     backstep / sidestep lean further (02 L4 / L5).
const REF = { load: 0.05, sink: 0.09, lean: 0.1, wide: 0.03, fist: [0.08, 0.02, -0.08], floor: -0.4 };
// (a key already lower than `floor` keeps its own height: a crouch, a sweep or a kneel is not pushed deeper,
// the knees would fold shut)
const sinkTo = (bY, by) => Math.max(bY - by, Math.min(bY, REF.floor));
const FLOOR = ANK + 0.02;
const widen = (v, s) => (v.length === 2 ? [v[0] + s * REF.wide, v[1]] : v[1] <= FLOOR ? [v[0] + s * REF.wide, v[1], v[2]] : v);
const clampReach = (v, r = 0.55) => {
  const n = Math.hypot(v[0], v[1], v[2]);
  return n > r ? v.map((x) => (x * r) / n) : v;
};
/** The move each beat belongs to (for the two corrections that name a move). */
const MOVE_OF = new WeakMap();
for (const [n, def] of Object.entries(MOVES)) for (const raw of def.beats ?? []) for (const b of alts(raw)) MOVE_OF.set(b, n);
/** One key of a beat in the reference's poses. */
function refKey(u, k, b, name) {
  const o = { ...k };
  const flight = Math.abs(k.pitch ?? 0) > 1 || Math.abs(k.roll ?? 0) > 1 || !!b.leap;
  const hit = u >= 1 - 1e-6;
  if (!flight) {
    if (hit) {
      if (k.bY != null) o.bY = sinkTo(k.bY, REF.sink);
      if (k.pitch != null) o.pitch = k.pitch + REF.lean;
    } else if (u > 0.3 && k.bY != null) o.bY = sinkTo(k.bY, REF.load);
    if (Array.isArray(k.rF)) o.rF = widen(k.rF, -1);
    if (Array.isArray(k.lF)) o.lF = widen(k.lF, 1);
  }
  // the free fist out behind in opposition (a one-handed cut with the main blade, the off hand free)
  if (hit && Array.isArray(k.lH) && !((k.two ?? 0) > 0.5) && !(k.larm > 0) && !b.left && !voidBeat(b) && !Array.isArray(k.lsw)) {
    o.lH = clampReach([k.lH[0] + REF.fist[0], k.lH[1] + REF.fist[1], k.lH[2] + REF.fist[2]]);
  }
  if (name === 'vigilFall' && hit && Array.isArray(k.sw) && u > 1.3) {
    // 13 H2: the strike carried down to the floor, the weight forward, low
    // (the body goes down to the floor with it, not the wrist: the blade's own path is kept, so the sword
    // stays in line with the forearm)
    o.bY = Math.min(o.bY ?? -0.3, -0.48);
  }
  if (name === 'starfall' && hit) {
    // 13 H3: he lands with the staff upright before him, its lower end driven into the floor
    // (pointed a little ahead of his feet: a blade aimed down through the legs is swung out of them by the animator)
    Object.assign(o, { two: 1, sw: [0.0, -1.12], rH: [0.1, -0.04, 0.46], rP: [-0.8, -0.2, -0.1], bY: -0.42, pitch: 0.22, hdX: 0.1 });
  }
  return o;
}
const REF_KEYS = new WeakMap(); // beat -> (keys -> the reference's keys)
function refKeysOf(b, keys) {
  if (!Array.isArray(keys)) return keys;
  let M = REF_KEYS.get(b);
  if (!M) REF_KEYS.set(b, (M = new WeakMap()));
  let r = M.get(keys);
  if (!r) {
    const name = MOVE_OF.get(b);
    r = keys.map(([u, k]) => [u, refKey(u, k, b, name)]);
    M.set(keys, r);
  }
  return r;
}
const REF_RECOVERY = new WeakMap();
function refRecoveryOf(R) {
  if (!Array.isArray(R)) return R;
  let r = REF_RECOVERY.get(R);
  if (!r) REF_RECOVERY.set(R, (r = R.map(([t, k]) => [t, k.bY != null && !(Math.abs(k.pitch ?? 0) > 1) ? { ...k, bY: sinkTo(k.bY, REF.load) } : k])));
  return r;
}
/** The reaction clips in the reference's poses: the recoils bigger, the carried steps leaning further. */
const BIG = new Set(['flinch', 'stagger', 'recoil', 'reeling', 'trampled']);
function refClipKey(name, k) {
  if (BIG.has(name)) {
    const o = { ...k };
    if (k.pitch != null) o.pitch = k.pitch * 1.3;
    if (k.bZ != null) o.bZ = k.bZ * 1.35;
    if (k.spX != null) o.spX = k.spX * 1.3;
    if (k.bY != null) o.bY = sinkTo(k.bY, 0.04);
    return o;
  }
  if (name === 'backstep' && k.pitch != null) return { ...k, pitch: k.pitch * 1.35 };
  if (name === 'sidestep' && k.roll != null) return { ...k, roll: k.roll * 1.4 };
  return k;
}
export const CLIPS_BY_FORM_REF = FORM_POSES_REF.map((K) => compileClips(K, refClipKey));
/** The reaction clips of a form (1-based), the reference's while `?lordRefMove` is on. */
export const clipsOf = (form) => {
  const S = refMove() ? CLIPS_BY_FORM_REF : CLIPS_BY_FORM;
  return S[Math.min(S.length, Math.max(1, form | 0)) - 1];
};
/** (form 1's set: the kit's default) */
export const CLIP = CLIPS_BY_FORM[0];

// ---------------------------------------------------------------- realising a move
/** A beat's keys this time: ADR-226's held tell poses (`?lordMotion`) and ADR-251's form (`?lordForm`),
 *  either or both; null = the beat's own keys. */
const keysNow = (b) => {
  const m = motionOn();
  if (formOn()) return (m ? (b.formMotionKeys ?? b.formKeys ?? b.motionKeys) : b.formKeys) ?? null;
  return m ? (b.motionKeys ?? null) : null;
};
// (ADR-251, `?lordPace=a`: the readable pace, pace.js: each form's extra hold per beat, and the cue's lead)
export const PACE = buildPace(MOVES, TUNING);
const recoveryNow = (def) => (formOn() && def.formRecovery ? def.formRecovery : motionOn() ? (def.motionRecovery ?? null) : null);
const makeRealisers = (SETS, ref) => SETS.map((K, i) => makeRealise({
  TUNING, MOVES, compileClip: (keys, dur) => K.compileClip(keys, dur), completeBeat: K.completeBeat,
  keysOf: (b) => {
    let k = keysNow(b);
    // (ADR-277: the reference's poses over the keys the shipped switches chose; the same key times)
    if (ref) k = refKeysOf(b, k ?? b.keys);
    if (!paceOn()) return k;
    const hold = PACE[i].get(b) ?? 0;
    return hold > 0 ? { keys: k ?? b.keys, hold } : k;
  },
  recoveryKeysOf: (def) => {
    const R = recoveryNow(def);
    return ref ? (refRecoveryOf(R ?? def.recoveryKeys) ?? null) : R;
  },
}));
const REALISERS = makeRealisers(FORM_POSES, false);
const REALISERS_REF = makeRealisers(FORM_POSES_REF, true);
/**
 * A move as it will play this time (duelist/realise.js), compiled round the stance of the form it is
 * used in; a form's ignition is compiled round the NEW form's stance, so it ends in that guard.
 * `opts.count`: his flurry of that many blows (duelist/realise.js; until the second pass this wrapper
 * dropped it and every flurry was the authored four).
 */
export function realise(name, phase = 1, rnd = Math.random, opts = null) {
  const def = MOVES[name];
  if (!def) return null;
  const form = def.transition ? def.phase : phase;
  const RS = refMove() ? REALISERS_REF : REALISERS;
  const A = RS[Math.min(RS.length, Math.max(1, form)) - 1](name, phase, rnd, opts);
  if (A && paceOn()) paceCue(A, TUNING);
  return A;
}
