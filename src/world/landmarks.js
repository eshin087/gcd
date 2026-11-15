import * as THREE from 'three';
import { FLAG } from '../render/materials.js';
import { hash2, fbm2, range } from '../core/rng.js';
import { TAU } from '../core/math.js';
import { prep, lumpy, paint, carve, mul } from './forest.js';

// Landmarks: the big set pieces of each level (STYLE.md "Landmarks"). Every one is a screen-grid
// prop (FLAG.STONE / FLAG.LEAF through the AsciiObject material): a mass of readable characters with
// outline glyphs on its silhouette, like the trees. A builder returns painted geometries in world
// space for the set's `props` mesh; the set adds the colliders (each builder exports its footprint).

const UP = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** A painted part: `col` mottled by noise (vary), lit by `ao` (constant or fn(x, y, z)). */
function part(geo, col, { ao = 1, vary = 0.4, freq = 1.3, flag = FLAG.STONE, sway = 0, facet = 0 } = {}) {
  const g = geo.attributes.aCol ? geo : prep(geo);
  paint(g, {
    col: (x, y, z) => mul(col, 1 - vary / 2 + vary * fbm2(x * freq + 3.3, z * freq + y * freq * 0.8, 2)),
    flag,
    sway,
    ao,
  });
  return facet ? facets(g, facet) : g;
}

/**
 * Give every triangle its own brightness (1 ± k). A big smooth form lit evenly lands on ONE level
 * of the grid's glyph ramp and prints as rows of a single character; a spread of facet tones prints
 * as a mix of glyphs, dark chips and bright ones, which is what reads as carved stone or old wood.
 */
function facets(g, k) {
  const p = g.attributes.position, c = g.attributes.aCol;
  for (let i = 0; i + 2 < p.count; i += 3) {
    const cx = p.getX(i) + p.getX(i + 1) + p.getX(i + 2), cy = p.getY(i) + p.getY(i + 1) + p.getY(i + 2), cz = p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2);
    const h = hash2(Math.round(cx * 1.4) * 1.31 + Math.round(cy * 1.4) * 7.7, Math.round(cz * 1.4) * 3.17 - Math.round(cy * 1.4) * 2.3);
    const m = 1 - k + 2 * k * h * h * 1.5;
    for (let j = i; j < i + 3; j++) c.setXYZ(j, c.getX(j) * m, c.getY(j) * m, c.getZ(j) * m);
  }
  return g;
}

/** A tapered limb from a to b (radius r0 at a, r1 at b), unpainted. */
function limb(a, b, r0, r1, sides = 6, segs = 1) {
  const d = b.clone().sub(a);
  const len = d.length();
  const g = prep(new THREE.CylinderGeometry(r1, r0, len, sides, segs));
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}

/** Scale, turn and move finished parts into the world. */
function place(parts, x, z, yaw = 0, s = 1) {
  for (const g of parts) {
    if (s !== 1) g.scale(s, s, s);
    g.rotateY(yaw);
    g.translate(x, 0, z);
  }
  return parts;
}

/**
 * Turn painted (screen-grid) parts into CarvedGlyph parts, for a set's `stones` mesh: stone and
 * metal landmarks are carved like the pillars and walls beside them (world-fixed characters on
 * every cell). aCol and aAO stay; aMoss / aInk / aEdge are added, the grid's aFlag / aSway dropped.
 */
export function carved(parts, { moss = 0, ink = 1 } = {}) {
  for (const g of parts) {
    const n = g.attributes.position.count;
    g.deleteAttribute('aFlag');
    g.deleteAttribute('aSway');
    g.setAttribute('aMoss', new THREE.BufferAttribute(new Float32Array(n).fill(moss), 1));
    g.setAttribute('aInk', new THREE.BufferAttribute(new Float32Array(n).fill(ink), 1));
    g.setAttribute('aEdge', new THREE.BufferAttribute(new Float32Array(n), 1));
  }
  return parts;
}

/** Local (lx, lz) of a landmark at (x, z, yaw, s) in the world: for colliders and clearings. */
export function landmarkPoint(x, z, yaw, s, lx, lz) {
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  return { x: x + (lx * c + lz * sn) * s, z: z + (-lx * sn + lz * c) * s };
}

// ---------------------------------------------------------------- Cinderwood Hollow
const BONE = [0.3, 0.285, 0.245];
const OLD_BONE = [0.2, 0.19, 0.17];

/** The elder wyrm's spine in local space: t 0 (tail tip) .. 1 (skull), an arched back. */
const ELDER = { x0: -15, x1: 9.5, arch: 4.6 };
function elderSpine(t) {
  const x = ELDER.x0 + (ELDER.x1 - ELDER.x0) * t;
  // the tail lies on the ground and curls; the back arches over the ribs; the neck comes down
  const y = 0.35 + ELDER.arch * Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.2) / 0.74)))), 0.8);
  const z = t < 0.3 ? 3.2 * Math.pow((0.3 - t) / 0.3, 1.6) : 0;
  return V(x, y, z);
}

/**
 * The skeleton of an elder wyrm, half sunk along the rim of the clearing: a skull the size of a
 * cart with swept horns and a row of teeth, the spine arching 5 m over a nave of ribs, a wing arm
 * standing like a broken mast, the tail curling away. ~25 m long in local x (skull at +x).
 */
