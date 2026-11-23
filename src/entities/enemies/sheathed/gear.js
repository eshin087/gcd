import * as THREE from 'three';
import { ellipsoidGeometry, limbGeometry } from '../../../render/glyphGeometry.js';
import { registerItem } from '../../player/gear/index.js';
import { shellGeometry, skirtSheet, sheetOffset, tatterStrip, bandGeometry, boxGeometry, mergeGeometries, sub, foldLines, ribbonCrease, lerp, limb, gripFist, looseHand, partGeometry } from '../../player/heroGeo.js';
import { toDragonLook, ART_CLOTH, ART_SKIN, ART_KEEP } from '../ashDisciple/bodyArt.js';
import { ROBE_PANELS } from '../ashDisciple/gear.js'; // (the robe skirt's cut: Shen Hui's panels)
import { lookOf } from '../duelist/lookSwitch.js';

// Lu Wusheng's outfit and his sword (ADR-145): gear items on the hero's skeleton (built by the same
// buildHero, driven by the same animator), drawn through the WYRM's art path (FLAG.ART; ashDisciple/
// bodyArt.js toDragonLook with his own spec, below); the sword stays on today's material (a blade is
// thinner than an art cell). Four bodies behind `?sheathLook=a|b|c|d` (the owner picked d; read when
// his rig is built; a reload):
//   a  Mourning White: undyed mourning hemp, the sleeves bound at the wrist, a white band round the
//      brow with two long tails that trail, black hair bound up in a knot; the black scabbard the
//      darkest thing on him
//   b  Reed Cloak: a shaggy straw rain cape over dark travelling clothes, a cloth over the lower face;
//      a bulky bristling top on thin legs
//   c  One Sleeve: a dark robe worn off the sword arm, the bare arm bound with cord, short grey hair
//   d  The Wanderer (the owner's ask, 2026-11-22: nearer the genre's wandering swordsman; an option,
//      not the pick): a slighter man in a faded indigo travelling robe over wide charcoal trousers, a
//      long sand-coloured scarf whose tails trail, dark hair bound in a high tail
// Materials: `coat` / `lining` the robe, `hem` the white band and its tails (a) / the wraps, `shirt` the
// cords, shoes and the face cloth, `pants` the trousers, `leather` the straw cape (b) / the arm cord (c),
// `hair` his hair, `skin`; the sword: `armor` / `bevel` the blade and its edge, `trim` the black lacquer
// scabbard and the hilt, `facing` its pale throat and butt cap.

/** The body this page builds ('a' | 'b' | 'c' | 'd'). */
export function sheathLookNow() {
  const o = lookOf('sheathLook', 'a');
  return o === 'b' || o === 'c' || o === 'd' ? o : 'a';
}

