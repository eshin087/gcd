import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createAsciiObjectMaterial, createCarvedGlyphMaterial, createPropArtMaterial } from '../render/materials.js';
import { markCaster } from '../render/pipeline.js';
import { mulberry32, range, hash2, fbm2 } from '../core/rng.js';
import { CONFIG } from '../core/config.js';
import { TAU } from '../core/math.js';
import { prep, lumpy, carve, slabGeometry, mul, SLAB_LOOK, buildFlagstone, buildBonfire, buildRubble, buildBoulder, buildDeadTree, buildStump, geosHeight, STONE } from './forest.js';
import { buildButte, buildHoodoo, buildRingPost, buildSpike, facetCol, BADLAND, RING_BRONZE } from './landmarks.js';
import { breakableFloor } from './floor.js';
import { createGround } from './ground.js';
import { lookOf } from '../entities/enemies/duelist/lookSwitch.js';
import { hangFrom } from './hang.js';

// The Skybreak Ring (`?level=ring`): an open-air tournament ring on the badlands, wrecked by the fight.
// A square platform of stone tiles 30 m across centred on the origin (the duel's centre): a kerb of
// long dark stones round its edge, an octagon of wedge plates at its middle, every tile, kerb stone and
// plate a breakable floor slab (world/floor.js, ADR-122). A bronze brazier burns on a stone post at
// each corner (the two south ones low: nothing tall stands south of the fight). South of the ring a
// path of flagstones runs down to the bonfire; the hero steps onto the ring at its south edge
// (RING.entryZ). Round it the badlands: wind-carved buttes in banded red strata east, west and just
// past the north edge, whose tops come off (two-stage breakables, BREAK.colossus's precedent: a great
// beam swept along destructibles.sweep takes a top).
//
// Three arenas behind a build-time switch, `?ring=a|b|c` (lookOf('ring', 'a'); a reload each):
//   a  the ring on the flats: low on a dry lake bed of cracked clay plates, banners east and west, a
//      war drum and a gong, a judges' dais to the north; buttes and hoodoos standing off east and west
//   b  the sunken ring: at the bottom of a stepped quarry, three terraces of cut stone round it east,
//      west and north (drawn as props with colliders: the play surface stays y = 0), the south open
//      where the path comes down; a timber derrick, stacks of cut blocks; buttes past the rim
//   c  the butte's crown: the ring on the flat top of a butte, the world's ground lowered far below
//      (`groundY`), the crown's own soil a copy of the ground on its outline, cliffs falling into the
//      haze, rock spires rising past the rim, neighbouring buttes standing out of the depths; a neck
//      of rock to the south carries the path to the bonfire's ledge
//
// The light changes with the boss's form (`ambience.update` reads game.dragon.phase / state): a clear
// dusk (warm, low, long shadows), then golden (warmer and brighter, a glow round him, motes), then a
// thunderstorm (cold and dark, wind, rain as glyph particles, lightning that lights the whole ring for
// a frame or two). `ambience.flare(k)` (a transformation, a great blow): a flash of the form's light;
// `ambience.dim(k)` (call each frame it should hold: the great beam's charge): the ring's light pulled
// down by k. A reset (phase back to 1) snaps it back. The sky itself is never on screen (the camera
// looks down at 58 degrees): what changes is what the light falls on.
//
// Same output shape as the other sets (world.js reads it), plus `groundY` (c: world.js lowers its
// ground plane there). Drawn through the glyph systems (STYLE.md): prop art for every upright thing
// (the buttes, posts, banners, terraces, cliffs), carved glyphs for the floor, the screen grid for
// the bonfire and the dead trees, glyph particles for dust, motes and rain, heat in the fire field
// for the braziers.

/** The arenas (lookSwitch.js `ring`): `a` is the default. */
export const RING_LOOKS = Object.freeze(['a', 'b', 'c']);
/** The arena this page builds (read when the level is built: a reload each). */
export const ringOption = () => {
  const o = lookOf('ring', 'a', 'a');
  return RING_LOOKS.includes(o) ? o : 'a';
};

const HALF = 15; // the ring: |x|, |z| <= HALF
const CELL = 1.5; // its tile pitch (20 x 20)
const CROWN_DROP = 40; // c: how far below the crown the badlands lie

/**
 * Per arena: where the bonfire is, the hero's bound (round the origin), the ground's height, and the
 * buttes ([x, z, h, r, cut, below]: `cut` where the top comes off; `below` its foot under y 0).
 */
const LAYOUT = {
  a: {
    bonfireZ: 33, bound: 40, groundY: 0,
    buttes: [[21, -8.5, 10, 3.8, 4.6], [26.5, -19.5, 9, 4, 5.4], [-21.2, -10.5, 10.5, 4.1, 4.9], [-27.5, 0.5, 8, 3.7, 4.8], [5.5, -27.5, 10, 5, 6], [-13.5, -26.5, 8.5, 3.9, 5.1]],
    hoodoos: [[23.6, 1.2, 4.6, 0.95], [-22.6, 5.4, 4.2, 0.9], [-17.4, -20.6, 5.6, 1.05], [16.2, -21.8, 4.8, 0.95]],
  },
  b: {
    bonfireZ: 33, bound: 40, groundY: 0,
    // (the quarry is cut into the feet of the buttes east and west: they stand on its terraces)
    buttes: [[21.4, -6, 10, 3.9, 4.6], [-21.6, -7.5, 10.5, 4.1, 4.9], [-7, -27.5, 10, 4.6, 6], [12.5, -28, 11, 4.6, 6.6]],
    hoodoos: [[27.5, 5.2, 5.0, 1.0], [-27.6, 4.6, 4.6, 0.95]],
  },
  c: {
    bonfireZ: 29.5, bound: 40, groundY: -CROWN_DROP,
    buttes: [[24.6, -4.5, 8.5, 3.8, 3.8, CROWN_DROP], [-24.8, -2, 9.5, 4, 4.4, CROWN_DROP], [12.5, -31, 6.5, 4.6, 2.8, CROWN_DROP], [-16, -30.5, 7.5, 4.6, 3.4, CROWN_DROP]],
    hoodoos: [],
  },
};

const OPT0 = ringOption();
const L0 = LAYOUT[OPT0];

/** The ring's layout (levels/skybreak.js and the boss read it). Fields for the arena this page built. */
export const RING = {
  option: OPT0,
  half: HALF, // the platform is |x|, |z| <= half
  cell: CELL,
  entryZ: HALF + 0.4, // where the hero steps onto the platform (its south edge)
  bonfire: { x: 0, z: L0.bonfireZ },
  floor: { r: HALF - 1.2 }, // the circle the boss keeps to (inscribed in the square, the kerb left free)
  wait: { x: 0, z: -3, yaw: 0 }, // where the boss waits for the hero (arms folded)
  bound: L0.bound, // the hero's bound round the origin (c: the crown's rim colliders hold him)
  groundY: L0.groundY,
  /** the ring's four corners (the four bolts of the third ascension strike them) */
  corners: Object.freeze([[-HALF, -HALF], [HALF, -HALF], [HALF, HALF], [-HALF, HALF]].map((p) => Object.freeze(p))),
  /** the buttes: { x, z, r, h, cut } (a beam aimed at one takes its top: destructibles.sweep through its foot) */
  buttes: Object.freeze(L0.buttes.map(([x, z, h, r, cut]) => Object.freeze({ x, z, r, h, cut }))),
};

// ---------------------------------------------------------------- palette (linear albedo)
const TILE = [0.2, 0.172, 0.138]; // the ring's sandstone tiles
const KERB = [0.14, 0.115, 0.098]; // its kerb, darker
const CENTRE = [0.18, 0.158, 0.135];
const CLAY = [0.22, 0.18, 0.14]; // the dry lake bed's plates
const CUT = [0.115, 0.097, 0.08]; // the quarry's cut stone
const WOOD = [0.11, 0.08, 0.058];
const CLOTH = [0.25, 0.05, 0.036]; // the banners: a deep red
const SKIN = [0.3, 0.265, 0.2]; // a drum's head
/** The earth under a broken tile (world/floor.js prints it with the paving's ink): a warm pale dust, well
 *  over the dimmed tiles, so a crater and a wrecked ring read at the game camera (the stage pass). */
