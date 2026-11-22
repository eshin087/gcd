import * as THREE from 'three';
import { ellipsoidGeometry, limbGeometry } from '../../../render/glyphGeometry.js';
import { registerItem } from '../../player/gear/index.js';
import { buildFreeHand } from '../../player/gear/hands.js';
import { hangSheet, panelSkirt } from '../../player/gear/sheet.js';
import {
  gridGeometry, shellGeometry, bandGeometry, boxGeometry, mergeGeometries, sub, foldLines, lerp, limb,
  orient, orientTo, clumpGeometry, rng,
} from '../../player/heroGeo.js';
import { toDragonLook } from '../ashDisciple/bodyArt.js';
import { HERMIT_ART } from './bodyArt.js';
import { hermitLook, dressOf } from './look.js';

// Gu Shan's gear: an old bare-handed man on the hero's skeleton (built by the same buildHero(U,
// loadout), driven by the same animator), no weapon. Three outfits for the owner to pick from
// (`?hermitLook=a|b|c|a0`, look.js; read when his rig is built), each built only when chosen:
//   a  the Straw Recluse: a ragged straw rain cape in three shaggy tiers over the shoulders, open in
//      front (his beard and the robe show), a patched hemp robe to the shin, the sleeves rolled to
//      the elbow, white hair in a loose topknot with a wooden pin, long white brows and a LONG WHITE
//      BEARD on a spring, a wine gourd swinging at his left hip, bare feet, wooden beads on the
//      right wrist. a0 = the same in the ink-line art.
//   b  the Woodcutter: broad (a fuller torso and arms), a sleeveless hemp vest open over a bare
//      chest, a rope belt, a rope across his body that carries a bundle of firewood on his back,
//      an empty axe sling at his right hip, an indigo headscarf, dark hair, cloth-wrapped forearms
//      and shins, straw sandals.
//   c  the Ascetic: lean (a slighter torso and arms), a faded robe over the left shoulder (the
//      right bare) to the ankle, grey hair unbound down his back to the waist, a great string of
//      wooden beads across the chest, eyes shut, bare feet.
// a, b and c are drawn through the wyrm's art path (bodyArt.js HERMIT_ART, toDragonLook).
//
// The right hand is an OPEN PALM on the sword joint, fingers together along its +Z (HAND, his
// "blade"); the left is the shared free hand (hands.js), held at the small of his back until phase 3
// (poses.js BEHIND): the cape, the hair and the firewood all end above it.
//
// Materials (his own instances; look.js HERMIT_TINT / bodyArt.js HERMIT_ART colour them), by outfit:
//   a  coat / lining = the robe, facing = its patches and the rolled cuffs, leather / welt / collarIn
//      = the straw cape (its outer tiers, its middle tier, inside), hem = the white hair, brows and beard, shirt = the sash and the
//      collar band, pants = the trousers, trim = the beads and the hair pin, piping = the gourd.
//   b  coat / lining = the vest, facing = the headscarf, shirt = the dark hair, leather = the ropes,
//      collar = the firewood, trim = the axe sling, hem = the wraps, piping = the sandals.
//   c  coat / lining = the robe, facing = its edge, hair / hairTip = the grey hair, trim = the beads,
//      leather = the cord at his waist.

const ySp = (h) => h - 1.035; // world idle height -> spine space (REST.spine)
const yPv = (h) => h - 0.955; // -> pelvis space (REST.pelvis)
const yCh = (h) => h - 1.225; // -> chest space (REST.chest)

/** The geometry with its back face too (a ribbon in a one-sided material). */
function twoSided(g) {
  const b = g.clone();
  const idx = b.index;
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i + 1);
    idx.setX(i + 1, idx.getX(i + 2));
    idx.setX(i + 2, a);
  }
  const n = b.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return mergeGeometries([g, b]);
}

/** A mesh helper that also lists what it made. */
function capture(ctx) {
  const made = [];
  const mesh = (...a) => {
    const m = ctx.mesh(...a);
    made.push(m);
    return m;
  };
  return { made, cx: { ...ctx, mesh } };
}
/** hangSheet in a one-sided material, both faces drawn. */
function hang2(ctx, parent, d, mats) {
  const { made, cx } = capture(ctx);
  const S = hangSheet(cx, parent, d, mats);
  for (const m of made) m.geometry = twoSided(m.geometry);
  return S;
}

