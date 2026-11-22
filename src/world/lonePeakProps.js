import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FLAG } from '../render/materials.js';
import { range, hash2, fbm2 } from '../core/rng.js';
import { TAU } from '../core/math.js';
import { prep, lumpy, paint, carve, slabGeometry, mul } from './forest.js';

// The Lone Peak Hermitage's props (world/lonePeak.js builds the set from them; ADR-138). Every upright
// thing is printed through the prop art path (carve() attributes → createPropArtMaterial: the striking
// stones, the Split Rock, the hut, the crags), the pines through the screen grid (FLAG.LEAF needles on
// FLAG.STONE wood, like the forest's trees), the training ground's plates through carved glyphs (calm).
// Builders take the caller's random stream and return geometry baked in world space.

// ---------------------------------------------------------------- palette (linear albedo)
/** The mountain's granite: a cool, slightly warm-grey stone (the striking stones, the ledge's crags). */
export const GRANITE = [0.08, 0.084, 0.098];
/** The ledge's worn plates: a shade warmer and flatter than the standing stone (the ground stays calm). */
export const LEDGE = [0.165, 0.163, 0.168];
/** Where forty years of blows have polished and crushed the stone: a pale bruise round each dent. */
const BRUISE = [0.42, 0.41, 0.385];
const WOOD = [0.075, 0.055, 0.042];
const OLD_WOOD = [0.065, 0.052, 0.044];
const GABLE = [0.13, 0.118, 0.105];
const THATCH = [0.07, 0.057, 0.042];
const CLAY = [0.11, 0.065, 0.045];
const CHAR = [0.05, 0.045, 0.042];
const BARK = [0.095, 0.078, 0.07];
/** Pine needles: dark, a little blue (the dawn light tints them). */
const NEEDLES = [
  [0.055, 0.115, 0.075],
  [0.062, 0.122, 0.07],
  [0.05, 0.105, 0.078],
];

const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

/** The plates' and the path's stone colour (also the colour their cracked and broken looks take). */
export const ledgeCol = (px, py, pz) => mul(LEDGE, (0.58 + 0.38 * fbm2(px * 1.3, pz * 1.3, 2)) * (0.78 + 0.24 * fbm2(px * 0.13 + 7, pz * 0.13 - 2, 2)));

// ---------------------------------------------------------------- the training ground
/** Clip a convex polygon [[x, z], ...] to the half plane nx·x + nz·z <= c. */
function clipHalf(poly, nx, nz, c) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = nx * a[0] + nz * a[1] - c, db = nx * b[0] + nz * b[1] - c;
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}
const polyArea = (p) => {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
};
const centroid = (p) => {
  let x = 0, z = 0;
  for (const q of p) {
    x += q[0] / p.length;
    z += q[1] / p.length;
  }
  return [x, z];
};

/**
 * The training ground's plates: the rock of the ledge split along old joints (a Voronoi tiling of a
 * jittered hex lattice, `pitch` m apart), clipped to the disc of radius `r`; the joints `gap` m wide.
 * Returns [{ x, z, pts (local, round x / z), area, rim }] (rim: a cell the disc's edge cut).
 */
