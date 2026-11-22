import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ellipsoidGeometry } from '../../render/glyphGeometry.js';

// The Cinder Wyrm's heads (?wyrmFace=; the owner picks from filmed sheets). `drake` is the head it
// wears (the owner's pick, 2026-11-20, ADR-124; its data and the three turned down with it, tyrant,
// viper and revenant, are in faces.js). `old` is the head model.js built before (a tapered tube with
// horns, teeth and eyes stuck on). skull / loong / demon were shown and passed on (ADR-120).
// Every head but `old` is SCULPTED: each skull is a loft through cross-sections along the head (per ring:
// the skull table, the side, the cheek, the tooth line, the palate), then displaced by soft features
// (eye sockets, brow ridges, the temple hollow, cheekbones, nostrils, snarl folds, jaw muscle), and
// drawn with FLAT facets so the spread of facet tones prints as form (docs/STYLE.md, "The house
// style"). Horns, antlers, tusks, blades and whiskers are swept tubes along bent paths. Everything is
// in headVis units (model.js: the head's drawn frame, +Z down the snout, +Y up, +X model-left).
//
// Gameplay joints do not move: `jaw` hinges at (0, -0.15, 0.05) as before, `mouth` stays on `head`
// (model.js). Only the drawn eyes and the nostrils (snort smoke) sit where each head draws them.

// (drake / tyrant / viper / revenant: the four faces of 2026-11-20, their data in faces.js)
export const WYRM_FACES = ['drake', 'old', 'skull', 'loong', 'demon', 'tyrant', 'viper', 'revenant'];
/** The head the wyrm wears with nothing set (the owner's pick, ADR-124). */
export const WYRM_FACE_SHIPPED = 'drake';
let FACE = WYRM_FACE_SHIPPED;
try {
  const q = new URLSearchParams(globalThis.location?.search ?? '');
  const v = String(q.get('wyrmFace') ?? q.get('wyrmface') ?? '').toLowerCase();
  if (WYRM_FACES.includes(v)) FACE = v;
} catch {
  /* headless */
}
/**
 * Each head's main horn tip (its right one: x is mirrored for the left), in headVis's own frame: where
 * the phase-3 fire stands on the horns (ablaze.js, look c). The sculpted heads' are the ends of their
 * main horns' bent paths below (skull: the crown's sabre; loong: the antler's beam; demon: the crown's
 * bull horn); the old head's, of model.js buildOldHead's main horn (1.7 long from (0.2, 0.3, -0.02),
 * pitch -0.24, yaw PI - 0.3, curve 0.34: the curve lifts the tip 0.58). 2026-11-16: ablaze guessed them
 * off the old head. 2026-11-20: the old head's horns grow with the wyrm's build (looks.js), so model.js
 * measures its tip off the built horn (`hornTip`) and ablaze reads that first; this entry is build '0'.
 * The faces of faces.js return their main horn's tip from their extras (`hornTip`), read the same way.
 */
export const HORN_TIPS = Object.freeze({
  old: Object.freeze([0.647, 1.266, -1.466]),
  skull: Object.freeze([0.912, 0.502, -1.711]),
  loong: Object.freeze([0.814, 1.227, -1.116]),
  demon: Object.freeze([0.572, 1.257, -0.744]),
});

/** The head in use (one of WYRM_FACES; 'drake' with nothing set); read once from ?wyrmFace=. */
export const wyrmFace = () => FACE;
/** Pick the head the NEXT built wyrm wears (tests, the Lab). Returns false for an unknown name. */
export function setWyrmFace(k) {
  if (!WYRM_FACES.includes(k)) return false;
  FACE = k;
  return true;
}

/**
 * Each sculpted head's own art entries, merged over model.js WYRM_ART for its parts (the head's hide,
 * horns, teeth, maw, eyes): smaller scales than today's head, so the sculpted forms (sockets, ridges,
 * the cheek) print through the key light instead of drowning under big scale outlines.
 */
export const FACE_ART = {
  skull: { head: { scale: [0.15, 0.11], tone: [0.0, 0.17, 1.9, 0.16], light: [1.0, 0.8, 0.25, 0.03] } },
  loong: { head: { scale: [0.13, 0.095], tone: [0.04, 0.45, 1.15, 0.14], ink: [0.15, 0.135, 0.12], light: [1.0, 1.2, 0.3, 0.0], vary: 0.3 } },
  demon: { head: { scale: [0.16, 0.12], tone: [0.04, 0.42, 1.1, 0.14], ink: [0.15, 0.13, 0.12], light: [1.0, 1.2, 0.3, 0.0], vary: 0.35 } },
};

/** The jaw joint (headVis frame): the hinge every head shares (the bite / roar / breath open it). */
export const JAW_PIVOT = [0, -0.15, 0.05];

// ---------------------------------------------------------------- math helpers (build time only)
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;

/** Cubic Hermite through keyed rows ({ z, ...numbers }) at z (Catmull-Rom tangents, clamped ends). */
export function interpRow(keys, z) {
  const n = keys.length;
  if (z <= keys[0].z) return { ...keys[0], z };
  if (z >= keys[n - 1].z) return { ...keys[n - 1], z };
  let i = 0;
  while (i < n - 2 && z > keys[i + 1].z) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(n - 1, i + 2)];
  const h = k2.z - k1.z, t = (z - k1.z) / h, t2 = t * t, t3 = t2 * t;
  const out = { z };
  for (const key in k1) {
    if (key === 'z') continue;
    const p1 = k1[key], p2 = k2[key];
    const m1 = ((p2 - k0[key]) / Math.max(1e-6, k2.z - k0.z)) * h;
    const m2 = ((k3[key] - p1) / Math.max(1e-6, k3.z - k1.z)) * h;
    out[key] = (2 * t3 - 3 * t2 + 1) * p1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2 + (t3 - t2) * m2;
  }
  return out;
}

/** Soft feature weight: (1 - d²)² inside the ellipsoid (c, r), 0 outside. x mirrored (|x|). */
function featW(f, x, y, z) {
  const dx = (Math.abs(x) - f.c[0]) / f.r[0], dy = (y - f.c[1]) / f.r[1], dz = (z - f.c[2]) / f.r[2];
  const d = dx * dx + dy * dy + dz * dz;
  return d < 1 ? (1 - d) * (1 - d) : 0;
}

// ---------------------------------------------------------------- the sculpted loft
/**
 * A closed, mirrored loft along +Z through cross-sections, displaced by soft features, as flat-faceted
 * geometry per material.
 *   keys     keyed rings: { z, ...params } (interpolated between keys, Hermite)
 *   profile  (row) => [[x, y], ...]: the HALF cross-section from the top midline (x 0) round the
 *            model-left side (x >= 0) to the bottom midline (x 0)
 *   sub      sub-edges per profile edge (array, one per key edge; default 1)
 *   bands    material per profile edge: [[firstEdge, key], ...] sorted (an edge takes the last band
 *            that starts at or before it)
 *   step     ring spacing (z); feats: [{ c: [x, y, z], r: [rx, ry, rz], a, dir? }] (x mirrored; a > 0
 *            out along the surface normal, or along `dir`)
 *   capKey   material of the end caps (default the first band's)
 * Returns { [materialKey]: BufferGeometry } (position, normal, aGUV; non-indexed: flat facets).
 */
