// THE SHIELD (ADR-267; the owner, 2026-11-27: "make the main character attack animation exactly like this youtube video
// ... do one without a shield and one with a shield"; asked, the shield is LOOKS ONLY: it rides the free arm through the
// attacks and the guard, and blocking and parrying are exactly as before). A heater shield strapped to the outside of the
// left forearm: a dark gunmetal face (the hero's `armor`), bulging a little outward, a silver rim and a cross band on it
// (`bevel`), a boss at its middle (`trim`): the hero's own inks, drawn by his art pass like the rest of him. Worn only
// with `?shield=1` (`shieldFromUrl`), in its own slot (`shield`), so nothing else changes and the default build is the
// same mesh for mesh.
//
// Built in the forearm's frame (arms.L.fore: +y up the forearm toward the elbow, its outside +x): the face's normal is
// +x, its width runs along the forearm (y), its height across it (z: +z toward the shield's top, the forearm crossing
// its back a little above the middle, as a shield's straps hold it).

import * as THREE from 'three';
import { gridGeometry, mergeGeometries, ring } from '../heroGeo.js';

/** The shield's measurements (m): `w` half its width, `top` / `point` how far its top edge and its point lie from the
 *  forearm across it, `shoulder` where its sides start to close toward the point, `bulge` its outward curve at the middle,
 *  `off` how far its back stands off the forearm's axis, `at` where along the forearm its middle sits (from the elbow),
 *  `rim` the rim's width. */
export const SHIELD = { w: 0.2, top: 0.2, point: 0.34, shoulder: -0.04, bulge: 0.04, off: 0.06, at: -0.14, rim: 0.016 };

/** The half-width of the face at height z (m, across the forearm). */
function halfW(S, z) {
  if (z >= S.shoulder) return S.w;
  const k = (z + S.point) / (S.point + S.shoulder); // 0 at the point, 1 at the shoulder
  return S.w * Math.sqrt(Math.max(0, k));
}

/** The face as a grid: s across (along the forearm), t from the point to the top; `inset` shrinks it (the rim's
 *  inner edge), `lift` stands it out (the rim sits proud of the face). */
function faceGeometry(S, inset = 0, lift = 0) {
  return gridGeometry(10, 12, (s, t, o) => {
    const z = -S.point + inset + t * (S.top + S.point - 2 * inset);
    const hw = Math.max(0, halfW(S, z) - inset);
    const y = (s - 0.5) * 2 * hw;
    const x = S.off + lift + S.bulge * (1 - (y / S.w) ** 2) * (1 - 0.35 * ((z - (S.top - S.point) / 2) / S.point) ** 2);
    o[0] = x;
    o[1] = S.at + y;
    o[2] = z;
    o[3] = y * 3;
    o[4] = z * 3;
  });
}

/** The rim: a strip along the outline, from the face's edge `rim` inward, standing 4 mm proud. */
function rimGeometry(S) {
  const outer = faceGeometry(S, 0, 0.004);
  const inner = faceGeometry(S, S.rim, 0.004);
  // (keep only the outline band: drop the quads of the outer sheet that lie inside the inner one)
  const keep = gridGeometry(10, 12, (s, t, o) => {
    const z = -S.point + t * (S.top + S.point);
    const hw = halfW(S, z);
    const y = (s - 0.5) * 2 * hw;
    o[0] = S.off + 0.004 + S.bulge * (1 - (y / S.w) ** 2);
    o[1] = S.at + y;
    o[2] = z;
    o[3] = y * 3;
    o[4] = z * 3;
  }, false, (i, j) => i > 0 && i < 9 && j > 0 && j < 11);
  outer.dispose();
  inner.dispose();
  return keep;
}

/** The cross band down the face's middle and across it under the top, a silver strip 2.5 cm wide. */
function crossGeometry(S) {
  const band = (y0, y1, z0, z1) => gridGeometry(2, 8, (s, t, o) => {
    const y = y0 + (y1 - y0) * (y1 - y0 > z1 - z0 ? t : s);
    const z = z0 + (z1 - z0) * (y1 - y0 > z1 - z0 ? s : t);
    o[0] = S.off + 0.005 + S.bulge * (1 - (y / S.w) ** 2);
    o[1] = S.at + y;
    o[2] = z;
    o[3] = y * 3;
    o[4] = z * 3;
  });
  const h = 0.0125;
  return mergeGeometries([band(-h, h, -S.point + 0.05, S.top - 0.02), band(-S.w + 0.02, S.w - 0.02, S.top - 0.1 - h, S.top - 0.1 + h)]);
}

export const SHIELD_ITEMS = [{
  id: 'errant.shield',
  slot: 'shield',
  name: 'Heater Shield',
  build({ arms, M, mesh }) {
    const S = SHIELD, fore = arms.L.fore;
    mesh(fore, faceGeometry(S), M.armor);
    mesh(fore, rimGeometry(S), M.bevel);
    mesh(fore, crossGeometry(S), M.bevel);
    // the boss: a low silver dome where the bands cross
    const boss = ring(0.035, 0.035, 0.02, 12);
    boss.rotateZ(-Math.PI / 2);
    boss.translate(S.off + S.bulge + 0.008, S.at, S.top - 0.1);
    mesh(fore, boss, M.trim);
  },
}];

/** `?shield=1` (combo E's shield, the owner's ask): the shield item's id, or null (none: no location, the tests). */
export function shieldFromUrl() {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('shield') : null;
    return q === '1' || q === 'on' ? 'errant.shield' : null;
  } catch {
    return null;
  }
}
// (THREE is imported for the geometry helpers' types only)
void THREE;
