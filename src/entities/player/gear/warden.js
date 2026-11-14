import { ellipsoidGeometry } from '../../../render/glyphGeometry.js';
import {
  shellGeometry, bandGeometry, mergeGeometries, sub, foldLines, lerp, limb, gripFist, arcPlate, strapGeometry, place, ring, orient,
} from '../heroGeo.js';
import { hangSheet, panelSkirt } from './sheet.js';
import { buildFreeHand } from './hands.js';
import { buildHoodHair } from './shroud.js';

// OUTFIT OPTION "Moon Warden" (gear/looks.js `warden`; the owner picks one of three): a wandering
// warden in laced slate-blue lamellar plates (front and back plates, open at the sides under the
// arms) over a dark indigo under-robe; a three-row lamellar pauldron on the LEFT (free) arm and a
// splinted left vambrace, so the armour frames the free hand; a short indigo capelet over the RIGHT
// shoulder, lined in self-lit cyan, with one tail to the hip; a bare gold head with short swept-back
// locks under a dark headband, a cyan crescent on the brow and one forked moon-silver ribbon from the
// knot behind; a knee-length split skirt; dark boots with slate greave splints. The crescent is the
// motif (the brow, the clasp, the belt plaque). Over the Wanderer's sword. Colours: WARDEN_TINT.
// The lamellar plates are the `spike` material on purpose: no worn item of this look uses it
// otherwise (the Wanderer's pauldron, arms and knee spike are not worn), so the tint is theirs alone.
//   head       warden.band      bare, short locks, the headband, the brow crescent, WARDEN_RIBBON
//   chest      warden.cuirass   the under-robe, WARDEN_LAMELLAR rows (arcs), lacing, belt, straps
//   shoulders  warden.pauldron  PAULDRON_L on the left upper arm
//   arms       warden.arms      a plain sword arm, the splinted free forearm, bare hands
//   legs       warden.legs      pants, dark boots with greave splints
//   waist      warden.skirt     WARDEN_PANELS (panelSkirt)
//   back       warden.mantle    the capelet over the right shoulder and WARDEN_MANTLE (its tail)

/** A crescent (a cyan disc partly covered by a dark one), facing +Z: { glow, dark } geometries. */
function crescent(r) {
  return {
    glow: ring(r, r, 0.0015, 12).rotateX(Math.PI / 2),
    dark: ring(0.8 * r, 0.8 * r, 0.002, 12).rotateX(Math.PI / 2).translate(0.45 * r, 0.3 * r, 0.0015),
  };
}
const putCrescent = (mesh, parent, M, r, x, y, z) => {
  const c = crescent(r);
  mesh(parent, c.glow, M.facing, x, y, z);
  mesh(parent, c.dark, M.shirt, x, y, z);
};

// ---------------------------------------------------------------- head: the headband, the ribbon
/** Gold locks (buildHoodHair's format; head space): short wisps falling under the band, the side
 *  locks swept back over the ears (no long temple locks: that is the Robe's head). */
const WARDEN_LOCKS = {
  fringe: [[-0.03, 0.19, 0.098, -0.3, -1, 0.5, 0.045, 0.011, 0.25], [0.034, 0.19, 0.096, 0.35, -1, 0.45, 0.04, 0.011, 0.25]],
  sides: [[0.084, 0.19, 0.04, 0.3, -0.5, -0.8, 0.11, 0.015, 0.2], [0.09, 0.16, 0.0, 0.3, -0.7, -0.6, 0.09, 0.014, 0.2]],
};
/** One forked moon-silver ribbon from the band's knot (hangSheet; head space): the root ≈ 1.4 cm
 *  outside the head, kept at least 0.1 rad out (`inMax`) so it clears the occiput; off the grass in
 *  the forward roll, where his crown meets it (`floor`). */
