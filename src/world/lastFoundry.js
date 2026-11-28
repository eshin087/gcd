import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createDragonObjectMaterial, createCarvedGlyphMaterial, createPropArtMaterial } from '../render/materials.js';
import { markCaster } from '../render/pipeline.js';
import { mulberry32, range, fbm2 } from '../core/rng.js';
import { CONFIG } from '../core/config.js';
import { prep, lumpy, carve, slabGeometry, mul, SLAB_LOOK, buildFlagstone, buildBonfire, buildRubble, geosHeight } from './forest.js';
import { facetCol } from './landmarks.js';
import { breakableFloor } from './floor.js';
import { addSlabRims } from '../render/dragonFloor.js';

// THE LAST FOUNDRY (`?level=foundry`): a steel mill at the end of a war with the machines, at night, still
// running with no one left to feed it. WAVE 0: A STAND-IN SET (core's): the real exports, the real layout
// (FOUNDRY) and the real hazard surface (`foundry`, working in logic); simple prop-art boxes where the big
// pieces go. The world agent replaces the whole file and keeps FOUNDRY's fields and the `foundry` surface.
//
// The casting floor: a square of riveted steel plates 30 m across on the origin (FOUNDRY.half 15, cell
// 1.5: every plate a breakable floor piece, world/floor.js). The pour north of it (an open channel of
// molten steel, kerbed: colliders; nobody walks in it), the boss kneeling at its edge (FOUNDRY.wait). Four
// ladles hung near the floor's edge, the press east-north-east, the line west (unfinished frames on it),
// gas tanks, I-beam columns; the blast furnace beyond the pour. The bonfire at (0, 33) down a path of plates.
// LEFT WHOLE ON PURPOSE (not in `breakables`, or `hp: Infinity`): the bonfire; the blast furnace's body
// (it chips: hp Infinity); the pour's kerb.
//
// THE HAZARD SURFACE (returned as `foundry`; game.world.forest.foundry; the boss's terrain handler deals the
// pools' damage, this file draws them and ignites the world round them):
//   ladles                 the four: { x, z, h, def (its breakable def), piece (the live piece, once
//                          seen), full } (`full` false once it has spilled)
//   ladleNear(x, z, r)     the nearest FULL ladle within r m of (x, z), or null
//   drop(ladle, why)       cut its chain: the piece breaks, it falls and spills (a pool under it); false
//                          when it was not full
//   molten.add(x, z, { r, life, why })  → a pool record { x, z, r, t, life, why, id, alive } (a fixed pool of
//                          FOUNDRY_TUNING.molten.max: the oldest is reused when all are live)
//   molten.pools           the fixed array of records (read `alive`)
//   molten.at(x, z)        the live pool covering (x, z), or null
//   reset()                the fight's reset: every ladle full and hung, no pool (the boss's reset calls it)
// A ladle whose piece breaks by any blow spills by itself (the set's update sees it).

const HALF = 15;
const CELL = 1.5;

/** The foundry's layout (levels/foundry.js and the boss read it). */
export const FOUNDRY = Object.freeze({
  half: HALF, // the casting floor is |x|, |z| <= half
  cell: CELL,
  entryZ: HALF + 0.4, // where the hero steps onto the floor (its south edge)
  bonfire: Object.freeze({ x: 0, z: 33 }),
  floor: Object.freeze({ r: 13.8 }), // the circle the boss keeps to
  wait: Object.freeze({ x: 0, z: -11, yaw: Math.PI }), // he kneels at the pour's edge, facing north (his back to the arrival)
  bound: 40, // the hero's bound round the origin
  ladles: Object.freeze([[-12.5, -6.5], [12.5, -6.5], [-12.5, 5.5], [12.5, 5.5]].map(([x, z]) => Object.freeze({ x, z, h: 3 }))),
  pour: Object.freeze({ x0: -12, x1: 12, z0: -21, z1: -17 }),
  press: Object.freeze({ x: 20.5, z: -9 }),
  line: Object.freeze({ x: -19.5, z0: -12, z1: 10 }),
  tanks: Object.freeze([Object.freeze({ x: 17.5, z: 9.5 }), Object.freeze({ x: -16.8, z: 13.5 }), Object.freeze({ x: 17.8, z: -15.5 })]),
  columns: Object.freeze([[-16.6, -16.4], [16.6, -16.4], [-16.6, -2.5], [16.6, -1.5], [-16.6, 7.5], [16.6, 15.6]].map(([x, z]) => Object.freeze({ x, z }))),
  furnace: Object.freeze({ x: 0, z: -28 }),
});

