import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FLAG, createDragonObjectMaterial, createCarvedGlyphMaterial, createPropArtMaterial } from '../render/materials.js';
import { markCaster } from '../render/pipeline.js';
import { mulberry32, range, hash2, fbm2 } from '../core/rng.js';
import { CONFIG } from '../core/config.js';
import { TAU } from '../core/math.js';
import { prep, lumpy, paint, carve, slabGeometry, mul, STONE, SLAB_LOOK, buildBoulder, buildStandingStone, buildFlagstone, buildBonfire, buildRubble, geosHeight } from './forest.js';
import { buildGreatSword, carved } from './landmarks.js';
import { breakableFloor } from './floor.js';
import { addSlabRims } from '../render/dragonFloor.js';
import { lookOf } from '../entities/enemies/duelist/lookSwitch.js';

// The Windless Grove (ADR-145): a bamboo grove at night with a round clearing, where Lu Wusheng, the
// Sheathed, kneels before a mound of planted swords. South to north (the hero walks north, -z): the
// bonfire, a path of stepping stones between two stone lanterns, then the clearing: packed earth 14 m
// round the origin with a worn round of paving in its middle (6 m; world/floor.js: it scars and breaks),
// lone stalks and clumps of bamboo standing in it, the Sword Grave to the north of where he kneels (a
// low mound, about forty blades planted in it, one great sword in the middle), a memorial stele, six
// mossy boulders and a ruined rest pavilion on the east edge. Beyond the clearing a dense belt of
// bamboo (14 - 22 m, breakable), and a static wall of it past that.
//
// Everything new is drawn through the prop art path (paint(..., { flag: FLAG.ART_PROP }) on the screen
// grid, or carved into the prop art material), and everything that stands is in `breakables`.
// The bamboo and the grave's swords are LIGHT pieces (destructibles.js `light: true`): their fall is
// quiet (no red blow, no tell, no ground mark, no domino sweep, no shake, a soft sound), so a felled
// stalk never cues, never hurts and never holds up one of his blows. A stalk is a 'range' piece of the
// one bamboo mesh (as the forest's trees: no bone of the rigid batch); its stump is a run of the stump
// mesh, cut where the blow bit (ADR-128).
//
// Three arenas behind a build-time switch (`?grove=a|b|c`, lookOf('grove', 'a'); a reload): a moonlit
// night with mist (the default), b grey dawn fog, c first snow (pale litter on the ground, frost on the
// stalks). Cheap variants of light and ground only.

/** Layout numbers (world metres). The level's CONFIG.world overrides read these (levels/grove.js). */
export const GROVE = {
  clearR: 14, // the packed earth
  pavingR: 6, // the worn round of paving
  beltR: [14.2, 22], // the dense, breakable belt of bamboo
  wallR: [22, 34], // the static wall beyond
  innerR: [7, 13], // lone stalks and clumps inside the clearing
  bonfire: { x: 0, z: 24 },
  wait: { x: 0, z: -2, yaw: Math.PI }, // he kneels facing the grave, his back to the path
  grave: { x: 0, z: -6.4, r: 2.3 },
  stele: { x: -5.6, z: -8.2 },
  pavilion: { x: 11.2, z: 3.2, yaw: -1.2 },
  entryZ: 13.4, // where the path meets the clearing
  bound: 30, // the hero's circle
  floor: { r: 12.5 }, // the circle the boss keeps to
};

/** The path's centre line (x at z): a gentle bend. */
const pathX = (z) => 0.9 * Math.sin((z - 14) * 0.3);

/** The three arenas (light and ground only). */
export const GROVE_LOOKS = Object.freeze({
  // a: a cold low moon, pale green-grey mist
  a: {
    sky: { moonColor: [0.36, 0.46, 0.5], moonDir: [-0.7, 0.45, 0.35], ambient: [0.022, 0.034, 0.032], fogColor: [0.012, 0.018, 0.016], fogNear: 22, fogFar: 52 },
    stalk: [0.17, 0.25, 0.12], node: [0.24, 0.3, 0.15], leaf: [0.1, 0.2, 0.09], earth: [0.12, 0.105, 0.085], litter: 0, frost: 0,
  },
  // b: grey dawn fog: a flat light from low in the east, the fog close
  b: {
    sky: { moonColor: [0.5, 0.52, 0.54], moonDir: [0.8, 0.3, 0.3], ambient: [0.05, 0.055, 0.058], fogColor: [0.05, 0.055, 0.058], fogNear: 14, fogFar: 40 },
    stalk: [0.2, 0.26, 0.15], node: [0.26, 0.31, 0.18], leaf: [0.13, 0.21, 0.12], earth: [0.13, 0.12, 0.105], litter: 0, frost: 0,
  },
  // c: first snow: a white moon, pale litter on the ground, frost on the stalks
  c: {
    sky: { moonColor: [0.55, 0.6, 0.7], moonDir: [-0.6, 0.55, 0.4], ambient: [0.04, 0.045, 0.06], fogColor: [0.02, 0.022, 0.03], fogNear: 24, fogFar: 56 },
    stalk: [0.2, 0.25, 0.17], node: [0.42, 0.44, 0.46], leaf: [0.18, 0.24, 0.2], earth: [0.15, 0.15, 0.16], litter: 1, frost: 0.45,
  },
});

/** The arena this page builds (`?grove=`; read when the set is built). */
export const groveOption = () => {
  const o = lookOf('grove', 'a');
  return GROVE_LOOKS[o] ? o : 'a';
};