export const WARDEN_RIBBON = { at: [0, 0.198, -0.126], ry: Math.PI, ribbon: true, fork: true, w: [0.09, 0.09, 0.08], len: [0.24, 0.26], out: 0.42, lag: 1.0, max: 2.4, inMax: [-0.1, 0.15], floor: true, seed: 7 };
function buildBand(ctx) {
  const { head, M, mesh } = ctx;
  buildHoodHair(head, M, mesh, WARDEN_LOCKS);
  // the dark band round the head, 0.5-0.9 cm proud of the hair, and its knot behind
  mesh(head, sub(bandGeometry(0.103, 0.11, 0.026, 24), 1), M.shirt, 0, 0.205, -0.008);
  mesh(head, sub(ellipsoidGeometry(0.024, 0.018, 0.016, { widthSegs: 8, heightSegs: 5 }), 0), M.shirt, 0, 0.203, -0.122);
  // the brow plaque: a silver disc and the cyan crescent on it
  mesh(head, place(ring(0.017, 0.017, 0.004, 12), 0, 0.205, 0.104, Math.PI / 2, 0, 0), M.trim);
  putCrescent(mesh, head, M, 0.011, 0, 0.205, 0.108);
  return { streamers: [hangSheet(ctx, head, WARDEN_RIBBON, { face: M.hem, back: null, hem: M.hem })] };
}

// ---------------------------------------------------------------- chest: the lamellar cuirass
/** The lamellar rows (world idle heights; `off` = how far the plates stand off the torso shell,
 *  `flare` = the lower edge's extra, so each row laps over the one below). */
export const WARDEN_LAMELLAR = [
  { lo: 1.2, hi: 1.262, off: 0.02, flare: 0.006 },
  { lo: 1.255, hi: 1.318, off: 0.019, flare: 0.006 },
  { lo: 1.345, hi: 1.405, off: 0.017, flare: 0.006 },
  { lo: 1.398, hi: 1.462, off: 0.016, flare: 0.005 },
];
/** Every row is a front plate and a back plate: arcs (rad: 0 = his front, + = his left), open at
 *  the sides, where the hanging upper arms are (full rings cut into them). The front plate stops
 *  short on his left: the free arm comes forward there in the guard (measured: 1.8 cm into it at
 *  +0.7 rad). */
export const WARDEN_ARCS = [[-0.8, 0.55], [Math.PI - 0.85, Math.PI + 0.85]];
function buildCuirass({ spine, chest, M, BODY, REST, mesh }) {
  const ySp = (h) => h - REST.spine, yCh = (h) => h - REST.chest;
  const SHELL = BODY.shell, top = SHELL[SHELL.length - 1];
  const at = (h) => {
    let k = 0;
    while (k < SHELL.length - 2 && SHELL[k + 1].y < h) k++;
    const A = SHELL[k], B = SHELL[k + 1], u = Math.min(1, Math.max(0, (h - A.y) / (B.y - A.y)));
    return [lerp(A.rx, B.rx, u), lerp(A.rz, B.rz, u), lerp(A.cz ?? 0, B.cz ?? 0, u)];
  };
  // the dark indigo under-robe
  const rings = [...SHELL, { y: top.y + 0.02, rx: 0.058, rz: 0.056 }].map((r) => ({ ...r, gap: 0, y: ySp(r.y) }));
  mesh(spine, shellGeometry(rings, { sub: 3, cols: 28 }), M.shirt);
  // the plates: one lamella every 0.034 m (a half period of the fold field; the material's sub
  // shade darkens every other one), each row's flared lower edge over the row below
  const plates = (lo, hi, off, flare, A) => {
    const a = at(lo), b = at(hi);
    const g = shellGeometry([
      { y: ySp(lo), rx: a[0] + off + flare, rz: a[1] + off + flare, cz: a[2] },
      { y: ySp(hi), rx: b[0] + off, rz: b[1] + off, cz: b[2] },
    ], { sub: 1, cols: Math.max(4, Math.round((112 * (A[1] - A[0])) / (Math.PI * 2))), arc: A });
    return g;
  };
  WARDEN_LAMELLAR.forEach((R, k) => {
    for (const A of WARDEN_ARCS) {
      mesh(spine, foldLines(plates(R.lo, R.hi, R.off, R.flare, A), (x, y, z, u) => 0.5 + 0.42 * Math.tanh(3 * Math.sin(u * 92 + k * 1.3))), M.spike);
    }
  });
  // the lacing between rows 2 and 3: the far read's silver line
  for (const A of WARDEN_ARCS) mesh(spine, plates(1.317, 1.343, 0.023, 0, [A[0] * 0.95 + A[1] * 0.05, A[1] * 0.95 + A[0] * 0.05]), M.bevel);
  // the belt under row 1's lower edge, its silver plaque and crescent
  const W = at(1.19);
  mesh(spine, bandGeometry(W[0] + 0.016, W[1] + 0.016, 0.05, 32), M.leather, 0, ySp(1.19), W[2]);
  mesh(spine, place(ring(0.026, 0.026, 0.006, 14), 0, ySp(1.19), W[1] + W[2] + 0.024, Math.PI / 2, 0, 0), M.trim);
  putCrescent(mesh, spine, M, 0.016, 0, ySp(1.19), W[1] + W[2] + 0.028);
  // shoulder straps joining the front and back plates over each shoulder
  mesh(chest, mergeGeometries([-1, 1].flatMap((s) => [
    strapGeometry([s * 0.085, yCh(1.458), 0.122], [s * 0.112, yCh(1.515), 0], 0.034, 0.008, [1, 0, 0]),
    strapGeometry([s * 0.112, yCh(1.515), 0], [s * 0.085, yCh(1.458), -0.112], 0.034, 0.008, [1, 0, 0]),
  ])), M.leather);
  // the collar: two bands of the indigo coat, a cyan rim at the top
  mesh(chest, mergeGeometries([
    sub(bandGeometry(0.1, 0.092, 0.05, 20).translate(0, yCh(1.5), 0.006), 0),
    sub(bandGeometry(0.114, 0.104, 0.03, 20).translate(0, yCh(1.47), 0.008), 1),
  ]), M.coat);
  mesh(chest, bandGeometry(0.101, 0.093, 0.006, 20).translate(0, yCh(1.527), 0.006), M.facing);
}