const cloth = (ink, o = {}) => ({ ...ART_CLOTH, light: [1.2, 0.8, 0.4, 0.02], ink, ...o });
const SKIN = { ...ART_SKIN, ink: [0.58, 0.42, 0.31] };
const SWORD = { armor: ART_KEEP, bevel: ART_KEEP, trim: ART_KEEP, facing: ART_KEEP };
/** The art sources per body (materials.js wyrmFeatures; the hues are each spec's ink). */
export const SHEATH_ART = {
  a: {
    default: cloth([0.12, 0.12, 0.12]),
    coat: cloth([0.44, 0.42, 0.37]), // undyed hemp
    lining: cloth([0.15, 0.14, 0.13]),
    hem: cloth([0.66, 0.65, 0.61], { strokeEdge: 0.3 }), // the white band and its tails, the wraps
    shirt: cloth([0.06, 0.06, 0.065]), // cords, shoes
    pants: cloth([0.3, 0.29, 0.26]),
    leather: cloth([0.2, 0.18, 0.15]),
    hair: cloth([0.045, 0.045, 0.05]),
    hairTip: cloth([0.06, 0.06, 0.065]),
    collar: cloth([0.44, 0.42, 0.37]),
    skin: SKIN,
    eye: { ...ART_SKIN, ink: [0.08, 0.07, 0.06] },
    ...SWORD,
  },
  b: {
    default: cloth([0.1, 0.1, 0.1]),
    coat: cloth([0.13, 0.13, 0.145]), // dark travelling clothes
    lining: cloth([0.06, 0.06, 0.065]),
    hem: cloth([0.3, 0.28, 0.24]),
    shirt: cloth([0.09, 0.085, 0.08]), // the face cloth, shoes
    pants: cloth([0.11, 0.11, 0.12]),
    leather: cloth([0.42, 0.34, 0.17], { strokeEdge: 0.25 }), // the straw cape
    hair: cloth([0.05, 0.05, 0.055]),
    hairTip: cloth([0.06, 0.06, 0.065]),
    collar: cloth([0.13, 0.13, 0.145]),
    skin: SKIN,
    eye: { ...ART_SKIN, ink: [0.08, 0.07, 0.06] },
    ...SWORD,
  },
  c: {
    default: cloth([0.1, 0.1, 0.1]),
    coat: cloth([0.15, 0.13, 0.16]), // the dark robe
    lining: cloth([0.07, 0.06, 0.07]),
    hem: cloth([0.34, 0.32, 0.28]),
    shirt: cloth([0.06, 0.06, 0.065]),
    pants: cloth([0.12, 0.115, 0.125]),
    leather: cloth([0.34, 0.25, 0.13]), // the cord round the bare arm
    hair: cloth([0.46, 0.46, 0.47], { strokeEdge: 0.3 }), // short grey hair
    hairTip: cloth([0.54, 0.54, 0.55]),
    collar: cloth([0.15, 0.13, 0.16]),
    skin: SKIN,
    eye: { ...ART_SKIN, ink: [0.08, 0.07, 0.06] },
    ...SWORD,
  },
  d: {
    default: cloth([0.1, 0.1, 0.11]),
    coat: cloth([0.17, 0.22, 0.34]), // the faded indigo travelling robe
    lining: cloth([0.07, 0.08, 0.12]),
    hem: cloth([0.42, 0.42, 0.4]), // the shin wraps
    shirt: cloth([0.06, 0.06, 0.065]), // cords, shoes
    pants: cloth([0.13, 0.14, 0.165]), // the wide charcoal trousers
    leather: cloth([0.52, 0.42, 0.24], { strokeEdge: 0.28 }), // the sand scarf
    hair: cloth([0.075, 0.055, 0.045]), // dark hair
    hairTip: cloth([0.1, 0.075, 0.06]),
    collar: cloth([0.17, 0.22, 0.34]),
    skin: SKIN,
    eye: { ...ART_SKIN, ink: [0.08, 0.07, 0.06] },
    ...SWORD,
  },
};

/** A sheet's twin seen from its other side: mirrored in x (the winding flips with it). */
const mirrored = (g) => {
  const m = g.clone().scale(-1, 1, 1);
  m.computeVertexNormals();
  return m;
};

/** Each item's build turns the rig to the dragon look first (once per rig: toDragonLook). */
const opted = (build) => (ctx) => {
  toDragonLook(ctx, SHEATH_ART[sheathLookNow()]);
  return build(ctx);
};