/** Collects geometries for one merged mesh and hands out each piece's run of vertices (forest.js Runs). */
class Runs {
  constructor() {
    this.list = [];
    this.ranges = [];
    this.v = 0;
  }
  add(geos, leaf = null) {
    const parts = geos.map((g) => g.attributes.position.count);
    const r = { mesh: null, start: this.v, count: parts.reduce((a, n) => a + n, 0), parts, leaf: leaf ? geos.map((g, i) => (leaf(i) ? 1 : 0)) : null };
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
 * One bamboo stalk at (x, z): a thin jointed cane `h` m tall that leans a little and bows toward its top,
 * a ring at every joint, leaf sprays near the top. Returns [cane, ...sprays] (world space, painted for
 * the prop art path; part 0 the cane, the rest foliage).
 */
function bambooStalk(rng, x, z, h, L, { r = 0.055, lean = null } = {}) {
  const parts = [];
  const lx = lean ? lean[0] : range(rng, -0.05, 0.05), lz = lean ? lean[1] : range(rng, -0.05, 0.05);
  const bend = (y) => (y / h) * (y / h) * 0.6; // the bow toward the top, m per unit lean
  const segs = Math.max(6, Math.round(h * 1.4));
  const cane = prep(new THREE.CylinderGeometry(r * 0.7, r, h, 5, segs));
  cane.translate(0, h / 2, 0);
  const joint = range(rng, 0.45, 0.6), ph = rng() * joint;
  const p = cane.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    // a ring at each joint: the cane swells a hair there
    const j = Math.abs(((y + ph) % joint) - joint * 0.5) < joint * 0.09 ? 1.35 : 1;
    p.setXYZ(i, p.getX(i) * j + (lx * y + lx * bend(y) * 3), y, p.getZ(i) * j + (lz * y + lz * bend(y) * 3));
  }
  const seed = x * 3.1 + z * 7.3;
  paint(cane, {
    col: (px, py) => {
      const ring = Math.abs(((py + ph) % joint) - joint * 0.5) < joint * 0.09;
      const c = ring ? L.node : L.stalk;
      return mul(c, 0.75 + 0.5 * hash2(py * 3 + seed, seed));
    },
    flag: FLAG.ART_PROP,
    sway: (px, py) => 0.15 * (py / h),
    ao: (px, py) => 0.55 + 0.6 * Math.min(1, py / (h * 0.6)),
  });
  parts.push(cane);
  // the sprays: a few narrow fans of leaves from the upper joints, drooping outward
  const n = 3 + Math.floor(rng() * 3);
  for (let k = 0; k < n; k++) {
    const y = h * range(rng, 0.6, 0.98);
    const a = rng() * TAU, len = range(rng, 0.7, 1.3);
    const g = prep(new THREE.ConeGeometry(0.28, len, 4, 1, true));
    g.scale(1, 1, 0.3);
    g.translate(0, -len / 2, 0);
    g.rotateZ(Math.PI / 2 + range(rng, 0.3, 0.7)); // out and drooping
    g.rotateY(a);
    const cx = lx * y + lx * bend(y) * 3, cz = lz * y + lz * bend(y) * 3;
    g.translate(cx, y, cz);
    paint(g, {
      col: (px, py, pz) => mul(L.leaf, 0.7 + 0.6 * fbm2(px * 2 + seed, pz * 2 + py, 2)).map((c, i) => c + L.frost * (i === 2 ? 0.2 : 0.17)),
      flag: FLAG.ART_PROP,
      sway: 0.7,
      ao: (px, py, pz, nx, ny) => 0.6 + 0.5 * Math.max(0, ny),
    });
    parts.push(g);
  }
  for (const g of parts) g.translate(x, 0, z);
  return parts;
}

/**
 * The bamboo's look (`?bamboo=0|a|b`, read when the set is built; the owner: "have the bamboos more
 * varied, beautiful and some clumped up ... have way more in the back empty area"): '0' the grove as it
 * was (one kind of cane, scattered); 'a' five kinds of cane mixed through clumps that fan out from
 * their middle (the tallest in it, young shoots at its foot), thick and thin canes, fuller crowns, and
 * the back filled: clumps behind him in the clearing, a deeper belt and a wall that runs on into the
 * fog; 'b' the same with every clump of ONE kind, so the golden and the black groves read as blocks.
 */
export const bambooLook = () => {
  const o = lookOf('bamboo', 'a');
  return o === '0' || o === 'b' ? o : 'a';
};

/**
 * The kinds of cane (colours linear, before the arena's light): `cane` its skin, `node` its rings,
 * `leaf` its sprays, `stripe` a green stripe down one side of each length (golden bamboo), `dry` fewer
 * and paler leaves, `r` its radius range (m), `joint` m between rings, `share` how common it is.
 */
const SPECIES = Object.freeze({
  green: { cane: [0.15, 0.24, 0.1], node: [0.22, 0.29, 0.13], leaf: [0.09, 0.2, 0.08], r: [0.045, 0.075], joint: [0.45, 0.6], share: 0.42 },
  jade: { cane: [0.21, 0.33, 0.13], node: [0.27, 0.36, 0.16], leaf: [0.12, 0.25, 0.1], r: [0.035, 0.06], joint: [0.38, 0.5], share: 0.22 },
  gold: { cane: [0.34, 0.28, 0.09], node: [0.4, 0.33, 0.12], leaf: [0.13, 0.22, 0.08], stripe: [0.12, 0.22, 0.08], r: [0.05, 0.08], joint: [0.42, 0.55], share: 0.14 },
  black: { cane: [0.06, 0.05, 0.065], node: [0.13, 0.11, 0.1], leaf: [0.07, 0.15, 0.07], r: [0.04, 0.065], joint: [0.4, 0.52], share: 0.12 },
  dry: { cane: [0.26, 0.24, 0.16], node: [0.31, 0.28, 0.19], leaf: [0.2, 0.2, 0.11], dry: true, r: [0.04, 0.065], joint: [0.45, 0.6], share: 0.1 },
});
const SPECIES_KEYS = Object.keys(SPECIES);
/** A kind of cane at random by its share. */
const pickSpecies = (rng) => {
  let u = rng();
  for (const k of SPECIES_KEYS) if ((u -= SPECIES[k].share) <= 0) return k;
  return 'green';
};

/**
 * A stalk of one kind (look a / b): like bambooStalk, with its kind's colours (a golden cane's green
 * stripe down one side), radius and joints, a cane that thins and bows, crowns of 3 - 8 sprays from
 * its upper joints (2 - 3 on a dry cane; a young shoot: a few leaves near its tip). `far`: a stalk of
 * the static wall far out (fewer segments and sprays). Returns [cane, ...sprays], world space.
 */
function bambooStalkOf(rng, x, z, h, L, sp, { r = null, lean = null, shoot = false, far = false } = {}) {
  const S = SPECIES[sp], parts = [];
  const rad = r ?? range(rng, S.r[0], S.r[1]);
  const lx = lean ? lean[0] : range(rng, -0.04, 0.04), lz = lean ? lean[1] : range(rng, -0.04, 0.04);
  const bow = range(rng, 0.35, 0.9);
  const bend = (y) => (y / h) * (y / h) * bow;
  const segs = Math.max(4, Math.round(h * (far ? 0.7 : 1.4)));
  const cane = prep(new THREE.CylinderGeometry(rad * (shoot ? 0.85 : 0.62), rad, h, 5, segs));
  cane.translate(0, h / 2, 0);
  const joint = range(rng, S.joint[0], S.joint[1]) * (shoot ? 0.6 : 1), ph = rng() * joint;
  const off = (y) => [lx * y + lx * bend(y) * 3, lz * y + lz * bend(y) * 3];
  const pos = cane.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const j = Math.abs(((y + ph) % joint) - joint * 0.5) < joint * 0.09 ? 1.35 : 1;
    const [ox, oz] = off(y);
    pos.setXYZ(i, pos.getX(i) * j + ox, y, pos.getZ(i) * j + oz);
  }
  const seed = x * 3.1 + z * 7.3, side = rng() * TAU;
  const frost = (c) => c.map((v, i) => v + L.frost * (i === 2 ? 0.2 : 0.17));
  // (the arena's own light on it: the default night keeps the colours as they are)
  const tint = (c) => [c[0] * L.stalk[0] / 0.17, c[1] * L.stalk[1] / 0.25, c[2] * L.stalk[2] / 0.12];
  paint(cane, {
    col: (px, py, pz) => {
      const ring = Math.abs(((py + ph) % joint) - joint * 0.5) < joint * 0.09;
      let c = ring ? S.node : S.cane;
      if (S.stripe && !ring) {
        // the golden cane's green stripe: down one side, turning a quarter at every joint
        const turnK = Math.floor((py + ph) / joint);
        const a = Math.atan2(pz - z - off(py)[1], px - x - off(py)[0]);
        if (Math.cos(a - side - turnK * 1.57) > 0.55) c = S.stripe;
      }
      return mul(tint(c), 0.72 + 0.56 * hash2(py * 3 + seed, seed));
    },
    flag: FLAG.ART_PROP,
    sway: (px, py) => 0.15 * (py / h),
    ao: (px, py) => 0.5 + 0.65 * Math.min(1, py / (h * 0.6)),
  });
  parts.push(cane);
  const n = shoot ? 2 : far ? 2 + Math.floor(rng() * 2) : S.dry ? 2 + Math.floor(rng() * 2) : 4 + Math.floor(rng() * 5);
  for (let k = 0; k < n; k++) {
    const y = h * (shoot ? range(rng, 0.75, 0.95) : range(rng, 0.5, 0.98));
    const a = rng() * TAU, len = (shoot ? range(rng, 0.35, 0.6) : range(rng, 0.7, 1.6)) * (S.dry ? 0.75 : 1);
    const wide = range(rng, 0.22, 0.36);
    const g = prep(new THREE.ConeGeometry(wide, len, 4, 1, true));
    g.scale(1, 1, 0.3);
    g.translate(0, -len / 2, 0);
    g.rotateZ(Math.PI / 2 + range(rng, 0.25, 0.8)); // out and drooping
    g.rotateY(a);
    const [cx, cz] = off(y);
    g.translate(cx, y, cz);
    paint(g, {
      col: (px, py, pz) => frost(mul(tint(S.leaf), 0.66 + 0.7 * fbm2(px * 2 + seed, pz * 2 + py, 2))),
      flag: FLAG.ART_PROP,
      sway: 0.7,
      ao: (px, py, pz, nx, ny) => 0.6 + 0.5 * Math.max(0, ny),
    });
    parts.push(g);
  }
  for (const g of parts) g.translate(x, 0, z);
  return parts;
}

