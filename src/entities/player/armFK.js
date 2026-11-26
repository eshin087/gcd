// THE SWORD ARM BY ITS JOINTS (`?arm=fk`, ADR-240; the owner, 2026-11-26, after every keyed swing: "both
// hand arm sword swings and animation look so unnatural and unrealistic. spend time making sure the
// characters anatomy, angles, motions, attack swings, etc look like normal sword swings").
//
// Why the keyed swings never looked like an arm (the audit, `integ.mjs . armaudit`): a clip keyed THREE
// independent things for the sword arm, the hand's place (`h`, from a shoulder fixed on the chest, in the
// BODY's axes), the blade's direction (`a`) and the elbow's side (`rp`), and the IK joined them. So:
//   - the wrist took whatever angle was left between the forearm and a blade aimed on its own: through
//     light hit 1 the blade ran 11-25° off the forearm's line (a stick screwed onto the arm; a fist round
//     a grip cannot bring the blade nearer its forearm than ~35°), and the fist (a mesh on the sword)
//     turned with the steel, never with the forearm: no pronation, no cock and uncock;
//   - the torso's turn did not carry the arm (offsets in the body's axes): a 128° turn of the chest added
//     nothing to the hand's path, so every arc had to be keyed into the hand, against the turn;
//   - the hand ran Catmull-Rom chords in space between keys, through the sphere round the shoulder, so the
//     arm folded mid-cut and re-opened, and the elbow came from a third spline, lagged by ELBOW_RATE;
//   - the shoulder never moved: no rise into the coil, no reach forward into the cut (the hand was asked
//     past the arm's length, 1.07-1.17 of it, and the soft reach squeezed it);
//   - the "instant" cut was the arm itself jumping 105° → 157° at the elbow in two frames (the point at
//     123 m/s), no swing at all, just two poses.
//
// Here the arm is a chain of joints, each inside a real joint's range, keyed in the CHEST's frame (the
// torso carries it), and played proximal to distal (the shoulder a frame ahead of the elbow, the forearm's
// twist and the wrist a frame behind: the whip). The hand's place, the blade's direction, the elbow's side
// and the flat all come OUT of the chain, and are handed to the animator as the pose channels it already
// reads (`rH`, `swD`, `rP`, `swF`), so the IK draws exactly this arm and nothing after it changes:
//   sh  [az, el, rot]  the upper arm: its direction from the shoulder (az round the chest, 0 = ahead, + = his
//                      left; el above level, -90 = hanging) and its turn about itself (+ = internal: the
//                      forearm toward the body), degrees
//   el  the elbow's flexion (0 = straight … ELBOW[1]), degrees
//   pr  the forearm's twist (+ = pronation: the palm down, the thumb toward the body; 0 = the handshake,
//       the thumb up), degrees
//   wr  [dev, flex]  the wrist: deviation (+ radial: the blade cocked up toward the thumb; − ulnar: toward
//       the forearm's line) and flexion (+ toward the palm), degrees
// The blade leaves the fist GRIP degrees off the forearm's line at a neutral wrist (the handshake grip),
// the edge on the knuckles' side. The shoulder girdle follows the upper arm (GIRDLE): it rises as the
// arm goes up and comes forward and in as the arm reaches across.

import * as THREE from 'three';
import { DIM } from './heroDims.js';

const D = Math.PI / 180;
/** The joints' ranges (degrees): the upper arm's turn [external, internal], the elbow [least, most
 *  flexion], the forearm [supination, pronation], the wrist's deviation [ulnar, radial] and flexion
 *  [extension, flexion] (a fist on a grip binds the wrist: less than the bare hand's). */
export const LIMITS = { rot: [-80, 70], el: [20, 140], pr: [-70, 90], dev: [-35, 22], flex: [-55, 55] };
/** The blade off the forearm's line at a neutral wrist (deg): the grip runs across the palm. */
export const GRIP = 66;
/** The shoulder girdle (m, chest axes): how far the shoulder rises as the upper arm is raised (× the
 *  sine of its elevation above GIRDLE.from), comes forward as it reaches ahead, and in as it crosses. */
export const GIRDLE = { from: -20, rise: 0.045, fwd: 0.06, across: 0.035, back: 0.02 };
const clampD = (v, r) => Math.min(r[1], Math.max(r[0], v));

