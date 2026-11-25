import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FLAG, createAsciiObjectMaterial, createCarvedGlyphMaterial, createPropArtMaterial } from '../render/materials.js';
import { markCaster, LAYER_CASTER } from '../render/pipeline.js';
import { mulberry32, range, hash2, fbm2 } from '../core/rng.js';
import { CONFIG } from '../core/config.js';
import { TAU } from '../core/math.js';
import { buildElderWyrm, buildCinderTree, buildCinderStump, landmarkPoint, ELDER_COLLIDERS } from './landmarks.js';
import { BREAK } from './breakTuning.js';
import { lookOf } from '../entities/enemies/duelist/lookSwitch.js';
import { RIDGE, GROWTH, THICKET, DEADFALL, ridgeAt } from './forestTuning.js';
import { DEAD_WOOD, buildBush, buildFern, buildBramble, buildLog, buildLeaner, buildRootPlate, buildMossRock, buildCrag, buildRoots, buildMoss } from './undergrowth.js';

// Procedural forest ring around a moonlit clearing: blob oaks and pines (leaf-ramp ASCII),
// a broken standing-stone circle, boulders, flagstones, the bones of past challengers near
// the wyrm's nest, and the bonfire at the southern entrance. Everything is merged into a few
// meshes. Trees, bones and the bonfire use the AsciiObject material (the post pass renders them
// as character grids); standing stones, boulders and flagstones use the CarvedGlyph material
// (crisp world-fixed glyphs on the stone itself, see STYLE.md).

// ---------- small helpers ----------
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t);
  const h = (a, b, c) => hash2(a * 7 + c * 131, b * 13 - c * 57);
  const lx = s(xf), ly = s(yf), lz = s(zf);
  const L = (a, b, t) => a + (b - a) * t;
  return L(
    L(L(h(xi, yi, zi), h(xi + 1, yi, zi), lx), L(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), lx), ly),
    L(L(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), lx), L(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), lx), ly),
    lz,
  );
}

export function prep(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name);
  return g;
}

/**
 * Cut a non-indexed geometry's triangles finer, in place, without changing its shape: a triangle
 * whose longest edge is over `L` m is cut in two at that edge's middle, pass after pass, so the
 * breakables' bricks (BREAK.chip: a blow takes the triangles where it struck) are about a letter cell
 * and not a 2 m face of a trunk. Every edge longer than `L` ends up cut at its middle by both
 * triangles that share it, so no seam opens. Every attribute is carried to the new corners (the
 * middle of two: what the rasteriser drew there anyway; normals are made unit again). No new geometry
 * object is made.
 */
export function refine(geo, L, passes = 10) {
  if (!geo || geo.index || !(L > 0)) return geo;
  // a thin part (a bough, a blade, a finger bone: its triangles' short edges average under
  // BREAK.chip.thin m) is left as it is: it snaps off in the pieces it has
  {
    const p = geo.attributes.position?.array;
    if (!p) return geo;
    let sum = 0, n = 0;
    for (let k = 0; k + 8 < p.length; k += 9) {
      const a = Math.hypot(p[k] - p[k + 3], p[k + 1] - p[k + 4], p[k + 2] - p[k + 5]);
      const b = Math.hypot(p[k + 3] - p[k + 6], p[k + 4] - p[k + 7], p[k + 5] - p[k + 8]);
      const c = Math.hypot(p[k + 6] - p[k], p[k + 7] - p[k + 1], p[k + 8] - p[k + 2]);
      sum += Math.min(a, b, c);
      n++;
    }
    if (!n || sum / n < BREAK.chip.thin) return geo;
  }
  const names = Object.keys(geo.attributes);
  const size = names.map((k) => geo.attributes[k].itemSize);
  let A = names.map((k) => Array.from(geo.attributes[k].array));
  const pi = names.indexOf('position');
  if (pi < 0) return geo;
  const L2 = L * L;
  let changed = false;
  for (let pass = 0; pass < passes; pass++) {
    const P = A[pi], n = P.length / 3;
    const B = names.map(() => []);
    // a corner: vertex i of the current arrays, or the middle of i and j
    const put = (i, j = -1) => {
      for (let a = 0; a < A.length; a++) {
        const k = size[a], src = A[a], dst = B[a];
        if (j < 0) for (let c = 0; c < k; c++) dst.push(src[i * k + c]);
        else for (let c = 0; c < k; c++) dst.push((src[i * k + c] + src[j * k + c]) * 0.5);
      }
    };
    const len2 = (i, j) => (P[i * 3] - P[j * 3]) ** 2 + (P[i * 3 + 1] - P[j * 3 + 1]) ** 2 + (P[i * 3 + 2] - P[j * 3 + 2]) ** 2;
    let split = false;
    for (let v = 0; v + 2 < n; v += 3) {
      const l0 = len2(v, v + 1), l1 = len2(v + 1, v + 2), l2 = len2(v + 2, v);
      const m = Math.max(l0, l1, l2);
      if (!(m > L2)) {
        put(v); put(v + 1); put(v + 2);
        continue;
      }
      split = true;
      // turned so its longest edge is a - b (the first of equals: both sides of an edge see the same lengths)
      const r = l0 === m ? 0 : l1 === m ? 1 : 2;
      const a = v + r, b = v + ((r + 1) % 3), c = v + ((r + 2) % 3);
      put(a); put(a, b); put(c);
      put(a, b); put(b); put(c);
    }
    if (!split) break;
    A = B;
    changed = true;
  }
  if (!changed) return geo;
  for (let a = 0; a < names.length; a++) {
    const old = geo.attributes[names[a]], arr = new old.array.constructor(A[a]);
    if (names[a] === 'normal') {
      for (let i = 0; i + 2 < arr.length; i += 3) {
        const l = Math.hypot(arr[i], arr[i + 1], arr[i + 2]) || 1;
        arr[i] /= l; arr[i + 1] /= l; arr[i + 2] /= l;
      }
    }
    const next = new THREE.BufferAttribute(arr, old.itemSize, old.normalized);
    next.setUsage(old.usage);
    geo.setAttribute(names[a], next);
  }
  geo.boundingBox = null;
  geo.boundingSphere = null;
  return geo;
}

/** The longest edge a brick may have when the level is built with bites on (`?chip=a`; else 0: the meshes as they were). */
export const brickEdge = () => (lookOf('chip', 'a', 'a') !== '0' ? BREAK.chip.brick : 0);

/** Displace vertices along their direction from `center` by 3D noise (watertight: position-keyed). */
export function lumpy(geo, amp, freq, seed = 0, center = new THREE.Vector3()) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = noise3(v.x * freq + seed, v.y * freq - seed * 0.7, v.z * freq + seed * 1.3) - 0.5;
    const dir = v.clone().sub(center);
    const len = dir.length() || 1;
    v.addScaledVector(dir, (n * amp) / len);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return geo;
}

/** Bake per-vertex aCol/aFlag/aSway/aAO. col/sway/ao may be constants or fn(x,y,z,nx,ny,nz). */
export function paint(geo, { col, flag, sway = 0, ao = 1 }) {
  geo.computeVertexNormals();
  const p = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const n = p.count;
  const aCol = new Float32Array(n * 3);
  const aFlag = new Float32Array(n).fill(flag);
  const aSway = new Float32Array(n);
  const aAO = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const nx = nrm.getX(i), ny = nrm.getY(i), nz = nrm.getZ(i);
    const c = typeof col === 'function' ? col(x, y, z, nx, ny, nz) : col;
    aCol[i * 3] = c[0];
    aCol[i * 3 + 1] = c[1];
    aCol[i * 3 + 2] = c[2];
    aSway[i] = typeof sway === 'function' ? sway(x, y, z) : sway;
    aAO[i] = typeof ao === 'function' ? ao(x, y, z, nx, ny, nz) : ao;
  }
  geo.setAttribute('aCol', new THREE.BufferAttribute(aCol, 3));
  geo.setAttribute('aFlag', new THREE.BufferAttribute(aFlag, 1));
  geo.setAttribute('aSway', new THREE.BufferAttribute(aSway, 1));
  geo.setAttribute('aAO', new THREE.BufferAttribute(aAO, 1));
  return geo;
}

/**
 * Bake CarvedGlyph attributes: aCol (albedo), aAO, aMoss (moss tendency 0..1), aInk (glyph
 * brightness/density) and aEdge (moonlit chamfer band). Each may be a constant or
 * fn(x, y, z, nx, ny, nz). Normals stay flat per facet: every facet reads as a carved plane.
 */
export function carve(geo, { col, ao = 1, moss = 0, ink = 1, edge = 0 }) {
  geo.computeVertexNormals();
  const p = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const n = p.count;
  const attrs = {
    aCol: new Float32Array(n * 3),
    aAO: new Float32Array(n),
    aMoss: new Float32Array(n),
    aInk: new Float32Array(n),
    aEdge: new Float32Array(n),
  };
  const val = (v, args) => (typeof v === 'function' ? v(...args) : v);
  for (let i = 0; i < n; i++) {
    const args = [p.getX(i), p.getY(i), p.getZ(i), nrm.getX(i), nrm.getY(i), nrm.getZ(i)];
    const c = val(col, args);
    attrs.aCol.set(c, i * 3);
    attrs.aAO[i] = val(ao, args);
    attrs.aMoss[i] = val(moss, args);
    attrs.aInk[i] = val(ink, args);
    attrs.aEdge[i] = val(edge, args);
  }
  geo.setAttribute('aCol', new THREE.BufferAttribute(attrs.aCol, 3));
  for (const k of ['aAO', 'aMoss', 'aInk', 'aEdge']) geo.setAttribute(k, new THREE.BufferAttribute(attrs[k], 1));
  return geo;
}

/**
 * Irregular polygon slab with a chamfered top edge: flat top fan, a bevel ring that catches the
 * moon (the slab's crisp edge), short walls running down into the soil. pts: [[x, z], ...] around
 * the centre (star-shaped). Non-indexed, so normals come out flat per facet.
 */
