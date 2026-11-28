import * as THREE from 'three';
import { boxGeometry, kiteGeometry, mergeGeometries, sub, lerp } from '../../player/heroGeo.js';
import { lookOf } from '../duelist/lookSwitch.js';

// Varr Nihil drawn after the reference pack (docs/art/character-packs-v04/varr-nihil, ADR-277).
// Two switches, each '0' (the figure and the motion as they ship) until the owner picks:
//   ?lordRef=a      his look: the hood, the closed helm, the armour, the war-skirt and the whole
//                   crimson-lined cape kept in every form (the owner's instruction: no form-by-form
//                   wear, whatever `?lordLook` says), every blade split (two red-white rails with a
//                   dark slit between them, a short cross-guard on the hilt), the crimson sash and
//                   its clasp across his chest, the cape's sides standing off him so its lining frames
//                   him from the front, and the cloth that lags and overshoots further.
//   ?lordRefMove=a  his motion (moves.js / poses.js `refMove`): the poses only, never the timing,
//                   the zones, the damage or the root motion.
// Read at build time (gear.js; a page load per option) and per beat / frame (moves.js, poses.js).

export const refLook = () => lookOf('lordRef', '0') !== '0';
export const refMove = () => lookOf('lordRefMove', '0') !== '0';

// ---------------------------------------------------------------- the split blade
/** The split blade's numbers (m, before the blade mesh is scaled to its length along Z: the width and
 *  the rails' cross-section are true; a z of 1 is the point). */
export const SPLIT = Object.freeze({
  w: 0.066, // across the rails at the emitter (outer edge to outer edge)
  waist: 0.82, // … still this fraction of it at the shoulder of the point
  shoulder: 0.8, // where the point begins (fraction of the length)
  rail: 0.0085, // each rail's width
  th: 0.011, // the rails' thickness (the flat: local Y)
  core: 0.006, // the dark slit's thickness
  steps: 9, // segments along the blade
});

const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3();
/** A thin box from P to Q ([x, y, z]), `w` wide across local X before turning, `th` thick. */
function bar(P, Q, w, th, k = 0) {
  const dx = Q[0] - P[0], dy = Q[1] - P[1], dz = Q[2] - P[2];
  const len = Math.hypot(dx, dy, dz);
  // (a box along +Y, turned onto PQ: for a near-Z segment its width stays across X)
  const g = boxGeometry(w, len + 0.002, th, 0, 0, 0);
  g.rotateX(Math.PI / 2); // now along +Z, width X, thickness Y
  _dir.set(dx / len, dy / len, dz / len);
  g.applyQuaternion(_q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _dir));
  g.translate((P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2, (P[2] + Q[2]) / 2);
  return sub(g, k);
}
/** The blade's half-width (to the rails' centre lines) at z 0..1. */
function halfW(z) {
  const S = SPLIT, w0 = (S.w - S.rail) / 2, w1 = w0 * S.waist;
  return z <= S.shoulder ? lerp(w0, w1, z / S.shoulder) : w1 * Math.max(0, 1 - (z - S.shoulder) / (1 - S.shoulder));
}
/**
 * The split blade (1 m along +Z from the emitter, or along −Z for `dir` −1): `rails` (two red-white
 * rails meeting at the point: the blade's light) and `core` (the dark slit between them).
 */
