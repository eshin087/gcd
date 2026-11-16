// The world's destruction, headless (ADR-107; ARCHITECTURE.md → "Destruction"): the REAL Colliders,
// Scorch, GroundFire, Scars and Destructibles on the REAL sets (the forest, the courtyard), wired
// like src/world/world.js; the hero and the boss are small stand-ins that record what lands on them.
// usage: node world.mjs <repoRoot> [scenario]
//   scenario: sets | chip | fell | cover | fire | throw | reset | grid | body | wreck | spread | budget | all
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
const { Destructibles, STATE } = await imp('src/world/destructibles.js');
const { BREAK, BLOW, FIRE, SCAR } = await imp('src/world/breakTuning.js');
const { createForest } = await imp('src/world/forest.js');
const { createCourtyard } = await imp('src/world/courtyard.js');
const { createThroneHall } = await imp('src/world/throneHall.js');
const { TELL, RESULT } = await imp('src/combat/rules.js');
const { Dragon } = await imp('src/entities/dragon/dragon.js');
const { TUNING: WYRM } = await imp('src/entities/dragon/tuning.js');
const { QUALITY } = await imp('src/world/breakTuning.js');
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
    resolve: (pos, r, b, soft) => colliders.resolve(pos, r, b, soft), setPusher() {}, clearPushers() {},
  };
  world.scorch = new Scorch(U, game);
  world.fire = new GroundFire(game, world, density);
  world.scars = new Scars(game, set.scarInk);
  world.destructibles = new Destructibles(game, world, set);
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
    for (const [name, make, kinds] of [['forest', createForest, ['tree', 'deadTree', 'stone', 'boulder', 'flagstone', 'bone']], ['courtyard', createCourtyard, ['pillar', 'lantern']], ['throne', createThroneHall, ['shard', 'slab', 'hover']]]) {
      const { D, set, colliders, U } = build(make);
      const L = D.list;
      // (Cinderwood: 183 since the whole clearing breaks, 2026-11-15; it was 80)
      assert(L.length >= 20 && L.length <= 240, `${name}: ${L.length} breakables (20..240)`);
      for (const k of kinds) assert(L.some((b) => b.kind === k), `${name}: has a breakable ${k}`);
      if (name === 'forest') {
        // everything the fight can reach: no tree within 42 m of the centre is left in the static meshes
        const trees = L.filter((b) => b.mat === 'wood');
        assert(trees.some((b) => Math.hypot(b.x, b.z) > 40) && trees.every((b) => Math.hypot(b.x, b.z) < 42), `forest: the trees out to 42 m break (${trees.length}; the farthest ${Math.max(...trees.map((b) => Math.hypot(b.x, b.z))).toFixed(1)} m)`);
        assert(L.every((b) => b.mat !== 'wood' || b.colliders.every((c) => c.soft === true)), 'forest: the trunks of breakable wood are soft colliders (the wyrm ploughs through them)');
      }
      assert(L.every((b) => Number.isFinite(b.x + b.z + b.r + b.h) && b.r > 0 && b.h > 0 && b.hp > 0), `${name}: every breakable has a footprint, a height and structure`);
      assert(L.every((b) => b.colliders.every((c) => colliders.circles.includes(c))), `${name}: their colliders are the world's own circles`);
      assert(L.every((b) => b.node.parent === D.root && b.body.geometry.attributes.position.count > 0), `${name}: each has its own node and body`);
      assert(D.root.parent === set.group, `${name}: the breakables hang under the set's group (the Lab hides them with it)`);
      const bones = rigidBones(U);
      // (the pieces, their stumps and the wreckage pools, BREAK.wreck: 88 bones; with the hero ~140 and a
      // boss ~180 the 1023 slots keep ~200 spare. Cinderwood measured 368 on 2026-11-15; it was 144)
      assert(D.batch.meshes.length >= 1 && D.batch.meshes.length <= 2 && bones.count <= 460, `${name}: drawn in ${D.batch.meshes.length} batch(es), ${bones.count} bones (<= 460 of 1023)`);
      // a body's geometry sits round its own base: the node carries the place
      const b = L.find((o) => o.topples);
      b.body.geometry.computeBoundingBox();
      const bb = b.body.geometry.boundingBox;
      assert(Math.abs((bb.min.x + bb.max.x) / 2) < 3 && Math.abs((bb.min.z + bb.max.z) / 2) < 3 && bb.min.y > -0.6, `${name}: a body's geometry is laid out round its base`);
      out(`     ${name}: ${L.length} breakables: ` + [...new Set(L.map((o) => o.kind))].map((k) => `${k} ${L.filter((o) => o.kind === k).length}`).join(', ') + `; ${colliders.circles.length} colliders`);
    }
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
    const t = D.list.find((b) => b.kind === 'deadTree');
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
    const t2 = D.list.find((b) => b.kind === 'deadTree' && b.state === STATE.INTACT);
    game.player.position.set(t2.x - 8, 0, t2.z);
    D.topple(t2, 1, 0, 'boss');
    step(2);
    assert(t2.state === STATE.BROKEN && hits.length === 1, 'a hero out from under it is not hit');
    // the hero fells one onto the boss: the boss is hit, the hero never
    const t3 = D.list.find((b) => b.kind === 'deadTree' && b.state === STATE.INTACT);
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
    const t = D.list.find((b) => b.kind === 'deadTree');
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

  // ---------------------------------------------------------------- fire spreads from tree to tree, and stops at its cap
  spread() {
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
    assert(D.burning === 0 && D.list.every((b) => b.gen <= S.gens), `the blaze burns out: fire passes on at most ${S.gens} times from where it landed (${burned} trees burned in all, nothing alight 60 s on)`);
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

  // ---------------------------------------------------------------- counts, bones, debris by quality, and a rampage's cost
  budget() {
    const W = wyrm();
    const { D, d, game, world, U, step } = W;
    const bones = rigidBones(U).count;
    const by = {};
    for (const b of D.list) by[b.kind] = (by[b.kind] ?? 0) + 1;
    out(`     forest: ${D.list.length} pieces (${Object.entries(by).map(([k, n]) => `${k} ${n}`).join(', ')}); wreckage pools ${D.wreck.pools.map((p) => p.length).join(' / ')}`);
    assert(D.list.length >= 150 && D.list.length <= 240, `${D.list.length} breakables in Cinderwood (150..240; 80 before this pass)`);
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
      sum += ms;
      frames++;
      peakFx = Math.max(peakFx, game.fx.alpha.count + game.fx.add.count);
      peakFire = Math.max(peakFire, game.fx.fire.count);
      peakBurn = Math.max(peakBurn, D.burning);
    }
    const down = D.list.length - D.standing;
    out(`     rampage 60 s: ${down} pieces down, ${D.wreckage} wreckage, ${world.scars.count} marks; destructibles.update avg ${(sum / frames).toFixed(3)} ms, worst ${worst.toFixed(2)} ms; peak glyphs ${peakFx}, fire blobs ${peakFire}, alight ${peakBurn}`);
    assert(down >= 20, `the rampage wrecks the clearing (${down} pieces down)`);
    assert(worst < 4 && sum / frames < 0.5, `destructibles.update: avg ${(sum / frames).toFixed(3)} ms, worst ${worst.toFixed(2)} ms a frame (budget: avg < 0.5, worst < 4 in node)`);
    assert(peakBurn <= Math.max(3, Math.round(BREAK.spread.maxBurning)) + 6, `fires alight at the peak: ${peakBurn}`);
    // allocation in the hot paths this owns: a steady frame (the body sweeping, wood burning, logs
    // smouldering, hot ground, the marks) creates no object, array or closure. Measured as heap growth
    // over 2000 frames after a GC, against the same loop without the hot paths. What is left is V8
    // boxing doubles passed to calls (the burning wood's touch / burnCircle, the grid's cells: ~0.7 KB a
    // frame, measured 2026-11-15; the body's 23 sweeps go through sweepRec, which took 2.6 KB down to it),
    // not objects this code makes.
    const B = wyrm();
    const tr = B.D.list.filter((b) => b.mat === 'wood' && b.state === STATE.INTACT).slice(0, 3);
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
};
const near = (a, b, eps) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps;

const names = SCEN === 'all' ? Object.keys(S) : [SCEN];
for (const n of names) {
  if (!S[n]) { out(`unknown scenario ${n}`); process.exit(2); }
  out(`\n== WORLD ${n.toUpperCase()}`);
  try {
    S[n]();
  } catch (err) {
    fails++;
    out('FAIL', `${n} threw: ${err?.stack ?? err}`);
  }
}
if (errors.length) { fails++; out('FAIL console errors:\n  ' + errors.slice(0, 8).join('\n  ')); }
out(fails ? `\n${fails} FAILED` : '\nall world checks passed');
process.exit(fails ? 1 : 0);
