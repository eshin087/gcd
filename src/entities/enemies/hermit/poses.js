import { DIM } from '../../player/model.js';
import { createDuelPoses } from '../duelist/poses.js';

// Gu Shan's stances, one per phase, and the pose functions built round each (duelist/poses.js: the
// clip format, the gait). Bare hands, as Tian Lei's (ascendant/poses.js): the hands are KEYED (rH /
// lH, `arm` 0), never driven by a blade path; the "blade" channel `sw` only turns the right hand (it
// hangs on the weapon joint). Phases 1 and 2: ONE hand, the left held behind his back (it stays there
// through every move, ward and step: hermit.js pins it at a run). Phase 3 (BOTH HANDS): the left comes
// out. A clip compiled in one phase remembers its stance, so the transition blends between guards.

const ANK = DIM.ankle;

/** The right hand's grip axis [az, el]: the palm stood up, fingers to the sky. */
export const PALM_UP = [0.1, 1.25];
export const PALM_FLAT = [0, 0, 1];
/** The left hand held at the small of his back (an offset from the left shoulder), its elbow out. */
export const BEHIND = Object.freeze({ lH: [-0.16, -0.42, -0.2], lP: [0.9, -0.1, -0.7] });

// An old man's stance: upright, the right foot a little forward and the right side turned to the
// opponent (yaw > 0), the right palm open before his chest, the head level.
const BASE = {
  bX: 0.0, bY: -0.08, bZ: 0.0, pitch: 0.05, yaw: 0.26, roll: 0,
  hip: 0.08, hipZ: 0.0, hipX: 0.0, spX: 0.06, spY: 0.04, spZ: 0.0,
  hdX: 0.08, hdY: -0.24, hdZ: 0.0, two: 0, flat: 0.95, rFy: -0.15, lFy: 0.5,
  rH: [0.04, -0.06, 0.34], rP: [-0.8, -0.6, -0.2], ...BEHIND,
  swF: PALM_FLAT, rK: [-0.2, 0, 1], lK: [0.4, 0, 0.9],
  rF: [-0.15, ANK, 0.2], lF: [0.17, ANK, -0.16],
  sw: PALM_UP,
};

/** The guards (body space: +x his left, +z forward). */
export const GUARDS = Object.freeze([
  // 1 — the palm before his chest, the weight easy, barely a stance
  Object.freeze({ ...BASE }),
  // 2 — THE MOUNTAIN ANSWERS: lower and wider, the palm a little further out
  Object.freeze({
    ...BASE, bY: -0.16, pitch: 0.08, yaw: 0.32, hdY: -0.28,
    rH: [0.04, -0.02, 0.4], rF: [-0.2, ANK, 0.26], lF: [0.2, ANK, -0.2], rK: [-0.3, 0, 0.95], lK: [0.5, 0, 0.85],
  }),
  // 3 — BOTH HANDS: square to the opponent, both palms out, the left hand forward
  Object.freeze({
    ...BASE, bY: -0.2, pitch: 0.06, yaw: 0.08, hip: 0.02, hdY: -0.06,
    rH: [0.08, 0.02, 0.32], rP: [-0.8, -0.6, -0.2], lH: [-0.02, -0.06, 0.38], lP: [0.8, -0.6, -0.2],
    rF: [-0.24, ANK, 0.08], lF: [0.24, ANK, -0.06], rK: [-0.5, 0, 0.85], lK: [0.5, 0, 0.85], rFy: -0.35, lFy: 0.35,
  }),
]);

/** How each phase carries his hands at a run (createDuelPoses opt.run: the right hand, its elbow). */
const RUN = [
  { hand: [-0.06, -0.3, 0.12], pole: [-0.8, -0.5, -0.4], blade: [0.1, 0.9], flat: [0, 0, 1] },
  { hand: [-0.06, -0.3, 0.12], pole: [-0.8, -0.5, -0.4], blade: [0.1, 0.9], flat: [0, 0, 1] },
  { hand: [-0.08, -0.32, 0.06], pole: [-0.8, -0.4, -0.5], blade: [0.0, 0.6], flat: [0, 0, 1] },
];

/** One pose set per phase (index 0 = phase 1). A slow, deep breath. */
export const PHASE_POSES = GUARDS.map((G, i) => createDuelPoses(G, { breath: { k: 1.2, period: 4.2 }, run: RUN[i] }));

/** The pose set of a phase (1-based, clamped). */
export const phasePoses = (phase) => PHASE_POSES[Math.min(PHASE_POSES.length, Math.max(1, phase | 0)) - 1];
