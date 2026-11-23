import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createCarvedGlyphMaterial, createPropArtMaterial, createAsciiObjectMaterial } from '../render/materials.js';
import { markCaster } from '../render/pipeline.js';
import { mulberry32, range, fbm2 } from '../core/rng.js';
import { CONFIG } from '../core/config.js';
import { carve, slabGeometry, mul, STONE, SLAB_LOOK, buildBonfire, buildRubble, geosHeight, buildFlagstone } from './forest.js';
import { frustum } from './landmarks.js';
import { breakableFloor } from './floor.js';

// The Hall of Falling Script (levels/scripthall.js; ADR-157): one arena that holds THREE SCENES on the
// same ten slots, built once at load. Only one scene stands at a time; a morph swaps them piece by
// piece behind a front that runs out from where he stands (the boss's transitions call it).
//   hall    the Pillared Hall: ten square stone pillars (arrival, the intro, phase 2, after his death)
//   dojo    the Sparring Hall: ten wooden posts (phase 1)
//   source  the Source: the ten slots as columns of code (phase 3)
//
// THE SCENES CONTRACT (the set's output `scenes`; the boss and the Lab call it, world.restore resets it):
//   scenes.ids             ['hall', 'dojo', 'source'] (the first is the home scene: the reset's)
//   scenes.now             the scene shown (the morph's target as soon as it starts)
//   scenes.k               0..1 how far the running morph is (1: none running)
//   scenes.to(id, { x, z, speed })   morph to scene `id`: a front runs out from (x, z) at `speed` m/s
//                          (HALL.morph.speed), each piece it crosses lets go and the new scene's piece at
//                          its place prints in, whole; lasts at most HALL.morph.max s. False: already there
//   scenes.snap(id)        straight to scene `id` (no front)
//   scenes.reset()         the home scene, no morph running, the light and the script at rest
//   scenes.update(dt)      (the set's ambience calls it)
//   scenes.hold(sec)       the falling script holds still (the intro's stir, the fall)
//   scenes.stutter(sec)    deja vu: every prop's letters shift a cell sideways and back, the script pulses
//   scenes.script(k, sec)  the script wave's strength eased to k (sec: back to the scene's own after)
// A piece of a scene is a breakable with `scene: '<id>'` (destructibles.js present / sceneNow); a piece
// without one is in every scene (the floor, the steps, the path).
//
// THIS FILE IS THE LEAD'S FIRST CUT (a working stub the fight is built against): plain prop boxes on the
// slots, an instant swap. The set agent replaces the look, the morph's front, the watchers, the walls,
// the falling script (the ambience) and the light, keeping the contract above.

/** Layout numbers (world metres): the level's CONFIG.world overrides match these (levels/scripthall.js). */
export const HALL = Object.freeze({
  half: 16, // the floor: 32 x 32 m on the origin
  cell: 2, // floor slab pitch
  slotX: 7.5, // the two rows of uprights: x = ±slotX
  slotZ: Object.freeze([-10, -5, 0, 5, 10]),
  watcherX: 13.5,
  steps: Object.freeze([16.6, 17.4, 18.2]), // three steps down to the path (z)
  stepHalf: 3,
  pathFrom: 19,
  pathTo: 31,
  bonfire: Object.freeze({ x: 0, z: 33 }),
  wait: Object.freeze({ x: 0, z: -9, yaw: Math.PI }), // his back to the path
  entryZ: 16,
  // the morph: a front at `speed` m/s, the whole of it at most `max` s
  morph: Object.freeze({ speed: 18, max: 1.8 }),
  // the script wave's resting strength per scene (?script=a: the shimmer and the full turn)
  script: Object.freeze({ hall: 0.2, dojo: 0.2, source: 1 }),
});
export const SCENES = Object.freeze(['hall', 'dojo', 'source']);
/** The ten slots of the uprights. */
export const SLOTS = Object.freeze(HALL.slotZ.flatMap((z) => [{ x: -HALL.slotX, z }, { x: HALL.slotX, z }]));

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const PALE = [0.3, 0.31, 0.3];
const WOOD = [0.13, 0.09, 0.06];
const CODE = [0.05, 0.22, 0.1];
const pavingCol = (px, py, pz) => mul(PALE, (0.55 + 0.35 * fbm2(px * 1.3, pz * 1.3, 2)));
const PAVING_LOOK = { gain: 1.4, lumScale: 2.0, edge: 0.3 };

