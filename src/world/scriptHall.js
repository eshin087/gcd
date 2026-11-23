import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createCarvedGlyphMaterial, createPropArtMaterial, createAsciiObjectMaterial, SCRIPT_GRID } from '../render/materials.js';
import { GlyphParticles } from '../render/particles.js';
import { gi } from '../render/glyphs.js';
import { markCaster } from '../render/pipeline.js';
import { mulberry32, range, fbm2, hash2 } from '../core/rng.js';
import { CONFIG } from '../core/config.js';
import { prep, lumpy, carve, slabGeometry, mul, SLAB_LOOK, buildBonfire, buildRubble, geosHeight, buildFlagstone } from './forest.js';
import { limb, buildWatcher, WATCHER_SUIT, WATCHER_CODE } from './landmarks.js';
import { breakableFloor } from './floor.js';
import { lookOf } from '../entities/enemies/duelist/lookSwitch.js';

// The Hall of Falling Script (levels/scripthall.js; ADR-157): one arena that holds THREE SCENES on the
// same ten slots, built once at load. Only one scene stands at a time; a morph swaps them piece by
// piece behind a front that runs out from where he stands (the boss's transitions call it).
//   hall    the Pillared Hall: ten square stone pillars, stone wall panels east, west and north with two
//           lift doors in the north wall, a gate arch at the entry, benches, planters; cold pale grey
//           light with a green cast (arrival, the intro, phase 2, after his death)
//   dojo    the Sparring Hall: ten wooden posts (training dummies), paper screens along the walls, weapon
//           racks, a low dais north; warm lamp light (phase 1)
//   source  the Source: the ten slots as columns of code, no walls: black, long columns of falling code
//           all round the floor; near black, everything green (phase 3)
// The floor (2 m slabs, kind 'tile'), the steps ('step'), the path ('flagstone') and the bonfire (the one
// piece left whole) are in every scene. THE WATCHERS: identical men in dark suits standing still along
// the side walls, facing the middle (landmarks.js buildWatcher): 4 in the hall at arrival and in the
// dojo, 8 in the hall once it has been left (phase 2, after his death), 12 in a ring round the floor in
// the Source, drawn as green code. One that is struck bursts into falling green digits and stays gone
// until the next morph. They never act.
//
// THE SCENES CONTRACT (the set's output `scenes`; the boss and the Lab call it, world.restore resets it):
//   scenes.ids             ['hall', 'dojo', 'source'] (the first is the home scene: the reset's)
//   scenes.now             the scene shown (the morph's target as soon as it starts)
//   scenes.k               0..1 how far the running morph is (1: none running)
//   scenes.to(id, { x, z, speed })   morph to scene `id`: a front runs out from (x, z) at `speed` m/s
//                          (HALL.morph.speed; faster if the farthest piece is more than HALL.morph.max s
//                          away), each piece it crosses lets go (a burst of one-cell digits in its own dim
//                          hue) and the new scene's piece at its place prints in, whole, with its colliders
//                          (an actor standing in it is pushed out); cracked and broken floor slabs under the
//                          front are whole again; the old wreckage sinks; the light eases to the new scene's.
//                          Lasts at most HALL.morph.max s. False: already there
//   scenes.snap(id)        straight to scene `id` (no front)
//   scenes.reset()         the home scene, no morph running, the light and the script at rest
//   scenes.update(dt)      (the set's ambience calls it)
//   scenes.hold(sec)       the falling script holds still (the intro's stir, the fall)
//   scenes.stutter(sec)    deja vu: every prop's letters shift a cell sideways and back, the script pulses
//   scenes.script(k, sec)  the script wave's strength eased to k (sec: back to the scene's own after)
// A piece of a scene is a breakable with `scene: '<id>'` (destructibles.js present / sceneNow: the reset
// leaves the pieces of the first scene standing and puts the others out of the world); a piece without
// one is in every scene (the floor, the steps, the path). `within: [ids]` (this file's, optional): the
// scenes the piece stands in when it is not only its own (the hall's first four watchers also stand in
// the dojo); `later: true`: only once the hall has been left since the reset (the phase-2 hall's four
// more watchers, tagged `scene: 'hall2'` so that the reset puts them out).
//
// THE SCRIPT WAVE (render/materials.js SCRIPT_GLSL; uScript / uScriptF, shaderLib.js): the scene's own
// strength (`?script=a|b|c`: SCRIPT_LOOKS), the morph's front, the stutter. THE FALLING SCRIPT (the
// set's ambience, atmosphere.js runs it instead of the fireflies): one glyph-particle batch of
// world-anchored columns of one-cell digits falling down the walls (in the Source: all round the floor
// in the dark), at most 320 on desktop, 140 on LOW; it writes each scene's light.
// Look switch `?hall=a|b` (read when the set is built): a pale marble with green-black inlay, b dark
// basalt with jade-lit edges.

/** Layout numbers (world metres): the level's CONFIG.world overrides match these (levels/scripthall.js). */
export const HALL = Object.freeze({
  half: 16, // the floor: 32 x 32 m on the origin
  cell: 2, // floor slab pitch
  slotX: 7.5, // the two rows of uprights: x = ±slotX
  slotZ: Object.freeze([-10, -5, 0, 5, 10]),
  watcherX: 13.5,
  wall: 15.75, // the walls' centre line (x = ±wall, z = -wall), panels `panel` m long
  panel: 3.2,
  steps: Object.freeze([16.6, 17.4, 18.2]), // three steps down to the path (z)
  stepHalf: 3,
  pathFrom: 19,
  pathTo: 31,
  bonfire: Object.freeze({ x: 0, z: 33 }),
  wait: Object.freeze({ x: 0, z: -9, yaw: Math.PI }), // his back to the path
  entryZ: 16,
  // the morph: a front at `speed` m/s, the whole of it at most `max` s; `width` m the front's band
  morph: Object.freeze({ speed: 18, max: 1.8, width: 2.6 }),
  // the script wave's resting strength per scene (?script=a: the shimmer and the full turn)
  script: Object.freeze({ hall: 0.2, dojo: 0.2, source: 1 }),
});
export const SCENES = Object.freeze(['hall', 'dojo', 'source']);
/** The ten slots of the uprights. */
export const SLOTS = Object.freeze(HALL.slotZ.flatMap((z) => [{ x: -HALL.slotX, z }, { x: HALL.slotX, z }]));
/** The script wave's strength per scene, by look (`?script=`): a the shimmer and the full turn, b nothing until the Source, c strong from the start. */
export const SCRIPT_LOOKS = Object.freeze({ a: HALL.script, b: Object.freeze({ hall: 0, dojo: 0, source: 1 }), c: Object.freeze({ hall: 0.5, dojo: 0.5, source: 1 }) });
/** The watchers: where they stand ([x, z]) in the hall at arrival (and the dojo), the four more of the phase-2 hall. */
export const WATCHERS = Object.freeze({
  first: Object.freeze([[-13.5, -6], [13.5, -6], [-13.5, 3.5], [13.5, 3.5]]),
  more: Object.freeze([[-13.5, -12], [13.5, -12], [-13.5, 10.5], [13.5, 10.5]]),
  ring: 14.6, // the Source's twelve stand on this circle
});

/**
 * Each scene's light (written by the ambience, eased over a morph). `lamp`: the intensity of the
 * dojo's two warm lamps (game.lights).
 */
export const SCENE_LIGHT = Object.freeze({
  hall: Object.freeze({ moon: [0.34, 0.38, 0.36], ambient: [0.03, 0.038, 0.034], fog: [0.004, 0.007, 0.005], near: 30, far: 62, lamp: 0, rain: 0.8 }),
  dojo: Object.freeze({ moon: [0.4, 0.31, 0.2], ambient: [0.046, 0.032, 0.02], fog: [0.008, 0.005, 0.003], near: 30, far: 62, lamp: 1, rain: 0.45 }),
  source: Object.freeze({ moon: [0.035, 0.13, 0.06], ambient: [0.004, 0.02, 0.009], fog: [0.0, 0.003, 0.001], near: 24, far: 52, lamp: 0, rain: 1 }),
});

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => t * t * (3 - 2 * t);