export function sculptLoft({ keys, profile, sub = null, bands = [[0, 'head']], step = 0.04, feats = [], capKey = null }) {
  const z0 = keys[0].z, z1 = keys[keys.length - 1].z;
  const nR = Math.max(2, Math.round((z1 - z0) / step) + 1);
  // rings of half-profile samples (key points subdivided)
  const rings = [];
  let edgeOf = null; // sample edge index -> key edge index
  for (let r = 0; r < nR; r++) {
    const z = lerp(z0, z1, r / (nR - 1));
    const row = interpRow(keys, z);
    const kp = profile(row);
    const pts = [], eo = [];
    for (let e = 0; e < kp.length - 1; e++) {
      const s = Math.max(1, (sub && sub[e]) || 1);
      for (let k = 0; k < s; k++) {
        const t = k / s;
        pts.push([lerp(kp[e][0], kp[e + 1][0], t), lerp(kp[e][1], kp[e + 1][1], t)]);
        eo.push(e);
      }
    }
    pts.push(kp[kp.length - 1]);
    pts[0][0] = 0;
    pts[pts.length - 1][0] = 0;
    edgeOf = eo;
    rings.push({ z, pts });
  }
  const P = rings[0].pts.length; // half-profile samples, both midlines included
  const N = 2 * (P - 1); // around
  const pi = (a) => (a < P ? a : N - a); // around index -> profile index
  const sx = (a) => (a < P ? 1 : -1);
  // indexed grid + cap centres (normals for the features), arc length per profile sample
  const nV = nR * N + 2;
  const pos = new Float32Array(nV * 3);
  const arc = [];
  for (let r = 0; r < nR; r++) {
    const { z, pts } = rings[r];
    const ar = [0];
    for (let i = 1; i < P; i++) ar.push(ar[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    arc.push(ar);
    for (let a = 0; a < N; a++) {
      const p = pts[pi(a)];
      pos.set([sx(a) * p[0], p[1], z], (r * N + a) * 3);
    }
  }
  const cBack = nR * N, cFront = nR * N + 1;
  const centre = (r) => {
    let y = 0;
    for (const p of rings[r].pts) y += p[1];
    return [0, y / P, rings[r].z];
  };
  pos.set(centre(0), cBack * 3);
  pos.set(centre(nR - 1), cFront * 3);
  const tris = []; // [i0, i1, i2, materialKey, side]
  const band = (e) => {
    let k = bands[0][1];
    for (const [first, key] of bands) if (e >= first) k = key;
    return k;
  };
  const vi = (r, a) => r * N + (((a % N) + N) % N);
  for (let r = 0; r < nR - 1; r++) {
    for (let a = 0; a < N; a++) {
      const e = Math.min(pi(a), pi(a + 1));
      const key = band(edgeOf[Math.min(e, edgeOf.length - 1)]);
      const side = a < P - 1 ? 1 : -1;
      tris.push([vi(r, a), vi(r + 1, a), vi(r, a + 1), key, side]);
      tris.push([vi(r + 1, a), vi(r + 1, a + 1), vi(r, a + 1), key, side]);
    }
  }
  const ck = capKey ?? bands[0][1];
  for (let a = 0; a < N; a++) {
    const side = a < P - 1 ? 1 : -1;
    tris.push([cBack, vi(0, a), vi(0, a + 1), ck, side]);
    tris.push([cFront, vi(nR - 1, a + 1), vi(nR - 1, a), ck, side]);
  }
  // smooth normals of the base shape, then the features
  if (feats.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos.slice(), 3));
    g.setIndex(tris.flatMap((t) => [t[0], t[1], t[2]]));
    g.computeVertexNormals();
    const nrm = g.attributes.normal.array;
    for (let i = 0; i < nV; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      let dx = 0, dy = 0, dz = 0;
      for (const f of feats) {
        const w = featW(f, x, y, z);
        if (!w) continue;
        if (f.dir) {
          dx += f.a * w * f.dir[0] * (x < 0 ? -1 : 1);
          dy += f.a * w * f.dir[1];
          dz += f.a * w * f.dir[2];
        } else {
          dx += f.a * w * nrm[i * 3];
          dy += f.a * w * nrm[i * 3 + 1];
          dz += f.a * w * nrm[i * 3 + 2];
        }
      }
      pos[i * 3] += dx;
      pos[i * 3 + 1] += dy;
      pos[i * 3 + 2] += dz;
    }
    g.dispose();
  }
  // flat-faceted output per material
  const guvX = (v, side) => {
    if (v >= nR * N) return 0;
    const r = Math.floor(v / N), a = v % N;
    return side * arc[r][pi(a)];
  };
  const out = {};
  const by = {};
  for (const t of tris) (by[t[3]] ??= []).push(t);
  for (const key in by) {
    const list = by[key];
    const P3 = new Float32Array(list.length * 9), G2 = new Float32Array(list.length * 6);
    list.forEach((t, j) => {
      for (let k = 0; k < 3; k++) {
        const v = t[k];
        P3.set([pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]], j * 9 + k * 3);
        G2.set([guvX(v, t[4]), pos[v * 3 + 2]], j * 6 + k * 2);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P3, 3));
    geo.setAttribute('aGUV', new THREE.BufferAttribute(G2, 2));
    geo.computeVertexNormals();
    out[key] = geo;
  }
  return out;
}

// ---------------------------------------------------------------- swept tubes (horns, blades, whiskers)
/**
 * A bent path: from p0 heading d0, `len` long in n steps; the heading turns `bend` rad about `axis`
 * over the length (uniformly, or `bendPow` > 1: more toward the tip) while the path drifts by `drift`
 * (a ram's spiral). Returns Vector3[] (n + 1 points).
 */
export function bentPath(p0, d0, len, { bend = 0, axis = [1, 0, 0], drift = [0, 0, 0], n = 8, bendPow = 1 } = {}) {
  const pts = [V(...p0)];
  const d = V(...d0).normalize();
  const ax = V(...axis).normalize();
  const dr = V(...drift);
  const q = new THREE.Quaternion();
  const h = len / n;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const ang = bend * Math.pow(t, bendPow);
    const di = d.clone().applyQuaternion(q.setFromAxisAngle(ax, ang));
    pts.push(pts[i].clone().addScaledVector(di, h).addScaledVector(dr, 1 / n));
  }
  return pts;
}

/**
 * A tube swept along `path` (Vector3[]), radius r(t) (t 0 root .. 1 tip; the tip closes on an apex),
 * `radial` sides, flattened to `flat` across the frame's normal (a blade), the first frame normal
 * nearest `up`. Flat facets; aGUV y = distance from the root (the bone material's bright tips),
 * x = angle x radius. Ridges: rings `ridge` [count, depth] (a ram horn's annulations).
 */
export function sweepTube(path, r, { radial = 6, flat = 1, up = [0, 1, 0], ridge = null, cap = true } = {}) {
  const n = path.length;
  const T = [], Nn = [], B = [];
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
    T.push(b.clone().sub(a).normalize());
  }
  const u = V(...up);
  let nv = u.clone().addScaledVector(T[0], -u.dot(T[0]));
  if (nv.lengthSq() < 1e-6) nv = V(1, 0, 0).addScaledVector(T[0], -T[0].x);
  nv.normalize();
  const q = new THREE.Quaternion();
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      q.setFromUnitVectors(T[i - 1], T[i]);
      nv = nv.clone().applyQuaternion(q);
      nv.addScaledVector(T[i], -nv.dot(T[i])).normalize();
    }
    Nn.push(nv.clone());
    B.push(T[i].clone().cross(nv).normalize());
  }
  const s = [0];
  for (let i = 1; i < n; i++) s.push(s[i - 1] + path[i].distanceTo(path[i - 1]));
  const S = s[n - 1] || 1;
  const ringP = [];
  for (let i = 0; i < n - 1; i++) {
    const t = s[i] / S;
    let rr = typeof r === 'function' ? r(t) : r * (1 - t);
    if (ridge) rr *= 1 + ridge[1] * Math.max(0, Math.sin(t * ridge[0] * Math.PI * 2));
    const ring = [];
    for (let k = 0; k < radial; k++) {
      const th = (k / radial) * Math.PI * 2;
      ring.push(path[i].clone().addScaledVector(Nn[i], Math.cos(th) * rr * flat).addScaledVector(B[i], Math.sin(th) * rr));
    }
    ringP.push({ ring, rr, s: s[i] });
  }
  const apex = path[n - 1];
  const P3 = [], G2 = [];
  const push = (p, gx, gy) => {
    P3.push(p.x, p.y, p.z);
    G2.push(gx, gy);
  };
  const g = (k, rr) => (k / radial) * Math.PI * 2 * Math.max(0.02, rr);
  for (let i = 0; i < ringP.length; i++) {
    const A = ringP[i], Bn = ringP[i + 1];
    for (let k = 0; k < radial; k++) {
      const k1 = (k + 1) % radial;
      if (Bn) {
        push(A.ring[k], g(k, A.rr), A.s); push(A.ring[k1], g(k + 1, A.rr), A.s); push(Bn.ring[k], g(k, Bn.rr), Bn.s);
        push(A.ring[k1], g(k + 1, A.rr), A.s); push(Bn.ring[k1], g(k + 1, Bn.rr), Bn.s); push(Bn.ring[k], g(k, Bn.rr), Bn.s);
      } else {
        push(A.ring[k], g(k, A.rr), A.s); push(A.ring[k1], g(k + 1, A.rr), A.s); push(apex, g(k + 0.5, 0), S);
      }
    }
  }
  if (cap) {
    const A = ringP[0];
    for (let k = 0; k < radial; k++) {
      const k1 = (k + 1) % radial;
      push(path[0], 0, 0); push(A.ring[k1], g(k + 1, A.rr), 0); push(A.ring[k], g(k, A.rr), 0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P3, 3));
  geo.setAttribute('aGUV', new THREE.Float32BufferAttribute(G2, 2));
  geo.computeVertexNormals();
  // the winding above faces in or out depending on the frame's handedness: make it face out
  return outward(geo, path);
}

