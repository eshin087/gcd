import * as THREE from 'three';
import { ellipsoidGeometry, planarGUV } from '../../../render/glyphGeometry.js';
import { DIM as HERO_DIM } from '../../player/heroDims.js';
import { arcPlate, strapGeometry, boxGeometry, kiteGeometry, mergeGeometries, sub, bandGeometry, place, lerp, orient, ring, limb, wedge } from '../../player/heroGeo.js';

// The Starless Lord's boots and trousers: the old hero outfit's legs item (`wanderer.legs`, the
// Wanderer's set, gear/wanderer.js, deleted with every old hero outfit on 2026-11-17), moved here
// UNCHANGED because the Lord builds his legs on them (gear.js buildLegs: these, then his cuisses).
// Not a gear item of its own any more: a builder the Lord's legs item calls with its build ctx.

/** Black pants (hips and thighs) with the hip strap, the drop strap and the sword hanger, the
 *  knee-guard straps, and the knee-high armoured boots: greaves, knee guards, feet. */
export function buildArmouredBoots({ pelvis, legs, M, DIM, BODY, REST, mesh }) {
  const yPe = (h) => h - REST.pelvis; // world idle height → pelvis-joint local y
  // ---------------------------------------------------------------- hips, hip strap, drop strap
  {
    const [hx, hy, hz] = BODY.hips.r;
    mesh(pelvis, orient.up(ellipsoidGeometry(hx, hz, hy)), M.pants, ...BODY.hips.c);
  }
  {
    // H1: diagonal hip strap (0.03 m), left hip (1.13 m) down across the front to the right thigh
    const h1 = mesh(pelvis, bandGeometry(BODY.hips.r[0] * 1.14, BODY.hips.r[2] * 1.18, 0.03, 28), M.leather, 0.01, yPe(1.04), 0.004);
    h1.rotation.z = 0.55;
    // D1: centre drop strap from the second belt to 0.93 m, a D-ring and a pointed metal tip
    mesh(pelvis, strapGeometry([0, yPe(1.13), 0.11], [0, yPe(0.93), 0.104], 0.026, 0.008, [1, 0, 0]), M.leather);
    mesh(pelvis, mergeGeometries([
      boxGeometry(0.03, 0.024, 0.012, 0, yPe(1.07), 0.117),
      kiteGeometry(0.015, 0.022, 0.007, { yPos: 0.4 }).translate(0, yPe(0.915), 0.106),
      boxGeometry(0.044, 0.036, 0.014, -0.086, yPe(1.0), 0.094, 0, -0.5, -0.5), // H1 buckle, right thigh
    ]), M.trim);
  }

  // ---------------------------------------------------------------- thighs, boots
  const [th0, th1, thB] = BODY.thigh, [sh0, sh1, shB] = BODY.shin;
  /** limb radius t (0 → 1) along a bulging taper */
  const rAt = (r0, r1, bulge, t) => lerp(r0, r1, t) + bulge * Math.sin(Math.PI * t);
  for (const side of [-1, 1]) {
    const { thigh, shin, foot } = legs[side < 0 ? 'R' : 'L'];
    mesh(thigh, limb({ length: DIM.thigh, r0: th0, r1: th1, bulge: thB }), M.pants);
    // knee-guard straps
    const ks = (y) => rAt(th0, th1, thB, (-y) / DIM.thigh) + 0.004;
    mesh(thigh, mergeGeometries([
      bandGeometry(ks(-DIM.thigh + 0.085), ks(-DIM.thigh + 0.085), 0.015, 12).translate(0, -DIM.thigh + 0.085, 0),
      bandGeometry(ks(-DIM.thigh + 0.035), ks(-DIM.thigh + 0.035), 0.015, 12).translate(0, -DIM.thigh + 0.035, 0),
    ]), M.leather);
    if (side < 0) {
      // D2: the sword hanger down the right thigh to 0.85 m, with a ring
      mesh(thigh, strapGeometry([-(th0 - 0.006), 0.04, 0.04], [-(th0 - 0.002), -0.06, 0.03], 0.022, 0.008, [0, 0, 1]), M.leather);
      mesh(thigh, ring(0.016, 0.016, 0.005, 8).rotateX(Math.PI / 2).translate(-(th0 - 0.002), -0.065, 0.025), M.trim);
    }
    // knee-high armoured boot: the shell, a cuff lame under the knee and one at the ankle, and the
    // reference's KITE GREAVE down the shin: a faceted diamond plate pointed at the knee and the
    // ankle with a raised centre ridge, silver bevels on its edges and the ridge (stacked ring lames
    // read as a stack of tyres); from behind, two lames step down the calf (the reference's back view
    // shows banded calves). The boot follows the lean leg (BODY.shin)
    mesh(shin, limb({ length: DIM.shin - 0.02, r0: sh0, r1: sh1, bulge: shB }), M.armor, 0, -0.02, 0);
    const b = sh0 - 0.058; // how far the boot's plates stand in / out with the shin's radius
    // (the plates are placed down a shin of DIM's length: a rig with its own legs, the hero's, gets
    // them down its shin by the same fractions; buildHero's opts.legs)
    const ky = DIM.shin / HERO_DIM.shin, alongShin = (g) => (ky === 1 ? g : g.scale(1, ky, 1));
    mesh(shin, alongShin(mergeGeometries([
      sub(arcPlate(-0.045, -0.09, 0.067 + b, 0.065 + b, 0, 1.4, 6), 1),
      sub(arcPlate(-0.33, -0.375, 0.054 + b * 0.9, 0.052 + b * 0.9, 0, 1.5, 6), 1),
      sub(arcPlate(-0.13, -0.19, sh0 + 0.016, sh0 + 0.012, Math.PI, 1.35, 8), 1),
      arcPlate(-0.2, -0.26, sh0 + 0.011, sh1 + 0.012, Math.PI, 1.3, 8),
    ])), M.armor);
    mesh(shin, alongShin(mergeGeometries([
      arcPlate(-0.183, -0.192, sh0 + 0.0165, sh0 + 0.0165, Math.PI, 1.35, 8),
      arcPlate(-0.252, -0.261, sh1 + 0.0125, sh1 + 0.0125, Math.PI, 1.3, 8),
    ])), M.bevel);
    {
      const T = [0, -0.06, 0.069 + b], Rt = [0.058 + b, -0.16, 0.058 + b], B = [0, -0.355, 0.051 + b * 0.9], Lf = [-0.058 - b, -0.16, 0.058 + b], C = [0, -0.16, 0.08 + b * 1.3];
      const kg = new THREE.BufferGeometry();
      kg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...T, ...C, ...Rt, ...T, ...Lf, ...C, ...C, ...Lf, ...B, ...C, ...B, ...Rt]), 3));
      kg.computeVertexNormals();
      planarGUV(kg, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
      mesh(shin, alongShin(kg), M.armor);
      mesh(shin, alongShin(mergeGeometries([
        arcPlate(-0.083, -0.092, 0.0675 + b, 0.0675 + b, 0, 1.4, 6),
        arcPlate(-0.366, -0.375, 0.0535 + b * 0.9, 0.0535 + b * 0.9, 0, 1.5, 6),
      ])), M.bevel);
    }
    // kite knee guard (poleyn): 0.1 W × 0.14 H standing 0.02 m off the knee, a ridge down the
    // middle, silver bevels on all four edges, wings wrapping the sides; its point leans 15° out
    // and a short spike carries it to 0.60 m
    {
      const lean = -side * 0.26;
      const T = [0, 0.085, 0.082 + b], Rt = [0.05, 0.004, 0.072 + b], B = [0, -0.05, 0.08 + b], Lf = [-0.05, 0.004, 0.072 + b], C = [0, 0.012, 0.094 + b];
      const kp = new THREE.BufferGeometry();
      kp.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...T, ...C, ...Rt, ...T, ...Lf, ...C, ...C, ...Lf, ...B, ...C, ...B, ...Rt]), 3));
      kp.computeVertexNormals();
      planarGUV(kp, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
      const wings = [];
      for (const s of [-1, 1]) wings.push(place(kiteGeometry(0.012, 0.03, 0.03), s * (0.05 + b), -0.006, 0.03 + b * 0.5, 0, s * 0.6, 0));
      mesh(shin, mergeGeometries([kp, ...wings]).rotateZ(lean), M.armor);
      mesh(shin, wedge(0.038, 0.013, [0, 0.075, 0.083 + b], [0, 1, 0.12], [0, 0, 1], 0.05).rotateZ(lean), M.spike);
    }
    // boot foot, 2 instep lames, a rounded slightly pointed toe, heel, the silver sole welt (the sole
    // rests on the ground at −0.07)
    const F = BODY.foot;
    mesh(foot, mergeGeometries([
      ellipsoidGeometry(...F.r, { widthSegs: 10, heightSegs: 6 }).translate(...F.c),
      sub(place(ellipsoidGeometry(0.046, 0.024, 0.041, { widthSegs: 8, heightSegs: 4 }), 0, F.c[1] + F.r[1] - 0.015, 0.064, -0.35), 1),
      place(ellipsoidGeometry(0.042, 0.021, 0.037, { widthSegs: 8, heightSegs: 4 }), 0, F.c[1] + F.r[1] - 0.03, 0.11, -0.25),
      sub(boxGeometry(0.062, 0.032, 0.052, 0, -0.053, -0.062), 1),
    ]), M.armor);
    mesh(foot, ellipsoidGeometry(F.r[0] + 0.006, 0.007, F.r[2] + 0.007, { widthSegs: 14, heightSegs: 3 }), M.welt, 0, -0.062, F.c[2]);
  }
}