export function splitBlade(dir = 1) {
  const S = SPLIT, rails = [], core = [];
  for (let i = 0; i < S.steps; i++) {
    const z0 = i / S.steps, z1 = (i + 1) / S.steps, h0 = halfW(z0), h1 = halfW(z1);
    for (const s of [-1, 1]) rails.push(bar([s * h0, 0, z0 * dir], [s * h1, 0, z1 * dir], S.rail, S.th, i & 1));
    const cw = Math.max(0.002, 2 * Math.min(h0, h1) - S.rail * 0.6);
    if (h1 > S.rail * 0.4) core.push(bar([0, 0, z0 * dir], [0, 0, z1 * dir], cw, S.core, 0));
  }
  return { rails: mergeGeometries(rails), core: mergeGeometries(core) };
}
/** The cross-hilt's side blades split the same way (`len` each, out along ±X from the guard at `z`). */
export function splitQuillons(len, z) {
  const rails = [], core = [];
  const h = 0.014;
  for (const s of [-1, 1]) {
    const x0 = s * 0.02, x1 = s * (0.02 + len);
    for (const e of [-1, 1]) rails.push(bar([x0, 0, z + e * h], [lerp(x0, x1, 0.8), 0, z + e * h * 0.8], 0.007, SPLIT.th, 0), bar([lerp(x0, x1, 0.8), 0, z + e * h * 0.8], [x1, 0, z], 0.007, SPLIT.th, 1));
    core.push(bar([x0, 0, z], [lerp(x0, x1, 0.85), 0, z], 0.014, SPLIT.core, 0));
  }
  return { rails: mergeGeometries(rails), core: mergeGeometries(core) };
}
/** A short cross-guard of dark metal across the emitter (the reference's sword hilt): `z` its place. */
export function crossGuard(z, half = 0.042) {
  return mergeGeometries([
    sub(boxGeometry(half * 2, 0.014, 0.016, 0, 0, z), 0),
    sub(kiteGeometry(0.012, 0.012, 0.01).translate(half, 0, z), 1),
    sub(kiteGeometry(0.012, 0.012, 0.01).translate(-half, 0, z), 1),
  ]);
}

// ---------------------------------------------------------------- the sash and its clasp
/** The crimson sash from his left shoulder down across the breast to the clasp on his right breast,
 *  laid over the cuirass (`CU`: gear.js CUIRASS; spine space via `ySp`). Returns { band, clasp, rim }. */
export function sashGeometry(CU, ySp) {
  const surf = (a, h, off) => {
    let i = 0;
    while (i < CU.length - 2 && CU[i + 1].y < h) i++;
    const A = CU[i], B = CU[i + 1], u = Math.min(1, Math.max(0, (h - A.y) / (B.y - A.y)));
    const rx = lerp(A.rx, B.rx, u) + off, rz = lerp(A.rz, B.rz, u) + off, cz = lerp(A.cz ?? 0, B.cz ?? 0, u);
    return [Math.sin(a) * rx, ySp(h), Math.cos(a) * rz + cz];
  };
  const band = [];
  const n = 7, a0 = 1.05, h0 = 1.468, a1 = -0.62, h1 = 1.372;
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n;
    band.push(bar(surf(lerp(a0, a1, t0), lerp(h0, h1, t0), 0.016), surf(lerp(a0, a1, t1), lerp(h0, h1, t1), 0.016), 0.062, 0.008, k & 1));
  }
  // (each segment's width lies across X before it is turned: along a sash that runs mostly sideways,
  // it stands up and down: the band's breadth)
  const c = surf(-0.5, 1.385, 0.03);
  const clasp = kiteGeometry(0.032, 0.036, 0.012).rotateZ(Math.PI / 4).translate(c[0], c[1], c[2]);
  const rim = kiteGeometry(0.04, 0.044, 0.006).rotateZ(Math.PI / 4).translate(c[0], c[1], c[2] - 0.004);
  return { band: mergeGeometries(band), clasp: sub(clasp, 1), rim: sub(rim, 0) };
}

// ---------------------------------------------------------------- the cape
/** The cape's sides stand off him (the lining frames him from the front) and every sheet lags and
 *  overshoots further: `sheet(d, i)` the sheet's numbers, `lag` / `max` the springs'. */
export const CAPE_REF = Object.freeze({
  lag: 0.72,
  max: 1.6,
  sheet: (d, i) => (i >= 3 ? { ...d, ry: d.ry + (i === 3 ? -0.22 : 0.22), w: d.w.map((w) => w * 1.12), out: 0.44 } : { ...d, out: d.out + 0.05 }),
});
