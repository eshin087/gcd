// THE DRAGON PRINT'S UPGRADES (the owner asked to see all four, 2026-11-24): stubs, filled by the upgrades'
// author. Every function here is called by each dragon-printed surface (world/ground.js's look b; the floors
// later) and must stay cheap: a few texture reads or a short loop over uniforms, no per-pixel loops over the
// level. Each one is off (returns its no-op value) while its switch is '0' (dragonLook in dragonPrint.js):
//
//   dpCloud(xz)             0..1 the share of the moon that reaches the ground here (drifting cloud
//                           shadows; 1 = no cloud)                                     switch `dpCloud`
//   dpContact(xz)           0..1 how deep in a contact shadow (the foot of a rock, a tree, a fighter)
//                                                                                      switch `dpContact`
//   dpRipple(xz, h)         0..1 how strongly a passing re-print ring flips this cell (a heavy blow's ring
//                           of digits flipping outward); h = the cell's hash          switch `dpRipple`
//   dpRidge(...)            a crest outline: true + a stroke glyph's index for a cell on a lit crest /
//                           an edge of the relief (like the wyrm's outline)           switch `dpRidge`
//
// Uniforms: DP_FX_U, ONE shared object (module singleton) that every material spreads into its uniforms,
// so world/groundFx.js (GroundFx, updated once a frame by world.js) writes each value once for all.
// Needs COMMON_GLSL and DRAGON_PRINT_GLSL before it.

export const DP_FX_U = {
  uDpFxOn: { value: [0, 0, 0, 0] }, // cloud, contact, ripple, ridge: 1 on
};

export const DRAGON_PRINT_FX_GLSL = /* glsl */ `
uniform float uDpFxOn[4];
float dpCloud(vec2 xz) { return 1.0; }
float dpContact(vec2 xz) { return 0.0; }
float dpRipple(vec2 xz, float h) { return 0.0; }
// cw: the cell's centre (world xz); N: the relief's normal there; tone: how lit (0..1); nb: the relief's
// height at the cell's neighbours minus its own (right, left, up-screen, down-screen; DP_RELIEF, when the
// surface defines it, is the relief function: world/ground.js groundRelief(p, density))
bool dpRidge(vec2 cw, vec3 N, float tone, vec4 nb, float h, out float idx) { idx = 0.0; return false; }
`;
