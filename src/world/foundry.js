import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createAsciiObjectMaterial, createCarvedGlyphMaterial, createPropArtMaterial } from '../render/materials.js';
import { markCaster } from '../render/pipeline.js';
import { mulberry32, range, fbm2 } from '../core/rng.js';
import { CONFIG } from '../core/config.js';
import { TAU } from '../core/math.js';
import { prep, lumpy, carve, slabGeometry, mul, STONE, SLAB_LOOK, buildBoulder, buildBonfire, buildRubble, buildDeadTree, geosHeight } from './forest.js';
import { breakableFloor } from './floor.js';

// The Brazen Foundry (ADR-136; levels/foundry.js): the drill yard of an old war-foundry whose forges
// never went cold, where the Clockwork Marshal (entities/enemies/marshal/) kneels before the great
// furnace. South to north (the player walks north, -z): the bonfire, an approach between two rows of
// bronze sentinels, two bronze-shod gate posts with a chain sagging between them, then the yard: a disc
// of iron-banded flagstones 15 m in radius round the origin, weapon racks, drill posts, banners, powder
// kegs, crucibles, ingot stacks and anvils round its rim. Beyond the north rim the Great Furnace (its
// mouth faces the yard; the boss's fx draws its fire every frame as heat in the fire field), east of the
// yard a half-buried cogwheel standing as a toothed arc. Same output shape as createForest, plus
// `ash: true` (soot and embers fall: atmosphere.js) and grey grass outside the yard.
//
// Where the camera looks (the courtyard's note): the duel camera looks down from the south and frames
// the ground north of the hero; the furnace stands just past the north rim and the cogwheel past the
// east rim, both inside that frame from most of the yard. The landmarks are whole (never breakables);
// everything else that stands in the yard breaks (ADR-107), drawn through the prop art path (ADR-100).

/** Layout numbers (world metres). levels/foundry.js reads these. */
export const FOUNDRY = Object.freeze({
  r: 15, // the paving: a disc of this radius round the origin
  cell: 1.45, // slab pitch
  furnace: Object.freeze({ x: 0, z: -20.6, h: 7.2, r: 3.1 }),
  cog: Object.freeze({ x: 19.2, z: -3.5, r: 3.0, yaw: -1.25 }),
  gate: Object.freeze({ x: 3.4, z: 16.4 }),
  bonfire: Object.freeze({ x: 0, z: 27 }),
  entryZ: 15.2, // the yard's south edge at the gate
  sentinels: Object.freeze({ x: 4.6, z: [18.8, 20.9, 23.0, 25.1] }),
});

const IRON = [0.06, 0.06, 0.068];
const BRONZE = [0.2, 0.15, 0.08];
const VERDI = [0.12, 0.155, 0.12];
const WOOD = [0.15, 0.1, 0.065];
const CHAR = [0.06, 0.055, 0.05];
const SOOT = [0.05, 0.048, 0.05];

/** The yard's flagstones: soot-dark stone crossed by iron bands near each slab's edges. */
const pavingCol = (px, py, pz) => {
  const s = (0.5 + 0.38 * fbm2(px * 1.5, pz * 1.5, 2)) * (0.72 + 0.28 * fbm2(px * 0.12 + 7, pz * 0.12, 2));
  return mul(STONE, s * 0.62);
};
// (calmer than the courtyard's: the duel's figures must stand off the yard, as the Skybreak Ring learned)
const PAVING_LOOK = { gain: 1.0, lumScale: 1.6, edge: 0.24, inkFloor: 0.02, topGlyphs: ['.   ', '. . ', '.:. ', ':.;.', ';:=.', '=;%:'] };

