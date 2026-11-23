import * as THREE from 'three';
import { ellipsoidGeometry } from '../../../render/glyphGeometry.js';
import { registerItem } from '../../player/gear/index.js';
import { buildFreeHand } from '../../player/gear/hands.js';
import {
  shellGeometry, skirtSheet, bandGeometry, boxGeometry, kiteGeometry, mergeGeometries, sub, lerp, limb, gripFist, place, orient,
} from '../../player/heroGeo.js';
import { toDragonLook } from '../ashDisciple/bodyArt.js';
import { FOX_ART } from './bodyArt.js';
import { foxLookNow } from './look.js';

// Wen Yao's outfit (ADR-147): gear items `fox.*` on the hero's skeleton, so he and each of his five
// paper selves are built by the same buildHero(U, FOX_LOADOUT) and driven by the same animator. One
// item per slot; each builds the outfit `?foxLook=` asks for (look.js foxLookNow, read when the rig is
// built) and, for a / b / c, turns the rig to the wyrm's art path at the first item (toDragonLook with
// bodyArt.js FOX_ART; d stays in the hero's ink-line art).
//
// He fights BARE-HANDED (the owner: "a fist fighter"): no weapon item; the right fist, its knuckles
// wrapped, hangs on the sword joint (FOX_FIST is his kit.blade, as Tian Lei's FIST); the left hand
// stays open (the Pearl is shaped in it). The outfits are a fist fighter's, loud and quick, with fox
// folklore (a kitsune mask, a pelt, a tail charm) and a long streaming scarf or sash; original, not a
// copy of any one hero (no jumpsuit, no forehead plate, no whisker marks, no emblem, no blond spikes):
//   a  the Shrine Fox: a bone-white fox mask over the face and crown (a long muzzle, two tall ears), a
//      charcoal-indigo robe cut short, its sleeves tied back above the elbow with a vermilion cord that
//      crosses his back, the forearms bare and wrapped, a pale fur stole, wrapped shins, a long
//      vermilion sash hanging behind on a spring.
//   b  the Wild Fox: a short sleeveless amber jacket with a stand collar over a dark undershirt, dark
//      trousers gathered into wrapped shins, an untamed upswept crest of dark red-brown hair, the kitsune
//      half-mask pushed to the side of his head, a long vermilion scarf streaming from his neck, a fox-tail
//      charm at his hip.
//   c  the Pelt Brawler: a quilted russet jerkin, a fox's head on his left shoulder with its pelt as a
//      half cape (a streamer), the mask pushed up on the brow like a crest, a short split skirt.
//   d  outfit a in the ink-line art.
// Every outfit: bare, wrapped forearms and fists.
//
// Built for the art path (docs/STYLE.md "The house style"): low-poly parts with FLAT facets (facet()),
// each facet one tone; few, big parts in tones far apart. Six rigs of him are built (him and the five
// selves): every mesh is a bone of the rigid batch, so each outfit stays under ~60 meshes.
//
// Materials (each rig's own instances; bodyArt.js gives each its colour per outfit):
//   welt the mask, the tail charm's tip · hem fur, the fox's head and pelt, the tail charm
//   coat the robe / jacket / jerkin · lining their insides · pants trousers · piping the wraps
//   facing the vermilion sash, cords and scarf · shirt shoes, the undershirt, darks · hair · skin
//   eye the mask's slits, nose and ear insides · leather belts and straps.

const YSP = 1.035, YPV = 0.955, YCH = 1.225; // REST.spine / pelvis / chest (heroDims.js REST)
const ySp = (h) => h - YSP, yPv = (h) => h - YPV, yCh = (h) => h - YCH;

/** Flat facets: every triangle its own normal (the art path prints each facet as one tone). */
function facet(g) {
  const n = g.index ? g.toNonIndexed() : g;
  if (n !== g) g.dispose();
  n.computeVertexNormals();
  return n;
}
/** A kite (octahedron) placed and turned: the faceted building block of the masks, the hair, the charms. */
const kite = (x, y, z, at, rot = [0, 0, 0], o = {}) => place(kiteGeometry(x, y, z, o), at[0], at[1], at[2], rot[0], rot[1], rot[2]);

