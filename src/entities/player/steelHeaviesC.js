// The steel look set (`?lights=steel`, combat.js setLights; ADR-210): the lone heavy, the heavy after one light, and the charged heavy.
// Every clip here follows the owner's reference footage pose for pose (both arms, the body, the feet),
// fitted to this game's own clock: no number of any attack changes. Clip format: swings.js.
//
//   Piercing Gale    (HEAVY[0]) the footage's heavy, first hit: he turns side-on and sinks, the sword hand
//                    drawn back to the right hip with the blade hanging down and back behind him, the free
//                    fist held out toward the foe; then one long lunging one-handed thrust, the chest
//                    turning through to put the right shoulder forward, the arm straight out at shoulder
//                    height and the free arm thrown back and down; held, withdrawn to the chest, the point
//                    raised, and down to the stance. The root's dash (combat.js `travel`) is the lunge.
//   Rising Crescent  (HEAVY[1]) the footage's heavy, second hit: down into a deep crouch, the blade swept
//                    back under him to point behind, low; then he springs up and the blade comes forward
//                    along the ground, up through his front and over his head, a great vertical wheel on
//                    his right side that carries on down behind him: the arm ends stretched back and low,
//                    the point down, the free fist in at the waist, the stance wide.

import { STEEL_CHARGE as CH } from './steelStance.js';

