// The dragon ground's grass (world/dragonGrass.js, `dgGrass` / `dgCut`), headless. Two processes (the dragon
// print's default is read once, when its module loads):
//   old   the page as `?dragon=0` loads it: the 3D grass and its cut exactly as before; each dragon-grass
//         option turned on by its switch (?ground=b, dgGrass, dgCut): the one wake chunk, the printed tufts
//         mown into the scorch map's A with the chips flying and no cut top, the 3D steps, the cut IN the
//         print (dgCut a / b: the fine map along the arc, the tufts' tips thrown, the line's glow settling),
//         the standing tufts (a3d3), the digit blades on their lattice
//   ship  the page with no switch (what ships: the dragon print, grass a): the arc mows A, no cut tops fly
// usage: node dgGrass.mjs <repoRoot> [old | ship]   (old runs ship in a child process too)
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import './shim.mjs';

const ROOT = process.argv[2];
const MODE = process.argv[3] === 'ship' ? 'ship' : 'old';
const loc0 = globalThis.location;
globalThis.location = { ...(loc0 ?? {}), search: MODE === 'old' ? '?dragon=0' : '' };
const imp = (p) => import(pathToFileURL(`${ROOT}/${p}`).href);
const THREE = await imp('node_modules/three/build/three.module.js');
const { createSharedUniforms } = await imp('src/render/shaderLib.js');
const { setLook } = await imp('src/entities/enemies/duelist/lookSwitch.js');
const { Scorch } = await imp('src/world/scorch.js');
const { createGrass } = await imp('src/world/grass.js');
const { TRAIL_BEND_GLSL } = await imp('src/world/grassTrail.js');
const { dgGrassGlsl, dgGrassLook, dgGrassOpt, dgCutOpt, DG_GRASS_GLSL, DG, DG_U } = await imp('src/world/dragonGrass.js');
const { DP_FX_U } = await imp('src/render/dragonPrintFx.js');

