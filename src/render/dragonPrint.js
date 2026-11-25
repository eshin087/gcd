import { gis } from './glyphs.js';
import { lookOf } from '../entities/enemies/duelist/lookSwitch.js';

// THE DRAGON PRINT (the owner's pick of four ground looks, 2026-11-24: "i really like the dragon ground look
// ... it allows the ground to look 3d, can help with background shadows"). A surface is a LIT SOURCE (a
// relief: its normal, the moon, the shadow map, the point lights) printed in the wyrm's fine digits on a
// WORLD-ANCHORED lattice of cells (~5 x 8 px at 720p, the wyrm's own cell): a dark body, brighter digits
// only where light catches, every cell filled. World-anchored, so nothing swims when the camera moves.
//
// The GLSL here is shared by every surface printed this way (the ground, the floors, ...). Needs
// COMMON_GLSL (hash12, glyphGrad, luma) before it. A material that uses it spreads dragonPrintUniforms()
// into its uniforms.
//
//   dpLattice(xz, size, f, g)  the cell of world point xz (x right, -z up on screen): returns the cell id,
//                              f = the uv inside the cell, g = the continuous coordinate (pass dFdx(g),
//                              dFdy(g) to glyphGrad). Rows are offset by a random fraction of a cell.
//   dpCellCenter(cell, size)   that cell's centre in world xz (light the cell once, at its centre: a cell
//                              prints ONE digit)
//   dpVnoise(p), dpFbm(p)      value noise 0..1
//   dpGlyph(tone, h)           the digit for a cell lit `tone` (0..1), h = the cell's hash (a little jitter
//                              between neighbouring levels so a smooth slope does not band)
//   DP_CELL                    the ground's cell (m): [0.135, 0.25]
//
// The switches. The owner (2026-11-25), having played every piece on at once: "i like 'everything on'
// (grass A) much better ... make all the maps use the dragon ground style": every piece at 'a' is the
// DEFAULT in every level.
//   ?dragon=0              the game as it was before the dragon print (every piece '0', the ground today's)
//   ?ground=0              today's ground alone (world/ground.js; a / c / d the other first-round looks)
//   dragonLook(name)       a piece's option: lookOf(name), default 'a' ('0' under ?dragon=0); one switch
//                          (?dgGrass=0, ?dpRidge=b ...) overrides it

export const DP_RAMP = '.:-=17402#%8@';
export const DP_CELL = Object.freeze([0.135, 0.25]);

const dragonAll = (() => {
  try {
    const v = new URLSearchParams(globalThis.location?.search ?? '').get('dragon');
    return !(v === '0' || v === 'off' || v === 'old');
  } catch {
    return true;
  }
})();

/** Is the dragon print on (the default; off only under ?dragon=0)? */
export const dragonAllOn = () => dragonAll;

/** A dragon-print piece's option ('0' off; 'a', 'b', ... its looks): 'a' by default, '0' under ?dragon=0. */
export function dragonLook(name) {
  return lookOf(name, dragonAll ? 'a' : '0');
}

/** The uniforms DRAGON_PRINT_GLSL reads (a fresh object per material; the ramp is the same). */
export function dragonPrintUniforms() {
  return { uDigs: { value: gis(DP_RAMP) } };
}

export const DRAGON_PRINT_GLSL = /* glsl */ `
uniform float uDigs[${DP_RAMP.length}];
float dpDigit(int i) { float r = uDigs[0]; for (int k = 0; k < ${DP_RAMP.length}; k++) if (k == i) r = uDigs[k]; return r; }
float dpVnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}
float dpFbm(vec2 p) { return 0.55 * dpVnoise(p) + 0.3 * dpVnoise(p * 2.03 + 7.1) + 0.15 * dpVnoise(p * 4.1 - 3.3); }
vec2 dpLattice(vec2 xz, vec2 size, out vec2 f, out vec2 g) {
  g = vec2(xz.x, -xz.y) / size;
  g.x += hash12(vec2(floor(g.y), 3.7));
  f = fract(g);
  return floor(g);
}
vec2 dpCellCenter(vec2 cell, vec2 size) {
  return vec2((cell.x + 0.5 - hash12(vec2(cell.y, 3.7))) * size.x, -(cell.y + 0.5) * size.y);
}
float dpGlyph(float tone, float h) {
  float lv = clamp(tone * ${(DP_RAMP.length - 1).toFixed(1)} + (h - 0.5) * 1.5, 0.0, ${(DP_RAMP.length - 1).toFixed(1)});
  return dpDigit(int(lv));
}
`;
