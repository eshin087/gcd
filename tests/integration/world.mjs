// The world's destruction, headless (ADR-107; ARCHITECTURE.md → "Destruction"): the REAL Colliders,
// Scorch, GroundFire, Scars and Destructibles on the REAL sets (the forest, the courtyard), wired
// like src/world/world.js; the hero and the boss are small stand-ins that record what lands on them.
// usage: node world.mjs <repoRoot> [scenario]
//   scenario: sets | floor | terrace | colossus | chip | fell | cover | fire | throw | reset | grid | body | wreck | spread | wear | wall | reach | landmarks | edge | budget | bite | slice | placed | all
// (body / budget run the REAL Dragon on the REAL forest: its body against the world, ARCHITECTURE.md
// "Destruction" → "The wyrm's body")
import { pathToFileURL } from 'node:url';
import v8 from 'node:v8';
import vm from 'node:vm';
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
const { rigidBones } = await imp('src/render/rigidBatch.js');
const { Colliders } = await imp('src/world/colliders.js');
const { Scorch } = await imp('src/world/scorch.js');
const { GroundFire } = await imp('src/world/fire.js');
const { Scars } = await imp('src/world/scars.js');
const { Destructibles, STATE, reseedBreaks } = await imp('src/world/destructibles.js');
const { BREAK, BLOW, FIRE, SCAR } = await imp('src/world/breakTuning.js');
const { createForest } = await imp('src/world/forest.js');
const { ELDER_COLLIDERS } = await imp('src/world/landmarks.js');
const ELDER_N = ELDER_COLLIDERS.length;
const { createCourtyard } = await imp('src/world/courtyard.js');
const { createThroneHall } = await imp('src/world/throneHall.js');
const { createFoxTerrace, TERRACE } = await imp('src/world/foxTerrace.js');
const { createSkybreakRing, BUTTE, RING } = await imp('src/world/skybreakRing.js');
const { createWindlessGrove } = await imp('src/world/windlessGrove.js');
// (every level the game can load, and the training room: the bite scenario walks them all, so a new
// level is checked without being named here)
const { LEVELS } = await imp('src/levels/index.js');
const { createTrainingRoom } = await imp('src/world/trainingRoom.js');
/** The Skybreak Ring's set as arena `o` (?ring=a|b|c: read when the set is built). */
const ringSet = (o) => (U, c) => {
  setLook('ring', o);
  try {
    return createSkybreakRing(U, c);
  } finally {
    setLook('ring', null);
  }
};
const { TELL, RESULT } = await imp('src/combat/rules.js');
const { Dragon } = await imp('src/entities/dragon/dragon.js');
const { TUNING: WYRM } = await imp('src/entities/dragon/tuning.js');
const { QUALITY } = await imp('src/world/breakTuning.js');
const { resolveOn } = await imp('src/world/edge.js');
const { mulberry32 } = await imp('src/core/rng.js');
const { setLook } = await imp('src/entities/enemies/duelist/lookSwitch.js');
v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc');

const errors = [];
console.error = (...a) => { errors.push(a.map((x) => (x?.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x))).join(' ')); };
console.warn = (...a) => { errors.push('WARN ' + a.map(String).join(' ')); };
const out = (...a) => process.stdout.write(a.join(' ') + '\n');
let fails = 0;
const assert = (c, m) => { if (!c) { fails++; out('FAIL', m); } else out('ok  ', m); };

/** A world like world.js builds it, on a real set, with stand-in fighters. */
function build(makeSet = createForest, density = () => 1) {
  const U = createSharedUniforms();
  const events = new Events();
  const log = [];
  const emit = events.emit.bind(events);
  events.emit = (n, d) => { log.push({ n, ...(d ?? {}) }); emit(n, d); };
  const mk = (opts) => {
    const p = new GlyphParticles(U, opts);
    const spawn = p.spawn.bind(p);
    p.spawn = (o) => {
      for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'life', 'size']) if (o[k] !== undefined && !Number.isFinite(o[k])) throw new Error(`NaN particle ${k}`);
      return spawn(o);
    };
    return p;
  };
  const game = {
    THREE, CONFIG, U, events, time: 0, dt: 1 / 60, fxDt: 1 / 60, state: 'boss', scene: new THREE.Scene(),
    lights: new LightPool(U), fx: { alpha: mk({ max: 3000, additive: false }), add: mk({ max: 7000, additive: true }), fire: new FireField(U, { max: 6000 }) },
    shakes: 0, shake(a) { if (!Number.isFinite(a)) throw new Error('NaN shake'); this.shakes++; },
  };
  const colliders = new Colliders();
  const set = makeSet(U, colliders);
  const world = {
    colliders, forest: set, gusts: 0, gust(x, z, s, r) { if (![x, z, s, r].every(Number.isFinite)) throw new Error('NaN gust'); this.gusts++; },
    resolve: (pos, r, b, soft, who) => resolveOn(colliders, world.edge ?? null, pos, r, b, soft, who), setPusher() {}, clearPushers() {},
  };
  world.scorch = new Scorch(U, game);
  world.fire = new GroundFire(game, world, density);
  world.scars = new Scars(game, set.scarInk);
  world.destructibles = new Destructibles(game, world, set);
  world.edge = world.destructibles.edge ?? null; // (as world.js wires it: edge.js)
  game.world = world;
  // the fighters: where they stand, what lands on them
  const hits = [];
  game.player = {
    position: new THREE.Vector3(0, 0, 8), radius: 0.45, alive: true, state: 'idle', invulnerable: false,
    isInvulnerable() { return this.invulnerable; },
    takeHit(h) { hits.push({ who: 'hero', ...h, from: { ...h.from } }); return RESULT.HIT; },
  };
  game.boss = game.dragon = {
    position: new THREE.Vector3(0, 0, -8), bodyCircles: [], T: { radius: 0.6 }, isTargetable: () => true,
    takeHit(h) { hits.push({ who: 'boss', ...h }); return h.damage; },
  };
  const step = (sec, dt = 1 / 60) => {
    for (let t = 0; t < sec - 1e-9; t += dt) {
      game.time += dt;
      world.destructibles.update(dt);
      world.fire.update(dt);
      world.scars.update(dt, game.time);
      world.scorch.update(dt);
      game.fx.alpha.update(dt, game.time);
      game.fx.add.update(dt, game.time);
      game.fx.fire.update(dt);
    }
  };
  return { game, world, set, D: world.destructibles, colliders, hits, log, step, U, emitRaw: emit };
}

/**
 * The REAL wyrm on the REAL forest (its body against the world: dragon.js _wreck). AI off (it faces the
 * hero and does nothing of its own). place(x, z, yaw) puts it there; air(f) holds its body f() m up
 * (the pose a flight would set, after its brain's frame); run(sec, each) steps it and the world.
 */
function wyrm() {
  const W = build();
  const { game, world } = W;
  Object.assign(game, { hitstop() {}, punch() {}, kick() {}, settings: { quality: 2 } });
  const d = new Dragon(game);
  game.boss = game.dragon = d;
  d.debug.startFight();
  d.debug.setAI(false);
  W.d = d;
  const frame = (each) => {
    game.time += 1 / 60;
    d.update(1 / 60);
    if (each) each();
    world.destructibles.update(1 / 60);
    world.fire.update(1 / 60);
    world.scars.update(1 / 60, game.time);
    world.scorch.update(1 / 60);
    game.fx.alpha.update(1 / 60, game.time);
    game.fx.add.update(1 / 60, game.time);
    game.fx.fire.update(1 / 60);
  };
  W.place = (x, z, yaw) => {
    d.position.set(x, 0, z);
    d.yaw = yaw;
    // (held there while its body settles after the teleport: TUNING.world.body.settle)
    const n = Math.ceil((WYRM.world.body.settle + 0.1) * 60);
    for (let i = 0; i < n; i++) frame(() => { d.position.set(x, 0, z); d.yaw = yaw; });
  };
  let air = null;
  const up = d.brain.update.bind(d.brain);
  d.brain.update = (dt) => {
    up(dt);
    if (!air) return;
    const a = air();
    d.pose.alt = a;
    d.pose.flap = a > 0.5 ? 0.9 : 0;
    d.pose.flapHz = 2;
  };
  W.air = (f) => (air = f);
  W.run = (sec, each) => {
    for (let t = 0; t < sec - 1e-9; t += 1 / 60) frame(each);
  };
  return W;
}

