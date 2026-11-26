import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createPropArtMaterial, createCarvedGlyphMaterial } from '../render/materials.js';
import { markCaster } from '../render/pipeline.js';
import { mulberry32, range, fbm2 } from '../core/rng.js';
import { CONFIG } from '../core/config.js';
import { prep, carve, slabGeometry, mul, SLAB_LOOK, buildBonfire, buildRubble } from './forest.js';
import { breakableFloor } from './floor.js';
import { addSlabRims } from '../render/dragonFloor.js';

// The Veiled Crossing (levels/veil.js): a city crossing after the fight has already levelled it, at
// night, under a black veil. TODAY A STAND-IN (core's, wave 0): a small real set so the level loads, the
// rules run and the domain's scene change is proven. The WORLD AGENT replaces this file whole (the
// scramble's white bars, the crater field, the old trench, the fallen tower, the overpass, the cars and
// the bus, the lamps, the gantry, the tank; the void's floating pieces and its stars).
//
// THE SET CONTRACT (what the rules, the moves and the tests read; the world agent keeps these):
//   CROSSING                 the layout: { r (arena radius), bound (the hero's), half (the floor's half
//                            width), bonfire {x, z}, wait {x, z, yaw} (where he waits), entryZ (the boss
//                            trigger), dragonBound }; levels/veil.js copies it into CONFIG.world
//   createVeiledCrossing(U, colliders) → the set (world.js's shape: group, treeSpots, bare, slabs,
//                            nest, bonfire, material, stoneMaterial, slabMaterial, breakables, sky,
//                            ambience, grass, scarInk, floorCarry), plus:
//   set.setPhase(n)          the light by his phase: 1 cold and dim, 2 his eyes' blue in the air, 3 the
//                            void (the domain calls it with the scene; the reset with 1)
//   set.scenes               the scriptHall contract (world/scriptHall.js header): ids ['crossing',
//                            'void'] (the first is home), now, k, morphing, to(id, {x, z, speed}),
//                            snap(id), reset(), update(dt), hold(sec), stutter(sec), bind(game).
//                            A piece with `scene: 'crossing'` stands only in the crossing, `scene:
//                            'void'` only in the void (a floating piece: `y0` > 0); no `scene`: both
//                            (the floor). world:scene { id, x, z } as a scene changes.
//   THROWABLES (the terrain agent finds them by kind, never by place: destructibles.nearest(x, z,
//   { kind }) or list.filter(b => b.kind === ...)): loose pieces a body can lift (`lift: 1`) are of the
//   kinds  'car'  'slab'  'towerTop' (`lift: 2`, raised: y0, held by a 'towerBase')  and, in the void,
//   'floatSlab' (raised, `lift: 1`). Everything else is cover or wreck.
//   The void's AIR (its stars: tiny faint letters, a LetterBatch) is drawn by this set's ambience while
//   scenes.now === 'void' (the stand-in draws none).

/** Layout numbers (world metres): levels/veil.js copies these into CONFIG.world. */
export const CROSSING = Object.freeze({
  r: 18,
  bound: 15.5,
  half: 18,
  cell: 3,
  dragonBound: 13.5,
  bonfire: Object.freeze({ x: 0, z: 22 }),
  wait: Object.freeze({ x: 0, z: -5, yaw: 0 }), // (yaw 0 faces +z: the hero coming up from the south)
  entryZ: 15,
});
/** The scenes (the first is home). */
export const SCENES = Object.freeze(['crossing', 'void']);
/** The kinds of loose pieces the moves may lift and throw (see the header). */
export const THROWABLE = Object.freeze(['car', 'slab', 'towerTop', 'floatSlab']);

/** The light of each phase / scene (moon, ambient, fog): eased by the ambience. */
export const VEIL_LIGHT = Object.freeze({
  1: Object.freeze({ moon: [0.2, 0.23, 0.3], ambient: [0.03, 0.034, 0.045], fog: [0.004, 0.005, 0.008], near: 28, far: 64 }),
  2: Object.freeze({ moon: [0.18, 0.26, 0.42], ambient: [0.028, 0.04, 0.07], fog: [0.004, 0.007, 0.014], near: 28, far: 64 }),
  3: Object.freeze({ moon: [0.06, 0.06, 0.09], ambient: [0.008, 0.008, 0.012], fog: [0, 0, 0.002], near: 8, far: 26 }),
});

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);

