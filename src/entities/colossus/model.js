import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createSurfaceGlyphMaterial } from '../../render/materials.js';
import { markCaster } from '../../render/pipeline.js';
import { limbGeometry, ellipsoidGeometry, hornGeometry } from '../../render/glyphGeometry.js';
import { BODY } from './tuning.js';
import { tideLook } from './looks.js';

// The Tide Colossus's body (ADR-141): an original sea creature, drawn through the wyrm's art path
// (createSurfaceGlyphMaterial with an ASCII-art source, FLAG.ART; no new pass, font or ramp). What is in
// play is two hands and a head; the shoulders and the humped back stand in the sea 20 to 40 m north of
// the rim and fade into the fog. A low, broad head with a lower jaw split into two mandibles, comb
// teeth, six small pale eyes under one heavy brow, a crown of broken coral; webbed four-fingered hands
// with a hooked thumb. No upright body, no plates down the back, no glowing spine (STYLE.md).
//
// Joints (Object3D) carry rigid meshes; the rig (rig.js) writes their transforms every frame. Every
// bone joint points its local +Z down the bone. The arm segments, the hands, the neck and the head are
// children of the root (the body's anchor in the sea), placed in the root's frame (no rotation on it).

// ---- the art sources (the wyrm's numbers as the starting point: dragon/model.js HIDE_ART, LAVA_ART)
const JADE = [0.18, 1.0, 0.5]; // the drowned light (green over blue: cyan is the hero's alone)
const LIT = { key: [-0.5, 0.9, 1.0], envSat: 0.3, gap: [0.12, 3.5] };
const UNDER = [0.2, 0.85, 0.5, 0.45]; // a little drowned light from below
const HIDE_ART = {
  ...LIT,
  scale: [0.55, 0.42],
  strokes: 'none',
  tone: [0.0, 0.11, 2.0, 0.16],
  vary: 0.35,
  ink: [0.3, 0.33, 0.34], // the wyrm's charcoal, a little colder
  light: [1.0, 0.55, 0.25, 0.03],
  crack: [18, 0.08, -0.4, 0.6],
  emit: JADE,
  under: UNDER,
};
const SEAM_ART = {
  ...LIT,
  scale: [0.42, 0.32],
  strokes: 'none',
  tone: [0.0, 0.2, 1.6, 0.22],
  vary: 0.5,
  ink: [0.2, 0.32, 0.29],
  rimInk: [0.35, 0.8, 0.58],
  light: [1.0, 0.55, 0.25, 0.04],
  crack: [14, 0.3, -0.9, 0.15],
  glow: [1.3, 0.03],
  emit: JADE,
  under: [0.2, 0.9, 0.5, 1.1],
};
export const TIDE_ART = {
  hide: HIDE_ART,
  limb: { ...HIDE_ART, scale: [0.5, 0.38] },
  body: { ...HIDE_ART, scale: [1.1, 0.8], scaleDir: 'down' },
  head: { ...HIDE_ART, scale: [0.36, 0.27], crack: [12, 0.06, -0.3, 0.7] },
  seam: SEAM_ART,
  // webbing and kelp: dark teal-black, a few jade specks
  web: { ...LIT, ink: [0.05, 0.1, 0.085], light: [1.0, 0.3, 0.15, 0.02], glow: [0, 0.03], emit: JADE, under: UNDER },
  // coral, barnacles, the crown's spars: pale, outlined in strokes at the very edge
  bone: { ...LIT, ink: [0.42, 0.42, 0.4], light: [1.0, 0.35, 1.6, 0.02], tip: [0.0, 0.5, 0.3, 0], strokes: 'axis', strokeEdge: 0.35, under: UNDER },
  claw: { ...LIT, ink: [0.42, 0.41, 0.38], light: [1.0, 0.55, 0.5, 0.03], tip: [0.0, 0.45, 0.25, 0], strokes: 'axis', strokeEdge: 0.3, under: UNDER },
  teeth: { ...LIT, ink: [0.8, 0.82, 0.78], light: [1.0, 0.6, 0.3, 0.12], strokes: 'axis', strokeEdge: 0, under: UNDER },
  // the drowned light at the back of the throat: jade, dimmer than the teeth so they read on it
  maw: { ink: [0.08, 0.5, 0.28], light: [0.3, 0.1, 0, 0.04], glow: [0, 0.42], emit: [0.12, 1.0, 0.45] },
  eye: { ink: [0.55, 0.8, 0.7], light: [0.3, 0, 0, 0.05], glow: [0, 1.0], emit: [0.55, 1.0, 0.75] },
  pit: { ink: [0.03, 0.035, 0.035], light: [0.2, 0, 0, 0.0] },
};

