import * as THREE from 'three';
import { ellipsoidGeometry, limbGeometry } from '../../render/glyphGeometry.js';
import { BODY } from '../player/heroDims.js';
import {
  gridGeometry, shellGeometry, tatterStrip, bandGeometry, boxGeometry, mergeGeometries, sub, foldLines, ribbonCrease, lerp, limb,
  looseHand, sheetOffset, clumpGeometry, orientTo, arcPlate, strapGeometry, kiteGeometry, ring, wedge, partGeometry, starGeometry, rng,
} from '../player/heroGeo.js';
import { planarGUV } from '../../render/glyphGeometry.js';
import { COAT_PANELS, swordHilt } from '../player/gear/wanderer.js';
import { SHROUD_SHEETS } from '../player/gear/shroud.js';
import { deriveBody } from './bodyLook.js';

// The remade hero's drawn parts, built in the REST pose of the new skeleton (skeleton.js: a T-pose,
// +Z his front, +X his left) from a dimension table through bodyLook.js. Today's costume (the
// Shrouded set over the Wanderer's boots, tails and sword: player/gear/index.js DEFAULT_LOADOUT) is
// the template: the same pieces in the same materials (the look is the materials: their ink part ids,
// fills and rims), re-cut for a skeleton that bends where a body bends:
//   - the trunk in three overlapping shells (pelvis, waist, ribcage) that slide under the belt;
//   - every limb a rounded capsule whose end sits inside the next one's (shoulder caps, an elbow and a
//     knee ball), so a deep bend closes a joint instead of opening a gap;
//   - the hood split at the neck (the cowl turns with the head, the drape stays on the shoulders);
//   - real hands: a fist that wraps the grip (four curled fingers and a thumb) and an open hand;
//   - the boot split at the ball of the foot (the toe cap bends on the toe joint);
//   - the cloak's sheets and the coat tails cut into stretches for the spring-chain cloth (cloth.js).
// Build-time only (allocates). Returns { parts: [{ bone, mat, geo, tag? }], strands: [...] }.

const HALF_PI = Math.PI / 2;

/** Hanging-arm space (the template's: the arm down -Y, its outer side side * X, front +Z) -> the
 *  T-pose (the left arm along +X, the right along -X). The outer side ends up on top. */
const armT = (g, s) => g.rotateZ(s * HALF_PI);

/** The template shell (BODY.shell) interpolated at world height h: rx, rz, cz. */
function shellAt(h) {
  const S = BODY.shell;
  let k = 0;
  while (k < S.length - 2 && S[k + 1].y < h) k++;
  const A = S[k], B = S[k + 1], u = (h - A.y) / (B.y - A.y);
  return { rx: lerp(A.rx, B.rx, u), rz: lerp(A.rz, B.rz, u), cz: lerp(A.cz ?? 0, B.cz ?? 0, u) };
}

