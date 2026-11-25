import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FLAG } from '../render/materials.js';
import { hash2, fbm2, range } from '../core/rng.js';
import { TAU } from '../core/math.js';
import { prep, lumpy, paint, carve, mul, BARK, STONE } from './forest.js';

// The living forest's small things (the fire-and-forest pass, ADR-190; world/forest.js places them,
// forestTuning.js counts them): bushes, ferns, brambles, fallen logs, mossy rocks, the ridge's crags,
// and what grows on the old oaks (surface roots, hanging moss). Each builder returns world-space,
// non-indexed geometries painted for the forest's own materials: the screen-grid look of the trees
// (`paint`, FLAG.LEAF / FLAG.STONE: the trees as they are drawn, more kinds of what already exists) or
// the prop art of its stones (`carve`, the boulders' look). Every builder draws on the rng it is given
// only (the layout's own sequence is never touched).

// leaf albedos (linear): the forest's, a shade apart per kind so a clump reads against the grass
const BUSH = [
  [0.16, 0.28, 0.12],
  [0.14, 0.26, 0.14],
  [0.19, 0.29, 0.11],
];
const FERN = [
  [0.17, 0.3, 0.1],
  [0.2, 0.31, 0.11],
];
const BRAMBLE_LEAF = [0.11, 0.15, 0.08];
const BRAMBLE_CANE = [0.14, 0.075, 0.06];
const MOSS = [0.15, 0.22, 0.12];
const HANG = [0.18, 0.21, 0.15];

/** A bush: three or four lumpy leaf blobs close to the ground (all foliage: it burns and tears). */
export function buildBush(rng, x, z, s) {
  const parts = [];
  const n = 2 + Math.floor(rng() * 3);
  const col = BUSH[Math.floor(rng() * BUSH.length)];
  const seed = rng() * 100;
  for (let i = 0; i < n; i++) {
    const r = range(rng, 0.45, 0.75) * s;
    const g = prep(new THREE.IcosahedronGeometry(r, 1));
    g.scale(1, 0.72, 1);
    lumpy(g, r * 0.4, 1.8 / s, seed + i);
    const a = rng() * TAU, d = i === 0 ? 0 : range(rng, 0.35, 0.75) * s;
    g.translate(Math.cos(a) * d, r * 0.55, Math.sin(a) * d);
    paint(g, {
      col: (px, py, pz) => mul(col, 0.6 + 0.6 * fbm2(px * 1.6 + seed + x, pz * 1.6 + py + z, 2)),
      flag: FLAG.LEAF,
      sway: (px, py) => 0.25 + 0.35 * Math.min(1, py / (1.1 * s)),
      ao: (px, py) => 0.5 + 0.5 * Math.min(1, py / (0.9 * s)),
    });
    parts.push(g);
  }
  for (const g of parts) g.translate(x, 0, z);
  return parts;
}

/** A fern: five to eight fronds arching out of the ground, long flat leaves (foliage). */
export function buildFern(rng, x, z, s) {
  const parts = [];
  const n = 5 + Math.floor(rng() * 4);
  const col = FERN[Math.floor(rng() * FERN.length)];
  const a0 = rng() * TAU;
  for (let i = 0; i < n; i++) {
    const len = range(rng, 0.55, 0.95) * s;
    const g = prep(new THREE.IcosahedronGeometry(1, 0));
    // a long flat leaf along +z, its base at the origin, arching up then out
    g.scale(0.17 * s, 0.05 * s, len * 0.5);
    g.translate(0, 0, len * 0.5);
    g.rotateX(-range(rng, 0.45, 0.85));
    g.rotateY(a0 + (i / n) * TAU + (rng() - 0.5) * 0.5);
    g.translate(0, 0.08, 0);
    paint(g, {
      col: (px, py, pz) => mul(col, 0.7 + 0.5 * hash2(px * 7 + x, pz * 7 + z)),
      flag: FLAG.LEAF,
      sway: (px, py) => 0.4 + 0.8 * Math.min(1, py / (0.6 * s)),
      ao: (px, py) => 0.55 + 0.45 * Math.min(1, py / (0.5 * s)),
    });
    parts.push(g);
  }
  for (const g of parts) g.translate(x, 0, z);
  return parts;
}

