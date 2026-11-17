import { ellipsoidGeometry, limbGeometry } from '../../../render/glyphGeometry.js';
import {
  gridGeometry, shellGeometry, skirtSheet, tatterStrip, bandGeometry, boxGeometry, kiteGeometry, mergeGeometries, sub, foldLines, lerp, limb,
  gripFist, sheetOffset, sheetEdge, clumpGeometry, orientTo, orient, starGeometry, ring, bladeGeometry,
} from '../heroGeo.js';
import { DIM } from '../heroDims.js';
import { buildFreeHand } from './hands.js';

// (PLACEHOLDER: PR #65's rejected look A, kept only so the default set builds; it is replaced
// wholesale by the new look. The item ids, ABYSS_LOADOUT, ABYSS_TINT and ABYSS_SWORD_DIMS are the
// contract the rest of the game reads.)

/** The hero's sword's own numbers (sword space: origin = grip centre, blade along +Z): DIM's hilt
 *  and hit segment, a shorter one-handed blade (about 1.09 m from the pommel to the point). The
 *  animator's ground clamp and blade clearance, the FX and the drawn contact read these through
 *  `rig.weaponDims` (model.js); the hit segment (bladeBase … bladeTip) is the gameplay reach and
 *  stays DIM's. `steelTip` is a little past the drawn point, so the drawn steel never touches the
 *  grass. */
export const ABYSS_SWORD_DIMS = Object.freeze({
  gripBack: DIM.gripBack, guard: DIM.guard, gem: DIM.gem, forte: DIM.forte,
  steelTip: 1.0, drawnTip: 0.9, bladeBase: DIM.bladeBase, bladeTip: DIM.bladeTip,
});
const SWORD_DIMS = ABYSS_SWORD_DIMS;

// LOOK "A · Abyss" (the owner's concept sheet 1, 2026-11-16, "GCD Abyss, main character concept";
// the hero's only outfit, gear/index.js DEFAULT_LOADOUT): a black figure drawn in white outlines.
//   head     abyss.hood    a deep POINTED hood with a white rim and a white seam up to its peak; a
//                          LIT blank face (no eyes: `blankFace`) under a short silver fringe
//   chest    abyss.robe    a closed black robe, a white-edged front panel, a thin belt, and the
//                          layered cowl over the shoulders
//   arms     abyss.arms    cloth sleeves (a wide bell cuff on the sword arm, a slim sleeve on the
//                          shield arm), black gloves
//   legs     abyss.legs    black trousers, tall black boots with a white band and a pale welt
//   waist    abyss.skirt   ABYSS_PANELS: the robe's skirt to the shins, and the front panel
//   back     abyss.cloak   ABYSS_SHEETS: a long cloak with a tattered hem (none on the shield arm)
//   weapon   abyss.sword   a pale crystal sword: a long narrow blade on a plain cross guard
//   offhand  shield.kite   (gear/shield.js)
//
// How the white outline is made (there is no free ink-line part id, and a look may not write the
// shared part ink): the art pass already draws `armor` and `spike` with a solid white silhouette
// and white inner lines, so the black cloth that carries the outline (hood, cowl, cloak, sleeves,
// boots, the front panel) is built from those two and tinted black with no glint (ABYSS_TINT).
// A line is drawn wherever two different parts meet, so armor (hood, cloak, sleeves, boots) and
// spike (cowl, front panel, bell cuff) alternate. `bevel` is the bright white: the silver hair and
// the thin edge lines. `coat` / `pants` stay plain dark cloth underneath.
//
// The builders below (hood rim, locks, cloak sheets, robe panels, plain legs) take their materials
// as arguments.
// Heights in comments are metres in the idle stance.

// ================================================================ shared builders
const at = (rings, f) => {
  const k = Math.min(rings.length - 2, Math.max(0, Math.floor(f))), u = f - k, A = rings[k], B = rings[k + 1];
  return { y: lerp(A.y, B.y, u), rx: lerp(A.rx, B.rx, u), rz: lerp(A.rz, B.rz, u), cz: lerp(A.cz ?? 0, B.cz ?? 0, u), gap: lerp(A.gap ?? 0, B.gap ?? 0, u) };
};

/** A band along both edges of a hood's face opening (shellGeometry rings `k0`..`k1`): `w` wide on
 *  the hood's surface from the edge back, `off` proud of it. The white rim of the opening. */
export function hoodRim(rings, k0, k1, w = 0.014, off = 0.004, steps = 3) {
  const out = [];
  for (const s of [1, -1]) {
    out.push(gridGeometry(1, Math.max(1, Math.round((k1 - k0) * steps)), (u, t, o) => {
      const R = at(rings, lerp(k0, k1, t));
      const a = Math.asin(Math.min(0.95, Math.max(0.004, R.gap) / R.rx)) + (u - 0.12) * (w / R.rx);
      o[0] = s * Math.sin(a) * (R.rx + off);
      o[1] = R.y;
      o[2] = Math.cos(a) * (R.rz + off) + R.cz;
      o[3] = o[0];
      o[4] = o[1];
    }, s < 0));
  }
  return mergeGeometries(out);
}

