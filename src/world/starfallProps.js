import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { range, hash2 } from '../core/rng.js';
import { TAU } from '../core/math.js';
import { prep, lumpy, carve, slabGeometry, mul } from './forest.js';
import { facetCol, STAR_GLASS } from './landmarks.js';
import { hangFrom, mergeHang } from './hang.js';

// The ground round the Obsidian Throne's crater (world/throneHall.js): what the star's fall left
// lying where a forest stood. Every builder returns `{ geos, r, h?, mat, cr?, ... }`: carved parts in
// WORLD space for prop art (STYLE.md "The house style": a dark body, flat facets of different tones,
// no blank cell inside a shape), drawn as a breakable (ARCHITECTURE.md "Destruction") or merged into
// the set's stones out of reach. `oy` is the yaw that points away from the crater (local +z = out).
//
// The camera looks down at 58 degrees from the south: anything with a face (a stele's inscription, a
// lantern's window, a roof's tiles) is turned toward +z (the camera) within ~35 degrees; what the blast
// threw over lies along its way out, turned off that line so the ring is not a starburst; nothing
// stands on a point: every piece rests on a face, sunk a little into the ground.

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- palette (linear albedo)
const OBS = [0.075, 0.078, 0.105]; // the crater's obsidian
const STONE = [0.13, 0.135, 0.16]; // the land's grey stone (lanterns, steles, pillars)
const EARTH = [0.11, 0.08, 0.062]; // churned earth
const CLAY = [0.16, 0.09, 0.06]; // fired clay
const GLAZE = [0.06, 0.055, 0.06]; // the jars' dark glaze
const WOOD = [0.12, 0.085, 0.062];
const OLD_WOOD = [0.1, 0.075, 0.06];
const TILE = [0.065, 0.075, 0.1]; // roof tiles
const STEEL = [0.2, 0.215, 0.27];
const IRON = [0.09, 0.09, 0.1];
const CLOTH = [0.24, 0.045, 0.035]; // a deep red
const STRAW = [0.2, 0.16, 0.09];

// ---------------------------------------------------------------- helpers
/** Carve `g` (prop art) in colour `c` × k, a facet tone each; lit from its foot (y0) up over `h` m. */
function ink(g, c, k = 1.3, { lo = 0.5, h = 1.5, y0 = 0, col = null } = {}) {
  carve(g, { col: col ?? facetCol(c, k), ao: (px, py) => lo + (1 - lo) * Math.min(1, Math.max(0, (py - y0) / h)) });
  return g;
}

/** A tapered limb from a to b (radius r0 at a, r1 at b). */
function limb(a, b, r0, r1, sides = 5) {
  const d = b.clone().sub(a);
  const len = d.length();
  const g = prep(new THREE.CylinderGeometry(r1, r0, len, sides, 1));
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}

/** A box with its base at y0. */
function boxAt(w, h, d, x = 0, y0 = 0, z = 0, seg = 1) {
  const g = prep(new THREE.BoxGeometry(w, h, d, 1, seg, 1));
  g.translate(x, y0 + h / 2, z);
  return g;
}

/** A frustum (`sides` sides) from radius r0 at y0 to r1 at y0 + h. */
function drum(r0, r1, h, y0 = 0, sides = 8, turn = 0) {
  const g = prep(new THREE.CylinderGeometry(r1, r0, h, sides, 1));
  if (turn) g.rotateY(turn);
  g.translate(0, y0 + h / 2, 0);
  return g;
}

/** Jag the vertices above y (a break): down by up to `amt`, keyed on position (watertight). */
function jag(g, y, amt, seed = 0) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > y) p.setY(i, y + (p.getY(i) - y) * 0.2 - hash2(p.getX(i) * 13 + seed, p.getZ(i) * 13 - seed) * amt);
  }
  return g;
}

/** A few clods / chips round (cx, cz) in local space. */
function clods(rng, n, cx, cz, R, size, col, k = 1.3, y = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU, r = Math.sqrt(rng()) * R, s = range(rng, size[0], size[1]);
    const g = prep(new THREE.IcosahedronGeometry(s, 0));
    lumpy(g, s * 0.4, 2 / s, rng() * 50);
    g.scale(1, range(rng, 0.45, 0.75), 1);
    g.rotateY(rng() * TAU);
    g.translate(cx + Math.cos(a) * r, y + s * 0.2, cz + Math.sin(a) * r);
    out.push(ink(g, col, k, { lo: 0.7 }));
  }
  return out;
}

/** Turn local parts by yaw and move them to (x, z). */
function place(parts, x, z, yaw) {
  for (const g of parts) {
    g.rotateY(yaw);
    g.translate(x, 0, z);
  }
  return parts;
}

/** A local part laid over: rotated `ang` about the horizontal axis at yaw `ay` (it falls toward ay). */
function tip(g, ang, ay) {
  const ax = V(Math.cos(ay), 0, -Math.sin(ay)); // perpendicular to (sin ay, 0, cos ay)
  g.applyMatrix4(new THREE.Matrix4().makeRotationAxis(ax, ang));
  return g;
}

// ================================================================ the star's debris
/**
 * A chunk of the star thrown out of the crater: a half-sunk block of obsidian with splinters of its
 * glass in it, and the furrow it ploughed as it skidded out (two ridges of earth back toward the crater).
 */
