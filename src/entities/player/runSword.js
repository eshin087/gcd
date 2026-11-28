// The hero's sword arm on the run (ADR-204): how the sword hand carries the blade while he runs or sprints
// at ease (the fight's carry, FIGHT_RUN, and the backpedal's guard stay anim.js loco()'s and blend over this).
// The owner (2026-11-25): "the right hand angle and movement looks stiff weird angle and unnatural", then,
// of two trailing carries, "the running and sword placement still looks off", with a reference video of a
// knight sprinting with a straight sword. What the reference shows, and every carry before missed: the
// blade points FORWARD, carried low at the right hip, and rocks with the forearm; it never trails behind
// him. A fist holding a sword has the blade leaving the thumb side, so with the arm hanging the point goes
// ahead and down; a blade trailing back (the carry before, `?runSword=old`) needs a wrist turned the wrong
// way round, which is what read as stiff.
//
//   hip  FORWARD AT THE HIP: the arm swings against the free arm (with the left leg); back, the elbow
//        bent near a right angle behind him and the grip at the hip, the point ahead and down; forward,
//        the elbow opening and the grip ahead of the thigh, the point ahead and up. The blade keeps one
//        hammer-grip angle off the forearm (the wrist quiet), so the steel rocks with the arm.
//   old  the carry before this pass (anim.js loco())
//
// The owner, 2026-11-25, with a sketch (an arm coming down to the fist, a long straight blade going on
// in the forearm's line, slanting down ~35-40° below level, the point well past the hand): "have the
// sword be in this angle when he's running instead of it being held in the front". Three readings of
// the sketch, each with the blade IN the forearm's line (the wrist quiet, not cocked: the old trailing
// carry bent it 62-87° off the forearm, which read as stiff), each rocking with the arm's swing:
//   trail  THE OWNER'S PICK (2026-11-26): the arm hanging out from his side, the elbow soft, the blade going
//          on from the hand down and out to his right and back (~30° below level): from the game camera
//          behind him the owner's arrow, ~45° down the screen. (A straight arm swept back was tried the same
//          day: "too straight back".) `open`: the solver draws the elbow asked for (its soft reach bent a
//          170° ask to 151°).
//   swept  THE SWORDSMAN'S RUN: the arm swept further back, nearly straight, the blade in its line
//          behind him, ~25-30° below level: the long diagonal of the sketch seen from his side.
//   side   OUT TO THE SIDE: the arm a little off his side, the blade out to his right and back,
//          down ~30°: seen from the game camera behind him it is the sketch's diagonal, the steel
//          clear of his coat on the sword side.
//
// Written as joint angles posed by forward kinematics on the arm's bones (as runArms.js does for the free
// arm). The arm's angles are against the torso's own line (he leans into the run: loco() passes the
// lean, `tilt`), the blade's against level ground follows from them. Pose space: body axes (x = his
// left, y up, z ahead); the sword hand's offsets start from its shoulder spot (rig.arms.R.anchor).
// No allocation per frame, never throws, never Math.random.
import { clamp, lerp } from '../../core/math.js';
import { DIM } from './heroDims.js';

const IDS = ['g2', 'g1', 'g3', 'nat', 'n1', 'n3', 'flail', 'b15', 'a1', 'a2', 'a3', 'a4', 'b25', 'b35', 'b45', 'hip', 'trail', 'swept', 'side', 'old'];
export const RUN_SWORD_IDS = Object.freeze(IDS.slice());
export const RUN_SWORD_NAMES = Object.freeze({ hip: 'forward at the hip', trail: 'trailing in line', swept: 'swept back', side: 'out to the side', g1: 'in the fist: low ahead', g2: 'in the fist: point down', g3: 'reverse grip, back along the arm', nat: 'natural hold, the fist at the hip', n1: 'natural hold, the fist ahead of the hip', n3: 'natural hold, the fist behind the hip', flail: 'swinging loose', b15: 'back, 15° out', a1: '15° out, arm in a little', a2: '15° out, arm in', a3: '15° out, arm by the hip', a4: '15° out, elbow bent', b25: 'back, 25° out', b35: 'back, 35° out', b45: 'back, 45° out', old: 'before' });
// the owner's picks: 'hip' (2026-11-25, ADR-204), 'trail' (2026-11-26), then: "can you just redo the run
// animation and do your best to make it look natural with the sword flailing out while running" (ADR-229)
// … then "figure it out and make it look good, natural, and anatomy wise correct": 'nat'; then, of three carries
// rebuilt from the hand's grip, 'g2' (2026-11-26)
const DEFAULT = IDS[0]; // 'g2' (listed first: a `const X = '…'` string is read as glyphs by tests/glyphcheck.mjs)

