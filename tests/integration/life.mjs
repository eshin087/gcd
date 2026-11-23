// The living world, headless (src/world/life/; `?life=`): the REAL LivingWorld and Atmosphere on every
// level's REAL set, with the real particle pools, fire field, scorch map and grass density, wired like
// src/world/world.js; the hero is a stand-in that can be walked.
// usage: node life.mjs <repoRoot> [scenario]
//   scenario: all | a comma list of `<file>.<name>` (core.off) or `<file>` (every scenario of that file)
// The scenarios live one file per piece in tests/integration/life/<piece>.mjs: each exports
//   export default { name(T) { ... }, ... }      T: the toolbox below (build, assert, out, near, ...)
import { pathToFileURL } from 'node:url';
import './shim.mjs';

const ROOT = process.argv[2];
const SCEN = process.argv[3] || 'all';
const imp = (p) => import(pathToFileURL(`${ROOT}/${p}`).href);
const THREE = await import(pathToFileURL(`${ROOT}/node_modules/three/build/three.module.js`).href);
const { CONFIG } = await imp('src/core/config.js');
const { Events } = await imp('src/core/events.js');
const { createSharedUniforms } = await imp('src/render/shaderLib.js');
const { LightPool } = await imp('src/render/lights.js');
const { GlyphParticles } = await imp('src/render/particles.js');
const { FireField } = await imp('src/render/fireField.js');
const { Colliders } = await imp('src/world/colliders.js');
const { Scorch } = await imp('src/world/scorch.js');
const { GroundFire } = await imp('src/world/fire.js');
const { meadowDensity } = await imp('src/world/grass.js');
const { Atmosphere } = await imp('src/world/atmosphere.js');
const { resolveOn } = await imp('src/world/edge.js');
const { LEVELS, applyLevel } = await imp('src/levels/index.js');
const { LivingWorld, LIFE_TUNE } = await imp('src/world/life/life.js');
const { LIFE, LIFE_PIECES, setLife, setLifeK } = await imp('src/world/life/lifeSwitch.js');

const errors = [];
console.error = (...a) => { errors.push(a.map((x) => (x?.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x))).join(' ')); };
console.warn = (...a) => { errors.push('WARN ' + a.map(String).join(' ')); };
const out = (...a) => process.stdout.write(a.join(' ') + '\n');
let fails = 0;
const assert = (c, m) => { if (!c) { fails++; out('FAIL', m); } else out('ok  ', m); };
const near = (a, b, eps = 1e-6) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps;

// Math.random is counted: nothing of the living world may draw from it (the seeded sims replay it)
const realRandom = Math.random;
let randomCalls = 0;
Math.random = () => { randomCalls++; return realRandom(); };

const WORLD0 = JSON.parse(JSON.stringify(CONFIG.world));
const LEVEL_IDS = LEVELS.map((L) => L.id);

/**
 * A level as world.js builds it, with the living world on it.
 *   build('cinderwood', 'all')                 every piece on
 *   build('ash', 'wind,litter', { k: 1.5, quality: 0.5, state: 'boss' })
 * Returns { game, world, life, set, U, level, step(sec, dt), walk(vx, vz), place(x, z), counts(), emit }.
 *   step(sec)      runs the frame: life, atmosphere, the pools (as World.update and main.js do)
 *   walk(vx, vz)   the hero moves at that velocity from now on (m/s); place(x, z) teleports him
 *   counts()       { alpha, add, fire, own, pools, spawned: { alpha, add, fire }, random }: live particles per
 *                  shared pool; `own` / `pools`: the living world's own pools (registered with the pipeline
 *                  after the set's); spawns since the build; `random`: Math.random calls made inside
 *                  life.update and life.gust (must stay 0)
 */
