import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createAsciiObjectMaterial, createCarvedGlyphMaterial, createPropArtMaterial } from '../render/materials.js';
import { markCaster } from '../render/pipeline.js';
import { mulberry32, range, fbm2 } from '../core/rng.js';
import { CONFIG } from '../core/config.js';
import { TAU } from '../core/math.js';
import { prep, lumpy, carve, slabGeometry, mul, SLAB_LOOK, buildBonfire, buildRubble, geosHeight } from './forest.js';
import { buildSpike, facetCol } from './landmarks.js';
import { breakableFloor } from './floor.js';
import { BREAK } from './breakTuning.js';

// DROWNWATCH CLIFF (the Tide Colossus's level, ADR-141): a shelf of salt grass on top of a basalt cliff,
// and the sea standing at its foot. North is -Z and the camera always looks north, so the sea is the top
// of the screen. The fighting ground is a strip about 56 m wide and 14 m deep, from the rim (rimZ(x),
// about z = -8) south to a low rock scarp at z = +6, with a gap at x = 0 where the path from the bonfire
// comes up. The creature stands in the sea north of it and never comes ashore.
//
// Same output shape as createForest (world.js reads it), plus
//   groundGeometry  the shared ground plane's shape: it ends at the rim (world.js; the sea is not ground)
//   breakables      every piece that stands on the shelf (ARCHITECTURE.md "Destruction")
//   sky, grass, scarInk, ambience (the swell, spray off the sea, foam at the cliff's foot)
//
// THE HERO'S NORTH LIMIT is plain colliders (no new bound rule): five static circles tagged 'sea', r 120,
// whose union's south edge is the rim (0.4 m of scallop); `rimZ(x)` returns that same curve and the drawn
// rim is built from it. Anything pushed into the sea is pushed straight back south. The ground stays flat
// at y = 0 and the hero's y stays 0: the cliff is drawn, not simulated.
//
// Everything is drawn through the glyph systems (STYLE.md): prop art for the basalt, the sea, the stones,
// the wood and the iron; carved glyphs for the causeway's flagstones; the screen grid for the bonfire;
// glyph particles for the spray and the foam.

const EDGE = -8;
const SEA_R = 120;
const SEA_XS = [-40, -20, 0, 20, 40];

/** The rim's z at x: the south edge of the union of the sea circles (the colliders' own curve). */
export function rimZ(x) {
  let z = -Infinity;
  for (const cx of SEA_XS) {
    const d = x - cx;
    if (Math.abs(d) >= SEA_R) continue;
    z = Math.max(z, EDGE - SEA_R + Math.sqrt(SEA_R * SEA_R - d * d));
  }
  return Number.isFinite(z) ? z : EDGE - SEA_R;
}

/** Layout numbers (world metres). The level's CONFIG.world overrides match these (levels/tide.js). */
export const SHELF = Object.freeze({
  edgeZ: EDGE, // the rim at x = 0
  depth: 14, // rim to scarp
  half: 28, // the strip's half width
  seaY: -9, // the water's level (the shelf is at 0)
  gap: 3, // the scarp's gap: half its width at x = 0
  scarpZ: 6,
  bonfire: Object.freeze({ x: 0, z: 22 }),
  tower: Object.freeze({ x: -23, z: -1.5 }),
  hull: Object.freeze({ x: 21, z: 2 }),
  stacks: Object.freeze([Object.freeze({ x: -27, z: -18, h: 9, r: 3.0 }), Object.freeze({ x: 27, z: -21, h: 10, r: 3.3 })]),
  sea: Object.freeze({ r: SEA_R, xs: Object.freeze([...SEA_XS]), z: EDGE - SEA_R }),
  rimZ,
});

// ---------------------------------------------------------------- palette (linear, ~0.1 albedo)
const BASALT = [0.07, 0.078, 0.088];
const MENHIR = [0.12, 0.13, 0.14];
const SALT_STONE = [0.15, 0.155, 0.16];
const WOOD = [0.11, 0.085, 0.065];
const DRIFT = [0.14, 0.12, 0.1]; // sun-and-salt bleached wood
const IRON = [0.085, 0.08, 0.078];
const SEA = [0.016, 0.026, 0.032];
const PATH = [0.13, 0.14, 0.15];

const tall = 1.3; // landmarks are drawn 1.3x tall (STYLE.md: the 58 degree camera squashes upright things)

