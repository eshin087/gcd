import { ellipsoidGeometry } from '../../../render/glyphGeometry.js';
import { shellGeometry, bandGeometry, boxGeometry, mergeGeometries, sub, limb, lerp, gridGeometry, orient, ring, place } from '../heroGeo.js';
import { buildFreeHand } from './hands.js';
import { SWORD_DIMS } from './wanderer.js';
import { hoodRim, buildLocks, hangCloak, robeSkirt, shellAt, chestPanel, plainLegs, sleeves, plainSword } from './abyss.js';

// LOOK "B · Wanderer" (the owner's concept sheet 2, 2026-11-16, "The Wanderer: hooded traveler,
// sword & shield, minimal silhouette"; gear/looks.js `traveler`. The id is not `wanderer`:
// gear/wanderer.js is the first outfit's set). A black figure in white outlines, like look A
// (gear/abyss.js: how the outline is made, and the builders this file shares with it), but a
// traveller where A is a robed figure: the legs show, the cloak is short.
//   head     traveler.hood    a round hood, the face in its SHADOW (`shadowsFace`), a jagged
//                             silver fringe across the dark opening
//   chest    traveler.tunic   a belted tunic with a white-edged front panel, a wrapped mantle
//                             closed by a ring clasp at the throat
//   arms     traveler.arms    sleeves, a banded bracer on each forearm, black gloves
//   legs     traveler.legs    trousers, strapped boots
//   waist    traveler.skirt   TRAVELER_PANELS: the tunic's short skirt and the front panel
//   back     traveler.cloak   TRAVELER_SHEETS: a short jagged cloak to the knees
//   weapon   traveler.sword   a straight sword, a blue core between pale edges, a disc pommel
//   offhand  shield.heater    (gear/shield.js)
// Heights in comments are metres in the idle stance.

// ---------------------------------------------------------------- head: the round hood
/** Hood rings (head space, shellGeometry): a rounded crown with a short soft peak at the back, the
 *  opening an oval round the face. */
const HOOD = [
  { y: -0.04, rx: 0.176, rz: 0.136, cz: -0.02, gap: 0.06 },
  { y: 0.024, rx: 0.14, rz: 0.126, cz: -0.014, gap: 0.062 },
  { y: 0.08, rx: 0.133, rz: 0.14, cz: -0.004, gap: 0.09 },
  { y: 0.145, rx: 0.138, rz: 0.154, cz: 0.0, gap: 0.104 },
  { y: 0.205, rx: 0.134, rz: 0.154, cz: -0.002, gap: 0.094 },
  { y: 0.252, rx: 0.116, rz: 0.14, cz: -0.012, gap: 0.058 },
  { y: 0.288, rx: 0.086, rz: 0.112, cz: -0.026, gap: 0.014 },
  { y: 0.31, rx: 0.048, rz: 0.07, cz: -0.044, gap: 0.004 },
  { y: 0.32, rx: 0.012, rz: 0.022, cz: -0.06, gap: 0.003 },
];
/** The silver fringe: short spikes across the brow (the sheet's in-game panel draws them as a row
 *  of white teeth over the black face), a strand at each cheek. */
const LOCKS = {
  fringe: [
    [-0.066, 0.194, 0.046, -0.36, -1, 0.5, 0.062, 0.015, 0.15], [-0.042, 0.206, 0.066, -0.2, -1, 0.42, 0.078, 0.016, 0.15],
    [-0.014, 0.212, 0.076, -0.05, -1, 0.36, 0.07, 0.016, 0.15], [0.014, 0.212, 0.076, 0.08, -1, 0.36, 0.084, 0.016, 0.15],
    [0.042, 0.206, 0.066, 0.22, -1, 0.42, 0.068, 0.016, 0.15], [0.066, 0.194, 0.046, 0.38, -1, 0.5, 0.06, 0.015, 0.15],
  ],
  sides: [[0.08, 0.168, 0.026, 0.2, -1, 0.3, 0.1, 0.013, 0.18]],
};
function buildHood({ head, M, mesh }) {
  mesh(head, shellGeometry(HOOD, { sub: 2, cols: 26 }), M.armor);
  mesh(head, shellGeometry(HOOD.map((r) => ({ ...r, rx: Math.max(0.002, r.rx - 0.005), rz: Math.max(0.002, r.rz - 0.005) })), { sub: 2, cols: 26 }), M.lining);
  mesh(head, hoodRim(HOOD, 0, 6.2, 0.011), M.bevel);
  // a silver mass over the skull and the fringe out of it
  mesh(head, sub(orient.up(ellipsoidGeometry(0.086, 0.098, 0.092, { widthSegs: 12, heightSegs: 8 })), 1), M.bevel, 0, 0.166, -0.006);
  buildLocks(head, mesh, LOCKS, M.bevel);
}

