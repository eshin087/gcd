import { ellipsoidGeometry } from '../../../render/glyphGeometry.js';
import {
  shellGeometry, skirtSheet, tatterStrip, bandGeometry, boxGeometry, mergeGeometries, sub, foldLines, ribbonCrease, lerp, limb,
  gripFist, sheetOffset, clumpGeometry, orientTo,
} from '../heroGeo.js';
import { buildFreeHand } from './hands.js';

// The Shrouded set (owner reference 2026-11-11: a hooded swordsman in a huge tattered cloak, seen
// from behind, the sword low in his right hand, the cloak thrown wide to his left; ADR-043). The
// default outfit since then (gear/index.js DEFAULT_LOADOUT), worn over the Wanderer's boots, coat
// tails and sword:
//   head   shroud.hood    a hood worn pushed back, a rounded crown, the face in its shadow; gold
//                         strands out of it: a spiky fringe, cheek locks, a strand a side onto the
//                         collarbone (HOOD_HAIR; `hair`: the pieces of the body's hair kept)
//   chest  shroud.tunic   a closed wrap tunic, a neck scarf, one belt
//   arms   shroud.arms    cloth sleeves, bound forearms, bare hands
//   back   shroud.cloak   a mantle over the shoulders and SHROUD_SHEETS: ragged sheets on the
//                         streamer springs (anim.js): a narrow cape down the middle of his back and
//                         a drape on each arm (ADR-073: his arms, waist and legs show beside it).
//                         The sword arm stays clear of the cloth, so the arm and the blade read.
// Built in code from the heroGeo.js sheets (no sculpted parts): `npm run hero-parts` is not needed.
//
// Heights in comments are metres in the idle stance.

/**
 * The cloak's sheets. Each hangs from `on` ('chest', or an upper arm 'armL' / 'armR') at `at`
 * (that joint's space), its outer face looking along `ry` (rad about Y: 0 = his front, + = his
 * left, π = straight back). `w` = width at the root / the seam / the torn hem, `len` = the two
 * spring segments, `out` = how far it stands out at rest (tan of the angle; anim.js _streamers),
 * `strips` = the lengths (m) of the torn points along its hem (`fork`: 1 = a forked point),
 * `wrap` = the radius it curves round the body at the root, `lag` = how much it trails the motion
 * (1 = a light ribbon that streams out level at a run; SHROUD_LAG by default).
 */
const SHROUD_LAG = 0.5;
/** How far a cloak sheet may swing from hanging (rad): just short of level. */
const SHROUD_MAX = 1.45;
export const SHROUD_SHEETS = [
  // (Session 25, owner: "i want his cloak to be thinner in the back", "narrower from behind"; the
  // pick of three rendered widths: a NARROW CAPE. Three sheets down the middle of his back, about as
  // wide as his hips at the hem (0.24 m in the middle, the two beside it turned only 0.3 rad out), and
  // the drapes on the arms; the wing over his left side and the sheet behind the sword shoulder are
  // gone, so his arms, waist and legs show from the game camera behind him.
  // Before (Session 21, ADR-065, "A trimmed"): seven sheets, the back three [0.18, 0.27, 0.38] wide
  // and 0.62 rad apart, fanning ~1 m across at the hem. Session 16 hung the back sheets off the
  // mantle's back so he has some depth in profile: kept.)
  { on: 'chest', at: [0, 0.2, -0.16], ry: Math.PI, w: [0.16, 0.2, 0.24], len: [0.425, 0.425], out: 0.22, wrap: 0.24, strips: [0.187, 0.102, 0.255, 0.136], fork: [0, 1, 0, 0], seed: 3 },
  { on: 'chest', at: [0.07, 0.205, -0.15], ry: Math.PI - 0.3, w: [0.11, 0.14, 0.17], len: [0.425, 0.408], out: 0.24, wrap: 0.22, strips: [0.153, 0.255, 0.102], fork: [1, 0, 0], seed: 17 },
  { on: 'chest', at: [-0.07, 0.205, -0.15], ry: Math.PI + 0.3, w: [0.11, 0.14, 0.16], len: [0.408, 0.391], out: 0.22, wrap: 0.22, strips: [0.221, 0.119, 0.187], fork: [0, 1, 0], seed: 29 },
  // draped over the left arm: it follows the arm, so a raised or reaching arm lifts it
  { on: 'armL', at: [0.05, -0.02, 0.0], ry: 1.35, w: [0.098, 0.155, 0.204], len: [0.357, 0.357], out: 0.16, wrap: 0.16, strips: [0.255, 0.136, 0.204], fork: [0, 1, 0], seed: 67 },
  // a short torn shoulder cape on the sword arm
  { on: 'armR', at: [-0.05, -0.01, -0.02], ry: -1.9, w: [0.136, 0.177, 0.204], len: [0.17, 0.136], out: 0.24, wrap: 0.13, strips: [0.085, 0.136, 0.068], fork: [0, 0, 0], lag: 0.25, seed: 79 },
];

