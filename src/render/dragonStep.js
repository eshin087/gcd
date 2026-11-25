import * as THREE from 'three';
import { gis } from './glyphs.js';

// THE FLASH PRINT ON A DRAGON-PRINTED SURFACE (`?prints=a`; world/life/steps.js, STEPS.flash). The owner
// (2026-11-24): footprints as "cool subtle matrix flash footprints that look cool on spawn and fade away
// quickly", in matrix green. On the dragon print the foot does not drop letters on the floor: the floor's
// OWN cells under the foot's oval turn to code letters, flash hot white-green heel to toe, re-roll as they
// cool to code green and fade back to the floor's digits, on the floor's own lattice (crisp, never a
// sprite). steps.js writes the uniforms once a frame; a surface spreads DP_STEP_U into its uniforms,
// includes DRAGON_STEP_GLSL after DRAGON_PRINT_GLSL and asks dpStep(cellCentre, cellHash) per cell:
//   .x 0..1 how strongly the cell flashes now (0: untouched), .y how hot (1 at the flash, 0 cooled),
//   .z the code letter's atlas index for this cell now.
// With the switch off (uDpStepK.w = 0) dpStep returns zeros at once.

export const DP_STEPS = 12;
export const DP_CODE = '0123456789ZTHKEX<>=:+*';

/** One shared uniforms object (module singleton): steps.js writes it, every dragon-printed surface reads it. */
export const DP_STEP_U = {
  // x, z, age (s; < 0 empty), the foot's heading (rad, atan2(dz, dx))
  uDpSteps: { value: Array.from({ length: DP_STEPS }, () => new THREE.Vector4(0, 0, -1, 0)) },
  // life, hot time, flicker, on; uDpStepF: the foot's half-length, half-width (m), cascade (s heel to toe), 0
  uDpStepK: { value: new THREE.Vector4(0.7, 0.09, 0.07, 0) },
  uDpStepF: { value: new THREE.Vector4(0.17, 0.075, 0.08, 0) },
  uDpCode: { value: gis(DP_CODE) },
};

export const DRAGON_STEP_GLSL = /* glsl */ `
uniform vec4 uDpSteps[${DP_STEPS}];
uniform vec4 uDpStepK, uDpStepF;
uniform float uDpCode[${DP_CODE.length}];
float dpCodeAt(int i) { float r = uDpCode[0]; for (int k = 0; k < ${DP_CODE.length}; k++) if (k == i) r = uDpCode[k]; return r; }
vec3 dpStep(vec2 xz, float h) {
  if (uDpStepK.w < 0.5) return vec3(0.0);
  float best = 0.0, hot = 0.0, roll = 0.0;
  for (int i = 0; i < ${DP_STEPS}; i++) {
    vec4 S = uDpSteps[i];
    if (S.z < 0.0 || S.z > uDpStepK.x + uDpStepF.z) continue;
    vec2 d = xz - S.xy;
    float ca = cos(S.w), sa = sin(S.w);
    float al = d.x * ca + d.y * sa, ac = -d.x * sa + d.y * ca;
    float e = (al * al) / (uDpStepF.x * uDpStepF.x) + (ac * ac) / (uDpStepF.y * uDpStepF.y);
    if (e > 1.0) continue;
    // heel to toe: the heel lights first
    float a = S.z - (al / uDpStepF.x * 0.5 + 0.5) * uDpStepF.z;
    if (a < 0.0 || a > uDpStepK.x) continue;
    // a cell or two of the oval stays dark (a print, not a stamp)
    if (fract(h * 17.3 + float(i) * 0.31) < 0.18) continue;
    float k = a < uDpStepK.y ? 1.0 : 1.0 - (a - uDpStepK.y) / (uDpStepK.x - uDpStepK.y);
    k *= k;
    k *= 1.0 - 0.35 * smoothstep(0.55, 1.0, e);
    if (k > best) {
      best = k;
      hot = 1.0 - clamp(a / uDpStepK.y, 0.0, 1.0);
      roll = floor(a / uDpStepK.z) + float(i) * 3.0;
    }
  }
  if (best <= 0.0) return vec3(0.0);
  float idx = dpCodeAt(int(fract(h * 91.7 + roll * 0.379) * ${DP_CODE.length.toFixed(1)}));
  return vec3(best, hot, idx);
}
`;