// ---------------------------------------------------------------- shoulders: the left pauldron
/** Three rows of six lamellae round the LEFT upper arm's outer side (arcPlate: +π/2 = +X, the left
 *  arm's outside), clear of the deltoid (its outer x ≈ 0.082). All on arms.L.upper: the `pauldron`
 *  joint is the right shoulder's. */
export const PAULDRON_L = {
  ac: Math.PI / 2,
  n: 6,
  rows: [
    { y0: 0.025, y1: -0.055, r0: 0.088, r1: 0.1, half: 1.35 },
    { y0: -0.04, y1: -0.115, r0: 0.094, r1: 0.098, half: 1.3 },
    { y0: -0.1, y1: -0.17, r0: 0.088, r1: 0.09, half: 1.2 },
  ],
};
function buildPauldron({ arms, M, mesh }) {
  const up = arms.L.upper, P = PAULDRON_L, lam = [], bev = [];
  for (const R of P.rows) {
    for (let j = 0; j < P.n; j++) {
      const o = 0.0015 * (j & 1);
      lam.push(sub(arcPlate(R.y0, R.y1, R.r0 + o, R.r1 + o, P.ac + (j - (P.n - 1) / 2) * ((2 * R.half) / P.n), (1.12 * R.half) / P.n, 2), j & 1));
    }
    bev.push(arcPlate(R.y1 + 0.009, R.y1, R.r1 + 0.003, R.r1 + 0.003, P.ac, R.half, 8));
  }
  mesh(up, mergeGeometries(lam), M.spike);
  mesh(up, mergeGeometries(bev), M.bevel);
  // the cord's knot at the top row, and the strap round the arm under the last row
  const T = P.rows[0];
  mesh(up, ellipsoidGeometry(0.008, 0.006, 0.006, { widthSegs: 6, heightSegs: 4 }), M.facing, T.r0 + 0.004, T.y0 - 0.01, 0);
  mesh(up, bandGeometry(0.07, 0.07, 0.014, 14), M.leather, 0, -0.185, 0);
}

