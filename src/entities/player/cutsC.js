// Instant-cut light combo, variant c (`?lights=blink&cuts=c`, combat.js setCuts; ADR-215): wide committed arcs.
// Hits 1-5 only; the heavies and the specials stay the blink set's. Clip format: swings.js. Data only.
//
// The biggest motion of the four. Every hit is one instant cut (the blade crosses his front in two or three
// frames, blinkFx.js draws the line) between two big poses:
//   COIL     (u 0.86 … 1.1; hit 5 to 1.26) wound far round: the chest turned 90-100° away from the cut (hips
//            + chest), the blade drawn round behind him, the weight on the rear foot; the free hand reaches
//            the other way, low (at the foe along the shoulder line, or gathered by the hip)
//   CUT      (two or three frames) the hips lead the chest round 150-180° (the chest lags them at mid-cut),
//            the sword arm opens to near straight and the blade sweeps the widest arc of the four; the free
//            arm comes IN before the chest as it turns (a tuck, never a straight arm swung round)
//   FOLLOW   (~10 frames) the swing carries on round to the far side (the blade 60-90° on, the hand
//            slowing), the body turning on and sinking onto the planted foot; the free arm is thrown out
//            along the shoulder line the other way, the counterweight (the reference's arm flung back)
//   HOLD     (`home` 1.0, `settle`) the finish is held, still drifting, to the end of the recovery; he
//            rises out of it slowly, his feet stepping home (player.js _tickAttack, anim.js _settleStep)
// Each finish is the next hit's way in (the blade swings back the way a pendulum does), and each step
// lands its foot turned out and wide of the line (`lF`, `fy`): he steps round with the turn, never a spin.
// The sword arm is keyed by hand (`rp`): through a coil behind him the elbow leads forward so the forearm
// carries the blade on its line (the wrist breaks past ~80° otherwise).
//   hit 1  the wheel: from the fight hold, the blade wound up behind his right shoulder, one falling
//          diagonal across his front to low left, the free arm thrown back
//   hit 2  the great backhand: drawn round to his left hip, the blade pointing back; level across his chest
//          and round behind his right shoulder, the arms spread
//   hit 3  the rising arc: dropped low behind his right hip; up across his front to high over his left
//          shoulder, the free hand thrown down behind his hip
//   hit 4  the falling backhand: over his left shoulder, the blade behind his head; down across his front to
//          low out on his right, the free arm out wide on his left
//   hit 5  one of three stronger strokes on the longer clock (`plain`: no shards; never the same twice
//          running), each from hit 4's finish low on his right, wound round behind his right shoulder:
//          the great wheel (the deepest wind, the steepest falling diagonal, the deepest lunge), the full
//          sweep (level round his front, rising on round to high over his left shoulder), the reaping cut
//          (in at the chest, then down to knee height as he drops into a crouch, the free hand up). The
//          wyrm's chest stands high and hit 5's reach band is low (`up` 1): every stroke comes in with the
//          blade raised, or it falls short of where the blink set's strokes land.

const CUT = { home: 1.0, settle: 0.45, gather: [0.7, 0.5], lead: [0.03, 0.015] };
const LAST = { home: 1.0, settle: 0.5, gather: [0.7, 0.5], lead: [0.03, 0.015], plain: true, slashLook: 'strong' };

