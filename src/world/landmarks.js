import * as THREE from 'three';
import { FLAG } from '../render/materials.js';
import { hash2, fbm2, range } from '../core/rng.js';
import { TAU } from '../core/math.js';
import { prep, lumpy, paint, carve, mul } from './forest.js';

// Landmarks: the big set pieces of each level (STYLE.md "Landmarks"), printed like the wyrm (prop
// art, ADR-100): fine digits, a dark body, stroke glyphs on the silhouette. A builder returns painted
// geometries in world space; a set pushes them through carved() into its `stones` mesh (the prop art
// material) or, in the forest, paints them FLAG.ART_PROP for the screen-grid meshes. The set adds
// the colliders (each builder exports its footprint in local space).
//
// What makes one read at the game camera (58 degrees down, from the south; learned the hard way):
// - The pass has three sets of letters and a narrow range of brightness. A form reads through its
//   SILHOUETTE (holes in it count: an elbow held off the body), through tops that land in the bright
//   set over flanks in the dim one (`caught`), and through HUE (a bronze sword on a grey statue).
//   Tone alone, part by part, prints as one mass of digits.
// - Few, big, flat-sided masses (`frustum`): every extra part adds an inner outline.
// - Thin forms read at once: ribs, boughs, a blade, a gate's posts and beams.
// - Seen from above, a wide roof or hat hides what stands under it: keep them narrow.
// - Nothing north of the fight is ever in the frame, and a tall thing there only climbs further
//   out of it. A landmark belongs at the east or west side, in the northern half, turned to face
//   the camera (toward +z and the level's centre line): at the side of the frame everything upright
//   leans outward by 30 to 45 degrees, and a thing that faces the camera only turns with that lean,
//   where one that faces the centre shears.

const UP = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** A painted part: `col` mottled by noise (vary), lit by `ao` (constant or fn(x, y, z)). */
function part(geo, col, { ao = 1, vary = 0.4, freq = 1.3, flag = FLAG.STONE, sway = 0, facet = 0 } = {}) {
  const g = geo.attributes.aCol ? geo : prep(geo);
  paint(g, {
    col: (x, y, z) => mul(col, 1 - vary / 2 + vary * fbm2(x * freq + 3.3, z * freq + y * freq * 0.8, 2)),
    flag,
    sway,
    ao,
  });
  return facet ? facets(g, facet) : g;
}

/**
 * Give every triangle its own brightness (1 ± k). A big smooth form lit evenly lands on ONE level
 * of the grid's glyph ramp and prints as rows of a single character; a spread of facet tones prints
 * as a mix of glyphs, dark chips and bright ones, which is what reads as carved stone or old wood.
 */
function facets(g, k) {
  const p = g.attributes.position, c = g.attributes.aCol;
  for (let i = 0; i + 2 < p.count; i += 3) {
    const cx = p.getX(i) + p.getX(i + 1) + p.getX(i + 2), cy = p.getY(i) + p.getY(i + 1) + p.getY(i + 2), cz = p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2);
    const h = hash2(Math.round(cx * 1.4) * 1.31 + Math.round(cy * 1.4) * 7.7, Math.round(cz * 1.4) * 3.17 - Math.round(cy * 1.4) * 2.3);
    const m = 1 - k + 2 * k * h * h * 1.5;
    for (let j = i; j < i + 3; j++) c.setXYZ(j, c.getX(j) * m, c.getY(j) * m, c.getZ(j) * m);
  }
  return g;
}

/**
 * Paint for a dark body that only catches light from above (an `ao` for part()): faces turned up
 * take `hi`, upright and overhanging ones `lo`. The night does the same, but too gently to print:
 * the art pass has three sets of letters, and a form reads when its tops land in the bright set
 * and its flanks in the dim one.
 */
const caught = (lo, hi) => (px, py, pz, nx, ny) => {
  const t = Math.min(1, Math.max(0, (ny - 0.08) / 0.55));
  return lo + (hi - lo) * t * t * (3 - 2 * t);
};

/** A tapered limb from a to b (radius r0 at a, r1 at b), unpainted. */
function limb(a, b, r0, r1, sides = 6, segs = 1) {
  const d = b.clone().sub(a);
  const len = d.length();
  const g = prep(new THREE.CylinderGeometry(r1, r0, len, sides, segs));
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}

/**
 * A faceted frustum standing on y0: half-widths (ax, az) at its foot, (bx, bz) at its top, a corner
 * toward +z. Few sides on purpose: each flat side takes one tone from the light, and the steps
 * between them are what prints as a form (STYLE.md "The house style").
 */
function frustum(y0, h, ax, az, bx, bz, sides = 8, turn = 0) {
  const g = prep(new THREE.CylinderGeometry(1, 1, h, sides, 1));
  if (turn) g.rotateY(turn);
  g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / h;
    p.setX(i, p.getX(i) * (ax + (bx - ax) * t));
    p.setZ(i, p.getZ(i) * (az + (bz - az) * t));
  }
  g.translate(0, y0, 0);
  return g;
}

/** Scale, turn and move finished parts into the world. */
function place(parts, x, z, yaw = 0, s = 1) {
  for (const g of parts) {
    if (s !== 1) g.scale(s, s, s);
    g.rotateY(yaw);
    g.translate(x, 0, z);
  }
  return parts;
}

/**
 * Turn painted (screen-grid) parts into CarvedGlyph parts, for a set's `stones` mesh: stone and
 * metal landmarks are carved like the pillars and walls beside them (world-fixed characters on
 * every cell). aCol and aAO stay; aMoss / aInk / aEdge are added, the grid's aFlag / aSway dropped.
 */
export function carved(parts, { moss = 0, ink = 1 } = {}) {
  for (const g of parts) {
    const n = g.attributes.position.count;
    g.deleteAttribute('aFlag');
    g.deleteAttribute('aSway');
    g.setAttribute('aMoss', new THREE.BufferAttribute(new Float32Array(n).fill(moss), 1));
    g.setAttribute('aInk', new THREE.BufferAttribute(new Float32Array(n).fill(ink), 1));
    g.setAttribute('aEdge', new THREE.BufferAttribute(new Float32Array(n), 1));
  }
  return parts;
}

/** Local (lx, lz) of a landmark at (x, z, yaw, s) in the world: for colliders and clearings. */
export function landmarkPoint(x, z, yaw, s, lx, lz) {
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  return { x: x + (lx * c + lz * sn) * s, z: z + (-lx * sn + lz * c) * s };
}

// ---------------------------------------------------------------- Cinderwood Hollow
const BONE = [0.3, 0.285, 0.245];
const OLD_BONE = [0.2, 0.19, 0.17];