/** Grown body-shell rings (heroDims BODY.shell), in spine space. */
function bodyRings(BODY, grow, extra = []) {
  return [...BODY.shell.map((r) => ({ ...r, rx: r.rx + grow, rz: r.rz + grow, gap: 0 })), ...extra].map((r) => ({ ...r, y: ySp(r.y) }));
}

/** A sheet `L` long hanging −Y from its joint, `wa` → `wb` wide, `th` thick (closed: seen from both sides). */
function hangingSheet(L, wa, wb, th, x = 0) {
  const g = boxGeometry(1, 1, th);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = 0.5 - p.getY(i);
    p.setXYZ(i, x + p.getX(i) * lerp(wa, wb, t), -t * L, p.getZ(i));
  }
  return facet(g);
}

/** A flat strap (a cord, a belt across the body) from a to b, `w` wide, `th` thick, its flat facing `n`. */
function strap(a, b, w, th, n = [0, 0, 1]) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const g = boxGeometry(w, A.distanceTo(B), th);
  const y = B.clone().sub(A).normalize(), z = new THREE.Vector3(...n);
  z.addScaledVector(y, -z.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z).setPosition(A.add(B).multiplyScalar(0.5)));
  return facet(g);
}

/** Two tails hanging from one spring root (the sash, the scarf): `L` [upper, lower], `w` their width. */
function tails({ mesh, joint }, parent, at, mat, L, w, th = 0.014) {
  const base = joint(parent, ...at);
  base.rotation.y = Math.PI;
  const s0 = joint(base);
  mesh(s0, mergeGeometries([hangingSheet(L[0], w, w * 0.93, th, w * 0.55), hangingSheet(L[0], w * 0.93, w * 0.87, th, -w * 0.5)]), mat);
  const s1 = joint(s0, 0, -L[0], 0);
  mesh(s1, mergeGeometries([hangingSheet(L[1], w * 0.93, w * 0.8, th * 0.85, w * 0.55), hangingSheet(L[1] * 0.72, w * 0.87, w * 0.66, th * 0.85, -w * 0.5)]), mat);
  return { s0, s1 };
}

// ================================================================ head
/** The mask's size: drawn larger than a face (`k` about the face's middle) and its ears taller still
 *  (`ear`), so at the game camera it owns its letter cells instead of sharing them with the dark hair. */
const MASK = { k: 1.2, ear: 1.3, at: [0, 0.14, 0.03] };

/** The kitsune mask (head space, before BODY.headScale; the face's front is at z ≈ 0.095): a diamond
 *  face plate, a long muzzle, two tall ears. Returns { welt, eye } geometries. */
function maskParts() {
  const { welt, eye } = maskRaw();
  const [cx, cy, cz] = MASK.at;
  const grow = (g) => g.translate(-cx, -cy, -cz).scale(MASK.k, MASK.k, MASK.k).translate(cx, cy, cz);
  return { welt: welt.map(grow), eye: eye.map(grow) };
}
function maskRaw() {
  const welt = [
    // the face plate: a faceted diamond, its point between the eyes; the brow and cheeks its four planes
    kite(0.09, 0.108, 0.048, [0, 0.14, 0.068], [0, 0, 0], { zNeg: 1.5 }),
    // the long muzzle, from the brow to a point well past the face
    kite(0.032, 0.03, 0.085, [0, 0.098, 0.15], [0.12, 0, 0], { zNeg: 0.55 }),
  ];
  const eye = [
    // the eye slits, slanted up toward the temples
    boxGeometry(0.036, 0.01, 0.016, 0.034, 0.163, 0.1, 0, -0.35, 0.38),
    boxGeometry(0.036, 0.01, 0.016, -0.034, 0.163, 0.1, 0, 0.35, -0.38),
    // the nose at the muzzle's point
    kite(0.012, 0.011, 0.012, [0, 0.112, 0.228]),
  ];
  for (const s of [1, -1]) {
    // the tall ears, leaning out and back
    welt.push(kite(0.034, 0.08, 0.016, [s * 0.058, 0.262, 0.03], [-0.22, 0, -s * 0.3], { yPos: 1.35 * MASK.ear }));
    eye.push(kite(0.018, 0.055, 0.006, [s * 0.061, 0.258, 0.046], [-0.22, 0, -s * 0.3], { yPos: 1.3 * MASK.ear }));
  }
  return { welt: welt.map(facet), eye: eye.map(facet) };
}
/** The mask moved: scaled `k`, turned (X, then Y, then Z) and set at `at` (head space). */
function maskAt(k, rot, at) {
  const { welt, eye } = maskParts();
  const m = new THREE.Matrix4().makeTranslation(...at)
    .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'ZYX')))
    .multiply(new THREE.Matrix4().makeScale(k, k, k))
    .multiply(new THREE.Matrix4().makeTranslation(0, -0.15, -0.06));
  const put = (g) => g.applyMatrix4(m);
  return { welt: welt.map(put), eye: eye.map(put) };
}