// ---------------------------------------------------------------- the looks (?hall=a|b)
/** a: pale marble with green-black inlay; b: dark basalt with jade-lit edges. */
const LOOKS = Object.freeze({
  a: Object.freeze({
    stone: [0.15, 0.155, 0.148], inlay: [0.01, 0.03, 0.019], edge: null, // (a's chamfers: the stone's own)
    paving: [0.13, 0.134, 0.127], joint: [0.006, 0.022, 0.013], jointEdge: 0,
    metal: [0.17, 0.18, 0.19],
  }),
  b: Object.freeze({
    stone: [0.05, 0.054, 0.06], inlay: [0.03, 0.034, 0.04], edge: [0.05, 0.3, 0.17],
    paving: [0.05, 0.054, 0.058], joint: [0.05, 0.3, 0.17], jointEdge: 1,
    metal: [0.08, 0.09, 0.1],
  }),
});
const WOOD = [0.15, 0.1, 0.06];
const DARK_WOOD = [0.07, 0.045, 0.03];
const PAPER = [0.36, 0.32, 0.25];
const CODE = [0.012, 0.06, 0.028];
const CODE_EDGE = [0.04, 0.26, 0.11];
const LEAF = [0.04, 0.1, 0.05];
const SOIL = [0.03, 0.025, 0.02];
const LAMP = [1.0, 0.62, 0.3];
const AMBER = [1.4, 0.8, 0.25];

/** The floor's look: calm (the courtyard's and the terrace's paving), its joints printed by the edge band. */
const PAVING_LOOK = {
  gain: 1.45,
  lumScale: 2.0,
  edge: 0.55,
  inkFloor: 0.035,
  topGlyphs: ['.   ', '. . ', '.:. ', ':.;.', ';:=.', '=;%:'],
};

// ---------------------------------------------------------------- geometry
/**
 * A straight prism over a polygon outline (world [x, z] round its middle), from y0 to y1, its top
 * outline scaled by k toward the middle (a taper), with a top cap and no bottom. Non-indexed, flat
 * facets (each side one tone in prop art).
 */
