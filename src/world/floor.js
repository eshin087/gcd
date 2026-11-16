import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { range } from '../core/rng.js';
import { carve, slabGeometry, mul } from './forest.js';
import { BREAK } from './breakTuning.js';
import { lookOf } from '../entities/enemies/duelist/lookSwitch.js';

// A floor that breaks (2026-11-16, the duelists' arenas; BREAK.floor). A set lays its paving as it
// always did, one merged mesh of carved slabs, and hands the slabs to `breakableFloor`, which makes each
// one a breakable 'range' piece (destructibles.js: its body is its run of vertices in that mesh, folded
// away when it goes) and builds what a slab shows once it has been hit:
//   cracked  the slab split into two to four pieces round a point, pulled a little apart: seams with a
//            moonlit edge each side (the carved material's edge band), still flat and level
//   broken   the owner's pick of two looks (`?floor=a|b`, read when the level is built):
//            a  shattered: a patch of bare dark earth with a few chunks of the slab lying tilted on it
//            b  split into four or five shards that stay where they were, tilted and pushed apart
// Each is one more merged mesh of the set's own carved material, hidden until the first slab shows in
// it (`userData.foldAway`): an intact floor costs exactly the draw calls it did, a damaged one two
// more (no shadow: a slab's remains cast nothing worth a pass). Draws on the rng it is given (a stream
// of its own: the set's layout does not move).

/** The look options of the broken floor (lookSwitch.js): `a` is the default. */
export const FLOOR_LOOKS = Object.freeze(['a', 'b']);

/** Each edge of a polygon split once, somewhere near its middle (cracks may run to an edge, not only a corner). */
function subdivide(rng, pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], t = range(rng, 0.35, 0.65);
    out.push(a, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/**
 * The polygon (world [x, z] points round (cx, cz)) cut into `cuts` wedges from a point near its middle,
 * each pulled toward its own middle by `pull`, pushed out from the cut point by `push`, tilted by up to
 * `tilt` rad and sunk by up to `sink` m; carved with `col`. Returns the geometries (world space).
 */
function wedges(rng, cx, cz, pts, cuts, { pull, push, tilt, sink = 0, top, inset, drop, col, k = 1 }) {
  const P = subdivide(rng, pts), m = P.length;
  let rad = 0;
  for (const [x, z] of pts) rad = Math.max(rad, Math.hypot(x - cx, z - cz));
  const ox = cx + range(rng, -0.15, 0.15) * rad, oz = cz + range(rng, -0.15, 0.15) * rad;
  const a0 = Math.floor(rng() * m);
  const out = [];
  for (let c = 0; c < cuts; c++) {
    const i0 = a0 + Math.round((c * m) / cuts), i1 = a0 + Math.round(((c + 1) * m) / cuts);
    const poly = [[ox, oz]];
    for (let i = i0; i <= i1; i++) poly.push(P[i % m]);
    let mx = 0, mz = 0;
    for (const [x, z] of poly) {
      mx += x / poly.length;
      mz += z / poly.length;
    }
    const dx = mx - ox, dz = mz - oz, dl = Math.hypot(dx, dz) || 1;
    const local = poly.map(([x, z]) => [(x - mx) * pull, (z - mz) * pull]);
    const g = slabGeometry(local, { top: top * range(rng, 0.85, 1.1), inset, drop, bottom: -0.12 });
    if (tilt > 0) {
      const ax = new THREE.Vector3(rng() - 0.5, 0, rng() - 0.5 + 1e-3).normalize();
      g.applyMatrix4(new THREE.Matrix4().makeRotationAxis(ax, range(rng, 0.3, 1) * tilt));
    }
    const pu = push > 0 ? push * range(rng, 0.5, 1) : 0;
    g.translate(mx + (dx / dl) * pu, -sink * rng(), mz + (dz / dl) * pu);
    carve(g, {
      col: (px, py, pz) => mul(col(px, py, pz), k),
      ao: 0.8,
      moss: 0.05,
      edge: (px, py, pz, nx, ny) => (ny > 0.5 && ny < 0.95 ? 1 : 0),
    });
    out.push(g);
  }
  return out;
}

/** A flat fan over the polygon (shrunk by `k` round (cx, cz)) at height y, its face up, carved with `col`. */
function patch(pts, cx, cz, k, y, col) {
  const pos = [];
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    area += a[0] * b[1] - b[0] * a[1];
  }
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const A = [cx + (a[0] - cx) * k, y, cz + (a[1] - cz) * k], B = [cx + (b[0] - cx) * k, y, cz + (b[1] - cz) * k];
    // (wound so its normal points up: x-z counter-clockwise seen from +y is clockwise in this sum)
    if (area > 0) pos.push(cx, y, cz, ...B, ...A);
    else pos.push(cx, y, cz, ...A, ...B);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  carve(g, { col, ao: 0.7, moss: 0, edge: 0 });
  return g;
}

