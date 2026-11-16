// Review the actual shortened recovery windows, where v3's full-recovery
// studio sequence missed the free-hand snap between lights and into heavies.
import './integration/shim.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStudyActor } from '../src/dev/heroStudy/actor.js';
import { createSharedUniforms } from '../src/render/shaderLib.js';
import { StudySequence } from '../src/dev/heroStudy/sequence.js';
import { LIGHT, HEAVY } from '../src/entities/player/combat.js';
import { DIM } from '../src/entities/player/heroDims.js';
import { P } from '../src/entities/player/anim.js';

const hand = new THREE.Vector3(), prev = new THREE.Vector3();
const blade = new THREE.Vector3(), prevBlade = new THREE.Vector3();
let samples = 0, maxEntrySpeed = 0, maxGripGap = 0, maxHeavyWindupSpeed = 0;
for (const fps of [30, 60, 120]) {
  const actor = createStudyActor(createSharedUniforms(), true), seq = new StudySequence([actor]);
  for (let look = 0; look < 3; look++) {
    const lights = LIGHT.map(d => ({ ...d, variants: [], anim: [d.anim, ...d.variants ?? []][look % (1 + (d.variants?.length ?? 0))] }));
    const cases = [['lights', lights, true], ['ease-heavy', [HEAVY[0]], false], ['guard-heavy', [HEAVY[0]], true],
      ...[0.3, 0.6, 0.92].flatMap(recovery => [
        ...HEAVY.slice(1).map((d, i) => [`branch${i + 1} at ${recovery} recovery`, [...lights.slice(0, i + 1), d], true, recovery]),
        [`finisher into heavy at ${recovery} recovery`, [...lights, HEAVY[0]], true, recovery],
      ])];
    if (look === 0) {
      // The game mixes variants independently. Cover every neighbouring pair,
      // including combinations absent from the three complete chains above.
      const variants = d => [d.anim, ...d.variants ?? []].map(anim => ({ ...d, anim, variants: [] }));
      for (let n = 0; n < LIGHT.length - 1; n++) {
        for (const a of variants(LIGHT[n])) for (const b of variants(LIGHT[n + 1])) {
          cases.push([`${a.anim.clip} → ${b.anim.clip}`, [a, b], true]);
        }
      }
    }
    for (const [name, defs, fight, recovery] of cases) {
      seq.select('guard');
      seq.sequence = { steps: [{ key: 'loco', fight, duration: 0.5 },
        ...defs.map((def, i) => ({ key: 'attack', fight: true, def,
          duration: def.windup + def.active + def.recovery * (i === defs.length - 1 ? 1 :
            i === defs.length - 2 && recovery ? recovery : def.chain) })),
        { key: 'loco', fight: true, duration: 0.5 }] };
      seq.enter(0);
      const duration = seq.sequence.steps.reduce((n, s) => n + s.duration, 0);
      for (let i = 0; i < Math.floor(duration * fps) - 1; i++) {
        seq.tick(1 / fps);
        const A = actor.anim, r = actor.rig, p = A.cur;
        r.root.updateMatrixWorld(true);
        hand.set(0, -DIM.foreArm, 0).applyMatrix4(r.arms.L.fore.matrixWorld);
        r.body.worldToLocal(hand); // remove root travel / full-body spins
        blade.set(0, 0, 1).applyQuaternion(r.sword.quaternion);
        assert.ok(hand.toArray().every(Number.isFinite));
        if (seq.step.key === 'attack') {
          const label = `${name}, look ${look}, ${fps} Hz, ${A.atkAnim.clip}, t=${A.t.toFixed(3)}`;
          // A fast strike can move the hand quickly. Its FIRST 50 ms should not
          // teleport it from a hidden wrist-contact target to the new coil.
          if (i && seq.local < 0.05) {
            const speed = hand.distanceTo(prev) * fps;
            maxEntrySpeed = Math.max(maxEntrySpeed, speed);
            assert.ok(speed < 8, `free-hand entry discontinuity (${speed.toFixed(2)} m/s): ${label}`);
          }
          if (p[P.twoHand] < 0.05 && p[P.lk] < 0.05 && A.t > 0.1) {
            assert.equal(A.wristL.clamped, false, `free wrist reaches a limit: ${label}`);
          }
          if (seq.step.def.kind === 'light' && seq.step.def.combo < 5 && A.t > seq.step.def.windup) {
            assert.ok(p[P.lk] < 0.001, `light should not grab and release the other wrist: ${label}`);
            assert.ok(p[P.lH + 1] < -0.1, `free hand flung above shoulder: ${label}`);
          }
          if (r.offHand.grip.visible) {
            maxGripGap = Math.max(maxGripGap, A.gripGap);
            assert.ok(A.gripGap < 0.08, `supporting fist leaves the hilt: ${label}`);
          }
          if (A.temperedEntry.chainedHeavy && ['heavyCrush', 'slam'].includes(A.atkAnim.clip) && A.t >= 1 / fps && A.t < seq.step.def.windup - 1 / 60) {
            const speed = blade.angleTo(prevBlade) * 180 / Math.PI * fps;
            maxHeavyWindupSpeed = Math.max(maxHeavyWindupSpeed, speed);
            // Late light recovery can itself exceed 1000 deg/s. Its existing
            // speed may carry into the gather; the gather must not amplify it.
            const incoming = Math.hypot(...A.temperedEntry.bladeVelocity) * 180 / Math.PI;
            assert.ok(speed < Math.max(1000, incoming * 1.05), `heavy windup whips through the old low waypoint (${speed.toFixed(0)} deg/s): ${label}`);
          }
          samples++;
        }
        prev.copy(hand);
        prevBlade.copy(blade);
      }
    }
  }
}
console.log(`Tempered transitions: ${samples} attack frames, every adjacent light-variant pair / four heavy branches plus finisher-to-heavy at early, middle and late recovery at 30/60/120 Hz; entry speed <= ${maxEntrySpeed.toFixed(2)} m/s, supporting grip gap <= ${(maxGripGap * 100).toFixed(1)} cm; falling-heavy windup <= ${maxHeavyWindupSpeed.toFixed(0)} deg/s; no free-wrist limit contacts.`);
