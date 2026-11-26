import * as THREE from 'three';
import { JI, createPose, createWorld, restOffsets, solveFK } from './skeleton.js';
import { HDIM } from './dims.js';

// Hand-set test poses for the body stand (bodyDev.js), written as TARGETS (where the hips, hands and
// feet go, where the elbows and knees point) and solved into the skeleton's local rotations: the
// trunk from rotations, each arm and leg by two-bone IK with its hinge kept a hinge (the elbow and
// the knee bend about one axis of their bone, as in skeleton.js's T-pose). Build-time only: the
// stand solves a pose once when it is picked. Not clip data: the clips come from the footage.
//
// A spec (all points in metres; frames: 'root' (default; his facing +Z, +X his left), or 'hips' /
// 'chest': the point is in that joint's posed frame, from that joint):
//   hips: [x, y, z]                         the pelvis joint
//   rot: { hips, spine, chest, neck, head, clavL, clavR: [x, y, z] degrees (local, order YXZ) }
//   worldQ: { hips, spine, chest, neck, head: [x, y, z, w] }   or WORLD rotations (the root's frame)
//   legL / legR: { ankle: [x, y, z], knee: [x, y, z] (a point the knee points toward), foot: [x, y, z]
//                 degrees (world, YXZ) or footQ: [x, y, z, w], toe: degrees (the ball of the foot), frame }
//   armL / armR: { grip: [x, y, z], blade: [x, y, z], flat: [x, y, z] (the socket's +Z / +Y: a held
//                 sword) | wrist: [x, y, z], hand: [x, y, z] degrees or handQ (world); elbow: [x, y, z]
//                 (a point the elbow points toward), frame }
//   props / hands: what the stand sets (body.setProp / setHand)

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const D2R = Math.PI / 180;
const eul = (a) => new THREE.Quaternion().setFromEuler(new THREE.Euler(a[0] * D2R, a[1] * D2R, a[2] * D2R, 'YXZ'));

/** The rotation taking local axes (la, lb) to world directions (wa, wb) (b only as far as it is off a). */
export function frameFrom(la, wa, lb, wb) {
  const basis = (a, b) => {
    const e1 = a.clone().normalize();
    const e2 = b.clone().addScaledVector(e1, -b.dot(e1));
    if (e2.lengthSq() < 1e-10) e2.set(e1.y, -e1.x, 0).lengthSq() < 1e-10 && e2.set(0, e1.z, -e1.y);
    e2.normalize();
    const e3 = new THREE.Vector3().crossVectors(e1, e2);
    return new THREE.Matrix4().makeBasis(e1, e2, e3);
  };
  const L = basis(la, lb), W = basis(wa, wb);
  return new THREE.Quaternion().setFromRotationMatrix(W.multiply(L.transpose()));
}

/** Two-bone IK: the middle joint for root R, target T, lengths a, b, bending toward point `pole`. */
export function ik(R, T, a, b, pole) {
  const RT = T.clone().sub(R);
  const d = RT.length();
  const u = d > 1e-6 ? RT.clone().divideScalar(d) : new THREE.Vector3(0, -1, 0);
  const dc = Math.min(Math.max(d, Math.abs(a - b) + 1e-3), (a + b) * 0.9995);
  const v = pole.clone().sub(R);
  v.addScaledVector(u, -v.dot(u));
  if (v.lengthSq() < 1e-10) v.set(0, 0, 1).addScaledVector(u, -u.z);
  v.normalize();
  const cosA = Math.min(1, Math.max(-1, (a * a + dc * dc - b * b) / (2 * a * dc)));
  return R.clone().addScaledVector(u, a * cosA).addScaledVector(v, a * Math.sqrt(1 - cosA * cosA));
}