/** A bamboo stump: a short cane (its top is cut where the blow bit: destructibles.js _shapeStub). */
function bambooStump(rng, x, z, L, r = 0.055, col = null) {
  const h = 1.3;
  const g = prep(new THREE.CylinderGeometry(r * 0.9, r, h, 5, 4));
  g.translate(0, h / 2, 0);
  paint(g, { col: mul(col ?? L.stalk, 0.9), flag: FLAG.ART_PROP, sway: 0, ao: (px, py) => 0.55 + 0.4 * Math.min(1, py / h) });
  g.translate(x, 0, z);
  return [g];
}

/** A plain sword planted in the grave mound: blade, guard, grip, at a tilt. Painted prop art. */
function graveSword(rng, x, z, y0, k) {
  const parts = [];
  const len = range(rng, 0.7, 1.05), steel = [0.16, 0.17, 0.2], dark = [0.08, 0.07, 0.065];
  const blade = prep(new THREE.BoxGeometry(0.05, len, 0.012, 1, 3, 1));
  blade.translate(0, len / 2 - 0.15, 0);
  parts.push(paint(blade, { col: (px, py) => mul(steel, (0.7 + 0.5 * hash2(px * 9 + x, py * 4)) * k), flag: FLAG.ART_PROP, ao: 0.9 }));
  const guard = prep(new THREE.BoxGeometry(0.17, 0.03, 0.04));
  guard.translate(0, len - 0.15, 0);
  parts.push(paint(guard, { col: mul(dark, 1.2), flag: FLAG.ART_PROP, ao: 1 }));
  const grip = prep(new THREE.CylinderGeometry(0.016, 0.018, 0.18, 4, 1));
  grip.translate(0, len - 0.15 + 0.1, 0);
  parts.push(paint(grip, { col: dark, flag: FLAG.ART_PROP, ao: 1 }));
  const tx = range(rng, -0.35, 0.35), tz = range(rng, -0.35, 0.35), yaw = rng() * TAU;
  for (const g of parts) {
    g.rotateY(yaw);
    g.rotateX(tz);
    g.rotateZ(tx);
    g.translate(x, y0, z);
  }
  return parts;
}

