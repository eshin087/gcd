// Instant-cut light combo, variant b (`?lights=blink&cuts=b`, combat.js setCuts; ADR-235): LUNGING DRAWS.
// Hits 1-5 only; the heavies and the specials stay the blink set's. Clip format: swings.js. Data only.
//
// A sword-drawing feel (iai): every hit gathers LOW AND TIGHT, at a hip or a shoulder, as if the blade
// were still in its scabbard, holds there a beat (the tell), then one LONG step and the blade is simply
// out, at full reach AHEAD of him: the hand furthest from the shoulder past the front foot, the torso
// leaned 30-45° over a bent front knee, the rear leg long, the head up. The finish is a far, low, still
// extension, held to the end of the recovery (`home` 1.0), and he rises out of it slowly (`settle`). The
// free hand works like the scabbard hand: at the coil it guides (pointing at the foe) or holds the
// scabbard's mouth at the left hip; through the cut it is pulled back (behind the hip, or thrown back at
// shoulder height) against the blade. The hits alternate sides, each starting where the last left the
// blade:
//   1  the shoulder draw   coiled at the right shoulder, the blade laid back over it; a falling diagonal
//                          from high right across his front, out to low left far ahead        (line 'right')
//   2  the hip draw        drawn back to the left hip, the blade pointing back past it as from the
//                          scabbard; a level backhand at the waist out to far ahead on his right (line 'flat')
//   3  the rising draw     low and tight at the right hip, the blade back and down; a rising diagonal
//                          from low right across his front up to ahead-left at the shoulder   (line 'left')
//   4  the draw thrust     the hand drawn back to the right ribs, the point already ahead; the longest
//                          lunge, the arm and the body one line behind the point              (line 'point')
//   5  a stronger draw, a different one each chain (`anim` + `variants`, never the same twice running):
//      cutB5Draw  the great draw from the left hip, level at the chest, far out to his right    (line 'flat')
//      cutB5Kesa  the great shoulder draw, from over the right shoulder down onto the deepest lunge (line 'right')
//      cutB5Low   from low at the right hip, a draw along the knees to far ahead on his left    (line 'low')
// Each clip: GATHER (u 0.3-0.86: the hand to the coil, the body winding away from the cut and sinking),
// COIL (u 0.86-1.1, hit 5 1.0-1.18: nearly still), CUT (two to three frames: the arm opens to its full
// length round the shoulder, the hips leading the chest, the weight onto the front foot), FOLLOW (about
// ten frames: the blade carries on 40-60° and slows, ~40 % of it two frames on, the body still sinking and
// leaning into the lunge), HOLD (to u 2.95: a still drift), then `settle`.

const DRAW = { home: 1.0, settle: 0.42, gather: [0.7, 0.5] };
const LAST = { home: 1.0, settle: 0.5, gather: [0.7, 0.5], plain: true, slashLook: 'strong' };
// the free hand's places (offsets from the left shoulder, body axes)
const AIM = { l: [-0.03, -0.06, 0.38], lp: [0.35, -0.9, -0.1], ld: [-6, 10], pn: [-1, 0, 0], hs: 1, lk: 0 }; // guiding: the sword fingers at the foe
const AIMLO = { l: [0.04, -0.26, 0.34], lp: [0.45, -0.85, -0.2], ld: [-4, -14], pn: [0, -1, 0], hs: 1, lk: 0 }; // a low guide
const SAYA = { l: [0.02, -0.4, 0.06], lp: [0.5, -0.8, -0.3], ld: [-15, -60], pn: [-1, 0, 0], hs: 0, lk: 0 }; // on the scabbard's mouth at the left hip
const BACKHI = { l: [0.08, -0.08, -0.42], lp: [0.5, -0.8, -0.2], ld: [170, -8], pn: [0, -1, 0], hs: 1, lk: 0 }; // thrown back at shoulder height
const BACKLO = { l: [0.18, -0.37, -0.28], lp: [0.7, -0.4, -0.6], ld: [165, -50], pn: [-1, 0, 0], hs: 1, lk: 0 }; // pulled back behind the hip

