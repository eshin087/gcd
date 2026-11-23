import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createAsciiObjectMaterial, createCarvedGlyphMaterial, createPropArtMaterial } from '../render/materials.js';
import { markCaster } from '../render/pipeline.js';
import { mulberry32, range, fbm2 } from '../core/rng.js';
import { CONFIG } from '../core/config.js';
import { TAU } from '../core/math.js';
import {
  prep, lumpy, carve, slabGeometry, mul, STONE, SLAB_LOOK,
  buildDeadTree, buildBoulder, buildFlagstone, buildBonfire, buildStump, buildRubble, geosHeight,
} from './forest.js';
import { buildLantern } from './courtyard.js';
import {
  carved, landmarkPoint, frustum, limb, facetCol, buildGreatFox, buildSpiritGate, GREAT_FOX_COLLIDERS, SPIRIT_GATE_COLLIDERS,
} from './landmarks.js';
import { breakableFloor } from './floor.js';
import { hangFrom } from './hang.js';

// The Foxfire Terrace (levels/foxfire.js; ADR-147): a moonlit hill shrine. South to north (the player
// walks north, -z): the bonfire on its landing, a path of flagstones up the slope between dead trees,
// three rows of steps, then the terrace: a round paving 28 m across centred on the origin, a kerb of
// curved stones round its rim, ten stone lanterns standing on the rim, six seated stone foxes on
// plinths just inside it, eight wooden charm posts hung with paper strips outside it. Two landmarks
// where the duel camera frames them (east and west, in the northern half, turned to face the camera:
// the camera looks from the south and never shows the north rim): a great seated stone fox on the west
// rim and a spirit gate on the east. Dead trees and boulders round the hill.
// Same output shape as the courtyard (world.js reads it), without `ash`: the default night, the
// fireflies (they read as foxfire here) and green grass, thin on the paving.
// Everything that stands and could be hit breaks (ADR-107): every slab of the paving, the kerb, the
// steps and the path (world/floor.js), the lanterns, the stone foxes (their plinths stay), the charm
// posts (wood: they burn), the near trees and boulders. The two landmarks only chip (hp Infinity).
// Drawn as the house style says (STYLE.md): the stone and the wood through prop art (carve()
// attributes, the destructibles' prop batch or the `stones` mesh), the paving carved, the trees on
// the screen grid.

/** Layout numbers (world metres). The level's CONFIG.world overrides match these (levels/foxfire.js). */
export const TERRACE = {
  r: 14, // the round paving's radius, centred on the origin
  cell: 1.45, // paving slab pitch (the courtyard's)
  kerb: 0.55, // the kerb of curved stones round the paving, r .. r + kerb
  lanternR: 14.8, lanterns: 10,
  statueR: 13.2, statues: 6,
  postR: 16.5, posts: 8,
  // (angles from the south, +z, round through the east, rad): the lanterns stand evenly, two flanking
  // the steps; the foxes sit between lanterns, none on the north rim (out of the frame), none in the
  // landmarks' way; the posts leave the east and west free for the landmarks
  lanternAt: (k) => (18 + 36 * k) * (Math.PI / 180),
  statueAt: [36, -36, 108, -108, 144, -144].map((d) => d * (Math.PI / 180)),
  postAt: [24, -24, 60, -60, 130, -130, 160, -160].map((d) => d * (Math.PI / 180)),
  steps: [14.98, 15.82, 16.66], // rows of steps down from the south rim (z)
  stepHalf: 2.9, // the steps run x = -stepHalf .. stepHalf
  pathFrom: 17.6, // the flagstone path runs from the steps ...
  pathTo: 32, // ... to here
  bonfire: { x: 0, z: 34 },
  // landmarks (landmarks.js): east and west of the ring in its northern half, turned to face the camera
  greatFox: { x: -18.0, z: -1.6, yaw: 1.2, s: 1 }, // (facing the terrace, a three-quarter profile to the camera)
  spiritGate: { x: 17.3, z: -1.4, yaw: -0.62, s: 1 },
};

/** A point at angle `a` from the south (+z) round through the east, `r` m out. */
const at = (a, r) => ({ x: Math.sin(a) * r, z: Math.cos(a) * r });