/** What the pieces are worth (POWER: 1 fells a tree) and the pools' numbers (content is data). */
export const FOUNDRY_TUNING = Object.freeze({
  ladle: 1.4, press: 6, frame: 0.8, conveyor: 3, tank: 1.0, column: 3.2,
  molten: Object.freeze({ max: 8, r: 2.2, life: 14, spill: Object.freeze({ r: 2.6, life: 16 }), ignite: 1, glow: 10 }),
});

// ---------------------------------------------------------------- palette (linear albedo)
const PLATE = [0.12, 0.12, 0.13];
const STEEL = [0.11, 0.11, 0.12];
const RUST = [0.16, 0.09, 0.05];
const BRICK = [0.14, 0.07, 0.05];
const EARTH = [0.3, 0.2, 0.14];
const plateCol = (c, f = 1.4) => (px, py, pz) => mul(c, (0.7 + 0.3 * fbm2(px * f, pz * f, 2)) * (0.85 + 0.2 * fbm2(px * 0.1 + 3, pz * 0.1 - 5, 2)));
const edgeBand = (px, py, pz, nx, ny) => (ny > 0.5 && ny < 0.95 ? 1 : 0);
const PAVING_LOOK = { gain: 0.74, lumScale: 1.5, edge: 0.18, inkFloor: 0.02, base: 0.05, crackAmount: 0.06, strokeLevels: [9, 9], topGlyphs: ['    ', '.   ', '. . ', '.:. ', ':.:.', ';:.:'], dp: { k: 0.85, sat: 0.6, tint: [1, 1, 1], top: 0.08 } };

/** A box carved at (x, y, z) (its foot at y), w x h x d, turned by yaw. */
function box(rng, x, y, z, w, h, d, { yaw = 0, col = STEEL, k = 1.2, lump = 0.02 } = {}) {
  const g = prep(new THREE.BoxGeometry(w, h, d, 1, 1, 1));
  g.translate(0, h / 2, 0);
  if (lump) lumpy(g, lump, 2.2, rng() * 99, new THREE.Vector3(0, h / 2, 0));
  g.rotateY(yaw);
  g.translate(x, y, z);
  carve(g, { col: facetCol(col, k), ao: (px, py) => 0.55 + 0.45 * Math.min(1, (py - y) / Math.max(0.4, h)), edge: edgeBand });
  return g;
}

/** A plate of the floor at (x, z), w x d, its corners jittered a little. */
function plate(rng, x, z, w, d, col) {
  const j = 0.02;
  const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([a, b]) => [a + range(rng, -j, j), b + range(rng, -j, j)]);
  const g = slabGeometry(pts, { top: 0.035, inset: 0.05, drop: 0.03, bottom: -0.2 });
  g.translate(x, 0, z);
  carve(g, { col, ao: 0.85, moss: 0, edge: edgeBand });
  let r = 0;
  for (const [px, pz] of pts) r = Math.max(r, Math.hypot(px, pz));
  return { geo: g, outline: pts.map(([px, pz]) => [x + px, z + pz]), r };
}