export function buildEjecta(rng, x, z, oy, s = 1) {
  const parts = [];
  const r = 0.85 * s;
  const rock = prep(new THREE.IcosahedronGeometry(r, 0));
  lumpy(rock, r * 0.5, 1.1 / r, rng() * 90);
  rock.scale(range(rng, 1.1, 1.4), range(rng, 0.7, 0.9), 1);
  rock.rotateX(range(rng, -0.3, 0.3));
  rock.rotateY(rng() * TAU);
  rock.translate(0, r * 0.38, 0);
  parts.push(ink(rock, OBS, 1.7, { lo: 0.45, h: r * 1.4 }));
  // the star's glass, in it
  const n = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const h = range(rng, 0.5, 1.0) * s, a = rng() * TAU;
    const g = prep(new THREE.CylinderGeometry(0.02, 0.1 * s, h, 4, 1));
    g.translate(0, h / 2, 0);
    g.rotateZ(range(rng, 0.3, 0.8));
    g.rotateY(a);
    g.translate(Math.cos(a) * r * 0.3, r * 0.55, Math.sin(a) * r * 0.3);
    parts.push(ink(g, STAR_GLASS, 2.0, { lo: 0.7 }));
  }
  // the furrow, back toward the crater (local -z): two ridges, lower and narrower as they go
  const L = range(rng, 2.4, 4.2) * s;
  for (const sx of [-1, 1]) {
    const g = prep(new THREE.IcosahedronGeometry(1, 1));
    lumpy(g, 0.35, 2.2, rng() * 70);
    g.scale(0.32 * s, 0.24 * s, L / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = (p.getZ(i) + L / 2) / L; // 0 at the far end, 1 at the rock
      p.setY(i, p.getY(i) * (0.35 + 0.65 * t));
      p.setX(i, p.getX(i) * (0.5 + 0.5 * t) + sx * (0.25 + 0.4 * t) * r);
    }
    g.translate(0, 0, -L / 2 - r * 0.6);
    parts.push(ink(g, EARTH, 1.4, { lo: 0.65, h: 0.4 }));
  }
  parts.push(...clods(rng, 4, 0, -L * 0.5, 1.2 * s, [0.1 * s, 0.2 * s], EARTH));
  return { geos: place(parts, x, z, oy + range(rng, -0.35, 0.35)), r: r * 1.1, cr: r * 0.85, mat: 'stone', h: r * 1.2 };
}

/**
 * Ground the blast heaved up: two or three plates of earth broken loose and stood on edge in a row
 * across its way, leaning out; clods at their feet.
 */
export function buildHeave(rng, x, z, oy, s = 1) {
  const parts = [];
  const n = 2 + Math.floor(rng() * 2);
  let off = -((n - 1) / 2) * 1.5 * s;
  for (let i = 0; i < n; i++, off += range(rng, 1.25, 1.7) * s) {
    const w = range(rng, 0.7, 1.05) * s, d = range(rng, 0.55, 0.85) * s, sides = 5 + Math.floor(rng() * 2), a0 = rng() * TAU;
    const pts = [];
    for (let k = 0; k < sides; k++) {
      const a = a0 + ((k + (rng() - 0.5) * 0.5) / sides) * TAU, rr = 0.85 + rng() * 0.3;
      pts.push([Math.cos(a) * rr * w, Math.sin(a) * rr * d]);
    }
    const g = slabGeometry(pts, { top: 0.32 * s, inset: 0.08, drop: 0.07, bottom: -0.04 });
    // stood up about its inner (crater-side) edge, leaning out
    g.translate(0, 0, d);
    g.rotateX(-range(rng, 0.75, 1.2)); // (+z up: hinged on its crater side)
    g.rotateY(range(rng, -0.25, 0.25));
    g.translate(off, -0.12, -d * 0.4 + range(rng, -0.3, 0.3));
    // its old top (the turf) lighter than the raw earth under it
    parts.push(ink(g, EARTH, 1.5, { lo: 0.6, h: 1.2 }));
  }
  parts.push(...clods(rng, 5, 0, -0.4, 1.6 * s, [0.1 * s, 0.24 * s], EARTH));
  return { geos: place(parts, x, z, oy + range(rng, -0.3, 0.3)), r: 1.6 * s, cr: 1.1 * s, mat: 'stone', h: 1.1 * s };
}

/** Splinters of the star's glass that flew out and stuck in the ground, their tails toward the crater. */
export function buildSplinters(rng, x, z, oy, s = 1) {
  const parts = [];
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const h = range(rng, 0.8, 2.1) * s * (i === 0 ? 1.2 : 1), r = h * range(rng, 0.09, 0.13);
    const body = prep(new THREE.CylinderGeometry(r * 0.8, r, h * 0.6, 5, 1));
    body.translate(0, h * 0.3, 0);
    const point = prep(new THREE.ConeGeometry(r * 0.8, h * 0.4, 5, 1));
    point.translate(0, h * 0.8, 0);
    const g = mergeGeometries([body, point]);
    g.rotateY(rng() * TAU);
    // stuck point first: its top leans back toward the crater (local -z), splayed a little
    tip(g, range(rng, 0.3, 0.75), Math.PI + range(rng, -0.6, 0.6));
    const a = rng() * TAU, d = i === 0 ? 0 : range(rng, 0.4, 1.3) * s;
    g.translate(Math.cos(a) * d, -0.15, Math.sin(a) * d);
    parts.push(ink(g, STAR_GLASS, 1.7, { lo: 0.55, h: 1.6 }));
  }
  parts.push(...clods(rng, 4, 0, 0, 1.1 * s, [0.08 * s, 0.18 * s], EARTH));
  return { geos: place(parts, x, z, oy), r: 1.2 * s, cr: 0.7 * s, mat: 'stone', h: 1.6 * s };
}

