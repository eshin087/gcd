import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createAsciiObjectMaterial, createCarvedGlyphMaterial, createPropArtMaterial } from '../render/materials.js';
import { markCaster } from '../render/pipeline.js';
import { mulberry32, range, fbm2 } from '../core/rng.js';
import { CONFIG } from '../core/config.js';
import { TAU } from '../core/math.js';
import { prep, lumpy, carve, slabGeometry, mul, SLAB_LOOK, buildFlagstone, buildBonfire, buildRubble } from './forest.js';
import { facetCol, RING_BRONZE } from './landmarks.js';
import { breakableFloor } from './floor.js';

// The Skywell Vault (`?level=fallen`; ADR-132): the hall under the mountain where Qian Yao, the
// Heaven-Fallen, was sealed. He cut four wells through the rock with his eyes to reach the sun and
// chained their bronze lids open; each chain runs down to a timber WINDLASS at the floor. The vault is
// dark: four shafts of sunlight stand in it (world/sun.js draws them and owns their state). The roof is
// never drawn (the camera looks down at 58 degrees): it is the four lit discs on the floor and the
// chains that rise out of frame.
// South to north (the hero walks north, -z): the bonfire, a path of flagstones through rubble to a
// broken gate, then the octagon of flagstones round the duel's centre; his seat at the north under a
// broken bronze ARMILLARY; the FALLEN JUDGE, a colossal stone head and an open hand, lying east.
//
// Same output shape as createThroneHall (world.js reads it), plus `sun` (data only: world.js builds
// world.sun from it). Everything is drawn through the glyph systems: carved glyphs for the floor
// (world/floor.js breakableFloor, as the other arenas), prop art for every stone, timber and bronze.
// What stands in the hall and can be hit is a breakable (ADR-107): the windlasses (the sky's lids),
// the pillars on the rim, the steles near the fight (cover from his eyes), the timber scaffolds
// outside the floor (what his beams set alight), the gate's posts, the rubble, the floor's slabs.

/** Layout numbers (world metres). The level's CONFIG.world overrides match these (levels/fallen.js). */
export const VAULT = (() => {
  const wells = [[6.2, -6.2], [-6.2, -6.2], [6.2, 6.2], [-6.2, 6.2]].map(([x, z]) => {
    const l = Math.hypot(x, z);
    return { x, z, r: 3.2, wx: (x / l) * 12.4, wz: (z / l) * 12.4 };
  });
  return Object.freeze({
    R: 15, // the hall's floor reaches this far (the arena's radius)
    floor: Object.freeze({ r: 13.2 }), // where he may stand (CONFIG.world.dragonBound)
    entryZ: 15.2, // the broken gate: where the path meets the floor
    bonfire: Object.freeze({ x: 0, z: 30 }),
    seat: Object.freeze({ x: 0, z: -4.5 }), // where he sits between the lights until the hero comes in
    // the four wells (NE, NW, SE, SW): the lit disc's centre and radius, and the windlass that holds its
    // lid open (`wx, wz`: 12.4 m out on the well's ray)
    wells: Object.freeze(wells.map((w) => Object.freeze(w))),
    great: Object.freeze({ x: 0, z: 0, r: 4.2 }), // the great well he tears open over the centre (phase 3)
    bore: Object.freeze({ r: 2.8 }), // a well he bores when the sky is shut
    pillarR: 14.4,
    steles: Object.freeze([[7.5, 0.4], [-7.5, -0.4], [3.8, -9.6], [-3.8, -9.6]]),
    armillary: Object.freeze({ x: 0, z: -19 }),
    judge: Object.freeze({ x: 19.5, z: -3, yaw: -0.5 }),
  });
})();

const ROCK = [0.13, 0.12, 0.115]; // the vault's rock: a cool grey-brown
const FLAG = [0.15, 0.145, 0.14]; // the floor's flagstones
const TIMBER = [0.2, 0.13, 0.075];
const IRON = [0.11, 0.105, 0.1];
const BRONZE = RING_BRONZE;
const flagCol = (px, py, pz) => mul(FLAG, 0.62 + 0.42 * fbm2(px * 1.7, pz * 1.7, 2));
const edgeBand = (px, py, pz, nx, ny) => (ny > 0.5 && ny < 0.95 ? 1 : 0);
const lift = (y0, k = 1.4) => (px, py) => 0.55 + 0.45 * Math.min(1, (py - y0) / k);

