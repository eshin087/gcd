// The attacks outside the light chain and its heavy branches as INSTANT cuts (`?lights=blink`; the owner,
// 2026-11-25: "also make dash attack instant. pretty much all attacks needs to follow the instant attack
// style"): the sprint slash, the roll cut, the charged cleave, One Breath and the execution thrust.
// Each keeps its def's clock, damage, dash / travel / keepYaw and counter window (combat.js); what changes
// is the picture: he is STILL in the coil, the cut is two or three frames, and one straight line hangs
// where the blade went (blinkFx.js `slash`). Then:
//   one-handed strokes (the sprint slash, the roll cut, One Breath) FOLLOW THROUGH: the arm opens through
//     the cut and the blade, the hand and the body carry on along the same path, slowing, and settle;
//     the free hand hangs loose at his side (`side`)
//   two-handed blows (the cleave, the execution) LAND: the cut, then the body drops into it, a hard stop
//     and a long still hold of the finish before he comes home; their lines in the heavy look
// The keys are written by hand (the arm the way an arm cuts; the line is the chord of that cut). No spin,
// no hop. Clip format: swings.js's header; `slash`: blinkFx.js's header. Spread into SWINGS.
//   blinkSprint   the dash attack: the run carries him on with the blade held still low at the right hip,
//             then one rising diagonal across his front to high left as he passes; the follow-through
//             rides the run-out
//   blinkRoll     out of the roll's crouch: one low cut rising across his front to his left, and he is up
//   blinkCleave   the charged dash with the blade cocked still over the right shoulder, both hands on it; as
//             the dash dies, one two-handed diagonal down across his front, and the weight lands
//   blinkDraw     One Breath: the iai coil at the right hip, then one level draw across his front through the
//             blink step, the arm thrown long to his left, held (zanshin); a light line along the cut
//   blinkExec     the execution: both hands draw the grip back to the ribs, still; the point is simply there
//             (the kill is on the first active frame, player.js _executeHit), a streak off the point; then
//             he sinks into the thrust, drives the point up through him (thrusts rise) and holds it

const SIDE = { side: true };
const TWO = { two: 1, hs: 0 };

