import * as THREE from 'three';
import { ellipsoidGeometry, limbGeometry } from '../../../render/glyphGeometry.js';
import { registerItem } from '../../player/gear/index.js';
import { shellGeometry, arcPlate, boxGeometry, bandGeometry, mergeGeometries, sub, foldLines, limb, gripFist, ring } from '../../player/heroGeo.js';
import { toDragonLook } from '../ashDisciple/bodyArt.js';
import { lookOf } from '../duelist/lookSwitch.js';
import { MARSHAL_ART } from './bodyArt.js';
import { createPropArtMaterial } from '../../../render/materials.js';
import { markCaster } from '../../../render/pipeline.js';
import { prep, carve } from '../../../world/forest.js';
import { mergeGeometries as mergeBuffers } from 'three/addons/utils/BufferGeometryUtils.js';

// The Clockwork Marshal's outfit (ADR-135): gear items on the hero's skeleton, so he is built by the same
// buildHero(U, loadout) and driven by the same animator. ONE rig carries TWO bodies: every item builds
// the SUIT's parts and the PILOT's parts for its slot, each in groups of its own (a joint tagged
// `userData.mBody = 'suit' | 'pilot'`; marshal.js shows one body and hides the other). The suit's five
// plates are groups of their own too (`userData.mPlate`: breast, back, left, right, helm; a flank is the
// pauldron, the tasset and the greave of that side): marshal.js hides a plate when it is shed. Under the
// plates the frame is always built: dark iron ribs, the drum gears in the shoulders and the belts (`welt`,
// one material that glows hotter by phase).
// His own design (the owner's brief: in the spirit of an armoured-suit hero, an original wuxia figure):
// a bronze war-suit of lamellar scales under a brimmed bell helm with a curtain of scales and no face, a
// furnace like a bronze cauldron with two stub chimneys on his back, a lance with a flared fire tube
// under its blade. The pilot, Gongshu Yan: gaunt, a grey topknot, a soot-dark quilted arming coat,
// bronze dial bracers, one arm bandaged, a straight sabre, a forearm-long bronze hand-lance.
// The look options (`?marshalLook=a|b|c`, read when the rig is built; A the default) differ only in the
// head, shoulders, back and chest items and the inks (bodyArt.js). Everything is drawn through the
// wyrm's art path (toDragonLook from the first item's build); the lance and the sabre stay on today's
// material (thinner than an art cell).

/** The lance (weapon space: origin = the grip centre, +Z the point). */
export const LANCE = Object.freeze({ back: 0.85, guard: 1.7, tip: 2.3, r: 0.034, muzzle: [0, -0.075, 1.98] });
/** The pilot's sabre (weapon space) and her hand-lance (in her left fist, along the fist's +Z). */
export const SABRE = Object.freeze({ back: 0.09, guard: 0.11, tip: 1.0, r: 0.016 });
export const HAND_LANCE = Object.freeze({ len: 0.36, muzzle: 0.34 });
/** The kit's blade ends per body (marshal.js swaps them with the body). */
export const BLADES = Object.freeze({ suit: Object.freeze({ guard: LANCE.guard, tip: LANCE.tip }), pilot: Object.freeze({ guard: SABRE.guard, tip: SABRE.tip }) });

/** The look built now (`?marshalLook=`). */
export const marshalLook = () => {
  const L = lookOf('marshalLook', 'a');
  return L === 'b' || L === 'c' ? L : 'a';
};

// ---------------------------------------------------------------- helpers
/** A group joint for one body (and one plate) under `parent`. */
function group(ctx, parent, body, plate = null, x = 0, y = 0, z = 0) {
  const j = ctx.joint(parent, x, y, z);
  j.userData.mBody = body;
  if (plate) j.userData.mPlate = plate;
  j.name = `marshal:${body}${plate ? `:${plate}` : ''}`;
  return j;
}
/** Torso rings (world heights) as a joint's local rings, scaled out by k (and pushed forward by dz). */
const ringsAt = (rows, base, k = 1, dz = 0) => rows.map((r) => ({ y: r.y - base, rx: r.rx * k, rz: r.rz * k, cz: (r.cz ?? 0) * k + dz, gap: 0 }));
/** Horizontal bands every `step` m: the lamellar scale rows (and staggered verticals between them). */
const lamellar = (step = 0.045, cols = 22) => (x, y, z, u) => {
  const row = Math.floor(y / step), ph = (row & 1) * 0.5;
  const sy = (y / step) % 1, su = ((u * cols) / Math.PI + ph) % 1;
  return 0.5 + 0.55 * Math.cos(sy * Math.PI * 2) + 0.35 * Math.cos(su * Math.PI * 2);
};
/** A drum gear (a disc with teeth) facing along local ±X, radius r, `n` teeth. */
function drumGear(r, w, n = 10) {
  const parts = [ring(r, r, w * 0.5, 16).rotateZ(Math.PI / 2)];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    parts.push(boxGeometry(w * 0.9, r * 0.28, r * 0.22, 0, Math.cos(a) * (r + 0.02), Math.sin(a) * (r + 0.02), a, 0, 0));
  }
  parts.push(ring(r * 0.35, r * 0.35, w * 0.7, 10).rotateZ(Math.PI / 2));
  return mergeGeometries(parts);
}

