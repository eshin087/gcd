import { DIM } from '../../player/model.js';
import { P } from '../../player/anim.js';
import { smoothstep } from '../../../core/math.js';
import { createDuelPoses } from '../duelist/poses.js';

// Lu Wusheng's stance and the pose functions built round it (duelist/poses.js). His guard is no
// guard: he stands nearly upright, the sheathed sword hanging in his right hand by the scabbard,
// low, its point toward the ground before him, like something he does not mean to use; the left
// thumb hooked in his sash, the head a little bowed (ADR-151: the carry of a man who does not mean to
// draw). `lsw` is the scabbard's direction when it is at his LEFT hip (the settle, the draw, the
// re-sheathe: sheathed.js poses the left-wrist piece along it): back and down from the hip.

const ANK = DIM.ankle;

const GUARD_BASE = Object.freeze({
  bX: 0.0, bY: -0.07, bZ: 0.0, pitch: 0.02, yaw: 0.3, roll: 0,
  hip: 0.04, hipZ: 0.02, hipX: 0.0, spX: 0.06, spY: -0.08, spZ: 0.0,
  hdX: 0.12, hdY: -0.24, hdZ: 0.0, two: 0, flat: 0.95, rFy: -0.2, lFy: 0.6,
  // the sword hand low at his right side, a little forward; the scabbard toward the ground ahead;
  // the left hand at rest on the sash, the elbow out
  rH: [-0.04, -0.45, 0.12], rP: [-0.6, -0.8, -0.2], lH: [-0.1, -0.32, 0.15], lP: [0.9, -0.3, -0.3],
  swF: [0, 1, 0], rK: [-0.2, 0, 1], lK: [0.4, 0, 0.9],
  rF: [-0.12, ANK, 0.22], lF: [0.15, ANK, -0.2],
  sw: [-0.2, -0.95],
  lsw: [2.85, -0.55],
});
export const GUARD = GUARD_BASE;

/** The run (ADR-151): low, the body pitched into it, the sheathed sword held back at the hip, nearly
 *  level (createDuelPoses opt.run), the empty left hand back at its own hip; the quiet breath. */
export const SHEATH_RUN = Object.freeze({ hand: [-0.09, -0.3, -0.16], pole: [-0.7, -0.2, -0.6], blade: [-2.95, -0.2], flat: [0, 1, 0], sink: 0.08, lean: 0.16 });
export const SHEATH_BREATH = Object.freeze({ k: 0.65, period: 4.6 });

const K = createDuelPoses(GUARD, { run: SHEATH_RUN, breath: SHEATH_BREATH });
export const { duelStance, compileClip, completeBeat, evalClip, duelClip } = K;

/** His footwork: the duelist's, sunk and pitched forward as he runs (drawn only: the feet stay the
 *  gait planner's, the knees take the sink). */
export function duelLoco(p, A) {
  K.duelLoco(p, A);
  const k = smoothstep(2.4, 4.2, A?.speedS ?? 0) * (A?.moveW ?? 0);
  if (!(k > 0.001)) return;
  p[P.bodyY] -= SHEATH_RUN.sink * k;
  p[P.pitch] += SHEATH_RUN.lean * k;
  p[P.hdX] -= SHEATH_RUN.lean * 0.7 * k; // (the eyes stay on the road)
}

/** The pose table HeroAnimator takes for him. */
export const SHEATH_POSES = Object.freeze({ loco: duelLoco, duel: duelClip });
