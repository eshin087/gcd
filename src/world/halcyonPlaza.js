import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createPropArtMaterial, createCarvedGlyphMaterial } from '../render/materials.js';
import { markCaster } from '../render/pipeline.js';
import { mulberry32, range, fbm2, hash2 } from '../core/rng.js';
import { CONFIG } from '../core/config.js';
import { TAU } from '../core/math.js';
import { TELL } from '../combat/rules.js';
import { prep, carve, mul, slabGeometry, SLAB_LOOK, buildBonfire, buildRubble, geosHeight, refine, brickEdge } from './forest.js';
import { breakableFloor } from './floor.js';
import { lookOf } from '../entities/enemies/duelist/lookSwitch.js';

// Halcyon Plaza (levels/halcyon.js; ADR-153): a city that has not been built yet, read from its streets.
// The game camera looks down at 58 degrees from the south: the sky and the skyline are never on screen,
// so the city is its road paint, the cars seen from above, the south faces of the towers, the signs and
// the screens. A crossroads: a round plaza of asphalt (r 15) where a north-south avenue meets an
// east-west street; tower fronts on the north-west and north-east corners and at the ends of the street
// (west and east); the south-west corner a parking lot, the south-east a construction lot (low: nothing
// tall stands south of the fight). The innermost 6 m are clear of anything that stops a blade.
//
// Everything that stands in it is in `breakables` (ADR-107, ADR-132; ARCHITECTURE.md "Destruction"):
// the asphalt and the sidewalks (world/floor.js), the cars (they burn, and they EXPLODE: CITY.car), the
// lamp posts, the signs, the shop signs on the towers (raised: `y0`), the screens, the statue of HIM
// (the body `holds` its head; the raised arm is its own piece he can tear off), four two-stage towers
// (a base that `holds` its top), the block fronts behind them, the street furniture. Only the flat
// silhouettes past PLAZA.staticR are merged into a static mesh: never on a path a blow takes (ADR-153).
//
// THE LIGHT (STYLE.md "The city's light"; four kinds of heat in the fire field, each on purpose):
//   steel  the neon tubes and the screens (a pale rectangle of heat with his head and shoulders left dark)
//   void   (re-paletted crimson by his fx: ?glare=) his eyes, his beams, and from phase 2 every screen
//   fire   burning cars and wreckage (the engine's own);  smoke  what is left
// setPhase(n) (the boss calls it, and the reset): 1 pale neon, his face on every screen; 2 the screens
// cut to static, then stand crimson; 3 the neon and the screens dead, only the fires light the street.
// The ambience (atmosphere.js runs it) draws the neon, the screens and the rain, and runs THE CARS'
// FUSES: the destruction system has no on-break callback, so this polls the cars (as the Skybreak Ring
// polls its braziers' posts): a car that breaks burns for a fuse, then explodes (CITY.car).
//
// `?city=a|b|c` (read when the set is built; the owner picks from the sheets): a Neon Rain (night, rain,
// wet dark asphalt, pale neon; the fight is built with it), b Golden Hour (his perfect city at dusk), c
// Lockdown (red emergency light, search beams sweeping the plaza).

/** Layout (world metres; the level's CONFIG.world overrides match these: levels/halcyon.js). */
export const PLAZA = Object.freeze({
  r: 15, // the round plaza of asphalt
  clear: 6, // nothing that stops a blade inside this
  avenue: 7, // the north-south avenue: |x| < avenue
  street: 6, // the east-west street: |z| < street
  reach: 30, // the asphalt runs this far along the streets
  walk: 22, // sidewalk slabs out to here round the plaza (outside the streets)
  cell: 2.5, // asphalt slab pitch
  bound: 34, // the hero's bound round the origin (the towers' colliders hold him in the corners)
  staticR: 36, // past this: flat silhouettes in a static mesh (no blow reaches them)
  bonfire: Object.freeze({ x: 0, z: 25 }),
  wait: Object.freeze({ x: 3.2, z: -8.5, yaw: 0 }), // where he hovers asleep, beside his statue
  statue: Object.freeze({ x: 0, z: -12.5 }),
  entryZ: 16.5, // the south street meets the plaza
  // the four towers: base (ground floors) and top; each base faces the plaza
  towers: Object.freeze([
    Object.freeze({ x: -15, z: -17, w: 9, d: 8 }),
    Object.freeze({ x: 15, z: -17, w: 9, d: 8 }),
    Object.freeze({ x: -23, z: 0, w: 8, d: 9 }),
    Object.freeze({ x: 23, z: 0, w: 8, d: 9 }),
  ]),
  baseH: 6.5, // a tower's ground floors; its top stands on them
  topH: 7,
  lot: Object.freeze({ x: -16, z: 15 }), // the parking lot (south-west)
  site: Object.freeze({ x: 16, z: 15 }), // the construction lot (south-east)
});

/** What the set's pieces do (content is data). Times in seconds, distances in metres, power in POWER
 *  units (breakTuning.js: 1 fells a tree). */
export const CITY = Object.freeze({
  car: Object.freeze({
    hp: 2.4, r: 1.35, h: 1.35, len: 3.6, wid: 1.8,
    fuse: 0.9, // it burns this long once broken, then it goes up
    blast: Object.freeze({ r: 3.2, power: 1.6 }), // world.impact (kind blast, fire)
    hero: Object.freeze({ r: 2.6, damage: 16, knockback: 4 }), // blockable; a roll clears it
    boss: Object.freeze({ r: 3, damage: 90, posture: 24 }), // when the hero (or a returned blow) broke it
    chain: Object.freeze({ max: 2, per: 0.5 }), // at most `max` bangs in `per` s (the rest wait)
  }),
  lamp: Object.freeze({ h: 5.2, r: 0.2, hp: 0.9 }),
  sign: Object.freeze({ h: 4.4, r: 0.3, hp: 1.1, board: Object.freeze([3.2, 4.4]) }),
  shop: Object.freeze({ y0: 3.2, h: 1.1, r: 0.9, hp: 0.8 }),
  screen: Object.freeze({ w: 2.2, h: 5.5, d: 0.5, r: 1.2, hp: 3 }),
  statue: Object.freeze({ hp: 9, r: 1.6, head: 1.2, arm: 3, scale: 1.3 }),
  tower: Object.freeze({ base: 14, top: 4.5, r: 4.5, fallT: 1.6, blocks: 5 }),
  front: Object.freeze({ hp: 6 }),
  // the light: neon blobs a frame (x quality; LOW = QUALITY.LOW 0.5 gets at most `cap`), the rain
  neon: Object.freeze({ cap: 64, max: 300, size: 0.42, heat: 0.5, screenHeat: 0.62, step: 0.62 }),
  rain: Object.freeze({ rate: 110, life: 0.55 }),
  phase2: Object.freeze({ static: 0.7 }), // s of static on the screens before they stand crimson
  lights: Object.freeze({ intensity: 1.1, radius: 9 }),
});

/** The city option now (`?city=`; read when the set is built). */
export const cityOption = () => {
  const o = lookOf('city', 'a', 'a');
  return o === 'b' || o === 'c' ? o : 'a';
};

/** Per option: the night (applySky), the neon's tint (steel prints its own pale white: these only scale
 *  it), the rain, the asphalt's tone, the windows, the search beams. */