export function buildElderWyrm(rng, x, z, yaw = 0, s = 1) {
  const parts = [];
  const hi = (px, py) => 0.5 + 0.5 * Math.min(1, py / 2.4);
  const add = (g, col = BONE, o = {}) => parts.push(part(g, col, { ao: hi, vary: 0.5, freq: 1.8, facet: 0.3, flag: FLAG.ART_PROP, ...o }));

  // ---- the spine: vertebrae with dorsal spines, bigger over the chest
  const N = 46;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    if (t > 0.05 && t < 0.3 && rng() < 0.16) continue; // gaps in the tail
    const p = elderSpine(t), q = elderSpine(Math.min(1, t + 0.01));
    const k = 0.45 + 0.75 * Math.sin(Math.PI * Math.min(1, t * 1.15)); // girth along the body
    const v = prep(new THREE.BoxGeometry(0.5, 0.52 * k + 0.12, 0.62 * k + 0.14));
    v.rotateZ(Math.atan2(q.y - p.y, q.x - p.x));
    v.rotateY(-Math.atan2(q.z - p.z, q.x - p.x));
    v.translate(p.x, p.y, p.z);
    add(v, t < 0.25 ? OLD_BONE : BONE);
    if (t > 0.26 && t < 0.92 && i % 2 === 0) {
      const sp = prep(new THREE.ConeGeometry(0.16 * k + 0.05, (1.1 + 1.2 * k) * (0.8 + rng() * 0.4), 4));
      sp.translate(0, 0.75 * k + 0.35, 0);
      sp.rotateZ(0.35); // raked back toward the tail
      sp.translate(p.x, p.y, p.z);
      add(sp, BONE, { ao: 1 });
    }
  }
  // ---- the ribs: a nave of arcs from the spine down into the earth, one or two snapped
  const ribs = 9;
  for (let i = 0; i < ribs; i++) {
    const t = 0.36 + (i / (ribs - 1)) * 0.38;
    const p = elderSpine(t);
    const R = Math.max(1.6, p.y * 0.72);
    for (const side of [-1, 1]) {
      const snapped = hash2(i * 5.3 + side, 2.7) < 0.2;
      const arc = snapped ? 1.0 : Math.PI / 2 + 0.55;
      const g = prep(new THREE.TorusGeometry(R, 0.17 - i * 0.004, 5, 14, arc));
      g.rotateZ(Math.PI / 2 - arc); // the arc ends at the top, where it meets the spine
      g.scale(1.25, 1, 1); // ribs spread wider than they are tall
      g.rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2);
      g.rotateY((i - ribs / 2) * 0.03);
      g.translate(p.x, p.y - R + 0.1, 0);
      add(g);
    }
  }
  // ---- the pelvis and a hind leg folded under
  const hip = elderSpine(0.36);
  add(limb(V(hip.x, hip.y, 0.3), V(hip.x - 1.6, 0.9, 2.6), 0.3, 0.2), OLD_BONE);
  add(limb(V(hip.x - 1.6, 0.9, 2.6), V(hip.x + 0.8, 0.1, 3.6), 0.2, 0.14), OLD_BONE);
  // ---- a wing arm standing like a broken mast, three finger bones fanned from its wrist
  const sh = elderSpine(0.7);
  const elbow = V(sh.x - 1.2, sh.y + 4.2, -2.4), wrist = V(sh.x + 1.0, sh.y + 7.6, -4.6);
  add(limb(V(sh.x, sh.y - 0.2, -0.4), elbow, 0.34, 0.24, 6, 2));
  add(limb(elbow, wrist, 0.24, 0.16, 6, 2));
  for (const [dx, dy, dz, len] of [[-3.2, -1.0, -1.6, 1], [-4.4, -3.6, -1.0, 1], [-3.0, -6.2, 0.2, 0.9]]) {
    const tip = V(wrist.x + dx * len, wrist.y + dy * len, wrist.z + dz * len);
    add(limb(wrist, tip, 0.13, 0.04, 5, 2));
  }
  // the other wing fallen: long bones lying in the grass on the far side
  add(limb(V(sh.x - 0.5, 0.25, 2.2), V(sh.x - 5.5, 0.3, 5.2), 0.26, 0.18), OLD_BONE);
  add(limb(V(sh.x - 5.5, 0.3, 5.2), V(sh.x - 10.5, 0.2, 4.4), 0.18, 0.1), OLD_BONE);

  // ---- the skull, resting on its jaw, turned a little toward the clearing
  const skull = [];
  const sadd = (g, col = BONE, o = {}) => skull.push(part(g, col, { ao: (px, py) => 0.55 + 0.45 * Math.min(1, py / 1.6), vary: 0.45, freq: 2.2, flag: FLAG.ART_PROP, ...o }));
  const cran = prep(new THREE.IcosahedronGeometry(1.25, 1));
  cran.scale(1.25, 0.9, 1.05);
  lumpy(cran, 0.3, 1.6, 4);
  cran.translate(0, 1.55, 0);
  sadd(cran);
  const snout = prep(new THREE.BoxGeometry(3.2, 0.95, 1.5, 4, 1, 2));
  {
    const p = snout.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 1 - 0.5 * ((p.getX(i) + 1.6) / 3.2); // tapering to the nose
      p.setZ(i, p.getZ(i) * k);
      p.setY(i, p.getY(i) * (0.6 + 0.4 * k));
    }
  }
  snout.translate(2.5, 1.35, 0);
  sadd(snout);
  const jaw = prep(new THREE.BoxGeometry(3.4, 0.4, 1.25, 4, 1, 2));
  {
    const p = jaw.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * (1 - 0.45 * ((p.getX(i) + 1.7) / 3.4)));
  }
  jaw.rotateZ(-0.2); // hanging open
  jaw.translate(2.2, 0.32, 0);
  sadd(jaw, OLD_BONE);
  for (const sz of [-1, 1]) {
    // eye sockets and brow ridges
    const eye = prep(new THREE.IcosahedronGeometry(0.42, 0));
    eye.translate(1.0, 1.75, sz * 0.72);
    sadd(eye, [0.012, 0.012, 0.014], { vary: 0, ao: 0.3 });
    const brow = prep(new THREE.BoxGeometry(1.0, 0.22, 0.3));
    brow.rotateZ(-0.25);
    brow.translate(1.05, 2.22, sz * 0.74);
    sadd(brow);
    // great horns swept up and back, a smaller pair below
    sadd(limb(V(-0.6, 2.0, sz * 0.7), V(-2.4, 3.6, sz * 1.5), 0.36, 0.2, 6, 2));
    sadd(limb(V(-2.4, 3.6, sz * 1.5), V(-4.6, 4.3, sz * 1.25), 0.2, 0.03, 6, 2));
    sadd(limb(V(-0.7, 1.3, sz * 0.95), V(-2.3, 1.7, sz * 1.9), 0.2, 0.03, 5, 2));
    // teeth along both jaws
    for (let i = 0; i < 7; i++) {
      const tx = 1.25 + i * 0.4, tz = sz * (0.62 - i * 0.045);
      const up = prep(new THREE.ConeGeometry(0.085, 0.5 - i * 0.02, 4));
      up.rotateX(Math.PI);
      up.translate(tx, 0.72, tz);
      sadd(up, [0.36, 0.35, 0.31], { vary: 0.1, ao: 1 });
      if (i % 2 === 0) {
        const lo = prep(new THREE.ConeGeometry(0.075, 0.36, 4));
        lo.translate(tx + 0.1, 0.62 - (tx - 2.2) * 0.2, tz * 0.92);
        sadd(lo, [0.36, 0.35, 0.31], { vary: 0.1, ao: 1 });
      }
    }
  }
  const head = elderSpine(1);
  for (const g of skull) {
    g.rotateX(0.14);
    g.rotateY(-0.42); // the muzzle swings toward the clearing (+z)
    g.translate(head.x + 1.0, -0.15, head.z + 0.3);
    parts.push(g);
  }
  return place(parts, x, z, yaw, s);
}
/** Colliders of the elder wyrm in local space: [lx, lz, r]. The nave between the ribs stays open. */
export const ELDER_COLLIDERS = [
  [11.6, 1.0, 2.3], [8.6, 0.2, 1.3],
  ...[-6, -3.8, -1.6, 0.6, 2.8].flatMap((lx) => [[lx, 3.6, 0.7], [lx, -3.6, 0.7]]),
  [4.6, -2.2, 0.9], [-10, 1.2, 0.8], [-13.5, 2.6, 0.7],
];

