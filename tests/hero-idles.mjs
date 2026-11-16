import './integration/shim.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSharedUniforms } from '../src/render/shaderLib.js';
import { createStudyActor } from '../src/dev/heroStudy/actor.js';
import { StudySequence, SEQUENCES } from '../src/dev/heroStudy/sequence.js';
import { IDLE_GESTURES } from '../src/dev/heroStudy/idles.js';
import { temperedAttack, originalAttack } from '../src/dev/heroStudy/attacks.js';
import { HEAVY } from '../src/entities/player/combat.js';
import { P } from '../src/entities/player/anim.js';
import { DIM } from '../src/entities/player/heroDims.js';

const q = new THREE.Quaternion(), fore = new THREE.Vector3(), blade = new THREE.Vector3();
let frames = 0, worstSword = 0, worstFree = 0;
for (const fps of [30, 60, 120]) {
  const a = createStudyActor(createSharedUniforms(), true), seq = new StudySequence([a]);
  seq.select('idleLife');
  for (let i = 0; i < Math.floor(SEQUENCES.idleLife.duration * fps) - 1; i++) {
    seq.tick(1 / fps); a.rig.root.updateMatrixWorld(true);
    const A = a.anim, r = a.rig;
    assert.ok(Array.from(A.cur).every(Number.isFinite), 'idle remains finite');
    const bend = Math.hypot(A.wristL.x, A.wristL.z) * 180 / Math.PI;
    worstFree = Math.max(worstFree, bend);
    assert.ok(bend < 8, 'idle free hand follows the forearm without a cocked wrist');
    assert.equal(A.wristL.clamped, false, 'no idle gesture requests a wrist limit');
    fore.set(0, -1, 0).applyQuaternion(r.arms.R.fore.getWorldQuaternion(q));
    blade.set(0, 0, 1).applyQuaternion(r.sword.getWorldQuaternion(q));
    const angle = fore.angleTo(blade) * 180 / Math.PI;
    worstSword = Math.max(worstSword, angle);
    assert.ok(angle < 40, 'idle blade stays aligned with the sword forearm');
    if (seq.step.fidget == null && seq.local > 0.35) {
      assert.ok(A.cur[P.lH + 1] < -0.42 && A.cur[P.lH] > 0.06, 'default hand hangs beside the thigh, away from the belt');
    }
    frames++;
  }
  // Every idle can release into locomotion; no gesture leaves a latched hand.
  for (let k = 0; k < IDLE_GESTURES.length; k++) {
    seq.select('idle'); seq.seek(0.7);
    Object.assign(a.anim.fidget, { k, t: IDLE_GESTURES[k].duration / 2, w: 1, cut: false });
    a.update(1 / fps);
    a.pilot.state = 'run'; a.pilot.groundVel.z = 4;
    for (let i = 0; i < Math.ceil(fps * 0.3); i++) a.update(1 / fps);
    assert.equal(a.anim.fidget.k, -1, 'movement cancels the idle gesture');
    assert.ok(Array.from(a.anim.cur).every(Number.isFinite));
  }
}

// Test the actual drawn blade's lateral travel, not merely a different clip name.
const a = createStudyActor(createSharedUniforms(), false), b = createStudyActor(createSharedUniforms(), true);
const seq = new StudySequence([a, b]); seq.select('heavy');
const ranges = [[], []], d = HEAVY[0];
for (let i = 0; i < Math.floor((0.5 + d.windup + d.active) * 120) - 1; i++) {
  seq.tick(1 / 120);
  if (seq.index !== 1 || seq.local < d.windup) continue;
  for (const [j, actor] of [a, b].entries()) {
    actor.rig.root.updateMatrixWorld(true);
    blade.set(0, 0, DIM.steelTip).applyMatrix4(actor.rig.sword.matrixWorld);
    actor.rig.body.worldToLocal(blade); ranges[j].push(blade.x);
  }
}
const span = ranges.map(v => Math.max(...v) - Math.min(...v));
assert.ok(span[1] > 1, `Tempered heavy sweeps laterally across the body (${span[1].toFixed(2)} m)`);
assert.ok(span[1] > span[0] * 2, 'opening heavy has a slash arc instead of the original point drive');
const source = HEAVY[0], changed = temperedAttack(source);
assert.equal(originalAttack(changed), source, 'Current restores the exact original attack');
assert.equal(temperedAttack(changed), changed, 'candidate mapping is stable');
for (const field of ['damage', 'poise', 'travel', 'windup', 'active', 'recovery', 'chain']) assert.equal(changed[field], source[field], `${field} stays unchanged`);
assert.equal(source.anim.clip, 'heavyThrust'); assert.equal(source.contact, 'point');
assert.ok(HEAVY.every(def => temperedAttack(def).anim.clip !== 'heavyThrust'), 'no ordinary Tempered heavy is the thrust');
console.log(`Tempered idle: ${frames} frames, all six gestures at 30/60/120 Hz and movement cancellation pass. Max wrist bend: free ${worstFree.toFixed(1)}°, sword ${worstSword.toFixed(1)}°. Opening heavy lateral span: Current ${span[0].toFixed(2)} m / Tempered ${span[1].toFixed(2)} m.`);
