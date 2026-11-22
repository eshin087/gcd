import { ellipsoidGeometry } from '../../render/glyphGeometry.js';
import { HEADS, FACE_ART, V, add, both, interpRow, bentPath, sweepTube } from './heads.js';

// The four faces of 2026-11-20 (?wyrmFace=drake|tyrant|viper|revenant), for the owner to pick from
// rendered sheets. The owner: "I really dont like how the dragon face looks. It doesnt look realistic
// or scary." What the photographs of the old face showed, at the game camera and close:
//   - at the game camera the face could not be found: a dark mass under the neck's pale quills, the
//     eyes one letter wide
//   - close up: a tube for a skull, the body's big white-rimmed scales over it (a pine cone, no planes
//     of a face), a fence of identical teeth, a flat bright-orange board for the inside of the mouth
// So every face here shares one KIT, and differs in its skull:
//   the skin   fine scales under a strong key light: brow, snout, cheek and jaw print as planes
//   the eyes   burning slits several letters long, in a socket under a brow
//   the mouth  dark inside, the fire at the back of the throat (it flares with the breath's charge),
//              a tongue; fangs of real variety, letters inside an outline instead of a comb of '|'
//   the nape   the neck's crest and mane shorten toward the skull, so the head's outline stands free
//
//   drake     the classic: a long hooked snout, a stop before a heavy brow, two long swept horns, cheek fins
//   tyrant    heavy and blunt: a deep short muzzle, a scowling brow bar, banana teeth, a crown of short horns
//   viper     a flat, wide arrowhead: venom-gland bulges, sabre fangs outside the lip, horns over the eyes
//   revenant  a death's head: the front of the skull bare bone, hollow sockets with a coal in each
//
// Data per head as heads.js lays it out (upper / lower rings, features, teeth rows, eye, nostril,
// extras). Gameplay joints do not move (heads.js): the jaw's hinge and the mouth are where they were.

// ---------------------------------------------------------------- the kit
const KEY = { key: [-0.5, 0.9, 1.0], envSat: 0.3, gap: [0.12, 3.5] }; // (model.js LIT)
const UNDER = [1.0, 0.3, 0.06, 0.8];
/** The face's hide: fine scales that fade to a lit plane at the game camera. */
const SKIN = { scale: [0.1, 0.075], tone: [0.02, 0.3, 1.1, 0.12], ink: [0.2, 0.185, 0.17], light: [1.0, 1.55, 0.4, 0.0], vary: 0.3, crack: [0, 0, -0.4, 0.6] };
const KIT_ART = {
  head: SKIN,
  // dark inside (the old maw's flat orange read as a painted board); the fire is the gullet's
  maw: { ink: [0.5, 0.06, 0.015], glow: [0, 0.14] },
  // sockets and nostrils: holes
  pit: { ink: [0.03, 0.02, 0.018], light: [1.0, 0.12, 0.0, 0.0], strokes: 'none' },
  // fangs: letters inside a stroked outline (strokes all over drew a comb of '|')
  teeth: { strokeEdge: 0.3 },
  eye: { emit: [1.5, 0.45, 0.055] },
};

/** The mouth's lining (the lofts' `maw` band) goes to the hollows' black: the red is the tongue's. */
const LINING = { from: 'maw', key: 'pit' };

const tube = (pts, r, o) => sweepTube(pts.map((q) => V(...q)), r, o);
/** A horn: a bent, tapering tube. Returns { geo, tip }. */
function horn(p0, d0, len, r, { bend = -0.4, axis = [1, 0, 0], n = 7, bendPow = 1.3, drift, taper = 0.9, radial = 6, flat = 1, ridge = null, up } = {}) {
  const path = bentPath(p0, d0, len, { bend, axis, n, bendPow, drift });
  return { geo: sweepTube(path, (t) => r * Math.pow(1 - t, taper), { radial, flat, ridge, up }), tip: path[path.length - 1] };
}
const blob = (rx, ry, rz, x, y, z) => ellipsoidGeometry(rx, ry, rz, { widthSegs: 10, heightSegs: 8 }).translate(x, y, z);

