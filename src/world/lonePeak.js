import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createAsciiObjectMaterial, createCarvedGlyphMaterial, createPropArtMaterial } from '../render/materials.js';
import { markCaster } from '../render/pipeline.js';
import { mulberry32, range, fbm2 } from '../core/rng.js';
import { CONFIG } from '../core/config.js';
import { TAU } from '../core/math.js';
import {
  carve, slabGeometry, mul, STONE, SLAB_LOOK,
  buildDeadTree, buildStandingStone, buildBoulder, buildFlagstone, buildBonfire, buildRubble, geosHeight,
} from './forest.js';
import { breakableFloor } from './floor.js';

// The Lone Peak Hermitage (ADR-138; levels/lonepeak.js): a ledge high on a mountain where an old man has
// struck the same stones for forty years. South to north (the player walks north, -z): the bonfire on a
// shelf of rock, a path of flagstones up to the ledge, then the training ground: a disc of worn rock
// plates (R 15) round the origin, ringed by STRIKING STONES (8 inside the ring, 12 on its rim; each
// one cover against his line blows, and each one falls: the arena is the fight's clock), wind-bent
// pines and boulders round the rim, the hermit's hut and the Split Rock where the duel camera looks.
// Same output shape as createForest (world.js reads it). Everything that can be hit is a breakable
// (ADR-107): the plates (world/floor.js), the striking stones, the pines, the boulders near the ledge,
// the hut; the Split Rock and the bonfire stay whole.
// (PLACEHOLDER art: the set agent replaces the builders with lonePeakProps.js; the layout is the contract.)

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
  // of the ring, and north beyond it, never far north of the disc)
  splitRock: { x: -20, z: -6, yaw: 0.5, s: 1 },
  hut: { x: 19, z: -4, yaw: -0.6 },
};

const PLATE_LOOK = { gain: 1.6, lumScale: 2.0, edge: 0.3, inkFloor: 0.035, topGlyphs: ['.   ', '. . ', '.:. ', ':.;.', ';:=.', '=;%:'] };
const ROCK = [0.17, 0.17, 0.18];
const rockCol = (px, py, pz) => mul(ROCK, (0.6 + 0.35 * fbm2(px * 1.4, pz * 1.4, 2)) * (0.8 + 0.2 * fbm2(px * 0.2 + 7, pz * 0.2, 2)));
const flagCol = (px, py, pz) => mul(STONE, 0.6 + 0.4 * fbm2(px * 2, pz * 2, 2));
/** The path's centre line (x at z): a bend up the slope. */
const pathX = (z) => 1.4 * Math.sin((z - 18) * 0.2);

/** A worn plate of rock: a jittered polygon, chamfered. */
function plate(rng, x, z, rad, yaw) {
  const n = 5 + Math.floor(rng() * 3), pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + range(rng, -0.2, 0.2), r = rad * range(rng, 0.78, 1.0);
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const g = slabGeometry(pts, { top: range(rng, 0.03, 0.05), inset: 0.06, drop: 0.04 });
  g.rotateY(yaw);
  g.translate(x, 0, z);
  carve(g, { col: rockCol, ao: 0.85, moss: () => 0.06, edge: (px, py, pz, nx, ny) => (ny > 0.5 && ny < 0.95 ? 1 : 0) });
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { geo: g, outline: pts.map(([px, pz]) => [x + c * px + s * pz, z - s * px + c * pz]), r: rad * 1.1 };
}