export function ledgeCells(rng, r, { pitch = 1.95, jitter = 0.36, gap = 0.07 } = {}) {
  const sites = [];
  const dz = pitch * 0.866;
  const n = Math.ceil((r + 3) / dz);
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      const x = (i + (j & 1 ? 0.5 : 0)) * pitch + range(rng, -jitter, jitter) * pitch;
      const z = j * dz + range(rng, -jitter, jitter) * pitch;
      if (Math.hypot(x, z) < r + 2.6) sites.push([x, z]);
    }
  }
  const cells = [];
  const R = r * Math.cos(Math.PI / 64); // (the disc's edge: a 64-gon)
  for (const s of sites) {
    if (Math.hypot(s[0], s[1]) > r + 0.6) continue;
    let poly = [[s[0] - 4, s[1] - 4], [s[0] + 4, s[1] - 4], [s[0] + 4, s[1] + 4], [s[0] - 4, s[1] + 4]];
    for (const o of sites) {
      if (o === s) continue;
      const ex = o[0] - s[0], ez = o[1] - s[1];
      if (ex * ex + ez * ez > 20) continue;
      poly = clipHalf(poly, ex, ez, (ex * (s[0] + o[0])) / 2 + (ez * (s[1] + o[1])) / 2);
      if (poly.length < 3) break;
    }
    let rim = false;
    for (let k = 0; k < 64 && poly.length >= 3; k++) {
      const a = ((k + 0.5) / 64) * TAU;
      const nx = Math.cos(a), nz = Math.sin(a);
      if (poly.some(([px, pz]) => px * nx + pz * nz > R)) rim = true;
      poly = clipHalf(poly, nx, nz, R);
    }
    if (poly.length < 3) continue;
    const area = polyArea(poly);
    if (area < 0.12) continue;
    const [cx, cz] = centroid(poly);
    // the joint: each corner pulled in toward the centre
    const pts = poly.map(([px, pz]) => {
      const ex = px - cx, ez = pz - cz, l = Math.hypot(ex, ez) || 1;
      const k = Math.max(0.3, (l - gap) / l);
      return [ex * k, ez * k];
    });
    cells.push({ x: cx, z: cz, pts, area, rim });
  }
  return cells;
}

/** A plate of the ledge at (x, z) from its local outline: chamfered, laid on a slight tilt (`top`: its
 *  height over the ground, `tilt`: the most it leans, rad). */
export function ledgePlate(rng, x, z, pts, { top = [0.025, 0.045], tilt = 0.02 } = {}) {
  const g = slabGeometry(pts, { top: range(rng, top[0], top[1]), inset: 0.07, drop: 0.035 });
  const ax = range(rng, -1, 1), az = range(rng, -1, 1);
  g.applyMatrix4(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(ax, 0, az).normalize(), range(rng, 0.004, tilt)));
  g.translate(x, 0, z);
  let rad = 0;
  for (const [px, pz] of pts) rad = Math.max(rad, Math.hypot(px, pz));
  carve(g, {
    col: ledgeCol,
    ao: 0.85,
    moss: (px, py, pz) => 0.04 + 0.12 * Math.min(1, Math.hypot(px - x, pz - z) / rad),
    edge: (px, py, pz, nx, ny) => (ny > 0.5 && ny < 0.95 ? 1 : 0),
  });
  return { geo: g, outline: pts.map(([px, pz]) => [x + px, z + pz]), r: rad };
}

/** The outline of a shelf of bedrock showing through the turf: 6 - 8 corners round its centre, `r` m out. */
export function outcropOutline(rng, r) {
  const n = 6 + Math.floor(rng() * 3), a0 = rng() * TAU, pts = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU + range(rng, -0.25, 0.25), k = r * range(rng, 0.62, 1.0);
    pts.push([Math.cos(a) * k * 1.25, Math.sin(a) * k * 0.85]);
  }
  return pts;
}

// ---------------------------------------------------------------- the striking stones
/**
 * A striking stone: a squared monolith of granite, its vertical edges worn round, its crown rounded
 * and slanting, and on one face (turned by `face` round y: 0 = toward +z) a fist-deep DENT at the
 * height of a blow, a pale bruise of crushed stone round it and cracks running out from it (forty
 * years of the same blow). `deep` (1 = a dent, 1.5 = the hermit's own stone) scales the dent and its
 * cracks. Carved attributes (prop art). Returns the geometry baked in world space and the dent's world
 * point { x, y, z }.
 */
