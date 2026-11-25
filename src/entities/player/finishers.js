// The blink chain's last hit (hit 5 of `?lights=blink`, combat.js LIGHT_BLINK): three for the owner to
// pick from, `?finisher=flurry|delayed|double` (the Lab's PLAYER → `finisher` row). Data only (no
// imports): combat.js reads the pick's anim block, swings.js spreads the clips into SWINGS.
// The owner (2026-11-25): "make sure the last attack looks different from the heavy attack", "lets
// ignore the last hit special effects and focus on just the auto attack". So every one is a PLAIN blade
// hit (`plain`: player.js _slamImpact bursts no shards for it, no ground blow, nothing extra), ONE-HANDED
// (`two: 0`), with no leap, no spin and no ground slam, the free hand still on the belt (`belt`): the
// speed is the show. The cuts are INSTANT (a snap to the cut's start, a cross of a frame or two, the
// blade still after), and each draws its slash line on the blade's own path (blinkFx.js; the cut keys'
// blade directions solved by integ.mjs `blinksolve` so the point runs straight). The heavies are the
// other kind: two-handed, a long still hold, a planted step and a thick violet line (heaviesBlink.js).
//   flurry   he barely moves: the blade snaps between poses a frame apart and five slash lines
//            criss-cross the target in a blink (a falling X, a level cut, a rising one, a shallow
//            rising one; the fourth falls in the hit's active frames)
//   delayed  he stands still with the hand at the left hip, one instant rising cut across his front,
//            he stops dead with the blade high past the target, and its line appears a beat later
//            (0.15 s: the damage is dealt on the blade's frame; only the picture is late)
//   double   two instant cuts back to back in the active frames, a falling one from high right to low
//            left, then a rising one from low right to high left, that leave an X; one frame between
// The arm turns more than 60° in a frame in this style, by design.

export const FINISHER_IDS = Object.freeze(['flurry', 'delayed', 'double']);
export const FINISHER_NAMES = Object.freeze({ flurry: 'blink flurry', delayed: 'delayed cut', double: 'double cut (an X)' });

/** The anim block hit 5 plays for each pick (combat.js LIGHT_BLINK[4].anim): no hop, no spin, no turn. */
export const FINISHER_ANIMS = Object.freeze({
  flurry: Object.freeze({ kind: 'clip', clip: 'finFlurry' }),
  delayed: Object.freeze({ kind: 'clip', clip: 'finDelayed' }),
  double: Object.freeze({ kind: 'clip', clip: 'finDouble' }),
});

const ONE = { two: 0 };
const LAST = { plain: true, belt: true };

/** The last hits' clips (swings.js format), spread into SWINGS. Hit 5's clock (combat.js LIGHT[4]:
 *  windup 0.28, active 0.13) puts the frames, at 60 a second, at u ≈ 0.60 0.66 0.72 0.79 0.86 0.94,
 *  then 1.02 1.12 1.26 1.41 1.57 1.72 1.85 1.96: each cut's ends sit on two of them. The cut that must
 *  land (combat.js LIGHT[4]'s low reach band, `up` 1) crosses his front late in the active frames, when
 *  the lunge has carried him in, the blade ahead and rising on one frame. */