function headA({ head, M, mesh }) {
  const { welt, eye } = maskParts();
  // the mask's brow runs back over the crown to the ears (the game camera sees the top of his head
  // far more than his face: from above, the head is the pale shape with two ears)
  welt.push(facet(kite(0.1, 0.06, 0.105, [0, 0.232, -0.005], [-0.12, 0, 0], { zNeg: 0.95 })));
  mesh(head, mergeGeometries(welt), M.welt);
  mesh(head, mergeGeometries(eye), M.eye);
  // the dark hair behind the mask, tied low at the nape
  mesh(head, mergeGeometries([
    facet(ellipsoidGeometry(0.092, 0.1, 0.098, { widthSegs: 9, heightSegs: 6 }).translate(0, 0.165, -0.025)),
    facet(kite(0.03, 0.06, 0.03, [0, 0.07, -0.11], [0.5, 0, 0])),
  ]), M.hair);
}

/** The Wild Fox's hair: an untamed crest swept up and back from the brow, its points flaring out at
 *  the crown and over the ears ([x, y, z] base, [rx, rz] lean, length, width). Head space. */
const WILD_HAIR = [
  [0, 0.25, 0.06, -0.45, 0, 0.11, 0.04],
  [0.045, 0.245, 0.05, -0.5, -0.45, 0.1, 0.036],
  [-0.045, 0.245, 0.05, -0.5, 0.45, 0.1, 0.036],
  [0, 0.26, -0.01, -0.95, 0, 0.12, 0.042],
  [0.06, 0.24, -0.02, -0.9, -0.7, 0.11, 0.038],
  [-0.06, 0.24, -0.02, -0.9, 0.7, 0.11, 0.038],
  [0.085, 0.19, -0.04, -1.3, -1.1, 0.09, 0.034],
  [-0.085, 0.19, -0.04, -1.3, 1.1, 0.09, 0.034],
  [0, 0.21, -0.08, -1.6, 0, 0.1, 0.04],
];

function headB({ head, M, mesh }) {
  // the hair: a cap over the skull, and the crest's points (kites standing on their base: yPos lengthens
  // the upper half, the lower half sinks into the cap)
  const hair = [facet(ellipsoidGeometry(0.093, 0.1, 0.1, { widthSegs: 9, heightSegs: 6 }).translate(0, 0.168, -0.02))];
  for (const [x, y, z, rx, rz, L, w] of WILD_HAIR) hair.push(facet(kite(w, L * 0.5, w * 0.7, [x, y, z], [rx, 0, rz], { yPos: 2.0 })));
  mesh(head, mergeGeometries(hair), M.hair);
  // the kitsune half-mask pushed to the side of his head: over his left temple, its muzzle turned out
  // and up, held by a vermilion cord round the head
  const { welt, eye } = maskAt(0.62, [-0.35, 1.25, 0.35], [0.092, 0.2, 0.0]);
  mesh(head, mergeGeometries(welt), M.welt);
  mesh(head, mergeGeometries(eye), M.eye);
  mesh(head, facet(bandGeometry(0.099, 0.104, 0.012, 10).rotateX(-0.25).translate(0, 0.19, -0.015)), M.facing);
}

function headC({ head, M, mesh }) {
  // the mask pushed up on the brow: tipped back over the crown, its muzzle up, its ears laid back
  const { welt, eye } = maskAt(0.85, [-1.15, 0, 0], [0, 0.25, 0.05]);
  mesh(head, mergeGeometries(welt), M.welt);
  mesh(head, mergeGeometries(eye), M.eye);
  // the dark hair, a topknot under the mask
  mesh(head, mergeGeometries([
    facet(ellipsoidGeometry(0.09, 0.098, 0.096, { widthSegs: 9, heightSegs: 6 }).translate(0, 0.162, -0.022)),
    facet(kite(0.034, 0.05, 0.034, [0, 0.13, -0.11], [0.4, 0, 0])),
  ]), M.hair);
}

