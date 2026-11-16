// Actual rig / IK checks for the unmerged Tempered hand refinement.
import './integration/shim.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSharedUniforms } from '../src/render/shaderLib.js';
import { createStudyActor } from '../src/dev/heroStudy/actor.js';
import { installTemperedHands } from '../src/dev/heroStudy/hands.js';
import { StudySequence } from '../src/dev/heroStudy/sequence.js';
import { LIGHT, HEAVY, SPRINT_ATK, ROLL_ATK, CLEAVE } from '../src/entities/player/combat.js';
import { DIM } from '../src/entities/player/heroDims.js';

const defs = [ ...LIGHT, ...HEAVY, SPRINT_ATK, ROLL_ATK, CLEAVE ];
const looks = defs.flatMap(d => [d.anim, ...d.variants ?? []].map(anim => ({ ...d, anim, variants: [] })));
const grip = new THREE.Vector3(), end = new THREE.Vector3(), direction = new THREE.Vector3(), blade = new THREE.Vector3();
const q = new THREE.Quaternion();
let samples = 0, largestBend = 0, largestGripGap = 0;
for (const fps of [30, 60, 120]) {
  const actor = createStudyActor(createSharedUniforms(), true), seq = new StudySequence([actor]);
  seq.select('guard'); seq.seek(1);
  for (let i = 0; i < fps * 2; i++) {
    seq.tick(1 / fps);
    assert.equal(actor.anim.wristL.clamped, false, 'ready fingers stay inside the original wrist limits');
    assert.ok(Math.hypot(actor.anim.wristL.x, actor.anim.wristL.z) < 0.5, 'ready wrist is relaxed');
    actor.rig.root.updateMatrixWorld(true);
    direction.set(0, -1, 0).applyQuaternion(actor.rig.arms.R.fore.getWorldQuaternion(q));
    blade.set(0, 0, 1).applyQuaternion(actor.rig.sword.getWorldQuaternion(q));
    assert.ok(direction.angleTo(blade) < 25 * Math.PI / 180, 'ready sword and forearm align');
  }
  for (const def of looks) {
    seq.select('guard');
    seq.sequence = { steps: [
      { key: 'loco', fight: true, duration: 0.4 },
      { key: 'attack', fight: true, def, duration: def.windup + def.active + def.recovery },
      { key: 'loco', fight: true, duration: 0.5 },
    ] };
    seq.enter(0);
    const duration = seq.sequence.steps.reduce((n, s) => n + s.duration, 0);
    for (let i = 0; i < Math.floor(duration * fps) - 1; i++) {
      seq.tick(1 / fps);
      const A = actor.anim, r = actor.rig;
      r.root.updateMatrixWorld(true);
      assert.ok(Array.from(A.cur).every(Number.isFinite), `${def.anim.clip}: finite pose at ${fps} Hz`);
      end.set(0, -DIM.foreArm, 0).applyMatrix4(r.arms.R.fore.matrixWorld);
      r.sword.getWorldPosition(grip);
      assert.ok(end.distanceTo(grip) < 1e-6, 'sword stays in the solved hand');
      if (r.offHand.grip.visible) {
        largestGripGap = Math.max(largestGripGap, A.gripGap);
        assert.ok(A.gripGap < 0.12, 'visible supporting fist remains on the grip');
      }
      blade.set(0, 0, DIM.steelTip).applyMatrix4(r.sword.matrixWorld);
      assert.ok(blade.y > -0.005, 'blade stays above the floor');
      direction.set(0, -1, 0).applyQuaternion(r.arms.R.fore.getWorldQuaternion(q));
      blade.set(0, 0, 1).applyQuaternion(r.sword.getWorldQuaternion(q));
      const bend = direction.angleTo(blade) * 180 / Math.PI;
      largestBend = Math.max(largestBend, bend);
      assert.ok(bend <= 130, 'original sword wrist safety limit remains intact');
      samples++;
    }
  }
}

// The live A toggle must bypass BOTH private solvers, not only the pose map.
const original = createStudyActor(createSharedUniforms());
const bypassed = createStudyActor(createSharedUniforms());
installTemperedHands(bypassed.anim, () => false);
const pair = new StudySequence([original, bypassed]);
for (const clip of ['guard', 'sprint', 'combo', 'charge']) {
  pair.select(clip);
  for (let i = 0; i < 180; i++) {
    pair.tick(1 / 60);
    for (const side of ['R', 'L']) for (const bone of ['upper', 'fore']) {
      assert.ok(original.rig.arms[side][bone].quaternion.angleTo(bypassed.rig.arms[side][bone].quaternion) < 1e-6, 'Current retains original arm solve');
    }
    assert.ok(original.rig.arms.L.wrist.quaternion.angleTo(bypassed.rig.arms.L.wrist.quaternion) < 1e-6, 'Current retains original wrist spring');
  }
}
console.log(`Tempered hands: ${looks.length} attack variants at 30/60/120 Hz, ${samples} frames, grip/floor safety, relaxed guard and exact Current bypass pass. Peak sword bend ${largestBend.toFixed(1)} deg; supporting grip gap ${(largestGripGap * 100).toFixed(1)} cm.`);
