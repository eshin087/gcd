// THE DRAGON PRINT ON PROPS AND TREES (render/dragonProps.js; ?dpProps, ?dpTrees), headless: the switches off
// change nothing (the materials' shaders are those of before), the tone's windows stay clear of every flag the
// art pass reads, every level builds with both switches on, its materials carry the print, and on Cinderwood a
// tree under ?dpTrees still bites, falls and resets (the print changes how it is drawn, never what it is).
// usage: node tests/integration/dragonProps.mjs <repoRoot> [scenario]   scenario: off | windows | levels | bite | all
import { pathToFileURL } from 'node:url';
import './shim.mjs';

const ROOT = process.argv[2] ?? '.';
const SCEN = process.argv[3] || 'all';
const imp = (p) => import(pathToFileURL(`${ROOT}/${p}`).href);
const THREE = await imp('node_modules/three/build/three.module.js');
const { CONFIG } = await imp('src/core/config.js');
const { Events } = await imp('src/core/events.js');
const { createSharedUniforms } = await imp('src/render/shaderLib.js');
const { LightPool } = await imp('src/render/lights.js');
const { GlyphParticles } = await imp('src/render/particles.js');
const { FireField } = await imp('src/render/fireField.js');
const { FLAG, createAsciiObjectMaterial, createPropArtMaterial, createDragonObjectMaterial } = await imp('src/render/materials.js');
const { DP_TONE, DP_PROPS, DP_TREES, dpPropsLook, dpTreesLook } = await imp('src/render/dragonProps.js');
const { Colliders } = await imp('src/world/colliders.js');
const { Scorch } = await imp('src/world/scorch.js');
const { GroundFire } = await imp('src/world/fire.js');
const { Scars } = await imp('src/world/scars.js');
const { Destructibles } = await imp('src/world/destructibles.js');
const { BREAK, BLOW } = await imp('src/world/breakTuning.js');
const { createForest } = await imp('src/world/forest.js');
const { resolveOn } = await imp('src/world/edge.js');
const { LEVELS } = await imp('src/levels/index.js');
const { RESULT } = await imp('src/combat/rules.js');
const { setLook } = await imp('src/entities/enemies/duelist/lookSwitch.js');

const errors = [];
console.error = (...a) => { errors.push(a.map((x) => (x?.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x))).join(' ')); };
console.warn = (...a) => { errors.push('WARN ' + a.map(String).join(' ')); };
const out = (...a) => process.stdout.write(a.join(' ') + '\n');
let fails = 0;
const assert = (c, m) => { if (!c) { fails++; out('FAIL', m); } else out('ok  ', m); };

/** Both switches at once (null gives them back). */
const looks = (p, t) => { setLook('dpProps', p); setLook('dpTrees', t); };
/** Every ShaderMaterial under an object. */
const materialsOf = (root) => {
  const s = new Set();
  root?.traverse?.((o) => { for (const m of [].concat(o.material ?? [])) if (m?.isShaderMaterial) s.add(m); });
  return [...s];
};
/** The value a half float stores for x (the scene target is HalfFloatType): 10 bits of mantissa. */
const half = (x) => { const e = Math.floor(Math.log2(Math.abs(x))); const u = 2 ** (e - 10); return Math.round(x / u) * u; };

/** A world like world.js builds it, on a real set, with stand-in fighters (tests/integration/world.mjs build). */
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
    colliders, forest: set, gust() {},
    resolve: (pos, r, b, soft, who) => resolveOn(colliders, world.edge ?? null, pos, r, b, soft, who), setPusher() {}, clearPushers() {},
  };
  world.scorch = new Scorch(U, game);
  world.fire = new GroundFire(game, world, () => 1);
  world.scars = new Scars(game, set.scarInk);
  world.destructibles = new Destructibles(game, world, set);
  world.edge = world.destructibles.edge ?? null;
  game.world = world;
  game.player = { position: new THREE.Vector3(0, 0, 8), radius: 0.45, alive: true, state: 'idle', isInvulnerable: () => false, takeHit: () => RESULT.HIT };
  game.boss = game.dragon = { position: new THREE.Vector3(0, 0, -8), bodyCircles: [], T: { radius: 0.6 }, isTargetable: () => true, takeHit: (h) => h.damage };
  const step = (sec, dt = 1 / 60) => {
    for (let t = 0; t < sec - 1e-9; t += dt) {
      game.time += dt;
      world.destructibles.update(dt);
      world.fire.update(dt);
      world.scars.update(dt, game.time);
      world.scorch.update(dt);
    }
  };
  return { game, world, set, D: world.destructibles, step, U };
}