// ================================================================= the head
// Head space (before BODY.headScale): the scalp is the ellipsoid BODY.head (c [0, 0.154, -0.007],
// r [0.105, 0.118, 0.112]); the face looks down +Z (its front at z 0.105, the chin at y 0.034); his
// left is +X.
const SC = [0, 0.154, -0.007], SR = [0.105, 0.118, 0.112];
function scalp(az, el, k = 0.94) {
  return [SC[0] + Math.sin(az) * Math.cos(el) * SR[0] * k, SC[1] + Math.sin(el) * SR[1] * k, SC[2] + Math.cos(az) * Math.cos(el) * SR[2] * k];
}
const outAt = (az, el) => [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
const nrm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const mix3 = (...terms) => nrm(terms.reduce((s, [v, k]) => [s[0] + v[0] * k, s[1] + v[1] * k, s[2] + v[2] * k], [0, 0, 0]));
const UP = [0, 1, 0], BACK = [0, 0, -1], DOWN = [0, -1, 0], FWD = [0, 0, 1];

/** Locks -> one geometry: each { at, dir, L, w, th?, curl, bend, taper? } a flattened clump;
 *  neighbours alternate the ink sub-id (strands, not one mass). */
function lockGeometry(locks) {
  return mergeGeometries(locks.map((l, k) => sub(orientTo(clumpGeometry(l.L, l.w, l.th ?? l.w * 0.5, { curl: l.curl ?? 0.15, taper: l.taper ?? 0.8, cols: 6, rows: 3 }), l.at, l.dir, l.bend ?? BACK), k & 1)));
}
const lockAt = (az, el, dir, L, w, o = {}) => ({ at: scalp(az, el), dir, L, w, ...o });

/** The hair over the scalp, from a hairline up: `front` / `side` / `back` = the hairline's elevation
 *  there (rad up from the head's equator; a high front = a receding brow), `k` = its radius x the
 *  scalp's. */
function scalpCap(front, side, back, k = 0.98, cols = 28, rows = 8) {
  const line = (az) => side + (front - side) * Math.max(0, Math.cos(az)) + (back - side) * Math.max(0, -Math.cos(az));
  return gridGeometry(cols, rows, (s, t, o) => {
    const az = (s - 0.5) * Math.PI * 2 + Math.PI; // the seam at his front: s 0 .. 1 runs round from the back
    const el = lerp(line(az), Math.PI / 2, t * t * 0.4 + t * 0.6);
    const p = scalp(az, el, k);
    o[0] = p[0];
    o[1] = p[1];
    o[2] = p[2];
    o[3] = az * 0.1;
    o[4] = el * 0.1;
  });
}

/** a: white hair drawn back into a loose topknot with a wooden pin, long white brows, a moustache,
 *  and the long white beard on a spring under the chin. */
const KNOT_A = [0, 0.262, -0.05];
function headA(ctx) {
  const { head, M, mesh, joint } = ctx;
  mesh(head, scalpCap(0.62, 0.2, -0.45, 1.0), M.hem);
  const L = [];
  for (const s of [-1, 1]) {
    // swept up to the knot over the temples, a loose strand falling past each ear
    L.push(lockAt(s * 0.55, 0.5, mix3([UP, 0.5], [BACK, 1], [[s, 0, 0], 0.15]), 0.13, 0.032, { bend: UP, curl: 0.1 }));
    L.push(lockAt(s * 1.25, 0.18, mix3([outAt(s * 1.25, 0.18), 0.35], [DOWN, 1], [BACK, 0.15]), 0.13, 0.02, { bend: [s, 0, 0], curl: 0.25 }));
    // long brows drooping out over the eyes
    L.push({ at: [s * 0.028, 0.152, 0.097], dir: nrm([s * 0.85, -0.3, 0.3]), L: 0.055, w: 0.014, th: 0.006, curl: 0.25, bend: DOWN });
    // the moustache, down into the beard
    L.push({ at: [s * 0.012, 0.09, 0.104], dir: nrm([s * 0.5, -0.85, 0.12]), L: 0.08, w: 0.017, th: 0.008, curl: 0.12, bend: FWD });
  }
  // the nape: loose, uneven
  for (const x of [-1, 0, 1]) L.push(lockAt(Math.PI + x * 0.5, 0.05, mix3([DOWN, 1], [BACK, 0.35], [[x, 0, 0], 0.2]), 0.1 + 0.02 * (x & 1), 0.026, { bend: BACK, curl: 0.15 }));
  // stray strands out of the knot
  for (const s of [-1, 1]) L.push({ at: [KNOT_A[0] + s * 0.03, KNOT_A[1] - 0.01, KNOT_A[2] - 0.03], dir: nrm([s * 0.6, -0.5, -0.6]), L: 0.09, w: 0.014, curl: 0.3, bend: DOWN });
  mesh(head, lockGeometry(L), M.hem);
  // the topknot, loose, and the wooden pin through it
  mesh(head, sub(ellipsoidGeometry(0.052, 0.044, 0.05, { widthSegs: 10, heightSegs: 6 }).translate(...KNOT_A), 1), M.hem);
  mesh(head, boxGeometry(0.14, 0.012, 0.012, KNOT_A[0], KNOT_A[1] + 0.012, KNOT_A[2], 0, 0.5, 0.55), M.trim);
  // the beard: on a spring from under the lip to mid-chest (head space x1.08: ~0.3 m), so it hangs
  // straight down whichever way he bends, held out in front of his chest
  const base = joint(head, 0, 0.06, 0.07);
  const s0 = joint(base), L0 = 0.13, L1 = 0.15;
  const top = [];
  for (let i = 0; i < 5; i++) {
    const u = i / 2 - 1; // -1 .. 1 across the jaw
    top.push(sub(orientTo(clumpGeometry(0.16, 0.03, 0.018, { curl: 0.05, taper: 0.3, cols: 6, rows: 3 }), [u * 0.056, 0.02 + 0.028 * Math.abs(u), -0.034 * u * u], nrm([-u * 0.22, -1, 0.12]), FWD), i & 1));
  }
  mesh(s0, mergeGeometries(top), M.hem);
  const s1 = joint(s0, 0, -L0, 0);
  const low = [];
  for (let i = 0; i < 3; i++) {
    const u = i - 1;
    low.push(sub(orientTo(clumpGeometry(0.18, 0.03, 0.016, { curl: 0.08, taper: 1.0, cols: 6, rows: 3 }), [u * 0.028, 0.02, 0.004 * (1 - Math.abs(u))], nrm([-u * 0.15, -1, 0.05]), FWD), (i + 1) & 1));
  }
  mesh(s1, mergeGeometries(low), M.hem);
  return { streamers: [{ segs: [s0, s1], len: [L0, L1], out: 0.35, lag: 0.55, max: 1.3, inMax: [-0.1, -0.05], w: [0.11, 0.08, 0.04] }] };
}

/** b: an indigo headscarf over the crown, knotted at the back (two short tails), dark hair below it. */
function headB(ctx) {
  const { head, M, mesh } = ctx;
  mesh(head, scalpCap(0.78, 0.5, 0.05, 1.06), M.facing);
  mesh(head, mergeGeometries([
    sub(bandGeometry(0.112, 0.12, 0.034, 22).rotateX(0.1).translate(0, 0.2, -0.006), 1),
    sub(ellipsoidGeometry(0.032, 0.026, 0.024, { widthSegs: 8, heightSegs: 5 }).translate(0, 0.19, -0.128), 0),
  ]), M.facing);
  const L = [];
  for (const s of [-1, 1]) {
    // thick dark hair out from under the scarf: over the ears, at the temples, the brow
    L.push(lockAt(s * 1.3, 0.3, mix3([DOWN, 1], [outAt(s * 1.3, 0.3), 0.35]), 0.11, 0.03, { bend: [s, 0, 0], curl: 0.2 }));
    L.push(lockAt(s * 0.9, 0.45, mix3([DOWN, 1], [outAt(s * 0.9, 0.45), 0.3], [FWD, 0.15]), 0.08, 0.028, { bend: FWD, curl: 0.2 }));
    L.push(lockAt(s * 0.35, 0.62, mix3([DOWN, 1], [FWD, 0.5], [[s, 0, 0], 0.3]), 0.06, 0.026, { bend: FWD, curl: 0.25 }));
  }
  for (const x of [-1, -0.5, 0, 0.5, 1]) L.push(lockAt(Math.PI + x * 0.6, 0.2, mix3([DOWN, 1], [BACK, 0.35]), 0.1, 0.032, { bend: BACK, curl: 0.2 }));
  mesh(head, lockGeometry(L), M.shirt);
  const S = hang2(ctx, head, { at: [0, 0.185, -0.13], ry: Math.PI, w: [0.04, 0.034, 0.028], len: [0.06, 0.08], out: 0.3, ribbon: true, fork: true, lag: 0.9, max: 2.0, seed: 61 }, { face: M.facing, back: null, hem: M.facing });
  return { streamers: [S] };
}

/** c: grey hair parted in the middle and unbound, down the sides of his face and down his back to
 *  the waist (a sheet of hair on a spring). */
function headC(ctx) {
  const { head, M, mesh } = ctx;
  mesh(head, scalpCap(0.5, 0.15, -0.5, 1.0), M.hair);
  const L = [];
  for (const s of [-1, 1]) {
    L.push(lockAt(s * 0.22, 0.62, mix3([[s, 0, 0], 1], [DOWN, 0.8], [FWD, 0.2]), 0.12, 0.034, { bend: [s, 0, 0.3], curl: 0.15 }));
    L.push(lockAt(s * 0.85, 0.35, mix3([DOWN, 1], [outAt(s * 0.85, 0.35), 0.3]), 0.2, 0.034, { bend: [s, 0, 0], curl: 0.1, taper: 0.6 }));
    L.push(lockAt(s * 1.45, 0.25, mix3([DOWN, 1], [outAt(s * 1.45, 0.25), 0.25], [BACK, 0.2]), 0.22, 0.036, { bend: [s, 0, 0], curl: 0.08, taper: 0.6 }));
  }
  mesh(head, lockGeometry(L), M.hair);
  const S = hang2(ctx, head, { at: [0, 0.125, -0.095], ry: Math.PI, w: [0.18, 0.21, 0.18], len: [0.22, 0.25], out: 0.12, wrap: 0.12, lag: 0.5, max: 1.2, seed: 93, hemFrom: 0.45 }, { face: M.hair, back: null, hem: M.hairTip });
  return { streamers: [S] };
}

// ================================================================= the torso
/** The body's torso shell (BODY.shell; world heights). */
const SHELL = [
  { y: 1.09, rx: 0.15, rz: 0.112 },
  { y: 1.21, rx: 0.134, rz: 0.1 },
  { y: 1.3, rx: 0.158, rz: 0.11, cz: 0.008 },
  { y: 1.37, rx: 0.184, rz: 0.122, cz: 0.014 },
  { y: 1.43, rx: 0.196, rz: 0.118, cz: 0.01 },
  { y: 1.475, rx: 0.17, rz: 0.102, cz: 0.003 },
  { y: 1.505, rx: 0.092, rz: 0.074 },
  { y: 1.525, rx: 0.056, rz: 0.054 },
];
function shellAt(y) {
  const i = Math.max(1, Math.min(SHELL.length - 1, SHELL.findIndex((q) => q.y > y)));
  const A = SHELL[i - 1], B = SHELL[i], u = Math.max(0, Math.min(1, (y - A.y) / (B.y - A.y)));
  return { rx: lerp(A.rx, B.rx, u), rz: lerp(A.rz, B.rz, u), cz: lerp(A.cz ?? 0, B.cz ?? 0, u) };
}
/** SHELL in spine space, grown by d (f: a ring's changes). */
const grown = (d, f = null) => SHELL.map((r) => ({ ...r, rx: r.rx + d, rz: r.rz + d, gap: 0, ...(f ? f(r) : null), y: ySp(r.y) }));
/** A point on the torso (angle a: 0 his front, + his left; world height y), `out` m off it, in spine
 *  space (or chest space: `ch`). */
function onTorso(a, y, out, ch = false) {
  const R = shellAt(y);
  return [Math.sin(a) * (R.rx + out), ch ? yCh(y) : ySp(y), Math.cos(a) * (R.rz + out) + R.cz];
}

/** A shell that leaves out a region (`cut(a, y)`: true where cloth is missing; a = angle round him,
 *  y world height). */
function cutShell(rings, cut, cols = 40) {
  return gridGeometry(cols, (rings.length - 1) * 3, (s, t, o) => {
    const f = t * (rings.length - 1);
    const k = Math.min(rings.length - 2, Math.floor(f)), u = f - k;
    const A = rings[k], B = rings[k + 1];
    const y = lerp(A.y, B.y, u), rx = lerp(A.rx, B.rx, u), rz = lerp(A.rz, B.rz, u), cz = lerp(A.cz ?? 0, B.cz ?? 0, u);
    const aa = (s - 0.5) * Math.PI * 2;
    o[0] = Math.sin(aa) * rx;
    o[1] = y;
    o[2] = Math.cos(aa) * rz + cz;
    o[3] = aa * 0.15;
    o[4] = y;
  }, false, (i, j, pos, a, b, c, d) => {
    let x = 0, y = 0, z = 0;
    for (const v of [a, b, c, d]) {
      x += pos[v * 3];
      y += pos[v * 3 + 1];
      z += pos[v * 3 + 2];
    }
    return cut(Math.atan2(x / 4, z / 4), y / 4 + 1.035);
  });
}

/** A thin flat strip from p to q, w wide, lying on the surface (`o`: its outward direction). */
function strip(p, q, w, o = null) {
  const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2];
  const len = Math.hypot(dx, dy, dz) + 0.004;
  const g = boxGeometry(w, len, 0.008);
  const dir = new THREE.Vector3(dx, dy, dz).normalize();
  const out = o ? new THREE.Vector3(...o) : new THREE.Vector3((p[0] + q[0]) / 2, 0, (p[2] + q[2]) / 2).normalize();
  const x = new THREE.Vector3().crossVectors(dir, out).normalize();
  const z = new THREE.Vector3().crossVectors(x, dir).normalize();
  g.applyMatrix4(new THREE.Matrix4().makeBasis(x, dir, z).setPosition((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2));
  return g;
}

/** A loop round the torso in a tilted plane: world height y(a) = yc + dy sin(a) (his left side at
 *  yc + dy), `out` m off the torso. n points, spine (or chest: ch) space. */
function torsoLoop(yc, dy, out, n, ch = false) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(onTorso(a, yc + dy * Math.sin(a), out, ch));
  }
  return pts;
}

