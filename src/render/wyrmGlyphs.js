import * as THREE from 'three';
import { FONT_STACK } from './glyphs.js';

// The wyrm's ASCII-art letters (FLAG.ART): LARGE, readable characters in the game's own bold
// monospace, 8 x 13 px cells at 720p (the owner's pick "B" of three rendered sizes, 2026-11-14,
// ADR-092). At that size the wyrm is about 25 letters across its body and every one of them can be
// read: it is classic ASCII art, not a texture of digits.
// Superseded: thin one-pixel 4 x 6 digits in 5 x 8 cells (3 x 5 in 4 x 6 under 900 px), which printed
// the reference's fine digit field but read as a grey texture at the game camera.

/**
 * The letters in three sets, one per brightness tier of a cell (art pass, wyrmCell): light marks
 * for the charcoal hide, open symbols for lit scales, dense blocks for rims, lava and bone. Inside
 * a tier the cell's own hash picks the letter, so a letter only changes when its cell changes tier.
 * Symbols and blocky capitals only (STYLE.md: lowercase runs read as words). All of them are in
 * the world atlas too.
 */
export const WYRM_SETS = { dim: ':;~^"!-=', mid: '+*<>?17XVY', bright: '#%&@8B0M$W' };
/** Stroke glyphs after the sets, in screen-direction order: horizontal, rising, vertical, falling. */
export const WYRM_STROKES = '-/|\\';

/**
 * Letter cell [w, h] in device px for a canvas H px tall: 1/55 of the height (8 x 13 at 720p, 12 x 20
 * at 1080p), never under 6 x 10 (a phone at dpr 1: smaller bold letters close up into blots).
 */
export function wyrmArtCell(H) {
  const ch = Math.max(10, Math.min(30, Math.round(H / 55)));
  return [Math.max(6, Math.round(ch * 0.62)), ch];
}

/**
 * Pixel-exact single-row atlas at cw x ch px per glyph: a blank, the WYRM_SETS dim / mid / bright
 * letters, then the 4 WYRM_STROKES. Returns { texture, sets: [mid start, bright start, stroke
 * start] (atlas columns; dim starts at 1), total }.
 */
export function createWyrmArtAtlas(cw, ch) {
  const { dim, mid, bright } = WYRM_SETS;
  const glyphs = [' ', ...dim, ...mid, ...bright, ...WYRM_STROKES];
  const d = [...dim].length, m = [...mid].length, b = [...bright].length;
  const canvas = document.createElement('canvas');
  canvas.width = glyphs.length * cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.max(7, Math.round(ch * 0.98))}px ${FONT_STACK}`;
  glyphs.forEach((g, i) => {
    if (g !== ' ') ctx.fillText(g, i * cw + cw / 2, ch / 2 + 0.5);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return { texture: tex, sets: [1 + d, 1 + d + m, 1 + d + m + b], total: glyphs.length };
}
