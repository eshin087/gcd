import * as THREE from 'three';
import { ellipsoidGeometry } from '../../../render/glyphGeometry.js';
import { registerItem } from '../../player/gear/index.js';
import { buildFreeHand } from '../../player/gear/hands.js';
import { hangSheet, panelSkirt } from '../../player/gear/sheet.js';
import {
  gridGeometry, shellGeometry, tatterStrip, bandGeometry, boxGeometry, mergeGeometries, sub, foldLines, ribbonCrease, lerp, limb,
  gripFist, orient, orientTo, clumpGeometry, partGeometry, rng,
} from '../../player/heroGeo.js';
import { toDragonLook } from '../ashDisciple/bodyArt.js';
import { ASC_ART } from './bodyArt.js';
import { ascLookNow, dressOf, at } from './look.js';

// Tian Lei's gear: a bare-handed fighter on the hero's skeleton (built by the same buildHero(U,
// loadout), driven by the same animator), no weapon. Three outfits for the owner to pick from
// (`?ascLook=a|b|c|d`, look.js ascLookNow; read when his rig is built), each with its hair by form:
//   a  the Challenger's tunic: a sleeveless crossed-collar tunic with a short split skirt, a black
//      sash whose tails fly, loose trousers gathered into shin wraps, soft boots, wrapped wrists.
//      Hair: a topknot and a short tail (form 1); the knot's hair rises in a gold plume (2); the
//      plume taller and sharper, spikes swept back from the temples and the nape (3).
//   b  the brawler: bare-chested, a torn half-robe hanging from a red sash, wraps from the elbow to
//      the knuckles, dark trousers, wrapped bare feet. Hair: a loose shaggy mane to the shoulders
//      (1); blown up and back (2); fuller, stiffer, long strands down the back (3).
//   c  the wandering monk: a cross-wrapped robe over the left shoulder (the right bare), a shoulder
//      cloth that streams behind, big prayer beads, a knee-length robe skirt, wrapped shins and
//      sandals. Hair: one long braid down the back (1); undone, a crest of risen gold blades (2);
//      the crest taller, a mane of stiff spikes down the back (3).
//   d  outfit a drawn through the wyrm's art path (bodyArt.js ASC_ART; the dragon-look twin).
//
// His materials are his own instances (look.js tintAscendant writes the colours): `coat` / `lining`
// = the tunic / half-robe / monk robe (outside / inside), `leather` = the sash (and the prayer
// beads' cord), `hem` = the cloth wraps (wrists, shins, feet), `pants` = the trousers, `collar` =
// the soft boots, `skin` = the bare arms, chest and face, `facing` = the monk's shoulder cloth, `trim`
// = the prayer beads, `shirt` = his DARK hair (form 1: part 3, white ink lines; the `hair` part's ink
// lines are gold for every rig), `hair` / `hairTip` = his GOLD hair (forms 2 - 3), `flask` = the
// light that catches his edges (form 2) and burns in his fists and eyes (form 3).
//
// Every piece that changes with his form is kept out of the static merge and registered with the
// forms it shows in (look.js `at`); dressAscendant(d, dt) switches them when d.phase changes.

const ySp = (h) => h - 1.035; // world idle height → spine space (REST.spine)
const yPv = (h) => h - 0.955; // → pelvis space (REST.pelvis)
const yCh = (h) => h - 1.225; // → chest space (REST.chest)

/** The geometry with its back face too (a ribbon or a strip in a one-sided material): a copy with
 *  the winding reversed and the normals turned. */
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

/** A mesh helper that also lists what it made (to show / hide an item's pieces by form). */
function capture(ctx) {
  const made = [];
  const mesh = (...a) => {
    const m = ctx.mesh(...a);
    made.push(m);
    return m;
  };
  return { made, cx: { ...ctx, mesh } };
}

