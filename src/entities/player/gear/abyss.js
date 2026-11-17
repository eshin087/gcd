import { ellipsoidGeometry, limbGeometry } from '../../../render/glyphGeometry.js';
import { gridGeometry, bandGeometry, boxGeometry, kiteGeometry, mergeGeometries, sub, lerp, limb, gripFist, sheetOffset, clumpGeometry, orientTo, orient } from '../heroGeo.js';
import { DIM } from '../heroDims.js';
import { buildFreeHand } from './hands.js';

// THE HOODED HERO (the owner's concept sheet "GCD ABYSS, main character concept", 2026-11-17; the
// only hero outfit, gear/index.js DEFAULT_LOADOUT). A figure of a few big black shapes, each closed
// by a bold white line (the art pass's own line for the player, pipeline HERO_LINES 'b'), in three
// colours: black cloth, the white / silver line, the lavender-white crystal; a muted skin on the
// blank face. Measured from the sheet: HK SPEC.md (H = 1.82 m to the hood's point with HERO_LEGS).
//   head     abyss.hood    a roomy hood: a soft point set a little back, a ridge from the point to the
//                          brow (the seam between its two halves), a wide angular opening; four or five
//                          chunky silver spikes of hair over a blank lit face (`blankFace`)
//   chest    abyss.robe    the robe's body (two halves: the bold line down his front) and the cowl:
//                          two thick wraps on a DIAGONAL from his right side up over his left shoulder,
//                          dipping to a V between the shoulder blades
//   arms     abyss.arms    a wide bell sleeve on the sword arm (a bold rim round the cuff), a plain
//                          sleeve on the shield arm, black gloves
//   legs     abyss.legs    black trousers, boots to mid-shin with a bold band at the top and the ankle
//   waist    abyss.skirt   the robe's skirt: four panels on the coat springs (the two fronts carry the
//                          bold front edges), the hem cut into big angular points
//   back     abyss.cloak   the robe's back: three sheets on the streamer springs, one broad shape
//                          closed round his back, its centre to a deep V point between the boots
//   weapon   abyss.sword   the crystal sword: a pale blade with a centre ridge, a plain swept guard,
//                          a diamond pommel, 0.92 m from the pommel to the point
//   offhand  shield.kite   (gear/shield.js)
// Materials: the `ab*` entries of HERO_INK (model.js), the player's own bank only.
//
// Heights: the upper body is built in the design frame (REST, DIM's legs: pivot 1.04); the hero
// stands on HERO_LEGS, 0.085 m lower. Comments give both where it matters ("1.235 d = 1.15 m").

/** The design frame's height above the hero's own (heroDims.js: DIM's legs vs HERO_LEGS). */
const DF = 0.085;

/** The sword's numbers (sword space: origin = the grip's centre, blade along +Z): DIM's hilt and hit
 *  segment (gameplay reach unchanged), a crystal blade to a point 0.77 m out: 0.92 m from the
 *  pommel's tip (−0.15) to the point. The animator's clamp and clearance, the FX and the drawn
 *  contact read these through `rig.weaponDims`; `steelTip` a little past the point, so the drawn
 *  blade never touches the grass. */
export const ABYSS_SWORD_DIMS = Object.freeze({
  gripBack: DIM.gripBack, guard: DIM.guard, gem: DIM.gem, forte: DIM.forte,
  steelTip: 0.87, drawnTip: 0.77, bladeBase: DIM.bladeBase, bladeTip: DIM.bladeTip,
});
const SD = ABYSS_SWORD_DIMS;

// ================================================================ shared pieces
/**
 * A cloth sheet hanging −Y from its joint, curved round a radius that grows down it (as heroGeo's
 * skirtSheet), whose HEM is cut into big angular points: `hem` = [[s, extra], ...] (s 0..1 across
 * the sheet, its −X edge to its +X edge; extra = metres it hangs below `len` there; linear between).
 * Rows stretch with the hem, so a point is a long smooth wedge of cloth, not a strip stuck on.
 * Local +Z = outward. aGUV: x across, y down it.
 */
function pointSheet(len, wTop, wBot, R0, flare, hem, { cols = 18, rows = 7, lap = 0 } = {}) {
  const hemAt = (s) => {
    for (let i = 0; i < hem.length - 1; i++) {
      const [s0, e0] = hem[i], [s1, e1] = hem[i + 1];
      if (s <= s1) return lerp(e0, e1, Math.min(1, Math.max(0, (s - s0) / Math.max(1e-6, s1 - s0))));
    }
    return hem[hem.length - 1][1];
  };
  // (`lap`: the sheet starts that far ABOVE its joint, under the segment above it, so a kink where
  // two spring segments meet never opens a notch in the cloth)
  return gridGeometry(cols, rows, (s, t, o) => {
    const L = len + hemAt(s) + lap;
    const d = t * L - lap;
    const w = lerp(wTop, wBot, Math.max(0, d) / (L - lap));
    const u = (s - 0.5) * w;
    const R = R0 + flare * Math.max(0, d);
    const a = u / R;
    const y = -d;
    o[0] = Math.sin(a) * R;
    o[1] = y;
    o[2] = (Math.cos(a) - 1) * R;
    o[3] = u;
    o[4] = y;
  }, true);
}

