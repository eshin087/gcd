// The blink chain's LAST HIT (hit 5 of `?lights=blink`; combat.js LIGHT_BLINK[4]). The owner (2026-11-25):
// "make the last 5th attack just be a more stronger light attack but have it always be a different
// stroke to make it look dynamic and random". Data only (no imports).
//
// Five one-handed strokes, each on its own line (swings.js `line`), so the animator (anim.js _pickVariant)
// plays one of them at random each chain and never the one it played the chain before. Each is its own
// picture from the game camera (its line's tilt on screen in brackets: 0 level, 90 upright):
//   lastRise   a rising backhand from a low coil at the left hip to high right (~30°)        line 'right'
//   lastUpper  the big rising forehand from deep behind the right hip to high left (~120°)   line 'left'
//   lastSweep  a level forehand at the chest from far out on his right (~0°)                 line 'flat'
//   lastDrop   a near-upright falling cut from over the right shoulder down through his
//              middle, the body dropping under it, a frame later than the others (~75°)      line 'down'
//   lastLow    a shallow falling backhand from his left shoulder to knee height on his right,
//              on the longest, lowest step (~150°)                                           line 'low'
// Each is a light, made stronger with the hit's longer clock (windup 0.28 s, recovery 0.42 s; combat.js
// LIGHT[4]): a deeper coil (the hips and the chest wound away, the weight back and low), a longer step in
// (`lF`, `step`), a cut of 100-130° of blade in three frames with the arm opening to full reach and the
// chest turning through it, the body sinking onto the front leg. Then the swing CONTINUES for eleven frames
// (the lead, 2026-11-25): the blade turns a further 60-75° off its line and the hand travels on 30-50 cm,
// slowing (about a third of the way by +2 frames, 70 % by +5, all by +11; the keys after the cut are laid
// on that ease), the hips and the chest turning on and the weight settling, the elbow softening to ~120°
// as the arm comes to rest; then he eases home (`home` 0.42). Never the
// heavies' look: one hand (`two` 0), no long still hold before or after, a white line (`slashLook:
// 'strong'`, blinkFx.js), no hop, no spin, no turn, no ground burst (`plain`: player.js _slamImpact).
// The free hand hangs at his side (`side`). The cut crosses his front at chest height or below in the
// active frames (u 1.26-1.57; lastDrop 1.41-1.72), after the lunge has carried him in: the hit's reach band
// is low (`up` 1). The keys are written by hand; the arm audit (integ.mjs `armaudit`) and `blinklast`
// measure them.

const LAST = { plain: true, side: true, slashLook: 'strong', home: 0.42, gather: [0.7, 0.5] };