// scratch (no per-frame allocation)
const _q = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qs = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _u = new THREE.Vector3(), _n = new THREE.Vector3(), _t = new THREE.Vector3(), _m = new THREE.Vector3(), _F = new THREE.Vector3();
const _G = new THREE.Vector3(), _B = new THREE.Vector3(), _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _a = new THREE.Vector3();
const _S = new THREE.Vector3(), _E = new THREE.Vector3(), _W = new THREE.Vector3(), _c = new THREE.Vector3(), _h = new THREE.Vector3();
/** The right shoulder's joint and the sword hand's anchor on the chest (model.js: arms.R.upper / anchor). */
const SH0 = [-DIM.shoulder[0], DIM.shoulder[1], DIM.shoulder[2]], ANCH = [-DIM.gripShoulder[0], DIM.gripShoulder[1], DIM.gripShoulder[2]];

/**
 * The arm from its joints, in the CHEST's axes (+x his left, +y up, +z ahead). `j` = [az, el, rot, elbow,
 * pronation, dev, flex] (degrees, clamped to LIMITS). Writes `out`: { S, E, W } the shoulder (with the
 * girdle), the elbow and the grip (chest local, m), { B, X, Y } the blade, its edge and the flat's normal,
 * `g` the girdle's offset, and `wrist` the blade off the forearm's line (deg). Never throws.
 */
export function armChest(j, out) {
  const az = j[0] * D, el = Math.max(-89.5, Math.min(80, j[1])) * D;
  const rot = clampD(j[2], LIMITS.rot) * D, fl = clampD(j[3], LIMITS.el) * D;
  const pr = clampD(j[4], LIMITS.pr) * D, dev = clampD(j[5], LIMITS.dev), flex = clampD(j[6], LIMITS.flex) * D;
  _u.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  // the elbow's way: the hanging arm's forward bend, carried up by the shortest swing from hanging, then
  // turned about the upper arm (+ internal: toward the body, for the right arm)
  _qs.setFromUnitVectors(_a.set(0, -1, 0), _u);
  _n.set(0, 0, 1).applyQuaternion(_qs);
  _c.crossVectors(_u, _n);
  _n.multiplyScalar(Math.cos(rot)).addScaledVector(_c, -Math.sin(rot)).normalize();
  // the girdle: up with the arm, forward and in with the reach
  const up = Math.max(0, Math.sin(el - GIRDLE.from * D)), G = GIRDLE;
  const gx = G.across * Math.max(0, _u.x), gz = G.fwd * Math.max(0, _u.z) - G.back * Math.max(0, -_u.z);
  out.g[0] = gx;
  out.g[1] = G.rise * up;
  out.g[2] = gz;
  _S.set(SH0[0] + gx, SH0[1] + out.g[1], SH0[2] + gz);
  // the forearm, its thumb (t) and palm (m) at the handshake, then the twist about it
  _F.copy(_u).multiplyScalar(Math.cos(fl)).addScaledVector(_n, Math.sin(fl));
  _t.copy(_u).multiplyScalar(-Math.sin(fl)).addScaledVector(_n, Math.cos(fl));
  _m.crossVectors(_t, _F);
  _a.copy(_t);
  _t.multiplyScalar(Math.cos(pr)).addScaledVector(_m, Math.sin(pr));
  _m.multiplyScalar(Math.cos(pr)).addScaledVector(_a, -Math.sin(pr));
  // the wrist: flexion turns the hand's line toward the palm; the grip and the deviation raise the blade
  // off it toward the thumb; the edge faces the knuckles' way
  _G.copy(_F).multiplyScalar(Math.cos(flex)).addScaledVector(_m, Math.sin(flex));
  const b = (GRIP + dev) * D;
  _B.copy(_G).multiplyScalar(Math.cos(b)).addScaledVector(_t, Math.sin(b)).normalize();
  _X.copy(_G).multiplyScalar(Math.sin(b)).addScaledVector(_t, -Math.cos(b)).normalize();
  _Y.crossVectors(_B, _X).normalize();
  _E.copy(_S).addScaledVector(_u, DIM.upperArm);
  _W.copy(_E).addScaledVector(_F, DIM.foreArm);
  out.S.copy(_S);
  out.E.copy(_E);
  out.W.copy(_W);
  out.B.copy(_B);
  out.X.copy(_X);
  out.Y.copy(_Y);
  out.wrist = Math.acos(Math.max(-1, Math.min(1, _F.dot(_B)))) / D;
  out.elbow = 180 - fl / D;
  return out;
}

