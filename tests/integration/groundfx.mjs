// The dragon print's upgrades, CPU side, headless (world/groundFx.js; render/dragonPrintFx.js has the GLSL):
// the REAL GroundFx on the REAL Colliders, Scorch and Destructibles of the REAL sets (every level's), wired
// like src/world/world.js; the hero and the boss are stand-ins (a position, body circles). The switches
// flip live through lookSwitch.setLook, as the Lab does.
// usage: node groundfx.mjs <repoRoot> [scenario]
//   scenario: off | ripple | contact | cloud | nan | alloc | levels | all
import { pathToFileURL } from 'node:url';
import v8 from 'node:v8';
import vm from 'node:vm';
import { PerformanceObserver, constants } from 'node:perf_hooks';
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
const { Scars } = await imp('src/world/scars.js');
const { Destructibles, STATE } = await imp('src/world/destructibles.js');
const { BLOW } = await imp('src/world/breakTuning.js');
const { createForest } = await imp('src/world/forest.js');
const { resolveOn } = await imp('src/world/edge.js');
const { LEVELS } = await imp('src/levels/index.js');
const { GroundFx } = await imp('src/world/groundFx.js');
const { GFX } = await imp('src/world/groundFxTuning.js');
const { DP_FX_U, DP_RIP_N, DP_FIGHTERS } = await imp('src/render/dragonPrintFx.js');
const { setLook } = await imp('src/entities/enemies/duelist/lookSwitch.js');
v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc');

const errors = [];
console.error = (...a) => { errors.push(a.map((x) => (x?.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x))).join(' ')); };
console.warn = (...a) => { errors.push('WARN ' + a.map(String).join(' ')); };
const out = (...a) => process.stdout.write(a.join(' ') + '\n');
let fails = 0;
const assert = (c, m) => { if (!c) { fails++; out('FAIL', m); } else out('ok  ', m); };
const KEYS = ['dpCloud', 'dpContact', 'dpRipple', 'dpRidge'];
const looks = (o = {}) => { for (const k of KEYS) setLook(k, o[k] ?? '0'); };
const finiteU = () => {
  const U = DP_FX_U;
  const v4 = (v) => Number.isFinite(v.x + v.y + v.z + v.w);
  return U.uDpFxOn.value.every(Number.isFinite) && v4(U.uDpCloud.value) && v4(U.uDpCloudK.value) && v4(U.uDpContactBox.value) && v4(U.uDpContactK.value)
    && U.uDpFighters.value.every(v4) && U.uDpRip.value.every(v4) && v4(U.uDpRipK.value) && v4(U.uDpRipP.value) && v4(U.uDpRidge.value) && v4(U.uDpRidgeK.value);
};

/** A world like world.js builds it (the parts GroundFx reads), on a real set, with stand-in fighters. */
function build(makeSet = createForest) {
  const U = createSharedUniforms();
  const events = new Events();
  const game = {
    THREE, CONFIG, U, events, time: 0, dt: 1 / 60, fxDt: 1 / 60, state: 'boss', scene: new THREE.Scene(),
    lights: new LightPool(U), fx: { alpha: new GlyphParticles(U, { max: 3000, additive: false }), add: new GlyphParticles(U, { max: 7000, additive: true }), fire: new FireField(U, { max: 6000 }) },
    shake() {},
  };
  const colliders = new Colliders();
  const set = makeSet(U, colliders);
  const world = {
    colliders, forest: set, gust() {}, setPusher() {}, clearPushers() {},
    resolve: (pos, r, b, soft, who) => resolveOn(colliders, world.edge ?? null, pos, r, b, soft, who),
  };
  world.scorch = new Scorch(U, game);
  world.fire = new GroundFire(game, world, () => 1);
  world.scars = new Scars(game, set.scarInk);
  world.destructibles = new Destructibles(game, world, set);
  world.edge = world.destructibles.edge ?? null;
  game.world = world;
  game.player = { position: new THREE.Vector3(0, 0, 8), radius: 0.45, alive: true, isInvulnerable: () => false, takeHit: () => 'hit' };
  game.boss = game.dragon = {
    position: new THREE.Vector3(0, 0, -8), bodyCircles: [{ x: 0, z: -8, r: 0.6 }], T: { radius: 0.6 }, isTargetable: () => true, takeHit: (h) => h.damage,
  };
  const fx = new GroundFx(game, world);
  world.groundFx = fx;
  const D = world.destructibles;
  const step = (sec, dt = 1 / 60, each) => {
    for (let t = 0; t < sec - 1e-9; t += dt) {
      game.time += dt;
      D.update(dt);
      world.fire.update(dt);
      world.scars.update(dt, game.time);
      world.scorch.update(dt);
      fx.update(dt);
      if (each) each();
    }
  };
  return { game, world, set, D, colliders, fx, step };
}