// ================================================================= the hair
// Head space (before BODY.headScale): the scalp is the ellipsoid BODY.head (c [0, 0.154, -0.007],
// r [0.105, 0.118, 0.112]); the face looks down +Z; his left is +X.
const SC = [0, 0.154, -0.007], SR = [0.105, 0.118, 0.112];
/** A point on the scalp (az: 0 = his front, + = his left; el: up from the equator), pushed in by `k`. */
function scalp(az, el, k = 0.94) {
  return [SC[0] + Math.sin(az) * Math.cos(el) * SR[0] * k, SC[1] + Math.sin(el) * SR[1] * k, SC[2] + Math.cos(az) * Math.cos(el) * SR[2] * k];
}
/** The scalp's outward direction there. */
const outAt = (az, el) => [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
const nrm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const mix3 = (...terms) => nrm(terms.reduce((s, [v, k]) => [s[0] + v[0] * k, s[1] + v[1] * k, s[2] + v[2] * k], [0, 0, 0]));
const UP = [0, 1, 0], BACK = [0, 0, -1], DOWN = [0, -1, 0], FWD = [0, 0, 1];

/**
 * A head of locks → { mass, tips } geometries: each lock { at: [x, y, z], dir, L, w, th?, curl,
 * bend, taper? } is a flattened clump (heroGeo clumpGeometry) from `at` along `dir`, its tip curling
 * toward `bend`; the root 45 % in the mass material, the rest in the tips'. Neighbours alternate the
 * ink sub-id (locks, not one mass).
 */
function lockGeometry(locks) {
  const mass = [], tips = [];
  locks.forEach((l, k) => {
    const th = l.th ?? l.w * 0.5;
    for (const [t0, t1, out] of [[0, 0.45, mass], [0.45, 1, tips]]) {
      const g = clumpGeometry(l.L, l.w, th, { t0, t1, curl: l.curl ?? 0.15, taper: l.taper ?? 0.8, cols: 6, rows: 2 });
      out.push(sub(orientTo(g, l.at, l.dir, l.bend ?? BACK), k & 1));
    }
  });
  return { mass: mergeGeometries(mass), tips: mergeGeometries(tips) };
}

/** Mirror a list of locks to his other side (x → −x) and add both. */
const both = (list) => list.flatMap((l) => [l, { ...l, at: [-l.at[0], l.at[1], l.at[2]], dir: [-l.dir[0], l.dir[1], l.dir[2]], bend: l.bend ? [-l.bend[0], l.bend[1], l.bend[2]] : undefined }]);

/** A lock rooted on the scalp at (az, el), pointing `dir` (or the sweep `f(out)`). */
const lockAt = (az, el, dir, L, w, o = {}) => ({ at: scalp(az, el), dir: typeof dir === 'function' ? dir(outAt(az, el)) : dir, L, w, ...o });

// --- option a: the topknot
const KNOT = [0, 0.272, -0.06]; // the topknot's centre (head space)
function hairA(form) {
  const L = [];
  if (form === 1) {
    // a short fringe over the brow, a lock at each temple: the rest is drawn back into the knot
    for (const s of [-1, 1]) {
      L.push(lockAt(s * 0.22, 0.5, mix3([outAt(s * 0.22, 0.5), 0.4], [DOWN, 1], [[s * 0.3, 0, 0], 0.3]), 0.07, 0.022, { bend: FWD, curl: 0.2 }));
      L.push(lockAt(s * 1.15, 0.12, mix3([outAt(s * 1.15, 0.12), 0.25], [DOWN, 1]), 0.1, 0.018, { bend: [s, 0, 0], curl: 0.15 }));
    }
    return L;
  }
  const big = form === 3;
  // the plume: the knot's hair risen out of the tie, fanning up and back like a flame (form 3:
  // fewer, broader, longer blades, sharp-pointed and straight)
  const n = big ? 12 : 11;
  const r = rng(big ? 731 : 617);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const ox = Math.sin(a) * 0.036, oz = Math.cos(a) * 0.03;
    const spread = (big ? 0.42 : 0.55) + 0.25 * r();
    const dir = mix3([UP, 1], [BACK, big ? 0.62 : 0.42], [[Math.sin(a), 0, Math.cos(a) * 0.6], spread]);
    const len = (big ? 0.36 : 0.22) + (big ? 0.12 : 0.08) * r() + (Math.cos(a) < 0 ? 0.04 : 0);
    L.push({ at: [KNOT[0] + ox, KNOT[1] + 0.02, KNOT[2] + oz], dir, L: len, w: big ? 0.044 : 0.034, curl: big ? 0.04 : 0.14, taper: big ? 1.5 : 0.8, bend: mix3([BACK, 1], [UP, -0.2]) });
  }
  // the front hair risen too, swept back into the plume
  for (const s of [-1, 1]) for (const [az, el] of [[0.25, 0.5], [0.6, 0.55]]) {
    L.push(lockAt(s * az, el, mix3([UP, 1], [BACK, 0.55], [[s, 0, 0], 0.2]), big ? 0.17 : 0.12, big ? 0.034 : 0.028, { bend: BACK, curl: big ? 0.06 : 0.16, taper: big ? 1.4 : 0.8 }));
  }
  // the temples swept up and back
  for (const s of [-1, 1]) {
    L.push(lockAt(s * 1.15, 0.25, mix3([[s, 0, 0], 0.35], [UP, 0.7], [BACK, 0.7]), big ? 0.24 : 0.15, big ? 0.036 : 0.03, { bend: [s * 0.4, 0.3, -1], curl: 0.1, taper: big ? 1.4 : 0.8 }));
    if (big) L.push(lockAt(s * 1.7, 0.1, mix3([[s, 0, 0], 0.4], [UP, 0.55], [BACK, 0.9]), 0.22, 0.032, { bend: [s * 0.3, 0.2, -1], curl: 0.06, taper: 1.4 }));
  }
  // form 3: the back of the head's hair stands out behind in a short mane
  if (big) for (const x of [-1, 0, 1]) L.push(lockAt(Math.PI + x * 0.45, 0.15, mix3([BACK, 1], [UP, 0.55], [[x, 0, 0], 0.3]), 0.2, 0.034, { bend: UP, curl: 0.06, taper: 1.4 }));
  return L;
}

// --- option b: the mane
function hairB(form) {
  const L = [];
  const r = rng(form * 101 + 7);
  if (form === 1) {
    // a loose shaggy mane falling to the shoulders (two layers of broad locks), and a ragged fringe
    // that leaves the eyes clear
    for (const [n, el0, len, w] of [[16, 0.45, 0.24, 0.058], [12, 0.15, 0.2, 0.05]]) {
      for (let i = 0; i < n; i++) {
        const az = 0.85 + (i / (n - 1)) * (Math.PI * 2 - 1.7) + (r() - 0.5) * 0.12;
        const el = el0 + 0.15 * r();
        L.push(lockAt(az, el, (o) => mix3([o, 0.22], [DOWN, 1], [BACK, 0.12]), len + 0.06 * r(), w, { bend: [Math.sin(az), 0, Math.cos(az)], curl: 0.16, taper: 0.7 }));
      }
    }
    for (const s of [-1, -0.4, 0.4, 1]) L.push(lockAt(s * 0.32, 0.55, mix3([outAt(s * 0.32, 0.55), 0.45], [DOWN, 1], [[s * 0.4, 0, 0], 0.3]), 0.09, 0.03, { bend: FWD, curl: 0.25 }));
    return L;
  }
  const big = form === 3;
  // the whole mane blown up and back: broad locks streaming behind him and rising
  for (const [n, el0, up, back, len] of [[14, 0.62, big ? 0.6 : 0.5, 0.9, big ? 0.3 : 0.24], [12, 0.25, big ? 0.35 : 0.25, 1, big ? 0.32 : 0.24]]) {
    for (let i = 0; i < n; i++) {
      const az = lerp(-2.6, 2.6, i / (n - 1)) + (r() - 0.5) * 0.12;
      const el = el0 + 0.12 * r();
      L.push(lockAt(az, el, (o) => mix3([o, 0.45], [UP, up], [BACK, back]), len + (big ? 0.1 : 0.06) * r(), big ? 0.05 : 0.058, { bend: mix3([BACK, 1], [UP, 0.4]), curl: big ? 0.05 : 0.15, taper: big ? 1.35 : 0.8 }));
    }
  }
  // the front hair risen and thrown back
  for (const s of [-1, -0.3, 0.3, 1]) L.push(lockAt(s * 0.35, 0.5, mix3([UP, 1], [BACK, 0.6], [[s, 0, 0], 0.2]), big ? 0.17 : 0.13, 0.034, { bend: BACK, curl: 0.15, taper: big ? 1.3 : 0.8 }));
  // form 3: long stiff strands down his back, to the shoulder blades
  if (big) for (let i = 0; i < 7; i++) {
    const az = Math.PI + (i / 6 - 0.5) * 1.6;
    L.push(lockAt(az, 0.05, (o) => mix3([o, 0.25], [DOWN, 1.6], [BACK, 0.35]), 0.34 + 0.08 * r(), 0.04, { bend: BACK, curl: 0.08, taper: 1.2 }));
  }
  return L;
}

