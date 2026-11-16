// The audition uses real hero rigs and the existing IK/cloth, without WebGL.
import './integration/shim.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSharedUniforms } from '../src/render/shaderLib.js';
import { DIM, BODY } from '../src/entities/player/heroDims.js';
import { SWINGS } from '../src/entities/player/swings.js';
import { LIGHT, HEAVY } from '../src/entities/player/combat.js';
import { createStudyActor, STUDY } from '../src/dev/heroStudy/actor.js';
import { StudySequence, SEQUENCES } from '../src/dev/heroStudy/sequence.js';
import * as THREE from 'three';
import { Player } from '../src/entities/player/player.js';
import { installGameplayStudy } from '../src/dev/heroStudy/gameplayActor.js';
import { installTemporaryStorage, memoryStorage } from '../src/dev/heroStudy/temporaryStorage.js';

const original = JSON.stringify({ DIM, BODY, SWINGS, LIGHT, HEAVY });
const reference = createStudyActor(createSharedUniforms());
const candidate = createStudyActor(createSharedUniforms(), true);
const seq = new StudySequence([reference, candidate]);
let samples = 0;
for (const [id, s] of Object.entries(SEQUENCES)) {
  seq.select(id);
  for (let i = 0; i < Math.ceil(s.duration * 60); i++) {
    seq.tick(1 / 60);
    for (const a of [reference, candidate]) {
      assert.ok(Array.from(a.anim.cur).every(Number.isFinite), `${id}: finite pose`);
      a.present(58 * Math.PI / 180, Math.PI);
      a.rig.root.traverse((o) => {
        assert.ok(o.matrixWorld.elements.every(Number.isFinite), `${id}: finite rig transform`);
      });
      // The original floor guard still protects the steel in every clip.
      const tip = a.rig.sword.localToWorld(new (a.pilot.position.constructor)(0, 0, DIM.steelTip));
      assert.ok(tip.y >= -0.005, `${id}: blade below floor (${tip.y})`);
    }
    assert.equal(reference.pilot.position.z, candidate.pilot.position.z, `${id}: synchronized root travel`);
    samples++;
  }
}
assert.equal(JSON.stringify({ DIM, BODY, SWINGS, LIGHT, HEAVY }), original, 'shared rig / clips / combat definitions unchanged');
assert.notEqual(reference.anim.poses, candidate.anim.poses, 'candidate owns its pose map');
assert.notEqual(reference.rig.materials.coat, candidate.rig.materials.coat, 'materials belong to individual actors');

seq.select('guard'); seq.seek(2);
const pose = Array.from(candidate.anim.cur);
seq.seek(2);
assert.deepEqual(Array.from(candidate.anim.cur), pose, 'seeking to the same time is deterministic');
assert.equal(reference.pilot.position.z, 0, 'guard is stationary');
reference.present(0, 0); candidate.present(0, 0);
assert.equal(reference.rig.root.matrix.elements[0], 1, 'baseline scale stays 1');
assert.equal(candidate.rig.root.matrix.elements[0], STUDY.scale[0], 'candidate width is explicit');
assert.equal(candidate.rig.root.matrix.elements[5], STUDY.scale[1], 'candidate height is explicit');
candidate.update(0);
assert.equal(candidate.rig.root.matrix.elements[5], 1, 'presentation scale removed for IK');

const gameEntry = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
assert.ok(!/heroStudy|hero-study/.test(gameEntry), 'game entry does not import the study');

// SwordSweep consumes unleaned blade points. The preview's drawing proportions
// must round-trip real rig points to those same gameplay metres at every heading.
const player = new Player({ U: createSharedUniforms(), scene: new THREE.Scene(), settings: { quality: 1 } });
const baselinePoses = player.anim.poses;
const gameplay = installGameplayStudy(player);
for (let i = 0; i < 36; i++) {
  player.position.set(4, i % 3, -7);
  player.object3d.rotation.y = i * Math.PI / 18;
  player.lean.k = i / 90;
  player.lean.dx = Math.sin(i / 3); player.lean.dz = Math.cos(i / 3);
  player.lean.on = false;
  player.object3d.updateMatrixWorld(true);
  const upright = player.rig.sword.localToWorld(new THREE.Vector3(0, 0, DIM.steelTip));
  player.lean.on = true;
  player.object3d.updateMatrixWorld(true);
  const drawn = player.rig.sword.localToWorld(new THREE.Vector3(0, 0, DIM.steelTip));
  assert.ok(player.unlean(drawn.clone()).distanceTo(upright) < 1e-7, 'drawn blade maps to upright sweep geometry');
  assert.ok(player.leanPoint(upright.clone()).distanceTo(drawn) < 1e-7, 'gameplay points map to drawn blade');
}
const hp = player.hp, pos = player.position.clone();
player.sweep.valid = true;
gameplay.select('current');
assert.equal(player.anim.poses, baselinePoses, 'current mode restores the original pose map');
assert.equal(player.sweep.valid, false, 'switch cannot sweep between different silhouettes');
assert.equal(player.hp, hp); assert.deepEqual(player.position, pos);
gameplay.select('tempered');
assert.notEqual(player.anim.poses, baselinePoses);
player.setLoadout(player.rig.loadout);
const rebuilt = player.anim.poses;
gameplay.select('tempered');
assert.notEqual(player.anim.poses, rebuilt, 'equipment rebuild receives private candidate poses');
gameplay.select('current');
assert.equal(player.anim.poses, rebuilt, 'equipment rebuild can return to its own source poses');
assert.equal(JSON.stringify({ DIM, BODY, SWINGS, LIGHT, HEAVY }), original, 'playable preview leaves shared definitions unchanged');

const saved = memoryStorage(); saved.setItem('saved', 'keep');
const page = { localStorage: saved, sessionStorage: saved };
installTemporaryStorage(page);
page.localStorage.setItem('saved', 'preview');
page.sessionStorage.clear();
assert.equal(saved.getItem('saved'), 'keep', 'preview cannot modify persistent state');
assert.notEqual(page.localStorage, page.sessionStorage);
const blocked = {};
Object.defineProperty(blocked, 'localStorage', { configurable: false, value: saved });
assert.throws(() => installTemporaryStorage(blocked), TypeError, 'storage isolation fails closed');
console.log('Playable preview: actual blade transforms, A/B restoration, equipment rebuild and temporary storage isolation pass.');
console.log(`Hero study: ${samples} paired frames across ${Object.keys(SEQUENCES).length} sequences; finite transforms, floor clearance, deterministic seek and isolation pass.`);