export function slabGeometry(pts, { top = 0.04, inset = 0.07, drop = 0.045, bottom = -0.2 } = {}) {
  const n = pts.length;
  let cx = 0, cz = 0;
  for (const [x, z] of pts) {
    cx += x / n;
    cz += z / n;
  }
  const inner = pts.map(([x, z]) => {
    const dx = x - cx, dz = z - cz, l = Math.hypot(dx, dz) || 1;
    const k = Math.max(0.3, (l - inset) / l);
    return [cx + dx * k, cz + dz * k];
  });
  const pos = [];
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  // push a triangle wound so its normal points along the hint (hx, hy, hz)
  const face = (a, b, c, hx, hy, hz) => {
    e1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    e2.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    e1.cross(e2);
    if (e1.x * hx + e1.y * hy + e1.z * hz < 0) pos.push(...a, ...c, ...b);
    else pos.push(...a, ...b, ...c);
  };
  const C = [cx, top, cz];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const A = [inner[i][0], top, inner[i][1]], B = [inner[j][0], top, inner[j][1]];
    const P = [pts[i][0], top - drop, pts[i][1]], Q = [pts[j][0], top - drop, pts[j][1]];
    const E = [pts[i][0], bottom, pts[i][1]], F = [pts[j][0], bottom, pts[j][1]];
    const ox = (pts[i][0] + pts[j][0]) / 2 - cx, oz = (pts[i][1] + pts[j][1]) / 2 - cz;
    face(C, A, B, 0, 1, 0);
    face(A, B, Q, ox, 1, oz);
    face(A, Q, P, ox, 1, oz);
    face(P, Q, F, ox, 0, oz);
    face(P, F, E, ox, 0, oz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

export const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// ---------- palette (linear) ----------
// leaf albedos carry little blue: the moonlight already tints everything teal
const LEAF = [
  [0.17, 0.29, 0.13],
  [0.14, 0.27, 0.15],
  [0.19, 0.3, 0.12],
  [0.13, 0.23, 0.13],
  [0.2, 0.29, 0.16],
];
const PINE = [
  [0.09, 0.19, 0.1],
  [0.1, 0.2, 0.09],
  [0.08, 0.16, 0.1],
];
export const BARK = [0.12, 0.09, 0.075];
export const STONE = [0.15, 0.165, 0.205];
const BONE = [0.27, 0.255, 0.22];

// carved-glyph looks (createCarvedGlyphMaterial options; see STYLE.md "stones")
export const STONE_LOOK = {
  // standing stones, boulders: lit faces climb to dense blocks, the shadow side drops to dots
  gain: 2.9,
  lumScale: 4.0,
  jitter: 0.42,
  // caps and fallen faces: blocky symbols, few dashes (rows of '=' read as text)
  topGlyphs: ['.  .', '. ,:', ':;.:', ';%:=', '%#;&', '#%8&'],
};
export const SLAB_LOOK = {
  // flagstones: the ground must stay calm, so dimmer ink, a lower ramp and a chipped moonlit rim
  gain: 2.1,
  lumScale: 2.3,
  jitter: 0.5,
  inkFloor: 0.06,
  edge: 0.5,
  topGlyphs: ['.  :', '.:;,', ':;=-', '=;%:', '%=#;', '#%&='],
};

// ---------- builders ----------
function buildOak(rng, x, z, s) {
  const parts = [];
  const lean = new THREE.Vector2(range(rng, -0.12, 0.12), range(rng, -0.12, 0.12));
  const trunkH = range(rng, 3.4, 4.4) * s;
  const trunk = prep(new THREE.CylinderGeometry(0.2 * s, 0.42 * s, trunkH, 7, 3));
  trunk.translate(0, trunkH / 2, 0);
  {
    const p = trunk.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      p.setX(i, p.getX(i) + lean.x * y);
      p.setZ(i, p.getZ(i) + lean.y * y);
    }
  }
  paint(trunk, {
    col: (px, py) => mul(BARK, 0.75 + 0.5 * hash2(px * 9 + x, py * 5 + z)),
    flag: FLAG.STONE,
    sway: (px, py) => (py / trunkH) * 0.15,
    ao: (px, py) => 0.55 + 0.45 * Math.min(1, py / trunkH),
  });
  parts.push(trunk);

  const cTop = new THREE.Vector3(lean.x * trunkH, trunkH + 1.1 * s, lean.y * trunkH);
  const nBlobs = 4 + Math.floor(rng() * 3);
  const leaf = LEAF[Math.floor(rng() * LEAF.length)];
  const canopyBottom = trunkH - 0.6 * s;
  const canopyTop = trunkH + 3.6 * s;
  const seed = rng() * 100;
  for (let b = 0; b < nBlobs; b++) {
    const r = range(rng, 1.4, 2.3) * s;
    const ico = prep(new THREE.IcosahedronGeometry(r, 1));
    const a = (b / nBlobs) * TAU + rng() * 0.8;
    const d = b === 0 ? 0 : range(rng, 0.9, 1.8) * s;
    const off = new THREE.Vector3(Math.cos(a) * d, range(rng, -0.5, 0.9) * s + (b === 0 ? 0.8 * s : 0), Math.sin(a) * d);
    ico.scale(1, 0.82, 1);
    lumpy(ico, r * 0.42, 1.25 / s, seed + b);
    ico.translate(cTop.x + off.x, cTop.y + off.y, cTop.z + off.z);
    paint(ico, {
      col: (px, py, pz) => {
        const n = fbm2(px * 0.9 + seed, pz * 0.9 - py * 0.5, 2);
        return mul(leaf, 0.62 + 0.62 * n);
      },
      flag: FLAG.LEAF,
      sway: (px, py) => 0.6 + 0.6 * Math.max(0, (py - canopyBottom) / (canopyTop - canopyBottom)),
      ao: (px, py, pz) => {
        const h = Math.max(0, Math.min(1, (py - canopyBottom) / (canopyTop - canopyBottom)));
        const hollow = noise3(px * 0.75 + seed, py * 0.75, pz * 0.75) > 0.66 ? 0.42 : 1;
        return (0.55 + 0.45 * h) * hollow;
      },
    });
    parts.push(ico);
  }
  for (const g of parts) g.translate(x, 0, z);
  return parts;
}

function buildPine(rng, x, z, s) {
  const parts = [];
  const trunkH = 2.0 * s;
  const trunk = prep(new THREE.CylinderGeometry(0.12 * s, 0.28 * s, trunkH + 1.5 * s, 6, 2));
  trunk.translate(0, (trunkH + 1.5 * s) / 2, 0);
  paint(trunk, { col: mul(BARK, 0.9), flag: FLAG.STONE, sway: 0.05, ao: 0.6 });
  parts.push(trunk);
  const tiers = 4;
  const col = PINE[Math.floor(rng() * PINE.length)];
  const seed = rng() * 50;
  const top = trunkH + tiers * 1.55 * s + 1.0 * s;
  for (let t = 0; t < tiers; t++) {
    const r = (2.1 - t * 0.42) * s;
    const h = 2.5 * s;
    const cone = prep(new THREE.ConeGeometry(r, h, 9, 2, true));
    cone.rotateY(rng() * TAU);
    const y0 = trunkH + t * 1.55 * s;
    cone.translate(0, y0 + h / 2, 0);
    lumpy(cone, r * 0.32, 1.6 / s, seed + t, new THREE.Vector3(0, y0 + h / 2, 0));
    paint(cone, {
      col: (px, py, pz) => mul(col, 0.65 + 0.6 * fbm2(px * 1.3 + seed, pz * 1.3 + py, 2)),
      flag: FLAG.LEAF,
      sway: (px, py) => 0.3 + 0.7 * (py / top),
      ao: (px, py, pz, nx, ny) => (0.45 + 0.55 * Math.max(0, ny * 0.5 + 0.5)) * (0.55 + 0.45 * ((py - y0) / h)),
    });
    parts.push(cone);
  }
  for (const g of parts) g.translate(x, 0, z);
  return parts;
}

export function buildDeadTree(rng, x, z, s) {
  const parts = [];
  const h = range(rng, 4.5, 6.5) * s;
  const trunk = prep(new THREE.CylinderGeometry(0.14 * s, 0.38 * s, h, 6, 4));
  trunk.translate(0, h / 2, 0);
  lumpy(trunk, 0.18 * s, 1.2, rng() * 10, new THREE.Vector3(0, h / 2, 0));
  const dead = [0.16, 0.155, 0.16];
  paint(trunk, { col: dead, flag: FLAG.STONE, sway: 0, ao: (px, py) => 0.5 + 0.5 * (py / h) });
  parts.push(trunk);
  const nb = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < nb; i++) {
    const len = range(rng, 1.4, 2.6) * s;
    const br = prep(new THREE.CylinderGeometry(0.03 * s, 0.11 * s, len, 4, 1));
    br.translate(0, len / 2, 0);
    br.rotateZ(range(rng, 0.5, 1.1));
    br.rotateY(rng() * TAU);
    br.translate(0, h * range(rng, 0.45, 0.9), 0);
    paint(br, { col: dead, flag: FLAG.STONE, sway: 0.1, ao: 0.85 });
    parts.push(br);
  }
  for (const g of parts) g.translate(x, 0, z);
  return parts;
}

export function buildStandingStone(rng, x, z, { h, w, d, yaw, fallen = false, broken = false }) {
  const g = prep(new THREE.BoxGeometry(w, h, d, 2, 5, 2));
  g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = 1 - 0.28 * (y / h);
    p.setX(i, p.getX(i) * t);
    p.setZ(i, p.getZ(i) * t);
    if (broken && y > h * 0.9) p.setY(i, y - hash2(p.getX(i) * 20, p.getZ(i) * 20) * h * 0.25);
  }
  lumpy(g, 0.22, 1.7, rng() * 99, new THREE.Vector3(0, h / 2, 0));
  if (fallen) {
    g.rotateX(Math.PI / 2 - 0.08);
    g.translate(0, d / 2 - 0.1, 0);
  }
  g.rotateY(yaw);
  carve(g, {
    col: (px, py, pz) => mul(STONE, 0.75 + 0.5 * fbm2(px * 1.7 + x, pz * 1.7 + py, 2)),
    // moss on the caps and creeping up from the grass line
    moss: (px, py, pz, nx, ny) => (ny > 0.55 ? 0.8 : py < 0.5 ? 0.6 : 0.1),
    ao: (px, py) => 0.55 + 0.45 * Math.min(1, py / 1.2),
  });
  g.translate(x, 0, z);
  return g;
}

export function buildBoulder(rng, x, z, r) {
  // low-poly on purpose: few big facets, each one a carved plane with its own glyph family
  const g = prep(new THREE.IcosahedronGeometry(r, 0));
  lumpy(g, r * 0.45, 1.4 / r, rng() * 99);
  g.scale(1, range(rng, 0.5, 0.75), 1);
  g.rotateY(rng() * TAU);
  g.translate(x, r * 0.2, z);
  carve(g, {
    col: (px, py, pz) => mul(STONE, 0.7 + 0.55 * fbm2(px * 1.4, pz * 1.4 + py, 2)),
    moss: (px, py, pz, nx, ny) => (ny > 0.6 ? 0.6 : py < 0.3 ? 0.35 : 0.06),
    ink: 0.9,
    ao: (px, py) => 0.5 + 0.5 * Math.min(1, py / (r * 0.8)),
  });
  return g;
}

/**
 * Half-sunk, partly overgrown flagstone: an irregular 5-7 sided slab with a moonlit chamfer,
 * tilted so one side dips into the soil. Returns the geometry and its world-space outline (the
 * grass grows up to and through it, see meadowDensity).
 */