function prism(pts, y0, y1, k = 1) {
  const n = pts.length;
  let cx = 0, cz = 0;
  for (const [x, z] of pts) {
    cx += x / n;
    cz += z / n;
  }
  const top = pts.map(([x, z]) => [cx + (x - cx) * k, cz + (z - cz) * k]);
  const pos = [];
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const face = (a, b, c, hx, hy, hz) => {
    e1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    e2.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    e1.cross(e2);
    if (e1.x * hx + e1.y * hy + e1.z * hz < 0) pos.push(...a, ...c, ...b);
    else pos.push(...a, ...b, ...c);
  };
  const T = [cx, y1, cz];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const A = [pts[i][0], y0, pts[i][1]], B = [pts[j][0], y0, pts[j][1]];
    const C = [top[j][0], y1, top[j][1]], D = [top[i][0], y1, top[i][1]];
    const ox = (pts[i][0] + pts[j][0]) / 2 - cx, oz = (pts[i][1] + pts[j][1]) / 2 - cz;
    face(A, B, C, ox, 0, oz);
    face(A, C, D, ox, 0, oz);
    face(T, D, C, 0, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** A square of half-widths (hx, hz) round (x, z) with its corners cut by c (eight points). */
function chamferSq(x, z, hx, hz, c) {
  return [
    [x - hx + c, z - hz], [x + hx - c, z - hz], [x + hx, z - hz + c], [x + hx, z + hz - c],
    [x + hx - c, z + hz], [x - hx + c, z + hz], [x - hx, z + hz - c], [x - hx, z - hz + c],
  ];
}

/** A box (w along x, h, d along z) standing at local (x, y0, z): non-indexed, unpainted. */
function box(w, h, d, x = 0, y0 = 0, z = 0) {
  const g = prep(new THREE.BoxGeometry(w, h, d));
  g.translate(x, y0 + h / 2, z);
  return g;
}

/** A chamfer facet: its normal points out of a corner (both x and z) or along an edge between the top and a side. */
const isChamfer = (nx, ny, nz) => (Math.abs(nx) > 0.3 && Math.abs(nz) > 0.3) || (ny > 0.25 && ny < 0.9);

/**
 * Carve the parts of one piece and move them into the world: `parts` [[geo (local, facing +z), col
 * fn or [r,g,b], edge?]], turned by yaw and moved to (x, z). Returns the geometries.
 */
function finish(parts, x, z, yaw, ao) {
  const out = [];
  for (const [g, col, edge] of parts) {
    if (yaw) g.rotateY(yaw);
    g.translate(x, 0, z);
    carve(g, {
      col: typeof col === 'function' ? col : (px, py, pz, nx, ny, nz) => mul(col, 0.86 + 0.28 * hash2(Math.round(nx * 6) + 2.3, Math.round(nz * 6) + Math.round(ny * 6) * 5)),
      ao: ao ?? ((px, py, pz, nx, ny) => 0.62 + 0.38 * clamp(py / 2.5, 0, 1) + (ny > 0.8 ? 0.25 : 0)),
      edge: edge ?? ((px, py, pz, nx, ny, nz) => (isChamfer(nx, ny, nz) ? 1 : 0.15)),
    });
    out.push(g);
  }
  return out;
}

/** The look's stone colour for a carved part: the chamfers jade in b, inlay where `band(py)` is true. */
function stoneCol(L, band = null) {
  return (px, py, pz, nx, ny, nz) => {
    if (L.edge && isChamfer(nx, ny, nz)) return mul(L.edge, 0.9 + 0.2 * hash2(px * 7.1, pz * 7.3 + py));
    const base = band && band(py, px, pz) ? L.inlay : L.stone;
    return mul(base, 0.84 + 0.3 * fbm2(px * 1.9 + py * 0.7, pz * 1.9 - py * 0.5, 2));
  };
}

// ---------------------------------------------------------------- the pieces
/** A square stone pillar on a slot (hall): plinth, shaft, capital, abacus; inlay bands. ~4.05 m. */
function buildPillar(L, x, z) {
  const P = [];
  const inlay = (py) => py < 0.36 || (py > 1.05 && py < 1.18) || py > 3.5;
  const col = stoneCol(L, inlay);
  P.push([prism(chamferSq(0, 0, 0.62, 0.62, 0.12), 0, 0.36, 0.97), col]);
  P.push([prism(chamferSq(0, 0, 0.47, 0.47, 0.1), 0.36, 3.55, 0.95), col]);
  P.push([prism(chamferSq(0, 0, 0.5, 0.5, 0.11), 3.55, 3.88, 1.2), col]);
  P.push([prism(chamferSq(0, 0, 0.64, 0.64, 0.1), 3.88, 4.05, 0.96), col]);
  return { geos: finish(P, x, z, 0), r: 0.64 };
}

/** What a broken pillar leaves: its plinth, a jagged stump, rubble. */
function pillarStub(L, br, x, z) {
  const col = stoneCol(L, (py) => py < 0.36);
  const plinth = finish([[prism(chamferSq(0, 0, 0.62, 0.62, 0.12), 0, 0.36, 0.97), col]], x, z, 0);
  return [...plinth, ...buildRubble(br, x, z, 0.5, { col: L.stone, h: range(br, 0.7, 1.1) })];
}

/**
 * A stone wall panel (hall), `HALL.panel` m long, local x along it, +z its face into the hall: a base
 * course, the body, a framed field (an inlay frame round a pale field in a; a jade frame round basalt
 * in b), a cornice. ~2.95 m.
 */
function wallParts(L) {
  const W = HALL.panel;
  const col = stoneCol(L);
  const frame = L.edge ? L.edge : L.inlay;
  return [
    [box(W, 0.4, 0.62, 0, 0, 0), stoneCol(L, () => true)],
    [box(W, 2.32, 0.46, 0, 0.4, 0), col],
    [box(W - 0.5, 1.7, 0.03, 0, 0.72, 0.24), (px, py) => mul(frame, 0.9 + 0.2 * fbm2(px * 3, py * 3, 2))],
    [box(W - 0.78, 1.42, 0.03, 0, 0.86, 0.262), col],
    [box(W + 0.04, 0.24, 0.62, 0, 2.72, 0), stoneCol(L, () => !L.edge)],
  ];
}

/** A lift door in the north wall (hall, metal): jambs and a header, two leaves with a seam, the floor sign over it. */
function doorParts(L) {
  const W = HALL.panel;
  const col = stoneCol(L);
  const metal = (px, py, pz, nx, ny, nz) => (L.edge && isChamfer(nx, ny, nz) ? L.edge : mul(L.metal, 0.85 + 0.3 * hash2(Math.round(px * 4), Math.round(py * 2))));
  return [
    [box(W, 0.4, 0.62, 0, 0, 0), stoneCol(L, () => true)],
    [box(0.36, 2.32, 0.5, -W / 2 + 0.18, 0.4, 0), col],
    [box(0.36, 2.32, 0.5, W / 2 - 0.18, 0.4, 0), col],
    [box(W, 0.48, 0.5, 0, 2.48, 0), col],
    [box(1.2, 2.26, 0.08, -0.62, 0.4, 0.12), metal],
    [box(1.2, 2.26, 0.08, 0.62, 0.4, 0.12), metal],
    [box(0.04, 2.26, 0.09, 0, 0.4, 0.13), L.inlay],
    [box(0.34, 0.12, 0.05, 0, 2.62, 0.27), AMBER, () => 1],
    [box(W + 0.04, 0.24, 0.62, 0, 2.72, 0), stoneCol(L, () => !L.edge)],
  ];
}

/** A paper screen (dojo, wood): rails and stiles, two paper panes, a lattice over them. ~2.6 m. */
function screenParts(rng) {
  const W = HALL.panel;
  const wood = (k) => (px, py, pz, nx, ny, nz) => mul(WOOD, k * (0.8 + 0.4 * hash2(Math.round(nx * 6) + 1, Math.round(nz * 6) + px)));
  const P = [
    [box(W, 0.26, 0.16, 0, 0, 0), wood(0.8)],
    [box(W, 0.14, 0.16, 0, 2.46, 0), wood(1)],
    [box(0.12, 2.2, 0.16, -W / 2 + 0.06, 0.26, 0), wood(0.9)],
    [box(0.12, 2.2, 0.16, W / 2 - 0.06, 0.26, 0), wood(0.9)],
    [box(0.1, 2.2, 0.16, 0, 0.26, 0), wood(0.9)],
  ];
  for (const sx of [-1, 1]) {
    const cx = sx * 0.8;
    P.push([box(1.46, 2.2, 0.03, cx, 0.26, 0), (px, py) => mul(PAPER, 0.85 + 0.25 * fbm2(px * 2.3, py * 2.3, 2) + range(rng, -0.02, 0.02))]);
    for (const lx of [-0.37, 0.37]) P.push([box(0.035, 2.2, 0.04, cx + lx, 0.26, 0.03), wood(1.1)]);
    for (const ly of [0.8, 1.36, 1.92]) P.push([box(1.46, 0.035, 0.04, cx, ly, 0.03), wood(1.1)]);
  }
  return P;
}

/** A wooden training post on a slot (dojo): a square post, a cap, two arms and a leg peg toward the aisle. ~2.8 m. */
function buildPost(x, z, yaw) {
  const col = (k) => (px, py, pz, nx, ny, nz) => mul(WOOD, k * (0.8 + 0.35 * hash2(Math.round(nx * 6) + 4, Math.round(nz * 6) + Math.round(py * 3))));
  const P = [
    [prism(chamferSq(0, 0, 0.16, 0.16, 0.04), 0, 2.7, 0.92), col(1)],
    [prism(chamferSq(0, 0, 0.2, 0.2, 0.05), 2.7, 2.84, 0.6), col(1.3)],
    [limb(new THREE.Vector3(-0.06, 1.3, 0.1), new THREE.Vector3(-0.14, 1.38, 0.55), 0.045, 0.035, 5), col(1.25)],
    [limb(new THREE.Vector3(0.06, 1.3, 0.1), new THREE.Vector3(0.14, 1.38, 0.55), 0.045, 0.035, 5), col(1.25)],
    [limb(new THREE.Vector3(0, 1.05, 0.1), new THREE.Vector3(0, 0.95, 0.48), 0.04, 0.035, 5), col(1.2)],
    [limb(new THREE.Vector3(0, 0.55, 0.1), new THREE.Vector3(0.02, 0.32, 0.5), 0.05, 0.04, 5), col(1.1)],
  ];
  return { geos: finish(P, x, z, yaw), r: 0.26 };
}

/** A column of code on a slot (the Source): blocks stacked a little out of true, dark green, its chamfers lit. ~4.2 m. */
function buildCodePillar(rng, x, z) {
  const P = [];
  const col = (px, py, pz, nx, ny, nz) => (isChamfer(nx, ny, nz) ? mul(CODE_EDGE, 0.8 + 0.4 * hash2(px * 9, py * 9 + pz)) : mul(CODE, 0.7 + 0.6 * hash2(Math.round(py * 6) + 1.7, Math.round(nx * 3) + Math.round(nz * 3) * 3)));
  let y = 0;
  for (let i = 0; y < 4.15; i++) {
    const h = range(rng, 0.42, 0.75), w = range(rng, 0.38, 0.48) * (i === 0 ? 1.18 : 1);
    const ox = range(rng, -0.05, 0.05), oz = range(rng, -0.05, 0.05);
    const y1 = Math.min(4.2, y + h);
    P.push([prism(chamferSq(ox, oz, w, w, 0.07), y, y1, 0.97), col]);
    y = y1;
  }
  return { geos: finish(P, x, z, 0, (px, py, pz, nx, ny) => 0.7 + 0.3 * clamp(py / 3, 0, 1) + (ny > 0.8 ? 0.3 : 0)), r: 0.52 };
}

/** A stone bench (hall): two legs and a seat, along local x. */
function benchParts(L) {
  const col = stoneCol(L);
  return [
    [box(0.42, 0.42, 0.48, -0.78, 0, 0), stoneCol(L, () => true)],
    [box(0.42, 0.42, 0.48, 0.78, 0, 0), stoneCol(L, () => true)],
    [prism(chamferSq(0, 0, 1.1, 0.27, 0.05), 0.42, 0.55, 0.98), col],
  ];
}

/** A stone planter with a dark shrub (hall). */
function planterParts(L, rng) {
  const shrub = prep(new THREE.IcosahedronGeometry(0.46, 1));
  lumpy(shrub, 0.12, 3.1, rng() * 50);
  shrub.scale(1, 0.85, 1);
  shrub.translate(0, 0.95, 0);
  return [
    [prism(chamferSq(0, 0, 0.45, 0.45, 0.07), 0, 0.62, 1.08), stoneCol(L, (py) => py < 0.12)],
    [prism(chamferSq(0, 0, 0.42, 0.42, 0.06), 0.62, 0.66, 1), SOIL, () => 0],
    [shrub, (px, py, pz) => mul(LEAF, 0.7 + 0.6 * fbm2(px * 4, pz * 4 + py * 3, 2)), () => 0],
  ];
}

/** A weapon rack (dojo, wood): two uprights, two bars, staves leaning in it. Along local x, its face +z. */
function rackParts(rng) {
  const col = (k) => (px, py, pz, nx, ny, nz) => mul(WOOD, k * (0.8 + 0.35 * hash2(Math.round(nx * 6) + 9, Math.round(nz * 6) + px)));
  const P = [
    [box(0.1, 1.75, 0.14, -0.85, 0, 0), col(1)],
    [box(0.1, 1.75, 0.14, 0.85, 0, 0), col(1)],
    [box(1.84, 0.08, 0.14, 0, 0.42, 0), col(1.15)],
    [box(1.84, 0.08, 0.14, 0, 1.45, 0), col(1.15)],
  ];
  for (let i = 0; i < 5; i++) {
    const sx = -0.62 + i * 0.31 + range(rng, -0.04, 0.04);
    const tip = new THREE.Vector3(sx + range(rng, -0.06, 0.06), range(rng, 1.8, 2.1), -0.08);
    P.push([limb(new THREE.Vector3(sx, 0.02, 0.16), tip, 0.025, 0.02, 4), (px, py) => mul(DARK_WOOD, py > 1.7 && i % 2 ? 2.6 : 1.3)]);
  }
  return P;
}

/** Half of the dojo's low dais (wood planks over a dark frame), along local x. */
function daisParts(w, d) {
  const P = [[box(w, 0.2, d, 0, 0, 0), DARK_WOOD]];
  const n = Math.round(w / 0.36);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * (w / n);
    P.push([box(w / n - 0.02, 0.1, d - 0.06, x, 0.2, 0), mul(WOOD, 0.85 + 0.35 * hash2(i * 3.7, w))]);
  }
  return P;
}

/** One post of the gate arch at the entry (hall) carrying its half of the lintel (sx: which side). */
function gateParts(L, sx) {
  const col = stoneCol(L, (py) => py < 0.3 || (py > 3.55 && py < 3.72));
  return [
    [prism(chamferSq(0, 0, 0.5, 0.5, 0.1), 0, 0.3, 0.95), col],
    [prism(chamferSq(0, 0, 0.38, 0.38, 0.08), 0.3, 3.55, 0.96), col],
    [box(0.9, 0.17, 0.9, 0, 3.55, 0), col],
    [box(4.2, 0.32, 0.6, -sx * 1.75, 3.72, 0), col],
  ];
}

/**
 * Up to `n` points on the geometries (world space; triangle centres picked by area) with their colour:
 * where a piece's letters come from when it lets go (x, y, z, r, g, b per point).
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
    const u = rng(), v = rng() * (1 - u);
    for (let j = 0; j < 3; j++) out[i * 6 + j] = p[k + j] * (1 - u - v) + p[k + 3 + j] * u + p[k + 6 + j] * v;
    const ci = (k / 3) * 3;
    for (let j = 0; j < 3; j++) out[i * 6 + 3 + j] = c ? c[ci + j] : 0.2;
  }
  return out;
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
  const look = lookOf('hall', 'a');
  const L = LOOKS[look] ?? LOOKS.a;
  const scriptLook = lookOf('script', 'a');
  const base = SCRIPT_LOOKS[scriptLook] ?? SCRIPT_LOOKS.a;
  // the streams: the layout; the stubs and rubble; the letters' samples; the floor's remains
  const rng = mulberry32(CONFIG.seed + 157);
  const br = mulberry32(CONFIG.seed + 5157);
  const sr = mulberry32(CONFIG.seed + 6157);
  const group = new THREE.Group();
  group.name = 'scriptHall';
  const slabGeos = [], propGeos = [], slabs = [], floor = [], breakables = [], bare = [];
  /** the floor's colour: the look's paving, its chamfer (the joint) the inlay or the jade */
  const pavingCol = (px, py, pz, nx, ny) => (ny > 0.5 && ny < 0.95 ? mul(L.joint, 0.9 + 0.2 * hash2(px * 3.1, pz * 3.3)) : mul(L.paving, 0.62 + 0.38 * fbm2(px * 1.3, pz * 1.3, 2) * (0.85 + 0.3 * fbm2(px * 0.2 + 7, pz * 0.2, 2))));
  const flagCol = (px, py, pz) => mul(L.paving, 0.55 + 0.4 * fbm2(px * 2, pz * 2, 2));
  const slabEdge = (px, py, pz, nx, ny) => (ny > 0.5 && ny < 0.95 ? (L.jointEdge ? 1 : 0.2) : 0);
  const addSlab = (geo, x, z, rr, outline, kind) => {
    slabGeos.push(geo);
    slabs.push({ x, z, r: rr, outline });
    floor.push({ geo, outline, x, z, r: rr * 0.8, col: pavingCol, kind });
  };
  // ---- the floor: square slabs, 2 m
  const n = Math.round((2 * H.half) / H.cell);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -H.half + (i + 0.5) * H.cell, z = -H.half + (j + 0.5) * H.cell, w = H.cell - 0.08;
      const pts = [[x - w / 2, z - w / 2], [x + w / 2, z - w / 2], [x + w / 2, z + w / 2], [x - w / 2, z + w / 2]];
      const g = slabGeometry(pts, { top: 0.04, inset: 0.07, drop: 0.03 });
      carve(g, { col: pavingCol, ao: 1, edge: slabEdge });
      addSlab(g, x, z, w * 0.7, pts, 'tile');
    }
  }
  // ---- the steps down to the path, the path to the bonfire
  for (const z of H.steps) {
    const pts = [[-H.stepHalf, z - 0.38], [H.stepHalf, z - 0.38], [H.stepHalf, z + 0.38], [-H.stepHalf, z + 0.38]];
    const g = slabGeometry(pts, { top: 0.06, inset: 0.07, drop: 0.04 });
    carve(g, { col: pavingCol, ao: 1, edge: slabEdge });
    addSlab(g, 0, z, 1.2, pts, 'step');
  }
  for (let z = H.pathFrom; z < H.pathTo; z += range(rng, 0.9, 1.3)) {
    const x = range(rng, -0.6, 0.6), w = range(rng, 0.9, 1.5), d = range(rng, 0.7, 1.2);
    const st = buildFlagstone(rng, x, z, w, d, rng() * 6.283);
    slabGeos.push(st.geo);
    slabs.push({ x, z, r: Math.max(w, d) * 0.65, outline: st.outline });
    floor.push({ geo: st.geo, outline: st.outline, x, z, r: Math.max(w, d) * 0.5, col: flagCol, kind: 'flagstone' });
  }
  // ---- the bonfire (the one piece left whole)
  const bf = H.bonfire;
  propGeos.push(...buildBonfire(rng, bf.x, bf.z));
  colliders.add(bf.x, bf.z, 0.75, 'bonfire');
  bare.push({ x: bf.x, z: bf.z, r: 2.4 });

  /** A piece of a scene: its letters' samples for the morph's letting go (`shed`), its colliders. */
  const piece = (def, nShed) => {
    def.shed = shedSamples(def.geos, nShed, sr);
    breakables.push(def);
    return def;
  };
  /** colliders along a wall piece's line (local x from -len/2 to len/2) */
  const wallCols = (cx, cz, ax, az, len, r) => {
    const out = [];
    const k = Math.max(2, Math.round(len / (r * 1.6)));
    for (let i = 0; i < k; i++) {
      const t = -len / 2 + r * 0.7 + (i * (len - r * 1.4)) / (k - 1);
      out.push(colliders.add(cx + ax * t, cz + az * t, r, 'stone'));
    }
    return out;
  };
  /** the wall line's panels: { x, z, yaw (its face into the hall), ax, az (along it), side } */
  const panels = [];
  for (let i = 0; i < 10; i++) {
    const t = -H.half + H.panel * (i + 0.5);
    panels.push({ x: H.wall, z: t, yaw: -Math.PI / 2, ax: 0, az: 1, side: 'east', i });
    panels.push({ x: -H.wall, z: t, yaw: Math.PI / 2, ax: 0, az: 1, side: 'west', i });
    panels.push({ x: t, z: -H.wall, yaw: 0, ax: 1, az: 0, side: 'north', i });
  }
  const doorAt = (p) => p.side === 'north' && (p.i === 3 || p.i === 6);

  // ================================================================ the hall
  for (const p of SLOTS) {
    const u = buildPillar(L, p.x, p.z);
    piece({
      kind: 'pillar', scene: 'hall', mat: 'stone', look: 'prop', x: p.x, z: p.z, r: u.r, h: geosHeight(u.geos), geos: u.geos,
      colliders: [colliders.add(p.x, p.z, 0.6, 'stone')],
      broken: { geos: pillarStub(L, br, p.x, p.z), r: 0.55 }, hp: 3.2, topples: true, lift: 1, cover: true,
    }, 26);
  }
  for (const p of panels) {
    const door = doorAt(p);
    const geos = finish(door ? doorParts(L) : wallParts(L), p.x, p.z, p.yaw);
    const stub = finish([[box(H.panel, 0.4, 0.62, 0, 0, 0), stoneCol(L, () => true)]], p.x, p.z, p.yaw);
    piece({
      kind: door ? 'liftDoor' : 'wall', scene: 'hall', mat: door ? 'metal' : 'stone', look: 'prop', x: p.x, z: p.z, r: H.panel / 2, h: geosHeight(geos), geos,
      colliders: wallCols(p.x, p.z, p.ax, p.az, H.panel, 0.62), broken: { geos: [...stub, ...buildRubble(br, p.x, p.z, 0.7, { col: L.stone, h: 0.45 })] },
      hp: door ? 4.5 : 4, topples: false, lift: 0, cover: true,
    }, 18);
  }
  for (const sx of [-1, 1]) {
    const x = sx * 3.6, z = H.entryZ + 0.2;
    const geos = finish(gateParts(L, sx), x, z, 0);
    piece({
      kind: 'gate', scene: 'hall', mat: 'stone', look: 'prop', x, z, r: 0.5, h: geosHeight(geos), geos, colliders: [colliders.add(x, z, 0.45, 'stone')],
      broken: { geos: buildRubble(br, x, z, 0.42, { col: L.stone, h: 0.6 }), r: 0.4 }, hp: 3, topples: true, lift: 0, cover: true,
    }, 18);
  }
  for (const [x, z] of [[-11.2, -0.8], [11.2, -0.8], [-11.2, 8], [11.2, 8]]) {
    const geos = finish(benchParts(L), x, z, Math.PI / 2);
    piece({
      kind: 'bench', scene: 'hall', mat: 'stone', look: 'prop', x, z, r: 1.1, h: geosHeight(geos), geos,
      colliders: [colliders.add(x, z - 0.6, 0.42, 'stone'), colliders.add(x, z + 0.6, 0.42, 'stone')], hp: 1.3, topples: false, lift: 1, cover: false,
    }, 10);
  }
  for (const [x, z] of [[-11.2, -13], [11.2, -13], [-11.2, 13.2], [11.2, 13.2]]) {
    const geos = finish(planterParts(L, rng), x, z, 0);
    piece({
      kind: 'planter', scene: 'hall', mat: 'stone', look: 'prop', x, z, r: 0.55, h: geosHeight(geos), geos, colliders: [colliders.add(x, z, 0.5, 'stone')],
      hp: 1.3, topples: false, lift: 1, cover: false,
    }, 10);
  }

  // ================================================================ the watchers
  const watcher = (x, z, yaw, col, scene, extra) => {
    const geos = buildWatcher(rng, x, z, yaw, col);
    return piece({
      kind: 'watcher', scene, ...extra, mat: 'stone', look: 'prop', light: true, x, z, r: 0.32, h: geosHeight(geos), geos,
      colliders: [colliders.add(x, z, 0.3, 'stone')], hp: 0.3, topples: false, lift: 0, cover: false, wreck: false,
    }, 22);
  };
  // (facing the middle, turned a little toward the camera: from above a man facing sideways is a sliver)
  const side = (x) => (x > 0 ? -Math.PI / 2 + 0.35 : Math.PI / 2 - 0.35);
  for (const [x, z] of WATCHERS.first) watcher(x, z, side(x), WATCHER_SUIT, 'hall', { within: ['hall', 'dojo'] });
  for (const [x, z] of WATCHERS.more) watcher(x, z, side(x), WATCHER_SUIT, 'hall2', { within: ['hall'], later: true });
  for (let i = 0; i < 12; i++) {
    const a = ((i + 0.5) / 12) * Math.PI * 2, x = Math.sin(a) * WATCHERS.ring, z = Math.cos(a) * WATCHERS.ring;
    watcher(x, z, a + Math.PI, WATCHER_CODE, 'source');
  }

  // ================================================================ the dojo
  for (const p of SLOTS) {
    const u = buildPost(p.x, p.z, p.x > 0 ? -Math.PI / 2 : Math.PI / 2);
    const stub = finish([[prism(chamferSq(0, 0, 0.16, 0.16, 0.04), 0, range(br, 0.4, 0.65), 1), WOOD]], p.x, p.z, 0);
    piece({
      kind: 'post', scene: 'dojo', mat: 'wood', look: 'prop', x: p.x, z: p.z, r: u.r, h: geosHeight(u.geos), geos: u.geos,
      colliders: [colliders.add(p.x, p.z, 0.22, 'trunk')], broken: { geos: stub, r: 0.18 }, hp: 1.4, topples: true, lift: 1, cover: false,
    }, 16);
  }
  for (const p of panels) {
    const geos = finish(screenParts(rng), p.x, p.z, p.yaw, () => 0.9);
    const stub = finish([[box(H.panel, 0.26, 0.16, 0, 0, 0), mul(WOOD, 0.8)]], p.x, p.z, p.yaw);
    piece({
      kind: 'screen', scene: 'dojo', mat: 'wood', look: 'prop', light: true, x: p.x, z: p.z, r: H.panel / 2, h: geosHeight(geos), geos,
      colliders: wallCols(p.x, p.z, p.ax, p.az, H.panel, 0.62), broken: { geos: stub }, hp: 0.7, topples: false, lift: 0, cover: false,
    }, 14);
  }
  for (const [x, z] of [[-14.8, -10], [14.8, -10], [-14.8, 9.5], [14.8, 9.5]]) {
    const geos = finish(rackParts(rng), x, z, x > 0 ? -Math.PI / 2 : Math.PI / 2, () => 0.9);
    piece({
      kind: 'rack', scene: 'dojo', mat: 'wood', look: 'prop', light: true, x, z, r: 0.9, h: geosHeight(geos), geos,
      colliders: [colliders.add(x, z - 0.5, 0.35, 'trunk'), colliders.add(x, z + 0.5, 0.35, 'trunk')], hp: 0.7, topples: false, lift: 1, cover: false,
    }, 10);
  }
  for (const sx of [-1, 1]) {
    const x = sx * 2.25, z = -13.9;
    const geos = finish(daisParts(4.4, 2.6), x, z, 0, () => 0.85);
    piece({
      kind: 'dais', scene: 'dojo', mat: 'wood', look: 'prop', x, z, r: 2.2, h: geosHeight(geos), geos,
      colliders: [-1.5, 0, 1.5].map((t) => colliders.add(x + t, z, 0.75, 'trunk')), hp: 2.5, topples: false, lift: 0, cover: false,
    }, 12);
  }

  // ================================================================ the Source
  for (const p of SLOTS) {
    const u = buildCodePillar(rng, p.x, p.z);
    piece({
      kind: 'codePillar', scene: 'source', mat: 'stone', look: 'prop', x: p.x, z: p.z, r: u.r, h: geosHeight(u.geos), geos: u.geos,
      colliders: [colliders.add(p.x, p.z, 0.5, 'stone')],
      broken: { geos: buildRubble(br, p.x, p.z, 0.46, { col: mul(CODE_EDGE, 0.6), h: range(br, 0.6, 1.0) }), r: 0.45 }, hp: 3.0, topples: true, lift: 1, cover: true,
    }, 26);
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
  breakables.push(...breakableFloor({ slabs: floor, slabGeos, slabMesh, mat: slabMat, rng: mulberry32(CONFIG.seed + 7157), group, earth: [0.03, 0.04, 0.034] }).defs);

  const scenes = makeScenes(U, base);
  const sky = SCENE_LIGHT.hall;
  return {
    group, treeSpots: [], bare, slabs, nest: { x: H.wait.x, z: H.wait.z }, bonfire: { x: bf.x, z: bf.z },
    material: mat, stoneMaterial: stoneMat, slabMaterial: slabMat,
    breakables, scenes, look,
    ambience: makeAmbience(scenes),
    scarInk: look === 'b' ? [0.03, 0.2, 0.1] : [0.012, 0.02, 0.014],
    floorCarry: L.paving,
    sky: { moonColor: sky.moon, ambient: sky.ambient, fogColor: sky.fog, fogNear: sky.near, fogFar: sky.far },
    // no grass: a written world (bare dark ground round the hall, the Source's black)
    grass: { density: () => 0 },
  };
}