/** One flagstone of the yard: four jittered corners, an iron band laid across it (a second slab, low). */
function yardSlab(rng, x, z, w, d, yaw) {
  const j = 0.05;
  const pts = [
    [-w / 2 + range(rng, -j, j), -d / 2 + range(rng, -j, j)],
    [w / 2 + range(rng, -j, j), -d / 2 + range(rng, -j, j)],
    [w / 2 + range(rng, -j, j), d / 2 + range(rng, -j, j)],
    [-w / 2 + range(rng, -j, j), d / 2 + range(rng, -j, j)],
  ];
  const g = slabGeometry(pts, { top: range(rng, 0.03, 0.05), inset: 0.06, drop: 0.04 });
  g.rotateY(yaw);
  g.translate(x, 0, z);
  const c = Math.cos(yaw), s = Math.sin(yaw), band = rng() < 0.5 ? 0 : 1;
  carve(g, {
    col: (px, py, pz) => {
      // the iron band: a strip across the slab, a third in from one edge (it prints darker, a cold edge)
      const lx = (px - x) * c - (pz - z) * s, lz = (px - x) * s + (pz - z) * c;
      const u = band ? lx / w : lz / d;
      return Math.abs(u + 0.18) < 0.06 ? IRON : pavingCol(px, py, pz);
    },
    ao: 0.85,
    moss: 0.04,
    edge: (px, py, pz, nx, ny) => (ny > 0.5 && ny < 0.95 ? 1 : 0),
  });
  const outline = pts.map(([px, pz]) => [x + c * px + s * pz, z - s * px + c * pz]);
  return { geo: g, outline, r: Math.max(w, d) * 0.5 * 1.15 };
}

// ---------------------------------------------------------------- prop builders (prop art: carve())
const P = (g, col, o = {}) => {
  carve(g, { col, ao: o.ao ?? ((px, py) => 0.6 + 0.4 * Math.min(1, py / 1.6)), moss: o.moss ?? 0.02, edge: o.edge ?? 0 });
  return g;
};
const box = (w, h, d, x, y, z) => {
  const g = prep(new THREE.BoxGeometry(w, h, d));
  g.translate(x, y, z);
  return g;
};
const cyl = (r0, r1, h, seg, x, y, z) => {
  const g = prep(new THREE.CylinderGeometry(r0, r1, h, seg));
  g.translate(x, y, z);
  return g;
};
/** Place local parts at (x, z, yaw). */
const place = (parts, x, z, yaw = 0) => {
  for (const g of parts) {
    g.rotateY(yaw);
    g.translate(x, 0, z);
  }
  return parts;
};

/** A weapon rack: two posts, two rails, a row of spear shafts leaning on it (wood). */
function buildRack(rng, x, z, yaw) {
  const parts = [];
  for (const s of [-1, 1]) parts.push(P(cyl(0.06, 0.07, 1.9, 6, s * 0.85, 0.95, 0), WOOD));
  parts.push(P(box(1.9, 0.08, 0.1, 0, 1.55, 0), WOOD), P(box(1.9, 0.08, 0.1, 0, 0.45, 0), WOOD));
  for (let i = 0; i < 6; i++) {
    const sh = prep(new THREE.CylinderGeometry(0.025, 0.03, 2.1, 5));
    sh.rotateX(-0.16);
    sh.translate(-0.7 + i * 0.28, 1.0, 0.12);
    parts.push(P(sh, mul(WOOD, 0.8)));
    const head = prep(new THREE.ConeGeometry(0.05, 0.22, 4));
    head.rotateX(-0.16);
    head.translate(-0.7 + i * 0.28, 2.1, -0.05);
    parts.push(P(head, [0.3, 0.3, 0.33]));
  }
  return place(parts, x, z, yaw);
}

/** A drill post: a stake with a crossbar and a straw-bound head. */
function buildDummy(rng, x, z, yaw) {
  const parts = [P(cyl(0.09, 0.11, 1.75, 6, 0, 0.88, 0), WOOD), P(box(1.0, 0.1, 0.1, 0, 1.35, 0), WOOD)];
  const head = prep(new THREE.SphereGeometry(0.18, 6, 5));
  head.scale(1, 1.15, 1);
  head.translate(0, 1.88, 0);
  lumpy(head, 0.03, 6, rng() * 9, new THREE.Vector3(0, 1.88, 0));
  parts.push(P(head, [0.26, 0.21, 0.12]));
  parts.push(P(cyl(0.2, 0.22, 0.32, 7, 0, 1.15, 0), [0.24, 0.19, 0.11])); // the straw-bound body
  return place(parts, x, z, yaw);
}

