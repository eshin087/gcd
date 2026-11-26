import { ellipsoidGeometry } from '../../../render/glyphGeometry.js';
import { registerItem } from '../../player/gear/index.js';
import { buildFreeHand } from '../../player/gear/hands.js';
import { panelSkirt } from '../../player/gear/sheet.js';
import {
  gridGeometry, shellGeometry, bandGeometry, mergeGeometries, sub, foldLines, lerp, limb, gripFist, orient, orientTo, clumpGeometry,
  partGeometry,
} from '../../player/heroGeo.js';
import { wjLookNow, wjHairNow, dressOf, at } from './look.js';

// Bai Wuji's gear: the hero's skeleton (buildHero(U, loadout), the same animator) in the hero's
// INK-LINE art, printed the hero's way (bossPrint, ADR-194: lit letter cloth, the pale hem below the
// knee), bare-handed (no weapon: the right fist hangs on the sword joint, WJ_FIST). At ~40 px tall the
// homage is the SILHOUETTE: white hair standing up over a dark band across the eyes, a tall lean man in
// a dark coat with a high stand collar, hands in his pockets, long dark legs. No emblem, no letter, no
// sign on him anywhere (ADR-160's line on the homage).
//
// One `wj.*` item per slot:
//   wj.head    the hair (white: up in phase 1, fallen from phase 2: `?wjHair=a|b` two shapes, each with
//              its fallen version), the band (over the eyes in phase 1, round the neck from phase 2), the
//              eyes (two points of ice-blue light, phases 2 - 3)
//   wj.coat    the coat's torso and its high stand collar (chest slot)
//   wj.arms    the coat's slim sleeves to the wrist, bare hands (the right fist on the sword joint)
//   wj.legs    slim dark trousers, dark shoes
//   wj.skirt   the coat's skirt: six panels from the waist (sheet.js panelSkirt, the animator's coat
//              springs): two front panels closed (they part a little in phase 3), two sides, two back
//              panels split by a vent. Knee length (a, c) or to the ankle (b: the robe). Waist slot
// The outfits (`?wjLook=a|b|c`, look.js; read when his rig is built): a the black coat and black band,
// b a long indigo-black robe with a crossed front and a white cloth band, c a bone-white coat with a
// dark collar and a dark band. Same body and hair in all three.
//
// His materials are his own instances (look.js tintUntouched writes the colours): `coat` / `collar` the
// coat (part 6), `lining` its inside (4), `pants` the trousers (5), `armor` the shoes (12: no pale hem),
// `skin` the face and hands (1), `hair` / `hairTip` the white hair (11: look.js writes its ink white),
// `eye` the dark band (2: keeps its own dark fill under the boss print), `facing` the white band of b
// (7), `leather` b's sash (10), `flask` the eyes' light (19). Every piece that changes with his phase
// is kept out of the static merge and registered with the phases it shows in (look.js `at`).
//
// BODY POINTS (head space, before BODY.headScale; look.js eyePoint / handPoint read the rig):
//   the eyes at (+-0.033, 0.128, 0.104), the band's middle at y 0.131 (phase 1), the hair's top at about
//   y 0.43 (`?wjHair=a`, up) / 0.3 (fallen)