let fails = 0;
const ok = (c, msg) => {
  console.log(`${c ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!c) fails++;
};
const base = globalThis.location;
/** The page as if loaded with ?ground=<g>&dgGrass=<o>&dgCut=<c> (ground.js reads the URL per call). */
function as(g, o, c = null) {
  globalThis.location = { ...base, search: `${base.search ? base.search + '&' : '?'}${g ? `ground=${g}` : ''}` };
  setLook('dgGrass', o);
  setLook('dgCut', c);
}
function restore() {
  globalThis.location = base;
  setLook('dgGrass', null);
  setLook('dgCut', null);
}
/** A small meadow with its scorch map and cut tops (wired as world.js does). */
function meadow() {
  const U = createSharedUniforms();
  const game = { THREE, U, scene: new THREE.Scene(), time: 0, dt: 1 / 60, camera: null };
  const world = { quality: 1, fire: { density: () => 1 } };
  game.world = world;
  world.scorch = new Scorch(U, game);
  world.grass = createGrass(U, { count: 30000, extent: 24, density: () => 1, height: (x, z, r) => 0.5 * (0.75 + r() * 0.5) });
  world.scorch.update(1 / 60); // (the cut tops are built on the first frame)
  return { U, game, world };
}
const tops = (T) => T.total - T.chipped;

if (MODE === 'ship') {
  console.log('== DGGRASS (what ships: no switch)');
  ok(dgGrassOpt() === 'a' && dgGrassLook() === 'a' && dgCutOpt() === 'b', `the dragon print's grass is a, its cut the swath with the glow (dgGrass ${dgGrassOpt()}, dgCut ${dgCutOpt()})`);
  ok(DG_GRASS_GLSL === dgGrassGlsl('a', 'b') && DG_GRASS_GLSL.includes('#define DG_MODE 1') && DG_GRASS_GLSL.includes('#define DG_CUT 2'), 'the ground prints the tufts and the cut swath (DG_MODE 1, DG_CUT 2)');
  const M = meadow();
  const T = M.world.scorch.tops;
  const n = T.cutArc(-2, 0.3, 1, 2, 0.3, 1, false);
  const sc = M.world.scorch;
  ok(M.world.grass.mesh.material.defines?.DG_PRINT === 0, 'the 3D blades are not printed (they are hidden: world.js)');
  ok(n > 50 && !!T.cutMap && T.chipped > 0 && tops(T) === 0 && !T.tufts, `the arc cuts its strip into the fine map (${n} blades), the chips fly (${T.chipped}), no cut top (${tops(T)}), no standing tufts`);
  console.log(fails ? `\n${fails} dgGrass (ship) check(s) FAILED` : '\nall dgGrass (ship) checks passed');
  process.exit(fails ? 1 : 0);
}

console.log('== DGGRASS (?dragon=0, each option by its switch)');
// one wake: the blades and the printed tufts read the same GLSL (grassTrail.js), its CPU copy is bendAt
const src = fs.readFileSync(`${ROOT}/src/world/grass.js`, 'utf8');
ok(!/vec4\s+trailBend\s*\(/.test(src) && src.includes('${TRAIL_BEND_GLSL}'), "grass.js bends round the wake through the one shared chunk (no trailBend of its own)");
const OPTS = ['a', 'a3d1', 'a3d2', 'a3d3', 'a2', 'b', 'c', '0'];
ok(OPTS.every((o) => dgGrassGlsl(o).includes(TRAIL_BEND_GLSL)), 'the printed grass includes the same chunk, for every option');
ok(/void dgGrass\(vec2 cw, float h, float d, float burn, float torn, inout vec3 N, inout vec3 body, inout float tone, inout float idx\)/.test(dgGrassGlsl('a')), "dgGrass keeps ground.js's signature");
ok(dgGrassGlsl('0').includes('#define DG_MODE 0') && ['a', 'a3d1', 'a3d2', 'a3d3'].every((o) => dgGrassGlsl(o).includes('#define DG_MODE 1')) && dgGrassGlsl('b').includes('#define DG_MODE 3'), 'the option is baked in: 0 nothing, a and its steps the tufts, b the floor under the blades');
ok(dgGrassGlsl('a', '0').includes('#define DG_DEPTH 0') && dgGrassGlsl('a3d1', '0').includes('#define DG_DEPTH 1') && dgGrassGlsl('a3d3', '0').includes('#define DG_STAND 1') && dgGrassGlsl('a3d2', '0').includes('#define DG_STAND 0'), 'the 3D steps: a none, a3d1 / a3d2 the depth cues in the print, a3d3 the tufts stand (the ground keeps the soil)');
ok(dgGrassGlsl('a', '0').includes('#define DG_CUT 0') && dgGrassGlsl('a', 'a').includes('#define DG_CUT 1') && dgGrassGlsl('a3d2', 'b').includes('#define DG_CUT 2') && dgGrassGlsl('b', 'b').includes('#define DG_CUT 0'), 'dgCut is baked in for the tufts only (0 round 2, a the swath, b + the glow)');
ok(DP_FX_U.uDgCut === DG_U.uDgCut && DP_FX_U.uDgCutBox === DG_U.uDgCutBox, 'the cut map rides in DP_FX_U (every dragon-printed material spreads it in: the ground has it)');

// the switches: what world.js / ground.js read
const looks = {};
for (const o of [...OPTS, 'x']) {
  as('b', o);
  looks[o] = dgGrassLook();
}
restore();
ok(['a', 'a3d1', 'a3d2', 'a3d3', 'a2'].every((o) => looks[o] === 'a') && looks.b === 'b' && looks.c === 'b' && looks['0'] === '0' && looks.x === '0', `dgGrassLook: a, its steps and a2 printed; b, c the 3D blades stay; anything else off (${JSON.stringify(looks)})`);

// ?dragon=0: the grass draws and is cut as before (no print define, no extra uniforms; the tops fly, no A)
for (const [g, o, what] of [[null, null, '?dragon=0'], ['b', '0', '?ground=b&dgGrass=0'], [null, 'b', 'dgGrass=b without ?ground=b'], [null, 'a3d3', 'dgGrass=a3d3 without ?ground=b']]) {
  as(g, o, 'b');
  const M = meadow();
  const mat = M.world.grass.mesh.material;
  const T = M.world.scorch.tops;
  const n = T.cutArc(-2, 0.3, 1, 2, 0.3, 1, false);
  ok(mat.defines?.DG_PRINT === 0 && !mat.uniforms.uDigs, `${what}: the blades are not printed (DG_PRINT 0, no print uniforms)`);
  ok(n > 50 && M.world.scorch.tornCells === 0 && tops(T) > 0 && !T.cutMap && !T.tufts, `${what}: the arc cuts ${n} blades by their bytes, writes no A (${M.world.scorch.tornCells} cells), the tops fly (${tops(T)}), no fine map, no standing tufts`);
  restore();
}

// a (and a2), round 2's cut: the arc's strip mown into the scorch map's A, the chips fly, no top of a hidden blade
for (const o of ['a', 'a3d2', 'a2']) {
  as('b', o, '0');
  const M = meadow();
  const T = M.world.scorch.tops;
  const n = T.cutArc(-2, 0.3, 1, 2, 0.3, 1, false);
  const sc = M.world.scorch;
  const mid = sc.tornAt(0, 1), off = sc.tornAt(0, 4);
  ok(n > 50 && sc.tornCells > 0 && mid > 0.7 && off === 0, `${o}, dgCut 0: the arc mows its strip into A (${sc.tornCells} cells, ${mid.toFixed(2)} on the line, ${off} 3 m off it)`);
  ok(T.chipped > 0 && tops(T) === 0, `${o}, dgCut 0: the code chips fly (${T.chipped}), no cut top (${tops(T)})`);
  ok(T.cutArc(-2, 2.6, 1, 2, 2.6, 1, false) === 0, `${o}: a stroke over the grass mows nothing`);
  restore();
}

// dgCut a / b: the cut IN the print: the arc's exact strip in the fine map, the tufts' tips thrown, no A
for (const [o, c] of [['a', 'a'], ['a3d1', 'a'], ['a3d2', 'b'], ['a3d3', 'b']]) {
  as('b', o, c);
  const M = meadow();
  const T = M.world.scorch.tops;
  const sc = M.world.scorch;
  const R0 = Math.random;
  let draws = 0;
  Math.random = () => {
    draws++;
    return R0();
  };
  M.game.U.uTime.value = 5;
  const n = T.cutArc(-2, 0.3, 1, 2, 0.3, 1, false);
  Math.random = R0;
  const S = DG.cut.size, box = DG_U.uDgCutBox.value, cs = box.z / S;
  let inStrip = 0, outStrip = 0, glow = 0;
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const v = T.cutMap[j * S + i];
      if (!v) continue;
      const x = box.x + (i + 0.5) * cs, z = box.y + (j + 0.5) * cs;
      const t = Math.max(0, Math.min(1, (x + 2) / 4)), d = Math.hypot(-2 + 4 * t - x, 1 - z);
      if (d <= DG.cut.w * 0.5 + 1e-6) inStrip++;
      else outStrip++;
      if (v < 251) glow++;
    }
  }
  const want = Math.round((4 * DG.cut.w + Math.PI * (DG.cut.w * 0.5) ** 2) / (cs * cs));
  ok(DG_U.uDgCut.value === T.cutMapTex && inStrip > want * 0.85 && inStrip < want * 1.15 && outStrip === 0 && sc.tornCells === 0, `${o}, dgCut ${c}: the arc's exact strip in the fine map (${inStrip} texels, ~${want} wanted, ${outStrip} beside it), none in A (${sc.tornCells})`);
  ok(T.cutPrintAt(0, 1) && !T.cutPrintAt(0, 1.6) && !T.cutPrintAt(3, 1), `${o}, dgCut ${c}: cut on the line, standing 0.6 m beside it and past its end`);
  let tuftGlyph = 0;
  for (let j = 0; j < T.n; j++) if (T.code[j] === 0 && Math.abs(T.w[j] - DG.cut.cell[0]) < 1e-6) tuftGlyph++;
  ok(T.tuftChipped > 5 && tuftGlyph === T.tuftChipped && tops(T) === 0, `${o}, dgCut ${c}: the shorn tufts throw ${T.tuftChipped} tips, each one print cell of their own letters in the grass's colour (${tuftGlyph}); no cut top (${tops(T)})`);
  ok(draws === 0, `${o}, dgCut ${c}: the cut draws nothing from Math.random (${draws})`);
  const n2 = T.tuftChipped;
  T.cutArc(-2, 0.3, 1, 2, 0.3, 1, false);
  ok(T.tuftChipped === n2, `${o}, dgCut ${c}: a tuft is shorn once (${T.tuftChipped - n2} more tips on a second pass)`);
  if (c === 'b') {
    ok(glow === inStrip, `${o}, dgCut b: the strip glows (${glow} cells stamped with the frame)`);
    M.game.U.uTime.value = 5 + DG.cut.flash + 0.1;
    sc.update(1 / 60);
    let still = 0;
    for (const v of T.cutMap) if (v && v < 251) still++;
    ok(still === 0, `${o}, dgCut b: ${DG.cut.flash} s on, the glow has settled (${still} cells still stamped)`);
  } else ok(glow === 0, `${o}, dgCut a: no glow (${glow} stamped)`);
  ok(o === 'a3d3' ? !!T.tufts && T.mesh.children.includes(T.tufts.mesh) && T.tufts.mesh.geometry.instanceCount > 20000 : !T.tufts, `${o}: ${o === 'a3d3' ? `the tufts stand (a layer of ${T.tufts?.mesh.geometry.instanceCount} billboards round the focus, drawn with the tops)` : 'no standing layer'}`);
  sc.reset();
  let left = 0;
  for (const v of T.cutMap) if (v) left++;
  ok(left === 0 && !T.cutPrintAt(0, 1), `${o}, dgCut ${c}: the fight's reset makes the grass whole (${left} cut)`);
  restore();
}

