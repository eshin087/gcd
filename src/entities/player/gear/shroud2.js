import { ellipsoidGeometry } from '../../../render/glyphGeometry.js';
import {
  shellGeometry, skirtSheet, tatterStrip, boxGeometry, mergeGeometries, sub, foldLines, ribbonCrease, lerp, sheetOffset, limb, gripFist,
} from '../heroGeo.js';
import { buildFreeHand } from './hands.js';
import { HERO_ID } from '../heroDims.js';
import { buildHoodHair, HOOD_HAIR } from './shroud.js';
import { panelSkirt } from './sheet.js';

// PROTOTYPE: hero v2's three models on trial (`?hero=a|b|c`, heroDims.js HERO_ID; the owner:
// "focus on improving the characters model design, detail"). The same hooded swordsman in a ragged
// cloak (ADR-043), rebuilt on what the close-up and the game camera showed of today's:
//   - the cloth was bundles of narrow slats: every sheet, every torn strip and every drawn fold
//     printed its own line, so up close he was hatching and from the game camera one dark bell.
//     Here a few broad sheets carry the cloak, with one or two drawn folds each and a pale torn
//     border only along the hem;
//   - the hood was a tall tube with ~18 drawn ribs: gathered in at the neck now, two or three folds
//     falling down its back;
//   - the coat skirt ringed the hips with six panels (the bell's lower half): each model keeps only
//     the panels its silhouette needs.
// The three differ in the SILHOUETTE the game camera sees:
//   a · Lean         a split cape down the spine, two coat tails, no drapes: shoulders, arms, waist
//                    and legs read from every side
//   b · Half cloak   a long ragged cloak off the LEFT shoulder (it covers the free arm and the left
//                    of his back); the sword side is open: the sword arm, the ribs and the right leg
//   c · Great cloak  the reference's huge ragged cloak: broad sheets from both shoulders to the
//                    calves, open down the front; the sword arm comes out of it
// Each is `v2.hood` + `v2.cloak` + `v2.skirt` over the Shrouded set's tunic and sleeves and the
// Wanderer's boots and sword (V2_LOADOUT). Built in code from the heroGeo.js sheets.

const PI = Math.PI;
/**
 * A model's cloth. `mantle`: the shoulder cape's rings (heights are metres in the idle stance: x =
 * half-width, z = half-depth, cz = centre, gap = half the opening at the throat) and `drape`, an
 * extra arc of it down one side ([a0, a1] rad about Y, + = his left; rings as the mantle's).
 * `sheets`: as shroud.js SHROUD_SHEETS, plus `folds` (drawn folds across the sheet) and `hem` (0..1
 * down the lower segment where the pale torn border starts). `panels`: the coat skirt's (as
 * wanderer.js COAT_PANELS, plus `folds`, `hemFrom`).
 */