export function buildFlagstone(rng, x, z, w, d, yaw) {
  const r2 = mulberry32(Math.floor(rng() * 4294967296)); // one draw keeps the main layout sequence
  const sides = 5 + Math.floor(r2() * 3);
  const a0 = r2() * TAU;
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = a0 + ((i + (r2() - 0.5) * 0.55) / sides) * TAU;
    const rr = 0.86 + r2() * 0.28;
    pts.push([Math.cos(a) * rr * w * 0.5, Math.sin(a) * rr * d * 0.5]);
  }
  const g = slabGeometry(pts, { top: range(r2, 0.035, 0.06), inset: 0.075, drop: 0.05 });
  const tiltAxis = new THREE.Vector3(Math.cos(a0 * 1.7), 0, Math.sin(a0 * 1.7));
  g.applyMatrix4(new THREE.Matrix4().makeRotationAxis(tiltAxis, range(r2, 0.02, 0.07)));
  g.rotateY(yaw);
  g.translate(x, 0, z);
  const rad = Math.max(w, d) * 0.5;
  carve(g, {
    col: (px, py, pz) => mul(STONE, 0.6 + 0.4 * fbm2(px * 2, pz * 2, 2)),
    ao: 0.85,
    // moss creeps in from the rim
    moss: (px, py, pz) => 0.12 + 0.38 * Math.min(1, Math.hypot(px - x, pz - z) / rad),
    edge: (px, py, pz, nx, ny) => (ny > 0.5 && ny < 0.95 ? 1 : 0),
  });
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const outline = pts.map(([px, pz]) => [x + c * px + s * pz, z - s * px + c * pz]);
  return { geo: g, outline };
}

/**
 * The nest: the great ribcage and skull of an older wyrm (each rib and the skull tagged `userData.piece`:
 * forest.js makes them breakables, 2026-11-16) and, loose round
 * them, its vertebrae and the remains of fallen knights (helms, swords, long bones). Returns
 * { parts: the fixed geometries, loose: [{ kind, mat?, geos, x, z, r }] } (the loose ones are
 * breakables). The random sequence is the one this builder always drew (the layout does not move).
 */
function buildBones(rng, cx, cz) {
  const parts = [];
  const loose = [];
  const add = (geo, colK = 1, to = parts) => {
    paint(geo, { col: (px, py, pz) => mul(BONE, colK * (0.7 + 0.45 * hash2(px * 11, pz * 11 + py))), flag: FLAG.ART_PROP, ao: 0.9 });
    to.push(geo);
    return geo;
  };
  // great ribcage of an older wyrm, half sunk into the earth
  const ribs = 7;
  const spineYaw = -0.5;
  const dir = new THREE.Vector2(Math.sin(spineYaw), Math.cos(spineYaw));
  for (let i = 0; i < ribs; i++) {
    const t = i / (ribs - 1);
    const rad = 2.4 - Math.abs(t - 0.35) * 1.8;
    for (const side of [-1, 1]) {
      const arc = prep(new THREE.TorusGeometry(rad, 0.13, 5, 12, Math.PI * 0.62));
      arc.rotateZ(side > 0 ? 0.15 : Math.PI - 0.15 - Math.PI * 0.62);
      arc.rotateY(spineYaw); // rib plane perpendicular to the spine
      const along = (i - ribs / 2) * 0.95;
      arc.translate(cx + dir.x * along, -0.35, cz + dir.y * along);
      add(arc).userData.piece = `nestRib${i}${side > 0 ? 'R' : 'L'}`;
    }
  }
  // spine vertebrae (gently curving, some missing): loose, in three runs of the spine
  const runs = [[], [], []];
  for (let i = -6; i < 7; i++) {
    if (rng() < 0.18) continue;
    const v = prep(new THREE.BoxGeometry(0.3, 0.22, 0.42));
    const bend = Math.sin(i * 0.35) * 0.6;
    v.rotateY(spineYaw + rng() * 0.5);
    v.translate(cx + dir.x * i * 0.62 + dir.y * bend, -0.02, cz + dir.y * i * 0.62 - dir.x * bend);
    add(v, 0.8, runs[i < -2 ? 0 : i < 3 ? 1 : 2]);
  }
  for (let k = 0; k < 3; k++) {
    if (!runs[k].length) continue;
    const mid = (k - 1) * 3.1 + 0.3;
    loose.push({ kind: 'bone', geos: runs[k], x: cx + dir.x * mid, z: cz + dir.y * mid, r: 1.5 });
  }
  // giant skull
  const skull = prep(new THREE.IcosahedronGeometry(1.0, 1));
  skull.scale(0.95, 0.7, 1.5);
  lumpy(skull, 0.25, 2.2, 5);
  const snout = prep(new THREE.BoxGeometry(0.9, 0.55, 1.6, 2, 1, 2));
  snout.translate(0, -0.1, 1.5);
  const hornL = prep(new THREE.ConeGeometry(0.2, 1.6, 5));
  hornL.rotateX(-1.9);
  hornL.translate(0.55, 0.5, -1.2);
  const hornR = hornL.clone();
  hornR.translate(-1.1, 0, 0);
  for (const g of [skull, snout, hornL, hornR]) {
    g.rotateY(spineYaw + 2.6);
    g.translate(cx + dir.x * -5.6 + 1.2, 0.2, cz + dir.y * -5.6 - 0.4);
    add(g, 1.05).userData.piece = 'nestSkull';
  }
  // remains of fallen knights: helms, swords, long bones (loose: each its own piece)
  for (let i = 0; i < 9; i++) {
    const a = rng() * TAU, r = range(rng, 2.5, 8);
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (rng() < 0.4) {
      const helm = prep(new THREE.SphereGeometry(0.24, 7, 5, 0, TAU, 0, Math.PI * 0.6));
      helm.translate(x, 0.0, z);
      paint(helm, { col: [0.2, 0.21, 0.23], flag: FLAG.ART_PROP, ao: 0.9 });
      loose.push({ kind: 'helm', mat: 'metal', geos: [helm], x, z, r: 0.3 });
    } else if (rng() < 0.5) {
      const sword = prep(new THREE.BoxGeometry(0.08, 1.15, 0.03));
      sword.translate(0, 0.45, 0);
      sword.rotateZ(range(rng, -0.4, 0.4));
      sword.rotateY(rng() * TAU);
      sword.translate(x, 0, z);
      paint(sword, { col: [0.3, 0.31, 0.34], flag: FLAG.ART_PROP, ao: 1 });
      loose.push({ kind: 'sword', mat: 'metal', geos: [sword], x, z, r: 0.3 });
    } else {
      const bone = prep(new THREE.CylinderGeometry(0.05, 0.07, 0.9, 5));
      bone.rotateZ(Math.PI / 2);
      bone.rotateY(rng() * TAU);
      bone.translate(x, 0.05, z);
      loose.push({ kind: 'bone', geos: [add(bone, 1, [])], x, z, r: 0.45 });
    }
  }
  return { parts, loose };
}

/**
 * A flagstone broken into shards (what is left where one was smashed: its `broken` range). From its
 * world outline: three or four wedges round its centre, each pulled in, pushed out a little, sunk at a
 * tilt, carved like the slab. Draws on `rng` (the breakables' own stream).
 */
function buildFlagShards(rng, x, z, outline) {
  const n = outline.length;
  const cuts = 3 + Math.floor(rng() * 2);
  const parts = [];
  const a0 = Math.floor(rng() * n);
  for (let c = 0; c < cuts; c++) {
    const i0 = a0 + Math.floor((c * n) / cuts), i1 = a0 + Math.floor(((c + 1) * n) / cuts);
    const pts = [[x, z]];
    for (let i = i0; i <= i1; i++) pts.push(outline[i % n]);
    let mx = 0, mz = 0;
    for (const [px, pz] of pts) {
      mx += px / pts.length;
      mz += pz / pts.length;
    }
    // pulled in round its own middle (the cracks between them), pushed out from the slab's centre
    const ox = mx - x, oz = mz - z, ol = Math.hypot(ox, oz) || 1;
    const push = 0.05 + rng() * 0.1;
    const local = pts.map(([px, pz]) => [(px - mx) * 0.86, (pz - mz) * 0.86]);
    const g = slabGeometry(local, { top: range(rng, 0.01, 0.05), inset: 0.05, drop: 0.04 });
    const tilt = new THREE.Vector3(rng() - 0.5, 0, rng() - 0.5).normalize();
    g.applyMatrix4(new THREE.Matrix4().makeRotationAxis(tilt, range(rng, 0.04, 0.16)));
    g.translate(mx + (ox / ol) * push, -range(rng, 0.0, 0.03), mz + (oz / ol) * push);
    parts.push(g);
  }
  const g = mergeGeometries(parts);
  let rad = 0.3;
  for (const [px, pz] of outline) rad = Math.max(rad, Math.hypot(px - x, pz - z));
  carve(g, {
    col: (px, py, pz) => mul(STONE, 0.5 + 0.4 * fbm2(px * 2, pz * 2, 2)),
    ao: 0.8,
    moss: (px, py, pz) => 0.1 + 0.3 * Math.min(1, Math.hypot(px - x, pz - z) / rad),
    edge: (px, py, pz, nx, ny) => (ny > 0.5 && ny < 0.95 ? 1 : 0),
  });
  return g;
}

export function buildBonfire(rng, x, z) {
  const parts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + rng() * 0.3;
    const st = prep(new THREE.IcosahedronGeometry(0.2, 0));
    lumpy(st, 0.1, 4, i);
    st.scale(1, 0.7, 1);
    st.translate(x + Math.cos(a) * 0.72, 0.08, z + Math.sin(a) * 0.72);
    paint(st, { col: mul(STONE, 1.1), flag: FLAG.ART_PROP, ao: 0.9 });
    parts.push(st);
  }
  const ash = prep(new THREE.SphereGeometry(0.55, 10, 4, 0, TAU, 0, Math.PI / 2));
  ash.scale(1, 0.22, 1);
  ash.translate(x, 0, z);
  paint(ash, { col: [0.06, 0.055, 0.05], flag: FLAG.ART_PROP, ao: 1 });
  parts.push(ash);
  for (let i = 0; i < 3; i++) {
    const log = prep(new THREE.CylinderGeometry(0.07, 0.09, 0.95, 5));
    log.rotateZ(Math.PI / 2 - 0.35);
    log.rotateY((i / 3) * TAU);
    log.translate(x, 0.22, z);
    paint(log, { col: [0.05, 0.035, 0.025], flag: FLAG.ART_PROP, ao: 0.8 });
    parts.push(log);
  }
  const sword = prep(new THREE.BoxGeometry(0.09, 1.25, 0.035));
  const guard = prep(new THREE.BoxGeometry(0.34, 0.06, 0.06));
  guard.translate(0, 0.42, 0);
  sword.translate(0, 0.2, 0);
  for (const g of [sword, guard]) {
    g.rotateZ(0.12);
    g.rotateY(0.6);
    g.translate(x, 0.35, z);
    paint(g, { col: [0.32, 0.31, 0.3], flag: FLAG.ART_PROP, ao: 1 });
    parts.push(g);
  }
  return parts;
}