/** The path's centre line (x at z): a gentle bend down the slope. */
const pathX = (z) => 0.9 * Math.sin((z - TERRACE.pathFrom) * 0.22);

/** A whole floor of slabs under the duel must stay calm (the courtyard's paving look). */
const PAVING_LOOK = {
  gain: 1.55,
  lumScale: 2.0,
  edge: 0.3,
  inkFloor: 0.035,
  topGlyphs: ['.   ', '. . ', '.:. ', ':.;.', ';:=.', '=;%:'],
};
/** The terrace's stone: moonlit grey, mottled, a little moss toward the rim (not scorched). */
const pavingCol = (px, py, pz) => mul(STONE, (0.6 + 0.35 * fbm2(px * 1.6, pz * 1.6, 2)) * (0.8 + 0.2 * fbm2(px * 0.15 + 4, pz * 0.15, 2)));
/** The kerb: a tone lighter (its top catches the moon: the ring reads as a line). */
const kerbCol = (px, py, pz) => mul(STONE, 0.85 + 0.3 * fbm2(px * 2.2, pz * 2.2, 2));
/** The path's flagstones (forest.js buildFlagstone's colour). */
const flagCol = (px, py, pz) => mul(STONE, 0.6 + 0.4 * fbm2(px * 2, pz * 2, 2));
const WOOD = [0.11, 0.08, 0.06];
const PAPER = [0.27, 0.26, 0.235];
const FOX_STONE = [0.15, 0.145, 0.142];
const BIB = [0.2, 0.052, 0.038];

/** A convex polygon ([x, z] world) clipped to the disc of radius R (a 72-gon with that apothem). */
function clipDisc(poly, R, n = 72) {
  let out = poly;
  for (let k = 0; k < n && out.length > 2; k++) {
    const a = (k / n) * TAU, nx = Math.cos(a), nz = Math.sin(a);
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const p = src[i], q = src[(i + 1) % src.length];
      const dp = p[0] * nx + p[1] * nz - R, dq = q[0] * nx + q[1] * nz - R;
      if (dp <= 0) out.push(p);
      if (dp <= 0 !== dq <= 0) {
        const t = dp / (dp - dq);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
  }
  return out;
}

/** A polygon's area and centroid. */
function polyStats(pts) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const c = p[0] * q[1] - q[0] * p[1];
    a += c;
    cx += (p[0] + q[0]) * c;
    cz += (p[1] + q[1]) * c;
  }
  a /= 2;
  return { area: Math.abs(a), x: cx / (6 * a), z: cz / (6 * a) };
}

/** A square-ish slab's corners (world [x, z]): jittered, some with a chipped corner, turned by yaw (courtyard.js pavingSlab's). */
function slabCorners(rng, x, z, w, d, yaw) {
  const j = 0.05;
  const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([px, pz]) => [px + range(rng, -j, j), pz + range(rng, -j, j)]);
  if (rng() < 0.25) {
    const k = Math.floor(rng() * 4), a = pts[k], b = pts[(k + 1) % 4];
    pts.splice(k + 1, 0, [a[0] * 0.55 + b[0] * 0.45, a[1] * 0.55 + b[1] * 0.45]);
    a[0] *= 0.82;
    a[1] *= 0.82;
  }
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return pts.map(([px, pz]) => [x + c * px + s * pz, z - s * px + c * pz]);
}

/**
 * A slab from a world outline: chamfered (slabGeometry), laid on a slight tilt, carved with `col`.
 * Returns { geo, outline, x, z, r } (r: its farthest corner from its middle).
 */
function outlineSlab(rng, outline, col, { top = range(rng, 0.03, 0.05), inset = 0.06, drop = 0.04, tilt = 0.025 } = {}) {
  const { x, z } = polyStats(outline);
  let r = 0;
  for (const [px, pz] of outline) r = Math.max(r, Math.hypot(px - x, pz - z));
  const g = slabGeometry(outline.map(([px, pz]) => [px - x, pz - z]), { top, inset, drop });
  if (tilt > 0) g.applyMatrix4(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(range(rng, -1, 1), 0, range(rng, -1, 1)).normalize(), range(rng, 0.004, tilt)));
  g.translate(x, 0, z);
  carve(g, {
    col,
    ao: 0.85,
    moss: (px, py, pz) => 0.04 + 0.2 * Math.max(0, Math.hypot(px, pz) / TERRACE.r - 0.7),
    edge: (px, py, pz, nx, ny) => (ny > 0.5 && ny < 0.95 ? 1 : 0),
  });
  return { geo: g, outline, x, z, r };
}

