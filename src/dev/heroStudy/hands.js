// Tempered's instance-only arm finish. Keep grip positions / blade paths in the
// existing IK, while giving the elbows and free wrist a comfortable way to follow.
import * as THREE from 'three';
import { P } from '../../entities/player/anim.js';
import { DIM } from '../../entities/player/heroDims.js';
import { clamp, smoothstep } from '../../core/math.js';

const deg = Math.PI / 180;
const freeClips = new Set(['loco', 'attack', 'block', 'charge']);

export function installTemperedHands(anim, enabled = () => true) {
  const arm = anim._arm, wrist = anim._wristL;
  const bodyQ = new THREE.Quaternion(), chestQ = new THREE.Quaternion();
  const toChest = new THREE.Quaternion(), foreQ = new THREE.Quaternion(), turnQ = new THREE.Quaternion();
  const axis = new THREE.Vector3(), blade = new THREE.Vector3(), pole = new THREE.Vector3();
  const goal = new THREE.Vector3(), cross = new THREE.Vector3(), fore = new THREE.Vector3();
  const fingers = new THREE.Vector3(), palm = new THREE.Vector3(), neutral = new THREE.Vector3();
  const xx = new THREE.Vector3(), yy = new THREE.Vector3(), zz = new THREE.Vector3();
  const matrix = new THREE.Matrix4(), euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const saved = new Float32Array(6);
  const frames = (r) => {
    r.body.getWorldQuaternion(bodyQ); r.chest.getWorldQuaternion(chestQ);
    toChest.copy(chestQ).invert().multiply(bodyQ);
  };

  anim._arm = function (joint, target, pose, pi, sword, lock = 0) {
    if (!enabled() || !sword || !freeClips.has(this.key)) return arm.call(this, joint, target, pose, pi, sword, lock);
    frames(this.rig);
    blade.set(pose[P.swD], pose[P.swD + 1], pose[P.swD + 2]).applyQuaternion(toChest).normalize();
    axis.subVectors(target, joint.upper.position);
    const reach = axis.length();
    if (reach < 0.05 || blade.lengthSq() < 0.5) return arm.call(this, joint, target, pose, pi, sword, lock);
    axis.multiplyScalar(1 / reach);
    pole.set(pose[pi], pose[pi + 1], pose[pi + 2]).applyQuaternion(toChest);
    pole.addScaledVector(axis, -pole.dot(axis));
    goal.copy(blade).multiplyScalar(-1).addScaledVector(axis, blade.dot(axis));
    if (pole.lengthSq() < 1e-6 || goal.lengthSq() < 1e-6) return arm.call(this, joint, target, pose, pi, sword, lock);
    pole.normalize(); goal.normalize();
    // Predict the forearm on this elbow circle. Only guide a wrist that would
    // otherwise fold hard; the original hand target and the IK reach stay intact.
    const d = Math.min(reach, (DIM.upperArm + DIM.foreArm) * 0.99);
    const along = (d * d + DIM.upperArm ** 2 - DIM.foreArm ** 2) / (2 * d);
    const height = Math.sqrt(Math.max(0, DIM.upperArm ** 2 - along * along));
    fore.copy(axis).multiplyScalar(d - along).addScaledVector(pole, -height).normalize();
    const angle = Math.acos(clamp(fore.dot(blade), -1, 1));
    const limit = (this.key === 'attack' || pose[P.twoHand] > 0.1 ? 75 : 38) * deg;
    const weight = 0.8 * smoothstep(limit, limit + 50 * deg, angle);
    if (weight < 1e-4) return arm.call(this, joint, target, pose, pi, sword, lock);
    cross.crossVectors(pole, goal);
    const turn = Math.atan2(axis.dot(cross), clamp(pole.dot(goal), -1, 1));
    pole.applyAxisAngle(axis, turn * weight).applyQuaternion(turnQ.copy(toChest).invert());
    const x = pose[pi], y = pose[pi + 1], z = pose[pi + 2];
    pose[pi] = pole.x; pose[pi + 1] = pole.y; pose[pi + 2] = pole.z;
    try { return arm.call(this, joint, target, pose, pi, sword, lock); }
    finally { pose[pi] = x; pose[pi + 1] = y; pose[pi + 2] = z; }
  };

  anim._wristL = function (rig, pose, two, linked) {
    // Braced palms, falls, and a hand meeting the grip keep their contact solver.
    if (!enabled() || !freeClips.has(this.key) || two > 0.05 || linked > 0.05) return wrist.call(this, rig, pose, two, linked);
    frames(rig);
    foreQ.copy(rig.arms.L.upper.quaternion).multiply(rig.arms.L.fore.quaternion);
    turnQ.copy(foreQ).invert().multiply(toChest); // body axes → forearm local
    fingers.set(pose[P.lD], pose[P.lD + 1], pose[P.lD + 2]);
    palm.set(pose[P.lN], pose[P.lN + 1], pose[P.lN + 2]);
    const fd = smoothstep(0, 0.6, fingers.length()), pn = smoothstep(0, 0.6, palm.length());
    fingers.applyQuaternion(turnQ).normalize().multiplyScalar(fd); fingers.y -= 1 - fd;
    if (fingers.lengthSq() < 1e-6) fingers.set(0, -1, 0);
    fingers.normalize();
    turnQ.setFromUnitVectors(yy.set(0, -1, 0), fingers);
    neutral.set(-1, 0, 0).applyQuaternion(turnQ);
    turnQ.copy(foreQ).invert().multiply(toChest);
    palm.applyQuaternion(turnQ).addScaledVector(fingers, -palm.dot(fingers));
    if (palm.lengthSq() < 1e-6) palm.copy(neutral);
    else palm.normalize().lerp(neutral, 1 - pn).normalize();
    xx.copy(palm).multiplyScalar(-1); yy.copy(fingers).multiplyScalar(-1);
    zz.crossVectors(xx, yy);
    if (zz.lengthSq() < 1e-6) return wrist.call(this, rig, pose, two, linked);
    zz.normalize(); xx.crossVectors(yy, zz).normalize();
    matrix.makeBasis(xx, yy, zz); euler.setFromRotationMatrix(matrix, 'YXZ');
    euler.x = clamp(euler.x, -14 * deg, 18 * deg);
    euler.y = clamp(Math.abs(euler.y) > 150 * deg ? this.wristL.ty : euler.y, -55 * deg, 55 * deg);
    euler.z = clamp(euler.z, -32 * deg, 34 * deg);
    // Feed the comfortable target back through the original spring. The hand
    // settles after the arm rather than snapping to an imposed final quaternion.
    turnQ.copy(toChest).invert().multiply(foreQ).multiply(bodyQ.setFromEuler(euler));
    fingers.set(0, -0.6, 0).applyQuaternion(turnQ);
    palm.set(-0.6, 0, 0).applyQuaternion(turnQ);
    for (let i = 0; i < 3; i++) { saved[i] = pose[P.lD + i]; saved[3 + i] = pose[P.lN + i]; }
    pose[P.lD] = fingers.x; pose[P.lD + 1] = fingers.y; pose[P.lD + 2] = fingers.z;
    pose[P.lN] = palm.x; pose[P.lN + 1] = palm.y; pose[P.lN + 2] = palm.z;
    try { return wrist.call(this, rig, pose, two, linked); }
    finally { for (let i = 0; i < 3; i++) { pose[P.lD + i] = saved[i]; pose[P.lN + i] = saved[3 + i]; } }
  };
}
