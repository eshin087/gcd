import * as THREE from 'three';
import { ellipsoidGeometry, planarGUV } from '../../../render/glyphGeometry.js';
import {
  gridGeometry, shellGeometry, skirtSheet, tatterStrip, bandGeometry, boxGeometry, arcPlate, mergeGeometries, sub, foldLines,
  ribbonCrease, lerp, limb, place, sheetOffset, sheetEdge, swordFingers, orient,
} from '../heroGeo.js';
import { fistHand } from './handShape.js';

// The Hooded set (the owner's COSTUME REFERENCE / 11, 2026-11-28): a mysterious wuxia swordsman, all
// black cloth, a deep ruffled hood with a short angular peak over a face that is never seen, a heavy cowl
// and an asymmetric drape on the sword shoulder, a black wrap tunic under a silver belt with a green
// inset, a long robe of layered panels, a continuous cloak down his back over the belt with a narrow
// silver line of letters down its middle, silver articulated gauntlets on both hands and silver-plated
// boots. An outfit option behind `?heroLook=hooded` (gear/looks.js): today's look stays the default.
//   head   hooded.hood    the hood (hides the hair, the face and neck in its shadow)
//   chest  hooded.tunic   the wrap tunic, the diagonal strap, the silver belt and its green inset
//   arms   hooded.arms    wide sleeves, silver lamed cuffs, silver gauntlets: the sword hand closed
//                         round the grip (on the `sword` joint), the free hand a fist
//   legs   hooded.legs    dark trousers, black boots plated in silver at the shin, the ankle and the foot
//   waist  hooded.robe    the robe's six panels to mid-calf, the worn pale lower zone, torn points
//   back   hooded.cloak   the cowl, the clasp, the sword-shoulder drape and the long back cloak
//   weapon wanderer.sword the longsword, unchanged (the item is the default one: geometry, materials,
//                         dims, the joint, the hit segment all as today)
// The cloth reuses today's materials (coat / lining / hem: the cloak's worn grey-violet lower zone and
// its letters) and today's springs (anim.js _streamers and _coat): the sheets carry the same lag (0.5)
// and swing limit (1.45 rad) as today's cloak, the panels the coat skirt's fields. The silver is the
// existing `trim` / `bevel` / `armor` / `welt` materials, untouched (the sword's hilt shares them);
// the belt's green inset is the one new material, `jade` (built only for this look, model.js).
//
// Heights in comments are metres in the idle stance.

const ySpOf = (REST) => (h) => h - REST.spine;
const yChOf = (REST) => (h) => h - REST.chest;

/** Push a shell's vertices out / in round the Y axis (through z = cz) by `fn(a, y)` (m): irregular
 *  folds. a = the angle round the axis (0 = his front). Returns g with its normals recomputed. */
function ruffle(g, fn, cz = 0) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i) - cz;
    const r = Math.hypot(x, z) || 1, a = Math.atan2(x, z), d = fn(a, y);
    p.setX(i, x + (x / r) * d);
    p.setZ(i, z + cz + (z / r) * d);
  }
  g.computeVertexNormals();
  return g;
}
/** The fold wave the ruffles and their drawn creases share (−1 … 1). */
const wave = (a, y, k = 0) => 0.55 * Math.sin(a * 7 + y * 17 + 1.3 + k) + 0.3 * Math.sin(a * 13 - y * 29 + 0.4 + k * 1.7) + 0.15 * Math.sin(a * 23 + y * 5 + k * 2.3);

// ---------------------------------------------------------------- head: the hood
/** Hood rings, head space (before BODY.headScale): deep and forward (its rim stands ~6 cm in front of
 *  the face, the brow overhangs the eyes), a narrow opening, closing behind into a SHORT ANGULAR PEAK at
 *  the crown, set back (the reference's hood: not a dome, not a long drooping tip). */
const HOOD = [
  { y: -0.07, rx: 0.2, rz: 0.17, cz: -0.012, gap: 0.08 },
  { y: -0.01, rx: 0.17, rz: 0.158, cz: -0.002, gap: 0.072 },
  { y: 0.06, rx: 0.152, rz: 0.158, cz: 0.006, gap: 0.068 },
  { y: 0.13, rx: 0.148, rz: 0.162, cz: 0.008, gap: 0.064 },
  { y: 0.19, rx: 0.142, rz: 0.162, cz: 0.004, gap: 0.054 },
  { y: 0.24, rx: 0.13, rz: 0.15, cz: -0.008, gap: 0.034 },
  { y: 0.275, rx: 0.106, rz: 0.13, cz: -0.024, gap: 0.01 },
  { y: 0.298, rx: 0.07, rz: 0.098, cz: -0.044, gap: 0.004 },
  { y: 0.314, rx: 0.032, rz: 0.05, cz: -0.068, gap: 0.002 },
  { y: 0.326, rx: 0.004, rz: 0.006, cz: -0.084, gap: 0.001 },
];