const q = (name) => {
  try {
    return typeof location !== 'undefined' ? new URLSearchParams(location.search).get(name) : null;
  } catch {
    return null;
  }
};
const PICK = { mode: (() => {
  const v = q('runSword');
  return IDS.includes(v) ? v : DEFAULT;
})() };
export const runSwordMode = () => PICK.mode;
export function setRunSword(id) {
  PICK.mode = IDS.includes(String(id)) ? String(id) : DEFAULT;
  return PICK.mode;
}

const D = Math.PI / 180;
// per gait, run → sprint (degrees; [back, forward] = the two ends of the swing):
//   phi   the upper arm's swing against the torso's line (+ forward): centre, half range
//   ab    how far it stands out to his right (the elbow a little off the ribs)
//   el    the elbow's inside angle (180 straight)
//   grip  the blade off the forearm's line, turned forward and up (a hammer grip: the thumb side ahead)
//   out   the blade's yaw out to his right, off the thigh and the coat
//   side  how much of the upper arm's stand-off the forearm keeps (the grip a fist outside the hip)
// Measured off the owner's reference (a sprint): back, the upper arm ~40° behind the torso, the elbow ~90°,
// the grip at the hip, the point ~20° down; forward, the upper arm ~12° ahead, the elbow ~140°, the grip
// 25-30 cm ahead of the hip, the point ~25° up. The run is the same shape at ~60 % of the swing.
// `roll` the blade's flat about its own line, from edge down (0: the flat faces out to his side, as in
// the reference) toward the sky
export const RUN_SWORDS = {
  hip: {
    run: { phi: [-9, 17], ab: 11, el: [108, 134], grip: [56, 64], out: 6, side: 0.35 },
    sprint: { phi: [-10, 27], ab: 13, el: [98, 126], grip: [58, 77], out: 5, side: 0.35 },
    roll: 40,
  },
  // the blade in the forearm's line, trailing (the sketch's carries): the arm as in `hip`, then
  //   tilt  the blade lifted off the forearm's line, behind him (deg: 0 = in line), [back, forward]
  //   yaw   the blade turned out to his right off the line behind him (deg)
  //   down  the blade's slant below level is held inside [min, max] (deg): the point off the grass
  //   roll  the flat from facing out to his side toward the sky (deg): a flat seen edge-on vanishes
  // FLAIL (2026-11-26, the owner: "can you just redo the run animation and do your best to make it look natural
  // with the sword flailing out while running"): the sword arm swings with the stride like a runner's arm, the
  // elbow folding as it comes forward; the blade hangs loose from the hand, down and out to his right and back,
  // and swings after the arm (`flail`: a beat late, `lag` of a cycle, and wider, × `amp`), further out as it
  // trails back (`yaw` ± `flail.yaw`)
  flail: {
    // the arm: mostly behind him, swinging 14-20° each way, out from his side, the elbow loosening as it
    // swings back (164°) and folding a little as it comes through (146°; 134° at a sprint)
    run: { phi: [-18, 14], ab: 38, el: [164, 146], side: 1.4, tilt: [0, 0], yaw: 0 },
    sprint: { phi: [-20, 20], ab: 34, el: [162, 134], side: 1.3, tilt: [0, 0], yaw: 0 },
    roll: 60,
    open: 1,
    over: 1,
    // the blade: 26-38° below level (18-34° at a sprint), 110-130° round from ahead (out to his right and
    // back), swinging a beat after the arm. At the game camera: the arm ~56° down the screen, the blade
    // swinging 40-60° round ~50°
    flail: { lag: 0.04, run: { slant: [32, 6], out: [60, 10] }, sprint: { slant: [26, 8], out: [56, 12] } },
  },
  // SOLID BACK ANGLES (2026-11-26, the owner: "the sword angle being too far out. so make 4 different
  // variations of different sword angles and don't have the sword itself move too much during the run. i want
  // the arm and sword to not move so much and just have a solid back angle running animation"): the blade
  // held at one angle behind him and down, turned `out` degrees to his right from straight back (15 / 25 /
  // 35 / 45; flail's is ~55-65), swaying a few degrees; the arm hanging back toward it, swinging little.
  // Built in solidCarry() below.
  trail: {
    // (2026-11-26, the owner with a screenshot from the game camera and a red arrow from his hand, down and out
    // to his right at ~45°: "the right hand now is too straight back ... i want the sword and arm to be more on
    // the red angle direction". Measured on the drawn frame at the game camera, the straight-back arm and
    // blade ran 74-75° below the screen's horizontal; now the arm ~57°, the blade ~48°, rocking 45-50°)
    run: { phi: [-16, 10], ab: 40, el: [154, 166], side: 1.3, tilt: [46, 46], yaw: 64 },
    sprint: { phi: [-14, 12], ab: 42, el: [152, 166], side: 1.3, tilt: [44, 44], yaw: 62 },
    down: [10, 44],
    roll: 55,
    // the solver gives the arm the elbow asked for (a soft 154-166°, not its soft reach's crumple)
    open: 1,
    over: 1,
  },
  swept: {
    run: { phi: [-48, 8], ab: 14, el: [168, 172], side: 0.5, tilt: [8, 8], yaw: 16 },
    sprint: { phi: [-40, 9], ab: 16, el: [168, 172], side: 0.5, tilt: [8, 8], yaw: 14 },
    down: [16, 38],
    roll: 60,
  },
  side: {
    run: { phi: [-32, 8], ab: 24, el: [166, 170], side: 0.8, tilt: [16, 16], yaw: 52 },
    sprint: { phi: [-24, 10], ab: 26, el: [166, 170], side: 0.8, tilt: [18, 18], yaw: 50 },
    down: [20, 44],
    roll: 70,
  },
  lag: 0.03, // of a cycle: the arm follows the stride
  low: 34, // the most the blade may point down (deg below level): the point stays out of the grass
};

