// A disposable visual study. Imported only by the two preview entries, never by the normal game.
// Reuse Claude's rig, IK, foot planner and cloth. Each actor owns its pose functions;
// shared DIM, BODY, SWINGS, materials and combat definitions are never edited.
import * as THREE from 'three';
import { buildHero } from '../../entities/player/model.js';
import { HeroAnimator, P, N } from '../../entities/player/anim.js';
import { clamp, smoothstep } from '../../core/math.js';
import { installTemperedHands } from './hands.js';

export const STUDY = Object.freeze({
  scale: Object.freeze([1.08, 0.94, 1.04]),
  stanceSink: 0.035,
  stanceWidth: 0.035,
  guardAzimuth: -28,
  guardElevation: 22,
  runSink: 0.026,
  recoveryHold: 0.11,
});

// Different cuts get different accents. The heavy downstroke settles; the rising
// cut opens the chest. No extra spin is added to a spin or a thrust.
const ACCENTS = {
  fallingCut: [0.14, 0.065, 0.032], drawCut: [0.12, 0.035, 0.025],
  risingSlash: [0.10, -0.025, 0.012], risingBackhand: [0.12, -0.02, 0.018],
  flatBackhand: [0.14, 0.02, 0.025], fallingBackhand: [0.12, 0.07, 0.032],
  whirl: [0.04, 0.02, 0.02], risingWhirl: [0.04, 0, 0.012],
  slam: [0.06, 0.07, 0.035], cleave: [0.08, 0.06, 0.025],
};
const set = (p, i, x, y, z, w) => {
  p[i] += (x - p[i]) * w;
  p[i + 1] += (y - p[i + 1]) * w;
  p[i + 2] += (z - p[i + 2]) * w;
};

function locomotion(p, A) {
  const move = clamp(A.moveW, 0, 1), still = 1 - move;
  const fight = clamp(A.fightW, 0, 1);
  const breath = Math.sin(A.time * Math.PI * 2 / 3.7);
  p[P.bodyY] -= STUDY.stanceSink * still + STUDY.runSink * move;
  p[P.rF] -= STUDY.stanceWidth * still;
  p[P.lF] += STUDY.stanceWidth * still;
  // Weight goes into the supporting leg. Chest and head counterbalance it.
  p[P.pelvZ] += 0.016 * Math.sin(A.time * 0.8) * still;
  p[P.spZ] -= 0.012 * Math.sin(A.time * 0.8) * still;
  p[P.hdX] -= 0.018 * still;
  // The point is held on an oblique line with the elbow under it, not a rigid
  // horizontal pointer. The free hand opens beside the chest for balance.
  const guard = fight * (1 - A.sprintW) * (1 - 0.3 * move);
  if (guard > 0.001) {
    set(p, P.rH, -0.14, -0.215 + 0.009 * breath, 0.33, guard);
    set(p, P.rP, 0.02, -0.95, -0.34, guard);
    const az = (STUDY.guardAzimuth + 1.4 * Math.sin(A.time * 1.1)) * Math.PI / 180;
    const el = (STUDY.guardElevation + 1.1 * breath) * Math.PI / 180;
    set(p, P.swD, Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el), guard);
    set(p, P.swF, 0.2, 1, -0.25, guard);
    set(p, P.lH, -0.04, -0.19 + 0.006 * breath, 0.27, guard * still);
    set(p, P.lP, 0.4, -0.86, -0.3, guard * still);
    set(p, P.lD, -0.06, 0.25, 0.96, guard * still);
    set(p, P.lN, -0.9, -0.35, 0, guard * still);
    p[P.hs] += (1 - p[P.hs]) * guard * still;
  }
  // Preserve the speed-matched feet; give the run a steadier upper body.
  if (move > 0.001) {
    const contact = Math.cos(Math.PI * 4 * (A.phase - A.gait.beta * 0.5));
    p[P.bodyY] += 0.009 * contact * move;
    p[P.spY] -= 0.035 * Math.cos(Math.PI * 2 * A.phase) * move;
    p[P.hdY] += 0.024 * Math.cos(Math.PI * 2 * A.phase) * move;
    // Let a running hand travel with its forearm; keep the deliberate fingers
    // for stillness and cuts, rather than carrying a bent wrist through a sprint.
    for (let i = 0; i < 3; i++) {
      p[P.lD + i] *= 1 - 0.6 * move;
      p[P.lN + i] *= 1 - 0.7 * move;
    }
  }
}

function attack(p, A) {
  const d = A.def;
  if (!d) return;
  const active = (A.t - d.windup) / d.active;
  const enter = smoothstep(0, d.windup, A.t);
  const leave = 1 - smoothstep(d.windup + d.active, d.windup + d.active + d.recovery, A.t);
  const w = enter * leave;
  const clip = A.atkAnim?.clip ?? d.anim?.clip;
  const [turn, fold, sink] = ACCENTS[clip] ?? [0.04, 0.015, 0.012];
  const contact = Math.sin(Math.PI * clamp(active, 0, 1));
  p[P.pelvY] *= 1 + turn * w;
  p[P.spY] *= 1 + turn * 0.55 * w;
  p[P.bodyY] -= sink * (0.3 * w + 0.7 * contact);
  p[P.spX] += fold * contact;
  p[P.hdX] -= fold * contact * 0.45;
  p[P.bodyZ] += 0.016 * contact;
  const coil = smoothstep(0, d.windup * 0.7, A.t) * (1 - smoothstep(d.windup, d.windup + d.active * 0.35, A.t));
  // A little space in front of a high windup lets the elbow open naturally.
  const high = smoothstep(0.04, 0.22, p[P.rH + 1]);
  p[P.rH + 2] += 0.035 * coil * high;
  p[P.rH + 1] -= 0.025 * coil * high;
  // The free arm gathers, opens against the cut, then comes home. Keep all
  // two-handed and wrist-contact choreography in the original contact solver.
  const free = (1 - smoothstep(0.02, 0.5, p[P.twoHand])) * (1 - smoothstep(0.05, 0.5, p[P.lk]));
  const gather = coil * free * 0.24;
  set(p, P.lH, -0.035, -0.22, 0.29, gather);
  set(p, P.lP, 0.45, -0.8, -0.3, gather);
  const finish = smoothstep(d.windup + d.active * 0.5, d.windup + d.active, A.t) * leave * free;
  if (p[P.lH + 1] > -0.08) p[P.lH + 1] += (-0.08 - p[P.lH + 1]) * 0.4 * finish;
  p[P.hdY] -= p[P.pelvY] * 0.06 * w;
}

