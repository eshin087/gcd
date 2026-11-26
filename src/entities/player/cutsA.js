// Instant-cut light combo, variant a (`?lights=blink&cuts=a`, combat.js setCuts; ADR-215): the reference's own five strokes, instant.
// Hits 1-5 only; the heavies and the specials stay the blink set's. Clip format: swings.js. Data only.
//
// The owner's reference footage's light chain (its poses as the steel set measured them, steelChainA.js /
// steelChainB.js), with what lies between the coil and the finish made instant: he winds into the
// footage's coil and stands in it a beat, the blade is through his front in two or three frames
// (blinkFx.js draws one straight line on the chord: `slash`), and the footage's finish carries on for ten
// frames, slowing, then is held to the end of the recovery (`home` 1) and he rises out of it slowly
// (`settle`), free to act the whole time. Both arms are keyed (the sword elbow `rp`; the free hand `l`
// / `lp`, open, `hs` 0), the body leads the blade by a frame (`lead`), the feet step.
//   1  the overhead diagonal: the hand above his head, the blade cocked behind it, the chest turned
//      away; through, high right to low left, into a deep lunge, the free arm thrown back
//   2  the level backhand: drawn back to the left hip, the free hand gathered at the sword wrist; through
//      at the chest to out on his right, the arms spread wide
//   3  the diagonal again, out of the backhand: the blade rises upright behind his right shoulder and
//      cocks behind his head; through into the lunge, the free arm thrown back higher
//   4  the falling backhand: the hand up his left side above the shoulder, the blade standing up behind
//      it; through from high left to low out on his right, sinking into a bent-knee stance, the free arm
//      out to his left and down to the knee
//   5  a stronger light, one of three strokes of the footage, never the same twice running: the
//      overhead chop into a bow (the blade dropped behind his back, a leap, straight down his front a
//      little across), the great diagonal (hit 1 deeper, longer, carried on past his left hip) and the
//      level forehand (wound far to his right, across to out on his left)

const CUT = { home: 1.0, settle: 0.42, gather: [0.6, 0.5], lead: [0.02, 0.01] };
const LAST = { home: 1.0, settle: 0.5, gather: [0.6, 0.5], lead: [0.024, 0.012], plain: true, slashLook: 'strong' };

