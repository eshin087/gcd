// The steel look set (`?lights=steel`, combat.js setLights; ADR-207): the heavies after two, three and four lights.
// Every clip here follows the owner's reference footage pose for pose (both arms, the body, the feet),
// fitted to this game's own clock: no number of any attack changes. Clip format: swings.js.
//
//   Whirling Tempest   (HEAVY[2]) the footage's two-handed heavy, its first hit: from the two-handed guard
//                      (the blade up before him) the blade is cocked back over his right shoulder like a
//                      bat, low in a wide straddle, the chest wound to his right and leaning in; one flat
//                      sweep at shoulder height round his right side, across his front at full reach and
//                      on round to his left, the whole body unwinding until his back is half to the foe, the
//                      finish held out past his left side with the blade pointing back and a little down.
//                      Both hands on the grip, as the footage.
//   Mountain Splitter  (HEAVY[3]) the footage's two-handed heavy, its second hit: wound the other way, the
//                      hands before his left shoulder and the blade up and back over it, low in the
//                      straddle; the blade drops down past his left knee and comes up through his front in
//                      one rising diagonal to high over his right shoulder, the body unwinding to the right;
//                      then it falls on round behind his right side, the hands at his right hip, the point
//                      back and down, and he holds it. Both hands on the grip, as the footage.
//   Earthbreaker       (HEAVY[4]) the footage's jumping heavy: he leaps (the def's leap), the blade swept
//                      from low ahead back past his right side and up until the hand is cocked above and
//                      behind his right shoulder, the point up, the free arm reaching straight ahead; at
//                      the top the blade drops back behind his head, then comes over the top and straight
//                      down into the ground ahead as he lands in a deep squat, folded over the blade laid
//                      along the ground, the free hand down to the ground by his front foot. One-handed.

