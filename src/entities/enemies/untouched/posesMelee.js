import { X as ASC } from '../ascendant/moves.js';

// Bai Wuji's melee pose fragments and reaction clips (the MELEE AGENT's file). Merged by poses.js (the
// router: its header has the rule). EVERY NAME HERE STARTS WITH `ml` (fragments and clips alike), so
// it never meets a name of the body's poses.js (unprefixed), posesSpells.js (`sp`) or posesTerrain.js
// (`tr`). Do not import poses.js from here (a cycle): build fragments with Tian Lei's `F` (ASC.F).
// Exports: FRAGS { mlName: pose }  · CLIPS { mlName: { dur, hold?, keys: [[t, pose], ...] } } ·
//          REACT { mlName: { travel, side? } } · OPEN [mlName, ...] (clips that leave him open)
// (Body space as ascendant/moves.js: +x his LEFT, +y up, +z forward; hands offsets from each shoulder,
// feet model space [x, z] or [x, y, z]. The hands of a phase-1 blow are put back in his pockets by
// moves/melee.js `pocket`, so the fragments below author them for the later phases.)
const { F, ANK } = ASC;

export const FRAGS = Object.freeze({
  mlBlinkCrouch: F({ bY: -0.2, pitch: 0.18, hdX: 0.1, rH: [0.06, -0.3, 0.1], lH: [-0.06, -0.3, 0.1], flat: 0.5 }),
  // THE STOMP: the right knee drawn up to the belt, the weight sunk on the left leg, the chin down
  mlStompLift: F({ yaw: -0.1, bY: -0.06, pitch: -0.04, hdX: 0.12, rF: [-0.16, 0.72, 0.16], rK: [-0.1, 0.7, 1], lF: [0.14, 0.02], lFy: 0.15, rH: [0.06, -0.2, 0.18], lH: [-0.06, -0.2, 0.2] }),
  // ... and driven down through the road: sunk deep, both feet planted wide, the head down
  mlStomp: F({ yaw: 0.0, bY: -0.42, pitch: 0.2, hdX: 0.3, spX: 0.08, rF: [-0.24, ANK + 0.01, 0.08], lF: [0.22, -0.06], rK: [-0.6, 0, 0.8], lK: [0.6, 0, 0.8], rFy: -0.4, lFy: 0.4, rH: [0.02, -0.34, 0.2], lH: [-0.02, -0.34, 0.2] }),
  // DARK SPARK: the right fist drawn back past the hip, the whole body wound away from the hero, the
  // lead hand open before him (a measure), the weight back and low: a long hold that reads as a charge
  mlSparkCoil: F({ yaw: -0.95, bY: -0.32, bZ: -0.06, pitch: 0.08, hip: -0.2, spY: -0.1, rH: [-0.04, -0.16, -0.12], rP: [-0.8, -0.6, -0.5], lH: [-0.02, 0.08, 0.5], lP: [0.8, -0.8, -0.1], lF: [0.26, 0.42], rF: [-0.24, -0.38], lFy: 0.3, rFy: -0.7, lK: [0.4, 0, 0.9], rK: [-0.5, -0.2, 0.8] }),
  // ... and thrown straight through: the hips and the rear foot turned over, the arm all the way out
  mlSpark: F({ yaw: 0.42, bY: -0.28, bZ: 0.2, pitch: 0.14, hip: 0.22, spY: 0.12, rH: [0.1, 0.02, 0.62], rP: [-0.8, -0.3, -0.4], lH: [-0.06, 0.02, 0.12], lF: [0.2, 0.6], rF: [-0.2, -0.2], lFy: 0.2, rFy: 0.2, lK: [0.3, 0, 1], rK: [-0.1, 0, 1] }),
  // THE PLANT: both palms high over his head, then brought down flat before him to the road
  mlPlantHigh: F({ yaw: 0.0, bY: -0.04, pitch: -0.16, spX: -0.08, rH: [0.14, 0.52, 0.16], lH: [-0.14, 0.52, 0.16], rP: [-0.7, 0.5, -0.4], lP: [0.7, 0.5, -0.4], lF: [0.18, 0.22], rF: [-0.18, -0.2] }),
  mlPlant: F({ yaw: 0.0, bY: -0.56, pitch: 0.48, spX: 0.24, hdX: 0.34, rH: [0.12, -0.3, 0.5], lH: [-0.12, -0.3, 0.5], rP: [-0.8, -0.8, -0.2], lP: [0.8, -0.8, -0.2], lF: [0.28, 0.4], rF: [-0.28, -0.3], lK: [0.6, 0, 0.8], rK: [-0.6, 0, 0.8], lFy: 0.3, rFy: -0.6 }),
  // THE LARIAT (the blink-through): the right arm out straight at the side, the body leaning into a run
  mlLariatCoil: F({ yaw: -0.6, bY: -0.3, pitch: 0.18, rH: [-0.42, 0.12, 0.02], rP: [-0.9, 0.3, -0.2], lH: [0.04, 0.0, 0.26], lF: [0.2, 0.46], rF: [-0.2, -0.36], lFy: 0.2, rFy: -0.3 }),
  mlLariat: F({ yaw: 0.7, bY: -0.24, bZ: 0.16, pitch: 0.14, hip: 0.2, rH: [-0.5, 0.14, 0.3], rP: [-0.9, 0.4, 0.1], lH: [0.06, 0.02, 0.18], lF: [0.2, 0.6], rF: [-0.2, -0.3], lFy: 0.2, rFy: 0.1 }),
});
export const CLIPS = Object.freeze({});
export const REACT = Object.freeze({});
export const OPEN = Object.freeze([]);