// --- option c: the braid, then the crest
function hairC(form) {
  const L = [];
  if (form === 1) {
    // the hair drawn back tight (the cap), a short fringe at the temples
    for (const s of [-1, 1]) L.push(lockAt(s * 1.05, 0.2, mix3([outAt(s * 1.05, 0.2), 0.2], [DOWN, 1], [BACK, 0.3]), 0.08, 0.018, { bend: [s, 0, 0], curl: 0.1 }));
    return L;
  }
  const big = form === 3;
  // the crest: three rows of blades along the top of the head from the brow to the crown (the middle
  // row tallest, the side rows leaning out: a fan from the front, a ridge from the side)
  const n = big ? 9 : 8;
  for (const [row, k, lean] of [[0, 1, 0], [-1, 0.72, 0.45], [1, 0.72, 0.45]]) {
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const el = lerp(0.62, Math.PI - 0.45, t); // over the top, front to back
      const back = el > Math.PI / 2;
      const e2 = back ? Math.PI - el : el;
      const az = (back ? Math.PI - row * 0.32 : row * 0.32);
      const hgt = Math.sin(Math.PI * (0.15 + 0.7 * t));
      L.push({ at: scalp(az, e2 - Math.abs(row) * 0.08), dir: mix3([UP, 1], [BACK, 0.35 + 0.45 * t], [FWD, 0.15 * (1 - t)], [[row, 0, 0], lean]), L: k * ((big ? 0.2 : 0.14) + (big ? 0.17 : 0.1) * hgt), w: 0.02, th: big ? 0.034 : 0.04, curl: big ? 0.04 : 0.1, taper: big ? 1.3 : 0.9, bend: BACK });
    }
  }
  // the sides swept back flat along the head
  for (const s of [-1, 1]) for (const el of [0.2, 0.5]) L.push(lockAt(s * 1.2, el, mix3([BACK, 1], [UP, 0.25], [[s, 0, 0], 0.15]), big ? 0.17 : 0.12, 0.03, { bend: [s, 0.2, 0], curl: 0.1, taper: big ? 1.2 : 0.8 }));
  // form 3: a mane of stiff spikes down his back
  if (big) for (let i = 0; i < 6; i++) {
    const az = Math.PI + (i / 5 - 0.5) * 1.3;
    L.push(lockAt(az, 0.1, (o) => mix3([o, 0.2], [DOWN, 2.2], [BACK, 0.35]), 0.3 + 0.05 * Math.cos(i), 0.036, { bend: BACK, curl: 0.06, taper: 1.3 }));
  }
  return L;
}

const HAIR = { a: hairA, b: hairB, c: hairC };

/** The head: no body hair (hidesHair); the hair of every form, the dark one on the `shirt` material
 *  (its own part, white ink lines), the gold ones on `hair` / `hairTip`. */
function buildHead(ctx) {
  const { head, M, mesh, joint } = ctx;
  const look = ascLookNow().base;
  const D = dressOf(ctx.root, look);
  const keep = [], streamers = [];
  const put = (g, m, from, to) => {
    const x = mesh(head, g, m);
    at(D, x, from, to);
    keep.push(x);
    return x;
  };
  // the scalp: dark (form 1), gold (forms 2 - 3)
  put(partGeometry('hair.cap'), M.shirt, 1, 1);
  put(partGeometry('hair.cap'), M.hair, 2, 3);
  for (const form of [1, 2, 3]) {
    const locks = HAIR[look](form);
    if (!locks.length) continue;
    const g = lockGeometry(locks);
    if (form === 1) put(mergeGeometries([g.mass, g.tips]), M.shirt, 1, 1);
    else {
      put(g.mass, M.hair, form, form);
      put(g.tips, M.hairTip, form, form);
    }
  }
  if (look === 'a') {
    // the topknot (dark, then gold) and its cloth tie (all forms)
    const bun = () => sub(ellipsoidGeometry(0.042, 0.036, 0.04, { widthSegs: 10, heightSegs: 6 }).translate(...KNOT), 1);
    put(bun(), M.shirt, 1, 1);
    put(bun(), M.hair, 2, 3);
    mesh(head, sub(bandGeometry(0.03, 0.028, 0.018, 14).translate(KNOT[0], KNOT[1] - 0.026, KNOT[2]), 1), M.leather);
    // form 1: a short tail off the knot, on a spring
    const base = joint(head, KNOT[0], KNOT[1] - 0.01, KNOT[2] - 0.035);
    base.rotation.y = Math.PI;
    const s0 = joint(base), L0 = 0.11, L1 = 0.15;
    const a0 = mesh(s0, twoSided(foldLines(tatterStrip(L0, 0.05, { tip: false, curl: 0.05, seed: 811 }), ribbonCrease(0.05, 0.6))), M.shirt);
    const s1 = joint(s0, 0, -L0, 0);
    const a1 = mesh(s1, twoSided(foldLines(tatterStrip(L1, 0.045, { fork: true, curl: 0.15, seed: 823 }), ribbonCrease(0.045, 1.4))), M.shirt);
    for (const m of [a0, a1]) {
      at(D, m, 1, 1);
      keep.push(m);
    }
    streamers.push({ segs: [s0, s1], len: [L0, L1], out: 0.2, lag: 0.8, max: 1.8 });
  } else if (look === 'c') {
    // form 1: one long braid from the nape down his back, on a spring; a cord at its end
    const base = joint(head, 0, 0.12, -0.1);
    base.rotation.y = Math.PI;
    const s0 = joint(base), L0 = 0.2, L1 = 0.22;
    const braid = (len, r0, r1, seed) => {
      const parts = [], n = Math.round(len / 0.03);
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), r = lerp(r0, r1, t);
        parts.push(sub(ellipsoidGeometry(r, r * 1.35, r * 0.85, { widthSegs: 8, heightSegs: 5 }).translate((i & 1 ? 1 : -1) * r * 0.35, -t * len, 0), (i + seed) & 1));
      }
      return mergeGeometries(parts);
    };
    const b0 = mesh(s0, braid(L0, 0.026, 0.022, 0), M.shirt);
    const s1 = joint(s0, 0, -L0, 0);
    const b1 = mesh(s1, braid(L1, 0.021, 0.015, 1), M.shirt);
    const cord = mesh(s1, sub(bandGeometry(0.016, 0.014, 0.022, 10).translate(0, -L1 + 0.005, 0), 1), M.leather);
    const tuft = mesh(s1, twoSided(tatterStrip(0.06, 0.03, { fork: true, curl: 0.1, seed: 857 }).translate(0, -L1 - 0.005, 0)), M.shirt);
    for (const m of [b0, b1, cord, tuft]) {
      at(D, m, 1, 1);
      keep.push(m);
    }
    streamers.push({ segs: [s0, s1], len: [L0, L1], out: 0.08, lag: 0.7, max: 1.6 });
  }
  // form 3: a light in his eyes
  {
    const eyes = mergeGeometries([0.032, -0.032].map((ex) => ellipsoidGeometry(0.016, 0.008, 0.006, { widthSegs: 8, heightSegs: 4 }).translate(ex, 0.128, 0.098)));
    put(eyes, M.flask, 3, 3);
  }
  return { keep, streamers };
}