export function buildStrikingStone(rng, x, z, { h, w = 1.05, d = 0.82, face = 0, deep = 1 }) {
  const g = prep(new THREE.BoxGeometry(w, h, d, 8, 20, 4));
  g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  const hw = w / 2, hd = d / 2;
  const slant = range(rng, -0.16, 0.16), crown = range(rng, 0.1, 0.2), ch = Math.min(hw, hd) * 0.3;
  const front = new Uint8Array(p.count);
  for (let i = 0; i < p.count; i++) {
    let px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
    if (pz > hd - 1e-4) front[i] = 1;
    // the vertical edges worn round
    if (Math.abs(px) > hw - 1e-4 && Math.abs(pz) > hd - 1e-4) {
      px -= Math.sign(px) * ch;
      pz -= Math.sign(pz) * ch * 0.8;
    }
    // a little taper, a rounded, slanting crown
    const t = 1 - 0.1 * (py / h);
    px *= t;
    pz *= t;
    if (py > h - 1e-4) py -= crown * ((px / hw) ** 2 + (pz / hd) ** 2) + slant * (px / hw);
    p.setXYZ(i, px, py, pz);
  }
  lumpy(g, 0.045, 2.1, rng() * 99, new THREE.Vector3(0, h / 2, 0));

  // the dent, its bruise and its cracks, on the front face (u = x, v = y on that face)
  const u0 = range(rng, -0.1, 0.1) * w, v0 = Math.min(h - 0.6, range(rng, 1.15, 1.4));
  const R = 0.3 * Math.sqrt(deep), depth = 0.15 * deep;
  const cracks = [];
  const nc = 3 + Math.floor(rng() * 2) + (deep > 1.2 ? 2 : 0);
  for (let k = 0; k < nc; k++) {
    let a = (k / nc) * TAU + range(rng, -0.4, 0.4);
    let u = u0 + Math.cos(a) * R * 0.8, v = v0 + Math.sin(a) * R * 0.8;
    const steps = 2 + Math.floor(rng() * 3) + (deep > 1.2 ? 1 : 0);
    const pts = [[u, v]];
    for (let s = 0; s < steps; s++) {
      a += range(rng, -0.55, 0.55);
      const l = range(rng, 0.2, 0.36) * (deep > 1.2 ? 1.25 : 1);
      u += Math.cos(a) * l;
      v += Math.sin(a) * l;
      pts.push([u, v]);
    }
    cracks.push(pts);
  }
  const segDist = (u, v, a, b) => {
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((u - a[0]) * ex + (v - a[1]) * ey) / (ex * ex + ey * ey || 1)));
    return Math.hypot(u - a[0] - ex * t, v - a[1] - ey * t);
  };
  const dentK = new Float32Array(p.count), rimK = new Float32Array(p.count), crackK = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    if (!front[i]) continue;
    const u = p.getX(i), v = p.getY(i);
    const r = Math.hypot(u - u0, (v - v0) * 0.92);
    let dz = 0;
    if (r < R) {
      const k = 1 - (r / R) ** 2;
      dz -= depth * k;
      dentK[i] = k;
    }
    rimK[i] = Math.max(0, 1 - Math.abs(r - R * 1.1) / (R * 0.9));
    if (r > R && r < R * 1.3) dz += 0.012; // a lip of crushed stone
    let dc = 1e9;
    for (const c of cracks) for (let s = 1; s < c.length; s++) dc = Math.min(dc, segDist(u, v, c[s - 1], c[s]));
    const ck = Math.max(0, 1 - dc / 0.13);
    if (ck > 0 && r > R * 0.7) {
      dz -= 0.045 * ck;
      crackK[i] = ck;
    }
    p.setZ(i, p.getZ(i) + dz);
  }
  carve(g, {
    col: (px, py, pz) => mul(GRANITE, 0.72 + 0.46 * fbm2(px * 1.8 + x, pz * 1.8 + py, 2)),
    ao: (px, py) => 0.55 + 0.45 * Math.min(1, py / 1.2),
  });
  const col = g.attributes.aCol, ao = g.attributes.aAO, ed = g.attributes.aEdge;
  for (let i = 0; i < p.count; i++) {
    if (!front[i]) continue;
    let r = col.getX(i), gg = col.getY(i), b = col.getZ(i);
    const rk = rimK[i] * (1 - dentK[i]);
    // the bruise: crushed, polished stone round the dent, paler
    r += (BRUISE[0] - r) * rk;
    gg += (BRUISE[1] - gg) * rk;
    b += (BRUISE[2] - b) * rk;
    const dk = 1 - 0.8 * dentK[i]; // the pit: dark at its heart
    const ck = 1 - 0.9 * Math.min(1, crackK[i] * 1.4); // the cracks: dark lines
    col.setXYZ(i, r * dk * ck, gg * dk * ck, b * dk * ck);
    ao.setX(i, ao.getX(i) * (1 - 0.3 * dentK[i]));
    ed.setX(i, 0.5 * rk);
  }
  g.rotateY(face);
  g.translate(x, 0, z);
  const c = Math.cos(face), s = Math.sin(face);
  const fz = hd * (1 - 0.1 * (v0 / h)) - depth * 0.6;
  return { geo: g, dent: { x: x + c * u0 + s * fz, y: v0, z: z - s * u0 + c * fz } };
}