/** The fire at the back of the mouth (the throat's material: it flares as the breath charges) and a tongue. */
function mouthKit(S, up, jp, { gullet = [0.3, 0.2], tongue = 0.95 } = {}) {
  const u = interpRow(S.upper, gullet[0]);
  // under the vault of the palate, at the back
  add(up, 'throat', blob(u.wg * 0.62, 0.035, gullet[1], 0, u.gum + u.pal * 0.9, gullet[0]));
  const l0 = interpRow(S.lower, 0.1), l1 = interpRow(S.lower, tongue);
  add(jp, 'throat', blob(l0.wl * 0.6, 0.03, 0.16, 0, l0.fl + 0.01, 0.16));
  // the tongue: a low ridge down the floor of the mouth, its tip lifted
  add(jp, 'maw', tube([[0, l0.fl + 0.035, 0.22], [0, l0.fl + 0.04, 0.5], [0, l1.fl + 0.045, tongue - 0.15], [0, l1.fl + 0.075, tongue]], (t) => 0.11 * (1 - 0.55 * t), { radial: 6, flat: 0.5 }));
}

/** Spikes down the jaw line's back half and under the chin: [[z, len], ...]; chin: [[x, z, len], ...]. */
function jawSpikes(S, jp, line, chin = [], r = 0.055) {
  for (const [z, len] of line) {
    const k = interpRow(S.lower, z);
    add(jp, 'bone', ...both(horn([k.w * 0.88, k.ys - 0.1, z], [0.55, -0.6, -1], len, r, { bend: 0.2, n: 3, flat: 0.6, radial: 5 }).geo));
  }
  for (const [x, z, len] of chin) {
    const k = interpRow(S.lower, z);
    const g = horn([x, k.b + 0.03, z], [x, -1, 0.4], len, r, { bend: 0.3, n: 3, radial: 5 }).geo;
    if (x === 0) add(jp, 'bone', g);
    else add(jp, 'bone', ...both(g));
  }
}

