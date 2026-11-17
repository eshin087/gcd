import * as THREE from 'three';
import { boxGeometry, mergeGeometries, sub, tatterStrip, shellGeometry, foldLines, rng, lerp } from '../../player/heroGeo.js';
import { ellipsoidGeometry } from '../../../render/glyphGeometry.js';
import { lookOf } from '../duelist/lookSwitch.js';

// Look option `b` of Varr Nihil's body (`?lordLook=b`; `c` = the same in the dragon look): his own
// figure, worn down form by form, so the fight shows on the man himself.
//   form 1  the blade and the hand: as he ships.
//   form 2  the back sheet of the cape is torn off short into rags; a crack opens across the cuirass
//           and red light shows in it.
//   form 3  three of the five cape sheets are rags; two more cracks (his left breast, his back).
//   form 4  the whole cape is in rags; a crack across the belly; the hood is thrown back onto the
//           yoke, and his head is a black helm whose faceplate is split down the middle by red light.
// Each step is one big change of silhouette or one line of red light (a torn cape and a bare helm
// read at 30 m).
//
// Built only when the look is chosen at build time (gear.js reads `lookOf('lordLook')`): the default
// rig ('0') is exactly as before. The pieces are kept out of the static merge (`keep`), hidden until
// their form; the cracks and the split are his `flask` instance (the red light of his blades, slit and
// sigil: they glow with his blades), the rags his cloth: no new material, the draw calls as they are.
// dressFrame(d, dt) switches them; the actor calls it once a frame (see the looks report). Without
// that call the dressing stays in its form-1 state: harmless.

/** The option chosen: { art, dress }. */
export function lordLookNow() {
  const o = lookOf('lordLook', '0', 'b');
  return { art: o === 'a' || o === 'c', dress: o === 'b' || o === 'c' };
}

/** The form from which each cape sheet hangs in rags (LORD_CAPE order: back, back-left, back-right, left, right). */
const TORN_AT = [2, 3, 3, 4, 4];

function dressOf(root) {
  return (root.userData.dress ??= { kind: 'lord', phase: 0, at: [] });
}
/** Show `m` from form `from` (to form `to`). */
function at(D, m, from, to = 9) {
  D.at.push({ m, from, to });
  m.visible = from <= 1 && to >= 1;
}

const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3();

/** A line of light along `pts` (each [x, y, z]): thin boxes joined end to end. */
function crackLine(pts, w = 0.028, th = 0.006) {
  const parts = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    const P = pts[k], Q = pts[k + 1];
    const dx = Q[0] - P[0], dy = Q[1] - P[1], dz = Q[2] - P[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) continue;
    const g = boxGeometry(w, len + 0.006, th, 0, 0, 0);
    g.applyQuaternion(_q.setFromUnitVectors(_up, _dir.set(dx / len, dy / len, dz / len)));
    g.translate((P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2, (P[2] + Q[2]) / 2);
    parts.push(sub(g, k & 1));
  }
  return mergeGeometries(parts);
}

/** A crack over the cuirass (`CU`: its rings, heights in m standing; spine space via `ySp`): from
 *  [angle, height] a0 to a1 (angle 0 = his front, + = his left), jagged, `n` steps. */
function cuirassCrack(CU, ySp, [a0, h0], [a1, h1], n, seed) {
  const r = rng(seed), pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, j = k === 0 || k === n ? 0 : (r() - 0.5);
    const a = lerp(a0, a1, t) + j * 0.12, h = lerp(h0, h1, t) + (r() - 0.5) * (k === 0 || k === n ? 0 : 0.02);
    let i = 0;
    while (i < CU.length - 2 && CU[i + 1].y < h) i++;
    const A = CU[i], B = CU[i + 1], u = Math.min(1, Math.max(0, (h - A.y) / (B.y - A.y)));
    const rx = lerp(A.rx, B.rx, u) + 0.007, rz = lerp(A.rz, B.rz, u) + 0.007, cz = lerp(A.cz ?? 0, B.cz ?? 0, u);
    pts.push([Math.sin(a) * rx, ySp(h), Math.cos(a) * rz + cz]);
  }
  return crackLine(pts);
}

/** The cracks in the cuirass (`CU`: gear.js CUIRASS). */
export function dressPlate(ctx, CU) {
  const D = dressOf(ctx.root);
  const { spine, M, REST, mesh } = ctx;
  const ySp = (h) => h - REST.spine;
  const cracks = [
    // form 2: from his right breast down across the breastbone
    [2, [-0.75, 1.46], [0.25, 1.29], 6, 11],
    // form 3: his left breast to the armpit; across the shoulder blades
    [3, [0.35, 1.44], [1.25, 1.33], 5, 23],
    [3, [2.5, 1.45], [3.7, 1.32], 6, 37],
    // form 4: across the belly, under the sigil
    [4, [-1.0, 1.31], [0.9, 1.28], 7, 41],
  ];
  const keep = [];
  for (const [form, p0, p1, n, seed] of cracks) {
    const m = mesh(spine, cuirassCrack(CU, ySp, p0, p1, n, seed), M.flask);
    at(D, m, form);
    keep.push(m);
  }
  return { keep };
}