/** A banner: a tall pole, a cross-arm, a long cloth hanging from it. */
function buildBanner(rng, x, z, yaw) {
  const parts = [P(cyl(0.05, 0.06, 4.2, 6, 0, 2.1, 0), WOOD), P(box(0.9, 0.06, 0.06, 0, 3.95, 0), WOOD)];
  const cloth = prep(new THREE.PlaneGeometry(0.8, 2.2, 2, 6));
  const p = cloth.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, 0.06 * Math.sin(p.getY(i) * 3 + p.getX(i) * 2));
  cloth.translate(0, 2.8, 0.02);
  const back = cloth.clone();
  back.rotateY(Math.PI);
  parts.push(P(cloth, [0.2, 0.05, 0.04]), P(back, [0.2, 0.05, 0.04]));
  return place(parts, x, z, yaw);
}

/** A powder keg: a staved barrel with two iron hoops. */
function buildKeg(rng, x, z, yaw) {
  const prof = [[0.26, 0], [0.33, 0.25], [0.35, 0.42], [0.33, 0.6], [0.26, 0.84]].map(([r, y]) => new THREE.Vector2(r, y));
  const body = prep(new THREE.LatheGeometry(prof, 9));
  const parts = [P(body, [0.17, 0.1, 0.055])];
  for (const y of [0.18, 0.66]) parts.push(P(cyl(0.345, 0.345, 0.05, 9, 0, y, 0), IRON));
  parts.push(P(cyl(0.26, 0.26, 0.02, 9, 0, 0.84, 0), [0.12, 0.08, 0.05]));
  return place(parts, x, z, yaw);
}

/** A crucible on three legs: a bronze bowl with a pouring lip. */
function buildCrucible(rng, x, z, yaw) {
  const prof = [[0.2, 0], [0.5, 0.12], [0.62, 0.42], [0.58, 0.62], [0.5, 0.64]].map(([r, y]) => new THREE.Vector2(r, y));
  const bowl = prep(new THREE.LatheGeometry(prof, 10));
  bowl.translate(0, 0.55, 0);
  const parts = [P(bowl, BRONZE)];
  const legs = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    const L = prep(new THREE.CylinderGeometry(0.05, 0.06, 0.7, 5));
    L.rotateZ(0.25);
    L.rotateY(a);
    L.translate(Math.cos(a) * 0.32, 0.33, Math.sin(a) * 0.32);
    legs.push(P(L, mul(BRONZE, 0.8)));
  }
  parts.push(...legs, P(box(0.18, 0.06, 0.3, 0.55, 1.15, 0), BRONZE));
  return { geos: place(parts, x, z, yaw), legs: place(legs.map((g) => g.clone()), 0, 0, 0) };
}

/** A stack of ingots: bars laid crosswise in courses. */
function buildIngots(rng, x, z, yaw) {
  const parts = [];
  for (let c = 0; c < 4; c++) {
    for (let i = 0; i < 3; i++) {
      const o = (i - 1) * 0.24;
      const g = c % 2 ? box(0.7, 0.13, 0.2, 0, 0.07 + c * 0.14, o) : box(0.2, 0.13, 0.7, o, 0.07 + c * 0.14, 0);
      parts.push(P(g, c % 2 ? BRONZE : mul(BRONZE, 0.75)));
    }
  }
  return place(parts, x, z, yaw);
}

/** An anvil on its stump. */
function buildAnvil(rng, x, z, yaw) {
  const parts = [P(cyl(0.32, 0.36, 0.55, 8, 0, 0.27, 0), WOOD), P(box(0.36, 0.22, 0.26, 0, 0.66, 0), IRON), P(box(0.7, 0.16, 0.3, 0, 0.84, 0), IRON)];
  const horn = prep(new THREE.ConeGeometry(0.13, 0.42, 6));
  horn.rotateZ(-Math.PI / 2);
  horn.translate(0.56, 0.86, 0);
  parts.push(P(horn, IRON));
  return place(parts, x, z, yaw);
}