// ---------------------------------------------------------------- arms: the plain sword arm, the splinted free arm
function buildArms(ctx) {
  const { arms, sword, M, DIM, BODY, mesh } = ctx;
  const [ua0, ua1] = BODY.upperArm, [fa0, fa1] = BODY.foreArm, HK = BODY.hand;
  {
    const F = gripFist(HK);
    mesh(sword, mergeGeometries([F.fingers, F.thumb, F.ridge]), M.skin);
  }
  for (const side of [-1, 1]) {
    // the coat sleeve: sleeve, deltoid, a ball over the elbow (as the Shrouded set's)
    mesh(arms[side < 0 ? 'R' : 'L'].upper, mergeGeometries([
      sub(limb({ length: DIM.upperArm, r0: ua0, r1: ua1 + 0.002, bulge: 0.008 }), 1),
      sub(ellipsoidGeometry(...BODY.deltoid, { widthSegs: 12, heightSegs: 8 }).translate(side * 0.008, -0.02, 0), 1),
      sub(ellipsoidGeometry(ua1 + 0.006, ua1 + 0.004, ua1 + 0.008, { widthSegs: 10, heightSegs: 6 }).translate(0, -DIM.upperArm, -0.004), 1),
    ]), M.coat);
  }
  const rF = (y) => lerp(fa0, fa1, -y / DIM.foreArm);
  // the sword arm: the coat's cuff, a dark forearm, two leather bands, the bare hand on the grip
  {
    const fore = arms.R.fore;
    mesh(fore, sub(limb({ length: 0.085, r0: ua1 + 0.002, r1: fa0 + 0.004 }), 1), M.coat);
    mesh(fore, limb({ length: 0.15, r0: fa0 + 0.002, r1: fa1 + 0.002 }).translate(0, -0.07, 0), M.shirt);
    mesh(fore, mergeGeometries([-0.1, -0.185].map((y, i) => sub(bandGeometry(rF(y) + 0.006, rF(y) + 0.006, 0.016, 14).translate(0, y, 0), i))), M.leather);
    mesh(fore, mergeGeometries([
      limb({ length: 0.05, r0: fa1 - 0.006, r1: fa1 - 0.004, radial: 8, rings: 2, capSegs: 1 }).translate(0, -DIM.foreArm + 0.07, 0),
      ellipsoidGeometry(0.034 * HK, 0.04 * HK, 0.042 * HK, { widthSegs: 10, heightSegs: 6 }).translate(0, -DIM.foreArm + 0.022, 0.004),
    ]), M.skin);
  }
  // the free arm: the cuff, a dark under-sleeve and wrist wrap, five slate splints on the back of
  // the forearm (+X: looseHand's palm faces −X), a bevel along their top, two leather bands
  {
    const fore = arms.L.fore;
    mesh(fore, sub(limb({ length: 0.07, r0: ua1 + 0.002, r1: fa0 + 0.006 }), 1), M.coat);
    mesh(fore, mergeGeometries([
      limb({ length: 0.19, r0: fa0, r1: fa1 - 0.002 }).translate(0, -0.06, 0),
      sub(limb({ length: 0.045, r0: fa1 - 0.002, r1: fa1 - 0.004 }).translate(0, -0.205, 0), 1),
    ]), M.shirt);
    const spl = [];
    for (let i = 0; i < 5; i++) spl.push(sub(arcPlate(-0.062, -0.205, fa0 + 0.014, fa1 + 0.012, Math.PI / 2 + (i - 2) * 0.42, 0.23, 2), i & 1));
    mesh(fore, mergeGeometries(spl), M.spike);
    mesh(fore, arcPlate(-0.062, -0.07, fa0 + 0.0155, fa0 + 0.0155, Math.PI / 2, 1.1, 8), M.bevel);
    mesh(fore, mergeGeometries([
      bandGeometry(lerp(fa0, fa1, 0.35) + 0.017, lerp(fa0, fa1, 0.35) + 0.017, 0.014, 14).translate(0, -0.095, 0),
      sub(bandGeometry(lerp(fa0, fa1, 0.69) + 0.015, lerp(fa0, fa1, 0.69) + 0.015, 0.014, 14).translate(0, -0.185, 0), 1),
    ]), M.leather);
    mesh(fore, ellipsoidGeometry(0.008, 0.006, 0.006, { widthSegs: 6, heightSegs: 4 }), M.facing, fa0 + 0.022, -0.095, 0);
  }
  return buildFreeHand(ctx);
}

