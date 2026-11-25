// The dragon ground's grass (world/dragonGrass.js, `?ground=b&dgGrass=a|a2|b|c`), headless: the one wake
// chunk, the switches drawing nothing new while off, the printed tufts mown by the sword's arc (the scorch
// map's A) with the chips still flying and no cut tops, the standing digit blades on their even lattice.
// usage: node dgGrass.mjs <repoRoot>
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import './shim.mjs';

const ROOT = process.argv[2];
const imp = (p) => import(pathToFileURL(`${ROOT}/${p}`).href);
const THREE = await imp('node_modules/three/build/three.module.js');
const { createSharedUniforms } = await imp('src/render/shaderLib.js');
const { setLook } = await imp('src/entities/enemies/duelist/lookSwitch.js');
const { Scorch } = await imp('src/world/scorch.js');
const { createGrass } = await imp('src/world/grass.js');
const { TRAIL_BEND_GLSL } = await imp('src/world/grassTrail.js');
const { dgGrassGlsl, dgGrassLook, DG } = await imp('src/world/dragonGrass.js');

let fails = 0;
const ok = (c, msg) => {
  console.log(`${c ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!c) fails++;
};
const loc0 = globalThis.location;
/** The page as it would be loaded with ?ground=<g> and dgGrass=<o> (ground.js reads the URL per call). */
function as(g, o) {
  globalThis.location = { ...(loc0 ?? {}), search: g ? `?ground=${g}` : '' };
  setLook('dgGrass', o);
}
function restore() {
  globalThis.location = loc0;
  setLook('dgGrass', null);
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

console.log('== DGGRASS');
// one wake: the blades and the printed tufts read the same GLSL (grassTrail.js), its CPU copy is bendAt
const src = fs.readFileSync(`${ROOT}/src/world/grass.js`, 'utf8');
ok(!/vec4\s+trailBend\s*\(/.test(src) && src.includes('${TRAIL_BEND_GLSL}'), "grass.js bends round the wake through the one shared chunk (no trailBend of its own)");
ok(['a', 'a2', 'b', 'c', '0'].every((o) => dgGrassGlsl(o).includes(TRAIL_BEND_GLSL)), 'the printed grass includes the same chunk, for every option');
ok(/void dgGrass\(vec2 cw, float h, float d, float burn, float torn, inout vec3 N, inout vec3 body, inout float tone, inout float idx\)/.test(dgGrassGlsl('a')), "dgGrass keeps ground.js's signature");
ok(dgGrassGlsl('0').includes('#define DG_MODE 0') && dgGrassGlsl('a').includes('#define DG_MODE 1') && dgGrassGlsl('b').includes('#define DG_MODE 3'), 'the option is baked in: 0 nothing, a the tufts, b the floor under the blades');

// the switch: what world.js / ground.js read
const looks = {};
for (const o of ['0', 'a', 'a2', 'b', 'c', 'x']) {
  as('b', o);
  looks[o] = dgGrassLook();
}
restore();
ok(looks['0'] === '0' && looks.a === 'a' && looks.a2 === 'a' && looks.b === 'b' && looks.c === 'b' && looks.x === '0', `dgGrassLook: a, a2 printed; b, c the 3D blades stay; anything else off (${JSON.stringify(looks)})`);

// off: the grass draws as before (no print define, no extra uniforms); the tops fly, the arc writes no A
for (const [g, o, what] of [[null, null, 'no ?ground'], ['b', '0', '?ground=b&dgGrass=0'], [null, 'b', 'dgGrass=b without ?ground=b']]) {
  as(g, o);
  const M = meadow();
  const mat = M.world.grass.mesh.material;
  const T = M.world.scorch.tops;
  const n = T.cutArc(-2, 0.3, 1, 2, 0.3, 1, false);
  ok(mat.defines?.DG_PRINT === 0 && !mat.uniforms.uDigs, `${what}: the blades are not printed (DG_PRINT 0, no print uniforms)`);
  ok(n > 50 && M.world.scorch.tornCells === 0 && T.total - T.chipped > 0, `${what}: the arc cuts ${n} blades by their bytes, writes no A (${M.world.scorch.tornCells} cells), the tops fly (${T.total - T.chipped})`);
  restore();
}

// a: the arc's cut is mown into the scorch map's A, the chips still fly, no top of a hidden blade does
for (const o of ['a', 'a2']) {
  as('b', o);
  const M = meadow();
  const T = M.world.scorch.tops;
  const n = T.cutArc(-2, 0.3, 1, 2, 0.3, 1, false);
  const sc = M.world.scorch;
  const mid = sc.tornAt(0, 1), off = sc.tornAt(0, 4);
  ok(n > 50 && sc.tornCells > 0 && mid > 0.7 && off === 0, `${o}: the arc mows its strip into A (${sc.tornCells} cells, ${mid.toFixed(2)} on the line, ${off} 3 m off it)`);
  ok(T.chipped > 0 && T.total === T.chipped, `${o}: the code chips fly (${T.chipped}), no cut top (${T.total - T.chipped})`);
  ok(T.cutArc(-2, 2.6, 1, 2, 2.6, 1, false) === 0, `${o}: a stroke over the grass mows nothing`);
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
  ok(n > 0 && T.total === T.chipped && T.chipped > 0, `${o}: the arc cuts ${n} blades, the chips fly (${T.chipped}), no cut top (${T.total - T.chipped})`);
  ok((o === 'c') === M.world.scorch.tornCells > 0, `${o}: ${o === 'c' ? 'the relief under the blades is mown in A too' : 'the cut stays in the blades\' bytes (no A)'} (${M.world.scorch.tornCells} cells)`);
  restore();
}

console.log(fails ? `\n${fails} dgGrass check(s) FAILED` : '\nall dgGrass checks passed');
process.exit(fails ? 1 : 0);