const MODELS = {
  // ------------------------------------------------------------ a · LEAN
  a: {
    mantle: [
      { y: 1.39, rx: 0.264, rz: 0.19, cz: -0.024, gap: 0.05 },
      { y: 1.43, rx: 0.248, rz: 0.178, cz: -0.018, gap: 0.045 },
      { y: 1.472, rx: 0.196, rz: 0.144, cz: -0.01, gap: 0.036 },
      { y: 1.505, rx: 0.118, rz: 0.102, cz: 0.002, gap: 0.03 },
    ],
    sheets: [
      // the cape: two halves down the spine, the left a hand longer; they part in a run
      { on: 'chest', at: [0.045, 0.2, -0.158], ry: PI - 0.16, w: [0.11, 0.14, 0.17], len: [0.44, 0.44], out: 0.2, wrap: 0.24, folds: 1, hem: 0.62, strips: [0.24, 0.12], fork: [0, 1], seed: 3 },
      { on: 'chest', at: [-0.045, 0.2, -0.158], ry: PI + 0.16, w: [0.11, 0.14, 0.16], len: [0.44, 0.38], out: 0.22, wrap: 0.24, folds: 1, hem: 0.5, strips: [0.11, 0.2], fork: [0, 0], seed: 29 },
    ],
    panels: [
      // a front flap from the belt (the tunic's tail), and two coat tails behind
      { az: 0, w: [0.13, 0.14, 0.15], len: [0.17, 0.17], strips: [0.07], fork: [1], out: 0.006, flare: 0.05, folds: 0.5, hemFrom: 0.7 },
      { az: 2.5, w: [0.15, 0.2, 0.27], len: [0.27, 0.27], strips: [0.15, 0.09], fork: [0, 1], out: 0.008, flare: 0.3, edge: 1, skew: -1.35, slant: 0.06, folds: 1.5, hemFrom: 0.6 },
      { az: -2.5, w: [0.15, 0.2, 0.27], len: [0.27, 0.27], strips: [0.09, 0.15], fork: [1, 0], out: 0.008, flare: 0.3, edge: -1, skew: 1.35, slant: 0.06, folds: 1.5, hemFrom: 0.6 },
    ],
  },
  // ------------------------------------------------------------ b · HALF CLOAK
  b: {
    mantle: [
      { y: 1.385, rx: 0.268, rz: 0.196, cz: -0.026, gap: 0.05 },
      { y: 1.425, rx: 0.252, rz: 0.184, cz: -0.02, gap: 0.045 },
      { y: 1.47, rx: 0.2, rz: 0.148, cz: -0.01, gap: 0.036 },
      { y: 1.505, rx: 0.118, rz: 0.102, cz: 0.002, gap: 0.03 },
    ],
    sheets: [
      // down his back, turned a little to the left
      { on: 'chest', at: [0.02, 0.2, -0.16], ry: PI - 0.14, w: [0.2, 0.3, 0.4], len: [0.46, 0.46], out: 0.2, wrap: 0.26, folds: 2, hem: 0.64, strips: [0.12, 0.24, 0.1, 0.19], fork: [0, 0, 1, 0], seed: 3 },
      // behind the left shoulder, the longest
      { on: 'chest', at: [0.12, 0.2, -0.12], ry: PI - 0.95, w: [0.16, 0.26, 0.36], len: [0.47, 0.5], out: 0.22, wrap: 0.24, folds: 2, hem: 0.5, strips: [0.2, 0.1, 0.27], fork: [0, 1, 0], seed: 17 },
      // down his left side, from the shoulder: the arm inside pushes it out (hung on the arm itself it
      // stood out level with a raised arm, a plank); a short torn cape rides the arm
      { on: 'chest', at: [0.2, 0.185, -0.03], ry: 1.5, w: [0.14, 0.22, 0.3], len: [0.43, 0.45], out: 0.2, wrap: 0.2, folds: 1.5, hem: 0.56, strips: [0.2, 0.12, 0.17], fork: [0, 1, 0], seed: 67 },
      { on: 'armL', at: [0.05, -0.01, 0.0], ry: 1.5, w: [0.14, 0.18, 0.21], len: [0.17, 0.14], out: 0.22, wrap: 0.13, folds: 1, hem: 0.3, strips: [0.08, 0.13, 0.07], fork: [0, 0, 0], lag: 0.25, seed: 71 },
    ],
    panels: [
      { az: 0, w: [0.13, 0.14, 0.15], len: [0.17, 0.17], strips: [0.07], fork: [1], out: 0.006, flare: 0.05, folds: 0.5, hemFrom: 0.7 },
      // the sword side: a side panel and a tail
      { az: -1.7, w: [0.14, 0.18, 0.25], len: [0.27, 0.27], strips: [0.11], fork: [1], out: 0, flare: 0.45, folds: 1.5, hemFrom: 0.6 },
      { az: -2.5, w: [0.15, 0.21, 0.3], len: [0.28, 0.28], strips: [0.08, 0.15], fork: [1, 0], out: 0.008, flare: 0.3, edge: -1, skew: 1.35, slant: 0.06, folds: 1.5, hemFrom: 0.6 },
    ],
  },
  // ------------------------------------------------------------ c · GREAT CLOAK
  c: {
    mantle: [
      { y: 1.37, rx: 0.276, rz: 0.206, cz: -0.028, gap: 0.05 },
      { y: 1.42, rx: 0.256, rz: 0.19, cz: -0.02, gap: 0.045 },
      { y: 1.468, rx: 0.202, rz: 0.15, cz: -0.01, gap: 0.036 },
      { y: 1.505, rx: 0.118, rz: 0.102, cz: 0.002, gap: 0.03 },
    ],
    sheets: [
      { on: 'chest', at: [0, 0.2, -0.165], ry: PI, w: [0.2, 0.31, 0.42], len: [0.48, 0.5], out: 0.2, wrap: 0.27, folds: 2, hem: 0.62, strips: [0.14, 0.24, 0.1, 0.2], fork: [0, 0, 1, 0], seed: 3 },
      { on: 'chest', at: [0.11, 0.2, -0.13], ry: PI - 0.72, w: [0.17, 0.27, 0.37], len: [0.48, 0.5], out: 0.22, wrap: 0.25, folds: 2, hem: 0.5, strips: [0.22, 0.1, 0.16], fork: [0, 1, 0], seed: 17 },
      { on: 'chest', at: [-0.11, 0.2, -0.13], ry: PI + 0.72, w: [0.17, 0.27, 0.36], len: [0.48, 0.46], out: 0.22, wrap: 0.25, folds: 2, hem: 0.7, strips: [0.1, 0.2, 0.14], fork: [1, 0, 0], seed: 29 },
      // down his left side, from the shoulder: the arm inside pushes it out (hung on the arm itself it
      // stood out level with a raised arm, a plank); a short torn cape rides the arm
      { on: 'chest', at: [0.2, 0.185, -0.03], ry: 1.5, w: [0.14, 0.22, 0.3], len: [0.45, 0.47], out: 0.2, wrap: 0.2, folds: 1.5, hem: 0.56, strips: [0.2, 0.12, 0.17], fork: [0, 1, 0], seed: 67 },
      { on: 'armL', at: [0.05, -0.01, 0.0], ry: 1.5, w: [0.14, 0.18, 0.21], len: [0.17, 0.14], out: 0.22, wrap: 0.13, folds: 1, hem: 0.3, strips: [0.08, 0.13, 0.07], fork: [0, 0, 0], lag: 0.25, seed: 71 },
      // thrown back off the sword shoulder: the arm and the blade stay clear of the cloth
      { on: 'chest', at: [-0.17, 0.19, -0.085], ry: PI + 1.25, w: [0.13, 0.2, 0.27], len: [0.42, 0.4], out: 0.3, wrap: 0.2, folds: 1.5, hem: 0.66, strips: [0.16, 0.09], fork: [0, 1], seed: 79 },
    ],
    panels: [
      { az: 0, w: [0.13, 0.14, 0.15], len: [0.17, 0.17], strips: [0.07], fork: [1], out: 0.006, flare: 0.05, folds: 0.5, hemFrom: 0.7 },
    ],
  },
};
const MODEL = MODELS[HERO_ID ?? 'a'];
const V2_LAG = 0.45, V2_MAX = 1.1; // (broad sheets: at 1.45 rad a spin stood them out level, planks)