// ================================================================ chest
function chestA({ spine, chest, M, BODY, mesh }) {
  // the robe's body: a faceted shell over the torso
  mesh(spine, facet(shellGeometry(bodyRings(BODY, 0.016, [{ y: 1.53, rx: 0.07, rz: 0.068 }]), { sub: 1, cols: 12 })), M.coat);
  // the fur stole over the shoulder caps, a collar of fur round the neck; it stops at the top of the
  // chest so the robe's dark shows below it
  const rings = [
    { y: yCh(1.39), rx: 0.272, rz: 0.19, cz: -0.014, gap: 0 },
    { y: yCh(1.445), rx: 0.262, rz: 0.182, cz: -0.012, gap: 0 },
    { y: yCh(1.49), rx: 0.2, rz: 0.15, cz: -0.006, gap: 0 },
    { y: yCh(1.525), rx: 0.122, rz: 0.112, cz: 0, gap: 0 },
    { y: yCh(1.565), rx: 0.096, rz: 0.096, cz: 0, gap: 0 },
  ];
  const g = shellGeometry(rings, { sub: 1, cols: 14 });
  // tufts: the hem's columns drop in turn, deeper over the back and the arms than at the chest
  const p = g.attributes.position;
  for (let i = 0; i <= 14; i++) {
    const z = p.getZ(i), side = Math.abs(p.getX(i)) / 0.272;
    const deep = z < 0 ? 0.07 : lerp(0.025, 0.06, side);
    p.setY(i, p.getY(i) - (i % 2 === 0 ? deep : deep * 0.25));
  }
  mesh(chest, facet(g), M.hem);
  // the cord that ties his sleeves back (tasuki): an X across his back, from each shoulder to the
  // other side of the waist
  const zb = -0.125;
  mesh(spine, mergeGeometries([
    strap([0.17, ySp(1.42), zb], [-0.15, ySp(1.16), zb + 0.02], 0.024, 0.012, [0, 0, -1]),
    strap([-0.17, ySp(1.42), zb], [0.15, ySp(1.16), zb + 0.02], 0.024, 0.012, [0, 0, -1]),
  ]), M.facing);
}

function chestB({ spine, chest, M, BODY, mesh }) {
  // the dark undershirt, the short sleeveless jacket open over it (to the belt), a stand collar
  mesh(spine, facet(shellGeometry(bodyRings(BODY, 0.006, [{ y: 1.53, rx: 0.064, rz: 0.062 }]), { sub: 1, cols: 12 })), M.shirt);
  const rings = BODY.shell.slice(1, 6).map((r) => ({ ...r, rx: r.rx + 0.03, rz: r.rz + 0.03, gap: 0.06, y: ySp(r.y) }));
  rings.push({ y: ySp(1.535), rx: 0.105, rz: 0.098, gap: 0.04 }, { y: ySp(1.575), rx: 0.1, rz: 0.094, gap: 0.045 });
  const v = facet(shellGeometry(rings, { sub: 1, cols: 12 }));
  mesh(spine, v, M.coat);
  mesh(spine, v, M.lining);
  // the jacket's shoulders, squared and standing a little proud of the arm (a cocky line)
  mesh(chest, mergeGeometries([1, -1].map((s) => facet(kite(0.07, 0.03, 0.08, [s * 0.165, yCh(1.47), -0.005], [0, 0, -s * 0.22])))), M.coat);
}