/** The deepest point of a hem profile (m below `len`). */
const hemMax = (hem) => Math.max(...hem.map((p) => p[1]));

/**
 * A loft between per-angle edges: for angle a (0 = his front, + = his left, π = his back) from `a0`
 * to `a1`, a column from height `lo(a)` up to `hi(a)`, the cross-section at height y an ellipse of
 * half-width rx(y), half-depth rz(y), centre offset cz(y) (`prof(y)` → [rx, rz, cz]). For the cowl's
 * wraps (a diagonal lower edge, a V at the back) and the robe's halves. aGUV: x = arc, y = height.
 */
function loftBetween(a0, a1, lo, hi, prof, { cols = 32, rows = 6, out = 0 } = {}) {
  return gridGeometry(cols, rows, (s, t, o) => {
    const a = lerp(a0, a1, s), y = lerp(lo(a), hi(a), t);
    const [rx, rz, cz] = prof(y);
    o[0] = Math.sin(a) * (rx + out);
    o[1] = y;
    o[2] = Math.cos(a) * (rz + out) + cz;
    o[3] = (a - Math.PI) * 0.2;
    o[4] = y;
  });
}

/** Linear through [[y, rx, rz, cz], ...] (y ascending). */
const profile = (P) => (y) => {
  if (y <= P[0][0]) return P[0].slice(1);
  for (let i = 0; i < P.length - 1; i++) {
    const A = P[i], B = P[i + 1];
    if (y <= B[0]) {
      const u = (y - A[0]) / (B[0] - A[0]);
      return [lerp(A[1], B[1], u), lerp(A[2], B[2], u), lerp(A[3], B[3], u)];
    }
  }
  return P[P.length - 1].slice(1);
};

/** Linear through [[a, v], ...] (a ascending, rad). */
const curve = (P) => (a) => {
  if (a <= P[0][0]) return P[0][1];
  for (let i = 0; i < P.length - 1; i++) {
    const A = P[i], B = P[i + 1];
    if (a <= B[0]) return lerp(A[1], B[1], (a - A[0]) / (B[0] - A[0]));
  }
  return P[P.length - 1][1];
};

// ================================================================ head: the hood, the hair
/**
 * The hood, built from flat PLANES (the concept's head sheet): each ring is the half-section at
 * height y (head space: above the neck-base joint) as a polyline of [x, z] corners from the front
 * edge round to the back's centre line, his left half (+X; the right half is its mirror). Between
 * the corners and between the rings the cloth is straight, so every view sees a hard-cornered
 * outline: from the front a soft point, a shallow slope to the upper corners, a steeper one to the
 * cheeks, near-straight sides and a turn in to the neck; from the side a brow tip reaching forward
 * past the face, a short slope up to the point (a few cm back), a long fall down the back; from
 * behind a pointed arch. The front edge: above the brow the two halves meet in the RIDGE (x = 0,
 * a bold part edge down from the point); below it the edges part into the wide angular opening (a V
 * at the brow, widest at the cheeks, closing under the chin into the cowl). The back's centre line
 * is the seam. Corners: E the front edge, F the front corner, S the side, K the back corner, B the
 * back centre. Measured (SPEC.md): 0.38 m wide, 0.36 m deep, the point 0.37 above the joint.
 */
export const HOOD_RINGS = [
  { y: -0.01, pts: [[0.07, 0.085], [0.15, 0.055], [0.18, -0.05], [0.162, -0.152], [0, -0.178]] },
  { y: 0.06, pts: [[0.135, 0.075], [0.178, 0.035], [0.19, -0.055], [0.158, -0.164], [0, -0.187]] },
  { y: 0.125, pts: [[0.16, 0.062], [0.19, 0.02], [0.192, -0.062], [0.156, -0.168], [0, -0.19]] },
  { y: 0.185, pts: [[0.122, 0.105], [0.18, 0.05], [0.186, -0.062], [0.15, -0.162], [0, -0.19]] },
  { y: 0.232, pts: [[0.068, 0.142], [0.158, 0.075], [0.166, -0.052], [0.134, -0.152], [0, -0.178]] },
  { y: 0.27, pts: [[0, 0.172], [0.13, 0.085], [0.138, -0.044], [0.11, -0.13], [0, -0.158]] },
  { y: 0.302, pts: [[0, 0.112], [0.098, 0.058], [0.102, -0.04], [0.082, -0.108], [0, -0.128]] },
  { y: 0.37, pts: [[0, -0.018], [0.006, -0.024], [0.007, -0.03], [0.005, -0.036], [0, -0.04]] },
];

/** One half of the hood (side +1: his left, −1: his right) through HOOD_RINGS: straight between
 *  the corners (`cs` columns each) and between the rings (`rs` rows each). The two halves meet in
 *  the ridge and the back seam (a part edge, drawn bold). */