// ---------- what is left when something breaks (world/destructibles.js: a breakable's `broken`) ----------
/** A splintered stump (screen grid): what stands where a tree was felled or burned through. */
export function buildStump(rng, x, z, s, col = BARK) {
  const h = range(rng, 0.55, 1.05) * s;
  const g = prep(new THREE.CylinderGeometry(0.24 * s, 0.42 * s, h, 7, 2));
  g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > h * 0.9) p.setY(i, p.getY(i) - hash2(p.getX(i) * 9 + x, p.getZ(i) * 9 + z) * h * 0.45);
  lumpy(g, 0.07 * s, 2, rng() * 9, new THREE.Vector3(0, h / 2, 0));
  paint(g, { col: (px, py) => mul(col, 0.7 + 0.5 * hash2(px * 9 + x, py * 5 + z)), flag: FLAG.STONE, ao: (px, py) => 0.6 + 0.4 * (py / h) });
  g.translate(x, 0, z);
  return [g];
}

/** A jagged base and a few lumps (carved, for prop art): what is left of a broken stone or pillar. */
export function buildRubble(rng, x, z, r, { col = STONE, h = 0.5 } = {}) {
  const parts = [];
  const base = prep(new THREE.CylinderGeometry(r * 0.7, r * 0.95, h, 6, 1));
  base.translate(0, h / 2, 0);
  const p = base.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > h * 0.9) p.setY(i, p.getY(i) - hash2(p.getX(i) * 11 + x, p.getZ(i) * 11 + z) * h * 0.7);
  lumpy(base, 0.1, 2.2, rng() * 99, new THREE.Vector3(0, h / 2, 0));
  parts.push(base);
  const n = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU, d = r * range(rng, 1.0, 1.9), s = r * range(rng, 0.28, 0.5);
    const lump = prep(new THREE.IcosahedronGeometry(s, 0));
    lumpy(lump, s * 0.4, 1.6 / s, rng() * 99);
    lump.scale(1, 0.7, 1);
    lump.translate(Math.cos(a) * d, s * 0.35, Math.sin(a) * d);
    parts.push(lump);
  }
  const g = mergeGeometries(parts);
  carve(g, {
    col: (px, py, pz) => mul(col, 0.7 + 0.5 * fbm2(px * 2.1 + x, pz * 2.1 + py, 2)),
    ao: (px, py) => 0.55 + 0.45 * Math.min(1, py / 0.6),
  });
  g.translate(x, 0, z);
  return [g];
}

/** The top of a list of geometries (world y): a breakable's height. */
export function geosHeight(geos) {
  let h = 0;
  for (const g of geos) {
    g.computeBoundingBox();
    h = Math.max(h, g.boundingBox.max.y);
  }
  return h;
}

// ---------- runs of a static mesh: the breakables whose bodies stay in it ('range' pieces) ----------
/**
 * Collects geometries for one merged mesh and hands out the run of vertices each breakable's go to:
 * `add(geos, leaf?)` -> `{ mesh (filled by finish), start, count, parts, leaf }` (parts: each geometry's
 * vertex count, the pieces a tree drops as it wears down; leaf(i): that part is foliage);
 * `finish(extra, material, name)` merges them (then `extra`, whole) and fills in the mesh.
 */
class Runs {
  constructor() {
    this.list = [];
    this.ranges = [];
    this.v = 0;
  }

  add(geos, leaf = null, fine = 1) {
    // (bites on: a trunk's, a bone's faces cut to brick size x `fine`; foliage is fine enough, and
    // what is never bitten, a stump, stays as it is: `fine` 0)
    const L = brickEdge() * fine;
    if (L > 0) for (let i = 0; i < geos.length; i++) if (!leaf || !leaf(i)) refine(geos[i], L);
    const parts = geos.map((g) => g.attributes.position.count);
    const r = { mesh: null, start: this.v, count: parts.reduce((a, n) => a + n, 0), parts, leaf: leaf ? geos.map((g, i) => (leaf(i) ? 1 : 0)) : null };
    this.list.push(...geos);
    this.v += r.count;
    this.ranges.push(r);
    return r;
  }

  finish(extra, material, name) {
    const all = [...this.list, ...extra];
    const mesh = new THREE.Mesh(all.length ? mergeGeometries(all) : new THREE.BufferGeometry(), material);
    mesh.name = name;
    for (const k of ['position', 'normal']) mesh.geometry.attributes[k]?.setUsage(THREE.DynamicDrawUsage);
    for (const r of this.ranges) r.mesh = mesh;
    return mesh;
  }
}

/** A builder's parts grouped by their `userData.piece` tag, in the order the tags first come: [[tag, geos], ...]. */
function groupParts(parts) {
  const m = new Map();
  for (const g of parts) {
    const k = g.userData?.piece || 'rest';
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(g);
  }
  return [...m];
}

/** Where a group of world-space geometries stands: the centre of its vertices (x, z), a footprint radius, its top. */
function footprint(geos) {
  let n = 0, x = 0, z = 0, h = 0;
  for (const g of geos) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      x += p.getX(i);
      z += p.getZ(i);
      h = Math.max(h, p.getY(i));
      n++;
    }
  }
  x /= n || 1;
  z /= n || 1;
  let r2 = 0;
  for (const g of geos) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) r2 += (p.getX(i) - x) ** 2 + (p.getZ(i) - z) ** 2;
  }
  // (the vertices' spread, not their farthest: a rib's arc should not claim a 3 m disc)
  // (at most 1.8 m: the spatial grid widens every query by the largest piece's radius)
  const r = Math.min(1.8, Math.max(0.35, Math.sqrt(r2 / (n || 1)) * 1.2));
  return { x, z, r, h: Math.max(0.3, h) };
}

// ---------- assembly ----------
/**
 * Trees and boulders this close to the clearing's centre are breakables (they can be felled, burned,
 * thrown). The hero is held within 31 m and the wyrm's root within 24 m, its tail and wings reach ~12 m
 * past that: 42 m is everything the fight can touch, with room for fire to spread (2026-11-15: was 36.5).
 */
const BREAK_R = 42;
/** Where the forest's landmarks stand (landmarks.js): world x, z, yaw, scale. */
export const FOREST_LANDMARKS = {
  elder: { x: 30.5, z: -6, yaw: -1.5, s: 1 },
  tree: { x: -29.5, z: -5.5, yaw: 1.2, s: 1 },
};

