// The remade hero's skeleton (the experiment behind `?hero=new`): a plain forward-kinematic rig that
// plays recorded clips. This file is the CONTRACT between the clip engine, the body, the clip builder
// (scripts/mocap) and every clip file; change it only together with all four.
//
// Axes are the game's: +Z is his front, +Y up, +X his LEFT. Metres, radians. The REST pose is a
// T-pose: every local rotation is the identity, the legs hang straight down (-Y), the arms point
// straight out (left arm along +X, right arm along -X), the feet point forward (+Z).
//
// A POSE is: one local quaternion per joint (`q`, x y z w, J * 4 floats), the hips' position in the
// root's frame (`hips`, the only animated translation besides the root), and the ROOT: the point on
// the ground under him, `root` = [x, z, yaw] in the clip's own frame (root motion; the game decides
// whether to use it or to move him itself).
//
// The two WEAPON joints are sockets in the hands. A held blade runs along the socket's +Z and its
// flats face the socket's +-Y; the socket's origin is the grip's centre. In the rest pose a socket has
// the hand's axes, so the blade would point forward out of a T-posed fist.

import { HDIM } from './dims.js';

/** Joint names in index order; a joint's parent always comes before it. */
export const JOINTS = [
  'root', //      0  on the ground under him; carries the root motion (never keyed in `q`: use `root`)
  'hips', //      1  the pelvis; its position is `pose.hips`
  'spine', //     2  the waist / lumbar bend
  'chest', //     3  the ribcage (shoulders hang off it)
  'neck', //      4
  'head', //      5
  'clavL', //     6
  'upperArmL', // 7  the shoulder joint
  'foreArmL', //  8  the elbow
  'handL', //     9  the wrist
  'clavR', //    10
  'upperArmR', // 11
  'foreArmR', //  12
  'handR', //    13
  'thighL', //   14  the hip joint
  'shinL', //    15  the knee
  'footL', //    16  the ankle
  'toeL', //     17  the ball of the foot
  'thighR', //   18
  'shinR', //    19
  'footR', //    20
  'toeR', //     21
  'weaponR', //  22  socket in the right hand (the sword hand)
  'weaponL', //  23  socket in the left hand (a second sword, a flask, the off hand's prop)
];
export const J = JOINTS.length;
/** name -> index */
export const JI = Object.fromEntries(JOINTS.map((n, i) => [n, i]));

const PARENT_NAME = {
  hips: 'root', spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  clavL: 'chest', upperArmL: 'clavL', foreArmL: 'upperArmL', handL: 'foreArmL',
  clavR: 'chest', upperArmR: 'clavR', foreArmR: 'upperArmR', handR: 'foreArmR',
  thighL: 'hips', shinL: 'thighL', footL: 'shinL', toeL: 'footL',
  thighR: 'hips', shinR: 'thighR', footR: 'shinR', toeR: 'footR',
  weaponR: 'handR', weaponL: 'handL',
};
/** parent index per joint (-1 for the root) */
export const PARENT = JOINTS.map((n) => (n === 'root' ? -1 : JI[PARENT_NAME[n]]));

/** Rest offsets (a joint's position in its parent's frame, T-pose) from a dimension table. */
export function restOffsets(d = HDIM) {
  const o = new Float32Array(J * 3);
  const set = (name, x, y, z) => { const i = JI[name] * 3; o[i] = x; o[i + 1] = y; o[i + 2] = z; };
  set('hips', 0, d.hipsY, 0);
  set('spine', 0, d.spine, 0);
  set('chest', 0, d.chest, 0);
  set('neck', 0, d.neck, 0);
  set('head', 0, d.head, 0);
  for (const [s, k] of [['L', 1], ['R', -1]]) {
    set('clav' + s, k * d.clavIn, d.clavUp, 0);
    set('upperArm' + s, k * d.clav, 0, 0);
    set('foreArm' + s, k * d.upperArm, 0, 0);
    set('hand' + s, k * d.foreArm, 0, 0);
    set('weapon' + s, k * d.palm, 0, 0);
    set('thigh' + s, k * d.hipHalf, -d.hipDrop, 0);
    set('shin' + s, 0, -d.thigh, 0);
    set('foot' + s, 0, -d.shin, 0);
    set('toe' + s, 0, -d.ankle, d.foot);
  }
  return o;
}

/** A new pose at rest: identity rotations, the hips at their standing height, the root at the origin. */
export function createPose(d = HDIM) {
  const q = new Float32Array(J * 4);
  for (let i = 0; i < J; i++) q[i * 4 + 3] = 1;
  return { q, hips: new Float32Array([0, d.hipsY, 0]), root: new Float32Array([0, 0, 0]) };
}

/**
 * Forward kinematics. Writes every joint's position (`out.p`, J * 3) and rotation (`out.r`, J * 4) in
 * the frame the root moves in (so the root's own x / z / yaw are applied). No allocations.
 */
export function solveFK(pose, rest, out) {
  const { q, hips, root } = pose;
  const P = out.p, R = out.r;
  // the root: a yaw about +Y at (x, 0, z)
  const h = root[2] * 0.5;
  P[0] = root[0]; P[1] = 0; P[2] = root[1];
  R[0] = 0; R[1] = Math.sin(h); R[2] = 0; R[3] = Math.cos(h);
  for (let i = 1; i < J; i++) {
    const p = PARENT[i] * 4, pp = PARENT[i] * 3, a = i * 4, ap = i * 3;
    const px = R[p], py = R[p + 1], pz = R[p + 2], pw = R[p + 3];
    // the local offset (the hips' is animated)
    const ox = i === 1 ? hips[0] : rest[ap], oy = i === 1 ? hips[1] : rest[ap + 1], oz = i === 1 ? hips[2] : rest[ap + 2];
    // rotate the offset by the parent's rotation: v + 2 w (u x v) + 2 u x (u x v)
    const tx = 2 * (py * oz - pz * oy), ty = 2 * (pz * ox - px * oz), tz = 2 * (px * oy - py * ox);
    P[ap] = P[pp] + ox + pw * tx + (py * tz - pz * ty);
    P[ap + 1] = P[pp + 1] + oy + pw * ty + (pz * tx - px * tz);
    P[ap + 2] = P[pp + 2] + oz + pw * tz + (px * ty - py * tx);
    // world rotation = parent * local
    const lx = q[a], ly = q[a + 1], lz = q[a + 2], lw = q[a + 3];
    R[a] = pw * lx + px * lw + py * lz - pz * ly;
    R[a + 1] = pw * ly - px * lz + py * lw + pz * lx;
    R[a + 2] = pw * lz + px * ly - py * lx + pz * lw;
    R[a + 3] = pw * lw - px * lx - py * ly - pz * lz;
  }
  return out;
}

/** Storage for solveFK. */
export function createWorld() {
  return { p: new Float32Array(J * 3), r: new Float32Array(J * 4) };
}