function hoodHalf(rings, side, { cs = 2, rs = 2 } = {}) {
  const nP = rings[0].pts.length;
  return gridGeometry((nP - 1) * cs, (rings.length - 1) * rs, (s, t, o) => {
    hoodAt(rings, side, s, t, o);
    o[3] = side * s * 0.4;
    o[4] = o[1];
  }, side < 0);
}

/** The point of hood half `side` at s (0 the front edge .. 1 the back's centre) and t (0 the lowest
 *  ring .. 1 the point) into o[0..2]. */
function hoodAt(rings, side, s, t, o) {
  const nP = rings[0].pts.length;
  const f = t * (rings.length - 1), k = Math.min(rings.length - 2, Math.floor(f)), u = f - k;
  const g = s * (nP - 1), i = Math.min(nP - 2, Math.floor(g)), w = g - i;
  const A = rings[k], B = rings[k + 1];
  const xa = lerp(A.pts[i][0], A.pts[i + 1][0], w), za = lerp(A.pts[i][1], A.pts[i + 1][1], w);
  const xb = lerp(B.pts[i][0], B.pts[i + 1][0], w), zb = lerp(B.pts[i][1], B.pts[i + 1][1], w);
  o[0] = side * lerp(xa, xb, u);
  o[1] = lerp(A.y, B.y, u);
  o[2] = lerp(za, zb, u);
  return o;
}

/** The opening's TRIM on hood half `side`: a band `w` wide on the cloth along the front edge, from
 *  the hood's lower edge up to the brow's V (ring `kV`), standing 3 mm proud (the concept draws the
 *  opening as a bold bright band). */
function hoodTrim(rings, side, kV, w = 0.016) {
  const nP = rings[0].pts.length, tV = kV / (rings.length - 1), P = [0, 0, 0], Q = [0, 0, 0];
  return gridGeometry(1, kV * 4, (s, tt, o) => {
    const t = tt * tV;
    hoodAt(rings, side, 0, t, P);
    hoodAt(rings, side, 1 / (nP - 1), t, Q);
    const L = Math.hypot(Q[0] - P[0], Q[2] - P[2]) || 1;
    const a = (s * w) / L;
    const x = lerp(P[0], Q[0], a), z = lerp(P[2], Q[2], a);
    const r = Math.hypot(x, z + 0.01) || 1;
    o[0] = x + (x / r) * 0.003;
    o[1] = P[1];
    o[2] = z + ((z + 0.01) / r) * 0.003;
    o[3] = s * w;
    o[4] = P[1];
  }, side < 0);
}

/** The RIDGE's trim: a band `w` wide straddling the seam from the brow's V (ring `kV`) up to the
 *  point, 3 mm proud: the concept's bold line from the point down to the brow. */
function hoodRidge(rings, kV, w = 0.012) {
  const nP = rings[0].pts.length, tV = kV / (rings.length - 1), P = [0, 0, 0], Q = [0, 0, 0];
  return gridGeometry(2, (rings.length - 1 - kV) * 3, (s, tt, o) => {
    const t = lerp(tV, 0.985, tt), side = s < 0.5 ? -1 : 1, k = Math.abs(s - 0.5) * 2;
    hoodAt(rings, side, 0, t, P);
    hoodAt(rings, side, 1 / (nP - 1), t, Q);
    const L = Math.hypot(Q[0] - P[0], Q[2] - P[2]) || 1;
    const a = Math.min(1, (k * w * 0.5) / L);
    const x = lerp(P[0], Q[0], a), z = lerp(P[2], Q[2], a);
    // (outward: along the ridge's own normal, roughly forward-up from the hood's centre)
    const ny = P[1] - 0.2, nz = z + 0.01, r = Math.hypot(ny, nz) || 1;
    o[0] = x;
    o[1] = P[1] + (ny / r) * 0.003;
    o[2] = z + (nz / r) * 0.003;
    o[3] = (s - 0.5) * w;
    o[4] = P[1];
  });
}

/** The silver hair under the hood (head space): four chunky spikes over the brow down to about the
 *  nose, one at each temple; a cap over the skull so the hood's opening shows hair, not a bald
 *  brow. Each lock: [x, y, z of its root, direction x, y, z, length, half-width, curl]. */