// ---------------------------------------------------------------- head: the hood
/** The hood (head space, y above the neck-base joint, before BODY.headScale; as shroud.js
 *  HOOD_RINGS): the same rounded crown pushed back off the fringe, but GATHERED at the neck (it was
 *  as wide there as round the skull: a tube from behind) and fuller at the back of the head. */
const HOOD2_RINGS = [
  { y: -0.035, rx: 0.178, rz: 0.142, cz: -0.022, gap: 0.075 },
  { y: 0.02, rx: 0.122, rz: 0.114, cz: -0.02, gap: 0.066 },
  { y: 0.078, rx: 0.123, rz: 0.13, cz: -0.016, gap: 0.095 },
  { y: 0.142, rx: 0.135, rz: 0.146, cz: -0.014, gap: 0.112 },
  { y: 0.202, rx: 0.132, rz: 0.15, cz: -0.02, gap: 0.104 },
  { y: 0.252, rx: 0.116, rz: 0.14, cz: -0.03, gap: 0.072 },
  { y: 0.29, rx: 0.086, rz: 0.112, cz: -0.044, gap: 0.03 },
  { y: 0.312, rx: 0.048, rz: 0.07, cz: -0.06, gap: 0.006 },
  { y: 0.32, rx: 0.012, rz: 0.022, cz: -0.074, gap: 0.003 },
];
/** The hood's drawn folds: [angle round the head at the neck (rad from his front, + = his left; π =
 *  the nape), how far it leans round per metre up, its half-width at the neck (rad)]. Each is a
 *  dark valley that opens downward from under the crown. */