export function createLonePeak(U, colliders) {
  const rng = mulberry32(CONFIG.seed + 303);
  const br = mulberry32(CONFIG.seed + 5303); // the rubble's own stream
  const C = PEAK;
  const group = new THREE.Group();
  group.name = 'lonePeak';
  const treeGeos = [], stoneGeos = [], slabGeos = [], propGeos = [], treeSpots = [], bare = [], slabs = [], floor = [], breakables = [];

  // ---- the training ground: rings of worn plates
  for (let ring = 0, r = 0; r < C.r; ring++) {
    const rr = ring === 0 ? 0 : r;
    const n = ring === 0 ? 1 : Math.max(6, Math.round((TAU * rr) / 1.7));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + ring * 0.37, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (rng() < 0.06) {
        bare.push({ x, z, r: 0.6 });
        continue;
      }
      const s = plate(rng, x + range(rng, -0.1, 0.1), z + range(rng, -0.1, 0.1), ring === 0 ? 1.1 : range(rng, 0.72, 0.9), rng() * TAU);
      slabGeos.push(s.geo);
      slabs.push({ x, z, r: s.r, outline: s.outline });
      floor.push({ geo: s.geo, outline: s.outline, x, z, r: s.r * 0.87, col: rockCol });
    }
    r += ring === 0 ? 1.5 : 1.6;
  }

  // ---- the striking stones (kind 'post'): cover, they topple; `inner` marks the ring's eight
  const post = (x, z, h, inner) => {
    const g = buildStandingStone(rng, x, z, { h, w: 1.0, d: 0.9, yaw: rng() * TAU });
    breakables.push({
      kind: 'post', mat: 'stone', look: 'prop', x, z, r: 0.55, h: geosHeight([g]), geos: [g], colliders: [colliders.add(x, z, 0.55, 'stone')],
      broken: { geos: buildRubble(br, x, z, 0.5, { h: range(br, 0.35, 0.6) }), r: 0.4 }, cover: true, topples: true, lift: 0, inner,
    });
  };
  for (const [x, z, h] of C.inner) post(x, z, h, true);
  for (let i = 0; i < C.rimN; i++) {
    const a = (i / C.rimN) * TAU + 0.13, r = range(rng, C.rimR[0], C.rimR[1]);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > C.r - 3 && Math.abs(x) < 3.5) continue; // (the gap where the path comes up)
    post(x, z, range(rng, 2.6, 4.2), false);
  }

  // ---- the path up from the bonfire
  for (let z = C.entryZ + 0.6; z < C.bonfire.z - 1.5; z += range(rng, 0.9, 1.3)) {
    const x = pathX(z) + range(rng, -0.5, 0.5), w = range(rng, 0.9, 1.4), d = range(rng, 0.7, 1.1);
    const s = buildFlagstone(rng, x, z, w, d, rng() * TAU);
    slabGeos.push(s.geo);
    slabs.push({ x, z, r: Math.max(w, d) * 0.65, outline: s.outline });
    floor.push({ geo: s.geo, outline: s.outline, x, z, r: Math.max(w, d) * 0.5, col: flagCol });
  }

  // ---- the bonfire
  const bf = C.bonfire;
  propGeos.push(...buildBonfire(rng, bf.x, bf.z));
  colliders.add(bf.x, bf.z, 0.75, 'bonfire');
  bare.push({ x: bf.x, z: bf.z, r: 2.4 });

  // ---- pines and boulders round the rim, out to the bound and past it (static beyond)
  const open = (x, z) => {
    if (Math.hypot(x, z) < C.r + 2.5) return false;
    if (z > C.r - 2 && z < bf.z + 4 && Math.abs(x - pathX(z)) < 4) return false;
    if (Math.hypot(x - bf.x, z - bf.z) < 5) return false;
    if (Math.hypot(x - C.splitRock.x, z - C.splitRock.z) < 6 || Math.hypot(x - C.hut.x, z - C.hut.z) < 5) return false;
    return true;
  };
  const trees = [];
  for (let i = 0; i < 20000 && trees.length < 160; i++) {
    const a = rng() * TAU, r = C.r + 3 + Math.pow(rng(), 1.2) * 40;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!open(x, z) || trees.some((t) => Math.hypot(t.x - x, t.z - z) < 3.4)) continue;
    trees.push({ x, z, s: range(rng, 0.9, 1.4) });
  }
  for (const t of trees) {
    const g = buildDeadTree(rng, t.x, t.z, t.s);
    const rad = Math.hypot(t.x, t.z);
    treeSpots.push({ x: t.x, z: t.z, r: 2.4 * t.s });
    const c = rad < 40 ? colliders.add(t.x, t.z, 0.42 * t.s, 'trunk') : null;
    if (rad < 40) breakables.push({ kind: 'pine', mat: 'wood', look: 'grid', x: t.x, z: t.z, r: 0.42 * t.s, h: geosHeight(g), geos: g, colliders: c ? [c] : [], lift: 1 });
    else treeGeos.push(...g);
  }
  for (let i = 0; i < 18; i++) {
    const a = rng() * TAU, r = range(rng, C.r + 2, 50), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!open(x, z)) continue;
    const size = range(rng, 0.7, 1.6), g = buildBoulder(rng, x, z, size);
    const c = r < 40 ? colliders.add(x, z, size * 0.85, 'boulder') : null;
    if (r < 30) breakables.push({ kind: 'boulder', mat: 'stone', look: 'prop', x, z, r: size * 0.85, h: geosHeight([g]), geos: [g], colliders: c ? [c] : [], topples: false, lift: 1 });
    else stoneGeos.push(g);
  }

  // ---- landmarks: the Split Rock (stays whole) and the hut (placeholder: two boulders and a box)
  {
    const S = C.splitRock;
    for (const s of [-1, 1]) {
      const x = S.x + Math.cos(S.yaw) * s * 1.6, z = S.z - Math.sin(S.yaw) * s * 1.6;
      stoneGeos.push(buildStandingStone(rng, x, z, { h: 6.5, w: 3.0, d: 5.0, yaw: S.yaw }));
      colliders.add(x, z, 2.2, 'stone');
    }
    const H = C.hut;
    const hut = buildStandingStone(rng, H.x, H.z, { h: 3.0, w: 4.0, d: 3.2, yaw: H.yaw });
    breakables.push({ kind: 'hut', mat: 'wood', look: 'prop', x: H.x, z: H.z, r: 2.2, h: geosHeight([hut]), geos: [hut], colliders: [colliders.add(H.x, H.z, 2.2, 'stone')], broken: { geos: buildRubble(br, H.x, H.z, 1.8, { h: 0.5 }), r: 1.6 }, topples: false, lift: 0 });
  }

  const mat = createAsciiObjectMaterial(U, { fadeNearPlayer: true, side: THREE.DoubleSide });
  const meshOf = (geos, m, name) => {
    const g = geos.length ? mergeGeometries(geos) : new THREE.BufferGeometry();
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    return mesh;
  };
  const stoneMat = createPropArtMaterial(U, { fadeNearPlayer: true });
  const slabMat = createCarvedGlyphMaterial(U, { ...SLAB_LOOK, ...PLATE_LOOK, viewPitch: CONFIG.camera.pitch });
  const slabMesh = meshOf(slabGeos, slabMat, 'plates');
  group.add(meshOf(treeGeos, mat, 'trees'), meshOf(propGeos, mat, 'props'), meshOf(stoneGeos, stoneMat, 'stones'), slabMesh);
  markCaster(group);
  breakables.push(...breakableFloor({ slabs: floor, slabGeos, slabMesh, mat: slabMat, rng: mulberry32(CONFIG.seed + 7303), group }).defs);

  const S = CONFIG.world.dragonSleep ?? { x: 0, z: 0 };
  return {
    group, treeSpots, bare, slabs, nest: { x: S.x, z: S.z }, bonfire: { x: bf.x, z: bf.z },
    material: mat, stoneMaterial: stoneMat, slabMaterial: slabMat,
    breakables,
    scarInk: [0.012, 0.012, 0.016],
    // a cool dawn mist
    sky: { moonColor: [0.62, 0.66, 0.78], ambient: [0.1, 0.11, 0.14], fogColor: [0.07, 0.08, 0.1], fogNear: 30, fogFar: 95 },
    grass: {
      height: 0.5,
      density: (x, z) => {
        const r = Math.hypot(x, z);
        const onPath = z > C.r && z < bf.z + 3 && Math.abs(x - pathX(z)) < 2.2;
        return r < C.r + 0.8 ? 0.08 : onPath ? 0.25 : 0.3 + 0.2 * fbm2(x * 0.08 + 3, z * 0.08 - 5, 2);
      },
    },
  };
}
