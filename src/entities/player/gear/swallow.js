import { ellipsoidGeometry } from '../../../render/glyphGeometry.js';
import {
  shellGeometry, tatterStrip, bandGeometry, boxGeometry, mergeGeometries, sub, foldLines, ribbonCrease, lerp, limb,
  gripFist, clumpGeometry, orientTo, place,
} from '../heroGeo.js';
import { hangSheet, panelSkirt } from './sheet.js';
import { buildFreeHand } from './hands.js';
import { buildHoodHair } from './shroud.js';

// OUTFIT OPTION "Swallow" (gear/looks.js `swallow`; the owner picks one of three): a slim figure in
// a fitted midnight-indigo short jacket with a crossed collar (his left over his right) and a violet
// sash knotted behind; two short front panels and two pointed swallow tails to mid-thigh; fitted
// sleeves, slate wraps from elbow to wrist on both forearms; a pale moon scarf with two long tails
// (the motion signature); a high gold tail tied with a pale cord. The legs show in full, so the
// stance and the steps read. Over the Wanderer's boots and sword. Colours: SWALLOW_TINT.
//   head   swallow.tail    bare, parted locks, the high tail on the streamer springs
//   chest  swallow.jacket  the short jacket, the sash
//   arms   swallow.arms    fitted sleeves, wrapped forearms, bare hands
//   waist  swallow.tails   SWALLOW_PANELS (panelSkirt)
//   back   swallow.scarf   the scarf's rolls and knot, SCARF_TAILS (ribbons, hangSheet)

// ---------------------------------------------------------------- head: bare, a high tail
/** Where the tail is tied (head space, before BODY.headScale): the crown's back. */
const TIE = [0, 0.252, -0.088];
/** Gold locks out of the bare head (buildHoodHair's format): parted bangs, side locks over the ears. */
const SWALLOW_LOCKS = {
  fringe: [[-0.032, 0.232, 0.082, -0.4, -1, 0.45, 0.075, 0.012, 0.25], [0.036, 0.232, 0.08, 0.45, -1, 0.4, 0.068, 0.012, 0.25]],
  sides: [[0.084, 0.205, 0.035, 0.2, -0.45, -1, 0.1, 0.015, 0.15], [0.088, 0.17, 0.055, 0.25, -1, 0.15, 0.11, 0.013, 0.15]],
};
/** The tail on the streamer springs: it swings back off the crown (inMax: never into the head), and
 *  stays off the grass in the forward roll (floor). */
const TAIL = { len: [0.17, 0.2], out: 0.75, lag: 0.75, max: 2.2, w: [0.06, 0.055, 0.035], inMax: [-0.15, 0.3], floor: true };

function buildTail({ head, M, mesh, joint }) {
  buildHoodHair(head, M, mesh, SWALLOW_LOCKS);
  // the knot of hair at the crown's back, and the pale cord round the tail's root
  mesh(head, sub(ellipsoidGeometry(0.034, 0.03, 0.032, { widthSegs: 10, heightSegs: 6 }).translate(TIE[0], TIE[1] + 0.004, TIE[2] + 0.006), 1), M.hair);
  mesh(head, sub(bandGeometry(0.03, 0.028, 0.018, 14).rotateX(1.1).translate(TIE[0], TIE[1] - 0.012, TIE[2] - 0.018), 1), M.hem);
  const base = joint(head, TIE[0], TIE[1] - 0.01, TIE[2] - 0.03);
  base.rotation.y = Math.PI; // local +Z = back
  const s0 = joint(base);
  const [L0, L1] = TAIL.len;
  mesh(s0, sub(orientTo(clumpGeometry(L0 + 0.03, 0.03, 0.022, { curl: 0.05, taper: 0.25, cols: 8, rows: 3 }), [0, 0.015, 0], [0, -1, 0], [0, 0, 1]), 0), M.hair);
  // the cord's two ends hanging beside the tail
  mesh(s0, mergeGeometries([-1, 1].map((s, i) => place(foldLines(tatterStrip(0.12, 0.024, { curl: 0.2, seed: 61 + i }), ribbonCrease(0.024, i * 1.7)), s * 0.016, 0, 0.022, 0, 0, s * 0.22))), M.hem);
  const s1 = joint(s0, 0, -L0, 0);
  mesh(s1, mergeGeometries([
    sub(orientTo(clumpGeometry(L1, 0.026, 0.019, { curl: 0.12, taper: 1, cols: 8, rows: 3 }), [0, 0.01, 0], [0, -1, 0.06], [0, 0, 1]), 1),
    sub(orientTo(clumpGeometry(L1 * 0.7, 0.014, 0.011, { curl: 0.15, taper: 1 }), [0.012, 0, 0], [0.35, -1, 0.12], [0, 0, 1]), 0),
    sub(orientTo(clumpGeometry(L1 * 0.75, 0.014, 0.011, { curl: 0.15, taper: 1 }), [-0.012, 0, 0], [-0.3, -1, 0.1], [0, 0, 1]), 0),
  ]), M.hairTip);
  return { streamers: [{ segs: [s0, s1], len: TAIL.len, out: TAIL.out, lag: TAIL.lag, max: TAIL.max, w: TAIL.w, arm: 0, wrap: 0.02, inMax: TAIL.inMax, floor: TAIL.floor }] };
}

