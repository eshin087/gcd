import { ellipsoidGeometry } from '../../../render/glyphGeometry.js';
import { shellGeometry, bandGeometry, boxGeometry, mergeGeometries, sub, foldLines, limb, gripFist, place, ring } from '../heroGeo.js';
import { hangSheet, panelSkirt } from './sheet.js';
import { buildFreeHand } from './hands.js';
import { buildHoodHair } from './shroud.js';

// OUTFIT OPTION "Moonlit Robe" (gear/looks.js `robe`; the owner picks one of three): a night-sky
// swordsman in a deep moon-indigo robe. A high-low hem (the front stops above the knee, the back
// tails reach the low calf) with a moon-white hem band and piping down the vent, a pale-violet
// lining that flashes on kicks, a violet sash with two short tails at the left back hip, a bare gold
// head with parted bangs, long side locks and a silver guan on a topknot; the sword arm bound in a
// black bracer with silver bands, the free arm in a fuller sleeve with one short elbow wing, a
// near-black cuff and the bare hand. Over the Wanderer's boots (the knee guards show under the short
// front) and sword. Colours: MOON_TINT.
//   head   moon.crown    bare (the face lit), parted bangs, side locks, the topknot and its guan
//   chest  moon.robe     the robe's body, the collar, the sash and MOON_SASH (its tails)
//   arms   moon.sleeves  the bound sword arm, the flowing free sleeve and MOON_WING
//   waist  moon.skirt    MOON_PANELS (panelSkirt): the high-low skirt

// ---------------------------------------------------------------- head: a silver guan on a topknot
/** Gold locks (buildHoodHair's format; head space): parted bangs (the forehead mostly bare) and long
 *  temple locks to below the jaw, mirrored. The body's sprung fringe is not kept: a gold mass over a
 *  lit face read as a "gold face" (Session 16). */
const MOON_LOCKS = {
  fringe: [[-0.034, 0.232, 0.082, -0.45, -1, 0.4, 0.07, 0.012, 0.25], [0.036, 0.232, 0.08, 0.45, -1, 0.4, 0.066, 0.012, 0.25]],
  sides: [[0.074, 0.2, 0.062, 0.1, -1, 0.14, 0.17, 0.015, 0.18], [0.088, 0.185, 0.02, 0.3, -0.6, -0.7, 0.1, 0.014, 0.2]],
};
function buildCrown({ head, M, mesh }) {
  buildHoodHair(head, M, mesh, MOON_LOCKS);
  // the topknot, half sunk in the crown
  mesh(head, sub(ellipsoidGeometry(0.028, 0.028, 0.032, { widthSegs: 10, heightSegs: 6 }).translate(0, 0.258, -0.03), 1), M.hair);
  // the guan: a small silver crown cupped round the knot, a pin through it along X
  mesh(head, mergeGeometries([
    sub(shellGeometry([
      { y: 0.258, rx: 0.03, rz: 0.038, cz: -0.03, gap: 0 },
      { y: 0.284, rx: 0.033, rz: 0.042, cz: -0.03, gap: 0 },
      { y: 0.3, rx: 0.02, rz: 0.028, cz: -0.03, gap: 0 },
    ], { sub: 1, cols: 12 }), 0),
    sub(boxGeometry(0.12, 0.007, 0.007, 0, 0.276, -0.03), 1),
  ]), M.trim);
}

// ---------------------------------------------------------------- chest: the robe, the sash
/** The sash's two short tails at his left back hip (hangSheet; spine space): `az` round the sash
 *  (rad: 0 = his front, + = his left), `y` the root's height. Behind the left buttock, clear of the
 *  free hand and the swinging left thigh (at 2.3 / 2.55 the strafes swung the thigh into them and
 *  the hanging hand met them); longer, they cross the back of the left thigh in a run. */