/** A scratch result for armChest. */
export const armOut = () => ({ S: new THREE.Vector3(), E: new THREE.Vector3(), W: new THREE.Vector3(), B: new THREE.Vector3(), X: new THREE.Vector3(), Y: new THREE.Vector3(), g: [0, 0, 0], wrist: 0, elbow: 180 });

// the soft reach the animator applies to the sword hand (anim.js _arm, HERO_SOFT with no second hand):
// a target past s0 of the arm's length is drawn in; the chain's own reach is handed over through its
// inverse, so the IK puts the grip exactly where the joints do
const SOFT = [0.93, 0.99], ARM_L = DIM.upperArm + DIM.foreArm;
function unsoft(d) {
  const d0 = SOFT[0] * ARM_L, span = (SOFT[1] - SOFT[0]) * ARM_L;
  if (!(d > d0)) return d;
  const x = Math.min(0.985, (d - d0) / span);
  return d0 - span * Math.log(1 - x);
}

const _qi = new THREE.Quaternion(), _P = new THREE.Vector3(), _n0 = new THREE.Vector3(), _t0 = new THREE.Vector3(), _m0 = new THREE.Vector3();
const _x2 = new THREE.Vector3(), _tp = new THREE.Vector3(), _J2 = [0, 0, 0, 0, 0, 0, 0];
/** The chest's turn (body axes) for a pose's pelvis and spine angles → _q. */
function chestTurn(p, P) {
  _e.set(p[P.pelvX], p[P.pelvY], p[P.pelvZ], 'YXZ');
  _qp.setFromEuler(_e);
  _e.set(p[P.spX], p[P.spY], p[P.spZ], 'YXZ');
  _q.setFromEuler(_e);
  return _q.premultiply(_qp);
}
/** The joints (into `j`, degrees, as armChest takes them, clamped) of the arm a pose draws through the IK
 *  (its `rH` through the soft reach, `rP`, `swD`, `swF`), so a joint-keyed clip can start from any pose.
 *  Of the flat's two sides the one whose forearm twist is nearer `near` (a joint set) is taken. */