/** Solve a spec into a pose ({ q, hips, root }). */
export function authorPose(spec = {}, d = HDIM) {
  const rest = restOffsets(d), pose = createPose(d), world = createWorld();
  const fk = () => solveFK(pose, rest, world);
  const wq = (i) => new THREE.Quaternion(world.r[i * 4], world.r[i * 4 + 1], world.r[i * 4 + 2], world.r[i * 4 + 3]);
  const wp = (i) => new THREE.Vector3(world.p[i * 3], world.p[i * 3 + 1], world.p[i * 3 + 2]);
  const setLocal = (i, q) => {
    q.normalize();
    pose.q.set([q.x, q.y, q.z, q.w], i * 4);
  };
  const setWorld = (i, parent, q) => setLocal(i, wq(parent).invert().multiply(q));
  if (spec.hips) pose.hips.set(spec.hips);
  // the trunk, root to head (each from its parent's posed frame)
  const chain = [['hips', 0], ['spine', JI.hips], ['chest', JI.spine], ['neck', JI.chest], ['head', JI.neck], ['clavL', JI.chest], ['clavR', JI.chest]];
  for (const [name, par] of chain) {
    fk();
    const i = JI[name];
    if (spec.worldQ?.[name]) setWorld(i, par, new THREE.Quaternion(...spec.worldQ[name]));
    else if (spec.rot?.[name]) setLocal(i, eul(spec.rot[name]));
  }
  fk();
  const inFrame = (pt, frame) => {
    if (!frame || frame === 'root') return V(pt);
    const i = JI[frame];
    return V(pt).applyQuaternion(wq(i)).add(wp(i));
  };
  const dirFrame = (dv, frame) => (!frame || frame === 'root' ? V(dv) : V(dv).applyQuaternion(wq(JI[frame])));
  const qFrame = (q, frame) => (!frame || frame === 'root' ? q : wq(JI[frame]).multiply(q));
  // the legs: thigh and shin hinge about their +X (the knee folds the shin back, -Z)
  for (const S of ['L', 'R']) {
    const L = spec['leg' + S];
    if (!L) continue;
    fk();
    const th = JI['thigh' + S], sh = JI['shin' + S], ft = JI['foot' + S], to = JI['toe' + S];
    const H = wp(th), A = inFrame(L.ankle, L.frame);
    const pole = L.knee ? inFrame(L.knee, L.frame) : H.clone().add(dirFrame([0, -0.2, 1], 'hips'));
    const K = ik(H, A, d.thigh, d.shin, pole);
    const d1 = K.clone().sub(H).normalize(), d2 = A.clone().sub(K).normalize();
    let hinge = new THREE.Vector3().crossVectors(d1, d2);
    if (hinge.lengthSq() < 1e-8) hinge = new THREE.Vector3().crossVectors(pole.clone().sub(H), d1).normalize();
    hinge.normalize();
    const nY = new THREE.Vector3(0, -1, 0), pX = new THREE.Vector3(1, 0, 0);
    setWorld(th, JI.hips, frameFrom(nY, d1, pX, hinge));
    fk();
    setWorld(sh, th, frameFrom(nY, d2, pX, hinge));
    fk();
    const fq = L.footQ ? new THREE.Quaternion(...L.footQ) : L.foot ? qFrame(eul(L.foot), L.frame) : new THREE.Quaternion();
    setWorld(ft, sh, fq);
    if (L.toe) setLocal(to, eul([L.toe, 0, 0]));
  }
  // the arms: upper arm and forearm hinge about their (0, -s, 0) (the elbow folds the forearm toward +Z)
  for (const S of ['L', 'R']) {
    const A = spec['arm' + S];
    if (!A) continue;
    fk();
    const s = S === 'L' ? 1 : -1;
    const ua = JI['upperArm' + S], fa = JI['foreArm' + S], hd = JI['hand' + S];
    let Rh = null, W;
    if (A.grip) {
      Rh = frameFrom(new THREE.Vector3(0, 0, 1), dirFrame(A.blade, A.frame), new THREE.Vector3(0, 1, 0), dirFrame(A.flat ?? [0, 1, 0], A.frame));
      W = inFrame(A.grip, A.frame).sub(new THREE.Vector3(s * d.palm, 0, 0).applyQuaternion(Rh));
    } else {
      W = inFrame(A.wrist, A.frame);
      if (A.handQ) Rh = new THREE.Quaternion(...A.handQ);
      else if (A.hand) Rh = qFrame(eul(A.hand), A.frame);
    }
    const Sh = wp(ua);
    const pole = A.elbow ? inFrame(A.elbow, A.frame) : Sh.clone().add(dirFrame([s * 0.3, -0.5, -0.6], 'chest'));
    const E = ik(Sh, W, d.upperArm, d.foreArm, pole);
    const d1 = E.clone().sub(Sh).normalize(), d2 = W.clone().sub(E).normalize();
    let hinge = new THREE.Vector3().crossVectors(d1, d2);
    if (hinge.lengthSq() < 1e-8) hinge = new THREE.Vector3().crossVectors(d1, pole.clone().sub(Sh)).normalize();
    hinge.normalize();
    const bone = new THREE.Vector3(s, 0, 0), hAx = new THREE.Vector3(0, -s, 0);
    setWorld(ua, JI['clav' + S], frameFrom(bone, d1, hAx, hinge));
    fk();
    setWorld(fa, ua, frameFrom(bone, d2, hAx, hinge));
    fk();
    if (Rh) setWorld(hd, fa, Rh);
  }
  fk();
  return pose;
}