export function createTemperedPoses(source) {
  const recovery = new Float32Array(N);
  const poses = { ...source };
  poses.loco = (p, A) => { source.loco(p, A); locomotion(p, A); };
  poses.attack = (p, A) => {
    // Ease the gather, accelerate through the middle of the cut, then settle.
    // Every phase boundary stays fixed; restore A.t before other animator work.
    const t = A.t, d = A.def;
    if (d && t < d.windup) {
      const u = clamp(t / d.windup, 0, 1);
      A.t -= 0.06 * d.windup * Math.sin(Math.PI * u);
    } else if (d && t <= d.windup + d.active) {
      const u = clamp((t - d.windup) / d.active, 0, 1);
      A.t -= 0.045 * d.active * Math.sin(Math.PI * 2 * u);
    } else if (d) {
      const r = clamp((t - d.windup - d.active) / d.recovery, 0, 1);
      A.t -= STUDY.recoveryHold * d.recovery * Math.sin(Math.PI * r);
    }
    try { source.attack(p, A); } finally { A.t = t; }
    attack(p, A);
    // The original clip comes home to the original guard. Let its late
    // recovery arrive in this candidate's stance, so the blade does not
    // straighten and then pop back onto the oblique line between cuts.
    if (d) {
      const home = smoothstep(d.windup + d.active + d.recovery * 0.45, d.windup + d.active + d.recovery, t);
      if (home > 0) {
        recovery.set(p);
        locomotion(recovery, A);
        for (let i = 0; i < N; i++) p[i] += (recovery[i] - p[i]) * home;
      }
    }
  };
  poses.block = (p, A) => {
    source.block(p, A);
    p[P.bodyY] -= 0.025;
    p[P.spX] += 0.025;
    p[P.rF] -= 0.025;
    p[P.lF] += 0.025;
  };
  poses.charge = (p, A) => {
    source.charge(p, A);
    // Replace the high-frequency full-charge shake with a small held breath.
    if (A.chargeK >= 0.999) {
      const old = Math.sin(A.time * 47) * 0.012;
      const strain = Math.sin(A.time * 4.5) * 0.0025;
      p[P.bodyX] += strain - old;
      p[P.swD] += 2 * (strain - old);
    }
  };
  return poses;
}

export function createStudyActor(U, candidate = false) {
  const rig = buildHero(U);
  const pilot = {
    yaw: 0, position: rig.root.position, groundVel: new THREE.Vector3(),
    kb: new THREE.Vector3(), rollDir: new THREE.Vector3(0, 0, 1),
    drawScale: 1, state: 'idle', stateT: 0, animT: 0, atk: null,
    chargeK: 0, releaseK: 0, recoil: 0, guardHold: 0, lockOn: false,
    debug: { fightStance: false }, game: { state: 'explore', time: 0 },
  };
  const anim = new HeroAnimator(rig, pilot, null, { freeHand: true });
  if (candidate) {
    anim.poses = createTemperedPoses(anim.poses);
    installTemperedHands(anim);
  }
  // Presentation proportions only. This matrix is OFF while the existing IK
  // and cloth solve in unscaled metres. No shared bone lengths are changed.
  const baseUpdate = rig.root.updateMatrix.bind(rig.root);
  const deformation = new THREE.Matrix4().makeScale(...(candidate ? STUDY.scale : [1, 1, 1]));
  let drawing = false, cameraLean = 0, leanX = 0, leanZ = -1;
  const local = new THREE.Matrix4();
  rig.root.updateMatrix = () => {
    baseUpdate();
    if (!drawing) return;
    local.makeShear(0, 0, cameraLean * leanX, cameraLean * leanZ, 0, 0);
    // Keep travel in world metres; deform the actor about its ground origin.
    const x = rig.root.matrix.elements[12], z = rig.root.matrix.elements[14];
    rig.root.matrix.elements[12] = rig.root.matrix.elements[14] = 0;
    rig.root.matrix.premultiply(deformation).premultiply(local);
    rig.root.matrix.elements[12] = x;
    rig.root.matrix.elements[14] = z;
  };
  return {
    rig, pilot, anim, candidate,
    update(dt) {
      drawing = false;
      rig.root.updateMatrixWorld(true);
      pilot.game.time += dt;
      anim.update(dt);
    },
    present(pitch, yaw) {
      cameraLean = Math.tan(Math.min(32 * Math.PI / 180, pitch * 0.5));
      leanX = -Math.sin(yaw); leanZ = -Math.cos(yaw);
      drawing = true;
      rig.root.updateMatrixWorld(true);
    },
    reset() {
      drawing = false;
      pilot.position.set(0, 0, 0);
      pilot.groundVel.set(0, 0, 0);
      pilot.state = 'idle'; pilot.stateT = pilot.animT = 0;
      pilot.atk = null; pilot.chargeK = pilot.guardHold = 0;
      pilot.debug.fightStance = false;
      pilot.game.time = 0;
      anim.reset();
    },
  };
}