const HOOD2_FOLDS = [[PI - 0.9, 1.6, 0.15], [PI + 0.7, -1.2, 0.12], [PI + 2.0, -1.0, 0.09], [PI - 2.1, 1.0, 0.09]];
function buildHood2({ head, M, mesh }) {
  // two or three folds falling from the crown down the back and the sides (none round the face,
  // none over the crown): the field's 0.5 contour is the drawn line (foldLines)
  const g = foldLines(shellGeometry(HOOD2_RINGS, { sub: 3, cols: 40 }), (x, y, z, u) => {
    const a = u / 0.15 + PI, t = Math.min(1, Math.max(0, y / 0.25));
    let f = 0;
    for (const [a0, lean, w] of HOOD2_FOLDS) {
      let d = a - a0 - lean * y;
      d -= Math.round(d / (2 * PI)) * 2 * PI;
      const sg = w * (1 - 0.8 * t);
      f = Math.max(f, Math.exp(-((d / sg) ** 2)));
    }
    return 0.95 * f * (1 - Math.min(1, Math.max(0, (y - 0.19) / 0.07)));
  });
  mesh(head, g, M.coat);
  mesh(head, g, M.lining);
  // the rim round the face opening: a paler torn edge, so the opening reads from the front
  const rim = [];
  for (const s of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      const A = HOOD2_RINGS[k + 1], B = HOOD2_RINGS[k + 2];
      const pt = (R) => {
        const a = Math.asin(Math.min(0.95, R.gap / R.rx));
        return [s * Math.sin(a) * (R.rx + 0.003), R.y, Math.cos(a) * (R.rz + 0.003) + R.cz];
      };
      const p = pt(A), q = pt(B);
      const len = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      const b = boxGeometry(0.014, len + 0.006, 0.006, 0, 0, 0);
      b.rotateX(Math.atan2(q[2] - p[2], q[1] - p[1]));
      b.rotateZ(-Math.asin((q[0] - p[0]) / len));
      b.translate((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2);
      rim.push(b);
    }
  }
  mesh(head, mergeGeometries(rim), M.hem);
  buildHoodHair(head, M, mesh, HOOD_HAIR);
}

// ---------------------------------------------------------------- back: the cloak
/** The mantle over the shoulders, its clasp (a violet stone at the throat, the sword gem's twin),
 *  and the model's sheets on the streamer springs. Returns `streamers` (anim.js _streamers). */