/** The letters the colossus sheds (render/shedDigits.js): charcoal, a pale scale edge, jade. */
export const SHED = { ink: [0.28, 0.31, 0.32], rim: [0.7, 0.76, 0.74], ember: [0.25, 1.1, 0.55], embers: 0.18, rims: 0.22, stream: 18 };

/** Crack / seam glow per material: [baseline, x this.glow (phase 3, dying), x throat charge (the breath)]. */
export const GLOW = {
  hide: [0.2, 0.5, 0.15], limb: [0.2, 0.5, 0], body: [0.15, 0.4, 0], head: [0.25, 0.6, 0.3],
  seam: [0.45, 0.9, 2.2], web: [0.3, 0.6, 0.2], bone: [0.05, 0.3, 0], claw: [0, 0, 0], teeth: [0, 0, 0.5], maw: [0.5, 0.6, 1.4],
};

const HIDE_LEVELS = ['vco:ce.o', ':vco;(ce', 'AVSDC5?K', 'AVSD8B0K', '8B0A69&Y'];
const SEAM_LEVELS = [' .:.', 'vcuo', 'VAUO', '8A0#'];
const WEB_LEVELS = ['.:co', 'oc:e', 'oeCs', 'O068'];
const BONE_LEVELS = ['.:..', '.::.', ':..:', 'A|!A'];
const CLAW_LEVELS = ['.:|!', '|!Y|', 'V|Y!', 'YV|A'];

export function createTideMaterials(U) {
  const mat = (key, o) => createSurfaceGlyphMaterial(U, { ...o, wyrm: TIDE_ART[key] });
  const HIDE = {
    levels: HIDE_LEVELS, base: [0.012, 0.014, 0.015], cell: [0.22, 0.26], rowShift: 0.5, lumScale: 2.0, glyphZoom: 0.74,
    ink: [0.4, 0.44, 0.45], inkAlt: [0.2, 0.9, 0.5], altChance: 0.06, gain: 2.4, rim: 0.4, outline: 0, inkGlow: 0.25,
    emissive: JADE, crack: 'voronoi', crackScale: 3.5, crackWidth: 0.7,
  };
  const SEAM = { levels: SEAM_LEVELS, base: [0.01, 0.08, 0.05], cell: [0.19, 0.22], rowShift: 0.5, lumScale: 3.0, ink: [0.25, 1.0, 0.55], inkAlt: [0.5, 1.0, 0.7], altChance: 0.2, gain: 1.6, rim: 0.15, outline: 0, inkGlow: 0.55, emissive: JADE, glowMask: 1, crack: 'voronoi' };
  const m = {
    hide: mat('hide', { ...HIDE, seed: 11.3 }),
    limb: mat('limb', { ...HIDE, seamAxis: 'y', seed: 47.3 }),
    body: mat('body', { ...HIDE, cell: [0.3, 0.34], seed: 23.7 }),
    head: mat('head', { ...HIDE, cell: [0.17, 0.21], seamAxis: 'y', seed: 61.7 }),
    seam: mat('seam', { ...SEAM, seed: 17.9 }),
    web: mat('web', { levels: WEB_LEVELS, cell: [0.22, 0.26], rowShift: 0, seamAxis: 'y', glyphZoom: 0.8, base: [0.01, 0.03, 0.025], lumScale: 3.0, ink: [0.08, 0.3, 0.2], inkAlt: [0.2, 1.0, 0.5], altChance: 0.08, gain: 2.0, rim: 0.2, outline: 0, inkGlow: 0.2, emissive: JADE, glowMask: 0.7, side: THREE.DoubleSide, seed: 41.9 }),
    bone: mat('bone', { levels: BONE_LEVELS, cell: [0.1, 0.16], base: [0.07, 0.07, 0.07], lumScale: 2.8, ink: [0.5, 0.5, 0.48], gain: 1.9, rim: 0.25, outline: 0, inkGlow: 0.02, emissive: JADE, glowMask: 0.4, seed: 7.7 }),
    claw: mat('claw', { levels: CLAW_LEVELS, cell: [0.09, 0.15], base: [0.12, 0.12, 0.11], lumScale: 3.5, ink: [0.85, 0.84, 0.78], gain: 2.4, rim: 0.4, outline: 0, inkGlow: 0.12, glowMask: 0, seed: 13.9 }),
    teeth: mat('teeth', { ascii: 'strands', glyphs: ".'|!", cell: [0.06, 0.09], base: [0.25, 0.27, 0.25], lumScale: 3.0, outline: 0, ink: [0.95, 1.0, 0.95], gain: 2.0, rim: 0.3, inkGlow: 0.08, emissive: JADE, glowMask: 0.6, seed: 19.3 }),
    maw: mat('maw', { ascii: 'smooth', glyphs: '.*%#', cell: [0.08, 0.1], base: [0.02, 0.2, 0.1], lumScale: 2.0, outline: 0, ink: [0.2, 1.0, 0.5], gain: 1.0, rim: 0, inkGlow: 1.15, emissive: JADE, glowMask: 1, seed: 2.7 }),
    eye: mat('eye', { ascii: 'smooth', glyphs: '%@#@', cell: [0.1, 0.1], base: [0.04, 0.08, 0.07], lumScale: 2.2, outline: 0, ink: [0.6, 1.0, 0.8], gain: 1.0, rim: 0, emissive: [1.2, 2.2, 1.6], glowMask: 1, inkGlow: 0, seed: 3.3 }),
    pit: mat('pit', { levels: CLAW_LEVELS, cell: [0.09, 0.15], base: [0.01, 0.01, 0.01], lumScale: 1, ink: [0.06, 0.06, 0.06], gain: 1, rim: 0, outline: 0, inkGlow: 0, glowMask: 0, seed: 41.9 }),
  };
  for (const x of Object.values(m)) x.uniforms.uArtGain.value = 0.28;
  return m;
}

