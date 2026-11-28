import { ellipsoidGeometry } from '../../../render/glyphGeometry.js';
import {
  shellGeometry, gridGeometry, bandGeometry, boxGeometry, kiteGeometry, mergeGeometries, sub, foldLines, lerp, limb, gripFist, arcPlate, orient,
} from '../heroGeo.js';
import { hangSheet } from './sheet.js';
import { buildFreeHand } from './hands.js';

// OUTFIT OPTION "Hooded Cloak" (gear/looks.js `cloak`; the owner's design sheet "MAIN CHARACTER /
// DESIGN EXPLORATION / 06", 2026-11-28: "replace gcd's outfit with this design, don't replace the
// existing sword"): a tall pointed hood with a silver rim over a face in deep shadow (no hair shows);
// a long black cloak to the ankles, one fold of it wrapped across the chest from the right shoulder
// to the left hip, a thin silver seam down the middle of the back, a green diamond between the
// shoulder blades and three silver ticks over the hem; a fitted black bodysuit with panel seams and
// black gloves; a silver plate belt whose buckle carries a green bar; black trousers into silver
// plated mid-calf boots with a green strip at each ankle. Over the Wanderer's sword (unchanged).
// Colours: CLOAK_TINT. The silver is the `spike` (plates) and `bevel` (thin lines) materials, the
// green the `facing` material, on purpose: the sword draws in `armor` / `trim` / `leather` / `blade`
// / `bladeTip` / `gem`, so tinting these three leaves it exactly as it is.
//   head   cloak.hood    the hood (hidesHair, shadowsFace), its silver rim
//   chest  cloak.suit    the bodysuit, the cross-chest fold of the cloak, the belt and its buckle
//   arms   cloak.arms    black sleeves, black gloves (the free hand in the gloves' black too)
//   legs   cloak.legs    trousers, the silver boots, the green ankle strips
//   back   cloak.cloak   the mantle over the shoulders and CLOAK_SHEETS (the long cloak)
// No waist item: the cloak is the skirt. Heights in comments are metres in the idle stance.

// ---------------------------------------------------------------- head: the hood
/** Hood rings in head space (y above the neck-base joint, before BODY.headScale; the crown is at
 *  ~0.22): from the cowl on the shoulders up round the head to a tall peak leaning back, the opening
 *  deep enough that the brow overhangs the face (its front ~5 cm ahead of the face). */
export const CLOAK_HOOD = [
  { y: -0.05, rx: 0.19, rz: 0.15, cz: -0.02, gap: 0.06 },
  { y: 0.02, rx: 0.152, rz: 0.136, cz: -0.012, gap: 0.062 },
  { y: 0.085, rx: 0.142, rz: 0.142, cz: 0.0, gap: 0.084 },
  { y: 0.15, rx: 0.143, rz: 0.152, cz: 0.004, gap: 0.092 },
  { y: 0.21, rx: 0.137, rz: 0.15, cz: -0.002, gap: 0.08 },
  { y: 0.258, rx: 0.116, rz: 0.134, cz: -0.014, gap: 0.054 },
  { y: 0.298, rx: 0.084, rz: 0.104, cz: -0.03, gap: 0.026 },
  { y: 0.33, rx: 0.048, rz: 0.066, cz: -0.048, gap: 0.008 },
  { y: 0.352, rx: 0.012, rz: 0.02, cz: -0.064, gap: 0.002 },
];