/** A strip up the hood's front seam (rings `k0`..`k1`, where the opening is closed): the white
 *  line from the opening's point to the peak. */
export function hoodSeam(rings, k0, k1, w = 0.012, off = 0.004, steps = 3) {
  return gridGeometry(1, Math.max(1, Math.round((k1 - k0) * steps)), (u, t, o) => {
    const R = at(rings, lerp(k0, k1, t));
    const x = (u - 0.5) * Math.min(w, R.rx * 1.2);
    o[0] = x;
    o[1] = R.y;
    o[2] = Math.sqrt(Math.max(0, 1 - (x / (R.rx + off)) ** 2)) * (R.rz + off) + R.cz;
    o[3] = x;
    o[4] = R.y;
  });
}

/** Locks of hair on the head joint (shroud.js buildHoodHair's format: each lock is [x, y, z of its
 *  root, direction x, y, z, length, half-width, curl]; `sides` are mirrored) in ANY materials: the
 *  root third in `mass`, the rest in `tips`. Neighbours alternate the ink sub-id (strands). */
export function buildLocks(head, mesh, H, mass, tips = mass) {
  const a = [], b = [];
  let k = 0;
  const lock = ([x, y, z, dx, dy, dz, L, w, curl], s) => {
    for (const [t0, t1, out] of [[0, 0.4, a], [0.4, 1, b]]) {
      out.push(sub(orientTo(clumpGeometry(L, w, w * 0.5, { t0, t1, curl, taper: 0.7, cols: 6, rows: 2 }), [s * x, y, z], [s * dx, dy, dz], [s * 0.3, 0.2, 1]), k & 1));
    }
    k++;
  };
  for (const l of H.fringe ?? []) lock(l, 1);
  for (const s of [-1, 1]) for (const l of H.sides ?? []) lock(l, s);
  if (mass === tips) mesh(head, mergeGeometries([...a, ...b]), mass);
  else {
    mesh(head, mergeGeometries(a), mass);
    mesh(head, mergeGeometries(b), tips);
  }
}

/**
 * A cloak: `SHEETS` on the streamer springs (anim.js _streamers), like shroud.js's, in any
 * materials. A sheet: `on` 'chest' | 'armR', `at`, `ry` (π = straight back), `w` [root, seam, hem],
 * `len` [upper, lower], `out`, `wrap`, `strips` (the torn points' lengths) and `fork`, `seed`,
 * `lag`. `mats`: face (the cloth), back (its inner face: a BackSide material, or null when `face`
 * is double-sided), hem (the torn points; default the face). `folds` draws fold lines down it.
 * Returns the streamers.
 */
export function hangCloak({ chest, arms, mesh, joint }, SHEETS, { face, back = null, hem = face, folds = false, lag = 0.5, max = 1.45 }) {
  const streamers = [];
  SHEETS.forEach((d, i) => {
    const parent = d.on === 'armR' ? arms.R.upper : chest;
    const base = joint(parent, ...d.at);
    base.rotation.y = d.ry; // local +Z = the sheet's outer face, +X = across it
    const [w0, w1, w2] = d.w, [L0, L1] = d.len;
    const nF = Math.max(1, Math.round(w2 / 0.2)) + 0.5, ph = i * 1.9 + 0.4;
    const wAt = (dd) => (dd < L0 ? lerp(w0, w1, dd / L0) : lerp(w1, w2, Math.min(1, (dd - L0) / L1)));
    const pleat = (d0) => (x, y, z, u, gy) => {
      const dd = d0 - gy, w = wAt(dd);
      const f = Math.PI * 2 * nF * (u / w + 0.5 + 0.05 * Math.sin(dd * 8 + i * 1.7)) + ph + Math.PI;
      return 0.5 + 0.62 * Math.sin(f) - 0.9 * Math.max(0, 1 - dd / 0.2);
    };
    // (without drawn folds the sheets share one ink sub-id: a line only where one hangs over another)
    const mark = (g, d0) => (folds ? foldLines(g, pleat(d0)) : g);
    const put = (j, g) => {
      mesh(j, g, face);
      if (back) mesh(j, g, back);
    };
    const s0 = joint(base);
    put(s0, mark(skirtSheet(L0, w0, w1, d.wrap, 0.25, 0, d.seed, [0.002, 0.007, nF, ph]), 0));
    const s1 = joint(s0, 0, -L0, 0);
    const R1 = d.wrap + 0.25 * L0;
    put(s1, mark(skirtSheet(L1, w1, w2, R1, 0.25, d.jag ?? 0.04, d.seed + 7, [0.007, 0.016, nF, ph]), L0));
    // torn points along the hem (rigid on the lower segment)
    const n = d.strips.length, R2 = R1 + 0.25 * L1, wr = w2 / Math.max(1, n);
    for (let k = 0; k < n; k++) {
      const u = ((k + 0.5) / n - 0.5) * w2 + sheetOffset(w2, w0, 0), a = u / R2;
      const sw = Math.max(0.06, wr * 1.2);
      const m = mesh(s1, tatterStrip(d.strips[k], sw, { fork: !!d.fork?.[k], curl: 0.2, seed: 500 + d.seed * 13 + k * 7 }), hem, Math.sin(a) * R2, -L1 + 0.012, (Math.cos(a) - 1) * R2);
      m.rotation.y = a;
    }
    streamers.push({ segs: [s0, s1], len: d.len, out: d.out, lag: d.lag ?? lag, max, w: d.w, arm: d.on === 'armR' ? 1 : 0, wrap: d.wrap });
  });
  return streamers;
}

