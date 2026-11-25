// The hero's idles (ADR-186; the owner, 2026-11-24: "several idle positions instead of having the same
// holding his left hand on his hip all the time. i want him to move both his arms around naturally and
// doing cool sword tricks during idle"; asked, they picked: mostly natural habits that move BOTH arms,
// a flashy trick every few cycles; both stances, the fight one tighter with the hand off the belt).
//
// Three layers over the two stances (stances.js; anim.js stand()):
//
//   RESTS    where his arms are when he does nothing. At ease he moves between a few (EASE_RESTS: the
//            free arm hanging loose, the sword fingers low by the hip, a hand holding the cloak at the
//            chest, the hand on the belt as before; the sword arm always the at-ease stance's), one every
//            IDLES.restHold s, a slow change of IDLES.restMove s. In the fight the fencer's guard
//            keeps its legs, its body and its blade, and the free hand comes OFF the belt to one of
//            FIGHT_RESTS (the sword fingers pointing at the foe, up beside the face, a guard hand
//            before the chest, floating low by the hip), changed more often and faster.
//   HABITS   the idle actions (anim.js FIDGETS's machinery, HeroAnimator._idleLife): small things
//            with both arms (re-grip, roll the shoulders, flex the free hand, brush the coat, ...).
//   TRICKS   every IDLES.trickEvery actions at ease: a wrist spin, a figure-eight, the salute (the
//            blade upright before his face, palm over fist), a flick of the blade clean (chiburi); and
//            three SPELLS drawn in the sword's green flame (the rite, the sigil, the breath).
//            Never in a fight: there only HABITS that stay in the guard (FIGHT_ACTS).
//
// `?idles=old` keeps the idles before this pass (the belt, anim.js FIDGETS): setIdles() / the Lab.
//
// Pose space as stances.js: body axes (x his left, y up, z ahead); hand targets are offsets from each
// shoulder. Every function here writes a pose (anim.js P) and never allocates or throws. Its randomness
// is the idles' own stream on the animator (A.idleNoise), never Math.random, never the animator's `noise` (which picks
// an attack's look: an idle action drawing on it shifted the blows after it).
import { TAU, clamp, lerp, smoothstep } from '../../core/math.js';
// (function declarations: safe through the anim.js <-> idles.js import cycle, read at call time only)
import { dirLerp, kf } from './anim.js';
import { onTheBelt, standLife } from './stances.js';
import { DIM } from './heroDims.js';

const DEG = Math.PI / 180;
// a sword-hand offset → the same point as a free-hand offset (x): the two shoulders' spacing (anim.js's own)
const LEFT_FROM_RIGHT = -(DIM.shoulder[0] + DIM.gripShoulder[0]);

// ---------------------------------------------------------------- the switch
const IDS = ['new', 'old'];
export const IDLES_IDS = Object.freeze(IDS.slice());
export const IDLES_NAMES = Object.freeze({ new: 'rests, habits and tricks (ADR-186)', old: 'the hand on the belt (before)' });
const q = (name) => {
  try {
    return typeof location !== 'undefined' ? new URLSearchParams(location.search).get(name) : null;
  } catch {
    return null;
  }
};
const PICK = { mode: q('idles') === 'old' ? 'old' : 'new' };
/** The idles drawn now: 'new' (this file) or 'old' (the belt and the idle actions before). */
export const idlesMode = () => PICK.mode;
export const idlesOld = () => PICK.mode === 'old';
/** Lab / tests: switch live. Returns the id now set. */
export function setIdles(id) {
  PICK.mode = String(id) === 'old' ? 'old' : 'new';
  return PICK.mode;
}

// ---------------------------------------------------------------- tuning (content is data)
export const IDLES = {
  // at ease: how long he stays in a rest (s, a range drawn with the noise) and how long the change takes
  restHold: [7, 12],
  restMove: 1.3,
  // in the fight: the guard hand changes more often, and quicker
  guardHold: [4, 7],
  guardMove: 0.75,
  // a trick every this many actions at ease (a range: 3 or 4)
  trickEvery: [3, 4],
  // the gaps between actions (s): at ease (IDLE_LIFE's own is 2.0-4.5), and in the fight
  gapEase: [1.4, 3.2],
  gapFight: [1.6, 3.6],
  // standing still this long (s) before the first action: at ease, in the fight
  afterEase: 2.0,
  afterFight: 1.2,
  // a cut (he moves) takes an action that swings the blade off in this long (s; the others: IDLE_LIFE.cancel)
  cancelBlade: 0.26,
  // a block, a drink or a charge out of such an action brings the blade home over at least this (s; anim.js)
  cutFade: 0.24,
};

// ---------------------------------------------------------------- small helpers (no allocation)
function set3(p, i, x, y, z) {
  p[i] = x;
  p[i + 1] = y;
  p[i + 2] = z;
}
function to3(p, i, x, y, z, t) {
  if (!(t > 0)) return;
  p[i] += (x - p[i]) * t;
  p[i + 1] += (y - p[i + 1]) * t;
  p[i + 2] += (z - p[i + 2]) * t;
}
// the way round an action's blade takes from the rest (dirLerp's memory): kept through the action, so a
// target that circles past the far side of the rest's blade (a spin) never flips the sweep the other way
const ACT = { d: 0, ok: false };
/** anim.js, as an idle action starts: its blade sweeps afresh. */
export function actStart() {
  ACT.ok = false;
}
/** Turn the blade toward the unit vector at azimuth az (0 ahead, + his left) and elevation el (degrees) by t. */
function aimTo(p, i, az, el, t) {
  if (!(t > 0)) return;
  const a = az * DEG, e = el * DEG, c = Math.cos(e);
  dirLerp(p, i, p[i], p[i + 1], p[i + 2], c * Math.sin(a), Math.sin(e), c * Math.cos(a), Math.min(1, t), ACT);
}
/** p[i..i+2] = the unit vector at az / el (degrees), times `len`. */
function dir(p, i, az, el, len = 1) {
  const a = az * DEG, e = el * DEG, c = Math.cos(e);
  p[i] = c * Math.sin(a) * len;
  p[i + 1] = Math.sin(e) * len;
  p[i + 2] = c * Math.cos(a) * len;
}
/** A free-hand offset (x, y, z, as the chest stands at ease) turned by the chest's yaw (the hand
 *  belongs to the body, which turns with it), toward by t. */