export function createLastFoundry(U, colliders) {
  const T = FOUNDRY_TUNING;
  // streams: the floor's layout; the props; the rubble; the floor's remains (world/floor.js)
  const rng = mulberry32(CONFIG.seed + 7101), pr = mulberry32(CONFIG.seed + 7102), br = mulberry32(CONFIG.seed + 7103), fr = mulberry32(CONFIG.seed + 7104);
  const group = new THREE.Group();
  group.name = 'lastFoundry';
  const stoneGeos = [], slabGeos = [], propGeos = [];
  const slabs = [], bare = [];
  const floor = [];
  const breakables = [];

  const addSlab = (s, x, z, col, kind, walk = true) => {
    slabGeos.push(s.geo);
    slabs.push({ x, z, r: s.r, outline: s.outline });
    if (walk) floor.push({ geo: s.geo, outline: s.outline, x, z, r: s.r * 0.87, col, kind });
  };
  /** A standing piece (prop art), its rubble on its own stream. */
  const piece = (kind, x, z, r, geos, extra = {}) => {
    const { stub = true, cr = r, mat = 'metal', ...rest } = extra;
    const cs = cr > 0 ? [colliders.add(x, z, cr, 'stone')] : [];
    const rr = Math.max(0.3, r);
    const def = {
      kind, mat, look: 'prop', x, z, r: rr, h: geosHeight(geos), geos, colliders: cs,
      ...(stub ? { broken: { geos: buildRubble(br, x, z, rr * 0.8, { col: mul(RUST, 1.3), h: range(br, 0.25, 0.45) }), r: cr > 0 ? rr * 0.6 : 0 } } : {}),
      lift: 0, ...rest,
    };
    breakables.push(def);
    return def;
  };

  // ---- the casting floor: 20 x 20 riveted plates
  const pc = plateCol(PLATE);
  const n = Math.round((2 * HALF) / CELL);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -HALF + (i + 0.5) * CELL, z = -HALF + (j + 0.5) * CELL;
      addSlab(plate(rng, x, z, CELL - 0.07, CELL - 0.07, pc), x, z, pc, 'plate');
    }
  }
  // ---- the way in: plates down to the bonfire
  const BF = FOUNDRY.bonfire;
  for (let z = HALF + 1.0; z < BF.z - 1.6; z += range(rng, 0.95, 1.3)) {
    const x = range(rng, -0.5, 0.5), w = range(rng, 0.9, 1.4), d = range(rng, 0.7, 1.1);
    const s = buildFlagstone(rng, x, z, w, d, rng() * Math.PI * 2);
    addSlab({ geo: s.geo, outline: s.outline, r: Math.max(w, d) * 0.6 }, x, z, (px, py, pz) => mul(STEEL, 0.7 + 0.3 * fbm2(px * 2, pz * 2, 2)), 'flagstone');
  }
  propGeos.push(...buildBonfire(rng, BF.x, BF.z));
  colliders.add(BF.x, BF.z, 0.75, 'bonfire');
  bare.push({ x: BF.x, z: BF.z, r: 2.4 });

  // ---- the pour: an open channel of molten steel north of the floor, kerbed (scenery: left whole), colliders
  const P = FOUNDRY.pour;
  const pz = (P.z0 + P.z1) / 2, pw = P.x1 - P.x0, pd = P.z1 - P.z0;
  stoneGeos.push(box(pr, (P.x0 + P.x1) / 2, -0.3, P.z1 + 0.2, pw + 1, 0.55, 0.4, { col: BRICK }), box(pr, (P.x0 + P.x1) / 2, -0.3, P.z0 - 0.2, pw + 1, 0.55, 0.4, { col: BRICK }));
  for (let x = P.x0 + 0.8; x <= P.x1 - 0.8 + 1e-6; x += 1.6) colliders.add(x, pz, pd / 2, 'stone');

  // ---- the ladles: crucibles hung on chains at ~3 m (the stand-in: a box and its chain)
  const ladles = [];
  for (const L of FOUNDRY.ladles) {
    const geos = [box(pr, L.x, L.h - 0.6, L.z, 1.3, 1.0, 1.3, { col: RUST }), box(pr, L.x, L.h + 0.4, L.z, 0.08, 3.5, 0.08, { col: STEEL, lump: 0 })];
    const def = piece('ladle', L.x, L.z, 0.8, geos, { cr: 0, y0: L.h - 0.6, hp: T.ladle, topples: false, cover: false });
    ladles.push({ x: L.x, z: L.z, h: L.h, def, piece: undefined, full: true });
  }
  // ---- the press (east-north-east), the line (west: a conveyor bed, unfinished frames on it)
  {
    const { x, z } = FOUNDRY.press;
    piece('press', x, z, 2.2, [box(pr, x, 0, z, 3.6, 1.2, 3.6, { col: STEEL }), box(pr, x, 1.2, z, 1.4, 4.6, 1.4, { col: STEEL }), box(pr, x, 5.8, z, 3.8, 1.0, 3.0, { col: RUST })], { cr: 1.9, hp: T.press, topples: false, cover: true });
  }
  {
    const Ln = FOUNDRY.line;
    for (let z = Ln.z0; z < Ln.z1 - 1e-6; z += 3.6) {
      piece('conveyor', Ln.x, z + 1.8, 1.8, [box(pr, Ln.x, 0, z + 1.8, 1.6, 0.8, 3.5, { col: STEEL })], { cr: 0.8, hp: T.conveyor, topples: false, cover: true });
      piece('frame', Ln.x, z + 1.8, 0.45, [box(pr, Ln.x, 0.8, z + 1.8, 0.5, 1.4, 0.3, { col: PLATE, k: 1.5 })], { cr: 0, hp: T.frame, stub: false, lift: 1 });
    }
  }
  // ---- gas tanks, I-beam columns
  for (const { x, z } of FOUNDRY.tanks) piece('tank', x, z, 0.8, [box(pr, x, 0, z, 1.3, 2.2, 1.3, { col: RUST })], { cr: 0.75, hp: T.tank, topples: false, cover: true });
  for (const { x, z } of FOUNDRY.columns) piece('column', x, z, 0.4, [box(pr, x, 0, z, 0.5, 8, 0.5, { col: STEEL, lump: 0 })], { cr: 0.35, hp: T.column, cover: true });
  // ---- the blast furnace beyond the pour (left whole: it chips)
  {
    const { x, z } = FOUNDRY.furnace;
    piece('furnace', x, z, 4, [box(pr, x, 0, z, 7, 9, 6, { col: BRICK }), box(pr, x, 9, z, 4, 5, 4, { col: BRICK })], { cr: 3.6, hp: Infinity, topples: false, stub: false, cover: true, wreck: false });
  }

  // ---- meshes
  const mat = createDragonObjectMaterial(U, { fadeNearPlayer: true, side: THREE.DoubleSide });
  const stoneMat = createPropArtMaterial(U, { fadeNearPlayer: true, gain: 0.92 });
  const slabMat = createCarvedGlyphMaterial(U, { ...SLAB_LOOK, ...PAVING_LOOK, viewPitch: CONFIG.camera.pitch });
  const add = (geos, m, name) => {
    if (!geos.length) return null;
    const mesh = new THREE.Mesh(mergeGeometries(geos), m);
    mesh.name = name;
    group.add(mesh);
    return mesh;
  };
  add(propGeos, mat, 'props');
  add(stoneGeos, stoneMat, 'stones');
  const slabMesh = add(slabGeos, slabMat, 'paving');
  markCaster(group);
  breakables.push(...breakableFloor({ slabs: floor, slabGeos, slabMesh, mat: slabMat, rng: fr, group, earth: EARTH }).defs);
  addSlabRims(group, slabMat);

  const foundry = createHazards(ladles);
  return {
    group, treeSpots: [], bare, slabs, nest: { x: FOUNDRY.wait.x, z: FOUNDRY.wait.z }, bonfire: { x: BF.x, z: BF.z },
    material: mat, stoneMaterial: stoneMat, slabMaterial: slabMat,
    breakables,
    foundry,
    /** The light by his phase (the boss's transition calls it; the ambience also follows his phase). */
    setPhase(n) {
      return foundry._light.setPhase(n);
    },
    scarInk: [0.3, 0.16, 0.08],
    grass: { ash: 0.8, height: 0.35, density: (x, z) => (Math.abs(x) < HALF + 1 && Math.abs(z) < HALF + 1 ? 0 : 0.04) },
    floorCarry: mul(PLATE, 1.4),
    sky: { ...PALETTE[0], moonDir: PALETTE[0].dir, moonColor: PALETTE[0].moon },
    ambience: makeAmbience(foundry),
  };
}