/** A box at (x, y, z) (its centre), turned by (rx, ry, rz), carved. */
function box(w, h, d, x, y, z, rx, ry, rz, col, ao = 1) {
  const g = prep(new THREE.BoxGeometry(w, h, d));
  g.rotateX(rx);
  g.rotateZ(rz);
  g.rotateY(ry);
  g.translate(x, y, z);
  carve(g, { col, ao });
  return g;
}

/** A hexagonal basalt column from y0 to y1 at (x, z). */
function column(rng, x, z, r, y0, y1, col = BASALT) {
  const g = prep(new THREE.CylinderGeometry(r * range(rng, 0.85, 1), r, y1 - y0, 6, 1));
  g.rotateY(rng() * TAU);
  g.translate(x, (y0 + y1) / 2, z);
  carve(g, { col: facetCol(col, range(rng, 0.9, 1.2)), ao: (px, py) => 0.5 + 0.5 * Math.min(1, Math.max(0, (py - y0) / (y1 - y0))) });
  return g;
}

/** A lumpy rock of radius r, flattened by `sy`, resting at y. */
function rock(rng, x, y, z, r, sy = 0.7, col = BASALT, k = 1.1) {
  const g = prep(new THREE.IcosahedronGeometry(r, 0));
  lumpy(g, r * 0.4, 1.4 / r, rng() * 99);
  g.scale(1, sy, 1);
  g.rotateY(rng() * TAU);
  g.translate(x, y + r * sy * 0.6, z);
  carve(g, { col: facetCol(col, k), ao: 0.85 });
  return g;
}

/** The sea's swell: one faceted grid at seaY moved on the CPU (two travelling sines and the colossus's
 *  humps), drawn through prop art: the facets print as bands of dim digits rolling at the cliff. */
function buildSea() {
  const NX = 26, NZ = 14, x0 = -66, x1 = 66, z0 = EDGE - 64, z1 = EDGE + 0.5;
  const gx = new Float32Array(NX + 1), gz = new Float32Array(NZ + 1);
  for (let i = 0; i <= NX; i++) gx[i] = x0 + ((x1 - x0) * i) / NX;
  for (let j = 0; j <= NZ; j++) gz[j] = z0 + ((z1 - z0) * j) / NZ;
  const tris = NX * NZ * 2, n = tris * 3;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
  // vertex -> grid point (i, j) index, so the heights are computed once per grid point
  const at = new Uint16Array(n);
  let v = 0;
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
      // alternate the diagonal so the facets do not line up in rows
      const q = (i + j) & 1 ? [a, c, b, b, c, d] : [a, c, d, a, d, b];
      for (const k of q) at[v++] = k;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3).setUsage(THREE.DynamicDrawUsage));
  const col = new Float32Array(n * 3), ao = new Float32Array(n), edge = new Float32Array(n), zero = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const t = Math.floor(k / 3), tone = 0.45 + 0.9 * fbm2(t * 0.37, t * 0.11, 2);
    col[k * 3] = SEA[0] * tone;
    col[k * 3 + 1] = SEA[1] * tone;
    col[k * 3 + 2] = SEA[2] * tone;
    ao[k] = 1;
  }
  geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
  geo.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1));
  geo.setAttribute('aMoss', new THREE.BufferAttribute(zero, 1));
  geo.setAttribute('aInk', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, SHELF.seaY, (z0 + z1) / 2), 80);
  const H = new Float32Array((NX + 1) * (NZ + 1));
  // humps the colossus raises (the surge's draw, its rise in the intro): x, z, height, life
  const humps = Array.from({ length: 4 }, () => ({ x: 0, z: 0, h: 0, r: 8, t: 0, life: 0 }));
  const sea = {
    geo, humps, frame: 0, NX, NZ,
    /** A hump in the swell at (x, z): `h` m high, `r` m round, rising and falling over `life` s. */
    hump(x, z, h, r = 9, life = 1.6) {
      let s = humps[0];
      for (const u of humps) if (u.t >= u.life) { s = u; break; }
      s.x = x; s.z = z; s.h = h; s.r = r; s.t = 0; s.life = Math.max(0.2, life);
    },
    clear() {
      for (const u of humps) u.t = u.life = 0;
    },
    /** The water's height at (x, z) now (m above seaY). */
    heightAt(x, z, t) {
      let h = 1.1 * Math.sin(z * 0.34 + t * 0.9 + x * 0.05) + 0.6 * Math.sin(x * 0.21 - z * 0.08 + t * 0.6) + 0.35 * Math.sin((x + z) * 0.47 + t * 1.7);
      for (const u of humps) {
        if (u.t >= u.life) continue;
        const k = Math.sin((Math.PI * u.t) / u.life), d2 = (x - u.x) * (x - u.x) + (z - u.z) * (z - u.z);
        h += u.h * k * Math.exp(-d2 / (u.r * u.r));
      }
      return h;
    },
    update(dt, t, every = 1) {
      for (const u of humps) if (u.t < u.life) u.t += dt;
      if (++this.frame % every !== 0) return;
      for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) H[j * (NX + 1) + i] = this.heightAt(gx[i], gz[j], t);
      for (let k = 0; k < n; k += 3) {
        // the triangle's three points, then its flat normal
        let ax = 0, ay = 0, az = 0, bx = 0, by = 0, bz = 0;
        for (let m = 0; m < 3; m++) {
          const g = at[k + m], i = g % (NX + 1), j = (g / (NX + 1)) | 0, o = (k + m) * 3;
          pos[o] = gx[i];
          pos[o + 1] = SHELF.seaY + H[g];
          pos[o + 2] = gz[j];
        }
        const o = k * 3;
        ax = pos[o + 3] - pos[o]; ay = pos[o + 4] - pos[o + 1]; az = pos[o + 5] - pos[o + 2];
        bx = pos[o + 6] - pos[o]; by = pos[o + 7] - pos[o + 1]; bz = pos[o + 8] - pos[o + 2];
        let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l; ny /= l; nz /= l;
        if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
        for (let m = 0; m < 9; m += 3) { nrm[o + m] = nx; nrm[o + m + 1] = ny; nrm[o + m + 2] = nz; }
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.normal.needsUpdate = true;
    },
  };
  sea.update(0, 0);
  return sea;
}