// ---------------------------------------------------------------- chest: the tunic, the mantle
function buildTunic({ spine, chest, M, BODY, REST, mesh }) {
  const ySp = (h) => h - REST.spine, yCh = (h) => h - REST.chest;
  const SHELL = BODY.shell, top = SHELL[SHELL.length - 1];
  const rings = [...SHELL, { y: top.y + 0.02, rx: 0.058, rz: 0.056 }].map((r) => ({ ...r, gap: 0, y: ySp(r.y) }));
  mesh(spine, shellGeometry(rings, { sub: 3, cols: 28 }), M.coat);
  // the front panel's upper part, a white line down each edge
  mesh(spine, chestPanel(SHELL, ySp, 1.1, 1.42, 0.066, 0.076, 0.008), M.spike);
  mesh(spine, mergeGeometries([-1, 1].map((s) => gridGeometry(1, 6, (u, t, o) => {
    const h = lerp(1.1, 1.42, t), R = shellAt(SHELL, h), x = s * (lerp(0.066, 0.076, t) - 0.004 + (u - 0.5) * 0.008);
    o[0] = x;
    o[1] = ySp(h);
    o[2] = Math.sqrt(Math.max(0, 1 - (x / (R.rx + 0.011)) ** 2)) * (R.rz + 0.011) + R.cz;
    o[3] = x;
    o[4] = o[1];
  }))), M.bevel);
  // the belt over it and its buckle
  const W = shellAt(SHELL, 1.2);
  mesh(spine, bandGeometry(W.rx + 0.017, W.rz + 0.017, 0.052, 32), M.leather, 0, ySp(1.2), W.cz);
  mesh(spine, boxGeometry(0.05, 0.044, 0.014, 0, ySp(1.2), W.rz + W.cz + 0.022), M.trim);
  // the mantle: one wrap over the shoulders, shorter than look A's cowl, a ragged lower edge,
  // lower on his sword side (it is wound round him, the end thrown over the left shoulder)
  let zClasp = 0.13;
  {
    const R = [
      { y: yCh(1.37), rx: 0.276, rz: 0.204, cz: -0.022 },
      { y: yCh(1.42), rx: 0.272, rz: 0.192, cz: -0.018 },
      { y: yCh(1.462), rx: 0.264, rz: 0.166, cz: -0.01 }, // (over the shoulder caps)
      { y: yCh(1.496), rx: 0.21, rz: 0.136, cz: -0.004 },
      { y: yCh(1.52), rx: 0.122, rz: 0.106, cz: 0.002 },
    ];
    zClasp = R[2].rz + R[2].cz;
    const cols = 30, g = shellGeometry(R, { sub: 2, cols });
    const p = g.attributes.position;
    for (let i = 0; i <= cols; i++) {
      const a = (i / cols) * Math.PI * 2;
      p.setY(i, p.getY(i) - 0.04 * (0.5 + 0.5 * Math.cos(a + 1.0)) + (i % 3 === 0 ? -0.03 : i % 3 === 1 ? 0.012 : -0.008));
    }
    g.computeVertexNormals();
    mesh(chest, sub(g, 0), M.spike);
    // a roll of the same cloth round the neck, under the hood
    mesh(chest, sub(bandGeometry(0.126, 0.112, 0.05, 20).translate(0, yCh(1.528), 0.004), 1), M.spike);
  }
  // the clasp: a silver ring at the throat, the dark cloth showing through it
  // (leaned back with the cloth it lies on)
  mesh(chest, place(ring(0.036, 0.036, 0.007, 14), 0, yCh(1.462), zClasp + 0.012, Math.PI / 2 - 0.55, 0, 0), M.trim);
  mesh(chest, place(ring(0.02, 0.02, 0.008, 12), 0, yCh(1.4625), zClasp + 0.0135, Math.PI / 2 - 0.55, 0, 0), M.shirt);
}