function freeTo(p, i, x, y, z, yaw, t) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  to3(p, i, x * c + z * s, y, -x * s + z * c, t);
}
/** The flat's normal p[swF] about the blade p[swD], at angle a from its upward-facing side, toward by w. */
function flatAt(p, P, a, w) {
  if (!(w > 0)) return;
  let bx = p[P.swD], by = p[P.swD + 1], bz = p[P.swD + 2];
  const bl = Math.hypot(bx, by, bz) || 1;
  bx /= bl;
  by /= bl;
  bz /= bl;
  // up, square to the blade (or ahead, for an upright blade)
  let ux = -by * bx, uy = 1 - by * by, uz = -by * bz;
  let ul = Math.hypot(ux, uy, uz);
  if (ul < 1e-3) {
    ux = -bz * bx;
    uy = -bz * by;
    uz = 1 - bz * bz;
    ul = Math.hypot(ux, uy, uz) || 1;
  }
  ux /= ul;
  uy /= ul;
  uz /= ul;
  // the side: blade × up
  const sx = by * uz - bz * uy, sy = bz * ux - bx * uz, sz = bx * uy - by * ux;
  const c = Math.cos(a), s = Math.sin(a);
  to3(p, P.swF, ux * c + sx * s, uy * c + sy * s, uz * c + sz * s, Math.min(1, w));
}
const sn = (t, per, ph = 0) => Math.sin((t * TAU) / per + ph);
/** A 0..1 bump between a and d, up over a..b, held, down over c..d. */
const bump = (u, a, b, c, d) => smoothstep(a, b, u) * (1 - smoothstep(c, d, u));

// ---------------------------------------------------------------- the free hand's shapes
/** The free hand hanging loose: fingers down, the palm toward the thigh (body axes, length = weight). */
function looseHand(p, P, yaw, t) {
  freeTo(p, P.lD, 0.06, -0.97, 0.2, yaw, t * 0.85);
  freeTo(p, P.lN, -0.92, -0.05, 0.25, yaw, t * 0.85);
  p[P.hs] += (0 - p[P.hs]) * t;
}

// ---------------------------------------------------------------- RESTS
// Each writes the arms (both of them) over the stance's pose. `m` = the stance's oscillators
// (standLife), A = the animator (its time). They are layered, never summed: a change between two is a
// blend of the two finished poses (restBlend).

/** Loose: the sword arm as the stance has it, the free arm hanging beside the thigh, the hand open and
 *  heavy, swinging a little with the weight. */
function restLoose(p, P, A, m) {
  const yaw = p[P.pelvY] + p[P.spY], t = A.time;
  p[P.bodyX] += 0.014; // the weight a little more on the left leg than with the hand on the belt
  freeTo(p, P.lH, 0.035 + 0.004 * m.sw, -0.5 + 0.01 * m.brL, 0.035 + 0.016 * sn(t, 3.3, 0.5), yaw, 1);
  set3(p, P.lP, 0.35, -0.2, -0.9);
  looseHand(p, P, yaw, 1);
  p[P.lk] = 0;
  p[P.twoHand] = 0;
  p[P.offAt] = 0;
}

/** Sword fingers: the free hand low by the left hip in the sword fingers, pointing ahead and down (the
 *  jian's rest, the ready stance's own before ADR-114: guard()), the weight on the right leg, the eyes a
 *  little down and to his left. */
function restFingers(p, P, A, m) {
  const yaw = p[P.pelvY] + p[P.spY], t = A.time;
  freeTo(p, P.lH, 0.06 + 0.005 * m.sw, -0.49 + 0.01 * m.brL, 0.07 + 0.01 * sn(t, 4.1, 0.7), yaw, 1);
  set3(p, P.lP, 0.36, -0.2, -0.9);
  p[P.hs] = 1;
  freeTo(p, P.lD, 0.2, -0.77, 0.6, yaw, 0.85);
  freeTo(p, P.lN, -0.35, -0.6, -0.72, yaw, 0.85);
  p[P.lk] = 0;
  p[P.twoHand] = 0;
  p[P.offAt] = 0;
  p[P.bodyX] -= 0.008;
  p[P.hdX] += 0.06;
  p[P.hdY] += 0.08;
}

/** The cloak: the free hand up at the cloak's edge before his left breast, as a man holds his coat
 *  closed in the wind; the elbow down at his side. The weight even, the head a little tilted. */
function restCloak(p, P, A, m) {
  const yaw = p[P.pelvY] + p[P.spY];
  freeTo(p, P.lH, -0.05 + 0.004 * m.sw, -0.21 + 0.008 * m.brL, 0.17, yaw, 1);
  set3(p, P.lP, 0.35, -0.9, -0.2);
  p[P.hs] = 0;
  // the fingers up and in along the cloak's edge, the palm on it
  freeTo(p, P.lD, -0.35, 0.85, 0.2, yaw, 0.85);
  freeTo(p, P.lN, -0.15, 0.05, -0.98, yaw, 0.85);
  p[P.lk] = 0;
  p[P.twoHand] = 0;
  p[P.offAt] = 0;
  p[P.bodyX] += 0.01;
  p[P.hdZ] += 0.05;
}