// ================================================================= the head
// head space (before BODY.headScale): the scalp is the ellipsoid c [0, 0.154, -0.007], r [0.105, 0.118, 0.112]
function buildHead(ctx) {
  const { head, M, mesh, joint } = ctx;
  const look = sheathLookNow();
  const streamers = [];
  mesh(head, partGeometry('hair.cap'), M.hair);
  if (look === 'a') {
    // the knot: the hair bound up at the crown
    mesh(head, mergeGeometries([
      sub(ellipsoidGeometry(0.04, 0.034, 0.04, { widthSegs: 10, heightSegs: 6 }).translate(0, 0.27, -0.03), 0),
      sub(bandGeometry(0.03, 0.03, 0.02, 12).translate(0, 0.245, -0.03), 1),
    ]), M.hair);
    // the white mourning band round the brow
    mesh(head, sub(bandGeometry(0.112, 0.118, 0.034, 28), 1), M.hem, 0, 0.19, -0.006);
    // its two long tails from the back of the head, on springs (they trail)
    for (const [sx, L0, L1, seed] of [[-0.024, 0.32, 0.3, 811], [0.022, 0.28, 0.34, 823]]) {
      const base = joint(head, sx, 0.19, -0.12);
      const s0 = joint(base);
      mesh(s0, foldLines(tatterStrip(L0, 0.032, { tip: false, curl: 0.12, seed }), ribbonCrease(0.032, 0.6)), M.hem);
      const s1 = joint(s0, 0, -L0, 0);
      mesh(s1, foldLines(tatterStrip(L1, 0.03, { fork: true, curl: 0.18, seed: seed + 5 }), ribbonCrease(0.03, 1.1)), M.hem);
      streamers.push({ segs: [s0, s1], len: [L0, L1], out: 0.04, lag: 1.1, max: 2.2 });
    }
  } else if (look === 'd') {
    // the high tail: the hair bound at the back of the crown, falling to the shoulders on a spring
    mesh(head, sub(bandGeometry(0.03, 0.03, 0.024, 12).translate(0, 0.25, -0.078), 1), M.shirt);
    const base = joint(head, 0, 0.252, -0.088);
    const s0 = joint(base);
    const L0 = 0.22, L1 = 0.24;
    mesh(s0, sub(limb({ length: L0, r0: 0.034, r1: 0.026, bulge: 0.006 }), 0), M.hair);
    const s1 = joint(s0, 0, -L0, 0);
    mesh(s1, sub(limb({ length: L1, r0: 0.026, r1: 0.007, bulge: 0.004 }), 1), M.hair);
    streamers.push({ segs: [s0, s1], len: [L0, L1], out: 0.14, lag: 0.9, max: 2.0 });
  } else if (look === 'b') {
    // the cloth over the lower face, knotted behind
    mesh(head, sub(bandGeometry(0.096, 0.112, 0.07, 24), 0), M.shirt, 0, 0.085, 0.006);
    mesh(head, foldLines(tatterStrip(0.12, 0.03, { tip: false, curl: 0.2, seed: 851 }), ribbonCrease(0.03, 0.8)), M.shirt, 0, 0.09, -0.11);
  } else {
    // short grey hair: a few cropped locks standing off the cap
    const locks = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      locks.push(sub(ellipsoidGeometry(0.03, 0.022, 0.03, { widthSegs: 6, heightSegs: 4 }).translate(Math.sin(a) * 0.075, 0.235 - 0.02 * Math.abs(Math.cos(a)), Math.cos(a) * 0.075 - 0.02), i & 1));
    }
    mesh(head, mergeGeometries(locks), M.hair);
  }
  return { streamers };
}

