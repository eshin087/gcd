import { DIM } from '../../player/model.js';
import { createDuelPoses } from '../duelist/poses.js';
import { GUARDS } from '../ascendant/poses.js';

// Wen Yao's guard and the pose functions built round it (duelist/poses.js: the clip format, the gait).
// He fights BARE-HANDED (ADR-147; the owner: "a fist fighter"): his hands are keyed, never driven by a
// blade path; the engine's blade channel `sw` only turns the right fist on the weapon joint (as Tian
// Lei's, ascendant/poses.js). The stance is Tian Lei's loose second guard (the LEFT foot leads, the body
// turned to his right) with the lead hand held out OPEN, palm up: the hand the Pearl is shaped in, and
// a beckoning hand. No hand seals.

const ANK = DIM.ankle;
const LOOSE = GUARDS[1];

/** His guard (the pose his clips start from and return to). Exported for the data. */
export const GUARD = Object.freeze({
  ...LOOSE,
  bY: -0.12, pitch: 0.04, yaw: -0.34, hdY: 0.3,
  // the lead hand forward at chest height, open, palm up; the rear fist low at the hip
  lH: [0.02, -0.04, 0.46], lP: [0.6, -0.85, 0.1],
  rH: [0.04, -0.24, 0.12], rP: [-0.8, -0.5, -0.4],
  rF: [-0.18, ANK, -0.2], lF: [0.18, ANK, 0.24],
});

const K = createDuelPoses(GUARD, { breath: { k: 1.1, period: 3.4 } });
export const { duelStance, duelLoco, compileClip, completeBeat, evalClip, duelClip } = K;
/** The pose table HeroAnimator takes for him (and for each of his paper selves). */
export const FOX_POSES = K.POSES;
