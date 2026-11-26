// The steel look set (`?lights=steel`, combat.js setLights; ADR-207): the light chain's hits 4-5, the sprint slash and the roll cut.
// Every clip here follows the owner's reference footage pose for pose (both arms, the body, the feet),
// fitted to this game's own clock: no number of any attack changes. Clip format: swings.js.
//
// Hit 4 (the reference's chain, 4th swing): out of hit 3's low finish on his left the sword hand
// rises up his left side to above the left shoulder, the blade standing up behind it; then one
// falling backhand diagonal from high left across his front to low out on his right, the arm opening
// to nearly straight, the chest turning to his right and the body sinking into a deep bent-knee
// stance; the free arm swings out to his left against it and drops to the left knee.
// Hit 5 (the 5th swing, the finisher): he rises out of that crouch, the sword hand going up in front
// of him to above his head, the blade circling over the head and dropping behind his back; then one
// big falling cut straight down his front, the chest turning hard to his left (the right shoulder
// driving through) and the body bowing deep over the front knee, the point ending low ahead near the
// ground; the free arm is thrown back and up behind him. He holds the bow, then rises.

export const STEEL_CHAIN_B = {
  steelHit4: {
    line: 'left', home: 1, settle: 0.45, step: [0.1, 1.3],
    lF: [0.17, 0.6], rF: [-0.18, -0.48], fy: [0.3, -0.6], drag: 0.26,
    keys: [
      { u: 0.22, h: [0.22, -0.26, 0.32], a: [78, 2], by: -0.4, l: [0.12, -0.08, -0.34], lp: [0.5, -0.5, -0.7], hs: 0 },
      { u: 0.45, h: [0.18, -0.02, 0.3], a: [72, 30], l: [0.15, -0.3, 0.02], lp: [0.5, -0.8, -0.3], hs: 0 },
      { u: 0.65, by: -0.2, bz: -0.04, bx: -0.05, hip: 0.32, sy: 0.42, sx: 0.04 },
      { u: 1.0, h: [0.28, 0.33, 0.06], a: [125, 58], by: -0.15, bz: -0.03, bx: -0.04, hip: 0.24, sy: 0.34, sx: 0.0, l: [0.14, -0.38, 0.12], lp: [0.55, -0.8, -0.2], hs: 0 },
      { u: 1.25, h: [0.2, 0.22, 0.32], a: [60, 45] },
      { u: 1.45, h: [0.02, 0.0, 0.5], a: [22, 12], by: -0.16, bz: 0.1, bx: 0.02, hip: -0.12, sy: -0.08, sx: 0.2, l: [0.4, -0.08, 0.04], lp: [0.4, -0.7, -0.6], hs: 0 },
      { u: 1.7, h: [-0.26, -0.22, 0.4], a: [-40, -14] },
      { u: 2.0, h: [-0.42, -0.3, 0.16], a: [-85, -18], by: -0.44, bz: 0.15, bx: 0.05, hip: -0.36, sy: -0.44, sx: 0.28, l: [0.34, -0.36, 0.1], lp: [0.5, -0.6, -0.6], hs: 0 },
      { u: 2.15, h: [-0.44, -0.31, 0.08], a: [-98, -18] },
      { u: 2.18, by: -0.5, bz: 0.16, bx: 0.06, hip: -0.46, sy: -0.54, sx: 0.36 },
      { u: 2.4, h: [-0.44, -0.33, 0.03], a: [-106, -20] },
      { u: 2.65, h: [-0.44, -0.34, 0.02], a: [-109, -21], by: -0.48, bz: 0.14, bx: 0.05, hip: -0.42, sy: -0.5, sx: 0.3, l: [0.22, -0.46, 0.18], lp: [0.6, -0.5, -0.5], hs: 0 },
      { u: 2.95, h: [-0.43, -0.35, 0.03], a: [-112, -23], by: -0.47, bz: 0.14, bx: 0.05, hip: -0.4, sy: -0.48, sx: 0.29, l: [0.21, -0.47, 0.19], lp: [0.6, -0.5, -0.5], hs: 0 },
    ],
  },
  steelHit5: {
    line: 'down', home: 1, settle: 0.5, step: [0.3, 1.35], plain: true,
    lF: [0.16, 0.62], rF: [-0.18, -0.46], fy: [0.2, -0.7], drag: 0.22,
    keys: [
      { u: 0.3, h: [0.1, -0.02, 0.38], a: [24, 50], by: -0.2, hip: -0.2, sy: -0.24, l: [0.14, -0.3, 0.2], lp: [0.5, -0.8, -0.3], hs: 0 },
      { u: 0.55, h: [0.42, 0.24, 0.12], a: [66, 60], by: -0.08, bz: -0.04, hip: -0.5, sy: -0.6, sx: -0.04 },
      { u: 0.78, h: [0.26, 0.44, 0.0], a: [112, 60], l: [0.1, -0.26, 0.34], lp: [0.5, -0.8, -0.3], hs: 0 },
      { u: 0.8, by: -0.06, bz: -0.07, bx: -0.06, hip: -0.82, sy: -0.96, sx: -0.12 },
      { u: 1.0, h: [-0.02, 0.45, -0.06], a: [-178, 46], by: -0.08, bz: -0.06, bx: -0.05, hip: -0.74, sy: -0.88, sx: -0.1, hx: -0.06, l: [0.08, -0.22, 0.36], lp: [0.5, -0.8, -0.3], hs: 0 },
      { u: 1.25, h: [-0.06, 0.44, 0.24], a: [-10, 75] },
      { u: 1.45, h: [-0.04, 0.14, 0.5], a: [-2, 22], by: -0.26, bz: 0.13, bx: 0.02, hip: 0.1, sy: 0.12, sx: 0.4, l: [0.16, -0.1, -0.16], lp: [0.4, -0.6, -0.7], hs: 0 },
      { u: 1.7, h: [0.0, -0.2, 0.5], a: [6, -26] },
      { u: 2.0, h: [0.04, -0.4, 0.36], a: [14, -40], by: -0.4, bz: 0.18, bx: 0.05, hip: 0.46, sy: 0.6, sx: 0.85, hx: 0.32, l: [-0.2, 0.22, -0.36], lp: [0.3, -0.2, -0.95], hs: 0 },
      { u: 2.15, h: [0.05, -0.43, 0.32], a: [18, -44] },
      { u: 2.18, by: -0.44, bz: 0.19, bx: 0.06, hip: 0.54, sy: 0.68, sx: 0.92 },
      { u: 2.4, h: [0.06, -0.44, 0.3], a: [20, -45] },
      { u: 2.6, h: [0.06, -0.44, 0.3], a: [20, -44], by: -0.42, bz: 0.18, bx: 0.05, hip: 0.5, sy: 0.64, sx: 0.88, hx: 0.3, l: [-0.2, 0.2, -0.36], lp: [0.3, -0.2, -0.95], hs: 0 },
      { u: 2.95, h: [0.06, -0.42, 0.31], a: [20, -41], by: -0.4, bz: 0.18, bx: 0.05, hip: 0.48, sy: 0.62, sx: 0.84, hx: 0.28, l: [-0.19, 0.17, -0.35], lp: [0.3, -0.2, -0.95], hs: 0 },
    ],
  },
  steelRoll: {
    line: 'point', home: 1, settle: 0.4, step: [0.05, 1.4],
    lF: [0.18, 0.82], rF: [-0.18, -0.62], fy: [0.2, -0.8], drag: 0.28,
    keys: [
      { u: 0.5, h: [-0.24, -0.42, 0.18], a: [-52, -34], by: -0.38, bz: -0.04, hip: -0.3, sy: -0.32, sx: 0.3, l: [0.16, -0.4, 0.2], lp: [0.5, -0.8, -0.3], hs: 0 },
      { u: 0.7, by: -0.34, bz: -0.05, bx: -0.05, hip: -0.48, sy: -0.54, sx: 0.26 },
      { u: 1.0, h: [-0.3, -0.26, 0.12], a: [-36, -16], by: -0.36, bz: -0.04, bx: -0.04, hip: -0.42, sy: -0.48, sx: 0.32, l: [0.2, -0.36, 0.16], lp: [0.5, -0.8, -0.3], hs: 0 },
      { u: 1.3, h: [-0.16, -0.12, 0.38], a: [-10, 2] },
      { u: 1.55, h: [0.0, -0.03, 0.5], a: [-2, 5], by: -0.42, bz: 0.2, bx: 0.03, hip: 0.26, sy: 0.36, sx: 0.78, l: [0.12, -0.14, -0.34], lp: [0.4, -0.5, -0.75], hs: 0 },
      { u: 2.0, h: [0.02, -0.01, 0.53], a: [1, 6], by: -0.46, bz: 0.24, bx: 0.05, hip: 0.34, sy: 0.44, sx: 0.88, l: [0.12, -0.1, -0.38], lp: [0.4, -0.5, -0.75], hs: 0 },
      { u: 2.12, by: -0.48, bz: 0.25, bx: 0.06, hip: 0.42, sy: 0.52, sx: 0.92 },
      { u: 2.3, h: [-0.01, -0.14, 0.46], a: [0, 16] },
      { u: 2.6, h: [-0.05, -0.3, 0.32], a: [-6, 22], by: -0.38, bz: 0.19, bx: 0.05, hip: 0.3, sy: 0.38, sx: 0.58, l: [0.1, -0.3, -0.16], lp: [0.45, -0.7, -0.5], hs: 0 },
      { u: 2.95, h: [-0.07, -0.34, 0.28], a: [-8, 24], by: -0.34, bz: 0.17, bx: 0.05, hip: 0.26, sy: 0.34, sx: 0.5, l: [0.1, -0.34, -0.1], lp: [0.45, -0.7, -0.5], hs: 0 },
    ],
  },
  steelSprint: {
    line: 'left', home: 1, settle: 0.45,
    fy: [0.25, -0.75], drag: 0.24,
    keys: [
      { u: 0.35, h: [-0.1, -0.36, 0.2], a: [-20, -40], l: [0.06, -0.2, 0.3], lp: [0.5, -0.8, -0.3], hs: 0 },
      { u: 0.65, h: [0.08, -0.4, 0.16], a: [100, -40], by: -0.16, bz: -0.04, bx: -0.05, hip: 0.4, sy: 0.5, sx: 0.42, hx: 0.1 },
      { u: 1.0, h: [0.14, -0.36, 0.1], a: [132, -32], by: -0.2, bz: -0.03, bx: -0.04, hip: 0.34, sy: 0.44, sx: 0.46, hx: 0.12, l: [-0.04, -0.06, 0.36], lp: [0.5, -0.7, -0.4], hs: 0 },
      { u: 1.3, h: [0.06, -0.26, 0.4], a: [80, -18] },
      { u: 1.55, h: [-0.14, -0.04, 0.5], a: [22, 6], by: -0.22, bz: 0.12, bx: 0.02, hip: -0.1, sy: -0.12, sx: 0.3, hx: 0, l: [0.3, -0.2, 0.1], lp: [0.45, -0.7, -0.5], hs: 0 },
      { u: 1.8, h: [-0.36, 0.08, 0.34], a: [-36, 22] },
      { u: 2.0, h: [-0.46, 0.12, 0.18], a: [-70, 28], by: -0.28, bz: 0.17, bx: 0.05, hip: -0.32, sy: -0.42, sx: 0.3, l: [0.36, -0.3, -0.1], lp: [0.4, -0.5, -0.75], hs: 0 },
      { u: 2.12, by: -0.31, bz: 0.18, bx: 0.06, hip: -0.4, sy: -0.5, sx: 0.32 },
      { u: 2.25, h: [-0.46, 0.08, 0.08], a: [-92, 24] },
      { u: 2.5, h: [-0.45, 0.04, 0.1], a: [-90, 18], by: -0.28, bz: 0.15, bx: 0.05, hip: -0.32, sy: -0.4, sx: 0.28 },
      { u: 2.75, h: [-0.42, -0.08, 0.12], a: [-82, 6], by: -0.26, bz: 0.13, hip: -0.26, sy: -0.34, sx: 0.24 },
      { u: 2.95, h: [-0.36, -0.2, 0.16], a: [-66, -8], by: -0.24, bz: 0.12, hip: -0.2, sy: -0.27, sx: 0.2, l: [0.3, -0.38, -0.04], lp: [0.45, -0.7, -0.5], hs: 0 },
    ],
  },
};

/** The looks of hits 4 and 5 (`null`: today's look, until the clip is written). */
export const LIGHT_STEEL_B = [
  { anim: { kind: 'clip', clip: 'steelHit4' }, variants: [], contact: 'light', glint: null },
  { anim: { kind: 'clip', clip: 'steelHit5', hop: 0.14 }, variants: [], contact: 'sweep' },
];
/** The sprint slash's and the roll cut's looks. */
export const SPECIAL_STEEL_B = {
  sprint: { anim: { kind: 'clip', clip: 'steelSprint', feet: 'dash', hop: 0.14, tuck: 1.1 }, variants: [], contact: 'sweep' },
  roll: { anim: { kind: 'clip', clip: 'steelRoll' }, variants: [], contact: 'point', glint: 'ridge' },
};
