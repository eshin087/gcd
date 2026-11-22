import { DIM } from '../../player/model.js';
import { createDuelPoses } from '../duelist/poses.js';

// Lu Wusheng's stance and the pose functions built round it (duelist/poses.js). His guard is no
// guard: he stands nearly upright, the sheathed sword hanging in his right hand by the scabbard,
// low, its point toward the ground before him, like something he does not mean to use; the left hand
// loose at his side. `lsw` is the scabbard's direction when it is at his LEFT hip (the settle, the
// draw, the re-sheathe: sheathed.js poses the left-wrist piece along it): back and down from the hip.

const ANK = DIM.ankle;

const GUARD_BASE = Object.freeze({
  bX: 0.0, bY: -0.08, bZ: 0.0, pitch: 0.02, yaw: 0.32, roll: 0,
  hip: 0.04, hipZ: 0.02, hipX: 0.0, spX: 0.04, spY: -0.08, spZ: 0.0,
  hdX: 0.06, hdY: -0.26, hdZ: 0.0, two: 0, flat: 0.95, rFy: -0.2, lFy: 0.6,
  // the sword hand low at his right side, a little forward; the scabbard toward the ground ahead
  rH: [-0.04, -0.44, 0.12], rP: [-0.6, -0.8, -0.2], lH: [0.04, -0.47, 0.02], lP: [0.6, -0.8, 0.1],
  swF: [0, 1, 0], rK: [-0.2, 0, 1], lK: [0.4, 0, 0.9],
  rF: [-0.12, ANK, 0.22], lF: [0.15, ANK, -0.2],
  sw: [-0.2, -0.95],
  lsw: [2.85, -0.55],
});
export const GUARD = GUARD_BASE;

const K = createDuelPoses(GUARD, {
  // at a run the scabbard is carried trailing low behind him
  run: { hand: [-0.08, -0.44, -0.04], blade: [-2.7, -0.6] },
  breath: { k: 0.8, period: 3.4 },
});
export const { duelStance, duelLoco, compileClip, completeBeat, evalClip, duelClip } = K;
/** The pose table HeroAnimator takes for him. */
export const SHEATH_POSES = K.POSES;
