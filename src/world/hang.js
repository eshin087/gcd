import * as THREE from 'three';
import { HANG } from './hangTuning.js';

// What hangs answers the wind (banners, paper strips, a rope): the per-vertex `aHang` (vec2: x = m
// below the line it hangs from, 0 = fixed; y = its give, hangTuning.js `kinds`) that the prop art
// material's PA_HANG reads (render/materials.js). A builder marks a hanging part with `hangFrom` while
// its geometry is still upright in its own frame; the mark rides in `geometry.userData.hang` (so a
// set's static meshes, which merge their geometries, never see it) until the breakables turn it into
// the attribute (`hangAttr`, world/destructibles.js `_mesh`). From there it is an ordinary attribute:
// the brick cutting (forest.js `refine`) interpolates it, the rigid batch copies it (rigidBatch.js: every
// attribute any source has, zeros for the others), and a bite folds or sets back a triangle without
// touching it. The shader sways a piece only while it stands at home and upright (its bone's up axis
// and base height), so a felled, carried or thrown piece is still.

/**
 * Mark every vertex of `geo` as hanging from the horizontal line at height `top` (the geometry's frame,
 * now): drop = top - y (0 at or above it). `kind`: a key of HANG.kinds. Returns `geo`.
 */
export function hangFrom(geo, top, kind = 'cloth') {
  const p = geo.attributes.position, n = p.count;
  const give = HANG.kinds[kind]?.give ?? HANG.kinds.cloth.give;
  const a = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    a[i * 2] = Math.max(0, top - p.getY(i));
    a[i * 2 + 1] = give;
  }
  geo.userData.hang = a;
  return geo;
}

/** After `merged = mergeGeometries(parts)` (non-indexed, in order): the parts' marks joined (zeros where a part has none). */
export function mergeHang(parts, merged) {
  if (!merged || !parts.some((g) => g.userData?.hang)) return merged;
  const a = new Float32Array(merged.attributes.position.count * 2);
  let at = 0;
  for (const g of parts) {
    const h = g.userData?.hang, n = g.attributes.position.count;
    if (h && h.length === n * 2) a.set(h, at * 2);
    at += n;
  }
  merged.userData.hang = a;
  return merged;
}

/** True when one of `geos` is marked. */
export const hangs = (geos) => Array.isArray(geos) && geos.some((g) => g?.userData?.hang);

/**
 * The marks into the attribute (every geometry of one piece gets `aHang`, zeros where unmarked, so they
 * merge). A geometry whose vertex count no longer matches its mark is left fixed. Returns whether any hangs.
 */
export function hangAttr(geos) {
  if (!hangs(geos)) return false;
  for (const g of geos) {
    const n = g.attributes.position.count, h = g.userData?.hang;
    g.setAttribute('aHang', new THREE.BufferAttribute(h && h.length === n * 2 ? h : new Float32Array(n * 2), 2));
    delete g.userData.hang;
  }
  return true;
}

/** A piece's hang (the breakables read it to bite where the cloth is drawn): { top, give } in its own
 *  space (top: the line its first hanging vertex hangs from), or null when nothing of it hangs. */
export function hangOf(geo) {
  const a = geo?.attributes?.aHang, p = geo?.attributes?.position;
  if (!a || !p) return null;
  for (let i = 0; i < a.count; i++) {
    const h = a.getX(i);
    if (h > 0) return { top: p.getY(i) + h, give: a.getY(i) };
  }
  return null;
}

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Where the hang shader puts a hanging point now, per metre of drop: `out` { x, y, z } (x, z the lean
 * downwind, y the lift). The same air as the GLSL (render/materials.js HANG_VERT_GLSL: windDirAt and
 * windFronts on uWind / uWindFronts, shaderLib.js), without its ripple (a few cm) and its slow wobble
 * (a fifth of the lean either way): the breakables use it to take a bite where the blade meets the
 * cloth as it is drawn. All zero while the wind is off. No allocation.
 */
export function hangLean(U, x, z, give, out) {
  out.x = out.y = out.z = 0;
  const W = U?.uWind?.value, A = U?.uWindFronts?.value;
  if (!W || !A || Math.abs(W.x) + Math.abs(W.y) <= 0.5) return out;
  // windDirAt
  let dx = W.x, dz = W.y;
  const S = A[8];
  if (S && S.z > 0) {
    const ex = S.x - x, ez = S.y - z, l = Math.hypot(ex, ez);
    dx = l > 0.5 ? ex / l : 0;
    dz = l > 0.5 ? ez / l : 0;
  }
  // windFronts
  let k = 0, fx = 0, fz = 0;
  for (let i = 0; i < 4; i++) {
    const a = A[i * 2], b = A[i * 2 + 1];
    if (!a || !b || a.w <= 0) continue;
    const s = x * a.x + z * a.y, c = a.x * z - a.y * x;
    const e = a.z + 2.4 * Math.sin(c * 0.07 + b.z) + 1.1 * Math.sin(c * 0.19 + b.z * 1.7);
    const d = e - s;
    if (d < -b.y || d > b.x * 5) continue;
    const f = d < 0 ? smooth(-b.y, 0, d) : Math.exp(-d / b.x);
    const m = a.w * (0.62 + 0.38 * Math.sin(c * 0.11 + b.z * 2.3));
    k += f * m;
    fx += a.x * f * m;
    fz += a.y * f * m;
  }
  const fl = Math.hypot(fx, fz);
  if (fl > 1e-4) {
    fx /= fl;
    fz /= fl;
  } else {
    fx = W.x;
    fz = W.y;
  }
  const H = HANG.shader;
  const vx = dx * W.z + fx * k * H.front, vz = dz * W.z + fz * k * H.front, s = Math.hypot(vx, vz);
  if (!(s > 1e-4)) return out;
  const drag = s * Math.abs(give), th = H.lean * ((drag * drag) / (drag * drag + H.half * H.half)), sn = Math.sin(th);
  out.x = (vx / s) * sn;
  out.y = 1 - Math.cos(th);
  out.z = (vz / s) * sn;
  return out;
}