function buildHood({ head, M, mesh }) {
  // irregular folds: deepest round the face and the shoulders, shallow over the crown; the crease field
  // draws an ink line down each fold's flank
  const amp = (y) => lerp(0.016, 0.006, Math.min(1, Math.max(0, (y + 0.07) / 0.4)));
  const g = ruffle(shellGeometry(HOOD, { sub: 2, cols: 28 }), (a, y) => amp(y) * wave(a, y) + (Math.cos(a) > 0.6 ? 0.006 * Math.cos(a) : 0));
  // the hem over the cowl: torn, the folds' ends hanging lower
  {
    const p = g.attributes.position;
    for (let i = 0; i <= 28; i++) p.setY(i, p.getY(i) + (i % 3 === 0 ? -0.03 : i % 3 === 1 ? 0.006 : -0.014));
    g.computeVertexNormals();
  }
  foldLines(g, (x, y, z) => 0.5 + 0.62 * wave(Math.atan2(x, z), y) - 1.2 * Math.max(0, (y - 0.28) / 0.05));
  mesh(head, g, M.coat);
  mesh(head, g, M.lining);
  // the rim: a fold of cloth rolled round the face opening (the reference's thick, crumpled edge),
  // the coat's black with its own sub-id so an ink line traces the opening
  const rim = [];
  for (const s of [-1, 1]) {
    for (let k = 0; k < 6; k++) {
      const A = HOOD[k], B = HOOD[k + 1];
      const pt = (R) => {
        const a = Math.asin(Math.min(0.95, R.gap / R.rx));
        return [s * Math.sin(a) * (R.rx + 0.004), R.y, Math.cos(a) * (R.rz + 0.004) + R.cz];
      };
      const p = pt(A), q = pt(B);
      const len = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      const b = ellipsoidGeometry(0.014, len * 0.62, 0.012, { widthSegs: 6, heightSegs: 4 });
      const ax = Math.atan2(q[2] - p[2], q[1] - p[1]), az = -Math.asin((q[0] - p[0]) / len);
      b.rotateX(ax);
      b.rotateZ(az);
      b.translate((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2);
      rim.push(sub(b, (k + (s > 0)) & 1));
    }
  }
  mesh(head, mergeGeometries(rim), M.coat);
  // the void: a dark veil just inside the opening, so the face is never seen, whatever the light
  mesh(head, ellipsoidGeometry(0.075, 0.105, 0.02, { widthSegs: 10, heightSegs: 6 }).translate(0, 0.11, 0.118), M.shirt);
}

// ---------------------------------------------------------------- chest: the wrap tunic and the belt
function buildTunic({ spine, M, BODY, REST, mesh }) {
  const S = M.silver ?? M.trim; // (the look's silver: model.js LOOK_ONLY_MATS)
  const ySp = ySpOf(REST);
  const SHELL = BODY.shell, top = SHELL[SHELL.length - 1];
  const rings = [...SHELL, { y: top.y + 0.02, rx: 0.058, rz: 0.056 }].map((r) => ({ ...r, gap: 0, y: ySp(r.y) }));
  // one closed shell, the wrap's edge a fold line from the left collarbone to the right hip
  const g = foldLines(shellGeometry(rings, { sub: 3, cols: 28 }), (x, y, z) => (z > 0 ? 0.5 + 9 * (x - 0.04 + (y - ySp(1.3)) * 0.5) : 0));
  mesh(spine, g, M.shirt);
  const at = (h) => {
    let k = 0;
    while (k < SHELL.length - 2 && SHELL[k + 1].y < h) k++;
    const A = SHELL[k], B = SHELL[k + 1], u = Math.min(1, Math.max(0, (h - A.y) / (B.y - A.y)));
    return [lerp(A.rx, B.rx, u), lerp(A.rz, B.rz, u), lerp(A.cz ?? 0, B.cz ?? 0, u)];
  };
  // the strap: a black band across the chest from the left shoulder to the right hip, on the shell
  {
    const BS = { h: 1.33, slope: 0.95, w: 0.034, proud: 0.006 };
    const hAt = (a) => {
      let lo = 1.12, hi = 1.49;
      for (let it = 0; it < 22; it++) {
        const m = (lo + hi) * 0.5;
        if (m - (BS.h + BS.slope * Math.sin(a) * at(m)[0]) > 0) hi = m;
        else lo = m;
      }
      return (lo + hi) * 0.5;
    };
    mesh(spine, sub(gridGeometry(22, 1, (s, t, o) => {
      const a = (s - 0.5) * 2.6; // the front half only (the cloak covers the back)
      const h = hAt(a) + (t - 0.5) * BS.w, R = at(h);
      o[0] = Math.sin(a) * (R[0] + BS.proud);
      o[1] = ySp(h);
      o[2] = Math.cos(a) * (R[1] + BS.proud) + R[2];
      o[3] = a * 0.12;
      o[4] = o[1];
    }), 1), M.coat);
  }
  // the silver belt at 1.17 m: a plated band with bevelled edges, the buckle in front with its green inset
  const hB = 1.17, W = at(hB);
  mesh(spine, bandGeometry(W[0] + 0.013, W[1] + 0.013, 0.042, 32), S, 0, ySp(hB), W[2]);
  mesh(spine, mergeGeometries([
    bandGeometry(W[0] + 0.016, W[1] + 0.016, 0.007, 32).translate(0, ySp(hB) + 0.022, W[2]),
    bandGeometry(W[0] + 0.016, W[1] + 0.016, 0.007, 32).translate(0, ySp(hB) - 0.022, W[2]),
  ]), M.bevel);
  const zf = W[1] + W[2] + 0.016;
  mesh(spine, mergeGeometries([
    boxGeometry(0.118, 0.054, 0.014, 0, ySp(hB), zf),
    // the buckle's angled ends (the reference's hexagonal plate)
    place(boxGeometry(0.03, 0.03, 0.012), -0.062, ySp(hB), zf - 0.002, 0, 0, Math.PI / 4),
    place(boxGeometry(0.03, 0.03, 0.012), 0.062, ySp(hB), zf - 0.002, 0, 0, Math.PI / 4),
  ]), S);
  mesh(spine, boxGeometry(0.084, 0.026, 0.006, 0, ySp(hB), zf + 0.009), M.armor); // the inset's dark setting
  mesh(spine, boxGeometry(0.066, 0.014, 0.006, 0, ySp(hB), zf + 0.012), M.jade ?? S); // the green inset
}

// ---------------------------------------------------------------- the gauntlets
/** A tube bent round the Z axis (a finger round a grip): its centre line on the circle of radius `Rc`
 *  from angle f0 to f1 (rad from +X toward +Y) at height z, its section `rr` across (radially) by `rz`
 *  along Z, tapering to `tp` at f1. aGUV: x along the arc, y along Z. */
function arcTube(Rc, rr, rz, f0, f1, z, tp = 1, cols = 6, rows = 6) {
  return gridGeometry(cols, rows, (s, t, o) => {
    const f = lerp(f0, f1, s), k = lerp(1, tp, s), th = t * Math.PI * 2;
    const nx = Math.cos(f), ny = Math.sin(f), r = Rc + Math.cos(th) * rr * k;
    o[0] = nx * r;
    o[1] = ny * r;
    o[2] = z + Math.sin(th) * rz * k;
    o[3] = f * Rc;
    o[4] = o[2];
  }, f1 > f0);
}
/** A cylindrical plate round Z (the back of the hand): radius R, angles f0 … f1, z0 … z1, domed by `bulge`. */
function zPlate(R, f0, f1, z0, z1, bulge = 0.006) {
  return gridGeometry(6, 4, (s, t, o) => {
    const f = lerp(f0, f1, s), z = lerp(z0, z1, t), r = R + bulge * Math.sin(Math.PI * s) * Math.sin(Math.PI * t);
    o[0] = Math.cos(f) * r;
    o[1] = Math.sin(f) * r;
    o[2] = z;
    o[3] = f * R;
    o[4] = z;
  }, f1 < f0);
}
/** Four fingers' z along the grip (index, nearest the guard, last: the gripFist's spacing) and their
 *  section radius. */
const FINGERS = (k) => [0, 1, 2, 3].map((i) => ({ z: (-0.034 + i * 0.0235) * k + 0.006, r: (0.0122 + 0.0006 * i) * k }));
/** The phalanges: angle spans round the grip (rad; 0 = +X, the knuckles), the dark joints between. */
const PHAL = [[0.34, -0.9], [-0.96, -1.98], [-2.04, -2.9]];

/**
 * The silver gauntlet's hand closed round a cylinder along Z (sword space: the grip, radius ~0.017):
 * the back of the hand a domed plate toward the wrist (+X +Y, toward the pommel), four fingers of three
 * silver plates each wrapped round the far side over a dark glove (the flexible joints show between
 * the plates), a knuckle on each, the thumb opposing them over the top toward the guard.
 * Returns { plates, dark, edge } geometry lists (silver / dark / bevel).
 */
function gauntletGrip(k, { Rc = 0.03 * k } = {}) {
  const plates = [], dark = [], edge = [];
  FINGERS(k).forEach((F, i) => {
    // the dark glove under the plates: one tube the whole way round the finger's wrap
    dark.push(arcTube(Rc, F.r * 0.86, F.r * 0.9, 0.4, -3.0, F.z, 0.8, 6, 4));
    PHAL.forEach(([f0, f1], j) => {
      plates.push(sub(arcTube(Rc, F.r * (1 - 0.05 * j), F.r * (0.96 - 0.05 * j), f0, f1, F.z, 0.93, 3, 4), (i + j) & 1));
    });
    // the knuckle: a rounded cap over the first joint
    plates.push(sub(ellipsoidGeometry(F.r * 0.95, F.r * 0.95, F.r * 0.9, { widthSegs: 5, heightSegs: 3 }).translate(Math.cos(0.32) * (Rc + F.r * 0.35), Math.sin(0.32) * (Rc + F.r * 0.35), F.z), (i + 1) & 1));
  });
  // the back of the hand: a domed plate from the knuckles toward the wrist, a bevelled ridge along it
  plates.push(sub(zPlate(Rc + 0.016 * k, 0.2, 1.45, -0.048 * k, 0.056 * k, 0.008 * k), 1));
  dark.push(zPlate(Rc + 0.006 * k, 0.15, 1.6, -0.06 * k, 0.06 * k, 0.004 * k));
  edge.push(zPlate(Rc + 0.026 * k, 0.78, 0.86, -0.04 * k, 0.05 * k, 0.002));
  // the thumb: two plates over the top (+Y), from the heel of the hand toward the guard, its tip on the
  // index finger, a dark joint between them
  {
    const tb = [Math.cos(1.75) * (Rc + 0.004), Math.sin(1.75) * (Rc + 0.004), -0.012 * k];
    const tm = [Math.cos(2.05) * (Rc + 0.002), Math.sin(2.05) * (Rc + 0.002), 0.022 * k];
    const tt = [Math.cos(2.25) * Rc, Math.sin(2.25) * Rc, 0.05 * k];
    const seg = (a, b, r0, r1, kk) => {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const gg = limb({ length: L, r0, r1, radial: 7, rings: 2, capSegs: 2 });
      // limb hangs −Y: turn −Y onto a → b
      const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L, (b[2] - a[2]) / L];
      const rx = Math.atan2(d[2], -d[1]), rz = Math.asin(Math.max(-1, Math.min(1, d[0])));
      gg.rotateX(rx);
      gg.rotateZ(rz);
      gg.translate(a[0], a[1], a[2]);
      return sub(gg, kk);
    };
    plates.push(seg(tb, tm, 0.0125 * k, 0.0115 * k, 1), seg(tm, tt, 0.011 * k, 0.0085 * k, 0));
    dark.push(ellipsoidGeometry(0.01 * k, 0.01 * k, 0.01 * k, { widthSegs: 6, heightSegs: 4 }).translate(...tm));
  }
  return { plates, dark, edge };
}