/** The hood thrown back in form 4 (`made`: everything the hood item hung; `maskStrip(s0, s1, t0, t1,
 *  off, cols, rows)`: a strip of his faceplate, gear.js). */
export function dressHood(ctx, made, maskStrip) {
  const D = dressOf(ctx.root);
  const { head, chest, M, DIM, REST, mesh } = ctx;
  // the hood's cloth and its rim go (the faceplate stays)
  const cloth = made.filter((m) => m.material === M.coat || m.material === M.lining || m.material === M.hem);
  for (const m of cloth) at(D, m, 1, 3);
  // the helm under it: a black shell over the back and top of the skull
  const [sx, sy, sz] = DIM.skull;
  const helm = mesh(head, foldLines(ellipsoidGeometry(0.09, 0.1, 0.1, { widthSegs: 14, heightSegs: 8 }), (x, y) => 0.5 + 0.45 * Math.sin(y * 70)).translate(sx, sy + 0.014, sz - 0.022), M.armor);
  // the faceplate split down its prow by red light
  const split = mesh(head, mergeGeometries([
    // (t from 0: the faceplate's width curve is a power of t, NaN below it)
    maskStrip(0.475, 0.505, () => 0, () => 0.55, 0.009, 1, 5),
    maskStrip(0.49, 0.525, () => 0.5, () => 1.0, 0.009, 1, 4),
  ]), M.flask);
  // the hood fallen onto the yoke behind his neck: a bunched cowl
  const yCh = (h) => h - REST.chest;
  const cowl = foldLines(shellGeometry([
    { y: yCh(1.49), rx: 0.2, rz: 0.17, cz: -0.045, gap: 0.09 },
    { y: yCh(1.53), rx: 0.18, rz: 0.155, cz: -0.055, gap: 0.08 },
    { y: yCh(1.565), rx: 0.15, rz: 0.13, cz: -0.06, gap: 0.075 },
    { y: yCh(1.58), rx: 0.12, rz: 0.1, cz: -0.06, gap: 0.07 },
  ], { sub: 2, cols: 24 }), (x, y, z, u) => 0.5 + 0.6 * Math.sin(u * 40 + y * 30));
  const cA = mesh(chest, cowl, M.coat);
  const cB = mesh(chest, cowl, M.lining);
  for (const m of [helm, split, cA, cB]) at(D, m, 4);
  return { keep: [...made, helm, split, cA, cB] };
}

/** The cape torn to rags form by form (`out`: the cape item's streamers; `made`: its meshes; `capes`:
 *  gear.js LORD_CAPE). Each sheet's lower segment is swapped for three ragged strips of its cloth. */
export function dressCape(ctx, out, made, capes) {
  const D = dressOf(ctx.root);
  const { M, mesh } = ctx;
  const keep = [];
  (out?.streamers ?? []).forEach((S, i) => {
    const d = capes[i];
    if (!d) return;
    const s1 = S.segs[1], from = TORN_AT[i] ?? 4;
    // the whole lower segment goes
    for (const m of made) if (m.parent === s1) {
      at(D, m, 1, from - 1);
      keep.push(m);
    }
    // ... and its rags hang from the tear
    const [, w1] = d.w, L1 = d.len[1], R1 = d.wrap + 0.25 * d.len[0];
    const r = rng(1201 + i * 17), n = 3, rags = [];
    for (let k = 0; k < n; k++) {
      const u = ((k + 0.5) / n - 0.5) * w1 * 0.92;
      const a = u / R1;
      const g = tatterStrip(L1 * (0.1 + 0.22 * r()), (w1 / n) * 0.85, { fork: r() < 0.6, curl: 0.12, seed: 1300 + i * 7 + k });
      rags.push(sub(g.rotateY(a).translate(Math.sin(a) * R1, 0.02, (Math.cos(a) - 1) * R1), k & 1));
    }
    const g = mergeGeometries(rags);
    const a1 = mesh(s1, g, M.coat), a2 = mesh(s1, g, M.lining);
    at(D, a1, from);
    at(D, a2, from);
    keep.push(a1, a2);
  });
  return { ...out, keep: [...(out?.keep ?? []), ...keep] };
}

/** Once a frame (the actor's): show the dressing of his form. A form change flips a few `visible` flags; otherwise nothing. */
export function dressFrame(d) {
  const D = d?.rig?.root?.userData?.dress;
  if (!D || D.kind !== 'lord') return;
  const n = Math.min(4, Math.max(1, d.phase | 0));
  if (n === D.phase) return;
  D.phase = n;
  for (const e of D.at) e.m.visible = n >= e.from && n <= e.to;
}