/** An upright on a slot: a square stone pillar, a wooden post or a column of code (prop art). */
function upright(kind, x, z) {
  const h = kind === 'post' ? 2.6 : 4.0, w = kind === 'post' ? 0.2 : kind === 'pillar' ? 0.5 : 0.45;
  const col = kind === 'post' ? WOOD : kind === 'pillar' ? PALE : CODE;
  const g = frustum(0, h, w, w, w * 0.92, w * 0.92, 4, Math.PI / 4);
  g.translate(x, 0, z);
  carve(g, {
    col: (px, py) => mul(col, 0.75 + 0.35 * Math.abs(Math.sin(py * 3.1 + px * 1.7))),
    ao: (px, py) => 0.55 + 0.45 * Math.min(1, py / 1.5),
    edge: (px, py, pz, nx, ny) => (Math.abs(ny) > 0.5 ? 1 : 0.3),
  });
  return { g, h, r: w * 1.05 };
}

/**
 * The set. Built on a quiet Math.random (three names every object with a random uuid; the seeded sims
 * replay Math.random: foxTerrace.js's note).
 */
export function createScriptHall(U, colliders) {
  const r = Math.random;
  let s = 0x5c41b7a3;
  Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  try {
    return buildHall(U, colliders);
  } finally {
    Math.random = r;
  }
}

function buildHall(U, colliders) {
  const H = HALL;
  const rng = mulberry32(CONFIG.seed + 157);
  const br = mulberry32(CONFIG.seed + 5157);
  const group = new THREE.Group();
  group.name = 'scriptHall';
  const slabGeos = [], propGeos = [], slabs = [], floor = [], breakables = [], bare = [];
  const addSlab = (geo, x, z, rr, outline) => {
    slabGeos.push(geo);
    slabs.push({ x, z, r: rr, outline });
    floor.push({ geo, outline, x, z, r: rr * 0.8, col: pavingCol });
  };
  // ---- the floor: square slabs
  const n = Math.round((2 * H.half) / H.cell);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -H.half + (i + 0.5) * H.cell, z = -H.half + (j + 0.5) * H.cell, w = H.cell - 0.08;
      const pts = [[x - w / 2, z - w / 2], [x + w / 2, z - w / 2], [x + w / 2, z + w / 2], [x - w / 2, z + w / 2]];
      const g = slabGeometry(pts, { top: 0.04, inset: 0.05, drop: 0.03 });
      carve(g, { col: pavingCol, ao: 1, edge: (px, py, pz, nx, ny) => (ny > 0.5 && ny < 0.95 ? 1 : 0) });
      addSlab(g, x, z, w * 0.7, pts);
    }
  }
  // ---- the steps down to the path, the path to the bonfire
  for (const z of H.steps) {
    const pts = [[-H.stepHalf, z - 0.38], [H.stepHalf, z - 0.38], [H.stepHalf, z + 0.38], [-H.stepHalf, z + 0.38]];
    const g = slabGeometry(pts, { top: 0.06, inset: 0.05, drop: 0.04 });
    carve(g, { col: pavingCol, ao: 1, edge: (px, py, pz, nx, ny) => (ny > 0.5 && ny < 0.95 ? 1 : 0) });
    addSlab(g, 0, z, 1.2, pts);
  }
  for (let z = H.pathFrom; z < H.pathTo; z += range(rng, 0.9, 1.3)) {
    const x = range(rng, -0.6, 0.6), w = range(rng, 0.9, 1.5), d = range(rng, 0.7, 1.2);
    const st = buildFlagstone(rng, x, z, w, d, rng() * 6.283);
    slabGeos.push(st.geo);
    slabs.push({ x, z, r: Math.max(w, d) * 0.65, outline: st.outline });
    floor.push({ geo: st.geo, outline: st.outline, x, z, r: Math.max(w, d) * 0.5, col: pavingCol });
  }
  // ---- the bonfire (the one piece left whole)
  const bf = H.bonfire;
  propGeos.push(...buildBonfire(rng, bf.x, bf.z));
  colliders.add(bf.x, bf.z, 0.75, 'bonfire');
  bare.push({ x: bf.x, z: bf.z, r: 2.4 });

  // ---- the uprights of the three scenes on the same ten slots (each scene's own pieces)
  const KINDS = { hall: 'pillar', dojo: 'post', source: 'codePillar' };
  for (const sc of SCENES) {
    for (const p of SLOTS) {
      const kind = KINDS[sc], u = upright(kind, p.x, p.z);
      const wood = kind === 'post';
      breakables.push({
        kind, scene: sc, mat: wood ? 'wood' : 'stone', look: 'prop', x: p.x, z: p.z, r: u.r, h: u.h, geos: [u.g],
        colliders: [colliders.add(p.x, p.z, u.r, wood ? 'trunk' : 'stone')],
        broken: wood ? null : { geos: buildRubble(br, p.x, p.z, u.r * 0.9, { col: kind === 'pillar' ? PALE : CODE, h: range(br, 0.4, 0.7) }), r: u.r * 0.7 },
        hp: wood ? 1.6 : 3.2, topples: true, lift: 1, cover: true,
      });
    }
  }

  const mat = createAsciiObjectMaterial(U, { fadeNearPlayer: true, side: THREE.DoubleSide });
  const meshes = [];
  const mesh = (geos, m, name) => {
    if (!geos.length) return null;
    const o = new THREE.Mesh(mergeGeometries(geos), m);
    o.name = name;
    meshes.push(o);
    return o;
  };
  mesh(propGeos, mat, 'props');
  const stoneMat = createPropArtMaterial(U, { fadeNearPlayer: true });
  const slabMat = createCarvedGlyphMaterial(U, { ...SLAB_LOOK, ...PAVING_LOOK, viewPitch: CONFIG.camera.pitch });
  const slabMesh = mesh(slabGeos, slabMat, 'paving');
  group.add(...meshes);
  markCaster(group);
  breakables.push(...breakableFloor({ slabs: floor, slabGeos, slabMesh, mat: slabMat, rng: mulberry32(CONFIG.seed + 7157), group }).defs);

  const scenes = makeScenes(U);
  return {
    group, treeSpots: [], bare, slabs, nest: { x: H.wait.x, z: H.wait.z }, bonfire: { x: bf.x, z: bf.z },
    material: mat, stoneMaterial: stoneMat, slabMaterial: slabMat,
    breakables, scenes,
    ambience: makeAmbience(scenes),
    scarInk: [0.012, 0.014, 0.012],
    grass: { density: (x, z) => (Math.abs(x) < H.half + 0.5 && z < H.half + 3 && z > -H.half - 0.5 ? 0 : 0.5) },
  };
}