/** Flip a tube's triangles that face toward its axis (the sweep's winding depends on its frame). */
function outward(geo, path) {
  const p = geo.attributes.position, nrm = geo.attributes.normal;
  let dot = 0;
  const c = V(), x = V(), m = V();
  for (let i = 0; i < Math.min(p.count, 6 * 9); i++) {
    x.fromBufferAttribute(p, i);
    m.copy(path[0]).lerp(path[1], 0.5);
    c.fromBufferAttribute(nrm, i);
    dot += c.dot(x.sub(m));
  }
  if (dot >= 0) return geo;
  const a = p.array, gv = geo.attributes.aGUV.array;
  for (let t = 0; t < p.count; t += 3) {
    for (let k = 0; k < 3; k++) {
      const i1 = (t + 1) * 3 + k, i2 = (t + 2) * 3 + k;
      [a[i1], a[i2]] = [a[i2], a[i1]];
    }
    for (let k = 0; k < 2; k++) {
      const i1 = (t + 1) * 2 + k, i2 = (t + 2) * 2 + k;
      [gv[i1], gv[i2]] = [gv[i2], gv[i1]];
    }
  }
  geo.computeVertexNormals();
  return geo;
}

/** Mirror a geometry across x (model-left <-> right), keeping its faces outward. */
function mirrorX(geo) {
  const g = geo.clone();
  g.scale(-1, 1, 1);
  const a = g.attributes.position.array, gv = g.attributes.aGUV.array;
  for (let t = 0; t < g.attributes.position.count; t += 3) {
    for (let k = 0; k < 3; k++) {
      const i1 = (t + 1) * 3 + k, i2 = (t + 2) * 3 + k;
      [a[i1], a[i2]] = [a[i2], a[i1]];
    }
    for (let k = 0; k < 2; k++) {
      const i1 = (t + 1) * 2 + k, i2 = (t + 2) * 2 + k;
      [gv[i1], gv[i2]] = [gv[i2], gv[i1]];
    }
  }
  for (let i = 0; i < gv.length; i += 2) gv[i] = -gv[i];
  g.computeVertexNormals();
  return g;
}

/** A tooth / fang / tusk: a slightly hooked cone from `root` along `dir` (flat facets). */
export function fang(root, dir, len, r, { hook = 0.25, hookAxis = [1, 0, 0], radial = 5, flat = 1, up = [0, 0, 1] } = {}) {
  return sweepTube(bentPath(root, dir, len, { bend: hook, axis: hookAxis, n: 4, bendPow: 1.6 }), (t) => r * Math.pow(1 - t, 0.85), { radial, flat, up });
}

// ---------------------------------------------------------------- assembling
/** Merge geometries (position, normal, aGUV only) into one non-indexed geometry. */
function merge(geos) {
  const list = geos.filter(Boolean).map((g) => {
    let h = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(h.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'aGUV') h.deleteAttribute(k);
    if (!h.attributes.normal) h.computeVertexNormals();
    return h;
  });
  if (!list.length) return null;
  return list.length === 1 ? list[0] : mergeGeometries(list, false);
}

/** One mesh per material under `parent` (the rigid batch makes each a bone). */
function attach(parent, mats, parts) {
  const meshes = [];
  for (const key in parts) {
    const geo = merge(parts[key]);
    if (!geo || !mats[key]) continue;
    const m = new THREE.Mesh(geo, mats[key]);
    m.name = `face-${key}`;
    parent.add(m);
    meshes.push(m);
  }
  return meshes;
}

export const add = (parts, key, ...geos) => (parts[key] ??= []).push(...geos);
/** Both sides: the geometry and its mirror image. */
export const both = (g) => [g, mirrorX(g)];

function joint(parent, x, y, z, name) {
  const j = new THREE.Object3D();
  j.name = name;
  j.position.set(x, y, z);
  parent.add(j);
  return j;
}

/** An eye: a glowing almond set into its socket, turned out and forward. */
function eyeMesh(parent, mat, s, e) {
  // (e.leaf: an almond with a point at each corner, flat, lying in the orbit: from its inner corner,
  // forward and low, to its outer corner, back and high: { len, h, slant, peak (0..1: where it is
  // tallest), thick }. The mesh's rotation turns its face out, up and forward)
  let geo;
  if (e.leaf) {
    const L = e.leaf, pk = L.peak ?? 0.55, n = 10, pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push(V(0, lerp(-L.slant / 2, L.slant / 2, t), lerp(L.len / 2, -L.len / 2, t)));
    }
    const prof = (t) => L.h * Math.pow(Math.max(0, t < pk ? t / pk : (1 - t) / (1 - pk)), 0.7) + 0.004;
    geo = sweepTube(pts, prof, { radial: 6, flat: L.thick ?? 0.3, up: [1, 0, 0] });
  } else geo = ellipsoidGeometry(e.r[0], e.r[1], e.r[2], { widthSegs: 10, heightSegs: 8 });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(s * e.c[0], e.c[1], e.c[2]);
  m.rotation.set(e.rot[0], s * e.rot[1], s * e.rot[2], 'YXZ');
  m.name = s > 0 ? 'eyeL' : 'eyeR';
  parent.add(m);
  return m;
}

// ---------------------------------------------------------------- shared profiles
/**
 * Upper skull half-section: skull table, brow / orbit wall, the widest side, the cheek, the lip wall
 * down to the tooth line, the gum, the vaulted palate. Edges: 0-5 hide, 6 gum, 7-9 palate.
 *   top, wt (half width of the skull table), w (widest), ys (height of w), cheek (extra width below
 *   it), gum (tooth line y), wg (half width at the tooth line), pal (palate vault above the gum)
 */
function upperProfile(p) {
  const { top, wt, w, ys, cheek, gum, wg, pal } = p;
  const wc = w + cheek;
  // a flat skull table with a hard edge, steep walls below it: creases print as a change of tone
  return [
    [0, top],
    [wt * 0.5, top + 0.004],
    [wt, top - 0.012],
    [lerp(wt, w, 0.55), lerp(top, ys, 0.6)],
    [w, ys],
    [wc, lerp(ys, gum, 0.42)],
    [lerp(wc, wg, 0.65), lerp(ys, gum, 0.82)],
    [wg, gum],
    [wg * 0.86, gum + Math.min(0.03, pal * 0.35)],
    [wg * 0.62, gum + pal * 0.7],
    [wg * 0.3, gum + pal * 0.96],
    [0, gum + pal],
  ];
}
const UPPER_BANDS = [[0, 'head'], [7, 'maw']];
const UPPER_SUB = [1, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1];

/**
 * Lower jaw half-section (jaw frame): the floor of the mouth, the inner gum, the tooth row, the outer
 * wall (the jaw muscle where it bulges), the underside, the chin keel. Edges 0-2 maw, 3- hide.
 *   fl (floor y at the midline), tl (tooth row y), wl (half width at the tooth row), w (widest),
 *   ys (its height), b (keel y)
 */
function lowerProfile(p) {
  const { fl, tl, wl, w, ys, b } = p;
  return [
    [0, fl],
    [wl * 0.45, fl + 0.006],
    [wl * 0.8, lerp(fl, tl, 0.7)],
    [wl, tl],
    [lerp(wl, w, 0.6), lerp(tl, ys, 0.6)],
    [w, ys],
    [w * 0.86, lerp(ys, b, 0.6)],
    [w * 0.46, b + 0.012],
    [0, b],
  ];
}
const LOWER_BANDS = [[0, 'maw'], [3, 'head']];
const LOWER_SUB = [1, 1, 1, 2, 2, 2, 2, 1];

/** Point on a ring profile at z (pre-feature): the tooth line of the upper / lower jaw. */
function toothLine(keys, z, upper) {
  const r = interpRow(keys, z);
  return upper ? [r.wg, r.gum] : [r.wl, r.tl];
}

