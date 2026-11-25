// The hero's free (left) arm on the run (ADR-187). anim.js loco() calls runArm() for the hero's
// animator only (A.freeHand); a duelist's footwork keeps its own swing.
//
// Three ways to carry it, for the owner to compare ("show me all 3 variations"), `?runArm=`:
//   a    NATURAL: a runner's arm. The elbow bent near a right angle, swinging against the legs from
//        the shoulder; it opens a little behind him and folds in front, the forearm crossing in
//        toward the chest; the hand open and loose (palm to the thigh, the fingers following the
//        forearm, curled a little). At a sprint the swing grows into a firm pump, chin to hip, the
//        hand straight as a blade.
//   b    THE SWORDSMAN'S DASH: the free arm swept back and low behind him, held off the coat, the
//        elbow soft, the open hand trailing; it rides the stride a little and never hangs still.
//        Only running FORWARD: strafing and backing away he swings it as in (a), since a trailing
//        arm in a sideways run reads as a broken one.
//   c    BY SPEED: (a) at the run, sweeping back into (b) as a sprint builds (A.sprintW, eased),
//        forward only, as in (b).
//   old  the swing before this pass (anim.js loco(), kept there).
//
// Why angles: every variant is written as joint angles (the upper arm's swing and how far it stands
// off the side, the elbow, the forearm's cross in front) and turned into the hand target and the
// elbow's pole by forward kinematics on the arm's own bones. A blend between two carries blends the
// ANGLES, so the hand travels round the shoulder on a real arc instead of a straight line through his
// ribs (a hand target lerped from "in front of the chest" to "behind the hip" passes through the torso
// and the solver's rib guard pushes it out in a jump).
//
// Pose space (anim.js): body axes, x = his left, y up, z ahead; P.lH is the hand's offset from the left
// shoulder, P.lP the elbow's pole, P.lD / P.lN the fingers' and the palm's directions (their lengths
// are their weights), P.hs the hand's shape (0 open, 1 sword fingers). No allocation per frame, never
// throws, never Math.random.
import { clamp, damp, lerp, smoothstep } from '../../core/math.js';
import { DIM } from './heroDims.js';

const IDS = ['a', 'b', 'c', 'old'];
export const RUN_ARM_IDS = Object.freeze(IDS.slice());
export const RUN_ARM_NAMES = Object.freeze({ a: 'natural (default)', b: 'dash', c: 'by speed', old: 'before' });
const DEFAULT = 'a'; // the owner's pick (2026-11-25): they approved A on the preview; C shipped first and was reverted

const q = (name) => {
  try {
    return typeof location !== 'undefined' ? new URLSearchParams(location.search).get(name) : null;
  } catch {
    return null;
  }
};
const PICK = { mode: (() => {
  const v = q('runArm');
  return IDS.includes(v) ? v : DEFAULT;
})() };

/** The carry in use ('a' | 'b' | 'c' | 'old'). */
export const runArmMode = () => PICK.mode;
/** Lab / tests: switch it live. Returns the id now set (anything unknown: the default). */
export function setRunArm(id) {
  PICK.mode = IDS.includes(String(id)) ? String(id) : DEFAULT;
  return PICK.mode;
}