/** The elder wyrm's spine in local space: t 0 (tail tip) .. 1 (skull), an arched back. */
const ELDER = { x0: -15, x1: 9.5, arch: 4.6 };
function elderSpine(t) {
  const x = ELDER.x0 + (ELDER.x1 - ELDER.x0) * t;
  // the tail lies on the ground and curls; the back arches over the ribs; the neck comes down
  const y = 0.35 + ELDER.arch * Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.2) / 0.74)))), 0.8);
  const z = t < 0.3 ? 3.2 * Math.pow((0.3 - t) / 0.3, 1.6) : 0;
  return V(x, y, z);
}

/**
 * The skeleton of an elder wyrm, half sunk along the rim of the clearing: a skull the size of a
 * cart with swept horns and a row of teeth, the spine arching 5 m over a nave of ribs, a wing arm
 * standing like a broken mast, the tail curling away. ~25 m long in local x (skull at +x).
 */
export function buildElderWyrm(rng, x, z, yaw = 0, s = 1) {
  const parts = [];
  const hi = (px, py) => 0.5 + 0.5 * Math.min(1, py / 2.4);
  // every part is tagged with the piece it breaks with (`userData.piece`: forest.js splits the skeleton
  // into breakables by it; nothing here draws on the random stream for it, the look is unchanged)
  let tag = '';
  const add = (g, col = BONE, o = {}) => {
    const out = part(g, col, { ao: hi, vary: 0.5, freq: 1.8, facet: 0.3, flag: FLAG.ART_PROP, ...o });
    out.userData.piece = tag;
    return parts.push(out);
  };
  const top = caught(0.4, 1.1); // the big bones: pale on top, dim down their flanks

  // ---- the spine: vertebrae with dorsal spines, bigger over the chest
  const N = 46;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    if (t > 0.05 && t < 0.3 && rng() < 0.16) continue; // gaps in the tail
    const p = elderSpine(t), q = elderSpine(Math.min(1, t + 0.01));
    const k = 0.45 + 0.75 * Math.sin(Math.PI * Math.min(1, t * 1.15)); // girth along the body
    tag = `spine${Math.floor(i / ELDER_PIECES.spineRun)}`;
    const v = prep(new THREE.BoxGeometry(0.5, 0.52 * k + 0.12, 0.62 * k + 0.14));
    v.rotateZ(Math.atan2(q.y - p.y, q.x - p.x));
    v.rotateY(-Math.atan2(q.z - p.z, q.x - p.x));
    v.translate(p.x, p.y, p.z);
    add(v, t < 0.25 ? OLD_BONE : BONE, { ao: top, facet: 0.15 });
    if (t > 0.26 && t < 0.92 && i % 2 === 0) {
      const sp = prep(new THREE.ConeGeometry(0.16 * k + 0.05, (1.1 + 1.2 * k) * (0.8 + rng() * 0.4), 4));
      sp.translate(0, 0.75 * k + 0.35, 0);
      sp.rotateZ(0.35); // raked back toward the tail
      sp.translate(p.x, p.y, p.z);
      add(sp, BONE, { ao: 1 });
    }
  }
  // ---- the ribs: a nave of arcs from the spine down into the earth, one or two snapped
  const ribs = 9;
  for (let i = 0; i < ribs; i++) {
    const t = 0.36 + (i / (ribs - 1)) * 0.38;
    const p = elderSpine(t);
    const R = Math.max(1.6, p.y * 0.72);
    for (const side of [-1, 1]) {
      const snapped = hash2(i * 5.3 + side, 2.7) < 0.2;
      const arc = snapped ? 1.0 : Math.PI / 2 + 0.55;
      tag = `rib${i}${side > 0 ? 'R' : 'L'}`;
      const g = prep(new THREE.TorusGeometry(R, 0.17 - i * 0.004, 5, 14, arc));
      g.rotateZ(Math.PI / 2 - arc); // the arc ends at the top, where it meets the spine
      g.scale(1.25, 1, 1); // ribs spread wider than they are tall
      g.rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2);
      g.rotateY((i - ribs / 2) * 0.03);
      g.translate(p.x, p.y - R + 0.1, 0);
      add(g);
    }
  }
  // ---- the pelvis and a hind leg folded under
  const hip = elderSpine(0.36);
  tag = 'hip';
  add(limb(V(hip.x, hip.y, 0.3), V(hip.x - 1.6, 0.9, 2.6), 0.3, 0.2), OLD_BONE);
  add(limb(V(hip.x - 1.6, 0.9, 2.6), V(hip.x + 0.8, 0.1, 3.6), 0.2, 0.14), OLD_BONE);
  // ---- a wing arm standing like a broken mast, three finger bones fanned from its wrist
  const sh = elderSpine(0.7);
  const elbow = V(sh.x - 1.2, sh.y + 4.2, -2.4), wrist = V(sh.x + 1.0, sh.y + 7.6, -4.6);
  tag = 'mast';
  add(limb(V(sh.x, sh.y - 0.2, -0.4), elbow, 0.34, 0.24, 6, 2));
  add(limb(elbow, wrist, 0.24, 0.16, 6, 2));
  tag = 'fingers';
  for (const [dx, dy, dz, len] of [[-3.2, -1.0, -1.6, 1], [-4.4, -3.6, -1.0, 1], [-3.0, -6.2, 0.2, 0.9]]) {
    const tip = V(wrist.x + dx * len, wrist.y + dy * len, wrist.z + dz * len);
    add(limb(wrist, tip, 0.13, 0.04, 5, 2));
  }
  // the other wing fallen: long bones lying in the grass on the far side
  tag = 'wing';
  add(limb(V(sh.x - 0.5, 0.25, 2.2), V(sh.x - 5.5, 0.3, 5.2), 0.26, 0.18), OLD_BONE);
  add(limb(V(sh.x - 5.5, 0.3, 5.2), V(sh.x - 10.5, 0.2, 4.4), 0.18, 0.1), OLD_BONE);

  // ---- the skull, resting on its jaw, turned a little toward the clearing
  const skull = [];
  const sadd = (g, col = BONE, o = {}) => {
    const out = part(g, col, { ao: caught(0.36, 1.1), vary: 0.3, freq: 2.2, flag: FLAG.ART_PROP, ...o });
    out.userData.piece = tag;
    return skull.push(out);
  };
  tag = 'skull';
  const cran = prep(new THREE.IcosahedronGeometry(1.25, 1));
  cran.scale(1.25, 0.9, 1.05);
  lumpy(cran, 0.3, 1.6, 4);
  cran.translate(0, 1.55, 0);
  sadd(cran);
  const snout = prep(new THREE.BoxGeometry(3.2, 0.95, 1.5, 4, 1, 2));
  {
    const p = snout.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 1 - 0.5 * ((p.getX(i) + 1.6) / 3.2); // tapering to the nose
      p.setZ(i, p.getZ(i) * k);
      p.setY(i, p.getY(i) * (0.6 + 0.4 * k));
    }
  }
  snout.translate(2.5, 1.35, 0);
  sadd(snout);
  const jaw = prep(new THREE.BoxGeometry(3.4, 0.4, 1.25, 4, 1, 2));
  {
    const p = jaw.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * (1 - 0.45 * ((p.getX(i) + 1.7) / 3.4)));
  }
  jaw.rotateZ(-0.2); // hanging open
  jaw.translate(2.2, 0.32, 0);
  tag = 'jaw';
  sadd(jaw, OLD_BONE);
  for (const sz of [-1, 1]) {
    tag = 'skull';
    // eye sockets (wide and on top: the skull is seen from above), nostrils, brow ridges
    const eye = prep(new THREE.IcosahedronGeometry(0.56, 1));
    eye.scale(1.3, 0.62, 0.84);
    eye.translate(1.2, 2.0, sz * 0.66);
    sadd(eye, [0.012, 0.012, 0.014], { vary: 0, ao: 0.3 });
    const nostril = prep(new THREE.IcosahedronGeometry(0.24, 0));
    nostril.scale(1.4, 0.6, 0.8);
    nostril.translate(3.55, 1.6, sz * 0.24);
    sadd(nostril, [0.012, 0.012, 0.014], { vary: 0, ao: 0.3 });
    const brow = prep(new THREE.BoxGeometry(1.0, 0.22, 0.3));
    brow.rotateZ(-0.25);
    brow.translate(0.75, 2.36, sz * 0.74);
    sadd(brow);
    // great horns swept up and back, a smaller pair below
    tag = sz > 0 ? 'hornR' : 'hornL';
    sadd(limb(V(-0.6, 2.0, sz * 0.7), V(-2.4, 3.6, sz * 1.5), 0.36, 0.2, 6, 2));
    sadd(limb(V(-2.4, 3.6, sz * 1.5), V(-4.6, 4.3, sz * 1.25), 0.2, 0.03, 6, 2));
    sadd(limb(V(-0.7, 1.3, sz * 0.95), V(-2.3, 1.7, sz * 1.9), 0.2, 0.03, 5, 2));
    // teeth along both jaws (the upper row is the skull's, the lower the jaw's)
    for (let i = 0; i < 7; i++) {
      tag = 'skull';
      const tx = 1.25 + i * 0.4, tz = sz * (0.62 - i * 0.045);
      const up = prep(new THREE.ConeGeometry(0.085, 0.5 - i * 0.02, 4));
      up.rotateX(Math.PI);
      up.translate(tx, 0.72, tz);
      sadd(up, [0.36, 0.35, 0.31], { vary: 0.1, ao: 1 });
      if (i % 2 === 0) {
        tag = 'jaw';
        const lo = prep(new THREE.ConeGeometry(0.075, 0.36, 4));
        lo.translate(tx + 0.1, 0.62 - (tx - 2.2) * 0.2, tz * 0.92);
        sadd(lo, [0.36, 0.35, 0.31], { vary: 0.1, ao: 1 });
      }
    }
  }
  const head = elderSpine(1);
  for (const g of skull) {
    g.scale(1.3, 1.3, 1.3);
    g.rotateX(0.38); // rolled toward the clearing (+z): its brow and sockets face the viewer
    g.rotateY(-0.42); // the muzzle swings that way too
    g.translate(head.x + 1.7, -0.2, head.z + 0.2);
    parts.push(g);
  }
  return place(parts, x, z, yaw, s);
}
/** How the elder wyrm's skeleton is split into breakables (forest.js): vertebrae per run of the spine. */
export const ELDER_PIECES = { spineRun: 5 };
/** Colliders of the elder wyrm in local space: [lx, lz, r]. The nave between the ribs stays open. */
export const ELDER_COLLIDERS = [
  [12.6, 1.4, 2.6], [9.2, 0.2, 1.4], [15.4, 2.8, 1.3],
  ...[-6, -3.8, -1.6, 0.6, 2.8].flatMap((lx) => [[lx, 3.6, 0.7], [lx, -3.6, 0.7]]),
  [4.6, -2.2, 0.9], [-10, 1.2, 0.8], [-13.5, 2.6, 0.7],
];

