// The dragon-printed floors, headless (`?dpFloor=a|b`; render/dragonFloor.js, materials.js
// createCarvedGlyphMaterial): the switch builds the print into the carved material of every set and
// nothing with it off; a slab's rim (addSlabRim: per vertex 1 + the distance to its top's edge) is right
// on a known slab; every set gives its paving and its cracked / broken looks their rim at build; a
// geometry met on its first draw (Cinderwood's flagstones: forest.js does not call addSlabRims) gets its
// rim at the start of the next frame (a cracked slab's pieces, theirs as cracks); the print shares the upgrades', the prints' and the ground's
// uniforms; the shader's text carries the hooks.
// usage: node dpfloor.mjs <repoRoot> [scenario]   scenario: rim | sets | off | lazy | all
import { pathToFileURL } from 'node:url';
import './shim.mjs';

// (the switch is read from the URL when the modules load: the print on, look 'a')
globalThis.location = { search: '?dpFloor=a' };

const ROOT = process.argv[2];
const SCEN = process.argv[3] || 'all';
const imp = (p) => import(pathToFileURL(`${ROOT}/${p}`).href);
const THREE = await imp('node_modules/three/build/three.module.js');
const { createSharedUniforms } = await imp('src/render/shaderLib.js');
const { createCarvedGlyphMaterial } = await imp('src/render/materials.js');
const { addSlabRim, addSlabRims, lazySlabRim, RIM_MAX, CRACK_RIM, DP_FLOOR, dpFloorLook } = await imp('src/render/dragonFloor.js');
const { DP_FX_U } = await imp('src/render/dragonPrintFx.js');
const { DP_STEP_U } = await imp('src/render/dragonStep.js');
const { setLook } = await imp('src/entities/enemies/duelist/lookSwitch.js');
const { Colliders } = await imp('src/world/colliders.js');
const { slabGeometry, carve, createForest, STONE } = await imp('src/world/forest.js');
const { createCourtyard } = await imp('src/world/courtyard.js');
const { createThroneHall } = await imp('src/world/throneHall.js');
const { createSkybreakRing } = await imp('src/world/skybreakRing.js');
const { createFoxTerrace } = await imp('src/world/foxTerrace.js');
const { createWindlessGrove } = await imp('src/world/windlessGrove.js');
const { createScriptHall } = await imp('src/world/scriptHall.js');
const { createHalcyonPlaza } = await imp('src/world/halcyonPlaza.js');
const { createTrainingRoom } = await imp('src/world/trainingRoom.js');

const out = (...a) => process.stdout.write(a.join(' ') + '\n');
let fails = 0;
const assert = (c, m) => { if (!c) { fails++; out('FAIL', m); } else out('ok  ', m); };
const near = (a, b, e = 1e-3) => Math.abs(a - b) <= e;

const SETS = [
  ['Ashfall', createCourtyard], ['the Obsidian Throne', createThroneHall], ['the Skybreak Ring', createSkybreakRing],
  ['the Foxfire Terrace', createFoxTerrace], ['the Windless Grove', createWindlessGrove], ['the Hall of Falling Script', createScriptHall],
  ['Halcyon Plaza', createHalcyonPlaza], ['the training room', createTrainingRoom],
];

/** The meshes of a set's group drawn with its carved (slab) material. */
const slabMeshes = (set) => {
  const mat = set.slabMaterial, list = [];
  set.group.traverse((o) => { if (o.isMesh && o.material === mat) list.push(o); });
  return { mat, list };
};

