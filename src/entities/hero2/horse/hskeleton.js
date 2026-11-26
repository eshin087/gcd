// The mount's skeleton: the same kind of plain forward-kinematic rig as the hero's (../skeleton.js), for
// a horse. Flat arrays, local quaternions (x y z w), world = parent * local, no allocations per call.
//
// Axes are the game's: +Z his front, +Y up, +X his LEFT. The REST pose (every local rotation the
// identity): the trunk level, the neck and head straight forward (+Z), the tail straight back (-Z), the
// four legs straight down (-Y), the ears straight up. A POSE is `q` (HJ * 4), `hips` (the PELVIS joint's
// position in the root's frame: the only animated translation besides the root) and `root` ([x, z, yaw]
// of the ground point under him, in the clip's own frame), exactly as the hero's.
//
// The leg joints sit at the joint they name and turn the bone below it: `shoulderFL` turns the humerus
// (shoulder -> elbow), `elbowFL` the forearm, `kneeFL` the cannon, `fetlockFL` the pastern, and `hoofFL`
// (at the hoof's ground point) turns the hoof capsule drawn above it. Hind: `hipHL` the femur, `stifleHL`
// the tibia, `hockHL` the cannon, `fetlockHL` the pastern, `hoofHL` the capsule. F = fore, H = hind,
// L / R = his left / right.
//
// Sockets (never keyed by a clip; they ride their parent): `saddle` (child of spine2) is where the
// RIDER'S HIPS sit (his pelvis joint), its axes the horse's back (+Z forward, +Y up); `stirrupL` / `R`
// (children of the saddle) the treads under the rider's ankles; `rein` (child of the withers) where the
// rider's hands hold the reins; `bit` (child of the head) where the reins meet the mouth.
import { HORSE } from './hdims.js';

export const HJOINTS = [
  'root', //        0
  'pelvis', //      1  the hips; its position is pose.hips
  'spine1', //      2  the loins
  'spine2', //      3  the back under the saddle
  'withers', //     4  between the shoulder blades
  'neck1', //       5  the root of the neck
  'neck2', //       6
  'neck3', //       7
  'head', //        8  the poll
  'jaw', //         9
  'earL', //       10
  'earR', //       11
  'tail1', //      12  the dock
  'tail2', //      13
  'tail3', //      14
  'tail4', //      15
  'shoulderFL', // 16
  'elbowFL', //    17
  'kneeFL', //     18
  'fetlockFL', //  19
  'hoofFL', //     20
  'shoulderFR', // 21
  'elbowFR', //    22
  'kneeFR', //     23
  'fetlockFR', //  24
  'hoofFR', //     25
  'hipHL', //      26
  'stifleHL', //   27
  'hockHL', //     28
  'fetlockHL', //  29
  'hoofHL', //     30
  'hipHR', //      31
  'stifleHR', //   32
  'hockHR', //     33
  'fetlockHR', //  34
  'hoofHR', //     35
  'saddle', //     36  socket: the rider's hips
  'stirrupL', //   37  socket
  'stirrupR', //   38  socket
  'rein', //       39  socket: the rider's hands
  'bit', //        40  socket: the mouth
];
export const HJ = HJOINTS.length;
export const HJI = Object.fromEntries(HJOINTS.map((n, i) => [n, i]));

const PARENT_NAME = {
  pelvis: 'root', spine1: 'pelvis', spine2: 'spine1', withers: 'spine2',
  neck1: 'withers', neck2: 'neck1', neck3: 'neck2', head: 'neck3', jaw: 'head', earL: 'head', earR: 'head', bit: 'head',
  tail1: 'pelvis', tail2: 'tail1', tail3: 'tail2', tail4: 'tail3',
  saddle: 'spine2', stirrupL: 'saddle', stirrupR: 'saddle', rein: 'withers',
};
for (const s of ['L', 'R']) {
  Object.assign(PARENT_NAME, {
    ['shoulderF' + s]: 'withers', ['elbowF' + s]: 'shoulderF' + s, ['kneeF' + s]: 'elbowF' + s, ['fetlockF' + s]: 'kneeF' + s, ['hoofF' + s]: 'fetlockF' + s,
    ['hipH' + s]: 'pelvis', ['stifleH' + s]: 'hipH' + s, ['hockH' + s]: 'stifleH' + s, ['fetlockH' + s]: 'hockH' + s, ['hoofH' + s]: 'fetlockH' + s,
  });
}
export const HPARENT = HJOINTS.map((n) => (n === 'root' ? -1 : HJI[PARENT_NAME[n]]));