const CINDER_BARK = [0.14, 0.095, 0.07];
const HEARTWOOD = [0.3, 0.22, 0.13];
const EMBER_LEAF = [0.36, 0.11, 0.035];
const DEADWOOD = [0.3, 0.25, 0.19];

/**
 * The Cinder Tree: a colossal burned oak, hollow at the root. A twisted, fluted trunk on a star of
 * buttress roots, five great boughs spread wide and forking twice into bare branches, the last
 * ember-red leaves still hanging on some of the twigs. ~15 m tall, its crown ~26 m across: low
 * and wide, so the trunk and the crown fit the game camera's frame together.
 * The wood is printed like the bones and the stones (FLAG.ART_PROP: fine digits, stroke outlines):
 * a bare bough is a thin form and reads at once, where the screen grid's big letters gave a dark
 * smudge. The trunk is charred (dark, pale only where a flute faces the sky), the boughs weather
 * paler toward their tips, so the crown stands off the dark forest behind it. The leaves stay on
 * the leaf ramp and sway. The hollow faces +z, and on that side the boughs are short and climb:
 * turn +z to the clearing and nothing hangs over the fight.
 */
export function buildCinderTree(rng, x, z, yaw = 0, s = 1) {
  const parts = [];
  const H = 7.5;
  // (tags, as the elder wyrm's: 'trunk' with its roots, hollow and stub, 'bough0' .. 'bough4' with their
  // forks, twigs and leaves; parts.push is wrapped so every push is tagged)
  let tag = 'trunk';
  const push = parts.push.bind(parts);
  parts.push = (...gs) => {
    for (const g of gs) g.userData.piece = tag;
    return push(...gs);
  };
  const wood = (g, col, o = {}) => parts.push(part(g, col, { vary: 0.35, freq: 0.9, ao: caught(0.5, 1.5), flag: FLAG.ART_PROP, sway: 0, ...o }));
  // ---- the trunk: nine flat flutes, flared at the foot, twisted a quarter turn on the way up
  const trunk = prep(new THREE.CylinderGeometry(1.4, 2.3, H, 9, 5));
  trunk.translate(0, H / 2, 0);
  {
    const p = trunk.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
      const a = Math.atan2(pz, px) + py * 0.17; // the twist
      const r = Math.hypot(px, pz) * (1 + 0.75 * Math.pow(Math.max(0, 1 - py / 2.6), 2.2));
      p.setX(i, Math.cos(a) * r + py * 0.03);
      p.setZ(i, Math.sin(a) * r);
    }
  }
  parts.push(
    paint(trunk, {
      // charred flutes: every other one a shade paler, cracks of heartwood up the twist
      col: (px, py, pz) => {
        const a = Math.atan2(pz, px) - py * 0.17;
        const flute = Math.floor(((a / TAU + 1) % 1) * 9 + 0.5) % 2;
        const crack = fbm2(a * 3.1, py * 0.35, 2) > 0.68 ? 2.1 : 1;
        return mul(CINDER_BARK, (flute ? 1.25 : 0.7) * crack * (0.85 + 0.3 * fbm2(px * 0.8, py * 0.5 + pz, 2)));
      },
      flag: FLAG.ART_PROP,
      ao: (px, py, pz, nx, ny) => (0.55 + 0.45 * Math.min(1, py / 4)) * (0.75 + 0.9 * Math.max(0, ny)),
    }),
  );
  // ---- the hollow at its foot: a dark mouth in a frame of pale heartwood
  const mouth = prep(new THREE.IcosahedronGeometry(1.2, 1));
  mouth.scale(0.85, 1.7, 0.5);
  mouth.translate(0.15, 1.7, 2.35);
  parts.push(part(mouth, [0.008, 0.007, 0.007], { vary: 0, ao: 0.25, flag: FLAG.ART_PROP }));
  const rim = prep(new THREE.TorusGeometry(1.3, 0.24, 4, 10, Math.PI * 1.3));
  rim.rotateZ(-Math.PI * 0.15);
  rim.scale(0.85, 1.6, 1);
  rim.translate(0.15, 1.45, 2.55);
  wood(rim, HEARTWOOD, { ao: 1 });
  // ---- buttress roots: a star gripping the ground, pale along their backs
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 0.35 + range(rng, -0.2, 0.2), len = range(rng, 3.6, 5.6);
    const knee = V(Math.cos(a) * 2.5, 0.85, Math.sin(a) * 2.5), end = V(Math.cos(a + 0.22) * (2.5 + len), -0.15, Math.sin(a + 0.22) * (2.5 + len));
    wood(limb(V(Math.cos(a) * 1.3, 2.3, Math.sin(a) * 1.3), knee, 0.7, 0.5, 5), mul(CINDER_BARK, 1.15));
    wood(limb(knee, end, 0.5, 0.12, 5, 2), mul(CINDER_BARK, 1.3));
  }
  // ---- five great boughs, each forking twice; the wood pales toward the twigs
  const twigs = [];
  const twigOf = [];
  const tone = [mul(DEADWOOD, 0.62), mul(DEADWOOD, 0.5), mul(CINDER_BARK, 0.95)]; // by depth: twig, branch, bough
  const bough = (from, dir, len, r, depth) => {
    const to = from.clone().addScaledVector(dir, len);
    to.y += len * 0.1;
    wood(limb(from, to, r, r * 0.6, depth > 1 ? 6 : 5, 2), tone[depth], { ao: caught(0.5, 1.1) });
    if (depth === 0) {
      twigOf.push(tag);
      return twigs.push(to);
    }
    const forks = depth > 1 ? 2 : 3;
    for (let k = 0; k < forks; k++) {
      const d = dir.clone().applyAxisAngle(UP, (k - (forks - 1) / 2) * 0.85 + range(rng, -0.25, 0.25));
      d.y = Math.abs(d.y) * 0.5 + range(rng, 0.05, 0.4);
      bough(to, d.normalize(), len * range(rng, 0.62, 0.78), r * 0.58, depth - 1);
    }
  };
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.3 + range(rng, -0.2, 0.2);
    // (toward +z, the clearing's side, the boughs are shorter and climb: nothing hangs over the fight)
    const w = 0.5 + 0.5 * Math.sin(a);
    tag = `bough${i}`;
    const dir = V(Math.cos(a) * 0.9, 0.3 + 0.55 * w, Math.sin(a) * 0.9).normalize();
    bough(V(Math.cos(a) * 0.6, H - 1.0, Math.sin(a) * 0.6), dir, range(rng, 5.6, 7.0) * (1 - 0.42 * w), 0.9, 2);
  }
  // a broken stub where the sixth bough tore away
  tag = 'trunk';
  wood(limb(V(0, H - 0.5, 0), V(0.5, H + 2.4, -0.4), 0.95, 0.5, 6), mul(CINDER_BARK, 1.3));
  // ---- the last leaves: small ember-red clumps on some twig ends (leaf ramp, they sway)
  twigs.forEach((t, i) => {
    if (hash2(i * 3.7, 1.9) > 0.7) return;
    const r = range(rng, 0.6, 1.0);
    const leaf = prep(new THREE.IcosahedronGeometry(r, 1));
    leaf.scale(1, 0.7, 1);
    lumpy(leaf, r * 0.45, 1.5, i);
    leaf.translate(t.x, t.y + 0.2, t.z);
    tag = twigOf[i];
    parts.push(part(leaf, EMBER_LEAF, { flag: FLAG.LEAF, vary: 0.8, freq: 1.4, sway: 0.7, ao: (px, py) => 0.6 + 0.4 * Math.min(1, (py - t.y + r) / (2 * r)) }));
  });
  parts.push = push;
  return place(parts, x, z, yaw, s);
}