// ================================================================ 1. drake: the classic
const SK = HEADS.skull;
const DRAKE = {
  upper: SK.upper,
  upperFeats: SK.upperFeats,
  lower: SK.lower,
  lowerFeats: SK.lowerFeats,
  teethUp: [
    // [z, len, r, hook, splay]: two fangs at the tip, the notch, the canine, then big and small in turn
    [1.32, 0.16, 0.04, 0.3, 0.25],
    [1.25, 0.26, 0.052, 0.4, 0.15],
    [1.05, 0.44, 0.07, 0.5, 0.1],
    [0.9, 0.19, 0.044, 0.35],
    [0.76, 0.28, 0.052, 0.4],
    [0.62, 0.15, 0.038],
    [0.5, 0.2, 0.044, 0.35],
    [0.4, 0.1, 0.03],
  ],
  teethLow: [
    [1.2, 0.16, 0.04, 0.3, 0.2],
    [1.1, 0.29, 0.056, 0.4, 0.18],
    [0.96, 0.13, 0.036],
    [0.83, 0.19, 0.044, 0.35],
    [0.69, 0.12, 0.034],
    [0.56, 0.17, 0.04],
    [0.44, 0.09, 0.028],
  ],
  // the glare (2026-11-21; the owner liked the standing view, 'the eyes look angled and angry', and
  // asked for it from every side): an almond with pointed corners, the outer one high, its face
  // turned OUT, UP and FORWARD at once, so it is a slanted slit from the side, one of a pair from
  // the front and from above (the old lozenge faced sideways: a blob from the front, a dot from above)
  eye: { c: [0.39, 0.268, 0.525], rot: [0, -0.68, 0.6], leaf: { len: 0.21, h: 0.033, slant: 0.09, peak: 0.55 } },
  paintJaw: [LINING],
  // the socket's dark: two patches, the rear one higher (a slanted hollow)
  paint: [LINING, { key: 'pit', c: [0.38, 0.22, 0.6], r: [0.12, 0.095, 0.13] }, { key: 'pit', c: [0.42, 0.29, 0.42], r: [0.12, 0.095, 0.14] }, { key: 'pit', c: [0.12, 0.29, 1.19], r: [0.04, 0.035, 0.045] }],
  nostril: SK.nostril,
  nape: [0.3, 0.45, 0.65, 0.85],
};
/** The drake's brow: low over the nose, rising steeply out and back over the eye (steeper than the eye's own slant: a scowl), set inboard of the eye so the eye shows from above. */
const DRAKE_BROW = [[0.07, 0.235, 0.86], [0.15, 0.3, 0.72], [0.225, 0.365, 0.58], [0.295, 0.425, 0.43], [0.38, 0.455, 0.27], [0.46, 0.42, 0.1]];
DRAKE.extras = (S, up, jp) => {
  // the brow: a bony shelf low over the snout, high and out behind the eye (a frown); the cheekbone
  add(up, 'bone', ...both(tube(DRAKE_BROW, (t) => 0.078 * (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, 0.08 + t * 1.0))), { radial: 5, flat: 0.66 })));
  // the orbit's rear rim: bone from the brow down to the cheekbone behind the eye, standing proud, so
  // the eye (turned forward) lies IN a socket from every side
  add(up, 'head', ...both(tube([[0.4, 0.45, 0.3], [0.49, 0.36, 0.33], [0.53, 0.22, 0.35], [0.53, 0.08, 0.34]], (t) => 0.06 * (0.6 + 0.4 * Math.sin(Math.PI * t)), { radial: 5, flat: 0.7 })));
  add(up, 'head', ...both(tube(SK.cheek, (t) => 0.065 * (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.15))), { radial: 5, flat: 0.55 })));
  // two long horns swept back over the neck, their tips rising; a shorter pair under them
  const main = horn([0.21, 0.38, 0.02], [0.42, 0.12, -1], 2.3, 0.135, { bend: -0.95, n: 10, bendPow: 1.15, radial: 7, ridge: [7, 0.07], taper: 0.8 });
  const L = [main.geo];
  L.push(horn([0.34, 0.2, -0.02], [0.66, -0.06, -1], 1.3, 0.095, { bend: -0.6, n: 7, bendPow: 1.1, taper: 0.8 }).geo);
  // a horn over each eye
  L.push(horn([0.3, 0.44, 0.42], [0.4, 0.6, -1], 0.5, 0.06, { bend: -0.35, n: 4, flat: 0.7, radial: 5 }).geo);
  // cheek fins: three long flat blades off the jaw's hinge, fanned back and out
  [[0.07, [0.8, 0.28, -1], 1.05], [-0.03, [0.92, -0.04, -1], 0.88], [-0.11, [0.85, -0.34, -1], 0.66]].forEach(([y, d, len], k) =>
    L.push(horn([0.5, y, 0.2 - 0.07 * k], d, len, 0.085, { bend: 0.3, axis: [0, 1, 0], n: 5, flat: 0.3, radial: 5 }).geo));
  for (const g of L) add(up, 'bone', ...both(g));
  // a small horn on the nose, a low crest on the back of the skull
  add(up, 'bone', horn([0, 0.25, 1.2], [0, 1, -0.4], 0.22, 0.055, { bend: -0.3, n: 3, radial: 5, up: [1, 0, 0] }).geo);
  [[0.1, 0.45, 0.24], [-0.08, 0.4, 0.3]].forEach(([z, y, len]) => add(up, 'bone', horn([0, y, z], [0, 0.7, -1], len, 0.06, { bend: -0.3, n: 3, radial: 5, flat: 0.45, up: [1, 0, 0] }).geo));
  jawSpikes(S, jp, [[0.3, 0.2], [0.08, 0.26], [-0.1, 0.3]], [[0.07, 1.05, 0.16], [0.1, 0.85, 0.13]]);
  mouthKit(S, up, jp);
  return { hornTip: main.tip.toArray() };
};