export function buildParts(dims) {
  const B = deriveBody(dims);
  const { lm, g, y: Y } = B;
  const parts = [];
  const add = (bone, mat, geo, tag) => {
    if (!geo.attributes.aPart) sub(geo, 0);
    parts.push({ bone, mat, geo, tag: tag ?? null });
  };
  /** template world height h -> local y on `bone` (its rest height) */
  const yb = (bone, h) => Y(h) - lm[bone];
  /** a trunk ring at template height h, on `bone`, grown by `grow` m */
  const ringAt = (bone, h, grow = 0) => {
    const R = shellAt(h);
    return { y: yb(bone, h), rx: B.sx(R.rx, h) + grow, rz: B.sz(R.rz, h) + grow, cz: B.sz(R.cz, h), gap: 0 };
  };

  // ---------------------------------------------------------------- trunk: the wrap tunic in three shells
  {
    const fold = (bone) => (x, y, z) => (z > 0 ? 0.5 + 9 * (x - 0.05 * B.kSh + (y + lm[bone] - Y(1.3)) * 0.42) : 0);
    // waist (spine): from inside the pelvis up past the belt; a hair inside the ribcage shell where
    // they overlap (the ribcage's lower edge is hidden under the belt)
    const lowH = [1.03, 1.07, 1.09, 1.15, 1.21, 1.25];
    const low = lowH.map((h, i) => ringAt('spine', Math.max(1.09, h), i < 2 ? -0.012 + 0.006 * i : -0.004));
    low[0].y = yb('spine', 1.03);
    low[1].y = yb('spine', 1.07);
    add('spine', 'shirt', foldLines(shellGeometry(low, { sub: 2, cols: 28 }), fold('spine')));
    // ribcage (chest): from under the belt to the neck
    const top = BODY.shell[BODY.shell.length - 1];
    const upH = [1.185, 1.21, 1.26, 1.3, 1.37, 1.43, 1.475, top.y];
    const up = upH.map((h) => ringAt('chest', h, h < 1.22 ? 0.003 : 0));
    up.push({ y: yb('chest', top.y + 0.02), rx: 0.058 * g, rz: 0.056 * g, cz: 0, gap: 0 });
    add('chest', 'shirt', foldLines(shellGeometry(up, { sub: 3, cols: 28 }), fold('chest')));
    // the belt at the natural waist (over the seam), its buckle, and a torn sash off the left hip
    const W = shellAt(1.2);
    const wx = B.sx(W.rx, 1.2), wz = B.sz(W.rz, 1.2), wc = B.sz(W.cz, 1.2);
    add('spine', 'leather', bandGeometry(wx + 0.014, wz + 0.014, 0.05 * g, 32).translate(0, yb('spine', 1.2), wc));
    add('spine', 'trim', boxGeometry(0.046 * g, 0.04 * g, 0.014 * g, 0.012 * g, yb('spine', 1.2), wz + wc + 0.018));
    add('spine', 'hem', foldLines(tatterStrip(0.3 * g, 0.09 * g, { fork: true, curl: 0.12, seed: 211 }), ribbonCrease(0.09 * g, 1.3)).translate(0.075 * B.kHip, yb('spine', 1.185), wz + wc + 0.014));
    // the scarf: two rolls round the neck, under the hood
    add('chest', 'hem', mergeGeometries([
      sub(bandGeometry(0.098 * g, 0.09 * g, 0.05 * g, 20).translate(0, yb('chest', 1.5), 0.004), 0),
      sub(bandGeometry(0.112 * g, 0.1 * g, 0.046 * g, 20).translate(0, yb('chest', 1.47), 0.006), 1),
    ]));
    // the mantle: over the shoulders to a ragged edge at the top of the arms
    const rings = [
      { h: 1.375, rx: 0.268, rz: 0.2, cz: -0.026, gap: 0.05 },
      { h: 1.42, rx: 0.252, rz: 0.186, cz: -0.02, gap: 0.045 },
      { h: 1.468, rx: 0.2, rz: 0.148, cz: -0.01, gap: 0.036 },
      { h: 1.505, rx: 0.118, rz: 0.102, cz: 0.002, gap: 0.03 },
    ].map((r) => ({ y: yb('chest', r.h), rx: B.sx(r.rx, r.h), rz: B.sz(r.rz, r.h), cz: B.sz(r.cz, r.h), gap: r.gap * g }));
    const m = sub(shellGeometry(rings, { sub: 2, cols: 30 }), 1);
    const p = m.attributes.position;
    for (let i = 0; i <= 30; i++) p.setY(i, p.getY(i) + (i % 3 === 0 ? -0.03 : i % 3 === 1 ? 0.012 : -0.008) * g);
    m.computeVertexNormals();
    add('chest', 'coat', m);
    add('chest', 'lining', m.clone());
    add('chest', 'trim', boxGeometry(0.03 * g, 0.03 * g, 0.012 * g, 0, yb('chest', 1.485), B.sz(0.128, 1.485), 0, 0, 0.78));
  }

  // ---------------------------------------------------------------- pelvis: the hips, the hip strap
  {
    const [hx, hy, hz] = BODY.hips.r, c = BODY.hips.c;
    const h0 = 0.955 + c[1]; // the template pelvis joint's idle height + the ellipsoid's centre
    add('hips', 'pants', ellipsoidGeometry(B.sx(hx, h0), B.sz(hz, h0), hy * g).rotateX(-HALF_PI).rotateY(Math.PI).translate(0, yb('hips', h0), B.sz(c[2], h0)));
    const band = bandGeometry(B.sx(hx, 1.04) * 1.14, B.sz(hz, 1.04) * 1.18, 0.03 * g, 28);
    band.rotateZ(0.55);
    add('hips', 'leather', band.translate(0.01, yb('hips', 1.04), 0.004));
    add('hips', 'leather', strapGeometry([0, yb('hips', 1.13), B.sz(0.11, 1.1)], [0, yb('hips', 0.93), B.sz(0.104, 0.93)], 0.026 * g, 0.008 * g, [1, 0, 0]));
    add('hips', 'trim', mergeGeometries([
      boxGeometry(0.03 * g, 0.024 * g, 0.012 * g, 0, yb('hips', 1.07), B.sz(0.117, 1.07)),
      kiteGeometry(0.015 * g, 0.022 * g, 0.007 * g, { yPos: 0.4 }).translate(0, yb('hips', 0.915), B.sz(0.106, 0.915)),
      boxGeometry(0.044 * g, 0.036 * g, 0.014 * g, -0.086 * B.kHip, yb('hips', 1.0), B.sz(0.094, 1.0), 0, -0.5, -0.5),
    ]));
  }

  // ---------------------------------------------------------------- neck, head, hood
  {
    // the template's head space: the neck base (1.535 m idle) is the origin, drawn x BODY.headScale
    const hs = BODY.headScale * B.kHead;
    const base = lm.neckBase;
    const toBone = (geo, bone) => geo.scale(hs, hs, hs).translate(0, base - lm[bone], 0);
    // the neck (on the neck joint, so the head turns on it) in the hood's shadow
    add('neck', 'shirt', toBone(limb({ length: 0.13, r0: BODY.neck[0], r1: BODY.neck[1], radial: 8, rings: 2, capSegs: 1 }).translate(0, 0.1, 0), 'neck'));
    // the skull, the jaw (the face in the hood's shadow, as today's `shadowsFace` hood draws it)
    const [sx, sy, sz] = [0, 0.14, 0.005];
    const skull = ellipsoidGeometry(0.078, 0.09, 0.1).rotateX(-HALF_PI).rotateY(Math.PI).translate(sx, sy, sz);
    const jaw = ellipsoidGeometry(0.05, 0.04, 0.056, { widthSegs: 10, heightSegs: 6 });
    const jp = jaw.attributes.position;
    for (let i = 0; i < jp.count; i++) {
      const z = jp.getZ(i), y = jp.getY(i);
      jp.setX(i, jp.getX(i) * (1 - 0.45 * Math.max(0, z / 0.056) * Math.max(0, -y / 0.04 + 0.3)));
    }
    jaw.computeVertexNormals();
    jaw.translate(sx, sy - 0.066, sz + 0.016);
    add('head', 'shirt', toBone(mergeGeometries([skull, jaw]), 'head'));
    add('head', 'hair', toBone(partGeometry('hair.cap'), 'head'));
    // the hood (gear/shroud.js HOOD_RINGS): the drape round the neck on the neck joint, the cowl on
    // the head; they overlap a ring (the same cloth: no seam shows)
    const HR = [
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
    const hoodFold = (x, y, z, u) => 0.5 + 0.6 * Math.sin(u * 62 + y * 9) - 1.4 * Math.max(0, (y - 0.22) / 0.1);
    // (the drape a touch inside the cowl where they overlap)
    const drape = foldLines(shellGeometry(HR.slice(0, 3).map((r, i) => (i ? { ...r, rx: r.rx - 0.002, rz: r.rz - 0.002 } : r)), { sub: 2, cols: 26 }), hoodFold);
    const cowl = foldLines(shellGeometry(HR.slice(1), { sub: 2, cols: 26 }), hoodFold);
    for (const [bone, geo] of [['neck', drape], ['head', cowl]]) {
      toBone(geo, bone);
      add(bone, 'coat', geo);
      add(bone, 'lining', geo.clone());
    }
    // the paler rim round the face opening
    const rim = [];
    for (const s of [-1, 1]) {
      for (let k = 0; k < 5; k++) {
        const A = HR[k + 1], C = HR[k + 2];
        const pt = (R) => {
          const a = Math.asin(Math.min(0.95, R.gap / R.rx));
          return [s * Math.sin(a) * (R.rx + 0.003), R.y, Math.cos(a) * (R.rz + 0.003) + R.cz];
        };
        const p = pt(A), q = pt(C);
        const len = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
        const b = boxGeometry(0.014, len + 0.006, 0.006, 0, 0, 0);
        b.rotateX(Math.atan2(q[2] - p[2], q[1] - p[1]));
        b.rotateZ(-Math.asin((q[0] - p[0]) / len));
        b.translate((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2);
        rim.push(b);
      }
    }
    add('head', 'hem', toBone(mergeGeometries(rim), 'head'));
    // gold strands out of the hood (gear/shroud.js HOOD_HAIR): the fringe and the cheek locks
    const HH = {
      fringe: [[-0.05, 0.225, 0.075, -0.25, -1, 0.55, 0.085, 0.013, 0.25], [-0.018, 0.23, 0.085, -0.08, -1, 0.6, 0.095, 0.014, 0.25], [0.018, 0.23, 0.085, 0.1, -1, 0.6, 0.09, 0.014, 0.25], [0.052, 0.225, 0.075, 0.3, -1, 0.5, 0.08, 0.013, 0.25]],
      sides: [[0.072, 0.2, 0.06, 0.12, -1, 0.15, 0.13, 0.015, 0.2], [0.08, 0.17, 0.035, 0.2, -1, 0.1, 0.12, 0.013, 0.2], [0.088, 0.07, 0.04, 0.35, -1, 0.35, 0.13, 0.014, 0.15]],
    };
    const mass = [], tips = [];
    let k = 0;
    const lock = ([x, y, z, dx, dy, dz, L, w, curl], s) => {
      for (const [t0, t1, out] of [[0, 0.4, mass], [0.4, 1, tips]]) out.push(sub(orientTo(clumpGeometry(L, w, w * 0.5, { t0, t1, curl, taper: 0.7, cols: 6, rows: 2 }), [s * x, y, z], [s * dx, dy, dz], [s * 0.3, 0.2, 1]), k & 1));
      k++;
    };
    for (const l of HH.fringe) lock(l, 1);
    for (const s of [-1, 1]) for (const l of HH.sides) lock(l, s);
    add('head', 'hair', toBone(mergeGeometries(mass), 'head'));
    add('head', 'hairTip', toBone(mergeGeometries(tips), 'head'));
  }

  // ---------------------------------------------------------------- arms: sleeves, wraps, hands
  const A = B.arm;
  for (const s of [-1, 1]) {
    const S = s < 0 ? 'R' : 'L';
    const [ua0, ua1] = A.ua, [fa0, fa1] = A.fa;
    // upper arm (shoulder joint): the sleeve, the shoulder cap, the elbow ball
    add('upperArm' + S, 'coat', armT(mergeGeometries([
      sub(limb({ length: A.upper, r0: ua0, r1: ua1 + 0.002 * g, bulge: 0.008 * g }), 1),
      sub(ellipsoidGeometry(...A.deltoid, { widthSegs: 12, heightSegs: 8 }).translate(s * 0.008 * g, -0.02 * g, 0), 1),
      sub(ellipsoidGeometry(ua1 + 0.006 * g, ua1 + 0.004 * g, ua1 + 0.008 * g, { widthSegs: 10, heightSegs: 6 }).translate(0, -A.upper, -0.004 * g), 1),
    ]), s));
    // forearm (elbow): the sleeve's end, five leather wraps down to the wrist, the bare wrist
    const fl = A.fore;
    add('foreArm' + S, 'coat', armT(sub(limb({ length: 0.085 * (fl / 0.27), r0: ua1 + 0.002 * g, r1: fa0 + 0.004 * g }), 1), s));
    const wraps = [], n = 5, y0 = -0.07 * (fl / 0.27), y1 = -fl + 0.045 * g;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), y = lerp(y0, y1, t), r = lerp(fa0, fa1 - 0.003 * g, t) + 0.004 * g * Math.sin(Math.PI * Math.min(1, t * 1.6));
      wraps.push(sub(limb({ length: (y0 - y1) / (n - 1) + 0.012, r0: r, r1: r - 0.004 * g, radial: 10, rings: 2, capSegs: 1 }).translate(0, y + 0.006, 0), i & 1));
    }
    add('foreArm' + S, 'leather', armT(mergeGeometries(wraps), s));
    add('foreArm' + S, 'skin', armT(limb({ length: 0.05 * g, r0: fa1 - 0.006 * g, r1: fa1 - 0.008 * g, radial: 8, rings: 2, capSegs: 1 }).translate(0, -fl + 0.035 * g, 0), s));
    // the hands (on the wrist joint, hand space): open, and closed round the socket's grip; the body
    // shows one (setProp). The free hand is drawn a size smaller (the owner's pick, gear/handLook.js)
    const hk = A.hand * (s < 0 ? 1 : 0.86);
    const H = looseHand(0, s, hk);
    add('hand' + S, 'skin', armT(mergeGeometries([H.palm, H.fingers, H.tips, H.thumb]), s), 'open');
    add('hand' + S, 'skin', armT(fistGeometry(s, hk, A.palm), s), 'fist');
  }

  // ---------------------------------------------------------------- legs: pants, boots, feet
  {
    const L = B.leg, [th0, th1, thB] = L.th, [sh0, sh1, shB] = L.sh;
    const rAt = (r0, r1, bulge, t) => lerp(r0, r1, t) + bulge * Math.sin(Math.PI * t);
    for (const s of [-1, 1]) {
      const S = s < 0 ? 'R' : 'L';
      const T = 'thigh' + S, N = 'shin' + S, F = 'foot' + S, O = 'toe' + S;
      add(T, 'pants', mergeGeometries([
        limb({ length: L.thigh, r0: th0, r1: th1, bulge: thB }),
        // the knee ball: the bent knee closes round it (no gap behind a deep crouch)
        ellipsoidGeometry(th1 + 0.004 * g, th1 + 0.002 * g, th1 + 0.006 * g, { widthSegs: 10, heightSegs: 6 }).translate(0, -L.thigh, -0.006 * g),
      ]));
      const ks = (y) => rAt(th0, th1, thB, -y / L.thigh) + 0.004 * g;
      const kA = -L.thigh + 0.085 * g, kB = -L.thigh + 0.035 * g;
      add(T, 'leather', mergeGeometries([
        bandGeometry(ks(kA), ks(kA), 0.015 * g, 12).translate(0, kA, 0),
        bandGeometry(ks(kB), ks(kB), 0.015 * g, 12).translate(0, kB, 0),
      ]));
      if (s < 0) {
        add(T, 'leather', strapGeometry([-(th0 - 0.006), 0.04 * g, 0.04 * g], [-(th0 - 0.002), -0.06 * g, 0.03 * g], 0.022 * g, 0.008 * g, [0, 0, 1]));
        add(T, 'trim', ring(0.016 * g, 0.016 * g, 0.005 * g, 8).rotateX(HALF_PI).translate(-(th0 - 0.002), -0.065 * g, 0.025 * g));
      }
      // the knee-high boot (gear/wanderer.js buildLegs), its lengths along the shin
      const ks2 = L.shin / 0.42, b = sh0 - 0.058;
      const sy = (y) => y * ks2;
      add(N, 'armor', limb({ length: L.shin - 0.02 * ks2, r0: sh0, r1: sh1, bulge: shB }).translate(0, -0.02 * ks2, 0));
      add(N, 'armor', mergeGeometries([
        sub(arcPlate(sy(-0.045), sy(-0.09), 0.067 + b, 0.065 + b, 0, 1.4, 6), 1),
        sub(arcPlate(sy(-0.33), sy(-0.375), 0.054 + b * 0.9, 0.052 + b * 0.9, 0, 1.5, 6), 1),
        sub(arcPlate(sy(-0.13), sy(-0.19), sh0 + 0.016, sh0 + 0.012, Math.PI, 1.35, 8), 1),
        arcPlate(sy(-0.2), sy(-0.26), sh0 + 0.011, sh1 + 0.012, Math.PI, 1.3, 8),
      ]));
      add(N, 'bevel', mergeGeometries([
        arcPlate(sy(-0.183), sy(-0.192), sh0 + 0.0165, sh0 + 0.0165, Math.PI, 1.35, 8),
        arcPlate(sy(-0.252), sy(-0.261), sh1 + 0.0125, sh1 + 0.0125, Math.PI, 1.3, 8),
        arcPlate(sy(-0.083), sy(-0.092), 0.0675 + b, 0.0675 + b, 0, 1.4, 6),
        arcPlate(sy(-0.366), sy(-0.375), 0.0535 + b * 0.9, 0.0535 + b * 0.9, 0, 1.5, 6),
      ]));
      // the kite greave and the knee guard (faceted plates)
      const kite = (Tp, Rt, Bt, Lf, C) => {
        const kg = new THREE.BufferGeometry();
        kg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...Tp, ...C, ...Rt, ...Tp, ...Lf, ...C, ...C, ...Lf, ...Bt, ...C, ...Bt, ...Rt]), 3));
        kg.computeVertexNormals();
        return planarGUV(kg, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
      };
      add(N, 'armor', kite([0, sy(-0.06), 0.069 + b], [0.058 + b, sy(-0.16), 0.058 + b], [0, sy(-0.355), 0.051 + b * 0.9], [-0.058 - b, sy(-0.16), 0.058 + b], [0, sy(-0.16), 0.08 + b * 1.3]));
      {
        const lean = -s * 0.26;
        const kp = kite([0, 0.085 * g, 0.082 + b], [0.05 * g, 0.004 * g, 0.072 + b], [0, -0.05 * g, 0.08 + b], [-0.05 * g, 0.004 * g, 0.072 + b], [0, 0.012 * g, 0.094 + b]);
        const wings = [];
        for (const w of [-1, 1]) wings.push(kiteGeometry(0.012 * g, 0.03 * g, 0.03 * g).rotateY(w * 0.6).translate(w * (0.05 * g + b), -0.006 * g, 0.03 * g + b * 0.5));
        add(N, 'armor', mergeGeometries([kp, ...wings]).rotateZ(lean));
        add(N, 'spike', wedge(0.038 * g, 0.013 * g, [0, 0.075 * g, 0.083 + b], [0, 1, 0.12], [0, 0, 1], 0.05).rotateZ(lean));
      }
      // the foot: heel and instep on the ankle, the toe cap on the ball of the foot (it bends there)
      const fR = L.footR, fC = L.footC, kf = L.foot / 0.15;
      add(F, 'armor', mergeGeometries([
        ellipsoidGeometry(fR[0], fR[1], fR[2] * 0.78, { widthSegs: 10, heightSegs: 6 }).translate(fC[0], fC[1], fC[2] - 0.022 * kf),
        sub(ellipsoidGeometry(0.046 * g, 0.024 * g, 0.041 * kf, { widthSegs: 8, heightSegs: 4 }).rotateX(-0.35).translate(0, fC[1] + fR[1] - 0.015 * g, 0.064 * kf), 1),
        sub(boxGeometry(0.062 * g, 0.032 * g, 0.052 * kf, 0, -0.053 * (L.ankle / 0.07), -0.062 * kf), 1),
      ]));
      add(F, 'welt', ellipsoidGeometry(fR[0] + 0.006 * g, 0.007 * g, fR[2] * 0.72, { widthSegs: 14, heightSegs: 3 }).translate(0, -L.ankle + 0.008, fC[2] - 0.03 * kf));
      // toe space: the toe joint is at the ball of the foot on the ground
      add(O, 'armor', mergeGeometries([
        ellipsoidGeometry(0.05 * g, 0.03 * g, 0.062 * kf, { widthSegs: 10, heightSegs: 6 }).translate(0, 0.028 * g, 0),
        sub(ellipsoidGeometry(0.042 * g, 0.021 * g, 0.037 * kf, { widthSegs: 8, heightSegs: 4 }).rotateX(-0.25).translate(0, 0.046 * g, -0.04 * kf), 1),
      ]));
      add(O, 'welt', ellipsoidGeometry(0.056 * g, 0.007 * g, 0.066 * kf, { widthSegs: 14, heightSegs: 3 }).translate(0, 0.008, 0));
    }
  }

  // ---------------------------------------------------------------- the sword(s) and the flask
  for (const S of ['R', 'L']) {
    const W = 'weapon' + S;
    const k = B.sword.k;
    const blade = (key) => partGeometry(key).scale(1, 1, k);
    add(W, 'armor', blade('blade.forte'), 'sword');
    add(W, 'blade', blade('blade.core'), 'sword');
    add(W, 'bladeTip', blade('blade.edge'), 'sword');
    add(W, 'leather', limbGeometry({ length: 0.16, r0: 0.016, r1: 0.017, radial: 6, rings: 3 }).translate(0, 0, -B.sword.gripBack), 'sword');
    const H = swordHilt(B.sword);
    add(W, 'armor', mergeGeometries(H.armor), 'sword');
    add(W, 'trim', mergeGeometries(H.trim), 'sword');
    add(W, 'gem', starGeometry(0.023, 0.033, 0.008, 0.031, 0.005).translate(0, 0, B.sword.gem), 'sword');
    add(W, 'flask', ellipsoidGeometry(0.036, 0.036, 0.055, { widthSegs: 10, heightSegs: 6 }).rotateX(-HALF_PI).translate(0, 0.01, 0), 'flask');
  }

  return { parts, strands: buildStrands(B), B };
}