/** A thin strip laid from p to q (a rim piece): w across, th thick. */
function stripAlong(p, q, w, th) {
  const len = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
  const b = boxGeometry(w, len + 0.006, th, 0, 0, 0);
  b.rotateX(Math.atan2(q[2] - p[2], q[1] - p[1]));
  b.rotateZ(-Math.asin((q[0] - p[0]) / len));
  b.translate((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2);
  return b;
}

function buildHood({ head, M, mesh }) {
  // the cloth: black outside, the dark lining inside (the cavity round the face); folds drawn down
  // it from the peak, sharper near the top (the sheet's folded point)
  const g = foldLines(shellGeometry(CLOAK_HOOD, { sub: 2, cols: 26 }), (x, y, z, u) => 0.5 + 0.55 * Math.sin(u * 48 + y * 7) - 1.3 * Math.max(0, (y - 0.27) / 0.08));
  mesh(head, g, M.coat);
  mesh(head, g, M.lining);
  // the silver rim round the opening: up one side over the brow and down the other
  const pt = (R, s) => {
    const a = Math.asin(Math.min(0.95, R.gap / R.rx));
    return [s * Math.sin(a) * (R.rx + 0.003), R.y, Math.cos(a) * (R.rz + 0.003) + R.cz];
  };
  const rim = [];
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) rim.push(stripAlong(pt(CLOAK_HOOD[k], s), pt(CLOAK_HOOD[k + 1], s), 0.012, 0.006));
  mesh(head, mergeGeometries(rim), M.bevel);
}

// ---------------------------------------------------------------- chest: the bodysuit, the wrap, the belt
/** The fold of the cloak wrapped across the chest (world idle heights; arc centre `c`, rad: 0 = his
 *  front, + = his left): from over the right shoulder down to the left hip, `half` wide each side. */
export const CLOAK_WRAP = { lo: 1.14, hi: 1.45, cLo: 0.75, cHi: -1.05, half: 0.42, off: 0.016 };

function buildSuit({ spine, M, BODY, REST, mesh }) {
  const ySp = (h) => h - REST.spine;
  const SHELL = BODY.shell, top = SHELL[SHELL.length - 1];
  const at = (h) => {
    let k = 0;
    while (k < SHELL.length - 2 && SHELL[k + 1].y < h) k++;
    const A = SHELL[k], B = SHELL[k + 1], u = Math.min(1, Math.max(0, (h - A.y) / (B.y - A.y)));
    return [lerp(A.rx, B.rx, u), lerp(A.rz, B.rz, u), lerp(A.cz ?? 0, B.cz ?? 0, u)];
  };
  // the fitted bodysuit: one closed shell, its panel seams drawn as fold lines (a seam down each side
  // of the chest and two curving over the ribs)
  const rings = [...SHELL, { y: top.y + 0.02, rx: 0.058, rz: 0.056 }].map((r) => ({ ...r, gap: 0, y: ySp(r.y) }));
  const seams = (x, y, z) => (z > 0 ? 0.5 + 0.55 * Math.cos(34 * x + 6 * (y - ySp(1.3)) * Math.sign(x)) : 0.5 + 0.55 * Math.cos(30 * x));
  mesh(spine, foldLines(shellGeometry(rings, { sub: 3, cols: 28 }), seams), M.shirt);
  // the cloak's fold across the chest: a band of shell whose middle turns round the body as it rises
  // (from his left hip up to over his right shoulder), its edges smooth
  {
    const W = CLOAK_WRAP;
    const g = sub(gridGeometry(10, 12, (s, t, o) => {
      const h = lerp(W.lo, W.hi, t), R = at(h), a = lerp(W.cLo, W.cHi, t) + (s - 0.5) * 2 * W.half;
      o[0] = Math.sin(a) * (R[0] + W.off);
      o[1] = ySp(h);
      o[2] = Math.cos(a) * (R[1] + W.off) + R[2];
      o[3] = (a - Math.PI) * 0.15;
      o[4] = ySp(h);
    }), 1);
    mesh(spine, g, M.coat);
    mesh(spine, g, M.lining);
  }
  // the silver plate belt, its buckle and the buckle's green bar
  const B = at(1.16), front = B[1] + B[2] + 0.014;
  mesh(spine, sub(bandGeometry(B[0] + 0.014, B[1] + 0.014, 0.038, 32), 1), M.spike, 0, ySp(1.16), B[2]);
  mesh(spine, mergeGeometries([
    bandGeometry(B[0] + 0.016, B[1] + 0.016, 0.005, 32).translate(0, 0.019, 0),
    bandGeometry(B[0] + 0.016, B[1] + 0.016, 0.005, 32).translate(0, -0.019, 0),
  ]), M.bevel, 0, ySp(1.16), B[2]);
  mesh(spine, boxGeometry(0.082, 0.05, 0.016, 0, ySp(1.16), front + 0.004), M.spike);
  mesh(spine, boxGeometry(0.05, 0.01, 0.006, 0.004, ySp(1.16), front + 0.014), M.facing);
}

