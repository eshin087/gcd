import { createSurfaceGlyphMaterial, FLAG } from '../../../render/materials.js';

// Look option `a` of the duelists' bodies (`?ashLook=a`, `?lordLook=a`; `c` = with the phase dressing
// too): the same figure and outfit drawn through the WYRM's art path (FLAG.ART with a `wyrm` art
// source, render/materials.js wyrmFeatures; docs/STYLE.md "The house style"): the fine 5 x 8 px
// digits, a dark body with brighter digits only where the camera's key light catches it, outline
// strokes along the parts, no blank cell inside a shape. Today the two human bosses print in the
// hero's ink-line art on the 4 px dot matrix (FLAG.ART_HERO); this is the alternative the owner judges.
// The weapon (and whatever a spec marks `keep`) stays on today's material: a blade is thinner than
// one art cell and printed as nothing in the digits.
//
// How (gear modules only, no edit to the rig or the renderer): a duelist's rig is the hero's
// (player/model.js buildHero), its materials one set per rig (`M`, handed to every gear item's
// build). At the FIRST item's build, toDragonLook() replaces each of those materials, in place in `M`,
// with an art-path twin that keeps its name, its side and the uniforms the actor drives (uGlow,
// uInkGlow, uInk, uEmissive, uFlash, uWarn, uDissolve), and re-points the meshes the rig had already
// hung (the face). Every later item, buildHero's `mats`, the actor's _tint and his per-frame code then
// see only the twins. _tint's uArtFill writes find no such uniform (`?.`) and do nothing: the colours
// are the `ink` of each spec below. Same count of materials, so the same draw calls.
//
// The gear's build context has no `U` (the shared uniforms): until buildHero hands it in
// (`item.build({ ..., U })`, see the looks report) the shared uniform OBJECTS are borrowed from one
// of the rig's own materials, which hold the very same references. Only the let-go grid of letGo.js
// (uWyrmGrid / uWyrmLetGo) is then a private copy: his death dissolve still works, its cells just do
// not line up with the art grid.

/** Shared uniforms an art-path material takes from U (materials.js SHARED, SURFACE_SHARED, the key light's axes, the bones). */
const BORROW = [
  'uTime', 'uMoonDir', 'uMoonColor', 'uAmbient', 'uFogColor', 'uFogNear', 'uFogFar', 'uFocus',
  'uCamPos', 'uPLPos', 'uPLCol', 'uPLRad', 'uShadowMap', 'uShadowMatrix', 'uShadowTexel',
  'uGlyphAtlas', 'uScorch', 'uScorchBounds', 'uArtSolid', 'uArtHeroEdge', 'uArtHeroKey', 'uCamRight', 'uCamUp', 'uBoneTex',
];

function borrowU(M) {
  const src = M.coat?.uniforms ?? Object.values(M).find((m) => m?.uniforms?.uCamRight)?.uniforms;
  const U = {};
  if (!src) return U;
  for (const k of BORROW) if (src[k]) U[k] = src[k];
  return U;
}

/** Rigs already converted (the set is shared by every item's build). */
const CONVERTED = new WeakSet();

/**
 * Turn rig `ctx` (a gear item's build context: M, root, U?) to the dragon look: each material in M
 * becomes the art-path twin made from `spec[name]` (else `spec.default`; a spec `{ keep: true }`
 * leaves that material as it is). Once per rig.
 */
export function toDragonLook(ctx, spec) {
  const { M, root } = ctx;
  if (!M || CONVERTED.has(M)) return;
  CONVERTED.add(M);
  const U = ctx.U ?? borrowU(M);
  const swap = new Map();
  let seed = 3.1;
  for (const name of Object.keys(M)) {
    const old = M[name];
    const s = spec[name] ?? spec.default;
    if (!old?.uniforms || s.keep) continue;
    const m = createSurfaceGlyphMaterial(U, {
      flag: FLAG.ART,
      wyrm: s,
      side: old.side,
      seed: (seed += 7.3),
      glowMask: 1,
      inkGlow: s.inkGlow ?? 0,
      ink: s.ink,
      emissive: s.emit ?? [1.0, 0.3, 0.05],
    });
    m.name = `${old.name || name}:art`;
    m.userData.artLook = name;
    swap.set(old, m);
    M[name] = m;
  }
  // the meshes hung before the first item (the face, the neck, the hero's hair)
  root?.traverse((o) => {
    if (o.isMesh && swap.has(o.material)) o.material = swap.get(o.material);
  });
  for (const old of swap.keys()) old.dispose?.();
}