// ================================================================ the scenes
const INTACT = 0, HELD = 3, FLYING = 4;
const DIGITS = '0123456789';
const GREEN_BURST = [0.25, 1.5, 0.55], GREEN_END = [0.02, 0.22, 0.07];

/** The scenes object (see the contract at the top). `base`: the script wave's strength per scene. */
function makeScenes(U, base) {
  let game = null;
  const home = SCENES[0];
  // the morph's queue: { b, d, on (it stands in the new scene), floor }, reused records
  const pool = [];
  const q = [];
  const rec = (b, d, on, fl) => {
    const r = pool[q.length] ?? (pool[q.length] = { b: null, d: 0, on: false, floor: false });
    r.b = b;
    r.d = d;
    r.on = on;
    r.floor = fl;
    q.push(r);
  };
  const byD = (a, b) => a.d - b.d;
  const pc = [1, 1, 1], pe = [0, 0, 0];
  const p = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, size: 0.22, sizeEnd: 0.14, glyph: DIGITS, color: pc, colorEnd: pe, alpha: 1, alphaEnd: 0, gravity: -6, drag: 0.6, spin: 0, rot: 0, flicker: 0 };
  const light = { moon: [0, 0, 0], ambient: [0, 0, 0], fog: [0, 0, 0], near: 30, far: 62, lamp: 0, rain: 1 };
  const S = {
    ids: SCENES,
    now: home,
    k: 1,
    holdT: 0,
    stutterT: 0,
    stutterDur: 0.12,
    /** the script wave's strength now (eased), and what a pulse asks */
    scriptK: base[home] ?? 0,
    scriptWant: 0,
    _scriptT: 0,
    /** the hall has been left since the reset (the phase-2 hall's four more watchers) */
    left: false,
    base,
    /** the light shown now (SCENE_LIGHT, eased over a morph) */
    light,
    /** the running morph: on, from, to, x, z, t, R (m to its last piece), v (m/s), i (next in q), front (m) */
    m: { on: false, from: home, to: home, x: 0, z: 0, t: 0, R: 1, v: 18, i: 0, front: 0 },
    /** the pieces that belong to a scene, and the floor (built when the world's breakables exist) */
    _pieces: null,
    _floor: null,
    _lit: false,
    lamps: [],
    bind(g) {
      game = g;
    },
    _des() {
      return game?.world?.destructibles ?? null;
    },
    /** The world's pieces of the scenes (once): the watchers' debris turned green. */
    _index() {
      if (this._pieces) return true;
      const D = this._des();
      if (!D?.list?.length) return false;
      this._pieces = D.list.filter((b) => b.scene !== null || Array.isArray(b.def?.within));
      this._floor = D.floor ?? [];
      for (const b of this._pieces) {
        // (a watcher bursts into green digits: its debris in the code's colour, not the stone's)
        if (b.kind === 'watcher' && b.M) b.M = Object.freeze({ ...b.M, color: GREEN_BURST, colorEnd: GREEN_END, dust: '.,' });
      }
      return true;
    },
    /** Does piece b stand in scene `id`? */
    member(b, id) {
      const w = b.def?.within;
      if (Array.isArray(w)) return w.includes(id) && (b.def.later !== true || this.left);
      return b.scene === id;
    },
    /** A piece lets go: its letters fall as one-cell digits in its own dim hue (fx.alpha). */
    burst(b, green = false) {
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
        p.vx = (ox / ol) * (0.3 + 0.6 * h);
        p.vz = (oz / ol) * (0.3 + 0.6 * h);
        p.vy = 0.2 + 0.8 * hash2(i * 3.3, b.id * 0.7);
        p.life = 0.55 + 0.5 * h;
        if (green) {
          p.color = GREEN_BURST;
          p.colorEnd = GREEN_END;
        } else {
          const c = (p.color = pc), e = (p.colorEnd = pe), mx = Math.max(s[k + 3], s[k + 4], s[k + 5], 0.02);
          // (its own hue, lifted so a dark piece's letters still read as they fall; never a flash)
          const g = Math.min(2.4, 0.5 / mx);
          c[0] = s[k + 3] * g; c[1] = s[k + 4] * g; c[2] = s[k + 5] * g;
          e[0] = c[0] * 0.25; e[1] = c[1] * 0.25; e[2] = c[2] * 0.25;
        }
        p.rot = 0;
        fx.spawn(p);
      }
    },
    /** One entry of the morph's queue: the old piece lets go, the new one prints in (whole), a slab is whole again. */
    _step(e, fx) {
      const D = this._des(), b = e.b;
      if (!D) return;
      if (e.floor) {
        if (b.state === HELD || b.state === FLYING) return;
        D.present(b, false);
        D.present(b, true);
        return;
      }
      if (!e.on) {
        if (!b.absent) {
          if (fx && b.state === INTACT) this.burst(b);
          D.present(b, false);
        }
        return;
      }
      if (!b.absent) D.present(b, false); // (a broken one of both scenes: whole again)
      D.present(b, true);
      this._clear(b);
    },
    /** An actor standing where piece b printed is pushed out of its circles (never trapped). */
    _clear(b) {
      const W = game?.world;
      for (const a of [game?.player, game?.dragon]) {
        const pos = a?.position;
        if (!pos || !b.colliders?.length) continue;
        const rad = fin(a.radius, a.T?.radius ?? 0.5);
        let moved = false;
        for (const c of b.colliders) {
          let dx = pos.x - c.x, dz = pos.z - c.z;
          const min = c.r + rad + 0.02;
          let d = Math.hypot(dx, dz);
          if (d >= min) continue;
          if (d < 1e-3) {
            // (dead on its centre: out away from the morph's centre, else toward the middle of the hall)
            dx = c.x - this.m.x;
            dz = c.z - this.m.z;
            d = Math.hypot(dx, dz);
            if (d < 1e-3) {
              dx = -c.x;
              dz = -c.z + 1e-3;
              d = Math.hypot(dx, dz);
            }
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
    /** Apply every step left of the running morph at once (no letting go: a new call cut it short). */
    _finish() {
      const m = this.m;
      if (!m.on) return;
      for (; m.i < q.length; m.i++) this._step(q[m.i], false);
      m.on = false;
      this.k = 1;
      this._lit = false;
    },
    to(id, o = null) {
      if (!SCENES.includes(id)) return false;
      if (!this._index()) {
        // (no world yet: the stub's way, at once)
        if (id === this.now) return false;
        this.now = id;
        return true;
      }
      if (this.m.on) this._finish();
      if (id === this.now) return false;
      const D = this._des();
      const from = this.now;
      if (id !== home) this.left = true;
      this.now = id;
      D.sceneNow = id;
      const m = this.m;
      m.x = fin(o?.x);
      m.z = fin(o?.z);
      q.length = 0;
      let R = 0;
      for (const b of this._pieces) {
        const want = this.member(b, id);
        const has = !b.absent;
        if (want === has && !(want && (b.state !== INTACT || b.hp < b.hpMax))) continue;
        const d = Math.hypot(b.x - m.x, b.z - m.z);
        rec(b, d, want, false);
        if (d > R) R = d;
      }
      for (const b of this._floor) {
        if (b.absent || (b.state === INTACT && !b.cracked && !(b.hp < b.hpMax))) continue;
        const d = Math.hypot(b.x - m.x, b.z - m.z);
        rec(b, d, true, true);
        if (d > R) R = d;
      }
      q.sort(byD);
      const speed = Math.max(1, fin(o?.speed, HALL.morph.speed));
      m.R = Math.max(R + 1, 4);
      m.v = Math.max(speed, m.R / (HALL.morph.max - 0.05));
      m.from = from;
      m.to = id;
      m.t = 0;
      m.i = 0;
      m.front = 0;
      m.on = true;
      this.k = 0;
      this._lit = false;
      game?.events?.emit?.('world:scene', { id, x: m.x, z: m.z });
      return true;
    },
    snap(id) {
      if (!SCENES.includes(id)) return false;
      this._finish();
      if (id !== home) this.left = true;
      this.now = id;
      this.m.from = this.m.to = id;
      this.k = 1;
      this._lit = false;
      if (!this._index()) return true;
      const D = this._des();
      D.sceneNow = id;
      for (const b of this._pieces) {
        const want = this.member(b, id);
        if (want && !b.absent && b.state === INTACT) continue;
        if (!b.absent) D.present(b, false);
        if (want) {
          D.present(b, true);
          this._clear(b);
        }
      }
      return true;
    },
    reset() {
      // (world.restore has put every piece back as the destructibles' reset leaves them: the first scene's)
      this.m.on = false;
      this.m.from = this.m.to = home;
      q.length = 0;
      this.now = home;
      this.left = false;
      this.k = 1;
      this.holdT = 0;
      this.stutterT = 0;
      this._scriptT = 0;
      this.scriptK = base[home] ?? 0;
      this._lit = false;
      const D = this._des();
      if (D && this._index()) {
        D.sceneNow = home;
        for (const b of this._pieces) if (this.member(b, home) === !!b.absent) D.present(b, this.member(b, home));
      }
      if (U?.uScript) U.uScript.value.set(this.scriptK, 0, 0, 0);
      if (U?.uScriptF) U.uScriptF.value.set(HALL.morph.width, 0, 0, 0);
      this._writeLight(1);
    },
    hold(sec) {
      this.holdT = Math.max(this.holdT, fin(sec));
    },
    stutter(sec = 0.12) {
      const s = Math.max(0.04, fin(sec, 0.12));
      this.stutterT = s;
      this.stutterDur = s;
    },
    script(k, sec = 0) {
      this.scriptWant = clamp(fin(k), 0, 2);
      this._scriptT = Math.max(0, fin(sec));
    },
    get morphing() {
      return this.m.on;
    },
    /** The light: the blend of the morph's two scenes by w (0 its first, 1 its second), into U. */
    _writeLight(w) {
      const A = SCENE_LIGHT[this.m.on ? this.m.from : this.now] ?? SCENE_LIGHT.hall;
      const B = SCENE_LIGHT[this.m.on ? this.m.to : this.now] ?? SCENE_LIGHT.hall;
      for (const key of ['moon', 'ambient', 'fog']) for (let i = 0; i < 3; i++) light[key][i] = A[key][i] + (B[key][i] - A[key][i]) * w;
      light.near = A.near + (B.near - A.near) * w;
      light.far = A.far + (B.far - A.far) * w;
      light.lamp = A.lamp + (B.lamp - A.lamp) * w;
      light.rain = A.rain + (B.rain - A.rain) * w;
      if (U?.uMoonColor?.value) {
        U.uMoonColor.value.setRGB(light.moon[0], light.moon[1], light.moon[2]);
        U.uAmbient?.value?.setRGB(light.ambient[0], light.ambient[1], light.ambient[2]);
        U.uFogColor?.value?.setRGB(light.fog[0], light.fog[1], light.fog[2]);
        if (U.uFogNear) U.uFogNear.value = light.near;
        if (U.uFogFar) U.uFogFar.value = light.far;
      }
      for (const l of this.lamps) if (l) l.intensity = 1.7 * light.lamp;
    },
    update(dt) {
      if (!(dt >= 0)) dt = 0;
      this._index();
      if (this.holdT > 0) this.holdT = Math.max(0, this.holdT - dt);
      const m = this.m;
      let w = 1;
      if (m.on) {
        m.t += dt;
        m.front = Math.min(m.R, m.t * m.v);
        while (m.i < q.length && q[m.i].d <= m.front) this._step(q[m.i++], true);
        // the old scene's wreckage sinks as the front passes it
        const live = this._des()?.wreck?.live;
        if (live) for (const e of live) if (e.sink <= 0 && Math.hypot(e.x - m.x, e.z - m.z) <= m.front) e.sink = 1e-3;
        this.k = m.front / m.R;
        w = smooth(this.k);
        if (m.front >= m.R && m.i >= q.length) {
          m.on = false;
          this.k = 1;
          w = 1;
        }
        this._writeLight(w);
        this._lit = !m.on;
      } else if (!this._lit) {
        this._writeLight(1);
        this._lit = true;
      }
      // the script wave: the scene's own (eased across the morph), a pulse over it while one is asked
      const bFrom = base[m.on ? m.from : this.now] ?? 0, bTo = base[m.on ? m.to : this.now] ?? 0;
      let want = bFrom + (bTo - bFrom) * w;
      if (this._scriptT > 0) {
        this._scriptT = Math.max(0, this._scriptT - dt);
        want = Math.max(want, this.scriptWant);
      }
      this.scriptK += (want - this.scriptK) * (1 - Math.exp(-dt * (want > this.scriptK ? 14 : 4)));
      if (Math.abs(want - this.scriptK) < 1e-3) this.scriptK = want;
      // deja vu: a cell sideways, a cell back the other way, still
      let shift = 0;
      if (this.stutterT > 0) {
        this.stutterT = Math.max(0, this.stutterT - dt);
        const ph = 1 - this.stutterT / this.stutterDur;
        shift = this.stutterT > 0 ? (ph < 0.55 ? 1 : -1) : 0;
      }
      const fs = m.on ? 1 - smooth(clamp((this.k - 0.85) / 0.15, 0, 1)) : 0;
      if (U?.uScript) U.uScript.value.set(this.scriptK, m.x, m.z, m.on ? Math.max(0.01, m.front) : 0);
      if (U?.uScriptF) U.uScriptF.value.set(HALL.morph.width, fs, shift, 0);
    },
  };
  return S;
}

// ================================================================ the falling script
/** The rain's budget: cells at once (desktop, LOW), a column's length in cells (walls, the Source). */
export const RAIN = Object.freeze({ max: 320, low: 140, len: Object.freeze([8, 12]), lenSource: Object.freeze([11, 17]), cell: 0.25, speed: Object.freeze([2.4, 4.4]) });
const HEAD = [1.0, 2.4, 1.3], TAIL = [0.07, 0.85, 0.28];

/**
 * The set's ambience (atmosphere.js runs it in place of the fireflies): the scenes' clock, the light,
 * and THE FALLING SCRIPT: one glyph-particle batch (additive) of world-anchored columns of one-cell
 * digits falling, a bright head and a dimming tail. In the hall and the dojo a column runs down the
 * face of a standing wall piece (it goes when the piece does); in the Source, columns stand all round
 * the floor in the dark. Its own random stream (never Math.random: the seeded sims replay the AI).
 */
function makeAmbience(scenes) {
  let seed = 0x7a3b19c5;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  let sys = null, game = null, off = null;
  const NCOL = Math.ceil(RAIN.max / RAIN.len[0]);
  const LEN = RAIN.lenSource[1];
  const DIG = [...'0123456789'].map(gi);
  const digit = () => DIG[Math.floor(rnd() * 9.999)];
  const cols = Array.from({ length: NCOL }, () => ({ on: false, wait: rnd() * 1.5, x: 0, z: 0, top: 0, bot: 0, head: 0, speed: 3, len: 8, piece: null, g: new Uint8Array(LEN) }));
  const rec = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 10, size: 0.24, sizeEnd: 0.24, glyph: 0, color: [0, 0, 0], colorEnd: [0, 0, 0], alpha: 1, alphaEnd: 1, rot: 0, spin: 0, drag: 0, gravity: 0, flicker: 0 };
  const walls = [];
  let wallsOf = null;
  const st = { count: 0, budget: RAIN.max };
  /** A column's place: a standing wall piece of the scene near the camera's focus, else the ring round the floor. */
  const seat = (c) => {
    const f = game?.U?.uFocus?.value ?? { x: 0, z: 0 };
    const src = scenes.now === 'source';
    c.piece = null;
    if (!src) {
      if (wallsOf !== scenes.now) {
        walls.length = 0;
        for (const b of scenes._pieces ?? []) if ((b.kind === 'wall' || b.kind === 'liftDoor' || b.kind === 'screen') && scenes.member(b, scenes.now)) walls.push(b);
        wallsOf = scenes.now;
      }
      let best = null, bd = Infinity;
      for (let t = 0; t < 4 && walls.length; t++) {
        const b = walls[Math.floor(rnd() * walls.length)];
        if (b.absent || b.state !== INTACT) continue;
        const d = Math.hypot(b.x - f.x, (b.z - f.z) * 1.3) + rnd() * 6;
        if (d < bd) {
          bd = d;
          best = b;
        }
      }
      if (!best) return false;
      // along its face, a little in front of it (toward the middle of the hall)
      const along = (rnd() - 0.5) * (HALL.panel - 0.5);
      const north = Math.abs(best.z + HALL.wall) < 0.5;
      const inX = north ? 0 : -Math.sign(best.x), inZ = north ? 1 : 0;
      c.x = best.x + (north ? along : 0) + inX * 0.42;
      c.z = best.z + (north ? 0 : along) + inZ * 0.42;
      c.top = best.h - 0.35;
      c.bot = 0.15;
      c.len = RAIN.len[0] + Math.floor(rnd() * (RAIN.len[1] - RAIN.len[0] + 1));
      c.piece = best;
    } else {
      // all round the floor in the dark (biased into the camera's view)
      for (let t = 0; t < 6; t++) {
        const a = rnd() * Math.PI * 2, r = 16.8 + rnd() * 9;
        c.x = Math.sin(a) * r;
        c.z = Math.cos(a) * r;
        if (Math.abs(c.x - f.x) < 24 && c.z - f.z < 14 && c.z - f.z > -22) break;
      }
      c.top = 4.5 + rnd() * 3.5;
      c.bot = 0;
      c.len = RAIN.lenSource[0] + Math.floor(rnd() * (RAIN.lenSource[1] - RAIN.lenSource[0] + 1));
    }
    c.speed = RAIN.speed[0] + rnd() * (RAIN.speed[1] - RAIN.speed[0]);
    c.head = c.top + rnd() * 0.6;
    for (let i = 0; i < c.len; i++) c.g[i] = digit();
    c.on = true;
    return true;
  };
  return {
    /** the falling script now: cells drawn last frame, the budget */
    get rain() {
      return { count: st.count, budget: st.budget, columns: cols.filter((c) => c.on).length };
    },
    setup(g) {
      game = g;
      scenes.bind(g);
      // the prop letters' grid (the script wave runs down their columns): the pipeline's own vectors
      const pl = g.pipeline;
      if (pl?.artCell) SCRIPT_GRID.cell.value = pl.artCell;
      const an = pl?.asciiMat?.uniforms?.uPropAnchor?.value;
      if (an) SCRIPT_GRID.anchor.value = an;
      sys = new GlyphParticles(g.U, { max: RAIN.max, additive: true });
      g.pipeline?.registerParticles?.(sys);
      // the dojo's lamps (off but in the dojo)
      scenes.lamps = [-8.5, 8.5].map((x) => g.lights?.add?.({ x, y: 3.4, z: -10.5, color: LAMP, intensity: 0, radius: 15, flicker: 0.12 }) ?? null);
      // a watcher struck: it bursts into green digits
      off = g.events?.on?.('world:impact', (e) => {
        if (e?.kind !== 'break' || !(e.id >= 0)) return;
        const b = g.world?.destructibles?.list?.[e.id];
        if (b?.kind === 'watcher') scenes.burst(b, true);
      });
      void off;
      scenes.reset();
    },
    /** Lab (world.debug.setVisible): the rain goes with the rest of the set. */
    setVisible(on) {
      if (sys?.mesh) sys.mesh.visible = !!on;
    },
    hold(sec) {
      scenes.hold(sec);
    },
    flare() {},
    update(dt) {
      scenes.update(dt);
      if (!sys) return;
      const low = game?.settings?.quality === 0;
      st.budget = low ? RAIN.low : RAIN.max;
      const held = scenes.holdT > 0;
      const k = scenes.light.rain;
      const src = scenes.now === 'source';
      sys.clear();
      let used = 0;
      for (const c of cols) {
        if (!held) {
          if (c.on && c.piece && (c.piece.absent || c.piece.state !== INTACT)) {
            c.on = false;
            c.wait = 0.1 + rnd() * 0.5;
          }
          if (c.on && src !== !c.piece) {
            // (the scene changed under it: the wall columns go in the Source, the ring's out of it)
            c.on = false;
            c.wait = rnd() * 0.6;
          }
          if (!c.on) {
            c.wait -= dt;
            if (c.wait <= 0 && used + c.len <= st.budget && !seat(c)) c.wait = 0.3;
            if (!c.on) continue;
          }
          c.head -= c.speed * dt;
          if (c.head + c.len * RAIN.cell < c.bot) {
            c.on = false;
            c.wait = 0.2 + rnd() * 1.4;
            continue;
          }
          // the letters re-roll: the head often, the tail now and then
          if (rnd() < 0.5) c.g[0] = digit();
          if (rnd() < 0.15) c.g[1 + Math.floor(rnd() * (c.len - 1))] = digit();
        }
        if (!c.on) continue;
        if (used + c.len > st.budget) continue;
        for (let i = 0; i < c.len; i++) {
          const y = c.head + i * RAIN.cell;
          if (y > c.top || y < c.bot) continue;
          const t = i / c.len, fade = (1 - t) * (1 - t) * k;
          rec.x = c.x;
          rec.y = y;
          rec.z = c.z;
          rec.glyph = c.g[i];
          const col = i === 0 ? HEAD : TAIL, b = i === 0 ? k : fade;
          rec.color[0] = rec.colorEnd[0] = col[0] * b;
          rec.color[1] = rec.colorEnd[1] = col[1] * b;
          rec.color[2] = rec.colorEnd[2] = col[2] * b;
          sys.spawn(rec);
          used++;
        }
      }
      st.count = used;
      sys.update(dt, game?.time ?? 0);
    },
  };
}
