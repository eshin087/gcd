// The hero's swings as keyframed clips (data only; anim.js `swingPose` plays them, combat.js names
// one per hit: `anim: { kind: 'clip', clip: '<name>' }`).
//
// A clip is a list of KEYS over the attack's own phases, so a clip follows its hit's timing:
//   u  0 … 1  the windup      (0 = the pose he was in when the swing started: the clip always
//                               starts from there, whatever it was, at the speed it was moving)
//      1 … 2  the cut          (the hit test reads the drawn blade: it must cross his front here)
//      2 … 3  the recovery     (from `home`, default 0.42 of it, and only when no next hit is pressed,
//                               anim.js settles him back to the ready stance: a way home that
//                               outlasts the recovery; a clip that HOLDS its finish keys up to it)
// The hero's light chain plays its sword hand and blade on the VISIBLE CUT's clock (anim.js
// cutPhase): u 1.5 (the contact) stays at the middle of the active frames, where it always was, so
// the cut lands when it did; the coil (u 1) comes `cut[0]` s before the active frames and the cut's
// end (u 2) `cut[1]` s after them, so the blade crosses the same arc over more frames. The body, the
// free hand and the head keep the attack's own clock (the hips snap into the cut ahead of the arm).
// A held attack button freezes the clip at u = 1 (the coil), so that key is a pose worth holding.
//
// Key fields (body axes: +x his LEFT, +y up, +z forward; metres, radians). A field missing from a
// key is interpolated between the keys that have it (Catmull-Rom: the motion runs through the keys
// without stopping; two keys close together with the same value make a hold):
//   h   the sword hand, as an offset from the right shoulder (reach 0.55)
//   a   the blade's direction as [azimuth, elevation] in DEGREES: azimuth round the body (0 = ahead,
//       + = his left, 180 = behind), elevation above level. Consecutive keys at most ~100° apart.
//   l   the free hand, as an offset from the left shoulder
//   ld  the free hand's fingers as [azimuth, elevation] in DEGREES (like `a`), × `lw` (0..1, default
//       1: the length is the weight; 0 = the hand rigid on the forearm)
//   pn  the way the free palm faces (a vector, length ≥ 0.6: its weight, like `ld`'s)
//   hs  the free hand's shape: 0 open, 1 sword fingers (jian jue; the fist on the grip comes from
//       `two` and the hand being there, never from `hs`)
//   lk  0..1 the free hand resting on the sword wrist (the fingers along the sword forearm)
//   fh  a free-hand place from FH below ('aim', 'chest', 'wing', ...): its fields, under the key's own
//   by bx bz   the hips: sink (−) / across (+ = toward the foot that steps; mirrored per swing,
//              anim.js swingPose: + = his left when the left foot steps) / forward
//   hip sy     the hips' and the chest's turn (+ = to his left); the chest's is on top of the hips'
//   sx sz      the chest's lean forward (+) and to his right (+)
//   hy hx hz   the head (default: the eyes stay on the target)
//   two        0..1 the free hand on the grip (then `l` is ignored);  offAt  m up the blade (a brace)
//   rp lp      elbow directions (default: worked out from where the hand is)
//   f          the flat's normal (default: the plane the blade is swinging in, so the edge leads)
// Clip options (the hero's chain): `cut` [lead, lag] s (default [0.03, 0.05], anim.js SW_CUT; a long
//   way to the coil from a far carry keeps more of the windup), `join` (default 0.4: the cut clock's
//   rate at the coil, x its first half's), `apex` (default true: the sword hand and the blade rest
//   at the coil when the way into it runs against the cut, the top of a pendulum's swing; false: they
//   pass it on the spline, a curve), `follow` [k, right, left] (the coil's blade turns k of the way
//   round toward where the blade comes from, at most `right` / `left` degrees: the thrusts' chamber).
// Clip options: `rF` / `lF` [x, z] the stance the step lands in (default: the fighting stance),
//   `step` [u0, u1] when the front foot steps, `flat` the flat's normal while the blade is slow
//   (and the side the swing's plane is taken on: give it for a vertical cut), `home` the fraction of
//   the recovery after which he eases back to the ready stance, `line` the line the cut runs along
//   as he sees it ('right': the diagonal between high right and low left, either way; 'left': its
//   mirror; 'flat'; 'down' the middle; 'low' along the grass; 'spiral'; 'point' a thrust): the
//   animator never follows a swing with another on the same line (anim.js _pickVariant).
//   `lead` [hipsSec, chestSec] (default [0.033, 0.017]): how far ahead of the hand the hips and the
//   chest run (anim.js swingPose: the hips' and chest's keys are played that much earlier);
//   `fy` [frontYaw, rearYaw] (rad, for a left-front stance, mirrored when the right foot steps): the
//   stance's foot yaws; `drag` (default 0.22: m the holding foot may stretch past the stance's rear
//   spot before its toe drags after the body); `fold` (0..1, default 1: × the chest's fold and the
//   head's nod in the bite after a landed hit, anim.js BITE: 0 for a blade held upright before the
//   face, which they would put his head into).
//
// Authoring notes: a cut reads as powered by the body when the hips lead (their turn is ahead of the
// chest's at mid-cut), the hand is furthest from the shoulder as the blade crosses his front, and the
// weight goes from the back foot (`bz` -, the hips up) into the front one (`bz` +, the hips down).
// The COIL is one key, at u = 1, and it is NEAR the cut: ≤ ~85° from the contact key (u 1.5), the
// blade cocked out to his side, not far behind him (from a coil at rest the blade cannot cross more
// in the cut's first half under 40 m/s: the chain's coils were 120-150° back and the cut ran 47-62).
// The follow-through of one hit ends by the next hit's coil: the chain is a pendulum, each finish
// the top of the swing back (anim.js: the next windup carries on from the follow-through's speed).
// Two keys at the coil make a dead stop, a hitch between the hits of a chain. Around it, two BODY-ONLY
// keys (no `h` / `a`; the free hand's fields may ride on them): an ANTICIPATION key at u 0.5-0.8
// (the hips 0.06-0.08 rad and the chest 0.04-0.06 past the coil's turn, away from the cut; the
// weight back, `bz` −0.02; `bx` −0.06 toward the trail foot; `by` +0.03, a rise, before a falling
// cut, −0.04, a sink, before a rising one) and an OVERSHOOT key at u 2.1-2.15 (the hips and chest
// 0.08-0.14 rad past the u = 2 key, 2 cm deeper); the last key settles back between the two. Never
// key an overshoot on `h` / `a`: the blade's own follow-through is the hand's (the one-cut test).
// Keep the hips low enough for the legs to reach planted feet: standing up onto a straight front leg
// over a long bow, or rising and drawing back from a far front foot (the anticipation's rise), puts
// the holding foot out of its leg's reach and its toe skates after the body (anim.js HOLD_REACH;
// HEROWEIGHT bounds the toe drag at 12 cm a swing). Each hit of the chain
// cuts in a different plane, and each starts on the side where the hit before it leaves the blade
// (hit 1 ends on his left, hit 2 on his right), so the steel swings back the way a pendulum does.
// The planes are DIAGONALS, never straight up and down: the blade crosses his front near chest
// height (elevation within ~15° of level at mid-cut) and no key stands it above ~45°, so a "falling"
// cut runs from a high shoulder across the chest to the far hip, not over the top of his head. (The
// game camera looks down from behind him: a cut in an upright plane is drawn as one straight bar up
// the screen. Session 25, owner: "not so perfectly top to bottom, more diagonals".)
// The blade WHIPS: through the first half of a cut the hand runs ahead and the blade hangs back
// (at mid-cut the hand is at full reach in front of him and the blade is still ~30° short of
// pointing ahead), then it comes through and passes the hand as the cut ends.
// THE FREE HAND holds sword fingers (jian jue) and answers the blade (at the game camera it is a
// pale point off a clear arm line: WHERE it goes is what reads, so every finish puts it somewhere):
//   (a) GATHER then SPLIT: before a backhand the fingers come to the sword wrist (`lk`), and as the
//       cut goes out they leave it at waist level and open the other way.
//   (b) OPPOSITION: at the finish the free arm makes one line through the body against the blade.
//   (c) OUT OF THE BLADE'S PATH: a cut ending on his left sends the hand high-back or behind the hip.
//   (d) ARMS IN through the turns (the chest tuck), ARMS OUT as the brake.
//   (e) The POINT leads: with the blade cocked back, the fingers point at the foe.
//   (f) Overhead is rare: the Ash Disciple's mark (only the low sweep's `high`, beside the head).
//   (g) Key a large elbow change (> ~60°) in the windup: ELBOW_RATE (14 rad/s, anim.js) lags it in
//       a seven-frame cut.
//   (h) At contact (u ≈ 1.45) the hand is ≥ 45 % of the way to its finish (the hit-stop shows it).
//   (i) Rest it on the sword wrist only where that wrist is ≤ 0.43 m from the left shoulder.
//   (j) Avoid a palm opposite the IK's neutral (the twist is clamped at ±85°).
// It is never flung from in front of him to behind him and snapped forward again for the next coil
// in one frame: the arm-snap test bounds it.

