// The blink chain's hits 1-4 (`?lights=blink`, combat.js LIGHT_BLINK; the owner, 2026-11-25: "sharper
// angles and faster attacks, almost like the main character is doing instant slashes to show how fast
// he is"; then: "the right arm angle and motion is stiff", "the light auto attack arm/body animation
// seems too short and stiff"). The hits land on today's clock; what is instant is the CUT. Each clip:
//   COIL     (u 0.86 … 1.1) he stands in the coil, nearly still: the tell of the style
//   CUT      (u 1.1 … 1.42, two frames) the blade is simply through: the sword arm opens from the coil
//            to nearly straight, the hand swinging an arc out round the shoulder at reach (never drawn
//            in to the chest), the wrist carrying the blade on its forearm's line, the hips leading the
//            chest round and the weight dropping onto the front foot
//   FOLLOW   (to u ~2.2) the blade, the hand and the body carry on along the cut and slow down, most of
//            it in the first four frames after the cut (a mashed chain starts the next hit at u 2.3);
//            the blade turns on past where its line ended, the chest a little further round
//   SETTLE   (to u 2.5; `home` 0.5) the last of it, still moving, then home. The finish is where the
//            next hit's coil begins: hit 1 ends low on his left, hit 2 starts there
// The cuts make sharp angles with each other: a falling diagonal from high right, a level backhand, a
// falling diagonal from high left (a Z, drawn in three beats), then a thrust: folded at the ribs, then
// one straight line from the shoulder through the point, a small give, and a settle. One look per hit:
// the same exact cuts every time is the point. No spin, no hop. The free hand hangs at his side
// (`side`: anim.js; its keys' free-hand fields are ignored, so they give none). The keys are written by
// hand, the sword elbow too (`rp`: where an elbow goes for that hand, so the forearm carries the blade
// on its line); the point's path is the arc an arm makes, and blinkFx.js draws the line as the chord
// through the point's own frames (`slash`), so the line is the cut's angle at chest height.
// Clip format: swings.js's header. `slash`: blinkFx.js's header. Spread into SWINGS.

const CUT = { home: 0.5, step: [0.08, 1.2], gather: [0.7, 0.5], lead: [0.02, 0.01], side: true };

