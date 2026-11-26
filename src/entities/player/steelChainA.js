// The steel look set (`?lights=steel`, combat.js setLights; ADR-202): the light chain's hits 1-3.
// Every clip here follows the owner's reference footage pose for pose (both arms, the body, the feet),
// fitted to this game's own clock: no number of any attack changes. Clip format: swings.js.
//
// The reference's chain, read from its front, back and right side views:
//   hit 1  the sword arm swings up out to his right and on over the shoulder, the blade cocked behind
//          his head pointing back to his left, the chest turned away; a leap in, and the blade falls
//          on the diagonal from high right across his front to low left, landing in a deep lunge on
//          the right foot, the chest turned hard left and leaning in, the free arm flung straight back
//   hit 2  out of that lunge the hand draws back to his left hip (the blade pointing back), then a
//          level backhand across his chest to his right, the arms spread wide; the sword arm carries
//          on round behind his right shoulder, the elbow folding
//   hit 3  from behind his right shoulder the blade rises upright by his head and cocks behind it
//          again; a step in, and the same falling diagonal as hit 1 into the lunge, the free arm
//          thrown back and higher
// u 0-1 runs the reference from its stance to its deepest wind-up, 1-2 the cut, 2-3 the
// follow-through and its settle (home late: the lunge is held).