/**
 * The free hand as a silver fist, on the fist the owner picked for the bare hand (handShape.js fistHand,
 * ADR-204: the back of the hand to the knuckles, the knuckle row of four curled fingers, the rest folded
 * under the palm, the thumb laid OUTSIDE across the curled fingers), each piece a plate: the knuckle row
 * and the folded joints alternate their ink sub-ids so a dark joint line parts every finger and every
 * joint; a dark glove fills the palm; a bevelled ridge runs down the back of the hand. Fore space as
 * fistHand (the wrist at y = −len; the palm toward the body −X; the thumb in front +Z).
 */
function gauntletFist(len, k) {
  const H = fistHand(len, 1, k, 0);
  const y0 = -len;
  const plates = [sub(H.palm, 1), H.fingers, H.thumb];
  // the folded joints (the second and third phalanges) take the other sub-id: a line between them and
  // the knuckle row
  const fold = H.tips, fp = fold.attributes.aPart;
  if (fp) for (let i = 0; i < fp.count; i++) fp.setX(i, 1 - fp.getX(i));
  else sub(fold, 1);
  plates.push(fold);
  // the knuckles: a raised cap on each finger's first joint
  const knuck = [0.034, 0.012, -0.011, -0.032].map((z, i) => sub(ellipsoidGeometry(0.012 * k, 0.011 * k, 0.0105 * k, { widthSegs: 5, heightSegs: 3 }).translate(0.016 * k, y0 - 0.084 * k, z * k), i & 1));
  plates.push(...knuck);
  const dark = [ellipsoidGeometry(0.026 * k, 0.05 * k, 0.046 * k, { widthSegs: 8, heightSegs: 5 }).translate(-0.008 * k, y0 - 0.058 * k, 0.002)];
  const edge = [ellipsoidGeometry(0.004, 0.044 * k, 0.006, { widthSegs: 4, heightSegs: 4 }).translate(0.03 * k, y0 - 0.046 * k, 0.002)];
  return { plates, dark, edge };
}