function box(w, h, d, x, y0, z, ry = 0) {
  const g = prep(new THREE.BoxGeometry(w, h, d));
  g.translate(0, h / 2, 0);
  if (ry) g.rotateY(ry);
  g.translate(x, y0, z);
  return g;
}
const edge = (px, py, pz, nx, ny) => (ny > 0.5 && ny < 0.95 ? 1 : 0);
const carved = (g, col) => carve(g, { col, ao: (px, py) => 0.6 + 0.4 * Math.min(1, py / 3), edge });

const CONCRETE = [0.13, 0.13, 0.14], METAL = [0.11, 0.12, 0.14], ASPHALT = [0.06, 0.06, 0.065];

/** The set (built on a quiet Math.random: three names every object with a random uuid). */
export function createVeiledCrossing(U, colliders) {
  const r = Math.random;
  let s = 0x3e1f9a27;
  Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  try {
    return build(U, colliders);
  } finally {
    Math.random = r;
  }
}

function build(U, colliders) {
  const C = CROSSING;
  const rng = mulberry32(CONFIG.seed + 209);
  const br = mulberry32(CONFIG.seed + 5209);
  const group = new THREE.Group();
  group.name = 'veiledCrossing';
  const slabGeos = [], propGeos = [], slabs = [], floor = [], breakables = [], bare = [];

  // ---- the floor: cracked asphalt slabs (the dragon print through breakableFloor)
  const tarCol = (px, py, pz) => mul(ASPHALT, 0.7 + 0.5 * fbm2(px * 0.9, pz * 0.9, 2));
  const n = Math.round((2 * C.half) / C.cell);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -C.half + (i + 0.5) * C.cell, z = -C.half + (j + 0.5) * C.cell, w = C.cell - 0.06;
      const pts = [[x - w / 2, z - w / 2], [x + w / 2, z - w / 2], [x + w / 2, z + w / 2], [x - w / 2, z + w / 2]];
      const g = slabGeometry(pts, { top: 0.03, inset: 0.05, drop: 0.02 });
      carve(g, { col: tarCol, ao: 1, edge });
      slabGeos.push(g);
      slabs.push({ x, z, r: w * 0.7, outline: pts });
      floor.push({ geo: g, outline: pts, x, z, r: w * 0.55, col: tarCol, kind: 'asphalt' });
    }
  }

  // ---- the bonfire in the south (it stays whole, as in every level)
  const bf = C.bonfire;
  propGeos.push(...buildBonfire(rng, bf.x, bf.z));
  colliders.add(bf.x, bf.z, 0.75, 'bonfire');
  bare.push({ x: bf.x, z: bf.z, r: 2.4 });

  const piece = (def) => {
    breakables.push(def);
    return def;
  };

  // ---- two tower stumps (two-stage: the base holds its top), north-west and north-east
  for (const sx of [-1, 1]) {
    const x = sx * 10, z = -11, w = 4, H0 = 4, H1 = 3;
    const base = [carved(box(w, H0, w, x, 0, z), CONCRETE)];
    const topGeos = [carved(box(w * 0.9, H1, w * 0.9, x, H0, z), mul(CONCRETE, 1.1))];
    const top = piece({ kind: 'towerTop', scene: 'crossing', mat: 'stone', look: 'prop', x, z, r: w * 0.5, y0: H0, h: H1 + 0.2, geos: topGeos, colliders: [], hp: 3, weight: 2.2, topples: true, cover: false, lift: 2, fallOff: 1.2, fallT: 0.9, wreck: true });
    piece({
      kind: 'towerBase', scene: 'crossing', mat: 'stone', look: 'prop', x, z, r: w * 0.6, h: H0, geos: base, colliders: [colliders.add(x, z, w * 0.6, 'stone')],
      hp: 6, weight: 3, topples: false, cover: true, lift: 0, holds: top, broken: { geos: buildRubble(br, x, z, w * 0.5, { col: CONCRETE, h: 0.8 }), r: w * 0.5 }, wreck: false,
    });
  }
  // ---- a dozen loose pieces round the middle: wrecked cars, slabs, rubble walls
  const ring = [[-6, 2, 'car'], [6.5, -1, 'car'], [-3, -8, 'car'], [8, 7, 'car'], [-8.5, 7.5, 'slab'], [3, 9, 'slab'], [-10, -3, 'slab'], [10.5, -6, 'slab'], [0, -13, 'wall'], [-13, 1, 'wall'], [13, 2, 'wall'], [4, -6, 'slab']];
  for (const [x, z, kind] of ring) {
    const ry = range(rng, 0, Math.PI);
    if (kind === 'car') {
      const g = [carved(box(1.9, 0.9, 4, x, 0, z, ry), METAL), carved(box(1.6, 0.6, 2.1, x, 0.9, z, ry), mul(METAL, 0.8))];
      piece({ kind: 'car', scene: 'crossing', mat: 'metal', look: 'prop', x, z, r: 1.6, h: 1.5, geos: g, colliders: [colliders.add(x, z, 1.35, 'stone')], hp: 2.4, weight: 1.4, topples: false, cover: true, lift: 1, broken: { geos: [carved(box(1.8, 0.5, 3.8, x, 0, z, ry), mul(METAL, 0.5))], r: 1.3 }, wreck: false });
    } else if (kind === 'slab') {
      const g = [carved(box(2.2, 0.5, 1.6, x, 0, z, ry), CONCRETE)];
      piece({ kind: 'slab', scene: 'crossing', mat: 'stone', look: 'prop', x, z, r: 1.2, h: 0.5, geos: g, colliders: [colliders.add(x, z, 1.0, 'stone')], hp: 1.6, weight: 1.2, topples: false, cover: false, lift: 1, wreck: false });
    } else {
      const g = [carved(box(3.6, 2.2, 0.6, x, 0, z, ry), mul(CONCRETE, 0.9))];
      piece({ kind: 'wall', scene: 'crossing', mat: 'stone', look: 'prop', x, z, r: 1.8, h: 2.2, geos: g, colliders: [colliders.add(x, z, 1.1, 'stone')], hp: 2.2, topples: true, cover: true, lift: 0, broken: { geos: buildRubble(br, x, z, 1.2, { col: CONCRETE, h: 0.5 }), r: 0.9 }, wreck: true });
    }
  }
  // ---- the void's pieces: two slabs of the crossing floating (raised: y0), out of the world until then
  for (const [x, z, y0] of [[-5, -4, 1.6], [6, 4, 2.2]]) {
    const g = [carved(box(2.0, 0.45, 1.5, x, y0, z, range(rng, 0, Math.PI)), mul(CONCRETE, 0.8))];
    piece({ kind: 'floatSlab', scene: 'void', mat: 'stone', look: 'prop', x, z, r: 1.1, y0, h: 0.6, geos: g, colliders: [], hp: 1.4, weight: 1.1, topples: true, cover: false, lift: 1, fallOff: 0.6, fallT: 0.7, wreck: false });
  }

  // ---- meshes
  const stoneMat = createPropArtMaterial(U, { fadeNearPlayer: true });
  const meshes = [];
  const add = (geos, m, name) => {
    if (!geos.length) return null;
    const o = new THREE.Mesh(mergeGeometries(geos), m);
    o.name = name;
    meshes.push(o);
    return o;
  };
  add(propGeos, stoneMat, 'props');
  const slabMat = createCarvedGlyphMaterial(U, { ...SLAB_LOOK, gain: 1.1, lumScale: 1.6, edge: 0.2, inkFloor: 0.02, viewPitch: CONFIG.camera.pitch, dp: { k: 0.6, sat: 0.7, top: 0.04, rimW: 0 } });
  const slabMesh = add(slabGeos, slabMat, 'asphalt');
  group.add(...meshes);
  markCaster(group);
  breakables.push(...breakableFloor({ slabs: floor, slabGeos, slabMesh, mat: slabMat, rng: mulberry32(CONFIG.seed + 7209), group, earth: [0.05, 0.05, 0.055] }).defs);
  addSlabRims(group, slabMat);

  const light = makeLight(U);
  const scenes = makeScenes(light);
  const S = CONFIG.world.dragonSleep ?? C.wait, L1 = VEIL_LIGHT[1];
  return {
    group, treeSpots: [], bare, slabs, nest: { x: S.x, z: S.z }, bonfire: { x: bf.x, z: bf.z },
    material: stoneMat, stoneMaterial: stoneMat, slabMaterial: slabMat,
    breakables, scenes,
    scarInk: [0.01, 0.01, 0.014],
    floorCarry: ASPHALT,
    sky: { moonColor: [...L1.moon], ambient: [...L1.ambient], fogColor: [...L1.fog], fogNear: L1.near, fogFar: L1.far },
    grass: { density: () => 0 },
    ambience: {
      setup(g) {
        scenes.bind(g);
        light.bind(g);
      },
      update(dt) {
        scenes.update(dt);
        light.update(dt);
      },
    },
    /** The light by his phase (1 cold and dim, 2 his eyes' blue, 3 the void). */
    setPhase: (n) => light.setPhase(n),
    CROSSING,
  };
}