export function createForest(U, colliders) {
  const rng = mulberry32(CONFIG.seed);
  const W = CONFIG.world;
  const group = new THREE.Group();
  group.name = 'forest';
  const treeGeos = [];
  const stoneGeos = []; // carved glyphs: standing stones, boulders
  const slabGeos = []; // carved glyphs, calmer look: flagstones
  const propGeos = []; // screen grid: bones, bonfire
  const treeSpots = [];
  const bare = [];
  const slabs = [];

  // trees in a ring around the clearing, leaving a path open to the south
  const trees = [];
  const open = (x, z) => !(z > 27 && Math.abs(x) < 4.2 + (z - 27) * 0.18);
  // the landmarks (landmarks.js) stand on the rim: trees and boulders drawn there are dropped AFTER
  // they are built, so the layout's random sequence (every other tree and stone) stays as it was
  const LM = FOREST_LANDMARKS;
  const inLandmark = (x, z, pad = 0) => {
    if (Math.hypot(x - LM.tree.x, z - LM.tree.z) < 8.5 + pad) return true;
    const e = LM.elder, c = Math.cos(e.yaw), s = Math.sin(e.yaw);
    const lx = (x - e.x) * c - (z - e.z) * s, lz = (x - e.x) * s + (z - e.z) * c;
    // (well past the skull at +lx: a tree south of it would stand between it and the camera)
    return lx > -17.5 - pad && lx < 24 + pad && lz > -8 - pad && lz < 6.5 + pad;
  };
  // spatial hash so the min-spacing test stays cheap with many trees
  const cellOf = (x, z) => `${Math.floor(x / 4)},${Math.floor(z / 4)}`;
  const buckets = new Map();
  const tooClose = (x, z, d) => {
    const cx = Math.floor(x / 4), cz = Math.floor(z / 4);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const t of buckets.get(`${cx + i},${cz + j}`) ?? []) if (Math.hypot(t.x - x, t.z - z) < d) return true;
      }
    }
    return false;
  };
  for (let i = 0; i < 40000 && trees.length < 560; i++) {
    const a = rng() * TAU;
    const r = 32.2 + Math.pow(rng(), 1.25) * 42; // denser near the clearing
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!open(x, z)) continue;
    if (tooClose(x, z, r < 44 ? 3.0 : 3.6)) continue;
    const roll = rng();
    const t = { x, z, s: range(rng, 0.85, 1.35), type: roll < 0.36 ? 'pine' : roll < 0.41 ? 'dead' : 'oak' };
    trees.push(t);
    const key = cellOf(x, z);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(t);
  }
  // breakables (world/destructibles.js, ADR-107): what can be chipped, felled, burned and thrown is
  // listed here instead of merged into the static meshes. Their stumps and rubble, and the things
  // added inside the clearing, draw on a stream of their own: the layout's sequence stays as it was
  const breakables = [];
  const br = mulberry32(CONFIG.seed + 4177);
  // (the trees past the old 36.5 m line draw their stumps from a stream of their own: br's sequence,
  // and so the layout of what stands inside the clearing, stays as it was)
  const brOut = mulberry32(CONFIG.seed + 9311);
  // Every tree is a breakable (2026-11-16: the whole wall wears down; it was only those within 42 m).
  // A tree is a 'range' piece: its trunk and crown blobs are runs of vertices in the ONE static tree
  // mesh (no bone of the rigid batch: 560 trees would not fit), dropped part by part as it wears down
  // and rewritten as it shudders, leans, falls or is carried (destructibles.js RangeBody). Its stump is a
  // run of the stump mesh, folded away until it shows.
  const treeRuns = new Runs(), stumpRuns = new Runs(), propRuns = new Runs();
  // (ADR-190: wood past GROWTH.phoneFar m stands on the deep mesh, which the phone does not draw: its
  // closer camera never sees that far from the end of the map)
  const deepRuns = new Runs();
  const brFar = mulberry32(CONFIG.seed + 6007); // (the stumps of the trees past the old 42 m line)
  const WALL = BREAK.wall;
  /** The parts a tree drops as it wears down (its crown from the outside in) and how many by each stage. */
  const wearOf = (type, n) => {
    const order = [];
    for (let i = n - 1; i >= 1; i--) order.push(i); // (part 0 the trunk; an oak's part 1 its core blob: last)
    const c = n - 1;
    // (a pine: its top snaps off first, two tiers at once, then all but the lowest skirt: one tier at a time
    // hid inside the canopy and its stages barely read, 2026-11-16)
    const cut = type === 'pine' ? [Math.min(2, c), Math.min(3, c)] : type === 'dead' ? [Math.ceil(c / 3), Math.ceil((2 * c) / 3)] : [Math.ceil(c * 0.4), Math.ceil(c * 0.8)]; // (an oak: 2026-11-16 a quarter and three fifths of its crown read as nothing from above)
    return { order, cut };
  };
  const treeBreakable = (t, g, c, rng = br) => {
    const rad = Math.hypot(t.x, t.z), h = geosHeight(g);
    const runs = rad > GROWTH.phoneFar ? deepRuns : treeRuns;
    return {
      kind: t.type === 'dead' ? 'deadTree' : 'tree', mat: 'wood', look: 'range', x: t.x, z: t.z, r: 0.45 * t.s, h,
      // (bricks: finer where the fight goes, BREAK.chip.near; twice as coarse in the deep forest)
      range: runs.add(g, t.type === 'dead' ? null : (i) => i > 0, Math.hypot(t.x, t.z) < BREAK.chip.near ? 1 : BREAK.chip.far),
      colliders: c ? [c] : [], broken: { range: stumpRuns.add(buildStump(rng, t.x, t.z, t.s), null, 0), r: c ? 0.38 * t.s : 0 },
      leafy: t.type === 'dead' ? 0 : 0.6, lift: 1, wear: wearOf(t.type, g.length),
      // (the wall: tougher, and it falls away from the arena; BREAK.wall)
      wall: rad > WALL.from, hpK: rad > WALL.from ? WALL.hp : 1,
      // ... and while it stands it closes the ground behind it (edge.js, BREAK.edge): m either side of its trunk
      edge: rad > WALL.from ? Math.max(BREAK.edge.minBlock, BREAK.edge.crown * (t.type === 'pine' ? 2.2 : t.type === 'dead' ? 1.6 : 3.0) * t.s) : 0,
    };
  };
  // the ridge (forestTuning.js RIDGE): the true end of the map, a ring of crags; no tree stands in it
  // (dropped after it is built, like a landmark's: the layout's sequence stays as it was)
  const onRidge = (x, z, pad = 0) => Math.abs(Math.hypot(x, z) - ridgeAt(Math.atan2(z, x)) - RIDGE.out) < RIDGE.size[1] + 0.6 + pad;
  // what grows on and round the old trees and in the forest draws on a stream of its own (ADR-190)
  const gr = mulberry32(CONFIG.seed + 5023);
  const kept = []; // (the old trees standing in the walkable band: a dead trunk may lean on one)
  for (const t of trees) {
    const g = t.type === 'pine' ? buildPine(rng, t.x, t.z, t.s) : t.type === 'dead' ? buildDeadTree(rng, t.x, t.z, t.s) : buildOak(rng, t.x, t.z, t.s);
    if (inLandmark(t.x, t.z)) continue;
    if (onRidge(t.x, t.z)) continue;
    if (t.type === 'oak') growOn(gr, t, g);
    treeSpots.push({ x: t.x, z: t.z, r: t.type === 'pine' ? 2.2 * t.s : 3.0 * t.s });
    const rad = Math.hypot(t.x, t.z);
    // (a trunk out to where the opened ground can reach: BREAK.edge.outer; it was 42 m, what a hero held at 31 m could touch)
    const c = rad < Math.max(42, BREAK.edge.outer + 3) ? colliders.add(t.x, t.z, 0.45 * t.s, 'trunk') : null;
    breakables.push(treeBreakable(t, g, c, rad < 36.5 ? br : rad < BREAK_R ? brOut : brFar));
    if (t.type !== 'dead' && c) kept.push(t);
  }

  // broken stone circle (gap to the south for the entrance)
  const ringR = 19.5;
  const count = 11;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + 0.18;
    const x = Math.cos(a) * ringR, z = Math.sin(a) * ringR;
    if (z > 15 && Math.abs(x) < 6) continue;
    const fallen = i === 3 || i === 8;
    const broken = !fallen && (i === 1 || i === 6);
    const h = broken ? range(rng, 1.4, 2.1) : range(rng, 2.8, 4.0);
    const w = range(rng, 1.1, 1.5), d = range(rng, 0.65, 0.9);
    const yaw = -a + Math.PI / 2 + range(rng, -0.2, 0.2);
    const stone = buildStandingStone(rng, x, z, { h, w, d, yaw, fallen, broken });
    if (fallen) {
      // the toppled stone lies from its base (x, z) out to h along (sin yaw, cos yaw): centre the
      // colliders (and so the bare-earth stamp) on its body, not on its base
      const cx = x + Math.sin(yaw) * h * 0.5, cz = z + Math.cos(yaw) * h * 0.5;
      const ax = Math.sin(yaw) * (h * 0.33), az = Math.cos(yaw) * (h * 0.33);
      const cs = [colliders.add(cx, cz, 0.95, 'stone'), colliders.add(cx + ax, cz + az, 0.8, 'stone'), colliders.add(cx - ax, cz - az, 0.8, 'stone')];
      breakables.push({ kind: 'stone', mat: 'stone', look: 'prop', x: cx, z: cz, r: h * 0.42, h: d + 0.1, geos: [stone], colliders: cs, topples: false, cover: false });
    } else {
      const r = Math.max(w, d) * 0.62;
      breakables.push({
        kind: 'stone', mat: 'stone', look: 'prop', x, z, r, h, geos: [stone], colliders: [colliders.add(x, z, r, 'stone')],
        broken: { geos: buildRubble(br, x, z, r * 0.9, { h: range(br, 0.45, 0.8) }), r: r * 0.7 }, lift: 2,
      });
    }
  }

  // boulders: some framing the arena edge, many in the woods
  for (let i = 0; i < 34; i++) {
    const a = rng() * TAU;
    const edge = i < 7;
    const r = edge ? range(rng, 27.5, 31.5) : range(rng, 33, 70);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!open(x, z) || (edge && z > 20 && Math.abs(x) < 8)) continue;
    const size = edge ? range(rng, 0.9, 1.6) : range(rng, 0.7, 2.0);
    const boulder = buildBoulder(rng, x, z, size);
    if (inLandmark(x, z, -1.5)) continue;
    const c = r < 42 ? colliders.add(x, z, size * 0.85, 'boulder') : null;
    if (r < BREAK_R) breakables.push({ kind: 'boulder', mat: 'stone', look: 'prop', x, z, r: size * 0.85, h: geosHeight([boulder]), geos: [boulder], colliders: c ? [c] : [], topples: false, lift: 1 });
    else stoneGeos.push(boulder);
  }

  // flagstones around the centre (walkable). Each is a breakable whose body is its run of vertices in
  // the merged slab mesh (look 'range': the carved material stays the floor's own); smashed, it lies in
  // shards (a second merged mesh, folded away until then)
  const flags = [];
  for (let i = 0; i < 26; i++) {
    const a = rng() * TAU, r = Math.sqrt(rng()) * 9;
    const x = Math.cos(a) * r, z = Math.sin(a) * r + 1;
    const w = range(rng, 0.8, 1.6), d = range(rng, 0.6, 1.3);
    const slab = buildFlagstone(rng, x, z, w, d, rng() * TAU);
    slabGeos.push(slab.geo);
    slabs.push({ x, z, r: Math.max(w, d) * 0.65, outline: slab.outline });
    flags.push({ x, z, r: Math.max(w, d) * 0.5, geo: slab.geo, outline: slab.outline });
  }

  // the nest: bones to the north (the ribcage and skull stay; what lies loose round them breaks)
  const nest = { x: -3, z: -15.5 };
  const bones = buildBones(rng, nest.x, nest.z);
  for (const [tag, geos] of groupParts(bones.parts)) {
    const f = footprint(geos);
    const skull = tag === 'nestSkull';
    breakables.push({
      kind: skull ? 'nestSkull' : 'nestRib', mat: 'bone', look: 'range', digits: true, x: f.x, z: f.z, r: f.r, h: Math.max(0.4, f.h),
      range: propRuns.add(geos), colliders: [], hp: skull ? BREAK.landmark.nestSkull : BREAK.landmark.nestRib, topples: false, cover: false, lift: 0, wreck: false,
    });
  }
  for (const b of bones.loose) {
    breakables.push({ kind: b.kind, mat: b.mat ?? 'bone', look: 'grid', x: b.x, z: b.z, r: b.r, h: Math.max(0.25, geosHeight(b.geos)), geos: b.geos, colliders: [], topples: false, cover: false, wreck: false });
  }
  bare.push({ x: nest.x, z: nest.z, r: 3.2 });

  // bonfire at the southern entrance
  const bf = W.bonfire;
  propGeos.push(...buildBonfire(rng, bf.x, bf.z));
  colliders.add(bf.x, bf.z, 0.75, 'bonfire');
  bare.push({ x: bf.x, z: bf.z, r: 1.6 });

  // things to break inside the clearing (ADR-107: the fight uses its ground): dead trees, young
  // pines and boulders in a loose belt, clear of the centre, the nest, the wyrm's bed, the way in
  // from the bonfire and the stone circle
  {
    const bed = W.dragonSleep ?? { x: 3, z: -10 };
    const taken = [];
    const free = (x, z, pad) => {
      const r = Math.hypot(x, z);
      if (r < 12.5 || r > 28.2 || Math.abs(r - ringR) < 2.6) return false;
      if (z > 12 && Math.abs(x) < 7.5) return false;
      if (Math.hypot(x - nest.x, z - nest.z) < 6 || Math.hypot(x - bed.x, z - bed.z) < 8.5) return false;
      if (inLandmark(x, z, 1)) return false; // (nothing to break stands on, or in front of, a landmark)
      return !taken.some((t) => Math.hypot(t.x - x, t.z - z) < pad);
    };
    const place = (n, pad, make) => {
      for (let i = 0, k = 0; i < 400 && k < n; i++) {
        const a = br() * TAU, r = 12.5 + Math.sqrt(br()) * 15.7;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (!free(x, z, pad)) continue;
        taken.push({ x, z });
        make(x, z);
        k++;
      }
    };
    place(7, 5.5, (x, z) => {
      const t = { x, z, s: range(br, 0.8, 1.15), type: 'dead' };
      const g = buildDeadTree(br, x, z, t.s);
      treeSpots.push({ x, z, r: 1.6 * t.s });
      breakables.push(treeBreakable(t, g, colliders.add(x, z, 0.42 * t.s, 'trunk')));
    });
    place(4, 6, (x, z) => {
      const t = { x, z, s: range(br, 0.55, 0.72), type: 'pine' };
      const g = buildPine(br, x, z, t.s);
      treeSpots.push({ x, z, r: 2.0 * t.s });
      breakables.push(treeBreakable(t, g, colliders.add(x, z, 0.4 * t.s, 'trunk')));
    });
    place(6, 4.5, (x, z) => {
      const size = range(br, 0.8, 1.35);
      const boulder = buildBoulder(br, x, z, size);
      breakables.push({ kind: 'boulder', mat: 'stone', look: 'prop', x, z, r: size * 0.85, h: geosHeight([boulder]), geos: [boulder], colliders: [colliders.add(x, z, size * 0.85, 'boulder')], topples: false, lift: 1 });
    });
  }

  // landmarks: the elder wyrm's skeleton along the east rim (head to the south: at the side of the
  // frame it is seen side-on, ribs and all), the Cinder Tree on the west rim. Both break in pieces
  // (2026-11-16, the owner's call; it reverses ADR-119's "they stay whole"): each tagged part group
  // of their builders is a 'range' piece of the prop / tree mesh, so whole they look as they did
  {
    const lr = mulberry32(CONFIG.seed + 977);
    const e = LM.elder, t = LM.tree, LK = BREAK.landmark;
    const elder = groupParts(buildElderWyrm(lr, e.x, e.z, e.yaw, e.s));
    const elderCs = ELDER_COLLIDERS.map(([lx, lz, r]) => {
      const p = landmarkPoint(e.x, e.z, e.yaw, e.s, lx, lz);
      return { x: p.x, z: p.z, c: colliders.add(p.x, p.z, r * e.s, 'stone') };
    });
    const elderDefs = [];
    for (const [tag, geos] of elder) {
      const f = footprint(geos);
      const kind = tag.startsWith('spine') ? 'spine' : tag.startsWith('rib') ? 'rib' : tag.startsWith('horn') ? 'horn' : tag;
      const def = {
        kind: `elder${kind[0].toUpperCase()}${kind.slice(1)}`, mat: 'bone', look: 'range', digits: true, x: f.x, z: f.z, r: f.r, h: f.h,
        range: propRuns.add(geos), colliders: [], hp: LK[kind] ?? LK.spine, topples: false, cover: false, lift: 0, wreck: false,
      };
      elderDefs.push(def);
      breakables.push(def);
    }
    // each collider goes with the piece whose footprint is nearest
    for (const k of elderCs) {
      let best = null, bd = Infinity;
      for (const d of elderDefs) {
        const dd = Math.hypot(d.x - k.x, d.z - k.z) - d.r;
        if (dd < bd) {
          bd = dd;
          best = d;
        }
      }
      best?.colliders.push(k.c);
    }
    const cinder = groupParts(buildCinderTree(lr, t.x, t.z, t.yaw, t.s));
    const boughs = [];
    let trunkGeos = null;
    for (const [tag, geos] of cinder) {
      if (tag === 'trunk') {
        trunkGeos = geos;
        continue;
      }
      const f = footprint(geos);
      const def = {
        kind: 'cinderBough', mat: 'wood', look: 'range', digits: true, x: f.x, z: f.z, r: f.r, h: f.h,
        range: treeRuns.add(geos, (i) => geos[i].attributes.aFlag.array[0] === FLAG.LEAF), colliders: [], hp: LK.bough, topples: false,
        cover: false, lift: 0, wreck: false, leafy: 0.25,
      };
      boughs.push(def);
      breakables.push(def);
    }
    if (trunkGeos) {
      const f = footprint(trunkGeos);
      breakables.push({
        kind: 'cinderTrunk', mat: 'wood', look: 'range', digits: true, x: t.x, z: t.z, r: 1.8 * t.s, h: f.h,
        range: treeRuns.add(trunkGeos), colliders: [colliders.add(t.x, t.z, 3.0 * t.s, 'trunk')], soft: false,
        broken: { range: stumpRuns.add(buildCinderStump(lr, t.x, t.z, t.yaw, t.s), null, 0), r: 2.3 * t.s },
        hp: LK.trunk, guard: boughs, topples: false, cover: true, lift: 0, wreck: false, weight: 2.2,
      });
    }
    treeSpots.push({ x: t.x, z: t.z, r: 5 });
  }

  // the forest he walks in and its end (ADR-190, forestTuning.js): the ridge's crags, young trees, the
  // undergrowth, fallen logs, old stumps, mossy rocks; beyond the ridge a thicket (the deep mesh: not
  // drawn on the phone). Their breakables are listed after every other (the ids of what was there stay)
  const rockRuns = new Runs(), rubbleRuns = new Runs(), brushRuns = new Runs();
  const grown = growForest({ gr, colliders, treeRuns, stumpRuns, rockRuns, rubbleRuns, brushRuns, deepRuns, treeSpots, buckets, tooClose, inLandmark, open, onRidge, treeBreakable, wearOf, WALL, kept });

  const mat = createAsciiObjectMaterial(U, { fadeNearPlayer: true, side: THREE.DoubleSide });
  // (the trees, their stumps, the landmarks' pieces: runs of these meshes, rewritten as they break, so
  // their positions and normals are uploaded in ranges: dynamic buffers)
  const treeMesh = treeRuns.finish(treeGeos, mat, 'trees');
  const propMesh = propRuns.finish(propGeos, mat, 'props'); // (the bonfire: whole, after the pieces)
  const stumpMesh = stumpRuns.finish([], mat, 'stumps');
  stumpMesh.userData.autoHide = true; // (drawn only while a stump shows: RangeBody counts them)
  stumpMesh.visible = false;
  const pitch = CONFIG.camera.pitch;
  // standing stones and boulders are printed like the wyrm (prop art, ADR-100); flagstones stay carved
  const stoneMat = createPropArtMaterial(U, { fadeNearPlayer: true });
  const stoneMesh = new THREE.Mesh(mergeGeometries(stoneGeos), stoneMat);
  stoneMesh.name = 'stones';
  const slabMat = createCarvedGlyphMaterial(U, { ...SLAB_LOOK, viewPitch: pitch });
  const slabMesh = new THREE.Mesh(mergeGeometries(slabGeos), slabMat);
  slabMesh.name = 'flagstones';
  // the flagstones as breakables: their runs of vertices in the slab mesh, and their shards (folded away)
  const shardGeos = flags.map((f) => buildFlagShards(br, f.x, f.z, f.outline));
  const shardMesh = new THREE.Mesh(mergeGeometries(shardGeos), slabMat);
  shardMesh.name = 'flagstoneShards';
  shardMesh.userData.foldAway = true; // (hidden until a flagstone is smashed: no draw call till then; destructibles.js RangeBody)
  {
    let v = 0, w = 0;
    flags.forEach((f, i) => {
      const n = f.geo.attributes.position.count, m = shardGeos[i].attributes.position.count;
      breakables.push({
        // (hp 4.5: a stomp, a landing, a meteor crack it; it breaks under the heart of a dive, a leap or a
        // few blasts in one place; the body's steps scrape over it (BREAK.brushFlat). Was 1.5: the
        // paving was gone halfway through a fight)
        kind: 'flagstone', mat: 'stone', look: 'range', x: f.x, z: f.z, r: f.r, h: 0.08, hp: 4.5,
        range: { mesh: slabMesh, start: v, count: n }, broken: { range: { mesh: shardMesh, start: w, count: m } },
        colliders: [], topples: false, cover: false, wreck: false, lift: 0,
      });
      v += n;
      w += m;
    });
  }
  group.add(treeMesh, propMesh, stumpMesh, stoneMesh, slabMesh, shardMesh);
  // the growth's meshes: the ridge and the mossy rocks print like the stones; their rubble folds away
  // until a crag is broken; the undergrowth and the deep thicket in the trees' look
  const rockMesh = rockRuns.finish([], stoneMat, 'rocks');
  const rubbleMesh = rubbleRuns.finish([], stoneMat, 'rockRubble');
  rubbleMesh.userData.foldAway = true;
  const brushMesh = brushRuns.finish([], mat, 'brush');
  const deepMesh = deepRuns.finish([], mat, 'deepForest');
  group.add(rockMesh, rubbleMesh, brushMesh, deepMesh);
  breakables.push(...grown);
  markCaster(group);

  return {
    group, treeSpots, bare, slabs, nest, bonfire: { x: bf.x, z: bf.z },
    material: mat, stoneMaterial: stoneMat, slabMaterial: slabMat,
    breakables,
    // the hero's ground (edge.js WALK mode, ADR-190): the whole forest out to the ridge from the start;
    // the trunks and rocks are his walls. What the wall's fallen trees open (ADR-125) is the boss's
    edge: { base: W.playerBound ?? 31, walk: { at: (a) => ridgeAt(a) + RIDGE.inset } },
    // the phone's share (destructibles.setQuality): the thicket beyond the ridge is not drawn
    setQuality: (k) => {
      const phone = k < GROWTH.phoneDeep;
      deepMesh.visible = !phone;
      // (... and the undergrowth casts no shadow: low leaves, a pass of the moon's map saved)
      if (phone) brushMesh.layers.disable(LAYER_CASTER);
      else brushMesh.layers.enable(LAYER_CASTER);
    },
  };
}