const EARTH = [0.42, 0.27, 0.15];
const tileCol = (c, f = 1.6) => (px, py, pz) => mul(c, (0.62 + 0.42 * fbm2(px * f, pz * f, 2)) * (0.8 + 0.22 * fbm2(px * 0.12 + 7, pz * 0.12 - 3, 2)));
const edgeBand = (px, py, pz, nx, ny) => (ny > 0.5 && ny < 0.95 ? 1 : 0);
/** The floor must stay calm under the duel: sparse, dim glyphs (the courtyard's paving look). */
// (2026-11-21, the stage pass: the tiles' strokes were as bright and busy as the fighters. Now fewer and
// dimmer marks: no hatching on the tiles' sides, almost no crack lines, a fainter chamfer; the joints stay)
/** THE FLOOR'S BRIGHTNESS BY FORM (the paving's glyph gain; the ambience eases it with the form's light):
 *  [form 1 (the dusk), form 2 (golden), form 3 (the storm)]. The owner has been asked whether form 1's
 *  floor stays this dark (the stage pass) or is brightened: the answer is FLOOR_GAIN[0] (0.74 now; the
 *  paving before the stage pass printed at about 1.0). Only the floor: the figures' light is PALETTE's. */
export const FLOOR_GAIN = Object.freeze([0.74, 0.74, 0.74]);
const PAVING_LOOK = { gain: FLOOR_GAIN[0], lumScale: 1.5, edge: 0.18, inkFloor: 0.02, base: 0.05, crackAmount: 0.08, strokeLevels: [9, 9], topGlyphs: ['    ', '.   ', '. . ', '.:. ', ':.:.', ';:.:'] };
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- pieces
/** A slab on the polygon `pts` (round its own centre), laid at (x, z), tilted a touch, carved. */
function polySlab(rng, pts, x, z, { top = 0.04, inset = 0.06, drop = 0.04, tilt = 0.01, col, bottom = -0.2 }) {
  const g = slabGeometry(pts, { top, inset, drop, bottom });
  if (tilt > 0) {
    const ax = new THREE.Vector3(range(rng, -1, 1), 0, range(rng, -1, 1) + 1e-3).normalize();
    g.applyMatrix4(new THREE.Matrix4().makeRotationAxis(ax, range(rng, 0.25, 1) * tilt));
  }
  g.translate(x, 0, z);
  carve(g, { col, ao: 0.85, moss: 0.03, edge: edgeBand });
  let r = 0;
  for (const [px, pz] of pts) r = Math.max(r, Math.hypot(px, pz));
  return { geo: g, outline: pts.map(([px, pz]) => [x + px, z + pz]), r };
}

/** A rectangular tile w x d at (x, z): its corners jittered, now and then one chipped. */
function rectTile(rng, x, z, w, d, o) {
  const j = 0.035;
  const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([a, b]) => [a + range(rng, -j, j), b + range(rng, -j, j)]);
  if (rng() < 0.18) {
    const k = Math.floor(rng() * 4), a = pts[k], b = pts[(k + 1) % 4];
    pts.splice(k + 1, 0, [a[0] * 0.55 + b[0] * 0.45, a[1] * 0.55 + b[1] * 0.45]);
    a[0] *= 0.84;
    a[1] *= 0.84;
  }
  return polySlab(rng, pts, x, z, o);
}

/** A box carved at (x, y, z) (its foot at y), w x h x d, turned by yaw, lumped a little. */
function stoneBox(rng, x, y, z, w, h, d, { yaw = 0, col, k = 1.25, lump = 0.04, seg = 1 }) {
  const g = prep(new THREE.BoxGeometry(w, h, d, seg, seg, seg));
  g.translate(0, h / 2, 0);
  if (lump) lumpy(g, lump, 2.2, rng() * 99, new THREE.Vector3(0, h / 2, 0));
  g.rotateY(yaw);
  g.translate(x, y, z);
  carve(g, { col: facetCol(col, k), ao: (px, py) => 0.55 + 0.45 * Math.min(1, (py - y) / Math.max(0.4, h)), edge: edgeBand });
  return g;
}

/** A tapered wooden pole from (x, y0, z) up h m, radius r. */
function pole(x, y0, z, h, r, { tilt = 0, yaw = 0 } = {}) {
  const g = prep(new THREE.CylinderGeometry(r * 0.8, r, h, 6, 1));
  g.translate(0, h / 2, 0);
  if (tilt) g.rotateZ(tilt);
  g.rotateY(yaw);
  g.translate(x, y0, z);
  carve(g, { col: facetCol(WOOD, 1.3), ao: 1 });
  return g;
}

/**
 * A banner on its pole: the pole (h m) with a bronze finial, a crossbar, a long cloth hanging from it
 * (a swallowtail at its foot, a slight ripple), facing the camera (+z). Returns its geometries.
 */
function buildBanner(rng, x, z, h) {
  const out = [pole(x, 0, z, h, 0.09)];
  const fin = prep(new THREE.ConeGeometry(0.13, 0.4, 5));
  fin.translate(x, h + 0.2, z);
  carve(fin, { col: facetCol(RING_BRONZE, 1.4), ao: 1 });
  out.push(fin);
  const bar = prep(new THREE.BoxGeometry(1.25, 0.08, 0.08));
  bar.translate(x, h - 0.35, z + 0.06);
  carve(bar, { col: facetCol(WOOD, 1.3), ao: 1 });
  out.push(bar);
  const L = h * 0.58, W = 1.0;
  const cloth = prep(new THREE.BoxGeometry(W, L, 0.035, 2, 6, 1));
  const p = cloth.attributes.position;
  const ph = rng() * TAU;
  for (let i = 0; i < p.count; i++) {
    const py = p.getY(i), t = (L / 2 - py) / L; // 0 at the bar .. 1 at its foot
    // the swallowtail: its foot's middle cut up
    if (t > 0.99 && Math.abs(p.getX(i)) < 0.05) p.setY(i, py + L * 0.14);
    p.setZ(i, p.getZ(i) + Math.sin(t * 5.5 + ph) * 0.08 * t);
  }
  cloth.translate(x, h - 0.4 - L / 2, z + 0.12);
  carve(cloth, { col: facetCol(CLOTH, 1.35), ao: (px, py) => 0.75 + 0.25 * Math.min(1, py / h) });
  // (it answers the wind, world/hang.js: from the bar down)
  out.push(hangFrom(cloth, h - 0.4, 'cloth'));
  return out;
}

/** A war drum on a timber stand, its heads facing east and west: barrel r 0.85 m, 1.2 m long. */
function buildDrum(rng, x, z, yaw) {
  const out = [];
  const body = prep(new THREE.CylinderGeometry(0.85, 0.85, 1.2, 12, 2));
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), k = 1 + 0.12 * (1 - (y / 0.6) ** 2); // a barrel's belly
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
  }
  body.rotateZ(Math.PI / 2);
  body.translate(0, 1.55, 0);
  carve(body, { col: facetCol([0.2, 0.05, 0.035], 1.3), ao: 1 });
  out.push(body);
  for (const s of [-1, 1]) {
    const head = prep(new THREE.CylinderGeometry(0.8, 0.8, 0.04, 12));
    head.rotateZ(Math.PI / 2);
    head.translate(s * 0.62, 1.55, 0);
    carve(head, { col: facetCol(SKIN, 1.2), ao: 1 });
    out.push(head);
    // the stand: two legs a side, splayed
    for (const f of [-1, 1]) out.push(pole(s * 0.45, 0, f * 0.55, 1.4, 0.07, { tilt: -s * 0.15 }));
  }
  const bar = prep(new THREE.BoxGeometry(1.1, 0.1, 1.3));
  bar.translate(0, 0.78, 0);
  carve(bar, { col: facetCol(WOOD, 1.3), ao: 1 });
  out.push(bar);
  for (const g of out) {
    g.rotateY(yaw);
    g.translate(x, 0, z);
  }
  return out;
}

/** A gong in its timber frame, facing the camera: two posts, a beam, the bronze disc hung between. */
function buildGong(rng, x, z) {
  const out = [pole(x - 1.0, 0, z, 2.9, 0.1), pole(x + 1.0, 0, z, 2.9, 0.1)];
  const beam = prep(new THREE.BoxGeometry(2.6, 0.14, 0.16));
  beam.translate(x, 2.85, z);
  carve(beam, { col: facetCol(WOOD, 1.3), ao: 1 });
  out.push(beam);
  const disc = prep(new THREE.CylinderGeometry(0.72, 0.72, 0.07, 14));
  disc.rotateX(Math.PI / 2 - 0.12);
  disc.translate(x, 1.85, z + 0.05);
  const boss = prep(new THREE.SphereGeometry(0.16, 6, 3, 0, TAU, 0, Math.PI / 2));
  boss.rotateX(Math.PI / 2 - 0.12);
  boss.translate(x, 1.85, z + 0.1);
  for (const g of [disc, boss]) {
    carve(g, { col: facetCol(RING_BRONZE, 1.45), ao: 1 });
    out.push(g);
  }
  for (const s of [-1, 1]) {
    const cord = prep(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 3));
    cord.translate(x + s * 0.45, 2.55, z + 0.03);
    carve(cord, { col: mul(WOOD, 0.8), ao: 1 });
    out.push(cord);
  }
  return out;
}

