// A brand-new light chain to compare with today's (`?lights=fresh`, combat.js setLights; the Lab's
// PLAYER → `lights` row). Data only: the same five hits on the same clock (combat.js LIGHT's windup,
// active frames, recovery, reach and damage untouched), new sword paths and body shapes. swings.js
// spreads this table into SWINGS (its header documents the fields); combat.js LIGHT_FRESH names a
// clip per hit with its own look options (`turn`, `hop`, `spin`).
//
// The chain, as the camera behind him sees it (owner: "the attack sword animation itself is the same
// and thats what i want changed"): every hit a different body event and a different height of steel.
//   1 Cloud Ring      the blade laid back flat over the right shoulder rings round at head height,
//                     right to left, while the body drops into a deep bow under it
//   2 Kneeling Sweep  the blade hangs point-down behind the left hip (a reverse-grip look), he drops
//                     almost to a knee and it skims the grass left to right, a pivot carrying it on
//   3 Rising Dragon   out of the kneel he springs into a real leap, the knees drawn up; the blade comes
//                     from behind the right knee up across his front to high on his left as he lands
//   4 Swallow Turn    the leap's turn carries on: a full turn to his left (`spin`), the point leading
//                     it; it comes round onto the foe and he drives it home side-on, forward and up.
//                     Its second look, the Two-Step Thrust: a skip in, wound far round with the point
//                     already on the foe, then one long lunge, the free hand drawn back high
//   5 Splitter        both hands: gathered low, cocked over the right shoulder on a short rise, one
//                     committed diagonal down into the ground ahead; he lands folded over the planted blade
// Each starts on the side where the hit before it left the blade, and no two hits in a row cut along
// the same line (anim.js _pickVariant reads `line`).