/** A bronze sentinel: a soldier statue with a halberd on a square plinth (2.1 m). */
function buildSentinel(rng, x, z, yaw) {
  const parts = [P(box(0.9, 0.3, 0.9, 0, 0.15, 0), mul(STONE, 0.8))];
  const v = (k = 1) => mul(VERDI, k);
  parts.push(P(cyl(0.2, 0.26, 0.8, 7, 0, 0.7, 0), v(0.9))); // the legs in their skirt of scales
  const torso = prep(new THREE.CylinderGeometry(0.26, 0.2, 0.62, 8));
  torso.translate(0, 1.4, 0);
  parts.push(P(torso, v(1.1)));
  for (const s of [-1, 1]) parts.push(P(box(0.24, 0.12, 0.3, s * 0.32, 1.66, 0), v(1.2)), P(cyl(0.07, 0.06, 0.6, 6, s * 0.34, 1.32, 0.04), v(0.9)));
  const helm = prep(new THREE.SphereGeometry(0.17, 8, 6, 0, TAU, 0, Math.PI * 0.62));
  helm.translate(0, 1.86, 0);
  parts.push(P(helm, v(1.25)), P(cyl(0.24, 0.24, 0.04, 9, 0, 1.84, 0), v(1.3)));
  parts.push(P(cyl(0.025, 0.025, 2.0, 5, 0.42, 1.2, 0.12), mul(BRONZE, 0.7)));
  const blade = box(0.04, 0.32, 0.18, 0.42, 2.25, 0.18);
  parts.push(P(blade, [0.26, 0.24, 0.2]));
  return place(parts, x, z, yaw);
}

// ---------------------------------------------------------------- the landmarks (whole)
/** The Great Furnace: a stepped bronze blast furnace, its arched mouth to the yard (+z), two
 *  chimneys, bellows housings on its flanks. ~7 m. */
function buildFurnace(rng, x, z) {
  const F = FOUNDRY.furnace, parts = [];
  const br = (g, k = 1) => parts.push(P(g, mul(BRONZE, k), { ao: (px, py) => 0.45 + 0.55 * Math.min(1, py / 5) }));
  // the base: a square plinth of soot-black stone
  parts.push(P(box(7.6, 0.8, 6.4, 0, 0.4, 0), mul(STONE, 0.6)));
  // the body: a tapering octagonal stack in three bands
  const prof = [[3.0, 0], [3.05, 1.8], [2.6, 2.1], [2.55, 4.0], [2.0, 4.3], [1.7, 6.0], [1.2, 6.4]].map(([r, y]) => new THREE.Vector2(r, y));
  const stack = prep(new THREE.LatheGeometry(prof, 8));
  stack.translate(0, 0.8, 0);
  lumpy(stack, 0.04, 1.6, 3, new THREE.Vector3(0, 3, 0));
  br(stack, 0.85);
  // bands of riveted iron round it
  for (const y of [1.0, 2.75, 4.95]) parts.push(P(cyl(3.1 - y * 0.24, 3.1 - y * 0.24, 0.22, 8, 0, y + 0.8, 0), IRON));
  // the mouth: a deep arched opening on the +z face (a dark box set in, an arch of bronze over it)
  parts.push(P(box(2.2, 2.0, 1.2, 0, 1.8, 2.75), [0.02, 0.015, 0.012]));
  const arch = prep(new THREE.TorusGeometry(1.25, 0.22, 6, 10, Math.PI));
  arch.translate(0, 2.6, 3.15);
  br(arch, 1.35);
  for (const s of [-1, 1]) br(box(0.42, 1.8, 0.42, s * 1.25, 1.7, 3.15), 1.2);
  // the hearth lip under it (the fire spills over it)
  parts.push(P(box(2.8, 0.3, 1.0, 0, 0.95, 3.4), mul(STONE, 0.7)));
  // two chimneys out of the crown
  for (const s of [-1, 1]) {
    br(cyl(0.42, 0.5, 2.4, 8, s * 0.7, 8.2, -0.3), 0.9);
    parts.push(P(cyl(0.52, 0.52, 0.18, 8, s * 0.7, 9.45, -0.3), IRON));
  }
  // the bellows housings: boxes on each flank with a pipe into the stack
  for (const s of [-1, 1]) {
    br(box(1.4, 1.6, 2.0, s * 3.9, 1.6, 0.4), 0.7);
    parts.push(P(cyl(0.22, 0.22, 1.2, 6, 0, 0, 0).rotateZ(Math.PI / 2).translate(s * 3.2, 2.2, 0.4), IRON));
  }
  return place(parts, x, z, 0);
}
export const FURNACE_COLLIDERS = Object.freeze([[0, 0, 3.2], [-3.9, 0.4, 1.2], [3.9, 0.4, 1.2], [0, 3.2, 1.3]]);