// ---------------------------------------------------------------- chest: the short jacket + sash
function buildJacket({ spine, M, BODY, REST, mesh }) {
  const ySp = (h) => h - REST.spine;
  const SHELL = BODY.shell, top = SHELL[SHELL.length - 1];
  const rings = [...SHELL, { y: top.y + 0.024, rx: 0.062, rz: 0.06 }].map((r) => ({ ...r, rx: r.rx + 0.004, rz: r.rz + 0.004, gap: 0, y: ySp(r.y) }));
  // the crossed collar: his left over his right, drawn as a fold line from the left collarbone down
  const g = foldLines(shellGeometry(rings, { sub: 3, cols: 28 }), (x, y, z) => (z > 0 ? 0.5 + 10 * (x - 0.025 + (ySp(1.49) - y) * 0.55) : 0));
  mesh(spine, g, M.coat);
  // the violet sash, knotted at the small of the back
  const W = SHELL[1];
  mesh(spine, bandGeometry(W.rx + 0.016, W.rz + 0.016, 0.075, 32), M.piping, 0, ySp(1.185), W.cz ?? 0);
  mesh(spine, mergeGeometries([
    sub(ellipsoidGeometry(0.05, 0.034, 0.018, { widthSegs: 10, heightSegs: 6 }).translate(0, ySp(1.19), -(W.rz + 0.026)), 1),
    sub(boxGeometry(0.026, 0.06, 0.012, 0.012, ySp(1.165), -(W.rz + 0.03), 0.1, 0, 0.5), 0),
  ]), M.piping);
}

// ---------------------------------------------------------------- arms: fitted sleeves, wrapped forearms, bare hands
function buildArms(ctx) {
  const { arms, sword, M, DIM, BODY, mesh } = ctx;
  const [ua0, ua1] = BODY.upperArm, [fa0, fa1] = BODY.foreArm, HK = BODY.hand;
  {
    const F = gripFist(HK);
    mesh(sword, mergeGeometries([F.fingers, F.thumb, F.ridge]), M.skin);
  }
  for (const side of [-1, 1]) {
    const R = side < 0;
    const { upper, fore } = arms[R ? 'R' : 'L'];
    mesh(upper, mergeGeometries([
      sub(limb({ length: DIM.upperArm, r0: ua0, r1: ua1 + 0.001, bulge: 0.006 }), 1),
      sub(ellipsoidGeometry(...BODY.deltoid, { widthSegs: 12, heightSegs: 8 }).translate(side * 0.008, -0.02, 0), 1),
      sub(ellipsoidGeometry(ua1 + 0.005, ua1 + 0.003, ua1 + 0.007, { widthSegs: 10, heightSegs: 6 }).translate(0, -DIM.upperArm, -0.004), 1),
    ]), M.coat);
    mesh(fore, sub(limb({ length: 0.07, r0: ua1 + 0.002, r1: fa0 + 0.003 }), 1), M.coat);
    // six slate wraps from the elbow to the wrist (alternating sub-ids: a line between each)
    const wraps = [];
    const n = 6, y0 = -0.058, y1 = -DIM.foreArm + 0.07;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), y = lerp(y0, y1, t), r = lerp(fa0 + 0.002, fa1 - 0.004, t);
      wraps.push(sub(limb({ length: (y0 - y1) / (n - 1) + 0.01, r0: r + 0.002, r1: r - 0.002, radial: 10, rings: 2, capSegs: 1 }).translate(0, y + 0.005, 0), i & 1));
    }
    mesh(fore, mergeGeometries(wraps), M.facing);
    if (R) {
      // the sword hand's wrist and the back of the hand, meeting the fist on the grip
      mesh(fore, mergeGeometries([
        limb({ length: 0.05, r0: fa1 - 0.008, r1: fa1 - 0.006, radial: 8, rings: 2, capSegs: 1 }).translate(0, -DIM.foreArm + 0.07, 0),
        ellipsoidGeometry(0.034 * HK, 0.04 * HK, 0.042 * HK, { widthSegs: 10, heightSegs: 6 }).translate(0, -DIM.foreArm + 0.022, 0.004),
      ]), M.skin);
    }
  }
  return buildFreeHand(ctx);
}

