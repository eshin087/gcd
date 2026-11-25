// The blink chain's hits 1-4 (`?lights=blink`, combat.js LIGHT_BLINK; the owner, 2026-11-25: "sharper
// angles and faster attacks, almost like the main character is doing instant slashes to show how fast
// he is"). The hits land on today's clock; what is instant is the CUT. Each clip:
//   HOLD   (u 1 … 1.26) he stands in the coil, still: the blade does not creep toward the cut
//   SNAP   (u 1.26 … 1.34, under a frame) the blade is suddenly at the cut's start, before him
//   CROSS  (u 1.34 … 1.58, about two frames) its point runs ONE STRAIGHT LINE across his front at full
//          reach, chest high: the frames the hit test reads (the game sweeps the blade between frames in
//          straight lines, so a blade that jumped the whole cut in one frame would cut the corner short)
//   SNAP   (u 1.58 … 1.70) on along the same line to the finish: the blade at rest lies where the line
//          it just drew carries on (blinkFx.js draws that line through the point's own frames)
//   STAND  (to the end; `home` 0.5) he holds the finish, still (zanshin)
// The cuts make sharp angles with each other: a falling diagonal from high right, a level backhand, a
// falling diagonal from high left (a Z, drawn in three beats), then a thrust that is simply there. One
// look per hit: the same exact cuts every time is the point. No spin, no hop. The free hand rests on
// the belt the whole time (`belt`: anim.js beltHand, the stances' own hand; the owner: "the left hand
// ... looks weird and flailing"). The cut keys' blade directions were solved so the point's path is a
// straight line (integ.mjs `blinksolve`); the hand keys and the body are written by hand.
// Clip format: swings.js's header. `slash`: blinkFx.js's header. Spread into SWINGS.

const HOLD = { home: 0.5, step: [0.08, 1.2], gather: [0.7, 0.5], side: true };