//
// THE BODY CONTRACT (what the rules, the fx and the moves read; kept from wave 0, names unchanged):
//   gear.js   WJ_LOADOUT   the loadout (player/gear slots → item ids; weapon null: bare-handed)
//             WJ_FIST      his "blade": { guard, tip } along the sword joint's +Z (the right fist)
//   look.js   tintUntouched(M)          his colours, once after the rig is built (the kit's _tint)
//             dressUntouched(d, dt)     every frame (the kit's dress): reads d.dressPhase and d.eyesK
//             eyePoint(d, out)          his eyes as drawn (world; out a Vector3; finite even with no rig)
//             handPoint(d, side, out)   his right ('R') / left ('L') hand as drawn (world)
//             wjLettersOn()             his letters follow his size as the hero's (the kit's `letters`)
//             WJ_LOOKS, wjLook(name)    his look switches (`?wj...=`: duelist/lookSwitch.js lookOf)
//   poses.js  WJ_POSES ({ loco, duel }), GUARD, compileClip, completeBeat, CLIPS / REACT / OPEN (merged
//             with the three moves' pose files: poses.js header); FRAGS (STAND, KNEEL, UNVEIL, SIGN,
//             POCKETS ...: poses.js lists them)
//   the actor (untouched.js) carries:
//             d.dressPhase   1 | 2 | 3: the dress shown (core sets it at a transition's impact: 2 = the
//                            band off the eyes and the hair down; 3 = the void)
//             d.eyesK        0..1 how far his eyes burn (0 behind the band; the moves and the
//                            transition set it; look.js / fx.js draw it)
//             d.eyePoint(out), d.handPoint(side, out)   the same points through the actor

const ySp = (h) => h - 1.035; // world idle height → spine space (REST.spine)
const yCh = (h) => h - 1.225; // → chest space (REST.chest)

