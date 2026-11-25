// The blink chain's last hit (hit 5 of `?lights=blink`, combat.js LIGHT_BLINK): three for the owner to
// pick from, `?finisher=flurry|delayed|flick` (the Lab's PLAYER → `finisher` row). Data only (no
// imports): combat.js reads the pick's anim block, swings.js spreads the clips into SWINGS, finisherFx.js
// draws its slash lines and the ending (`?ender=`), and gives it its little extra reach.
// The owner (2026-11-25): "sharper angles and faster attacks, almost like the main character is doing
// instant slashes to show how fast he is", "the last combo hit still looks similar to the heavy attack".
// So every one is ONE-HANDED (`two: 0`), with no big wind-up swing, no leap, no spin and no ground slam:
// the speed is the show. The cuts are INSTANT (snap, dwell, snap): the blade snaps to just short of
// pointing ahead, crosses his front over about two frames (the frame that hits: the hit test sweeps the
// blade in straight lines between frames, so a whole cut in one frame would shorten its reach), then
// snaps to the finish; a sharp slash line hangs where it passed (finisherFx.js). The arm turns more than
// 60° in a frame in this style, by design.
//   flurry   he barely seems to move: the blade snaps between poses a frame apart, and five slash lines
//            criss-cross the target in a blink
//   delayed  one instant draw cut from the left hip, then he stands still, the blade held out; a beat
//            later the cut "arrives": its line opens and the ending goes off (the damage is dealt on the
//            blade's frame; only the picture is late)
//   flick    one instant cut, then a flick of the blade clean and a turn of the shoulder away from the
//            target (combat.js `turn`, about 65°), the ending going off behind him

export const FINISHER_IDS = Object.freeze(['flurry', 'delayed', 'flick']);
export const FINISHER_NAMES = Object.freeze({ flurry: 'blink flurry', delayed: 'delayed cut', flick: 'flick and turn away' });

/** The anim block hit 5 plays for each pick (combat.js LIGHT_BLINK[4].anim): no hop, no spin. */
export const FINISHER_ANIMS = Object.freeze({
  flurry: Object.freeze({ kind: 'clip', clip: 'finFlurry' }),
  delayed: Object.freeze({ kind: 'clip', clip: 'finDelayed' }),
  flick: Object.freeze({ kind: 'clip', clip: 'finFlick', turn: 1.15 }),
});

const ONE = { two: 0 };

/** The last hits' clips (swings.js format), spread into SWINGS. No key between u 1.44 and 1.56 with a
 *  blade: the instant cuts cross his front between two keys a couple of frames apart. */