// ---------------------------------------------------------------- legs: pants, dark boots with greave splints
function buildLegs({ pelvis, legs, M, DIM, BODY, mesh }) {
  {
    const [hx, hy, hz] = BODY.hips.r;
    mesh(pelvis, orient.up(ellipsoidGeometry(hx, hz, hy)), M.pants, ...BODY.hips.c);
  }
  const [th0, th1, thB] = BODY.thigh, [sh0, sh1, shB] = BODY.shin, F = BODY.foot;
  const rS = (y) => lerp(sh0, sh1, -y / DIM.shin);
  for (const side of [-1, 1]) {
    const { thigh, shin, foot } = legs[side < 0 ? 'R' : 'L'];
    mesh(thigh, limb({ length: DIM.thigh, r0: th0 + 0.004, r1: th1 + 0.006, bulge: thB + 0.004 }), M.pants);
    // the boot's shaft and its leather cuff under the knee
    mesh(shin, sub(limb({ length: DIM.shin - 0.02, r0: sh0 + 0.01, r1: sh1 + 0.008, bulge: shB }), 1), M.shirt, 0, -0.02, 0);
    mesh(shin, limb({ length: 0.045, r0: sh0 + 0.022, r1: sh0 + 0.018 }), M.leather, 0, -0.01, 0);
    // three slate splints down the front-outer shin, a bevel over their tops, two leather bands
    const spl = [];
    for (let i = 0; i < 3; i++) spl.push(sub(arcPlate(-0.075, -0.3, sh0 + 0.022, sh1 + 0.02, side * 0.55 + (i - 1) * 0.42, 0.23, 2), i & 1));
    mesh(shin, mergeGeometries(spl), M.spike);
    mesh(shin, arcPlate(-0.075, -0.083, sh0 + 0.0235, sh0 + 0.0235, side * 0.55, 0.65, 8), M.bevel);
    mesh(shin, mergeGeometries([-0.13, -0.26].map((y, i) => sub(bandGeometry(rS(y) + 0.026, rS(y) + 0.026, 0.014, 14).translate(0, y, 0), i))), M.leather);
    // the boot's foot and the sole's welt
    mesh(foot, ellipsoidGeometry(F.r[0] * 0.96, F.r[1] * 0.95, F.r[2] * 0.97, { widthSegs: 10, heightSegs: 6 }).translate(...F.c), M.shirt);
    mesh(foot, ellipsoidGeometry(F.r[0] + 0.006, 0.007, F.r[2] + 0.007, { widthSegs: 14, heightSegs: 3 }), M.welt, 0, -0.062, F.c[2]);
  }
}

// ---------------------------------------------------------------- waist: the split skirt
/** Six panels in COAT_PANELS' order: front panels to mid-thigh (hems ≈ 0.69 m), short sides (the
 *  hips show, ≈ 0.87 m) and back tails to just above the knee (≈ 0.53 m); a pale hem band on each. */
export const WARDEN_PANELS = [
  { az: 0.62, w: [0.12, 0.15, 0.17], len: [0.22, 0.2], strips: [], fork: [], out: 0.004, flare: 0.1, skew: 0.6, hemFrom: 0.7 },
  { az: -0.62, w: [0.12, 0.15, 0.17], len: [0.22, 0.2], strips: [], fork: [], out: 0.004, flare: 0.1, skew: -0.6, hemFrom: 0.7 },
  { az: 1.65, w: [0.1, 0.12, 0.13], len: [0.14, 0.1], strips: [], fork: [], out: 0, flare: 0.4, hemFrom: 0.7 },
  { az: -1.65, w: [0.1, 0.12, 0.13], len: [0.14, 0.1], strips: [], fork: [], out: 0, flare: 0.4, hemFrom: 0.7 },
  { az: 2.55, w: [0.16, 0.22, 0.28], len: [0.29, 0.28], strips: [], fork: [], out: 0.008, flare: 0.25, skew: -1.2, slant: 0.04, hemFrom: 0.7 },
  { az: -2.55, w: [0.16, 0.22, 0.28], len: [0.29, 0.28], strips: [], fork: [], out: 0.008, flare: 0.25, skew: 1.2, slant: 0.04, hemFrom: 0.7 },
];
const buildSkirt = (ctx) => panelSkirt(ctx, WARDEN_PANELS, { seed: 70 });

// ---------------------------------------------------------------- back: the capelet over the right shoulder
/** The capelet's one tail, from under its lower edge behind the right shoulder to the right hip
 *  (hangSheet on the chest; one sheet: a second hung in the sword arm's path, and the arms do not
 *  push cloth). */