export const MOON_SASH = [
  { az: 2.65, y: 0.13, w: [0.075, 0.08, 0.085], len: [0.2, 0.19], out: 0.5, wrap: 0.4, lag: 0.75, max: 2.0, inMax: [-0.05, 0.1], hemFrom: 0.7, seed: 101 },
  { az: 2.9, y: 0.12, w: [0.065, 0.07, 0.075], len: [0.16, 0.16], out: 0.45, wrap: 0.4, lag: 0.85, max: 2.0, inMax: [-0.05, 0.1], hemFrom: 0.7, seed: 107 },
];
function buildRobe(ctx) {
  const { spine, chest, M, BODY, REST, mesh } = ctx;
  const ySp = (h) => h - REST.spine, yCh = (h) => h - REST.chest;
  const SHELL = BODY.shell, top = SHELL[SHELL.length - 1];
  const rings = [...SHELL, { y: top.y + 0.02, rx: 0.06, rz: 0.058 }].map((r) => ({ ...r, rx: r.rx + 0.006, rz: r.rz + 0.006, gap: 0, y: ySp(r.y) }));
  // the crossed collar: his left lapel over the right (a drawn fold line over the front)
  const g = foldLines(shellGeometry(rings, { sub: 3, cols: 28 }), (x, y, z) => (z > 0 ? 0.5 + 10 * (x - 0.03 + (ySp(1.5) - y) * 0.6) : 0));
  mesh(spine, g, M.coat);
  // the moon-white under-collar and the violet collar band round it
  mesh(chest, sub(bandGeometry(0.1, 0.092, 0.05, 20).translate(0, yCh(1.5), 0.006), 0), M.hem);
  mesh(chest, sub(bandGeometry(0.113, 0.104, 0.028, 20).translate(0, yCh(1.472), 0.008), 1), M.facing);
  // the violet sash, its knot and ring at the left back hip
  const W = SHELL[1];
  mesh(spine, bandGeometry(W.rx + 0.022, W.rz + 0.022, 0.085, 32), M.facing, 0, ySp(1.185), W.cz ?? 0);
  const K = MOON_SASH[0].az, on = (a, k) => [Math.sin(a) * (W.rx + 0.022 + k), Math.cos(a) * (W.rz + 0.022 + k) + (W.cz ?? 0)];
  {
    const [x, z] = on(K, 0.005), [rx, rz] = on(K, 0.016);
    mesh(spine, boxGeometry(0.065, 0.055, 0.032, x, ySp(1.18), z, 0, K, 0.25), M.facing);
    mesh(spine, place(ring(0.016, 0.016, 0.006, 10), rx, ySp(1.18), rz, Math.PI / 2, K, 0), M.trim);
  }
  const mats = { face: M.facing, back: M.lining, hem: M.hem };
  return { streamers: MOON_SASH.map((d) => {
    const [x, z] = on(d.az, 0.013);
    return hangSheet(ctx, spine, { ...d, at: [x, d.y, z], ry: d.az }, mats);
  }) };
}

// ---------------------------------------------------------------- arms: bound and flowing
/** The free sleeve's short wing off the back of the elbow (hangSheet on the left upper arm; its outer
 *  face is the upper arm's −Z). The forearm bends toward the upper arm's +Z, so only an INWARD swing
 *  brings it toward the forearm: `inMax` caps that. */
export const MOON_WING = { ry: Math.PI, w: [0.12, 0.15, 0.17], len: [0.1, 0.08], out: 0.12, wrap: 0.075, lag: 0.8, max: 2.0, inMax: [0.15, 0.15], arm: 2, hemFrom: 0.6, seed: 91 };
function buildSleeves(ctx) {
  const { arms, sword, M, DIM, BODY, mesh } = ctx;
  const [ua0, ua1] = BODY.upperArm, [fa0, fa1] = BODY.foreArm, HK = BODY.hand;
  {
    const F = gripFist(HK);
    mesh(sword, mergeGeometries([F.fingers, F.thumb, F.ridge]), M.skin);
  }
  const deltoid = (side) => sub(ellipsoidGeometry(...BODY.deltoid, { widthSegs: 12, heightSegs: 8 }).translate(side * 0.008, -0.02, 0), 1);
  // the sword arm: a close sleeve to the elbow, then a black bracer with two silver bands (nothing
  // loose on the sword arm, ADR-073)
  {
    const { upper, fore } = arms.R;
    mesh(upper, mergeGeometries([
      sub(limb({ length: DIM.upperArm, r0: ua0 + 0.002, r1: ua1 + 0.002, bulge: 0.006 }), 1),
      deltoid(-1),
      sub(ellipsoidGeometry(ua1 + 0.006, ua1 + 0.004, ua1 + 0.008, { widthSegs: 10, heightSegs: 6 }).translate(0, -DIM.upperArm, -0.004), 1),
    ]), M.coat);
    mesh(fore, sub(limb({ length: 0.075, r0: ua1 + 0.002, r1: fa0 + 0.004 }), 1), M.coat);
    mesh(fore, limb({ length: 0.14, r0: fa0 + 0.006, r1: fa1 + 0.003, radial: 10 }).translate(0, -0.065, 0), M.shirt);
    mesh(fore, mergeGeometries([
      bandGeometry(fa0 + 0.009, fa0 + 0.009, 0.012, 14).translate(0, -0.075, 0),
      sub(bandGeometry(fa1 + 0.006, fa1 + 0.006, 0.012, 14).translate(0, -0.198, 0), 1),
    ]), M.trim);
    // the sword hand's wrist and the back of the hand, meeting the fist on the grip
    mesh(fore, mergeGeometries([
      limb({ length: 0.05, r0: fa1 - 0.006, r1: fa1 - 0.004, radial: 8, rings: 2, capSegs: 1 }).translate(0, -DIM.foreArm + 0.07, 0),
      ellipsoidGeometry(0.034 * HK, 0.04 * HK, 0.042 * HK, { widthSegs: 10, heightSegs: 6 }).translate(0, -DIM.foreArm + 0.022, 0.004),
    ]), M.skin);
  }
  // the free arm: a fuller sleeve to below the elbow, a near-black cuff to the wrist, the bare hand
  {
    const { upper, fore } = arms.L;
    mesh(upper, mergeGeometries([
      sub(limb({ length: DIM.upperArm, r0: ua0 + 0.004, r1: ua1 + 0.018, bulge: 0.004 }), 1),
      deltoid(1),
    ]), M.coat);
    mesh(fore, sub(limb({ length: 0.1, r0: ua1 + 0.018, r1: fa0 + 0.008 }), 1), M.coat);
    mesh(fore, sub(limb({ length: 0.13, r0: fa0 + 0.004, r1: fa1 + 0.001, radial: 10 }).translate(0, -0.1, 0), 1), M.shirt);
  }
  const H = buildFreeHand(ctx);
  const wing = hangSheet(ctx, arms.L.upper, { ...MOON_WING, at: [0, -(DIM.upperArm - 0.035), -0.03] }, { face: M.coat, back: M.lining, hem: M.hem });
  return { offHand: H.offHand, keep: H.keep, streamers: [wing] };
}