/** A boulder of the land's grey stone split in two by the heat, its halves fallen apart. */
export function buildSplitBoulder(rng, x, z, oy, s = 1) {
  const parts = [];
  const r = range(rng, 0.8, 1.15) * s, gap = range(rng, 0.12, 0.35) * s, seed = rng() * 90;
  for (const sx of [-1, 1]) {
    const g = prep(new THREE.IcosahedronGeometry(r, 1));
    lumpy(g, r * 0.35, 1.3 / r, seed);
    // the split: one side of the plane x = 0 pressed flat onto it
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getX(i) * sx < 0) p.setX(i, 0);
    g.scale(1, 0.8, 1);
    g.rotateZ(sx * range(rng, 0.15, 0.35)); // each half falls away from the cut
    g.translate(sx * gap, r * 0.55, 0);
    // the cut face darker (the heat went through it)
    const col = (px, py, pz, nx, ny, nz) => mul(STONE, (Math.abs(nx) > 0.8 && nx * sx < 0 ? 0.55 : 1.25) * (0.6 + 0.8 * hash2(Math.round(nx * 9) + Math.round(ny * 9) * 31, Math.round(nz * 9) + 3)));
    parts.push(ink(g, STONE, 1, { lo: 0.45, h: r * 1.5, col }));
  }
  parts.push(...clods(rng, 3, 0, 0.3, r * 1.6, [0.12 * s, 0.25 * s], STONE, 1.2));
  return { geos: place(parts, x, z, oy + Math.PI / 2 + range(rng, -0.5, 0.5)), r: r * 1.3, cr: r * 1.05, mat: 'stone', h: r * 1.5 };
}

// ================================================================ the shrine the star fell on
/**
 * A stone lantern: a hexagonal foot, a post, the lamp's table, the lamp box (its window a dark band),
 * a hipped cap and a knob. `state` 0 standing, 1 leaning with its cap thrown down, 2 thrown over.
 */
export function buildLantern(rng, x, z, oy, s = 1, state = 0) {
  const body = [];
  const k = range(rng, 1.0, 1.2) * s;
  body.push(drum(0.4, 0.32, 0.2, 0, 6, Math.PI / 6));
  body.push(drum(0.2, 0.18, 0.12, 0.2, 6, Math.PI / 6));
  body.push(drum(0.1, 0.09, 0.95, 0.32, 6, Math.PI / 6));
  body.push(drum(0.18, 0.34, 0.13, 1.27, 6, Math.PI / 6));
  const lamp = drum(0.21, 0.21, 0.42, 1.4, 6, Math.PI / 6);
  const capParts = [drum(0.5, 0.1, 0.3, 0, 6, Math.PI / 6), drum(0.1, 0.02, 0.26, 0.28, 6, Math.PI / 6)];
  const capY = 1.82;
  // the window: a dark band round the lamp box
  const stone = (px, py, pz, nx, ny, nz) => mul(STONE, 1.3 * (0.6 + 0.8 * hash2(Math.round(nx * 9) + Math.round(ny * 9) * 31, Math.round(nz * 9) + 5)));
  const win = (y0, y1) => (px, py, pz, nx, ny, nz) => (py > y0 && py < y1 && Math.abs(ny) < 0.3 ? mul(STONE, 0.25) : stone(px, py, pz, nx, ny, nz));
  const all = [];
  for (const g of body) all.push(ink(g, STONE, 1, { col: stone, lo: 0.55, h: 1.6 }));
  all.push(ink(lamp, STONE, 1, { col: win(1.5, 1.74), lo: 0.55, h: 1.6 }));
  const cap = mergeGeometries(capParts.map((g) => ink(g, STONE, 1, { col: stone, lo: 0.75, h: 1 })));
  const stand = mergeGeometries(all);
  stand.scale(k, k * 1.15, k); // (the camera's 58 degrees squash what stands: ADR-100 notes)
  cap.scale(k, k * 1.15, k);
  const out = [stand];
  const fall = range(rng, -0.6, 0.6);
  if (state === 0) {
    tip(stand, range(rng, 0.02, 0.09), rng() * TAU);
    cap.translate(0, capY * k * 1.15, 0);
    tip(cap, range(rng, 0, 0.08), rng() * TAU);
    out.push(cap);
  } else if (state === 1) {
    tip(stand, range(rng, 0.18, 0.32), fall);
    stand.translate(0, -0.08, 0);
    cap.rotateX(range(rng, 1.2, 1.9));
    cap.translate(range(rng, -0.4, 0.4), 0.35 * k, 1.9 * k);
    out.push(cap, ...clods(rng, 3, 0, 1.4 * k, 0.6, [0.08, 0.16], STONE));
  } else {
    // over on its side, its foot toward the crater; the cap rolled on
    tip(stand, Math.PI / 2 - 0.08, fall);
    stand.translate(0, 0.3 * k, 0);
    cap.rotateZ(range(rng, 1.3, 1.8));
    cap.translate(range(rng, -0.6, 0.6), 0.36 * k, 2.4 * k);
    out.push(cap, ...clods(rng, 3, 0, 1.0 * k, 0.8, [0.08, 0.16], STONE));
  }
  // a standing lantern faces the camera; a fallen one lies along the blast's way
  const yaw = state === 0 ? range(rng, -0.5, 0.5) : oy;
  return { geos: place(out, x, z, yaw), r: state === 2 ? 1.2 * k : 0.55 * k, cr: 0.45 * k, mat: 'stone', h: state === 0 ? 2.1 * k : 1.0 };
}