/**
 * What is left of the Cinder Tree when its trunk breaks: the charred foot of it, torn off a few metres
 * up, on its roots (the same wood and print, FLAG.ART_PROP). World space, like the tree's parts.
 */
export function buildCinderStump(rng, x, z, yaw = 0, s = 1) {
  const H = 3.4;
  const g = prep(new THREE.CylinderGeometry(1.7, 2.3, H, 9, 3));
  g.translate(0, H / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
    const r = Math.hypot(px, pz) * (1 + 0.75 * Math.pow(Math.max(0, 1 - py / 2.6), 2.2));
    const a = Math.atan2(pz, px) + py * 0.17;
    // a jagged top: torn, not cut
    const top = py > H * 0.9 ? hash2(Math.round(a * 4) * 3.1, 7.7) * 1.6 : 0;
    p.setX(i, Math.cos(a) * r);
    p.setZ(i, Math.sin(a) * r);
    p.setY(i, py - top);
  }
  const out = [part(g, mul(CINDER_BARK, 0.7), { vary: 0.5, freq: 0.9, ao: caught(0.45, 1.3), flag: FLAG.ART_PROP, facet: 0.25 })];
  return place(out, x, z, yaw, s);
}

// ---------------------------------------------------------------- shared: the stone swordsman
const GREY = [0.105, 0.11, 0.13];
const OLD_BRONZE = [0.2, 0.15, 0.07];

/**
 * A colossal statue of a swordsman standing over his sword, both hands on the pommel, the point in
 * the plinth. Built to be read from the game camera (58 degrees down, from the south, and leaning
 * away at the sides of the frame): a few big flat-sided masses, dark where they stand upright and
 * pale where they face the sky, so the figure is drawn by what catches the light: the hat, the
 * shoulders, the forearms closing on the hilt, the hem, the plinth. The sword is bronze: its own
 * hue down the dark robe. `head`: 'hat' (a bamboo hat: the sword sect's guardians), 'hood' (a
 * cowl: the throne's wardens) or 'none' (broken off; it lies at his feet, hat and all).
 * Faces +z. ~10 m tall at s = 1.
 * `split` (the courtyard's colossi break in two stages, 2026-11-16): returns the same parts sorted
 * { lower (plinth, robe, belt, the sword's guard and blade), upper (chest, arms, hands, pommel, neck,
 * head), head (the fallen head of 'none'), plinth (the plinth's two steps, cloned), cut (the height
 * the upper half stands on, m) } instead of one list. The geometry is the same either way.
 */