/**
 * A seated stone fox on a plinth (~1.75 m in all): low-poly, flat facets, carved for prop art. The
 * haunches and the chest leaning forward, straight forelegs, a wedge of a head with a long snout and
 * two tall ears, the tail curled round its feet, a dull red bib. Faces +z. Returns { geos, plinth,
 * top } (world space; `plinth` a clone of its plinth for the broken look, `top` the plinth's height).
 */
function buildFoxStatue(rng, x, z, yaw) {
  const parts = [];
  const tone = (k) => facetCol(FOX_STONE, k);
  const ao = (px, py) => 0.55 + 0.45 * Math.min(1, py / 1.4);
  const add = (g, k = 1, col = null) => {
    parts.push([g, col ?? tone(k)]);
    return g;
  };
  // ---- the plinth: a base and a block
  const T = 0.4;
  const base = prep(new THREE.BoxGeometry(0.9, 0.16, 1.45));
  base.translate(0, 0.08, 0);
  const block = prep(new THREE.BoxGeometry(0.74, T - 0.16, 1.28));
  block.translate(0, 0.16 + (T - 0.16) / 2, 0);
  const plinth = mergeGeometries([base, block]);
  lumpy(plinth, 0.015, 4, rng() * 9, new THREE.Vector3(0, T / 2, 0));
  add(plinth, 0.7);
  // ---- the fox, built at the plinth's top (y 0) then grown by S: a fox the camera can tell, on a low block
  const S = 1.4, fox = [];
  const part = (g, k = 1, col = null) => fox.push([g, col ?? tone(k)]);
  const fz = -0.06;
  const V = (a, b, c) => new THREE.Vector3(a, b, c + fz);
  part(frustum(0, 0.42, 0.26, 0.32, 0.18, 0.19, 6).translate(0, 0, fz - 0.1), 0.85); // the haunches
  {
    const ch = frustum(0.25, 0.55, 0.17, 0.15, 0.12, 0.11, 6); // the chest, leaning forward
    const p = ch.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + (p.getY(i) - 0.25) * 0.38);
    part(ch.translate(0, 0, fz), 1.0);
  }
  for (const sx of [-1, 1]) part(limb(V(sx * 0.09, 0.02, 0.22), V(sx * 0.08, 0.5, 0.11), 0.045, 0.05, 4), 1.05);
  part(frustum(0.7, 0.15, 0.15, 0.14, 0.09, 0.085, 6).translate(0, 0, fz + 0.2), 1, BIB); // the bib
  {
    const skull = prep(new THREE.IcosahedronGeometry(0.12, 0));
    skull.scale(0.95, 0.85, 1.05);
    skull.translate(0, 0.95, fz + 0.24);
    part(skull, 1.1);
    const snout = prep(new THREE.ConeGeometry(0.07, 0.28, 4));
    snout.rotateY(Math.PI / 4);
    snout.rotateX(Math.PI / 2 + 0.12);
    snout.translate(0, 0.92, fz + 0.43);
    part(snout, 1.2);
    for (const sx of [-1, 1]) {
      const ear = prep(new THREE.ConeGeometry(0.055, 0.24, 4));
      ear.rotateZ(-sx * 0.2);
      ear.translate(sx * 0.07, 1.12, fz + 0.2);
      part(ear, 1.3);
    }
  }
  // the brush tail: up from the back of the haunches and over, its tip turned out
  {
    const P = [V(0, 0.12, -0.3), V(-0.02, 0.4, -0.46), V(-0.03, 0.72, -0.44), V(0, 0.9, -0.3)];
    const R = [0.08, 0.12, 0.1, 0.03];
    for (let i = 0; i < P.length - 1; i++) part(limb(P[i], P[i + 1], R[i], R[i + 1], 5), 1.0 + i * 0.12);
  }
  for (const [g, col] of fox) {
    g.scale(S, S, S);
    g.translate(0, T, 0);
    add(g, 1, col);
  }
  const geos = [];
  for (const [g, col] of parts) {
    g.rotateY(yaw);
    g.translate(x, 0, z);
    carve(g, { col, ao, moss: (px, py, pz, nx, ny) => (ny > 0.6 ? 0.25 : py < 0.3 ? 0.3 : 0.04) });
    geos.push(g);
  }
  return { geos, plinth: geos[0].clone(), top: T };
}

