// The hero's sword arm on the run (ADR-202): how the sword hand carries the blade while he runs or sprints
// at ease (the fight's carry, FIGHT_RUN, and the backpedal's guard stay anim.js loco()'s and blend over this).
// The owner (2026-11-25): "the right hand angle and movement looks stiff weird angle and unnatural", then,
// of two trailing carries, "the running and sword placement still looks off", with a reference video of a
// knight sprinting with a straight sword. What the reference shows, and every carry before missed: the
// blade points FORWARD, carried low at the right hip, and rocks with the forearm; it never trails behind
// him. A fist holding a sword has the blade leaving the thumb side, so with the arm hanging the point goes
// ahead and down; a blade trailing back (the carry before, `?runSword=old`) needs a wrist turned the wrong
// way round, which is what read as stiff.
//
//   hip  FORWARD AT THE HIP: the arm swings against the free arm (with the left leg); back, the elbow
//        bent near a right angle behind him and the grip at the hip, the point ahead and down; forward,
//        the elbow opening and the grip ahead of the thigh, the point ahead and up. The blade keeps one
//        hammer-grip angle off the forearm (the wrist quiet), so the steel rocks with the arm.
//   old  the carry before this pass (anim.js loco())
//
// Written as joint angles posed by forward kinematics on the arm's bones (as runArms.js does for the free
// arm). The arm's angles are against the torso's own line (he leans into the run: loco() passes the
// lean, `tilt`), the blade's against level ground follows from them. Pose space: body axes (x = his
// left, y up, z ahead); the sword hand's offsets start from its shoulder spot (rig.arms.R.anchor).
// No allocation per frame, never throws, never Math.random.
import { clamp, lerp } from '../../core/math.js';
import { DIM } from './heroDims.js';

const IDS = ['hip', 'old'];
export const RUN_SWORD_IDS = Object.freeze(IDS.slice());
export const RUN_SWORD_NAMES = Object.freeze({ hip: 'forward at the hip', old: 'before' });
const DEFAULT = 'hip'; // on the draft branch, for the owner's look (the plain preview link)

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
// per gait, run → sprint (degrees; [back, forward] = the two ends of the swing):
//   phi   the upper arm's swing against the torso's line (+ forward): centre, half range
//   ab    how far it stands out to his right (the elbow a little off the ribs)
//   el    the elbow's inside angle (180 straight)
//   grip  the blade off the forearm's line, turned forward and up (a hammer grip: the thumb side ahead)
//   out   the blade's yaw out to his right, off the thigh and the coat
//   side  how much of the upper arm's stand-off the forearm keeps (the grip a fist outside the hip)
// Measured off the owner's reference (a sprint): back, the upper arm ~40° behind the torso, the elbow ~90°,
// the grip at the hip, the point ~20° down; forward, the upper arm ~12° ahead, the elbow ~140°, the grip
// 25-30 cm ahead of the hip, the point ~25° up. The run is the same shape at ~60 % of the swing.
// `roll` the blade's flat about its own line, from edge down (0: the flat faces out to his side, as in
// the reference) toward the sky
export const RUN_SWORDS = {
  hip: {
    run: { phi: [-9, 17], ab: 11, el: [108, 134], grip: [56, 64], out: 6, side: 0.35 },
    sprint: { phi: [-10, 27], ab: 13, el: [98, 126], grip: [58, 77], out: 5, side: 0.35 },
    roll: 40,
  },
  lag: 0.03, // of a cycle: the arm follows the stride
  low: 34, // the most the blade may point down (deg below level): the point stays out of the grass
};

const U = [0, 0, 0], F = [0, 0, 0];
/** The sword arm's targets on the run into OUT = { h: [3], p: [3], d: [3], f: [3] } (body axes). Returns false
 *  for 'old' (loco() keeps its own). ph = the stride's phase, armF its signed size (A.armSign × |mz|, ≥ 0.65),
 *  s = the sprint (0..1), tilt = the torso's lean forward (rad: the pelvis's and the spine's pitch). */
export function runSword(OUT, ph, armF, s, tilt = 0) {
  const mode = PICK.mode;
  if (mode === 'old') return false;
  const K = RUN_SWORDS[mode], R = K.run, S = K.sprint;
  // the right hand comes forward with the left leg (cs = +1 as the left foot lands in front)
  const cs = Math.cos(2 * Math.PI * (ph - RUN_SWORDS.lag));
  const sw = clamp(cs * (Number.isFinite(armF) ? armF : 1), -1, 1); // +1 forward
  const f = 0.5 + 0.5 * sw;
  const tl = Number.isFinite(tilt) ? clamp(tilt, -0.6, 1.0) : 0;
  const phi = lerp(R.phi[0], S.phi[0], s) + lerp(R.phi[1], S.phi[1], s) * sw;
  const ab = lerp(R.ab, S.ab, s), el = lerp(lerp(R.el[0], R.el[1], f), lerp(S.el[0], S.el[1], f), s);
  const gr = lerp(lerp(R.grip[0], R.grip[1], f), lerp(S.grip[0], S.grip[1], f), s);
  const out = lerp(R.out, S.out, s), side = lerp(R.side, S.side, s);
  // forward kinematics in the torso's frame: the upper arm (out to his right: −x), the forearm bent
  // forward in its plane; then the whole arm turned with the lean (about x: the torso's "down" tips back)
  const p = phi * D, a = ab * D, ca = Math.cos(a), sa = Math.sin(a);
  U[0] = -sa;
  U[1] = -ca * Math.cos(p);
  U[2] = ca * Math.sin(p);
  const fa = p + (Math.PI - el * D); // the forearm's angle from hanging, in the swing's plane (torso)
  F[0] = -sa * side;
  F[1] = -Math.cos(fa);
  F[2] = Math.sin(fa);
  nrm(F);
  tiltX(U, tl);
  tiltX(F, tl);
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
  // the blade: the forearm's line (now against level ground) turned forward and up by the grip, and a
  // little out to his right; never steeper down than `low` (the point off the grass)
  const fb = Math.atan2(F[2], -F[1]); // the forearm's angle from hanging, body axes
  const elev = Math.max(fb + gr * D - Math.PI / 2, -RUN_SWORDS.low * D);
  const o = out * D, ce = Math.cos(elev);
  const Dd = OUT.d;
  Dd[0] = -ce * Math.sin(o);
  Dd[1] = Math.sin(elev);
  Dd[2] = ce * Math.cos(o);
  // the flat: square to the blade, out to his right (edge down) rolled `roll` toward the sky
  const r = K.roll * D, Fl = OUT.f;
  Fl[0] = -Math.cos(r) * Math.cos(o);
  Fl[1] = Math.sin(r);
  Fl[2] = -Math.cos(r) * Math.sin(o);
  return true;
}
function tiltX(v, t) {
  const c = Math.cos(t), s = Math.sin(t), y = v[1], z = v[2];
  v[1] = y * c - z * s;
  v[2] = y * s + z * c;
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
