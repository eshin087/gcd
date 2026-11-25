import { dragonLook } from './dragonPrint.js';

// THE DRAGON PRINT ON THINGS THAT STAND (the owner, 2026-11-24: "can we try this art style on not just the ground
// and things like the stone and other textures?"). The dragon ground (render/dragonPrint.js, world/ground.js look b)
// prints a LIT RELIEF in fine digits: a cell's DENSITY is how its relief meets the moon (the digit ramp DP_RAMP,
// '.' in a trough to '@' on a lit crest), its BRIGHTNESS the body's colour times the light. Here the same print for
// what stands on it, through the art pass's prop branch (render/pipeline.js), so ground and objects read as one lit
// world drawn by one hand:
//
//   dpProps  rocks, pillars, walls, bones, every prop-art object (createPropArtMaterial, FLAG.ART_PROP)
//            a  calm relief: chisel facets, soft bumps, a few cracks; lit by the moon and the shadow map only
//            b  stronger relief: bigger facets, deeper cracks, harder shadows
//   dpTrees  tree trunks, stumps and canopies (the screen grid's FLAG.STONE / FLAG.LEAF until now)
//            a  bark as vertical grain, canopies as lit masses of leaf clumps (the moon on the tops, dark under)
//            b  the same with bigger, rounder clumps and deeper furrows
//
// HOW THE PRINT TRAVELS. A dragon-printed source writes its colour = the cell's INK (body x the ground's light law,
// what world/ground.js multiplies its glyph by) and, in alpha, its TONE (0..1, the relief's light: the digit's
// density) inside the props' flag window: alpha = DP_TONE.a0 + tone x DP_TONE.span (below DP_TONE.top; FLAG.ART_PROP
// itself is 0.57, above it). The art pass averages ink and tone over a cell's four samples and prints the ramp's
// digit for that tone from the WORLD atlas (the ground's own letters, at the ground's cell size), ink x the glyph:
// one whole digit per cell, outlined in stroke glyphs as the props were (ADR-100). A prop or a tree still drawn by
// a material that does not encode its tone (createAsciiObjectMaterial: the bones, the bonfire, the landmarks of
// another level, its dead trees) is printed the same way with a tone read from its brightness (uDpLegacy).
//
// The relief is computed on the geometry's OWN position (the rest pose: it rides with a swaying crown, a carried
// pillar, a falling piece), turned into the world by the piece's matrix.

export const dpPropsLook = () => {
  const v = dragonLook('dpProps');
  return v === 'a' || v === 'b' ? v : '0';
};
export const dpTreesLook = () => {
  const v = dragonLook('dpTrees');
  return v === 'a' || v === 'b' ? v : '0';
};

/** The tone's window in the props' flag (alpha): a0 + tone x span, every value below `top` (FLAG.ART_PROP = 0.57 above it). */
export const DP_TONE = Object.freeze({ a0: 0.556, span: 0.0105, top: 0.5675 });

/**
 * The look's numbers per option. Relief (slopes are added to the surface normal: 0.5 tilts a face ~27 degrees):
 *   facet   slope of a chisel facet (one random tilt per cell of a warped lattice `size` m across)
 *   bump    slope of the soft bumps on top (value noise, `bumpF` per m)
 *   crack   width of a crack (m; 0 = none), `crackK` the share of facets that carry one, `crackDark` how much a
 *           crack darkens its cells
 * Light (the ground's law, world/ground.js look b): tone = (N . moon) from law[0] (0) to law[1] (1) x shadow; the
 *   edge band adds `edge` x shadow; the ambient occlusion keeps `ao` of its dimming; ink = body x (0.2 + 1.5 tone)
 *   x the light x `ink`.
 */