// ---------------------------------------------------------------- pines
/** A cylinder from a to b (THREE.Vector3s), radii rb at a and rt at b, `seg` sides. */
function limb(a, b, rb, rt, seg = 6) {
  _v.subVectors(b, a);
  const len = _v.length();
  const g = prep(new THREE.CylinderGeometry(rt, rb, len, seg, 1));
  g.translate(0, len / 2, 0);
  _q.setFromUnitVectors(UP, _v.normalize());
  g.applyQuaternion(_q);
  g.translate(a.x, a.y, a.z);
  return g;
}

/**
 * A wind-bent mountain pine (screen grid, like the forest's trees): a trunk bowed downwind (`wind`, an
 * angle in the xz plane: the way it leans), its crown flat pads of needles held out on bare boughs,
 * mostly downwind, the top one the widest. Returns its parts (the trunk first).
 */
export function buildBentPine(rng, x, z, s, wind) {
  const parts = [];
  const H = range(rng, 5.0, 7.2) * s;
  const lean = range(rng, 0.28, 0.55);
  const wx = Math.cos(wind), wz = Math.sin(wind);
  const px = -wz, pz = wx; // across the wind
  const wig = range(rng, -0.6, 0.6);
  const at = (t) => {
    const off = lean * H * Math.pow(t, 1.7), side = wig * Math.sin(t * Math.PI) * s;
    return new THREE.Vector3(wx * off + px * side, H * t, wz * off + pz * side);
  };
  const rad = (t) => (0.34 - 0.24 * t) * s;
  const bark = (q) => (bx, by, bz) => mul(BARK, 0.7 + 0.5 * hash2(bx * 7 + q, by * 3 + bz * 7));
  const N = 5;
  const trunk = [];
  for (let k = 0; k < N; k++) trunk.push(limb(at(k / N), at((k + 1) / N), rad(k / N), rad((k + 1) / N)));
  const tg = mergeGeometries(trunk);
  paint(tg, { col: bark(x), flag: FLAG.STONE, sway: 0.02, ao: (bx, by) => 0.55 + 0.4 * Math.min(1, by / H) });
  parts.push(tg);
  const needle = NEEDLES[Math.floor(rng() * NEEDLES.length)];
  const seed = rng() * 50;
  const pads = 4 + Math.floor(rng() * 3);
  const ts = [];
  for (let k = 0; k < pads; k++) ts.push(range(rng, 0.38, 0.92));
  ts.sort((a, b) => a - b);
  ts.push(1);
  const boughs = [];
  ts.forEach((t, k) => {
    const top = k === ts.length - 1;
    const base = at(t);
    // held out downwind, a few across or back into it
    const a = wind + (top ? range(rng, -0.4, 0.4) : rng() < 0.75 ? range(rng, -1.1, 1.1) : Math.PI + range(rng, -0.7, 0.7));
    const reach = top ? range(rng, 0.2, 0.8) * s : range(rng, 0.9, 1.9) * s * (1.1 - 0.4 * t);
    const c = new THREE.Vector3(base.x + Math.cos(a) * reach, base.y + range(rng, 0.0, 0.35) * s, base.z + Math.sin(a) * reach);
    if (!top) boughs.push(limb(base, c, 0.09 * s, 0.05 * s, 4));
    const rr = (top ? range(rng, 1.05, 1.45) : range(rng, 0.7, 1.15)) * s * (top ? 1 : 1.15 - 0.35 * t);
    // (an icosahedron of 20 faces: the screen grid prints a pad as a few letters' worth of tone; finer
    // pads cost the frame four times the vertices for nothing)
    const pad = prep(new THREE.IcosahedronGeometry(1, 0));
    lumpy(pad, 0.3, 1.7, seed + k * 3.1);
    pad.scale(rr * 1.35, rr * range(rng, 0.2, 0.27), rr * 0.95);
    pad.rotateY(-a);
    pad.translate(c.x + Math.cos(a) * rr * 0.3, c.y + rr * 0.12, c.z + Math.sin(a) * rr * 0.3);
    const y0 = c.y, ry = rr * 0.27;
    paint(pad, {
      col: (bx, by, bz) => mul(needle, 0.6 + 0.65 * fbm2(bx * 1.2 + seed, bz * 1.2 + by, 2)),
      flag: FLAG.LEAF,
      sway: (bx, by) => 0.25 + 0.6 * Math.min(1, by / (H + 1)),
      ao: (bx, by, bz, nx, ny) => (0.4 + 0.6 * Math.max(0, ny * 0.6 + 0.4)) * (0.6 + 0.4 * Math.min(1, Math.max(0, (by - y0 + ry) / (2 * ry)))),
    });
    parts.push(pad);
  });
  if (boughs.length) {
    const bg = mergeGeometries(boughs);
    paint(bg, { col: bark(z), flag: FLAG.STONE, sway: 0.08, ao: 0.75 });
    parts.splice(1, 0, bg);
  }
  for (const g of parts) g.translate(x, 0, z);
  return parts;
}