// ---------------------------------------------------------------- head: the helm (suit) / the topknot (pilot)
/** The bell helm's profile (head space): from the curtain's hem up the bell to its knob. */
const HELM_A = [
  { y: -0.13, rx: 0.2, rz: 0.2 }, { y: -0.04, rx: 0.19, rz: 0.19 }, { y: 0.02, rx: 0.205, rz: 0.205 }, { y: 0.025, rx: 0.15, rz: 0.15 },
  { y: 0.12, rx: 0.138, rz: 0.138 }, { y: 0.22, rx: 0.118, rz: 0.118 }, { y: 0.28, rx: 0.075, rz: 0.075 }, { y: 0.305, rx: 0.02, rz: 0.02 },
];
const HELM_B = [
  { y: -0.06, rx: 0.15, rz: 0.15 }, { y: 0.03, rx: 0.16, rz: 0.16 }, { y: 0.14, rx: 0.155, rz: 0.155 }, { y: 0.22, rx: 0.12, rz: 0.12 }, { y: 0.27, rx: 0.05, rz: 0.05 }, { y: 0.285, rx: 0.01, rz: 0.01 },
];
const HELM_C = [
  { y: -0.08, rx: 0.13, rz: 0.14 }, { y: 0.06, rx: 0.135, rz: 0.15 }, { y: 0.18, rx: 0.12, rz: 0.13 }, { y: 0.26, rx: 0.08, rz: 0.09 }, { y: 0.3, rx: 0.02, rz: 0.03 },
];