/** Tooth radius x this (the rows list the stout radii; thinner needles read as separate teeth). */
const TOOTH_R = 0.72;
/** Teeth along a tooth line: [[z, len, radius, hook?, splay?], ...] per side (both sides). */
function teethRow(keys, rows, upper, { inset = 0.88, lift = 0.012, rake = 0.12 } = {}) {
  const out = [];
  for (const [z, len, r, hook = 0.3, splay = 0] of rows) {
    const [x, y] = toothLine(keys, z, upper);
    const root = [x * inset, upper ? y + lift : y - lift, z];
    // down (up for the lower jaw), raked back toward the throat, splayed out a little at the front
    const dir = [splay, upper ? -1 : 1, -rake];
    const hookSign = upper ? 1 : -1;
    out.push(...both(fang(root, dir, len, r * TOOTH_R, { hook: hook * hookSign, hookAxis: [1, 0, 0], radial: 4, flat: 0.7 })));
  }
  return out;
}

// ================================================================ 1. skull: the predator
// Crocodile / theropod anatomy: a long skull with a hooked snout tip, a dip (the stop) before a heavy
// brow, deep sockets with the eye INSIDE them, a zygomatic arch with the temple hollow behind it,
// raised nostrils, a lipless tooth line with the gum showing, festooned (a notch for the lower
// canine), teeth of real variety, a jaw with a deep hinge and a muscle bulge, snarl folds on the
// snout. The horn crown grows out of the back corners of the skull.
const SKULL = {
  // a deep skull at the back (the bulk of the jaw muscles under a high crest), a long snout, the hook
  upper: [
    { z: -0.27, top: 0.14, wt: 0.1, w: 0.22, ys: 0.0, cheek: 0.0, gum: -0.15, wg: 0.18, pal: 0.05 },
    { z: -0.14, top: 0.33, wt: 0.17, w: 0.36, ys: 0.08, cheek: 0.03, gum: -0.23, wg: 0.3, pal: 0.08 },
    { z: 0.04, top: 0.41, wt: 0.2, w: 0.43, ys: 0.08, cheek: 0.07, gum: -0.25, wg: 0.36, pal: 0.1 },
    { z: 0.2, top: 0.43, wt: 0.22, w: 0.45, ys: 0.06, cheek: 0.1, gum: -0.22, wg: 0.37, pal: 0.11 },
    { z: 0.36, top: 0.44, wt: 0.23, w: 0.43, ys: 0.1, cheek: 0.07, gum: -0.19, wg: 0.35, pal: 0.11 },
    { z: 0.5, top: 0.42, wt: 0.22, w: 0.39, ys: 0.13, cheek: 0.04, gum: -0.17, wg: 0.32, pal: 0.1 },
    { z: 0.63, top: 0.34, wt: 0.17, w: 0.33, ys: 0.1, cheek: 0.02, gum: -0.16, wg: 0.29, pal: 0.1 },
    { z: 0.76, top: 0.27, wt: 0.13, w: 0.28, ys: 0.07, cheek: 0.01, gum: -0.135, wg: 0.27, pal: 0.09 },
    { z: 0.9, top: 0.255, wt: 0.12, w: 0.255, ys: 0.05, cheek: 0.005, gum: -0.12, wg: 0.255, pal: 0.085 },
    { z: 1.02, top: 0.255, wt: 0.115, w: 0.24, ys: 0.04, cheek: 0.0, gum: -0.135, wg: 0.245, pal: 0.08 },
    { z: 1.13, top: 0.25, wt: 0.1, w: 0.19, ys: 0.03, cheek: 0.0, gum: -0.1, wg: 0.18, pal: 0.07 },
    { z: 1.23, top: 0.21, wt: 0.09, w: 0.2, ys: 0.0, cheek: 0.0, gum: -0.14, wg: 0.19, pal: 0.06 },
    { z: 1.31, top: 0.12, wt: 0.06, w: 0.15, ys: -0.05, cheek: 0.0, gum: -0.18, wg: 0.13, pal: 0.04 },
    { z: 1.37, top: -0.03, wt: 0.03, w: 0.08, ys: -0.12, cheek: 0.0, gum: -0.22, wg: 0.055, pal: 0.02 },
    { z: 1.41, top: -0.16, wt: 0.01, w: 0.025, ys: -0.2, cheek: 0.0, gum: -0.25, wg: 0.015, pal: 0.01 },
  ],
  upperFeats: [
    // deep eye socket (the eye sits INSIDE it, the brow shelf over it is its own blade)
    { c: [0.4, 0.24, 0.5], r: [0.13, 0.1, 0.14], a: -0.15 },
    // the temple hollow behind the cheekbone, the arch itself
    { c: [0.43, 0.2, 0.15], r: [0.1, 0.11, 0.12], a: -0.09 },
    { c: [0.53, 0.02, 0.22], r: [0.06, 0.05, 0.26], a: 0.04 },
    // the nasal ridge down the middle of the snout with a furrow either side, the fossa in front of
    // the orbit, the lacrimal bosses over it, the maxilla bulging over the big tooth roots (festoons)
    { c: [0, 0.27, 0.95], r: [0.06, 0.05, 0.34], a: 0.04 },
    { c: [0.11, 0.25, 0.9], r: [0.045, 0.05, 0.26], a: -0.032 },
    { c: [0.3, 0.1, 0.75], r: [0.07, 0.07, 0.11], a: -0.06 },
    { c: [0.2, 0.35, 0.7], r: [0.06, 0.04, 0.07], a: 0.035 },
    { c: [0.26, -0.07, 1.05], r: [0.05, 0.08, 0.07], a: 0.04 },
    { c: [0.29, -0.09, 0.82], r: [0.05, 0.07, 0.06], a: 0.03 },
    { c: [0.33, -0.12, 0.62], r: [0.05, 0.07, 0.06], a: 0.025 },
    // raised nostrils with their pits, snarl folds across the bridge
    { c: [0.1, 0.26, 1.16], r: [0.07, 0.05, 0.08], a: 0.055 },
    { c: [0.12, 0.29, 1.19], r: [0.035, 0.025, 0.035], a: -0.05 },
    { c: [0.16, 0.23, 0.86], r: [0.13, 0.06, 0.022], a: 0.025 },
    { c: [0.16, 0.23, 0.94], r: [0.13, 0.06, 0.022], a: 0.025 },
    { c: [0.16, 0.23, 1.02], r: [0.12, 0.06, 0.02], a: 0.02 },
    // the snarl: the lip wall pulled up over the canine
    { c: [0.23, -0.05, 1.04], r: [0.08, 0.07, 0.09], a: 0.025 },
    // horn bosses: the crown grows out of the back corners; a sagittal crest between them
    { c: [0.2, 0.38, -0.02], r: [0.13, 0.09, 0.15], a: 0.05 },
    { c: [0, 0.42, 0.1], r: [0.05, 0.06, 0.32], a: 0.035 },
  ],
  lower: [
    { z: -0.34, fl: 0.08, tl: 0.13, wl: 0.15, w: 0.2, ys: 0.03, b: -0.1 },
    { z: -0.16, fl: 0.03, tl: 0.08, wl: 0.3, w: 0.37, ys: -0.04, b: -0.22 },
    { z: 0.06, fl: -0.01, tl: 0.07, wl: 0.33, w: 0.42, ys: -0.08, b: -0.27 },
    { z: 0.26, fl: -0.03, tl: 0.06, wl: 0.31, w: 0.37, ys: -0.07, b: -0.24 },
    { z: 0.46, fl: -0.045, tl: 0.05, wl: 0.28, w: 0.31, ys: -0.06, b: -0.2 },
    { z: 0.66, fl: -0.05, tl: 0.04, wl: 0.25, w: 0.27, ys: -0.045, b: -0.17 },
    { z: 0.84, fl: -0.05, tl: 0.035, wl: 0.22, w: 0.24, ys: -0.035, b: -0.15 },
    { z: 1.0, fl: -0.045, tl: 0.04, wl: 0.195, w: 0.21, ys: -0.025, b: -0.14 },
    { z: 1.12, fl: -0.04, tl: 0.045, wl: 0.175, w: 0.19, ys: -0.02, b: -0.14 },
    { z: 1.22, fl: -0.035, tl: 0.02, wl: 0.1, w: 0.12, ys: -0.04, b: -0.12 },
    { z: 1.28, fl: -0.04, tl: -0.02, wl: 0.03, w: 0.04, ys: -0.06, b: -0.09 },
  ],
  lowerFeats: [
    // the jaw muscle (masseter / pterygoid) bulging out under the cheek, the hinge knob, a groove
    // along the jaw under the teeth
    { c: [0.43, -0.07, 0.08], r: [0.08, 0.12, 0.22], a: 0.06 },
    { c: [0.31, 0.06, -0.17], r: [0.08, 0.07, 0.08], a: 0.035 },
    { c: [0.25, -0.03, 0.7], r: [0.04, 0.03, 0.4], a: -0.02 },
  ],
  teethUp: [
    // [z, len, r, hook, splay]: premaxillary fangs, the notch, the canine, fewer and bigger behind it
    [1.31, 0.18, 0.042, 0.3, 0.25],
    [1.25, 0.24, 0.05, 0.4, 0.15],
    [1.05, 0.36, 0.064, 0.45, 0.1],
    [0.94, 0.17, 0.04],
    [0.83, 0.23, 0.048, 0.4],
    [0.72, 0.15, 0.038],
    [0.62, 0.18, 0.042, 0.35],
    [0.52, 0.11, 0.032],
    [0.43, 0.09, 0.028],
  ],
  teethLow: [
    [1.2, 0.16, 0.04, 0.3, 0.2],
    [1.1, 0.3, 0.055, 0.4, 0.18], // the lower canine: up through the notch, outside the snout
    [0.98, 0.13, 0.034],
    [0.88, 0.19, 0.042, 0.35],
    [0.77, 0.12, 0.032],
    [0.67, 0.15, 0.036],
    [0.57, 0.1, 0.03],
    [0.47, 0.08, 0.026],
  ],
  brow: [[0.12, 0.31, 0.8], [0.25, 0.39, 0.64], [0.36, 0.45, 0.5], [0.46, 0.44, 0.35], [0.5, 0.36, 0.2]],
  cheek: [[0.36, 0.08, 0.68], [0.49, 0.06, 0.5], [0.55, 0.04, 0.3], [0.52, -0.01, 0.06]],
  eye: { c: [0.36, 0.245, 0.51], r: [0.036, 0.04, 0.11], rot: [0.32, 0.5, 0.35] },
  nostril: [0.12, 0.3, 1.21],
};