export const STEEL_HEAVIES_D = {
  /** Whirling Tempest (HEAVY[2]): the two-handed heavy's flat sweep (no turn of the feet). */
  steelTempest: {
    line: 'flat',
    home: 1.0,
    settle: 0.5,
    step: [0.2, 1.2],
    drag: 0.2,
    lF: [0.3, 0.52], fy: [0.55, -0.75],
    keys: [
      // the two-handed guard on the way: the blade up before him
      { u: 0.35, h: [-0.06, -0.1, 0.26], a: [-40, 68], two: 1, rp: [-0.7, -0.7, 0.0], by: -0.22, bz: -0.03, hip: -0.12, sy: -0.14, sx: 0.12, hs: 0 },
      // drawn back over his right shoulder, sinking into the straddle
      { u: 0.7, h: [-0.16, -0.12, 0.22], a: [-150, 66], two: 1, rp: [-0.4, -0.9, 0.0], by: -0.4, bz: -0.05, bx: -0.04, hip: -0.34, sy: -0.44, sx: 0.24 },
      // THE COIL (held while the button is): cocked like a bat, the hands before his right shoulder,
      // the point straight back over it, low in the wide straddle, wound to his right, leaning in
      { u: 1.0, h: [-0.18, -0.2, 0.16], a: [-172, 58], two: 1, rp: [-0.4, -0.9, -0.1], by: -0.5, bz: -0.06, bx: -0.05, hip: -0.46, sy: -0.58, sx: 0.3, sz: 0.06, hs: 0 },
      { u: 1.1, h: [-0.26, -0.12, 0.16], a: [-136, 30], two: 1, rp: [-0.5, -0.85, -0.1] },
      // round his right side, flat, at his shoulders
      { u: 1.2, h: [-0.3, -0.1, 0.2], a: [-96, 6], two: 1, rp: [-0.6, -0.8, -0.1] },
      // across his front at full reach, shoulder high
      { u: 1.45, h: [-0.02, -0.04, 0.52], a: [-8, 0], two: 1, rp: [-0.7, -0.65, -0.2], by: -0.52, bz: 0.1, bx: 0.0, hip: 0.12, sy: 0.18, sx: 0.32, sz: 0 },
      { u: 1.7, h: [0.3, -0.04, 0.4], a: [62, -2], two: 1, rp: [-0.35, -0.9, -0.2] },
      // THE END OF THE CUT: the arms out past his left side at shoulder height, the body unwound until his
      // back is half to the foe, the point back
      { u: 2.0, h: [0.48, -0.04, 0.12], a: [112, -4], two: 1, rp: [-0.1, -0.95, -0.3], by: -0.5, bz: 0.12, bx: 0.05, hip: 0.8, sy: 1.08, sx: 0.28, sz: -0.06 },
      { u: 2.15, by: -0.53, bz: 0.13, bx: 0.06, hip: 0.88, sy: 1.2, sx: 0.3 },
      // carried on round a little, then held while the body settles
      { u: 2.32, h: [0.48, -0.06, 0.02], a: [128, -6], two: 1, rp: [-0.1, -0.95, -0.3], by: -0.5, hip: 0.86, sy: 1.16 },
      { u: 2.5, h: [0.47, -0.09, 0.03], a: [126, -9], two: 1, by: -0.48, hip: 0.82, sy: 1.1, sx: 0.27 },
      { u: 2.72, h: [0.46, -0.11, 0.04], a: [124, -11], two: 1, rp: [-0.15, -0.95, -0.25], by: -0.46, bz: 0.11, hip: 0.78, sy: 1.04, sx: 0.26 },
      { u: 2.96, h: [0.45, -0.13, 0.05], a: [121, -13], two: 1, rp: [-0.2, -0.95, -0.2], by: -0.44, bz: 0.1, hip: 0.73, sy: 0.97, sx: 0.24 },
    ],
  },
  /** Mountain Splitter (HEAVY[3]): the two-handed heavy's second hit, a rising diagonal from his left. */
  steelSplitter: {
    line: 'right',
    home: 1.0,
    settle: 0.5,
    step: [0.2, 1.3],
    drag: 0.2,
    lF: [0.3, 0.52], fy: [0.5, -0.75],
    keys: [
      // the blade gathered up before him on its way over his left shoulder
      { u: 0.45, h: [0.12, -0.12, 0.26], a: [40, 56], two: 1, rp: [-0.5, -0.85, 0.1], by: -0.28, bz: -0.04, hip: 0.16, sy: 0.22, sx: 0.14, hs: 0 },
      // THE COIL (held while the button is): the hands before his left shoulder, the blade up and back
      // over it, low in the straddle, wound to his left, leaning in
      { u: 1.0, h: [0.26, -0.06, 0.18], a: [150, 52], two: 1, rp: [-0.2, -0.95, 0.1], by: -0.5, bz: -0.06, bx: -0.05, hip: 0.46, sy: 0.6, sx: 0.28, sz: -0.06, hs: 0 },
      // dropped down past his left knee
      { u: 1.2, h: [0.26, -0.3, 0.3], a: [72, -36], two: 1, rp: [-0.3, -0.9, -0.1] },
      // rising through his front
      { u: 1.45, h: [0.04, -0.2, 0.5], a: [0, -8], two: 1, rp: [-0.6, -0.75, -0.2], by: -0.5, bz: 0.1, bx: 0.0, hip: 0.0, sy: 0.02, sx: 0.32, sz: 0 },
      { u: 1.7, h: [-0.16, 0.06, 0.44], a: [-48, 34], two: 1, rp: [-0.75, -0.6, -0.1] },
      // THE END OF THE CUT: high over his right shoulder, the body unwound to the right
      { u: 2.0, h: [-0.2, 0.24, 0.26], a: [-88, 58], two: 1, rp: [-0.8, -0.55, 0.0], by: -0.44, bz: 0.12, bx: 0.05, hip: -0.36, sy: -0.48, sx: 0.18, sz: 0.06 },
      { u: 2.15, by: -0.47, bz: 0.13, bx: 0.06, hip: -0.44, sy: -0.58, sx: 0.2 },
      // falling on round behind his right side
      { u: 2.34, h: [-0.28, -0.08, -0.04], a: [-132, 12], two: 1, rp: [-0.6, -0.7, -0.4], by: -0.46, hip: -0.42, sy: -0.54 },
      // the hands at his right hip, the point back and down: held, settling
      { u: 2.52, h: [-0.26, -0.3, -0.06], a: [-128, -22], two: 1, rp: [-0.5, -0.6, -0.65], by: -0.44, hip: -0.38, sy: -0.48, sx: 0.24 },
      { u: 2.72, h: [-0.25, -0.32, -0.04], a: [-122, -25], two: 1, rp: [-0.5, -0.6, -0.65], by: -0.42, bz: 0.1, hip: -0.35, sy: -0.44, sx: 0.23 },
      { u: 2.96, h: [-0.24, -0.33, -0.02], a: [-118, -27], two: 1, rp: [-0.5, -0.6, -0.65], by: -0.4, bz: 0.1, hip: -0.32, sy: -0.4, sx: 0.22 },
    ],
  },
  /** Earthbreaker (HEAVY[4]): the jumping heavy (the def's leap and shards kept). */
  steelBreaker: {
    line: 'down',
    flat: [1, 0, 0],
    home: 1.0,
    settle: 0.55,
    step: [0.45, 1.5],
    drag: 0.25,
    lF: [0.26, 0.42], fy: [0.45, -0.6],
    fold: 0,
    keys: [
      // the take-off crouch, the blade still low ahead (at u 0.34, not earlier: the hips sinking and
      // turning before the leaping foot was ready slid the other foot 17 cm across the grass)
      { u: 0.34, h: [-0.08, -0.34, 0.24], a: [-30, -24], by: -0.2, bz: -0.04, hip: -0.1, sy: -0.12, sx: 0.22, l: [0.04, -0.4, 0.14], hs: 0 },
      // swept back past his right side at the chest as he leaves the ground, the arm going back with it
      { u: 0.42, h: [-0.24, -0.1, -0.1], a: [-125, 0], by: -0.06, hip: -0.16, sy: -0.22, sx: 0.08 },
      { u: 0.66, h: [-0.18, 0.08, -0.18], a: [180, 34], l: [-0.02, -0.16, 0.4] },
      // THE COIL (held while the button is): the hand cocked above and behind his right shoulder, the
      // point up, the free arm straight ahead at the chest, the back a little arched
      { u: 1.0, h: [-0.06, 0.3, -0.16], a: [-165, 64], by: -0.02, bz: -0.03, hip: -0.16, sy: -0.3, sx: -0.14, l: [-0.06, -0.1, 0.46], hs: 0 },
      // at the top the point drops back behind his head (the whip before the blow)
      { u: 1.14, h: [-0.02, 0.48, 0.0], a: [145, 18] },
      // over the top, the free arm dropping
      { u: 1.32, h: [0.0, 0.44, 0.3], a: [0, 74], by: -0.08, sx: 0.12, l: [0.12, -0.16, 0.3] },
      // down through his front into the ground ahead as he lands
      { u: 1.55, h: [0.0, -0.12, 0.52], a: [0, -14], by: -0.34, bz: 0.1, hip: 0.0, sy: -0.12, sx: 0.5, l: [0.14, -0.3, 0.26], hs: 0 },
      // THE LANDING: a deep squat folded over the blade laid along the ground, the free hand down to the
      // ground by his front foot
      { u: 2.0, h: [-0.02, -0.4, 0.38], a: [0, -6], by: -0.56, bz: 0.12, hip: -0.04, sy: -0.2, sx: 0.58, hx: 0.2, hy: -0.2, l: [0.08, -0.48, 0.26], hs: 0 },
      // the weight goes on down into the squat, the blade sliding on
      { u: 2.2, h: [-0.04, -0.44, 0.42], a: [2, -8], by: -0.62, bz: 0.14, sx: 0.64, l: [0.08, -0.5, 0.28] },
      { u: 2.38, h: [-0.05, -0.42, 0.38], a: [0, -10], by: -0.58, sx: 0.6, l: [0.08, -0.48, 0.26] },
      // held in the squat to the end of the recovery, easing up a little (settle: he rises out of it)
      { u: 2.6, h: [-0.06, -0.41, 0.36], a: [-2, -11], by: -0.55, bz: 0.12, sx: 0.57, hx: 0.16, hy: -0.16, l: [0.08, -0.47, 0.25] },
      { u: 2.8, h: [-0.06, -0.4, 0.34], a: [-4, -13], by: -0.52, bz: 0.11, sx: 0.54, hx: 0.12, hy: -0.12, l: [0.08, -0.45, 0.23] },
      { u: 2.97, h: [-0.07, -0.39, 0.32], a: [-5, -15], by: -0.49, bz: 0.1, sx: 0.5, hx: 0.08, hy: -0.08, l: [0.08, -0.43, 0.2], hs: 0 },
    ],
  },
};

/** The looks of HEAVY[2], HEAVY[3], HEAVY[4] (`null`: today's look, until the clip is written). */
export const HEAVY_STEEL_D = [
  { anim: { kind: 'clip', clip: 'steelTempest' }, variants: [] },
  { anim: { kind: 'clip', clip: 'steelSplitter' }, variants: [] },
  { anim: { kind: 'clip', clip: 'steelBreaker', hop: 0.5, tuck: 1.5 }, variants: [] },
];