//  [x, y, z of its root, direction x, y, z, length, half-width, curl, ink sub-id]. Neighbours carry
//  different sub-ids (and stand at different depths), so a dark line parts every lock from the next.
const SPIKES = [
  // the fringe: five chunky locks over the brow, the middle ones to about the nose
  [0.002, 0.226, 0.072, 0.04, -1, 0.36, 0.128, 0.027, 0.16, 0],
  [0.034, 0.222, 0.068, 0.32, -1, 0.34, 0.118, 0.025, 0.14, 1],
  [-0.032, 0.223, 0.07, -0.26, -1, 0.36, 0.122, 0.026, 0.15, 1],
  [0.062, 0.212, 0.052, 0.56, -1, 0.3, 0.1, 0.023, 0.12, 0],
  [-0.062, 0.212, 0.054, -0.52, -1, 0.3, 0.104, 0.023, 0.12, 0],
  // the temples: locks splayed down and out over the cheeks (the face shows small between them)
  [0.082, 0.196, 0.036, 0.42, -1, 0.22, 0.112, 0.022, 0.1, 1],
  [-0.082, 0.196, 0.036, -0.42, -1, 0.22, 0.112, 0.022, 0.1, 1],
  [0.092, 0.168, 0.0, 0.62, -1, 0.05, 0.088, 0.019, 0.08, 0],
  [-0.092, 0.168, 0.0, -0.62, -1, 0.05, 0.088, 0.019, 0.08, 0],
  // over the crown, swept forward (the 3/4 and side views under the hood's brow)
  [0.045, 0.252, -0.01, 0.25, -0.55, 1, 0.1, 0.026, 0.12, 1],
  [-0.04, 0.255, -0.01, -0.22, -0.55, 1, 0.1, 0.026, 0.12, 0],
];

function buildHood({ head, M, mesh }) {
  mesh(head, hoodHalf(HOOD_RINGS, 1), M.abHood);
  mesh(head, hoodHalf(HOOD_RINGS, -1), M.abHood2);
  const kV = HOOD_RINGS.findIndex((r) => r.pts[0][0] === 0);
  mesh(head, mergeGeometries([hoodTrim(HOOD_RINGS, 1, kV), hoodTrim(HOOD_RINGS, -1, kV), hoodRidge(HOOD_RINGS, kV)]), M.abBand);
  // the hair: a cap and the locks (alternate ink sub-ids: a dark line between neighbours)
  const locks = [sub(orient.up(ellipsoidGeometry(0.088, 0.1, 0.096, { widthSegs: 12, heightSegs: 8 })).translate(0, 0.166, -0.01), 0)];
  SPIKES.forEach(([x, y, z, dx, dy, dz, L, w, curl, k]) => {
    locks.push(sub(orientTo(clumpGeometry(L, w, w * 0.5, { curl, taper: 0.8, cols: 6, rows: 3 }), [x, y, z], [dx, dy, dz], [x * 3, 0.2, 1]), k));
  });
  mesh(head, mergeGeometries(locks), M.abHair);
}

// ================================================================ chest: the robe's body, the cowl
/** The cowl's two wraps (chest space via yCh; design-frame heights). Profile [y, rx, rz, cz]: the
 *  cloth from the chest up over the shoulders to a thick collar under the chin. */
// (round 3: wider and flatter over the shoulders, so the silhouette steps out from the hood to the
// shoulders before the cloak flares: 0.60 m across, the top a shallow slope)
const COWL_PROF = [
  [1.2, 0.24, 0.17, 0.006],
  [1.34, 0.275, 0.186, -0.006],
  [1.43, 0.302, 0.194, -0.014],
  [1.485, 0.298, 0.186, -0.014],
  [1.515, 0.25, 0.168, -0.01],
  [1.545, 0.16, 0.13, -0.002],
  [1.57, 0.09, 0.088, 0.008],
  [1.6, 0.064, 0.07, 0.014],
];
/** The outer wrap's lower edge by angle (design m): a diagonal from low on his right side (1.235 d =
 *  1.15 m) up over his left shoulder (1.47 d), round the sides at the top of the arms, a V between
 *  the shoulder blades (1.385 d = 1.30 m). */
const COWL_LO = curve([
  [-Math.PI, 1.385], [-2.6, 1.415], [-2.0, 1.4], [-1.55, 1.37], [-1.15, 1.27], [-0.8, 1.235], [-0.3, 1.29], [0.2, 1.35], [0.7, 1.41], [1.2, 1.44], [1.6, 1.405], [2.0, 1.405], [2.6, 1.415], [Math.PI, 1.385],
]);
/** The inner wrap (the scarf round the neck, over the outer one): its lower edge a hand higher and
 *  on the same diagonal, a shallower V behind. */
const SCARF_LO = curve([
  [-Math.PI, 1.465], [-2.2, 1.49], [-1.5, 1.475], [-1.0, 1.39], [-0.5, 1.36], [0.0, 1.4], [0.6, 1.46], [1.2, 1.505], [1.8, 1.5], [2.4, 1.49], [Math.PI, 1.465],
]);