/** The scenes object (see the contract at the top). The stub swaps at once; the morph's front, the
 *  light and the script wave's easing are the set agent's. */
function makeScenes(U) {
  let game = null;
  const S = {
    ids: SCENES,
    now: SCENES[0],
    k: 1,
    holdT: 0,
    stutterT: 0,
    scriptK: HALL.script.hall,
    _scriptT: 0,
    bind(g) {
      game = g;
    },
    _des() {
      return game?.world?.destructibles ?? null;
    },
    _apply(id) {
      const D = this._des();
      if (!D) return;
      D.sceneNow = id;
      for (const b of D.list) if (b.scene !== null) D.present(b, b.scene === id);
    },
    to(id, o = null) {
      if (!SCENES.includes(id) || id === this.now) return false;
      this.now = id;
      this.k = 1;
      this._apply(id);
      game?.events?.emit?.('world:scene', { id, x: fin(o?.x), z: fin(o?.z) });
      return true;
    },
    snap(id) {
      if (!SCENES.includes(id)) return false;
      this.now = id;
      this.k = 1;
      this._apply(id);
      return true;
    },
    reset() {
      this.now = SCENES[0];
      this.k = 1;
      this.holdT = 0;
      this.stutterT = 0;
      this._scriptT = 0;
      if (U?.uScript) U.uScript.value.set(0, 0, 0, 0);
      if (U?.uScriptF) U.uScriptF.value.set(2, 0, 0, 0);
    },
    hold(sec) {
      this.holdT = Math.max(this.holdT, fin(sec));
    },
    stutter(sec = 0.12) {
      this.stutterT = Math.max(this.stutterT, fin(sec));
    },
    script(k, sec = 0) {
      this.scriptK = fin(k);
      this._scriptT = fin(sec);
    },
    update(dt) {
      if (this.holdT > 0) this.holdT -= dt;
      if (this.stutterT > 0) this.stutterT -= dt;
      if (this._scriptT > 0) {
        this._scriptT -= dt;
        if (this._scriptT <= 0) this.scriptK = HALL.script[this.now] ?? 0;
      } else this.scriptK = HALL.script[this.now] ?? 0;
      if (U?.uScript) U.uScript.value.x = this.scriptK;
    },
  };
  return S;
}

/** The set's ambience (atmosphere.js runs it in place of the fireflies): the scenes' clock. */
function makeAmbience(scenes) {
  return {
    setup(game) {
      scenes.bind(game);
    },
    update(dt) {
      scenes.update(dt);
    },
    hold(sec) {
      scenes.hold(sec);
    },
    flare() {},
  };
}
