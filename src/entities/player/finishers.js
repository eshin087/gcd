// The striker chain's finisher (hit 5 of `?lights=striker`, combat.js LIGHT_STRIKER): four ideas for
// the owner to pick from, `?finisher=lance|cross|talisman|flash` (the Lab's PLAYER → `finisher` row).
// Data only (no imports): combat.js reads the pick's anim block, swings.js spreads the clips into
// SWINGS, finisherFx.js draws the spell (and gives it its little extra reach: it hits ~1 m past the
// blade if the blade itself missed, in place of the slam's shard burst). Each is a planted, two-handed
// strike, the hips leading: no spin, no twirl, no leap, nothing like the heavy slam / Earthbreaker
// (the owner, 2026-11-25: "a fierce skilled striker instead of looking like hes doing acrobatics", "the
// finisher needs to be a cool like spell effect that isn't overpowered but looks awesome to always see").
//   lance     a straight two-handed thrust from a deep, wound stance; a lance of sword light shoots on
//             from the point
//   cross     two lightning cuts, the first inside the windup, the second the hit: the X they leave
//             hangs in the air, then bursts into sparks
//   talisman  the free hand's sword fingers write a seal in the air before him; the hand joins the grip
//             and the two-handed cut goes straight through it, and it bursts
//   flash     a still, tense coil low at the right hip, then one blindingly fast level cut; a thin line
//             of light hangs where it passed, then splits apart
// The clips' format: swings.js header. Two hands on the grip (`two: 1`) on every key of the cut.

export const FINISHER_IDS = Object.freeze(['lance', 'cross', 'talisman', 'flash']);
export const FINISHER_NAMES = Object.freeze({ lance: 'sword-qi lance', cross: 'crossing X', talisman: 'talisman strike', flash: 'flash cut' });

/** The anim block hit 5 plays for each pick (combat.js LIGHT_STRIKER[4].anim): planted, no hop, no spin. */
export const FINISHER_ANIMS = Object.freeze({
  lance: Object.freeze({ kind: 'clip', clip: 'finLance' }),
  cross: Object.freeze({ kind: 'clip', clip: 'finCross' }),
  talisman: Object.freeze({ kind: 'clip', clip: 'finTalisman' }),
  flash: Object.freeze({ kind: 'clip', clip: 'finFlash' }),
});

const TWO = { two: 1, lp: [0.7, -0.6, 0.3], hs: 0 };