/** A cairn: four to six flat stones stacked, smallest on top. */
function buildCairn(rng, x, z, h) {
  const out = [];
  let y = 0;
  const n = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const s = (1 - i / (n + 1)) * 0.55 * range(rng, 0.85, 1.1), hh = h / n;
    const g = prep(new THREE.IcosahedronGeometry(s, 0));
    lumpy(g, s * 0.3, 2 / s, rng() * 50);
    g.scale(1, (hh / s) * 0.6, 1);
    g.rotateY(rng() * TAU);
    g.translate(x + range(rng, -0.05, 0.05), y + hh * 0.5, z + range(rng, -0.05, 0.05));
    carve(g, { col: facetCol(mul(BADLAND, 0.9), 1.3), ao: 0.6 + 0.4 * (i / n) });
    out.push(g);
    y += hh;
  }
  return out;
}

/** A timber derrick: three poles leaning in to a head, a boom off it with a hanging rope and block. */
function buildDerrick(rng, x, z, h) {
  const out = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.4, d = h * 0.3;
    const g = prep(new THREE.CylinderGeometry(0.08, 0.12, h * 1.04, 5));
    g.translate(0, (h * 1.04) / 2, 0);
    g.rotateX(-Math.atan2(d, h));
    g.rotateY(-a + Math.PI / 2);
    g.translate(x + Math.cos(a) * d, 0, z + Math.sin(a) * d);
    carve(g, { col: facetCol(WOOD, 1.3), ao: 1 });
    out.push(g);
  }
  const boom = prep(new THREE.CylinderGeometry(0.07, 0.09, h * 0.8, 5));
  boom.rotateZ(-1.05);
  boom.translate(x + h * 0.33, h * 0.86, z);
  carve(boom, { col: facetCol(WOOD, 1.3), ao: 1 });
  out.push(boom);
  const rope = prep(new THREE.CylinderGeometry(0.025, 0.025, h * 0.5, 3));
  rope.translate(x + h * 0.66, h * 0.8, z);
  carve(rope, { col: mul(WOOD, 0.8), ao: 1 });
  // (the rope and its block swing as one on the boom's end, world/hang.js)
  out.push(hangFrom(rope, h * 1.05, 'rope'));
  out.push(hangFrom(stoneBox(rng, x + h * 0.66, h * 0.4, z, 0.9, 0.7, 0.9, { col: CUT }), h * 1.05, 'rope'));
  return out;
}

// ---------------------------------------------------------------- the crown (c): outline, soil, cliffs
/** The crown's rim (c), counter-clockwise from the east side of the south neck: [x, z]. */
const CROWN = [
  [6.5, 21.5], [13, 20.6], [19.6, 18.2], [21.8, 12], [21.2, 1], [22.4, -9.5], [19.8, -18.8], [12, -22.2], [0, -23.6], [-11, -22.8],
  [-20.2, -19.6], [-22.2, -9], [-21.6, 2], [-22.2, 12], [-19.2, 18.6], [-13, 20.6], [-6.5, 21.5], [-6.2, 24.4], [-9.6, 27], [-9.4, 31.4],
  [-5.2, 34], [0, 34.8], [5.2, 34], [9.4, 31.4], [9.6, 27], [6.2, 24.4],
];

/** The crown's rim, each edge cut into steps of ~`step` m and pushed in and out a little (ragged). */
function raggedRim(rng, step = 2.2) {
  const out = [];
  for (let i = 0; i < CROWN.length; i++) {
    const a = CROWN[i], b = CROWN[(i + 1) % CROWN.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(len / step));
    const nx = (b[1] - a[1]) / len, nz = -(b[0] - a[0]) / len; // (outward: the outline runs clockwise on screen)
    for (let k = 0; k < n; k++) {
      const t = k / n, j = k === 0 ? 0 : range(rng, -0.55, 0.55);
      out.push([a[0] + (b[0] - a[0]) * t + nx * j, a[1] + (b[1] - a[1]) * t + nz * j]);
    }
  }
  return out;
}

/** Is (x, z) inside the polygon? */
function inside(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

/** Each point's outward normal on a closed polygon (the mean of its two edges' normals, turned out). */
function normals(poly) {
  const n = poly.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = poly[(i + n - 1) % n], b = poly[(i + 1) % n];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    let nx = dz / l, nz = -dx / l;
    // (whichever way the outline runs: a step out along it leaves the polygon)
    if (inside(poly, poly[i][0] + nx * 0.4, poly[i][1] + nz * 0.4)) {
      nx = -nx;
      nz = -nz;
    }
    out.push([nx, nz]);
  }
  return out;
}

/**
 * The crown's cliffs: from its rim down to y = -drop, in bands that step out as they go down (ledges
 * that catch the light), every rim point its own jitter. Carved; one geometry.
 */