/** Look a: bare dark earth where the slab was, a few chunks of it lying tilted on it. */
function rubbleLook(rng, s) {
  const out = [patch(s.outline, s.x, s.z, 0.96, 0.012, (px, py, pz) => mul(s.col(px, py, pz), 0.2))];
  const P = subdivide(rng, s.outline), n = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const v = P[Math.floor(rng() * P.length)], t = range(rng, 0.15, 0.8);
    const x = s.x + (v[0] - s.x) * t, z = s.z + (v[1] - s.z) * t;
    const k = 3 + Math.floor(rng() * 3), rr = range(rng, 0.1, 0.24), pts = [];
    const a0 = rng() * 6.283;
    for (let j = 0; j < k; j++) {
      const a = a0 + ((j + (rng() - 0.5) * 0.5) / k) * 6.283, q = rr * range(rng, 0.7, 1.2);
      pts.push([Math.cos(a) * q, Math.sin(a) * q]);
    }
    const g = slabGeometry(pts, { top: range(rng, 0.03, 0.06), inset: 0.03, drop: 0.02, bottom: -0.06 });
    const ax = new THREE.Vector3(rng() - 0.5, 0, rng() - 0.5 + 1e-3).normalize();
    g.applyMatrix4(new THREE.Matrix4().makeRotationAxis(ax, range(rng, 0.15, 0.45)));
    g.translate(x, 0.01, z);
    carve(g, {
      col: (px, py, pz) => mul(s.col(px, py, pz), 0.85),
      ao: 0.85,
      edge: (px, py, pz, nx, ny) => (ny > 0.5 && ny < 0.95 ? 1 : 0),
    });
    out.push(g);
  }
  return out;
}

/**
 * The set's slabs as breakables. `slabs`: [{ geo (one of `slabGeos`), outline (world [x, z]), x, z, r,
 * col(px, py, pz) (its carved colour), kind? }]; `slabGeos` / `slabMesh`: the set's merged paving (its
 * geometries in the order they were merged); `mat`: its carved material; `rng`: a stream of its own;
 * `group`: where the two meshes of remains go. Returns the breakables' definitions.
 */
export function breakableFloor({ slabs, slabGeos, slabMesh, mat, rng, group, look = lookOf('floor', 'a') }) {
  const F = BREAK.floor;
  const start = new Map();
  let v = 0;
  for (const g of slabGeos) {
    start.set(g, v);
    v += g.attributes.position.count;
  }
  const opt = FLOOR_LOOKS.includes(look) ? look : 'a';
  const cracked = [], broken = [], cnt = [];
  for (const s of slabs) {
    const c = wedges(rng, s.x, s.z, s.outline, 2 + Math.floor(rng() * 3), { pull: 0.95, push: 0.012, tilt: 0.02, top: 0.04, inset: 0.05, drop: 0.035, col: s.col });
    const b = opt === 'b'
      ? wedges(rng, s.x, s.z, s.outline, 4 + Math.floor(rng() * 2), { pull: 0.82, push: 0.13, tilt: 0.24, sink: 0.02, top: 0.035, inset: 0.05, drop: 0.03, col: s.col, k: 0.78 })
      : rubbleLook(rng, s);
    const cg = mergeGeometries(c), bg = mergeGeometries(b);
    cracked.push(cg);
    broken.push(bg);
    cnt.push([cg.attributes.position.count, bg.attributes.position.count]);
  }
  const mesh = (geos, name) => {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.name = name;
    m.userData.foldAway = true; // (destructibles.js RangeBody: hidden until one of its runs shows)
    group.add(m);
    return m;
  };
  const crackMesh = mesh(cracked, 'pavingCracked'), brokenMesh = mesh(broken, 'pavingBroken');
  const defs = [];
  let ci = 0, bi = 0;
  slabs.forEach((s, i) => {
    const [nc, nb] = cnt[i];
    let area = 0;
    for (let k = 0; k < s.outline.length; k++) {
      const a = s.outline[k], b = s.outline[(k + 1) % s.outline.length];
      area += (a[0] * b[1] - b[0] * a[1]) / 2;
    }
    const big = Math.abs(area) > F.big;
    defs.push({
      kind: s.kind ?? (big ? 'plate' : 'flagstone'), mat: 'stone', look: 'range', floor: true,
      x: s.x, z: s.z, r: s.r, h: 0.08, hp: big ? F.plate : F.hp, geos: [],
      range: { mesh: slabMesh, start: start.get(s.geo), count: s.geo.attributes.position.count },
      cracked: { range: { mesh: crackMesh, start: ci, count: nc } },
      broken: { range: { mesh: brokenMesh, start: bi, count: nb } },
      colliders: [], topples: false, cover: false, wreck: false, lift: F.lift,
    });
    ci += nc;
    bi += nb;
  });
  return { defs, crackMesh, brokenMesh, look: opt };
}