/** The bare torso in skin, grown by d; a chest drawn in. */
function bareTorso({ spine, chest, M, mesh }, d = 0, pec = 1) {
  mesh(spine, shellGeometry(grown(d - 0.002), { sub: 3, cols: 28 }), M.skin);
  const yc = yCh(1.38);
  mesh(chest, mergeGeometries([-1, 1].map((s) => sub(ellipsoidGeometry(0.075 * pec, 0.05 * pec, 0.03, { widthSegs: 10, heightSegs: 6 }).translate(s * 0.07 * pec, yc, 0.112 + d), 1))), M.skin);
}

/** A crossed collar's fold line over the front (his left lapel over the right). */
const crossFold = (x, y, z) => (z > 0 ? 0.5 + 10 * (x - 0.03 + (ySp(1.5) - y) * 0.6) : 0.5 + 0.5 * Math.sin(x * 30 + y * 6));

/** A patch on the robe: the torso between angles a0 .. a1 and heights y0 .. y1 (world), `out` proud. */
function patch(a0, a1, y0, y1, out) {
  const r0 = shellAt(y0), r1 = shellAt(y1);
  return sub(shellGeometry([
    { y: ySp(y0), rx: r0.rx + out, rz: r0.rz + out, cz: r0.cz },
    { y: ySp(y1), rx: r1.rx + out, rz: r1.rz + out, cz: r1.cz },
  ], { sub: 2, cols: 4, arc: [a0, a1] }), 1);
}