// ---- builders
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _d = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1), Z = new THREE.Vector3(0, 0, 1);

function joint(parent, name = '', x = 0, y = 0, z = 0) {
  const j = new THREE.Object3D();
  j.name = name;
  j.position.set(x, y, z);
  parent.add(j);
  return j;
}
/** Transform in place: rotation (Euler, YXZ) then translation. */
function place(geo, x, y, z, rx = 0, ry = 0, rz = 0) {
  _e.set(rx, ry, rz, 'YXZ');
  _m4.compose(_p.set(x, y, z), _q.setFromEuler(_e), _one);
  return geo.applyMatrix4(_m4);
}
/** A tapered limb from a to b in the parent's frame (for merging). */
function seg(a, b, opts) {
  _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const g = limbGeometry({ radial: 10, rings: 4, capSegs: 2, ...opts, length: _d.length() });
  _q.setFromUnitVectors(Z, _d.normalize());
  _m4.compose(_p.set(a[0], a[1], a[2]), _q, _one);
  return g.applyMatrix4(_m4);
}
function ell(rx, ry, rz, x, y, z, rotX = 0, rotY = 0, rotZ = 0, segs = [12, 8]) {
  return place(ellipsoidGeometry(rx, ry, rz, { widthSegs: segs[0], heightSegs: segs[1] }), x, y, z, rotX, rotY, rotZ);
}
function horn(len, r, x, y, z, pitch, yaw, curve = 0, radial = 5) {
  return place(hornGeometry(len, r, { radial, curve }), x, y, z, pitch, yaw, 0);
}
/** Merge `geos` into one mesh under `parent` (one bone of the rigid batch). */
function batch(parent, mat, geos, name = '') {
  // one attribute set for all of them (position, normal, aGUV; non-indexed) so they merge
  const list = geos.filter(Boolean).map((g0) => {
    const g = g0.index ? g0.toNonIndexed() : g0;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'aGUV') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    return g;
  });
  if (!list.length) return null;
  const geo = list.length === 1 ? list[0] : mergeGeometries(list, false);
  if (list.length > 1) for (const g of list) g.dispose();
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  parent.add(m);
  return m;
}
/** A small deterministic stream for the model's scatter (barnacles, coral): never Math.random. */
function stream(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A crust of barnacles round (x, y, z) on a surface facing `ny` up: little cones in the bone material. */
function barnacles(rnd, n, x, y, z, rx, rz, size = 0.22) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd());
    const s = size * (0.6 + 0.8 * rnd());
    out.push(horn(s * 1.3, s, x + Math.cos(a) * r * rx, y, z + Math.sin(a) * r * rz, -Math.PI / 2 + (rnd() - 0.5) * 0.6, rnd() * 6.28, 0, 5));
  }
  return out;
}
/** A coral antler: a trunk and a few forks, each a thin cone (the crown). */
function coral(rnd, x, y, z, len, r, pitch, yaw, forks = 3) {
  const out = [horn(len, r, x, y, z, pitch, yaw, 0.12, 5)];
  for (let i = 0; i < forks; i++) {
    const t = 0.35 + 0.5 * rnd(), cp = Math.cos(pitch), d = [Math.sin(yaw) * cp, -Math.sin(pitch), Math.cos(yaw) * cp];
    out.push(horn(len * (0.35 + 0.25 * rnd()), r * 0.55, x + d[0] * len * t, y + d[1] * len * t, z + d[2] * len * t, pitch + (rnd() - 0.6) * 0.9, yaw + (rnd() - 0.5) * 1.6, 0.1, 4));
  }
  return out;
}
/** A kelp ribbon hanging from (x, y, z): a thin flat strip, gently curved. */
function kelp(rnd, x, y, z, len, w) {
  const g = new THREE.PlaneGeometry(w, len, 1, 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getY(i) / len) * 2.4 + rnd()) * 0.25);
  g.translate(0, -len / 2, 0);
  g.rotateY(rnd() * Math.PI);
  g.translate(x, y, z);
  g.computeVertexNormals();
  // aGUV: across the ribbon, along it (glyphs point down it)
  const n = p.count, uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    uv[i * 2] = (i % 2) * w;
    uv[i * 2 + 1] = -Math.floor(i / 2) * (len / 4);
  }
  g.setAttribute('aGUV', new THREE.BufferAttribute(uv, 2));
  g.deleteAttribute('uv');
  return g;
}

