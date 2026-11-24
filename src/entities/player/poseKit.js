// THE POSE KIT: what a stance or an idle action (styles/<id>.js) needs to write the hero's pose,
// with no import of anim.js (anim.js imports this, so a style file that imports it makes no cycle).
// The channel map `P`, the vector helpers, the blade-direction blend that goes round the outside of
// the body, the stance life (slow sines), and the free hand's rests. A guide for authors:
// styles/STANCES.md.
//
// Pose spaces (anim.js has the whole story):
//   body axes   x = his LEFT, y up, z AHEAD (the `body` joint's axes)
//   rH / lH     hand targets: OFFSETS from each shoulder, body axes (the sword hand's from DIM.gripShoulder)
//   rF / lF     feet: MODEL space (ground-relative; y = DIM.ankle with the foot flat)
//   directions  unit vectors in body axes; az / el in degrees: az 0 ahead, + his left; el + up
import { clamp, smoothstep, wrapAngle, TAU } from '../../core/math.js';
import { DIM } from './heroDims.js';

export const P = {
  bodyX: 0, bodyY: 1, bodyZ: 2, pitch: 3, yaw: 4, roll: 5,
  pelvY: 6, pelvZ: 7, spX: 8, spY: 9, spZ: 10, hdX: 11, hdY: 12,
  rH: 13, rP: 16, lH: 19, lP: 22, // hand offsets + elbow pole directions (body axes)
  swD: 25, swF: 28, // blade direction + flat normal (body axes)
  rF: 31, lF: 34, // foot targets (model space)
  rK: 37, lK: 40, // knee pole directions (body axes)
  footFlat: 43, flask: 44,
  twoHand: 45, // 0..1: the off hand joins the grip (the slam, the charge and the cleave, the guard)
  hdZ: 46, // head tilt (roll)
  pelvX: 47, // pelvis tuck / tilt (pitch)
  rFy: 48, lFy: 49, // foot yaw (toe-out) relative to the root
  rFf: 50, lFf: 51, // per-foot flat factor (× footFlat): heel peel / toe-off / swing
  // with twoHand: how far UP the sword from the grip the off hand sits (m; 0 = on the grip under the
  // sword hand): a palm braced on the flat of the blade
  offAt: 52,
  // the free hand: its fingers' direction and the way its palm faces (body axes; each vector's
  // LENGTH is its weight: 0 = the hand rigid on the forearm, today's look), its shape (0 open, 1
  // sword fingers) and how far it rests on the sword wrist (0..1). Read only for an animator built
  // with opts.freeHand (the hero); every other animator ignores whatever they hold
  lD: 53, lN: 56, hs: 59, lk: 60,
};
/** The pose's channel count (a duelist's scratch poses are sized from it). */
export const N = 61;
export const ANK = DIM.ankle;
const DEG = Math.PI / 180;

// ---------------------------------------------------------------- vectors
export const v3 = (p, i, x, y, z) => {
  p[i] = x;
  p[i + 1] = y;
  p[i + 2] = z;
};
/** (stances.js's name for v3) */
export const set3 = v3;
/** Move p[i..i+2] toward (x,y,z) by t. */
export const to3 = (p, i, x, y, z, t) => {
  if (t <= 0) return;
  p[i] += (x - p[i]) * t;
  p[i + 1] += (y - p[i + 1]) * t;
  p[i + 2] += (z - p[i + 2]) * t;
};
/** Add (x, y, z) × e to p[i..i+2]: an OFFSET from whatever pose is there (an idle action over any stance). */
export const add3 = (p, i, x, y, z, e = 1) => {
  p[i] += x * e;
  p[i + 1] += y * e;
  p[i + 2] += z * e;
};
/** [azimuth, elevation] in degrees → a unit vector (body axes: az 0 ahead, + his left; el + up). */
export const unitAzEl = (az, el) => {
  const a = az * DEG, e = el * DEG, c = Math.cos(e);
  return [c * Math.sin(a), Math.sin(e), c * Math.cos(a)];
};
/** p[i..i+2] = the unit vector at azimuth az, elevation el (degrees). */
export function dir(p, i, az, el) {
  const a = az * DEG, e = el * DEG, c = Math.cos(e);
  p[i] = c * Math.sin(a);
  p[i + 1] = Math.sin(e);
  p[i + 2] = c * Math.cos(a);
}
/** Turn (x, z) of p[i..i+2] about the vertical by angle a (rad, + toward his left): a hand that
 *  belongs to the waist turns with the waist. */
export function turnY(p, i, a) {
  const c = Math.cos(a), s = Math.sin(a), x = p[i], z = p[i + 2];
  p[i] = x * c + z * s;
  p[i + 2] = -x * s + z * c;
}