function chestC({ spine, chest, M, BODY, mesh }) {
  // the under-robe
  mesh(spine, facet(shellGeometry(bodyRings(BODY, 0.012, [{ y: 1.53, rx: 0.07, rz: 0.068 }]), { sub: 1, cols: 12 })), M.coat);
  // the quilted jerkin over it: padded bands, each its own facets
  const bands = [
    [1.12, 1.2, 0.17, 0.13],
    [1.2, 1.28, 0.168, 0.128],
    [1.28, 1.36, 0.192, 0.142],
    [1.36, 1.45, 0.215, 0.148],
  ];
  const quilt = bands.map(([y0, y1, rx, rz], i) => sub(facet(shellGeometry([
    { y: ySp(y0), rx: rx + 0.004, rz: rz + 0.004, gap: 0.04 },
    { y: ySp((y0 + y1) / 2), rx: rx + 0.014, rz: rz + 0.014, gap: 0.04 },
    { y: ySp(y1), rx, rz, gap: 0.04 },
  ], { sub: 1, cols: 10 })), i & 1));
  mesh(spine, mergeGeometries(quilt), M.leather);
  // the cords that lace it shut down the front (vermilion)
  mesh(spine, mergeGeometries([1.18, 1.26, 1.34, 1.42].map((y) => facet(bandGeometry(0.03, 0.022, 0.012, 6).translate(0, ySp(y), 0.15)))), M.facing);
}

// ================================================================ shoulders (c: the fox's head and its pelt)
function shouldersC({ chest, arms, M, mesh, joint }) {
  const up = arms.L.upper;
  // a fox's head strapped to the left shoulder, its muzzle forward, its ears up by the neck
  const head = [
    kite(0.085, 0.07, 0.1, [0.03, 0.02, 0], [0, 0, -0.35], { zNeg: 1.2 }),
    kite(0.035, 0.03, 0.08, [0.07, -0.04, 0.075], [0.45, 0, -0.5], { zNeg: 0.5 }),
    kite(0.026, 0.055, 0.012, [0.0, 0.085, 0.02], [-0.25, 0, 0.35], { yPos: 1.3 }),
    kite(0.026, 0.055, 0.012, [0.07, 0.07, -0.05], [-0.25, 0, -0.8], { yPos: 1.3 }),
  ];
  mesh(up, mergeGeometries(head.map(facet)), M.hem);
  mesh(up, mergeGeometries([
    boxGeometry(0.03, 0.008, 0.014, 0.05, 0.03, 0.075, 0, 0, -0.6),
    kite(0.012, 0.011, 0.012, [0.105, -0.075, 0.13]),
  ].map(facet)), M.eye);
  // the pelt: from the head back over the left shoulder blade, a half cape on a spring
  const base = joint(chest, 0.12, yCh(1.47), -0.11);
  base.rotation.y = Math.PI - 0.35;
  const s0 = joint(base);
  const w0 = 0.2, w1 = 0.24, w2 = 0.12;
  mesh(s0, hangingSheet(0.3, w0, w1, 0.022), M.hem);
  const s1 = joint(s0, 0, -0.3, 0);
  // the tail end: narrowing to a brush
  mesh(s1, hangingSheet(0.32, w1, w2, 0.022), M.hem);
  return { streamers: [{ segs: [s0, s1], len: [0.3, 0.32], out: 0.1, lag: 0.6, max: 1.45, w: [w0, w1, w2], wrap: 0.3 }] };
}

// ================================================================ back (b: the scarf)
function backB(ctx) {
  const { chest, M, mesh } = ctx;
  // wound twice round the neck, a knot at the back, two long tails that stream behind him
  mesh(chest, mergeGeometries([
    sub(facet(bandGeometry(0.1, 0.098, 0.045, 10).translate(0, yCh(1.52), -0.004)), 0),
    sub(facet(bandGeometry(0.112, 0.108, 0.04, 10).rotateX(0.2).translate(0, yCh(1.49), -0.008)), 1),
    facet(kite(0.05, 0.035, 0.03, [0.02, yCh(1.5), -0.115])),
  ]), M.facing);
  const L = [0.32, 0.46];
  const { s0, s1 } = tails(ctx, chest, [0.02, yCh(1.49), -0.12], M.facing, L, 0.075, 0.012);
  // a light ribbon: it streams out level at a run (lag 1), high off his back at rest
  return { streamers: [{ segs: [s0, s1], len: L, out: 0.22, lag: 1.0, max: 2.2, inMax: [0.2, 0.6], w: [0.15, 0.14, 0.12], wrap: 0.25 }] };
}

// ================================================================ arms: bare, wrapped forearms and fists
/** Cloth wraps round a limb (fore / shin space) from y0 down to y1, n bands. */
function wraps(y0, y1, n, r0, r1) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1), y = lerp(y0, y1, t), r = lerp(r0, r1, t) + 0.005;
    out.push(sub(facet(limb({ length: (y0 - y1) / n + 0.012, r0: r + 0.003, r1: r, radial: 7, rings: 1, capSegs: 1 }).translate(0, y + 0.006, 0)), i & 1));
  }
  return mergeGeometries(out);
}

