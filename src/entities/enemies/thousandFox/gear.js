import * as THREE from 'three';
import { ellipsoidGeometry } from '../../../render/glyphGeometry.js';
import { registerItem } from '../../player/gear/index.js';
import { buildFreeHand } from '../../player/gear/hands.js';
import {
  shellGeometry, skirtSheet, bandGeometry, boxGeometry, kiteGeometry, mergeGeometries, sub, lerp, limb, gripFist, place, ring, orient,
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
//   a  the Shrine Fox: a bone-white fox mask over the whole face (a long muzzle, two tall ears), a
//      charcoal-indigo short robe with wide hanging sleeves, a pale fur mantle across the shoulders,
//      wrapped forearms and shins, a long dull-vermilion sash hanging behind on the streamer springs.
//   b  the Charm-Bearer: bare-headed, white hair in a long tail (a streamer), a half mask over the eyes,
//      a sleeveless vest over bare arms, a thick rope belt hung with paper strips, wide trousers.
//   c  the Fox Captain: a light lacquered cuirass, a fox's head as the left pauldron with its pelt as a
//      half cape (a streamer), the mask pushed up on the brow like a crest, a short split skirt.
//   d  outfit a in the ink-line art.
// Every outfit: a broad dao (the weapon: today's material, thinner than an art cell).
//
// Built for the art path (docs/STYLE.md "The house style"): low-poly parts with FLAT facets (facet()),
// each facet one tone; few, big parts in tones far apart. Six rigs of him are built (him and the five
// selves): every mesh is a bone of the rigid batch, so each outfit stays under ~90 meshes.
//
// Materials (each rig's own instances; bodyArt.js gives each its colour per outfit):
//   welt the mask · hem fur, the fox's head and pelt, the paper strips · coat the robe / vest / under-robe
//   lining their insides · pants trousers · piping wraps · facing the vermilion sash and cords
//   shirt shoes, the grip's cord, darks · hair · skin · eye the mask's slits, nose and ear insides
//   leather the rope belt (b), straps (c) · spike the cuirass (c) · armor / bevel / trim the dao.

const YSP = 1.035, YPV = 0.955, YCH = 1.225; // REST.spine / pelvis / chest (heroDims.js REST)
const ySp = (h) => h - YSP, yPv = (h) => h - YPV, yCh = (h) => h - YCH;

/** Flat facets: every triangle its own normal (the art path prints each facet as one tone). */
function facet(g) {
  const n = g.index ? g.toNonIndexed() : g;
  if (n !== g) g.dispose();
  n.computeVertexNormals();
  return n;
}
/** A kite (octahedron) placed and turned: the faceted building block of the masks. */
const kite = (x, y, z, at, rot = [0, 0, 0], o = {}) => place(kiteGeometry(x, y, z, o), at[0], at[1], at[2], rot[0], rot[1], rot[2]);

/** A closed flat-faceted prism from stations along +Z: [z, xA, xB, th] (an edge from xA to xB across X,
 *  th thick along Y). The dao's blade. aGUV: x across, y along. */
function prism(st) {
  const pos = [], uv = [];
  const quad = (a, b, c, d) => {
    for (const v of [a, b, c, a, c, d]) {
      pos.push(v[0], v[1], v[2]);
      uv.push(v[0], v[2]);
    }
  };
  for (let i = 0; i < st.length - 1; i++) {
    const [z0, a0, b0, t0] = st[i], [z1, a1, b1, t1] = st[i + 1];
    const h0 = t0 / 2, h1 = t1 / 2;
    // the flats (±Y), the A edge, the B edge
    quad([a0, h0, z0], [a1, h1, z1], [b1, h1, z1], [b0, h0, z0]);
    quad([b0, -h0, z0], [b1, -h1, z1], [a1, -h1, z1], [a0, -h0, z0]);
    quad([a0, -h0, z0], [a1, -h1, z1], [a1, h1, z1], [a0, h0, z0]);
    quad([b0, h0, z0], [b1, h1, z1], [b1, -h1, z1], [b0, -h0, z0]);
  }
  const [z, a, b, t] = st[0];
  quad([a, -t / 2, z], [a, t / 2, z], [b, t / 2, z], [b, -t / 2, z]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aGUV', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Grown body-shell rings (heroDims BODY.shell), in spine space. */
function bodyRings(BODY, grow, extra = []) {
  return [...BODY.shell.map((r) => ({ ...r, rx: r.rx + grow, rz: r.rz + grow, gap: 0 })), ...extra].map((r) => ({ ...r, y: ySp(r.y) }));
}

// ================================================================ head
/** The mask's size: drawn larger than a face (`k` about the face's middle) and its ears taller still
 *  (`ear`), so at the game camera it owns its letter cells instead of sharing them with the dark hair. */
const MASK = { k: 1.2, ear: 1.3, at: [0, 0.14, 0.03] };

/** The Shrine Fox's mask (head space, before BODY.headScale; the face's front is at z ≈ 0.095): a
 *  diamond face plate, a long muzzle, two tall ears. Returns { welt, eye } geometries. */
function maskParts(full = true) {
  const { welt, eye } = maskRaw(full);
  const [cx, cy, cz] = MASK.at;
  const grow = (g) => g.translate(-cx, -cy, -cz).scale(MASK.k, MASK.k, MASK.k).translate(cx, cy, cz);
  return { welt: welt.map(grow), eye: eye.map(grow) };
}
function maskRaw(full) {
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
  if (full) {
    for (const s of [1, -1]) {
      // the tall ears, leaning out and back
      welt.push(kite(0.034, 0.08, 0.016, [s * 0.058, 0.262, 0.03], [-0.22, 0, -s * 0.3], { yPos: 1.35 * MASK.ear }));
      eye.push(kite(0.018, 0.055, 0.006, [s * 0.061, 0.258, 0.046], [-0.22, 0, -s * 0.3], { yPos: 1.3 * MASK.ear }));
    }
  }
  return { welt: welt.map(facet), eye: eye.map(facet) };
}

function headA({ head, M, mesh }) {
  const { welt, eye } = maskParts(true);
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

function headB({ head, M, mesh, joint }) {
  // the half mask: the brow and the eyes, the top of the muzzle, two short ears
  const welt = [
    kite(0.09, 0.05, 0.04, [0, 0.172, 0.075], [0, 0, 0], { zNeg: 1.4 }),
    kite(0.022, 0.018, 0.05, [0, 0.142, 0.122], [0.25, 0, 0], { zNeg: 0.5 }),
  ];
  const eye = [
    boxGeometry(0.034, 0.01, 0.016, 0.034, 0.168, 0.104, 0, -0.35, 0.38),
    boxGeometry(0.034, 0.01, 0.016, -0.034, 0.168, 0.104, 0, 0.35, -0.38),
  ];
  for (const s of [1, -1]) welt.push(kite(0.026, 0.045, 0.012, [s * 0.07, 0.235, 0.045], [-0.15, 0, -s * 0.55], { yPos: 1.3 }));
  mesh(head, mergeGeometries(welt.map(facet)), M.welt);
  mesh(head, mergeGeometries(eye.map(facet)), M.eye);
  // the white hair: swept back over the crown, gathered at the back of the head
  mesh(head, mergeGeometries([
    facet(ellipsoidGeometry(0.094, 0.104, 0.1, { widthSegs: 9, heightSegs: 6 }).translate(0, 0.17, -0.022)),
    facet(kite(0.04, 0.035, 0.04, [0, 0.19, -0.11])),
  ]), M.hair);
  // … and the long tail, on a spring from the tie (anim.js _streamers)
  const base = joint(head, 0, 0.18, -0.13);
  base.rotation.y = Math.PI;
  const s0 = joint(base);
  mesh(s0, facet(kite(0.034, 0.13, 0.026, [0, -0.12, 0], [0, 0, 0], { yPos: 0.2 })), M.hair);
  const s1 = joint(s0, 0, -0.24, 0);
  mesh(s1, facet(kite(0.03, 0.15, 0.022, [0, -0.13, 0], [0, 0, 0], { yPos: 0.2 })), M.hair);
  return { streamers: [{ segs: [s0, s1], len: [0.24, 0.28], out: 0.12, lag: 0.8, max: 1.6, inMax: [0.3, 0.6], w: [0.07, 0.06, 0.03] }] };
}

function headC({ head, M, mesh }) {
  // the mask pushed up on the brow: tipped back over the crown, its muzzle up, its ears laid back
  const { welt, eye } = maskParts(true);
  const T = new THREE.Matrix4().makeTranslation(0, -0.04, 0);
  const R = new THREE.Matrix4().makeRotationX(-1.15);
  const S = new THREE.Matrix4().makeScale(0.85, 0.85, 0.85);
  const P = new THREE.Matrix4().makeTranslation(0, 0.22, 0.03);
  const m = P.multiply(R).multiply(S).multiply(T);
  const put = (g) => g.applyMatrix4(m);
  mesh(head, mergeGeometries(welt.map(put)), M.welt);
  mesh(head, mergeGeometries(eye.map(put)), M.eye);
  // the dark hair, a topknot under the mask
  mesh(head, mergeGeometries([
    facet(ellipsoidGeometry(0.09, 0.098, 0.096, { widthSegs: 9, heightSegs: 6 }).translate(0, 0.162, -0.022)),
    facet(kite(0.034, 0.05, 0.034, [0, 0.13, -0.11], [0.4, 0, 0])),
  ]), M.hair);
}

// ================================================================ chest
function chestA({ spine, chest, M, BODY, mesh }) {
  // the short robe's body: a faceted shell over the torso
  mesh(spine, facet(shellGeometry(bodyRings(BODY, 0.016, [{ y: 1.53, rx: 0.07, rz: 0.068 }]), { sub: 1, cols: 12 })), M.coat);
  // the fur mantle across the shoulders: a stole over the shoulder caps, a collar of fur round the
  // neck; it stops at the top of the chest so the robe's dark shows below it
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
}

function chestB({ spine, chest, M, BODY, mesh }) {
  // a dark undershirt to the collarbones, the vest over it open at the front
  mesh(spine, facet(shellGeometry(bodyRings(BODY, 0.008, [{ y: 1.53, rx: 0.065, rz: 0.062 }]), { sub: 1, cols: 12 })), M.shirt);
  const rings = BODY.shell.slice(0, 6).map((r) => ({ ...r, rx: r.rx + 0.024, rz: r.rz + 0.024, gap: 0.07, y: ySp(r.y) }));
  rings[rings.length - 1] = { ...rings[rings.length - 1], rx: rings[rings.length - 1].rx - 0.01, gap: 0.05 };
  const v = facet(shellGeometry(rings, { sub: 1, cols: 12 }));
  mesh(spine, v, M.coat);
  mesh(spine, v, M.lining);
  // its shoulder seams: a thick fold over each shoulder
  mesh(chest, mergeGeometries([1, -1].map((s) => facet(kite(0.06, 0.026, 0.075, [s * 0.16, yCh(1.462), -0.005], [0, 0, -s * 0.25])))), M.coat);
}

function chestC({ spine, chest, M, BODY, mesh }) {
  // the under-robe
  mesh(spine, facet(shellGeometry(bodyRings(BODY, 0.012, [{ y: 1.53, rx: 0.07, rz: 0.068 }]), { sub: 1, cols: 12 })), M.coat);
  // the cuirass: a breast and back of lacquered plate, in bands (each band its own facets)
  const bands = [
    [1.14, 1.2, 0.17, 0.13],
    [1.2, 1.27, 0.165, 0.125],
    [1.27, 1.35, 0.19, 0.14],
    [1.35, 1.44, 0.215, 0.145],
  ];
  const plates = bands.map(([y0, y1, rx, rz], i) => sub(facet(shellGeometry([
    { y: ySp(y0), rx: rx + 0.006, rz: rz + 0.006, gap: 0 },
    { y: ySp(y1), rx, rz, gap: 0 },
  ], { sub: 1, cols: 10 })), i & 1));
  mesh(spine, mergeGeometries(plates), M.spike);
  // the shoulder straps and the cords that lace the plates (vermilion at the front)
  mesh(chest, mergeGeometries([1, -1].map((s) => facet(boxGeometry(0.05, 0.012, 0.27, s * 0.12, yCh(1.47), 0, 0, 0, s * 0.12)))), M.leather);
  mesh(spine, mergeGeometries([1.2, 1.27, 1.35].map((y) => facet(bandGeometry(0.03, 0.03, 0.012, 6).translate(0, ySp(y), 0.14)))), M.facing);
}

// ================================================================ shoulders (c: the fox's head and its pelt)
function shouldersC({ chest, arms, M, mesh, joint }) {
  const up = arms.L.upper;
  // a fox's head strapped to the left shoulder, its muzzle down the arm, its ears up by the neck
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

// ================================================================ arms
/** A wide hanging sleeve on the forearm (fore space, the arm down −Y): a bell whose lower lip hangs
 *  well below the arm on the elbow's outer side (−Z: the side that faces down when the arm is raised). */
function hangingSleeve(fa0, len) {
  // (rings from the opening up: shellGeometry's faces point out when its rings climb)
  return facet(shellGeometry([
    { y: -len, rx: fa0 + 0.05, rz: fa0 + 0.13, cz: -0.09, gap: 0 },
    { y: -len * 0.75, rx: fa0 + 0.048, rz: fa0 + 0.12, cz: -0.075, gap: 0 },
    { y: -0.07, rx: fa0 + 0.04, rz: fa0 + 0.075, cz: -0.035, gap: 0 },
    { y: 0.03, rx: fa0 + 0.03, rz: fa0 + 0.03, cz: 0, gap: 0 },
  ], { sub: 1, cols: 10 }));
}
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
 *  forearm's axis (rad; measured in GUARD: the palm's normal 0.87 up, the forearm tilted up ~18°). */
const PALM_TURN = 2.1;

function armsFor(ctx, look) {
  const { arms, sword, M, DIM, BODY, mesh } = ctx;
  const [ua0, ua1] = BODY.upperArm, [fa0, fa1] = BODY.foreArm, HK = BODY.hand;
  // the sword hand closed on the grip
  {
    const F = gripFist(HK);
    mesh(sword, mergeGeometries([F.fingers, F.thumb, F.ridge]), M.skin);
  }
  for (const side of [-1, 1]) {
    const R = side < 0;
    const { upper, fore } = arms[R ? 'R' : 'L'];
    if (look === 'b') {
      // bare arms: skin, the forearms wrapped to the knuckles
      mesh(upper, facet(limb({ length: DIM.upperArm, r0: ua0 - 0.004, r1: ua1 - 0.004, bulge: 0.008, radial: 8, rings: 3 })), M.skin);
      mesh(fore, facet(limb({ length: 0.1, r0: ua1 - 0.006, r1: fa0 - 0.004, radial: 8, rings: 1 })), M.skin);
      mesh(fore, wraps(-0.09, -DIM.foreArm + 0.05, 5, fa0, fa1), M.piping);
    } else if (look === 'c') {
      // fitted sleeves, plate bracers
      mesh(upper, facet(limb({ length: DIM.upperArm, r0: ua0 + 0.008, r1: ua1 + 0.01, bulge: 0.01, radial: 8, rings: 3 })), M.coat);
      mesh(fore, facet(limb({ length: 0.12, r0: ua1 + 0.01, r1: fa0 + 0.01, radial: 8, rings: 1 })), M.coat);
      mesh(fore, facet(limb({ length: 0.15, r0: fa0 + 0.02, r1: fa1 + 0.012, radial: 6, rings: 1, capSegs: 1 }).translate(0, -0.08, 0)), M.spike);
      mesh(fore, wraps(-0.21, -DIM.foreArm + 0.05, 2, fa1, fa1), M.piping);
    } else {
      // a: a wide upper sleeve, the hanging sleeve off the forearm, its lining; the wraps below it
      mesh(upper, facet(limb({ length: DIM.upperArm + 0.02, r0: ua0 + 0.022, r1: ua1 + 0.03, bulge: 0.012, radial: 8, rings: 3 })), M.coat);
      const sl = hangingSleeve(fa0, 0.2);
      mesh(fore, sl, M.coat);
      mesh(fore, sl, M.lining);
      mesh(fore, wraps(-0.15, -DIM.foreArm + 0.05, 4, fa0 - 0.002, fa1), M.piping);
    }
    if (R) {
      // the sword hand's wrist and the back of the hand
      mesh(fore, mergeGeometries([
        limb({ length: 0.05, r0: fa1 - 0.006, r1: fa1 - 0.004, radial: 8, rings: 2, capSegs: 1 }).translate(0, -DIM.foreArm + 0.07, 0),
        ellipsoidGeometry(0.034 * HK, 0.04 * HK, 0.042 * HK, { widthSegs: 10, heightSegs: 6 }).translate(0, -DIM.foreArm + 0.022, 0.004),
      ]), M.skin);
    }
  }
  // the free hand (open, the grip, the sword fingers: the animator shows one; he never shows the
  // fingers, his stance holds the hand open)
  const hand = buildFreeHand(ctx);
  hand.offHand.open.geometry.rotateY(PALM_TURN);
  return hand;
}

// ================================================================ legs
function legsFor({ pelvis, legs, M, DIM, BODY, mesh }, look) {
  {
    const [hx, hy, hz] = BODY.hips.r;
    const w = look === 'b' ? 0.03 : 0.012;
    mesh(pelvis, facet(orient.up(ellipsoidGeometry(hx + w, hz + w, hy + w, { widthSegs: 10, heightSegs: 6 })).translate(...BODY.hips.c)), M.pants);
  }
  const [th0, th1] = BODY.thigh, [sh0, sh1] = BODY.shin;
  for (const side of [-1, 1]) {
    const { thigh, shin, foot } = legs[side < 0 ? 'R' : 'L'];
    if (look === 'b') {
      // wide trousers: full at the thigh, fuller below the knee, gathered at the ankle by wraps
      mesh(thigh, facet(limb({ length: DIM.thigh, r0: th0 + 0.034, r1: th1 + 0.05, bulge: 0.02, radial: 8, rings: 3 })), M.pants);
      mesh(shin, facet(limb({ length: DIM.shin - 0.1, r0: th1 + 0.05, r1: sh1 + 0.055, bulge: 0.02, radial: 8, rings: 2 })), M.pants);
      mesh(shin, wraps(-DIM.shin + 0.12, -DIM.shin + 0.05, 2, sh1, sh1), M.piping);
    } else {
      mesh(thigh, facet(limb({ length: DIM.thigh, r0: th0 + 0.016, r1: th1 + 0.018, bulge: 0.014, radial: 8, rings: 3 })), M.pants);
      mesh(shin, facet(limb({ length: 0.12, r0: th1 + 0.016, r1: sh0 + 0.012, radial: 8, rings: 1 })), M.pants);
      // pale wraps from under the knee to the ankle
      mesh(shin, wraps(-0.11, -DIM.shin + 0.05, 5, sh0, sh1), M.piping);
    }
    const F = BODY.foot;
    mesh(foot, facet(ellipsoidGeometry(F.r[0] * 0.92, F.r[1] * 0.85, F.r[2] * 0.95, { widthSegs: 8, heightSegs: 5 }).translate(F.c[0], F.c[1] - 0.004, F.c[2])), M.shirt);
  }
}

// ================================================================ waist: the robe's skirt, the sash
/** The short robe's skirt on the coat springs (anim.js _coat): two front panels that overlap, two back
 *  panels, slits at the sides, to above the knee. COAT_PANELS' fields (gear/wanderer.js). */
export const FOX_PANELS = [
  { az: 0.45, w: [0.2, 0.24, 0.28], len: [0.2, 0.22], strips: [], fork: [], out: 0.008, flare: 0.1, skew: 0.6 },
  { az: -0.45, w: [0.2, 0.24, 0.28], len: [0.2, 0.22], strips: [], fork: [], out: 0, flare: 0.1, skew: -0.6 },
  { az: 2.4, w: [0.2, 0.26, 0.3], len: [0.2, 0.24], strips: [], fork: [], out: 0.006, flare: 0.16, skew: -0.4 },
  { az: -2.4, w: [0.2, 0.26, 0.3], len: [0.2, 0.24], strips: [], fork: [], out: 0.006, flare: 0.16, skew: 0.4 },
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

function waistA(ctx) {
  const { spine, M, BODY, mesh, joint } = ctx;
  const coat = skirt(ctx, FOX_PANELS);
  // the sash: a broad band round the waist, a flat knot at the back
  const W = BODY.shell[1];
  mesh(spine, mergeGeometries([
    facet(bandGeometry(W.rx + 0.03, W.rz + 0.03, 0.115, 12).translate(0, ySp(1.19), W.cz ?? 0)),
    facet(kite(0.07, 0.04, 0.03, [0, ySp(1.19), -(W.rz + 0.045)])),
  ]), M.facing);
  // … its two long tails hanging behind on a spring, one longer than the other
  const base = joint(spine, 0, ySp(1.17), -(W.rz + 0.05));
  base.rotation.y = Math.PI;
  const s0 = joint(base);
  const L0 = 0.3, L1 = 0.36;
  mesh(s0, mergeGeometries([hangingSheet(L0, 0.075, 0.07, 0.014, 0.04), hangingSheet(L0, 0.07, 0.065, 0.014, -0.035)]), M.facing);
  const s1 = joint(s0, 0, -L0, 0);
  mesh(s1, mergeGeometries([hangingSheet(L1, 0.07, 0.06, 0.012, 0.04), hangingSheet(L1 * 0.7, 0.065, 0.05, 0.012, -0.035)]), M.facing);
  return { coat, streamers: [{ segs: [s0, s1], len: [L0, L1], out: 0.06, lag: 0.85, max: 2.0, w: [0.15, 0.14, 0.12], wrap: 0.3 }] };
}

function waistB({ pelvis, spine, M, BODY, mesh }) {
  // the thick rope belt: two twists round the hips, a knot at his left front
  const W = BODY.shell[0];
  const rope = [];
  for (let k = 0; k < 2; k++) rope.push(sub(facet(bandGeometry(W.rx + 0.03 - k * 0.004, W.rz + 0.03 - k * 0.004, 0.035, 12).translate(0, ySp(1.1 - k * 0.032), 0)), k));
  rope.push(facet(kite(0.04, 0.035, 0.035, [0.09, ySp(1.08), W.rz + 0.03])));
  mesh(spine, mergeGeometries(rope), M.leather);
  // paper strips hung from it all round (rigid on the pelvis: short, so the legs stay clear), each
  // tied with a vermilion cord
  const strips = [], cords = [];
  const N = 9;
  for (let i = 0; i < N; i++) {
    const a = ((i + 0.5) / N) * Math.PI * 2 + 0.2;
    const L = 0.13 + 0.07 * ((i * 7) % 3) / 2;
    const r = 0.17;
    const g = hangingSheet(L, 0.05, 0.045, 0.006);
    g.rotateY(a).translate(Math.sin(a) * r, yPv(1.07), Math.cos(a) * r * 0.8);
    strips.push(sub(g, i & 1));
    cords.push(facet(boxGeometry(0.03, 0.018, 0.012, 0, 0, 0).rotateY(a).translate(Math.sin(a) * (r + 0.004), yPv(1.06), Math.cos(a) * (r * 0.8 + 0.004))));
  }
  mesh(pelvis, mergeGeometries(strips), M.hem);
  mesh(pelvis, mergeGeometries(cords), M.facing);
  return { coat: [] };
}

function waistC(ctx) {
  const { spine, M, BODY, mesh } = ctx;
  const coat = skirt(ctx, FOX_PANELS.map((P) => ({ ...P, len: [0.18, 0.2] })));
  const W = BODY.shell[0];
  mesh(spine, facet(bandGeometry(W.rx + 0.03, W.rz + 0.03, 0.05, 12).translate(0, ySp(1.12), 0)), M.leather);
  return { coat };
}

// ================================================================ weapon: the broad dao
/** The dao (sword space: origin the grip's centre, the blade along +Z, its flats facing ±Y; the edge
 *  on −X, the back on +X): a broad single edge that widens toward a clipped point and curves a little
 *  back. `guard` / `tip` are the steel's ends (duelist.js kit.blade). */
export const FOX_BLADE = Object.freeze({ gripBack: 0.13, guard: 0.07, base: 0.085, tip: 0.98, width: 0.05, belly: 0.078, curve: 0.035 });

function buildDao({ sword, M, mesh }) {
  const D = FOX_BLADE, L = D.tip - D.base;
  // stations along the blade: the back straight (bent by the curve), the edge swelling to the belly,
  // the clipped point where the back drops to meet the edge
  const st = [];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const t = i / N, z = D.base + t * L * 0.86;
    const c = D.curve * t * t;
    const w = lerp(D.width, D.belly, Math.pow(t, 1.4));
    st.push([z, c + w * 0.4, c - w * 0.6, lerp(0.012, 0.008, t)]);
  }
  const c1 = D.curve * 1.15, last = st[st.length - 1];
  st.push([D.base + L * 0.95, c1 + D.belly * 0.05, last[2] + 0.004, 0.007]);
  st.push([D.tip, c1 - D.belly * 0.35, c1 - D.belly * 0.4, 0.004]);
  mesh(sword, prism(st), M.armor);
  // the edge: a bright line down the cutting side
  const e = st.slice(0, N + 1).map(([z, , b, th]) => [z, b + 0.006, b - 0.001, th + 0.002]);
  e.push([st[N + 1][0], st[N + 1][2] + 0.006, st[N + 1][2] - 0.001, 0.009]);
  mesh(sword, prism(e), M.bevel);
  // the grip wrapped in dark cord, the disc guard and a ring pommel in dark iron
  {
    const len = D.gripBack + D.guard - 0.015, bands = [];
    for (let k = 0; k < 6; k++) bands.push(sub(limb({ length: len / 6 + 0.002, r0: 0.0165, r1: 0.017, radial: 6, rings: 1, capSegs: 1 }).rotateX(-Math.PI / 2).translate(0, 0, -D.gripBack + (k * len) / 6), k & 1));
    mesh(sword, mergeGeometries(bands), M.shirt);
  }
  mesh(sword, mergeGeometries([
    facet(ellipsoidGeometry(0.052, 0.04, 0.012, { widthSegs: 8, heightSegs: 3 }).translate(0, 0, D.guard)),
    ring(0.02, 0.02, 0.008, 8).rotateX(Math.PI / 2).translate(0, 0, D.guard - 0.016),
    ring(0.028, 0.028, 0.008, 10).rotateY(Math.PI / 2).translate(0, 0, -D.gripBack - 0.03),
  ]), M.trim);
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
 *  item says per outfit what the body keeps under it (read when the rig is built): no hair (each mask
 *  builds its own), and the face in shadow behind a full mask (a, d). */
export const FOX_ITEMS = [
  {
    id: 'fox.head', slot: 'head', name: 'Bone Fox Mask', hidesHair: true,
    get shadowsFace() {
      return foxLookNow().base === 'a';
    },
    build: opted({ a: headA, b: headB, c: headC }),
  },
  { id: 'fox.chest', slot: 'chest', name: 'Shrine Robe', build: opted({ a: chestA, b: chestB, c: chestC }) },
  { id: 'fox.shoulders', slot: 'shoulders', name: 'Fox Pelt', build: opted({ c: shouldersC }) },
  { id: 'fox.arms', slot: 'arms', name: 'Hanging Sleeves', build: opted(armsFor) },
  { id: 'fox.legs', slot: 'legs', name: 'Wrapped Trousers', build: opted(legsFor) },
  { id: 'fox.waist', slot: 'waist', name: 'Vermilion Sash', build: opted({ a: waistA, b: waistB, c: waistC }) },
  { id: 'fox.dao', slot: 'weapon', name: 'Broad Dao', dims: FOX_BLADE, build: opted(buildDao) },
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
  back: null,
  weapon: null, // (bare-handed, ADR-147: the right fist hangs on the sword joint, FOX_FIST)
});

/** His "blade": the right fist, as a short segment along the sword joint's +Z (duelist.js kit.blade;
 *  Tian Lei's FIST): from the little finger's side of the fist to past the knuckles, metres. */
export const FOX_FIST = Object.freeze({ guard: -0.06, tip: 0.075 });
