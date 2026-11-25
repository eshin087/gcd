// The hero's sword arm on the run (ADR-200): how the sword hand carries the blade while he runs or sprints
// at ease (the fight's carry, FIGHT_RUN, and the backpedal's guard stay anim.js loco()'s and blend over this).
// The owner (2026-11-25): "the right hand angle and movement looks stiff weird angle and unnatural ... make
// the right angle hold the sword at a proper natural angle". Measured on the carry before (`?runSword=old`):
// the arm hung nearly straight down while the blade pointed back, so the wrist was bent 62-87° (mean 75°)
// off the forearm, and the blade's direction barely changed over a stride (3° up and down, 9° side to side
// on the run, none at a sprint): the hand moved, the steel was carried rigid, like a tail.
//
// Each carry is written as joint angles posed by forward kinematics on the arm's bones (as runArms.js does
// for the free arm): the upper arm's swing (+ forward) and how far it stands off his side, the elbow, and
// the WRIST: the blade leaves the forearm's line by only a few degrees, so the arm and the steel read as one
// line, and the blade swings with the arm. The swing runs against the free arm (with the left leg).
//   a  RELAXED TRAIL: the arm a little back and soft, the blade carrying on near its line and trailing back
//      past the hip, the point well off the ground; it swings with the stride
//   b  SWEPT LOW: the arm reaching back and out, almost straight, the blade carrying on behind him low and
//      level (the action-game swordsman's run); a smaller swing
//   old the carry before this pass (anim.js loco())
// Pose space: body axes (x = his left, y up, z ahead); the sword hand's offsets start from its shoulder spot
// (rig.arms.R.anchor). No allocation per frame, never throws, never Math.random.
import { clamp, lerp } from '../../core/math.js';
import { DIM } from './heroDims.js';

const IDS = ['a', 'b', 'old'];
export const RUN_SWORD_IDS = Object.freeze(IDS.slice());
export const RUN_SWORD_NAMES = Object.freeze({ a: 'relaxed trail', b: 'swept low', old: 'before' });
const DEFAULT = 'old'; // until the owner picks (a / b rendered side by side for them)

const q = (name) => {
  try {
    return typeof location !== 'undefined' ? new URLSearchParams(location.search).get(name) : null;
  } catch {
    return null;
  }
};
const PICK = { mode: (() => {
  const v = q('runSword');
  return IDS.includes(v) ? v : DEFAULT;
})() };
export const runSwordMode = () => PICK.mode;
export function setRunSword(id) {
  PICK.mode = IDS.includes(String(id)) ? String(id) : DEFAULT;
  return PICK.mode;
}

const D = Math.PI / 180;
// per carry, run → sprint (degrees): phi the upper arm's swing from hanging (centre, half range: + forward),
// ab how far it stands out to his right, el the elbow's inside angle (back, forward of the swing), wrist how
// far the blade leaves the forearm's line toward his back (in the swing's plane), out how far the blade
// angles out to his right (off his leg and the coat), flat the blade's flat (body axes: mostly up, so the
// game camera above sees its broad side)
export const RUN_SWORDS = {
  a: {
    run: { phi: [-36, 13], ab: 15, el: [154, 140], wrist: 30, out: 12, low: 38 },
    sprint: { phi: [-50, 11], ab: 17, el: [158, 148], wrist: 26, out: 11, low: 30 },
  },
  b: {
    run: { phi: [-50, 9], ab: 20, el: [162, 154], wrist: 22, out: 14, low: 32 },
    sprint: { phi: [-62, 7], ab: 22, el: [164, 158], wrist: 16, out: 12, low: 24 },
  },
  flat: [-0.15, 1, -0.1],
  lag: 0.03, // of a cycle: the arm follows the stride
};
// (low: the most the blade may point down, degrees below level: the hand rides ~0.75 m up and the blade
// is 0.93 m long, so steeper than ~45° puts the point in the grass. Where the arm's line would, the wrist
// turns the blade back up to it)

const U = [0, 0, 0], F = [0, 0, 0];
/** The sword arm's targets on the run into OUT = { h: [3], p: [3], d: [3], f: [3] } (body axes). Returns false
 *  for 'old' (loco() keeps its own). ph = the stride's phase, armF its signed size (A.armSign × |mz|, ≥ 0.65),
 *  s = the sprint (0..1). */
