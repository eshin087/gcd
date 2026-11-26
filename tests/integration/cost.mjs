// The frame's COST BUDGET, headless (ADR-206): every level's set is built with the real modules and what it
// costs the renderer is counted from what is built, so a change that makes a level heavier fails `npm test`
// until the budget (tests/cost-baseline.json) is raised on purpose. Nothing here is timed: the numbers are
// triangles, meshes and memory, so the same tree reads the same on every machine. (The milliseconds of a
// frame are `npm run perf`, on a real GPU.)
//
// usage: node cost.mjs <repoRoot> [scenario]
//   scenario: budget (default; also `all`) | update (writes tests/cost-baseline.json from the tree: the budget moves)
// Per level (and for the phone's share, `setQuality(0)`): what the main pass draws (visible meshes, their
// triangles, an instanced mesh counted by its instances), what the moon's shadow pass draws (the casters'
// triangles; the still map, ADR-201, redraws the still ones only when they change), the rigid batch's bones,
// the breakables, the colliders, and the memory of the geometries the set holds.
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import './shim.mjs';

const ROOT = process.argv[2];
const SCEN = process.argv[3] || 'budget';
const imp = (p) => import(pathToFileURL(`${ROOT}/${p}`).href);
const { createSharedUniforms, LAYER_CASTER, LAYER_CASTER_RIGID } = await imp('src/render/shaderLib.js');
const { rigidBones } = await imp('src/render/rigidBatch.js');
const { Colliders } = await imp('src/world/colliders.js');
const { Scorch } = await imp('src/world/scorch.js');
const { GroundFire } = await imp('src/world/fire.js');
const { Scars } = await imp('src/world/scars.js');
const { Destructibles } = await imp('src/world/destructibles.js');
const { Events } = await imp('src/core/events.js');
const { CONFIG } = await imp('src/core/config.js');
const { LightPool } = await imp('src/render/lights.js');
const { GlyphParticles } = await imp('src/render/particles.js');
const { FireField } = await imp('src/render/fireField.js');
const THREE = await import(pathToFileURL(`${ROOT}/node_modules/three/build/three.module.js`).href);
const { LEVELS } = await imp('src/levels/index.js');

const out = (...a) => process.stdout.write(a.join(' ') + '\n');
let fails = 0;
const assert = (c, m) => {
  if (!c) {
    fails++;
    out('FAIL', m);
  } else out('ok  ', m);
};
const BASE_FILE = `${ROOT}/tests/cost-baseline.json`;
/** How far over its budget a number may read before the test fails (the layouts are seeded: the counts do not jitter). */
const TOL = 0.03;
/** ... and the least slack in absolute terms, per metric (a small number needs more than 3 %). */
const SLACK = { meshes: 2, tris: 1500, shadowTris: 1500, bones: 4, breakables: 4, colliders: 6, geoMB: 0.15 };
const METRICS = Object.keys(SLACK);

const mulberry32 = (a) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const trisOf = (o) => {
  const g = o.geometry;
  if (!g) return 0;
  const cnt = g.index ? g.index.count : g.attributes.position?.count ?? 0;
  const range = g.drawRange?.count ?? Infinity;
  let t = Math.min(cnt, range) / 3;
  if (o.isInstancedMesh) t *= o.count;
  else if (g.isInstancedBufferGeometry) t *= Number.isFinite(g.instanceCount) ? g.instanceCount : 1;
  return t;
};
const bytesOf = (g) => {
  let b = g.index ? g.index.array.byteLength : 0;
  for (const k in g.attributes) b += g.attributes[k].array?.byteLength ?? 0;
  return b;
};
const visible = (o) => {
  for (let p = o; p; p = p.parent) if (p.visible === false) return false;
  return true;
};