// ================================================================= the torso
/** The body's torso shell (BODY.shell; world heights) grown by `d`, closed in front, with a ring at the neck. */
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
/** The shell's ring at world height y (interpolated; with the torso's own bulge, gap closed). */
function shellAt(y) {
  const i = Math.max(1, Math.min(SHELL.length - 1, SHELL.findIndex((q) => q.y > y)));
  const A = SHELL[i - 1], B = SHELL[i], u = Math.max(0, Math.min(1, (y - A.y) / (B.y - A.y)));
  return { rx: lerp(A.rx, B.rx, u), rz: lerp(A.rz, B.rz, u), cz: lerp(A.cz ?? 0, B.cz ?? 0, u) };
}
const grown = (d, f = null) => SHELL.map((r) => ({ ...r, rx: r.rx + d, rz: r.rz + d, gap: 0, ...(f ? f(r) : null), y: ySp(r.y) }));

/** The bare torso in skin, a chest and a belly drawn in (sub-pieces: ink lines up close). */
function bareTorso({ spine, chest, M, mesh }) {
  mesh(spine, shellGeometry(grown(-0.002), { sub: 3, cols: 28 }), M.skin);
  const yc = yCh(1.38);
  mesh(chest, mergeGeometries([-1, 1].map((s) => sub(ellipsoidGeometry(0.075, 0.05, 0.03, { widthSegs: 10, heightSegs: 6 }).translate(s * 0.07, yc, 0.112), 1))), M.skin);
  mesh(spine, mergeGeometries([0, 1, 2].flatMap((k) => [-1, 1].map((s) => sub(ellipsoidGeometry(0.034, 0.03, 0.016, { widthSegs: 8, heightSegs: 5 }).translate(s * 0.036, ySp(1.31 - k * 0.055), 0.104 - k * 0.004), (k + (s > 0 ? 1 : 0)) & 1)))), M.skin);
}

/**
 * A torso shell that leaves out a region (rings: grown(); `cut(a, y)` true where cloth is missing:
 * a = angle round him, 0 his front, + his left; y world height). The torn tunic, the monk's wrap.
 */
