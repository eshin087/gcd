import * as THREE from 'three';
import { planarGUV } from '../../../render/glyphGeometry.js';
import { boxGeometry, gripFist, mergeGeometries, strapGeometry } from '../heroGeo.js';

// Shields: `offhand` items, hung on the free forearm's shield joint (model.js arms.L.shield; its Y
// is the forearm's line, +Z the way the shield faces, −X its top). A shield is modelled here in its
// own upright frame (x across, y up, z out of its face; the origin is where the forearm crosses it)
// and turned onto the joint by `onArm`. With a shield equipped the animator plays the
// sword-and-shield clips (rig.shield; anim.js, shieldPoses.js).
//
//   shield.kite    the hooded hero's (the concept sheet's): a tall kite with a point at the top and
//                  at the foot, a thick silver rim (a bold line on both its edges, front AND back: the
//                  carry shows him the back most of the time), a dark crystal face cut in four faint
//                  facets, a bright four-point star with a long vertical ray and a tight glow
//
// Materials (HERO_INK, the player's own bank): the rim `abRim` (silver, bold lines), the face and
// the back `abShield` (dark crystal), the star `abCrystal` (the blade's light, own glow), the straps
// and the gloved fist `abPants`.

/**
 * The shapes. `h` / `w`: height and width (m); `at`: the height (0 = the foot .. 1 = the top) where
 * the forearm crosses; `star`: the star's centre (same scale), its rays' half-lengths [across, up,
 * down] and its waist; `rim`: the silver rim's width; `pts`: the right half of the outline from the
 * top to the foot, [x, y] with y measured up from the foot (the left half is its mirror).
 * kite (SPEC.md): 0.78 × 0.45 m; the upper corners ~25 % down, widest 30 - 45 % down, straight
 * sides tapering to the foot; the star 42 % down, its vertical ray ~68 % of the height.
 */
export const SHIELD_SHAPES = {
  kite: {
    h: 0.78, w: 0.45, at: 0.56, rim: 0.035,
    star: { at: 0.58, r: [0.13, 0.2, 0.33], waist: 0.017 },
    pts: [[0, 0.78], [0.165, 0.665], [0.225, 0.585], [0.225, 0.44], [0.16, 0.24], [0.07, 0.09], [0, 0]],
  },
};

/** How far the plate stands off the forearm's axis (the sleeve and the elbow clear its back), and
 *  how far its side edges curve back round the arm (m). */
export const SHIELD_OFF = 0.08;
const WRAP = 0.03;
/** The plate's thickness (m): the rim's wall seen edge-on. */
const TH = 0.014;

/** Turn an upright-frame geometry onto the shield joint (up → −X, the face → +Z) and stand it off the arm. */
const onArm = (g) => g.rotateZ(Math.PI / 2).translate(0, 0, SHIELD_OFF);

/** The outline as a closed loop (upright frame, the origin where the forearm crosses), counter-
 *  clockwise seen from the front. */
function loop(S) {
  const y0 = S.at * S.h, R = S.pts.map(([x, y]) => [x, y - y0]), mid = R.slice(1, -1);
  return [R[0], ...mid.map(([x, y]) => [-x, y]), R[R.length - 1], ...mid.slice().reverse()];
}

/** Split each edge of a loop into `n` (the facets and the rim follow the outline smoothly). */
function refine(L, n) {
  const out = [];
  for (let i = 0; i < L.length; i++) {
    const A = L[i], B = L[(i + 1) % L.length];
    for (let k = 0; k < n; k++) out.push([A[0] + (B[0] - A[0]) * (k / n), A[1] + (B[1] - A[1]) * (k / n)]);
  }
  return out;
}

/** A triangle soup → a hero geometry (position, normal, aGUV x / y of the upright frame), with an
 *  ink sub-id per triangle (`subId(i)`) when given. */
function soup(tris, subId = null) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris.flat(2)), 3));
  g.computeVertexNormals();
  planarGUV(g, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
  if (subId) {
    const a = new Float32Array(tris.length * 3);
    tris.forEach((_, i) => a.fill(subId(i) ? 1 : 0, i * 3, i * 3 + 3));
    g.setAttribute('aPart', new THREE.BufferAttribute(a, 1));
  }
  return g;
}

/** A flat four-point star in the XY plane (rays: ±rx across, +ru up, −rd down; concave waist w),
 *  `th` thick, its faces rising `peak` to the centre. */
function starPlate(rx, ru, rd, w, th, peak) {
  const tips = [[rx, 0], [0, ru], [-rx, 0], [0, -rd]];
  const rim = [];
  for (let k = 0; k < 4; k++) {
    const A = tips[k], B = tips[(k + 1) % 4];
    rim.push(A);
    const ang = Math.atan2(A[1] / Math.hypot(...A) + B[1] / Math.hypot(...B), A[0] / Math.hypot(...A) + B[0] / Math.hypot(...B));
    rim.push([Math.cos(ang) * w, Math.sin(ang) * w]);
  }
  const tris = [], h = th / 2, n = rim.length;
  for (let i = 0; i < n; i++) {
    const p = rim[i], q = rim[(i + 1) % n];
    tris.push([[0, 0, h + peak], [p[0], p[1], h], [q[0], q[1], h]]);
    tris.push([[0, 0, -h - peak], [q[0], q[1], -h], [p[0], p[1], -h]]);
    tris.push([[p[0], p[1], h], [p[0], p[1], -h], [q[0], q[1], -h]], [[p[0], p[1], h], [q[0], q[1], -h], [q[0], q[1], h]]);
  }
  return soup(tris);
}