const CINDER_BARK = [0.115, 0.092, 0.082];
const HEARTWOOD = [0.26, 0.23, 0.19];
const EMBER_LEAF = [0.44, 0.15, 0.05];
const DEADWOOD = [0.3, 0.275, 0.25];

/**
 * The Cinder Tree: a colossal burned oak, hollow at the root, its trunk twisting up into four great
 * boughs and a crown of bare branches with the last ember-red leaves still hanging on. ~19 m tall.
 */
export function buildCinderTree(rng, x, z, yaw = 0, s = 1) {
  const parts = [];
  const H = 8.5;
  const bark = (g, o = {}) => parts.push(part(g, CINDER_BARK, { vary: 0.7, freq: 0.9, facet: 0.6, ao: (px, py) => 0.7 + 0.3 * Math.min(1, py / 5), sway: 0, ...o }));
  // the trunk: flared, fluted, twisted
  const trunk = prep(new THREE.CylinderGeometry(1.25, 2.3, H, 11, 9));
  trunk.translate(0, H / 2, 0);
  {
    const p = trunk.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
      const a = Math.atan2(pz, px) + py * 0.11; // the twist
      const r = Math.hypot(px, pz) * (1 + 0.13 * Math.sin(a * 5) + 0.9 * Math.pow(Math.max(0, 1 - py / 2.2), 2.2));
      p.setX(i, Math.cos(a) * r + py * 0.035);
      p.setZ(i, Math.sin(a) * r);
    }
  }
  lumpy(trunk, 0.3, 0.8, rng() * 20, V(0, H / 2, 0));
  // furrowed bark: dark grooves running up the twist, paler ridges between
  parts.push(
    paint(trunk, {
      col: (px, py, pz) => {
        const a = Math.atan2(pz, px) - py * 0.11;
        const groove = Math.abs(((a * 2.4 + fbm2(a * 2, py * 0.25, 2) * 1.5) % 1) - 0.5) * 2;
        return mul(CINDER_BARK, (0.45 + 1.0 * groove) * (0.8 + 0.4 * fbm2(px * 0.8, py * 0.5 + pz, 2)));
      },
      flag: FLAG.STONE,
      ao: (px, py) => 0.7 + 0.3 * Math.min(1, py / 5),
    }),
  );
  // the hollow at its foot: a dark mouth with a rim of pale heartwood
  const mouth = prep(new THREE.IcosahedronGeometry(1.1, 1));
  mouth.scale(0.8, 1.5, 0.5);
  mouth.translate(0.2, 1.3, 2.25);
  parts.push(part(mouth, [0.01, 0.008, 0.008], { vary: 0, ao: 0.25 }));
  const rim = prep(new THREE.TorusGeometry(1.15, 0.2, 5, 12, Math.PI * 1.25));
  rim.rotateZ(-Math.PI * 0.125);
  rim.scale(0.8, 1.45, 1);
  rim.translate(0.2, 1.15, 2.5);
  parts.push(part(rim, HEARTWOOD, { vary: 0.5, ao: 0.9 }));
  // roots gripping the ground
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + range(rng, -0.25, 0.25), len = range(rng, 3.2, 5.4);
    const mid = V(Math.cos(a) * 2.3, 0.75, Math.sin(a) * 2.3), end = V(Math.cos(a + 0.25) * (2.2 + len), -0.2, Math.sin(a + 0.25) * (2.2 + len));
    bark(limb(V(Math.cos(a) * 1.3, 1.9, Math.sin(a) * 1.3), mid, 0.62, 0.42, 6));
    bark(limb(mid, end, 0.42, 0.1, 6, 2));
  }
  // four great boughs, each forking twice into bare branches
  const twigs = [];
  const bough = (from, dir, len, r, depth) => {
    const to = from.clone().addScaledVector(dir, len);
    to.y += len * 0.12;
    // the high wood is weathered pale: the crown reads against the dark forest behind it
    parts.push(part(limb(from, to, r, r * 0.62, depth > 1 ? 7 : 5, 2), depth > 1 ? mul(CINDER_BARK, 1.25) : DEADWOOD, { vary: 0.6, freq: 1.1, ao: 1 }));
    if (depth === 0) return twigs.push(to);
    const forks = depth > 1 ? 2 : 3;
    for (let k = 0; k < forks; k++) {
      const d = dir.clone().applyAxisAngle(UP, range(rng, -0.9, 0.9));
      d.y = Math.abs(d.y) * 0.6 + range(rng, 0.15, 0.6);
      bough(to, d.normalize(), len * range(rng, 0.6, 0.78), r * 0.6, depth - 1);
    }
  };
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.5 + range(rng, -0.3, 0.3);
    const dir = V(Math.cos(a) * 0.72, 0.62, Math.sin(a) * 0.72).normalize();
    bough(V(Math.cos(a) * 0.5, H - 0.9, Math.sin(a) * 0.5), dir, range(rng, 4.6, 5.8), 0.78, 2);
  }
  // a broken stub where the fifth bough tore away
  bark(limb(V(0, H - 0.4, 0), V(0.5, H + 2.2, -0.4), 0.9, 0.5, 7));
  // the last leaves: small ember-red clumps on some twig ends (leaf ramp, they sway)
  twigs.forEach((t, i) => {
    if (hash2(i * 3.7, 1.9) > 0.7) return;
    const r = range(rng, 0.9, 1.6);
    const leaf = prep(new THREE.IcosahedronGeometry(r, 1));
    leaf.scale(1, 0.7, 1);
    lumpy(leaf, r * 0.45, 1.5, i);
    leaf.translate(t.x, t.y + 0.2, t.z);
    parts.push(part(leaf, EMBER_LEAF, { flag: FLAG.LEAF, vary: 0.8, freq: 1.4, sway: 0.7, ao: (px, py) => 0.6 + 0.4 * Math.min(1, (py - t.y + r) / (2 * r)) }));
  });
  return place(parts, x, z, yaw, s);
}