export const DP_PROPS = Object.freeze({
  a: { facet: 0.55, size: 0.4, bump: 0.18, bumpF: 4.5, crack: 0.05, crackK: 0.45, crackDark: 0.75, law: [-0.1, 1.05], edge: 0.2, ao: 0.45, ink: 3.0 },
  b: { facet: 0.9, size: 0.5, bump: 0.28, bumpF: 4.0, crack: 0.07, crackK: 0.6, crackDark: 0.9, law: [0.0, 1.0], edge: 0.16, ao: 0.6, ink: 3.0 },
});
/**
 * Trees: bark (the trunks, the boughs, the stumps) and leaves (the crowns).
 *   bark   slope of the grain, `barkF` furrows per m round the trunk (a tenth of that up it), `furrow` how dark
 *          the deep furrows print
 *   leaf   how far a point turns toward the outside of its clump (round puffs: a lattice of clump centres
 *          1 / `leafF` m apart), `sprig` slope of the small sprigs on them, `hollow` how dark the gaps between
 *          clumps print
 *   barkLaw / leafLaw  the tone's ramp on N . moon (the leaves wrap the light: a crown is soft)
 *   shade  how much of the moon's shadow a crown keeps (leaves let light through: a crown in the shade of its
 *          neighbours is dim, not black); ao  how much of the painted occlusion (a crown's lower half, its
 *          hollows) dims the tone
 */
export const DP_TREES = Object.freeze({
  a: { bark: 0.55, barkF: 5.5, furrow: 0.5, leaf: 0.9, leafF: 1.8, sprig: 0.2, hollow: 0.45, barkLaw: [-0.15, 1.0], leafLaw: [-0.55, 0.9], shade: 0.65, ao: 0.4, inkBark: 2.6, inkLeaf: 2.2 },
  b: { bark: 0.75, barkF: 4.5, furrow: 0.7, leaf: 1.3, leafF: 1.25, sprig: 0.25, hollow: 0.6, barkLaw: [-0.1, 0.95], leafLaw: [-0.45, 0.85], shade: 0.75, ao: 0.5, inkBark: 2.6, inkLeaf: 2.2 },
});

/**
 * The art pass's side (render/pipeline.js, the prop branch): ink x / y = brightness of an outline stroke against
 * the cell's ink (the silhouette, a depth step inside), z = the dimmest an outline prints (x the body's hue, so a
 * shadowed face keeps its edge), w = the glyphs' gain. back = the cell's backing between the strokes of its digit
 * (x, y: the ground's near-black soil, x red and y green and blue) + w x its ink: an object is not a hole in the
 * ground; z = the relative depth step inside an object that draws an inner stroke (the props' own is 0.012: in a
 * crown of clumps that outlined every clump). The outline's strokes are the props' own crisp ones (the wyrm's pixel
 * font), the digits the ground's. Legacy (a source without its tone): x / y ink gain and the tone's curve
 * (1 - exp(-luma x y)) of a prop, z / w the same for a tree.
 */
export const DP_ART = Object.freeze({
  ink: [1.7, 1.25, 0.12, 1.0],
  back: [0.0022, 0.0028, 0.03, 0.012],
  legacy: [3.5, 9.0, 4.0, 10.0],
});

/**
 * GLSL (needs COMMON_GLSL's hash13): the reliefs. Each takes the point p and the face's normal n in the piece's
 * own space and returns the slope to add to n there (dpBump turns it into the relief's normal), plus how deep in
 * a crack / a furrow / a hollow the point is (0..1).
 */