// ---------------------------------------------------------------- arms: black sleeves, black gloves
function buildArms(ctx) {
  const { arms, sword, M, DIM, BODY, mesh } = ctx;
  const [ua0, ua1] = BODY.upperArm, [fa0, fa1] = BODY.foreArm, HK = BODY.hand;
  const glove = M.pants;
  {
    const F = gripFist(HK);
    mesh(sword, mergeGeometries([F.fingers, F.thumb, F.ridge]), glove);
  }
  for (const side of [-1, 1]) {
    const { upper, fore } = arms[side < 0 ? 'R' : 'L'];
    // the bodysuit's sleeve, its deltoid and a ball over the elbow (as the Shrouded set's)
    mesh(upper, mergeGeometries([
      sub(limb({ length: DIM.upperArm, r0: ua0, r1: ua1 + 0.002, bulge: 0.008 }), 1),
      sub(ellipsoidGeometry(...BODY.deltoid, { widthSegs: 12, heightSegs: 8 }).translate(side * 0.008, -0.02, 0), 1),
      sub(ellipsoidGeometry(ua1 + 0.006, ua1 + 0.004, ua1 + 0.008, { widthSegs: 10, heightSegs: 6 }).translate(0, -DIM.upperArm, -0.004), 1),
    ]), M.shirt);
    mesh(fore, limb({ length: DIM.foreArm - 0.13, r0: fa0 + 0.002, r1: lerp(fa0, fa1, 0.55) + 0.002 }), M.shirt);
    // the glove's cuff, flared a little over the sleeve's end
    mesh(fore, sub(limb({ length: 0.1, r0: lerp(fa0, fa1, 0.55) + 0.008, r1: fa1 + 0.002, radial: 10, rings: 2, capSegs: 1 }), 1), glove, 0, -(DIM.foreArm - 0.13), 0);
  }
  // the sword hand's gloved wrist and the back of the hand, meeting the fist on the grip
  mesh(arms.R.fore, mergeGeometries([
    limb({ length: 0.05, r0: fa1 - 0.004, r1: fa1 - 0.002, radial: 8, rings: 2, capSegs: 1 }).translate(0, -DIM.foreArm + 0.07, 0),
    ellipsoidGeometry(0.034 * HK, 0.04 * HK, 0.042 * HK, { widthSegs: 10, heightSegs: 6 }).translate(0, -DIM.foreArm + 0.022, 0.004),
  ]), glove);
  return buildFreeHand(ctx, glove);
}