export const FINISHER_CLIPS = {
  /** FLURRY: a small, still gather, the blade low by the right hip; then the blade snaps between poses a
   *  frame apart (high right, low left, low right, just short of ahead, across, high left) while the
   *  body barely moves; the fourth crossing is the honest one, over two frames. He ends with the blade
   *  low before him, the free hand at his chest. */
  finFlurry: {
    line: 'flat',
    home: 0.4,
    lF: [0.16, 0.46], rF: [-0.18, -0.44], fy: [0.25, -0.75], drag: 0.18,
    keys: [
      { u: 0.45, h: [-0.12, -0.28, 0.1], a: [-80, -12], ...ONE, by: -0.18, bz: -0.06, bx: -0.04, hip: -0.24, sy: -0.28, sx: 0.16, fh: 'chest' },
      { u: 0.9, h: [-0.12, -0.28, 0.12], a: [-82, -12], ...ONE, by: -0.2, bz: -0.06, hip: -0.26, sy: -0.3, sx: 0.18 },
      { u: 1.0, h: [-0.08, 0.12, 0.3], a: [-118, 38] },
      { u: 1.13, h: [0.16, -0.22, 0.4], a: [62, -30], by: -0.24, hip: -0.06, sy: -0.06, sx: 0.26 },
      { u: 1.26, h: [-0.14, -0.2, 0.36], a: [-72, -18] },
      { u: 1.38, h: [0.0, 0.02, 0.44], a: [-30, 16], by: -0.26, hip: -0.12, sy: -0.12, sx: 0.28 },
      { u: 1.62, h: [0.16, -0.1, 0.44], a: [34, -12], by: -0.28, bz: 0.06, hip: 0.1, sy: 0.12, sx: 0.32 },
      { u: 1.75, h: [0.2, 0.14, 0.34], a: [118, 30] },
      { u: 1.9, h: [0.1, -0.22, 0.38], a: [48, -32], by: -0.3, bz: 0.08, hip: 0.08, sy: 0.08, sx: 0.34 },
      { u: 2.1, by: -0.32, bz: 0.09, hip: 0.12, sy: 0.12, sx: 0.36 },
      { u: 2.5, h: [0.1, -0.24, 0.36], a: [46, -34], ...ONE, by: -0.3, bz: 0.07, hip: 0.1, sy: 0.1, sx: 0.33, fh: 'chest' },
    ],
  },

  /** DELAYED: the hand drawn to the left hip, the blade back along the thigh as if still in its sheath,
   *  the body sunk and still; one instant rising cut across his front, and he stops dead with the arm
   *  out to his right, the blade held level past the target, and holds it while the cut "arrives". */
  finDelayed: {
    line: 'right',
    home: 0.62,
    lF: [0.18, 0.5], rF: [-0.18, -0.46], fy: [0.35, -0.8], drag: 0.16,
    keys: [
      { u: 0.4, h: [0.3, -0.36, 0.14], a: [150, -24], ...ONE, by: -0.3, bz: -0.08, bx: -0.05, hip: 0.4, sy: 0.44, sx: 0.32, fh: 'wrist', l: [0.12, -0.34, 0.3] },
      { u: 0.95, h: [0.3, -0.37, 0.14], a: [151, -24], ...ONE, by: -0.32, bz: -0.08, bx: -0.05, hip: 0.42, sy: 0.46, sx: 0.34, fh: 'wrist', l: [0.12, -0.34, 0.3], lk: 0.85 },
      { u: 1.0, l: [0.2, -0.3, 0.22], lk: 0.2 },
      { u: 1.12, h: [0.2, -0.22, 0.38], a: [36, -10], by: -0.32, hip: 0.06, sy: 0.08, sx: 0.36 },
      { u: 1.38, h: [-0.06, -0.04, 0.46], a: [-38, 12], by: -0.3, bz: 0.12, hip: -0.36, sy: -0.36, sx: 0.36, fh: 'wing', l: [0.46, -0.12, -0.14] },
      { u: 1.6, h: [-0.3, 0.02, 0.36], a: [-96, 8], ...ONE, by: -0.3, bz: 0.13, bx: 0.05, hip: -0.48, sy: -0.48, sx: 0.32 },
      { u: 2.0, h: [-0.3, 0.02, 0.36], a: [-97, 8], ...ONE, by: -0.3, bz: 0.13, hip: -0.48, sy: -0.48, sx: 0.32, fh: 'wing' },
      { u: 2.6, h: [-0.31, 0.01, 0.35], a: [-98, 7], ...ONE, by: -0.29, bz: 0.12, hip: -0.47, sy: -0.47, sx: 0.31, fh: 'wing' },
    ],
  },

  /** FLICK: cocked high beside the right shoulder, still; one instant falling cut across his front to
   *  low left; the wrist flicks the blade out and down to his right (clean), and the shoulder turns away
   *  from the target (the clip's `turn`) as he settles, the free hand at his hip. */
  finFlick: {
    line: 'right',
    home: 0.55,
    lF: [0.15, 0.48], rF: [-0.17, -0.46], fy: [0.15, -0.75], drag: 0.16,
    keys: [
      { u: 0.45, h: [-0.1, 0.17, 0.04], a: [-142, 36], ...ONE, by: -0.12, bz: -0.07, bx: -0.05, hip: -0.38, sy: -0.42, sx: 0.0, fh: 'aim' },
      { u: 0.95, h: [-0.1, 0.18, 0.05], a: [-143, 37], ...ONE, by: -0.13, bz: -0.07, bx: -0.05, hip: -0.4, sy: -0.44, sx: 0.0, fh: 'aim' },
      { u: 1.12, h: [0.06, 0.08, 0.42], a: [-38, 17], by: -0.2, hip: -0.06, sy: -0.06, sx: 0.28 },
      { u: 1.38, h: [0.24, -0.12, 0.4], a: [38, -14], by: -0.26, bz: 0.1, hip: 0.3, sy: 0.3, sx: 0.4, fh: 'tail', l: [0.24, -0.4, -0.26] },
      { u: 1.6, h: [0.32, -0.3, 0.26], a: [100, -36], ...ONE, by: -0.28, bz: 0.12, bx: 0.05, hip: 0.42, sy: 0.44, sx: 0.42 },
      { u: 2.0, h: [0.3, -0.3, 0.24], a: [104, -38], ...ONE },
      { u: 2.15, h: [-0.12, -0.36, 0.2], a: [-92, -48], ...ONE, by: -0.18, bz: 0.08, hip: 0.34, sy: 0.3, sx: 0.14 },
      { u: 2.6, h: [-0.16, -0.38, 0.12], a: [-112, -52], ...ONE, by: -0.14, bz: 0.05, hip: 0.3, sy: 0.26, sx: 0.08, fh: 'tail' },
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
/** The last hit a clip name belongs to, or null (finisherFx.js). */
export const finisherOfClip = (clip) => {
  for (const id of FINISHER_IDS) if (FINISHER_ANIMS[id].clip === clip) return id;
  return null;
};
