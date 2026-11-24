import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createAsciiObjectMaterial, createPropArtMaterial } from '../render/materials.js';
import { markCaster } from '../render/pipeline.js';
import { batchRigid } from '../render/rigidBatch.js';
import { TELL } from '../combat/rules.js';
import { BREAK, BLOW } from './breakTuning.js';
import { CONFIG } from '../core/config.js';
import { Wreckage } from './wreckage.js';
import { Edge } from './edge.js';
import { lumpy, carve, mul, slabGeometry, STONE, refine, brickEdge } from './forest.js';
import { lookOf } from '../entities/enemies/duelist/lookSwitch.js';
import { hangs, hangAttr, hangOf, hangLean } from './hang.js';
import { HANG } from './hangTuning.js';

// Breakable objects (ADR-107): the trees, stones, pillars and props of a set that blows can chip,
// break, fell, burn, lift and throw. A set lists them in its output (`breakables`) instead of merging
// them into its static meshes; this module gives each its own node, draws them all through two rigid
// batches (render/rigidBatch.js: one draw call per material however many there are, each piece free
// to move or vanish) and owns their state.
//
// A definition (a set's `breakables` entry):
//   kind      'tree' | 'deadTree' | 'stone' | 'boulder' | 'pillar' | 'lantern' | 'flagstone' | 'bone' | ...
//             (free; AI and tests read it)
//   mat       'wood' | 'stone' | 'metal' | 'bone' (BREAK.mats: structure, what bites, the debris)
//   look      'grid' (paint() attributes: the screen grid, trees) | 'prop' (carve() attributes: prop art)
//             | 'range' (its body is a run of vertices in a static mesh of the set: `range`, below)
//   x, z      its base (world);  r  footprint radius;  h  height
//   geos      its geometries in WORLD space (as the builders return them; they are moved to the base)
//   range     look 'range' only: { mesh, start, count } the vertices (non-indexed, world space) of its
//             body in a set's own merged mesh (the flagstones: their carved material stays the set's);
//             hidden by folding them under the ground. `broken.range` likewise for what is left.
//   colliders the Colliders circles it stands on (taken out when it goes, put back on reset)
//   broken    { geos | range, look?, r? } | null: what is left standing (a stump, a jagged base); r = its collider
//   hp        structure in POWER units (default: the material's × its size); Infinity = it only chips
//   topples   it falls over when it breaks (default: h >= BREAK.topple.minH)
//   burns     fire lights it (default: the material's)
//   cover     it stops projectiles (default: h >= BREAK.cover.minH)
//   lift      0 nobody can lift it · 1 a boss's body can (the wyrm's jaws) · 2 only the Void
//   leafy     0..1 share of its debris that is leaves (a canopy)
//   wreck     false: it leaves no wreckage (default: a felled tree leaves its trunk, a stone its rubble)
//   floor     true: a slab of a floor (2026-11-16; BREAK.floor): a blow's power falls off from its centre,
//             one sound per blow for all the slabs it strikes, no camera shake, no nicks, fewer chips;
//             `cracked: { range }` is shown once its structure is under BREAK.floor.crack of itself;
//             `broken.range` is its broken look (world/floor.js). In a boss's hands it shows as a block of
//             prop art
//   holds     (a two-stage piece: a colossus's legs) the def of the piece standing on it: while that one
//             stands, every blow on this one goes to it; while it falls this one takes nothing
//   y0        the height its node stands at (the upper half of a colossus: it falls from its cut, coming
//             down to the ground as it goes over); `fallOff` m out from its base it lands; `fallT` s it falls
//   blocks    how many big blocks of wreckage it leaves (a statue's), instead of a rubble pile
//   scene     (a set with `scenes`, ADR-157) the scene it stands in; absent from the others (present)
//   slice     true: one blade or blow cuts it through where it bit (a bamboo stalk; BREAK.slice): its top
//             slides off the cut at once and goes over from there, its stump cut on that slant
//   light     true: a light piece (a bamboo stalk, a planted sword; ADR-145): whoever fells it, its fall
//             is quiet (no combat:tell / flash, no blow on the hero, no ground mark, no domino sweep, no
//             camera shake, a soft crash), so a duelist's cue ledger never sees it
//
// The API (world.destructibles; every caller guards it with `?.`: the tests' world mocks lack it):
//   strike(x, z, r, power, o)             a blow / blast over a disc → how many it struck
//   sweep(ax, az, bx, bz, r, power, o)    ... along a segment (a blade's edge, a dash, a body part's step)
//   sweepRec(w, o)                        the same, the segment in a reused record { ax, az, bx, bz, r, power }
//   stop(ax, az, bx, bz, r, power, o)     a projectile's step: the first cover it meets takes `power`
//                                          and is returned (the caller ends its projectile), else null
//   coverAt(ax, az, bx, bz, r, y?)        the first cover on a segment, no damage (`coverT`: where, 0..1;
//                                         y: the shot's height, a raised piece above y + r is not in its way)
//   ignite(x, z, r, k)                    fire lands: wood in the disc catches (and logs lying there)
//   nearest(x, z, o)                      the nearest intact piece ({ maxDist, minDist, lift, kind, mat })
//   floorNear(x, z, r, out, o)            the intact floor slabs within r of (x, z), nearest first, into `out`
//                                          (o: { kind, whole: true (not cracked), max }) → how many
//   floor                                 the floor's slabs (pieces with `floor`)
//   take(obj) / carry(obj, x, y, z, tilt, yaw) / throwTo(obj, tx, tz, o) / drop(obj)   lift and throw
//   topple(obj, dx, dz, by)               fell it that way
//   reserve(obj, sec)                     incidental blows (o.incidental: a body walking) leave it alone
//   setQuality(k)                         the phone budget (0.3 .. 1): debris, flames, wreckage, fires
//   present(obj, on)                      (scenes, ADR-157) a piece out of the world or back, whole
//   sceneHome / sceneNow                  (scenes) the first scene's id / the one shown (the set's scenes set it)
//   reset()                               everything stands again (on a set with scenes: the first scene's)
//   o = { kind: BLOW.*, by: 'player' | 'boss' | 'world', dx, dz (the blow's way), y (its height), src (one id per swing),
//         falloff: 0..1 (strike: the blast x 1 - falloff at its rim), brush: true (a body walking: BREAK.brush),
//         only: 'wood' | ... (just that material), spare: a piece to leave alone, incidental: true (skip reserved pieces),
//         down: true (a sweep that comes DOWN on the floor, a falling piece's strip: a slab takes it in full) }
// Every query walks a spatial grid (BREAK.grid.cell m), not the whole list.
// Events: 'world:impact' { kind: 'chip' | 'break' | 'topple' | 'crash' | 'burn' | 'burnout' | 'throw', mat, x, y, z, power, by }
// (one reused payload: a subscriber must not keep it), and 'combat:tell' / 'combat:flash' for a
// piece a boss felled (source 'world', red: be out from under it).
// No per-frame allocation: scratch vectors, reused hit, event and particle records.
// No per-frame scene-graph work for a piece that does not move (2026-11-16: the arenas' 456 / 222
// pieces cost the phone ~0.7 ms a frame in three.js's matrix updates): the pieces live in a tree
// outside the scene graph (`pieces`; only the batch's draw meshes are in the scene, under `root`),
// their nodes and pivots do not auto-update, and `_place` puts a piece's world matrices right
// whenever it moves (a break, a shudder, a fall, a carry, a throw, the reset). A floor slab (look
// 'range') has no node in that tree until a boss lifts it.

/** A brush's bite (BREAK.brush): what a blow `dmg` has over a share of the piece's structure, at least
 *  brushMin of it; a flat stone takes nothing. */
function brushed(b, dmg) {
  if (b.hpMax === Infinity) return dmg;
  if (b.mat === 'stone' && b.h < BREAK.brushFlat) return 0;
  const over = dmg - BREAK.brush * b.hpMax, least = dmg * BREAK.brushMin;
  return over > least ? over : least;
}

/**
 * A Group made without drawing on Math.random (three names every object with a random uuid): the
 * seeded sims replay Math.random, and one object more at the world's build shifted everything after
 * it (the wyrm's WRECKAGE fight on seed 1337 went 32 % → 28 % standing). Its uuid is from a stream
 * of its own.
 */
let uuidSeed = 0x51ed2701;
function quietGroup() {
  const r = Math.random;
  Math.random = () => (uuidSeed = (Math.imul(uuidSeed, 1664525) + 1013904223) >>> 0) / 4294967296;
  try {
    return new THREE.Group();
  } finally {
    Math.random = r;
  }
}

export const STATE = Object.freeze({ INTACT: 0, FALLING: 1, BROKEN: 2, HELD: 3, FLYING: 4, GONE: 5 });
const { INTACT, FALLING, BROKEN, HELD, FLYING, GONE } = STATE;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** Eased 0..1 (smoothstep of a 0..1 argument). */
const smooth01 = (t) => t * t * (3 - 2 * t);
const NONE = Object.freeze({});
const NO_PIECES = Object.freeze([]);
const LEAVES = 'o0O8@&';
const DIGITS = '0123456789';
const FLASH_LEAD = 0.3;
const SIDES = [-1, 1];
const HOT_END = [0.5, 0.04, 0.02];
// (a crown that wears down: its debris in the canopy's own dim hue, never a flash; STYLE.md "How things
// break". The particles draw after the grid with no light or fog on them: at [0.26, 0.42, 0.2] a stage's burst
// printed as pale yellow rings over the dark crowns. 2026-11-16, the tuning pass)
const SHED_LEAF = [0.085, 0.15, 0.1], SHED_LEAF_END = [0.03, 0.05, 0.035];
const SHED_WOOD = [0.16, 0.115, 0.075], SHED_WOOD_END = [0.06, 0.045, 0.03];
// (a bone landmark coming apart: its digits in the bone's own dull hue; at BREAK.mats.bone.color a rib
// broke in a white cloud brighter than the skeleton itself)
const SHED_BONE = [0.17, 0.16, 0.14], SHED_BONE_END = [0.06, 0.055, 0.05];
// a burning crown sheds: most of it charred leaves falling dark, a few small sparks (no yellow blobs)
const CHAR = [0.12, 0.06, 0.03], CHAR_END = [0.03, 0.02, 0.015];
const SPARK = [1.5, 0.5, 0.08], SPARK_END = [0.35, 0.04, 0.01], SPARKS = ".'`";

// cosmetic noise from this module's own stream (the seeded sims replay Math.random)
let seed = 0x3d9e42b1;
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
// (how a felled tree lies, BREAK.fell: a stream of its own, so the fire's spread and the leans above
// draw what they drew before ADR-128)
let lookSeed = 0x6a09e667;
const vr = () => (lookSeed = (Math.imul(lookSeed, 1664525) + 1013904223) >>> 0) / 4294967296;
const vin = (r) => r[0] + (r[1] - r[0]) * vr();
/** Restart this module's cosmetic streams (a test that hangs on a chance, the fire's spread, starts from a known point). */
export function reseedBreaks(s = 0x3d9e42b1) {
  seed = s >>> 0;
  lookSeed = (s ^ 0x5be0cd19) >>> 0;
}
/** A turn of (dx, dz) by `a` rad into out {dx, dz}. */
const turn = (dx, dz, a, out) => {
  const c = Math.cos(a), s = Math.sin(a);
  out.dx = dx * c - dz * s;
  out.dz = dx * s + dz * c;
  return out;
};
/** Cheap 2D hash 0..1 (a stump's splinters: the same for the vertices that share a corner). */
const h2 = (x, z) => {
  const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/** Distance from (px, pz) to the segment a → b; writes where along it (0..1) into `out.t`. */
function segDist(px, pz, ax, az, bx, bz, out) {
  const abx = bx - ax, abz = bz - az;
  const l2 = abx * abx + abz * abz;
  const t = l2 > 1e-9 ? clamp(((px - ax) * abx + (pz - az) * abz) / l2, 0, 1) : 0;
  out.t = t;
  return Math.hypot(ax + abx * t - px, az + abz * t - pz);
}

// ---------- bites (BREAK.chip): a piece is the bricks it is drawn with, its triangles ----------
/** The bite look now (`?chip=`; lookSwitch.js): 'a' the bricks under a blow are knocked out (the owner's
 *  pick, 2026-11-21: on by default, and under `?looks=old`, as a new thing keeps its pick), '0' off
 *  (pieces only wear down and break whole). Read at each blow; a level built with it on has finer
 *  bricks (forest.js `brickEdge`), so the Lab switches it with a reload. */
export const chipLook = () => lookOf('chip', 'a', 'a');
/** The hero's blade on a piece it does not cut through (`?cutStop=`): '0' it goes clean through (the
 *  owner's pick, 2026-11-23; BREAK.chip.pass), '1' it STOPS there as it did (ADR-132; BREAK.chip.stop).
 *  Read at each swing (player.js `_cutWorld`). */
export const cutStops = () => chipLook() !== '0' && lookOf('cutStop', '0', '0') !== '0';
const PICK_MAX = 128;
const PASS_MAX = 6; // pieces one blow's `struck.list` keeps
const PICK_D = new Float32Array(PICK_MAX), PICK_I = new Int32Array(PICK_MAX);
let pickK = 0;
/**
 * The bricks nearest (px, py, pz) among `T` centres `cen` (x, y, z each): those within `reach` that
 * are not gone yet (`bit[t]` 1; `tpart` / `shown`: nor in a part that dropped), nearest first, at most
 * `cap`, into PICK_I. Returns how many; `pickK` = every brick within reach, gone or not (the section the
 * blow covers). No allocation.
 */
function pickBricks(cen, T, bit, px, py, pz, reach, cap, tpart, shown) {
  const r2 = reach * reach;
  let n = 0, K = 0;
  if (cap > PICK_MAX) cap = PICK_MAX;
  for (let t = 0, k = 0; t < T; t++, k += 3) {
    const ex = cen[k] - px, ey = cen[k + 1] - py, ez = cen[k + 2] - pz;
    const d2 = ex * ex + ey * ey + ez * ez;
    if (d2 > r2) continue;
    K++;
    if (bit[t] === 1 || (tpart !== null && shown[tpart[t]] === 0)) continue;
    if (n < cap || d2 < PICK_D[n - 1]) {
      let j = n < cap ? n++ : n - 1;
      while (j > 0 && PICK_D[j - 1] > d2) {
        PICK_D[j] = PICK_D[j - 1];
        PICK_I[j] = PICK_I[j - 1];
        j--;
      }
      PICK_D[j] = d2;
      PICK_I[j] = t;
    }
  }
  pickK = K;
  return n;
}
/** How many of `n` picked bricks a blow takes: `share` of the section it covers, at least one. */
const biteCount = (n, share) => (n > 0 ? Math.min(n, Math.max(1, Math.round(share * pickK))) : 0);

/** Two triangles are one brick when they share their longest edge and their faces lie this flat together (the cosine between them). */
const BRICK_FLAT = 0.9;
/** ... and stand within this many triangles of each other in the mesh (the halves of a face are built side by side). */
const BRICK_NEAR = 40;
/**
 * Triangles grouped into bricks. `P`: every triangle's three corners (9 numbers each), `T` of them;
 * `pair(t, u)`: triangles t and u may be one brick (not foliage, the same part). Two triangles that
 * share an edge which is the longest of both (the diagonal of a face of a trunk, a slab, a pillar)
 * and lie nearly flat together are one brick, so a bite is block-shaped where the piece is. Returns
 * { n, tri (2 per brick, the second -1 for a lone triangle), cen (3 per brick), nor (its unit normal, 3 per brick) }.
 */
function makeBricks(P, T, pair) {
  const tri = new Int32Array(T * 2), cen = new Float32Array(T * 3), nor = new Float32Array(T * 3), area = new Float32Array(T), used = new Uint8Array(T);
  // each triangle's longest edge: its two corners (offsets 0, 3, 6 into its 9 numbers) and its length squared
  const ea = new Uint8Array(T), eb = new Uint8Array(T), el = new Float32Array(T);
  const d2 = (k, a, b) => (P[k + a] - P[k + b]) ** 2 + (P[k + a + 1] - P[k + b + 1]) ** 2 + (P[k + a + 2] - P[k + b + 2]) ** 2;
  for (let t = 0; t < T; t++) {
    const k = t * 9, l0 = d2(k, 0, 3), l1 = d2(k, 3, 6), l2 = d2(k, 6, 0);
    if (l0 >= l1 && l0 >= l2) { ea[t] = 0; eb[t] = 3; el[t] = l0; }
    else if (l1 >= l2) { ea[t] = 3; eb[t] = 6; el[t] = l1; }
    else { ea[t] = 6; eb[t] = 0; el[t] = l2; }
  }
  const same = (k, a, q, b) => Math.abs(P[k + a] - P[q + b]) + Math.abs(P[k + a + 1] - P[q + b + 1]) + Math.abs(P[k + a + 2] - P[q + b + 2]) < 1e-4;
  const normal = (k, out) => {
    const ux = P[k + 3] - P[k], uy = P[k + 4] - P[k + 1], uz = P[k + 5] - P[k + 2];
    const vx = P[k + 6] - P[k], vy = P[k + 7] - P[k + 1], vz = P[k + 8] - P[k + 2];
    out[0] = uy * vz - uz * vy;
    out[1] = uz * vx - ux * vz;
    out[2] = ux * vy - uy * vx;
  };
  const na = [0, 0, 0], nb = [0, 0, 0];
  let n = 0;
  for (let t = 0; t < T; t++) {
    if (used[t]) continue;
    used[t] = 1;
    const k = t * 9;
    let mate = -1;
    for (let u = t + 1; u < T && u <= t + BRICK_NEAR; u++) {
      if (used[u] || !pair(t, u)) continue;
      // the same edge, the longest of both
      if (Math.abs(el[u] - el[t]) > 1e-4 * (1 + el[t])) continue;
      const q = u * 9;
      if (!((same(k, ea[t], q, ea[u]) && same(k, eb[t], q, eb[u])) || (same(k, ea[t], q, eb[u]) && same(k, eb[t], q, ea[u])))) continue;
      normal(k, na);
      normal(q, nb);
      const l = Math.hypot(na[0], na[1], na[2]) * Math.hypot(nb[0], nb[1], nb[2]);
      if (l > 1e-14 && (na[0] * nb[0] + na[1] * nb[1] + na[2] * nb[2]) / l >= BRICK_FLAT) {
        mate = u;
        break;
      }
    }
    let x = 0, y = 0, z = 0;
    for (let a = 0; a < 9; a += 3) {
      x += P[k + a];
      y += P[k + a + 1];
      z += P[k + a + 2];
    }
    normal(k, na);
    const nl = Math.hypot(na[0], na[1], na[2]) || 1;
    nor[n * 3] = na[0] / nl;
    nor[n * 3 + 1] = na[1] / nl;
    nor[n * 3 + 2] = na[2] / nl;
    area[n] = nl * 0.5;
    let m = 3;
    if (mate >= 0) {
      used[mate] = 1;
      const q = mate * 9;
      normal(q, nb);
      area[n] += Math.hypot(nb[0], nb[1], nb[2]) * 0.5;
      for (let a = 0; a < 9; a += 3) {
        x += P[q + a];
        y += P[q + a + 1];
        z += P[q + a + 2];
      }
      m = 6;
    }
    cen[n * 3] = x / m;
    cen[n * 3 + 1] = y / m;
    cen[n * 3 + 2] = z / m;
    tri[n * 2] = t;
    tri[n * 2 + 1] = mate;
    n++;
  }
  return { n, tri, cen, nor, area };
}

/** Brick-depth search (brickSink): the grid's cell (m) and the share of a part's area-weighted normals
 *  left over under which it counts as closed (a trunk, a stone: they cancel; a sheet, an open cone: not). */
const SINK_CELL = 0.5, SINK_OPEN = 0.25, SINK_CONE = 0.75;
/**
 * How far each brick is knocked BACK into its piece when a blow takes it (BREAK.chip.sink), and which
 * way: a solid part (a trunk, a stone, a bone) keeps a skin there, set back, instead of a hole onto its
 * empty inside (a boulder opened onto black; a cut trunk looked as if it floated). Per brick: the wall
 * facing it across the part (the nearest brick of its group whose face looks back at it, along the
 * brick's own normal or against it) is its thickness there; it is set back `k` of that, at most `max`
 * m; under `min` (a thin part: no dent would show) it is folded away. Only walls within the depth that
 * can matter are looked for (max / k: thicker than that, it is set back `max` anyway), through a grid
 * of the bricks' centres; a brick with none that near is set back `max` if its part is CLOSED (its
 * area-weighted normals cancel out: a thick trunk, a big stone) and folded away if it is open (a
 * sheet, an open cone). `solid(i)`: brick i may be set back; `group(i)`: bricks of one part. Writes
 * the unit way in into `B.nor` and returns the depths. Build time only (a piece's first bite or the
 * warm-up): ~O(n), the Cinder Tree's trunk (3000 bricks) in a few ms.
 */
function brickSink(B, solid, group, k, max, min = 0) {
  // (the way in is written to a copy: every brick is judged against the faces as they were built)
  const n = B.n, C = B.cen, N = B.nor, A = B.area, dep = new Float32Array(n), inn = new Float32Array(N);
  const G = new Int32Array(n);
  let gMax = 0;
  for (let i = 0; i < n; i++) gMax = Math.max(gMax, (G[i] = group(i)));
  // is each part closed: its area-weighted normals sum to (nearly) nothing
  const sx = new Float64Array(gMax + 1), sy = new Float64Array(gMax + 1), sz = new Float64Array(gMax + 1), sa = new Float64Array(gMax + 1);
  for (let i = 0; i < n; i++) {
    const g = G[i], a = A ? A[i] : 1;
    sx[g] += N[i * 3] * a;
    sy[g] += N[i * 3 + 1] * a;
    sz[g] += N[i * 3 + 2] * a;
    sa[g] += a;
  }
  const closed = new Uint8Array(gMax + 1);
  for (let g = 0; g <= gMax; g++) closed[g] = sa[g] > 0 && Math.hypot(sx[g], sy[g], sz[g]) < SINK_OPEN * sa[g] ? 1 : 0;
  // the bricks' centres in a dense grid over their bounds (counting sort: `start[c]` .. `start[c + 1]` in
  // `items`); a cell's bricks of every group, the group checked per brick
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = C[i * 3], y = C[i * 3 + 1], z = C[i * 3 + 2];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  const nx_ = Math.max(1, Math.floor((x1 - x0) / SINK_CELL) + 1), ny_ = Math.max(1, Math.floor((y1 - y0) / SINK_CELL) + 1), nz_ = Math.max(1, Math.floor((z1 - z0) / SINK_CELL) + 1);
  const cellOf = new Int32Array(n), start = new Int32Array(nx_ * ny_ * nz_ + 1), items = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const cx = Math.min(nx_ - 1, Math.floor((C[i * 3] - x0) / SINK_CELL)), cy = Math.min(ny_ - 1, Math.floor((C[i * 3 + 1] - y0) / SINK_CELL)), cz = Math.min(nz_ - 1, Math.floor((C[i * 3 + 2] - z0) / SINK_CELL));
    start[(cellOf[i] = (cx * ny_ + cy) * nz_ + cz) + 1]++;
  }
  for (let c = 0; c < start.length - 1; c++) start[c + 1] += start[c];
  {
    const fill = start.slice(0, start.length - 1);
    for (let i = 0; i < n; i++) items[fill[cellOf[i]]++] = i;
  }
  // (a wall at `along` must lie within along / SINK_CONE of the brick: the cone the test below keeps)
  const reach = max / Math.max(1e-3, k), R = reach / SINK_CONE, ring = Math.ceil(R / SINK_CELL);
  for (let i = 0; i < n; i++) {
    if (!solid(i)) continue;
    const gi = G[i];
    const cx = C[i * 3], cy = C[i * 3 + 1], cz = C[i * 3 + 2], nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2];
    const c0 = cellOf[i], ix = Math.floor(c0 / (ny_ * nz_)), iy = Math.floor(c0 / nz_) % ny_, iz = c0 % nz_;
    // the nearest wall behind it (against its normal) and before it (a face wound the other way round)
    let back = Infinity, fore = Infinity;
    const ax0 = Math.max(0, ix - ring), ax1 = Math.min(nx_ - 1, ix + ring), ay0 = Math.max(0, iy - ring), ay1 = Math.min(ny_ - 1, iy + ring), az0 = Math.max(0, iz - ring), az1 = Math.min(nz_ - 1, iz + ring);
    for (let ax = ax0; ax <= ax1; ax++) {
      for (let ay = ay0; ay <= ay1; ay++) {
        const row = (ax * ny_ + ay) * nz_;
        for (let q = start[row + az0], e = start[row + az1 + 1]; q < e; q++) {
          const j = items[q];
          if (j === i || G[j] !== gi) continue;
          const vx = C[j * 3] - cx, vy = C[j * 3 + 1] - cy, vz = C[j * 3 + 2] - cz;
          const along = vx * nx + vy * ny + vz * nz, d = Math.hypot(vx, vy, vz);
          if (d < 1e-4 || d > R || Math.abs(along) < SINK_CONE * d) continue; // (not across from it)
          const facing = N[j * 3] * nx + N[j * 3 + 1] * ny + N[j * 3 + 2] * nz;
          if (along < 0 && facing < -0.3 && -along < back) back = -along;
          else if (along > 0 && facing < -0.3 && along < fore) fore = along;
        }
      }
    }
    let t = back, sign = -1;
    if (!(back < Infinity) && fore < Infinity) {
      t = fore;
      sign = 1;
    }
    // no wall within reach: a closed part is thicker than that (set back the most), an open one is a sheet
    if (!(t < Infinity)) {
      if (!closed[gi]) continue;
      t = reach;
    }
    // (a part too thin for a dent to show: the brick goes)
    if (t * k < min) continue;
    dep[i] = Math.min(max, t * k);
    inn[i * 3] = nx * sign;
    inn[i * 3 + 1] = ny * sign;
    inn[i * 3 + 2] = nz * sign;
  }
  B.nor = inn;
  return dep;
}