// the four solid carries: the blade `out` degrees off straight back, 34° below level (30° at a sprint),
// swaying ±2-3°; the arm 38° back, swinging ±5° (±7° sprinting), turned out toward the blade, the elbow
// soft and steady (160-154°)
function solidCarry(out) {
  const ab = 12 + 0.52 * out;
  return {
    run: { phi: [-38, 5], ab, el: [160, 154], side: 1.2, tilt: [0, 0], yaw: 0 },
    sprint: { phi: [-40, 7], ab: ab + 2, el: [158, 150], side: 1.2, tilt: [0, 0], yaw: 0 },
    roll: 60,
    open: 1,
    over: 1,
    flail: { lag: 0.04, run: { slant: [34, 2], out: [out, 2] }, sprint: { slant: [30, 3], out: [out, 3] } },
  };
}
for (const o of [15, 25, 35, 45]) RUN_SWORDS['b' + o] = solidCarry(o);
// A (b15)'s blade with the arm brought in toward his body and down from his back (the owner, 2026-11-26: "i like
// A so far but something about the right arm angle elevation is looking off ... maybe make the right arm closer
// to the body and not like extending out and above the back"): b15's arm is 38° back, 20° out from his side.
// The upper arm comes in against his side and down; the forearm keeps the hand just outside the coat at his
// hip (`side`), or the blade, straight behind him, ran through the coat and bent the wrist up to 66°:
//   a1  30° back, 12° out          a2  24° back, 9° out
//   a3  18° back, 6° out (in against his side)      a4  24° back, 8° out, the elbow bent more (~145°)
function armIn(phi, ab, el, side) {
  const K = solidCarry(15);
  Object.assign(K.run, { phi: [phi, 4], ab, el, side });
  Object.assign(K.sprint, { phi: [phi - 2, 6], ab: ab + 1, el: [el[0] - 2, el[1] - 4], side });
  return K;
}
// NATURAL (the owner, 2026-11-26: "all of them look unnatural from the user camera perspective. figure it out
// and make it look good, natural, and anatomy wise correct"). What was wrong with every carry that put the blade
// "in the forearm's line": a fist holds a sword's grip across the palm (a hammer grip), so the blade leaves the
// hand at about a right angle to the forearm, and the wrist tips it at most ~30-40° toward the forearm's line.
// A blade 15-30° off a hanging forearm is a grip no hand makes: from the game camera it read as a pole hanging
// from his fist. Here, as a swordsman runs holding a sword low: the arm relaxed at his side, a little off it,
// the elbow soft, swinging a little with the stride; the fist by his hip; the blade leaving it at ~65-85° to the
// forearm, behind him and a little out (out from straight back), a little below level, steady
RUN_SWORDS.nat = {
  run: { phi: [9, 6], ab: 14, el: [164, 156], side: 1.0, tilt: [0, 0], yaw: 0 },
  sprint: { phi: [22, 8], ab: 15, el: [162, 152], side: 1.0, tilt: [0, 0], yaw: 0 },
  roll: 70,
  open: 1,
  over: 1,
  flail: { lag: 0.04, run: { slant: [20, 2], out: [36, 2] }, sprint: { slant: [16, 3], out: [34, 3] } },
};
// The natural hold's arm, three ways (the owner: "something about the arm joint angle looks unnatural from the
// player view. also the side view doesnt look good"; the arm's angles are against the leaning torso, so a
// `phi` near 0 hung the upper arm ~30° behind plumb with the forearm hanging down: the elbow jutted back in a V):
// (`phi` ahead of the torso's line by about his lean, 17° running, 31° sprinting, hangs the arm plumb)
//   n1   the upper arm plumb, the elbow soft (~150°), the fist ahead of the hip
//   nat  the upper arm ~8° behind plumb, the elbow ~160°, the fist at the hip
//   n3   the upper arm ~16° behind plumb, the elbow ~167°, the fist just behind the hip
function natCarry(phi, el, phiS, elS) {
  const K = JSON.parse(JSON.stringify(RUN_SWORDS.nat));
  Object.assign(K.run, { phi: [phi, 7], el });
  Object.assign(K.sprint, { phi: [phiS, 9], el: elS });
  return K;
}
RUN_SWORDS.n1 = natCarry(17, [158, 146], 30, [154, 140]);
RUN_SWORDS.n3 = natCarry(1, [170, 164], 14, [168, 160]);
// THE G CARRIES (2026-11-26, the owner: "all look bad. try again", ticking the sword pointing back, the fist /
// wrist / grip, a stiff arm and the whole run; "you decide"). Rebuilt from the hand: the blade set in the fist
// (fistBlade: the thumb's side, a real grip's angle, the flat across the knuckles: never twisted), the arm
// swinging as a runner's (the shoulder and the elbow working with the stride), the blade riding with the hand.
// A relaxed hand's thumb faces forward, so a hammer grip carries the blade forward and down: pointing it back
// needs the forearm wrung round (what every trailing carry read as). Behind him only in a reverse grip.
const RUNNER = {
  run: { phi: [-2, 10], ab: 12, el: [162, 142], side: 1.0, tilt: [0, 0], yaw: 0 },
  sprint: { phi: [4, 13], ab: 13, el: [158, 132], side: 1.0, tilt: [0, 0], yaw: 0 },
};
function fistCarry(arm, fist, roll) {
  return { run: { ...arm.run }, sprint: { ...arm.sprint }, roll, open: 1, over: 1, fist };
}
//   g1  the blade forward and low, its point toward the grass ahead of his right foot (a hammer grip, the
//       wrist dropped: the thumb ahead and a little out)
RUN_SWORDS.g1 = fistCarry(RUNNER, { run: { thumb: 38, grip: 60 }, sprint: { thumb: 38, grip: 62 }, top: 8, twist: 30 }, 30);
//   g2  THE OWNER'S PICK (2026-11-26): the point down beside his right leg, a little ahead and out. The hand
//       stands a little further off his side and the thumb turns out, so the steel keeps 13-15 cm off every
//       cloth sheet (the skirt's panels, the cape: "make sure the arm and sword doesn't clip with the cloak
//       fabric"; tucked in, it passed within 0.3 cm); the wrist holds the point 20-30° below level
RUN_SWORDS.g2 = fistCarry(
  { run: { ...RUNNER.run, ab: 18, side: 1.2 }, sprint: { ...RUNNER.sprint, ab: 19, side: 1.2 } },
  { run: { thumb: 55, grip: 46 }, sprint: { thumb: 55, grip: 48 }, top: 26, twist: 30 },
  30,
);
//   g3  a reverse grip: the blade leaves the little-finger side and lies back along his forearm
RUN_SWORDS.g3 = fistCarry(RUNNER, { run: { thumb: 140, grip: 120 }, sprint: { thumb: 140, grip: 122 }, twist: 30 }, 30);
RUN_SWORDS.a1 = armIn(-30, 12, [160, 154], 1.6);
RUN_SWORDS.a2 = armIn(-24, 9, [160, 154], 2.0);
RUN_SWORDS.a3 = armIn(-18, 6, [160, 154], 2.4);
RUN_SWORDS.a4 = armIn(-24, 8, [148, 142], 2.0);
const U = [0, 0, 0], F = [0, 0, 0];
/** (tools) the last trailing carry's forearm angle from hanging, the slant it asked for and the wrist
 *  (forearm vs blade), deg */