/**
 * Shield `S` as upright-frame geometries: `rim` (the silver band between the outline and the face,
 * its outer wall, and the same band on the back), `face` (four flat facets meeting at the star's
 * centre: alternate ink sub-ids, faint lines), `back` (the plate seen from behind, inside its rim)
 * and `star`.
 */
export function shieldGeometry(S) {
  const half = S.w / 2, O = refine(loop(S), 3), n = O.length;
  const z = (x, y) => -WRAP * (x / half) ** 2 - 0.01 * (y / (S.h / 2)) ** 2;
  const cy = (S.star.at - S.at) * S.h;
  // the inner outline: the rim's width inside the shield's own (along the normal of the outline)
  const I = O.map(([x, y], i) => {
    const A = O[(i - 1 + n) % n], B = O[(i + 1) % n];
    let tx = B[0] - A[0], ty = B[1] - A[1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    // the loop runs counter-clockwise: inward is the tangent turned left
    return [x - ty * S.rim, y + tx * S.rim];
  });
  const P = (p, dz = 0) => [p[0], p[1], z(p[0], p[1]) + dz];
  const C = [0, cy, z(0, cy) + 0.02]; // the face rises a little to the star's centre
  const rim = [], face = [], back = [], quad = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    rim.push([P(O[i], 0.004), P(O[j], 0.004), P(I[j], 0.008)], [P(O[i], 0.004), P(I[j], 0.008), P(I[i], 0.008)]);
    rim.push([P(O[i], -TH), P(O[j], -TH), P(O[j], 0.004)], [P(O[i], -TH), P(O[j], 0.004), P(O[i], 0.004)]);
    // the rim on the back: the same band, so the plate seen from behind has its bold outline too
    rim.push([P(O[j], -TH), P(O[i], -TH), P(I[j], -TH - 0.004)], [P(I[j], -TH - 0.004), P(O[i], -TH), P(I[i], -TH - 0.004)]);
    face.push([P(I[i], 0.006), P(I[j], 0.006), C]);
    // the facet a triangle belongs to: the quadrant of its middle round the star's centre (four
    // facets: their meeting lines are the star's cross, faint)
    const mx = (I[i][0] + I[j][0]) / 2, my = (I[i][1] + I[j][1]) / 2 - cy;
    quad.push((mx >= 0) !== (my >= 0));
    back.push([P(I[j], -TH - 0.003), P(I[i], -TH - 0.003), [0, cy, z(0, cy) - TH - 0.012]]);
  }
  const k = S.star.r;
  const star = starPlate(k[0], k[1], k[2], S.star.waist, 0.006, 0.016).translate(0, cy, z(0, cy) + 0.026);
  return { rim: soup(rim), face: soup(face, (i) => quad[i]), back: soup(back), star };
}

/**
 * Build shield `S` (a SHIELD_SHAPES entry) on the shield joint: the rim, the faceted face, the
 * star, the back, the strap by the elbow and the gloved fist on the handle at the wrist. Returns
 * the `shield` handle the animator reads (m): half = [half width, half height], off = how far the
 * plate stands off the forearm's axis, top / foot = how far it reaches above / below the forearm.
 */
function buildShield({ arms, M, DIM, BODY, mesh }, S) {
  const J = arms.L.shield, G = shieldGeometry(S);
  mesh(J, onArm(G.rim), M.abRim);
  mesh(J, onArm(G.face), M.abShield);
  mesh(J, onArm(G.back), M.abShield);
  mesh(J, onArm(G.star), M.abCrystal);
  // the strap round the forearm by the elbow (joint space: +Y = toward the elbow) …
  const yE = 0.095, yW = -(DIM.foreArm - DIM.shieldAt) + 0.012, zb = SHIELD_OFF - TH - 0.006;
  mesh(J, mergeGeometries([
    strapGeometry([0.05, yE, zb], [0.05, yE, -BODY.foreArm[0] - 0.014], 0.034, 0.008, [0, 1, 0]),
    strapGeometry([-0.05, yE, zb], [-0.05, yE, -BODY.foreArm[0] - 0.014], 0.034, 0.008, [0, 1, 0]),
    strapGeometry([0.054, yE, -BODY.foreArm[0] - 0.012], [-0.054, yE, -BODY.foreArm[0] - 0.012], 0.034, 0.008, [0, 1, 0]),
    // … and the handle the fist closes on: a bar along the shield's height, on two posts
    boxGeometry(0.16, 0.016, 0.016, 0, yW, 0.006),
    boxGeometry(0.014, 0.014, zb, 0.074, yW, zb / 2),
    boxGeometry(0.014, 0.014, zb, -0.074, yW, zb / 2),
  ]), M.abPants);
  // the fist: heroGeo's grip fist (its grip along local Z, the knuckles on +X) turned so the grip is
  // the handle (the thumb's end up the shield) and the knuckles face the plate
  const F = gripFist(BODY.hand);
  mesh(J, mergeGeometries([F.fingers, F.thumb, F.ridge]).rotateY(-Math.PI / 2).translate(0, yW, 0.006), M.abPants);
  return { shield: { half: [S.w / 2, S.h / 2], off: SHIELD_OFF, top: S.h * (1 - S.at), foot: S.h * S.at } };
}

export const SHIELD_ITEMS = [
  { id: 'shield.kite', slot: 'offhand', name: 'Starlit Kite', build: (ctx) => buildShield(ctx, SHIELD_SHAPES.kite) },
];