/** Lames: `n` silver rings from y0 down to y1 (fore space), radii r0 → r1, over a dark sleeve. */
function lames(n, y0, y1, r0, r1) {
  const plates = [];
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 0.82) / n;
    plates.push(sub(limb({ length: (y0 - y1) * (t1 - t0), r0: lerp(r0, r1, t0) + 0.003, r1: lerp(r0, r1, t1), radial: 10, rings: 1, capSegs: 1 }).translate(0, lerp(y0, y1, t0), 0), i & 1));
  }
  return plates;
}

// ---------------------------------------------------------------- arms: sleeves, cuffs, gauntlets
function buildArms({ arms, sword, M, DIM, BODY, mesh }) {
  const S = M.silver ?? M.trim; // (the look's silver: model.js LOOK_ONLY_MATS)
  const [ua0, ua1] = BODY.upperArm, [fa0, fa1] = BODY.foreArm, HK = BODY.hand;
  // the sword hand: the gauntlet closed round the grip, on the sword joint (it closes round the grip in
  // every pose; the grip, the guard and the blade are the weapon item's, untouched)
  {
    const G = gauntletGrip(HK);
    mesh(sword, mergeGeometries(G.plates), S);
    mesh(sword, mergeGeometries(G.dark), M.shirt);
    mesh(sword, mergeGeometries(G.edge), M.bevel);
  }
  let free = null;
  for (const side of [-1, 1]) {
    const R = side < 0;
    const { upper, fore } = arms[R ? 'R' : 'L'];
    // the wide upper sleeve: a billow over the arm, the deltoid, a soft ball at the elbow
    mesh(upper, mergeGeometries([
      sub(foldLines(limb({ length: DIM.upperArm, r0: ua0 + 0.008, r1: ua1 + 0.012, bulge: 0.016, radial: 14 }), (x, y, z) => 0.5 + 0.6 * Math.sin(Math.atan2(x, z) * 5 + y * 14)), 1),
      sub(ellipsoidGeometry(BODY.deltoid[0] + 0.006, BODY.deltoid[1] + 0.004, BODY.deltoid[2] + 0.006, { widthSegs: 12, heightSegs: 8 }).translate(side * 0.008, -0.02, 0), 1),
      sub(ellipsoidGeometry(ua1 + 0.014, ua1 + 0.01, ua1 + 0.016, { widthSegs: 10, heightSegs: 6 }).translate(0, -DIM.upperArm, -0.004), 1),
    ]), M.coat);
    // the forearm: the sleeve's bell to half way, then the gauntlet's cuff: four silver lames over a dark
    // glove to the wrist
    const yW = -DIM.foreArm + 0.035;
    mesh(fore, sub(foldLines(limb({ length: 0.13, r0: ua1 + 0.01, r1: fa0 + 0.018, radial: 14 }), (x, y, z) => 0.5 + 0.6 * Math.sin(Math.atan2(x, z) * 5 + y * 20)), 1), M.coat);
    mesh(fore, limb({ length: -yW - 0.1, r0: fa0 - 0.004, r1: fa1 - 0.006, radial: 10, rings: 2, capSegs: 1 }).translate(0, -0.1, 0), M.shirt);
    mesh(fore, mergeGeometries(lames(4, -0.112, yW + 0.012, fa0 + 0.004, fa1 + 0.006)), S);
    mesh(fore, mergeGeometries([
      bandGeometry(fa0 + 0.012, fa0 + 0.012, 0.006, 14).translate(0, -0.112, 0),
      bandGeometry(fa1 + 0.01, fa1 + 0.01, 0.006, 14).translate(0, yW + 0.014, 0),
    ]), M.bevel);
    if (R) {
      // the sword hand's dark wrist, reaching the gauntlet on the grip
      mesh(fore, limb({ length: 0.04, r0: fa1 - 0.004, r1: fa1 - 0.008, radial: 8, rings: 2, capSegs: 1 }).translate(0, yW + 0.012, 0), M.shirt);
    } else {
      free = buildFreeGauntlet({ arms, sword, M, DIM, BODY, mesh }, yW);
    }
  }
  return free;
}