export const DBG = { fb: 0, slant: 0, wrist: 0 };
const SCR = { h: [0, 0, 0], p: [0, 0, 0] }, FV = [0, -1, 0];
/** The sword arm's targets on the run into OUT = { h: [3], p: [3], d: [3], f: [3], open } (body axes; `open` 0..1:
 *  the arm is asked for its full reach, past the solver's soft reach: a straight arm, ADR-229). Returns false
 *  for 'old' (loco() keeps its own). ph = the stride's phase, armF its signed size (A.armSign × |mz|, ≥ 0.65),
 *  s = the sprint (0..1), tilt = the torso's lean forward (rad: the pelvis's and the spine's pitch). */
export function runSword(OUT, ph, armF, s, tilt = 0) {
  const mode = PICK.mode;
  if (mode === 'old') return false;
  const K = RUN_SWORDS[mode], R = K.run, S = K.sprint;
  OUT.open = fin0(K.open);
  if (mode !== 'hip') return trailing(OUT, K, ph, armF, s, tilt);
  // the right hand comes forward with the left leg (cs = +1 as the left foot lands in front)
  const cs = Math.cos(2 * Math.PI * (ph - RUN_SWORDS.lag));
  const sw = clamp(cs * (Number.isFinite(armF) ? armF : 1), -1, 1); // +1 forward
  const f = 0.5 + 0.5 * sw;
  const tl = Number.isFinite(tilt) ? clamp(tilt, -0.6, 1.0) : 0;
  const phi = lerp(R.phi[0], S.phi[0], s) + lerp(R.phi[1], S.phi[1], s) * sw;
  const ab = lerp(R.ab, S.ab, s), el = lerp(lerp(R.el[0], R.el[1], f), lerp(S.el[0], S.el[1], f), s);
  const gr = lerp(lerp(R.grip[0], R.grip[1], f), lerp(S.grip[0], S.grip[1], f), s);
  const out = lerp(R.out, S.out, s), side = lerp(R.side, S.side, s);
  // forward kinematics in the torso's frame: the upper arm (out to his right: −x), the forearm bent
  // forward in its plane; then the whole arm turned with the lean (about x: the torso's "down" tips back)
  const p = phi * D, a = ab * D, ca = Math.cos(a), sa = Math.sin(a);
  U[0] = -sa;
  U[1] = -ca * Math.cos(p);
  U[2] = ca * Math.sin(p);
  const fa = p + (Math.PI - el * D); // the forearm's angle from hanging, in the swing's plane (torso)
  F[0] = -sa * side;
  F[1] = -Math.cos(fa);
  F[2] = Math.sin(fa);
  nrm(F);
  tiltX(U, tl);
  tiltX(F, tl);
  const L1 = DIM.upperArm, L2 = DIM.foreArm;
  const H = OUT.h;
  for (let i = 0; i < 3; i++) H[i] = L1 * U[i] + L2 * F[i];
  // the elbow's pole: the elbow itself, off the shoulder → hand line
  const hh = H[0] * H[0] + H[1] * H[1] + H[2] * H[2];
  const t = hh > 1e-6 ? (L1 * (U[0] * H[0] + U[1] * H[1] + U[2] * H[2])) / hh : 0;
  const P = OUT.p;
  P[0] = L1 * U[0] - t * H[0];
  P[1] = L1 * U[1] - t * H[1];
  P[2] = L1 * U[2] - t * H[2];
  if (Math.hypot(P[0], P[1], P[2]) < 1e-4) {
    P[0] = -0.3;
    P[1] = -0.3;
    P[2] = -0.9;
  }
  nrm(P);
  // the blade: the forearm's line (now against level ground) turned forward and up by the grip, and a
  // little out to his right; never steeper down than `low` (the point off the grass)
  const fb = Math.atan2(F[2], -F[1]); // the forearm's angle from hanging, body axes
  const elev = Math.max(fb + gr * D - Math.PI / 2, -RUN_SWORDS.low * D);
  const o = out * D, ce = Math.cos(elev);
  const Dd = OUT.d;
  Dd[0] = -ce * Math.sin(o);
  Dd[1] = Math.sin(elev);
  Dd[2] = ce * Math.cos(o);
  // the flat: square to the blade, out to his right (edge down) rolled `roll` toward the sky
  const r = K.roll * D, Fl = OUT.f;
  Fl[0] = -Math.cos(r) * Math.cos(o);
  Fl[1] = Math.sin(r);
  Fl[2] = -Math.cos(r) * Math.sin(o);
  return true;
}
/** The trailing carries (the owner's sketch, 2026-11-25): the arm by forward kinematics as in `hip`,
 *  the blade going on from the forearm's line behind him, lifted `tilt` off it and turned `yaw` out to
 *  his right, its slant held in `down`. */