/**
 * A stele on its stone turtle: a tablet with an arched head and four columns of inscription (darker
 * bands on its face, turned to the camera), on the back of a squat turtle. `broken`: the tablet's top
 * snapped off and lying in front of it.
 */
export function buildStele(rng, x, z, oy, s = 1, broken = false) {
  const parts = [];
  // the turtle
  const shell = prep(new THREE.SphereGeometry(1, 7, 4, 0, TAU, 0, Math.PI / 2));
  shell.scale(0.85, 0.55, 1.15);
  lumpy(shell, 0.06, 3, rng() * 50);
  parts.push(ink(shell, STONE, 1.15, { lo: 0.5, h: 0.6 }));
  const head = prep(new THREE.IcosahedronGeometry(0.26, 0));
  head.scale(0.9, 0.75, 1.3);
  head.translate(0, 0.22, 1.28);
  parts.push(ink(head, STONE, 1.2, { lo: 0.6, h: 0.6 }));
  for (const [lx, lz] of [[-0.75, 0.6], [0.75, 0.6], [-0.75, -0.6], [0.75, -0.6]]) {
    const f = prep(new THREE.IcosahedronGeometry(0.2, 0));
    f.scale(1.2, 0.6, 1.2);
    f.translate(lx, 0.08, lz);
    parts.push(ink(f, STONE, 1.1, { lo: 0.6 }));
  }
  // the tablet: an arched slab, its face toward +z
  const W = 1.0, H = broken ? range(rng, 1.3, 1.8) : 2.4, D = 0.3, y0 = 0.42;
  const slab = boxAt(W, H, D, 0, y0, 0, 3);
  if (broken) jag(slab, y0 + H - 0.05, 0.45, rng() * 9);
  const face = (px, py, pz, nx, ny, nz) => {
    const t = mul(STONE, 1.25 * (0.65 + 0.7 * hash2(Math.round(nx * 9) + Math.round(ny * 9) * 31, Math.round(nz * 9) + 11)));
    // four columns of characters cut into the face
    if (nz > 0.7 && py > y0 + 0.35 && py < y0 + 2.0) {
      const c = (px + W / 2) / W;
      if (c > 0.14 && c < 0.86 && ((c * 8) % 2) < 1.15) return mul(STONE, 0.42 + 0.25 * hash2(Math.round(py * 7), Math.round(px * 7)));
    }
    return t;
  };
  parts.push(ink(slab, STONE, 1, { col: face, lo: 0.6, h: 2 }));
  const arch = prep(new THREE.CylinderGeometry(W / 2, W / 2, D, 8, 1, false, 0, Math.PI));
  arch.rotateX(Math.PI / 2);
  arch.rotateZ(Math.PI / 2);
  if (!broken) {
    arch.translate(0, y0 + H, 0);
    parts.push(ink(arch, STONE, 1.3, { lo: 0.8 }));
  } else {
    // the head that broke off, lying face up in front of the turtle
    const top = mergeGeometries([boxAt(W, 0.7, D, 0, 0, 0), (arch.translate(0, 0.7, 0), arch)]);
    top.rotateX(-Math.PI / 2 + 0.08);
    top.rotateY(range(rng, -0.7, 0.7));
    top.translate(range(rng, -0.6, 0.6), D / 2, range(rng, 1.9, 2.4));
    parts.push(ink(top, STONE, 1.3, { lo: 0.7 }));
    parts.push(...clods(rng, 3, 0, 1.6, 0.6, [0.08, 0.16], STONE));
  }
  for (const g of parts) g.scale(s, s * 1.15, s);
  const yaw = range(rng, -0.55, 0.55); // its face to the camera
  return { geos: place(parts, x, z, yaw), r: 1.2 * s, cr: 0.95 * s, mat: 'stone', h: (y0 + H + (broken ? 0 : W / 2)) * s * 1.15 };
}