/** The last hit's clips (swings.js format), spread into SWINGS. */
export const LAST_HITS_BLINK = {
  /** a rising backhand from his left hip up across his front to high right; it rides on over his right shoulder */
  lastRise: {
    ...LAST, line: 'right', slash: [[1.24, 1.56]], step: [0.1, 1.3],
    lF: [0.16, 0.58], rF: [-0.18, -0.48], fy: [0.2, -0.75], drag: 0.2,
    keys: [
      { u: 0.5, h: [0.12, -0.2, 0.3], a: [60, -12] },
      { u: 0.55, by: -0.2, bz: -0.1, bx: -0.07, hip: 0.6, sy: 0.62, sx: 0.22 },
      { u: 1, h: [0.26, -0.3, 0.14], a: [100, -24], two: 0, by: -0.24, bz: -0.09, bx: -0.06, hip: 0.52, sy: 0.56, sx: 0.2, sz: -0.04 },
      { u: 1.18, h: [0.26, -0.31, 0.15], a: [100, -24] },
      { u: 1.26, h: [0.28, -0.32, 0.3], a: [60, -28] },
      { u: 1.34, h: [0.14, -0.22, 0.46], a: [34, -16] },
      { u: 1.42, h: [-0.04, -0.1, 0.53], a: [8, -3], by: -0.32, bz: 0.14, bx: 0.03, hip: -0.12, sy: -0.08, sx: 0.34, sz: 0 },
      { u: 1.5, h: [-0.2, 0.02, 0.5], a: [-20, 12] },
      { u: 1.58, h: [-0.33, 0.12, 0.42], a: [-46, 25] },
      { u: 1.72, h: [-0.342, 0.144, 0.359], a: [-62, 28], by: -0.3, bz: 0.16, bx: 0.05, hip: -0.36, sy: -0.32, sx: 0.36 },
      { u: 1.85, h: [-0.353, 0.166, 0.301], a: [-77, 31] },
      { u: 1.96, h: [-0.363, 0.186, 0.251], a: [-90, 33] },
      { u: 2.08, h: [-0.378, 0.217, 0.172], a: [-111, 37], by: -0.34, bz: 0.19, bx: 0.06, hip: -0.56, sy: -0.5, sx: 0.38 },
      { u: 2.24, h: [-0.395, 0.25, 0.085], a: [-133, 41] },
      { u: 2.37, h: [-0.4, 0.26, 0.06], a: [-140, 42], by: -0.36, bz: 0.2, bx: 0.06, hip: -0.64, sy: -0.58, sx: 0.38 },
      { u: 2.8, h: [-0.4, 0.26, 0.06], a: [-140, 42], two: 0, by: -0.34, bz: 0.18, bx: 0.05, hip: -0.6, sy: -0.55, sx: 0.36 },
    ],
  },
  /** a rising forehand from behind his right hip up across his front to high left, the widest of the rising cuts; it rides on over his left shoulder */
  lastUpper: {
    ...LAST, line: 'left', slash: [[1.24, 1.56]], step: [0.08, 1.3],
    lF: [0.16, 0.64], rF: [-0.18, -0.52], fy: [0.2, -0.75], drag: 0.24,
    keys: [
      { u: 0.55, h: [-0.16, -0.26, 0.14], a: [-40, -44] },
      { u: 0.55, by: -0.24, bz: -0.11, bx: -0.07, hip: -0.68, sy: -0.7, sx: 0.22 },
      { u: 1, h: [-0.14, -0.32, -0.2], a: [-150, -36], two: 0, by: -0.3, bz: -0.1, bx: -0.06, hip: -0.6, sy: -0.64, sx: 0.2, sz: 0.04 },
      { u: 1.18, h: [-0.14, -0.33, -0.19], a: [-150, -36] },
      { u: 1.26, h: [-0.16, -0.36, 0.36], a: [-50, -36] },
      { u: 1.34, h: [-0.1, -0.24, 0.46], a: [-30, -20] },
      { u: 1.42, h: [0.04, -0.1, 0.54], a: [-8, -3], by: -0.36, bz: 0.15, bx: 0.03, hip: 0.14, sy: 0.1, sx: 0.36, sz: 0 },
      { u: 1.5, h: [0.16, 0.08, 0.5], a: [22, 22] },
      { u: 1.58, h: [0.28, 0.18, 0.44], a: [44, 42] },
      { u: 1.72, h: [0.297, 0.18, 0.406], a: [59, 41], by: -0.32, bz: 0.18, bx: 0.05, hip: 0.42, sy: 0.4, sx: 0.38 },
      { u: 1.85, h: [0.313, 0.18, 0.374], a: [73, 41] },
      { u: 1.96, h: [0.327, 0.18, 0.346], a: [85, 40] },
      { u: 2.08, h: [0.349, 0.18, 0.302], a: [105, 39], by: -0.35, bz: 0.2, bx: 0.06, hip: 0.62, sy: 0.58, sx: 0.4 },
      { u: 2.24, h: [0.373, 0.18, 0.254], a: [126, 38] },
      { u: 2.37, h: [0.38, 0.18, 0.24], a: [132, 38], by: -0.36, bz: 0.21, bx: 0.06, hip: 0.7, sy: 0.64, sx: 0.4 },
      { u: 2.8, h: [0.38, 0.18, 0.24], a: [132, 38], two: 0, by: -0.34, bz: 0.19, bx: 0.05, hip: 0.66, sy: 0.6, sx: 0.38 },
    ],
  },
  /** a level forehand at the chest from far out on his right round to his left; it rides on round behind his left side */
  lastSweep: {
    ...LAST, line: 'flat', slash: [[1.24, 1.56]], step: [0.1, 1.3],
    lF: [0.18, 0.6], rF: [-0.18, -0.48], fy: [0.3, -0.75], drag: 0.2,
    keys: [
      { u: 0.5, h: [-0.24, -0.06, 0.3], a: [-60, 10] },
      { u: 0.55, by: -0.16, bz: -0.1, bx: -0.07, hip: -0.62, sy: -0.66, sx: 0.12 },
      { u: 1, h: [-0.4, -0.12, 0.04], a: [-112, 4], two: 0, by: -0.18, bz: -0.09, bx: -0.06, hip: -0.55, sy: -0.6, sx: 0.12 },
      { u: 1.18, h: [-0.4, -0.12, 0.05], a: [-112, 4] },
      { u: 1.26, h: [-0.3, -0.08, 0.3], a: [-60, 8] },
      { u: 1.34, h: [-0.16, -0.1, 0.48], a: [-32, 5] },
      { u: 1.42, h: [0.02, -0.12, 0.54], a: [-6, 1], by: -0.26, bz: 0.14, bx: 0.03, hip: 0.1, sy: 0.06, sx: 0.26 },
      { u: 1.5, h: [0.2, -0.15, 0.5], a: [22, -3] },
      { u: 1.58, h: [0.34, -0.17, 0.4], a: [48, -6] },
      { u: 1.72, h: [0.354, -0.162, 0.366], a: [60, -5], by: -0.28, bz: 0.17, bx: 0.05, hip: 0.4, sy: 0.38, sx: 0.28 },
      { u: 1.85, h: [0.366, -0.153, 0.334], a: [71, -4] },
      { u: 1.96, h: [0.378, -0.147, 0.306], a: [81, -3] },
      { u: 2.08, h: [0.395, -0.136, 0.262], a: [96, -2], by: -0.3, bz: 0.18, bx: 0.06, hip: 0.6, sy: 0.56, sx: 0.3 },
      { u: 2.24, h: [0.414, -0.123, 0.214], a: [113, 0] },
      { u: 2.37, h: [0.42, -0.12, 0.2], a: [118, 0], by: -0.32, bz: 0.19, bx: 0.06, hip: 0.68, sy: 0.62, sx: 0.3 },
      { u: 2.8, h: [0.42, -0.12, 0.2], a: [118, 0], two: 0, by: -0.3, bz: 0.17, bx: 0.05, hip: 0.64, sy: 0.58, sx: 0.28 },
    ],
  },
  /** a near-upright falling cut from high over his right shoulder straight down through his middle, the body dropping under it; it rides on low past his left leg */
  lastDrop: {
    ...LAST, line: 'down', slash: [[1.4, 1.72]], step: [0.1, 1.42],
    lF: [0.15, 0.6], rF: [-0.17, -0.5], fy: [0.15, -0.75], drag: 0.22,
    keys: [
      { u: 0.5, h: [-0.13, 0.14, 0.26], a: [-28, 42] },
      { u: 0.55, by: 0.0, bz: -0.1, bx: -0.07, hip: -0.26, sy: -0.3, sx: -0.1 },
      { u: 1, h: [-0.14, 0.22, -0.18], a: [-170, 45], two: 0, by: -0.04, bz: -0.08, bx: -0.06, hip: -0.18, sy: -0.2, sx: -0.08, sz: 0.06 },
      { u: 1.33, h: [-0.14, 0.22, -0.16], a: [-170, 45] },
      { u: 1.41, h: [-0.06, 0.25, 0.44], a: [34, 46] },
      { u: 1.49, h: [-0.06, 0.14, 0.55], a: [20, 22] },
      { u: 1.57, h: [-0.06, -0.04, 0.57], a: [6, -2], by: -0.36, bz: 0.16, bx: 0.03, hip: -0.12, sy: -0.14, sx: 0.48, sz: 0 },
      { u: 1.65, h: [-0.06, -0.2, 0.54], a: [-6, -24] },
      { u: 1.72, h: [-0.06, -0.3, 0.5], a: [-18, -38] },
      { u: 1.85, h: [-0.033, -0.307, 0.469], a: [-1, -37], by: -0.44, bz: 0.2, bx: 0.06, hip: -0.06, sy: -0.08, sx: 0.58 },
      { u: 1.96, h: [-0.007, -0.313, 0.441], a: [14, -35] },
      { u: 2.02, h: [0.015, -0.319, 0.415], a: [28, -34] },
      { u: 2.1, by: -0.49, bz: 0.21, bx: 0.06, hip: 0.1, sy: 0.08, sx: 0.6 },
      { u: 2.14, h: [0.05, -0.328, 0.376], a: [50, -32] },
      { u: 2.28, h: [0.089, -0.337, 0.333], a: [73, -31] },
      { u: 2.41, h: [0.1, -0.34, 0.32], a: [80, -30], by: -0.52, bz: 0.21, bx: 0.06, hip: 0.3, sy: 0.26, sx: 0.6 },
      { u: 2.8, h: [0.1, -0.34, 0.32], a: [80, -30], two: 0, by: -0.48, bz: 0.2, bx: 0.05, hip: 0.28, sy: 0.24, sx: 0.56 },
    ],
  },
  /** a shallow falling backhand from his left shoulder down to low on his right at knee height, on the longest, lowest step; it rides on round past his right hip */
  lastLow: {
    ...LAST, line: 'low', slash: [[1.2, 1.52]], step: [0.05, 1.25],
    lF: [0.16, 0.7], rF: [-0.18, -0.52], fy: [0.2, -0.8], drag: 0.26,
    keys: [
      { u: 0.5, h: [0.14, 0.0, 0.3], a: [70, 20] },
      { u: 0.55, by: -0.22, bz: -0.1, bx: -0.07, hip: 0.6, sy: 0.62, sx: 0.12 },
      { u: 1, h: [0.36, 0.04, 0.14], a: [125, 26], two: 0, by: -0.26, bz: -0.08, bx: -0.06, hip: 0.55, sy: 0.58, sx: 0.14 },
      { u: 1.14, h: [0.36, 0.03, 0.15], a: [125, 26] },
      { u: 1.22, h: [0.32, 0.1, 0.34], a: [54, 18] },
      { u: 1.3, h: [0.18, 0.02, 0.5], a: [30, 10] },
      { u: 1.38, h: [0.0, -0.07, 0.55], a: [4, 1], by: -0.42, bz: 0.18, bx: 0.03, hip: -0.1, sy: -0.06, sx: 0.46 },
      { u: 1.46, h: [-0.16, -0.15, 0.5], a: [-22, -6] },
      { u: 1.54, h: [-0.28, -0.22, 0.42], a: [-48, -12] },
      { u: 1.68, h: [-0.304, -0.22, 0.355], a: [-61, -12] },
      { u: 1.72, by: -0.46, bz: 0.2, bx: 0.06, hip: -0.36, sy: -0.32, sx: 0.5 },
      { u: 1.82, h: [-0.326, -0.22, 0.295], a: [-72, -11] },
      { u: 1.94, h: [-0.346, -0.22, 0.241], a: [-83, -11] },
      { u: 2.06, h: [-0.377, -0.22, 0.158], a: [-99, -11] },
      { u: 2.08, by: -0.48, bz: 0.21, bx: 0.06, hip: -0.56, sy: -0.5, sx: 0.5 },
      { u: 2.22, h: [-0.41, -0.22, 0.067], a: [-117, -10] },
      { u: 2.35, h: [-0.42, -0.22, 0.04], a: [-122, -10] },
      { u: 2.37, by: -0.5, bz: 0.21, bx: 0.06, hip: -0.64, sy: -0.58, sx: 0.5 },
      { u: 2.8, h: [-0.42, -0.22, 0.04], a: [-122, -10], two: 0, by: -0.47, bz: 0.2, bx: 0.05, hip: -0.6, sy: -0.55, sx: 0.48 },
    ],
  },
};

const clip = (c) => Object.freeze({ kind: 'clip', clip: c });

/** The look hit 5 wears under `?lights=blink` (combat.js setLights `wear`). The animator picks among
 *  `anim` and `variants` at random, never the same one twice in a row (anim.js _pickVariant). */
export const LAST_HIT_BLINK = Object.freeze({
  anim: clip('lastRise'),
  variants: Object.freeze([clip('lastUpper'), clip('lastSweep'), clip('lastDrop'), clip('lastLow')]),
  contact: 'sweep',
});