// ---------------------------------------------------------------- shared: the stone swordsman
const GREY = [0.105, 0.11, 0.13];

/**
 * A colossal statue of a swordsman standing over his sword, both hands on the pommel, the point in
 * the plinth. `head`: 'hat' (a wide bamboo hat: the sword sect's guardians), 'hood' (a cowl: the
 * throne's wardens) or 'none' (broken off; it lies at his feet). Faces +z. ~7.6 m tall at s = 1.
 */
export function buildColossus(rng, x, z, yaw = 0, s = 1, { col = GREY, head = 'hat', blade = null, worn = 0.07, tall = 1.3 } = {}) {
  const parts = [];
  const ao = (px, py) => 0.5 + 0.5 * Math.min(1, py / 4.5);
  const add = (g, k = 1, o = {}) => {
    if (worn) lumpy(g, worn, 1.9, rng() * 30, V(0, 3.5, 0));
    parts.push(part(g, mul(col, k), { ao, vary: 0.5, freq: 1.5, facet: 0.55, ...o }));
  };
  // plinth: two steps
  const p1 = prep(new THREE.BoxGeometry(3.6, 0.5, 3.4, 2, 1, 2));
  p1.translate(0, 0.25, 0);
  add(p1, 0.85);
  const p2 = prep(new THREE.BoxGeometry(2.9, 0.45, 2.7, 2, 1, 2));
  p2.translate(0, 0.72, 0);
  add(p2, 0.95);
  // the robe: a fluted skirt widening to the plinth, a split down the front
  const robe = prep(new THREE.CylinderGeometry(0.78, 1.28, 3.3, 18, 7));
  robe.translate(0, 0.95 + 1.65, 0);
  {
    const p = robe.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const k = 1 + 0.16 * Math.sin(a * 6) * (1 - 0.6 * ((p.getY(i) - 0.95) / 3.3));
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * k * 0.82);
    }
  }
  add(robe, 0.9);
  // sash and belt knot
  const sash = prep(new THREE.CylinderGeometry(0.84, 0.86, 0.34, 12, 1));
  sash.scale(1, 1, 0.84);
  sash.translate(0, 4.2, 0);
  add(sash, 1.25);
  // chest, tapering up from the belt, then the shoulders
  const chest = prep(new THREE.CylinderGeometry(0.98, 0.76, 1.55, 10, 2));
  chest.scale(1, 1, 0.72);
  chest.translate(0, 5.1, 0);
  add(chest, 1.0);
  const yoke = prep(new THREE.BoxGeometry(2.5, 0.42, 0.95, 3, 1, 1));
  yoke.translate(0, 5.78, 0);
  add(yoke, 1.1);
  for (const sx of [-1, 1]) {
    const pauldron = prep(new THREE.IcosahedronGeometry(0.5, 1));
    pauldron.scale(1.05, 0.8, 1);
    pauldron.translate(sx * 1.2, 5.82, 0);
    add(pauldron, 1.2);
    // arms: down and forward to the pommel in front of the belt
    const elbow = V(sx * 1.32, 4.55, 0.42), hand = V(sx * 0.2, 4.08, 1.08);
    add(limb(V(sx * 1.22, 5.7, 0), elbow, 0.3, 0.26, 7), 1.0);
    add(limb(elbow, hand, 0.26, 0.2, 7), 1.05);
    // hanging sleeves
    const sleeve = prep(new THREE.BoxGeometry(0.34, 1.25, 0.6, 1, 2, 1));
    sleeve.rotateZ(sx * 0.12);
    sleeve.translate(sx * 1.0, 3.92, 0.62);
    add(sleeve, 0.85);
  }
  const hands = prep(new THREE.IcosahedronGeometry(0.34, 1));
  hands.scale(1.25, 0.85, 0.9);
  hands.translate(0, 4.08, 1.1);
  add(hands, 1.25);
  // the sword: pommel, grip under the hands, a wide guard, the blade down to the plinth
  const steel = blade ?? mul(col, 2.6);
  const sw = (g) => parts.push(part(g, steel, { ao: 1, vary: 0.25, freq: 2.5 }));
  const pommel = prep(new THREE.IcosahedronGeometry(0.2, 0));
  pommel.translate(0, 4.42, 1.1);
  sw(pommel);
  const guard = prep(new THREE.BoxGeometry(1.5, 0.16, 0.24));
  guard.translate(0, 3.66, 1.1);
  sw(guard);
  const bl = prep(new THREE.BoxGeometry(0.4, 2.7, 0.1, 1, 3, 1));
  {
    const p = bl.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < -1.0) p.setX(i, p.getX(i) * 0.25); // the point
  }
  bl.translate(0, 3.6 - 1.35, 1.1);
  sw(bl);
  // neck and head
  const neck = prep(new THREE.CylinderGeometry(0.24, 0.3, 0.4, 7));
  neck.translate(0, 6.15, 0);
  add(neck, 0.9);
  const skullCap = () => {
    const h = prep(new THREE.IcosahedronGeometry(0.52, 1));
    h.scale(0.92, 1.08, 1);
    return h;
  };
  if (head === 'none') {
    // snapped at the neck: the head lies beside the plinth, face up
    const h = skullCap();
    h.rotateX(-1.2);
    h.rotateZ(0.5);
    h.translate(2.5, 0.42, 1.5);
    add(h, 1.1, { ao: 0.9 });
  } else {
    const h = skullCap();
    h.translate(0, 6.75, 0.04);
    add(h, 1.9, { ao: 1 });
    if (head === 'hat') {
      // a wide shallow bamboo hat, its brim shading the face
      const hat = prep(new THREE.ConeGeometry(1.05, 0.6, 12, 2, true));
      hat.rotateX(0.14);
      hat.translate(0, 7.22, 0.06);
      add(hat, 0.75, { ao: 1 });
    } else {
      // a deep cowl, the face a dark opening
      const hood = prep(new THREE.IcosahedronGeometry(0.74, 1));
      hood.scale(1.0, 1.12, 1.06);
      hood.translate(0, 6.82, -0.1);
      add(hood, 0.95, { ao: 1 });
      const face = prep(new THREE.IcosahedronGeometry(0.46, 1));
      face.scale(0.8, 1.05, 0.5);
      face.translate(0, 6.72, 0.52);
      parts.push(part(face, [0.008, 0.008, 0.01], { vary: 0, ao: 0.3 }));
      const drape = prep(new THREE.CylinderGeometry(0.5, 1.15, 0.9, 9, 1, true));
      drape.scale(1, 1, 0.8);
      drape.translate(0, 6.05, -0.12);
      add(drape, 0.9);
    }
  }
  // drawn taller than built: the camera looks down at 58 degrees and squashes anything upright
  for (const g of parts) g.scale(1, tall, 1);
  return place(parts, x, z, yaw, s);
}