export function poseToArm(p, P, j, near = null) {
  _qi.copy(chestTurn(p, P)).invert();
  // (the shoulder where the pose's girdle put it: the IK reaches from there)
  _S.set(SH0[0] + (p[P.clR] || 0), SH0[1] + (p[P.clR + 1] || 0), SH0[2] + (p[P.clR + 2] || 0));
  // the grip the IK draws: the anchor + the offset, drawn in by the soft reach
  _W.set(p[P.rH], p[P.rH + 1], p[P.rH + 2]).applyQuaternion(_qi);
  _W.x += ANCH[0];
  _W.y += ANCH[1];
  _W.z += ANCH[2];
  _h.subVectors(_W, _S);
  let d = _h.length();
  if (!(d > 1e-4)) return false;
  const d0 = SOFT[0] * ARM_L, span = (SOFT[1] - SOFT[0]) * ARM_L;
  if (d > d0) d = d0 + span * (1 - Math.exp(-(d - d0) / span));
  d = Math.max(0.12, Math.min(ARM_L * 0.9995, d));
  _h.normalize();
  // the elbow off the shoulder → grip line, the pole's way (the law of cosines)
  _P.set(p[P.rP], p[P.rP + 1], p[P.rP + 2]).applyQuaternion(_qi);
  _P.addScaledVector(_h, -_P.dot(_h));
  if (_P.lengthSq() < 1e-8) _P.set(0, -1, 0).addScaledVector(_h, -_h.y);
  _P.normalize();
  const a = DIM.upperArm, b = DIM.foreArm, ca = Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d)));
  _u.copy(_h).multiplyScalar(ca).addScaledVector(_P, Math.sqrt(Math.max(0, 1 - ca * ca))).normalize();
  _E.copy(_S).addScaledVector(_u, a);
  _F.copy(_S).addScaledVector(_h, d).sub(_E).normalize();
  const fl = Math.acos(Math.max(-1, Math.min(1, _u.dot(_F))));
  _n.copy(_F).addScaledVector(_u, -_F.dot(_u));
  if (_n.lengthSq() < 1e-8) _n.copy(_P);
  _n.normalize();
  _qs.setFromUnitVectors(_a.set(0, -1, 0), _u);
  _n0.set(0, 0, 1).applyQuaternion(_qs);
  _c.crossVectors(_u, _n0);
  const rot = Math.atan2(-_n.dot(_c), _n.dot(_n0));
  _t0.copy(_u).multiplyScalar(-Math.sin(fl)).addScaledVector(_n, Math.cos(fl));
  _m0.crossVectors(_t0, _F);
  // the hand: the blade and its edge (the flat's normal × the blade), on either side of the flat
  _B.set(p[P.swD], p[P.swD + 1], p[P.swD + 2]).applyQuaternion(_qi).normalize();
  _Y.set(p[P.swF], p[P.swF + 1], p[P.swF + 2]).applyQuaternion(_qi);
  _Y.addScaledVector(_B, -_Y.dot(_B));
  if (_Y.lengthSq() < 1e-8) _Y.set(1, 0, 0).addScaledVector(_B, -_B.x);
  _Y.normalize();
  let best = Infinity;
  for (const sg of [1, -1]) {
    _x2.crossVectors(_Y, _B).multiplyScalar(sg);
    const beta = Math.atan2(_x2.dot(_F), _B.dot(_F));
    _tp.copy(_B).multiplyScalar(Math.sin(beta)).addScaledVector(_x2, -Math.cos(beta));
    _G.copy(_B).multiplyScalar(Math.cos(beta)).addScaledVector(_x2, Math.sin(beta));
    const pr = Math.atan2(_tp.dot(_m0), _tp.dot(_t0));
    _m.copy(_m0).multiplyScalar(Math.cos(pr)).addScaledVector(_t0, -Math.sin(pr));
    const flex = Math.atan2(_G.dot(_m), _G.dot(_F));
    _J2[0] = Math.atan2(_u.x, _u.z) / D;
    _J2[1] = Math.asin(Math.max(-1, Math.min(1, _u.y))) / D;
    _J2[2] = clampD(rot / D, LIMITS.rot);
    _J2[3] = clampD(fl / D, LIMITS.el);
    _J2[4] = clampD(pr / D, LIMITS.pr);
    _J2[5] = clampD(beta / D - GRIP, LIMITS.dev);
    _J2[6] = clampD(flex / D, LIMITS.flex);
    const off = near ? Math.abs(_J2[4] - near[4]) + 0.5 * Math.abs(_J2[2] - near[2]) : sg < 0 ? 1 : 0;
    if (off < best) {
      best = off;
      for (let i = 0; i < 7; i++) j[i] = _J2[i];
    }
  }
  return Number.isFinite(j[0] + j[1] + j[2] + j[3] + j[4] + j[5] + j[6]);
}

/**
 * Write the arm into a pose (anim.js P): the sword hand's offset (`rH`, body axes, from the anchor, through
 * the soft reach's inverse), the elbow's way (`rP`), the blade (`swD`), its flat (`swF`) and the girdle's
 * offset (`clR`, chest axes), for the chest the pose's own pelvis and spine angles put it at. `R` = the
 * armChest result. `P` = the pose's channel map.
 */
export function armToPose(p, P, R) {
  chestTurn(p, P); // the chest's turn in the body's axes (the chest joint itself never turns)
  const d = R.W.distanceTo(R.S), k = d > 1e-5 ? unsoft(d) / d : 1;
  _h.subVectors(R.W, R.S).multiplyScalar(k).add(R.S);
  _h.x -= ANCH[0];
  _h.y -= ANCH[1];
  _h.z -= ANCH[2];
  _h.applyQuaternion(_q);
  p[P.rH] = _h.x;
  p[P.rH + 1] = _h.y;
  p[P.rH + 2] = _h.z;
  _c.subVectors(R.E, R.S).applyQuaternion(_q);
  p[P.rP] = _c.x;
  p[P.rP + 1] = _c.y;
  p[P.rP + 2] = _c.z;
  _c.copy(R.B).applyQuaternion(_q);
  p[P.swD] = _c.x;
  p[P.swD + 1] = _c.y;
  p[P.swD + 2] = _c.z;
  _c.copy(R.Y).applyQuaternion(_q);
  p[P.swF] = _c.x;
  p[P.swF + 1] = _c.y;
  p[P.swF + 2] = _c.z;
  p[P.clR] = R.g[0];
  p[P.clR + 1] = R.g[1];
  p[P.clR + 2] = R.g[2];
}