function rim() {
  out('\n== DP FLOOR RIM');
  // a 2 x 2 m square slab (inset 0.07, chamfer drop 0.04) round the origin
  const g = slabGeometry([[-1, -1], [1, -1], [1, 1], [-1, 1]], { top: 0.04, inset: 0.07, drop: 0.04 });
  carve(g, { col: STONE });
  addSlabRim(g);
  const a = g.attributes.aRim, p = g.attributes.position;
  assert(a && a.count === p.count, `addSlabRim gives every corner its rim (${a?.count} of ${p.count})`);
  let topC = 0, rimC = 0, centre = null, okEdge = true, inRange = true;
  for (let i = 0; i < p.count; i++) {
    const v = a.getX(i);
    if (!(v >= 1 && v <= 1 + RIM_MAX + 1e-6)) inRange = false;
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (near(y, 0.04) && near(x, 0) && near(z, 0)) centre = v; // the top fan's centre
    else if (near(y, 0.04)) {
      topC++;
      if (!near(v, 1)) okEdge = false; // the top's ring: on its edge
    } else {
      rimC++;
      if (!near(v, 1)) okEdge = false; // the chamfer and the walls: all rim
    }
  }
  assert(inRange, 'every rim value lies in 1 .. 1 + RIM_MAX');
  // (the fan's centre takes its distance to the edge its triangle stands on, uncapped: slabGeometry insets
  // the corners 0.07 m along the diagonal, so the top's edge lies 1 - 0.07 / sqrt(2) m from the middle)
  const want = 1 - 0.07 / Math.SQRT2;
  assert(centre !== null && near(centre, 1 + want, 1e-3), `the top's centre lies ${centre === null ? '?' : (centre - 1).toFixed(3)} m inside its edge (${want.toFixed(3)})`);
  assert(okEdge && topC > 0 && rimC > 0, `the top's ring (${topC}) and the chamfer and walls (${rimC}) are rim`);
  // idempotent; indexed geometry left alone
  const before = g.attributes.aRim;
  addSlabRim(g);
  assert(g.attributes.aRim === before, 'a second addSlabRim keeps the rim it has');
  const ix = new THREE.BoxGeometry(1, 1, 1);
  addSlabRim(ix);
  assert(!ix.attributes.aRim, 'an indexed geometry gets no rim (the print leaves its rim alone)');
}

function sets() {
  out('\n== DP FLOOR SETS');
  assert(dpFloorLook() === 1, `?dpFloor=a reads as look 1 (${dpFloorLook()})`);
  for (const [name, make] of SETS) {
    const set = make(createSharedUniforms(), new Colliders());
    const { mat, list } = slabMeshes(set);
    const u = mat?.uniforms ?? {};
    assert(mat?.defines?.DP_FLOOR === 1, `${name}: its floor's material prints (DP_FLOOR ${mat?.defines?.DP_FLOOR})`);
    assert(u.uDigs && u.uDpBody && u.uDpRelief && u.uDpLift && u.uDpRim && u.uDpView && u.uDpAsh, `${name}: the print's uniforms are there`);
    assert(u.uDpFxOn === DP_FX_U.uDpFxOn && u.uDpSteps === DP_STEP_U.uDpSteps, `${name}: the upgrades' and the prints' uniforms are the shared ones`);
    const body = u.uDpBody?.value;
    assert(body && [body.x, body.y, body.z, body.w].every(Number.isFinite) && body.w > 0, `${name}: its body numbers are finite (k ${body?.w})`);
    // every slab mesh (the paving and the floor's cracked / broken looks) has its rim from the build
    let n = 0, withRim = 0, inside = 0, bad = 0, cracked = 0;
    for (const m of list) {
      n++;
      const a = m.geometry.attributes.aRim;
      if (!a) continue;
      withRim++;
      // (a cracked slab's pieces, floor.js 'pavingCracked': every edge a crack, from CRACK_RIM)
      const base = /Cracked$/.test(m.name) ? CRACK_RIM : 1;
      if (base !== 1) cracked++;
      for (let i = 0; i < a.count; i++) {
        const v = a.getX(i);
        if (!(v >= base && v <= base + RIM_MAX + 1e-6)) bad++;
        else if (v > base + 0.05) inside++;
      }
    }
    assert(n > 0 && withRim === n && bad === 0, `${name}: ${withRim} of ${n} slab meshes have their rim at build, all in range`);
    // (the training room's floor stays whole: no cracked look)
    assert(cracked === (make === createTrainingRoom ? 0 : 1), `${name}: its cracked slabs' pieces are marked as cracks (${cracked} mesh)`);
    assert(inside > 0, `${name}: some of the floor lies inside its slabs' rims (${inside} corners)`);
  }
}