/** A wooden post of the rest pavilion (painted prop art), its top split. */
function pavilionPost(rng, x, z, h) {
  const g = prep(new THREE.BoxGeometry(0.22, h, 0.22, 1, 4, 1));
  g.translate(0, h / 2, 0);
  lumpy(g, 0.02, 3, rng() * 9, new THREE.Vector3(0, h / 2, 0));
  paint(g, { col: (px, py) => mul([0.13, 0.095, 0.07], 0.75 + 0.5 * hash2(py * 5 + x, z)), flag: FLAG.ART_PROP, ao: (px, py) => 0.55 + 0.45 * Math.min(1, py / h) });
  g.translate(x, 0, z);
  return [g];
}

/** Where the grove's lantern's flame sits (its lamp box, 0.91 - 1.23 m; life/lamps.js reads `lamp`). */
const LANTERN_LAMP = Object.freeze({ y: 1.07, r: 0.13 });

/** A stone lantern (the courtyard's shape, smaller and older): carved for the prop art material. */
function buildLantern(rng, x, z, yaw) {
  const parts = [];
  const box = (w, h, d, y) => {
    const b = prep(new THREE.BoxGeometry(w, h, d));
    b.translate(0, y + h / 2, 0);
    parts.push(b);
  };
  box(0.6, 0.16, 0.6, 0);
  box(0.22, 0.66, 0.22, 0.16);
  box(0.44, 0.09, 0.44, 0.82);
  box(0.36, 0.32, 0.36, 0.91);
  const cap = prep(new THREE.ConeGeometry(0.42, 0.36, 4));
  cap.rotateY(Math.PI / 4);
  cap.translate(0, 1.41, 0);
  parts.push(cap);
  const g = mergeGeometries(parts);
  lumpy(g, 0.02, 4, rng() * 9, new THREE.Vector3(0, 0.7, 0));
  g.rotateY(yaw);
  carve(g, {
    col: (px, py, pz) => mul(STONE, 0.8 + 0.4 * fbm2(px * 3 + x, pz * 3 + py, 2)),
    moss: (px, py, pz, nx, ny) => (ny > 0.6 ? 0.55 : 0.1),
    ao: (px, py) => 0.6 + 0.4 * Math.min(1, py / 1.1),
  });
  g.translate(x, 0, z);
  return g;
}

/** A slab of the round paving: a ring sector between radii r0 .. r1 and angles a0 .. a1, chamfered. */
function ringSlab(rng, r0, r1, a0, a1) {
  const pts = [];
  const j = 0.04;
  for (const [r, a] of [[r0, a0], [r0, (a0 + a1) / 2], [r0, a1], [r1, a1], [r1, (a0 + a1) / 2], [r1, a0]]) {
    const rr = r + range(rng, -j, j), aa = a + range(rng, -j, j) / Math.max(1, r);
    pts.push([Math.sin(aa) * rr, Math.cos(aa) * rr]);
  }
  // (slabGeometry wants star-shaped round its centre: the sector's points are)
  const g = slabGeometry(pts, { top: range(rng, 0.03, 0.045), inset: 0.05, drop: 0.035 });
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return { geo: g, outline: pts, x: cx, z: cz, r: Math.max(0.35, Math.hypot(pts[0][0] - pts[3][0], pts[0][1] - pts[3][1]) * 0.5) };
}

/** Numbers of the new bamboo (look a / b). */
const BAMBOO = Object.freeze({
  // clumps inside the clearing: how many, stalks each, their spread (m), the young shoots at a clump's foot
  inner: { clumps: 11, back: 0.75, stalks: [4, 9], spread: [0.35, 1.0], shoots: [1, 3], h: [6, 11] },
  // the belt (breakable): clumps and lone stalks between beltR; `backK`: how much denser behind him (north)
  belt: { clumps: 62, stalks: [5, 12], spread: [0.4, 1.3], lone: 120, h: [6.5, 12.5], backK: 1.7 },
  // the static wall: from wallR[0] out to `out` m, how many stalks
  wall: { out: 50, n: 1150, h: [7, 13] },
  // a stalk's thickness: thin / mid / thick (x its kind's radius) and their shares
  thick: [[0.75, 0.35], [1, 0.45], [1.45, 0.2]],
});