function buildRobe({ spine, chest, M, BODY, REST, mesh }) {
  const ySp = (h) => h - REST.spine, yCh = (h) => h - REST.chest;
  // the robe's body: the torso shell, loose (× 1.14 round), from the waist up under the cowl, in two
  // halves meeting down his front (the bold front edge) and his back (under the cloak)
  const SH = BODY.shell;
  const P = [...SH.map((r) => [r.y, r.rx * 1.14 + 0.012, r.rz * 1.14 + 0.012, r.cz ?? 0])].filter((r) => r[0] <= 1.48);
  P.push([1.5, 0.13, 0.1, 0.0]);
  const prof = profile(P);
  for (const side of [1, -1]) {
    const g = loftBetween(side > 0 ? 0 : -Math.PI, side > 0 ? Math.PI : 0, () => SH[0].y - 0.04, () => 1.5, prof, { cols: 14, rows: 8 });
    g.translate(0, -REST.spine, 0); // (heights → spine space: the loft was built in world idle heights)
    mesh(spine, g, side > 0 ? M.abRobeL : M.abRobeR);
  }
  // the cowl: the outer wrap, then the scarf over it (each its own part: its lower edge a bold fold)
  const cp = profile(COWL_PROF);
  const outer = loftBetween(-Math.PI, Math.PI, COWL_LO, () => 1.55, cp, { cols: 40, rows: 7 });
  outer.translate(0, -REST.chest, 0);
  mesh(chest, outer, M.abCowl);
  const scarf = loftBetween(-Math.PI, Math.PI, SCARF_LO, () => 1.6, (y) => {
    const [rx, rz, cz] = cp(y);
    return [rx + 0.018, rz + 0.016, cz];
  }, { cols: 40, rows: 5 });
  scarf.translate(0, -REST.chest, 0);
  mesh(chest, scarf, M.abCowl2);
  void ySp; void yCh;
}

// ================================================================ arms
function buildArms(ctx) {
  const { arms, sword, M, DIM: D, BODY, mesh } = ctx;
  const [ua0, ua1] = BODY.upperArm, [fa0, fa1] = BODY.foreArm, HK = BODY.hand;
  // the sword hand: a black glove closed on the grip, its wrist and the back of the hand
  {
    const F = gripFist(HK);
    mesh(sword, mergeGeometries([F.fingers, F.thumb, F.ridge]), M.abPants);
    mesh(arms.R.fore, mergeGeometries([
      limb({ length: 0.06, r0: fa1 - 0.002, r1: fa1 - 0.003, radial: 8, rings: 2, capSegs: 1 }).translate(0, -D.foreArm + 0.075, 0),
      ellipsoidGeometry(0.034 * HK, 0.04 * HK, 0.042 * HK, { widthSegs: 10, heightSegs: 6 }).translate(0, -D.foreArm + 0.022, 0.004),
    ]), M.abPants);
  }
  for (const side of [-1, 1]) {
    const { upper, fore } = arms[side < 0 ? 'R' : 'L'];
    // the upper sleeve, loose, with its shoulder cap (under the cowl) and the elbow
    mesh(upper, mergeGeometries([
      limb({ length: D.upperArm, r0: ua0 + 0.012, r1: ua1 + 0.016, bulge: 0.01 }),
      ellipsoidGeometry(BODY.deltoid[0] * 1.02, BODY.deltoid[1], BODY.deltoid[2] * 1.02, { widthSegs: 12, heightSegs: 8 }).translate(side * 0.006, -0.03, 0),
      ellipsoidGeometry(ua1 + 0.018, ua1 + 0.014, ua1 + 0.02, { widthSegs: 10, heightSegs: 6 }).translate(0, -D.upperArm, -0.004),
    ]), M.abSleeve);
    if (side < 0) {
      // the sword arm's BELL: from the elbow it widens to a cuff ~0.18 m across, open toward the hand
      // and a little longer at the back (the concept's drooping cuff); its rim a bold band
      const B = { y0: 0.01, y1: -0.205, r0: ua1 + 0.018, r1: 0.09 };
      const yb = (a) => B.y1 - 0.035 * (0.5 - 0.5 * Math.cos(a)); // (a = 0 the front, π the back)
      mesh(fore, gridGeometry(16, 4, (s, t, o) => {
        const a = s * Math.PI * 2, r = lerp(B.r0, B.r1, t ** 1.5);
        o[0] = Math.sin(a) * r;
        o[1] = lerp(B.y0, yb(a), t);
        o[2] = Math.cos(a) * r;
        o[3] = (a - Math.PI) * 0.07;
        o[4] = o[1];
      }, true), M.abSleeve);
      mesh(fore, gridGeometry(16, 1, (s, t, o) => {
        const a = s * Math.PI * 2, r = B.r1 + 0.003;
        o[0] = Math.sin(a) * r;
        o[1] = yb(a) + 0.03 * (1 - t);
        o[2] = Math.cos(a) * r;
        o[3] = (a - Math.PI) * 0.07;
        o[4] = o[1];
      }, true), M.abCuff);
      // the dark inner sleeve to the wrist
      mesh(fore, limb({ length: 0.2, r0: fa0 + 0.002, r1: fa1 + 0.002 }).translate(0, -0.04, 0), M.abPants);
    } else {
      // the shield arm: a plain sleeve to the wrist (the shield's straps and fist are the shield's)
      mesh(fore, mergeGeometries([
        limb({ length: 0.09, r0: ua1 + 0.016, r1: fa0 + 0.01 }),
        limb({ length: 0.19, r0: fa0 + 0.01, r1: fa1 + 0.006, radial: 10, rings: 3 }).translate(0, -0.07, 0),
      ]), M.abSleeve);
    }
  }
  return buildFreeHand(ctx, M.abPants);
}