// ================================================================= the robe (chest)
function buildRobe({ spine, chest, M, BODY, REST, mesh, joint }) {
  const look = sheathLookNow();
  const ySp = (h) => h - REST.spine, yCh = (h) => h - REST.chest;
  const SHELL = BODY.shell, top = SHELL[SHELL.length - 1];
  const rings = [...SHELL, { y: top.y + 0.02, rx: 0.06, rz: 0.058 }].map((r) => ({ ...r, rx: r.rx + 0.008, rz: r.rz + 0.008, gap: 0, y: ySp(r.y) }));
  // (c: the robe worn off the sword arm: its right shoulder bare, the fold of it gathered at the waist)
  const g = foldLines(shellGeometry(rings, { sub: 3, cols: 28 }), (x, y, z) => (z > 0 ? 0.5 + 10 * (x - 0.03 + (ySp(1.5) - y) * 0.6) : 0.35 + 0.3 * Math.sin(x * 40 + y * 9)));
  if (look === 'c') {
    const p = g.attributes.position;
    // pull the right half of the shell down under the arm: the bare shoulder and chest
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      if (x < -0.02 && y > ySp(1.3)) p.setY(i, ySp(1.3) + (y - ySp(1.3)) * 0.15);
    }
    g.computeVertexNormals();
    // the bare right shoulder and chest
    mesh(chest, ellipsoidGeometry(0.075, 0.08, 0.07, { widthSegs: 10, heightSegs: 6 }), M.skin, -0.09, yCh(1.42), 0.0);
    // the fold of the robe gathered at the waist on his right
    mesh(spine, sub(bandGeometry(SHELL[1].rx + 0.03, SHELL[1].rz + 0.03, 0.08, 24), 1), M.coat, 0, ySp(1.22), SHELL[1].cz ?? 0);
  }
  mesh(spine, g, M.coat);
  // the collar band (a: the white of mourning at the neck)
  mesh(chest, sub(bandGeometry(0.106, 0.098, 0.04, 20).translate(0, yCh(1.49), 0.006), 1), look === 'a' ? M.hem : M.lining);
  // the sash: a plain cord (a, c) / a dark band (b)
  const W = SHELL[1];
  mesh(spine, bandGeometry(W.rx + 0.022, W.rz + 0.022, look === 'b' ? 0.09 : 0.04, 32), M.shirt, 0, ySp(1.19), W.cz ?? 0);
  if (look !== 'd') return null;
  // d: the long scarf: two loose turns round the neck, two tails down the back on springs (they trail)
  mesh(chest, mergeGeometries([
    sub(bandGeometry(0.118, 0.11, 0.07, 24).translate(0, yCh(1.505), 0.004), 1),
    sub(bandGeometry(0.128, 0.118, 0.045, 24).translate(0.004, yCh(1.47), 0.008), 0),
  ]), M.leather);
  // one end thrown forward over his left shoulder, lying on the chest
  mesh(chest, foldLines(tatterStrip(0.24, 0.06, { fork: true, curl: 0.08, seed: 867 }), ribbonCrease(0.06, 0.8)), M.leather, 0.07, yCh(1.47), 0.128);
  const streamers = [];
  for (const [sx, L0, L1, seed] of [[0.02, 0.34, 0.36, 871], [0.085, 0.3, 0.3, 883]]) {
    const base = joint(chest, sx, yCh(1.5), -0.172);
    const s0 = joint(base);
    // (each strip twice, the second mirrored: a strip is one-sided, and these are seen from behind)
    const g0 = foldLines(tatterStrip(L0, 0.062, { tip: false, curl: 0.1, seed }), ribbonCrease(0.062, 0.7));
    mesh(s0, g0, M.leather);
    mesh(s0, mirrored(g0), M.leather);
    const s1 = joint(s0, 0, -L0, 0);
    const g1 = foldLines(tatterStrip(L1, 0.056, { fork: true, curl: 0.16, seed: seed + 5 }), ribbonCrease(0.056, 1.1));
    mesh(s1, g1, M.leather);
    mesh(s1, mirrored(g1), M.leather);
    streamers.push({ segs: [s0, s1], len: [L0, L1], out: 0.14, lag: 1.1, max: 2.2 });
  }
  return { streamers };
}