// ---------------------------------------------------------------- arms: sleeves and bracers
function buildArms(ctx) {
  const { arms, M, BODY, mesh } = ctx;
  const ua1 = BODY.upperArm[1], [fa0, fa1] = BODY.foreArm;
  sleeves(ctx, { mat: 'armor', glove: 'armor' });
  for (const side of ['R', 'L']) {
    const fore = arms[side].fore;
    mesh(fore, sub(limb({ length: 0.08, r0: ua1 + 0.002, r1: fa0 + 0.002 }), 1), M.armor);
    // the bracer: three bands of plate from under the elbow to the wrist (alternate ink sub-ids: a
    // white line between each), a bright line at each end. Slim: the shield lies along the left one
    const lames = [], n = 3, y0 = -0.058, y1 = -0.206;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      lames.push(sub(limb({ length: (y0 - y1) / n + 0.008, r0: lerp(fa0, fa1, t0) + 0.007, r1: lerp(fa0, fa1, t1) + 0.004, radial: 10, rings: 2, capSegs: 1 }).translate(0, lerp(y0, y1, t0), 0), i & 1));
    }
    mesh(fore, mergeGeometries(lames), M.spike);
    mesh(fore, mergeGeometries([
      bandGeometry(fa0 + 0.009, fa0 + 0.009, 0.01, 14).translate(0, y0 - 0.004, 0),
      bandGeometry(fa1 + 0.006, fa1 + 0.006, 0.01, 14).translate(0, y1 - 0.004, 0),
    ]), M.bevel);
  }
  return buildFreeHand(ctx, M.armor);
}

// ---------------------------------------------------------------- waist: the tunic's skirt
/** Five panels (see ABYSS_PANELS): a short front pair and back pair to mid-thigh with a ragged
 *  edge, then the front panel: a strip to a point above the knee. */
export const TRAVELER_PANELS = [
  { az: 1.02, w: [0.15, 0.19, 0.23], len: [0.15, 0.13], strips: [0.05, 0.08], fork: [0, 0], out: 0.004, flare: 0.14, skew: 1, slant: 0.03, jag: 0.03, mat: 'armor', back: null, breeze: 0.025, idleFlare: 0.03 },
  { az: -1.02, w: [0.15, 0.19, 0.23], len: [0.15, 0.13], strips: [0.08, 0.05], fork: [0, 0], out: 0.004, flare: 0.14, skew: -1, slant: 0.03, jag: 0.03, mat: 'armor', back: null, breeze: 0.03, idleFlare: 0.04 },
  { az: 2.36, w: [0.16, 0.21, 0.27], len: [0.16, 0.14], strips: [0.08, 0.05], fork: [0, 0], out: 0.008, flare: 0.26, skew: -1.2, slant: 0.03, jag: 0.03, mat: 'armor', back: null, breeze: 0.055, idleFlare: 0.09 },
  { az: -2.36, w: [0.16, 0.21, 0.27], len: [0.16, 0.14], strips: [0.05, 0.08], fork: [0, 0], out: 0.008, flare: 0.26, skew: 1.2, slant: 0.03, jag: 0.03, mat: 'armor', back: null, breeze: 0.05, idleFlare: 0.11 },
  { az: 0, w: [0.132, 0.136, 0.13], len: [0.25, 0.2], strips: [0.13], fork: [0], out: 0.02, flare: 0.1, mat: 'spike', back: null, border: 'bevel', point: true, jag: 0, breeze: 0.03, idleFlare: 0.05 },
];
const buildSkirt = (ctx) => robeSkirt(ctx, TRAVELER_PANELS, { seed: 330 });

