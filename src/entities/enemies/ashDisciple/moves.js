import { TELL } from '../../../combat/rules.js';
import { DIM } from '../../player/model.js';
import { compileClip, completeBeat, GUARD } from './poses.js';
import { TUNING } from './tuning.js';
import { makeRealise } from '../duelist/realise.js';
import { GUARD_CLIPS } from '../duelist/guard.js';
import { lookOf } from '../duelist/lookSwitch.js';
import { motionize } from '../duelist/tellPose.js';

// The Ash Disciple's moves and reaction clips, as data (docs/specs/ash-disciple.md §3; COMBAT.md →
// "The Ash Disciple"). Nothing mirrors the hero's moveset.
//
// A MOVE: { label, phase (first phase it is used in), weight [P1, P2] (0 = never picked by the AI),
//   cooldown, band [min, max] (m to the hero for the AI to pick it), counter (only as a counter from
//   his guard), recovery, recoveryKeys [[r 0..1, pose]], beats: [...] }
// A BEAT (one hit, or a feint): {
//   tell N|B|R|K (none on a feint; K = black: a charged blow, ADR-118), flare (on a B beat: a parry
//   MOMENT: the blue flare cues it and a parry of it is answered by the hero's counter and ends the
//   move; R and K always flare), feint (no tell, no glint, no hit), windup, hold [min, max] (a random
//   extra pause at `cock` (0..1 of the windup, default 0.8) that baits an early parry), active,
//   chance (< 1: rolled when the move starts), damage, knockback, knockdown,
//   zone { kind: 'sector' (r, ang) | 'line' (r, w) | 'ring' (r) } (tested through the active frames:
//   one hit per beat), ring (red ground warning radius), part ('tip' | 'feet': where the glint pops),
//   track (windup fraction he keeps turning toward the hero until; default 0.75),
//   close (m: how far he may step in toward the hero during the windup so the zone reaches him at the
//   impact; default TUNING.close: the move's first hit / later hits; 0 = none: dashes, leaps, the qi),
//   travel [[u, metres], ...] (forward root motion), dash { from, to, stop, max } (toward the hero's
//   spot as the dash starts), lift [[u, metres], ...] (root height: the leap),
//   release { count [P1, P2], spread, speed } (Ash Crescent: sword qi thrown at u = 1),
//   cast { kind, selfCue } (a thing sent out at u = 1 that cues itself: a kicked piece, a toll's ring),
//   go / spring (a move of the courtyard: see "the courtyard" below),
//   keys [[u, pose], ...] (u 0..1 = the windup, 1 = the impact, 1..2 = the active frames; a pose is a
//   poses.js clip key without its `t`) }
// Rules (COMBAT.md, checked by tests/integration/duel.mjs): a tell on every real hit, a move's first
// real windup >= TUNING.minFirstWindup in every phase, impacts >= TUNING.minHitGap apart, feints
// never flash.

const N = TELL.NORMAL, B = TELL.BLUE, R = TELL.RED, K = TELL.BLACK;
const TAU = Math.PI * 2;
const ANK = DIM.ankle;

// ---------------------------------------------------------------- pose fragments
// (body-space hand offsets / blade [az, el]; feet model space [x, z]; see poses.js)
// The stance is the classic jian guard (poses.js GUARD: yaw 0.62, the blade at az -0.52: straight at
// the opponent). Body-space azimuth = world azimuth (0 = at the opponent) − the body's yaw.
const SET = { rF: [-0.12, 0.36], lF: [0.2, -0.3] }; // the guard's feet
const STEP_IN = { rF: [-0.12, 0.64], lF: [0.22, -0.4], rK: [-0.25, 0, 1], lK: [0.6, -0.2, 0.8], lFy: 0.95 }; // the front foot steps in
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
const W2B = (wAz, yaw) => wAz - yaw; // a world-relative blade azimuth → body space at that yaw

/** Thrust beat keys: the blade drawn back along the body at the cock, driven home at the impact
 *  on a long lunge, held through the active frames, then a beat of follow-through. */
const thrustKeys = (k = 1, cock = 0.74) => withForm(thrustKeys0(k, cock), thrustKeys0(k, cock));
const thrustKeys0 = (k = 1, cock = 0.74) => [
  [cock * 0.5, { gather: true, ...COIL, bY: -0.18 * k, rH: [-0.04, -0.18, 0.12] }],
  [cock, { ...COIL, rH: [-0.08 * k, -0.24, -0.02], bY: -0.24 * k }],
  [1.0, { ...LUNGE, e: 'i', bZ: 0.16, rH: [0.04, -0.05, 0.49] }],
  [1.6, { ...LUNGE, e: 'o', bZ: 0.27, rH: [0.05, -0.03, 0.58] }],
  [2.0, { settle: true, ...LUNGE, bZ: 0.2 }],
];

// The free hand through a cut: before the chest at the cock (the elbow down), swept back low as a
// counterweight in the strike. (It stood straight out at shoulder height: a scarecrow's arm.)
/**
 * A cut, as the blade's path (poses.js `arm`: the hand follows the steel). World-relative blade
 * directions [az, el] (az 0 = at the opponent, + = his left): `from` where it is cocked (at `cock` of
 * the windup: the bait hold sits there), `through` at the impact (it meets the opponent), `to` the
 * follow-through it whips on to. `yaw` = the body's turn at the three points (the hips lead the cut).
 * The strike itself (cock → impact) is the fast part: an ease-in snap through ~30 % of the windup.
 */
// (the form pass, ADR-250: each helper below pairs its keys with the form's through FORM; a beat's
// `formKeys` is made from them after the table is built, played while `?ashForm` is on)
const FORM = new WeakMap();
const withForm = (keys, alt) => (FORM.set(keys, alt), keys);
/** The free hand through a cut: gathered (the gather), cocked, at the strike, the follow-through, settled. */
const FREE_0 = { gather: [0.04, -0.1, 0.32], cock: [0.0, -0.13, 0.32], strike: [0.26, -0.1, -0.16], follow: [0.3, -0.04, -0.22], settle: [0.28, -0.06, -0.18] };
// (the form: gathered by the sternum, split to his left in opposition as the steel goes out: half the
// travel, so a string of cuts no longer pumps the arm back and forth through every blow)
const FREE_F = { gather: [0.06, -0.08, 0.24], cock: [0.05, -0.1, 0.26], strike: [0.22, -0.06, -0.02], follow: [0.26, -0.03, -0.08], settle: [0.24, -0.05, -0.06] };
function slashKeys(o) {
  return withForm(slashKeys0(o, FREE_0), slashKeys0(o, FREE_F));
}
function slashKeys0({ from, through, to, yaw: [y0, y1, y2], cock = 0.7, sink = 0, extra = {} }, FH = FREE_0) {
  const dir = Math.sign(to[0] - from[0]) || 0; // the swing's turn: + toward his left
  const sw = (w, y) => [W2B(w[0], y), w[1]];
  const gy = (y0 + 0.62) / 2;
  return [
    // gathering: the blade begins its draw toward the cock, the weight settles back
    [cock * 0.45, { gather: true, arm: 0.7, ext: 0.6, lead: 0.05 * dir, yaw: gy, sw: sw([from[0] * 0.55, from[1] * 0.55 + 0.08], gy), bY: -0.2 - sink * 0.5, bZ: -0.03, lH: FH.gather, lP: [0.6, -0.7, 0.1], ...SET }],
    // cocked: wound up on the back foot, the free hand reaching forward for balance
    [cock, { arm: 1, ext: 0.5, lead: 0.22 * dir, yaw: y0, sw: sw(from, y0), bY: -0.24 - sink, bZ: -0.06, pitch: 0.08, hip: 0.1 * dir, lH: FH.cock, lP: [0.6, -0.8, 0.1], ...SET, ...extra.cocked }],
    // the strike: the fist arrives first, the steel snaps through the opponent on a step in
    [1.0, { e: 'i', arm: 1, ext: 1, lead: 0, yaw: y1, sw: sw(through, y1), bY: -0.28 - sink, bZ: 0.1, pitch: 0.1, hip: -0.06 * dir, lH: FH.strike, lP: [0.8, -0.4, -0.5], ...STEP_IN, ...extra.strike }],
    // follow-through: the blade whips past the fist and on round
    [1.6, { e: 'o', arm: 1, ext: 0.88, lead: -0.32 * dir, yaw: y2, sw: sw(to, y2), bY: -0.24 - sink, bZ: 0.08, pitch: 0.04, hip: -0.12 * dir, lH: FH.follow, ...STEP_IN, ...extra.follow }],
    [2.0, { settle: true, arm: 1, ext: 0.84, lead: -0.26 * dir, yaw: y2, sw: sw([to[0] * 0.94, to[1] * 0.9], y2), bY: -0.22 - sink, bZ: 0.06, lH: FH.settle, ...STEP_IN }],
  ];
}

/** The cuts long strings are made of (world-relative blade paths, see slashKeys). */
const CUTS = {
  rise: { from: [-2.0, -0.62], through: [0.0, 0.05], to: [1.55, 0.95], yaw: [0.1, 0.5, 0.85], zone: { kind: 'sector', r: 2.15, ang: 0.95 } }, // low right → high left
  back: { from: [1.55, 0.8], through: [0.0, -0.02], to: [-1.75, -0.5], yaw: [0.95, 0.55, 0.12], zone: { kind: 'sector', r: 2.15, ang: 0.95 } }, // high left → low right
  flat: { from: [-1.95, 0.1], through: [0.0, 0.04], to: [1.75, 0.06], yaw: [0.05, 0.5, 0.95], zone: { kind: 'sector', r: 2.2, ang: 1.0 } }, // level, right → left
  flatBack: { from: [1.85, 0.14], through: [0.0, 0.04], to: [-1.8, 0.02], yaw: [1.0, 0.55, 0.1], zone: { kind: 'sector', r: 2.2, ang: 1.0 } }, // level, left → right
  diag: { from: [-1.2, 1.1], through: [0.0, 0.15], to: [1.4, -0.75], yaw: [0.25, 0.55, 0.9], zone: { kind: 'sector', r: 2.15, ang: 0.85 } }, // high right → low left
};
/** The overhead: raised two-handed, then a stepping chop (keyed hands: both on the grip). */
const OVERS = new WeakSet(); // (the form's overheads: their held tell pose is widened, below)
const overKeys = (cock = 0.7) => {
  const f = slashKeys0({ ...OVER_F, cock }, FREE_F);
  OVERS.add(f);
  return withForm(overKeys0(cock), f);
};
/** (the form, ADR-250) the overhead as a ONE-handed diagonal (the jian is a one-handed sword): from high over
 *  his sword shoulder, the point to the sky, down through the opponent to low at his left hip, the free
 *  hand drawn back in opposition. A straight-down chop drew one upright bar at the game camera, and the
 *  free hand flew 0.5 m onto the hilt in the 0.1 s strike (17 - 19 m/s, the fastest thing he did). */
const OVER_F = { from: [-1.05, 1.18], through: [0.15, -0.26], to: [1.1, -0.88], yaw: [0.3, 0.25, 0.6], sink: 0.08 };
const overKeys0 = (cock = 0.7) => [
  [cock * 0.5, { gather: true, ...RAISED, rH: [0.1, 0.3, 0.14], sw: [-0.2, 1.5], bY: -0.1, ...SET }],
  [cock, { ...RAISED, sw: [-0.2, 2.05], rF: [-0.12, 0.42], lF: [0.2, -0.28] }],
  [1.0, { ...CHOP, e: 'i' }],
  [1.6, { ...CHOP, e: 'o', bY: -0.4, pitch: 0.3, sw: [-0.12, -0.8], rH: [0.1, -0.36, 0.42] }],
  [2.0, { settle: true, ...CHOP, bY: -0.34 }],
];

/** One beat of a long string: `kind` a CUTS entry, 'over' or 'thrust'; `extra` overrides any field. */
function cut(kind, tell, windup, damage, extra = {}) {
  if (kind === 'thrust') {
    return {
      tell, windup, active: 0.1, damage, knockback: tell === N ? 0.7 : 1.5, zone: { kind: 'line', r: 2.0, w: 0.7 },
      dash: { from: 0.7, to: 1.0, stop: 1.0, max: 2.2 }, keys: thrustKeys(1, extra.cock ?? 0.74), ...extra,
    };
  }
  if (kind === 'over') {
    return {
      tell, windup, active: 0.1, damage, knockback: 1.6, zone: { kind: 'sector', r: 2.3, ang: 0.5 },
      keys: overKeys(extra.cock ?? 0.7), ...extra,
    };
  }
  const K = CUTS[kind];
  return {
    tell, windup, active: 0.08, damage, knockback: tell === N ? 0.7 : 1.5, zone: K.zone,
    keys: slashKeys({ ...K, cock: extra.cock ?? 0.7 }), ...extra,
  };
}