// ---------------------------------------------------------------- the light (eased toward the phase's)
function makeLight(U) {
  const now = { moon: [...VEIL_LIGHT[1].moon], ambient: [...VEIL_LIGHT[1].ambient], fog: [...VEIL_LIGHT[1].fog], near: VEIL_LIGHT[1].near, far: VEIL_LIGHT[1].far };
  const st = { phase: 1, dirty: true };
  const write = () => {
    if (!U?.uMoonColor?.value) return;
    U.uMoonColor.value.setRGB(now.moon[0], now.moon[1], now.moon[2]);
    U.uAmbient?.value?.setRGB(now.ambient[0], now.ambient[1], now.ambient[2]);
    U.uFogColor?.value?.setRGB(now.fog[0], now.fog[1], now.fog[2]);
    if (U.uFogNear) U.uFogNear.value = now.near;
    if (U.uFogFar) U.uFogFar.value = now.far;
  };
  return {
    st,
    bind() {},
    setPhase(n) {
      const k = Math.min(3, Math.max(1, Math.round(fin(Number(n), 1))));
      st.phase = k;
      st.dirty = true;
      return k;
    },
    update(dt) {
      if (!st.dirty) return;
      const T = VEIL_LIGHT[st.phase], a = 1 - Math.exp(-Math.max(0, fin(dt)) * 3);
      let left = 0;
      for (const key of ['moon', 'ambient', 'fog']) {
        for (let i = 0; i < 3; i++) {
          now[key][i] += (T[key][i] - now[key][i]) * a;
          left = Math.max(left, Math.abs(T[key][i] - now[key][i]));
        }
      }
      now.near += (T.near - now.near) * a;
      now.far += (T.far - now.far) * a;
      left = Math.max(left, Math.abs(T.near - now.near) * 0.01, Math.abs(T.far - now.far) * 0.01);
      write();
      if (left < 1e-4) st.dirty = false;
    },
  };
}