/** One arm: upper, fore, hand (palm, four webbed fingers of two joints, a hooked thumb). s = -1 left, 1 right. */
function buildArm(root, M, s, L, rnd) {
  const P = BODY.palm, F = BODY.finger;
  const upper = joint(root, `arm${s}Upper`);
  batch(upper, M.limb, [seg([0, 0, 0], [0, 0, BODY.upper], { r0: 2.1, r1: 1.6, radial: 12, rings: 5, bulge: 0.25 })], 'upper');
  if (L.barnacles) batch(upper, M.bone, barnacles(rnd, 14, 0, 1.8, 2.5, 1.2, 2.2, 0.32), 'upperCrust');
  const fore = joint(root, `arm${s}Fore`);
  batch(fore, M.limb, [seg([0, 0, 0], [0, 0, BODY.fore], { r0: 1.7, r1: 1.15, radial: 12, rings: 5, bulge: 0.2 }), ell(1.6, 1.4, 1.8, 0, 0, 0)], 'fore');
  // the drowned light on the inner arm (its underside)
  batch(fore, M.seam, [seg([0, -0.75, 1.5], [0, -0.55, BODY.fore - 1.2], { r0: 1.05, r1: 0.7, sx: 1.1, sy: 0.6, radial: 8, rings: 4 })], 'foreSeam');
  const kelpG = [];
  if (L.kelp) for (let i = 0; i < 5; i++) kelpG.push(kelp(rnd, (rnd() - 0.5) * 1.6, -0.9, BODY.fore - 1.5 - rnd() * 2.5, 2.2 + rnd() * 1.8, 0.35 + rnd() * 0.2));
  if (L.kelp) batch(fore, M.web, kelpG, 'kelp');
  // the hull plate grown onto one forearm (look c)
  if (L.wreck && s > 0) batch(fore, M.bone, [place(new THREE.BoxGeometry(2.6, 0.25, 5.2, 2, 1, 4).toNonIndexed(), 0, 1.5, BODY.fore * 0.5, 0.1, 0.05, 0.25)].map(guvBox), 'hullPlate');
  const hand = joint(root, `arm${s}Hand`);
  // +Z = toward the fingers, +Y = the back of the hand; the palm faces -Y
  batch(hand, M.hide, [ell(P.wide * 0.5, P.thick * 0.5, P.len * 0.5, 0, 0, P.len * 0.5, 0, 0, 0, [14, 8]), ell(1.3, 0.9, 1.4, 0, 0.1, 0.2)], 'palm');
  batch(hand, M.seam, [ell(P.wide * 0.42, 0.18, P.len * 0.42, 0, -P.thick * 0.42, P.len * 0.52, 0, 0, 0, [12, 6])], 'palmSeam');
  if (L.barnacles) batch(hand, M.bone, barnacles(rnd, 22, 0, P.thick * 0.42, P.len * 0.82, P.wide * 0.42, 0.45, 0.18), 'knuckles');
  const fingers = [];
  const xs = [-1.5, -0.5, 0.5, 1.5].map((v) => (v * P.wide) / 4.4);
  for (let i = 0; i < 4; i++) {
    const k = joint(hand, `f${i}`, xs[i], 0.05, P.len * 0.92);
    k.rotation.y = (xs[i] / P.wide) * 0.5;
    const l0 = F.len * 0.56, l1 = F.len * 0.44;
    batch(k, M.limb, [seg([0, 0, 0], [0, 0, l0], { r0: F.r, r1: F.r * 0.85, radial: 8, rings: 3 })], 'f0');
    // the web to the next finger: a thin flat lobe on the proximal joint
    if (i < 3) batch(k, M.web, [ell(P.wide / 8.5, 0.06, l0 * 0.42, P.wide / 8.8, -0.05, l0 * 0.42, 0, 0, 0, [8, 4])], 'web');
    const t = joint(k, `f${i}t`, 0, 0, l0);
    batch(t, M.limb, [seg([0, 0, 0], [0, 0, l1], { r0: F.r * 0.85, r1: F.r * 0.55, radial: 8, rings: 3 })], 'f1');
    batch(t, M.claw, [horn(0.9, F.r * 0.55, 0, -0.05, l1 - 0.1, 0.55, 0, 0.35, 6)], 'claw');
    fingers.push({ k, t, l0, l1 });
  }
  // the hooked thumb, low on the hand's inner side (toward the body's middle)
  const tb = joint(hand, 'thumb', -s * P.wide * 0.46, -0.1, P.len * 0.3);
  tb.rotation.y = -s * 0.9;
  batch(tb, M.limb, [seg([0, 0, 0], [0, 0, 1.6], { r0: F.r * 1.1, r1: F.r * 0.8, radial: 8, rings: 3 })], 'thumb0');
  const tt = joint(tb, 'thumbT', 0, 0, 1.6);
  batch(tt, M.limb, [seg([0, 0, 0], [0, 0, 1.1], { r0: F.r * 0.8, r1: F.r * 0.5, radial: 8, rings: 3 })], 'thumb1');
  batch(tt, M.claw, [horn(0.8, F.r * 0.5, 0, -0.05, 1.0, 0.7, 0, 0.35, 6)], 'thumbClaw');
  return { upper, fore, hand, fingers, thumb: { k: tb, t: tt } };
}

