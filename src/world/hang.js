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
  // a blow's shock (hangKick): a swing away from it, on top of the wind's lean
  const kk = hangKickAt(U, x, z, _kv) * (give > 0 ? Math.min(HANG.kick.paper, Math.sqrt(give)) : 0.8);
  if (kk > 1e-4) {
    const s = Math.sin(kk);
    out.x = _kv.x * s;
    out.y = 1 - Math.cos(kk);
    out.z = _kv.z * s;
  }
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
  out.x += (vx / s) * sn;
  out.y += 1 - Math.cos(th);
  out.z += (vz / s) * sn;
  return out;
}

const _kv = { x: 0, z: 0 };
const KICK_LEN = HANG.kick.slots * 2;

/**
 * A blow's shock reaches what hangs (the living world's tremor, life/tremor.js): from (x, z) a swing
 * of `amp` rad away from the blow, falling off to nothing at `reach` m (default HANG.kick.reach) and
 * ringing down over HANG.kick (its decay, rate, speed). Into the shared `uHangKick` (made with the
 * first hanging material, render/materials.js): nothing happens in a level where nothing hangs. The
 * newest kick takes a free slot, or the one that has the least swing left. Returns the slot, or -1.
 */
export function hangKick(U, x, z, amp, reach = HANG.kick.reach) {
  const A = U?.uHangKick?.value, t = U?.uTime?.value;
  if (!A || A.length < KICK_LEN || !Number.isFinite(x + z + amp + reach + t) || !(amp > 0) || !(reach > 0)) return -1;
  const K = HANG.kick;
  let slot = 0, least = Infinity;
  for (let i = 0; i < K.slots; i++) {
    const a = A[i * 2];
    const left = a.w > 0 ? a.w * Math.exp(-Math.max(0, t - a.z) * K.decay) : 0;
    if (left < least) {
      least = left;
      slot = i;
    }
  }
  A[slot * 2].set(x, z, t, Math.min(1, amp));
  A[slot * 2 + 1].set(reach, K.decay, K.rate, K.speed);
  return slot;
}

/** The spent kicks are zeroed (the shader then skips them, and with the wind off adds nothing). */
export function hangKickSettle(U) {
  const A = U?.uHangKick?.value, t = U?.uTime?.value;
  if (!A || !Number.isFinite(t)) return;
  for (let i = 0; i < HANG.kick.slots && i * 2 < A.length; i++) {
    const a = A[i * 2];
    if (a.w > 0 && (t - a.z > HANG.kick.life + 1 || t < a.z - 1)) a.set(0, 0, 0, 0);
  }
}

/** The kicks' swing at a piece standing at (x, z) now: its size (rad, returned) and its way into `out` { x, z } (unit). */
export function hangKickAt(U, x, z, out) {
  out.x = out.z = 0;
  const A = U?.uHangKick?.value, t = U?.uTime?.value;
  if (!A || !Number.isFinite(t)) return 0;
  let kx = 0, kz = 0;
  for (let i = 0; i < HANG.kick.slots && i * 2 + 1 < A.length; i++) {
    const a = A[i * 2], q = A[i * 2 + 1];
    if (!(a.w > 0)) continue;
    const ex = x - a.x, ez = z - a.y, d = Math.hypot(ex, ez);
    const f = Math.max(0, 1 - d / Math.max(q.x, 0.1));
    const age = t - a.z - d / Math.max(q.w, 1);
    if (f <= 0 || age <= 0 || age * q.y > 4) continue;
    const k = a.w * f * f * Math.exp(-age * q.y) * Math.sin(age * q.z);
    kx += (d > 0.2 ? ex / d : 1) * k;
    kz += (d > 0.2 ? ez / d : 0) * k;
  }
  const l = Math.hypot(kx, kz);
  if (l > 1e-6) {
    out.x = kx / l;
    out.z = kz / l;
  }
  return l;
}