function buildHead(ctx) {
  const L = marshalLook();
  toDragonLook(ctx, MARSHAL_ART[L]);
  const { head, M, mesh } = ctx;
  // ---- the suit: the iron cage of the open collar (always: the helm covers it), the pilot's small bust
  // inside it (her head and shoulders show once the helm is torn off), the helm (a plate)
  const S = group(ctx, head, 'suit');
  const cage = [bandGeometry(0.13, 0.13, 0.02, 18).translate(0, 0.0, 0), bandGeometry(0.12, 0.12, 0.02, 18).translate(0, 0.2, 0)];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    cage.push(boxGeometry(0.018, 0.21, 0.018, Math.sin(a) * 0.125, 0.1, Math.cos(a) * 0.125));
  }
  mesh(S, mergeGeometries(cage), M.spike);
  // the bust: ~0.57 x the head, low in the collar (the pilot's face and grey topknot)
  mesh(S, ellipsoidGeometry(0.05, 0.058, 0.055).translate(0, 0.09, 0.01), M.skin);
  mesh(S, ellipsoidGeometry(0.054, 0.03, 0.054).translate(0, 0.135, -0.004), M.hair);
  mesh(S, ellipsoidGeometry(0.022, 0.022, 0.022).translate(0, 0.16, -0.02), M.hair);
  mesh(S, ellipsoidGeometry(0.09, 0.03, 0.06).translate(0, 0.03, 0), M.coat);
  const H = group(ctx, head, 'suit', 'helm');
  if (L === 'b') {
    // a low domed helm with a ring of narrow slots round the eyes
    mesh(H, shellGeometry(HELM_B, { sub: 2, cols: 24 }), M.armor);
    const slots = [];
    for (let i = -3; i <= 3; i++) slots.push(boxGeometry(0.012, 0.05, 0.01, Math.sin(i * 0.22) * 0.161, 0.11, Math.cos(i * 0.22) * 0.161, 0, i * 0.22, 0));
    mesh(H, mergeGeometries(slots), M.spike);
    mesh(H, bandGeometry(0.162, 0.162, 0.02, 24).translate(0, 0.03, 0), M.bevel);
  } else if (L === 'c') {
    // a tall crested helm over an iron guardian mask with a scowl
    mesh(H, shellGeometry(HELM_C, { sub: 2, cols: 24 }), M.armor);
    mesh(H, boxGeometry(0.03, 0.2, 0.22, 0, 0.36, -0.02), M.bevel); // the crest
    mesh(H, boxGeometry(0.16, 0.14, 0.03, 0, 0.1, 0.145), M.spike); // the mask
    mesh(H, mergeGeometries([boxGeometry(0.06, 0.012, 0.01, -0.04, 0.13, 0.163, 0, 0, -0.35), boxGeometry(0.06, 0.012, 0.01, 0.04, 0.13, 0.163, 0, 0, 0.35)]), M.bevel); // the brows' scowl
  } else {
    // A: a brimmed bell, its knob on top, a curtain of scales from the brim to the shoulders, no face
    const bell = foldLines(shellGeometry(HELM_A, { sub: 3, cols: 28 }), (x, y) => (y < 0.02 ? 0.5 + 0.6 * Math.cos(y * 140) : 0.5));
    mesh(H, bell, M.armor);
    mesh(H, bandGeometry(0.208, 0.208, 0.018, 28).translate(0, 0.022, 0), M.bevel);
    mesh(H, ellipsoidGeometry(0.03, 0.03, 0.03).translate(0, 0.31, 0), M.bevel);
  }
  // ---- the pilot: a hair cap over the skull, the topknot (B: braids; C: a cloth wrap), a headband
  const P = group(ctx, head, 'pilot');
  const [sx, sy, sz] = ctx.DIM.skull;
  mesh(P, ellipsoidGeometry(0.085, 0.07, 0.092).translate(sx, sy + 0.03, sz - 0.008), M.hair);
  if (L === 'b') {
    for (const s of [-1, 1]) mesh(P, limb({ length: 0.2, r0: 0.018, r1: 0.012, radial: 6, rings: 4 }).translate(s * 0.06, sy - 0.02, sz - 0.06), M.hair);
    mesh(P, ellipsoidGeometry(0.07, 0.04, 0.03).translate(sx, sy - 0.07, sz + 0.08), M.shirt); // the cloth mask
  } else if (L === 'c') {
    mesh(P, ellipsoidGeometry(0.075, 0.05, 0.035).translate(sx, sy - 0.03, sz + 0.08), M.spike); // the half mask
    mesh(P, bandGeometry(0.09, 0.096, 0.03, 18).translate(sx, sy + 0.05, sz), M.leather);
  } else {
    mesh(P, ellipsoidGeometry(0.032, 0.032, 0.032).translate(sx, sy + 0.1, sz - 0.04), M.hair);
    mesh(P, limb({ length: 0.05, r0: 0.012, r1: 0.006, radial: 6, rings: 2 }).rotateX(Math.PI).translate(sx, sy + 0.12, sz - 0.04), M.hairTip);
    mesh(P, bandGeometry(0.088, 0.094, 0.016, 18).translate(sx, sy + 0.035, sz), M.leather);
  }
}

// ---------------------------------------------------------------- chest: the cuirass and the frame / the arming coat
function buildChest(ctx) {
  const L = marshalLook();
  const { spine, chest, M, BODY, REST, mesh } = ctx;
  const base = REST.spine, SH = BODY.shell;
  // ---- the suit: the frame (iron ribs, a gear on each side, the belly band) and the breastplate
  const S = group(ctx, spine, 'suit');
  const core = foldLines(shellGeometry(ringsAt([...SH, { y: SH[SH.length - 1].y + 0.03, rx: 0.07, rz: 0.06 }], base, 1.32), { sub: 2, cols: 24 }), (x, y) => 0.5 + 0.7 * Math.cos(y * 70));
  mesh(S, core, M.spike);
  mesh(S, bandGeometry(0.21, 0.16, 0.05, 24).translate(0, 1.11 - base, 0), M.welt); // the belt of the works
  for (const s of [-1, 1]) mesh(S, drumGear(0.07, 0.04, 9).translate(s * 0.23, 1.25 - base, 0.0), M.welt);
  const B = group(ctx, spine, 'suit', 'breast');
  const front = ringsAt(SH.slice(1), base, 1.5, 0.02);
  if (L === 'b') {
    // a squat round cuirass of smooth riveted plate
    mesh(B, shellGeometry(front.map((r) => ({ ...r, rz: r.rz * 1.15 })), { sub: 2, cols: 22, arc: [-1.35, 1.35] }), M.armor);
    const rivets = [];
    for (let i = 0; i < 9; i++) for (const y of [1.24, 1.42]) {
      const a = -1.2 + i * 0.3;
      rivets.push(ellipsoidGeometry(0.012, 0.012, 0.012).translate(Math.sin(a) * 0.29, y - base, Math.cos(a) * 0.2 + 0.03));
    }
    mesh(B, mergeGeometries(rivets), M.bevel);
  } else if (L === 'c') {
    // square bronze tiles laced with cord
    const tiles = foldLines(shellGeometry(front, { sub: 3, cols: 24, arc: [-1.3, 1.3] }), (x, y, z, u) => 0.5 + 0.6 * Math.cos(y * 110) + 0.6 * Math.cos(u * 40));
    mesh(B, tiles, M.armor);
    mesh(B, shellGeometry(front.map((r) => ({ ...r, rx: r.rx * 1.01, rz: r.rz * 1.01 })), { sub: 1, cols: 2, arc: [-0.03, 0.03] }), M.piping);
  } else {
    mesh(B, foldLines(shellGeometry(front, { sub: 4, cols: 26, arc: [-1.3, 1.3] }), lamellar()), M.armor);
  }
  mesh(B, arcPlate(1.47 - base, 1.5 - base, 0.27, 0.16, 0, 1.25, 8), M.bevel); // the collar's worn rim
  // ---- the pilot: the quilted arming coat, a belt, the high collar
  const P = group(ctx, spine, 'pilot');
  const coat = foldLines(shellGeometry(ringsAt([...SH, { y: SH[SH.length - 1].y + 0.02, rx: 0.06, rz: 0.055 }], base, 1.0), { sub: 2, cols: 22 }), (x, y, z, u) => 0.5 + 0.5 * Math.cos(y * 90) + 0.4 * Math.cos(u * 30));
  mesh(P, coat, M.coat);
  mesh(P, bandGeometry(0.155, 0.117, 0.03, 22).translate(0, 1.11 - base, 0), M.leather);
  mesh(P, bandGeometry(0.075, 0.07, 0.04, 16).translate(0, 1.52 - base, 0.002), M.collar);
  void chest;
}