// ---------------------------------------------------------------- head: the hood
/** Hood rings in head space (y above the neck-base joint, before BODY.headScale): half-width rx,
 *  half-depth rz, centre offset cz, and the face opening's half-chord `gap`. From the drape on the
 *  shoulders up round the head to a rounded crown with a soft, short peak at the back.
 *  (Session 14, owner: "his hood is too pointy at the top", and the deep hood over a pale face read
 *  "like death". The hood now sits pushed back: the rim runs over the crown of the head behind the
 *  hairline, the opening is wide, and the gold fringe and side locks fall out in front of it.) */
const HOOD_RINGS = [
  { y: -0.03, rx: 0.172, rz: 0.13, cz: -0.02, gap: 0.07 },
  { y: 0.03, rx: 0.136, rz: 0.12, cz: -0.016, gap: 0.068 },
  { y: 0.085, rx: 0.13, rz: 0.13, cz: -0.012, gap: 0.098 },
  { y: 0.145, rx: 0.136, rz: 0.142, cz: -0.012, gap: 0.112 },
  { y: 0.205, rx: 0.132, rz: 0.142, cz: -0.016, gap: 0.104 },
  { y: 0.255, rx: 0.114, rz: 0.13, cz: -0.024, gap: 0.072 },
  { y: 0.292, rx: 0.084, rz: 0.104, cz: -0.036, gap: 0.03 },
  { y: 0.314, rx: 0.046, rz: 0.066, cz: -0.05, gap: 0.006 },
  { y: 0.322, rx: 0.012, rz: 0.022, cz: -0.062, gap: 0.003 },
];

