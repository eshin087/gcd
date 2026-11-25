// The five heavy branches as INSTANT cuts (`?lights=blink`: combat.js setLights swaps HEAVY[0..4]'s
// `anim` to these; the charged cleave keeps its own). The owner (2026-11-25): "also make the right heavy
// attack the same type of instant slash effect", "make sure the last attack looks different from the
// heavy attack". Each heavy keeps its clock, damage, dash / travel and its JOB (combat.js, the comment
// over HEAVY); what changes is the picture: the same hold, snap, cross, snap, stand as the lights, but
// unmistakably HEAVY:
//   both hands on the grip (`two: 1`), the free hand closed on it from the start
//   a long STILL hold through the long windup (from u ≈ 0.35 to the snap: about a quarter of a second)
//   a big planted step: the front foot lands before the cut (`step`), a long low stance
//   a thick, long line in the heavy arc's violet (`slashLook: 'heavy'`, blinkFx.js)
// The cut keys' blade directions were solved so the point's path is a straight line (integ.mjs
// `blinksolve`). Clip format: swings.js's header; `slash`: blinkFx.js's header. Spread into SWINGS.
//   Piercing Gale       the dash carries him in with the grip drawn back at the ribs, still; at the dash's
//                       end the point is simply there, and a long streak runs on off it
//   Rising Crescent     sunk at the left hip, still; one rising diagonal to high on his right
//   Whirling Tempest    coiled low and still; the turn is kept (its job: a blade all round him, combat.js
//                       `spin`) and is the cut: one whip round in the active frames, the blade held out
//                       level and rigid, and the ring it cut is drawn at once (blinkFx.js `ring`)
//   Mountain Splitter   the blade over the left shoulder, still; one falling diagonal to the right hip
//   Earthbreaker        the leap kept (its `hop`): the blade held high over his head through it, then one
//                       instant overhead cut straight down into the ground ahead as he lands; the shards
//                       burst where the point went in (player.js _slamImpact)

const TWO = { two: 1, hs: 0 };
const HEAVY = { home: 0.5, slashLook: 'heavy' };

