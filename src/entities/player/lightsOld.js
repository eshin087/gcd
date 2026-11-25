// The light chain as it was before the weight pass (ADR-188), kept for `?lights=old` (combat.js
// setLights; the Lab's PLAYER → `lights` row). Data only, exactly the clips main had under the names
// without `Old` (swings.js has the reworked ones under those names now; its header documents the
// fields). The two the chain shared with other moves were never changed and are not copied here:
// `drawCut` (the flurry, One Breath) and `slam` (Earthbreaker); `?lights=old` points at them again.
// swings.js spreads this table into SWINGS, so a clip name resolves the same way in either mode.

export const LIGHTS_OLD = {
  /** The falling cut: cocked beside the head, a diagonal from high right across his chest down
   *  past the left hip. */
  fallingCutOld: {
    line: 'right',
    lF: [0.15, 0.48], rF: [-0.17, -0.46], fy: [0.15, -0.75], drag: 0.14,
    keys: [
      { u: 0.6, by: -0.04, bz: -0.09, bx: -0.06, hip: -0.44, sy: -0.5, sx: -0.1 },
      { u: 1.0, h: [-0.06, 0.2, 0.0], a: [-152, 40], by: -0.08, bz: -0.07, bx: -0.05, hip: -0.36, sy: -0.44, sx: -0.04, sz: 0.05, fh: 'aim' },
      { u: 1.25, h: [0.02, 0.14, 0.24], a: [-102, 32] },
      { u: 1.5, h: [0.14, -0.05, 0.46], a: [-30, 12], by: -0.21, bz: 0.09, bx: 0.01, hip: 0.18, sy: 0.0, sx: 0.3, sz: 0.0, l: [0.26, -0.06, 0.06], lp: [0.45, -0.85, -0.3], ld: [70, 15], pn: [-0.3, -1, 0], lk: 0 },
      { u: 1.75, h: [0.25, -0.22, 0.41], a: [30, -16] },
      { u: 2.0, h: [0.31, -0.33, 0.3], a: [72, -34], by: -0.28, bz: 0.13, bx: 0.05, hip: 0.38, sy: 0.4, sx: 0.42, sz: -0.07, fh: 'highWing', l: [0.32, 0.01, -0.22] },
      { u: 2.15, by: -0.3, bz: 0.15, bx: 0.06, hip: 0.48, sy: 0.54, sx: 0.47 },
      { u: 2.4, h: [0.34, -0.36, 0.16], a: [126, -24], by: -0.25, bz: 0.1, bx: 0.04, hip: 0.43, sy: 0.47, sx: 0.38, sz: -0.06, fh: 'highWing' },
    ],
  },
  /** The rising slash: a skip in (combat.js `hop`), from behind the right knee up across his front
   *  to high left: the falling cut's other diagonal. */
  risingSlashOld: {
    line: 'left',
    fy: [0.3, -0.6],
    keys: [
      { u: 0.6, by: -0.31, bz: -0.08, bx: -0.06, hip: -0.44, sy: -0.5, sx: 0.42 },
      { u: 1.0, h: [-0.16, -0.36, -0.14], a: [-154, -34], by: -0.27, bz: -0.06, bx: -0.05, hip: -0.36, sy: -0.44, sx: 0.36, fh: 'chest' },
      { u: 1.25, h: [-0.01, -0.3, 0.26], a: [-102, -28] },
      { u: 1.5, h: [0.14, -0.12, 0.46], a: [-30, -6], by: -0.15, bz: 0.08, bx: 0.01, hip: 0.14, sy: 0.02, sx: 0.24, l: [0.16, -0.34, 0.06], lp: [0.6, -0.6, -0.4], ld: [100, -50], pn: [-1, 0, 0], lk: 0 },
      { u: 1.75, h: [0.3, 0.08, 0.38], a: [32, 22] },
      // (the hips end at −0.08-0.1, not −0.02-0.04: higher, the rear toe skated 10 cm a frame)
      { u: 2.0, h: [0.38, 0.2, 0.22], a: [72, 44], by: -0.1, bz: 0.11, bx: 0.05, hip: 0.34, sy: 0.38, sx: 0.02, sz: -0.05, fh: 'tail', l: [0.24, -0.42, -0.3] },
      { u: 2.15, by: -0.08, bz: 0.12, bx: 0.06, hip: 0.44, sy: 0.5, sx: -0.05 },
      { u: 2.4, h: [0.4, 0.26, 0.08], a: [124, 54], by: -0.08, bz: 0.08, bx: 0.04, hip: 0.41, sy: 0.45, sx: -0.03, fh: 'tail' },
    ],
  },
  /** The rising backhand: from the left hip up across his front to high on the right. */
  risingBackhandOld: {
    line: 'right',
    fy: [0.45, -0.6],
    keys: [
      { u: 0.6, by: -0.28, bz: -0.07, bx: -0.06, hip: 0.46, sy: 0.53, sx: 0.36, fh: 'wrist', l: [0.1, -0.33, 0.28] },
      { u: 1.0, h: [0.36, -0.37, 0.06], a: [148, -30], by: -0.25, bz: -0.06, bx: -0.05, hip: 0.38, sy: 0.47, sx: 0.32, fh: 'wrist', l: [0.1, -0.33, 0.28], lk: 0.85 },
      { u: 1.1, l: [0.2, -0.3, 0.22], lp: [0.5, -0.8, -0.2], ld: [60, -30], pn: [0, -1, 0], lk: 0.25 },
      { u: 1.25, h: [0.28, -0.3, 0.32], a: [98, -26] },
      { u: 1.5, h: [0.13, -0.14, 0.46], a: [30, -8], by: -0.15, bz: 0.08, bx: 0.01, hip: -0.06, sy: 0.08, sx: 0.22, l: [0.34, -0.3, 0], lp: [0.4, -0.6, -0.6], ld: [95, -30], pn: [0, -1, 0], lk: 0 },
      { u: 1.75, h: [-0.08, 0.06, 0.42], a: [-30, 18] },
      { u: 2.0, h: [-0.2, 0.18, 0.3], a: [-70, 40], by: -0.05, bz: 0.11, bx: 0.05, hip: -0.34, sy: -0.34, sx: 0.04, sz: 0.06, fh: 'wingLo', l: [0.42, -0.32, -0.16] },
      { u: 2.15, by: -0.03, bz: 0.12, bx: 0.06, hip: -0.45, sy: -0.47, sx: -0.02 },
      { u: 2.4, h: [-0.24, 0.24, 0.12], a: [-118, 52], by: -0.04, bz: 0.08, bx: 0.04, hip: -0.41, sy: -0.43, sx: -0.03, sz: 0.05, fh: 'wingLo' },
    ],
  },
  /** The flat backhand: at chest height, rising a little, the whole body pivoting round with it. */
  flatBackhandOld: {
    line: 'flat',
    lF: [0.2, 0.36], fy: [0.7, -0.55],
    keys: [
      { u: 0.6, by: -0.19, bz: -0.07, bx: -0.06, hip: 0.48, sy: 0.56, sx: 0.18, fh: 'wrist', l: [0.08, -0.12, 0.3] },
      { u: 1.0, h: [0.36, -0.1, 0.16], a: [148, 6], by: -0.17, bz: -0.06, bx: -0.05, hip: 0.4, sy: 0.5, sx: 0.16, fh: 'wrist', l: [0.08, -0.12, 0.3], lk: 0.85 },
      { u: 1.1, l: [0.22, -0.1, 0.22], lp: [0.3, -0.8, -0.4], ld: [70, 0], pn: [0, -1, 0], lk: 0.25 },
      { u: 1.25, h: [0.28, -0.1, 0.34], a: [100, 2] },
      { u: 1.5, h: [0.1, -0.08, 0.46], a: [32, 2], by: -0.21, bz: 0.08, bx: 0.01, hip: -0.06, sy: 0.04, sx: 0.22, l: [0.4, -0.08, 0.02], lp: [0.15, -0.65, -0.75], ld: [95, 5], pn: [0, -1, 0], lk: 0 },
      { u: 1.75, h: [-0.16, -0.05, 0.42], a: [-34, 6] },
      { u: 2.0, h: [-0.3, -0.02, 0.26], a: [-94, 12], by: -0.19, bz: 0.11, bx: 0.05, hip: -0.38, sy: -0.38, sx: 0.12, fh: 'wing', l: [0.45, -0.16, -0.13] },
      { u: 2.15, by: -0.2, bz: 0.12, bx: 0.06, hip: -0.49, sy: -0.5, sx: 0.14 },
      { u: 2.4, h: [-0.32, 0.0, 0.1], a: [-138, 16], by: -0.16, bz: 0.08, bx: 0.04, hip: -0.45, sy: -0.47, sx: 0.09, fh: 'wing' },
    ],
  },
  /** The falling backhand: lifted over the left shoulder, a diagonal across his chest down to the
   *  right hip. */
  fallingBackhandOld: {
    line: 'left',
    lF: [0.15, 0.48], rF: [-0.17, -0.46], fy: [0.15, -0.75], drag: 0.14,
    keys: [
      // (no rise before it, `by` at the coil's height: out of a long stance the rise and the weight
      // drawn back took the front foot out of reach, and it skated 15 cm back through the windup)
      { u: 0.6, by: -0.1, bz: -0.08, bx: -0.06, hip: 0.42, sy: 0.51, sx: -0.06, l: [0.18, -0.3, 0.08] },
      { u: 1.0, h: [0.32, 0.14, 0.1], a: [156, 44], by: -0.09, bz: -0.06, bx: -0.05, hip: 0.34, sy: 0.45, sx: 0.0, sz: -0.05, fh: 'chest', l: [-0.06, -0.2, 0.26], ld: [15, 55] },
      { u: 1.25, h: [0.24, 0.1, 0.32], a: [104, 34] },
      { u: 1.5, h: [0.1, -0.06, 0.46], a: [30, 12], by: -0.21, bz: 0.09, bx: 0.01, hip: -0.06, sy: 0.0, sx: 0.3, l: [0.22, -0.1, 0.12], lp: [0.4, -0.85, -0.3], ld: [60, 40], pn: [-0.4, -1, 0], lk: 0 },
      { u: 1.75, h: [-0.12, -0.24, 0.4], a: [-30, -16] },
      { u: 2.0, h: [-0.24, -0.34, 0.26], a: [-70, -34], by: -0.28, bz: 0.13, bx: 0.05, hip: -0.34, sy: -0.38, sx: 0.4, sz: 0.07, fh: 'highWing', l: [0.32, 0.04, -0.2] },
      { u: 2.15, by: -0.3, bz: 0.15, bx: 0.06, hip: -0.45, sy: -0.5, sx: 0.45 },
      { u: 2.4, h: [-0.26, -0.38, 0.08], a: [-124, -26], by: -0.25, bz: 0.1, bx: 0.04, hip: -0.41, sy: -0.45, sx: 0.36, sz: 0.06, fh: 'highWing' },
    ],
  },
  /** The whirl: he follows the backhand round to his right, a full turn (combat.js `spin`) with the
   *  sword arm thrown out and the free arm carried out by the turn; the blade dips through the turn,
   *  crosses his front late in it and carries on round to his right. */
  whirlOld: {
    line: 'flat',
    keys: [
      { u: 0.5, by: -0.2, sx: 0.2 },
      { u: 1.0, h: [-0.34, -0.05, 0.0], a: [-128, 12], by: -0.16, hip: -0.16, sy: -0.24, sx: 0.14, fh: 'chest', bx: -0.04 },
      { u: 1.5, h: [-0.4, -0.06, 0.14], a: [-100, 4], by: -0.2, hip: -0.1, sy: -0.12, sx: 0.22, fh: 'chest', l: [-0.06, -0.24, 0.24] },
      { u: 2.0, h: [-0.36, -0.1, 0.26], a: [-62, -6], by: -0.24, bz: 0.06, hip: -0.12, sy: -0.2, sx: 0.26, fh: 'wing', l: [0.45, -0.16, -0.1], bx: 0.05 },
      { u: 2.35, h: [-0.34, -0.18, 0.1], a: [-115, -16], by: -0.2, bz: 0.05, hip: -0.32, sy: -0.4, sx: 0.2, fh: 'wing' },
    ],
  },
  /** The rising whirl: the same turn out of a crouch, the blade spiralling up from the knee. */
  risingWhirlOld: {
    line: 'spiral',
    keys: [
      { u: 0.5, by: -0.31, sx: 0.36 },
      { u: 1.0, h: [-0.3, -0.3, 0.0], a: [-128, -32], by: -0.28, hip: -0.16, sy: -0.24, sx: 0.32, fh: 'chest', l: [-0.06, -0.3, 0.26], ld: [0, 40], bx: -0.04 },
      { u: 1.5, h: [-0.4, -0.14, 0.14], a: [-100, -5], by: -0.17, hip: -0.1, sy: -0.12, sx: 0.2, fh: 'chest', l: [-0.04, -0.3, 0.24], ld: [0, 40] },
      { u: 2.0, h: [-0.34, 0.1, 0.26], a: [-62, 30], by: -0.05, bz: 0.06, hip: -0.12, sy: -0.2, sx: 0.04, fh: 'wingLo', l: [0.42, -0.3, -0.12], bx: 0.05 },
      { u: 2.35, h: [-0.3, 0.2, 0.1], a: [-115, 48], by: -0.03, bz: 0.05, hip: -0.32, sy: -0.38, sx: -0.02, fh: 'wingLo' },
    ],
  },
  /** The low sweep: dropping from the backhand's finish into a crouch, the blade skimming the grass
   *  right to left and lifting as it ends, the free hand up for balance. */
  lowSweepOld: {
    line: 'low',
    lF: [0.2, 0.44], rF: [-0.19, -0.44], fy: [0.5, -0.85],
    keys: [
      { u: 0.6, by: -0.3, bz: -0.08, bx: -0.06, hip: -0.44, sy: -0.48, sx: 0.38 },
      { u: 1.0, h: [-0.22, -0.32, -0.16], a: [-150, -14], by: -0.35, bz: -0.06, hip: -0.36, sy: -0.42, sx: 0.42, fh: 'chest', l: [-0.04, -0.24, 0.28], bx: -0.05 },
      { u: 1.4, h: [-0.06, -0.36, 0.24], a: [-84, -13] },
      // (the blade crosses his front late in the cut, when the step in is nearly done: a low blade
      // reaches less far under a tall target, combat.js REACH)
      { u: 1.65, h: [0.13, -0.34, 0.45], a: [-8, -10], by: -0.37, bz: 0.08, hip: 0.1, sy: 0.05, sx: 0.5, l: [0.18, 0.12, 0.06], lp: [0.8, -0.5, 0.3], ld: [-5, 75], pn: [0.2, 0, 1], lk: 0, bx: 0.02 },
      { u: 1.85, h: [0.28, -0.35, 0.34], a: [52, -9] },
      { u: 2.0, h: [0.36, -0.32, 0.18], a: [98, -4], by: -0.36, bz: 0.1, hip: 0.36, sy: 0.4, sx: 0.44, fh: 'high', bx: 0.05 },
      { u: 2.15, by: -0.37, bz: 0.11, bx: 0.06, hip: 0.44, sy: 0.5, sx: 0.47 },
      { u: 2.4, h: [0.36, -0.26, 0.08], a: [138, 6], by: -0.31, bz: 0.08, hip: 0.41, sy: 0.46, sx: 0.39, fh: 'high', l: [0.26, 0.16, -0.08], bx: 0.04 },
    ],
  },
  /** The lunge: the hand drawn back to the ribs with the point already up, then one long line from
   *  the rear heel through the arm to the point, driven forward and up; the free hand drawn back to
   *  the hip as the sword arm drives out. */
  lungeOld: {
    line: 'point',
    rF: [-0.17, -0.5], fy: [0.1, -0.8], drag: 0.12,
    lF: [0.14, 0.58],
    keys: [
      { u: 0.6, by: -0.14, bz: -0.11, bx: -0.05, hip: -0.42, sy: -0.56, sx: 0.02 },
      { u: 1.0, h: [-0.03, -0.2, -0.08], a: [3, 20], by: -0.18, bz: -0.09, hip: -0.34, sy: -0.5, sx: 0.08, fh: 'aim', l: [0.02, -0.08, 0.36], ld: [-6, 12], bx: -0.04 },
      { u: 1.2, l: [0.08, -0.2, 0.28], lp: [0.45, -0.85, -0.2], ld: [30, -20], pn: [-0.5, -1, 0], lk: 0 },
      { u: 1.45, h: [0.08, -0.08, 0.26], a: [1, 28], by: -0.24, bz: 0.06, hip: -0.04, sy: -0.06, sx: 0.26, l: [0.2, -0.38, 0.04], lp: [0.6, -0.7, -0.3], ld: [100, -65], pn: [-1, 0, 0], lk: 0, bx: 0.0 },
      { u: 1.9, h: [0.15, 0.1, 0.48], a: [0, 35], by: -0.28, bz: 0.16, hip: 0.24, sy: 0.34, sx: 0.4, fh: 'tail', l: [0.24, -0.34, -0.26], ld: [170, -58], bx: 0.04 },
      { u: 2.1, by: -0.3, bz: 0.18, bx: 0.04, hip: 0.27, sy: 0.37, sx: 0.44 },
      { u: 2.45, h: [0.14, 0.08, 0.44], a: [0, 33], by: -0.25, bz: 0.12, hip: 0.22, sy: 0.3, sx: 0.37, fh: 'tail', bx: 0.03 },
    ],
  },
  /** The rising thrust: out of a crouch, the whole body rising behind the point as it drives up
   *  steeply into the target. */
  risingThrustOld: {
    line: 'point',
    rF: [-0.17, -0.5], fy: [0.1, -0.8], drag: 0.12,
    lF: [0.14, 0.58],
    keys: [
      { u: 0.5, l: [0.2, -0.24, 0.1], lp: [0.7, -0.5, -0.4], ld: [40, -30], pn: [0, -1, 0], lk: 0 },
      // (at u 0.7, not 0.6: out of the low sweep's finish on the far side the hips have 0.83 rad to
      // turn back through before it, and at 0.6 they whipped round 15° a frame)
      { u: 0.7, by: -0.36, bz: -0.1, bx: -0.05, hip: -0.42, sy: -0.52, sx: 0.36 },
      { u: 1.0, h: [-0.04, -0.34, -0.06], a: [4, 24], by: -0.33, bz: -0.08, hip: -0.34, sy: -0.46, sx: 0.3, l: [0.06, -0.42, 0.14], lp: [0.6, -0.3, -0.7], ld: [0, -20], pn: [0, -1, 0], lk: 0, bx: -0.04 },
      { u: 1.45, h: [0.07, -0.14, 0.26], a: [2, 34], by: -0.22, bz: 0.06, hip: -0.04, sy: -0.06, sx: 0.24, l: [0, -0.24, 0.32], lp: [0.4, -0.9, -0.1], ld: [0, 10], pn: [-0.6, -0.8, 0], lk: 0 },
      // (it rises to −0.15, not −0.07: standing up over its 1 m bow put the rear foot out of reach,
      // and its toe skated 14-23 cm in two frames)
      { u: 1.9, h: [0.14, 0.18, 0.46], a: [0, 45], by: -0.15, bz: 0.15, hip: 0.24, sy: 0.32, sx: 0.12, fh: 'aim', l: [-0.02, -0.06, 0.42], ld: [-8, 30], pn: [-1, -0.3, 0], bx: 0.04 },
      { u: 2.1, by: -0.17, bz: 0.16, bx: 0.04, hip: 0.27, sy: 0.36, sx: 0.08 },
      { u: 2.45, h: [0.13, 0.14, 0.42], a: [0, 42], by: -0.15, bz: 0.11, hip: 0.22, sy: 0.3, sx: 0.12, fh: 'aim', l: [0, -0.08, 0.4], ld: [-8, 28], pn: [-1, -0.3, 0], bx: 0.03 },
    ],
  },
};