// ================================================================ legs: trousers, boots
/** Boots to mid-shin (the band at 0.32 m), a band at the ankle (0.155 m) and an outlined sole. The
 *  shin joint is the knee (0.45 m on HERO_LEGS). */
function buildLegs({ pelvis, legs, M, DIM: D, BODY, mesh }) {
  const [hx, hy, hz] = BODY.hips.r;
  mesh(pelvis, orient.up(ellipsoidGeometry(hx, hz, hy)), M.abPants, ...BODY.hips.c);
  const [th0, th1, thB] = BODY.thigh, [sh0, sh1, shB] = BODY.shin, F = BODY.foot;
  const knee = D.ankle + D.shin, yTop = -(knee - 0.32), yAnk = -(knee - 0.155);
  const rAt = (y) => lerp(sh0, sh1, Math.min(1, -y / D.shin)) + shB * Math.sin(Math.PI * Math.min(1, -y / D.shin));
  for (const side of ['R', 'L']) {
    const { thigh, shin, foot } = legs[side];
    mesh(thigh, limb({ length: D.thigh, r0: th0, r1: th1, bulge: thB }), M.abPants);
    // the trouser leg down to the boot's top
    mesh(shin, limb({ length: -yTop + 0.02, r0: sh0, r1: rAt(yTop) - 0.002, bulge: 0.004 }), M.abPants);
    // the boot's shaft, a little wider than the leg, and its top band; the ankle band
    const rT = rAt(yTop) + 0.012;
    mesh(shin, limb({ length: D.shin + yTop - 0.01, r0: rT, r1: sh1 + 0.008, bulge: 0.004 }).translate(0, yTop, 0), M.abBoot);
    mesh(shin, mergeGeometries([
      bandGeometry(rT + 0.004, rT + 0.004, 0.022, 16).translate(0, yTop - 0.004, 0),
      bandGeometry(sh1 + 0.014, sh1 + 0.016, 0.016, 14).translate(0, yAnk, 0),
    ]), M.abBand);
    // the foot and the heel; the sole round it
    mesh(foot, mergeGeometries([
      ellipsoidGeometry(F.r[0] + 0.004, F.r[1], F.r[2] + 0.004, { widthSegs: 12, heightSegs: 6 }).translate(...F.c),
      boxGeometry(0.066, 0.034, 0.056, 0, -0.052, -0.062),
    ]), M.abBoot);
    mesh(foot, ellipsoidGeometry(F.r[0] + 0.011, 0.009, F.r[2] + 0.011, { widthSegs: 16, heightSegs: 3 }), M.abBand, 0, -0.064, F.c[2]);
  }
}

// ================================================================ waist: the robe's skirt (coat springs)
/**
 * Four panels on the pelvis (the animator's coat springs: anim.js _coat). The two fronts meet down
 * his front (their edges are the robe's bold front lines) and end in the long front points (0.28 m);
 * the sides end in points at 0.35 m; the highest notch 0.40 m (SPEC.md). `hem`: the points (pointSheet).
 * Widths no wider at the top than the old coat panels' (the animator's leg push was tuned there).
 */
export const ABYSS_PANELS = [
  // (round 3: the hem TORN, the concept's: a long point at each front edge, small tatters between
  // the front points, a big uneven point on every side; notch to point 0.10 - 0.16 m)
  { az: 0.36, w: [0.16, 0.25, 0.34], len: [0.34, 0.29], out: 0.012, flare: 0.22, mat: 'abRobeL', breeze: 0.025, idleFlare: 0.03, hem: [[0, 0.17], [0.1, 0.12], [0.2, 0.03], [0.3, 0.08], [0.42, 0.0], [0.6, 0.11], [0.76, 0.01], [0.88, 0.06], [1, 0.0]] },
  { az: -0.36, w: [0.16, 0.25, 0.34], len: [0.34, 0.29], out: 0.012, flare: 0.22, mat: 'abRobeR', breeze: 0.03, idleFlare: 0.04, hem: [[0, 0.0], [0.1, 0.07], [0.22, 0.01], [0.4, 0.12], [0.56, 0.0], [0.67, 0.05], [0.79, 0.02], [0.9, 0.12], [1, 0.155]] },
  { az: 1.4, w: [0.16, 0.27, 0.4], len: [0.34, 0.28], out: 0.01, flare: 0.3, mat: 'abRobe', breeze: 0.05, idleFlare: 0.08, hem: [[0, 0.02], [0.26, 0.14], [0.46, 0.0], [0.72, 0.11], [1, 0.0]] },
  { az: -1.4, w: [0.16, 0.27, 0.4], len: [0.34, 0.28], out: 0.01, flare: 0.3, mat: 'abRobe', breeze: 0.05, idleFlare: 0.09, hem: [[0, 0.0], [0.3, 0.12], [0.54, 0.0], [0.8, 0.15], [1, 0.03]] },
];