/** A pillar of the shrine broken off at the height it stands to; one or two of its drums lying by it. */
export function buildPillarStub(rng, x, z, oy, s = 1) {
  const parts = [];
  const h = range(rng, 0.9, 2.6) * s, r = 0.36 * s;
  parts.push(ink(boxAt(r * 2.7, 0.3 * s, r * 2.7, 0, -0.05), STONE, 1.1, { lo: 0.55, h: 0.4 }));
  const shaft = drum(r, r * 0.94, h, 0.25 * s, 8, Math.PI / 8);
  jag(shaft, 0.25 * s + h * 0.85, Math.min(0.45, h * 0.25), rng() * 9);
  parts.push(ink(shaft, STONE, 1.3, { lo: 0.5, h: 2 }));
  const n = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const len = range(rng, 0.55, 0.9) * s;
    const d = drum(r, r, len, -len / 2, 8, Math.PI / 8);
    d.rotateZ(Math.PI / 2); // on its side
    d.rotateY(range(rng, -0.8, 0.8));
    d.translate(range(rng, -0.9, 0.9) * s, r * 0.92, range(rng, 1.0, 2.1) * s);
    parts.push(ink(d, STONE, 1.3, { lo: 0.55, h: 0.7 }));
  }
  parts.push(...clods(rng, 3, 0, 0.8 * s, 1, [0.08, 0.18], STONE));
  return { geos: place(parts, x, z, oy + range(rng, -0.6, 0.6)), r: 1.0 * s, cr: 0.5 * s, mat: 'stone', h: h + 0.25 * s };
}

/**
 * The roof of a wayside shrine, thrown down whole: hipped, its tiles in rows, one eave in the earth and
 * the other propped on what is left of its posts (two broken posts stick out from under it). Wood: it
 * burns.
 */
export function buildShrineRoof(rng, x, z, oy, s = 1) {
  const parts = [];
  const w = range(rng, 2.6, 3.4) * s, d = w * 0.78;
  const eave = boxAt(w + 0.3, 0.12, d + 0.3, 0, 0, 0);
  const body = prep(new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2 * 2.4, 0.85, 4, 1));
  body.rotateY(Math.PI / 4);
  body.scale(w * 0.3, 1, d * 0.3);
  body.translate(0, 0.12 + 0.425, 0);
  const ridge = boxAt(w * 0.45, 0.14, 0.16, 0, 0.95, 0);
  // the tiles: rows across the slope (alternating tones), the ridge and eave darker wood-trimmed
  const tiles = (px, py, pz, nx, ny, nz) => {
    const row = Math.floor((py + Math.abs(pz) * 0.2) * 9) % 2;
    return mul(TILE, (row ? 1.6 : 1.0) * (0.75 + 0.5 * hash2(Math.round(px * 3), Math.round(pz * 3))));
  };
  const roof = mergeGeometries([ink(eave, WOOD, 1.4, { lo: 0.8 }), ink(body, TILE, 1, { col: tiles, lo: 0.7, h: 1 }), ink(ridge, TILE, 1.8, { lo: 1 })]);
  // down at the front-left eave, up on its posts at the back
  roof.rotateX(-range(rng, 0.18, 0.32));
  roof.rotateZ(range(rng, -0.2, 0.2));
  roof.translate(0, range(rng, 0.45, 0.7) * s, 0);
  parts.push(roof);
  for (const sx of [-1, 1]) {
    if (rng() < 0.25) continue;
    const a = V(sx * w * 0.32, 0, -d * 0.25), b = V(sx * w * range(rng, 0.42, 0.6), range(rng, 0.9, 1.4) * s, -d * range(rng, 0.35, 0.6));
    parts.push(ink(limb(a, b, 0.11 * s, 0.09 * s, 4), OLD_WOOD, 1.5, { lo: 0.6 }));
  }
  const beam = limb(V(-w * 0.55, 0.1, d * 0.6), V(w * 0.35, 0.12, d * 0.85), 0.1 * s, 0.09 * s, 4);
  parts.push(ink(beam, OLD_WOOD, 1.4, { lo: 0.7 }));
  parts.push(...clods(rng, 4, 0, d * 0.5, w * 0.5, [0.1, 0.2], TILE, 1.4));
  // its tiles to the camera: the low eave toward +z within ~40 degrees
  return { geos: place(parts, x, z, range(rng, -0.7, 0.7)), r: w * 0.55, cr: w * 0.42, mat: 'wood', h: 1.4 * s };
}

/** Wine jars of the shrine's store: one standing, one on its side, one broken to its belly; sherds. */
export function buildJars(rng, x, z, oy, s = 1) {
  const parts = [];
  const prof = [[0.01, 0], [0.26, 0.02], [0.4, 0.2], [0.47, 0.5], [0.44, 0.78], [0.3, 0.95], [0.18, 1.02], [0.2, 1.1], [0.16, 1.12]].map(([r, y]) => new THREE.Vector2(r, y));
  const jar = (k) => {
    const g = prep(new THREE.LatheGeometry(prof, 8));
    g.scale(k, k * 1.1, k);
    return g;
  };
  const col = (px, py, pz, nx, ny, nz) => mul(py > 0.55 ? GLAZE : CLAY, 1.5 * (0.65 + 0.7 * hash2(Math.round(nx * 6) + 3, Math.round(nz * 6) + Math.round(py * 5) * 7)));
  const n = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const k = range(rng, 1.05, 1.4) * s, kind = i === 0 ? 0 : Math.floor(rng() * 3);
    const g = jar(k);
    const a = (i / n) * TAU + rng() * 0.8, d = i === 0 ? 0 : range(rng, 1.0, 1.4) * s;
    if (kind === 1) {
      g.translate(0, -0.55 * k, 0);
      g.rotateZ(Math.PI / 2);
      g.rotateY(rng() * TAU);
      g.translate(0, 0.42 * k, 0);
    } else if (kind === 2) jag(g, range(rng, 0.35, 0.6) * k, 0.25 * k, rng() * 9);
    g.translate(Math.cos(a) * d, -0.03, Math.sin(a) * d);
    parts.push(ink(g, CLAY, 1, { col, lo: 0.5, h: 1.0 }));
  }
  parts.push(...clods(rng, 5, 0, 0, 1.4 * s, [0.07, 0.14], CLAY, 1.5));
  return { geos: place(parts, x, z, 0), r: 1.6 * s, cr: 1.0 * s, mat: 'stone', h: 1.6 * s, lift: 1 };
}