/** A carved box, its base at y. */
function box(w, h, d, x, y, z, col, { yaw = 0, roll = 0, pitch = 0, ao = null } = {}) {
  const g = prep(new THREE.BoxGeometry(w, h, d, 1, 1, 1));
  if (roll) g.rotateZ(roll);
  if (pitch) g.rotateX(pitch);
  g.translate(0, h / 2, 0);
  if (yaw) g.rotateY(yaw);
  g.translate(x, y, z);
  carve(g, { col: facetCol(col, 1.35), ao: ao ?? lift(y) });
  return g;
}

/** A carved prism standing on y (`sides` faces), radius r0 at its foot, r1 at its top. */
function column(x, y, z, h, r0, r1, col, sides = 8, turn = 0) {
  const g = prep(new THREE.CylinderGeometry(r1, r0, h, sides, 1));
  if (turn) g.rotateY(turn);
  g.translate(x, y + h / 2, z);
  carve(g, { col: facetCol(col, 1.4), ao: lift(y, h * 0.6) });
  return g;
}

/** A bronze ring (a torus, few sides: each facet one tone), centred at (x, y, z), turned (rx, ry, rz). */
function bronzeRing(R, tube, x, y, z, rx, ry, rz, arc = TAU, col = BRONZE) {
  const g = prep(new THREE.TorusGeometry(R, tube, 5, Math.max(12, Math.round(R * 7)), arc));
  g.rotateX(rx);
  g.rotateY(ry);
  g.rotateZ(rz);
  g.translate(x, y, z);
  carve(g, { col: facetCol(col, 1.7), ao: 0.95 });
  return g;
}

/** Broken stone round (x, z). */
function rubble(rng, x, z, R, n, { col = ROCK, size = [0.14, 0.4] } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU, r = Math.sqrt(rng()) * R, s = range(rng, size[0], size[1]);
    const g = prep(new THREE.IcosahedronGeometry(s, 0));
    lumpy(g, s * 0.4, 2 / s, rng() * 50);
    g.scale(1, range(rng, 0.5, 0.8), 1);
    g.rotateY(rng() * TAU);
    g.translate(x + Math.cos(a) * r, s * 0.25, z + Math.sin(a) * r);
    carve(g, { col: facetCol(col, 1.35), ao: 0.9 });
    out.push(g);
  }
  return out;
}

/** A windlass: a timber drum on two posts, a crank, the iron chain wound on it running up toward the
 *  well's lid (out of frame), facing the well (`yaw`: the way the chain leaves). */