export const CUTS_B = {
  /** hit 1, the shoulder draw: from the right shoulder, a falling diagonal out to low left far ahead */
  cutB1: {
    line: 'right', ...DRAW, slash: [[1.15, 1.42]], step: [0.1, 1.25],
    lF: [0.16, 0.66], rF: [-0.18, -0.5], fy: [0.15, -0.8], drag: 0.2,
    keys: [
      { u: 0.35, h: [-0.24, 0.02, 0.3], a: [-70, 45], rp: [-0.6, -0.7, 0.3], l: [-0.2, -0.24, 0.3], lp: [0.6, -0.7, -0.2], hs: 0 },
      { u: 0.8, two: 0 },
      { u: 0.6, by: -0.1, bz: -0.08, bx: -0.06, hip: -0.52, sy: -0.62, sx: 0.0 },
      { u: 0.86, h: [-0.21, 0.18, -0.08], a: [-163, 24], rp: [-0.55, -0.75, 0.35] },
      { u: 1, h: [-0.21, 0.18, -0.07], a: [-163, 24], rp: [-0.55, -0.75, 0.35], by: -0.14, bz: -0.06, bx: -0.05, hip: -0.44, sy: -0.54, sx: 0.04, sz: 0.04, ...AIM },
      { u: 1.1, h: [-0.21, 0.18, -0.06], a: [-162, 24], rp: [-0.55, -0.75, 0.35], by: -0.14, bz: -0.06, bx: -0.05, hip: -0.44, sy: -0.54, sx: 0.04, sz: 0.04 },
      { u: 1.22, h: [-0.16, 0.17, 0.27], a: [-80, 30], rp: [-0.75, -0.55, 0.35] },
      { u: 1.32, h: [0.02, 0.02, 0.56], a: [-22, 6], rp: [-0.8, -0.6, 0], by: -0.28, bz: 0.14, bx: 0.02, hip: 0.16, sy: 0.04, sx: 0.48, sz: 0, l: [0.12, -0.1, 0.06], lp: [0.45, -0.85, -0.3], ld: [80, 0], pn: [0, -1, 0] },
      { u: 1.42, h: [0.13, -0.13, 0.55], a: [16, -12], rp: [-0.6, -0.8, -0.05] },
      { u: 1.52, h: [0.17, -0.18, 0.53], a: [27, -16], by: -0.38, bz: 0.2, bx: 0.05, hip: 0.4, sy: 0.34, sx: 0.66, sz: -0.04 },
      { u: 1.66, h: [0.21, -0.23, 0.5], a: [38, -20] },
      { u: 1.8, h: [0.235, -0.26, 0.48], a: [46, -23], by: -0.44, bz: 0.22, bx: 0.06, hip: 0.5, sy: 0.46, sx: 0.76, sz: -0.05, ...BACKHI },
      { u: 2.02, h: [0.25, -0.28, 0.465], a: [52, -25], by: -0.47, bz: 0.23, bx: 0.06, hip: 0.56, sy: 0.52, sx: 0.82, sz: -0.06, rp: [-0.45, -0.88, -0.1] },
      { u: 2.2, h: [0.256, -0.288, 0.46], a: [55, -26] },
      { u: 2.45, h: [0.26, -0.292, 0.455], a: [57, -26], by: -0.47, bz: 0.23, bx: 0.06, hip: 0.58, sy: 0.54, sx: 0.82, sz: -0.06, l: [0.08, -0.08, -0.44] },
      { u: 2.95, h: [0.262, -0.296, 0.45], a: [58, -27], rp: [-0.45, -0.88, -0.1], by: -0.46, bz: 0.22, bx: 0.05, hip: 0.57, sy: 0.53, sx: 0.8, sz: -0.06, l: [0.08, -0.1, -0.43] },
    ],
  },
  /** hit 2, the hip draw: back to the left hip as from the scabbard, a level backhand at the waist out to far ahead on his right */
  cutB2: {
    line: 'flat', ...DRAW, slash: [[1.15, 1.42]], step: [0.1, 1.25],
    lF: [0.2, 0.62], rF: [-0.18, -0.5], fy: [0.5, -0.65], drag: 0.2,
    keys: [
      { u: 0.4, h: [0.24, -0.3, 0.3], a: [110, -14], rp: [0, -0.6, 0.8] },
      { u: 0.55, l: [0.08, -0.3, -0.14], lp: [0.6, -0.7, -0.4], ld: [120, -40], pn: [-1, 0, 0], hs: 0 },
      { u: 0.6, by: -0.36, bz: -0.02, bx: -0.06, hip: 0.5, sy: 0.6, sx: 0.26 },
      { u: 0.86, h: [0.22, -0.34, 0.02], a: [150, -14], rp: [-0.1, -0.5, 0.86] },
      { u: 1, h: [0.22, -0.34, 0.03], a: [150, -14], rp: [-0.1, -0.5, 0.86], by: -0.34, bz: -0.01, bx: -0.05, hip: 0.42, sy: 0.52, sx: 0.24, ...SAYA },
      { u: 1.1, h: [0.22, -0.34, 0.04], a: [149, -14], rp: [-0.1, -0.5, 0.86], by: -0.34, bz: -0.01, bx: -0.05, hip: 0.42, sy: 0.52, sx: 0.24, l: [0.05, -0.4, -0.08] },
      { u: 1.22, h: [0.2, -0.27, 0.42], a: [82, -8], rp: [-0.3, -0.85, 0.4] },
      { u: 1.32, h: [0.0, -0.22, 0.56], a: [16, -5], rp: [-0.5, -0.85, 0.1], by: -0.3, bz: 0.13, bx: 0.02, hip: -0.06, sy: 0.0, sx: 0.42, l: [0.1, -0.4, -0.16], lp: [0.6, -0.6, -0.5], ld: [150, -55] },
      { u: 1.42, h: [-0.17, -0.21, 0.52], a: [-18, -6], rp: [-0.6, -0.75, -0.15] },
      { u: 1.52, h: [-0.2, -0.215, 0.51], a: [-27, -8], by: -0.38, bz: 0.2, bx: 0.05, hip: -0.2, sy: -0.16, sx: 0.6 },
      { u: 1.66, h: [-0.23, -0.22, 0.49], a: [-36, -10] },
      { u: 1.8, h: [-0.25, -0.228, 0.475], a: [-44, -11], by: -0.43, bz: 0.22, bx: 0.06, hip: -0.28, sy: -0.24, sx: 0.68, ...BACKLO },
      { u: 2.02, h: [-0.25, -0.234, 0.475], a: [-45, -12], by: -0.46, bz: 0.23, bx: 0.06, hip: -0.32, sy: -0.28, sx: 0.74, rp: [-0.6, -0.7, -0.3] },
      { u: 2.2, h: [-0.253, -0.237, 0.472], a: [-47, -12] },
      { u: 2.45, h: [-0.255, -0.24, 0.47], a: [-48, -12], by: -0.46, bz: 0.23, bx: 0.06, hip: -0.34, sy: -0.3, sx: 0.74 },
      { u: 2.95, h: [-0.256, -0.242, 0.468], a: [-48, -12], rp: [-0.6, -0.7, -0.3], by: -0.45, bz: 0.22, bx: 0.05, hip: -0.33, sy: -0.29, sx: 0.72, l: [0.18, -0.38, -0.28] },
    ],
  },
  /** hit 3, the rising draw: low and tight at the right hip, a rising diagonal up to ahead-left at the shoulder */
  cutB3: {
    line: 'left', ...DRAW, slash: [[1.1, 1.36]], step: [0.08, 1.2],
    lF: [0.16, 0.66], rF: [-0.18, -0.5], fy: [0.2, -0.8], drag: 0.2,
    keys: [
      { u: 0.35, h: [-0.28, -0.26, 0.32], a: [-82, -18], rp: [-0.55, -0.5, 0.65] },
      { u: 0.62, h: [-0.28, -0.3, 0.22], a: [-90, -30], rp: [0.0, -0.65, 0.75] },
      { u: 0.6, by: -0.36, bz: -0.03, bx: -0.06, hip: -0.5, sy: -0.58, sx: 0.34 },
      { u: 0.88, h: [-0.26, -0.33, 0.14], a: [-104, -34], rp: [0.15, -0.65, 0.75] },
      { u: 1, h: [-0.26, -0.33, 0.15], a: [-104, -34], rp: [0.15, -0.65, 0.75], by: -0.34, bz: -0.02, bx: -0.05, hip: -0.42, sy: -0.5, sx: 0.32, ...AIMLO },
      { u: 1.08, h: [-0.26, -0.33, 0.16], a: [-103, -34], rp: [0.15, -0.65, 0.75], by: -0.34, bz: -0.02, bx: -0.05, hip: -0.42, sy: -0.5, sx: 0.32 },
      { u: 1.18, h: [-0.15, -0.24, 0.47], a: [-58, -18], rp: [-0.7, -0.6, 0.3] },
      { u: 1.27, h: [0.02, -0.08, 0.56], a: [-16, 2], rp: [-0.5, -0.85, 0.1], by: -0.3, bz: 0.13, bx: 0.02, hip: 0.1, sy: 0.0, sx: 0.45, l: [0.14, -0.3, 0.0], lp: [0.6, -0.6, -0.4], ld: [100, -40], pn: [-1, 0, 0] },
      { u: 1.36, h: [0.19, 0.05, 0.53], a: [20, 18], rp: [-0.35, -0.92, 0.1] },
      { u: 1.46, h: [0.23, 0.085, 0.51], a: [29, 22], by: -0.38, bz: 0.2, bx: 0.05, hip: 0.34, sy: 0.3, sx: 0.6 },
      { u: 1.6, h: [0.265, 0.11, 0.49], a: [38, 26] },
      { u: 1.74, h: [0.285, 0.125, 0.475], a: [44, 28], by: -0.42, bz: 0.22, bx: 0.06, hip: 0.44, sy: 0.42, sx: 0.66, ...BACKLO },
      { u: 1.98, h: [0.3, 0.135, 0.465], a: [49, 30], by: -0.44, bz: 0.23, bx: 0.06, hip: 0.5, sy: 0.48, sx: 0.7, rp: [-0.3, -0.95, 0.05] },
      { u: 2.18, h: [0.306, 0.14, 0.46], a: [51, 31] },
      { u: 2.42, h: [0.31, 0.142, 0.457], a: [52, 31], by: -0.44, bz: 0.23, bx: 0.06, hip: 0.52, sy: 0.5, sx: 0.7 },
      { u: 2.95, h: [0.312, 0.14, 0.455], a: [52, 30], rp: [-0.3, -0.95, 0.05], by: -0.43, bz: 0.22, bx: 0.05, hip: 0.51, sy: 0.49, sx: 0.68, l: [0.18, -0.38, -0.28] },
    ],
  },
  /** hit 4, the draw thrust: drawn back to the right ribs, the point already ahead, then the longest lunge behind the point */
  cutB4: {
    line: 'point', ...DRAW, slash: [[1.36, 0.9, 'point']], lead: [0.02, 0.01], step: [0.06, 1.2],
    lF: [0.15, 0.72], rF: [-0.17, -0.52], fy: [0.1, -0.85], drag: 0.16,
    keys: [
      { u: 0.4, h: [0.1, -0.12, 0.3], a: [20, 12], rp: [-0.3, -0.8, -0.3] },
      { u: 0.6, by: -0.34, bz: -0.04, bx: -0.06, hip: -0.5, sy: -0.64, sx: 0.12 },
      { u: 0.8, h: [-0.03, -0.3, 0.07], a: [5, 14], rp: [-0.2, -0.7, -0.7] },
      { u: 1, h: [-0.03, -0.3, 0.08], a: [5, 14], rp: [-0.2, -0.7, -0.7], by: -0.32, bz: -0.03, bx: -0.05, hip: -0.42, sy: -0.56, sx: 0.14, ...AIM },
      { u: 1.08, h: [-0.03, -0.3, 0.09], a: [5, 14], rp: [-0.2, -0.7, -0.7], by: -0.32, bz: -0.03, bx: -0.05, hip: -0.42, sy: -0.56, sx: 0.14 },
      { u: 1.2, h: [0.01, -0.17, 0.3], a: [5, 20], rp: [-0.25, -0.85, -0.45], l: [0.04, -0.07, 0.22], lp: [0.45, -0.85, -0.25], ld: [60, 5], pn: [0, -1, 0] },
      { u: 1.32, h: [0.04, -0.06, 0.46], a: [4, 26], rp: [-0.3, -0.9, -0.1], by: -0.4, bz: 0.2, bx: 0.05, hip: 0.3, sy: 0.4, sx: 0.6, l: [0.12, -0.07, -0.08], lp: [0.5, -0.8, -0.3], ld: [130, 0] },
      { u: 1.44, h: [0.06, 0.015, 0.58], a: [4, 29], rp: [-0.3, -0.9, -0.1] },
      { u: 1.56, h: [0.065, 0.024, 0.605], a: [4, 30] },
      { u: 1.68, h: [0.064, 0.015, 0.6], a: [3, 29], ...BACKHI },
      { u: 1.8, h: [0.06, 0.0, 0.58], a: [3, 27], by: -0.46, bz: 0.24, bx: 0.06, hip: 0.36, sy: 0.46, sx: 0.72 },
      { u: 2.05, h: [0.058, -0.012, 0.572], a: [2, 25] },
      { u: 2.3, h: [0.056, -0.02, 0.566], a: [2, 24] },
      { u: 2.5, h: [0.055, -0.025, 0.562], a: [2, 24], by: -0.47, bz: 0.24, bx: 0.06, hip: 0.38, sy: 0.48, sx: 0.74, l: [0.08, -0.08, -0.44] },
      { u: 2.95, h: [0.054, -0.03, 0.558], a: [2, 23], rp: [-0.3, -0.9, -0.1], by: -0.46, bz: 0.23, bx: 0.05, hip: 0.37, sy: 0.47, sx: 0.72, l: [0.08, -0.1, -0.43] },
    ],
  },

  // ---- hit 5: a stronger draw, one of three (windup 0.28, active 0.13, recovery 0.42) ----------------------
  /** the great draw: from the left hip, level at the chest, far out to his right */
  cutB5Draw: {
    line: 'flat', ...LAST, slash: [[1.24, 1.56]], step: [0.1, 1.3],
    lF: [0.18, 0.74], rF: [-0.18, -0.54], fy: [0.45, -0.75], drag: 0.24,
    keys: [
      { u: 0.35, h: [0.08, -0.2, 0.34], a: [80, 0], rp: [0, -0.6, 0.8] },
      { u: 0.55, by: -0.38, bz: -0.03, bx: -0.07, hip: 0.66, sy: 0.72, sx: 0.28 },
      { u: 1, h: [0.21, -0.33, 0.02], a: [152, -12], rp: [-0.1, -0.5, 0.86], by: -0.36, bz: -0.02, bx: -0.06, hip: 0.58, sy: 0.64, sx: 0.26, ...SAYA },
      { u: 1.18, h: [0.21, -0.33, 0.03], a: [151, -12], rp: [-0.1, -0.5, 0.86] },
      { u: 1.26, h: [0.21, -0.24, 0.32], a: [86, -4], rp: [-0.3, -0.85, 0.4] },
      { u: 1.34, h: [0.08, -0.1, 0.54], a: [32, -2] },
      { u: 1.42, h: [-0.06, -0.07, 0.56], a: [-4, -1], rp: [-0.5, -0.85, 0.1], by: -0.36, bz: 0.15, bx: 0.03, hip: -0.1, sy: -0.06, sx: 0.45, l: [0.1, -0.4, -0.1], lp: [0.6, -0.6, -0.5], ld: [150, -55], pn: [-1, 0, 0] },
      { u: 1.5, h: [-0.19, -0.08, 0.52], a: [-26, -2] },
      { u: 1.58, h: [-0.27, -0.09, 0.48], a: [-40, -3], rp: [-0.6, -0.75, -0.15] },
      { u: 1.72, h: [-0.31, -0.1, 0.46], a: [-50, -4], by: -0.44, bz: 0.2, bx: 0.05, hip: -0.4, sy: -0.38, sx: 0.62 },
      { u: 1.85, h: [-0.335, -0.11, 0.445], a: [-57, -5] },
      { u: 2.08, h: [-0.34, -0.12, 0.44], a: [-58, -6], by: -0.5, bz: 0.24, bx: 0.06, hip: -0.56, sy: -0.5, sx: 0.74, ...BACKLO },
      { u: 2.24, h: [-0.345, -0.125, 0.435], a: [-60, -7] },
      { u: 2.37, h: [-0.347, -0.127, 0.433], a: [-61, -7], by: -0.52, bz: 0.24, bx: 0.06, hip: -0.6, sy: -0.54, sx: 0.76 },
      { u: 2.95, h: [-0.347, -0.13, 0.43], a: [-61, -8], rp: [-0.6, -0.7, -0.3], by: -0.5, bz: 0.23, bx: 0.05, hip: -0.58, sy: -0.52, sx: 0.74, l: [0.18, -0.38, -0.29] },
    ],
  },
  /** the great shoulder draw: from over the right shoulder down across his front onto the deepest lunge */
  cutB5Kesa: {
    line: 'right', ...LAST, slash: [[1.24, 1.56]], step: [0.1, 1.3],
    lF: [0.16, 0.76], rF: [-0.18, -0.54], fy: [0.15, -0.8], drag: 0.24,
    keys: [
      { u: 0.35, h: [-0.12, 0.0, 0.3], a: [-40, 40], rp: [-0.6, -0.7, 0.3] },
      { u: 0.55, by: -0.3, bz: -0.03, bx: -0.07, hip: -0.6, sy: -0.7, sx: 0.08 },
      { u: 1, h: [-0.22, 0.2, -0.1], a: [-165, 26], rp: [-0.55, -0.75, 0.35], by: -0.28, bz: -0.02, bx: -0.06, hip: -0.52, sy: -0.62, sx: 0.08, sz: 0.05, ...AIM },
      { u: 1.18, h: [-0.22, 0.2, -0.09], a: [-164, 26], rp: [-0.55, -0.75, 0.35] },
      { u: 1.26, h: [-0.18, 0.19, 0.22], a: [-90, 32], rp: [-0.75, -0.55, 0.35] },
      { u: 1.34, h: [-0.06, 0.1, 0.5], a: [-44, 20] },
      { u: 1.42, h: [0.04, -0.02, 0.57], a: [-10, 4], rp: [-0.8, -0.6, 0], by: -0.32, bz: 0.15, bx: 0.03, hip: 0.14, sy: 0.06, sx: 0.5, sz: 0, l: [0.12, -0.1, 0.04], lp: [0.45, -0.85, -0.3], ld: [80, 0], pn: [0, -1, 0] },
      { u: 1.5, h: [0.11, -0.07, 0.56], a: [8, -4] },
      { u: 1.58, h: [0.17, -0.13, 0.53], a: [20, -9], rp: [-0.6, -0.8, -0.05] },
      { u: 1.72, h: [0.21, -0.19, 0.5], a: [31, -14], by: -0.44, bz: 0.21, bx: 0.05, hip: 0.44, sy: 0.38, sx: 0.72 },
      { u: 1.85, h: [0.235, -0.23, 0.48], a: [39, -17] },
      { u: 2.08, h: [0.255, -0.27, 0.46], a: [47, -20], by: -0.5, bz: 0.24, bx: 0.06, hip: 0.6, sy: 0.56, sx: 0.86, sz: -0.06, ...BACKHI },
      { u: 2.24, h: [0.262, -0.28, 0.455], a: [51, -21] },
      { u: 2.37, h: [0.265, -0.284, 0.452], a: [52, -21], by: -0.52, bz: 0.24, bx: 0.06, hip: 0.62, sy: 0.58, sx: 0.86, sz: -0.06 },
      { u: 2.95, h: [0.266, -0.286, 0.45], a: [53, -21], rp: [-0.45, -0.88, -0.1], by: -0.5, bz: 0.23, bx: 0.05, hip: 0.6, sy: 0.56, sx: 0.84, sz: -0.06, l: [0.08, -0.1, -0.43] },
    ],
  },
  /** low at the right hip, a draw along the knees to far ahead on his left */
  cutB5Low: {
    line: 'low', ...LAST, slash: [[1.24, 1.56]], step: [0.1, 1.3],
    lF: [0.18, 0.78], rF: [-0.18, -0.54], fy: [0.3, -0.85], drag: 0.26,
    keys: [
      { u: 0.35, h: [-0.2, -0.28, 0.32], a: [-60, -14], rp: [-0.6, -0.5, 0.6] },
      { u: 0.7, h: [-0.27, -0.33, 0.2], a: [-90, -28], rp: [0.0, -0.65, 0.75] },
      { u: 0.55, by: -0.4, bz: -0.03, bx: -0.07, hip: -0.62, sy: -0.68, sx: 0.38 },
      { u: 1, h: [-0.26, -0.36, 0.12], a: [-106, -32], rp: [0.15, -0.65, 0.75], by: -0.38, bz: -0.02, bx: -0.06, hip: -0.54, sy: -0.6, sx: 0.36, ...AIMLO },
      { u: 1.18, h: [-0.26, -0.36, 0.13], a: [-105, -32], rp: [0.15, -0.65, 0.75] },
      { u: 1.26, h: [-0.19, -0.35, 0.37], a: [-62, -18], rp: [-0.7, -0.6, 0.3] },
      { u: 1.34, h: [-0.1, -0.3, 0.46], a: [-36, -10] },
      { u: 1.42, h: [0.06, -0.24, 0.55], a: [-6, -5], rp: [-0.5, -0.85, 0.1], by: -0.36, bz: 0.16, bx: 0.03, hip: 0.1, sy: 0.06, sx: 0.46, l: [0.14, -0.3, 0.0], lp: [0.6, -0.6, -0.4], ld: [100, -40], pn: [-1, 0, 0] },
      { u: 1.5, h: [0.18, -0.24, 0.51], a: [18, -5] },
      { u: 1.58, h: [0.255, -0.25, 0.48], a: [32, -7], rp: [-0.35, -0.9, 0.0] },
      { u: 1.72, h: [0.275, -0.27, 0.465], a: [40, -9], by: -0.44, bz: 0.21, bx: 0.05, hip: 0.42, sy: 0.38, sx: 0.62 },
      { u: 1.85, h: [0.28, -0.29, 0.455], a: [46, -11] },
      { u: 2.08, h: [0.3, -0.31, 0.44], a: [53, -13], by: -0.56, bz: 0.25, bx: 0.06, hip: 0.56, sy: 0.52, sx: 0.8, ...BACKHI },
      { u: 2.24, h: [0.307, -0.33, 0.435], a: [56, -15] },
      { u: 2.37, h: [0.31, -0.33, 0.432], a: [57, -15], by: -0.58, bz: 0.25, bx: 0.06, hip: 0.6, sy: 0.56, sx: 0.82 },
      { u: 2.95, h: [0.312, -0.33, 0.43], a: [58, -15], rp: [-0.35, -0.9, 0.0], by: -0.56, bz: 0.24, bx: 0.05, hip: 0.58, sy: 0.54, sx: 0.8, l: [0.08, -0.1, -0.43] },
    ],
  },
};

const clip = (c) => Object.freeze({ kind: 'clip', clip: c });

/** The looks of hits 1-5 (combat.js setLights `wear`: only the look changes, never a number of the hit).
 *  Hit 4 keeps the def's own thrust contact and ridge glint; hit 5 is drawn as a strong slash ('sweep'). */
export const LIGHT_CUTS_B = [
  Object.freeze({ anim: clip('cutB1'), variants: Object.freeze([]) }),
  Object.freeze({ anim: clip('cutB2'), variants: Object.freeze([]) }),
  Object.freeze({ anim: clip('cutB3'), variants: Object.freeze([]) }),
  Object.freeze({ anim: clip('cutB4'), variants: Object.freeze([]) }),
  Object.freeze({ anim: clip('cutB5Draw'), variants: Object.freeze([clip('cutB5Kesa'), clip('cutB5Low')]), contact: 'sweep' }),
];
