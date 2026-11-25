// The blink chain's hits 1-4 (`?lights=blink`, combat.js LIGHT_BLINK; the owner, 2026-11-25: "sharper
// angles and faster attacks, almost like the main character is doing instant slashes to show how fast
// he is"). The hits land on today's clock; what is instant is the CUT. Each clip:
//   HOLD   (u 1 … 1.28) he stands in the coil, still: the blade does not creep toward the cut
//   SNAP   (u 1.28 … 1.38, under a frame) the blade is suddenly just short of straight ahead
//   CROSS  (u 1.38 … 1.56, a frame or two) it crosses his front at full reach: the frames the hit
//          test reads (the game sweeps the blade between frames in straight lines, so a blade that
//          jumped the whole cut in one frame would cut the corner and reach short)
//   SNAP   (u 1.56 … 1.68) it is at the finish
//   STAND  (to the end; `home` 0.5) he holds the finish, still (zanshin)
// The cuts make sharp angles with each other, each one straight line (blinkFx.js draws it): a falling
// diagonal from high right, a flat backhand, a falling diagonal from high left (a Z, drawn in three
// beats), then a thrust that is simply there. One look per hit: the same exact cuts every time is the
// point. No spin, no hop. Clip format: swings.js's header. Spread into SWINGS.
// `slash` [u, len m, left, up] / [u, len, 'point']: the straight line blinkFx.js draws for the cut.

const HOLD = { home: 0.5, step: [0.08, 1.2], gather: [0.7, 0.5] };