/**
 * A skirt of coat panels on the pelvis (sheet.js panelSkirt, with each panel's materials its own):
 * a panel def is COAT_PANELS' (az, w, len, strips, fork, out, flare, skew, slant, breeze,
 * idleFlare) plus `mat` (the M name of its cloth; default 'coat'), `back` (its inner face's:
 * default 'lining'; null for a double-sided cloth) and `border` (the M name of a thin edge line
 * down BOTH its edges; default none). Returns { coat } (anim.js _coat).
 */
export function robeSkirt({ pelvis, M, DIM, mesh, joint }, PANELS, { seed = 0 } = {}) {
  const coat = [];
  PANELS.forEach((Pn, i) => {
    const face = M[Pn.mat ?? 'coat'], back = Pn.back === null ? null : M[Pn.back ?? 'lining'];
    const put = (j, g) => {
      mesh(j, g, face);
      if (back) mesh(j, g, back);
    };
    const sa = Math.sin(Pn.az), ca = Math.cos(Pn.az);
    const R0 = 1 / Math.hypot(sa / DIM.coatR, ca / (DIM.coatR * 0.69)) + Pn.out * 0.5;
    const anchor = joint(pelvis, sa * R0, DIM.coatY, ca * R0);
    anchor.rotation.y = Pn.az; // local +Z = outward, +X = tangent
    const s0 = joint(anchor);
    const sk = Pn.skew ?? 0, w0 = Pn.w[0], sl = Pn.slant ?? 0;
    const nF = Math.max(1, Math.round(Pn.w[2] / 0.18)) + 0.5, fph = i * 2.3 + 0.4;
    const L0 = Pn.len[0], L1 = Pn.len[1];
    put(s0, skirtSheet(L0, Pn.w[0], Pn.w[1], R0, 0.25, 0, 81 + seed + i, [0.001, 0.005, nF, fph], 0, 1, sk, w0));
    const s1 = joint(s0, 0, -L0, 0);
    const R1 = R0 + 0.25 * L0;
    put(s1, skirtSheet(L1, Pn.w[1], Pn.w[2], R1, 0.25, Pn.jag ?? 0.02, 91 + seed + i, [0.005, 0.012, nF, fph], 0, 1, sk, w0, sl));
    if (Pn.border) {
      for (const e of [-1, 1]) {
        mesh(s0, sheetEdge(L0, Pn.w[0], Pn.w[1], R0, e, 1, 0.25, sk, w0), M[Pn.border]);
        mesh(s1, sheetEdge(L1, Pn.w[1], Pn.w[2], R1, e, 1, 0.25, sk, w0), M[Pn.border]);
      }
    }
    const strips = [];
    const n = Pn.strips.length, R2 = R1 + 0.25 * L1, wr = Pn.w[2] / Math.max(1, n);
    for (let k = 0; k < n; k++) {
      const sk01 = (k + 0.5) / n;
      const u = (sk01 - 0.5) * Pn.w[2] + sheetOffset(Pn.w[2], w0, sk);
      const a = u / R2;
      const sj = joint(s1, Math.sin(a) * R2, -L1 - sl * (sk < 0 ? 1 - sk01 : sk01), (Math.cos(a) - 1) * R2);
      sj.rotation.y = a;
      const sw = Math.max(0.06, wr * (Pn.point ? 1.0 : 0.9));
      mesh(sj, tatterStrip(Pn.strips[k], sw, { fork: !!Pn.fork?.[k], curl: Pn.point ? 0.05 : 0.2, seed: 3000 + seed + i * 31 + k * 7 }), face);
      strips.push({ joint: sj, len: Pn.strips[k], rest: a, phase: (i * 1.9 + k * 2.1) % (Math.PI * 2) });
    }
    coat.push({ anchor, segs: [s0, s1], def: Pn, strips, len: [L0, L1 + sl + (n ? Math.max(...Pn.strips) * 0.8 : 0)], r0: R0 });
  });
  return { coat };
}