/**
 * One tier of the straw cape (chest space): lofted through `rings` (world heights, TOP first) between
 * angles a0 .. a1 (0 his front, + his left), its lowest row cut into a shaggy hem (straw ends of
 * uneven length, `teeth` m) and flared out a little; straw drawn down it in fold lines.
 */
function strawTier(rings, a0, a1, { teeth = 0.035, cols = 44, seed = 1 } = {}) {
  const r = rng(seed);
  const hem = Array.from({ length: cols + 1 }, (_, i) => teeth * (i & 1 ? 0.2 * r() : 0.55 + 0.45 * r()));
  const ridge = Array.from({ length: 7 }, () => r() * 1.5);
  const rows = (rings.length - 1) * 2;
  const g = gridGeometry(cols, rows, (s, t, o) => {
    const f = t * (rings.length - 1);
    const k = Math.min(rings.length - 2, Math.floor(f)), u = f - k;
    const A = rings[k], B = rings[k + 1];
    const a = lerp(a0, a1, s);
    const last = t > 0.999;
    const i = Math.round(s * cols);
    // bunched straw: ridges down the tier, deeper toward the hem (the key light picks them out)
    const fl = (last ? 0.015 + hem[i] * 0.4 : 0) + 0.014 * t * (0.5 + 0.5 * Math.sin(a * 21 + ridge[i % 7])) + 0.03 * Math.max(0, t - 0.6) / 0.4;
    const rx = lerp(A.rx, B.rx, u) + fl, rz = lerp(A.rz, B.rz, u) + fl, cz = lerp(A.cz ?? 0, B.cz ?? 0, u);
    const y = yCh(lerp(A.y, B.y, u)) - (last ? hem[i] : 0);
    o[0] = Math.sin(a) * rx;
    o[1] = y;
    o[2] = Math.cos(a) * rz + cz;
    o[3] = (a - Math.PI) * 0.15;
    o[4] = y;
  }, true);
  const ph = seed * 1.7;
  return foldLines(g, (x, y, z) => 0.5 + 0.7 * Math.sin(Math.atan2(x, z) * 26 + ph + 2.5 * Math.sin(y * 30 + x * 9)));
}

/** a: the straw rain cape over the shoulders, three tiers (the middle one a shade darker: `welt`),
 *  open in front (the beard and the robe show
 *  between its edges), the lowest tier at his back only and ending above the hand held there. */
function strawCape({ chest, M, mesh }) {
  const tiers = [
    // the top: from round the neck out over the shoulders
    { rings: [{ y: 1.548, rx: 0.1, rz: 0.088, cz: -0.014 }, { y: 1.518, rx: 0.19, rz: 0.13, cz: -0.01 }, { y: 1.482, rx: 0.28, rz: 0.175 }, { y: 1.44, rx: 0.32, rz: 0.2 }, { y: 1.395, rx: 0.335, rz: 0.21 }], open: 0.5, teeth: 0.035, seed: 11 },
    // the middle: over the upper arms
    { rings: [{ y: 1.455, rx: 0.31, rz: 0.195 }, { y: 1.37, rx: 0.34, rz: 0.215 }, { y: 1.29, rx: 0.35, rz: 0.225 }], open: 0.62, teeth: 0.045, seed: 23, mat: 'welt' },
    // the lowest: down his back
    { rings: [{ y: 1.36, rx: 0.335, rz: 0.212 }, { y: 1.27, rx: 0.345, rz: 0.226 }, { y: 1.2, rx: 0.35, rz: 0.235 }], a: [Math.PI - 1.25, Math.PI + 1.25], teeth: 0.05, seed: 37, cols: 30 },
  ];
  for (const T of tiers) {
    const [a0, a1] = T.a ?? [T.open, Math.PI * 2 - T.open];
    const g = strawTier(T.rings, a0, a1, { teeth: T.teeth, seed: T.seed, cols: T.cols ?? 44 });
    mesh(chest, g, M[T.mat ?? 'leather']);
    mesh(chest, g.clone(), M.collarIn);
  }
  // the cord that ties it at his throat
  mesh(chest, mergeGeometries([-1, 1].map((s) => strip([s * 0.05, yCh(1.53), 0.085], [s * 0.012, yCh(1.47), 0.118], 0.012, [0, 0.3, 1]))), M.shirt);
}

function chestA(ctx) {
  const { spine, chest, M, mesh } = ctx;
  // the hemp robe, crossed at the front; its collar band
  mesh(spine, foldLines(shellGeometry(grown(0.012), { sub: 3, cols: 28 }), crossFold), M.coat);
  mesh(chest, sub(bandGeometry(0.098, 0.088, 0.03, 20).translate(0, yCh(1.5), 0.006), 1), M.shirt);
  // patches: the left breast, the right side, the small of the back (below the hand), the left back
  mesh(spine, mergeGeometries([
    patch(0.25, 0.7, 1.2, 1.31, 0.017),
    patch(-1.7, -1.25, 1.12, 1.24, 0.017),
    patch(2.2, 2.7, 1.1, 1.19, 0.017),
    patch(-2.9, -2.45, 1.24, 1.35, 0.017),
  ]), M.facing);
  strawCape(ctx);
  return {};
}