/** The free hand (gear/README.md `offHand`): `open` = the silver fist (at rest, swinging, in the one-handed
 *  poses), `grip` = the same gauntlet closed round the grip below the sword hand (two-handed), `fingers`
 *  = the sword fingers in silver (a pointing pose). */
function buildFreeGauntlet({ arms, sword, M, DIM, BODY, mesh }, yW) {
  const S = M.silver ?? M.trim; // (the look's silver: model.js LOOK_ONLY_MATS)
  const fore = arms.L.fore, wj = arms.L.wrist ?? fore, wp = arms.L.wrist?.position;
  const HK = BODY.hand;
  // the dark wrist on the forearm
  mesh(fore, limb({ length: 0.04, r0: BODY.foreArm[1] - 0.004, r1: BODY.foreArm[1] - 0.008, radial: 8, rings: 2, capSegs: 1 }).translate(0, yW + 0.012, 0), M.shirt);
  // the fist: one mesh per material on the wrist joint (toggled together: a parent joint)
  const F = gauntletFist(DIM.foreArm - 0.03, 1.08);
  // (built in fore space: shifted into the wrist's, which hangs on the forearm unturned at build time)
  const shift = (g) => (wp ? g.translate(-wp.x, -wp.y, -wp.z) : g);
  const open = mesh(wj, shift(mergeGeometries(F.plates)), S);
  const openD = mesh(open, shift(mergeGeometries(F.dark)), M.shirt), openE = mesh(open, shift(mergeGeometries(F.edge)), M.bevel);
  // the sword fingers, in silver
  const SF = swordFingers(1, HK, BODY.fingerEx ?? 1.3);
  const fg = mergeGeometries([SF.palm, SF.fingers, SF.curled, SF.thumb]);
  if (!wp) fg.translate(0, -(DIM.foreArm - 0.03), 0);
  const fingers = mesh(wj, fg, S);
  fingers.visible = false;
  // … and closed round the grip below the sword hand
  const G = gauntletGrip(HK);
  const grip = mesh(sword, mergeGeometries(G.plates).translate(0, 0, -DIM.offGrip), S);
  const gripD = mesh(grip, mergeGeometries(G.dark).translate(0, 0, -DIM.offGrip), M.shirt), gripE = mesh(grip, mergeGeometries(G.edge).translate(0, 0, -DIM.offGrip), M.bevel);
  grip.visible = false;
  return { offHand: { open, grip, fingers }, keep: [open, grip, fingers, openD, openE, gripD, gripE] };
}

// ---------------------------------------------------------------- legs: trousers and plated boots
function buildLegs({ pelvis, legs, M, DIM, BODY, mesh }) {
  const S = M.silver ?? M.trim; // (the look's silver: model.js LOOK_ONLY_MATS)
  {
    const [hx, hy, hz] = BODY.hips.r;
    mesh(pelvis, orient.up(ellipsoidGeometry(hx, hz, hy)), M.pants, ...BODY.hips.c);
  }
  const [th0, th1, thB] = BODY.thigh, [sh0, sh1, shB] = BODY.shin;
  for (const side of [-1, 1]) {
    const { thigh, shin, foot } = legs[side < 0 ? 'R' : 'L'];
    mesh(thigh, limb({ length: DIM.thigh, r0: th0, r1: th1, bulge: thB }), M.pants);
    // the boot's black shaft to under the knee
    mesh(shin, limb({ length: DIM.shin - 0.02, r0: sh0 + 0.004, r1: sh1 + 0.004, bulge: shB }), M.pants, 0, -0.02, 0);
    const b = sh0 - 0.058;
    // the silver: an angular plate over the top of the shin (pointed up at the knee), a band under it,
    // a plate wrapping the ankle, the plated foot
    {
      const T = [0, -0.035, 0.07 + b], Rt = [0.06 + b, -0.1, 0.06 + b], B = [0, -0.17, 0.066 + b], Lf = [-0.06 - b, -0.1, 0.06 + b], C = [0, -0.1, 0.082 + b];
      const kg = kiteFromPoints(T, Rt, B, Lf, C);
      mesh(shin, mergeGeometries([
        kg,
        sub(arcPlate(-0.15, -0.19, sh0 + 0.012, sh0 + 0.009, 0, 2.2, 10), 1),
        arcPlate(-0.3, -0.4, sh1 + 0.016, sh1 + 0.02, 0, Math.PI, 14),
      ]), S);
      mesh(shin, mergeGeometries([
        arcPlate(-0.144, -0.152, sh0 + 0.015, sh0 + 0.015, 0, 2.2, 10),
        arcPlate(-0.296, -0.304, sh1 + 0.019, sh1 + 0.019, 0, Math.PI, 14),
      ]), M.bevel);
    }
    const F = BODY.foot;
    mesh(foot, mergeGeometries([
      ellipsoidGeometry(F.r[0] + 0.004, F.r[1] + 0.002, F.r[2] + 0.004, { widthSegs: 10, heightSegs: 6 }).translate(...F.c),
      sub(place(ellipsoidGeometry(0.047, 0.024, 0.042, { widthSegs: 8, heightSegs: 4 }), 0, F.c[1] + F.r[1] - 0.015, 0.064, -0.35), 1),
      place(ellipsoidGeometry(0.043, 0.021, 0.038, { widthSegs: 8, heightSegs: 4 }), 0, F.c[1] + F.r[1] - 0.03, 0.112, -0.25),
    ]), S);
    mesh(foot, sub(boxGeometry(0.064, 0.034, 0.054, 0, -0.053, -0.062), 1), M.armor); // the heel
    mesh(foot, ellipsoidGeometry(F.r[0] + 0.009, 0.007, F.r[2] + 0.009, { widthSegs: 14, heightSegs: 3 }), M.welt, 0, -0.062, F.c[2]);
  }
}
/** A faceted kite plate from its top, right, bottom, left points and its raised centre (wanderer.js'
 *  greave). */