/** The torso shell's radii at world idle height h (BODY.shell, linear between its rings). */
export function shellAt(SHELL, h) {
  let k = 0;
  while (k < SHELL.length - 2 && SHELL[k + 1].y < h) k++;
  const A = SHELL[k], B = SHELL[k + 1], u = Math.min(1, Math.max(0, (h - A.y) / (B.y - A.y)));
  return { rx: lerp(A.rx, B.rx, u), rz: lerp(A.rz, B.rz, u), cz: lerp(A.cz ?? 0, B.cz ?? 0, u) };
}

/** A panel lying on the torso's front (spine space): from height h0 up to h1, half-width hw0 → hw1,
 *  `off` proud of the shell. The front panel's upper part. */
export function chestPanel(SHELL, ySp, h0, h1, hw0, hw1, off = 0.008, cols = 4, rows = 6) {
  return gridGeometry(cols, rows, (s, t, o) => {
    const h = lerp(h0, h1, t), R = shellAt(SHELL, h), x = (s - 0.5) * 2 * lerp(hw0, hw1, t);
    o[0] = x;
    o[1] = ySp(h);
    o[2] = Math.sqrt(Math.max(0, 1 - (x / (R.rx + off)) ** 2)) * (R.rz + off) + R.cz;
    o[3] = x;
    o[4] = o[1];
  });
}

/**
 * Plain legs for both looks: trousers (`pants`: the M name of their cloth; the outline cloth by
 * default, so a leg shown in a skirt's vent is drawn like the skirt), tall boots (`boot`),
 * a bright band round each boot's top (`band`), a pale welt round the sole, and for `straps` > 0
 * that many straps round each shin with a buckle on the outside (look B).
 */
export function plainLegs({ pelvis, legs, M, DIM, BODY, mesh }, { boot = 'armor', pants = 'armor', band = 'bevel', straps = 0, cuff = true } = {}) {
  const [hx, hy, hz] = BODY.hips.r;
  mesh(pelvis, orient.up(ellipsoidGeometry(hx, hz, hy)), M[pants], ...BODY.hips.c);
  const [th0, th1, thB] = BODY.thigh, [sh0, sh1, shB] = BODY.shin, F = BODY.foot;
  const rAt = (t) => lerp(sh0, sh1, t) + shB * Math.sin(Math.PI * t);
  for (const side of [-1, 1]) {
    const { thigh, shin, foot } = legs[side < 0 ? 'R' : 'L'];
    mesh(thigh, sub(limb({ length: DIM.thigh, r0: th0, r1: th1, bulge: thB }), 1), M[pants]);
    // the boot: the shaft from under the knee to the ankle, a turned cuff at its top (its own ink
    // sub-id: a line under it), the foot, the heel
    const shaft = [sub(limb({ length: DIM.shin - 0.03, r0: sh0 + 0.004, r1: sh1 + 0.004, bulge: shB }).translate(0, -0.03, 0), 0)];
    // (snug under a long skirt: the animator pushes the skirt off the legs by the body's own girth)
    if (cuff) shaft.push(sub(limb({ length: 0.075, r0: sh0 + 0.016, r1: sh0 + 0.011, radial: 12, rings: 2, capSegs: 1 }).translate(0, -0.012, 0), 1));
    mesh(shin, mergeGeometries(shaft), M[boot]);
    const br = sh0 + (cuff ? 0.019 : 0.008);
    mesh(shin, bandGeometry(br, br, 0.016, 14).translate(0, cuff ? -0.02 : -0.048, 0), M[band]);
    if (straps > 0) {
      const st = [], bk = [];
      for (let k = 0; k < straps; k++) {
        const y = lerp(-0.14, -0.31, straps > 1 ? k / (straps - 1) : 0.5), r = rAt(-y / DIM.shin) + 0.009;
        st.push(sub(bandGeometry(r, r, 0.026, 12).translate(0, y, 0), k & 1));
        bk.push(boxGeometry(0.012, 0.03, 0.03, side * (r + 0.004), y, 0.012));
      }
      mesh(shin, mergeGeometries(st), M.leather);
      mesh(shin, mergeGeometries(bk), M.trim);
    }
    mesh(foot, mergeGeometries([
      ellipsoidGeometry(F.r[0], F.r[1], F.r[2], { widthSegs: 10, heightSegs: 6 }).translate(...F.c),
      sub(boxGeometry(0.062, 0.032, 0.052, 0, -0.053, -0.062), 1),
    ]), M[boot]);
    mesh(foot, ellipsoidGeometry(F.r[0] + 0.006, 0.007, F.r[2] + 0.007, { widthSegs: 14, heightSegs: 3 }), M.welt, 0, -0.062, F.c[2]);
  }
}

/** Sleeves for both looks, on both arms: the upper sleeve with its shoulder cap and elbow (`mat`),
 *  the sword hand's gloved fist on the grip, its wrist and the back of the hand (`glove`). */