const LOOKS = {
  a: { // Neon Rain: night, rain, wet dark asphalt, pale neon
    sky: { moonColor: [0.32, 0.36, 0.52], moonDir: [-0.3, 0.85, 0.42], ambient: [0.055, 0.06, 0.085], fogColor: [0.008, 0.01, 0.018], fogNear: 30, fogFar: 72 },
    asphalt: [0.04, 0.042, 0.05], walk: [0.08, 0.084, 0.094], paint: [0.36, 0.34, 0.27], white: [0.42, 0.42, 0.44], wet: 0.25,
    concrete: [0.09, 0.095, 0.11], glass: [0.035, 0.045, 0.07], lit: [[0.32, 0.36, 0.42], [0.42, 0.34, 0.2]], litShare: 0.28,
    rain: true, beams: false, neonK: 1, phaseDark: [1, 0.85, 0.45], floorLook: { gain: 1.15, lumScale: 1.6, edge: 0.18, inkFloor: 0.02, topGlyphs: ['.   ', '. . ', '.:. ', ':.:.', ':;:.', ';=;:'] },
  },
  b: { // Golden Hour: his perfect city at dusk, warm and clean (before he ruins it)
    sky: { moonColor: [1.05, 0.68, 0.38], moonDir: [-0.85, 0.42, 0.3], ambient: [0.13, 0.09, 0.07], fogColor: [0.05, 0.03, 0.025], fogNear: 34, fogFar: 80 },
    asphalt: [0.085, 0.08, 0.08], walk: [0.17, 0.155, 0.14], paint: [0.48, 0.42, 0.24], white: [0.5, 0.48, 0.44],
    wet: 0, concrete: [0.17, 0.15, 0.13], glass: [0.09, 0.08, 0.08], lit: [[0.5, 0.36, 0.2], [0.4, 0.3, 0.22]], litShare: 0.12,
    rain: false, beams: false, neonK: 0.55, phaseDark: [1, 0.8, 0.5], floorLook: { gain: 1.4, lumScale: 1.9, edge: 0.22, inkFloor: 0.03, topGlyphs: ['.   ', '. . ', '.:. ', ':.;.', ';:=.', '=;%:'] },
  },
  c: { // Lockdown: red emergency light, search beams
    sky: { moonColor: [0.42, 0.13, 0.1], moonDir: [0.2, 0.8, 0.5], ambient: [0.06, 0.025, 0.025], fogColor: [0.016, 0.004, 0.004], fogNear: 28, fogFar: 64 },
    asphalt: [0.05, 0.045, 0.05], walk: [0.09, 0.08, 0.085], paint: [0.34, 0.2, 0.12], white: [0.36, 0.32, 0.32],
    wet: 0.12, concrete: [0.085, 0.075, 0.08], glass: [0.04, 0.025, 0.03], lit: [[0.38, 0.1, 0.06], [0.3, 0.2, 0.18]], litShare: 0.18,
    rain: false, beams: true, neonK: 0.7, phaseDark: [1, 0.85, 0.5], floorLook: { gain: 1.15, lumScale: 1.6, edge: 0.18, inkFloor: 0.02, topGlyphs: ['.   ', '. . ', '.:. ', ':.:.', ':;:.', ';=;:'] },
  },
};

const METAL = [0.15, 0.16, 0.18];
const DARK_METAL = [0.08, 0.085, 0.095];
const STATUE_STONE = [0.21, 0.205, 0.2];
const CAR_COLS = [[0.12, 0.13, 0.16], [0.2, 0.06, 0.05], [0.06, 0.08, 0.14], [0.16, 0.16, 0.15], [0.05, 0.05, 0.055], [0.12, 0.1, 0.06]];
const BURNT = [0.035, 0.03, 0.028];

/** A point at angle `a` from the south (+z) round through the east, `r` m out. */
const at = (a, r) => ({ x: Math.sin(a) * r, z: Math.cos(a) * r });

// ---------------------------------------------------------------- builders (world space, carved for prop art)
/** A box w x h x d standing on (x, y0, z), turned `ry` about its base. */
function box(w, h, d, x, y0, z, ry = 0) {
  const g = prep(new THREE.BoxGeometry(w, h, d));
  g.translate(0, h / 2, 0);
  if (ry) g.rotateY(ry);
  g.translate(x, y0, z);
  return g;
}
/** A cylinder r0 (bottom) → r1 (top), h tall, on (x, y0, z). */
function cyl(r0, r1, h, x, y0, z, sides = 8) {
  const g = prep(new THREE.CylinderGeometry(r1, r0, h, sides, 1));
  g.translate(x, y0 + h / 2, z);
  return g;
}
/** Carve a list of [geo, col] for the prop art path; returns the geos. */
function carveAll(parts, ao = (px, py) => 0.6 + 0.4 * Math.min(1, py / 3)) {
  for (const [g, col] of parts) carve(g, { col, ao, edge: (px, py, pz, nx, ny) => (ny > 0.5 && ny < 0.95 ? 1 : 0) });
  return parts.map(([g]) => g);
}
/** Turn a group of geos (built round the origin) by ry and move them to (x, z). */
function place(geos, x, z, ry) {
  for (const g of geos) {
    g.rotateY(ry);
    g.translate(x, 0, z);
  }
  return geos;
}

/** A car of the city that has not been built yet: a low wedge of a body, a glass canopy, four wheels in
 *  their arches, a light bar front and back. Faces +z; built round the origin. Returns { geos, burnt }. */
function buildCar(rng, x, z, ry, col) {
  const C = CITY.car, L = C.len, W = C.wid;
  const parts = [];
  const body = box(W, 0.62, L, 0, 0.28, 0);
  // the wedge: the nose lower than the tail
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.5 && p.getZ(i) > 0) p.setY(i, p.getY(i) - 0.18 * (p.getZ(i) / (L / 2)));
  parts.push([body, col]);
  const cab = box(W * 0.84, 0.48, L * 0.5, 0, 0.9, -0.15);
  const q = cab.attributes.position;
  for (let i = 0; i < q.count; i++) if (q.getY(i) > 1.2) q.setZ(i, q.getZ(i) * 0.7 - 0.08);
  parts.push([cab, mul(col, 0.55)]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = prep(new THREE.CylinderGeometry(0.32, 0.32, 0.26, 8, 1));
    w.rotateZ(Math.PI / 2);
    w.translate(sx * (W / 2 - 0.08), 0.32, sz * (L / 2 - 0.62));
    parts.push([w, DARK_METAL]);
  }
  parts.push([box(W * 0.9, 0.1, 0.08, 0, 0.62, L / 2 - 0.02), [0.4, 0.42, 0.46]]); // the light bar front
  parts.push([box(W * 0.9, 0.1, 0.08, 0, 0.78, -L / 2 + 0.02), [0.32, 0.08, 0.06]]); // the tail lights
  const geos = place(carveAll(parts, (px, py) => 0.55 + 0.45 * Math.min(1, py / 1.2)), x, z, ry);
  // what is left: the burnt chassis, lower and black, on its wheel rims
  const bp = [];
  const ch = box(W * 0.95, 0.42, L * 0.96, 0, 0.18, 0);
  const cp = ch.attributes.position;
  for (let i = 0; i < cp.count; i++) cp.setY(i, cp.getY(i) - hash2(cp.getX(i) * 7 + x, cp.getZ(i) * 7 + z) * 0.12);
  bp.push([ch, BURNT]);
  bp.push([box(W * 0.6, 0.18, L * 0.35, 0, 0.6, -0.2), mul(BURNT, 0.8)]);
  const burnt = place(carveAll(bp, 0.6), x, z, ry);
  return { geos, burnt };
}

/** A lamp post: a tall tapered pole, an arm out over the street, the lamp head. Returns { geos, stub }. */
function buildLamp(rng, x, z, ry) {
  const H = CITY.lamp.h;
  const parts = [[cyl(0.13, 0.08, H, 0, 0, 0, 6), METAL], [box(0.08, 0.08, 1.3, 0, H - 0.2, 0.6), METAL], [box(0.34, 0.14, 0.6, 0, H - 0.34, 1.15), [0.36, 0.38, 0.42]], [cyl(0.2, 0.17, 0.35, 0, 0, 0, 6), DARK_METAL]];
  const geos = place(carveAll(parts), x, z, ry);
  const stub = place(carveAll([[cyl(0.13, 0.11, 0.55, 0, 0, 0, 6), DARK_METAL]], 0.7), x, z, ry);
  return { geos, stub };
}

/** A sign on a pole: the pole and a board high over the street (its neon: the ambience). */
function buildSign(rng, x, z, ry, w) {
  const S = CITY.sign, [b0, b1] = S.board;
  const parts = [[cyl(0.11, 0.09, b1, 0, 0, 0, 6), METAL], [box(w, b1 - b0, 0.16, 0, b0, 0), [0.07, 0.075, 0.09]], [box(w + 0.12, 0.08, 0.2, 0, b1 - 0.02, 0), METAL]];
  const geos = place(carveAll(parts), x, z, ry);
  const stub = place(carveAll([[cyl(0.11, 0.1, 0.6, 0, 0, 0, 6), DARK_METAL]], 0.7), x, z, ry);
  return { geos, stub };
}

/** A shop sign hung on a tower's front: a board at y0, its neon (the ambience). */
function buildShopSign(rng, x, z, ry, w) {
  const S = CITY.shop;
  const parts = [[box(w, S.h, 0.18, 0, S.y0, 0), [0.06, 0.065, 0.08]], [box(w + 0.1, 0.07, 0.24, 0, S.y0 + S.h - 0.03, 0), METAL]];
  return place(carveAll(parts, 0.85), x, z, ry);
}

