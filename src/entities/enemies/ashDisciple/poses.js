import { DIM } from '../../player/model.js';
import { createDuelPoses, azEl, dirLerp } from '../duelist/poses.js';
import { refMove, GUARD_REF as RG } from './refLook.js';

// The Ash Disciple's guard stance and the pose functions built round it (duelist/poses.js: the clip
// format, the blade-driven arm, the gait). Nothing here mirrors the hero: his stance is a jian guard,
// and every move or reaction is a keyframe clip compiled from data (moves.js).

const ANK = DIM.ankle;

/** His guard (no breathing): the static pose clips start from and return to. Exported for the data.
 *  The owner's pick of three (2026-11-12, "A"): the classic jian guard. Side-on and sunk, the right
 *  foot forward; the jian held out at chest height pointing straight at the opponent; the free hand's
 *  sword-finger raised in an arc over the head. */
const GUARD_BASE = Object.freeze({
  bX: 0.02, bY: -0.16, bZ: 0.02, pitch: 0.02, yaw: 0.62, roll: 0,
  hip: 0.08, hipZ: 0.03, hipX: 0.02, spX: 0.06, spY: -0.18, spZ: -0.02,
  hdX: 0.04, hdY: -0.5, hdZ: 0.02, two: 0, flat: 0.95, rFy: -0.25, lFy: 0.9,
  rH: [0.02, -0.12, 0.44], rP: [-0.7, -0.6, -0.2], lH: [-0.08, 0.5, -0.04], lP: [0.8, 0.4, -0.3],
  swF: [0, 1, 0], rK: [-0.3, 0, 1], lK: [0.6, 0, 0.8],
  rF: [-0.12, ANK, 0.36], lF: [0.2, ANK, -0.3],
  sw: [-0.52, 0.14],
});
export const GUARD = GUARD_BASE;

const K = createDuelPoses(GUARD);
export const { duelStance, duelLoco, compileClip, completeBeat, evalClip, duelClip } = K;
// `?ashRefMove=a` (refLook.js, ADR-289): the reference pack's guard: the same blade and sword-finger, on a
// lower, wider stance (F01 / P01 / A01 08 / V01 base pose). Every clip compiled while it is on is compiled
// round it, so a clip starts from it and returns to it.
export const GUARD_REFP = Object.freeze({
  ...GUARD_BASE,
  bY: GUARD_BASE.bY - RG.sink,
  rF: [GUARD_BASE.rF[0] - RG.wide, GUARD_BASE.rF[1], GUARD_BASE.rF[2] * RG.stride],
  lF: [GUARD_BASE.lF[0] + RG.wide, GUARD_BASE.lF[1], GUARD_BASE.lF[2] * RG.stride],
  rK: [GUARD_BASE.rK[0] - RG.knee, GUARD_BASE.rK[1], GUARD_BASE.rK[2]],
  lK: [GUARD_BASE.lK[0] + RG.knee, GUARD_BASE.lK[1], GUARD_BASE.lK[2]],
});
export const K_REF = createDuelPoses(GUARD_REFP);
/** The pose set playing now: the reference's while `?ashRefMove` is on. */
export const posesNow = () => (refMove() ? K_REF : K);
/** A clip compiled round the guard playing now (the realiser's: moves.js). */
export const compileClipNow = (keys, dur, o) => posesNow().compileClip(keys, dur, o);

/** The pose table HeroAnimator takes for him (live: a clip carries its own set, `clip.kit`; the stance
 *  between moves is the set playing now). */
export const DUEL_POSES = Object.freeze({
  loco: (p, A) => posesNow().duelLoco(p, A),
  duel: (p, A) => posesNow().duelClip(p, A),
});

export { azEl, dirLerp };