function kiteFromPoints(T, Rt, B, Lf, C) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...T, ...C, ...Rt, ...T, ...Lf, ...C, ...C, ...Lf, ...B, ...C, ...B, ...Rt]), 3));
  g.computeVertexNormals();
  planarGUV(g, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
  return g;
}

// ---------------------------------------------------------------- waist: the robe
/** The robe's panels (the coat skirt's fields, wanderer.js COAT_PANELS): two front panels that cross a
 *  little over the legs, a side panel each side, two back panels under the cloak; to mid-calf (the hems
 *  ~0.35 m), the lower 60 % of the lower sheet in the worn pale zone (`pale`), torn points. */
export const ROBE_PANELS = [
  { az: 0.62, w: [0.15, 0.2, 0.25], len: [0.36, 0.36], strips: [0.1, 0.07], fork: [0, 1], out: 0.006, flare: 0.14, skew: 1, slant: 0.05, pale: 0.4 },
  { az: -0.62, w: [0.15, 0.2, 0.25], len: [0.36, 0.36], strips: [0.07, 0.1], fork: [1, 0], out: 0.006, flare: 0.14, skew: -1, slant: 0.05, pale: 0.4 },
  { az: 1.55, w: [0.15, 0.2, 0.27], len: [0.36, 0.36], strips: [0.09, 0.12], fork: [0, 0], out: 0, flare: 0.45, pale: 0.38 },
  { az: -1.55, w: [0.15, 0.2, 0.27], len: [0.36, 0.36], strips: [0.12, 0.09], fork: [0, 0], out: 0, flare: 0.45, pale: 0.38 },
  { az: 2.5, w: [0.16, 0.22, 0.3], len: [0.36, 0.36], strips: [0.1, 0.08], fork: [1, 0], out: 0.008, flare: 0.3, skew: -1.2, slant: 0.05, pale: 0.4 },
  { az: -2.5, w: [0.16, 0.22, 0.3], len: [0.36, 0.36], strips: [0.08, 0.1], fork: [0, 1], out: 0.008, flare: 0.3, skew: 1.2, slant: 0.05, pale: 0.4 },
];

function buildRobe({ pelvis, M, DIM, mesh, joint }) {
  const coat = [];
  ROBE_PANELS.forEach((P, i) => {
    const sa = Math.sin(P.az), ca = Math.cos(P.az);
    const R0 = 1 / Math.hypot(sa / DIM.coatR, ca / (DIM.coatR * 0.69)) + P.out * 0.5;
    const anchor = joint(pelvis, sa * R0, DIM.coatY, ca * R0);
    anchor.rotation.y = P.az;
    const s0 = joint(anchor);
    const sk = P.skew ?? 0, w0 = P.w[0], sl = P.slant ?? 0, L0 = P.len[0], L1 = P.len[1];
    const nF = Math.max(1, Math.round(P.w[2] / 0.09)) + 0.5, fph = i * 2.3 + 0.9;
    const wAt = (d) => (d < L0 ? lerp(P.w[0], P.w[1], d / L0) : lerp(P.w[1], P.w[2], Math.min(1, (d - L0) / L1)));
    const pleat = (d0) => (x, y, z, u, gy) => {
      const d = d0 - gy, w = wAt(d);
      const s = (u - sheetOffset(w, w0, sk)) / w + 0.5;
      const ph = Math.PI * 2 * nF * (s + 0.05 * Math.sin(d * 9 + i * 1.9)) + fph + Math.PI;
      return 0.5 + 0.62 * (Math.sin(ph) + 0.3 * Math.sin(ph * 2.3 + 1.7)) - 0.9 * Math.max(0, 1 - d / 0.14);
    };
    const g0 = foldLines(skirtSheet(L0, P.w[0], P.w[1], R0, 0.25, 0, 61 + i, [0.004, 0.016, nF, fph], 0, 1, sk, w0), pleat(0));
    mesh(s0, g0, M.coat);
    mesh(s0, g0, M.lining);
    const s1 = joint(s0, 0, -L0, 0);
    const R1 = R0 + 0.25 * L0, fold = [0.016, 0.032, nF, fph], pl = 1 - P.pale;
    const lower = (t0, t1) => foldLines(skirtSheet(L1, P.w[1], P.w[2], R1, 0.25, 0.026, 71 + i, fold, t0, t1, sk, w0, sl), pleat(L0));
    const g1 = lower(0, pl);
    mesh(s1, g1, M.coat);
    mesh(s1, g1, M.lining);
    const g2 = lower(pl, 1);
    mesh(s1, g2, M.hem);
    mesh(s1, g2, M.lining);
    // the wrap's front edges: a thin fold of the coat's black down the crossing edge
    if (sk && Math.abs(P.az) < 1) {
      mesh(s0, sub(sheetEdge(L0, P.w[0], P.w[1], R0, sk > 0 ? -1 : 1, 1, 0.25, sk, w0), 1), M.coat);
    }
    const strips = [];
    const n = P.strips.length, R2 = R1 + 0.25 * L1, wr = P.w[2] / Math.max(1, n);
    for (let k = 0; k < n; k++) {
      const sk01 = (k + 0.5) / n;
      const u = (sk01 - 0.5) * P.w[2] + sheetOffset(P.w[2], w0, sk);
      const a = u / R2;
      const sj = joint(s1, Math.sin(a) * R2, -L1 - sl * (sk < 0 ? 1 - sk01 : sk01), (Math.cos(a) - 1) * R2);
      sj.rotation.y = a;
      const sw = Math.max(0.06, wr * 1.2);
      mesh(sj, foldLines(tatterStrip(P.strips[k], sw, { fork: !!P.fork[k], curl: 0.22, seed: 1700 + i * 31 + k * 7 }), ribbonCrease(sw, i * 3.1 + k * 1.7)), M.hem);
      strips.push({ joint: sj, len: P.strips[k], rest: a, phase: (i * 1.7 + k * 2.3) % (Math.PI * 2) });
    }
    coat.push({ anchor, segs: [s0, s1], def: P, strips, len: [L0, L1 + sl + (n ? Math.max(...P.strips) * 0.8 : 0)], r0: R0 });
  });
  return { coat };
}

