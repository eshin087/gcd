import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createPropArtMaterial, createCarvedGlyphMaterial } from '../render/materials.js';
import { markCaster } from '../render/pipeline.js';
import { mulberry32, range, fbm2, hash2 } from '../core/rng.js';
import { CONFIG } from '../core/config.js';
import { TAU } from '../core/math.js';
import { prep, carve, mul, slabGeometry, SLAB_LOOK, buildBonfire, buildRubble, geosHeight, refine, brickEdge, lumpy } from './forest.js';
import { breakableFloor } from './floor.js';
import { addSlabRims } from '../render/dragonFloor.js';
import { LetterBatch } from './life/letterBatch.js';
import { lookOf } from '../entities/enemies/duelist/lookSwitch.js';

// The Veiled Crossing (levels/veil.js): a great city crossing AFTER the fight has already levelled it, at
// night, under a black veil (no sky: a hard dark past the last ruins). Read from above at the game
// camera (58 degrees, from the south): the sky and the skyline are never on screen, so the place is its
// floor and what stands north, east and west of the fight. A rubble plain, not a standing city (Halcyon
// Plaza is that): an avenue (north-south) and a street (east-west), both 21 m wide, meet in a square of
// cracked asphalt; THE SCRAMBLE's white bars are carved in it, the two diagonals and the four side
// crossings, buckled and split (each run of bars is its own floor slab: they break as the asphalt does);
// a crater field; a long old trench across the south half (a line of erasure fired before the hero came).
// North, a FALLEN TOWER lies across the avenue as a long wall (in sections: one wide line bores a hole);
// tower stumps on the north corners (a base that `holds` its top: the tops can come down), low ruins on
// the south ones (nothing tall south of the fight); a collapsed footbridge over the east street, a
// toppled sign gantry over the west one, wrecked cars, a bus on its side, bent lamp posts (three still
// burn: `lamp`), signal poles, rubble and rebar heaps, a water tank, loose slabs of the road round the
// middle for his pull to drag and throw.
//
// Everything that stands in it is in `breakables` (ADR-107, ADR-132; ARCHITECTURE.md "Destruction"): the
// floor (world/floor.js) and every piece; only the bonfire is merged (it stays whole, as in every level).
//
// THE SET CONTRACT (what the rules, the moves, the fx and the tests read):
//   CROSSING                 the layout (levels/veil.js copies it into CONFIG.world): r (the fight's
//                            radius), bound (the hero's circle: the bonfire is inside it), dragonBound,
//                            bonfire, wait {x, z, yaw} (where he waits), entryZ (the boss trigger), and
//                            the plan: road (half width of both roads), clear (nothing that stops a blade
//                            inside this), half / cell (the fine floor), outer / outerCell (the coarse ring)
//   createVeiledCrossing(U, colliders) → the set (world.js's shape: group, treeSpots, bare, slabs, nest,
//                            bonfire, material, stoneMaterial, slabMaterial, breakables, sky, ambience,
//                            grass, scarInk, floorCarry), plus:
//   set.setPhase(n)          the light by his phase: 1 cold and dim, 2 his eyes' blue in the air, 3 the
//                            void's (the domain calls it with the scene; the reset with 1). Returns n.
//   set.scenes               the scriptHall contract (world/scriptHall.js header): ids ['crossing',
//                            'void'] (the first is home), now, k, morphing, to(id, {x, z, speed}),
//                            snap(id), reset(), update(dt), hold(sec), stutter(sec), bind(game).
//                            to() runs a FRONT out from (x, z) (VEIL.morph): each piece it crosses lets go
//                            (its letters rise as dim digits into the dark) and the new scene's prints in;
//                            the light eases with the front. A piece with `scene: 'crossing'` stands only
//                            in the crossing, `scene: 'void'` only in the void (a floating piece: `y0` > 0);
//                            no `scene`: both (the floor). world:scene { id, x, z } as a morph starts.
//                            BACK TO THE CROSSING the city's pieces return AS THEY WERE LEFT: a piece whole
//                            (or chipped) when the void came comes back whole, one BROKEN to its stump
//                            comes back as that stump (quietly: no debris, no sound), one felled, thrown,
//                            taken or gone stays gone; the wreckage on the floor sank with the front and
//                            stays gone (the destructibles can only bring a piece back whole: `present`).
//                            The floor is the floor of both scenes: its cracks and holes stay. Its MARKS
//                            (world.scars) are the scene's: the city's are hidden as the front to the void
//                            passes them (scars.shade) and shown again as the front back passes them; what is
//                            fought in the void marks the void (scars.layer), and stays on the way back.
//   set.air                  the void's air (the stars): { count, budget, on } (the Lab, the tests)
//   THROWABLES (the terrain agent finds them by kind, never by place: destructibles.nearest(x, z,
//   { kind }) or list.filter(b => b.kind === ...)): the kinds in THROWABLE. In the crossing 'car' (`lift:
//   1`, 8 of them), 'slab' (`lift: 1`, 6: road slabs torn up, round the middle) and 'towerTop' (`lift: 2`,
//   raised: y0, held by a 'towerBase'; 4); in the void 'floatSlab', 'floatCar', 'floatCorner' (raised,
//   `lift: 1`; `def.float`: they bob). Everything else is cover or wreck (THE PIECES table below).
//   The void's AIR (its stars: many tiny faint letters, a LetterBatch, never heat) is drawn by this set's
//   ambience while the void stands (and through the front).
//
// LOOK SWITCHES (read when the set is built: a reload; duelist/lookSwitch.js PENDING, the Lab's LOOKS):
//   ?wjCity=a|b|c   the crossing's reading: a ASH MOON (cold moonlit ash-grey, pale bars), b LAST LAMPS (the
//                   last sodium lamps' amber and two dead screens' glow, warm grey asphalt), c BLACK WET
//                   (wet black asphalt, pale bars, a cold blue moon). Light, palette and dressing; one layout.
//   ?wjVoid=a|b|c   the void: a DRIFTS (star clumps and drifts only), b THE RING (the stars and one great
//                   pale ring lying on the floor round the fight, its far side lost in the black), c THE
//                   FALL (the stars falling slowly as fine streaks, a line of light where the floor ends)

/** Layout numbers (world metres): levels/veil.js copies these into CONFIG.world. */
export const CROSSING = Object.freeze({
  r: 20, // the fight's radius (the arena)
  bound: 28, // the hero's circle (the bonfire and the corners' ruins are inside it)
  dragonBound: 17,
  road: 10.5, // both roads' half width: the crossing's square is |x|, |z| < road
  clear: 5.5, // nothing that stops a blade inside this
  half: 21, // the fine floor (3.5 m slabs): |x|, |z| < half
  cell: 3.5,
  outer: 42, // the coarse ring of floor out to here (10.5 m plates), under the fog
  outerCell: 10.5,
  bonfire: Object.freeze({ x: 0, z: 25 }),
  wait: Object.freeze({ x: 0, z: -1.5, yaw: 0 }), // in the middle of the crossing (yaw 0 faces +z: the hero coming up from the south)
  entryZ: 17,
});
/** The scenes (the first is home). */
export const SCENES = Object.freeze(['crossing', 'void']);
/** The kinds of loose pieces the moves may lift and throw (see the header). */
export const THROWABLE = Object.freeze(['car', 'slab', 'towerTop', 'floatSlab', 'floatCar', 'floatCorner']);

/** What the set's pieces are and do (content is data). hp in POWER units (breakTuning.js: 1 fells a tree). */
export const VEIL = Object.freeze({
  car: Object.freeze({ hp: 2.4, len: 4.1, wid: 1.8, r: 1.6, cr: 1.0 }), // cr: each of its two colliders
  bus: Object.freeze({ hp: 6, len: 11, r: 3.2 }),
  slab: Object.freeze({ hp: 1.6, r: 1.15, cr: 0.95 }),
  heap: Object.freeze({ hp: 2.6 }),
  lamp: Object.freeze({ h: 5.4, hp: 0.9, r: 0.2 }),
  signal: Object.freeze({ h: 3.6, hp: 0.9, r: 0.2 }),
  tower: Object.freeze({ baseH: 6, topH: 5, base: 14, top: 4.5, fallT: 1.6, blocks: 5 }),
  ruin: Object.freeze({ hp: 6, h: 2.4 }),
  fallen: Object.freeze({ x0: -16, x1: 16, z: -25.5, h: 5.2, d: 6.6, sections: 6, hp: 5 }),
  bridge: Object.freeze({ x: 17, pier: 11.2, deckY: 4.4, hp: 3.5, pierHp: 4 }),
  gantry: Object.freeze({ x: -14.5, hp: 2.2 }),
  tank: Object.freeze({ hp: 3, r: 1.3, h: 3.6 }),
  float: Object.freeze({ hp: 1.6, bob: 0.13, period: [4.5, 7.5], step: 0.012 }),
  // the scramble's bars (each run of three bars and their gaps one floor slab)
  bars: Object.freeze({ period: 1.05, bar: 0.52, diagHalf: 12.4, diagW: 2.2, sideAt: 12.6, sideW: 1.7, sideHalf: 10.2, run: 4, missing: 0.1 }),
  // the old trench (a line of erasure fired before he came): a centre point, its way, half its width
  trench: Object.freeze({ x: 0, z: 5, dx: 0.9762, dz: -0.2169, w: 2.4 }),
  craters: Object.freeze([[-5, -5, 2.0], [6.2, -3.2, 1.5], [-13.5, 1, 2.4], [12.5, -7.5, 1.8], [3, 17, 2.0], [-8, -17.5, 2.2], [14, 13.5, 1.6], [-2.5, -13.5, 1.4]]),
  morph: Object.freeze({ speed: 18, max: 1.8 }),
  lights: Object.freeze({ intensity: 1.15, radius: 10 }),
});

/** The crossing's look now (`?wjCity=`; read when the set is built). */
export const cityLook = () => {
  const o = lookOf('wjCity', 'a', 'a');
  return o === 'b' || o === 'c' ? o : 'a';
};
/** The void's look now (`?wjVoid=`; read when the set is built). */
export const voidLook = () => {
  const o = lookOf('wjVoid', 'a', 'a');
  return o === 'b' || o === 'c' ? o : 'a';
};

/** Per crossing look: the light of each phase (moon, ambient, fog colour, fog near / far: m round the
 *  camera's focus), the floor's and the pieces' tones, the floor print, the lamps' warm lights (b). */
const LOOKS = Object.freeze({
  a: Object.freeze({ // ASH MOON: cold moonlit ash-grey, pale bars
    light: Object.freeze({
      1: Object.freeze({ moon: [0.3, 0.31, 0.37], ambient: [0.038, 0.04, 0.048], fog: [0.005, 0.005, 0.007], near: 24, far: 46 }),
      2: Object.freeze({ moon: [0.17, 0.22, 0.38], ambient: [0.024, 0.036, 0.07], fog: [0.003, 0.007, 0.016], near: 22, far: 44 }),
      3: Object.freeze({ moon: [0.08, 0.08, 0.12], ambient: [0.01, 0.01, 0.016], fog: [0.001, 0.001, 0.003], near: 12, far: 26 }),
    }),
    moonDir: [-0.35, 0.86, 0.38],
    asphalt: [0.06, 0.06, 0.064], walk: [0.1, 0.1, 0.104], paint: [0.95, 0.95, 0.97], line: [0.3, 0.29, 0.25], wet: 0,
    concrete: [0.12, 0.12, 0.126], glass: [0.035, 0.038, 0.048], lit: null, metal: [0.12, 0.125, 0.135], scorch: [0.018, 0.018, 0.02],
    floorLook: { gain: 1.15, lumScale: 1.6, edge: 0.2, inkFloor: 0.02 }, warm: null, screens: false,
  }),
  b: Object.freeze({ // LAST LAMPS: sodium amber, dead screens, warm grey asphalt
    light: Object.freeze({
      1: Object.freeze({ moon: [0.17, 0.14, 0.12], ambient: [0.046, 0.034, 0.024], fog: [0.012, 0.007, 0.004], near: 24, far: 46 }),
      2: Object.freeze({ moon: [0.14, 0.17, 0.3], ambient: [0.03, 0.036, 0.06], fog: [0.006, 0.007, 0.014], near: 22, far: 44 }),
      3: Object.freeze({ moon: [0.07, 0.06, 0.07], ambient: [0.012, 0.009, 0.01], fog: [0.002, 0.001, 0.002], near: 12, far: 26 }),
    }),
    moonDir: [0.3, 0.8, 0.5],
    asphalt: [0.07, 0.062, 0.058], walk: [0.12, 0.11, 0.1], paint: [0.9, 0.8, 0.62], line: [0.36, 0.28, 0.14], wet: 0.2,
    concrete: [0.13, 0.118, 0.11], glass: [0.05, 0.045, 0.04], lit: [0.3, 0.22, 0.1], metal: [0.13, 0.12, 0.115], scorch: [0.022, 0.018, 0.016],
    floorLook: { gain: 1.25, lumScale: 1.75, edge: 0.22, inkFloor: 0.025 }, warm: [1.0, 0.58, 0.22], screens: true,
  }),
  c: Object.freeze({ // BLACK WET: wet black asphalt, pale bars, a cold blue moon
    light: Object.freeze({
      1: Object.freeze({ moon: [0.24, 0.29, 0.42], ambient: [0.026, 0.032, 0.048], fog: [0.003, 0.004, 0.008], near: 24, far: 46 }),
      2: Object.freeze({ moon: [0.16, 0.25, 0.5], ambient: [0.02, 0.036, 0.08], fog: [0.002, 0.006, 0.018], near: 22, far: 44 }),
      3: Object.freeze({ moon: [0.06, 0.07, 0.11], ambient: [0.008, 0.009, 0.015], fog: [0.001, 0.001, 0.003], near: 12, far: 26 }),
    }),
    moonDir: [-0.2, 0.82, 0.54],
    asphalt: [0.026, 0.027, 0.032], walk: [0.075, 0.078, 0.086], paint: [1.1, 1.1, 1.14], line: [0.34, 0.33, 0.3], wet: 1.4,
    concrete: [0.09, 0.093, 0.1], glass: [0.03, 0.035, 0.05], lit: null, metal: [0.1, 0.105, 0.12], scorch: [0.012, 0.012, 0.015],
    floorLook: { gain: 1.1, lumScale: 1.55, edge: 0.2, inkFloor: 0.018 }, warm: null, screens: false,
  }),
});

