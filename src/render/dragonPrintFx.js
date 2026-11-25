import * as THREE from 'three';
import { gis } from './glyphs.js';
import { DP_CELL } from './dragonPrint.js';

// THE DRAGON PRINT'S UPGRADES (the owner asked to see all four, 2026-11-24). Every function here is called
// by each dragon-printed surface (world/ground.js's look b; the floors, the props later) and stays cheap: a
// texture read or a short loop over a few uniforms, never a loop over the level. Each one is off (returns
// its no-op value, at the cost of one uniform test) while its switch is '0' (dragonLook in dragonPrint.js;
// world/groundFx.js writes uDpFxOn from the switches every frame, so the Lab can flip them live):
//
//   dpCloud(xz)             0..1 the share of the moon that reaches the ground here (1 = no cloud). Drifting
//                           cloud shadows: soft shapes riding the level's one wind. Multiply the MOON's
//                           term by it (its shadow map's share), never the fire's      switch `dpCloud`
//   dpContact(xz)           0..1 how deep in a contact shadow: the foot of a rock, a tree, a stump (a baked
//                           texture, baked again when a piece falls) and of the fighters (a few
//                           uniforms). Take it off the tone: t *= 1 - dpContact(xz)    switch `dpContact`
//   dpRipple(xz, h)         0..1 how strongly a passing re-print ring flips this cell (a blow on the floor
//                           sends a ring of digits flipping outward); h = the cell's hash (each cell flips
//                           on its own beat). A surface re-prints with it as ground.js does: over
//                           uDpRipK.w the cell takes another digit (its hash shifted), its tone rises by
//                           rip x uDpRipP.x and its light by rip x uDpRipP.y          switch `dpRipple`
//   dpRidge(cw, N, tone, nb, size, h, idx, gain)
//                           a crest outline: true + the stroke's glyph index (idx) and how much more light
//                           it takes (gain: add it to the tone, unclamped) for a cell on the lit side of
//                           the edge of a lit face of the relief (where the moon's share on it falls
//                           below a level within half a cell); the stroke runs along that edge
//                           ( _ - / \ ( ) ), like the wyrm's outline. cw the cell's centre, N the surface's
//                           normal there (unused today), tone how lit (0..1, after shadows), nb the
//                           relief at the cell's neighbours minus its own (right, left, up-screen = -z,
//                           down-screen = +z) one cell away (give the BROAD relief: small bumps would
//                           print a stroke round every one), size the cell (m)       switch `dpRidge`
//   dpRidge(cw, N, tone, nb, h, idx)
//                           the stub's form: the same on a DP_CELL lattice, its gain dropped
//
// Options (each switch '0' | 'a' | 'b'; world/groundFxTuning.js has the numbers): uDpFxOn[i] is 0 off,
// 1 'a', 2 'b' (the GLSL reads only "on"; the options differ by their uniforms).
//
// Uniforms: DP_FX_U, ONE shared object (module singleton) that every material spreads into its uniforms,
// so world/groundFx.js (GroundFx, updated once a frame by world.js) writes each value once for all.
// Needs COMMON_GLSL and DRAGON_PRINT_GLSL before it.

/** Live re-print rings at once (uDpRip) and fighters' contact rings (uDpFighters: the hero + the boss's
 *  body circles). */
export const DP_RIP_N = 6;
export const DP_FIGHTERS = 10;
/** The outline's strokes, in dpRidge's order. */
export const DP_RIDGE_CHARS = '_-/\\()|';

const v4s = (n) => Array.from({ length: n }, () => new THREE.Vector4());