/** The belt: the free hand on the belt as before this pass (stances.js), one rest among the others. */
function restBelt(p, P, A, m) {
  onTheBelt(p, P, m, p[P.pelvY] + p[P.spY]);
}

/** name, the pose, how often it is picked (relative); `low`: an action that swings the blade (`blade`
 *  below) may start from it. Every rest keeps the sword arm the owner picked for the at-ease stance
 *  (ADR-114: the blade on the forearm's line, out at his front-right where the game camera sees it); only
 *  the free arm, the weight and the head change. (The owner turned down rests that moved the sword: both
 *  hands on the hilt before him hid the blade from the game camera and turned the wrist; the blade
 *  trailing behind him bent the wrist 50-60°; carried on the shoulder, the elbow at the fold limit.) */
export const EASE_RESTS = [
  { name: 'loose', fn: restLoose, w: 3, low: true },
  { name: 'fingers', fn: restFingers, w: 2.5, low: true },
  { name: 'cloak', fn: restCloak, w: 2, low: true },
  { name: 'belt', fn: restBelt, w: 1.5, low: true },
];

// the fight: the sword arm and the blade stay the guard's (stances.js fencerGuard); the free hand only
/** The sword fingers out toward the foe at the height of his chest, the elbow soft. */
function guardPoint(p, P, A, m) {
  set3(p, P.lH, -0.02 + 0.006 * m.sw, -0.16 + 0.01 * m.brL, 0.38 + 0.01 * m.tipB);
  set3(p, P.lP, 0.55, -0.8, -0.2);
  p[P.hs] = 1;
  dir(p, P.lD, -6, 4, 0.9);
  set3(p, P.lN, -0.35, -0.85, 0);
}
/** The sword fingers up beside his face, pointing on past the blade at the foe. (Raised over his head,
 *  the free arm whipped down 0.4 m a frame into a block or a charge.) */
function guardEye(p, P, A, m) {
  set3(p, P.lH, 0.02 + 0.005 * m.sw, 0.0 + 0.008 * m.brL, 0.25 + 0.008 * m.tipA);
  set3(p, P.lP, 0.9, -0.45, -0.2);
  p[P.hs] = 1;
  dir(p, P.lD, -8, 14, 0.9);
  set3(p, P.lN, -0.3, -0.9, 0.1);
}
/** An open guard hand before the chest, fingers up, the palm turned in. */
function guardHand(p, P, A, m) {
  set3(p, P.lH, -0.1 + 0.006 * m.sw, -0.22 + 0.01 * m.brL, 0.28 + 0.008 * m.tipB);
  set3(p, P.lP, 0.75, -0.6, -0.3);
  p[P.hs] = 0;
  dir(p, P.lD, -10, 62, 0.85);
  set3(p, P.lN, -0.75, 0.1, 0.55);
}
/** The hand floating low by the left hip, ahead of it, the sword fingers down toward the foe's feet. */
function guardLow(p, P, A, m) {
  const t = A.time;
  set3(p, P.lH, 0.04 + 0.006 * m.sw, -0.42 + 0.01 * m.brL, 0.14 + 0.012 * sn(t, 2.9));
  set3(p, P.lP, 0.6, -0.3, -0.75);
  p[P.hs] = 1;
  dir(p, P.lD, 2, -38, 0.85);
  set3(p, P.lN, -0.55, -0.6, -0.3);
}
export const FIGHT_RESTS = [
  { name: 'point', fn: guardPoint, w: 3 },
  { name: 'eye', fn: guardEye, w: 1.5 },
  { name: 'hand', fn: guardHand, w: 2 },
  { name: 'low', fn: guardLow, w: 2 },
];

// ---------------------------------------------------------------- the rest state
/** A rest state on the animator (A.rests): at ease and in the fight, each { a, b, u, hold } (from rest
 *  a toward b, u 0..1 of the change; hold: s left in it). */
export function newRests() {
  return { ease: { a: 0, b: 0, u: 1, hold: IDLES.restHold[0], mem: { d: 0, ok: false } }, fight: { a: 0, b: 0, u: 1, hold: IDLES.guardHold[0], mem: { d: 0, ok: false } } };
}
function pickRest(list, not, noise) {
  let sum = 0;
  for (let i = 0; i < list.length; i++) if (i !== not) sum += list[i].w;
  let r = noise() * sum;
  for (let i = 0; i < list.length; i++) {
    if (i === not) continue;
    r -= list[i].w;
    if (r <= 0) return i;
  }
  return not === 0 ? 1 : 0;
}
/** Advance a rest state. `still`: standing still in this stance (the hold runs down); `free`: and no
 *  action playing (a change starts only then); a change under way always finishes (slow and small). */
function tickRest(S, list, dt, still, free, hold, move, noise) {
  if (S.u < 1) {
    S.u = Math.min(1, S.u + dt / move);
    if (S.u >= 1) S.a = S.b;
    return;
  }
  if (!still) return;
  S.hold -= dt;
  if (S.hold > 0 || !free) return;
  S.b = pickRest(list, S.a, noise);
  S.u = 0;
  S.mem.ok = false;
  S.hold = lerp(hold[0], hold[1], noise());
}
/** HeroAnimator._idleLife: both rest states, every frame. pool: 1 standing still at ease, 2 in the guard
 *  (anim.js); free: no idle action playing. */
export function tickRests(A, dt, pool, free) {
  const R = A.rests;
  if (!R) return;
  const n = A.idleNoise;
  tickRest(R.ease, EASE_RESTS, dt, pool === 1, free, IDLES.restHold, IDLES.restMove, n);
  tickRest(R.fight, FIGHT_RESTS, dt, pool === 2, free, IDLES.guardHold, IDLES.guardMove, n);
}
/** The rest's name now (the one he is moving to during a change). */
export function restName(A, fight) {
  const S = fight ? A.rests?.fight : A.rests?.ease;
  if (!S) return '';
  return (fight ? FIGHT_RESTS : EASE_RESTS)[S.u < 1 ? S.b : S.a]?.name ?? '';
}