function cutShell(rings, cut, cols = 40) {
  return gridGeometry(cols, (rings.length - 1) * 3, (s, t, o) => {
    const f = t * (rings.length - 1);
    const k = Math.min(rings.length - 2, Math.floor(f)), u = f - k;
    const A = rings[k], B = rings[k + 1];
    const y = lerp(A.y, B.y, u), rx = lerp(A.rx, B.rx, u), rz = lerp(A.rz, B.rz, u), cz = lerp(A.cz ?? 0, B.cz ?? 0, u);
    // the seam at his back: s 0 → 1 runs −π … π, 0 = his front
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

/** A crossed collar's fold line over the front (the robe's: his left lapel over the right). */
const crossFold = (x, y, z) => (z > 0 ? 0.5 + 10 * (x - 0.03 + (ySp(1.5) - y) * 0.6) : 0);

/** a: the sleeveless tunic. The armholes cut in at the shoulders; the upper body of it is torn off
 *  his left shoulder in form 3 (cutShell), the bare chest under it always built (skin, merged). */
function chestA(ctx) {
  const { spine, chest, M, mesh } = ctx;
  const D = dressOf(ctx.root, 'a');
  const keep = [];
  bareTorso(ctx);
  // the shoulders pulled in: the armholes (the bare deltoids show)
  const rings = grown(0.008, (r) => (r.y >= 1.42 && r.y < 1.5 ? { rx: r.rx - (r.y < 1.45 ? 0.03 : 0.025) } : null));
  const lower = rings.filter((r) => r.y <= ySp(1.3) + 1e-6), upper = rings.filter((r) => r.y >= ySp(1.3) - 1e-6);
  mesh(spine, foldLines(shellGeometry(lower, { sub: 3, cols: 28 }), crossFold), M.coat);
  const full = mesh(spine, foldLines(shellGeometry(upper, { sub: 3, cols: 28 }), crossFold), M.coat);
  at(D, full, 1, 2);
  // form 3: torn off his left shoulder, from under the left arm up across to the right of the neck
  const r = rng(977);
  const jag = Array.from({ length: 41 }, () => (r() - 0.5) * 0.035);
  const tornCut = (a, y) => {
    if (a < -0.25 || a > 2.9) return false;
    const yc = a < 1.5 ? lerp(1.5, 1.31, (a + 0.25) / 1.75) : lerp(1.31, 1.42, (a - 1.5) / 1.4);
    return y > yc + jag[Math.round(((a + Math.PI) / (Math.PI * 2)) * 40)];
  };
  const torn = mesh(spine, foldLines(cutShell(upper, tornCut), crossFold), M.coat);
  at(D, torn, 3, 3);
  // a rag of it hanging off the tear at his left breast
  const rag = mesh(spine, twoSided(foldLines(tatterStrip(0.12, 0.06, { fork: true, curl: 0.15, seed: 991 }), ribbonCrease(0.06, 0.4))).rotateY(0.6).translate(0.1, ySp(1.36), 0.11), M.coat);
  at(D, rag, 3, 3);
  // the collar band (forms 1 - 2: the tear takes it)
  const band = mesh(chest, mergeGeometries([
    sub(bandGeometry(0.1, 0.09, 0.034, 20).translate(0, yCh(1.49), 0.006), 1),
  ]), M.leather);
  at(D, band, 1, 2);
  // form 2: gold light along the collar and the armholes' edges
  const edge = mesh(chest, mergeGeometries([
    bandGeometry(0.104, 0.094, 0.01, 20).translate(0, yCh(1.475), 0.006),
  ]), M.flask);
  at(D, edge, 2, 2);
  keep.push(full, torn, rag, band, edge);
  return { keep };
}

/** b: bare-chested. */
function chestB(ctx) {
  bareTorso(ctx);
  return {};
}

/** c: the monk's cross-wrap over his left shoulder (the right shoulder and breast bare), the prayer
 *  beads round his neck. Form 3: the wrap falls away (bare-chested), the beads stay. */
function chestC(ctx) {
  const { spine, chest, M, mesh } = ctx;
  const D = dressOf(ctx.root, 'c');
  bareTorso(ctx);
  const rings = grown(0.008, (r) => (r.y >= 1.42 && r.y < 1.5 ? { rx: r.rx - 0.012 } : null));
  // the cloth leaves his right shoulder and breast bare: a diagonal from his left shoulder down
  // to under his right arm
  const r = rng(1013);
  const jag = Array.from({ length: 41 }, () => (r() - 0.5) * 0.008);
  const wrapCut = (a, y) => {
    if (a > 0.35 || a < -2.95) return false;
    const yc = a > -1.5 ? lerp(1.5, 1.3, (0.35 - a) / 1.85) : lerp(1.3, 1.44, (-1.5 - a) / 1.45);
    return y > yc + jag[Math.round(((a + Math.PI) / (Math.PI * 2)) * 40)];
  };
  const wrapFold = (x, y, z) => (z > 0 ? 0.5 + 9 * (-x - 0.02 + (ySp(1.48) - y) * 0.7) : 0.5 + 0.6 * Math.sin(x * 40 + y * 8));
  const wrap = mesh(spine, foldLines(cutShell(rings, wrapCut, 44), wrapFold), M.coat);
  // its edge, a band of the shoulder cloth's colour along the diagonal
  const pts = [];
  for (let k = 0; k <= 12; k++) {
    const a = lerp(0.35, -2.95, k / 12);
    const y = a > -1.5 ? lerp(1.5, 1.3, (0.35 - a) / 1.85) : lerp(1.3, 1.44, (-1.5 - a) / 1.45);
    const i = SHELL.findIndex((q) => q.y > y), A = SHELL[Math.max(0, i - 1)], B = SHELL[i];
    const u = (y - A.y) / (B.y - A.y);
    const rx = lerp(A.rx, B.rx, u) + 0.014, rz = lerp(A.rz, B.rz, u) + 0.014, cz = lerp(A.cz ?? 0, B.cz ?? 0, u);
    pts.push([Math.sin(a) * rx, ySp(y), Math.cos(a) * rz + cz]);
  }
  const edgeParts = [];
  for (let k = 0; k + 1 < pts.length; k++) edgeParts.push(sub(strip(pts[k], pts[k + 1], 0.03), k & 1));
  const edge = mesh(spine, mergeGeometries(edgeParts), M.facing);
  at(D, wrap, 1, 2);
  at(D, edge, 1, 2);
  // the prayer beads: a loop of big beads round his neck, over the shoulders and down to the
  // breastbone, each sitting on the torso's surface (over the wrap)
  const beads = [];
  const n = 24;
  let low = null;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const front = Math.max(0, Math.cos(a)), back = Math.max(0, -Math.cos(a));
    const y = 1.505 - 0.15 * front * front - 0.05 * back * back - 0.01 * Math.abs(Math.sin(a));
    const R = shellAt(y), k = 0.024;
    const big = i === 0;
    const p = [Math.sin(a) * (R.rx + k), yCh(y), Math.cos(a) * (R.rz + k) + R.cz];
    if (big) low = p;
    beads.push(sub(ellipsoidGeometry(big ? 0.03 : 0.021, big ? 0.03 : 0.021, big ? 0.025 : 0.018, { widthSegs: 8, heightSegs: 5 }).translate(...p), i & 1));
  }
  mesh(chest, mergeGeometries(beads), M.trim);
  // form 2: the beads' light (a glow over the big bead)
  const glow = mesh(chest, ellipsoidGeometry(0.034, 0.034, 0.028, { widthSegs: 8, heightSegs: 5 }).translate(low[0], low[1], low[2] + 0.006), M.flask);
  at(D, glow, 2, 3);
  return { keep: [wrap, edge, glow] };
}

/** A thin flat strip from p to q (a band along a cut edge), w wide, lying on the surface. */
function strip(p, q, w, o = null) {
  const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2];
  const len = Math.hypot(dx, dy, dz) + 0.004;
  const g = boxGeometry(w, len, 0.006);
  const dir = new THREE.Vector3(dx, dy, dz).normalize();
  const out = o ? new THREE.Vector3(...o) : new THREE.Vector3((p[0] + q[0]) / 2, 0, (p[2] + q[2]) / 2).normalize();
  const x = new THREE.Vector3().crossVectors(dir, out).normalize();
  const z = new THREE.Vector3().crossVectors(x, dir).normalize();
  g.applyMatrix4(new THREE.Matrix4().makeBasis(x, dir, z).setPosition((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2));
  return g;
}

// ================================================================= the arms
/** Cloth wraps round a limb (fore / shin space: y0 → y1 going down, radius r(t)), n turns. */
function wraps(y0, y1, n, r) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1), y = lerp(y0, y1, t), rr = r(t);
    parts.push(sub(limb({ length: (y0 - y1) / Math.max(1, n - 1) + 0.012, r0: rr + 0.002, r1: rr, radial: 10, rings: 2, capSegs: 1 }).translate(0, y + 0.006, 0), i & 1));
  }
  return mergeGeometries(parts);
}