// ================================================================ 2. tyrant: heavy and blunt
const DM = HEADS.demon;
const TYRANT = {
  upper: DM.upper,
  upperFeats: [
    ...DM.upperFeats,
    // rugose bosses down the snout and over the lip: the big tooth roots
    { c: [0.12, 0.34, 0.98], r: [0.07, 0.05, 0.06], a: 0.035 },
    { c: [0.3, -0.1, 1.0], r: [0.07, 0.09, 0.07], a: 0.035 },
    { c: [0.34, -0.12, 0.78], r: [0.07, 0.09, 0.07], a: 0.03 },
  ],
  // an overbite: the lower jaw ends short of the snout, the upper teeth hang outside it
  lower: [
    { z: -0.32, fl: 0.08, tl: 0.13, wl: 0.18, w: 0.24, ys: 0.03, b: -0.12 },
    { z: -0.14, fl: 0.03, tl: 0.08, wl: 0.36, w: 0.44, ys: -0.06, b: -0.27 },
    { z: 0.1, fl: -0.01, tl: 0.07, wl: 0.4, w: 0.5, ys: -0.1, b: -0.33 },
    { z: 0.35, fl: -0.03, tl: 0.06, wl: 0.38, w: 0.45, ys: -0.1, b: -0.31 },
    { z: 0.6, fl: -0.04, tl: 0.055, wl: 0.35, w: 0.4, ys: -0.09, b: -0.28 },
    { z: 0.85, fl: -0.04, tl: 0.05, wl: 0.32, w: 0.36, ys: -0.08, b: -0.26 },
    { z: 1.02, fl: -0.04, tl: 0.05, wl: 0.29, w: 0.33, ys: -0.07, b: -0.25 },
    { z: 1.13, fl: -0.035, tl: 0.045, wl: 0.24, w: 0.28, ys: -0.07, b: -0.24 },
    { z: 1.2, fl: -0.035, tl: 0.02, wl: 0.15, w: 0.19, ys: -0.09, b: -0.2 },
    { z: 1.25, fl: -0.04, tl: -0.02, wl: 0.05, w: 0.07, ys: -0.1, b: -0.15 },
  ],
  lowerFeats: [
    { c: [0.5, -0.1, 0.1], r: [0.09, 0.14, 0.24], a: 0.065 },
    { c: [0.1, -0.26, 1.08], r: [0.14, 0.08, 0.12], a: 0.04 },
  ],
  teethUp: [
    [1.2, 0.2, 0.055, 0.3, 0.2],
    [1.12, 0.3, 0.066, 0.35, 0.12],
    [1.0, 0.36, 0.072, 0.35, 0.06],
    [0.87, 0.3, 0.066, 0.3],
    [0.74, 0.23, 0.058, 0.3],
    [0.62, 0.17, 0.05],
    [0.51, 0.11, 0.04],
  ],
  teethLow: [
    [1.17, 0.13, 0.044, 0.2, 0.2],
    [1.08, 0.18, 0.05, 0.25, 0.12],
    [0.95, 0.15, 0.045],
    [0.82, 0.18, 0.048],
    [0.69, 0.13, 0.04],
    [0.57, 0.11, 0.036],
  ],
  eye: { c: [0.345, 0.29, 0.58], r: [0.034, 0.028, 0.1], rot: [0.4, 0.42, 0.4] },
  paintJaw: [LINING],
  paint: [LINING, { key: 'pit', c: [0.36, 0.3, 0.57], r: [0.13, 0.1, 0.15] }, { key: 'pit', c: [0.17, 0.33, 1.15], r: [0.05, 0.035, 0.045] }],
  nostril: DM.nostril,
  nape: [0.3, 0.45, 0.65, 0.85],
};
TYRANT.extras = (S, up, jp) => {
  // the brow bar: one massive shelf across both eyes, its middle low over the nose (a scowl)
  add(up, 'head', ...both(tube([[0.0, 0.46, 0.72], [0.18, 0.5, 0.68], [0.36, 0.52, 0.6], [0.52, 0.48, 0.46], [0.6, 0.38, 0.32]], (t) => 0.125 * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.95))), { radial: 6, flat: 0.62 })));
  // the crown: four short thick horns a side round the back rim of the skull, from the top to the cheek
  const L = [];
  let tip = null;
  for (let k = 0; k < 4; k++) {
    const h = horn([0.15 + 0.13 * k, 0.5 - 0.1 * k, 0.02 - 0.03 * k], [0.22 + 0.3 * k, 0.6 - 0.33 * k, -1], 1.0 - 0.13 * k, 0.12 - 0.01 * k, { bend: -0.7, n: 6, bendPow: 1.1, ridge: [4, 0.06], taper: 0.8 });
    L.push(h.geo);
    tip ??= h.tip;
  }
  // a boss horn over each eye, short and blunt
  L.push(horn([0.4, 0.53, 0.5], [0.35, 1, -0.6], 0.3, 0.075, { bend: -0.3, n: 3, radial: 5 }).geo);
  for (const g of L) add(up, 'bone', ...both(g));
  // studs down the middle of the snout
  [[0.92, 0.36, 0.15], [1.06, 0.33, 0.12]].forEach(([z, y, len]) => add(up, 'bone', horn([0, y, z], [0, 1, -0.3], len, 0.06, { bend: -0.2, n: 3, radial: 5, up: [1, 0, 0] }).geo));
  jawSpikes(S, jp, [[0.6, 0.22], [0.35, 0.28], [0.1, 0.32]], [[0.12, 1.08, 0.22], [0, 1.16, 0.18]], 0.065);
  mouthKit(S, up, jp, { gullet: [0.3, 0.22], tongue: 0.9 });
  return { hornTip: tip.toArray() };
};