// ---------------------------------------------------------------- the Ashfall Courtyard
const VERMILION = [0.3, 0.06, 0.035];
const TILE = [0.06, 0.07, 0.095];
const BEAM = [0.12, 0.075, 0.05];
const BRONZE = [0.2, 0.14, 0.065];

/** A sweeping tiled roof: ridge along x, concave slopes, upturned corners. Centre at y (the eaves). */
function roof(w, d, rise, y, { lift = 0.7, tilt = 0 } = {}) {
  const g = new THREE.PlaneGeometry(w, d, Math.round(w / 0.3), Math.round(d / 0.42));
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / (w / 2), v = Math.min(1, Math.abs(p.getZ(i)) / (d / 2));
    p.setY(i, rise * Math.pow(1 - v, 1.7) + lift * Math.pow(Math.abs(u), 3) * (0.25 + 0.75 * v));
  }
  const sheet = prep(g);
  // tile rows: bright ridges every 0.42 m, darker toward the eaves
  paint(sheet, {
    col: (px, py, pz) => mul(TILE, (Math.floor(px / 0.3 + 100) % 3 === 0 ? 2.6 : 0.75) * (Math.floor(Math.abs(pz) / 0.42) % 2 ? 1 : 0.6) * (0.7 + 0.6 * fbm2(px * 0.6, pz * 0.9, 2))),
    flag: FLAG.STONE,
    ao: (px, py) => 0.62 + 0.38 * Math.min(1, py / Math.max(0.1, rise)),
  });
  const ridge = part(new THREE.BoxGeometry(w * 0.86, 0.3, 0.34), mul(TILE, 1.7), { vary: 0.2 });
  ridge.translate(0, rise + 0.1, 0);
  const out = [sheet, ridge];
  for (const sx of [-1, 1]) {
    // ridge-end ornaments: horned finials
    const fin = part(new THREE.ConeGeometry(0.2, 0.95, 4), mul(TILE, 1.9), { vary: 0.1 });
    fin.rotateZ(-sx * 0.5);
    fin.translate(sx * w * 0.43, rise + 0.55, 0);
    out.push(fin);
  }
  for (const g2 of out) {
    if (tilt) g2.rotateZ(tilt);
    g2.translate(0, y, 0);
  }
  return out;
}

