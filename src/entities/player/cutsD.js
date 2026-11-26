// Instant-cut light combo, variant d (`?lights=blink&cuts=d`, combat.js setCuts; ADR-235): a relentless flurry.
// Hits 1-5 only; the heavies and the specials stay the blink set's. Clip format: swings.js. Data only.
//
// THE PENDULUM. The blade swings like one: every cut falls (or sweeps) through his front in two or three
// frames, and its follow-through carries on UP the far side, slowing as a pendulum slows at the top of its
// swing, until it stops cocked over the other shoulder. That stop is the finish, held (`home` 1, `settle`),
// and it IS the next hit's coil: the next press only sinks the body and lets the blade fall back the other
// way. So the chain never gathers: right diagonal (high right to low left, swinging up to the left
// shoulder), left diagonal (the backhand from there to low right, swinging up to the right shoulder), right
// diagonal again (swinging up only to chest height on his left), a level backhand (carried round and down
// to low behind the right hip), and hit 5 out of that low coil.
//   the body   every cut drops the hips onto the front foot and turns the chest 50-60° through it; every
//              coil rises a little out of the last sink and stays wound the way the blade is cocked (the
//              chest turned left after hit 1 IS the wind of the backhand)
//   the feet   a small step forward on every hit (the foot behind steps through: left, right, left ...)
//   free arm   short and close: on the coil the fingers point at the foe before his chest (the point
//              leads); through a forehand they pull in to the chest and the hand comes to the sword wrist as
//              the blade rises on his left (gather); a backhand splits them off it and out to his left at
//              the waist (split), then forward again for the next forehand coil
//   hit 5      breaks the rhythm: the biggest coil of the chain (the weight far back and down, the chest
//              wound 45° and more, the free arm reaching out at the foe), a wide cut and the longest held
//              finish (the free arm flung back). Three strokes on three lines (anim.js _pickVariant: never
//              the same twice running): a rising cut, a great falling diagonal, a low sweep at knee
//              height out of the deepest crouch. Plain (no shards), a strong white line.
// Each cut's keys: COIL (u 0.86-1.1, nearly still) → CUT (two or three frames: the arm opens to nearly
// straight out round the shoulder, never pulled in to the chest; `slash` the frames blinkFx.js draws the
// line through) → FOLLOW (about ten frames, ~40 % by +2 frames, 70 % by +4) → the held finish to u 2.95.

/** hits 1-4: the finish held to the end of the recovery, then a slow way home; a small step each */
const CUT = { home: 1.0, settle: 0.42, step: [0.1, 1.25], gather: [0.7, 0.5], lead: [0.02, 0.01], drag: 0.2 };
/** hit 5: the stronger light (lastHits.js's rules) */
const LAST = { home: 1.0, settle: 0.52, plain: true, slashLook: 'strong', gather: [0.7, 0.5], drag: 0.22 };

// the free hand's short places (offsets from the left shoulder; FH's in swings.js, kept close)
const PT = { l: [-0.04, -0.12, 0.3], lp: [0.4, -0.88, -0.2], ld: [-5, 8], hs: 1, lk: 0 }; // before the chest, pointing at the foe
const TUCK = { l: [0.04, -0.24, 0.18], lp: [0.55, -0.78, -0.25], ld: [20, 40], hs: 1, lk: 0 }; // pulled in to the left chest
const OUT = { l: [0.26, -0.26, 0.06], lp: [0.45, -0.7, -0.55], ld: [100, -22], hs: 1, lk: 0 }; // split off, out to his left at the waist

