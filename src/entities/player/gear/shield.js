import * as THREE from 'three';
import { planarGUV } from '../../../render/glyphGeometry.js';
import { boxGeometry, gripFist, mergeGeometries, starGeometry, strapGeometry } from '../heroGeo.js';

// Shields: `offhand` items, hung on the free forearm's shield joint (model.js arms.L.shield; its Y
// is the forearm's line, +Z the way the shield faces, −X its top). A shield is modelled here in its
// own upright frame (x across, y up, z out of its face; the origin is where the forearm crosses it)
// and turned onto the joint by `onArm`. With a shield equipped the animator plays the
// sword-and-shield clips (rig.shield; anim.js).
//
//   shield.kite    the hero's (gear/abyss.js; PLACEHOLDER look, PR #65's): a tall kite, a silver rim,
//                  a dark faceted crystal face, a glowing four-point star
//
// Materials (the look's tint paints them): the rim `trim` (silver), the face `spike` (black cloth
// tinted: its facets are outlined in white), the back and the straps `leather`, the star `bladeTip`
// (the blade's own light: it flares with a strike, player.js), the gloved fist `armor`.

/**
 * The shapes. `h` / `w`: height and width (m); `at`: the height (0 = the foot .. 1 = the top) where
 * the forearm crosses; `star`: the star's centre (same scale) and its half-size [across, up];
 * `rim`: the silver rim's width; `pts`: the right half of the outline from the top to the foot,
 * [x, y] with y measured up from the foot (the left half is its mirror).
 */
export const SHIELD_SHAPES = {
  // a tall kite: a low point at the top, square shoulders, a long taper to the foot
  kite: {
    h: 0.8, w: 0.46, at: 0.57, rim: 0.034, star: { at: 0.6, r: [0.085, 0.2] },
    pts: [[0, 0.8], [0.115, 0.752], [0.23, 0.7], [0.23, 0.53], [0.185, 0.31], [0.1, 0.11], [0, 0]],
  },
};

/** How far the plate stands off the forearm's axis (the sleeve and the elbow clear its back), and
 *  how far its side edges curve back round the arm (m). */
export const SHIELD_OFF = 0.08;
const WRAP = 0.035;

/** Turn an upright-frame geometry onto the shield joint (up → −X, the face → +Z) and stand it off the arm. */
const onArm = (g) => g.rotateZ(Math.PI / 2).translate(0, 0, SHIELD_OFF);

/** The outline as a closed loop (upright frame, the origin where the forearm crosses), counter-
 *  clockwise seen from the front. */
function loop(S) {
  const y0 = S.at * S.h, R = S.pts.map(([x, y]) => [x, y - y0]), mid = R.slice(1, -1);
  // top → down the −x side → foot → up the +x side: counter-clockwise from the front
  return [R[0], ...mid.map(([x, y]) => [-x, y]), R[R.length - 1], ...mid.slice().reverse()];
}

/** A flat-shaded triangle soup → a hero geometry (position, normal, aGUV x / y of the upright frame). */
function soup(tris, subId = null) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris.flat(2)), 3));
  g.computeVertexNormals();
  planarGUV(g, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
  if (subId) {
    // one ink sub-id per triangle (`subId(i)` 0 / 1): a line between two facets that differ
    const a = new Float32Array(tris.length * 3);
    tris.forEach((_, i) => a.fill(subId(i) ? 1 : 0, i * 3, i * 3 + 3));
    g.setAttribute('aPart', new THREE.BufferAttribute(a, 1));
  }
  return g;
}

/**
 * Shield `S` as upright-frame geometries: `rim` (the band between the outline and the face),
 * `face` (a fan of flat facets from the star's centre: a cut crystal; alternate ink sub-ids, so
 * every facet is outlined), `back` (the same plate seen from behind) and `star`.
 */