/** A screen pylon: a slab on a footing, its face to the plaza (the face's light: the ambience). */
function buildScreen(rng, x, z, ry) {
  const S = CITY.screen;
  const parts = [[box(S.w + 0.4, 0.5, S.d + 0.4, 0, 0, 0), DARK_METAL], [box(S.w, S.h, S.d, 0, 0.5, 0), [0.05, 0.055, 0.065]], [box(S.w + 0.12, 0.14, S.d + 0.08, 0, 0.5 + S.h, 0), METAL]];
  const geos = place(carveAll(parts), x, z, ry);
  const stub = place(carveAll([[box(S.w + 0.4, 0.5, S.d + 0.4, 0, 0, 0), DARK_METAL], [box(S.w * 0.9, 0.7, S.d, 0, 0.5, 0), BURNT]], 0.7), x, z, ry);
  return { geos, stub };
}

/**
 * The statue of himself (1.3 x tall for the camera): a plinth, the figure in his cape with one fist on
 * his hip, the head, and the right arm raised to the sky (its own piece). Faces +z (the plaza). Returns
 * { body, head, arm, plinth, headY, armY } (world space).
 */
function buildStatue(rng, x, z) {
  const K = CITY.statue.scale, S = STATUE_STONE;
  const P = 1.3; // the plinth
  const body = [], head = [], arm = [];
  body.push([box(2.6, 0.4, 2.6, 0, 0, 0), mul(S, 0.75)], [box(2.1, P - 0.4, 2.1, 0, 0.4, 0), mul(S, 0.85)]);
  const y = (v) => P + v * K;
  // the legs, the torso, the cape behind
  for (const s of [-1, 1]) body.push([box(0.26 * K, 0.95 * K, 0.3 * K, s * 0.15 * K, y(0), 0), mul(S, 1.0)]);
  body.push([box(0.62 * K, 0.75 * K, 0.36 * K, 0, y(0.95), 0), mul(S, 1.1)]);
  {
    const cape = box(0.8 * K, 1.5 * K, 0.12 * K, 0, y(0.2), -0.24 * K);
    const p = cape.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < y(0.6)) p.setX(i, p.getX(i) * 1.35);
    body.push([cape, mul(S, 0.9)]);
  }
  // the left arm, fist on the hip
  body.push([box(0.14 * K, 0.42 * K, 0.16 * K, 0.42 * K, y(1.3), 0.02), mul(S, 1.0)], [box(0.14 * K, 0.36 * K, 0.16 * K, 0.38 * K, y(1.0), 0.06), mul(S, 1.0)]);
  body.push([box(0.16 * K, 0.14 * K, 0.16 * K, 0, y(1.66), 0), mul(S, 1.05)]); // the neck
  const headY = y(1.74);
  {
    const h = prep(new THREE.IcosahedronGeometry(0.17 * K, 1));
    h.scale(0.9, 1.1, 0.95);
    h.translate(0, headY + 0.17 * K, 0);
    head.push([h, mul(S, 1.2)]);
  }
  // the right arm raised to the sky, the fist closed
  const armY = y(1.55);
  arm.push([box(0.15 * K, 0.95 * K, 0.17 * K, -0.4 * K, armY, 0), mul(S, 1.1)], [box(0.2 * K, 0.2 * K, 0.2 * K, -0.4 * K, armY + 0.95 * K, 0), mul(S, 1.2)]);
  const ao = (px, py) => 0.55 + 0.45 * Math.min(1, py / 5);
  const out = (list) => place(carveAll(list, ao), x, z, 0);
  const plinth = out([[box(2.6, 0.4, 2.6, 0, 0, 0), mul(S, 0.75)], [box(2.1, P - 0.4, 2.1, 0, 0.4, 0), mul(S, 0.85)]]);
  return { body: out(body), head: out(head), arm: out(arm), plinth, headY, armY };
}

/** Window bands on a facade's carved colour: rows of glass, some lit (seeded by the cell). */
function facadeCol(L, base, seed) {
  return (px, py, pz, nx, ny, nz) => {
    if (ny > 0.6 || ny < -0.6) return mul(base, 0.8);
    const u = Math.abs(nx) > 0.5 ? pz : px;
    const fy = py % 2.2, fu = ((u % 1.8) + 1.8) % 1.8;
    if (fy > 0.7 && fy < 1.8 && fu > 0.25 && fu < 1.55) {
      const h = hash2(Math.floor(u / 1.8) + seed * 13, Math.floor(py / 2.2) + seed * 7);
      if (h < L.litShare) return L.lit[h < L.litShare * 0.5 ? 0 : 1];
      return L.glass;
    }
    return base;
  };
}

/** A tower's ground floors: a block w x baseH x d with a dark street-level band, window rows above. */
function buildTowerBase(L, T, seed) {
  const g = box(T.w, PLAZA.baseH, T.d, T.x, 0, T.z);
  refine(g, 0.9);
  const col = facadeCol(L, L.concrete, seed);
  carve(g, { col: (px, py, pz, nx, ny, nz) => (py < 2.6 && ny < 0.5 ? (Math.abs(nx) + Math.abs(nz) > 0.5 && (py > 0.3 && py < 2.4) ? L.glass : mul(L.concrete, 0.7)) : col(px, py, pz, nx, ny, nz)), ao: (px, py) => 0.55 + 0.45 * Math.min(1, py / 6) });
  const ruin = box(T.w * 0.96, 2.4, T.d * 0.96, T.x, 0, T.z);
  const p = ruin.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 2) p.setY(i, p.getY(i) - hash2(p.getX(i) * 0.7 + seed, p.getZ(i) * 0.7) * 1.6);
  carve(ruin, { col: mul(L.concrete, 0.6), ao: 0.7 });
  return { geos: [g], ruin: [ruin] };
}

/** A tower's top: the floors above, from baseH up topH, a roof edge. */
function buildTowerTop(L, T, seed) {
  const y0 = PLAZA.baseH, w = T.w * 0.94, d = T.d * 0.94;
  const g = box(w, PLAZA.topH, d, T.x, y0, T.z);
  const crown = box(w + 0.3, 0.4, d + 0.3, T.x, y0 + PLAZA.topH, T.z);
  carve(g, { col: facadeCol(L, mul(L.concrete, 1.1), seed + 3), ao: 0.85 });
  carve(crown, { col: mul(L.concrete, 1.3), ao: 1 });
  return [g, crown];
}

/** A block front past the towers (a range piece): a facade slab w x h. */
function buildFront(L, x, z, w, h, ry, seed) {
  const g = box(w, h, 3, x, 0, z, ry);
  refine(g, 1.2);
  carve(g, { col: facadeCol(L, mul(L.concrete, 0.9), seed), ao: (px, py) => 0.5 + 0.5 * Math.min(1, py / 8) });
  return [g];
}

/** Street furniture (built round the origin, turned and placed): kiosk, barrier, bench, hydrant, traffic
 *  light, bin, shelter. Returns { geos, h, r }. */
function buildFurniture(kind, x, z, ry) {
  const parts = [];
  let r = 0.4;
  switch (kind) {
    case 'kiosk':
      parts.push([box(1.4, 2.1, 1.4, 0, 0, 0), METAL], [box(1.6, 0.12, 1.6, 0, 2.1, 0), [0.2, 0.21, 0.24]], [box(1.0, 0.7, 0.04, 0, 1.0, 0.71), [0.3, 0.32, 0.36]]);
      r = 0.85;
      break;
    case 'barrier':
      parts.push([box(1.8, 0.75, 0.5, 0, 0, 0), [0.24, 0.23, 0.21]], [box(1.8, 0.12, 0.52, 0, 0.5, 0), [0.4, 0.2, 0.06]]);
      r = 0.85;
      break;
    case 'bench':
      parts.push([box(1.8, 0.1, 0.5, 0, 0.42, 0), METAL], [box(1.8, 0.5, 0.08, 0, 0.5, -0.22), METAL], [box(0.1, 0.42, 0.45, -0.75, 0, 0), DARK_METAL], [box(0.1, 0.42, 0.45, 0.75, 0, 0), DARK_METAL]);
      r = 0.8;
      break;
    case 'hydrant':
      parts.push([cyl(0.18, 0.16, 0.6, 0, 0, 0, 6), [0.3, 0.08, 0.06]], [cyl(0.1, 0.06, 0.18, 0, 0.6, 0, 6), [0.3, 0.08, 0.06]]);
      r = 0.25;
      break;
    case 'trafficLight':
      parts.push([cyl(0.1, 0.08, 3.6, 0, 0, 0, 6), METAL], [box(0.36, 1.0, 0.3, 0, 2.7, 0.2), DARK_METAL]);
      r = 0.25;
      break;
    case 'bin':
      parts.push([cyl(0.28, 0.32, 0.9, 0, 0, 0, 8), DARK_METAL], [cyl(0.33, 0.33, 0.06, 0, 0.9, 0, 8), METAL]);
      r = 0.35;
      break;
    case 'shelter':
      parts.push([box(3.0, 0.1, 1.4, 0, 2.4, 0), METAL], [box(0.1, 2.4, 0.1, -1.4, 0, -0.6), METAL], [box(0.1, 2.4, 0.1, 1.4, 0, -0.6), METAL], [box(3.0, 1.8, 0.05, 0, 0.4, -0.65), [0.06, 0.07, 0.09]], [box(2.4, 0.08, 0.4, 0, 0.45, -0.4), DARK_METAL]);
      r = 1.5;
      break;
    default:
      parts.push([box(0.6, 0.6, 0.6, 0, 0, 0), METAL]);
  }
  const geos = place(carveAll(parts), x, z, ry);
  return { geos, h: geosHeight(geos), r };
}