/** Brow and cheek ridges, horns, frill, crest and jaw spikes of the predator (its data: SKULL). */
SKULL.extras = (S, up, jp) => {
  // the brow: a heavy bony shelf from over the snout to the back of the orbit, low and in at the
  // front, high and out behind (a frown over each eye, the V that reads from above), and the
  // cheekbone (zygomatic arch) under the socket back to the hinge
  const brow = sweepTube(S.brow.map((q) => V(...q)), (t) => 0.09 * (0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.1))), { radial: 5, flat: 0.6 });
  const cheek = sweepTube(S.cheek.map((q) => V(...q)), (t) => 0.065 * (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.15))), { radial: 5, flat: 0.55 });
  add(up, 'head', ...both(brow), ...both(cheek));
  // the crown: main horns from the back corners of the skull, sweeping back along the neck and up at
  // the tips (rooted in the bosses), a lower pair under them, the jugal horns off the cheekbones, a
  // nape frill of blades between them, short supraorbital horns over the brow
  const L = [];
  L.push(sweepTube(bentPath([0.21, 0.38, 0.02], [0.42, 0.34, -1], 1.9, { bend: -0.62, axis: [1, 0, 0], n: 9, bendPow: 1.4 }), (t) => 0.17 * Math.pow(1 - t, 0.9), { radial: 7, ridge: [5, 0.06] }));
  L.push(sweepTube(bentPath([0.33, 0.2, -0.02], [0.6, 0.1, -1], 1.1, { bend: -0.35, axis: [1, 0, 0], n: 6 }), (t) => 0.11 * Math.pow(1 - t, 0.9), { radial: 6 }));
  L.push(sweepTube(bentPath([0.53, 0.02, 0.2], [0.75, -0.15, -1], 0.75, { bend: 0.2, axis: [0, 1, 0], n: 5 }), (t) => 0.08 * (1 - t), { radial: 5, flat: 0.6 }));
  for (let k = 0; k < 5; k++) {
    const y = 0.26 - 0.085 * k, x = 0.28 + 0.045 * k;
    L.push(sweepTube(bentPath([x, y, -0.1], [0.45 + 0.18 * k, 0.32 - 0.16 * k, -1], 0.72 - 0.08 * k, { bend: -0.2, axis: [1, 0, 0], n: 4 }), (t) => 0.07 * (1 - t), { radial: 5, flat: 0.5 }));
  }
  L.push(sweepTube(bentPath([0.36, 0.45, 0.5], [0.35, 0.55, -1], 0.36, { bend: -0.3, axis: [1, 0, 0], n: 4 }), (t) => 0.05 * (1 - t), { radial: 5, flat: 0.6 }));
  L.push(sweepTube(bentPath([0.44, 0.45, 0.36], [0.4, 0.45, -1], 0.3, { bend: -0.2, axis: [1, 0, 0], n: 3 }), (t) => 0.045 * (1 - t), { radial: 5, flat: 0.6 }));
  for (const g of L) add(up, 'bone', ...both(g));
  // midline crest: three low back-swept blades on the sagittal crest
  [[0.12, 0.45, 0.22], [-0.06, 0.4, 0.3], [-0.22, 0.28, 0.34]].forEach(([z, y, len]) =>
    add(up, 'bone', sweepTube(bentPath([0, y, z], [0, 0.7, -1], len, { bend: -0.3, axis: [1, 0, 0], n: 3 }), (t) => 0.06 * (1 - t), { radial: 5, flat: 0.45, up: [1, 0, 0] })));
  // a few short spikes along the jaw line's back half
  [[0.15, 0.22], [0.35, 0.18], [-0.05, 0.25]].forEach(([z, len]) => {
    const r = interpRow(S.lower, z);
    add(jp, 'bone', ...both(sweepTube(bentPath([r.w * 0.85, r.ys - 0.1, z], [0.5, -0.6, -1], len, { bend: 0.2, axis: [1, 0, 0], n: 3 }), (t) => 0.05 * (1 - t), { radial: 5, flat: 0.6 })));
  });
};

