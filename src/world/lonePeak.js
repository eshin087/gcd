import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createAsciiObjectMaterial, createCarvedGlyphMaterial, createPropArtMaterial } from '../render/materials.js';
import { markCaster } from '../render/pipeline.js';
import { mulberry32, range, fbm2 } from '../core/rng.js';
import { CONFIG } from '../core/config.js';
import { TAU } from '../core/math.js';
import { mul, STONE, SLAB_LOOK, buildBoulder, buildFlagstone, buildBonfire, buildRubble, buildStump, geosHeight } from './forest.js';
import { breakableFloor } from './floor.js';
import { lookOf } from '../entities/enemies/duelist/lookSwitch.js';
import { GRANITE, ledgeCol, ledgeCells, ledgePlate, outcropOutline, buildStrikingStone, buildBentPine, buildSplitRock, buildHut, buildCrag } from './lonePeakProps.js';

// The Lone Peak Hermitage (ADR-138; levels/lonepeak.js): a ledge high on a mountain where an old man has
// struck the same stones for forty years. South to north (the player walks north, -z): the bonfire on a
// shelf of rock, a path of flagstones up to the ledge, then the training ground: a disc of worn rock
// plates (R 15, the ledge's rock split along old joints) round the origin, ringed by STRIKING STONES
// (8 inside the ring, 12 on its rim; each with a fist-deep dent at the height of a blow, a pale bruise
// of crushed stone and cracks running from it; each one cover against his line blows, and each one
// falls: the arena is the fight's clock), wind-bent pines and boulders round the rim, crags of the
// mountain beyond the bound. The duel camera looks down from the south: the hermit's hut stands east
// of the ring and the Split Rock (a boulder the size of a house cut clean in two) west of it, both a
// little north of the centre, where it frames them (never far north: off the top of the frame).
// Same output shape as createForest (world.js reads it). Everything that can be hit is a breakable
// (ADR-107): the plates (world/floor.js), the striking stones, the pines (they burn and fall), the
// boulders near the ledge, the hut (it burns); the Split Rock and the bonfire stay whole.
// The props' builders are in lonePeakProps.js. Two lights behind `?peak=` (lookOf('peak', 'a', 'a'), read
// when the level is built: a reload each): `a` a dawn mist (the author's pick), `b` a dusk.

/** Layout numbers (world metres). The level's CONFIG.world overrides match these (levels/lonepeak.js). */
export const PEAK = {
  r: 15, // the training ground: a disc round the origin
  bound: 38, // where the hero may go (round the origin): the ledge, the path, the bonfire
  bonfire: { x: 0, z: 34 },
  entryZ: 15.4, // the ledge's south lip (the boss wakes as the hero crosses it)
  // the striking stones: [x, z, h] (8 inside the ring at 6 - 9 m, 12 on its rim at 13.5 - 15 m)
  inner: [[0, -7.6, 3.6], [5.2, -5.4, 3.0], [7.8, 0.8, 3.8], [5.6, 6.2, 2.8], [-1.2, 7.4, 3.4], [-6.0, 5.0, 4.0], [-7.6, -1.2, 2.9], [-4.4, -6.2, 3.3]],
  rimR: [13.5, 15],
  rimN: 12,
  // he waits south of the northernmost inner stone, his palm on it (his back to the path)
  wait: { x: 0, z: -6.7, yaw: Math.PI },
  // landmarks where the duel camera frames them (the camera looks down from the south: east and west
  // of the ring, never far north of the disc)
  splitRock: { x: -18.8, z: -7.5, yaw: 0.12, s: 1 },
  hut: { x: 18.4, z: -5.6, yaw: -0.35 },
};

/** The lights (`?peak=`): a is the default. */
export const PEAK_LOOKS = Object.freeze(['a', 'b']);
/** The light this page builds (read when the level is built). */
export const peakOption = () => {
  const o = lookOf('peak', 'a', 'a');
  return PEAK_LOOKS.includes(o) ? o : 'a';
};
/**
 * The set's light (world.js applySky): a, a cold dawn mist (a low, pale light from the east, the
 * distance lost in grey); b, a dusk (a low, warm light from the west, long shadows, the distance dark).
 */
export const PEAK_SKY = Object.freeze({
  a: Object.freeze({ moonColor: [0.5, 0.52, 0.6], moonDir: [0.78, 0.5, -0.22], ambient: [0.034, 0.038, 0.05], fogColor: [0.046, 0.051, 0.062], fogNear: 15, fogFar: 58 }),
  b: Object.freeze({ moonColor: [0.78, 0.46, 0.3], moonDir: [-0.8, 0.42, 0.18], ambient: [0.04, 0.03, 0.036], fogColor: [0.026, 0.015, 0.018], fogNear: 24, fogFar: 66 }),
});