/** The finishers' clips (swings.js format), spread into SWINGS. */
export const FINISHER_CLIPS = {
  /** LANCE: the hands drawn back to the right hip, the point already up at the foe, the body wound far
   *  round and sunk; then the hips drive, the chest after them, and both arms put the point straight
   *  out and up in one line from the rear heel. He holds it there. */
  finLance: {
    line: 'point',
    home: 0.42,
    step: [0.4, 1.4],
    rF: [-0.18, -0.5], lF: [0.16, 0.6], fy: [0.1, -0.85], drag: 0.12,
    keys: [
      { u: 0.35, h: [-0.04, -0.26, -0.12], a: [4, 20], ...TWO, by: -0.3, bz: -0.13, bx: -0.05, hip: -0.6, sy: -0.62, sx: 0.18 },
      { u: 1.0, h: [-0.02, -0.24, -0.1], a: [3, 22], ...TWO, by: -0.32, bz: -0.12, bx: -0.05, hip: -0.56, sy: -0.6, sx: 0.2 },
      { u: 1.45, h: [0.08, -0.1, 0.28], a: [2, 30], ...TWO, by: -0.34, bz: 0.06, bx: 0.0, hip: -0.08, sy: -0.08, sx: 0.34 },
      { u: 1.8, h: [0.13, 0.06, 0.5], a: [0, 34], ...TWO, by: -0.4, bz: 0.2, bx: 0.04, hip: 0.22, sy: 0.3, sx: 0.5 },
      { u: 2.0, h: [0.13, 0.07, 0.5], a: [0, 35], ...TWO },
      { u: 2.15, by: -0.43, bz: 0.21, bx: 0.05, hip: 0.26, sy: 0.34, sx: 0.54 },
      { u: 2.6, h: [0.13, 0.06, 0.48], a: [0, 34], ...TWO, by: -0.4, bz: 0.18, bx: 0.04, hip: 0.22, sy: 0.3, sx: 0.5 },
    ],
  },

  /** CROSS: cocked high on the right, the first cut falls across his front to low left inside the
   *  windup; the blade runs straight back up his left side, and the second (the hit) falls from over the
   *  left shoulder across the first to low right. Planted, the hips turning each cut. */
  finCross: {
    line: 'left',
    home: 0.42,
    step: [0.45, 1.4],
    lF: [0.16, 0.52], rF: [-0.18, -0.48], fy: [0.15, -0.75], drag: 0.16,
    keys: [
      { u: 0.18, h: [-0.06, 0.2, 0.14], a: [-140, 40], ...TWO, by: -0.12, bz: -0.06, bx: -0.05, hip: -0.4, sy: -0.44, sx: 0.0 },
      { u: 0.32, h: [0.1, 0.06, 0.44], a: [-34, 14] },
      { u: 0.46, h: [0.24, -0.28, 0.32], a: [64, -32], ...TWO, by: -0.26, bz: 0.04, hip: 0.24, sy: 0.24, sx: 0.4 },
      { u: 0.75, h: [0.24, 0.1, 0.18], a: [128, 30], ...TWO, by: -0.14, bz: -0.04, hip: 0.38, sy: 0.44, sx: 0.08 },
      { u: 1.0, h: [0.27, 0.18, 0.1], a: [154, 42], ...TWO, by: -0.12, bz: -0.06, bx: -0.05, hip: 0.42, sy: 0.5, sx: 0.0, sz: -0.04 },
      { u: 1.32, h: [0.22, 0.12, 0.32], a: [104, 34] },
      { u: 1.6, h: [0.06, -0.08, 0.47], a: [10, 8], ...TWO, by: -0.26, bz: 0.1, bx: 0.01, hip: -0.06, sy: 0.0, sx: 0.38 },
      { u: 1.8, h: [-0.08, -0.26, 0.42], a: [-34, -22] },
      { u: 2.0, h: [-0.16, -0.38, 0.3], a: [-66, -40], ...TWO, by: -0.38, bz: 0.16, bx: 0.05, hip: -0.38, sy: -0.42, sx: 0.52, sz: 0.06 },
      { u: 2.15, by: -0.4, bz: 0.17, bx: 0.06, hip: -0.46, sy: -0.52, sx: 0.56 },
      { u: 2.6, h: [-0.18, -0.4, 0.26], a: [-70, -42], ...TWO, by: -0.38, bz: 0.14, bx: 0.05, hip: -0.42, sy: -0.48, sx: 0.52, sz: 0.05 },
    ],
  },

  /** TALISMAN: the blade cocked one-handed beside the right shoulder, the free hand's sword fingers
   *  write a small seal in the air before his chest (a ring, then a stroke through its middle); the
   *  hand joins the grip and the two-handed cut falls from high right straight through the seal to low
   *  left. */
  finTalisman: {
    line: 'right',
    home: 0.42,
    step: [0.5, 1.4],
    lF: [0.16, 0.52], rF: [-0.18, -0.48], fy: [0.15, -0.75], drag: 0.16,
    keys: [
      { u: 0.12, h: [-0.12, 0.18, 0.02], a: [-150, 38], two: 0, hs: 1, by: -0.2, bz: -0.06, bx: -0.05, hip: -0.3, sy: -0.36, sx: 0.08, l: [-0.17, 0.09, 0.42], lp: [0.35, -0.9, -0.1], ld: [0, 70], pn: [-1, 0, 0], lk: 0 },
      { u: 0.24, l: [-0.06, -0.02, 0.42] },
      { u: 0.36, l: [-0.17, -0.13, 0.42] },
      { u: 0.48, l: [-0.28, -0.02, 0.42] },
      { u: 0.6, l: [-0.17, 0.09, 0.42] },
      { u: 0.72, h: [-0.1, 0.19, 0.08], a: [-148, 42], two: 0, hs: 1, l: [-0.17, -0.06, 0.4], by: -0.14, hip: -0.36, sy: -0.42, sx: 0.0 },
      { u: 0.9, h: [-0.08, 0.2, 0.12], a: [-148, 44], ...TWO, by: -0.08, bz: -0.08, bx: -0.05, hip: -0.4, sy: -0.48, sx: -0.12, sz: 0.05 },
      { u: 1.0, h: [-0.07, 0.21, 0.13], a: [-150, 45], ...TWO },
      { u: 1.25, h: [0.05, 0.22, 0.3], a: [-104, 42] },
      { u: 1.5, h: [0.13, 0.08, 0.45], a: [-33, 20], ...TWO, by: -0.18, bz: 0.08, bx: 0.01, hip: 0.08, sy: 0.0, sx: 0.34 },
      { u: 1.75, h: [0.22, -0.18, 0.44], a: [24, -18] },
      { u: 2.0, h: [0.3, -0.34, 0.3], a: [70, -38], ...TWO, by: -0.38, bz: 0.16, bx: 0.05, hip: 0.4, sy: 0.44, sx: 0.52, sz: -0.06 },
      { u: 2.15, by: -0.4, bz: 0.17, bx: 0.06, hip: 0.48, sy: 0.54, sx: 0.56 },
      { u: 2.6, h: [0.32, -0.36, 0.26], a: [74, -40], ...TWO, by: -0.38, bz: 0.14, bx: 0.05, hip: 0.44, sy: 0.5, sx: 0.52, sz: -0.05 },
    ],
  },

  /** FLASH: he sinks into a coil low at the right hip, both hands on the grip, the blade level out
   *  behind him, and holds it, still; then one blindingly fast level cut right to left across his
   *  front, the hips whipping round, and he holds the finish with the blade out to his left. */
  finFlash: {
    line: 'flat',
    home: 0.42,
    step: [0.2, 1.1],
    lF: [0.2, 0.5], rF: [-0.2, -0.5], fy: [0.4, -0.85], drag: 0.18,
    keys: [
      { u: 0.25, h: [-0.18, -0.24, -0.04], a: [-150, 0], ...TWO, by: -0.36, bz: -0.08, bx: -0.05, hip: -0.52, sy: -0.56, sx: 0.3 },
      { u: 0.6, h: [-0.18, -0.25, -0.04], a: [-151, 0], ...TWO, by: -0.39, bz: -0.08, bx: -0.05, hip: -0.54, sy: -0.58, sx: 0.32 },
      { u: 1.0, h: [-0.19, -0.25, -0.05], a: [-152, 1], ...TWO, by: -0.4, bz: -0.08, bx: -0.05, hip: -0.55, sy: -0.59, sx: 0.33 },
      { u: 1.42, h: [-0.1, -0.12, 0.3], a: [-96, 5] },
      { u: 1.6, h: [0.06, -0.04, 0.47], a: [-8, 8], ...TWO, by: -0.34, bz: 0.12, bx: 0.02, hip: 0.05, sy: 0.02, sx: 0.42 },
      { u: 1.72, h: [0.28, -0.06, 0.36], a: [66, 7] },
      { u: 1.86, h: [0.38, -0.08, 0.2], a: [116, 6], ...TWO, by: -0.38, bz: 0.16, bx: 0.05, hip: 0.48, sy: 0.5, sx: 0.4 },
      { u: 2.0, h: [0.39, -0.12, 0.18], a: [124, 5], ...TWO, by: -0.42, bz: 0.16, hip: 0.5, sy: 0.52, sx: 0.4 },
      { u: 2.15, by: -0.44, bz: 0.17, hip: 0.56, sy: 0.58, sx: 0.42 },
      { u: 2.6, h: [0.39, -0.12, 0.18], a: [126, 5], ...TWO, by: -0.42, bz: 0.15, hip: 0.52, sy: 0.54, sx: 0.4 },
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
const PICK = { id: FINISHER_IDS.includes(q('finisher')) ? q('finisher') : 'lance' };
/** The finisher picked now. */
export const finisherId = () => PICK.id;
/** Set it (combat.js setFinisherLook also re-points hit 5); false for an unknown id. */
export function pickFinisher(id) {
  const m = String(id);
  if (!FINISHER_IDS.includes(m)) return false;
  PICK.id = m;
  return true;
}
/** The finisher a clip name belongs to, or null (finisherFx.js). */
export const finisherOfClip = (clip) => {
  for (const id of FINISHER_IDS) if (FINISHER_ANIMS[id].clip === clip) return id;
  return null;
};