// ---------------------------------------------------------------- the floor
/** Is (x, z) a street (asphalt)? */
const onStreet = (x, z) => Math.hypot(x, z) < PLAZA.r || (Math.abs(x) < PLAZA.avenue && Math.abs(z) < PLAZA.reach) || (Math.abs(z) < PLAZA.street && Math.abs(x) < PLAZA.reach);
/** Inside a tower's footprint (with a margin)? */
const inTower = (x, z, m = 0.6) => PLAZA.towers.some((T) => Math.abs(x - T.x) < T.w / 2 + m && Math.abs(z - T.z) < T.d / 2 + m);

/** The asphalt's carved colour: wet dark tarmac, the lane paint and the crosswalks carved into it. */
function asphaltCol(L) {
  return (px, py, pz) => {
    const n = 0.8 + 0.4 * fbm2(px * 0.6, pz * 0.6, 2);
    const ax = Math.abs(px), az = Math.abs(pz), r = Math.hypot(px, pz);
    // crosswalks where the streets meet the plaza: stripes across the way
    if (r > PLAZA.r - 2.4 && r < PLAZA.r + 0.2) {
      if (ax < PLAZA.avenue - 0.6 && ((px + 20) % 1.1) < 0.55) return mul(L.white, 0.9);
      if (az < PLAZA.street - 0.6 && ((pz + 20) % 1.1) < 0.55) return mul(L.white, 0.9);
    }
    if (r > PLAZA.r + 0.3) {
      // the avenue's centre line (two yellow strokes) and its lane lines (dashed white)
      if (ax < PLAZA.avenue && az > PLAZA.street) {
        if (Math.abs(ax - 0.18) < 0.09) return L.paint;
        if (Math.abs(ax - 3.5) < 0.08 && ((pz + 40) % 3) < 1.6) return L.white;
      }
      if (az < PLAZA.street && ax > PLAZA.avenue) {
        if (Math.abs(az - 0.18) < 0.09) return L.paint;
        if (Math.abs(az - 3) < 0.08 && ((px + 40) % 3) < 1.6) return L.white;
      }
    }
    // the parking lot's bays
    const Lt = PLAZA.lot;
    if (Math.abs(px - Lt.x) < 7 && Math.abs(pz - Lt.z) < 6 && (((px - Lt.x + 21) % 2.8) < 0.1)) return mul(L.white, 0.8);
    return mul(L.asphalt, n * (1 + L.wet * fbm2(px * 0.25 + 9, pz * 0.25, 2)));
  };
}