// ---------------------------------------------------------------- writing a rest
const SCR = new Float32Array(64);
const SW = { d: 0, ok: false }; // (dirLerp's memory is a fade's: a rest change keeps the way it took)
function restBlend(p, P, A, S, list) {
  const m = standLife(A.time, A.fightW > 0.5 ? 1 : 0);
  const a = list[S.a] ?? list[0], b = list[S.b] ?? list[0];
  if (S.u >= 1 || S.a === S.b) {
    a.fn(p, P, A, m);
    return;
  }
  const n = p.length;
  for (let i = 0; i < n; i++) SCR[i] = p[i];
  a.fn(p, P, A, m);
  b.fn(SCR, P, A, m);
  // (smootherstep: no speed at either end of the change)
  const x = S.u, k = x * x * x * (x * (6 * x - 15) + 10);
  const ax = p[P.swD], ay = p[P.swD + 1], az = p[P.swD + 2];
  for (let i = 0; i < n; i++) p[i] += (SCR[i] - p[i]) * k;
  dirLerp(p, P.swD, ax, ay, az, SCR[P.swD], SCR[P.swD + 1], SCR[P.swD + 2], k, S.mem);
}
/** stand(): the at-ease rest's arms over atEase (stances.js). */
export function easeArms(p, P, A) {
  if (A.rests) restBlend(p, P, A, A.rests.ease, EASE_RESTS);
}
/** stand(): the fight's free hand over fencerGuard (stances.js): off the belt. */
export function guardArms(p, P, A) {
  if (!A.rests) return;
  restBlend(p, P, A, A.rests.fight, FIGHT_RESTS);
  p[P.lk] = 0;
  p[P.twoHand] = 0;
  p[P.offAt] = 0;
}

// ---------------------------------------------------------------- HABITS at ease (both arms)
// fn(p, P, A, u, e): u = the action's own 0..1, e = its weight (the envelope). Written over the rest.

/** Re-grip: where the blade hangs, the sword hand eases and closes again round the grip, the blade
 *  turning a quarter in it and dipping a little through the fingers; the free hand shakes itself loose at
 *  his side; he glances down at the hilt. (Brought before him with both hands on it, the blade was hidden
 *  from the game camera and the sword wrist turned.) */
function actRegrip(p, P, A, u, e) {
  const yaw = p[P.pelvY] + p[P.spY];
  const ease = kf(u, [0.15, 0, 0.3, 1, 0.45, 1, 0.6, 0]); // the grip loosens …
  const turn = kf(u, [0.25, 0, 0.42, 1, 0.62, 1, 0.75, 0]); // … the blade turns in it …
  p[P.rH + 1] -= 0.025 * ease * e; // … and drops a little through the fingers
  p[P.swD + 1] -= 0.06 * ease * e;
  flatAt(p, P, 0.9 * turn, e);
  // the free hand shakes out: open, a flick of the fingers, open
  const sh = bump(u, 0.2, 0.3, 0.7, 0.8) * e;
  freeTo(p, P.lH, 0.05, -0.47, 0.07, yaw, sh);
  p[P.hs] += (kf(u, [0.3, 0, 0.4, 1, 0.48, 0, 0.56, 1, 0.64, 0]) - p[P.hs]) * sh;
  p[P.lk] *= 1 - sh;
  p[P.hdX] += 0.14 * ease * e;
  p[P.hdY] -= 0.18 * ease * e;
}

/** The shoulders: both roll back in turn (the hands circle with them), then the head leans to one
 *  side and the other. */
function actShoulders(p, P, A, u, e) {
  const yaw = p[P.pelvY] + p[P.spY];
  const rl = bump(u, 0.04, 0.14, 0.5, 0.6) * e;
  const aL = TAU * clamp((u - 0.08) / 0.4, 0, 1), aR = TAU * clamp((u - 0.16) / 0.4, 0, 1);
  freeTo(p, P.lH, 0.06 + 0.025 * Math.sin(aL), -0.44 + 0.06 * (1 - Math.cos(aL)), 0.02 - 0.05 * Math.sin(aL), yaw, rl);
  p[P.hs] += (0 - p[P.hs]) * rl;
  p[P.lk] *= 1 - rl;
  p[P.rH + 1] += 0.05 * (1 - Math.cos(aR)) * rl;
  p[P.rH + 2] -= 0.04 * Math.sin(aR) * rl;
  p[P.spZ] += 0.04 * (Math.sin(aL) - Math.sin(aR)) * rl;
  p[P.spX] -= 0.05 * Math.sin(Math.PI * clamp((u - 0.08) / 0.48, 0, 1)) * e;
  p[P.hdZ] += kf(u, [0.58, 0, 0.67, 0.36, 0.73, 0.36, 0.83, -0.32, 0.89, -0.32, 0.97, 0]) * e;
}

/** Flex: the free hand comes up before his chest, opens, closes into the sword fingers and opens again,
 *  the wrist turning; the sword arm lets the point drift out to his right. He watches the hand. */