function buildHood({ head, M, mesh }) {
  // the cloth: the outside in the coat's black, the inside in the lining (a dark cavity round the
  // face); folds drawn down it from the point (foldLines)
  const g = foldLines(shellGeometry(HOOD_RINGS, { sub: 2, cols: 26 }), (x, y, z, u) => 0.5 + 0.6 * Math.sin(u * 62 + y * 9) - 1.4 * Math.max(0, (y - 0.22) / 0.1));
  mesh(head, g, M.coat);
  mesh(head, g, M.lining);
  // the rim round the face opening: a paler torn edge, so the opening reads from the front
  const rim = [];
  for (const s of [-1, 1]) {
    rim.push(...[0, 1, 2, 3, 4].map((k) => {
      const A = HOOD_RINGS[k + 1], B = HOOD_RINGS[k + 2];
      const pt = (R) => {
        const a = Math.asin(Math.min(0.95, R.gap / R.rx));
        return [s * Math.sin(a) * (R.rx + 0.003), R.y, Math.cos(a) * (R.rz + 0.003) + R.cz];
      };
      const p = pt(A), q = pt(B);
      const len = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      const b = boxGeometry(0.014, len + 0.006, 0.006, 0, 0, 0);
      // lay the strip along p → q
      const ax = Math.atan2(q[2] - p[2], q[1] - p[1]), az = -Math.asin((q[0] - p[0]) / len);
      b.rotateX(ax);
      b.rotateZ(az);
      b.translate((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2);
      return b;
    }));
  }
  mesh(head, mergeGeometries(rim), M.hem);
  buildHoodHair(head, M, mesh, HOOD_HAIR);
}

/** Gold strands out of the hood (head space): each lock is [x, y, z of its root, direction x, y, z,
 *  length, half-width, curl]; `sides` are mirrored to both sides. Neighbours alternate the ink
 *  sub-id so a line separates them (strands, not one gold mass). Session 16, the owner's pick of
 *  three previews ("A"): a spiky fringe over the brow, chin-length locks at the cheeks, a short
 *  strand a side onto the collarbone; the face is in the hood's shadow (`shadowsFace`). Until then a
 *  pale face under one gold fringe read as a gold face. */
const HOOD_HAIR = {
  fringe: [[-0.05, 0.225, 0.075, -0.25, -1, 0.55, 0.085, 0.013, 0.25], [-0.018, 0.23, 0.085, -0.08, -1, 0.6, 0.095, 0.014, 0.25], [0.018, 0.23, 0.085, 0.1, -1, 0.6, 0.09, 0.014, 0.25], [0.052, 0.225, 0.075, 0.3, -1, 0.5, 0.08, 0.013, 0.25]],
  sides: [[0.072, 0.2, 0.06, 0.12, -1, 0.15, 0.13, 0.015, 0.2], [0.08, 0.17, 0.035, 0.2, -1, 0.1, 0.12, 0.013, 0.2], [0.088, 0.07, 0.04, 0.35, -1, 0.35, 0.13, 0.014, 0.15]],
};
export function buildHoodHair(head, M, mesh, H) {
  const mass = [], tips = [];
  let k = 0;
  const lock = ([x, y, z, dx, dy, dz, L, w, curl], s) => {
    // the root third in the darker gold, the rest in the bright tips: each strand reads root → tip
    for (const [t0, t1, out] of [[0, 0.4, mass], [0.4, 1, tips]]) {
      out.push(sub(orientTo(clumpGeometry(L, w, w * 0.5, { t0, t1, curl, taper: 0.7, cols: 6, rows: 2 }), [s * x, y, z], [s * dx, dy, dz], [s * 0.3, 0.2, 1]), k & 1));
    }
    k++;
  };
  for (const l of H.fringe) lock(l, 1);
  for (const s of [-1, 1]) for (const l of H.sides) lock(l, s);
  mesh(head, mergeGeometries(mass), M.hair);
  mesh(head, mergeGeometries(tips), M.hairTip);
}

// ---------------------------------------------------------------- chest: the wrap tunic
function buildTunic({ spine, chest, M, BODY, REST, mesh }) {
  const ySp = (h) => h - REST.spine, yCh = (h) => h - REST.chest;
  const SHELL = BODY.shell, top = SHELL[SHELL.length - 1];
  const rings = [...SHELL, { y: top.y + 0.02, rx: 0.058, rz: 0.056 }].map((r) => ({ ...r, gap: 0, y: ySp(r.y) }));
  // one closed shell; the wrap's edge is drawn as a fold line from the left collar bone to the
  // right hip (foldLines: the 0.5 contour of a field over the front)
  const g = foldLines(shellGeometry(rings, { sub: 3, cols: 28 }), (x, y, z) => (z > 0 ? 0.5 + 9 * (x - 0.05 + (y - ySp(1.3)) * 0.42) : 0));
  mesh(spine, g, M.shirt);
  const at = (h) => {
    let k = 0;
    while (k < SHELL.length - 2 && SHELL[k + 1].y < h) k++;
    const A = SHELL[k], B = SHELL[k + 1], u = Math.min(1, Math.max(0, (h - A.y) / (B.y - A.y)));
    return [lerp(A.rx, B.rx, u), lerp(A.rz, B.rz, u), lerp(A.cz ?? 0, B.cz ?? 0, u)];
  };
  // the belt at the natural waist and its buckle
  const W = at(1.2);
  mesh(spine, bandGeometry(W[0] + 0.012, W[1] + 0.012, 0.05, 32), M.leather, 0, ySp(1.2), W[2]);
  mesh(spine, boxGeometry(0.046, 0.04, 0.014, 0.012, ySp(1.2), W[1] + W[2] + 0.016), M.trim);
  // a torn sash hanging from the belt over the left hip
  mesh(spine, foldLines(tatterStrip(0.3, 0.09, { fork: true, curl: 0.12, seed: 211 }), ribbonCrease(0.09, 1.3)), M.hem, 0.075, ySp(1.185), W[1] + W[2] + 0.012);
  // the scarf: two rolls of pale cloth round the neck, under the hood (on the chest joint)
  mesh(chest, mergeGeometries([
    sub(bandGeometry(0.098, 0.09, 0.05, 20).translate(0, yCh(1.5), 0.004), 0),
    sub(bandGeometry(0.112, 0.1, 0.046, 20).translate(0, yCh(1.47), 0.006), 1),
  ]), M.hem);
}

// ---------------------------------------------------------------- arms: sleeves, bound forearms, bare hands
/** Cloth sleeves with a rounded shoulder and a soft elbow, forearms bound in leather strips, bare
 *  hands: the sword hand closed round the grip (on the `sword` joint), the free hand loosely
 *  closed. The forearm stops short of the grip so the WRIST reads between the binding and the fist. */
function buildArms(ctx) {
  const { arms, sword, M, DIM, BODY, mesh } = ctx;
  const [ua0, ua1] = BODY.upperArm, [fa0, fa1] = BODY.foreArm, HK = BODY.hand;
  let hand = null;
  {
    const F = gripFist(HK);
    mesh(sword, mergeGeometries([F.fingers, F.thumb, F.ridge]), M.skin);
  }
  for (const side of [-1, 1]) {
    const R = side < 0;
    const { upper, fore } = arms[R ? 'R' : 'L'];
    // upper arm: sleeve (sub-id 1: outlined against the torso), deltoid, and a ball over the elbow
    // so the bend is a joint, not two tubes meeting
    mesh(upper, mergeGeometries([
      sub(limb({ length: DIM.upperArm, r0: ua0, r1: ua1 + 0.002, bulge: 0.008 }), 1),
      sub(ellipsoidGeometry(...BODY.deltoid, { widthSegs: 12, heightSegs: 8 }).translate(side * 0.008, -0.02, 0), 1),
      sub(ellipsoidGeometry(ua1 + 0.006, ua1 + 0.004, ua1 + 0.008, { widthSegs: 10, heightSegs: 6 }).translate(0, -DIM.upperArm, -0.004), 1),
    ]), M.coat);
    // forearm: the sleeve's end, then leather bindings stepping down to the wrist (alternating
    // sub-ids: a line between each wrap)
    const wraps = [];
    const n = 5, y0 = -0.07, y1 = -DIM.foreArm + 0.062;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), y = lerp(y0, y1, t), r = lerp(fa0, fa1 - 0.003, t) + 0.004 * Math.sin(Math.PI * Math.min(1, t * 1.6));
      wraps.push(sub(limb({ length: (y0 - y1) / (n - 1) + 0.012, r0: r, r1: r - 0.004, radial: 10, rings: 2, capSegs: 1 }).translate(0, y + 0.006, 0), i & 1));
    }
    mesh(fore, sub(limb({ length: 0.085, r0: ua1 + 0.002, r1: fa0 + 0.004 }), 1), M.coat);
    mesh(fore, mergeGeometries(wraps), M.leather);
    if (R) {
      // the sword hand's wrist and the back of the hand, meeting the fist on the grip
      mesh(fore, mergeGeometries([
        limb({ length: 0.05, r0: fa1 - 0.006, r1: fa1 - 0.004, radial: 8, rings: 2, capSegs: 1 }).translate(0, -DIM.foreArm + 0.07, 0),
        ellipsoidGeometry(0.034 * HK, 0.04 * HK, 0.042 * HK, { widthSegs: 10, heightSegs: 6 }).translate(0, -DIM.foreArm + 0.022, 0.004),
      ]), M.skin);
    } else {
      // the free hand open (hanging, reaching, bracing), and the same hand closed round the grip
      // below the sword hand: the animator shows one or the other as the hand joins the grip
      // (rig.offHand, anim.js twoHand). The one free-hand builder every arms item shares (hands.js)
      hand = buildFreeHand(ctx);
    }
  }
  return hand;
}