/** The cogwheel: a great toothed wheel 6 m across, its lower third sunk in the ground, standing on edge. */
function buildCog(rng, x, z, yaw) {
  const C = FOUNDRY.cog, parts = [], R = C.r, cy = R * 0.45;
  const ring = prep(new THREE.TorusGeometry(R - 0.35, 0.32, 6, 28));
  ring.translate(0, cy, 0);
  parts.push(P(ring, mul(BRONZE, 0.9)));
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU, tx = Math.cos(a) * R, ty = cy + Math.sin(a) * R;
    if (ty < -0.4) continue;
    const t = box(0.45, 0.55, 0.6, 0, 0, 0);
    t.rotateZ(a + Math.PI / 2);
    t.translate(tx, ty, 0);
    parts.push(P(t, mul(BRONZE, 1.1)));
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3, ex = Math.cos(a), ey = Math.sin(a);
    if (cy + ey * R * 0.5 < -0.3) continue;
    const s = box(0.3, R - 0.6, 0.3, 0, 0, 0);
    s.rotateZ(a - Math.PI / 2);
    s.translate(ex * (R - 0.6) * 0.5, cy + ey * (R - 0.6) * 0.5, 0);
    parts.push(P(s, mul(BRONZE, 0.75)));
  }
  parts.push(P(cyl(0.55, 0.55, 0.8, 10, 0, 0, 0).rotateX(Math.PI / 2).translate(0, cy, 0), IRON));
  // clip what is under the ground (the wheel is sunk): flatten vertices below y = 0
  for (const g of parts) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, 0);
    g.computeVertexNormals();
  }
  // a heap of slag round its foot
  const heap = prep(new THREE.SphereGeometry(1.6, 9, 4, 0, TAU, 0, Math.PI / 2));
  heap.scale(2.2, 0.35, 0.9);
  lumpy(heap, 0.12, 2, 5);
  parts.push(P(heap, SOOT));
  return place(parts, x, z, yaw);
}

/** The gate posts: two bronze-shod pillars, a chain sagging between them. */
function buildGate(rng, gx, gz) {
  const parts = [];
  for (const s of [-1, 1]) {
    const x = s * gx;
    parts.push(P(box(0.9, 3.2, 0.9, x, 1.6, gz), mul(STONE, 0.75)));
    parts.push(P(box(1.0, 0.5, 1.0, x, 0.25, gz), mul(BRONZE, 1.1)), P(box(1.05, 0.35, 1.05, x, 3.25, gz), mul(BRONZE, 1.2)));
    const cap = prep(new THREE.ConeGeometry(0.62, 0.7, 4));
    cap.rotateY(Math.PI / 4);
    cap.translate(x, 3.78, gz);
    parts.push(P(cap, mul(BRONZE, 1.0)));
  }
  // the chain: links along a sagging curve between the posts
  const n = 16;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = -gx + 0.5 + (2 * gx - 1) * t, y = 2.7 - 1.3 * 4 * t * (1 - t);
    const L = prep(new THREE.TorusGeometry(0.11, 0.03, 4, 8));
    if (i % 2) L.rotateY(Math.PI / 2);
    L.rotateZ(Math.PI / 2);
    L.translate(x, y, gz);
    parts.push(P(L, IRON));
  }
  return parts;
}

