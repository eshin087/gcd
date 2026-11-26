// The steel look set's standing pose (`?lights=steel`, ADR-207): how the hero stands with the sword,
// after the owner's reference footage. anim.js stand() calls steelStand in place of the two stances
// (stances.js) while the look set is on (STEEL.on: combat.js setLights flips it).
//
// The reference's idle, read from four views (right side, front, left side, back): ONE pose, at ease
// and in a fight alike. He stands tall, the feet about shoulder width and toes a little out, the left
// foot a short step ahead of the right; hips and chest square to the front. The sword arm hangs with a
// soft elbow, the hand at the hip a fist outside the thigh and a little ahead of it; the blade runs on
// from the hand forward, down and out to his right (about 16 deg out, 26 deg down: the point at shin
// height a blade's length ahead of his right foot), its flat to the sides. The free arm hangs relaxed a little off the
// body, the elbow soft, the hand by the left thigh. Pose space: body axes (x = his left, y up, z
// ahead); hand targets are offsets from each shoulder (anim.js).
import { DIM } from './heroDims.js';
import { standLife } from './stances.js';

/** on: the steel look set is the one worn. */
export const STEEL = { on: false };

const ANK = DIM.ankle;
const DEG = Math.PI / 180;
function dir(p, i, az, el) {
  const a = az * DEG, e = el * DEG, c = Math.cos(e);
  p[i] = c * Math.sin(a);
  p[i + 1] = Math.sin(e);
  p[i + 2] = c * Math.cos(a);
}
function set3(p, i, x, y, z) {
  p[i] = x;
  p[i + 1] = y;
  p[i + 2] = z;
}

/** The standing pose's numbers (body axes, m / degrees), the reference's idle. */
export const STEEL_STAND = {
  rH: [-0.06, -0.535, 0.09], // the sword hand: at the hip, a fist outside the thigh, a little ahead
  rP: [0.45, -0.25, -0.85], // its elbow soft, a little back
  sw: [-16, -26], // the blade: [azimuth (+ his left), elevation], forward, down and out to his right
  lH: [0.14, -0.51, 0.09], // the free hand: hanging by the left thigh, a fist off it
  lP: [0.3, -0.15, -0.95], // its elbow soft, back
  rF: [-0.23, -0.13], // the feet [x, z]: a little over shoulder width, the left a short step ahead
  lF: [0.23, 0.14],
};

/** Write the standing pose over guard()'s (p: the pose, P: anim.js's channel map, A: the animator).
 *  Returns false while it is not written: stand() then uses today's stances. */
export function steelStand(p, P, A) {
  const m = standLife(Number.isFinite(A.time) ? A.time : 0, false), S = STEEL_STAND;
  // the weight: a slow shift from foot to foot, the chest rising with the breath
  p[P.bodyX] = 0.012 * m.sw;
  p[P.bodyY] = -0.012 + 0.006 * m.br;
  p[P.bodyZ] = 0.005;
  p[P.pitch] = 0;
  p[P.yaw] = 0;
  p[P.roll] = 0;
  p[P.pelvX] = 0;
  p[P.pelvY] = -0.06; // the left hip a touch ahead, with the left foot
  p[P.pelvZ] = -0.015 * m.sw; // the weight hip rides higher
  p[P.spX] = 0.04 + 0.018 * m.br; // tall, the chest a little over the hips
  p[P.spY] = 0.05;
  p[P.spZ] = 0.012 * m.sw;
  p[P.hdX] = 0.07 - 0.015 * m.br; // looking ahead, a little down
  p[P.hdY] = 0.04 + 0.06 * m.look;
  p[P.hdZ] = 0;
  // the sword arm: it trails the breath (STAND_LIFE.arms) and the point drifts a little
  set3(p, P.rH, S.rH[0] + 0.004 * m.tipB, S.rH[1] + 0.008 * m.brL, S.rH[2] + 0.006 * m.tipA);
  set3(p, P.rP, S.rP[0], S.rP[1], S.rP[2]);
  dir(p, P.swD, S.sw[0] + 1.6 * m.tipA, S.sw[1] + 1.4 * m.tipB + 0.8 * m.brL);
  // the flat to the sides (broad to the side views, as the reference's), square to the blade
  const a = (S.sw[0] + 1.6 * m.tipA) * DEG;
  set3(p, P.swF, Math.cos(a), 0, -Math.sin(a));
  // the free arm: hanging, a little off the body; the hand open and relaxed, the fingers down, the
  // palm in toward the thigh
  set3(p, P.lH, S.lH[0] + 0.004 * m.sw, S.lH[1] + 0.008 * m.brL, S.lH[2] + 0.004 * m.brL);
  set3(p, P.lP, S.lP[0], S.lP[1], S.lP[2]);
  set3(p, P.lD, 0.06, -0.97, 0.22);
  set3(p, P.lN, -0.97, -0.02, 0.18);
  p[P.hs] = 0;
  p[P.lk] = 0;
  p[P.sd] = 0;
  p[P.twoHand] = 0;
  p[P.offAt] = 0;
  p[P.flask] = 0;
  // the feet: shoulder width, the toes a little out, the knees all but straight
  set3(p, P.rF, S.rF[0], ANK, S.rF[1]);
  set3(p, P.lF, S.lF[0], ANK, S.lF[1]);
  set3(p, P.rK, -0.25, 0, 1);
  set3(p, P.lK, 0.25, 0, 1);
  p[P.rFy] = -0.3;
  p[P.lFy] = 0.25;
  p[P.rFf] = 1;
  p[P.lFf] = 1;
  p[P.footFlat] = 0.95;
  return true;
}