// ---------------------------------------------------------------- the hazards (logic)
function createHazards(ladles) {
  const M = FOUNDRY_TUNING.molten;
  const pools = Array.from({ length: M.max }, () => ({ alive: false, x: 0, z: 0, r: 0, t: 0, life: 0, why: '', id: -1, acc: 0 }));
  let nextId = 0;
  const F = {
    ladles,
    _game: null,
    _light: { phase: 1, setPhase(n) { this.phase = Math.max(1, Math.min(4, Math.round(Number(n) || 1))); return this.phase; } },
    ladleNear(x, z, r = 4) {
      let best = null, bd = Infinity;
      for (const L of ladles) {
        if (!L.full) continue;
        const dd = Math.hypot(L.x - x, L.z - z);
        if (dd <= r && dd < bd) {
          bd = dd;
          best = L;
        }
      }
      return best;
    },
    drop(L, why = 'boss') {
      if (!L?.full) return false;
      const W = F._game?.world;
      // (its piece breaks: the blow at its height, more than it can take)
      W?.destructibles?.strike?.(L.x, L.z, 0.6, 99, { kind: 'blunt', by: why === 'hero' ? 'hero' : 'boss', y: L.h - 0.2, src: -1 });
      F._spill(L, why);
      return true;
    },
    _spill(L, why) {
      L.full = false;
      F.molten.add(L.x, L.z, { r: M.spill.r, life: M.spill.life, why: why || 'ladle' });
    },
    molten: {
      pools,
      add(x, z, o = {}) {
        if (!Number.isFinite(x + z)) return null;
        let P = pools.find((p) => !p.alive);
        if (!P) P = pools.reduce((a, b) => (b.id < a.id ? b : a));
        P.alive = true;
        P.x = x;
        P.z = z;
        P.r = Number.isFinite(o.r) && o.r > 0 ? o.r : M.r;
        P.life = Number.isFinite(o.life) && o.life > 0 ? o.life : M.life;
        P.t = 0;
        P.acc = 0;
        P.why = o.why ?? '';
        P.id = nextId++;
        F._game?.world?.ignite?.(x, z, P.r, M.ignite);
        return P;
      },
      at(x, z) {
        for (const p of pools) if (p.alive && Math.hypot(p.x - x, p.z - z) < p.r) return p;
        return null;
      },
    },
    reset() {
      for (const L of ladles) L.full = true;
      for (const p of pools) p.alive = false;
      F._light.phase = 1;
    },
    /** Every frame (the ambience's update): the pools age; a ladle whose piece broke spills. */
    update(dt, game) {
      F._game = game;
      for (const p of pools) if (p.alive && (p.t += dt) >= p.life) p.alive = false;
      const D = game?.world?.destructibles;
      if (!D?.list) return;
      for (const L of ladles) {
        if (L.piece === undefined) L.piece = D.list.find((o) => o.def === L.def) ?? null;
        if (L.full && L.piece && L.piece.state !== 0) F._spill(L, 'ladle');
      }
    },
  };
  return F;
}

