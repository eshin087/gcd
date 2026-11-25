import { dragonLook } from '../render/dragonPrint.js';

// THE DRAGON GROUND'S GRASS (stub: the grass's author fills it). The owner (2026-11-24): "how can we make 3d
// looking grass with this style and still incorporate the player walking around and the grass bending as
// they go and the player cutting". Two builds to compare, switch `dgGrass`:
//   '0'  the dragon ground as first shown (no grass of its own; the 3D blades hidden)
//   'a'  printed tufts: the grass is part of the lit relief the ground prints (DG_GRASS_GLSL's dgGrass);
//        the hero's wake (uTrail / uBend*, world/grassTrail.js) lays it over, the scorch map's torn channel
//        mows it to stubble, burn chars it
//   'b'  standing digit blades: the 3D blades (world/grass.js) kept and printed as lit digits over the
//        dragon ground; they bend and are cut as today's grass is
//
// dgGrass(...) is called once per cell by world/ground.js's look b (after the base relief is lit, before
// the print) with the cell's centre and hash, the meadow's density there, burn / torn, and may change the
// normal, the body colour, the tone, or pick the cell's glyph itself (idx >= 0). Needs COMMON_GLSL,
// DRAGON_PRINT_GLSL and the wake's uniforms (declared by ground.js) before it.

export const dgGrassLook = () => {
  const v = dragonLook('dgGrass');
  return v === 'a' || v === 'b' ? v : '0';
};

export const DG_GRASS_GLSL = /* glsl */ `
void dgGrass(vec2 cw, float h, float d, float burn, float torn, inout vec3 N, inout vec3 body, inout float tone, inout float idx) {}
`;