const SCENARIOS = {
  // ---------------------------------------------------------------- every switch off: nothing on, nothing made
  off() {
    looks();
    const { fx, step } = build();
    step(0.5);
    fx.blow(1, 1, 2);
    step(0.1);
    const F = DP_FX_U.uDpFxOn.value;
    assert(F.every((v) => v === 0), 'every switch off: uDpFxOn is all zero (the hooks return their no-op values)');
    assert(fx.rings === 0 && DP_FX_U.uDpRip.value.every((v) => v.w === 0), `a blow with dpRipple off sends no ring (${fx.rings}, ${DP_FX_U.uDpRip.value.map((v) => v.w).join(' ')})`);
    assert(fx.bakes === 0 && fx._tex === null, 'dpContact off: no texture is made, nothing is baked');
  },

  // ---------------------------------------------------------------- the re-print rings
  ripple() {
    looks({ dpRipple: 'a' });
    const { fx, world, step } = build();
    step(0.1);
    const T = GFX.ripple.a;
    fx.blow(2, 3, GFX.ripple.minPower * 0.9);
    assert(fx.rings === 0, `a blow under minPower (${GFX.ripple.minPower}) sends no ring`);
    fx.blow(NaN, 3, 1);
    fx.blow(2, 3, Infinity);
    assert(fx.rings === 0, 'a NaN place or an infinite power sends none');
    // world.groundBlow is the way in (every blow on the floor)
    world.groundBlow = (x, z, o) => fx.blow(x, z, o.power);
    world.groundBlow(2, 3, { kind: 'slam', power: 1.5, r: 3 });
    assert(fx.rings === 1, 'a heavy blow on the floor sends one ring');
    step(1 / 60);
    const s = DP_FX_U.uDpRip.value.findIndex((v) => v.x === 2 && v.y === 3);
    const R = DP_FX_U.uDpRip.value[s];
    assert(s >= 0 && R.w > 0.5 && R.z > 0 && R.z < 0.5, `its slot carries the place, a small radius (${R.z.toFixed(2)} m) and its strength (${R.w.toFixed(2)})`);
    // it runs out, slowing, and fades; it never shrinks
    let r0 = R.z, w0 = R.w, grows = true, fades = true, life = 0;
    while (fx.rings > 0 && life < 10) {
      step(1 / 60);
      life += 1 / 60;
      if (fx.rings === 0) break;
      if (R.z < r0 - 1e-6) grows = false;
      if (R.w > w0 + 1e-6) fades = false;
      r0 = R.z;
      w0 = R.w;
    }
    const reach = Math.min(T.reachMax, T.reach[0] + T.reach[1] * 1.5);
    assert(grows && fades, 'the ring only grows and only fades');
    assert(r0 > reach * 0.9 && r0 <= reach + 1e-6, `it runs out to its reach (${r0.toFixed(2)} of ${reach.toFixed(2)} m)`);
    assert(life > reach / T.speed && life < (reach / T.speed) * 2, `it lives ${life.toFixed(2)} s (over reach / speed ${(reach / T.speed).toFixed(2)} s, under twice that)`);
    assert(fx.rings === 0 && R.w === 0, 'then its slot is free (strength 0)');
    // a run of blows close together (a fissure's crack every 1.3 m): one ring carries them
    const M = GFX.ripple.merge;
    fx.blow(-20, 0, 1);
    step(1 / 60);
    fx.blow(-20 + M.r * 0.8, 0, 1);
    step(1 / 60);
    assert(fx.rings === 1, `a blow ${(M.r * 0.8).toFixed(1)} m from a ring ${(1 / 60).toFixed(2)} s old sends none (merge ${M.r} m, ${M.age} s)`);
    step(M.age);
    fx.blow(-20 + M.r * 0.8, 0, 1);
    step(1 / 60);
    assert(fx.rings === 2, `... once that ring is ${M.age} s old, it sends its own`);
    fx.clear();
    // several at once; more than the slots: the weakest (the oldest) gives way
    for (let i = 0; i < DP_RIP_N + 3; i++) {
      fx.blow(i * 3, 0, 1);
      step(0.05);
    }
    assert(fx.rings === DP_RIP_N, `${DP_RIP_N + 3} blows in a row: ${DP_RIP_N} rings live at once (the slots)`);
    const xs = DP_FX_U.uDpRip.value.map((v) => v.x).sort((a, b) => a - b);
    assert(xs[0] === 9 && xs[DP_RIP_N - 1] === (DP_RIP_N + 2) * 3, 'the newest live; the weakest (oldest) gave their slots');
    // the switch off mid-ring: gone; the reset: gone
    setLook('dpRipple', '0');
    step(1 / 60);
    assert(fx.rings === 0 && DP_FX_U.uDpRip.value.every((v) => v.w === 0), 'the switch off: every ring is gone at once');
    setLook('dpRipple', 'b');
    fx.blow(0, 0, 1);
    step(1 / 60);
    assert(fx.rings === 1 && DP_FX_U.uDpRipK.value.x === GFX.ripple.b.front && DP_FX_U.uDpRipP.value.y === GFX.ripple.b.light, "option b: its ring, its band's width and its light");
    fx.clear();
    assert(fx.rings === 0 && DP_FX_U.uDpRip.value.every((v) => v.w === 0), 'the fight\'s reset (clear) ends every ring');
  },

  // ---------------------------------------------------------------- contact shadows
  lite() {
    // the lite world (ADR-216): game.liteWorld turns the four upgrades off and the floors' relief cheaper
    looks({ dpCloud: 'a', dpContact: 'a', dpRipple: 'a', dpRidge: 'a' });
    const { fx, game, step } = build();
    step(1 / 60);
    const F = DP_FX_U.uDpFxOn.value;
    assert(F.every((v) => v === 1) && DP_FX_U.uDpLite.value === 0, `the world as it is: the four upgrades on (${F.join(' ')}), uDpLite 0`);
    game.liteWorld = true;
    fx.blow(0, 0, 1);
    step(1 / 60);
    assert(F.every((v) => v === 0) && DP_FX_U.uDpLite.value === 1 && fx.rings === 0, `lite: the four off (${F.join(' ')}), no ripple ring from a blow, uDpLite 1`);
    game.liteWorld = false;
    step(1 / 60);
    assert(F.every((v) => v === 1) && DP_FX_U.uDpLite.value === 0, 'back: as it was');
  },

  contact() {
    looks({ dpContact: 'a' });
    const { fx, D, game, colliders, step } = build();
    step(1 / 60);
    assert(fx.bakes === 1 && fx._tex && DP_FX_U.uDpContactTex.value === fx._tex, 'the first frame with dpContact on bakes the rings into a texture (the shared uniform holds it)');
    const box = DP_FX_U.uDpContactBox.value;
    assert(box.x === fx._min && box.z === fx._size && box.w === GFX.contact.a.lean, `the texture covers the scorch map's square (${box.z} m from ${box.x})`);
    // a standing stone rings its foot; open ground has none
    const st = D.list.find((b) => b.kind === 'stone' && b.state === STATE.INTACT && b.h >= GFX.contact.hRef);
    const edge = fx.contactAt(st.x + st.r + 0.05, st.z);
    const far = fx.contactAt(st.x + st.r + 3, st.z + 3);
    assert(edge > 0.3 && edge <= GFX.contact.a.depth + 0.01, `at a standing stone's foot: ${edge.toFixed(2)} (> 0.3, <= its depth ${GFX.contact.a.depth})`);
    assert(fx.contactAt(st.x, st.z) >= edge, 'under it, at least as deep');
    const open = (() => { for (let x = -20; x < 20; x += 0.5) { const v = fx.contactAt(x, 15); if (v === 0) return true; } return false; })();
    assert(open && far < edge, 'open ground and a few m off it: shallower or none');
    const flat = D.list.find((b) => b.kind === 'flagstone' && b.state === STATE.INTACT);
    assert(!flat || fx._standing(flat) === 0, 'a flagstone (lower than minH) rings nothing');
    // nothing changes: no bake
    step(2);
    assert(fx.bakes === 1, `two seconds and nothing fell: no bake again (${fx.bakes})`);
    // a tree falls: its ring is gone (a stump's smaller one may stay), at most `rebake` s later
    const t = D.list.find((b) => (b.kind === 'deadTree' || b.kind === 'tree') && b.state === STATE.INTACT && !b.wall);
    const before = fx.contactAt(t.x + t.r + 0.1, t.z);
    D.topple(t, 1, 0, 'boss');
    step(GFX.contact.rebake + 2 / 60);
    const fall = fx.contactAt(t.x + t.r + 0.1, t.z);
    assert(fx.bakes === 2 && fall < before, `a tree felled: baked again (${fx.bakes}); its ring at its foot ${before.toFixed(2)} -> ${fall.toFixed(2)}`);
    // only the ground round it, and the same texels as a whole bake
    const part = fx.lastBake, copy = fx._data.slice();
    fx._full = fx._dirty = true;
    fx._since = 1e9;
    step(1 / 60);
    let same = 0;
    for (let k = 0; k < copy.length; k++) if (copy[k] === fx._data[k]) same++;
    assert(part < fx.lastBake / 50 && same === copy.length, `... only round it (${part} of ${fx.lastBake} texels), the same as a whole bake (${copy.length - same} texels differ)`);
    for (let i = 0; i < 300 && t.state === STATE.FALLING; i++) step(1 / 60);
    step(GFX.contact.rebake + 2 / 60);
    const stub = t.stubR > 0 ? fx.contactAt(t.x + t.stubR + 0.05, t.z) : 0;
    assert(t.state === STATE.BROKEN && (!(t.stubR > 0) || stub > 0), `it lies felled; its stump keeps a ring of its own (${stub.toFixed(2)})`);
    const v0 = colliders.version;
    D.reset();
    step(GFX.contact.rebake + 2 / 60);
    const back = fx.contactAt(t.x + t.r + 0.1, t.z);
    assert(colliders.version !== v0 && Math.abs(back - before) < 1e-6, `the reset: everything stands, the ring is back (${back.toFixed(2)})`);
    // bakes come no faster than `rebake`, however many fall
    const n0 = fx.bakes;
    const trees = D.list.filter((b) => (b.kind === 'deadTree' || b.kind === 'tree') && b.state === STATE.INTACT && !b.wall).slice(0, 6);
    for (const b of trees) {
      D.topple(b, 0, 1, 'boss');
      step(1 / 60);
    }
    assert(fx.bakes - n0 <= 1 + Math.ceil((trees.length / 60) / GFX.contact.rebake), `${trees.length} trees felled on six frames: ${fx.bakes - n0} bake(s) (throttled to one every ${GFX.contact.rebake} s)`);
    // the fighters: the hero, then the boss's body circles
    game.player.position.set(3, 0, 4);
    game.boss.bodyCircles = [{ x: -2, z: -6, r: 1.2 }, { x: -3, z: -7 }];
    step(1 / 60);
    const Fs = DP_FX_U.uDpFighters.value;
    assert(Fs[0].x === 3 && Fs[0].y === 4 && Fs[0].w > 0, 'fighter slot 0: the hero where he stands');
    assert(Fs[1].x === -2 && Fs[1].z === 1.2 && Fs[2].z === GFX.contact.boss.r && Fs[3].w === 0, "slots 1..: the boss's body circles (its own r, or the tuning's), the rest off");
    game.player.position.y = GFX.contact.lift * 2;
    game.boss.bodyCircles = [];
    step(1 / 60);
    assert(Fs.every((v) => v.w === 0), 'the hero high in the air and a boss in flight (no circles): no fighter rings');
    game.player.position.y = 0;
    game.boss.bodyCircles = Array.from({ length: 20 }, (_, i) => ({ x: i, z: 0, r: 0.5 }));
    step(1 / 60);
    assert(Fs.every((v) => v.w > 0) && Fs.length === DP_FIGHTERS, `more circles than slots: the ${DP_FIGHTERS} slots fill, none overflows`);
    // option b leans the rings away from the moon (the uniform), and bakes its own depth
    setLook('dpContact', 'b');
    step(GFX.contact.rebake + 2 / 60);
    assert(box.w === GFX.contact.b.lean && fx._bakedOpt === 'b', `option b: the lean (${box.w} m) and a bake at its own depth`);
  },

  // ---------------------------------------------------------------- the cloud's drift
  cloud() {
    looks({ dpCloud: 'a' });
    const { fx, world, step } = build();
    const C = DP_FX_U.uDpCloud.value;
    // no wind (no living world): the still drift
    step(10);
    const S = GFX.cloud.still, d = Math.hypot(C.x, C.y);
    assert(Math.abs(d - S.speed * 10) < 0.05 && C.z === GFX.cloud.a.scale && C.w === GFX.cloud.a.cover, `no wind of the level's own: it drifts ${d.toFixed(2)} m in 10 s (still: ${S.speed} m/s)`);
    // the level's wind: along it, k x its speed within [min, max]
    world.life = { wind: { dirX: 0, dirZ: -1, speed: 1.5, still: false } };
    const x0 = C.x, z0 = C.y;
    step(4);
    const v = Math.hypot(C.x - x0, C.y - z0) / 4;
    const want = Math.min(GFX.cloud.a.max, Math.max(GFX.cloud.a.min, 1.5 * GFX.cloud.a.k));
    assert(Math.abs(C.x - x0) < 1e-6 && C.y < z0 && Math.abs(v - want) < 0.02, `with the level's wind (toward -z at 1.5 m/s) it drifts that way at ${v.toFixed(2)} m/s (${want.toFixed(2)})`);
    world.life.wind.speed = 40;
    const z1 = C.y;
    step(1);
    assert(Math.abs(z1 - C.y - GFX.cloud.a.max) < 0.02, `a gale: no faster than max (${GFX.cloud.a.max} m/s)`);
    // a still level (the grove): the still drift along its direction
    world.life.wind = { dirX: 1, dirZ: 0, speed: 0, still: true };
    const x2 = C.x;
    step(2);
    assert(Math.abs(C.x - x2 - S.speed * 2) < 0.02, 'a still level drifts slowly along its prevailing direction');
    setLook('dpCloud', 'b');
    step(1 / 60);
    assert(C.z === GFX.cloud.b.scale && DP_FX_U.uDpCloudK.value.y === GFX.cloud.b.depth && DP_FX_U.uDpFxOn.value[0] === 2, 'option b: its scale and depth, uDpFxOn[0] = 2');
  },

  // ---------------------------------------------------------------- never NaN
  nan() {
    looks({ dpCloud: 'a', dpContact: 'a', dpRipple: 'a', dpRidge: 'a' });
    const { fx, game, world, step } = build();
    step(0.2);
    fx.update(NaN);
    fx.update(-1);
    fx.update(Infinity);
    game.player.position.set(NaN, NaN, NaN);
    game.boss.bodyCircles = [null, { x: NaN, z: 0, r: 1 }, { x: 1, z: 1, r: NaN }];
    world.life = { wind: { dirX: NaN, dirZ: NaN, speed: NaN } };
    fx.blow(1, 1, NaN);
    fx.blow(0, 0, 1.2);
    step(0.5);
    assert(finiteU(), 'NaN dt, a NaN hero, NaN circles and a NaN wind: every uniform stays finite');
    assert(fx.contactAt(NaN, 0) === 0 && fx.contactAt(1e9, 0) === 0, 'contactAt off the map or at NaN: 0');
    const R = GFX.ridge.a;
    assert(DP_FX_U.uDpRidge.value.x === R.edge && DP_FX_U.uDpRidgeK.value.x === R.gain && DP_FX_U.uDpFxOn.value[3] === 1, "dpRidge 'a': its uniforms from the tuning");
    assert(errors.length === 0, `no console error (${errors.length})`);
  },

  // ---------------------------------------------------------------- nothing allocated a frame
  // (counted as the young generation's collections: a heap-size reading over a few thousand frames is
  // mostly the JIT's own noise here; 300k frames that allocate even 50 bytes each would fill it many times)
  async alloc() {
    looks({ dpCloud: 'a', dpContact: 'a', dpRipple: 'a', dpRidge: 'a' });
    const { fx, game, world } = build();
    world.life = { wind: { dirX: 0.6, dirZ: 0.8, speed: 1.2, still: false } };
    game.boss.bodyCircles = [{ x: 1, z: 2, r: 1 }, { x: 2, z: 3, r: 1 }];
    let i = 0;
    const loop = (n) => {
      for (let k = 0; k < n; k++, i++) {
        game.player.position.x = Math.sin(i * 0.01) * 5;
        if (i % 30 === 0) fx.blow((i % 7) * 2 - 6, (i % 5) * 2 - 4, 0.6 + (i % 3) * 0.5);
        fx.update(1 / 60);
      }
    };
    loop(20000);
    gc();
    await new Promise((r) => setTimeout(r, 50));
    let minor = 0;
    const obs = new PerformanceObserver((list) => { for (const e of list.getEntries()) if (e.detail?.kind === constants.NODE_PERFORMANCE_GC_MINOR) minor++; });
    obs.observe({ entryTypes: ['gc'] });
    const t0 = performance.now();
    loop(300000);
    const ms = (performance.now() - t0) / 300000;
    await new Promise((r) => setTimeout(r, 50));
    obs.disconnect();
    assert(minor <= 1, `300000 frames, all four on, a blow every 30 frames: ${minor} young-generation collection(s) (none: nothing allocated a frame)`);
    assert(ms < 0.1, `its frame on the CPU: ${(ms * 1000).toFixed(1)} us (< 100 us, the forest's ${world.destructibles.list.length} pieces checked)`);
    // (the bakes' times: medians of several, the first of each path warms it)
    const med = (a) => a.sort((x, y) => x - y)[a.length >> 1];
    const part = [], whole = [];
    const trees = world.destructibles.list.filter((b) => (b.kind === 'deadTree' || b.kind === 'tree') && b.state === STATE.INTACT && !b.wall).slice(0, 9);
    for (const b of trees) {
      world.destructibles.topple(b, 1, 0, 'boss');
      fx._since = 1e9;
      const t1 = performance.now();
      fx.update(1 / 60);
      part.push(performance.now() - t1);
      fx._full = fx._dirty = true;
      fx._since = 1e9;
      const t2 = performance.now();
      fx.update(1 / 60);
      whole.push(performance.now() - t2);
    }
    out(`   a tree falls: a bake of the ground round it ${med(part).toFixed(2)} ms; a whole bake (the first, an option, the reset) ${med(whole).toFixed(2)} ms (medians of ${trees.length})`);
  },

  // ---------------------------------------------------------------- every level (the registry)
  levels() {
    looks({ dpContact: 'a' });
    for (const L of Object.values(LEVELS)) {
      const make = typeof L.buildSet === 'function' ? L.buildSet : createForest;
      let ok = false, n = 0, msg = '';
      try {
        const { fx, step } = build(make);
        step(1 / 60);
        for (let k = 0; k < fx._data.length; k++) if (fx._data[k] > 0) n++;
        ok = fx.bakes === 1 && n > 0 && finiteU();
      } catch (err) {
        msg = String(err?.stack ?? err).split('\n').slice(0, 2).join(' | ');
      }
      assert(ok, `${L.id ?? '?'}: its set bakes contact rings (${n} texels) ${msg}`);
    }
  },
};

const run = SCEN === 'all' ? Object.keys(SCENARIOS) : SCEN.split(',');
for (const s of run) {
  if (!SCENARIOS[s]) {
    out('FAIL unknown scenario', s);
    fails++;
    continue;
  }
  out(`\n== scenario ${s.toUpperCase()} ==`);
  try {
    await SCENARIOS[s]();
  } catch (err) {
    fails++;
    out('FAIL', s, 'threw', err?.stack ?? err);
  }
}
looks();
if (errors.length) out(`(console errors: ${errors.length})\n  ` + errors.slice(0, 5).join('\n  '));
out(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