// ---------------------------------------------------------------- shoulders: the pauldrons with their drum gears
function buildShoulders(ctx) {
  const L = marshalLook();
  const { arms, chest, M, mesh, DIM } = ctx;
  const F = group(ctx, chest, 'suit');
  for (const side of ['R', 'L']) {
    const s = side === 'R' ? -1 : 1;
    // the drum gear inside each shoulder (the frame: it turns with the arm's work)
    mesh(F, drumGear(0.085, 0.05, 10).translate(s * (DIM.shoulder[0] + 0.02), DIM.shoulder[1], 0), M.welt);
    const P = group(ctx, arms[side].upper, 'suit', side === 'R' ? 'right' : 'left');
    if (L === 'b') {
      mesh(P, ellipsoidGeometry(0.15, 0.11, 0.14).translate(s * 0.03, 0.02, 0), M.armor);
      mesh(P, bandGeometry(0.15, 0.14, 0.02, 18).translate(s * 0.03, -0.04, 0), M.bevel);
    } else if (L === 'c') {
      mesh(P, boxGeometry(0.2, 0.06, 0.24, s * 0.05, 0.05, 0, 0, 0, s * 0.35), M.armor);
      mesh(P, boxGeometry(0.2, 0.06, 0.24, s * 0.07, -0.03, 0, 0, 0, s * 0.55), M.armor);
      mesh(P, boxGeometry(0.21, 0.012, 0.25, s * 0.05, 0.085, 0, 0, 0, s * 0.35), M.bevel);
    } else {
      // A: three stepped lames of scale over a round cop
      mesh(P, ellipsoidGeometry(0.14, 0.11, 0.15).translate(s * 0.02, 0.03, 0), M.armor);
      for (let k = 0; k < 3; k++) mesh(P, arcPlate(-0.03 - k * 0.055, -0.08 - k * 0.055, 0.15 + k * 0.012, 0.16 + k * 0.012, s * 1.57, 1.3, 8).translate(0, 0, 0), M.armor);
      mesh(P, bandGeometry(0.152, 0.158, 0.015, 18).translate(s * 0.02, -0.045, 0), M.bevel);
    }
  }
}

