// The hero's swings as keyframed clips (data only; anim.js `swingPose` plays them, combat.js names
// one per hit: `anim: { kind: 'clip', clip: '<name>' }`).
//
// A clip is a list of KEYS over the attack's own phases, so a clip follows its hit's timing:
//   u  0 … 1  the windup      (0 = the pose he was in when the swing started: the clip always
//                               starts from there, whatever it was)
//      1 … 2  the active frames (the hit test reads the drawn blade: it must cross his front here)
//      2 … 3  the recovery     (from `home`, default 0.3 of it, anim.js eases him back to the ready
//                               stance while the last keys are still moving, so the follow-through
//                               runs into the way home without a stop; a clip that HOLDS its finish
//                               gives a later `home` and keys up to it)
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
//   face, which they would put his head into). The blink look set's (lightsBlink.js, heaviesBlink.js,
//   lastHits.js, specialsBlink.js): `side` (the free hand hangs loose at his side the whole
//   swing, on a pendulum the body carries: anim.js sideHand / HeroAnimator._sideHand; its keys'
//   free-hand fields are ignored), `slash` / `slashLook` (the slash
//   lines blinkFx.js draws on the blade's path), `plain` (a slam-kind hit that bursts no shards:
//   player.js _slamImpact). The steel look set's: `settle` (seconds, default 0.16: how long he takes from
//   the clip's last pose to the standing pose once the attack is over, player.js _tickAttack; he is free
//   to act the whole time, so it changes no timing: with a late `home` the finish is held to the end of
//   the recovery and he rises out of it slowly, as the owner's reference footage does); `dashPlant` (a
//   `feet: 'dash'` clip: the rear foot the root's travel leaves stretched behind the lunge steps in and
//   stays on the grass within the leg's reach, anim.js dashFeet / DASH_PLANT, instead of hanging off the
//   ground behind him).
//
// Authoring notes: a cut reads as powered by the body when the hips lead (their turn is ahead of the
// chest's at mid-cut), the hand is furthest from the shoulder as the blade crosses his front, and the
// weight goes from the back foot (`bz` -, the hips up) into the front one (`bz` +, the hips down).
// The COIL is one key, at u = 1: the blade is still moving as it gets there and turns into the cut
// (two keys there made a dead stop, a hitch between the hits of a chain). Around it, two BODY-ONLY
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

import { LIGHTS_OLD } from './lightsOld.js';
import { LIGHTS_FRESH } from './lightsFresh.js';
import { LIGHTS_BLINK } from './lightsBlink.js';
import { HEAVIES_BLINK } from './heaviesBlink.js';
import { LAST_HITS_BLINK } from './lastHits.js';
import { SPECIALS_BLINK } from './specialsBlink.js';
import { STEEL_CHAIN_A } from './steelChainA.js';
import { STEEL_CHAIN_B } from './steelChainB.js';
import { STEEL_HEAVIES_C } from './steelHeaviesC.js';
import { STEEL_HEAVIES_D } from './steelHeaviesD.js';
import { STEEL_SPECIALS_E } from './steelSpecialsE.js';
import { CUTS_A } from './cutsA.js';
import { CUTS_B } from './cutsB.js';
import { CUTS_C } from './cutsC.js';
import { CUTS_D } from './cutsD.js';
import { FINISH_BLINK } from './blinkFinish.js';
import { HEAVY_OPT_A } from './heavyOptA.js';
import { HEAVY_OPT_B } from './heavyOptB.js';
import { HEAVY_OPT_C } from './heavyOptC.js';
import { LIGHTS_NATURAL } from './lightsNatural.js';

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

/**
 * Bigger arcs (`?arcs=a|b|c`, the Lab's PLAYER → `arcs` row; a prototype for the owner to pick a
 * strength from, ADR-188): every chain cut marked `arcs: true` swings its blade further round his
 * body. The blade's azimuth is stretched × k away from its azimuth at the contact key (the key in
 * the active frames that points nearest ahead), so the coil starts further behind him and the finish
 * carries further past; the hand's path after the contact is stretched less (1 + 0.45 (k − 1)), its reach capped. The
 * contact pose stays where it was, so the cut still crosses his front inside the active frames;
 * the steel covers more ground in the same time, so it moves faster and the arc behind it is longer.
 * '0' = the clips as written.
 */
export const ARC_IDS = ['0', 'a', 'b', 'c'];
export const ARC_K = { 0: 1, a: 1.2, b: 1.4, c: 1.6 };
export const ARCS = { mode: '0', k: 1 };
/** The bigger-arc strength now ('0', 'a', 'b', 'c'). */
export const arcsMode = () => ARCS.mode;
/** Set it; false for an unknown id. anim.js compiles a clip per strength. */
export function setArcs(mode) {
  const m = String(mode);
  if (!ARC_IDS.includes(m)) return false;
  ARCS.mode = m;
  ARCS.k = ARC_K[m];
  return true;
}
{
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('arcs') : null;
  if (q) setArcs(q);
}
const ARC_REACH = 0.56; // m: the stretched hand stays within this of the shoulder
const ARC_BACK = [95, 150, 165]; // deg: the furthest round a stretched blade goes: raised over 25° (it would point up at the camera behind him) / raised / low
/** A clip's keys with the blade's arc stretched × k (see ARCS). Returns new key objects. */
export function widenArcs(keys, k) {
  if (!(k > 1)) return keys;
  const out = keys.map((K) => ({ ...K }));
  const A = out.filter((K) => Array.isArray(K.a)).sort((x, y) => x.u - y.u);
  if (A.length < 2) return out;
  // unwrap the azimuths along the cut, so a cut through behind him stretches the right way
  const un = [A[0].a[0]];
  for (let i = 1; i < A.length; i++) {
    let d = A[i].a[0] - A[i - 1].a[0];
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    un.push(un[i - 1] + d);
  }
  let c = -1;
  A.forEach((K, i) => { if (K.u >= 1 && K.u <= 2 && (c < 0 || Math.abs(A[i].a[0]) < Math.abs(A[c].a[0]))) c = i; });
  if (c < 0) return out;
  const az0 = un[c], hc = A[c].h;
  const kh = 1 + 0.45 * (k - 1);
  // (the keys after the cut, the brake and the hold, take half of the finish's shift: stretched in
  // full, the follow-through swung the steel round behind his head, 6-15 cm from its centre)
  const fin = A.reduce((b, K, i) => (K.u <= 2.001 ? i : b), c);
  const shift = (k - 1) * (un[fin] - az0);
  A.forEach((K, i) => {
    const az = K.u <= 2.001 ? az0 + k * (un[i] - az0) : un[i] + 0.5 * shift;
    // never further round behind him than ARC_BACK (or than the key was written), on the key's own
    // side: measured from the key's own azimuth, so a stretch past straight behind him stops at the
    // limit instead of coming round onto his other shoulder
    const lim = ARC_BACK[K.a[1] > 25 ? 0 : K.a[1] > 0 ? 1 : 2];
    const orig = ((((un[i] + 180) % 360) + 360) % 360) - 180; // (−180, 180)
    let s = orig + (az - un[i]);
    const cap = Math.max(lim, Math.abs(orig));
    if (Math.abs(s) > cap) s = (orig < 0 ? -1 : 1) * cap;
    K.a = [s, K.a[1]];
    // (the hand only on the follow-through side: stretched before the contact it ran the sword hand
    // into the free hand gathered on its wrist, and an arm turned 64° in a frame)
    if (K.u > A[c].u && Array.isArray(K.h) && Array.isArray(hc)) {
      const h = K.h.map((v, j) => hc[j] + kh * (v - hc[j]));
      const l = Math.hypot(h[0], h[1], h[2]);
      K.h = l > ARC_REACH ? h.map((v) => (v * ARC_REACH) / l) : h;
    }
  });
  return out;
}