/** WRAP[look]: where the wraps reach up the forearm (fore space, m below the elbow). */
const WRAP_TOP = { a: -0.15, b: -0.02, c: -0.13 };

/** Bare arms, wrapped forearms and fists (the right fist on the sword joint, FIST). */
function buildArms(ctx) {
  const { arms, sword, M, DIM, BODY, mesh } = ctx;
  const look = ascLookNow().base;
  const D = dressOf(ctx.root, look);
  const [ua0, ua1] = BODY.upperArm, [fa0, fa1] = BODY.foreArm, HK = BODY.hand;
  const keep = [];
  for (const side of [-1, 1]) {
    const { upper, fore } = arms[side < 0 ? 'R' : 'L'];
    // the bare arm: a fighter's, a little fuller than the hero's sleeve
    mesh(upper, mergeGeometries([
      sub(limb({ length: DIM.upperArm, r0: ua0 + 0.002, r1: ua1 + 0.002, bulge: 0.014 }), 1),
      sub(ellipsoidGeometry(BODY.deltoid[0] + 0.004, BODY.deltoid[1], BODY.deltoid[2] + 0.004, { widthSegs: 12, heightSegs: 8 }).translate(side * 0.01, -0.02, 0), 1),
    ]), M.skin);
    mesh(fore, mergeGeometries([
      sub(limb({ length: 0.09, r0: ua1 + 0.002, r1: ua1 - 0.002 }), 1),
      sub(limb({ length: 0.2, r0: fa0 + 0.004, r1: fa1, radial: 10, rings: 3, bulge: 0.006 }).translate(0, -0.05, 0), 1),
    ]), M.skin);
    // the wraps: from WRAP_TOP down over the wrist
    const y0 = WRAP_TOP[look], y1 = -DIM.foreArm + 0.04;
    const n = Math.max(3, Math.round((y0 - y1) / 0.03));
    mesh(fore, wraps(y0, y1, n, (t) => lerp(y0 < -0.1 ? fa0 - 0.002 : fa0 + 0.006, fa1, t) + 0.006), M.hem);
    // form 2 - 3: the wrists catch the light / burn
    const g = mesh(fore, bandGeometry(fa1 + 0.012, fa1 + 0.012, 0.03, 14).translate(0, y1 + 0.02, 0), M.flask);
    at(D, g, 2, 3);
    keep.push(g);
  }
  // the right fist on the sword joint, its knuckles wrapped; the wrist under it
  {
    const F = gripFist(HK);
    mesh(sword, mergeGeometries([F.fingers, F.thumb, F.ridge]), M.skin);
    const kx = 0.034 * HK * 1.1 + 0.004, ky = 0.034 * HK * 0.92 + 0.004;
    mesh(sword, mergeGeometries([
      sub(bandGeometry(kx, ky + 0.002, 0.03, 16).rotateX(Math.PI / 2).translate(0, 0, -0.024), 0),
      sub(bandGeometry(kx + 0.002, ky + 0.004, 0.028, 16).rotateX(Math.PI / 2).translate(0, 0, 0.028), 1),
    ]), M.hem);
    mesh(arms.R.fore, ellipsoidGeometry(0.036 * HK, 0.04 * HK, 0.04 * HK, { widthSegs: 10, heightSegs: 6 }), M.hem, 0, -DIM.foreArm + 0.02, 0.004);
    // form 3: the fist burns (a shell of light over the knuckles)
    const fg = mesh(sword, ellipsoidGeometry(kx + 0.008, ky + 0.008, 0.07, { widthSegs: 12, heightSegs: 6 }).translate(0, 0, 0.004), M.flask);
    at(D, fg, 3, 3);
    keep.push(fg);
  }
  const free = buildFreeHand(ctx, M.skin);
  // form 3: the free hand's light, on its wrist (it shows whichever shape the hand takes)
  const lg = mesh(arms.L.wrist ?? arms.L.fore, ellipsoidGeometry(0.04, 0.06, 0.05, { widthSegs: 10, heightSegs: 6 }).translate(0, arms.L.wrist ? -0.04 : -DIM.foreArm - 0.01, 0), M.flask);
  at(D, lg, 3, 3);
  keep.push(lg);
  return { offHand: free.offHand, keep: [...keep, ...free.keep] };
}