// ---------------------------------------------------------------- assembly
export function createFoundry(U, colliders) {
  const rng = mulberry32(CONFIG.seed + 301);
  const br = mulberry32(CONFIG.seed + 5301); // the breakables' remains (a stream of their own)
  const F = FOUNDRY;
  const group = new THREE.Group();
  group.name = 'foundry';
  const stoneGeos = [], slabGeos = [], propGeos = [], treeGeos = [];
  const treeSpots = [], bare = [], slabs = [], floor = [], breakables = [];

  // ---- the paving: rows of slabs clipped to the disc, a staggered bond
  const n = Math.ceil((2 * F.r) / F.cell);
  for (let j = 0; j < n; j++) {
    const z = -F.r + (j + 0.5) * F.cell;
    let i = j % 2 ? -0.5 : 0;
    while (i < n) {
      const long = rng() < 0.3 && i + 2 <= n;
      const span = Math.min(long ? 2 : 1, n - Math.max(0, i));
      const i0 = Math.max(0, i), i1 = Math.min(n, i + span);
      i += span;
      if (i1 - i0 < 0.4) continue;
      const x = -F.r + ((i0 + i1) / 2) * F.cell;
      if (Math.hypot(x, z) > F.r - 0.3) continue;
      if (rng() < 0.06) {
        bare.push({ x, z, r: 0.6 * (i1 - i0) });
        continue;
      }
      const w = (i1 - i0) * F.cell - range(rng, 0.1, 0.18), d = F.cell - range(rng, 0.1, 0.18);
      const s = yardSlab(rng, x + range(rng, -0.04, 0.04), z + range(rng, -0.04, 0.04), w, d, range(rng, -0.05, 0.05));
      slabGeos.push(s.geo);
      slabs.push({ x, z, r: s.r, outline: s.outline });
      floor.push({ geo: s.geo, outline: s.outline, x, z, r: s.r * 0.87, col: pavingCol });
    }
  }

  // ---- the breakables round the yard's rim (prop art)
  const standing = (kind, mat, geos, x, z, r, extra = {}) => {
    const c = r > 0 ? colliders.add(x, z, r, mat === 'wood' ? 'trunk' : 'stone') : null;
    breakables.push({ kind, mat, look: 'prop', x, z, r, h: geosHeight(geos), geos, colliders: c ? [c] : [], ...extra });
  };
  const rim = (a, r) => [Math.sin(a) * r, Math.cos(a) * r];
  // (angles round the yard: 0 = south, toward the gate; π = north, the furnace. The gate's gap and the
  // furnace's front are kept clear)
  const RACKS = [[0.9, 13.4], [1.5, 13.6], [-1.0, 13.5], [-1.6, 13.4], [2.35, 12.9], [-2.4, 13.0]];
  RACKS.forEach(([a, r]) => {
    const [x, z] = rim(a, r);
    standing('rack', 'wood', buildRack(rng, x, z, a + Math.PI), x, z, 0.5, { broken: { geos: buildRubble(br, x, z, 0.4, { col: WOOD, h: 0.25 }) }, cover: true, lift: 1 });
  });
  const DUMMIES = [[0.45, 9.5], [0.75, 10.4], [-0.5, 9.8], [-0.8, 10.6], [1.9, 9.6], [-1.95, 9.4], [2.6, 10.2], [-2.7, 10.0]];
  DUMMIES.forEach(([a, r]) => {
    const [x, z] = rim(a, r);
    standing('dummy', 'wood', buildDummy(rng, x, z, a + range(rng, -0.4, 0.4)), x, z, 0.28, { topples: true, lift: 1 });
  });
  const BANNERS = [[1.15, 14.3], [-1.2, 14.3], [2.75, 14.2], [-2.8, 14.2]];
  BANNERS.forEach(([a, r]) => {
    const [x, z] = rim(a, r);
    standing('banner', 'wood', buildBanner(rng, x, z, a + Math.PI), x, z, 0.2, { topples: true, cover: false, lift: 1 });
  });
  const KEGS = [[1.25, 12.0], [1.32, 12.6], [-1.3, 12.2], [2.05, 12.4], [-2.1, 12.1], [-2.15, 12.8]];
  KEGS.forEach(([a, r]) => {
    const [x, z] = rim(a, r);
    standing('keg', 'wood', buildKeg(rng, x, z, rng() * TAU), x, z, 0.36, { hpK: 0.45, topples: false, cover: false, lift: 1 });
  });
  const CRUCIBLES = [[2.9, 11.4], [-2.95, 11.6], [1.7, 11.2], [-1.75, 11.4]];
  CRUCIBLES.forEach(([a, r]) => {
    const [x, z] = rim(a, r);
    const c = buildCrucible(rng, x, z, rng() * TAU);
    // (its broken look: the tipped legs where it stood)
    const legs = c.legs.map((g) => {
      g.rotateZ(1.2);
      g.translate(x, 0.08, z);
      return g;
    });
    standing('crucible', 'metal', c.geos, x, z, 0.62, { broken: { geos: legs, r: 0.3 }, topples: false, lift: 1 });
  });
  const INGOTS = [[0.25, 12.4], [-0.25, 12.6], [2.2, 13.8], [-2.25, 13.9], [1.05, 8.6], [-1.05, 8.4]];
  INGOTS.forEach(([a, r]) => {
    const [x, z] = rim(a, r);
    standing('ingots', 'metal', buildIngots(rng, x, z, rng() * TAU), x, z, 0.45, { broken: { geos: buildRubble(br, x, z, 0.45, { col: BRONZE, h: 0.2 }) }, topples: false, cover: false, lift: 1 });
  });
  const ANVILS = [[1.0, 6.8], [-1.05, 7.0], [2.55, 7.6]];
  ANVILS.forEach(([a, r]) => {
    const [x, z] = rim(a, r);
    standing('anvil', 'metal', buildAnvil(rng, x, z, rng() * TAU), x, z, 0.42, { hp: Infinity, topples: false, cover: false, lift: 1 });
  });
  // the bronze sentinels: two rows along the approach to the gate
  for (const s of [-1, 1]) {
    for (const z of F.sentinels.z) {
      const x = s * F.sentinels.x;
      standing('sentinel', 'metal', buildSentinel(rng, x, z, s > 0 ? -Math.PI / 2 : Math.PI / 2), x, z, 0.5, {
        broken: { geos: buildRubble(br, x, z, 0.5, { col: mul(STONE, 0.8), h: 0.3 }), r: 0.4 }, topples: true, cover: true, lift: 2,
      });
    }
  }

  // ---- the landmarks: whole, with colliders
  {
    const lr = mulberry32(CONFIG.seed + 1301);
    const K = F.furnace;
    stoneGeos.push(...buildFurnace(lr, K.x, K.z));
    for (const [lx, lz, r] of FURNACE_COLLIDERS) colliders.add(K.x + lx, K.z + lz, r, 'stone');
    const C = F.cog;
    stoneGeos.push(...buildCog(lr, C.x, C.z, C.yaw));
    // (the wheel stands on edge across `yaw`: colliders along its foot)
    for (const t of [-2.4, -1.2, 0, 1.2, 2.4]) colliders.add(C.x + Math.cos(C.yaw) * t, C.z - Math.sin(C.yaw) * t, 0.75, 'stone');
    stoneGeos.push(...buildGate(lr, F.gate.x, F.gate.z));
    for (const s of [-1, 1]) colliders.add(s * F.gate.x, F.gate.z, 0.65, 'stone');
  }
  // ---- the bonfire
  const bf = F.bonfire;
  propGeos.push(...buildBonfire(rng, bf.x, bf.z));
  colliders.add(bf.x, bf.z, 0.75, 'bonfire');
  bare.push({ x: bf.x, z: bf.z, r: 2.4 });

  // ---- beyond the yard: slag heaps and a few dead trees (out of reach: static)
  const open = (x, z) => {
    if (Math.hypot(x, z) < F.r + 6) return false;
    if (z > F.r - 2 && z < bf.z + 5 && Math.abs(x) < 8) return false; // the approach
    if (Math.hypot(x - F.furnace.x, z - F.furnace.z) < 7) return false;
    if (Math.hypot(x - F.cog.x, z - F.cog.z) < 6) return false;
    return true;
  };
  for (let i = 0; i < 900 && treeSpots.length < 70; i++) {
    const a = rng() * TAU, r = 24 + Math.pow(rng(), 1.2) * 40;
    const x = Math.cos(a) * r, z = Math.sin(a) * r + 4;
    if (!open(x, z) || treeSpots.some((t) => Math.hypot(t.x - x, t.z - z) < 3.6)) continue;
    const s = range(rng, 0.8, 1.3);
    if (rng() < 0.5) {
      const g = buildDeadTree(rng, x, z, s);
      for (const geo of g) {
        const col = geo.attributes.aCol;
        if (col) for (let k = 0; k < col.count; k++) col.setXYZ(k, col.getX(k) * 0.5, col.getY(k) * 0.48, col.getZ(k) * 0.48);
      }
      treeGeos.push(...g);
      if (r < 40) colliders.add(x, z, 0.42 * s, 'trunk');
      treeSpots.push({ x, z, r: 2.4 * s });
    } else {
      const g = buildBoulder(rng, x, z, s * 1.2);
      stoneGeos.push(g);
      if (r < 40) colliders.add(x, z, s * 1.0, 'boulder');
      treeSpots.push({ x, z, r: 1.6 * s });
    }
  }

  const mat = createAsciiObjectMaterial(U, { fadeNearPlayer: true, side: THREE.DoubleSide });
  const treeMesh = new THREE.Mesh(treeGeos.length ? mergeGeometries(treeGeos) : new THREE.BufferGeometry(), mat);
  treeMesh.name = 'trees';
  const propMesh = new THREE.Mesh(mergeGeometries(propGeos), mat);
  propMesh.name = 'props';
  const stoneMat = createPropArtMaterial(U, { fadeNearPlayer: true });
  const stoneMesh = new THREE.Mesh(mergeGeometries(stoneGeos), stoneMat);
  stoneMesh.name = 'landmarks';
  const slabMat = createCarvedGlyphMaterial(U, { ...SLAB_LOOK, ...PAVING_LOOK, viewPitch: CONFIG.camera.pitch });
  const slabMesh = new THREE.Mesh(mergeGeometries(slabGeos), slabMat);
  slabMesh.name = 'paving';
  group.add(treeMesh, propMesh, stoneMesh, slabMesh);
  markCaster(group);
  breakables.push(...breakableFloor({ slabs: floor, slabGeos, slabMesh, mat: slabMat, rng: mulberry32(CONFIG.seed + 7301), group }).defs);

  const S = CONFIG.world.dragonSleep ?? { x: 0, z: 0 };
  return {
    group, treeSpots, bare, slabs, nest: { x: S.x, z: S.z }, bonfire: { x: bf.x, z: bf.z },
    material: mat, stoneMaterial: stoneMat, slabMaterial: slabMat,
    breakables,
    scarInk: [0.01, 0.009, 0.01], // soot-black cracks in the yard
    ash: true,
    grass: {
      ash: 0.9,
      height: 0.5,
      density: (x, z) => {
        const r = Math.hypot(x, z);
        if (r < F.r + 0.5) return 0.04;
        const onPath = z > F.r && z < bf.z + 3 && Math.abs(x) < 2.6;
        return onPath ? 0.2 : 0.14 + 0.2 * fbm2(x * 0.08 + 31, z * 0.08 - 5, 2);
      },
    },
  };
}