// ---------------------------------------------------------------- back: the cowl, the drape, the cloak
/** Today's cloak's springs (shroud.js SHROUD_LAG / SHROUD_MAX): the long cloak hangs and swings as
 *  today's does, only longer and wider. */
const CLOAK_LAG = 0.5, CLOAK_MAX = 1.45;
/**
 * The sheets (shroud.js SHROUD_SHEETS' fields, + `pale`: 0 … 1 down the lower sheet where the worn pale
 * zone begins (1 = none), `glyph`: the silver line of letters down its middle). Three adjoining sheets
 * down his back from the shoulder blades to the calves (one cloak from behind: they overlap, so the belt
 * never shows between them), and the heavy drape over the sword shoulder (on the upper arm, so a raised
 * arm lifts it instead of cutting it).
 */
export const HOODED_SHEETS = [
  { on: 'chest', at: [0, 0.205, -0.165], ry: Math.PI, w: [0.22, 0.27, 0.32], len: [0.45, 0.41], out: 0.2, wrap: 0.28, strips: [0.23, 0.15, 0.25, 0.17], fork: [0, 1, 0, 0], pale: 0.46, glyph: true, inMax: [-0.06, 0.12], seed: 5 },
  { on: 'chest', at: [0.115, 0.2, -0.13], ry: Math.PI - 0.5, w: [0.15, 0.2, 0.25], len: [0.44, 0.4], out: 0.22, wrap: 0.24, strips: [0.23, 0.15, 0.2], fork: [1, 0, 0], pale: 0.44, inMax: [-0.06, 0.12], seed: 19 },
  { on: 'chest', at: [-0.115, 0.2, -0.13], ry: Math.PI + 0.5, w: [0.15, 0.2, 0.25], len: [0.44, 0.4], out: 0.22, wrap: 0.24, strips: [0.2, 0.15, 0.23], fork: [0, 1, 0], pale: 0.44, inMax: [-0.06, 0.12], seed: 31 },
  { on: 'armR', at: [-0.055, -0.005, -0.005], ry: -1.75, w: [0.16, 0.2, 0.23], len: [0.18, 0.14], out: 0.26, wrap: 0.15, strips: [0.08, 0.11, 0.07], fork: [0, 1, 0], pale: 1, lag: 0.25, inMax: [-0.12, 0.1], seed: 83 },
];