// ---------------------------------------------------------------- back: the tattered cloak
/** The mantle (a short cape over both shoulders, on the chest joint) and SHROUD_SHEETS. Returns
 *  `streamers`: the two-segment springs the animator drives (anim.js _streamers reads each one's
 *  segs, len and out). */
function buildCloak(ctx) {
  buildMantle(ctx);
  return { streamers: hangShroudSheets(ctx, SHROUD_SHEETS) };
}

/** The mantle: a short cape over both shoulders (chest joint) with the clasp. */
function buildMantle({ chest, M, REST, mesh }) {
  const yCh = (h) => h - REST.chest;
  // the mantle: from the scarf out over the shoulders to a ragged edge at the top of the arms; open
  // a hand's width at the throat. Sub-id 1: outlined where the sheets leave it
  {
    // (Session 16: deeper front to back, the extra mostly behind, so the shoulders have some body in
    // profile; the same width across)
    const rings = [
      { y: yCh(1.375), rx: 0.268, rz: 0.2, cz: -0.026, gap: 0.05 },
      { y: yCh(1.42), rx: 0.252, rz: 0.186, cz: -0.02, gap: 0.045 },
      { y: yCh(1.468), rx: 0.2, rz: 0.148, cz: -0.01, gap: 0.036 },
      { y: yCh(1.505), rx: 0.118, rz: 0.102, cz: 0.002, gap: 0.03 },
    ];
    const g = sub(shellGeometry(rings, { sub: 2, cols: 30 }), 1);
    // a torn lower edge: every other column of the bottom row drops or lifts a little
    const p = g.attributes.position;
    for (let i = 0; i <= 30; i++) p.setY(i, p.getY(i) + (i % 3 === 0 ? -0.03 : i % 3 === 1 ? 0.012 : -0.008));
    g.computeVertexNormals();
    mesh(chest, g, M.coat);
    mesh(chest, g, M.lining);
    mesh(chest, boxGeometry(0.03, 0.03, 0.012, 0, yCh(1.485), 0.128, 0, 0, 0.78), M.trim); // the clasp
  }
}