export const DP_RELIEF_GLSL = /* glsl */ `
// value noise with its gradient: x = 0..1, yzw = d / dp
vec4 dpNoised(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  vec3 u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);
  float a = hash13(i), b = hash13(i + vec3(1.0, 0.0, 0.0)), c = hash13(i + vec3(0.0, 1.0, 0.0)), d = hash13(i + vec3(1.0, 1.0, 0.0));
  float e = hash13(i + vec3(0.0, 0.0, 1.0)), f1 = hash13(i + vec3(1.0, 0.0, 1.0)), g = hash13(i + vec3(0.0, 1.0, 1.0)), h = hash13(i + vec3(1.0, 1.0, 1.0));
  float k1 = b - a, k2 = c - a, k3 = e - a, k4 = a - b - c + d, k5 = a - c - e + g, k6 = a - b - e + f1, k7 = -a + b + c - d + e - f1 - g + h;
  return vec4(a + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z,
    du * vec3(k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z, k2 + k5 * u.z + k4 * u.x + k7 * u.z * u.x, k3 + k6 * u.x + k5 * u.y + k7 * u.x * u.y));
}
// the slope s along the surface (its part across n dropped)
vec3 dpAlong(vec3 s, vec3 n) { return s - n * dot(s, n); }
vec3 dpBump(vec3 n, vec3 s) { return normalize(n - dpAlong(s, n)); }
// stone: k = (facet slope, facet size m, bump slope, bump frequency /m), c = (crack width m, share of facets, -, -)
vec3 dpStone(vec3 p, vec3 n, vec4 k, vec4 c, out float crack) {
  // chisel facets: one tilt per cell of a lattice warped so its walls wander
  vec3 q = p / k.y + 0.3 * sin(p.yzx * 2.3 + p.zxy * 0.9);
  vec3 cl = floor(q);
  vec3 tilt = vec3(hash13(cl), hash13(cl + 17.1), hash13(cl + 41.3)) - 0.5;
  vec4 b = dpNoised(p * k.w + 3.7);
  vec3 s = tilt * (2.0 * k.x) + b.yzw * (k.z / 1.5);
  // cracks: thin lines along an iso-line of a coarse noise, on some facets only (a crack ends at a facet's wall)
  crack = 0.0;
  if (c.x > 0.0 && hash13(cl + 73.7) < c.y) {
    vec4 r = dpNoised(p * 1.3 + 11.1);
    float gl = length(dpAlong(r.yzw, n)) * 1.3;
    float dm = abs(r.x - 0.5) / max(gl, 0.08);
    crack = 1.0 - smoothstep(c.x * 0.5, c.x, dm);
  }
  return s;
}
// bark: furrows running up the trunk (a noise stretched along its height); fur = how deep in a furrow
vec3 dpBark(vec3 p, vec3 n, float slope, float f, out float fur) {
  vec3 sc = vec3(f, f * 0.1, f);
  vec4 b = dpNoised(p * sc + 5.3);
  fur = smoothstep(0.4, 0.15, b.x);
  return b.yzw * sc * (slope / f);
}
// leaf clumps: the nearest centre of a jittered lattice (size m apart; 2 x 2 x 2 cells searched): returns p's
// offset from it (m); e = how much nearer it is than the next one (0 on the wall between two clumps)
vec3 dpClump(vec3 p, float size, out float e) {
  vec3 q = p / size;
  vec3 b = floor(q - 0.5);
  float d1 = 1e9, d2 = 1e9;
  vec3 c1 = q;
  for (int i = 0; i < 8; i++) {
    vec3 cl = b + vec3(float(i & 1), float((i >> 1) & 1), float(i >> 2));
    vec3 c = cl + 0.5 + (vec3(hash13(cl), hash13(cl + 19.7), hash13(cl + 37.1)) - 0.5) * 0.7;
    float d = length(q - c);
    if (d < d1) { d2 = d1; d1 = d; c1 = c; } else if (d < d2) { d2 = d; }
  }
  e = d2 - d1;
  return (q - c1) * size;
}
// leaves: each point turned toward the outside of its clump (k: how far), small sprigs on top; returns the
// NORMAL (not a slope); hol = how deep in the gap between two clumps
vec3 dpLeaf(vec3 p, vec3 n, float k, float size, float sprig, out float hol) {
  float e;
  vec3 o = dpClump(p, size, e);
  vec4 b = dpNoised(p * (2.7 / size) + 8.3);
  hol = 1.0 - smoothstep(0.0, 0.22, e);
  vec3 c = o / max(length(o), 1e-4);
  c -= 2.0 * min(dot(c, n), 0.0) * n; // (always out of the crown: every clump a puff)
  return normalize(n + c * k - dpAlong(b.yzw, n) * sprig);
}
`;

/**
 * GLSL for a material that hands its sources to the dragon print: the fx hooks' prelude (a surface that has no
 * ground relief of its own: DP_RELIEF is flat) and the tone's encoding.
 */
export const DP_FX_PRELUDE_GLSL = /* glsl */ `
float dpNoRelief(vec2 p, float d) { return 0.0; }
#ifndef DP_RELIEF
#define DP_RELIEF dpNoRelief
#endif
`;
export const DP_ENCODE_GLSL = /* glsl */ `
float dpEncode(float t) { return ${DP_TONE.a0.toFixed(4)} + clamp(t, 0.0, 1.0) * ${DP_TONE.span.toFixed(4)}; }
`;