/**
 * A charm post: a square wooden post with a little roof, a crossbar near its top, paper strips cut
 * in steps (zigzags) hanging from the bar. Carved for prop art (wood: it burns). Faces +z. Returns
 * { geos, stub } (world space; `stub` the snapped foot it leaves).
 */
function buildCharmPost(rng, x, z, yaw) {
  const H = range(rng, 2.35, 2.65);
  const lean = range(rng, -0.04, 0.04);
  const parts = [];
  const wood = (g, k = 1) => parts.push([g, facetCol(WOOD, k)]);
  const post = prep(new THREE.BoxGeometry(0.16, H, 0.16, 1, 3, 1));
  post.translate(0, H / 2, 0);
  wood(post, 1.0);
  const cap = prep(new THREE.ConeGeometry(0.17, 0.16, 4));
  cap.rotateY(Math.PI / 4);
  cap.translate(0, H + 0.08, 0);
  wood(cap, 1.5);
  const bar = prep(new THREE.BoxGeometry(1.3, 0.09, 0.09));
  bar.translate(0, H - 0.32, 0.1);
  wood(bar, 1.25);
  // the strips: thin boards cut in steps, hanging from the bar
  for (const sx of [-0.52, -0.2, 0.2, 0.52]) {
    const L = range(rng, 0.42, 0.62);
    const s = prep(new THREE.BoxGeometry(0.075, L, 0.018, 1, 4, 1));
    const p = s.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = Math.round((L / 2 - p.getY(i)) / (L / 4));
      p.setX(i, p.getX(i) + (k % 2 ? 0.035 : 0));
    }
    s.translate(sx, H - 0.38 - L / 2, 0.15);
    // (paper: it flutters in the breeze from the bar, world/hang.js)
    parts.push([hangFrom(s, H - 0.38, 'paper'), facetCol(PAPER, range(rng, 0.85, 1.1))]);
  }
  const geos = [];
  for (const [g, col] of parts) {
    g.rotateX(lean);
    g.rotateY(yaw);
    g.translate(x, 0, z);
    carve(g, { col, ao: (px, py) => 0.6 + 0.4 * Math.min(1, py / 2) });
    geos.push(g);
  }
  // the snapped foot
  const h0 = range(rng, 0.35, 0.6);
  const stub = prep(new THREE.BoxGeometry(0.16, h0, 0.16, 1, 1, 1));
  stub.translate(0, h0 / 2, 0);
  const sp = stub.attributes.position;
  for (let i = 0; i < sp.count; i++) if (sp.getY(i) > h0 * 0.9) sp.setY(i, sp.getY(i) - ((i * 7) % 5) * 0.04);
  stub.rotateY(yaw);
  stub.translate(x, 0, z);
  carve(stub, { col: facetCol(WOOD, 0.8), ao: 0.7 });
  return { geos, stub: [stub] };
}

// ---------- assembly ----------
/** Trees and boulders this close to the terrace's centre are breakables (world/destructibles.js). */
const BREAK_R = 30;
/** ... and the dead trees out to where the hero can go (playerBound 40). */
const REACH_R = 40;
/**
 * The set. Built on a quiet Math.random (three names every object, mesh and material with a random uuid):
 * the seeded sims replay Math.random, and a set that draws on it reshuffles every seeded fight after it
 * whenever a prop is added or taken away (destructibles.js quietGroup: the wyrm's WRECKAGE fight). Here the
 * set's own build draws nothing from it, whatever it holds.
 */
export function createFoxTerrace(U, colliders) {
  const r = Math.random;
  let s = 0x0f0c5e7a;
  Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  try {
    return buildTerrace(U, colliders);
  } finally {
    Math.random = r;
  }
}