// ---------------------------------------------------------------- legs: trousers, silver boots
function buildLegs({ pelvis, legs, M, DIM, BODY, mesh }) {
  {
    const [hx, hy, hz] = BODY.hips.r;
    mesh(pelvis, orient.up(ellipsoidGeometry(hx, hz, hy)), M.pants, ...BODY.hips.c);
  }
  const [th0, th1, thB] = BODY.thigh, [sh0, sh1, shB] = BODY.shin, F = BODY.foot;
  const rS = (y) => lerp(sh0, sh1, -y / DIM.shin) + shB * Math.sin(Math.PI * Math.min(1, -y / DIM.shin));
  const top = -0.17; // the boot's top, under the calf's swell (≈ 0.43 m)
  for (const side of [-1, 1]) {
    const { thigh, shin, foot } = legs[side < 0 ? 'R' : 'L'];
    mesh(thigh, limb({ length: DIM.thigh, r0: th0 + 0.004, r1: th1 + 0.006, bulge: thB + 0.004 }), M.pants);
    mesh(shin, limb({ length: DIM.shin - 0.02, r0: sh0 + 0.004, r1: sh1 + 0.004, bulge: shB }), M.pants, 0, -0.01, 0);
    // the boot's shaft: plated silver from under the calf to the ankle, a rolled cuff at its top,
    // two bands of silver line down it (the plates' seams)
    mesh(shin, sub(limb({ length: DIM.shin + top - 0.01, r0: rS(top) + 0.014, r1: sh1 + 0.012, radial: 14, rings: 4 }), 1), M.spike, 0, top, 0);
    mesh(shin, mergeGeometries([
      bandGeometry(rS(top) + 0.019, rS(top) + 0.019, 0.016, 16).translate(0, top - 0.004, 0),
      arcPlate(top - 0.09, top - 0.098, rS(top - 0.09) + 0.016, rS(top - 0.09) + 0.016, 0, 1.4, 8),
      arcPlate(top - 0.17, top - 0.178, rS(top - 0.17) + 0.015, rS(top - 0.17) + 0.015, 0, 1.4, 8),
    ]), M.bevel);
    // the green strip at the outer ankle (his right is −X: the outer side is side × +X)
    mesh(shin, arcPlate(-DIM.shin + 0.1, -DIM.shin + 0.03, sh1 + 0.016, sh1 + 0.016, side * Math.PI / 2, 0.16, 3), M.facing);
    // the boot's foot, a plate over the instep, the toe cap and the heel; the silver sole's welt
    mesh(foot, mergeGeometries([
      ellipsoidGeometry(F.r[0] + 0.004, F.r[1] + 0.003, F.r[2] + 0.004, { widthSegs: 10, heightSegs: 6 }).translate(...F.c),
      sub(ellipsoidGeometry(0.046, 0.022, 0.04, { widthSegs: 8, heightSegs: 4 }).translate(0, F.c[1] + F.r[1] - 0.012, 0.066), 1),
      sub(boxGeometry(0.064, 0.034, 0.052, 0, -0.052, -0.062), 1),
    ]), M.spike);
    mesh(foot, ellipsoidGeometry(F.r[0] + 0.008, 0.008, F.r[2] + 0.009, { widthSegs: 14, heightSegs: 3 }), M.welt, 0, -0.062, F.c[2]);
  }
}

// ---------------------------------------------------------------- back: the long cloak
/** The cloak's sheets (hangSheet, on the chest): a wide one down the middle of his back to mid-calf
 *  (the sheet's ankle length dug 26 cm into the grass in the roll) and one each side of it wrapping
 *  round toward his flanks. No sheet on either arm: the mantle covers the shoulders, and a drape on an
 *  arm hung by the free hand and swung through the torso with the sword arm. `inMax`: the roots are
 *  held a little out (hanging free, the middle root swung into his back as he strafed); the lower
 *  halves may wrap in, so a roll can lift them off the grass (`floor`). */
export const CLOAK_SHEETS = [
  { at: [0, 0.2, -0.17], ry: Math.PI, w: [0.24, 0.32, 0.4], len: [0.48, 0.44], out: 0.18, wrap: 0.26, lag: 0.45, max: 1.4, inMax: [-0.06, 0.3], floor: true, seed: 5 },
  { at: [0.12, 0.19, -0.13], ry: Math.PI - 0.8, w: [0.13, 0.18, 0.22], len: [0.46, 0.44], out: 0.3, wrap: 0.22, lag: 0.45, max: 1.4, inMax: [-0.04, 0.2], floor: true, seed: 11 },
  { at: [-0.12, 0.19, -0.13], ry: Math.PI + 0.8, w: [0.13, 0.18, 0.22], len: [0.46, 0.44], out: 0.3, wrap: 0.22, lag: 0.45, max: 1.4, inMax: [-0.04, 0.2], floor: true, seed: 23 },
];