/** Per void look: its light, and the air (stars; b's ring; c's falling streaks and the floor's edge). */
const VOIDS = Object.freeze({
  a: Object.freeze({ light: Object.freeze({ moon: [0.036, 0.036, 0.06], ambient: [0.004, 0.004, 0.008], fog: [0, 0, 0.002], near: 5, far: 14 }), ring: false, fall: false }),
  b: Object.freeze({ light: Object.freeze({ moon: [0.036, 0.036, 0.055], ambient: [0.004, 0.004, 0.007], fog: [0, 0, 0.002], near: 5, far: 14 }), ring: true, fall: false }),
  c: Object.freeze({ light: Object.freeze({ moon: [0.034, 0.032, 0.055], ambient: [0.004, 0.004, 0.008], fog: [0.001, 0, 0.003], near: 5, far: 13 }), ring: false, fall: true }),
});

/** The light of each phase / scene (look a; the others: LOOKS / VOIDS): kept for the callers of the stand-in. */
export const VEIL_LIGHT = Object.freeze({ 1: LOOKS.a.light[1], 2: LOOKS.a.light[2], 3: VOIDS.a.light });

/** The void's air: letters at once (desktop, LOW), how many clumps and drifts, where they float. */
export const AIR = Object.freeze({
  max: 1600, low: 700, clumps: 56, drifts: 14, per: [10, 22], driftPer: [26, 40],
  r: [6, 21], y: [0.4, 7], spin: [0.012, 0.035], keep: 6.5, // keep: m round the focus kept clear near the floor
  color: [0.7, 0.74, 0.92], alpha: [0.3, 0.75], twinkle: 0.35, glyphs: ".'`,:.+*.'", chars: ".'`,:+*-~|",
  ring: Object.freeze({ r: 11, n: 560, y: 0.22, color: [0.8, 0.82, 0.92], alpha: 0.85, fade: [11, 19] }),
  grit: Object.freeze({ rate: 2.5, life: [1.8, 2.8], speed: [0.5, 0.9], alpha: 0.35, color: [0.5, 0.5, 0.58] }), // what trickles off a floating piece
  fall: Object.freeze({ rate: 60, speed: [0.6, 1.2], life: [6, 9], alpha: 0.6, edge: 0.55, edgeN: 260, edgeColor: [0.75, 0.68, 1.0] }),
});

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => t * t * (3 - 2 * t);

const DARK_METAL = [0.06, 0.062, 0.07];
const BURNT = [0.03, 0.028, 0.027];
const RUST = [0.13, 0.07, 0.045];
const CAR_COLS = [[0.11, 0.115, 0.13], [0.16, 0.065, 0.05], [0.07, 0.08, 0.11], [0.14, 0.135, 0.125], [0.05, 0.05, 0.055], [0.12, 0.1, 0.07], [0.09, 0.11, 0.1], [0.15, 0.15, 0.16]];

// ---------------------------------------------------------------- builders (world space, carved for prop art)
/** A box w x h x d standing on (x, y0, z), turned `ry` about its base. */
function box(w, h, d, x = 0, y0 = 0, z = 0, ry = 0) {
  const g = prep(new THREE.BoxGeometry(w, h, d));
  g.translate(0, h / 2, 0);
  if (ry) g.rotateY(ry);
  g.translate(x, y0, z);
  return g;
}
/** Drop the faces that look straight down from the ground (never seen: they would only cost bricks). */
function noBottom(g, y = 0.02) {
  const p = g.attributes.position, n = g.attributes.normal;
  if (!p || !n || g.index) return g;
  const keep = [];
  for (let t = 0; t < p.count; t += 3) {
    const down = n.getY(t) < -0.9 && n.getY(t + 1) < -0.9 && n.getY(t + 2) < -0.9 && p.getY(t) < y && p.getY(t + 1) < y && p.getY(t + 2) < y;
    if (!down) keep.push(t);
  }
  if (keep.length * 3 === p.count) return g;
  for (const k of Object.keys(g.attributes)) {
    const A = g.attributes[k], sz = A.itemSize, out = new Float32Array(keep.length * 3 * sz);
    keep.forEach((t, i) => out.set(A.array.subarray(t * sz, (t + 3) * sz), i * 3 * sz));
    g.setAttribute(k, new THREE.BufferAttribute(out, sz));
  }
  return g;
}
/** A cylinder r0 (bottom) → r1 (top), h tall, on (x, y0, z). */
function cyl(r0, r1, h, x = 0, y0 = 0, z = 0, sides = 8) {
  const g = prep(new THREE.CylinderGeometry(r1, r0, h, sides, 1));
  g.translate(x, y0 + h / 2, z);
  return g;
}
const EDGE = (px, py, pz, nx, ny) => (ny > 0.5 && ny < 0.95 ? 1 : 0);
/** Carve a list of [geo, col] for the prop art path; returns the geos. */
function carveAll(parts, ao = (px, py) => 0.6 + 0.4 * Math.min(1, py / 3)) {
  for (const [g, col] of parts) carve(g, { col, ao, edge: EDGE });
  return parts.map(([g]) => g);
}
/** Turn a group of geos (built round the origin) by ry and move them to (x, y, z). */
function place(geos, x, z, ry = 0, y = 0) {
  for (const g of geos) {
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
  }
  return geos;
}
/** Kink the part of a geometry above yb over by `ang` toward (ax, az) (a bent post). */
function kink(g, yb, ang, ax, az) {
  const p = g.attributes.position, c = Math.cos(ang), s = Math.sin(ang);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y <= yb) continue;
    const x = p.getX(i), z = p.getZ(i), a = x * ax + z * az, d = y - yb;
    const na = a * c + d * s, nd = -a * s + d * c;
    p.setXYZ(i, x + (na - a) * ax, yb + nd, z + (na - a) * az);
  }
  return g;
}
/** Jagged top: every vertex above `y` pulled down by up to `k` m (a broken-off edge). */
function jag(g, y, k, seed) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > y) p.setY(i, Math.max(y * 0.6, p.getY(i) - hash2(p.getX(i) * 0.9 + seed, p.getZ(i) * 0.9 - seed) * k));
  return g;
}

/** A wrecked car (faces +z, built round the origin, then posed): `pose` 'up' | 'roof' (on its roof) |
 *  'side' (on its side) | 'crushed'. Returns { geos, wreck } (the wreck: a flat burnt shell, no collider). */
function buildCar(x, z, ry, col, pose, seed) {
  const W = VEIL.car.wid, L = VEIL.car.len;
  const raw = [];
  const body = box(W, 0.66, L, 0, 0.3, 0);
  refine(body, 0.7);
  lumpy(body, 0.05, 1.4, seed);
  raw.push([body, col]);
  const cab = box(W * 0.86, pose === 'crushed' ? 0.26 : 0.52, L * 0.48, 0, 0.96, -0.2);
  const q = cab.attributes.position;
  for (let i = 0; i < q.count; i++) if (q.getY(i) > 1.1) q.setZ(i, q.getZ(i) * 0.72 - 0.1);
  raw.push([cab, mul(col, 0.5)]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = prep(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 7, 1));
    w.rotateZ(Math.PI / 2);
    w.translate(sx * (W / 2 - 0.08), 0.33, sz * (L / 2 - 0.66));
    raw.push([w, DARK_METAL]);
  }
  raw.push([box(W * 0.92, 0.12, 0.1, 0, 0.52, L / 2), mul(col, 1.3)]); // the bumpers
  raw.push([box(W * 0.92, 0.12, 0.1, 0, 0.52, -L / 2), mul(col, 1.3)]);
  for (const [g] of raw) {
    if (pose === 'roof') {
      g.rotateZ(Math.PI);
      g.translate(0, 1.5, 0);
    } else if (pose === 'side') {
      g.rotateZ(Math.PI / 2);
      g.translate(0.74, 0.9, 0);
    }
  }
  const geos = place(carveAll(raw, (px, py) => 0.55 + 0.45 * Math.min(1, py / 1.3)), x, z, ry);
  const ch = box(W * 0.95, 0.4, L * 0.96, 0, 0.06, 0);
  const cp = ch.attributes.position;
  for (let i = 0; i < cp.count; i++) cp.setY(i, Math.max(0.02, cp.getY(i) - hash2(cp.getX(i) * 7 + x, cp.getZ(i) * 7 + z) * 0.14));
  const wreck = place(carveAll([[ch, BURNT], [box(W * 0.55, 0.14, L * 0.32, 0, 0.42, -0.2), mul(BURNT, 0.8)]], 0.6), x, z, ry);
  return { geos, wreck, h: pose === 'side' ? 1.85 : 1.5 };
}

/** A bus lying on its side along +x (its roof toward -z), built round the origin. */
function buildBus(L, x, z, ry, seed) {
  const len = VEIL.bus.len, wid = 2.5, ht = 3.0;
  const col = [0.16, 0.15, 0.12];
  const g = box(len, wid, ht, 0, 0, 0);
  noBottom(g);
  refine(g, 0.8);
  lumpy(g, 0.07, 0.9, seed);
  // its windows ran along its side, now facing up: a band of dark glass, broken
  carve(g, {
    col: (px, py, pz, nx, ny) => {
      if (ny > 0.6 && Math.abs(pz) < 0.75 && ((px + 20) % 1.6) > 0.25) return hash2(px * 3, pz * 5 + seed) < 0.3 ? BURNT : L.glass;
      return mul(col, 0.75 + 0.35 * fbm2(px * 0.6 + seed, py * 0.6 + pz, 2));
    },
    ao: (px, py) => 0.55 + 0.45 * Math.min(1, py / 2.5),
    edge: EDGE,
  });
  const parts = [g];
  // its wheels on its underside, now its south face: discs lying flat, half out of the body
  for (const sx of [-1, 1]) for (const y of [0.12, 2.08]) {
    const w = cyl(0.5, 0.5, 0.3, sx * (len / 2 - 1.8), y, ht / 2, 8);
    carve(w, { col: DARK_METAL, ao: 0.7, edge: EDGE });
    parts.push(w);
  }
  const ruin = box(len * 0.94, 1.2, ht * 0.9, 0, 0, 0);
  jag(ruin, 0.6, 0.6, seed);
  carve(ruin, { col: BURNT, ao: 0.7 });
  return { geos: place(parts, x, z, ry), ruin: place([ruin], x, z, ry) };
}

/** A lamp post: `lit`: straight, the lamp head on top (its flame: the lamps layer, `lamp`); else bent
 *  over at `bendY` by `bend` rad toward (bx, bz), its arm and head hanging. Returns { geos, stub, h }. */
function buildLamp(L, x, z, lit, bend, bendY, bx, bz) {
  const H = VEIL.lamp.h;
  const raw = [[cyl(0.13, 0.08, H, 0, 0, 0, 6), L.metal], [cyl(0.2, 0.17, 0.4, 0, 0, 0, 6), DARK_METAL]];
  if (lit) raw.push([cyl(0.2, 0.26, 0.42, 0, H - 0.05, 0, 6), [0.3, 0.31, 0.33]], [cyl(0.28, 0.06, 0.16, 0, H + 0.37, 0, 6), L.metal]);
  else raw.push([box(0.08, 0.08, 1.3, 0, H - 0.2, 0.6), L.metal], [box(0.34, 0.14, 0.6, 0, H - 0.34, 1.15), [0.22, 0.23, 0.25]]);
  if (!lit && bend) for (const [g] of raw) kink(g, bendY, bend, bx, bz);
  const geos = place(carveAll(raw), x, z);
  const stub = place(carveAll([[cyl(0.13, 0.11, 0.55, 0, 0, 0, 6), DARK_METAL]], 0.7), x, z);
  return { geos, stub, h: geosHeight(geos) };
}