// ================================================================= the arms
function buildSleeves({ arms, sword, M, DIM, BODY, mesh }) {
  const look = sheathLookNow();
  const [ua0, ua1] = BODY.upperArm, [fa0, fa1] = BODY.foreArm, HK = BODY.hand;
  {
    const F = gripFist(HK);
    mesh(sword, mergeGeometries([F.fingers, F.thumb, F.ridge]), M.skin);
  }
  for (const side of [-1, 1]) {
    const R = side < 0;
    const { upper, fore } = arms[R ? 'R' : 'L'];
    const bare = R && look === 'c';
    mesh(upper, mergeGeometries([
      sub(limb({ length: DIM.upperArm, r0: ua0 + (bare ? 0 : 0.008), r1: ua1 + (bare ? 0 : 0.01), bulge: 0.012 }), 1),
      sub(ellipsoidGeometry(ua1 + 0.012, ua1 + 0.01, ua1 + 0.014, { widthSegs: 10, heightSegs: 6 }).translate(0, -DIM.upperArm, -0.004), 1),
    ]), bare ? M.skin : M.coat);
    // the forearm: a sleeve bound at the wrist (a, b), the bare arm (c's right)
    mesh(fore, sub(limb({ length: DIM.foreArm - 0.06, r0: fa0 + (bare ? 0 : 0.014), r1: fa1 + (bare ? 0 : 0.006), bulge: bare ? 0.004 : 0.012 }), 1), bare ? M.skin : M.coat);
    // the binding at the wrist (cord wraps); c: the bare arm bound with cord from the elbow down
    const wraps = [];
    const n = bare ? 6 : 3, y0 = bare ? -0.06 : -DIM.foreArm + 0.16, y1 = -DIM.foreArm + 0.06;
    for (let i = 0; i < n; i++) {
      const t = i / Math.max(1, n - 1), y = lerp(y0, y1, t), r = lerp(fa0, fa1, Math.min(1, -y / DIM.foreArm)) + (bare ? 0.004 : 0.012);
      wraps.push(sub(limbGeometry({ length: 0.018, r0: r, r1: r, radial: 10, rings: 1 }).rotateX(Math.PI / 2).translate(0, y, 0), i & 1));
    }
    mesh(fore, mergeGeometries(wraps), bare ? M.leather : M.shirt);
    if (!R) {
      const H = looseHand(DIM.foreArm - 0.03, side, HK);
      mesh(fore, mergeGeometries([H.palm, H.fingers, H.tips, H.thumb]), M.skin);
    } else {
      mesh(fore, ellipsoidGeometry(0.034 * HK, 0.04 * HK, 0.042 * HK, { widthSegs: 10, heightSegs: 6 }).translate(0, -DIM.foreArm + 0.022, 0.004), M.skin);
    }
  }
}

// ================================================================= b: the straw rain cape (shoulders)
function buildCape({ chest, M, REST, mesh }) {
  if (sheathLookNow() !== 'b') return null;
  const yCh = (h) => h - REST.chest;
  const rings = [
    { y: yCh(1.56), rx: 0.08, rz: 0.075 },
    { y: yCh(1.5), rx: 0.17, rz: 0.15 },
    { y: yCh(1.36), rx: 0.29, rz: 0.24 },
    { y: yCh(1.16), rx: 0.37, rz: 0.31 },
    { y: yCh(0.98), rx: 0.42, rz: 0.35 },
  ].map((r) => ({ ...r, gap: 0, cz: -0.02 }));
  // straw: close vertical fold lines (bundled reeds), a ragged hem of strips round the bottom
  const g = foldLines(shellGeometry(rings, { sub: 2, cols: 40 }), (x, y, z, u) => 0.5 + 0.55 * Math.sin(u * 160));
  mesh(chest, g, M.leather);
  mesh(chest, g, M.lining);
  const strips = [];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const s = tatterStrip(0.14 + 0.06 * Math.abs(Math.sin(i * 2.3)), 0.06, { tip: true, curl: 0.3, seed: 900 + i });
    s.rotateY(a);
    s.translate(Math.sin(a) * 0.41, yCh(1.0), Math.cos(a) * 0.34 - 0.02);
    strips.push(sub(s, i & 1));
  }
  mesh(chest, mergeGeometries(strips), M.leather);
  return null;
}