export function buildColossus(rng, x, z, yaw = 0, s = 1, { col = GREY, head = 'hat', blade = OLD_BRONZE, tall = 1.25, lo = 0.22, hi = 1.5, split = false } = {}) {
  const parts = [];
  const mark = {};
  const ao = caught(lo, hi);
  const add = (g, k = 1, o = {}) => parts.push(part(g, mul(col, k), { ao, vary: 0.15, freq: 0.9, ...o }));
  // ---- the plinth: two round steps
  add(frustum(0, 0.5, 1.8, 1.8, 1.74, 1.74, 8, Math.PI / 8), 0.5);
  add(frustum(0.5, 0.45, 1.5, 1.5, 1.44, 1.44, 8, Math.PI / 8), 0.62);
  mark.plinth = parts.length;
  const Y0 = 0.95;
  // ---- the robe: six flat folds, a corner to the front (one side takes the moon, the other does
  // not), flaring to a hem that catches the light
  add(frustum(Y0, 3.4, 1.22, 1.0, 0.78, 0.62, 6), 0.75);
  add(frustum(Y0, 0.75, 1.62, 1.34, 1.18, 0.98, 6), 0.95);
  // the belt: one pale line round the waist
  add(frustum(Y0 + 3.3, 0.38, 0.95, 0.78, 0.95, 0.78, 6), 1.5);
  mark.lower = parts.length;
  // ---- the chest: a wedge widening from the waist to the shoulders
  add(frustum(Y0 + 3.6, 1.7, 0.8, 0.6, 1.5, 0.8, 6), 0.8);
  // ---- shoulders, arms, hands
  const SH = Y0 + 5.2;
  for (const sx of [-1, 1]) {
    const cap = prep(new THREE.IcosahedronGeometry(0.7, 0));
    cap.scale(1.1, 0.8, 1);
    cap.translate(sx * 1.5, SH, 0.02);
    add(cap, 1.1);
    // the elbow held wide, the forearm coming back in to the pommel
    const elbow = V(sx * 2.05, SH - 1.5, 0.6), hand = V(sx * 0.3, SH - 1.15, 1.5);
    add(limb(V(sx * 1.6, SH - 0.2, 0.05), elbow, 0.46, 0.42, 5), 0.8);
    add(limb(elbow, hand, 0.42, 0.32, 5), 1.0);
    // the hanging sleeve under the forearm
    const sleeve = frustum(0, 1.3, 0.2, 0.36, 0.42, 0.46, 4, Math.PI / 4);
    sleeve.translate(sx * 1.45, SH - 2.8, 1.0);
    add(sleeve, 0.6);
  }
  const hands = prep(new THREE.IcosahedronGeometry(0.46, 0));
  hands.scale(1.3, 0.9, 0.95);
  hands.translate(0, SH - 1.15, 1.56);
  add(hands, 1.2);
  // ---- the sword: a pommel over the hands, a wide guard, a ridged blade down to the plinth
  const sw = (g, k = 1) => parts.push(part(g, mul(blade, k), { ao: caught(0.75, 1.5), vary: 0.2, freq: 2.5 }));
  const SZ = 1.6, GY = SH - 1.95;
  const pommel = prep(new THREE.IcosahedronGeometry(0.28, 0));
  pommel.translate(0, SH - 0.6, SZ);
  sw(pommel, 1.6);
  mark.pommel = parts.length;
  const guard = prep(new THREE.BoxGeometry(2.6, 0.3, 0.4));
  guard.translate(0, GY, SZ);
  sw(guard, 1.6);
  for (const sx of [-1, 1]) {
    // the ends of the guard turned down
    const q = prep(new THREE.BoxGeometry(0.34, 0.55, 0.4));
    q.translate(sx * 1.13, GY - 0.35, SZ);
    sw(q, 1.6);
  }
  {
    // the blade: a diamond section (the ridge toward the viewer), its two flats take different light
    const L = GY - Y0 + 0.15;
    const bl = prep(new THREE.CylinderGeometry(1, 1, L, 4, 3));
    const p = bl.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = (p.getY(i) + L / 2) / L; // 0 at the point
      const w = t < 0.34 ? 0.1 + 0.9 * (t / 0.34) : 1;
      p.setX(i, p.getX(i) * 0.46 * w);
      p.setZ(i, p.getZ(i) * 0.15);
    }
    bl.translate(0, Y0 - 0.15 + L / 2, SZ);
    sw(bl, 1.5);
  }
  mark.sword = parts.length;
  // ---- neck and head
  const NY = SH + 0.35;
  add(frustum(NY - 0.3, 0.6, 0.38, 0.36, 0.32, 0.32, 6), 0.7);
  /** The head under its bamboo hat (local: the chin at the origin). */
  const hatted = () => {
    const h = prep(new THREE.IcosahedronGeometry(0.64, 0));
    h.scale(0.9, 1.1, 0.98);
    h.translate(0, 0.72, 0.06);
    // a steep hat tipped forward, its rim a pale ring
    const hat = prep(new THREE.ConeGeometry(1.3, 1.0, 8, 1));
    const brim = prep(new THREE.TorusGeometry(1.3, 0.1, 4, 8));
    brim.rotateX(Math.PI / 2);
    brim.translate(0, -0.5, 0);
    for (const g of [hat, brim]) {
      g.rotateX(0.2);
      g.translate(0, 1.48, 0.12);
    }
    return [[h, 0.8], [hat, 0.42], [brim, 1.6]];
  };
  mark.neck = parts.length;
  if (head === 'none') {
    // snapped at the neck: the head lies before the plinth on its side, the hat still on it
    const [hx, hz] = COLOSSUS_FALLEN_HEAD;
    for (const [g, k] of hatted()) {
      g.rotateZ(1.25);
      g.rotateY(-0.5);
      g.translate(hx, 0.75, hz);
      add(g, k);
    }
  } else if (head === 'hat') {
    for (const [g, k] of hatted()) {
      g.translate(0, NY, 0);
      add(g, k);
    }
  } else {
    // a pointed cowl over a dark face, a mantle spread on the shoulders
    const hood = prep(new THREE.ConeGeometry(1.0, 2.1, 6, 2));
    {
      const p = hood.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.9) p.setZ(i, p.getZ(i) - 0.4); // the peak falls back
    }
    hood.translate(0, NY + 1.05, -0.05);
    add(hood, 0.9);
    const face = prep(new THREE.IcosahedronGeometry(0.5, 0));
    face.scale(0.82, 1.1, 0.5);
    face.translate(0, NY + 0.62, 0.58);
    parts.push(part(face, [0.008, 0.008, 0.01], { vary: 0, ao: 0.3 }));
    add(frustum(NY - 0.6, 0.8, 1.8, 1.0, 0.62, 0.52, 6), 1.0);
  }
  mark.head = parts.length;
  // drawn taller than built: the camera looks down at 58 degrees and squashes anything upright
  for (const g of parts) g.scale(1, tall, 1);
  place(parts, x, z, yaw, s);
  if (!split) return parts;
  const M = mark, fallen = head === 'none';
  return {
    lower: [...parts.slice(0, M.lower), ...parts.slice(M.pommel, M.sword)],
    upper: [...parts.slice(M.lower, M.pommel), ...parts.slice(M.sword, M.neck), ...(fallen ? [] : parts.slice(M.neck, M.head))],
    head: fallen ? parts.slice(M.neck, M.head) : [],
    plinth: parts.slice(0, M.plinth).map((g) => g.clone()),
    cut: (Y0 + 3.6) * tall * s,
  };
}
/** The plinth of a colossus in local space ([lx, lz, r]): for the set's colliders. */
export const COLOSSUS_COLLIDERS = [[0, 0, 1.8]];
/** Where the head of a broken colossus (`head: 'none'`) lies, in local space: [lx, lz, r]. */
export const COLOSSUS_FALLEN_HEAD = [-2.6, 1.9, 1.0];