/** A floor of plates under the duel must stay calm: sparse, dim glyphs (the courtyard's paving look). */
const PLATE_LOOK = { gain: 1.5, lumScale: 2.0, edge: 0.28, inkFloor: 0.03, topGlyphs: ['.   ', '. . ', '.:. ', ':.;.', ';:=.', '=;%:'] };
/** The path's flagstones (forest.js buildFlagstone's colour). */
const flagCol = (px, py, pz) => mul(STONE, 0.6 + 0.4 * fbm2(px * 2, pz * 2, 2));
/** The path's centre line (x at z): a bend up the slope. */
const pathX = (z) => 1.4 * Math.sin((z - 18) * 0.2);
/** The wind on the ledge: from the west (the pines lean east). */
const WIND = 0;
/** Pines and boulders this close to the centre are breakables; past it they are static. */
const REACH_R = 40;

export function createLonePeak(U, colliders) {
  const OPT = peakOption();
  const rng = mulberry32(CONFIG.seed + 303); // the layout
  const br = mulberry32(CONFIG.seed + 5303); // the rubble and stumps: its own stream
  const nr = mulberry32(CONFIG.seed + 6303); // what is added later: its own stream
  const C = PEAK;
  const group = new THREE.Group();
  group.name = 'lonePeak';
  const treeGeos = [], stoneGeos = [], slabGeos = [], propGeos = [], treeSpots = [], bare = [], slabs = [], floor = [], breakables = [];

  // ---- the training ground: the ledge's rock, split along old joints; a few plates gone (earth shows)
  {
    const fr = mulberry32(CONFIG.seed + 4303); // (the plates' own stream)
    for (const cell of ledgeCells(fr, C.r)) {
      const drop = cell.rim ? 0.3 + 0.4 * (cell.area < 1 ? 1 : 0) : 0.035;
      if (fr() < drop) {
        bare.push({ x: cell.x, z: cell.z, r: 0.7 });
        continue;
      }
      const s = ledgePlate(fr, cell.x, cell.z, cell.pts);
      slabGeos.push(s.geo);
      slabs.push({ x: cell.x, z: cell.z, r: s.r * 1.05, outline: s.outline });
      floor.push({ geo: s.geo, outline: s.outline, x: cell.x, z: cell.z, r: s.r * 0.85, col: ledgeCol });
    }
  }

  // ---- the striking stones (kind 'post'): cover, they topple; `inner` marks the ring's eight. The
  // dent faces the south, where the duel camera sees it (turned toward the centre where it can be);
  // the hermit's own stone (the northernmost) faces him where he waits, its dent the deepest
  const post = (x, z, h, inner, deep) => {
    // (toward the centre where that is within 0.7 rad of the south, else turned as far as that)
    const toC = Math.atan2(-x, -z);
    let a = Math.max(-0.7, Math.min(0.7, Math.atan2(Math.sin(toC), Math.cos(toC)))) + range(rng, -0.15, 0.15);
    if (deep > 1.2) a = 0;
    const w = range(rng, 0.95, 1.2), d = range(rng, 0.72, 0.9);
    const { geo } = buildStrikingStone(rng, x, z, { h, w, d, face: a, deep });
    breakables.push({
      kind: 'post', mat: 'stone', look: 'prop', x, z, r: 0.55, h: geosHeight([geo]), geos: [geo], colliders: [colliders.add(x, z, 0.55, 'stone')],
      broken: { geos: buildRubble(br, x, z, 0.5, { col: GRANITE, h: range(br, 0.35, 0.6) }), r: 0.4 }, cover: true, topples: true, lift: 0, inner,
    });
  };
  C.inner.forEach(([x, z, h], i) => post(x, z, h, true, i === 0 ? 1.5 : 1));
  for (let i = 0; i < C.rimN; i++) {
    const a = (i / C.rimN) * TAU + 0.13, r = range(rng, C.rimR[0], C.rimR[1]);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = range(rng, 2.6, 4.2);
    if (z > C.r - 3 && Math.abs(x) < 3.5) continue; // (the gap where the path comes up)
    post(x, z, h, false, 1);
  }

  // ---- the path up from the bonfire: two broken steps at the lip, then flagstones down the slope
  for (const z of [C.entryZ + 0.45, C.entryZ + 1.35]) {
    let x = -2.6;
    while (x < 2.6) {
      const w = Math.min(2.6 - x, range(rng, 1.0, 1.9));
      const pts = [[-w / 2 + 0.05, -0.36], [w / 2 - 0.05, -0.38], [w / 2 - 0.08, 0.36], [-w / 2 + 0.06, 0.38]];
      const s = ledgePlate(rng, x + w / 2, z, pts);
      slabGeos.push(s.geo);
      slabs.push({ x: x + w / 2, z, r: s.r, outline: s.outline });
      floor.push({ geo: s.geo, outline: s.outline, x: x + w / 2, z, r: s.r * 0.85, col: ledgeCol });
      x += w;
    }
  }
  for (let z = C.entryZ + 2.4; z < C.bonfire.z - 1.5; z += range(rng, 0.9, 1.3)) {
    const x = pathX(z) + range(rng, -0.5, 0.5), w = range(rng, 0.9, 1.4), d = range(rng, 0.7, 1.1);
    const s = buildFlagstone(rng, x, z, w, d, rng() * TAU);
    slabGeos.push(s.geo);
    slabs.push({ x, z, r: Math.max(w, d) * 0.65, outline: s.outline });
    floor.push({ geo: s.geo, outline: s.outline, x, z, r: Math.max(w, d) * 0.5, col: flagCol });
  }

  // ---- the bonfire on its shelf
  const bf = C.bonfire;
  propGeos.push(...buildBonfire(rng, bf.x, bf.z));
  colliders.add(bf.x, bf.z, 0.75, 'bonfire');
  bare.push({ x: bf.x, z: bf.z, r: 2.4 });

  // ---- landmarks: the Split Rock (it stays whole: static, colliders) and the hut (it burns)
  const S = C.splitRock, H = C.hut;
  {
    const lr = mulberry32(CONFIG.seed + 1303);
    const rock = buildSplitRock(lr, S);
    stoneGeos.push(...rock.geos);
    for (const [x, z, r] of rock.colliders) colliders.add(x, z, r, 'stone');
    treeSpots.push({ x: S.x, z: S.z, r: 5 });
    const hut = buildHut(lr, H, br);
    const hc = hut.colliders.map(([x, z, r]) => colliders.add(x, z, r, 'stone'));
    breakables.push({ kind: 'hut', mat: 'wood', look: 'prop', x: H.x, z: H.z, r: 2.1, h: geosHeight(hut.geos), geos: hut.geos, colliders: hc, broken: { geos: hut.ruin, r: 1.6 }, topples: false, cover: true, lift: 0 });
    bare.push({ x: H.x, z: H.z, r: 2.8 });
  }

  // ---- pines and boulders round the rim, out to the bound and past it (static beyond)
  const open = (x, z) => {
    if (Math.hypot(x, z) < C.r + 2.2) return false;
    if (z > C.r - 2 && z < bf.z + 4 && Math.abs(x - pathX(z)) < 4) return false;
    if (Math.hypot(x - bf.x, z - bf.z) < 5) return false;
    if (Math.hypot(x - S.x, z - S.z) < 6.5 || Math.hypot(x - H.x, z - H.z) < 4.6) return false;
    return true;
  };
  const trees = [], rocks = [];
  for (let i = 0; i < 20000 && trees.length < 90; i++) {
    const a = rng() * TAU, r = C.r + 2.5 + Math.pow(rng(), 1.15) * 42;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!open(x, z) || trees.some((t) => Math.hypot(t.x - x, t.z - z) < (r < REACH_R ? 5 : 4.4))) continue;
    trees.push({ x, z, s: range(rng, 0.85, 1.25) });
  }
  for (const t of trees) {
    const g = buildBentPine(rng, t.x, t.z, t.s, WIND + range(rng, -0.35, 0.35));
    const rad = Math.hypot(t.x, t.z);
    treeSpots.push({ x: t.x, z: t.z, r: 2.2 * t.s });
    if (rad < REACH_R) {
      const c = colliders.add(t.x, t.z, 0.34 * t.s, 'trunk');
      breakables.push({ kind: 'pine', mat: 'wood', look: 'grid', x: t.x, z: t.z, r: 0.34 * t.s, h: geosHeight(g), geos: g, colliders: [c], broken: { geos: buildStump(br, t.x, t.z, t.s * 0.75), r: 0.3 * t.s }, lift: 1 });
    } else treeGeos.push(...g);
  }
  for (let i = 0; i < 22; i++) {
    const a = rng() * TAU, r = range(rng, C.r + 2, 50), x = Math.cos(a) * r, z = Math.sin(a) * r;
    const size = range(rng, 0.7, 1.6);
    if (!open(x, z)) continue;
    const g = buildBoulder(rng, x, z, size);
    rocks.push({ x, z, r: size });
    const c = r < REACH_R + 2 ? colliders.add(x, z, size * 0.85, 'boulder') : null;
    if (r < REACH_R) breakables.push({ kind: 'boulder', mat: 'stone', look: 'prop', x, z, r: size * 0.85, h: geosHeight([g]), geos: [g], colliders: c ? [c] : [], topples: false, lift: 1 });
    else stoneGeos.push(g);
  }
  // shelves of bedrock showing through the turf round the training ground (the ledge is rock under a
  // thin skin of grass): floor pieces like its plates
  for (let i = 0, k = 0; i < 600 && k < 64; i++) {
    const a = nr() * TAU, r = range(nr, C.r + 1.6, C.bound - 1), x = Math.cos(a) * r, z = Math.sin(a) * r;
    const rad = range(nr, 0.9, 2.1);
    if (!open(x, z) && Math.hypot(x, z) > C.r + 2.2) continue;
    if (z > C.r - 2 && z < bf.z + 4 && Math.abs(x - pathX(z)) < 2.6 + rad) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < rad * 1.2 + 0.6) || rocks.some((t) => Math.hypot(t.x - x, t.z - z) < rad + t.r + 0.3)) continue;
    if (slabs.some((s) => s.outcrop && Math.hypot(s.x - x, s.z - z) < rad + s.r + 0.4)) continue;
    const s = ledgePlate(nr, x, z, outcropOutline(nr, rad), { top: [0.04, 0.12], tilt: 0.05 });
    slabGeos.push(s.geo);
    slabs.push({ x, z, r: s.r * 1.05, outline: s.outline, outcrop: true });
    floor.push({ geo: s.geo, outline: s.outline, x, z, r: s.r * 0.85, col: ledgeCol });
    k++;
  }
  // the mountain beyond the bound: crags of granite (out of reach, static)
  for (let i = 0, k = 0; i < 200 && k < 16; i++) {
    const a = nr() * TAU, r = range(nr, 44, 62), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > 20 && Math.abs(x) < 18) continue; // (the slope down past the bonfire stays open)
    stoneGeos.push(buildCrag(nr, x, z, { h: range(nr, 5, 11), r: range(nr, 1.6, 3.2) }));
    k++;
  }

  const mat = createAsciiObjectMaterial(U, { fadeNearPlayer: true, side: THREE.DoubleSide });
  const meshOf = (geos, m, name) => {
    const g = geos.length ? mergeGeometries(geos) : new THREE.BufferGeometry();
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    return mesh;
  };
  // (prop art a touch below the house gain: the grey granite of the stones prints lighter than the
  // courtyard's blue stone; the breakables' material takes this gain too)
  const stoneMat = createPropArtMaterial(U, { fadeNearPlayer: true, gain: 0.8 });
  const slabMat = createCarvedGlyphMaterial(U, { ...SLAB_LOOK, ...PLATE_LOOK, viewPitch: CONFIG.camera.pitch });
  const slabMesh = meshOf(slabGeos, slabMat, 'plates');
  group.add(meshOf(treeGeos, mat, 'trees'), meshOf(propGeos, mat, 'props'), meshOf(stoneGeos, stoneMat, 'stones'), slabMesh);
  markCaster(group);
  breakables.push(...breakableFloor({ slabs: floor, slabGeos, slabMesh, mat: slabMat, rng: mulberry32(CONFIG.seed + 7303), group }).defs);

  const W = CONFIG.world.dragonSleep ?? { x: 0, z: 0 };
  return {
    group, treeSpots, bare, slabs, nest: { x: W.x, z: W.z }, bonfire: { x: bf.x, z: bf.z },
    material: mat, stoneMaterial: stoneMat, slabMaterial: slabMat,
    breakables,
    option: OPT,
    scarInk: [0.012, 0.012, 0.016], // dark cracks in the grey rock
    sky: PEAK_SKY[OPT],
    // short, sparse mountain grass: a few tufts in the joints of the ledge, thin on the path
    grass: {
      ash: 0.25,
      height: 0.45,
      density: (x, z) => {
        const r = Math.hypot(x, z);
        const onPath = z > C.r && z < bf.z + 3 && Math.abs(x - pathX(z)) < 2.2;
        return r < C.r + 0.8 ? 0.08 : onPath ? 0.2 : 0.12 + 0.24 * Math.max(0, fbm2(x * 0.08 + 3, z * 0.08 - 5, 2) - 0.2);
      },
    },
  };
}