function trailing(OUT, K, ph, armF, s, tilt) {
  const R = K.run, S = K.sprint;
  const cs = Math.cos(2 * Math.PI * (ph - RUN_SWORDS.lag));
  const sw = clamp(cs * (Number.isFinite(armF) ? armF : 1), -1, 1); // +1 forward
  const f = 0.5 + 0.5 * sw;
  const tl = Number.isFinite(tilt) ? clamp(tilt, -0.6, 1.0) : 0;
  const L = (k, i) => lerp(i === undefined ? R[k] : lerp(R[k][0], R[k][1], i), i === undefined ? S[k] : lerp(S[k][0], S[k][1], i), s);
  const phi = lerp(R.phi[0], S.phi[0], s) + lerp(R.phi[1], S.phi[1], s) * sw;
  const ab = L('ab'), el = L('el', f), side = L('side'), lift = L('tilt', f);
  const yaw = L('yaw');
  armFK(OUT, phi, ab, el, side, tl);
  if (K.flail) return pendulum(OUT, K, ph, armF, s);
  if (K.fist) return fistBlade(OUT, K, s);
  if (K.over > 1) for (let i = 0; i < 3; i++) OUT.h[i] *= K.over;
  // the forearm's angle from hanging in his own sagittal plane (body axes, after the lean; − = behind),
  // the blade going on from it behind him, lifted off it, its slant below level held inside `down`
  const fb = Math.atan2(F[2], -F[1]);
  // (never forward of 20° behind hanging; floored after the lift, so a forearm that hangs and swings past
  // vertical still rocks the blade: floored before it, the blade froze)
  let th = Math.min(fb - lift * D, -0.35);
  const dn = Math.PI / 2 + th; // the slant below level (rad): th = −90° is level behind him
  th = -Math.PI / 2 + clamp(dn, K.down[0] * D, K.down[1] * D);
  const vy = -Math.cos(th), vz = Math.sin(th); // vz < 0: behind him
  const o = yaw * D, co = Math.cos(o), so = Math.sin(o);
  const Dd = OUT.d;
  Dd[0] = vz * so; // (vz < 0: out to his right, −x)
  Dd[1] = vy;
  Dd[2] = vz * co;
  // the flat: square to the blade, from out to his side rolled toward the sky
  DBG.fb = fb / D;
  DBG.slant = dn / D;
  DBG.wrist = Math.acos(clamp(F[0] * Dd[0] + F[1] * Dd[1] + F[2] * Dd[2], -1, 1)) / D;
  const r = K.roll * D, ce = Math.hypot(Dd[0], Dd[2]) || 1;
  const sx = -Dd[2] / ce, sz = Dd[0] / ce; // horizontal, square to the blade (his right when it trails)
  const nx = sx * Math.cos(r), ny = Math.sin(r), nz = sz * Math.cos(r);
  // remove the part along the blade, normalise
  const dd = nx * Dd[0] + ny * Dd[1] + nz * Dd[2];
  const Fl = OUT.f;
  Fl[0] = nx - dd * Dd[0];
  Fl[1] = ny - dd * Dd[1];
  Fl[2] = nz - dd * Dd[2];
  nrm(Fl);
  return true;
}
/** A blade held in the fist (the G carries): set by the hand, not by the world. The thumb faces `thumb` degrees
 *  round the forearm (0 = his front, 90 = out to his right, 180 = behind), and the blade leaves the fist on the
 *  thumb side `grip` degrees off the forearm's line (a fist on a grip: ~90; the wrist tips it 20-30° either way).
 *  The flat lies across the knuckles (square to the forearm and the blade: the fist never twists), rolled `roll`
 *  about the blade. The arm's swing carries it: the blade rides with the hand. */