// ================================================================ those who came for him
/**
 * A sword grave: the swords of challengers driven into a low mound of stones, at different angles; a
 * red tassel on one of them.
 */
export function buildSwordGrave(rng, x, z, oy, s = 1) {
  const parts = [];
  // the mound
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + rng(), d = range(rng, 0, 0.55) * s, r = range(rng, 0.22, 0.38) * s;
    const g = prep(new THREE.IcosahedronGeometry(r, 0));
    lumpy(g, r * 0.35, 2 / r, rng() * 40);
    g.scale(1, 0.6, 1);
    g.translate(Math.cos(a) * d, r * 0.3, Math.sin(a) * d);
    parts.push(ink(g, STONE, 1.2, { lo: 0.55, h: 0.5 }));
  }
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const L = range(rng, 1.3, 1.9) * s, bw = 0.09 * s;
    const blade = prep(new THREE.CylinderGeometry(1, 1, L + 0.3, 4, 1));
    const p = blade.attributes.position;
    for (let j = 0; j < p.count; j++) {
      p.setX(j, p.getX(j) * bw);
      p.setZ(j, p.getZ(j) * bw * 0.28);
    }
    blade.translate(0, (L + 0.3) / 2 - 0.3, 0);
    const steel = (px, py, pz, nx) => mul(STEEL, (nx > 0 ? 1.5 : 0.95) * (0.8 + 0.4 * hash2(Math.round(py * 6), i)));
    const pp = [ink(blade, STEEL, 1, { col: steel, lo: 0.7, h: 1.2 })];
    pp.push(ink(boxAt(0.34 * s, 0.06 * s, 0.09 * s, 0, L), IRON, 1.8, { lo: 1 }));
    pp.push(ink(drum(0.035 * s, 0.032 * s, 0.32 * s, L + 0.06 * s, 5), WOOD, 1.4, { lo: 1 }));
    pp.push(ink(drum(0.06 * s, 0.05 * s, 0.07 * s, L + 0.38 * s, 5), IRON, 1.8, { lo: 1 }));
    if (i === 0) {
      const tassel = prep(new THREE.ConeGeometry(0.07 * s, 0.4 * s, 5, 1));
      tassel.translate(0.06 * s, L + 0.2 * s, 0);
      pp.push(ink(tassel, CLOTH, 1.6, { lo: 1 }));
    }
    const g = mergeGeometries(pp);
    g.rotateY(rng() * TAU);
    tip(g, range(rng, 0.08, 0.5), rng() * TAU);
    const a = (i / n) * TAU + rng() * 0.7, d = i === 0 ? 0.05 : range(rng, 0.55, 1.0) * s;
    g.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
    parts.push(g);
  }
  return { geos: place(parts, x, z, 0), r: 1.2 * s, cr: 0.7 * s, mat: 'metal', h: 2.1 * s };
}

/**
 * Spears left where their bearers fell, leaning every way, and on one a torn banner of red cloth on a
 * crossbar. Wood: it burns.
 */