/** The free hand's places (a key's `fh`; the key's own fields win): where it is (`l`), its elbow
 *  (`lp`), where the sword fingers point (`ld`), the palm (`pn`) and the sword wrist (`lk`). */
export const FH = {
  aim: { l: [-0.02, 0, 0.4], lp: [0.35, -0.9, -0.1], ld: [-6, 10], pn: [-1, 0, 0], lk: 0 }, // 立剑指: at the foe, the thumb up, the elbow dropped
  aimLo: { l: [0.06, -0.26, 0.36], lp: [0.45, -0.85, -0.2], ld: [-4, -12], pn: [0, -1, 0], lk: 0 }, // 平剑指: a low point, the palm down
  chest: { l: [-0.1, -0.22, 0.26], lp: [0.6, -0.75, -0.2], ld: [22, 55], pn: [-1, 0, 0], lk: 0 }, // tucked before the left chest, the fingers up (arms in)
  wrist: { l: [-0.1, -0.25, 0.3], lp: [0.5, -0.85, -0.1], ld: [-60, -20], pn: [0, -1, 0], lk: 1 }, // 合: on the sword wrist (give `l` per clip)
  highWing: { l: [0.3, -0.02, -0.2], lp: [0.35, -0.8, -0.45], ld: [130, 25], pn: [-0.5, -1, 0.2], lk: 0 }, // drawn back-left at shoulder height (a bow draw)
  // (Session 30: it was LEVEL at shoulder height, [0.46, -0.06, -0.1]: with the whirl's and the flat
  // backhand's finish he stood like a scarecrow, one arm straight out. The hand sits a hand's width
  // under the shoulder now and the elbow hangs: a line that slopes away from the blade)
  wing: { l: [0.44, -0.17, -0.12], lp: [0.2, -0.75, -0.65], ld: [100, -8], pn: [0, -1, 0], lk: 0 }, // 展: out to his left, sloping down from the shoulder
  wingLo: { l: [0.4, -0.3, -0.14], lp: [0.3, -0.45, -0.85], ld: [110, -35], pn: [0, -1, 0], lk: 0 }, // low, out to his left
  tail: { l: [0.22, -0.38, -0.22], lp: [0.75, -0.3, -0.6], ld: [170, -58], pn: [-1, 0, 0], lk: 0 }, // behind the hip, the fingers back and down
  high: { l: [0.2, 0.3, -0.1], lp: [0.85, -0.3, 0.4], ld: [-10, 75], pn: [0.2, 0, 1], lk: 0 }, // RARE (the low sweep only): beside the head, never over the crown
};

