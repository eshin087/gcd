import { ellipsoidGeometry } from '../../../render/glyphGeometry.js';
import { registerItem } from '../../player/gear/index.js';
import { buildFreeHand } from '../../player/gear/hands.js';
import { panelSkirt } from '../../player/gear/sheet.js';
import {
  gridGeometry, shellGeometry, bandGeometry, boxGeometry, mergeGeometries, sub, foldLines, lerp, limb, gripFist, orient,
  orientTo, clumpGeometry, partGeometry,
} from '../../player/heroGeo.js';
import { oneLookNow, dressOf, at } from './look.js';

// Xin Yi's gear: the hero's skeleton (built by the same buildHero(U, loadout), driven by the same
// animator) in the hero's ink-line art, bare-handed as Tian Lei (no weapon: the right fist hangs on the
// sword joint; ONE_FIST). The homage is carried by the silhouette at ~40 px: a long black coat to the
// ankles whose tails split behind and fly, a high stand collar, short dark hair, small dark glasses, a
// pale face and pale hands; two small handguns in phase 2. One `one.*` item per slot:
//   one.head   short dark hair swept back (the body's hair left out), the glasses: a dark band (two
//              small lenses and a bridge) with one bright cell (a glint on his left lens)
//   one.chest  the coat's torso and its high collar (a, c: closed in phase 1, open in a V from phase 2,
//              the shirt in the V; b: buttoned to the neck, a line of bright buttons down the chest, a
//              lower band collar)
//   one.arms   the coat's sleeves to the wrist, pale hands (the right fist on the sword joint)
//   one.legs   dark trousers, black boots
//   one.coat   the coat's skirt: six panels from under the belt line to the ankles (sheet.js panelSkirt,
//              the animator's coat springs): two front panels (closed: they overlap; open: look.js turns
//              their anchors apart), two sides, two tails split by a vent behind. Waist slot
//   one.guns   a small dark handgun in each hand, one bright cell at the muzzle; phase 2 only (look.js);
//              in the weapon slot (it is what he holds, and it hangs on the sword joint)
// The options (`?oneLook=a|b|c`, look.js oneLookNow; read when his rig is built): a the Long Coat,
// b the Cassock (narrow, closed, floor-length, it barely stirs), c the Grey Coat (a's cut; look.js colours).
//
// His materials are his own instances (look.js tintOne writes the colours): `coat` / `collar` the coat,
// `lining` its inside (and the skirt's back faces), `collarIn` the collar's inner face, `shirt` the shirt
// in the open V, `pants` the trousers, `armor` the boots and the guns' bodies, `skin` the face and hands,
// `eye` the glasses' lenses, `hair` the hair, `flask` the bright cells (the glint, the muzzles, the
// Cassock's buttons). Every piece that changes with his phase is kept out of the static merge and
// registered with the phases it shows in (look.js `at`, `D.guns`, `D.fronts`, `D.panels`).

const ySp = (h) => h - 1.035; // world idle height → spine space (REST.spine)
const yCh = (h) => h - 1.225; // → chest space (REST.chest)