export const CUTS_D = {
  /** hit 1: from the right shoulder a falling diagonal to low left; the blade swings on up his left side to
   *  stop cocked over the left shoulder, the free hand on its wrist (hit 2's coil) */
  cutD1: {
    line: 'right', ...CUT, slash: [[1.15, 1.42]],
    lF: [0.15, 0.46], rF: [-0.17, -0.42], fy: [0.15, -0.75],
    keys: [
      { u: 0.45, h: [-0.16, 0.02, 0.24], a: [-110, 50], rp: [-0.6, -0.55, 0.5], two: 0, l: [-0.16, -0.24, 0.3], lp: [0.5, -0.85, -0.15], ld: [-20, 0], hs: 1, lk: 0 },
      { u: 0.6, by: -0.04, bz: -0.08, bx: -0.06, hip: -0.44, sy: -0.52, sx: -0.06 },
      { u: 0.86, h: [-0.17, 0.17, 0.07], a: [-151, 46], rp: [-0.5, -0.5, 0.7] },
      { u: 1, h: [-0.17, 0.17, 0.07], a: [-151, 46], rp: [-0.5, -0.5, 0.7], by: -0.08, bz: -0.06, bx: -0.05, hip: -0.38, sy: -0.46, sx: -0.04, sz: 0.05, ...PT },
      { u: 1.1, h: [-0.17, 0.17, 0.08], a: [-150, 46], rp: [-0.5, -0.5, 0.7], by: -0.08, bz: -0.06, bx: -0.05, hip: -0.38, sy: -0.46, sx: -0.04, sz: 0.05 },
      { u: 1.22, h: [-0.11, 0.2, 0.42], a: [-62, 40], rp: [-0.75, -0.55, 0.35] },
      { u: 1.32, h: [0.03, 0.03, 0.56], a: [-20, 12], rp: [-0.8, -0.6, 0], by: -0.2, bz: 0.1, bx: 0.02, hip: 0.12, sy: 0.02, sx: 0.34 },
      { u: 1.42, h: [0.3, -0.27, 0.43], a: [36, -24], rp: [-0.45, -0.88, -0.1], ...TUCK },
      { u: 1.52, h: [0.37, -0.24, 0.36], a: [52, -20], rp: [-0.3, -0.92, 0.1], by: -0.3, bz: 0.14, bx: 0.05, hip: 0.32, sy: 0.26, sx: 0.42, sz: -0.05 },
      { u: 1.66, h: [0.41, -0.15, 0.3], a: [76, -6] },
      { u: 1.8, h: [0.41, -0.04, 0.26], a: [96, 10], by: -0.32, bz: 0.14, bx: 0.05, hip: 0.4, sy: 0.38, sx: 0.4, sz: -0.06, l: [0.0, -0.12, 0.26], lp: [0.5, -0.8, -0.3], ld: [-30, 10], lk: 0.3 },
      { u: 2.02, h: [0.38, 0.06, 0.22], a: [116, 28], rp: [-0.25, -0.75, 0.6], by: -0.3, bz: 0.13, bx: 0.05, hip: 0.45, sy: 0.46, sx: 0.36, sz: -0.06 },
      { u: 2.2, h: [0.36, 0.1, 0.21], a: [126, 36] },
      { u: 2.45, h: [0.35, 0.12, 0.2], a: [131, 40], rp: [-0.25, -0.72, 0.64], by: -0.28, bz: 0.12, bx: 0.05, hip: 0.47, sy: 0.5, sx: 0.32, sz: -0.06, l: [-0.04, 0.06, 0.24], lp: [0.55, -0.8, -0.2], ld: [-60, -20], lk: 1 },
      { u: 2.95, h: [0.35, 0.13, 0.2], a: [133, 41], rp: [-0.25, -0.72, 0.64], two: 0, by: -0.27, bz: 0.12, bx: 0.05, hip: 0.46, sy: 0.49, sx: 0.3, sz: -0.06, l: [-0.04, 0.07, 0.24], lk: 1 },
    ],
  },
  /** hit 2: the backhand from over the left shoulder falling to low right; the blade swings on up his right
   *  side to stop cocked over the right shoulder (hit 3's coil); the free hand splits off the wrist, out
   *  to his left, then forward */
  cutD2: {
    line: 'left', ...CUT, slash: [[1.15, 1.42]],
    lF: [0.15, 0.46], rF: [-0.17, -0.42], fy: [0.3, -0.7],
    keys: [
      { u: 0.5, two: 0 },
      { u: 0.6, by: -0.16, bz: -0.06, bx: -0.06, hip: 0.52, sy: 0.58, sx: 0.04 },
      { u: 0.86, h: [0.35, 0.13, 0.2], a: [133, 42], rp: [-0.25, -0.72, 0.64] },
      { u: 1, h: [0.35, 0.13, 0.2], a: [133, 42], rp: [-0.25, -0.72, 0.64], by: -0.15, bz: -0.06, bx: -0.05, hip: 0.45, sy: 0.52, sx: 0.04, sz: -0.04, l: [-0.04, 0.07, 0.24], lp: [0.55, -0.8, -0.2], ld: [-60, -20], hs: 1, lk: 1 },
      { u: 1.1, h: [0.35, 0.13, 0.21], a: [132, 42], rp: [-0.25, -0.72, 0.64], by: -0.15, bz: -0.06, bx: -0.05, hip: 0.45, sy: 0.52, sx: 0.04, sz: -0.04, l: [-0.04, 0.07, 0.25], lk: 1 },
      { u: 1.22, h: [0.22, 0.14, 0.45], a: [64, 32], rp: [-0.3, -0.75, 0.55], lk: 0 },
      { u: 1.32, h: [-0.04, -0.02, 0.56], a: [6, 8], rp: [-0.45, -0.85, 0.1], by: -0.22, bz: 0.11, bx: 0.02, hip: -0.08, sy: -0.04, sx: 0.3, l: [0.16, -0.2, 0.12], lp: [0.5, -0.75, -0.4], ld: [70, -10] },
      { u: 1.42, h: [-0.31, -0.27, 0.43], a: [-40, -24], rp: [-0.6, -0.75, -0.1], ...OUT },
      { u: 1.52, h: [-0.36, -0.245, 0.37], a: [-52, -19], rp: [-0.7, -0.6, 0.2], by: -0.3, bz: 0.13, bx: 0.05, hip: -0.32, sy: -0.28, sx: 0.4, sz: 0.05 },
      { u: 1.66, h: [-0.39, -0.16, 0.29], a: [-74, -6] },
      { u: 1.8, h: [-0.37, -0.02, 0.2], a: [-104, 14], by: -0.32, bz: 0.14, bx: 0.05, hip: -0.4, sy: -0.4, sx: 0.36, sz: 0.06, l: [0.18, -0.2, 0.18], lp: [0.45, -0.8, -0.35], ld: [40, 0] },
      { u: 2.02, h: [-0.28, 0.1, 0.13], a: [-128, 32], rp: [-0.55, -0.5, 0.65], by: -0.29, bz: 0.13, bx: 0.05, hip: -0.42, sy: -0.46, sx: 0.3, sz: 0.06 },
      { u: 2.2, h: [-0.22, 0.14, 0.09], a: [-140, 40] },
      { u: 2.45, h: [-0.19, 0.16, 0.07], a: [-148, 44], rp: [-0.5, -0.5, 0.7], by: -0.26, bz: 0.12, bx: 0.05, hip: -0.42, sy: -0.48, sx: 0.24, sz: 0.06, ...PT },
      { u: 2.95, h: [-0.18, 0.17, 0.07], a: [-150, 45], rp: [-0.5, -0.5, 0.7], two: 0, by: -0.25, bz: 0.12, bx: 0.05, hip: -0.4, sy: -0.46, sx: 0.22, sz: 0.06, l: [-0.04, -0.11, 0.3] },
    ],
  },
  /** hit 3: the falling diagonal again from the right shoulder, flatter; the blade swings on only to chest
   *  height on his left, pointing back level (hit 4's coil), the free hand on its wrist */
  cutD3: {
    line: 'right', ...CUT, slash: [[1.12, 1.38]],
    lF: [0.15, 0.48], rF: [-0.17, -0.44], fy: [0.15, -0.75],
    keys: [
      { u: 0.5, two: 0 },
      { u: 0.6, by: -0.16, bz: -0.06, bx: -0.06, hip: -0.46, sy: -0.54, sx: -0.02 },
      { u: 0.86, h: [-0.18, 0.17, 0.07], a: [-150, 45], rp: [-0.5, -0.5, 0.7] },
      { u: 1, h: [-0.18, 0.17, 0.07], a: [-150, 45], rp: [-0.5, -0.5, 0.7], by: -0.15, bz: -0.06, bx: -0.05, hip: -0.38, sy: -0.46, sx: 0.0, sz: 0.05, ...PT },
      { u: 1.1, h: [-0.18, 0.17, 0.08], a: [-149, 45], rp: [-0.5, -0.5, 0.7], by: -0.15, bz: -0.06, bx: -0.05, hip: -0.38, sy: -0.46, sx: 0.0, sz: 0.05 },
      { u: 1.2, h: [-0.12, 0.16, 0.43], a: [-62, 32], rp: [-0.75, -0.55, 0.35] },
      { u: 1.29, h: [0.04, -0.02, 0.56], a: [-18, 6], rp: [-0.75, -0.65, 0.05], by: -0.24, bz: 0.11, bx: 0.02, hip: 0.12, sy: 0.04, sx: 0.36 },
      { u: 1.38, h: [0.31, -0.2, 0.44], a: [38, -14], rp: [-0.45, -0.88, 0.0], ...TUCK },
      { u: 1.48, h: [0.37, -0.18, 0.37], a: [56, -11], rp: [-0.3, -0.85, 0.3], by: -0.31, bz: 0.14, bx: 0.05, hip: 0.32, sy: 0.28, sx: 0.4, sz: -0.05 },
      { u: 1.62, h: [0.4, -0.15, 0.3], a: [80, -6] },
      { u: 1.76, h: [0.39, -0.13, 0.25], a: [100, -2], by: -0.32, bz: 0.14, bx: 0.05, hip: 0.4, sy: 0.42, sx: 0.36, sz: -0.06, l: [0.0, -0.2, 0.24], lp: [0.5, -0.82, -0.25], ld: [-40, -10], lk: 0.3 },
      { u: 2.0, h: [0.36, -0.12, 0.2], a: [122, 2], rp: [-0.15, -0.55, 0.82], by: -0.29, bz: 0.13, bx: 0.05, hip: 0.44, sy: 0.5, sx: 0.28, sz: -0.05 },
      { u: 2.2, h: [0.35, -0.12, 0.19], a: [132, 4] },
      { u: 2.45, h: [0.34, -0.12, 0.18], a: [138, 5], rp: [-0.1, -0.5, 0.86], by: -0.25, bz: 0.12, bx: 0.05, hip: 0.45, sy: 0.52, sx: 0.22, sz: -0.04, l: [-0.06, -0.19, 0.24], lp: [0.55, -0.8, -0.2], ld: [-60, -20], lk: 1 },
      { u: 2.95, h: [0.34, -0.12, 0.18], a: [139, 5], rp: [-0.1, -0.5, 0.86], two: 0, by: -0.24, bz: 0.12, bx: 0.05, hip: 0.44, sy: 0.51, sx: 0.2, sz: -0.04, l: [-0.06, -0.19, 0.24], lk: 1 },
    ],
  },
  /** hit 4: the level backhand at the chest from his left to his right; the blade carries on round and
   *  down to low behind the right hip (hit 5's coil begins there); the free hand splits off the wrist, out
   *  to his left, then up before him */
  cutD4: {
    line: 'flat', ...CUT, slash: [[1.15, 1.42]],
    lF: [0.18, 0.44], rF: [-0.18, -0.42], fy: [0.55, -0.55],
    keys: [
      { u: 0.5, two: 0 },
      { u: 0.6, by: -0.22, bz: -0.08, bx: -0.06, hip: 0.5, sy: 0.58, sx: 0.18 },
      { u: 0.86, h: [0.34, -0.12, 0.18], a: [139, 5], rp: [-0.1, -0.5, 0.86] },
      { u: 1, h: [0.34, -0.12, 0.18], a: [139, 5], rp: [-0.1, -0.5, 0.86], by: -0.19, bz: -0.07, bx: -0.05, hip: 0.43, sy: 0.51, sx: 0.16, l: [-0.06, -0.19, 0.24], lp: [0.55, -0.8, -0.2], ld: [-60, -20], hs: 1, lk: 1 },
      { u: 1.1, h: [0.34, -0.12, 0.19], a: [138, 5], rp: [-0.1, -0.5, 0.86], by: -0.19, bz: -0.07, bx: -0.05, hip: 0.43, sy: 0.51, sx: 0.16, l: [-0.06, -0.19, 0.25], lk: 1 },
      { u: 1.22, h: [0.27, -0.07, 0.44], a: [72, 4], rp: [-0.3, -0.85, 0.4], lk: 0 },
      { u: 1.32, h: [0.02, -0.05, 0.56], a: [22, 3], rp: [-0.45, -0.85, 0.1], by: -0.24, bz: 0.11, bx: 0.02, hip: -0.06, sy: 0.02, sx: 0.26, l: [0.16, -0.22, 0.12], lp: [0.5, -0.75, -0.4], ld: [70, -10] },
      { u: 1.42, h: [-0.3, -0.06, 0.47], a: [-38, 2], rp: [-0.6, -0.75, -0.15], ...OUT },
      { u: 1.52, h: [-0.36, -0.1, 0.41], a: [-52, -4], rp: [-0.6, -0.5, 0.6], by: -0.28, bz: 0.13, bx: 0.05, hip: -0.3, sy: -0.27, sx: 0.24 },
      { u: 1.66, h: [-0.4, -0.17, 0.32], a: [-74, -12] },
      { u: 1.8, h: [-0.41, -0.23, 0.23], a: [-92, -19], by: -0.3, bz: 0.13, bx: 0.05, hip: -0.4, sy: -0.4, sx: 0.26, l: [0.14, -0.18, 0.2], lp: [0.45, -0.82, -0.3], ld: [30, 0] },
      { u: 2.02, h: [-0.4, -0.28, 0.14], a: [-112, -26], rp: [-0.55, -0.45, 0.7], by: -0.31, bz: 0.12, bx: 0.05, hip: -0.46, sy: -0.5, sx: 0.26 },
      { u: 2.2, h: [-0.38, -0.3, 0.09], a: [-122, -29] },
      { u: 2.45, h: [-0.37, -0.31, 0.06], a: [-127, -30], rp: [-0.5, -0.45, 0.74], by: -0.3, bz: 0.12, bx: 0.05, hip: -0.48, sy: -0.52, sx: 0.24, l: [0.0, -0.08, 0.32], lp: [0.4, -0.88, -0.2], ld: [-5, 10] },
      { u: 2.95, h: [-0.36, -0.31, 0.06], a: [-128, -30], rp: [-0.5, -0.45, 0.74], two: 0, by: -0.29, bz: 0.12, bx: 0.05, hip: -0.47, sy: -0.51, sx: 0.23, l: [0.0, -0.08, 0.32] },
    ],
  },

  // ---- hit 5: out of hit 4's low coil on his right, the chain's biggest coil and longest held finish
  /** a rising cut from deep behind the right hip to high left, riding on over the left shoulder; the free
   *  arm reaches at the foe in the coil and is flung back behind the hip */
  cutD5Rise: {
    line: 'left', ...LAST, slash: [[1.22, 1.56]], step: [0.08, 1.3],
    lF: [0.16, 0.62], rF: [-0.18, -0.5], fy: [0.2, -0.75],
    keys: [
      { u: 0.4, h: [-0.3, -0.3, 0.0], a: [-140, -32], two: 0 },
      { u: 0.55, by: -0.28, bz: -0.11, bx: -0.07, hip: -0.8, sy: -0.86, sx: 0.22 },
      { u: 1, h: [-0.16, -0.32, -0.2], a: [-152, -36], rp: [-0.55, -0.6, -0.6], two: 0, by: -0.34, bz: -0.1, bx: -0.06, hip: -0.72, sy: -0.8, sx: 0.22, sz: 0.04, l: [-0.02, -0.02, 0.4], lp: [0.35, -0.9, -0.1], ld: [-6, 10], hs: 1, lk: 0 },
      { u: 1.16, h: [-0.16, -0.33, -0.19], a: [-152, -36], rp: [-0.55, -0.6, -0.6], by: -0.34, bz: -0.1, bx: -0.06, hip: -0.72, sy: -0.8, sx: 0.22, sz: 0.04, l: [-0.02, -0.02, 0.41] },
      { u: 1.26, h: [-0.18, -0.36, 0.34], a: [-52, -36], rp: [-0.7, -0.6, 0.1] },
      { u: 1.34, h: [-0.1, -0.24, 0.46], a: [-30, -20] },
      { u: 1.42, h: [0.04, -0.1, 0.54], a: [-8, -3], rp: [-0.6, -0.8, 0.0], by: -0.38, bz: 0.15, bx: 0.03, hip: 0.14, sy: 0.1, sx: 0.36, sz: 0, l: [0.12, -0.2, 0.1], lp: [0.55, -0.7, -0.4], ld: [80, -20] },
      { u: 1.5, h: [0.16, 0.08, 0.5], a: [22, 22] },
      { u: 1.58, h: [0.28, 0.18, 0.44], a: [44, 42], rp: [-0.3, -0.9, 0.1] },
      { u: 1.72, h: [0.3, 0.18, 0.41], a: [59, 41], by: -0.34, bz: 0.18, bx: 0.05, hip: 0.42, sy: 0.4, sx: 0.38, l: [0.24, -0.34, -0.18], lp: [0.7, -0.35, -0.6], ld: [160, -50] },
      { u: 1.85, h: [0.313, 0.18, 0.374], a: [73, 41] },
      { u: 1.96, h: [0.327, 0.18, 0.346], a: [85, 40] },
      { u: 2.08, h: [0.349, 0.18, 0.302], a: [105, 39], by: -0.37, bz: 0.2, bx: 0.06, hip: 0.62, sy: 0.58, sx: 0.4 },
      { u: 2.24, h: [0.373, 0.18, 0.254], a: [126, 38] },
      { u: 2.37, h: [0.38, 0.18, 0.24], a: [132, 38], rp: [-0.3, -0.85, 0.4], by: -0.38, bz: 0.21, bx: 0.06, hip: 0.7, sy: 0.64, sx: 0.4, l: [0.26, -0.38, -0.24], lp: [0.75, -0.3, -0.6], ld: [170, -58] },
      { u: 2.95, h: [0.38, 0.19, 0.24], a: [134, 39], rp: [-0.3, -0.85, 0.4], two: 0, by: -0.36, bz: 0.2, bx: 0.05, hip: 0.67, sy: 0.61, sx: 0.38, l: [0.26, -0.38, -0.24] },
    ],
  },
  /** the great falling diagonal: the hand up the right side over the shoulder, the blade cocked behind his
   *  head, the chest wound far round, then down across his front to low past the left knee in the deepest
   *  sink of the chain; the free arm reaches at the foe, then is flung straight back at shoulder height */
  cutD5Fall: {
    line: 'right', ...LAST, slash: [[1.3, 1.64]], step: [0.12, 1.36], drag: 0.3,
    lF: [0.16, 0.62], rF: [-0.18, -0.5], fy: [0.15, -0.8],
    keys: [
      { u: 0.4, h: [-0.3, -0.02, 0.12], a: [-120, 20], rp: [-0.8, -0.55, 0.2], two: 0 },
      { u: 0.55, by: -0.18, bz: -0.08, bx: -0.07, hip: -0.62, sy: -0.76, sx: -0.06 },
      { u: 1, h: [-0.13, 0.26, -0.04], a: [-166, 42], rp: [-0.75, -0.3, 0.6], two: 0, by: -0.22, bz: -0.06, bx: -0.06, hip: -0.56, sy: -0.68, sx: -0.04, sz: 0.06, l: [-0.04, -0.04, 0.4], lp: [0.35, -0.9, -0.1], ld: [-6, 6], hs: 1, lk: 0 },
      { u: 1.24, h: [-0.13, 0.26, -0.03], a: [-166, 42], rp: [-0.75, -0.3, 0.6], by: -0.22, bz: -0.06, bx: -0.06, hip: -0.56, sy: -0.68, sx: -0.04, sz: 0.06, l: [-0.04, -0.04, 0.41] },
      { u: 1.34, h: [-0.1, 0.24, 0.38], a: [-66, 44], rp: [-0.8, -0.5, 0.3] },
      { u: 1.42, h: [-0.02, 0.1, 0.52], a: [-30, 20] },
      { u: 1.5, h: [0.08, -0.06, 0.55], a: [-2, 0], rp: [-0.7, -0.7, 0.0], by: -0.34, bz: 0.15, bx: 0.03, hip: 0.18, sy: 0.12, sx: 0.44, sz: 0, l: [0.14, -0.14, 0.06], lp: [0.55, -0.7, -0.45], ld: [90, -10] },
      { u: 1.58, h: [0.2, -0.2, 0.5], a: [24, -18] },
      { u: 1.66, h: [0.3, -0.3, 0.43], a: [42, -26], rp: [-0.45, -0.88, -0.1] },
      { u: 1.78, h: [0.34, -0.33, 0.38], a: [55, -28], by: -0.38, bz: 0.17, bx: 0.05, hip: 0.44, sy: 0.42, sx: 0.48, l: [0.28, -0.06, -0.3], lp: [0.4, -0.6, -0.7], ld: [160, 2] },
      { u: 1.9, h: [0.36, -0.34, 0.34], a: [66, -29] },
      { u: 2.0, h: [0.37, -0.35, 0.31], a: [74, -30] },
      { u: 2.12, h: [0.38, -0.35, 0.28], a: [83, -30], by: -0.41, bz: 0.18, bx: 0.06, hip: 0.6, sy: 0.56, sx: 0.5 },
      { u: 2.26, h: [0.39, -0.35, 0.25], a: [91, -30] },
      { u: 2.4, h: [0.39, -0.35, 0.24], a: [94, -30], rp: [-0.3, -0.92, 0.1], by: -0.42, bz: 0.19, bx: 0.06, hip: 0.66, sy: 0.6, sx: 0.5, l: [0.3, -0.04, -0.34], lp: [0.4, -0.6, -0.7], ld: [165, 5] },
      { u: 2.95, h: [0.39, -0.35, 0.24], a: [95, -30], rp: [-0.3, -0.92, 0.1], two: 0, by: -0.4, bz: 0.18, bx: 0.05, hip: 0.63, sy: 0.58, sx: 0.48, l: [0.3, -0.05, -0.33] },
    ],
  },
  /** a low sweep: he drops into the deepest crouch of the chain, the blade far back behind his right hip,
   *  and it runs level at knee height round to his left and on round his left side; the free arm reaches
   *  at the foe low, then opens out back to his left. (Line 'low', not 'flat': hit 4 is the level cut, and
   *  the animator never follows a line with the same one) */
  cutD5Low: {
    line: 'low', ...LAST, slash: [[1.22, 1.56]], step: [0.06, 1.28], drag: 0.26,
    lF: [0.17, 0.66], rF: [-0.18, -0.52], fy: [0.25, -0.8],
    keys: [
      { u: 0.4, h: [-0.4, -0.26, 0.04], a: [-126, -16], rp: [-0.6, -0.75, 0.2], two: 0 },
      { u: 0.55, by: -0.36, bz: -0.1, bx: -0.07, hip: -0.78, sy: -0.84, sx: 0.22 },
      { u: 1, h: [-0.4, -0.24, -0.1], a: [-140, -12], rp: [-0.55, -0.8, 0.1], two: 0, by: -0.42, bz: -0.09, bx: -0.06, hip: -0.7, sy: -0.78, sx: 0.22, l: [-0.02, -0.14, 0.4], lp: [0.35, -0.9, -0.1], ld: [-6, -6], hs: 1, lk: 0 },
      { u: 1.16, h: [-0.4, -0.24, -0.09], a: [-140, -12], rp: [-0.55, -0.8, 0.1], by: -0.42, bz: -0.09, bx: -0.06, hip: -0.7, sy: -0.78, sx: 0.22, l: [-0.02, -0.14, 0.41] },
      { u: 1.26, h: [-0.34, -0.24, 0.28], a: [-64, -12], rp: [-0.6, -0.75, 0.2] },
      { u: 1.34, h: [-0.18, -0.25, 0.45], a: [-32, -12] },
      { u: 1.42, h: [0.02, -0.26, 0.49], a: [-6, -12], rp: [-0.5, -0.85, 0.1], by: -0.48, bz: 0.16, bx: 0.03, hip: 0.1, sy: 0.06, sx: 0.42, l: [0.16, -0.18, 0.1], lp: [0.5, -0.75, -0.4], ld: [80, -6] },
      { u: 1.5, h: [0.2, -0.26, 0.46], a: [22, -12] },
      { u: 1.58, h: [0.32, -0.26, 0.37], a: [48, -12], rp: [-0.3, -0.9, 0.2] },
      { u: 1.72, h: [0.35, -0.25, 0.34], a: [60, -11], by: -0.5, bz: 0.18, bx: 0.05, hip: 0.4, sy: 0.38, sx: 0.44, l: [0.4, -0.08, -0.16], lp: [0.2, -0.75, -0.65], ld: [110, 0] },
      { u: 1.85, h: [0.366, -0.245, 0.31], a: [71, -10] },
      { u: 1.96, h: [0.378, -0.24, 0.28], a: [81, -10] },
      { u: 2.08, h: [0.395, -0.235, 0.24], a: [96, -9], by: -0.52, bz: 0.19, bx: 0.06, hip: 0.6, sy: 0.56, sx: 0.46 },
      { u: 2.24, h: [0.41, -0.23, 0.2], a: [112, -8] },
      { u: 2.37, h: [0.42, -0.23, 0.19], a: [117, -8], rp: [-0.2, -0.8, 0.55], by: -0.52, bz: 0.2, bx: 0.06, hip: 0.68, sy: 0.62, sx: 0.46, l: [0.42, -0.08, -0.18], lp: [0.2, -0.75, -0.65], ld: [112, 2] },
      { u: 2.95, h: [0.42, -0.23, 0.19], a: [118, -8], rp: [-0.2, -0.8, 0.55], two: 0, by: -0.5, bz: 0.19, bx: 0.05, hip: 0.65, sy: 0.6, sx: 0.44, l: [0.42, -0.09, -0.17] },
    ],
  },
};

const clip = (c) => Object.freeze({ kind: 'clip', clip: c });

/** The looks of hits 1-5 (combat.js setLights `wear`): one look each for hits 1-4 (hit 4 a slash, not
 *  the thrust's point and ridge glint); hit 5 one of three strokes, never the same twice running. */
export const LIGHT_CUTS_D = [
  Object.freeze({ anim: clip('cutD1'), variants: Object.freeze([]), contact: 'light' }),
  Object.freeze({ anim: clip('cutD2'), variants: Object.freeze([]), contact: 'light' }),
  Object.freeze({ anim: clip('cutD3'), variants: Object.freeze([]), contact: 'light' }),
  Object.freeze({ anim: clip('cutD4'), variants: Object.freeze([]), contact: 'light', glint: null }),
  Object.freeze({ anim: clip('cutD5Rise'), variants: Object.freeze([clip('cutD5Fall'), clip('cutD5Low')]), contact: 'sweep' }),
];