// ---------------------------------------------------------------- back: the short cloak
/** Three sheets down his back to the knees, the hem torn into long points. None on the shield arm. */
export const TRAVELER_SHEETS = [
  { on: 'chest', at: [0, 0.2, -0.162], ry: Math.PI, w: [0.19, 0.25, 0.3], len: [0.34, 0.26], out: 0.24, wrap: 0.25, strips: [0.14, 0.24, 0.1, 0.2], fork: [0, 0, 1, 0], jag: 0.06, seed: 5 },
  { on: 'chest', at: [0.14, 0.2, -0.128], ry: Math.PI - 0.55, w: [0.13, 0.17, 0.21], len: [0.32, 0.24], out: 0.28, wrap: 0.22, strips: [0.2, 0.1, 0.16], fork: [0, 1, 0], jag: 0.06, seed: 19 },
  { on: 'chest', at: [-0.14, 0.2, -0.128], ry: Math.PI + 0.55, w: [0.13, 0.17, 0.21], len: [0.32, 0.23], out: 0.26, wrap: 0.22, strips: [0.12, 0.22, 0.09], fork: [0, 0, 1], jag: 0.06, seed: 31 },
];
const buildCloak = (ctx) => ({ streamers: hangCloak(ctx, TRAVELER_SHEETS, { face: ctx.M.armor }) });

// ---------------------------------------------------------------- weapon: the straight sword
/** A straight blade a little broader than look A's, a blue core between pale edges. */
const BLADE = {
  profile: [[0.11, 0.026], [0.135, 0.038], [0.2, 0.035], [0.79, 0.028], [0.87, 0.018], [0.93, 0]],
  notches: [], notch: { depth: 0, lead: 0.006, len: 0.022 }, ridge: 0.012, core: 0.6,
};
const buildSword = (ctx) => plainSword(ctx, BLADE, { pale: false, quillon: 0.115, disc: true });

export const TRAVELER_ITEMS = [
  { id: 'traveler.hood', slot: 'head', name: "Wanderer's Hood", hidesHair: true, shadowsFace: true, build: buildHood },
  { id: 'traveler.tunic', slot: 'chest', name: 'Belted Tunic and Mantle', build: buildTunic },
  { id: 'traveler.arms', slot: 'arms', name: 'Bracers and Gloves', build: buildArms },
  { id: 'traveler.legs', slot: 'legs', name: 'Strapped Boots', build: (ctx) => plainLegs(ctx, { boot: 'armor', band: 'bevel', straps: 2, cuff: true }) },
  { id: 'traveler.skirt', slot: 'waist', name: 'Tunic Skirt and Front Panel', build: buildSkirt },
  { id: 'traveler.cloak', slot: 'back', name: 'Short Jagged Cloak', build: buildCloak },
  { id: 'traveler.sword', slot: 'weapon', name: "Wanderer's Sword", dims: SWORD_DIMS, build: buildSword },
];

/** The look's loadout (ids only: gear/index.js imports this file, so it cannot import index.js). */
export const TRAVELER_LOADOUT = Object.freeze({
  head: 'traveler.hood',
  chest: 'traveler.tunic',
  shoulders: null,
  arms: 'traveler.arms',
  legs: 'traveler.legs',
  waist: 'traveler.skirt',
  back: 'traveler.cloak',
  weapon: 'traveler.sword',
  offhand: 'shield.heater',
});

/** Its colours (model.js tintHero, this rig only): look A's black and white, the leather a shade
 *  warmer (the belt and the straps are this look's detail). */
export const TRAVELER_TINT = {
  armor: { fill: [0.07, 0.07, 0.085], spec: [0, 18] },
  spike: { fill: [0.085, 0.085, 0.1], spec: [0, 16] },
  coat: { fill: [0.06, 0.06, 0.075] },
  lining: { fill: [0.02, 0.02, 0.03] },
  shirt: { fill: [0.03, 0.03, 0.04] },
  pants: { fill: [0.055, 0.055, 0.07] },
  leather: { fill: [0.16, 0.14, 0.15] },
  bevel: { fill: [1.3, 1.4, 2.1], spec: [0.15, 20] },
  trim: { fill: [0.5, 0.52, 0.64] },
  welt: { fill: [0.4, 0.41, 0.5] },
};