/** The four legs: their joints (top to the hoof), the parent the leg hangs from, the bone lengths. */
export const LEGS = ['FL', 'FR', 'HL', 'HR'].map((k) => {
  const fore = k[0] === 'F', s = k[1];
  const names = fore ? ['shoulderF', 'elbowF', 'kneeF', 'fetlockF', 'hoofF'] : ['hipH', 'stifleH', 'hockH', 'fetlockH', 'hoofH'];
  const d = HORSE;
  return {
    key: k, fore, side: s,
    j: names.map((n) => HJI[n + s]),
    parent: fore ? HJI.withers : HJI.pelvis,
    len: fore ? [d.humerus, d.forearm, d.cannonF, d.pasternF] : [d.femur, d.tibia, d.cannonH, d.pasternH],
  };
});
export const LEG = Object.fromEntries(LEGS.map((l) => [l.key, l]));

/** Rest offsets (a joint's position in its parent's frame) from a dimension table. */
export function hRestOffsets(d = HORSE) {
  const o = new Float32Array(HJ * 3);
  const set = (name, v, k = 1) => {
    const i = HJI[name] * 3;
    o[i] = v[0] * k;
    o[i + 1] = v[1];
    o[i + 2] = v[2];
  };
  set('pelvis', [0, d.pelvisY, d.pelvisZ]);
  set('spine1', d.spine1);
  set('spine2', d.spine2);
  set('withers', d.withersJ);
  set('neck1', d.neckBase);
  set('neck2', [0, 0, d.neckSeg]);
  set('neck3', [0, 0, d.neckSeg]);
  set('head', [0, 0, d.neckSeg]);
  set('jaw', d.jaw);
  set('earL', d.ear, 1);
  set('earR', d.ear, -1);
  set('bit', d.bit);
  set('tail1', d.tailRoot);
  for (const t of ['tail2', 'tail3', 'tail4']) set(t, [0, 0, -d.tailSeg]);
  set('saddle', d.saddle);
  set('stirrupL', d.stirrup, 1);
  set('stirrupR', d.stirrup, -1);
  set('rein', d.rein);
  for (const [s, k] of [['L', 1], ['R', -1]]) {
    set('shoulderF' + s, d.shoulder, k);
    set('elbowF' + s, [0, -d.humerus, 0]);
    set('kneeF' + s, [0, -d.forearm, 0]);
    set('fetlockF' + s, [0, -d.cannonF, 0]);
    set('hoofF' + s, [0, -d.pasternF, 0]);
    set('hipH' + s, d.hip, k);
    set('stifleH' + s, [0, -d.femur, 0]);
    set('hockH' + s, [0, -d.tibia, 0]);
    set('fetlockH' + s, [0, -d.cannonH, 0]);
    set('hoofH' + s, [0, -d.pasternH, 0]);
  }
  return o;
}

/** A new pose at rest: identity rotations, the pelvis at its standing height, the root at the origin. */
export function hCreatePose(d = HORSE) {
  const q = new Float32Array(HJ * 4);
  for (let i = 0; i < HJ; i++) q[i * 4 + 3] = 1;
  return { q, hips: new Float32Array([0, d.pelvisY, d.pelvisZ]), root: new Float32Array([0, 0, 0]) };
}

export function hCreateWorld() {
  return { p: new Float32Array(HJ * 3), r: new Float32Array(HJ * 4) };
}

/**
 * Forward kinematics (the hero's solveFK on this skeleton): every joint's position (`out.p`) and rotation
 * (`out.r`) in the frame the root moves in. No allocations.
 */
export function hSolveFK(pose, rest, out) {
  const { q, hips, root } = pose;
  const P = out.p, R = out.r;
  const h = root[2] * 0.5;
  P[0] = root[0]; P[1] = 0; P[2] = root[1];
  R[0] = 0; R[1] = Math.sin(h); R[2] = 0; R[3] = Math.cos(h);
  for (let i = 1; i < HJ; i++) {
    const p = HPARENT[i] * 4, pp = HPARENT[i] * 3, a = i * 4, ap = i * 3;
    const px = R[p], py = R[p + 1], pz = R[p + 2], pw = R[p + 3];
    const ox = i === 1 ? hips[0] : rest[ap], oy = i === 1 ? hips[1] : rest[ap + 1], oz = i === 1 ? hips[2] : rest[ap + 2];
    const tx = 2 * (py * oz - pz * oy), ty = 2 * (pz * ox - px * oz), tz = 2 * (px * oy - py * ox);
    P[ap] = P[pp] + ox + pw * tx + (py * tz - pz * ty);
    P[ap + 1] = P[pp + 1] + oy + pw * ty + (pz * tx - px * tz);
    P[ap + 2] = P[pp + 2] + oz + pw * tz + (px * ty - py * tx);
    const lx = q[a], ly = q[a + 1], lz = q[a + 2], lw = q[a + 3];
    R[a] = pw * lx + px * lw + py * lz - pz * ly;
    R[a + 1] = pw * ly - px * lz + py * lw + pz * lx;
    R[a + 2] = pw * lz + px * ly - py * lx + pz * lw;
    R[a + 3] = pw * lw - px * lx - py * ly - pz * lz;
  }
  return out;
}