/** Piecewise curve through flat [t0, v0, t1, v1, ...] keys, smoothstepped between neighbours. */
export function kf(t, k) {
  if (t <= k[0]) return k[1];
  for (let i = 2; i < k.length; i += 2) {
    if (t <= k[i]) {
      const u = (t - k[i - 2]) / Math.max(1e-6, k[i] - k[i - 2]);
      return k[i - 1] + (k[i + 1] - k[i - 1]) * u * u * (3 - 2 * u);
    }
  }
  return k[k.length - 1];
}
/** 0 → 1 → 0 over u in [a, d]: up over [a, b], held, down over [c, d] (smoothsteps): an idle action's
 *  beat (u = its time 0..1). */
export const hump = (u, a, b, c, d) => smoothstep(a, b, u) * (1 - smoothstep(c, d, u));
/** smootherstep 0..1 (no speed, no acceleration at either end) */
export const smoother = (x) => {
  const t = clamp(x, 0, 1);
  return t * t * t * (t * (6 * t - 15) + 10);
};

// ---------------------------------------------------------------- blade direction blending
// Blade directions are blended by azimuth (round the body's vertical axis, + = the hero's left)
// and elevation, not component-wise: a component lerp between a blade low ahead and one trailing
// low behind passes through "straight down", which buried the point; the tip floor then swung it
// round under the body in 2-3 frames (a whip through the legs on every run start / stop, roll and
// recovery). Now a low blade sweeps round the side at its own height, and never through the
// back-left (from the right hand that path runs between the legs): it goes round the outside.
const DIR_AVOID = 2.35; // azimuth a blade below shoulder height never sweeps through (back-left)
const DIR_HIGH = 0.45; // elevation (rad) above which the blade clears the shoulder there
const DIR_LOCAL = 0.8; // rad of azimuth below which a move is local (never sent the long way round)
// a move this close to half a turn has no natural way round; below DIR_FLIP_HIGH (rad of elevation,
// about the head) it goes round the FRONT, never behind the shoulders (ADR-034: the lean idle hangs
// the blade at his right front, ~180° from the light combo's finish over his left shoulder; the way
// behind ran the steel through the sword arm's shoulder for a frame)
const DIR_FLIP = 2.75, DIR_FLIP_HIGH = 0.9;
const _ae = [0, 0, 0];
function azEl(x, y, z, o) {
  const h = Math.hypot(x, z);
  o[0] = Math.atan2(x, z);
  o[1] = Math.atan2(y, h);
  o[2] = h / (Math.hypot(x, y, z) || 1); // how horizontal (0 = vertical: no heading)
}
/** mem (optional, a cross-fade's): { d, ok } — the sweep keeps the way round it took last frame
 *  (the nearest 2π branch to it): the target moves during a fade, and re-deciding the way every
 *  frame flipped the blade to the other side of the body mid-fade. */