export const DP_FX_U = {
  uDpFxOn: { value: [0, 0, 0, 0] }, // cloud, contact, ripple, ridge: 0 off, 1 'a', 2 'b'
  // cloud: (the drift's offset x, z (m), scale (1/m), cover); (soft, depth, warp, 0)
  uDpCloud: { value: new THREE.Vector4(0, 0, 0.03, 0.5) },
  uDpCloudK: { value: new THREE.Vector4(0.1, 0, 1, 0) },
  // contact: the baked rings (r = depth 0..1) over (min x, min z, size m, lean m toward the shadow side);
  // the fighters (x, z, r, depth); (spread per m of r, spread base, 0, 0)
  uDpContactTex: { value: null },
  uDpContactBox: { value: new THREE.Vector4(-80, -80, 160, 0) },
  uDpFighters: { value: v4s(DP_FIGHTERS) },
  uDpContactK: { value: new THREE.Vector4(0.5, 0.3, 0, 0) },
  // ripple: the rings (x, z, radius m, strength 0..1; 0 = the slot is free); (front m, back m, jitter m,
  // flip: the strength over which a cell shows another digit); the print's (tone, light) per unit of it
  uDpRip: { value: v4s(DP_RIP_N) },
  uDpRipK: { value: new THREE.Vector4(0.35, 0.9, 0.35, 0.2) },
  uDpRipP: { value: new THREE.Vector4(0.35, 0.8, 0, 0) },
  // ridge: (the edge's level over the moon's height, min tone, min sharpness /m, a second edge's level over
  // the first: 0 none); (gain, the relief's steepening, 0, 0); the strokes
  uDpRidge: { value: new THREE.Vector4(-0.02, 0.08, 0.03, 0) },
  uDpRidgeK: { value: new THREE.Vector4(0.9, 1.4, 0, 0) },
  uDpRidgeGlyphs: { value: gis(DP_RIDGE_CHARS) },
};