// ---------------------------------------------------------------- arms: the frame's arms and gauntlets / her sleeves and hands
function buildArms(ctx) {
  const { arms, sword, M, DIM, mesh } = ctx;
  for (const side of ['R', 'L']) {
    const A = arms[side];
    // ---- the suit: thick iron arms, an elbow cop, the gauntlet's cuff
    const S1 = group(ctx, A.upper, 'suit'), S2 = group(ctx, A.fore, 'suit');
    mesh(S1, limb({ length: DIM.upperArm, r0: 0.1, r1: 0.085, radial: 10, rings: 4 }), M.spike);
    mesh(S2, limb({ length: DIM.foreArm - 0.04, r0: 0.09, r1: 0.08, radial: 10, rings: 4 }), M.spike);
    mesh(S2, ellipsoidGeometry(0.08, 0.06, 0.08).translate(0, 0.0, -0.02), M.bevel);
    mesh(S2, limb({ length: 0.13, r0: 0.105, r1: 0.11, radial: 10, rings: 2 }).translate(0, -DIM.foreArm + 0.17, 0), M.armor);
    // ---- the pilot: the coat's sleeves, the bronze dial bracers, the bandage on the left forearm
    const P1 = group(ctx, A.upper, 'pilot'), P2 = group(ctx, A.fore, 'pilot');
    mesh(P1, limb({ length: DIM.upperArm, r0: 0.058, r1: 0.05, radial: 8, rings: 3 }), M.coat);
    mesh(P2, limb({ length: DIM.foreArm - 0.05, r0: 0.05, r1: 0.042, radial: 8, rings: 3 }), M.coat);
    mesh(P2, limb({ length: 0.1, r0: 0.05, r1: 0.048, radial: 10, rings: 2 }).translate(0, -DIM.foreArm + 0.15, 0), M.facing);
    mesh(P2, ring(0.03, 0.03, 0.006, 10).rotateZ(Math.PI / 2).translate(side === 'R' ? -0.05 : 0.05, -DIM.foreArm + 0.1, 0), M.bevel); // the dial
    if (side === 'L') {
      const wraps = [];
      for (let k = 0; k < 4; k++) wraps.push(sub(bandGeometry(0.047, 0.047, 0.018, 12).translate(0, -0.05 - k * 0.032, 0).rotateZ(0.12 * (k & 1 ? 1 : -1)), k & 1));
      mesh(P2, mergeGeometries(wraps), M.hem);
    }
  }
  // the fists: the suit's gauntlet and her bare hand round the grip (the sword joint)
  const FS = gripFist(1.55), FP = gripFist(1.0);
  mesh(group(ctx, sword, 'suit'), mergeGeometries([FS.fingers, FS.thumb, FS.ridge]), M.armor);
  mesh(group(ctx, sword, 'pilot'), mergeGeometries([FP.fingers, FP.thumb, FP.ridge]), M.skin);
  // the off hands: the suit's left gauntlet closed (it holds the shaft when both hands are on it), her
  // left hand closed round the hand-lance (along the forearm's line, its mouth forward)
  const wy = -(DIM.foreArm - 0.03);
  const GL = group(ctx, arms.L.fore, 'suit', null, 0, wy, 0);
  mesh(GL, ellipsoidGeometry(0.07, 0.075, 0.08).translate(0, -0.03, 0.01), M.armor);
  const HL = group(ctx, arms.L.fore, 'pilot', null, 0, wy - 0.03, 0);
  HL.name = 'marshal:handLance';
  const FL = gripFist(1.0);
  mesh(HL, mergeGeometries([FL.fingers, FL.thumb, FL.ridge]).rotateX(-Math.PI / 2), M.skin);
  // the hand-lance: a bronze tube along the fist (its +Z after the turn: the hand's line), a flared mouth
  const tube = limbGeometry({ length: HAND_LANCE.len, r0: 0.024, r1: 0.02, radial: 8, rings: 3 }).translate(0, 0, -0.06);
  mesh(HL, tube.rotateX(Math.PI / 2), M.facing);
  mesh(HL, ring(0.032, 0.032, 0.012, 10).translate(0, -HAND_LANCE.muzzle + 0.04, 0), M.bevel);
}

// ---------------------------------------------------------------- legs
function buildLegs(ctx) {
  const { legs, pelvis, M, DIM, BODY, mesh } = ctx;
  // the suit's hips: an iron basin; hers: the trousers' seat
  mesh(group(ctx, pelvis, 'suit'), ellipsoidGeometry(0.2, 0.13, 0.16).translate(0, 0.0, -0.005), M.spike);
  mesh(group(ctx, pelvis, 'pilot'), ellipsoidGeometry(BODY.hips.r[0], BODY.hips.r[1], BODY.hips.r[2]).translate(...BODY.hips.c), M.pants);
  for (const side of ['R', 'L']) {
    const G = legs[side];
    const S1 = group(ctx, G.thigh, 'suit'), S2 = group(ctx, G.shin, 'suit'), S3 = group(ctx, G.foot, 'suit');
    mesh(S1, limb({ length: DIM.thigh, r0: 0.13, r1: 0.1, radial: 10, rings: 4 }), M.spike);
    mesh(S2, limb({ length: DIM.shin, r0: 0.1, r1: 0.085, radial: 10, rings: 4 }), M.spike);
    mesh(S2, ellipsoidGeometry(0.085, 0.075, 0.09).translate(0, 0.0, 0.03), M.bevel);
    mesh(S3, ellipsoidGeometry(0.09, 0.06, 0.18).translate(0, -0.025, 0.06), M.armor);
    // the greave (a flank plate)
    const GR = group(ctx, G.shin, 'suit', side === 'R' ? 'right' : 'left');
    mesh(GR, foldLines(arcPlate(-0.06, -DIM.shin + 0.04, 0.115, 0.1, 0, 1.1, 10), lamellar(0.05, 12)), M.armor);
    // ---- the pilot
    const P1 = group(ctx, G.thigh, 'pilot'), P2 = group(ctx, G.shin, 'pilot'), P3 = group(ctx, G.foot, 'pilot');
    mesh(P1, limb({ length: DIM.thigh, r0: BODY.thigh[0] * 0.95, r1: BODY.thigh[1], radial: 8, rings: 3 }), M.pants);
    mesh(P2, limb({ length: DIM.shin, r0: BODY.shin[0] * 0.95, r1: BODY.shin[1], radial: 8, rings: 3 }), M.pants);
    mesh(P2, limb({ length: 0.18, r0: BODY.shin[1] + 0.012, r1: BODY.shin[1] + 0.008, radial: 8, rings: 2 }).translate(0, -DIM.shin + 0.2, 0), M.leather);
    mesh(P3, ellipsoidGeometry(BODY.foot.r[0], BODY.foot.r[1], BODY.foot.r[2]).translate(...BODY.foot.c), M.leather);
  }
}