function buildCliffs(rng, rim, drop) {
  const N = normals(rim), n = rim.length;
  const bands = [[0.04, 0], [-0.8, 0.25], [-0.8, 0.9], [-3.5, 1.3], [-3.5, 2.1], [-8, 2.7], [-8, 3.6], [-14, 4.4], [-drop, 6.5]];
  const jit = rim.map(() => bands.map(() => range(rng, -0.45, 0.45)));
  const P = (k, i) => {
    const [y, o] = bands[k], j = k === 0 ? 0 : jit[i % n][k];
    return [rim[i % n][0] + N[i % n][0] * (o + j), y, rim[i % n][1] + N[i % n][1] * (o + j)];
  };
  const pos = [];
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const tri = (A, B, C, hx, hy, hz) => {
    e1.set(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
    e2.set(C[0] - A[0], C[1] - A[1], C[2] - A[2]);
    e1.cross(e2);
    if (e1.x * hx + e1.y * hy + e1.z * hz < 0) pos.push(...A, ...C, ...B);
    else pos.push(...A, ...B, ...C);
  };
  for (let k = 0; k + 1 < bands.length; k++) {
    const flat = bands[k][0] === bands[k + 1][0];
    for (let i = 0; i < n; i++) {
      const hx = flat ? 0 : N[i][0], hz = flat ? 0 : N[i][1], hy = flat ? 1 : 0.2;
      tri(P(k, i), P(k, i + 1), P(k + 1, i + 1), hx, hy, hz);
      tri(P(k, i), P(k + 1, i + 1), P(k + 1, i), hx, hy, hz);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  carve(g, {
    col: (px, py, pz, nx, ny, nz) => mul(BADLAND, 1.2 * (0.78 + 0.4 * hash2(Math.floor(py / 1.4) * 3.1, 2.2)) * (0.5 + 1.1 * hash2(Math.round(nx * 9) + Math.round(ny * 9) * 31, Math.round(nz * 9) + 7))),
    ao: (px, py, pz, nx, ny) => (ny > 0.5 ? 1.1 : 0.6) * (0.45 + 0.55 * Math.max(0, 1 + py / 14)),
  });
  return g;
}

// ---------------------------------------------------------------- the set
export function createSkybreakRing(U, colliders) {
  const OPT = ringOption();
  const LY = LAYOUT[OPT];
  const BF = { x: 0, z: LY.bonfireZ };
  // streams: the ring and the floor's layout; the props; the badlands; the floor's remains (world/floor.js)
  const rng = mulberry32(CONFIG.seed + 4401), pr = mulberry32(CONFIG.seed + 4402), br = mulberry32(CONFIG.seed + 4403), fr = mulberry32(CONFIG.seed + 4404);
  const group = new THREE.Group();
  group.name = 'skybreakRing';
  const stoneGeos = [], slabGeos = [], propGeos = [], treeGeos = [];
  const slabs = [], bare = [], treeSpots = [];
  /** the floor's slabs: { geo, outline, x, z, r, col, kind } (world/floor.js makes them breakable) */
  const floor = [];
  const breakables = [];
  /** braziers: { x, y, z, post (its breakable def) } (the ambience burns them) */
  const braziers = [];
  /** circles nothing else is laid in (props, buttes, the path) */
  const keep = [];
  const free = (x, z, r = 0) => !keep.some((k) => Math.hypot(k.x - x, k.z - z) < k.r + r);

  /** A slab of the floor: drawn in the paving mesh; `walk` it is a breakable slab (else scenery). */
  const addSlab = (s, x, z, col, kind, walk = true) => {
    slabGeos.push(s.geo);
    slabs.push({ x, z, r: s.r, outline: s.outline });
    if (walk) floor.push({ geo: s.geo, outline: s.outline, x, z, r: s.r * 0.87, col, kind });
  };
  /** A standing piece (prop art): chipped, broken, toppled when tall; its rubble on its own stream. */
  const piece = (kind, x, z, r, geos, extra = {}) => {
    const { stub = true, cr = r, mat = 'stone', ...rest } = extra;
    const cs = cr > 0 ? [colliders.add(x, z, cr, 'stone')] : [];
    const rr = Math.max(0.3, r);
    const def = {
      kind, mat, look: 'prop', x, z, r: rr, h: geosHeight(geos), geos, colliders: cs,
      ...(stub ? { broken: { geos: buildRubble(br, x, z, rr * 0.8, { col: mat === 'wood' ? mul(WOOD, 1.4) : mul(BADLAND, 1.1), h: range(br, 0.3, 0.55) }), r: cr > 0 ? rr * 0.6 : 0 } } : {}),
      lift: 0, ...rest,
    };
    breakables.push(def);
    keep.push({ x, z, r: rr + 0.4 });
    return def;
  };

  // ---- the ring: a kerb of long dark stones round the edge, square tiles, an octagon at the middle
  const tc = tileCol(TILE), kc = tileCol(KERB, 2.2), cc = tileCol(CENTRE, 1.2);
  const n = Math.round((2 * HALF) / CELL);
  const at = (i) => -HALF + (i + 0.5) * CELL;
  const g = 0.1; // the joint between tiles
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = at(i), z = at(j);
      const edgeRow = j === 0 || j === n - 1, edgeCol = i === 0 || i === n - 1;
      if (Math.abs(x) < 3 && Math.abs(z) < 3) continue; // (the octagon)
      if (edgeRow || edgeCol) {
        if (edgeRow && edgeCol) addSlab(rectTile(rng, x, z, CELL - g, CELL - g, { top: 0.075, col: kc, tilt: 0.006 }), x, z, kc, 'tile');
        else if (edgeRow && i % 2 === 1) addSlab(rectTile(rng, x + CELL / 2, z, 2 * CELL - g, CELL - g, { top: 0.075, col: kc, tilt: 0.006 }), x + CELL / 2, z, kc, 'tile');
        else if (edgeCol && !edgeRow && j % 2 === 1) addSlab(rectTile(rng, x, z + CELL / 2, CELL - g, 2 * CELL - g, { top: 0.075, col: kc, tilt: 0.006 }), x, z + CELL / 2, kc, 'tile');
        continue;
      }
      const s = rectTile(rng, x + range(rng, -0.03, 0.03), z + range(rng, -0.03, 0.03), CELL - range(rng, 0.09, 0.15), CELL - range(rng, 0.09, 0.15), { top: range(rng, 0.03, 0.045), col: tc });
      addSlab(s, x, z, tc, 'tile');
    }
  }
  {
    // the octagon: an inner plate, eight wedges round it, four corner stones to the square (6 m)
    const R1 = 1.5, R2 = 3 / Math.cos(Math.PI / 8), gap = 0.05;
    const oct = (r, k) => {
      const a = Math.PI / 8 + (k * TAU) / 8;
      return [Math.cos(a) * r, Math.sin(a) * r];
    };
    const inner = [];
    for (let k = 0; k < 8; k++) inner.push(oct(R1 - gap, k));
    addSlab(polySlab(rng, inner, 0, 0, { top: 0.05, col: cc, tilt: 0 }), 0, 0, cc, 'tile');
    for (let k = 0; k < 8; k++) {
      const a0 = oct(R1 + gap, k), a1 = oct(R1 + gap, k + 1), b1 = oct(R2 - gap, k + 1), b0 = oct(R2 - gap, k);
      // (each wedge's corners pulled off the seams by the gap)
      const mx = (a0[0] + a1[0] + b0[0] + b1[0]) / 4, mz = (a0[1] + a1[1] + b0[1] + b1[1]) / 4;
      const sh = (p) => {
        const dx = p[0] - mx, dz = p[1] - mz, l = Math.hypot(dx, dz) || 1;
        return [dx - (dx / l) * gap, dz - (dz / l) * gap];
      };
      addSlab(polySlab(rng, [a0, a1, b1, b0].map(sh), mx, mz, { top: 0.042, col: cc, tilt: 0.008 }), mx, mz, cc, 'tile');
    }
    for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
      const tri = [[sx * 3, sz * 3], [sx * 3, sz * 3 * Math.tan(Math.PI / 8)], [sx * 3 * Math.tan(Math.PI / 8), sz * 3]];
      const mx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, mz = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
      const pts = tri.map(([px, pz]) => [(px - mx) * 0.9, (pz - mz) * 0.9]);
      addSlab(polySlab(rng, pts, mx, mz, { top: 0.04, col: tc, tilt: 0.008 }), mx, mz, tc, 'tile');
    }
  }

  // ---- the corner posts and their braziers (the south ones low: nothing tall south of the fight)
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = sx * (HALF + 0.95), z = sz * (HALF + 0.95), h = sz < 0 ? 4.4 : 2.7;
    const P = buildRingPost(pr, x, z, { h, yaw: range(pr, -0.08, 0.08) });
    const def = piece('post', x, z, 0.75, [...P.stone, ...P.bronze], { lift: 2 });
    braziers.push({ x, y: P.fireY, z, def, light: null, piece: undefined, acc: 0 });
  }

  // ---- the way in: a path of flagstones from the bonfire up to the ring's south edge
  const pathX = (z) => (OPT === 'c' ? 0 : 0.9 * Math.sin((z - HALF) * 0.21));
  for (let z = HALF + 1.0; z < BF.z - 1.6; z += range(rng, 0.95, 1.3)) {
    const x = pathX(z) + range(rng, -0.6, 0.6), w = range(rng, 0.9, 1.5), d = range(rng, 0.7, 1.15);
    const s = buildFlagstone(rng, x, z, w, d, rng() * TAU);
    addSlab({ geo: s.geo, outline: s.outline, r: Math.max(w, d) * 0.6 }, x, z, (px, py, pz) => mul(STONE, 0.6 + 0.4 * fbm2(px * 2, pz * 2, 2)), 'flagstone');
  }
  keep.push({ x: pathX(HALF + 8), z: HALF + 8, r: 3.2 }, { x: pathX(BF.z - 6), z: BF.z - 6, r: 3.2 });
  propGeos.push(...buildBonfire(rng, BF.x, BF.z));
  colliders.add(BF.x, BF.z, 0.75, 'bonfire');
  bare.push({ x: BF.x, z: BF.z, r: 2.4 });
  keep.push({ x: BF.x, z: BF.z, r: 3.4 });

  // ---- the buttes: two-stage (BREAK.colossus): the top stands on the foot; blows on either wear the
  // top down, and it comes off (topples outward from its cut where it can fall, else it bursts where it
  // stands: c, whose buttes rise out of the depths). The foot stays (it only chips)
  const tops = [];
  for (const [x, z, h, r, cut, below = 0] of LY.buttes) {
    const B = buildButte(br, x, z, { h, r, cut, below });
    const deep = below > 0;
    const top = {
      kind: 'butteTop', mat: 'stone', look: 'prop', x, z, r: r * 0.85, y0: B.cut, h: h - B.cut, geos: B.upper, colliders: [],
      hp: BUTTE.top, weight: 2.2, topples: !deep, cover: false, lift: 0, fallOff: r * 0.4, fallT: 1.6, blocks: deep ? 0 : 4, wreck: !deep,
    };
    const cs = [colliders.add(x, z, r * 0.88, 'stone')];
    breakables.push(top, { kind: 'butte', mat: 'stone', look: 'prop', x, z, r: r * 0.92, h: B.cut, geos: B.lower, colliders: cs, hp: Infinity, topples: false, cover: true, lift: 0, holds: top, wreck: false });
    tops.push(top);
    keep.push({ x, z, r: r + 1.2 });
    bare.push({ x, z, r: r + 0.6 });
  }
  for (const [x, z, h, r] of LY.hoodoos) {
    const lean = range(br, 0.03, 0.12), yaw = Math.atan2(x, z);
    piece('hoodoo', x, z, r, [buildHoodoo(br, x, z, { h, r, lean, yaw })], { cr: r * 0.9, hp: BUTTE.hoodoo, weight: 1.6, cover: true });
  }

  // ---------------------------------------------------------------- per arena
  if (OPT === 'a') {
    // ---- banners east and west, the war drum and the gong, the judges' dais to the north
    for (const sx of [-1, 1]) {
      for (const z of [-1.5, 4.5]) {
        const x = sx * (HALF + 2.8);
        piece('banner', x, z, 0.3, buildBanner(pr, x, z, 5.6), { mat: 'wood', cr: 0.25, stub: false, lift: 1, cover: false, hp: BUTTE.banner });
      }
    }
    piece('drum', 17.8, -15.8, 1.15, buildDrum(pr, 17.8, -15.8, -0.35), { mat: 'wood', cr: 1.0, stub: false, lift: 1, topples: false, hp: BUTTE.drum });
    piece('gong', -18.4, -16.4, 1.0, buildGong(pr, -18.4, -16.4), { mat: 'metal', cr: 0.6, stub: false, hp: Infinity, topples: false });
    {
      const z = -HALF - 4.6, geos = [stoneBox(pr, 0, 0, z, 10, 0.32, 3.4, { col: KERB, lump: 0.02 }), stoneBox(pr, 0, 0.32, z - 0.35, 8.4, 0.3, 2.4, { col: KERB, lump: 0.02 })];
      for (const x of [-2.6, 0, 2.6]) geos.push(stoneBox(pr, x, 0.62, z - 0.7, 1.0, 0.55, 0.7, { col: CENTRE, lump: 0.03 }));
      const cs = [-4.2, -1.4, 1.4, 4.2].map((x) => colliders.add(x, z, 1.6, 'stone'));
      breakables.push({ kind: 'dais', mat: 'stone', look: 'prop', x: 0, z, r: 5, h: geosHeight(geos), geos, colliders: cs, hp: BUTTE.dais, topples: false, cover: false, lift: 0, broken: { geos: buildRubble(br, 0, z, 2.6, { col: KERB, h: 0.35 }) } });
      keep.push({ x: 0, z, r: 5.8 });
    }
    // ---- the lake bed: cracked plates of dry clay round the ring (scenery past 24 m)
    const cl = tileCol(CLAY, 1.1);
    const dx = 1.72, dz = dx * 0.866;
    for (let j = -22; j <= 22; j++) {
      for (let i = -22; i <= 22; i++) {
        const x = i * dx + (j & 1 ? dx / 2 : 0) + range(rng, -0.12, 0.12), z = j * dz + range(rng, -0.12, 0.12);
        const r = Math.hypot(x, z);
        if (r > 34 || (Math.abs(x) < HALF + 1.0 && Math.abs(z) < HALF + 1.0)) continue;
        if (!free(x, z, 0.6) || rng() < 0.2) continue;
        const pts = [];
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU + Math.PI / 6 + range(rng, -0.18, 0.18), q = dx * 0.55 * range(rng, 0.78, 0.95);
          pts.push([Math.cos(a) * q, Math.sin(a) * q]);
        }
        addSlab(polySlab(rng, pts, x, z, { top: 0.025, inset: 0.05, drop: 0.02, bottom: -0.06, col: cl, tilt: 0.02 }), x, z, cl, 'mud', r < 24);
      }
    }
    // ---- boulders on the flats and a few dead trees (the near ones break)
    for (let i = 0, k = 0; i < 400 && k < 12; i++) {
      const a = br() * TAU, r = range(br, 21, 38), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (z > 26 || !free(x, z, 1.5)) continue;
      const s = range(br, 0.6, 1.4);
      const geo = buildBoulder(br, x, z, s);
      piece('boulder', x, z, s * 0.85, [geo], { stub: false, topples: false, lift: 1 });
      k++;
    }
  } else if (OPT === 'b') {
    // ---- the quarry: three terraces of cut stone stepping up away from the ring (E, W, N), one low
    // course along the south either side of the way in; its floor of rough-cut plates
    const T0 = HALF + 3.0, D = 2.4, H = 1.05;
    const course = (tier) => {
      const off = T0 + tier * D, top = (tier + 1) * H, out = [];
      // along each side: blocks ~2.6 m long, their faces turned to the ring
      const sides = [
        { ax: 'x', s: -1, from: -off, to: off }, { ax: 'x', s: 1, from: -off, to: off }, { ax: 'z', s: -1, from: -off - D, to: off + D },
      ];
      if (tier === 0) sides.push({ ax: 'z', s: 1, from: -off - D, to: off + D, gap: 7.5 });
      for (const S of sides) {
        let t = S.from;
        while (t < S.to - 0.2) {
          const len = Math.min(S.to - t, range(rng, 2.2, 3.0)), mid = t + len / 2;
          t += len;
          if (S.gap && Math.abs(mid) < S.gap) continue;
          const c = off + D / 2;
          const x = S.ax === 'x' ? S.s * c : mid, z = S.ax === 'x' ? mid : S.s * c;
          const w = S.ax === 'x' ? D - 0.08 : len - 0.08, d = S.ax === 'x' ? len - 0.08 : D - 0.08;
          out.push({ x, z, w, d, top: top * range(rng, 0.93, 1.04), side: S });
        }
      }
      return out;
    };
    for (let tier = 0; tier < 3; tier++) {
      for (const b of course(tier)) {
        if (LY.buttes.some(([bx, bz, , br2]) => Math.hypot(b.x - bx, b.z - bz) < br2 + 0.6)) continue; // (the butte stands there)
        const geo = stoneBox(rng, b.x, 0, b.z, b.w, b.top, b.d, { col: CUT, k: 0.75, lump: 0.05 });
        if (tier === 0) {
          // the lowest course breaks (the hero reaches it, his blows and the boss's beam do)
          const r = Math.min(b.w, b.d) * 0.5;
          const cs = [];
          const len = Math.max(b.w, b.d), ax = b.w > b.d;
          for (let u = -len / 2 + r; u <= len / 2 - r + 1e-3; u += Math.max(0.6, (len - 2 * r) / 2)) cs.push(colliders.add(b.x + (ax ? u : 0), b.z + (ax ? 0 : u), r * 1.05, 'stone'));
          breakables.push({ kind: 'terrace', mat: 'stone', look: 'prop', x: b.x, z: b.z, r: len * 0.5, h: b.top, geos: [geo], colliders: cs, hp: BUTTE.terrace, topples: false, cover: true, lift: 0, broken: { geos: buildRubble(br, b.x, b.z, Math.min(1.1, len * 0.35), { col: CUT, h: 0.4 }) } });
        } else {
          stoneGeos.push(geo);
          if (tier === 1) colliders.add(b.x, b.z, Math.min(b.w, b.d) * 0.5, 'stone');
        }
      }
    }
    keep.push({ x: 0, z: 0, r: 40 }); // (nothing else laid in the quarry)
    // its floor: rough-cut plates between the ring and the lowest course
    const qc = tileCol(CUT, 1.3);
    for (let z = -T0 + 0.7; z < T0 + 6; z += 1.3) {
      for (let x = -T0 + 0.7; x < T0 - 0.6; x += range(rng, 1.4, 1.9)) {
        if (Math.abs(x) < HALF + 0.4 && Math.abs(z) < HALF + 0.4) continue;
        if (z > T0 - 0.5 && Math.abs(x) > 7.2) continue;
        if (z > HALF + 0.4 && Math.abs(x - pathX(z)) < 1.4) continue;
        if (rng() < 0.12) continue;
        const w = range(rng, 1.1, 1.5), d = range(rng, 0.95, 1.15);
        addSlab(rectTile(rng, x, z, w, d, { top: 0.03, col: qc, tilt: 0.02 }), x, z, qc, 'flagstone');
      }
    }
    // stacks of cut blocks in the quarry's corners, the derrick on the north-west terrace
    for (const [x, z, n2] of [[-16.9, 16.7, 2], [16.8, 16.9, 3], [-16.8, -16.6, 3], [16.6, -16.8, 2]]) {
      const geos = [];
      for (let i = 0; i < n2; i++) geos.push(stoneBox(pr, x + range(pr, -0.15, 0.15), i * 0.55, z + range(pr, -0.15, 0.15), 1.3 - i * 0.15, 0.55, 0.9, { col: CUT, yaw: range(pr, -0.3, 0.3) }));
      breakables.push({ kind: 'blocks', mat: 'stone', look: 'prop', x, z, r: 0.75, h: geosHeight(geos), geos, colliders: [colliders.add(x, z, 0.75, 'stone')], topples: false, lift: 2, broken: { geos: buildRubble(br, x, z, 0.6, { col: CUT, h: 0.35 }) } });
    }
    piece('derrick', -24.5, -23.5, 1.2, buildDerrick(pr, -24.5, -23.5, 7.5), { mat: 'wood', cr: 1.0, stub: false, cover: false });
    for (const sx of [-1, 1]) {
      for (const z of [-9, 1]) {
        const x = sx * (HALF + 2.3);
        piece('banner', x, z, 0.3, buildBanner(pr, x, z, 5.4), { mat: 'wood', cr: 0.25, stub: false, lift: 1, cover: false, hp: BUTTE.banner });
      }
    }
  } else {
    // ---- the crown: its own soil on its outline, cliffs into the haze, colliders along the rim
    const rim = raggedRim(rng);
    const shape = new THREE.Shape(rim.map(([x, z]) => new THREE.Vector2(x, -z)));
    const soil = createGround(U);
    soil.geometry.dispose();
    soil.geometry = new THREE.ShapeGeometry(shape, 1);
    soil.geometry.rotateX(-Math.PI / 2);
    soil.name = 'crownSoil';
    group.userData.soil = soil; // (added after markCaster: the soil casts no shadow, as the ground does not)
    stoneGeos.push(buildCliffs(rng, rim, CROWN_DROP + 2));
    const N = normals(rim);
    for (let i = 0; i < rim.length; i++) {
      const a = rim[i], b = rim[(i + 1) % rim.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.max(1, Math.round(len / 1.2));
      for (let k = 0; k < m; k++) {
        const t = k / m, nx = N[i][0] * (1 - t) + N[(i + 1) % rim.length][0] * t, nz = N[i][1] * (1 - t) + N[(i + 1) % rim.length][1] * t;
        colliders.add(a[0] + (b[0] - a[0]) * t - nx * 0.7, a[1] + (b[1] - a[1]) * t - nz * 0.7, 0.85, 'stone');
      }
    }
    // a lip of broken rock along the rim (scenery: stones knee high and lower)
    for (let i = 0; i < rim.length; i++) {
      if (br() < 0.45) continue;
      const [x, z] = rim[i], s = range(br, 0.35, 0.8);
      stoneGeos.push(buildBoulder(br, x - N[i][0] * 0.5, z - N[i][1] * 0.5, s));
    }
    // rock spires rising out of the depths past the rim (east, west and north; none to the south)
    for (let i = 0; i < rim.length; i++) {
      const [x, z] = rim[i];
      if (z > 14 || hash2(i * 2.9, 4.1) < 0.78) continue;
      const out = range(br, 3, 7.5), h = range(br, 3, 9.5) + (z < -10 ? 3 : 0), r = range(br, 0.9, 1.7);
      const sx = x + N[i][0] * out, sz = z + N[i][1] * out;
      const geo = buildHoodoo(br, sx, sz, { h, r, below: CROWN_DROP + 2, lean: range(br, 0.04, 0.16), yaw: Math.atan2(N[i][0], N[i][1]) });
      breakables.push({ kind: 'spire', mat: 'stone', look: 'prop', x: sx, z: sz, r, h, geos: [geo], colliders: [], hp: BUTTE.hoodoo, topples: false, cover: false, lift: 0, wreck: false });
    }
    // cairns and banners on the crown
    for (const [x, z, h] of [[17.6, 8.5, 1.6], [-17.8, -4, 1.9], [-16.5, 15.2, 1.4], [15.8, -17.4, 2.0]]) piece('cairn', x, z, 0.55, buildCairn(pr, x, z, h), { cr: 0.5, stub: false, topples: false, lift: 1 });
    for (const sx of [-1, 1]) {
      for (const z of [-8, 2]) {
        const x = sx * (HALF + 2.6);
        piece('banner', x, z, 0.3, buildBanner(pr, x, z, 5.4), { mat: 'wood', cr: 0.25, stub: false, lift: 1, cover: false, hp: BUTTE.banner });
      }
    }
    group.userData.rim = rim;
  }
  // ---- dead trees on the flats (a and b): the house's screen grid; the near ones break
  if (OPT !== 'c') {
    for (let i = 0, k = 0; i < 600 && k < 9; i++) {
      const a = br() * TAU, r = range(br, 26, 46), x = Math.cos(a) * r, z = Math.sin(a) * r + 4;
      if (!free(x, z, 2.5) || (z > 6 && Math.abs(x) < 26)) continue; // (nothing tall on the near side)
      const s = range(br, 0.75, 1.15), geos = buildDeadTree(br, x, z, s);
      for (const geo of geos) {
        const col = geo.attributes.aCol;
        if (col) for (let q = 0; q < col.count; q++) col.setXYZ(q, col.getX(q) * 0.7, col.getY(q) * 0.6, col.getZ(q) * 0.55);
      }
      treeSpots.push({ x, z, r: 2.2 * s });
      keep.push({ x, z, r: 2.5 });
      const c = colliders.add(x, z, 0.4 * s, 'trunk');
      if (Math.hypot(x, z) < 40) breakables.push({ kind: 'deadTree', mat: 'wood', look: 'grid', x, z, r: 0.4 * s, h: geosHeight(geos), geos, colliders: [c], broken: { geos: buildStump(br, x, z, s), r: 0.34 * s }, lift: 1 });
      else treeGeos.push(...geos);
      k++;
    }
  }

  // ---- meshes
  const mat = createAsciiObjectMaterial(U, { fadeNearPlayer: true, side: THREE.DoubleSide });
  const stoneMat = createPropArtMaterial(U, { fadeNearPlayer: true, gain: 0.92 });
  const slabMat = createCarvedGlyphMaterial(U, { ...SLAB_LOOK, ...PAVING_LOOK, viewPitch: CONFIG.camera.pitch });
  const add = (geos, m, name) => {
    if (!geos.length) return null;
    const mesh = new THREE.Mesh(mergeGeometries(geos), m);
    mesh.name = name;
    group.add(mesh);
    return mesh;
  };
  add(treeGeos, mat, 'trees');
  add(propGeos, mat, 'props');
  add(stoneGeos, stoneMat, 'stones');
  const slabMesh = add(slabGeos, slabMat, 'paving');
  markCaster(group);
  if (group.userData.soil) group.add(group.userData.soil);
  // the floor breaks (world/floor.js): every tile, kerb stone and plate a breakable 'range' piece of the
  // paving mesh; the cracked and broken looks in two more meshes, hidden until first used
  breakables.push(...breakableFloor({ slabs: floor, slabGeos, slabMesh, mat: slabMat, rng: fr, group, earth: EARTH }).defs);

  return {
    group, treeSpots, bare, slabs, nest: { x: RING.wait.x, z: RING.wait.z }, bonfire: { x: BF.x, z: BF.z },
    material: mat, stoneMaterial: stoneMat, slabMaterial: slabMat,
    breakables,
    option: OPT,
    groundY: LY.groundY,
    tops, // (the buttes' tops: the tests and the beam's measures read them)
    scarInk: [0.3, 0.2, 0.12], // (the stage pass: cracks of pale dust: dark ones vanished in the dimmed paving)
    // dry ground: none on the ring, thin short dry tufts on the flats (none past the crown's rim)
    grass: {
      ash: 0.55,
      height: 0.5,
      density: (x, z) => {
        if (Math.abs(x) < HALF + 0.8 && Math.abs(z) < HALF + 0.8) return 0;
        if (OPT === 'c' && !inside(CROWN, x, z)) return 0;
        if (OPT === 'b' && Math.abs(x) < HALF + 10.5 && z > -HALF - 10.5 && z < HALF + 3.2) return 0;
        const r = Math.hypot(x, z);
        return (0.06 + 0.16 * fbm2(x * 0.09 + 5, z * 0.09 - 2, 2)) * (1 - smooth(40, 52, r));
      },
    },
    floorCarry: mul(TILE, 1.4), // (a tile torn up, in his hands)
    sky: { ...PALETTE[0], moonDir: PALETTE[0].dir, moonColor: PALETTE[0].moon },
    ambience: makeAmbience(braziers, { haze: OPT === 'c', floor: slabMat }),
  };
}