/** b: broad, bare-chested under a sleeveless hemp vest open down the front; a rope across his body
 *  (right shoulder -> left hip) carrying a bundle of firewood on his back. */
function chestB(ctx) {
  const { spine, chest, M, mesh } = ctx;
  bareTorso(ctx, 0.018, 1.15);
  const base = grown(0.036, (r) => (r.y >= 1.42 && r.y < 1.5 ? { rx: r.rx - 0.045 } : null));
  const vest = [{ y: ySp(1.05), rx: 0.188, rz: 0.15, cz: 0 }, ...base].map((r) => ({ ...r, gap: lerp(0.045, 0.085, Math.max(0, (r.y - ySp(1.05)) / 0.46)) }));
  const vFold = (x, y, z) => 0.5 + 0.6 * Math.sin(Math.atan2(x, z) * 7 + y * 5);
  const vg = foldLines(shellGeometry(vest, { sub: 3, cols: 30 }), vFold);
  mesh(spine, vg, M.coat);
  mesh(spine, vg.clone(), M.lining);
  // the rope across his body (over his right shoulder, under his left arm), over the vest
  const P = torsoLoop(1.31, -0.19, 0.05, 40);
  mesh(spine, mergeGeometries(P.map((p, i) => sub(strip(p, P[(i + 1) % P.length], 0.03), i & 1))), M.leather);
  // the firewood: a bundle of sticks on his back, its top over his right shoulder, tied twice
  const b0 = new THREE.Vector3(0.04, yCh(1.22), -0.235), b1 = new THREE.Vector3(-0.08, yCh(1.7), -0.265);
  const D = b1.clone().sub(b0).normalize();
  const X = new THREE.Vector3(1, 0, 0).addScaledVector(D, -D.x).normalize(), Z = new THREE.Vector3().crossVectors(X, D);
  const r = rng(271);
  const sticks = [];
  [[-0.05, 0], [0, 0.005], [0.05, 0], [-0.026, 0.038], [0.026, 0.036], [-0.024, -0.032], [0.028, -0.03]].forEach(([ox, oz], i) => {
    const t0 = (r() - 0.5) * 0.06, len = 0.4 + 0.1 * r(), rad = 0.018 + 0.008 * r();
    const p = b0.clone().addScaledVector(X, ox).addScaledVector(Z, oz).addScaledVector(D, t0);
    const g = limbGeometry({ length: len, r0: rad, r1: rad * 0.85, radial: 7, rings: 3, capSegs: 1 });
    sticks.push(sub(orientTo(g, [p.x, p.y, p.z], [D.x, D.y, D.z], [X.x, X.y, X.z]), i & 1));
  });
  mesh(chest, mergeGeometries(sticks), M.collar);
  const ties = [0.1, 0.32].map((t, k) => {
    const p = b0.clone().addScaledVector(D, t);
    return sub(bandGeometry(0.083, 0.064, 0.03, 16).applyMatrix4(new THREE.Matrix4().makeBasis(X, D, Z).setPosition(p)), k & 1);
  });
  mesh(chest, mergeGeometries(ties), M.leather);
  return {};
}

/** c: lean, a faded robe wrapped over the left shoulder (the right shoulder and breast bare), its
 *  edge in a darker band; the great string of beads across the chest (left shoulder -> right hip). */
function chestC(ctx) {
  const { spine, chest, M, mesh } = ctx;
  bareTorso(ctx, -0.01, 0.9);
  const rings = grown(0.0, (r) => (r.y >= 1.42 && r.y < 1.5 ? { rx: r.rx - 0.012 } : null));
  const r = rng(1013);
  const jag = Array.from({ length: 41 }, () => (r() - 0.5) * 0.008);
  const edgeY = (a) => (a > -1.5 ? lerp(1.5, 1.28, (0.35 - a) / 1.85) : lerp(1.28, 1.44, (-1.5 - a) / 1.45));
  const wrapCut = (a, y) => (a > 0.35 || a < -2.95 ? false : y > edgeY(a) + jag[Math.round(((a + Math.PI) / (Math.PI * 2)) * 40)]);
  const wrapFold = (x, y, z) => (z > 0 ? 0.5 + 9 * (-x - 0.02 + (ySp(1.48) - y) * 0.7) : 0.5 + 0.6 * Math.sin(x * 40 + y * 8));
  mesh(spine, foldLines(cutShell(rings, wrapCut, 44), wrapFold), M.coat);
  const pts = [];
  for (let k = 0; k <= 12; k++) {
    const a = lerp(0.35, -2.95, k / 12);
    pts.push(onTorso(a, edgeY(a), 0.006));
  }
  mesh(spine, mergeGeometries(pts.slice(0, -1).map((p, k) => sub(strip(p, pts[k + 1], 0.032), k & 1))), M.facing);
  // the beads: big wooden beads in a loop from his left shoulder across his chest to his right hip
  const B = torsoLoop(1.3, 0.2, 0.038, 30, true);
  mesh(chest, mergeGeometries(B.map((p, i) => sub(ellipsoidGeometry(0.031, 0.031, 0.026, { widthSegs: 8, heightSegs: 5 }).translate(...p), i & 1))), M.trim);
  return {};
}

// ================================================================= the arms
/** Cloth wraps round a limb (fore / shin space: y0 -> y1 going down, radius rf(t)). */
function wraps(y0, y1, n, rf) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1), y = lerp(y0, y1, t), rr = rf(t);
    parts.push(sub(limb({ length: (y0 - y1) / Math.max(1, n - 1) + 0.012, r0: rr + 0.002, r1: rr, radial: 10, rings: 2, capSegs: 1 }).translate(0, y + 0.006, 0), i & 1));
  }
  return mergeGeometries(parts);
}

/**
 * The RIGHT hand open, in sword space (origin = the grip centre at the end of the forearm, +Z = the
 * fingers, +Y = the palm's face: the flat the poses turn toward the opponent, swF): a thin palm,
 * four fingers pressed together, the thumb along the palm's inner (-X) edge. `k` = BODY.hand.
 */