// ---------------------------------------------------------------- waist: the tassets / her coat's skirt
function buildWaist(ctx) {
  const { pelvis, M, mesh } = ctx;
  // the suit: an iron skirt of lames front and back (frame), a tasset on each hip (flank plates)
  const S = group(ctx, pelvis, 'suit');
  for (const ac of [0, Math.PI]) mesh(S, foldLines(arcPlate(-0.02, -0.26, 0.2, 0.24, ac, 0.7, 8), lamellar(0.05, 10)), M.spike);
  for (const [side, s] of [['right', -1], ['left', 1]]) {
    const T = group(ctx, pelvis, 'suit', side);
    mesh(T, foldLines(arcPlate(0.02, -0.3, 0.215, 0.27, s * 1.45, 0.6, 8), lamellar(0.045, 10)), M.armor);
    mesh(T, arcPlate(0.02, 0.0, 0.216, 0.22, s * 1.45, 0.62, 8), M.bevel);
  }
  // the pilot: the coat's quilted skirt, front and back panels
  const P = group(ctx, pelvis, 'pilot');
  for (const ac of [0.0, Math.PI, 1.4, -1.4]) mesh(P, foldLines(arcPlate(0.0, -0.36, 0.15, 0.2, ac, 0.55, 6), (x, y) => 0.5 + 0.5 * Math.cos(y * 60)), M.coat);
}

// ---------------------------------------------------------------- back: the furnace (and its door, a plate)
function buildBack(ctx) {
  const L = marshalLook();
  const { chest, M, mesh, REST } = ctx;
  const S = group(ctx, chest, 'suit');
  const y0 = 1.3 - REST.chest, zb = -0.3;
  if (L === 'b') {
    // a flywheel on the back, on an iron boss
    mesh(S, ellipsoidGeometry(0.16, 0.18, 0.1).translate(0, y0 + 0.08, zb + 0.02), M.spike);
    const wheel = drumGear(0.22, 0.05, 14).rotateY(Math.PI / 2).translate(0, y0 + 0.14, zb - 0.1);
    mesh(S, wheel, M.welt);
    mesh(S, ring(0.12, 0.12, 0.03, 12).rotateX(Math.PI / 2).translate(0, y0 + 0.14, zb - 0.05), M.flask);
  } else if (L === 'c') {
    // a square furnace box with a crest of bronze tiles
    mesh(S, boxGeometry(0.34, 0.38, 0.2, 0, y0 + 0.1, zb), M.spike);
    mesh(S, boxGeometry(0.2, 0.12, 0.02, 0, y0 + 0.06, zb - 0.105), M.flask);
    for (const s of [-1, 1]) mesh(S, boxGeometry(0.06, 0.3, 0.06, s * 0.12, y0 + 0.42, zb), M.armor);
  } else {
    // A: a bronze cauldron slung on the back, two stub chimneys, its grate glowing
    const pot = shellGeometry([{ y: -0.12, rx: 0.08, rz: 0.06 }, { y: -0.05, rx: 0.17, rz: 0.13 }, { y: 0.1, rx: 0.2, rz: 0.15 }, { y: 0.22, rx: 0.17, rz: 0.13 }, { y: 0.26, rx: 0.19, rz: 0.145 }], { sub: 2, cols: 20 });
    mesh(S, pot.translate(0, y0, zb), M.spike);
    mesh(S, bandGeometry(0.2, 0.15, 0.025, 20).translate(0, y0 + 0.26, zb), M.bevel);
    for (const s of [-1, 1]) {
      const st = shellGeometry([{ y: 0, rx: 0.045, rz: 0.045 }, { y: 0.22, rx: 0.04, rz: 0.04 }, { y: 0.24, rx: 0.055, rz: 0.055 }, { y: 0.27, rx: 0.05, rz: 0.05 }], { sub: 1, cols: 10 });
      mesh(S, st.translate(s * 0.1, y0 + 0.24, zb - 0.02), M.spike);
    }
    mesh(S, arcPlate(y0 - 0.04, y0 + 0.16, 0.2, 0.2, Math.PI, 0.55, 8).translate(0, 0, zb), M.flask);
  }
  // the furnace door: a plate over the grate (the back plate)
  const D = group(ctx, chest, 'suit', 'back');
  mesh(D, foldLines(arcPlate(y0 - 0.08, y0 + 0.2, 0.215, 0.215, Math.PI, 0.7, 10).translate(0, 0, zb), lamellar(0.05, 12)), M.armor);
  mesh(D, arcPlate(y0 + 0.2, y0 + 0.22, 0.217, 0.217, Math.PI, 0.72, 10).translate(0, 0, zb), M.bevel);
}

