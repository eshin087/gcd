// The natural swings (`?arm=fk`, ADR-240): the sword arm keyed by its JOINTS (armFK.js `j`: [upper arm
// az, el, turn, elbow, forearm twist, wrist deviation, wrist flexion], degrees, in the chest's frame), the
// body by the usual fields. The prototype: light hit 1 only, a falling diagonal from over the right
// shoulder to low on his left, played at a real cut's speed and with its order: the hips open first, the
// chest after them, the shoulder a frame ahead of the elbow, the forearm's roll and the wrist's uncock a
// frame behind (anim.js FK_LAG), so the hand leads and the blade comes through last.
//   COIL     (u 0.8 … 1) the hand by his right ear, the elbow out at shoulder height, the palm up (the
//            forearm supinated), the wrist cocked back: the blade lies back over the right shoulder
//   CUT      (u 1 … 1.65, 4 frames) the elbow drops and leads, the hand runs out at chest height, the
//            forearm rolls toward palm-down, the wrist uncocks; the arm reaches (nearly straight, the
//            shoulder forward) as the blade crosses his front
//   FOLLOW   (to u 2.1) the arm carries on across to his left hip, the elbow softening, the palm down, the
//            point trailing back past the left leg; the chest turns on over the front foot
//   SETTLE   then home (`home` 0.5)
// The keys were solved (scratch tool, the ADR) for hand places and blade directions near the instant cut's
// own (lightsBlink.js blinkFall), inside the joints' ranges, the forearm's roll prescribed; so the swing
// covers the same ground as the cut it stands in for, with a real arm. The instant slash (blinkFx.js
// `slash`) is drawn where the point passes, as the instant cuts do.
// Clip format: swings.js's header.

const CUT = { home: 0.5, step: [0.08, 1.2], gather: [0.7, 0.5], lead: [0, 0], side: true };

export const LIGHTS_NATURAL = {
  /** hit 1: from over the right shoulder, a falling diagonal across his front to low left */
  natFall: {
    line: 'right', ...CUT, slash: [[1.3, 1.7]], fkLag: [0, 0, 0],
    lF: [0.15, 0.5], rF: [-0.17, -0.46], fy: [0.15, -0.75], drag: 0.16,
    keys: [
      { u: 0.6, by: -0.05, bz: -0.08, bx: -0.06, hip: -0.46, sy: -0.54, sx: -0.06 },
      { u: 0.8, j: [-19, 1, -18, 114, -65, -32, -36] },
      { u: 1.0, j: [-19, 1, -18, 114, -65, -32, -36], by: -0.08, bz: -0.06, bx: -0.05, hip: -0.38, sy: -0.46, sx: -0.04, sz: 0.05 },
      { u: 1.12, j: [-31, 2, -7, 109, -60, -32, -40], by: -0.1, bz: -0.04, hip: -0.25, sy: -0.38, sx: 0.04 },
      { u: 1.24, j: [-21, -8, 2, 97, -45, -32, -44], by: -0.13, bz: 0.0, hip: -0.08, sy: -0.22, sx: 0.16 },
      { u: 1.36, j: [-4, -28, -9, 80, -25, -32, -34], by: -0.17, bz: 0.05, bx: 0.0, hip: 0.08, sy: -0.06, sx: 0.28 },
      { u: 1.48, j: [-3, -29, -27, 37, 15, -35, -5], by: -0.22, bz: 0.1, bx: 0.02, hip: 0.22, sy: 0.12, sx: 0.4 },
      { u: 1.6, j: [-15, -24, 13, 23, 38, -35, 9], by: -0.27, bz: 0.12, bx: 0.04, hip: 0.31, sy: 0.24, sx: 0.44 },
      { u: 1.75, j: [-18, -17, 32, 31, 55, -32, 18], by: -0.3, bz: 0.13, bx: 0.05, hip: 0.37, sy: 0.33, sx: 0.44 },
      { u: 2.05, j: [-14, -28, 24, 34, 70, -28, 15], by: -0.32, bz: 0.14, bx: 0.05, hip: 0.43, sy: 0.42, sx: 0.43, sz: -0.065 },
      { u: 2.45, j: [-20, -39, 20, 43, 72, -30, 16], by: -0.31, bz: 0.13, bx: 0.05, hip: 0.48, sy: 0.5, sx: 0.42, sz: -0.07 },
    ],
  },
};