/** A box's aGUV (it gets none of its own): planar over its x / z. */
function guvBox(g) {
  const p = g.attributes.position, n = p.count, uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    uv[i * 2] = p.getX(i);
    uv[i * 2 + 1] = p.getZ(i) + p.getY(i);
  }
  g.setAttribute('aGUV', new THREE.BufferAttribute(uv, 2));
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

/** The head: a broad flat wedge, a heavy brow, a short upper jaw, two mandibles, the crown. */
function buildHead(root, M, L, rnd) {
  const H = BODY.head, w = H.wide / 2;
  const head = joint(root, 'head');
  // the skull: wide and low, its back at the neck (z 0), the snout at z = len
  batch(head, M.head, [
    ell(w * 0.92, H.tall * 0.3, H.len * 0.42, 0, 0.3, H.len * 0.45, 0, 0, 0, [16, 10]),
    ell(w * 0.62, H.tall * 0.22, H.len * 0.3, 0, 0.0, H.len * 0.78, 0.08, 0, 0, [14, 8]), // the upper jaw
    ell(w * 0.85, H.tall * 0.16, H.len * 0.16, 0, H.tall * 0.3, H.len * 0.58, -0.15, 0, 0, [14, 6]), // the brow, one heavy ridge
    ell(w * 0.7, H.tall * 0.32, H.len * 0.22, 0, 0.2, H.len * 0.12, 0, 0, 0, [12, 8]), // the back of the skull
  ], 'skull');
  // the gills: three slits a side behind the jaw (the drowned light)
  const gills = [];
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) gills.push(ell(0.12, 0.65, 0.22, sx * w * 0.86, -0.35, H.len * (0.18 + i * 0.09), 0, 0, sx * 0.25, [6, 6]));
  batch(head, M.seam, gills, 'gills');
  // the eyes: in a slanted row under the brow, each in a dark socket (the slant lives in the eye and the brow)
  const eyes = [], pits = [];
  const n = L.eyes >= 6 ? 3 : 1;
  for (const sx of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.3 : i / (n - 1), ex = sx * w * (0.48 + 0.3 * t), ey = H.tall * (0.2 - 0.06 * t), ez = H.len * (0.66 - 0.12 * t);
      pits.push(ell(0.42, 0.22, 0.34, ex, ey, ez, 0, sx * 0.55, sx * 0.35, [8, 5]));
      eyes.push(ell(0.3, 0.1, 0.2, ex + sx * 0.06, ey + 0.04, ez + 0.05, 0, sx * 0.55, sx * 0.4, [8, 4]));
    }
  }
  batch(head, M.pit, pits, 'sockets');
  batch(head, M.eye, eyes, 'eyes');
  // the throat's light, seen when the mandibles open
  const maw = batch(head, M.maw, [ell(w * 0.48, H.tall * 0.14, H.len * 0.3, 0, -H.tall * 0.12, H.len * 0.62, 0, 0, 0, [12, 6])], 'maw');
  // the mandibles: the lower jaw split in two; each opens outward and down from its hinge
  const mand = [];
  for (const sx of [-1, 1]) {
    const j = joint(head, `mand${sx}`, sx * w * 0.45, -H.tall * 0.2, H.len * 0.28);
    const len = H.len * 0.68;
    batch(j, M.head, [seg([0, 0, 0], [0, 0, len], { r0: 0.95, r1: 0.42, sx: 1.25, sy: 0.7, radial: 10, rings: 4 })], 'mandible');
    const teeth = [];
    const nt = L.comb ? 14 : 5;
    for (let i = 0; i < nt; i++) {
      const t = 0.18 + (0.78 * i) / (nt - 1);
      teeth.push(horn(L.comb ? 0.8 : 1.0, L.comb ? 0.07 : 0.16, -sx * 0.45, 0.35, len * t, -1.35, -sx * 0.3, 0, 4));
    }
    batch(j, M.teeth, teeth, 'teeth');
    mand.push(j);
  }
  // the upper teeth: a comb under the upper jaw
  const up = [];
  const nu = L.comb ? 16 : 6;
  for (let i = 0; i < nu; i++) {
    const t = i / (nu - 1), a = (t - 0.5) * 2.2;
    up.push(horn(L.comb ? 0.7 : 0.9, L.comb ? 0.06 : 0.14, Math.sin(a) * w * 0.55, -H.tall * 0.12, H.len * 0.78 + Math.cos(a) * H.len * 0.18, 1.35, 0, 0, 4));
  }
  batch(head, M.teeth, up, 'upperTeeth');
  // the crown: broken coral antlers on the back of the skull
  const crown = [];
  const big = L.crown === 'reef';
  const cn = big ? 7 : 4;
  for (let i = 0; i < cn; i++) {
    const t = cn === 1 ? 0.5 : i / (cn - 1), x = (t - 0.5) * w * 1.3;
    crown.push(...coral(rnd, x, H.tall * 0.35, H.len * (0.2 + 0.08 * Math.abs(t - 0.5)), (big ? 2.6 : 1.6) * (0.75 + 0.5 * rnd()), big ? 0.32 : 0.22, -1.0 - 0.3 * rnd(), (t - 0.5) * 1.4 + Math.PI, big ? 3 : 2));
  }
  if (L.barnacles) crown.push(...barnacles(rnd, 26, 0, H.tall * 0.42, H.len * 0.55, w * 0.7, H.len * 0.12, 0.2));
  if (L.wreck) {
    // spars grown into the crown: two broken masts
    for (const sx of [-1, 1]) crown.push(guvBox(place(new THREE.BoxGeometry(0.3, 0.3, 6.5, 1, 1, 4).toNonIndexed(), sx * w * 0.35, H.tall * 0.9, H.len * 0.05, -0.9, Math.PI + sx * 0.35, sx * 0.2)));
  }
  batch(head, M.bone, crown, 'crown');
  if (L.kelp) {
    const k = [];
    for (let i = 0; i < 7; i++) k.push(kelp(rnd, (rnd() - 0.5) * w * 1.4, H.tall * 0.3, H.len * (0.1 + 0.25 * rnd()), 2.4 + rnd() * 2.4, 0.4));
    batch(head, M.web, k, 'crownKelp');
  }
  return { head, mand, maw };
}