function openPalm(k) {
  const parts = [sub(ellipsoidGeometry(0.039 * k, 0.017 * k, 0.047 * k, { widthSegs: 12, heightSegs: 6 }).translate(0, 0, 0.012 * k), 0)];
  const fingers = [[-0.0265, 0.072], [-0.009, 0.08], [0.009, 0.075], [0.026, 0.06]];
  fingers.forEach(([x, len], i) => {
    const r = 0.0098 * k;
    parts.push(sub(limb({ length: len * k, r0: r, r1: r * 0.82, radial: 6, rings: 3, capSegs: 2 }).rotateX(-Math.PI / 2).rotateX(-0.1).translate(x * k, 0.002 * k, 0.045 * k), (i + 1) & 1));
  });
  parts.push(sub(orientTo(limbGeometry({ length: 0.058 * k, r0: 0.0125 * k, r1: 0.0095 * k, radial: 6, rings: 3, capSegs: 2 }), [-0.034 * k, 0.005 * k, -0.014 * k], nrm([-0.22, 0.12, 1]), UP), 1));
  return mergeGeometries(parts);
}

/** The hands, the wrist under the open palm, the free hand (shared by the three outfits). */
function hands(ctx, wristR = 1) {
  const { arms, sword, M, DIM, BODY, mesh } = ctx;
  const HK = BODY.hand;
  mesh(sword, openPalm(HK), M.skin);
  mesh(arms.R.fore, ellipsoidGeometry(0.034 * HK * wristR, 0.042 * HK, 0.036 * HK * wristR, { widthSegs: 10, heightSegs: 6 }), M.skin, 0, -DIM.foreArm + 0.022, 0.002);
  return buildFreeHand(ctx, M.skin);
}

/** The arm's skin (k: girth), the upper arm optional (a sleeve over it). */
function bareArm(ctx, side, { upper = true, k = 0, bulge = 0.01 } = {}) {
  const { arms, M, DIM, BODY, mesh } = ctx;
  const [ua0, ua1] = BODY.upperArm, [fa0, fa1] = BODY.foreArm;
  const A = arms[side < 0 ? 'R' : 'L'];
  if (upper) {
    mesh(A.upper, mergeGeometries([
      sub(limb({ length: DIM.upperArm, r0: ua0 + k, r1: ua1 + k, bulge }), 1),
      sub(ellipsoidGeometry(BODY.deltoid[0] + k, BODY.deltoid[1] + k * 0.5, BODY.deltoid[2] + k, { widthSegs: 12, heightSegs: 8 }).translate(side * 0.01, -0.02, 0), 1),
    ]), M.skin);
  }
  mesh(A.fore, mergeGeometries([
    sub(limb({ length: 0.09, r0: ua1 + k, r1: ua1 + k - 0.004 }), 1),
    sub(limb({ length: DIM.foreArm - 0.07, r0: fa0 + k * 0.8, r1: fa1 + k * 0.5 - 0.004, radial: 10, rings: 3, bulge: 0.004 }).translate(0, -0.04, 0), 1),
  ]), M.skin);
}

/** a: the robe's sleeves rolled to the elbow (a fat cuff), bare wiry forearms, beads on the right wrist. */
function armsA(ctx) {
  const { arms, M, DIM, BODY, mesh } = ctx;
  const [ua0, ua1] = BODY.upperArm, fa1 = BODY.foreArm[1];
  for (const side of [-1, 1]) {
    const { upper } = arms[side < 0 ? 'R' : 'L'];
    mesh(upper, foldLines(mergeGeometries([
      limb({ length: DIM.upperArm - 0.03, r0: ua0 + 0.02, r1: ua1 + 0.026, bulge: 0.012 }),
      ellipsoidGeometry(BODY.deltoid[0] + 0.02, BODY.deltoid[1] + 0.012, BODY.deltoid[2] + 0.02, { widthSegs: 12, heightSegs: 8 }).translate(side * 0.012, -0.02, 0),
    ]), (x, y, z) => 0.5 + 0.6 * Math.sin(Math.atan2(x, z) * 3 + y * 14)), M.coat);
    mesh(upper, sub(limb({ length: 0.06, r0: ua1 + 0.034, r1: ua1 + 0.03, radial: 12, rings: 2, capSegs: 1 }).translate(0, -DIM.upperArm + 0.055, 0), 1), M.facing);
    bareArm(ctx, side, { upper: false, k: -0.004 });
  }
  // the beads on the right wrist
  const yb = -DIM.foreArm + 0.05, rb = fa1 + 0.004;
  mesh(arms.R.fore, mergeGeometries(Array.from({ length: 11 }, (_, i) => {
    const a = (i / 11) * Math.PI * 2;
    return sub(ellipsoidGeometry(0.0115, 0.011, 0.0115, { widthSegs: 6, heightSegs: 4 }).translate(Math.sin(a) * rb, yb, Math.cos(a) * rb), i & 1);
  })), M.trim);
  const free = hands(ctx);
  return { offHand: free.offHand, keep: free.keep };
}

/** b: thick bare arms, the forearms bound in cloth from the elbow to the wrist. */
function armsB(ctx) {
  const { arms, M, DIM, BODY, mesh } = ctx;
  const [fa0, fa1] = BODY.foreArm;
  for (const side of [-1, 1]) {
    bareArm(ctx, side, { k: 0.014, bulge: 0.022 });
    const y0 = -0.06, y1 = -DIM.foreArm + 0.045;
    mesh(arms[side < 0 ? 'R' : 'L'].fore, wraps(y0, y1, 8, (t) => lerp(fa0 + 0.016, fa1 + 0.01, t)), M.hem);
  }
  const free = hands(ctx, 1.08);
  return { offHand: free.offHand, keep: free.keep };
}

/** c: thin bare arms, the robe's end over the left upper arm. */
function armsC(ctx) {
  const { arms, M, BODY, mesh } = ctx;
  const [ua0] = BODY.upperArm;
  for (const side of [-1, 1]) bareArm(ctx, side, { k: -0.008, bulge: 0.004 });
  mesh(arms.L.upper, foldLines(mergeGeometries([
    limb({ length: 0.15, r0: ua0 + 0.012, r1: ua0 + 0.006, radial: 12, rings: 3, capSegs: 1 }),
    ellipsoidGeometry(BODY.deltoid[0] + 0.01, BODY.deltoid[1] + 0.006, BODY.deltoid[2] + 0.01, { widthSegs: 12, heightSegs: 8 }).translate(0.01, -0.02, 0),
  ]), (x, y, z) => 0.5 + 0.6 * Math.sin(Math.atan2(x, z) * 3 + y * 20)), M.coat);
  const free = hands(ctx, 0.92);
  return { offHand: free.offHand, keep: free.keep };
}