export function buildBanner(rng, x, z, oy, s = 1) {
  const parts = [];
  const n = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const L = range(rng, 2.4, 3.3) * s, flag = i === 0;
    const pp = [ink(drum(0.05 * s, 0.04 * s, L, -0.3), WOOD, 1.5, { lo: 0.7, h: 2 })];
    const head = prep(new THREE.ConeGeometry(0.07 * s, 0.38 * s, 4, 1));
    head.translate(0, L - 0.3 + 0.19 * s, 0);
    pp.push(ink(head, STEEL, 1.6, { lo: 1 }));
    if (flag) {
      // the crossbar and the cloth: a thin sheet, torn and hanging slack (a box: both sides print)
      const cw = 0.75 * s, ch = range(rng, 1.1, 1.5) * s, top = L - 0.55 * s;
      pp.push(ink(boxAt(cw + 0.25 * s, 0.05 * s, 0.05 * s, cw / 2, top), WOOD, 1.5, { lo: 1 }));
      const cloth = prep(new THREE.BoxGeometry(cw, ch, 0.03, 3, 5, 1));
      const p = cloth.attributes.position;
      for (let j = 0; j < p.count; j++) {
        const u = (p.getX(j) + cw / 2) / cw, v = (p.getY(j) + ch / 2) / ch; // v 1 at the bar
        p.setZ(j, p.getZ(j) + Math.sin(u * 5 + v * 2) * 0.06 * s + (1 - v) * 0.12 * s);
        if (v < 0.05) p.setY(j, p.getY(j) + hash2(Math.round(u * 6), 3) * ch * 0.4); // the torn foot
      }
      cloth.translate(cw / 2 + 0.04 * s, top - ch / 2, 0);
      // (it barely stirs in the crater's draw, world/hang.js: from the bar down)
      pp.push(hangFrom(ink(cloth, CLOTH, 1.3, { lo: 0.6, h: ch, y0: top - ch }), top, 'cloth'));
    }
    const g = mergeHang(pp, mergeGeometries(pp));
    if (flag) g.rotateY(range(rng, -0.4, 0.4)); // its cloth to the camera
    else g.rotateY(rng() * TAU);
    tip(g, flag ? range(rng, 0.05, 0.25) : range(rng, 0.25, 0.75), flag ? range(rng, -1, 1) : rng() * TAU);
    const a = rng() * TAU, d = i === 0 ? 0 : range(rng, 0.5, 1.2) * s;
    g.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
    parts.push(g);
  }
  parts.push(...clods(rng, 3, 0, 0, 0.8 * s, [0.08, 0.15], EARTH));
  return { geos: place(parts, x, z, 0), r: 1.1 * s, cr: 0.4 * s, mat: 'wood', h: 3.0 * s };
}

/**
 * A wanderer's grave: a long cairn of flat stones, a plank for a marker at its head, his straw hat
 * hung on the plank and his sword laid along the stones.
 */
export function buildCairn(rng, x, z, oy, s = 1) {
  const parts = [];
  const L = range(rng, 1.6, 2.1) * s;
  for (let i = 0; i < 9; i++) {
    const t = i / 8, r = range(rng, 0.28, 0.4) * s * (1 - 0.3 * Math.abs(t - 0.5));
    const g = prep(new THREE.IcosahedronGeometry(r, 0));
    lumpy(g, r * 0.3, 2 / r, rng() * 40);
    g.scale(1.2, 0.5, 1);
    g.rotateY(rng() * TAU);
    g.translate(range(rng, -0.25, 0.25) * s, r * 0.25 + (i % 3 === 1 ? 0.18 * s : 0), (t - 0.5) * L);
    parts.push(ink(g, STONE, 1.25, { lo: 0.55, h: 0.5 }));
  }
  // the marker at its head (-z: behind it from the camera, so it shows above the stones)
  const ph = range(rng, 1.0, 1.3) * s;
  const plank = boxAt(0.28 * s, ph, 0.07 * s, 0, -0.1, -L / 2 - 0.15 * s);
  const pp = plank.attributes.position;
  for (let i = 0; i < pp.count; i++) if (pp.getY(i) > ph * 0.9) pp.setY(i, pp.getY(i) + (Math.abs(pp.getX(i)) < 0.01 ? 0.1 : 0) * s);
  tip(plank, range(rng, 0.04, 0.16), range(rng, -1, 1));
  parts.push(ink(plank, OLD_WOOD, 1.6, { lo: 0.65, h: 1.2 }));
  // his hat, hung on it
  const hat = prep(new THREE.ConeGeometry(0.42 * s, 0.2 * s, 9, 1));
  hat.rotateX(range(rng, 0.3, 0.5));
  hat.translate(0, ph * 0.7, -L / 2 - 0.02 * s);
  parts.push(ink(hat, STRAW, 1.4, { lo: 0.7 }));
  // his sword along the stones
  const sw = boxAt(0.07 * s, 1.15 * s, 0.025 * s, 0, 0, 0);
  sw.rotateX(Math.PI / 2);
  sw.rotateY(range(rng, -0.2, 0.2));
  sw.translate(range(rng, 0.3, 0.42) * s, 0.36 * s, -0.4 * s);
  parts.push(ink(sw, STEEL, 1.5, { lo: 1 }));
  return { geos: place(parts, x, z, range(rng, -0.6, 0.6)), r: L * 0.6, cr: 0.6 * s, mat: 'stone', h: ph };
}

/**
 * A war cart thrown on its side: its bed of planks tipped onto one rail, the wheel left on it turned
 * up, the other wheel lying flat, a broken shaft; a sack spilled. Wood: it burns.
 */
