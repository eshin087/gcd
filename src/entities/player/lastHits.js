// The blink chain's LAST HIT (hit 5 of `?lights=blink`; combat.js LIGHT_BLINK[4]). The owner (2026-11-25):
// "make the last 5th attack just be a more stronger light attack but have it always be a different
// stroke to make it look dynamic and random". Data only (no imports).
//
// Five one-handed strokes, each on its own line (swings.js `line`), so the animator (anim.js _pickVariant)
// plays one of them at random each chain and never the one it played the chain before:
//   lastRise   a rising backhand from the left hip to high right                 line 'right'
//   lastUpper  a rising forehand from behind the right hip to high left          line 'left'
//   lastSweep  a level forehand at the chest from far out on his right           line 'flat'
//   lastDrop   a steep falling cut from over the right shoulder through the
//              middle to low left, a frame later than the others (a longer hold) line 'down'
//   lastLow    a level backhand at the hips, left to right, on the longest step  line 'low'
// Each is a light, made stronger with the hit's longer clock (windup 0.28 s, recovery 0.42 s; combat.js
// LIGHT[4]): a deeper coil (the hips and the chest wound ~60° away, the weight back and low), a longer step
// in (`lF`, `step`), a cut of 100-130° of blade in three frames with the arm opening to full reach and the
// chest turning 50-85° through it, the body sinking onto the front leg, and a follow-through that rides on
// round for the rest of the active frames and the recovery before he eases home (`home` 0.32). Never the
// heavies' look: one hand (`two` 0), no long still hold before or after, a white line (`slashLook:
// 'strong'`, blinkFx.js), no hop, no spin, no turn, no ground burst (`plain`: player.js _slamImpact).
// The free hand hangs at his side (`side`). The cut crosses his front at chest height or below in the
// active frames (u 1.26-1.57; lastDrop 1.41-1.72), after the lunge has carried him in: the hit's reach band
// is low (`up` 1). The keys are written by hand; the arm audit (integ.mjs `armaudit`) and `blinklast`
// measure them.

const LAST = { plain: true, side: true, slashLook: 'strong', home: 0.32, gather: [0.7, 0.5] };