/** A sheet's outermost columns (skirtSheet's 16-column grid) on side `side` (−1 = its −X edge, +1 =
 *  its +X edge), lifted a hair off its front face: the purple edge down the cloak's opening. */
function edgeTrim(g, side, n = 3) {
  const C = 17, idx = g.index.array, keep = [];
  for (let k = 0; k < idx.length; k += 3) {
    const i = Math.min(idx[k] % C, idx[k + 1] % C, idx[k + 2] % C);
    if (side < 0 ? i < n : i >= 16 - n) keep.push(idx[k], idx[k + 1], idx[k + 2]);
  }
  const t = g.clone();
  t.setIndex(keep);
  const p = t.attributes.position, nr = t.attributes.normal;
  for (let v = 0; v < p.count; v++) p.setXYZ(v, p.getX(v) + nr.getX(v) * 0.004, p.getY(v) + nr.getY(v) * 0.004, p.getZ(v) + nr.getZ(v) * 0.004);
  return t;
}

/** Hang cloak sheets (SHROUD_SHEETS' fields; `edge` ±1: a purple trim down that edge) on the
 *  streamer springs. `pale` = how far down the lower segment the pale torn zone starts. Returns the
 *  streamers. */
function hangShroudSheets({ chest, arms, M, mesh, joint }, SHEETS, { pale = 0.36, flare = 0.25, curl = 0.2 } = {}) {
  const streamers = [];
  SHEETS.forEach((d, i) => {
    const parent = d.on === 'armL' ? arms.L.upper : d.on === 'armR' ? arms.R.upper : chest;
    const base = joint(parent, ...d.at);
    base.rotation.y = d.ry; // local +Z = the sheet's outer face, +X = across it
    const [w0, w1, w2] = d.w, [L0, L1] = d.len;
    const nF = Math.max(1, Math.round(w2 / 0.11)) + 0.5, ph = i * 1.9 + 0.4;
    // drawn folds fanning down the sheet (as on the coat tails)
    const wAt = (dd) => (dd < L0 ? lerp(w0, w1, dd / L0) : lerp(w1, w2, Math.min(1, (dd - L0) / L1)));
    const pleat = (d0) => (x, y, z, u, gy) => {
      const dd = d0 - gy, w = wAt(dd);
      const f = Math.PI * 2 * nF * (u / w + 0.5 + 0.05 * Math.sin(dd * 8 + i * 1.7)) + ph + Math.PI;
      return 0.5 + 0.62 * (Math.sin(f) + 0.3 * Math.sin(f * 2.3 + 1.7)) - 0.9 * Math.max(0, 1 - dd / 0.14);
    };
    const s0 = joint(base);
    const g0 = foldLines(skirtSheet(L0, w0, w1, d.wrap, flare, 0, d.seed, [0.004, 0.018, nF, ph]), pleat(0));
    mesh(s0, g0, M.coat);
    mesh(s0, g0, M.lining);
    if (d.edge) mesh(s0, edgeTrim(g0, d.edge), M.facing);
    const s1 = joint(s0, 0, -L0, 0);
    const R1 = d.wrap + flare * L0;
    const fold = [0.018, 0.04, nF, ph];
    // the lower sheet: black to a third of the way down, then the pale torn zone to a jagged hem
    const g1 = foldLines(skirtSheet(L1, w1, w2, R1, flare, 0.05, d.seed + 7, fold, 0, pale), pleat(L0));
    mesh(s1, g1, M.coat);
    mesh(s1, g1, M.lining);
    if (d.edge) mesh(s1, edgeTrim(g1, d.edge), M.facing);
    const g2 = foldLines(skirtSheet(L1, w1, w2, R1, flare, 0.05, d.seed + 7, fold, pale, 1), pleat(L0));
    mesh(s1, g2, M.hem);
    mesh(s1, g2, M.lining);
    // torn points along the hem (rigid on the lower segment)
    const n = d.strips.length, R2 = R1 + flare * L1, wr = w2 / Math.max(1, n);
    for (let k = 0; k < n; k++) {
      const u = ((k + 0.5) / n - 0.5) * w2 + sheetOffset(w2, w0, 0), a = u / R2;
      const sw = Math.max(0.06, wr * 1.2);
      const m = mesh(s1, foldLines(tatterStrip(d.strips[k], sw, { fork: !!d.fork[k], curl, seed: 500 + d.seed * 13 + k * 7 }), ribbonCrease(sw, i * 2.7 + k * 1.3)), M.hem, Math.sin(a) * R2, -L1 + 0.012, (Math.cos(a) - 1) * R2);
      m.rotation.y = a;
    }
    // `w` (widths) and `arm` (1 / 2: hung on the right / left upper arm, which then does not push it)
    // feed the animator's cloth-vs-steel bound; `wrap` (the root curve) is for the tests' sheet model
    streamers.push({ segs: [s0, s1], len: d.len, out: d.out, lag: d.lag ?? SHROUD_LAG, max: SHROUD_MAX, w: d.w, arm: d.on === 'armR' ? 1 : d.on === 'armL' ? 2 : 0, wrap: d.wrap, ...(d.wob ? { wob: d.wob } : {}) });
  });
  return streamers;
}