// b: the blades on an even lattice of the print's cells, printed; c: the same, sparse
for (const o of ['b', 'c']) {
  as('b', o);
  const M = meadow();
  const P = o === 'b' ? DG.blades : DG.sparse;
  const mat = M.world.grass.mesh.material;
  const B = M.world.grass.blades;
  let off = 0, flowers = 0;
  for (let i = 0; i < B.n; i++) {
    const gx = (B.root[i * 4] + 12) / P.lattice[0] - 0.5, gz = (B.root[i * 4 + 1] + 12) / P.lattice[1] - 0.5;
    if (Math.abs(gx - Math.round(gx)) > 1e-3 || Math.abs(gz - Math.round(gz)) > 1e-3) off++;
    if (B.data[i * 4 + 3] > 0.5) flowers++;
  }
  ok(mat.defines?.DG_PRINT === 1 && mat.uniforms.uDigs, `${o}: the blades are printed as digits (DG_PRINT 1, the print's ramp)`);
  ok(B.n > 0 && off === 0 && flowers === 0, `${o}: ${B.n} blades, every one on the lattice [${P.lattice}] (${off} off), no flowers (${flowers})`);
  const T = M.world.scorch.tops;
  const n = T.cutArc(-2, 0.3, 1, 2, 0.3, 1, false);
  ok(n > 0 && tops(T) === 0 && T.chipped > 0, `${o}: the arc cuts ${n} blades, the chips fly (${T.chipped}), no cut top (${tops(T)})`);
  ok((o === 'c') === M.world.scorch.tornCells > 0, `${o}: ${o === 'c' ? 'the relief under the blades is mown in A too' : "the cut stays in the blades' bytes (no A)"} (${M.world.scorch.tornCells} cells)`);
  restore();
}

// what ships, in a process of its own
const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ROOT, 'ship'], { stdio: 'inherit' });
if (child.status !== 0) fails++;

console.log(fails ? `\n${fails} dgGrass check(s) FAILED` : '\nall dgGrass checks passed');
process.exit(fails ? 1 : 0);
