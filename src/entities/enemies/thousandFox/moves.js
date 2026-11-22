import { TELL } from '../../../combat/rules.js';
import { DIM } from '../../player/model.js';
import { compileClip, completeBeat, GUARD } from './poses.js';
import { TUNING } from './tuning.js';
import { makeRealise } from '../duelist/realise.js';
import { GUARD_CLIPS } from '../duelist/guard.js';

// Wen Yao's moves and reaction clips, as data (ADR-131; COMBAT.md → "The Thousand-Body Fox"). The format
// is the Ash Disciple's (ashDisciple/moves.js header: a MOVE, a BEAT, the rules the DATA test checks);
// the pose fragments below are copied from there (his cuts are a swordsman's cuts too). His own beat
// fields, read by fox.js (the brain ignores them):
//   swap: true      as the beat's windup starts he trades places with the paper self nearest the hero
//                   (none alive: a flit to the hero's side); the string's reach check counts the self's
//                   spot (FoxBrain._reach)
//   scatter: true   (on a feint beat: no tell, no glint, no hit) at its impact paper selves tear off him
//                   (TUNING.clones.scatter per phase, to the cap)
//   round: true     (a feint beat) at its impact every live self is given a slot in the Thousand-Body
//                   Round (clones.js round), the slots ending TUNING.clones.round s before the move's
//                   next beat lands
//   pearl: 'charge' the Pearl's charge (the beat's windup; pearl.js): his guard is down, his selves
//                   fight on; the beat itself is a `cast: { kind: 'pearl', selfCue: true }`: the bat.
//                   'great': the black pearl over his head (FoxFx draws it; the engine charges it)
//   mantle: 'tail' | 'pounce'   phase 3's blows of the mantle (their world blows: fox.js onImpact)
// And on a MOVE: clonesFight (a self may take the cutting token while it runs), needs (live selves
// needed for the AI to pick it), densityAs (the director weighs it as a move of that many cues a
// second: a cast with no blow of its own is not an idle move), hidden (the Lab's list leaves it out).

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
const thrustKeys = (k = 1, cock = 0.74) => [
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
function slashKeys({ from, through, to, yaw: [y0, y1, y2], cock = 0.7, sink = 0, extra = {} }) {
  const dir = Math.sign(to[0] - from[0]) || 0; // the swing's turn: + toward his left
  const sw = (w, y) => [W2B(w[0], y), w[1]];
  const gy = (y0 + 0.62) / 2;
  return [
    // gathering: the blade begins its draw toward the cock, the weight settles back
    [cock * 0.45, { gather: true, arm: 0.7, ext: 0.6, lead: 0.05 * dir, yaw: gy, sw: sw([from[0] * 0.55, from[1] * 0.55 + 0.08], gy), bY: -0.2 - sink * 0.5, bZ: -0.03, lH: [0.04, -0.1, 0.32], lP: [0.6, -0.7, 0.1], ...SET }],
    // cocked: wound up on the back foot, the free hand reaching forward for balance
    [cock, { arm: 1, ext: 0.5, lead: 0.22 * dir, yaw: y0, sw: sw(from, y0), bY: -0.24 - sink, bZ: -0.06, pitch: 0.08, hip: 0.1 * dir, lH: [0.0, -0.13, 0.32], lP: [0.6, -0.8, 0.1], ...SET, ...extra.cocked }],
    // the strike: the fist arrives first, the steel snaps through the opponent on a step in
    [1.0, { e: 'i', arm: 1, ext: 1, lead: 0, yaw: y1, sw: sw(through, y1), bY: -0.28 - sink, bZ: 0.1, pitch: 0.1, hip: -0.06 * dir, lH: [0.26, -0.1, -0.16], lP: [0.8, -0.4, -0.5], ...STEP_IN, ...extra.strike }],
    // follow-through: the blade whips past the fist and on round
    [1.6, { e: 'o', arm: 1, ext: 0.88, lead: -0.32 * dir, yaw: y2, sw: sw(to, y2), bY: -0.24 - sink, bZ: 0.08, pitch: 0.04, hip: -0.12 * dir, lH: [0.3, -0.04, -0.22], ...STEP_IN, ...extra.follow }],
    [2.0, { settle: true, arm: 1, ext: 0.84, lead: -0.26 * dir, yaw: y2, sw: sw([to[0] * 0.94, to[1] * 0.9], y2), bY: -0.22 - sink, bZ: 0.06, lH: [0.28, -0.06, -0.18], ...STEP_IN }],
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
const overKeys = (cock = 0.7) => [
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
const spinKeys = (cock = 0.66, low = false) => {
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

// ---------------------------------------------------------------- his own fragments
const CP = TUNING.clones, PE = TUNING.pearl, TR = TUNING.transition;
/** The free hand open, palm up, toward the opponent (the guard's): the Pearl hangs over it. */
const PALM = { lH: [0.06, -0.04, 0.44], lP: [0.6, -0.8, 0.1] };
/** The Pearl drawn out over the blade's tip: the dao held up before him, the point raised, the palm
 *  under it; then batted with the flat (a level sweep from his left to his right: no palm thrust). */
const pearlKeys = () => [
  [0.18, { yaw: -0.3, bY: -0.2, rH: [0.02, 0.0, 0.36], rP: [-0.8, -0.3, -0.3], sw: [0.35, 0.75], swF: [0, 1, 0], ...PALM, lH: [0.08, 0.02, 0.4], hdY: 0.3 }],
  [0.8, { yaw: -0.2, bY: -0.24, rH: [0.04, 0.06, 0.38], sw: [0.4, 0.8], swF: [0, 1, 0], ...PALM, lH: [0.1, 0.06, 0.36], hdY: 0.2 }],
  [0.9, { yaw: -0.55, bY: -0.26, rH: [-0.04, 0.0, 0.3], sw: [1.4, 0.3], swF: [0, 0, 1], lH: [0.2, -0.06, 0.2] }],
  [1.0, { e: 'i', yaw: 0.35, bY: -0.28, rH: [0.06, -0.04, 0.48], sw: [-0.2, 0.2], swF: [0, 0, 1], lH: [0.26, -0.1, -0.1], lP: [0.8, -0.4, -0.5] }],
  [2.0, { yaw: 0.6, bY: -0.24, rH: [0.02, -0.06, 0.44], sw: [-1.1, 0.1], swF: [0, 0, 1], lH: [0.26, -0.1, -0.16] }],
];
/** He tears selves off himself: the dao thrown back, the free arm flung wide, a turn on the spot. */
const scatterKeys = () => [
  [0.4, { gather: true, yaw: -0.2, bY: -0.3, rH: [-0.2, 0.1, 0.1], sw: [-2.2, 0.5], lH: [0.24, 0.02, 0.24], lP: [0.8, -0.2, 0.3] }],
  [1.0, { e: 'i', yaw: 0.5, bY: -0.18, rH: [-0.3, 0.05, -0.05], sw: [-2.6, 0.3], lH: [0.34, 0.12, 0.0], lP: [0.9, 0.2, 0.0], pitch: -0.08 }],
  [2.0, { yaw: 0.3, bY: -0.2, rH: [-0.26, 0.05, 0.0], sw: [-2.5, 0.4], lH: [0.3, 0.06, 0.06] }],
];
/** The round's call: the dao raised high overhead, held (his selves close in round the hero). */
const callKeys = () => [
  [0.5, { gather: true, two: 0.6, yaw: 0.1, bY: -0.16, rH: [0.06, 0.36, 0.1], sw: [-0.3, 1.6], swF: [1, 0, 0], lH: [0.04, 0.3, 0.12], pitch: -0.08 }],
  [1.0, { two: 1, yaw: 0.15, bY: -0.12, rH: [0.1, 0.42, 0.08], sw: [-0.2, 2.0], swF: [1, 0, 0], lH: [0.06, 0.38, 0.1], pitch: -0.12 }],
  [2.0, { two: 1, yaw: 0.15, bY: -0.14, rH: [0.1, 0.42, 0.08], sw: [-0.2, 2.0], swF: [1, 0, 0], lH: [0.06, 0.38, 0.1], pitch: -0.12 }],
];
/** A backstep out of reach (the Pearl's first move): no blow. */
const backstep = (dist = 1.9) => ({
  feint: true, windup: 0.3, active: 0.05, close: 0, track: 1, travel: [[0, 0], [1, -dist * 0.8], [2, -dist]],
  keys: [[0.5, { bY: -0.2, pitch: -0.08, ...STEP_BACK }], [1.0, { bY: -0.24, rF: [-0.12, 0.2], lF: [0.2, -0.4] }]],
});
/** The leap down with the Moon-Swallowing Pearl over his head (a black blow: the engine draws its charge). */
const greatKeys = () => [
  [0.4, { gather: true, two: 1, ...RAISED, bY: -0.3, sw: [-0.2, 1.7] }],
  [0.85, { two: 1, ...RAISED, bY: -0.04, sw: [-0.2, 2.1], pitch: -0.2 }],
  [1.0, { ...CHOP, e: 'i', bY: -0.42, pitch: 0.3 }],
  [1.6, { ...CHOP, e: 'o', bY: -0.5, pitch: 0.34, sw: [-0.12, -0.9] }],
  [2.0, { settle: true, ...CHOP, bY: -0.4 }],
];
/** One of the transitions: down on one knee, the blade up, then the low sweep all the way round (red). */
const transitionBeat = () => ({
  tell: R, windup: 1.6, fixed: true, active: 0.22, damage: TR.damage, knockback: TR.knockback, knockdown: true,
  zone: { kind: 'ring', r: TR.ringRadius }, ring: TR.ringRadius, part: 'feet', track: 0, close: 0,
  keys: [
    [0.4, { bY: -0.55, pitch: 0.1, yaw: 0.1, spX: 0.12, hdX: 0.35, rH: [0.05, -0.15, 0.3], sw: [0.0, 1.45], swF: [1, 0, 0], lH: [-0.08, -0.12, 0.3], rF: [-0.12, 0.3], lF: [0.15, -0.42], rK: [0, 0, 1], lK: [0.1, -0.8, 0.6] }],
    [0.78, { bY: -0.55, pitch: 0.06, yaw: 0.1, spX: 0.08, hdX: 0.1, rH: [0.05, -0.05, 0.3], sw: [0.0, 1.5], lH: [-0.1, -0.02, 0.28], rF: [-0.12, 0.3], lF: [0.15, -0.42], rK: [0, 0, 1], lK: [0.1, -0.8, 0.6] }],
    ...spinKeys(0.9, true),
  ],
});

/** The Thousand-Body Round with `n` selves: the call, then his own blow after their n cuts. */
export function roundBeats(n) {
  const gap = CP.round;
  // the selves' cuts land `gap` apart and the last `gap` before his own; the first self's windup starts
  // at the call's impact at the soonest (its windup CP.windup), so his blow's windup covers all of it
  const W = Math.max(0.6, gap * n + CP.windup + 0.06);
  return [
    { feint: true, round: true, windup: 0.5, active: 0.08, close: 0, track: 1, keys: callKeys() },
    { tell: B, flare: true, windup: W, fixed: true, active: 0.1, damage: 22, knockback: 1.6, zone: { kind: 'sector', r: 2.3, ang: 0.6 }, close: 2.4, track: 0.85, cock: 0.9, keys: overKeys(0.9) },
  ];
}

// ---------------------------------------------------------------- the moves
// PBZ-fast as Shen Hui (TUNING.flashLead 0.3, the 0.42 s / 0.32 s floors). Phase 3 is no faster than
// phase 2: it asks more (the mantle's tail, the pounce, the black pearl, five selves).
export const MOVES = {
  // ---------------------------------------------------------------- phase 1: the Fox Plays
  /** Fox Bite: a low glide in from mid range and a level cut at its end. */
  foxBite: {
    label: 'Fox Bite', phase: 1, weight: [1.4, 0.9, 0.4], cooldown: 2.5, band: [2.4, 6.5], recovery: 0.5,
    beats: [{
      tell: N, windup: 0.5, active: 0.1, damage: 18, knockback: 1.0, zone: { kind: 'sector', r: 2.2, ang: 1.0 },
      dash: { from: 0.3, to: 0.95, stop: 1.2, max: 4.5 }, close: 0, track: 0.5, keys: slashKeys(GLIDE_R),
    }],
  },

  /** Three Brushstrokes: rising, falling, then a thrust (a parry moment: the blue flare). */
  brushstrokes: {
    label: 'Three Brushstrokes', phase: 1, weight: [2.6, 2.0, 1.4], cooldown: 3.5, band: [0, 3.8], recovery: 0.55,
    beats: [
      cut('rise', N, 0.46, 13),
      cut('back', N, 0.34, 13),
      cut('thrust', B, 0.42, 20, { flare: true }),
    ],
  },

  /** Ladder to the Moon: a leaping two-handed chop (a parry moment; a perfect parry locks the blades). */
  moonLadder: {
    label: 'Ladder to the Moon', phase: 1, weight: [1.4, 1.0, 0.5], cooldown: 3, band: [0, 4.4], recovery: 0.6,
    beats: [{
      tell: B, flare: true, windup: 0.56, active: 0.1, damage: 24, knockback: 1.6, zone: { kind: 'sector', r: 2.3, ang: 0.6 }, lock: true,
      close: 2.8, lift: [[0.35, 0], [0.74, 0.5], [1.0, 0]], keys: overKeys(0.72),
    }],
    recoveryKeys: [[0.5, { ...CHOP, two: 0.4, bY: -0.24, sw: [-0.3, -0.5], rH: [0.0, -0.32, 0.4] }]],
  },

  /** Sweeping Brush: he drops and the blade goes round at the ankles (red: roll through it). */
  sweepingBrush: {
    label: 'Sweeping Brush', phase: 1, weight: [1.0, 0.8, 0.4], cooldown: 6, band: [0, 3.4], recovery: 0.7,
    beats: [spin(R, 0.62, 22, 0, { low: true })],
    recoveryKeys: [[0.4, { ...CROUCH, bY: -0.36, yaw: 0.7, arm: 1, ext: 0.8, sw: [-0.9, -0.3] }]],
  },

  /** Changing Places: as the windup starts he trades places with the self nearest you, and cuts. */
  changingPlaces: {
    label: 'Changing Places', phase: 1, weight: [1.6, 2.2, 2.0], cooldown: 5, band: [3, 12], recovery: 0.55, gapCloser: true,
    beats: [cut('flat', N, 0.6, 18, { swap: true, zone: { kind: 'sector', r: 2.2, ang: 1.0 }, close: 3.0, track: 0.8 })],
  },

  /** Scattered Leaves: paper selves tear off him (no blow). */
  scatter: {
    label: 'Scattered Leaves', phase: 1, weight: [1.5, 1.8, 1.6], cooldown: 9, band: [0, 14], recovery: 0.35, cat: 'spell', densityAs: 1.1,
    beats: [{ feint: true, scatter: true, windup: 0.5, active: 0.1, close: 0, track: 1, keys: scatterKeys() }],
  },

  /** Pearl of the Hollow Moon: a backstep, the Pearl drawn out over the blade (fed by a thread from each
   *  live self), then batted at you: red, a burst where it lands. */
  foxPearl: {
    label: 'Pearl of the Hollow Moon', phase: 1, weight: [1.2, 1.3, 0.9], cooldown: 11, band: [0, 10], recovery: 0.55, cat: 'ranged', clonesFight: true, densityAs: 1.0,
    beats: [
      backstep(1.9),
      { tell: R, windup: PE.charge[0], active: 0.1, damage: PE.damage, knockback: PE.knockback, pearl: 'charge', cast: { kind: 'pearl', selfCue: true }, close: 0, track: 0.9, cock: 0.82, keys: pearlKeys() },
    ],
  },

  /** The Fox's Answer: his counter out of a guard, a thrust. */
  riposte: {
    label: "The Fox's Answer", phase: 1, weight: [0, 0, 0], counter: true, cooldown: 0, band: [0, 5], recovery: 0.55,
    beats: [cut('thrust', B, 0.46, 18)],
  },

  /** Paper Rain: his answer to a streak of guards (DEFENSE.foeStreak): before each cut after the first
   *  he is gone and at another side of you; a raised guard meets them from any side. */
  streakFlurry: {
    label: 'Paper Rain', phase: 1, weight: [0, 0, 0], counter: true, streak: true, cooldown: 0, band: [0, 6], recovery: 0.75,
    beats: [
      cut('diag', N, 0.62, 14, { track: 0.7 }),
      cut('flat', N, 0.48, 14, { flit: { r: 2.6 } }),
      cut('rise', N, 0.48, 14, { flit: { r: 2.6 } }),
      cut('diag', N, 0.48, 14, { flit: { r: 2.6 } }),
    ],
  },

  /** Paper Cut (hidden: never picked): a paper self's blow. Its data and clip are the selves' (clones.js). */
  paperCut: {
    label: 'Paper Cut', phase: 1, weight: [0, 0, 0], hidden: true, cooldown: 0, band: [0, 3], recovery: CP.recover,
    beats: [cut('diag', N, CP.windup, CP.damage, { fixed: true, knockback: CP.knockback, zone: { kind: 'sector', r: 2.1, ang: 0.9 }, close: 0, track: 0.8 })],
  },

  // ---------------------------------------------------------------- phase 2: A Thousand Bodies
  /** Hand to Hand: four cuts; before the second and the last he trades places with a self. */
  relay: {
    label: 'Hand to Hand', phase: 2, weight: [0, 2.6, 2.4], cooldown: 6, band: [0, 4.2], recovery: 0.6,
    beats: [
      cut('rise', N, 0.46, 12),
      cut('flatBack', N, 0.36, 12, { swap: true, close: 2.4 }),
      cut('flat', N, 0.36, 12),
      cut('over', B, 0.44, 20, { flare: true, swap: true, close: 2.4 }),
    ],
  },

  /** The Thousand-Body Round: every live self cuts in turn, then his own blow (a parry moment). The
   *  beats are realised for the live count (realise below: roundBeats(n)); these are five's. */
  foxRing: {
    label: 'The Thousand-Body Round', phase: 2, weight: [0, 1.6, 1.8], cooldown: 12, band: [0, 6], recovery: 0.6, needs: 2, densityAs: 1.4,
    beats: roundBeats(5),
  },

  /** Paper Blades: two fans of three crescents of sword qi. */
  paperBlades: {
    label: 'Paper Blades', phase: 2, weight: [0, 1.0, 0.9], cooldown: 8, band: [6, 15], recovery: 0.55,
    beats: [qi(N, 0.5, 12, 3, 0.36), qi(N, 0.44, 12, 3, 0.36)],
  },

  /** A Thousand Bodies: the phase-2 transition. On one knee, then the low sweep (red); selves to the cap. */
  thousandBodies: {
    label: 'A Thousand Bodies (phase 2)', phase: 2, weight: [0, 0, 0], transition: true, cooldown: 0, band: [0, 99], recovery: 0.7,
    beats: [transitionBeat()],
    recoveryKeys: [[0.4, { ...CROUCH, bY: -0.36, yaw: 0.7, arm: 1, ext: 0.8, sw: [-0.9, -0.3] }]],
  },

  // ---------------------------------------------------------------- phase 3: the Fox-Fire Mantle
  /** Burning Brush: a cut, then the mantle's tail swept round (red, knocks you down). */
  burningBrush: {
    label: 'Burning Brush', phase: 3, weight: [0, 0, 2.2], cooldown: 7, band: [0, 4], recovery: 0.65,
    beats: [
      cut('flat', N, 0.46, 14),
      spin(R, 0.6, 24, 0, { low: true, zone: { kind: 'ring', r: 3.6 }, ring: 3.6, mantle: 'tail' }),
    ],
    recoveryKeys: [[0.4, { ...CROUCH, bY: -0.36, yaw: 0.7, arm: 1, ext: 0.8, sw: [-0.9, -0.3] }]],
  },

  /** Fox-Fire Pounce: a long leap and a driving cut where he lands (red); the wood and grass there catch. */
  foxPounce: {
    label: 'Fox-Fire Pounce', phase: 3, weight: [0, 0, 1.6], cooldown: 8, band: [4, 10], recovery: 0.7, gapCloser: true,
    beats: [{
      tell: R, windup: 0.66, active: 0.12, damage: 28, knockback: 2.4, zone: { kind: 'line', r: 2.4, w: 1.0 }, mantle: 'pounce',
      dash: { from: 0.3, to: 0.97, stop: 1.2, max: 9 }, close: 0, lift: [[0.3, 0], [0.7, 1.3], [1.0, 0]], track: 0.6,
      keys: slashKeys({ from: [-0.7, 1.45], through: [0.0, -0.1], to: [0.5, -1.0], yaw: [0.2, 0.45, 0.6], cock: 0.72, sink: 0.06 }),
    }],
  },

  /** Moon-Swallowing Pearl: the Pearl gone dark over his head, a leap down on you (black: dodge it). */
  greatPearl: {
    label: 'Moon-Swallowing Pearl', phase: 3, weight: [0, 0, 0.9], cooldown: 14, band: [2.4, 9], recovery: 0.8,
    beats: [{
      tell: K, windup: 1.5, fixed: true, hold: [0.1, 0.5], cock: 0.85, active: 0.14, damage: 44, knockback: 3, knockdown: true,
      zone: { kind: 'ring', r: 3.4 }, ring: 3.4, part: 'tip', close: 0, track: 0.9, leap: { from: 0.55, lock: 0.85, apex: 3.2 }, pearl: 'great',
      keys: greatKeys(),
    }],
    recoveryKeys: [[0.5, { ...CHOP, two: 0.4, bY: -0.3, sw: [-0.3, -0.5], rH: [0.0, -0.32, 0.4] }]],
  },

  /** The Fox-Fire Mantle: the phase-3 transition. His selves burn up into him, the mantle lights, the
   *  low sweep (red); then selves to the cap. */
  foxMantle: {
    label: 'The Fox-Fire Mantle (phase 3)', phase: 3, weight: [0, 0, 0], transition: true, cooldown: 0, band: [0, 99], recovery: 0.7,
    beats: [transitionBeat()],
    recoveryKeys: [[0.4, { ...CROUCH, bY: -0.36, yaw: 0.7, arm: 1, ext: 0.8, sw: [-0.9, -0.3] }]],
  },
};
export const MOVE_NAMES = Object.keys(MOVES);
/** The scripted move that begins each later phase. */
export const TRANSITIONS = Object.freeze({ 2: 'thousandBodies', 3: 'foxMantle' });


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
const realiser = (M) => makeRealise({ TUNING, MOVES: M, compileClip: (keys, dur) => compileClip(keys, dur), completeBeat });
const base = realiser(MOVES);
// the Round realised for each live count (its own windup per count; FoxBrain.startAct passes `opts.selves`)
const ROUNDS = {};
for (let n = 2; n <= TUNING.clones.pool; n++) ROUNDS[n] = realiser({ foxRing: { ...MOVES.foxRing, beats: roundBeats(n) } });

/** A move as it will play this time (duelist/realise.js). The Round is realised for the selves alive
 *  as it starts (`opts.selves`). */
export function realise(name, phase = 1, rnd = Math.random, opts = null) {
  if (name === 'foxRing') {
    const n = Math.max(2, Math.min(TUNING.clones.pool, Math.round(Number(opts?.selves) || TUNING.clones.pool)));
    return ROUNDS[n](name, phase, rnd, opts);
  }
  return base(name, phase, rnd, opts);
}

/** The guard pose (for tools). */
export { GUARD };