// ---------- the forest he walks in (ADR-190) ----------
/** Roots round an old oak's foot (merged into its trunk) and hanging moss under its crown (parts after it). */
function growOn(gr, t, g) {
  const R = GROWTH.roots, M = GROWTH.moss;
  if (t.s > R.minS) {
    const n = R.n[0] + Math.floor(gr() * (R.n[1] - R.n[0] + 1));
    g[0] = mergeGeometries([g[0], ...buildRoots(gr, t.x, t.z, t.s, n, R.len)]);
  }
  if (gr() < M.chance && g.length > 2) {
    const n = M.n[0] + Math.floor(gr() * (M.n[1] - M.n[0] + 1)), from = [];
    for (let i = 0; i < n; i++) {
      const blob = g[1 + Math.floor(gr() * (g.length - 1))];
      blob.computeBoundingBox();
      const b = blob.boundingBox, cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
      const a = gr() * TAU, d = Math.sqrt(gr()) * (b.max.x - b.min.x) * 0.3;
      from.push([cx + Math.cos(a) * d, b.min.y + 0.35, cz + Math.sin(a) * d]);
    }
    g.push(...buildMoss(gr, from, M.len));
  }
}

/**
 * The end b: a thicket wall of dead trunks shoulder to shoulder on the line (THICKET), brambles between
 * the rows. The first row's trunks are its colliders; a trunk felled or burnt leaves a stump that keeps
 * one (a burnt stretch stays shut).
 */
