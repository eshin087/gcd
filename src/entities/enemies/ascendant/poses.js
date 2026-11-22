import { DIM } from '../../player/model.js';
import { createDuelPoses } from '../duelist/poses.js';

// Tian Lei's three stances, one per form, and the pose functions built round each (duelist/poses.js:
// the clip format, the gait). He is bare-handed: his hands are KEYED (rH / lH, `arm` 0), never driven
// by a blade path; the "blade" channel `sw` only turns the right fist (it is built on the weapon joint:
// player/gear/base.js gripFist, the grip axis +Z through the fist; el ~ 1.2 = a vertical fist).
// A clip compiled in one form remembers its stance, so a transformation blends from the old guard
// into the new one.

const ANK = DIM.ankle;

/** The right fist's grip axis [az, el] and its flat: a vertical fist, knuckles to the front. */
export const FIST_UP = [0.15, 1.2];
export const FIST_FLAT = [0, 0, 1];

// An orthodox stance (the LEFT foot leads): the body turned a little to his right (yaw < 0), the lead
// (left) hand out in front, the rear (right) fist by the chin.
const BASE = {
  bX: 0.0, bY: -0.16, bZ: 0.02, pitch: 0.06, yaw: -0.42, roll: 0,
  hip: -0.1, hipZ: 0.0, hipX: 0.0, spX: 0.04, spY: 0.06, spZ: 0.0,
  hdX: 0.06, hdY: 0.36, hdZ: 0.0, two: 0, flat: 0.95, rFy: -0.55, lFy: 0.25,
  rH: [0.12, 0.06, 0.24], rP: [-0.8, -0.7, -0.1], lH: [0.0, 0.08, 0.38], lP: [0.8, -0.7, -0.1],
  swF: FIST_FLAT, rK: [-0.4, -0.1, 0.9], lK: [0.4, 0, 1],
  rF: [-0.2, ANK, -0.24], lF: [0.2, ANK, 0.28],
  sw: FIST_UP,
};

/** The guards (body space: +x his left, +z forward). */
export const GUARDS = Object.freeze([
  // 1 — the Challenger: a low, wide fighting stance, both fists up, the weight sunk
  Object.freeze({ ...BASE }),
  // 2 — Golden Ascension: looser and upright, the lead hand forward and OPEN, the rear fist low at the hip
  Object.freeze({
    ...BASE, bY: -0.07, pitch: 0.0, yaw: -0.28, hip: -0.06, spX: -0.02, spY: 0.04, hdY: 0.24, hdX: 0.03,
    rH: [0.02, -0.26, 0.14], rP: [-0.8, -0.5, -0.4], lH: [0.02, 0.02, 0.46], lP: [0.8, -0.6, -0.1],
    rF: [-0.16, ANK, -0.18], lF: [0.17, ANK, 0.2], rK: [-0.3, 0, 1], lK: [0.3, 0, 1], rFy: -0.45, lFy: 0.2,
    sw: [0.3, 0.9],
  }),
  // 3 — Thunder Ascension: arms at his sides, the hands open, barely a stance (he no longer needs one)
  Object.freeze({
    ...BASE, bY: -0.03, bZ: 0, pitch: -0.02, yaw: -0.1, hip: -0.02, spX: -0.04, spY: 0.0, hdY: 0.08, hdX: 0.0,
    rH: [-0.06, -0.5, 0.06], rP: [-0.9, -0.2, -0.3], lH: [0.06, -0.5, 0.06], lP: [0.9, -0.2, -0.3],
    rF: [-0.14, ANK, -0.06], lF: [0.15, ANK, 0.08], rK: [-0.2, 0, 1], lK: [0.2, 0, 1], rFy: -0.2, lFy: 0.15,
    sw: [0.0, -1.2],
  }),
]);

/** How each form carries his hands at a run (createDuelPoses opt.run: the right hand, its elbow, the fist). */
const RUN = [
  { hand: [-0.04, -0.2, 0.16], pole: [-0.8, -0.5, -0.4], blade: [0.2, 1.0], flat: [0, 0, 1] },
  { hand: [-0.08, -0.3, -0.04], pole: [-0.8, -0.3, -0.5], blade: [0.0, 0.6], flat: [0, 0, 1] },
  { hand: [-0.14, -0.42, -0.16], pole: [-0.8, -0.3, -0.5], blade: [-0.6, -0.6], flat: [0, 0, 1] },
];

/** One pose set per form (index 0 = form 1). */
export const FORM_POSES = GUARDS.map((G, i) => createDuelPoses(G, { breath: { k: 1.4, period: 3.0 }, run: RUN[i] }));

/** The pose set of a form (1-based, clamped). */
export const formPoses = (form) => FORM_POSES[Math.min(FORM_POSES.length, Math.max(1, form | 0)) - 1];