// ---------------------------------------------------------------- the scenes (the stand-in: an instant swap)
function makeScenes(light) {
  let game = null;
  const home = SCENES[0];
  const S = {
    ids: SCENES,
    now: home,
    k: 1,
    morphing: false,
    bind(g) {
      game = g;
    },
    _des() {
      return game?.world?.destructibles ?? null;
    },
    /** Swap to scene `id` (the stand-in: at once, no front). False: already there / unknown. */
    to(id, o = null) {
      if (!SCENES.includes(id) || id === this.now) return false;
      this._swap(id);
      game?.events?.emit?.('world:scene', { id, x: fin(o?.x), z: fin(o?.z) });
      return true;
    },
    snap(id) {
      if (!SCENES.includes(id)) return false;
      this._swap(id);
      return true;
    },
    /** the home scene's pieces that were broken when it was left: they stay gone on the way back (the
     *  destructibles can only bring a piece back whole: present) */
    _left: new Set(),
    _swap(id) {
      const from = this.now;
      this.now = id;
      const D = this._des();
      if (D?.list) {
        D.sceneNow = id;
        if (from === home) {
          this._left.clear();
          for (const b of D.list) if (b.scene === home && !b.absent && (b.state !== 0 || b.hp < b.hpMax)) this._left.add(b);
        }
        for (const b of D.list) {
          if (b.scene === null || b.scene === undefined) continue;
          const want = b.scene === id && !(id === home && this._left.has(b));
          if (want === !b.absent) continue;
          D.present(b, want);
        }
      }
      if (id === 'void') light.setPhase(3);
    },
    reset() {
      // (world.restore has put the pieces back as the destructibles' reset leaves them: the home scene's)
      this._left.clear();
      this.now = home;
      const D = this._des();
      if (D) D.sceneNow = home;
    },
    update(dt) {
      void dt;
    },
    hold() {},
    stutter() {},
  };
  return S;
}