/**
 * The sword sect's mountain gate: four vermilion columns under three tiled roofs, the centre one
 * highest, a name board below its beam. The east bay has burned: its column snapped, its roof
 * slid down against the next column. ~15 m wide, ~10 m tall. Faces +z.
 */
export function buildSectGate(rng, x, z, yaw = 0, s = 1) {
  const parts = [];
  const col = (cx, h, r = 0.42, broken = false) => {
    const g = prep(new THREE.CylinderGeometry(r * 0.9, r, h, 9, 4));
    g.translate(0, h / 2, 0);
    if (broken) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) > h * 0.8) p.setY(i, p.getY(i) - hash2(p.getX(i) * 17, p.getZ(i) * 17) * 0.9);
    }
    g.translate(cx, 0.4, 0);
    parts.push(part(g, VERMILION, { vary: 0.8, freq: 1.1, facet: 0.5, ao: (px, py) => 0.5 + 0.5 * Math.min(1, py / 3) }));
    const base = prep(new THREE.BoxGeometry(r * 3.2, 0.4, r * 3.2));
    base.translate(cx, 0.2, 0);
    parts.push(part(base, GREY, { vary: 0.4 }));
  };
  const beam = (x0, x1, y, h = 0.42, d = 0.5, c = BEAM) => {
    const g = prep(new THREE.BoxGeometry(x1 - x0, h, d, 4, 1, 1));
    g.translate((x0 + x1) / 2, y, 0);
    parts.push(part(g, c, { vary: 0.6, freq: 2 }));
  };
  col(-2.7, 7.2, 0.5);
  col(2.7, 7.2, 0.5);
  col(-6.6, 5.4);
  col(6.6, 2.3, 0.42, true);
  // centre bay: two beams, bracket blocks, the name board, the high roof
  beam(-3.5, 3.5, 6.0, 0.5, 0.56);
  beam(-3.9, 3.9, 7.35, 0.46, 0.6);
  for (let bx = -3; bx <= 3.01; bx += 1) beam(bx - 0.2, bx + 0.2, 7.8, 0.36, 0.9, mul(VERMILION, 1.2));
  const board = prep(new THREE.BoxGeometry(2.3, 0.95, 0.16));
  board.translate(0, 6.72, 0.2);
  parts.push(part(board, [0.045, 0.05, 0.07], { vary: 0.3 }));
  for (const bx of [-0.7, 0, 0.7]) {
    // three gilt characters on the board (blocks: at this size they read as bright glyphs)
    const ch = prep(new THREE.BoxGeometry(0.42, 0.55, 0.06));
    ch.translate(bx, 6.72, 0.3);
    parts.push(part(ch, [0.5, 0.36, 0.12], { vary: 0.5, freq: 6 }));
  }
  parts.push(...roof(10.2, 4.2, 1.5, 8.0));
  // west bay: standing
  beam(-7.2, -2.7, 4.5, 0.42, 0.5);
  beam(-7.4, -2.7, 5.55, 0.4, 0.54);
  parts.push(...roof(6.0, 3.4, 1.05, 5.9).map((g) => g.translate(-5.2, 0, 0)));
  // east bay: burned. A beam hangs from the centre column; the roof lies tilted on the ground
  {
    const g = prep(new THREE.BoxGeometry(4.4, 0.42, 0.5, 4, 1, 1));
    g.translate(2.2, 0, 0);
    g.rotateZ(-0.62);
    g.translate(2.7, 4.5, 0);
    parts.push(part(g, mul(BEAM, 0.6), { vary: 0.7 }));
  }
  parts.push(
    ...roof(6.0, 3.4, 1.05, 0, { tilt: -0.36 }).map((g) => {
      g.rotateY(0.3);
      g.translate(6.3, 1.6, 1.5);
      return g;
    }),
  );
  // broad steps up to the threshold
  for (let i = 0; i < 3; i++) {
    const st = prep(new THREE.BoxGeometry(8.6 - i * 1.0, 0.2, 0.9, 6, 1, 1));
    st.translate(0, 0.1 + i * 0.2 - 0.2, 2.6 - i * 0.85);
    parts.push(part(st, GREY, { vary: 0.5, freq: 1.2, ao: 0.9, facet: 0.5 }));
  }
  return place(parts, x, z, yaw, s);
}
export const GATE_COLLIDERS = [[-6.6, 0, 0.8], [-2.7, 0, 0.85], [2.7, 0, 0.85], [6.6, 0, 0.8], [6.3, 1.5, 2.2]];