export const SWINGS = {
  // ---- hit 1: right to left ------------------------------------------------------------------
  /** The falling cut: cocked at his right shoulder, a diagonal from high right across his chest down
   *  past the left hip. (It was cocked beside the head, 152° back: from the low carry the wind lifted
   *  the blade 2 m in six frames, 31 m/s, a second cut before the cut. The chain opens with it out of
   *  the cross guard or a high carry, anim.js _pickVariant.) */
  fallingCut: {
    line: 'right',
    cut: [0.03, 0.07],
    lF: [0.15, 0.48], rF: [-0.17, -0.46], fy: [0.15, -0.75], drag: 0.14,
    keys: [
      { u: 0.6, by: -0.04, bz: -0.09, bx: -0.06, hip: -0.44, sy: -0.5, sx: -0.1 },
      { u: 1.0, h: [-0.1, 0.0, 0.1], a: [-108, 24], by: -0.08, bz: -0.07, bx: -0.05, hip: -0.36, sy: -0.44, sx: -0.04, sz: 0.05, fh: 'aim' },
      { u: 1.25, h: [0.0, 0.04, 0.29], a: [-68, 19] },
      { u: 1.5, h: [0.14, -0.05, 0.46], a: [-30, 12], by: -0.21, bz: 0.09, bx: 0.01, hip: 0.18, sy: 0.0, sx: 0.3, sz: 0.0, l: [0.26, -0.06, 0.06], lp: [0.45, -0.85, -0.3], ld: [70, 15], pn: [-0.3, -1, 0], lk: 0 },
      { u: 1.75, h: [0.25, -0.22, 0.41], a: [30, -16] },
      { u: 2.0, h: [0.31, -0.33, 0.3], a: [72, -34], by: -0.28, bz: 0.13, bx: 0.05, hip: 0.38, sy: 0.4, sx: 0.42, sz: -0.07, fh: 'highWing', l: [0.32, 0.01, -0.22] },
      { u: 2.15, by: -0.3, bz: 0.15, bx: 0.06, hip: 0.48, sy: 0.54, sx: 0.47 },
      { u: 2.4, h: [0.34, -0.36, 0.16], a: [116, -28], by: -0.25, bz: 0.1, bx: 0.04, hip: 0.43, sy: 0.47, sx: 0.38, sz: -0.06, fh: 'highWing' },
    ],
  },
  /** The draw cut: low from behind the right hip, sinking into it, rising a little as it ends. */
  drawCut: {
    line: 'flat',
    lF: [0.18, 0.4], fy: [0.55, -0.6],
    keys: [
      { u: 0.6, by: -0.24, bz: -0.08, bx: -0.06, hip: -0.5, sy: -0.54, sx: 0.3 },
      { u: 1.0, h: [-0.16, -0.36, -0.02], a: [-118, -10], by: -0.22, bz: -0.06, bx: -0.05, hip: -0.42, sy: -0.48, sx: 0.26, fh: 'aimLo' },
      { u: 1.25, h: [0.02, -0.33, 0.3], a: [-76, -8] },
      { u: 1.5, h: [0.14, -0.3, 0.44], a: [-32, -5], by: -0.3, bz: 0.09, bx: 0.01, hip: 0.14, sy: 0.02, sx: 0.36, l: [0.24, -0.08, 0.14], lp: [0.45, -0.85, -0.3], ld: [60, 10], pn: [0, -1, 0], lk: 0 },
      { u: 1.75, h: [0.3, -0.25, 0.36], a: [36, 3] },
      { u: 2.0, h: [0.38, -0.19, 0.2], a: [96, 12], by: -0.25, bz: 0.12, bx: 0.05, hip: 0.4, sy: 0.42, sx: 0.28, fh: 'highWing', l: [0.34, 0.02, -0.18] },
      { u: 2.15, by: -0.23, bz: 0.13, bx: 0.06, hip: 0.5, sy: 0.54, sx: 0.3 },
      { u: 2.4, h: [0.36, -0.12, 0.1], a: [120, 12], by: -0.19, bz: 0.08, bx: 0.04, hip: 0.45, sy: 0.49, sx: 0.21, fh: 'highWing', l: [0.32, -0.02, -0.17] },
    ],
  },
  /** The rising slash: a skip in (combat.js `hop`), from behind the right knee up across his front
   *  to high left: the falling cut's other diagonal. */
  risingSlash: {
    line: 'left',
    fy: [0.3, -0.6],
    keys: [
      { u: 0.6, by: -0.31, bz: -0.08, bx: -0.06, hip: -0.44, sy: -0.5, sx: 0.42 },
      { u: 1.0, h: [-0.17, -0.36, -0.02], a: [-116, -30], by: -0.27, bz: -0.06, bx: -0.05, hip: -0.36, sy: -0.44, sx: 0.36, fh: 'chest' },
      { u: 1.25, h: [0.0, -0.28, 0.3], a: [-76, -20] },
      { u: 1.5, h: [0.14, -0.12, 0.46], a: [-30, -6], by: -0.15, bz: 0.08, bx: 0.01, hip: 0.14, sy: 0.02, sx: 0.24, l: [0.16, -0.34, 0.06], lp: [0.6, -0.6, -0.4], ld: [100, -50], pn: [-1, 0, 0], lk: 0 },
      { u: 1.75, h: [0.3, 0.08, 0.38], a: [32, 22] },
      // (the hips end at −0.08-0.1, not −0.02-0.04: higher, the rear toe skated 10 cm a frame)
      { u: 2.0, h: [0.38, 0.2, 0.22], a: [72, 44], by: -0.1, bz: 0.11, bx: 0.05, hip: 0.34, sy: 0.38, sx: 0.02, sz: -0.05, fh: 'tail', l: [0.24, -0.42, -0.3] },
      { u: 2.15, by: -0.08, bz: 0.12, bx: 0.06, hip: 0.44, sy: 0.5, sx: -0.05 },
      { u: 2.4, h: [0.4, 0.26, 0.08], a: [116, 40], by: -0.08, bz: 0.08, bx: 0.04, hip: 0.41, sy: 0.45, sx: -0.03, fh: 'tail' },
    ],
  },

  // ---- hit 2: left to right ------------------------------------------------------------------
  /** The rising backhand: from the left hip up across his front to high on the right. */
  risingBackhand: {
    line: 'right',
    fy: [0.45, -0.6],
    keys: [
      { u: 0.6, by: -0.28, bz: -0.07, bx: -0.06, hip: 0.46, sy: 0.53, sx: 0.36, fh: 'wrist', l: [0.1, -0.33, 0.28] },
      { u: 1.0, h: [0.36, -0.36, 0.14], a: [118, -30], by: -0.25, bz: -0.06, bx: -0.05, hip: 0.38, sy: 0.47, sx: 0.32, fh: 'wrist', l: [0.1, -0.33, 0.28], lk: 0.85 },
      { u: 1.1, l: [0.2, -0.3, 0.22], lp: [0.5, -0.8, -0.2], ld: [60, -30], pn: [0, -1, 0], lk: 0.25 },
      { u: 1.25, h: [0.28, -0.3, 0.32], a: [92, -25] },
      { u: 1.5, h: [0.13, -0.14, 0.46], a: [30, -8], by: -0.15, bz: 0.08, bx: 0.01, hip: -0.06, sy: 0.08, sx: 0.22, l: [0.34, -0.3, 0], lp: [0.4, -0.6, -0.6], ld: [95, -30], pn: [0, -1, 0], lk: 0 },
      { u: 1.75, h: [-0.08, 0.06, 0.42], a: [-30, 18] },
      { u: 2.0, h: [-0.2, 0.18, 0.3], a: [-70, 40], by: -0.05, bz: 0.11, bx: 0.05, hip: -0.34, sy: -0.34, sx: 0.04, sz: 0.06, fh: 'wingLo', l: [0.42, -0.32, -0.16] },
      { u: 2.15, by: -0.03, bz: 0.12, bx: 0.06, hip: -0.45, sy: -0.47, sx: -0.02 },
      { u: 2.4, h: [-0.24, 0.24, 0.12], a: [-116, 50], by: -0.04, bz: 0.08, bx: 0.04, hip: -0.41, sy: -0.43, sx: -0.03, sz: 0.05, fh: 'wingLo' },
    ],
  },
  /** The flat backhand: at chest height, rising a little, the whole body pivoting round with it. */
  flatBackhand: {
    line: 'flat',
    lF: [0.2, 0.36], fy: [0.7, -0.55],
    keys: [
      { u: 0.6, by: -0.19, bz: -0.07, bx: -0.06, hip: 0.48, sy: 0.56, sx: 0.18, fh: 'wrist', l: [0.08, -0.12, 0.3] },
      { u: 1.0, h: [0.36, -0.1, 0.22], a: [118, 5], by: -0.17, bz: -0.06, bx: -0.05, hip: 0.4, sy: 0.5, sx: 0.16, fh: 'wrist', l: [0.08, -0.12, 0.3], lk: 0.85 },
      { u: 1.1, l: [0.22, -0.1, 0.22], lp: [0.3, -0.8, -0.4], ld: [70, 0], pn: [0, -1, 0], lk: 0.25 },
      { u: 1.25, h: [0.24, -0.1, 0.38], a: [78, 2] },
      { u: 1.5, h: [0.1, -0.08, 0.46], a: [32, 2], by: -0.21, bz: 0.08, bx: 0.01, hip: -0.06, sy: 0.04, sx: 0.22, l: [0.4, -0.08, 0.02], lp: [0.15, -0.65, -0.75], ld: [95, 5], pn: [0, -1, 0], lk: 0 },
      { u: 1.75, h: [-0.16, -0.05, 0.42], a: [-34, 6] },
      { u: 2.0, h: [-0.3, -0.02, 0.26], a: [-94, 12], by: -0.19, bz: 0.11, bx: 0.05, hip: -0.38, sy: -0.38, sx: 0.12, fh: 'wing', l: [0.45, -0.16, -0.13] },
      { u: 2.15, by: -0.2, bz: 0.12, bx: 0.06, hip: -0.49, sy: -0.5, sx: 0.14 },
      { u: 2.4, h: [-0.32, 0.0, 0.1], a: [-122, 14], by: -0.16, bz: 0.08, bx: 0.04, hip: -0.45, sy: -0.47, sx: 0.09, fh: 'wing' },
    ],
  },
  /** The falling backhand: lifted over the left shoulder, a diagonal across his chest down to the
   *  right hip. */
  fallingBackhand: {
    line: 'left',
    lF: [0.15, 0.48], rF: [-0.17, -0.46], fy: [0.15, -0.75], drag: 0.14,
    keys: [
      // (no rise before it, `by` at the coil's height: out of a long stance the rise and the weight
      // drawn back took the front foot out of reach, and it skated 15 cm back through the windup)
      { u: 0.6, by: -0.1, bz: -0.08, bx: -0.06, hip: 0.42, sy: 0.51, sx: -0.06, l: [0.18, -0.3, 0.08] },
      { u: 1.0, h: [0.32, 0.1, 0.18], a: [120, 36], by: -0.09, bz: -0.06, bx: -0.05, hip: 0.34, sy: 0.45, sx: 0.0, sz: -0.05, fh: 'chest', l: [-0.06, -0.2, 0.26], ld: [15, 55] },
      { u: 1.25, h: [0.2, 0.06, 0.36], a: [80, 26] },
      { u: 1.5, h: [0.1, -0.06, 0.46], a: [30, 12], by: -0.21, bz: 0.09, bx: 0.01, hip: -0.06, sy: 0.0, sx: 0.3, l: [0.22, -0.1, 0.12], lp: [0.4, -0.85, -0.3], ld: [60, 40], pn: [-0.4, -1, 0], lk: 0 },
      { u: 1.75, h: [-0.12, -0.24, 0.4], a: [-30, -16] },
      { u: 2.0, h: [-0.24, -0.34, 0.26], a: [-70, -34], by: -0.28, bz: 0.13, bx: 0.05, hip: -0.34, sy: -0.38, sx: 0.4, sz: 0.07, fh: 'highWing', l: [0.32, 0.04, -0.2] },
      { u: 2.15, by: -0.3, bz: 0.15, bx: 0.06, hip: -0.45, sy: -0.5, sx: 0.45 },
      { u: 2.4, h: [-0.26, -0.38, 0.08], a: [-118, -28], by: -0.25, bz: 0.1, bx: 0.04, hip: -0.41, sy: -0.45, sx: 0.36, sz: 0.06, fh: 'highWing' },
    ],
  },

  // ---- hit 3 ---------------------------------------------------------------------------------
  /** The whirl: he follows the backhand round to his right, a full turn (combat.js `spin`) with the
   *  sword arm thrown out and the free arm carried out by the turn; the blade dips through the turn,
   *  crosses his front late in it and carries on round to his right. */
  whirl: {
    line: 'flat',
    keys: [
      { u: 0.5, by: -0.2, sx: 0.2 },
      { u: 1.0, h: [-0.34, -0.05, 0.0], a: [-128, 12], by: -0.16, hip: -0.16, sy: -0.24, sx: 0.14, fh: 'chest', bx: -0.04 },
      { u: 1.5, h: [-0.4, -0.06, 0.14], a: [-100, 4], by: -0.2, hip: -0.1, sy: -0.12, sx: 0.22, fh: 'chest', l: [-0.06, -0.24, 0.24] },
      { u: 2.0, h: [-0.36, -0.1, 0.26], a: [-62, -6], by: -0.24, bz: 0.06, hip: -0.12, sy: -0.2, sx: 0.26, fh: 'wing', l: [0.45, -0.16, -0.1], bx: 0.05 },
      { u: 2.35, h: [-0.34, -0.14, 0.2], a: [-50, -8], by: -0.2, bz: 0.05, hip: -0.32, sy: -0.4, sx: 0.2, fh: 'wing' },
    ],
  },
  /** The rising whirl: the same turn out of a crouch, the blade spiralling up from the knee. */
  risingWhirl: {
    line: 'spiral',
    keys: [
      { u: 0.5, by: -0.31, sx: 0.36 },
      { u: 1.0, h: [-0.3, -0.3, 0.0], a: [-128, -32], by: -0.28, hip: -0.16, sy: -0.24, sx: 0.32, fh: 'chest', l: [-0.06, -0.3, 0.26], ld: [0, 40], bx: -0.04 },
      { u: 1.5, h: [-0.4, -0.14, 0.14], a: [-100, -5], by: -0.17, hip: -0.1, sy: -0.12, sx: 0.2, fh: 'chest', l: [-0.04, -0.3, 0.24], ld: [0, 40] },
      { u: 2.0, h: [-0.34, 0.1, 0.26], a: [-62, 30], by: -0.05, bz: 0.06, hip: -0.12, sy: -0.2, sx: 0.04, fh: 'wingLo', l: [0.42, -0.3, -0.12], bx: 0.05 },
      { u: 2.35, h: [-0.3, 0.16, 0.2], a: [-52, 34], by: -0.03, bz: 0.05, hip: -0.32, sy: -0.38, sx: -0.02, fh: 'wingLo' },
    ],
  },
  /** The low sweep: dropping from the backhand's finish into a crouch, the blade skimming the grass
   *  right to left and lifting as it ends, the free hand up for balance. */
  lowSweep: {
    line: 'low',
    lF: [0.2, 0.44], rF: [-0.19, -0.44], fy: [0.5, -0.85],
    keys: [
      { u: 0.6, by: -0.3, bz: -0.08, bx: -0.06, hip: -0.44, sy: -0.48, sx: 0.38 },
      { u: 1.0, h: [-0.22, -0.32, -0.16], a: [-126, -14], by: -0.35, bz: -0.06, hip: -0.36, sy: -0.42, sx: 0.42, fh: 'chest', l: [-0.04, -0.24, 0.28], bx: -0.05 },
      { u: 1.4, h: [-0.06, -0.36, 0.24], a: [-72, -13] },
      // (the blade crosses his front late in the cut, when the step in is nearly done: a low blade
      // reaches less far under a tall target, combat.js REACH)
      { u: 1.65, h: [0.13, -0.34, 0.45], a: [-8, -10], by: -0.37, bz: 0.08, hip: 0.1, sy: 0.05, sx: 0.5, l: [0.18, 0.12, 0.06], lp: [0.8, -0.5, 0.3], ld: [-5, 75], pn: [0.2, 0, 1], lk: 0, bx: 0.02 },
      { u: 1.85, h: [0.28, -0.35, 0.34], a: [52, -9] },
      { u: 2.0, h: [0.36, -0.32, 0.18], a: [94, -4], by: -0.36, bz: 0.1, hip: 0.36, sy: 0.4, sx: 0.44, fh: 'high', bx: 0.05 },
      { u: 2.15, by: -0.37, bz: 0.11, bx: 0.06, hip: 0.44, sy: 0.5, sx: 0.47 },
      { u: 2.2, h: [0.36, -0.29, 0.13], a: [108, 2], by: -0.31, bz: 0.08, hip: 0.41, sy: 0.46, sx: 0.39, fh: 'high', l: [0.26, 0.16, -0.08], bx: 0.04 },
    ],
  },

  // ---- hit 4: along the line ------------------------------------------------------------------
  // Both thrusts RISE: the point is driven up at 35-45°, at a tall foe's chest. (They were level. The
  // game camera looks down at 58° on a hero drawn leaned upright: a level blade pointed toward that
  // camera is drawn straight down the screen from his hand to the grass between his feet, as if he
  // had planted it in the ground. Session 26, owner: "the 4th poke on the sword combo is like
  // clipping through the ground".)
  /** The lunge: the hand drawn back to the ribs with the point already up, then one long line from
   *  the rear heel through the arm to the point, driven forward and up; the free hand drawn back to
   *  the hip as the sword arm drives out. */
  lunge: {
    line: 'point',
    follow: [0.5, 60, 8], // (anim.js swingPose: the chamber's point toward the side the blade comes from)
    cut: [0, 0.03], // (the chamber keeps the whole windup: the drive is short)
    apex: false, // (the hand comes in to the ribs from where the last cut left it and drives on: a curve, not a stop)
    rF: [-0.17, -0.5], fy: [0.1, -0.8], drag: 0.12,
    lF: [0.14, 0.58],
    keys: [
      { u: 0.6, by: -0.14, bz: -0.11, bx: -0.05, hip: -0.42, sy: -0.56, sx: 0.02 },
      { u: 1.0, h: [-0.03, -0.2, -0.08], a: [-22, 18], by: -0.18, bz: -0.09, hip: -0.34, sy: -0.5, sx: 0.08, fh: 'aim', l: [0.02, -0.08, 0.36], ld: [-6, 12], bx: -0.04 },
      { u: 1.2, l: [0.08, -0.2, 0.28], lp: [0.45, -0.85, -0.2], ld: [30, -20], pn: [-0.5, -1, 0], lk: 0 },
      { u: 1.45, h: [0.08, -0.08, 0.26], a: [-3, 28], by: -0.24, bz: 0.06, hip: -0.04, sy: -0.06, sx: 0.26, l: [0.2, -0.38, 0.04], lp: [0.6, -0.7, -0.3], ld: [100, -65], pn: [-1, 0, 0], lk: 0, bx: 0.0 },
      { u: 1.75, h: [0.15, 0.1, 0.48], a: [0, 35] },
      { u: 1.9, by: -0.28, bz: 0.16, hip: 0.24, sy: 0.34, sx: 0.4, fh: 'tail', l: [0.24, -0.34, -0.26], ld: [170, -58], bx: 0.04 },
      { u: 2.1, by: -0.3, bz: 0.18, bx: 0.04, hip: 0.27, sy: 0.37, sx: 0.44 },
      { u: 2.45, h: [0.12, 0.14, 0.53], a: [-9, 37], by: -0.25, bz: 0.12, hip: 0.22, sy: 0.3, sx: 0.37, fh: 'tail', bx: 0.03 },
      { u: 2.8, h: [0.09, 0.15, 0.5], a: [-14, 37] },
    ],
  },
  /** The rising thrust: out of a crouch, the whole body rising behind the point as it drives up
   *  steeply into the target. */
  risingThrust: {
    line: 'point',
    follow: [0.5, 60, 8],
    cut: [0, 0.03],
    apex: false,
    rF: [-0.17, -0.5], fy: [0.1, -0.8], drag: 0.12,
    lF: [0.14, 0.58],
    keys: [
      { u: 0.5, l: [0.2, -0.24, 0.1], lp: [0.7, -0.5, -0.4], ld: [40, -30], pn: [0, -1, 0], lk: 0 },
      // (at u 0.7, not 0.6: out of the low sweep's finish on the far side the hips have 0.83 rad to
      // turn back through before it, and at 0.6 they whipped round 15° a frame)
      { u: 0.7, by: -0.36, bz: -0.1, bx: -0.05, hip: -0.42, sy: -0.52, sx: 0.36 },
      { u: 1.0, h: [-0.04, -0.34, -0.06], a: [-18, 22], by: -0.33, bz: -0.08, hip: -0.34, sy: -0.46, sx: 0.3, l: [0.06, -0.42, 0.14], lp: [0.6, -0.3, -0.7], ld: [0, -20], pn: [0, -1, 0], lk: 0, bx: -0.04 },
      { u: 1.45, h: [0.07, -0.14, 0.26], a: [-2, 34], by: -0.22, bz: 0.06, hip: -0.04, sy: -0.06, sx: 0.24, l: [0, -0.24, 0.32], lp: [0.4, -0.9, -0.1], ld: [0, 10], pn: [-0.6, -0.8, 0], lk: 0 },
      // (it rises to −0.15, not −0.07: standing up over its 1 m bow put the rear foot out of reach,
      // and its toe skated 14-23 cm in two frames)
      { u: 1.75, h: [0.14, 0.18, 0.46], a: [0, 45] },
      { u: 1.9, by: -0.15, bz: 0.15, hip: 0.24, sy: 0.32, sx: 0.12, fh: 'aim', l: [-0.02, -0.06, 0.42], ld: [-8, 30], pn: [-1, -0.3, 0], bx: 0.04 },
      { u: 2.1, by: -0.17, bz: 0.16, bx: 0.04, hip: 0.27, sy: 0.36, sx: 0.08 },
      { u: 2.45, h: [0.11, 0.22, 0.51], a: [-9, 46], by: -0.15, bz: 0.11, hip: 0.22, sy: 0.3, sx: 0.12, fh: 'aim', l: [0, -0.08, 0.4], ld: [-8, 28], pn: [-1, -0.3, 0], bx: 0.03 },
      { u: 2.8, h: [0.08, 0.23, 0.48], a: [-14, 45] },
    ],
  },

  // ---- hit 5: the finisher ---------------------------------------------------------------------
  /** The slam (combat.js LIGHT[4], kind 'slam'), both hands on the grip. The windup is its own
   *  anticipation: he GATHERS (dips and coils right, the hands drawing the blade down-back past the
   *  right hip), then rises off the ground (combat.js `hop`) as the blade sweeps up his right side,
   *  where the camera behind him sees it, and cocks back over the right shoulder. The blow is one
   *  diagonal from there down across his front into the ground ahead and a little left, the hands
   *  leading and the steel whipping over after them; he lands folded over the planted blade and holds
   *  it (the shards burst at the point: player.js).
   *  (Until Session 26 the slam was its own code: the blade went over the top of his head in an
   *  upright plane leaned 24°, and the hands covered half a metre in one frame of the blow.) */
  slam: {
    line: 'down',
    home: 0.22,
    cut: [0.04, 0], // (the blow lands as the active frames end: the shards burst there, player.js)
    apex: false, // (the raise comes down into the coil over the shoulder and the blow carries on down: a curve)
    step: [0.45, 1.5],
    drag: 0.25,
    keys: [
      { u: 0.4, two: 1, lp: [0.7, -0.6, 0.3], by: -0.2, hip: -0.2, sy: -0.34, sx: 0.32, sz: 0.06, hx: 0.12, hy: 0.38, hs: 0 },
      { u: 0.75, h: [-0.07, 0.1, 0.18], a: [-110, 64], two: 1, by: -0.05, hip: -0.24, sy: -0.3, sx: -0.06, sz: 0.04, hx: -0.16, hy: 0.3, hs: 0 },
      { u: 1.0, h: [-0.06, 0.22, 0.16], a: [-146, 46], two: 1, by: -0.03, bz: -0.06, hip: -0.3, sy: -0.42, sx: -0.14, sz: 0.05, hx: -0.2, hy: 0.5, hs: 0 },
      { u: 1.25, h: [0.06, 0.22, 0.3], a: [-104, 42] },
      { u: 1.5, h: [0.13, 0.1, 0.45], a: [-34, 22], two: 1, by: -0.14, bz: 0.05, hip: 0.04, sy: 0.0, sx: 0.28, sz: 0.0, hx: 0.0, hy: 0.0, hs: 0 },
      { u: 1.75, h: [0.19, -0.16, 0.46], a: [8, -18] },
      { u: 2.0, h: [0.2, -0.36, 0.36], a: [16, -48], two: 1, by: -0.34, bz: 0.12, hip: 0.22, sy: 0.26, sx: 0.62, sz: -0.05, hx: 0.1, hy: -0.3, hs: 0 },
      { u: 2.2, h: [0.2, -0.38, 0.35], a: [16, -50], two: 1, by: -0.38, bz: 0.12, hip: 0.22, sy: 0.26, sx: 0.68, sz: -0.05, hx: 0.26, hy: -0.3, hs: 0 },
      { u: 2.55, h: [0.2, -0.38, 0.35], a: [16, -50], two: 1, by: -0.36, bz: 0.12, hip: 0.22, sy: 0.26, sx: 0.66, sz: -0.05, hx: 0.2, hy: -0.3, hs: 0 },
    ],
  },

  // ---- the charged attack ----------------------------------------------------------------------
  /** The dashing cleave (combat.js CLEAVE), both hands on the grip: he leaves the charge's coil
   *  leaning into the dash with the blade still up beside his head, winding back over the shoulder,
   *  and as the dash dies out the whole body unwinds: one diagonal from high right across his chest
   *  to past the left hip, sinking into a long low lunge. The off hand lets go as the blade sweeps
   *  on behind him and snaps into sword fingers pointing at the foe, and he holds that finish. */
  cleave: {
    line: 'right',
    home: 0.385,
    lead: [0.033, 0], // (a chest lead put his head 2.1-2.2 cm into the upright blade: HEROLOOK)
    fold: 0, // (the bite's chest fold and head nod put his head 2.5 cm into it at a close contact)
    keys: [
      // (Session 30: the coil's blade and the wind back over the shoulder passed 10-14 cm from the head's
      // axis, inside the hood: the hands stay out to his right and the blade winds back OUT over the
      // shoulder, not in beside the ear)
      { u: 0.9, h: [-0.1, -0.08, 0.3], a: [-84, 74], two: 1, lp: [0.7, -0.6, 0.3], by: -0.26, bz: 0.05, hip: -0.34, sy: -0.5, sx: 0.34, hs: 0 },
      // (u 1.3, not 1.4: the hand has four frames to come across to the cut's first key; at 1.4 it went
      // 21 cm out and 11 cm back in one frame, a hitch in the release)
      { u: 1.3, h: [-0.17, 0.02, 0.22], a: [-122, 50], two: 1, by: -0.23, bz: 0.06, hip: -0.32, sy: -0.52, sx: 0.38, hs: 0 },
      { u: 1.55, h: [0.05, 0.1, 0.28], a: [-110, 40] },
      { u: 1.7, h: [0.14, -0.03, 0.44], a: [-38, 16], by: -0.26, hip: 0.1, sy: 0.0, sx: 0.4 },
      { u: 1.86, h: [0.24, -0.24, 0.4], a: [28, -18] },
      { u: 2.0, h: [0.3, -0.36, 0.3], a: [68, -36], two: 1, by: -0.32, bz: 0.08, hip: 0.36, sy: 0.4, sx: 0.5, hs: 0 },
      { u: 2.25, h: [0.36, -0.4, 0.12], a: [125, -28], two: 0, by: -0.34, hip: 0.42, sy: 0.5, sx: 0.46, hs: 1, fh: 'aim', l: [0.02, -0.1, 0.42], ld: [-4, 6] },
      { u: 2.6, h: [0.36, -0.4, 0.12], a: [128, -26], two: 0, by: -0.33, hip: 0.42, sy: 0.5, sx: 0.44, hs: 1, fh: 'aim', l: [0.02, -0.1, 0.42], ld: [-4, 6] },
    ],
  },

  // ---- out of a sprint / a roll ----------------------------------------------------------------
  /** The sprint slash: on the run, from behind the right knee up across his front to high left. */
  sprintSlash: {
    line: 'left',
    cut: [0.03, 0.07],
    keys: [
      { u: 1.0, h: [-0.16, -0.37, -0.18], a: [-120, -32], by: -0.22, hip: -0.32, sy: -0.42, sx: 0.42, fh: 'tail', l: [0.2, -0.36, -0.2] },
      { u: 1.3, h: [-0.01, -0.3, 0.26], a: [-80, -22] },
      { u: 1.5, h: [0.14, -0.12, 0.47], a: [-30, -4], by: -0.16, bz: 0.05, hip: 0.1, sy: 0.0, sx: 0.25, fh: 'tail', l: [0.22, -0.42, -0.22] },
      { u: 1.75, h: [0.3, 0.08, 0.38], a: [32, 24] },
      { u: 2.0, h: [0.4, 0.2, 0.2], a: [74, 46], by: -0.05, bz: 0.05, hip: 0.3, sy: 0.34, sx: 0.02, fh: 'tail', l: [0.24, -0.44, -0.3] },
      { u: 2.12, by: -0.02, hip: 0.37, sy: 0.43, sx: -0.06 },
      { u: 2.35, h: [0.4, 0.26, 0.06], a: [116, 42], by: -0.03, hip: 0.34, sy: 0.4, sx: -0.04, fh: 'tail' },
    ],
  },
  /** The roll cut: out of the roll's crouch, low from the right and rising past the left shoulder. */
  rollCut: {
    line: 'left',
    cut: [0.03, 0.07],
    keys: [
      { u: 0.6, by: -0.38, bz: -0.06, bx: -0.05, hip: -0.46, sy: -0.5, sx: 0.48 },
      { u: 1.0, h: [-0.14, -0.37, -0.14], a: [-118, -12], by: -0.36, hip: -0.38, sy: -0.44, sx: 0.45, fh: 'aimLo', l: [0.06, -0.3, 0.34], bx: -0.04 },
      { u: 1.3, h: [-0.01, -0.34, 0.25], a: [-80, -10] },
      { u: 1.5, h: [0.14, -0.28, 0.44], a: [-30, -6], by: -0.3, bz: 0.08, hip: 0.1, sy: 0.02, sx: 0.4, l: [0.18, -0.38, 0.04], lp: [0.6, -0.6, -0.4], ld: [100, -50], pn: [-1, 0, 0], lk: 0 },
      { u: 1.75, h: [0.3, -0.16, 0.36], a: [34, 8] },
      // (the hips end at −0.16-0.22, not −0.12-0.17: higher, the rear toe skated 14 cm after the body)
      { u: 2.0, h: [0.38, -0.05, 0.2], a: [82, 26], by: -0.22, bz: 0.1, hip: 0.34, sy: 0.38, sx: 0.2, fh: 'tail', l: [0.24, -0.42, -0.28], bx: 0.05 },
      { u: 2.15, by: -0.18, bz: 0.1, bx: 0.06, hip: 0.42, sy: 0.5, sx: 0.12 },
      { u: 2.4, h: [0.38, 0.05, 0.08], a: [118, 30], by: -0.16, hip: 0.39, sy: 0.45, sx: 0.14, fh: 'tail' },
    ],
  },
};