export function sleeves({ arms, sword, M, DIM, BODY, mesh }, { mat = 'armor', glove = 'armor' } = {}) {
  const [ua0, ua1] = BODY.upperArm, fa1 = BODY.foreArm[1], HK = BODY.hand;
  const F = gripFist(HK);
  mesh(sword, mergeGeometries([F.fingers, F.thumb, F.ridge]), M[glove]);
  for (const side of [-1, 1]) {
    const { upper } = arms[side < 0 ? 'R' : 'L'];
    mesh(upper, mergeGeometries([
      sub(limb({ length: DIM.upperArm, r0: ua0 + 0.002, r1: ua1 + 0.003, bulge: 0.008 }), 1),
      // (the shoulder cap a little smaller and lower than the body's: it sits under a cowl / a mantle)
      sub(ellipsoidGeometry(BODY.deltoid[0] * 0.92, BODY.deltoid[1] * 0.92, BODY.deltoid[2] * 0.92, { widthSegs: 12, heightSegs: 8 }).translate(side * 0.004, -0.028, 0), 1),
      sub(ellipsoidGeometry(ua1 + 0.006, ua1 + 0.004, ua1 + 0.008, { widthSegs: 10, heightSegs: 6 }).translate(0, -DIM.upperArm, -0.004), 1),
    ]), M[mat]);
  }
  mesh(arms.R.fore, mergeGeometries([
    limb({ length: 0.05, r0: fa1 - 0.004, r1: fa1 - 0.003, radial: 8, rings: 2, capSegs: 1 }).translate(0, -DIM.foreArm + 0.07, 0),
    ellipsoidGeometry(0.034 * HK, 0.04 * HK, 0.042 * HK, { widthSegs: 10, heightSegs: 6 }).translate(0, -DIM.foreArm + 0.022, 0.004),
  ]), M[glove]);
}

/** A straight-bladed sword on a plain cross guard (the sheets' sword), sword space. `spec`: a
 *  moonblade.js blade spec; `pale`: the dark core takes the edge's pale light too (a crystal). */
export function plainSword({ sword, M, mesh, joint }, spec, { pale = false, quillon = 0.105, disc = false } = {}) {
  const D = SWORD_DIMS, B = bladeGeometry(spec, D.drawnTip, D.forte);
  mesh(sword, B.forte, M.blade);
  mesh(sword, B.core, pale ? M.bladeTip : M.blade);
  mesh(sword, B.edge, M.bladeTip);
  // the grip: leather bands (alternate ink sub-ids: a wrapped grip)
  {
    const n = 6, len = 0.16 / n, bands = [];
    for (let i = 0; i < n; i++) bands.push(sub(limbGeometry({ length: len, r0: 0.016, r1: 0.016, radial: 6, rings: 1, capSegs: 1 }).translate(0, 0, -D.gripBack + i * len), i & 1));
    mesh(sword, mergeGeometries(bands), M.leather);
  }
  // the cross guard: a straight bar, a little wider at its ends, round a diamond; the pommel
  const guard = [boxGeometry(quillon * 2, 0.02, 0.026, 0, 0, D.guard + 0.002)];
  for (const s of [-1, 1]) guard.push(sub(kiteGeometry(0.02, 0.014, 0.022).translate(s * quillon, 0, D.guard + 0.002), 1));
  guard.push(disc
    ? sub(ring(0.03, 0.03, 0.011, 10).translate(0, 0, -0.118), 1)
    : sub(kiteGeometry(0.02, 0.014, 0.034, { zNeg: 1.4 }).translate(0, 0, -0.118), 1));
  mesh(sword, mergeGeometries(guard), M.armor);
  mesh(sword, mergeGeometries([
    ring(0.019, 0.019, 0.007, 8).rotateX(Math.PI / 2).translate(0, 0, -D.gripBack),
    starGeometry(0.03, 0.04, 0.011, 0.024).translate(0, 0, D.gem),
  ]), M.trim);
  mesh(sword, starGeometry(0.018, 0.026, 0.007, 0.03, 0.004), M.gem, 0, 0, D.gem);
  return { gem: joint(sword, 0, 0, D.gem) };
}

// ================================================================ look A
// ---------------------------------------------------------------- head: the pointed hood
/** Hood rings (head space, shellGeometry): from the drape on the shoulders up round a deep opening
 *  (widest at the cheeks, closing to a point over the brow) to a pointed peak, a little back. */