function buildCloak2({ chest, arms, M, REST, mesh, joint }) {
  const yCh = (h) => h - REST.chest;
  {
    const rings = MODEL.mantle.map((r) => ({ ...r, y: yCh(r.y) }));
    const cols = 30;
    const g = sub(shellGeometry(rings, { sub: 2, cols }), 1);
    // a torn lower edge: broad bites, not a saw (every third column dropped or lifted a little)
    const p = g.attributes.position;
    for (let i = 0; i <= cols; i++) p.setY(i, p.getY(i) + 0.02 * Math.sin(i * 1.9 + 0.7) - (i % 5 === 0 ? 0.026 : 0));
    g.computeVertexNormals();
    mesh(chest, g, M.coat);
    mesh(chest, g, M.lining);
    // the clasp: a dark mount and a violet stone
    mesh(chest, boxGeometry(0.04, 0.04, 0.012, 0, yCh(1.485), 0.126, 0, 0, 0.78), M.trim);
    mesh(chest, ellipsoidGeometry(0.013, 0.016, 0.009, { widthSegs: 8, heightSegs: 5 }), M.gem, 0, yCh(1.485), 0.134);
  }
  const streamers = [];
  MODEL.sheets.forEach((d, i) => {
    const parent = d.on === 'armL' ? arms.L.upper : d.on === 'armR' ? arms.R.upper : chest;
    const base = joint(parent, ...d.at);
    base.rotation.y = d.ry; // local +Z = the sheet's outer face, +X = across it
    const [w0, w1, w2] = d.w, [L0, L1] = d.len;
    const nF = d.folds + 0.5, ph = i * 1.9 + 0.4, hem = d.hem ?? 0.5;
    const wAt = (dd) => (dd < L0 ? lerp(w0, w1, dd / L0) : lerp(w1, w2, Math.min(1, (dd - L0) / L1)));
    // the drawn folds: opening a hand under the root, wandering a little on the way down
    const pleat = (d0) => (x, y, z, u, gy) => {
      const dd = d0 - gy, w = wAt(dd);
      const f = PI * 2 * nF * (u / w + 0.5 + 0.04 * Math.sin(dd * 7 + i * 1.7)) + ph + PI;
      return 0.44 + 0.6 * Math.sin(f) - 0.9 * Math.max(0, 1 - dd / 0.2);
    };
    const s0 = joint(base);
    const g0 = foldLines(skirtSheet(L0, w0, w1, d.wrap, 0.25, 0, d.seed, [0.006, 0.024, nF, ph]), pleat(0));
    mesh(s0, g0, M.coat);
    mesh(s0, g0, M.lining);
    const s1 = joint(s0, 0, -L0, 0);
    const R1 = d.wrap + 0.25 * L0, fold = [0.024, 0.05, nF, ph];
    const g1 = foldLines(skirtSheet(L1, w1, w2, R1, 0.25, 0.04, d.seed + 7, fold, 0, hem), pleat(L0));
    mesh(s1, g1, M.coat);
    mesh(s1, g1, M.lining);
    const g2 = foldLines(skirtSheet(L1, w1, w2, R1, 0.25, 0.04, d.seed + 7, fold, hem, 1), pleat(L0));
    mesh(s1, g2, M.hem);
    mesh(s1, g2, M.lining);
    // torn points along the hem (rigid on the lower segment): few, broad, of very different lengths
    const n = d.strips.length, R2 = R1 + 0.25 * L1, wr = w2 / Math.max(1, n);
    const tat = [];
    for (let k = 0; k < n; k++) {
      const u = ((k + 0.5) / n - 0.5) * w2 + sheetOffset(w2, w0, 0), a = u / R2;
      const sw = Math.max(0.07, wr * 1.15);
      const t = foldLines(tatterStrip(d.strips[k], sw, { fork: !!d.fork[k], curl: 0.2, seed: 500 + d.seed * 13 + k * 7 }), ribbonCrease(sw, i * 2.7 + k * 1.3));
      t.rotateY(a);
      t.translate(Math.sin(a) * R2, -L1 + 0.012, (Math.cos(a) - 1) * R2);
      tat.push(t);
    }
    if (tat.length) mesh(s1, mergeGeometries(tat), M.hem);
    streamers.push({ segs: [s0, s1], len: d.len, out: d.out, lag: d.lag ?? V2_LAG, max: d.max ?? V2_MAX, w: d.w, arm: d.on === 'armR' ? 1 : d.on === 'armL' ? 2 : 0, wrap: d.wrap });
  });
  return { streamers };
}