export function dirLerp(out, i, ax, ay, az, bx, by, bz, t, mem = null) {
  if (!(t > 0)) {
    v3(out, i, ax, ay, az);
    return;
  }
  if (t >= 1) {
    v3(out, i, bx, by, bz);
    return;
  }
  azEl(ax, ay, az, _ae);
  let a0 = _ae[0];
  const e0 = _ae[1], h0 = _ae[2];
  azEl(bx, by, bz, _ae);
  let a1 = _ae[0];
  const e1 = _ae[1], h1 = _ae[2];
  // a (nearly) vertical end has little heading, and it flips 180° as the blade passes vertical (the
  // slam's raise): lean on the other end's heading as an end nears vertical, so the path stays
  // continuous; the end correction below keeps both ends exact
  const k0 = smoothstep(0.03, 0.3, h0), k1 = smoothstep(0.03, 0.3, h1);
  a1 = a0 + wrapAngle(a1 - a0) * k1;
  a0 = a1 + wrapAngle(a0 - a1) * k0;
  let d = wrapAngle(a1 - a0);
  if (Math.min(e0, e1) < DIR_HIGH && Math.abs(d) > DIR_LOCAL) {
    // a path that crosses the back-left below shoulder height (behind / through the body from the
    // right hand) goes round the other way; one still high there passes over the shoulder. A short
    // move of a blade already AT the back-left (light 1's rising finish → light 2's coil) stays
    // local: flipping it sent the blade 350° round the body in two frames
    const f = wrapAngle(DIR_AVOID - a0);
    if (((d > 0 && f > 0 && f < d) || (d < 0 && f < 0 && f > d)) && e0 + ((e1 - e0) * f) / d < DIR_HIGH) d -= Math.sign(d) * TAU;
  }
  if (Math.abs(d) > DIR_FLIP) {
    const fb = wrapAngle(Math.PI - a0); // from a0 to straight behind
    if (((d > 0 && fb > 0 && fb < d) || (d < 0 && fb < 0 && fb > d)) && e0 + ((e1 - e0) * fb) / d < DIR_FLIP_HIGH) d -= Math.sign(d) * TAU;
  }
  if (mem) {
    if (mem.ok) d += TAU * Math.round((mem.d - d) / TAU);
    mem.d = d;
    mem.ok = true;
  }
  const a = a0 + d * t, e = e0 + (e1 - e0) * t;
  const c = Math.cos(e);
  let x = c * Math.sin(a), y = Math.sin(e), z = c * Math.cos(a);
  if (k0 < 1 || k1 < 1) {
    // the borrowed headings moved the path's ends: fade in the difference to the true ends
    const la = Math.hypot(ax, ay, az) || 1, lb = Math.hypot(bx, by, bz) || 1;
    const c0 = Math.cos(e0), c1 = Math.cos(e1), s = 1 - t;
    x += s * (ax / la - c0 * Math.sin(a0)) + t * (bx / lb - c1 * Math.sin(a0 + d));
    y += s * (ay / la - Math.sin(e0)) + t * (by / lb - Math.sin(e1));
    z += s * (az / la - c0 * Math.cos(a0)) + t * (bz / lb - c1 * Math.cos(a0 + d));
    const l = Math.hypot(x, y, z);
    if (l > 1e-6) {
      x /= l;
      y /= l;
      z /= l;
    }
  }
  v3(out, i, x, y, z);
}
/** Turn the blade direction p[i..i+2] toward (x, y, z) by t, round the outside (see dirLerp). */
export function dirTo(p, i, x, y, z, t) {
  if (!(t > 0)) return;
  dirLerp(p, i, p[i], p[i + 1], p[i + 2], x, y, z, Math.min(1, t));
}
/** Turn the direction p[i..i+2] by (dAz, dEl) degrees from where it is, by e: an idle action as an
 *  OFFSET from the stance's blade (or fingers), whatever stance he stands in. */
export function dirNudge(p, i, dAz, dEl, e = 1) {
  if (!(e > 0)) return;
  azEl(p[i], p[i + 1], p[i + 2], _ae);
  const a = _ae[0] + dAz * DEG, el = clamp(_ae[1] + dEl * DEG, -1.55, 1.55), c = Math.cos(el);
  dirTo(p, i, c * Math.sin(a), Math.sin(el), c * Math.cos(a), e);
}

// ---------------------------------------------------------------- the free hand
/** The free hand loses its shape and its wrist by k (hit, fall, heal): open, rigid on the forearm. */
export const freeLimp = (p, k) => {
  if (!(k > 0)) return;
  const s = 1 - Math.min(1, k);
  p[P.hs] += (0 - p[P.hs]) * Math.min(1, k);
  for (let i = 0; i < 3; i++) {
    p[P.lD + i] *= s;
    p[P.lN + i] *= s;
  }
};
/** guard()'s rest for the free hand's fingers (ahead and down, a "seated" jian rest) and its palm:
 *  also where the fingers go as he sets off from a stance that names nothing else (STANCE.move). */
export const REST_LD = unitAzEl(14, -50);
export const REST_LN = [-0.35, -0.6, -0.72];

/** The free hand on the belt at the left hip, the elbow out behind it (today's two stances, ADR-114).
 *  h: the hand from its shoulder; p: the elbow's side; d / n: the fingers and the palm; all in body
 *  axes as the chest stands at ease (turned `yaw`): a stance turns them with its own chest. */
export const BELT = { yaw: -0.14, h: [-0.004, -0.33, 0.022], p: [0.85, -0.15, -0.6], d: [-0.8, -0.2, 0.56], n: [-0.56, 0.05, -0.82] };
function turned(p, i, v, c, s) {
  p[i] = v[0] * c + v[2] * s;
  p[i + 1] = v[1];
  p[i + 2] = -v[0] * s + v[2] * c;
}
/** The belt rest (today's). `yaw` = the stance's chest turn (pelvY + spY); m = a life (standLife). */
export function handBelt(p, m, yaw) {
  const a = yaw - BELT.yaw, c = Math.cos(a), s = Math.sin(a);
  // the palm on the side of the waist at the belt, a hand's thickness off it …
  turned(p, P.lH, BELT.h, c, s);
  p[P.lH] += 0.004 * m.sw;
  p[P.lH + 1] += 0.01 * m.brL;
  turned(p, P.lP, BELT.p, c, s);
  // … an open hand, the fingers round the front of the hip toward the buckle, the palm in on it
  turned(p, P.lD, BELT.d, c, s);
  turned(p, P.lN, BELT.n, c, s);
  p[P.hs] = 0;
  p[P.lk] = 0;
  p[P.twoHand] = 0;
  p[P.offAt] = 0;
}
/** The free hand hangs loose beside the left thigh, the elbow a little soft and back, an open
 *  hand whose fingers follow the forearm (a weak lD), the palm in toward the leg. It swings a little
 *  with the breath and the weight (m = a life). Opts: `out` (m out from the hip), `fwd` (m ahead),
 *  `swing` (× the sway). Measured clear of the hips by ~3 cm with `out` 0 (STANCES.md). */