export function runSword(OUT, ph, armF, s) {
  const mode = PICK.mode;
  if (mode === 'old') return false;
  const K = RUN_SWORDS[mode], R = K.run, S = K.sprint;
  // the right hand comes forward with the left leg (cs = +1 as the left foot lands in front)
  const cs = Math.cos(2 * Math.PI * (ph - RUN_SWORDS.lag));
  const sw = clamp(cs * (Number.isFinite(armF) ? armF : 1), -1, 1); // +1 forward
  const f = 0.5 + 0.5 * sw;
  const phi = lerp(R.phi[0], S.phi[0], s) + lerp(R.phi[1], S.phi[1], s) * sw;
  const ab = lerp(R.ab, S.ab, s), el = lerp(lerp(R.el[0], R.el[1], f), lerp(S.el[0], S.el[1], f), s);
  const wr = lerp(R.wrist, S.wrist, s), out = lerp(R.out, S.out, s);
  // forward kinematics: the upper arm (out to his right: −x), the forearm bent forward in its plane
  const p = phi * D, a = ab * D, ca = Math.cos(a), sa = Math.sin(a);
  U[0] = -sa;
  U[1] = -ca * Math.cos(p);
  U[2] = ca * Math.sin(p);
  const fa = p + (Math.PI - el * D); // the forearm's angle from hanging, in the swing's plane
  F[0] = -sa * 0.6;
  F[1] = -Math.cos(fa);
  F[2] = Math.sin(fa);
  nrm(F);
  const L1 = DIM.upperArm, L2 = DIM.foreArm;
  const H = OUT.h;
  for (let i = 0; i < 3; i++) H[i] = L1 * U[i] + L2 * F[i];
  // the elbow's pole: the elbow itself, off the shoulder → hand line
  const hh = H[0] * H[0] + H[1] * H[1] + H[2] * H[2];
  const t = hh > 1e-6 ? (L1 * (U[0] * H[0] + U[1] * H[1] + U[2] * H[2])) / hh : 0;
  const P = OUT.p;
  P[0] = L1 * U[0] - t * H[0];
  P[1] = L1 * U[1] - t * H[1];
  P[2] = L1 * U[2] - t * H[2];
  if (Math.hypot(P[0], P[1], P[2]) < 1e-4) {
    P[0] = -0.3;
    P[1] = -0.3;
    P[2] = -0.9;
  }
  nrm(P);
  // the blade: the forearm's line turned back by the wrist, and out to his right
  const fb = fa - wr * D, o = out * D;
  const Dd = OUT.d;
  Dd[0] = -Math.sin(o) + F[0] * 0.5;
  Dd[1] = -Math.cos(fb) * Math.cos(o);
  Dd[2] = Math.sin(fb) * Math.cos(o);
  nrm(Dd);
  const yMin = -Math.sin(lerp(R.low, S.low, s) * D);
  if (Dd[1] < yMin) {
    // (lifted toward the back-and-out line, not along whatever little of the blade points sideways: a
    // blade near vertical has almost no horizontal part, and keeping it swung the point out to his side)
    const so = Math.sin(o), co = Math.cos(o);
    const lift = clamp((yMin - Dd[1]) * 3, 0, 1);
    let hx = lerp(Dd[0], -so, lift), hz = lerp(Dd[2], -co, lift), hl = Math.hypot(hx, hz);
    if (hl < 1e-3) {
      hx = -so;
      hz = -co;
      hl = 1;
    }
    const k = Math.sqrt(1 - yMin * yMin) / hl;
    Dd[0] = hx * k;
    Dd[1] = yMin;
    Dd[2] = hz * k;
  }
  const Fl = OUT.f, FL = RUN_SWORDS.flat;
  Fl[0] = FL[0];
  Fl[1] = FL[1];
  Fl[2] = FL[2];
  return true;
}
function nrm(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  if (l > 1e-8) {
    v[0] /= l;
    v[1] /= l;
    v[2] /= l;
  } else {
    v[0] = 0;
    v[1] = -1;
    v[2] = 0;
  }
}