function off() {
  out('\n== DP FLOOR OFF');
  setLook('dpFloor', '0');
  try {
    const U = createSharedUniforms();
    const mat = createCarvedGlyphMaterial(U, {});
    assert(mat.defines.DP_FLOOR === 0, `?dpFloor=0: the carved material does not print (DP_FLOOR ${mat.defines.DP_FLOOR})`);
    assert(!mat.uniforms.uDigs && !mat.uniforms.uDpBody && !mat.uniforms.uDpFxOn, '... and has none of the print\'s uniforms');
    assert(mat.onBeforeRender === THREE.Material.prototype.onBeforeRender, '... and no first-draw hook');
    const set = createCourtyard(U, new Colliders());
    const { list } = slabMeshes(set);
    assert(list.length > 0 && list.every((m) => !m.geometry.attributes.aRim), `... a set's floor gets no rim (${list.length} meshes)`);
  } finally {
    setLook('dpFloor', null);
  }
  // look b, and a set's own numbers over the look's
  setLook('dpFloor', 'b');
  try {
    const mat = createCarvedGlyphMaterial(createSharedUniforms(), { dp: { k: 0.33 } });
    assert(mat.defines.DP_FLOOR === 2, `?dpFloor=b: look 2 (${mat.defines.DP_FLOOR})`);
    assert(near(mat.uniforms.uDpBody.value.w, 0.33) && near(mat.uniforms.uDpRelief.value.x, DP_FLOOR.b.wear), "... the set's k over b's, b's relief kept");
  } finally {
    setLook('dpFloor', null);
  }
  // an explicit option wins over the switch
  const m0 = createCarvedGlyphMaterial(createSharedUniforms(), { dpFloor: '0' });
  assert(m0.defines.DP_FLOOR === 0, "a material built with { dpFloor: '0' } does not print under the switch");
}

function lazy() {
  out('\n== DP FLOOR LAZY');
  // Cinderwood: forest.js builds its flagstones with the carved material and does not call addSlabRims
  const set = createForest(createSharedUniforms(), new Colliders());
  const { mat, list } = slabMeshes(set);
  assert(mat?.defines?.DP_FLOOR === 1 && list.length >= 1, `Cinderwood's flagstones print (${list.length} meshes)`);
  const flags = list.find((m) => m.visible) ?? list[0];
  assert(!flags.geometry.attributes.aRim, '... their rim is not made at build');
  const scene = new THREE.Scene();
  let calls = 0;
  scene.onBeforeRender = () => { calls++; };
  // its first draw: made, held for the next frame (added during a draw it would never be bound)
  mat.onBeforeRender(null, scene, null, flags.geometry, flags, null);
  assert(!flags.geometry.attributes.aRim, 'the first draw makes the rim but does not add it during the draw');
  scene.onBeforeRender(null, scene, null, null);
  assert(!!flags.geometry.attributes.aRim && calls === 1, `the next frame's start adds it (the scene's own hook still runs: ${calls})`);
  // once only; never throws on what it cannot use
  mat.onBeforeRender(null, scene, null, flags.geometry, flags, null);
  let threw = false;
  try {
    lazySlabRim(scene, null);
    lazySlabRim(scene, new THREE.BoxGeometry(1, 1, 1));
    lazySlabRim(null, new THREE.BufferGeometry());
  } catch {
    threw = true;
  }
  assert(!threw, 'a missing, indexed or empty geometry, or no scene: nothing, no throw');
  // addSlabRims on a set that prints: every mesh of the material
  addSlabRims(set.group, mat);
  assert(list.every((m) => !!m.geometry.attributes.aRim), `addSlabRims gives every flagstone mesh its rim (${list.length})`);
}

const RUN = { rim, sets, off, lazy };
for (const [k, f] of Object.entries(RUN)) if (SCEN === 'all' || SCEN === k) f();
out(fails ? `\n${fails} dp floor check(s) FAILED` : '\nall dp floor checks passed');
process.exit(fails ? 1 : 0);