/** The free hand open, palm up in his guard: buildFreeHand's hand (palm toward the body) turned on the
 *  forearm's axis (rad; measured in GUARD, poses.js). */
const PALM_TURN = 2.1;

function armsFor(ctx, look) {
  const { arms, sword, M, DIM, BODY, mesh } = ctx;
  const [ua0, ua1] = BODY.upperArm, [fa0, fa1] = BODY.foreArm, HK = BODY.hand;
  for (const side of [-1, 1]) {
    const { upper, fore } = arms[side < 0 ? 'R' : 'L'];
    if (look === 'a') {
      // the robe's sleeve tied back: gathered in a puff over the upper arm, bound above the elbow
      mesh(upper, facet(limb({ length: DIM.upperArm - 0.03, r0: ua0 + 0.026, r1: ua1 + 0.032, bulge: 0.02, radial: 8, rings: 3 })), M.coat);
      mesh(upper, facet(bandGeometry(ua1 + 0.03, ua1 + 0.03, 0.022, 8).translate(0, -DIM.upperArm + 0.045, 0)), M.facing);
    } else {
      // bare: a fighter's arm, the shoulder cap a little full
      mesh(upper, mergeGeometries([
        facet(limb({ length: DIM.upperArm, r0: ua0 + 0.002, r1: ua1 + 0.002, bulge: 0.012, radial: 8, rings: 3 })),
        facet(ellipsoidGeometry(BODY.deltoid[0] + 0.004, BODY.deltoid[1], BODY.deltoid[2] + 0.004, { widthSegs: 8, heightSegs: 5 }).translate(side * 0.01, -0.02, 0)),
      ]), M.skin);
    }
    // the bare forearm, wrapped from below the elbow over the wrist (the right one over the back of the fist)
    mesh(fore, facet(limb({ length: 0.12, r0: ua1 + 0.002, r1: fa0, radial: 8, rings: 1 })), M.skin);
    const y0 = -0.1, y1 = -DIM.foreArm + 0.04;
    const wr = [wraps(y0, y1, 5, fa0, fa1)];
    if (side < 0) wr.push(facet(ellipsoidGeometry(0.036 * HK, 0.04 * HK, 0.04 * HK, { widthSegs: 8, heightSegs: 5 }).translate(0, -DIM.foreArm + 0.02, 0.004)));
    mesh(fore, mergeGeometries(wr), M.piping);
  }
  // the right fist on the sword joint, its knuckles wrapped (Tian Lei's, ascendant/gear.js)
  {
    const F = gripFist(HK);
    mesh(sword, mergeGeometries([F.fingers, F.thumb, F.ridge]), M.skin);
    const kx = 0.034 * HK * 1.1 + 0.004, ky = 0.034 * HK * 0.92 + 0.004;
    mesh(sword, mergeGeometries([
      sub(facet(bandGeometry(kx, ky + 0.002, 0.03, 10).rotateX(Math.PI / 2).translate(0, 0, -0.024)), 0),
      sub(facet(bandGeometry(kx + 0.002, ky + 0.004, 0.028, 10).rotateX(Math.PI / 2).translate(0, 0, 0.028)), 1),
    ]), M.piping);
  }
  // the free hand: open (the Pearl's hand), the grip, the sword fingers (never shown: no seals)
  const hand = buildFreeHand(ctx);
  hand.offHand.open.geometry.rotateY(PALM_TURN);
  return hand;
}