function windlass(rng, x, z, wx, wz) {
  const yaw = Math.atan2(wx - x, wz - z); // toward the well
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const parts = [];
  // two posts either side of the drum, a sill between their feet
  for (const sd of [-1, 1]) {
    const [px, pz] = at(sd * 0.62, 0);
    parts.push(box(0.2, 1.45, 0.22, px, 0, pz, TIMBER, { yaw }));
  }
  {
    const [sx, sz] = at(0, 0);
    parts.push(box(1.5, 0.16, 0.3, sx, 0, sz, mul(TIMBER, 0.8), { yaw }));
  }
  // the drum: a fat octagonal log across, iron bands on it, the chain wound round
  {
    const g = prep(new THREE.CylinderGeometry(0.28, 0.28, 1.06, 8, 1));
    g.rotateZ(Math.PI / 2);
    g.rotateY(yaw);
    const [dx, dz] = at(0, 0);
    g.translate(dx, 1.1, dz);
    carve(g, { col: facetCol(TIMBER, 1.5), ao: 0.95 });
    parts.push(g);
    for (const off of [-0.36, 0, 0.36]) {
      const b = prep(new THREE.CylinderGeometry(0.31, 0.31, 0.07, 8, 1));
      b.rotateZ(Math.PI / 2);
      b.rotateY(yaw);
      const [bx, bz] = at(off, 0);
      b.translate(bx, 1.1, bz);
      carve(b, { col: facetCol(IRON, 1.6), ao: 1 });
      parts.push(b);
    }
  }
  // the crank on its right post
  {
    const [kx, kz] = at(0.78, 0);
    parts.push(box(0.08, 0.5, 0.08, kx, 0.95, kz, IRON, { yaw }));
    const [hx, hz] = at(0.92, 0.0);
    parts.push(box(0.26, 0.07, 0.07, hx, 1.4, hz, IRON, { yaw }));
  }
  // the chain: links from the drum up toward the lid over the well (14 m up), out of frame
  {
    const ox = x, oz = z, oy = 1.38, tx = wx, tz = wz, ty = 15;
    const L = Math.hypot(tx - ox, ty - oy, tz - oz), n = Math.floor(Math.min(L, 11) / 0.21);
    const ux = (tx - ox) / L, uy = (ty - oy) / L, uz = (tz - oz) / L;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(ux, uy, uz));
    for (let i = 0; i < n; i++) {
      const g = prep(new THREE.BoxGeometry(i & 1 ? 0.05 : 0.11, 0.2, i & 1 ? 0.11 : 0.05));
      g.applyQuaternion(q);
      g.translate(ox + ux * (i * 0.21 + 0.1), oy + uy * (i * 0.21 + 0.1), oz + uz * (i * 0.21 + 0.1));
      carve(g, { col: facetCol(IRON, 1.8), ao: 1 });
      parts.push(g);
    }
  }
  return parts;
}

/** A pillar of the rim: a square plinth, an eight-sided shaft, a capital cut off where it meets the dark. */
function pillar(rng, x, z, h) {
  const t = rng() * TAU;
  return [
    box(1.3, 0.4, 1.3, x, 0, z, mul(ROCK, 1.05), { yaw: t }),
    column(x, 0.4, z, h - 0.9, 0.55, 0.48, ROCK, 8, t),
    box(1.15, 0.5, 1.15, x, h - 0.5, z, mul(ROCK, 1.1), { yaw: t + 0.2 }),
  ];
}

/** A stele: an upright slab of black stone on a low base, a cap, the judgements cut into it. */
function stele(rng, x, z, yaw) {
  return [
    box(1.6, 0.3, 0.75, x, 0, z, mul(ROCK, 0.9), { yaw }),
    box(1.3, 2.4, 0.38, x, 0.3, z, mul(ROCK, 0.8), { yaw }),
    box(1.5, 0.22, 0.5, x, 2.7, z, mul(ROCK, 1.0), { yaw }),
  ];
}

/** A timber scaffold rack: four uprights, two rails, braces, planks across the top. */
function scaffold(rng, x, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const parts = [];
  for (const [lx, lz] of [[-1.1, -0.5], [1.1, -0.5], [-1.1, 0.5], [1.1, 0.5]]) {
    const [px, pz] = at(lx, lz);
    parts.push(box(0.16, 2.6, 0.16, px, 0, pz, TIMBER, { yaw, roll: range(rng, -0.04, 0.04) }));
  }
  for (const [lz, y] of [[-0.5, 1.3], [0.5, 1.3], [-0.5, 2.5], [0.5, 2.5]]) {
    const [px, pz] = at(0, lz);
    parts.push(box(2.4, 0.12, 0.12, px, y, pz, mul(TIMBER, 0.9), { yaw }));
  }
  for (let i = 0; i < 4; i++) {
    const [px, pz] = at(-0.9 + i * 0.6, 0);
    parts.push(box(0.5, 0.06, 1.25, px, 2.62, pz, mul(TIMBER, 1.1), { yaw: yaw + range(rng, -0.06, 0.06) }));
  }
  {
    const [px, pz] = at(0, -0.5);
    parts.push(box(2.3, 0.1, 0.1, px, 0.5, pz, TIMBER, { yaw, roll: 0.5 }));
  }
  return parts;
}