// ================================================================= the head
// Head space (before BODY.headScale): the scalp is the ellipsoid BODY.head (c [0, 0.154, -0.007],
// r [0.105, 0.118, 0.112]); the face looks down +Z; his left is +X.
const SC = [0, 0.154, -0.007], SR = [0.105, 0.118, 0.112];
const scalp = (az, el, k = 0.93) => [SC[0] + Math.sin(az) * Math.cos(el) * SR[0] * k, SC[1] + Math.sin(el) * SR[1] * k, SC[2] + Math.cos(az) * Math.cos(el) * SR[2] * k];
const nrm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Short dark hair, close to the head: the scalp cap, and a shell over the back and the sides of the
 *  skull down to the nape (the body's hair is left out: `hidesHair`), its front sunk inside the face. */
function hairGeometry(DIM) {
  const [sx, sy, sz] = DIM.skull;
  const back = ellipsoidGeometry(0.086, 0.098, 0.088, { widthSegs: 16, heightSegs: 10 }).translate(sx, sy + 0.012, sz - 0.026);
  return { cap: partGeometry('hair.cap'), back: sub(back, 1) };
}

/** The glasses (head space): two small dark lenses and a bridge across the eyes, thin arms back to the
 *  ears; the glint: one bright cell on the left lens. The face itself is the body's (model.js). */
function glassesGeometry(DIM) {
  const [sx, sy, sz] = DIM.skull;
  const y = sy - 0.011, z = sz + 0.096;
  const parts = [];
  for (const s of [-1, 1]) {
    // a small oval lens, a little wider than the eye, tilted to follow the face
    const lens = ellipsoidGeometry(0.025, 0.015, 0.006, { widthSegs: 10, heightSegs: 5 });
    lens.rotateY(s * 0.32).translate(sx + s * 0.035, y, z - 0.005);
    parts.push(sub(lens, s > 0 ? 1 : 0));
    // the arm from the lens's outer edge back along the side of the head
    parts.push(boxGeometry(0.006, 0.006, 0.09, sx + s * 0.068, y + 0.004, z - 0.06, 0, s * 0.12, 0));
  }
  parts.push(boxGeometry(0.022, 0.006, 0.006, sx, y + 0.004, z + 0.002));
  const glint = ellipsoidGeometry(0.011, 0.008, 0.004, { widthSegs: 6, heightSegs: 4 }).rotateY(0.32).translate(sx + 0.04, y + 0.004, z + 0.002);
  return { band: mergeGeometries(parts), glint };
}

function buildHead(ctx) {
  const { head, M, DIM, mesh } = ctx;
  const H = hairGeometry(DIM);
  mesh(head, H.cap, M.hair);
  mesh(head, H.back, M.hair);
  const G = glassesGeometry(DIM);
  mesh(head, G.band, M.eye);
  mesh(head, G.glint, M.flask);
  return {};
}

// ================================================================= the torso and the collar
/** The torso shell (BODY.shell's heights; world), grown by `d`; `gap` = the open V's half-chord. */
const SHELL = [
  { y: 1.09, rx: 0.15, rz: 0.112 },
  { y: 1.21, rx: 0.136, rz: 0.102 },
  { y: 1.3, rx: 0.16, rz: 0.112, cz: 0.008 },
  { y: 1.37, rx: 0.186, rz: 0.123, cz: 0.014 },
  { y: 1.43, rx: 0.198, rz: 0.12, cz: 0.01 },
  { y: 1.475, rx: 0.172, rz: 0.104, cz: 0.003 },
  { y: 1.505, rx: 0.094, rz: 0.076 },
];
/** The open coat's V: wide at the collar, closing at the belt line (half-chord, m). */
const V_GAP = [0.0, 0.006, 0.026, 0.05, 0.06, 0.05, 0.03];
const rings = (d, gap = null) => SHELL.map((r, i) => ({ ...r, rx: r.rx + d, rz: r.rz + d, gap: gap ? gap[i] : 0, y: ySp(r.y) }));
/** A crease down each side and across the back (the coat's seams). */
const coatSeams = (x, y, z) => 0.5 + 0.7 * Math.sin(Math.atan2(x, z) * 2 + 0.6);

/**
 * The high collar (chest space): a band standing round the neck from the collar line up beside the
 * jaw, flaring out a little at the top, open in front (`open`: its half-angle, rad). `top` its height
 * (world). Outer face `M.collar`, inner face `M.collarIn` (BackSide: the camera looks down into it).
 */
function collarGeometry(top, open, flare = 0.018, fall = 0.075) {
  const y0 = 1.485, cols = 22, rows = 3;
  return gridGeometry(cols, rows, (s, t, o) => {
    const a = open + s * (Math.PI * 2 - 2 * open);
    const h = lerp(y0, top, t);
    const rx = lerp(0.098, 0.084 + flare, t) + 0.004 * Math.sin(t * Math.PI);
    const rz = lerp(0.082, 0.078 + flare * 0.8, t);
    // its top edge falls toward the front opening (a coat collar stands tallest behind the head and
    // beside the jaw, and opens in front of the chin)
    const dip = t * fall * Math.pow(0.5 + 0.5 * Math.cos(a), 1.6);
    o[0] = Math.sin(a) * rx;
    o[1] = yCh(h - dip);
    o[2] = Math.cos(a) * rz - 0.014;
    o[3] = (a - Math.PI) * 0.09;
    o[4] = o[1];
  });
}

/** a / c: the coat's torso (closed in phase 1, open from phase 2: two shells, one shown), the shirt in
 *  the V, the high collar. */
function chestCoat(ctx) {
  const { spine, chest, M, mesh } = ctx;
  const D = dressOf(ctx.root, oneLookNow());
  const closed = mesh(spine, foldLines(shellGeometry(rings(0.012), { sub: 3, cols: 28 }), coatSeams), M.coat);
  const open = mesh(spine, foldLines(shellGeometry(rings(0.012, V_GAP), { sub: 3, cols: 28 }), coatSeams), M.coat);
  at(D, closed, 1, 1);
  at(D, open, 2, 3);
  // the shirt in the V (always built: hidden behind the closed coat in phase 1)
  mesh(spine, shellGeometry(rings(0.002), { span: 0.5, cols: 8, sub: 2 }), M.shirt);
  // the lapels' edge: a narrow facing down each side of the V (the lining turned out), phases 2 - 3
  const lap = [];
  for (const s of [-1, 1]) {
    lap.push(sub(gridGeometry(1, 6, (u, t, o) => {
      const k = Math.min(SHELL.length - 2, Math.floor(t * (SHELL.length - 1)));
      const f = t * (SHELL.length - 1) - k;
      const A = SHELL[k], B = SHELL[k + 1];
      const y = lerp(A.y, B.y, f), rx = lerp(A.rx, B.rx, f) + 0.014, rz = lerp(A.rz, B.rz, f) + 0.014, cz = lerp(A.cz ?? 0, B.cz ?? 0, f);
      const g = lerp(V_GAP[k], V_GAP[k + 1], f) + 0.004 + u * 0.016;
      const a = Math.asin(Math.min(0.95, g / rx));
      o[0] = s * Math.sin(a) * rx;
      o[1] = ySp(y);
      o[2] = Math.cos(a) * rz + cz + 0.002;
      o[3] = o[0];
      o[4] = o[1];
    }, s < 0), s > 0 ? 1 : 0));
  }
  const lapel = mesh(spine, mergeGeometries(lap), M.lining);
  at(D, lapel, 2, 3);
  // the high collar: outer and inner faces
  const cg = collarGeometry(1.625, 0.62, 0.016, 0.055);
  mesh(chest, sub(cg, 1), M.collar);
  mesh(chest, cg, M.collarIn);
  return { keep: [closed, open, lapel] };
}

/** b: the Cassock's torso, buttoned to the neck: a closed shell, a lower band collar, a line of bright
 *  buttons down the centre from the collar to the belt line. */
function chestCassock(ctx) {
  const { spine, chest, M, mesh } = ctx;
  mesh(spine, foldLines(shellGeometry(rings(0.008), { sub: 3, cols: 28 }), coatSeams), M.coat);
  const cg = collarGeometry(1.6, 0.14, 0.004, 0.03);
  mesh(chest, sub(cg, 1), M.collar);
  mesh(chest, cg, M.collarIn);
  // the buttons: on the shell's front, 1.49 m down to 1.12 m
  const bt = [];
  for (let i = 0; i < 8; i++) {
    const h = lerp(1.49, 1.12, i / 7);
    const k = Math.max(0, SHELL.findIndex((q) => q.y > h) - 1);
    const A = SHELL[k], B = SHELL[k + 1] ?? A, f = Math.min(1, Math.max(0, (h - A.y) / ((B.y - A.y) || 1)));
    const z = lerp(A.rz, B.rz, f) + lerp(A.cz ?? 0, B.cz ?? 0, f) + 0.012;
    bt.push(ellipsoidGeometry(0.012, 0.012, 0.007, { widthSegs: 6, heightSegs: 4 }).translate(0, ySp(h), z));
  }
  mesh(spine, mergeGeometries(bt), M.flask);
  return { keep: [] };
}

// ================================================================= the arms
/** The coat's sleeves to the wrist (a cuff turned back at the end), pale hands: the right fist on the
 *  sword joint, the free hand (hands.js). */
function buildArms(ctx) {
  const { arms, sword, M, DIM, BODY, mesh } = ctx;
  const [ua0, ua1] = BODY.upperArm, [fa0, fa1] = BODY.foreArm, HK = BODY.hand;
  for (const side of [-1, 1]) {
    const { upper, fore } = arms[side < 0 ? 'R' : 'L'];
    mesh(upper, mergeGeometries([
      sub(limb({ length: DIM.upperArm, r0: ua0 + 0.006, r1: ua1 + 0.008, bulge: 0.008 }), 1),
      sub(ellipsoidGeometry(BODY.deltoid[0] + 0.01, BODY.deltoid[1] + 0.004, BODY.deltoid[2] + 0.01, { widthSegs: 12, heightSegs: 8 }).translate(side * 0.008, -0.018, 0), 0),
    ]), M.coat);
    // the forearm's sleeve, a little loose, ending in a cuff just above the wrist
    const y1 = -DIM.foreArm + 0.06;
    mesh(fore, mergeGeometries([
      sub(limb({ length: 0.09, r0: ua1 + 0.008, r1: ua1 + 0.004 }), 1),
      sub(limb({ length: -y1 - 0.03, r0: fa0 + 0.01, r1: fa1 + 0.014, radial: 12, rings: 3, bulge: 0.004 }).translate(0, -0.05, 0), 0),
      sub(limb({ length: 0.035, r0: fa1 + 0.018, r1: fa1 + 0.017, radial: 12, rings: 1, capSegs: 1 }).translate(0, y1 + 0.03, 0), 1),
    ]), M.coat);
  }
  // the right fist on the sword joint; the wrist under it
  const F = gripFist(HK);
  mesh(sword, mergeGeometries([F.fingers, F.thumb, F.ridge]), M.skin);
  mesh(arms.R.fore, ellipsoidGeometry(0.032 * HK, 0.04 * HK, 0.036 * HK, { widthSegs: 10, heightSegs: 6 }), M.skin, 0, -DIM.foreArm + 0.025, 0.004);
  const free = buildFreeHand(ctx, M.skin);
  return { offHand: free.offHand, keep: free.keep };
}

// ================================================================= the legs
/** Straight dark trousers, black boots (the coat hides most of them). */
function buildLegs(ctx) {
  const { pelvis, legs, M, DIM, BODY, mesh } = ctx;
  const [hx, hy, hz] = BODY.hips.r;
  mesh(pelvis, orient.up(ellipsoidGeometry(hx + 0.008, hz + 0.008, hy + 0.01)), M.pants, ...BODY.hips.c);
  const [th0, th1] = BODY.thigh, [sh0, sh1] = BODY.shin, Ft = BODY.foot;
  const bootTop = -0.24;
  for (const side of [-1, 1]) {
    const { thigh, shin, foot } = legs[side < 0 ? 'R' : 'L'];
    mesh(thigh, limb({ length: DIM.thigh, r0: th0 + 0.01, r1: th1 + 0.012, bulge: 0.01 }), M.pants);
    mesh(shin, limb({ length: -bootTop + 0.03, r0: th1 + 0.012, r1: sh0 + 0.006, bulge: 0.006 }), M.pants);
    const t = lerp(sh0, sh1, Math.min(1, -bootTop / DIM.shin));
    mesh(shin, sub(limb({ length: DIM.shin + bootTop, r0: t + 0.01, r1: sh1 + 0.008, radial: 12, rings: 3, capSegs: 1 }).translate(0, bootTop, 0), 1), M.armor);
    mesh(foot, ellipsoidGeometry(Ft.r[0] * 0.98, Ft.r[1] * 0.92, Ft.r[2] * 0.98, { widthSegs: 10, heightSegs: 6 }).translate(Ft.c[0], Ft.c[1] - 0.003, Ft.c[2]), M.armor);
  }
  return {};
}

// ================================================================= the coat's skirt
// Panels (sheet.js panelSkirt; anim.js _coat springs them): az 0 = his front, + his left. Long: from
// the anchor at 1.135 m to about 0.14 m. `closed` / `open` = a front panel's az with the coat closed /
// thrown open (look.js turns its anchor); `tail` = a tail behind (it flares and stirs the most).
// The front panels' inner edges hang straight (skew: the width they gain goes outward), so the coat
// opens in a straight line; the tails' vent edges drift out (|skew| > 1), so the split widens to the hem.
const COAT_A = [
  { az: 0.4, open: 0.78, w: [0.17, 0.21, 0.27], len: [0.47, 0.48], skew: 1, slant: 0.03, out: 0.006, front: true },
  { az: -0.4, open: -0.78, w: [0.17, 0.21, 0.27], len: [0.47, 0.48], skew: -1, slant: 0.03, out: 0.0, front: true },
  { az: 1.62, w: [0.15, 0.2, 0.27], len: [0.47, 0.48], out: 0.003 },
  { az: -1.62, w: [0.15, 0.2, 0.27], len: [0.47, 0.48], out: 0.003 },
  { az: 2.5, w: [0.17, 0.25, 0.36], len: [0.47, 0.5], skew: -1.3, slant: 0.05, out: 0.008, tail: true },
  { az: -2.5, w: [0.17, 0.25, 0.36], len: [0.47, 0.5], skew: 1.3, slant: 0.05, out: 0.008, tail: true },
];
/** b: the Cassock's skirt: narrower, to the floor, closed in front (the front panels overlap). */
const COAT_B = [
  { az: 0.3, open: 0.3, w: [0.16, 0.18, 0.21], len: [0.49, 0.51], skew: 1, out: 0.006, front: true },
  { az: -0.3, open: -0.3, w: [0.16, 0.18, 0.21], len: [0.49, 0.51], skew: -1, out: 0.0, front: true },
  { az: 1.6, w: [0.15, 0.17, 0.2], len: [0.49, 0.51], out: 0.003 },
  { az: -1.6, w: [0.15, 0.17, 0.2], len: [0.49, 0.51], out: 0.003 },
  { az: 2.55, w: [0.17, 0.2, 0.24], len: [0.49, 0.51], skew: -1.1, out: 0.008, tail: true },
  { az: -2.55, w: [0.17, 0.2, 0.24], len: [0.49, 0.51], skew: 1.1, out: 0.008, tail: true },
];

function buildCoat(ctx) {
  const look = oneLookNow();
  const D = dressOf(ctx.root, look);
  // (fresh defs per rig: look.js writes their flare and stir, and turns the front panels)
  const defs = (look === 'b' ? COAT_B : COAT_A).map((p) => ({ ...p, strips: [], fork: [], flare: 0.06, breeze: 0, idleFlare: 0 }));
  const { coat } = panelSkirt(ctx, defs, { seed: 900 });
  // a coat of heavy cloth: one or two soft folds down each panel instead of the skirt's pleats
  // (panelSkirt's fold field, redrawn: x across the panel = aGUV x, m)
  coat.forEach((C, i) => {
    const w = C.def.w[2], ph = i * 1.7 + 0.6;
    const seen = new Set();
    for (const s of C.segs) for (const m of s.children) {
      if (!m.isMesh || seen.has(m.geometry)) continue;
      seen.add(m.geometry);
      foldLines(m.geometry, (x, y, z, u, gy) => 0.5 + 0.6 * Math.sin((u / w) * Math.PI * 2.4 + ph + gy * 1.5));
    }
  });
  coat.forEach((C) => {
    D.panels.push({ def: C.def, tail: !!C.def.tail, front: !!C.def.front });
    if (C.def.front) D.fronts.push({ C, closed: C.def.az, open: C.def.open, R: ctx.DIM });
  });
  return { coat };
}

// ================================================================= the guns
/** A small handgun: the slide and barrel along +X (the muzzle at +X), the grip down −Z from its back
 *  end, a trigger guard; the muzzle's bright cell apart. Built in the RIGHT fist's frame (the sword
 *  joint: the grip along Z through the fist, the knuckles to +X), so it sits over the index finger and
 *  points the way the knuckles do. */
function gunGeometry(HK) {
  const zTop = 0.034 * HK + 0.03; // over the index finger's roll
  const body = mergeGeometries([
    sub(boxGeometry(0.15, 0.026, 0.032, 0.035, 0, zTop), 1), // the slide
    boxGeometry(0.028, 0.024, 0.1, -0.012, 0, zTop - 0.05, 0, -0.18, 0), // the grip, raked back (inside the fist)
    boxGeometry(0.04, 0.008, 0.008, 0.03, 0, zTop - 0.03), // the trigger guard's lower bar
  ]);
  const muzzle = ellipsoidGeometry(0.012, 0.012, 0.012, { widthSegs: 6, heightSegs: 4 }).translate(0.115, 0, zTop + 0.002);
  return { body, muzzle };
}

/** One gun in each hand: the right on the sword joint (the fist), the left on the free wrist (turned so
 *  its muzzle runs down the hand, the way the fingers point: the arm aims it). */
function buildGuns(ctx) {
  const { sword, arms, M, BODY, mesh } = ctx;
  const D = dressOf(ctx.root, oneLookNow());
  const HK = BODY.hand;
  const G = gunGeometry(HK);
  const out = [];
  out.push(mesh(sword, G.body, M.armor), mesh(sword, G.muzzle, M.flask));
  // the left: wrist space (the hand hangs −Y, its front +Z, the palm toward the body −X): the gun's +X
  // (the barrel) down the hand, its grip (−Z in the fist's frame) back through the palm
  const wj = arms.L.wrist ?? arms.L.fore;
  const lb = G.body.clone(), lm = G.muzzle.clone();
  // (the fist frame's +X → −Y down the hand, Z stays: the slide on the index's side, +Z; then the grip
  // into the curled fingers)
  for (const g of [lb, lm]) g.rotateZ(-Math.PI / 2).translate(-0.01, -0.082, -0.018);
  out.push(mesh(wj, lb, M.armor), mesh(wj, lm, M.flask));
  for (const m of out) {
    m.visible = false;
    D.guns.push(m);
  }
  return { keep: out };
}

// ================================================================= the items
const CHEST = { a: chestCoat, b: chestCassock, c: chestCoat };

/** The set (registered into the hero's gear registry on import: gear/index.js registerItem). */
export const ONE_ITEMS = [
  { id: 'one.head', slot: 'head', name: 'Short Hair and Dark Glasses', hidesHair: true, build: buildHead },
  { id: 'one.chest', slot: 'chest', name: 'High Collar', build: (ctx) => CHEST[oneLookNow()](ctx) },
  { id: 'one.arms', slot: 'arms', name: 'Coat Sleeves', build: buildArms },
  { id: 'one.legs', slot: 'legs', name: 'Dark Trousers', build: buildLegs },
  { id: 'one.coat', slot: 'waist', name: 'Long Coat', build: buildCoat },
  { id: 'one.guns', slot: 'weapon', name: 'Two Handguns', build: buildGuns },
];
for (const item of ONE_ITEMS) registerItem(item);

/** What he wears. The guns sit in the weapon slot (the right one hangs on the sword joint); he fights
 *  bare-handed all the same: the fist is the blade (ONE_FIST), the guns are shown in phase 2 only. */
export const ONE_LOADOUT = Object.freeze({
  head: 'one.head',
  chest: 'one.chest',
  shoulders: null,
  arms: 'one.arms',
  legs: 'one.legs',
  waist: 'one.coat',
  back: null,
  weapon: 'one.guns',
});

/** His "blade": the right fist, as a short segment along the sword joint's +Z (duelist.js kit.blade):
 *  from the little finger's side of the fist (guard) to past the index knuckle (tip), metres. Measured
 *  on gripFist(BODY.hand 1.12) as Tian Lei's (ascendant/gear.js FIST): the same fist, bare. */
export const ONE_FIST = Object.freeze({ guard: -0.06, tip: 0.075 });