function fistBlade(OUT, K, s) {
  const G = K.fist;
  const th = lerp(G.run.thumb, G.sprint.thumb, s) * D, gr = lerp(G.run.grip, G.sprint.grip, s) * D;
  // the hand frame round the forearm F: `fw` his front square to it, `rt` his right square to both
  const fx = F[0], fy = F[1], fz = F[2];
  let ax = -fx * fz, ay = -fy * fz, az = 1 - fz * fz; // (0,0,1) minus its part along F
  let l = Math.hypot(ax, ay, az) || 1;
  ax /= l; ay /= l; az /= l;
  // right = F × front … his right is −x: pick the sign that points to −x
  let rx = fy * az - fz * ay, ry = fz * ax - fx * az, rz = fx * ay - fy * ax;
  if (rx > 0) { rx = -rx; ry = -ry; rz = -rz; }
  const tx = Math.cos(th) * ax + Math.sin(th) * rx, ty = Math.cos(th) * ay + Math.sin(th) * ry, tz = Math.cos(th) * az + Math.sin(th) * rz;
  const Dd = OUT.d;
  Dd[0] = Math.cos(gr) * fx + Math.sin(gr) * tx;
  Dd[1] = Math.cos(gr) * fy + Math.sin(gr) * ty;
  Dd[2] = Math.cos(gr) * fz + Math.sin(gr) * tz;
  nrm(Dd);
  // (the wrist drops the point as the arm swings forward: never higher than `top` below level; tipped up past
  // it the blade read as held out in front, ADR-204's look the owner moved away from)
  if (G.top !== undefined) {
    const el = Math.asin(clamp(Dd[1], -1, 1)), cap = -G.top * D;
    if (el > cap) {
      const h = Math.hypot(Dd[0], Dd[2]) || 1, c2 = Math.cos(cap);
      Dd[0] = (Dd[0] / h) * c2;
      Dd[2] = (Dd[2] / h) * c2;
      Dd[1] = Math.sin(cap);
    }
  }
  // the fist's roll round the grip (the flat, swF: the sword's +Y, the side the thumb lies on, gripFist): the
  // forearm comes into the fist from the side opposite the thumb (−Y), a little toward the edge away from the
  // knuckle ridge (−X), as in his stand and his guard. (Square to the forearm and the blade, the knuckle line, it
  // came in on the thumb's side: the thumb wedged between the wrist and the grip, a fist wrung round.)
  const fd = fx * Dd[0] + fy * Dd[1] + fz * Dd[2];
  let qx = fx - fd * Dd[0], qy = fy - fd * Dd[1], qz = fz - fd * Dd[2];
  l = Math.hypot(qx, qy, qz) || 1;
  qx = -qx / l; qy = -qy / l; qz = -qz / l; // Y0: away from the forearm's side
  const tw = (G.twist ?? 0) * D, ct = Math.cos(tw), st = Math.sin(tw); // (30°: the forearm in at the angle his stand and his guard have)
  // Y = Y0 cos tw + (Z × Y0) sin tw, Z = the blade
  const kx = Dd[1] * qz - Dd[2] * qy, ky = Dd[2] * qx - Dd[0] * qz, kz = Dd[0] * qy - Dd[1] * qx;
  const Fl = OUT.f;
  Fl[0] = qx * ct + kx * st;
  Fl[1] = qy * ct + ky * st;
  Fl[2] = qz * ct + kz * st;
  nrm(Fl);
  DBG.wrist = gr / D;
  return true;
}
/** FLAIL's blade: it hangs from the hand by its own weight and swings a beat behind the arm (`lag` of a
 *  cycle): its slant below level (`slant`: centre, swing) and how far round it stands out from straight behind
 *  him to his right (`out`: centre, swing; further out as it swings back), both run → sprint. No state. */