// ================================================================ 3. viper: the arrowhead
const VIPER = {
  // flat and very wide at the hinge (the glands), a short blunt point of a snout
  upper: [
    { z: -0.26, top: 0.12, wt: 0.14, w: 0.3, ys: 0.0, cheek: 0.0, gum: -0.12, wg: 0.24, pal: 0.04 },
    { z: -0.12, top: 0.25, wt: 0.3, w: 0.56, ys: 0.06, cheek: 0.03, gum: -0.17, wg: 0.46, pal: 0.06 },
    { z: 0.06, top: 0.3, wt: 0.36, w: 0.66, ys: 0.07, cheek: 0.05, gum: -0.18, wg: 0.55, pal: 0.08 },
    { z: 0.24, top: 0.31, wt: 0.36, w: 0.64, ys: 0.08, cheek: 0.04, gum: -0.17, wg: 0.54, pal: 0.09 },
    { z: 0.42, top: 0.3, wt: 0.33, w: 0.56, ys: 0.09, cheek: 0.02, gum: -0.16, wg: 0.48, pal: 0.09 },
    { z: 0.6, top: 0.27, wt: 0.28, w: 0.46, ys: 0.08, cheek: 0.01, gum: -0.15, wg: 0.41, pal: 0.085 },
    { z: 0.78, top: 0.235, wt: 0.22, w: 0.37, ys: 0.06, cheek: 0.0, gum: -0.14, wg: 0.34, pal: 0.08 },
    { z: 0.96, top: 0.2, wt: 0.17, w: 0.3, ys: 0.04, cheek: 0.0, gum: -0.135, wg: 0.28, pal: 0.07 },
    { z: 1.12, top: 0.175, wt: 0.13, w: 0.24, ys: 0.02, cheek: 0.0, gum: -0.13, wg: 0.225, pal: 0.06 },
    { z: 1.26, top: 0.15, wt: 0.1, w: 0.19, ys: 0.0, cheek: 0.0, gum: -0.13, wg: 0.175, pal: 0.05 },
    { z: 1.36, top: 0.1, wt: 0.07, w: 0.13, ys: -0.03, cheek: 0.0, gum: -0.14, wg: 0.115, pal: 0.035 },
    { z: 1.43, top: 0.0, wt: 0.03, w: 0.06, ys: -0.08, cheek: 0.0, gum: -0.15, wg: 0.045, pal: 0.015 },
  ],
  upperFeats: [
    // the socket under its shield, the heat pit between the eye and the nostril
    { c: [0.42, 0.2, 0.62], r: [0.12, 0.09, 0.14], a: -0.09 },
    { c: [0.3, 0.08, 0.92], r: [0.055, 0.05, 0.065], a: -0.055 },
    // the glands: the back corners of the head swell out and back
    { c: [0.62, 0.06, 0.12], r: [0.13, 0.15, 0.28], a: 0.075 },
    // nostrils, a groove down the skull table, the lip swollen over the fang's root
    { c: [0.1, 0.17, 1.28], r: [0.06, 0.04, 0.06], a: 0.03 },
    { c: [0.11, 0.19, 1.3], r: [0.03, 0.022, 0.03], a: -0.04 },
    { c: [0, 0.31, 0.3], r: [0.05, 0.05, 0.42], a: -0.035 },
    { c: [0.2, -0.08, 1.2], r: [0.07, 0.08, 0.09], a: 0.035 },
  ],
  lower: [
    { z: -0.32, fl: 0.06, tl: 0.1, wl: 0.2, w: 0.26, ys: 0.02, b: -0.08 },
    { z: -0.14, fl: 0.02, tl: 0.07, wl: 0.44, w: 0.54, ys: -0.03, b: -0.16 },
    { z: 0.08, fl: -0.01, tl: 0.06, wl: 0.52, w: 0.62, ys: -0.05, b: -0.19 },
    { z: 0.3, fl: -0.02, tl: 0.05, wl: 0.48, w: 0.56, ys: -0.05, b: -0.18 },
    { z: 0.52, fl: -0.03, tl: 0.045, wl: 0.4, w: 0.46, ys: -0.045, b: -0.16 },
    { z: 0.74, fl: -0.035, tl: 0.04, wl: 0.32, w: 0.36, ys: -0.04, b: -0.14 },
    { z: 0.96, fl: -0.035, tl: 0.035, wl: 0.25, w: 0.28, ys: -0.03, b: -0.12 },
    { z: 1.14, fl: -0.03, tl: 0.03, wl: 0.19, w: 0.21, ys: -0.025, b: -0.1 },
    { z: 1.26, fl: -0.03, tl: 0.02, wl: 0.12, w: 0.14, ys: -0.03, b: -0.09 },
    { z: 1.33, fl: -0.035, tl: -0.01, wl: 0.04, w: 0.05, ys: -0.05, b: -0.08 },
  ],
  lowerFeats: [{ c: [0.56, -0.06, 0.1], r: [0.1, 0.1, 0.26], a: 0.05 }],
  // sabre fangs: rooted at the lip's outer edge, they hang OUTSIDE the lower jaw; needles behind them
  teethOpt: { inset: 1.0, lift: 0.012, rake: 0.16 },
  teethUp: [
    [1.22, 0.46, 0.058, 0.6, 0.1],
    [1.02, 0.1, 0.03],
    [0.88, 0.09, 0.028],
    [0.74, 0.08, 0.026],
    [0.6, 0.07, 0.024],
  ],
  teethLow: [
    [1.22, 0.1, 0.03, 0.3, 0.0],
    [1.06, 0.08, 0.026, 0.3, -0.1],
    [0.9, 0.08, 0.026, 0.3, -0.1],
    [0.74, 0.07, 0.024, 0.3, -0.1],
    [0.58, 0.07, 0.024, 0.3, -0.1],
  ],
  eye: { c: [0.45, 0.205, 0.62], r: [0.034, 0.03, 0.11], rot: [0.3, 0.62, 0.3] },
  paintJaw: [LINING],
  paint: [LINING, { key: 'pit', c: [0.42, 0.21, 0.62], r: [0.12, 0.095, 0.155] }, { key: 'pit', c: [0.11, 0.19, 1.3], r: [0.035, 0.03, 0.035] }],
  nostril: [0.11, 0.2, 1.3],
  nape: [0.25, 0.4, 0.6, 0.8],
};
VIPER.extras = (S, up, jp) => {
  // the supraocular shield: a ridge from the snout out over the eye to the back corner (the V of a glare)
  add(up, 'bone', ...both(tube([[0.2, 0.24, 0.95], [0.34, 0.29, 0.78], [0.46, 0.3, 0.6], [0.54, 0.27, 0.42], [0.58, 0.2, 0.26]], (t) => 0.08 * (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.1))), { radial: 5, flat: 0.5 })));
  // two low keels down the skull table
  add(up, 'head', ...both(tube([[0.1, 0.29, 0.72], [0.14, 0.325, 0.4], [0.16, 0.32, 0.1], [0.15, 0.27, -0.12]], () => 0.035, { radial: 5, flat: 0.6 })));
  // a horn over each eye (a horned viper's), long and swept back
  const main = horn([0.46, 0.31, 0.56], [0.45, 0.7, -1], 0.85, 0.075, { bend: -0.5, n: 6, bendPow: 1.4 });
  const L = [main.geo];
  // spines along the back edge of the head, longest at the corners
  [[0.6, 0.08, 0.72], [0.5, 0.17, 0.62], [0.37, 0.24, 0.54], [0.23, 0.27, 0.48]].forEach(([x, y, len]) =>
    L.push(horn([x, y, -0.04], [x * 1.3, 0.1 + (0.6 - x) * 0.5, -1], len, 0.07, { bend: -0.15, n: 4, flat: 0.5, radial: 5 }).geo));
  for (const g of L) add(up, 'bone', ...both(g));
  jawSpikes(S, jp, [[-0.02, 0.3], [0.2, 0.2]], [], 0.05);
  mouthKit(S, up, jp, { gullet: [0.3, 0.2], tongue: 0.98 });
  return { hornTip: main.tip.toArray() };
};