function actFlex(p, P, A, u, e) {
  const yaw = p[P.pelvY] + p[P.spY];
  const up = bump(u, 0.05, 0.22, 0.74, 0.92) * e;
  freeTo(p, P.lH, -0.06, -0.24, 0.26, yaw, up);
  to3(p, P.lP, 0.7, -0.7, -0.2, up);
  p[P.lk] *= 1 - up;
  const shut = kf(u, [0.25, 0, 0.33, 1, 0.43, 1, 0.5, 0, 0.58, 0, 0.64, 1, 0.74, 1, 0.8, 0]);
  p[P.hs] += (shut - p[P.hs]) * up;
  const tw = kf(u, [0.22, 0, 0.4, 1, 0.6, -0.6, 0.78, 0]);
  freeTo(p, P.lD, -0.25, 0.75, 0.6, yaw, up);
  freeTo(p, P.lN, -0.9 * Math.cos(tw), 0.3 * Math.sin(tw), 0.6 * Math.sin(tw) - 0.25, yaw, up);
  p[P.hdY] += 0.3 * up;
  p[P.hdX] += 0.22 * up;
}

/** Brush the coat: the free hand sweeps twice down the front of the coat by the left thigh (dust off),
 *  head down; the sword arm keeps the rest's blade. */
function actBrush(p, P, A, u, e) {
  const yaw = p[P.pelvY] + p[P.spY];
  const on = bump(u, 0.06, 0.2, 0.8, 0.94) * e;
  // two strokes: down fast, up slow
  const s = kf(u, [0.2, 0, 0.32, 1, 0.42, 0.15, 0.54, 1, 0.66, 0.2, 0.8, 0.2]);
  freeTo(p, P.lH, -0.05, lerp(-0.3, -0.46, s), 0.13, yaw, on);
  to3(p, P.lP, 0.6, -0.4, -0.7, on);
  p[P.lk] *= 1 - on;
  p[P.hs] += (0 - p[P.hs]) * on;
  freeTo(p, P.lD, -0.1, -0.85, 0.5, yaw, on);
  freeTo(p, P.lN, 0.1, -0.3, -0.95, yaw, on);
  p[P.hdX] += 0.32 * on;
  p[P.hdY] += 0.18 * on;
  p[P.spX] += 0.07 * on;
}

/** `blade`: it swings the blade from the rest's (it starts only from a `low` rest). */
export const EASE_HABITS = [
  { name: 'regrip', dur: 2.6, fn: actRegrip, blade: true },
  { name: 'shoulders', dur: 3.2, fn: actShoulders },
  { name: 'flex', dur: 2.8, fn: actFlex },
  { name: 'brush', dur: 2.6, fn: actBrush },
];

// ---------------------------------------------------------------- TRICKS at ease
/** The wrist spin: the hand comes out beside him and the blade turns two full circles in the plane
 *  at his right side (the point forward, up, back, down), quick in the middle, and settles. */
// (the plane leans out 46°: at 33° its high back quarter sat at 140° round from ahead, and a block
// taken there swung the blade the short way, behind his head, through the wrist's limit)
const SPIN_X = -0.72;
function trickSpin(p, P, A, u, e) {
  to3(p, P.rH, -0.23, -0.34, 0.16, e);
  to3(p, P.rP, 0.2, -0.6, -0.8, e);
  const lf = bump(u, 0.05, 0.2, 0.8, 0.95) * e;
  const yaw = p[P.pelvY] + p[P.spY];
  freeTo(p, P.lH, 0.08, -0.45, 0.05, yaw, lf * 0.6); // the free arm a little out: balance
  p[P.lk] *= 1 - e;
  p[P.twoHand] *= 1 - e;
  const s = smoothstep(0.14, 0.86, u);
  if (s <= 0 || s >= 1) return;
  const c = Math.sqrt(1 - SPIN_X * SPIN_X);
  const a = Math.atan2(0.12, 0.79) + 2 * TAU * s;
  const w = e * bump(s, 0, 0.06, 0.94, 1); // (into the circle and out of it without a corner)
  dirLerp(p, P.swD, p[P.swD], p[P.swD + 1], p[P.swD + 2], SPIN_X, -Math.cos(a) * c, Math.sin(a) * c, w, ACT);
  to3(p, P.swF, -1, 0, 0, w);
  p[P.hdY] -= 0.22 * e;
  p[P.hdX] += 0.14 * e;
}

/** The figure-eight: the arm out before him, the point draws an 8 lying on its side ahead of him
 *  twice, the wrist rolling the flat through each loop. The blade never points back at him. */
function trickEight(p, P, A, u, e) {
  const s = smoothstep(0.14, 0.86, u), ph = TAU * 2 * s;
  const w = e * bump(s, 0, 0.08, 0.92, 1);
  to3(p, P.rH, -0.17 - 0.05 * Math.sin(ph) * w, -0.24 + 0.03 * Math.sin(2 * ph) * w, 0.3, e);
  to3(p, P.rP, 0.1, -0.9, -0.4, e);
  // (out to his right and up: in front of him the game camera behind him never saw it)
  const az = -42 + 48 * Math.sin(ph), el = 18 + 34 * Math.sin(2 * ph);
  aimTo(p, P.swD, lerp(-45, az, w), lerp(-10, el, w), e);
  flatAt(p, P, 1.57 + 1.3 * Math.cos(ph), w);
  const yaw = p[P.pelvY] + p[P.spY];
  const lf = bump(u, 0.05, 0.2, 0.8, 0.95) * e;
  freeTo(p, P.lH, 0.1, -0.42, -0.02, yaw, lf * 0.7); // the free hand back out of the blade's way
  p[P.hs] += (1 - p[P.hs]) * lf;
  p[P.lk] *= 1 - e;
  p[P.twoHand] *= 1 - e;
  p[P.hdX] += 0.08 * e;
  p[P.spY] += 0.06 * Math.sin(ph) * w;
}

/** The salute: the sword hand comes up before his chest with the blade upright before his face, the
 *  free palm laid over the sword fist (the open hand over the fist), a short bow of the head; then the
 *  blade opens down and out to his right in one quick arc and he lets it back to rest. (It took the place
 *  of a pass behind his back: the sword is the right hand's alone (anim.js apply()), and from behind his
 *  back a block's or a charge's own entry turned the blade past the wrist's limit, a 1.5 m jump.) */