function endThicket(o, out, mark) {
  const { gr, colliders, treeRuns, stumpRuns, brushRuns, deepRuns, wearOf, WALL } = o;
  const T = THICKET;
  T.rows.forEach((row, ri) => {
    const step = T.step * (ri === 0 ? 1 : 1.5);
    let a = -Math.PI + (ri * step * 0.5) / RIDGE.r;
    while (a < Math.PI) {
      const line = ridgeAt(a), rr = line + row + (gr() - 0.5) * 0.25 * ri;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      const s = range(gr, T.s[0], T.s[1]);
      const g = buildDeadTree(gr, x, z, s);
      const c = ri === 0 ? colliders.add(x, z, T.r, 'trunk') : null;
      out.push({
        kind: 'deadTree', mat: 'wood', look: 'range', x, z, r: T.r, h: geosHeight(g), range: (ri === 0 ? treeRuns : deepRuns).add(g, null, BREAK.chip.far), // (the rows behind the first: the phone's share drops them)
        colliders: c ? [c] : [], broken: { range: stumpRuns.add(buildStump(gr, x, z, s * 1.1), null, 0), r: c ? T.r * T.stub : 0 },
        leafy: 0, lift: 0, wear: wearOf('dead', g.length), wall: true, hpK: WALL.hp, edge: 0, wreck: false,
      });
      mark(x, z);
      // (brambles in the rows' gaps)
      if (ri > 0 && gr() < T.bramble) {
        const ba = a + (step * 0.5) / line, br2 = line + row - 0.5;
        const bx = Math.cos(ba) * br2, bz = Math.sin(ba) * br2, bs = range(gr, 1.1, 1.6);
        const geos = buildBramble(gr, bx, bz, bs);
        out.push({
          kind: 'bramble', mat: 'wood', look: 'range', x: bx, z: bz, r: 0.65 * bs, h: Math.max(0.3, geosHeight(geos)),
          range: brushRuns.add(geos, (j) => j > 0), colliders: [], topples: false, cover: false, lift: 0, wreck: false, leafy: 0.4, wall: true,
        });
      }
      a += step / line;
    }
  });
}

/**
 * The end c: a deadfall, giant trunks fallen along the line and piled two high (DEADFALL), their root
 * plates torn up at the ends. Colliders along each trunk of the first row; a broken one leaves a stub
 * that still blocks; they are too wet and too big to burn through.
 */
function endDeadfall(o, out, mark) {
  const { gr, colliders, treeRuns, stumpRuns } = o;
  const D = DEADFALL;
  for (let row = 0; row < 2; row++) {
    let a = -Math.PI + (row * D.step * 0.5) / RIDGE.r;
    while (a < Math.PI) {
      const line = ridgeAt(a);
      if (row === 1 && gr() > D.top) {
        a += D.step / line;
        continue;
      }
      const rad = range(gr, D.rad[0], D.rad[1]) * (row ? 0.85 : 1), len = range(gr, D.len[0], D.len[1]);
      const rr = line + D.out + rad * 0.3 + row * rad * 0.4;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr, yaw = a + Math.PI / 2 + (gr() - 0.5) * 0.25;
      const L = buildLog(gr, x, z, len, rad, yaw, mul(DEAD_WOOD, D.grey));
      if (row) for (const g of L.geos) g.translate(0, rad * D.up, 0);
      const geos = L.geos;
      if (gr() < D.plates) geos.push(...buildRootPlate(gr, L.ends[gr() < 0.5 ? 0 : 1], yaw, range(gr, D.plate[0], D.plate[1])));
      const cs = [];
      if (row === 0) {
        const n = Math.max(2, Math.ceil(len / 0.9));
        for (let j = 0; j < n; j++) {
          const f = j / (n - 1) - 0.5;
          cs.push(colliders.add(x + Math.cos(yaw) * len * f * 0.95, z + Math.sin(yaw) * len * f * 0.95, rad + 0.05, 'trunk'));
        }
      }
      out.push({
        kind: 'log', mat: 'wood', look: 'range', x, z, r: Math.min(1.8, len * 0.5), h: rad * (row ? 2 + D.up : 2) + 0.2,
        range: treeRuns.add(geos, null, BREAK.chip.far), colliders: cs, hp: RIDGE.hp, burns: false, topples: false, cover: true, lift: 0, wreck: false,
        broken: row === 0 ? { range: stumpRuns.add(buildLog(gr, x, z, len * 0.6, rad * 0.8, yaw).geos, null, 0), r: len * D.stub * 0.5 } : undefined,
      });
      mark(x, z);
      a += D.step / line;
    }
  }
}

/**
 * Places the forest's growth (forestTuning.js GROWTH, RIDGE) and returns its breakables' definitions.
 * Draws on `gr` only. `o`: the set's runs, colliders, spacing test and its spots (forest.js).
 */