export const SPECIALS_BLINK = {
  /** The sprint slash, instant: held low at the right hip, then one rising diagonal to high left */
  blinkSprint: {
    ...SIDE, line: 'left', home: 0.3, slash: [[0.9, 1.36]],
    keys: [
      { u: 0.25, a: [-62, -60] },
      { u: 0.5, h: [-0.1, -0.36, 0.16], a: [-20, -50], by: -0.2, bz: -0.02, bx: -0.04, hip: -0.46, sy: -0.48, sx: 0.36 },
      { u: 1.0, h: [-0.1, -0.36, 0.16], a: [-20, -50], by: -0.2, bz: -0.02, bx: -0.04, hip: -0.42, sy: -0.44, sx: 0.36 },
      { u: 1.12, h: [-0.02, -0.24, 0.44], a: [-16, -22] },
      { u: 1.24, h: [0.1, -0.06, 0.52], a: [10, 6], by: -0.24, bz: 0.08, hip: 0.04, sy: -0.02, sx: 0.3 },
      { u: 1.36, h: [0.24, 0.12, 0.46], a: [46, 26] },
      { u: 1.52, h: [0.32, 0.2, 0.36], a: [74, 38], by: -0.2, bz: 0.1, hip: 0.32, sy: 0.3, sx: 0.18 },
      { u: 1.78, h: [0.36, 0.24, 0.28], a: [90, 44] },
      { u: 2.05, h: [0.37, 0.25, 0.24], a: [97, 46], by: -0.16, bz: 0.1, hip: 0.46, sy: 0.5, sx: 0.12 },
      { u: 2.5, h: [0.36, 0.22, 0.22], a: [102, 45], by: -0.17, bz: 0.08, hip: 0.44, sy: 0.48, sx: 0.13 },
    ],
  },
  /** The roll cut, instant: crouched, the blade low on the right; one low cut rising across to his left */
  blinkRoll: {
    ...SIDE, line: 'left', home: 0.3, slash: [[0.9, 1.34]],
    keys: [
      { u: 0.22, a: [-112, -52] },
      { u: 0.42, a: [-56, -48] },
      { u: 0.62, h: [-0.1, -0.36, 0.16], a: [-22, -34], by: -0.38, bz: -0.06, bx: -0.05, hip: -0.46, sy: -0.5, sx: 0.46 },
      { u: 1.0, h: [-0.1, -0.36, 0.16], a: [-22, -34], by: -0.36, bz: -0.05, bx: -0.04, hip: -0.42, sy: -0.46, sx: 0.45 },
      { u: 1.12, h: [-0.02, -0.28, 0.45], a: [-18, -26] },
      { u: 1.23, h: [0.1, -0.14, 0.51], a: [10, -4], by: -0.32, bz: 0.08, hip: 0.04, sy: 0.0, sx: 0.4 },
      { u: 1.34, h: [0.25, -0.02, 0.47], a: [44, 14] },
      { u: 1.52, h: [0.36, 0.07, 0.39], a: [70, 26], by: -0.26, bz: 0.1, hip: 0.32, sy: 0.3, sx: 0.26 },
      { u: 1.78, h: [0.4, 0.1, 0.31], a: [86, 32] },
      { u: 2.05, h: [0.38, 0.11, 0.26], a: [93, 34], by: -0.2, bz: 0.1, bx: 0.05, hip: 0.5, sy: 0.54, sx: 0.18 },
      { u: 2.5, h: [0.37, 0.09, 0.24], a: [97, 33], by: -0.19, bz: 0.08, bx: 0.04, hip: 0.48, sy: 0.52, sx: 0.17 },
    ],
  },
  /** The charged cleave, instant: cocked still over the right shoulder through the dash, then one two-handed
   *  diagonal down across his front as it dies; the weight lands and he holds */
  blinkCleave: {
    line: 'right', home: 0.62, slashLook: 'heavy', slash: [[1.55, 1.8]],
    lead: [0.033, 0], fold: 0,
    keys: [
      { u: 0.5, h: [-0.14, 0.04, 0.22], a: [-30, 52], ...TWO, lp: [0.7, -0.6, 0.3], by: -0.24, bz: 0.06, hip: -0.36, sy: -0.5, sx: 0.36 },
      { u: 1.6, h: [-0.14, 0.04, 0.22], a: [-30, 52], ...TWO, by: -0.24, bz: 0.06, hip: -0.34, sy: -0.48, sx: 0.36 },
      { u: 1.67, h: [-0.06, 0.02, 0.38], a: [-20, 22] },
      { u: 1.74, h: [0.08, -0.12, 0.42], a: [18, -10], by: -0.3, bz: 0.1, hip: 0.08, sy: 0.04, sx: 0.44 },
      { u: 1.8, h: [0.2, -0.26, 0.34], a: [50, -32], ...TWO },
      { u: 1.9, h: [0.24, -0.33, 0.29], a: [60, -38], ...TWO, by: -0.42, bz: 0.12, hip: 0.4, sy: 0.42, sx: 0.56 },
      { u: 2.0, h: [0.25, -0.34, 0.28], a: [62, -39], ...TWO, by: -0.44, bz: 0.12, hip: 0.42, sy: 0.44, sx: 0.58 },
      { u: 2.6, h: [0.25, -0.34, 0.28], a: [62, -39], ...TWO, by: -0.43, bz: 0.12, hip: 0.41, sy: 0.43, sx: 0.57 },
    ],
  },
  /** One Breath, instant: the iai coil at the right hip, one level draw across his front, held */
  blinkDraw: {
    ...SIDE, line: 'flat', home: 0.3, slashLook: 'strong', slash: [[1.0, 1.5]],
    lF: [0.18, 0.4], fy: [0.55, -0.6],
    keys: [
      { u: 0.5, h: [-0.2, -0.24, 0.26], a: [-32, -14], by: -0.24, bz: -0.06, bx: -0.05, hip: -0.46, sy: -0.5, sx: 0.28 },
      { u: 1.0, h: [-0.2, -0.24, 0.26], a: [-32, -14], by: -0.24, bz: -0.06, bx: -0.05, hip: -0.44, sy: -0.48, sx: 0.28 },
      { u: 1.17, h: [-0.2, -0.24, 0.26], a: [-32, -14] },
      { u: 1.33, h: [0.04, -0.2, 0.5], a: [-6, -4], by: -0.3, bz: 0.09, hip: 0.1, sy: 0.0, sx: 0.34 },
      { u: 1.5, h: [0.27, -0.14, 0.46], a: [50, 0] },
      { u: 1.75, h: [0.36, -0.1, 0.34], a: [80, 4], by: -0.28, bz: 0.12, bx: 0.05, hip: 0.4, sy: 0.38, sx: 0.3 },
      { u: 2.05, h: [0.4, -0.08, 0.27], a: [94, 6], by: -0.27, bz: 0.12, bx: 0.05, hip: 0.46, sy: 0.48, sx: 0.29 },
      { u: 2.6, h: [0.42, -0.04, 0.17], a: [106, 9], by: -0.26, bz: 0.11, bx: 0.05, hip: 0.48, sy: 0.5, sx: 0.27 },
    ],
  },
  /** The execution, instant: the grip drawn back to the ribs, still; the point is simply there, level; then
   *  he sinks into it and drives the point up through him, and holds */
  blinkExec: {
    line: 'point', home: 0.6, slashLook: 'heavy', slash: [[1.0, 0.9, 'point']],
    rF: [-0.17, -0.52], fy: [0.1, -0.8], drag: 0.12, lF: [0.14, 0.58],
    keys: [
      { u: 0.6, h: [-0.04, -0.2, -0.02], a: [6, -10], rp: [-0.75, -0.45, -0.5], ...TWO, lp: [0.7, -0.6, 0.3], by: -0.28, bz: -0.1, bx: -0.05, hip: -0.44, sy: -0.54, sx: 0.2 },
      { u: 0.78, h: [-0.04, -0.2, -0.02], a: [6, -10], rp: [-0.75, -0.45, -0.5], ...TWO, by: -0.28, bz: -0.1, bx: -0.05, hip: -0.44, sy: -0.54, sx: 0.2 },
      { u: 0.98, h: [0.06, -0.06, 0.48], a: [10, 1], rp: [-0.74, -0.62, -0.2], ...TWO, by: -0.32, bz: 0.14, bx: 0.04, hip: 0.18, sy: 0.26, sx: 0.44 },
      { u: 1.2, h: [0.06, -0.08, 0.47], a: [10, 2], rp: [-0.74, -0.62, -0.2], ...TWO, by: -0.38, bz: 0.17, bx: 0.04, hip: 0.22, sy: 0.3, sx: 0.52 },
      { u: 1.5, h: [0.06, -0.05, 0.45], a: [10, 30], rp: [-0.74, -0.62, -0.2], ...TWO, by: -0.43, bz: 0.19, bx: 0.04, hip: 0.26, sy: 0.34, sx: 0.57 },
      { u: 2.0, h: [0.06, -0.05, 0.45], a: [10, 30], rp: [-0.74, -0.62, -0.2], ...TWO },
      { u: 2.6, h: [0.06, -0.06, 0.45], a: [10, 29], rp: [-0.74, -0.62, -0.2], ...TWO, by: -0.42, bz: 0.18, bx: 0.04, hip: 0.25, sy: 0.33, sx: 0.56 },
    ],
  },
};

/** The look each wears under `?lights=blink` (combat.js setLights `wear`, SPECIAL_DEFS): `{ anim, ... }`
 *  (`contact` / `glint` too where the look changes how the contact is drawn); `null` keeps today's. The
 *  anim options of the clips they replace (the dash feet) are kept. The execution plays a clip instead of
 *  its own `thrust` pose (anim.js thrustPose): its def's kind stays 'thrust', so its flow in player.js
 *  (the kill on the first active frame, its freeze, its streak) is untouched. */
export const SPECIAL_BLINK = {
  sprint: { anim: { kind: 'clip', clip: 'blinkSprint', feet: 'dash' } },
  roll: { anim: { kind: 'clip', clip: 'blinkRoll' } },
  cleave: { anim: { kind: 'clip', clip: 'blinkCleave', feet: 'dash', dashW: true } },
  draw: { anim: { kind: 'clip', clip: 'blinkDraw', feet: 'dash', dashW: true } },
  exec: { anim: { kind: 'clip', clip: 'blinkExec', feet: 'dash', dashW: true } },
};
