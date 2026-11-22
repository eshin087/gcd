import { DIM } from '../../player/model.js';
import { createDuelPoses } from '../duelist/poses.js';

// The Clockwork Marshal's two stances (ADR-135): one rig, two bodies, each with its own guard and its own
// set of reaction clips, picked by body as the Starless Lord picks by form (marshal.js POSES reads
// A.player.form: 1 = the suit, 2 = the pilot). The pose functions are the duelists' (duelist/poses.js).

const ANK = DIM.ankle;

// The SUIT: a bronze war-suit drawn at 1.75 x. Wide and heavy, the knees bent under the weight, both
// gauntlets on the lance, its point low and out before him (to the camera above and behind the hero,
// the shaft reads as one long bar across his front). The head (the bell helm) a little bowed.
const SUIT = {
  bX: 0.0, bY: -0.16, bZ: 0.0, pitch: 0.06, yaw: 0.42, roll: 0,
  hip: 0.06, hipZ: 0.0, hipX: 0.0, spX: 0.02, spY: -0.12, spZ: 0.0,
  hdX: 0.1, hdY: -0.3, hdZ: 0.0, two: 1, flat: 1, rFy: -0.45, lFy: 0.4,
  rH: [0.06, -0.3, 0.24], rP: [-0.8, -0.5, -0.3], lH: [0.18, -0.2, 0.3], lP: [0.8, -0.4, -0.2],
  swF: [0, 1, 0], rK: [-0.4, 0, 1], lK: [0.5, 0, 0.9],
  rF: [-0.27, ANK, 0.26], lF: [0.28, ANK, -0.24],
  sw: [-0.45, -0.18],
};

// The PILOT: Gongshu Yan, gaunt and light on her feet: the straight sabre out low at her right side, the
// forearm-long hand-lance raised before her in the off hand, its mouth on the opponent.
const PILOT = {
  bX: 0.0, bY: -0.09, bZ: 0.0, pitch: 0.02, yaw: 0.34, roll: 0,
  hip: 0.04, hipZ: 0.0, hipX: 0.0, spX: -0.02, spY: -0.1, spZ: 0.0,
  hdX: 0.06, hdY: -0.24, hdZ: 0.0, two: 0, flat: 0.95, rFy: -0.3, lFy: 0.55,
  rH: [-0.06, -0.4, 0.1], rP: [-0.8, -0.4, -0.4], lH: [0.08, -0.08, 0.36], lP: [0.8, -0.5, -0.2],
  swF: [0, 1, 0], rK: [-0.3, 0, 1], lK: [0.5, 0, 0.9],
  rF: [-0.16, ANK, 0.2], lF: [0.2, ANK, -0.2],
  sw: [-1.0, -0.6],
};

export const GUARDS = Object.freeze([Object.freeze(SUIT), Object.freeze(PILOT)]);

/** One pose set per body (index 0 = the suit, 1 = the pilot): the suit breathes slow and heavy and
 *  runs with the lance carried low across him; the pilot as the Lord. */
export const BODY_POSES = Object.freeze([
  createDuelPoses(SUIT, { breath: { k: 2.6, period: 4.2 }, run: { hand: [0.04, -0.34, 0.16], pole: [-0.8, -0.5, -0.3], blade: [-1.2, -0.1], flat: [0, 1, 0] } }),
  createDuelPoses(PILOT, { breath: { k: 1.6, period: 3.2 } }),
]);

/** The pose set of a body: 1 = the suit, 2 = the pilot (clamped). */
export const bodyPoses = (body) => BODY_POSES[body >= 2 ? 1 : 0];
/** Which body a phase is: the suit in phases 1 - 3, the pilot in 4. */
export const bodyOf = (phase) => (phase >= 4 ? 2 : 1);
