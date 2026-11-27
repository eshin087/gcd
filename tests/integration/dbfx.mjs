// The deathblow's hit effect, headless (combat/deathblowFx.js, ?dbfx=a|b|c|d): the REAL module on a real
// camera, uniforms, FireField and LetterBatch (a stub pipeline hands over the batch). A combo of 7 blows
// 0.2 s apart (the last the finisher) is run for 2 s at 60 fps under each look.
// usage: node dbfx.mjs <repoRoot> [scenario]    scenario: combo | switch | edge | all
import { pathToFileURL } from 'node:url';
import './shim.mjs';

const ROOT = process.argv[2];
const SCEN = process.argv[3] || 'all';
const imp = (p) => import(pathToFileURL(`${ROOT}/${p}`).href);
const THREE = await import(pathToFileURL(`${ROOT}/node_modules/three/build/three.module.js`).href);
const { createSharedUniforms } = await imp('src/render/shaderLib.js');
const { FireField } = await imp('src/render/fireField.js');
const FX = await imp('src/combat/deathblowFx.js');
const { DBFX_LAST: L } = FX;

const errors = [];
console.error = (...a) => { errors.push(a.map(String).join(' ')); };
console.warn = (...a) => { errors.push('WARN ' + a.map(String).join(' ')); };
const out = (...a) => process.stdout.write(a.join(' ') + '\n');
let fails = 0;
const assert = (c, m) => { if (!c) { fails++; out('FAIL', m); } else out('ok  ', m); };
const DT = 1 / 60;
const CAP = 300; // letters alive at once, at most

/** The game the effect reads: camera + uniforms + pipeline stub + fire field + the hero. */
function build(withPipeline = true) {
  const U = createSharedUniforms();
  const cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);
  cam.position.set(0, 9, 12);
  cam.lookAt(0, 1, 0);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  U.uCamRight.value.setFromMatrixColumn(cam.matrixWorld, 0);
  U.uCamUp.value.setFromMatrixColumn(cam.matrixWorld, 1);
  U.uResolution.value.set(1280, 720);
  const batches = [];
  const game = {
    THREE, U, camera: cam, fxDt: DT, time: 0,
    fx: { fire: new FireField(U, { max: 6000 }) },
    player: { position: new THREE.Vector3(0, 0, 3.2) },
  };
  if (withPipeline) game.pipeline = { width: 1280, height: 720, artCell: { x: 5, y: 8 }, registerParticles: (b) => batches.push(b) };
  return { game, batches };
}

/** Run the effect through `fn(game, hit)` for `frames`, with Math.random counted; returns the stats. */
function stats(G, frames, perFrame) {
  const S = { peak: 0, maxCh: 0, nan: 0, heatBad: 0, heatFrames: 0, randCalls: 0, threw: null };
  const real = Math.random;
  const count = () => { S.randCalls++; return real(); };
  const b = () => G.batches[0];
  for (let f = 0; f < frames; f++) {
    G.game.time += DT;
    G.game.fx.fire.clear();
    try {
      Math.random = count;
      perFrame(f);
      FX.deathblowFxUpdate(G.game, DT);
    } catch (e) {
      S.threw = e;
    } finally {
      Math.random = real;
    }
    const n = G.game.fx.fire.count;
    if (n > 0) {
      S.heatFrames++;
      if (!(L.flash > 0)) S.heatBad++; // heat written with no blow's flash alive
    }
    const bb = b();
    if (bb) {
      S.peak = Math.max(S.peak, bb.count);
      for (let i = 0; i < bb.count; i++) {
        const c = bb.iColor.array, p = bb.iPos.array;
        for (let j = 0; j < 3; j++) { if (!Number.isFinite(c[i * 4 + j]) || !Number.isFinite(p[i * 3 + j])) S.nan++; S.maxCh = Math.max(S.maxCh, c[i * 4 + j]); }
        if (!Number.isFinite(c[i * 4 + 3])) S.nan++;
      }
    }
  }
  return S;
}

/** One blow's data: the contact on the boss (x ~ 0, y ~ 1.1), the blow's way alternating. */
const blow = (k, last, n = 7) => ({
  x: Math.sin(k * 1.7) * 0.15, y: 1.0 + 0.1 * (k % 3), z: -0.2 + 0.1 * Math.cos(k), dx: k % 2 ? 0.8 : -0.6, dz: k % 2 ? -0.6 : 0.8,
  i: k + 1, n, last, a0: k % 3 === 2 ? NaN : -0.8 + 0.2 * k, a1: k % 3 === 2 ? NaN : 0.7 + 0.1 * k,
});