const HOOD = [
  { y: -0.05, rx: 0.192, rz: 0.152, cz: -0.022, gap: 0.05 },
  { y: 0.018, rx: 0.15, rz: 0.136, cz: -0.012, gap: 0.052 },
  { y: 0.075, rx: 0.14, rz: 0.15, cz: 0.0, gap: 0.088 },
  { y: 0.14, rx: 0.148, rz: 0.166, cz: 0.004, gap: 0.114 },
  { y: 0.2, rx: 0.146, rz: 0.168, cz: 0.004, gap: 0.1 },
  { y: 0.25, rx: 0.13, rz: 0.156, cz: 0.0, gap: 0.062 },
  { y: 0.292, rx: 0.1, rz: 0.128, cz: -0.012, gap: 0.012 },
  { y: 0.328, rx: 0.06, rz: 0.084, cz: -0.032, gap: 0.004 },
  { y: 0.362, rx: 0.02, rz: 0.03, cz: -0.056, gap: 0.003 },
  { y: 0.376, rx: 0.004, rz: 0.006, cz: -0.068, gap: 0.002 },
];
/** The silver hair: a short spiky fringe from the hairline down over where the eyes would be, and a
 *  short lock at each cheek. */
const LOCKS = {
  fringe: [
    [-0.058, 0.2, 0.05, -0.32, -1, 0.42, 0.085, 0.016, 0.2], [-0.03, 0.212, 0.072, -0.14, -1, 0.34, 0.105, 0.017, 0.2],
    [0.002, 0.216, 0.078, 0.04, -1, 0.3, 0.12, 0.018, 0.2], [0.032, 0.212, 0.07, 0.2, -1, 0.34, 0.098, 0.017, 0.2],
    [0.06, 0.198, 0.048, 0.36, -1, 0.4, 0.08, 0.016, 0.2],
  ],
  sides: [[0.074, 0.175, 0.03, 0.16, -1, 0.3, 0.11, 0.014, 0.18]],
};
function buildHood({ head, M, mesh }) {
  mesh(head, shellGeometry(HOOD, { sub: 2, cols: 28 }), M.armor);
  // the dark cavity: the same shell a few mm inside, seen from within
  mesh(head, shellGeometry(HOOD.map((r) => ({ ...r, rx: Math.max(0.002, r.rx - 0.005), rz: Math.max(0.002, r.rz - 0.005) })), { sub: 2, cols: 28 }), M.lining);
  // the white rim round the opening and the seam up to the peak
  mesh(head, mergeGeometries([hoodRim(HOOD, 0, 6.4), hoodSeam(HOOD, 6.2, 9)]), M.bevel);
  // the hair: a silver mass over the skull (no bald forehead in the opening) and the fringe
  mesh(head, sub(orient.up(ellipsoidGeometry(0.086, 0.098, 0.092, { widthSegs: 12, heightSegs: 8 })), 1), M.bevel, 0, 0.166, -0.006);
  buildLocks(head, mesh, LOCKS, M.bevel);
}

// ---------------------------------------------------------------- chest: the robe, the cowl
function buildRobe({ spine, chest, M, BODY, REST, mesh }) {
  const ySp = (h) => h - REST.spine, yCh = (h) => h - REST.chest;
  const SHELL = BODY.shell, top = SHELL[SHELL.length - 1];
  const rings = [...SHELL, { y: top.y + 0.02, rx: 0.058, rz: 0.056 }].map((r) => ({ ...r, gap: 0, y: ySp(r.y) }));
  mesh(spine, shellGeometry(rings, { sub: 3, cols: 28 }), M.coat);
  // the front panel's upper part, from the belt up under the cowl, a white line down each edge
  mesh(spine, chestPanel(SHELL, ySp, 1.1, 1.44, 0.058, 0.07, 0.008), M.spike);
  mesh(spine, mergeGeometries([-1, 1].map((s) => gridGeometry(1, 6, (u, t, o) => {
    const h = lerp(1.1, 1.44, t), R = shellAt(SHELL, h), x = s * (lerp(0.058, 0.07, t) - 0.004 + (u - 0.5) * 0.008);
    o[0] = x;
    o[1] = ySp(h);
    o[2] = Math.sqrt(Math.max(0, 1 - (x / (R.rx + 0.011)) ** 2)) * (R.rz + 0.011) + R.cz;
    o[3] = x;
    o[4] = o[1];
  }))), M.bevel);
  // a thin belt over it
  const W = shellAt(SHELL, 1.2);
  mesh(spine, bandGeometry(W.rx + 0.016, W.rz + 0.016, 0.034, 32), M.leather, 0, ySp(1.2), W.cz);
  // the cowl, two layers (their ink sub-ids differ: a line where the wrap lies on the mantle).
  // The mantle: over the shoulders to the top of the arms, its edge dipping to a point at the
  // breastbone and between the shoulder blades
  {
    const R = [
      { y: yCh(1.335), rx: 0.29, rz: 0.218, cz: -0.02 },
      { y: yCh(1.395), rx: 0.284, rz: 0.208, cz: -0.02 },
      { y: yCh(1.455), rx: 0.272, rz: 0.176, cz: -0.012 }, // (over the shoulder caps: narrower, they stood out of it)
      { y: yCh(1.496), rx: 0.216, rz: 0.142, cz: -0.006 },
      { y: yCh(1.522), rx: 0.126, rz: 0.11, cz: 0.0 },
    ];
    const cols = 32, g = shellGeometry(R, { sub: 2, cols });
    const p = g.attributes.position;
    for (let i = 0; i <= cols; i++) {
      const a = (i / cols) * Math.PI * 2, dF = Math.min(a, Math.PI * 2 - a), dB = Math.abs(a - Math.PI);
      p.setY(i, p.getY(i) - 0.085 * Math.max(0, 1 - dF / 0.75) - 0.07 * Math.max(0, 1 - dB / 0.85) + (i % 2 ? -0.012 : 0.008));
    }
    g.computeVertexNormals();
    mesh(chest, sub(g, 0), M.spike);
  }
  // the wrap: a roll of cloth round the neck over the mantle, lower on his left (a drawn fold
  // across it: it is wound, not sewn)
  {
    const R = [
      { y: yCh(1.458), rx: 0.281, rz: 0.186, cz: -0.012 },
      { y: yCh(1.498), rx: 0.226, rz: 0.152, cz: -0.006 },
      { y: yCh(1.528), rx: 0.14, rz: 0.12, cz: 0.004 },
      { y: yCh(1.552), rx: 0.106, rz: 0.1, cz: 0.006 },
    ];
    const cols = 28, g = shellGeometry(R, { sub: 2, cols });
    const p = g.attributes.position;
    for (let i = 0; i <= cols; i++) p.setY(i, p.getY(i) - 0.02 * (0.5 + 0.5 * Math.cos((i / cols) * Math.PI * 2 - 0.9)) + (i % 2 ? 0.006 : -0.004));
    g.computeVertexNormals();
    mesh(chest, sub(g, 1), M.spike);
  }
}

