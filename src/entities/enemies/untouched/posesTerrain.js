import { DIM } from '../../player/model.js';

// Bai Wuji's terrain pose fragments and reaction clips (the TERRAIN AGENT's file). Merged by poses.js (the
// router: its header has the rule). EVERY NAME HERE STARTS WITH `tr` (fragments and clips alike).
// Do not import poses.js from here (a cycle). These fragments are PARTIAL: only the channels they move
// (body space: +x his LEFT, +y up, +z forward; hands are offsets from each shoulder). moves/terrain.js
// lays them over the body's STAND (`{ ...FRAGS.STAND, ...FRAGS.trGaze }`), so his stance, his tilt and
// the hand left in its pocket stay the body agent's.
// Exports: FRAGS · CLIPS · REACT · OPEN (posesMelee.js header).
const ANK = DIM.ankle;

export const FRAGS = Object.freeze({
  /** He looks at the piece he lifts: the chin up a little, the head turned, the hands still in his
   *  pockets (Curb Pull: "without taking a hand from his pocket"). */
  trGaze: Object.freeze({ pitch: -0.06, hdX: -0.16, hdZ: 0.02, spX: -0.04 }),
  /** ... and a nod: the head dips toward the hero (the throw). */
  trNod: Object.freeze({ pitch: 0.02, hdX: 0.14, hdZ: -0.04, spX: 0.02 }),
  /** The right hand out of its pocket, raised high, two fingers up toward a tower's top. */
  trRaise: Object.freeze({ pitch: -0.1, hdX: -0.26, spX: -0.08, rH: [-0.1, 0.6, 0.24], rP: [-0.9, 0.5, 0.0], sw: [0.4, 1.3] }),
  /** ... brought down: the hand drawn down before him, the chest over it. */
  trPullDown: Object.freeze({ pitch: 0.1, bY: -0.05, hdX: 0.1, spX: 0.06, rH: [-0.04, -0.08, 0.44], rP: [-0.8, -0.5, 0.1], sw: [0.2, -0.2] }),
  /** Both hands out at his hips, palms up, the elbows loose: what turns round him is his. */
  trConduct: Object.freeze({ hdX: -0.04, rH: [-0.26, -0.24, 0.2], rP: [-0.9, -0.3, -0.1], lH: [0.26, -0.24, 0.2], lP: [0.9, -0.3, -0.1], sw: [0.1, 0.2] }),
  /** A flick of the right hand's fingers toward the hero (the orbit's cast, the void's). */
  trFlick: Object.freeze({ yaw: -0.08, hdX: 0.04, rH: [-0.04, 0.0, 0.52], rP: [-0.7, -0.5, 0.2], sw: [0.2, 0.0] }),
  /** The heel raised for the stomp (the hands in his pockets). */
  trHeelUp: Object.freeze({ bY: 0.02, pitch: -0.06, rF: [-0.15, 0.42, 0.12], rK: [-0.2, 0.5, 1], flat: 0.6 }),
  /** ... and down through the road. */
  trHeelDown: Object.freeze({ bY: -0.1, pitch: 0.06, hdX: 0.12, rF: [-0.15, ANK, 0.16], rK: [-0.25, 0, 1], flat: 1 }),
});
export const CLIPS = Object.freeze({});
export const REACT = Object.freeze({});
export const OPEN = Object.freeze([]);