/** A signal pole: a post, a box of three dead lights on it (bent over like the lamps). */
function buildSignal(L, x, z, bend, bx, bz) {
  const H = VEIL.signal.h;
  const raw = [[cyl(0.1, 0.08, H, 0, 0, 0, 6), L.metal], [box(0.36, 1.0, 0.3, 0, H - 1.15, 0.2), DARK_METAL], [box(0.9, 0.08, 0.08, 0.45, H - 0.25, 0), L.metal]];
  if (bend) for (const [g] of raw) kink(g, 0.9, bend, bx, bz);
  const geos = place(carveAll(raw), x, z);
  const stub = place(carveAll([[cyl(0.1, 0.09, 0.5, 0, 0, 0, 6), DARK_METAL]], 0.7), x, z);
  return { geos, stub, h: geosHeight(geos) };
}

/** A heap of slabs and rubble with rebar standing out of it. Returns { geos, h }. */
function buildHeap(L, rng, x, z, r, seed) {
  const raw = [];
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU, d = r * range(rng, 0, 0.55), w = r * range(rng, 0.7, 1.2), dd = r * range(rng, 0.4, 0.8), t = range(rng, 0.22, 0.4);
    const g = box(w, t, dd, Math.cos(a) * d, 0, Math.sin(a) * d, rng() * Math.PI);
    g.rotateX(range(rng, -0.35, 0.35));
    g.rotateZ(range(rng, -0.35, 0.35));
    g.translate(0, i * 0.18 + 0.1, 0);
    raw.push([g, mul(L.concrete, range(rng, 0.75, 1.15))]);
  }
  const base = buildRubble(rng, 0, 0, r * 0.75, { col: mul(L.concrete, 0.8), h: 0.55 })[0];
  const bars = [];
  for (let i = 0; i < 4; i++) {
    const a = rng() * TAU, d = r * range(rng, 0.1, 0.6);
    const g = cyl(0.025, 0.025, range(rng, 0.9, 1.7), 0, 0, 0, 4);
    g.rotateX(range(rng, -0.7, 0.7));
    g.rotateZ(range(rng, -0.7, 0.7));
    g.translate(Math.cos(a) * d, 0.3, Math.sin(a) * d);
    bars.push([g, RUST]);
  }
  const geos = place([...carveAll(raw), base, ...carveAll(bars, 0.8)], x, z);
  void seed;
  return { geos, h: geosHeight(geos) };
}

/** A slab of the road torn up (asphalt on concrete, a bar's paint on some). Returns geos. */
function buildRoadSlab(L, x, z, ry, rng, painted) {
  const w = range(rng, 2.0, 2.5), d = range(rng, 1.4, 1.8);
  const top = box(w, 0.16, d, 0, 0.3, 0);
  refine(top, 0.5);
  const under = box(w * 0.96, 0.3, d * 0.96, 0, 0, 0);
  lumpy(under, 0.06, 2, rng() * 99);
  const tilt = range(rng, 0.06, 0.16);
  carve(top, { col: (px, py, pz, nx, ny) => (painted && ny > 0.5 && ((px + 9) % 1.05) < 0.52 ? mul(L.paint, 0.4) : mul(L.asphalt, 0.8 + 0.4 * fbm2(px * 1.5, pz * 1.5, 2))), ao: 0.9, edge: EDGE });
  carve(under, { col: mul(L.concrete, 0.8), ao: 0.7, edge: EDGE });
  const geos = [top, under];
  for (const g of geos) g.rotateX(tilt);
  return place(geos, x, z, ry);
}

/** Window bands on a facade's carved colour: rows of dark glass, some lit (look b), `rot`: the tower lies
 *  on its side (its floors run across x). */
function facadeCol(L, base, seed, lying = false) {
  return (px, py, pz, nx, ny, nz) => {
    const up = ny > 0.6;
    if (!lying && (up || ny < -0.6)) return mul(base, 0.8);
    if (lying && ny < -0.6) return mul(base, 0.6);
    // the floors (2.2 m) and the window columns (1.8 m) on this face
    let fl, u;
    if (!lying) {
      fl = py;
      u = Math.abs(nx) > 0.5 ? pz : px;
    } else {
      fl = px + 40;
      u = up ? pz : Math.abs(nz) > 0.5 ? py : pz;
    }
    const fy = ((fl % 2.2) + 2.2) % 2.2, fu = ((u % 1.8) + 1.8) % 1.8;
    if (fy > 0.7 && fy < 1.8 && fu > 0.25 && fu < 1.55) {
      const h = hash2(Math.floor(u / 1.8) + seed * 13, Math.floor(fl / 2.2) + seed * 7);
      if (L.lit && h < 0.06) return L.lit;
      return h < 0.35 ? mul(L.glass, 0.5) : L.glass;
    }
    return mul(base, 0.85 + 0.3 * fbm2(px * 0.4 + seed, py * 0.4 + pz * 0.4, 2));
  };
}

/** A tower's stump: its ground floors (w x baseH x d) and the broken-off floors above (the top, raised). */
function buildTower(L, T, seed) {
  const H0 = VEIL.tower.baseH, H1 = VEIL.tower.topH;
  const g = box(T.w, H0, T.d, T.x, 0, T.z);
  noBottom(g);
  refine(g, 0.9);
  const col = facadeCol(L, L.concrete, seed);
  carve(g, { col: (px, py, pz, nx, ny, nz) => (py < 2.6 && ny < 0.5 && py > 0.3 && py < 2.4 ? mul(L.glass, 0.6) : col(px, py, pz, nx, ny, nz)), ao: (px, py) => 0.55 + 0.45 * Math.min(1, py / 6), edge: EDGE });
  const top = box(T.w * 0.94, H1, T.d * 0.94, T.x, H0, T.z);
  refine(top, 1.0);
  jag(top, H0 + H1 * 0.45, H1 * 0.55, seed * 3.1);
  carve(top, { col: facadeCol(L, mul(L.concrete, 1.08), seed + 3), ao: 0.85, edge: EDGE });
  const ruin = box(T.w * 0.96, 2.6, T.d * 0.96, T.x, 0, T.z);
  noBottom(ruin);
  refine(ruin, 1.2);
  jag(ruin, 1.2, 1.6, seed);
  carve(ruin, { col: mul(L.concrete, 0.6), ao: 0.7 });
  return { base: [g], top: [top], ruin: [ruin] };
}

/** A low ruin (the ground floor of a building on a south corner, its walls broken down to ~h). */
function buildRuin(L, x, z, w, d, seed) {
  const g = box(w, VEIL.ruin.h, d, x, 0, z);
  noBottom(g);
  refine(g, 0.9);
  jag(g, 1.0, 1.6, seed);
  carve(g, { col: facadeCol(L, mul(L.concrete, 0.9), seed), ao: (px, py) => 0.5 + 0.5 * Math.min(1, py / 2.4), edge: EDGE });
  const ruin = buildRubble(mulberry32(seed * 977 + 3), x, z, Math.min(w, d) * 0.42, { col: mul(L.concrete, 0.7), h: 0.7 });
  return { geos: [g], ruin };
}

/** One section of the fallen tower lying along x (w long, h tall, d deep) at (x, z): its facades face up
 *  and south, its floors run across it. Returns { geos, ruin }. */
function buildFallenSection(L, x, z, w, h, d, seed, end) {
  const g = box(w + 0.02, h, d, x, 0, z);
  noBottom(g);
  refine(g, 0.8);
  lumpy(g, 0.12, 0.5, seed);
  if (end) jag(g, h * 0.45, h * 0.5, seed * 1.7); // the broken end
  carve(g, { col: facadeCol(L, L.concrete, seed, true), ao: (px, py) => 0.5 + 0.5 * Math.min(1, py / h), edge: EDGE });
  // (felled, it reads as a GAP in the wall, the Null's bore: a low spill of rubble, no stub standing)
  const ruin = box(w * 0.9, 0.42, d * 0.8, x, 0, z);
  noBottom(ruin);
  refine(ruin, 0.6);
  jag(ruin, 0.3, 0.8, seed);
  carve(ruin, { col: mul(L.concrete, 0.55), ao: 0.6 });
  return { geos: [g], ruin: [ruin] };
}

/** The water tank: a drum on four legs, a ladder of a rail. Returns { geos, ruin }. */
function buildTank(L, x, z, seed) {
  const T = VEIL.tank, legH = 1.4;
  const raw = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) raw.push([cyl(0.09, 0.08, legH, sx * 0.85, 0, sz * 0.85, 4), RUST]);
  const drum = cyl(T.r, T.r, T.h - legH - 0.4, 0, legH, 0, 10);
  lumpy(drum, 0.06, 1.1, seed);
  raw.push([drum, mul(L.metal, 1.1)], [cyl(T.r * 1.03, T.r * 0.2, 0.4, 0, T.h - 0.4, 0, 10), mul(L.metal, 0.9)]);
  const geos = place(carveAll(raw), x, z);
  const ruin = buildRubble(mulberry32(seed), x, z, 0.8, { col: RUST, h: 0.35 });
  return { geos, ruin };
}

/** A piece floating in the void (built round its own base at y0). */
function buildFloat(L, kind, x, z, y0, rng) {
  let geos;
  if (kind === 'floatCar') geos = buildCar(0, 0, 0, CAR_COLS[Math.floor(rng() * CAR_COLS.length)], rng() < 0.5 ? 'roof' : 'crushed', rng() * 99).geos;
  else if (kind === 'floatCorner') {
    const g = box(2.4, 2.8, 2.2, 0, 0, 0);
    refine(g, 0.9);
    jag(g, 1.4, 1.2, rng() * 99);
    carve(g, { col: facadeCol(L, L.concrete, 9), ao: 0.8, edge: EDGE });
    geos = [g];
  } else geos = buildRoadSlab(L, 0, 0, 0, rng, rng() < 0.5);
  for (const g of geos) {
    g.rotateY(rng() * TAU);
    g.rotateX(range(rng, -0.25, 0.25));
    g.rotateZ(range(rng, -0.25, 0.25));
    g.translate(x, y0, z);
  }
  return geos;
}

/**
 * Up to `n` points on the geometries (world space; triangle centres picked by area) with their colour:
 * where a piece's letters come from when it lets go in the morph (x, y, z, r, g, b per point).
 */
function shedSamples(geos, n, rng) {
  const tris = [];
  let total = 0;
  for (const g of geos) {
    const p = g.attributes.position.array, c = g.attributes.aCol?.array;
    for (let k = 0; k + 8 < p.length; k += 9) {
      const ax = p[k + 3] - p[k], ay = p[k + 4] - p[k + 1], az = p[k + 5] - p[k + 2];
      const bx = p[k + 6] - p[k], by = p[k + 7] - p[k + 1], bz = p[k + 8] - p[k + 2];
      const a = 0.5 * Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
      if (!(a > 1e-5)) continue;
      total += a;
      tris.push([total, p, c, k]);
    }
  }
  const out = new Float32Array(n * 6);
  if (!tris.length) return out.subarray(0, 0);
  for (let i = 0; i < n; i++) {
    const t = rng() * total;
    let lo = 0, hi = tris.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (tris[m][0] < t) lo = m + 1;
      else hi = m;
    }
    const [, p, c, k] = tris[lo];
    const u = rng(), v = rng() * (1 - u), w = 1 - u - v;
    for (let j = 0; j < 3; j++) out[i * 6 + j] = p[k + j] * u + p[k + 3 + j] * v + p[k + 6 + j] * w;
    for (let j = 0; j < 3; j++) out[i * 6 + 3 + j] = c ? c[k + j] : 0.2;
  }
  return out;
}