/** True when this rig is drawn in the dragon look. */
export const isDragonLook = (M) => CONVERTED.has(M);

/** Set a material's colour whichever path draws it (the art source's ink, or the ink-line fill). */
export function setFill(m, r, g, b) {
  const u = m?.uniforms;
  if (!u) return;
  if (u.uWInk) {
    u.uWInk.value.setRGB(r, g, b);
    u.uWRimInk?.value.setRGB(r, g, b);
  } else u.uArtFill?.value.setRGB(r, g, b);
}

// ---------------------------------------------------------------- the art sources
// (materials.js wyrmFeatures: ink · light [gain, key, fresnel, floor] · key [right, up, toward] ·
// envSat · strokes 'axis' (stroke glyphs along a part's silhouette, where the fresnel reaches
// strokeEdge) · glow [gaps, all] · emit)
/** The wyrm's lighting (dragon/model.js LIT): the key light from the viewer's upper left, the moon greyed. */
const LIT = { key: [-0.5, 0.9, 1.0], envSat: 0.3 };
/** Cloth: a dark body, the key light catching the upper-left faces, its outline in strokes. */
export const ART_CLOTH = { ...LIT, light: [1.0, 0.75, 0.35, 0.02], strokes: 'axis', strokeEdge: 0.4 };
/** Metal: a stronger key and a brighter moonlit edge, outlined. */
export const ART_METAL = { ...LIT, light: [1.0, 0.9, 1.3, 0.02], strokes: 'axis', strokeEdge: 0.3 };
/** Skin: warm, lit, no strokes inside the small face. */
export const ART_SKIN = { ...LIT, light: [1.0, 0.7, 0.2, 0.05], strokes: 'none' };
/** Light (an ember, a blade of red light): self-lit, glowing with uGlow. */
export const ART_LIGHT = { ...LIT, light: [0.4, 0.2, 0.2, 0.1], strokes: 'none', glow: [0, 0.8], inkGlow: 0.8 };
/** Left on today's material (the weapon: thinner than an art cell). */
export const ART_KEEP = { keep: true };

/** Shen Hui, the Ash Disciple (gear.js says which material is which; the hues of disciple.js _tint). */
export const ASH_ART = {
  default: { ...ART_CLOTH, ink: [0.16, 0.16, 0.16] },
  coat: { ...ART_CLOTH, ink: [0.3, 0.29, 0.27] }, // the ash-grey robe
  collar: { ...ART_CLOTH, ink: [0.3, 0.29, 0.27] },
  lining: { ...ART_CLOTH, ink: [0.1, 0.1, 0.105] },
  hem: { ...ART_CLOTH, ink: [0.5, 0.48, 0.45] }, // the off-white collar and shin wraps
  shirt: { ...ART_CLOTH, ink: [0.06, 0.06, 0.066] }, // the charcoal sash, bracer, shoes
  pants: { ...ART_CLOTH, ink: [0.12, 0.12, 0.125] },
  leather: { ...ART_CLOTH, ink: [0.44, 0.35, 0.18], strokeEdge: 0.25 }, // the straw douli: its rim outlined
  hair: { ...ART_CLOTH, ink: [0.06, 0.06, 0.07] },
  hairTip: { ...ART_CLOTH, ink: [0.08, 0.08, 0.09] },
  skin: { ...ART_SKIN, ink: [0.55, 0.4, 0.3] },
  eye: { ...ART_SKIN, ink: [0.1, 0.08, 0.07] },
  // the jian (armor, bevel, trim, the red tassel): today's material
  armor: ART_KEEP,
  bevel: ART_KEEP,
  trim: ART_KEEP,
  facing: ART_KEEP,
  // the phase dressing's smouldering edges (look.js; option `c`)
  flask: { ...ART_LIGHT, ink: [0.9, 0.32, 0.06], emit: [1.0, 0.3, 0.05] },
};