/** Does any paint fall on the slab at (x, z), w across (the carved colour differs from the plain tarmac's)? */
function painted(col, x, z, w) {
  for (let j = 0; j <= 10; j++) {
    for (let i = 0; i <= 10; i++) {
      const px = x + (i / 10 - 0.5) * w, pz = z + (j / 10 - 0.5) * w, c = col(px, 0, pz);
      if (c[0] > 0.2) return true;
    }
  }
  return false;
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

/**
 * The set. Built on a quiet Math.random (three names every object with a random uuid; the seeded sims
 * replay Math.random: foxTerrace.js's note): its own build draws nothing from it.
 */
export function createHalcyonPlaza(U, colliders) {
  const r = Math.random;
  let s = 0x4a1c0e5d;
  Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  try {
    return buildPlaza(U, colliders);
  } finally {
    Math.random = r;
  }
}

function buildPlaza(U, colliders) {
  const opt = cityOption(), L = LOOKS[opt];
  const rng = mulberry32(CONFIG.seed + 151);
  const br = mulberry32(CONFIG.seed + 5151);
  const group = new THREE.Group();
  group.name = 'halcyonPlaza';
  const breakables = [];
  const slabGeos = [], slabs = [], floor = [], bare = [];
  const staticGeos = [], propGeos = [];
  const fronts = new Runs();
  /** the light the ambience draws: neon tubes and screen faces, each tied to its piece (out when it breaks) */
  const neon = [];
  const screens = [];
  const cars = [];

  // ---- the floor: asphalt in the streets and the plaza, sidewalk slabs round it, the lot's bays
  const aCol = asphaltCol(L);
  const wCol = (px, py, pz) => mul(L.walk, 0.85 + 0.3 * fbm2(px * 1.3, pz * 1.3, 2));
  const C = PLAZA.cell, N = Math.ceil(PLAZA.reach / C);
  for (let j = -N; j < N; j++) {
    for (let i = -N; i < N; i++) {
      const x = (i + 0.5) * C, z = (j + 0.5) * C;
      const street = onStreet(x, z);
      const lot = Math.abs(x - PLAZA.lot.x) < 7.5 && Math.abs(z - PLAZA.lot.z) < 6.5;
      const walk = !street && !lot && Math.hypot(x, z) < PLAZA.walk;
      if (!street && !lot && !walk) continue;
      if (inTower(x, z, 0.2)) continue;
      if (Math.abs(x - PLAZA.site.x) < 7 && Math.abs(z - PLAZA.site.z) < 6) continue; // the construction lot: bare earth
      if (Math.hypot(x - PLAZA.bonfire.x, z - PLAZA.bonfire.z) < 2.6) continue;
      const w = walk ? C * 1.0 : C, j1 = 0.04;
      const pts = [[-w / 2 + j1, -w / 2 + j1], [w / 2 - j1, -w / 2 + j1], [w / 2 - j1, w / 2 - j1], [-w / 2 + j1, w / 2 - j1]];
      const g = slabGeometry(pts, { top: walk ? 0.12 : 0.03, inset: walk ? 0.06 : 0.03, drop: 0.03 });
      g.translate(x, 0, z);
      const col = walk ? wCol : aCol;
      // (the paint carved into the asphalt needs fine vertices; a plain slab stays coarse: the phone budget)
      refine(g, !walk && painted(aCol, x, z, w) ? 0.6 : 1.3);
      carve(g, { col, ao: 0.9, edge: (px, py, pz, nx, ny) => (ny > 0.5 && ny < 0.95 ? 1 : 0) });
      const outline = pts.map(([px, pz]) => [x + px, z + pz]);
      slabGeos.push(g);
      slabs.push({ x, z, r: w * 0.7, outline });
      floor.push({ geo: g, outline, x, z, r: w * 0.55, col, kind: walk ? 'sidewalk' : 'asphalt' });
    }
  }

  // ---- the bonfire in the south alley's mouth (it stays whole, as in every level)
  const bf = PLAZA.bonfire;
  propGeos.push(...buildBonfire(rng, bf.x, bf.z));
  colliders.add(bf.x, bf.z, 0.75, 'bonfire');
  bare.push({ x: bf.x, z: bf.z, r: 2.4 });

  // ---- the four towers: the base holds the top (a two-stage piece: ADR-153)
  PLAZA.towers.forEach((T, k) => {
    const base = buildTowerBase(L, T, k);
    const topGeos = buildTowerTop(L, T, k);
    const top = {
      kind: 'towerTop', mat: 'stone', look: 'prop', x: T.x, z: T.z, r: CITY.tower.r * 0.95, y0: PLAZA.baseH, h: PLAZA.topH + 0.4, geos: topGeos, colliders: [],
      hp: CITY.tower.top, weight: 2.4, topples: true, cover: false, lift: 2, fallOff: 1.5, fallT: CITY.tower.fallT, blocks: CITY.tower.blocks, wreck: true,
    };
    const cs = [colliders.add(T.x, T.z, CITY.tower.r, 'stone')];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cs.push(colliders.add(T.x + sx * (T.w / 2 - 1.2), T.z + sz * (T.d / 2 - 1.2), 1.3, 'stone'));
    breakables.push(top, {
      kind: 'towerBase', mat: 'stone', look: 'prop', x: T.x, z: T.z, r: CITY.tower.r, h: PLAZA.baseH, geos: base.geos, colliders: cs,
      hp: CITY.tower.base, weight: 3, topples: false, cover: true, lift: 0, holds: top, broken: { geos: base.ruin, r: CITY.tower.r * 0.9 }, wreck: false,
    });
    // two shop signs on the face toward the plaza
    const fx = -Math.sign(T.x) * (Math.abs(T.x) > 20 ? 1 : 0), fz = Math.abs(T.x) > 20 ? 0 : 1;
    const face = Math.atan2(fx, fz);
    for (const off of [-2.2, 2.2]) {
      const px = T.x + fx * (T.w / 2 + 0.12) + fz * off, pz = T.z + fz * (T.d / 2 + 0.12) - fx * off;
      const w = range(rng, 1.6, 2.4);
      const g = buildShopSign(rng, px, pz, face, w);
      const def = {
        kind: 'shopSign', mat: 'metal', look: 'prop', x: px, z: pz, r: CITY.shop.r, y0: CITY.shop.y0, h: CITY.shop.h, geos: g, colliders: [],
        hp: CITY.shop.hp, topples: true, cover: false, lift: 0, light: true, wreck: false, fallOff: 0.6, fallT: 0.7, tower: k,
      };
      breakables.push(def);
      neon.push({ def, kind: 'box', x: px + fx * 0.12, y: CITY.shop.y0 + CITY.shop.h / 2, z: pz + fz * 0.12, w, h: CITY.shop.h * 0.7, ux: fz, uz: -fx, hue: (k + (off > 0 ? 1 : 0)) % 3 });
    }
  });

  // ---- the block fronts past the towers (range pieces: one draw call for all of them)
  const FRONTS = [[-9, -29, 7, 12], [9, -29, 7, 14], [-24, -24, 8, 11], [24, -24, 8, 12], [-30, -9, 6, 10], [30, -9, 6, 11], [-30, 9, 6, 8], [30, 9, 6, 8]];
  FRONTS.forEach(([x, z, w, h], k) => {
    const ry = Math.abs(x) > 28 ? Math.PI / 2 : 0;
    const geos = buildFront(L, x, z, w, h, ry, 20 + k);
    const rr = Math.min(w / 2, 4.2);
    const c = colliders.add(x, z, rr, 'stone');
    breakables.push({ kind: 'blockFront', mat: 'stone', look: 'range', x, z, r: rr, h, range: fronts.add(geos), colliders: [c], hp: CITY.front.hp, topples: false, cover: true, lift: 0, wreck: false });
  });

  // ---- the flat silhouettes past the fight (static: never on a blow's path; ADR-153)
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * TAU + range(rng, -0.05, 0.05), rr = range(rng, PLAZA.staticR + 2, PLAZA.staticR + 14);
    const p = at(a, rr);
    if (p.z > 20) continue; // (south: never between the camera and the fight)
    const w = range(rng, 6, 11), h = range(rng, 10, 24);
    const g = box(w, h, 4, p.x, 0, p.z, Math.atan2(p.x, p.z));
    carve(g, { col: facadeCol(L, mul(L.concrete, 0.7), 50 + k), ao: 0.7 });
    staticGeos.push(g);
  }

  // ---- the statue of himself: the body holds the head; the raised arm is a piece of its own
  {
    const S = buildStatue(rng, PLAZA.statue.x, PLAZA.statue.z), P = PLAZA.statue, K = CITY.statue;
    const head = { kind: 'statueHead', mat: 'stone', look: 'prop', x: P.x, z: P.z, r: 0.35, y0: S.headY, h: 0.45 * K.scale, geos: S.head, colliders: [], hp: K.head, topples: true, cover: false, lift: 0, light: true, fallOff: 1.2, fallT: 0.9, wreck: false };
    breakables.push(head, {
      kind: 'statue', mat: 'stone', look: 'prop', x: P.x, z: P.z, r: K.r, h: geosHeight(S.body), geos: S.body, colliders: [colliders.add(P.x, P.z, K.r, 'stone')],
      hp: K.hp, weight: 2, topples: true, cover: true, lift: 0, holds: head, broken: { geos: S.plinth, r: 1.2 }, blocks: 3,
    });
    breakables.push({ kind: 'statueArm', mat: 'stone', look: 'prop', x: P.x - 0.5, z: P.z, r: 0.35, y0: S.armY, h: 1.2 * K.scale, geos: S.arm, colliders: [], hp: K.arm, topples: true, cover: false, lift: 1, light: true, fallOff: 0.8, fallT: 0.8, wreck: false });
  }

  // ---- the screen pylons, his face on each (the ambience draws the face)
  for (const [x, z] of [[-8.2, -12.4], [8.2, -12.4], [-17.5, 7.5], [17.5, 7.5]]) {
    const ry = Math.atan2(-x, -z) + Math.PI; // its face (+z) toward the plaza
    const face = Math.atan2(-x, -z);
    const g = buildScreen(rng, x, z, face);
    const def = { kind: 'screen', mat: 'stone', look: 'prop', x, z, r: CITY.screen.r, h: 0.5 + CITY.screen.h + 0.14, geos: g.geos, colliders: [colliders.add(x, z, CITY.screen.r * 0.8, 'stone')], hp: CITY.screen.hp, topples: true, cover: true, lift: 0, broken: { geos: g.stub, r: 0.9 }, wreck: true };
    void ry;
    breakables.push(def);
    const fx = Math.sin(face), fz = Math.cos(face);
    screens.push({ def, x: x + fx * (CITY.screen.d / 2 + 0.06), z: z + fz * (CITY.screen.d / 2 + 0.06), y0: 0.5, w: CITY.screen.w, h: CITY.screen.h, ux: fz, uz: -fx });
  }

  // ---- the cars: eight round the plaza (inside his bound), four in the lot; they burn, they explode
  const carSpots = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + 0.35 + range(rng, -0.12, 0.12), rr = range(rng, 9.5, 12.8);
    const p = at(a, rr);
    carSpots.push([p.x, p.z, a + Math.PI / 2 + range(rng, -0.5, 0.5)]);
  }
  for (let k = 0; k < 4; k++) carSpots.push([PLAZA.lot.x - 4.2 + (k % 2) * 2.8 + (k > 1 ? 2.8 : 0), PLAZA.lot.z + (k % 2 ? 2 : -1.5), (k % 2 ? 0.05 : -0.06) + Math.PI]);
  carSpots.forEach(([x, z, ry], k) => {
    const c = buildCar(rng, x, z, ry, CAR_COLS[k % CAR_COLS.length]);
    const def = {
      kind: 'car', mat: 'metal', look: 'prop', x, z, r: CITY.car.r, h: CITY.car.h, geos: c.geos, colliders: [colliders.add(x, z, CITY.car.r * 0.85, 'stone')],
      hp: CITY.car.hp, weight: 1.4, topples: false, burns: true, cover: true, lift: 1, broken: { geos: c.burnt, r: CITY.car.r * 0.8 }, wreck: false,
    };
    breakables.push(def);
    cars.push(def);
  });

  // ---- lamp posts round the plaza and down the streets
  const lampAt = [];
  for (let k = 0; k < 8; k++) lampAt.push(at((k / 8) * TAU + TAU / 16, PLAZA.r + 1.4));
  for (const [x, z] of [[-PLAZA.avenue - 1, 24], [PLAZA.avenue + 1, 24], [-PLAZA.avenue - 1, -24], [PLAZA.avenue + 1, -24]]) lampAt.push({ x, z });
  for (const p of lampAt) {
    // (nothing tall south of the fight: the camera looks from the south)
    if (inTower(p.x, p.z, 0.8) || p.z > 8) continue;
    const ry = Math.atan2(-p.x, -p.z);
    const g = buildLamp(rng, p.x, p.z, ry);
    const def = { kind: 'lamp', mat: 'metal', look: 'prop', x: p.x, z: p.z, r: CITY.lamp.r, h: CITY.lamp.h, geos: g.geos, colliders: [colliders.add(p.x, p.z, 0.16, 'trunk')], hp: CITY.lamp.hp, topples: true, cover: false, lift: 1, light: true, broken: { geos: g.stub, r: 0.12 }, wreck: false };
    breakables.push(def);
    const fx = Math.sin(ry), fz = Math.cos(ry);
    neon.push({ def, kind: 'lamp', x: p.x + fx * 1.15, y: CITY.lamp.h - 0.4, z: p.z + fz * 1.15, w: 0.5, h: 0.1, ux: fz, uz: -fx, hue: 9 });
  }

  // ---- signs on poles over the corners of the plaza
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + range(rng, -0.08, 0.08), p = at(a, range(rng, 17, 19));
    if (inTower(p.x, p.z, 1) || p.z > 13) {
      // (no tall sign south of the fight: a lower spot to its side)
      p.x = Math.sign(p.x || 1) * range(rng, 11, 13);
      p.z = range(rng, 9, 12);
    }
    const face = Math.atan2(-p.x, -p.z), w = range(rng, 2.0, 2.8);
    const g = buildSign(rng, p.x, p.z, face, w);
    const def = { kind: 'sign', mat: 'metal', look: 'prop', x: p.x, z: p.z, r: CITY.sign.r, h: CITY.sign.h + 0.06, geos: g.geos, colliders: [colliders.add(p.x, p.z, 0.15, 'trunk')], hp: CITY.sign.hp, topples: true, cover: false, lift: 0, light: true, broken: { geos: g.stub, r: 0.12 }, wreck: false };
    breakables.push(def);
    const fx = Math.sin(face), fz = Math.cos(face), [b0, b1] = CITY.sign.board;
    neon.push({ def, kind: 'box', x: p.x + fx * 0.1, y: (b0 + b1) / 2, z: p.z + fz * 0.1, w: w * 0.86, h: (b1 - b0) * 0.7, ux: fz, uz: -fx, hue: k % 3 });
  }

  // ---- street furniture: kiosks, barriers (the construction lot), benches, hydrants, traffic lights, bins, shelters
  const FURN = [];
  for (let k = 0; k < 6; k++) FURN.push(['kiosk', at((k / 6) * TAU + 0.5, range(rng, 19, 21))]);
  for (let k = 0; k < 10; k++) FURN.push(['barrier', { x: PLAZA.site.x - 6 + (k % 5) * 2.6, z: PLAZA.site.z - 4 + Math.floor(k / 5) * 7 }]);
  for (let k = 0; k < 4; k++) FURN.push(['bench', at((k / 4) * TAU + 0.8, PLAZA.r + 3.2)]);
  for (let k = 0; k < 4; k++) FURN.push(['hydrant', at((k / 4) * TAU + 0.25, PLAZA.r + 2.2)]);
  for (const [x, z] of [[-PLAZA.avenue - 0.6, PLAZA.r + 1], [PLAZA.avenue + 0.6, PLAZA.r + 1], [-PLAZA.avenue - 0.6, -PLAZA.r - 1], [PLAZA.avenue + 0.6, -PLAZA.r - 1]]) FURN.push(['trafficLight', { x, z }]);
  for (let k = 0; k < 6; k++) FURN.push(['bin', at((k / 6) * TAU + 0.15, PLAZA.r + 2.6)]);
  FURN.push(['shelter', { x: -PLAZA.avenue - 2.4, z: 20 }], ['shelter', { x: PLAZA.avenue + 2.4, z: -21 }]);
  for (const [kind, p] of FURN) {
    if (inTower(p.x, p.z, 1) || Math.hypot(p.x - bf.x, p.z - bf.z) < 3 || carSpots.some(([x, z]) => Math.hypot(x - p.x, z - p.z) < 2.2)) continue;
    const ry = kind === 'barrier' ? 0 : Math.atan2(-p.x, -p.z);
    const f = buildFurniture(kind, p.x, p.z, ry);
    const mat = kind === 'barrier' ? 'stone' : 'metal';
    const tall = kind === 'trafficLight';
    const c = kind === 'hydrant' || kind === 'bin' || tall ? colliders.add(p.x, p.z, Math.min(0.3, f.r), 'trunk') : colliders.add(p.x, p.z, f.r * 0.8, 'stone');
    const def = {
      kind, mat, look: 'prop', x: p.x, z: p.z, r: f.r, h: f.h, geos: f.geos, colliders: [c], topples: tall || kind === 'shelter', lift: kind === 'barrier' ? 1 : 0, cover: kind === 'kiosk' || kind === 'shelter' ? true : undefined,
      light: tall ? true : undefined, wreck: false, spout: kind === 'hydrant',
      // (the big ones leave a heap; the small ones shatter where they stand: fewer bones)
      broken: kind === 'kiosk' || kind === 'barrier' || kind === 'shelter' ? { geos: buildRubble(br, p.x, p.z, Math.min(0.5, f.r * 0.6), { col: kind === 'barrier' ? [0.2, 0.19, 0.17] : DARK_METAL, h: 0.25 }), r: 0.1 } : null,
    };
    breakables.push(def);
    if (tall) neon.push({ def, kind: 'lamp', x: p.x + Math.sin(ry) * 0.38, y: 3.2, z: p.z + Math.cos(ry) * 0.38, w: 0.12, h: 0.6, ux: Math.cos(ry), uz: -Math.sin(ry), hue: 3 });
  }

  // ---- meshes
  const meshes = [];
  const stoneMat = createPropArtMaterial(U, { fadeNearPlayer: true });
  const add = (geos, m, name) => {
    if (!geos.length) return null;
    const o = new THREE.Mesh(mergeGeometries(geos), m);
    o.name = name;
    meshes.push(o);
    return o;
  };
  add(staticGeos, stoneMat, 'skyline');
  add(propGeos, stoneMat, 'props');
  meshes.push(fronts.finish(stoneMat, 'blockFronts'));
  // (wet dark tarmac must stay calm under the fight: sparse dim strokes, the paint the brightest of it)
  const slabMat = createCarvedGlyphMaterial(U, { ...SLAB_LOOK, ...L.floorLook, viewPitch: CONFIG.camera.pitch });
  const slabMesh = add(slabGeos, slabMat, 'paving');
  group.add(...meshes);
  markCaster(group);
  breakables.push(...breakableFloor({ slabs: floor, slabGeos, slabMesh, mat: slabMat, rng: mulberry32(CONFIG.seed + 7151), group, earth: [0.07, 0.065, 0.06] }).defs);

  const ambience = makeCity({ L, opt, neon, screens, cars, group });
  const S = CONFIG.world.dragonSleep ?? PLAZA.wait;
  return {
    group, treeSpots: [], bare, slabs, nest: { x: S.x, z: S.z }, bonfire: { x: bf.x, z: bf.z },
    material: stoneMat, stoneMaterial: stoneMat, slabMaterial: slabMat,
    breakables, option: opt,
    scarInk: [0.01, 0.01, 0.014],
    sky: L.sky,
    // no grass in the city: a few tufts in the construction lot's earth only
    grass: { density: (x, z) => (Math.abs(x - PLAZA.site.x) < 7 && Math.abs(z - PLAZA.site.z) < 6 ? 0.25 : 0), height: 0.4, ash: 0.3 },
    ambience,
    /** The city's light by the boss's phase (ADR-153; the boss calls it, the reset too). */
    setPhase: (n) => ambience.setPhase(n),
    /** A car-sized blast at (x, z) now (a thrown car landing): the explosion, its hurt, its fire. */
    boom: (x, z, by = 'boss') => ambience.boom(x, z, by),
    cars, screens, neon,
    PLAZA, CITY,
  };
}

