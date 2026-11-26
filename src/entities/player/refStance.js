// The hero's stand, fight hold and guard after the owner's reference footage (ADR-207; the owner,
// 2026-11-25: "review these sections on the videos for all the idle animation and poses for you to mirror
// to this game ... i also want you to adjust the guarding stance and animation from the reference video").
// Their answers: the two-handed hold is the FIGHT stance (locked on, a boss fight), at ease he stands
// one-handed; the put-away and the draw are an occasional idle moment (idles.js `stow`); today's habits,
// tricks and spells stay, starting from and coming back to this stand.
//
//   REF_STAND   at ease: tall, the feet about shoulder width, the left a short step ahead, hips and chest
//               square. The sword hand hangs at the right hip, the elbow soft; the blade runs on from it
//               forward, down and out to his right, the point at shin height well ahead of the right foot.
//               The free arm hangs relaxed a little off the body, the hand open by the left thigh. Only the
//               breath moves him.
//   REF_READY   the fight: both hands on the grip before the right of his belly, the left below the right,
//               the blade up and forward (~47°) and out to his right, the point above his head; upright,
//               relaxed. The footage stands the left foot ahead; this hold keeps the feet the light chain
//               steps from and comes home to (the right a short step ahead, the hips square; ADR-207).
//   REF_GUARD   the block (`?guard=ward` keeps the cross ward before it, anim.js blockPose): a braced
//               crouch, the knees bent and out, the feet wide, leaning in; both hands on the grip raised
//               before his right shoulder, the elbows out, the blade rising across his face to his left
//               (~32° up, the point past his left shoulder above his head), the flat to the foe. Seen from
//               his side the blade lies in the plane of his chest and reads as upright (the footage's side
//               view); from the front and behind it is the slant. The body sinks into it over ~0.3 s; the
//               hands come up with the clip's cross-fade.
//
// The stand's numbers start from the steel look set's (`?lights=steel`, the same footage) so the two agree. The
// blade's flat is rolled up off the sides (FLAT_ROLL): the footage holds it flat to the sides, edge down,
// which from the game camera above and behind him is the edge alone, a line one letter wide.
//
// Pose space: body axes (x his left, y up, z ahead); hand targets are offsets from each shoulder
// (anim.js). Every writer here only writes a pose: no allocation, never throws.
import { smoothstep } from '../../core/math.js';
import { DIM } from './heroDims.js';
import { standLife } from './stances.js';

const ANK = DIM.ankle;
const DEG = Math.PI / 180;
// a sword-hand offset → the same point as a free-hand offset (x): the two shoulders' spacing (anim.js's own)
const LEFT_FROM_RIGHT = -(DIM.shoulder[0] + DIM.gripShoulder[0]);

// ---------------------------------------------------------------- the guard switch
const GIDS = ['ref', 'ward'];
export const GUARD_IDS = Object.freeze(GIDS.slice());
export const GUARD_NAMES = Object.freeze({ ref: 'the braced guard, the blade upright (the reference)', ward: 'the cross ward (before)' });
const q = (name) => {
  try {
    return typeof location !== 'undefined' ? new URLSearchParams(location.search).get(name) : null;
  } catch {
    return null;
  }
};
const GPICK = { mode: q('guard') === 'ward' ? 'ward' : 'ref' };
/** The block's pose drawn now: 'ref' (REF_GUARD) or 'ward' (the cross ward before). */
export const guardMode = () => GPICK.mode;
/** Lab / tests: switch live. Returns the id now set. */
export function setGuard(id) {
  GPICK.mode = String(id) === 'ward' ? 'ward' : 'ref';
  return GPICK.mode;
}

// ---------------------------------------------------------------- the poses (content is data)
/** The stand at ease (body axes, m; blade [azimuth + his left, elevation] in degrees). */
export const REF_STAND = {
  rH: [-0.08, -0.49, 0.12], // the sword hand at the hip, a fist outside the thigh, a little ahead
  // its elbow soft, a little back and out: the upper arm off the ribs (pulled in, it hung 3.5 cm into the
  // warden cuirass's belt, ADR-207)
  rP: [-0.15, -0.3, -0.94],
  // the elbow the forearm-led tricks and spells start from (idles.js syncStandArm): the arm's pole as it was
  // before the elbow went out; from the elbow out, the salute's and the spells' raised fist turned 65-77° off the
  // forearm (≤ 60, ADR-186). Their envelope carries the arm between the two
  leadP: [0.45, -0.25, -0.85],
  sw: [-16, -19], // the blade: forward, down and out to his right
  lH: [0.14, -0.47, 0.08], // the free hand by the left thigh, a fist off it
  lP: [0.45, -0.2, -0.87],
  rF: [-0.23, -0.13], // the feet [x, z]: a little over shoulder width, the left a short step ahead
  lF: [0.23, 0.14],
};
/** The fight's two-handed hold. lH: where the free hand is drawn toward before it is on the grip (the blend
 *  from the stand carries it there in front of him, never through his hips). */