// ================================================================= legs and the robe skirt (Shen Hui's cut)
function buildLegs({ pelvis, legs, M, DIM, BODY, mesh }) {
  {
    const [hx, hy, hz] = BODY.hips.r;
    mesh(pelvis, ellipsoidGeometry(hx + 0.01, hz + 0.01, hy + 0.01).rotateX(-Math.PI / 2), M.pants, ...BODY.hips.c);
  }
  const [th0, th1] = BODY.thigh, [sh0, sh1] = BODY.shin;
  for (const side of [-1, 1]) {
    const { thigh, shin, foot } = legs[side < 0 ? 'R' : 'L'];
    mesh(thigh, limb({ length: DIM.thigh, r0: th0 + 0.014, r1: th1 + 0.016, bulge: 0.016 }), M.pants);
    mesh(shin, sub(limb({ length: 0.12, r0: th1 + 0.014, r1: sh0 + 0.012 }), 1), M.pants);
    const wraps = [];
    const n = 6, y0 = -0.11, y1 = -DIM.shin + 0.05;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), y = lerp(y0, y1, t), r = lerp(sh0, sh1, t) + 0.004;
      wraps.push(sub(limb({ length: (y0 - y1) / (n - 1) + 0.014, r0: r + 0.003, r1: r, radial: 10, rings: 2, capSegs: 1 }).translate(0, y + 0.007, 0), i & 1));
    }
    mesh(shin, mergeGeometries(wraps), M.hem);
    const F = BODY.foot;
    mesh(foot, ellipsoidGeometry(F.r[0] * 0.92, F.r[1] * 0.85, F.r[2] * 0.95, { widthSegs: 10, heightSegs: 6 }).translate(F.c[0], F.c[1] - 0.004, F.c[2]), M.shirt);
  }
}

function buildRobeSkirt({ pelvis, M, DIM, mesh, joint }) {
  const coat = [];
  // (b: the cape covers the top; the travelling clothes' skirt shorter)
  const short = sheathLookNow() === 'b' ? 0.7 : 1;
  // (d: the pleated skirt is his wide trousers: their charcoal, not the robe's indigo)
  const skirtM = sheathLookNow() === 'd' ? M.pants : M.coat;
  ROBE_PANELS.forEach((P, i) => {
    const sa = Math.sin(P.az), ca = Math.cos(P.az);
    const R0 = 1 / Math.hypot(sa / DIM.coatR, ca / (DIM.coatR * 0.69)) + P.out * 0.5;
    const anchor = joint(pelvis, sa * R0, DIM.coatY + 0.02, ca * R0);
    anchor.rotation.y = P.az;
    const s0 = joint(anchor);
    const sk = P.skew ?? 0, w0 = P.w[0];
    const nF = Math.max(1, Math.round(P.w[2] / 0.09)) + 0.5, fph = i * 2.3 + 0.4;
    const L0 = P.len[0] * short, L1 = P.len[1] * short;
    const wAt = (d) => (d < L0 ? lerp(P.w[0], P.w[1], d / L0) : lerp(P.w[1], P.w[2], Math.min(1, (d - L0) / L1)));
    const pleat = (d0) => (x, y, z, u, gy) => {
      const d = d0 - gy, w = wAt(d);
      const s = (u - sheetOffset(w, w0, sk)) / w + 0.5;
      return 0.5 + 0.6 * Math.sin(Math.PI * 2 * nF * s + fph + Math.PI) - 0.9 * Math.max(0, 1 - d / 0.12);
    };
    const g0 = foldLines(skirtSheet(L0, P.w[0], P.w[1], R0, 0.25, 0, 51 + i, [0.003, 0.012, nF, fph], 0, 1, sk, w0), pleat(0));
    mesh(s0, g0, skirtM);
    mesh(s0, g0, M.lining);
    const s1 = joint(s0, 0, -L0, 0);
    const R1 = R0 + 0.25 * L0;
    const g1 = foldLines(skirtSheet(L1, P.w[1], P.w[2], R1, 0.25, 0.008, 71 + i, [0.012, 0.024, nF, fph], 0, 1, sk, w0), pleat(L0));
    mesh(s1, g1, skirtM);
    mesh(s1, g1, M.lining);
    coat.push({ anchor, segs: [s0, s1], def: P, strips: [], len: [L0, L1], r0: R0 });
  });
  return { coat };
}