function buildSkirt({ pelvis, M, DIM: D, mesh, joint }) {
  const coat = [];
  ABYSS_PANELS.forEach((Pn) => {
    const sa = Math.sin(Pn.az), ca = Math.cos(Pn.az);
    const R0 = 1 / Math.hypot(sa / D.coatR, ca / (D.coatR * 0.69)) + Pn.out * 0.5 + 0.02;
    const anchor = joint(pelvis, sa * R0, D.coatY, ca * R0);
    anchor.rotation.y = Pn.az; // local +Z = outward, +X = tangent
    const s0 = joint(anchor);
    const [L0, L1] = Pn.len, mat = M[Pn.mat];
    mesh(s0, pointSheet(L0, Pn.w[0], Pn.w[1], R0, Pn.flare, [[0, 0], [1, 0]], { rows: 4 }), mat);
    const s1 = joint(s0, 0, -L0, 0);
    const R1 = R0 + Pn.flare * L0;
    mesh(s1, pointSheet(L1, Pn.w[1], Pn.w[2], R1, Pn.flare, Pn.hem, { rows: 7, cols: 32, lap: 0.04 }), mat);
    coat.push({ anchor, segs: [s0, s1], def: { ...Pn, strips: [], fork: [] }, strips: [], len: [L0, L1 + hemMax(Pn.hem) * 0.8], r0: R0 });
  });
  return { coat };
}

// ================================================================ back: the robe's back (streamers)
/**
 * Three sheets from under the cowl's back, round his back to the hem, cut from ONE cone (round
 * CLOAK_C, radius CLOAK_R0 at the top, flaring 0.25 m per metre down): at rest they meet edge to
 * edge, the sides tucked 4 mm under the centre's edges, so his back is one broad shape with no line
 * on it (round 2's sheets crossed and drew stray lines). Each sheet `a` rad round from his front, `span`
 * rad wide (its width follows the cone's radius down it). The centre ends in the deep V between the
 * boots, the sides in big uneven points. On the streamer springs (anim.js _streamers), the same
 * length, lean and lag each, so they swing together and part only when the cloth is thrown.
 */
const CLOAK_C = [0, 0.25, 0], CLOAK_R0 = 0.2, CLOAK_FL = 0.25;
export const ABYSS_SHEETS = [
  { a: Math.PI, span: 1.2, tuck: 0, len: [0.57, 0.42], hem: [[0, 0.03], [0.13, 0.12], [0.26, 0.0], [0.5, 0.2], [0.74, 0.01], [0.87, 0.1], [1, 0.03]] },
  { a: Math.PI - 1.02, span: 0.94, tuck: 0.004, len: [0.57, 0.37], hem: [[0, 0.0], [0.18, 0.04], [0.36, 0.15], [0.56, 0.01], [0.8, 0.12], [1, 0.03]] },
  { a: Math.PI + 1.02, span: 0.94, tuck: 0.004, len: [0.57, 0.37], hem: [[0, 0.04], [0.2, 0.13], [0.42, 0.0], [0.64, 0.16], [0.82, 0.03], [1, 0.0]] },
];

function buildCloak({ chest, M, mesh, joint }) {
  const streamers = [];
  for (const d of ABYSS_SHEETS) {
    const R0 = CLOAK_R0 - d.tuck, [L0, L1] = d.len, R1 = R0 + CLOAK_FL * L0, R2 = R1 + CLOAK_FL * L1;
    const base = joint(chest, CLOAK_C[0] + Math.sin(d.a) * R0, CLOAK_C[1], CLOAK_C[2] + Math.cos(d.a) * R0);
    base.rotation.y = d.a; // local +Z = the sheet's outer face, +X = across it
    const w = [d.span * R0, d.span * R1, d.span * R2];
    const s0 = joint(base);
    mesh(s0, pointSheet(L0, w[0], w[1], R0, CLOAK_FL, [[0, 0], [1, 0]], { rows: 5, cols: 20 }), M.abRobe);
    const s1 = joint(s0, 0, -L0, 0);
    mesh(s1, pointSheet(L1, w[1], w[2], R1, CLOAK_FL, d.hem, { rows: 7, cols: 36, lap: 0.05 }), M.abRobe);
    streamers.push({ segs: [s0, s1], len: [L0, L1 + hemMax(d.hem) * 0.8], out: CLOAK_FL, lag: 0.45, max: 1.15, floor: true, push: 30, w, arm: 0, wrap: R0 });
  }
  void sheetOffset;
  return { streamers };
}

// ================================================================ weapon: the crystal sword
/**
 * The crystal sword (sword space: origin = the grip's centre, blade along +Z, its flats ±Y): a pale
 * blade with a centre ridge (the two halves either side of it carry ink sub-ids 0 / 1), 0.058 m wide
 * at the guard, a straight taper to a point; a plain cross guard whose arms sweep slightly toward the
 * blade to angular ends; a dark wrapped grip; a small diamond pommel. 0.92 m pommel to point.
 */
