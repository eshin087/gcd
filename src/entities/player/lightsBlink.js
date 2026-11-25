// The blink chain's hits 1-4 (`?lights=blink`, combat.js LIGHT_BLINK; the owner, 2026-11-25: "sharper
// angles and faster attacks, almost like the main character is doing instant slashes to show how fast
// he is"; then: "the right arm angle and motion is stiff", "the light auto attack arm/body animation
// seems too short and stiff"). The hits land on today's clock; what is instant is the CUT. Each clip:
//   COIL     (u 0.86 … 1.1) he stands in the coil, nearly still: the tell of the style
//   CUT      (u 1.1 … 1.42, two frames) the blade is simply through: the sword arm opens from the coil
//            to nearly straight, the hand swinging an arc out round the shoulder at reach (never drawn
//            in to the chest), the wrist carrying the blade on its forearm's line, the hips leading the
//            chest round and the weight dropping onto the front foot
//   FOLLOW   (u 1.42 … ~2.45, 9-10 frames) the swing visibly carries on along the cut's path and slows
//            smoothly: the hand a further 25-50 cm (about 40 % of it two frames after the cut, 70 % by
//            four), the blade turning on 50° or more, the chest and hips turning on with a small sink,
//            and the elbow softening as the arm comes to rest (to 115-135°: never a straight arm held
//            out). A mashed chain cuts it off after about four frames; the next coil gathers from there
//   SETTLE   (to u 2.5; `home` 0.5) then home. The finish is where the next hit's coil begins: hit 1
//            ends low on his left, hit 2 starts there; hit 2 ends low on his right, hit 3 starts there
// The cuts make sharp angles with each other: a falling diagonal from high right, a level backhand, a
// RISING diagonal from low right to high left (on screen the same diagonal as a falling one from high
// left: the three cuts draw a Z), then a thrust: folded at the ribs, then one straight line from the
// shoulder through the point at shoulder height, a small give, and a settle. One look per hit:
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
      { u: 1.52, h: [0.306, -0.271, 0.406], a: [41.8, -26.1], by: -0.314, bz: 0.148, bx: 0.05, hip: 0.3, sy: 0.23, sx: 0.456, sz: -0.052, rp: [-0.3, -0.95, -0.1] },
      { u: 1.66, h: [0.317, -0.273, 0.345], a: [55.8, -29.9] },
      { u: 1.8, h: [0.327, -0.275, 0.287], a: [69.1, -33.5], by: -0.339, bz: 0.141, bx: 0.05, hip: 0.37, sy: 0.335, sx: 0.442, sz: -0.059 },
      { u: 2.02, h: [0.344, -0.277, 0.188], a: [91.7, -39.5], by: -0.321, bz: 0.135, bx: 0.05, hip: 0.428, sy: 0.422, sx: 0.43, sz: -0.065 },
      { u: 2.2, h: [0.354, -0.279, 0.134], a: [104.2, -42.9] },
      { u: 2.45, h: [0.36, -0.28, 0.1], a: [112, -45], by: -0.31, bz: 0.13, bx: 0.05, hip: 0.48, sy: 0.5, sx: 0.42, sz: -0.07, rp: [-0.3, -0.95, -0.1] },
    ],
  },
  /** hit 2: the backhand, level at the chest from his left to his right; the arm carries on round and
   *  down to low on his right, the blade trailing down-back */
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
      { u: 1.52, h: [-0.308, -0.08, 0.437], a: [-45.4, 0.3], by: -0.274, bz: 0.129, bx: 0.05, hip: -0.3, sy: -0.266, sx: 0.224, rp: [-0.6, -0.4, 0.7] },
      { u: 1.66, h: [-0.322, -0.134, 0.378], a: [-58.7, -6.4] },
      { u: 1.8, h: [-0.336, -0.185, 0.322], a: [-71.3, -12.7], by: -0.3, bz: 0.126, bx: 0.05, hip: -0.37, sy: -0.357, sx: 0.238 },
      { u: 2.02, h: [-0.359, -0.272, 0.226], a: [-92.8, -23.4], by: -0.281, bz: 0.123, bx: 0.05, hip: -0.428, sy: -0.432, sx: 0.25 },
      { u: 2.2, h: [-0.372, -0.32, 0.173], a: [-104.6, -29.3] },
      { u: 2.45, h: [-0.36, -0.33, 0.13], a: [-112, -33], by: -0.27, bz: 0.12, bx: 0.05, hip: -0.48, sy: -0.5, sx: 0.26, rp: [-0.6, -0.4, 0.7] },
    ],
  },
  /** hit 3: from low on his right, where hit 2 left the blade, a rising diagonal across his front to high
   *  left (on screen the same diagonal as before: the three cuts draw a Z) */
  blinkCross: {
    line: 'left', ...CUT, slash: [[1.1, 1.36]],
    lF: [0.15, 0.5], rF: [-0.17, -0.46], fy: [0.15, -0.75], drag: 0.16,
    keys: [
      { u: 0.6, by: -0.16, bz: -0.08, bx: -0.06, hip: -0.42, sy: -0.5, sx: 0.06 },
      { u: 0.88, h: [-0.26, -0.32, 0.14], a: [-115, -35], rp: [-0.6, -0.4, 0.7] },
      { u: 1, h: [-0.26, -0.32, 0.15], a: [-114, -35], rp: [-0.6, -0.4, 0.7], by: -0.14, bz: -0.06, bx: -0.05, hip: -0.36, sy: -0.44, sx: 0.04, sz: 0.04 },
      { u: 1.08, h: [-0.26, -0.32, 0.16], a: [-113, -35], rp: [-0.6, -0.4, 0.7], by: -0.14, bz: -0.06, bx: -0.05, hip: -0.36, sy: -0.44, sx: 0.04, sz: 0.04 },
      { u: 1.18, h: [-0.22, -0.22, 0.46], a: [-60, -20], rp: [-0.7, -0.6, 0.3] },
      { u: 1.27, h: [0.04, -0.02, 0.56], a: [-18, 6], rp: [-0.5, -0.85, 0.1], by: -0.2, bz: 0.1, bx: 0.02, hip: 0.08, sy: 0, sx: 0.3 },
      { u: 1.36, h: [0.3, 0.12, 0.46], a: [36, 28], rp: [-0.3, -0.95, 0.1] },
      { u: 1.46, h: [0.317, 0.121, 0.426], a: [46.6, 30.2], by: -0.214, bz: 0.126, bx: 0.05, hip: 0.305, sy: 0.242, sx: 0.289, sz: -0.043, rp: [-0.3, -0.95, 0.05] },
      { u: 1.6, h: [0.346, 0.124, 0.369], a: [64.9, 34.1] },
      { u: 1.74, h: [0.37, 0.126, 0.321], a: [80.1, 37.3], by: -0.217, bz: 0.113, bx: 0.05, hip: 0.384, sy: 0.374, sx: 0.254, sz: -0.052 },
      { u: 1.98, h: [0.398, 0.128, 0.263], a: [98.3, 41.1], by: -0.188, bz: 0.105, bx: 0.05, hip: 0.428, sy: 0.446, sx: 0.234, sz: -0.056 },
      { u: 2.18, h: [0.414, 0.13, 0.232], a: [108.2, 43.2] },
      { u: 2.42, h: [0.42, 0.13, 0.22], a: [112, 44], by: -0.18, bz: 0.1, bx: 0.05, hip: 0.46, sy: 0.5, sx: 0.22, sz: -0.06, rp: [-0.3, -0.95, 0.05] },
    ],
  },
  /** hit 4: the thrust: folded at the ribs, then one straight line from the shoulder through the point,
   *  a small give, and a settle; a short streak runs on off the point (blinkFx.js) */
  blinkThrust: {
    line: 'point', home: 0.5, gather: [0.7, 0.5], lead: [0.012, 0.006], side: true, slash: [[1.36, 0.9, 'point']],
    rF: [-0.17, -0.46], fy: [0.1, -0.8], drag: 0.12,
    lF: [0.14, 0.56],
    keys: [
      { u: 0.4, h: [0.12, -0.1, 0.26], a: [10, 5], rp: [-0.3, -0.8, -0.3] },
      { u: 0.6, by: -0.17, bz: -0.12, bx: -0.06, hip: -0.46, sy: -0.6, sx: 0.0 },
      { u: 0.8, h: [-0.01, -0.3, 0.17], a: [6, 10], rp: [-0.2, -0.7, -0.7] },
      { u: 1.0, h: [0, -0.3, 0.17], a: [6, 10], rp: [-0.2, -0.7, -0.7], by: -0.21, bz: -0.1, hip: -0.38, sy: -0.52, sx: 0.08, bx: -0.05 },
      { u: 1.08, h: [0, -0.3, 0.18], a: [6, 10], rp: [-0.2, -0.7, -0.7], by: -0.21, bz: -0.1, hip: -0.38, sy: -0.52, sx: 0.08, bx: -0.05 },
      { u: 1.2, h: [0.03, -0.1, 0.42], a: [7, 20], rp: [-0.25, -0.85, -0.45] },
      { u: 1.32, h: [0.06, 0.04, 0.6], a: [6, 32], rp: [-0.3, -0.9, -0.1], by: -0.36, bz: 0.17, hip: 0.26, sy: 0.36, sx: 0.5, bx: 0.05 },
      { u: 1.44, h: [0.065, 0.04, 0.57], a: [6, 32] },
      { u: 1.6, h: [0.06, 0.035, 0.53], a: [6, 32] },
      { u: 1.8, h: [0.055, 0.03, 0.47], a: [6, 31], by: -0.38, bz: 0.18, bx: 0.05, hip: 0.3, sy: 0.4, sx: 0.52 },
      { u: 2.05, h: [0.05, 0.02, 0.45], a: [5, 30] },
      { u: 2.3, h: [0.045, 0.01, 0.43], a: [5, 29] },
      { u: 2.5, h: [0.04, 0, 0.415], a: [5, 28], rp: [-0.3, -0.9, -0.1], by: -0.36, bz: 0.16, hip: 0.27, sy: 0.37, sx: 0.5, bx: 0.04 },
    ],
  },
};