// ---------------------------------------------------------------- weapon: the lance (suit) / the sabre (pilot)
function buildWeapon(ctx) {
  const { sword, M, mesh } = ctx;
  const S = group(ctx, sword, 'suit');
  S.name = 'marshal:lance';
  const W = LANCE;
  mesh(S, limbGeometry({ length: W.guard + W.back, r0: W.r * 1.2, r1: W.r, radial: 8, rings: 6 }).translate(0, 0, -W.back), M.trim);
  // the blade: long, leaf-shaped, flat across ±Y
  mesh(S, limbGeometry({ length: W.tip - W.guard, r0: 0.07, r1: 0.006, radial: 8, rings: 5, sy: 0.3, bulge: 0.02 }).translate(0, 0, W.guard), M.trim);
  // the socket and the flared fire tube under the blade
  mesh(S, limbGeometry({ length: 0.12, r0: 0.05, r1: 0.045, radial: 8, rings: 2 }).translate(0, 0, W.guard - 0.1), M.armor);
  mesh(S, limbGeometry({ length: 0.42, r0: 0.032, r1: 0.05, radial: 8, rings: 3 }).translate(0, W.muzzle[1], W.muzzle[2] - 0.43), M.armor);
  mesh(S, ring(0.055, 0.055, 0.012, 10).rotateX(Math.PI / 2).translate(0, W.muzzle[1], W.muzzle[2]), M.flask);
  const P = group(ctx, sword, 'pilot');
  P.name = 'marshal:sabre';
  const B = SABRE;
  mesh(P, limbGeometry({ length: B.guard + B.back, r0: 0.017, r1: 0.016, radial: 7, rings: 2 }).translate(0, 0, -B.back), M.leather);
  mesh(P, boxGeometry(0.1, 0.02, 0.02, 0, 0, B.guard - 0.01), M.facing);
  mesh(P, limbGeometry({ length: B.tip - B.guard, r0: B.r * 1.4, r1: B.r * 0.4, radial: 6, rings: 6, sy: 0.35 }).translate(0, 0, B.guard), M.trim);
}

/** The set (registered on import: gear/index.js registerItem). */
export const MARSHAL_ITEMS = [
  // (hair: none from the body; the pilot's own topknot is built here. The face is the body's: marshal.js
  // hides it with the suit)
  { id: 'marshal.helm', slot: 'head', name: 'Bell Helm', hidesHair: true, build: buildHead },
  { id: 'marshal.cuirass', slot: 'chest', name: 'Lamellar Cuirass', build: buildChest },
  { id: 'marshal.pauldrons', slot: 'shoulders', name: 'Drum Pauldrons', build: buildShoulders },
  { id: 'marshal.arms', slot: 'arms', name: 'War Gauntlets', build: buildArms },
  { id: 'marshal.legs', slot: 'legs', name: 'Iron Greaves', build: buildLegs },
  { id: 'marshal.tassets', slot: 'waist', name: 'Tassets', build: buildWaist },
  { id: 'marshal.furnace', slot: 'back', name: 'Cauldron Furnace', build: buildBack },
  { id: 'marshal.lance', slot: 'weapon', name: 'Fire Lance', dims: { gripBack: LANCE.back, guard: LANCE.guard, gem: 0.2, forte: LANCE.guard, bladeTip: LANCE.tip }, build: buildWeapon },
];
for (const item of MARSHAL_ITEMS) registerItem(item);