/**
 * The bricks of a piece drawn through the rigid batch (a stone, a pillar, a statue). A brick a blow
 * takes is set back into the piece (its triangles' corners moved in the batch's positions; BREAK.chip
 * `sink`), or, with no wall behind it, folded away in the batch's index (its three indices set to the
 * first: nothing is drawn of it). `reset()` puts both runs back. Centres are in the piece's own space
 * (its base at the origin). Built once per piece (`run`: rigidBatch.js `userData.batchRun`; `parts`:
 * the vertex counts of the geometries it was merged from, a trunk and its boughs).
 */
class MeshBricks {
  constructor(src, run, parts) {
    const g = src.geometry, pos = g.attributes.position, idx = g.index;
    this.index = run.mesh.geometry.index;
    this.i0 = run.i0 | 0;
    const T = (run.ic / 3) | 0;
    const P = new Float32Array(T * 9);
    for (let t = 0; t < T; t++) {
      for (let c = 0; c < 3; c++) {
        const v = idx ? idx.getX(t * 3 + c) : t * 3 + c;
        P[t * 9 + c * 3] = pos.getX(v);
        P[t * 9 + c * 3 + 1] = pos.getY(v);
        P[t * 9 + c * 3 + 2] = pos.getZ(v);
      }
    }
    // (its parts: triangles of one geometry pair up and face each other; an indexed source has none)
    const ends = [];
    if (!idx && Array.isArray(parts) && parts.reduce((a, v) => a + v, 0) === pos.count) for (let i = 0, a = 0; i < parts.length; i++) ends.push((a += parts[i]) / 3);
    const partOf = (t) => {
      let p = 0;
      while (p < ends.length - 1 && t >= ends[p]) p++;
      return p;
    };
    const B = makeBricks(P, T, (t, u) => partOf(t) === partOf(u));
    /** its bricks: how many, the triangles of each (2, the second -1), their centres, the way in, how far it is set back (0: folded) */
    this.T = B.n;
    this.tri = B.tri;
    this.cen = B.cen;
    this.saved = this.index.array.slice(this.i0, this.i0 + T * 3);
    this.bit = new Uint8Array(B.n);
    this.n = 0;
    this._ur = { start: this.i0, count: T * 3 };
    // setting a brick back moves its own corners: only where no triangle shares them (a non-indexed source)
    const S = BREAK.chip.sink, v0 = run.v0, nv = run.n;
    this.pos = !idx && Number.isInteger(v0) && nv === pos.count ? run.mesh.geometry.attributes.position : null;
    this.dep = this.pos ? brickSink(B, () => true, (i) => partOf(B.tri[i * 2]), S.k, S.max, S.min) : new Float32Array(B.n);
    this.nor = B.nor;
    this.v0 = v0 | 0;
    this.psaved = this.pos ? this.pos.array.slice(this.v0 * 3, (this.v0 + nv) * 3) : null;
    this._urP = { start: this.v0 * 3, count: (nv | 0) * 3 };
    this.moved = false;
  }

  /** Knock out `share` of the bricks within `reach` of the point (the piece's space), nearest first; each one's centre into `out` (x, y, z, 0). */
  bite(px, py, pz, reach, share, cap, out) {
    const n = biteCount(pickBricks(this.cen, this.T, this.bit, px, py, pz, reach, cap, null, null), share);
    const a = this.index.array, C = this.cen, N = this.nor;
    let folded = false, moved = false;
    for (let i = 0; i < n; i++) {
      const t = PICK_I[i], d = this.dep[t];
      this.bit[t] = 1;
      for (let j = 0; j < 2; j++) {
        const f = this.tri[t * 2 + j];
        if (f < 0) break;
        if (d > 0) {
          // set back along the way in (a non-indexed source: triangle f's corners are vertices 3f .. 3f + 2 of its run)
          const pa = this.pos.array, k = (this.v0 + f * 3) * 3, ox = N[t * 3] * d, oy = N[t * 3 + 1] * d, oz = N[t * 3 + 2] * d;
          for (let c = 0; c < 9; c += 3) {
            pa[k + c] += ox;
            pa[k + c + 1] += oy;
            pa[k + c + 2] += oz;
          }
          moved = true;
        } else {
          const k = this.i0 + f * 3;
          a[k + 1] = a[k + 2] = a[k];
          folded = true;
        }
      }
      out[i * 4] = C[t * 3];
      out[i * 4 + 1] = C[t * 3 + 1];
      out[i * 4 + 2] = C[t * 3 + 2];
      out[i * 4 + 3] = 0;
    }
    this.n += n;
    if (folded) queueRange(this.index, this._ur);
    if (moved) {
      this.moved = true;
      queueRange(this.pos, this._urP);
    }
    return n;
  }

  /** The share of its bricks that are gone. */
  get gone() {
    return this.T ? this.n / this.T : 0;
  }

  reset() {
    if (!this.n) return;
    this.index.array.set(this.saved, this.i0);
    this.bit.fill(0);
    this.n = 0;
    queueRange(this.index, this._ur);
    if (this.moved) {
      this.pos.array.set(this.psaved, this.v0 * 3);
      this.moved = false;
      queueRange(this.pos, this._urP);
    }
  }
}

/**
 * The body of a 'range' piece: a run of vertices in a static mesh of the set (the flagstones, every
 * tree of the forest, the landmarks' pieces). `visible = false` folds them into a point under the
 * ground; `true` puts them back. It may be split into PARTS (`range.parts`: vertex counts in order, a
 * tree's trunk and crown blobs): `show(i, on)` drops one part or puts it back (a tree that wears
 * down). And it may be POSED (`pose(q, px, py, pz)`: turned by a quaternion about its base and moved;
 * a tree that shudders, leans, falls or is carried): its vertices (and normals) are rewritten from
 * their home copy, so a range moves like a rigid piece without a bone of the rigid batch. Duck-types
 * what this module and the tests read of a mesh (`visible`, `geometry`). No allocation after build.
 */
class RangeBody {
  constructor(range, x, z) {
    this.mesh = range.mesh;
    this.geometry = range.mesh.geometry;
    this.start = range.start | 0;
    this.count = range.count | 0;
    const pos = this.geometry.attributes.position, nrm = this.geometry.attributes.normal;
    const s = this.start * 3, e = (this.start + this.count) * 3;
    this.home = pos.array.slice(s, e);
    this.nhome = nrm && nrm.itemSize === 3 && nrm.array.length >= e ? nrm.array.slice(s, e) : null;
    this.x = x;
    this.z = z;
    this._on = true;
    // a mesh of remains (a floor's cracked or broken slabs) is hidden while none of its runs shows:
    // it costs no draw call until the first one does (range.mesh.userData.foldAway)
    this.fold = !!range.mesh.userData?.foldAway;
    if (this.fold) range.mesh.userData.shown = (range.mesh.userData.shown ?? 0) + 1;
    // parts: cumulative ends (relative), shown flags, leafy flags, and each part's centre and size
    let P = Array.isArray(range.parts) ? range.parts.map((n) => n | 0) : null;
    if (!P || !P.length || P.reduce((a, n) => a + n, 0) !== this.count || P.some((n) => n < 0)) P = [this.count];
    this.ends = new Int32Array(P.length);
    let acc = 0;
    for (let i = 0; i < P.length; i++) this.ends[i] = acc += P[i];
    this.shown = new Uint8Array(P.length).fill(1);
    this.leaf = new Uint8Array(P.length);
    if (Array.isArray(range.leaf)) for (let i = 0; i < P.length; i++) this.leaf[i] = range.leaf[i] ? 1 : 0;
    this.centre = new Float32Array(P.length * 4); // x, y, z, radius (world, at home)
    for (let i = 0, a = 0; i < P.length; i++) {
      const b = this.ends[i];
      let cx = 0, cy = 0, cz = 0;
      const n = Math.max(1, b - a);
      for (let v = a; v < b; v++) {
        cx += this.home[v * 3];
        cy += this.home[v * 3 + 1];
        cz += this.home[v * 3 + 2];
      }
      cx /= n; cy /= n; cz /= n;
      let r = 0;
      for (let v = a; v < b; v++) r = Math.max(r, Math.hypot(this.home[v * 3] - cx, this.home[v * 3 + 1] - cy, this.home[v * 3 + 2] - cz));
      this.centre.set([cx, cy, cz, r], i * 4);
      a = b;
    }
    // the pose: R (3x3, row-major) about the base (x, 0, z), then moved by t
    this.R = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    this.t = new Float32Array(3);
    this.posed = false;
    this._wasPosed = false;
    this._pend = false;
    this._nDirty = false;
    this._urP = { start: this.start * 3, count: this.count * 3 };
    this._urN = { start: this.start * 3, count: this.count * 3 };
    this.mesh.userData.on = (this.mesh.userData.on ?? 0) + 1;
    // bites (BREAK.chip): its triangles are its bricks (two that make a flat quad are one). `bit[i]` 1 =
    // brick i is knocked out (its triangles folded onto their first corner). Made at its first bite:
    // the bricks' triangles, centres and parts
    this.tris = (this.count / 3) | 0;
    this.nb = 0;
    this.btri = null;
    this.bit = null;
    this.cen = null;
    this.tpart = null;
    this.pBit = null; // bricks gone per part
    this.pN = null; // bricks per part
    this.nBit = 0; // bricks gone
    /** a cut through it (a sliced stalk, BREAK.slice): its triangles below this height (at home) are folded away */
    this.cutY = 0;
    this.bnor = null; // the way into the piece, per brick
    this.bdep = null; // m it is set back when taken (0: folded away)
  }

  /** The bricks' centres, parts and flags, once (its first bite). */
  _bricks() {
    const ends = this.ends, leaf = this.leaf;
    const partOf = (t) => {
      let p = 0;
      while (p < ends.length - 1 && t * 3 >= ends[p]) p++;
      return p;
    };
    // (foliage falls leaf by leaf: its triangles stay single; a trunk's, a bone's, a slab's quads are bricks)
    const B = makeBricks(this.home, this.tris, (t, u) => {
      const p = partOf(t);
      return leaf[p] === 0 && partOf(u) === p;
    });
    this.nb = B.n;
    this.btri = B.tri;
    this.cen = B.cen;
    this.bit = new Uint8Array(B.n);
    this.tpart = new Uint8Array(B.n);
    this.pBit = new Uint16Array(ends.length);
    this.pN = new Uint16Array(ends.length); // bricks per part
    for (let i = 0; i < B.n; i++) this.pN[(this.tpart[i] = partOf(B.tri[i * 2]))]++;
    // a solid part's brick is set back into it, not opened onto its empty inside (foliage is holed)
    const S = BREAK.chip.sink, tp = this.tpart;
    this.bdep = brickSink(B, (i) => leaf[tp[i]] === 0, (i) => tp[i], S.k, S.max, S.min);
    this.bnor = B.nor;
  }

  /**
   * Knock out `share` of the bricks within `reach` of the point (world, at home), nearest first, at most
   * `cap`; each one's centre and part into `out` (x, y, z, part). Returns how many. No write: call
   * write() after.
   */
  bite(px, py, pz, reach, share, cap, out) {
    if (!this.tris || !this._on) return 0;
    if (!this.bit) this._bricks();
    const n = biteCount(pickBricks(this.cen, this.nb, this.bit, px, py, pz, reach, cap, this.tpart, this.shown), share);
    const C = this.cen;
    for (let i = 0; i < n; i++) {
      const t = PICK_I[i], p = this.tpart[t];
      this.bit[t] = 1;
      this.pBit[p]++;
      out[i * 4] = C[t * 3];
      out[i * 4 + 1] = C[t * 3 + 1];
      out[i * 4 + 2] = C[t * 3 + 2];
      out[i * 4 + 3] = p;
    }
    this.nBit += n;
    return n;
  }

  /** The share of part i's bricks that are gone. */
  partGone(i) {
    return this.pBit && this.pN[i] > 0 ? this.pBit[i] / this.pN[i] : 0;
  }

  /** The bricks that are gone, in the mesh's positions (after the parts are written): set back into the piece, or each triangle folded onto its first corner. */
  _writeBits(a, s) {
    const bit = this.bit, T = this.btri, D = this.bdep, N = this.bnor, R = this.R, posed = this.posed;
    for (let i = 0; i < this.nb; i++) {
      if (bit[i] === 0 || !this.shown[this.tpart[i]]) continue;
      const d = D[i];
      let ox = 0, oy = 0, oz = 0;
      if (d > 0) {
        const nx = N[i * 3] * d, ny = N[i * 3 + 1] * d, nz = N[i * 3 + 2] * d;
        if (posed) {
          ox = R[0] * nx + R[1] * ny + R[2] * nz;
          oy = R[3] * nx + R[4] * ny + R[5] * nz;
          oz = R[6] * nx + R[7] * ny + R[8] * nz;
        } else {
          ox = nx; oy = ny; oz = nz;
        }
      }
      for (let j = 0; j < 2; j++) {
        const t = T[i * 2 + j];
        if (t < 0) break;
        const k = s + t * 9;
        if (d > 0) {
          for (let c = 0; c < 9; c += 3) {
            a[k + c] += ox;
            a[k + c + 1] += oy;
            a[k + c + 2] += oz;
          }
        } else {
          a[k + 3] = a[k + 6] = a[k];
          a[k + 4] = a[k + 7] = a[k + 1];
          a[k + 5] = a[k + 8] = a[k + 2];
        }
      }
    }
  }

  /** A sliced stalk's top (BREAK.slice): its triangles whose centre (at home) lies below `cutY` folded to a point. */
  _writeCut(a, s) {
    const H = this.home, y = this.cutY;
    for (let t = 0; t < this.tris; t++) {
      const h = t * 9;
      if (H[h + 1] + H[h + 4] + H[h + 7] >= 3 * y) continue;
      const k = s + h;
      a[k + 3] = a[k + 6] = a[k];
      a[k + 4] = a[k + 7] = a[k + 1];
      a[k + 5] = a[k + 8] = a[k + 2];
    }
  }

  get parts() {
    return this.ends.length;
  }

  get visible() {
    return this._on;
  }

  set visible(v) {
    v = !!v;
    if (v === this._on) return;
    this._on = v;
    // (a mesh marked autoHide, the stumps, is drawn only while one of its bodies shows)
    const U = this.mesh.userData;
    U.on = (U.on ?? 0) + (v ? 1 : -1);
    if (U.autoHide) this.mesh.visible = U.on > 0;
    if (this.fold) {
      // (a floor's mesh of remains: the same rule, counted from its build)
      U.shown = Math.max(0, (U.shown ?? 0) + (v ? 1 : -1));
      this.mesh.visible = U.shown > 0;
    }
    this.write();
  }

  /** Show / drop part i (no write: call write() after a batch of changes). True if it changed. */
  show(i, on) {
    const v = on ? 1 : 0;
    if (i < 0 || i >= this.shown.length || this.shown[i] === v) return false;
    this.shown[i] = v;
    return true;
  }

  /** Every part back, upright, where it stood (no write). */
  home0() {
    this.cutY = 0;
    if (this.nBit > 0) {
      this.bit.fill(0);
      this.pBit.fill(0);
      this.nBit = 0;
    }
    this.shown.fill(1);
    this.R.set(IDENT3);
    this.t.fill(0);
    this.posed = false;
  }

  /** Turned by the quaternion q about its base and moved by (px, py, pz); writes. */
  pose(q, px = 0, py = 0, pz = 0) {
    const x = q.x, y = q.y, z = q.z, w = q.w;
    const R = this.R;
    R[0] = 1 - 2 * (y * y + z * z); R[1] = 2 * (x * y - z * w); R[2] = 2 * (x * z + y * w);
    R[3] = 2 * (x * y + z * w); R[4] = 1 - 2 * (x * x + z * z); R[5] = 2 * (y * z - x * w);
    R[6] = 2 * (x * z - y * w); R[7] = 2 * (y * z + x * w); R[8] = 1 - 2 * (x * x + y * y);
    this.t[0] = px; this.t[1] = py; this.t[2] = pz;
    this.posed = !(Math.abs(1 - Math.abs(w)) < 1e-7 && px === 0 && py === 0 && pz === 0);
    this.write();
  }

  /**
   * Give it another shape (a stump cut the way its tree was felled, ADR-128): `fn(home, nhome, col, orig)`
   * rewrites its home copy in place from `orig` (the shape it was built with), its normals and, when its
   * mesh has them, its colours (`aCol`, `col` starts as built). Never posed (a stump): its normals and
   * colours are written straight to the mesh. Its spare copies are made on the first call only.
   */
  reshape(fn) {
    if (!this.orig) {
      this.orig = this.home.slice();
      this.norig = this.nhome ? this.nhome.slice() : null;
      const c = this.geometry.attributes.aCol;
      if (c && c.itemSize === 3 && c.array.length >= (this.start + this.count) * 3) {
        this.cAttr = c;
        this.corig = c.array.slice(this.start * 3, (this.start + this.count) * 3);
        this.cwork = this.corig.slice();
        this._urC = { start: this.start * 3, count: this.count * 3 };
      }
    }
    this.home.set(this.orig);
    if (this.nhome) this.nhome.set(this.norig);
    if (this.cwork) this.cwork.set(this.corig);
    fn(this.home, this.nhome, this.cwork ?? null, this.orig);
    this._side(this.cwork);
    this.write();
  }