export const STEEL_HEAVIES_C = {
  /** Piercing Gale (HEAVY[0]): the lunging one-handed thrust. */
  steelGale: {
    line: 'point',
    flat: [1, 0, 0],
    home: 1.0,
    settle: 0.5,
    dashPlant: true, // (agent e: the rear foot steps in and stays on the grass through the held lunge)
    fold: 0,
    keys: [
      // the turn begins: the hand back toward the hip, the blade swinging down
      { u: 0.45, h: [-0.14, -0.4, -0.04], a: [-140, -32], by: -0.16, bz: -0.04, hip: -0.45, sy: -0.35, sx: 0.12, l: [0.22, -0.26, 0.18], hs: 0 },
      // THE COIL (held while the button is): side-on and sunk, the hand back at the right hip, the blade
      // hanging down and back behind him, the free fist out toward the foe at the chest
      { u: 1.0, h: [-0.14, -0.44, 0.0], a: [-160, -68], by: -0.28, bz: -0.06, bx: -0.06, hip: -0.75, sy: -0.6, sx: 0.2, l: [0.32, -0.22, 0.12], lp: [0.2, -0.9, -0.3], hs: 0 },
      // the lunge: the hand comes forward past the hip, the blade swings round his right side
      { u: 1.3, h: [-0.18, -0.38, 0.1], a: [-45, -45], hip: -0.35, sy: -0.3 },
      { u: 1.6, h: [-0.06, -0.1, 0.4], a: [-18, 0], by: -0.24, bz: 0.08, hip: 0.1, sy: 0.15, sx: 0.16, hx: -0.06, l: [0.16, -0.38, -0.05], lp: [0.5, -0.8, -0.2] },
      // THE THRUST: the arm straight out ahead at shoulder height, the right shoulder forward, leaning
      // into a deep lunge, the free arm thrown back and down
      { u: 2.0, h: [0.08, 0.03, 0.54], a: [2, 6], by: -0.27, bz: 0.14, bx: 0.03, hip: 0.3, sy: 0.4, sx: 0.16, hx: -0.12, l: [0.06, -0.5, 0.08], lp: [0.5, -0.4, -0.75], hs: 0 },
      { u: 2.2, h: [0.09, 0.04, 0.55], a: [2, 7], by: -0.28, bz: 0.15, hip: 0.33, sy: 0.43, sx: 0.18, hx: -0.13 },
      { u: 2.4, h: [0.09, 0.03, 0.55], a: [2, 6], by: -0.28, bz: 0.15, hip: 0.33, sy: 0.43, sx: 0.17, hx: -0.12 },
      // the withdraw begins (the settle, 0.5 s, carries him the rest of the way home, as slowly as the reference)
      { u: 2.92, h: [0.04, -0.03, 0.47], a: [4, 9], by: -0.25, bz: 0.13, hip: 0.28, sy: 0.36, sx: 0.15, hx: -0.1, l: [0.07, -0.48, 0.08] },
    ],
  },
  /** The charged heavy's release (CLEAVE): the coil is the hold (its windup is 0.08 s), the lunge
   *  runs through the long active frames with the dash. */
  steelGaleRelease: {
    line: 'point',
    flat: [1, 0, 0],
    home: 1.0,
    settle: 0.5,
    dashPlant: true, // (agent e: the rear foot steps in and stays on the grass through the held lunge)
    fold: 0,
    keys: [
      // the hold's own pose (steelStance.js STEEL_CHARGE): the hand drawn back at his right, the blade down behind
      { u: 1.0, h: [...CH.rH], a: [...CH.sw], by: -0.26, bz: -0.04, bx: -0.04, hip: -0.42, sy: -0.5, sx: 0.36, l: [...CH.lH], lp: [...CH.lP], hs: 0 },
      { u: 1.1, h: [-0.2, -0.3, -0.24], a: [-125, -62] },
      { u: 1.25, h: [-0.16, -0.34, 0.04], a: [-60, -62], hip: -0.35, sy: -0.3 },
      { u: 1.45, h: [-0.06, -0.1, 0.4], a: [-20, 0], by: -0.24, bz: 0.08, hip: 0.1, sy: 0.15, sx: 0.16, hx: -0.06, l: [0.16, -0.38, -0.05], lp: [0.5, -0.8, -0.2] },
      { u: 1.7, h: [0.08, 0.03, 0.54], a: [2, 6], by: -0.27, bz: 0.14, bx: 0.03, hip: 0.3, sy: 0.4, sx: 0.16, hx: -0.12, l: [0.06, -0.5, 0.08], lp: [0.5, -0.4, -0.75], hs: 0 },
      { u: 2.0, h: [0.09, 0.04, 0.55], a: [2, 7], by: -0.28, bz: 0.15, hip: 0.33, sy: 0.43, sx: 0.18, hx: -0.13 },
      { u: 2.35, h: [0.09, 0.03, 0.55], a: [2, 6], by: -0.28, bz: 0.15, hip: 0.33, sy: 0.43, sx: 0.17, hx: -0.12 },
      { u: 2.92, h: [0.04, -0.03, 0.47], a: [4, 9], by: -0.25, bz: 0.13, hip: 0.28, sy: 0.36, sx: 0.15, hx: -0.1, l: [0.07, -0.48, 0.08] },
    ],
  },
  /** Rising Crescent (HEAVY[1]): the crouch and the great rising wheel up his right side. */
  steelCrescent: {
    line: 'down',
    flat: [1, 0, 0],
    home: 1.0,
    settle: 0.4,
    fold: 0,
    step: [0.3, 1.0],
    lF: [0.17, 0.6], rF: [-0.2, -0.55], fy: [0.3, -0.8], drag: 0.2,
    keys: [
      // the blade down before him, the point at the ground ahead and to his left
      { u: 0.4, h: [0.04, -0.42, 0.3], a: [25, -55], by: -0.26, bz: 0.0, hip: 0.2, sy: 0.15, sx: 0.4, l: [0.18, -0.36, 0.22], hs: 0 },
      // swept back under him on his right, the chest turning away to his left
      { u: 0.72, h: [-0.16, -0.48, -0.02], a: [-100, -84] },
      // THE COIL (held while the button is): crouched deep and folded over the front knee, the chest
      // turned away to his left (his back to the right side view), the hand low by the right knee, the
      // blade pointing back behind him along the ground; the free hand out over the left knee
      { u: 1.0, h: [-0.2, -0.44, -0.08], a: [-168, -28], by: -0.54, bz: 0.02, bx: -0.04, hip: 0.45, sy: 0.38, sx: 0.8, l: [0.12, -0.46, 0.24], lp: [0.65, -0.7, -0.2], hs: 0 },
      // he springs up and unwinds: the blade swings forward under him along the ground (it scrapes) ...
      { u: 1.2, h: [-0.1, -0.44, 0.24], a: [-90, -86], by: -0.46, hip: 0.2, sy: 0.12, sx: 0.64 },
      { u: 1.32, h: [-0.1, -0.4, 0.36], a: [-12, -58] },
      // ... up through his front ...
      { u: 1.52, h: [-0.08, -0.12, 0.5], a: [-6, 20], by: -0.2, bz: 0.06, hip: -0.12, sy: -0.1, sx: 0.15, l: [0.1, -0.38, 0.22] },
      // ... over his head, upright ...
      { u: 1.76, h: [-0.1, 0.36, 0.34], a: [-6, 80], by: -0.06, hip: -0.3, sy: -0.25, sx: -0.06 },
      // THE END OF THE CUT: the hand high over his right shoulder, the blade going over the top and back
      { u: 2.0, h: [-0.12, 0.5, 0.0], a: [-176, 58], by: -0.18, bz: 0.04, hip: -0.45, sy: -0.4, sx: -0.06, l: [0.1, -0.4, 0.16], lp: [0.7, -0.6, -0.3], hs: 0 },
      // the wheel carries on down behind him, the chest opening to his right
      { u: 2.22, h: [-0.16, 0.06, -0.42], a: [-176, 4], by: -0.28, bz: 0.06, hip: -0.55, sy: -0.48, sx: 0.06 },
      // the finish: the arm stretched back and low, the point down, the stance wide, the free fist in
      // before the left hip
      { u: 2.45, h: [-0.16, -0.3, -0.38], a: [-172, -34], by: -0.34, bz: 0.06, hip: -0.6, sy: -0.5, sx: 0.12, l: [0.14, -0.4, 0.14] },
      { u: 2.6, h: [-0.16, -0.32, -0.36], a: [-172, -36], by: -0.33, hip: -0.58, sy: -0.48, sx: 0.12 },
      // the pendulum home: the blade swings forward under him, straight down at his side
      { u: 2.9, h: [-0.1, -0.44, 0.0], a: [-120, -84], by: -0.22, hip: -0.32, sy: -0.27, sx: 0.06, l: [0.1, -0.46, 0.08] },
    ],
  },
};

/** The looks of HEAVY[0] and HEAVY[1] (`null`: today's look, until the clip is written). */
export const HEAVY_STEEL_C = [
  { anim: { kind: 'clip', clip: 'steelGale', feet: 'dash', dashW: true }, variants: [], contact: 'point', glint: 'ridge' },
  { anim: { kind: 'clip', clip: 'steelCrescent' }, variants: [] },
];
/** The charged heavy's look: the same lunging thrust, let go out of the long hold (the hold is the
 *  charge pose, steelStance.js steelCharge); the dash runs through its active frames. */
export const SPECIAL_STEEL_C = {
  cleave: { anim: { kind: 'clip', clip: 'steelGaleRelease', feet: 'dash', dashW: true }, variants: [], contact: 'point', glint: 'ridge' },
};