// ================================================================= the sword (ADR-145: the sheath on the rig)
/** Sword-joint space (origin = the grip of the right hand, +Z along the weapon). Carried, the hand
 *  holds the SCABBARD just below its mouth (`mouth` -0.06 .. `end` 0.86), the hilt behind the hand;
 *  drawn, the hand holds the hilt and the blade runs from `base` to `tip` (1.05 m, a straight single
 *  edge). The left-wrist piece (sheathed.js) is the scabbard from the left hand back (+Z), the hilt
 *  standing out of its mouth when it is in. */
export const SWORD_DIMS = Object.freeze({
  mouth: -0.06, end: 0.86, hiltLen: 0.27, guardZ: 0.06, base: 0.08, tip: 1.13, width: 0.03, sheathR: 0.022,
});
/** kit.blade by sheath state (the engine's weapon segment: wards, sweeps, bladeSegment): sheathed.js
 *  writes the live one into kit.blade. */
export const BLADE_SPAN = Object.freeze({ carry: { guard: SWORD_DIMS.mouth, tip: SWORD_DIMS.end }, drawn: { guard: SWORD_DIMS.base, tip: SWORD_DIMS.tip } });

/** The scabbard along +Z from z0 to z1: black lacquer, a pale throat at z0 and a pale butt cap at z1. */
export function scabbardGeos(z0, z1, r = SWORD_DIMS.sheathR) {
  const L = z1 - z0;
  const body = limbGeometry({ length: L, r0: r, r1: r * 0.92, radial: 6, rings: 3 }).translate(0, 0, z0);
  // (limbGeometry runs along +Z from 0: the piece's own axis)
  const throat = limbGeometry({ length: 0.045, r0: r + 0.004, r1: r + 0.004, radial: 6, rings: 1 }).translate(0, 0, z0);
  const cap = limbGeometry({ length: 0.04, r0: r * 0.95 + 0.003, r1: r * 0.7, radial: 6, rings: 1 }).translate(0, 0, z1 - 0.04);
  return { body: sub(body, 0), pale: mergeGeometries([sub(throat, 0), sub(cap, 1)]) };
}
/** The hilt from z0 backward (toward -Z) `len` long: a plain round guard at z0, a corded grip, a cap. */
export function hiltGeos(z0, len = SWORD_DIMS.hiltLen) {
  const guard = ellipsoidGeometry(0.036, 0.036, 0.008, { widthSegs: 12, heightSegs: 4 }).translate(0, 0, z0);
  const bands = [];
  for (let k = 0; k < 6; k++) bands.push(sub(limbGeometry({ length: len / 6 + 0.002, r0: 0.0155, r1: 0.016, radial: 6, rings: 1 }).translate(0, 0, z0 - 0.012 - ((k + 1) * len) / 6), k & 1));
  const cap = ellipsoidGeometry(0.019, 0.019, 0.014, { widthSegs: 8, heightSegs: 4 }).translate(0, 0, z0 - 0.014 - len);
  return { guard: mergeGeometries([sub(guard, 0), sub(cap, 1)]), grip: mergeGeometries(bands) };
}
/** The bare blade from `base` to `tip`: a straight single edge (a flat back, the edge on one side), a
 *  short point. Built along +Z from 0 with length 1 (sheathed.js scales z to grow it out of the hilt). */
function bladeGeo() {
  const D = SWORD_DIMS, L = 1, w = D.width;
  const g = boxGeometry(w, 0.008, L * 0.93, 0, 0, L * 0.465);
  const tip = boxGeometry(w * 0.7, 0.007, L * 0.07, -w * 0.15, 0, L * 0.965);
  const p = tip.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getZ(i) > L * 0.97) p.setX(i, p.getX(i) * 0.15 + w * 0.3);
  tip.computeVertexNormals();
  return mergeGeometries([sub(g, 0), sub(tip, 1)]);
}

