// The steel look set (`?lights=steel`, combat.js setLights; ADR-202): the execution and One Breath.
// Every clip here follows the owner's reference footage pose for pose (both arms, the body, the feet),
// fitted to this game's own clock: no number of any attack changes. Clip format: swings.js.
//
//   steelDraw   One Breath (ONE_BREATH: windup 0.04 s, active 0.1, recovery 0.55; a 5 m blink step):
//               the reference's running heavy. From the draw's coil (flurryPose 'coil', unchanged) the
//               sword goes up over his right shoulder, the blade cocked up and back behind his head,
//               the free hand reaching ahead at the foe; then one big falling diagonal, from high right
//               across his front to low left, the hips and chest whipping round to the left, and he
//               lands in a deep wide lunge bent over the front knee, the sword hand low before the
//               front knee with the point down by the ground at his left, the free arm thrown out to
//               his left at shoulder height.

export const STEEL_SPECIALS_E = {
  steelDraw: {
    // (held to the end of the recovery, drifting, then he rises out of it over `settle` s)
    line: 'right', home: 1.0, settle: 0.5,
    rF: [-0.26, -0.42], lF: [0.25, 0.46], fy: [0.35, -0.7],
    keys: [
      // the deepest windup: the hand up by the right temple, the blade cocked up and back behind the
      // head; the free hand leaves the grip and reaches ahead at the foe; the chest wound to the right
      // (on the way up, the blade rides back over the hand: from the coil's low point it stood square to the forearm)
      { u: 0.6, h: [-0.22, -0.08, 0.02], a: [-140, 30], rp: [-0.9, -0.4, -0.2] },
      { u: 1.0, h: [-0.2, 0.22, 0.08], a: [-152, 58], rp: [-0.9, -0.2, -0.3], l: [0.0, -0.26, 0.3], lp: [0.5, -0.8, -0.2], hs: 0, two: 0, by: -0.1, bz: -0.03, hip: -0.36, sy: -0.34, sx: 0.04 },
      { u: 1.2, h: [-0.18, 0.27, 0.1], a: [-168, 62], rp: [-0.9, -0.1, -0.3], l: [0.08, -0.14, 0.4], by: -0.08, bz: -0.02, hip: -0.4, sy: -0.38, sx: 0.0 },
      // the fall: the hand drives out and down across his front, the blade still trailing over the shoulder ...
      { u: 1.4, h: [-0.06, 0.02, 0.4], a: [-60, 40], rp: [-0.85, -0.4, -0.2], l: [0.2, -0.12, 0.3], by: -0.16, bz: 0.04, hip: -0.05, sy: -0.08, sx: 0.2 },
      // ... and comes through: the blade crosses his front falling from right to left
      { u: 1.6, h: [0.08, -0.18, 0.47], a: [10, -8], rp: [-0.7, -0.7, -0.1], l: [0.32, -0.08, 0.16], by: -0.26, bz: 0.08, hip: 0.25, sy: 0.25, sx: 0.4 },
      { u: 1.8, h: [0.19, -0.34, 0.36], a: [52, -38], rp: [-0.5, -0.85, 0.1], l: [0.42, -0.04, 0.02], by: -0.33, bz: 0.1, hip: 0.5, sy: 0.52, sx: 0.52 },
      // the end of the cut: the hand low before the front knee, the point down by the ground at his left
      { u: 2.0, h: [0.2, -0.44, 0.26], a: [80, -52], rp: [-0.4, -0.9, 0.1], l: [0.44, 0.0, -0.08], lp: [0.3, -0.7, -0.6], by: -0.37, bz: 0.11, hip: 0.68, sy: 0.72, sx: 0.58 },
      // the follow-through: the blade runs on round to his left and back, low; the body overshoots
      { u: 2.15, h: [0.2, -0.46, 0.2], a: [108, -50], by: -0.39, bz: 0.11, hip: 0.8, sy: 0.86, sx: 0.6 },
      { u: 2.35, h: [0.2, -0.46, 0.15], a: [125, -48], l: [0.42, 0.0, -0.12], by: -0.37, hip: 0.78, sy: 0.82, sx: 0.56 },
      { u: 2.6, h: [0.18, -0.47, 0.15], a: [128, -46], l: [0.4, -0.04, -0.12], by: -0.35, bz: 0.1, hip: 0.72, sy: 0.76, sx: 0.52 },
      { u: 2.97, h: [0.17, -0.46, 0.16], a: [126, -44], l: [0.38, -0.08, -0.1], by: -0.32, bz: 0.09, hip: 0.68, sy: 0.7, sx: 0.47 },
    ],
  },
  // The execution (THRUST: windup 0.07 s, active 0.2, recovery 0.45; the kill on its first active
  // frame, its dash): the reference's riposte (its standing riposte from behind and from his side).
  // The sword hand draws back to the right hip, the blade level, the free hand up ahead; he drives
  // the point in at the foe's middle (out on the kill frame), then presses in close behind it, hunched,
  // the sword hand coming back to his own waist with the blade through the foe, level, the free hand up
  // on the foe's shoulder; then he pulls the blade out back past his right hip, the free hand
  // pushing the foe off, the point dropping, and rises.
  steelExec: {
    line: 'point', home: 1.0, settle: 0.5,
    rF: [-0.17, -0.5], lF: [0.15, 0.5], fy: [0.1, -0.8], drag: 0.12,
    keys: [
      { u: 0.55, h: [-0.12, -0.3, -0.05], a: [-4, 2], rp: [-0.6, -0.6, -0.5], l: [0.16, -0.38, 0.2], lp: [0.6, -0.7, -0.2], hs: 0, two: 0, by: -0.15, bz: -0.06, hip: -0.36, sy: -0.4, sx: 0.15 },
      { u: 1.0, h: [-0.02, -0.2, 0.5], a: [2, 0], rp: [-0.6, -0.75, -0.2], l: [0.2, -0.2, 0.3], lp: [0.7, -0.6, -0.3], by: -0.26, bz: 0.12, hip: 0.16, sy: 0.2, sx: 0.36 },
      // pressed in close behind the point: the hand back to his waist, the blade through, level
      { u: 1.35, h: [-0.04, -0.27, 0.34], a: [4, -2], rp: [-0.55, -0.8, -0.25], l: [0.06, -0.04, 0.42], lp: [0.6, -0.75, -0.2], by: -0.32, bz: 0.18, hip: 0.24, sy: 0.3, sx: 0.5 },
      { u: 1.8, h: [-0.04, -0.28, 0.33], a: [4, -3], l: [0.06, -0.05, 0.42], by: -0.33, bz: 0.18, hip: 0.24, sy: 0.3, sx: 0.52 },
      // the pull-out: back along the blade's line, past the right hip; the free hand pushes him off
      { u: 2.05, h: [-0.1, -0.29, 0.18], a: [-6, -6], by: -0.31, bz: 0.15, hip: 0.14, sy: 0.18, sx: 0.46 },
      { u: 2.3, h: [-0.18, -0.32, -0.02], a: [-35, -22], rp: [-0.5, -0.6, -0.6], l: [0.08, -0.12, 0.47], by: -0.26, bz: 0.1, hip: -0.06, sy: -0.06, sx: 0.34 },
      { u: 2.6, h: [-0.14, -0.42, -0.02], a: [-80, -50], l: [0.1, -0.28, 0.3], by: -0.2, bz: 0.06, hip: -0.12, sy: -0.12, sx: 0.24 },
      { u: 2.97, h: [-0.12, -0.45, 0.0], a: [-78, -52], l: [0.12, -0.36, 0.24], by: -0.17, bz: 0.05, hip: -0.1, sy: -0.1, sx: 0.2 },
    ],
  },
};

/** The execution's and One Breath's looks (`null`: today's look, until the clip is written). */
export const SPECIAL_STEEL_E = {
  exec: { anim: { kind: 'clip', clip: 'steelExec', feet: 'dash', dashW: true }, variants: [] },
  draw: { anim: { kind: 'clip', clip: 'steelDraw', feet: 'dash', dashW: true }, variants: [] },
};