export function handLoose(p, m, { out = 0, fwd = 0.03, swing = 1 } = {}) {
  v3(p, P.lH, 0.035 + out + 0.006 * swing * m.sw, -0.5 + 0.008 * m.brL, fwd + 0.014 * swing * m.dr);
  v3(p, P.lP, 0.35, -0.2, -0.9);
  v3(p, P.lD, 0.02, -0.3, 0.06); // weight 0.3: mostly along the forearm
  v3(p, P.lN, -0.6, 0, 0.1); // the palm toward the leg
  p[P.hs] = 0;
  p[P.lk] = 0;
  p[P.twoHand] = 0;
  p[P.offAt] = 0;
}
/** The free hand in sword fingers (jian jue) before him: `at` 'chest' (raised before the left chest,
 *  the two fingers up: a guard's) or 'low' (ahead of the left hip, pointing ahead and down: guard()'s
 *  "seated" rest, never ON the hip). m = a life. Setting off, the loco opens the hand (hs → 0) over
 *  the first fifth of a stride: give the stance `move` to say where the fingers go. */
export function handFingers(p, m, { at = 'chest' } = {}) {
  if (at === 'low') {
    v3(p, P.lH, 0.07 + 0.006 * m.sw, -0.45 + 0.012 * m.brL, 0.16 + 0.01 * m.br);
    v3(p, P.lP, 0.45, -0.3, -0.8);
    v3(p, P.lD, REST_LD[0], REST_LD[1] + 0.05 * m.br, REST_LD[2]);
    v3(p, P.lN, REST_LN[0], REST_LN[1], REST_LN[2]);
  } else {
    v3(p, P.lH, -0.03 + 0.004 * m.sw, -0.27 + 0.01 * m.brL, 0.25 + 0.006 * m.br);
    v3(p, P.lP, 0.75, -0.6, -0.25);
    const d = unitAzEl(-10, 62 + 3 * m.br);
    v3(p, P.lD, d[0], d[1], d[2]);
    v3(p, P.lN, -0.85, 0.1, 0.5);
  }
  p[P.hs] = 1;
  p[P.lk] = 0;
  p[P.twoHand] = 0;
  p[P.offAt] = 0;
}

// ---------------------------------------------------------------- the life in a stance
/** The stance's life (today's): periods (s) of its slow oscillators. None shares a period with
 *  another, so the stance never visibly loops: the breath (at ease / in the guard), the weight
 *  settling from foot to foot, a slower drift of the weight, the two the look-around is made of, and
 *  the two that carry the blade's point round. `arms` = how far (rad of the breath) the arms trail. */
export const STAND_LIFE = { breath: [3.7, 3.1], settle: 7.9, drift: 11.9, look: [9.1, 5.3], point: [4.7, 6.4], arms: 0.9 };
const LIFE_M = { br: 0, brL: 0, sw: 0, dr: 0, look: 0, tipA: 0, tipB: 0 };
/** The life at time t (A.time) for a breath of `breath` s: { br the breath, brL the arms' (late),
 *  sw the weight from foot to foot, dr a slower drift, look a wandering gaze, tipA / tipB the point's
 *  two } each −1..1. `L`: periods in STAND_LIFE's shape (a style's own). `out` (optional): the object
 *  written (default: one shared object, read it before the next call). */
export function standLife(t, breath, L = STAND_LIFE, out = LIFE_M) {
  const b = (t * TAU) / breath;
  out.br = Math.sin(b);
  out.brL = Math.sin(b - L.arms);
  out.sw = Math.sin((t * TAU) / L.settle + 1.1);
  out.dr = Math.sin((t * TAU) / L.drift + 0.4);
  // (two sines: he looks one way, comes back, glances the other; never a metronome)
  out.look = 0.62 * Math.sin((t * TAU) / L.look[0] + 2.0) + 0.38 * Math.sin((t * TAU) / L.look[1]);
  out.tipA = Math.sin((t * TAU) / L.point[0] + 0.6);
  out.tipB = Math.sin((t * TAU) / L.point[1]);
  return out;
}
/** sin(t·2π / period + phase): one slow wave. */
export const wave = (t, period, phase = 0) => Math.sin((t * TAU) / period + phase);