export const LIGHTS_FRESH = {
  // ---- hit 1: the cloud ring (云剑), right to left at head height ----------------------------------
  /** The hand rises over the right shoulder and lays the blade back flat behind it; the hips drive
   *  round and the blade rings flat right to left at the height of his head, which drops with the body
   *  into a deep bow, and carries on round to behind his left shoulder. */
  freshCloudRing: {
    line: 'flat', gather: [0.4, 0.8],
    lF: [0.17, 0.56], rF: [-0.18, -0.48], fy: [0.35, -0.75], drag: 0.16,
    home: 0.3, step: [0.1, 1.3],
    keys: [
      { u: 0.5, h: [-0.3, 0.02, 0.12], a: [-112, 14] },
      { u: 0.55, by: -0.14, bz: -0.11, bx: -0.07, hip: -0.56, sy: -0.62, sx: -0.02, sz: 0.06 },
      { u: 1.0, h: [-0.22, 0.18, -0.1], a: [-160, 8], by: -0.17, bz: -0.08, bx: -0.05, hip: -0.48, sy: -0.54, sx: 0.02, sz: 0.05, fh: 'aim' },
      { u: 1.25, h: [-0.1, 0.2, 0.24], a: [-106, 6] },
      { u: 1.5, h: [0.12, 0.17, 0.46], a: [-32, 4], by: -0.31, bz: 0.12, bx: 0.02, hip: 0.18, sy: 0.02, sx: 0.36, sz: 0.0, l: [0.34, -0.14, 0.0], lp: [0.4, -0.85, -0.4], ld: [95, -12], pn: [0, -1, 0], lk: 0 },
      { u: 1.75, h: [0.3, 0.15, 0.38], a: [34, 6] },
      { u: 2.0, h: [0.42, 0.12, 0.16], a: [100, 9], by: -0.37, bz: 0.15, bx: 0.06, hip: 0.44, sy: 0.5, sx: 0.42, sz: -0.06, fh: 'tail', l: [0.24, -0.4, -0.28] },
      { u: 2.15, h: [0.43, 0.11, 0.07], a: [126, 9] },
      { u: 2.18, by: -0.41, bz: 0.17, bx: 0.07, hip: 0.58, sy: 0.64, sx: 0.46 },
      { u: 2.45, h: [0.43, 0.1, 0.03], a: [136, 8], by: -0.37, bz: 0.12, bx: 0.05, hip: 0.5, sy: 0.56, sx: 0.4, sz: -0.05, fh: 'tail' },
    ],
  },

  // ---- hit 2: the kneeling sweep, left to right along the grass ------------------------------------
  /** Out of the ring's finish the blade drops behind his left hip, hanging point-down and back from a
   *  hand held before the hip (the look of a reverse grip), the free fingers on the sword wrist; he
   *  sinks almost to a knee and the blade skims the grass left to right across his front, rising a
   *  little out to his right as the body pivots on with it (combat.js `turn`). */
  freshKneelSweep: {
    line: 'low', gather: [0.4, 0.8],
    lF: [0.2, 0.56], rF: [-0.2, -0.5], fy: [0.5, -0.85], drag: 0.18,
    home: 0.3, step: [0.1, 1.3],
    keys: [
      { u: 0.55, by: -0.36, bz: -0.1, bx: -0.07, hip: 0.56, sy: 0.62, sx: 0.42, fh: 'wrist', l: [0.12, -0.34, 0.3] },
      { u: 1.0, h: [0.36, -0.38, 0.14], a: [150, -26], by: -0.4, bz: -0.07, bx: -0.05, hip: 0.46, sy: 0.52, sx: 0.46, fh: 'wrist', l: [0.12, -0.34, 0.3], lk: 0.85 },
      { u: 1.1, l: [0.22, -0.3, 0.22], lp: [0.5, -0.8, -0.2], ld: [60, -30], pn: [0, -1, 0], lk: 0.25 },
      { u: 1.25, h: [0.3, -0.4, 0.34], a: [100, -16] },
      { u: 1.5, h: [0.13, -0.37, 0.46], a: [32, -10], by: -0.44, bz: 0.12, bx: 0.02, hip: -0.04, sy: 0.06, sx: 0.5, l: [0.38, -0.2, -0.02], lp: [0.4, -0.6, -0.6], ld: [100, -10], pn: [0, -1, 0], lk: 0 },
      { u: 1.75, h: [-0.1, -0.33, 0.42], a: [-36, -5] },
      { u: 2.0, h: [-0.26, -0.26, 0.26], a: [-100, 6], by: -0.42, bz: 0.15, bx: 0.06, hip: -0.42, sy: -0.46, sx: 0.46, fh: 'wing', l: [0.46, -0.12, -0.14] },
      { u: 2.15, h: [-0.3, -0.22, 0.14], a: [-128, 10] },
      { u: 2.18, by: -0.45, bz: 0.17, bx: 0.07, hip: -0.56, sy: -0.6, sx: 0.5 },
      { u: 2.45, h: [-0.32, -0.2, 0.08], a: [-138, 12], by: -0.4, bz: 0.12, bx: 0.05, hip: -0.5, sy: -0.54, sx: 0.44, fh: 'wing' },
    ],
  },

  // ---- hit 3: the rising dragon, a leap -------------------------------------------------------------
  /** He sinks deeper still, then springs (combat.js `hop`, the knees drawn up) with the blade dropped
   *  low behind his right knee; coming down, it rises across his front to high on his left, the body
   *  stretched up after it and the free hand flung back behind the hip. */
  freshDragonLeap: {
    line: 'left', gather: [0.4, 0.8],
    fy: [0.3, -0.6],
    home: 0.3,
    keys: [
      { u: 0.5, by: -0.42, bz: -0.1, bx: -0.07, hip: -0.56, sy: -0.62, sx: 0.5 },
      { u: 1.0, h: [-0.16, -0.34, -0.12], a: [-160, -30], by: -0.24, bz: -0.07, bx: -0.05, hip: -0.4, sy: -0.48, sx: 0.36, fh: 'chest' },
      { u: 1.25, h: [-0.01, -0.28, 0.26], a: [-104, -24] },
      { u: 1.5, h: [0.14, -0.1, 0.46], a: [-30, -4], by: -0.26, bz: 0.11, bx: 0.02, hip: 0.14, sy: 0.02, sx: 0.3, l: [0.18, -0.36, 0.02], lp: [0.6, -0.6, -0.4], ld: [100, -50], pn: [-1, 0, 0], lk: 0 },
      { u: 1.75, h: [0.3, 0.1, 0.38], a: [34, 24] },
      { u: 2.0, h: [0.36, 0.18, 0.24], a: [72, 32], by: -0.18, bz: 0.13, bx: 0.06, hip: 0.34, sy: 0.36, sx: 0.08, sz: -0.05, fh: 'tail', l: [0.26, -0.44, -0.34] },
      { u: 2.15, h: [0.38, 0.19, 0.19], a: [82, 27] },
      { u: 2.18, by: -0.2, bz: 0.14, bx: 0.07, hip: 0.46, sy: 0.5, sx: 0.04 },
      { u: 2.45, h: [0.38, 0.17, 0.17], a: [86, 22], by: -0.16, bz: 0.1, bx: 0.05, hip: 0.4, sy: 0.43, sx: 0.05, fh: 'tail' },
    ],
  },

  // ---- hit 4: the two-step thrust -------------------------------------------------------------------
  /** A skip in (combat.js `hop`, the first step), the body wound far round to his right and the hand
   *  drawn back low to the right hip, the point already up at the foe and the free fingers aimed along
   *  it; then the lunge (the second): the body turns side-on behind the point and drives it forward
   *  and up in one line from the rear heel, and the free hand draws back high like a bow string. */
  freshTwoStepThrust: {
    line: 'point', gather: [0.4, 0.8],
    rF: [-0.17, -0.5], fy: [0.1, -0.85], drag: 0.12,
    lF: [0.14, 0.6],
    home: 0.3,
    keys: [
      { u: 0.45, h: [0.08, -0.16, 0.42], a: [34, 22] },
      { u: 0.7, by: -0.2, bz: -0.13, bx: -0.06, hip: -0.52, sy: -0.66, sx: 0.06 },
      { u: 1.0, h: [-0.12, -0.28, -0.06], a: [3, 22], by: -0.24, bz: -0.1, hip: -0.44, sy: -0.58, sx: 0.12, fh: 'aim', l: [0.04, -0.06, 0.42], ld: [-6, 14], bx: -0.05 },
      { u: 1.2, l: [0.08, -0.18, 0.3], lp: [0.45, -0.85, -0.2], ld: [30, -20], pn: [-0.5, -1, 0], lk: 0 },
      { u: 1.45, h: [0.06, -0.1, 0.26], a: [1, 30], by: -0.3, bz: 0.07, hip: -0.08, sy: -0.1, sx: 0.32, l: [0.2, -0.36, 0.02], lp: [0.6, -0.7, -0.3], ld: [100, -65], pn: [-1, 0, 0], lk: 0, bx: 0.0 },
      { u: 1.9, h: [0.14, 0.1, 0.5], a: [0, 37], by: -0.4, bz: 0.19, hip: 0.34, sy: 0.44, sx: 0.52, fh: 'highWing', l: [0.34, 0.02, -0.26], bx: 0.05 },
      { u: 2.12, by: -0.43, bz: 0.2, bx: 0.05, hip: 0.38, sy: 0.5, sx: 0.57 },
      { u: 2.5, h: [0.14, 0.08, 0.46], a: [0, 34], by: -0.37, bz: 0.15, hip: 0.34, sy: 0.43, sx: 0.5, fh: 'highWing', l: [0.34, 0.0, -0.24], bx: 0.04 },
    ],
  },

  /** The swallow turn (combat.js `spin` +1, the feet hopping round): out of the leap's finish on his
   *  left he lets the turn carry on, a full turn to his left, the hand low at the left hip and the point
   *  held out past his left side, leading the turn, the free arm tucked in; the point sweeps round onto
   *  the foe and stays on him while the body comes round behind it and drives it home, forward and up,
   *  side-on, the free hand drawn back high. */
  freshSwallowThrust: {
    line: 'point', gather: [0.4, 0.8],
    rF: [-0.17, -0.5], fy: [0.1, -0.85], drag: 0.12,
    lF: [0.14, 0.58],
    home: 0.3,
    keys: [
      { u: 0.4, by: -0.26, sx: 0.22 },
      { u: 1.0, h: [0.32, -0.22, 0.2], a: [156, 12], by: -0.24, hip: 0.16, sy: 0.22, sx: 0.18, fh: 'chest', l: [-0.06, -0.26, 0.24] },
      { u: 1.2, h: [0.28, -0.18, 0.3], a: [140, 18] },
      { u: 1.4, h: [0.21, -0.12, 0.38], a: [116, 24] },
      { u: 1.6, h: [0.14, -0.04, 0.44], a: [72, 30], by: -0.3, bz: 0.1, hip: 0.12, sy: 0.14, sx: 0.36, l: [0.26, -0.24, -0.06], lp: [0.6, -0.7, -0.3], ld: [100, -50], pn: [-1, 0, 0], lk: 0 },
      { u: 1.8, h: [0.12, 0.05, 0.48], a: [30, 34] },
      { u: 1.95, h: [0.13, 0.1, 0.5], a: [4, 36], by: -0.38, bz: 0.18, hip: 0.3, sy: 0.4, sx: 0.5, fh: 'highWing', l: [0.34, 0.02, -0.26], bx: 0.05 },
      { u: 2.12, by: -0.41, bz: 0.19, bx: 0.05, hip: 0.36, sy: 0.47, sx: 0.55 },
      { u: 2.5, h: [0.13, 0.08, 0.46], a: [0, 34], by: -0.36, bz: 0.15, hip: 0.32, sy: 0.42, sx: 0.5, fh: 'highWing', l: [0.34, 0.0, -0.24], bx: 0.04 },
    ],
  },

  // ---- hit 5: the heaven splitter (combat.js LIGHT[4], kind 'slam') --------------------------------
  /** Both hands. He GATHERS low, the blade drawn down and back past the right hip, the hips wound round
   *  to his right and the chest after them; rises (combat.js `hop`, a short one) as the blade sweeps up
   *  his right side, where the camera behind him sees it, and cocks it back over the right shoulder.
   *  Then one committed diagonal: the hips unwind first, the chest after them, the hands leading and
   *  the steel whipping over after them, from high right across his front down into the ground ahead
   *  and a little left, where the shards burst (player.js). He lands folded over the planted blade
   *  and holds it. The chest
   *  never turns more than ~30° on the hips (the owner: the tornado's turn "looks like its breaking
   *  its back twisting around so unnaturally"). */
  freshSplitter: {
    line: 'down',
    home: 0.42,
    step: [0.45, 1.5],
    drag: 0.25,
    keys: [
      { u: 0.38, h: [-0.16, -0.34, -0.04], a: [-146, -22], two: 1, lp: [0.7, -0.6, 0.3], by: -0.36, bz: -0.05, hip: -0.36, sy: -0.46, sx: 0.44, sz: 0.06, hx: 0.14, hy: 0.42, hs: 0 },
      { u: 0.7, h: [-0.08, 0.08, 0.18], a: [-106, 64], two: 1, by: -0.06, hip: -0.4, sy: -0.42, sx: -0.06, sz: 0.04, hx: -0.16, hy: 0.36, hs: 0 },
      { u: 1.0, h: [-0.08, 0.21, 0.13], a: [-150, 45], two: 1, by: -0.04, bz: -0.08, hip: -0.42, sy: -0.48, sx: -0.16, sz: 0.06, hx: -0.2, hy: 0.52, hs: 0 },
      { u: 1.25, h: [0.05, 0.22, 0.3], a: [-104, 42] },
      { u: 1.5, h: [0.13, 0.1, 0.45], a: [-33, 22], two: 1, by: -0.16, bz: 0.07, hip: 0.08, sy: 0.0, sx: 0.32, sz: 0.0, hx: 0.0, hy: 0.0, hs: 0 },
      { u: 1.75, h: [0.19, -0.16, 0.46], a: [9, -18] },
      { u: 2.0, h: [0.2, -0.35, 0.37], a: [17, -46], two: 1, by: -0.45, bz: 0.17, hip: 0.27, sy: 0.3, sx: 0.72, sz: -0.05, hx: 0.16, hy: -0.3, hs: 0 },
      { u: 2.2, h: [0.2, -0.37, 0.36], a: [17, -48], two: 1, by: -0.49, bz: 0.18, hip: 0.28, sy: 0.31, sx: 0.77, sz: -0.05, hx: 0.34, hy: -0.3, hs: 0 },
      { u: 2.65, h: [0.2, -0.37, 0.36], a: [17, -48], two: 1, by: -0.47, bz: 0.17, hip: 0.27, sy: 0.3, sx: 0.75, sz: -0.05, hx: 0.26, hy: -0.3, hs: 0 },
    ],
  },
};