function buildCloak({ chest, arms, M, REST, mesh, joint }) {
  const S = M.silver ?? M.trim; // (the look's silver: model.js LOOK_ONLY_MATS)
  const yCh = yChOf(REST);
  // the cowl: heavy folds of cloth round the neck and over both shoulders, closed at the throat (the
  // neck is never seen), its lower edge torn; deeper behind, so the shoulders have body in profile
  {
    const rings = [
      { y: yCh(1.37), rx: 0.272, rz: 0.205, cz: -0.028, gap: 0.006 },
      { y: yCh(1.415), rx: 0.258, rz: 0.19, cz: -0.022, gap: 0.006 },
      { y: yCh(1.465), rx: 0.208, rz: 0.158, cz: -0.012, gap: 0.006 },
      { y: yCh(1.505), rx: 0.15, rz: 0.13, cz: 0.0, gap: 0.006 },
      { y: yCh(1.545), rx: 0.112, rz: 0.104, cz: 0.004, gap: 0.006 },
      { y: yCh(1.575), rx: 0.096, rz: 0.09, cz: 0.002, gap: 0.006 },
    ];
    const g = ruffle(sub(shellGeometry(rings, { sub: 2, cols: 30 }), 1), (a, y) => 0.011 * wave(a, y * 1.6, 2.1) + 0.006);
    const p = g.attributes.position;
    for (let i = 0; i <= 30; i++) p.setY(i, p.getY(i) + (i % 3 === 0 ? -0.034 : i % 3 === 1 ? 0.012 : -0.01));
    g.computeVertexNormals();
    foldLines(g, (x, y, z) => 0.5 + 0.62 * wave(Math.atan2(x, z), y * 1.6, 2.1));
    mesh(chest, g, M.coat);
    mesh(chest, g, M.lining);
    // the clasp on the left collarbone: a silver square on a dark plate, set on the diagonal
    mesh(chest, place(boxGeometry(0.05, 0.05, 0.008), 0.1, yCh(1.47), 0.142, -0.2, 0.55, Math.PI / 4), M.armor);
    mesh(chest, place(boxGeometry(0.036, 0.036, 0.01), 0.1, yCh(1.47), 0.146, -0.2, 0.55, Math.PI / 4), S);
  }
  const streamers = [];
  HOODED_SHEETS.forEach((d, i) => {
    const parent = d.on === 'armL' ? arms.L.upper : d.on === 'armR' ? arms.R.upper : chest;
    const base = joint(parent, ...d.at);
    base.rotation.y = d.ry; // local +Z = the sheet's outer face, +X = across it
    const [w0, w1, w2] = d.w, [L0, L1] = d.len;
    const nF = Math.max(1, Math.round(w2 / 0.1)) + 0.5;
    // (the glyph sheet's folds are still at its centre line, so the silver line lies on the cloth)
    const ph = d.glyph ? -Math.PI * nF : i * 1.9 + 0.4;
    const wAt = (dd) => (dd < L0 ? lerp(w0, w1, dd / L0) : lerp(w1, w2, Math.min(1, (dd - L0) / L1)));
    const pleat = (d0) => (x, y, z, u, gy) => {
      const dd = d0 - gy, w = wAt(dd);
      const f = Math.PI * 2 * nF * (u / w + 0.5 + 0.05 * Math.sin(dd * 8 + i * 1.7)) + ph + Math.PI;
      return 0.5 + 0.62 * (Math.sin(f) + 0.3 * Math.sin(f * 2.3 + 1.7)) - 0.9 * Math.max(0, 1 - dd / 0.14);
    };
    const s0 = joint(base);
    const g0 = foldLines(skirtSheet(L0, w0, w1, d.wrap, 0.25, 0, d.seed, [0.004, 0.018, nF, ph]), pleat(0));
    mesh(s0, g0, M.coat);
    mesh(s0, g0, M.lining);
    const s1 = joint(s0, 0, -L0, 0);
    const R1 = d.wrap + 0.25 * L0, fold = [0.018, 0.04, nF, ph], pl = Math.min(1, d.pale ?? 1);
    // the lower sheet: black to `pale`, then today's worn pale zone (the hem material) to a jagged hem
    const g1 = foldLines(skirtSheet(L1, w1, w2, R1, 0.25, 0.05, d.seed + 7, fold, 0, pl, 0), pleat(L0));
    mesh(s1, g1, M.coat);
    mesh(s1, g1, M.lining);
    if (pl < 1) {
      const g2 = foldLines(skirtSheet(L1, w1, w2, R1, 0.25, 0.05, d.seed + 7, fold, pl, 1), pleat(L0));
      mesh(s1, g2, M.hem);
      mesh(s1, g2, M.lining);
    }
    // the silver line of letters down the middle of the back: a narrow strip on the cloth's centre line,
    // from the shoulder blades to the worn zone
    if (d.glyph) {
      const gw = 0.024;
      mesh(s0, skirtSheet(L0 - 0.06, gw, gw, d.wrap, 0.25, 0, 1, [0, 0, 0, 0]).translate(0, -0.06, 0.005), S);
      mesh(s1, skirtSheet(L1, gw, gw, R1, 0.25, 0, 1, [0, 0, 0, 0], 0, Math.max(0.1, pl - 0.08)).translate(0, 0, 0.005), S);
    }
    // torn points along the hem (rigid on the lower segment), in the pale zone's colour (or the black)
    const n = d.strips.length, R2 = R1 + 0.25 * L1, wr = w2 / Math.max(1, n);
    for (let k = 0; k < n; k++) {
      const u = ((k + 0.5) / n - 0.5) * w2, a = u / R2;
      const sw = Math.max(0.06, wr * 1.2);
      const m = mesh(s1, foldLines(tatterStrip(d.strips[k], sw, { fork: !!d.fork[k], curl: 0.2, seed: 900 + d.seed * 13 + k * 7 }), ribbonCrease(sw, i * 2.7 + k * 1.3)), pl < 1 ? M.hem : M.coat, Math.sin(a) * R2, -L1 + 0.012, (Math.cos(a) - 1) * R2);
      m.rotation.y = a;
    }
    // (the long sheets' local clearance, gear/README.md: `inMax` keeps each segment from swinging in
    // through his back and hips (a backward step, a combo's twist), `floor` keeps the long back sheets'
    // ends over the grass in a roll or a fall; the springs, the lag and the swing limit are today's)
    streamers.push({ segs: [s0, s1], len: d.len, out: d.out, lag: d.lag ?? CLOAK_LAG, max: CLOAK_MAX, w: d.w, arm: d.on === 'armR' ? 1 : d.on === 'armL' ? 2 : 0, wrap: d.wrap, inMax: d.inMax, floor: d.on === 'chest' });
  });
  return { streamers };
}

/** The set. The hood hides all the hair (`hidesHair`) and puts the face and neck in its shadow. */
export const HOODED_ITEMS = [
  { id: 'hooded.hood', slot: 'head', name: 'Deep Hood', hidesHair: true, shadowsFace: true, build: buildHood },
  { id: 'hooded.tunic', slot: 'chest', name: 'Wrap Tunic and Silver Belt', mats: ['jade', 'silver'], build: buildTunic },
  { id: 'hooded.arms', slot: 'arms', name: 'Silver Gauntlets', mats: ['silver'], build: buildArms },
  { id: 'hooded.legs', slot: 'legs', name: 'Plated Boots', mats: ['silver'], build: buildLegs },
  { id: 'hooded.robe', slot: 'waist', name: 'Layered Robe', build: buildRobe },
  { id: 'hooded.cloak', slot: 'back', name: 'Long Cloak and Cowl', mats: ['silver'], build: buildCloak },
];

/** The look: the set over today's sword (the weapon item is the default's, untouched). */
export const HOODED_LOADOUT = Object.freeze({
  head: 'hooded.hood',
  chest: 'hooded.tunic',
  shoulders: null,
  arms: 'hooded.arms',
  legs: 'hooded.legs',
  waist: 'hooded.robe',
  back: 'hooded.cloak',
  weapon: 'wanderer.sword',
});