// ---------------------------------------------------------------- waist: the jacket's skirt, swallow tails behind
/** Two short front panels and two pointed tails behind (COAT_PANELS' fields; panelSkirt). The tails
 *  carry their own idle stir (`breeze` / `idleFlare`: the table's would give them the side panels'). */
export const SWALLOW_PANELS = [
  { az: 0.62, w: [0.16, 0.18, 0.19], len: [0.11, 0.09], strips: [], fork: [], out: 0.006, flare: 0.1, skew: 0.5 },
  { az: -0.62, w: [0.16, 0.18, 0.19], len: [0.11, 0.09], strips: [], fork: [], out: 0, flare: 0.1, skew: -0.5 },
  { az: 2.5, w: [0.15, 0.16, 0.13], len: [0.13, 0.13], strips: [0.07], fork: [0], out: 0.008, flare: 0.22, edge: 1, skew: -1.2, slant: 0.04, breeze: 0.06, idleFlare: 0.09 },
  { az: -2.5, w: [0.15, 0.16, 0.13], len: [0.13, 0.13], strips: [0.07], fork: [0], out: 0.008, flare: 0.22, edge: -1, skew: 1.2, slant: 0.04, breeze: 0.05, idleFlare: 0.12 },
];
const buildTails = (ctx) => panelSkirt(ctx, SWALLOW_PANELS, { seed: 0 });

// ---------------------------------------------------------------- back: the scarf
/** The scarf's two tails (hangSheet ribbons): roots 2 cm off the jacket's back (closer, they swung
 *  into the torso), never swinging in past `inMax`. */
export const SCARF_TAILS = [
  { at: [0.05, 0.237, -0.125], ry: Math.PI - 0.3, ribbon: true, fork: true, w: [0.1, 0.11, 0.09], len: [0.34, 0.4], out: 0.3, lag: 1.0, max: 2.4, inMax: [-0.08, 0.12], floor: true, seed: 7, crease: 0 },
  { at: [0.015, 0.23, -0.128], ry: Math.PI + 0.12, ribbon: true, fork: false, w: [0.085, 0.09, 0.07], len: [0.2, 0.24], out: 0.26, lag: 0.8, max: 2.2, inMax: [-0.08, 0.12], floor: true, seed: 13, crease: 2.1 },
];
function buildScarf(ctx) {
  const { chest, M, REST, mesh } = ctx;
  const yCh = (h) => h - REST.chest;
  // two rolls round the neck and the knot behind
  mesh(chest, mergeGeometries([
    sub(bandGeometry(0.1, 0.092, 0.05, 20).translate(0, yCh(1.5), 0.004), 0),
    sub(bandGeometry(0.114, 0.104, 0.048, 20).translate(0, yCh(1.468), 0.006), 1),
    sub(ellipsoidGeometry(0.036, 0.03, 0.024, { widthSegs: 8, heightSegs: 5 }).translate(0.04, yCh(1.47), -0.112), 0),
  ]), M.hem);
  const mats = { face: M.hem, back: null, hem: M.hem };
  return { streamers: SCARF_TAILS.map((d) => hangSheet(ctx, chest, d, mats)) };
}

export const SWALLOW_ITEMS = [
  { id: 'swallow.tail', slot: 'head', name: 'High Tail', hair: ['cap'], build: buildTail },
  { id: 'swallow.jacket', slot: 'chest', name: 'Short Jacket', build: buildJacket },
  { id: 'swallow.arms', slot: 'arms', name: 'Wrapped Forearms', build: buildArms },
  { id: 'swallow.tails', slot: 'waist', name: 'Swallow Tails', build: buildTails },
  { id: 'swallow.scarf', slot: 'back', name: 'Moon Scarf', build: buildScarf },
];

export const SWALLOW_LOADOUT = Object.freeze({
  head: 'swallow.tail', chest: 'swallow.jacket', shoulders: null, arms: 'swallow.arms',
  legs: 'wanderer.legs', waist: 'swallow.tails', back: 'swallow.scarf', weapon: 'wanderer.sword',
});

/** Its colours (model.js tintHero, this rig only). The pale scarf must stay bright (mean ≥ 0.8): at
 *  the hem's own [0.32, 0.3, 0.44] a 0.1 m ribbon vanished in the ASCII at the game camera. */
export const SWALLOW_TINT = {
  coat: { fill: [0.19, 0.19, 0.32] }, // midnight indigo
  lining: { fill: [0.13, 0.07, 0.22] },
  facing: { fill: [0.09, 0.09, 0.14] }, // the slate wraps
  piping: { fill: [0.34, 0.15, 0.48] }, // the violet sash
  hem: { fill: [0.85, 0.83, 1.0] }, // the moon scarf, the cord
  pants: { fill: [0.07, 0.07, 0.09] },
};
