// A free arm belongs to the turning chest, not to a fixed point beside the belt.
// Continuous tangents carry the hand through gather, counterbalance and release.
import * as THREE from 'three';
import { P } from '../../entities/player/anim.js';
import { clamp, smoothstep } from '../../core/math.js';

const REST = [0.075, -0.45, 0.065];
const hermite = (a, b, va, vb, h, u) => {
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * a + (u3 - 2 * u2 + u) * h * va
    + (-2 * u3 + 3 * u2) * b + (u3 - u2) * h * vb;
};

export function createFreeArm() {
  const q = new THREE.Quaternion(), spine = new THREE.Quaternion();
  const follow = new THREE.Quaternion();
  let serial = -1;
  const e = new THREE.Euler(0, 0, 0, 'YXZ'), hand = new THREE.Vector3(), pole = new THREE.Vector3();
  const times = new Float64Array(5), values = new Float64Array(5), tangent = new Float64Array(5);
  return (p, A, keys) => {
    const d = A.def, W = d.windup, end = W + d.active, E = A.temperedEntry;
    times[0] = 0; times[1] = W * 0.78; times[2] = W + d.active * 0.95;
    times[3] = end + d.recovery * 0.48; times[4] = end + d.recovery;
    q.setFromEuler(e.set(p[P.pelvX], p[P.pelvY], p[P.pelvZ]));
    q.multiply(spine.setFromEuler(e.set(p[P.spX], p[P.spY], p[P.spZ])));
    if (serial !== E.serial) { follow.copy(E.chest); serial = E.serial; }
    // The loose arm trails a fast chest reversal instead of turning as one
    // rigid piece with it. Exponential follow is stable at different frame rates;
    // zero-time contact refreshes must not advance it.
    follow.slerp(q, 1 - Math.exp(-Math.max(0, A.frameDt) / 0.07));
    let segment = 0;
    while (segment < 3 && A.t > times[segment + 1]) segment++;
    const h = times[segment + 1] - times[segment];
    const u = clamp((A.t - times[segment]) / h, 0, 1);
    for (let c = 0; c < 3; c++) {
      values[0] = E?.handLocal?.[c] ?? A.from[P.lH + c];
      values[1] = keys[0][c]; values[2] = keys[1][c];
      values[3] = keys[1][c] * 0.65 + REST[c] * 0.35; values[4] = REST[c];
      tangent[0] = clamp(E?.handLocalVelocity?.[c] ?? 0, -3, 3); tangent[4] = 0;
      for (let i = 1; i < 4; i++) tangent[i] = (values[i + 1] - values[i - 1]) / (times[i + 1] - times[i - 1]);
      hand.setComponent(c, hermite(values[segment], values[segment + 1], tangent[segment], tangent[segment + 1], h, u));
    }
    // A soft, dropped elbow follows the hand's height; it turns with the torso.
    const lift = smoothstep(-0.44, -0.18, hand.y);
    pole.set(0.36 + 0.18 * lift, -0.25 - 0.48 * lift, -0.9 + 0.42 * lift).applyQuaternion(follow);
    hand.applyQuaternion(follow).toArray(p, P.lH);
    const settle = smoothstep(0, W * 0.75, A.t);
    for (let c = 0; c < 3; c++) p[P.lP + c] = A.from[P.lP + c] + (pole.getComponent(c) - A.from[P.lP + c]) * settle;
  };
}