export const STEEL_CHAIN_A = {
  /** hit 1: the leaping falling diagonal, high right to low left */
  steelFall: {
    line: 'right', home: 0.6, settle: 0.42, gather: [0.3, 0.9], step: [0.45, 1.45],
    lF: [0.16, 0.7], rF: [-0.17, -0.52], fy: [0.1, -0.8], drag: 0.18,
    keys: [
      { u: 0.35, h: [-0.3, -0.1, 0.2], a: [-80, 15], rp: [-0.7, -0.7, -0.1], l: [0.04, -0.44, 0.12], lp: [0.35, -0.85, -0.3], hs: 0 },
      { u: 0.6, hy: 0.3, by: -0.07, bz: -0.05, bx: -0.05, hip: -0.48, sy: -0.46, sx: -0.08 },
      { u: 0.7, h: [-0.1, 0.38, -0.01], a: [-160, 66], rp: [-0.85, 0.1, 0.5] },
      { u: 1.0, hy: 0.38, h: [0.0, 0.46, -0.04], a: [145, 30], rp: [-0.6, 0.35, 0.7], by: -0.05, bz: -0.04, bx: -0.04, hip: -0.42, sy: -0.4, sx: -0.12, l: [0.06, -0.4, 0.18], lp: [0.4, -0.85, -0.2], hs: 0 },
      { u: 1.25, h: [-0.03, 0.33, 0.29], a: [-160, 70], rp: [-0.75, -0.2, 0.6] },
      { u: 1.5, hy: -0.05, h: [0.08, -0.02, 0.52], a: [-18, 10], rp: [-0.6, -0.8, 0.1], by: -0.2, bz: 0.12, bx: 0.02, hip: 0.28, sy: 0.12, sx: 0.55, l: [0.1, -0.2, -0.25], lp: [0.45, -0.8, -0.3] },
      { u: 1.75, h: [0.24, -0.27, 0.44], a: [26, -22] },
      { u: 2.0, hy: -0.15, h: [0.3, -0.36, 0.36], a: [42, -42], rp: [-0.45, -0.9, -0.1], by: -0.43, bz: 0.2, bx: 0.05, hip: 0.72, sy: 0.62, sx: 0.95, l: [0.07, -0.08, -0.45], lp: [0.5, -0.8, -0.2], hs: 0 },
      { u: 2.13, hy: -0.1, by: -0.47, bz: 0.22, bx: 0.06, hip: 0.82, sy: 0.72, sx: 1.02 },
      { u: 2.22, h: [0.33, -0.42, 0.29], a: [56, -52] },
      { u: 2.5, hy: -0.1, h: [0.34, -0.44, 0.23], a: [64, -60], rp: [-0.45, -0.9, -0.1], by: -0.45, bz: 0.2, bx: 0.05, hip: 0.78, sy: 0.68, sx: 0.98, l: [0.08, -0.06, -0.45], lp: [0.5, -0.8, -0.2] },
      { u: 2.92, hy: -0.08, h: [0.35, -0.46, 0.2], a: [68, -62], by: -0.46, bz: 0.2, bx: 0.05, hip: 0.75, sy: 0.65, sx: 0.96, l: [0.09, -0.08, -0.43] },
    ],
  },
  /** hit 2: the level backhand, his left hip to out at his right, carrying on behind the shoulder */
  steelSweep: {
    line: 'flat', home: 0.76, settle: 0.42, gather: [0.3, 0.9], step: [0.4, 1.4],
    lF: [0.2, 0.34], rF: [-0.2, -0.5], fy: [0.5, -0.6], drag: 0.22,
    keys: [
      { u: 0.5, hy: -0.35, h: [0.36, -0.36, 0.06], a: [140, -18], rp: [0.0, -0.7, 0.7], by: -0.22, bz: -0.03, hip: 0.62, sy: 0.6, sx: 0.26, l: [0.02, -0.34, 0.24], lp: [0.4, -0.85, -0.2], hs: 0 },
      { u: 1.0, hy: -0.42, h: [0.38, -0.24, -0.02], a: [166, -4], rp: [0.3, -0.5, 0.8], by: -0.22, bz: -0.05, bx: -0.04, hip: 0.64, sy: 0.66, sx: 0.22, l: [-0.04, -0.32, 0.26], lp: [0.45, -0.85, -0.15], hs: 0 },
      { u: 1.25, h: [0.32, -0.15, 0.35], a: [92, 0], rp: [-0.2, -0.7, 0.6] },
      { u: 1.5, hy: 0, h: [0.0, -0.12, 0.54], a: [0, 2], rp: [-0.5, -0.85, 0.1], by: -0.27, bz: 0.1, bx: 0.02, hip: -0.02, sy: 0.0, sx: 0.24, l: [0.3, -0.2, 0.18], lp: [0.3, -0.9, -0.2] },
      { u: 1.75, h: [-0.32, -0.08, 0.42], a: [-60, 3] },
      { u: 2.0, hy: 0.15, h: [-0.5, -0.06, 0.14], a: [-96, 2], rp: [-0.3, -0.9, -0.3], by: -0.31, bz: 0.12, bx: 0.05, hip: -0.58, sy: -0.52, sx: 0.2, l: [0.5, -0.03, 0.08], lp: [0.15, -0.9, -0.35], hs: 0 },
      { u: 2.15, hy: 0.12, by: -0.42, bz: 0.12, hip: -0.86, sy: -0.74, sx: 0.3 },
      { u: 2.3, h: [-0.42, -0.06, 0.1], a: [-112, -4], rp: [-0.45, -0.85, 0.2] },
      { u: 2.6, hy: 0.1, h: [-0.28, -0.16, 0.0], a: [-125, -18], rp: [-0.3, -0.9, 0.3], by: -0.46, bz: 0.1, bx: 0.05, hip: -0.84, sy: -0.74, sx: 0.32, l: [0.32, -0.38, 0.2], lp: [0.3, -0.85, -0.3] },
      { u: 2.92, hy: 0.08, h: [-0.26, -0.18, -0.02], a: [-128, -21], by: -0.47, bz: 0.1, bx: 0.05, hip: -0.8, sy: -0.7, sx: 0.32, l: [0.3, -0.4, 0.2] },
    ],
  },
  /** hit 3: from behind his right shoulder, upright by the head, then the falling diagonal again */
  steelFall3: {
    line: 'right', home: 0.42, settle: 0.42, gather: [0.3, 0.9], step: [0.45, 1.45],
    lF: [0.16, 0.7], rF: [-0.17, -0.52], fy: [0.1, -0.8], drag: 0.18,
    keys: [
      { u: 0.4, h: [-0.2, 0.18, -0.06], a: [-152, 48], rp: [-0.8, -0.5, 0.2], l: [0.28, -0.38, 0.1], lp: [0.3, -0.85, -0.3], hs: 0 },
      { u: 0.6, hy: 0.3, by: -0.2, bz: -0.05, bx: -0.05, hip: -0.72, sy: -0.62, sx: 0.0 },
      { u: 0.7, h: [-0.08, 0.38, -0.04], a: [-168, 70], rp: [-0.85, 0.1, 0.5] },
      { u: 1.0, hy: 0.38, h: [0.0, 0.44, -0.02], a: [145, 32], rp: [-0.6, 0.35, 0.7], by: -0.1, bz: -0.04, bx: -0.04, hip: -0.46, sy: -0.4, sx: -0.1, l: [0.3, -0.38, 0.12], lp: [0.3, -0.85, -0.3], hs: 0 },
      { u: 1.27, h: [-0.03, 0.31, 0.33], a: [-160, 68], rp: [-0.75, -0.2, 0.6] },
      { u: 1.5, hy: -0.05, h: [0.08, -0.02, 0.52], a: [-18, 10], rp: [-0.6, -0.8, 0.1], by: -0.2, bz: 0.12, bx: 0.02, hip: 0.28, sy: 0.12, sx: 0.55, l: [0.2, -0.15, -0.25], lp: [0.45, -0.8, -0.3] },
      { u: 1.75, h: [0.24, -0.27, 0.44], a: [26, -22] },
      { u: 2.0, hy: -0.15, h: [0.3, -0.36, 0.36], a: [42, -42], rp: [-0.45, -0.9, -0.1], by: -0.43, bz: 0.2, bx: 0.05, hip: 0.72, sy: 0.62, sx: 0.95, l: [0.08, 0.02, -0.44], lp: [0.5, -0.75, -0.3], hs: 0 },
      { u: 2.13, hy: -0.1, by: -0.47, bz: 0.22, bx: 0.06, hip: 0.82, sy: 0.72, sx: 1.02 },
      { u: 2.22, h: [0.33, -0.42, 0.29], a: [56, -52] },
      { u: 2.5, hy: -0.1, h: [0.34, -0.44, 0.23], a: [64, -60], rp: [-0.45, -0.9, -0.1], by: -0.45, bz: 0.2, bx: 0.05, hip: 0.78, sy: 0.68, sx: 0.98, l: [0.09, 0.0, -0.44], lp: [0.5, -0.75, -0.3] },
      { u: 2.92, hy: -0.08, h: [0.35, -0.46, 0.2], a: [68, -62], by: -0.46, bz: 0.2, bx: 0.05, hip: 0.75, sy: 0.65, sx: 0.96, l: [0.1, -0.02, -0.43] },
    ],
  },
};

/** The looks of hits 1, 2, 3 (`null`: today's look, until the clip is written). */
export const LIGHT_STEEL_A = [
  { anim: { kind: 'clip', clip: 'steelFall', hop: 0.1, tuck: 0.9 }, variants: [], contact: 'light' },
  { anim: { kind: 'clip', clip: 'steelSweep' }, variants: [], contact: 'light' },
  { anim: { kind: 'clip', clip: 'steelFall3', hop: 0.06 }, variants: [], contact: 'light' },
];