export const SWINGS = {
  // ---- the light chain (ADR-188: the weight pass; the clips before it: lightsOld.js, ?lights=old) ---
  // The same hits on the same clock (combat.js LIGHT: windup, active frames and recovery as they were;
  // the hand and the blade cross his front along the paths they had, so the hit test reads the same
  // blade), with the weight put in by the body. Each clip has, in this order:
  //   LOAD      (u ≈ 0.55, body only) the hips and the chest wind on past the coil, away from the
  //             cut, and the weight sinks back onto the rear foot while the hand is still on its way
  //             to the coil (`lead` 45 / 24 ms: the hips and the chest run further ahead of the hand)
  //   COIL      (u 1) the blade drawn further round behind him than before (a wider arc in the same
  //             time: the steel moves faster through the cut)
  //   PLANT     (`step` [0.1, 1.3]) the front foot lands before the contact, not at it: the cut is
  //             driven off a planted foot and the body carries on over it
  //   DRIVE     (u ≈ 1.5, the contact) the hips sunk 3-5 cm deeper and 3-4 cm further onto the front
  //             foot, the chest leaning into the blow, the free arm thrown the other way
  //   FINISH    (u 2) the blade carried 8-10° further past the target, the body lower
  //   OVERSHOOT (u ≈ 2.18, body only) the hips and the chest run on 0.14-0.16 rad past the finish and
  //             the hips drop to their lowest: the weight lands
  //   HOLD      (the last key, u ≈ 2.5; `home` 0.36: he starts back to the ready stance later) the
  //             blade drifts on a little and the body rises a few centimetres out of the overshoot,
  //             so the finish is a pose he holds, not a stop
  // The free hand goes further each way (the counterweight). The finisher (groundSlam) gathers lower,
  // arches further back at the top of its leap and lands deeper over the planted blade, and holds it.

  // ---- hit 1: right to left ------------------------------------------------------------------
  /** The falling cut: cocked beside the head, a diagonal from high right across his chest down
   *  past the left hip. */
  fallingCut: {
    line: 'right', gather: [0.4, 0.8], arcs: true,
    lF: [0.15, 0.52], rF: [-0.17, -0.46], fy: [0.15, -0.75], drag: 0.16,
    home: 0.3, step: [0.1, 1.3],
    keys: [
      { u: 0.6, by: -0.06, bz: -0.11, bx: -0.07, hip: -0.46, sy: -0.54, sx: -0.12 },
      { u: 1.0, h: [-0.06, 0.2, 0.0], a: [-158, 40], by: -0.09, bz: -0.08, bx: -0.05, hip: -0.36, sy: -0.45, sx: -0.05, sz: 0.05, fh: 'aim' },
      { u: 1.25, h: [0.02, 0.14, 0.24], a: [-105, 32] },
      { u: 1.5, h: [0.14, -0.05, 0.46], a: [-30, 12], by: -0.29, bz: 0.12, bx: 0.02, hip: 0.18, sy: 0.0, sx: 0.41, sz: 0.0, l: [0.3, -0.04, 0.02], lp: [0.45, -0.85, -0.3], ld: [80, 15], pn: [-0.3, -1, 0], lk: 0 },
      { u: 1.75, h: [0.25, -0.23, 0.41], a: [32, -17] },
      { u: 2.0, h: [0.31, -0.34, 0.29], a: [80, -35], by: -0.36, bz: 0.15, bx: 0.06, hip: 0.42, sy: 0.45, sx: 0.53, sz: -0.07, fh: 'highWing', l: [0.36, 0.04, -0.26] },
      { u: 2.15, h: [0.33, -0.36, 0.18], a: [121, -28] },
      { u: 2.18, by: -0.4, bz: 0.17, bx: 0.07, hip: 0.57, sy: 0.62, sx: 0.59 },
      { u: 2.45, h: [0.34, -0.37, 0.14], a: [134, -26], by: -0.36, bz: 0.12, bx: 0.05, hip: 0.5, sy: 0.55, sx: 0.48, sz: -0.06, fh: 'highWing', l: [0.36, 0.02, -0.24] },
    ],
  },
  /** The draw slash: low from behind the right hip, sinking into it, rising a little as it ends (the
   *  chain's draw cut: `drawCut` below is the flurry's and One Breath's, as it was). */
  drawSlash: {
    line: 'flat', gather: [0.4, 0.8], arcs: true,
    lF: [0.18, 0.42], fy: [0.55, -0.6],
    home: 0.3, step: [0.1, 1.3],
    keys: [
      { u: 0.6, by: -0.28, bz: -0.1, bx: -0.07, hip: -0.5, sy: -0.56, sx: 0.32 },
      { u: 1.0, h: [-0.14, -0.37, -0.16], a: [-162, -12], by: -0.25, bz: -0.07, bx: -0.05, hip: -0.42, sy: -0.48, sx: 0.28, fh: 'aimLo' },
      { u: 1.3, h: [0.0, -0.34, 0.26], a: [-106, -10] },
      { u: 1.5, h: [0.14, -0.3, 0.44], a: [-32, -5], by: -0.37, bz: 0.12, bx: 0.02, hip: 0.14, sy: 0.02, sx: 0.44, l: [0.26, -0.06, 0.12], lp: [0.45, -0.85, -0.3], ld: [70, 10], pn: [0, -1, 0], lk: 0 },
      { u: 1.75, h: [0.3, -0.25, 0.36], a: [38, 3] },
      { u: 2.0, h: [0.38, -0.19, 0.2], a: [104, 12], by: -0.34, bz: 0.15, bx: 0.06, hip: 0.44, sy: 0.46, sx: 0.37, fh: 'highWing', l: [0.36, 0.05, -0.22] },
      { u: 2.15, h: [0.37, -0.14, 0.13], a: [131, 20] },
      { u: 2.18, by: -0.34, bz: 0.16, bx: 0.07, hip: 0.58, sy: 0.6, sx: 0.39 },
      { u: 2.45, h: [0.36, -0.12, 0.1], a: [140, 22], by: -0.31, bz: 0.11, bx: 0.05, hip: 0.5, sy: 0.53, sx: 0.29, fh: 'highWing', l: [0.34, 0.02, -0.2] },
    ],
  },
  /** The rising slash: a skip in (combat.js `hop`), from behind the right knee up across his front
   *  to high left: the falling cut's other diagonal. */
  risingSlash: {
    line: 'left', gather: [0.4, 0.8], arcs: true,
    fy: [0.3, -0.6],
    home: 0.3,
    keys: [
      { u: 0.6, by: -0.35, bz: -0.1, bx: -0.07, hip: -0.48, sy: -0.55, sx: 0.45 },
      { u: 1.0, h: [-0.16, -0.36, -0.14], a: [-160, -34], by: -0.3, bz: -0.07, bx: -0.05, hip: -0.36, sy: -0.44, sx: 0.38, fh: 'chest' },
      { u: 1.25, h: [-0.01, -0.3, 0.26], a: [-104, -28] },
      { u: 1.5, h: [0.14, -0.12, 0.46], a: [-30, -6], by: -0.22, bz: 0.11, bx: 0.02, hip: 0.14, sy: 0.02, sx: 0.33, l: [0.16, -0.36, 0.04], lp: [0.6, -0.6, -0.4], ld: [100, -50], pn: [-1, 0, 0], lk: 0 },
      { u: 1.75, h: [0.3, 0.08, 0.38], a: [34, 23] },
      // (the hips end at −0.08-0.1, not −0.02-0.04: higher, the rear toe skated 10 cm a frame)
      { u: 2.0, h: [0.38, 0.2, 0.22], a: [76, 38], by: -0.13, bz: 0.13, bx: 0.06, hip: 0.38, sy: 0.42, sx: 0.07, sz: -0.05, fh: 'tail', l: [0.26, -0.44, -0.34] },
      { u: 2.15, h: [0.4, 0.22, 0.15], a: [88, 32] },
      { u: 2.18, by: -0.14, bz: 0.14, bx: 0.07, hip: 0.52, sy: 0.58, sx: 0.01 },
      { u: 2.45, h: [0.4, 0.22, 0.12], a: [94, 27], by: -0.11, bz: 0.1, bx: 0.05, hip: 0.46, sy: 0.5, sx: 0.03, fh: 'tail' },
    ],
  },

  // ---- hit 2: left to right ------------------------------------------------------------------
  /** The rising backhand: from the left hip up across his front to high on the right. */
  risingBackhand: {
    line: 'right', gather: [0.4, 0.8], arcs: true,
    fy: [0.45, -0.6],
    home: 0.3, step: [0.1, 1.3],
    keys: [
      { u: 0.55, by: -0.32, bz: -0.09, bx: -0.07, hip: 0.5, sy: 0.58, sx: 0.4, fh: 'wrist', l: [0.1, -0.33, 0.28] },
      { u: 1.0, h: [0.36, -0.37, 0.06], a: [152, -30], by: -0.28, bz: -0.07, bx: -0.05, hip: 0.38, sy: 0.47, sx: 0.34, fh: 'wrist', l: [0.1, -0.33, 0.28], lk: 0.85 },
      { u: 1.1, l: [0.2, -0.3, 0.22], lp: [0.5, -0.8, -0.2], ld: [60, -30], pn: [0, -1, 0], lk: 0.25 },
      { u: 1.25, h: [0.28, -0.3, 0.32], a: [100, -26] },
      { u: 1.5, h: [0.13, -0.14, 0.46], a: [30, -8], by: -0.23, bz: 0.11, bx: 0.02, hip: -0.06, sy: 0.08, sx: 0.31, l: [0.36, -0.3, -0.02], lp: [0.4, -0.6, -0.6], ld: [100, -30], pn: [0, -1, 0], lk: 0 },
      { u: 1.75, h: [-0.08, 0.06, 0.42], a: [-32, 19] },
      { u: 2.0, h: [-0.2, 0.18, 0.3], a: [-78, 42], by: -0.1, bz: 0.13, bx: 0.06, hip: -0.38, sy: -0.38, sx: 0.09, sz: 0.06, fh: 'wingLo', l: [0.44, -0.34, -0.2] },
      { u: 2.15, h: [-0.23, 0.22, 0.16], a: [-114, 48] },
      { u: 2.18, by: -0.09, bz: 0.14, bx: 0.07, hip: -0.52, sy: -0.55, sx: 0.03 },
      { u: 2.45, h: [-0.24, 0.24, 0.12], a: [-126, 50], by: -0.07, bz: 0.1, bx: 0.05, hip: -0.46, sy: -0.48, sx: 0.03, sz: 0.05, fh: 'wingLo' },
    ],
  },
  /** The flat backhand: at chest height, rising a little, the whole body pivoting round with it. */
  flatBackhand: {
    line: 'flat', gather: [0.4, 0.8], arcs: true,
    lF: [0.2, 0.38], fy: [0.7, -0.55],
    home: 0.3, step: [0.1, 1.3],
    keys: [
      { u: 0.55, by: -0.23, bz: -0.09, bx: -0.07, hip: 0.5, sy: 0.6, sx: 0.2, fh: 'wrist', l: [0.08, -0.12, 0.3] },
      { u: 1.0, h: [0.36, -0.1, 0.16], a: [154, 6], by: -0.2, bz: -0.07, bx: -0.05, hip: 0.4, sy: 0.5, sx: 0.18, fh: 'wrist', l: [0.08, -0.12, 0.3], lk: 0.85 },
      { u: 1.1, l: [0.22, -0.1, 0.22], lp: [0.3, -0.8, -0.4], ld: [70, 0], pn: [0, -1, 0], lk: 0.25 },
      { u: 1.25, h: [0.28, -0.1, 0.34], a: [102, 2] },
      { u: 1.5, h: [0.1, -0.08, 0.46], a: [32, 2], by: -0.29, bz: 0.11, bx: 0.02, hip: -0.06, sy: 0.04, sx: 0.31, l: [0.42, -0.06, -0.02], lp: [0.15, -0.65, -0.75], ld: [100, 5], pn: [0, -1, 0], lk: 0 },
      { u: 1.75, h: [-0.16, -0.05, 0.42], a: [-36, 6] },
      { u: 2.0, h: [-0.3, -0.02, 0.26], a: [-102, 12], by: -0.27, bz: 0.14, bx: 0.06, hip: -0.42, sy: -0.42, sx: 0.21, fh: 'wing', l: [0.46, -0.14, -0.17] },
      { u: 2.15, h: [-0.31, -0.01, 0.14], a: [-130, 15] },
      { u: 2.18, by: -0.29, bz: 0.15, bx: 0.07, hip: -0.56, sy: -0.57, sx: 0.23 },
      { u: 2.45, h: [-0.32, 0.0, 0.1], a: [-140, 16], by: -0.25, bz: 0.1, bx: 0.05, hip: -0.5, sy: -0.52, sx: 0.16, fh: 'wing' },
    ],
  },
  /** The falling backhand: lifted over the left shoulder, a diagonal across his chest down to the
   *  right hip. */
  fallingBackhand: {
    line: 'left', gather: [0.4, 0.8], arcs: true,
    lF: [0.15, 0.52], rF: [-0.17, -0.46], fy: [0.15, -0.75], drag: 0.16,
    home: 0.3, step: [0.1, 1.3],
    keys: [
      // (no rise before it, `by` at the coil's height: out of a long stance the rise and the weight
      // drawn back took the front foot out of reach, and it skated 15 cm back through the windup)
      { u: 0.55, by: -0.12, bz: -0.1, bx: -0.07, hip: 0.47, sy: 0.57, sx: -0.08, l: [0.18, -0.3, 0.08] },
      { u: 1.0, h: [0.32, 0.14, 0.1], a: [160, 44], by: -0.11, bz: -0.07, bx: -0.05, hip: 0.34, sy: 0.45, sx: 0.0, sz: -0.05, fh: 'chest', l: [-0.06, -0.2, 0.26], ld: [15, 55] },
      { u: 1.25, h: [0.24, 0.1, 0.32], a: [106, 34] },
      { u: 1.5, h: [0.1, -0.06, 0.46], a: [30, 12], by: -0.29, bz: 0.12, bx: 0.02, hip: -0.06, sy: 0.0, sx: 0.39, l: [0.24, -0.08, 0.1], lp: [0.4, -0.85, -0.3], ld: [70, 40], pn: [-0.4, -1, 0], lk: 0 },
      { u: 1.75, h: [-0.12, -0.24, 0.4], a: [-32, -17] },
      { u: 2.0, h: [-0.24, -0.34, 0.26], a: [-78, -35], by: -0.36, bz: 0.15, bx: 0.06, hip: -0.38, sy: -0.42, sx: 0.51, sz: 0.07, fh: 'highWing', l: [0.36, 0.07, -0.24] },
      { u: 2.15, h: [-0.25, -0.37, 0.13], a: [-118, -29] },
      { u: 2.18, by: -0.4, bz: 0.17, bx: 0.07, hip: -0.53, sy: -0.58, sx: 0.57 },
      { u: 2.45, h: [-0.26, -0.38, 0.08], a: [-132, -27], by: -0.36, bz: 0.12, bx: 0.05, hip: -0.46, sy: -0.5, sx: 0.46, sz: 0.06, fh: 'highWing' },
    ],
  },

  // ---- hit 3 ---------------------------------------------------------------------------------
  /** The whirl: he follows the backhand round to his right, a full turn (combat.js `spin`) with the
   *  sword arm thrown out and the free arm carried out by the turn; the blade dips through the turn,
   *  crosses his front late in it and carries on round to his right. He drops lower into the turn
   *  than he did and comes out of it low, the blade carried on round, and holds there. */
  whirl: {
    line: 'flat', gather: [0.4, 0.8],
    home: 0.3,
    keys: [
      { u: 0.5, by: -0.26, sx: 0.24 },
      { u: 1.0, h: [-0.34, -0.05, 0.0], a: [-128, 12], by: -0.2, hip: -0.16, sy: -0.24, sx: 0.16, fh: 'chest', bx: -0.04 },
      { u: 1.5, h: [-0.4, -0.06, 0.14], a: [-100, 4], by: -0.28, hip: -0.1, sy: -0.12, sx: 0.29, fh: 'chest', l: [-0.06, -0.24, 0.24] },
      { u: 2.0, h: [-0.36, -0.1, 0.26], a: [-62, -6], by: -0.34, bz: 0.08, hip: -0.12, sy: -0.2, sx: 0.36, fh: 'wing', l: [0.46, -0.14, -0.14], bx: 0.05 },
      { u: 2.2, by: -0.36, bz: 0.08, hip: -0.26, sy: -0.34, sx: 0.36 },
      { u: 2.5, h: [-0.34, -0.2, 0.08], a: [-124, -18], by: -0.3, bz: 0.06, hip: -0.36, sy: -0.44, sx: 0.27, fh: 'wing' },
    ],
  },
  /** The rising whirl: the same turn out of a crouch, the blade spiralling up from the knee. */
  risingWhirl: {
    line: 'spiral', gather: [0.4, 0.8],
    home: 0.3,
    keys: [
      { u: 0.5, by: -0.36, sx: 0.4 },
      { u: 1.0, h: [-0.3, -0.3, 0.0], a: [-128, -32], by: -0.32, hip: -0.16, sy: -0.24, sx: 0.34, fh: 'chest', l: [-0.06, -0.3, 0.26], ld: [0, 40], bx: -0.04 },
      { u: 1.5, h: [-0.4, -0.14, 0.14], a: [-100, -5], by: -0.23, hip: -0.1, sy: -0.12, sx: 0.25, fh: 'chest', l: [-0.04, -0.3, 0.24], ld: [0, 40] },
      { u: 2.0, h: [-0.34, 0.1, 0.26], a: [-62, 30], by: -0.09, bz: 0.08, hip: -0.12, sy: -0.2, sx: 0.08, fh: 'wingLo', l: [0.44, -0.32, -0.16], bx: 0.05 },
      { u: 2.2, by: -0.11, bz: 0.08, hip: -0.26, sy: -0.32, sx: 0.06 },
      { u: 2.5, h: [-0.3, 0.2, 0.1], a: [-122, 48], by: -0.07, bz: 0.06, hip: -0.36, sy: -0.42, sx: 0.01, fh: 'wingLo' },
    ],
  },
  /** The low sweep: dropping from the backhand's finish into a crouch, the blade skimming the grass
   *  right to left and lifting as it ends, the free hand up for balance. */
  lowSweep: {
    line: 'low', gather: [0.4, 0.8], arcs: true,
    lF: [0.2, 0.46], rF: [-0.19, -0.44], fy: [0.5, -0.85],
    home: 0.3,
    keys: [
      { u: 0.55, by: -0.33, bz: -0.1, bx: -0.07, hip: -0.49, sy: -0.54, sx: 0.4 },
      { u: 1.0, h: [-0.22, -0.32, -0.16], a: [-156, -14], by: -0.38, bz: -0.07, hip: -0.36, sy: -0.42, sx: 0.44, fh: 'chest', l: [-0.04, -0.24, 0.28], bx: -0.05 },
      { u: 1.4, h: [-0.06, -0.36, 0.24], a: [-86, -13] },
      // (the blade crosses his front late in the cut, when the step in is nearly done: a low blade
      // reaches less far under a tall target, combat.js REACH)
      { u: 1.65, h: [0.13, -0.34, 0.45], a: [-8, -10], by: -0.43, bz: 0.11, hip: 0.1, sy: 0.1, sx: 0.53, l: [0.18, 0.14, 0.04], lp: [0.8, -0.5, 0.3], ld: [-5, 75], pn: [0.2, 0, 1], lk: 0, bx: 0.02 },
      { u: 1.85, h: [0.28, -0.35, 0.34], a: [54, -9] },
      { u: 2.0, h: [0.36, -0.32, 0.18], a: [106, -4], by: -0.42, bz: 0.13, hip: 0.37, sy: 0.4, sx: 0.47, fh: 'high', bx: 0.06 },
      { u: 2.15, h: [0.36, -0.28, 0.11], a: [132, 4] },
      { u: 2.2, by: -0.45, bz: 0.14, bx: 0.07, hip: 0.47, sy: 0.52, sx: 0.51 },
      { u: 2.45, h: [0.36, -0.26, 0.08], a: [140, 6], by: -0.42, bz: 0.1, hip: 0.43, sy: 0.48, sx: 0.45, fh: 'high', l: [0.26, 0.16, -0.08], bx: 0.05 },
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
   *  the hip as the sword arm drives out. He draws further back before it, sinks deeper into the
   *  bow behind the point and holds it there. */
  lunge: {
    line: 'point', gather: [0.4, 0.8],
    rF: [-0.17, -0.46], fy: [0.1, -0.8], drag: 0.12,
    lF: [0.14, 0.56],
    home: 0.3,
    keys: [
      { u: 0.55, by: -0.17, bz: -0.13, bx: -0.06, hip: -0.47, sy: -0.62, sx: 0.0 },
      { u: 1.0, h: [-0.03, -0.2, -0.1], a: [3, 20], by: -0.21, bz: -0.1, hip: -0.36, sy: -0.52, sx: 0.08, fh: 'aim', l: [0.02, -0.08, 0.36], ld: [-6, 12], bx: -0.05 },
      { u: 1.2, l: [0.08, -0.2, 0.28], lp: [0.45, -0.85, -0.2], ld: [30, -20], pn: [-0.5, -1, 0], lk: 0 },
      { u: 1.45, h: [0.08, -0.08, 0.26], a: [1, 28], by: -0.31, bz: 0.08, hip: -0.04, sy: -0.06, sx: 0.34, l: [0.2, -0.38, 0.02], lp: [0.6, -0.7, -0.3], ld: [100, -65], pn: [-1, 0, 0], lk: 0, bx: 0.0 },
      { u: 1.9, h: [0.15, 0.1, 0.48], a: [0, 35], by: -0.36, bz: 0.17, hip: 0.26, sy: 0.36, sx: 0.5, fh: 'tail', l: [0.26, -0.34, -0.3], ld: [170, -58], bx: 0.05 },
      { u: 2.12, by: -0.39, bz: 0.18, bx: 0.05, hip: 0.3, sy: 0.4, sx: 0.54 },
      { u: 2.5, h: [0.14, 0.08, 0.44], a: [0, 33], by: -0.33, bz: 0.14, hip: 0.24, sy: 0.32, sx: 0.46, fh: 'tail', bx: 0.04 },
    ],
  },
  /** The rising thrust: out of a crouch, the whole body rising behind the point as it drives up
   *  steeply into the target. */
  risingThrust: {
    line: 'point', gather: [0.4, 0.8],
    rF: [-0.17, -0.5], fy: [0.1, -0.8], drag: 0.12,
    lF: [0.14, 0.58],
    home: 0.3,
    keys: [
      { u: 0.5, l: [0.2, -0.24, 0.1], lp: [0.7, -0.5, -0.4], ld: [40, -30], pn: [0, -1, 0], lk: 0 },
      // (at u 0.7, not 0.6: out of the low sweep's finish on the far side the hips have 0.83 rad to
      // turn back through before it, and at 0.6 they whipped round 15° a frame)
      { u: 0.7, by: -0.4, bz: -0.11, bx: -0.06, hip: -0.44, sy: -0.55, sx: 0.4 },
      { u: 1.0, h: [-0.04, -0.34, -0.06], a: [4, 24], by: -0.36, bz: -0.09, hip: -0.34, sy: -0.47, sx: 0.32, l: [0.06, -0.42, 0.14], lp: [0.6, -0.3, -0.7], ld: [0, -20], pn: [0, -1, 0], lk: 0, bx: -0.05 },
      { u: 1.45, h: [0.07, -0.14, 0.26], a: [2, 34], by: -0.28, bz: 0.08, hip: -0.04, sy: -0.06, sx: 0.29, l: [0, -0.24, 0.32], lp: [0.4, -0.9, -0.1], ld: [0, 10], pn: [-0.6, -0.8, 0], lk: 0 },
      // (it rises to −0.15, not −0.07: standing up over its 1 m bow put the rear foot out of reach,
      // and its toe skated 14-23 cm in two frames)
      { u: 1.9, h: [0.14, 0.18, 0.46], a: [0, 45], by: -0.19, bz: 0.16, hip: 0.25, sy: 0.33, sx: 0.16, fh: 'aim', l: [-0.02, -0.06, 0.42], ld: [-8, 30], pn: [-1, -0.3, 0], bx: 0.05 },
      { u: 2.12, by: -0.22, bz: 0.17, bx: 0.05, hip: 0.29, sy: 0.38, sx: 0.14 },
      { u: 2.5, h: [0.13, 0.14, 0.42], a: [0, 42], by: -0.19, bz: 0.12, hip: 0.23, sy: 0.31, sx: 0.15, fh: 'aim', l: [0, -0.08, 0.4], ld: [-8, 28], pn: [-1, -0.3, 0], bx: 0.04 },
    ],
  },

  // ---- hit 5: the finisher ---------------------------------------------------------------------
  /** The ground slam (combat.js LIGHT[4], kind 'slam'; the chain's finisher: `slam` below is
   *  Earthbreaker's, as it was), both hands on the grip. The windup is its own anticipation: he
   *  GATHERS lower than he did (dips and coils right, the hands drawing the blade down-back past the
   *  right hip), then rises off the ground (combat.js `hop`) as the blade sweeps up his right side,
   *  where the camera behind him sees it, and arches back over the right shoulder. The blow is the
   *  slam's diagonal from there down across his front into the ground ahead and a little left, the
   *  hands leading and the steel whipping over after them; he lands deeper, folded over the planted
   *  blade, the head dropped with it, and holds it while he comes up a little (the shards burst at the
   *  point: player.js). */
  groundSlam: {
    line: 'down',
    home: 0.42,
    step: [0.45, 1.5],
    drag: 0.25,
    keys: [
      { u: 0.3, h: [-0.15, -0.33, -0.02], a: [-142, -20], two: 1, lp: [0.7, -0.6, 0.3], by: -0.31, hip: -0.27, sy: -0.42, sx: 0.4, sz: 0.06, hx: 0.14, hy: 0.38, hs: 0 },
      { u: 0.7, h: [-0.06, 0.1, 0.2], a: [-102, 67], two: 1, by: -0.05, hip: -0.27, sy: -0.34, sx: -0.08, sz: 0.04, hx: -0.18, hy: 0.3, hs: 0 },
      { u: 1.0, h: [-0.06, 0.22, 0.16], a: [-148, 46], two: 1, by: -0.03, bz: -0.07, hip: -0.32, sy: -0.45, sx: -0.18, sz: 0.05, hx: -0.22, hy: 0.5, hs: 0 },
      { u: 1.25, h: [0.06, 0.22, 0.3], a: [-104, 42] },
      { u: 1.5, h: [0.13, 0.1, 0.45], a: [-34, 22], two: 1, by: -0.15, bz: 0.06, hip: 0.04, sy: 0.0, sx: 0.3, sz: 0.0, hx: 0.0, hy: 0.0, hs: 0 },
      { u: 1.75, h: [0.19, -0.16, 0.46], a: [8, -18] },
      { u: 2.0, h: [0.2, -0.34, 0.37], a: [16, -46], two: 1, by: -0.41, bz: 0.15, hip: 0.24, sy: 0.28, sx: 0.68, sz: -0.05, hx: 0.14, hy: -0.3, hs: 0 },
      { u: 2.2, h: [0.2, -0.36, 0.36], a: [16, -48], two: 1, by: -0.45, bz: 0.16, hip: 0.25, sy: 0.29, sx: 0.73, sz: -0.05, hx: 0.32, hy: -0.3, hs: 0 },
      { u: 2.65, h: [0.2, -0.36, 0.36], a: [16, -48], two: 1, by: -0.43, bz: 0.15, hip: 0.24, sy: 0.28, sx: 0.71, sz: -0.05, hx: 0.24, hy: -0.3, hs: 0 },
    ],
  },

  // ---- moves the chain shared before ADR-188, unchanged (the chain has its own now) -------------
  // (the draw cut: the flurry's cut, flurry.js / anim.js FL_K, and One Breath's, combat.js ONE_BREATH)
  /** The draw cut: low from behind the right hip, sinking into it, rising a little as it ends. */
  drawCut: {
    line: 'flat',
    lF: [0.18, 0.4], fy: [0.55, -0.6],
    keys: [
      { u: 0.6, by: -0.24, bz: -0.08, bx: -0.06, hip: -0.5, sy: -0.54, sx: 0.3 },
      { u: 1.0, h: [-0.14, -0.37, -0.16], a: [-156, -12], by: -0.22, bz: -0.06, bx: -0.05, hip: -0.42, sy: -0.48, sx: 0.26, fh: 'aimLo' },
      { u: 1.3, h: [0.0, -0.34, 0.26], a: [-104, -10] },
      { u: 1.5, h: [0.14, -0.3, 0.44], a: [-32, -5], by: -0.3, bz: 0.09, bx: 0.01, hip: 0.14, sy: 0.02, sx: 0.36, l: [0.24, -0.08, 0.14], lp: [0.45, -0.85, -0.3], ld: [60, 10], pn: [0, -1, 0], lk: 0 },
      { u: 1.75, h: [0.3, -0.25, 0.36], a: [36, 3] },
      { u: 2.0, h: [0.38, -0.19, 0.2], a: [96, 12], by: -0.25, bz: 0.12, bx: 0.05, hip: 0.4, sy: 0.42, sx: 0.28, fh: 'highWing', l: [0.34, 0.02, -0.18] },
      { u: 2.15, by: -0.23, bz: 0.13, bx: 0.06, hip: 0.5, sy: 0.54, sx: 0.3 },
      { u: 2.4, h: [0.36, -0.12, 0.1], a: [138, 22], by: -0.19, bz: 0.08, bx: 0.04, hip: 0.45, sy: 0.49, sx: 0.21, fh: 'highWing', l: [0.32, -0.02, -0.17] },
    ],
  },
  // (the slam: Earthbreaker's, combat.js HEAVY[4])
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
    home: 0.385,
    step: [0.45, 1.5],
    drag: 0.25,
    keys: [
      { u: 0.3, h: [-0.15, -0.33, -0.02], a: [-140, -20], two: 1, lp: [0.7, -0.6, 0.3], by: -0.2, hip: -0.2, sy: -0.34, sx: 0.32, sz: 0.06, hx: 0.12, hy: 0.38, hs: 0 },
      { u: 0.7, h: [-0.06, 0.1, 0.2], a: [-102, 67], two: 1, by: -0.05, hip: -0.24, sy: -0.3, sx: -0.06, sz: 0.04, hx: -0.16, hy: 0.3, hs: 0 },
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

  // ---- the heavy branches (combat.js HEAVY; ADR-115) -------------------------------------------
  // Two-handed, slower to gather, and each holds its finish (`home` 0.385, like the slam and the
  // cleave): the commitment a heavy is, readable from the camera behind him. Each starts on the side
  // the light before it leaves the blade.
  /** Piercing Gale (HEAVY[0]): both hands draw the grip back to the right ribs, the point already up;
   *  the dash (combat.js `dash`) carries him in as the arms drive the point forward and up. */
  heavyThrust: {
    line: 'point',
    home: 0.385,
    rF: [-0.17, -0.52], fy: [0.1, -0.8], drag: 0.12,
    lF: [0.14, 0.58],
    keys: [
      { u: 0.6, by: -0.2, bz: -0.12, bx: -0.05, hip: -0.5, sy: -0.62, sx: 0.12 },
      { u: 1.0, h: [-0.02, -0.24, -0.08], a: [4, 22], two: 1, lp: [0.7, -0.6, 0.3], by: -0.24, bz: -0.1, hip: -0.42, sy: -0.56, sx: 0.16, bx: -0.04, hs: 0 },
      { u: 1.45, h: [0.08, -0.1, 0.28], a: [2, 30], two: 1, by: -0.26, bz: 0.06, hip: -0.06, sy: -0.08, sx: 0.3, bx: 0.0 },
      { u: 1.9, h: [0.13, 0.08, 0.5], a: [0, 36], two: 1, by: -0.3, bz: 0.18, hip: 0.2, sy: 0.3, sx: 0.44, bx: 0.04 },
      { u: 2.1, by: -0.32, bz: 0.2, bx: 0.04, hip: 0.24, sy: 0.34, sx: 0.48 },
      { u: 2.55, h: [0.13, 0.06, 0.46], a: [0, 34], two: 1, by: -0.28, bz: 0.14, hip: 0.2, sy: 0.28, sx: 0.42, bx: 0.03 },
    ],
  },
  /** Rising Crescent (HEAVY[1], after the first light, which leaves the blade low on his left): both
   *  hands sink to the left hip and the blade rises across his front to high on his right. */
  heavyRise: {
    line: 'right',
    home: 0.385,
    fy: [0.45, -0.6],
    keys: [
      { u: 0.6, by: -0.34, bz: -0.08, bx: -0.06, hip: 0.52, sy: 0.6, sx: 0.42 },
      { u: 1.0, h: [0.34, -0.4, 0.04], a: [150, -34], two: 1, lp: [0.7, -0.6, 0.3], by: -0.32, bz: -0.07, bx: -0.05, hip: 0.44, sy: 0.54, sx: 0.4, hs: 0 },
      { u: 1.25, h: [0.28, -0.32, 0.3], a: [100, -28] },
      { u: 1.5, h: [0.12, -0.14, 0.46], a: [30, -6], two: 1, by: -0.18, bz: 0.08, bx: 0.01, hip: -0.06, sy: 0.06, sx: 0.24 },
      { u: 1.75, h: [-0.08, 0.08, 0.42], a: [-32, 20] },
      { u: 2.0, h: [-0.16, 0.18, 0.3], a: [-70, 40], two: 1, by: -0.07, bz: 0.12, bx: 0.05, hip: -0.36, sy: -0.36, sx: 0.04, sz: 0.06 },
      { u: 2.15, by: -0.06, bz: 0.13, bx: 0.06, hip: -0.48, sy: -0.5, sx: 0.0 },
      { u: 2.55, h: [-0.18, 0.22, 0.16], a: [-112, 44], two: 1, by: -0.07, bz: 0.09, bx: 0.04, hip: -0.43, sy: -0.45, sx: 0.02, sz: 0.05 },
    ],
  },
  /** Whirling Tempest (HEAVY[2], after the backhand, which leaves the blade high on his right): one
   *  full turn to his right (combat.js `spin`) with both hands on the grip and the blade level, out
   *  past his reach: it sweeps all round him and crosses his front late in the turn. */
  heavySpin: {
    line: 'flat',
    home: 0.385,
    keys: [
      { u: 0.5, by: -0.24, sx: 0.24 },
      { u: 1.0, h: [-0.22, -0.08, 0.12], a: [-124, 8], two: 1, lp: [0.7, -0.6, 0.3], by: -0.22, hip: -0.2, sy: -0.3, sx: 0.2, bx: -0.04, hs: 0 },
      { u: 1.5, h: [-0.18, -0.1, 0.26], a: [-96, 2], two: 1, by: -0.26, hip: -0.12, sy: -0.16, sx: 0.26 },
      { u: 2.0, h: [-0.12, -0.14, 0.36], a: [-60, -6], two: 1, by: -0.3, bz: 0.06, hip: -0.14, sy: -0.22, sx: 0.32, bx: 0.05 },
      { u: 2.45, h: [-0.2, -0.2, 0.2], a: [-112, -14], two: 1, by: -0.26, bz: 0.05, hip: -0.34, sy: -0.42, sx: 0.26 },
    ],
  },
  /** Mountain Splitter (HEAVY[3], after the third light): both hands carry the blade over the LEFT
   *  shoulder (the slam's comes from over the right) and he steps through one falling diagonal across
   *  his chest to the right hip, sinking deep, and holds the finish. Its posture crushes a guard. */
  heavyCrush: {
    line: 'left',
    home: 0.385,
    step: [0.45, 1.5],
    drag: 0.2,
    lF: [0.15, 0.5], rF: [-0.17, -0.46], fy: [0.15, -0.75],
    keys: [
      { u: 0.4, h: [0.22, -0.2, 0.16], a: [120, 10], two: 1, lp: [0.7, -0.6, 0.3], by: -0.16, bz: -0.06, hip: 0.3, sy: 0.38, sx: 0.12, hs: 0 },
      { u: 0.75, by: -0.07, bz: -0.09, bx: -0.06, hip: 0.5, sy: 0.6, sx: -0.06 },
      { u: 1.0, h: [0.28, 0.18, 0.1], a: [156, 44], two: 1, by: -0.08, bz: -0.07, bx: -0.05, hip: 0.42, sy: 0.54, sx: -0.02, sz: -0.05 },
      { u: 1.25, h: [0.22, 0.12, 0.32], a: [104, 34] },
      { u: 1.5, h: [0.1, -0.06, 0.46], a: [30, 10], two: 1, by: -0.24, bz: 0.1, bx: 0.01, hip: -0.06, sy: 0.0, sx: 0.36 },
      { u: 1.75, h: [-0.08, -0.26, 0.42], a: [-30, -20] },
      { u: 2.0, h: [-0.16, -0.38, 0.3], a: [-66, -40], two: 1, by: -0.34, bz: 0.15, bx: 0.05, hip: -0.36, sy: -0.4, sx: 0.5, sz: 0.07 },
      { u: 2.15, by: -0.36, bz: 0.16, bx: 0.06, hip: -0.46, sy: -0.52, sx: 0.54 },
      { u: 2.55, h: [-0.18, -0.4, 0.26], a: [-70, -42], two: 1, by: -0.34, bz: 0.13, bx: 0.05, hip: -0.42, sy: -0.48, sx: 0.5, sz: 0.06 },
    ],
  },

  // ---- out of a sprint / a roll ----------------------------------------------------------------
  /** The sprint slash: on the run, from behind the right knee up across his front to high left. */
  sprintSlash: {
    line: 'left',
    keys: [
      { u: 1.0, h: [-0.16, -0.37, -0.18], a: [-156, -38], by: -0.22, hip: -0.32, sy: -0.42, sx: 0.42, fh: 'tail', l: [0.2, -0.36, -0.2] },
      { u: 1.3, h: [-0.01, -0.3, 0.26], a: [-104, -30] },
      { u: 1.5, h: [0.14, -0.12, 0.47], a: [-30, -4], by: -0.16, bz: 0.05, hip: 0.1, sy: 0.0, sx: 0.25, fh: 'tail', l: [0.22, -0.42, -0.22] },
      { u: 1.75, h: [0.3, 0.08, 0.38], a: [32, 24] },
      { u: 2.0, h: [0.4, 0.2, 0.2], a: [74, 46], by: -0.05, bz: 0.05, hip: 0.3, sy: 0.34, sx: 0.02, fh: 'tail', l: [0.24, -0.44, -0.3] },
      { u: 2.12, by: -0.02, hip: 0.37, sy: 0.43, sx: -0.06 },
      { u: 2.35, h: [0.4, 0.26, 0.06], a: [126, 56], by: -0.03, hip: 0.34, sy: 0.4, sx: -0.04, fh: 'tail' },
    ],
  },
  /** The roll cut: out of the roll's crouch, low from the right and rising past the left shoulder. */
  rollCut: {
    line: 'left',
    keys: [
      { u: 0.6, by: -0.38, bz: -0.06, bx: -0.05, hip: -0.46, sy: -0.5, sx: 0.48 },
      { u: 1.0, h: [-0.14, -0.37, -0.14], a: [-152, -14], by: -0.36, hip: -0.38, sy: -0.44, sx: 0.45, fh: 'aimLo', l: [0.06, -0.3, 0.34], bx: -0.04 },
      { u: 1.3, h: [-0.01, -0.34, 0.25], a: [-104, -12] },
      { u: 1.5, h: [0.14, -0.28, 0.44], a: [-30, -6], by: -0.3, bz: 0.08, hip: 0.1, sy: 0.02, sx: 0.4, l: [0.18, -0.38, 0.04], lp: [0.6, -0.6, -0.4], ld: [100, -50], pn: [-1, 0, 0], lk: 0 },
      { u: 1.75, h: [0.3, -0.16, 0.36], a: [34, 8] },
      // (the hips end at −0.16-0.22, not −0.12-0.17: higher, the rear toe skated 14 cm after the body)
      { u: 2.0, h: [0.38, -0.05, 0.2], a: [82, 26], by: -0.22, bz: 0.1, hip: 0.34, sy: 0.38, sx: 0.2, fh: 'tail', l: [0.24, -0.42, -0.28], bx: 0.05 },
      { u: 2.15, by: -0.18, bz: 0.1, bx: 0.06, hip: 0.42, sy: 0.5, sx: 0.12 },
      { u: 2.4, h: [0.38, 0.05, 0.08], a: [130, 40], by: -0.16, hip: 0.39, sy: 0.45, sx: 0.14, fh: 'tail' },
    ],
  },

  // ---- the light chain before ADR-188 (?lights=old: combat.js setLights) ----------------------
  ...LIGHTS_OLD,
  // ---- a brand-new light chain to compare (?lights=fresh: combat.js setLights) ------------------
  ...LIGHTS_FRESH,
  // ---- the instant cuts (?lights=blink: lightsBlink.js), its heavies, its last hit (lastHits.js) ----
  ...LIGHTS_BLINK,
  ...HEAVIES_BLINK,
  ...LAST_HITS_BLINK,
  ...SPECIALS_BLINK,
  // ---- the steel look set (?lights=steel, ADR-234: the owner's reference footage, pose for pose) ----
  ...STEEL_CHAIN_A,
  ...STEEL_CHAIN_B,
  ...STEEL_HEAVIES_C,
  ...STEEL_HEAVIES_D,
  ...STEEL_SPECIALS_E,
  // ---- the instant chain's four variants (?lights=blink&cuts=a|b|c|d, ADR-235) ----
  ...CUTS_A,
  ...CUTS_B,
  ...CUTS_C,
  ...CUTS_D,
  // ---- hit 5's finisher options and the heavies' options (?fin=, ?hv=; ADR-237, ADR-238) ----
  ...FINISH_BLINK,
  ...HEAVY_OPT_A,
  ...HEAVY_OPT_B,
  ...HEAVY_OPT_C,
  // ---- the natural swings: the sword arm keyed by its joints (?arm=fk, armFK.js, ADR-240) ----
  ...LIGHTS_NATURAL,
};