function buildSword({ sword, M, mesh }) {
  const D = SWORD_DIMS;
  // carried: the scabbard in the hand, the hilt behind it
  const sc = scabbardGeos(D.mouth, D.end), hc = hiltGeos(D.mouth - 0.012);
  const carry = [mesh(sword, sc.body, M.trim), mesh(sword, sc.pale, M.facing), mesh(sword, hc.guard, M.trim), mesh(sword, hc.grip, M.shirt)];
  for (const m of carry) m.name = 'sheathCarry';
  // drawn: the hilt in the hand, the bare blade
  const hd = hiltGeos(D.guardZ, D.hiltLen);
  const drawnHilt = [mesh(sword, hd.guard, M.trim, 0, 0, 0.0), mesh(sword, hd.grip, M.shirt, 0, 0, 0.0)];
  // (the grip runs back from the guard through the fist: shifted so the fist sits in its middle)
  for (const m of drawnHilt) m.position.z = D.hiltLen * 0.45;
  const blade = mesh(sword, bladeGeo(), M.armor, 0, 0, D.base);
  blade.scale.z = D.tip - D.base;
  blade.name = 'sheathBlade';
  const edge = mesh(sword, boxGeometry(0.004, 0.009, 0.9, D.width * 0.5, 0, 0.47), M.bevel, 0, 0, D.base);
  edge.scale.z = D.tip - D.base;
  edge.name = 'sheathEdge';
  for (const m of drawnHilt) m.name = 'sheathDrawn';
  for (const m of [...drawnHilt, blade, edge]) m.visible = false;
  return { keep: [...carry, ...drawnHilt, blade, edge] };
}

/** The left-wrist piece (sheathed.js hangs it on a joint at the left hand, along the pose's `lsw`):
 *  the scabbard from the hand back (+Z), the hilt in its mouth (`hilt`, hidden while the blade is out),
 *  the left fist closed on the mouth. Its own meshes (the rig's materials). */
export function buildOffSheath(M, HK = 1) {
  const D = SWORD_DIMS;
  const root = new THREE.Object3D();
  root.name = 'sheathOff';
  root.rotation.order = 'YXZ';
  const add = (geo, mat, name = '') => {
    if (!geo.attributes.aPart) sub(geo, 0);
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    root.add(m);
    return m;
  };
  const L = D.end - D.mouth;
  const sc = scabbardGeos(0, L);
  add(sc.body, M.trim, 'sheathOffScabbard');
  add(sc.pale, M.facing, 'sheathOffScabbard');
  const h = hiltGeos(-0.012);
  const hilt = [add(h.guard, M.trim, 'sheathOffHilt'), add(h.grip, M.shirt, 'sheathOffHilt')];
  const F = gripFist(HK * 1.05);
  add(mergeGeometries([F.fingers, F.thumb, F.ridge]), M.skin, 'sheathOffFist');
  return { root, hilt };
}

/** The set (registered into the hero's gear registry on import). */
export const SHEATH_ITEMS = [
  { id: 'sheath.head', slot: 'head', name: 'Mourning Band', hidesHair: true, build: opted(buildHead) },
  { id: 'sheath.robe', slot: 'chest', name: 'Hemp Robe', build: opted(buildRobe) },
  { id: 'sheath.sleeves', slot: 'arms', name: 'Bound Sleeves', build: opted(buildSleeves) },
  { id: 'sheath.cape', slot: 'shoulders', name: 'Reed Cloak', build: opted(buildCape) },
  { id: 'sheath.legs', slot: 'legs', name: 'Wrapped Trousers', build: opted(buildLegs) },
  { id: 'sheath.skirt', slot: 'waist', name: 'Robe Skirt', build: opted(buildRobeSkirt) },
  { id: 'sheath.sword', slot: 'weapon', name: 'The Sleeping Sword', dims: SWORD_DIMS, build: opted(buildSword) },
];
for (const item of SHEATH_ITEMS) registerItem(item);

/** What he wears (the cape only shows in body b: its build hangs nothing otherwise). */
export const SHEATH_LOADOUT = Object.freeze({
  head: 'sheath.head',
  chest: 'sheath.robe',
  shoulders: 'sheath.cape',
  arms: 'sheath.sleeves',
  legs: 'sheath.legs',
  waist: 'sheath.skirt',
  back: null,
  weapon: 'sheath.sword',
});