function pendulum(OUT, K, ph, armF, s) {
  const FL = K.flail, R = FL.run, S = FL.sprint;
  const c2 = Math.cos(2 * Math.PI * (ph - RUN_SWORDS.lag - FL.lag));
  const sw = clamp(c2 * (Number.isFinite(armF) ? armF : 1), -1, 1); // +1: the arm (a beat ago) forward
  const sl = (lerp(R.slant[0], S.slant[0], s) + lerp(R.slant[1], S.slant[1], s) * sw) * D;
  const out = (lerp(R.out[0], S.out[0], s) - lerp(R.out[1], S.out[1], s) * sw) * D;
  const ce = Math.cos(sl), Dd = OUT.d;
  Dd[0] = -ce * Math.sin(out); // his right
  Dd[1] = -Math.sin(sl);
  Dd[2] = -ce * Math.cos(out); // behind
  DBG.slant = sl / D;
  DBG.wrist = Math.acos(clamp(F[0] * Dd[0] + F[1] * Dd[1] + F[2] * Dd[2], -1, 1)) / D;
  const r = K.roll * D, ch = Math.hypot(Dd[0], Dd[2]) || 1;
  const sx = -Dd[2] / ch, sz = Dd[0] / ch;
  const nx = sx * Math.cos(r), ny = Math.sin(r), nz = sz * Math.cos(r);
  const dd = nx * Dd[0] + ny * Dd[1] + nz * Dd[2], Fl = OUT.f;
  Fl[0] = nx - dd * Dd[0];
  Fl[1] = ny - dd * Dd[1];
  Fl[2] = nz - dd * Dd[2];
  nrm(Fl);
  return true;
}
/** The sword arm by forward kinematics in the torso's frame, turned by the lean: OUT.h (the hand off
 *  its shoulder spot) and OUT.p (the elbow's pole); F holds the forearm's direction after. */
