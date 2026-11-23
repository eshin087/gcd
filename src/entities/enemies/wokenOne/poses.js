import { DIM } from '../../player/model.js';
import { createDuelPoses } from '../duelist/poses.js';
import { FIST_UP, FIST_FLAT } from '../ascendant/poses.js';

// Xin Yi's three guards, one per phase, and the pose functions built round each (duelist/poses.js: the
// clip format, the gait). Bare-handed as Tian Lei (ascendant/poses.js): his hands are KEYED (rH / lH),
// never driven by a blade path; the engine's blade channel `sw` only turns the right fist on the weapon
// joint. A clip compiled in one phase remembers its guard, so a transition blends from the old guard
// into the new one.
//   1  the Sparring Hall: upright and calm, the LEFT HAND BEHIND HIS BACK, the right hand loose and open
//      before him (he teaches with one hand)
//   2  the Pillared Hall: a gun in each hand, both held low before him, the coat open
//   3  the Source: square, the arms easy at his sides, the hands open (he no longer needs a guard)

const ANK = DIM.ankle;

/** The left hand behind his back (phase 1): the forearm across the small of the back. Exported: the
 *  phase-1 moves keep it there in every key (moves.js oneHand). */
export const BEHIND = Object.freeze({ lH: [-0.16, -0.36, -0.2], lP: [0.6, -0.2, -0.9] });

const BASE = {
  bX: 0.0, bY: -0.06, bZ: 0.0, pitch: 0.0, yaw: -0.3, roll: 0,
  hip: -0.06, hipZ: 0.0, hipX: 0.0, spX: -0.02, spY: 0.04, spZ: 0.0,
  hdX: 0.02, hdY: 0.26, hdZ: 0.0, two: 0, flat: 0.95, rFy: -0.4, lFy: 0.2,
  rH: [0.06, -0.1, 0.34], rP: [-0.8, -0.6, -0.2], lH: [0.0, 0.0, 0.3], lP: [0.8, -0.7, -0.1],
  swF: FIST_FLAT, rK: [-0.3, 0, 1], lK: [0.3, 0, 1],
  rF: [-0.16, ANK, -0.16], lF: [0.17, ANK, 0.2],
  sw: FIST_UP,
};

export const GUARDS = Object.freeze([
  // 1 — one hand: upright, the right hand forward and open at the belly, the left behind his back
  Object.freeze({ ...BASE, ...BEHIND, rH: [0.04, -0.2, 0.36], rP: [-0.8, -0.7, -0.1], sw: [0.3, 0.9] }),
  // 2 — iron: both hands low before him, the guns' muzzles down at the floor between them
  Object.freeze({
    ...BASE, bY: -0.12, yaw: -0.18, hdY: 0.16, rH: [0.04, -0.22, 0.32], rP: [-0.8, -0.6, -0.2], lH: [-0.04, -0.22, 0.32], lP: [0.8, -0.6, -0.2],
    rF: [-0.2, ANK, -0.14], lF: [0.2, ANK, 0.16], rK: [-0.4, 0, 0.9], lK: [0.4, 0, 0.9], sw: [0.0, 0.2],
  }),
  // 3 — open hands at his sides, barely a stance (Tian Lei's third form, a little looser)
  Object.freeze({
    ...BASE, bY: -0.02, pitch: -0.02, yaw: -0.08, hip: -0.02, spX: -0.04, spY: 0.0, hdY: 0.08, hdX: 0.0,
    rH: [-0.06, -0.5, 0.08], rP: [-0.9, -0.2, -0.3], lH: [0.06, -0.5, 0.08], lP: [0.9, -0.2, -0.3],
    rF: [-0.14, ANK, -0.06], lF: [0.15, ANK, 0.08], rK: [-0.2, 0, 1], lK: [0.2, 0, 1], rFy: -0.2, lFy: 0.15,
    sw: [0.0, -1.2],
  }),
]);

/** How each phase carries his hands at a run (createDuelPoses opt.run: the right hand, its elbow, the fist). */
const RUN = [
  { hand: [-0.04, -0.3, 0.1], pole: [-0.8, -0.4, -0.4], blade: [0.2, 0.8], flat: [0, 0, 1] },
  { hand: [-0.06, -0.3, 0.02], pole: [-0.8, -0.3, -0.5], blade: [0.0, 0.6], flat: [0, 0, 1] },
  { hand: [-0.14, -0.42, -0.16], pole: [-0.8, -0.3, -0.5], blade: [-0.6, -0.6], flat: [0, 0, 1] },
];

/** One pose set per phase (index 0 = phase 1). */
export const PHASE_POSES = GUARDS.map((G, i) => createDuelPoses(G, { breath: { k: 1.0, period: 3.6 }, run: RUN[i] }));

/** Phase 1's GEAR 2 (ADR-168: bar 1 at or under TUNING.gear2.at): both hands out, the lead (left) hand
 *  open forward, the rear (right) hand at the chest; a little lower and wider than the teacher's stance. */
export const GEAR2_GUARD = Object.freeze({
  ...BASE, bY: -0.12, yaw: -0.34, hdY: 0.3, rH: [0.1, 0.06, 0.2], rP: [-0.8, -0.7, -0.1], lH: [0.02, 0.1, 0.42], lP: [0.8, -0.8, 0.1],
  rF: [-0.2, ANK, -0.22], lF: [0.18, ANK, 0.26], rK: [-0.4, 0, 0.9], lK: [0.4, 0, 0.9], sw: [0.3, 0.6],
});
export const GEAR2_POSES = createDuelPoses(GEAR2_GUARD, { breath: { k: 1.0, period: 3.2 }, run: { hand: [-0.04, -0.3, 0.1], pole: [-0.8, -0.4, -0.4], blade: [0.2, 0.8], flat: [0, 0, 1] } });
/** The pose set he moves with: `set` 4 = phase 1's gear 2 (wokenOne.js pilot.pset). */
export const posesOf = (set) => (set === 4 ? GEAR2_POSES : phasePoses(set));
/** The pose set of a phase (1-based, clamped). */
export function phasePoses(ph) {
  return PHASE_POSES[Math.min(PHASE_POSES.length, Math.max(1, ph | 0)) - 1];
}
export { FIST_UP, FIST_FLAT };