/** A bramble: a low tangle of thorny canes arching over each other and a few dark leaf clumps. */
export function buildBramble(rng, x, z, s) {
  const parts = [];
  // (the canes are one part, the wood; the leaf clumps the foliage)
  const canes = [];
  const n = 6 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const len = range(rng, 1.1, 1.9) * s;
    const g = prep(new THREE.CylinderGeometry(0.025 * s, 0.05 * s, len, 4, 3));
    g.translate(0, len / 2, 0);
    // bent over: the cane arches out and down
    const p = g.attributes.position, bend = range(rng, 0.7, 1.3);
    for (let k = 0; k < p.count; k++) {
      const t = p.getY(k) / len;
      p.setZ(k, p.getZ(k) + Math.sin(t * bend) * len * 0.55);
      p.setY(k, p.getY(k) * (1 - 0.55 * t));
    }
    g.rotateY(rng() * TAU);
    g.translate((rng() - 0.5) * 0.6 * s, 0, (rng() - 0.5) * 0.6 * s);
    canes.push(g);
  }
  const wood = mergeGeometries(canes);
  paint(wood, { col: (px, py, pz) => mul(BRAMBLE_CANE, 0.7 + 0.5 * hash2(px * 13 + x, pz * 13 + z)), flag: FLAG.STONE, sway: 0.15, ao: 0.75 });
  parts.push(wood);
  const m = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < m; i++) {
    const r = range(rng, 0.28, 0.45) * s;
    const g = prep(new THREE.IcosahedronGeometry(r, 1));
    g.scale(1.2, 0.6, 1.2);
    lumpy(g, r * 0.5, 2.2 / s, rng() * 50);
    const a = rng() * TAU, d = range(rng, 0.2, 0.7) * s;
    g.translate(Math.cos(a) * d, range(rng, 0.25, 0.55) * s, Math.sin(a) * d);
    paint(g, { col: (px, py, pz) => mul(BRAMBLE_LEAF, 0.6 + 0.6 * hash2(px * 9 + x, pz * 9 + py)), flag: FLAG.LEAF, sway: 0.3, ao: 0.7 });
    parts.push(g);
  }
  for (const g of parts) g.translate(x, 0, z);
  return parts;
}

/**
 * A fallen log: a trunk lying along (cos yaw, sin yaw) round (x, z), its bark split, moss on its back.
 * Returns { geos: [log, ...moss], ends: [[ax, az], [bx, bz]] } (its ends: its colliders are laid along it).
 */
export function buildLog(rng, x, z, len, rad, yaw) {
  const parts = [];
  const g = prep(new THREE.CylinderGeometry(rad * 0.85, rad, len, 8, Math.max(2, Math.round(len / 1.2))));
  lumpy(g, rad * 0.22, 2.2, rng() * 99);
  // the broken end: its last ring torn ragged
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > len * 0.45) p.setY(i, p.getY(i) - hash2(p.getX(i) * 17 + x, p.getZ(i) * 17 + z) * rad * 1.2);
  g.rotateZ(Math.PI / 2);
  g.rotateY(-yaw);
  g.translate(0, rad * 0.78, 0);
  paint(g, {
    col: (px, py, pz) => mul(BARK, 0.6 + 0.55 * hash2(px * 6 + x, pz * 6 + z + py * 3)),
    flag: FLAG.STONE,
    sway: 0,
    ao: (px, py) => 0.45 + 0.55 * Math.min(1, py / (rad * 1.6)),
  });
  parts.push(g);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const nm = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < nm; i++) {
    const t = (rng() - 0.5) * len * 0.7, r = range(rng, 0.22, 0.4);
    const m = prep(new THREE.IcosahedronGeometry(r, 1));
    m.scale(1.4, 0.45, 1);
    lumpy(m, r * 0.4, 3, rng() * 30);
    m.rotateY(-yaw);
    m.translate(c * t, rad * 1.55, s * t);
    paint(m, { col: (px, py, pz) => mul(MOSS, 0.7 + 0.5 * hash2(px * 11 + x, pz * 11 + z)), flag: FLAG.LEAF, sway: 0.15, ao: 0.9 });
    parts.push(m);
  }
  for (const q of parts) q.translate(x, 0, z);
  const h = len * 0.5;
  return { geos: parts, ends: [[x - c * h, z - s * h], [x + c * h, z + s * h]] };
}