/** The armillary: a broken bronze armillary sphere (rings ~9 m across) on a stepped plinth, north. */
function armillary(rng, x, z) {
  const parts = [];
  parts.push(box(6.2, 0.7, 6.2, x, 0, z, mul(ROCK, 1.1)));
  parts.push(box(4.6, 0.6, 4.6, x, 0.7, z, mul(ROCK, 1.0)));
  parts.push(column(x, 1.3, z, 1.6, 1.0, 0.6, mul(ROCK, 0.95), 8));
  const cy = 2.9 + 4.2;
  // the meridian, the horizon, the ecliptic (tilted), a broken colure hanging loose; the axis rod
  parts.push(bronzeRing(4.4, 0.16, x, cy, z, 0, 0, 0, TAU * 0.86));
  parts.push(bronzeRing(4.3, 0.15, x, cy, z, Math.PI / 2, 0, 0, TAU * 0.7));
  parts.push(bronzeRing(4.1, 0.13, x, cy, z, Math.PI / 2 + 0.41, 0.3, 0.2, TAU * 0.78));
  parts.push(bronzeRing(3.6, 0.12, x + 0.6, cy - 1.1, z + 0.4, 0.3, 1.1, 1.0, TAU * 0.42, mul(BRONZE, 0.85)));
  {
    const g = prep(new THREE.CylinderGeometry(0.12, 0.12, 9.6, 6, 1));
    g.rotateZ(0.45);
    g.translate(x, cy, z);
    carve(g, { col: facetCol(BRONZE, 1.6), ao: 1 });
    parts.push(g);
  }
  // the little sun at its heart: a bronze ball
  {
    const g = prep(new THREE.IcosahedronGeometry(0.7, 1));
    g.translate(x, cy, z);
    carve(g, { col: facetCol(mul(BRONZE, 1.3), 1.5), ao: 1 });
    parts.push(g);
  }
  // a fallen ring lying on the plinth's foot
  parts.push(bronzeRing(2.4, 0.14, x - 3.4, 0.2, z + 2.6, Math.PI / 2 - 0.08, 0, 0, TAU * 0.6, mul(BRONZE, 0.8)));
  return parts;
}
const ARMILLARY_COLLIDERS = [[0, 0, 3.4], [-3.4, 2.6, 1.6]];

/** The fallen judge: a colossal stone head lying on its side, its official's hat broken off, and an
 *  open hand beside it, palm up, as if it still held a verdict. Local space: the head at the origin. */
function fallenJudge(rng, x, z, yaw) {
  const parts = [];
  const add = (g) => {
    g.rotateY(yaw);
    g.translate(x, 0, z);
    parts.push(g);
  };
  const stone = (g, k = 1.3) => {
    carve(g, { col: facetCol(mul(ROCK, k), 1.45), ao: (px, py) => 0.5 + 0.5 * Math.min(1, py / 3) });
    return g;
  };
  // the head on its cheek: a lumpy egg 5 m long, the face toward the hall (+x local)
  {
    const g = prep(new THREE.IcosahedronGeometry(2.4, 1));
    lumpy(g, 0.35, 0.6, 7);
    g.scale(1.05, 0.95, 1.25);
    g.rotateZ(Math.PI / 2 - 0.25);
    g.translate(0, 1.8, 0);
    add(stone(g, 1.25));
  }
  // the brow ridge, the nose, the closed eyes' lids (boxes on the face)
  add(stone(box(0.6, 0.5, 2.6, 2.0, 2.6, 0, ROCK, { roll: 0.25 }), 1.3));
  add(stone(box(1.0, 0.7, 0.6, 2.4, 1.6, 0.1, ROCK, { roll: 0.2 }), 1.35));
  add(stone(box(0.5, 0.35, 0.9, 2.05, 2.1, 0.75, ROCK), 1.0));
  add(stone(box(0.5, 0.35, 0.9, 2.05, 2.1, -0.75, ROCK), 1.0));
  // the official's hat broken off, lying behind: a flat board with its two wings snapped
  add(stone(box(3.2, 0.5, 2.2, -3.4, 0, -1.2, ROCK, { yaw: 0.4 }), 1.15));
  add(stone(box(2.2, 0.25, 0.5, -5.2, 0, 0.6, ROCK, { yaw: 0.9 }), 1.05));
  // the open hand, palm up, fingers curled a little, 6 m south of the head (local -z)
  {
    const hx = 1.2, hz = -6.2;
    add(stone(box(3.0, 0.9, 2.6, hx, 0, hz, ROCK), 1.2));
    for (let i = 0; i < 4; i++) add(stone(box(0.55, 0.6, 2.0, hx - 1.1 + i * 0.72, 0.5, hz + 2.0 + (i === 0 || i === 3 ? -0.3 : 0), ROCK, { pitch: -0.35 }), 1.25));
    add(stone(box(0.7, 0.7, 1.6, hx + 1.9, 0.4, hz - 0.2, ROCK, { yaw: -0.7, pitch: -0.3 }), 1.25));
  }
  parts.push(...rubble(rng, x - 1.5, z + 2.5, 2.4, 7, { size: [0.25, 0.6] }));
  return parts;
}
const JUDGE_COLLIDERS = [[0, 0, 2.9], [-3.4, -1.2, 1.6], [1.2, -6.2, 1.9], [2.2, -4.2, 1.0]];