export const CUTS_C = {
  /** hit 1: the wheel, the blade wound up behind his right shoulder, a falling diagonal to low left */
  cutC1: {
    line: 'right', ...CUT, slash: [[1.15, 1.42]], step: [0.08, 1.2],
    lF: [0.2, 0.6], rF: [-0.2, -0.48], fy: [0.4, -0.85], drag: 0.18,
    keys: [
      { u: 0.3, hs: 0 },
      { u: 0.45, h: [-0.22, 0.14, 0.18], a: [-120, 50], rp: [-0.6, -0.55, 0.55], l: [-0.16, -0.2, 0.34], lp: [0.4, -0.85, -0.2] },
      { u: 0.6, two: 0 },
      { u: 0.6, by: -0.05, bz: -0.1, bx: -0.07, hip: -0.8, sy: -1.0, sx: -0.12 },
      { u: 0.86, h: [-0.2, 0.24, 0.04], a: [-142, 26], rp: [-0.5, -0.45, 0.75] },
      { u: 1, h: [-0.2, 0.24, 0.05], a: [-141, 26], rp: [-0.5, -0.45, 0.75], by: -0.08, bz: -0.08, bx: -0.06, hip: -0.72, sy: -0.92, sx: -0.08, sz: 0.05, l: [-0.141, -0.12, 0.293], lp: [0.35, -0.9, -0.1], ld: [-6, 8], pn: [-1, 0, 0] },
      { u: 1.1, h: [-0.2, 0.24, 0.06], a: [-140, 26], rp: [-0.5, -0.45, 0.75] },
      { u: 1.22, h: [-0.16, 0.22, 0.42], a: [-70, 34], rp: [-0.75, -0.55, 0.35] },
      { u: 1.32, h: [0.02, 0.04, 0.56], a: [-20, 10], rp: [-0.8, -0.6, 0], by: -0.24, bz: 0.12, bx: 0.02, hip: 0.18, sy: -0.3, sx: 0.4, l: [0.097, -0.25, 0.213] },
      { u: 1.42, h: [0.32, -0.3, 0.42], a: [40, -32], rp: [-0.45, -0.88, -0.1] },
      { u: 1.52, h: [0.335, -0.28, 0.37], a: [52, -28], by: -0.33, bz: 0.15, bx: 0.05, hip: 0.46, sy: 0.4, sx: 0.48, sz: -0.05, rp: [-0.3, -0.95, -0.1] },
      { u: 1.66, h: [0.348, -0.285, 0.3], a: [70, -31], l: [0.3, 0.0, -0.3], lp: [0.45, -0.8, -0.35], ld: [160, 10], pn: [0, -1, 0] },
      { u: 1.8, h: [0.356, -0.29, 0.23], a: [88, -34], by: -0.37, bz: 0.16, bx: 0.05, hip: 0.6, sy: 0.6, sx: 0.5, sz: -0.06 },
      { u: 2.02, h: [0.362, -0.295, 0.15], a: [108, -37], by: -0.38, bz: 0.16, bx: 0.05, hip: 0.68, sy: 0.72, sx: 0.5, sz: -0.07, l: [0.26, 0.04, -0.4] },
      { u: 2.2, h: [0.364, -0.297, 0.11], a: [120, -38] },
      { u: 2.45, h: [0.365, -0.3, 0.09], a: [126, -38], by: -0.37, bz: 0.15, bx: 0.05, hip: 0.66, sy: 0.7, sx: 0.48, sz: -0.07, rp: [-0.3, -0.95, -0.1] },
      { u: 2.95, h: [0.365, -0.31, 0.08], a: [129, -39], by: -0.36, bz: 0.15, bx: 0.05, hip: 0.64, sy: 0.68, sx: 0.46, sz: -0.06, l: [0.25, 0.02, -0.39] },
    ],
  },
  /** hit 2: the great backhand, drawn round to his left hip, level across his chest and round behind his right shoulder */
  cutC2: {
    line: 'flat', ...CUT, slash: [[1.15, 1.42]], step: [0.08, 1.2],
    lF: [0.26, 0.4], rF: [-0.2, -0.46], fy: [0.75, -0.6], drag: 0.2,
    keys: [
      { u: 0.3, two: 0, hs: 0 },
      { u: 0.5, h: [0.34, -0.26, 0.1], a: [150, -14], rp: [0.1, -0.6, 0.8], l: [0.18, -0.36, 0.06], lp: [0.5, -0.8, -0.3] },
      { u: 0.6, by: -0.24, bz: -0.08, bx: -0.07, hip: 0.8, sy: 0.98, sx: 0.2 },
      { u: 0.86, h: [0.34, -0.24, -0.02], a: [166, -4], rp: [0.2, -0.45, 0.85] },
      { u: 1, h: [0.34, -0.24, -0.01], a: [165, -4], rp: [0.2, -0.45, 0.85], by: -0.22, bz: -0.07, bx: -0.06, hip: 0.72, sy: 0.92, sx: 0.18, l: [0.14, -0.4, 0.04], lp: [0.55, -0.75, -0.3], ld: [150, -40], pn: [-1, 0, 0] },
      { u: 1.1, h: [0.34, -0.24, 0.0], a: [164, -4], rp: [0.2, -0.45, 0.85] },
      { u: 1.22, h: [0.3, -0.16, 0.38], a: [88, -2], rp: [-0.2, -0.85, 0.45] },
      { u: 1.32, h: [0.0, -0.1, 0.56], a: [10, 2], rp: [-0.45, -0.85, 0.1], by: -0.27, bz: 0.12, bx: 0.02, hip: -0.12, sy: 0.3, sx: 0.3, l: [0.159, -0.28, 0.195] },
      { u: 1.42, h: [-0.34, -0.06, 0.44], a: [-52, 4], rp: [-0.6, -0.75, -0.15] },
      { u: 1.52, h: [-0.36, -0.065, 0.4], a: [-64, 5], by: -0.3, bz: 0.14, bx: 0.05, hip: -0.46, sy: -0.4, sx: 0.28, rp: [-0.6, -0.6, 0.4] },
      { u: 1.66, h: [-0.385, -0.07, 0.33], a: [-82, 6], l: [0.3, -0.06, 0.36], lp: [0.15, -0.9, -0.4], ld: [20, 0], pn: [0, -1, 0] },
      { u: 1.8, h: [-0.405, -0.075, 0.26], a: [-98, 7], by: -0.32, bz: 0.14, bx: 0.05, hip: -0.6, sy: -0.6, sx: 0.28 },
      { u: 2.02, h: [-0.42, -0.08, 0.18], a: [-114, 8], by: -0.32, bz: 0.14, bx: 0.05, hip: -0.66, sy: -0.72, sx: 0.28, l: [0.24, -0.08, 0.44] },
      { u: 2.2, h: [-0.425, -0.085, 0.14], a: [-122, 8] },
      { u: 2.45, h: [-0.428, -0.09, 0.12], a: [-127, 8], by: -0.31, bz: 0.13, bx: 0.05, hip: -0.64, sy: -0.7, sx: 0.26, rp: [-0.6, -0.6, 0.4] },
      { u: 2.95, h: [-0.43, -0.1, 0.11], a: [-130, 7], by: -0.3, bz: 0.13, bx: 0.05, hip: -0.62, sy: -0.68, sx: 0.25, l: [0.23, -0.1, 0.43] },
    ],
  },
  /** hit 3: the rising arc, dropped low behind his right hip, up across his front to high over his left shoulder */
  cutC3: {
    line: 'left', ...CUT, slash: [[1.1, 1.36]], step: [0.08, 1.2],
    lF: [0.2, 0.56], rF: [-0.2, -0.48], fy: [0.4, -0.85], drag: 0.2,
    keys: [
      { u: 0.3, two: 0, hs: 0 },
      { u: 0.55, by: -0.36, bz: -0.09, bx: -0.07, hip: -0.82, sy: -1.0, sx: 0.36 },
      { u: 0.86, h: [-0.26, -0.36, 0.08], a: [-158, -26], rp: [-0.65, -0.35, 0.7] },
      { u: 1, h: [-0.26, -0.36, 0.09], a: [-157, -26], rp: [-0.65, -0.35, 0.7], by: -0.33, bz: -0.07, bx: -0.06, hip: -0.74, sy: -0.94, sx: 0.32, sz: 0.04, l: [-0.053, -0.24, 0.298], lp: [0.45, -0.85, -0.2], ld: [-4, -12], pn: [0, -1, 0] },
      { u: 1.08, h: [-0.26, -0.36, 0.1], a: [-156, -26], rp: [-0.65, -0.35, 0.7] },
      { u: 1.18, h: [-0.26, -0.28, 0.42], a: [-66, -22], rp: [-0.75, -0.6, 0.3] },
      { u: 1.27, h: [0.04, -0.06, 0.56], a: [-14, 4], rp: [-0.5, -0.85, 0.1], by: -0.24, bz: 0.12, bx: 0.02, hip: 0.14, sy: -0.3, sx: 0.32, l: [0.089, -0.3, 0.217] },
      { u: 1.36, h: [0.32, 0.12, 0.44], a: [42, 28], rp: [-0.3, -0.95, 0.1] },
      { u: 1.46, h: [0.34, 0.13, 0.4], a: [54, 31], by: -0.22, bz: 0.13, bx: 0.05, hip: 0.44, sy: 0.4, sx: 0.28, sz: -0.04, rp: [-0.3, -0.95, 0.05] },
      { u: 1.6, h: [0.37, 0.14, 0.33], a: [72, 35], l: [0.3, -0.38, -0.24], lp: [0.7, -0.4, -0.55], ld: [170, -50], pn: [-1, 0, 0] },
      { u: 1.74, h: [0.39, 0.15, 0.26], a: [88, 38], by: -0.21, bz: 0.12, bx: 0.05, hip: 0.58, sy: 0.6, sx: 0.25, sz: -0.05 },
      { u: 1.98, h: [0.405, 0.155, 0.18], a: [106, 41], by: -0.19, bz: 0.11, bx: 0.05, hip: 0.66, sy: 0.72, sx: 0.23, sz: -0.06, l: [0.3, -0.4, -0.3] },
      { u: 2.18, h: [0.41, 0.158, 0.14], a: [116, 42] },
      { u: 2.42, h: [0.412, 0.16, 0.12], a: [121, 42], by: -0.19, bz: 0.11, bx: 0.05, hip: 0.64, sy: 0.7, sx: 0.22, sz: -0.06, rp: [-0.3, -0.95, 0.05] },
      { u: 2.95, h: [0.412, 0.16, 0.11], a: [124, 42], by: -0.19, bz: 0.11, bx: 0.05, hip: 0.62, sy: 0.68, sx: 0.21, sz: -0.05, l: [0.29, -0.41, -0.29] },
    ],
  },
  /** hit 4: the falling backhand, over his left shoulder with the blade behind his head, down to low out on his right */
  cutC4: {
    line: 'left', ...CUT, slash: [[1.28, 1.52]], step: [0.08, 1.2],
    lF: [0.24, 0.5], rF: [-0.2, -0.48], fy: [0.65, -0.65], drag: 0.2,
    keys: [
      { u: 0.3, two: 0, hs: 0 },
      { u: 0.6, by: -0.1, bz: -0.1, bx: -0.07, hip: 0.8, sy: 0.98, sx: -0.04 },
      { u: 0.86, h: [0.24, 0.2, -0.14], a: [160, 32], rp: [0.35, -0.2, 0.9] },
      { u: 1, h: [0.24, 0.2, -0.13], a: [159, 32], rp: [0.35, -0.2, 0.9], by: -0.12, bz: -0.08, bx: -0.06, hip: 0.72, sy: 0.92, sx: -0.02, sz: -0.05, l: [0.19, -0.25, -0.155], lp: [0.6, -0.75, -0.2], ld: [22, 55], pn: [-1, 0, 0] },
      { u: 1.24, h: [0.24, 0.2, -0.12], a: [158, 32], rp: [0.35, -0.2, 0.9] },
      { u: 1.34, h: [0.26, 0.12, 0.38], a: [80, 24], rp: [0.0, -0.6, 0.8] },
      { u: 1.43, h: [0.0, -0.1, 0.56], a: [4, -6], rp: [-0.45, -0.85, 0.1], by: -0.3, bz: 0.13, bx: 0.02, hip: -0.12, sy: 0.3, sx: 0.42, l: [0.215, -0.2, 0.164] },
      { u: 1.51, h: [-0.34, -0.28, 0.42], a: [-54, -22], rp: [-0.6, -0.75, -0.1] },
      { u: 1.6, h: [-0.36, -0.29, 0.38], a: [-66, -23], by: -0.38, bz: 0.15, bx: 0.05, hip: -0.46, sy: -0.4, sx: 0.48, sz: 0.05, rp: [-0.6, -0.6, 0.3] },
      { u: 1.71, h: [-0.385, -0.3, 0.31], a: [-84, -24], l: [0.42, 0.0, 0.2], lp: [0.2, -0.75, -0.6], ld: [80, 10], pn: [0, -1, 0] },
      { u: 1.83, h: [-0.405, -0.31, 0.24], a: [-100, -25], by: -0.42, bz: 0.16, bx: 0.05, hip: -0.6, sy: -0.6, sx: 0.5, sz: 0.06 },
      { u: 2.02, h: [-0.42, -0.315, 0.16], a: [-116, -26], by: -0.43, bz: 0.16, bx: 0.05, hip: -0.66, sy: -0.72, sx: 0.5, sz: 0.07, l: [0.42, 0.02, 0.18] },
      { u: 2.2, h: [-0.425, -0.318, 0.12], a: [-124, -26] },
      { u: 2.45, h: [-0.428, -0.32, 0.1], a: [-128, -26], by: -0.42, bz: 0.15, bx: 0.05, hip: -0.64, sy: -0.7, sx: 0.48, sz: 0.06, rp: [-0.6, -0.6, 0.3] },
      { u: 2.95, h: [-0.43, -0.33, 0.09], a: [-130, -27], by: -0.41, bz: 0.15, bx: 0.05, hip: -0.62, sy: -0.68, sx: 0.46, sz: 0.06, l: [0.41, 0.0, 0.19] },
    ],
  },

  // ---- hit 5: three stronger strokes (windup 0.28, active 0.13, recovery 0.42), each from hit 4's finish low on his right
  /** the great wheel: the blade swung up round behind his right shoulder, the deepest wind, a falling diagonal into the deepest lunge */
  cutC5Wheel: {
    line: 'right', ...LAST, slash: [[1.3, 1.56]], step: [0.1, 1.3],
    lF: [0.2, 0.66], rF: [-0.2, -0.52], fy: [0.4, -0.85], drag: 0.22,
    keys: [
      { u: 0.3, two: 0, hs: 0 },
      { u: 0.5, h: [-0.3, 0.02, 0.2], a: [-110, 30], rp: [-0.7, -0.6, 0.3], l: [0.1, -0.3, 0.3], lp: [0.45, -0.85, -0.2] },
      { u: 0.62, by: -0.22, bz: -0.08, bx: -0.07, hip: -0.88, sy: -1.08, sx: 0.04 },
      { u: 1, h: [-0.18, 0.3, 0.02], a: [-146, 36], rp: [-0.5, -0.45, 0.75], by: -0.2, bz: -0.07, bx: -0.06, hip: -0.8, sy: -1.0, sx: 0.0, sz: 0.06, l: [-0.166, -0.1, 0.271], lp: [0.35, -0.9, -0.1], ld: [-6, 10], pn: [-1, 0, 0] },
      { u: 1.26, h: [-0.18, 0.3, 0.03], a: [-145, 36], rp: [-0.5, -0.45, 0.75] },
      { u: 1.35, h: [-0.14, 0.3, 0.39], a: [-70, 44], rp: [-0.75, -0.55, 0.35] },
      { u: 1.44, h: [0.02, 0.04, 0.56], a: [-18, 8], rp: [-0.8, -0.6, 0], by: -0.28, bz: 0.14, bx: 0.03, hip: 0.2, sy: -0.28, sx: 0.46, l: [0.106, -0.25, 0.209] },
      { u: 1.53, h: [0.28, -0.38, 0.43], a: [36, -44], rp: [-0.45, -0.88, -0.1] },
      { u: 1.62, h: [0.32, -0.34, 0.38], a: [50, -40], rp: [-0.3, -0.95, -0.1] },
      { u: 1.75, h: [0.345, -0.3, 0.31], a: [68, -33], by: -0.4, bz: 0.18, bx: 0.05, hip: 0.54, sy: 0.5, sx: 0.56, sz: -0.05, l: [0.3, 0.02, -0.32], lp: [0.45, -0.8, -0.35], ld: [160, 12], pn: [0, -1, 0] },
      { u: 1.87, h: [0.355, -0.305, 0.25], a: [84, -35] },
      { u: 1.97, h: [0.36, -0.31, 0.2], a: [96, -37] },
      { u: 2.08, h: [0.364, -0.315, 0.15], a: [110, -38], by: -0.44, bz: 0.2, bx: 0.06, hip: 0.72, sy: 0.76, sx: 0.58, sz: -0.07, l: [0.26, 0.06, -0.42] },
      { u: 2.24, h: [0.366, -0.318, 0.11], a: [122, -39] },
      { u: 2.37, h: [0.367, -0.32, 0.09], a: [127, -39], by: -0.45, bz: 0.2, bx: 0.06, hip: 0.76, sy: 0.8, sx: 0.58, sz: -0.07, rp: [-0.3, -0.95, -0.1] },
      { u: 2.95, h: [0.367, -0.33, 0.08], a: [130, -40], by: -0.43, bz: 0.19, bx: 0.05, hip: 0.72, sy: 0.76, sx: 0.55, sz: -0.06, l: [0.25, 0.04, -0.41] },
    ],
  },
  /** the full sweep: the blade drawn back behind his right shoulder, level round his front and rising on to high over his left shoulder */
  cutC5Sweep: {
    line: 'flat', ...LAST, slash: [[1.3, 1.56]], step: [0.1, 1.3],
    lF: [0.24, 0.62], rF: [-0.2, -0.5], fy: [0.5, -0.8], drag: 0.22,
    keys: [
      { u: 0.3, two: 0, hs: 0 },
      { u: 0.5, h: [-0.4, -0.12, 0.12], a: [-130, 0], rp: [-0.7, -0.6, 0.3], l: [0.1, -0.3, 0.3], lp: [0.45, -0.85, -0.2] },
      { u: 0.62, by: -0.2, bz: -0.1, bx: -0.07, hip: -0.88, sy: -1.08, sx: 0.12 },
      { u: 1, h: [-0.36, 0.04, -0.04], a: [-158, 24], rp: [-0.45, -0.5, 0.75], by: -0.22, bz: -0.09, bx: -0.06, hip: -0.8, sy: -1.0, sx: 0.14, l: [-0.166, -0.12, 0.271], lp: [0.35, -0.9, -0.1], ld: [-6, 4], pn: [-1, 0, 0] },
      { u: 1.26, h: [-0.36, 0.04, -0.03], a: [-157, 24], rp: [-0.45, -0.5, 0.75] },
      { u: 1.35, h: [-0.3, 0.06, 0.36], a: [-74, 12], rp: [-0.75, -0.6, 0.3] },
      { u: 1.44, h: [0.0, 0.14, 0.55], a: [-10, 14], rp: [-0.6, -0.8, 0.0], by: -0.3, bz: 0.14, bx: 0.03, hip: 0.18, sy: -0.28, sx: 0.32, l: [0.101, -0.25, 0.211] },
      { u: 1.53, h: [0.32, 0.22, 0.44], a: [52, 20], rp: [-0.3, -0.9, -0.2] },
      { u: 1.62, h: [0.35, 0.26, 0.38], a: [66, 24], rp: [-0.2, -0.95, -0.2] },
      { u: 1.75, h: [0.37, 0.28, 0.31], a: [84, 26], by: -0.34, bz: 0.18, bx: 0.05, hip: 0.56, sy: 0.52, sx: 0.36, l: [0.12, 0.0, -0.4], lp: [0.4, -0.8, -0.4], ld: [170, 10], pn: [0, -1, 0] },
      { u: 1.87, h: [0.38, 0.29, 0.25], a: [100, 27] },
      { u: 1.97, h: [0.39, 0.295, 0.2], a: [110, 28] },
      { u: 2.08, h: [0.4, 0.3, 0.15], a: [120, 28], by: -0.37, bz: 0.2, bx: 0.06, hip: 0.74, sy: 0.78, sx: 0.38, l: [0.06, 0.06, -0.44] },
      { u: 2.24, h: [0.405, 0.3, 0.12], a: [126, 28] },
      { u: 2.37, h: [0.41, 0.3, 0.11], a: [129, 28], by: -0.38, bz: 0.2, bx: 0.06, hip: 0.78, sy: 0.82, sx: 0.38, rp: [-0.3, -0.95, 0.05] },
      { u: 2.95, h: [0.41, 0.29, 0.1], a: [131, 27], by: -0.36, bz: 0.19, bx: 0.05, hip: 0.74, sy: 0.78, sx: 0.36, l: [0.05, 0.04, -0.43] },
    ],
  },
  /** the reaping cut: from behind his right shoulder in at the chest, then down round to knee height on his left as he drops into a crouch, the free arm up */
  cutC5Low: {
    line: 'low', ...LAST, slash: [[1.3, 1.56]], step: [0.1, 1.3],
    lF: [0.26, 0.6], rF: [-0.2, -0.5], fy: [0.55, -0.85], drag: 0.24,
    keys: [
      { u: 0.3, two: 0, hs: 0 },
      { u: 0.5, h: [-0.38, -0.16, 0.14], a: [-120, 4], rp: [-0.75, -0.5, 0.3], l: [0.1, -0.3, 0.3], lp: [0.45, -0.85, -0.2] },
      { u: 0.62, by: -0.24, bz: -0.1, bx: -0.07, hip: -0.86, sy: -1.04, sx: 0.18 },
      { u: 1, h: [-0.34, 0.06, -0.02], a: [-158, 22], rp: [-0.55, -0.4, 0.75], by: -0.24, bz: -0.08, bx: -0.06, hip: -0.78, sy: -0.98, sx: 0.16, l: [-0.135, -0.2, 0.282], lp: [0.45, -0.85, -0.2], ld: [-4, -10], pn: [0, -1, 0] },
      { u: 1.26, h: [-0.34, 0.06, -0.01], a: [-157, 22], rp: [-0.55, -0.4, 0.75] },
      { u: 1.35, h: [-0.26, 0.2, 0.37], a: [-72, 30], rp: [-0.75, -0.6, 0.3] },
      { u: 1.44, h: [0.02, 0.1, 0.55], a: [-12, 14], rp: [-0.6, -0.8, 0.0], by: -0.28, bz: 0.14, bx: 0.03, hip: 0.16, sy: -0.28, sx: 0.3, l: [0.095, -0.2, 0.233] },
      { u: 1.53, h: [0.32, -0.1, 0.42], a: [48, -4], rp: [-0.3, -0.9, -0.2] },
      { u: 1.62, h: [0.34, -0.24, 0.37], a: [62, -10], rp: [-0.2, -0.95, -0.2] },
      { u: 1.75, h: [0.355, -0.35, 0.3], a: [80, -8], by: -0.48, bz: 0.17, bx: 0.05, hip: 0.5, sy: 0.48, sx: 0.54, l: [0.22, 0.16, -0.06], lp: [0.85, -0.3, 0.4], ld: [-10, 75], pn: [0.2, 0, 1] },
      { u: 1.87, h: [0.37, -0.345, 0.24], a: [96, -7] },
      { u: 1.97, h: [0.38, -0.342, 0.19], a: [108, -6] },
      { u: 2.08, h: [0.388, -0.34, 0.14], a: [120, -5], by: -0.5, bz: 0.18, bx: 0.06, hip: 0.68, sy: 0.72, sx: 0.55, l: [0.22, 0.18, -0.1] },
      { u: 2.24, h: [0.392, -0.338, 0.1], a: [130, -4] },
      { u: 2.37, h: [0.394, -0.336, 0.08], a: [134, -4], by: -0.5, bz: 0.18, bx: 0.06, hip: 0.72, sy: 0.76, sx: 0.55, rp: [0.0, -0.85, 0.5] },
      { u: 2.95, h: [0.395, -0.34, 0.07], a: [137, -4], by: -0.48, bz: 0.17, bx: 0.05, hip: 0.68, sy: 0.72, sx: 0.52, l: [0.21, 0.16, -0.1] },
    ],
  },
};

const clip = (c) => Object.freeze({ kind: 'clip', clip: c });

/** The looks of hits 1-5 (`null`: the blink set's own look for that hit). Hit 5: one of three strokes,
 *  never the same one twice running (anim.js _pickVariant), drawn as a strong slash. */
export const LIGHT_CUTS_C = [
  { anim: clip('cutC1'), variants: [], contact: 'light' },
  { anim: clip('cutC2'), variants: [], contact: 'light' },
  { anim: clip('cutC3'), variants: [], contact: 'sweep' },
  { anim: clip('cutC4'), variants: [], contact: 'light', glint: null },
  { anim: clip('cutC5Wheel'), variants: [clip('cutC5Sweep'), clip('cutC5Low')], contact: 'sweep' },
];