/**
 * A closed fist round a grip (the weapon socket's: along +Z, `palm` m out from the wrist), in
 * HANGING-hand space (the hand down -Y from the wrist, its outer side s * X, front +Z; armT turns it
 * to the T-pose). The back of the hand rides outside the grip, four fingers curl round it (index at
 * the guard end, a line between each), the thumb laid over the index finger. k = size.
 */
function fistGeometry(s, k, palm) {
  const gy = -palm; // the grip's centre
  const out = [];
  // the back of the hand: wrist to knuckles, outside the grip
  out.push(sub(ellipsoidGeometry(0.017 * k, 0.046 * k, 0.041 * k, { widthSegs: 10, heightSegs: 6 }).translate(s * 0.02 * k, gy * 0.55, 0.002), 0));
  // the heel of the palm on the inside, the grip pressed into it
  out.push(sub(ellipsoidGeometry(0.014 * k, 0.03 * k, 0.034 * k, { widthSegs: 8, heightSegs: 5 }).translate(-s * 0.016 * k, gy * 0.45, -0.006 * k), 1));
  // fingers: tubes curled 3/4 round the grip, from the knuckles (outside) under it and up its inside
  const FZ = [0.027, 0.009, -0.009, -0.026], FR = [0.0105, 0.011, 0.0105, 0.009];
  for (let i = 0; i < 4; i++) {
    const rt = FR[i] * k, rr = 0.017 + rt * 0.95, z0 = FZ[i] * k;
    const th0 = 0.35, th1 = Math.PI + 0.75 - 0.08 * i;
    const f = gridGeometry(10, 6, (u, v, o) => {
      const th = lerp(th0, th1, u), ps = v * Math.PI * 2;
      // the ring in the XY plane round the grip: outward (s, 0) at th = 0, down at th = pi / 2
      const cx = Math.cos(th) * s, cy = -Math.sin(th);
      const R = rr + Math.cos(ps) * rt * (1 - 0.25 * u);
      o[0] = cx * R;
      o[1] = gy + cy * R;
      o[2] = z0 + Math.sin(ps) * rt * (1 - 0.25 * u);
      o[3] = ps * rt;
      o[4] = th * rr;
    }, s < 0);
    out.push(sub(f, i & 1));
    // the knuckle: a rounded cap where the finger leaves the back of the hand
    out.push(sub(ellipsoidGeometry(rt * 1.1, rt * 1.15, rt * 1.0, { widthSegs: 6, heightSegs: 4 }).translate(Math.cos(th0) * s * rr, gy - Math.sin(th0) * rr, z0), i & 1));
  }
  // the thumb: from the inside of the palm over the index finger toward the guard
  out.push(sub(orientTo(limb({ length: 0.04 * k, r0: 0.012 * k, r1: 0.0095 * k, radial: 7, rings: 3, capSegs: 2 }).rotateX(HALF_PI), [-s * 0.017 * k, gy * 0.35, 0.03 * k], [s * 0.45, -1, 0.25], [s, 0, 0]), 1));
  return mergeGeometries(out);
}