/** A great bronze incense cauldron on three legs, two loop handles on its rim. ~3 m tall. */
export function buildCauldron(rng, x, z, yaw = 0, s = 1) {
  const parts = [];
  const br = (g, k = 1, o = {}) => parts.push(part(g, mul(BRONZE, k), { vary: 0.7, freq: 2.4, facet: 0.5, ao: (px, py) => 0.55 + 0.45 * Math.min(1, py / 2), ...o }));
  const prof = [[0.5, 0], [1.25, 0.2], [1.6, 0.8], [1.52, 1.35], [1.38, 1.5], [1.62, 1.62], [1.62, 1.8], [1.3, 1.8]].map(([r, y]) => new THREE.Vector2(r, y));
  const bowl = prep(new THREE.LatheGeometry(prof, 14));
  bowl.translate(0, 0.9, 0);
  br(bowl);
  const ash = prep(new THREE.CylinderGeometry(1.32, 1.32, 0.1, 14));
  ash.translate(0, 2.5, 0);
  br(ash, 0.25, { vary: 0.2 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    br(limb(V(Math.cos(a) * 1.0, 1.15, Math.sin(a) * 1.0), V(Math.cos(a) * 1.3, 0, Math.sin(a) * 1.3), 0.3, 0.2, 6), 0.9);
  }
  for (const sx of [-1, 1]) {
    const h = prep(new THREE.TorusGeometry(0.42, 0.11, 5, 9, Math.PI));
    h.rotateY(Math.PI / 2);
    h.translate(sx * 1.55, 2.68, 0);
    br(h, 1.2);
  }
  // a band of studs round the belly
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const st = prep(new THREE.IcosahedronGeometry(0.13, 0));
    st.translate(Math.cos(a) * 1.6, 1.85, Math.sin(a) * 1.6);
    br(st, 1.6, { vary: 0.1, ao: 1 });
  }
  return place(parts, x, z, yaw, s);
}

// ---------------------------------------------------------------- the Obsidian Throne
const OBSIDIAN = [0.1, 0.105, 0.14]; // carved like the hall's pillars (obsidian 0.075 .. 0.11)
const BLOODSTEEL = [0.34, 0.05, 0.035];

/**
 * A blade the height of a tower, driven into the floor at a lean: a broad fullered blade, a
 * crescent guard, a long grip and a ring pommel. The swords of those who came before. ~9 m.
 */
export function buildGreatSword(rng, x, z, yaw = 0, s = 1, { lean = 0.16, col = OBSIDIAN, edge = BLOODSTEEL } = {}) {
  const parts = [];
  const L = 6.6;
  const blade = prep(new THREE.BoxGeometry(1.05, L, 0.2, 2, 8, 1));
  {
    const p = blade.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = (p.getY(i) + L / 2) / L; // 0 at the buried point
      p.setX(i, p.getX(i) * (0.55 + 0.45 * Math.min(1, t * 1.6)));
      if (Math.abs(p.getX(i)) < 0.05) p.setZ(i, p.getZ(i) * 1.9); // the ridge
    }
  }
  blade.translate(0, L / 2 - 0.5, 0);
  parts.push(
    paint(blade, {
      // dark flats, a red-lit edge on both sides, nicks along it
      col: (px, py, pz) => (Math.abs(px) > 0.3 * (0.55 + 0.45 * Math.min(1, ((py + 0.5) / L) * 1.6)) ? mul(edge, 0.7 + 0.6 * hash2(Math.floor(py * 3), 1.3)) : mul(col, 0.8 + 0.5 * fbm2(px * 3, py * 0.8, 2))),
      flag: FLAG.STONE,
      ao: (px, py) => 0.55 + 0.45 * Math.min(1, py / 3),
    }),
  );
  const guard = prep(new THREE.TorusGeometry(1.25, 0.2, 5, 10, Math.PI * 0.62));
  guard.rotateZ(Math.PI / 2 - Math.PI * 0.31);
  guard.scale(1, 0.55, 1.3);
  guard.translate(0, L - 0.5 - 0.62, 0);
  parts.push(part(guard, mul(col, 1.7), { vary: 0.3, facet: 0.5 }));
  const grip = prep(new THREE.CylinderGeometry(0.15, 0.17, 1.7, 7, 4));
  grip.translate(0, L + 0.5, 0);
  parts.push(part(grip, mul(col, 0.9), { vary: 0.9, freq: 6 }));
  const ring = prep(new THREE.TorusGeometry(0.34, 0.1, 5, 10));
  ring.translate(0, L + 1.72, 0);
  parts.push(part(ring, mul(edge, 1.3), { vary: 0.2 }));
  // rubble where it broke the floor
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + rng(), r = range(rng, 0.5, 1.1);
    const chunk = prep(new THREE.IcosahedronGeometry(range(rng, 0.2, 0.42), 0));
    chunk.scale(1, 0.6, 1);
    chunk.translate(Math.cos(a) * r, 0.1, Math.sin(a) * r);
    parts.push(part(chunk, mul(col, 1.2), { vary: 0.4, ao: 0.9 }));
  }
  for (const g of parts) g.rotateZ(lean);
  return place(parts, x, z, yaw, s);
}