// ================================================================= the legs
/** A bare foot (foot space). */
function bareFoot(F, k = 1) {
  return mergeGeometries([
    ellipsoidGeometry(F.r[0] * 0.82 * k, F.r[1] * 0.62, F.r[2] * 0.9, { widthSegs: 10, heightSegs: 6 }).translate(F.c[0], F.c[1] - 0.014, F.c[2]),
    sub(ellipsoidGeometry(0.034 * k, 0.04, 0.036, { widthSegs: 8, heightSegs: 5 }).translate(0, 0.01, -0.01), 1),
  ]);
}

function buildLegs(ctx, look) {
  const { pelvis, legs, M, DIM, BODY, mesh } = ctx;
  const [hx, hy, hz] = BODY.hips.r;
  const [th0, th1] = BODY.thigh, [sh0, sh1] = BODY.shin, F = BODY.foot;
  const kk = look === 'b' ? 0.012 : look === 'c' ? -0.008 : 0;
  mesh(pelvis, orient.up(ellipsoidGeometry(hx + 0.012 + kk, hz + 0.012 + kk, hy + 0.01)), M.pants, ...BODY.hips.c);
  for (const side of [-1, 1]) {
    const { thigh, shin, foot } = legs[side < 0 ? 'R' : 'L'];
    const fold = (x, y, z) => 0.5 + 0.6 * Math.sin(Math.atan2(x, z) * 3 + y * 9 + side);
    mesh(thigh, foldLines(limb({ length: DIM.thigh, r0: th0 + 0.016 + kk, r1: th1 + 0.022 + kk, bulge: 0.02 }), fold), M.pants);
    if (look === 'a') {
      // hemp trousers rolled up under the knee, bare shins, bare feet
      mesh(shin, mergeGeometries([
        limb({ length: 0.17, r0: th1 + 0.022, r1: sh0 + 0.016, bulge: 0.006 }),
        sub(limb({ length: 0.04, r0: sh0 + 0.024, r1: sh0 + 0.022, radial: 10, rings: 2, capSegs: 1 }).translate(0, -0.15, 0), 1),
      ]), M.pants);
      mesh(shin, limb({ length: DIM.shin - 0.17, r0: sh0 - 0.008, r1: sh1 - 0.012, bulge: 0.006 }).translate(0, -0.15, 0), M.skin);
      mesh(foot, bareFoot(F), M.skin);
    } else if (look === 'b') {
      // loose trousers, the shins wrapped, straw sandals
      mesh(shin, foldLines(limb({ length: 0.21, r0: th1 + 0.026, r1: sh0 + 0.022, bulge: 0.01 }), fold), M.pants);
      mesh(shin, wraps(-0.18, -DIM.shin + 0.05, 7, (t) => lerp(sh0 + 0.008, sh1 + 0.002, t) + 0.006), M.hem);
      mesh(foot, bareFoot(F, 1.05), M.skin);
      mesh(foot, mergeGeometries([
        boxGeometry(F.r[0] * 1.9, 0.016, F.r[2] * 2.0, F.c[0], F.c[1] - F.r[1] * 0.75, F.c[2]),
        sub(bandGeometry(F.r[0] * 0.9, F.r[1] * 0.75, 0.018, 12).rotateX(Math.PI / 2).translate(F.c[0], F.c[1] - 0.01, F.c[2] + 0.03), 1),
      ]), M.piping);
    } else {
      // thin trousers under the robe, bare feet
      mesh(shin, limb({ length: DIM.shin - 0.05, r0: th1 + 0.01, r1: sh1 + 0.006 }), M.pants);
      mesh(foot, bareFoot(F, 0.95), M.skin);
    }
  }
  return {};
}

// ================================================================= the waist
/** a: the robe's skirt to the shin, ragged. */
const ROBE_A = [
  { az: 0.42, w: [0.17, 0.22, 0.27], len: [0.3, 0.3], strips: [0.05, 0.08], fork: [0, 1], out: 0.006, flare: 0.08, skew: 0.6 },
  { az: -0.42, w: [0.17, 0.22, 0.27], len: [0.3, 0.29], strips: [0.07, 0.04], fork: [1, 0], out: 0, flare: 0.08, skew: -0.6 },
  { az: 1.45, w: [0.12, 0.16, 0.2], len: [0.29, 0.28], strips: [0.06], fork: [1], out: 0.002, flare: 0.25 },
  { az: -1.45, w: [0.12, 0.16, 0.2], len: [0.29, 0.28], strips: [0.05], fork: [0], out: 0.002, flare: 0.25 },
  { az: 2.45, w: [0.16, 0.23, 0.29], len: [0.31, 0.31], strips: [0.08, 0.05], fork: [0, 1], out: 0.006, flare: 0.16, skew: -0.4 },
  { az: -2.45, w: [0.16, 0.23, 0.29], len: [0.31, 0.3], strips: [0.05, 0.07], fork: [1, 0], out: 0.006, flare: 0.16, skew: 0.4 },
];
/** c: the robe to the ankle. */
const ROBE_C = [
  { az: 0.4, w: [0.17, 0.22, 0.27], len: [0.4, 0.44], strips: [], fork: [], out: 0.006, flare: 0.06, skew: 0.6 },
  { az: -0.4, w: [0.17, 0.22, 0.27], len: [0.4, 0.44], strips: [], fork: [], out: 0, flare: 0.06, skew: -0.6 },
  { az: 1.45, w: [0.12, 0.15, 0.18], len: [0.38, 0.42], strips: [], fork: [], out: 0.002, flare: 0.2 },
  { az: -1.45, w: [0.12, 0.15, 0.18], len: [0.38, 0.42], strips: [], fork: [], out: 0.002, flare: 0.2 },
  { az: 2.45, w: [0.16, 0.22, 0.27], len: [0.41, 0.45], strips: [], fork: [], out: 0.006, flare: 0.12, skew: -0.4 },
  { az: -2.45, w: [0.16, 0.22, 0.27], len: [0.41, 0.45], strips: [], fork: [], out: 0.006, flare: 0.12, skew: 0.4 },
];