function buildCloak(ctx) {
  const { chest, M, REST, mesh } = ctx;
  const yCh = (h) => h - REST.chest;
  // the mantle: from the hood's cowl out over both shoulders, open a hand's width at the throat
  {
    const rings = [
      { y: yCh(1.37), rx: 0.282, rz: 0.208, cz: -0.028, gap: 0.06 },
      { y: yCh(1.415), rx: 0.262, rz: 0.194, cz: -0.022, gap: 0.054 },
      { y: yCh(1.465), rx: 0.208, rz: 0.155, cz: -0.012, gap: 0.042 },
      { y: yCh(1.505), rx: 0.124, rz: 0.106, cz: 0.0, gap: 0.034 },
    ];
    const g = sub(shellGeometry(rings, { sub: 2, cols: 30 }), 1);
    mesh(chest, g, M.coat);
    mesh(chest, g, M.lining);
  }
  const streamers = CLOAK_SHEETS.map((d) => hangSheet(ctx, chest, d, { face: M.coat, back: M.lining, hem: M.coat }));
  // the middle sheet's marks: the silver seam down its centre, the green diamond in a silver frame
  // between the shoulder blades, three silver ticks over the hem (on the sheet's outer face, +Z)
  {
    const S = streamers[0], [L0, L1] = S.len, z = 0.006;
    mesh(S.segs[0], boxGeometry(0.006, L0 - 0.2, 0.003, 0, -0.2 - (L0 - 0.2) / 2, z), M.bevel);
    mesh(S.segs[1], boxGeometry(0.006, L1 - 0.18, 0.003, 0, -(L1 - 0.18) / 2, z + 0.004), M.bevel);
    mesh(S.segs[0], kiteGeometry(0.042, 0.072, 0.006).translate(0, -0.12, z), M.bevel);
    mesh(S.segs[0], kiteGeometry(0.026, 0.05, 0.006).translate(0, -0.12, z + 0.004), M.facing);
    mesh(S.segs[1], mergeGeometries([-0.022, 0, 0.022].map((x, i) => boxGeometry(0.006, i === 1 ? 0.1 : 0.08, 0.003, x, -L1 + 0.1, z + 0.008))), M.bevel);
  }
  return { streamers };
}

export const CLOAK_ITEMS = [
  { id: 'cloak.hood', slot: 'head', name: 'Peaked Hood', hidesHair: true, shadowsFace: true, build: buildHood },
  { id: 'cloak.suit', slot: 'chest', name: 'Bodysuit and Plate Belt', build: buildSuit },
  { id: 'cloak.arms', slot: 'arms', name: 'Black Gloves', build: buildArms },
  { id: 'cloak.legs', slot: 'legs', name: 'Silver Boots', build: buildLegs },
  { id: 'cloak.cloak', slot: 'back', name: 'Long Cloak', build: buildCloak },
];

export const CLOAK_LOADOUT = Object.freeze({
  head: 'cloak.hood', chest: 'cloak.suit', shoulders: null, arms: 'cloak.arms',
  legs: 'cloak.legs', waist: null, back: 'cloak.cloak', weapon: 'wanderer.sword',
});

/** Its colours (model.js tintHero, this rig only): the cloak and the hood stay today's black cloak
 *  (`coat` untinted); a near-black bodysuit and gloves; bright silver plates (`spike`: the boots, the
 *  belt, the buckle) and lines (`bevel`: the hood's rim, the seams, the diamond's frame); the green
 *  self-lit accents (`facing`: the buckle's bar, the ankle strips, the diamond). */
export const CLOAK_TINT = {
  shirt: { fill: [0.045, 0.045, 0.055] },
  pants: { fill: [0.05, 0.05, 0.06] },
  spike: { fill: [0.5, 0.52, 0.58], sub: 0.55, spec: [1.3, 22] },
  bevel: { fill: [0.68, 0.7, 0.78] },
  welt: { fill: [0.55, 0.57, 0.64] },
  facing: { fill: [0.12, 0.6, 0.22], ink: [0.4, 1.35, 0.5], inkGlow: 0.5, glowK: 0.7 },
};