/** The charge's hold numbers (body axes), the reference's charged heavy held back (its HOLD): the
 *  sword hand drawn back high at his right, the blade hanging back and down to the ground behind him, the chest
 *  turned to the sword side and leaning over a wide sunk stance, the free arm out ahead, bent. */
export const STEEL_CHARGE = {
  rH: [-0.2, -0.2, -0.36], // the sword hand drawn back high at his right, out from the ribs, behind the hip
  rP: [-0.9, -0.3, -0.2], // its elbow bent and out to the side
  sw: [-160, -47], // the blade hangs from it back and down, the point by the ground behind him
  lH: [0.26, -0.44, 0.18], // the free hand out ahead and to the left at the waist, the elbow bent
  lP: [0.85, -0.2, -0.5], // its elbow out and back
  rF: [-0.3, -0.3], // the feet [x, z]: wide, the left well ahead, the knees deep
  lF: [0.28, 0.33],
};

/** The charge's hold (anim.js chargePose, under the steel look set). k: the charge 0..1; s: the
 *  hold's ease in 0..1 (its first 0.25 s); walkLegs: anim.js's (he can still walk, slowly). */
export function steelCharge(p, P, A, k, s, walkLegs) {
  const C = STEEL_CHARGE;
  const kk = Number.isFinite(k) ? k : 0, ss = Number.isFinite(s) ? s : 1, w = ss * kk;
  p[P.bodyX] = 0;
  p[P.bodyY] = -0.06 - 0.22 * ss - 0.03 * w; // he sinks into the stance as the charge builds
  p[P.bodyZ] = -0.03 * ss;
  p[P.pelvX] = 0;
  p[P.pelvY] = -0.36 * ss - 0.04 * w; // turned to the sword side, the right hip back
  p[P.pelvZ] = 0;
  p[P.spX] = 0.06 + 0.42 * ss + 0.05 * w; // hunched over the front knee
  p[P.pitch] = 0.1 * ss;
  p[P.spY] = -0.42 * ss - 0.06 * w;
  p[P.spZ] = 0.04 * ss;
  p[P.hdY] = -(p[P.pelvY] + p[P.spY]) * 0.85; // the eyes stay on the target
  p[P.hdX] = -0.02 * ss; // the head low with the chest, the eyes still up on the target
  p[P.hdZ] = 0;
  // (the arms are there at once: the clip's cross-fade carries them from the heavy's windup the
  // press began, as today's charge does; eased in from the standing pose they went there and back)
  set3(p, P.rH, C.rH[0], C.rH[1] - 0.02 * w, C.rH[2] - 0.03 * w);
  set3(p, P.rP, C.rP[0], C.rP[1], C.rP[2]);
  const az = C.sw[0];
  dir(p, P.swD, az, C.sw[1] - 3 * w);
  // the flat to the sides of him (the edge down toward the ground behind)
  const a = az * DEG;
  set3(p, P.swF, Math.cos(a), 0, -Math.sin(a));
  set3(p, P.lH, C.lH[0], C.lH[1], C.lH[2]);
  set3(p, P.lP, C.lP[0], C.lP[1], C.lP[2]);
  set3(p, P.lD, 0.15, -0.3, 0.94); // the hand open ahead, the fingers toward the foe
  set3(p, P.lN, 0.3, -0.9, -0.2);
  p[P.hs] = 0;
  p[P.lk] = 0;
  p[P.sd] = 0;
  p[P.twoHand] = 0;
  p[P.offAt] = 0;
  set3(p, P.rF, C.rF[0], ANK, C.rF[1]);
  set3(p, P.lF, C.lF[0], ANK, C.lF[1]);
  set3(p, P.rK, -0.6, 0, 1);
  set3(p, P.lK, 0.45, 0, 1);
  p[P.rFy] = -0.7;
  p[P.lFy] = 0.2;
  p[P.rFf] = 1;
  p[P.lFf] = 1;
  p[P.footFlat] = 0.95;
  if (kk >= 0.999) {
    // full: the hold trembles
    const q = Math.sin(A.time * 47) * 0.01;
    p[P.bodyX] += q;
    p[P.swD + 1] += q * 2;
  }
  if (typeof walkLegs === 'function') walkLegs(p, A);
  return true;
}