/** A cloth band round his waist (spine space, world height y), a knot at his front right. */
function belt(ctx, y, grow, h, mat, twist = 0) {
  const { spine, mesh } = ctx;
  const R = shellAt(y);
  let g = bandGeometry(R.rx + grow, R.rz + grow, h, 32).translate(0, ySp(y), R.cz);
  if (twist) g = foldLines(g, (x, yy, z) => 0.5 + 0.7 * Math.sin(Math.atan2(x, z) * twist + yy * 90));
  mesh(spine, mergeGeometries([g, sub(ellipsoidGeometry(0.032, 0.028, 0.02, { widthSegs: 8, heightSegs: 5 }).translate(-0.075, ySp(y), R.rz + R.cz + grow + 0.008), 1)]), mat);
}

function waistA(ctx) {
  const { pelvis, M, mesh, joint } = ctx;
  const { coat } = panelSkirt(ctx, ROBE_A, { seed: 500 });
  belt(ctx, 1.17, 0.026, 0.055, M.shirt);
  const tail = hang2(ctx, pelvis, { at: [-0.075, yPv(1.15), 0.135], ry: -0.45, w: [0.045, 0.04, 0.034], len: [0.1, 0.12], out: 0.12, ribbon: true, fork: true, lag: 0.9, max: 2.0, seed: 41 }, { face: M.shirt, back: null, hem: M.shirt });
  // the wine gourd on a cord from the sash at his left hip, swinging
  const az = 1.95;
  const base = joint(pelvis, Math.sin(az) * 0.2, yPv(1.15), Math.cos(az) * 0.15);
  base.rotation.y = az;
  const s0 = joint(base), L0 = 0.07, L1 = 0.17;
  mesh(s0, limb({ length: L0 + 0.01, r0: 0.005, r1: 0.005, radial: 5, rings: 1, capSegs: 1 }), M.shirt);
  const s1 = joint(s0, 0, -L0, 0);
  const z = 0.035;
  mesh(s1, mergeGeometries([
    sub(ellipsoidGeometry(0.031, 0.035, 0.031, { widthSegs: 10, heightSegs: 6 }).translate(0, -0.045, z), 0),
    sub(ellipsoidGeometry(0.05, 0.056, 0.05, { widthSegs: 12, heightSegs: 7 }).translate(0, -0.118, z), 1),
  ]), M.piping);
  mesh(s1, mergeGeometries([
    ellipsoidGeometry(0.011, 0.014, 0.011, { widthSegs: 6, heightSegs: 4 }).translate(0, -0.006, z),
    sub(bandGeometry(0.02, 0.02, 0.012, 10).translate(0, -0.075, z), 1),
  ]), M.shirt);
  return { coat, streamers: [tail, { segs: [s0, s1], len: [L0, L1], out: 0.18, lag: 0.45, max: 1.1, w: [0.02, 0.1, 0.1] }] };
}

function waistB(ctx) {
  const { pelvis, spine, M, mesh } = ctx;
  // the rope belt (twisted), its knot and two ends hanging
  belt(ctx, 1.08, 0.045, 0.034, M.leather, 70);
  const R = shellAt(1.08), zf = R.rz + R.cz + 0.05;
  mesh(spine, mergeGeometries([-1, 1].map((s) => limb({ length: 0.13 + 0.03 * s, r0: 0.009, r1: 0.007, radial: 5, rings: 2, capSegs: 1 }).rotateZ(0.12 * s).translate(-0.075 + s * 0.012, ySp(1.07), zf))), M.leather);
  // the empty axe sling at his right hip, behind: a dark leather frog with nothing in it
  const az = -2.0, x = Math.sin(az) * 0.2, z = Math.cos(az) * 0.16;
  mesh(pelvis, mergeGeometries([
    boxGeometry(0.05, 0.09, 0.012, x, yPv(1.05), z, 0, az, 0),
    sub(bandGeometry(0.036, 0.024, 0.04, 12).rotateZ(0.5).translate(x * 1.18, yPv(0.98), z * 1.18), 1),
  ]), M.trim);
  return {};
}

function waistC(ctx) {
  const { pelvis, M } = ctx;
  const { coat } = panelSkirt(ctx, ROBE_C, { seed: 900 });
  belt(ctx, 1.17, 0.018, 0.02, M.leather, 40);
  const cord = hang2(ctx, pelvis, { at: [-0.075, yPv(1.15), 0.128], ry: -0.4, w: [0.016, 0.016, 0.014], len: [0.14, 0.16], out: 0.1, ribbon: true, fork: false, lag: 0.9, max: 2.0, seed: 57 }, { face: M.leather, back: null, hem: M.leather });
  return { coat, streamers: [cord] };
}

// ================================================================= the items
/** Each item's build for the chosen outfit; the first one turns the rig to the dragon look (a, b, c)
 *  and opens his dressing record (look.js). */
function opted(table) {
  return (ctx) => {
    const L = hermitLook();
    if (L.art) toDragonLook(ctx, HERMIT_ART[L.base]);
    dressOf(ctx.root, L.id);
    return table[L.base](ctx, L.base);
  };
}

/** The set (registered into the hero's gear registry on import: gear/index.js registerItem). */
export const HERMIT_ITEMS = [
  { id: 'hermit.head', slot: 'head', name: 'Hermit\'s Hair', hidesHair: true, build: opted({ a: headA, b: headB, c: headC }) },
  { id: 'hermit.chest', slot: 'chest', name: 'Hermit\'s Robe', build: opted({ a: chestA, b: chestB, c: chestC }) },
  { id: 'hermit.arms', slot: 'arms', name: 'Open Hands', build: opted({ a: armsA, b: armsB, c: armsC }) },
  { id: 'hermit.legs', slot: 'legs', name: 'Bare Feet', build: opted({ a: buildLegs, b: buildLegs, c: buildLegs }) },
  { id: 'hermit.waist', slot: 'waist', name: 'Sash and Skirt', build: opted({ a: waistA, b: waistB, c: waistC }) },
];
for (const item of HERMIT_ITEMS) registerItem(item);

/** What he wears (no `weapon`: he is bare-handed; the right palm hangs on the sword joint). */
export const HERMIT_LOADOUT = Object.freeze({
  head: 'hermit.head',
  chest: 'hermit.chest',
  shoulders: null,
  arms: 'hermit.arms',
  legs: 'hermit.legs',
  waist: 'hermit.waist',
  back: null,
  weapon: null,
});

/** His "blade": the right hand open, as a segment along the sword joint's +Z (duelist.js kit.blade):
 *  from the heel of the palm (guard) to the middle fingertip (tip), metres. Measured on
 *  openPalm(BODY.hand 1.12). */
export const HAND = Object.freeze({ guard: -0.04, tip: 0.15 });