function armFK(OUT, phiDeg, abDeg, el, side, tl) {
  const p = phiDeg * D, a = abDeg * D, ca = Math.cos(a), sa = Math.sin(a);
  U[0] = -sa;
  U[1] = -ca * Math.cos(p);
  U[2] = ca * Math.sin(p);
  const fa = p + (Math.PI - el * D);
  F[0] = -sa * side;
  F[1] = -Math.cos(fa);
  F[2] = Math.sin(fa);
  nrm(F);
  tiltX(U, tl);
  tiltX(F, tl);
  const L1 = DIM.upperArm, L2 = DIM.foreArm;
  const H = OUT.h;
  for (let i = 0; i < 3; i++) H[i] = L1 * U[i] + L2 * F[i];
  const hh = H[0] * H[0] + H[1] * H[1] + H[2] * H[2];
  const t = hh > 1e-6 ? (L1 * (U[0] * H[0] + U[1] * H[1] + U[2] * H[2])) / hh : 0;
  const P = OUT.p;
  P[0] = L1 * U[0] - t * H[0];
  P[1] = L1 * U[1] - t * H[1];
  P[2] = L1 * U[2] - t * H[2];
  if (Math.hypot(P[0], P[1], P[2]) < 1e-4) {
    P[0] = -0.3;
    P[1] = -0.3;
    P[2] = -0.9;
  }
  nrm(P);
}
function fin0(v) {
  return Number.isFinite(v) ? v : 0;
}
function tiltX(v, t) {
  const c = Math.cos(t), s = Math.sin(t), y = v[1], z = v[2];
  v[1] = y * c - z * s;
  v[2] = y * s + z * c;
}
function nrm(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  if (l > 1e-8) {
    v[0] /= l;
    v[1] /= l;
    v[2] /= l;
  } else {
    v[0] = 0;
    v[1] = -1;
    v[2] = 0;
  }
}