export const CUTS_A = {
  /** hit 1: the overhead diagonal, high right to low left, into the lunge */
  cutA1: {
    line: 'right', ...CUT, slash: [[1.18, 1.42]], step: [0.3, 1.3],
    lF: [0.16, 0.7], rF: [-0.17, -0.52], fy: [0.1, -0.8], drag: 0.18,
    keys: [
      { u: 0.3, h: [-0.26, 0.0, 0.2], a: [-95, 35], rp: [-0.75, -0.6, 0.1], l: [0.06, -0.42, 0.16], lp: [0.4, -0.85, -0.2], hs: 0 },
      { u: 0.55, hy: 0.3, by: -0.06, bz: -0.05, bx: -0.05, hip: -0.5, sy: -0.48, sx: -0.1 },
      { u: 0.62, h: [-0.1, 0.38, -0.01], a: [-162, 66], rp: [-0.85, 0.1, 0.5] },
      { u: 0.86, h: [0.0, 0.46, -0.04], a: [148, 32], rp: [-0.6, 0.35, 0.7] },
      { u: 1.0, hy: 0.38, h: [0.0, 0.46, -0.035], a: [147, 32], rp: [-0.6, 0.35, 0.7], by: -0.06, bz: -0.04, bx: -0.04, hip: -0.44, sy: -0.42, sx: -0.12, l: [0.06, -0.4, 0.18], lp: [0.4, -0.85, -0.2] },
      { u: 1.1, hy: 0.38, h: [0.0, 0.46, -0.03], a: [146, 32], rp: [-0.6, 0.35, 0.7], by: -0.06, bz: -0.04, bx: -0.04, hip: -0.44, sy: -0.42, sx: -0.12 },
      // the cut: over the top, through his front, out low on his left
      { u: 1.18, h: [-0.04, 0.36, 0.28], a: [-150, 66], rp: [-0.75, -0.2, 0.6] },
      { u: 1.3, hy: -0.05, h: [0.06, 0.02, 0.54], a: [-22, 12], rp: [-0.72, -0.66, 0.1], by: -0.22, bz: 0.12, bx: 0.02, hip: 0.3, sy: 0.14, sx: 0.55, l: [0.09, -0.3, -0.04], lp: [0.45, -0.8, -0.3] },
      { u: 1.42, h: [0.3, -0.3, 0.42], a: [36, -28], rp: [-0.45, -0.88, -0.1] },
      // the follow-through, slowing, into the footage's lunge; held
      { u: 1.52, hy: -0.12, h: [0.32, -0.35, 0.37], a: [47, -36], rp: [-0.42, -0.9, -0.1], by: -0.36, bz: 0.18, bx: 0.05, hip: 0.6, sy: 0.5, sx: 0.86, l: [0.08, -0.17, -0.3], lp: [0.5, -0.8, -0.2] },
      { u: 1.66, h: [0.33, -0.39, 0.32], a: [56, -42] },
      { u: 1.85, h: [0.34, -0.42, 0.27], a: [64, -47], by: -0.44, bz: 0.21, bx: 0.05, hip: 0.75, sy: 0.65, sx: 0.97, l: [0.07, -0.08, -0.45] },
      { u: 2.1, hy: -0.1, h: [0.35, -0.44, 0.23], a: [70, -50], by: -0.47, bz: 0.22, bx: 0.06, hip: 0.82, sy: 0.72, sx: 1.02 },
      { u: 2.4, h: [0.355, -0.45, 0.21], a: [73, -52], rp: [-0.45, -0.9, -0.1], l: [0.08, -0.06, -0.45], lp: [0.5, -0.8, -0.2] },
      { u: 2.92, hy: -0.08, h: [0.36, -0.46, 0.2], a: [75, -54], by: -0.45, bz: 0.2, bx: 0.05, hip: 0.78, sy: 0.68, sx: 0.98, l: [0.09, -0.08, -0.43] },
    ],
  },
  /** hit 2: the level backhand, his left hip to out on his right, the arms spread */
  cutA2: {
    line: 'flat', ...CUT, slash: [[1.2, 1.42]], step: [0.3, 1.3],
    lF: [0.2, 0.34], rF: [-0.2, -0.5], fy: [0.5, -0.6], drag: 0.22,
    keys: [
      { u: 0.45, hy: -0.35, h: [0.38, -0.36, 0.1], a: [138, -18], rp: [0.0, -0.7, 0.7], by: -0.36, bz: 0.1, hip: 0.7, sy: 0.64, sx: 0.32, l: [0.02, -0.34, 0.24], lp: [0.4, -0.85, -0.2], hs: 0 },
      { u: 0.86, h: [0.38, -0.24, -0.02], a: [164, -4], rp: [0.3, -0.5, 0.8] },
      { u: 1.0, hy: -0.42, h: [0.38, -0.24, -0.015], a: [164, -4], rp: [0.3, -0.5, 0.8], by: -0.3, bz: 0.04, bx: -0.04, hip: 0.64, sy: 0.66, sx: 0.22, l: [-0.04, -0.32, 0.26], lp: [0.45, -0.85, -0.15] },
      { u: 1.1, hy: -0.42, h: [0.38, -0.24, -0.01], a: [163, -4], rp: [0.3, -0.5, 0.8], by: -0.3, bz: 0.04, bx: -0.04, hip: 0.64, sy: 0.66, sx: 0.22 },
      { u: 1.2, h: [0.32, -0.14, 0.36], a: [94, 0], rp: [-0.2, -0.7, 0.6] },
      { u: 1.31, hy: 0, h: [0.0, -0.1, 0.54], a: [4, 2], rp: [-0.5, -0.85, 0.1], by: -0.27, bz: 0.1, bx: 0.02, hip: -0.04, sy: 0.0, sx: 0.24, l: [0.26, -0.22, 0.2], lp: [0.3, -0.9, -0.2] },
      { u: 1.42, h: [-0.32, -0.08, 0.44], a: [-58, 3], rp: [-0.6, -0.75, -0.15] },
      { u: 1.52, hy: 0.12, h: [-0.4, -0.07, 0.36], a: [-72, 3], rp: [-0.45, -0.85, -0.2], by: -0.3, bz: 0.12, bx: 0.05, hip: -0.36, sy: -0.32, sx: 0.22, l: [0.42, -0.08, 0.13], lp: [0.15, -0.9, -0.35] },
      { u: 1.66, h: [-0.45, -0.07, 0.28], a: [-86, 2] },
      { u: 1.85, h: [-0.48, -0.07, 0.2], a: [-98, 1], by: -0.32, bz: 0.12, bx: 0.05, hip: -0.6, sy: -0.54, sx: 0.22, l: [0.5, -0.03, 0.08] },
      { u: 2.1, hy: 0.15, h: [-0.49, -0.08, 0.14], a: [-106, -2], by: -0.4, bz: 0.12, bx: 0.06, hip: -0.82, sy: -0.72, sx: 0.28 },
      { u: 2.4, h: [-0.48, -0.09, 0.1], a: [-111, -5], rp: [-0.3, -0.9, -0.3], l: [0.5, -0.04, 0.07], lp: [0.15, -0.9, -0.35] },
      { u: 2.92, hy: 0.12, h: [-0.47, -0.1, 0.08], a: [-115, -8], by: -0.42, bz: 0.11, bx: 0.05, hip: -0.78, sy: -0.68, sx: 0.28, l: [0.48, -0.08, 0.06] },
    ],
  },
  /** hit 3: the diagonal again, out of the backhand: up behind the right shoulder, cocked, through */
  cutA3: {
    line: 'right', ...CUT, slash: [[1.17, 1.36]], step: [0.3, 1.28],
    lF: [0.16, 0.7], rF: [-0.17, -0.52], fy: [0.1, -0.8], drag: 0.18,
    keys: [
      { u: 0.35, h: [-0.22, 0.16, -0.06], a: [-150, 46], rp: [-0.8, -0.5, 0.2], l: [0.3, -0.36, 0.1], lp: [0.3, -0.85, -0.3], hs: 0 },
      { u: 0.55, hy: 0.3, by: -0.18, bz: -0.05, bx: -0.05, hip: -0.7, sy: -0.6, sx: 0.0 },
      { u: 0.62, h: [-0.08, 0.38, -0.04], a: [-168, 70], rp: [-0.85, 0.1, 0.5] },
      { u: 0.86, h: [0.0, 0.44, -0.03], a: [148, 34], rp: [-0.6, 0.35, 0.7] },
      { u: 1.0, hy: 0.38, h: [0.0, 0.44, -0.025], a: [147, 34], rp: [-0.6, 0.35, 0.7], by: -0.1, bz: -0.04, bx: -0.04, hip: -0.48, sy: -0.42, sx: -0.1, l: [0.3, -0.38, 0.12], lp: [0.3, -0.85, -0.3] },
      { u: 1.1, hy: 0.38, h: [0.0, 0.44, -0.02], a: [146, 34], rp: [-0.6, 0.35, 0.7], by: -0.1, bz: -0.04, bx: -0.04, hip: -0.48, sy: -0.42, sx: -0.1 },
      { u: 1.17, h: [-0.04, 0.34, 0.3], a: [-150, 66], rp: [-0.75, -0.2, 0.6] },
      { u: 1.27, hy: -0.05, h: [0.06, 0.02, 0.54], a: [-22, 12], rp: [-0.72, -0.66, 0.1], by: -0.22, bz: 0.12, bx: 0.02, hip: 0.3, sy: 0.14, sx: 0.55, l: [0.24, -0.26, -0.04], lp: [0.45, -0.8, -0.3] },
      { u: 1.36, h: [0.3, -0.3, 0.42], a: [36, -28], rp: [-0.45, -0.88, -0.1] },
      { u: 1.46, hy: -0.12, h: [0.32, -0.35, 0.37], a: [48, -36], rp: [-0.42, -0.9, -0.1], by: -0.36, bz: 0.18, bx: 0.05, hip: 0.6, sy: 0.5, sx: 0.86, l: [0.15, -0.1, -0.32], lp: [0.5, -0.75, -0.3] },
      { u: 1.6, h: [0.33, -0.39, 0.32], a: [58, -42] },
      { u: 1.8, h: [0.34, -0.41, 0.27], a: [67, -46], by: -0.44, bz: 0.21, bx: 0.05, hip: 0.75, sy: 0.65, sx: 0.97, l: [0.08, 0.02, -0.44] },
      { u: 2.08, hy: -0.1, h: [0.35, -0.43, 0.23], a: [74, -49], by: -0.47, bz: 0.22, bx: 0.06, hip: 0.82, sy: 0.72, sx: 1.02 },
      { u: 2.38, h: [0.355, -0.44, 0.21], a: [78, -50], rp: [-0.45, -0.9, -0.1], l: [0.09, 0.0, -0.44], lp: [0.5, -0.75, -0.3] },
      { u: 2.92, hy: -0.08, h: [0.36, -0.45, 0.2], a: [80, -51], by: -0.45, bz: 0.2, bx: 0.05, hip: 0.78, sy: 0.68, sx: 0.98, l: [0.1, -0.02, -0.43] },
    ],
  },
  /** hit 4: the falling backhand, from over his left shoulder to low out on his right */
  cutA4: {
    line: 'left', ...CUT, slash: [[1.2, 1.5]], step: [0.12, 1.3],
    lF: [0.17, 0.6], rF: [-0.18, -0.48], fy: [0.3, -0.6], drag: 0.26,
    keys: [
      { u: 0.25, h: [0.24, -0.22, 0.32], a: [80, 4], by: -0.4, l: [0.12, -0.1, -0.3], lp: [0.5, -0.5, -0.7], hs: 0 },
      { u: 0.5, h: [0.2, 0.06, 0.28], a: [76, 34], l: [0.15, -0.3, 0.02], lp: [0.5, -0.8, -0.3] },
      { u: 0.6, by: -0.2, bz: -0.04, bx: -0.05, hip: 0.34, sy: 0.44, sx: 0.04 },
      { u: 0.86, h: [0.28, 0.33, 0.05], a: [126, 58] },
      { u: 1.0, h: [0.28, 0.33, 0.06], a: [125, 58], by: -0.15, bz: -0.03, bx: -0.04, hip: 0.26, sy: 0.36, sx: 0.0, l: [0.14, -0.38, 0.12], lp: [0.55, -0.8, -0.2] },
      { u: 1.1, h: [0.28, 0.33, 0.07], a: [124, 58], by: -0.15, bz: -0.03, bx: -0.04, hip: 0.26, sy: 0.36, sx: 0.0 },
      { u: 1.22, h: [0.2, 0.22, 0.34], a: [58, 44] },
      { u: 1.36, h: [0.0, -0.02, 0.54], a: [16, 8], by: -0.2, bz: 0.1, bx: 0.02, hip: -0.14, sy: -0.1, sx: 0.22, l: [0.33, -0.17, 0.06], lp: [0.4, -0.7, -0.6] },
      { u: 1.5, h: [-0.3, -0.24, 0.42], a: [-44, -16] },
      { u: 1.62, h: [-0.37, -0.28, 0.32], a: [-62, -18], by: -0.36, bz: 0.14, bx: 0.05, hip: -0.3, sy: -0.36, sx: 0.26, l: [0.38, -0.22, 0.08], lp: [0.5, -0.6, -0.6] },
      { u: 1.8, h: [-0.41, -0.31, 0.22], a: [-76, -19] },
      { u: 2.0, h: [-0.43, -0.32, 0.14], a: [-88, -19], by: -0.46, bz: 0.15, bx: 0.05, hip: -0.4, sy: -0.48, sx: 0.3, l: [0.32, -0.38, 0.12] },
      { u: 2.15, by: -0.5, bz: 0.16, bx: 0.06, hip: -0.48, sy: -0.56, sx: 0.36 },
      { u: 2.4, h: [-0.44, -0.33, 0.06], a: [-100, -20] },
      { u: 2.92, h: [-0.44, -0.34, 0.03], a: [-106, -21], by: -0.48, bz: 0.14, bx: 0.05, hip: -0.44, sy: -0.52, sx: 0.32, l: [0.22, -0.46, 0.18], lp: [0.6, -0.5, -0.5] },
    ],
  },
  /** hit 5 (one of three): the overhead chop into a bow, the blade dropped behind his back, a leap in */
  cutA5: {
    line: 'down', ...LAST, slash: [[1.22, 1.55]], step: [0.3, 1.35],
    lF: [0.16, 0.62], rF: [-0.18, -0.46], fy: [0.2, -0.7], drag: 0.22,
    keys: [
      { u: 0.3, h: [-0.34, -0.12, 0.18], a: [-96, 6], by: -0.24, hip: -0.24, sy: -0.3, sx: 0.2, l: [0.14, -0.3, 0.2], lp: [0.5, -0.8, -0.3], hs: 0 },
      { u: 0.6, h: [-0.16, 0.3, 0.08], a: [-128, 66], rp: [-0.85, 0.1, 0.5] },
      { u: 0.72, by: -0.05, bz: -0.07, bx: -0.06, hip: -0.68, sy: -0.8, sx: -0.12 },
      { u: 0.9, h: [-0.02, 0.45, -0.06], a: [-176, 46], l: [0.08, -0.22, 0.36], lp: [0.5, -0.8, -0.3] },
      { u: 1.0, h: [-0.02, 0.45, -0.055], a: [-177, 46], by: -0.08, bz: -0.06, bx: -0.05, hip: -0.6, sy: -0.72, sx: -0.1, hx: -0.06 },
      { u: 1.18, h: [-0.02, 0.45, -0.05], a: [-178, 46], by: -0.08, bz: -0.06, bx: -0.05, hip: -0.6, sy: -0.72, sx: -0.1, hx: -0.06, l: [0.08, -0.22, 0.36] },
      { u: 1.28, h: [-0.07, 0.41, 0.3], a: [-20, 70] },
      { u: 1.4, h: [-0.03, 0.11, 0.54], a: [-6, 17], by: -0.26, bz: 0.13, bx: 0.02, hip: 0.1, sy: 0.12, sx: 0.4, hx: 0.0, l: [0.1, -0.06, -0.12], lp: [0.4, -0.6, -0.7] },
      { u: 1.52, h: [0.03, -0.16, 0.52], a: [8, -14] },
      { u: 1.64, h: [0.05, -0.26, 0.47], a: [14, -24], by: -0.34, bz: 0.16, bx: 0.04, hip: 0.32, sy: 0.42, sx: 0.68, l: [-0.14, 0.14, -0.32], lp: [0.3, -0.3, -0.9] },
      { u: 1.82, h: [0.06, -0.34, 0.4], a: [18, -33] },
      { u: 2.05, h: [0.07, -0.4, 0.35], a: [22, -40], by: -0.4, bz: 0.18, bx: 0.05, hip: 0.46, sy: 0.6, sx: 0.85, hx: 0.32, l: [-0.2, 0.22, -0.36], lp: [0.3, -0.2, -0.95] },
      { u: 2.2, by: -0.44, bz: 0.19, bx: 0.06, hip: 0.54, sy: 0.68, sx: 0.92 },
      { u: 2.45, h: [0.08, -0.43, 0.31], a: [24, -44] },
      { u: 2.92, h: [0.08, -0.43, 0.31], a: [25, -43], by: -0.41, bz: 0.18, bx: 0.05, hip: 0.49, sy: 0.63, sx: 0.86, hx: 0.29, l: [-0.19, 0.18, -0.35], lp: [0.3, -0.2, -0.95] },
    ],
  },
  /** hit 5 (one of three): the great diagonal, hit 1 out of a deeper coil and a longer step, carried on
   *  past his left hip */
  cutA5b: {
    line: 'right', ...LAST, slash: [[1.62, 1.9]], step: [0.45, 1.68],
    lF: [0.16, 0.76], rF: [-0.17, -0.54], fy: [0.1, -0.8], drag: 0.22,
    keys: [
      { u: 0.3, h: [-0.36, -0.06, 0.16], a: [-100, 20], rp: [-0.75, -0.6, 0.1], l: [0.1, -0.34, 0.24], lp: [0.4, -0.85, -0.2], hs: 0 },
      { u: 0.55, h: [-0.12, 0.34, 0.0], a: [-160, 62], rp: [-0.85, 0.1, 0.5] },
      { u: 0.7, hy: 0.36, by: -0.2, bz: -0.02, bx: -0.05, hip: -0.56, sy: -0.58, sx: -0.06 },
      { u: 0.9, h: [0.0, 0.47, -0.05], a: [150, 30], rp: [-0.6, 0.35, 0.7] },
      { u: 1.0, hy: 0.4, h: [0.0, 0.47, -0.045], a: [149, 30], rp: [-0.6, 0.35, 0.7], by: -0.21, bz: -0.02, bx: -0.04, hip: -0.5, sy: -0.54, sx: -0.08, l: [0.04, -0.36, 0.22], lp: [0.4, -0.85, -0.2] },
      { u: 1.44, hy: 0.4, h: [0.0, 0.47, -0.04], a: [148, 30], rp: [-0.6, 0.35, 0.7], by: -0.21, bz: -0.02, bx: -0.04, hip: -0.5, sy: -0.54, sx: -0.08 },
      { u: 1.57, h: [-0.12, 0.3, 0.26], a: [-116, 48], rp: [-0.8, -0.3, 0.5] },
      { u: 1.73, hy: -0.05, h: [0.08, -0.06, 0.55], a: [-8, 3], rp: [-0.72, -0.66, 0.1], by: -0.24, bz: 0.14, bx: 0.02, hip: 0.34, sy: 0.18, sx: 0.6, l: [0.1, -0.22, -0.04], lp: [0.45, -0.8, -0.3] },
      { u: 1.86, h: [0.3, -0.22, 0.45], a: [36, -12], rp: [-0.45, -0.88, -0.1] },
      { u: 1.96, hy: -0.14, h: [0.33, -0.27, 0.36], a: [54, -18], rp: [-0.4, -0.9, -0.15], by: -0.4, bz: 0.2, bx: 0.05, hip: 0.66, sy: 0.56, sx: 0.9, l: [0.09, -0.08, -0.33], lp: [0.5, -0.75, -0.3] },
      { u: 2.08, h: [0.35, -0.31, 0.28], a: [70, -24] },
      { u: 2.22, h: [0.37, -0.34, 0.2], a: [84, -28], by: -0.48, bz: 0.23, bx: 0.06, hip: 0.86, sy: 0.76, sx: 1.04, l: [0.08, 0.04, -0.44] },
      { u: 2.34, by: -0.5, bz: 0.24, bx: 0.06, hip: 0.92, sy: 0.8, sx: 1.06 },
      { u: 2.55, h: [0.38, -0.36, 0.14], a: [96, -31], rp: [-0.35, -0.9, -0.2] },
      { u: 2.92, hy: -0.1, h: [0.38, -0.37, 0.13], a: [100, -32], by: -0.47, bz: 0.22, bx: 0.05, hip: 0.86, sy: 0.74, sx: 1.0, l: [0.09, 0.02, -0.43], lp: [0.5, -0.75, -0.3] },
    ],
  },
  /** hit 5 (one of three): the level forehand, wound far round to his right, across to out on his left */
  cutA5c: {
    line: 'flat', ...LAST, slash: [[1.54, 1.8]], step: [0.35, 1.6],
    lF: [0.18, 0.6], rF: [-0.18, -0.52], fy: [0.3, -0.75], drag: 0.26,
    keys: [
      { u: 0.35, h: [-0.42, -0.2, 0.14], a: [-120, -6], l: [0.04, -0.2, 0.32], lp: [0.4, -0.85, -0.15], hs: 0 },
      { u: 0.6, by: -0.3, bz: -0.03, bx: -0.05, hip: -0.58, sy: -0.66, sx: 0.14 },
      { u: 0.9, h: [-0.44, -0.08, 0.04], a: [-130, 6], rp: [-0.2, -0.5, 0.85] },
      { u: 1.0, h: [-0.44, -0.08, 0.045], a: [-130, 6], rp: [-0.2, -0.5, 0.85], by: -0.3, bz: -0.03, bx: -0.04, hip: -0.54, sy: -0.62, sx: 0.16, l: [-0.02, -0.02, 0.4], lp: [0.35, -0.9, -0.1] },
      { u: 1.46, h: [-0.44, -0.08, 0.05], a: [-129, 6], rp: [-0.2, -0.5, 0.85], by: -0.3, bz: -0.03, bx: -0.04, hip: -0.54, sy: -0.62, sx: 0.16, l: [-0.02, -0.02, 0.4] },
      { u: 1.56, h: [-0.3, -0.08, 0.34], a: [-58, 6], rp: [-0.45, -0.75, 0.45] },
      { u: 1.68, h: [0.02, -0.12, 0.54], a: [-4, 2], by: -0.26, bz: 0.14, bx: 0.03, hip: 0.1, sy: 0.06, sx: 0.26, l: [0.14, -0.2, 0.16], lp: [0.45, -0.85, -0.3] },
      { u: 1.8, h: [0.32, -0.16, 0.42], a: [52, -4] },
      { u: 1.9, h: [0.38, -0.15, 0.33], a: [70, -4], by: -0.33, bz: 0.16, bx: 0.05, hip: 0.48, sy: 0.44, sx: 0.28, l: [0.22, -0.36, -0.12], lp: [0.75, -0.3, -0.6] },
      { u: 2.04, h: [0.42, -0.14, 0.24], a: [86, -3] },
      { u: 2.2, h: [0.44, -0.13, 0.17], a: [100, -2], by: -0.36, bz: 0.17, bx: 0.06, hip: 0.66, sy: 0.62, sx: 0.3, l: [0.22, -0.38, -0.22] },
      { u: 2.32, by: -0.38, bz: 0.17, bx: 0.06, hip: 0.72, sy: 0.68, sx: 0.31 },
      { u: 2.55, h: [0.45, -0.12, 0.13], a: [108, -1] },
      { u: 2.92, h: [0.45, -0.12, 0.12], a: [110, -1], by: -0.35, bz: 0.16, bx: 0.05, hip: 0.66, sy: 0.6, sx: 0.28, l: [0.22, -0.38, -0.22], lp: [0.75, -0.3, -0.6] },
    ],
  },
};

const clip = (c, o) => Object.freeze({ kind: 'clip', clip: c, ...o });

/** The looks of hits 1-5 (`null`: the blink set's own look for that hit, until the clip is written). */
export const LIGHT_CUTS_A = [
  Object.freeze({ anim: clip('cutA1', { hop: 0.08, tuck: 0.9 }), variants: Object.freeze([]), contact: 'light' }),
  Object.freeze({ anim: clip('cutA2'), variants: Object.freeze([]), contact: 'light' }),
  Object.freeze({ anim: clip('cutA3', { hop: 0.06 }), variants: Object.freeze([]), contact: 'light' }),
  // (today's hit 4 is a thrust: this one is a slash, drawn as one)
  Object.freeze({ anim: clip('cutA4'), variants: Object.freeze([]), contact: 'light', glint: null }),
  // (one of three strokes, never the same one twice running: anim.js _pickVariant; plain: no shards)
  Object.freeze({ anim: clip('cutA5', { hop: 0.1 }), variants: Object.freeze([clip('cutA5b'), clip('cutA5c')]), contact: 'sweep' }),
];