/** A mossy rock: a low boulder with moss over its back (carved for prop art, the boulders' look). */
export function buildMossRock(rng, x, z, r) {
  const g = prep(new THREE.IcosahedronGeometry(r, 1));
  lumpy(g, r * 0.4, 1.3 / r, rng() * 99);
  g.scale(range(rng, 1.0, 1.35), range(rng, 0.5, 0.72), 1);
  g.rotateY(rng() * TAU);
  g.translate(x, r * 0.18, z);
  carve(g, {
    col: (px, py, pz) => mul(STONE, 0.65 + 0.5 * fbm2(px * 1.5, pz * 1.5 + py, 2)),
    moss: (px, py, pz, nx, ny) => (ny > 0.35 ? 0.95 : py < 0.3 ? 0.5 : 0.2),
    ink: 0.9,
    ao: (px, py) => 0.5 + 0.5 * Math.min(1, py / (r * 0.7)),
  });
  return g;
}

/**
 * A crag of the ridge (the true end of the map): a tall, rough rock leaning a little out, wider at its
 * foot, sunk into the ground; its face to the clearing catches the moon, moss in its clefts.
 */
export function buildCrag(rng, x, z, w, h, yaw) {
  // (few big facets, like the boulders: each a carved plane, a shard of the ridge)
  const g = prep(new THREE.IcosahedronGeometry(1, 0));
  // a tall rock: narrowing to its top
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), t = 1 - 0.35 * Math.max(0, y);
    p.setX(i, p.getX(i) * t);
    p.setZ(i, p.getZ(i) * t);
  }
  g.scale(w, h * 0.55, w * range(rng, 0.7, 0.95));
  lumpy(g, w * 0.3, 1.2 / w, rng() * 99);
  g.rotateZ((rng() - 0.5) * 0.22);
  g.rotateY(yaw);
  g.translate(x, h * 0.42, z);
  carve(g, {
    col: (px, py, pz) => mul(STONE, 0.62 + 0.55 * fbm2(px * 1.2 + x, pz * 1.2 + py * 0.7, 2)),
    moss: (px, py, pz, nx, ny) => (ny > 0.55 ? 0.75 : py < 0.6 ? 0.45 : 0.08),
    ink: 0.95,
    ao: (px, py) => 0.45 + 0.55 * Math.min(1, py / (h * 0.8)),
  });
  return g;
}

/**
 * Surface roots round an old oak's foot, to merge into its trunk (the same paint): `n` thick roots
 * running out and down into the ground. World space (the trunk's base at x, z).
 */
export function buildRoots(rng, x, z, s, n, len) {
  const parts = [];
  const a0 = rng() * TAU;
  for (let i = 0; i < n; i++) {
    const L = range(rng, len[0], len[1]) * s;
    const g = prep(new THREE.CylinderGeometry(0.05 * s, 0.17 * s, L, 5, 2));
    g.translate(0, L / 2, 0);
    // lying out along +z, its thick end at the trunk, sinking as it goes
    g.rotateX(Math.PI / 2 + range(rng, 0.12, 0.3));
    g.translate(0, 0.16 * s, 0.18 * s);
    g.rotateY(a0 + (i / n) * TAU + (rng() - 0.5) * 0.6);
    paint(g, {
      col: (px, py, pz) => mul(BARK, 0.7 + 0.5 * hash2(px * 9 + x, pz * 9 + z)),
      flag: FLAG.STONE,
      sway: 0,
      ao: 0.55,
    });
    parts.push(g);
  }
  for (const g of parts) g.translate(x, 0, z);
  return parts;
}

/**
 * Hanging moss: `n` thin strands hanging from the underside of a crown (world points `from`: [[x, y,
 * z], ...]), swaying in the wind (aSway: the trees' own sway, strongest at their tips).
 */
export function buildMoss(rng, from, len) {
  const parts = [];
  for (const [x, y, z] of from) {
    const L = range(rng, len[0], len[1]);
    const g = prep(new THREE.ConeGeometry(0.09, L, 4, 2));
    g.rotateX(Math.PI); // (tip down)
    g.translate(0, -L / 2, 0);
    g.rotateY(rng() * TAU);
    paint(g, {
      col: (px, py, pz) => mul(HANG, 0.7 + 0.5 * hash2(px * 13 + x, py * 7 + z)),
      flag: FLAG.LEAF,
      sway: (px, py) => 0.8 + 0.9 * Math.min(1, -py / L),
      ao: 0.85,
    });
    g.translate(x, y, z);
    parts.push(g);
  }
  return parts;
}