/**
 * The new bamboo of looks a / b: clumps that fan out from their middle (tallest there, leaning out
 * at the rim, young shoots at their foot) and lone stalks, of five kinds of cane; denser behind him
 * (north: the top of the frame) than toward the camera; a static wall out to BAMBOO.wall.out m.
 * Every stalk inside the wall is a sliced light piece (destructibles.js `slice`, `light`).
 */
function groveBamboo(rng, br, L, look, ctx) {
  const { C, bf, stalkAt, clearOf, onPath, nearProp, bamboo, stumps, breakables, colliders, propGeos } = ctx;
  const B = BAMBOO;
  const thickness = () => {
    let u = rng();
    for (const [k, w] of B.thick) if ((u -= w) <= 0) return k;
    return 1;
  };
  const piece = (x, z, h, sp, { lean = null, shoot = false, inner = false } = {}) => {
    const S = SPECIES[sp], r = range(rng, S.r[0], S.r[1]) * (shoot ? 1.1 : thickness());
    const geos = bambooStalkOf(rng, x, z, h, L, sp, { r, lean, shoot });
    stalkAt.push([x, z]);
    const c = inner || shoot ? null : colliders.add(x, z, Math.max(0.1, r * 1.8), 'trunk');
    breakables.push({
      kind: 'bamboo', species: sp, mat: 'wood', look: 'range', light: true, slice: true, x, z, r: Math.max(0.12, r * 2.4), h,
      range: bamboo.add(geos, (i) => i > 0), colliders: c ? [c] : [], broken: { range: stumps.add(bambooStump(br, x, z, L, r, S.cane)), r: 0 },
      leafy: S.dry ? 0.25 : 0.5, lift: 0, hp: 0.5, cover: false, topples: true, wreck: false,
    });
  };
  /** A clump round (cx, cz): `n` stalks, tallest in the middle, leaning out at its rim; shoots at its foot. */
  const clump = (cx, cz, n, spread, hr, inner, shoots = 0) => {
    const sp0 = pickSpecies(rng);
    const hTop = range(rng, hr[0], hr[1]);
    for (let k = 0; k < n; k++) {
      const a = rng() * TAU, d = spread * Math.sqrt(rng());
      const x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d;
      if (onPath(x, z) || nearProp(x, z) || !clearOf(x, z, 0.24)) continue;
      const out = d / Math.max(0.01, spread);
      const sp = look === 'b' || rng() < 0.6 ? sp0 : pickSpecies(rng);
      const lean = [Math.sin(a) * (0.02 + 0.1 * out), Math.cos(a) * (0.02 + 0.1 * out)];
      piece(x, z, hTop * (1 - 0.32 * out) * range(rng, 0.88, 1.06), sp, { lean, inner });
    }
    for (let k = 0; k < shoots; k++) {
      const a = rng() * TAU, d = spread * range(rng, 0.6, 1.25);
      const x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d;
      if (onPath(x, z) || nearProp(x, z) || !clearOf(x, z, 0.2)) continue;
      piece(x, z, range(rng, 1.2, 3.2), sp0, { shoot: true, inner: true });
    }
  };
  // ---- clumps inside the clearing: most of them behind him (north), a few to the sides; never in the
  // camera's way at the south edge
  for (let i = 0, made = 0; i < 4000 && made < B.inner.clumps; i++) {
    const back = rng() < B.inner.back;
    const a = back ? range(rng, -1.25, 1.25) + Math.PI : rng() * TAU;
    const r = range(rng, C.innerR[0], C.innerR[1]);
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (z > 4 || onPath(x, z) || nearProp(x, z) || !clearOf(x, z, 2.4)) continue;
    clump(x, z, Math.round(range(rng, B.inner.stalks[0], B.inner.stalks[1])), range(rng, B.inner.spread[0], B.inner.spread[1]), B.inner.h, true, Math.round(range(rng, B.inner.shoots[0], B.inner.shoots[1])));
    made++;
  }
  // ---- the belt: clumps and lone stalks, denser behind him
  const beltSpot = () => {
    // (north, z < 0, is `backK` times as likely as south)
    for (;;) {
      const a = rng() * TAU;
      if (Math.cos(a) < 0 && rng() > 1 / B.belt.backK) continue; // (south: thinned)
      const r = C.beltR[0] + Math.pow(rng(), 0.9) * (C.beltR[1] - C.beltR[0]);
      return [Math.sin(a) * r, -Math.cos(a) * r];
    }
  };
  for (let i = 0, made = 0; i < 6000 && made < B.belt.clumps; i++) {
    const [x, z] = beltSpot();
    if (onPath(x, z) || nearProp(x, z) || !clearOf(x, z, 1.6)) continue;
    clump(x, z, Math.round(range(rng, B.belt.stalks[0], B.belt.stalks[1])), range(rng, B.belt.spread[0], B.belt.spread[1]), B.belt.h, false, Math.round(range(rng, 0, 2)));
    made++;
  }
  for (let i = 0, made = 0; i < 20000 && made < B.belt.lone; i++) {
    const [x, z] = beltSpot();
    if (onPath(x, z) || nearProp(x, z) || !clearOf(x, z, 1.0)) continue;
    piece(x, z, range(rng, B.belt.h[0], B.belt.h[1]), pickSpecies(rng));
    made++;
  }
  // ---- the static wall beyond, out into the fog (merged; not breakable)
  for (let i = 0, made = 0; i < 40000 && made < B.wall.n; i++) {
    const a = rng() * TAU, r = C.wallR[0] + Math.pow(rng(), 1.1) * (B.wall.out - C.wallR[0]);
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (onPath(x, z) || Math.hypot(x - bf.x, z - bf.z) < 4 || !clearOf(x, z, r < 34 ? 1.2 : 1.6)) continue;
    stalkAt.push([x, z]);
    const sp = pickSpecies(rng);
    propGeos.push(...bambooStalkOf(rng, x, z, range(rng, B.wall.h[0], B.wall.h[1]), L, sp, { far: r > 34 }));
    if (r < 26) colliders.add(x, z, 0.14, 'trunk');
    made++;
  }
}