/** What one level's set costs, counted from the real build. `phone`: the set's own phone share (setQuality(0)). */
function measure(L, phone) {
  Math.random = mulberry32(12345);
  const U = createSharedUniforms();
  const colliders = new Colliders();
  const set = L.buildSet(U, colliders);
  // the world's own wiring (world.js; tests/integration/world.mjs `build`): the breakables become the rigid batch
  const game = {
    THREE, CONFIG, U, events: new Events(), time: 0, dt: 1 / 60, fxDt: 1 / 60, state: 'boss', scene: new THREE.Scene(),
    lights: new LightPool(U), fx: { alpha: new GlyphParticles(U, { max: 3000, additive: false }), add: new GlyphParticles(U, { max: 7000, additive: true }), fire: new FireField(U, { max: 6000 }) },
    shake() {},
  };
  const world = { colliders, forest: set, gust() {}, resolve: (pos) => pos, setPusher() {}, clearPushers() {} };
  world.scorch = new Scorch(U, game);
  world.fire = new GroundFire(game, world, () => 1);
  world.scars = new Scars(game, set.scarInk);
  world.destructibles = new Destructibles(game, world, set);
  game.world = world;
  if (phone) set.setQuality?.(0);
  let meshes = 0, tris = 0, shadowTris = 0;
  const geos = new Set();
  set.group.updateMatrixWorld(true);
  set.group.traverse((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine)) return;
    if (o.geometry) geos.add(o.geometry);
    if (!visible(o)) return;
    const t = trisOf(o);
    if (o.layers.isEnabled(LAYER_CASTER) || o.layers.isEnabled(LAYER_CASTER_RIGID)) shadowTris += t;
    if (o.name === 'rigidShadow') return; // (depth only: not the main pass)
    meshes++;
    tris += t;
  });
  let bytes = 0;
  for (const g of geos) bytes += bytesOf(g);
  return {
    meshes,
    tris: Math.round(tris),
    shadowTris: Math.round(shadowTris),
    bones: rigidBones(U).count,
    breakables: set.breakables?.length ?? 0,
    colliders: colliders.circles.length,
    geoMB: +(bytes / 1048576).toFixed(2),
  };
}

function all() {
  const rows = {};
  for (const L of LEVELS) {
    rows[L.id] = measure(L, false);
    rows[`${L.id}@phone`] = measure(L, true);
  }
  return rows;
}

const table = (rows, base) => {
  const w = Math.max(...Object.keys(rows).map((k) => k.length));
  out(`${'level'.padEnd(w)}  ${METRICS.map((m) => m.padStart(12)).join(' ')}`);
  for (const [k, r] of Object.entries(rows)) {
    out(`${k.padEnd(w)}  ${METRICS.map((m) => {
      const b = base?.[k]?.[m];
      const d = b ? (r[m] - b) / b : 0;
      return (String(r[m]) + (Math.abs(d) >= 0.005 ? (d > 0 ? ' +' : ' ') + Math.round(d * 100) + '%' : '')).padStart(12);
    }).join(' ')}`);
  }
};

const UPDATE = 'node tests/integration/cost.mjs . update';

if (SCEN === 'update') {
  const rows = all();
  writeFileSync(BASE_FILE, JSON.stringify(rows, null, 2) + '\n');
  table(rows);
  out(`\nwrote ${BASE_FILE}: the cost budget now reads what the tree builds`);
  process.exit(0);
}

const SCENARIOS = {
  budget() {
    out('\n== the cost budget (tests/cost-baseline.json)');
    assert(existsSync(BASE_FILE), `tests/cost-baseline.json exists (\`${UPDATE}\` writes it)`);
    const base = existsSync(BASE_FILE) ? JSON.parse(readFileSync(BASE_FILE, 'utf8')) : {};
    const rows = all();
    table(rows, base);
    out('');
    for (const [k, r] of Object.entries(rows)) {
      const b = base[k];
      if (!b) {
        assert(false, `${k}: no budget in tests/cost-baseline.json (a new level: run \`${UPDATE}\` and commit it)`);
        continue;
      }
      const over = METRICS.filter((m) => r[m] > b[m] * (1 + TOL) + SLACK[m]);
      const line = METRICS.map((m) => `${m} ${r[m]}/${b[m]}`).join(', ');
      assert(!over.length, over.length ? `${k}: OVER BUDGET in ${over.join(', ')} (${line}). Heavier by more than ${TOL * 100} %: lighten it, or raise the budget on purpose with \`${UPDATE}\` and say why in the PR` : `${k}: within budget (${line})`);
      const under = METRICS.filter((m) => b[m] > 0 && r[m] < b[m] * 0.9 - SLACK[m]);
      if (under.length) out(`     note: ${k} is under its budget by over 10 % in ${under.join(', ')}: run \`${UPDATE}\` to lock the gain in`);
    }
    for (const k of Object.keys(base)) assert(k in rows, `${k}: a budget for a level that is gone (run update)`);
    // the phone's share is a share: it never costs more than the level whole
    for (const L of LEVELS) assert(rows[`${L.id}@phone`].tris <= rows[L.id].tris && rows[`${L.id}@phone`].shadowTris <= rows[L.id].shadowTris, `${L.id}: the phone's share draws no more than the whole level`);
  },
};

const run = SCEN === 'all' ? ['budget'] : [SCEN];
for (const s of run) {
  if (!SCENARIOS[s]) {
    out(`unknown scenario ${s} (budget | update | all)`);
    process.exit(2);
  }
  SCENARIOS[s]();
}
out(fails ? `\n${fails} FAILED` : '\nCOST OK');
process.exit(fails ? 1 : 0);