// ---------------------------------------------------------------- the light (by his phase)
/** [P1 a quiet furnace glow, P2 colder, P3 red alarm, P4 the furnace roars] (the world agent's to tune). */
const PALETTE = [
  { moon: [0.9, 0.5, 0.3], dir: [-0.5, 0.6, -0.4], ambient: [0.09, 0.06, 0.05], fogColor: [0.03, 0.012, 0.008], fogNear: 30, fogFar: 62 },
  { moon: [0.55, 0.6, 0.75], dir: [-0.4, 0.7, -0.3], ambient: [0.06, 0.065, 0.08], fogColor: [0.012, 0.014, 0.02], fogNear: 30, fogFar: 60 },
  { moon: [1.0, 0.25, 0.18], dir: [-0.3, 0.7, -0.5], ambient: [0.1, 0.03, 0.03], fogColor: [0.035, 0.006, 0.005], fogNear: 28, fogFar: 58 },
  { moon: [1.3, 0.6, 0.25], dir: [0, 0.7, -0.7], ambient: [0.13, 0.07, 0.04], fogColor: [0.045, 0.016, 0.006], fogNear: 26, fogFar: 56 },
];
const blob = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.6, size: 0.6, sizeEnd: 0.2, heat: 0.45, heatEnd: 0, drag: 1.2, gravity: 0, kind: 'fire' };