function trickSalute(p, P, A, u, e) {
  const up = smoothstep(0.06, 0.3, u), open = smoothstep(0.62, 0.74, u), home = smoothstep(0.76, 0.95, u);
  const k = up * (1 - open);
  // the fist before the breastbone, then out to his right with the arc
  // (a hand right of his breastbone: the upright blade stands before his right cheek, his face clear of it)
  const hx = lerp(lerp(-0.15, 0.05, up), -0.26, open), hy = lerp(lerp(-0.44, -0.2, up), -0.38, open), hz = lerp(lerp(0.08, 0.26, up), 0.2, open);
  to3(p, P.rH, hx, hy, hz, e * (1 - home));
  to3(p, P.rP, lerp(0.6, 0.4, open), -0.75, lerp(-0.55, -0.65, open), e * (1 - home));
  // upright (a little forward of plumb), then the arc down and out
  aimTo(p, P.swD, lerp(lerp(-40, -6, up), -72, open), lerp(lerp(-40, 80, up), -40, open), e * (1 - home));
  flatAt(p, P, lerp(1.57, 0.3, open), e * (1 - home));
  // the free palm over the fist (anim.js lays the open hand on the sword wrist: lk)
  const on = bump(u, 0.18, 0.3, 0.58, 0.66) * e;
  const yaw = p[P.pelvY] + p[P.spY];
  freeTo(p, P.lH, -0.27, -0.22, 0.28, yaw, on);
  p[P.lk] = Math.max(p[P.lk] * (1 - e), on);
  p[P.hs] += (0 - p[P.hs]) * on;
  p[P.twoHand] *= 1 - e;
  // the bow, a beat after the hands meet, and the eyes up again for the arc
  const bow = bump(u, 0.36, 0.44, 0.52, 0.6);
  p[P.hdX] += (0.24 * bow - 0.05 * k) * e;
  p[P.spX] += 0.06 * bow * e;
  p[P.hdY] -= 0.25 * open * (1 - home) * e;
}

/** The flick (chiburi): the blade comes up before him, snaps down and out to his right to throw the
 *  blood off it, holds, then the free hand comes to the hilt and he sets it back to rest. */
function trickFlick(p, P, A, u, e) {
  const up = smoothstep(0.08, 0.34, u), snap = smoothstep(0.38, 0.45, u), back = smoothstep(0.62, 0.86, u);
  const hx = lerp(lerp(-0.12, -0.05, up), -0.3, snap), hy = lerp(lerp(-0.42, -0.12, up), -0.4, snap), hz = lerp(lerp(0.1, 0.3, up), 0.18, snap);
  to3(p, P.rH, hx, hy, hz, e);
  to3(p, P.rP, lerp(0.1, 0.45, snap), -0.75, lerp(-0.5, -0.7, snap), e);
  const az = lerp(lerp(-40, -8, up), -75, snap), el = lerp(lerp(-40, 48, up), -42, snap);
  aimTo(p, P.swD, az, el, e * (1 - back));
  flatAt(p, P, lerp(0.3, 1.5, snap), e * (1 - back));
  // the free hand to the hilt after the snap, and away
  const on = bump(u, 0.5, 0.6, 0.78, 0.9) * e;
  p[P.twoHand] = Math.max(p[P.twoHand] * (1 - e), on);
  p[P.offAt] = 0;
  p[P.lk] *= 1 - e;
  p[P.hdY] -= 0.2 * snap * (1 - back) * e;
  p[P.spY] -= 0.12 * snap * (1 - back) * e;
  p[P.bodyY] -= 0.025 * snap * (1 - back) * e;
}

// ---------------------------------------------------------------- SPELLS at ease (ADR-186, the owner: "casting
// some kind of cool subtle spell with his swords, to make the player curious about the true power of the
// sword"). The motion here; what they draw is the sword's own green flame (swordMystic.js), which reads
// `anim.spell` = { kind, u, w } (anim.js _idleLife): the action's name, its 0..1 and its weight. With
// `?mystic=0` they are the motion alone.

/** The rite: the blade raised upright beside his right shoulder, the free hand's sword fingers laid on
 *  the flat at the guard and drawn slowly up it toward the point; the flame swells behind them, and at the
 *  point a few marks lift off like embers. His eyes follow the fingers. */
function spellRite(p, P, A, u, e) {
  // (raised as the salute raises it: the blade turns up WITH the hand, from the hanging line through ahead
  // of him; turned toward its end from the start, the wrist hit its limit half way and the steel flipped)
  const up = smoothstep(0.04, 0.22, u), dn = smoothstep(0.82, 0.97, u), w = e * (1 - dn);
  to3(p, P.rH, lerp(-0.15, -0.06, up), lerp(-0.44, -0.18, up), lerp(0.08, 0.26, up), w);
  to3(p, P.rP, lerp(0.6, 0.45, up), -0.75, lerp(-0.55, -0.5, up), w);
  aimTo(p, P.swD, lerp(-40, -24, up), lerp(-40, 74, up), w);
  flatAt(p, P, 1.57, w * up);
  // the sword fingers from the guard (0.14 m up the blade) to two thirds of it, then off
  const on = bump(u, 0.24, 0.34, 0.72, 0.8) * e;
  const d = lerp(0.14, 0.62, smoothstep(0.34, 0.72, u));
  const bl = Math.hypot(p[P.swD], p[P.swD + 1], p[P.swD + 2]) || 1;
  const bx = p[P.swD] / bl, by = p[P.swD + 1] / bl, bz = p[P.swD + 2] / bl;
  to3(p, P.lH, p[P.rH] + bx * d + LEFT_FROM_RIGHT + 0.03, p[P.rH + 1] + by * d, p[P.rH + 2] + bz * d + 0.05, on);
  to3(p, P.lP, 0.7, -0.7, -0.2, on);
  p[P.hs] += (1 - p[P.hs]) * on;
  to3(p, P.lD, bx, by, bz, on);
  to3(p, P.lN, -p[P.swF], -p[P.swF + 1], -p[P.swF + 2], on);
  p[P.lk] *= 1 - e;
  p[P.twoHand] *= 1 - e;
  // the eyes on the fingers as they climb
  p[P.hdY] -= 0.3 * w;
  p[P.hdX] -= lerp(0.0, 0.2, smoothstep(0.34, 0.72, u)) * w;
  p[P.spX] -= 0.03 * w;
}