// ---------------------------------------------------------------- tuning (content is data)
/** What the arena's pieces are worth, in POWER units (breakTuning.js's scale: 1 fells a tree). */
export const BUTTE = Object.freeze({
  // a butte's top: a great beam's sweep takes it (1.15 x its power a tick on stone, BLAST); the hero's
  // blows (0.12 - 0.5) need dozens. The foot only chips
  top: 4.2,
  hoodoo: 2.6,
  banner: 0.7,
  drum: 1.2,
  dais: 5,
  terrace: 2.4,
});

/**
 * The light by form (ambience.update eases toward the form's): [0] a clear dusk (warm, low from the
 * west, long shadows), [1] golden ascension (warmer, higher, brighter), [2] the thunderstorm (cold and
 * dark, the moon high behind cloud). moon / ambient / fog colours (linear), the light's way, the fog.
 */
const PALETTE = [
  { moon: [0.98, 0.6, 0.38], dir: [-0.82, 0.46, 0.3], ambient: [0.1, 0.072, 0.07], fogColor: [0.026, 0.014, 0.013], fogNear: 32, fogFar: 64 },
  { moon: [1.1, 0.82, 0.38], dir: [-0.62, 0.58, 0.3], ambient: [0.12, 0.088, 0.046], fogColor: [0.034, 0.022, 0.009], fogNear: 32, fogFar: 64 },
  { moon: [0.4, 0.48, 0.68], dir: [-0.3, 0.88, 0.36], ambient: [0.045, 0.052, 0.075], fogColor: [0.006, 0.008, 0.012], fogNear: 26, fogFar: 56 },
];
/** The weather's numbers: lightning, dust, motes, rain. */
const WEATHER = Object.freeze({
  ease: 0.9, // 1/s toward a new form's light (a transformation takes ~2 s)
  bolt: Object.freeze({ every: [2.4, 6.5], moon: [1.5, 1.6, 1.95], ambient: [0.2, 0.21, 0.27], decay: 14, double: 0.45 }),
  flareGold: Object.freeze({ moon: [1.8, 1.3, 0.55], ambient: [0.2, 0.15, 0.06] }),
  dust: Object.freeze([9, 12, 26]), // a second, by form
  motes: 14, // golden motes round him a second (form 2)
  rain: 90, // streaks a second (form 3)
  haze: 5, // c: strokes of haze a second in the depths round the crown
  glow: Object.freeze({ color: [1.0, 0.72, 0.25], intensity: 1.3, radius: 9 }), // the light round him in form 2
  brazier: Object.freeze({ rate: 12, light: [1.0, 0.5, 0.18], intensity: 1.4, radius: 6 }),
});