function build(levelId = 'cinderwood', spec = 'all', o = {}) {
  const level = LEVELS.find((L) => L.id === levelId);
  if (!level) throw new Error(`no level ${levelId}`);
  for (const k of Object.keys(CONFIG.world)) delete CONFIG.world[k];
  Object.assign(CONFIG.world, JSON.parse(JSON.stringify(WORLD0)));
  applyLevel(level);
  setLife(spec);
  setLifeK(o.k ?? 1);
  const U = createSharedUniforms();
  const events = new Events();
  const spawned = { alpha: 0, add: 0, fire: 0 };
  const checked = (pool, key, fields) => {
    const spawn = pool.spawn.bind(pool);
    pool.spawn = (r) => {
      for (const k of fields) if (r[k] !== undefined && !Number.isFinite(r[k])) throw new Error(`NaN ${key} particle ${k}`);
      spawned[key]++;
      return spawn(r);
    };
    return pool;
  };
  const F = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'life', 'size', 'sizeEnd', 'alpha', 'alphaEnd', 'rot', 'spin', 'drag', 'gravity', 'heat', 'heatEnd'];
  const own = [];
  let lifeRandom = 0;
  const game = {
    THREE, CONFIG, U, events, level, time: 0, dt: 1 / 60, fxDt: 1 / 60, state: o.state ?? 'explore', scene: new THREE.Scene(),
    lights: new LightPool(U),
    fx: {
      alpha: checked(new GlyphParticles(U, { max: 3000, additive: false }), 'alpha', F),
      add: checked(new GlyphParticles(U, { max: 7000, additive: true }), 'add', F),
      fire: checked(new FireField(U, { max: 6000 }), 'fire', F),
    },
    pipeline: { registerParticles: (p) => { own.push(p); }, registerFire() {} },
    settings: { quality: o.quality !== undefined && o.quality <= 0.5 ? 0 : 2 },
    shake() {},
  };
  const colliders = new Colliders();
  const set = level.buildSet(U, colliders);
  const world = {
    colliders, forest: set, quality: o.quality ?? 1, gusts: 0, bonfire: set.bonfire,
    gust(x, z, s = 1, r = 12) {
      if (![x, z, s, r].every(Number.isFinite)) throw new Error('NaN gust');
      this.gusts++;
      const r0 = randomCalls;
      this.life?.gust(x, z, s, r);
      lifeRandom += randomCalls - r0;
    },
    resolve: (pos, r, b, soft, who) => resolveOn(colliders, null, pos, r, b, soft, who),
    heroBound: () => CONFIG.world.playerBound ?? Infinity,
    setPusher() {}, clearPushers() {},
    impact: () => 0, ignite: () => 0,
  };
  world.scorch = new Scorch(U, game);
  // the grass density as world.js makes it (the fire's fuel; the steps' surface reads it)
  const meadow = meadowDensity(colliders, set.treeSpots, set.bare, 150, set.slabs);
  const G = set.grass ?? null;
  const density = typeof G?.density === 'function' ? (x, z) => meadow(x, z) * G.density(x, z) : meadow;
  world.fire = new GroundFire(game, world, density);
  game.world = world;
  const spawn = CONFIG.world.playerSpawn ?? { x: 0, z: 20 };
  const vel = { x: 0, z: 0 };
  game.player = { position: new THREE.Vector3(spawn.x, 0, spawn.z), radius: 0.45, alive: true, state: 'idle', yaw: Math.PI };
  const sleep = CONFIG.world.dragonSleep ?? { x: 0, z: -8 };
  game.boss = game.dragon = { position: new THREE.Vector3(sleep.x, 0, sleep.z), state: 'asleep', phase: 1, T: { radius: 0.6 } };
  world.atmosphere = new Atmosphere(game, set);
  // (a set may register a pool of its own, e.g. the throne hall's inlay: only what comes after is the living world's)
  const ownBase = own.length;
  world.life = new LivingWorld(game, world);
  const life = world.life;
  const step = (sec, dt = 1 / 60) => {
    for (let t = 0; t < sec - 1e-9; t += dt) {
      game.time += dt;
      game.dt = game.fxDt = dt;
      game.player.position.x += vel.x * dt;
      game.player.position.z += vel.z * dt;
      U.uTime.value = game.time;
      U.uFocus.value.copy(game.player.position);
      const r0 = randomCalls;
      life.update(dt);
      lifeRandom += randomCalls - r0;
      world.atmosphere.update(dt);
      world.scorch.update(dt);
      game.lights.update(dt, game.player.position);
      game.fx.alpha.update(dt, game.time);
      game.fx.add.update(dt, game.time);
      game.fx.fire.update(dt);
      for (const p of own) p.update?.(dt, game.time);
    }
  };
  const counts = () => ({
    alpha: game.fx.alpha.count, add: game.fx.add.count, fire: game.fx.fire.count,
    own: own.slice(ownBase).reduce((n, p) => n + (p.count ?? 0), 0), pools: own.length - ownBase,
    spawned: { ...spawned }, random: lifeRandom,
  });
  return {
    game, world, life, set, U, level, step, counts, own,
    walk(vx, vz) { vel.x = vx; vel.z = vz; },
    place(x, z) { game.player.position.set(x, 0, z); },
    emit: (n, d) => events.emit(n, d),
  };
}

const T = { THREE, CONFIG, LEVELS, LEVEL_IDS, LIFE, LIFE_PIECES, LIFE_TUNE, setLife, setLifeK, build, assert, out, near, imp, ROOT };

// one file per piece (its owner's): a missing or broken file fails the suite
const FILES = ['core', 'wind', 'weather', 'litter', 'steps', 'creatures', 'answer', 'air', 'arrival', 'hang'];
const S = {};
for (const f of FILES) {
  try {
    const m = await imp(`tests/integration/life/${f}.mjs`);
    for (const [n, fn] of Object.entries(m.default ?? {})) if (typeof fn === 'function') S[`${f}.${n}`] = fn;
  } catch (err) {
    fails++;
    out('FAIL', `tests/integration/life/${f}.mjs could not be loaded: ${err?.stack ?? err}`);
  }
}

const wanted = SCEN === 'all' ? Object.keys(S) : SCEN.split(',').flatMap((n) => (S[n] ? [n] : Object.keys(S).filter((k) => k.startsWith(`${n}.`))));
if (!wanted.length) { out(`unknown scenario ${SCEN}`); process.exit(2); }
for (const n of wanted) {
  out(`\n== LIFE ${n.toUpperCase()}`);
  try {
    await S[n](T);
  } catch (err) {
    fails++;
    out('FAIL', `${n} threw: ${err?.stack ?? err}`);
  } finally {
    setLife('off');
    setLifeK(1);
  }
}
if (errors.length) { fails++; out('FAIL console errors:\n  ' + errors.slice(0, 8).join('\n  ')); }
out(fails ? `\n${fails} FAILED` : '\nall life checks passed');
process.exit(fails ? 1 : 0);
