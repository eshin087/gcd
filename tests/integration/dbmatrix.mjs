// The deathblow's code (combat/deathblowMatrix.js, ?dbmatrix=0|rain|world), headless: the REAL module on a real camera,
// shared uniforms, LetterBatch and ScreenGrade (a stub pipeline hands over the batch).
// usage: node dbmatrix.mjs <repoRoot>
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import './shim.mjs';

const ROOT = process.argv[2];
const imp = (p) => import(pathToFileURL(`${ROOT}/${p}`).href);
const THREE = await import(pathToFileURL(`${ROOT}/node_modules/three/build/three.module.js`).href);
const { createSharedUniforms } = await imp('src/render/shaderLib.js');
const { ScreenGrade } = await imp('src/game/grade.js');
const M = await imp('src/combat/deathblowMatrix.js');
const { DB_MATRIX_LAST: L } = M;

const errors = [];
console.error = (...a) => { errors.push(a.map(String).join(' ')); };
const out = (...a) => process.stdout.write(a.join(' ') + '\n');
let fails = 0;
const assert = (c, m) => { if (!c) { fails++; out('FAIL', m); } else out('ok  ', m); };
const DT = 1 / 60;

function build() {
  const U = createSharedUniforms();
  const cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);
  cam.position.set(0, 9, 12);
  cam.lookAt(0, 1, 0);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  U.uResolution.value.set(1280, 720);
  const batches = [];
  const uni = { uExposure: { value: 1 }, uDesat: { value: 0 }, uWarm: { value: 0 }, uHurt: { value: 0 }, uFade: { value: 0 }, uMatrix: { value: 0 }, uMatrixFlash: { value: 0 } };
  const game = { THREE, U, camera: cam, realDt: DT, time: 0, player: { position: new THREE.Vector3(0, 0, 3.2) },
    pipeline: { width: 1280, height: 720, artCell: { x: 5, y: 8 }, registerParticles: (b) => batches.push(b), finalMat: { uniforms: uni } } };
  game.flow = { grade: new ScreenGrade(game) };
  game.flow.grade.fade = 0;
  return { game, batches, uni };
}
const boss = { x: 0, y: 0, z: 0 };
const snap = (b) => Array.from(b.iPos.array.subarray(0, b.count * 3));
const same = (a, c) => a.length === c.length && a.every((v, i) => v === c[i]);

for (const mode of ['rain', 'world']) {
  M.setDbMatrix(mode);
  M.deathblowMatrixClear();
  const G = build();
  const real = Math.random;
  let rand = 0, nan = 0, threw = null, peak = 0, maxCh = 0, maxUni = 0, frozenOk = true, burstSeen = false;
  const log = { before: 0, during: 0, after: 0, gone: -1 };
  let prev = null;
  const T = (f) => f / 60;
  let ended = -1;
  for (let f = 0; f < 420; f++) {
    G.game.time += DT;
    try {
      Math.random = () => { rand++; return real(); };
      if (f === 30) M.deathblowMatrixStart(G.game, { n: 7, dur: 3, hero: G.game.player.position, boss });
      if (f === 100) M.deathblowMatrixHit(G.game, { last: false, hold: 0.2, i: 1, n: 7 });
      if (f === 250) M.deathblowMatrixHit(G.game, { last: true, hold: 0.38, i: 7, n: 7 });
      if (f === 300) { M.deathblowMatrixEnd(); ended = f; }
      M.deathblowMatrixUpdate(G.game, DT);
      G.game.flow.grade.update(DT);
    } catch (e) { threw = e; } finally { Math.random = real; }
    const b = G.batches[0];
    const n = b ? b.count : 0;
    peak = Math.max(peak, n);
    if (b) for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) { const v = b.iColor.array[i * 4 + j]; if (!Number.isFinite(v) || !Number.isFinite(b.iPos.array[i * 3 + j])) nan++; maxCh = Math.max(maxCh, v); }
    maxUni = Math.max(maxUni, G.uni.uMatrix.value);
    if (f < 30) log.before += n; else if (f <= ended) log.during += n; else if (ended > 0 && f > ended + 22) log.after += n;
    if (ended > 0 && f > ended + 2 && log.gone < 0 && n === 0) log.gone = f;
    // the hit-pause (frames 102..114): the code stands still
    if (f === 104) prev = snap(b);
    if (f > 104 && f < 112 && !same(prev, snap(b))) frozenOk = false;
    if (f === 130 && same(prev, snap(b))) frozenOk = false; // (it runs on after the release)
    if (f > 252 && L.burst) burstSeen = true;
    if (f === 60) { assert(L.active && n > 0, `${mode}: live during the combo (${n} letters)`); }
  }
  assert(!threw, `${mode}: no throw (${threw?.message ?? 'ok'})`);
  assert(log.before === 0, `${mode}: nothing before the combo starts`);
  assert(log.after === 0 && log.gone > 0 && log.gone <= ended + 22, `${mode}: gone within 0.35 s of the end (frame ${log.gone})`);
  assert(frozenOk, `${mode}: frozen through the hit-pause, running after`);
  assert(peak > 0 && peak <= 1500, `${mode}: peak letters ${peak} within the 1500 budget`);
  assert(nan === 0 && L.bad === 0, `${mode}: no NaN (${nan}, pool ${L.bad})`);
  assert(maxCh <= 0.55 + 1e-6, `${mode}: no channel above 0.55 (${maxCh.toFixed(3)})`);
  assert(rand === 0, `${mode}: Math.random never called (${rand})`);
  assert(maxUni > 0.25 && (mode === 'world' ? maxUni > 0.9 : maxUni < 0.5), `${mode}: the grade's matrix cast reaches ${maxUni.toFixed(2)}`);
  assert(G.uni.uMatrix.value === 0 && G.uni.uMatrixFlash.value === 0, `${mode}: the grade is given back`);
  if (mode === 'rain') assert(burstSeen, 'rain: the finisher bursts the columns');
  out(`   ${mode}: peak ${peak}`);
}

// the switch off: nothing at all
{
  M.setDbMatrix('0');
  const G = build();
  M.deathblowMatrixStart(G.game, { n: 3, hero: G.game.player.position, boss });
  for (let f = 0; f < 30; f++) M.deathblowMatrixUpdate(G.game, DT);
  assert(G.batches.length === 0 && G.uni.uMatrix.value === 0, "0: no batch made, no grade: the combo is as before");
}
// bad input / no pipeline / a clear mid-flight
{
  M.setDbMatrix('rain');
  let t = null;
  try {
    M.deathblowMatrixStart(null, {});
    M.deathblowMatrixUpdate(null, NaN);
    const G = build();
    delete G.game.pipeline;
    M.deathblowMatrixStart(G.game, { boss: { x: NaN, z: 1 } });
    for (let f = 0; f < 20; f++) M.deathblowMatrixUpdate(G.game, f % 2 ? NaN : DT);
    M.deathblowMatrixClear(G.game);
    M.deathblowMatrixEnd();
  } catch (e) { t = e; }
  assert(!t, 'bad input, no pipeline, a clear mid-flight: nothing throws');
}
// source: no Math.random call in the module
assert(!/Math\.random\s*\(/.test(fs.readFileSync(`${ROOT}/src/combat/deathblowMatrix.js`, 'utf8').replace(/\/\/.*$/gm, '')), 'the module never calls Math.random');
M.setDbMatrix('rain');
assert(errors.length === 0, `no console errors (${errors.slice(0, 2).join(' | ')})`);
out(fails ? `\n${fails} FAILED` : '\nALL OK');
process.exit(fails ? 1 : 0);