/** What the Clockwork Marshal wears (both bodies in every slot). */
export const MARSHAL_LOADOUT = Object.freeze({
  head: 'marshal.helm', chest: 'marshal.cuirass', shoulders: 'marshal.pauldrons', arms: 'marshal.arms',
  legs: 'marshal.legs', waist: 'marshal.tassets', back: 'marshal.furnace', weapon: 'marshal.lance',
});

// ---------------------------------------------------------------- the husk (the hand-over)
/**
 * The empty suit left kneeling where it broke (marshal.js enterPhase(4)): a static shell on one knee,
 * its helm bowed, the furnace on its back with the hatch thrown open (the fx keeps a small fire burning in
 * it: marshal.js afterPose). World scale (the suit's 1.75 x), built once; drawn through the PROP art path
 * (off the body it is a background object, ADR-100); no collider. Hidden until the hand-over and on reset.
 */
export function buildHusk(U) {
  const parts = [];
  const add = (g, col, rx = 0, ry = 0, rz = 0, x = 0, y = 0, z = 0) => {
    const p = prep(g);
    p.rotateX(rx);
    p.rotateY(ry);
    p.rotateZ(rz);
    p.translate(x, y, z);
    carve(p, { col, ao: (px, py) => 0.55 + 0.45 * Math.min(1, py / 2), moss: 0.02, edge: (px, py, pz, nx, ny) => (Math.abs(ny) < 0.25 ? 0.6 : 0) });
    parts.push(p);
  };
  const BR = [0.16, 0.2, 0.15], IRON = [0.07, 0.07, 0.078], EDGE = [0.36, 0.34, 0.24];
  // the kneeling legs: the right knee down, the left foot planted forward
  add(new THREE.CylinderGeometry(0.2, 0.17, 0.75, 8), IRON, 1.2, 0, 0, -0.2, 0.75, 0.15);
  add(new THREE.CylinderGeometry(0.17, 0.15, 0.72, 8), IRON, -0.15, 0, 0, -0.2, 0.32, -0.25);
  add(new THREE.CylinderGeometry(0.2, 0.17, 0.75, 8), IRON, 0.5, 0, 0, 0.22, 0.85, 0.3);
  add(new THREE.CylinderGeometry(0.17, 0.15, 0.75, 8), IRON, 0, 0, 0, 0.22, 0.38, 0.55);
  // the hips and the torso, bent forward
  add(new THREE.SphereGeometry(0.36, 10, 7), IRON, 0, 0, 0, 0, 1.05, 0);
  add(new THREE.CylinderGeometry(0.5, 0.38, 1.05, 10), BR, 0.32, 0, 0, 0, 1.62, 0.16);
  add(new THREE.CylinderGeometry(0.52, 0.52, 0.06, 10), EDGE, 0.32, 0, 0, 0, 2.1, 0.32);
  // the pauldrons and the hanging arms
  for (const s of [-1, 1]) {
    add(new THREE.SphereGeometry(0.27, 9, 6), BR, 0, 0, 0, s * 0.56, 2.05, 0.3);
    add(new THREE.CylinderGeometry(0.15, 0.13, 0.95, 8), IRON, 0.25, 0, s * 0.1, s * 0.62, 1.5, 0.45);
  }
  // the bell helm, bowed onto its chest, a curtain of scales
  add(new THREE.CylinderGeometry(0.2, 0.36, 0.5, 12), BR, 0.6, 0, 0, 0, 2.28, 0.6);
  add(new THREE.CylinderGeometry(0.37, 0.37, 0.05, 12), EDGE, 0.6, 0, 0, 0, 2.18, 0.55);
  // the cauldron furnace on its back, the hatch thrown open above it
  add(new THREE.SphereGeometry(0.42, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.7), IRON, Math.PI, 0, 0, 0, 1.95, -0.55);
  add(new THREE.CylinderGeometry(0.4, 0.42, 0.08, 10), EDGE, 0, 0, 0, 0, 2.05, -0.55);
  add(new THREE.BoxGeometry(0.7, 0.06, 0.55), BR, -1.1, 0, 0, 0, 2.35, -0.95);
  for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.08, 0.09, 0.45, 8), IRON, 0, 0, 0, s * 0.2, 2.35, -0.6);
  // the lance, planted and leaning
  add(new THREE.CylinderGeometry(0.05, 0.05, 4.4, 6), IRON, 0.12, 0, -0.18, 0.95, 2.1, 0.6);
  const mesh = new THREE.Mesh(mergeBuffers(parts), createPropArtMaterial(U, { fadeNearPlayer: true }));
  mesh.name = 'marshalHusk';
  const g = new THREE.Group();
  g.name = 'marshalHusk';
  g.add(mesh);
  markCaster(g);
  return g;
}