  /** Back to the shape it was built with (the fight's reset). */
  unshape() {
    if (!this.orig || !this.shaped) return;
    this.home.set(this.orig);
    if (this.nhome) this.nhome.set(this.norig);
    this._side(this.corig);
    this.shaped = false;
    this.write();
  }

  /** Its normals (unposed) and colours `col` straight into the mesh, queued for upload. */
  _side(col) {
    this.shaped = true;
    const s = this.start * 3;
    if (this.nhome) {
      const na = this.geometry.attributes.normal.array, NH = this.nhome;
      for (let k = 0; k < NH.length; k++) na[s + k] = NH[k];
      this._nDirty = true;
    }
    if (col && this.cAttr) {
      this.cAttr.array.set(col, s);
      this._cDirty = true;
    }
  }

  /** Rewrite its vertices: each shown part posed, the rest (or all of it, hidden) folded under the ground. */
  write() {
    const pos = this.geometry.attributes.position, a = pos.array, s = this.start * 3, H = this.home;
    const nrm = this.nhome ? this.geometry.attributes.normal : null, na = nrm?.array, NH = this.nhome;
    const R = this.R, posed = this.posed, bx = this.x, bz = this.z, tx = this.t[0] + bx, ty = this.t[1], tz = this.t[2] + bz;
    const nWrite = !!NH && (posed || this._wasPosed);
    for (let p = 0, v0 = 0; p < this.ends.length; p++) {
      const v1 = this.ends[p];
      if (!this._on || !this.shown[p]) {
        for (let v = v0; v < v1; v++) {
          const k = s + v * 3;
          a[k] = bx;
          a[k + 1] = -3;
          a[k + 2] = bz;
        }
      } else if (!posed) {
        // (a copy loop, not set(subarray): no view object made per part)
        for (let k = v0 * 3, e = v1 * 3; k < e; k++) a[s + k] = H[k];
        if (nWrite) for (let k = v0 * 3, e = v1 * 3; k < e; k++) na[s + k] = NH[k];
      } else {
        for (let v = v0; v < v1; v++) {
          const h = v * 3, k = s + h;
          const x = H[h] - bx, y = H[h + 1], z = H[h + 2] - bz;
          a[k] = R[0] * x + R[1] * y + R[2] * z + tx;
          a[k + 1] = R[3] * x + R[4] * y + R[5] * z + ty;
          a[k + 2] = R[6] * x + R[7] * y + R[8] * z + tz;
          if (nWrite) {
            const nx = NH[h], ny = NH[h + 1], nz = NH[h + 2];
            na[k] = R[0] * nx + R[1] * ny + R[2] * nz;
            na[k + 1] = R[3] * nx + R[4] * ny + R[5] * nz;
            na[k + 2] = R[6] * nx + R[7] * ny + R[8] * nz;
          }
        }
      }
      v0 = v1;
    }
    if (this.nBit > 0 && this._on) this._writeBits(a, s);
    if (this.cutY > 0 && this._on) this._writeCut(a, s);
    // (uploaded at the next flushRanges(): once a frame, one range per body however often it was written)
    if (nWrite) this._nDirty = true;
    if (!this._pend) {
      this._pend = true;
      PENDING.push(this);
    }
    this._wasPosed = posed;
  }

  /** Queue its run for upload (flushRanges). Its range records are its own: nothing is made per frame. */
  _flush() {
    this._pend = false;
    queueRange(this.geometry.attributes.position, this._urP);
    if (this._nDirty) {
      this._nDirty = false;
      const nrm = this.geometry.attributes.normal;
      if (nrm) queueRange(nrm, this._urN);
    }
    if (this._cDirty) {
      this._cDirty = false;
      queueRange(this.cAttr, this._urC);
    }
  }
}
const IDENT3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** Range bodies written since the last flush. */
const PENDING = [];
/** An attribute's run to upload: its own record (pushed once while three has not taken it yet). */
function queueRange(attr, rec) {
  const R = attr.updateRanges;
  if (R && !R.includes(rec)) R.push(rec);
  attr.needsUpdate = true;
}
/** Hand every range body written since the last call to three (Destructibles.update / reset call it). */
export function flushRanges() {
  for (let i = 0; i < PENDING.length; i++) PENDING[i]._flush();
  PENDING.length = 0;
}