const SCENARIOS = {
  combo() {
    out('\n== scenario COMBO (7 blows 0.2 s apart, the last the finisher; 2 s at 60 fps; each look) ==');
    FX.setDbFx('a');
    for (const mode of FX.DB_FX.opts) {
      FX.setDbFx(mode);
      FX.deathblowFxClear();
      const G = build();
      const S = stats(G, 120, (f) => {
        if (f % 12 === 0 && f / 12 < 7) FX.deathblowHit(G.game, blow(f / 12, f / 12 === 6));
      });
      assert(!S.threw, `${mode}: no throw (${S.threw?.message ?? 'ok'})`);
      assert(S.nan === 0 && L.bad === 0, `${mode}: no NaN in the letters (${S.nan}) or the pool (${L.bad})`);
      assert(!FX.deathblowFxBusy() && L.alive === 0, `${mode}: nothing alive after 2 s`);
      out(`   ${mode}: ${L.spawned} letters made in all, peak alive ${S.peak} (cap ${CAP}), heat on ${S.heatFrames} frames, brightest channel ${S.maxCh.toFixed(2)}, ${L.white} white, snapped ${L.snapped}`);
      assert(S.peak > 0 && S.peak <= CAP, `${mode}: peak live letters ${S.peak} is within 1..${CAP}`);
      assert(S.heatFrames > 0 && S.heatBad === 0, `${mode}: heat written only while a blow's flash lives (${S.heatBad} stray frames)`);
      assert(S.maxCh <= 0.55 + 1e-6 && L.white === 0, `${mode}: no colour channel above 0.55, none white (${S.maxCh.toFixed(3)})`);
      assert(S.randCalls === 0, `${mode}: Math.random never called (${S.randCalls})`);
      assert(G.game.fx.fire.count === 0, `${mode}: no heat left in the field`);
      // growth: the finisher makes more than the first blow
      FX.deathblowFxClear();
      let s0 = L.spawned;
      FX.deathblowHit(G.game, blow(0, false));
      const first = L.spawned - s0;
      FX.deathblowFxClear();
      s0 = L.spawned;
      FX.deathblowHit(G.game, blow(6, true));
      const fin = L.spawned - s0;
      assert(fin > first, `${mode}: the finisher makes more letters (${fin}) than the first blow (${first})`);
      FX.deathblowFxClear();
    }
    if (FX.DB_FX.mode !== 'a') FX.setDbFx('a');
  },

  switch() {
    out('\n== scenario SWITCH (the look changes at every blow of one combo) ==');
    const G = build();
    FX.deathblowFxClear();
    const seq = ['a', 'b', 'c', 'd', 'a', 'c', 'b'];
    const S = stats(G, 120, (f) => {
      if (f % 12 === 0 && f / 12 < 7) {
        FX.setDbFx(seq[f / 12]);
        FX.deathblowHit(G.game, blow(f / 12, f / 12 === 6));
      }
    });
    assert(!S.threw, `a switch at every blow does not throw (${S.threw?.message ?? 'ok'})`);
    assert(S.nan === 0 && !FX.deathblowFxBusy(), 'it ends clean: nothing alive, no NaN');
    assert(S.maxCh <= 0.55 + 1e-6 && S.randCalls === 0, 'under the bloom threshold, no Math.random');
    FX.setDbFx('zzz');
    assert(FX.getDbFx() === 'a', 'an unknown look falls back to a');
    out(`   peak alive ${S.peak}`);
  },

  edge() {
    out('\n== scenario EDGE (bad input, no pipeline, no fire field, a clear mid-flight) ==');
    let threw = null;
    try {
      for (const mode of FX.DB_FX.opts) {
        FX.setDbFx(mode);
        const G = build(false);
        FX.deathblowHit(G.game, blow(0, false));
        FX.deathblowHit(G.game, blow(1, true));
        FX.deathblowHit(G.game, { x: NaN, y: 1, z: 0, i: 1, n: 1, last: true });
        FX.deathblowHit(G.game, { x: 0, y: 1, z: 0, dx: NaN, dz: NaN, i: 1, n: 1, last: true, a0: NaN, a1: NaN });
        FX.deathblowHit(G.game, null);
        FX.deathblowHit(null, blow(0, false));
        G.game.fx = {};
        for (let f = 0; f < 150; f++) FX.deathblowFxUpdate(G.game, DT);
        FX.deathblowHit(G.game, blow(2, true));
        FX.deathblowFxUpdate(G.game, DT);
        FX.deathblowFxClear(G.game);
        FX.deathblowFxUpdate(G.game, 0);
        FX.deathblowFxUpdate(null, DT);
        FX.deathblowFxUpdate(G.game, NaN);
      }
    } catch (e) {
      threw = e;
    }
    assert(!threw, `bad input, no pipeline, no fire field, a clear mid-flight: nothing throws (${threw?.message ?? 'ok'})`);
    assert(!FX.deathblowFxBusy(), 'a clear leaves nothing alive');
    FX.setDbFx('a');
  },
};

const names = SCEN === 'all' ? Object.keys(SCENARIOS) : SCEN.split(',');
for (const n of names) {
  if (!SCENARIOS[n]) { out('unknown scenario', n); fails++; continue; }
  await SCENARIOS[n]();
}
assert(errors.length === 0, `no console errors (${errors.slice(0, 2).join(' | ')})`);
out(fails ? `\n${fails} FAILED` : '\nALL OK');
process.exit(fails ? 1 : 0);