export function buildCart(rng, x, z, oy, s = 1) {
  const parts = [];
  const W = 1.4 * s, Lc = 2.2 * s;
  const bed = [];
  for (let i = 0; i < 5; i++) bed.push(boxAt(W / 5 - 0.03, 0.08 * s, Lc, -W / 2 + (i + 0.5) * (W / 5), 0, 0));
  for (const sx of [-1, 1]) bed.push(boxAt(0.07 * s, 0.35 * s, Lc, sx * W / 2, 0.08 * s, 0));
  bed.push(boxAt(W, 0.35 * s, 0.07 * s, 0, 0.08 * s, -Lc / 2));
  const g = mergeGeometries(bed.map((b) => ink(b, WOOD, 1.5, { lo: 0.6, h: 0.5 })));
  // the wheel on the up side: a disc, its rim and hub
  const wheel = () => {
    const rim = prep(new THREE.CylinderGeometry(0.62 * s, 0.62 * s, 0.1 * s, 10, 1));
    const hub = prep(new THREE.CylinderGeometry(0.14 * s, 0.14 * s, 0.24 * s, 6, 1));
    const dark = (px, py, pz, nx, ny, nz) => {
      const r = Math.hypot(px, pz);
      return mul(OLD_WOOD, (r > 0.48 * s || r < 0.16 * s ? 1.7 : 0.6) * (0.75 + 0.5 * hash2(Math.round(Math.atan2(pz, px) * 2.5), 7)));
    };
    return mergeGeometries([ink(rim, OLD_WOOD, 1, { col: dark, lo: 1 }), ink(hub, OLD_WOOD, 1.8, { lo: 1 })]);
  };
  const w1 = wheel();
  w1.rotateZ(Math.PI / 2);
  w1.translate(W / 2 + 0.12 * s, 0.1 * s, 0.1 * s);
  const cart = mergeGeometries([g, w1]);
  // over onto its left rail
  cart.translate(W / 2, 0, 0);
  cart.rotateZ(range(rng, 1.05, 1.35));
  cart.translate(-0.1 * s, 0, 0);
  parts.push(cart);
  const w2 = wheel();
  w2.translate(range(rng, 1.2, 1.6) * s, 0.04, range(rng, -0.6, 0.6) * s);
  w2.rotateZ(range(rng, -0.08, 0.08));
  parts.push(w2);
  // the shafts: one whole, one snapped
  parts.push(ink(limb(V(-0.3 * s, 0.4 * s, Lc / 2), V(-0.1 * s, 0.1 * s, Lc / 2 + 1.6 * s), 0.05 * s, 0.045 * s, 4), WOOD, 1.5, { lo: 0.8 }));
  parts.push(ink(limb(V(-0.1 * s, 1.1 * s, Lc / 2), V(0.2 * s, 0.9 * s, Lc / 2 + 0.7 * s), 0.05 * s, 0.045 * s, 4), WOOD, 1.5, { lo: 0.8 }));
  const sack = prep(new THREE.IcosahedronGeometry(0.32 * s, 1));
  lumpy(sack, 0.08, 3, rng() * 9);
  sack.scale(1.3, 0.6, 1);
  sack.translate(range(rng, 0.8, 1.2) * s, 0.15 * s, Lc * 0.45);
  parts.push(ink(sack, STRAW, 1.2, { lo: 0.6 }));
  parts.push(...clods(rng, 3, 0.6 * s, 0, 1.2 * s, [0.07, 0.14], OLD_WOOD, 1.6));
  return { geos: place(parts, x, z, range(rng, -0.8, 0.8)), r: 1.6 * s, cr: 1.15 * s, mat: 'wood', h: 1.6 * s };
}

// ================================================================ the options
/** The builders by name: [builder, args(rng) -> extra args]. */
const B = {
  ejecta: [buildEjecta],
  heave: [buildHeave],
  splinters: [buildSplinters],
  boulder: [buildSplitBoulder],
  lantern: [buildLantern, (rng) => [rng() < 0.4 ? 0 : rng() < 0.5 ? 1 : 2]],
  stele: [buildStele, (rng) => [rng() < 0.45]],
  pillar: [buildPillarStub],
  roof: [buildShrineRoof],
  jars: [buildJars],
  swords: [buildSwordGrave],
  banner: [buildBanner],
  cairn: [buildCairn],
  cart: [buildCart],
};

/**
 * What lies round the crater, by option (`?outskirts=`; world/throneHall.js): kind -> weight.
 *   a  the shrine the star fell on: lanterns, steles on turtles, broken pillars, a thrown roof, jars
 *   b  the star's debris: its rock in furrows, heaved ground, splinters of its glass, split boulders
 *   c  those who came for him: sword graves, spears and a banner, cairns, a wrecked cart, steles
 *   m  all of them
 */
export const OUTSKIRTS = Object.freeze({
  a: { lantern: 5, stele: 3, pillar: 3, roof: 2, jars: 3, boulder: 2 },
  b: { ejecta: 5, heave: 3, splinters: 4, boulder: 3 },
  c: { swords: 4, banner: 3, cairn: 4, cart: 2, stele: 1, boulder: 2 },
  m: { lantern: 3, stele: 2, pillar: 2, roof: 1, jars: 2, boulder: 2, ejecta: 3, heave: 2, splinters: 2, swords: 2, banner: 2, cairn: 2, cart: 1 },
});

/** A shuffled bag of kinds by weight (so each kind turns up in its share, not by luck). */
export function kindBag(rng, weights, n) {
  const kinds = Object.keys(weights), tot = kinds.reduce((a, k) => a + weights[k], 0);
  const bag = [];
  for (const k of kinds) for (let i = 0; i < Math.round((weights[k] / tot) * n); i++) bag.push(k);
  while (bag.length < n) bag.push(kinds[Math.floor(rng() * kinds.length)]);
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

/** Build one piece of `kind` at (x, z), `oy` the way out from the crater. */
export function buildOutskirt(kind, rng, x, z, oy, s = 1) {
  const [fn, more] = B[kind];
  const out = fn(rng, x, z, oy, s, ...(more ? more(rng) : []));
  out.kind = kind;
  return out;
}
