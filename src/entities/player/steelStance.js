// The steel look set's charge hold (`?lights=steel`, ADR-234): what the hero stands in while the heavy
// button is held, after the owner's reference footage. anim.js chargePose calls steelCharge while the look
// set is on (STEEL.on: combat.js setLights flips it). How he STANDS is not the look set's: the standing
// pose, the two-handed hold of the fight and the guard follow the same footage for every look (ADR-207,
// refStance.js); a first steel stance was written beside it and dropped when that landed on main.
// Pose space: body axes (x = his left, y up, z ahead); hand targets are offsets from each shoulder (anim.js).
import { DIM } from './heroDims.js';

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