// a brazier flame's reused fire-field record, and the particles' (no allocation per spawn)
const flameBlob = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.5, size: 0.6, sizeEnd: 0.2, heat: 0.45, heatEnd: 0, drag: 1.2, gravity: 0, kind: 'fire' };
const part = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, size: 0.15, sizeEnd: 0.1, glyph: '.', color: [1, 1, 1], colorEnd: [0, 0, 0], alpha: 1, alphaEnd: 0, drag: 0, flicker: 0, spin: 0, rot: 0, gravity: 0 };
const DUST = [0.3, 0.24, 0.19], DUST_END = [0.12, 0.09, 0.07];
const GOLD = [2.2, 1.5, 0.45], GOLD_END = [0.5, 0.28, 0.05];
const RAIN = [0.48, 0.54, 0.68], RAIN_END = [0.2, 0.22, 0.3];
const STORM_DUST = [0.16, 0.16, 0.18];
const HAZE = [0.2, 0.13, 0.11];

/**
 * The ring's weather (atmosphere.js runs it instead of the fireflies / mist / leaves): the light by
 * the boss's form, lightning, wind-blown dust, golden motes, rain, the braziers' flames and lights.
 * Its own random stream (never Math.random: the seeded sims replay the AI from it).
 */
function makeAmbience(braziers, { haze = false, floor = null } = {}) {
  let seed = 0x2b7e1516;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const st = {
    w: [1, 0, 0], // the blend of the three palettes shown now
    phase: 1,
    flash: 0, // the lightning / flare flash (0..1+)
    gold: 0, // the flash's hue: 1 gold (a flare before the storm), 0 cold white
    next: 4, // s to the next bolt (form 3)
    again: -1, // a bolt's second flicker
    dim: 0, dimWant: 0, dimHold: 0,
    dust: 0, motes: 0, rain: 0, haze: 0,
    glow: null,
  };
  const cur = { moon: [0, 0, 0], dir: [0, 0, 0], ambient: [0, 0, 0], fogColor: [0, 0, 0], fogNear: 0, fogFar: 0 };
  const blend = () => {
    const [a, b, c] = st.w;
    for (const k of ['moon', 'dir', 'ambient', 'fogColor']) for (let i = 0; i < 3; i++) cur[k][i] = PALETTE[0][k][i] * a + PALETTE[1][k][i] * b + PALETTE[2][k][i] * c;
    cur.fogNear = PALETTE[0].fogNear * a + PALETTE[1].fogNear * b + PALETTE[2].fogNear * c;
    cur.fogFar = PALETTE[0].fogFar * a + PALETTE[1].fogFar * b + PALETTE[2].fogFar * c;
  };
  // far: dry lightning far off before the fight (the living world's weather, world/life/weather.js:
  // weather.flash, ~0.1 at most): the sky's ambient and fog flicker a little toward the storm's bolt
  const write = (U, far = 0, F = null) => {
    if (!U?.uMoonColor?.value) return;
    const f = st.flash, d = 1 - 0.75 * st.dim;
    const B = WEATHER.bolt, G = WEATHER.flareGold;
    const fm = st.gold > 0.5 ? G.moon : B.moon, fa = st.gold > 0.5 ? G.ambient : B.ambient;
    U.uMoonColor.value.setRGB(cur.moon[0] * d + fm[0] * f, cur.moon[1] * d + fm[1] * f, cur.moon[2] * d + fm[2] * f);
    U.uAmbient.value.setRGB(cur.ambient[0] * d + fa[0] * f, cur.ambient[1] * d + fa[1] * f, cur.ambient[2] * d + fa[2] * f);
    U.uFogColor?.value?.setRGB(cur.fogColor[0] * d + 0.02 * f, cur.fogColor[1] * d + 0.022 * f, cur.fogColor[2] * d + 0.028 * f);
    if (far > 0 && F?.fog && F.ambient) {
      // (the weather's far lightning, weatherTuning.js ring.bolts: the far side of the sky, a breath of ambient)
      const a = U.uAmbient.value, c = U.uFogColor?.value;
      a.setRGB(a.r + F.ambient[0] * far, a.g + F.ambient[1] * far, a.b + F.ambient[2] * far);
      c?.setRGB(c.r + F.fog[0] * far, c.g + F.fog[1] * far, c.b + F.fog[2] * far);
    }
    U.uMoonDir?.value?.set(cur.dir[0], cur.dir[1], cur.dir[2]).normalize();
    if (U.uFogNear) U.uFogNear.value = cur.fogNear;
    if (U.uFogFar) U.uFogFar.value = cur.fogFar;
    // (the floor's brightness by form: FLOOR_GAIN)
    const g = floor?.uniforms?.uGain;
    if (g) g.value = FLOOR_GAIN[0] * st.w[0] + FLOOR_GAIN[1] * st.w[1] + FLOOR_GAIN[2] * st.w[2];
  };
  const spawn = (fx) => {
    fx?.spawn?.(part);
  };
  return {
    /** the light now: { w: [dusk, gold, storm], flash, dim } (the Lab, the tests) */
    get state() {
      return { w: st.w.slice(), flash: st.flash, dim: st.dim, phase: st.phase };
    },
    setup(game) {
      blend();
      write(game.U);
      const W = WEATHER.brazier;
      for (const b of braziers) b.light = game.lights?.add?.({ x: b.x, y: b.y + 0.3, z: b.z, color: W.light, intensity: W.intensity, radius: W.radius, flicker: 0.5 }) ?? null;
      const G = WEATHER.glow;
      st.glow = game.lights?.add?.({ x: 0, y: 1.6, z: 0, color: G.color, intensity: 0, radius: G.radius, flicker: 0.25 }) ?? null;
    },
    setVisible() {},
    /** A flash of the form's light (k 0..1): a transformation, a great blow. Gold before the storm, cold white in it. */
    flare(k = 1) {
      const v = Math.min(1.5, Math.max(0, Number(k) || 0));
      if (v <= st.flash) return;
      st.flash = v;
      st.gold = st.phase >= 3 ? 0 : 1;
    },
    /** The ring's light pulled down by k (0..1) while it is called (each frame; it lets go 0.2 s after). */
    dim(k = 1) {
      const v = Number(k);
      st.dimWant = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
      st.dimHold = 0.2;
    },
    update(dt, game) {
      if (!(dt > 0)) return;
      const boss = game.dragon;
      const ph = Math.min(3, Math.max(1, Math.round(Number(boss?.phase) || 1)));
      const dead = boss?.state === 'dead';
      const want = dead ? 1 : ph;
      if (want < st.phase) {
        // a reset (or his fall): back to the dusk; a reset snaps, his fall eases ("the storm breaks")
        if (!dead) {
          st.w[0] = 1;
          st.w[1] = st.w[2] = 0;
          st.flash = 0;
          st.dim = st.dimWant = st.dimHold = 0; // (a reset in the great beam's charge: the light back at once)
        }
      }
      st.phase = want;
      const k = 1 - Math.exp(-dt * WEATHER.ease);
      for (let i = 0; i < 3; i++) st.w[i] += ((i === want - 1 ? 1 : 0) - st.w[i]) * k;
      // the dim (the great beam's charge)
      if (st.dimHold > 0) st.dimHold -= dt;
      else st.dimWant = 0;
      st.dim += (st.dimWant - st.dim) * (1 - Math.exp(-dt * 4));
      // lightning in the storm: at random, a flash for a frame or two, now and then a second flicker
      const B = WEATHER.bolt;
      if (st.w[2] > 0.6 && !dead) {
        st.next -= dt;
        if (st.next <= 0) {
          st.flash = Math.max(st.flash, 0.8 + 0.4 * rnd());
          st.gold = 0;
          st.next = B.every[0] + rnd() * (B.every[1] - B.every[0]);
          st.again = rnd() < B.double ? 0.09 + 0.06 * rnd() : -1;
        }
        if (st.again > 0) {
          st.again -= dt;
          if (st.again <= 0) st.flash = Math.max(st.flash, 0.6 + 0.3 * rnd());
        }
      }
      st.flash = st.flash > 0.004 ? st.flash * Math.exp(-dt * B.decay) : 0;
      blend();
      // (the living world, world/life/: its far lightning, and its wind's way for the dust and the rain)
      const life = game.world?.life;
      const far = life?.on?.('weather') ? Number(life.weather?.flash) || 0 : 0;
      const wnd = life?.on?.('wind') && life.wind?.speed > 0 && Number.isFinite(life.wind.dirX + life.wind.dirZ) ? life.wind : null;
      const wx = wnd ? wnd.dirX : 1, wz = wnd ? wnd.dirZ : 0;
      write(game.U, far, life?.weather?.tune?.bolts);
      // the glow round him in his golden form
      if (st.glow) {
        const G = WEATHER.glow, p = boss?.position;
        if (p) st.glow.set(p.x, 1.6, p.z);
        st.glow.intensity = G.intensity * st.w[1] * (dead ? 0 : 1);
      }
      // the braziers: flames in the fire field while their post stands
      const D = game.world?.destructibles, fire = game.fx?.fire;
      const BW = WEATHER.brazier;
      for (const b of braziers) {
        if (b.piece === undefined && D?.list) b.piece = D.list.find((o) => o.def === b.def) ?? null;
        const up = !b.piece || b.piece.state === 0;
        if (b.light) b.light.intensity = up ? BW.intensity * (1 - 0.6 * st.dim) : 0;
        if (!up || !fire) continue;
        b.acc += dt * BW.rate;
        while (b.acc >= 1) {
          b.acc -= 1;
          const a = rnd() * TAU, r = rnd() * 0.25, hot = rnd();
          const q = flameBlob;
          q.x = b.x + Math.cos(a) * r;
          q.y = b.y + rnd() * 0.15;
          q.z = b.z + Math.sin(a) * r;
          q.vx = (rnd() - 0.5) * 0.2 + 0.25 * st.w[2];
          q.vy = 0.8 + rnd() * 0.7;
          q.vz = (rnd() - 0.5) * 0.2;
          q.life = 0.35 + rnd() * 0.35;
          q.size = 0.5 + hot * 0.25;
          q.heat = 0.42 + hot * 0.12;
          fire.spawn(q);
        }
      }
      const fxA = game.fx?.alpha, fxB = game.fx?.add, f = game.U?.uFocus?.value;
      if (!f) return;
      const storm = st.w[2], gold = st.w[1];
      // wind-blown dust low over the ground (from the west; harder in the storm)
      const DR = WEATHER.dust;
      st.dust += dt * (DR[0] * st.w[0] + DR[1] * gold + DR[2] * storm);
      while (st.dust >= 1) {
        st.dust -= 1;
        const wind = 1.2 + 4.5 * storm;
        part.x = f.x - 22 + rnd() * 30;
        part.z = f.z + (rnd() - 0.5) * 30 - 3;
        part.y = 0.15 + rnd() * (0.8 + 1.6 * storm);
        part.vx = wind * (0.7 + 0.6 * rnd());
        part.vy = (rnd() - 0.4) * 0.3;
        part.vz = (rnd() - 0.5) * 0.4;
        if (wnd) {
          // the living world's wind blows: the same draw, turned to its way (upwind of the view, along it)
          const ox = part.x - f.x, oz = part.z - f.z + 3, ax = part.vx, az = part.vz;
          part.x = f.x + ox * wx - oz * wz;
          part.z = f.z - 3 + ox * wz + oz * wx;
          part.vx = ax * wx - az * wz;
          part.vz = ax * wz + az * wx;
        }
        part.life = 2.5 + rnd() * 3;
        part.size = 0.13 + rnd() * 0.12;
        part.sizeEnd = 0.08;
        part.glyph = storm > 0.5 ? "-~.'" : ".,'`";
        part.color = storm > 0.5 ? STORM_DUST : DUST;
        part.colorEnd = DUST_END;
        part.alpha = 0.7;
        part.alphaEnd = 0;
        part.drag = 0.1;
        part.flicker = 0;
        part.spin = (rnd() - 0.5) * 2;
        part.rot = 0;
        part.gravity = 0;
        spawn(fxA);
      }
      // c: haze drifting in the depths below the crown's rim (wide faint strokes)
      if (haze) {
        st.haze += dt * WEATHER.haze;
        while (st.haze >= 1) {
          st.haze -= 1;
          const x = f.x + (rnd() - 0.5) * 56, z = f.z + (rnd() - 0.5) * 40 - 4;
          if (inside(CROWN, x, z)) continue;
          part.x = x;
          part.z = z;
          part.y = -2 - rnd() * 7;
          part.vx = 0.4 + 1.2 * storm + rnd() * 0.3;
          part.vy = 0;
          part.vz = (rnd() - 0.5) * 0.2;
          part.life = 7 + rnd() * 5;
          part.size = 2.4 + rnd() * 2;
          part.sizeEnd = 4.5;
          part.glyph = '~-';
          part.color = HAZE;
          part.colorEnd = HAZE;
          part.alpha = 0.09;
          part.alphaEnd = 0;
          part.drag = 0;
          part.flicker = 0;
          part.spin = 0;
          part.rot = (rnd() - 0.5) * 0.15;
          part.gravity = 0;
          spawn(fxA);
        }
      }
      // golden motes rising round him (form 2)
      const p = boss?.position;
      if (p && gold > 0.05 && !dead) {
        st.motes += dt * WEATHER.motes * gold;
        while (st.motes >= 1) {
          st.motes -= 1;
          const a = rnd() * TAU, r = 1.5 + rnd() * 7;
          part.x = p.x + Math.cos(a) * r;
          part.z = p.z + Math.sin(a) * r;
          part.y = 0.2 + rnd() * 1.2;
          part.vx = (rnd() - 0.5) * 0.3;
          part.vy = 0.4 + rnd() * 0.6;
          part.vz = (rnd() - 0.5) * 0.3;
          part.life = 2 + rnd() * 2;
          part.size = 0.12;
          part.sizeEnd = 0.05;
          part.glyph = ".'*";
          part.color = GOLD;
          part.colorEnd = GOLD_END;
          part.alpha = 1;
          part.alphaEnd = 0;
          part.drag = 0.3;
          part.flicker = 0.5;
          part.spin = 0;
          part.gravity = 0;
          spawn(fxB);
        }
      }
      // rain in the storm: streaks slanting with the wind
      if (storm > 0.3) {
        st.rain += dt * WEATHER.rain * (storm - 0.3) / 0.7;
        while (st.rain >= 1) {
          st.rain -= 1;
          part.x = f.x + (rnd() - 0.5) * 40 - 3;
          part.z = f.z + (rnd() - 0.5) * 30 - 3;
          part.y = 5 + rnd() * 4;
          part.vx = wnd ? 3.2 * wx - 0.4 * wz : 3.2;
          part.vy = -14 - rnd() * 4;
          part.vz = wnd ? 3.2 * wz + 0.4 * wx : 0.4;
          part.life = 0.55 + rnd() * 0.2;
          part.size = 0.42;
          part.sizeEnd = 0.42;
          part.glyph = '/';
          part.color = RAIN;
          part.colorEnd = RAIN_END;
          part.alpha = 0.55;
          part.alphaEnd = 0.2;
          part.drag = 0;
          part.flicker = 0;
          part.spin = 0;
          part.rot = 0;
          part.gravity = 0;
          spawn(fxA);
        }
      }
    },
  };
}