// ---------------------------------------------------------------- the Split Rock
/**
 * The Split Rock: a boulder the size of a house cut clean in two, the halves a stride apart with a
 * straight gap between them, the cut faces flat and paler (fresh stone under the weathered skin).
 * `yaw` turns the cut (0: the cut plane runs north-south). Carved attributes (prop art). Returns
 * { geos: [half, half], colliders: [[x, z, r], ...] } in world space.
 */
export function buildSplitRock(rng, { x, z, yaw = 0, s = 1 }) {
  const RX = 3.4 * s, RY = 2.5 * s, RZ = 3.8 * s; // half extents (x across the cut)
  const gap = 0.95 * s; // half the gap
  // a blocky boulder of granite: a box, its edges and corners knocked off, its faces broken into a
  // few big flat facets (each prints as one tone)
  const base = prep(new THREE.BoxGeometry(2, 2, 2, 4, 2, 3));
  const p0 = base.attributes.position;
  for (let i = 0; i < p0.count; i++) {
    let u = p0.getX(i), v = p0.getY(i), w = p0.getZ(i);
    const eu = Math.abs(u) > 0.99, ev = v > 0.99, ew = Math.abs(w) > 0.99;
    if (eu && ew) {
      u *= 0.72;
      w *= 0.76;
    }
    if (ev && (eu || ew)) {
      v -= 0.32;
      u *= 0.86;
      w *= 0.88;
    }
    p0.setXYZ(i, u * RX, v * RY, w * RZ);
  }
  lumpy(base, 0.9 * s, 0.45 / s, rng() * 99);
  lumpy(base, 0.3 * s, 1.2 / s, rng() * 99);
  base.translate(0, RY * 0.82, 0); // (its foot sunk in the ground)
  const geos = [];
  const lean = [range(rng, 0.03, 0.06), range(rng, 0.05, 0.09)];
  [-1, 1].forEach((side, k) => {
    const g = base.clone();
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getX(i) * side < 0) p.setX(i, 0);
    // the cut face: flat; each half leans a little away from the other
    g.translate(side * gap, 0, 0);
    g.rotateZ(-side * lean[k]);
    g.translate(side * lean[k] * 0.4, -0.25 * s, 0);
    const cut = (px, nx) => Math.abs(nx) > 0.985 && Math.abs(px) < gap + 0.5 * s;
    carve(g, {
      col: (px, py, pz, nx) => (cut(px, nx)
        ? mul(GRANITE, 1.0 + 0.15 * fbm2(py * 0.9 + 3, pz * 0.9, 2)) // the cut: fresh, paler, even
        : mul(GRANITE, (0.5 + 0.42 * fbm2(px * 0.7 + x, pz * 0.7 + py * 0.8, 3)) * (0.75 + 0.5 * hash2(nx * 13.1 + py * 0.3, pz * 0.37 + nx * 5.3)))),
      ao: (px, py) => 0.5 + 0.5 * Math.min(1, py / 2.2),
      edge: (px, py, pz, nx) => (cut(px, nx) ? 0.35 : 0),
    });
    g.rotateY(yaw);
    g.translate(x, 0, z);
    geos.push(g);
  });
  // colliders: a row of circles down each half
  const colliders = [];
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  for (const side of [-1, 1]) {
    for (const lz of [-2.1, 0, 2.1]) {
      const lx = side * (gap + RX * 0.5);
      colliders.push([x + c * lx + sn * lz * s, z - sn * lx + c * lz * s, 1.75 * s]);
    }
  }
  return { geos, colliders };
}