/** A crag of the cavern's wall: a tall lumpy rock leaning in (never in the way of the camera: far out). */
function crag(rng, x, z, h) {
  const g = prep(new THREE.IcosahedronGeometry(1, 1));
  lumpy(g, 0.3, 1.1, rng() * 90);
  g.scale(range(rng, 2.6, 4.2), h, range(rng, 2.2, 3.6));
  g.rotateY(rng() * TAU);
  const l = Math.hypot(x, z) || 1;
  g.rotateX(range(rng, -0.12, 0.12));
  g.translate(x, h * 0.55, z);
  carve(g, { col: facetCol(mul(ROCK, 0.85), 1.5), ao: (px, py) => 0.4 + 0.6 * Math.min(1, py / (h * 0.8)) * (0.6 + 0.4 * Math.abs(x / l)) });
  return g;
}

export function createSkywellVault(U, colliders) {
  const L = VAULT, R = L.R, BF = L.bonfire;
  // the streams: the layout, the rubble broken pieces leave, the floor's remains, later additions
  const rng = mulberry32(CONFIG.seed + 21401), br = mulberry32(CONFIG.seed + 21402), fr = mulberry32(CONFIG.seed + 21403), xr = mulberry32(CONFIG.seed + 21404);
  const floor = [];
  const stoneGeos = [], slabGeos = [], propGeos = [], slabs = [], bare = [], treeSpots = [];
  const breakables = [];

  /** One breakable (ARCHITECTURE.md "Destruction"): not merged into the static meshes. */
  const piece = (kind, x, z, r, geos, extra = {}) => {
    const { stub = true, mat = 'stone', ...rest } = extra;
    const cs = r > 0 ? [colliders.add(x, z, r, mat === 'wood' ? 'trunk' : 'stone')] : [];
    const rr = r > 0 ? r : 0.6;
    let h = 0;
    for (const g of geos) {
      g.computeBoundingBox();
      h = Math.max(h, g.boundingBox.max.y);
    }
    breakables.push({
      kind, mat, look: 'prop', x, z, r: rr, h, geos, colliders: cs,
      ...(stub ? { broken: { geos: buildRubble(br, x, z, rr * 0.8, { col: mul(mat === 'wood' ? TIMBER : ROCK, 1.3), h: range(br, 0.3, 0.55) }), look: 'prop', r: rr * 0.7 } } : {}),
      lift: 0, ...rest,
    });
  };

  /** A slab of the floor (pts round its centre), carved, breakable (world/floor.js). */
  const floorSlab = (pts, x, z, { tilt = 0.006, col = flagCol } = {}) => {
    const g = slabGeometry(pts, { top: 0.04, inset: 0.06, drop: 0.035 });
    if (tilt) {
      const ax = new THREE.Vector3(range(rng, -1, 1), 0, range(rng, -1, 1) + 1e-3).normalize();
      g.applyMatrix4(new THREE.Matrix4().makeRotationAxis(ax, range(rng, 0.2, 1) * tilt));
    }
    g.translate(x, 0, z);
    carve(g, { col, ao: 0.85, edge: edgeBand });
    slabGeos.push(g);
    let r = 0;
    for (const [px, pz] of pts) r = Math.max(r, Math.hypot(px, pz));
    const outline = pts.map(([px, pz]) => [x + px, z + pz]);
    slabs.push({ x, z, r, outline });
    floor.push({ geo: g, outline, x, z, r: r * 0.8, col });
  };

  // ---- the floor: an octagon of flagstones in rings round the centre (the octagon's edge clips the
  // outer rings), worn and heaved toward the rim
  const gap = 0.05, OCT = Math.cos(Math.PI / 8);
  const octR = (a) => (R * OCT) / Math.cos(((a % (TAU / 8)) + TAU / 8) % (TAU / 8) - Math.PI / 8);
  for (const [r0, r1, n] of [[0, 1.4, 6], [1.4, 3.2, 10], [3.2, 5.0, 16], [5.0, 6.8, 22], [6.8, 8.6, 28], [8.6, 10.4, 34], [10.4, 12.2, 40], [12.2, R, 46]]) {
    if (r0 === 0) {
      const pts = [];
      for (let i = 0; i < 8; i++) pts.push([Math.cos((i / 8) * TAU + Math.PI / 8) * (r1 - gap), Math.sin((i / 8) * TAU + Math.PI / 8) * (r1 - gap)]);
      floorSlab(pts, 0, 0, { tilt: 0 });
      continue;
    }
    const off = rng() * TAU;
    for (let i = 0; i < n; i++) {
      const rm = (r0 + r1) / 2, da = gap / rm;
      const a0 = off + (i / n) * TAU + da, a1 = off + ((i + 1) / n) * TAU - da, am = (a0 + a1) / 2;
      const edge = octR(am);
      if (rm > edge - 0.3) continue;
      if (r1 > 12 && rng() < 0.2) continue; // (broken out near the rim)
      const ro = Math.min(r1, edge) - gap;
      const mx = Math.cos(am) * rm, mz = Math.sin(am) * rm;
      const pts = [];
      const so = Math.max(1, Math.ceil(((a1 - a0) * ro) / 1.4)), si = Math.max(1, Math.ceil(((a1 - a0) * r0) / 1.4));
      for (let k = 0; k <= so; k++) {
        const a = a0 + ((a1 - a0) * k) / so;
        pts.push([Math.cos(a) * ro - mx, Math.sin(a) * ro - mz]);
      }
      for (let k = si; k >= 0; k--) {
        const a = a0 + ((a1 - a0) * k) / si;
        pts.push([Math.cos(a) * (r0 + gap) - mx, Math.sin(a) * (r0 + gap) - mz]);
      }
      floorSlab(pts, mx, mz, { tilt: 0.004 + 0.03 * Math.max(0, (rm - 9) / 6) });
    }
  }

  // ---- his seat: a low block of the vault's stone at the north end of the light (not walkable round it)
  stoneGeos.push(box(1.6, 0.42, 1.2, L.seat.x, 0, L.seat.z - 1.2, mul(ROCK, 1.1)));

  // ---- the windlasses: the lids of the sky (world/sun.js binds each to its well by place). Timber,
  // they do not burn (the bronze and iron hold), they do not topple: a cut drum lets the chain run out
  for (const w of L.wells) {
    piece('windlass', w.wx, w.wz, 0.7, windlass(rng, w.wx, w.wz, w.x, w.z), { mat: 'wood', hp: 1.1, topples: false, burns: false, cover: true, lift: 0, h: 1.7, r: 0.7 });
  }

  // ---- the rim: eight pillars between the wells' rays (toppling stone: the world's red strip tells the fall)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + TAU / 16, x = Math.sin(a) * L.pillarR, z = -Math.cos(a) * L.pillarR;
    if (z > 12.5 && Math.abs(x) < 6) continue; // (the gate's way stays open: two of them are its posts' neighbours)
    piece('pillar', x, z, 0.62, pillar(rng, x, z, range(rng, 5.2, 6.4)), { lift: 0 });
  }
  // ---- the steles near the fight: cover from his eyes
  for (const [x, z] of L.steles) piece('stele', x, z, 0.55, stele(rng, x, z, Math.atan2(x, z) + Math.PI / 2), { lift: 0 });
  // ---- timber scaffolds outside the floor: what his beams set alight
  for (const [a, r] of [[0.95, 14.9], [2.2, 15.2], [4.05, 15.0], [5.35, 14.8], [-0.3, 16.6], [3.4, 16.4]]) {
    const x = Math.sin(a) * r, z = -Math.cos(a) * r;
    if (z > 12 && Math.abs(x) < 5) continue;
    piece('scaffold', x, z, 0.9, scaffold(rng, x, z, a + Math.PI / 2), { mat: 'wood', stub: true, lift: 0 });
  }
  // ---- the broken gate: two posts either side of the way in, a fallen lintel
  for (const sx of [-1, 1]) {
    const x = sx * 2.6, z = L.entryZ + 0.5;
    piece('gatepost', x, z, 0.6, [box(1.0, 3.4 - (sx > 0 ? 1.4 : 0), 1.0, x, 0, z, mul(ROCK, 1.15))], { lift: 0 });
  }
  piece('rubble', 1.2, L.entryZ + 2.2, 0, [box(4.4, 0.7, 0.9, 1.2, 0, L.entryZ + 2.2, mul(ROCK, 1.1), { yaw: 0.35 })], { stub: false, cover: false, r: 1.6 });
  // ---- rubble on the floor's edge and along the path
  for (let i = 0; i < 14; i++) {
    const a = rng() * TAU, r = range(rng, 13.4, 16), x = Math.sin(a) * r, z = -Math.cos(a) * r;
    if (z > 12 && Math.abs(x) < 3.6) continue;
    piece('rubble', x, z, 0, rubble(rng, x, z, 1.0, 4), { stub: false, cover: false, r: 1.0 });
  }

  // ---- the landmarks (prop art; whole: they do not break)
  stoneGeos.push(...armillary(rng, L.armillary.x, L.armillary.z));
  for (const [lx, lz, r] of ARMILLARY_COLLIDERS) colliders.add(L.armillary.x + lx, L.armillary.z + lz, r, 'stone');
  stoneGeos.push(...fallenJudge(rng, L.judge.x, L.judge.z, L.judge.yaw));
  {
    const c = Math.cos(L.judge.yaw), s = Math.sin(L.judge.yaw);
    for (const [lx, lz, r] of JUDGE_COLLIDERS) colliders.add(L.judge.x + lx * c + lz * s, L.judge.z - lx * s + lz * c, r, 'stone');
  }
  // ---- the cavern's wall: crags far out round the hall (none south of the gate's way)
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU + range(rng, -0.08, 0.08), r = range(rng, 24, 30), x = Math.sin(a) * r, z = -Math.cos(a) * r;
    if (z > 14 && Math.abs(x) < 9) continue;
    stoneGeos.push(crag(rng, x, z, range(rng, 4, 9)));
  }

  // ---- outside: the path down from the bonfire to the gate
  for (let z = R + 2.6; z < BF.z - 1.6; z += range(rng, 0.9, 1.3)) {
    const x = range(rng, -0.9, 0.9), w = range(rng, 0.9, 1.5), d = range(rng, 0.7, 1.2);
    const s = buildFlagstone(rng, x, z, w, d, rng() * TAU);
    slabGeos.push(s.geo);
    slabs.push({ x, z, r: Math.max(w, d) * 0.65, outline: s.outline });
    floor.push({ geo: s.geo, outline: s.outline, x, z, r: Math.max(w, d) * 0.5, col: flagCol });
  }
  propGeos.push(...buildBonfire(xr, BF.x, BF.z));
  colliders.add(BF.x, BF.z, 0.75, 'bonfire');
  bare.push({ x: BF.x, z: BF.z, r: 2.4 });

  // ---- meshes
  const group = new THREE.Group();
  group.name = 'skywellVault';
  const mat = createAsciiObjectMaterial(U, { fadeNearPlayer: true, side: THREE.DoubleSide });
  // the vault is darker than the crater: a higher source gain on its stone, so the forms still print
  const stoneMat = createPropArtMaterial(U, { fadeNearPlayer: true, gain: 1.75 });
  const slabMat = createCarvedGlyphMaterial(U, {
    ...SLAB_LOOK, gain: 1.65, lumScale: 2.2, edge: 0.42, inkFloor: 0.03, crackAmount: 0.3, topGlyphs: ['.   ', '. . ', '.:. ', ':.;.', ';:=.', '=;%:'], viewPitch: CONFIG.camera.pitch,
  });
  const add = (geos, m, name) => {
    if (!geos.length) return null;
    const mesh = new THREE.Mesh(mergeGeometries(geos), m);
    mesh.name = name;
    group.add(mesh);
    return mesh;
  };
  add(propGeos, mat, 'props');
  add(stoneGeos, stoneMat, 'stones');
  const slabMesh = add(slabGeos, slabMat, 'paving');
  markCaster(group);
  breakables.push(...breakableFloor({ slabs: floor, slabGeos, slabMesh, mat: slabMat, rng: fr, group, earth: [0.07, 0.065, 0.06] }).defs);

  // ---- the hall's life: dust drifting in the dark (the shafts' own motes are world/sun.js's)
  const st = { flare: 0, acc: 0 };
  const ambience = {
    setup() {},
    setVisible() {},
    /** A flare of light in the hall (k 0..1): his transitions call it. */
    flare(k = 1) {
      st.flare = Math.max(st.flare, Math.min(1, Math.max(0, Number(k) || 0)));
    },
    update(dt, game) {
      if (st.flare > 0) st.flare = Math.max(0, st.flare - dt * 0.8);
      const fx = game.fx?.alpha;
      if (!fx) return;
      st.acc += dt * 6;
      const f = game.U.uFocus.value;
      while (st.acc >= 1) {
        st.acc -= 1;
        const x = f.x + (Math.random() - 0.5) * 28, z = f.z + (Math.random() - 0.5) * 22 - 2;
        if (Math.hypot(x, z) > R + 2) continue;
        fx.spawn({
          x, y: 0.3 + Math.random() * 2.2, z, vx: (Math.random() - 0.5) * 0.12, vy: -0.05 + Math.random() * 0.1, vz: (Math.random() - 0.5) * 0.12,
          life: 5 + Math.random() * 4, size: 0.1, sizeEnd: 0.05, glyph: ".'", color: [0.3, 0.28, 0.25], colorEnd: [0.1, 0.09, 0.08],
          alpha: 0.7, alphaEnd: 0, drag: 0.2, flicker: 0.3,
        });
      }
    },
  };

  return {
    group, treeSpots, bare, slabs, nest: { x: L.seat.x, z: L.seat.z }, bonfire: { x: BF.x, z: BF.z },
    material: mat, stoneMaterial: stoneMat, slabMaterial: slabMat,
    breakables,
    // the cuts his eyes leave in the stone glow molten orange until the reset
    scarInk: [1.6, 0.55, 0.12],
    grass: { ash: 0.8, height: 0.45, density: (x, z) => (Math.hypot(x, z) < R + 4 ? 0 : 0.08) },
    floorCarry: mul(FLAG, 1.8),
    // the vault's own dark: a cool, low ambient, near fog (the light is the wells')
    sky: { moonColor: [0.11, 0.12, 0.15], ambient: [0.02, 0.019, 0.022], fogColor: [0.004, 0.0038, 0.0045], fogNear: 26, fogFar: 52 },
    ambience,
    sun: { wells: L.wells, great: L.great, bore: L.bore },
  };
}