// ---------------------------------------------------------------- waist: the high-low skirt
/** Six panels in COAT_PANELS' order (BREEZE / IDLE_FLARE line up): two short front panels (hems ≈
 *  0.52 m at rest, over the knee), the sides (≈ 0.43 m) and two long back tails split by the vent (≈ 0.34 m
 *  at the vent, ≈ 0.27 m at the outer point); the last ≈ 10 cm of each is the moon-white hem band
 *  (`hemFrom`). The back length is the knob for a longer robe. */
export const MOON_PANELS = [
  { az: 0.62, w: [0.13, 0.17, 0.21], len: [0.27, 0.25], strips: [], fork: [], out: 0.004, flare: 0.12, edge: -1, skew: 1, slant: 0.03, hemFrom: 0.6 }, // front-left
  { az: -0.62, w: [0.13, 0.17, 0.21], len: [0.27, 0.25], strips: [], fork: [], out: 0.004, flare: 0.12, edge: 1, skew: -1, slant: 0.03, hemFrom: 0.6 }, // front-right
  { az: 1.55, w: [0.12, 0.16, 0.22], len: [0.33, 0.35], strips: [], fork: [], out: 0, flare: 0.32, hemFrom: 0.7 }, // left
  { az: -1.55, w: [0.12, 0.16, 0.22], len: [0.33, 0.35], strips: [], fork: [], out: 0, flare: 0.32, hemFrom: 0.7 }, // right
  { az: 2.5, w: [0.16, 0.24, 0.34], len: [0.36, 0.35], strips: [], fork: [], out: 0.008, flare: 0.24, edge: 1, skew: -1.35, slant: 0.05, hemFrom: 0.72 }, // back-left tail
  { az: -2.5, w: [0.16, 0.24, 0.34], len: [0.36, 0.35], strips: [], fork: [], out: 0.008, flare: 0.24, edge: -1, skew: 1.35, slant: 0.05, hemFrom: 0.72 }, // back-right tail
];
const buildSkirt = (ctx) => panelSkirt(ctx, MOON_PANELS, { seed: 130 });

export const MOON_ITEMS = [
  { id: 'moon.crown', slot: 'head', name: 'Silver Guan', hair: ['cap'], build: buildCrown },
  { id: 'moon.robe', slot: 'chest', name: 'Moonlit Robe', build: buildRobe },
  { id: 'moon.sleeves', slot: 'arms', name: 'Bound and Flowing Sleeves', build: buildSleeves },
  { id: 'moon.skirt', slot: 'waist', name: 'High-Low Skirt', build: buildSkirt },
];

export const MOON_LOADOUT = Object.freeze({
  head: 'moon.crown', chest: 'moon.robe', shoulders: null, arms: 'moon.sleeves',
  legs: 'wanderer.legs', waist: 'moon.skirt', back: null, weapon: 'wanderer.sword',
});

/** Its colours (model.js tintHero, this rig only): moon-indigo cloth, a pale-violet lining, a
 *  moon-white hem band (raised for margin: thin pale cloth vanishes in the ASCII when dim), the violet
 *  sash and collar (`facing`), silver piping and trim, the near-black bracer and cuff (`shirt`). */
export const MOON_TINT = {
  coat: { fill: [0.1, 0.12, 0.24] },
  lining: { fill: [0.26, 0.22, 0.42] },
  hem: { fill: [0.5, 0.52, 0.68] },
  facing: { fill: [0.3, 0.11, 0.54] },
  piping: { fill: [0.42, 0.42, 0.58] },
  shirt: { fill: [0.03, 0.03, 0.045] },
  pants: { fill: [0.07, 0.07, 0.1] },
  trim: { fill: [0.42, 0.45, 0.56] },
  leather: { fill: [0.22, 0.16, 0.15] },
};