// ---------------------------------------------------------------- arms
function buildArms(ctx) {
  const { arms, M, DIM, BODY, mesh } = ctx;
  const ua1 = BODY.upperArm[1], [fa0, fa1] = BODY.foreArm;
  sleeves(ctx, { mat: 'armor', glove: 'armor' });
  // the sword arm: a dark inner sleeve to the wrist and, over it, a wide bell cuff open toward the
  // hand, a white line round its edge (rigid on the forearm: nothing loose on the sword arm)
  mesh(arms.R.fore, limb({ length: 0.2, r0: fa0 + 0.002, r1: fa1 }).translate(0, -0.03, 0), M.shirt);
  const BELL = { y0: 0.004, y1: -0.172, r0: ua1 + 0.008, r1: 0.086 };
  mesh(arms.R.fore, gridGeometry(14, 3, (s, t, o) => {
    const a = s * Math.PI * 2, r = lerp(BELL.r0, BELL.r1, t ** 1.4);
    o[0] = Math.sin(a) * r;
    o[1] = lerp(BELL.y0, BELL.y1, t);
    o[2] = Math.cos(a) * r;
    o[3] = (a - Math.PI) * 0.07;
    o[4] = o[1];
  }, true), M.spike);
  mesh(arms.R.fore, bandGeometry(BELL.r1 + 0.002, BELL.r1 + 0.002, 0.012, 16).translate(0, BELL.y1 + 0.004, 0), M.bevel);
  // the shield arm: a slim sleeve to the wrist (the shield's strap and its fist are the shield's)
  mesh(arms.L.fore, mergeGeometries([
    sub(limb({ length: 0.085, r0: ua1 + 0.002, r1: fa0 + 0.003 }), 1),
    sub(limb({ length: 0.17, r0: fa0 + 0.003, r1: fa1 + 0.001, radial: 10, rings: 3 }).translate(0, -0.06, 0), 1),
  ]), M.armor);
  return buildFreeHand(ctx, M.armor);
}

// ---------------------------------------------------------------- waist: the robe's skirt
/** Five panels (a look may hang six at most): a front pair and a back pair, each no wider at its top
 *  than COAT_PANELS' (the animator's leg push was tuned on those: wider, the sheet's arc leaves the
 *  hips' ellipse and the trousers show through it on the run) and widening outward round the sides,
 *  to the shins, the hem torn into broad points; then the front panel: a long narrow strip to a
 *  point. Each carries its own idle stir (the animator's table is in COAT_PANELS' order). The skirt
 *  is the outline cloth too. */
