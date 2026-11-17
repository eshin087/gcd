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
//   cracked  the slab split into two to four pieces round a point, pulled apart over a dark seam of
//            earth, each piece a little tilted and a tone lighter or darker than the next, a moonlit
//            chamfer along every seam (the carved material's edge band): it reads at the game camera
//   broken   the owner's pick of two looks (`?floor=a|b`, read when the level is built):
//            a  shattered: bare earth that PRINTS (dim warm letters as dense as the paving, a tone
//               darker), a ragged edge that eats into the gaps round it, chunks of stone lying on it
//            b  heaved: the slab's shards pushed up into a low mound round a point, tilted out, their
//               faces catching the moon, dark earth in the cracks between them
// (Second round, 2026-11-16: the lead's review of the first sheet: a broken slab printed as a blank
// black hole, a cracked one and option b could not be told from a whole one at 30 m.)
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
function wedges(rng, cx, cz, pts, cuts, { pull, push, tilt, sink = 0, heave = 0, lift = 0, top, inset, drop, col, k = 1, tone = 0 }) {
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
    if (heave > 0) {
      // heaved: its inner edge (toward the cut point) pushed up, the shard leaning out
      const ax = new THREE.Vector3(dz / dl, 0, -dx / dl);
      g.applyMatrix4(new THREE.Matrix4().makeRotationAxis(ax, heave * range(rng, 0.7, 1.15)));
    }
    const pu = push > 0 ? push * range(rng, 0.5, 1) : 0;
    g.translate(mx + (dx / dl) * pu, lift - sink * rng(), mz + (dz / dl) * pu);
    // (pieces a tone apart: the eye tells them from each other)
    const kk = k * (tone > 0 ? 1 + tone * (c % 2 ? 1 : -1) * range(rng, 0.6, 1) : 1);
    carve(g, {
      col: (px, py, pz) => mul(col(px, py, pz), kk),
      ao: 0.8,
      moss: 0.05,
      edge: (px, py, pz, nx, ny) => (ny > 0.5 && ny < 0.95 ? 1 : 0),
    });
    out.push(g);
  }
  return out;
}

/** Earth: dull warm grey-brown, a tone darker than the stone round it (`k`), mottled. */
const EARTH = [0.15, 0.12, 0.09];
const earthCol = (k, base = EARTH) => (px, py, pz) => {
  const n = 0.62 + 0.55 * Math.abs(Math.sin(px * 5.3 + Math.cos(pz * 4.1) * 2.1) * Math.cos(pz * 6.7 - px * 1.3));
  return mul(base, k * n);
};

/**
 * A patch of earth over the polygon round (cx, cz): two rings (half way and the rim, its radius
 * ragged by `rag`: 1 ± rag of the slab's, eating into the gaps round it), heights jittered by up to
 * `bump` m (facets the light picks out: the letters vary), its faces up, carved with `col`.
 */