const rotXZ = (x, z, a) => [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
/** Both feet carried `ph` rad round with the body (a turn on the spot), `y` m off the floor. */
const spinFeet = (ph, y = ANK) => {
  const r = rotXZ(-0.12, 0.36, ph), l = rotXZ(0.2, -0.3, ph);
  return { rF: [r[0], y, r[1]], lF: [l[0], y, l[1]], rFy: -0.25 + ph, lFy: 0.9 + ph };
};
/** A spin cut: wound up, then a full turn with the blade out level at his sword side (a ring). */
const spinKeys = (cock = 0.66, low = false) => (low ? withForm(spinKeys0(cock, true), sweepKeysF(cock)) : spinKeys0(cock, false));
const spinKeys0 = (cock = 0.66, low = false) => {
  const B = low ? { ...CROUCH } : { bY: -0.22 };
  const out = { arm: 1, ext: 1, lead: 0, sw: low ? [-1.45, -0.44] : [-1.45, -0.04], lH: [0.3, low ? -0.12 : 0.04, 0.08], lP: [0.9, 0.1, -0.2] };
  const wound = { ...B, arm: 1, ext: 0.55, lead: -0.2, yaw: 1.2, sw: low ? [-2.1, -0.5] : [-2.15, -0.12], lH: [0.12, -0.08, 0.28], hdY: -1.0 };
  if (low) {
    // the low sweep: he drops and the blade goes round at the ankles; the feet stay under him
    return [
      [cock, { ...wound }],
      [1.0, { ...B, ...out, e: 'i', yaw: 0.9, hdY: -0.6 }],
      [2.0, { ...B, ...out, e: 'l', yaw: 0.9 - TAU, hdY: -0.6 }],
      [2.001, { e: 'h', yaw: 0.9 }],
    ];
  }
  // the whirl: wound up on bent legs, then a hop that carries the whole body round once (the feet
  // go round with him: a full turn of the hips over planted feet wound the legs round each other)
  const turn = (u, k, hop) => [u, { e: 'l', yaw: 0.9 - TAU * k, bY: -0.22 + 0.1 * hop, roll: -0.1 * hop, ...spinFeet(-TAU * k, ANK + 0.16 * hop), flat: 0.95 - 0.6 * hop }];
  return [
    [cock, { ...wound, bY: -0.3, ...spinFeet(0.3) }],
    [1.0, { ...B, ...out, e: 'i', yaw: 0.9, hdY: -0.6, roll: 0, ...spinFeet(0), flat: 0.95 }],
    turn(1.25, 0.25, 1),
    turn(1.5, 0.5, 1),
    turn(1.75, 0.75, 0.7),
    [2.0, { ...B, ...out, e: 'l', yaw: 0.9 - TAU, hdY: -0.6, roll: 0, ...spinFeet(-TAU), flat: 0.95 }],
    [2.001, { e: 'h', yaw: 0.9, ...spinFeet(0) }],
  ];
};

/** The perilous thrust (red, a mikiri can answer it): a deep coil, the blade drawn back low along his
 *  side, held a beat, then a long lunge. */
const PERIL_COIL = { ...COIL, bY: -0.34, bZ: -0.14, yaw: 0.95, rH: [-0.12, -0.32, -0.08], sw: [-1.0, -0.08], lH: [0.28, 0.06, 0.1], lP: [0.9, 0.2, -0.2], hdY: -0.8, rF: [-0.12, 0.34], lF: [0.2, -0.38] };
const PERIL_LUNGE = { ...LUNGE, bZ: 0.3, bY: -0.34, rF: [-0.08, 1.05], lF: [0.22, -0.68], lH: [0.2, 0.08, -0.44] };
const perilKeys = () => [[0.4, { gather: true, ...PERIL_COIL }], [0.84, { ...PERIL_COIL, bY: -0.36, rH: [-0.14, -0.33, -0.1] }], [1.0, { ...PERIL_LUNGE, e: 'i' }], [1.6, { ...PERIL_LUNGE, e: 'o', bZ: 0.34 }], [2.0, { ...PERIL_LUNGE }]];

// ---------------------------------------------------------------- the form pass (ADR-250): fragments
// What the audit found at the impacts (tests/integration/swordAudit.mjs, GCD_AUDIT_IMPACT): a thrust
// landed on a bent arm (135 - 150°) with the point 21 - 26° off the line of the arm, and the long lunges
// on two locked knees (176 / 176°: the feet set wider than his legs reach); the overheads cut straight
// down (the point's path 75 - 81° off level: one upright bar at the game camera); the low sweeps turned
// his hips a full circle over feet that stayed put (the legs wound round each other, the knee popped);
// the front foot was still in the air at most impacts (the foot planner steps only once the key has
// drifted 14 cm, then takes ~0.1 s). Played instead of the beats' own keys while `?ashForm` is on.
const LIFT = ANK + 0.08; // a foot in its step, off the stones (the planner leaves a foot this high to the clip)
/** The sword hand on the blade's own line out of the shoulder: [az, el] in body space, `r` m out. */
const reachLine = (az, el, r) => [Math.sin(az) * Math.cos(el) * r, Math.sin(el) * r - 0.02, Math.cos(az) * Math.cos(el) * r];
/** A lunge's feet round the hips at `bZ`: the front shin upright over its foot (the knee ~110°), the back
 *  leg long behind (~165°), as far as his legs reach at a lunge's depth. */
const lungeFeet = (bZ, front = 0.42, back = 0.62) => ({ rF: [-0.1, bZ + front], lF: [0.2, bZ - back], rK: [-0.15, 0, 1], lK: [0.35, -0.3, 0.9] });
/** The lunge (a thrust's strike): hips sunk, the arm long and the point on its line, the free hand back. */
const lungeF = (k, u, deep = false) => {
  const bZ = k.bZ ?? GUARD.bZ, sw = k.sw ?? LUNGE.sw;
  return {
    bY: Math.min(k.bY ?? -0.3, deep ? -0.4 : -0.34),
    rH: reachLine(sw[0], sw[1], u < 1.3 ? 0.6 : 0.62), rP: [-0.75, -0.25, -0.3], // (past full reach: TUNING.formMotion.armSoft opens the arm to ~160°)
    ...lungeFeet(Math.min(bZ, 0.24), deep ? 0.48 : 0.44, deep ? 0.8 : 0.74),
    lH: [0.24, 0.08, -0.3], lP: [0.7, -0.2, -0.6],
  };
};
/** The low sweep: the same crouch, but the feet go round with him (the right leg sweeps the stones, the
 *  left turns on its ball), each just off the floor so the clip carries them. */
const sweepFeet = (ph) => {
  const r = rotXZ(-0.46, 0.22, ph), l = rotXZ(0.12, -0.04, ph);
  return { rF: [r[0], ANK + 0.04, r[1]], lF: [l[0], ANK + 0.04, l[1]], rFy: -0.7 + ph, lFy: 0.9 + ph };
};
const sweepKeysF = (cock = 0.62) => {
  const k = spinKeys0(cock, true);
  const B = { ...CROUCH };
  const at = (u, ph) => [u, { e: 'l', yaw: 0.9 + ph, ...sweepFeet(ph) }];
  return [
    k[0],
    [1.0, { ...k[1][1], ...sweepFeet(0) }],
    at(1.25, -TAU * 0.25),
    at(1.5, -TAU * 0.5),
    at(1.75, -TAU * 0.75),
    [2.0, { ...k[2][1], ...B, yaw: 0.9 - TAU, ...sweepFeet(-TAU) }],
    [2.001, { e: 'h', yaw: 0.9, ...sweepFeet(0), rF: [-0.46, 0.22], lF: [0.12, -0.04] }],
  ];
};
/** The two-handed chop (the leaps' and the Fall's) as a diagonal: raised over his sword shoulder, it comes
 *  down through the opponent to low at his left (world [az, el] through a body yaw). */
const RAISED2_F = { yaw: 0.1, sw: [W2B(-1.1, 0.1), 1.15], rH: [-0.1, 0.34, 0.08] };
const CHOP2_F = { yaw: 0.3, sw: [W2B(0.15, 0.3), -0.3], rH: [0.0, -0.2, 0.44], pitch: 0.18, spX: 0.12, hdX: -0.1 };
const CHOP2_FOLLOW = { yaw: 0.55, sw: [W2B(1.0, 0.55), -0.85], rH: [0.12, -0.34, 0.34] };

// ---- the second pass's beats (strings that move: a kick, a glide, a leap, a spin that travels, the
// qi as a string's last word). Composed from the fragments above; the kick's poses are the Flying
// Lantern's (KICK_COIL / KICK_OUT below: read when MOVES is built).
/** A glide in: low and fast toward the hero, a level cut across at the end (Wind Step's).
 *  `back`: the cut comes from his left instead (Severing Wind's path). */
const GLIDE_R = { from: [-2.2, -0.3], through: [0.0, 0.02], to: [1.6, 0.1], yaw: [0.4, 0.4, 0.9], cock: 0.8, sink: 0.08, extra: { cocked: { pitch: 0.2, bY: -0.32 } } };
const GLIDE_L = { from: [1.95, 0.2], through: [0.0, 0.04], to: [-1.8, -0.1], yaw: [1.0, 0.55, 0.1], cock: 0.8, sink: 0.08, extra: { cocked: { pitch: 0.18, bY: -0.3 } } };
function glide(tell, windup, damage, max, extra = {}) {
  const { back, ...rest } = extra;
  return {
    tell, windup, active: 0.1, damage, knockback: 1.0, zone: { kind: 'sector', r: 2.2, ang: 1.0 },
    dash: { from: 0.3, to: 0.95, stop: 1.2, max }, close: 0, track: 0.5, keys: slashKeys(back ? GLIDE_L : GLIDE_R), ...rest,
  };
}
/** A kick inside a string (white: a shove that throws the hero back a step; the next beat re-closes).
 *  The foot strikes, not the blade: no sweep trail, the glint at his feet. */
function kick(tell, windup, damage, extra = {}) {
  return {
    tell, windup, active: 0.1, damage, knockback: 2.4, zone: { kind: 'sector', r: 1.9, ang: 0.7 }, part: 'feet', noSweep: true, track: 0.7,
    keys: [
      [0.5, { gather: true, ...KICK_COIL, bY: -0.24, rF: [-0.1, 0.2, 0.06] }],
      [0.8, { ...KICK_COIL }],
      [1.0, { ...KICK_OUT, e: 'i' }],
      [1.6, { ...KICK_OUT, e: 'o', bZ: -0.14, rF: [-0.04, 0.8, 0.98] }],
      [2.0, { ...KICK_OUT, pitch: -0.12, rF: [-0.08, 0.3, 0.6] }],
    ],
    ...extra,
  };
}
/** A leaping one-handed cut from high on his right (Falling Star's), covering `max` m on the way in. */
function leapCut(tell, windup, damage, max, lift = 0.6, extra = {}) {
  return {
    tell, windup, active: 0.1, damage, knockback: tell === N ? 0.9 : 1.6, zone: { kind: 'sector', r: 2.3, ang: 0.6 },
    dash: { from: 0.35, to: 0.97, stop: 1.2, max }, close: 0, lift: [[0.35, 0], [0.74, lift], [1.0, 0]], track: 0.6,
    keys: slashKeys({ from: [-0.7, 1.45], through: [0.0, -0.1], to: [0.5, -1.0], yaw: [0.2, 0.45, 0.6], cock: 0.72, sink: 0.04 }),
    ...extra,
  };
}
/** A spin cut (a ring) that carries him `go` m on toward the hero as he turns. */
function spin(tell, windup, damage, go = 0, extra = {}) {
  const low = !!extra.low;
  const { low: _l, ...rest } = extra;
  return {
    tell, windup, active: low ? 0.22 : 0.18, damage, knockback: low ? 2.5 : 0.9, zone: { kind: 'ring', r: low ? 3.0 : 2.2 }, track: 0.6,
    ...(go ? { travel: [[0.62, 0], [1.0, go * 0.55], [2.0, go]], close: 0.6 } : {}),
    ...(low ? { knockdown: true, ring: 3.0, part: 'feet' } : {}),
    keys: spinKeys(0.62, low), ...rest,
  };
}
/** Sword qi from a downward cut (Ash Crescent's): `count` crescents (per phase), `spread` rad apart. */
function qi(tell, windup, damage, count, spread = 0.36, extra = {}) {
  const { speed, ...rest } = extra;
  return {
    tell, windup, active: 0.1, damage, knockback: tell === N ? 0.8 : 1.4, release: { count, spread, ...(speed ? { speed } : {}) }, close: 0, track: 0.85,
    keys: slashKeys({ from: [-1.2, 1.2], through: [0.0, -0.3], to: [1.0, -0.8], yaw: [0.3, 0.5, 0.8], cock: 0.7 }),
    ...rest,
  };
}
/** A feint that starts a high cut from his right and stops at the cock (no tell, no glint, no hit):
 *  the real blow comes from the other side. */
function feintHigh(windup = 0.42) {
  const k = slashKeys({ ...CUTS.diag, cock: 0.7 });
  return {
    feint: true, windup, active: 0.1, close: 0.8,
    keys: [[0.5, { ...k[0][1], gather: false }], [0.85, k[1][1]], [1.0, { ...k[1][1], e: 'i', bY: -0.2, yaw: 0.35 }], [2.0, { ...k[0][1], gather: false, yaw: 0.9 }]],
  };
}
// burning ground (phase 2 on: moveFx.js, TUNING.burn): a beat's `burn` leaves a line of fire where it
// cut. kind 'across' (a level cut: across his front, `at` m out), 'along' (a vertical cut or a thrust:
// from `from` m out, `len` long), 'path' (a dash: the way he came), 'ring' (round where he lands:
// `arcs` arcs at `r` m with gaps between them). `len` m, `w` m wide, `life` s (TUNING.burn defaults).
const BURN_ACROSS = Object.freeze({ kind: 'across', at: 1.5, len: 3.4 });
const BURN_ALONG = Object.freeze({ kind: 'along', from: 0.5, len: 3.4 });
const BURN_PATH = Object.freeze({ kind: 'path' });

// ---- the courtyard's moves (ADR-111)
/** The kick: the weight back on the left leg, the right knee drawn up; then the leg driven out flat. */
const KICK_COIL = {
  bY: -0.3, pitch: -0.04, yaw: 0.25, hip: 0.1, spX: -0.04, hdY: -0.2,
  rH: [-0.26, -0.2, -0.1], rP: [-0.8, -0.4, -0.4], sw: [-1.9, -0.3], swF: [0, 1, 0], lH: [0.24, 0.0, 0.3], lP: [0.8, -0.2, 0.3],
  rF: [-0.1, 0.44, 0.14], lF: [0.16, -0.12], rK: [-0.1, 0.4, 1], lK: [0.4, 0, 0.9], flat: 0.5,
};
const KICK_OUT = {
  bY: -0.2, bZ: -0.1, pitch: -0.28, yaw: 0.1, hip: -0.1, spX: -0.1, hdX: 0.1, hdY: -0.1,
  rH: [-0.3, -0.15, -0.2], rP: [-0.8, -0.4, -0.4], sw: [-2.2, -0.2], swF: [0, 1, 0], lH: [0.3, 0.05, 0.1], lP: [0.8, -0.2, 0.3],
  rF: [-0.04, 0.74, 0.95], lF: [0.14, -0.2], rK: [0, 0.3, 1], lK: [0.4, 0, 0.9], rFy: 0, flat: 0.3,
};
/** A blow on the bell: a level cut that stops on the bronze and springs back off it. */
const tollKeys = (from, cock) => slashKeys({ from, through: [0.0, -0.05], to: [from[0] > 0 ? -0.45 : 0.45, 0.3], yaw: from[0] < 0 ? [0.1, 0.5, 0.62] : [0.95, 0.55, 0.45], cock, sink: 0.06 });
/** The leap to the pillar (knees drawn up, the blade trailing) and the beat on it (coiled against the stone). */
const TUCK = {
  bY: -0.1, pitch: 0.3, yaw: 0.1, spX: 0.2, hdX: 0.1, hdY: 0,
  rH: [-0.2, -0.3, -0.1], rP: [-0.8, -0.4, -0.4], sw: [-2.4, -0.3], swF: [0, 1, 0], lH: [0.25, -0.1, 0.25],
  rF: [-0.12, 0.34, 0.1], lF: [0.16, 0.28, -0.14], rK: [-0.2, 0.3, 1], lK: [0.3, 0.3, 1], flat: 0.3,
};
const PERCH = {
  bY: -0.5, pitch: 0.5, yaw: 0.2, spX: 0.25, hdX: -0.25, hdY: -0.2,
  rH: [-0.1, -0.1, -0.15], rP: [-0.8, 0.2, -0.4], sw: [-0.8, 1.2], swF: [1, 0, 0], lH: [0.25, -0.2, 0.3],
  rF: [-0.14, 0.3], lF: [0.16, 0.1], rK: [-0.5, 0.2, 1], lK: [0.5, 0.2, 1], flat: 0.6,
};

// ---------------------------------------------------------------- the moves
// PBZ-fast (owner, 2026-11-12: "very fast, PBZ-boss level"): a move's first hit winds up ~0.46–0.6 s
// (red ~0.65), the hits of a string ~0.34 s apart; every strike is a ~0.1 s snap out of its cock.
// The flash (TUNING.flashLead 0.3 s) is the timing cue. Each beat steps in on its own during its
// windup (brain.js close-in, `close` m at most: the first hit 2.4, later ones 1.2), so a cut is never
// thrown at air; `travel` / `dash` add their own root motion on top.
export const MOVES = {
  /** Plum Blossom Thrust: a coiled, lunging thrust from mid range. */
  plumThrust: {
    label: 'Plum Thrust', phase: 1, weight: [1.4, 0.9, 0.3], cooldown: 2.5, band: [2.6, 6.8], recovery: 0.5,
    beats: [{
      tell: N, windup: 0.5, active: 0.1, damage: 18, knockback: 0.9, zone: { kind: 'line', r: 1.9, w: 0.7 },
      dash: { from: 0.7, to: 1.0, stop: 1.0, max: 4.8 }, close: 0, keys: thrustKeys(1, 0.72),
    }],
    recoveryKeys: [[0.45, { ...LUNGE, bY: -0.22, rH: [0.04, -0.1, 0.45], lH: [0.1, 0.12, -0.25] }]],
  },

  /** Falling Ash: the jian raised two-handed over the head, then a stepping overhead chop. */
  fallingAsh: {
    label: 'Falling Ash', phase: 1, weight: [1.2, 0.8, 0.3], cooldown: 3, band: [0, 3.8], recovery: 0.55,
    beats: [{
      tell: B, flare: true, windup: 0.6, active: 0.1, damage: 26, knockback: 1.6, zone: { kind: 'sector', r: 2.3, ang: 0.5 }, lock: true,
      keys: overKeys(0.72),
    }],
    recoveryKeys: [[0.5, { ...CHOP, two: 0.4, bY: -0.24, sw: [-0.3, -0.5], rH: [0.0, -0.32, 0.4] }]],
  },

  /** Falling Star: a leaping one-handed cut from high on his right, straight down through you. */
  fallingStar: {
    label: 'Falling Star', phase: 1, weight: [1.6, 1.0, 0.4], cooldown: 3, band: [0, 4.2], recovery: 0.5,
    beats: [{
      tell: B, flare: true, windup: 0.5, active: 0.1, damage: 24, knockback: 1.6, zone: { kind: 'sector', r: 2.3, ang: 0.6 }, lock: true,
      close: 2.8, lift: [[0.45, 0], [0.78, 0.32], [1.0, 0]],
      keys: slashKeys({ from: [-0.7, 1.45], through: [0.0, -0.1], to: [0.5, -1.0], yaw: [0.2, 0.45, 0.6], cock: 0.72, sink: 0.04 }),
    }],
    recoveryKeys: [[0.45, { arm: 1, ext: 0.8, sw: [-0.3, -0.7], bY: -0.26, ...STEP_IN }]],
  },

  /** Piercing Ash: a PERILOUS thrust (red). Dodge into it (mikiri) to step on the blade, or roll aside. */
  piercingAsh: {
    label: 'Piercing Ash', phase: 1, weight: [1.2, 1.0, 0.4], cooldown: 5, band: [3.0, 9], recovery: 0.6,
    beats: [{
      tell: R, windup: 0.68, active: 0.12, damage: 30, knockback: 2.5, zone: { kind: 'line', r: 2.1, w: 0.7 }, mikiri: true,
      dash: { from: 0.84, to: 1.0, stop: 0.8, max: 6.5 }, close: 0, track: 0.82, keys: perilKeys(),
    }],
    recoveryKeys: [[0.45, { ...PERIL_LUNGE, bY: -0.26, rH: [0.04, -0.1, 0.45] }]],
  },

  /** Rain of Ashes: a seven-hit string that changes rhythm (a held overhead), ending on a heavy
   *  thrust. Parry all seven and he reels. The overhead can be locked. */
  ashRain: {
    label: 'Rain of Ashes', phase: 1, weight: [2.4, 2.0, 1.6], cooldown: 7, band: [0, 3.6], recovery: 0.7,
    beats: [
      cut('rise', N, 0.46, 14),
      cut('back', N, 0.34, 13),
      cut('flat', N, 0.34, 13),
      cut('over', B, 0.4, 20, { hold: [0.1, 0.3], cock: 0.72, lock: true }),
      cut('diag', N, 0.36, 12),
      cut('flatBack', N, 0.34, 12),
      cut('thrust', B, 0.4, 20),
    ],
  },

  /** Swallow Flicks: a rising flick, a backhand flick, then a heavy thrust. */
  swallow: {
    label: 'Swallow Flicks', phase: 1, weight: [2.6, 2.0, 1.6], cooldown: 3.5, band: [0, 3.8], recovery: 0.6,
    beats: [
      cut('rise', N, 0.46, 14),
      cut('back', N, 0.34, 14),
      cut('thrust', B, 0.4, 20, { flare: true }),
    ],
  },

  /** Crane Spins: two spinning cuts, then a leaping two-handed chop. */
  crane: {
    label: 'Crane Spins', phase: 1, weight: [2.0, 1.6, 1.0], cooldown: 5, band: [0, 3.6], recovery: 0.65,
    beats: [
      { tell: N, windup: 0.5, active: 0.18, damage: 15, knockback: 0.9, zone: { kind: 'ring', r: 2.2 }, track: 0.7, keys: spinKeys(0.66) },
      { tell: N, windup: 0.36, active: 0.18, damage: 15, knockback: 0.9, zone: { kind: 'ring', r: 2.2 }, track: 0.6, keys: spinKeys(0.6) },
      {
        tell: B, flare: true, windup: 0.46, active: 0.1, damage: 24, knockback: 1.6, zone: { kind: 'sector', r: 2.4, ang: 0.55 }, lock: true,
        dash: { from: 0.45, to: 1.0, stop: 1.2, max: 3.0 }, close: 0, lift: [[0.42, 0], [0.75, 0.9], [1.0, 0]],
        keys: [
          [0.42, { two: 1, yaw: 0.2, bY: -0.34, rH: [0.1, -0.2, 0.3], sw: [0.0, 0.3], hdY: -0.1, rF: [-0.1, 0.28], lF: [0.16, -0.22] }],
          [0.75, { ...RAISED, yaw: 0.15, bY: 0.04, rF: [-0.1, 0.3], lF: [0.15, -0.1], rK: [-0.2, 0.2, 1], lK: [0.3, 0.2, 1] }],
          [1.0, { ...CHOP, e: 'i' }],
          [1.6, { ...CHOP, e: 'o', bY: -0.34, pitch: 0.38 }],
          [2.0, { ...CHOP }],
        ],
      },
    ],
    recoveryKeys: [[0.5, { ...CHOP, two: 0.3, bY: -0.24, sw: [-0.3, -0.45] }]],
  },

  /** Hesitating Blade: a feint (it never glints), a thrust held back a moment, maybe a flick after. */
  hesitate: {
    label: 'Hesitating Blade', phase: 1, weight: [1.0, 0.9, 0.15], cooldown: 5, band: [0, 4.6], recovery: 0.6,
    beats: [
      {
        feint: true, windup: 0.4, active: 0.1, close: 1.0,
        keys: [
          [0.6, { ...COIL }],
          [1.0, { ...COIL, e: 'i', rH: [0.02, -0.12, 0.32], sw: [-0.5, 0.04], bZ: 0.04, bY: -0.2 }],
          [2.0, { ...COIL, bZ: -0.08, bY: -0.22 }],
        ],
      },
      {
        tell: B, windup: 0.42, hold: [0.2, 0.6], cock: 0.75, active: 0.1, damage: 22, knockback: 1.5,
        zone: { kind: 'line', r: 2.0, w: 0.7 }, dash: { from: 0.78, to: 1.0, stop: 1.0, max: 2.8 }, close: 0, track: 0.75,
        keys: [
          [0.4, { ...COIL, rH: [-0.09, -0.27, -0.02], bY: -0.24, yaw: 0.9 }],
          [0.75, { ...COIL, rH: [-0.1, -0.27, -0.03], bY: -0.25, yaw: 0.92 }],
          [1.0, { ...LUNGE, e: 'i' }],
          [1.6, { ...LUNGE, e: 'o', bZ: 0.26 }],
          [2.0, { ...LUNGE }],
        ],
      },
      { ...cut('rise', N, 0.34, 14), chance: 0.5 },
    ],
  },

  /** Lotus Sweep: dropping low, he spins the jian round at the ankles. Red: roll through it. */
  lotus: {
    label: 'Lotus Sweep', phase: 1, weight: [1.0, 0.8, 0.3], cooldown: 6, band: [0, 3.4], recovery: 0.6,
    beats: [{
      tell: R, windup: 0.62, active: 0.22, damage: 22, knockback: 2.5, knockdown: true, zone: { kind: 'ring', r: 3.0 }, ring: 3.0, part: 'feet',
      track: 0.6, close: 1.2, keys: spinKeys(0.62, true),
    }],
    recoveryKeys: [[0.4, { ...CROUCH, bY: -0.36, yaw: 0.7, arm: 1, ext: 0.8, sw: [-0.9, -0.3] }]],
  },

  /** Wind Step: from far off he glides in low and cuts across. */
  windStep: {
    label: 'Wind Step', phase: 1, weight: [2.6, 2.2, 1.8], cooldown: 3, band: [4.6, 13], recovery: 0.5,
    beats: [{
      tell: N, windup: 0.56, active: 0.1, damage: 18, knockback: 1.0, zone: { kind: 'sector', r: 2.2, ang: 1.0 },
      dash: { from: 0.3, to: 0.95, stop: 1.2, max: 10.5 }, close: 0, track: 0.5,
      keys: slashKeys({ from: [-2.2, -0.3], through: [0.0, 0.02], to: [1.6, 0.1], yaw: [0.4, 0.4, 0.9], cock: 0.8, sink: 0.08, extra: { cocked: { pitch: 0.2, bY: -0.32 } } }),
    }],
  },

  /** Ash Crescent: a cut that throws sword qi along the ground (P2: a fan of three). */
  ashCrescent: {
    label: 'Ash Crescent', phase: 1, weight: [1.0, 0.8, 0.3], cooldown: 5, band: [6, 16], recovery: 0.5,
    beats: [{
      tell: N, windup: 0.5, active: 0.1, damage: 14, knockback: 0.8, release: { count: [1, 3], spread: 0.36 }, close: 0,
      keys: slashKeys({ from: [-1.2, 1.2], through: [0.0, -0.3], to: [1.0, -0.8], yaw: [0.3, 0.5, 0.8], cock: 0.7 }),
    }],
  },

  // ---------------------------------------------------------------- the moments (ADR-118)
  /** Severing Wind: from mid range he is on you in one long step with a level two-handed cut. A parry
   *  moment: the blue flare, and a parry of it is answered by the hero's counter. */
  severingWind: {
    label: 'Severing Wind', phase: 1, weight: [1.6, 1.0, 0.4], cooldown: 6, band: [3.6, 10], recovery: 0.6, gapCloser: true,
    beats: [{
      tell: B, flare: true, windup: 0.64, active: 0.1, damage: 26, knockback: 2.0, zone: { kind: 'sector', r: 2.3, ang: 0.95 }, lock: true,
      dash: { from: 0.5, to: 0.97, stop: 1.2, max: 8.5 }, close: 0, track: 0.55,
      keys: slashKeys({ from: [1.95, 0.2], through: [0.0, 0.04], to: [-1.8, -0.1], yaw: [1.0, 0.55, 0.1], cock: 0.76, sink: 0.1, extra: { cocked: { pitch: 0.16, bY: -0.3 } } }),
    }],
    recoveryKeys: [[0.45, { arm: 1, ext: 0.85, sw: [-1.3, -0.25], bY: -0.28, yaw: 0.2, ...STEP_IN }]],
  },

  /** Twin Embers: two blows no guard holds, one after the other: a dashing cut across, then the low
   *  sweep round him. Red, red: dodge, dodge (a perfect dodge of either is answered by the flurry). */
  twinEmbers: {
    label: 'Twin Embers', phase: 1, weight: [1.3, 1.5, 0.8], cooldown: 8, band: [2.4, 8], recovery: 0.65, gapCloser: true,
    beats: [
      {
        tell: R, windup: 0.66, active: 0.12, damage: 22, knockback: 2.2, zone: { kind: 'sector', r: 2.3, ang: 1.0 },
        dash: { from: 0.55, to: 0.98, stop: 1.1, max: 6.5 }, close: 0, track: 0.6,
        keys: slashKeys({ from: [-2.2, -0.3], through: [0.0, 0.02], to: [1.6, 0.1], yaw: [0.4, 0.4, 0.9], cock: 0.8, sink: 0.08, extra: { cocked: { pitch: 0.2, bY: -0.32 } } }),
      },
      {
        tell: R, windup: 0.7, active: 0.22, damage: 24, knockback: 2.6, knockdown: true, zone: { kind: 'ring', r: 3.0 }, ring: 3.0, part: 'feet',
        track: 0.6, close: 1.4, keys: spinKeys(0.62, true),
      },
    ],
    recoveryKeys: [[0.4, { ...CROUCH, bY: -0.36, yaw: 0.7, arm: 1, ext: 0.8, sw: [-0.9, -0.3] }]],
  },

  /** Black Tide: the CHARGED blow. He draws the jian back low at his side and darkness gathers on
   *  it (about a second and a half, and a held beat that is never the same), then one long dashing
   *  cleave. Black: dodge it. A guard or a parry in its way stops the blow but is knocked wide open,
   *  the whole guard meter gone. */
  blackTide: {
    label: 'Black Tide', phase: 1, weight: [1.1, 0.8, 0.6], cooldown: 12, band: [2.4, 9], recovery: 0.8, gapCloser: true,
    beats: [{
      tell: K, windup: 1.45, fixed: true, hold: [0.1, 0.5], cock: 0.86, active: 0.14, damage: 38, knockback: 4, knockdown: true,
      zone: { kind: 'sector', r: 2.8, ang: 1.05 }, dash: { from: 0.88, to: 1.0, stop: 1.2, max: 7.5 }, close: 0, track: 0.88,
      keys: slashKeys({ from: [-2.3, -0.34], through: [0.0, 0.0], to: [1.9, 0.3], yaw: [0.3, 0.45, 0.95], cock: 0.86, sink: 0.14, extra: { cocked: { two: 1, pitch: 0.22, bY: -0.38 }, strike: { two: 1 }, follow: { two: 1 } } }),
    }],
    recoveryKeys: [[0.5, { arm: 1, ext: 0.85, sw: [1.4, 0.1], bY: -0.3, yaw: 0.9, ...STEP_IN }]],
  },

  // ---------------------------------------------------------------- the second pass: phase 1, the fencer
  // Strings that MOVE (a glide, a leap, a kick, a spin that carries him), a feint into a blow from the
  // other side, a long string that re-closes on a hero who stepped back, sword qi as a string's last word.

  /** Drifting Cloud: he glides in cutting, a backhand, then a kick that shoves you back a step and a
   *  thrust that comes after you. White, white, white, blue. */
  glideKick: {
    label: 'Drifting Cloud', phase: 1, weight: [2.4, 2.0, 1.0], cooldown: 6, band: [2.4, 7.5], recovery: 0.6, cat: 'string',
    beats: [
      // (tuning pass: the kick is red, a foot no guard stops: the string asks a roll in its middle; it
      // hits as a red blow (22) and the others give it back: the string's total stays 61)
      glide(N, 0.56, 10, 5.2),
      cut('back', N, 0.36, 11),
      kick(R, 0.56, 22),
      cut('thrust', B, 0.46, 18, { dash: { from: 0.6, to: 1.0, stop: 1.0, max: 3.4 }, close: 0 }),
    ],
    recoveryKeys: [[0.45, { ...LUNGE, bY: -0.22, rH: [0.04, -0.1, 0.45], lH: [0.1, 0.12, -0.25] }]],
  },

  /** Crane Descends: a leaping cut from mid range, a spin that carries him on through you, then the
   *  thrust: a parry moment (the blue flare). */
  leapSpin: {
    label: 'Crane Descends', phase: 1, weight: [2.2, 1.8, 0.7], cooldown: 7, band: [2.8, 7], recovery: 0.6, cat: 'string',
    beats: [
      leapCut(N, 0.52, 15, 5.0, 0.8),
      spin(N, 0.4, 14, 1.0),
      cut('thrust', B, 0.42, 20, { flare: true }),
    ],
    recoveryKeys: [[0.45, { ...LUNGE, bY: -0.22, rH: [0.04, -0.1, 0.45] }]],
  },

  /** Two Shadows: a high cut from his right that never comes (a feint: no glint), the real one level
   *  from his left after a held beat, then a rising flick. */
  mirrorFeint: {
    label: 'Two Shadows', phase: 1, weight: [1.8, 1.6, 1.4], cooldown: 6, band: [0, 4.0], recovery: 0.6,
    beats: [
      feintHigh(0.42),
      cut('flatBack', B, 0.46, 22, { hold: [0.08, 0.3], cock: 0.74, lock: true }),
      cut('rise', N, 0.36, 13),
      cut('back', N, 0.34, 12),
    ],
  },

  /** Chasing Rain: nine blows. Four cuts, a glide that comes after a hero who stepped back, three
   *  more, and the last cut throws sword qi after you (a fan of three from phase 2). */
  chaseRain: {
    label: 'Chasing Rain', phase: 1, weight: [1.6, 1.5, 1.4], cooldown: 12, // (tuning pass: 2.2 / 2.0 / 1.8, 9 s: it took a quarter of phase 1)
    band: [0, 3.8], recovery: 0.7, cat: 'string',
    beats: [
      // (tuning pass: the glide after a hero who stepped back is red (22): roll across it; the other
      // blows give the 8 back, the string's total stays 123)
      cut('rise', N, 0.46, 11),
      cut('back', N, 0.34, 11),
      cut('flat', N, 0.34, 11),
      cut('thrust', N, 0.38, 11),
      glide(R, 0.56, 22, 5.5, { back: true }),
      cut('diag', N, 0.36, 11),
      cut('flatBack', N, 0.34, 11),
      cut('over', B, 0.42, 20, { hold: [0.08, 0.25], cock: 0.72, lock: true }),
      // (`zone`: the downward cut's own reach (CUTS.diag's: the qi's keys are its path): a hero still
      // inside it as the cue comes due takes the cut instead, no qi thrown; duelist/brain.js `b.cut`)
      qi(N, 0.42, 13, [1, 3, 3], 0.36, { speed: 10, zone: CUTS.diag.zone }), // (slower: it can catch a hero only a step or two back)
    ],
  },

  /** Whirling Step: two spins that carry him round and on toward you, and a high diagonal to end:
   *  a parry moment. */
  windSpin: {
    label: 'Whirling Step', phase: 1, weight: [2.0, 1.8, 0.8], cooldown: 7, band: [0, 4.2], recovery: 0.6,
    beats: [
      // (tuning pass: the second spin is red (22): roll through it, then parry the diagonal; total 51)
      spin(N, 0.5, 11, 1.2),
      spin(R, 0.56, 22, 1.2),
      cut('diag', B, 0.42, 18, { flare: true, lock: true }),
    ],
  },

  /** Parting Wind: a rising cut, a level backhand, a diagonal, and the last cut throws sword qi after
   *  a hero who backs off (from phase 2 a fan of three). */
  partingWind: {
    label: 'Parting Wind', phase: 1, weight: [1.8, 1.6, 0.5], cooldown: 6, band: [0, 4.4], recovery: 0.55,
    beats: [
      cut('rise', N, 0.46, 13),
      cut('flatBack', N, 0.34, 12),
      cut('diag', N, 0.36, 12),
      // (`zone`: the downward cut's own reach (CUTS.diag's: the qi's keys are its path): a hero still
      // inside it as the cue comes due takes the cut instead, no qi thrown; duelist/brain.js `b.cut`)
      qi(N, 0.42, 14, [1, 3, 3], 0.36, { speed: 10, zone: CUTS.diag.zone }), // (slower: it can catch a hero only a step or two back)
    ],
  },

  // ---------------------------------------------------------------- the courtyard (ADR-111)
  // Four moves on the pieces of the set (terrain.js; numbers: TUNING.terrain). `terrain: kind` marks
  // one: his AI picks it only while a piece for it is in reach, and it cannot start with none.
  // A terrain beat: `go: [from, to, arc]` (windup fractions between which he crosses to the piece, the
  // height of the leap; none = a glide), `spring: { up: [from, to], off }` (up to the pillar, then off
  // it at `off`). He never tracks the hero or steps in by himself in one (track 0, close 0).
  // (Phase 3: the tuning pass lowered the four old ones (one slow cue each, they ate phase 3's pace);
  // the yard stays his through Scattered Flagstones and the felled pieces.)

  /** Severed Pillar: gone from the duel and behind the standing piece nearest the hero, he cuts it
   *  through. The cut is his (white: it reaches a hero who hugs the piece); the fall is the world's:
   *  red, the strip it lands on marked from the moment it goes. Be out of the strip. */
  pillarFall: {
    label: 'Severed Pillar', phase: 1, terrain: 'fell', weight: [1.8, 2.0, 1.4], cooldown: 9, band: [0, 18], recovery: 0.7,
    beats: [{
      tell: N, windup: 0.66, active: 0.1, damage: 18, knockback: 1.4, zone: { kind: 'sector', r: 2.4, ang: 1.0 },
      close: 0, track: 0, go: [0.05, 0.45],
      keys: slashKeys({ from: [-2.15, -0.12], through: [0.0, -0.16], to: [1.75, -0.1], yaw: [0.05, 0.5, 0.95], cock: 0.78, sink: 0.12, extra: { cocked: { pitch: 0.18 } } }),
    }],
    recoveryKeys: [[0.5, { arm: 1, ext: 0.85, sw: [1.2, -0.2], bY: -0.3, yaw: 0.9, ...STEP_IN }]],
  },

  /** Flying Lantern: he is at a stone lantern (or a pillar's stump) and kicks it at the hero. It
   *  glints as it comes down: parry it and it bursts on the blade, or be gone from under it. */
  lanternKick: {
    label: 'Flying Lantern', phase: 1, terrain: 'kick', cat: 'terrain', weight: [1.3, 1.5, 1.0], cooldown: 10, band: [0, 18], recovery: 0.42,
    beats: [{
      tell: B, windup: 0.64, active: 0.1, damage: 22, knockback: 2.4, cast: { kind: 'lantern', selfCue: true }, noSweep: true,
      close: 0, track: 0, go: [0.05, 0.44],
      keys: [
        [0.5, { gather: true, ...KICK_COIL, bY: -0.24, rF: [-0.1, 0.2, 0.06] }],
        [0.8, { ...KICK_COIL }],
        [1.0, { ...KICK_OUT, e: 'i' }],
        [1.6, { ...KICK_OUT, e: 'o', bZ: -0.14, rF: [-0.04, 0.8, 0.98] }],
        [2.0, { ...KICK_OUT, pitch: -0.12, rF: [-0.08, 0.3, 0.6] }],
      ],
    }],
    recoveryKeys: [[0.4, { bY: -0.22, pitch: 0.0, rH: [-0.2, -0.3, 0.05], sw: [-1.5, -0.3], lH: [0.2, 0.0, 0.3], rF: [-0.1, 0.5], lF: [0.18, -0.25] }]],
  },

  /** Three Tolls: he leaps to the fallen bell and strikes it three times. Each blow sends a ring of
   *  sound across the courtyard that glints before it reaches the hero: parry the three in rhythm
   *  (the last is the heavy one) or roll through them. He stands at the bell with his back open. */
  bellToll: {
    label: 'Three Tolls', phase: 1, terrain: 'toll', weight: [1.1, 1.5, 1.2], cooldown: 14, band: [0, 22], recovery: 0.65,
    beats: [
      { tell: N, windup: 0.7, active: 0.1, damage: 12, knockback: 1.0, cast: { kind: 'toll', selfCue: true }, close: 0, track: 0, go: [0.05, 0.5, TUNING.terrain.toll.arc], keys: tollKeys([-2.0, 0.1], 0.8) },
      { tell: N, windup: 0.44, active: 0.1, damage: 12, knockback: 1.0, cast: { kind: 'toll', selfCue: true }, close: 0, track: 0, keys: tollKeys([1.8, 0.3], 0.62) },
      { tell: B, windup: 0.5, active: 0.1, damage: 18, knockback: 2.2, cast: { kind: 'toll', selfCue: true }, close: 0, track: 0, keys: overKeys(0.7) },
    ],
    recoveryKeys: [[0.5, { ...CHOP, two: 0.4, bY: -0.24, sw: [-0.3, -0.5], rH: [0.0, -0.32, 0.4] }]],
  },

  /** Swallow's Return: his way out when he is pressed. He leaps back onto a pillar behind him and
   *  springs off it into a diving cut from where the hero was not looking. The glint comes as he
   *  leaves the stone; the cut can be locked. */
  swallowReturn: {
    label: "Swallow's Return", phase: 1, terrain: 'spring', weight: [1.3, 1.6, 1.1], cooldown: 8, band: [0, 5.5], recovery: 0.55,
    beats: [{
      tell: B, flare: true, windup: 0.92, active: 0.1, damage: 24, knockback: 1.8, zone: { kind: 'sector', r: 2.5, ang: 0.6 }, lock: true,
      close: 0, track: 0, spring: { up: [0.04, 0.5], off: 0.64 },
      keys: [
        [0.28, { ...TUCK }],
        [0.52, { ...PERCH, arm: 0 }],
        [0.64, { ...PERCH, arm: 0, bY: -0.58, pitch: 0.56 }],
        ...slashKeys({ from: [-0.7, 1.45], through: [0.0, -0.1], to: [0.5, -1.0], yaw: [0.2, 0.45, 0.6], cock: 0.86, sink: 0.04, extra: { cocked: { pitch: 0.5, bY: -0.16, rF: [-0.1, 0.34, -0.45], lF: [0.2, 0.46, -0.8], rK: [-0.2, -0.4, 1], lK: [0.3, -0.5, 1], flat: 0.2 } } }).slice(1),
      ],
    }],
    recoveryKeys: [[0.45, { arm: 1, ext: 0.8, sw: [-0.3, -0.7], bY: -0.26, ...STEP_IN }]],
  },

  // ---- the floor (the second pass): the paving breaks and lifts (world/floor.js), so the middle of
  // the courtyard is terrain too. A beat here: `go` (he glides to stand behind a slab), `lever` (the
  // windup fraction at which his blade's point levers it up out of the paving), and the cast at the
  // impact (the kick: `flag`; the fan's cut: `fan`) sends it. Blue: the flare on the flying slab
  // flashLead before it lands (a parry bursts it on the blade, a roll at the flare is through it).
  ...(() => {
    const REACH = { bY: -0.36, pitch: 0.26, yaw: 0.2, spX: 0.14, hdX: 0.2, rH: [0.02, -0.26, 0.4], rP: [-0.8, -0.3, 0], sw: [-0.25, -0.9], swF: [1, 0, 0], lH: [0.2, 0.0, 0.24], lP: [0.7, -0.3, 0.3], rF: [-0.12, 0.58], lF: [0.2, -0.32] };
    const UNDER = { ...REACH, bY: -0.44, pitch: 0.34, rH: [0.0, -0.34, 0.46], sw: [-0.2, -1.2] };
    const FLICK = { bY: -0.28, pitch: 0.04, yaw: 0.28, spX: 0.02, hdX: 0.0, rH: [0.02, 0.06, 0.36], rP: [-0.8, 0.2, -0.3], sw: [-0.35, 0.75], swF: [1, 0, 0], lH: [0.24, 0.0, 0.3], lP: [0.8, -0.2, 0.3], rF: [-0.12, 0.44], lF: [0.2, -0.3] };
    // the lever, then the whole body into the kick: weight back on the left leg, the right driven out flat
    const kickKeys = () => [
      [0.22, { ...REACH }],
      [0.44, { ...UNDER }],
      [0.56, { ...FLICK }],
      [0.82, { ...KICK_COIL }],
      [1.0, { ...KICK_OUT, e: 'i' }],
      [1.6, { ...KICK_OUT, e: 'o', bZ: -0.14, rF: [-0.04, 0.8, 0.98] }],
      [2.0, { ...KICK_OUT, pitch: -0.12, rF: [-0.08, 0.3, 0.6] }],
    ];
    const kick = (windup, damage, o = {}) => ({
      tell: B, windup, active: 0.1, damage, knockback: 2.0, cast: { kind: 'flag', selfCue: true }, noSweep: true,
      close: 0, track: 0, go: [0.02, 0.3], lever: 0.5, keys: kickKeys(), ...o,
    });
    const rec = [[0.4, { bY: -0.22, pitch: 0.0, rH: [-0.2, -0.3, 0.05], sw: [-1.5, -0.3], lH: [0.2, 0.0, 0.3], rF: [-0.1, 0.5], lF: [0.18, -0.25] }]];
    return {
      /** Rising Flagstone: in the open, the hero backed off: the point of his jian under a flagstone, it
       *  jumps up out of the paving and he kicks it at the hero. Blue: parry it, or roll at its flare. */
      flagKick: {
        label: 'Rising Flagstone', phase: 1, terrain: 'flag', cat: 'terrain', weight: [1.0, 0.6, 0.4], cooldown: 9, band: [3.5, 14], recovery: 0.45,
        beats: [kick(0.6, 18)],
        recoveryKeys: rec,
      },
      /** Flagstone Volley (phase 2): one flagstone levered and kicked a beat, two or three in a row, each
       *  from where he stands after the last. */
      flagVolley: {
        label: 'Flagstone Volley', phase: 2, terrain: 'flag', cat: 'terrain', weight: [0, 1.1, 0.8], cooldown: 11, band: [3.5, 14], recovery: 0.5,
        beats: [kick(0.6, 16), kick(0.48, 16, { go: [0.0, 0.3] }), kick(0.48, 18, { go: [0.0, 0.3], chance: 0.6 })],
        recoveryKeys: rec,
      },
      /** Scattered Flagstones (phase 3): three flagstones jump up at once and hang in a row before him;
       *  one level cut goes through them and the pieces come as a fan, each with its flare. */
      flagFan: {
        label: 'Scattered Flagstones', phase: 3, terrain: 'fan', cat: 'terrain', weight: [0, 0, 1.3], cooldown: 10, band: [3.5, 13], recovery: 0.5,
        beats: [{
          tell: B, windup: 0.75, active: 0.1, damage: 16, knockback: 1.8, cast: { kind: 'fan', selfCue: true },
          close: 0, track: 0, go: [0.02, 0.28], lever: 0.4,
          keys: [
            [0.2, { ...REACH }],
            [0.36, { ...UNDER }],
            [0.48, { ...FLICK }],
            ...slashKeys({ ...CUTS.flat, cock: 0.8 }).slice(1),
          ],
        }],
        recoveryKeys: [[0.5, { arm: 1, ext: 0.85, sw: [1.4, 0.1], bY: -0.26, yaw: 0.9, ...STEP_IN }]],
      },
    };
  })(),

  /**
   * Scattering Ash: his answer to a streak of guards (duelist.js `streak`, DEFENSE.foeStreak): as
   * many cuts as the streak counts. The first comes from where he stands; before each of the others
   * he is gone and at another side of the hero (`flit`), and a raised guard meets them from any side.
   * Parry or block them all and his posture breaks. Realised with { count } (realise.js): beat 0,
   * then the others in turn; triggered by hand it plays these four.
   */
  streakFlurry: {
    label: 'Scattering Ash', phase: 1, weight: [0, 0, 0], counter: true, streak: true, cooldown: 0, band: [0, 6], recovery: 0.75,
    beats: [
      cut('diag', N, 0.62, 14, { track: 0.7 }),
      cut('flat', N, 0.48, 14, { flit: { r: 2.6 } }),
      cut('rise', N, 0.48, 14, { flit: { r: 2.6 } }),
      cut('diag', N, 0.48, 14, { flit: { r: 2.6 } }),
    ],
  },

  /** Riposte: his counter out of a guard: a diagonal cut, then a thrust. Only from the guard. */
  riposte: {
    label: 'Riposte', phase: 1, weight: [0, 0, 0], counter: true, cooldown: 0, band: [0, 5], recovery: 0.55,
    beats: [
      cut('diag', N, 0.46, 16, { track: 0.7 }),
      cut('thrust', B, 0.36, 22),
    ],
  },

  // ---------------------------------------------------------------- phase 2
  /** Thousand Needles: a flurry of five thrusts, the last one heavy. */
  needles: {
    label: 'Thousand Needles', phase: 2, weight: [0, 2.6, 3.0], cooldown: 6, band: [0, 3.8], recovery: 0.7,
    beats: [0.5, 0.34, 0.34, 0.34, 0.38].map((w, i, all) => {
      const last = i === all.length - 1, side = i % 2 ? 1 : -1;
      return {
        tell: last ? B : N, windup: w, active: 0.08, damage: last ? 18 : 10, knockback: last ? 1.5 : 0.4,
        zone: { kind: 'line', r: 1.95, w: 0.7 }, track: 0.7,
        ...(last ? { dash: { from: 0.65, to: 1.0, stop: 1.0, max: 2.2 }, close: 0 } : {}),
        keys: [
          [0.6, { ...COIL, rH: [-0.05, -0.22 + 0.05 * side, 0.08], sw: [-0.85, 0.04 + 0.08 * side], bY: -0.22 }],
          [1.0, { ...LUNGE, e: 'i', sw: [-0.3 + 0.08 * side, 0.02 + 0.08 * side], ...(last ? {} : { rF: [-0.08, 0.66], lF: [0.22, -0.46], bZ: 0.14 }) }],
          [1.6, { ...LUNGE, e: 'o', ...(last ? { bZ: 0.26 } : { rF: [-0.08, 0.66], lF: [0.22, -0.46], bZ: 0.12 }) }],
          [2.0, { ...LUNGE, ...(last ? {} : { rF: [-0.08, 0.66], lF: [0.22, -0.46], bZ: 0.1 }) }],
        ],
      };
    }),
  },

  /** Hundred Petals: ten hits, every direction, a held overhead in the middle, ending on a PERILOUS
   *  thrust: parry nine, then dodge into the last. */
  petals: {
    label: 'Hundred Petals', phase: 2, weight: [0, 2.6, 2.6], cooldown: 9, band: [0, 3.6], recovery: 0.8,
    beats: [
      cut('rise', N, 0.5, 11),
      cut('back', N, 0.34, 11),
      cut('flat', N, 0.34, 11),
      cut('flatBack', N, 0.34, 11),
      cut('over', B, 0.4, 18, { hold: [0.1, 0.3], cock: 0.72, lock: true }),
      cut('diag', N, 0.36, 10),
      cut('rise', N, 0.34, 10),
      cut('back', N, 0.34, 10),
      cut('thrust', B, 0.36, 16),
      { tell: R, windup: 0.62, active: 0.12, damage: 26, knockback: 2.5, zone: { kind: 'line', r: 2.1, w: 0.7 }, mikiri: true, dash: { from: 0.84, to: 1.0, stop: 0.8, max: 2.6 }, close: 0, track: 0.7, keys: perilKeys() },
    ],
  },

  /** Ember Whirl: two spinning cuts walking forward, then a low burning spin (red). */
  emberWhirl: {
    label: 'Ember Whirl', phase: 2, weight: [0, 2.0, 1.2], cooldown: 7, band: [0, 3.8], recovery: 0.65,
    beats: [
      { tell: N, windup: 0.5, active: 0.18, damage: 14, knockback: 0.9, zone: { kind: 'ring', r: 2.2 }, track: 0.65, keys: spinKeys(0.66) },
      { tell: N, windup: 0.36, active: 0.18, damage: 14, knockback: 0.9, zone: { kind: 'ring', r: 2.2 }, track: 0.65, keys: spinKeys(0.6) },
      {
        tell: R, windup: 0.6, active: 0.22, damage: 26, knockback: 3, knockdown: true, zone: { kind: 'ring', r: 3.4 }, ring: 3.4, part: 'feet',
        track: 0.5, close: 1.0, keys: spinKeys(0.62, true),
      },
    ],
    recoveryKeys: [[0.4, { ...CROUCH, bY: -0.36, yaw: 0.7, arm: 1, ext: 0.8, sw: [-0.9, -0.3] }]],
  },

  /** Heaven-Splitting Fall: a great leap; the red ring follows the hero, locks, and he comes down
   *  on it two-handed. Red: get out of the ring or roll as he lands. */
  heavenFall: {
    label: 'Heaven-Splitting Fall', phase: 2, weight: [0, 2.2, 1.4], cooldown: 9, band: [4.2, 14], recovery: 0.75,
    beats: [{
      tell: R, windup: 1.15, active: 0.12, damage: 30, knockback: 4, knockdown: true, zone: { kind: 'ring', r: 2.6 }, ring: 2.6, part: 'feet',
      leap: { from: 0.36, lock: 0.66, apex: 3.6 }, track: 0.36, close: 0,
      // (the second pass: he lands in a ring of fire, four arcs with ways through between them)
      burn: { kind: 'ring', r: 2.0, arcs: 4 },
      keys: [
        [0.26, { two: 1, bY: -0.44, pitch: 0.18, yaw: 0.1, rH: [0.1, -0.22, 0.32], sw: [0.0, 0.35], rF: [-0.12, 0.25], lF: [0.15, -0.25], rK: [-0.2, 0.2, 1], lK: [0.3, 0.2, 1], hdY: -0.1 }],
        [0.36, { two: 1, bY: -0.1, pitch: -0.1, yaw: 0.1, rH: [0.1, 0.1, 0.22], sw: [0.0, 1.2], rF: [-0.1, 0.12], lF: [0.15, -0.12] }],
        [0.75, { ...RAISED, yaw: 0.1, bY: 0.05, sw: [0.0, 2.45], rF: [-0.1, 0.25], lF: [0.15, -0.05], rK: [-0.2, 0.3, 1], lK: [0.3, 0.3, 1] }],
        [0.9, { ...RAISED, yaw: 0.1, bY: 0.0, sw: [0.0, 2.6], rF: [-0.1, 0.2], lF: [0.15, -0.15] }],
        [1.0, { ...CHOP, e: 'i', bY: -0.36, pitch: 0.38, rF: [-0.12, 0.45], lF: [0.2, -0.42] }],
        [2.0, { ...CHOP, bY: -0.36, pitch: 0.38, rF: [-0.12, 0.45], lF: [0.2, -0.42] }],
      ],
    }],
    recoveryKeys: [[0.5, { ...CHOP, two: 0.4, bY: -0.3, sw: [-0.2, -0.6] }]],
  },

  // ---------------------------------------------------------------- the second pass: phase 2, the kindled blade
  // What the blade cuts burns (a beat's `burn`: moveFx.js): lines of fire on the stones for about three
  // seconds, ground to step off (no cue: it is not a blow). Crescents in fans and in waves.

  /** Cinder Cross: a high diagonal and a level backhand that leave a cross of fire where you stood,
   *  then a thrust: a parry moment. */
  burningCross: {
    label: 'Cinder Cross', phase: 2, weight: [0, 2.4, 1.8], cooldown: 6, band: [0, 3.8], recovery: 0.6, cat: 'string',
    beats: [
      // (tuning pass: the level cut that lays the line across your front is red (22): roll; the others
      // give it back, the string's total stays 60)
      cut('diag', N, 0.5, 10, { burn: BURN_ALONG }),
      cut('flatBack', R, 0.56, 22, { burn: BURN_ACROSS }),
      cut('rise', N, 0.36, 10),
      cut('thrust', B, 0.42, 18, { flare: true }),
    ],
  },

  /** Ember Fan: two waves of sword qi, a fan of three and then two that pass either side of where
   *  you stood (stand still and guard, or roll), and he comes in behind them. */
  emberFan: {
    label: 'Ember Fan', phase: 2, weight: [0, 1.6, 0.4], cooldown: 7, band: [6.5, 16], // (tuning pass: 5 → 6.5 m: from 5 m every wave fizzled, too near to cue)
    recovery: 0.55,
    beats: [
      qi(N, 0.5, 14, 3, 0.36),
      qi(N, 0.44, 14, 2, 0.6),
      qi(N, 0.44, 14, 3, 0.36),
    ],
  },

  /** Zig-Zag Embers: three glides in, each from a new side, each leaving a line of fire the way he
   *  came; the last one a parry moment. */
  zigzag: {
    label: 'Zig-Zag Embers', phase: 2, weight: [0, 2.2, 0.9], cooldown: 8, band: [3, 10], recovery: 0.6, cat: 'hazard',
    beats: [
      glide(N, 0.52, 14, 4.5, { zig: 1.4, burn: BURN_PATH }),
      glide(N, 0.48, 14, 4.5, { zig: -2.2, back: true, burn: BURN_PATH }),
      glide(B, 0.5, 20, 4.5, { zig: 2.2, flare: true, lock: true, burn: BURN_PATH }),
    ],
  },

  /** Falling Embers: a string of three leaps, each a cut as he lands, the last two-handed from
   *  overhead (blue: it can be locked) and burning where it strikes. */
  leapingString: {
    label: 'Falling Embers', phase: 2, weight: [0, 2.2, 1.8], cooldown: 8, band: [2.5, 8], recovery: 0.65, cat: 'string',
    beats: [
      // (tuning pass: the second leap red (22): roll from under it; total 50)
      leapCut(N, 0.5, 10, 4.5, 0.7),
      leapCut(R, 0.54, 22, 3.0, 0.6),
      {
        tell: B, windup: 0.5, active: 0.1, damage: 18, knockback: 1.6, zone: { kind: 'sector', r: 2.4, ang: 0.55 }, lock: true,
        dash: { from: 0.4, to: 1.0, stop: 1.2, max: 3.0 }, close: 0, lift: [[0.4, 0], [0.75, 0.9], [1.0, 0]], track: 0.6, burn: BURN_ALONG,
        keys: [
          [0.4, { two: 1, yaw: 0.2, bY: -0.34, rH: [0.1, -0.2, 0.3], sw: [0.0, 0.3], hdY: -0.1, rF: [-0.1, 0.28], lF: [0.16, -0.22] }],
          [0.75, { ...RAISED, yaw: 0.15, bY: 0.04, rF: [-0.1, 0.3], lF: [0.15, -0.1], rK: [-0.2, 0.2, 1], lK: [0.3, 0.2, 1] }],
          [1.0, { ...CHOP, e: 'i' }],
          [1.6, { ...CHOP, e: 'o', bY: -0.34, pitch: 0.38 }],
          [2.0, { ...CHOP }],
        ],
      },
    ],
    recoveryKeys: [[0.5, { ...CHOP, two: 0.3, bY: -0.24, sw: [-0.3, -0.45] }]],
  },

  /** Brand and Kick: a burning thrust, a kick that shoves you back off it, and a leaping two-handed
   *  chop that comes after you: a parry moment. */
  kickBrand: {
    label: 'Brand and Kick', phase: 2, weight: [0, 2.2, 1.2], cooldown: 7, band: [0, 4.2], recovery: 0.6, cat: 'string',
    beats: [
      // (tuning pass: red (22): the kick that throws you onto the fire is rolled, not guarded; total 50)
      cut('thrust', N, 0.48, 10, { burn: BURN_ALONG }),
      kick(R, 0.56, 22),
      {
        tell: B, flare: true, windup: 0.48, active: 0.1, damage: 18, knockback: 1.6, zone: { kind: 'sector', r: 2.4, ang: 0.55 }, lock: true,
        dash: { from: 0.42, to: 1.0, stop: 1.2, max: 3.4 }, close: 0, lift: [[0.42, 0], [0.75, 0.8], [1.0, 0]], track: 0.6,
        keys: [
          [0.42, { two: 1, yaw: 0.2, bY: -0.34, rH: [0.1, -0.2, 0.3], sw: [0.0, 0.3], hdY: -0.1, rF: [-0.1, 0.28], lF: [0.16, -0.22] }],
          [0.75, { ...RAISED, yaw: 0.15, bY: 0.04, rF: [-0.1, 0.3], lF: [0.15, -0.1], rK: [-0.2, 0.2, 1], lK: [0.3, 0.2, 1] }],
          [1.0, { ...CHOP, e: 'i' }],
          [1.6, { ...CHOP, e: 'o', bY: -0.34, pitch: 0.38 }],
          [2.0, { ...CHOP }],
        ],
      },
    ],
    recoveryKeys: [[0.5, { ...CHOP, two: 0.3, bY: -0.24, sw: [-0.3, -0.45] }]],
  },

  /** The kindling: the phase-2 transition. He kneels, the blade kindles, a red shock ring. */
  kindle: {
    label: 'Kindling (phase 2)', phase: 2, weight: [0, 0, 0], transition: true, cooldown: 0, band: [0, 99], recovery: 0.7,
    beats: [{
      tell: R, windup: 1.75, active: 0.15, damage: TUNING.transition.damage, knockback: TUNING.transition.knockback,
      zone: { kind: 'ring', r: TUNING.transition.ringRadius }, ring: TUNING.transition.ringRadius, part: 'feet', track: 0, close: 0,
      keys: [
        [0.4, { bY: -0.55, pitch: 0.1, yaw: 0.1, spX: 0.12, hdX: 0.35, rH: [0.05, -0.15, 0.3], sw: [0.0, 1.45], swF: [1, 0, 0], lH: [-0.08, -0.12, 0.3], rF: [-0.12, 0.3], lF: [0.15, -0.42], rK: [0, 0, 1], lK: [0.1, -0.8, 0.6] }],
        [0.85, { bY: -0.55, pitch: 0.06, yaw: 0.1, spX: 0.08, hdX: 0.1, rH: [0.05, -0.05, 0.3], sw: [0.0, 1.5], lH: [-0.1, -0.02, 0.28], rF: [-0.12, 0.3], lF: [0.15, -0.42], rK: [0, 0, 1], lK: [0.1, -0.8, 0.6] }],
        [1.0, { e: 'i', bY: -0.2, pitch: -0.1, yaw: 0.2, rH: [-0.28, -0.05, 0.25], sw: [-1.3, 0.2], swF: [0, 1, 0], lH: [0.3, 0.1, 0.1], rF: [-0.25, 0.3], lF: [0.25, -0.3] }],
        [2.0, { bY: -0.2, pitch: -0.1, yaw: 0.2, rH: [-0.3, -0.05, 0.25], sw: [-1.4, 0.2], lH: [0.3, 0.1, 0.1], rF: [-0.25, 0.3], lF: [0.25, -0.3] }],
      ],
    }],
  },

  // ---------------------------------------------------------------- the second pass: phase 3, ash on the wind
  // He comes apart into ash between blows and the next cut comes from another side (`flit`: an
  // afterimage left where he was), the longest flurry of the fight, a storm of sword qi. Blows are no
  // faster than phase 2's (windupScale 0.92 and its 0.42 s floor): there are more of them, from more places.

  /** Ash on the Wind: the phase-3 transition. Down on one knee, the blade's fire goes out, then one
   *  low sweep all the way round: red, roll through it (the change itself: DuelFx.phaseBurst(3)). */
  ashWind: {
    label: 'Ash on the Wind (phase 3)', phase: 3, weight: [0, 0, 0], transition: true, cooldown: 0, band: [0, 99], recovery: 0.7,
    beats: [{
      tell: R, windup: 1.6, fixed: true, active: 0.22, damage: TUNING.transition.damage, knockback: TUNING.transition.knockback, knockdown: true,
      zone: { kind: 'ring', r: TUNING.transition.ringRadius }, ring: TUNING.transition.ringRadius, part: 'feet', track: 0, close: 0,
      keys: [
        [0.4, { bY: -0.55, pitch: 0.1, yaw: 0.1, spX: 0.12, hdX: 0.35, rH: [0.05, -0.15, 0.3], sw: [0.0, 1.45], swF: [1, 0, 0], lH: [-0.08, -0.12, 0.3], rF: [-0.12, 0.3], lF: [0.15, -0.42], rK: [0, 0, 1], lK: [0.1, -0.8, 0.6] }],
        [0.78, { bY: -0.55, pitch: 0.06, yaw: 0.1, spX: 0.08, hdX: 0.1, rH: [0.05, -0.05, 0.3], sw: [0.0, 1.5], lH: [-0.1, -0.02, 0.28], rF: [-0.12, 0.3], lF: [0.15, -0.42], rK: [0, 0, 1], lK: [0.1, -0.8, 0.6] }],
        ...spinKeys(0.9, true),
      ],
    }],
    recoveryKeys: [[0.4, { ...CROUCH, bY: -0.36, yaw: 0.7, arm: 1, ext: 0.8, sw: [-0.9, -0.3] }]],
  },

  /** Scattered Petals: five cuts, and before three of them he is gone into ash and at another side of
   *  you; the last a thrust: a parry moment. */
  ashString: {
    label: 'Scattered Petals', phase: 3, weight: [0, 0, 3.0], cooldown: 4, band: [0, 4.2], recovery: 0.6,
    beats: [
      // (tuning pass: from his new side, red (22): roll, then parry the thrust; total 70)
      cut('rise', N, 0.46, 10),
      cut('back', N, 0.33, 10, { flit: { r: 2.6 } }),
      cut('flat', N, 0.36, 10),
      cut('diag', R, 0.56, 22, { flit: { r: 2.6 } }),
      cut('thrust', B, 0.42, 18, { flare: true, flit: { r: 2.8 } }),
    ],
  },

  /** Ten Thousand Ashes: the longest flurry of the fight. Eleven blows, every other one from a new
   *  side, a held overhead in the middle (it can be locked), and a perilous thrust to end: parry ten,
   *  then dodge into the last. */
  ashFlurry: {
    label: 'Ten Thousand Ashes', phase: 3, weight: [0, 0, 3.2], cooldown: 9, band: [0, 4.0], recovery: 0.75,
    beats: [
      // (tuning pass: the fourth blow, from a new side, red (22): a roll inside the flurry; the others
      // give it back, the flurry's total stays 150)
      cut('diag', N, 0.46, 11),
      cut('flat', N, 0.33, 11, { flit: { r: 2.6 } }),
      cut('rise', N, 0.33, 11),
      cut('back', R, 0.56, 22, { flit: { r: 2.6 } }),
      cut('thrust', N, 0.36, 10),
      cut('flatBack', N, 0.33, 11, { flit: { r: 2.6 } }),
      cut('over', B, 0.4, 18, { hold: [0.1, 0.25], cock: 0.72, lock: true }),
      cut('diag', N, 0.36, 10, { flit: { r: 2.6 } }),
      cut('rise', N, 0.33, 10),
      cut('flat', N, 0.33, 10, { flit: { r: 2.6 } }),
      { tell: R, windup: 0.62, active: 0.12, damage: 26, knockback: 2.5, zone: { kind: 'line', r: 2.1, w: 0.7 }, mikiri: true, dash: { from: 0.84, to: 1.0, stop: 0.8, max: 2.6 }, close: 0, track: 0.7, keys: perilKeys() },
    ],
  },

  /** Storm of Ash: four waves of sword qi with gaps between them: a fan of three, two that pass either
   *  side of where you stood, three again, and one heavy (blue); he comes in behind them (its links).
   *  Every crescent glints as it comes: guard or roll each wave, or stand in the gap. */
  qiStorm: {
    label: 'Storm of Ash', phase: 3, weight: [0, 0, 0.9], cooldown: 9, band: [6.5, 16], // (tuning pass: 5 → 6.5 m, as Ember Fan)
    recovery: 0.6,
    beats: [
      qi(N, 0.5, 14, 3, 0.36),
      qi(N, 0.44, 14, 2, 0.6),
      qi(N, 0.44, 14, 3, 0.36),
      qi(B, 0.5, 18, 1),
    ],
  },

  /** Ash Shadows: four glides in, and before each of the last three he is gone into ash and comes from
   *  another side, further off; the last a red cut no guard holds. */
  ghostDash: {
    label: 'Ash Shadows', phase: 3, weight: [0, 0, 1.7], cooldown: 8, band: [2.5, 9], recovery: 0.65, cat: 'string',
    beats: [
      glide(N, 0.52, 14, 4.5),
      glide(N, 0.46, 14, 4.5, { flit: { r: 4.2 }, back: true }),
      glide(N, 0.46, 14, 4.5, { flit: { r: 4.2 } }),
      glide(R, 0.62, 24, 4.5, { flit: { r: 4.2 }, back: true, knockback: 2.2 }),
    ],
  },

  /** Ash Lotus: a diagonal, gone and a level cut and a rising one from your side, gone again and the
   *  low sweep round him: red, roll through it. */
  flitLotus: {
    label: 'Ash Lotus', phase: 3, weight: [0, 0, 2.2], cooldown: 6, band: [0, 4.0], recovery: 0.6,
    beats: [
      cut('diag', N, 0.48, 13),
      cut('flat', N, 0.36, 12, { flit: { r: 2.5 } }),
      cut('rise', N, 0.34, 12),
      spin(R, 0.62, 22, 0, { low: true, flit: { r: 2.2 }, close: 0.8 }),
    ],
    recoveryKeys: [[0.4, { ...CROUCH, bY: -0.36, yaw: 0.7, arm: 1, ext: 0.8, sw: [-0.9, -0.3] }]],
  },
};

// ---------------------------------------------------------------- the sword motion pass (ADR-226)
// Behind `?ashMotion=a` (duelist/lookSwitch.js, PENDING until the owner picks; '0' = as before): his
// sword held in line with his forearm and his arms opening at the end of a blow (TUNING.motion, his
// animator), every blue and red blade blow wound into its held tell pose (duelist/tellPose.js:
// `motionKeys`, the same windups), and two QUICK blows thrown straight out of his guard (`quick` beats:
// a normal tell, a windup of TUNING.minQuickWindup, fixed; `motionOnly`: his AI picks them only while
// the switch is on).
export const motionOn = () => lookOf('ashMotion', '0') !== '0';
Object.assign(MOVES, {
  /** Darting Needle: the jian, already pointed at you from his guard, drawn a hand's width back and
   *  driven straight in on a short step. A normal blow: block or parry it. */
  needleDart: {
    label: 'Darting Needle', phase: 1, weight: [1.6, 1.5, 1.3], cooldown: 3.2, band: [0, 3.6], recovery: 0.42, motionOnly: true,
    beats: [{
      tell: N, quick: true, fixed: true, windup: TUNING.minQuickWindup, active: 0.08, damage: 12, knockback: 0.6,
      zone: { kind: 'line', r: 2.0, w: 0.6 }, track: 0.85,
      keys: [
        [0.55, { yaw: 0.66, bY: -0.2, bZ: -0.04, pitch: 0.02, rH: [0.0, -0.13, 0.32], sw: [-0.5, 0.1], ...SET }],
        [1.0, { e: 'i', yaw: 0.5, bY: -0.24, bZ: 0.14, pitch: 0.08, spX: 0.1, rH: [0.03, -0.08, 0.56], rP: [-0.7, -0.3, -0.2], sw: [-0.5, 0.04], lH: [0.18, -0.06, -0.26], lP: [0.7, -0.3, -0.6], ...STEP_IN }],
        [1.6, { e: 'o', yaw: 0.5, bY: -0.24, bZ: 0.16, rH: [0.04, -0.07, 0.58], sw: [-0.5, 0.03], ...STEP_IN }],
        [2.0, { settle: true, yaw: 0.56, bY: -0.2, bZ: 0.08, rH: [0.03, -0.1, 0.5], sw: [-0.5, 0.08], ...STEP_IN }],
      ],
    }],
  },
  /** Flicking Willow: from his guard the point flicks up and cuts down across you, on the same step.
   *  A normal blow. */
  wristFlick: {
    label: 'Flicking Willow', phase: 1, weight: [1.4, 1.4, 1.2], cooldown: 3.6, band: [0, 3.4], recovery: 0.45, motionOnly: true,
    beats: [{
      tell: N, quick: true, fixed: true, windup: TUNING.minQuickWindup, active: 0.08, damage: 12, knockback: 0.6,
      zone: { kind: 'sector', r: 2.1, ang: 0.8 }, track: 0.85,
      keys: slashKeys({ from: [0.2, 0.7], through: [0.0, 0.05], to: [-0.85, -0.5], yaw: [0.6, 0.5, 0.36], cock: 0.6 }),
    }],
  },
});
motionize(MOVES);
// (the owner, 2026-11-26: Piercing Ash keeps its old windup, the blade drawn back and thrust, not the coil)
delete MOVES.piercingAsh.beats[0].motionKeys;

// ---------------------------------------------------------------- the form pass (ADR-250): the keys
// Behind `?ashForm=a` ('0' = as before; duelist/lookSwitch.js): every beat's `formKeys` (and, for the
// blows ADR-226 holds, `formMotionKeys`), its move's `formRecovery`: the same windups, impacts, zones and
// root motion, only the poses (the fragments above). Read by the realiser through `keysOf`.
export const formOn = () => lookOf('ashForm', '0') !== '0';
const near = (a, b) => Math.abs(a - b) < 1e-6;
/** One key of a beat in the form: a thrust's lunge, a two-handed chop's diagonal. */
function formKey(u, k, b) {
  if (u >= 1 - 1e-6 && b.zone?.kind === 'line' && Array.isArray(k.sw) && !(k.arm > 0)) {
    return { ...k, ...lungeF(k, u, !!b.mikiri) };
  }
  if ((k.two ?? 0) > 0.95 && Array.isArray(k.sw)) {
    if (u >= 1 - 1e-6 && k.sw[1] < -0.4) {
      const bZ = k.bZ ?? GUARD.bZ;
      return { ...k, ...(u < 1.3 ? CHOP2_F : CHOP2_FOLLOW), rF: [-0.1, bZ + 0.44], lF: [0.2, bZ - 0.58], rK: [-0.2, 0, 1], lK: [0.35, -0.2, 0.9] };
    }
    if (u < 1 - 1e-6 && k.sw[1] > 1.3) return { ...k, ...RAISED2_F };
  }
  return k;
}
/** The value of a foot field at key i or before (its guard value before any key sets it). */
function footAt(keys, i, f) {
  for (let j = i; j >= 0; j--) if (keys[j][1][f]) return keys[j][1][f];
  return GUARD[f];
}
/** The strike lands with the front footfall (ki-ken-tai-ichi): where a beat steps its front foot in, the
 *  foot is keyed off the stones halfway through the step and down just before the impact, instead of the
 *  planner stepping it once the key has drifted (it came down 0.05 - 0.1 s after the blade). Not in a
 *  dash, a leap or a beat of the courtyard (the root carries the feet), nor where the foot is already up. */
function stepIn(keys, b) {
  if (b.dash || b.lift || b.leap || b.go || b.spring || b.flit) return keys;
  const hi = keys.findIndex(([u]) => near(u, 1));
  if (hi < 1) return keys;
  const rf = keys[hi][1].rF;
  if (!rf) return keys;
  const prev = footAt(keys, hi - 1, 'rF');
  const z0 = prev.length === 2 ? prev[1] : prev[2], z1 = rf.length === 2 ? rf[1] : rf[2];
  const y1 = rf.length === 3 ? rf[1] : ANK, y0 = prev.length === 3 ? prev[1] : ANK;
  if (z1 - z0 < 0.12 || y1 > ANK + 0.02 || y0 > ANK + 0.02) return keys;
  const u0 = keys[hi - 1][0], um = u0 + 0.5 * (1 - u0), ud = u0 + 0.86 * (1 - u0);
  const x0 = prev[0], x1 = rf[0];
  const out = keys.slice(0, hi);
  out.push([um, { rF: [(x0 + x1) / 2, LIFT, z0 + 0.55 * (z1 - z0)] }]);
  out.push([ud, { rF: [x1, ANK, z1] }]);
  return out.concat(keys.slice(hi));
}
const formBeat = (b, keys) => stepIn(keys.map(([u, k]) => [u, formKey(u, k, b)]), b);
const DOWN = new WeakSet(); // beats that come down from overhead in the form (the diagonal ones)
for (const def of Object.values(MOVES)) for (const b of def.beats ?? []) {
  if (!Array.isArray(b.keys)) continue;
  const alt = FORM.get(b.keys);
  b.formKeys = formBeat(b, alt ?? b.keys);
  if ((alt && OVERS.has(alt)) || b.keys.some(([u, k]) => u < 1 && (k.two ?? 0) > 0.95 && k.sw?.[1] > 1.3)) DOWN.add(b);
}
/** The blue HIGH hold (duelist/tellPose.js) of a blow that comes down in the form: the same raised blade,
 *  a little further out over his sword shoulder (world az -1.1, not -0.42), so the strike from it comes
 *  ACROSS him (a diagonal at the game camera) instead of straight down the middle. */
const HIGH_F = [-1.1, 1.15];
// (its hold ends at 0.7 of the windup, not 0.8: the wider strike gets half as long again, so the hand
// never travels more than ~0.13 m in 1/120 s: duel.mjs MOTION)
const widenHigh = (keys) => keys.map(([u, k]) => {
  if (!(u > 0.3 && u < 1 && k.sw && k.sw[1] > 1.1)) return [u, k];
  return [k.e === 'h' && u > 0.75 ? 0.7 : u, { ...k, sw: [W2B(HIGH_F[0], k.yaw ?? GUARD.yaw), HIGH_F[1]] }];
});
// the kneel and sweep of Ash on the Wind (its keys spread from spinKeys, so not paired above)
{
  const b = MOVES.ashWind.beats[0];
  b.formKeys = [...b.keys.slice(0, 2), ...sweepKeysF(0.9)];
}
// the held tell poses (ADR-226) over the form's keys: motionize a shadow table, then keep its keys
{
  const shadow = {};
  for (const [n, def] of Object.entries(MOVES)) shadow[n] = { ...def, beats: (def.beats ?? []).map((b) => ({ ...b, keys: b.formKeys ?? b.keys, motionKeys: undefined })) };
  motionize(shadow);
  for (const [n, def] of Object.entries(MOVES)) (def.beats ?? []).forEach((b, i) => {
    const m = shadow[n].beats[i].motionKeys;
    if (m && b.motionKeys) b.formMotionKeys = stepIn(DOWN.has(b) && b.tell === B ? widenHigh(m) : m, b);
  });
}
// a move's recovery in the form: a lunge held as the lunge now is; after the one-handed diagonal the arm
// comes back from low at his left (not a two-handed grip found in 0.3 s); a two-handed chop on its diagonal
{
  const ONE = { arm: 1, ext: 0.8, sw: [0.25, -0.65], yaw: 0.45, bY: -0.26, two: 0, ...STEP_IN };
  for (const [n, def] of Object.entries(MOVES)) {
    const R = def.recoveryKeys;
    if (!Array.isArray(R)) continue;
    if (n === 'fallingAsh' || n === 'bellToll') { def.formRecovery = [[0.5, ONE]]; continue; }
    const line = def.beats.some((b) => b.zone?.kind === 'line'), mik = def.beats.some((b) => b.mikiri);
    def.formRecovery = R.map(([r, k]) => {
      if (line && Array.isArray(k.rF) && k.rF[k.rF.length - 1] > 0.8) return [r, { ...k, ...lungeF(k, 1.6, mik), bY: -0.28 }];
      if ((k.two ?? 0) > 0.25 && Array.isArray(k.sw) && k.sw[1] < -0.3) return [r, { ...k, sw: [W2B(0.5, 0.45), -0.6], yaw: 0.45 }];
      return [r, k];
    });
  }
}
delete MOVES.piercingAsh.beats[0].formMotionKeys; // (as its motionKeys: the owner kept its thrust)
// Flicking Willow, a quick blow out of his guard (0.34 s): the sword-finger raised over his head in the guard
// came down to his chest in 0.09 s (14.6 m/s, the flail the owner dislikes). In the form it stays up as the
// point flicks, and drops to his shoulder only as the cut comes across (opposition, not a throw).
{
  const b = MOVES.wristFlick.beats[0], up = [-0.04, 0.36, 0.04], mid = [0.08, 0.14, 0.12];
  b.formKeys = b.formKeys.map(([u, k]) => (k.lH ? [u, { ...k, lH: u < 0.7 ? up : u < 1.3 ? mid : [0.14, 0.06, 0.06] }] : [u, k]));
}
// Heaven-Splitting Fall, a jump (the owner, 2026-11-27: "doesn't look natural in his motion"). The held red
// coil (ADR-226) spans 0.36 - 0.72 of its windup, which is his whole flight: he flew 3.6 m up in a ground
// crouch, feet set in a lunge, and whipped the blade from behind him to the chop in the last 0.3 s. In the
// form it is a jump: he loads (sinks, the blade swung down behind his right hip), drives up off both feet
// as the arms swing the blade up, tucks his knees at the top with the blade raised over his sword shoulder
// (held through the ring's lock: the red tell reads there), reaches his legs down as the blade starts
// over, and lands INTO the cut (the root's arc ends at the impact), the knees taking it as he sinks on.
{
  const b = MOVES.heavenFall.beats[0], Y = 0.1; // (the jump's facing: the leap turns him to where he lands)
  const RAISE = { two: 1, yaw: Y, rP: [-0.8, 0.4, -0.3], swF: [1, 0, 0] };
  // The arms (the owner, again: "the sword and arm look awkward and stiff"): the blade no longer swings
  // forward under him and back up (a flip), nor waits frozen at the top. The hands lift it up his right side
  // in one rising arc (the tip trailing behind), and it keeps cocking slowly back behind his head through the
  // lock (the arms never stop), till it turns over into the cut as he drops, the hands leading the steel.
  const keys = [
    // the load: down onto both feet, the blade swung low behind him (the arms' backswing)
    [0.26, { two: 1, yaw: 0.2, bY: -0.5, pitch: 0.34, spX: 0.14, hdX: -0.2, hdY: -0.05, rH: [-0.04, -0.3, 0.12], rP: [-0.6, -0.4, -0.5], sw: [W2B(-2.3, 0.2), -0.55], swF: [1, 0, 0], rF: [-0.14, 0.22], lF: [0.16, -0.22], rK: [-0.25, 0.3, 1], lK: [0.3, 0.3, 1], flat: 0.8 }],
    // the drive: legs straight, up on his toes, the hands lifting the blade up his right side, tip behind
    [0.36, { two: 1, yaw: 0.15, bY: 0.02, pitch: -0.06, spX: -0.02, hdX: 0.06, hdY: 0, rH: [-0.08, 0.02, 0.14], rP: [-0.75, 0.0, -0.45], sw: [W2B(-2.0, 0.15), 0.15], swF: [1, 0, 0], rF: [-0.12, 0.16], lF: [0.15, -0.2], flat: 0 }],
    // off the stones: the legs trailing long below him, toes down; the hands come up past his shoulder
    [0.46, { ...RAISE, bY: 0.04, pitch: -0.1, spX: -0.05, hdX: 0.05, rH: [-0.1, 0.26, 0.08], sw: [W2B(-1.6, Y), 0.85], rF: [-0.1, ANK + 0.02, 0.04], lF: [0.15, ANK + 0.08, -0.2], rK: [-0.2, 0.2, 1], lK: [0.3, 0.2, 1] }],
    // the top: knees drawn up, back arching, the blade up over his sword shoulder and still rising
    [0.6, { ...RAISE, bY: -0.06, pitch: -0.15, spX: -0.09, hdX: 0.05, rH: [-0.08, 0.38, 0.05], sw: [W2B(-1.2, Y), 1.45], rF: [-0.12, 0.36, 0.16], lF: [0.15, 0.3, -0.08], rK: [-0.2, 0.4, 1], lK: [0.3, 0.4, 1] }],
    // the deepest cock: the elbows high, the tip behind his head (the lock reads on it); here it turns
    [0.8, { ...RAISE, bY: -0.08, pitch: -0.14, spX: -0.13, hdX: 0.1, rH: [-0.05, 0.44, 0.0], rP: [-0.8, 0.55, -0.25], sw: [W2B(-1.0, Y), 1.9], rF: [-0.12, 0.34, 0.2], lF: [0.15, 0.3, -0.06], rK: [-0.2, 0.4, 1], lK: [0.3, 0.4, 1] }],
    // the fall: the legs reach for the ground (the front foot ahead), the hands drive forward over his head
    // ahead of the steel, the chest starting to fold over it
    [0.93, { ...RAISE, yaw: 0.2, bY: 0.0, pitch: 0.06, spX: 0.0, hdX: 0.0, rH: [-0.02, 0.36, 0.26], rP: [-0.8, 0.3, -0.2], sw: [W2B(-0.7, 0.2), 1.25], rF: [-0.1, ANK + 0.1, 0.42], lF: [0.2, ANK + 0.16, -0.5], rK: [-0.2, 0.1, 1], lK: [0.35, 0, 0.9] }],
    // the landing is the cut; the knees take it on through the active frames
    [1.0, { e: 'i', two: 1, ...CHOP2_F, bY: -0.42, rP: [-0.8, -0.3, 0], swF: [1, 0, 0], rF: [-0.1, 0.46], lF: [0.2, -0.56], rK: [-0.2, 0.1, 1], lK: [0.35, -0.1, 0.9], flat: 0.6 }],
    [2.0, { two: 1, ...CHOP2_FOLLOW, bY: -0.52, pitch: 0.42, spX: 0.18, hdX: -0.14, rP: [-0.8, -0.3, 0], swF: [1, 0, 0], rF: [-0.1, 0.46], lF: [0.2, -0.56], rK: [-0.2, 0.1, 1], lK: [0.35, -0.1, 0.9], flat: 0.8 }],
  ];
  b.formKeys = keys;
  if (b.formMotionKeys) b.formMotionKeys = keys;
  // and he rises out of it where he landed (no step: the feet stay)
  MOVES.heavenFall.formRecovery = [[0.5, { two: 0.5, yaw: 0.45, bY: -0.3, pitch: 0.24, spX: 0.14, hdX: -0.1, rH: [0.1, -0.3, 0.42], rP: [-0.8, -0.3, 0], sw: [W2B(0.5, 0.45), -0.6], swF: [1, 0, 0], rF: [-0.1, 0.46], lF: [0.2, -0.56] }]];
}
export const MOVE_NAMES = Object.keys(MOVES);

// ---------------------------------------------------------------- reaction clips (no hits)
const KNEEL = { bY: -0.52, pitch: 0.22, spX: 0.1, hdX: 0.5, rF: [-0.12, 0.32], lF: [0.17, -0.42], rK: [0, 0, 1], lK: [0.1, -0.85, 0.5], flat: 0.7 };
const SEIZA = {
  bY: -0.6, bZ: -0.06, pitch: 0.04, yaw: 0, hip: 0, spX: 0.08, spY: 0, hdX: 0.32, hdY: 0,
  rF: [-0.13, -0.36], lF: [0.13, -0.36], rK: [-0.05, -0.6, 0.8], lK: [0.05, -0.6, 0.8], rFy: 0, lFy: 0, flat: 0.2,
  rH: [0.08, -0.46, 0.26], rP: [-0.5, -0.2, -0.8], sw: [1.45, -0.06], swF: [0, 1, 0], lH: [-0.06, -0.46, 0.24], lP: [0.5, -0.2, -0.8],
};

export const CLIPS = {
  /** His guard: the wards that meet a strike, the deflect, the raised guard (duelist/guard.js). */
  ...GUARD_CLIPS,
  /** A light strike that lands outside his attacks. */
  flinch: { dur: 0.26, keys: [[0.07, { e: 'o', spX: -0.06, hdX: -0.12, bZ: -0.05, yaw: 0.46 }]] },
  /** Backstep out of reach. */
  backstep: { dur: 0.42, keys: [[0.12, { bY: -0.18, pitch: -0.08, ...STEP_BACK }], [0.32, { bY: -0.14, rF: [-0.1, 0.26], lF: [0.17, -0.3] }]] },
  /** Sidestep (out of a charged thrust's line). */
  sidestep: { dur: 0.36, keys: [[0.12, { bY: -0.2, roll: 0.08, rF: [-0.2, 0.25], lF: [0.25, -0.2] }]] },
  /** His guard crushed (a full-charge thrust) or a heavy blow: a stumble back. */
  stagger: {
    dur: 0.8,
    keys: [
      [0.12, { e: 'o', pitch: -0.2, bZ: -0.1, bY: -0.14, rH: [-0.3, -0.2, 0.1], sw: [-1.7, 0.2], swF: [0, 1, 0], lH: [0.3, 0.0, 0.1], hdX: -0.2, ...STEP_BACK }],
      [0.5, { pitch: -0.08, bY: -0.16, rH: [-0.25, -0.2, 0.2], sw: [-1.3, 0.1], lH: [0.25, 0.0, 0.2] }],
    ],
  },
  /** His last hit parried: the jian knocked up and back, a step back. The punish window. */
  recoil: {
    dur: 1.0,
    keys: [
      [0.1, { e: 'o', pitch: -0.24, bZ: -0.1, rH: [-0.1, 0.2, 0.15], rP: [-0.8, 0.4, -0.4], sw: [-0.5, 1.4], swF: [1, 0, 0], lH: [0.3, 0.05, 0.05], hdX: -0.2, ...STEP_BACK }],
      [0.6, { pitch: -0.12, rH: [-0.1, 0.05, 0.25], sw: [-0.6, 0.8], lH: [0.25, 0.1, 0.1] }],
    ],
  },
  /** Thrown off balance (a full deflect, a lost blade lock): the jian flung wide, arms out, two
   *  stumbling steps back before he finds his guard. The big opening. */
  reeling: {
    dur: 1.45,
    keys: [
      [0.12, { e: 'o', pitch: -0.32, bZ: -0.14, bY: -0.12, yaw: -0.2, rH: [-0.34, 0.05, 0.05], rP: [-0.9, 0.3, -0.3], sw: [-2.3, 0.45], swF: [0, 1, 0], lH: [0.32, 0.1, 0.0], lP: [0.9, 0.3, 0.0], hdX: -0.3, rF: [-0.12, 0.05], lF: [0.2, -0.5] }],
      [0.6, { pitch: -0.2, bY: -0.2, yaw: 0.0, rH: [-0.3, -0.05, 0.12], sw: [-2.0, 0.2], lH: [0.3, 0.0, 0.1], hdX: -0.1, rF: [-0.14, -0.15], lF: [0.18, -0.45] }],
      [1.1, { pitch: -0.05, bY: -0.18, rH: [-0.1, -0.1, 0.3], sw: [-0.9, 0.2], lH: [0.1, -0.05, 0.3] }],
    ],
  },
  /** Pinned by a mikiri: the hero's boot on his blade, he is dragged forward and down, then
   *  wrenches the jian free and stumbles back. */
  trampled: {
    dur: 1.5,
    keys: [
      [0.1, { e: 'o', pitch: 0.42, bY: -0.34, bZ: 0.1, rH: [0.02, -0.38, 0.45], rP: [-0.6, -0.6, 0.2], sw: [-0.25, -1.15], swF: [1, 0, 0], lH: [0.2, -0.2, 0.2], hdX: 0.45, rF: [-0.08, 0.7], lF: [0.22, -0.48] }],
      [0.75, { pitch: 0.35, bY: -0.3, rH: [0.0, -0.36, 0.42], sw: [-0.3, -1.1], hdX: 0.4 }],
      [1.0, { e: 'o', pitch: -0.2, bY: -0.16, bZ: -0.1, rH: [-0.25, 0.0, 0.15], sw: [-1.9, 0.3], swF: [0, 1, 0], lH: [0.3, 0.05, 0.05], hdX: -0.1, ...STEP_BACK }],
    ],
  },
  /** Blades locked: his jian pressed against the hero's, both hands on it, leaning in. Held until
   *  the push is decided (brain.js startLock / disciple.js onLockEnd). */
  lock: {
    dur: 3, hold: true,
    keys: [
      [0.1, { e: 'o', two: 0.8, bY: -0.22, bZ: 0.08, pitch: 0.12, yaw: 0.3, rH: [0.08, 0.0, 0.44], rP: [-0.7, -0.2, -0.3], sw: [0.5, 0.95], swF: [0, 0.3, -1], hdX: 0.1, hdY: -0.3, rF: [-0.1, 0.4], lF: [0.2, -0.42] }],
      [3, { two: 0.8, bY: -0.24, bZ: 0.1, pitch: 0.14, yaw: 0.3, rH: [0.08, 0.0, 0.45], sw: [0.46, 0.97], swF: [0, 0.3, -1], rF: [-0.1, 0.42], lF: [0.2, -0.44] }],
    ],
  },
  /** Posture broken: down on one knee, the jian's point on the stones, head bowed. */
  broken: {
    dur: 3.2, hold: true,
    keys: [
      [0.25, { e: 'o', ...KNEEL, rH: [-0.15, -0.4, 0.3], rP: [-0.7, -0.4, -0.3], sw: [-0.6, -1.0], swF: [1, 0, 0], lH: [0.05, -0.45, 0.15], lP: [0.6, -0.3, 0.3] }],
      [2.9, { ...KNEEL, hdX: 0.4, rH: [-0.15, -0.38, 0.3], sw: [-0.6, -0.95], lH: [0.05, -0.43, 0.15] }],
      [3.2, { ...KNEEL, bY: -0.4, hdX: 0.2, rH: [-0.1, -0.3, 0.32], sw: [-0.5, -0.6], lH: [0.05, -0.3, 0.2] }],
    ],
  },
  /** Executed: run through, he lurches, then rises and gives ground (the break is spent). */
  executed: {
    dur: 1.3,
    keys: [
      [0.0, { ...KNEEL, rH: [-0.15, -0.4, 0.3], sw: [-0.6, -1.0], lH: [0.05, -0.45, 0.15] }],
      [0.2, { e: 'o', ...KNEEL, pitch: -0.25, hdX: -0.3, bY: -0.45, rH: [-0.2, -0.3, 0.1], sw: [-1.2, -0.6], lH: [0.0, -0.1, 0.25] }],
      [0.7, { ...KNEEL, pitch: 0.3, hdX: 0.5, bY: -0.54, rH: [-0.15, -0.42, 0.28], sw: [-0.6, -1.05], lH: [0.0, -0.4, 0.25] }],
      [1.05, { ...KNEEL, bY: -0.3, hdX: 0.15, rH: [-0.1, -0.3, 0.3], sw: [-0.5, -0.6], lH: [0.05, -0.2, 0.2], ...STEP_BACK }],
    ],
  },
  /** Defeated: he sinks to his knees and plants the jian before him, head bowed. */
  death: {
    dur: 2.4, hold: true,
    keys: [
      [0.4, { e: 'o', ...KNEEL, pitch: 0.1, rH: [0.0, -0.3, 0.3], sw: [-0.3, -0.9], lH: [0.0, -0.3, 0.2] }],
      [1.2, { ...SEIZA, rH: [0.06, -0.18, 0.36], sw: [0.0, -1.5], swF: [1, 0, 0], two: 1, hdX: 0.55, pitch: 0.12 }],
      [2.4, { ...SEIZA, rH: [0.06, -0.18, 0.36], sw: [0.0, -1.5], swF: [1, 0, 0], two: 1, hdX: 0.7, pitch: 0.18 }],
    ],
  },
  /** Kneeling in meditation, the jian across his knees (asleep: the fight has not begun). */
  meditate: { dur: 1, hold: true, keys: [[0, { ...SEIZA }]] },
  /** The intro: he rises, flicks the jian, salutes fist-in-palm, and takes his guard. */
  intro: {
    dur: 2.8,
    keys: [
      [0, { ...SEIZA }],
      [0.25, { ...SEIZA, hdX: 0.05 }],
      [0.85, { bY: -0.12, yaw: 0.1, hdX: 0.05, rH: [0.0, -0.4, 0.15], sw: [-0.5, -0.9], swF: [1, 0, 0], lH: [0.08, -0.46, 0.05], rF: [-0.12, 0.12], lF: [0.14, -0.12] }],
      [1.15, { yaw: 0.4, rH: [0.15, 0.05, 0.35], sw: [1.1, 0.65], swF: [0, 1, 0], lH: [0.1, 0.25, -0.1] }],
      [1.45, { e: 'i', yaw: 0.2, rH: [-0.25, -0.15, 0.3], sw: [-1.6, 0.2], lH: [0.1, 0.27, -0.12] }],
      [1.75, { yaw: 0.0, bY: -0.04, pitch: 0.0, hdX: 0.0, rH: [0.06, -0.22, 0.24], rP: [-0.5, -0.6, -0.4], sw: [-0.2, -1.2], swF: [1, 0, 0], lH: [-0.1, -0.2, 0.26], lP: [0.6, -0.4, 0.3], rF: [-0.12, 0.05], lF: [0.12, -0.05] }],
      [2.3, { yaw: 0.0, bY: -0.05, pitch: 0.14, hdX: 0.2, rH: [0.06, -0.22, 0.24], sw: [-0.2, -1.2], swF: [1, 0, 0], lH: [-0.1, -0.2, 0.26], rF: [-0.12, 0.05], lF: [0.12, -0.05] }],
    ],
  },
};

/** Compiled reaction clips (build time). */
export const CLIP = Object.fromEntries(Object.entries(CLIPS).map(([k, c]) => [k, compileClip(c.keys.map(([t, pose]) => ({ t, ...pose })), c.dur, { hold: !!c.hold })]));
for (const [k, c] of Object.entries(CLIP)) c.name = k;

// ---------------------------------------------------------------- realising a move
/**
 * A move as it will play this time (duelist/realise.js): phase scaling, rolled chances, the bait
 * holds, absolute times per beat ({ start, impact, end, flash, tellAt }) and the compiled clip. `rnd`
 * = a 0..1 source (the game's Math.random, so the seeded sims replay).
 */
export const realise = makeRealise({
  TUNING, MOVES, compileClip: (keys, dur) => compileClip(keys, dur), completeBeat,
  // ADR-226's held tell poses (`?ashMotion`) and ADR-250's form (`?ashForm`), either or both
  keysOf: (b) => {
    const m = motionOn();
    if (formOn()) return (m ? (b.formMotionKeys ?? b.formKeys ?? b.motionKeys) : b.formKeys) ?? null;
    return m ? (b.motionKeys ?? null) : null;
  },
  recoveryKeysOf: (def) => (formOn() ? (def.formRecovery ?? null) : null),
});

/** The guard pose (for tools). */
export { GUARD };