// ---------------------------------------------------------------- the Ashfall Courtyard
const VERMILION = [0.3, 0.06, 0.035];
const TILE = [0.06, 0.07, 0.095];
const GILT = [0.5, 0.36, 0.12];
const BRONZE = [0.2, 0.14, 0.065];

/**
 * A sweeping tiled roof: ridge along x, concave slopes, upturned corners. Centre at y (the eaves).
 * The tiles are courses running along the ridge, one pale and one dark in turn (each ~0.5 m of
 * slope: two rows of letters at the game camera), under a pale ridge beam with horned ends and a
 * pale line along each eave: the slopes print as bands that bend with the roof.
 */
function roof(w, d, rise, y, { lift = 1.1, tilt = 0 } = {}) {
  const rows = Math.max(3, Math.round(d / 2 / 0.5)); // courses on each slope
  const g = new THREE.PlaneGeometry(w, d, Math.round(w / 0.6), rows * 4);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / (w / 2), v = Math.min(1, Math.abs(p.getZ(i)) / (d / 2));
    p.setY(i, rise * Math.pow(1 - v, 1.7) + lift * Math.pow(Math.abs(u), 3) * (0.25 + 0.75 * v));
  }
  const sheet = prep(g);
  // (painted by the triangle's own centre, so a course is one flat tone from edge to edge)
  const course = (pz) => Math.min(rows - 1, Math.floor((Math.abs(pz) / (d / 2)) * rows * 0.999));
  paint(sheet, { col: TILE, flag: FLAG.STONE, ao: 1 });
  {
    const q = sheet.attributes.position, c = sheet.attributes.aCol;
    for (let i = 0; i + 2 < q.count; i += 3) {
      const cz = (q.getZ(i) + q.getZ(i + 1) + q.getZ(i + 2)) / 3, cx = (q.getX(i) + q.getX(i + 1) + q.getX(i + 2)) / 3;
      const k = course(cz);
      const m = (k === rows - 1 ? 1.9 : (rows - k) % 2 ? 0.9 : 0.28) * (0.85 + 0.3 * fbm2(cx * 0.5, cz * 0.7 + y, 2));
      for (let j = i; j < i + 3; j++) c.setXYZ(j, TILE[0] * m, TILE[1] * m, TILE[2] * m);
    }
  }
  const ridge = part(new THREE.BoxGeometry(w * 0.9, 0.36, 0.4), mul(TILE, 2.2), { vary: 0.15 });
  ridge.translate(0, rise + 0.12, 0);
  const out = [sheet, ridge];
  for (const sx of [-1, 1]) {
    // ridge-end ornaments: horned finials
    const fin = part(new THREE.ConeGeometry(0.26, 1.25, 4), mul(TILE, 2.4), { vary: 0.1 });
    fin.rotateZ(-sx * 0.5);
    fin.translate(sx * w * 0.45, rise + 0.7, 0);
    out.push(fin);
  }
  for (const g2 of out) {
    if (tilt) g2.rotateZ(tilt);
    g2.translate(0, y, 0);
  }
  return out;
}

/**
 * The gate of the sword sect: four vermilion columns under three tiled roofs, the centre one
 * highest, a name board in gilt below its beam. The far bay (+x) has burned: its column snapped,
 * its roof slid down in front of it. Red columns and beams, blue-grey tiles, gold on the board:
 * three hues, so the frame, the roofs and the name stay apart in letters of one size.
 * ~15 m wide, ~11 m tall at s = 1. Faces +z.
 */
export function buildSectGate(rng, x, z, yaw = 0, s = 1) {
  const parts = [];
  const red = (g, k = 1, o = {}) => parts.push(part(g, mul(VERMILION, k), { vary: 0.35, freq: 1.1, ao: (px, py) => 0.6 + 0.4 * Math.min(1, py / 3), ...o }));
  const stone = (g, k = 1) => parts.push(part(g, mul(GREY, k), { vary: 0.2, ao: caught(0.4, 1.4) }));
  const col = (cx, h, r = 0.5, broken = false) => {
    const g = prep(new THREE.CylinderGeometry(r * 0.9, r, h, 6, 4));
    g.translate(0, h / 2, 0);
    if (broken) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) > h * 0.8) p.setY(i, p.getY(i) - hash2(p.getX(i) * 17, p.getZ(i) * 17) * 0.9);
    }
    g.translate(cx, 0.45, 0);
    red(g, broken ? 0.6 : 1.25);
    const base = prep(new THREE.BoxGeometry(r * 3.2, 0.45, r * 3.2));
    base.translate(cx, 0.225, 0);
    stone(base, 0.9);
  };
  const beam = (x0, x1, y, h = 0.5, d = 0.56, k = 0.8) => {
    const g = prep(new THREE.BoxGeometry(x1 - x0, h, d));
    g.translate((x0 + x1) / 2, y, 0);
    red(g, k, { ao: caught(0.7, 1.5) });
  };
  col(-2.9, 8.6, 0.56);
  col(2.9, 8.6, 0.56);
  col(-6.8, 6.4, 0.48);
  col(6.8, 2.6, 0.48, true);
  // centre bay: two beams with the name board between them, bracket blocks, a narrow roof on top
  // (a gate seen from above is all roof unless its roofs are narrow: the posts must show)
  beam(-4.1, 4.1, 6.6, 0.6, 0.62);
  beam(-4.3, 4.3, 8.3, 0.56, 0.68);
  for (let bx = -3.6; bx <= 3.61; bx += 1.8) beam(bx - 0.3, bx + 0.3, 8.78, 0.42, 1.1, 1.3);
  const board = prep(new THREE.BoxGeometry(3.4, 1.14, 0.2));
  board.translate(0, 7.45, 0.3);
  parts.push(part(board, [0.03, 0.033, 0.045], { vary: 0.2 }));
  for (const bx of [-1.05, 0, 1.05]) {
    // three gilt characters on the board (blocks: at this size each one is a few gold letters)
    const ch = prep(new THREE.BoxGeometry(0.7, 0.8, 0.1));
    ch.translate(bx, 7.45, 0.44);
    parts.push(part(ch, GILT, { vary: 0.4, freq: 6 }));
  }
  parts.push(...roof(10.4, 2.6, 0.95, 9.0));
  // near bay (-x): standing
  beam(-7.3, -2.9, 4.9);
  beam(-7.5, -2.9, 6.05, 0.46, 0.6);
  parts.push(...roof(5.8, 2.2, 0.8, 6.75).map((g) => g.translate(-5.4, 0, 0)));
  // far bay (+x): burned. A beam hangs from the centre column; the roof lies tilted on the ground
  {
    const g = prep(new THREE.BoxGeometry(4.6, 0.5, 0.56));
    g.translate(2.3, 0, 0);
    g.rotateZ(-0.62);
    g.translate(2.9, 4.9, 0);
    red(g, 0.45);
  }
  parts.push(
    ...roof(5.8, 2.2, 0.8, 0, { tilt: -0.36 }).map((g) => {
      g.rotateY(0.3);
      g.translate(6.4, 1.5, 1.7);
      return g;
    }),
  );
  // broad steps up to the threshold
  for (let i = 0; i < 3; i++) {
    const st = prep(new THREE.BoxGeometry(8.6 - i * 1.0, 0.2, 0.9));
    st.translate(0, 0.1 + i * 0.2 - 0.2, 2.6 - i * 0.85);
    stone(st, 0.8);
  }
  return place(parts, x, z, yaw, s);
}
export const GATE_COLLIDERS = [[-6.8, 0, 0.85], [-2.9, 0, 0.95], [2.9, 0, 0.95], [6.8, 0, 0.85], [6.4, 1.7, 2.0]];
/** The gate's footprint in its own space (|lx|, lz from .. to): the set clears trees and boulders there. */
export const GATE_FOOTPRINT = { halfX: 10.5, z0: -4, z1: 6.5 };

