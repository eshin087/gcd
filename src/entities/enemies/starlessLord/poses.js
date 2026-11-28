import { P, v3, to3 } from '../../player/anim.js';
import { DIM } from '../../player/model.js';
import { clamp, lerp } from '../../../core/math.js';
import { createDuelPoses, setSw } from '../duelist/poses.js';
import { refMove } from './refLook.js';

// The Starless Lord's four guard stances, one per blade form, the pose functions built round each
// (duelist/poses.js: the clip format, the blade-driven arms, the gait) and his GLIDE: past a walk he
// does not run, he is carried: the feet leave the floor, the legs trail, the cape streams behind
// (lord.js lifts the root and picks the pose). A clip compiled in one form remembers its stance, so
// the animator can blend a transition from the old form's guard into the new one's.

const ANK = DIM.ankle;

// A tall, square, unhurried bearing: the weight even, the chest open, the head a little bowed on the
// opponent. Each stance shows its steel to the fight camera (above and behind the hero): a blade
// held out low at his side, across him, or upright before him, never hidden against his body.
const BASE = {
  bX: 0.0, bY: -0.07, bZ: 0.0, pitch: 0.0, yaw: 0.26, roll: 0,
  hip: 0.04, hipZ: 0.0, hipX: 0.0, spX: -0.03, spY: -0.08, spZ: 0.0,
  hdX: 0.07, hdY: -0.2, hdZ: 0.0, two: 0, flat: 0.95, rFy: -0.3, lFy: 0.55,
  rH: [-0.05, -0.42, 0.08], rP: [-0.8, -0.4, -0.4], lH: [0.12, -0.2, 0.26], lP: [0.8, -0.4, -0.3],
  swF: [0, 1, 0], rK: [-0.3, 0, 1], lK: [0.5, 0, 0.9],
  rF: [-0.16, ANK, 0.2], lF: [0.2, ANK, -0.2],
  sw: [-0.95, -0.66],
};

/** The guards (body space: +x his left, +z forward; `sw` / `lsw` = a blade's [az, el]). */
export const GUARDS = Object.freeze([
  // 1 — one blade: it hangs lit at his right side, its point out and down, as if it weighed
  // nothing; the free hand is raised before him, half closed (the hand that casts)
  Object.freeze({ ...BASE }),
  // 2 — twin blades: square to the opponent, both blades out low at his sides: a pair of wings
  Object.freeze({
    ...BASE, yaw: 0.06, bY: -0.11, spY: 0, hdY: -0.04, hip: 0,
    rH: [-0.1, -0.4, 0.1], rP: [-0.9, -0.4, -0.3], sw: [-1.08, -0.56],
    lH: [0.1, -0.4, 0.1], lP: [0.9, -0.4, -0.3], lsw: [1.08, -0.56],
    rF: [-0.2, ANK, 0.12], lF: [0.2, ANK, -0.12], rFy: -0.35, lFy: 0.35,
  }),
  // 3 — the staff: both hands on the long hilt, held level across him at the waist: one red bar
  // from side to side
  Object.freeze({
    ...BASE, yaw: 0.14, bY: -0.1, two: 1, spY: -0.04, hdY: -0.1,
    rH: [0.04, -0.3, 0.3], rP: [-0.7, -0.6, -0.3], sw: [-1.4, 0.14],
    rF: [-0.18, ANK, 0.18], lF: [0.2, ANK, -0.18],
  }),
  // 4 — the cross-hilted blade: both hands at the breastbone, the blade upright before his face
  Object.freeze({
    ...BASE, yaw: 0.1, bY: -0.08, two: 1, spY: -0.02, hdY: -0.06, hdX: 0.1,
    rH: [0.13, -0.22, 0.27], rP: [-0.85, -0.5, -0.1], sw: [0.0, 1.42],
    rF: [-0.17, ANK, 0.16], lF: [0.19, ANK, -0.16],
  }),
]);

/** How each form carries its steel in the glide: the sword hand, its elbow pole, the blade [az, el]
 *  (and the off-hand blade's), whether both hands hold it, and the free hand (form 1: reaching). */
const CARRY = [
  { rH: [-0.16, -0.4, -0.12], rP: [-0.8, -0.3, -0.5], sw: [-2.5, -0.36], two: 0, lH: [0.1, -0.06, 0.4], lP: [0.7, -0.5, 0.1] },
  { rH: [-0.2, -0.38, -0.1], rP: [-0.9, -0.3, -0.5], sw: [-2.45, -0.3], two: 0, lH: [0.2, -0.38, -0.1], lP: [0.9, -0.3, -0.5], lsw: [2.45, -0.3] },
  { rH: [0.02, -0.32, 0.22], rP: [-0.7, -0.6, -0.3], sw: [-1.5, 0.05], two: 1 },
  { rH: [-0.1, -0.36, 0.02], rP: [-0.8, -0.4, -0.4], sw: [-2.3, -0.42], two: 1 },
];

/** One pose set per form (index 0 = form 1): a heavy, slow breath; the staff carried level at a run. */
const poseSet = (G, i) =>
  createDuelPoses(G, {
    breath: { k: 2.2, period: 3.6 },
    ...(i === 2 ? { run: { hand: [-0.05, -0.34, 0.1], pole: [-0.8, -0.4, -0.3], blade: [-1.3, 0.2], flat: [0, 1, 0] } } : {}),
  });