/**
 * Build the colossus in the look `look` (looks.js). Returns { root, mats, glow, arms: [L, R], neck: [3
 * joints], head, mand: [L, R], body, shed }. The rig places every joint (rig.js).
 */
export function buildColossus(U, look = tideLook()) {
  const L = look, M = createTideMaterials(U), rnd = stream(0x7ea5);
  const root = new THREE.Group();
  root.name = 'tideColossus';
  // the body: shoulders and a humped back as a few big masses in the sea, in the fog (no shadow)
  const body = joint(root, 'body');
  const B = [
    ell(15, 4.6, 7.5, 0, 5, 8, 0.05, 0, 0, [18, 10]), // the shoulders' yoke
    ell(11, 5.2, 10, 0, 6, -3, -0.08, 0, 0, [18, 10]), // the humped back
    ell(8, 4.2, 9, 0, 4.5, -15, -0.12, 0, 0, [14, 8]), // the back sinking into the sea
    ell(3.6, 3.2, 3.8, -12, 6, 11, 0, 0, 0.2, [12, 8]), ell(3.6, 3.2, 3.8, 12, 6, 11, 0, 0, -0.2, [12, 8]), // the shoulder balls
  ];
  batch(body, M.body, B, 'bodyMass');
  // rounded reef on the back: lumps, never a row of plates
  const reef = [];
  for (let i = 0; i < (L.barnacles ? 9 : 4); i++) {
    const a = rnd() * Math.PI * 2, r = 4 + rnd() * 6;
    reef.push(ell(1.4 + rnd() * 1.6, 0.9 + rnd(), 1.4 + rnd() * 1.6, Math.cos(a) * r, 10.2 + rnd() * 0.8, -3 + Math.sin(a) * r * 0.8, 0, rnd() * 3, 0, [8, 6]));
  }
  if (L.barnacles) for (const sx of [-1, 1]) reef.push(...barnacles(rnd, 18, sx * 11, 9, 10, 3, 3, 0.4));
  batch(body, M.bone, reef, 'reef');
  if (L.wreck) {
    // an anchor chain over the left shoulder: links in a sagging run
    const links = [];
    for (let i = 0; i < 14; i++) {
      const t = i / 13, x = -16 + t * 9, y = 8.5 + Math.sin(t * Math.PI) * 2.6, z = 12 - t * 6;
      const g = new THREE.TorusGeometry(0.55, 0.14, 4, 8);
      g.rotateY(i % 2 ? 1.57 : 0);
      g.rotateZ(0.6);
      g.translate(x, y, z);
      links.push(guvBox(g.toNonIndexed()));
    }
    batch(body, M.bone, links, 'chain');
  }
  // the neck: three segments from the yoke to the back of the skull
  const neck = [];
  for (let i = 0; i < BODY.neckSegs; i++) {
    const j = joint(root, `neck${i}`);
    batch(j, M.hide, [seg([0, 0, 0], [0, 0, 4.6], { r0: 2.5 - i * 0.2, r1: 2.3 - i * 0.2, radial: 12, rings: 4 })], 'neck');
    batch(j, M.seam, [seg([0, -1.5 + i * 0.12, 0.3], [0, -1.4 + i * 0.12, 4.3], { r0: 1.4, r1: 1.3, sx: 1.3, sy: 0.55, radial: 8, rings: 3 })], 'throat');
    neck.push(j);
  }
  const arms = [buildArm(root, M, -1, L, rnd), buildArm(root, M, 1, L, rnd)];
  const head = buildHead(root, M, L, rnd);
  // what casts a shadow on the shelf: the hands, the forearms, the head (a hand's shadow is an honest tell)
  for (const a of arms) {
    markCaster(a.hand);
    markCaster(a.fore);
  }
  markCaster(head.head);
  return { root, mats: M, glow: GLOW, arms, neck, head: head.head, mand: head.mand, maw: head.maw, body, look: L };
}