// ---------------------------------------------------------------- back: the great cloak (ADR-281)
/** The owner's design sheet "MAIN CHARACTER / DESIGN EXPLORATION / 03" (2026-11-28): a long cloak
 *  over both shoulders, open at the front with a purple edge down the opening, long pale tears at
 *  the hem, a heavy cowl round the neck and shoulders. The owner's pick of three (B: to the calf, not
 *  the boots), then: "fix the left side ... not being connected", "not so flowery ... shaped like a
 *  dress", "width can be lowered a bit". So every long sheet hangs from the shoulders (none on the
 *  left arm: it swung apart from the rest), they hang near straight (`out` ~0.1, the hem barely
 *  wider than the seam), and they share one flutter (`wob`: a third of it, one phase). The fields
 *  are SHROUD_SHEETS'. */
const GREAT_WOB = [0.35, 0.6];
export const GREAT_SHEETS = [
  // down the middle of the back, then a sheet either side of it turned out round the body
  { on: 'chest', at: [0, 0.2, -0.165], ry: Math.PI, w: [0.19, 0.22, 0.25], len: [0.44, 0.43], out: 0.06, wrap: 0.24, strips: [0.17, 0.1, 0.23, 0.13], fork: [0, 1, 0, 0], seed: 3 },
  { on: 'chest', at: [0.11, 0.2, -0.13], ry: Math.PI - 0.55, w: [0.14, 0.17, 0.2], len: [0.435, 0.425], out: 0.07, wrap: 0.22, strips: [0.14, 0.21, 0.12], fork: [1, 0, 0], seed: 17 },
  { on: 'chest', at: [-0.11, 0.2, -0.13], ry: Math.PI + 0.55, w: [0.14, 0.17, 0.2], len: [0.435, 0.425], out: 0.07, wrap: 0.22, strips: [0.2, 0.11, 0.16], fork: [0, 0, 1], seed: 29 },
  // down each side from the back of the shoulder
  { on: 'chest', at: [0.155, 0.2, -0.07], ry: Math.PI - 1.15, w: [0.12, 0.17, 0.2], len: [0.435, 0.425], out: 0.08, wrap: 0.18, strips: [0.18, 0.12, 0.2], fork: [0, 1, 0], seed: 67 },
  { on: 'chest', at: [-0.155, 0.2, -0.07], ry: Math.PI + 1.15, w: [0.12, 0.17, 0.2], len: [0.435, 0.425], out: 0.08, wrap: 0.18, strips: [0.15, 0.21, 0.11], fork: [0, 0, 1], seed: 41 },
  // ... and one more each side, from the top of the shoulder down his flank (the owner: "too thin ...
  // its legs all showing"): the cloak's front edge, purple; the arms swing in front of it
  { on: 'chest', at: [0.18, 0.205, -0.005], ry: Math.PI - 1.85, w: [0.13, 0.19, 0.23], len: [0.43, 0.42], out: 0.1, wrap: 0.17, strips: [0.16, 0.22, 0.12], fork: [0, 0, 1], seed: 83, edge: -1 },
  { on: 'chest', at: [-0.18, 0.205, -0.005], ry: Math.PI + 1.85, w: [0.13, 0.19, 0.23], len: [0.43, 0.42], out: 0.1, wrap: 0.17, strips: [0.13, 0.2, 0.17], fork: [1, 0, 0], seed: 97, edge: 1 },
  // a short torn shoulder cape on the sword arm (as on the cloak before)
  SHROUD_SHEETS[4],
].map((d, i, A) => (i < A.length - 1 ? { ...d, wob: GREAT_WOB } : d));