// ================================================================ 2. loong: the Eastern dragon
// A long narrow muzzle ending in a broad flat nose with flared nostrils, a wide grin (the gape runs
// back under the eyes), big fierce eyes under heavy brows that sweep up and back like flames,
// antlers branching off the back of the skull, a mane of blade scales off the cheeks and the nape, a
// beard under the jaw, and two long whiskers off the nose that trail and sway (rig/anim.js chains).
const LOONG = {
  upper: [
    { z: -0.24, top: 0.18, wt: 0.12, w: 0.24, ys: 0.02, cheek: 0.0, gum: -0.14, wg: 0.2, pal: 0.05 },
    { z: -0.1, top: 0.31, wt: 0.2, w: 0.36, ys: 0.08, cheek: 0.02, gum: -0.18, wg: 0.3, pal: 0.07 },
    { z: 0.08, top: 0.36, wt: 0.24, w: 0.4, ys: 0.1, cheek: 0.05, gum: -0.19, wg: 0.34, pal: 0.09 },
    { z: 0.26, top: 0.37, wt: 0.25, w: 0.41, ys: 0.12, cheek: 0.07, gum: -0.17, wg: 0.35, pal: 0.1 },
    { z: 0.44, top: 0.35, wt: 0.22, w: 0.37, ys: 0.12, cheek: 0.04, gum: -0.15, wg: 0.31, pal: 0.1 },
    { z: 0.6, top: 0.29, wt: 0.16, w: 0.29, ys: 0.1, cheek: 0.02, gum: -0.14, wg: 0.27, pal: 0.09 },
    { z: 0.78, top: 0.255, wt: 0.12, w: 0.225, ys: 0.07, cheek: 0.0, gum: -0.13, wg: 0.225, pal: 0.085 },
    { z: 0.96, top: 0.235, wt: 0.11, w: 0.2, ys: 0.06, cheek: 0.0, gum: -0.125, wg: 0.205, pal: 0.08 },
    { z: 1.12, top: 0.23, wt: 0.14, w: 0.215, ys: 0.06, cheek: 0.0, gum: -0.13, wg: 0.21, pal: 0.075 },
    { z: 1.24, top: 0.265, wt: 0.15, w: 0.27, ys: 0.08, cheek: 0.0, gum: -0.14, wg: 0.255, pal: 0.07 },
    { z: 1.33, top: 0.245, wt: 0.15, w: 0.27, ys: 0.06, cheek: 0.0, gum: -0.15, wg: 0.245, pal: 0.06 },
    { z: 1.39, top: 0.15, wt: 0.1, w: 0.2, ys: 0.0, cheek: 0.0, gum: -0.16, wg: 0.18, pal: 0.04 },
    { z: 1.42, top: 0.02, wt: 0.06, w: 0.1, ys: -0.06, cheek: 0.0, gum: -0.15, wg: 0.08, pal: 0.02 },
  ],
  upperFeats: [
    // the eye socket under the brow (the loong's eye is big and bulges out of it)
    { c: [0.37, 0.22, 0.46], r: [0.12, 0.1, 0.14], a: -0.09 },
    // the temple hollow, a ridge down the forehead
    { c: [0.4, 0.2, 0.12], r: [0.1, 0.1, 0.12], a: -0.06 },
    { c: [0, 0.33, 0.55], r: [0.05, 0.05, 0.25], a: 0.03 },
    // the broad nose: flared nostril wings with deep pits, wrinkles across the bridge behind it
    { c: [0.2, 0.21, 1.28], r: [0.09, 0.07, 0.09], a: 0.07 },
    { c: [0.22, 0.23, 1.31], r: [0.045, 0.035, 0.045], a: -0.07 },
    { c: [0.1, 0.25, 1.1], r: [0.14, 0.04, 0.02], a: 0.025 },
    { c: [0.1, 0.25, 1.04], r: [0.14, 0.04, 0.02], a: 0.025 },
    { c: [0.1, 0.25, 0.98], r: [0.12, 0.04, 0.02], a: 0.02 },
    // the curled upper lip over the canines, the cheek bulging at the corner of the gape
    { c: [0.24, -0.06, 1.2], r: [0.06, 0.08, 0.08], a: 0.035 },
    { c: [0.44, -0.04, 0.3], r: [0.08, 0.1, 0.16], a: 0.04 },
  ],
  lower: [
    { z: -0.3, fl: 0.07, tl: 0.11, wl: 0.15, w: 0.2, ys: 0.02, b: -0.09 },
    { z: -0.12, fl: 0.03, tl: 0.08, wl: 0.29, w: 0.35, ys: -0.03, b: -0.18 },
    { z: 0.1, fl: 0.0, tl: 0.07, wl: 0.31, w: 0.37, ys: -0.05, b: -0.2 },
    { z: 0.35, fl: -0.03, tl: 0.06, wl: 0.28, w: 0.31, ys: -0.05, b: -0.17 },
    { z: 0.6, fl: -0.04, tl: 0.045, wl: 0.225, w: 0.24, ys: -0.04, b: -0.14 },
    { z: 0.85, fl: -0.045, tl: 0.04, wl: 0.19, w: 0.2, ys: -0.03, b: -0.13 },
    { z: 1.05, fl: -0.04, tl: 0.04, wl: 0.195, w: 0.21, ys: -0.03, b: -0.14 },
    { z: 1.2, fl: -0.035, tl: 0.035, wl: 0.2, w: 0.22, ys: -0.04, b: -0.15 },
    { z: 1.3, fl: -0.04, tl: 0.0, wl: 0.12, w: 0.14, ys: -0.06, b: -0.13 },
    { z: 1.34, fl: -0.05, tl: -0.04, wl: 0.04, w: 0.05, ys: -0.08, b: -0.1 },
  ],
  lowerFeats: [
    { c: [0.36, -0.06, 0.08], r: [0.08, 0.1, 0.2], a: 0.045 },
    { c: [0.18, -0.12, 1.15], r: [0.08, 0.05, 0.1], a: 0.03 },
  ],
  teethUp: [
    [1.37, 0.13, 0.035, 0.25, 0.3],
    [1.28, 0.32, 0.062, 0.45, 0.28], // the fangs at the corners of the nose
    [1.17, 0.13, 0.035],
    [1.07, 0.17, 0.04, 0.35],
    [0.97, 0.12, 0.034],
    [0.87, 0.15, 0.038],
    [0.77, 0.11, 0.032],
    [0.67, 0.13, 0.034],
    [0.57, 0.09, 0.03],
    [0.47, 0.08, 0.028],
    [0.38, 0.065, 0.024],
  ],
  teethLow: [
    [1.28, 0.12, 0.034, 0.25, 0.25],
    [1.18, 0.27, 0.055, 0.4, 0.3], // lower fangs rising outside the upper lip
    [1.07, 0.12, 0.034],
    [0.97, 0.15, 0.038],
    [0.87, 0.11, 0.032],
    [0.77, 0.13, 0.034],
    [0.67, 0.09, 0.03],
    [0.57, 0.1, 0.03],
    [0.47, 0.075, 0.026],
  ],
  eye: { c: [0.355, 0.225, 0.47], r: [0.045, 0.05, 0.105], rot: [0.28, 0.55, 0.32] },
  nostril: [0.23, 0.22, 1.33],
};
LOONG.extras = (S, up, jp, j) => {
  // heavy brows sweeping up and back from over the nose bridge, ending in flame-like points behind
  // the eye (a frown at the front)
  const brow = sweepTube([V(0.1, 0.3, 0.72), V(0.22, 0.36, 0.58), V(0.34, 0.42, 0.44), V(0.43, 0.5, 0.28), V(0.48, 0.6, 0.08)], (t) => 0.085 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.85)), 0.7), { radial: 5, flat: 0.55 });
  add(up, 'head', ...both(brow));
  // antlers: a beam off the back of the skull sweeping back and up, a brow tine forward-up, two
  // tines up off its back, a fork at the tip
  const beamPath = bentPath([0.2, 0.34, 0.06], [0.28, 0.75, -0.6], 1.55, { bend: -0.5, axis: [1, 0, 0], drift: [0.18, 0, 0], n: 9 });
  const ant = [sweepTube(beamPath, (t) => 0.1 * Math.pow(1 - t, 0.7) + 0.012, { radial: 6, ridge: [7, 0.05] })];
  const tine = (t, dir, len, r) => {
    const i = Math.round(t * (beamPath.length - 1));
    const q = beamPath[i];
    ant.push(sweepTube(bentPath([q.x, q.y, q.z], dir, len, { bend: -0.35, axis: [1, 0, 0], n: 4 }), (u) => r * (1 - u), { radial: 5 }));
  };
  tine(0.22, [0.15, 0.7, 0.7], 0.5, 0.065);
  tine(0.48, [0.25, 1, 0.15], 0.48, 0.06);
  tine(0.72, [0.2, 1, -0.2], 0.4, 0.05);
  tine(0.9, [0.4, 0.6, -0.5], 0.32, 0.04);
  for (const g of ant) add(up, 'bone', ...both(g));
  // the mane: blade scales off the cheeks and the back of the skull, streaming back with their
  // tips lifting (the spine material: molten roots, the neck's crest continued)
  const mane = [];
  const MANE = [
    [0.47, -0.02, 0.32, [0.55, -0.25, -1], 0.62],
    [0.48, 0.09, 0.2, [0.6, -0.05, -1], 0.75],
    [0.45, 0.2, 0.08, [0.55, 0.15, -1], 0.85],
    [0.4, 0.3, -0.04, [0.45, 0.35, -1], 0.85],
    [0.3, 0.33, -0.14, [0.35, 0.5, -1], 0.75],
    [0.16, 0.3, -0.2, [0.2, 0.6, -1], 0.65],
    [0.42, -0.1, 0.18, [0.6, -0.45, -1], 0.55],
  ];
  for (const [x, y, z, d, len] of MANE) mane.push(sweepTube(bentPath([x, y, z], d, len, { bend: -0.45, axis: [1, 0, 0], n: 4, bendPow: 1.5 }), (t) => 0.075 * Math.pow(1 - t, 0.8), { radial: 4, flat: 0.32 }));
  for (const g of mane) add(up, 'spine', ...both(g));
  add(up, 'spine', sweepTube(bentPath([0, 0.36, 0.2], [0, 0.8, -1], 0.5, { bend: -0.4, axis: [1, 0, 0], n: 4 }), (t) => 0.08 * (1 - t), { radial: 4, flat: 0.3, up: [1, 0, 0] }));
  // the beard: blades hanging back under the chin and along the jaw
  const BEARD = [[0.0, 1.15, 0.5], [0.09, 1.02, 0.45], [0.16, 0.86, 0.4], [0.22, 0.68, 0.36], [0.27, 0.48, 0.32]];
  for (const [x, z, len] of BEARD) {
    const r = interpRow(S.lower, z);
    const g = sweepTube(bentPath([x, r.b + 0.02, z], [x * 0.8, -0.75, -0.65], len, { bend: -0.4, axis: [1, 0, 0], n: 4 }), (t) => 0.06 * Math.pow(1 - t, 0.8), { radial: 4, flat: 0.35 });
    if (x === 0) add(jp, 'spine', g);
    else add(jp, 'spine', ...both(g));
  }
  // the whiskers: two chains of thin tubes off the nose (rig/anim.js sways them)
  const whiskers = [];
  for (const sd of [1, -1]) {
    const joints = [];
    let parent = j.headVis;
    for (let k = 0; k < S.whisker.n; k++) {
      const jk = k === 0 ? joint(parent, sd * S.whisker.root[0], S.whisker.root[1], S.whisker.root[2], `whisker${sd > 0 ? 'L' : 'R'}${k}`) : joint(parent, 0, 0, S.whisker.len, `whisker${sd > 0 ? 'L' : 'R'}${k}`);
      const r0 = S.whisker.r * (1 - k / S.whisker.n), r1 = S.whisker.r * (1 - (k + 1) / S.whisker.n) + 0.004;
      attach(jk, j.mats, { spine: [sweepTube([V(0, 0, 0), V(0, 0, S.whisker.len * 0.5), V(0, 0, S.whisker.len * 1.06)], (t) => lerp(r0, r1, t), { radial: 4, cap: false })] });
      joints.push(jk);
      parent = jk;
    }
    whiskers.push({ joints, side: sd, segLen: S.whisker.len, rest: { ...S.whisker.rest, yaw0: sd * S.whisker.rest.yaw0, yawStep: sd * S.whisker.rest.yawStep } });
  }
  return { whiskers };
};
// whiskers: n segments of len (headVis units) from root, radius r at the root; rest = Chain.buildRest
// angles in the head frame (yaw from +Z toward the side, pitch up): back, out and drooping
LOONG.whisker = { root: [0.25, 0.16, 1.33], n: 5, len: 0.3, r: 0.035, rest: { yaw0: 2.55, yawStep: 0.12, pitch0: -0.15, pitchStep: -0.1, waveAmp: 0.35 } };