/** The shared ground plane's shape on this level: x -120 .. 120, from the rim south to z = 120. */
function groundGeometry() {
  const NX = 120, xs = [], pos = [], uv = [], nrm = [], idx = [];
  for (let i = 0; i <= NX; i++) xs.push(-120 + (240 * i) / NX);
  for (let i = 0; i <= NX; i++) {
    const x = xs[i];
    for (const z of [rimZ(x) + 0.05, 120]) {
      pos.push(x, 0, z);
      nrm.push(0, 1, 0);
      uv.push(i / NX, z > 0 ? 1 : 0);
    }
  }
  for (let i = 0; i < NX; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, c, b, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export function createTideShelf(U, colliders) {
  const L = SHELF, BF = L.bonfire;
  // three streams: the layout, the remains broken pieces leave, the causeway's remains (world/floor.js)
  const rng = mulberry32(CONFIG.seed + 4141), br = mulberry32(CONFIG.seed + 4142), fr = mulberry32(CONFIG.seed + 4143);
  const stoneGeos = [], propGeos = [], slabGeos = [], slabs = [], floor = [], bare = [], treeSpots = [];
  const breakables = [];

  // ---- the sea's edge: five big circles; their union's south edge is the rim
  for (const cx of SEA_XS) colliders.add(cx, L.sea.z, SEA_R, 'sea');

  // ---- the cliff face: basalt columns along the rim from y 0 down into the water; a lip of broken tops
  for (let x = -68; x <= 68; x += range(rng, 1.3, 1.8)) {
    const z = rimZ(x), r = range(rng, 0.7, 1.05);
    stoneGeos.push(column(rng, x, z - r * 0.55, r, L.seaY - 2.5, range(rng, -0.25, 0.12)));
    // a second rank further out and lower: the cliff steps down to the water
    if (rng() < 0.55) stoneGeos.push(column(rng, x + range(rng, -0.4, 0.4), z - r * 1.9, r * range(rng, 0.8, 1.1), L.seaY - 2.5, range(rng, -4.5, -1.2)));
    // fallen columns at the foot, in the surf
    if (rng() < 0.18) stoneGeos.push(rock(rng, x, L.seaY - 0.6, z - range(rng, 3, 6), range(rng, 0.8, 1.6), 0.6));
  }

  // ---- the scarp: a low wall of rock across the south of the shelf, a gap at x = 0 for the path
  for (const side of [-1, 1]) {
    for (let a = L.gap + 0.4; a <= 36; a += range(rng, 1.3, 1.7)) {
      const x = side * a, z = L.scarpZ + range(rng, -0.35, 0.45) + Math.max(0, a - 26) * -0.45;
      const r = range(rng, 0.85, 1.25);
      stoneGeos.push(rock(rng, x, -0.2, z, r, range(rng, 0.85, 1.25), BASALT, 1.25));
      colliders.add(x, z, r * 0.95, 'stone');
    }
  }
  // the shelf's two ends: scree where the cliff bends away (scenery; the hero's bound circle is the limit)
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const x = side * range(rng, 30, 36), z = range(rng, -9, 4);
      if (z < rimZ(x) + 1) continue;
      stoneGeos.push(rock(rng, x, -0.1, z, range(rng, 0.5, 1.1), 0.7, BASALT, 1.2));
    }
  }

  // ---- the bonfire on the path below the scarp
  propGeos.push(...buildBonfire(rng, BF.x, BF.z));
  colliders.add(BF.x, BF.z, 0.75, 'bonfire');
  bare.push({ x: BF.x, z: BF.z, r: 2.2 });

  /** A breakable of the shelf (ARCHITECTURE.md "Destruction"): geometry not merged into the static meshes. */
  const piece = (kind, mat, x, z, r, geos, extra = {}) => {
    const { collide = r, ...rest } = extra;
    const cs = collide > 0 ? [colliders.add(x, z, collide, mat === 'wood' ? 'stone' : 'stone')] : [];
    const def = { kind, mat, look: 'prop', x, z, r: Math.max(0.4, r), h: geosHeight(geos), geos, colliders: cs, lift: 0, ...rest };
    breakables.push(def);
    return def;
  };
  const rubbleOf = (x, z, r, col = SALT_STONE) => ({ geos: buildRubble(br, x, z, r * 0.85, { col: mul(col, 1.3), h: range(br, 0.3, 0.55) }), look: 'prop', r: r * 0.6 });

  // ---- the menhirs: the fight's cover, two staggered rows across the shelf (the breath and the surge stop
  // at a standing one, and every pass costs it structure)
  const MENHIRS = [[-17, -4.3], [-8.5, -4.0], [0.2, -4.4], [8.8, -3.9], [17.2, -4.2], [-21, 1.9], [-12.8, 2.2], [-4.2, 1.8], [4.4, 2.3], [12.9, 1.9], [26, -3.6], [-27.5, -3.3]];
  for (const [x, z] of MENHIRS) {
    const h = range(rng, 2.7, 3.3);
    const g = buildSpike(rng, x, -0.1, z, { h, w: range(rng, 1.3, 1.6), d: range(rng, 0.9, 1.15), tip: range(rng, 0.5, 0.65), lean: range(rng, -0.06, 0.06), yaw: rng() * TAU, col: facetCol(MENHIR, 1.25), lump: 0.14 });
    piece('menhir', 'stone', x, z, 1.1, [g], { cover: true, hp: 3.6, broken: rubbleOf(x, z, 1.1, MENHIR) });
  }

  // ---- the Drownwatch: a broken watchtower on the west end, two stages (the top falls first)
  {
    const T = L.tower, R0 = 2.3, h0 = 4.4 * tall, h1 = 3.0 * tall;
    const lower = prep(new THREE.CylinderGeometry(R0 * 0.94, R0 * 1.05, h0, 8, 3));
    lower.translate(T.x, h0 / 2 - 0.1, T.z);
    lumpy(lower, 0.08, 1.4, rng() * 99, new THREE.Vector3(T.x, h0 / 2, T.z));
    carve(lower, { col: facetCol(SALT_STONE, 1.1), ao: (px, py) => 0.55 + 0.45 * Math.min(1, py / 2) });
    const door = box(1.1, 1.9, 0.5, T.x + 0.4, 0.95, T.z + R0 * 0.98, 0, 0.15, 0, mul(BASALT, 0.4));
    const upper = prep(new THREE.CylinderGeometry(R0 * 0.86, R0 * 0.93, h1, 8, 2));
    upper.translate(0, h1 / 2, 0);
    const p = upper.attributes.position;
    // the broken crown: its rim torn lower on the sea's side
    for (let i = 0; i < p.count; i++) if (p.getY(i) > h1 * 0.6) p.setY(i, p.getY(i) - (0.5 + 0.5 * Math.sin(Math.atan2(p.getX(i), p.getZ(i)) * 3 + 1)) * h1 * 0.45 - (p.getZ(i) < 0 ? h1 * 0.15 : 0));
    upper.translate(T.x, h0 - 0.1, T.z);
    carve(upper, { col: facetCol(SALT_STONE, 1.05), ao: 0.95 });
    const merlons = [];
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + 0.4;
      merlons.push(box(0.7, 0.8, 0.5, T.x + Math.sin(a) * R0 * 0.8, h0 + h1 * 0.55, T.z + Math.cos(a) * R0 * 0.8, 0, a, range(rng, -0.2, 0.2), facetCol(SALT_STONE, 1.2)));
    }
    const CO = BREAK.colossus;
    const top = { kind: 'towerTop', mat: 'stone', look: 'prop', x: T.x, z: T.z, r: R0, y0: h0 - 0.1, h: geosHeight([upper, ...merlons]) - (h0 - 0.1), geos: [upper, ...merlons], colliders: [], hp: 5, weight: CO.weight, topples: true, cover: false, lift: 0, fallOff: CO.off, fallT: CO.fall, blocks: CO.blocks };
    const base = colliders.add(T.x, T.z, R0 + 0.15, 'stone');
    breakables.push(top, { kind: 'tower', mat: 'stone', look: 'prop', x: T.x, z: T.z, r: R0, h: h0, geos: [lower, door], colliders: [base], broken: rubbleOf(T.x, T.z, R0, SALT_STONE), hp: 4.5, weight: CO.weight, topples: false, cover: true, lift: 0, holds: top, blocks: CO.blocks });
  }

  // ---- the wrecked hull on the east end: a keel and ten ribs, each its own piece
  {
    const H = L.hull, x0 = H.x - 5.4, x1 = H.x + 5.4;
    const keel = [box(x1 - x0, 0.45, 0.55, H.x, 0.2, H.z, 0, 0.04, 0.03, facetCol(WOOD, 1.1)), box(0.5, 2.6 * tall, 0.5, x1 + 0.2, 1.4, H.z + 0.1, 0, 0.04, -0.35, facetCol(WOOD, 1.0))];
    const kc = [-3.6, 0, 3.6].map((d) => colliders.add(H.x + d, H.z, 0.5, 'stone'));
    breakables.push({ kind: 'keel', mat: 'wood', look: 'prop', x: H.x, z: H.z, r: 1.2, h: geosHeight(keel), geos: keel, colliders: kc, hp: 3.2, topples: false, cover: false, lift: 0, wreck: false });
    for (let i = 0; i < 10; i++) {
      const x = x0 + 0.6 + i * 1.1 + range(rng, -0.12, 0.12), lean = range(rng, -0.14, 0.14), span = 1.7 - Math.abs(i - 4.5) * 0.12, hh = (2.4 - Math.abs(i - 4.5) * 0.15) * tall;
      const parts = [];
      // a rib: an arch of four timbers from one side of the keel over to the other (half of them broken)
      const broken = rng() < 0.45, segs = broken ? 2 + Math.floor(rng() * 2) : 4;
      for (let s = 0; s < segs; s++) {
        const a0 = (s / 4) * Math.PI, a1 = ((s + 1) / 4) * Math.PI;
        const za = H.z - Math.cos(a0) * span, ya = Math.sin(a0) * hh, zb = H.z - Math.cos(a1) * span, yb = Math.sin(a1) * hh;
        const len = Math.hypot(zb - za, yb - ya);
        const g = prep(new THREE.BoxGeometry(0.22, 0.26, len + 0.08));
        g.rotateX(-Math.atan2(yb - ya, zb - za));
        g.translate(0, (ya + yb) / 2 + 0.15, (za + zb) / 2 - H.z);
        g.rotateZ(lean);
        g.translate(x, 0, H.z);
        carve(g, { col: facetCol(DRIFT, range(rng, 0.9, 1.15)), ao: 0.9 });
        parts.push(g);
      }
      breakables.push({ kind: 'hullRib', mat: 'wood', look: 'prop', x, z: H.z, r: 0.6, h: geosHeight(parts), geos: parts, colliders: [], hp: 1.1, topples: false, cover: false, lift: 0, wreck: false });
    }
  }

  // ---- the sea stacks in the water, framing the creature: two stages each (their tops come off)
  for (const S of L.stacks) {
    const cut = 1.5, base = prep(new THREE.CylinderGeometry(S.r * 0.9, S.r * 1.25, cut - L.seaY + 1, 7, 3));
    base.translate(S.x, (cut + L.seaY - 1) / 2, S.z);
    lumpy(base, S.r * 0.18, 0.5, rng() * 99, new THREE.Vector3(S.x, (cut + L.seaY) / 2, S.z));
    carve(base, { col: facetCol(BASALT, 1.15), ao: (px, py) => 0.45 + 0.55 * Math.min(1, Math.max(0, (py - L.seaY) / 8)) });
    const top = prep(new THREE.CylinderGeometry(S.r * 0.45, S.r * 0.88, S.h * tall, 7, 3));
    top.translate(0, (S.h * tall) / 2, 0);
    lumpy(top, S.r * 0.16, 0.6, rng() * 99, new THREE.Vector3(0, (S.h * tall) / 2, 0));
    top.rotateY(rng() * TAU);
    top.translate(S.x, cut, S.z);
    carve(top, { col: facetCol(BASALT, 1.25), ao: 0.95 });
    const t = { kind: 'stackTop', mat: 'stone', look: 'prop', x: S.x, z: S.z, r: S.r, y0: cut, h: S.h * tall, geos: [top], colliders: [], hp: 5.5, topples: false, cover: false, lift: 0, wreck: false };
    breakables.push(t, { kind: 'stack', mat: 'stone', look: 'prop', x: S.x, z: S.z, r: S.r, h: cut, geos: [base], colliders: [], hp: Infinity, topples: false, cover: false, lift: 0, holds: t, wreck: false });
  }

  // ---- the shore's small things
  const free = (x, z, r) => {
    if (z < rimZ(x) + r + 0.6 || z > L.scarpZ - r - 0.8 || Math.abs(x) > 31) return false;
    for (const c of colliders.circles) if (c.tag !== 'sea' && Math.hypot(c.x - x, c.z - z) < c.r + r + 0.9) return false;
    return true;
  };
  const spot = (r, tries = 40, zone = null) => {
    for (let i = 0; i < tries; i++) {
      const x = zone ? range(rng, zone[0], zone[1]) : range(rng, -30, 30), z = range(rng, -7, 5);
      if (free(x, z, r)) return [x, z];
    }
    return null;
  };
  // drying racks for kelp and nets: wood, they topple
  for (let i = 0; i < 8; i++) {
    const at = spot(0.7, 40, i < 4 ? [8, 30] : [-30, -6]);
    if (!at) continue;
    const [x, z] = at, yaw = rng() * Math.PI, w = range(rng, 1.6, 2.2), h = range(rng, 1.7, 2.1);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const g = [
      box(0.14, h, 0.14, x - c * w / 2, h / 2, z + s * w / 2, range(rng, -0.08, 0.08), yaw, 0, facetCol(WOOD, 1)),
      box(0.14, h, 0.14, x + c * w / 2, h / 2, z - s * w / 2, range(rng, -0.08, 0.08), yaw, 0, facetCol(WOOD, 1)),
      box(w + 0.3, 0.12, 0.12, x, h - 0.1, z, 0, yaw, range(rng, -0.05, 0.05), facetCol(DRIFT, 1)),
      // kelp hung to dry: a dark sheet under the bar
      box(w * 0.8, h * 0.45, 0.05, x, h * 0.72, z, 0, yaw, 0, facetCol([0.04, 0.07, 0.055], 1.4)),
    ];
    piece('rack', 'wood', x, z, 0.7, g, { collide: 0.35, hp: 0.3, topples: true, cover: false });
  }
  // upturned boats: wood, low cover
  for (let i = 0; i < 3; i++) {
    const at = spot(1.4, 60);
    if (!at) continue;
    const [x, z] = at, yaw = rng() * Math.PI, len = range(rng, 3.6, 4.4);
    const g = prep(new THREE.CylinderGeometry(0.85, 0.85, len, 8, 2, false, 0, Math.PI));
    g.rotateZ(Math.PI / 2);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const t = Math.abs(p.getX(k)) / (len / 2);
      p.setZ(k, p.getZ(k) * (1 - 0.55 * t * t)); // the bow and the stern taper
    }
    g.rotateX(Math.PI / 2);
    g.rotateY(yaw);
    g.translate(x, 0, z);
    carve(g, { col: facetCol(WOOD, 1.15), ao: 0.9 });
    // (a boat is low cover that one surge takes: hp under TUNING.world.surge)
    piece('boat', 'wood', x, z, 1.4, [g], { collide: 1.1, hp: 0.33, cover: true, topples: false });
  }
  // two anchors and two chains: iron, they only chip
  for (let i = 0; i < 2; i++) {
    const at = spot(0.9, 60);
    if (!at) continue;
    const [x, z] = at, yaw = rng() * TAU, lean = range(rng, 0.25, 0.45);
    const c = facetCol(IRON, 1.3);
    const g = [box(0.2, 2.4, 0.2, x, 1.05, z, lean, yaw, 0, c), box(1.6, 0.2, 0.2, x, 0.35, z + 0.15, 0.2, yaw, 0.5, c), box(1.6, 0.2, 0.2, x, 0.35, z - 0.15, 0.2, yaw, -0.5, c), box(0.9, 0.16, 0.16, x - Math.sin(yaw) * 0.6, 2.0, z - Math.cos(yaw) * 0.6, lean, yaw, 0, c)];
    piece('anchor', 'metal', x, z, 0.9, g, { collide: 0.5, hp: Infinity, cover: false, topples: false });
  }
  for (let i = 0; i < 2; i++) {
    const at = spot(1.0, 60);
    if (!at) continue;
    const [x, z] = at, g = [];
    let a = rng() * TAU;
    for (let k = 0; k < 9; k++) {
      a += range(rng, -0.6, 0.6);
      g.push(box(0.36, 0.12, 0.22, x + Math.cos(a) * k * 0.18, 0.08 + (k % 2) * 0.05, z + Math.sin(a) * k * 0.18, 0, a + (k % 2) * 1.57, 0, facetCol(IRON, 1.2)));
    }
    piece('chain', 'metal', x, z, 1.0, g, { collide: 0, hp: Infinity, cover: false, topples: false });
  }
  // cairns (stacked stones) and boulders
  for (let i = 0; i < 6; i++) {
    const at = spot(0.8, 60);
    if (!at) continue;
    const [x, z] = at, g = [];
    let y = 0;
    for (let k = 0; k < 4; k++) {
      const r = 0.55 - k * 0.1;
      g.push(rock(rng, x + range(rng, -0.08, 0.08), y - 0.05, z + range(rng, -0.08, 0.08), r, 0.6, SALT_STONE, 1.2));
      y += r * 0.62;
    }
    piece('cairn', 'stone', x, z, 0.7, g, { collide: 0.55, hp: 1.2, cover: true, topples: false, broken: rubbleOf(x, z, 0.6) });
  }
  for (let i = 0; i < 6; i++) {
    const r = range(rng, 0.8, 1.3), at = spot(r, 60);
    if (!at) continue;
    const [x, z] = at;
    piece('boulder', 'stone', x, z, r, [rock(rng, x, -0.2, z, r, 0.75, MENHIR, 1.2)], { collide: r * 0.9, hp: 2.4, cover: true, topples: false, lift: 1 });
  }

  // ---- the causeway: flagstones from the bonfire up through the gap and west toward the Drownwatch
  {
    const path = [];
    for (let z = BF.z - 1.6; z > L.scarpZ - 0.5; z -= 1.15) path.push([range(rng, -0.25, 0.25), z]);
    const T = L.tower;
    const sx = 0, sz = L.scarpZ - 1.2, ex = T.x + 3.2, ez = T.z + 1.8, n = Math.round(Math.hypot(ex - sx, ez - sz) / 1.15);
    for (let i = 0; i <= n; i++) {
      const t = i / n, bend = Math.sin(t * Math.PI) * 2.4;
      path.push([sx + (ex - sx) * t + range(rng, -0.2, 0.2), sz + (ez - sz) * t + bend]);
    }
    for (const [x, z] of path) {
      const sides = 5 + Math.floor(rng() * 3), a0 = rng() * TAU, w = range(rng, 0.42, 0.55);
      const pts = [];
      for (let k = 0; k < sides; k++) {
        const a = a0 + (k / sides) * TAU, r = w * range(rng, 0.8, 1.1);
        pts.push([Math.cos(a) * r * 1.15, Math.sin(a) * r]);
      }
      const g = slabGeometry(pts, { top: 0.035, inset: 0.05, drop: 0.03 });
      g.translate(x, 0, z);
      const col = (px, py, pz) => mul(PATH, 0.6 + 0.4 * fbm2(px * 2, pz * 2, 2));
      carve(g, { col, ao: 0.85, edge: (px, py, pz, nx, ny) => (ny > 0.5 && ny < 0.95 ? 1 : 0) });
      slabGeos.push(g);
      const outline = pts.map(([px, pz]) => [x + px, z + pz]);
      slabs.push({ x, z, r: w * 1.2, outline });
      floor.push({ geo: g, outline, x, z, r: w, col });
    }
  }

  // ---- meshes
  const group = new THREE.Group();
  group.name = 'tideShelf';
  const mat = createAsciiObjectMaterial(U, { fadeNearPlayer: true, side: THREE.DoubleSide });
  // basalt, menhirs, the tower, the hull and the iron are printed like the wyrm (prop art, ADR-100);
  // a cold sea night: a little more source gain
  const stoneMat = createPropArtMaterial(U, { fadeNearPlayer: true, gain: 0.9 });
  const slabMat = createCarvedGlyphMaterial(U, { ...SLAB_LOOK, gain: 1.7, lumScale: 2.2, edge: 0.4, viewPitch: CONFIG.camera.pitch });
  const add = (geos, m, name) => {
    const mesh = new THREE.Mesh(mergeGeometries(geos), m);
    mesh.name = name;
    group.add(mesh);
    return mesh;
  };
  add(propGeos, mat, 'props');
  add(stoneGeos, stoneMat, 'stones');
  const paving = add(slabGeos, slabMat, 'paving');
  markCaster(group);
  breakables.push(...breakableFloor({ slabs: floor, slabGeos, slabMesh: paving, mat: slabMat, rng: fr, group, earth: [0.07, 0.075, 0.07] }).defs);
  // the sea (its own mesh: rewritten every frame; no shadow)
  const sea = buildSea();
  const seaMat = createPropArtMaterial(U, { gain: 0.45, key: 0.8, edge: 0 });
  const seaMesh = new THREE.Mesh(sea.geo, seaMat);
  seaMesh.name = 'sea';
  seaMesh.frustumCulled = false;
  group.add(seaMesh);

  // ---- the shore's life: the swell, spray blown in off the sea, foam at the cliff's foot
  const st = { spray: 0, foam: 0 };
  const ambience = {
    sea,
    /** A hump in the swell (the colossus: its rise, an arm drawn back through the water). */
    swell(x, z, h, r, life) {
      sea.hump(x, z, h, r, life);
    },
    setup() {},
    setVisible(on) {
      seaMesh.visible = !!on;
    },
    reset() {
      sea.clear();
    },
    update(dt, game) {
      const every = (game.world?.quality ?? 1) < 0.6 ? 2 : 1; // LOW: every second frame
      sea.update(dt, game.time ?? 0, every);
      const fx = game.fx?.alpha, f = game.U?.uFocus?.value;
      if (!fx || !f || !(dt > 0)) return;
      // spray: pale flecks blown south over the rim
      st.spray += dt * 7;
      while (st.spray >= 1) {
        st.spray -= 1;
        const x = f.x + (Math.random() - 0.5) * 34, z = rimZ(x) - Math.random() * 3;
        fx.spawn({
          x, y: 0.4 + Math.random() * 1.6, z, vx: (Math.random() - 0.5) * 0.8, vy: 0.3 + Math.random() * 0.6, vz: 2.2 + Math.random() * 2.4,
          life: 1.0 + Math.random() * 1.2, size: 0.16, sizeEnd: 0.06, glyph: ".,'`", color: [0.42, 0.5, 0.52], colorEnd: [0.16, 0.2, 0.22], alpha: 0.9, alphaEnd: 0, drag: 0.6, gravity: -1.2,
        });
      }
      // foam at the cliff's foot: strokes that run along the surf line
      st.foam += dt * 16;
      while (st.foam >= 1) {
        st.foam -= 1;
        const x = f.x + (Math.random() - 0.5) * 50, z = rimZ(x) - 1.5 - Math.random() * 3.5;
        fx.spawn({
          x, y: L.seaY + 0.4 + sea.heightAt(x, z, game.time ?? 0), z, vx: (Math.random() - 0.5) * 1.2, vy: 0.1, vz: 0.4,
          life: 0.9 + Math.random() * 0.8, size: 0.3, sizeEnd: 0.2, glyph: "~-=_", color: [0.45, 0.55, 0.56], colorEnd: [0.12, 0.16, 0.17], alpha: 1, alphaEnd: 0, drag: 0.8,
        });
      }
    },
  };

  return {
    group, treeSpots, bare, slabs, nest: { x: 0, z: EDGE - 4 }, bonfire: { x: BF.x, z: BF.z },
    material: mat, stoneMaterial: stoneMat, slabMaterial: slabMat,
    breakables,
    groundGeometry: groundGeometry(),
    seaMesh,
    // cracks in the shelf: a pale salt grey
    scarInk: [0.5, 0.55, 0.56],
    // thin salt grass, none past the rim (much cheaper than Cinderwood's meadow)
    grass: { density: (x, z) => (z < rimZ(x) + 0.3 ? 0 : 0.3), height: 0.7, ash: 0.3 },
    floorCarry: mul(PATH, 1.6),
    // a cold overcast moon (pale grey-teal) and a blue-black fog: the creature's shoulders and back,
    // 30 to 50 m away, fade into it (how "too big for the arena" is drawn)
    sky: { moonColor: [0.21, 0.26, 0.27], ambient: [0.02, 0.028, 0.032], fogColor: [0.005, 0.008, 0.012], fogNear: 32, fogFar: 70 },
    ambience,
  };
}