// ---------------------------------------------------------------- the ambience: neon, screens, rain, fuses
// reused records (no allocation per frame)
const blob = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.05, size: 0.4, sizeEnd: 0.4, heat: 0.5, heatEnd: 0.5, drag: 0, gravity: 0, kind: 'steel' };
const part = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, size: 0.15, sizeEnd: 0.1, glyph: '.', color: [1, 1, 1], colorEnd: [0, 0, 0], alpha: 1, alphaEnd: 0, drag: 0, flicker: 0, spin: 0, rot: 0, gravity: 0 };
const RAIN = [0.34, 0.4, 0.55], RAIN_END = [0.12, 0.14, 0.2];
const DEBRIS = [0.5, 0.42, 0.34], DEBRIS_END = [0.1, 0.08, 0.06];
const SPARK = [1.6, 0.6, 0.15], SPARK_END = [0.4, 0.05, 0.01];
const tellRec = { source: 'world', attack: 'carBomb', tell: TELL.RED, impactIn: 0, x: 0, z: 0, hazard: true };
const flashRec = { source: 'world', attack: 'carBomb', tell: TELL.RED, x: 0, y: 0.8, z: 0, hazard: true };
const blastEvt = { x: 0, z: 0, r: 0, by: 'boss' };
const heroHit = { damage: 0, from: { x: 0, z: 0 }, knockback: 0, knockdown: false, kind: 'blast', tell: TELL.RED, parryable: false, blockable: true, attack: 'carBomb', perfect: false, plunge: false };
const blastO = { kind: 'blast', by: 'boss', dx: NaN, dz: NaN, y: 0.8, src: -1, fire: true, scar: true };

/** A head-and-shoulders mask on a screen's face (u -1..1 across, v 0..1 up): true where his figure is (left dark). */
function figure(u, v) {
  if (v < 0.42) return Math.abs(u) < 0.62 - (0.42 - v) * 0.4; // the shoulders
  if (v < 0.5) return Math.abs(u) < 0.2; // the neck
  const hy = (v - 0.67) / 0.17, hx = u / 0.32;
  return hx * hx + hy * hy < 1; // the head
}