// ---------------------------------------------------------------- the cloth's strands
/**
 * The cloak sheets and the coat tails as spring chains (cloth.js). Each strand: its anchor bone and
 * the anchor's point and frame there (X across the sheet, Z its outer face), the bone whose frame
 * its rest hang is read in (`ref`), the outward flare at rest (`out`, tan of the angle off straight
 * down), the stretch lengths (`lens`), and per stretch the geometry list [{ mat, geo }] (built
 * hanging -Y from the stretch's top, in the stretch's own frame), plus the tuning (cloth.js CLOTH).
 */
function buildStrands(B) {
  const { g, lm, y: Y } = B;
  const strands = [];
  const kLeg = (B.d.thigh + B.d.shin) / 0.85;

  // one sheet cut into stretches at `cuts` (depths from its top); stretch i's material is mats[i];
  // each stretch is built a little past its bottom in the NEXT stretch's material (OVER), so a bend
  // never opens a slit between them and the overlap is the same cloth on the same surface
  const OVER = 0.03;
  const sheet = ({ len, wAt, R0, flare = 0.25, fold, foldFn, jag = 0, seed = 1, skew = 0, w0, slant = 0, slantFrom = 0 }) => {
    const r = rng(seed), cols = 16;
    const jitter = Array.from({ length: cols + 1 }, () => (r() - 0.5) * jag);
    const ph = fold[3];
    return (d0, d1, top) => {
      const rows = Math.max(2, Math.round(((d1 - d0) / len) * 10));
      const geo = gridGeometry(cols, rows, (s, tt, o) => {
        const d = lerp(d0, d1, tt), t = d / len;
        const w = wAt(d);
        const u = (s - 0.5) * w + sheetOffset(w, w0, skew);
        const R = R0 + flare * d;
        const a = u / R;
        const sl = slant * Math.max(0, (d - slantFrom) / (len - slantFrom)) * (skew < 0 ? 1 - s : s);
        const yAbs = -(d + sl) + (tt === 1 && d1 >= len - 1e-6 ? jitter[Math.round(s * cols)] : 0);
        const f = lerp(fold[0], fold[1], t) * Math.sin(s * Math.PI * 2 * fold[2] + ph) * Math.sin(Math.PI * Math.min(1, s * 6) * 0.5) * Math.sin(Math.PI * Math.min(1, (1 - s) * 6) * 0.5);
        o[0] = Math.sin(a) * (R + f);
        o[1] = yAbs + top;
        o[2] = (Math.cos(a) - 1) * R + Math.cos(a) * f;
        o[3] = u;
        o[4] = yAbs;
      }, true);
      // the drawn folds: foldFn(u, d, w) -> the sub-id field (heroGeo.js foldLines)
      const p = geo.attributes.aGUV, n = p.count, a = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const u = p.getX(i), d = -p.getY(i);
        const v = foldFn(u, d, wAt(Math.max(0, Math.min(len, d))));
        a[i] = Number.isFinite(v) ? Math.min(0.9, Math.max(0, v)) : 0;
      }
      geo.setAttribute('aPart', new THREE.BufferAttribute(a, 1));
      return geo;
    };
  };
  /** the stretches of one sheet: [{ len, geos: [{ mat, geo }] }] */
  const stretches = (build, cuts, mats, matsBack, extra) => {
    const out = [];
    for (let i = 0; i < cuts.length - 1; i++) {
      const d0 = cuts[i], d1 = cuts[i + 1], geos = [];
      const push = (a, b, k) => {
        const geo = build(a, b, d0);
        geos.push({ mat: mats[k], geo });
        if (matsBack[k]) geos.push({ mat: matsBack[k], geo: geo.clone() });
      };
      push(d0, d1, i);
      if (i < cuts.length - 2) push(d1, Math.min(cuts[i + 2], d1 + OVER), i + 1);
      out.push({ len: d1 - d0, geos });
    }
    if (extra) out[out.length - 1].geos.push(...extra);
    return out;
  };

  // ---- the coat tails (gear/wanderer.js COAT_PANELS) on the hips
  COAT_PANELS.forEach((P, i) => {
    const sa = Math.sin(P.az), ca = Math.cos(P.az);
    const h = 1.135; // the template's anchor height (pelvis + DIM.coatY)
    const R0 = 1 / Math.hypot(sa / B.sx(0.148, h), ca / B.sz(0.148 * 0.69, h)) + P.out * 0.5;
    const L0 = P.len[0] * kLeg, L1 = P.len[1] * kLeg, len = L0 + L1, w = P.w.map((x) => x * B.kHip);
    const sk = P.skew ?? 0, w0 = w[0], sl = (P.slant ?? 0) * kLeg;
    const wAt = (d) => (d < L0 ? lerp(w[0], w[1], d / L0) : lerp(w[1], w[2], Math.min(1, (d - L0) / L1)));
    const nF = Math.max(1, Math.round(w[2] / 0.1)) + 0.5, fph = i * 2.1 + 0.7;
    const foldFn = (u, d, ww) => {
      const s = (u - sheetOffset(ww, w0, sk)) / ww + 0.5;
      const ph = Math.PI * 2 * nF * (s + 0.05 * Math.sin(d * 9 + i * 1.9)) + fph + Math.PI;
      return 0.5 + 0.62 * (Math.sin(ph) + 0.3 * Math.sin(ph * 2.3 + 1.7)) - 0.9 * Math.max(0, 1 - d / 0.16);
    };
    const build = sheet({ len, wAt, R0, fold: [0.003, 0.03, nF, fph], foldFn, jag: 0.022, seed: 31 + i, skew: sk, w0, slant: sl, slantFrom: L0 });
    const cuts = [0, L0 * 0.5, L0, L0 + 0.45 * L1, len];
    // torn points along the hem, rigid on the last stretch
    const extra = [];
    const n = P.strips.length, R2 = R0 + 0.25 * len, wr = w[2] / Math.max(1, n);
    for (let k = 0; k < n; k++) {
      const sk01 = (k + 0.5) / n;
      const u = (sk01 - 0.5) * w[2] + sheetOffset(w[2], w0, sk), a = u / R2;
      const sw = Math.max(0.05, wr * 1.25);
      const geo = foldLines(tatterStrip(P.strips[k] * kLeg, sw, { fork: !!P.fork[k], curl: 0.25, seed: 1000 + i * 31 + k * 7 }), ribbonCrease(sw, i * 3.1 + k * 1.7));
      geo.rotateY(a).translate(Math.sin(a) * R2, -(len - cuts[3]) - sl * (sk < 0 ? 1 - sk01 : sk01) + 0.012, (Math.cos(a) - 1) * R2);
      extra.push({ mat: 'hem', geo });
    }
    strands.push({
      name: 'tail' + i, kind: 'skirt', bone: 'hips', ref: 'hips',
      at: [sa * R0, Y(h) - lm.hips, ca * R0], ry: P.az,
      out: P.flare ?? 0.3, width: w[1],
      segs: stretches(build, cuts, ['coat', 'coat', 'coat', 'hem'], ['lining', 'lining', 'lining', 'lining'], extra),
    });
  });

  // ---- the cloak (gear/shroud.js SHROUD_SHEETS): three down his back off the mantle, a drape on each arm
  SHROUD_SHEETS.forEach((D, i) => {
    const onArm = D.on !== 'chest', s = D.on === 'armR' ? -1 : 1;
    const kk = g;
    const L0 = D.len[0] * kk, L1 = D.len[1] * kk, len = L0 + L1, w = D.w.map((x) => x * (onArm ? g : B.kSh));
    const wAt = (d) => (d < L0 ? lerp(w[0], w[1], d / L0) : lerp(w[1], w[2], Math.min(1, (d - L0) / L1)));
    const nF = Math.max(1, Math.round(w[2] / 0.11)) + 0.5, ph = i * 1.9 + 0.4;
    const foldFn = (u, dd, ww) => {
      const f = Math.PI * 2 * nF * (u / ww + 0.5 + 0.05 * Math.sin(dd * 8 + i * 1.7)) + ph + Math.PI;
      return 0.5 + 0.62 * (Math.sin(f) + 0.3 * Math.sin(f * 2.3 + 1.7)) - 0.9 * Math.max(0, 1 - dd / 0.14);
    };
    const build = sheet({ len, wAt, R0: D.wrap * g, fold: [0.004, 0.04, nF, ph], foldFn, jag: 0.05, seed: D.seed + 7 });
    const cuts = [0, L0 * 0.5, L0, L0 + 0.36 * L1, len];
    const extra = [];
    const n = D.strips.length, R2 = D.wrap * g + 0.25 * len, wr = w[2] / Math.max(1, n);
    for (let k = 0; k < n; k++) {
      const u = ((k + 0.5) / n - 0.5) * w[2], a = u / R2;
      const sw = Math.max(0.06, wr * 1.2);
      const geo = foldLines(tatterStrip(D.strips[k] * kk, sw, { fork: !!D.fork[k], curl: 0.2, seed: 500 + D.seed * 13 + k * 7 }), ribbonCrease(sw, i * 2.7 + k * 1.3));
      geo.rotateY(a).translate(Math.sin(a) * R2, -(len - cuts[3]) + 0.012, (Math.cos(a) - 1) * R2);
      extra.push({ mat: 'hem', geo });
    }
    let at, bone, ry, rz = 0;
    if (onArm) {
      // the template's hanging upper-arm space -> the T-pose (armT): x' = -s y, y' = s x
      bone = 'upperArm' + (s < 0 ? 'R' : 'L');
      const [x, y, z] = D.at;
      at = [-s * y * g, s * x * g, z * g];
      ry = D.ry;
      rz = s * HALF_PI;
    } else {
      bone = 'chest';
      const h = 1.225 + D.at[1];
      at = [B.sx(D.at[0], h), Y(h) - lm.chest, B.sz(D.at[2], h)];
      ry = D.ry;
    }
    strands.push({
      name: 'cloak' + i, kind: onArm ? 'drape' : 'cloak', bone, ref: 'chest', at, ry, rz, out: D.out, width: w[1], lag: D.lag ?? 0.5, arm: onArm ? (s < 0 ? 'R' : 'L') : null,
      segs: stretches(build, cuts, ['coat', 'coat', 'coat', 'hem'], ['lining', 'lining', 'lining', 'lining'], extra),
    });
  });
  return strands;
}