// ================================================================= the head: hair, band, eyes
// Head space: the scalp is the ellipsoid BODY.head (c [0, 0.154, -0.007], r [0.105, 0.118, 0.112]);
// the face looks down +Z; his left is +X.
const SC = [0, 0.154, -0.007], SR = [0.105, 0.118, 0.112];
const scalp = (az, el, k = 0.94) => [SC[0] + Math.sin(az) * Math.cos(el) * SR[0] * k, SC[1] + Math.sin(el) * SR[1] * k, SC[2] + Math.cos(az) * Math.cos(el) * SR[2] * k];
const outAt = (az, el) => [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
const nrm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const mix3 = (...terms) => nrm(terms.reduce((s, [v, k]) => [s[0] + v[0] * k, s[1] + v[1] * k, s[2] + v[2] * k], [0, 0, 0]));
const UP = [0, 1, 0], BACK = [0, 0, -1], DOWN = [0, -1, 0], FWD = [0, 0, 1], LEFT = [1, 0, 0];

/** A head of locks → { mass, tips }: each lock a flattened clump from `at` along `dir`, its tip
 *  curling toward `bend`; the root 45 % in the mass material, the rest in the tips'. */
function lockGeometry(locks) {
  const mass = [], tips = [];
  locks.forEach((l, k) => {
    const th = l.th ?? l.w * 0.5;
    for (const [t0, t1, out] of [[0, 0.45, mass], [0.45, 1, tips]]) {
      const g = clumpGeometry(l.L, l.w, th, { t0, t1, curl: l.curl ?? 0.15, taper: l.taper ?? 0.8, cols: 6, rows: 2 });
      out.push(sub(orientTo(g, l.at, l.dir, l.bend ?? BACK), k & 1));
    }
  });
  return { mass: mergeGeometries(mass), tips: mergeGeometries(tips) };
}
/** A list of locks on his left, mirrored to his right too. */
const both = (list) => list.flatMap((l) => [l, { ...l, at: [-l.at[0], l.at[1], l.at[2]], dir: [-l.dir[0], l.dir[1], l.dir[2]], bend: l.bend ? [-l.bend[0], l.bend[1], l.bend[2]] : undefined }]);
/** A lock rooted on the scalp at (az, el) (az 0 = his front, + his left), pointing along a mix of the
 *  scalp's outward (o), up (u; < 0 down), back (b), his left (s) and forward (f). */
const lock = (az, el, { o = 0, u = 0, b = 0, s = 0, f = 0 }, L, w, opt = {}) => ({
  at: scalp(az, el), dir: mix3([outAt(az, el), o], [UP, u], [BACK, b], [LEFT, s], [FWD, f]), L, w, th: w * 0.6, curl: 0.05, taper: 1.1, ...opt,
});

// --- the hair UP (phase 1): white, standing up out of the band
// a  a tall swept crown: broad blades rising from the whole scalp above the band, the front swept up
//    and back, the sides out and up, the tallest at the crown: one white flame shape above the band
function hairUpA() {
  const sharp = { taper: 1.25, curl: 0.06, bend: mix3([UP, 1], [BACK, 0.3]) };
  const one = [
    lock(0.22, 0.62, { u: 1, b: 0.08, s: 0.1, f: 0.12 }, 0.27, 0.088, sharp),
    lock(0.62, 0.55, { u: 1, s: 0.38, b: 0.06, o: 0.2 }, 0.26, 0.086, sharp),
    lock(1.08, 0.45, { u: 1, s: 0.55, b: 0.1 }, 0.24, 0.084, { ...sharp, bend: [0.3, 0.5, -0.6] }),
    lock(1.55, 0.38, { u: 0.9, s: 0.68, b: 0.2 }, 0.21, 0.08, { ...sharp, bend: [0.4, 0.5, -0.6] }),
    lock(2.05, 0.42, { u: 0.9, s: 0.45, b: 0.4 }, 0.2, 0.08, sharp),
    lock(2.6, 0.5, { u: 0.9, s: 0.18, b: 0.5 }, 0.2, 0.08, sharp),
    lock(0.42, 1.05, { u: 1, s: 0.15, b: 0.1 }, 0.32, 0.09, sharp),
    lock(1.3, 0.95, { u: 1, s: 0.32, b: 0.15 }, 0.29, 0.086, sharp),
    lock(2.3, 0.95, { u: 1, s: 0.18, b: 0.3 }, 0.26, 0.084, sharp),
  ];
  return [
    ...both(one),
    lock(0, 0.75, { u: 1, b: 0.05, f: 0.15 }, 0.3, 0.092, sharp),
    lock(0, 1.3, { u: 1, b: 0.08 }, 0.35, 0.095, sharp),
    lock(Math.PI, 0.75, { u: 0.9, b: 0.5 }, 0.24, 0.084, sharp),
    lock(Math.PI, 0.3, { u: 0.6, b: 0.9 }, 0.16, 0.078, sharp),
  ];
}
// b  a shorter, spikier burst: more and thinner spikes, standing out from the head on every side
//    (about two thirds of a's height), sharp-pointed
function hairUpB() {
  const sharp = { taper: 1.45, curl: 0.03, bend: mix3([UP, 1], [BACK, 0.4]) };
  const one = [];
  const rows = [[0.55, [0.2, 0.75, 1.3, 1.85, 2.4, 2.9], 0.18, { u: 0.9, o: 0.75, b: 0.1 }], [1.05, [0.35, 1.1, 1.9, 2.65], 0.2, { u: 1, o: 0.45, b: 0.12 }]];
  for (const [el, azs, L, d] of rows) for (const az of azs) one.push(lock(az, el, d, L, 0.06, sharp));
  return [
    ...both(one),
    lock(0, 0.7, { u: 0.9, o: 0.5, f: 0.15 }, 0.2, 0.066, sharp),
    lock(0, 1.35, { u: 1, b: 0.1 }, 0.22, 0.068, sharp),
    lock(Math.PI, 0.65, { u: 0.7, o: 0.6, b: 0.4 }, 0.17, 0.062, sharp),
  ];
}

// --- the hair FALLEN (phases 2 - 3): the same white hair down, soft, lower and rounder in outline: a
// fringe over the brow (it stops above the eyes), the sides over the ears, the back to the nape
/** A lock that HANGS from the scalp at (az, el): straight down (`f` forward, `o` out from the head),
 *  its tip curling down and a little out: hair lying as it grows, never standing off the head. */
const hang = (az, el, L, w, { o = 0.12, f = 0, curl = 0.16, taper = 0.85, k = 0.97 } = {}) => ({
  at: scalp(az, el, k), dir: mix3([DOWN, 1], [outAt(az, 0), o], [FWD, f]), L, w, th: w * 0.45, curl, taper, bend: mix3([DOWN, 0.6], [outAt(az, 0), 0.8]),
});
// a  long and soft: the fringe in loose locks to the brows (one longer between the eyes), the sides
//    over the ears to the jaw, the back to the nape
function hairDownA() {
  const one = [
    hang(0.2, 0.58, 0.09, 0.06, { f: 0.3, o: 0 }),
    hang(0.55, 0.52, 0.1, 0.06, { f: 0.2, o: 0.08 }),
    hang(0.95, 0.45, 0.13, 0.062, { o: 0.1 }),
    hang(1.35, 0.38, 0.16, 0.064, { o: 0.1 }),
    hang(1.8, 0.38, 0.16, 0.066, { o: 0.08 }),
    hang(2.3, 0.4, 0.17, 0.068, { o: 0.06 }),
    hang(2.8, 0.42, 0.17, 0.068, { o: 0.05 }),
    // layers from higher on the head, through the skull: they show where they leave it (no brim)
    hang(0.6, 0.85, 0.2, 0.07, { o: 0.02, f: 0.1 }),
    hang(1.5, 0.8, 0.22, 0.07, { o: 0.02 }),
    hang(2.5, 0.8, 0.22, 0.07, { o: 0.02 }),
  ];
  return [...both(one), hang(0, 0.6, 0.12, 0.05, { f: 0.35, o: 0 }), hang(Math.PI, 0.42, 0.17, 0.07, { o: 0.05 }), hang(Math.PI, 0.85, 0.22, 0.07, { o: 0.02 })];
}
// b  shorter and choppier: a ragged fringe to the brow, the ears half showing, sharp tips
function hairDownB() {
  const c = { curl: 0.08, taper: 1.3 };
  const one = [
    hang(0.18, 0.6, 0.075, 0.052, { ...c, f: 0.35, o: 0 }),
    hang(0.5, 0.55, 0.08, 0.052, { ...c, f: 0.25, o: 0.1 }),
    hang(0.9, 0.48, 0.1, 0.054, { ...c, o: 0.16 }),
    hang(1.3, 0.45, 0.1, 0.056, { ...c, o: 0.16 }),
    hang(1.75, 0.45, 0.11, 0.058, { ...c, o: 0.14 }),
    hang(2.25, 0.48, 0.12, 0.06, { ...c, o: 0.12 }),
    hang(2.75, 0.5, 0.12, 0.06, { ...c, o: 0.1 }),
    hang(0.7, 0.85, 0.17, 0.062, { ...c, o: 0.04, f: 0.1 }),
    hang(1.7, 0.8, 0.18, 0.062, { ...c, o: 0.04 }),
  ];
  return [...both(one), hang(0, 0.62, 0.08, 0.05, { ...c, f: 0.4, o: 0 }), hang(Math.PI, 0.5, 0.13, 0.062, { ...c, o: 0.1 }), hang(Math.PI, 0.85, 0.18, 0.062, { ...c, o: 0.04 })];
}
const HAIR_UP = { a: hairUpA, b: hairUpB };
const HAIR_DOWN = { a: hairDownA, b: hairDownB };

/**
 * The band over his eyes (head space): a strip round the head, its middle at height `y`, `h` tall,
 * a little off the face in front and off the skull behind, rising toward the back of the head (a band
 * tied tight round it). The front face outward.
 */
function headBand(y = 0.131, h = 0.058, rise = 0.02) {
  return gridGeometry(32, 2, (s, t, o) => {
    const a = (s - 0.5) * Math.PI * 2; // 0 = his front
    const back = 0.5 - 0.5 * Math.cos(a); // 0 in front ... 1 behind
    const yy = y + (t - 0.5) * h * (1 - 0.15 * back) + rise * back;
    // the cranium's ellipse at this height (the hair cap's), a cm off; the face in front is under it
    const k = Math.sqrt(Math.max(0.2, 1 - ((yy - SC[1]) / SR[1]) ** 2));
    o[0] = Math.sin(a) * (SR[0] * k + 0.012);
    o[1] = yy;
    o[2] = SC[2] + Math.cos(a) * (SR[2] * k + 0.016);
    o[3] = a * 0.11;
    o[4] = yy;
  });
}
/** The band pulled down (chest space): a loose loop resting on the collar's top, sagging in front. */
function neckBand(top = 1.62) {
  return gridGeometry(28, 2, (s, t, o) => {
    const a = (s - 0.5) * Math.PI * 2;
    const front = 0.5 + 0.5 * Math.cos(a);
    const yy = top - 0.02 - 0.035 * front * front + (t - 0.5) * 0.04;
    o[0] = Math.sin(a) * (0.104 + 0.012 * front);
    o[1] = yCh(yy);
    o[2] = Math.cos(a) * (0.094 + 0.016 * front) - 0.012;
    o[3] = a * 0.11;
    o[4] = o[1];
  });
}

function buildHead(ctx) {
  const { head, chest, M, mesh } = ctx;
  const look = wjLookNow(), hair = wjHairNow();
  const D = dressOf(ctx.root, look);
  const keep = [];
  const put = (parent, g, m, from, to) => {
    const x = mesh(parent, g, m);
    at(D, x, from, to);
    keep.push(x);
    return x;
  };
  // the scalp: white in every phase (the hair cap)
  mesh(head, partGeometry('hair.cap'), M.hair);
  // the hair up (phase 1), the hair fallen (phases 2 - 3)
  const up = lockGeometry(HAIR_UP[hair]()), down = lockGeometry(HAIR_DOWN[hair]());
  put(head, up.mass, M.hair, 1, 1);
  put(head, up.tips, M.hairTip, 1, 1);
  put(head, down.mass, M.hair, 2, 3);
  put(head, down.tips, M.hairTip, 2, 3);
  // the band: over the eyes (phase 1), down round his neck on the collar (phases 2 - 3); a dark band
  // (the `eye` part: it keeps its own dark fill under the boss print) or b's white cloth (`facing`)
  const bandMat = look === 'b' ? M.facing : M.eye;
  put(head, sub(headBand(), 0), bandMat, 1, 1);
  put(chest, sub(neckBand(look === 'b' ? 1.6 : 1.625), 1), bandMat, 2, 3);
  // the eyes: two points of ice-blue light (the `flask` part glows; look.js dressUntouched), shown when
  // the band comes off
  // (one mesh each, centred on its eye: look.js grows them with the camera's distance, so at the game
  // camera each still fills a letter cell)
  for (const ex of [0.033, -0.033]) {
    const e = put(head, ellipsoidGeometry(0.025, 0.013, 0.007, { widthSegs: 8, heightSegs: 4 }), M.flask, 2, 3);
    e.position.set(ex, 0.128, 0.104);
    D.eyes.push(e);
  }
  return { keep };
}

// ================================================================= the coat's torso and its collar
/** The torso shell (world idle heights), leaner than the hero's: a narrower chest and waist. */
const SHELL = [
  { y: 1.09, rx: 0.138, rz: 0.104 },
  { y: 1.21, rx: 0.126, rz: 0.096 },
  { y: 1.3, rx: 0.148, rz: 0.104, cz: 0.006 },
  { y: 1.37, rx: 0.174, rz: 0.114, cz: 0.01 },
  { y: 1.43, rx: 0.188, rz: 0.112, cz: 0.008 },
  { y: 1.475, rx: 0.166, rz: 0.1, cz: 0.003 },
  { y: 1.505, rx: 0.094, rz: 0.076 },
];
const rings = (d) => SHELL.map((r) => ({ ...r, rx: r.rx + d, rz: r.rz + d, gap: 0, y: ySp(r.y) }));
/** The coat's seams: down each side and a closed front edge down the middle. */
const coatSeams = (x, y, z) => (z > 0.04 ? 0.5 + 9 * Math.abs(x) - 0.55 : 0.5 + 0.7 * Math.sin(Math.atan2(x, z) * 2 + 0.6));
/** b: the robe's crossed front (the left lapel over the right, down to the waist). */
const crossFold = (x, y, z) => (z > 0 ? 0.5 + 10 * (x - 0.02 + (ySp(1.5) - y) * 0.55) : 0.5);

/**
 * The high stand collar (chest space): a band standing round the neck from the collar line up beside
 * the jaw, open in front by `open` (half-angle, rad), `top` its height (world). Both faces the coat's
 * cloth (`flip` the inner one).
 */
function collarGeometry(top, open, flare = 0.012, fall = 0.03, flip = false) {
  const y0 = 1.485;
  return gridGeometry(22, 3, (s, t, o) => {
    const a = open + s * (Math.PI * 2 - 2 * open);
    const h = lerp(y0, top, t);
    const rx = lerp(0.098, 0.086 + flare, t) + 0.004 * Math.sin(t * Math.PI);
    const rz = lerp(0.082, 0.08 + flare * 0.8, t);
    const dip = t * fall * Math.pow(0.5 + 0.5 * Math.cos(a), 1.6);
    o[0] = Math.sin(a) * rx;
    o[1] = yCh(h - dip);
    o[2] = Math.cos(a) * rz - 0.012;
    o[3] = (a - Math.PI) * 0.09;
    o[4] = o[1];
  }, flip);
}

function buildChest(ctx) {
  const { spine, chest, M, mesh } = ctx;
  const look = wjLookNow();
  mesh(spine, foldLines(shellGeometry(rings(0.01), { sub: 3, cols: 28 }), look === 'b' ? crossFold : coatSeams), M.coat);
  // the high stand collar to the jaw, nearly closed in front (c: a dark collar on the pale coat)
  const args = look === 'b' ? [1.6, 0.34, 0.01, 0.06] : [1.63, 0.2, 0.012, 0.03];
  mesh(chest, sub(collarGeometry(...args), 0), M.collar);
  mesh(chest, sub(collarGeometry(args[0], args[1], args[2], args[3], true), 0), M.collar);
  if (look === 'b') {
    // the robe's sash: a dark cloth band at the waist
    mesh(spine, sub(bandGeometry(SHELL[0].rx + 0.02, SHELL[0].rz + 0.02, 0.07, 28).translate(0, ySp(1.1), 0.002), 1), M.leather);
  }
  return { keep: [] };
}

// ================================================================= the arms
/** The coat's slim sleeves to the wrist, bare hands: the right fist on the sword joint, the free hand. */
function buildArms(ctx) {
  const { arms, sword, M, DIM, BODY, mesh } = ctx;
  const [ua0, ua1] = BODY.upperArm, [fa0, fa1] = BODY.foreArm, HK = BODY.hand;
  const look = wjLookNow();
  for (const side of [-1, 1]) {
    const { upper, fore } = arms[side < 0 ? 'R' : 'L'];
    mesh(upper, mergeGeometries([
      sub(limb({ length: DIM.upperArm, r0: ua0 - 0.002, r1: ua1 + 0.002, bulge: 0.006 }), 1),
      sub(ellipsoidGeometry(BODY.deltoid[0] - 0.002, BODY.deltoid[1], BODY.deltoid[2] - 0.002, { widthSegs: 12, heightSegs: 8 }).translate(side * 0.006, -0.018, 0), 0),
    ]), M.coat);
    // the forearm's sleeve, ending in a plain cuff above the wrist (b: a wider robe sleeve)
    const y1 = -DIM.foreArm + 0.06, wide = look === 'b' ? 0.014 : 0;
    mesh(fore, mergeGeometries([
      sub(limb({ length: 0.09, r0: ua1 + 0.002, r1: ua1 - 0.002 }), 1),
      sub(limb({ length: -y1 - 0.03, r0: fa0 + 0.004, r1: fa1 + 0.008 + wide, radial: 12, rings: 3, bulge: 0.003 }).translate(0, -0.05, 0), 0),
      sub(limb({ length: 0.03, r0: fa1 + 0.012 + wide, r1: fa1 + 0.011 + wide, radial: 12, rings: 1, capSegs: 1 }).translate(0, y1 + 0.03, 0), 1),
    ]), M.coat);
  }
  const F = gripFist(HK);
  mesh(sword, mergeGeometries([F.fingers, F.thumb, F.ridge]), M.skin);
  mesh(arms.R.fore, ellipsoidGeometry(0.03 * HK, 0.04 * HK, 0.034 * HK, { widthSegs: 10, heightSegs: 6 }), M.skin, 0, -DIM.foreArm + 0.025, 0.004);
  const free = buildFreeHand(ctx, M.skin);
  return { offHand: free.offHand, keep: free.keep };
}

// ================================================================= the legs
/** Slim dark trousers, plain dark shoes (part 12: they never take the pale hem). */
function buildLegs(ctx) {
  const { pelvis, legs, M, DIM, BODY, mesh } = ctx;
  const [hx, hy, hz] = BODY.hips.r;
  mesh(pelvis, orient.up(ellipsoidGeometry(hx - 0.008, hz - 0.006, hy + 0.006)), M.pants, ...BODY.hips.c);
  const [th0, th1] = BODY.thigh, [sh0, sh1] = BODY.shin, Ft = BODY.foot;
  for (const side of [-1, 1]) {
    const { thigh, shin, foot } = legs[side < 0 ? 'R' : 'L'];
    mesh(thigh, limb({ length: DIM.thigh, r0: th0 - 0.008, r1: th1 - 0.004, bulge: 0.004 }), M.pants);
    mesh(shin, limb({ length: DIM.shin - 0.05, r0: th1 - 0.004, r1: sh1 + 0.004, bulge: 0.004 }), M.pants);
    // the trouser's end over the shoe, then the shoe
    mesh(shin, sub(limb({ length: 0.05, r0: sh1 + 0.006, r1: sh1 + 0.006, radial: 12, rings: 1, capSegs: 1 }).translate(0, -DIM.shin + 0.1, 0), 1), M.pants);
    mesh(foot, ellipsoidGeometry(Ft.r[0] * 0.92, Ft.r[1] * 0.82, Ft.r[2] * 1.02, { widthSegs: 10, heightSegs: 6 }).translate(Ft.c[0], Ft.c[1] - 0.004, Ft.c[2] + 0.008), M.armor);
  }
  return {};
}

// ================================================================= the coat's skirt
// Panels (sheet.js panelSkirt; anim.js _coat springs them): az 0 = his front, + his left; from the
// anchor at 1.135 m. a / c: to the knee (~0.55 m: its last few cm print as the pale hem); b: the robe
// to the ankle. `open` = a front panel's az in phase 3 (look.js turns its anchor: the coat parts).
const SKIRT_COAT = [
  { az: 0.34, open: 0.62, w: [0.15, 0.17, 0.2], len: [0.28, 0.3], skew: 1, slant: 0.02, out: 0.006, front: true },
  { az: -0.34, open: -0.62, w: [0.15, 0.17, 0.2], len: [0.28, 0.3], skew: -1, slant: 0.02, out: 0.0, front: true },
  { az: 1.6, w: [0.13, 0.16, 0.2], len: [0.28, 0.3], out: 0.003 },
  { az: -1.6, w: [0.13, 0.16, 0.2], len: [0.28, 0.3], out: 0.003 },
  { az: 2.5, w: [0.15, 0.19, 0.24], len: [0.28, 0.31], skew: -1.2, slant: 0.03, out: 0.008, tail: true },
  { az: -2.5, w: [0.15, 0.19, 0.24], len: [0.28, 0.31], skew: 1.2, slant: 0.03, out: 0.008, tail: true },
];
const SKIRT_ROBE = [
  { az: 0.3, open: 0.5, w: [0.16, 0.19, 0.23], len: [0.47, 0.5], skew: 1, slant: 0.02, out: 0.006, front: true },
  { az: -0.3, open: -0.5, w: [0.16, 0.19, 0.23], len: [0.47, 0.5], skew: -1, slant: 0.02, out: 0.0, front: true },
  { az: 1.6, w: [0.15, 0.18, 0.23], len: [0.47, 0.5], out: 0.003 },
  { az: -1.6, w: [0.15, 0.18, 0.23], len: [0.47, 0.5], out: 0.003 },
  { az: 2.5, w: [0.17, 0.22, 0.3], len: [0.47, 0.51], skew: -1.2, slant: 0.04, out: 0.008, tail: true },
  { az: -2.5, w: [0.17, 0.22, 0.3], len: [0.47, 0.51], skew: 1.2, slant: 0.04, out: 0.008, tail: true },
];

function buildSkirt(ctx) {
  const look = wjLookNow();
  const D = dressOf(ctx.root, look);
  // (fresh defs per rig: look.js writes their flare and stir, and turns the front panels)
  const defs = (look === 'b' ? SKIRT_ROBE : SKIRT_COAT).map((p) => ({ ...p, strips: [], fork: [], flare: 0.05, breeze: 0, idleFlare: 0 }));
  const { coat } = panelSkirt(ctx, defs, { seed: 1200 });
  // heavy cloth: one or two soft folds down each panel instead of the skirt's pleats
  coat.forEach((C, i) => {
    const w = C.def.w[2], ph = i * 1.7 + 0.6;
    const seen = new Set();
    for (const s of C.segs) for (const m of s.children) {
      if (!m.isMesh || seen.has(m.geometry)) continue;
      seen.add(m.geometry);
      foldLines(m.geometry, (x, y, z, u, gy) => 0.5 + 0.6 * Math.sin((u / w) * Math.PI * 2.2 + ph + gy * 1.5));
    }
  });
  coat.forEach((C) => {
    D.panels.push({ def: C.def, tail: !!C.def.tail, front: !!C.def.front });
    if (C.def.front) D.fronts.push({ C, closed: C.def.az, open: C.def.open, R: ctx.DIM });
  });
  return { coat };
}

// ================================================================= the items
/** The set (registered into the hero's gear registry on import: gear/index.js registerItem). */
export const WJ_ITEMS = [
  { id: 'wj.head', slot: 'head', name: 'White Hair and Band', hidesHair: true, build: buildHead },
  { id: 'wj.coat', slot: 'chest', name: 'High-Collared Coat', build: buildChest },
  { id: 'wj.arms', slot: 'arms', name: 'Coat Sleeves', build: buildArms },
  { id: 'wj.legs', slot: 'legs', name: 'Dark Trousers', build: buildLegs },
  { id: 'wj.skirt', slot: 'waist', name: 'Coat Skirt', build: buildSkirt },
];
for (const item of WJ_ITEMS) registerItem(item);

/** What he wears (no `weapon`: bare-handed; the right fist hangs on the sword joint). */
export const WJ_LOADOUT = Object.freeze({
  head: 'wj.head', chest: 'wj.coat', shoulders: null, arms: 'wj.arms', legs: 'wj.legs', waist: 'wj.skirt', back: null, weapon: null,
});

/** His "blade": the right fist along the sword joint's +Z (Tian Lei's measure: the same fist, bare). */
export const WJ_FIST = Object.freeze({ guard: -0.06, tip: 0.075 });