/** The last hit's clips (swings.js format), spread into SWINGS. */
export const LAST_HITS_BLINK = {
  /** a rising backhand from his left hip up across his front to high right */
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
      { u: 1.72, h: [-0.41, 0.16, 0.34], a: [-68, 34], by: -0.28, bz: 0.17, bx: 0.06, hip: -0.48, sy: -0.44, sx: 0.36 },
      { u: 1.9, h: [-0.45, 0.19, 0.27], a: [-84, 40] },
      { u: 2.12, h: [-0.47, 0.2, 0.21], a: [-95, 43], by: -0.3, bz: 0.18, bx: 0.06, hip: -0.58, sy: -0.54, sx: 0.38 },
      { u: 2.4, h: [-0.47, 0.2, 0.16], a: [-106, 44] },
      { u: 2.8, h: [-0.46, 0.19, 0.16], a: [-107, 43], two: 0, by: -0.28, bz: 0.16, bx: 0.05, hip: -0.53, sy: -0.5, sx: 0.35 },
    ],
  },
  /** a rising forehand from behind his right hip up across his front to high left */
  lastUpper: {
    ...LAST, line: 'left', slash: [[1.24, 1.56]], step: [0.1, 1.3],
    lF: [0.16, 0.58], rF: [-0.18, -0.48], fy: [0.2, -0.75], drag: 0.2,
    keys: [
      { u: 0.55, h: [-0.16, -0.26, 0.14], a: [-40, -44] },
      { u: 0.55, by: -0.2, bz: -0.1, bx: -0.07, hip: -0.6, sy: -0.62, sx: 0.2 },
      { u: 1, h: [-0.14, -0.32, -0.2], a: [-150, -36], two: 0, by: -0.25, bz: -0.09, bx: -0.06, hip: -0.52, sy: -0.56, sx: 0.18, sz: 0.04 },
      { u: 1.18, h: [-0.14, -0.33, -0.19], a: [-150, -36] },
      { u: 1.26, h: [-0.2, -0.34, 0.36], a: [-52, -30] },
      { u: 1.34, h: [-0.12, -0.24, 0.44], a: [-32, -16] },
      { u: 1.42, h: [0.04, -0.12, 0.53], a: [-6, -3], by: -0.32, bz: 0.14, bx: 0.03, hip: 0.12, sy: 0.08, sx: 0.34, sz: 0 },
      { u: 1.5, h: [0.2, 0, 0.5], a: [22, 12] },
      { u: 1.58, h: [0.32, 0.1, 0.43], a: [46, 25] },
      { u: 1.72, h: [0.4, 0.15, 0.35], a: [66, 34], by: -0.28, bz: 0.17, bx: 0.06, hip: 0.48, sy: 0.44, sx: 0.36 },
      { u: 1.9, h: [0.44, 0.18, 0.29], a: [80, 40] },
      { u: 2.12, h: [0.46, 0.19, 0.23], a: [92, 43], by: -0.3, bz: 0.18, bx: 0.06, hip: 0.58, sy: 0.54, sx: 0.38 },
      { u: 2.4, h: [0.46, 0.19, 0.18], a: [102, 44] },
      { u: 2.8, h: [0.45, 0.18, 0.18], a: [103, 43], two: 0, by: -0.28, bz: 0.16, bx: 0.05, hip: 0.53, sy: 0.5, sx: 0.35 },
    ],
  },
  /** a level forehand at the chest from far out on his right round to his left */
  lastSweep: {
    ...LAST, line: 'flat', slash: [[1.24, 1.56]], step: [0.1, 1.3],
    lF: [0.18, 0.6], rF: [-0.18, -0.48], fy: [0.3, -0.75], drag: 0.2,
    keys: [
      { u: 0.5, h: [-0.24, -0.06, 0.3], a: [-60, 10] },
      { u: 0.55, by: -0.16, bz: -0.1, bx: -0.07, hip: -0.62, sy: -0.66, sx: 0.12 },
      { u: 1, h: [-0.4, -0.12, 0.04], a: [-112, 4], two: 0, by: -0.18, bz: -0.09, bx: -0.06, hip: -0.55, sy: -0.6, sx: 0.12 },
      { u: 1.18, h: [-0.4, -0.12, 0.05], a: [-112, 4] },
      { u: 1.26, h: [-0.3, -0.12, 0.3], a: [-60, 2] },
      { u: 1.34, h: [-0.16, -0.12, 0.48], a: [-32, 2] },
      { u: 1.42, h: [0.02, -0.12, 0.54], a: [-6, 1], by: -0.26, bz: 0.14, bx: 0.03, hip: 0.1, sy: 0.06, sx: 0.26 },
      { u: 1.5, h: [0.2, -0.12, 0.5], a: [22, 2] },
      { u: 1.58, h: [0.34, -0.12, 0.4], a: [48, 3] },
      { u: 1.72, h: [0.4, -0.13, 0.32], a: [64, 3], by: -0.28, bz: 0.17, bx: 0.06, hip: 0.5, sy: 0.48, sx: 0.28 },
      { u: 1.9, h: [0.45, -0.14, 0.2], a: [84, 3] },
      { u: 2.12, h: [0.45, -0.15, 0.11], a: [103, 2], by: -0.3, bz: 0.18, bx: 0.06, hip: 0.62, sy: 0.58, sx: 0.3 },
      { u: 2.4, h: [0.44, -0.16, 0.06], a: [112, 1] },
      { u: 2.8, h: [0.43, -0.16, 0.06], a: [113, 1], two: 0, by: -0.28, bz: 0.16, bx: 0.05, hip: 0.56, sy: 0.54, sx: 0.28 },
    ],
  },
  /** a steep falling cut from high beside his right shoulder down through his front to low left */
  lastDrop: {
    ...LAST, line: 'down', slash: [[1.36, 1.7]], step: [0.1, 1.4],
    lF: [0.15, 0.56], rF: [-0.17, -0.48], fy: [0.15, -0.75], drag: 0.2,
    keys: [
      { u: 0.5, h: [-0.13, 0.14, 0.26], a: [-28, 42] },
      { u: 0.55, by: -0.03, bz: -0.1, bx: -0.07, hip: -0.55, sy: -0.6, sx: -0.08 },
      { u: 1, h: [-0.14, 0.26, -0.18], a: [-170, 45], two: 0, by: -0.06, bz: -0.08, bx: -0.06, hip: -0.45, sy: -0.5, sx: -0.06, sz: 0.06 },
      { u: 1.3, h: [-0.14, 0.26, -0.16], a: [-170, 45] },
      { u: 1.38, h: [-0.12, 0.22, 0.44], a: [-30, 42] },
      { u: 1.46, h: [-0.06, 0.1, 0.54], a: [-14, 22] },
      { u: 1.54, h: [0.02, -0.06, 0.56], a: [-4, 0], by: -0.3, bz: 0.14, bx: 0.03, hip: 0.02, sy: 0.02, sx: 0.4, sz: 0 },
      { u: 1.62, h: [0.08, -0.18, 0.52], a: [6, -18] },
      { u: 1.7, h: [0.14, -0.26, 0.48], a: [16, -28] },
      { u: 1.84, h: [0.2, -0.3, 0.42], a: [28, -32], by: -0.38, bz: 0.18, bx: 0.06, hip: 0.26, sy: 0.24, sx: 0.52 },
      { u: 2.02, h: [0.24, -0.32, 0.36], a: [40, -33] },
      { u: 2.15, by: -0.4, bz: 0.19, bx: 0.06, hip: 0.34, sy: 0.32, sx: 0.54 },
      { u: 2.4, h: [0.28, -0.32, 0.3], a: [54, -32] },
      { u: 2.8, h: [0.28, -0.31, 0.3], a: [55, -31], two: 0, by: -0.37, bz: 0.17, bx: 0.05, hip: 0.3, sy: 0.28, sx: 0.5 },
    ],
  },
  /** a level backhand low at the hips from his left to his right, on the longest step */
  lastLow: {
    ...LAST, line: 'low', slash: [[1.2, 1.52]], step: [0.05, 1.25],
    lF: [0.16, 0.66], rF: [-0.18, -0.5], fy: [0.2, -0.8], drag: 0.24,
    keys: [
      { u: 0.5, h: [0.12, -0.24, 0.3], a: [70, -6] },
      { u: 0.55, by: -0.28, bz: -0.1, bx: -0.07, hip: 0.62, sy: 0.64, sx: 0.28 },
      { u: 1, h: [0.26, -0.3, 0.1], a: [100, -6], two: 0, by: -0.3, bz: -0.08, bx: -0.06, hip: 0.55, sy: 0.58, sx: 0.26 },
      { u: 1.14, h: [0.26, -0.31, 0.11], a: [100, -6] },
      { u: 1.22, h: [0.34, -0.22, 0.32], a: [58, 2] },
      { u: 1.3, h: [0.2, -0.18, 0.48], a: [32, 4] },
      { u: 1.38, h: [0.02, -0.17, 0.54], a: [6, 5], by: -0.38, bz: 0.16, bx: 0.03, hip: -0.1, sy: -0.06, sx: 0.4 },
      { u: 1.46, h: [-0.16, -0.17, 0.52], a: [-22, 5] },
      { u: 1.54, h: [-0.26, -0.16, 0.5], a: [-48, 5] },
      { u: 1.68, h: [-0.36, -0.16, 0.42], a: [-66, 5], by: -0.4, bz: 0.19, bx: 0.06, hip: -0.5, sy: -0.46, sx: 0.42 },
      { u: 1.86, h: [-0.43, -0.16, 0.3], a: [-84, 5] },
      { u: 2.1, h: [-0.46, -0.16, 0.15], a: [-100, 5], by: -0.42, bz: 0.2, bx: 0.06, hip: -0.6, sy: -0.56, sx: 0.44 },
      { u: 2.4, h: [-0.46, -0.16, 0.08], a: [-110, 5] },
      { u: 2.8, h: [-0.45, -0.16, 0.08], a: [-111, 5], two: 0, by: -0.4, bz: 0.18, bx: 0.05, hip: -0.55, sy: -0.52, sx: 0.42 },
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