// ---------------------------------------------------------------- the floor
/** Keep the part of a convex polygon where nx x + nz z <= c (Sutherland–Hodgman, one plane). */
function clip(poly, nx, nz, c) {
  const out = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const da = nx * a[0] + nz * a[1] - c, db = nx * b[0] + nz * b[1] - c;
    if (da <= 0) out.push(a);
    if ((da <= 0) !== (db <= 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}
const areaOf = (poly) => {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
};
/** A band (a rectangle: centre, unit way along, half length, half width) as four planes (inside: all <= 0). */
function bandPlanes(B, pad = 0) {
  const { x, z, ux, uz } = B, vx = -uz, vz = ux, hl = B.hl + pad, hw = B.hw + pad;
  const a = ux * x + uz * z, v = vx * x + vz * z;
  return [[ux, uz, a + hl], [-ux, -uz, -a + hl], [vx, vz, v + hw], [-vx, -vz, -v + hw]];
}
/** A convex polygon less a band: up to four convex pieces. */
function subtract(poly, planes) {
  const out = [];
  let rest = poly;
  for (const [nx, nz, c] of planes) {
    const outside = clip(rest, -nx, -nz, -c);
    if (outside.length >= 3 && areaOf(outside) > 1e-3) out.push(outside);
    rest = clip(rest, nx, nz, c);
    if (rest.length < 3) return out;
  }
  return out; // (what is left inside the band is the band's)
}
const centroid = (poly) => {
  let x = 0, z = 0;
  for (const [px, pz] of poly) {
    x += px / poly.length;
    z += pz / poly.length;
  }
  return [x, z];
};
/** The scramble's bands: the two diagonals and the four side crossings. */
function scrambleBands() {
  const S = VEIL.bars, r2 = Math.SQRT1_2;
  return [
    { x: 0, z: 0, ux: r2, uz: r2, hl: S.diagHalf, hw: S.diagW, skip: 0 },
    { x: 0, z: 0, ux: r2, uz: -r2, hl: S.diagHalf, hw: S.diagW, skip: S.diagW + 0.06 }, // (the first runs through the middle)
    { x: 0, z: -S.sideAt, ux: 1, uz: 0, hl: S.sideHalf, hw: S.sideW, skip: 0 },
    { x: 0, z: S.sideAt, ux: 1, uz: 0, hl: S.sideHalf, hw: S.sideW, skip: 0 },
    { x: -S.sideAt, z: 0, ux: 0, uz: 1, hl: S.sideHalf, hw: S.sideW, skip: 0 },
    { x: S.sideAt, z: 0, ux: 0, uz: 1, hl: S.sideHalf, hw: S.sideW, skip: 0 },
  ];
}
/** Signed metres across the old trench (0 on its line). */
const trenchD = (x, z) => {
  const T = VEIL.trench;
  return (x - T.x) * -T.dz + (z - T.z) * T.dx;
};

/** The asphalt's carved colour: tarmac, the craters and the old trench burnt into it, the lane paint
 *  down the roads past the crossing. */
function asphaltCol(L) {
  const R = CROSSING.road, Tw = VEIL.trench.w;
  return (px, py, pz) => {
    const n = 0.75 + 0.5 * fbm2(px * 0.55, pz * 0.55, 2);
    let col = mul(L.asphalt, n * (1 + L.wet * 0.25 * fbm2(px * 0.25 + 9, pz * 0.25, 2)));
    // the old trench: charred black glass with a pale fused lip
    const td = Math.abs(trenchD(px, pz));
    if (td < Tw) {
      // (glints of fused glass in the black, along the line it was cut)
      const gl = hash2(Math.floor(px * 2.2), Math.floor(pz * 2.2));
      return gl > 0.93 ? mul(L.paint, 0.22) : mul(L.scorch, 0.6 + 0.8 * fbm2(px * 1.4, pz * 1.4, 2));
    }
    if (td < Tw + 0.6) return mul(L.asphalt, 2.6 + 0.8 * hash2(px * 4, pz * 4));
    // the craters: a black bowl, a pale torn rim
    for (const [cx, cz, cr] of VEIL.craters) {
      const d = Math.hypot(px - cx, pz - cz);
      if (d < cr * 0.75) return mul(L.scorch, 0.8 + 0.6 * (d / cr));
      if (d < cr) return mul(L.asphalt, 2.4 + 0.8 * hash2(px * 3, pz * 3));
    }
    // the lane paint along the roads past the crossing: a centre double line, dashed lanes (worn)
    const ax = Math.abs(px), az = Math.abs(pz), wear = fbm2(px * 0.8 + 3, pz * 0.8, 2) > 0.42 ? 0.45 : 0.15;
    if (ax > CROSSING.half || az > CROSSING.half) return col;
    if (az > R + 4.2 && ax < R) {
      if (Math.abs(ax - 0.22) < 0.1) return mul(L.line, wear);
      if (Math.abs(ax - 5.2) < 0.09 && ((pz + 40) % 3.2) < 1.6) return mul(L.paint, 0.8 * wear);
    }
    if (ax > R + 4.2 && az < R) {
      if (Math.abs(az - 0.22) < 0.1) return mul(L.line, wear);
      if (Math.abs(az - 5.2) < 0.09 && ((px + 40) % 3.2) < 1.6) return mul(L.paint, 0.8 * wear);
    }
    return col;
  };
}
/** Does anything painted fall on the polygon (the carved colour is not the plain tarmac's)? Refine it finer. */
function painted(poly) {
  const R = CROSSING.road;
  for (const [x, z] of poly) {
    if (Math.abs(trenchD(x, z)) < VEIL.trench.w + 1.2) return true;
    for (const [cx, cz, cr] of VEIL.craters) if (Math.hypot(x - cx, z - cz) < cr + 2.5) return true;
    const ax = Math.abs(x), az = Math.abs(z);
    if (((az > R + 3 && ax < 7) || (ax > R + 3 && az < 7)) && ax < CROSSING.half && az < CROSSING.half) return true;
  }
  return false;
}

/** The scramble's paint: a bar's white, worn (bare tarmac where the paint is gone). */
function barCol(L, seed) {
  return (px, py, pz) => {
    const w = fbm2(px * 1.3 + seed, pz * 1.3 - seed, 3);
    if (Math.abs(trenchD(px, pz)) < VEIL.trench.w) return mul(L.scorch, 1.2 + 0.6 * w);
    return w > 0.3 ? mul(L.paint, 0.82 + 0.3 * w) : mul(L.asphalt, 1.4);
  };
}

/** The floor: fine slabs of asphalt and the corners' sidewalk, the scramble's runs of bars, the coarse
 *  ring under the fog. Pushes into slabGeos / slabs / floor (world/floor.js). `skip(x, z)`: no slab. */
function buildFloor(L, rng, slabGeos, slabs, floor, skip) {
  const C = CROSSING, R = C.road, S = VEIL.bars;
  const aCol = asphaltCol(L);
  const wCol = (px, py, pz) => (Math.abs(trenchD(px, pz)) < VEIL.trench.w ? mul(L.scorch, 1.4) : mul(L.walk, 0.8 + 0.35 * fbm2(px * 1.2, pz * 1.2, 2)));
  const bands = scrambleBands();
  const cut = bands.map((B) => bandPlanes(B, 0.04));
  const lay = (poly, kind, col, top, fine) => {
    const [x, z] = centroid(poly);
    if (skip(x, z)) return;
    let rr = 0;
    for (const [px, pz] of poly) rr = Math.max(rr, Math.hypot(px - x, pz - z));
    const g = slabGeometry(poly, { top, inset: kind === 'sidewalk' ? 0.06 : 0.03, drop: 0.03 });
    refine(g, fine);
    carve(g, { col, ao: 0.9, edge: EDGE });
    slabGeos.push(g);
    slabs.push({ x, z, r: rr * 0.85, outline: poly });
    floor.push({ geo: g, outline: poly, x, z, r: rr * 0.7, col, kind });
  };
  // ---- the fine floor (3.5 m), the bands cut out of it
  const n = Math.round((2 * C.half) / C.cell), j1 = 0.03;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x0 = -C.half + i * C.cell + j1, z0 = -C.half + j * C.cell + j1, x1 = x0 + C.cell - 2 * j1, z1 = z0 + C.cell - 2 * j1;
      let pieces = [[[x0, z0], [x1, z0], [x1, z1], [x0, z1]]];
      for (let b = 0; b < bands.length; b++) {
        const B = bands[b], ex = Math.abs(B.ux) * B.hl + Math.abs(B.uz) * B.hw + 0.5, ez = Math.abs(B.uz) * B.hl + Math.abs(B.ux) * B.hw + 0.5;
        if (x1 < B.x - ex || x0 > B.x + ex || z1 < B.z - ez || z0 > B.z + ez) continue;
        pieces = pieces.flatMap((p) => subtract(p, cut[b]));
      }
      for (const p of pieces) {
        if (areaOf(p) < 0.3) continue; // (a sliver: a gap of bare ground, the road split)
        const [cx, cz] = centroid(p);
        const walk = Math.abs(cx) > R && Math.abs(cz) > R;
        lay(p, walk ? 'sidewalk' : 'asphalt', walk ? wCol : aCol, walk ? 0.12 : 0.03, painted(p) ? 1.1 : walk ? 9 : 2.2);
      }
    }
  }
  // ---- the scramble: each band in runs of S.run bars and their gaps, each run one slab, buckled
  bands.forEach((B, bi) => {
    const vx = -B.uz, vz = B.ux;
    const segs = B.skip > 0 ? [[-B.hl, -B.skip], [B.skip, B.hl]] : [[-B.hl, B.hl]];
    for (const [t0, t1] of segs) {
      const len = t1 - t0, np = Math.max(1, Math.round(len / S.period)), per = len / np;
      for (let k = 0; k < np; k += S.run) {
        const m = Math.min(S.run, np - k);
        const ta = t0 + k * per, tb = ta + m * per;
        const cx = B.x + B.ux * (ta + tb) / 2, cz = B.z + B.uz * (ta + tb) / 2;
        if (skip(cx, cz) || rng() < S.missing) continue; // (a run torn out: bare ground)
        const corner = (t, s) => [B.x + B.ux * t + vx * s, B.z + B.uz * t + vz * s];
        const outline = [corner(ta, -B.hw), corner(tb, -B.hw), corner(tb, B.hw), corner(ta, B.hw)];
        const seed = bi * 31 + k * 7;
        const bc = barCol(L, seed);
        const parts = [];
        for (let q = 0; q < m; q++) {
          const a = ta + q * per, bar = a + S.bar * (per / S.period);
          for (const [u0, u1, white] of [[a, bar, true], [bar, a + per, false]]) {
            const poly = [corner(u0 + 0.015, -B.hw + 0.03), corner(u1 - 0.015, -B.hw + 0.03), corner(u1 - 0.015, B.hw - 0.03), corner(u0 + 0.015, B.hw - 0.03)];
            const g = slabGeometry(poly, { top: white ? 0.045 : 0.03, inset: 0.02, drop: 0.02 });
            if (white) refine(g, 0.9);
            carve(g, { col: white ? bc : aCol, ao: 0.92, edge: EDGE });
            parts.push(g);
          }
        }
        const g = mergeGeometries(parts);
        // buckled: each run a little tilted, raised or sunk, pushed off its line
        const tx = range(rng, -0.05, 0.05), tz = range(rng, -0.05, 0.05), dy = range(rng, -0.04, 0.05), sh = range(rng, -0.1, 0.1);
        g.translate(-cx, 0, -cz);
        g.rotateX(tx);
        g.rotateZ(tz);
        g.rotateY(range(rng, -0.035, 0.035));
        g.translate(cx + vx * sh, dy, cz + vz * sh);
        const col = (px, py, pz) => {
          const t = (px - B.x) * B.ux + (pz - B.z) * B.uz, f = (((t - ta) / per) % 1 + 1) % 1;
          return f < S.bar / S.period ? bc(px, py, pz) : aCol(px, py, pz);
        };
        slabGeos.push(g);
        slabs.push({ x: cx, z: cz, r: Math.hypot(B.hw, (tb - ta) / 2) * 0.85, outline });
        floor.push({ geo: g, outline, x: cx, z: cz, r: Math.min(B.hw, (tb - ta) / 2) * 1.2, col, kind: 'scramble' });
      }
    }
  });
  // ---- the coarse ring (7 m plates) out to C.outer, under the fog
  const m = Math.round((2 * C.outer) / C.outerCell);
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < m; i++) {
      const x0 = -C.outer + i * C.outerCell + 0.05, z0 = -C.outer + j * C.outerCell + 0.05, x1 = x0 + C.outerCell - 0.1, z1 = z0 + C.outerCell - 0.1;
      if (x1 > -C.half && x0 < C.half && z1 > -C.half && z0 < C.half) continue;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const walk = Math.abs(cx) > R + 1 && Math.abs(cz) > R + 1;
      lay([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], walk ? 'sidewalk' : 'asphalt', walk ? wCol : aCol, walk ? 0.12 : 0.03, painted([[x0, z0], [x1, z1], [x0, z1], [x1, z0]]) ? 2.2 : 9);
    }
  }
}

// ---------------------------------------------------------------- the set
/** Collects geometries for one merged mesh and hands out each piece's run of vertices (forest.js Runs). */
class Runs {
  constructor() {
    this.list = [];
    this.ranges = [];
    this.v = 0;
  }
  add(geos) {
    const L = brickEdge();
    if (L > 0) for (const g of geos) refine(g, L);
    const parts = geos.map((g) => g.attributes.position.count);
    const r = { mesh: null, start: this.v, count: parts.reduce((a, n) => a + n, 0), parts, leaf: null };
    this.list.push(...geos);
    this.v += r.count;
    this.ranges.push(r);
    return r;
  }
  finish(material, name) {
    const mesh = new THREE.Mesh(this.list.length ? mergeGeometries(this.list) : new THREE.BufferGeometry(), material);
    mesh.name = name;
    for (const k of ['position', 'normal']) mesh.geometry.attributes[k]?.setUsage(THREE.DynamicDrawUsage);
    for (const r of this.ranges) r.mesh = mesh;
    return mesh;
  }
}