// ================================================================= the legs
/** Loose trousers gathered into wraps at the shin; soft boots (a), wrapped bare feet (b), sandals (c). */
function buildLegs(ctx) {
  const { pelvis, legs, M, DIM, BODY, mesh } = ctx;
  const look = ascLookNow().base;
  const [hx, hy, hz] = BODY.hips.r;
  mesh(pelvis, orient.up(ellipsoidGeometry(hx + 0.014, hz + 0.014, hy + 0.012)), M.pants, ...BODY.hips.c);
  const [th0, th1] = BODY.thigh, [sh0, sh1] = BODY.shin, F = BODY.foot;
  const wrapTop = look === 'c' ? -0.1 : -0.2;
  for (const side of [-1, 1]) {
    const { thigh, shin, foot } = legs[side < 0 ? 'R' : 'L'];
    // loose: fuller than the leg, ballooning at the knee and below it, then gathered
    mesh(thigh, foldLines(limb({ length: DIM.thigh, r0: th0 + 0.022, r1: th1 + 0.03, bulge: 0.028 }), (x, y, z) => 0.5 + 0.6 * Math.sin(Math.atan2(x, z) * 3 + y * 9 + side)), M.pants);
    mesh(shin, foldLines(limb({ length: -wrapTop + 0.03, r0: th1 + 0.03, r1: sh0 + 0.026, bulge: 0.012 }), (x, y, z) => 0.5 + 0.6 * Math.sin(Math.atan2(x, z) * 3 - y * 12)), M.pants);
    mesh(shin, wraps(wrapTop, -DIM.shin + 0.05, look === 'c' ? 9 : 6, (t) => lerp(look === 'c' ? sh0 + 0.004 : sh0 - 0.004, sh1, t) + 0.006), M.hem);
    if (look === 'a') {
      // soft boots: the foot and a short cuff at the ankle
      mesh(foot, mergeGeometries([
        ellipsoidGeometry(F.r[0] * 0.95, F.r[1] * 0.9, F.r[2] * 0.95, { widthSegs: 10, heightSegs: 6 }).translate(F.c[0], F.c[1] - 0.004, F.c[2]),
        sub(limb({ length: 0.07, r0: sh1 + 0.012, r1: sh1 + 0.008, radial: 10, rings: 2, capSegs: 1 }).translate(0, 0.05, 0), 1),
      ]), M.collar);
    } else {
      // bare feet (b: wrapped across the instep; c: on a sandal's sole)
      mesh(foot, ellipsoidGeometry(F.r[0] * 0.88, F.r[1] * 0.82, F.r[2] * 0.92, { widthSegs: 10, heightSegs: 6 }).translate(F.c[0], F.c[1], F.c[2]), M.skin);
      if (look === 'b') mesh(foot, mergeGeometries([0, 1].map((k) => sub(bandGeometry(F.r[0] * 0.92, F.r[1] * 0.9, 0.03, 12).rotateX(Math.PI / 2 - 0.3).translate(F.c[0], F.c[1] + 0.004, F.c[2] - 0.02 + k * 0.04), k))), M.hem);
      else mesh(foot, mergeGeometries([
        boxGeometry(F.r[0] * 2.05, 0.014, F.r[2] * 2.0, F.c[0], F.c[1] - F.r[1] * 0.8, F.c[2]),
        sub(bandGeometry(F.r[0] * 0.92, F.r[1] * 0.9, 0.016, 12).rotateX(Math.PI / 2).translate(F.c[0], F.c[1], F.c[2] + 0.03), 1),
      ]), M.leather);
    }
  }
  return {};
}

// ================================================================= the waist
/** The sash round his waist (spine space), a knot at his left front, two tails flying (streamers). */
function sash(ctx, { tails = [0.2, 0.22], w = 0.075 } = {}) {
  const { spine, pelvis, M, mesh } = ctx;
  const W = SHELL[1];
  mesh(spine, mergeGeometries([
    sub(bandGeometry(W.rx + 0.026, W.rz + 0.026, w, 32).translate(0, ySp(1.17), 0), 0),
    sub(boxGeometry(0.06, 0.055, 0.03, 0.07, ySp(1.17), W.rz + 0.034, 0, 0.3, 0), 1),
  ]), M.leather);
  const streamers = [];
  [[0.085, 0.45, 41, tails[0]], [0.05, 0.25, 47, tails[1]]].forEach(([x, ry, seed, L]) => {
    const S = hangSheet(ctx, pelvis, { at: [x, yPv(1.15), 0.135], ry, w: [0.055, 0.05, 0.045], len: [L * 0.45, L * 0.55], out: 0.12, ribbon: true, fork: true, lag: 0.9, max: 2.2, seed }, { face: M.leather, back: null, hem: M.leather });
    // (the leather is one-sided: the ribbon's back face, by turning a copy of each piece)
    for (const s of S.segs) for (const c of [...s.children]) if (c.isMesh) c.geometry = twoSided(c.geometry);
    streamers.push(S);
  });
  return streamers;
}

/** a: the tunic's skirt below the sash, split at the sides (front and back panels, two narrow side
 *  panels), to mid-thigh; the sash. */
const SKIRT_A = [
  { az: 0, w: [0.2, 0.22, 0.25], len: [0.17, 0.17], strips: [], fork: [], out: 0.01, flare: 0.1 },
  { az: Math.PI, w: [0.22, 0.25, 0.28], len: [0.17, 0.18], strips: [], fork: [], out: 0.01, flare: 0.12 },
  { az: 1.5, w: [0.1, 0.11, 0.12], len: [0.14, 0.12], strips: [], fork: [], out: 0.002, flare: 0.2 },
  { az: -1.5, w: [0.1, 0.11, 0.12], len: [0.14, 0.12], strips: [], fork: [], out: 0.002, flare: 0.2 },
];
/** b: the half-robe: its sleeves and back hanging from the sash down to the calf, open in front, torn. */
const SKIRT_B = [
  { az: 2.9, w: [0.2, 0.26, 0.32], len: [0.26, 0.28], strips: [0.08, 0.12, 0.06], fork: [0, 1, 0], out: 0.01, flare: 0.16 },
  { az: -2.9, w: [0.2, 0.26, 0.32], len: [0.26, 0.26], strips: [0.1, 0.06, 0.12], fork: [1, 0, 1], out: 0.01, flare: 0.16 },
  { az: 1.7, w: [0.14, 0.18, 0.22], len: [0.24, 0.3], strips: [0.1, 0.07], fork: [1, 0], out: 0.006, flare: 0.22 },
  { az: -1.7, w: [0.14, 0.18, 0.22], len: [0.24, 0.24], strips: [0.06, 0.12], fork: [0, 1], out: 0.006, flare: 0.22 },
  { az: 0.75, w: [0.1, 0.12, 0.14], len: [0.2, 0.2], strips: [0.08], fork: [1], out: 0.004, flare: 0.14 },
];
/** c: the monk's robe skirt, to the knee, its front panels overlapping. */
const SKIRT_C = [
  { az: 0.38, w: [0.17, 0.21, 0.25], len: [0.22, 0.24], strips: [], fork: [], out: 0.006, flare: 0.08, skew: 0.6 },
  { az: -0.38, w: [0.17, 0.21, 0.25], len: [0.22, 0.24], strips: [], fork: [], out: 0, flare: 0.08, skew: -0.6 },
  { az: 1.5, w: [0.12, 0.15, 0.18], len: [0.2, 0.22], strips: [], fork: [], out: 0.002, flare: 0.22 },
  { az: -1.5, w: [0.12, 0.15, 0.18], len: [0.2, 0.22], strips: [], fork: [], out: 0.002, flare: 0.22 },
  { az: 2.5, w: [0.16, 0.22, 0.27], len: [0.23, 0.25], strips: [], fork: [], out: 0.006, flare: 0.14, skew: -0.4 },
  { az: -2.5, w: [0.16, 0.22, 0.27], len: [0.23, 0.25], strips: [], fork: [], out: 0.006, flare: 0.14, skew: 0.4 },
];