const S = {
  // ---------------------------------------------------------------- the sets list their breakables
  sets() {
    for (const [name, make, kinds] of [['forest', createForest, ['tree', 'deadTree', 'stone', 'boulder', 'flagstone', 'bone']], ['courtyard', createCourtyard, ['pillar', 'lantern']], ['throne', createThroneHall, ['shard', 'slab', 'hover', 'swords', 'banner', 'cairn', 'cart']], ['ring a', ringSet('a'), ['tile', 'post', 'butte', 'butteTop', 'banner', 'mud', 'hoodoo']], ['ring b', ringSet('b'), ['tile', 'post', 'butte', 'butteTop', 'terrace', 'banner']], ['ring c', ringSet('c'), ['tile', 'post', 'butte', 'butteTop', 'spire', 'cairn']], ['grove', createWindlessGrove, ['bamboo', 'graveSword', 'paving', 'flagstone', 'stele', 'lantern', 'boulder', 'post']]]) {
      const { D, set, colliders, U } = build(make);
      const L = D.list;
      // (Cinderwood: 664 since every tree of the wall and the landmarks break, 2026-11-16; 183 on 2026-11-15,
      // 80 before. The duelists' arenas break everything but their landmarks since 2026-11-16: the
      // courtyard 78 → 456 (293 of them its floor's slabs), the crater 36 → 222 (105 of its floor's plates); 255 on 2026-11-22, its felled trunks
      // swapped for the challengers' graves, banners and carts round it)
      const [lo, hi] = { forest: [20, 760], courtyard: [380, 520], throne: [180, 280], 'ring a': [1, 5000], 'ring b': [1, 5000], 'ring c': [1, 5000], terrace: [300, 520], grove: [420, 900] }[name]; // (the grove: 788 since ADR-151's clumps, 2026-11-22; 536 before)
      assert(L.length >= lo && L.length <= hi, `${name}: ${L.length} breakables (${lo}..${hi})`);
      for (const k of kinds) assert(L.some((b) => b.kind === k), `${name}: has a breakable ${k}`);
      if (name === 'forest') {
        // every tree of the forest breaks, out to its edge (2026-11-16: it was those within 42 m): the tree
        // mesh holds nothing but the trees' and the Cinder Tree's runs
        const trees = L.filter((b) => b.kind === 'tree' || b.kind === 'deadTree');
        const treeMesh = set.group.getObjectByName('trees');
        const inRuns = L.filter((b) => b.ranged && b.body.mesh === treeMesh).reduce((a, b) => a + b.body.count, 0);
        assert(trees.length >= 500 && Math.max(...trees.map((b) => Math.hypot(b.x, b.z))) > 72 && inRuns === treeMesh.geometry.attributes.position.count, `forest: every tree breaks (${trees.length}; the farthest ${Math.max(...trees.map((b) => Math.hypot(b.x, b.z))).toFixed(1)} m), all ${inRuns} vertices of the tree mesh are pieces'`);
        assert(trees.every((b) => b.ranged && b.body.parts >= 2 && b.order.length >= 1) && trees.filter((b) => b.wall).length >= 440, `forest: a tree is a range piece in parts that wears down; ${trees.filter((b) => b.wall).length} of them are the wall's (beyond ${BREAK.wall.from} m)`);
        assert(L.every((b) => b.mat !== 'wood' || b.def.soft === false || b.colliders.every((c) => c.soft === true)), 'forest: the trunks of breakable wood are soft colliders (the wyrm ploughs through them; not the Cinder Tree\'s)');
      }
      assert(L.every((b) => Number.isFinite(b.x + b.z + b.r + b.h) && b.r > 0 && b.h > 0 && b.hp > 0), `${name}: every breakable has a footprint, a height and structure`);
      assert(L.every((b) => b.colliders.every((c) => colliders.circles.includes(c))), `${name}: their colliders are the world's own circles`);
      // (a floor slab or flagstone, a 'range' piece, is no scene node until a boss lifts it: 2026-11-16, the scene graph's per-frame cost)
      assert(L.every((b) => (b.def.look === 'range' ? !b.node.parent : b.node.parent === D.pieces) && b.body.geometry.attributes.position.count > 0), `${name}: each has its own node and body (a floor slab's node joins the pieces' tree only when lifted)`);
      // nothing standing costs the scene graph a frame: the pieces are a tree outside the scene (the
      // batch reads their matrices), only the batch's draw meshes hang in it
      let inScene = 0, auto = 0;
      D.root.traverse(() => inScene++);
      D.pieces.traverse((o) => { if (o !== D.pieces && o.matrixAutoUpdate) auto++; });
      assert(!D.pieces.parent && inScene <= 4 && auto === 0, `${name}: the breakables put ${inScene} node(s) in the scene (the batch's meshes); their own tree is outside it and none of its nodes auto-updates (${auto})`);
      assert(D.root.parent === set.group, `${name}: the breakables hang under the set's group (the Lab hides them with it)`);
      // nothing breakable is lost from the spatial grid: every piece sits in exactly one cell
      const seen = new Int32Array(L.length);
      for (const i of D._g.items) seen[i]++;
      assert(seen.every((k) => k === 1), `${name}: every one of the ${L.length} pieces is in the grid once`);
      const bones = rigidBones(U);
      // (the pieces, their stumps and the wreckage pools, BREAK.wreck: 88 bones; with the hero ~140 and a
      // boss ~180 the 1023 slots keep ~200 spare. Cinderwood measured 368 on 2026-11-15, 144 before; its
      // trees and landmarks are range pieces since 2026-11-16 and take none: 140)
      // (2026-11-16, the arenas break: the courtyard 401 (its far trees and stumps, the colossi, the big
      // blocks' pool), the crater 257; a floor slab is no bone: it is a run of its set's paving mesh)
      assert(D.batch.meshes.length >= 1 && D.batch.meshes.length <= 2 && bones.count <= 460, `${name}: drawn in ${D.batch.meshes.length} batch(es), ${bones.count} bones (<= 460 of 1023)`);
      // a body's geometry sits round its own base: the node carries the place (a rigid piece's)
      const b = L.find((o) => o.topples && !o.ranged);
      b.body.geometry.computeBoundingBox();
      const bb = b.body.geometry.boundingBox;
      assert(Math.abs((bb.min.x + bb.max.x) / 2) < 3 && Math.abs((bb.min.z + bb.max.z) / 2) < 3 && bb.min.y > -0.6, `${name}: a body's geometry is laid out round its base`);
      out(`     ${name}: ${L.length} breakables: ` + [...new Set(L.map((o) => o.kind))].map((k) => `${k} ${L.filter((o) => o.kind === k).length}`).join(', ') + `; ${colliders.circles.length} colliders`);
    }
  },

  // ---------------------------------------------------------------- the duelists' floors break (world/floor.js, BREAK.floor)
  floor() {
    const C = build(createCourtyard);
    const { D, log, game, step } = C;
    const F = D.floor, FL = BREAK.floor;
    const crackMesh = C.set.group.getObjectByName('pavingCracked'), brokenMesh = C.set.group.getObjectByName('pavingBroken');
    assert(F.length >= 250 && F.every((b) => b.def.look === 'range' && b.kind === 'flagstone' && b.lift === FL.lift && !b.colliders.length && !b.cover && !b.topples && b.crack && b.stub), `the courtyard's paving, steps and path: ${F.length} slabs, each a range piece with a cracked and a broken look, lift ${FL.lift}, no collider, no cover`);
    assert(crackMesh && brokenMesh && !crackMesh.visible && !brokenMesh.visible && !crackMesh.layers.isEnabled(1), 'whole, the floor draws as it did: the cracked and the broken meshes are hidden (no draw call) and cast no shadow');
    // a cut cracks the slab under it
    const s = F.reduce((a, b) => (Math.hypot(b.x, b.z - 2) < Math.hypot(a.x, a.z - 2) ? b : a));
    const pos = s.body.geometry.attributes.position;
    D.strike(s.x, s.z, 1.3, 0.3, { kind: BLOW.CUT, by: 'boss', src: D.swing() });
    assert(s.state === STATE.INTACT && s.cracked && !s.body.visible && s.crack.visible && crackMesh.visible && pos.array[s.body.start * 3 + 1] < -1, `a duelist's cut (0.3) on it: it holds (${s.hp.toFixed(2)} of ${s.hpMax}) and shows cracked (its slab folds away, its pieces show)`);
    // a heavy blow breaks the slab under it and cracks its neighbours, in one sound and no shake
    const s2 = F.reduce((a, b) => (Math.hypot(b.x - 6, b.z + 4) < Math.hypot(a.x - 6, a.z + 4) ? b : a));
    const n0 = log.length, sh = game.shakes;
    const hit = D.strike(s2.x, s2.z, 1.3, 0.9, { kind: BLOW.BLUNT, by: 'boss', src: D.swing() }); // (a red overhead: 24 x 1.25 / 40 = 0.75 .. 0.94)
    const near = F.filter((b) => b !== s2 && Math.hypot(b.x - s2.x, b.z - s2.z) < 1.3 + b.r);
    const ev = log.slice(n0).filter((x) => x.n === 'world:impact');
    assert(s2.state === STATE.BROKEN && s2.stub.visible && brokenMesh.visible && near.some((b) => b.cracked) && near.filter((b) => b.state === STATE.BROKEN).length <= 2, `a heavy red blow (0.9 blunt, r 1.3) breaks the slab under it and cracks ${near.filter((b) => b.cracked).length} of its ${near.length} neighbours (${near.filter((b) => b.state === STATE.BROKEN).length} broken)`);
    assert(hit >= 3 && ev.length === 1 && game.shakes === sh, `it struck ${hit} slabs: one world:impact for them all (${ev.length}), no camera shake of their own`);
    // a blade's edge above the floor passes over it; one drawn along it bites less
    const s3 = F.reduce((a, b) => (Math.hypot(b.x + 6, b.z + 6) < Math.hypot(a.x + 6, a.z + 6) ? b : a));
    assert(D.strike(s3.x, s3.z, 0.5, 0.5, { y: 1, src: D.swing() }) === 0, 'a blow at waist height over a slab misses it');
    const h3 = s3.hp;
    D.sweep(s3.x - 1, s3.z, s3.x + 1, s3.z, 0.3, 0.5, { kind: BLOW.BLUNT, y: 0, src: D.swing() });
    assert(near0(h3 - s3.hp, 0.5 * FL.sweep), `an edge drawn along it takes ${FL.sweep} of the blow (${(h3 - s3.hp).toFixed(2)})`);
    // where a terrain move finds floor to tear up: the grid, nearest first; the Void's and the wyrm's picks never see it
    const out = [];
    const n = D.floorNear(0, 0, 4, out, { max: 6 });
    const scan = F.filter((b) => b.state === STATE.INTACT && Math.hypot(b.x, b.z) <= 4).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)).slice(0, 6);
    assert(n === scan.length && out.every((b, i) => b === scan[i]), `floorNear(0, 0, 4) gives the ${n} intact slabs nearest the point, as a full scan does`);
    D.floorNear(0, 0, 4, out, { whole: true });
    assert(out.every((b) => !b.cracked) && D.nearest(0, 0, { maxDist: 30, lift: 2 })?.floor !== true && D.nearest(0, 0, { maxDist: 30 })?.floor !== true && D.nearest(0, 0, { maxDist: 30, lift: 3 })?.floor === true, '`whole` leaves the cracked out; nearest() gives floor only to a caller that asks for lift 3 (or its kind)');
    // a slab torn out: its hole shows, a block of prop art in the hands, shards where it lands
    const t = out[0];
    // (wreckage.js KIND.SHARDS: 5 since the merge with ADR-120, whose bone heaps took 3, which its REACH check reads)
    const w0 = D.wreck.live.filter((x) => x.kind === 5).length;
    assert(D.take(t) && t.state === STATE.HELD && !t.body.visible && t.stub.visible && t.held?.visible && t.held.parent === t.pivot, 'take(): a slab torn out of the floor leaves its hole; a block of prop art is what he holds');
    D.carry(t, t.x, 2, t.z);
    D.throwTo(t, t.x + 6, t.z, { time: 0.5 });
    step(1);
    assert(t.state === STATE.GONE && !t.held && D.wreck.live.filter((x) => x.kind === 5).length === w0 + 1, 'thrown, it lands as flat shards (wreckage); its block goes back to the pool');
    // the reset: every slab whole again, the meshes of remains hidden
    D.reset();
    assert(F.every((b) => b.state === STATE.INTACT && b.body.visible && !b.cracked && !b.crack.visible && !b.stub.visible) && !crackMesh.visible && !brokenMesh.visible && D._carry.every((m) => !m.visible), 'the reset: every slab whole, nothing cracked, the meshes of remains hidden again');
    // the other look builds the same pieces
    setLook('floor', 'b');
    const B2 = build(createCourtyard);
    setLook('floor', null);
    assert(B2.D.floor.length === F.length && B2.set.group.getObjectByName('pavingBroken'), `?floor=b: the same ${B2.D.floor.length} slabs, broken into tilted shards`);
    // the crater: its plates
    const T = build(createThroneHall);
    const TF = T.D.floor;
    assert(TF.length >= 90 && TF.some((b) => b.kind === 'plate' && b.hpMax === FL.plate) && TF.some((b) => b.kind === 'flagstone' && b.hpMax === FL.hp), `the crater: ${TF.length} plates (${TF.filter((b) => b.kind === 'plate').length} big ones 'plate', hp ${FL.plate}; the rest 'flagstone', hp ${FL.hp})`);
    // Cinderwood's flagstone shards: hidden until one is smashed (a draw call less, nothing else changes)
    const Fo = build();
    assert(!Fo.set.group.getObjectByName('flagstoneShards').visible, "Cinderwood's flagstone shards are hidden until one is smashed");
  },

  // ---------------------------------------------------------------- the Skybreak Ring: its floor, its buttes, its light (world/skybreakRing.js)
  ring() {
    const H = RING.half;
    for (const o of ['a', 'b', 'c']) {
      const W = build(ringSet(o));
      const { D, set, colliders, game, step, U } = W;
      const F = D.floor, tiles = F.filter((b) => b.kind === 'tile');
      let area = 0;
      for (const s of set.slabs) {
        if (Math.abs(s.x) > H || Math.abs(s.z) > H) continue;
        let a = 0;
        for (let k = 0; k < s.outline.length; k++) {
          const p = s.outline[k], q = s.outline[(k + 1) % s.outline.length];
          a += (p[0] * q[1] - q[0] * p[1]) / 2;
        }
        area += Math.abs(a);
      }
      assert(set.option === o && tiles.length >= 350 && tiles.every((b) => Math.abs(b.x) <= H && Math.abs(b.z) <= H && b.def.look === 'range' && b.lift === BREAK.floor.lift && !b.colliders.length) && area > 0.8 * (2 * H) ** 2, `${o}: the ring is ${tiles.length} breakable floor slabs ('tile'), ${((100 * area) / (2 * H) ** 2).toFixed(0)} % of its ${2 * H} m square paved`);
      const near = [];
      const nn = D.floorNear(0, 0, 6, near, { kind: 'tile', max: 40 });
      assert(nn >= 30, `${o}: ${nn} tiles within 6 m of the centre for his terrain moves (floorNear, kind 'tile')`);
      // nothing tall on the near side (ADR-112's rule): no breakable south of z 6 over 3.2 m
      const tall = D.list.filter((b) => !b.floor && b.z > 6 && b.y0 + b.h > 3.2 && Math.abs(b.x) < 24 && b.z < 40);
      assert(tall.length === 0, `${o}: nothing over 3.2 m stands south of z 6 near the fight (${tall.map((b) => `${b.kind} ${b.x.toFixed(0)},${b.z.toFixed(0)}`).join(' ')})`);
      // the buttes: tops standing on their feet (two-stage), a beam takes one
      const tops = D.list.filter((b) => b.kind === 'butteTop');
      assert(tops.length >= 4 && tops.every((t) => t.base?.top === t && t.y0 > 2 && t.hpMax === BUTTE.top && t.base.hpMax === Infinity && t.base.cover && t.base.colliders.length === 1), `${o}: ${tops.length} buttes, each a top (structure ${BUTTE.top}, standing ${Math.min(...tops.map((t) => t.y0)).toFixed(1)} - ${Math.max(...tops.map((t) => t.y0)).toFixed(1)} m up) on a foot that only chips`);
      const t = tops.reduce((a, b) => (Math.hypot(b.x, b.z) < Math.hypot(a.x, a.z) ? b : a));
      const L = Math.hypot(t.x, t.z), ux = t.x / L, uz = t.z / L;
      let ticks = 0;
      // a beam from the centre through it: 1.5 a tick (BLAST), a tick every 0.2 s, at chest height
      while (t.state === STATE.INTACT && ticks < 30) {
        D.sweep(ux * 2, uz * 2, ux * 40, uz * 40, 1.7, 1.5, { kind: BLOW.BLAST, by: 'boss', y: 1.2, dx: ux, dz: uz, src: D.swing() });
        step(0.2);
        ticks++;
      }
      assert(t.state !== STATE.INTACT && ticks <= 3, `${o}: a beam swept through a butte's foot (1.5 a tick, blast) takes its top in ${ticks} ticks (${(ticks * 0.2).toFixed(1)} s)`);
      if (o === 'c') assert(t.state === STATE.BROKEN && !t.topples, 'c: a butte rising out of the depths bursts where it stands (nothing falls to a ground that is not there)');
      else assert(t.state === STATE.FALLING && t.dx * t.x + t.dz * t.z > 0, `${o}: the top topples away from the ring (outward; red to a hero standing under it)`);
      step(2);
      assert(t.base.state === STATE.INTACT && t.base.node.parent, `${o}: its foot still stands`);
      // the hero's blows: a heavy cut (0.5) a time
      const t2 = tops.find((x) => x !== t);
      let cuts = 0;
      while (t2.state === STATE.INTACT && cuts < 100) {
        D.strike(t2.x - t2.r, t2.z, 0.6, 0.5, { kind: BLOW.CUT, by: 'player', src: D.swing() });
        step(0.2);
        cuts++;
      }
      assert(cuts >= 10, `${o}: the hero's heavy cuts (0.5) take ${cuts} to bring a top down`);
      // the light by form
      const A = set.ambience;
      A.setup(game);
      const run = (sec) => {
        for (let s2 = 0; s2 < sec; s2 += 1 / 30) A.update(1 / 30, game);
      };
      game.dragon.phase = 1;
      run(1);
      const dusk = [U.uMoonColor.value.r, U.uMoonColor.value.g, U.uMoonColor.value.b, U.uAmbient.value.r + U.uAmbient.value.g + U.uAmbient.value.b];
      game.dragon.phase = 2;
      run(6);
      const goldAmb = U.uAmbient.value.r + U.uAmbient.value.g + U.uAmbient.value.b;
      game.dragon.phase = 3;
      run(6);
      const st = A.state, stormMoon = U.uMoonColor.value.clone(), stormAmb = U.uAmbient.value.r + U.uAmbient.value.g + U.uAmbient.value.b;
      A.flare(1);
      A.update(1 / 60, game);
      const flash = U.uMoonColor.value.b;
      game.dragon.phase = 1;
      A.update(1 / 60, game);
      const back = A.state;
      assert(goldAmb > dusk[3] && stormAmb < dusk[3] && stormMoon.b > stormMoon.r && dusk[0] > dusk[2] && st.w[2] > 0.95 && flash > stormMoon.b * 3 && back.w[0] === 1 && back.flash === 0, `${o}: the light by form: dusk (warm moon), golden (ambient ${dusk[3].toFixed(3)} → ${goldAmb.toFixed(3)}), storm (cold, ${stormAmb.toFixed(3)}); a flare lights the ring (moon blue ${stormMoon.b.toFixed(2)} → ${flash.toFixed(2)}); a reset snaps back to the dusk`);
      if (o === 'c') {
        assert(set.groundY < -20, `c: the badlands lie ${-set.groundY} m below the crown (groundY)`);
        // walking out to the rim: the colliders hold him on the crown
        let worst = 0;
        for (let a = 0; a < 16; a++) {
          const dx = Math.cos((a / 16) * 2 * Math.PI), dz = Math.sin((a / 16) * 2 * Math.PI);
          const p = new THREE.Vector3(0, 0, 0);
          for (let i = 0; i < 160; i++) {
            p.x += dx * 0.3;
            p.z += dz * 0.3;
            colliders.resolve(p, 0.45, 40);
          }
          worst = Math.max(worst, Math.hypot(p.x, p.z) > 36 ? 99 : 0);
          if (!set.group.userData.rim) worst = 99;
          else {
            const rim = set.group.userData.rim;
            let c = false;
            for (let i = 0, j = rim.length - 1; i < rim.length; j = i++) if (rim[i][1] > p.z !== rim[j][1] > p.z && p.x < ((rim[j][0] - rim[i][0]) * (p.z - rim[i][1])) / (rim[j][1] - rim[i][1]) + rim[i][0]) c = !c;
            if (!c) worst = Math.max(worst, 1);
          }
        }
        assert(worst === 0, 'c: a hero walking out in 16 ways is held on the crown by its rim');
      }
    }
  },

  // ---------------------------------------------------------------- a colossus comes down in two stages
  colossus() {
    const C = build(createCourtyard);
    const { D, log, game, hits, step, colliders } = C;
    const tops = D.list.filter((b) => b.kind === 'colossus' && b.base), legs = D.list.filter((b) => b.kind === 'colossus' && b.top);
    const CO = BREAK.colossus;
    assert(tops.length === 2 && legs.length === 2 && legs.every((l) => l.top?.base === l && l.cover && !l.topples && l.colliders.length >= 1) && tops.every((t) => t.topples && t.y0 > 4 && !t.colliders.length && t.hpMax === CO.top), `two colossi, each an upper half (stands ${tops[0]?.y0.toFixed(1)} m up, ${tops[0]?.h.toFixed(1)} m tall, structure ${CO.top}) on its legs (cover, its plinth's collider)`);
    const head = D.list.find((b) => b.kind === 'boulder' && Math.hypot(b.x - 15.6, b.z - 7.8) < 4);
    assert(head && head.lift === 1 && head.colliders.length === 1, 'the fallen head of the broken one is a boulder');
    const top = tops[0], leg = top.base;
    // blows on the legs wear the upper half down
    const hp0 = top.hp, lhp0 = leg.hp;
    D.strike(leg.x + 1.6, leg.z, 0.5, 0.6, { kind: BLOW.BLUNT, by: 'player', src: D.swing() });
    assert(top.hp < hp0 && leg.hp === lhp0, `a blow at its feet takes from the upper half (${hp0.toFixed(1)} → ${top.hp.toFixed(1)}); the legs take nothing while it stands`);
    // it falls: the world's falling rule, from its cut, out past the plinth
    const dx = 1, dz = 0, mid = CO.off + top.h * 0.5;
    game.player.position.set(top.x + dx * mid, 0, top.z + 0.3);
    game.boss.position.set(top.x - 20, 0, top.z);
    const n0 = log.length;
    D.topple(top, dx, dz, 'boss');
    step(1 / 60);
    const tell = log.slice(n0).find((x) => x.n === 'combat:tell');
    assert(tell && tell.source === 'world' && tell.tell === TELL.RED && near0(tell.impactIn, CO.fall - 1 / 60, 0.05) && Math.hypot(tell.x - (top.x + dx * (CO.off + top.h * 0.55)), tell.z - top.z) < 0.5, `it tells red (the world's falling piece), ${tell?.impactIn?.toFixed(2)} s before it lands, at the middle of its strip`);
    D.strike(leg.x + 1.6, leg.z, 0.5, 9, { kind: BLOW.BLUNT, by: 'player', src: D.swing() });
    assert(leg.state === STATE.INTACT && leg.hp === lhp0, 'while it falls the legs take nothing');
    let tFlash = -1;
    for (let i = 0; i < 200 && top.state === STATE.FALLING; i++) {
      step(1 / 60);
      if (tFlash < 0 && log.slice(n0).some((x) => x.n === 'combat:flash')) tFlash = game.time;
    }
    const h = hits.find((x) => x.who === 'hero');
    assert(top.state === STATE.BROKEN && game.time - tFlash >= 0.25 && game.time - tFlash <= 0.36 && h && h.tell === TELL.RED && h.blockable === false && h.damage <= BREAK.topple.damage * 1.3 + 1e-6, `it lands ${CO.fall} s on (its flash ${(game.time - tFlash).toFixed(2)} s before); the hero under it takes one red blow of ${h?.damage?.toFixed(1)}`);
    // (wreckage.js KIND.BLOCK: 4 since the merge with ADR-120, whose bone heaps took 3, which its REACH check reads)
    const blocks = D.wreck.live.filter((x) => x.kind === 4);
    assert(blocks.length >= CO.blocks - 1 && blocks.every((b) => b.x > top.x + CO.off - 1 && b.x < top.x + CO.off + top.h + 1.5), `it lies as ${blocks.length} big blocks along where it fell (wreckage, no collider)`);
    assert(leg.state === STATE.INTACT && D.coverAt(leg.x - 4, leg.z, leg.x + 4, leg.z, 0.2) === leg, 'its legs stand: cover');
    // then the legs
    const c0 = colliders.circles.length;
    D.strike(leg.x + 1.6, leg.z, 0.6, 9, { kind: BLOW.BLUNT, by: 'boss', src: D.swing() });
    assert(leg.state === STATE.BROKEN && leg.stub.visible && colliders.circles.includes(leg.stubCollider) && D.wreck.live.filter((x) => x.kind === 4).length > blocks.length, `the legs break in their turn: the plinth is left (its own collider), more blocks round it (${colliders.circles.length - c0 + leg.colliders.length} circle(s) changed)`);
    // the hero fells the other one onto the boss
    const t2 = tops[1];
    game.boss.position.set(t2.x + (CO.off + t2.h * 0.5), 0, t2.z);
    D.topple(t2, 1, 0, 'player');
    step(2);
    const bh = hits.find((x) => x.who === 'boss');
    assert(bh && bh.damage >= BREAK.topple.bossDamage * 0.6, `felled by the hero onto the boss: ${bh?.damage?.toFixed(0)} damage`);
    D.reset();
    assert(tops.every((t) => t.state === STATE.INTACT && t.body.visible && t.node.position.y === t.y0 && t.pivot.position.lengthSq() === 0) && legs.every((l) => l.state === STATE.INTACT && !l.stub.visible), 'the reset: both stand whole again');
  },

  // ---------------------------------------------------------------- a blow chips; a hard one breaks
  chip() {
    const { D, world, log, game, step } = build();
    const s = D.list.find((b) => b.kind === 'stone' && b.topples);
    const hp0 = s.hp;
    const src = D.swing();
    const n1 = D.strike(s.x, s.z + s.r, 0.4, 0.3, { kind: BLOW.CUT, by: 'player', src });
    assert(n1 === 1 && s.state === STATE.INTACT && near(s.hp, hp0 - 0.3 * BREAK.mats.stone.take.cut, 1e-6), `a cut of 0.3 on a standing stone takes ${(0.3 * BREAK.mats.stone.take.cut).toFixed(3)} of its ${hp0.toFixed(2)} (it holds)`);
    assert(log.some((e) => e.n === 'world:impact' && e.kind === 'chip' && e.mat === 'stone' && e.by === 'player' && e.id === s.id), `world:impact { kind: 'chip', mat: 'stone', by: 'player' }`);
    assert(world.scars.count >= 1 && game.fx.alpha.count > 0, `it leaves a nick (${world.scars.count} mark(s)) and throws chips (${game.fx.alpha.count} glyphs)`);
    assert(D.strike(s.x, s.z + s.r, 0.4, 0.3, { kind: BLOW.CUT, by: 'player', src }) === 0 && near(s.hp, hp0 - 0.3 * BREAK.mats.stone.take.cut, 1e-6), 'the same swing strikes a piece once');
    const hp1 = s.hp;
    step(0.3);
    const light = (BREAK.scratch * 0.8) / BREAK.mats.stone.take.cut;
    D.strike(s.x, s.z + s.r, 0.4, light, { kind: BLOW.CUT, by: 'player', src: D.swing() });
    assert(s.hp === hp1, `a light touch on stone (${(light * BREAK.mats.stone.take.cut).toFixed(3)} < the scratch ${BREAK.scratch}) only marks it`);
    assert(D.strike(0, 0, 0.4, 5, { src: D.swing() }) === 0 && D.strike(NaN, 0, 1, 1) === 0 && D.sweep(0, 0, Infinity, 0, 1, 1) === 0, 'a blow on empty ground strikes nothing; a non-finite one is ignored');
    // height: a blow that passes over a low piece misses it
    const low = D.list.find((b) => b.kind === 'boulder' && b.h < 1.1);
    assert(D.strike(low.x, low.z, 0.3, 1, { y: low.h + 0.8, src: D.swing() }) === 0 && D.strike(low.x, low.z, 0.3, 0.2, { y: 0.5, src: D.swing() }) === 1, 'a blow above a low boulder passes over it; one at its height lands');
    // `only`: the wyrm's body goes through wood, not stone
    const t = D.list.find((b) => b.kind === 'deadTree');
    assert(D.strike(s.x, s.z, 1, 9, { only: 'wood', src: D.swing() }) === 0 && D.strike(t.x, t.z, 1, 0.2, { only: 'wood', src: D.swing() }) === 1, '`only: wood` leaves stone alone');
    // a short piece shatters where it stands; bronze only rings
    const C = build(createCourtyard);
    const lan = C.D.list.find((b) => b.kind === 'lantern');
    C.D.strike(lan.x, lan.z, 0.5, 9, { kind: BLOW.BLUNT, by: 'boss', src: C.D.swing() });
    assert(lan.state === STATE.BROKEN && !lan.body.visible && lan.stub.visible && C.log.some((e) => e.n === 'world:impact' && e.kind === 'break'), 'a lantern struck hard shatters where it stands: its base is left');
    assert(lan.colliders.every((c) => !C.colliders.circles.includes(c)) && C.colliders.circles.includes(lan.stubCollider), 'its collider is gone; the base has a smaller one');
    const bell = C.D.list.find((b) => b.kind === 'bell');
    C.D.strike(bell.x, bell.z, 1, 50, { src: C.D.swing() });
    assert(bell.state === STATE.INTACT && C.log.some((e) => e.n === 'world:impact' && e.kind === 'chip' && e.mat === 'metal'), 'the bronze bell only rings (world:impact chip, metal)');
  },

  // ---------------------------------------------------------------- a tall piece falls; what is under it is hit
  fell() {
    const { D, world, log, game, hits, colliders, step } = build();
    // (one inside the clearing: a tree of the wall falls away from the arena, the `wall` scenario)
    const t = D.list.find((b) => b.kind === 'deadTree' && !b.wall);
    const dx = 0.6, dz = 0.8;
    // the hero stands where it will land
    game.player.position.set(t.x + dx * t.h * 0.6, 0, t.z + dz * t.h * 0.6);
    game.boss.position.set(t.x - 20, 0, t.z);
    D.strike(t.x - dx * 0.3, t.z - dz * 0.3, 0.5, 9, { kind: BLOW.BLUNT, by: 'boss', dx, dz, src: D.swing() });
    assert(t.state === STATE.FALLING && t.colliders.every((c) => !colliders.circles.includes(c)), 'a dead tree struck hard starts to fall; its collider is gone at once');
    step(1 / 60);
    const tell = log.find((e) => e.n === 'combat:tell');
    assert(tell && tell.source === 'world' && tell.tell === TELL.RED && tell.hazard === true && tell.impactIn >= 0.5, `a boss-felled piece tells red: combat:tell, source 'world', impact in ${tell?.impactIn?.toFixed(2)} s (>= 0.5)`);
    let tFlash = -1, tLand = -1;
    for (let i = 0; i < 200 && t.state === STATE.FALLING; i++) {
      step(1 / 60);
      if (tFlash < 0 && log.some((e) => e.n === 'combat:flash')) tFlash = game.time;
    }
    tLand = game.time;
    assert(t.state === STATE.BROKEN && tFlash > 0 && tLand - tFlash >= 0.25 && tLand - tFlash <= 0.36, `its flash comes ${(tLand - tFlash).toFixed(2)} s before it lands (0.25 .. 0.36)`);
    const h = hits.find((x) => x.who === 'hero');
    assert(hits.length === 1 && h && h.tell === TELL.RED && h.blockable === false && h.parryable === false && h.knockdown === true && h.kind === 'crush', 'the hero under it takes one red, unblockable blow that knocks him down');
    assert(h && h.damage >= BREAK.topple.damage * 0.6 - 1e-6 && h.damage <= BREAK.topple.damage * 1.3 + 1e-6, `... of ${h?.damage?.toFixed(1)} (${(BREAK.topple.damage * 0.6).toFixed(1)} .. ${(BREAK.topple.damage * 1.3).toFixed(1)})`);
    assert(!t.body.visible && t.stub.visible && colliders.circles.includes(t.stubCollider), 'its crown comes apart where it lands; the stump stands, with a collider');
    assert(D.wreck.live.some((e) => e.kind === 0 && Math.hypot(e.x - t.x, e.z - t.z) < 1), 'its trunk lies where it fell (wreckage)');
    assert(log.some((e) => e.n === 'world:impact' && e.kind === 'topple') && log.some((e) => e.n === 'world:impact' && e.kind === 'crash'), 'world:impact topple, then crash');
    assert(world.scars.count > 4 && game.shakes > 0 && world.gusts > 0, `the ground is cracked and littered (${world.scars.count} marks), the camera shakes, the grass is blown`);
    // out from under it: nothing
    const t2 = D.list.find((b) => b.kind === 'deadTree' && b.state === STATE.INTACT && !b.wall);
    game.player.position.set(t2.x - 8, 0, t2.z);
    D.topple(t2, 1, 0, 'boss');
    step(2);
    assert(t2.state === STATE.BROKEN && hits.length === 1, 'a hero out from under it is not hit');
    // the hero fells one onto the boss: the boss is hit, the hero never
    const t3 = D.list.find((b) => b.kind === 'deadTree' && b.state === STATE.INTACT && !b.wall);
    game.boss.position.set(t3.x + t3.h * 0.6, 0, t3.z);
    game.player.position.set(t3.x + t3.h * 0.5, 0, t3.z + 0.3);
    D.strike(t3.x - 0.3, t3.z, 0.5, 9, { kind: BLOW.BLUNT, by: 'player', dx: 1, dz: 0, src: D.swing() });
    const before = log.filter((e) => e.n === 'combat:tell').length;
    step(2);
    const bh = hits.find((x) => x.who === 'boss');
    assert(bh && bh.exact === true && bh.heavy === true && bh.damage >= BREAK.topple.bossDamage * 0.6 && bh.posture >= BREAK.topple.bossPosture * 0.6, `a piece the hero fells onto the boss deals ${bh?.damage?.toFixed(0)} damage and ${bh?.posture?.toFixed(0)} posture (exact, heavy)`);
    assert(hits.filter((x) => x.who === 'hero').length === 1 && log.filter((e) => e.n === 'combat:tell').length === before, 'the hero is never hit by what he felled, and it tells nothing');
    // a piece that falls on another breaks or chips it
    const C = build(createCourtyard);
    const P = C.D.list.filter((b) => b.kind === 'pillar' && b.topples);
    let pair = null;
    for (const a of P) for (const b of C.D.list) if (a !== b && b.state === STATE.INTACT && !pair) { const d = Math.hypot(a.x - b.x, a.z - b.z); if (d > 1.5 && d < a.h - 0.3) pair = [a, b]; }
    if (pair) {
      const [a, b] = pair, l = Math.hypot(b.x - a.x, b.z - a.z), hp = b.hp;
      C.D.topple(a, (b.x - a.x) / l, (b.z - a.z) / l, 'world');
      C.step(2.5);
      assert(b.hp < hp || b.state !== STATE.INTACT, `a pillar that falls on a ${b.kind} strikes it`);
    } else out('     (no pillar with a neighbour in its fall: domino check skipped)');
  },

  // ---------------------------------------------------------------- cover stops projectiles until it breaks
  cover() {
    const { D, game, log, step } = build();
    const s = D.list.find((b) => b.kind === 'stone' && b.cover);
    const ax = s.x, az = s.z + 6, bx = s.x, bz = s.z - 6;
    assert(D.coverAt(ax, az, bx, bz, 0.2) === s && near(D.coverT, 0.5, 0.2), `a standing stone between two points is cover (found ${(D.coverT * 12).toFixed(1)} m along a 12 m line)`);
    assert(D.coverAt(ax + 4, az, bx + 4, bz, 0.2) !== s, 'a line 4 m to its side is clear of it');
    const low = D.list.find((b) => b.kind === 'boulder' && b.h < BREAK.cover.minH);
    assert(low && D.coverAt(low.x, low.z + 3, low.x, low.z - 3, 0.2) !== low, `a boulder ${low?.h.toFixed(1)} m high is no cover (< ${BREAK.cover.minH} m)`);
    // bullets: each stopped one takes its share; the stone gives way in the end
    let stopped = 0;
    const hp0 = s.hp;
    for (let i = 0; i < 400 && s.state === STATE.INTACT; i++) {
      if (D.stop(ax, s.z + 2, bx, s.z - 2, 0.3, BREAK.cover.bullet, { kind: BLOW.BLAST, by: 'boss', y: 1 }) === s) stopped++;
      step(0.2);
    }
    const per = BREAK.cover.bullet * BREAK.mats.stone.take.blast;
    assert(s.state !== STATE.INTACT && stopped >= Math.floor(hp0 / per) && stopped <= Math.ceil(hp0 / per) + 1, `a standing stone of ${hp0.toFixed(2)} stops ${stopped} bullets (${per.toFixed(3)} each), then falls`);
    step(3);
    assert(D.coverAt(ax, az, bx, bz, 0.2) !== s && D.stop(ax, az, bx, bz, 0.3, 1) !== s, 'once it is down it covers nothing');
    assert(log.filter((e) => e.n === 'world:impact' && e.kind === 'chip').length >= stopped - 1, 'every stopped bullet chips it (world:impact chip)');
    // two bullets in the same instant: the second is stopped too (it does not chip again)
    const s2 = D.list.find((b) => b.kind === 'stone' && b.cover && b.state === STATE.INTACT);
    const a1 = D.stop(s2.x, s2.z + 2, s2.x, s2.z - 2, 0.3, 0.12), hpA = s2.hp, a2 = D.stop(s2.x, s2.z + 2, s2.x, s2.z - 2, 0.3, 0.12);
    assert(a1 === s2 && a2 === s2 && s2.hp === hpA, 'two bullets in one frame are both stopped; the piece is chipped once');
  },

  // ---------------------------------------------------------------- fire burns where it lands, hurts, and leaves ash
  fire() {
    const { D, world, game, hits, log, step } = build(createForest, (x, z) => (Math.hypot(x - 40, z) < 6 ? 0 : 1));
    const F = world.fire;
    const lit = F.ignite(0, 0, 3, 1);
    assert(lit >= 50 && lit <= 90 && F.count === lit && F.burning(0, 0) > 3, `fire on a 3 m disc of full grass lights ${lit} cells (50..90), ${F.burning(0, 0).toFixed(1)} s to burn`);
    assert(log.some((e) => e.n === 'world:fire' && e.cells === lit), 'world:fire { x, z, radius, cells }');
    assert(F.ignite(0, 0, 3, 1) === 0, 'what burns does not catch again');
    assert(F.ignite(40, 0, 3, 1) === 0, 'bare ground (no grass) does not burn');
    game.player.position.set(0, 0, 0);
    step(FIRE.grace - 0.1);
    assert(hits.length === 0, `no burn in the first ${FIRE.grace} s (a roll through the blast ends outside)`);
    step(2.0);
    const n = hits.length, h = hits[0];
    assert(n >= 3 && n <= 5 && h.kind === 'fire' && h.tell === TELL.NORMAL && h.blockable === true && h.parryable === false && h.damage === FIRE.damage && h.perfect === false && h.plunge === false, `standing in it burns: ${n} ticks of ${FIRE.damage} in 2 s (blockable, never a perfect dodge)`);
    game.player.state = 'roll';
    step(1.0);
    assert(hits.length === n, 'never while he rolls');
    game.player.state = 'idle';
    game.player.position.set(12, 0, 12);
    step(4);
    assert(F.count === 0 && F.burning(0, 0) === 0 && world.scorch.burnAt(0, 0) > 0.95, `it burns out (${world.scorch.burnAt(0, 0).toFixed(2)} char) ...`);
    assert(F.ignite(0, 0, 3, 1) === 0, '... and ash does not burn again');
    assert(hits.length === n, 'out of the fire: no more ticks');
    // wood catches; stone does not
    const t = D.list.find((b) => b.kind === 'deadTree');
    const s = D.list.find((b) => b.kind === 'stone');
    assert(D.ignite(s.x, s.z, 2, 1) === 0 && D.ignite(t.x, t.z, 1, 1) === 1 && t.burn > 5, `a dead tree catches (${t.burn.toFixed(1)} s); a stone does not`);
    assert(log.some((e) => e.n === 'world:impact' && e.kind === 'burn' && e.id === t.id), "world:impact { kind: 'burn' }");
    game.player.position.set(t.x + t.r + 0.6, 0, t.z);
    const n2 = hits.length;
    step(1.5);
    assert(hits.length > n2 && hits[hits.length - 1].kind === 'fire', 'the hero beside a burning tree is burned');
    game.player.position.set(t.x + 9, 0, t.z);
    step(BREAK.burn.time * 1.2);
    assert(t.state === STATE.BROKEN && t.burnt && !t.body.visible && t.stub.visible && log.some((e) => e.n === 'world:impact' && e.kind === 'burnout'), 'it burns through: a stump is left (world:impact burnout)');
    assert(D.ignite(t.x, t.z, 1, 1) === 0, 'what burned through does not catch again');
    // world.ignite's two halves, as world.js wires them
    const lights = game.lights;
    assert(lights && Number.isFinite(game.fx.fire.count), 'flames are heat in the fire field, the blaze has a light');
  },

  // ---------------------------------------------------------------- a boss lifts a piece and throws it
  throw() {
    const { D, world, game, log, colliders, step } = build();
    const b = D.nearest(0, 0, { lift: 1 });
    assert(b && b.lift === 1 && (b.mat === 'wood' || b.kind === 'boulder'), `nearest liftable piece to the centre: a ${b?.kind} ${Math.hypot(b.x, b.z).toFixed(1)} m out`);
    const st = D.list.find((o) => o.kind === 'stone' && o.lift === 2);
    assert(D.nearest(st.x, st.z, { lift: 1, maxDist: 0.5 }) === null && D.nearest(st.x, st.z, { lift: 2, maxDist: 0.5 }) === st, 'a standing stone is only for the Void (lift 2)');
    const fallen = D.list.find((o) => o.lift === 0);
    assert(D.take(fallen) === false, 'a piece nobody can lift is not taken');
    assert(D.take(b) === true && b.state === STATE.HELD && b.colliders.every((c) => !colliders.circles.includes(c)), 'taken: it is held, its collider is gone');
    D.carry(b, b.x + 1, 3, b.z + 1, 0.6, 0.4);
    step(0.1);
    assert(near(b.pivot.position.y, 3, 1e-6) && Math.abs(b.pivot.quaternion.w) < 0.999, 'carry() puts it where the boss holds it, leaning');
    // thrown at another piece: it lands there, bursts, and the blast strikes what stands near
    const target = D.list.filter((o) => o !== b && o.state === STATE.INTACT && o.kind === 'boulder').sort((p, q) => Math.hypot(p.x - b.x, p.z - b.z) - Math.hypot(q.x - b.x, q.z - b.z))[0];
    const hp = target.hp;
    let landed = null;
    assert(D.throwTo(b, target.x + 0.5, target.z, { time: 0.7, power: 1.4, radius: 2.2, onLand: (o, x, z, r) => (landed = { o, x, z, r }) }) && b.state === STATE.FLYING, 'thrown: it flies');
    let top = 0;
    for (let i = 0; i < 80 && b.state === STATE.FLYING; i++) { step(1 / 60); top = Math.max(top, b.pivot.position.y); }
    assert(b.state === STATE.GONE && !b.body.visible && top > 3.2, `it arcs (top ${top.toFixed(1)} m) and comes apart where it lands`);
    assert(landed && landed.o === b && near(landed.x, target.x + 0.5, 1e-6) && landed.r === 2.2, 'onLand(piece, x, z, radius) is called once, at the target');
    assert(target.hp < hp || target.state !== STATE.INTACT, 'its blast strikes the piece it landed by');
    assert(log.some((e) => e.n === 'world:impact' && e.kind === 'throw') && log.some((e) => e.n === 'world:impact' && e.kind === 'crash' && e.by === 'boss'), 'world:impact throw, then crash');
    assert(world.scars.count > 5, `the landing is cracked and littered (${world.scars.count} marks)`);
    // let go: it drops and bursts
    const c = D.nearest(0, 0, { lift: 1 });
    D.take(c);
    D.carry(c, c.x, 4, c.z);
    assert(D.drop(c) && c.state === STATE.FLYING, 'drop(): a held piece falls');
    step(1.2);
    assert(c.state === STATE.GONE, '... and bursts');
    assert(D.throwTo(c, 0, 0) === false && D.take(c) === false, 'a piece that is gone cannot be thrown or taken');
  },

  // ---------------------------------------------------------------- the fight's reset: everything stands again
  reset() {
    const { D, world, game, colliders, step } = build();
    const n0 = colliders.circles.length, ids = new Set(colliders.circles);
    const trees = D.list.filter((b) => b.kind === 'deadTree');
    D.topple(trees[0], 1, 0, 'boss');
    D.ignite(trees[1].x, trees[1].z, 1, 1);
    D.take(trees[2]);
    const st = D.list.find((b) => b.kind === 'stone' && b.topples);
    D.strike(st.x, st.z, 1, 99, { src: D.swing() });
    const fl = D.list.find((b) => b.kind === 'flagstone');
    const pos = fl.body.geometry.attributes.position, home = pos.array.slice(fl.body.start * 3, (fl.body.start + fl.body.count) * 3);
    D.strike(fl.x, fl.z, 0.5, 5, { src: D.swing() });
    assert(fl.state === STATE.BROKEN && !fl.body.visible && fl.stub.visible && pos.array[fl.body.start * 3 + 1] < -1, 'a flagstone smashed: its slab folds away, its shards show');
    world.fire.ignite(0, 0, 4, 1);
    world.scars.ground(3, 3, 1.5);
    step(1.5);
    D.topple(D.list.find((b) => b.kind === 'tree'), 0, 1, 'player'); // (still falling at the reset)
    step(0.2);
    assert(D.standing < D.list.length - 3 && world.fire.count > 0 && world.scars.count > 0 && D.active.length > 0, `before: ${D.list.length - D.standing} pieces down, ${world.fire.count} cells alight, ${world.scars.count} marks`);
    // (world.restore(), as world.js wires it)
    world.fire.reset();
    world.scars.reset();
    D.reset();
    assert(D.standing === D.list.length && D.list.every((b) => b.hp === b.hpMax && b.body.visible && (!b.stub || !b.stub.visible) && b.burn === 0 && !b.burnt), 'every piece stands again, whole and unburnt');
    assert(D.list.every((b) => b.pivot.position.lengthSq() === 0 && b.pivot.quaternion.x === 0 && b.pivot.quaternion.z === 0 && b.pivot.quaternion.w === 1), '... upright, where it stood');
    assert(home.every((v, i) => pos.array[fl.body.start * 3 + i] === v) && !fl.stub.visible, '... the flagstone whole again, vertex for vertex');
    assert(colliders.circles.length === n0 && colliders.circles.every((c) => ids.has(c)), `the colliders are the same ${n0} circles (no stump's left behind)`);
    assert(world.fire.count === 0 && world.fire.burning(0, 0) === 0 && world.scars.count === 0 && D.active.length === 0, 'no fire, no marks, nothing in motion');
    assert(D.wreckage === 0 && D.wreck.live.length === 0 && D.wreck.pools.every((p) => p.every((e) => !e.on && !e.mesh.visible)) && D.burning === 0, 'no wreckage lies, nothing burns');
    step(1);
    assert(D.standing === D.list.length, 'and it stays so');
    // a second fight breaks things as the first did
    D.strike(st.x, st.z, 1, 99, { src: D.swing() });
    step(3);
    assert(st.state === STATE.BROKEN && st.stub.visible, 'a reset piece breaks again like the first time');
  },

  // ---------------------------------------------------------------- the spatial grid answers like a full scan, and cheaper
  grid() {
    const { D } = build();
    const L = D.list;
    let rs = 7;
    const r01 = () => (rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0) / 4294967296;
    const segD = (px, pz, ax, az, bx, bz) => {
      const abx = bx - ax, abz = bz - az, l2 = abx * abx + abz * abz;
      const t = l2 > 1e-9 ? Math.min(1, Math.max(0, ((px - ax) * abx + (pz - az) * abz) / l2)) : 0;
      return [Math.hypot(ax + abx * t - px, az + abz * t - pz), t];
    };
    let bad = 0;
    for (let i = 0; i < 3000; i++) {
      const ax = (r01() - 0.5) * 90, az = (r01() - 0.5) * 90, a = r01() * 6.283, len = r01() * 14, r = r01() * 1.5;
      const bx = ax + Math.cos(a) * len, bz = az + Math.sin(a) * len;
      // coverAt vs a full scan
      let best = null, bt = 2;
      for (const b of L) {
        if (b.state !== STATE.INTACT || !b.cover) continue;
        const [d, t] = segD(b.x, b.z, ax, az, bx, bz);
        if (d <= b.r + r && t < bt) { bt = t; best = b; }
      }
      const got = D.coverAt(ax, az, bx, bz, r);
      if (got !== best && !(got && best && Math.abs(D.coverT - bt) < 1e-9)) bad++; // (a tie: either is the first)
      // nearest within a reach vs a full scan
      const md = 2 + r01() * 20;
      let nb = null, nd = md;
      for (const b of L) {
        if (b.state !== STATE.INTACT || b.hpMax === Infinity || !(b.lift > 0 && b.lift <= 1)) continue;
        const d = Math.hypot(b.x - ax, b.z - az);
        if (d < nd) { nd = d; nb = b; }
      }
      if (D.nearest(ax, az, { maxDist: md, lift: 1 }) !== nb) bad++;
    }
    assert(bad === 0, `coverAt and nearest on the grid agree with a full scan of ${L.length} pieces (3000 random queries each: ${bad} differ)`);
    // cost: a bullet's step (coverAt) over the grid vs over every piece
    const t0 = performance.now();
    for (let i = 0; i < 20000; i++) D.coverAt(-3 + (i % 7), 4, 2, -6 + (i % 5), 0.3);
    const tGrid = performance.now() - t0;
    const t1 = performance.now();
    for (let i = 0; i < 20000; i++) {
      for (const b of L) if (b.state === STATE.INTACT && b.cover) segD(b.x, b.z, -3 + (i % 7), 4, 2, -6 + (i % 5));
    }
    const tScan = performance.now() - t1;
    assert(tGrid < tScan, `20000 bullet steps: ${tGrid.toFixed(1)} ms on the grid vs ${tScan.toFixed(1)} ms scanning all ${L.length} pieces`);
  },

  // ---------------------------------------------------------------- the wyrm's body wrecks what it meets (no named attack)
  body() {
    // walking: a tree in its way goes down ahead of it; it ploughs through (its trunk does not turn it)
    {
      const W = wyrm();
      const { D, d, game, log, step, colliders } = W;
      const t = D.list.find((b) => b.kind === 'deadTree' && Math.hypot(b.x, b.z) < 20);
      const c0 = colliders.version;
      W.place(t.x, t.z + 9, Math.PI); // 9 m south of it, facing north (fwd = (sin yaw, cos yaw))
      game.player.position.set(t.x, 0, t.z - 22); // (with its AI off it faces the hero: ahead, past the tree)
      const z0 = d.position.z;
      let actions = 0;
      W.run(4.5, () => { d.moveForward(WYRM.walkSpeed[0], 1 / 60); if (d.brain.action) actions++; });
      const felled = log.find((e) => e.n === 'world:impact' && e.id === t.id && (e.kind === 'topple' || e.kind === 'break'));
      assert(t.state !== STATE.INTACT && felled && felled.by === 'boss' && actions === 0, `walking at ${WYRM.walkSpeed[0]} m/s (no attack running) it fells the dead tree in its way (world:impact ${felled?.kind}, by boss)`);
      assert(d.position.z < t.z - 1 && colliders.version > c0, `it walks on through where the tree stood (root ${(t.z - d.position.z).toFixed(1)} m past it): the trunk did not turn it`);
      step(3);
      assert(D.wreckage >= 1 && D.wreck.live.some((e) => e.kind === 0 && Math.hypot(e.x - t.x, e.z - t.z) < 1.5), `its trunk lies where it fell (${D.wreckage} piece(s) of wreckage)`);
    }
    // turning: the tail sweeps what stands behind it
    {
      const W = wyrm();
      const { D, d, game, log } = W;
      const t = D.list.find((b) => b.kind === 'deadTree' && Math.hypot(b.x, b.z) < 22);
      // the root 7 m south of the tree, facing east: the tail lies west; the hero to the north-east turns it
      // round, and the tail swings through the tree
      W.place(t.x, t.z + 7.5, Math.PI / 2);
      game.player.position.set(t.x + 14, 0, t.z - 12);
      const hp = t.hp;
      W.run(2.5);
      // (tuning pass, 2026-11-15: a limb, a wing or the tail only BRUSHES what it passes (BREAK.brush):
      // a turn shakes the pieces round it and breaks only the small ones; it no longer fells the tree
      // behind it, which with the stones a walk felled left a sixth of the clearing after a fight)
      const hit = log.filter((e) => e.n === 'world:impact' && e.by === 'boss');
      const big = new Set(hit.filter((e) => e.kind === 'topple' || e.kind === 'break').map((e) => e.id));
      const felledBig = [...big].map((id) => D.list[id]).filter((b) => b && b.hpMax >= 1.2);
      assert(hit.length > 0 && t.state === STATE.INTACT && !felledBig.length, `turning in place (${(WYRM.turnSpeed[0] * 180 / Math.PI * 0.8).toFixed(0)} deg/s), its body brushes what stands round it (${hit.length} blow(s): ${[...new Set(hit.map((e) => e.kind))].join(', ')}) and fells nothing big (${felledBig.map((b) => b.kind).join(', ') || 'none'}; the tree behind it stands)`);
    }
    // landing: a heavy landing breaks what stands round it; flying low: it shears the crowns it passes
    {
      const W = wyrm();
      const { D, d, game } = W;
      const near = D.list.filter((b) => b.state === STATE.INTACT && b.mat === 'wood' && b.kind === 'deadTree');
      const t = near[2];
      W.place(t.x + 4, t.z, 0);
      game.player.position.set(t.x + 4, 0, t.z + 20);
      let alt = 7;
      W.air(() => alt);
      W.run(1.2);
      const before = D.standing, logsBefore = W.log.length;
      alt = 0;
      W.run(1.2);
      const hits = W.log.slice(logsBefore).filter((e) => e.n === 'world:impact' && e.by === 'boss');
      assert(hits.length > 0 && D.standing < before, `a landing from ${7} m strikes what stands round it: ${hits.length} blow(s), ${before - D.standing} piece(s) down`);
    }
    {
      const W = wyrm();
      const { D, d, game } = W;
      // a rim stand: the wood farthest out on the east side, flown through 4 m up at 12 m/s
      const rim = D.list.filter((b) => b.mat === 'wood' && Math.abs(b.x - 33) < 9 && b.z > -18 && b.z < 16);
      const hp0 = rim.reduce((s, b) => s + b.hp, 0);
      W.place(33, -18, 0);
      game.player.position.set(33, 0, 30);
      W.air(() => 4);
      W.run(0.6, () => { d.position.set(33, 0, -18); d.yaw = 0; });
      const logN = W.log.length;
      // fly south along x = 33, through the stand (placed each frame: a flight's path, not its bound)
      let z = -18;
      W.run(2.8, () => { z += 12 / 60; d.position.set(33, 0, z); d.yaw = 0; });
      const struck = new Set(W.log.slice(logN).filter((e) => e.n === 'world:impact' && e.by === 'boss').map((e) => e.id));
      const hp1 = rim.reduce((s, b) => s + b.hp, 0);
      assert(struck.size >= 2 && hp1 < hp0, `flying low (4 m up, 12 m/s) through a stand on the rim it shears ${struck.size} trees`);
    }
    // what a move of its own is about to take is spared; a reserved piece too
    {
      const W = wyrm();
      const { D, d, game } = W;
      const t = D.list.find((b) => b.kind === 'deadTree' && Math.hypot(b.x, b.z) < 20);
      D.reserve(t, 10);
      W.place(t.x, t.z + 9, Math.PI);
      game.player.position.set(t.x, 0, t.z - 22);
      W.run(4.5, () => d.moveForward(WYRM.walkSpeed[0], 1 / 60));
      assert(t.state === STATE.INTACT && t.hp === t.hpMax, 'a reserved piece (destructibles.reserve: a move is about to take it) is left alone by its body');
    }
  },

  // ---------------------------------------------------------------- wreckage stays, stops nothing, sinks at the cap
  wreck() {
    const { D, world, game, colliders, step } = build();
    const t = D.list.find((b) => b.kind === 'deadTree' && !b.wall);
    const n0 = colliders.circles.length;
    const ml = 0.6 * t.h * BREAK.wreck.trunk[1];
    const coverBefore = D.coverAt(t.x + ml, t.z - 4, t.x + ml, t.z + 4, 0.2);
    D.topple(t, 1, 0, 'boss');
    step(2);
    const e = D.wreck.live.find((w) => w.kind === 0);
    assert(e && e.on && e.mesh.visible && t.stub.visible && Math.abs(e.x - t.x) < 1 && e.dx > 0.99, `a felled tree's trunk lies along its fall (${e?.len.toFixed(1)} m, from its stump)`);
    assert(colliders.circles.length === n0, `its wreckage adds no collider (${n0 - t.colliders.length + 1} circles: the stump's only)`);
    const mx = e.x + e.dx * e.len * 0.6, mz = e.z + e.dz * e.len * 0.6;
    const pos = new THREE.Vector3(mx, 0, mz);
    colliders.resolve(pos, 0.45);
    assert(Math.hypot(pos.x - mx, pos.z - mz) < 1e-6, 'the hero stands on the trunk: nothing pushes him off it');
    assert(D.coverAt(t.x + ml, t.z - 4, t.x + ml, t.z + 4, 0.2) === coverBefore && D.wreck.live.every((w) => !D.list.includes(w)), 'a bullet across the trunk meets what it met before the tree fell (the trunk is no cover)');
    step(30);
    assert(e.on && e.mesh.visible && D.wreck.live.includes(e), 'it is still there 30 s later');
    // a boulder broken leaves a pile; a thrown piece leaves its remains where it lands
    const bo = D.list.find((b) => b.kind === 'boulder' && b.state === STATE.INTACT);
    const w0 = D.wreckage;
    D.strike(bo.x, bo.z, 1, 9, { src: D.swing() });
    assert(D.wreckage === w0 + 1 && D.wreck.live.some((w) => w.kind === 2 && Math.hypot(w.x - bo.x, w.z - bo.z) < 0.5), 'a broken boulder leaves a rubble pile');
    const p = D.nearest(0, 0, { lift: 1, mat: 'wood' });
    D.take(p);
    D.throwTo(p, 2, 3, { time: 0.6 });
    step(1);
    assert(D.wreck.live.some((w) => w.kind === 0 && Math.hypot(w.x + w.dx * w.len * 0.3 - 2, w.z + w.dz * w.len * 0.3 - 3) < 2), 'a thrown tree leaves its trunk where it lands');
    // the cap: past its share the oldest sinks into the ground (never more than the pool)
    const cap = D.wreck._cap(0);
    let fell = 0;
    for (const b of D.list) {
      if (b.mat !== 'wood' || b.state !== STATE.INTACT || !b.topples) continue;
      D.topple(b, 0, 1, 'world');
      if (++fell >= cap + 12) break;
      step(0.15);
    }
    step(4);
    const logs = D.wreck.live.filter((w) => w.kind === 0).length;
    assert(logs <= cap && logs >= cap - 4, `felling ${fell} trees leaves ${logs} trunks lying (the cap ${cap}: the oldest sank)`);
    // the quality factor shrinks the cap
    D.setQuality(QUALITY.LOW);
    step(4);
    const lowCap = D.wreck._cap(0);
    assert(lowCap < cap && D.wreck.live.filter((w) => w.kind === 0).length <= lowCap, `LOW quality: at most ${lowCap} trunks (HIGH ${cap})`);
    // burnt wood: a tree that burned through leaves a black log that smoulders
    D.setQuality(1);
    const bt = D.list.find((b) => b.mat === 'wood' && b.state === STATE.INTACT && b.h > 3);
    D.ignite(bt.x, bt.z, 0.5, 1);
    step(BREAK.burn.time * 1.3);
    assert(bt.burnt && D.wreck.live.some((w) => w.kind === 1 && w.smoulder > 0 && Math.hypot(w.x - bt.x, w.z - bt.z) < 1.5), 'a tree that burned through leaves a black log by its stump, smouldering');
  },

  // ---------------------------------------------------------------- a felled tree lies as the blow left it (ADR-128)
  lie() {
    reseedBreaks(0x51ed); // (the shares below are chances: from a known point, not where the scenarios before left the stream)
    const { D, game, step } = build();
    game.player.position.set(0, 0, 0);
    game.boss.position.set(0, 0, 80);
    // (the clearing's trees first, then the wall's nearest: the clearing has only a dozen tall ones)
    const trees = D.list.filter((b) => b.mat === 'wood' && b.ranged && b.wrecks && b.topples && b.stub?.reshape && b.h > 3).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
    const topOf = (H) => {
      let m = 0;
      for (let i = 1; i < H.length; i += 3) m = Math.max(m, H[i]);
      return m;
    };
    const kinds = [BLOW.CUT, BLOW.BLUNT, BLOW.BLAST];
    const ratio = { cut: [], blunt: [], blast: [] };
    let hinge = 0, blunt = 0;
    const felled = [];
    for (let i = 0; i < 36 && i < trees.length; i++) {
      const t = trees[i], k = kinds[i % 3];
      const a = i * 2.4, dx = Math.cos(a), dz = Math.sin(a);
      const built = topOf(t.stub.home);
      D.strike(t.x - dx * 0.3, t.z - dz * 0.3, 0.5, 80, { kind: k, by: 'player', dx, dz, y: 1, src: D.swing() });
      if (t.state === STATE.INTACT) continue;
      felled.push(t);
      const H = t.stub.home, top = topOf(H);
      ratio[k].push(top / built);
      if (k === BLOW.BLUNT) {
        // torn over: higher on the side it went over to (the fibres it tore stand up there)
        let hi = 0, nh = 0, lo = 0, nl = 0;
        for (let v = 0; v < H.length; v += 3) {
          if (H[v + 1] < top * 0.5) continue;
          const d = (H[v] - t.x) * t.dx + (H[v + 2] - t.z) * t.dz;
          if (d > 0.03) (hi += H[v + 1]), nh++;
          else if (d < -0.03) (lo += H[v + 1]), nl++;
        }
        blunt++;
        if (nh && nl && hi / nh > lo / nl) hinge++;
      }
    }
    const mean = (A) => A.reduce((s, v) => s + v, 0) / Math.max(1, A.length);
    const all = [...ratio.cut, ...ratio.blunt, ...ratio.blast];
    const distinct = new Set(all.map((v) => v.toFixed(3))).size;
    assert(felled.length >= 24 && distinct >= all.length - 2, `${felled.length} trees felled by a blade, a blow, a blast: ${distinct} different stump heights of ${all.length}`);
    assert(mean(ratio.blast) < mean(ratio.blunt) && mean(ratio.blunt) < mean(ratio.cut), `a blade leaves the tallest stumps (x${mean(ratio.cut).toFixed(2)} of the built one, cut where it bit), a blow lower (x${mean(ratio.blunt).toFixed(2)}), a blast the lowest (x${mean(ratio.blast).toFixed(2)})`);
    assert(hinge >= blunt * 0.7, `a tree knocked over leaves its stump torn higher on the side it fell to (${hinge} of ${blunt})`);
    step(3);
    // its trunk: turned off the line it fell along, some broken in two, some resting raised on their crowns
    const logs = D.wreck.live.filter((w) => w.kind === 0);
    let turned = 0, raised = 0;
    for (const t of felled) {
      const mine = logs.filter((w) => Math.hypot(w.x - t.x, w.z - t.z) < 1.2);
      for (const w of mine) {
        if (Math.acos(Math.min(1, w.dx * t.dx + w.dz * t.dz)) > 0.05) turned++;
        if (w.pitch > 0.03) raised++;
      }
    }
    const looks = new Set(logs.map((w) => w.mesh.geometry.uuid)).size;
    assert(logs.length > felled.length && turned >= felled.length * 0.4 && raised >= felled.length * 0.3 && looks >= 5, `${logs.length} trunks for ${felled.length} trees (some broke in two), ${turned} turned off their fall, ${raised} with an end raised, ${looks} different shapes`);
    // burnt through: a black stump, and some stay standing as a snag
    const left = trees.filter((b) => b.state === STATE.INTACT).slice(0, 16);
    for (let i = 0; i < left.length; i += 4) {
      for (const b of left.slice(i, i + 4)) D.ignite(b.x, b.z, 0.3, 1);
      step(BREAK.burn.time * 1.3);
    }
    const burnt = left.filter((b) => b.burnt);
    const chars = D.wreck.live.filter((w) => w.kind === 1);
    const snags = chars.filter((w) => w.pitch > 1).length;
    const dark = burnt.filter((b) => {
      const C = b.stub.cAttr?.array, O = b.stub.corig;
      if (!C || !O) return false;
      let a = 0, o = 0;
      for (let k = 0; k < O.length; k++) (a += C[b.stub.start * 3 + k]), (o += O[k]);
      return a < o * 0.8;
    }).length;
    assert(burnt.length >= 5 && snags >= 1 && chars.length - snags >= 1 && dark === burnt.length, `${burnt.length} trees burned through: ${snags} left standing as black snags, ${chars.length - snags} black trunks lying, ${dark} stumps burnt dark`);
    // the reset: every stump back to the one it was built as
    D.reset();
    const back = [...felled, ...burnt].every((b) => !b.stub.visible && !b.stub.shaped && b.stub.home.every((v, k) => v === b.stub.orig[k]) && (!b.stub.cAttr || b.stub.corig.every((v, k) => v === b.stub.cAttr.array[b.stub.start * 3 + k])));
    assert(back, 'the reset: every stump hidden and back to its built shape and colour');
  },

  // ---------------------------------------------------------------- fire spreads from tree to tree, and stops at its cap
  spread() {
    // (each try to pass the fire on is a chance (BREAK.spread.chance): start the module's stream from a
    // known point, not wherever the scenarios before left it; a tree has ~4 tries before it burns out)
    reseedBreaks();
    const { D, world, game, log, step } = build();
    game.player.position.set(0, 0, 0);
    // the tree with the most neighbours in reach
    const S = BREAK.spread;
    const wood = D.list.filter((b) => b.mat === 'wood' && b.burns);
    const nb = (b) => wood.filter((o) => o !== b && Math.hypot(o.x - b.x, o.z - b.z) <= S.reach + b.r + o.r + o.leafy * 1.5).length;
    const t = wood.reduce((a, b) => (nb(b) > nb(a) ? b : a));
    D.ignite(t.x, t.z, 0.3, 1);
    let peak = 0, firstSpread = -1;
    for (let i = 0; i < 60 * 20; i++) {
      step(1 / 60);
      peak = Math.max(peak, D.burning);
      if (firstSpread < 0 && log.filter((e) => e.n === 'world:impact' && e.kind === 'burn').length > 1) firstSpread = i / 60;
    }
    const burns = log.filter((e) => e.n === 'world:impact' && e.kind === 'burn').length;
    const cap = Math.max(3, Math.round(S.maxBurning * D.q));
    assert(firstSpread >= S.after && burns >= 2, `a tree with ${nb(t)} neighbours in reach lights one ${firstSpread.toFixed(1)} s after it caught (>= ${S.after} s); ${burns} pieces burned in 20 s`);
    assert(peak <= cap, `never more than ${cap} things alight at once (peak ${peak})`);
    step(40);
    const burned = D.list.filter((b) => b.burnt).length;
    assert(D.burning === 0 && D.list.every((b) => b.gen <= S.gens + (b.wall ? BREAK.wall.gens : 0)), `the blaze burns out: fire passes on at most ${S.gens} times from where it landed (+${BREAK.wall.gens} in the wall) (${burned} trees burned in all, nothing alight 60 s on)`);
    // the light of burning wood is a local glow, one for a cluster (BREAK.burn.glow)
    {
      const Lb = build();
      const added = [];
      const add = Lb.game.lights.add.bind(Lb.game.lights);
      Lb.game.lights.add = (o) => { added.push(o); return add(o); };
      const stand = Lb.D.list.filter((b) => b.mat === 'wood' && Math.hypot(b.x - t.x, b.z - t.z) < 7).slice(0, 5);
      for (const b of stand) Lb.D.ignite(b.x, b.z, 0.2, 1);
      const G = BREAK.burn.glow;
      assert(stand.length >= 3 && added.length <= 2 && added.every((o) => o.radius <= 6 && o.intensity <= G.intensity), `${stand.length} trees alight within 7 m share ${added.length} light(s) of ${added.map((o) => o.radius.toFixed(1)).join(', ')} m (<= 6 m; it was ~16 m each)`);
    }
    // the cap: everything lit at once, nothing spreads past it
    const W = build();
    W.D.setQuality(QUALITY.LOW);
    const capLow = Math.max(3, Math.round(S.maxBurning * W.D.q));
    const many = W.D.list.filter((b) => b.mat === 'wood' && b.burns).slice(0, capLow + 6);
    for (const b of many.slice(0, capLow)) W.D.ignite(b.x, b.z, 0.2, 1);
    const lit0 = W.D.burning;
    let over = 0;
    for (let i = 0; i < 60 * 10; i++) { W.step(1 / 60); if (W.D.burning > Math.max(lit0, capLow)) over++; }
    assert(over === 0, `at LOW quality the fires never pass ${capLow} by spreading (lit ${lit0} at once)`);
    // logs catch from a burning neighbour and in burning grass
    const B = build();
    const tr = B.D.list.find((b) => b.kind === 'deadTree');
    B.D.topple(tr, 1, 0, 'world');
    B.step(2);
    const lg = B.D.wreck.live.find((w) => w.kind === 0);
    const n = B.D.ignite(lg.x + lg.dx, lg.z + lg.dz, 0.5, 1);
    assert(n >= 1 && lg.burn > 0 && B.D.burning >= 1, 'fire landing on a fallen trunk lights it');
    B.game.player.position.set(lg.x + lg.dx * 1.5, 0, lg.z + lg.dz * 1.5 + 0.3);
    const h0 = B.hits.length;
    B.step(2);
    assert(B.hits.length > h0 && B.hits[B.hits.length - 1].kind === 'fire', 'the hero beside a burning trunk is burned');
    B.game.player.position.set(40, 0, 40);
    B.step(BREAK.wreck.burn * 1.4);
    assert(lg.on === false && B.D.wreck.live.some((w) => w.kind === 1), 'it burns through and lies black');
  },

  // ---------------------------------------------------------------- a tree wears down in stages (2026-11-16)
  wear() {
    const { D, log, step, game } = build();
    game.player.position.set(0, 0, 0);
    const A = BREAK.wear.at;
    // an oak, a pine and a dead tree of the wall, struck again and again with a tail's power along the way out
    const pick = (fn) => D.list.filter((b) => b.wall && b.state === STATE.INTACT && fn(b)).sort((p, q) => Math.hypot(p.x, p.z) - Math.hypot(q.x, q.z))[0];
    const trees = [pick((b) => b.kind === 'tree' && b.body.parts > 5), pick((b) => b.kind === 'tree' && b.cut[0] === 2 && b.body.parts === 5), pick((b) => b.kind === 'deadTree')];
    for (const t of trees) {
      const R = Math.hypot(t.x, t.z), ox = t.x / R, oz = t.z / R;
      const pos = t.body.geometry.attributes.position.array, s = t.body.start * 3;
      const stages = [];
      let blows = 0;
      for (; blows < 12 && t.state === STATE.INTACT; blows++) {
        D.strike(t.x - ox * 0.6, t.z - oz * 0.6, 0.8, 1, { kind: BLOW.BLUNT, by: 'boss', dx: ox, dz: oz, y: 1.5, src: D.swing() });
        if (t.state === STATE.INTACT) stages.push(t.wear);
        step(0.8);
      }
      // (a small tree may skip a stage under one blow: it still shows the first hit, and never goes back)
      const ordered = stages.length >= 1 && stages[0] >= 1 && stages.every((v, i) => i === 0 || v >= stages[i - 1]);
      const wearEv = log.filter((e) => e.n === 'world:impact' && e.kind === 'wear' && e.id === t.id).map((e) => e.power);
      assert(ordered && wearEv.length >= 1 && wearEv.every((p, i) => i === 0 || p > wearEv[i - 1]), `${t.kind} (${t.body.parts} parts, hp ${t.hpMax.toFixed(2)}) at ${R.toFixed(0)} m: stages ${stages.join(' > ')} in ${blows} blows of 1.0, then it falls (world:impact wear ${wearEv.join(', ')})`);
      assert(blows >= 2 && blows <= 6, `... it takes ${blows} blows of a tail's power (2 .. 6: a fight's worth, a hit shows at once)`);
      // dropped parts lie folded under the ground; what stays is where it stood
      let folded = 0;
      for (let p = 0, v0 = 0; p < t.body.parts; p++) {
        const v1 = t.body.ends[p];
        if (!t.body.shown[p]) folded += pos[s + v0 * 3 + 1] < -2 ? 1 : 0;
        v0 = v1;
      }
      assert(folded === t.dropped && t.dropped >= Math.min(t.order.length, t.cut[1] ?? 1), `... ${t.dropped} of its ${t.order.length} crown parts dropped before it fell, their vertices folded away`);
      step(2.5);
      assert(t.state === STATE.BROKEN && !t.body.visible && t.stub.visible, '... it lies felled, its stump stands');
    }
    // a burning tree loses its crown as it burns
    const b = pick((o) => o.kind === 'tree' && o.body.parts > 5);
    D.ignite(b.x, b.z, 0.3, 1);
    const life = b.burnLife;
    step(life * 0.5);
    const mid = b.dropped;
    step(life * 0.6);
    assert(mid >= 1 && mid < b.order.length && b.burnt && b.state === STATE.BROKEN, `a burning oak drops its crown as it burns (${mid} of ${b.order.length} parts gone halfway), then burns to its stump`);
    // inside the clearing trees wear down too, with the toughness they had
    const inner = D.list.find((o) => o.kind === 'deadTree' && !o.wall && o.state === STATE.INTACT);
    const hp = inner.hpMax;
    D.strike(inner.x, inner.z, 0.6, hp * (1 - A[0]) + 0.05, { kind: BLOW.BLUNT, by: 'boss', src: D.swing() });
    assert(inner.state === STATE.INTACT && inner.wear >= 1 && inner.dropped >= 1, `a dead tree inside the clearing (hp ${hp.toFixed(2)}: unchanged) wears down too (stage ${inner.wear})`);
  },

  // ---------------------------------------------------------------- the wyrm's reach into the wall (2026-11-16, the tuning pass)
  // destructibles.wind: a front of wind wears the wall's trees, in the order it reaches them, never past
  // BREAK.wind.floor (wind alone fells nothing), nothing inside the clearing. destructibles.carryFire:
  // fire carried along a ray lights the first tree of the wall, on the wall's own budget (the clearing's
  // is untouched). A broken bone leaves a heap of bone (wreckage.js). reset() forgets all of it.
  reach() {
    const { D, log, step, game, world } = build();
    game.player.position.set(0, 0, 0);
    const wall = D.list.filter((b) => b.wall && b.order.length > 0);
    const inner = D.list.filter((b) => !b.wall);
    const hp0 = new Map(inner.map((b) => [b, b.hp]));
    const L0 = log.length;
    const n = D.wind(-10, 0, 1.4, 50, {});
    step(0.3);
    const early = log.slice(L0).filter((e) => e.n === 'world:impact' && e.kind === 'wear').length;
    step(2.5);
    const worn = wall.filter((b) => b.wear > 0);
    const wearEv = log.slice(L0).filter((e) => e.n === 'world:impact' && e.kind === 'wear');
    const near = worn.filter((b) => Math.hypot(b.x + 10, b.z) < 30).length, far = worn.filter((b) => Math.hypot(b.x + 10, b.z) > 42).length;
    assert(n > 50 && worn.length > 20 && wearEv.length === worn.length && early < wearEv.length, `a front of wind (1.4 from (-10, 0), 50 m) reached ${n} trees of the wall, wore ${worn.length} (world:impact 'wear' ${wearEv.length}; ${early} in its first 0.3 s: it rolls out at ${BREAK.wind.speed} m/s)`);
    assert(near > far, `... more of them near it than far (${near} within 30 m, ${far} past 42 m)`);
    assert(wall.every((b) => b.state === STATE.INTACT && b.hp >= BREAK.wind.floor * b.hpMax - 1e-9) && inner.every((b) => b.hp === hp0.get(b)), `... none felled, none below ${BREAK.wind.floor} of its structure; the clearing's pieces untouched`);
    // again at once: within rehit nothing more
    const h1 = wall.map((b) => b.hp);
    D.wind(-10, 0, 1.4, 50, {});
    step(0.2);
    assert(wall.every((b, i) => b.hp === h1[i] || Math.hypot(b.x + 10, b.z) > 0.2 * BREAK.wind.speed), `... a second front within ${BREAK.wind.rehit} s takes nothing more from the trees it reached`);
    // fire carried along a ray: the first tree of the wall catches, on the wall's budget
    D.reset();
    const lit0 = D._litTokens;
    const b = D.carryFire(0, 0, 1, 0.05, 60, 1);
    assert(b && b.wall && b.burn > 0 && D._wallBurning === 1 && D._litTokens === lit0 && Math.hypot(b.x, b.z) > BREAK.wall.from, `carryFire along +x lit the wall's first tree in its way (${b ? Math.hypot(b.x, b.z).toFixed(1) : '-'} m; the clearing's budget untouched)`);
    let lit = 1;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * 6.283;
      const c = D.carryFire(0, 0, Math.cos(a), Math.sin(a), 60, 1);
      if (c && c.burn > 0 && c !== b) lit++;
    }
    assert(lit <= BREAK.wall.fire.bank + 1 && D._wallBurning <= BREAK.wall.fire.maxBurning, `... at once twelve more lit ${lit - 1} (its bank ${BREAK.wall.fire.bank}); ${D._wallBurning} alight in the wall (<= ${BREAK.wall.fire.maxBurning})`);
    const counted = () => D.list.filter((o) => o.wall && o.burn > 0).length;
    step(BREAK.burn.time * 0.5);
    const mid = [D._wallBurning, counted()];
    step(60);
    assert(mid[0] === mid[1] && D._wallBurning === 0 && counted() === 0, `... the wall's count of fires matches what burns (${mid[0]} = ${mid[1]}), and when they have burned out (spread included) it is 0`);
    // a broken bone leaves a heap
    const rib = D.list.find((o) => o.kind === 'elderRib');
    const heaps0 = D.wreck.pools[3].filter((e) => e.on).length;
    if (rib) D.strike(rib.x, rib.z, rib.r + 0.5, 50, { kind: BLOW.BLUNT, by: 'boss', src: D.swing() });
    step(2);
    const heaps = D.wreck.pools[3].filter((e) => e.on).length;
    assert(rib && rib.state !== STATE.INTACT && heaps > heaps0, `a broken ${rib?.kind ?? 'bone'} leaves a heap of bone (heaps lying: ${heaps0} -> ${heaps}; the strike broke its neighbours too)`);
    // the bone heaps keep to their share like every other pool: break every bone piece, drop the
    // quality, and the heaps over the lower cap sink (update() walks all four pools)
    for (const b of D.list) if (b.mat === 'bone' && b.state === STATE.INTACT) D.strike(b.x, b.z, b.r + 0.3, 50, { kind: BLOW.BLUNT, by: 'boss', src: D.swing() });
    step(2);
    const bonePool = D.wreck.pools[3];
    const lying = () => bonePool.filter((e) => e.on && !(e.sink > 0)).length;
    const full = lying();
    D.setQuality(0.3);
    const cap = D.wreck._cap(3);
    step(8);
    const after = lying();
    assert(full > cap && after <= cap, `bone heaps over a lowered cap sink: ${full} lying at full quality, ${after} after the quality drops (its cap ${cap})`);
    D.setQuality(1);
    D.reset();
    assert(D._wq.n === 0 && D._wallBurning === 0 && D.list.every((b) => b.state === STATE.INTACT && b.wear === 0) && D.wreck.pools[3].every((e) => !e.on), 'reset(): no front waiting, nothing alight, the wall and the bones whole again');
  },

  // ---------------------------------------------------------------- the wall falls away from the arena; it is restored whole
  wall() {
    const { D, log, step, game, hits, colliders } = build();
    const treeMesh = D.list.find((b) => b.kind === 'tree').body.mesh;
    const home = treeMesh.geometry.attributes.position.array.slice();
    const n0 = colliders.circles.length;
    // a far tree (60 m) felled by a blow from the arena's side: falls outward, tells nothing, leaves its log
    const far = D.list.filter((b) => b.wall && b.kind === 'tree' && Math.hypot(b.x, b.z) > 58)[0];
    const tells0 = log.filter((e) => e.n === 'combat:tell').length;
    const R = Math.hypot(far.x, far.z), ox = far.x / R, oz = far.z / R;
    D.strike(far.x, far.z, 0.6, 20, { kind: BLOW.BLUNT, by: 'boss', dx: -ox, dz: -oz, src: D.swing() });
    assert(far.state === STATE.FALLING && far.dx * ox + far.dz * oz >= BREAK.wall.out - 1e-6, `a wall tree at ${R.toFixed(0)} m struck toward the arena falls OUT of it (its way · out = ${(far.dx * ox + far.dz * oz).toFixed(2)} >= ${BREAK.wall.out})`);
    step(2.5);
    assert(far.state === STATE.BROKEN && far.quiet && log.filter((e) => e.n === 'combat:tell').length === tells0 && D.wreck.live.some((e) => e.kind === 0 && Math.hypot(e.x - far.x, e.z - far.z) < 1.5), 'it cannot reach the hero\'s ground: no tell, no strip; its trunk lies where it fell');
    // the rim: a tree whose fall can reach the bound still tells red; most fall outward
    const rim = D.list.filter((b) => b.wall && b.kind !== 'cinderBough' && (b.kind === 'tree' || b.kind === 'deadTree') && Math.hypot(b.x, b.z) < 34);
    let out = 0;
    for (const b of rim) {
      const r = Math.hypot(b.x, b.z);
      D.strike(b.x, b.z, 0.5, 20, { kind: BLOW.BLUNT, by: 'boss', dx: -b.x / r + 0.3, dz: -b.z / r, src: D.swing() });
      if (b.dx * b.x + b.dz * b.z > 0) out++;
    }
    step(3);
    assert(rim.length >= 6 && out === rim.length, `the wall's first row (${rim.length} trees within 34 m), all struck inward: every one falls out of the arena`);
    // a burning stand, a worn tree: then the reset puts every vertex of the tree mesh back
    const w = D.list.find((b) => b.wall && b.kind === 'tree' && b.state === STATE.INTACT && Math.hypot(b.x, b.z) > 45);
    D.strike(w.x, w.z, 0.5, w.hpMax * 0.6, { kind: BLOW.BLUNT, by: 'boss', src: D.swing() });
    D.ignite(w.x + 6, w.z, 2, 1);
    D.take(D.list.find((b) => b.wall && b.kind === 'tree' && b.state === STATE.INTACT));
    step(1);
    D.reset();
    const pos = treeMesh.geometry.attributes.position.array;
    let diff = 0;
    for (let i = 0; i < pos.length; i++) if (pos[i] !== home[i]) diff++;
    assert(diff === 0 && colliders.circles.length === n0 && D.list.every((b) => b.wear === 0 && b.lean === 0 && (!b.stub || !b.stub.visible)), `world.restore(): every one of the tree mesh's ${pos.length / 3} vertices is back where it was (${diff} differ), the stumps are folded away, the colliders the same ${n0}`);
    // fairness: a boss blow inside the clearing still fells a tree there with its red tell (unchanged)
    assert(hits.length === 0, 'none of it touched the hero at the centre');
  },

  // ---------------------------------------------------------------- the Elder Wyrm's skeleton, the Cinder Tree, the nest break in pieces
  landmarks() {
    const { D, set, colliders, log, step } = build();
    const kinds = (re) => D.list.filter((b) => re.test(b.kind));
    const elder = kinds(/^elder/), ribs = kinds(/^elderRib$/), cinder = kinds(/^cinder/), nest = kinds(/^nest/);
    assert(elder.length >= 30 && ribs.length === 18 && elder.every((b) => b.mat === 'bone' && b.ranged && b.digits), `the Elder Wyrm's skeleton is ${elder.length} bone pieces (${ribs.length} ribs, ${kinds(/^elderSpine$/).length} runs of the spine, the skull, the jaw, the horns, the tail ...)`);
    assert(elder.reduce((a, b) => a + b.colliders.length, 0) === ELDER_N, `its ${ELDER_N} colliders are shared out among its pieces`);
    assert(cinder.length === 6 && kinds(/^cinderBough$/).length === 5 && nest.length === 15, `the Cinder Tree: ${cinder.length} pieces (5 boughs, the trunk); the nest: ${nest.length} (14 ribs, the skull)`);
    const bf = set.bonfire;
    assert(!D.list.some((b) => Math.hypot(b.x - bf.x, b.z - bf.z) < 2), 'the bonfire is no piece: it stays');
    // a rib comes apart over a few tail blows, not one
    const rib = ribs.find((b) => b.colliders.length > 0) ?? ribs[0];
    let n = 0;
    while (rib.state === STATE.INTACT && n < 12) {
      D.strike(rib.x, rib.z, 0.8, 1, { kind: BLOW.BLUNT, by: 'boss', src: D.swing() });
      n++;
      step(0.3);
    }
    assert(n >= 2 && n <= 5 && rib.state === STATE.BROKEN && !rib.body.visible && rib.colliders.every((c) => !colliders.circles.includes(c)), `a rib of the elder wyrm breaks under ${n} tail blows (2 .. 5); its range folds away, its colliders go`);
    assert(log.some((e) => e.n === 'world:impact' && e.kind === 'break' && e.mat === 'bone' && e.id === rib.id), "world:impact { kind: 'break', mat: 'bone' }");
    // the Cinder Tree's trunk holds while its boughs stand
    const trunk = cinder.find((b) => b.kind === 'cinderTrunk');
    D.strike(trunk.x, trunk.z, 1, 3, { kind: BLOW.BLUNT, by: 'boss', src: D.swing() });
    const took = trunk.hpMax - trunk.hp;
    assert(Math.abs(took - 3 * BREAK.mats.wood.take.blunt * BREAK.guarded) < 1e-6, `with its boughs standing its trunk takes ${BREAK.guarded} of a blow (${took.toFixed(2)} of 3 x ${BREAK.mats.wood.take.blunt})`);
    for (const b of cinder) if (b !== trunk) D.strike(b.x, b.z, 0.5, 20, { kind: BLOW.BLUNT, by: 'boss', src: D.swing() });
    D.strike(trunk.x, trunk.z, 1, 20, { kind: BLOW.BLUNT, by: 'boss', src: D.swing() });
    step(0.5);
    assert(cinder.every((b) => b.state === STATE.BROKEN) && trunk.stub.visible && colliders.circles.includes(trunk.stubCollider), 'its boughs gone, the trunk breaks to its charred stump (with a collider)');
    // bough fire: a bough catches like wood
    D.reset();
    const bough = cinder.find((b) => b.kind === 'cinderBough');
    assert(D.ignite(bough.x, bough.z, 1, 1) >= 1 && bough.burn > 0, 'a bough of the Cinder Tree catches fire');
    const skull = nest.find((b) => b.kind === 'nestSkull');
    D.strike(skull.x, skull.z, 1, 20, { kind: BLOW.BLAST, by: 'boss', src: D.swing() });
    assert(skull.state === STATE.BROKEN, "the nest's great skull breaks");
  },

  // ---------------------------------------------------------------- counts, bones, debris by quality, and a rampage's cost
  budget() {
    const W = wyrm();
    const { D, d, game, world, U, step } = W;
    const bones = rigidBones(U).count;
    const by = {};
    for (const b of D.list) by[b.kind] = (by[b.kind] ?? 0) + 1;
    out(`     forest: ${D.list.length} pieces (${Object.entries(by).map(([k, n]) => `${k} ${n}`).join(', ')}); wreckage pools ${D.wreck.pools.map((p) => p.length).join(' / ')}`);
    // (664 since every tree of the wall and the landmarks break, 2026-11-16; 183 on 2026-11-15, 80 before)
    assert(D.list.length >= 600 && D.list.length <= 760, `${D.list.length} breakables in Cinderwood (600..760)`);
    assert(bones <= 1023 - 60, `${bones} bones in all with the wyrm (${D.batch.bones} the world's), under the 1023 slots with room for the hero (~140)`);
    // debris by quality: one boulder's break
    const one = (q) => {
      const B = build();
      B.D.setQuality(q);
      const b = B.D.list.find((o) => o.kind === 'boulder');
      const a0 = B.game.fx.alpha.count + B.game.fx.add.count;
      B.D.strike(b.x, b.z, 1, 9, { src: B.D.swing() });
      return B.game.fx.alpha.count + B.game.fx.add.count - a0;
    };
    const hi = one(QUALITY.HIGH), lo = one(QUALITY.LOW);
    assert(lo <= hi * 0.6 && lo > 0, `LOW quality throws ${lo} debris glyphs for a boulder's break (HIGH ${hi})`);
    // a 60 s rampage: the wyrm runs circles through the clearing, turning, while meteors land and the wood burns
    gc();
    let worst = 0, sum = 0, frames = 0, peakFx = 0, peakFire = 0, peakBurn = 0;
    const frameMs = new Float64Array(60 * 60);
    let a = 0;
    const R = 19;
    W.place(R, 0, Math.PI);
    game.player.position.set(0, 0, 0);
    for (let i = 0; i < 60 * 60; i++) {
      a += (8 / R) / 60;
      const ux = Math.cos(a) * R, uz = Math.sin(a) * R;
      d.position.set(ux, 0, uz);
      d.yaw = Math.atan2(-Math.sin(a), Math.cos(a)) + Math.sin(i / 90) * 0.6; // (tangent, swinging)
      game.time += 1 / 60;
      d.update(1 / 60);
      if (i % 50 === 0) {
        const mx = Math.cos(a + 1) * 14, mz = Math.sin(a + 1) * 14;
        // a meteor lands (world.impact + ignite, as world.js wires them)
        D.strike(mx, mz, 3, 1.5, { kind: BLOW.BLAST, by: 'boss', src: D.swing() });
        world.scars.ground(mx, mz, 1.5);
        world.fire.ignite(mx, mz, 1.6, 0.7);
        D.ignite(mx, mz, 1.6, 0.7);
      }
      const t0 = performance.now();
      D.update(1 / 60);
      const ms = performance.now() - t0;
      world.fire.update(1 / 60);
      world.scars.update(1 / 60, game.time);
      world.scorch.update(1 / 60);
      game.fx.alpha.update(1 / 60, game.time);
      game.fx.add.update(1 / 60, game.time);
      game.fx.fire.update(1 / 60);
      worst = Math.max(worst, ms);
      frameMs[frames] = ms;
      sum += ms;
      frames++;
      peakFx = Math.max(peakFx, game.fx.alpha.count + game.fx.add.count);
      peakFire = Math.max(peakFire, game.fx.fire.count);
      peakBurn = Math.max(peakBurn, D.burning);
    }
    const down = D.list.length - D.standing;
    out(`     rampage 60 s: ${down} pieces down, ${D.wreckage} wreckage, ${world.scars.count} marks; destructibles.update avg ${(sum / frames).toFixed(3)} ms, worst ${worst.toFixed(2)} ms; peak glyphs ${peakFx}, fire blobs ${peakFire}, alight ${peakBurn}`);
    assert(down >= 20, `the rampage wrecks the clearing (${down} pieces down)`);
    // (the budget of a frame is read on the 99.9th percentile, the 4th slowest of the 3600 frames, and the
    // single slowest frame gets a ceiling of its own: one frame's wall-clock time is the machine's as much
    // as the code's. Measured 2026-11-16, alone and with four suites beside it: avg 0.010 - 0.012 ms,
    // p99.9 0.37 - 0.71 ms, the slowest frame 1.1 - 1.8 ms, every time frame 83 (the first trees to fall:
    // their code's first run), on this build and on `main` alike; CI, its four suites on one shared
    // runner, put that one frame at 4.06 ms against the old `worst < 4`. A hitch of the code's own (a
    // whole mesh rebuilt in a frame) costs tens of ms and still fails the ceiling; many slow frames fail
    // the percentile.)
    const p999 = Float64Array.from(frameMs.subarray(0, frames)).sort()[Math.floor(frames * 0.999) - 1];
    assert(sum / frames < 0.5 && p999 < 1.5 && worst < 8, `destructibles.update: avg ${(sum / frames).toFixed(3)} ms, 99.9th percentile ${p999.toFixed(2)} ms, worst ${worst.toFixed(2)} ms a frame (budget: avg < 0.5, p99.9 < 1.5, worst < 8 in node)`);
    assert(peakBurn <= Math.max(3, Math.round(BREAK.spread.maxBurning)) + 6, `fires alight at the peak: ${peakBurn}`);
    // allocation in the hot paths this owns: a steady frame (the body sweeping, wood burning, logs
    // smouldering, hot ground, the marks) creates no object, array or closure. Measured as heap growth
    // over 2000 frames after a GC, against the same loop without the hot paths. What is left is V8
    // boxing doubles passed to calls (the burning wood's touch / burnCircle, the grid's cells: ~0.7 KB a
    // frame, measured 2026-11-15; the body's 23 sweeps go through sweepRec, which took 2.6 KB down to it),
    // not objects this code makes.
    const B = wyrm();
    // (three trees inside the clearing: in the wall's dense stands the fire spreads and trees burn through
    // and smoulder in the measure, events, not a steady frame; the wall's cost is the rampage's above)
    const tr = B.D.list.filter((b) => b.mat === 'wood' && b.state === STATE.INTACT && Math.hypot(b.x, b.z) < 30).slice(0, 3);
    for (const b of tr) B.D.ignite(b.x, b.z, 0.2, 40); // (burning for the whole measure; the fire field takes the flames)
    B.D.topple(B.D.list.find((b) => b.kind === 'deadTree' && b.state === STATE.INTACT), 1, 0, 'world');
    B.step(3);
    B.world.scorch.burnCircle(0, 0, 4, 0.2, 1);
    B.place(0, 6, 0);
    B.game.events.emit = B.emitRaw; // (the test's own event log allocates: off for the measure)
    B.world.scars.cap = 60; // (so the marks' records are all made before the measure, and recycled in it)
    const loop = (frames, hot) => {
      for (let i = 0; i < frames; i++) {
        B.game.time += 1 / 60;
        const step = i % 200 < 100 ? 0.07 : -0.07;
        for (const h of B.d._hurtPool) h.x += step; // its hurt spheres move as a walk would (the rig is not this module's)
        if (hot) {
          B.d._wreck(1 / 60);
          B.D.update(1 / 60);
          B.world.scorch.update(1 / 60);
          B.world.scars.update(1 / 60, B.game.time);
        }
      }
    };
    loop(3000, true); // warm (JIT, pools, the marks' records)
    loop(3000, false);
    gc();
    let h0 = process.memoryUsage().heapUsed;
    loop(2000, false);
    const base = process.memoryUsage().heapUsed - h0;
    gc();
    h0 = process.memoryUsage().heapUsed;
    loop(2000, true);
    const grew = process.memoryUsage().heapUsed - h0 - base;
    assert(grew / 2000 < 2048, `2000 frames of the body sweeping, wood burning, logs smouldering: ${(grew / 2000).toFixed(0)} bytes a frame over the bare loop (< 2 KB: no object, array or closure a frame; the rest is V8 boxing call arguments)`);
  },
  // ---------------------------------------------------------------- the edge of the open ground (edge.js, ADR-125)
  // The hero's circle and the wyrm's bound follow what stands of the tree wall: nothing moves until a
  // tree of it is down; where one is, the ground ends short of the next one standing behind it.
  edge() {
    const { D, world, log, step, colliders } = build();
    const E = D.edge, X = BREAK.edge, base = CONFIG.world.playerBound, rad = 0.45;
    const hero = (x, z) => { const p = { x, z }; world.resolve(p, rad, base, false, 'hero'); return p; };
    const walk = (a, from = 20, to = 80) => {
      const p = { x: Math.cos(a) * from, z: Math.sin(a) * from };
      for (let r = from; r < to; r += 0.2) {
        p.x += Math.cos(a) * 0.2;
        p.z += Math.sin(a) * 0.2;
        E.keep(p, rad);
      }
      return Math.hypot(p.x, p.z);
    };
    const off = (b, a) => { const da = Math.atan2(b.z, b.x) - a; return Math.abs(Math.atan2(Math.sin(da), Math.cos(da))); };
    assert(E && E.base === base && E.n === X.lanes && E.count > 450 && !E.open && E.version === 0, `the forest has an edge: ${E?.n} lanes round the ${E?.base} m line, ${E?.count} trees close them, nothing open`);
    let worst = 0, gain = 0;
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      worst = Math.max(worst, Math.abs(walk(a) - (base - rad)));
      gain = Math.max(gain, E.bossGain(Math.cos(a) * 30, Math.sin(a) * 30));
    }
    const far = hero(0, 55);
    assert(worst < 1e-6 && gain === 0 && near(Math.hypot(far.x, far.z), base - rad, 1e-6), `the wall standing: the hero is held on the ${base} m circle in every direction (off by ${worst.toExponential(1)} m), a boss gains nothing, world.resolve(.., hero) is the old circle`);

    // one tree of the first row comes down: its lanes open to the tree behind, the rest of the ring stays shut
    const lanesOf = (b) => E._lanes.map((l, i) => (l.length && l[0].b === b ? i : -1)).filter((i) => i >= 0);
    const first = D.list.filter((b) => b.def.edge > 0 && Math.hypot(b.x, b.z) < 34 && lanesOf(b).length >= 2 && lanesOf(b).every((i) => E._lanes[i].length > 1 && E._F0[i] < base + X.seal))[0];
    const mine = lanesOf(first), fr = Math.hypot(first.x, first.z);
    D.strike(first.x, first.z, 0.5, 20, { kind: BLOW.BLUNT, by: 'boss', src: D.swing() });
    E.refresh();
    assert(first.state === STATE.FALLING && !E.open, 'while a tree of the wall is falling its lanes stay shut (it opens the ground once it is down)');
    step(2.5);
    const opened = [];
    for (let i = 0; i < E.n; i++) if (E.R[i] > base + 1e-3) opened.push(i);
    const behind = mine.map((i) => E._lanes[i].find((p) => p.b.state === STATE.INTACT || p.b.state === STATE.FALLING)); // (a tree it fell on may be falling: it closes its lane until it is down)
    assert(first.state === STATE.BROKEN && E.open && E.version >= 1 && mine.every((i) => opened.includes(i)) && mine.every((i, k) => near(E.R[i], Math.min(E.outer, behind[k] ? behind[k].at : E.outer), 1e-3)),
      `a first-row tree (${fr.toFixed(1)} m) down: its ${mine.length} lanes end ${X.margin} m short of the next tree standing behind (${mine.map((i) => E.R[i].toFixed(1)).join(', ')} m), read within ${X.every} s`);
    assert(opened.length <= mine.length + 6, `... and only there: ${opened.length} of ${E.n} lanes moved (a sealed lane with a tree at the line does not give way: the ring does not shift at the first breach)`);
    const midLane = mine[Math.floor(mine.length / 2)], mid = E.laneAngle(midLane);
    const out1 = walk(mid), shut = walk(mid + Math.PI);
    assert(near(out1, E.R[midLane] - rad, 0.05) && near(shut, base - rad, 1e-6), `the hero walks out through it to ${out1.toFixed(2)} m and no further; on the far side of the ring he is still held at ${shut.toFixed(2)} m`);

    // a wide gap torn 20 m deep: the hero has all of it, the wyrm's root a share that grows with its width
    const a0 = Math.atan2(first.z, first.x);
    const wedge = D.list.filter((b) => b.def.edge > 0 && b.state === STATE.INTACT && off(b, a0) < 0.3 && Math.hypot(b.x, b.z) < 52);
    for (const b of wedge) D.topple(b, b.x / Math.hypot(b.x, b.z), b.z / Math.hypot(b.x, b.z), 'world');
    step(3);
    const c = E.lane(Math.cos(a0), Math.sin(a0));
    const deep = walk(a0), g0 = E.bossGain(Math.cos(a0) * 40, Math.sin(a0) * 40), gSide = E.bossGain(Math.cos(a0 + 0.3) * 40, Math.sin(a0 + 0.3) * 40);
    let steep = 0, over = 0;
    for (let i = 0; i < E.n; i++) {
      steep = Math.max(steep, Math.abs(E.G[i] - E.G[(i + 1) % E.n]));
      over = Math.max(over, E.G[i] - (E.R[i] - base));
    }
    assert(wedge.length >= 15 && deep > base + 12 && deep <= E.R[c] - rad + 1e-6, `${wedge.length} trees felled in a wedge 0.6 rad wide: the hero walks out to ${deep.toFixed(1)} m (the lane ends at ${E.R[c].toFixed(1)})`);
    assert(g0 > 4 && g0 <= E.R[c] - base + 1e-6 && gSide < g0 && over < 1e-6 && steep <= X.slope * E.step * base + 1e-6,
      `the wyrm's root may follow ${g0.toFixed(1)} m into the middle of it, ${gSide.toFixed(1)} m at its side, never further than the hero's ground, its share never steeper than ${X.slope} m per m along the ring (${steep.toFixed(2)} m a lane)`);

    // a hero thrown about inside it: never off his ground, never among the standing trees, no leap
    const rng = mulberry32(77);
    const p = { x: Math.cos(a0) * 36, z: Math.sin(a0) * 36 };
    let offGround = 0, jump = 0, nan = 0, inTree = 0, farthest = 0;
    const standing = D.list.filter((b) => b.def.edge > 0 && b.state === STATE.INTACT);
    for (let i = 0; i < 20000; i++) {
      const a = rng() * Math.PI * 2, l = 0.05 + rng() * 0.3;
      const tx = p.x + Math.cos(a) * l, tz = p.z + Math.sin(a) * l;
      p.x = tx;
      p.z = tz;
      world.resolve(p, rad, base, false, 'hero');
      if (!Number.isFinite(p.x + p.z)) nan++;
      const r = Math.hypot(p.x, p.z);
      farthest = Math.max(farthest, r);
      if (r > E.heroAt(p.x, p.z) - rad + 1e-4) offGround++;
      jump = Math.max(jump, Math.hypot(p.x - tx, p.z - tz));
      if (i % 50 === 0) for (const b of standing) if (Math.hypot(b.x - p.x, b.z - p.z) < 0.45 * 0.85 + rad - 1e-3) inTree++;
    }
    assert(!nan && !offGround && !inTree && jump < 1.2 && farthest > base + 4, `20000 random steps from inside the gap: never off his ground, never inside a standing trunk, pushed back ${jump.toFixed(2)} m at most in a step (reached ${farthest.toFixed(1)} m)`);
    // a step sideways out of a deep lane puts him back in the lane, not at the old circle
    let edgeLane = -1;
    for (let k = 1; k < 20 && edgeLane < 0; k++) if (E.R[(c + k) % E.n] < E.R[(c + k - 1) % E.n] - 6) edgeLane = (c + k) % E.n;
    const sa = E.laneAngle(edgeLane) - E.step * 0.3, sr = E.R[(edgeLane + E.n - 1) % E.n] - 3;
    const sp = hero(Math.cos(sa) * sr, Math.sin(sa) * sr);
    assert(edgeLane >= 0 && Math.hypot(sp.x, sp.z) > sr - 0.5 && E.lane(sp.x, sp.z) !== edgeLane, `a step into the standing wall at the gap's side (${sr.toFixed(1)} m out) is pushed back into the gap (${Math.hypot(sp.x, sp.z).toFixed(1)} m out), not dragged in to the old circle`);

    // a tree at the gap's side falling into it is a red blow again (the hero can stand there now)
    const side = standing.filter((b) => off(b, a0) > 0.31 && off(b, a0) < 0.5 && Math.hypot(b.x, b.z) > 36 && Math.hypot(b.x, b.z) < 44 && b.topples && b.h > 6 && !(b.leanTo > 0)).sort((p, q) => off(p, a0) - off(q, a0))[0]; // (not one already leaning: it goes the way it leans)
    const gx = Math.cos(a0) * Math.hypot(side.x, side.z), gz = Math.sin(a0) * Math.hypot(side.x, side.z);
    const tells0 = log.filter((e) => e.n === 'combat:tell').length;
    D.topple(side, gx - side.x, gz - side.z, 'boss');
    step(0.2);
    const farTree = standing.filter((b) => off(b, a0 + Math.PI) < 0.4 && Math.hypot(b.x, b.z) > 42 && b.topples)[0];
    D.topple(farTree, farTree.x, farTree.z, 'boss');
    assert(side.state === STATE.FALLING && !side.quiet && log.filter((e) => e.n === 'combat:tell').length > tells0 && farTree.quiet, 'a tree beside the gap that falls across it tells red (it can land on him there); one falling outward on the far side of the ring still tells nothing');
    step(3);

    // the reset
    const n1 = colliders.circles.length;
    D.reset();
    const back = hero(Math.cos(a0) * 50, Math.sin(a0) * 50);
    assert(!E.open && E.R.every((v) => v === base) && E.G.every((v) => v === 0) && near(Math.hypot(back.x, back.z), base - rad, 1e-6) && colliders.circles.length >= n1, 'the reset: every lane is shut again at once, a hero out there is back on the circle, the trunks are back');

    // a set without a wall that opens: no edge, the circle as before
    const C = build(createCourtyard);
    const q = { x: 60, z: 0 };
    C.world.resolve(q, rad, 40, false, 'hero');
    assert(C.D.edge === null && near(q.x, 40 - rad, 1e-6), 'the Ashfall Courtyard has no edge: the hero is held on its circle (world.resolve falls back to the bound)');
  },

  // ---------------------------------------------------------------- a piece draws where it is (its matrices are placed, not auto-updated)
  // (last: it draws on the destructibles' cosmetic stream, which the scenarios after it would see)
  // ---------------------------------------------------------------- sliced bamboo (BREAK.slice): one cut, the top off at once
  slice() {
    const SL = BREAK.slice;
    const { D, step, log } = build(createWindlessGrove);
    const stalks = D.list.filter((b) => b.kind === 'bamboo');
    assert(stalks.length > 100 && stalks.every((b) => b.slice && b.lightPiece && b.ranged), `the grove's ${stalks.length} stalks are all sliced light pieces`);
    // ---- the hero's quickest cut (power 0.12) at chest height, from the south, on the stalk nearest the
    // middle that stands alone (a clump's other stalks would be cut by the same swing)
    const alone = (x) => !stalks.some((o) => o !== x && Math.hypot(o.x - x.x, o.z - x.z) < 1.8);
    const b = stalks.filter(alone).sort((p, q) => Math.hypot(p.x, p.z) - Math.hypot(q.x, q.z))[0];
    const B = b.body, pos = B.geometry.attributes.position.array, s0 = B.start * 3;
    const y = 1.15;
    const n = D.sweep(b.x, b.z + 1.2, b.x, b.z - 0.3, 0.24, 0.12, { kind: BLOW.CUT, by: 'player', dx: 0, dz: -1, y: y - 0.3, ya: y, yb: y, src: D.swing() });
    assert(n === 1 && b.state === STATE.FALLING && D.struck.broke === 1 && !D.struck.held, `one quick cut (power 0.12) cuts it through (it falls; the blade goes on: nothing held it)`);
    assert(near(b.cutY, y, 1e-6) && near(B.cutY, y, 1e-6), `cut where the blade met it: ${b.cutY.toFixed(2)} m`);
    // its stump: as high as the cut, on a slant
    const ST = b.stub, sp = ST.geometry.attributes.position.array;
    let top = 0, low = Infinity;
    for (let k = ST.start * 3 + 1; k < (ST.start + ST.count) * 3; k += 3) {
      top = Math.max(top, sp[k]);
      if (sp[k] > y * 0.5) low = Math.min(low, sp[k]);
    }
    assert(ST.visible && top > y && top < y + 0.4 && low < y && low > y - 0.4, `its stump stands ${low.toFixed(2)} - ${top.toFixed(2)} m: the cut, slanted`);
    // the top: nothing of it below the cut, and it moves on the very next frame
    let below = 0;
    for (let t = 0; t < B.tris; t++) {
      const k = s0 + t * 9;
      const cy = (pos[k + 1] + pos[k + 4] + pos[k + 7]) / 3, deg = pos[k] === pos[k + 3] && pos[k + 1] === pos[k + 4] && pos[k] === pos[k + 6];
      if (cy < y - 0.02 && !deg) below++;
    }
    const before = pos.slice(s0, s0 + B.count * 3);
    step(1 / 60);
    let moved = 0;
    for (let k = 0; k < before.length; k++) if (pos[s0 + k] !== before[k]) moved++;
    assert(below === 0 && moved > 0, `the top keeps nothing below the cut (${below} triangles) and moves the first frame (${moved / 3 | 0} vertices)`);
    // it slides off the cut along the blow (north), then goes over: lands within its fall time
    step(SL.slideT);
    const p1 = b.pivot.position.z;
    let frames = 0;
    while (b.state === STATE.FALLING && frames < 200) { step(1 / 60); frames++; }
    assert(p1 < -0.05 && b.state === STATE.BROKEN && frames / 60 <= b.T + 0.05, `it slides off along the blow (${(-p1).toFixed(2)} m in ${SL.slideT} s), goes over and lands in ${(SL.slideT + frames / 60).toFixed(2)} s`);
    assert(!log.some((e) => e.n === 'combat:tell' || e.n === 'combat:flash'), 'quietly: no tell, no flash (a light piece)');
    // ---- a body brushing past does not slice; fire burns it as before
    const c = stalks.find((x) => x !== b && x.state === STATE.INTACT);
    D.sweep(c.x - 1, c.z, c.x + 1, c.z, 0.3, 0.2, { kind: BLOW.BLUNT, by: 'boss', brush: true, y: 1, src: D.swing() });
    assert(c.state === STATE.INTACT, 'a body brushing past does not slice it');
    // ---- a boss's blow slices too; the reset stands every stalk whole again
    D.strike(c.x, c.z + 0.4, 0.6, 0.3, { kind: BLOW.CUT, by: 'boss', y: 1.6, src: D.swing() });
    assert(c.state === STATE.FALLING && near(c.cutY, 1.6, 1e-6), `a boss's cut slices it at ${c.cutY.toFixed(2)} m`);
    step(2);
    D.reset();
    assert([b, c].every((x) => x.state === STATE.INTACT && x.body.cutY === 0 && x.body.visible && !x.stub.visible), 'the reset: they stand whole again');
  },

  // ---------------------------------------------------------------- bites (BREAK.chip, ?chip=a): a blow takes the bricks where it struck
  bite() {
    const C = BREAK.chip;
    setLook('chip', 'a');
    try {
      const { D, log, step } = build();
      const folded = (a, k) => a[k] === a[k + 3] && a[k] === a[k + 6] && a[k + 1] === a[k + 4] && a[k + 1] === a[k + 7] && a[k + 2] === a[k + 5] && a[k + 2] === a[k + 8];
      // ---- a tree of the forest (a run of the trees' mesh): a blade at 1.1 m, from the south
      const t = D.list.filter((b) => b.kind === 'tree' && b.body.parts > 1 && b.order.length > 0).sort((p, q) => Math.hypot(p.x, p.z) - Math.hypot(q.x, q.z))[0];
      const B = t.body, pos = B.geometry.attributes.position.array, s0 = B.start * 3;
      const before = pos.slice(s0, s0 + B.count * 3);
      const cut = (y = 1.1, k = 0.25) => D.sweep(t.x, t.z + t.r + 1, t.x, t.z + 0.1, 0.55, (k * t.hpMax) / BREAK.mats.wood.take.cut, { kind: BLOW.CUT, by: 'player', dx: 0, dz: -1, y: y - 0.3, ya: y, yb: y, src: D.swing() });
      const hp0 = t.hp;
      assert(cut() === 1 && near(t.hp, hp0 - 0.25 * t.hpMax, 1e-6), `a cut worth a quarter of a tree's structure takes a quarter of it (${(t.hp / t.hpMax).toFixed(2)} left): the blows' arithmetic is unchanged`);
      const reach = Math.min(C.reach[1], Math.max(C.reach[0], 0.55 + C.pad));
      let n = 0, far = 0, section = 0, bad = 0, trunk = 0, set = 0;
      for (let i = 0; i < B.nb; i++) {
        const d = Math.hypot(B.cen[i * 3] - t.x, B.cen[i * 3 + 1] - 1.1, B.cen[i * 3 + 2] - (t.z + 0.1));
        if (d <= reach) section++;
        if (!B.bit[i]) continue;
        n++;
        if (B.tpart[i] === 0) trunk++;
        far = Math.max(far, d);
        // (a trunk's brick is set back into it by its depth along the way in; a leaf is folded away)
        for (let j = 0; j < 2; j++) {
          const f = B.btri[i * 2 + j];
          if (f < 0) continue;
          const k = f * 9, dep = B.bdep[i];
          if (dep > 0) {
            if (!near(pos[s0 + k] - before[k], B.bnor[i * 3] * dep, 1e-5) || !near(pos[s0 + k + 7] - before[k + 7], B.bnor[i * 3 + 1] * dep, 1e-5)) bad++;
            set++;
            // the way in points at the trunk's axis
            if ((B.cen[i * 3] - t.x) * B.bnor[i * 3] + (B.cen[i * 3 + 2] - t.z) * B.bnor[i * 3 + 2] > 0) bad++;
          } else if (!folded(pos, s0 + k)) bad++;
        }
      }
      assert(n >= 1 && n === Math.max(1, Math.round(0.25 * section)) && far <= reach + 1e-6 && bad === 0 && D.bitten === n, `it knocks out ${n} of the ${section} bricks within ${reach.toFixed(2)} m of where the blade met it (a quarter, nearest first: the farthest ${far.toFixed(2)} m; ${trunk} of the trunk), ${set} triangle(s) set back into the trunk toward its axis`);
      let kept = 0;
      for (let i = 0; i < B.nb; i++) {
        if (B.bit[i]) continue;
        const k = B.btri[i * 2] * 9;
        if (pos[s0 + k] === before[k] && pos[s0 + k + 4] === before[k + 4] && pos[s0 + k + 8] === before[k + 8]) kept++;
      }
      assert(kept === B.nb - n && B.nb < B.tris, `every other brick is where it was (${kept}); its ${B.tris} triangles are ${B.nb} bricks (a trunk's quads pair up, foliage stays single)`);
      assert(t.dropped === 0 && B.shown.every((v) => v === 1), 'with bites on a tree does not drop its crown parts in order: it loses what the blows took');
      // ... cut on until it falls: the section under the blade is gone as its structure runs out
      let cuts = 1;
      while (t.state === STATE.INTACT && cuts < 8) {
        step(0.25);
        cut();
        cuts++;
      }
      let left = 0;
      for (let i = 0; i < B.nb; i++) if (!B.bit[i] && B.tpart[i] === 0 && Math.hypot(B.cen[i * 3] - t.x, B.cen[i * 3 + 1] - 1.1, B.cen[i * 3 + 2] - (t.z + 0.1)) <= reach) left++;
      assert(t.state !== STATE.INTACT && cuts >= 4 && cuts <= 5 && left <= 1, `${cuts} such cuts fell it, and the trunk is cut through where they bit (${left} brick(s) of that section left)`);
      assert(log.filter((e) => e.n === 'world:impact' && e.kind === 'wear' && e.id === t.id).length >= 2, 'its stages are still told (world:impact wear)');
      // ---- a piece of the rigid batch: a standing stone, struck on its south face
      const s = D.list.find((b) => b.kind === 'stone' && b.bricks && b.topples);
      const K = s.bricks, idx = K.index.array, saved = idx.slice(K.i0, K.i0 + K.saved.length);
      D.strike(s.x, s.z + s.r + 0.3, 0.6, 0.3 * s.hpMax, { kind: BLOW.BLUNT, by: 'boss', y: 1.2, src: D.swing() });
      let sn = 0, sFar = 0, sBad = 0, south = 0, sSet = 0;
      for (let i = 0; i < K.T; i++) {
        if (!K.bit[i]) continue;
        sn++;
        if (K.cen[i * 3 + 2] > 0) south++;
        sFar = Math.max(sFar, Math.hypot(K.cen[i * 3], K.cen[i * 3 + 1] - 1.2, K.cen[i * 3 + 2] - (s.r + 0.3)));
        for (let j = 0; j < 2; j++) {
          const f = K.tri[i * 2 + j];
          if (f < 0) continue;
          if (K.dep[i] > 0) {
            // set back into the stone by its depth, the way in (toward its axis, or down from its top)
            const k = (K.v0 + f * 3) * 3;
            for (let c = 0; c < 3; c++) if (!near(K.pos.array[k + c] - K.psaved[f * 9 + c], K.nor[i * 3 + c] * K.dep[i], 1e-5)) sBad++;
            if (K.cen[i * 3] * K.nor[i * 3] + (K.cen[i * 3 + 1] - s.h / 2) * K.nor[i * 3 + 1] + K.cen[i * 3 + 2] * K.nor[i * 3 + 2] > 0) sBad++;
            sSet++;
          } else if (!(idx[K.i0 + f * 3] === idx[K.i0 + f * 3 + 1] && idx[K.i0 + f * 3] === idx[K.i0 + f * 3 + 2])) sBad++;
        }
      }
      assert(sn >= 1 && sn === K.n && sBad === 0 && south >= sn * 0.9 && sFar <= 0.6 + s.r + C.pad + 1e-6 && s.state === STATE.INTACT, `a blow on a standing stone's south face takes ${sn} of its ${K.T} bricks (${south} on that side; all within ${sFar.toFixed(2)} m of the blow's centre): ${sSet} triangle(s) set back into the stone in the batch's positions`);
      // ---- a blast eats the side that faced it
      const o = D.list.filter((b) => b.kind === 'tree' && b.state === STATE.INTACT && b !== t && b.body.parts > 3 && b.h > 5).sort((p, q) => Math.hypot(p.x, p.z) - Math.hypot(q.x, q.z))[0];
      D.strike(o.x + 3, o.z, 4.5, 0.5 * o.hpMax, { kind: BLOW.BLAST, by: 'boss', y: 1, src: D.swing() });
      let east = 0, west = 0;
      for (let i = 0; i < o.body.nb; i++) if (o.body.bit[i]) o.body.cen[i * 3] > o.x ? east++ : west++;
      assert(east + west >= 4 && east > west * 1.5, `a blast east of a tree eats its east side (${east} bricks there, ${west} on the far side: the trunk's own)`);
      // ---- a landmark's bone (prop art)
      const rib = D.list.find((b) => b.kind === 'elderRib');
      D.strike(rib.x, rib.z, 1.2, 0.3 * rib.hpMax, { kind: BLOW.BLUNT, by: 'boss', y: 1.5, src: D.swing() });
      assert(rib.body.nBit >= 1 && rib.state === STATE.INTACT, `a rib of the Elder Wyrm loses ${rib.body.nBit} brick(s) to a blow`);
      // ---- a floor slab and a piece that only chips keep their own rules
      const flag = D.list.find((b) => b.floor);
      const fb = D.bitten;
      if (flag) D.strike(flag.x, flag.z, 0.5, 0.4, { kind: BLOW.BLUNT, by: 'boss', y: 0.1, src: D.swing() });
      assert(D.bitten === fb, 'a floor slab is not bitten (it cracks and breaks as a slab)');
      // ---- the reset
      step(2.5);
      D.reset();
      let diff = 0;
      for (let k = 0; k < before.length; k++) if (pos[s0 + k] !== before[k]) diff++;
      let idiff = 0;
      for (let k = 0; k < saved.length; k++) if (idx[K.i0 + k] !== saved[k]) idiff++;
      for (let k = 0; k < K.psaved.length; k++) if (K.pos.array[K.v0 * 3 + k] !== K.psaved[k]) idiff++;
      assert(diff === 0 && idiff === 0 && B.nBit === 0 && K.n === 0 && D.bitten === 0 && o.body.nBit === 0, 'the reset: every brick is back (the tree vertex for vertex, the stone index for index and vertex for vertex)');
      // ---- EVERY level (the level registry, so a new one is covered without being named here) and the
      // training room: it lists breakables; every piece in it that takes structure has bricks; a blow
      // on one of each kind bites it; the reset undoes it. (Cinderwood is the forest above, again here)
      const sets = LEVELS.map((L) => [L.name, L.buildSet]);
      // (the training room, ?stage=lab, ADR-099, is the one stage left whole on purpose: a measuring stage
      // of tiles, low walls and corner pylons, outside the fight; nothing of it is listed to break)
      const room = createTrainingRoom(createSharedUniforms(), new Colliders());
      assert(!(room.breakables?.length > 0), 'the training room lists no breakables (a measuring stage, whole on purpose: ARCHITECTURE.md "Destruction")');
      assert(sets.length >= 4 && sets.every(([, make]) => typeof make === 'function'), `the levels to check: ${sets.map(([n]) => n).join(', ')}`);
      for (const [name, make] of sets) {
        const A = build(make), L = A.D.list;
        const able = L.filter((b) => !b.floor && b.hpMax < Infinity);
        if (!able.length) {
          assert(false, `${name}: no breakable piece that takes structure (a level lists its background objects in its set's \`breakables\`: ARCHITECTURE.md "Destruction")`);
          continue;
        }
        const none = able.filter((b) => !(b.ranged ? b.body.tris > 0 : b.bricks?.T > 0));
        const kinds = [...new Set(able.map((b) => b.kind))];
        let bitten = 0, set = 0, folded = 0, missed = [];
        for (const kind of kinds) {
          const b = able.find((x) => x.kind === kind && x.state === STATE.INTACT && !(x.top && x.top.state === STATE.INTACT));
          if (!b) continue;
          const n0 = A.D.bitten;
          A.D.strike(b.x + b.r, b.z, 0.7, 0.3 * b.hpMax + 0.2, { kind: BLOW.BLUNT, by: 'boss', y: Math.min(1.2, b.y0 + b.h * 0.5), src: A.D.swing() });
          // (a sliced piece, bamboo, is cut through, not bitten: BREAK.slice)
          if (b.slice ? b.state === STATE.INTACT : A.D.bitten === n0) missed.push(kind);
          bitten += A.D.bitten - n0;
          const K = b.bricks;
          if (K) for (let i = 0; i < K.T; i++) if (K.bit[i]) K.dep[i] > 0 ? set++ : folded++;
        }
        A.step(0.5);
        A.D.reset();
        const left = L.filter((b) => (b.bricks?.n ?? 0) > 0 || (b.ranged && b.body.nBit > 0)).length;
        assert(none.length === 0 && missed.length === 0 && bitten > 0 && left === 0, `${name}: all ${able.length} pieces that take structure have bricks; a blow on one of each of its ${kinds.length} kinds took ${bitten} (${set} set back, ${folded} folded${missed.length ? '; none from ' + missed.join(', ') : ''}); the reset puts them back`);
      }
      // ---- off (the default): nothing is bitten
      setLook('chip', '0');
      const t2 = D.list.find((b) => b.kind === 'tree' && b.state === STATE.INTACT && b.body.parts > 1);
      D.strike(t2.x, t2.z + 0.3, 0.6, 0.3 * t2.hpMax, { kind: BLOW.CUT, by: 'player', y: 1, src: D.swing() });
      assert(D.bitten === 0 && !(t2.body.nBit > 0) && t2.hp < t2.hpMax, 'with bites off (?chip=0) a blow takes structure and no bricks');
    } finally {
      setLook('chip', null);
      reseedBreaks();
    }
  },

  placed() {
    // (2026-11-16: the pieces are a tree outside the scene, their nodes do not auto-update; destructibles
    // `_place` puts a piece's world matrices right when it moves. The batch draws each body from its
    // matrixWorld: here every body's must equal what three would compute from the transforms, in every
    // state a piece can be in)
    const C = build(createCourtyard);
    const { D, step } = C;
    const m = new THREE.Matrix4();
    const wrong = () => {
      let bad = 0;
      for (const b of D.list) {
        if (b.def.look === 'range' && !b.node.parent) continue;
        for (const o of [b.body, b.stub, b.held]) {
          if (!o?.isMesh || !o.visible) continue;
          // what three would make of it: the chain's local matrices, freshly composed
          m.identity();
          for (let n = o; n && n !== D.pieces; n = n.parent) {
            const L = new THREE.Matrix4().compose(n.position, n.quaternion, n.scale);
            m.premultiply(L);
          }
          const a = o.matrixWorld.elements, e2 = m.elements;
          if (e2.some((v, i) => Math.abs(v - a[i]) > 1e-4)) bad++;
        }
      }
      return bad;
    };
    assert(wrong() === 0, 'built: every body draws where it stands');
    const pil = D.list.filter((b) => b.kind === 'pillar' && b.topples && b.state === STATE.INTACT);
    D.strike(pil[0].x, pil[0].z, 0.3, 0.2, { kind: BLOW.CUT, dx: 1, dz: 0, src: D.swing() });
    step(4 / 60);
    assert(pil[0].shake > 0 && wrong() === 0, 'shaken: mid-shudder it draws where its pivot is');
    D.topple(pil[1], 1, 0, 'world');
    step(0.4);
    assert(pil[1].state === STATE.FALLING && wrong() === 0, 'toppling: mid-fall it draws where it is going over');
    const top = D.list.find((b) => b.kind === 'colossus' && b.base);
    D.topple(top, 1, 0, 'world');
    step(0.7);
    assert(top.state === STATE.FALLING && wrong() === 0, 'a colossus coming off its cut: drawn where it is');
    const bo = D.list.find((b) => b.kind === 'boulder' && b.lift > 0 && b.state === STATE.INTACT);
    D.take(bo);
    D.carry(bo, bo.x + 1, 2.5, bo.z, 0.6, 1.2);
    const fl = D.floor.find((b) => b.state === STATE.INTACT);
    D.take(fl);
    D.carry(fl, fl.x, 1.8, fl.z, 0.3, 0.5);
    assert(wrong() === 0, 'carried: a boulder and a slab in a boss\'s hands are drawn there');
    D.throwTo(bo, bo.x + 6, bo.z, { time: 0.8 });
    step(0.3);
    assert(bo.state === STATE.FLYING && wrong() === 0, 'thrown: drawn in the air where it flies');
    step(3);
    D.reset();
    assert(wrong() === 0 && D.list.every((b) => b.pivot.position.lengthSq() === 0), 'restored: every piece drawn where it stood');
    const w = D.wreck.pools.flat().every((e) => e.mesh.matrixWorld.equals(e.mesh.matrix));
    assert(w, 'the wreckage\'s meshes are placed as they lie down (their world matrix is their own)');

    // (2026-11-16, the merge with ADR-120: Cinderwood's trees and landmarks are 'range' pieces POSED by
    // rewriting their vertices (destructibles RangeBody.pose), never nodes. In each state ADR-120 added
    // (a stage reached, the lean, a tree falling, carried, thrown, its crown burning down, the reset)
    // every shown vertex must be its home turned by the pivot (and the lean) about the base, no tree may
    // join the pieces' tree, nothing may join the scene, and the rigid pieces beside it still draw where
    // they are)
    const F = build();
    const FD = F.D;
    const qL = new THREE.Quaternion(), ax = new THREE.Vector3(), v = new THREE.Vector3(), qq = new THREE.Quaternion();
    const off = (b) => {
      const body = b.body, a = body.geometry.attributes.position.array, s = body.start * 3, H = body.home;
      qq.copy(b.pivot.quaternion);
      if (b.lean > 1e-4) qq.multiply(qL.setFromAxisAngle(ax.set(b.ldz, 0, -b.ldx), b.lean));
      const p = b.pivot.position;
      let worst = 0;
      for (let part = 0, v0 = 0; part < body.ends.length; part++) {
        const v1 = body.ends[part];
        if (body.visible && body.shown[part]) {
          for (let k = v0; k < v1; k += 5) {
            v.set(H[k * 3] - b.x, H[k * 3 + 1], H[k * 3 + 2] - b.z).applyQuaternion(qq);
            worst = Math.max(worst, Math.abs(v.x + b.x + p.x - a[s + k * 3]), Math.abs(v.y + p.y - a[s + k * 3 + 1]), Math.abs(v.z + b.z + p.z - a[s + k * 3 + 2]));
          }
        }
        v0 = v1;
      }
      return worst;
    };
    const scene = () => {
      let inScene = 0, auto = 0, ranged = 0;
      FD.root.traverse(() => inScene++);
      FD.pieces.traverse((o) => { if (o !== FD.pieces && o.matrixAutoUpdate) auto++; });
      for (const b of FD.list) if (b.ranged && b.node.parent) ranged++;
      return inScene <= 4 && auto === 0 && ranged === 0;
    };
    const fwrong = () => {
      let bad = 0;
      for (const b of FD.list) {
        if (b.ranged) continue;
        for (const o of [b.body, b.stub]) {
          if (!o?.isMesh || !o.visible) continue;
          m.identity();
          for (let n = o; n && n !== FD.pieces; n = n.parent) m.premultiply(new THREE.Matrix4().compose(n.position, n.quaternion, n.scale));
          if (m.elements.some((x, i) => Math.abs(x - o.matrixWorld.elements[i]) > 1e-4)) bad++;
        }
      }
      return bad;
    };
    const TOL = 2e-3; // (float32 vertices 70 m out)
    const trees = FD.list.filter((b) => b.kind === 'tree' && !b.wall && b.state === STATE.INTACT && b.order.length > 1 && b.topples && b.lift > 0).sort((p, q) => Math.hypot(p.x, p.z) - Math.hypot(q.x, q.z));
    const [t1, t2, t3, t4] = trees;
    // a stage and the lean (its last stage: it creaks over along the blow)
    t1.hp = t1.hpMax * (BREAK.wear.at[2] - 0.02);
    FD._wearTo(t1, 1, 0, 'boss');
    FD._wake(t1);
    F.step(BREAK.wear.leanTime * 0.5);
    assert(t1.wear === 3 && t1.lean > 0.02 && t1.dropped >= 1 && off(t1) < TOL && scene(), `a tree at its last stage: ${t1.dropped} parts dropped, leaning ${t1.lean.toFixed(2)} rad, its vertices where its pose puts them (off ${off(t1).toExponential(1)} m); no node of it anywhere`);
    // a rigid piece shuddering beside it, and a tree falling
    const st = FD.list.find((b) => !b.ranged && b.topples && b.state === STATE.INTACT && b.mat === 'stone');
    FD.strike(st.x, st.z, 0.3, 0.2, { kind: BLOW.CUT, dx: 1, dz: 0, src: FD.swing() });
    FD.topple(t2, 0, 1, 'world');
    F.step(4 / 60);
    assert(st.shake > 0 && fwrong() === 0 && scene(), 'a stone of the circle mid-shudder draws where its pivot is, while a tree goes over beside it');
    F.step(0.3);
    assert(t2.state === STATE.FALLING && off(t2) < TOL && scene(), `a tree mid-fall is posed where it is going over (off ${off(t2).toExponential(1)} m)`);
    // a tree in the wyrm's jaws, then thrown
    FD.take(t3);
    FD.carry(t3, t3.x + 1, 2, t3.z, 0.5, 1);
    const carried = off(t3);
    FD.throwTo(t3, t3.x + 8, t3.z, { time: 0.8 });
    F.step(0.3);
    assert(carried < TOL && t3.state === STATE.FLYING && off(t3) < TOL && scene(), `a tree carried, then thrown: posed where it is held (off ${carried.toExponential(1)} m) and where it flies (${off(t3).toExponential(1)} m)`);
    // a crown burning down
    FD.ignite(t4.x, t4.z, 0.3, 1);
    F.step(t4.burnLife * 0.5);
    assert(t4.burn > 0 && t4.dropped >= 1 && off(t4) < TOL && scene(), `a burning tree drops its crown part by part (${t4.dropped} gone), what is left where it stands`);
    F.step(4);
    FD.reset();
    const back = [t1, t2, t3, t4].every((b) => b.body.visible && b.body.shown.every((x) => x === 1) && off(b) < 1e-6);
    assert(back && fwrong() === 0 && scene(), 'restored: the trees stand whole where they stood, every rigid piece drawn where it stood, nothing joined the scene');
  },

  // (last: it draws from the destructibles' own stream, and the scenarios before it are as on main)
  // ---------------------------------------------------------------- the Foxfire Terrace: its round floor, its rim, what burns, what only chips (world/foxTerrace.js)
  terrace() {
    const W = build(createFoxTerrace);
    const { D, set, colliders, step, U } = W;
    const R = TERRACE.r, RK = R + TERRACE.kerb;
    const F = D.floor, L = D.list;
    // the paving: cut to the round, every slab breakable, the disc paved
    const ring = set.slabs.filter((s) => Math.hypot(s.x, s.z) < RK + 0.2);
    let area = 0;
    for (const s of ring) {
      let a = 0;
      for (let k = 0; k < s.outline.length; k++) {
        const p = s.outline[k], q = s.outline[(k + 1) % s.outline.length];
        a += (p[0] * q[1] - q[0] * p[1]) / 2;
      }
      area += Math.abs(a);
    }
    const out = Math.max(...ring.flatMap((s) => s.outline.map(([x, z]) => Math.hypot(x, z))));
    assert(F.length >= 250 && ring.length >= 220 && area > 0.75 * Math.PI * RK * RK && out < RK + 0.05 && F.every((b) => b.def.look === 'range' && !b.colliders.length), `the terrace: ${ring.length} slabs and kerb stones within r ${RK} (none past ${out.toFixed(2)} m), ${((100 * area) / (Math.PI * RK * RK)).toFixed(0)} % of the disc paved; ${F.length} floor pieces in all with the steps and the path, each a range piece`);
    const near = [];
    assert(D.floorNear(0, 0, 6, near, { max: 40 }) >= 30, `${near.length} slabs within 6 m of the centre for his terrain moves (floorNear)`);
    // the rim: ten lanterns, six stone foxes, eight charm posts; the two landmarks
    const by = (k) => L.filter((b) => b.kind === k);
    const lan = by('lantern'), fox = by('foxStatue'), post = by('charmPost');
    const rOf = (b) => Math.hypot(b.x, b.z);
    assert(lan.length === TERRACE.lanterns && lan.every((b) => Math.abs(rOf(b) - TERRACE.lanternR) < 0.05 && b.def.look === 'prop'), `${lan.length} stone lanterns on the rim (r ${TERRACE.lanternR}, prop art)`);
    assert(fox.length === TERRACE.statues && fox.every((b) => Math.abs(rOf(b) - TERRACE.statueR) < 0.05 && !b.topples && b.lift === 0 && b.stub && b.def.look === 'prop'), `${fox.length} seated stone foxes on plinths (r ${TERRACE.statueR}): they do not topple, nobody lifts them, a plinth is left`);
    assert(post.length === TERRACE.posts && post.every((b) => Math.abs(rOf(b) - TERRACE.postR) < 0.05 && b.mat === 'wood' && b.burns && b.def.look === 'prop' && b.colliders.every((c) => c.soft)), `${post.length} charm posts outside the rim (r ${TERRACE.postR}): wood that burns, drawn in prop art, soft colliders`);
    const marks = [...by('greatFox'), ...by('spiritGate')];
    assert(marks.length === 2 && marks.every((b) => b.hpMax === Infinity && !b.topples && b.colliders.length >= 1 && b.x * TERRACE.greatFox.x !== 0 && b.z < 0), 'the great fox (west) and the spirit gate (east): in the northern half, they only chip (hp Infinity), on colliders');
    // nothing tall on the near side of the ring (ADR-112's rule)
    const tall = L.filter((b) => !b.floor && b.z > 6 && b.y0 + b.h > 3.2 && rOf(b) < TERRACE.postR + 1.5);
    assert(tall.length === 0, `nothing over 3.2 m stands on the terrace's near side (${tall.map((b) => `${b.kind} ${b.x.toFixed(0)},${b.z.toFixed(0)}`).join(' ')})`);
    // the way up: from the spawn to the middle, no collider in the way (a hero 0.45 m wide)
    const sp = { x: TERRACE.bonfire.x + 0.6, z: TERRACE.bonfire.z - 1.7 };
    const block = colliders.circles.filter((c) => {
      const dx = -sp.x, dz = -sp.z, t = Math.max(0, Math.min(1, ((c.x - sp.x) * dx + (c.z - sp.z) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(sp.x + dx * t - c.x, sp.z + dz * t - c.z) < c.r + 0.45;
    });
    assert(block.length === 0, `the way from the spawn (${sp.x}, ${sp.z}) up the path to the middle is clear (${block.map((c) => `${c.tag} ${c.x.toFixed(1)},${c.z.toFixed(1)}`).join(' ')})`);
    // a stone fox breaks to its plinth
    const f = fox[0];
    D.strike(f.x, f.z, 0.8, 20, { kind: BLOW.BLUNT, by: 'boss', src: D.swing() });
    step(0.5);
    assert(f.state === STATE.BROKEN && !f.body.visible && f.stub.visible && colliders.circles.includes(f.stubCollider), 'a heavy blow breaks a stone fox: its body goes, its plinth (and a collider) stays');
    // a charm post catches and burns through
    const p = post[0];
    assert(D.ignite(p.x, p.z, 0.8, 1) >= 1 && p.burn > 0, 'fire lands on a charm post: it catches (wood with prop art burns as the dead trees do)');
    let t = 0;
    while (p.state === STATE.INTACT && t < 60) {
      step(0.5);
      t += 0.5;
    }
    assert(p.state === STATE.BROKEN && p.burnt && p.stub.visible, `it burns through in ${t.toFixed(1)} s and leaves its snapped foot`);
    // the landmarks only chip
    for (const m of marks) D.strike(m.x, m.z, 1.5, 30, { kind: BLOW.BLAST, by: 'boss', src: D.swing() });
    step(0.5);
    assert(marks.every((m) => m.state === STATE.INTACT && m.body.visible), 'a blast of 30 on each landmark: they stand (they chip, they do not fall)');
    D.reset();
    assert(L.every((b) => b.state === STATE.INTACT), 'the reset: everything stands again');
    // the budget: no more bones than the courtyard's (443 measured on 2026-11-22), the set's own draw meshes
    const bones = rigidBones(U).count;
    let tris = 0;
    set.group.traverse((o) => { if (o.isMesh && o.visible) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
    const meshes = [];
    set.group.traverse((o) => { if (o.isMesh && o.visible) meshes.push(o.name); });
    assert(bones <= 443, `${bones} bones (the courtyard's 443 or fewer); ${meshes.length} draw meshes with the set alone (${meshes.join(', ')}), ${Math.round(tris)} triangles`);
  },
};
const near = (a, b, eps) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps;
function near0(a, b, eps = 1e-6) {
  return near(a, b, eps);
}

// `all`, or a comma list; ABYSS_SKIP (a comma list) leaves scenarios out of `all` (tests/run.mjs runs
// `budget` on its own, after the parallel suites: its frame times are wall-clock)
const skip = new Set((process.env.ABYSS_SKIP ?? '').split(',').map((s) => s.trim()).filter(Boolean));
for (const n of skip) if (!S[n]) { out(`unknown scenario in ABYSS_SKIP: ${n}`); process.exit(2); }
const BITES_OFF = new Set(['wear', 'placed']);
const names = SCEN === 'all' ? Object.keys(S).filter((n) => !skip.has(n)) : SCEN.split(',');
for (const n of names) {
  if (!S[n]) { out(`unknown scenario ${n}`); process.exit(2); }
  out(`\n== WORLD ${n.toUpperCase()}`);
  // (bites are on by default, ADR-132: a tree then loses what the blows took, not its crown parts in
  // stages. These scenarios check the stages, which is what ?chip=0 plays; `bite` checks the bites)
  if (BITES_OFF.has(n)) setLook('chip', '0');
  try {
    S[n]();
  } catch (err) {
    fails++;
    out('FAIL', `${n} threw: ${err?.stack ?? err}`);
  } finally {
    if (BITES_OFF.has(n)) setLook('chip', null);
  }
}
if (errors.length) { fails++; out('FAIL console errors:\n  ' + errors.slice(0, 8).join('\n  ')); }
out(fails ? `\n${fails} FAILED` : '\nall world checks passed');
process.exit(fails ? 1 : 0);