function patch(rng, pts, cx, cz, { y, rag = 0, bump = 0, col, ao = 0.8 }) {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const ring = (t, r) => pts.map(([x, z]) => {
    const k = t * (1 + (rng() - 0.5) * 2 * r);
    return [cx + (x - cx) * k, y + rng() * bump, cz + (z - cz) * k];
  });
  const mid = ring(0.5, rag * 0.5), rim = ring(1, rag), C = [cx, y + bump * 0.5, cz];
  const pos = [];
  // (wound so its normal points up)
  const tri = (A, B, D) => (area > 0 ? pos.push(...A, ...D, ...B) : pos.push(...A, ...B, ...D));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    tri(C, mid[i], mid[j]);
    tri(mid[i], rim[i], rim[j]);
    tri(mid[i], rim[j], mid[j]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  carve(g, { col, ao, moss: 0, edge: 0 });
  return g;
}

/** Chunks of the slab's stone lying tilted on the ground in its footprint (`n` of them, `size` m). */
function chunks(rng, s, n, size, k) {
  const out = [];
  const P = subdivide(rng, s.outline);
  for (let i = 0; i < n; i++) {
    const v = P[Math.floor(rng() * P.length)], t = range(rng, 0.1, 0.75);
    const x = s.x + (v[0] - s.x) * t, z = s.z + (v[1] - s.z) * t;
    const sides = 3 + Math.floor(rng() * 3), rr = range(rng, size[0], size[1]), pts = [];
    const a0 = rng() * 6.283;
    for (let j = 0; j < sides; j++) {
      const a = a0 + ((j + (rng() - 0.5) * 0.5) / sides) * 6.283, q = rr * range(rng, 0.7, 1.2);
      pts.push([Math.cos(a) * q, Math.sin(a) * q]);
    }
    const g = slabGeometry(pts, { top: range(rng, 0.05, 0.09), inset: 0.04, drop: 0.03, bottom: -0.06 });
    const ax = new THREE.Vector3(rng() - 0.5, 0, rng() - 0.5 + 1e-3).normalize();
    g.applyMatrix4(new THREE.Matrix4().makeRotationAxis(ax, range(rng, 0.2, 0.5)));
    g.translate(x, 0.02, z);
    carve(g, {
      col: (px, py, pz) => mul(s.col(px, py, pz), k),
      ao: 0.9,
      edge: (px, py, pz, nx, ny) => (ny > 0.5 && ny < 0.95 ? 1 : 0),
    });
    out.push(g);
  }
  return out;
}

/** Look a: bare earth that prints (dim warm letters), its edge ragged into the gaps, stone chunks lying on it. */
function rubbleLook(rng, s) {
  // (ao over 1: the carved ramp picks its letters by the light, so the earth prints as densely as
  // the paving round it; its colour keeps it a tone darker and warmer)
  const out = [patch(rng, subdivide(rng, subdivide(rng, s.outline)), s.x, s.z, { y: 0.014, rag: 0.12, bump: 0.035, col: earthCol(0.95, s.earth), ao: 1.3 })];
  out.push(...chunks(rng, s, 3 + Math.floor(rng() * 3), [0.12, 0.28], 1.15));
  return out;
}

/** Look b: the slab heaved up into a low mound of shards round a point, leaning out, earth in the cracks. */
function heavedLook(rng, s) {
  const out = [patch(rng, subdivide(rng, s.outline), s.x, s.z, { y: 0.01, rag: 0.08, bump: 0.02, col: earthCol(0.9, s.earth), ao: 1.2 })];
  out.push(...wedges(rng, s.x, s.z, s.outline, 4 + Math.floor(rng() * 2), { pull: 0.76, push: 0.1, heave: 0.48, lift: 0.12, tilt: 0.05, top: 0.04, inset: 0.06, drop: 0.035, col: s.col, k: 1.15, tone: 0.2 }));
  return out;
}

/** Cracked: the pieces over a dark seam of earth, a tone apart, a little tilted. */
function crackedLook(rng, s) {
  const out = [patch(rng, s.outline, s.x, s.z, { y: 0.006, col: earthCol(0.3, s.earth), ao: 0.5 })];
  out.push(...wedges(rng, s.x, s.z, s.outline, 2 + Math.floor(rng() * 3), { pull: 0.87, push: 0.035, tilt: 0.045, top: 0.042, inset: 0.07, drop: 0.035, col: s.col, tone: 0.14 }));
  return out;
}

/**
 * The set's slabs as breakables. `slabs`: [{ geo (one of `slabGeos`), outline (world [x, z]), x, z, r,
 * col(px, py, pz) (its carved colour), kind? }]; `slabGeos` / `slabMesh`: the set's merged paving (its
 * geometries in the order they were merged); `mat`: its carved material; `rng`: a stream of its own;
 * `group`: where the two meshes of remains go; `earth`: the colour of the ground under it (default a
 * warm grey-brown). Returns the breakables' definitions.
 */
export function breakableFloor({ slabs, slabGeos, slabMesh, mat, rng, group, earth = EARTH, look = lookOf('floor', 'a') }) {
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
    s.earth ??= earth;
    const c = crackedLook(rng, s);
    const b = opt === 'b' ? heavedLook(rng, s) : rubbleLook(rng, s);
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
      colliders: [], topples: false, cover: false, lift: F.lift, // (no rubble pile where it breaks: it is under 0.4 m; thrown, it lands as shards)
    });
    ci += nc;
    bi += nb;
  });
  return { defs, crackMesh, brokenMesh, look: opt };
}