/** The set (built on a quiet Math.random: three names every object with a random uuid; the seeded sims
 *  replay Math.random: its own build draws nothing from it). */
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
  const C = CROSSING, R = C.road;
  const opt = cityLook(), vopt = voidLook(), L = LOOKS[opt];
  const rng = mulberry32(CONFIG.seed + 209);
  const br = mulberry32(CONFIG.seed + 5209);
  const sr = mulberry32(CONFIG.seed + 9209); // (the morph's samples: a stream of their own)
  const group = new THREE.Group();
  group.name = 'veiledCrossing';
  const slabGeos = [], slabs = [], floor = [], breakables = [], bare = [], propGeos = [];
  const fallenRuns = new Runs(), fallenRuin = new Runs();
  const floats = [], screens = [];

  // ---- where nothing is laid: the bonfire's ring, under the fallen tower and the tower stumps
  const FT = VEIL.fallen;
  const TOWERS = [
    { x: -17.5, z: -17, w: 7, d: 6 }, { x: 18, z: -16.5, w: 6, d: 7 },
    { x: -28, z: -14.5, w: 5, d: 5 }, { x: 28.5, z: -13.5, w: 5, d: 5 },
  ];
  const inTower = (x, z, m = 0.2) => TOWERS.some((T) => Math.abs(x - T.x) < T.w / 2 + m && Math.abs(z - T.z) < T.d / 2 + m);
  const skip = (x, z) => Math.hypot(x - C.bonfire.x, z - C.bonfire.z) < 2.6 || inTower(x, z, -0.6) || (x > FT.x0 + 1 && x < FT.x1 - 1 && Math.abs(z - FT.z) < FT.d / 2 - 1);
  buildFloor(L, mulberry32(CONFIG.seed + 3209), slabGeos, slabs, floor, skip);

  // ---- the bonfire in the south avenue (it stays whole, as in every level)
  const bf = C.bonfire;
  propGeos.push(...buildBonfire(rng, bf.x, bf.z));
  colliders.add(bf.x, bf.z, 0.75, 'bonfire');
  bare.push({ x: bf.x, z: bf.z, r: 2.4 });

  /** A piece of the crossing (its morph samples, its scene). */
  const piece = (def, nShed = 48) => {
    def.scene ??= 'crossing';
    const geos = def.geos?.length ? def.geos : def.shedGeos;
    if (geos?.length) def.shed = shedSamples(geos, nShed, sr);
    delete def.shedGeos;
    breakables.push(def);
    return def;
  };

  // ---- the tower stumps on the north corners: the base holds its top (a two-stage piece: ADR-159)
  TOWERS.forEach((T, k) => {
    const t = buildTower(L, T, k + 1);
    const TT = VEIL.tower;
    const top = piece({
      kind: 'towerTop', mat: 'stone', look: 'prop', x: T.x, z: T.z, r: Math.min(T.w, T.d) * 0.5, y0: TT.baseH, h: TT.topH, geos: t.top, colliders: [],
      hp: TT.top, weight: 2.4, topples: true, cover: false, lift: 2, fallOff: 1.5, fallT: TT.fallT, blocks: TT.blocks, wreck: true,
    }, 64);
    const cs = [colliders.add(T.x, T.z, Math.min(T.w, T.d) * 0.5, 'stone')];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cs.push(colliders.add(T.x + sx * (T.w / 2 - 1.2), T.z + sz * (T.d / 2 - 1.2), 1.3, 'stone'));
    piece({
      kind: 'towerBase', mat: 'stone', look: 'prop', x: T.x, z: T.z, r: Math.min(T.w, T.d) * 0.55, h: TT.baseH, geos: t.base, colliders: cs,
      hp: TT.base, weight: 3, topples: false, cover: true, lift: 0, holds: top, broken: { geos: t.ruin, r: Math.min(T.w, T.d) * 0.45 }, wreck: false,
    }, 64);
    if (L.screens && k < 2) {
      // (b) a dead screen on the base's face toward the crossing: its glow (the ambience)
      screens.push({ base: null, x: T.x, z: T.z + T.d / 2 + 0.1, y0: 2.8, w: T.w * 0.55, h: 2.6, ux: 1, uz: 0, k });
    }
  });

  // ---- the low ruins on the south corners (nothing tall south of the fight)
  for (const [x, z, w, d] of [[-17.5, 17, 6.5, 5], [18, 17.5, 6, 5.5]]) {
    const g = buildRuin(L, x, z, w, d, Math.round(x * 3 + z));
    const cs = [colliders.add(x - w / 4, z, Math.min(w, d) * 0.42, 'stone'), colliders.add(x + w / 4, z, Math.min(w, d) * 0.42, 'stone')];
    piece({ kind: 'ruin', mat: 'stone', look: 'prop', x, z, r: Math.max(w, d) * 0.5, h: VEIL.ruin.h, geos: g.geos, colliders: cs, hp: VEIL.ruin.hp, weight: 2.4, topples: false, cover: true, lift: 0, broken: { geos: g.ruin, r: 0 }, wreck: false });
  }

  // ---- the fallen tower lying across the north (a wall in sections: one wide line bores one hole)
  {
    const n = FT.sections, w = (FT.x1 - FT.x0) / n;
    for (let k = 0; k < n; k++) {
      const x = FT.x0 + (k + 0.5) * w;
      const s = buildFallenSection(L, x, FT.z, w, FT.h, FT.d, 40 + k, k === 0 || k === n - 1);
      const shed = shedSamples(s.geos, 72, sr);
      const cs = [colliders.add(x - w / 4, FT.z + 0.7, 2.6, 'stone'), colliders.add(x + w / 4, FT.z + 0.7, 2.6, 'stone')];
      breakables.push({
        // (its footprint: half a section wide, toward its south face where blows meet it; a 5 m line
        // through one section's middle does not reach the next: CROSSING's Null bores one hole.
        // lift 2: only he can tear one up, Bring It Down's fallback once no tower top stands)
        kind: 'fallenTower', scene: 'crossing', mat: 'stone', look: 'range', x, z: FT.z + 0.7, r: w * 0.5, h: FT.h, range: fallenRuns.add(s.geos), colliders: cs,
        hp: FT.hp, weight: 3, topples: false, cover: true, lift: 2, broken: { range: fallenRuin.add(s.ruin), r: 0 }, wreck: false, shed,
      });
    }
  }

  // ---- the collapsed footbridge over the east street: the north pier holds its half of the deck (raised);
  // the south half lies where it fell, a ramp of slab down to the road; the south pier a stump
  {
    const B = VEIL.bridge, x = B.x, Y = B.deckY;
    const pierGeos = (h, z) => carveAll([[box(1.1, h, 1.1, x, 0, z), mul(L.concrete, 0.95)], [box(1.5, 0.35, 1.5, x, h - 0.35, z), mul(L.concrete, 1.1)]]);
    const deck = box(3.2, 0.6, 11.5, 0, 0, 0);
    refine(deck, 0.9);
    // its south end hangs down, torn
    const dp = deck.attributes.position;
    for (let i = 0; i < dp.count; i++) dp.setY(i, dp.getY(i) - Math.max(0, dp.getZ(i) + 2) * 0.12);
    jag(deck, 0.2, 0.3, 7);
    deck.translate(x, Y, -B.pier + 5.0); // (from the north pier to where it broke, over the fallen half)
    carve(deck, { col: (px, py, pz, nx, ny) => (ny > 0.6 && Math.abs(px - x) > 1.35 ? L.metal : mul(L.concrete, 0.9 + 0.25 * fbm2(px, pz, 2))), ao: 0.85, edge: EDGE });
    const top = piece({ kind: 'bridgeDeck', mat: 'stone', look: 'prop', x, z: -B.pier + 5, r: 2.8, y0: Y - 1.0, h: 1.6, geos: [deck], colliders: [], hp: B.hp, weight: 2, topples: true, cover: false, lift: 0, fallOff: 0.5, fallT: 1.1, wreck: true }, 56);
    piece({ kind: 'bridgePier', mat: 'stone', look: 'prop', x, z: -B.pier, r: 0.8, h: Y, geos: pierGeos(Y, -B.pier), colliders: [colliders.add(x, -B.pier, 0.75, 'stone')], hp: B.pierHp, topples: true, cover: true, lift: 0, holds: top, broken: { geos: carveAll([[box(1.1, 0.8, 1.1, x, 0, -B.pier), mul(L.concrete, 0.7)]], 0.7), r: 0.7 }, wreck: true });
    const span = box(3.2, 0.6, 11, 0, 0, 0);
    refine(span, 0.9);
    jag(span, 0.4, 0.4, 11);
    span.rotateX(0.2); // (its north end up on the broken deck, its south end on the road)
    span.translate(x, 1.0, 4.6);
    carve(span, { col: (px, py, pz, nx, ny) => (ny > 0.6 && Math.abs(px - x) > 1.35 ? L.metal : mul(L.concrete, 0.85 + 0.25 * fbm2(px, pz, 2))), ao: 0.8, edge: EDGE });
    const sc = [0.6, 3.9, 7.2].map((z) => colliders.add(x, z, 1.15, 'stone'));
    piece({ kind: 'bridgeSpan', mat: 'stone', look: 'prop', x, z: 4.6, r: 2.6, h: 2.6, geos: [span], colliders: sc, hp: B.hp, topples: false, cover: true, lift: 0, broken: { geos: buildRubble(br, x, 4.6, 1.2, { col: mul(L.concrete, 0.7), h: 0.4 }), r: 0 }, wreck: false }, 56);
    piece({ kind: 'bridgePier', mat: 'stone', look: 'prop', x, z: B.pier, r: 0.8, h: 1.7, geos: carveAll([[jag(box(1.1, 1.7, 1.1, x, 0, B.pier), 1.0, 0.7, 5), mul(L.concrete, 0.85)]]), colliders: [colliders.add(x, B.pier, 0.75, 'stone')], hp: B.pierHp, topples: false, cover: true, lift: 0, broken: null, wreck: true });
  }

  // ---- the toppled sign gantry over the west street: one leg still stands, the beam lies across the road
  {
    const G = VEIL.gantry, x = G.x;
    const leg = carveAll([[cyl(0.22, 0.18, 6.4, x, 0, -12.2, 6), L.metal], [box(0.5, 0.5, 2.8, x, 5.8, -11), L.metal], [box(0.1, 1.5, 2.4, x + 0.3, 4.4, -10.6), [0.05, 0.08, 0.06]]]);
    piece({ kind: 'gantry', mat: 'metal', look: 'prop', x, z: -12.2, r: 0.4, h: 6.4, geos: leg, colliders: [colliders.add(x, -12.2, 0.3, 'trunk')], hp: G.hp, topples: true, cover: false, lift: 0, broken: { geos: carveAll([[cyl(0.22, 0.2, 0.6, x, 0, -12.2, 6), DARK_METAL]], 0.7), r: 0.2 }, wreck: false });
    // the beam: a lattice of two chords and the sign boards lying on the road (from z -9.5 to 3.5)
    const z0 = -9.5, z1 = 3.5, len = z1 - z0, zm = (z0 + z1) / 2;
    const raw = [[box(0.16, 0.16, len, -0.35, 0.05, 0), L.metal], [box(0.16, 0.16, len, 0.35, 0.05, 0), L.metal], [box(0.16, 0.16, len, 0, 0.75, 0), L.metal]];
    for (let k = 0; k < 7; k++) {
      const g = box(0.08, 0.85, 0.08, 0, 0.05, -len / 2 + 0.9 + k * (len - 1.8) / 6);
      g.rotateX(0.5 * (k % 2 ? 1 : -1));
      raw.push([g, L.metal]);
    }
    raw.push([box(2.6, 0.08, 3.4, 1.7, 0.02, -2.8), [0.05, 0.09, 0.065]], [box(2.4, 0.08, 3.0, 1.6, 0.02, 2.4), [0.06, 0.06, 0.08]]);
    const beam = place(carveAll(raw, 0.85), x, zm, 0.06);
    const cs = [-5, -1.7, 1.6, 4.9].map((dz) => colliders.add(x + Math.sin(0.06) * dz, zm + dz, 0.5, 'trunk'));
    piece({ kind: 'gantryBeam', mat: 'metal', look: 'prop', x, z: zm, r: 2.2, h: 0.95, geos: beam, colliders: cs, hp: G.hp, topples: false, cover: true, lift: 0, broken: { geos: carveAll([[box(0.5, 0.18, len * 0.8, x, 0, zm), DARK_METAL]], 0.7), r: 0 }, wreck: false });
  }

  // ---- the bus on its side in the west street's south lane
  {
    const x = -22, z = 6.8, b = buildBus(L, x, z, 0, 17);
    const cs = [-4.2, -1.4, 1.4, 4.2].map((dx) => colliders.add(x + dx, z, 1.45, 'stone'));
    piece({ kind: 'bus', mat: 'metal', look: 'prop', x, z, r: VEIL.bus.r, h: 2.5, geos: b.geos, colliders: cs, hp: VEIL.bus.hp, weight: 2.6, topples: false, burns: true, cover: true, lift: 0, broken: { geos: b.ruin, r: 0 }, wreck: false }, 64);
  }

  // ---- the water tank (north-west corner)
  {
    const x = -12.2, z = -13.6, t = buildTank(L, x, z, 23);
    piece({ kind: 'tank', mat: 'metal', look: 'prop', x, z, r: VEIL.tank.r, h: VEIL.tank.h, geos: t.geos, colliders: [colliders.add(x, z, 1.1, 'stone')], hp: VEIL.tank.hp, weight: 1.6, topples: true, cover: true, lift: 0, broken: { geos: t.ruin, r: 0 }, wreck: true });
  }

  // ---- the cars (8, lift 1), round the ring: one is always within 12 m of the fight
  const CARS = [[-10.4, 3.2, 0.2, 'up'], [11.6, -2.4, 1.9, 'roof'], [-4.2, -11.8, 1.4, 'crushed'], [4.6, 13.4, -0.4, 'up'], [-7, 12.2, 2.6, 'side'], [12.8, 6.8, 0.9, 'up'], [-12.4, -6.6, 1.1, 'side'], [7.6, -11.2, -1.3, 'up']];
  CARS.forEach(([x, z, ry, pose], k) => {
    const c = buildCar(x, z, ry, mul(CAR_COLS[k % CAR_COLS.length], opt === 'c' ? 0.75 : 1), pose, k * 13 + 1);
    const ax = Math.sin(ry), az = Math.cos(ry), o = VEIL.car.len / 2 - VEIL.car.cr;
    const cs = [colliders.add(x + ax * o, z + az * o, VEIL.car.cr, 'stone'), colliders.add(x - ax * o, z - az * o, VEIL.car.cr, 'stone')];
    piece({ kind: 'car', mat: 'metal', look: 'prop', x, z, r: VEIL.car.r, h: c.h, geos: c.geos, colliders: cs, hp: VEIL.car.hp, weight: 1.4, topples: false, burns: true, cover: true, lift: 1, broken: { geos: c.wreck, r: 0 }, wreck: false });
  });

  // ---- road slabs torn up round the middle (6, lift 1): what his pull drags and throws first
  const SLABS = [[-6.8, 1.2, 0.4], [6.9, 3.6, 1.8], [1.6, -7.4, 2.4], [-2.6, 8.2, 0.9], [-7.6, -5.8, 2.9], [8.4, -5.4, 0.2]];
  SLABS.forEach(([x, z, ry], k) => {
    const g = buildRoadSlab(L, x, z, ry, rng, k % 2 === 0);
    piece({ kind: 'slab', mat: 'stone', look: 'prop', x, z, r: VEIL.slab.r, h: geosHeight(g), geos: g, colliders: [colliders.add(x, z, VEIL.slab.cr, 'stone')], hp: VEIL.slab.hp, weight: 1.2, topples: false, cover: false, lift: 1, wreck: false });
  });

  // ---- rubble and rebar heaps
  const HEAPS = [[-5.8, -15.2, 1.5], [5.6, -15.6, 1.3], [-18.5, -3.2, 1.6], [21.5, -4.8, 1.4], [-6.6, 17.2, 1.3], [7.4, 18.6, 1.5], [-21.5, 12.5, 1.4]];
  HEAPS.forEach(([x, z, r], k) => {
    const h = buildHeap(L, rng, x, z, r, k);
    piece({ kind: 'heap', mat: 'stone', look: 'prop', x, z, r: r * 1.1, h: h.h, geos: h.geos, colliders: [colliders.add(x, z, r * 0.8, 'stone')], hp: VEIL.heap.hp, weight: 1.6, topples: false, cover: true, lift: 0, broken: { geos: buildRubble(br, x, z, r * 0.6, { col: mul(L.concrete, 0.7), h: 0.3 }), r: 0 }, wreck: false });
  });

  // ---- low debris across the plain (the rubble the fight left before he came): small, walked round
  const DEBRIS = [[-3.2, -18.4], [14.6, -9.4], [-15.8, 4.4], [16.4, 2.2], [-9.4, 16.6], [10.8, 15.4], [-17.2, -8.6], [2.6, 19.6], [-1.8, 13.2], [19.4, 9.8]];
  DEBRIS.forEach(([x, z], k) => {
    const r = 0.55 + 0.35 * hash2(k * 3.1, 7.7);
    const geos = buildRubble(rng, x, z, r, { col: mul(L.concrete, 0.85), h: 0.35 + 0.2 * hash2(k, 1.3) });
    piece({ kind: 'debris', mat: 'stone', look: 'prop', x, z, r: r * 1.4, h: geosHeight(geos), geos, colliders: [colliders.add(x, z, r * 0.7, 'stone')], hp: 1.2, topples: false, cover: false, lift: 0, wreck: false }, 16);
  });

  // ---- lamp posts (three still burn: straight, their heads lit; the rest bent over, dark) and signal poles
  const LAMPS = [[-11.3, -11.4, true], [11.4, -11.6, true], [21, -11.2, true], [-21.5, -11.2, false, 0.5, 2.2, 0.6, 0.8], [11.6, 11.8, false, 1.1, 1.6, -0.7, 0.7], [-11.4, 11.6, false, 1.25, 1.4, 0.6, 0.8]];
  for (const [x, z, lit, bend = 0, by = 0, bx = 0, bz = 1] of LAMPS) {
    const l = Math.hypot(bx, bz) || 1;
    const g = buildLamp(L, x, z, lit, bend, by, bx / l, bz / l);
    const def = { kind: 'lamp', mat: 'metal', look: 'prop', x, z, r: VEIL.lamp.r, h: g.h, geos: g.geos, colliders: [colliders.add(x, z, 0.16, 'trunk')], hp: VEIL.lamp.hp, topples: true, cover: false, lift: 0, light: true, broken: { geos: g.stub, r: 0.12 }, wreck: false };
    if (lit) def.lamp = { y: VEIL.lamp.h + 0.16, r: 0.2 };
    piece(def, 24);
  }
  const SIGNALS = [[10.9, -13.8, 0], [-9.6, -13.9, 0.35, -0.5, 0.8], [13.9, 10.8, 1.0, -0.6, -0.8], [-13.8, 10.9, 0]];
  for (const [x, z, bend, bx = 0, bz = 1] of SIGNALS) {
    const l = Math.hypot(bx, bz) || 1;
    const g = buildSignal(L, x, z, bend, bx / l, bz / l);
    piece({ kind: 'signal', mat: 'metal', look: 'prop', x, z, r: VEIL.signal.r, h: g.h, geos: g.geos, colliders: [colliders.add(x, z, 0.14, 'trunk')], hp: VEIL.signal.hp, topples: true, cover: false, lift: 0, light: true, broken: { geos: g.stub, r: 0.1 }, wreck: false }, 24);
  }

  // ---- the void's pieces: the crossing's floating in the dark (raised: y0; out of the world until then)
  const FLOATS = [['floatSlab', -7.2, -3.4, 2.2], ['floatSlab', 6.6, -6, 3.0], ['floatSlab', -4.4, 8.4, 1.7], ['floatCar', 9.6, 4.8, 2.6], ['floatCorner', -11, 5.8, 3.4], ['floatSlab', 2.2, -10.4, 2.0], ['floatCar', -9.4, -9.6, 3.8], ['floatSlab', 11.4, -9.4, 1.6]];
  const fr = mulberry32(CONFIG.seed + 6209);
  for (const [kind, x, z, y0] of FLOATS) {
    const g = buildFloat(L, kind, x, z, y0, fr);
    const def = piece({ kind, scene: 'void', mat: kind === 'floatCar' ? 'metal' : 'stone', look: 'prop', x, z, r: kind === 'floatSlab' ? 1.15 : 1.5, y0, h: geosHeight(g) - y0, geos: g, colliders: [], hp: VEIL.float.hp, weight: 1.2, topples: true, cover: false, lift: 1, fallOff: 0.6, fallT: 0.8, wreck: false, float: true });
    floats.push(def);
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
  meshes.push(fallenRuns.finish(stoneMat, 'fallenTower'), fallenRuin.finish(stoneMat, 'fallenTowerRuin'));
  const slabMat = createCarvedGlyphMaterial(U, { ...SLAB_LOOK, ...L.floorLook, viewPitch: CONFIG.camera.pitch, dp: { k: 0.9, sat: 0.7, top: 0.04, rimW: 0, wet: (L.wet ?? 0) * 1.6 } });
  const slabMesh = add(slabGeos, slabMat, 'asphalt');
  group.add(...meshes);
  markCaster(group);
  // (the fallen tower's ruins: hidden until a section shows in them)
  const fr2 = group.getObjectByName('fallenTowerRuin');
  if (fr2) fr2.userData.foldAway = true;
  breakables.push(...breakableFloor({ slabs: floor, slabGeos, slabMesh, mat: slabMat, rng: mulberry32(CONFIG.seed + 7209), group, earth: [0.045, 0.043, 0.045] }).defs);
  addSlabRims(group, slabMat);

  const light = makeLight(U, L, VOIDS[vopt]);
  const scenes = makeScenes(light);
  const air = makeAir(scenes, VOIDS[vopt], floats);
  const ambience = makeAmbience({ scenes, light, air, floats, screens, L, opt });
  const S = CONFIG.world.dragonSleep ?? C.wait, L1 = L.light[1];
  return {
    group, treeSpots: [], bare, slabs, nest: { x: S.x, z: S.z }, bonfire: { x: bf.x, z: bf.z },
    material: stoneMat, stoneMaterial: stoneMat, slabMaterial: slabMat,
    breakables, scenes, option: opt, voidOption: vopt,
    scarInk: [0.008, 0.008, 0.011],
    floorCarry: L.asphalt,
    sky: { moonColor: [...L1.moon], moonDir: [...L.moonDir], ambient: [...L1.ambient], fogColor: [...L1.fog], fogNear: L1.near, fogFar: L1.far },
    grass: { density: () => 0 },
    ambience,
    /** The light by his phase (1 cold and dim, 2 his eyes' blue, 3 the void). */
    setPhase: (n) => light.setPhase(n),
    get air() {
      return air.state;
    },
    floats,
    CROSSING, VEIL,
  };
}