export const REF_READY = {
  // (the footage holds the grip at the belt; there the sword wrist bent 70-90° off the forearm, past the 60°
  // at which the fist, built on the sword's frame, turns off the wrist: a hand higher, the forearm rising)
  rH: [-0.05, -0.25, 0.3], // the grip before the right of his belly
  rP: [0.2, -0.95, -0.2], // the elbow down by the ribs
  sw: [-30, 47], // up and forward, a little out to his right: the point above his head
  lH: [-0.05 + LEFT_FROM_RIGHT, -0.33, 0.28],
  // (the free elbow out: across his front, the robe's sleeve wing on that upper arm swung through his chest
  // in the chain, 8.9 % of the route's frames; ADR-207)
  lP: [1, -0.2, -0.2],
  // (the feet the light chain steps from and comes home to: the right a short step ahead, the left back.
  // The footage stands the left ahead; from there every light stepped the other foot, the holding foot
  // settled 8-12 cm sideways and the way home drew back the wrong one: ADR-207)
  rF: [-0.12, 0.18],
  lF: [0.12, -0.18],
  hip: 0, // the hips' turn (pelvY: + the right hip ahead, with the right foot)
};
/** The guard (the block). feet: where the stance settles once held [right x, z, left x, z]. */
export const REF_GUARD = {
  rH: [0.0, 0.02, 0.3], // the grip before the right shoulder, at the chin
  rP: [-0.85, -0.45, -0.25], // the elbows out
  sw: [82, 32], // across his face to his left and up, a touch ahead of the chest's plane
  lH: [-0.07 + LEFT_FROM_RIGHT, -0.05, 0.3],
  lP: [0.85, -0.45, -0.25],
  feet: [-0.27, -0.36, 0.21, 0.36],
  sink: 0.3, // s: the body sinks into the crouch over this
};
/** The blade's flat rolled up off his sides by this much (deg; see the header). */
export const FLAT_ROLL = 40;

// ---------------------------------------------------------------- helpers (no allocation)
function set3(p, i, x, y, z) {
  p[i] = x;
  p[i + 1] = y;
  p[i + 2] = z;
}
function dir(p, i, az, el) {
  const a = az * DEG, e = el * DEG, c = Math.cos(e);
  p[i] = c * Math.sin(a);
  p[i + 1] = Math.sin(e);
  p[i + 2] = c * Math.cos(a);
}
/** The flat's normal for the blade p[swD]: its side (horizontal, square to the blade, toward his right for a
 *  blade ahead) rolled up by `roll` degrees toward the blade's own up. */
export function flatRolled(p, P, roll) {
  const dx = p[P.swD], dy = p[P.swD + 1], dz = p[P.swD + 2];
  // side = d × up = (-dz, 0, dx)
  let sx = -dz, sz = dx;
  let sl = Math.hypot(sx, sz);
  if (sl < 1e-4) {
    sx = -1;
    sz = 0;
    sl = 1;
  }
  sx /= sl;
  sz /= sl;
  // its up: side × d
  let ux = -dy * sz, uy = sz * dx - sx * dz, uz = sx * dy;
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul;
  uy /= ul;
  uz /= ul;
  const c = Math.cos(roll * DEG), s = Math.sin(roll * DEG);
  set3(p, P.swF, sx * c + ux * s, uy * s, sz * c + uz * s);
}

// ---------------------------------------------------------------- the writers
/** At ease (the whole body over guard()'s). P = anim.js's channel map; A = the animator (its time). */
export function refStand(p, P, A) {
  const m = standLife(Number.isFinite(A.time) ? A.time : 0, false), S = REF_STAND;
  p[P.bodyX] = 0.012 * m.sw; // the weight drifts from foot to foot
  p[P.bodyY] = -0.012 + 0.006 * m.br;
  p[P.bodyZ] = 0.005;
  p[P.pelvX] = 0;
  p[P.pelvY] = -0.06; // the left hip a touch ahead, with the left foot
  p[P.pelvZ] = -0.015 * m.sw;
  p[P.spX] = 0.04 + 0.018 * m.br; // tall; the chest rises with the breath
  p[P.spY] = 0.05;
  p[P.spZ] = 0.012 * m.sw;
  p[P.hdX] = 0.07 - 0.015 * m.br; // looking ahead, a little down
  p[P.hdY] = 0.04 + 0.06 * m.look;
  p[P.hdZ] = 0;
  set3(p, P.rH, S.rH[0] + 0.004 * m.tipB, S.rH[1] + 0.008 * m.brL, S.rH[2] + 0.006 * m.tipA);
  set3(p, P.rP, S.rP[0], S.rP[1], S.rP[2]);
  dir(p, P.swD, S.sw[0] + 1.6 * m.tipA, S.sw[1] + 1.4 * m.tipB + 0.8 * m.brL);
  flatRolled(p, P, FLAT_ROLL);
  // the free arm hanging, the hand open, the fingers down, the palm in toward the thigh
  set3(p, P.lH, S.lH[0] + 0.004 * m.sw, S.lH[1] + 0.008 * m.brL, S.lH[2] + 0.004 * m.brL);
  set3(p, P.lP, S.lP[0], S.lP[1], S.lP[2]);
  set3(p, P.lD, 0.06, -0.97, 0.22);
  set3(p, P.lN, -0.97, -0.02, 0.18);
  p[P.hs] = 0;
  p[P.lk] = 0;
  p[P.twoHand] = 0;
  p[P.offAt] = 0;
  set3(p, P.rF, S.rF[0], ANK, S.rF[1]);
  set3(p, P.lF, S.lF[0], ANK, S.lF[1]);
  set3(p, P.rK, -0.25, 0, 1);
  set3(p, P.lK, 0.25, 0, 1);
  p[P.rFy] = -0.3;
  p[P.lFy] = 0.25;
  p[P.rFf] = 1;
  p[P.lFf] = 1;
  p[P.footFlat] = 0.95;
}