function buildTerrace(U, colliders) {
  const T = TERRACE;
  // three seeded streams (as the courtyard): the layout; the rubble and stumps of the breakables; one
  // spare for anything added later (so adding a thing leaves the layout and the rubble as they were)
  const rng = mulberry32(CONFIG.seed + 131);
  const br = mulberry32(CONFIG.seed + 5131);
  const nr = mulberry32(CONFIG.seed + 6131);
  void nr;
  const group = new THREE.Group();
  group.name = 'foxTerrace';
  const treeGeos = [];
  const stoneGeos = [];
  const slabGeos = [];
  const propGeos = [];
  const treeSpots = [];
  const bare = [];
  const slabs = [];
  const breakables = [];
  /** the floor's slabs: { geo, outline, x, z, r, col } (world/floor.js makes them breakable) */
  const floor = [];
  const addSlab = (s, col) => {
    slabGeos.push(s.geo);
    slabs.push({ x: s.x, z: s.z, r: s.r, outline: s.outline });
    floor.push({ geo: s.geo, outline: s.outline, x: s.x, z: s.z, r: s.r * 0.8, col });
  };

  // ---- the paving: the courtyard's rows of slabs (some two cells long, a staggered bond), cut to the
  // round of the terrace; a few missing (the hill's grass shows through)
  const n = Math.round((2 * T.r) / T.cell);
  const half = (n * T.cell) / 2;
  for (let j = 0; j < n; j++) {
    const z = -half + (j + 0.5) * T.cell;
    let i = j % 2 ? -0.5 : 0;
    while (i < n) {
      const long = rng() < 0.38 && i + 2 <= n;
      const span = Math.min(long ? 2 : 1, n - Math.max(0, i));
      const i0 = Math.max(0, i), i1 = Math.min(n, i + span);
      i += span;
      if (i1 - i0 < 0.4) continue;
      const x = -half + ((i0 + i1) / 2) * T.cell;
      const w = (i1 - i0) * T.cell - range(rng, 0.1, 0.2), d = T.cell - range(rng, 0.1, 0.2);
      const yaw = range(rng, -0.05, 0.05), jx = range(rng, -0.04, 0.04), jz = range(rng, -0.04, 0.04);
      const gone = rng() < 0.05;
      const corners = slabCorners(rng, x + jx, z + jz, w, d, yaw);
      if (Math.hypot(x, z) > T.r + 0.3) continue;
      if (gone) {
        if (Math.hypot(x, z) < T.r - 1) bare.push({ x, z, r: 0.6 * (i1 - i0) });
        continue;
      }
      // (cut to the round where it crosses the rim)
      const cut = corners.every(([px, pz]) => Math.hypot(px, pz) < T.r - 0.05) ? corners : clipDisc(corners, T.r - 0.05);
      if (cut.length < 3 || polyStats(cut).area < 0.3) continue;
      addSlab(outlineSlab(rng, cut, pavingCol), pavingCol);
    }
  }

  // ---- the kerb: curved stones round the rim, a step up, their tops a tone lighter
  {
    const r0 = T.r + 0.03, r1 = T.r + T.kerb, mid = (r0 + r1) / 2;
    const k = Math.round((TAU * mid) / 1.25);
    for (let i = 0; i < k; i++) {
      const gap = 0.05 / mid;
      const a0 = (i / k) * TAU + gap / 2, a1 = ((i + 1) / k) * TAU - gap / 2, am = (a0 + a1) / 2;
      const pts = [a0, am, a1].map((a) => [Math.cos(a) * r0, Math.sin(a) * r0]).concat([a1, am, a0].map((a) => [Math.cos(a) * r1, Math.sin(a) * r1]));
      addSlab(outlineSlab(rng, pts, kerbCol, { top: range(rng, 0.08, 0.1), inset: 0.07, drop: 0.05, tilt: 0.012 }), kerbCol);
    }
  }

  // ---- the steps down to the path: long slabs in rows
  for (const z of T.steps) {
    let x = -T.stepHalf;
    while (x < T.stepHalf - 0.2) {
      const w = Math.min(T.stepHalf - x, range(rng, 1.3, 2.4));
      addSlab(outlineSlab(rng, slabCorners(rng, x + w / 2, z, w - 0.08, 0.76, range(rng, -0.03, 0.03)), pavingCol), pavingCol);
      x += w;
    }
  }
  // ---- the path down the slope to the bonfire
  for (let z = T.pathFrom; z < T.pathTo; z += range(rng, 0.9, 1.3)) {
    const x = pathX(z) + range(rng, -0.6, 0.6);
    const w = range(rng, 0.9, 1.5), d = range(rng, 0.7, 1.2);
    const s = buildFlagstone(rng, x, z, w, d, rng() * TAU);
    slabGeos.push(s.geo);
    slabs.push({ x, z, r: Math.max(w, d) * 0.65, outline: s.outline });
    floor.push({ geo: s.geo, outline: s.outline, x, z, r: Math.max(w, d) * 0.5, col: flagCol });
  }

  // ---- the bonfire on its landing
  const bf = T.bonfire;
  propGeos.push(...buildBonfire(rng, bf.x, bf.z));
  colliders.add(bf.x, bf.z, 0.75, 'bonfire');
  bare.push({ x: bf.x, z: bf.z, r: 2.4 });

  // ---- the ten stone lanterns on the rim
  for (let k = 0; k < T.lanterns; k++) {
    const a = T.lanternAt(k), p = at(a, T.lanternR);
    const g = buildLantern(rng, p.x, p.z, a + range(rng, -0.08, 0.08));
    breakables.push({
      kind: 'lantern', mat: 'stone', look: 'prop', x: p.x, z: p.z, r: 0.45, h: geosHeight([g]), geos: [g], colliders: [colliders.add(p.x, p.z, 0.45, 'stone')],
      broken: { geos: buildRubble(br, p.x, p.z, 0.45 * 0.85, { h: range(br, 0.3, 0.5) }), r: 0.32 }, topples: false, lift: 2,
    });
  }
  // ---- the six seated stone foxes on their plinths, in pairs facing each other across the terrace,
  // turned a little toward the steps: the camera (from the south) sees each in a three-quarter profile,
  // snout and ears and tail (from the front, seen from above, a fox is a lump)
  for (const a of T.statueAt) {
    const p = at(a, T.statueR);
    const yaw = -Math.sign(p.x) * (Math.PI / 2 - 0.4) + range(rng, -0.06, 0.06);
    const f = buildFoxStatue(rng, p.x, p.z, yaw);
    const rub = buildRubble(br, p.x, p.z, 0.32, { col: FOX_STONE, h: range(br, 0.2, 0.32) });
    for (const g of rub) g.translate(0, f.top - 0.04, 0);
    breakables.push({
      kind: 'foxStatue', mat: 'stone', look: 'prop', x: p.x, z: p.z, r: 0.6, h: geosHeight(f.geos), geos: f.geos, colliders: [colliders.add(p.x, p.z, 0.6, 'stone')],
      broken: { geos: [f.plinth, ...rub], r: 0.55 }, topples: false, lift: 0,
    });
  }
  // ---- the eight charm posts outside the rim: wood, they burn (destructibles.js: a material's `burns`)
  for (const a of T.postAt) {
    const p = at(a, T.postR);
    const c = buildCharmPost(rng, p.x, p.z, a + Math.PI + range(rng, -0.2, 0.2));
    breakables.push({
      kind: 'charmPost', mat: 'wood', look: 'prop', x: p.x, z: p.z, r: 0.22, h: geosHeight(c.geos), geos: c.geos, colliders: [colliders.add(p.x, p.z, 0.2, 'trunk')],
      broken: { geos: c.stub, r: 0.14 }, lift: 1, cover: false,
    });
  }

  // ---- the landmarks: they chip, they do not fall (hp Infinity)
  const GF = T.greatFox, SG = T.spiritGate;
  {
    const lr = mulberry32(CONFIG.seed + 1931);
    const fox = carved(buildGreatFox(lr, GF.x, GF.z, GF.yaw, GF.s));
    const fc = GREAT_FOX_COLLIDERS.map(([lx, lz, r]) => {
      const p = landmarkPoint(GF.x, GF.z, GF.yaw, GF.s, lx, lz);
      return colliders.add(p.x, p.z, r * GF.s, 'stone');
    });
    breakables.push({ kind: 'greatFox', mat: 'stone', look: 'prop', x: GF.x, z: GF.z, r: 2.9 * GF.s, h: geosHeight(fox), geos: fox, colliders: fc, hp: Infinity, topples: false, lift: 0 });
    const gate = carved(buildSpiritGate(lr, SG.x, SG.z, SG.yaw, SG.s));
    const gc = SPIRIT_GATE_COLLIDERS.map(([lx, lz, r]) => {
      const p = landmarkPoint(SG.x, SG.z, SG.yaw, SG.s, lx, lz);
      return colliders.add(p.x, p.z, r * SG.s, 'stone');
    });
    // (an opening, not a wall: it stops no projectile)
    breakables.push({ kind: 'spiritGate', mat: 'stone', look: 'prop', x: SG.x, z: SG.z, r: 2.8 * SG.s, h: geosHeight(gate), geos: gate, colliders: gc, hp: Infinity, topples: false, cover: false, lift: 0 });
  }

  // ---- dead trees and boulders round the hill: the terrace, the posts, the path and the landmarks left open
  const open = (x, z) => {
    if (Math.hypot(x, z) < T.postR + 3) return false; // the terrace, its rim and the posts
    if (z > T.r && z < T.pathTo + 4 && Math.abs(x - pathX(z)) < 4.6) return false; // steps + path
    if (Math.hypot(x - bf.x, z - bf.z) < 5) return false;
    return true;
  };
  const inLandmark = (x, z) => Math.hypot(x - GF.x, z - GF.z) < 5 || Math.hypot(x - SG.x, z - SG.z) < 4.5;
  const trees = [];
  for (let i = 0; i < 30000 && trees.length < 300; i++) {
    const a = rng() * TAU, r = 19 + Math.pow(rng(), 1.3) * 52;
    const x = Math.cos(a) * r, z = Math.sin(a) * r + 6;
    if (!open(x, z) || inLandmark(x, z)) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < (r < 40 ? 3.6 : 3.8))) continue;
    trees.push({ x, z, s: range(rng, 0.85, 1.35), stump: rng() < 0.25 });
  }
  for (const t of trees) {
    const g = t.stump ? buildStump(rng, t.x, t.z, t.s) : buildDeadTree(rng, t.x, t.z, t.s);
    treeSpots.push({ x: t.x, z: t.z, r: (t.stump ? 1.2 : 2.4) * t.s });
    const rad = Math.hypot(t.x, t.z);
    const c = rad < 46 ? colliders.add(t.x, t.z, (t.stump ? 0.4 : 0.42) * t.s, 'trunk') : null;
    // the dead trees out to where the hero can go can be felled, burned and thrown; a stump splinters
    if (!t.stump && rad < REACH_R) {
      breakables.push({ kind: 'deadTree', mat: 'wood', look: 'grid', x: t.x, z: t.z, r: 0.42 * t.s, h: geosHeight(g), geos: g, colliders: c ? [c] : [], broken: { geos: buildStump(br, t.x, t.z, t.s), r: 0.36 * t.s }, lift: 1 });
    } else if (t.stump && rad < REACH_R) {
      breakables.push({ kind: 'stump', mat: 'wood', look: 'grid', x: t.x, z: t.z, r: 0.4 * t.s, h: Math.max(0.3, geosHeight(g)), geos: g, colliders: c ? [c] : [], topples: false, lift: 1, wreck: false });
    } else treeGeos.push(...g);
  }
  for (let i = 0; i < 26; i++) {
    const a = rng() * TAU, r = range(rng, 20, 55);
    const x = Math.cos(a) * r, z = Math.sin(a) * r + 6;
    if (!open(x, z) || inLandmark(x, z)) continue;
    const size = range(rng, 0.7, 1.7);
    const boulder = buildBoulder(rng, x, z, size);
    const c = r < 46 ? colliders.add(x, z, size * 0.85, 'boulder') : null;
    if (Math.hypot(x, z) < BREAK_R) breakables.push({ kind: 'boulder', mat: 'stone', look: 'prop', x, z, r: size * 0.85, h: geosHeight([boulder]), geos: [boulder], colliders: c ? [c] : [], topples: false, lift: 1 });
    else stoneGeos.push(boulder);
  }

  const mat = createAsciiObjectMaterial(U, { fadeNearPlayer: true, side: THREE.DoubleSide });
  const meshes = [];
  const mesh = (geos, m, name) => {
    if (!geos.length) return null;
    const o = new THREE.Mesh(mergeGeometries(geos), m);
    o.name = name;
    meshes.push(o);
    return o;
  };
  mesh(treeGeos, mat, 'trees');
  mesh(propGeos, mat, 'props');
  const stoneMat = createPropArtMaterial(U, { fadeNearPlayer: true });
  mesh(stoneGeos, stoneMat, 'stones');
  const slabMat = createCarvedGlyphMaterial(U, { ...SLAB_LOOK, ...PAVING_LOOK, viewPitch: CONFIG.camera.pitch });
  const slabMesh = mesh(slabGeos, slabMat, 'paving');
  group.add(...meshes);
  markCaster(group);
  breakables.push(...breakableFloor({ slabs: floor, slabGeos, slabMesh, mat: slabMat, rng: mulberry32(CONFIG.seed + 7131), group }).defs);

  const S = CONFIG.world.dragonSleep ?? { x: 0, z: 0 };
  return {
    group, treeSpots, bare, slabs, nest: { x: S.x, z: S.z }, bonfire: { x: bf.x, z: bf.z },
    material: mat, stoneMaterial: stoneMat, slabMaterial: slabMat,
    breakables,
    // the terrace's light, pulled down while the Nine-Tailed Fox stands (thousandFox/beam.js; makeLight)
    light: makeLight(),
    scarInk: [0.012, 0.012, 0.016], // dark cracks in the grey paving
    // the hill's grass as the meadow's; a few tufts in the joints of the paving, a little on the path
    grass: {
      density: (x, z) => {
        if (Math.hypot(x, z) < T.r + T.kerb + 0.3) return 0.1;
        if (z > T.r && z < T.pathTo + 3 && Math.abs(x - pathX(z)) < 2.2) return 0.3;
        return 1;
      },
    },
  };
}