export class Destructibles {
  constructor(game, world, set) {
    this.game = game;
    this.world = world;
    this._blob = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.5, size: 1, sizeEnd: 0.35, heat: 0.5, heatEnd: 0, drag: 1.0, gravity: 0, kind: 'fire' }; // the fire field's reused record
    // the glyph pools' reused record (spawn copies it; colours point at shared arrays or the scratch ones)
    this._p = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, size: 0.3, sizeEnd: 0.1, glyph: '.', color: null, colorEnd: null, alpha: 1, alphaEnd: 0, gravity: 0, drag: 0, spin: 0, rot: 0, flicker: 0 };
    this._c0 = [1, 1, 1];
    this._c1 = [1, 1, 1];
    /** every breakable of the set, by id */
    this.list = [];
    /** those with something going on (falling, flying, burning, shuddering) */
    this.active = [];
    this.root = new THREE.Group();
    this.root.name = 'breakables';
    /**
     * The pieces themselves (their nodes, pivots and meshes, the wreckage's pools, the carry pool): a
     * tree OUTSIDE the scene graph (three walks every node of the scene each frame, ~0.7 ms on a phone
     * for the arenas' 456 / 222 pieces). Only the rigid batch's meshes hang in `root`, in the scene;
     * the batch reads the pieces' world matrices, which `_place` keeps right whenever a piece moves.
     */
    this.pieces = quietGroup();
    this.pieces.name = 'breakablePieces';
    this.batch = null;
    this.wreck = null;
    /** the phone budget (setQuality): debris, flames, wreckage, fires */
    this.q = 1;
    /** where along the segment the last coverAt / stop found its cover (0..1) */
    this.coverT = 1;
    this._src = 1;
    this._seg = { t: 0 };
    this._seg2 = { t: 0 };
    this._axis = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._q2 = new THREE.Quaternion();
    this._way = { dx: 0, dz: 1 };
    this._rShake = 0; // range pieces shuddering now (their vertices are rewritten: BREAK.wear.shakeMax)
    this._ev = { kind: '', mat: '', x: 0, y: 0, z: 0, power: 0, by: '', id: -1 };
    this._edgeEv = { x: 0, z: 0, reach: 0, lanes: 0, first: false };
    this._tell = { source: 'world', attack: 'fallingDebris', tell: TELL.RED, impactIn: 0, x: 0, z: 0, hazard: true };
    this._flash = { source: 'world', attack: 'fallingDebris', tell: TELL.RED, x: 0, y: 0.6, z: 0, hazard: true };
    this._heroHit = {
      damage: 0, from: { x: 0, z: 0 }, knockback: 0, knockdown: true, kind: 'crush', tell: TELL.RED,
      parryable: false, blockable: false, attack: 'fallingDebris', attacker: null, plunge: false, perfect: false,
    };
    this._bossHit = { damage: 0, exact: true, heavy: true, posture: 0, point: { x: 0, y: 1, z: 0 }, dir: { x: 0, z: 1 }, part: 'body', world: true };
    this._flyBlow = { kind: BLOW.BLUNT, by: 'boss', dx: 0, dz: 0, y: 1, src: -1, spare: null };
    this._sw = { ax: 0.5, az: 0.5, bx: 0.5, bz: 0.5, r: 0.5, power: 0.5 }; // sweep()'s segment (sweepRec)
    this._gr = { a: 0, b: -1, c: 0, d: -1 }; // the grid cells a query covers (cx a..b, cz c..d)
    this._nb = { best: null, bd: 0 }; // nearest()'s running best
    this._g = null;
    this._maxR = 0;
    /** the floor's slabs (pieces with `floor`) */
    this.floor = [];
    this._quiet = 0; // floor slabs struck by the current blow (one sound per blow)
    this._carry = []; // meshes for floor slabs in a boss's hands (BREAK.floor.carry)
    this._near = []; // floorNear's scratch
    this._burningN = 0;
    this._tokens = BREAK.spread.bank;
    this._litTokens = BREAK.light.bank; // (fire that lands: BREAK.light)
    // the wall's own fire (BREAK.wall.fire): what burns beyond BREAK.wall.from, its budget of fire that lands
    // there and of fire spreading through it (the clearing's caps above stay the clearing's)
    this._wallBurning = 0;
    this._wallLit = BREAK.wall.fire.bank;
    this._wallSpread = BREAK.wall.fire.spreadBank;
    // the wind's fronts (wind()): trees waiting for a front to reach them, in slots (no allocation)
    const WQ = BREAK.wind.queue;
    this._wq = { n: 0, id: new Int32Array(WQ), t: new Float64Array(WQ), p: new Float32Array(WQ), dx: new Float32Array(WQ), dz: new Float32Array(WQ) };
    // debris glyphs a second (BREAK.debris: a roar's front strips hundreds of crowns at once)
    this._debris = BREAK.debris.bank;
    // bites (BREAK.chip): the bricks a blow took (x, y, z, part each), the radius of the blow being dealt,
    // and counts since the reset (the tests' report)
    this._bits = new Float32Array(PICK_MAX * 4);
    this._hangV = { x: 0, y: 0, z: 0 };
    this._hr = 0.6;
    this._hc = false; // the blow is over a disc: its centre
    this._hx = 0;
    this._hy = 1;
    this._hz = 0;
    this._lit = 0;
    this.bitten = 0;
    /**
     * What the last strike / sweep / stop met (the hero's blade reads it: a blade stops on what it
     * could not cut through, BREAK.chip.stop): `held` the first piece that held (null: none), where it
     * was struck (x, y, z), `broke` how many it broke. Reset at the start of each call. `n` / `list`:
     * every piece the call struck (at most PASS_MAX: { b, x, y, z, broke }, reused records), so a blade
     * passing through can mark its passage on each (player.js `_cutWorld`, BREAK.chip.pass).
     */
    this.struck = { held: null, x: 0, y: 0, z: 0, broke: 0, n: 0, list: Array.from({ length: PASS_MAX }, () => ({ b: null, x: 0, y: 0, z: 0, broke: false })) };
    // (a blade that passes through, `o.tx, o.tz`: its own travel on the ground; set while _hit deals it)
    this._tx = 0;
    this._tz = 0;
    this._carryHit = { x: 0, z: 0, piece: null };
    /** counts since the reset (the tests' wall report): wind fronts, trees they reached; carries, reached, lit */
    this.stat = { wind: 0, windTrees: 0, carry: 0, reached: 0, lit: 0 };
    /** the edge of the open ground (edge.js, ADR-125): null on a set without one */
    this.edge = null;
    /** scenes (ADR-157; a set with `scenes`): the first scene (what the reset shows) and the one shown
     *  now; a piece whose def names another scene is out of the world (present). null: no scenes */
    this.sceneHome = typeof set?.scenes?.ids?.[0] === 'string' ? set.scenes.ids[0] : null;
    this.sceneNow = this.sceneHome;

    const defs = Array.isArray(set?.breakables) ? set.breakables : [];
    if (!defs.length) return;
    const U = game.U;
    this.gridMat = createAsciiObjectMaterial(U, { fadeNearPlayer: true, side: THREE.DoubleSide, rigid: true });
    // (a set with something hanging, world/hang.js: its prop art answers the wind)
    const hang = defs.some((d) => d?.look === 'prop' && hangs(d.geos)) ? HANG.shader : null;
    this.propMat = createPropArtMaterial(U, { fadeNearPlayer: true, gain: set.stoneMaterial?.uniforms?.uGain?.value ?? 1, rigid: true, hang });
    for (const def of defs) this._build(def);
    // (a piece's `guard`: the definitions of the pieces that must go first)
    const byDef = new Map(this.list.map((o) => [o.def, o]));
    for (const o of this.list) if (Array.isArray(o.def.guard)) o.guards = o.def.guard.map((g) => byDef.get(g)).filter(Boolean);
    // two-stage pieces: the one standing on another (a colossus's upper half on its legs)
    for (const o of this.list) {
      if (!o.def.holds) continue;
      o.top = byDef.get(o.def.holds) ?? null;
      if (o.top) o.top.base = o;
    }
    this._buildGrid();
    // where the hero and the boss may go follows what stands of the set's wall (a set with `edge`)
    if (set.edge) this.edge = new Edge(this.list, set.edge);
    if (this.floor.length) this._buildCarry(set);
    // what the fight leaves lying (wreckage.js): its pools share the breakables' batch
    if (set.wreckage !== false) {
      const need = { bones: this.list.some((b) => b.mat === 'bone'), blocks: this.list.some((b) => b.blocks > 0), shards: this.floor.some((b) => b.lift > 0) };
      this.wreck = new Wreckage(game, world, this.pieces, this.propMat, this, need);
    }
    markCaster(this.pieces);
    set.group?.add(this.root);
    this.batch = batchRigid(U, this.pieces);
    // (the batch's draw meshes into the scene; the pieces' tree stays out of it)
    for (const m of [...this.pieces.children]) if (m.isMesh && (m.name === 'rigidBatch' || m.name === 'rigidShadow')) this.root.add(m);
    // the bricks of the pieces drawn through the batch (BREAK.chip): their triangles in its index and
    // positions, which a bite rewrites (a floor slab has stages of its own; a piece that only chips
    // keeps its shape). Only in a level built with bites on: without them the batch's buffers stay
    // static and nothing is made
    for (const b of chipLook() !== '0' ? this.list : NO_PIECES) {
      const run = b.ranged ? null : b.body.userData?.batchRun;
      if (!run?.mesh?.geometry?.index || b.floor || !(b.hpMax < Infinity)) continue;
      run.mesh.geometry.index.setUsage(THREE.DynamicDrawUsage);
      run.mesh.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
      b.bricks = new MeshBricks(b.body, run, b.body.geometry.userData?.parts);
    }
    // every range piece's bricks now, while the level loads (Cinderwood's ~620: ~0.2 s): made in play
    // they cost a frame a piece (a roar's front reaches the whole wall in half a second), and the frame
    // budget has no room for that. A piece's first bite makes them if they are not there yet
    if (chipLook() !== '0') for (const b of this.list) if (b.ranged && !b.floor && b.body.tris > 0) b.body._bricks();
    // every piece's world matrices from its static node, once (the sets stand at the world's origin:
    // nothing above the root moves); after that only a piece that moves is placed again (_place)
    this.pieces.updateMatrixWorld(true);
    // (a set with scenes: only the first scene's pieces stand at the start)
    if (this.sceneHome !== null) for (const b of this.list) if (b.scene !== null && b.scene !== this.sceneHome) this._absent(b);
    flushRanges();
  }

  // ------------------------------------------------------------------ build
  _mesh(geos, look, x, z, y = 0, fine = 0) {
    for (const g of geos) g.translate(-x, -y, -z);
    // (what hangs, world/hang.js: its mark into the attribute, before the cutting interpolates it)
    if (look === 'prop') hangAttr(geos);
    // (bites on, BREAK.chip: no face longer than a brick)
    if (fine > 0) for (const g of geos) refine(g, fine);
    const parts = geos.map((g) => g.attributes.position.count);
    const geo = geos.length === 1 ? geos[0] : mergeGeometries(geos);
    if (!geo) return null;
    // (its parts, for its bricks: MeshBricks)
    geo.userData.parts = parts;
    const m = new THREE.Mesh(geo, look === 'prop' ? this.propMat : this.gridMat);
    m.matrixAutoUpdate = false;
    return m;
  }

  _build(def) {
    const x = Number(def?.x), z = Number(def?.z);
    const ranged = def?.look === 'range';
    if (!Number.isFinite(x + z) || (ranged ? !(def.range?.mesh && def.range.count > 0) : !def.geos?.length)) return null;
    const M = BREAK.mats[def.mat] ?? BREAK.mats.stone;
    const r = Math.max(0.1, Number(def.r) || 0.5), h = Math.max(ranged ? 0.02 : 0.2, Number(def.h) || 2);
    const size = clamp(r / 0.5, 0.6, 2.4) * clamp(h / 3, 0.5, 2);
    const hpMax = def.hp ?? M.hp * size * (Number(def.hpK) > 0 ? Number(def.hpK) : 1);
    const y0 = ranged ? 0 : Number(def.y0) || 0;
    // (a piece that is bitten, BREAK.chip: its faces cut to brick size; one that only chips keeps its mesh)
    const body = ranged ? new RangeBody(def.range, x, z) : this._mesh(def.geos, def.look, x, z, y0, hpMax < Infinity && !def.floor ? brickEdge() : 0);
    if (!body) return null;
    const node = new THREE.Group();
    node.position.set(x, y0, z);
    // (static until it moves: _place)
    node.matrixAutoUpdate = false;
    node.updateMatrix();
    const pivot = new THREE.Group();
    pivot.matrixAutoUpdate = false;
    if (!ranged) pivot.add(body);
    node.add(pivot);
    let stub = null, crack = null;
    if (ranged && def.cracked?.range?.mesh) {
      crack = new RangeBody(def.cracked.range, x, z);
      crack.visible = false;
    }
    if (def.broken?.range?.mesh) {
      stub = new RangeBody(def.broken.range, x, z);
      stub.visible = false;
    } else if (def.broken?.geos?.length) {
      stub = this._mesh(def.broken.geos, def.broken.look ?? def.look, x, z, y0);
      if (stub) {
        stub.visible = false;
        node.add(stub);
      }
    }
    // (a floor slab's body is a run of the set's paving mesh: its node joins the graph only when lifted)
    if (!ranged) this.pieces.add(node);
    const wood = BREAK.mats[def.mat] && def.mat === 'wood';
    const colliders = Array.isArray(def.colliders) ? def.colliders.filter(Boolean) : [];
    // the wyrm's body ploughs through wood (Colliders.resolve(..., soft)): it fells it instead of being turned
    // (`soft: false`: a colossal trunk, the Cinder Tree's, turns it like stone)
    if (wood && def.soft !== false) for (const c of colliders) c.soft = true;
    // wearing down (a tree): the parts it drops, in order, and how many are gone by each stage
    const W = def.wear && ranged && body.parts > 1 ? def.wear : null;
    const order = W && Array.isArray(W.order) ? W.order.filter((i) => i > 0 && i < body.parts) : [];
    const o = {
      id: this.list.length, def, kind: def.kind ?? 'thing',
      // the scene it belongs to (ADR-157: a set with `scenes`), null: every scene; absent: out of the world
      scene: typeof def.scene === 'string' ? def.scene : null, absent: false, mat: BREAK.mats[def.mat] ? def.mat : 'stone', M,
      x, z, r, h, weight: def.weight ?? clamp(size, 0.5, 2.2),
      hp: hpMax, hpMax, state: INTACT,
      node, pivot, body, stub, crack, cracked: false, held: null,
      floor: !!def.floor, y0, fallOff: Number(def.fallOff) || 0, fallT: Number(def.fallT) || 0, blocks: def.blocks | 0, top: null, base: null,
      colliders,
      stubR: Number(def.broken?.r) || 0, stubCollider: null,
      burns: def.burns ?? !!M.burns,
      topples: def.topples ?? h >= BREAK.topple.minH,
      cover: def.cover ?? h >= BREAK.cover.minH,
      lift: def.lift ?? 0,
      leafy: clamp(Number(def.leafy) || 0, 0, 1),
      wrecks: def.wreck !== false,
      // its debris and marks print in prop art's digits (a landmark's bones and boughs: they are drawn so)
      digits: def.look === 'prop' || def.digits === true,
      ranged,
      // stages (BREAK.wear): `order` the parts it drops, `cut[k]` how many of them are gone at stage k + 1;
      // `wear` the stage it is at (0 whole .. 3 leaning); the lean, and its way
      order: Int16Array.from(order), cut: Int16Array.from(W && Array.isArray(W.cut) ? W.cut : []), wear: 0, dropped: 0,
      lean: 0, leanTo: 0, ldx: 0, ldz: 1, touched: false, quiet: false,
      // a light piece (a bamboo stalk, a planted sword; ADR-145): its fall is quiet whoever felled it
      lightPiece: def.light === true,
      // sliced (BREAK.slice): any blade or blow cuts it through where it bit; `cutY` the height of the cut
      slice: def.slice === true, cutY: 0,
      // a tree of the wall (beyond BREAK.wall.from): it falls mostly away from the arena
      wall: def.wall === true,
      // pieces that must be down before this one takes more than chips (the Cinder Tree's boughs guard its trunk)
      guards: null,
      // dynamics
      t: 0, T: 1, dx: 0, dz: 1, by: 'world', src: -1, srcT: -1e9, spare: 0,
      burn: 0, burnLife: 0, burnt: false, flame: 0, heatT: 0, light: null, carry: 0, spreadT: 0, gen: 0,
      shake: 0, shakeAmp: 0, mark: 0, windT: -1e9,
      told: false, flashed: false,
      // its bricks in the rigid batch's index (BREAK.chip; a range piece's are its body's)
      bricks: null,
      // what of it hangs in the wind (world/hang.js: { top, give } in its own space), or null
      hang: ranged ? null : hangOf(body.geometry),
      // thrown
      px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, ang: 0, tilt: 0, tx: 0, tz: 0, blast: 0, blastR: 0, onLand: null, flySrc: -1,
      on: false,
    };
    this.list.push(o);
    if (o.floor) this.floor.push(o);
    return o;
  }

  /**
   * Meshes for floor slabs in a boss's hands (BREAK.floor.carry): a slab's body is a run of vertices in
   * the set's paving mesh and cannot move, so a slab torn out of the floor shows as a block of prop art
   * (its hole shows the slab's broken look). Built once, batched with the rest.
   */
  _buildCarry(set) {
    const col = set.floorCarry ?? STONE;
    // a CHUNK of the slab, ~0.85 m across (a plate's 1.2 x that): never a sheet as tall as a man held
    // before him (2026-11-16, the owner's rule: nothing covers the fight)
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.283 + Math.sin(i * 2.3) * 0.35, r = 0.42 * (0.8 + 0.25 * Math.abs(Math.sin(i * 1.7 + 0.4)));
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    const g = slabGeometry(pts, { top: 0.2, inset: 0.05, drop: 0.04, bottom: 0 });
    lumpy(g, 0.03, 4, 7.7, new THREE.Vector3(0, 0.1, 0));
    carve(g, {
      col: (px, py, pz) => mul(col, 0.7 + 0.5 * Math.abs(Math.sin(px * 7.1 + pz * 5.3))),
      ao: (px, py) => 0.6 + 1.6 * py,
      edge: (px, py, pz, nx, ny) => (ny > 0.5 && ny < 0.95 ? 1 : 0),
    });
    for (let i = 0; i < BREAK.floor.carry; i++) {
      const m = new THREE.Mesh(g, this.propMat);
      m.matrixAutoUpdate = false;
      m.visible = false;
      m.name = 'floorCarry';
      this.pieces.add(m);
      this._carry.push(m);
    }
  }

  /**
   * The intact floor slabs within `r` of (x, z), nearest first, into `out` (cleared first): what a
   * terrain move can tear up there. `o`: kind ('flagstone' | 'plate'), whole (true: not cracked),
   * max (how many at most, default 8). Walks the grid. Returns how many.
   */
  floorNear(x, z, r, out, o = NONE) {
    if (!Array.isArray(out)) return 0;
    out.length = 0;
    if (!this.floor.length || !Number.isFinite(x + z + r) || !this._cells(x - r, z - r, x + r, z + r)) return 0;
    const max = o.max ?? 8, L = this.list, g = this._g, R = this._gr, near = this._near;
    near.length = 0;
    for (let cz = R.c; cz <= R.d; cz++) {
      for (let cx = R.a; cx <= R.b; cx++) {
        const c = cz * g.nx + cx;
        for (let k = g.start[c]; k < g.start[c + 1]; k++) {
          const b = L[g.items[k]];
          if (!b.floor || b.state !== INTACT || (o.whole && b.cracked) || (o.kind !== undefined && b.kind !== o.kind)) continue;
          const d = Math.hypot(b.x - x, b.z - z);
          if (d > r) continue;
          // (insertion by distance: a short list)
          let i = out.length;
          out.push(b);
          near.push(d);
          while (i > 0 && near[i - 1] > d) {
            out[i] = out[i - 1];
            near[i] = near[i - 1];
            i--;
          }
          out[i] = b;
          near[i] = d;
          if (out.length > max) {
            out.length = max;
            near.length = max;
          }
        }
      }
    }
    return out.length;
  }

  /** The spatial grid: each piece in the cell of its base; a query widens its box by the largest radius. */
  _buildGrid() {
    const L = this.list, C = BREAK.grid.cell;
    if (!L.length) return;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, mr = 0;
    for (const b of L) {
      x0 = Math.min(x0, b.x);
      z0 = Math.min(z0, b.z);
      x1 = Math.max(x1, b.x);
      z1 = Math.max(z1, b.z);
      mr = Math.max(mr, b.r);
    }
    const nx = Math.max(1, Math.floor((x1 - x0) / C) + 1), nz = Math.max(1, Math.floor((z1 - z0) / C) + 1);
    const start = new Int32Array(nx * nz + 1), items = new Int32Array(L.length), cellOf = new Int32Array(L.length);
    for (let i = 0; i < L.length; i++) {
      const c = Math.floor((L[i].z - z0) / C) * nx + Math.floor((L[i].x - x0) / C);
      cellOf[i] = c;
      start[c + 1]++;
    }
    for (let c = 0; c < nx * nz; c++) start[c + 1] += start[c];
    const fill = start.slice(0, nx * nz);
    for (let i = 0; i < L.length; i++) items[fill[cellOf[i]]++] = i;
    this._g = { x0, z0, nx, nz, cell: C, start, items };
    this._maxR = mr;
  }

  /** The cells a box (widened by the largest piece) covers, into this._gr; false when it misses the grid. */
  _cells(x0, z0, x1, z1) {
    const g = this._g;
    if (!g) return false;
    const m = this._maxR, C = g.cell, R = this._gr;
    R.a = Math.max(0, Math.floor((x0 - m - g.x0) / C));
    R.b = Math.min(g.nx - 1, Math.floor((x1 + m - g.x0) / C));
    R.c = Math.max(0, Math.floor((z0 - m - g.z0) / C));
    R.d = Math.min(g.nz - 1, Math.floor((z1 + m - g.z0) / C));
    return R.a <= R.b && R.c <= R.d;
  }

  // ------------------------------------------------------------------ queries
  /** Intact pieces. */
  get standing() {
    let n = 0;
    for (const o of this.list) if (o.state === INTACT) n++;
    return n;
  }

  /** Wreckage lying now (felled trunks, burnt logs, rubble piles). */
  get wreckage() {
    return this.wreck?.count ?? 0;
  }

  /** Things alight now (pieces and logs). */
  get burning() {
    return this._burningN + (this.wreck?.burning ?? 0);
  }

  _skip(b, o) {
    if (b.state !== INTACT) return true;
    if (b.top !== null && b.top.state === FALLING) return true; // (the upper half coming off it)
    if (o.only !== undefined && b.mat !== o.only) return true;
    if (o.spare === b) return true;
    return o.incidental === true && b.spare > (this.game.time ?? 0);
  }

  /**
   * The nearest intact piece to (x, z), or null. `o`: maxDist, minDist (from the point), lift (at most
   * this lift class: 1 = what a body can carry, 2 = also what only the Void can), kind, mat,
   * from: { x, z, min } (at least `min` from that point: not the one the hero stands against).
   */
  nearest(x, z, o = NONE) {
    const st = this._nb;
    st.best = null;
    st.bd = o.maxDist ?? Infinity;
    const L = this.list;
    if (Number.isFinite(st.bd) && st.bd < 40 && Number.isFinite(x + z)) {
      const bd = st.bd;
      if (!this._cells(x - bd, z - bd, x + bd, z + bd)) return null;
      const g = this._g, R = this._gr, ra = R.a, rb = R.b, rc = R.c, rd = R.d;
      for (let cz = rc; cz <= rd; cz++) {
        for (let cx = ra; cx <= rb; cx++) {
          const c = cz * g.nx + cx;
          for (let k = g.start[c]; k < g.start[c + 1]; k++) this._nearTest(L[g.items[k]], x, z, o, st);
        }
      }
    } else for (let i = 0; i < L.length; i++) this._nearTest(L[i], x, z, o, st);
    const best = st.best;
    st.best = null;
    return best;
  }

  _nearTest(b, x, z, o, st) {
    if (b.state !== INTACT || b.hpMax === Infinity) return;
    if (o.lift !== undefined && !(b.lift > 0 && b.lift <= o.lift)) return;
    if (b.floor && o.kind === undefined && !(o.lift >= BREAK.floor.lift)) return; // (floor: asked for by kind or lift)
    if (o.kind !== undefined && b.kind !== o.kind) return;
    if (o.mat !== undefined && b.mat !== o.mat) return;
    const d = Math.hypot(b.x - x, b.z - z);
    if (d >= st.bd || d < (o.minDist ?? 0)) return;
    if (o.from && Math.hypot(b.x - o.from.x, b.z - o.from.z) < (o.from.min ?? 0)) return;
    st.best = b;
    st.bd = d;
  }

  /**
   * The intact pieces (not the floor's slabs, not a piece out of the world) whose footprint reaches
   * within `reach` m of (x, z), into `out` (its length is set; at most `max`). No damage, no state.
   * Returns how many. (The living world's tremor reads what stands near a blow: life/tremor.js.)
   */
  around(x, z, reach, out, max = 64) {
    if (!out) return 0;
    out.length = 0;
    if (!Number.isFinite(x + z + reach) || !(reach > 0)) return 0;
    if (!this._cells(x - reach, z - reach, x + reach, z + reach)) return 0;
    const L = this.list, g = this._g, R = this._gr, ra = R.a, rb = R.b, rc = R.c, rd = R.d;
    for (let cz = rc; cz <= rd; cz++) {
      for (let cx = ra; cx <= rb; cx++) {
        const c = cz * g.nx + cx;
        for (let k = g.start[c]; k < g.start[c + 1] && out.length < max; k++) {
          const b = L[g.items[k]];
          if (b.state !== INTACT || b.floor || b.absent) continue;
          if (Math.hypot(b.x - x, b.z - z) - b.r > reach) continue;
          out.push(b);
        }
      }
    }
    return out.length;
  }

  /**
   * A shudder WITHOUT damage (a blow landed near, not on it: the tremor): the piece shakes along
   * (dx, dz) by `amp` rad at most, as a struck one does, and settles in the same 0.28 s. Its structure,
   * bricks, marks and sounds are untouched. A range piece (a tree of the forest, a bamboo cane) rewrites
   * its vertices while it shakes: at most BREAK.wear.shakeMax x quality of those at once, the rest stay
   * still. A piece already shaking harder keeps its shake. Returns whether it shudders.
   */
  shudder(b, amp, dx = 0, dz = 1) {
    if (!b || b.state !== INTACT || b.floor || b.absent || !(amp > 0) || !Number.isFinite(amp + dx + dz)) return false;
    if (b.top !== null && b.top.state === INTACT) b = b.top;
    const a = Math.min(0.09, amp) / Math.max(0.6, b.weight);
    if (b.shake > 0 && b.shakeAmp * (b.shake / 0.28) >= a) return false;
    if (b.ranged) {
      if (!b.body?.pose) return false;
      if (!(b.shake > 0)) {
        if (this._rShake >= Math.max(2, Math.round(BREAK.wear.shakeMax * this.q))) return false;
        this._rShake++;
      }
    }
    const l = Math.hypot(dx, dz);
    b.dx = l > 1e-4 ? dx / l : 0;
    b.dz = l > 1e-4 ? dz / l : 1;
    b.shake = 0.28;
    b.shakeAmp = a;
    this._wake(b);
    return true;
  }

  /** The first cover the segment a → b (widened by r) meets, or null; `coverT` = where along it. */
  coverAt(ax, az, bx, bz, r = 0, y = undefined) {
    let best = null, bt = 2;
    if (!Number.isFinite(ax + az + bx + bz + r)) return null;
    if (!this._cells(Math.min(ax, bx) - r, Math.min(az, bz) - r, Math.max(ax, bx) + r, Math.max(az, bz) + r)) {
      this.coverT = 1;
      return null;
    }
    const s = this._seg, L = this.list, g = this._g, R = this._gr, ra = R.a, rb = R.b, rc = R.c, rd = R.d;
    for (let cz = rc; cz <= rd; cz++) {
      for (let cx = ra; cx <= rb; cx++) {
        const c = cz * g.nx + cx;
        for (let k = g.start[c]; k < g.start[c + 1]; k++) {
          const b = L[g.items[k]];
          if (b.state !== INTACT || !b.cover) continue;
          if (b.y0 > 0 && y !== undefined && y + r < b.y0) continue; // (a raised piece over the shot's height)
          if (segDist(b.x, b.z, ax, az, bx, bz, s) > b.r + r) continue;
          if (s.t < bt) {
            bt = s.t;
            best = b;
          }
        }
      }
    }
    this.coverT = best ? bt : 1;
    return best;
  }

  // ------------------------------------------------------------------ blows
  /** A blow or blast over the disc (x, z, r): every intact piece it touches takes `power`. */
  strike(x, z, r, power, o = NONE) {
    if (!Number.isFinite(x + z + r + power) || !(power > 0)) return 0;
    if (!this._cells(x - r, z - r, x + r, z + r)) return 0;
    let n = 0;
    this._quiet = 0;
    this.struck.held = null;
    this.struck.broke = 0;
    this.struck.n = 0;
    // (bites, BREAK.chip: a blow over a disc eats outward from its own centre)
    this._hr = r;
    this._hc = true;
    this._hx = x;
    this._hy = o.y ?? 1;
    this._hz = z;
    const L = this.list, g = this._g, R = this._gr, ra = R.a, rb = R.b, rc = R.c, rd = R.d;
    for (let cz = rc; cz <= rd; cz++) {
      for (let cx = ra; cx <= rb; cx++) {
        const c = cz * g.nx + cx;
        for (let k = g.start[c]; k < g.start[c + 1]; k++) {
          const b = L[g.items[k]];
          if (this._skip(b, o)) continue;
          const ox = b.x - x, oz = b.z - z;
          const d = Math.hypot(ox, oz);
          if (d > r + b.r) continue;
          if (o.y !== undefined && o.y - r > b.y0 + b.h) continue; // it passed over (a raised piece: its top is y0 + h)
          // ... or under a raised piece (a shop sign, a tower's top, the statue's arm): a blow down on the
          // street does not reach it (blows on a base still reach its top through `holds`, _hit)
          if (b.y0 > 0 && o.y !== undefined && o.y + r < b.y0) continue;
          // the blow's way: as given, else out from its centre
          let dx = o.dx, dz = o.dz;
          if (!Number.isFinite(dx + dz) || dx * dx + dz * dz < 1e-6) {
            dx = d > 1e-3 ? ox / d : rnd() - 0.5;
            dz = d > 1e-3 ? oz / d : rnd() - 0.5;
          }
          const kk = d > 1e-3 ? Math.min(1, b.r / d) : 0;
          // o.falloff: a blast weaker toward its rim (x 1 - falloff at the edge)
          let pw = o.falloff > 0 ? power * (1 - o.falloff * Math.min(1, d / (r + b.r))) : power;
          // a floor slab: the blow's power falls off from its centre (BREAK.floor: the slab under a heavy
          // blow breaks, its neighbours crack)
          if (b.floor) {
            const F = BREAK.floor;
            if (d > F.core) pw *= 1 - (1 - F.rim) * Math.min(1, (d - F.core) / Math.max(0.05, r + b.r - F.core));
          }
          if (this._hit(b, pw, o, b.x - ox * kk, clamp(o.y ?? 1, b.y0 + 0.2, b.y0 + b.h), b.z - oz * kk, dx, dz)) n++;
        }
      }
    }
    return n;
  }

  /** A blow along the segment a → b (a blade's edge, a dash, a wall of force, a body part's step), r wide. */
  sweep(ax, az, bx, bz, r, power, o = NONE) {
    const w = this._sw;
    w.ax = ax; w.az = az; w.bx = bx; w.bz = bz; w.r = r; w.power = power;
    return this.sweepRec(w, o);
  }

  /**
   * sweep() with its segment in a record `w` = { ax, az, bx, bz, r, power } (a caller's reused one: a
   * body part each frame passes no numbers, so nothing is boxed on the way in).
   */
  sweepRec(w, o = NONE) {
    const ax = w.ax, az = w.az, bx = w.bx, bz = w.bz, r = w.r, power = w.power;
    if (!Number.isFinite(ax + az + bx + bz + r + power) || !(power > 0)) return 0;
    if (!this._cells(Math.min(ax, bx) - r, Math.min(az, bz) - r, Math.max(ax, bx) + r, Math.max(az, bz) + r)) return 0;
    let n = 0;
    this._quiet = 0;
    this.struck.held = null;
    this.struck.broke = 0;
    this.struck.n = 0;
    this._hr = r;
    this._hc = false;
    // (o.ya, o.yb: the segment's heights at its two ends, a blade's hilt and point: where on it a piece
    // was struck is that high, so its bite, its chips and its nick sit on the blade; else o.y)
    const ya = o.ya, yb = o.yb, tilted = ya !== undefined && yb !== undefined && Number.isFinite(ya + yb);
    const L = this.list, s = this._seg2, g = this._g, R = this._gr, ra = R.a, rb = R.b, rc = R.c, rd = R.d;
    for (let cz = rc; cz <= rd; cz++) {
      for (let cx = ra; cx <= rb; cx++) {
        const c = cz * g.nx + cx;
        for (let k = g.start[c]; k < g.start[c + 1]; k++) {
          const b = L[g.items[k]];
          if (this._skip(b, o)) continue;
          // (a brush passes over a flat stone: BREAK.brushFlat)
          if (b.h < BREAK.brushFlat && o.brush === true && b.mat === 'stone') continue;
          if (segDist(b.x, b.z, ax, az, bx, bz, s) > r + b.r) continue;
          if (o.y !== undefined && o.y - r > b.y0 + b.h) continue;
          // (a raised piece: the edge passing under it, where it is nearest the piece, does not reach it;
          // a piece on the ground keeps taking an edge drawn below its foot, a blade's point in the earth)
          const py = tilted ? ya + (yb - ya) * s.t : (o.y ?? 1);
          if (b.y0 > 0 && (tilted || o.y !== undefined) && py + r < b.y0) continue;
          let dx = o.dx, dz = o.dz;
          if (!Number.isFinite(dx + dz) || dx * dx + dz * dz < 1e-6) {
            dx = bx - ax;
            dz = bz - az;
          }
          const px = ax + (bx - ax) * s.t, pz = az + (bz - az) * s.t;
          // (a floor slab under an edge drawn along it, not a blow landing on it: BREAK.floor.sweep of it)
          if (this._hit(b, b.floor && o.down !== true ? power * BREAK.floor.sweep : power, o, px, clamp(py, b.y0 + 0.2, b.y0 + b.h), pz, dx, dz)) n++;
        }
      }
    }
    return n;
  }

  /** A projectile's step a → b: the first cover in its way takes `power` and is returned; else null. */
  stop(ax, az, bx, bz, r, power, o = NONE) {
    const b = this.coverAt(ax, az, bx, bz, r, o.y);
    if (!b) return null;
    const t = this.coverT;
    this._quiet = 0;
    this.struck.held = null;
    this.struck.broke = 0;
    this.struck.n = 0;
    this._hr = Math.max(r, 0.3);
    this._hc = false;
    this._hit(b, power, o, ax + (bx - ax) * t, clamp(o.y ?? 1, b.y0 + 0.2, b.y0 + b.h), az + (bz - az) * t, bx - ax, bz - az);
    return b;
  }

  /** A fresh id for one swing / one blast: a piece takes at most one blow per id. */
  swing() {
    return (this._src = (this._src % 1e9) + 1);
  }

  /** Incidental blows (`o.incidental`: a body walking past) leave this piece alone for `sec` s (a boss is about to take it). */
  reserve(b, sec = 1) {
    if (b && Number.isFinite(sec)) b.spare = Math.max(b.spare, (this.game.time ?? 0) + sec);
  }

  // ------------------------------------------------------------------ wind and fire that carries on
  /**
   * Wind and shock (BREAK.wind; a roar, a shock ring, a wingbeat, a landing): a front rolls out from
   * (x, z) at BREAK.wind.speed m/s to `reach` m, and each tree of the wall it passes (beyond
   * BREAK.wall.from: the clearing's trees take the fight's blows as before) takes power x (1 - d / reach)^fall of a blast as WEAR: leaves torn off,
   * boughs snapped, never below BREAK.wind.floor of its structure (wind alone never fells a tree, and
   * a tree it touches loses a few leaves to the front even when it holds). `o.from` m: nothing nearer
   * the centre than this is touched (a wingbeat need not strip the clearing). Returns how many trees
   * the front will reach. `o.fall`: this front's falloff (else BREAK.wind.fall).
   */
  wind(x, z, power, reach, o = NONE) {
    if (!Number.isFinite(x + z + power + reach) || !(power > 0) || !(reach > 0)) return 0;
    if (!this._cells(x - reach, z - reach, x + reach, z + reach)) return 0;
    const W = BREAK.wind, Q = this._wq, now = this.game.time ?? 0, from = o.from ?? 0, fall = o.fall > 0 ? o.fall : W.fall;
    let n = 0;
    this.stat.wind++;
    const L = this.list, g = this._g, R = this._gr, ra = R.a, rb = R.b, rc = R.c, rd = R.d;
    for (let cz = rc; cz <= rd; cz++) {
      for (let cx = ra; cx <= rb; cx++) {
        const c = cz * g.nx + cx;
        for (let k = g.start[c]; k < g.start[c + 1]; k++) {
          const b = L[g.items[k]];
          // (the wall's trees only: inside the clearing the fight's blows are as they were)
          if (b.state !== INTACT || !b.wall || !b.order.length || b.mat !== 'wood') continue;
          const ox = b.x - x, oz = b.z - z, d = Math.hypot(ox, oz);
          if (d > reach || (from > 0 && Math.hypot(b.x, b.z) < from)) continue;
          const pw = power * Math.pow(1 - d / reach, fall);
          if (pw < W.min || Q.n >= Q.id.length) continue;
          const i = Q.n++;
          Q.id[i] = b.id;
          Q.t[i] = now + d / W.speed;
          Q.p[i] = pw;
          Q.dx[i] = d > 1e-3 ? ox / d : 0;
          Q.dz[i] = d > 1e-3 ? oz / d : 1;
          n++;
          this.stat.windTrees++;
        }
      }
    }
    return n;
  }

  /** The fronts reach the trees due by now (update). */
  _windStep() {
    const Q = this._wq;
    if (!Q.n) return;
    const now = this.game.time ?? 0;
    for (let i = Q.n - 1; i >= 0; i--) {
      if (Q.t[i] > now) continue;
      const b = this.list[Q.id[i]];
      if (b) this._windHit(b, Q.p[i], Q.dx[i], Q.dz[i], now);
      const j = --Q.n;
      Q.id[i] = Q.id[j]; Q.t[i] = Q.t[j]; Q.p[i] = Q.p[j]; Q.dx[i] = Q.dx[j]; Q.dz[i] = Q.dz[j];
    }
  }

  /** A front reaches a tree: wear down to BREAK.wind.floor of it at most, a few leaves torn off its crown. */
  _windHit(b, power, dx, dz, now) {
    const W = BREAK.wind;
    if (b.state !== INTACT || now - b.windT < W.rehit) return;
    b.windT = now;
    // (a gust is not even: each tree takes `vary` more or less of it, so a front leaves a ragged line)
    const floor = W.floor * b.hpMax, dmg = power * (b.M.take.blast ?? 1) * (1 - W.vary + 2 * W.vary * rnd());
    if (b.hp > floor && b.hpMax < Infinity) {
      const was = b.hp;
      b.hp = Math.max(floor, b.hp - dmg);
      b.dx = dx;
      b.dz = dz;
      // (bites, BREAK.chip: the front eats its windward crown)
      this._hr = b.h * 0.5;
      this._hc = false;
      this._bite(b, b.x - dx * b.r, b.h * BREAK.chip.windY, b.z - dz * b.r, was - b.hp, dx, dz);
      this._wearTo(b, dx, dz, 'boss');
    }
    // a shudder while there is room (BREAK.wear.shakeMax), and the leaves the front tears away
    if (b.ranged && !(b.shake > 0) && this._rShake < Math.max(2, Math.round(BREAK.wear.shakeMax * this.q))) {
      this._rShake++;
      b.shake = 0.28;
      b.shakeAmp = Math.min(0.06, 0.015 + power * 0.04) / Math.max(0.6, b.weight);
      b.dx = dx;
      b.dz = dz;
      this._wake(b);
    }
    if (b.leafy > 0 && b.dropped < b.order.length) this._leaves(b, b.order[b.dropped], dx, dz, Math.round(W.leaves * Math.min(1.5, 0.4 + power)));
  }

  /** A few leaves torn off part i of a crown, blown along (dx, dz) (BREAK.debris's budget). */
  _leaves(b, i, dx, dz, n) {
    const fx = this.game.fx?.alpha;
    n = Math.min(Math.round(n * this.q), Math.floor(this._debris));
    if (!fx || n <= 0) return;
    this._debris -= n;
    const C = b.body.centre, cx = C[i * 4], cy = C[i * 4 + 1], cz = C[i * 4 + 2], cr = Math.max(0.3, C[i * 4 + 3]);
    const p = this._p;
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.283, rr = cr * (0.5 + 0.5 * rnd());
      p.x = cx + Math.cos(a) * rr;
      p.y = Math.max(0.5, cy + (rnd() - 0.2) * cr);
      p.z = cz + Math.sin(a) * rr;
      const v = 2.5 + rnd() * 3;
      p.vx = dx * v + (rnd() - 0.5);
      p.vy = 0.6 + rnd() * 1.4;
      p.vz = dz * v + (rnd() - 0.5);
      p.life = 0.9 + rnd() * 0.8;
      p.size = 0.36 + rnd() * 0.16;
      p.sizeEnd = 0.18;
      p.glyph = LEAVES;
      p.color = SHED_LEAF;
      p.colorEnd = SHED_LEAF_END;
      p.alpha = 1;
      p.alphaEnd = 0;
      p.gravity = -3;
      p.drag = 1.3;
      p.spin = (rnd() - 0.5) * 5;
      p.rot = rnd() * 6.283;
      p.flicker = 0;
      fx.spawn(p);
    }
  }

  /**
   * carryFire: fire that carries on (BREAK.wall.fire; a breath past its end, a strafing pass, a flame wall or ring
   * that ran out, a shot that missed): along the ray from (ax, az) the way (dx, dz) for `len` m, the
   * first standing wood OF THE WALL that can burn catches (it passes over the clearing's) (k: how long), on the wall's own budget of fire. Returns
   * the piece it reached (lit or not) or null; this._carryHit holds where it met it.
   */
  carryFire(ax, az, dx, dz, len, k = 1) {
    if (!Number.isFinite(ax + az + dx + dz + len) || !(len > 0)) return null;
    this.stat.carry++;
    const l = Math.hypot(dx, dz);
    if (l < 1e-4) return null;
    dx /= l;
    dz /= l;
    const bx = ax + dx * len, bz = az + dz * len, w = BREAK.wall.fire.width;
    if (!this._cells(Math.min(ax, bx) - w, Math.min(az, bz) - w, Math.max(ax, bx) + w, Math.max(az, bz) + w)) return null;
    let best = null, bt = 2;
    const s = this._seg, L = this.list, g = this._g, R = this._gr, ra = R.a, rb = R.b, rc = R.c, rd = R.d;
    for (let cz = rc; cz <= rd; cz++) {
      for (let cx = ra; cx <= rb; cx++) {
        const c = cz * g.nx + cx;
        for (let kk = g.start[c]; kk < g.start[c + 1]; kk++) {
          const b = L[g.items[kk]];
          // (it passes over what stands in the clearing: it is the wall it carries to)
          if (b.state !== INTACT || !b.wall || !b.burns || b.h < 1.5) continue;
          if (segDist(b.x, b.z, ax, az, bx, bz, s) > b.r + w + b.leafy * 1.2) continue;
          if (s.t < bt) {
            bt = s.t;
            best = b;
          }
        }
      }
    }
    const H = this._carryHit;
    H.piece = best;
    if (!best) return null;
    H.x = best.x;
    H.z = best.z;
    this.stat.reached++;
    if (best.burn > 0 || best.burnt) return best;
    if (best.wall ? this._wallRoom(true) : this._litTokens >= 1 && this.burning - this._wallBurning < Math.max(2, Math.round(BREAK.light.maxBurning * this.q))) {
      if (best.wall) this._wallLit -= 1;
      else this._litTokens -= 1;
      this._light(best, k, 0);
      this.stat.lit++;
    } else this.world.scorch?.burnCircle?.(best.x, best.z, best.r + 0.8, 0.3, 0.5);
    return best;
  }

  /** Room for one more fire in the wall: landing (`landed`: its token) or spreading. */
  _wallRoom(landed) {
    const F = BREAK.wall.fire;
    if (this._wallBurning >= Math.max(3, Math.round(F.maxBurning * this.q))) return false;
    return landed ? this._wallLit >= 1 : this._wallSpread >= 1;
  }

  /** The phone budget (0.3 .. 1; world.setQuality from the quality preset). */
  setQuality(k) {
    if (Number.isFinite(k)) this.q = clamp(k, 0.3, 1);
  }

  /** A floor slab speaks once per blow (the first the blow strikes); every other piece always. */
  _loud(b) {
    return !b.floor || this._quiet++ === 0;
  }

  _emit(kind, b, x, y, z, power, by) {
    this._emitAt(kind, b.mat, x, y, z, power, by, b.id);
  }

  _emitAt(kind, mat, x, y, z, power, by, id = -1) {
    const e = this._ev;
    e.kind = kind; e.mat = mat; e.x = x; e.y = y; e.z = z; e.power = power; e.by = by; e.id = id;
    this.game.events?.emit?.('world:impact', e);
  }

  _hit(b, power, o, px, py, pz, dx, dz) {
    // a two-stage piece: while the upper half stands, blows on the legs wear it down
    if (b.top !== null && b.top.state === INTACT) b = b.top;
    const now = this.game.time ?? 0;
    const src = o.src ?? -1;
    if (src >= 0 ? b.src === src : now - b.srcT < (o.brush === true ? BREAK.brushRehit : BREAK.rehit)) return false;
    b.src = src;
    b.srcT = now;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const kind = o.kind ?? BLOW.BLUNT, by = o.by ?? 'world';
    // a blade going through (o.tx, o.tz: its travel, unit; the hero's, BREAK.chip.pass): what it knocks
    // off flies on along the cut, not back toward the one who struck it (_chips, _drop)
    const tx = o.tx, along = tx !== undefined && Number.isFinite(tx + o.tz) && tx * tx + o.tz * o.tz > 0.25;
    this._tx = along ? tx : 0;
    this._tz = along ? o.tz : 0;
    // a brush (a body walking into it): only what is over BREAK.brush of its structure bites
    const brush = o.brush === true;
    const dmg = brush ? brushed(b, power * (b.M.take[kind] ?? 1)) : power * (b.M.take[kind] ?? 1);
    // a brush that bites nothing is a shove: it shudders, no splinters, no nick, no sound (a body
    // rubbing past a stone would chip it every rehit)
    const shove = brush && dmg < BREAK.scratch;
    // what the blow takes of its structure; with bites on (BREAK.chip) that share of the bricks under
    // the blow comes off it where it struck, their letters instead of the splinters
    let took = dmg < BREAK.scratch || b.hpMax === Infinity ? 0 : this._guarded(b, dmg);
    // (a sliced piece, a bamboo stalk: a blade or a blow cuts it through, whatever its power)
    const sliced = b.slice && took > 0 && !brush && kind !== BLOW.FIRE;
    if (sliced) took = b.hp;
    const bit = took > 0 && !sliced ? this._bite(b, px, py, pz, Math.min(took, b.hp), dx, dz) : 0;
    if (!shove) this._chips(b, px, py, pz, dx, dz, brush ? dmg : power, bit > 0); // (a brush: splinters for what it bit)
    const S0 = this.struck;
    if (S0.n < PASS_MAX) {
      const e = S0.list[S0.n++];
      e.b = b;
      e.x = px;
      e.y = py;
      e.z = pz;
      e.broke = took > 0 && b.hp - took <= 0;
    }
    if (took === 0 || (b.hp -= took) > 0) {
      // it holds: a nick, a shudder (a floor slab: no nick; it shows cracked once it has taken enough)
      // (a range piece's shudder rewrites its vertices: at most BREAK.wear.shakeMax x quality of them
      // at once, the rest only chip; a floor slab, a range with no stages, never shudders)
      // (bitten: the hole is its mark)
      if (!shove && !b.floor && bit === 0) this.world.scars?.object(b.id, px, py, pz, power, b.M);
      if (b.floor && !b.cracked && b.crack && b.hp <= b.hpMax * BREAK.floor.crack) {
        b.cracked = true;
        b.body.visible = false;
        b.crack.visible = true;
      }
      if (!b.ranged || (b.order.length > 0 && (b.shake > 0 || this._rShake < Math.max(2, Math.round(BREAK.wear.shakeMax * this.q))))) {
        if (b.ranged && !(b.shake > 0)) this._rShake++;
        b.shake = 0.28;
        b.shakeAmp = Math.min(0.09, 0.02 + power * 0.05) / Math.max(0.6, b.weight);
      }
      b.dx = dx;
      b.dz = dz;
      if (!shove) this._wearTo(b, dx, dz, by);
      this._wake(b);
      if (!shove && this._loud(b)) this._emit('chip', b, px, py, pz, power, by);
      // (the first piece that held this blow: a blade stops on it)
      const S = this.struck;
      if (!S.held && !shove && !b.floor) {
        S.held = b;
        S.x = px;
        S.y = py;
        S.z = pz;
      }
      this._tx = this._tz = 0;
      return true;
    }
    this.struck.broke++;
    b.hy = py; // (where the blow bit: a blade cuts its stump about there, BREAK.fell)
    this._break(b, dx, dz, by, kind);
    this._tx = this._tz = 0;
    return true;
  }

  /**
   * A blow's bite (BREAK.chip, `?chip=a`): of the piece's bricks within the blow's reach of where it
   * struck, the share of its structure the blow took (`lost`) is taken, nearest first: set back into a
   * solid part, folded out of foliage and thin parts, each falling as the letter it was drawn in from
   * where it sat. A crown part that has lost most of its bricks drops whole. Returns how many bricks
   * went (0 with bites off, on a floor slab, on a piece with no bricks).
   */
  _bite(b, px, py, pz, lost, dx, dz) {
    const look = chipLook();
    if (look === '0' || b.floor || !(lost > 0) || !(b.hpMax < Infinity)) return 0;
    const C = BREAK.chip, out = this._bits;
    const share = Math.min(1, (lost / b.hpMax) * C.k);
    const pad = C.pad;
    // where the bricks are counted from: a blow over a disc (a blast, a slam, a landing) from its own
    // centre, as far as it reaches into the piece, so it eats the side that faced it; a blow along a
    // segment (a blade, a limb) from where it met the piece. A disc that only clips the footprint, with
    // no brick inside it, bites at the point it touched
    let n = 0;
    if (this._hc) n = this._take(b, this._hx, this._hy, this._hz, Math.min(C.reach[2], this._hr + b.r + pad), share);
    if (n === 0) n = this._take(b, px, py, pz, clamp(this._hr + pad, C.reach[0], C.reach[1]), share);
    // (none that near: a blow that took structure still shows, on the bricks nearest it however far, a
    // share of the whole piece: a ground blow under a bough, a blow on a landmark's footprint)
    if (n === 0) n = this._take(b, px, py, pz, Infinity, share);
    if (n > 0) {
      const ox = b.ranged ? 0 : b.x, oy = b.ranged ? 0 : b.y0, oz = b.ranged ? 0 : b.z;
      if (b.ranged) {
        const B = b.body;
        b.touched = true;
        // a crown part mostly eaten drops whole (never the trunk: it is cut through as the tree falls)
        for (let i = 0; i < b.order.length; i++) {
          const p = b.order[i];
          if (B.shown[p] === 1 && B.partGone(p) >= C.shed) this._shed(b, p, dx, dz, false);
        }
        B.write();
      }
      this.bitten += n;
      this._drop(b, out, n, ox, oy, oz, dx, dz, lost / b.hpMax);
    }
    return n;
  }

  /** `share` of the piece's bricks within `reach` of a point (world), nearest first, into this._bits; how many. */
  _take(b, x, y, z, reach, share) {
    if (b.ranged) return b.body.bite ? b.body.bite(x, y, z, reach, share, BREAK.chip.max, this._bits) : 0;
    if (!b.bricks) return 0;
    // what hangs is drawn where the wind has it (world/hang.js): the blow is taken back to the bricks'
    // rest, and what it took falls from where it was drawn (nothing moves while the wind is off)
    const H = b.hang ? this._hangAt(b) : null;
    let px = x - b.x, py = y - b.y0, pz = z - b.z;
    if (H) {
      const d = Math.max(0, b.hang.top - py);
      px -= H.x * d;
      py -= H.y * d;
      pz -= H.z * d;
    }
    const n = b.bricks.bite(px, py, pz, reach, share, BREAK.chip.max, this._bits);
    if (H) {
      const out = this._bits;
      for (let i = 0; i < n; i++) {
        const d = Math.max(0, b.hang.top - out[i * 4 + 1]);
        out[i * 4] += H.x * d;
        out[i * 4 + 1] += H.y * d;
        out[i * 4 + 2] += H.z * d;
      }
    }
    return n;
  }

  /** A hanging piece's lean now, per metre of drop (world/hang.js hangLean), or null: still (not standing at home upright, or no wind). */
  _hangAt(b) {
    const e = b.body.matrixWorld.elements, ul = Math.hypot(e[4], e[5], e[6]);
    if (b.state !== INTACT || !(ul > 1e-4) || e[5] / ul < 0.985 || Math.abs(e[13]) > 0.03) return null;
    const H = hangLean(this.game.U, b.x, b.z, b.hang.give, this._hangV);
    return H.x === 0 && H.z === 0 ? null : H;
  }

  /**
   * The bricks a bite took fall as letters from where they sat (`out`: x, y, z, part each, + the
   * piece's base o): knocked OUT of the face they were in (away from the piece's axis, back toward the
   * blow) as hard as the blow took (`k`: the share of its structure), then falling.
   */
  _drop(b, out, n, ox, oy, oz, dx, dz, k = 0.2) {
    const solid = this.game.fx?.alpha, glow = this.game.fx?.add;
    if (!solid) return;
    const C = BREAK.chip, M = b.M, p = this._p, q = this.q, tx = this._tx, tz = this._tz;
    const fx = M.sparks && glow ? glow : solid;
    const leafOf = b.ranged ? b.body.leaf : null;
    p.alpha = 1;
    p.alphaEnd = 0.25;
    p.flicker = 0;
    for (let i = 0; i < n; i++) {
      // (the phone budget: a share of the bricks print their fall; the level's debris budget caps a storm)
      if (i > 0 && q < 1 && rnd() > q) continue;
      if (this._debris < 1) break;
      this._debris -= 1;
      const x = out[i * 4] + ox, y = Math.max(0.15, out[i * 4 + 1] + oy), z = out[i * 4 + 2] + oz;
      const leaf = leafOf !== null && leafOf[out[i * 4 + 3]] === 1;
      const g = leaf ? 5 : 15;
      const fall = Math.sqrt((2 * y) / g);
      p.x = x;
      p.y = y;
      p.z = z;
      // out of its face: away from the piece's axis, and back against the blow (a chip flies off the
      // cut toward the one who struck it), harder for a harder blow; leaves drift
      let nx = x - b.x, nz = z - b.z;
      const nl = Math.hypot(nx, nz);
      if (nl > 1e-3) {
        nx /= nl;
        nz /= nl;
      } else {
        nx = -dx;
        nz = -dz;
      }
      const kick = C.out * (0.6 + 1.6 * Math.min(1, k * 3)) * (leaf ? 0.45 : 1) * (0.5 + rnd());
      // (a blade passing through, BREAK.chip.pass: carried on along the cut, out of the face)
      const ax = tx !== 0 || tz !== 0 ? tx * C.pass.along + nx * C.pass.face + dx * 0.25 : nx * 0.7 - dx * 0.5;
      const az = tx !== 0 || tz !== 0 ? tz * C.pass.along + nz * C.pass.face + dz * 0.25 : nz * 0.7 - dz * 0.5;
      p.vx = ax * kick + (rnd() - 0.5) * 0.9;
      p.vy = C.up * (0.4 + rnd()) * (leaf ? 0.6 : 1);
      p.vz = az * kick + (rnd() - 0.5) * 0.9;
      p.life = clamp(fall + p.vy / g + 0.15 + rnd() * 0.25, 0.4, 2.2);
      p.size = (leaf ? 0.38 : 0.36) + rnd() * 0.14;
      p.sizeEnd = 0.24;
      p.glyph = leaf ? LEAVES : b.digits ? DIGITS : M.chips;
      if (leaf) {
        p.color = SHED_LEAF;
        p.colorEnd = SHED_LEAF_END;
      } else if (b.mat === 'bone') {
        p.color = SHED_BONE;
        p.colorEnd = SHED_BONE_END;
      } else if (b.mat === 'wood' && !b.digits) {
        p.color = SHED_WOOD;
        p.colorEnd = SHED_WOOD_END;
      } else {
        p.color = M.color;
        p.colorEnd = M.colorEnd;
      }
      p.gravity = -g;
      p.drag = leaf ? 1.2 : 0.3;
      p.spin = (rnd() - 0.5) * (leaf ? 4 : 9);
      p.rot = rnd() * 6.283;
      fx.spawn(p);
      // every few bricks one stays lying where it comes down, until the reset
      if (++this._lit % C.litter === 0) {
        const t = fall * 0.8;
        this.world.scars?.rubble(x + p.vx * t, z + p.vz * t, 0.18, M, 1, leaf ? LEAVES : b.digits ? DIGITS : M.chips);
      }
    }
  }

  /** What a blow takes from a piece some of whose `guards` still stand (BREAK.guarded of it). */
  _guarded(b, dmg) {
    const G = b.guards;
    if (G) for (let i = 0; i < G.length; i++) if (G[i].state === INTACT) return dmg * BREAK.guarded;
    return dmg;
  }

  /**
   * Wearing down (BREAK.wear): as a piece with stages loses its structure it drops its parts in order
   * (`cut`: how many by each stage), each in a burst of what it is drawn in, and at the last stage it
   * leans along the blow. A stage reached emits world:impact 'wear' (power = its stage, 1 .. 3).
   */
  _wearTo(b, dx, dz, by = 'world') {
    if (!b.order.length || !(b.hpMax < Infinity)) return;
    const A = BREAK.wear.at, f = b.hp / b.hpMax;
    let st = 0;
    while (st < A.length && f <= A[st]) st++;
    if (st <= b.wear) return;
    for (let k = b.wear; k < st; k++) {
      const n = Math.min(b.order.length - 1, k < b.cut.length ? b.cut[k] : b.dropped);
      // (with bites on, BREAK.chip, a tree loses what the blows took where they struck, not its parts in order)
      if (chipLook() === '0') while (b.dropped < n) this._shed(b, b.order[b.dropped++], dx, dz, false);
      if (k === A.length - 1 && b.topples) {
        // the last stage: it leans along the blow (and so falls on that side of its crown)
        b.leanTo = BREAK.wear.lean * (0.75 + 0.5 * rnd());
        if (b.wall) {
          this._wallWay(b, dx, dz);
          b.ldx = this._way.dx;
          b.ldz = this._way.dz;
        } else {
          const l = Math.hypot(dx, dz) || 1;
          b.ldx = dx / l;
          b.ldz = dz / l;
        }
      }
    }
    b.wear = st;
    this._pose(b);
    this._emit('wear', b, b.x, b.h * 0.6, b.z, st, by);
  }

  /** Part i of a range piece drops away: a burst of its leaves (or splinters), embers when it burns. */
  _shed(b, i, dx, dz, ember) {
    if (!b.body.show?.(i, false)) return;
    b.touched = true;
    const fx = this.game.fx?.alpha, glow = this.game.fx?.add;
    if (!fx) return;
    const C = b.body.centre, cx = C[i * 4], cy = C[i * 4 + 1], cz = C[i * 4 + 2], cr = Math.max(0.3, C[i * 4 + 3]);
    const leaf = b.body.leaf[i] === 1, M = b.M, p = this._p, c0 = this._c0;
    // (from the debris budget, BREAK.debris: a roar's front drops hundreds of crowns' parts at once)
    const n = Math.min(Math.round(clamp(cr * BREAK.wear.debris, 8, 44) * this.q), Math.max(0, Math.floor(this._debris)));
    this._debris -= n;
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.283, rr = cr * Math.sqrt(rnd()) * 0.8;
      p.x = cx + Math.cos(a) * rr;
      p.y = Math.max(0.2, cy + (rnd() - 0.5) * cr);
      p.z = cz + Math.sin(a) * rr;
      const out = 0.4 + rnd() * 1.8;
      p.vx = Math.cos(a) * out + dx * 1.4;
      p.vy = 0.3 + rnd() * 2.2;
      p.vz = Math.sin(a) * out + dz * 1.4;
      p.life = clamp(Math.sqrt((2 * p.y) / 15) + 0.4 + rnd() * 0.5, 0.6, 1.9);
      const spark = ember && rnd() < 0.18; // (a burning crown: a few sparks among the charred leaves)
      p.size = spark ? 0.2 + rnd() * 0.08 : (leaf ? 0.36 : 0.34) + rnd() * 0.14;
      p.sizeEnd = spark ? 0.06 : 0.18;
      p.glyph = spark ? SPARKS : leaf ? LEAVES : b.digits ? DIGITS : M.chips;
      if (spark) {
        p.color = SPARK;
        p.colorEnd = SPARK_END;
        p.vy += 1.5;
      } else if (ember) {
        p.color = CHAR;
        p.colorEnd = CHAR_END;
      } else if (b.digits) {
        p.color = M.color;
        p.colorEnd = M.colorEnd;
      } else {
        p.color = leaf ? SHED_LEAF : SHED_WOOD;
        p.colorEnd = leaf ? SHED_LEAF_END : SHED_WOOD_END;
      }
      p.alpha = 1;
      p.alphaEnd = 0;
      p.gravity = spark ? 2 : leaf ? -5 : -15;
      p.drag = leaf || spark ? 1.6 : 0.4;
      p.spin = spark ? 0 : (rnd() - 0.5) * (leaf ? 4 : 9);
      p.rot = rnd() * 6.283;
      p.flicker = spark ? 0.5 : 0;
      (spark && glow ? glow : fx).spawn(p);
    }
  }

  /** A wall tree's way to fall: (dx, dz) turned out of the arena until at least BREAK.wall.out of it points out; into this._way. */
  _wallWay(b, dx, dz) {
    const R = Math.hypot(b.x, b.z) || 1, ox = b.x / R, oz = b.z / R, O = BREAK.wall.out;
    let d = dx * ox + dz * oz;
    if (d < 0) {
      dx -= 2 * d * ox;
      dz -= 2 * d * oz;
      d = -d;
    }
    if (d < O) {
      dx += ox * (O - d) * 2;
      dz += oz * (O - d) * 2;
    }
    const m = Math.hypot(dx, dz) || 1;
    this._way.dx = dx / m;
    this._way.dz = dz / m;
  }

  /** A range piece's vertices follow its pivot (and its lean): rewritten from home. */
  _pose(b) {
    if (!b.ranged || !b.body.pose) return;
    b.touched = true;
    let q = b.pivot.quaternion;
    if (b.lean > 1e-4) {
      this._q.setFromAxisAngle(this._axis.set(b.ldz, 0, -b.ldx), b.lean);
      q = this._q2.copy(q).multiply(this._q);
    }
    const p = b.pivot.position;
    b.body.pose(q, p.x, p.y, p.z);
  }

  /** Fell a piece along (dx, dz) (a boss pulls a pillar down; a test). */
  topple(b, dx, dz, by = 'world') {
    if (!b || b.state !== INTACT) return false;
    this._break(b, dx, dz, by, BLOW.BLUNT, true);
    return true;
  }

  _showStub(b) {
    if (!b.stub) return;
    b.stub.visible = true;
    if (b.stubR > 0 && !b.stubCollider) {
      b.stubCollider = this.world.colliders?.add?.(b.x, b.z, b.stubR, b.mat === 'wood' ? 'trunk' : 'stone') ?? null;
      if (b.stubCollider && b.mat === 'wood') b.stubCollider.soft = true;
    } else if (b.stubCollider) this.world.colliders?.restore?.(b.stubCollider);
  }

  /**
   * Cut its stump the way it was broken (BREAK.fell, ADR-128): as high as the kind of blow leaves it (a
   * blade: about where it bit), its top on a slanted plane along (dx, dz) with splinters standing out of
   * it, pushed over a little toward the fall; burnt through, low and black.
   */
  _shapeStub(b, kind, dx, dz, exact = 0, exactSlant = NaN) {
    const S = b.stub;
    if (!S?.reshape) return;
    const F = BREAK.fell, P = F[kind] ?? F.blunt;
    let k = vin(P.h);
    let slant = Number.isFinite(exactSlant) ? exactSlant : vin(P.slant);
    let ux = dx, uz = dz;
    if (kind === BLOW.CUT && !Number.isFinite(exactSlant) && vr() < 0.5) slant = -slant; // (a blade's cut slants either way across it)
    if (kind === BLOW.BLAST || kind === BLOW.FIRE) {
      const a = vr() * 6.283;
      ux = Math.cos(a);
      uz = Math.sin(a);
    }
    const jag = P.jag, lean = P.lean * (0.5 + vr()), sd = vr() * 97, char = P.char ?? 1;
    const bx = b.x, bz = b.z, hy = b.hy;
    S.reshape((H, N, C, O) => {
      let top = 0.05;
      for (let i = 1; i < O.length; i += 3) if (O[i] > top) top = O[i];
      // (a blade: the height it bit at, within reason)
      if (exact > 0) k = exact / top;
      else if (kind === BLOW.CUT && hy > 0) k = clamp((hy / top) * (0.85 + 0.3 * vr()), 0.8, 1.5);
      const cut = top * k, nl = 1 / Math.hypot(slant, 1);
      for (let v = 0; v < O.length; v += 3) {
        const ox = O[v], oy = O[v + 1], oz = O[v + 2];
        const t = oy / top;
        // its top on the plane of the break, splintered (the vertices that share a corner share a splinter);
        // the ring below it carried up or down with it, the ring on the ground left where it is
        const d = (ox - bx) * ux + (oz - bz) * uz;
        const plane = cut + slant * d;
        const up = Math.min(1, t / 0.55);
        const sp = t > 0.45 ? jag * top * (h2(ox * 13 + sd, oz * 13 - sd) - 0.3) * Math.min(1, (t - 0.45) / 0.15) : 0;
        const y = Math.max(t > 0.45 ? 0.06 : 0, plane * up + sp);
        H[v] = ox + dx * y * lean;
        H[v + 1] = y;
        H[v + 2] = oz + dz * y * lean;
        if (N && N[v + 1] > 0.7) {
          // (the cap faces the plane)
          N[v] = -slant * ux * nl;
          N[v + 1] = nl;
          N[v + 2] = -slant * uz * nl;
        }
        if (C && char < 1) {
          // burnt: black at the top, the bark's own dark lower down
          const f = char + (1 - char) * 0.55 * (1 - Math.min(1, t));
          C[v] *= f;
          C[v + 1] *= f * 0.9;
          C[v + 2] *= f * 0.85;
        }
      }
    });
  }

  _break(b, dx, dz, by, kind, force = false) {
    this._free(b);
    b.carry = b.burn > 0 ? b.burn : 0; // a tree felled burning goes on burning where it lies
    this._stopBurn(b);
    b.hp = 0;
    b.by = by;
    b.shake = 0;
    b.pivot.rotation.set(0, 0, 0);
    this._place(b);
    this._showStub(b);
    const l = Math.hypot(dx, dz);
    if (l < 1e-4) {
      const a = rnd() * 6.283;
      dx = Math.cos(a);
      dz = Math.sin(a);
    } else {
      dx /= l;
      dz /= l;
    }
    // how it lies follows the blow (BREAK.fell, ADR-128): a tree goes over a little off the blow's line,
    // more for a blast than a blade, and rolls about its trunk on the way down
    // (the forest's trees: wood drawn in the forest's mesh that leaves a trunk lying; not the Cinder Tree)
    const wood = b.mat === 'wood' && b.ranged && b.wrecks;
    const FP = BREAK.fell[kind] ?? BREAK.fell.blunt;
    b.fk = kind;
    b.spin = 0;
    if (wood) {
      turn(dx, dz, (vr() - 0.5) * 2 * FP.spread, this._way);
      dx = this._way.dx;
      dz = this._way.dz;
      b.spin = (vr() - 0.5) * 2 * BREAK.fell.spin;
    }
    // a tree of the wall falls mostly away from the arena (BREAK.wall.out); one already leaning goes
    // the way it leans (that way was turned outward when it leaned)
    if (b.wall && b.lean > 0.02) {
      dx = b.ldx;
      dz = b.ldz;
    } else if (b.wall) {
      this._wallWay(b, dx, dz);
      dx = this._way.dx;
      dz = this._way.dz;
    }
    b.dx = dx;
    b.dz = dz;
    if (wood) this._shapeStub(b, kind, dx, dz);
    // sliced (BREAK.slice): cut through where the blow bit; the stump keeps that height on a clean slant,
    // the top comes off the cut (_sliceFall)
    b.cutY = 0;
    if (b.slice && b.ranged && kind !== BLOW.FIRE && Number.isFinite(b.hy)) {
      const SL = BREAK.slice;
      b.cutY = clamp(b.hy, SL.low, Math.max(SL.low, b.h - SL.top));
      b.body.cutY = b.cutY;
      b.touched = true;
      b.body.write(); // (the cut shows in the frame of the blow, not the next)
      turn(dx, dz, (vr() - 0.5) * 2 * SL.spread, this._way);
      dx = b.dx = this._way.dx;
      dz = b.dz = this._way.dz;
      b.spin = (vr() - 0.5) * 2 * SL.spin;
      this._shapeStub(b, BLOW.CUT, dx, dz, b.cutY, vin(SL.slant) * (vr() < 0.5 ? -1 : 1));
    }
    if ((b.topples || force) && kind !== BLOW.FIRE) {
      b.state = FALLING;
      b.t = 0;
      b.T = b.fallT > 0 ? b.fallT : clamp(BREAK.topple.time * Math.sqrt(b.h / 5), 0.55, 1.5);
      if (b.cutY > 0) b.T = clamp(BREAK.slice.fall * Math.sqrt(b.h - b.cutY), 0.45, 1.4);
      b.told = b.flashed = false;
      b.mark = 0;
      // a piece whose fall cannot reach the hero's ground tells nothing and marks nothing (the wall's
      // trees falling outward): only one that can land inside his bound is a red blow
      const pad = BREAK.topple.pad + b.r * 0.6 + 0.6, hb = CONFIG.world.playerBound ?? 31;
      // (fallOff: a colossus's upper half lands that much further out)
      const reach = b.fallOff + b.h + pad;
      // (his ground: the level's circle, or what the wall's fallen trees have opened of it: edge.js)
      // (a light piece: never a blow, never told; ADR-145)
      b.quiet = b.lightPiece || (this.edge
        ?!this.edge.reaches(b.x, b.z, b.x + dx * reach, b.z + dz * reach, pad)
        : segDist(0, 0, b.x, b.z, b.x + dx * reach, b.z + dz * reach, this._seg) > hb + pad);
      this._wake(b);
      this._burst(b, b.x, 0.4, b.z, dx, dz, 10, 0.4);
      this._emit('topple', b, b.x, 0.5, b.z, b.weight, by);
    } else {
      this._crumble(b, dx, dz, false);
      b.state = BROKEN;
      const loud = this._loud(b);
      // (a floor slab: a few marks of its own, and the blow that broke it shakes the camera, not each slab)
      this.world.scars?.rubble(b.x, b.z, b.floor ? b.r : b.r * 1.8 + 0.4, b.M, b.floor ? 2 + Math.round(2 * this.q) : 6 + Math.round(b.weight * 6 * this.q), b.digits ? DIGITS : '.,:o');
      if (b.wrecks && b.blocks > 0) {
        // a statue's legs: big blocks round where it stood
        for (let i = 0; i < b.blocks; i++) {
          const a = (i / b.blocks) * 6.283 + rnd() * 1.2, d = b.r * (0.9 + rnd() * 0.6);
          this.wreck?.block(b.x + Math.cos(a) * d, b.z + Math.sin(a) * d, 0.6 + rnd() * 0.5, b.M);
        }
      } else if (b.wrecks && !b.stub && b.mat === 'stone' && b.h >= 0.4) this.wreck?.rubble(b.x, b.z, b.r * 0.85, b.M);
      // (a boulder leaves a pile of itself; a stone with a broken base of its own has that)
      // ... and a broken bone (a rib, a run of vertebrae, the skull, the nest's ribcage) a heap of its shards
      // (2026-11-16: a broken skeleton left nothing lying)
      // (the landmarks list `wreck: false` against logs and rubble; their bones still leave a heap)
      else if (b.mat === 'bone' && b.h >= 0.4) this._boneHeap(b, 0, 0, 0);
      if (!b.floor && !b.lightPiece) this.game.shake?.(clamp(0.12 + 0.12 * b.weight, 0.1, 0.4));
      // (a slab breaking under someone's feet: a hop of grit and chunks off it, besides its crumble)
      else this._burst(b, b.x, 0.08, b.z, dx, dz, BREAK.floor.grit, 0.3);
      if (loud) this._emit('break', b, b.x, b.h * 0.5, b.z, b.weight, by);
    }
  }

  /**
   * A felled tree's trunk lying from its stump (BREAK.fell, ADR-128): turned off its fall as it lands, a
   * little longer or shorter, its far end resting raised on its crown, or broken in two with a kink
   * between the halves, as the blow that felled it (b.fk) makes likely. `charred`: it burned through.
   */
  _logs(b, dx, dz, len, r, burn, charred) {
    const W = this.wreck;
    if (!W) return;
    const F = BREAK.fell, P = F[b.fk] ?? F.blunt, way = this._way;
    turn(dx, dz, (vr() - 0.5) * 2 * P.yaw, way);
    let lx = way.dx, lz = way.dz;
    len *= 0.85 + 0.3 * vr();
    const off = b.stub ? 0.45 : 0, x0 = b.x + lx * off, z0 = b.z + lz * off;
    if (len > 2.2 && vr() < P.split) {
      // broken in two: the half by the stump, then the rest turned off it, a gap between
      const a = len * (0.4 + 0.25 * vr()), g = F.gap * (0.5 + vr());
      W.log(x0, z0, lx, lz, a, r, burn, charred, vr() * F.pitch * 0.5);
      const sx = x0 + lx * (a + g), sz = z0 + lz * (a + g);
      turn(lx, lz, (vr() < 0.5 ? -1 : 1) * vin(F.kink), way);
      // (the far half starts on its side of the break: half a width across, so the two read as one trunk snapped)
      W.log(sx - way.dz * r * 0.5 * (vr() - 0.5), sz + way.dx * r * 0.5 * (vr() - 0.5), way.dx, way.dz, len - a - g, r * (0.8 + 0.1 * vr()), burn, charred, vr() * F.pitch);
    } else W.log(x0, z0, lx, lz, len, r, burn, charred, vr() * F.pitch);
  }

  /** What a broken bone piece leaves lying (wreckage.js's bone heaps): one heap, or along its fall (dx, dz, len). */
  _boneHeap(b, dx, dz, len) {
    const W = this.wreck;
    if (!W) return;
    // (one heap a piece, where the most of it came down; the skeleton and the nest are ~50 pieces)
    const r = clamp(b.r * 0.8, 0.5, 1.6);
    W.rubble(b.x + dx * len * 0.4, b.z + dz * len * 0.4, r, b.M);
  }

  /** Its colliders and nicks go. */
  _free(b) {
    const C = this.world.colliders;
    for (const c of b.colliders) C?.remove?.(c);
    this.world.scars?.drop(b.id);
  }

  /**
   * Put a piece's matrices right after it moved (its pivot changed): its node does not auto-update,
   * so this is the only place its world matrices (and its meshes', which the rigid batch reads) are made.
   */
  _place(b) {
    b.pivot.updateMatrix();
    if (b.node.parent) b.node.updateMatrixWorld(true);
  }

  _wake(b) {
    if (b.on) return;
    b.on = true;
    this.active.push(b);
  }

  // ------------------------------------------------------------------ fire
  /** Fire lands on the disc (x, z, r): wood standing in it catches (k scales how long it burns), and logs lying there. */
  ignite(x, z, r, k = 1) {
    if (!Number.isFinite(x + z + r) || !(k > 0)) return 0;
    let n = this.wreck?.ignite(x, z, r, k) ?? 0;
    if (!this._cells(x - r, z - r, x + r, z + r)) return n;
    const L = this.list, g = this._g, R = this._gr, ra = R.a, rb = R.b, rc = R.c, rd = R.d;
    for (let cz = rc; cz <= rd; cz++) {
      for (let cx = ra; cx <= rb; cx++) {
        const c = cz * g.nx + cx;
        for (let kk = g.start[c]; kk < g.start[c + 1]; kk++) {
          const b = L[g.items[kk]];
          if (b.state !== INTACT || !b.burns || b.burn > 0 || b.burnt) continue;
          if (Math.hypot(b.x - x, b.z - z) > r + b.r) continue;
          // (the cap on fire that lands: BREAK.light, the wall's BREAK.wall.fire; past it the wood is only scorched)
          if (b.wall) {
            if (!this._wallRoom(true)) continue;
            this._wallLit -= 1;
          } else {
            if (this._litTokens < 1 || this.burning - this._wallBurning >= Math.max(2, Math.round(BREAK.light.maxBurning * this.q))) continue;
            this._litTokens -= 1;
          }
          this._light(b, k, 0);
          n++;
        }
      }
    }
    return n;
  }

  /** It catches: alight for BREAK.burn.time x k. `gen`: how many spreads away from fire that landed. */
  _light(b, k, gen = 0) {
    b.gen = gen;
    b.burn = b.burnLife = BREAK.burn.time * k * (0.85 + 0.3 * rnd());
    b.flame = 0;
    b.heatT = 0;
    b.spreadT = 0;
    this._burningN++;
    if (b.wall) this._wallBurning++;
    b.light = this._lightAt(b.x, Math.min(2.5, b.h * 0.4), b.z, BREAK.burn.glow.radius, b.burn + 0.6);
    this._wake(b);
    this._emit('burn', b, b.x, b.h * 0.5, b.z, k, 'world');
  }

  /**
   * A local glow for something alight (BREAK.burn.glow): within `share` m of a light already burning it
   * shares that one (kept on for as long as either burns: one light for a cluster), else a new one while
   * fewer than BREAK.burn.lights burn (the light pool is finite, and only 8 reach the shaders).
   */
  _lightAt(x, y, z, radius, life) {
    let lit = 0, near = null, nd = BREAK.burn.glow.share;
    const A = this.active, WL = this.wreck?.live;
    const see = (L) => {
      if (!L || L.dead) return;
      lit++;
      const d = Math.hypot(L.x - x, L.z - z);
      if (d < nd) {
        nd = d;
        near = L;
      }
    };
    for (let i = 0; i < A.length; i++) if (A[i].burn > 0) see(A[i].light);
    if (WL) for (let i = 0; i < WL.length; i++) if (WL[i].burn > 0) see(WL[i].light);
    if (near) {
      if (Number.isFinite(near.age)) near.life = Math.max(near.life, near.age + life);
      return null;
    }
    if (lit >= BREAK.burn.lights) return null;
    return this.game.lights?.add?.({ x, y, z, color: [1.0, 0.4, 0.1], intensity: BREAK.burn.glow.intensity, radius, life, fade: 1.2, flicker: 0.55 }) ?? null;
  }

  /** Room for one more fire that spreads (the cap: BREAK.spread.maxBurning x quality). */
  _fireRoom() {
    return this.burning - this._wallBurning < Math.max(3, Math.round(BREAK.spread.maxBurning * this.q));
  }

  _stopBurn(b) {
    if (b.burn > 0) {
      b.burn = 0;
      this._burningN--;
      if (b.wall) this._wallBurning--;
      b.light?.kill?.();
      b.light = null;
    }
  }

  _burnStep(b, dt) {
    b.burn -= dt;
    b.spreadT += dt;
    const u = 1 - b.burn / b.burnLife; // 0 → 1 as it burns down
    // it burns down part by part (a tree's crown, BREAK.wear.burn: all of it gone by that share of its burn)
    if (b.order.length && b.dropped < b.order.length) {
      const want = Math.min(b.order.length, Math.floor((u / BREAK.wear.burn) * (b.order.length + 1)));
      if (want > b.dropped) {
        while (b.dropped < want) this._shed(b, b.order[b.dropped++], 0, 0, true);
        this._pose(b);
      }
    }
    // flames up the trunk and through the crown: heat in the fire field (render/fireField.js)
    const fx = this.game.fx?.fire;
    if (fx) {
      b.flame += dt * (22 + b.h * 13) * (1 - 0.4 * u) * this.q;
      const wide = b.leafy > 0 ? b.r * 3.2 : b.r * 1.2;
      while (b.flame >= 1) {
        b.flame -= 1;
        const hy = rnd(), a = rnd() * 6.283;
        const rr = (hy > 0.45 ? wide : b.r) * Math.sqrt(rnd());
        const hot = rnd();
        const q = this._blob;
        q.x = b.x + Math.cos(a) * rr;
        q.y = Math.max(0.7, 0.2 + hy * b.h * (1 - 0.35 * u));
        q.z = b.z + Math.sin(a) * rr;
        q.vx = (rnd() - 0.5) * 0.6;
        q.vy = 1.6 + rnd() * 2.2;
        q.vz = (rnd() - 0.5) * 0.6;
        q.life = 0.4 + rnd() * 0.5;
        q.size = 1.1 + hot * 0.8;
        q.heat = 0.48 + hot * 0.16;
        fx.spawn(q);
      }
    }
    // the ground round it glows and chars; the ring round it burns the hero
    b.heatT -= dt;
    if (b.heatT <= 0) {
      b.heatT = 0.3;
      this.world.scorch?.burnCircle?.(b.x, b.z, b.r + BREAK.burn.pad, 0.05, 0.6);
    }
    this.world.fire?.touch?.(b.x, b.z, b.r + BREAK.burn.pad);
    if (b.burn <= 0) {
      // burned through: what is left of it comes down as embers and ash, a black log beside its stump
      b.burn = 0;
      this._burningN--;
      if (b.wall) this._wallBurning--;
      b.burnt = true;
      b.light = null; // (it fades out on its own)
      this._free(b);
      this._showStub(b);
      this._crumble(b, 0, 0, false, true);
      // the ground it burned on lies black (from above a burnt stretch of the wall reads as one)
      this.world.scorch?.burnCircle?.(b.x, b.z, b.r + BREAK.burn.char, 0.75, 0.25);
      b.state = BROKEN;
      b.hp = 0;
      if (b.wrecks && b.mat === 'wood' && b.h >= 1.5) {
        // (the way it goes: the last blow's, if one leaned it, else any; a stream of its own, BREAK.fell)
        const a = rnd() * 6.283, W = BREAK.wreck, FF = BREAK.fell.fire;
        let dx = Math.cos(a), dz = Math.sin(a);
        if (b.lean > 0.02) {
          dx = b.ldx;
          dz = b.ldz;
        }
        b.fk = BLOW.FIRE;
        if (b.ranged) this._shapeStub(b, BLOW.FIRE, dx, dz);
        const r = b.r * W.thick;
        if (b.ranged && vr() < FF.snag) {
          // it stays standing: a black snag on its stump, leaning a little
          const t = turn(dx, dz, (vr() - 0.5) * 1.2, this._way);
          this.wreck?.log(b.x, b.z, t.dx, t.dz, b.h * vin(FF.snagH), r * 0.9, 0, true, Math.PI / 2 - vr() * FF.snagLean);
        } else this._logs(b, dx, dz, b.h * W.trunk[b.leafy > 0 ? 0 : 1] * 0.8, r, 0, true);
      }
      this._emit('burnout', b, b.x, b.h * 0.4, b.z, b.weight, 'world');
    }
  }

  /**
   * Fire spreads: each thing alight for BREAK.spread.after s tries every `every` s to light one wood
   * piece or log within reach, from a budget of `perSec` a second, never past the cap of fires.
   */
  _spread(dt) {
    const S = BREAK.spread, F = BREAK.wall.fire;
    this._tokens = Math.min(S.bank, this._tokens + dt * S.perSec);
    // (the wall's fire spreads on a budget of its own: a blaze eats into the wall, BREAK.wall.fire)
    this._wallSpread = Math.min(F.spreadBank, this._wallSpread + dt * F.spreadPerSec * this.q);
    const A = this.active;
    for (let i = 0; i < A.length; i++) {
      const b = A[i];
      if (b.burn <= 0 || b.gen >= S.gens + (b.wall ? BREAK.wall.gens : 0) || b.spreadT < S.after + S.every) continue;
      if (b.wall ? !this._wallRoom(false) : this._tokens < 1 || !this._fireRoom()) continue;
      b.spreadT = S.after;
      if (rnd() > (b.wall ? F.chance : S.chance)) continue;
      this._catchNear(b.x, b.z, b.r, b, null, b.gen + 1, b.wall);
    }
    const W = this.wreck;
    if (!W || this._tokens < 1 || !this._fireRoom()) return;
    const WL = W.live;
    for (let i = 0; i < WL.length; i++) {
      const e = WL[i];
      if (e.burn <= 0 || e.gen >= S.gens) continue;
      e.spreadT += dt;
      if (e.spreadT < S.after + S.every) continue;
      e.spreadT = S.after;
      if (rnd() > S.chance) continue;
      const s = rnd() * e.len;
      if (this._catchNear(e.x + e.dx * s, e.z + e.dz * s, e.r, null, e, e.gen + 1) && (this._tokens < 1 || !this._fireRoom())) return;
    }
  }

  /** Light one unburnt piece or log near (x, z) (picked at random among those in reach). True if one caught. */
  _catchNear(x, z, r, self, selfLog = null, gen = 1, wall = false) {
    const S = BREAK.spread, reach = S.reach + r;
    let pick = null, seen = 0;
    if (this._cells(x - reach, z - reach, x + reach, z + reach)) {
      const L = this.list, g = this._g, R = this._gr, ra = R.a, rb = R.b, rc = R.c, rd = R.d;
      for (let cz = rc; cz <= rd; cz++) {
        for (let cx = ra; cx <= rb; cx++) {
          const c = cz * g.nx + cx;
          for (let k = g.start[c]; k < g.start[c + 1]; k++) {
            const b = L[g.items[k]];
            // (the wall's fire spreads through the wall: it does not walk back into the clearing on the wall's budget)
            if (b === self || b.state !== INTACT || !b.burns || b.burn > 0 || b.burnt || (wall && !b.wall)) continue;
            if (Math.hypot(b.x - x, b.z - z) > reach + b.r + b.leafy * 1.5) continue;
            if (rnd() * ++seen < 1) pick = b;
          }
        }
      }
    }
    let log = null;
    if (this.wreck) {
      const WL = this.wreck.live;
      for (let i = 0; i < WL.length; i++) {
        const e = WL[i];
        if (e === selfLog || e.kind !== 0 || e.burn > 0 || e.sink > 0) continue;
        if (this.wreck._dist(e, x, z) > reach) continue;
        if (rnd() * ++seen < 1) log = e;
      }
    }
    if (log && this.wreck._light(log, BREAK.wreck.burn * S.k, gen)) {
      if (wall) this._wallSpread -= 1;
      else this._tokens -= 1;
      return true;
    }
    if (pick && !log) {
      this._light(pick, S.k, gen);
      if (wall) this._wallSpread -= 1;
      else this._tokens -= 1;
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ lifting and throwing
  /** A boss lifts a piece: it leaves the ground (no collider, no nicks). The caller moves it with carry(). */
  take(b) {
    if (!b || b.state !== INTACT || !(b.lift > 0)) return false;
    this._free(b);
    this._stopBurn(b);
    if (b.floor) {
      // a slab torn out of the floor: its hole shows (its broken look), a block of prop art in his hands
      b.body.visible = false;
      if (b.crack) b.crack.visible = false;
      this._showStub(b);
      let m = null;
      for (let i = 0; i < this._carry.length && !m; i++) if (!this._carry[i].visible) m = this._carry[i];
      if (m) {
        const k = b.kind === 'plate' ? 1.2 : 1;
        m.scale.set(k, k, k);
        m.updateMatrix();
        m.visible = true;
        b.pivot.add(m);
        b.held = m;
      }
      if (!b.node.parent) this.pieces.add(b.node);
    }
    b.state = HELD;
    b.shake = 0;
    b.lean = b.leanTo = 0;
    b.px = b.x;
    b.py = 0;
    b.pz = b.z;
    b.pivot.rotation.set(0, 0, 0);
    this._place(b);
    this._pose(b);
    this._burst(b, b.x, 0.3, b.z, 0, 0, 12, 0.5); // torn out of the ground
    this.world.scars?.ground(b.x, b.z, 0.6 + 0.3 * b.weight);
    this._wake(b);
    this._emit('throw', b, b.x, 0.5, b.z, 0, 'boss');
    return true;
  }

  /** Where a held piece is this frame: its base at (x, y, z), leaning `tilt` rad toward heading `yaw`. */
  carry(b, x, y, z, tilt = 0, yaw = 0) {
    if (!b || b.state !== HELD || !Number.isFinite(x + y + z + tilt + yaw)) return;
    b.px = x;
    b.py = y;
    b.pz = z;
    b.pivot.position.set(x - b.x, y, z - b.z);
    b.pivot.quaternion.setFromAxisAngle(this._axis.set(Math.cos(yaw), 0, -Math.sin(yaw)), tilt);
    this._place(b);
    this._pose(b);
  }

  /**
   * Throw a held piece at (tx, tz): it flies there in `time` s (default by distance), turning end over
   * end, smashing what stands in its way while it flies low, and bursts where it lands: a blast of
   * `power` over `radius` on the other pieces, a scar, its wreckage, and `onLand(b, x, z, radius)` for
   * the thrower's own blow at the hero (the move's tell is the thrower's).
   */
  throwTo(b, tx, tz, o = NONE) {
    if (!b || b.state !== HELD || !Number.isFinite(tx + tz)) return false;
    const dist = Math.hypot(tx - b.px, tz - b.pz);
    const T = clamp(o.time ?? 0.45 + dist / 26, 0.25, 3);
    const g = BREAK.thrown.gravity;
    b.state = FLYING;
    b.t = 0;
    b.T = T;
    b.tx = tx;
    b.tz = tz;
    b.vx = (tx - b.px) / T;
    b.vz = (tz - b.pz) / T;
    b.vy = (0 - b.py + 0.5 * g * T * T) / T;
    b.ang = 0;
    const l = dist > 1e-3 ? dist : 1;
    b.dx = (tx - b.px) / l;
    b.dz = (tz - b.pz) / l;
    b.blast = o.power ?? BREAK.thrown.blast * b.weight;
    b.blastR = o.radius ?? Math.max(1.6, b.h * 0.4);
    b.by = o.by ?? 'boss';
    b.onLand = typeof o.onLand === 'function' ? o.onLand : null;
    b.flySrc = this.swing();
    return true;
  }

  /** Let a held piece go: it falls where it is and bursts. */
  drop(b) {
    if (!b || b.state !== HELD) return false;
    return this.throwTo(b, b.px, b.pz, { time: Math.max(0.25, Math.sqrt((2 * Math.max(0, b.py)) / BREAK.thrown.gravity)), power: 0.3 });
  }

  _fly(b, dt) {
    b.t += dt;
    const g = BREAK.thrown.gravity;
    const x0 = b.px, z0 = b.pz;
    b.px += b.vx * dt;
    b.pz += b.vz * dt;
    b.vy -= g * dt;
    b.py += b.vy * dt;
    b.ang += BREAK.thrown.spin * dt;
    b.pivot.position.set(b.px - b.x, Math.max(0, b.py), b.pz - b.z);
    b.pivot.quaternion.setFromAxisAngle(this._axis.set(b.dz, 0, -b.dx), b.ang);
    this._place(b);
    this._pose(b);
    // low enough, it smashes what stands in its way (once each per throw)
    const F = BREAK.flight;
    if (b.py < F.y && b.t < b.T) {
      const o = this._flyBlow;
      o.by = b.by;
      o.dx = b.dx;
      o.dz = b.dz;
      o.y = Math.max(0.5, b.py);
      o.src = b.flySrc;
      o.spare = b;
      this.sweep(x0, z0, b.px, b.pz, b.r + 0.3, F.power * b.weight, o);
    }
    if (b.t < b.T && b.py > -0.2) return;
    // it lands
    const x = b.tx, z = b.tz;
    b.pivot.position.set(x - b.x, 0, z - b.z);
    this._place(b);
    this._crumble(b, b.dx, b.dz, false);
    b.state = GONE;
    this.world.scars?.ground(x, z, 0.7 + 0.5 * b.weight, b.dx, b.dz);
    this.world.scars?.rubble(x, z, b.blastR, b.M, 8 + Math.round(b.weight * 6 * this.q), b.digits ? DIGITS : '.,:o');
    // what is left of it lies where it came down
    if (b.wrecks) {
      if (b.mat === 'wood' && b.h >= 1.5) this.wreck?.log(x - b.dx * b.h * 0.3, z - b.dz * b.h * 0.3, b.dx, b.dz, b.h * 0.5, b.r * BREAK.wreck.thick);
      else if (b.floor) this.wreck?.shards(x, z, Math.max(0.5, b.r * 0.8), b.M);
      else if (b.mat === 'stone' || b.mat === 'bone') this.wreck?.rubble(x, z, Math.max(0.5, b.r * 0.9), b.M);
    }
    this.world.gust?.(x, z, 1.2, b.blastR + 4);
    this.game.shake?.(clamp(BREAK.thrown.shake * b.weight, 0.15, 0.6));
    this.strike(x, z, b.blastR, b.blast, { kind: BLOW.BLAST, by: b.by, src: this.swing() });
    this._emit('crash', b, x, 0.4, z, b.blast, b.by);
    const cb = b.onLand;
    b.onLand = null;
    if (cb) {
      try {
        cb(b, x, z, b.blastR);
      } catch (err) {
        console.error('[destructibles] onLand failed', err);
      }
    }
  }

  // ------------------------------------------------------------------ falling over
  /**
   * A sliced top's fall (BREAK.slice): it slides off the cut the moment the blade is through (`slide` m
   * down the cut's slope, along the blow, in `slideT` s), then goes over about its lower end as a body
   * falls (the angle grows with the square of the time), kicked out along the blow, its lower end coming
   * down to the ground, rolling a little about its own length. Lands (_land) when it lies flat.
   */
  _sliceFall(b, dt) {
    const SL = BREAK.slice;
    b.t += dt;
    const u = Math.min(1, b.t / b.T), cy = b.cutY;
    const sl = SL.slide * smooth01(Math.min(1, b.t / SL.slideT));
    const q = b.pivot.quaternion;
    q.setFromAxisAngle(this._axis.set(b.dz, 0, -b.dx), (Math.PI / 2 - 0.05) * u * u);
    if (b.spin) q.multiply(this._q.setFromAxisAngle(this._axis.set(0, 1, 0), b.spin * u));
    // about the cut: its lower end (0, cy, 0) stays where the slide and the kick carry it
    const v = this._v.set(0, cy, 0).applyQuaternion(q);
    const out = sl + SL.kick * u * u, drop = cy * u * u + sl * SL.sink;
    b.pivot.position.set(-v.x + b.dx * out, cy - v.y - drop, -v.z + b.dz * out);
    this._place(b);
    this._pose(b);
    if (u >= 1) this._land(b);
  }

  _fall(b, dt) {
    if (b.cutY > 0 && b.ranged) {
      this._sliceFall(b, dt);
      return;
    }
    b.t += dt;
    const u = Math.min(1, b.t / b.T);
    b.pivot.quaternion.setFromAxisAngle(this._axis.set(b.dz, 0, -b.dx), (Math.PI / 2 - 0.06) * Math.pow(u, 2.4));
    // (a tree rolls about its own trunk as it goes over, BREAK.fell.spin: no two crowns land alike)
    if (b.spin) b.pivot.quaternion.multiply(this._q.setFromAxisAngle(this._axis.set(0, 1, 0), b.spin * u));
    const off = b.fallOff;
    // (a piece that stands on another, the upper half of a colossus: it comes off its cut, over and down)
    if (b.y0 > 0 || off > 0) b.pivot.position.set(b.dx * off * u, -b.y0 * u * u, b.dz * off * u);
    this._place(b);
    if (b.ranged) {
      // (a tree that leaned goes on from its lean, which hands over to the fall)
      b.lean = b.leanTo * (1 - u);
      this._pose(b);
    }
    const mx = b.x + b.dx * (off + b.h * 0.55), mz = b.z + b.dz * (off + b.h * 0.55);
    if (b.by !== 'player' && !b.quiet) {
      // a boss felled it: red. Marked on the ground from the moment it starts to go
      const ev = this.game.events;
      if (!b.told) {
        b.told = true;
        const t = this._tell;
        t.impactIn = Math.max(0.05, b.T - b.t);
        t.x = mx;
        t.z = mz;
        ev?.emit?.('combat:tell', t);
      }
      if (!b.flashed && b.T - b.t <= FLASH_LEAD) {
        b.flashed = true;
        // (the boss's fairness guard: a blow of his already cued that needs the other answer near its
        // landing: it lands uncued and harmless, never two answers at once)
        if (this.game.boss?.brain?.worldClash?.(b.T - b.t, TELL.RED)) b.quiet = true;
        else {
          const f = this._flash;
          f.x = mx;
          f.z = mz;
          ev?.emit?.('combat:flash', f);
        }
      }
      const fx = this.game.fx?.add;
      b.mark -= dt;
      if (b.mark <= 0 && fx) {
        b.mark = 0.08;
        const hot = b.flashed ? 1 : 0.5, w = BREAK.topple.pad + b.r * 0.6;
        const rot = Math.atan2(-b.dz * 0.848, b.dx);
        // where it will land: red strokes down both edges of the strip, a row of marks down its
        // middle, brighter once its flash has come (glyphs only: no heat, nothing here burns)
        const p = this._p, c0 = this._c0, c1 = this._c1;
        p.vx = p.vy = p.vz = 0;
        p.life = 0.2;
        p.alpha = 1;
        p.alphaEnd = 0;
        p.gravity = 0;
        p.drag = 0;
        p.spin = 0;
        p.flicker = 0;
        p.color = c0;
        p.colorEnd = c1;
        for (let s = 0.9 + off; s < off + b.h + 0.3; s += 0.45) {
          const cx = b.x + b.dx * s, cz = b.z + b.dz * s;
          for (const side of SIDES) {
            p.x = cx - b.dz * side * w;
            p.y = 0.45;
            p.z = cz + b.dx * side * w;
            p.size = p.sizeEnd = 0.6;
            p.glyph = '-';
            p.rot = rot;
            c0[0] = 3.4 * hot; c0[1] = 0.22 * hot; c0[2] = 0.13 * hot;
            c1[0] = 1.5 * hot; c1[1] = 0.06; c1[2] = 0.04;
            fx.spawn(p);
          }
          p.x = cx + (rnd() - 0.5) * w;
          p.y = 0.4;
          p.z = cz + (rnd() - 0.5) * w;
          p.size = p.sizeEnd = 0.34;
          p.glyph = 'x';
          p.rot = 0;
          c0[0] = 1.8 * hot * u; c0[1] = 0.1 * hot; c0[2] = 0.06 * hot;
          c1[0] = 0.8 * hot * u; c1[1] = 0.03; c1[2] = 0.02;
          fx.spawn(p);
        }
      }
    }
    if (u >= 1) this._land(b);
  }

  _land(b) {
    const T = BREAK.topple;
    const dx = b.dx, dz = b.dz, len = b.h, off = b.fallOff;
    const pad = T.pad + b.r * 0.6;
    const wood = b.mat === 'wood' && b.wrecks && !!this.wreck;
    // a tree's crown comes apart where it lands; its trunk stays lying there (wreckage.js). Stone breaks up
    this._crumble(b, dx, dz, true, false, wood);
    b.state = BROKEN;
    const W = BREAK.wreck;
    if (wood) {
      this._logs(b, dx, dz, len * W.trunk[b.leafy > 0 ? 0 : 1], b.r * W.thick, b.carry, false);
      b.carry = 0;
    } else if (b.wrecks && b.blocks > 0) {
      // a statue: big blocks along where it came down
      for (let i = 0; i < b.blocks; i++) {
        const s = off + (len * (i + 0.5)) / b.blocks, j = (rnd() - 0.5) * b.r;
        this.wreck?.block(b.x + dx * s - dz * j, b.z + dz * s + dx * j, 0.7 + rnd() * 0.6, b.M);
      }
    } else if (b.wrecks && b.mat === 'stone') {
      this.wreck?.rubble(b.x + dx * len * 0.35, b.z + dz * len * 0.35, Math.max(0.45, b.r * 0.8), b.M);
      this.wreck?.rubble(b.x + dx * len * 0.75, b.z + dz * len * 0.75, Math.max(0.4, b.r * 0.65), b.M);
    } else if (b.mat === 'bone') this._boneHeap(b, dx, dz, len);
    if (b.lightPiece) {
      // a light piece (ADR-145): it lies where it fell, and that is all: no ground mark, no gust, no
      // shake, no domino sweep, no blow on anyone; a soft sound
      this._emit('crash', b, b.x + dx * (off + len * 0.5), 0.4, b.z + dz * (off + len * 0.5), b.weight * 0.25, b.by);
      return;
    }
    const sc = this.world.scars;
    sc?.ground(b.x + dx * (off + len * 0.4), b.z + dz * (off + len * 0.4), 0.5 + 0.35 * b.weight, dx, dz);
    sc?.ground(b.x + dx * (off + len * 0.85), b.z + dz * (off + len * 0.85), 0.45 + 0.25 * b.weight, dx, dz);
    for (let s = 0.2; s < 1; s += 0.2) sc?.rubble(b.x + dx * (off + len * s), b.z + dz * (off + len * s), pad + 0.3, b.M, 3, b.digits ? DIGITS : '.,:o');
    this.world.gust?.(b.x + dx * (off + len * 0.5), b.z + dz * (off + len * 0.5), 0.9, len * 0.7 + 3);
    this.game.shake?.(clamp(T.shake * b.weight, 0.15, 0.6));
    // what stood under it
    const ax = b.x + dx * (off + 0.9), az = b.z + dz * (off + 0.9), ex = b.x + dx * (off + len), ez = b.z + dz * (off + len);
    this.sweep(ax, az, ex, ez, pad, (b.wall ? BREAK.wall.domino : 0.7) * b.weight, { kind: BLOW.BLUNT, by: b.by, dx, dz, src: this.swing(), down: true });
    // who stood under it: the hero under a piece a boss (or the world) felled, the boss under the hero's
    const s = this._seg, g = this.game;
    const w = clamp(b.weight, 0.6, 1.3);
    if (b.by === 'player') {
      const boss = g.boss ?? g.dragon;
      const bp = boss?.position;
      if (bp && boss.takeHit && boss.isTargetable?.() !== false && Number.isFinite(bp.x + bp.z)) {
        // his body: the circles the hero collides with (the wyrm's are many), else one round his root
        let under = false;
        const BC = boss.bodyCircles;
        if (BC?.length) {
          for (let i = 0; i < BC.length && !under; i++) under = segDist(BC[i].x, BC[i].z, ax, az, ex, ez, s) <= pad + (BC[i].r ?? 0.5);
        } else under = segDist(bp.x, bp.z, ax, az, ex, ez, s) <= pad + (boss.T?.radius ?? boss.radius ?? 0.6);
        if (under) {
          const h = this._bossHit;
          h.damage = T.bossDamage * w;
          h.posture = T.bossPosture * w;
          h.point.x = bp.x;
          h.point.y = 1.2;
          h.point.z = bp.z;
          h.dir.x = dx;
          h.dir.z = dz;
          try {
            boss.takeHit(h);
          } catch (err) {
            console.error('[destructibles] boss.takeHit failed', err);
          }
        }
      }
    } else if (!b.quiet) {
      const p = g.player;
      if (p?.takeHit && p.alive !== false && g.state === 'boss' && segDist(p.position.x, p.position.z, ax, az, ex, ez, s) <= pad + (p.radius ?? 0.45)) {
        const h = this._heroHit;
        h.damage = T.damage * w;
        h.knockback = T.knock;
        h.from.x = ax + (ex - ax) * s.t - dz * 0.01;
        h.from.z = az + (ez - az) * s.t + dx * 0.01;
        try {
          p.takeHit(h);
        } catch (err) {
          console.error('[destructibles] player.takeHit failed', err);
        }
      }
    }
    this._emit('crash', b, b.x + dx * (off + len * 0.5), 0.4, b.z + dz * (off + len * 0.5), b.weight, b.by);
  }

  // ------------------------------------------------------------------ debris (glyph particles)
  /** Chips off a struck piece: they fly back off the face and to the sides. */
  _chips(b, x, y, z, dx, dz, power, bit = false) {
    const fx = b.M.sparks ? this.game.fx?.add : this.game.fx?.alpha;
    if (!fx) return;
    const fq = this.q * (b.floor ? BREAK.floor.debris : 1);
    // (`bit`: its bricks fell as letters, _drop: only a few splinters with them)
    const n = Math.round(clamp(3 + power * 12, 3, 18) * fq * (bit ? 0.3 : 1));
    const M = b.M, p = this._p;
    // (a blade passing through, BREAK.chip.pass: thrown on along its travel `tx, tz` and out of the
    // face; any other blow: back off the face toward the one who struck it)
    const tx = this._tx, tz = this._tz, along = tx !== 0 || tz !== 0, PA = BREAK.chip.pass.along;
    let nx = x - b.x, nz = z - b.z;
    const nl = Math.hypot(nx, nz);
    if (nl > 1e-3) {
      nx /= nl;
      nz /= nl;
    } else {
      nx = -dx;
      nz = -dz;
    }
    p.glyph = M.chips;
    p.color = M.color;
    p.colorEnd = M.colorEnd;
    p.alpha = 1;
    p.alphaEnd = 0;
    p.gravity = -15;
    p.drag = 0.5;
    p.flicker = 0;
    p.sizeEnd = 0.14;
    for (let i = 0; i < n; i++) {
      const side = (rnd() - 0.5) * 2, back = 0.8 + rnd() * 2.6 * Math.min(1.4, 0.5 + power);
      p.x = x + (rnd() - 0.5) * 0.25;
      p.y = y + (rnd() - 0.5) * 0.3;
      p.z = z + (rnd() - 0.5) * 0.25;
      if (along) {
        p.vx = (tx * PA + nx * 0.5) * back - tz * side * 0.7;
        p.vy = 0.8 + rnd() * 2.2;
        p.vz = (tz * PA + nz * 0.5) * back + tx * side * 0.7;
      } else {
        p.vx = -dx * back - dz * side * 2.2;
        p.vy = 1.2 + rnd() * 3.2;
        p.vz = -dz * back + dx * side * 2.2;
      }
      p.life = 0.45 + rnd() * 0.45;
      p.size = 0.3 + rnd() * 0.2 + power * 0.1;
      p.spin = (rnd() - 0.5) * 12;
      p.rot = rnd() * 6.283;
      fx.spawn(p);
    }
    // dust off stone, a breath of it off wood
    const dust = this.game.fx?.alpha;
    if (dust && !M.sparks) {
      p.glyph = M.dust;
      p.color = M.colorEnd;
      p.alpha = 0.55;
      p.gravity = 0;
      p.drag = 1.4;
      p.size = 0.2;
      p.sizeEnd = 0.5;
      p.spin = 0;
      p.rot = 0;
      const m = Math.round((2 + power * 4) * fq);
      for (let i = 0; i < m; i++) {
        p.x = x + (rnd() - 0.5) * 0.4;
        p.y = y + (rnd() - 0.5) * 0.4;
        p.z = z + (rnd() - 0.5) * 0.4;
        p.vx = (along ? tx * 0.8 + nx * 0.3 : -dx * 0.6) + (rnd() - 0.5) * 0.8;
        p.vy = 0.3 + rnd() * 0.6;
        p.vz = (along ? tz * 0.8 + nz * 0.3 : -dz * 0.6) + (rnd() - 0.5) * 0.8;
        p.life = 0.6 + rnd() * 0.6;
        dust.spawn(p);
      }
    }
  }

  /** A burst of a piece's own debris at a point (its base as it goes, the ground it is torn from). */
  _burst(b, x, y, z, dx, dz, n, k) {
    const fx = this.game.fx?.alpha;
    if (!fx) return;
    const M = b.M, p = this._p;
    p.glyph = M.chips;
    p.color = M.color;
    p.colorEnd = M.colorEnd;
    p.alpha = 1;
    p.alphaEnd = 0;
    p.gravity = -15;
    p.drag = 0.5;
    p.flicker = 0;
    p.sizeEnd = 0.14;
    n = Math.round(n * this.q);
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.283, v = (1 + rnd() * 3) * k * 2;
      p.x = x + Math.cos(a) * b.r * 0.6;
      p.y = y + rnd() * 0.3;
      p.z = z + Math.sin(a) * b.r * 0.6;
      p.vx = Math.cos(a) * v + dx * 1.5;
      p.vy = 1.5 + rnd() * 3.5 * k * 2;
      p.vz = Math.sin(a) * v + dz * 1.5;
      p.life = 0.5 + rnd() * 0.4;
      p.size = 0.3 + rnd() * 0.22;
      p.spin = (rnd() - 0.5) * 10;
      p.rot = rnd() * 6.283;
      fx.spawn(p);
    }
  }

  /**
   * The piece comes apart into a shower of its own characters (the digits prop art prints it in, a
   * tree's round leaves and strokes), wherever its body is now: standing, lying where it fell, or
   * where it was thrown. `fallen`: it already lies along (dx, dz); `ember`: it burned through;
   * `crown`: only its crown comes apart (its trunk stays lying: wreckage.js).
   * (The owner's pick of three filmed looks, 2026-11-15; bigger lumps and long shards were turned down.)
   */
  _crumble(b, dx, dz, fallen, ember = false, crown = false) {
    b.body.visible = false;
    if (b.crack) b.crack.visible = false;
    if (b.held) {
      // (a slab carried out of the floor: its block goes back to the pool)
      b.held.visible = false;
      this.pieces.add(b.held);
      b.held = null;
    }
    if (b.ranged) b.touched = true;
    const solid = this.game.fx?.alpha, glow = this.game.fx?.add;
    if (!solid) return;
    const M = b.M, p = this._p, c0 = this._c0;
    let n = Math.round(clamp(b.r * b.h * 26, 26, 130) * this.q * (b.floor ? BREAK.floor.debris : 1));
    if (crown) n = Math.round(n * (b.leafy > 0 ? 0.7 : 0.35));
    // (a tree worn down has less of itself left to come apart)
    if (b.order.length) n = Math.round(n * (1 - 0.6 * (b.dropped / b.order.length)));
    // (a bone landmark's piece: half as many, and all from the debris budget, BREAK.debris: a round of
    // blows that broke twenty ribs at once threw a white cloud of digits)
    if (b.mat === 'bone') n = Math.round(n * 0.5);
    n = Math.max(Math.min(n, 6), Math.min(n, Math.floor(this._debris)));
    this._debris -= n;
    const prop = b.digits;
    const wx = b.x + b.pivot.position.x, wy = b.y0 + b.pivot.position.y, wz = b.z + b.pivot.position.z;
    const q = b.pivot.quaternion, v = this._v;
    const wide = b.leafy > 0 ? b.r * 3.4 : b.r * 1.1;
    for (let i = 0; i < n; i++) {
      // (a crown: the top of it; a bare tree's: its upper branches)
      const t = crown ? 0.45 + 0.55 * rnd() : rnd();
      const leaf = b.leafy > 0 && t > 1 - b.leafy;
      const a = rnd() * 6.283, rr = (leaf ? wide : b.r) * Math.sqrt(rnd());
      v.set(Math.cos(a) * rr, t * b.h, Math.sin(a) * rr).applyQuaternion(q);
      const x = wx + v.x, y = Math.max(0.1, wy + v.y), z = wz + v.z;
      const out = 0.6 + rnd() * 2.2;
      const up = fallen ? 0.6 + rnd() * 2.4 : 0.5 + rnd() * 3.2;
      const fall = Math.sqrt((2 * y) / 15) + up / 15;
      // (burnt through: charred leaves and wood falling dark, a few sparks; metal: its sparks)
      const hot = (ember && rnd() < 0.2) || (M.sparks && rnd() < 0.35);
      const char = ember && !hot;
      p.x = x;
      p.y = y;
      p.z = z;
      p.vx = Math.cos(a) * out + dx * (fallen ? 1.2 : 2.6);
      p.vy = up;
      p.vz = Math.sin(a) * out + dz * (fallen ? 1.2 : 2.6);
      p.life = clamp(fall + 0.3 + rnd() * 0.35, 0.5, 1.7);
      p.size = (leaf ? 0.46 : 0.42) + rnd() * 0.24;
      p.sizeEnd = 0.2;
      p.glyph = hot && ember ? SPARKS : leaf ? LEAVES : prop ? DIGITS : M.chips;
      if (hot && ember) {
        p.color = SPARK;
        p.colorEnd = SPARK_END;
        p.size = 0.2 + rnd() * 0.08;
      } else if (hot) {
        c0[0] = 2.8; c0[1] = 0.9 + rnd() * 0.6; c0[2] = 0.18;
        p.color = c0;
        p.colorEnd = HOT_END;
      } else if (char) {
        p.color = CHAR;
        p.colorEnd = CHAR_END;
      } else {
        p.color = leaf ? SHED_LEAF : b.mat === 'bone' ? SHED_BONE : b.mat === 'wood' && !prop ? SHED_WOOD : M.color;
        p.colorEnd = leaf ? SHED_LEAF_END : b.mat === 'bone' ? SHED_BONE_END : b.mat === 'wood' && !prop ? SHED_WOOD_END : M.colorEnd;
      }
      p.alpha = 1;
      p.alphaEnd = 0;
      p.gravity = leaf ? -5 : -15;
      p.drag = leaf ? 1.6 : 0.4;
      p.spin = (rnd() - 0.5) * (leaf ? 4 : 9);
      p.rot = rnd() * 6.283;
      p.flicker = hot ? 0.4 : 0;
      (hot && glow ? glow : solid).spawn(p);
    }
    // the dust it raises
    p.glyph = M.dust;
    p.color = M.colorEnd;
    p.colorEnd = M.colorEnd;
    p.alpha = 0.5;
    p.alphaEnd = 0;
    p.gravity = 0;
    p.drag = 1.2;
    p.spin = 0;
    p.rot = 0;
    p.flicker = 0;
    p.size = 0.3;
    p.sizeEnd = 0.9;
    const m = Math.round((6 + b.weight * 5) * this.q * (b.floor ? BREAK.floor.debris : 1));
    for (let i = 0; i < m; i++) {
      const t = rnd();
      v.set((rnd() - 0.5) * b.r * 2, t * b.h, (rnd() - 0.5) * b.r * 2).applyQuaternion(q);
      p.x = wx + v.x;
      p.y = Math.max(0.15, wy + v.y) * 0.5 + 0.2;
      p.z = wz + v.z;
      p.vx = (rnd() - 0.5) * 1.6;
      p.vy = 0.4 + rnd() * 0.9;
      p.vz = (rnd() - 0.5) * 1.6;
      p.life = 0.9 + rnd() * 0.9;
      solid.spawn(p);
    }
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    if (!(dt > 0)) return;
    const A = this.active;
    let rShake = 0;
    if (A.length) {
      const time = this.game.time ?? 0;
      for (let i = A.length - 1; i >= 0; i--) {
        const b = A[i];
        let busy = false;
        if (b.state === FALLING) {
          this._fall(b, dt);
          busy = b.state === FALLING;
        } else if (b.state === FLYING) {
          this._fly(b, dt);
          busy = b.state === FLYING;
        } else if (b.state === HELD) busy = true;
        else if (b.state === INTACT) {
          if (b.burn > 0) {
            this._burnStep(b, dt);
            busy = b.burn > 0;
          }
          let moved = false;
          if (b.state === INTACT && b.lean < b.leanTo) {
            // the last stage: it creaks over (BREAK.wear.leanTime)
            b.lean = Math.min(b.leanTo, b.lean + (dt * b.leanTo) / BREAK.wear.leanTime);
            moved = busy = true;
          }
          if (b.state === INTACT && b.shake > 0) {
            // a struck piece shudders along the blow
            b.shake = Math.max(0, b.shake - dt);
            const k = Math.sin(time * 58) * b.shakeAmp * (b.shake / 0.28);
            b.pivot.rotation.set(b.dz * k, 0, -b.dx * k);
            this._place(b);
            busy = busy || b.shake > 0;
            moved = true;
            if (b.ranged && b.shake > 0) rShake++;
          }
          if (moved) this._pose(b);
        }
        if (!busy) {
          b.on = false;
          A[i] = A[A.length - 1];
          A.pop();
        }
      }
    }
    this._rShake = rShake;
    if (this.burning > 0) this._spread(dt);
    this._litTokens = Math.min(BREAK.light.bank, this._litTokens + dt * BREAK.light.perSec);
    const F = BREAK.wall.fire;
    this._wallLit = Math.min(F.bank, this._wallLit + dt * F.perSec * this.q);
    this._debris = Math.min(BREAK.debris.bank, this._debris + dt * BREAK.debris.perSec * this.q);
    this._windStep();
    this.wreck?.update(dt);
    // the edge of the open ground: a tree of the wall is down, the ground behind it is the hero's (world:edge)
    const E = this.edge;
    if (E) {
      const was = E.open;
      if (E.update(dt) && E.grewLane >= 0) {
        const e = this._edgeEv, a = E.laneAngle(E.grewLane), r = E.R[E.grewLane];
        e.x = Math.cos(a) * r;
        e.z = Math.sin(a) * r;
        e.reach = r;
        e.lanes = E.lanes;
        e.first = !was;
        this.game.events?.emit?.('world:edge', e);
      }
    }
    flushRanges();
  }

  /** One piece stands again, whole, as the reset leaves it (its colliders back). */
  _restore(b) {
    const C = this.world.colliders;
    this._stopBurn(b);
    if (b.stubCollider) C?.remove?.(b.stubCollider);
    for (const c of b.colliders) C?.restore?.(c);
    b.state = INTACT;
    b.hp = b.hpMax;
    b.burnt = false;
    b.carry = 0;
    b.spare = 0;
    b.shake = 0;
    b.windT = -1e9;
    b.src = -1;
    b.srcT = -1e9;
    b.onLand = null;
    b.on = false;
    if (b.held) {
      b.held.visible = false;
      this.pieces.add(b.held);
      b.held = null;
    }
    b.cracked = false;
    if (b.crack) b.crack.visible = false;
    b.wear = b.dropped = 0;
    b.lean = b.leanTo = 0;
    b.quiet = false;
    b.bricks?.reset();
    b.pivot.position.set(0, 0, 0);
    b.pivot.quaternion.identity();
    if (b.ranged && b.touched) {
      // (only what was touched is rewritten: the forest is one mesh of ~600k vertices)
      b.body.home0();
      if (b.body.visible) b.body.write();
      else b.body.visible = true;
      b.touched = false;
    } else b.body.visible = true;
    if (b.stub) {
      b.stub.unshape?.(); // (cut as it was felled: back to the stump it was built as)
      b.stub.visible = false;
    }
    // (a lifted slab leaves the graph again; every other piece's matrices are put back)
    if (b.floor && b.node.parent) this.pieces.remove(b.node);
    else this._place(b);
  }

  /**
   * Scenes (ADR-157; a set with `scenes`, world/scriptHall.js): piece `b` is put out of the world
   * (`on` false: hidden with its stub and cracks, its colliders out, its fire out, GONE to every query:
   * strike, sweep, stop, coverAt, nearest, floorNear, ignite, bites) or back in it, whole (`on` true: as
   * the reset leaves it, its colliders back). A set without scenes never calls it. Returns true if it
   * changed. `absent` on the piece says which.
   */
  present(b, on) {
    if (!b || !!on === !b.absent) return false;
    if (on) {
      b.absent = false;
      this._restore(b);
    } else this._absent(b);
    flushRanges();
    return true;
  }

  _absent(b) {
    const C = this.world.colliders;
    b.absent = true;
    this._stopBurn(b);
    if (b.stubCollider) C?.remove?.(b.stubCollider);
    for (const c of b.colliders) C?.remove?.(c);
    this.world.scars?.drop?.(b.id);
    if (b.held) {
      b.held.visible = false;
      this.pieces.add(b.held);
      b.held = null;
    }
    b.state = GONE;
    b.hp = 0;
    b.shake = 0;
    b.burn = 0;
    b.onLand = null;
    b.body.visible = false;
    if (b.stub) b.stub.visible = false;
    if (b.crack) b.crack.visible = false;
    b.cracked = false;
    if (b.floor && b.node.parent) this.pieces.remove(b.node);
    else this._place(b);
  }

  /** Everything stands again (the fight's reset: flow.js, the Lab). On a set with scenes (ADR-157)
   *  the pieces of every scene but the first are put out of the world again (present). */
  reset() {
    for (const b of this.list) {
      b.absent = false;
      this._restore(b);
    }
    this.sceneNow = this.sceneHome;
    if (this.sceneHome !== null) for (const b of this.list) if (b.scene !== null && b.scene !== this.sceneHome) this._absent(b);
    this._rShake = 0;
    this.active.length = 0;
    this._burningN = 0;
    this._wallBurning = 0;
    this._tokens = BREAK.spread.bank;
    this._litTokens = BREAK.light.bank; // (fire that lands: BREAK.light)
    this._wallLit = BREAK.wall.fire.bank;
    this._wallSpread = BREAK.wall.fire.spreadBank;
    this._wq.n = 0;
    const st = this.stat;
    st.wind = st.windTrees = st.carry = st.reached = st.lit = 0;
    this.bitten = 0;
    this.wreck?.reset();
    this.edge?.refresh();
    flushRanges();
  }
}