export const FORM_POSES = GUARDS.map(poseSet);

// ---------------------------------------------------------------- after the reference pack (ADR-277)
// `?lordRefMove=a` (refLook.js): the reference's grounded bearing: every guard lower on wider feet (the
// knees bent, the weight down: its "slow grounded" stance), form 1's free hand a fist at his side
// (01 T07 / G1), form 3's hands wide on the staff (lord.js: the off hand down the joined hilt), form 4
// upright with the hands under the cross-guard and the point over his head (13 H1, which replaces every
// form-4 guard drawn point-down on the earlier sheets).
const REF_GUARD = { sink: 0.09, wide: 0.06, stride: 1.12 };
const grounded = (G, k = {}) => Object.freeze({
  ...G,
  bY: G.bY - REF_GUARD.sink,
  rF: [G.rF[0] - REF_GUARD.wide, G.rF[1], G.rF[2] * REF_GUARD.stride],
  lF: [G.lF[0] + REF_GUARD.wide, G.lF[1], G.lF[2] * REF_GUARD.stride],
  rK: [G.rK[0] - 0.1, G.rK[1], G.rK[2]],
  lK: [G.lK[0] + 0.1, G.lK[1], G.lK[2]],
  ...k,
});
export const GUARDS_REF = Object.freeze([
  grounded(GUARDS[0], { lH: [0.2, -0.34, 0.16], lP: [0.8, -0.5, -0.2] }),
  grounded(GUARDS[1]),
  grounded(GUARDS[2]),
  grounded(GUARDS[3], { rH: [0.13, -0.24, 0.28], sw: [0.0, 1.46] }),
]);
export const FORM_POSES_REF = GUARDS_REF.map(poseSet);

/** The pose set of a form (1-based, clamped): the reference's while `?lordRefMove` is on. */
export const formPoses = (form) => {
  const S = refMove() ? FORM_POSES_REF : FORM_POSES;
  return S[Math.min(S.length, Math.max(1, form | 0)) - 1];
};

const GLIDE_0 = { bz: 0.06, pitch: 0.2, roll: 0.15, trail: [0.2, 0.36] };
const GLIDE_REF = { bz: 0.1, pitch: 0.32, roll: 0.22, trail: [0.3, 0.5] };

/**
 * The glide (animator key 'glide': not a walking clip, so the foot planner leaves the feet alone):
 * his guard's body leaned into the way he is carried (A.mx / A.mz: the move direction in model
 * space), the legs hanging and trailing, the toes down, the steel carried low behind him.
 */
export function glidePose(p, A) {
  const f = clamp((A.player?.form ?? 1) | 0, 1, CARRY.length), K = formPoses(f), C = CARRY[f - 1];
  K.duelStance(p, A);
  const mx = clamp(A.mx ?? 0, -1, 1), mz = clamp(A.mz ?? 1, -1, 1);
  const t = A.time ?? 0, bob = Math.sin(t * 2.4), sway = Math.sin(t * 1.3 + 0.8);
  // (ADR-277, `?lordRefMove`: 02 L2 / L3: inclined further into the glide, the legs trailing further)
  const R = refMove() ? GLIDE_REF : GLIDE_0;
  p[P.bodyY] = -0.03 + 0.018 * bob;
  p[P.bodyZ] = R.bz * mz;
  p[P.bodyX] = 0.03 * mx;
  p[P.pitch] = R.pitch * mz;
  p[P.roll] = -R.roll * mx + 0.02 * sway;
  p[P.yaw] = lerp(K.GUARD.yaw, 0.04, 0.7);
  p[P.pelvY] = 0.02;
  p[P.spX] = -0.08 * mz;
  p[P.spY] = 0;
  p[P.hdX] = -0.1 * mz + 0.04;
  p[P.hdY] = -0.04;
  // the legs: one a little ahead of the other, both trailing the way he came from
  v3(p, P.rF, -0.1 - 0.1 * mx, 0.1 + 0.014 * bob, -0.06 - R.trail[0] * mz);
  v3(p, P.lF, 0.12 - 0.1 * mx, 0.2 - 0.014 * bob, -0.02 - R.trail[1] * mz);
  v3(p, P.rK, -0.12, 0, 1);
  v3(p, P.lK, 0.2, 0, 1);
  p[P.rFy] = -0.12;
  p[P.lFy] = 0.16;
  p[P.footFlat] = 0.2;
  p[P.rFf] = 0.4;
  p[P.lFf] = 0.2;
  to3(p, P.rH, C.rH[0], C.rH[1], C.rH[2], 1);
  to3(p, P.rP, C.rP[0], C.rP[1], C.rP[2], 1);
  setSw(p, C.sw[0] + 0.03 * sway, C.sw[1] + 0.02 * bob);
  p[P.twoHand] = C.two;
  if (C.lH) {
    to3(p, P.lH, C.lH[0], C.lH[1] + 0.01 * bob, C.lH[2], 1);
    to3(p, P.lP, C.lP[0], C.lP[1], C.lP[2], 1);
  }
  if (C.lsw) {
    const o = A.off ?? (A.off = { az: 0, el: 0 });
    o.az = C.lsw[0] - 0.03 * sway;
    o.el = C.lsw[1] + 0.02 * bob;
  }
}