// ---------------------------------------------------------------- the stand's poses
// `stand`: today's hero in his idle at ease, read off his rig (player/anim.js, ?level= default, the
// fidget held off): the same joints in the same places, so the two stand the same for the parity
// sheets. The rest are set by hand to find where the body breaks.
const IDLE = {
  hips: [-0.022, 0.925, -0.012],
  worldQ: {
    hips: [0.003, -0.12, -0.029, 0.992],
    spine: [-0.006, -0.095, -0.015, 0.995],
    chest: [-0.014, -0.069, -0.001, 0.998],
    neck: [-0.007, -0.032, -0.01, 0.999],
    head: [0, 0.005, -0.019, 1],
  },
  legR: { ankle: [-0.137, 0.07, -0.087], knee: [-0.188, 0.465, 0.048], footQ: [0.009, -0.282, 0.001, 0.959] },
  legL: { ankle: [0.145, 0.07, 0.136], knee: [0.135, 0.485, 0.197], footQ: [0.004, 0.111, 0.001, 0.994] },
  // the sword hand: the grip, the blade along the socket's +Z, its flats along +Y (today's sword joint)
  armR: { grip: [-0.351, 0.938, -0.008], blade: [-0.512, -0.791, 0.335], flat: [0.61, -0.06, 0.79], elbow: [-0.21, 1.14, -0.119] },
  // the free hand: today's wrist joint and its rotation (its hanging frame turned to the T-pose's)
  armL: { wrist: [0.197, 0.941, 0.013], elbow: [0.219, 1.154, -0.096], handQ: null },
};
{
  // today's wrist rotation (hanging frame) x Rz(-pi/2): the same hand in the T-pose's frame
  const q = new THREE.Quaternion(-0.147, -0.025, -0.049, 0.988).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2));
  IDLE.armL.handQ = [q.x, q.y, q.z, q.w];
}