/** The sigil: the point lowered to the grass ahead of his right foot, the head bowed; the wrist turns
 *  the point in a small slow circle, and round him a ring of faint marks writes itself on the ground,
 *  holds, and lifts away. */
function spellSigil(p, P, A, u, e) {
  const dn = bump(u, 0.04, 0.2, 0.8, 0.96);
  const w = e * dn;
  const c = smoothstep(0.22, 0.62, u) * TAU;
  to3(p, P.rH, -0.16, -0.44, 0.12, w);
  to3(p, P.rP, 0.45, -0.3, -0.85, w);
  aimTo(p, P.swD, -38 + 9 * Math.sin(c), -64 + 4 * Math.cos(c), w);
  flatAt(p, P, 1.2, w);
  // the free hand opens, palm down, a little out from his side, as if pressing on the air
  const yaw = p[P.pelvY] + p[P.spY];
  const on = bump(u, 0.12, 0.26, 0.7, 0.84) * e;
  freeTo(p, P.lH, 0.12, -0.44, 0.12, yaw, on);
  p[P.hs] += (0 - p[P.hs]) * on;
  freeTo(p, P.lD, 0.3, -0.25, 0.9, yaw, on);
  freeTo(p, P.lN, 0, -1, 0, yaw, on);
  p[P.lk] *= 1 - e;
  p[P.twoHand] *= 1 - e;
  p[P.hdX] += 0.22 * w;
  p[P.spX] += 0.05 * w;
  p[P.bodyY] -= 0.02 * w;
}

/** The breath: the blade upright before his right shoulder, the head bowed over it, the free hand open
 *  beside it; he breathes in slow and deep, the flame swells, a thread of marks circles him at the height
 *  of his chest and comes back into the steel, and he lets the blade down. */
function spellBreath(p, P, A, u, e) {
  const up = smoothstep(0.04, 0.2, u), dn = smoothstep(0.84, 0.97, u), w = e * (1 - dn);
  to3(p, P.rH, lerp(-0.15, -0.02, up), lerp(-0.44, -0.2, up), lerp(0.08, 0.26, up), w);
  to3(p, P.rP, lerp(0.6, 0.45, up), -0.75, lerp(-0.55, -0.5, up), w);
  aimTo(p, P.swD, lerp(-40, -12, up), lerp(-40, 80, up), w);
  flatAt(p, P, 1.57, w * up);
  const yaw = p[P.pelvY] + p[P.spY];
  const on = bump(u, 0.16, 0.28, 0.74, 0.84) * e;
  freeTo(p, P.lH, -0.17, -0.2, 0.25, yaw, on);
  to3(p, P.lP, 0.6, -0.8, -0.2, on);
  p[P.hs] += (0 - p[P.hs]) * on;
  freeTo(p, P.lD, -0.1, 0.95, 0.2, yaw, on);
  freeTo(p, P.lN, -0.95, 0, 0.25, yaw, on);
  p[P.lk] *= 1 - e;
  p[P.twoHand] *= 1 - e;
  // the deep breath: the chest fills and empties twice, the head bowed
  const br = Math.sin(TAU * 2 * smoothstep(0.22, 0.78, u)) * bump(u, 0.2, 0.3, 0.7, 0.8);
  p[P.spX] -= 0.05 * br * e;
  p[P.bodyY] += 0.01 * br * e;
  p[P.hdX] += 0.2 * w;
}

export const EASE_TRICKS = [
  { name: 'spin', dur: 2.4, fn: trickSpin, trick: true, blade: true },
  { name: 'eight', dur: 3.0, fn: trickEight, trick: true, blade: true },
  { name: 'salute', dur: 3.4, fn: trickSalute, trick: true, blade: true },
  { name: 'flick', dur: 2.8, fn: trickFlick, trick: true, blade: true },
  { name: 'rite', dur: 4.4, fn: spellRite, trick: true, blade: true, spell: true },
  { name: 'sigil', dur: 4.2, fn: spellSigil, trick: true, blade: true, spell: true },
  { name: 'breath', dur: 4.6, fn: spellBreath, trick: true, blade: true, spell: true },
];

// ---------------------------------------------------------------- HABITS in the fight (small, in the guard)
/** Grip: the blade turns a little in the hand and back, the point dipping; the free hand closes and opens. */
function fightGrip(p, P, A, u, e) {
  const k = kf(u, [0.15, 0, 0.35, 1, 0.55, -0.6, 0.75, 0]);
  flatAt(p, P, 0.25 + 0.5 * k, e);
  aimTo(p, P.swD, -9 - 4 * k, 13 - 5 * Math.abs(k), 0.8 * e);
  p[P.rH + 1] -= 0.015 * Math.abs(k) * e;
  const sh = kf(u, [0.2, 1, 0.32, 0, 0.5, 0, 0.62, 1]);
  p[P.hs] += (sh - p[P.hs]) * e;
}
/** A guard shift: the weight forward and back, the point drawing one slow wider circle, the free hand
 *  riding with the weight. */