// ================================================================ 3. demon: the horned brute
// Shorter, broader and heavier: a massive brow bar over deep-set burning eyes, ram horns curling
// round from the temples and a pair of horns off the crown, a short crushing muzzle, an underbite
// with the lower jaw jutting past the upper and tusks rising outside the upper lip, a heavy chin
// with spikes, spikes down the jaw line.
const DEMON = {
  upper: [
    { z: -0.26, top: 0.2, wt: 0.16, w: 0.3, ys: 0.02, cheek: 0.0, gum: -0.15, wg: 0.24, pal: 0.05 },
    { z: -0.1, top: 0.4, wt: 0.26, w: 0.46, ys: 0.1, cheek: 0.04, gum: -0.22, wg: 0.38, pal: 0.08 },
    { z: 0.1, top: 0.48, wt: 0.3, w: 0.52, ys: 0.12, cheek: 0.08, gum: -0.24, wg: 0.43, pal: 0.1 },
    { z: 0.3, top: 0.5, wt: 0.32, w: 0.53, ys: 0.14, cheek: 0.1, gum: -0.22, wg: 0.44, pal: 0.11 },
    { z: 0.5, top: 0.47, wt: 0.3, w: 0.5, ys: 0.15, cheek: 0.08, gum: -0.2, wg: 0.42, pal: 0.11 },
    { z: 0.68, top: 0.39, wt: 0.26, w: 0.44, ys: 0.12, cheek: 0.05, gum: -0.19, wg: 0.39, pal: 0.1 },
    { z: 0.86, top: 0.34, wt: 0.24, w: 0.4, ys: 0.1, cheek: 0.03, gum: -0.18, wg: 0.36, pal: 0.1 },
    { z: 1.02, top: 0.31, wt: 0.23, w: 0.37, ys: 0.08, cheek: 0.02, gum: -0.17, wg: 0.34, pal: 0.09 },
    { z: 1.14, top: 0.28, wt: 0.22, w: 0.34, ys: 0.05, cheek: 0.0, gum: -0.17, wg: 0.31, pal: 0.08 },
    { z: 1.22, top: 0.2, wt: 0.18, w: 0.28, ys: 0.0, cheek: 0.0, gum: -0.16, wg: 0.25, pal: 0.06 },
    { z: 1.27, top: 0.06, wt: 0.1, w: 0.18, ys: -0.06, cheek: 0.0, gum: -0.15, wg: 0.15, pal: 0.03 },
  ],
  upperFeats: [
    // deep sockets under the brow bar (the bar itself is its own mass, below)
    { c: [0.38, 0.3, 0.56], r: [0.15, 0.11, 0.14], a: -0.13 },
    // the temples hollow under the horn roots, the cheekbones heavy
    { c: [0.48, 0.25, 0.2], r: [0.1, 0.1, 0.12], a: -0.07 },
    { c: [0.6, 0.04, 0.32], r: [0.07, 0.07, 0.24], a: 0.05 },
    // the broad flat nose: nostrils flaring on top, a deep crease between brow and snout
    { c: [0.16, 0.3, 1.12], r: [0.09, 0.06, 0.09], a: 0.06 },
    { c: [0.17, 0.33, 1.15], r: [0.045, 0.03, 0.04], a: -0.06 },
    { c: [0, 0.38, 0.8], r: [0.18, 0.05, 0.04], a: -0.04 },
    { c: [0.2, 0.32, 0.95], r: [0.12, 0.04, 0.03], a: 0.025 },
    // horn bosses at the temples and on the crown
    { c: [0.44, 0.4, 0.2], r: [0.13, 0.11, 0.14], a: 0.06 },
    { c: [0.22, 0.5, 0.1], r: [0.1, 0.07, 0.1], a: 0.04 },
  ],
  lower: [
    { z: -0.32, fl: 0.08, tl: 0.13, wl: 0.18, w: 0.24, ys: 0.03, b: -0.12 },
    { z: -0.14, fl: 0.03, tl: 0.08, wl: 0.36, w: 0.44, ys: -0.06, b: -0.27 },
    { z: 0.1, fl: -0.01, tl: 0.07, wl: 0.4, w: 0.49, ys: -0.1, b: -0.32 },
    { z: 0.35, fl: -0.03, tl: 0.07, wl: 0.38, w: 0.45, ys: -0.1, b: -0.31 },
    { z: 0.6, fl: -0.04, tl: 0.07, wl: 0.36, w: 0.42, ys: -0.1, b: -0.3 },
    { z: 0.85, fl: -0.04, tl: 0.08, wl: 0.34, w: 0.4, ys: -0.1, b: -0.3 },
    { z: 1.05, fl: -0.03, tl: 0.1, wl: 0.33, w: 0.39, ys: -0.1, b: -0.31 },
    { z: 1.2, fl: -0.02, tl: 0.12, wl: 0.3, w: 0.36, ys: -0.1, b: -0.32 },
    { z: 1.3, fl: -0.02, tl: 0.1, wl: 0.22, w: 0.28, ys: -0.12, b: -0.3 },
    { z: 1.36, fl: -0.04, tl: 0.03, wl: 0.1, w: 0.14, ys: -0.14, b: -0.24 },
  ],
  lowerFeats: [
    // the jaw muscle, a heavy chin boss
    { c: [0.5, -0.1, 0.1], r: [0.09, 0.14, 0.24], a: 0.06 },
    { c: [0.1, -0.3, 1.2], r: [0.14, 0.08, 0.12], a: 0.05 },
  ],
  teethUp: [
    [1.22, 0.1, 0.04, 0.2, 0.2],
    [1.14, 0.13, 0.045, 0.25, 0.1],
    [1.04, 0.11, 0.04],
    [0.94, 0.12, 0.04],
    [0.84, 0.1, 0.036],
    [0.74, 0.1, 0.034],
    [0.64, 0.085, 0.03],
    [0.54, 0.075, 0.028],
  ],
  teethLow: [
    // the underbite: lower teeth bigger, the front row standing in front of the upper lip
    [1.32, 0.17, 0.045, 0.2, 0.25],
    [1.25, 0.2, 0.05, 0.25, 0.2],
    [0.93, 0.16, 0.045],
    [0.83, 0.13, 0.04],
    [0.73, 0.14, 0.04],
    [0.63, 0.11, 0.035],
    [0.53, 0.1, 0.032],
    [0.43, 0.08, 0.028],
  ],
  eye: { c: [0.345, 0.29, 0.58], r: [0.04, 0.034, 0.095], rot: [0.4, 0.42, 0.4] },
  nostril: [0.17, 0.34, 1.16],
};
DEMON.extras = (S, up, jp) => {
  // the brow bar: one massive shelf across both eyes, its middle low over the nose (a scowl)
  const bar = sweepTube([V(0.0, 0.46, 0.72), V(0.18, 0.5, 0.68), V(0.36, 0.52, 0.6), V(0.52, 0.48, 0.46), V(0.6, 0.38, 0.32)], (t) => 0.12 * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.95))), { radial: 6, flat: 0.62 });
  add(up, 'head', ...both(bar));
  // ram horns: from the temples, back, down round the ear and forward, spiralling out; ridged
  const ram = sweepTube(bentPath([0.46, 0.42, 0.16], [0.1, 0.75, -0.55], 1.65, { bend: -4.4, axis: [1, 0, 0], drift: [0.32, -0.04, 0.0], n: 18 }), (t) => 0.16 * Math.pow(1 - t, 0.7) + 0.012, { radial: 7, ridge: [10, 0.08] });
  // a pair of horns off the crown, swept back like a bull's
  const crown = sweepTube(bentPath([0.22, 0.5, 0.08], [0.35, 1, -0.55], 1.2, { bend: -0.75, axis: [1, 0, 0], n: 8, bendPow: 1.3 }), (t) => 0.14 * Math.pow(1 - t, 0.85), { radial: 6, ridge: [6, 0.05] });
  // a row of short spikes behind the brow bar
  const spikes = [];
  [[0.12, 0.52, 0.42, 0.28], [0.32, 0.53, 0.4, 0.24]].forEach(([x, y, z, len]) => spikes.push(sweepTube(bentPath([x, y, z], [0.2, 1, -0.6], len, { bend: -0.3, axis: [1, 0, 0], n: 3 }), (t) => 0.05 * (1 - t), { radial: 5 })));
  for (const g of [ram, crown, ...spikes]) add(up, 'bone', ...both(g));
  // tusks: up out of the lower jaw outside the upper lip, curving back
  const tr = interpRow(S.lower, 1.08);
  const tusk = sweepTube(bentPath([tr.w * 0.9, tr.tl - 0.02, 1.08], [0.3, 1, -0.05], 0.55, { bend: -0.7, axis: [1, 0, 0], drift: [0.05, 0, 0], n: 6, bendPow: 1.3 }), (t) => 0.055 * Math.pow(1 - t, 0.7), { radial: 6 });
  add(jp, 'teeth', ...both(tusk));
  // spikes down the jaw line and on the chin
  const js = [];
  [[0.1, 0.32], [0.38, 0.28], [0.66, 0.24]].forEach(([z, len]) => {
    const r = interpRow(S.lower, z);
    js.push(...both(sweepTube(bentPath([r.w * 0.9, r.ys - 0.12, z], [0.6, -0.55, -1], len, { bend: 0.2, axis: [1, 0, 0], n: 3 }), (t) => 0.06 * (1 - t), { radial: 5, flat: 0.65 })));
  });
  [[0.12, 1.22, 0.24], [0.0, 1.3, 0.2]].forEach(([x, z, len]) => {
    const r = interpRow(S.lower, z);
    const g = sweepTube(bentPath([x, r.b + 0.03, z], [x, -1, 0.45], len, { bend: 0.3, axis: [1, 0, 0], n: 3 }), (t) => 0.06 * (1 - t), { radial: 5 });
    if (x === 0) js.push(g);
    else js.push(...both(g));
  });
  add(jp, 'bone', ...js);
};