// ---------------------------------------------------------------- the light (eased; the morph blends it)
function makeLight(U, L, V) {
  const L1 = L.light[1];
  const now = { moon: [...L1.moon], ambient: [...L1.ambient], fog: [...L1.fog], near: L1.near, far: L1.far };
  const st = { phase: 1, dirty: true, scene: 'crossing', morph: null, w: 1 };
  const of = (scene) => (scene === 'void' ? V.light : L.light[st.phase] ?? L1);
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
    now,
    setPhase(n) {
      const k = Math.min(3, Math.max(1, Math.round(fin(Number(n), 1))));
      st.phase = k;
      st.dirty = true;
      return k;
    },
    /** the scene the light follows (a morph: from → to by w, set each frame by the scenes) */
    scene(id) {
      st.scene = id;
      st.dirty = true;
    },
    blend(from, to, w) {
      st.morph = st.morph ?? { from: 'crossing', to: 'void' };
      st.morph.from = from;
      st.morph.to = to;
      st.w = w;
      st.dirty = true;
    },
    endBlend() {
      st.morph = null;
      st.dirty = true;
    },
    /** at once (a reset) */
    snap() {
      const T = of(st.scene);
      for (const key of ['moon', 'ambient', 'fog']) for (let i = 0; i < 3; i++) now[key][i] = T[key][i];
      now.near = T.near;
      now.far = T.far;
      write();
      st.dirty = false;
    },
    update(dt) {
      if (!st.dirty) return;
      if (st.morph) {
        // the front: the two scenes' light by how far it has run
        const A = of(st.morph.from), B = of(st.morph.to), w = st.w;
        for (const key of ['moon', 'ambient', 'fog']) for (let i = 0; i < 3; i++) now[key][i] = A[key][i] + (B[key][i] - A[key][i]) * w;
        now.near = A.near + (B.near - A.near) * w;
        now.far = A.far + (B.far - A.far) * w;
        write();
        return;
      }
      const T = of(st.scene), a = 1 - Math.exp(-Math.max(0, fin(dt)) * 2.5);
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

// ---------------------------------------------------------------- the scenes (a front from his point)
const INTACT = 0, BROKEN = 2, HELD = 3, FLYING = 4;
const DIGITS = '0123456789';

function makeScenes(light) {
  let game = null;
  const home = SCENES[0];
  const pool = [], q = [];
  const rec = (b, d, on) => {
    const r = pool[q.length] ?? (pool[q.length] = { b: null, d: 0, on: false });
    r.b = b;
    r.d = d;
    r.on = on;
    q.push(r);
  };
  const byD = (a, b) => a.d - b.d;
  const pc = [1, 1, 1], pe = [0, 0, 0];
  const p = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, size: 0.2, sizeEnd: 0.12, glyph: DIGITS, color: pc, colorEnd: pe, alpha: 1, alphaEnd: 0, gravity: 0.7, drag: 0.9, spin: 0, rot: 0, flicker: 0.15 };
  const S = {
    ids: SCENES,
    now: home,
    k: 1,
    /** how each city piece was LEFT when the void came: 'whole' | 'stub' | 'gone' (the way back reads it) */
    left: new Map(),
    m: { on: false, from: home, to: home, x: 0, z: 0, t: 0, R: 1, v: 18, i: 0, front: 0 },
    _pieces: null,
    stat: { morphs: 0, burst: 0, stumps: 0, back: 0 },
    bind(g) {
      game = g;
    },
    _des() {
      return game?.world?.destructibles ?? null;
    },
    /** The floor's marks follow the scene: those not made in the void hidden in it (out to r from the front's
     *  centre; Infinity: all), shown again in the city (scars.shade / scars.layer). */
    _marks(r) {
      // (the tuning pass, the owner: the bonfire goes out in the void, flame, light, embers and sound, and
      // burns again on the way back: when the front passes it, as it does the city's pieces)
      const A = game?.world?.atmosphere, bf = game?.world?.bonfire ?? CROSSING.bonfire;
      const lit = this.now === home;
      if (A?.setBonfireLit && A.bonfireLit !== lit && Math.hypot(bf.x - fin(this.m.x), bf.z - fin(this.m.z)) <= r) A.setBonfireLit(lit);
      const SC = game?.world?.scars;
      if (!SC?.shade) return;
      SC.layer = this.now;
      SC.shade(this.m.x, this.m.z, r, this.now !== home, this.now === home ? null : this.now);
    },
    _index() {
      if (this._pieces) return true;
      const D = this._des();
      if (!D?.list?.length) return false;
      this._pieces = D.list.filter((b) => b.scene !== null);
      return true;
    },
    /** A piece lets go: its letters rise as dim digits into the dark (fx.alpha). */
    burst(b) {
      const fx = game?.fx?.alpha, s = b.def?.shed;
      if (!fx || !s?.length) return;
      const D = this._des();
      const n = Math.max(3, Math.round((s.length / 6) * (D?.q ?? 1)));
      for (let i = 0; i < n; i++) {
        const k = i * 6;
        const h = hash2(k * 1.7 + b.id, this.m.t * 13 + i);
        p.x = s[k];
        p.y = Math.max(0.1, s[k + 1]);
        p.z = s[k + 2];
        const ox = s[k] - b.x, oz = s[k + 2] - b.z, ol = Math.hypot(ox, oz) || 1;
        p.vx = (ox / ol) * (0.2 + 0.5 * h);
        p.vz = (oz / ol) * (0.2 + 0.5 * h);
        p.vy = 0.3 + 0.9 * hash2(i * 3.3, b.id * 0.7);
        p.life = 0.8 + 0.7 * h;
        const mx = Math.max(s[k + 3], s[k + 4], s[k + 5], 0.02), g = Math.min(2.2, 0.45 / mx);
        pc[0] = s[k + 3] * g; pc[1] = s[k + 4] * g; pc[2] = s[k + 5] * g;
        pe[0] = pc[0] * 0.15; pe[1] = pc[1] * 0.15; pe[2] = pc[2] * 0.2;
        fx.spawn(p);
      }
      this.stat.burst++;
    },
    /** Back to its stump, quietly (it was broken when the void came): whole, then its body out, its stub in. */
    _stump(b) {
      const D = this._des(), C = game?.world?.colliders;
      D.present(b, true);
      if (!b.stub) return;
      for (const c of b.colliders) C?.remove?.(c);
      b.state = BROKEN;
      b.hp = 0;
      b.body.visible = false;
      if (b.ranged) b.touched = true;
      D._showStub?.(b);
      D._place?.(b);
      this.stat.stumps++;
    },
    _step(e, fx) {
      const D = this._des(), b = e.b;
      if (!D) return;
      if (!e.on) {
        if (!b.absent) {
          if (fx && b.state === INTACT) this.burst(b);
          D.present(b, false);
        }
        return;
      }
      if (b.scene === home) {
        const how = this.left.get(b) ?? 'whole';
        if (how === 'gone') return;
        if (!b.absent) D.present(b, false);
        if (how === 'stub') this._stump(b);
        else D.present(b, true);
        this.stat.back++;
      } else {
        if (!b.absent) D.present(b, false);
        D.present(b, true);
      }
      this._clear(b);
    },
    /** An actor standing where piece b printed is pushed out of its circles (never trapped). */
    _clear(b) {
      const W = game?.world;
      const cs = b.state === BROKEN ? (b.stubCollider ? [b.stubCollider] : []) : b.colliders;
      for (const a of [game?.player, game?.dragon]) {
        const pos = a?.position;
        if (!pos || !cs?.length) continue;
        const rad = fin(a.radius, a.T?.radius ?? 0.5);
        let moved = false;
        for (const c of cs) {
          let dx = pos.x - c.x, dz = pos.z - c.z;
          const min = c.r + rad + 0.02;
          let d = Math.hypot(dx, dz);
          if (d >= min) continue;
          if (d < 1e-3) {
            dx = -c.x;
            dz = -c.z + 1e-3;
            d = Math.hypot(dx, dz);
          }
          pos.x = c.x + (dx / d) * min;
          pos.z = c.z + (dz / d) * min;
          moved = true;
        }
        if (moved) {
          const bound = a === game.player ? CONFIG.world.playerBound : CONFIG.world.dragonBound;
          W?.resolve?.(pos, rad, fin(bound, Infinity));
        }
      }
    },
    _finish() {
      const m = this.m;
      if (!m.on) return;
      for (; m.i < q.length; m.i++) this._step(q[m.i], false);
      m.on = false;
      this.k = 1;
      this._marks(Infinity);
      light.endBlend();
    },
    /** What each city piece is as the void comes (the way back brings it back so). */
    _record() {
      this.left.clear();
      for (const b of this._pieces) {
        if (b.scene !== home || b.absent) continue;
        const how = b.state === INTACT ? 'whole' : b.state === BROKEN && b.stub ? 'stub' : 'gone';
        this.left.set(b, how);
      }
    },
    to(id, o = null) {
      if (!SCENES.includes(id)) return false;
      if (!this._index()) {
        if (id === this.now) return false;
        this.now = id;
        this._marks(Infinity);
        light.scene(id);
        return true;
      }
      if (this.m.on) this._finish();
      if (id === this.now) return false;
      const D = this._des(), from = this.now;
      if (from === home) this._record();
      this.now = id;
      D.sceneNow = id;
      const m = this.m;
      m.x = fin(o?.x);
      m.z = fin(o?.z);
      q.length = 0;
      let R = 0;
      for (const b of this._pieces) {
        const want = b.scene === id;
        if (!want && b.absent) continue;
        if (want && b.scene === home && (this.left.get(b) ?? 'whole') === 'gone') continue;
        if (want && !b.absent && b.state === INTACT) continue;
        const d = Math.hypot(b.x - m.x, b.z - m.z);
        rec(b, d, want);
        if (d > R) R = d;
      }
      q.sort(byD);
      const speed = Math.max(1, fin(o?.speed, VEIL.morph.speed));
      m.R = Math.max(R + 1, 4);
      m.v = Math.max(speed, m.R / (VEIL.morph.max - 0.05));
      m.from = from;
      m.to = id;
      m.t = 0;
      m.i = 0;
      m.front = 0;
      m.on = true;
      this.k = 0;
      this._marks(0);
      light.scene(id);
      light.blend(from, id, 0);
      this.stat.morphs++;
      game?.events?.emit?.('world:scene', { id, x: m.x, z: m.z });
      return true;
    },
    snap(id) {
      if (!SCENES.includes(id)) return false;
      this._finish();
      const from = this.now;
      this.now = id;
      this.m.from = this.m.to = id;
      this.k = 1;
      this._marks(Infinity);
      light.scene(id);
      light.snap();
      if (!this._index()) return true;
      if (from === home && id !== home) this._record();
      const D = this._des();
      D.sceneNow = id;
      for (const b of this._pieces) {
        const want = b.scene === id;
        if (!want) {
          if (!b.absent) D.present(b, false);
          continue;
        }
        if (!b.absent && b.state === INTACT) continue;
        this._step({ b, on: true }, false);
      }
      return true;
    },
    reset() {
      // (world.restore has put the pieces back as the destructibles' reset leaves them: the home scene's)
      this.m.on = false;
      this.m.from = this.m.to = home;
      q.length = 0;
      this.now = home;
      this.k = 1;
      this._marks(Infinity);
      this.left.clear();
      const D = this._des();
      if (D && this._index()) {
        D.sceneNow = home;
        for (const b of this._pieces) if ((b.scene === home) === !!b.absent) D.present(b, b.scene === home);
      }
      light.endBlend();
      light.scene(home);
    },
    hold() {},
    stutter() {},
    get morphing() {
      return this.m.on;
    },
    update(dt) {
      if (!(dt >= 0)) dt = 0;
      this._index();
      const m = this.m;
      if (!m.on) return;
      m.t += dt;
      m.front = Math.min(m.R, m.t * m.v);
      while (m.i < q.length && q[m.i].d <= m.front) this._step(q[m.i++], true);
      // the old scene's wreckage sinks as the front passes it
      const live = this._des()?.wreck?.live;
      if (live) for (const e of live) if (e.sink <= 0 && Math.hypot(e.x - m.x, e.z - m.z) <= m.front) e.sink = 1e-3;
      this.k = m.front / m.R;
      this._marks(m.front);
      light.blend(m.from, m.to, smooth(this.k));
      if (m.front >= m.R && m.i >= q.length) {
        m.on = false;
        this.k = 1;
        this._marks(Infinity);
        light.endBlend();
      }
    },
  };
  return S;
}

// ---------------------------------------------------------------- the void's air (LetterBatch)
/**
 * The stars of the void: many tiny faint letters in clumps and drifts (STYLE.md "The living world": the
 * owner's rule for what lives in the air), turning slowly round the place the void opened from; kept off
 * the floor round the fight (`AIR.keep`). b: one great pale ring of letters lying on the floor round it,
 * its far side fading into the black; c: the stars fall slowly as fine streaks, a line of light where the
 * floor ends. Its own seeded stream (never Math.random). Drawn only while the void stands (and through the
 * front: its strength follows the morph).
 */
const NONE_C = Object.freeze([]);
function makeAir(scenes, V, floats = []) {
  let seed = 0x5b1d3e77;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  let batch = null, game = null;
  const A = AIR;
  // the clumps: centre (angle, radius, height), turn speed, size, letters (offsets, glyph, tone)
  const clumps = [];
  const nC = A.clumps + A.drifts;
  for (let i = 0; i < nC; i++) {
    const drift = i >= A.clumps;
    const n = Math.round(drift ? A.driftPer[0] + rnd() * (A.driftPer[1] - A.driftPer[0]) : A.per[0] + rnd() * (A.per[1] - A.per[0]));
    const L = [];
    for (let j = 0; j < n; j++) {
      // a clump: a soft ball; a drift: a long thin arc along its way round
      const u = drift ? (j / n - 0.5) * (3.5 + rnd() * 3) : (rnd() - 0.5) * 1.4 * (rnd() + 0.4);
      L.push({ u, w: (rnd() - 0.5) * (drift ? 0.5 : 1.3), v: (rnd() - 0.5) * (drift ? 0.4 : 1.0), g: 0, k: 0.35 + rnd() * 0.65, ph: rnd() * TAU });
    }
    clumps.push({ a: rnd() * TAU, r: A.r[0] + Math.sqrt(rnd()) * (A.r[1] - A.r[0]), y: A.y[0] + rnd() * (A.y[1] - A.y[0]), s: (A.spin[0] + rnd() * (A.spin[1] - A.spin[0])) * (rnd() < 0.8 ? 1 : -1), bob: rnd() * TAU, drift, L });
  }
  const ringPh = [];
  for (let i = 0; i < A.ring.n; i++) ringPh.push({ j: (rnd() - 0.5) * 0.35, k: 0.4 + rnd() * 0.6, g: 0, ph: rnd() * TAU });
  const edge = [];
  for (let i = 0; i < A.fall.edgeN; i++) edge.push({ j: (rnd() - 0.5) * 0.3, k: 0.5 + rnd() * 0.5, g: 0 });
  const col = [0, 0, 0];
  const st = { on: false, count: 0, budget: A.max, k: 0, cx: 0, cz: 0, t: 0, fall: 0, grit: 0, ms: 0, fp: null };
  const sp = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 8, col: 0, color: [0, 0, 0], colorEnd: [0, 0, 0], alpha: 0.4, alphaEnd: 0, drag: 0, gravity: 0, flicker: 0 };
  return {
    get state() {
      return { on: st.on, count: st.count, budget: st.budget, k: st.k, ms: st.ms };
    },
    setup(g) {
      game = g;
      if (!g?.pipeline?.registerParticles || !g?.U) return;
      // (three names its objects with a random uuid: a quiet stream of its own, never Math.random)
      const mr = Math.random;
      let qs = 0x2c9e1b55;
      const quiet = () => (qs = (Math.imul(qs, 1664525) + 1013904223) >>> 0) / 4294967296;
      Math.random = quiet;
      try {
        batch = new LetterBatch(g, A.max, A.chars, { additive: true, spawned: 600, rand: quiet });
      } finally {
        Math.random = mr;
      }
      for (const c of clumps) for (const l of c.L) l.g = batch.col(A.glyphs[Math.floor(rnd() * A.glyphs.length)]);
      for (const r of ringPh) r.g = batch.col(rnd() < 0.6 ? '-' : rnd() < 0.5 ? '.' : '~') || batch.col('.');
      for (const e of edge) e.g = batch.col(rnd() < 0.7 ? '-' : '.') || batch.col('.');
      g.pipeline.registerParticles(batch);
    },
    setVisible(on) {
      if (batch?.mesh) batch.mesh.visible = !!on;
    },
    reset() {
      st.on = false;
      st.k = 0;
      batch?.empty?.();
    },
    update(dt) {
      if (!batch) return;
      const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
      const inVoid = scenes.now === 'void';
      const want = inVoid ? (scenes.m.on ? scenes.k : 1) : scenes.m.on && scenes.m.from === 'void' ? 1 - scenes.k : 0;
      st.k = want;
      if (!(want > 0.001)) {
        if (st.on) {
          batch.empty();
          st.on = false;
          st.count = 0;
        }
        return;
      }
      if (!st.on) {
        st.on = true;
        st.cx = scenes.m.x;
        st.cz = scenes.m.z;
      }
      st.t += dt;
      const low = game?.settings?.quality === 0;
      st.budget = (low ? A.low : A.max) - 320; // (the rest: what falls and trickles, spawned)
      const f = game?.U?.uFocus?.value ?? { x: st.cx, z: st.cz };
      const fx = f.x, fz = f.z, t = st.t;
      batch.begin();
      let used = 0;
      // b: the great pale ring on the floor round where it opened, its far side lost in the black
      if (V.ring) {
        const R = A.ring;
        for (let i = 0; i < ringPh.length && used < st.budget; i++) {
          const r = ringPh[i], a = (i / ringPh.length) * TAU + t * 0.01;
          const x = st.cx + Math.sin(a) * (R.r + r.j), z = st.cz + Math.cos(a) * (R.r + r.j);
          const d = Math.hypot(x - fx, z - fz), fade = 1 - clamp((d - R.fade[0]) / (R.fade[1] - R.fade[0]), 0, 1);
          const k = want * fade * r.k * (0.8 + 0.2 * Math.sin(t * 0.7 + r.ph));
          if (!(k > 0.01)) continue;
          col[0] = R.color[0] * k; col[1] = R.color[1] * k; col[2] = R.color[2] * k;
          batch.put(x, R.y, z, 0, r.g, 0, col, R.alpha * k);
          used++;
        }
      }
      // c: the line of light where the floor goes black
      if (V.fall) {
        // (where the floor goes black: between the fog's near and far, round the focus)
        const F = A.fall, fn = game?.U?.uFogNear?.value ?? 5, ff = game?.U?.uFogFar?.value ?? 13, er = fn + (ff - fn) * F.edge;
        for (let i = 0; i < edge.length && used < st.budget; i++) {
          const e = edge[i], a = (i / edge.length) * TAU;
          const x = fx + Math.sin(a) * (er + e.j), z = fz + Math.cos(a) * (er + e.j);
          const k = want * e.k;
          col[0] = F.edgeColor[0] * k; col[1] = F.edgeColor[1] * k; col[2] = F.edgeColor[2] * k;
          batch.put(x, 0.22, z, 0, e.g, 0, col, 0.85 * k);
          used++;
        }
      }
      // the stars: clumps and drifts turning round where the void opened (c: they fall instead, below)
      for (const c of V.fall ? NONE_C : clumps) {
        const a = c.a + c.s * t, cxp = st.cx + Math.sin(a) * c.r, czp = st.cz + Math.cos(a) * c.r, cy = c.y + 0.35 * Math.sin(t * 0.21 + c.bob);
        const tx = Math.cos(a), tz = -Math.sin(a); // its way round
        for (const l of c.L) {
          if (used >= st.budget) break;
          const x = cxp + tx * l.u + Math.sin(a) * l.w, z = czp + tz * l.u + Math.cos(a) * l.w, y = cy + l.v;
          // (kept off the floor round the fight: nothing over the tells)
          const dF = Math.hypot(x - fx, z - fz);
          let k = l.k * want * (1 - A.twinkle * (0.5 + 0.5 * Math.sin(t * (1.3 + l.k) + l.ph)));
          if (dF < A.keep + 3 && y < 3.2) k *= clamp((dF - A.keep) / 3, 0, 1);
          if (!(k > 0.01) || y < 0.05) continue;
          const al = A.alpha[0] + (A.alpha[1] - A.alpha[0]) * l.k;
          col[0] = A.color[0] * k; col[1] = A.color[1] * k; col[2] = A.color[2] * k;
          batch.put(x, y, z, 0, l.g, 0, col, al * k);
          used++;
        }
      }
      // c: the line of light where the floor ends (round the focus, past the fog), the stars falling as streaks
      if (V.fall) {
        const F = A.fall;
        st.fall += dt * F.rate * want * (low ? 0.5 : 1);
        while (st.fall >= 1) {
          st.fall -= 1;
          const a = rnd() * TAU, r = A.r[0] + rnd() * (A.r[1] - A.r[0]);
          sp.x = st.cx + Math.sin(a) * r;
          sp.z = st.cz + Math.cos(a) * r;
          sp.y = 6 + rnd() * 5;
          sp.vy = -(F.speed[0] + rnd() * (F.speed[1] - F.speed[0]));
          sp.vx = sp.vz = 0;
          sp.life = F.life[0] + rnd() * (F.life[1] - F.life[0]);
          sp.col = batch.col(rnd() < 0.6 ? "'" : rnd() < 0.5 ? '|' : '.') || batch.col('.');
          const k = 0.5 + rnd() * 0.5;
          sp.color[0] = A.color[0] * k; sp.color[1] = A.color[1] * k; sp.color[2] = A.color[2] * k;
          sp.colorEnd[0] = sp.color[0] * 0.3; sp.colorEnd[1] = sp.color[1] * 0.3; sp.colorEnd[2] = sp.color[2] * 0.4;
          sp.alpha = F.alpha * k;
          sp.alphaEnd = 0;
          batch.spawn(sp);
        }
      }
      // grit trickling off the floating pieces' undersides (what tells they float, seen from above)
      const D = game?.world?.destructibles, G = A.grit;
      if (D?.list && inVoid) {
        st.grit += dt * G.rate * floats.length * want * (low ? 0.5 : 1);
        while (st.grit >= 1) {
          st.grit -= 1;
          const def = floats[Math.floor(rnd() * floats.length)];
          const b = def ? (st.fp ?? (st.fp = new Map(D.list.filter((o) => o.def?.float).map((o) => [o.def, o])))).get(def) : null;
          if (!b || b.absent || b.state !== INTACT) continue;
          const a = rnd() * TAU, r = rnd() * b.r * 0.8;
          sp.x = b.x + Math.cos(a) * r;
          sp.z = b.z + Math.sin(a) * r;
          sp.y = b.y0 + (b.pivot?.position?.y ?? 0) - 0.05;
          sp.vx = sp.vz = 0;
          sp.vy = -(G.speed[0] + rnd() * (G.speed[1] - G.speed[0]));
          sp.life = G.life[0] + rnd() * (G.life[1] - G.life[0]);
          sp.col = batch.col(rnd() < 0.5 ? '.' : rnd() < 0.5 ? ',' : "'") || batch.col('.');
          sp.color[0] = G.color[0]; sp.color[1] = G.color[1]; sp.color[2] = G.color[2];
          sp.colorEnd[0] = G.color[0] * 0.3; sp.colorEnd[1] = G.color[1] * 0.3; sp.colorEnd[2] = G.color[2] * 0.3;
          sp.alpha = G.alpha;
          sp.alphaEnd = 0;
          sp.gravity = -0.6;
          batch.spawn(sp);
          sp.gravity = 0;
        }
      }
      batch.flow(dt, t);
      batch.end();
      st.count = batch.count;
      if (t0) st.ms = performance.now() - t0;
    },
  };
}