export const LIGHTS_BLINK = {
  /** hit 1: from high on the right, one straight diagonal down across his front to low left */
  blinkFall: {
    line: 'right', ...HOLD, slash: [[1.34, 1.66]],
    lF: [0.15, 0.5], rF: [-0.17, -0.46], fy: [0.15, -0.75], drag: 0.16,
    keys: [
      { u: 0.6, by: -0.06, bz: -0.08, bx: -0.06, hip: -0.44, sy: -0.52, sx: -0.08 },
      { u: 1, h: [-0.04, 0.2, 0.02], a: [-140, 42], by: -0.08, bz: -0.06, bx: -0.05, hip: -0.38, sy: -0.46, sx: -0.04, sz: 0.05 },
      { u: 1.26, h: [-0.04, 0.2, 0.02], a: [-140, 42], by: -0.08, bz: -0.06, bx: -0.05, hip: -0.38, sy: -0.46, sx: -0.04, sz: 0.05 },
      { u: 1.34, h: [-0.06, 0.16, 0.38], a: [-12.4, 17.3] },
      { u: 1.4, h: [-0.039, 0.109, 0.295], a: [-6.9, 11.3] },
      { u: 1.46, h: [-0.005, 0.044, 0.265], a: [-0.9, 4.8], by: -0.24, bz: 0.12, bx: 0.02, hip: 0.2, sy: 0.06, sx: 0.4, sz: 0 },
      { u: 1.52, h: [0.047, -0.031, 0.26], a: [4.6, -1] },
      { u: 1.58, h: [0.118, -0.112, 0.273], a: [9.6, -6.5] },
      { u: 1.64, h: [0.203, -0.197, 0.299], a: [14.4, -11.7] },
      { u: 1.7, h: [0.32, -0.3, 0.36], a: [18.7, -17], by: -0.32, bz: 0.15, bx: 0.06, hip: 0.4, sy: 0.42, sx: 0.48, sz: -0.07 },
      { u: 2, h: [0.32, -0.3, 0.352], a: [19.3, -16.7] },
      { u: 2.2, by: -0.34, bz: 0.15, bx: 0.06, hip: 0.44, sy: 0.46, sx: 0.5 },
      { u: 2.6, h: [0.32, -0.3, 0.344], a: [19.9, -16.4], by: -0.32, bz: 0.13, bx: 0.05, hip: 0.41, sy: 0.43, sx: 0.46, sz: -0.06 },
    ],
  },
  /** hit 2: the backhand, dead level at the chest from his left to his right */
  blinkFlat: {
    line: 'flat', ...HOLD, slash: [[1.34, 1.66]],
    lF: [0.2, 0.4], fy: [0.6, -0.55],
    keys: [
      { u: 0.6, by: -0.2, bz: -0.08, bx: -0.06, hip: 0.48, sy: 0.56, sx: 0.18 },
      { u: 1, h: [0.36, -0.08, 0.17], a: [146, 13], by: -0.19, bz: -0.07, bx: -0.05, hip: 0.42, sy: 0.5, sx: 0.16 },
      { u: 1.26, h: [0.36, -0.08, 0.17], a: [146, 13], by: -0.19, bz: -0.07, bx: -0.05, hip: 0.42, sy: 0.5, sx: 0.16 },
      { u: 1.34, h: [0.4, -0.06, 0.34], a: [50.4, 2.9] },
      { u: 1.4, h: [0.27, -0.056, 0.294], a: [42, 3.5] },
      { u: 1.46, h: [0.16, -0.054, 0.275], a: [32.1, 4], by: -0.24, bz: 0.11, bx: 0.02, hip: -0.06, sy: 0.02, sx: 0.26 },
      { u: 1.52, h: [0.061, -0.051, 0.268], a: [22.3, 4.6] },
      { u: 1.58, h: [-0.021, -0.047, 0.278], a: [12.3, 5.1] },
      { u: 1.64, h: [-0.093, -0.044, 0.313], a: [2.2, 5.7] },
      { u: 1.7, h: [-0.16, -0.04, 0.38], a: [-8, 6.3], by: -0.26, bz: 0.14, bx: 0.06, hip: -0.4, sy: -0.42, sx: 0.2 },
      { u: 2, h: [-0.16, -0.04, 0.372], a: [-7.4, 6.6] },
      { u: 2.2, by: -0.28, bz: 0.14, bx: 0.06, hip: -0.44, sy: -0.46, sx: 0.22 },
      { u: 2.6, h: [-0.16, -0.04, 0.364], a: [-6.8, 6.9], by: -0.26, bz: 0.12, bx: 0.05, hip: -0.41, sy: -0.43, sx: 0.18 },
    ],
  },
  /** hit 3: from over the left shoulder, one straight diagonal down across his front to low right */
  blinkCross: {
    line: 'left', ...HOLD, slash: [[1.34, 1.66]],
    lF: [0.15, 0.5], rF: [-0.17, -0.46], fy: [0.15, -0.75], drag: 0.16,
    keys: [
      { u: 0.6, by: -0.11, bz: -0.08, bx: -0.06, hip: 0.44, sy: 0.54, sx: -0.06 },
      { u: 1, h: [0.3, 0.14, 0.1], a: [150, 44], by: -0.1, bz: -0.06, bx: -0.05, hip: 0.36, sy: 0.46, sx: 0, sz: -0.05 },
      { u: 1.26, h: [0.3, 0.14, 0.1], a: [150, 44], by: -0.1, bz: -0.06, bx: -0.05, hip: 0.36, sy: 0.46, sx: 0, sz: -0.05 },
      { u: 1.34, h: [0.38, 0.14, 0.34], a: [52.7, 15.5] },
      { u: 1.4, h: [0.275, 0.08, 0.239], a: [41.1, 10.5] },
      { u: 1.46, h: [0.175, 0.023, 0.154], a: [29.1, 4.7], by: -0.26, bz: 0.12, bx: 0.02, hip: -0.08, sy: -0.02, sx: 0.36 },
      { u: 1.52, h: [0.101, -0.061, 0.141], a: [17.5, -1] },
      { u: 1.58, h: [0.107, -0.118, 0.209], a: [6.5, -6.4] },
      { u: 1.64, h: [0.045, -0.202, 0.276], a: [-3.9, -11.4] },
      { u: 1.7, h: [-0.04, -0.3, 0.38], a: [-13.4, -15.8], by: -0.34, bz: 0.15, bx: 0.06, hip: -0.38, sy: -0.4, sx: 0.48, sz: 0.07 },
      { u: 2, h: [-0.04, -0.3, 0.372], a: [-12.8, -15.5] },
      { u: 2.2, by: -0.36, bz: 0.15, bx: 0.06, hip: -0.42, sy: -0.44, sx: 0.5 },
      { u: 2.6, h: [-0.04, -0.3, 0.364], a: [-12.2, -15.2], by: -0.34, bz: 0.13, bx: 0.05, hip: -0.39, sy: -0.41, sx: 0.46, sz: 0.06 },
    ],
  },
  /** hit 4: the thrust: drawn back at the ribs, then the point is simply there, and he holds the line;
   *  a short streak runs on off the point (blinkFx.js) */
  blinkThrust: {
    line: 'point', home: 0.5, gather: [0.7, 0.5], side: true, slash: [[1.4, 0.9, 'point']],
    rF: [-0.17, -0.46], fy: [0.1, -0.8], drag: 0.12,
    lF: [0.14, 0.56],
    keys: [
      { u: 0.6, by: -0.17, bz: -0.12, bx: -0.06, hip: -0.46, sy: -0.6, sx: 0.0 },
      { u: 1.0, h: [-0.03, -0.2, -0.1], a: [3, 22], by: -0.21, bz: -0.1, hip: -0.38, sy: -0.52, sx: 0.08, bx: -0.05 },
      { u: 1.22, h: [-0.03, -0.2, -0.1], a: [3, 22], by: -0.21, bz: -0.1, hip: -0.38, sy: -0.52, sx: 0.08, bx: -0.05 },
      { u: 1.3, h: [0.08, -0.06, 0.3], a: [1, 30] },
      { u: 1.4, h: [0.15, 0.1, 0.48], a: [0, 35], by: -0.36, bz: 0.17, hip: 0.26, sy: 0.36, sx: 0.5, bx: 0.05 },
      { u: 2.0, h: [0.15, 0.1, 0.48], a: [0, 35] },
      { u: 2.15, by: -0.38, bz: 0.18, bx: 0.05, hip: 0.3, sy: 0.4, sx: 0.52 },
      { u: 2.6, h: [0.15, 0.09, 0.47], a: [0, 34], by: -0.36, bz: 0.16, hip: 0.27, sy: 0.37, sx: 0.5, bx: 0.04 },
    ],
  },
};