function fightShift(p, P, A, u, e) {
  const a = TAU * smoothstep(0.1, 0.9, u), k = Math.sin(Math.PI * smoothstep(0.05, 0.95, u));
  p[P.bodyZ] += 0.03 * Math.sin(a) * e;
  p[P.bodyY] -= 0.015 * k * e;
  p[P.rH] += 0.02 * Math.cos(a) * k * e;
  p[P.rH + 1] += 0.02 * Math.sin(a) * k * e;
  aimTo(p, P.swD, -9 + 7 * Math.cos(a), 13 + 6 * Math.sin(a), k * e);
  p[P.lH + 2] += 0.04 * Math.sin(a) * e;
  p[P.lH + 1] += 0.02 * Math.cos(a) * e;
}
/** Loosen: a roll of the neck to one side and the other, the free shoulder rolling once, the point dips
 *  and comes back up. */
function fightLoosen(p, P, A, u, e) {
  p[P.hdZ] += kf(u, [0.1, 0, 0.25, 0.24, 0.4, 0.24, 0.55, -0.22, 0.7, -0.22, 0.85, 0]) * e;
  const a = TAU * clamp((u - 0.15) / 0.55, 0, 1);
  p[P.lH + 1] += 0.04 * (1 - Math.cos(a)) * e;
  p[P.lH + 2] -= 0.03 * Math.sin(a) * e;
  p[P.spZ] -= 0.03 * Math.sin(a) * e;
  aimTo(p, P.swD, -9, 13 - 9 * Math.sin(Math.PI * clamp((u - 0.2) / 0.5, 0, 1)), 0.8 * e);
}
/** Beckon: the free hand turns palm up toward the foe and the fingers curl twice: come on. */
function fightBeckon(p, P, A, u, e) {
  const on = bump(u, 0.08, 0.25, 0.75, 0.92) * e;
  to3(p, P.lH, -0.03, -0.2, 0.36, on);
  to3(p, P.lP, 0.6, -0.8, -0.2, on);
  p[P.hs] += (0 - p[P.hs]) * on;
  const c = kf(u, [0.28, 0, 0.36, 1, 0.44, 0, 0.52, 1, 0.6, 0]);
  dir(p, P.lD, -5, lerp(5, 70, c), 0.9 * on + (1 - on) * Math.hypot(p[P.lD], p[P.lD + 1], p[P.lD + 2]));
  to3(p, P.lN, 0.1, 0.95, 0.2, on);
  p[P.hdX] -= 0.06 * on;
}
/** The point flicks: two quick small circles of the point from the wrist, the free hand still. */
function fightFlick(p, P, A, u, e) {
  const s = smoothstep(0.15, 0.85, u), a = 2 * TAU * s, k = Math.sin(Math.PI * s);
  aimTo(p, P.swD, -9 + 9 * Math.cos(a) * k, 13 + 9 * Math.sin(a) * k, e);
  flatAt(p, P, 0.25 + 0.4 * Math.sin(a) * k, e);
}
export const FIGHT_ACTS = [
  { name: 'grip', dur: 1.8, fn: fightGrip },
  { name: 'shift', dur: 2.4, fn: fightShift },
  { name: 'loosen', dur: 2.4, fn: fightLoosen },
  { name: 'beckon', dur: 2.2, fn: fightBeckon },
  { name: 'pointFlick', dur: 1.5, fn: fightFlick },
];

/** Is the at-ease rest he stands in now (and not changing) one an action that swings the blade may start from? */
export function lowRest(A) {
  const S = A.rests?.ease;
  return !!S && S.u >= 1 && !!EASE_RESTS[S.a]?.low;
}
/** Is he in (or moving to or from) the trailing rest, its blade low behind him? (anim.js: a block's entry) */
export function trailing(A) {
  const S = A.rests?.ease;
  return !!S && (EASE_RESTS[S.a]?.name === 'trail' || (S.u < 1 && EASE_RESTS[S.b]?.name === 'trail'));
}
/** Move the at-ease rest to the loose one (a low rest) now: an action that swings the blade waits for it. */
export function toLowRest(A) {
  const S = A.rests?.ease;
  if (!S || (S.u >= 1 && EASE_RESTS[S.a]?.low) || (S.u < 1 && EASE_RESTS[S.b]?.low)) return;
  if (S.u < 1) S.a = S.b; // (a change under way: from where it is going)
  S.b = 0;
  S.u = 0;
  S.mem.ok = false;
  S.hold = lerp(IDLES.restHold[0], IDLES.restHold[1], A.idleNoise());
}
/** The next action at ease: a trick when one is due (F.trickDue), else a habit other than the last; one
 *  that swings the blade only from a low rest. A trick due in a high rest: -1, and the rest goes low
 *  first (the trick follows). List = anim.js EASE_LIST (with three of the older idle actions). */
export function pickEase(F, list, A) {
  const noise = A.idleNoise, low = lowRest(A);
  const wantTrick = F.sinceTrick >= F.trickDue;
  if (wantTrick && !low) {
    toLowRest(A);
    return -1;
  }
  let n = 0;
  const ok = (i) => !!list[i].trick === wantTrick && i !== F.last && (low || !list[i].blade);
  for (let i = 0; i < list.length; i++) if (ok(i)) n++;
  let r = Math.floor(noise() * n);
  for (let i = 0; i < list.length; i++) {
    if (!ok(i)) continue;
    if (r-- === 0) {
      if (wantTrick) {
        F.sinceTrick = 0;
        F.trickDue = Math.round(lerp(IDLES.trickEvery[0], IDLES.trickEvery[1], noise()));
      } else F.sinceTrick++;
      return i;
    }
  }
  return -1;
}