// ---------------------------------------------------------------- arms: cloth sleeves
/** As shroud.js's arms (cloth sleeves, leather-bound forearms, bare hands), reshaped: the shoulder
 *  runs into a fuller sleeve (it was a ball over a tube), the sleeve ends in a loose cuff over the
 *  first binding. */
function buildArms2(ctx) {
  const { arms, sword, M, DIM, BODY, mesh } = ctx;
  const [ua0, ua1] = BODY.upperArm, [fa0, fa1] = BODY.foreArm, HK = BODY.hand, [dx, dy, dz] = BODY.deltoid;
  let hand = null;
  {
    const F = gripFist(HK);
    mesh(sword, mergeGeometries([F.fingers, F.thumb, F.ridge]), M.skin);
  }
  for (const side of [-1, 1]) {
    const R = side < 0;
    const { upper, fore } = arms[R ? 'R' : 'L'];
    mesh(upper, mergeGeometries([
      sub(limb({ length: DIM.upperArm, r0: ua0 + 0.006, r1: ua1 + 0.004, bulge: 0.012 }), 0),
      sub(ellipsoidGeometry(dx * 0.94, dy * 1.3, dz * 0.96, { widthSegs: 12, heightSegs: 8 }).translate(side * 0.004, -0.04, 0), 0),
      sub(ellipsoidGeometry(ua1 + 0.005, ua1 + 0.004, ua1 + 0.007, { widthSegs: 10, heightSegs: 6 }).translate(0, -DIM.upperArm, -0.004), 0),
    ]), M.coat);
    // the sleeve's end: a loose cuff standing off the first binding
    mesh(fore, sub(limb({ length: 0.1, r0: ua1 + 0.004, r1: fa0 + 0.013 }), 1), M.coat);
    const wraps = [];
    const n = 5, y0 = -0.085, y1 = -DIM.foreArm + 0.062;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), y = lerp(y0, y1, t), r = lerp(fa0, fa1 - 0.003, t) + 0.004 * Math.sin(PI * Math.min(1, t * 1.6));
      wraps.push(sub(limb({ length: (y0 - y1) / (n - 1) + 0.012, r0: r, r1: r - 0.004, radial: 10, rings: 2, capSegs: 1 }).translate(0, y + 0.006, 0), i & 1));
    }
    mesh(fore, mergeGeometries(wraps), M.leather);
    if (R) {
      mesh(fore, mergeGeometries([
        limb({ length: 0.05, r0: fa1 - 0.006, r1: fa1 - 0.004, radial: 8, rings: 2, capSegs: 1 }).translate(0, -DIM.foreArm + 0.07, 0),
        ellipsoidGeometry(0.034 * HK, 0.04 * HK, 0.042 * HK, { widthSegs: 10, heightSegs: 6 }).translate(0, -DIM.foreArm + 0.022, 0.004),
      ]), M.skin);
    } else hand = buildFreeHand(ctx);
  }
  return hand;
}

// ---------------------------------------------------------------- waist: the coat's panels
function buildSkirt2(ctx) {
  return panelSkirt(ctx, MODEL.panels, { seed: 40 });
}

export const SHROUD2_ITEMS = [
  { id: 'v2.hood', slot: 'head', name: 'Hood (v2)', hair: ['cap'], shadowsFace: true, build: buildHood2 },
  { id: 'v2.arms', slot: 'arms', name: 'Cloth sleeves (v2)', build: buildArms2 },
  { id: 'v2.cloak', slot: 'back', name: 'Cloak (v2)', build: buildCloak2 },
  { id: 'v2.skirt', slot: 'waist', name: 'Coat tails (v2)', build: buildSkirt2 },
];
/** What hero v2 wears (player.js, when `?hero=` is in the address). */
export const V2_LOADOUT = Object.freeze({
  head: 'v2.hood',
  chest: 'shroud.tunic',
  shoulders: null,
  arms: 'v2.arms',
  legs: 'wanderer.legs',
  waist: 'v2.skirt',
  back: 'v2.cloak',
  weapon: 'wanderer.sword',
});