export const DRAGON_PRINT_FX_GLSL = /* glsl */ `
#define DP_RIP_N ${DP_RIP_N}
#define DP_FIGHTERS ${DP_FIGHTERS}
uniform float uDpFxOn[4];
uniform vec4 uDpCloud, uDpCloudK;
uniform sampler2D uDpContactTex;
uniform vec4 uDpContactBox, uDpContactK;
uniform vec4 uDpFighters[DP_FIGHTERS];
uniform vec4 uDpRip[DP_RIP_N];
uniform vec4 uDpRipK, uDpRipP;
uniform vec4 uDpRidge, uDpRidgeK;
uniform float uDpRidgeGlyphs[${DP_RIDGE_CHARS.length}];

float dpCloud(vec2 xz) {
  if (uDpFxOn[0] < 0.5) return 1.0;
  vec2 p = (xz - uDpCloud.xy) * uDpCloud.z;
  // (a slow warp: the shapes are not blobs of one size)
  p += (vec2(dpVnoise(p * 0.45 + vec2(3.1, 7.7)), dpVnoise(p * 0.45 - vec2(5.3, 1.9))) - 0.5) * uDpCloudK.z;
  return 1.0 - uDpCloudK.y * smoothstep(uDpCloud.w - uDpCloudK.x, uDpCloud.w + uDpCloudK.x, dpFbm(p));
}

float dpContact(vec2 xz) {
  if (uDpFxOn[1] < 0.5) return 0.0;
  vec2 q = xz;
  // (option b: the ring leans away from the moon)
  vec2 mo = uMoonDir.xz;
  float ml = length(mo);
  if (uDpContactBox.w > 0.0 && ml > 1e-3) q += mo / ml * uDpContactBox.w;
  float k = 0.0;
  vec2 uv = (q - uDpContactBox.xy) / uDpContactBox.z;
  if (uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0) k = textureLod(uDpContactTex, uv, 0.0).r;
  for (int i = 0; i < DP_FIGHTERS; i++) {
    vec4 F = uDpFighters[i];
    if (F.w <= 0.0) continue;
    float f = 1.0 - clamp((length(q - F.xy) - F.z) / (F.z * uDpContactK.x + uDpContactK.y), 0.0, 1.0);
    k = max(k, F.w * f * f);
  }
  return k;
}

float dpRipple(vec2 xz, float h) {
  if (uDpFxOn[2] < 0.5) return 0.0;
  float r = 0.0;
  for (int i = 0; i < DP_RIP_N; i++) {
    vec4 R = uDpRip[i];
    if (R.w <= 0.0) continue;
    // e > 0: the edge has not reached the cell yet; each cell's own beat (jitter) makes the edge ragged
    float e = R.z - length(xz - R.xy) + (h - 0.5) * uDpRipK.z;
    float b = e < 0.0 ? 1.0 - smoothstep(0.0, uDpRipK.x, -e) : 1.0 - smoothstep(0.0, uDpRipK.y, e);
    r = max(r, b * R.w);
  }
  return r;
}

float dpRidgeGlyph(int i) {
  float r = uDpRidgeGlyphs[0];
  for (int k = 0; k < ${DP_RIDGE_CHARS.length}; k++) if (k == i) r = uDpRidgeGlyphs[k];
  return r;
}

// the moon's share on a slope (dh/dx, dh/dz), its normal steepened by uDpRidgeK.y as the surface's is
float dpRidgeLam(float gx, float gz) {
  return max(dot(normalize(vec3(-gx * uDpRidgeK.y, 1.0, -gz * uDpRidgeK.y)), uMoonDir), 0.0);
}
// the cell is on the lit side of the light's edge at level T: lit at its centre, not within half a cell
bool dpRidgeEdge(float T, float lC, float lR, float lL, float lU, float lD) {
  return lC >= T && min(min(lR, lL), min(lU, lD)) < T;
}
bool dpRidge(vec2 cw, vec3 N, float tone, vec4 nb, vec2 size, float h, out float idx, out float gain) {
  idx = 0.0;
  gain = 0.0;
  if (uDpFxOn[3] < 0.5 || tone < uDpRidge.y) return false;
  // the slope at the centre and half a cell each way, and the moon's share there: where it crosses the
  // edge level (uMoonDir.y + uDpRidge.x; and uDpRidge.w over it when that is > 0: a second, inner edge)
  // within half a cell, the cell is on the edge of a lit face
  float sR = nb.x / size.x, sL = -nb.y / size.x, sU = -nb.z / size.y, sD = nb.w / size.y;
  float gx = 0.5 * (sR + sL), gz = 0.5 * (sU + sD);
  float T = uMoonDir.y + uDpRidge.x;
  float lC = dpRidgeLam(gx, gz);
  float lR = dpRidgeLam(sR, gz), lL = dpRidgeLam(sL, gz), lU = dpRidgeLam(gx, sU), lD = dpRidgeLam(gx, sD);
  if (!dpRidgeEdge(T, lC, lR, lL, lU, lD) && !(uDpRidge.w > 0.0 && dpRidgeEdge(T + uDpRidge.w, lC, lR, lL, lU, lD))) return false;
  // a sharp edge only (the light turns within a few cells: a crest, a rim), not a gentle swell
  vec2 gl = vec2(lR - lL, lD - lU) / size;
  if (dot(gl, gl) < uDpRidge.z * uDpRidge.z) return false;
  // the edge's way on screen (right, up = -z) runs across the light's change: the stroke along it, hugging
  // the lit side ('/' leans ~58 deg in a 5 x 8 px cell)
  float a = atan(-gl.x, -gl.y);
  if (a < 0.0) a += 3.14159265;
  a *= 57.29578;
  int s = a < 28.0 || a >= 152.0 ? (gl.y > 0.0 ? 0 : 1) : a < 72.0 ? 2 : a < 108.0 ? (gl.x > 0.0 ? 4 : 5) : 3;
  idx = dpRidgeGlyph(s);
  gain = uDpRidgeK.x;
  return true;
}

bool dpRidge(vec2 cw, vec3 N, float tone, vec4 nb, float h, out float idx) {
  float gain;
  return dpRidge(cw, N, tone, nb, vec2(${DP_CELL[0]}, ${DP_CELL[1]}), h, idx, gain);
}
`;