const D = Math.PI / 180;
// The carries' numbers (degrees; `sw` = the swing's phase, +1 the hand forward, −1 back):
//   phi    the upper arm's swing from hanging (+ forward): centre, half range
//   ab     how far it stands off his side (+ out to his left)
//   el     the elbow's inside angle (180 straight) with the hand back / forward
//   cross  the forearm turned in toward his chest when the hand is in front
//   lag    the swing's lag behind the legs (cycles): an arm follows the stride, it does not lead it
//   curl   the relaxed fingers' bend toward the palm (0 = in line with the forearm), droop = down
export const RUN_ARMS = {
  // (a) a natural run: the walk's swing is small and nearly straight; the run's ~70° of shoulder,
  // the elbow 115° behind → 76° in front (it opens and folds ≥ 35° a stride: the stiff 87° crook of
  // Session 30 is what the owner called stiff); the sprint's pump ~104° of shoulder, chin to hip
  walk: { phi: [-4, 14], ab: 7, el: [158, 140], cross: 6, curl: 0.3, droop: 0.25 },
  run: { phi: [-9, 35], ab: 10, el: [118, 78], cross: 20, curl: 0.3, droop: 0.15 },
  sprint: { phi: [-9, 52], ab: 9, el: [110, 64], cross: 22, curl: 0.06, droop: 0.04 },
  lag: 0.035,
  // (b) the dash: swept back and up behind him, ~34° off his side so it shows past the cape from the
  // game camera (straight back, the cape hid all of it and from behind he seemed to have a hand on his
  // hip; less far back, the side view read a hand hanging by the hip). The elbow soft, the open hand
  // trailing. `ride` the stride's sway (deg of shoulder and of elbow each way: it never hangs still),
  // `sprint*` what a sprint adds (further back and up, a little further out), `palm` the trailing
  // palm (body axes: in and up)
  dash: { phi: -58, ride: 10, ab: 30, el: 152, elRide: 8, cross: -10, sprintPhi: -12, sprintAb: 4, sprintEl: 4, palm: [-0.55, 0.62, -0.55] },
  // the chest's lean into the dash (rad, × its weight), forward only
  dashLean: 0.05,
  // (b, c) forward only: the share of the dash by the move's fore-aft direction (mz)
  fwd: [0.35, 0.8],
  // (c) the sprint (A.sprintW, eased in update()) over which the run's swing becomes the dash
  byS: [0.15, 0.85],
  // (b, c) 1/s: how fast the dash comes and goes (~0.6 s to settle)
  dashRate: 5,
};

// one carry, as angles (rad), filled per frame: A = the swing, B = the dash, O = the blend
const A_ = { phi: 0, ab: 0, el: 0, cross: 0, curl: 0, droop: 0 };
const B_ = { phi: 0, ab: 0, el: 0, cross: 0, curl: 0, droop: 0 };
const U = [0, 0, 0], F = [0, 0, 0], H = [0, 0, 0];

function swingAngles(o, sw, runK, walkK, s) {
  const R = RUN_ARMS, W = R.walk, Rn = R.run, S = R.sprint;
  const pick = (k, i) => {
    const wv = i === undefined ? W[k] : W[k][i], rv = i === undefined ? Rn[k] : Rn[k][i], sv = i === undefined ? S[k] : S[k][i];
    return lerp(lerp(wv, rv, runK), sv, s);
  };
  const f = 0.5 + 0.5 * sw; // 0 back … 1 forward
  o.phi = (pick('phi', 0) + pick('phi', 1) * sw * lerp(0.6, 1, walkK)) * D;
  o.ab = (pick('ab') + 3 * (1 - f)) * D; // a little further out on the back swing: past the coat
  o.el = lerp(pick('el', 0), pick('el', 1), f) * D;
  o.cross = pick('cross') * f * D;
  o.curl = pick('curl');
  o.droop = pick('droop');
}

function dashAngles(o, sw, s) {
  const B = RUN_ARMS.dash;
  o.phi = (B.phi + B.sprintPhi * s + B.ride * sw) * D;
  o.ab = (B.ab + B.sprintAb * s) * D;
  o.el = (B.el + B.sprintEl * s + B.elRide * sw) * D;
  o.cross = B.cross * D;
  o.curl = 0.12;
  o.droop = 0.1;
}

/** The free arm on the run, written over what loco() has so far (weight `w` = A.moveW). Returns
 *  false for 'old' (loco() then writes the swing before this pass). `cs` the stride's driver
 *  (cos 2π·phase, +1 as the left foot lands in front), `armF` its signed size (A.armSign × |mz|,
 *  never under 0.65), `s` the sprint, `runK` walk → run, `mz` the move's fore-aft direction. */