/** The great cloak's purple: the edge down its opening is the `facing` material, made violet on the
 *  wearer's own rig (model.js tintHero; player.js paints it after every build that wears it). */
export const GREAT_CLOAK_TINT = Object.freeze({ facing: { fill: [0.3, 0.12, 0.42], ink: [0.66, 0.34, 0.9], inkGlow: 0.4 } });
/** ... and its ink lines in the player's own part tables (shaderLib uSelfPart*, `facing`'s part):
 *  violet lines and rim instead of the lapels' pale ones. [line rgba, rim rgba, fill gain]. */
const GREAT_CLOAK_PART = { part: 7, line: [0.78, 0.42, 1.05, 0.95], rim: [0.85, 0.48, 1.1, 1.0], gain: 1.5 };

/** Paint the great cloak's purple on the player's own `rig` after a build (buildHero rewrites his
 *  part tables from HERO_INK): violet when its back is the great cloak, HERO_INK's `facing` otherwise
 *  (an outfit option's lapels). `heroPartValues` from model.js (not imported here: gear/ stays below it). */
export function paintGreatCloak(U, rig, tintHero, heroPartValues, base) {
  if (!rig) return;
  const P = GREAT_CLOAK_PART, on = rig.loadout?.back === 'shroud.greatcloak';
  if (on) tintHero(rig.materials, GREAT_CLOAK_TINT);
  const [l, f, r] = on ? [P.line, null, P.rim] : heroPartValues(base);
  U?.uSelfPartInk?.value?.[P.part]?.set(l[0], l[1], l[2], l[3]);
  U?.uSelfPartRim?.value?.[P.part]?.set(r[0], r[1], r[2], r[3]);
  const fv = U?.uSelfPartFill?.value?.[P.part];
  if (fv) {
    if (on) fv.x = P.gain;
    else fv.set(f[0], f[1], f[2], f[3]);
  }
}