/** The skirt panels' lower edge in light (form 2: catches the gold), on each panel's lower sheet. */
function hemLight(ctx, coat, D, from, to) {
  const { M, mesh } = ctx;
  const keep = [];
  for (const C of coat) {
    const P = C.def, s1 = C.segs[1];
    const L1 = P.len[1], R1 = C.r0 + 0.25 * P.len[0], R2 = R1 + 0.25 * L1;
    const w = P.w[2], n = 16, parts = [];
    // (strips along the hem, a hair proud of the cloth: the sheet curves round R2 below its joint)
    const pt = (a) => [Math.sin(a) * (R2 + 0.004), -L1 - 0.01, (Math.cos(a) - 1) * R2 + Math.cos(a) * 0.004];
    for (let k = 0; k < n; k++) {
      const a0 = ((k / n) - 0.5) * w / R2, a1 = (((k + 1) / n) - 0.5) * w / R2, am = (a0 + a1) / 2;
      parts.push(strip(pt(a0), pt(a1), 0.014, [Math.sin(am), 0, Math.cos(am)]));
    }
    const m = mesh(s1, mergeGeometries(parts), M.flask);
    at(D, m, from, to);
    keep.push(m);
  }
  return keep;
}

function buildWaist(ctx) {
  const look = ascLookNow().base;
  const D = dressOf(ctx.root, look);
  if (look === 'a') {
    const { coat } = panelSkirt(ctx, SKIRT_A, { seed: 300 });
    const keep = hemLight(ctx, coat, D, 2, 2);
    return { coat, streamers: sash(ctx), keep };
  }
  if (look === 'b') {
    // the half-robe; form 3: its lower sheets torn away into rags (as the Lord's cape, ADR-122)
    const { made, cx } = capture(ctx);
    const { coat } = panelSkirt(cx, SKIRT_B, { seed: 500 });
    const keep = [];
    const { M, mesh } = ctx;
    coat.forEach((C, i) => {
      const s1 = C.segs[1];
      for (const m of made) if (m.parent === s1 || C.strips.some((S) => S.joint === m.parent)) {
        at(D, m, 1, 2);
        keep.push(m);
      }
      const P = C.def, R1 = C.r0 + 0.25 * P.len[0], w1 = P.w[1];
      const r = rng(1201 + i * 17), n = 3, rags = [];
      for (let k = 0; k < n; k++) {
        const u = ((k + 0.5) / n - 0.5) * w1 * 0.92, a = u / R1;
        const g = tatterStrip(P.len[1] * (0.25 + 0.3 * r()), (w1 / n) * 0.85, { fork: r() < 0.6, curl: 0.12, seed: 1300 + i * 7 + k });
        rags.push(sub(g.rotateY(a).translate(Math.sin(a) * R1, 0.02, (Math.cos(a) - 1) * R1), k & 1));
      }
      const g = mergeGeometries(rags);
      for (const mat of [M.coat, M.lining]) {
        const x = mesh(s1, g, mat);
        at(D, x, 3, 3);
        keep.push(x);
      }
    });
    return { coat, streamers: sash(ctx, { tails: [0.26, 0.3], w: 0.085 }), keep };
  }
  // c: the robe skirt, the sash, and the shoulder cloth streaming behind (forms 1 - 2)
  const { coat } = panelSkirt(ctx, SKIRT_C, { seed: 700 });
  const streamers = sash(ctx, { tails: [0.16, 0.18], w: 0.06 });
  const { made, cx } = capture(ctx);
  const S = hangSheet(cx, ctx.chest, { at: [0.1, yCh(1.46), -0.125], ry: Math.PI - 0.3, w: [0.16, 0.2, 0.22], len: [0.24, 0.26], out: 0.15, wrap: 0.16, lag: 0.6, max: 1.5, seed: 77, inMax: [0.1, 0.25] }, { face: ctx.M.facing, back: null, hem: ctx.M.facing });
  for (const m of made) {
    m.geometry = twoSided(m.geometry);
    at(D, m, 1, 2);
  }
  streamers.push(S);
  return { coat, streamers, keep: [...made, ...hemLight(ctx, coat, D, 2, 2)] };
}

// ================================================================= the items
/** Each item's build: the first one turns the rig to the dragon look when option d is chosen. */
function opted(build) {
  return (ctx) => {
    if (ascLookNow().art) toDragonLook(ctx, ASC_ART);
    return build(ctx);
  };
}
const CHEST = { a: chestA, b: chestB, c: chestC };

/** The set (registered into the hero's gear registry on import: gear/index.js registerItem). */
export const ASC_ITEMS = [
  { id: 'asc.head', slot: 'head', name: 'Ascendant Hair', hidesHair: true, build: opted(buildHead) },
  { id: 'asc.chest', slot: 'chest', name: 'Fighter\'s Tunic', build: opted((ctx) => CHEST[ascLookNow().base](ctx)) },
  { id: 'asc.arms', slot: 'arms', name: 'Wrapped Fists', build: opted(buildArms) },
  { id: 'asc.legs', slot: 'legs', name: 'Gathered Trousers', build: opted(buildLegs) },
  { id: 'asc.waist', slot: 'waist', name: 'Sash and Skirt', build: opted(buildWaist) },
];
for (const item of ASC_ITEMS) registerItem(item);

/** What he wears (no `weapon`: he is bare-handed; the right fist hangs on the sword joint). */
export const ASC_LOADOUT = Object.freeze({
  head: 'asc.head',
  chest: 'asc.chest',
  shoulders: null,
  arms: 'asc.arms',
  legs: 'asc.legs',
  waist: 'asc.waist',
  back: null,
  weapon: null,
});

/** His "blade": the right fist, as a short segment along the sword joint's +Z (duelist.js kit.blade):
 *  from the little finger's side of the fist (guard) to past the index knuckle's wrap (tip), metres.
 *  Measured on gripFist(BODY.hand 1.12) and its knuckle wraps. */
export const FIST = Object.freeze({ guard: -0.06, tip: 0.075 });