export function createWindlessGrove(U, colliders) {
  const opt = groveOption();
  const L = GROVE_LOOKS[opt];
  const C = GROVE;
  const rng = mulberry32(CONFIG.seed + 211); // the layout
  const br = mulberry32(CONFIG.seed + 5311); // stumps, rubble
  const fr = mulberry32(CONFIG.seed + 7311); // the floor's remains
  const group = new THREE.Group();
  group.name = 'windlessGrove';
  const stoneGeos = []; // carved prop art: boulders, the stele, lanterns, the mound, the great sword
  const slabGeos = []; // carved: the paving and the stepping stones
  const propGeos = []; // screen grid: the bonfire, the pavilion's roof, the static wall
  const treeSpots = [], bare = [], slabs = [], floor = [];
  const breakables = [];
  const bamboo = new Runs(), stumps = new Runs();

  // ---- the round of paving in the middle: rings of sector slabs, worn (some missing)
  const pavingCol = (px, py, pz) => mul(STONE, (0.55 + 0.4 * fbm2(px * 1.6, pz * 1.6, 2)) * 0.85);
  const rings = [[0, 1.0, 4], [1.0, 2.0, 10], [2.0, 3.0, 16], [3.0, 4.0, 22], [4.0, 5.0, 28], [5.0, 6.0, 34]];
  for (const [r0, r1, n] of rings) {
    const off = rng() * TAU;
    for (let i = 0; i < n; i++) {
      const a0 = off + (i / n) * TAU + 0.012, a1 = off + ((i + 1) / n) * TAU - 0.012;
      if (r0 > 2 && rng() < 0.07) {
        bare.push({ x: Math.sin((a0 + a1) / 2) * (r0 + r1) / 2, z: Math.cos((a0 + a1) / 2) * (r0 + r1) / 2, r: 0.6 });
        continue;
      }
      let s;
      if (r0 === 0) {
        // the middle: four quarter discs
        const pts = [[0, 0]];
        for (let k = 0; k <= 3; k++) {
          const a = a0 + ((a1 - a0) * k) / 3;
          pts.push([Math.sin(a) * r1, Math.cos(a) * r1]);
        }
        const cx = pts.reduce((q, p) => q + p[0], 0) / pts.length, cz = pts.reduce((q, p) => q + p[1], 0) / pts.length;
        const g = slabGeometry(pts.map(([x, z]) => [x * 0.97, z * 0.97]), { top: 0.04, inset: 0.05, drop: 0.035 });
        s = { geo: g, outline: pts, x: cx, z: cz, r: 0.6 };
      } else s = ringSlab(rng, r0 + 0.03, r1 - 0.03, a0, a1);
      carve(s.geo, { col: pavingCol, ao: 0.85, moss: 0.12, edge: (px, py, pz, nx, ny) => (ny > 0.5 && ny < 0.95 ? 1 : 0) });
      slabGeos.push(s.geo);
      slabs.push({ x: s.x, z: s.z, r: s.r, outline: s.outline });
      floor.push({ geo: s.geo, outline: s.outline, x: s.x, z: s.z, r: s.r * 0.87, col: pavingCol, kind: 'paving' });
    }
  }
  // ---- the stepping stones from the clearing to the bonfire
  const flagCol = (px, py, pz) => mul(STONE, 0.6 + 0.4 * fbm2(px * 2, pz * 2, 2));
  for (let z = C.entryZ - 1.2; z < C.bonfire.z - 1.6; z += range(rng, 1.0, 1.3)) {
    const x = pathX(z) + range(rng, -0.35, 0.35);
    const w = range(rng, 0.8, 1.15), d = range(rng, 0.65, 0.95);
    const s = buildFlagstone(rng, x, z, w, d, rng() * TAU);
    slabGeos.push(s.geo);
    slabs.push({ x, z, r: Math.max(w, d) * 0.65, outline: s.outline });
    floor.push({ geo: s.geo, outline: s.outline, x, z, r: Math.max(w, d) * 0.5, col: flagCol, kind: 'flagstone' });
  }

  // ---- the bonfire
  const bf = C.bonfire;
  propGeos.push(...buildBonfire(rng, bf.x, bf.z));
  colliders.add(bf.x, bf.z, 0.75, 'bonfire');
  bare.push({ x: bf.x, z: bf.z, r: 2.4 });

  // ---- landmarks and props
  const standing = (kind, geo, x, z, r, extra = {}) => {
    breakables.push({
      kind, mat: 'stone', look: 'prop', x, z, r, h: geosHeight([geo]), geos: [geo], colliders: [colliders.add(x, z, r, 'stone')],
      broken: { geos: buildRubble(br, x, z, r * 0.85, { h: range(br, 0.3, 0.55) }), r: r * 0.7 }, lift: 1, ...extra,
    });
  };
  // the Sword Grave: a low mound, about forty plain swords planted in it (light pieces), the great sword
  {
    const G = C.grave;
    const m = prep(new THREE.SphereGeometry(G.r, 10, 5, 0, TAU, 0, Math.PI / 2));
    m.scale(1, 0.32, 0.85);
    lumpy(m, 0.12, 1.6, 3.3, new THREE.Vector3(0, 0, 0));
    m.translate(G.x, 0, G.z);
    carve(m, { col: (px, py, pz) => mul(L.earth, 0.8 + 0.5 * fbm2(px * 2, pz * 2, 2)), moss: 0.3, ao: (px, py) => 0.6 + 0.6 * Math.min(1, py / 0.6) });
    stoneGeos.push(m);
    colliders.add(G.x, G.z, G.r * 0.75, 'stone');
    stoneGeos.push(...carved(buildGreatSword(rng, G.x, G.z - 0.1, 0.15, 0.36, { lean: 0.06, tilt: -0.08, col: [0.07, 0.07, 0.075], steel: [0.19, 0.2, 0.23], edge: [0.12, 0.1, 0.08] })));
    let placed = 0;
    for (let i = 0; i < 400 && placed < 40; i++) {
      const a = rng() * TAU, rr = Math.sqrt(rng()) * G.r * 0.92;
      const x = G.x + Math.sin(a) * rr, z = G.z + Math.cos(a) * rr * 0.85;
      if (Math.hypot(x - G.x, z - G.z) < 0.55) continue; // (the great sword's ground)
      const yb = 0.32 * G.r * Math.sqrt(Math.max(0, 1 - (rr / G.r) ** 2)) * 0.9;
      const geos = graveSword(rng, x, z, yb, 0.8 + 0.5 * rng());
      breakables.push({ kind: 'graveSword', mat: 'metal', look: 'prop', light: true, x, z, r: 0.14, h: geosHeight(geos), geos, colliders: [], hp: 0.6, topples: true, cover: false, lift: 0, wreck: false });
      placed++;
    }
  }
  // the memorial stele
  standing('stele', buildStandingStone(rng, C.stele.x, C.stele.z, { h: 2.3, w: 1.0, d: 0.3, yaw: 0.35 }), C.stele.x, C.stele.z, 0.62);
  // two stone lanterns on the path
  for (const s of [-1, 1]) {
    const z = C.entryZ + 1.6, x = pathX(z) + s * 1.9;
    standing('lantern', buildLantern(rng, x, z, range(rng, -0.2, 0.2)), x, z, 0.4, { topples: false, lamp: LANTERN_LAMP });
  }
  // six mossy boulders round the clearing's edge
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.5 + range(rng, -0.2, 0.2), r = range(rng, 10.5, 13.2);
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (z > 11 && Math.abs(x) < 3) continue; // (not on the path)
    const size = range(rng, 0.6, 1.1);
    const g = buildBoulder(rng, x, z, size);
    breakables.push({ kind: 'boulder', mat: 'stone', look: 'prop', x, z, r: size * 0.85, h: geosHeight([g]), geos: [g], colliders: [colliders.add(x, z, size * 0.85, 'boulder')], topples: false, lift: 1 });
  }
  // the ruined rest pavilion on the east edge: four posts (breakable), its roof fallen beside them
  {
    const P = C.pavilion, c = Math.cos(P.yaw), s = Math.sin(P.yaw);
    for (const [lx, lz, h] of [[-1.3, -1.1, 2.5], [1.3, -1.1, 2.1], [-1.3, 1.1, 1.6], [1.3, 1.1, 2.4]]) {
      const x = P.x + lx * c + lz * s, z = P.z - lx * s + lz * c;
      const geos = pavilionPost(rng, x, z, h);
      // (light too: a felled post must never cue nor hold up one of his blows)
      breakables.push({ kind: 'post', mat: 'wood', look: 'prop', light: true, x, z, r: 0.2, h, geos, colliders: [colliders.add(x, z, 0.18, 'trunk')], lift: 1, cover: false });
    }
    // the fallen roof: a sagging thatch slab leaning on the ground (static, screen grid)
    const roof = prep(new THREE.BoxGeometry(3.4, 0.22, 2.6, 4, 1, 3));
    lumpy(roof, 0.08, 1.4, 7.7);
    roof.rotateZ(0.28);
    roof.rotateY(P.yaw + 0.3);
    roof.translate(P.x + 1.2, 0.55, P.z + 1.8);
    paint(roof, { col: (px, py, pz) => mul([0.2, 0.16, 0.08], 0.7 + 0.5 * fbm2(px * 3, pz * 3, 2)), flag: FLAG.ART_PROP, ao: (px, py, pz, nx, ny) => 0.6 + 0.5 * Math.max(0, ny) });
    propGeos.push(roof);
    colliders.add(P.x + 1.2, P.z + 1.8, 1.3, 'stone');
  }

  // ---- the bamboo
  const look = bambooLook();
  const stalkAt = [];
  const clearOf = (x, z, d) => !stalkAt.some((t) => Math.hypot(t[0] - x, t[1] - z) < d);
  const onPath = (x, z) => z > C.entryZ - 2 && z < bf.z + 3 && Math.abs(x - pathX(z)) < 2.4;
  const nearProp = (x, z) =>
    Math.hypot(x - C.grave.x, z - C.grave.z) < C.grave.r + 1.4 || Math.hypot(x - C.stele.x, z - C.stele.z) < 1.6 ||
    Math.hypot(x - C.pavilion.x, z - C.pavilion.z) < 3.4 || Math.hypot(x - bf.x, z - bf.z) < 3.5;
  const stalkPiece = (x, z, h, inner) => {
    const geos = bambooStalk(rng, x, z, h, L);
    stalkAt.push([x, z]);
    const c = inner ? null : colliders.add(x, z, 0.12, 'trunk');
    breakables.push({
      kind: 'bamboo', mat: 'wood', look: 'range', light: true, slice: true, x, z, r: 0.14, h,
      range: bamboo.add(geos, (i) => i > 0), colliders: c ? [c] : [], broken: { range: stumps.add(bambooStump(br, x, z, L)), r: 0 },
      leafy: 0.5, lift: 0, hp: 0.5, cover: false, topples: true, wreck: false,
    });
  };
  if (look !== '0') {
    groveBamboo(rng, br, L, look, { C, bf, stalkAt, clearOf, onPath, nearProp, bamboo, stumps, breakables, colliders, propGeos });
  }
  // lone stalks and clumps of two or three inside the clearing (no cover, no collider)
  for (let i = 0; look === '0' && i < 2000 && stalkAt.length < 34; i++) {
    const a = rng() * TAU, r = range(rng, C.innerR[0], C.innerR[1]);
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (onPath(x, z) || nearProp(x, z) || !clearOf(x, z, 2.6)) continue;
    const n = rng() < 0.45 ? 1 : rng() < 0.6 ? 2 : 3;
    for (let k = 0; k < n; k++) {
      const ox = k ? range(rng, -0.45, 0.45) : 0, oz = k ? range(rng, -0.45, 0.45) : 0;
      stalkPiece(x + ox, z + oz, range(rng, 6, 9.5), true);
    }
  }
  // the dense belt (breakable)
  const BELT_MAX = 330;
  let belt = 0;
  for (let i = 0; look === '0' && i < 20000 && belt < BELT_MAX; i++) {
    const a = rng() * TAU, r = C.beltR[0] + Math.pow(rng(), 0.9) * (C.beltR[1] - C.beltR[0]);
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (onPath(x, z) || nearProp(x, z) || !clearOf(x, z, 1.25)) continue;
    stalkPiece(x, z, range(rng, 6.5, 10), false);
    belt++;
  }
  // the static wall beyond (merged, not breakable)
  const wallGeos = [];
  for (let i = 0; look === '0' && i < 30000 && wallGeos.length < 520 * 4; i++) {
    const a = rng() * TAU, r = C.wallR[0] + Math.pow(rng(), 1.2) * (C.wallR[1] - C.wallR[0]);
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (onPath(x, z) || Math.hypot(x - bf.x, z - bf.z) < 4 || !clearOf(x, z, 1.5)) continue;
    stalkAt.push([x, z]);
    const g = bambooStalk(rng, x, z, range(rng, 7, 11), L, { r: 0.065 });
    wallGeos.push(...g);
    if (r < 26) colliders.add(x, z, 0.14, 'trunk');
  }
  propGeos.push(...wallGeos);
  // the ground's litter (option c: first snow; pale flakes lying in drifts), a few flat patches
  if (L.litter > 0) {
    for (let i = 0; i < 70; i++) {
      const a = rng() * TAU, r = range(rng, 2, 26);
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      const g = prep(new THREE.CircleGeometry(range(rng, 0.5, 1.4), 7));
      g.rotateX(-Math.PI / 2);
      g.scale(1, 1, range(rng, 0.5, 1));
      g.rotateY(rng() * TAU);
      g.translate(x, 0.015, z);
      paint(g, { col: mul([0.46, 0.48, 0.52], 0.7 + 0.4 * rng()), flag: FLAG.ART_PROP, ao: 0.9 });
      propGeos.push(g);
    }
  }

  // ---- meshes
  // (?dpProps / ?dpTrees: the dragon print's relief, render/dragonProps.js; both off: createAsciiObjectMaterial itself)
  const mat = createDragonObjectMaterial(U, { fadeNearPlayer: true, side: THREE.DoubleSide });
  const bambooMesh = bamboo.finish(mat, 'bamboo');
  const stumpMesh = stumps.finish(mat, 'bambooStumps');
  stumpMesh.userData.autoHide = true; // (drawn only while a stump shows: RangeBody counts them)
  const propMesh = new THREE.Mesh(mergeGeometries(propGeos), mat);
  propMesh.name = 'props';
  const stoneMat = createPropArtMaterial(U, { fadeNearPlayer: true });
  const stoneMesh = new THREE.Mesh(mergeGeometries(stoneGeos), stoneMat);
  stoneMesh.name = 'stones';
  // (the dragon print, `?dpFloor=`: the worn round keeps the sky's light in the stalks' shadow, so it still reads)
  const slabMat = createCarvedGlyphMaterial(U, { ...SLAB_LOOK, gain: 1.6, lumScale: 2.0, edge: 0.3, inkFloor: 0.04, viewPitch: CONFIG.camera.pitch, dp: { k: 2.2, top: 0.12, sky: 0.36 } });
  const slabMesh = new THREE.Mesh(mergeGeometries(slabGeos), slabMat);
  slabMesh.name = 'paving';
  group.add(bambooMesh, stumpMesh, propMesh, stoneMesh, slabMesh);
  markCaster(group);
  breakables.push(...breakableFloor({ slabs: floor, slabGeos, slabMesh, mat: slabMat, rng: fr, group }).defs);
  addSlabRims(group, slabMat); // (the dragon print's rims: only under ?dpFloor)
  for (const t of stalkAt) treeSpots.push({ x: t[0], z: t[1], r: 0.9 });

  const S = CONFIG.world.dragonSleep ?? C.wait;
  const sky = { ...L.sky };
  return {
    group, treeSpots, bare, slabs, nest: { x: S.x, z: S.z }, bonfire: { x: bf.x, z: bf.z },
    material: mat, stoneMaterial: stoneMat, slabMaterial: slabMat,
    breakables, option: opt,
    scarInk: [0.01, 0.012, 0.01],
    sky,
    // grass thinned inside the clearing (packed earth), the grove's floor of leaves round it
    grass: {
      ash: opt === 'c' ? 0.5 : 0,
      height: 0.7,
      density: (x, z) => {
        const r = Math.hypot(x, z);
        if (r < C.clearR - 1) return 0.05;
        if (onPath(x, z)) return 0.2;
        return 0.25 + 0.35 * fbm2(x * 0.1 + 3, z * 0.1, 2);
      },
    },
  };
}