/** The throne's wardens: two hooded colossi in obsidian, their swords edged in red. */
export const buildWarden = (rng, x, z, yaw, s) => buildColossus(rng, x, z, yaw, s, { col: OBSIDIAN, head: 'hood', blade: BLOODSTEEL, worn: 0.03 });

// ---------------------------------------------------------------- the Obsidian Throne: Starfall (ADR-112)
// The crater's pieces are built for prop art directly: carve() attributes, flat facets, one tone a
// facet. They go into a set's `stones` mesh (or its breakables) as they are: no carved() pass.
const STAR_ROCK = [0.075, 0.078, 0.105]; // the crater floor's obsidian
/** The star's glass: obsidian with a violet cast (the shards, the crown behind the throne). */
export const STAR_GLASS = [0.07, 0.058, 0.13];

/** One tone per facet, keyed by its normal: a spread of tones is what prints as form. */
const facetTone = (nx, ny, nz) => 0.5 + 1.1 * hash2(Math.round(nx * 9) + Math.round(ny * 9) * 31, Math.round(nz * 9) + 7);
/** A carve() colour: `c` × k × the facet's tone. */
export const facetCol = (c, k = 1) => (px, py, pz, nx, ny, nz) => mul(c, k * facetTone(nx, ny, nz));

/**
 * A spike: a box tapering to `tip` of its base, its foot at (x, y, z). `lean` rad toward
 * (sin yaw, cos yaw); `roll` rad sideways in its own plane (a fan of spikes facing the camera).
 * Carved. The crater's rim slabs and the crown behind the throne are these.
 */
export function buildSpike(rng, x, y, z, { h, w, d = w, tip = 0.1, lean = 0, yaw = 0, roll = 0, col, lump = 0.04 }) {
  const g = prep(new THREE.BoxGeometry(w, h, d, 1, 4, 1));
  g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = 1 - (1 - tip) * Math.pow(Math.max(0, p.getY(i) / h), 1.2);
    p.setX(i, p.getX(i) * t);
    p.setZ(i, p.getZ(i) * t);
  }
  if (lump) lumpy(g, lump, 1.3, rng() * 99, V(0, h / 2, 0));
  if (roll) g.rotateZ(roll);
  g.rotateX(lean);
  g.rotateY(yaw);
  g.translate(x, y, z);
  carve(g, { col, ao: (px, py) => 0.5 + 0.5 * Math.min(1, (py - y) / 1.5) });
  return g;
}

/**
 * The star that fell with him, half sunk where it stopped: two faceted halves split down the
 * middle (he climbed out of the cleft), a crown of ten glass splinters fanned behind them, the
 * tallest 10 m. ~18 m wide. (x, z) is its centre; the cleft faces +z, and his seat stands 5.4 m in
 * front of it. Carved parts.
 */
export function buildFallenStar(rng, x, z) {
  const parts = [];
  for (const sx of [-1, 1]) {
    const half = prep(new THREE.IcosahedronGeometry(4.6, 1));
    lumpy(half, 2.2, 0.3, 7.3 + sx * 3);
    half.scale(1.0, 0.95, 0.9);
    half.rotateZ(sx * 0.16);
    half.translate(x + sx * 4.3, 1.5, z);
    carve(half, { col: facetCol(STAR_ROCK, 1.3), ao: (px, py) => 0.45 + 0.55 * Math.min(1, py / 3.2) });
    parts.push(half);
  }
  for (let i = -5; i <= 5; i++) {
    if (i === 0) continue;
    const roll = -i * 0.2 + range(rng, -0.05, 0.05), h = (10.5 - Math.abs(i) * 1.1) * range(rng, 0.85, 1.1);
    parts.push(buildSpike(rng, x + i * 1.15, 2.6, z + 0.6 - Math.abs(i) * 0.12, { h, w: 0.95 - Math.abs(i) * 0.05, d: 0.42, tip: 0.06, roll, lean: -0.1, col: facetCol(STAR_GLASS, 1.7) }));
  }
  return parts;
}
/** Colliders of the fallen star in local space: [lx, lz, r] (a row across its south face). */
export const STAR_COLLIDERS = [-7.5, -5.9, -4.3, -2.7, -1.1, 0.5, 2.1, 3.7, 5.3, 6.9].map((lx) => [lx, 1.2, 1.1]);

/**
 * The light in the star's cleft: two lines of strokes that open upward from behind the seat.
 * Returns inlay glyphs ({ x, y, z, glyph, size, color, flicker }) for the set's glow batch.
 */
export function starCleft(rng, x, z) {
  const out = [];
  for (let y = 1.4; y < 7.4; y += 0.36) {
    for (const sx of [-1, 1]) out.push({ x: x + sx * (0.1 + y * 0.17) + range(rng, -0.12, 0.12), y, z: z + 3.0 - y * 0.25, glyph: sx < 0 ? '\\' : '/', size: 0.5, color: [2.4, 0.12, 0.08], flicker: 0.14 });
  }
  return out;
}