function bladeHalf(side, z0, z1, w0, w1, tipLen, th) {
  return gridGeometry(2, 10, (s, t, o) => {
    const z = lerp(z0, z1, t);
    const tip = Math.max(0, (z - (z1 - tipLen)) / tipLen);
    const w = lerp(w0, w1, Math.min(1, t * 1.15)) * (1 - tip);
    // s: 0 the ridge (on ±Y), 0.5 the flat's middle, 1 the edge
    const x = side * w * (s === 0 ? 0 : s === 0.5 ? 0.55 : 1) * 0.5;
    const y = (s === 0 ? th : s === 0.5 ? th * 0.45 : 0);
    o[0] = x;
    o[1] = y;
    o[2] = z;
    o[3] = x;
    o[4] = z;
  }, side < 0);
}

function buildSword({ sword, M, mesh, joint }) {
  const zG = SD.guard, zT = SD.drawnTip;
  const faces = [];
  for (const side of [-1, 1]) {
    for (const flat of [1, -1]) {
      const g = bladeHalf(side, zG, zT, 0.06, 0.05, 0.11, 0.009);
      if (flat < 0) {
        g.scale(1, -1, 1);
        const idx = g.index.array;
        for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
        g.computeVertexNormals();
      }
      faces.push(sub(g, side > 0 ? 1 : 0));
    }
  }
  mesh(sword, mergeGeometries(faces), M.abCrystal);
  // the guard: STRAIGHT and angular (round 2's arms hooked toward the blade): a bar 0.15 m across,
  // tapering to its ends, each end a small point swept a little toward the blade; a diamond at its
  // heart where the blade's ridge starts. 0.18 m span with the tips.
  const guard = [boxGeometry(0.036, 0.024, 0.034, 0, 0, zG)];
  for (const s of [-1, 1]) {
    const arm = gridGeometry(4, 4, (u, v, o) => {
      // u along the arm (0 at the block, 1 at the end), v round its section (a flattened diamond)
      const x = s * lerp(0.016, 0.078, u), th = lerp(0.011, 0.007, u), dp = lerp(0.014, 0.009, u);
      const a = v * Math.PI * 2;
      o[0] = x;
      o[1] = Math.sin(a) * th;
      o[2] = zG + Math.cos(a) * dp + 0.012 * u * u;
      o[3] = x;
      o[4] = a * 0.01;
    }, s > 0);
    guard.push(arm);
    // the tip: a small point, angled 35° toward the blade
    guard.push(kiteGeometry(0.008, 0.008, 0.022).rotateY(s * -0.6).translate(s * 0.086, 0, zG + 0.024));
  }
  guard.push(kiteGeometry(0.014, 0.014, 0.026, { zNeg: 0.6 }).translate(0, 0, zG + 0.02));
  // the pommel: a small diamond past the grip's end (its tip 0.15 m behind the grip's centre)
  guard.push(kiteGeometry(0.02, 0.014, 0.032, { zNeg: 1.2 }).translate(0, 0, -0.112));
  mesh(sword, mergeGeometries(guard), M.abMetal);
  // the grip: a dark wrap
  mesh(sword, limbGeometry({ length: 0.17, r0: 0.016, r1: 0.016, radial: 6, rings: 3 }), M.abPants, 0, 0, -SD.gripBack - 0.008);
  // (the marker the player's hilt glow and glints sit on: the guard's heart; there is no gem)
  return { gem: joint(sword, 0, 0, zG + 0.012) };
}

export const ABYSS_ITEMS = [
  { id: 'abyss.hood', slot: 'head', name: 'Hood', hidesHair: true, blankFace: true, face: 'abSkin', faceScale: 0.88, neck: 'abPants', build: buildHood },
  { id: 'abyss.robe', slot: 'chest', name: 'Robe and Cowl', build: buildRobe },
  { id: 'abyss.arms', slot: 'arms', name: 'Bell Sleeve and Gloves', build: buildArms },
  { id: 'abyss.legs', slot: 'legs', name: 'Boots', build: buildLegs },
  { id: 'abyss.skirt', slot: 'waist', name: "The Robe's Skirt", build: buildSkirt },
  { id: 'abyss.cloak', slot: 'back', name: "The Robe's Back", build: buildCloak },
  { id: 'abyss.sword', slot: 'weapon', name: 'Crystal Sword', dims: SD, build: buildSword },
];

/** The hero's loadout (ids only: gear/index.js imports this file, so it cannot import index.js). */
export const ABYSS_LOADOUT = Object.freeze({
  head: 'abyss.hood',
  chest: 'abyss.robe',
  shoulders: null,
  arms: 'abyss.arms',
  legs: 'abyss.legs',
  waist: 'abyss.skirt',
  back: 'abyss.cloak',
  weapon: 'abyss.sword',
  offhand: 'shield.kite',
});

/** His colours over the materials (model.js tintHero): none. His own materials (HERO_INK `ab*`,
 *  the player's own bank) carry them; the face keeps the body's skin. Kept as the contract
 *  gear/index.js HERO_TINT reads. */
export const ABYSS_TINT = Object.freeze({});
void DF;