function makeCity({ L, opt, neon, screens, cars }) {
  let seed = 0x7f4a7c15;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const st = { phase: 1, phaseT: 0, hold: 0, flash: 0, rain: 0, beamA: 0, dim: 0, dimWant: 0, dimHold: 0, lights: [], pieces: null, booms: [] };
  const fuses = cars.map((def) => ({ def, piece: null, state: 'idle', t: 0, by: 'boss', told: false, flashed: false, quiet: false, wait: 0 }));
  let game = null;
  const moon = [0, 0, 0], amb = [0, 0, 0];

  const pieceOf = (def) => {
    const D = game?.world?.destructibles;
    if (!D?.list) return null;
    if (!st.pieces) {
      st.pieces = new Map();
      for (const b of D.list) if (b.def) st.pieces.set(b.def, b);
    }
    return st.pieces.get(def) ?? null;
  };
  const standing = (def) => {
    const b = pieceOf(def);
    return !b || b.state === 0;
  };

  const writeSky = (U) => {
    if (!U?.uMoonColor?.value) return;
    const k = L.phaseDark[Math.min(3, Math.max(1, st.phase)) - 1] * (1 - 0.6 * st.dim), f = st.flash;
    for (let i = 0; i < 3; i++) {
      moon[i] = L.sky.moonColor[i] * k + f * (i === 0 ? 1.2 : 0.4);
      amb[i] = L.sky.ambient[i] * k + f * (i === 0 ? 0.12 : 0.04);
    }
    U.uMoonColor.value.setRGB(moon[0], moon[1], moon[2]);
    U.uAmbient.value.setRGB(amb[0], amb[1], amb[2]);
  };

  /** One frame's neon tube along a board's edge (a rectangle w x h facing (uz, -ux)), `n` blobs at most. */
  const tube = (F, e, kind, heat, n) => {
    const step = CITY.neon.step, hw = e.w / 2, hh = e.h / 2;
    let spent = 0;
    const per = 2 * (e.w + e.h);
    const cnt = Math.min(n, Math.max(2, Math.round(per / step)));
    for (let i = 0; i < cnt; i++) {
      let s = (i / cnt) * per, u, v;
      if (s < e.w) { u = -hw + s; v = -hh; } else if ((s -= e.w) < e.h) { u = hw; v = -hh + s; } else if ((s -= e.h) < e.w) { u = hw - s; v = hh; } else { s -= e.w; u = -hw; v = hh - s; }
      blob.x = e.x + e.ux * u;
      blob.y = e.y + v;
      blob.z = e.z + e.uz * u;
      blob.size = blob.sizeEnd = CITY.neon.size;
      blob.heat = blob.heatEnd = heat;
      blob.kind = kind;
      F.spawn(blob);
      spent++;
    }
    return spent;
  };

  /** A screen's face this frame: the fill (his figure left dark), `kind` steel / void, a budget of blobs. */
  const face = (F, e, kind, heat, n, noise) => {
    const cols = n >= 40 ? 5 : 4, rows = Math.max(4, Math.min(11, Math.round(n / cols)));
    let spent = 0;
    for (let j = 0; j < rows && spent < n; j++) {
      for (let i = 0; i < cols && spent < n; i++) {
        const u = ((i + 0.5) / cols) * 2 - 1, v = (j + 0.5) / rows;
        if (!noise && figure(u, v)) continue;
        if (noise && rnd() < 0.45) continue;
        blob.x = e.x + e.ux * u * (e.w / 2) * 0.9;
        blob.y = e.y0 + v * e.h;
        blob.z = e.z + e.uz * u * (e.w / 2) * 0.9;
        blob.size = blob.sizeEnd = (e.h / rows) * 1.25;
        blob.heat = blob.heatEnd = heat * (noise ? 0.4 + 0.8 * rnd() : 1);
        blob.kind = kind;
        F.spawn(blob);
        spent++;
      }
    }
    return spent;
  };

  /** A car's blast at (x, z), caused by `by`: the world, the fire, the hero inside its reach, him. */
  const explode = (x, z, by, quiet = false) => {
    if (!game) return;
    const B = CITY.car, W = game.world, F = game.fx?.fire, q = W?.destructibles?.q ?? 1;
    blastO.by = by;
    blastO.src = W?.destructibles?.swing?.() ?? -1;
    W?.impact?.(x, z, B.blast.r, B.blast.power, blastO);
    W?.ignite?.(x, z, B.blast.r * 0.8, 1);
    if (F) {
      const n = Math.round(46 * q);
      for (let i = 0; i < n; i++) {
        const a = rnd() * TAU, sp = 1.5 + rnd() * 5, up = 1 + rnd() * 5;
        blob.x = x + Math.cos(a) * 0.4;
        blob.y = 0.6 + rnd() * 0.8;
        blob.z = z + Math.sin(a) * 0.4;
        blob.vx = Math.cos(a) * sp;
        blob.vy = up;
        blob.vz = Math.sin(a) * sp;
        blob.life = 0.45 + rnd() * 0.5;
        blob.size = 1.0 + rnd() * 0.8;
        blob.sizeEnd = 2.2;
        blob.heat = 1.1 + rnd() * 0.6;
        blob.heatEnd = 0;
        blob.drag = 2.4;
        blob.gravity = -1;
        blob.kind = i % 5 === 0 ? 'smoke' : 'fire';
        F.spawn(blob);
      }
      blob.vx = blob.vy = blob.vz = 0;
      blob.drag = blob.gravity = 0;
      blob.life = 0.05;
    }
    const A = game.fx?.add;
    if (A) {
      const n = Math.round(24 * q);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rnd() * 0.3, sp = 5 + rnd() * 7;
        part.x = x;
        part.y = 0.6;
        part.z = z;
        part.vx = Math.cos(a) * sp;
        part.vy = 2 + rnd() * 5;
        part.vz = Math.sin(a) * sp;
        part.life = 0.5 + rnd() * 0.5;
        part.size = 0.16;
        part.sizeEnd = 0.08;
        part.glyph = i % 3 ? '#%*.' : "+x'";
        part.color = i % 3 ? DEBRIS : SPARK;
        part.colorEnd = i % 3 ? DEBRIS_END : SPARK_END;
        part.alpha = 1;
        part.alphaEnd = 0;
        part.drag = 1.2;
        part.gravity = -12;
        part.flicker = 0.2;
        part.spin = (rnd() - 0.5) * 8;
        A.spawn(part);
      }
      part.gravity = 0;
      part.drag = 0;
    }
    game.shake?.(0.45);
    st.flash = Math.max(st.flash, 0.5);
    blastEvt.x = x;
    blastEvt.z = z;
    blastEvt.r = B.blast.r;
    blastEvt.by = by;
    game.events?.emit?.('world:blast', blastEvt);
    // the hero inside its reach: blockable, a roll clears it (never when the fairness guard quieted it)
    const p = game.player;
    if (!quiet && p?.alive && p.position && Math.hypot(p.position.x - x, p.position.z - z) < B.hero.r + (p.radius ?? 0.45)) {
      heroHit.damage = B.hero.damage;
      heroHit.knockback = B.hero.knockback;
      heroHit.from.x = x;
      heroHit.from.z = z;
      try {
        p.takeHit?.(heroHit);
      } catch (err) {
        console.error('[city] the blast on the hero failed', err);
      }
    }
    // him: a car the hero (or a returned blow) broke is a weapon against him too
    const d = game.boss ?? game.dragon;
    if (by === 'player' && d?.position && d.mode !== 'dead' && d.mode !== 'dying' && Math.hypot(d.position.x - x, d.position.z - z) < B.boss.r) {
      try {
        if (typeof d.onBlast === 'function') d.onBlast(B.boss.damage, B.boss.posture, x, z);
        else d.takeHit?.({ damage: B.boss.damage, exact: true, posture: B.boss.posture, heavy: true, part: 'body', dir: { x: d.position.x - x, z: d.position.z - z } });
      } catch (err) {
        console.error('[city] the blast on the boss failed', err);
      }
    }
  };

  const api = {
    /** the light now (the Lab, the tests) */
    get state() {
      return { phase: st.phase, flash: st.flash, opt, fuses: fuses.map((f) => f.state), booms: st.booms.length };
    },
    get fuses() {
      return fuses;
    },
    setup(g) {
      game = g;
      writeSky(g.U);
      const Lt = CITY.lights;
      for (const [x, z] of [[-10, -10], [10, -10]]) st.lights.push(g.lights?.add?.({ x, y: 4, z, color: [0.55, 0.62, 0.85], intensity: Lt.intensity * L.neonK, radius: Lt.radius, flicker: 0.1 }) ?? null);
    },
    setVisible() {},
    flare(k = 1) {
      st.flash = Math.max(st.flash, Math.min(1.2, Number(k) || 0));
    },
    dim(k = 1) {
      st.dimWant = Math.min(1, Math.max(0, Number(k) || 0));
      st.dimHold = 0.2;
    },
    /** 1 neon and his face; 2 static, then crimson; 3 the neon and the screens dead (a reset: 1). */
    setPhase(n) {
      const v = Math.min(3, Math.max(1, Math.round(Number(n) || 1)));
      if (v === st.phase) return v;
      st.phase = v;
      st.phaseT = 0;
      if (v === 1) {
        // (a reset: the fuses forgotten, the lights back)
        for (const f of fuses) {
          f.state = 'idle';
          f.t = 0;
          f.told = f.flashed = f.quiet = false;
        }
        st.booms.length = 0;
        st.pieces = null;
      }
      return v;
    },
    get phase() {
      return st.phase;
    },
    /** A blast now at (x, z) (a thrown car landing). */
    boom(x, z, by = 'boss') {
      if (!Number.isFinite(x + z)) return false;
      explode(x, z, by);
      return true;
    },
    update(dt, g) {
      if (!(dt > 0)) return;
      game = g;
      st.phaseT += dt;
      // a reset by the flow while he stands asleep: the city back to its first light
      const boss = g.boss ?? g.dragon;
      if (boss?.mode === 'sleep' && st.phase !== 1) api.setPhase(1);
      st.flash = st.flash > 0.004 ? st.flash * Math.exp(-dt * 6) : 0;
      if (st.dimHold > 0) st.dimHold -= dt;
      else st.dimWant = 0;
      st.dim += (st.dimWant - st.dim) * (1 - Math.exp(-dt * 4));
      writeSky(g.U);
      const D = g.world?.destructibles, q = D?.q ?? 1;
      // ---- the fuses: a broken car burns, then goes up (two bangs per CITY.car.chain.per at most)
      const B = CITY.car, now = g.time ?? 0;
      for (let i = st.booms.length - 1; i >= 0; i--) if (now - st.booms[i] > B.chain.per) st.booms.splice(i, 1);
      for (const f of fuses) {
        const b = f.piece ?? (f.piece = pieceOf(f.def));
        if (!b) continue;
        if (f.state === 'idle') {
          // (a car thrown or held is his: its blast comes where it lands, boss.js)
          if (b.state === 2) {
            f.state = 'fuse';
            f.t = 0;
            f.by = b.by === 'player' ? 'player' : 'boss';
            f.told = f.flashed = f.quiet = false;
          } else if (b.state >= 3) f.state = 'done';
          continue;
        }
        if (f.state !== 'fuse') continue;
        f.t += dt;
        const left = B.fuse - f.t;
        if (!f.told) {
          f.told = true;
          tellRec.impactIn = Math.max(0.05, left);
          tellRec.x = b.x;
          tellRec.z = b.z;
          g.events?.emit?.('combat:tell', tellRec);
        }
        if (!f.flashed && left <= 0.3) {
          f.flashed = true;
          // (the boss's fairness guard: a blow of his already cued that needs the other answer near the bang:
          // it goes up uncued and harmless to the hero)
          if (boss?.brain?.worldClash?.(Math.max(0.05, left), TELL.RED)) f.quiet = true;
          else {
            flashRec.x = b.x;
            flashRec.z = b.z;
            g.events?.emit?.('combat:flash', flashRec);
          }
        }
        // the fire swells under the bonnet
        const F = g.fx?.fire;
        if (F && rnd() < 0.8) {
          const k = Math.min(1, f.t / B.fuse);
          blob.x = b.x + (rnd() - 0.5) * 1.2;
          blob.y = 0.7 + rnd() * 0.4;
          blob.z = b.z + (rnd() - 0.5) * 1.2;
          blob.vx = blob.vz = 0;
          blob.vy = 1 + rnd() * 1.5;
          blob.life = 0.3 + rnd() * 0.3;
          blob.size = 0.6 + 0.6 * k;
          blob.sizeEnd = 1.1;
          blob.heat = 0.6 + 0.7 * k;
          blob.heatEnd = 0;
          blob.kind = 'fire';
          F.spawn(blob);
          blob.vy = 0;
        }
        if (left <= 0) {
          if (st.booms.length >= B.chain.max) {
            if (!(f.wait > 0)) f.wait = 0;
            f.wait += dt;
            continue; // (the chain cap: it waits its turn)
          }
          f.state = 'done';
          st.booms.push(now);
          explode(b.x, b.z, f.by, f.quiet);
        }
      }
      // ---- the neon and the screens (steel; crimson screens in phase 2; dead in 3)
      const F = g.fx?.fire;
      // (what is re-drawn every frame lives one frame: DuelFx._frame's rule, so the heat never stacks)
      st.hold -= dt;
      let life = 0;
      if (!(st.hold > 0)) {
        life = Math.max(0.011, dt * 1.5);
        st.hold = life - dt;
      }
      blob.life = life;
      blob.vx = blob.vy = blob.vz = 0;
      if (F && life > 0) {
        let budget = Math.round(Math.min(CITY.neon.max, (CITY.neon.cap / 0.5) * q));
        const ph = st.phase;
        // the screens first (his face is the city's light)
        if (ph < 3) {
          const stat = ph === 2 && st.phaseT < CITY.phase2.static;
          const kind = ph === 2 && !stat ? 'void' : 'steel';
          const per = Math.max(6, Math.floor((budget * 0.6) / Math.max(1, screens.length)));
          for (const e of screens) {
            if (budget <= 0) break;
            if (!standing(e.def)) continue;
            budget -= face(F, e, kind, CITY.neon.screenHeat * L.neonK, Math.min(per, budget), stat);
          }
        }
        if (ph < 3) {
          const per = Math.max(2, Math.floor(budget / Math.max(1, neon.length)));
          for (const e of neon) {
            if (budget <= 0) break;
            if (!standing(e.def)) continue;
            // (phase 2: the neon flickers, a tube now and then out)
            if (ph === 2 && rnd() < 0.15) continue;
            budget -= tube(F, e, 'steel', CITY.neon.heat * L.neonK * (e.kind === 'lamp' ? 1.2 : 1), Math.min(per, budget));
          }
        }
      }
      for (const Lg of st.lights) {
        if (!Lg) continue;
        Lg.intensity = st.phase >= 3 ? 0 : CITY.lights.intensity * L.neonK * (st.phase === 2 ? 0.7 : 1);
        if (Lg.color?.setRGB) {
          if (st.phase === 2) Lg.color.setRGB(0.9, 0.12, 0.08);
          else Lg.color.setRGB(0.55, 0.62, 0.85);
        }
      }
      // ---- the weather: rain (a), search beams (c)
      const f = g.U?.uFocus?.value, fxA = g.fx?.alpha;
      if (L.rain && f && fxA) {
        st.rain += dt * CITY.rain.rate * q;
        while (st.rain >= 1) {
          st.rain -= 1;
          part.x = f.x + (rnd() - 0.5) * 40 - 2;
          part.z = f.z + (rnd() - 0.5) * 30 - 3;
          part.y = 6 + rnd() * 3;
          part.vx = 1.2;
          part.vy = -16 - rnd() * 3;
          part.vz = 0.3;
          part.life = CITY.rain.life;
          part.size = part.sizeEnd = 0.38;
          part.glyph = '|';
          part.color = RAIN;
          part.colorEnd = RAIN_END;
          part.alpha = 0.5;
          part.alphaEnd = 0.25;
          part.drag = 0;
          part.flicker = 0;
          part.spin = 0;
          part.rot = 0.08;
          part.gravity = 0;
          fxA.spawn(part);
        }
        part.rot = 0;
      }
      if (L.beams && F && st.phase < 3 && life > 0) {
        st.beamA += dt * 0.5;
        for (let k = 0; k < 2; k++) {
          const a = st.beamA * (k ? -1 : 1) + k * 2.1, cx = Math.sin(a) * 9, cz = Math.cos(a * 0.7) * 7 - 2;
          for (let i = 0; i < 6; i++) {
            const t = i / 5;
            blob.x = (k ? 24 : -24) * (1 - t) + cx * t;
            blob.y = 9 * (1 - t) + 0.3;
            blob.z = -24 * (1 - t) + cz * t;
            blob.size = blob.sizeEnd = 0.5 + 1.4 * t;
            blob.heat = blob.heatEnd = 0.18 + 0.12 * t;
            blob.kind = 'steel';
            F.spawn(blob);
          }
        }
      }
    },
  };
  return api;
}