export const HEAVIES_BLINK = {
  /** Piercing Gale (HEAVY[0]): the dash's thrust, instant */
  blinkGale: {
    ...HEAVY, line: 'point', slash: [[1.42, 1.5, 'point']],
    rF: [-0.17, -0.52], fy: [0.1, -0.8], drag: 0.12,
    lF: [0.14, 0.58],
    keys: [
      { u: 0.35, h: [-0.08, -0.24, -0.06], a: [-2, 22], ...TWO, lp: [0.7, -0.6, 0.3], by: -0.28, bz: -0.1, bx: -0.05, hip: -0.44, sy: -0.54, sx: 0.18 },
      { u: 1.32, h: [-0.08, -0.24, -0.06], a: [-2, 22], ...TWO, by: -0.28, bz: -0.1, bx: -0.05, hip: -0.44, sy: -0.54, sx: 0.18 },
      { u: 1.42, h: [0.13, 0.08, 0.5], a: [0, 34], ...TWO, by: -0.34, bz: 0.18, bx: 0.04, hip: 0.22, sy: 0.32, sx: 0.48 },
      { u: 2.0, h: [0.13, 0.08, 0.5], a: [0, 34], ...TWO },
      { u: 2.15, by: -0.36, bz: 0.2, bx: 0.04, hip: 0.26, sy: 0.36, sx: 0.5 },
      { u: 2.6, h: [0.13, 0.07, 0.48], a: [0, 33], ...TWO, by: -0.33, bz: 0.16, bx: 0.03, hip: 0.22, sy: 0.3, sx: 0.46 },
    ],
  },
  /** Rising Crescent (HEAVY[1]): from the left hip, one rising diagonal to high right */
  blinkRise: {
    ...HEAVY, line: 'right', slash: [[1.32, 1.56]],
    step: [0.3, 1.05], lF: [0.17, 0.58], rF: [-0.18, -0.5], fy: [0.45, -0.7], drag: 0.14,
    keys: [
      { u: 0.35, h: [0.34, -0.4, 0.04], a: [150, -34], two: 1, hs: 0, lp: [0.7, -0.6, 0.3], by: -0.36, bz: -0.08, bx: -0.06, hip: 0.5, sy: 0.58, sx: 0.42 },
      { u: 1.24, h: [0.34, -0.4, 0.04], a: [150, -34], two: 1, hs: 0, by: -0.37, bz: -0.08, bx: -0.06, hip: 0.5, sy: 0.58, sx: 0.42 },
      { u: 1.32, h: [0.26, -0.22, 0.4], a: [29.8, -18.7] },
      { u: 1.38, h: [0.149, -0.153, 0.342], a: [25, -12.9] },
      { u: 1.44, h: [0.061, -0.085, 0.324], a: [18.7, -6.5], by: -0.24, bz: 0.13, bx: 0.02, hip: -0.06, sy: 0.04, sx: 0.3 },
      { u: 1.5, h: [-0.013, -0.014, 0.309], a: [12.1, 0] },
      { u: 1.56, h: [-0.064, 0.053, 0.305], a: [5, 7] },
      { u: 1.62, h: [-0.102, 0.109, 0.328], a: [-2.6, 14.9] },
      { u: 1.68, h: [-0.12, 0.16, 0.4], a: [-11.9, 23.7], two: 1, hs: 0, by: -0.14, bz: 0.16, bx: 0.06, hip: -0.42, sy: -0.42, sx: 0.08, sz: 0.06 },
      { u: 2, h: [-0.12, 0.16, 0.392], a: [-11.3, 24], two: 1, hs: 0 },
      { u: 2.2, by: -0.15, bz: 0.17, bx: 0.06, hip: -0.48, sy: -0.48, sx: 0.06 },
      { u: 2.6, h: [-0.12, 0.16, 0.384], a: [-10.7, 24.3], two: 1, hs: 0, by: -0.13, bz: 0.14, bx: 0.05, hip: -0.44, sy: -0.44, sx: 0.06, sz: 0.05 },
    ],
  },
  /** Whirling Tempest (HEAVY[2]): one whip round (combat.js `spin`), the blade held out level and rigid */
  blinkTempest: {
    ...HEAVY, line: 'flat', slash: [[0.6, 2.05, 'ring']],
    keys: [
      { u: 0.35, h: [-0.22, -0.08, 0.12], a: [-120, 6], ...TWO, lp: [0.7, -0.6, 0.3], by: -0.3, bx: -0.04, hip: -0.22, sy: -0.32, sx: 0.26 },
      { u: 1.0, h: [-0.22, -0.08, 0.12], a: [-120, 6], ...TWO, by: -0.3, bx: -0.04, hip: -0.22, sy: -0.32, sx: 0.26 },
      { u: 1.5, h: [-0.18, -0.1, 0.26], a: [-96, 2], ...TWO, by: -0.3, hip: -0.12, sy: -0.16, sx: 0.28 },
      { u: 2.0, h: [-0.12, -0.14, 0.36], a: [-60, -6], ...TWO, by: -0.32, bz: 0.06, bx: 0.05, hip: -0.14, sy: -0.22, sx: 0.32 },
      { u: 2.2, by: -0.34, bz: 0.07, bx: 0.05, hip: -0.2, sy: -0.28, sx: 0.34 },
      { u: 2.6, h: [-0.12, -0.15, 0.35], a: [-62, -7], ...TWO, by: -0.31, bz: 0.06, bx: 0.04, hip: -0.16, sy: -0.24, sx: 0.31 },
    ],
  },
  /** Mountain Splitter (HEAVY[3]): from over the left shoulder, one falling diagonal to the right hip */
  blinkCrush: {
    ...HEAVY, line: 'left', slash: [[1.28, 1.52]],
    step: [0.3, 1.05], lF: [0.16, 0.6], rF: [-0.18, -0.52], fy: [0.15, -0.75], drag: 0.2,
    keys: [
      { u: 0.35, h: [0.28, 0.18, 0.1], a: [156, 44], two: 1, hs: 0, lp: [0.7, -0.6, 0.3], by: -0.12, bz: -0.08, bx: -0.06, hip: 0.48, sy: 0.58, sx: -0.04, sz: -0.05 },
      { u: 1.2, h: [0.28, 0.18, 0.1], a: [156, 44], two: 1, hs: 0, by: -0.12, bz: -0.08, bx: -0.06, hip: 0.48, sy: 0.58, sx: -0.04, sz: -0.05 },
      { u: 1.28, h: [0.24, 0.12, 0.4], a: [52.3, 21.4] },
      { u: 1.34, h: [0.154, 0.075, 0.251], a: [38.8, 14.8] },
      { u: 1.4, h: [0.113, 0.028, 0.172], a: [24.8, 6.8], by: -0.28, bz: 0.13, bx: 0.02, hip: -0.08, sy: 0, sx: 0.42 },
      { u: 1.46, h: [0.042, -0.003, 0.084], a: [11.6, -1] },
      { u: 1.52, h: [0.054, -0.088, 0.174], a: [-0.8, -8.2] },
      { u: 1.58, h: [-0.014, -0.179, 0.251], a: [-11.7, -14.5] },
      { u: 1.64, h: [-0.12, -0.3, 0.38], a: [-21.8, -20.1], two: 1, hs: 0, by: -0.42, bz: 0.17, bx: 0.06, hip: -0.42, sy: -0.46, sx: 0.58, sz: 0.07 },
      { u: 2, h: [-0.12, -0.3, 0.372], a: [-21.2, -19.8], two: 1, hs: 0 },
      { u: 2.2, by: -0.44, bz: 0.18, bx: 0.06, hip: -0.48, sy: -0.52, sx: 0.6 },
      { u: 2.6, h: [-0.12, -0.3, 0.364], a: [-20.6, -19.5], two: 1, hs: 0, by: -0.41, bz: 0.15, bx: 0.05, hip: -0.44, sy: -0.48, sx: 0.56, sz: 0.06 },
    ],
  },
  /** Earthbreaker (HEAVY[4], the leap kept): held high over his head, then one cut straight down into
   *  the ground ahead as he lands */
  blinkBreak: {
    ...HEAVY, line: 'down', slash: [[1.2, 1.46]], home: 0.45,
    step: [0.45, 1.5], drag: 0.25,
    keys: [
      { u: 0.3, h: [-0.04, 0.28, 0.14], a: [-20, 78], two: 1, hs: 0, lp: [0.7, -0.6, 0.3], by: -0.16, hip: -0.16, sy: -0.2, sx: -0.12, hx: -0.18, hy: 0.16 },
      { u: 1.12, h: [-0.04, 0.3, 0.14], a: [-20, 80], two: 1, hs: 0, by: -0.1, hip: -0.16, sy: -0.2, sx: -0.14, hx: -0.2, hy: 0.16 },
      { u: 1.2, h: [0.02, 0.26, 0.34], a: [40.4, 44.9] },
      { u: 1.26, h: [-0.006, 0.203, 0.133], a: [27.1, 31.5] },
      { u: 1.33, h: [0.01, 0.108, 0.009], a: [18.1, 17.4], by: -0.2, bz: 0.08, hip: 0.04, sy: 0, sx: 0.36, hx: 0, hy: 0 },
      { u: 1.39, h: [-0.007, 0.022, 0.025], a: [10.9, 4.1] },
      { u: 1.46, h: [-0.026, 0.014, 0.038], a: [4.6, -7.6] },
      { u: 1.52, h: [0.134, -0.131, 0.202], a: [-1, -17.8] },
      { u: 1.58, h: [0.18, -0.32, 0.38], a: [-6.6, -26.7], two: 1, hs: 0, by: -0.42, bz: 0.15, hip: 0.22, sy: 0.26, sx: 0.68, sz: -0.05, hx: 0.14, hy: -0.3 },
      { u: 2, h: [0.18, -0.32, 0.372], a: [-6, -26.4], two: 1, hs: 0 },
      { u: 2.2, h: [0.18, -0.32, 0.364], a: [-5.4, -26.1], two: 1, hs: 0, by: -0.45, bz: 0.16, hip: 0.24, sy: 0.28, sx: 0.72, sz: -0.05, hx: 0.3, hy: -0.3 },
      { u: 2.65, h: [0.18, -0.32, 0.356], a: [-4.8, -25.8], two: 1, hs: 0, by: -0.43, bz: 0.15, hip: 0.23, sy: 0.27, sx: 0.7, sz: -0.05, hx: 0.22, hy: -0.3 },
    ],
  },
};

/** The anim block each heavy branch plays under `?lights=blink` (combat.js setLights); the options of
 *  the clips they replace (the dash, the turn, the leap) are kept. */
export const HEAVY_BLINK_ANIMS = [
  { kind: 'clip', clip: 'blinkGale', feet: 'dash', dashW: true },
  { kind: 'clip', clip: 'blinkRise' },
  { kind: 'clip', clip: 'blinkTempest', spin: -1, spinFeet: 'hop' },
  { kind: 'clip', clip: 'blinkCrush' },
  { kind: 'clip', clip: 'blinkBreak', hop: 0.36, tuck: 1.3 },
];

/** The LOOK each heavy branch wears under `?lights=blink` (combat.js setLights `wear`): its `anim`, and
 *  any of `contact` / `glint` it changes (a thrust turned into a slash is drawn as one; `glint: null`
 *  clears the ridge glint). Never a number of the hit. */
export const HEAVY_BLINK = HEAVY_BLINK_ANIMS.map((anim) => ({ anim }));