// ================================================================ the sculpted head
/**
 * Build a sculpted head from its data H (upper / lower keys and features, teeth rows, eye, nostril,
 * extras(H, upperParts, jawParts, ctx) for horns, brows and the rest): the skull, the eyes, the
 * nostril joints, the jaw joint (JAW_PIVOT) and its jaw. Returns { eyes, nostrils, jaw, whiskers }.
 */
function buildSculpted(H, headVis, mats) {
  const up = sculptLoft({ keys: H.upper, profile: upperProfile, sub: UPPER_SUB, bands: UPPER_BANDS, feats: H.upperFeats, step: 0.05 });
  const lo = sculptLoft({ keys: H.lower, profile: lowerProfile, sub: LOWER_SUB, bands: LOWER_BANDS, feats: H.lowerFeats, step: 0.04 });
  const parts = { head: [up.head], maw: [up.maw], teeth: teethRow(H.upper, H.teethUp, true, H.teethOpt) };
  const jp = { head: [lo.head], maw: [lo.maw], teeth: teethRow(H.lower, H.teethLow, false, H.teethOpt) };
  // a face may repaint regions of its hide in another material (H.paint: a bone mask, dark sockets)
  for (const [P, list] of [[parts, H.paint], [jp, H.paintJaw]]) {
    for (const rule of list ?? []) {
      const from = rule.from ?? 'head';
      const [keep, moved] = repaint(P[from][0], rule);
      if (moved && keep === moved) P[from].shift();
      else P[from][0] = keep;
      if (moved) add(P, rule.key, moved);
    }
  }
  const out = H.extras?.(H, parts, jp, { headVis, mats }) ?? {};
  attach(headVis, mats, parts);
  const eyes = [eyeMesh(headVis, mats.eye, 1, H.eye), eyeMesh(headVis, mats.eye, -1, H.eye)];
  const n = H.nostril;
  const nostrils = [joint(headVis, n[0], n[1], n[2], 'nostrilL'), joint(headVis, -n[0], n[1], n[2], 'nostrilR')];
  const jaw = joint(headVis, ...JAW_PIVOT, 'jaw');
  attach(jaw, mats, jp);
  return { eyes, nostrils, jaw, whiskers: out.whiskers ?? [], hornTip: out.hornTip ?? null };
}

/**
 * Split a flat-faceted geometry: the triangles a rule takes go to its material. A rule is
 * { key, from? ('head'), z?: [from, to], c?, r? (an ellipsoid, x mirrored), y?: [from, to], except? }: every given test must
 * hold for the triangle's centre. Returns [kept, moved | null].
 */
function repaint(geo, rule) {
  const p = geo.attributes.position.array, g = geo.attributes.aGUV.array;
  const A = { p: [], g: [] }, B = { p: [], g: [] };
  for (let t = 0; t < p.length; t += 9) {
    const x = Math.abs(p[t] + p[t + 3] + p[t + 6]) / 3, y = (p[t + 1] + p[t + 4] + p[t + 7]) / 3, z = (p[t + 2] + p[t + 5] + p[t + 8]) / 3;
    let hit = true;
    if (rule.z && (z < rule.z[0] || z > rule.z[1])) hit = false;
    if (rule.y && (y < rule.y[0] || y > rule.y[1])) hit = false;
    if (rule.c) {
      const dx = (x - rule.c[0]) / rule.r[0], dy = (y - rule.c[1]) / rule.r[1], dz = (z - rule.c[2]) / rule.r[2];
      if (dx * dx + dy * dy + dz * dz > 1) hit = false;
    }
    for (const e of rule.except ?? []) {
      const dx = (x - e.c[0]) / e.r[0], dy = (y - e.c[1]) / e.r[1], dz = (z - e.c[2]) / e.r[2];
      if (dx * dx + dy * dy + dz * dz <= 1) hit = false;
    }
    const T = hit ? B : A, j = (t / 9) * 6;
    for (let k = 0; k < 9; k++) T.p.push(p[t + k]);
    for (let k = 0; k < 6; k++) T.g.push(g[j + k]);
  }
  const mk = (T) => {
    if (!T.p.length) return null;
    const o = new THREE.BufferGeometry();
    o.setAttribute('position', new THREE.Float32BufferAttribute(T.p, 3));
    o.setAttribute('aGUV', new THREE.Float32BufferAttribute(T.g, 2));
    o.computeVertexNormals();
    return o;
  };
  // (everything taken: the same geometry on both sides tells the caller to drop the source)
  if (!A.p.length) return [geo, geo];
  return [mk(A), mk(B)];
}

// ================================================================ entry
/** Every sculpted head's data by name (faces.js adds the four faces of 2026-11-20). */
export const HEADS = { skull: SKULL, loong: LOONG, demon: DEMON };
/**
 * How much of the neck's crest and mane the head in use keeps on the last neck segments, nearest the
 * head first (model.js; a face may clear its nape so the skull's outline stands free): [] = all of it.
 */
export const faceNape = () => HEADS[FACE]?.nape ?? [];

/**
 * Build the head `face` (not 'old': model.js keeps that one) on headVis. Returns { eyes, nostrils,
 * jaw, whiskers } (whiskers: [{ joints, side, segLen, rest }]: chains for rig/anim.js, the loong's).
 */
export function buildHead(face, headVis, mats) {
  const H = HEADS[face];
  return H ? buildSculpted(H, headVis, mats) : null;
}