/**
 * A great bronze incense cauldron (a ding): a round belly on three splayed legs, a broad flat rim
 * round a dark hollow of cold ash, two square ears standing on the rim. Seen from above it is a
 * pale ring round a dark well, which is what says "vessel": a solid lid of ash printed as a boulder.
 * ~3.6 m to the top of its ears, the rim 3.6 m across at s = 1.
 */
export function buildCauldron(rng, x, z, yaw = 0, s = 1) {
  const parts = [];
  const br = (g, k = 1, o = {}) => parts.push(part(g, mul(BRONZE, k), { vary: 0.35, freq: 2.0, ao: caught(0.4, 1.3), ...o }));
  // the belly: ten flat sides, its widest above the middle, a neck under the rim
  const prof = [[0.55, 0], [1.3, 0.25], [1.62, 0.95], [1.5, 1.5], [1.34, 1.72]].map(([r, y]) => new THREE.Vector2(r, y));
  const belly = prep(new THREE.LatheGeometry(prof, 10));
  belly.translate(0, 0.95, 0);
  br(belly, 0.9);
  // the rim: a broad flat ring (it catches the light), a band of studs below it
  const rimProf = [[1.34, 0], [1.8, 0], [1.8, 0.24], [1.32, 0.24], [1.32, -0.75]].map(([r, y]) => new THREE.Vector2(r, y));
  const rim = prep(new THREE.LatheGeometry(rimProf, 10));
  rim.translate(0, 2.67, 0);
  br(rim, 1.45);
  // the well: cold ash far down inside, in shadow
  const ash = prep(new THREE.CylinderGeometry(1.32, 1.32, 0.1, 10));
  ash.translate(0, 1.95, 0);
  parts.push(part(ash, [0.012, 0.011, 0.01], { vary: 0, ao: 0.3 }));
  for (let i = 0; i < 10; i++) {
    const a = ((i + 0.5) / 10) * TAU;
    const st = prep(new THREE.IcosahedronGeometry(0.17, 0));
    st.translate(Math.cos(a) * 1.6, 2.0, Math.sin(a) * 1.6);
    br(st, 1.7, { vary: 0.1 });
  }
  // three legs, splayed past the belly so they show from above, each on a paw
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + Math.PI / 2; // one to the front (+z)
    const c = Math.cos(a), sn = Math.sin(a);
    br(limb(V(c * 1.15, 1.3, sn * 1.15), V(c * 1.95, 0.12, sn * 1.95), 0.36, 0.26, 5), 1.0);
    const paw = prep(new THREE.IcosahedronGeometry(0.36, 0));
    paw.scale(1.1, 0.6, 1.1);
    paw.translate(c * 2.02, 0.2, sn * 2.02);
    br(paw, 1.2);
  }
  // two square ears standing on the rim
  for (const sx of [-1, 1]) {
    for (const [w, h, dx, dy] of [[0.2, 0.75, -0.33, 0.37], [0.2, 0.75, 0.33, 0.37], [0.86, 0.2, 0, 0.85]]) {
      const g = prep(new THREE.BoxGeometry(0.24, h, w));
      g.translate(sx * 1.58, 2.91 + dy, dx);
      br(g, 1.5);
    }
  }
  return place(parts, x, z, yaw, s);
}
/** The cauldron's footprint in local space ([lx, lz, r]): for the set's colliders. */
export const CAULDRON_COLLIDERS = [[0, 0, 2.05]];

// ---------------------------------------------------------------- the Obsidian Throne
const OBSIDIAN = [0.1, 0.105, 0.14]; // carved like the hall's pillars (obsidian 0.075 .. 0.11)
const BLOODSTEEL = [0.34, 0.05, 0.035];
const COLD_STEEL = [0.2, 0.215, 0.27];

/**
 * A sword taller than the hall's pillars, driven into the floor: a slim ridged blade of
 * pale steel (its two flats take different light), a straight guard with turned-down ends, a
 * wrapped grip and a red ring pommel. The swords of those who came before. A thin form reads at
 * once: the blade is five letters wide at the game camera, the guard fifteen. ~7.4 m at s = 1.
 * `lean` tips it sideways (+: toward -x), `tilt` toward the viewer (+z).
 */