// ================================================================ legs
function legsFor({ pelvis, legs, M, DIM, BODY, mesh }, look) {
  {
    const [hx, hy, hz] = BODY.hips.r;
    const w = look === 'b' ? 0.022 : 0.012;
    mesh(pelvis, facet(orient.up(ellipsoidGeometry(hx + w, hz + w, hy + w, { widthSegs: 10, heightSegs: 6 })).translate(...BODY.hips.c)), M.pants);
  }
  const [th0, th1] = BODY.thigh, [sh0, sh1] = BODY.shin;
  // loose trousers (b: looser, the knee full), pale wraps from under the knee to the ankle
  const full = look === 'b' ? 0.012 : 0;
  for (const side of [-1, 1]) {
    const { thigh, shin, foot } = legs[side < 0 ? 'R' : 'L'];
    mesh(thigh, facet(limb({ length: DIM.thigh, r0: th0 + 0.016 + full, r1: th1 + 0.02 + full * 1.5, bulge: 0.014 + full, radial: 8, rings: 3 })), M.pants);
    mesh(shin, facet(limb({ length: 0.12, r0: th1 + 0.02 + full * 1.5, r1: sh0 + 0.012 + full, radial: 8, rings: 1 })), M.pants);
    mesh(shin, wraps(-0.11, -DIM.shin + 0.05, 5, sh0, sh1), M.piping);
    const F = BODY.foot;
    mesh(foot, facet(ellipsoidGeometry(F.r[0] * 0.92, F.r[1] * 0.85, F.r[2] * 0.95, { widthSegs: 8, heightSegs: 5 }).translate(F.c[0], F.c[1] - 0.004, F.c[2])), M.shirt);
  }
}

// ================================================================ waist: the robe's skirt, the sash
/** The short robe's skirt on the coat springs (anim.js _coat): two front panels that overlap, two back
 *  panels, slits at the sides, cut to mid-thigh for kicking. COAT_PANELS' fields (gear/wanderer.js). */
export const FOX_PANELS = [
  { az: 0.45, w: [0.2, 0.23, 0.26], len: [0.15, 0.16], strips: [], fork: [], out: 0.008, flare: 0.1, skew: 0.6 },
  { az: -0.45, w: [0.2, 0.23, 0.26], len: [0.15, 0.16], strips: [], fork: [], out: 0, flare: 0.1, skew: -0.6 },
  { az: 2.4, w: [0.2, 0.25, 0.28], len: [0.15, 0.18], strips: [], fork: [], out: 0.006, flare: 0.16, skew: -0.4 },
  { az: -2.4, w: [0.2, 0.25, 0.28], len: [0.15, 0.18], strips: [], fork: [], out: 0.006, flare: 0.16, skew: 0.4 },
];

function skirt({ pelvis, M, DIM, mesh, joint }, P_LIST, mat = M.coat) {
  const coat = [];
  P_LIST.forEach((P, i) => {
    const sa = Math.sin(P.az), ca = Math.cos(P.az);
    const R0 = 1 / Math.hypot(sa / DIM.coatR, ca / (DIM.coatR * 0.69)) + P.out * 0.5;
    const anchor = joint(pelvis, sa * R0, DIM.coatY + 0.02, ca * R0);
    anchor.rotation.y = P.az;
    const s0 = joint(anchor);
    const sk = P.skew ?? 0, w0 = P.w[0];
    const [L0, L1] = P.len;
    const g0 = facet(skirtSheet(L0, P.w[0], P.w[1], R0, 0.25, 0, 51 + i, [0.004, 0.01, 2.5, i], 0, 1, sk, w0));
    mesh(s0, g0, mat);
    mesh(s0, g0, M.lining);
    const s1 = joint(s0, 0, -L0, 0);
    const R1 = R0 + 0.25 * L0;
    const g1 = facet(skirtSheet(L1, P.w[1], P.w[2], R1, 0.25, 0.012, 71 + i, [0.01, 0.02, 2.5, i], 0, 1, sk, w0));
    mesh(s1, g1, mat);
    mesh(s1, g1, M.lining);
    coat.push({ anchor, segs: [s0, s1], def: P, strips: [], len: [L0, L1], r0: R0 });
  });
  return coat;
}

function waistA(ctx) {
  const { spine, M, BODY, mesh } = ctx;
  const coat = skirt(ctx, FOX_PANELS);
  // the sash: a broad band round the waist, a flat knot at the back, its two long tails on a spring
  const W = BODY.shell[1];
  mesh(spine, mergeGeometries([
    facet(bandGeometry(W.rx + 0.03, W.rz + 0.03, 0.115, 12).translate(0, ySp(1.19), W.cz ?? 0)),
    facet(kite(0.07, 0.04, 0.03, [0, ySp(1.19), -(W.rz + 0.045)])),
  ]), M.facing);
  const L = [0.3, 0.36];
  const { s0, s1 } = tails(ctx, spine, [0, ySp(1.17), -(W.rz + 0.05)], M.facing, L, 0.072);
  return { coat, streamers: [{ segs: [s0, s1], len: L, out: 0.06, lag: 0.85, max: 2.0, w: [0.15, 0.14, 0.12], wrap: 0.3 }] };
}