export const WARDEN_MANTLE = { at: [-0.11, 0.15, -0.185], ry: Math.PI + 0.45, w: [0.17, 0.2, 0.22], len: [0.22, 0.22], out: 0.2, wrap: 0.2, lag: 0.45, max: 1.4, inMax: [0.2, 0.3], hemFrom: 0.7, seed: 7 };
function buildMantle(ctx) {
  const { chest, M, REST, mesh } = ctx;
  const yCh = (h) => h - REST.chest;
  // from his right chest edge over the right shoulder and down his right back to just past the spine;
  // the indigo coat outside, the self-lit cyan lining inside (collarIn: back faces)
  const g = sub(shellGeometry([
    { y: yCh(1.35), rx: 0.262, rz: 0.198, cz: -0.024 },
    { y: yCh(1.4), rx: 0.252, rz: 0.188, cz: -0.02 },
    { y: yCh(1.455), rx: 0.205, rz: 0.152, cz: -0.01 },
    { y: yCh(1.5), rx: 0.122, rz: 0.104, cz: 0.002 },
  ], { sub: 2, cols: 22, arc: [-3.5, -0.42] }), 1);
  mesh(chest, g, M.coat);
  mesh(chest, g, M.collarIn);
  // the clasp at the right collarbone: a silver disc and a crescent
  mesh(chest, place(ring(0.022, 0.022, 0.006, 12), -0.085, yCh(1.47), 0.126, Math.PI / 2, 0, 0), M.trim);
  putCrescent(mesh, chest, M, 0.015, -0.085, yCh(1.47), 0.131);
  return { streamers: [hangSheet(ctx, chest, WARDEN_MANTLE, { face: M.coat, back: M.collarIn, hem: M.hem })] };
}

export const WARDEN_ITEMS = [
  { id: 'warden.band', slot: 'head', name: 'Crescent Headband', hair: ['cap'], build: buildBand },
  { id: 'warden.cuirass', slot: 'chest', name: 'Lamellar Cuirass', build: buildCuirass },
  { id: 'warden.pauldron', slot: 'shoulders', name: 'Left Lamellar Pauldron', build: buildPauldron },
  { id: 'warden.arms', slot: 'arms', name: 'Splinted Vambrace', build: buildArms },
  { id: 'warden.legs', slot: 'legs', name: 'Splinted Boots', build: buildLegs },
  { id: 'warden.skirt', slot: 'waist', name: 'Split Skirt', build: buildSkirt },
  { id: 'warden.mantle', slot: 'back', name: 'Moon Capelet', build: buildMantle },
];

export const WARDEN_LOADOUT = Object.freeze({
  head: 'warden.band', chest: 'warden.cuirass', shoulders: 'warden.pauldron', arms: 'warden.arms',
  legs: 'warden.legs', waist: 'warden.skirt', back: 'warden.mantle', weapon: 'wanderer.sword',
});

/** Its colours (model.js tintHero, this rig only): indigo cloth, near-black under-robe and boots,
 *  slate-blue lamellae (`spike`, every other plate shaded), silver bevels and lacing, a brown belt,
 *  a moon-silver hem and ribbon (bright: thin pale cloth vanishes when dim), and the self-lit cyan of
 *  the capelet's lining (`collarIn`) and the crescents (`facing`). */
export const WARDEN_TINT = {
  coat: { fill: [0.085, 0.1, 0.17] },
  shirt: { fill: [0.05, 0.055, 0.085] },
  pants: { fill: [0.07, 0.078, 0.12] },
  lining: { fill: [0.17, 0.21, 0.3] },
  collarIn: { fill: [0.12, 0.3, 0.42], ink: [0.45, 0.85, 1.15], inkGlow: 0.35, glowK: 0.5 },
  hem: { fill: [0.55, 0.66, 0.82] },
  leather: { fill: [0.26, 0.17, 0.11] },
  spike: { fill: [0.15, 0.19, 0.26], sub: 0.3, spec: [1.0, 18] },
  bevel: { fill: [0.48, 0.55, 0.68] },
  facing: { fill: [0.2, 0.48, 0.64], ink: [0.5, 0.9, 1.2], inkGlow: 0.4, glowK: 0.6 },
};