// ---------------------------------------------------------------- the hermit's hut
/**
 * The hermit's hut: old planks on a stone footing under a deep thatch roof, its gable end and its dark
 * doorway toward +z (the door stood open against the wall), the ridge running back along z; a water
 * jar by the door and a stack of firewood along the east wall. Carved attributes (prop art; it is wood
 * and burns). Returns { geos, ruin, colliders } in world space (`ruin`: the footing, charred post
 * stubs and the fallen roof's heap that stand after it burns or breaks; drawn from `rr`).
 */
export function buildHut(rng, { x, z, yaw = 0 }, rr = rng) {
  const parts = [];
  const add = (g, col, { ao = 1, edge = 0 } = {}) => {
    carve(g, { col, ao, edge });
    parts.push(g);
    return g;
  };
  const W = 2.8, D = 3.3, E = 1.85, RID = 3.0; // width (x), depth (z), the eaves' and the ridge's height
  const wood = (k) => (px, py, pz) => mul(WOOD, k * (0.7 + 0.5 * fbm2(px * 3.1 + 5, pz * 3.1 + py * 2.3, 2)));
  // the footing: a course of rough stones
  const foot = prep(new THREE.BoxGeometry(W + 0.3, 0.3, D + 0.3, 4, 1, 6));
  foot.translate(0, 0.15, 0);
  lumpy(foot, 0.08, 2.4, rng() * 9, new THREE.Vector3(0, 0.15, 0));
  add(foot, (px, py, pz) => mul(GRANITE, 0.7 + 0.5 * fbm2(px * 2.5, pz * 2.5, 2)), { ao: 0.75 });
  // the walls and the gables: a house-shaped prism along z, its planks in vertical bands
  const shape = new THREE.Shape([
    new THREE.Vector2(-W / 2, 0.3), new THREE.Vector2(W / 2, 0.3), new THREE.Vector2(W / 2, E),
    new THREE.Vector2(0, RID - 0.05), new THREE.Vector2(-W / 2, E),
  ]);
  const walls = prep(new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: false, steps: 4 }));
  walls.translate(0, 0, -D / 2);
  // (the gable toward the camera paler, weathered silver-grey: the dark doorway reads in it)
  add(walls, (px, py, pz, nx, ny, nz) => mul(nz > 0.9 ? GABLE : WOOD, (0.6 + 0.4 * fbm2(px * 3 + pz * 3, py * 0.6, 2)) * (0.75 + 0.35 * fbm2(px * 2 + pz, py * 2, 2))), { ao: (px, py) => 0.5 + 0.5 * Math.min(1, py / 1.6) });
  // corner posts and the beams under the eaves
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const post = prep(new THREE.BoxGeometry(0.2, E - 0.2, 0.2));
    post.translate(sx * (W / 2 + 0.02), 0.3 + (E - 0.3) / 2, sz * (D / 2 + 0.02));
    add(post, wood(0.9), { ao: 0.8 });
  }
  for (const sx of [-1, 1]) {
    const beam = prep(new THREE.BoxGeometry(0.18, 0.16, D + 0.5));
    beam.translate(sx * (W / 2 + 0.06), E - 0.02, 0);
    add(beam, wood(0.8), { ao: 0.7 });
  }
  // the doorway (dark) in the south gable, and the plank door stood open against the wall
  const door = prep(new THREE.BoxGeometry(0.9, 1.5, 0.06));
  door.translate(-0.2, 0.3 + 0.75, D / 2 + 0.03);
  add(door, [0.004, 0.004, 0.005], { ao: 0.3 });
  const leaf = prep(new THREE.BoxGeometry(0.7, 1.26, 0.05));
  leaf.rotateY(-1.3);
  leaf.translate(-0.68, 0.3 + 0.63, D / 2 + 0.38);
  add(leaf, wood(0.75), { ao: 0.75 });
  // the thatch: two thick, ragged slopes falling east and west, a rolled ridge along the top
  const slope = Math.atan2(RID - E, W / 2);
  const over = 0.38, run = (W / 2 + over) / Math.cos(slope), thick = 0.3;
  for (const sx of [-1, 1]) {
    // (short over the gable toward the camera, so the doorway shows under it; deep at the back)
    const roof = prep(new THREE.BoxGeometry(run, thick, D + 0.55, 4, 1, 7));
    roof.translate(run / 2, thick / 2, -0.12);
    // its lower edge ragged and drooping (straw); the upper edge meets the ridge
    const p = roof.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (p.getX(i) > run - 1e-4) {
        p.setX(i, p.getX(i) + range(rr, -0.08, 0.06));
        p.setY(i, p.getY(i) - 0.05 - 0.08 * hash2(p.getZ(i) * 7, sx));
      }
    }
    lumpy(roof, 0.07, 2.6, rng() * 9 + sx, new THREE.Vector3(run / 2, thick / 2, 0));
    roof.rotateZ(-slope);
    if (sx < 0) roof.rotateY(Math.PI);
    roof.translate(0, RID + 0.05, 0);
    // (the west slope a shade darker: the two slopes read apart under the dawn light from the east)
    const k = sx < 0 ? 0.5 : 1;
    add(roof, (px, py, pz, nx, ny) => mul(THATCH, k * (0.62 + 0.55 * fbm2(px * 3 + pz * 0.4, pz * 2.6 + py * 2, 2)) * (ny < 0 ? 0.4 : 1)), {
      ao: (px, py) => 0.5 + 0.5 * Math.min(1, Math.max(0, (py - E + 0.3) / (RID - E + 0.3))),
      edge: (px, py, pz, nx, ny) => (ny > 0.2 && py < E + 0.2 ? 0.6 : 0),
    });
  }
  const ridge = prep(new THREE.CylinderGeometry(0.24, 0.24, D + 0.6, 6, 3));
  ridge.rotateX(Math.PI / 2);
  lumpy(ridge, 0.05, 3, rng() * 9);
  ridge.translate(0, RID + 0.32, -0.12);
  add(ridge, mul(THATCH, 0.4), { ao: 0.9 }); // (a dark roll of old straw: the ridge line)
  // a water jar by the door
  const jarProf = [[0.05, 0], [0.22, 0.02], [0.3, 0.2], [0.32, 0.38], [0.24, 0.6], [0.16, 0.66], [0.18, 0.7]].map(([a, b]) => new THREE.Vector2(a, b));
  const jar = prep(new THREE.LatheGeometry(jarProf, 8));
  jar.translate(0.85, 0, D / 2 + 0.5);
  add(jar, (px, py) => mul(CLAY, 0.8 + 0.4 * Math.min(1, py / 0.5)), { ao: 0.85 });
  // a stack of firewood along the east wall
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 4 - row; k++) {
      const log = prep(new THREE.CylinderGeometry(0.1, 0.11, 1.5, 5));
      log.rotateX(Math.PI / 2);
      log.translate(W / 2 + 0.28 + (k + row * 0.5) * 0.2 - 0.3, 0.11 + row * 0.18, -0.4);
      add(log, (px, py, pz) => mul(OLD_WOOD, 0.75 + 0.5 * hash2(px * 9 + k, row + pz)), { ao: 0.8 });
    }
  }
  const g = mergeGeometries(parts);
  g.rotateY(yaw);
  g.translate(x, 0, z);

  // what is left: the footing, four charred post stubs, a heap of the fallen roof
  const rp = [foot.clone()];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const hh = range(rr, 0.4, 1.1);
    const post = prep(new THREE.BoxGeometry(0.2, hh, 0.2));
    post.translate(sx * (W / 2 + 0.02), 0.3 + hh / 2, sz * (D / 2 + 0.02));
    carve(post, { col: CHAR, ao: 0.8 });
    rp.push(post);
  }
  const heap = prep(new THREE.IcosahedronGeometry(1, 1));
  lumpy(heap, 0.35, 1.8, rr() * 9);
  heap.scale(W * 0.5, 0.42, D * 0.5);
  heap.translate(0, 0.32, 0);
  carve(heap, { col: (px, py, pz) => mul(CHAR, 0.8 + 0.6 * fbm2(px * 2.4, pz * 2.4, 2)), ao: 0.85 });
  rp.push(heap);
  const ruin = mergeGeometries(rp);
  ruin.rotateY(yaw);
  ruin.translate(x, 0, z);

  const c = Math.cos(yaw), s = Math.sin(yaw);
  const colliders = [-0.95, 0.95].map((lz) => [x + s * lz, z + c * lz, 1.45]);
  return { geos: [g], ruin: [ruin], colliders };
}

// ---------------------------------------------------------------- the crags beyond the bound
/** A crag of the mountain: a tall, leaning shard of granite (static, out of reach). Carved. */
export function buildCrag(rng, x, z, { h, r }) {
  const g = prep(new THREE.CylinderGeometry(r * 0.45, r, h, 6, 4));
  g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > h * 0.95) p.setY(i, p.getY(i) - hash2(p.getX(i) * 5 + x, p.getZ(i) * 5 + z) * h * 0.18);
  lumpy(g, r * 0.35, 0.9 / r, rng() * 99, new THREE.Vector3(0, h / 2, 0));
  g.rotateZ(range(rng, -0.12, 0.12));
  g.rotateX(range(rng, -0.12, 0.12));
  g.rotateY(rng() * TAU);
  carve(g, {
    col: (px, py, pz) => mul(GRANITE, 0.6 + 0.5 * fbm2(px * 0.8 + x, pz * 0.8 + py * 0.6, 3)),
    ao: (px, py) => 0.5 + 0.5 * Math.min(1, py / 3),
  });
  g.translate(x, -0.3, z);
  return g;
}