export const LIGHTS_BLINK = {
  /** hit 1: from high on the right, a falling diagonal across his front to low left */
  blinkFall: {
    line: 'right', ...CUT, slash: [[1.15, 1.42]],
    lF: [0.15, 0.5], rF: [-0.17, -0.46], fy: [0.15, -0.75], drag: 0.16,
    keys: [
      { u: 0.45, h: [-0.2, 0.12, 0.2], a: [-130, 55], rp: [-0.6, -0.55, 0.55] },
      { u: 0.6, by: -0.05, bz: -0.08, bx: -0.06, hip: -0.46, sy: -0.54, sx: -0.06 },
      { u: 0.86, h: [-0.2, 0.27, 0.06], a: [-160, 50], rp: [-0.5, -0.5, 0.7] },
      { u: 1, h: [-0.2, 0.27, 0.07], a: [-159, 50], rp: [-0.5, -0.5, 0.7], by: -0.08, bz: -0.06, bx: -0.05, hip: -0.38, sy: -0.46, sx: -0.04, sz: 0.05 },
      { u: 1.1, h: [-0.2, 0.27, 0.08], a: [-158, 50], rp: [-0.5, -0.5, 0.7], by: -0.08, bz: -0.06, bx: -0.05, hip: -0.38, sy: -0.46, sx: -0.04, sz: 0.05 },
      { u: 1.22, h: [-0.12, 0.24, 0.42], a: [-62, 42], rp: [-0.75, -0.55, 0.35] },
      { u: 1.32, h: [0.02, 0.06, 0.56], a: [-22, 14], rp: [-0.8, -0.6, 0], by: -0.2, bz: 0.1, bx: 0.02, hip: 0.1, sy: 0.0, sx: 0.36 },
      { u: 1.42, h: [0.3, -0.27, 0.44], a: [34, -24], rp: [-0.45, -0.88, -0.1] },
      { u: 1.56, h: [0.42, -0.36, 0.26], a: [58, -32], rp: [-0.3, -0.95, -0.1], by: -0.3, bz: 0.15, bx: 0.05, hip: 0.3, sy: 0.22, sx: 0.46, sz: -0.05 },
      { u: 1.72, h: [0.48, -0.4, 0.14], a: [76, -37] },
      { u: 1.92, h: [0.5, -0.42, 0.07], a: [86, -39], by: -0.33, bz: 0.15, bx: 0.06, hip: 0.44, sy: 0.44, sx: 0.5, sz: -0.07 },
      { u: 2.2, h: [0.5, -0.42, 0.04], a: [92, -40], by: -0.34, hip: 0.47, sy: 0.5, sx: 0.5 },
      { u: 2.5, h: [0.48, -0.4, 0.07], a: [90, -39], rp: [-0.3, -0.95, -0.1], by: -0.32, bz: 0.13, bx: 0.05, hip: 0.43, sy: 0.44, sx: 0.47, sz: -0.06 },
    ],
  },
  /** hit 2: the backhand, level at the chest from his left to his right */
  blinkFlat: {
    line: 'flat', ...CUT, slash: [[1.15, 1.42]],
    lF: [0.2, 0.4], fy: [0.6, -0.55],
    keys: [
      { u: 0.6, by: -0.2, bz: -0.08, bx: -0.06, hip: 0.48, sy: 0.56, sx: 0.18 },
      { u: 0.86, h: [0.36, -0.1, 0.16], a: [140, 6], rp: [0, -0.4, 0.9] },
      { u: 1, h: [0.36, -0.1, 0.17], a: [139, 6], rp: [0, -0.4, 0.9], by: -0.19, bz: -0.07, bx: -0.05, hip: 0.42, sy: 0.5, sx: 0.16 },
      { u: 1.1, h: [0.36, -0.1, 0.18], a: [138, 6], rp: [0, -0.4, 0.9], by: -0.19, bz: -0.07, bx: -0.05, hip: 0.42, sy: 0.5, sx: 0.16 },
      { u: 1.22, h: [0.28, -0.06, 0.44], a: [72, 5], rp: [-0.3, -0.85, 0.4] },
      { u: 1.32, h: [0.02, -0.04, 0.56], a: [24, 4], rp: [-0.45, -0.85, 0.1], by: -0.24, bz: 0.11, bx: 0.02, hip: -0.06, sy: 0.02, sx: 0.26 },
      { u: 1.42, h: [-0.3, -0.05, 0.47], a: [-38, 4], rp: [-0.6, -0.75, -0.15] },
      { u: 1.56, h: [-0.45, -0.04, 0.32], a: [-60, 6], by: -0.27, bz: 0.14, bx: 0.06, hip: -0.3, sy: -0.26, sx: 0.2 },
      { u: 1.72, h: [-0.53, -0.02, 0.2], a: [-78, 8] },
      { u: 1.92, h: [-0.56, 0, 0.11], a: [-88, 10], by: -0.29, hip: -0.44, sy: -0.46, sx: 0.22 },
      { u: 2.2, h: [-0.56, 0.01, 0.08], a: [-93, 11], hip: -0.47, sy: -0.5 },
      { u: 2.5, h: [-0.54, 0, 0.11], a: [-91, 10], rp: [-0.6, -0.75, -0.15], by: -0.26, bz: 0.12, bx: 0.05, hip: -0.42, sy: -0.44, sx: 0.18 },
    ],
  },
  /** hit 3: the blade up over his head to the left shoulder, then a falling diagonal across his front to
   *  low right */
  blinkCross: {
    line: 'left', ...CUT, slash: [[1.1, 1.36]],
    lF: [0.15, 0.5], rF: [-0.17, -0.46], fy: [0.15, -0.75], drag: 0.16,
    keys: [
      { u: 0.4, h: [-0.3, 0.15, 0.2], a: [-120, 58], rp: [-0.7, -0.45, 0.55] },
      { u: 0.6, by: -0.11, bz: -0.08, bx: -0.06, hip: 0.44, sy: 0.54, sx: -0.06 },
      { u: 0.7, h: [0.05, 0.28, 0.18], a: [-178, 66], rp: [-0.3, -0.55, 0.8] },
      { u: 0.88, h: [0.3, 0.2, 0.06], a: [150, 44], rp: [0.2, -0.4, 0.9] },
      { u: 1, h: [0.3, 0.2, 0.07], a: [149, 44], rp: [0.2, -0.4, 0.9], by: -0.1, bz: -0.06, bx: -0.05, hip: 0.36, sy: 0.46, sx: 0, sz: -0.05 },
      { u: 1.08, h: [0.3, 0.2, 0.08], a: [148, 44], rp: [0.2, -0.4, 0.9], by: -0.1, bz: -0.06, bx: -0.05, hip: 0.36, sy: 0.46, sx: 0, sz: -0.05 },
      { u: 1.18, h: [0.22, 0.18, 0.44], a: [62, 36], rp: [-0.3, -0.6, 0.75] },
      { u: 1.27, h: [-0.02, 0.02, 0.56], a: [20, 10], rp: [-0.6, -0.75, 0.25], by: -0.24, bz: 0.12, bx: 0.02, hip: -0.1, sy: 0, sx: 0.36 },
      { u: 1.36, h: [-0.32, -0.3, 0.47], a: [-34, -24], rp: [-0.7, -0.6, -0.2] },
      { u: 1.5, h: [-0.42, -0.36, 0.26], a: [-56, -32], rp: [-0.7, -0.55, -0.4], by: -0.32, bz: 0.15, bx: 0.05, hip: -0.36, sy: -0.34, sx: 0.46, sz: 0.05 },
      { u: 1.68, h: [-0.48, -0.4, 0.14], a: [-70, -36] },
      { u: 1.9, h: [-0.5, -0.42, 0.08], a: [-78, -38], by: -0.35, bz: 0.15, bx: 0.06, hip: -0.42, sy: -0.44, sx: 0.5, sz: 0.07 },
      { u: 2.2, h: [-0.5, -0.42, 0.06], a: [-81, -38], by: -0.36, hip: -0.44, sy: -0.46 },
      { u: 2.5, h: [-0.47, -0.38, 0.1], a: [-78, -35], rp: [-0.7, -0.55, -0.4], by: -0.34, bz: 0.13, bx: 0.05, hip: -0.41, sy: -0.43, sx: 0.46, sz: 0.06 },
    ],
  },
  /** hit 4: the thrust: folded at the ribs, then one straight line from the shoulder through the point,
   *  a small give, and a settle; a short streak runs on off the point (blinkFx.js) */
  blinkThrust: {
    line: 'point', home: 0.5, gather: [0.7, 0.5], lead: [0.012, 0.006], side: true, slash: [[1.36, 0.9, 'point']],
    rF: [-0.17, -0.46], fy: [0.1, -0.8], drag: 0.12,
    lF: [0.14, 0.56],
    keys: [
      { u: 0.4, h: [-0.14, -0.3, 0.12], a: [-24, -4], rp: [-0.45, -0.75, -0.45] },
      { u: 0.6, by: -0.17, bz: -0.12, bx: -0.06, hip: -0.46, sy: -0.6, sx: 0.0 },
      { u: 0.8, h: [-0.01, -0.3, 0.17], a: [6, 10], rp: [-0.2, -0.7, -0.7] },
      { u: 1.0, h: [0, -0.3, 0.17], a: [6, 10], rp: [-0.2, -0.7, -0.7], by: -0.21, bz: -0.1, hip: -0.38, sy: -0.52, sx: 0.08, bx: -0.05 },
      { u: 1.08, h: [0, -0.3, 0.18], a: [6, 10], rp: [-0.2, -0.7, -0.7], by: -0.21, bz: -0.1, hip: -0.38, sy: -0.52, sx: 0.08, bx: -0.05 },
      { u: 1.2, h: [0.03, 0.02, 0.42], a: [7, 22], rp: [-0.25, -0.85, -0.45] },
      { u: 1.32, h: [0.06, 0.22, 0.55], a: [6, 32], rp: [-0.3, -0.9, -0.1], by: -0.36, bz: 0.17, hip: 0.26, sy: 0.36, sx: 0.5, bx: 0.05 },
      { u: 1.44, h: [0.065, 0.22, 0.52], a: [6, 32] },
      { u: 1.6, h: [0.06, 0.21, 0.49], a: [6, 32] },
      { u: 1.8, h: [0.055, 0.2, 0.46], a: [6, 31], by: -0.38, bz: 0.18, bx: 0.05, hip: 0.3, sy: 0.4, sx: 0.52 },
      { u: 2.05, h: [0.05, 0.185, 0.44], a: [5, 30] },
      { u: 2.3, h: [0.045, 0.17, 0.42], a: [5, 29] },
      { u: 2.5, h: [0.04, 0.155, 0.405], a: [5, 28], rp: [-0.3, -0.9, -0.1], by: -0.36, bz: 0.16, hip: 0.27, sy: 0.37, sx: 0.5, bx: 0.04 },
    ],
  },
};