// ---------------------------------------------------------------- the ambience
const blob = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.05, size: 0.4, sizeEnd: 0.4, heat: 0.4, heatEnd: 0.4, drag: 0, gravity: 0, kind: 'steel' };

function makeAmbience({ scenes, light, air, floats, screens, L, opt }) {
  let game = null;
  let seed = 0x6d2b79f5;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const st = { t: 0, hold: 0, warm: [], fp: null, flash: 0 };
  const pieceOf = (def) => {
    const D = game?.world?.destructibles;
    if (!D?.list) return null;
    if (!st.fp) {
      st.fp = new Map();
      for (const b of D.list) if (b.def) st.fp.set(b.def, b);
    }
    return st.fp.get(def) ?? null;
  };
  const bobs = floats.map((def, i) => ({ def, b: null, ph: (i * 2.399) % TAU, per: VEIL.float.period[0] + ((i * 0.618) % 1) * (VEIL.float.period[1] - VEIL.float.period[0]), y: 0 }));
  return {
    get state() {
      return { phase: light.st.phase, scene: scenes.now, opt, air: air.state };
    },
    setup(g) {
      game = g;
      scenes.bind(g);
      air.setup(g);
      if (L.warm) {
        // (b) the last sodium lamps: two warm lights by the burning lamps
        for (const [x, z] of [[-11.3, -11.4], [11.4, -11.6]]) st.warm.push(g.lights?.add?.({ x, y: 5, z, color: L.warm, intensity: VEIL.lights.intensity, radius: VEIL.lights.radius, flicker: 0.08 }) ?? null);
      }
      st.fp = null;
      scenes.reset();
      light.snap();
    },
    setVisible(on) {
      air.setVisible(on);
    },
    flare(k = 1) {
      st.flash = Math.max(st.flash, Math.min(1, fin(k)));
    },
    update(dt, g) {
      if (!(dt >= 0)) dt = 0;
      if (g) game = g;
      st.t += dt;
      scenes.update(dt);
      light.update(dt);
      air.update(dt);
      const D = game?.world?.destructibles;
      // the floating pieces bob slowly while they stand in the void (whole steps: the still shadow map
      // redraws only when one has moved)
      if (D && scenes.now === 'void') {
        for (const o of bobs) {
          const b = o.b ?? (o.b = pieceOf(o.def));
          if (!b || b.absent || b.state !== INTACT || !b.pivot) continue;
          const y = VEIL.float.bob * Math.sin((st.t / o.per) * TAU + o.ph);
          if (Math.abs(y - o.y) < VEIL.float.step) continue;
          o.y = y;
          b.pivot.position.y = y;
          D._place?.(b);
        }
      }
      const inCity = scenes.now === 'crossing' && !scenes.m.on;
      for (const Lg of st.warm) if (Lg) Lg.intensity = inCity && light.st.phase < 3 ? VEIL.lights.intensity * (light.st.phase === 2 ? 0.6 : 1) : 0;
      // (b) the dead screens' glow: a faint flickering rectangle of steel heat on two tower bases
      const F = game?.fx?.fire;
      if (F && screens.length && inCity && light.st.phase < 3) {
        st.hold -= dt;
        let life = 0;
        if (!(st.hold > 0)) {
          life = Math.max(0.011, dt * 1.5);
          st.hold = life - dt;
        }
        if (life > 0) {
          blob.life = life;
          const q = D?.q ?? 1, per = Math.round(18 * q);
          for (const e of screens) {
            if (!e.base) e.base = D?.list?.find((b) => b.kind === 'towerBase' && Math.abs(b.x - e.x) < 0.1) ?? null;
            if (e.base && (e.base.absent || e.base.state !== INTACT)) continue;
            for (let i = 0; i < per; i++) {
              if (rnd() < 0.35) continue;
              const u = rnd() - 0.5, v = rnd();
              blob.x = e.x + e.ux * u * e.w;
              blob.y = e.y0 + v * e.h;
              blob.z = e.z + e.uz * u * e.w;
              blob.size = blob.sizeEnd = 0.42;
              blob.heat = blob.heatEnd = 0.16 + 0.22 * rnd();
              blob.kind = 'steel';
              F.spawn(blob);
            }
          }
        }
      }
    },
  };
}