/** The foundry's light and its molten glow (atmosphere.js runs it). Its own stream (never Math.random). */
function makeAmbience(F) {
  let seed = 0x5a17;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const st = { w: [1, 0, 0, 0], phase: 1, flash: 0, dim: 0, dimWant: 0, dimHold: 0, pourAcc: 0 };
  const cur = { moon: [0, 0, 0], dir: [0, 0, 0], ambient: [0, 0, 0], fogColor: [0, 0, 0], fogNear: 0, fogFar: 0 };
  const blend = () => {
    for (const k of ['moon', 'dir', 'ambient', 'fogColor']) for (let i = 0; i < 3; i++) cur[k][i] = PALETTE.reduce((s, P, j) => s + P[k][i] * st.w[j], 0);
    cur.fogNear = PALETTE.reduce((s, P, j) => s + P.fogNear * st.w[j], 0);
    cur.fogFar = PALETTE.reduce((s, P, j) => s + P.fogFar * st.w[j], 0);
  };
  const write = (U) => {
    if (!U?.uMoonColor?.value) return;
    const f = st.flash, d = 1 - 0.7 * st.dim;
    U.uMoonColor.value.setRGB(cur.moon[0] * d + 1.4 * f, cur.moon[1] * d + 0.8 * f, cur.moon[2] * d + 0.4 * f);
    U.uAmbient.value.setRGB(cur.ambient[0] * d + 0.15 * f, cur.ambient[1] * d + 0.08 * f, cur.ambient[2] * d + 0.04 * f);
    U.uFogColor?.value?.setRGB(cur.fogColor[0] * d, cur.fogColor[1] * d, cur.fogColor[2] * d);
    U.uMoonDir?.value?.set(cur.dir[0], cur.dir[1], cur.dir[2]).normalize();
    if (U.uFogNear) U.uFogNear.value = cur.fogNear;
    if (U.uFogFar) U.uFogFar.value = cur.fogFar;
  };
  return {
    /** the light now: { w: [p1..p4], flash, dim, phase } (the Lab, the tests) */
    get state() {
      return { w: st.w.slice(), flash: st.flash, dim: st.dim, phase: st.phase };
    },
    setup(game) {
      F._game = game;
      blend();
      write(game.U);
    },
    setVisible() {},
    /** A flash of the phase's light (k 0..1): a change, a great blow. */
    flare(k = 1) {
      const v = Math.min(1.5, Math.max(0, Number(k) || 0));
      if (v > st.flash) st.flash = v;
    },
    /** The light pulled down by k (0..1) while it is called each frame (it lets go 0.2 s after). */
    dim(k = 1) {
      const v = Number(k);
      st.dimWant = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
      st.dimHold = 0.2;
    },
    update(dt, game) {
      if (!(dt > 0)) return;
      try {
        F.update(dt, game);
      } catch (err) {
        console.error('[foundry] hazards', err);
      }
      const boss = game.dragon;
      const ph = Math.min(4, Math.max(1, Math.round(Number(boss?.phase) || F._light.phase || 1)));
      if (ph < st.phase) {
        st.w.fill(0);
        st.w[0] = 1;
        st.flash = 0;
        st.dim = st.dimWant = 0;
      }
      st.phase = ph;
      const k = 1 - Math.exp(-dt * 0.9);
      for (let i = 0; i < 4; i++) st.w[i] += ((i === ph - 1 ? 1 : 0) - st.w[i]) * k;
      if (st.dimHold > 0) st.dimHold -= dt;
      else st.dimWant = 0;
      st.dim += (st.dimWant - st.dim) * (1 - Math.exp(-dt * 4));
      st.flash = st.flash > 0.004 ? st.flash * Math.exp(-dt * 6) : 0;
      blend();
      write(game.U);
      // the molten glow: heat in the fire field over every live pool and along the pour (the stand-in's)
      const fire = game.fx?.fire;
      if (!fire) return;
      const G = FOUNDRY_TUNING.molten.glow;
      for (const p of F.molten.pools) {
        if (!p.alive) continue;
        p.acc += dt * G * Math.min(1.5, p.r) * (p.t > p.life - 2 ? Math.max(0, (p.life - p.t) / 2) : 1);
        while (p.acc >= 1) {
          p.acc -= 1;
          const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * p.r;
          blob.x = p.x + Math.cos(a) * r;
          blob.y = 0.05;
          blob.z = p.z + Math.sin(a) * r;
          blob.vx = 0;
          blob.vy = 0.3 + rnd() * 0.3;
          blob.vz = 0;
          blob.life = 0.5 + rnd() * 0.3;
          blob.size = 0.5;
          blob.heat = 0.4 + rnd() * 0.1;
          fire.spawn(blob);
        }
      }
      const P = FOUNDRY.pour;
      st.pourAcc += dt * 18;
      while (st.pourAcc >= 1) {
        st.pourAcc -= 1;
        blob.x = P.x0 + rnd() * (P.x1 - P.x0);
        blob.y = -0.1;
        blob.z = P.z0 + 0.6 + rnd() * (P.z1 - P.z0 - 1.2);
        blob.vx = 0;
        blob.vy = 0.2 + rnd() * 0.3;
        blob.vz = 0;
        blob.life = 0.6 + rnd() * 0.4;
        blob.size = 0.7;
        blob.heat = 0.42 + rnd() * 0.1;
        fire.spawn(blob);
      }
    },
  };
}