export const FINISHER_CLIPS = {
  /** FLURRY: a small, still gather; then five cuts a frame or two long, each a snap from the last. The
   *  body barely moves. He ends with the blade high on his right before him. */
  finFlurry: {
    ...LAST, line: 'flat', home: 0.45,
    slash: [[0.6, 0.72], [0.79, 0.93], [1.0, 1.24], [1.38, 1.55], [1.66, 1.96]],
    lF: [0.16, 0.46], rF: [-0.18, -0.44], fy: [0.25, -0.75], drag: 0.18,
    keys: [
      { u: 0.35, h: [-0.06, 0.02, 0.3], a: [-60, 20], two: 0, by: -0.18, bz: -0.04, bx: -0.03, hip: -0.12, sy: -0.14, sx: 0.18 },
      { u: 0.6, h: [-0.06, 0.08, 0.42], a: [-1.2, 26], two: 0, by: -0.2, bz: 0, hip: -0.06, sy: -0.06, sx: 0.22 },
      { u: 0.66, h: [-0.002, 0.002, 0.35], a: [11.4, 3] },
      { u: 0.72, h: [0.12, -0.14, 0.42], a: [21.5, -15.5] },
      { u: 0.79, h: [0.16, 0.08, 0.42], a: [49, 22.3], by: -0.21, hip: 0.04, sy: 0.04, sx: 0.24 },
      { u: 0.86, h: [0.024, -0.018, 0.259], a: [16.4, 3] },
      { u: 0.93, h: [-0.06, -0.14, 0.42], a: [-11.5, -14.4] },
      { u: 1, h: [0.16, 0, 0.42], a: [43.6, 6.1], by: -0.22, hip: 0.02, sy: 0.04, sx: 0.25 },
      { u: 1.12, h: [-0.023, 0, 0.32], a: [17.4, 7.2] },
      { u: 1.24, h: [-0.14, 0, 0.42], a: [-9.5, 8.5] },
      { u: 1.38, h: [0, -0.18, 0.42], a: [-1.8, -21.4], by: -0.24, bz: 0.04, hip: -0.04, sy: -0.02, sx: 0.27 },
      { u: 1.465, h: [0.024, -0.016, 0.292], a: [11.5, 1.1] },
      { u: 1.55, h: [0.06, 0.06, 0.42], a: [29.1, 29.1] },
      { u: 1.66, h: [0.12, -0.08, 0.42], a: [22.7, -23], by: -0.25, bz: 0.05, hip: 0.04, sy: 0.04, sx: 0.28 },
      { u: 1.81, h: [-0.043, 0.061, 0.256], a: [9.9, 4.1] },
      { u: 1.96, h: [-0.1, 0.08, 0.44], a: [-8.6, 41.6] },
      { u: 2.15, h: [-0.1, 0.08, 0.432], a: [-8, 41.9], by: -0.26, bz: 0.06, hip: -0.06, sy: -0.06, sx: 0.29 },
      { u: 2.6, h: [-0.1, 0.08, 0.424], a: [-7.4, 42.2], two: 0, by: -0.25, bz: 0.05, hip: -0.05, sy: -0.05, sx: 0.27 },
    ],
  },


  /** DELAYED: the sword hand drawn to the left hip, the blade back along the thigh as if still in its
   *  sheath, the body sunk and still; one instant rising cut across his front, and he stops dead with
   *  the blade high past the target on his right, and holds it while the line "arrives". */
  finDelayed: {
    ...LAST, line: 'right', home: 0.62,
    slash: [[1.24, 1.4, 0.15]],
    lF: [0.18, 0.5], rF: [-0.18, -0.46], fy: [0.35, -0.8], drag: 0.16,
    keys: [
      { u: 0.4, h: [0.3, -0.36, 0.14], a: [150, -24], two: 0, by: -0.3, bz: -0.08, bx: -0.05, hip: 0.4, sy: 0.44, sx: 0.32 },
      { u: 1.14, h: [0.3, -0.37, 0.14], a: [151, -24], two: 0, by: -0.32, bz: -0.08, bx: -0.05, hip: 0.42, sy: 0.46, sx: 0.34 },
      { u: 1.24, h: [0.22, -0.2, 0.42], a: [32.9, -15.6] },
      { u: 1.28, h: [0.119, -0.136, 0.358], a: [26.2, -9.5] },
      { u: 1.32, h: [0.037, -0.07, 0.313], a: [19.1, -3.2], by: -0.3, bz: 0.1, hip: -0.1, sy: -0.08, sx: 0.34 },
      { u: 1.36, h: [-0.027, -0.008, 0.29], a: [11.4, 2.9] },
      { u: 1.4, h: [-0.08, 0.046, 0.286], a: [3.2, 10.1] },
      { u: 1.46, h: [-0.122, 0.087, 0.318], a: [-5.6, 17.6] },
      { u: 1.52, h: [-0.16, 0.12, 0.4], a: [-16, 27], two: 0, by: -0.3, bz: 0.13, bx: 0.05, hip: -0.36, sy: -0.36, sx: 0.3 },
      { u: 2, h: [-0.16, 0.12, 0.392], a: [-15.4, 27.3], two: 0, by: -0.3, bz: 0.13, hip: -0.36, sy: -0.36, sx: 0.3 },
      { u: 2.6, h: [-0.16, 0.12, 0.384], a: [-14.8, 27.6], two: 0, by: -0.29, bz: 0.12, hip: -0.35, sy: -0.35, sx: 0.29 },
    ],
  },

  /** DOUBLE: cocked high beside the right shoulder, still; one instant falling cut across his front to
   *  low left, a snap of the wrist across to low on his right, and the rising cut back across to high
   *  left: an X, one frame between them. He holds the second cut's finish, the blade raised. */
  finDouble: {
    ...LAST, line: 'right', home: 0.55,
    slash: [[1.1, 1.4], [1.5, 1.86]],
    lF: [0.15, 0.48], rF: [-0.17, -0.46], fy: [0.15, -0.75], drag: 0.16,
    keys: [
      { u: 0.45, h: [-0.06, 0.17, 0.08], a: [-130, 38], two: 0, by: -0.12, bz: -0.07, bx: -0.05, hip: -0.34, sy: -0.4, sx: 0 },
      { u: 1.02, h: [-0.06, 0.18, 0.08], a: [-131, 38], two: 0, by: -0.13, bz: -0.07, bx: -0.05, hip: -0.36, sy: -0.42, sx: 0 },
      { u: 1.1, h: [-0.06, 0.12, 0.42], a: [-3.4, 31.5] },
      { u: 1.18, h: [-0.044, 0.092, 0.286], a: [3.1, 16.1] },
      { u: 1.26, h: [-0.006, 0.036, 0.274], a: [9.3, 3], by: -0.2, bz: 0.04, hip: 0, sy: 0, sx: 0.24 },
      { u: 1.34, h: [0.055, -0.045, 0.326], a: [14.7, -8.2] },
      { u: 1.42, h: [0.16, -0.14, 0.42], a: [20.4, -18.7] },
      { u: 1.5, h: [-0.1, -0.16, 0.42], a: [-30.3, -25.2], by: -0.22, bz: 0.06, hip: 0.08, sy: 0.08, sx: 0.26 },
      { u: 1.6, h: [0.052, 0.003, 0.224], a: [-20, -11.7] },
      { u: 1.7, h: [0.098, 0.066, 0.094], a: [-8.2, 6.2], by: -0.24, bz: 0.08, hip: 0, sy: 0, sx: 0.3 },
      { u: 1.8, h: [0.086, 0.081, 0.171], a: [9, 29.4] },
      { u: 1.9, h: [0.12, 0.16, 0.46], a: [36.9, 52.2], two: 0, by: -0.26, bz: 0.1, bx: 0.05, hip: -0.2, sy: -0.2, sx: 0.32 },
      { u: 2.1, h: [0.12, 0.16, 0.452], a: [37.5, 52.5], two: 0 },
      { u: 2.25, by: -0.28, bz: 0.11, hip: -0.24, sy: -0.24, sx: 0.34 },
      { u: 2.6, h: [0.12, 0.16, 0.444], a: [38.1, 52.8], two: 0, by: -0.26, bz: 0.1, hip: -0.21, sy: -0.21, sx: 0.31 },
    ],
  },


};

const q = (name) => {
  try {
    return typeof location !== 'undefined' ? new URLSearchParams(location.search).get(name) : null;
  } catch {
    return null;
  }
};
const PICK = { id: FINISHER_IDS.includes(q('finisher')) ? q('finisher') : 'flurry' };
/** The last hit picked now. */
export const finisherId = () => PICK.id;
/** Set it (combat.js setFinisherLook also re-points hit 5); false for an unknown id. */
export function pickFinisher(id) {
  const m = String(id);
  if (!FINISHER_IDS.includes(m)) return false;
  PICK.id = m;
  return true;
}