function growForest(o) {
  const { gr, colliders, treeRuns, stumpRuns, rockRuns, rubbleRuns, brushRuns, deepRuns, treeSpots, buckets, tooClose, inLandmark, open, onRidge, treeBreakable, wearOf, WALL, kept } = o;
  const far = (r) => r > G.phoneFar;
  const G = GROWTH, out = [];
  const cellOf = (x, z) => `${Math.floor(x / 4)},${Math.floor(z / 4)}`;
  const mark = (x, z) => {
    const k = cellOf(x, z);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push({ x, z });
  };
  // a spot clear of every collider (the clearing's stones and boulders, trunks, the bonfire) by `pad` m
  const clearOf = (x, z, pad) => {
    for (const c of colliders.circles) if (Math.hypot(c.x - x, c.z - z) < c.r + pad) return false;
    return true;
  };
  // off the path south by its width and GROWTH.pathPad
  const offPath = (x, z) => open(x, z) && !(z > 25 && Math.abs(x) < 4.2 + G.pathPad + Math.max(0, z - 27) * 0.18);
  const spot = (band) => {
    const a = gr() * TAU, r = band[0] + Math.sqrt(gr()) * (band[1] - band[0]);
    return [Math.cos(a) * r, Math.sin(a) * r, r];
  };
  const wallOf = (r) => r > WALL.from;

  // 1. the end of the map (`?forestEnd=a|b|c`, forestTuning.js): a the ridge, b a thicket wall, c a deadfall
  const END = lookOf('forestEnd', 'a', 'a');
  if (END === 'b') endThicket(o, out, mark);
  else if (END === 'c') endDeadfall(o, out, mark);
  // a: the ridge, a ring of crags (they chip and crumble, and their rubble still blocks)
  else for (const row of [RIDGE, RIDGE.back]) {
    let a = -Math.PI + (row === RIDGE ? 0 : (0.5 * RIDGE.step) / RIDGE.r);
    while (a < Math.PI) {
      const line = ridgeAt(a), rr = line + row.out;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      const w = range(gr, row.size[0], row.size[1]);
      // (across the path south: taller, a rockfall that closed the old road)
      const path = z > 0 && Math.abs(x) < 9;
      const h = range(gr, row.h[0], row.h[1]) * (path ? RIDGE.pathH : 1);
      const geo = buildCrag(gr, x, z, w, h, -a + (gr() - 0.5) * 0.8);
      const c = colliders.add(x, z, w * 0.92, 'stone');
      out.push({
        kind: 'crag', mat: 'stone', look: 'range', digits: true, x, z, r: Math.min(1.8, w * 0.95), h: geosHeight([geo]),
        range: rockRuns.add([geo], null, RIDGE.brick), colliders: [c], hp: RIDGE.hp, topples: false, cover: true, lift: 0, wreck: false,
        broken: { range: rubbleRuns.add(buildRubble(gr, x, z, w * 0.85, { h: range(gr, 0.8, 1.3) }), null, 0), r: w * RIDGE.stub },
      });
      mark(x, z);
      a += RIDGE.step / line;
    }
  }

  // 2. young trees between the old ones (walkable band: colliders; they do not close the boss's lanes)
  // (a young crown: lighter leaves, fresh growth, so the layers read under the old crowns)
  const fresh = (g) => {
    for (let j = 1; j < g.length; j++) {
      const c = g[j].attributes.aCol, f = g[j].attributes.aFlag;
      if (!c || !f || f.array[0] !== FLAG.LEAF) continue;
      for (let v = 0; v < c.array.length; v++) c.array[v] *= G.youngLeaf;
    }
    return g;
  };
  // the treeline's edge: young trees and snags in front of the old crowns
  for (let i = 0, k = 0; i < 6000 && k < G.edge.n; i++) {
    const [x, z] = spot(G.edge.band);
    if (!offPath(x, z) || inLandmark(x, z, 1) || tooClose(x, z, G.edge.gap) || !clearOf(x, z, G.edge.clear)) continue;
    const roll = gr();
    const type = roll < G.edge.snag ? 'dead' : roll < G.edge.snag + G.edge.pine ? 'pine' : 'oak';
    const t = { x, z, s: range(gr, G.edge.s[0], G.edge.s[1]) * (type === 'dead' ? 1.2 : 1), type };
    const g = type === 'pine' ? fresh(buildPine(gr, x, z, t.s)) : type === 'dead' ? buildDeadTree(gr, x, z, t.s) : fresh(buildOak(gr, x, z, t.s));
    const c = colliders.add(x, z, 0.38 * t.s, 'trunk');
    const def = treeBreakable(t, g, c, gr);
    def.edge = 0;
    out.push(def);
    if (type !== 'dead') treeSpots.push({ x, z, r: (type === 'pine' ? 2.2 : 3.0) * t.s });
    mark(x, z);
    k++;
  }
  const atRimY = Math.round(G.young.n * G.young.rimShare);
  for (let i = 0, k = 0; i < 12000 && k < G.young.n; i++) {
    const [x, z, r] = spot(k < atRimY ? G.young.rim : G.young.band);
    if (!offPath(x, z) || inLandmark(x, z, 0.5) || onRidge(x, z, 1) || tooClose(x, z, G.young.gap) || !clearOf(x, z, 1.2)) continue;
    const t = { x, z, s: range(gr, G.young.s[0], G.young.s[1]), type: gr() < G.young.pine ? 'pine' : 'oak' };
    const g = fresh(t.type === 'pine' ? buildPine(gr, x, z, t.s) : buildOak(gr, x, z, t.s));
    const c = colliders.add(x, z, 0.4 * t.s, 'trunk');
    const def = treeBreakable(t, g, c, gr);
    def.edge = 0;
    out.push(def);
    treeSpots.push({ x, z, r: (t.type === 'pine' ? 2.2 : 3.0) * t.s });
    mark(x, z);
    k++;
  }
  // tall old pines over the crowns (the forest's height varies) and snags, dead trees standing
  for (const [K, kind] of [[G.tall, 'tall'], [G.snag, 'snag']]) {
    for (let i = 0, k = 0; i < 8000 && k < K.n; i++) {
      const [x, z] = spot(K.band);
      if (!offPath(x, z) || inLandmark(x, z, 0.5) || onRidge(x, z, 1) || tooClose(x, z, K.gap) || !clearOf(x, z, 1.2)) continue;
      const type = kind === 'snag' ? 'dead' : gr() < K.pine ? 'pine' : 'oak';
      const t = { x, z, s: range(gr, K.s[0], K.s[1]), type };
      const g = type === 'pine' ? buildPine(gr, x, z, t.s) : type === 'dead' ? buildDeadTree(gr, x, z, t.s) : buildOak(gr, x, z, t.s);
      if (type === 'oak') growOn(gr, t, g);
      const c = colliders.add(x, z, (type === 'dead' ? 0.38 : 0.45) * t.s, 'trunk');
      const def = treeBreakable(t, g, c, gr);
      def.edge = 0;
      out.push(def);
      if (type !== 'dead') treeSpots.push({ x, z, r: (type === 'pine' ? 2.2 : 3.0) * t.s });
      if (type !== 'dead') kept.push(t);
      mark(x, z);
      k++;
    }
  }
  // dead trunks fallen against a standing tree: the foot on the ground, the top resting on its trunk
  {
    const L = G.leaner;
    const cands = kept.filter((t) => {
      const r = Math.hypot(t.x, t.z);
      return r > L.band[0] && r < L.band[1] && t.s > 0.8;
    });
    for (let i = 0, k = 0; i < 600 && k < L.n && cands.length; i++) {
      const t = cands[Math.floor(gr() * cands.length)];
      if (t.leant) continue;
      const len = range(gr, L.len[0], L.len[1]), rad = range(gr, L.rad[0], L.rad[1]), up = range(gr, L.at[0], L.at[1]);
      const a = gr() * TAU, dx = Math.cos(a), dz = Math.sin(a);
      const flat = Math.sqrt(Math.max(1, len * len - up * up));
      const tx = t.x + dx * 0.38 * t.s, tz = t.z + dz * 0.38 * t.s, fx = tx + dx * flat, fz = tz + dz * flat;
      let ok = true;
      for (const f of [0.35, 0.7, 1]) {
        const px = tx + dx * flat * f, pz = tz + dz * flat * f;
        if (!offPath(px, pz) || inLandmark(px, pz, 0.5) || onRidge(px, pz, 1) || !clearOf(px, pz, f < 0.5 ? 0.2 : 0.6)) ok = false;
      }
      if (!ok) continue;
      t.leant = true;
      const geos = buildLeaner(gr, fx, fz, tx, up, tz, rad);
      // (colliders along its low end: where it is under 1.6 m it is a wall to step round)
      const cs = [];
      for (let f = 1; f > 0; f -= 0.9 / flat) {
        if (up * (1 - f) > 1.6) break;
        cs.push(colliders.add(tx + dx * flat * f, tz + dz * flat * f, rad + 0.08, 'trunk'));
      }
      const mx = (tx + fx) / 2, mz = (tz + fz) / 2;
      out.push({
        kind: 'log', mat: 'wood', look: 'range', x: mx, z: mz, r: Math.min(1.8, flat * 0.5), h: up + rad,
        range: treeRuns.add(geos), colliders: cs, topples: false, cover: false, lift: 0, wreck: false, wall: wallOf(Math.hypot(mx, mz)),
      });
      mark(mx, mz);
      k++;
    }
  }

  // 3. the thicket pressed behind the ridge (deep mesh: no collider, out of his reach)
  for (let i = 0, k = 0; i < 8000 && k < G.thicket.n; i++) {
    const [x, z] = spot(G.thicket.band);
    if (inLandmark(x, z) || onRidge(x, z, -0.4) || Math.hypot(x, z) < ridgeAt(Math.atan2(z, x)) + RIDGE.out || tooClose(x, z, G.thicket.gap)) continue;
    const roll = gr();
    const t = { x, z, s: range(gr, G.thicket.s[0], G.thicket.s[1]), type: roll < G.thicket.dead ? 'dead' : roll < G.thicket.dead + G.thicket.pine ? 'pine' : 'oak' };
    const g = t.type === 'pine' ? buildPine(gr, x, z, t.s) : t.type === 'dead' ? buildDeadTree(gr, x, z, t.s) : buildOak(gr, x, z, t.s);
    const h = geosHeight(g);
    out.push({
      kind: t.type === 'dead' ? 'deadTree' : 'tree', mat: 'wood', look: 'range', x, z, r: 0.45 * t.s, h,
      range: (far(Math.hypot(x, z)) ? deepRuns : treeRuns).add(g, t.type === 'dead' ? null : (j) => j > 0, BREAK.chip.far),
      colliders: [], broken: { range: stumpRuns.add(buildStump(gr, x, z, t.s), null, 0), r: 0 },
      leafy: t.type === 'dead' ? 0 : 0.6, lift: 1, wear: wearOf(t.type, g.length), wall: true, hpK: WALL.hp, edge: 0,
    });
    treeSpots.push({ x, z, r: (t.type === 'pine' ? 2.2 : 3.0) * t.s });
    mark(x, z);
    k++;
  }

  // 4. fallen logs and old stumps (wood: colliders, burnable), mossy rocks (stone)
  for (let i = 0, k = 0; i < 4000 && k < G.log.n; i++) {
    const [x, z] = spot(G.log.band);
    const len = range(gr, G.log.len[0], G.log.len[1]), rad = range(gr, G.log.rad[0], G.log.rad[1]), yaw = gr() * TAU;
    const c0 = Math.cos(yaw), s0 = Math.sin(yaw);
    let ok = true;
    for (const f of [-0.5, 0, 0.5]) {
      const px = x + c0 * len * f, pz = z + s0 * len * f;
      if (!offPath(px, pz) || inLandmark(px, pz, 0.5) || onRidge(px, pz, 1) || tooClose(px, pz, 1.4) || !clearOf(px, pz, 0.8)) ok = false;
    }
    if (!ok) continue;
    const L = buildLog(gr, x, z, len, rad, yaw);
    const cs = [];
    const n = Math.max(2, Math.ceil(len / 1.1));
    for (let j = 0; j < n; j++) {
      const f = j / (n - 1) - 0.5;
      cs.push(colliders.add(x + c0 * len * f * 0.9, z + s0 * len * f * 0.9, rad + 0.05, 'trunk'));
    }
    out.push({
      kind: 'log', mat: 'wood', look: 'range', x, z, r: Math.min(1.8, len * 0.5), h: rad * 2 + 0.2,
      range: treeRuns.add(L.geos, (j) => j > 0), colliders: cs, topples: false, cover: false, lift: 0, wreck: false,
      leafy: 0.15, wall: wallOf(Math.hypot(x, z)),
    });
    for (const f of [-0.4, 0, 0.4]) mark(x + c0 * len * f, z + s0 * len * f);
    k++;
  }
  for (let i = 0, k = 0; i < 4000 && k < G.stump.n; i++) {
    const [x, z, r] = spot(G.stump.band);
    if (!offPath(x, z) || inLandmark(x, z, 0.5) || onRidge(x, z, 1) || tooClose(x, z, 1.6) || !clearOf(x, z, 0.8)) continue;
    const s = range(gr, G.stump.s[0], G.stump.s[1]);
    const geos = buildStump(gr, x, z, s);
    out.push({
      kind: 'stump', mat: 'wood', look: 'range', x, z, r: 0.42 * s, h: geosHeight(geos),
      range: treeRuns.add(geos), colliders: [colliders.add(x, z, 0.4 * s, 'trunk')], topples: false, cover: false, lift: 0, wreck: false, wall: wallOf(r),
    });
    mark(x, z);
    k++;
  }
  for (let i = 0, k = 0; i < 4000 && k < G.rock.n; i++) {
    const [x, z] = spot(G.rock.band);
    if (!offPath(x, z) || inLandmark(x, z, 0.5) || onRidge(x, z, 1) || tooClose(x, z, 1.8) || !clearOf(x, z, 1)) continue;
    const size = range(gr, G.rock.size[0], G.rock.size[1]);
    const geo = buildMossRock(gr, x, z, size);
    out.push({
      kind: 'boulder', mat: 'stone', look: 'range', digits: true, x, z, r: size * 0.9, h: geosHeight([geo]),
      range: rockRuns.add([geo]), colliders: [colliders.add(x, z, size * 0.85, 'boulder')], topples: false, lift: 0, wreck: false,
    });
    mark(x, z);
    k++;
  }

  // 5. the undergrowth: bushes, ferns, brambles (no collider: he pushes through; it burns, the wyrm tears
  // it up). In the walkable band on the brush mesh; beyond the ridge, on the deep mesh
  const kinds = [
    ['bush', G.bush, buildBush, () => true, 0.55, 1.0],
    ['fern', G.fern, buildFern, () => true, 0.5, 0.5],
    ['bramble', G.bramble, buildBramble, (j) => j > 0, 0.65, 0.4],
  ];
  // (the undergrowth keeps `brushGap` m from a trunk, a log or a rock, and its own clumps their own spacing)
  const bb = new Map();
  const brushNear = (x, z, d) => {
    const cx = Math.floor(x / 4), cz = Math.floor(z / 4);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const t of bb.get(`${cx + i},${cz + j}`) ?? []) if (Math.hypot(t.x - x, t.z - z) < d) return true;
    return false;
  };
  for (const [kind, K, build, leaf, rk, leafy] of kinds) {
    for (const deep of [false, true]) {
      const want = deep ? K.deep : K.n, band = deep ? [ridgeAt(0) + RIDGE.out + 1.5, 62] : K.band;
      // (the walkable share: GROWTH.rim of it at the treeline, the rest through the band)
      const atRim = deep ? 0 : Math.round(want * G.rim.share);
      for (let i = 0, k = 0; i < want * 40 && k < want; i++) {
        const [x, z, r] = spot(k < atRim ? G.rim.band : band);
        if (!offPath(x, z) || inLandmark(x, z) || onRidge(x, z, 0.6) || tooClose(x, z, G.brushGap) || brushNear(x, z, 0.9)) continue;
        if (deep ? r < ridgeAt(Math.atan2(z, x)) + RIDGE.out + 1.5 : !clearOf(x, z, 0.5)) continue;
        const s = range(gr, K.s[0], K.s[1]);
        const geos = build(gr, x, z, s);
        out.push({
          kind, mat: 'wood', look: 'range', x, z, r: rk * s, h: Math.max(0.3, geosHeight(geos)),
          range: (far(r) ? deepRuns : brushRuns).add(geos, leaf), colliders: [], topples: false, cover: false, lift: 0, wreck: false,
          leafy, wall: wallOf(r),
        });
        treeSpots.push({ x, z, r: G.grass * s });
        const bk = cellOf(x, z);
        if (!bb.has(bk)) bb.set(bk, []);
        bb.get(bk).push({ x, z });
        k++;
      }
    }
  }
  return out;
}