export function runArm(p, P, A, ph, armF, s, runK, w, mz) {
  const mode = PICK.mode;
  if (mode === 'old') return false;
  const R = RUN_ARMS;
  // the swing's phase: +1 = the hand forward (the left hand comes forward with the right leg)
  const cs = Math.cos(2 * Math.PI * (ph - R.lag));
  const sw = clamp(-cs * (Number.isFinite(armF) ? armF : 1), -1, 1);
  const walkK = clamp(fin(A.speedS) / 1.6, 0, 1);
  swingAngles(A_, sw, runK, walkK, s);
  let want = 0;
  if (mode !== 'a') {
    const fw = smoothstep(R.fwd[0], R.fwd[1], fin(mz));
    want = mode === 'b' ? fw : fw * smoothstep(R.byS[0], R.byS[1], s);
  }
  // the dash's weight eases on its own clock (A.time: loco() runs more than once a frame, and each
  // run of it must give the same pose): the aim swung behind him flips mz in ~0.1 s, and the arm
  // came forward out of the dash in four frames, 28 cm a frame²
  const S = (A.runArmS ??= { bw: want, t: fin(A.time) });
  const now = fin(A.time), dt = clamp(now - S.t, 0, 0.1);
  S.bw = fin(damp(S.bw, want, R.dashRate, dt), want);
  S.t = now;
  const bw = clamp(S.bw, 0, 1);
  let O = A_;
  if (bw > 0.001) {
    dashAngles(B_, sw, s);
    const k = bw * bw * (3 - 2 * bw);
    A_.phi = lerp(A_.phi, B_.phi, k);
    A_.ab = lerp(A_.ab, B_.ab, k);
    A_.el = lerp(A_.el, B_.el, k);
    A_.cross = lerp(A_.cross, B_.cross, k);
    A_.curl = lerp(A_.curl, B_.curl, k);
    A_.droop = lerp(A_.droop, B_.droop, k);
    O = A_;
    // the chest leans into the dash a little (only where the dash is drawn: forward)
    p[P.spX] += R.dashLean * k * w;
  }
  // forward kinematics on the arm's own bones (body axes): the upper arm, then the forearm bent
  // forward from it in the swing's plane, turned in across the chest by `cross`
  const ca = Math.cos(O.ab), sa = Math.sin(O.ab);
  U[0] = sa;
  U[1] = -ca * Math.cos(O.phi);
  U[2] = ca * Math.sin(O.phi);
  const fa = O.phi + (Math.PI - O.el); // the forearm's angle from hanging, in the swing's plane
  const fz = Math.sin(fa), fy = -Math.cos(fa);
  const cc = Math.cos(O.cross), sc = Math.sin(O.cross);
  // (the forearm keeps most of the upper arm's stand-off: the elbow out, the hand not tucked under it)
  F[0] = -fz * sc + sa * 0.6;
  F[1] = fy;
  F[2] = fz * cc;
  normalize(F);
  const a = DIM.upperArm, b = DIM.foreArm;
  for (let i = 0; i < 3; i++) H[i] = a * U[i] + b * F[i];
  to3(p, P.lH, H[0], H[1], H[2], w);
  // the elbow's pole: the elbow itself, off the shoulder → hand line (the solver keeps only that part)
  const hh = H[0] * H[0] + H[1] * H[1] + H[2] * H[2];
  const t = hh > 1e-6 ? (a * (U[0] * H[0] + U[1] * H[1] + U[2] * H[2])) / hh : 0;
  let px = a * U[0] - t * H[0], py = a * U[1] - t * H[1], pz = a * U[2] - t * H[2];
  const pl = Math.hypot(px, py, pz);
  if (pl > 1e-4) {
    px /= pl;
    py /= pl;
    pz /= pl;
  } else {
    px = 0.3;
    py = -0.3;
    pz = -0.9;
  }
  to3(p, P.lP, px, py, pz, w);
  // the hand: open (hs 0), the palm to the thigh (in, −x) or, trailing in the dash, in and up; the
  // fingers along the forearm, curled a little toward the palm and drooping, straight in a pump
  const k = bw * bw * (3 - 2 * bw);
  const DP = R.dash.palm;
  let nx = lerp(-0.95, DP[0], k), ny = lerp(-0.05, DP[1], k), nz = lerp(0.12, DP[2], k);
  const nl = Math.hypot(nx, ny, nz) || 1;
  nx /= nl;
  ny /= nl;
  nz /= nl;
  let dx = F[0] + O.curl * nx, dy = F[1] + O.curl * ny - O.droop, dz = F[2] + O.curl * nz;
  const dl = Math.hypot(dx, dy, dz) || 1;
  const dW = 0.85;
  dx *= dW / dl;
  dy *= dW / dl;
  dz *= dW / dl;
  to3(p, P.lD, dx, dy, dz, w);
  to3(p, P.lN, nx * 0.9, ny * 0.9, nz * 0.9, w);
  p[P.hs] = lerp(p[P.hs], 0, clamp(w * 2, 0, 1));
  return true;
}

function fin(v, d = 0) {
  return Number.isFinite(v) ? v : d;
}
function normalize(v) {
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
function to3(p, i, x, y, z, w) {
  p[i] += (x - p[i]) * w;
  p[i + 1] += (y - p[i + 1]) * w;
  p[i + 2] += (z - p[i + 2]) * w;
}