export const ABYSS_PANELS = [
  { az: 1.02, w: [0.15, 0.22, 0.3], len: [0.39, 0.37], strips: [0.09, 0.15], fork: [0, 0], out: 0.004, flare: 0.14, skew: 1, slant: 0.05, mat: 'armor', back: null, breeze: 0.025, idleFlare: 0.03 },
  { az: -1.02, w: [0.15, 0.22, 0.3], len: [0.39, 0.37], strips: [0.15, 0.09], fork: [0, 0], out: 0.004, flare: 0.14, skew: -1, slant: 0.05, mat: 'armor', back: null, breeze: 0.03, idleFlare: 0.04 },
  { az: 2.36, w: [0.16, 0.25, 0.37], len: [0.39, 0.37], strips: [0.15, 0.1], fork: [0, 0], out: 0.008, flare: 0.3, skew: -1.2, slant: 0.06, mat: 'armor', back: null, breeze: 0.055, idleFlare: 0.09 },
  { az: -2.36, w: [0.16, 0.25, 0.37], len: [0.39, 0.37], strips: [0.1, 0.15], fork: [0, 0], out: 0.008, flare: 0.3, skew: 1.2, slant: 0.06, mat: 'armor', back: null, breeze: 0.05, idleFlare: 0.11 },
  { az: 0, w: [0.116, 0.12, 0.116], len: [0.4, 0.34], strips: [0.15], fork: [0], out: 0.02, flare: 0.1, mat: 'spike', back: null, border: 'bevel', point: true, jag: 0, breeze: 0.03, idleFlare: 0.04 },
];
const buildSkirt = (ctx) => robeSkirt(ctx, ABYSS_PANELS, { seed: 210 });

// ---------------------------------------------------------------- back: the long cloak
/** Three sheets down his back to the calves, torn at the hem. None on the shield arm. */
export const ABYSS_SHEETS = [
  { on: 'chest', at: [0, 0.2, -0.168], ry: Math.PI, w: [0.2, 0.27, 0.34], len: [0.48, 0.44], out: 0.2, wrap: 0.26, strips: [0.15, 0.24, 0.12], fork: [0, 1, 0], seed: 3 },
  { on: 'chest', at: [0.15, 0.2, -0.13], ry: Math.PI - 0.55, w: [0.13, 0.18, 0.24], len: [0.46, 0.42], out: 0.24, wrap: 0.22, strips: [0.2, 0.11], fork: [0, 0], seed: 17 },
  { on: 'chest', at: [-0.15, 0.2, -0.13], ry: Math.PI + 0.55, w: [0.13, 0.18, 0.24], len: [0.46, 0.41], out: 0.22, wrap: 0.22, strips: [0.12, 0.19], fork: [0, 0], seed: 29 },
];
const buildCloak = (ctx) => ({ streamers: hangCloak(ctx, ABYSS_SHEETS, { face: ctx.M.armor }) });

// ---------------------------------------------------------------- weapon: the crystal sword
/** A long narrow blade: no forte flare, no notches, one straight taper to a short point. */
const CRYSTAL = {
  profile: [[0.11, 0.02], [0.135, 0.03], [0.2, 0.028], [0.775, 0.0225], [0.85, 0.014], [0.9, 0]],
  notches: [], notch: { depth: 0, lead: 0.006, len: 0.022 }, ridge: 0.011, core: 0.5,
};
const buildSword = (ctx) => plainSword(ctx, CRYSTAL, { pale: true, quillon: 0.1 });

export const ABYSS_ITEMS = [
  { id: 'abyss.hood', slot: 'head', name: 'Pointed Hood', hidesHair: true, blankFace: true, build: buildHood },
  { id: 'abyss.robe', slot: 'chest', name: 'Black Robe and Cowl', build: buildRobe },
  { id: 'abyss.arms', slot: 'arms', name: 'Bell Sleeve and Gloves', build: buildArms },
  { id: 'abyss.legs', slot: 'legs', name: 'Tall Black Boots', build: (ctx) => plainLegs(ctx, { boot: 'armor', band: 'bevel', cuff: false }) },
  { id: 'abyss.skirt', slot: 'waist', name: 'Robe Skirt and Front Panel', build: buildSkirt },
  { id: 'abyss.cloak', slot: 'back', name: 'Long Tattered Cloak', build: buildCloak },
  { id: 'abyss.sword', slot: 'weapon', name: 'Crystal Sword', dims: SWORD_DIMS, build: buildSword },
];

/** The look's loadout (ids only: gear/index.js imports this file, so it cannot import index.js). */
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

/** Its colours (model.js tintHero, this rig only): everything black but the bright white (`bevel`:
 *  the hair, the edge lines), the silver hardware (`trim`), the skin, the blade and the star. The
 *  outline cloth (`armor`, `spike`) loses its metal glint. */
export const ABYSS_TINT = {
  armor: { fill: [0.07, 0.07, 0.085], spec: [0, 18] },
  spike: { fill: [0.085, 0.085, 0.1], spec: [0, 16] },
  coat: { fill: [0.06, 0.06, 0.075] },
  lining: { fill: [0.02, 0.02, 0.03] },
  shirt: { fill: [0.035, 0.035, 0.045] },
  pants: { fill: [0.055, 0.055, 0.07] },
  leather: { fill: [0.12, 0.12, 0.15] },
  bevel: { fill: [1.3, 1.4, 2.1], spec: [0.15, 20] },
  trim: { fill: [0.46, 0.48, 0.6] },
  welt: { fill: [0.4, 0.41, 0.5] },
};