function waistB({ pelvis, spine, M, BODY, mesh }) {
  // a dark belt, a fox-tail charm hung at his left hip: a full brush of pale fur, its tip white
  const W = BODY.shell[0];
  mesh(spine, facet(bandGeometry(W.rx + 0.028, W.rz + 0.028, 0.05, 12).translate(0, ySp(1.1), 0)), M.leather);
  const tail = (k, y, len, w) => facet(kite(w, len, w * 0.8, [0.16, yPv(y), 0.04], [0.1, 0, 0.18 + k * 0.05], { yPos: 0.6 }));
  mesh(pelvis, mergeGeometries([tail(0, 1.0, 0.13, 0.045), facet(kite(0.012, 0.03, 0.012, [0.162, yPv(1.12), 0.04]))]), M.hem);
  mesh(pelvis, facet(kite(0.03, 0.04, 0.026, [0.14, yPv(0.87), 0.04], [0.1, 0, 0.2])), M.welt);
  return { coat: [] };
}

function waistC(ctx) {
  const { spine, M, BODY, mesh } = ctx;
  const coat = skirt(ctx, FOX_PANELS);
  const W = BODY.shell[0];
  mesh(spine, facet(bandGeometry(W.rx + 0.03, W.rz + 0.03, 0.05, 12).translate(0, ySp(1.12), 0)), M.shirt);
  return { coat };
}

// ================================================================ the items
/** Each item's build: the first one turns the rig to the art path (a, b, c), then builds `fn[look]`. */
function opted(fn) {
  return (ctx) => {
    const L = foxLookNow();
    if (L.art) toDragonLook(ctx, FOX_ART[L.base] ?? FOX_ART.a);
    const f = typeof fn === 'function' ? fn : fn[L.base];
    return f ? f(ctx, L.base) : undefined;
  };
}

/** The set (registered into the hero's gear registry on import: gear/index.js registerItem). The head
 *  item says per outfit what the body keeps under it (read when the rig is built): no hair (each outfit
 *  builds its own), and the face in shadow behind a full mask (a, d). */
export const FOX_ITEMS = [
  {
    id: 'fox.head', slot: 'head', name: 'Kitsune Mask', hidesHair: true,
    get shadowsFace() {
      return foxLookNow().base === 'a';
    },
    build: opted({ a: headA, b: headB, c: headC }),
  },
  { id: 'fox.chest', slot: 'chest', name: 'Fighter\'s Jacket', build: opted({ a: chestA, b: chestB, c: chestC }) },
  { id: 'fox.shoulders', slot: 'shoulders', name: 'Fox Pelt', build: opted({ c: shouldersC }) },
  { id: 'fox.arms', slot: 'arms', name: 'Wrapped Fists', build: opted(armsFor) },
  { id: 'fox.legs', slot: 'legs', name: 'Wrapped Trousers', build: opted(legsFor) },
  { id: 'fox.waist', slot: 'waist', name: 'Vermilion Sash', build: opted({ a: waistA, b: waistB, c: waistC }) },
  { id: 'fox.back', slot: 'back', name: 'Streaming Scarf', build: opted({ b: backB }) },
];
for (const item of FOX_ITEMS) registerItem(item);

/** What he (and each of his paper selves) wears. */
export const FOX_LOADOUT = Object.freeze({
  head: 'fox.head',
  chest: 'fox.chest',
  shoulders: 'fox.shoulders',
  arms: 'fox.arms',
  legs: 'fox.legs',
  waist: 'fox.waist',
  back: 'fox.back',
  weapon: null, // (bare-handed, ADR-147: the right fist hangs on the sword joint, FOX_FIST)
});

/** His "blade": the right fist, as a short segment along the sword joint's +Z (duelist.js kit.blade;
 *  Tian Lei's FIST): from the little finger's side of the fist to past the knuckles, metres. */
export const FOX_FIST = Object.freeze({ guard: -0.06, tip: 0.075 });