export const LIGHTS_BLINK = {
  /** hit 1: from high on the right, one straight diagonal down across his front to low left */
  blinkFall: {
    line: 'right', ...HOLD, slash: [1.45, 3.6, 1, -0.85],
    lF: [0.15, 0.5], rF: [-0.17, -0.46], fy: [0.15, -0.75], drag: 0.16,
    keys: [
      { u: 0.6, by: -0.06, bz: -0.08, bx: -0.06, hip: -0.44, sy: -0.52, sx: -0.08 },
      { u: 1.0, h: [-0.04, 0.2, 0.02], a: [-140, 42], by: -0.08, bz: -0.06, bx: -0.05, hip: -0.38, sy: -0.46, sx: -0.04, sz: 0.05, fh: 'aim' },
      { u: 1.28, h: [-0.04, 0.2, 0.02], a: [-140, 42], by: -0.08, bz: -0.06, bx: -0.05, hip: -0.38, sy: -0.46, sx: -0.04, sz: 0.05, fh: 'aim' },
      { u: 1.38, h: [0.08, 0.06, 0.42], a: [-28, 16] },
      { u: 1.47, by: -0.24, bz: 0.12, bx: 0.02, hip: 0.2, sy: 0.06, sx: 0.4, sz: 0.0, l: [0.3, -0.04, 0.02], lp: [0.45, -0.85, -0.3], ld: [80, 15], pn: [-0.3, -1, 0], lk: 0 },
      { u: 1.56, h: [0.2, -0.14, 0.45], a: [24, -10] },
      { u: 1.68, h: [0.31, -0.34, 0.29], a: [96, -36], by: -0.32, bz: 0.15, bx: 0.06, hip: 0.46, sy: 0.52, sx: 0.5, sz: -0.07, fh: 'highWing', l: [0.36, 0.04, -0.26] },
      { u: 2.0, h: [0.32, -0.35, 0.27], a: [100, -36] },
      { u: 2.2, by: -0.34, bz: 0.15, bx: 0.06, hip: 0.5, sy: 0.56, sx: 0.52 },
      { u: 2.6, h: [0.32, -0.35, 0.26], a: [102, -35], by: -0.32, bz: 0.13, bx: 0.05, hip: 0.47, sy: 0.53, sx: 0.48, sz: -0.06, fh: 'highWing', l: [0.36, 0.02, -0.24] },
    ],
  },
  /** hit 2: the backhand, dead level at the chest from his left to his right */
  blinkFlat: {
    line: 'flat', ...HOLD, slash: [1.45, 3.8, -1, 0.1],
    lF: [0.2, 0.4], fy: [0.6, -0.55],
    keys: [
      { u: 0.6, by: -0.2, bz: -0.08, bx: -0.06, hip: 0.48, sy: 0.56, sx: 0.18, fh: 'wrist', l: [0.08, -0.12, 0.3] },
      { u: 1.0, h: [0.35, -0.1, 0.15], a: [148, 6], by: -0.19, bz: -0.07, bx: -0.05, hip: 0.42, sy: 0.5, sx: 0.16, fh: 'wrist', l: [0.08, -0.12, 0.3], lk: 0.85 },
      { u: 1.12, l: [0.2, -0.1, 0.22], lp: [0.3, -0.8, -0.4], ld: [70, 0], pn: [0, -1, 0], lk: 0.2 },
      { u: 1.28, h: [0.35, -0.1, 0.15], a: [148, 6], by: -0.19, bz: -0.07, bx: -0.05, hip: 0.42, sy: 0.5, sx: 0.16, l: [0.36, -0.08, 0.06], lp: [0.15, -0.65, -0.75], ld: [100, 5], pn: [0, -1, 0], lk: 0 },
      { u: 1.38, h: [0.16, -0.08, 0.44], a: [28, 3] },
      { u: 1.47, by: -0.24, bz: 0.11, bx: 0.02, hip: -0.06, sy: 0.02, sx: 0.26, l: [0.42, -0.06, -0.02], lp: [0.15, -0.65, -0.75], ld: [100, 5], pn: [0, -1, 0], lk: 0 },
      { u: 1.56, h: [-0.06, -0.06, 0.46], a: [-24, 4] },
      { u: 1.68, h: [-0.3, -0.02, 0.26], a: [-100, 10], by: -0.26, bz: 0.14, bx: 0.06, hip: -0.46, sy: -0.48, sx: 0.2, fh: 'wing', l: [0.46, -0.14, -0.17] },
      { u: 2.0, h: [-0.31, -0.02, 0.24], a: [-104, 11] },
      { u: 2.2, by: -0.28, bz: 0.14, bx: 0.06, hip: -0.5, sy: -0.52, sx: 0.22 },
      { u: 2.6, h: [-0.31, -0.01, 0.23], a: [-106, 12], by: -0.26, bz: 0.12, bx: 0.05, hip: -0.47, sy: -0.49, sx: 0.18, fh: 'wing' },
    ],
  },
  /** hit 3: from over the left shoulder, one straight diagonal down across his front to low right */
  blinkCross: {
    line: 'left', ...HOLD, slash: [1.45, 3.6, -1, -0.85],
    lF: [0.15, 0.5], rF: [-0.17, -0.46], fy: [0.15, -0.75], drag: 0.16,
    keys: [
      { u: 0.6, by: -0.11, bz: -0.08, bx: -0.06, hip: 0.44, sy: 0.54, sx: -0.06, l: [0.18, -0.3, 0.08] },
      { u: 1.0, h: [0.3, 0.14, 0.1], a: [150, 44], by: -0.1, bz: -0.06, bx: -0.05, hip: 0.36, sy: 0.46, sx: 0.0, sz: -0.05, fh: 'chest', l: [-0.06, -0.2, 0.26], ld: [15, 55] },
      { u: 1.28, h: [0.3, 0.14, 0.1], a: [150, 44], by: -0.1, bz: -0.06, bx: -0.05, hip: 0.36, sy: 0.46, sx: 0.0, sz: -0.05, fh: 'chest', l: [-0.06, -0.2, 0.26], ld: [15, 55] },
      { u: 1.38, h: [0.14, 0.02, 0.44], a: [28, 14] },
      { u: 1.47, by: -0.26, bz: 0.12, bx: 0.02, hip: -0.08, sy: -0.02, sx: 0.36, l: [0.24, -0.08, 0.1], lp: [0.4, -0.85, -0.3], ld: [70, 40], pn: [-0.4, -1, 0], lk: 0 },
      { u: 1.56, h: [-0.06, -0.16, 0.44], a: [-24, -12] },
      { u: 1.68, h: [-0.24, -0.34, 0.26], a: [-90, -36], by: -0.34, bz: 0.15, bx: 0.06, hip: -0.42, sy: -0.46, sx: 0.48, sz: 0.07, fh: 'highWing', l: [0.36, 0.07, -0.24] },
      { u: 2.0, h: [-0.25, -0.35, 0.24], a: [-94, -36] },
      { u: 2.2, by: -0.36, bz: 0.15, bx: 0.06, hip: -0.46, sy: -0.5, sx: 0.5 },
      { u: 2.6, h: [-0.25, -0.35, 0.23], a: [-96, -35], by: -0.34, bz: 0.13, bx: 0.05, hip: -0.43, sy: -0.47, sx: 0.46, sz: 0.06, fh: 'highWing' },
    ],
  },
  /** hit 4: the thrust: drawn back at the ribs, then the point is simply there, and he holds the line */
  blinkThrust: {
    line: 'point', home: 0.5, gather: [0.7, 0.5], slash: [1.4, 2.6, 'point'],
    rF: [-0.17, -0.46], fy: [0.1, -0.8], drag: 0.12,
    lF: [0.14, 0.56],
    keys: [
      { u: 0.6, by: -0.17, bz: -0.12, bx: -0.06, hip: -0.46, sy: -0.6, sx: 0.0 },
      { u: 1.0, h: [-0.03, -0.2, -0.1], a: [3, 22], by: -0.21, bz: -0.1, hip: -0.38, sy: -0.52, sx: 0.08, fh: 'aim', l: [0.02, -0.08, 0.36], ld: [-6, 12], bx: -0.05 },
      { u: 1.22, h: [-0.03, -0.2, -0.1], a: [3, 22], by: -0.21, bz: -0.1, hip: -0.38, sy: -0.52, sx: 0.08, fh: 'aim', l: [0.02, -0.08, 0.36], ld: [-6, 12], bx: -0.05 },
      { u: 1.3, h: [0.08, -0.06, 0.3], a: [1, 30], l: [0.1, -0.22, 0.24], lp: [0.5, -0.8, -0.25], ld: [40, -30], pn: [-0.6, -0.8, 0], lk: 0 },
      { u: 1.4, h: [0.15, 0.1, 0.48], a: [0, 35], by: -0.36, bz: 0.17, hip: 0.26, sy: 0.36, sx: 0.5, bx: 0.05 },
      { u: 1.75, fh: 'tail', l: [0.26, -0.34, -0.3], ld: [170, -58] },
      { u: 2.0, h: [0.15, 0.1, 0.48], a: [0, 35] },
      { u: 2.15, by: -0.38, bz: 0.18, bx: 0.05, hip: 0.3, sy: 0.4, sx: 0.52 },
      { u: 2.6, h: [0.15, 0.09, 0.47], a: [0, 34], by: -0.36, bz: 0.16, hip: 0.27, sy: 0.37, sx: 0.5, fh: 'tail', bx: 0.04 },
    ],
  },
};
