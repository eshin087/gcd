import { mergeGeometries, sub, place, limb } from '../heroGeo.js';
import { ellipsoidGeometry } from '../../../render/glyphGeometry.js';

// The free hand's shape (2026-11-25, the owner: "make the left hand ... look like a hand in terms of size and
// general look ... right now it looks like a weird stump"). The hand before (heroGeo looseHand) had a palm
// 8 cm across (6.4 cm at the 0.8 size the owner picked for its glare) under a bracer 10 cm across at the
// wrist, as thick as it was wide, with short fingers: a knob narrower than the arm it hangs off. This hand:
//   - a palm as wide as the bracer at the wrist and widening a little to the knuckles, thin (3.4 cm)
//   - four tapered fingers in two joints each, the middle longest, the little finger shortest, spread a
//     little, curled toward the palm by `curl` (0 open … 1 a loose fist)
//   - a thumb off the palm's front edge, angled across it
// In fore space as looseHand (the arm down −Y, the wrist at y = −len; the palm toward the body: −side·X;
// the thumb +Z), so it hangs off the same wrist joint. Returns { palm, fingers, tips, thumb }.
export function shapedHand(len, side, k = 1, curl = 0.25) {
  const inX = -side; // toward the body: the palm's side
  const y0 = -len;
  // the palm: back and front as one flattened ellipsoid, a little wider at the knuckles (a second, lower one)
  const palm = mergeGeometries([
    ellipsoidGeometry(0.017 * k, 0.036 * k, 0.048 * k, { widthSegs: 10, heightSegs: 6 }).translate(inX * 0.004 * k, y0 - 0.036 * k, 0.002),
    ellipsoidGeometry(0.016 * k, 0.024 * k, 0.052 * k, { widthSegs: 10, heightSegs: 5 }).translate(inX * 0.005 * k, y0 - 0.06 * k, 0.0),
  ]);
  const fingers = [], tips = [];
  // index (front, +Z) → little (back); lengths of the two joints; a little spread fanning out from the middle
  const F = [
    { z: 0.034, l: [0.033, 0.028], r: 0.0088, fan: 0.1 },
    { z: 0.012, l: [0.037, 0.031], r: 0.0091, fan: 0.03 },
    { z: -0.01, l: [0.035, 0.029], r: 0.0087, fan: -0.05 },
    { z: -0.031, l: [0.027, 0.023], r: 0.0078, fan: -0.13 },
  ];
  const c1 = (0.25 + 1.15 * curl) * inX, c2 = (0.3 + 1.25 * curl) * inX; // the joints' bend toward the palm
  F.forEach((f, i) => {
    const r = f.r * k, L1 = f.l[0] * k, L2 = f.l[1] * k;
    const sy = y0 - 0.082 * k, sz = f.z * k;
    // the first joint: from the knuckle, bent c1 toward the palm, fanned about X
    const g1 = sub(limb({ length: L1, r0: r, r1: r * 0.92, radial: 7, rings: 2, capSegs: 2 }), i & 1);
    place(g1, 0, 0, 0, f.fan, 0, c1);
    g1.translate(inX * 0.004 * k, sy + r * 0.6, sz);
    fingers.push(g1);
    // the second: from the first's end, bent further
    const ex = Math.sin(c1) * L1, ey = -Math.cos(c1) * L1;
    const g2 = limb({ length: L2, r0: r * 0.92, r1: r * 0.72, radial: 7, rings: 2, capSegs: 2 });
    place(g2, 0, 0, 0, f.fan, 0, c1 + c2);
    g2.translate(inX * 0.004 * k + ex, sy + r * 0.6 + ey, sz + Math.sin(f.fan) * L1 * 0.5);
    tips.push(g2);
  });
  // the thumb: off the palm's front edge, angled down and across it, bent in with the curl
  const tl = 0.032 * k;
  const thumb = sub(limb({ length: tl, r0: 0.0118 * k, r1: 0.0088 * k, radial: 7, rings: 2, capSegs: 2 }), 1);
  place(thumb, 0, 0, 0, 0.55 + 0.5 * curl, 0, inX * (0.35 + 0.6 * curl));
  thumb.translate(inX * 0.01 * k, y0 - 0.028 * k, 0.046 * k);
  return { palm, fingers: mergeGeometries(fingers), tips: mergeGeometries(tips), thumb };
}

// The free hand as a closed fist, by its overall shape only (2026-11-25, the owner: "use the reference
// video running to make the hand look similar in shape ... we don't need to worry about the detail like
// fingers and just focus on the overall hand and arm shape"). The reference runner's free hand is a
// compact closed fist, as wide as the forearm at the wrist, a little deeper than the wrist is thick,
// its knuckles rolled toward the palm, the thumb a bump over the front; the forearm runs into it with
// no neck. Built of a few overlapping masses, no finger detail:
//   - the back of the hand: one flattened mass from the wrist to the knuckles, as wide as the bracer
//   - the curled fingers: four short rolls side by side below it (the knuckle row), and four more folded in
//     under the palm: together one block, a little wider than the bracer
//   - the thumb: a bump over the front edge
//   - `cuff` > 0: a flared cuff over the wrist (a gauntlet's), so the arm widens into the hand
// In fore space as looseHand / shapedHand (arm down −Y, the wrist at y = −len, the palm toward the
// body: −side·X, the thumb +Z). Returns { palm, fingers, tips, thumb }.
// (Built from as many geometries as looseHand, the hand before it: every BufferGeometry draws a uuid from
// Math.random, which the tests seed, so a hand with fewer pieces shifted every seeded fight after it, the
// sheath's pace among them. Keep the count at 12 when this changes: 1 + 4 + 1 + 4 + 1 + 1.)
export function fistHand(len, side, k = 1, cuff = 0) {
  const inX = -side;
  const y0 = -len;
  // the back of the hand, wrist → knuckles
  let palm = ellipsoidGeometry(0.03 * k, 0.056 * k, 0.05 * k, { widthSegs: 12, heightSegs: 7 }).translate(-inX * 0.002 * k, y0 - 0.048 * k, 0.002);
  if (cuff > 0) {
    // a flared cuff over the wrist: the forearm widens into the fist
    palm = mergeGeometries([palm, limb({ length: 0.05 * cuff, r0: 0.05 * k, r1: 0.058 * k, radial: 10, rings: 2, capSegs: 1 }).translate(0, y0 + 0.022 * cuff, 0)]);
  }
  const Z = [0.034, 0.012, -0.011, -0.032]; // index (front, +Z) → little finger
  const rows = [], folds = [];
  Z.forEach((z, i) => {
    // the knuckle row: each finger's first joint, short and thick, side by side
    rows.push(sub(ellipsoidGeometry(0.024 * k, 0.022 * k, 0.0135 * k, { widthSegs: 8, heightSegs: 5 }).translate(inX * 0.006 * k, y0 - 0.088 * k, z * k), i & 1));
    // … and the rest of the finger folded in under the palm
    folds.push(ellipsoidGeometry(0.014 * k, 0.026 * k, 0.0125 * k, { widthSegs: 7, heightSegs: 5 }).translate(inX * 0.026 * k, y0 - 0.07 * k, z * k));
  });
  // the thumb over the front edge, laid along the curled fingers
  const thumb = sub(place(ellipsoidGeometry(0.016 * k, 0.03 * k, 0.017 * k, { widthSegs: 7, heightSegs: 5 }), inX * 0.016 * k, y0 - 0.052 * k, 0.04 * k, 0.25, 0, inX * 0.35), 1);
  return { palm, fingers: mergeGeometries(rows), tips: mergeGeometries(folds), thumb };
}