export function buildGreatSword(rng, x, z, yaw = 0, s = 1, { lean = 0.12, tilt = 0, col = OBSIDIAN, steel = COLD_STEEL, edge = BLOODSTEEL } = {}) {
  const parts = [];
  const L = 5.2; // the blade above the floor
  const dark = (g, k = 1) => parts.push(part(g, mul(col, k), { vary: 0.2, ao: caught(0.5, 1.6) }));
  {
    // a diamond section, the ridge toward the viewer; it narrows a little toward the floor
    const bl = prep(new THREE.CylinderGeometry(1, 1, L + 0.6, 4, 4));
    const p = bl.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = (p.getY(i) + (L + 0.6) / 2) / (L + 0.6); // 0 at the buried point
      p.setX(i, p.getX(i) * (0.3 + 0.1 * t));
      p.setZ(i, p.getZ(i) * 0.12);
    }
    bl.translate(0, (L + 0.6) / 2 - 0.6, 0);
    // (pale steel: the brightest thing in its aisle)
    parts.push(part(bl, steel, { vary: 0.25, freq: 2.2, ao: (px, py) => 0.7 + 0.3 * Math.min(1, py / 3) }));
  }
  const guard = prep(new THREE.BoxGeometry(2.2, 0.3, 0.42));
  guard.translate(0, L + 0.15, 0);
  dark(guard, 1.5);
  for (const sx of [-1, 1]) {
    const q = prep(new THREE.BoxGeometry(0.32, 0.6, 0.42));
    q.translate(sx * 0.94, L - 0.2, 0);
    dark(q, 1.5);
  }
  const grip = prep(new THREE.CylinderGeometry(0.14, 0.16, 1.3, 6, 1));
  grip.translate(0, L + 0.95, 0);
  dark(grip, 0.9);
  const ring = prep(new THREE.TorusGeometry(0.3, 0.11, 4, 8));
  ring.translate(0, L + 1.85, 0);
  parts.push(part(ring, mul(edge, 1.2), { vary: 0.2 }));
  for (const g of parts) {
    g.rotateX(tilt);
    g.rotateZ(lean);
  }
  // rubble where it broke the floor
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + rng(), r = range(rng, 0.45, 0.9);
    const chunk = prep(new THREE.IcosahedronGeometry(range(rng, 0.18, 0.34), 0));
    chunk.scale(1, 0.6, 1);
    chunk.translate(Math.cos(a) * r, 0.1, Math.sin(a) * r);
    dark(chunk, 1.1);
  }
  return place(parts, x, z, yaw, s);
}

/**
 * The throne's wardens: two hooded colossi cast in dark bronze, over swords of cold steel. The hall
 * is obsidian lit red from every side: in obsidian they sank into the pillars and walls round them,
 * and a red blade into the light. Bronze and pale steel are the two hues the hall does not have.
 */
export const buildWarden = (rng, x, z, yaw, s) => buildColossus(rng, x, z, yaw, s, { col: mul(OLD_BRONZE, 0.75), head: 'hood', blade: mul(COLD_STEEL, 0.8) });

// ---------------------------------------------------------------- the Obsidian Throne: Starfall (ADR-112)
// The crater's pieces are built for prop art directly: carve() attributes, flat facets, one tone a
// facet. They go into a set's `stones` mesh (or its breakables) as they are: no carved() pass.
const STAR_ROCK = [0.075, 0.078, 0.105]; // the crater floor's obsidian
/** The star's glass: obsidian with a violet cast (the shards, the crown behind the throne). */
export const STAR_GLASS = [0.07, 0.058, 0.13];

/** One tone per facet, keyed by its normal: a spread of tones is what prints as form. */
const facetTone = (nx, ny, nz) => 0.5 + 1.1 * hash2(Math.round(nx * 9) + Math.round(ny * 9) * 31, Math.round(nz * 9) + 7);
/** A carve() colour: `c` × k × the facet's tone. */
export const facetCol = (c, k = 1) => (px, py, pz, nx, ny, nz) => mul(c, k * facetTone(nx, ny, nz));

/**
 * A spike: a box tapering to `tip` of its base, its foot at (x, y, z). `lean` rad toward
 * (sin yaw, cos yaw); `roll` rad sideways in its own plane (a fan of spikes facing the camera).
 * Carved. The crater's rim slabs and the crown behind the throne are these.
 */
export function buildSpike(rng, x, y, z, { h, w, d = w, tip = 0.1, lean = 0, yaw = 0, roll = 0, col, lump = 0.04 }) {
  const g = prep(new THREE.BoxGeometry(w, h, d, 1, 4, 1));
  g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = 1 - (1 - tip) * Math.pow(Math.max(0, p.getY(i) / h), 1.2);
    p.setX(i, p.getX(i) * t);
    p.setZ(i, p.getZ(i) * t);
  }
  if (lump) lumpy(g, lump, 1.3, rng() * 99, V(0, h / 2, 0));
  if (roll) g.rotateZ(roll);
  g.rotateX(lean);
  g.rotateY(yaw);
  g.translate(x, y, z);
  carve(g, { col, ao: (px, py) => 0.5 + 0.5 * Math.min(1, (py - y) / 1.5) });
  return g;
}

/**
 * The star that fell with him, half sunk where it stopped: two faceted halves split down the
 * middle (he climbed out of the cleft), a crown of ten glass splinters fanned behind them, the
 * tallest 10 m. ~18 m wide. (x, z) is its centre; the cleft faces +z, and his seat stands 5.4 m in
 * front of it. Carved parts.
 */
export function buildFallenStar(rng, x, z) {
  const parts = [];
  for (const sx of [-1, 1]) {
    const half = prep(new THREE.IcosahedronGeometry(4.6, 1));
    lumpy(half, 2.2, 0.3, 7.3 + sx * 3);
    half.scale(1.0, 0.95, 0.9);
    half.rotateZ(sx * 0.16);
    half.translate(x + sx * 4.3, 1.5, z);
    carve(half, { col: facetCol(STAR_ROCK, 1.3), ao: (px, py) => 0.45 + 0.55 * Math.min(1, py / 3.2) });
    parts.push(half);
  }
  for (let i = -5; i <= 5; i++) {
    if (i === 0) continue;
    const roll = -i * 0.2 + range(rng, -0.05, 0.05), h = (10.5 - Math.abs(i) * 1.1) * range(rng, 0.85, 1.1);
    parts.push(buildSpike(rng, x + i * 1.15, 2.6, z + 0.6 - Math.abs(i) * 0.12, { h, w: 0.95 - Math.abs(i) * 0.05, d: 0.42, tip: 0.06, roll, lean: -0.1, col: facetCol(STAR_GLASS, 1.7) }));
  }
  return parts;
}
/** Colliders of the fallen star in local space: [lx, lz, r] (a row across its south face). */
export const STAR_COLLIDERS = [-7.5, -5.9, -4.3, -2.7, -1.1, 0.5, 2.1, 3.7, 5.3, 6.9].map((lx) => [lx, 1.2, 1.1]);

/**
 * The light in the star's cleft: two lines of strokes that open upward from behind the seat.
 * Returns inlay glyphs ({ x, y, z, glyph, size, color, flicker }) for the set's glow batch.
 */
export function starCleft(rng, x, z) {
  const out = [];
  for (let y = 1.4; y < 7.4; y += 0.36) {
    for (const sx of [-1, 1]) out.push({ x: x + sx * (0.1 + y * 0.17) + range(rng, -0.12, 0.12), y, z: z + 3.0 - y * 0.25, glyph: sx < 0 ? '\\' : '/', size: 0.5, color: [2.4, 0.12, 0.08], flicker: 0.14 });
  }
  return out;
}