const S = {
  // ---- the switches off: what ships today, shader for shader
  off() {
    looks(null, null);
    assert(dpPropsLook() === '0' && dpTreesLook() === '0', 'no switch in the URL: both pieces are off');
    const U = createSharedUniforms();
    const p = createPropArtMaterial(U, { fadeNearPlayer: true });
    assert(!p.userData.dragonPrint && !/dpEncode|vO = position/.test(p.fragmentShader + p.vertexShader) && p.fragmentShader.includes('FLAG') === false && p.fragmentShader.includes('0.57)'),
      'createPropArtMaterial off: the prop-art source of before (no relief, its flag 0.57)');
    const a = createAsciiObjectMaterial(U, { fadeNearPlayer: true, side: THREE.DoubleSide });
    const d = createDragonObjectMaterial(U, { fadeNearPlayer: true, side: THREE.DoubleSide });
    assert(d.vertexShader === a.vertexShader && d.fragmentShader === a.fragmentShader && !d.userData.dragonPrint, 'createDragonObjectMaterial off: createAsciiObjectMaterial itself (the same shaders)');
    const f = createForest(createSharedUniforms(), new Colliders());
    const trees = f.group.children.find((m) => m.name === 'trees');
    assert(trees && !trees.material.userData.dragonPrint && trees.material.fragmentShader === a.fragmentShader, "the forest's trees off: the screen grid's material of before");
  },

  // ---- the tone's windows: clear of every flag the art pass reads (pipeline.js isArt / isProp / LEAF / STONE)
  windows() {
    const { a0, span, top, leaf0, leafSpan } = DP_TONE;
    const lo = half(a0), hi = half(a0 + span);
    assert(lo > 0.555 && hi < top && top < half(FLAG.ART_PROP), `the props' tone [${lo.toFixed(4)}, ${hi.toFixed(4)}] (half floats) sits inside the props' window (> 0.555) and below FLAG.ART_PROP ${half(FLAG.ART_PROP).toFixed(4)} (top ${top})`);
    const l0 = half(leaf0), l1 = half(leaf0 + leafSpan);
    assert(l0 - 0.005 > FLAG.LEAF + 0.012 && l1 + 0.005 < 0.8, `the leaves' tone [${l0.toFixed(4)}, ${l1.toFixed(4)}] sits between FLAG.LEAF's window (0.6 +- 0.012) and the stone grid (0.8)`);
    const flags = Object.values(FLAG).filter((v) => v > 0);
    assert(flags.every((v) => !(v >= a0 && v <= a0 + span) && !(v >= leaf0 - 0.005 && v <= leaf0 + leafSpan + 0.005)), `no FLAG value (${flags.join(', ')}) falls in a tone window`);
    // (the tone's resolution: enough half-float steps for the ramp's 13 digits)
    const steps = (x0, w) => Math.round((half(x0 + w) - half(x0)) / 2 ** -11);
    assert(steps(a0, span) >= 12 && steps(leaf0, leafSpan) >= 13 * 4, `the props' tone has ${steps(a0, span)} half-float steps, the leaves' ${steps(leaf0, leafSpan)} (13 digits in the ramp)`);
    for (const k of ['a', 'b']) {
      const P = DP_PROPS[k], T = DP_TREES[k];
      const nums = [...Object.values(P).flat(), ...Object.values(T).flat()];
      assert(nums.every(Number.isFinite) && P.law[1] > P.law[0] && T.barkLaw[1] > T.barkLaw[0] && T.leafLaw[1] > T.leafLaw[0] && T.leafF > 0, `option ${k}: every number finite, every law rising, the clumps a size`);
    }
  },

  // ---- every level with both switches on: it builds, its prop and tree materials carry the print
  levels() {
    for (const k of ['a', 'b']) {
      looks(k, k);
      try {
        for (const L of LEVELS) {
          let A = null, err = null;
          try {
            A = build(L.buildSet);
          } catch (e) {
            err = e;
          }
          assert(A && !err, `${L.name} (${k}): builds, its breakables listed (${A?.D.list.length ?? 0})${err ? ' ' + err.message : ''}`);
          if (!A) continue;
          const mats = [...materialsOf(A.set.group), ...materialsOf(A.D.group ?? A.game.scene)];
          const dp = mats.filter((m) => m.userData.dragonPrint);
          const props = mats.filter((m) => /dpStone\(/.test(m.fragmentShader));
          assert(props.length > 0 && dp.length > 0 && props.every((m) => m.fragmentShader.includes('dpEncode(') && m.vertexShader.includes('vO = position') && m.uniforms.uDpRelief),
            `${L.name} (${k}): ${props.length} material(s) print the props' relief and hand on their tone`);
          // (no material of the screen grid's kind is left without the print: a set's ascii-object material and the
          // breakables' rigid one are createDragonObjectMaterial, so its trees and painted props take the relief)
          const plain = mats.filter((m) => /vFlag/.test(m.fragmentShader) && !m.userData.dragonPrint);
          const grid = A.D.gridMat;
          assert(plain.length === 0 && (!grid || (grid.userData.dragonPrint && grid.userData.rigid && grid.defines?.DP_T === 1)),
            `${L.name} (${k}): every ascii-object material carries the print (${plain.length} without), the breakables' rigid one too`);
          if (L.buildSet === createForest || L.id === 'cinderwood') {
            const trees = A.set.group.children.find((m) => m.name === 'trees')?.material;
            assert(trees?.defines?.DP_T === 1 && trees.vertexShader.includes('windOn()') && trees.vertexShader.includes('vO = position') && trees.fragmentShader.includes('dpEncodeLeaf('),
              `${L.name} (${k}): the trees take the print (bark, leaves) and keep the wind's sway`);
          }
        }
      } finally {
        looks(null, null);
      }
    }
  },

  // ---- Cinderwood under both switches: a tree still bites where the blade crossed, a boulder too, and the reset undoes it
  bite() {
    looks('a', 'a');
    setLook('chip', 'a');
    try {
      const { D, step } = build();
      const t = D.list.filter((b) => b.kind === 'tree' && b.body?.parts > 1).sort((p, q) => Math.hypot(p.x, p.z) - Math.hypot(q.x, q.z))[0];
      assert(!!t, 'a tree of the forest (a run of the trees\' mesh)');
      if (!t) return;
      const hp0 = t.hp;
      const r = D.sweep(t.x, t.z + t.r + 1, t.x, t.z + 0.1, 0.55, (0.25 * t.hpMax) / BREAK.mats.wood.take.cut, { kind: BLOW.CUT, by: 'player', dx: 0, dz: -1, y: 0.8, ya: 1.1, yb: 1.1, src: D.swing() });
      step(0.1);
      assert(r === 1 && t.hp < hp0 && t.body.nBit > 0, `a cut bites the tree under ?dpTrees (${t.body.nBit} bricks, ${(t.hp / t.hpMax).toFixed(2)} of it left)`);
      const s = D.list.find((b) => b.kind === 'boulder' && b.bricks?.T > 0);
      if (s) {
        const h0 = s.hp;
        D.strike(s.x, s.z, 1.3, 0.9, { kind: BLOW.BLUNT, by: 'boss', src: D.swing() });
        step(0.1);
        assert(s.hp < h0, `a blow takes structure from a boulder under ?dpProps (${h0.toFixed(2)} -> ${s.hp.toFixed(2)})`);
      }
      // fell it: what is left of it falls and its stump shows, as without the switch
      D.sweep(t.x, t.z + t.r + 1, t.x, t.z + 0.1, 0.55, (2 * t.hpMax) / BREAK.mats.wood.take.cut, { kind: BLOW.CUT, by: 'player', dx: 0, dz: -1, y: 0.8, ya: 1.1, yb: 1.1, src: D.swing() });
      step(3);
      assert(t.hp <= 0, 'the tree falls to a heavy cut');
      D.reset?.();
      step(0.1);
      assert(t.hp === t.hpMax && t.body.nBit === 0, 'the reset stands it up whole');
    } finally {
      setLook('chip', null);
      looks(null, null);
    }
  },
};

const names = SCEN === 'all' ? Object.keys(S) : SCEN.split(',');
for (const n of names) {
  if (!S[n]) {
    out('FAIL unknown scenario', n);
    fails++;
    continue;
  }
  out(`--- ${n}`);
  try {
    S[n]();
  } catch (e) {
    fails++;
    out('FAIL', n, 'threw:', e.stack?.split('\n').slice(0, 4).join(' | '));
  }
}
const bad = errors.filter((e) => !/^WARN THREE\./.test(e));
assert(bad.length === 0, `no console error or warning (${bad.length}${bad.length ? ': ' + bad.slice(0, 3).join(' || ') : ''})`);
out(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