/**
 * The terrace's light while something calls it down (the Howl: thousandFox/beam.js). Not an `ambience`
 * (that would take the fireflies' place): its caller steps it. `dim(k)` each frame it should hold (k
 * 0..1; it lets go 0.2 s after the last call), `update(dt, game)` every frame (it eases ~0.25 s and
 * writes the moon, the ambient and the fog colours as they were x (1 - 0.75 dim); back to 0 they are
 * restored exactly), `reset(game)` the light back at once, `state` { dim }.
 */
function makeLight() {
  const st = { dim: 0, want: 0, hold: 0, base: null };
  const KEYS = ['uMoonColor', 'uAmbient', 'uFogColor'];
  const restore = (U) => {
    if (st.base && U) for (const k of KEYS) if (st.base[k] && U[k]?.value) U[k].value.copy(st.base[k]);
    st.base = null;
  };
  return {
    get state() {
      return { dim: st.dim };
    },
    dim(k = 1) {
      const v = Number(k);
      st.want = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
      st.hold = 0.2;
    },
    reset(game) {
      restore(game?.U);
      st.dim = st.want = st.hold = 0;
    },
    update(dt, game) {
      if (!(dt > 0)) return;
      if (st.hold > 0) st.hold -= dt;
      else st.want = 0;
      if (st.dim <= 0 && st.want <= 0) return;
      const U = game?.U;
      st.dim += (st.want - st.dim) * (1 - Math.exp(-dt * 4));
      if (st.want <= 0 && st.dim < 0.004) {
        st.dim = 0;
        restore(U);
        return;
      }
      if (!U) return;
      if (!st.base) {
        st.base = {};
        for (const k of KEYS) if (U[k]?.value?.clone) st.base[k] = U[k].value.clone();
      }
      const f = 1 - 0.75 * st.dim;
      for (const k of KEYS) if (st.base[k] && U[k]?.value) U[k].value.copy(st.base[k]).multiplyScalar(f);
    },
  };
}