export function shieldGeometry(S) {
  const half = S.w / 2, O = loop(S), n = O.length;
  const z = (x, y) => -WRAP * (x / half) ** 2 - 0.012 * (y / (S.h / 2)) ** 2;
  const cy = (S.star.at - S.at) * S.h;
  // the face's outline: the rim's width inside the shield's own
  const I = O.map(([x, y]) => {
    const d = Math.hypot(x, y - cy) || 1, k = Math.max(0, 1 - S.rim / d);
    return [x * k, cy + (y - cy) * k];
  });
  const P = (p, dz = 0) => [p[0], p[1], z(p[0], p[1]) + dz];
  const C = [0, cy, z(0, cy) + 0.016]; // the face rises a little to the star's centre
  const rim = [], face = [], back = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    rim.push([P(O[i], 0.004), P(O[j], 0.004), P(I[j], 0.007)], [P(O[i], 0.004), P(I[j], 0.007), P(I[i], 0.007)]);
    // (the outer wall of the rim: the plate has a thickness seen edge-on)
    rim.push([P(O[i], -0.008), P(O[j], -0.008), P(O[j], 0.004)], [P(O[i], -0.008), P(O[j], 0.004), P(O[i], 0.004)]);
    face.push([P(I[i], 0.004), P(I[j], 0.004), C]);
    back.push([P(O[j], -0.008), P(O[i], -0.008), [0, cy, z(0, cy) - 0.008]]);
  }
  const k = S.star.r;
  const star = starGeometry(k[0], k[1], Math.min(k[0], k[1]) * 0.2, 0.006, 0.014).rotateX(Math.PI / 2).translate(0, cy, z(0, cy) + 0.02);
  return { rim: soup(rim), face: soup(face, (i) => i & 1), back: soup(back), star };
}

/**
 * Build shield `S` (a SHIELD_SHAPES entry) on the shield joint: the rim, the faceted face, the
 * star, the back, the strap by the elbow and the gloved fist on the handle at the wrist. Returns
 * the `shield` handle the animator reads (m): half = [half width, half height], off = how far the
 * plate stands off the forearm's axis, top / foot = how far it reaches above / below the forearm.
 */
function buildShield({ arms, M, DIM, BODY, mesh }, S) {
  const J = arms.L.shield, G = shieldGeometry(S);
  mesh(J, onArm(G.rim), M.trim);
  mesh(J, onArm(G.face), M.spike);
  mesh(J, onArm(G.back), M.leather);
  mesh(J, onArm(G.star), M.bladeTip);
  // the strap round the forearm by the elbow (joint space: +Y = toward the elbow) …
  const yE = 0.095, yW = -(DIM.foreArm - DIM.shieldAt) + 0.012;
  mesh(J, mergeGeometries([
    strapGeometry([0.05, yE, SHIELD_OFF - 0.012], [0.05, yE, -BODY.foreArm[0] - 0.006], 0.034, 0.008, [0, 1, 0]),
    strapGeometry([-0.05, yE, SHIELD_OFF - 0.012], [-0.05, yE, -BODY.foreArm[0] - 0.006], 0.034, 0.008, [0, 1, 0]),
    strapGeometry([0.054, yE, -BODY.foreArm[0] - 0.004], [-0.054, yE, -BODY.foreArm[0] - 0.004], 0.034, 0.008, [0, 1, 0]),
    // … and the handle the fist closes on: a bar along the shield's height, on two posts
    boxGeometry(0.16, 0.016, 0.016, 0, yW, 0.006),
    boxGeometry(0.014, 0.014, SHIELD_OFF - 0.012, 0.074, yW, (SHIELD_OFF - 0.012) / 2),
    boxGeometry(0.014, 0.014, SHIELD_OFF - 0.012, -0.074, yW, (SHIELD_OFF - 0.012) / 2),
  ]), M.leather);
  // the fist: heroGeo's grip fist (its grip along local Z, the knuckles on +X) turned so the grip is
  // the handle (the thumb's end up the shield) and the knuckles face the plate
  const F = gripFist(BODY.hand);
  mesh(J, mergeGeometries([F.fingers, F.thumb, F.ridge]).rotateY(-Math.PI / 2).translate(0, yW, 0.006), M.armor);
  return { shield: { half: [S.w / 2, S.h / 2], off: SHIELD_OFF, top: S.h * (1 - S.at), foot: S.h * S.at } };
}

export const SHIELD_ITEMS = [
  { id: 'shield.kite', slot: 'offhand', name: 'Starlit Kite', build: (ctx) => buildShield(ctx, SHIELD_SHAPES.kite) },
];
