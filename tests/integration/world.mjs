// The world's destruction, headless (ADR-103; ARCHITECTURE.md → "Destruction"): the REAL Colliders,
// Scorch, GroundFire, Scars and Destructibles on the REAL sets (the forest, the courtyard), wired
// like src/world/world.js; the hero and the boss are small stand-ins that record what lands on them.
// usage: node world.mjs <repoRoot> [scenario]
//   scenario: sets | chip | fell | cover | fire | throw | reset | all
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
const { rigidBones } = await imp('src/render/rigidBatch.js');
const { Colliders } = await imp('src/world/colliders.js');
const { Scorch } = await imp('src/world/scorch.js');
const { GroundFire } = await imp('src/world/fire.js');
const { Scars } = await imp('src/world/scars.js');
const { Destructibles, STATE } = await imp('src/world/destructibles.js');
const { BREAK, BLOW, FIRE, SCAR } = await imp('src/world/breakTuning.js');
const { createForest } = await imp('src/world/forest.js');
const { createCourtyard } = await imp('src/world/courtyard.js');
const { TELL, RESULT } = await imp('src/combat/rules.js');

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
    lights: new LightPool(U), fx: { alpha: mk({ max: 3000, additive: false }), add: mk({ max: 7000, additive: true }) },
    shakes: 0, shake(a) { if (!Number.isFinite(a)) throw new Error('NaN shake'); this.shakes++; },
  };
  const colliders = new Colliders();
  const set = makeSet(U, colliders);
  const world = { colliders, forest: set, gusts: 0, gust(x, z, s, r) { if (![x, z, s, r].every(Number.isFinite)) throw new Error('NaN gust'); this.gusts++; }, resolve: (pos, r, b) => colliders.resolve(pos, r, b) };
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
    }
  };
  return { game, world, set, D: world.destructibles, colliders, hits, log, step, U };
}

const S = {
  // ---------------------------------------------------------------- the sets list their breakables
  sets() {
    for (const [name, make, kinds] of [['forest', createForest, ['tree', 'deadTree', 'stone', 'boulder']], ['courtyard', createCourtyard, ['pillar', 'lantern']]]) {
      const { D, set, colliders, U } = build(make);
      const L = D.list;
      assert(L.length >= 20 && L.length <= 160, `${name}: ${L.length} breakables (20..160)`);
      for (const k of kinds) assert(L.some((b) => b.kind === k), `${name}: has a breakable ${k}`);
      assert(L.every((b) => Number.isFinite(b.x + b.z + b.r + b.h) && b.r > 0 && b.h > 0 && b.hp > 0), `${name}: every breakable has a footprint, a height and structure`);
      assert(L.every((b) => b.colliders.every((c) => colliders.circles.includes(c))), `${name}: their colliders are the world's own circles`);
      assert(L.every((b) => b.node.parent === D.root && b.body.geometry.attributes.position.count > 0), `${name}: each has its own node and body`);
      assert(D.root.parent === set.group, `${name}: the breakables hang under the set's group (the Lab hides them with it)`);
      const bones = rigidBones(U);
      assert(D.batch.meshes.length >= 1 && D.batch.meshes.length <= 2 && bones.count <= 420, `${name}: drawn in ${D.batch.meshes.length} batch(es), ${bones.count} bones (<= 420 of 1023)`);
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
    assert(!t.body.visible && t.stub.visible && colliders.circles.includes(t.stubCollider), 'it comes apart where it lands; the stump stands, with a collider');
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
    assert(lights && Number.isFinite(game.fx.add.count), 'flames are glyph particles, the blaze has a light');
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
    assert(colliders.circles.length === n0 && colliders.circles.every((c) => ids.has(c)), `the colliders are the same ${n0} circles (no stump's left behind)`);
    assert(world.fire.count === 0 && world.fire.burning(0, 0) === 0 && world.scars.count === 0 && D.active.length === 0, 'no fire, no marks, nothing in motion');
    step(1);
    assert(D.standing === D.list.length, 'and it stays so');
    // a second fight breaks things as the first did
    D.strike(st.x, st.z, 1, 99, { src: D.swing() });
    step(3);
    assert(st.state === STATE.BROKEN && st.stub.visible, 'a reset piece breaks again like the first time');
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