// ================================================================ 4. revenant: the death's head
const SOCKET = { c: [0.4, 0.25, 0.5], r: [0.14, 0.115, 0.17] };
const NASAL = { c: [0.1, 0.275, 1.18], r: [0.06, 0.05, 0.075] };
const REVENANT = {
  upper: SK.upper,
  upperFeats: [
    ...SK.upperFeats,
    // the orbit and the nasal opening cut deeper: holes in bone, the temple hollow behind the arch
    { c: SOCKET.c, r: [0.15, 0.12, 0.16], a: -0.1 },
    { c: NASAL.c, r: [0.07, 0.05, 0.09], a: -0.06 },
    { c: [0.43, 0.2, 0.15], r: [0.1, 0.11, 0.12], a: -0.04 },
  ],
  lower: SK.lower,
  lowerFeats: SK.lowerFeats,
  // lipless: every tooth long and bare to the root
  teethUp: [
    [1.31, 0.2, 0.042, 0.3, 0.25],
    [1.25, 0.28, 0.05, 0.4, 0.15],
    [1.05, 0.4, 0.064, 0.45, 0.1],
    [0.94, 0.24, 0.044],
    [0.83, 0.28, 0.048, 0.4],
    [0.72, 0.2, 0.04],
    [0.62, 0.22, 0.042, 0.35],
    [0.52, 0.16, 0.034],
    [0.43, 0.12, 0.03],
  ],
  teethLow: [
    [1.2, 0.18, 0.04, 0.3, 0.2],
    [1.1, 0.29, 0.055, 0.4, 0.18],
    [0.98, 0.15, 0.036],
    [0.88, 0.19, 0.042, 0.35],
    [0.77, 0.16, 0.034],
    [0.67, 0.18, 0.036],
    [0.57, 0.13, 0.03],
    [0.47, 0.1, 0.026],
  ],
  // the front of the skull is bare bone (the `mask` material); the sockets and the nose stay dark
  paint: [LINING, { key: 'pit', c: SOCKET.c, r: SOCKET.r }, { key: 'pit', c: NASAL.c, r: NASAL.r }, { key: 'mask', z: [0.27, 9] }],
  paintJaw: [LINING, { key: 'mask', z: [0.3, 9] }],
  // a coal deep in each socket
  eye: { c: [0.37, 0.25, 0.5], r: [0.034, 0.034, 0.085], rot: [0.32, 0.5, 0.35] },
  nostril: SK.nostril,
  nape: [0.3, 0.45, 0.65, 0.85],
};
REVENANT.extras = (S, up, jp) => {
  // brow and cheekbone in bone
  add(up, 'mask', ...both(tube(SK.brow, (t) => 0.085 * (0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.1))), { radial: 5, flat: 0.6 })));
  add(up, 'mask', ...both(tube(SK.cheek, (t) => 0.06 * (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.15))), { radial: 5, flat: 0.55 })));
  // long straight horns, two a side, dark against the pale face; a broken crest between them
  const main = horn([0.21, 0.38, 0.02], [0.3, 0.42, -1], 2.1, 0.125, { bend: -0.3, n: 7, radial: 7, ridge: [8, 0.06], taper: 0.8 });
  const L = [main.geo];
  L.push(horn([0.33, 0.22, -0.02], [0.6, 0.14, -1], 1.55, 0.095, { bend: -0.25, n: 6, taper: 0.8 }).geo);
  L.push(horn([0.5, 0.02, 0.16], [0.85, -0.12, -1], 0.9, 0.085, { bend: 0.15, axis: [0, 1, 0], n: 5, flat: 0.6, radial: 5 }).geo);
  for (const g of L) add(up, 'bone', ...both(g));
  [[0.14, 0.45, 0.3], [-0.04, 0.41, 0.22], [-0.2, 0.3, 0.36]].forEach(([z, y, len]) => add(up, 'bone', horn([0, y, z], [0, 0.7, -1], len, 0.06, { bend: -0.3, n: 3, radial: 5, flat: 0.45, up: [1, 0, 0] }).geo));
  jawSpikes(S, jp, [[0.15, 0.22], [-0.05, 0.26]], [[0.07, 1.05, 0.14]]);
  mouthKit(S, up, jp);
  return { hornTip: main.tip.toArray() };
};

// ---------------------------------------------------------------- registration
Object.assign(HEADS, { drake: DRAKE, tyrant: TYRANT, viper: VIPER, revenant: REVENANT });
Object.assign(FACE_ART, {
  drake: { ...KIT_ART, eye: { emit: [1.3, 0.38, 0.045] } },
  tyrant: KIT_ART,
  viper: KIT_ART,
  revenant: {
    ...KIT_ART,
    // the hide behind the mask darker, so the bone stands off it
    head: { ...SKIN, tone: [0.02, 0.22, 1.0, 0.12] },
    // bare bone: smooth, pale, lit hard; the lava's light from below
    mask: { ...KEY, scale: [0.2, 0.16], tone: [0.25, 0.8, 1.0, 0.1], vary: 0.35, ink: [0.4, 0.375, 0.33], light: [1.0, 0.95, 0.25, 0.0], strokes: 'none', under: UNDER },
  },
});