/** The cowl: a heavy wrap of the cloak's cloth round the neck and over the shoulders (chest-joint
 *  rings by height above the ground), two rolls round the throat, a torn lower edge. */
function buildCowl({ chest, M, REST, mesh }) {
  const yCh = (h) => h - REST.chest;
  const rings = [
    { y: yCh(1.33), rx: 0.3, rz: 0.215, cz: -0.03, gap: 0.03 },
    { y: yCh(1.385), rx: 0.288, rz: 0.205, cz: -0.026, gap: 0.03 },
    { y: yCh(1.435), rx: 0.255, rz: 0.185, cz: -0.02, gap: 0.028 },
    { y: yCh(1.475), rx: 0.2, rz: 0.158, cz: -0.012, gap: 0.024 },
    { y: yCh(1.51), rx: 0.155, rz: 0.135, cz: -0.004, gap: 0.02 },
  ];
  const g = foldLines(shellGeometry(rings, { sub: 2, cols: 32 }), (x, y, z, u) => 0.5 + 0.6 * Math.sin(u * 48 + y * 7));
  // a torn lower edge, deeper than the mantle's
  const p = g.attributes.position;
  for (let i = 0; i <= 32; i++) p.setY(i, p.getY(i) + (i % 3 === 0 ? -0.05 : i % 3 === 1 ? 0.01 : -0.02));
  g.computeVertexNormals();
  mesh(chest, g, M.coat);
  mesh(chest, g, M.lining);
  // the rolls round the throat, over the tunic's scarf (sub-ids alternate: a line between them)
  mesh(chest, mergeGeometries([
    sub(bandGeometry(0.17, 0.148, 0.055, 24).rotateX(0.1).translate(0, yCh(1.5), 0.004), 1),
    sub(bandGeometry(0.142, 0.128, 0.05, 24).rotateX(-0.08).translate(0, yCh(1.545), 0.008), 0),
  ]), M.coat);
}

/** The great cloak: the cowl and GREAT_SHEETS. */
function buildGreatCloak(ctx) {
  buildCowl(ctx);
  // (flare / curl: the sheets keep their curve down to the hem and the tears hang straight, not out)
  return { streamers: hangShroudSheets(ctx, GREAT_SHEETS, { pale: 0.62, flare: 0.08, curl: 0.04 }) };
}

/** The set. `hair` on a head item: the pieces of the hair model.js builds under it ('cap' and
 *  HAIR_CLUSTERS names; `hidesHair: true` = none); `shadowsFace`: the face and neck go dark (the
 *  hood's shadow) and the eyes are left out. The hood keeps only the scalp cap and builds its own
 *  strands (HOOD_HAIR); the body's clusters poked through the cloth or massed over the face. */
export const SHROUD_ITEMS = [
  { id: 'shroud.hood', slot: 'head', name: 'Tattered Hood', hair: ['cap'], shadowsFace: true, build: buildHood },
  { id: 'shroud.tunic', slot: 'chest', name: 'Wrap Tunic', build: buildTunic },
  { id: 'shroud.arms', slot: 'arms', name: 'Bound Sleeves', build: buildArms },
  { id: 'shroud.cloak', slot: 'back', name: 'Tattered Shroud', build: buildCloak },
  // the default since ADR-281 (the owner's design sheet); shroud.cloak above is the cloak before it
  { id: 'shroud.greatcloak', slot: 'back', name: 'Great Cloak', build: buildGreatCloak },
];