export const POSES = {
  T: { spec: null, props: { R: 'sword', L: null } },
  stand: { spec: IDLE, props: { R: 'sword', L: null } },
  guard: {
    spec: {
      hips: [0, 0.86, -0.02], rot: { hips: [0, -20, 0], spine: [6, 8, 0], chest: [4, 6, 0], head: [0, 6, 0] },
      legL: { ankle: [0.16, 0.07, 0.3], knee: [0.2, 0.5, 0.55], foot: [0, 0, 0] },
      legR: { ankle: [-0.2, 0.07, -0.3], knee: [-0.3, 0.5, 0.0], foot: [0, -35, 0] },
      armR: { grip: [-0.08, 1.12, 0.34], blade: [0.25, 0.75, 0.6], flat: [0.95, -0.2, -0.2], elbow: [-0.4, 0.95, 0.0] },
      armL: { wrist: [0.17, 1.12, 0.3], hand: [0, 0, 80], elbow: [0.45, 0.95, 0.0] },
    },
    props: { R: 'sword', L: null },
  },
  lunge: {
    spec: {
      hips: [0, 0.6, 0.05], rot: { hips: [8, -10, 0], spine: [10, 4, 0], chest: [8, 4, 0], head: [-14, 0, 0] },
      legL: { ankle: [0.16, 0.07, 0.62], knee: [0.18, 0.5, 0.75], foot: [0, 5, 0] },
      legR: { ankle: [-0.17, 0.08, -0.62], knee: [-0.17, 0.3, -0.05], foot: [-10, -30, 0], toe: 35 },
      armR: { grip: [-0.12, 1.02, 0.78], blade: [0.04, 0.04, 1], flat: [0, 1, 0], elbow: [-0.45, 1.1, 0.2] },
      armL: { wrist: [0.4, 0.95, -0.45], hand: [0, 0, 70], elbow: [0.4, 1.3, -0.1] },
    },
    props: { R: 'sword', L: null },
  },
  crouch: {
    spec: {
      hips: [0, 0.4, -0.06], rot: { hips: [10, 0, 0], spine: [18, 0, 0], chest: [16, 0, 0], neck: [-12, 0, 0], head: [-16, 0, 0] },
      legL: { ankle: [0.19, 0.12, 0.08], knee: [0.3, 0.6, 0.45], foot: [-30, 12, 0], toe: 30 },
      legR: { ankle: [-0.19, 0.12, 0.08], knee: [-0.3, 0.6, 0.45], foot: [-30, -12, 0], toe: 30 },
      armR: { grip: [-0.3, 0.42, 0.42], blade: [-0.25, -0.05, 1], flat: [0, 1, 0], elbow: [-0.5, 0.7, 0.1] },
      armL: { wrist: [0.14, 0.2, 0.36], hand: [0, 0, 80], elbow: [0.4, 0.6, 0.2] },
    },
    props: { R: 'sword', L: null },
  },
  roll: {
    spec: {
      hips: [0, 0.42, 0], rot: { hips: [115, 0, 0], spine: [32, 0, 0], chest: [30, 0, 0], neck: [26, 0, 0], head: [22, 0, 0] },
      legL: { frame: 'hips', ankle: [0.11, -0.12, 0.2], knee: [0.12, 0.08, 0.6], foot: [-60, 0, 0] },
      legR: { frame: 'hips', ankle: [-0.11, -0.12, 0.2], knee: [-0.12, 0.08, 0.6], foot: [-60, 0, 0] },
      armR: { frame: 'chest', grip: [-0.16, -0.25, 0.32], blade: [-0.1, -1, -0.15], flat: [1, 0, 0], elbow: [-0.4, 0.0, 0.0] },
      armL: { frame: 'chest', wrist: [0.13, -0.3, 0.33], hand: [0, 0, 90], elbow: [0.4, 0.0, 0.0] },
    },
    props: { R: 'sword', L: null },
  },
  overhead: {
    spec: {
      hips: [0, 0.96, 0], rot: { clavL: [0, 0, 22], clavR: [0, 0, -22], head: [-12, 0, 0] },
      legL: { ankle: [0.13, 0.07, 0.02], knee: [0.15, 0.5, 0.4] },
      legR: { ankle: [-0.13, 0.07, 0.02], knee: [-0.15, 0.5, 0.4] },
      armR: { grip: [-0.12, 2.08, 0.1], blade: [0.1, 1, 0.12], flat: [1, 0, 0], elbow: [-0.6, 1.7, -0.1] },
      armL: { wrist: [0.12, 2.04, 0.08], hand: [0, 0, -90], elbow: [0.6, 1.7, -0.1] },
    },
    props: { R: 'sword', L: null },
  },
  twoHand: {
    spec: {
      hips: [0, 0.9, 0], rot: { hips: [0, -10, 0], spine: [4, 4, 0], chest: [4, 4, 0] },
      legL: { ankle: [0.14, 0.07, 0.22], knee: [0.18, 0.5, 0.5] },
      legR: { ankle: [-0.16, 0.07, -0.22], knee: [-0.22, 0.5, 0.1], foot: [0, -25, 0] },
      armR: { grip: [0.0, 1.06, 0.4], blade: [0, 0.55, 0.84], flat: [1, 0, 0], elbow: [-0.5, 0.8, 0.1] },
      armL: { grip: [0.0, 1.06 - 0.55 * 0.09, 0.4 - 0.84 * 0.09], blade: [0, 0.55, 0.84], flat: [1, 0, 0], elbow: [0.5, 0.8, 0.1] },
    },
    props: { R: 'sword', L: null }, hands: { L: 'fist' },
  },
  ride: {
    spec: {
      hips: [0, 1.0, -0.05], rot: { hips: [-6, 0, 0], spine: [8, 0, 0], chest: [4, 0, 0] },
      legL: { ankle: [0.3, 0.5, 0.12], knee: [0.3, 0.75, 0.4], foot: [-5, 15, 0] },
      legR: { ankle: [-0.3, 0.5, 0.12], knee: [-0.3, 0.75, 0.4], foot: [-5, -15, 0] },
      armR: { grip: [-0.12, 1.2, 0.36], blade: [-0.2, 0.7, 0.68], flat: [1, 0, 0], elbow: [-0.45, 1.0, 0.0] },
      armL: { wrist: [0.1, 1.18, 0.38], hand: [0, 0, 80], elbow: [0.45, 1.0, 0.0] },
    },
    props: { R: 'sword', L: null },
  },
  run: {
    spec: {
      hips: [0, 0.93, 0], rot: { hips: [6, 12, 0], spine: [6, -6, 0], chest: [6, -10, 0], head: [-8, 6, 0] },
      legL: { ankle: [0.1, 0.1, 0.36], knee: [0.12, 0.52, 0.32], foot: [12, 0, 0] },
      legR: { ankle: [-0.12, 0.42, -0.42], knee: [-0.12, 0.52, 0.05], foot: [40, 0, 0], toe: 10 },
      armR: { grip: [-0.22, 1.02, 0.32], blade: [-0.1, -0.35, -0.94], flat: [1, 0, 0], elbow: [-0.3, 1.1, -0.2] },
      armL: { wrist: [0.22, 1.0, -0.32], hand: [0, 0, 80], elbow: [0.3, 1.2, -0.4] },
    },
    props: { R: 'sword', L: null },
  },
  paired: {
    spec: {
      hips: [0, 0.9, 0], rot: { spine: [4, 0, 0] },
      legL: { ankle: [0.2, 0.07, 0.12], knee: [0.26, 0.5, 0.4] },
      legR: { ankle: [-0.2, 0.07, -0.12], knee: [-0.26, 0.5, 0.25] },
      armR: { grip: [-0.42, 0.98, 0.18], blade: [-0.4, -0.5, 0.75], flat: [0.7, 0, 0.4], elbow: [-0.4, 1.2, -0.25] },
      armL: { grip: [0.42, 0.98, 0.18], blade: [0.4, -0.5, 0.75], flat: [-0.7, 0, 0.4], elbow: [0.4, 1.2, -0.25] },
    },
    props: { R: 'sword', L: 'sword' },
  },
};
