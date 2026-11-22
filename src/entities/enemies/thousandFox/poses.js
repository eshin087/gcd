import { DIM } from '../../player/model.js';
import { createDuelPoses } from '../duelist/poses.js';

// Wen Yao's guard and the pose functions built round it (duelist/poses.js: the clip format, the
// blade-driven arm, the gait). Low and side-on, the dao carried high over the rear shoulder, the free
// hand forward and OPEN, palm up: the hand the Pearl hangs over. No sword fingers, no seal.

const ANK = DIM.ankle;

/** His guard (the pose his clips start from and return to). Exported for the data. */
export const GUARD = Object.freeze({
  // (the LEFT foot leads: the body turned to his right, yaw < 0, the head turned back to the opponent)
  bX: 0.0, bY: -0.24, bZ: 0.0, pitch: 0.08, yaw: -0.72, roll: 0,
  hip: -0.12, hipZ: 0.0, hipX: 0.0, spX: 0.08, spY: 0.12, spZ: 0.0,
  hdX: 0.06, hdY: 0.6, hdZ: 0.0, two: 0, flat: 0.95, rFy: -0.6, lFy: 0.3,
  // the sword hand up by the rear shoulder, the dao's back along it, its point behind him and up
  rH: [-0.1, 0.16, -0.04], rP: [-0.8, 0.1, -0.5], sw: [-2.5, 0.7], swF: [0, 1, 0],
  // the free hand out toward the opponent at chest height, open, palm up
  lH: [0.06, -0.06, 0.44], lP: [0.6, -0.8, 0.1],
  rK: [-0.45, -0.1, 0.9], lK: [0.4, 0, 1],
  rF: [-0.22, ANK, -0.3], lF: [0.2, ANK, 0.32],
});

const K = createDuelPoses(GUARD, { breath: { k: 1.1, period: 3.4 } });
export const { duelStance, duelLoco, compileClip, completeBeat, evalClip, duelClip } = K;
/** The pose table HeroAnimator takes for him (and for each of his paper selves). */
export const FOX_POSES = K.POSES;