/** The fight's two-handed hold (the whole body over guard()'s). */
export function refReady(p, P, A) {
  const m = standLife(Number.isFinite(A.time) ? A.time : 0, true), S = REF_READY;
  p[P.bodyX] = 0.008 * m.sw;
  p[P.bodyY] = -0.03 + 0.006 * m.br; // the knees soft
  p[P.bodyZ] = 0.008 * m.dr;
  p[P.pelvX] = 0;
  p[P.pelvY] = S.hip; // turned a little, the right hip ahead with the right foot
  p[P.pelvZ] = -0.01 * m.sw;
  p[P.spX] = 0.05 + 0.016 * m.br;
  p[P.spY] = 0.02;
  p[P.spZ] = 0;
  p[P.hdX] = 0.04 - 0.012 * m.br;
  p[P.hdY] = -(S.hip + 0.02) + 0.03 * m.look; // the eyes ahead, on the foe
  p[P.hdZ] = 0;
  set3(p, P.rH, S.rH[0] + 0.004 * m.tipB, S.rH[1] + 0.01 * m.brL, S.rH[2] + 0.006 * m.tipA);
  set3(p, P.rP, S.rP[0], S.rP[1], S.rP[2]);
  dir(p, P.swD, S.sw[0] + 1.8 * m.tipA, S.sw[1] + 1.6 * m.tipB + 1.0 * m.brL);
  flatRolled(p, P, FLAT_ROLL);
  set3(p, P.lH, S.lH[0], S.lH[1], S.lH[2]);
  set3(p, P.lP, S.lP[0], S.lP[1], S.lP[2]);
  set3(p, P.lD, 0.1, -0.5, 0.86);
  set3(p, P.lN, -0.9, 0, 0.3);
  p[P.hs] = 0; // an open hand to the grip
  p[P.lk] = 0;
  p[P.twoHand] = 1;
  p[P.offAt] = 0;
  set3(p, P.rF, S.rF[0], ANK, S.rF[1]);
  set3(p, P.lF, S.lF[0], ANK, S.lF[1]);
  set3(p, P.rK, -0.3, 0, 1);
  set3(p, P.lK, 0.3, 0, 1);
  p[P.rFy] = -0.35;
  p[P.lFy] = 0.6;
  p[P.rFf] = 1;
  p[P.lFf] = 1;
  p[P.footFlat] = 0.95;
}

/** The guard's upper body and crouch (anim.js blockPose writes the feet, the breath, the recoil). */
export function refGuard(p, P, A) {
  const G = REF_GUARD, t = Number.isFinite(A.t) ? A.t : 1;
  const k = smoothstep(0, G.sink, t); // the body sinks into the crouch
  p[P.bodyX] = 0;
  p[P.bodyY] = -0.08 - 0.17 * k;
  p[P.bodyZ] = 0.01 * k;
  p[P.pelvX] = 0.06 * k;
  p[P.pelvY] = -0.25;
  p[P.pelvZ] = 0;
  p[P.spX] = 0.16 + 0.26 * k; // leaning in over the front knee
  p[P.spY] = 0.12;
  p[P.spZ] = 0;
  p[P.hdX] = -0.12 - 0.2 * k; // the head up behind the blade, the eyes ahead
  p[P.hdY] = 0.12;
  p[P.hdZ] = 0;
  set3(p, P.rH, G.rH[0], G.rH[1], G.rH[2]);
  set3(p, P.rP, G.rP[0], G.rP[1], G.rP[2]);
  dir(p, P.swD, G.sw[0], G.sw[1]);
  set3(p, P.swF, -0.12, 0, 1); // the flat to the foe
  set3(p, P.lH, G.lH[0], G.lH[1], G.lH[2]);
  set3(p, P.lP, G.lP[0], G.lP[1], G.lP[2]);
  p[P.twoHand] = 1;
  p[P.offAt] = 0;
  p[P.hs] = 0;
  p[P.lk] = 0;
  set3(p, P.rK, -0.6, 0, 1); // the knees out
  set3(p, P.lK, 0.5, 0, 1);
}
