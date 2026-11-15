import * as THREE from 'three';

// The wyrm's ASCII-art letters (FLAG.ART): fine pixel-font digits on black, ~5 x 8 px cells at 720p
// (the owner's pick "B, medium" of three rendered sizes, 2026-11-15, ADR-093). Brightness, not letter
// density, draws the dragon: a calm charcoal body of dim digits with bright ones only on scale rims,
// horns and claws, so the scales and the joints read as detail.
// Superseded: large bold symbols in 8 x 13 cells (ADR-092, "way too flashy ... too big"), and before
// that these same fonts at 4 x 6 cells on a 720p screen.
//
// Bitmaps: rows top -> bottom, one bit per column, the left column the highest bit.

const FONT_4X6 = {
  ' ': [0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 4],
  ':': [0, 0, 4, 0, 0, 4],
  "'": [4, 4, 0, 0, 0, 0],
  ';': [0, 0, 4, 0, 4, 8],
  '!': [4, 4, 4, 4, 0, 4],
  r: [0, 0, 11, 12, 8, 8],
  i: [4, 0, 12, 4, 4, 14],
  v: [0, 0, 9, 9, 6, 6],
  x: [0, 0, 9, 6, 6, 9],
  c: [0, 0, 7, 8, 8, 7],
  1: [4, 12, 4, 4, 4, 14],
  7: [15, 1, 2, 4, 4, 4],
  s: [0, 0, 7, 12, 3, 14],
  2: [6, 9, 1, 2, 4, 15],
  3: [14, 1, 6, 1, 1, 14],
  4: [2, 6, 10, 15, 2, 2],
  9: [6, 9, 9, 7, 1, 6],
  6: [6, 8, 14, 9, 9, 6],
  8: [6, 9, 6, 9, 9, 6],
  5: [15, 8, 14, 1, 1, 14],
  0: [6, 9, 11, 13, 9, 6],
  A: [6, 9, 9, 15, 9, 9],
  '@': [6, 9, 11, 11, 8, 7],
  B: [14, 9, 14, 9, 9, 14],
  M: [9, 15, 15, 9, 9, 9],
  // stroke glyphs, appended after the density ramp (not part of it): the art pass draws them along
  // the scale rims (screen direction of the rim line), the reference's '\ /' scale outlines
  '-': [0, 0, 0, 15, 0, 0],
  '/': [1, 1, 2, 4, 8, 8],
  '|': [4, 4, 4, 4, 4, 4],
  '\\': [8, 8, 4, 2, 1, 1],
};

// The same letters as 3 x 5 bitmaps, for small screens (a phone at the LOW preset is ~393 px tall).
const FONT_3X5 = {
  ' ': [0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 2],
  ':': [0, 2, 0, 2, 0],
  "'": [2, 2, 0, 0, 0],
  ';': [0, 2, 0, 2, 4],
  '!': [2, 2, 2, 0, 2],
  r: [0, 5, 6, 4, 4],
  i: [2, 0, 6, 2, 7],
  v: [0, 0, 5, 5, 2],
  x: [0, 5, 2, 2, 5],
  c: [0, 3, 4, 4, 3],
  1: [2, 6, 2, 2, 7],
  7: [7, 1, 2, 2, 2],
  s: [3, 4, 2, 1, 6],
  2: [6, 1, 2, 4, 7],
  3: [6, 1, 2, 1, 6],
  4: [5, 5, 7, 1, 1],
  9: [2, 5, 3, 1, 2],
  6: [3, 4, 6, 5, 2],
  8: [2, 5, 2, 5, 2],
  5: [7, 4, 6, 1, 6],
  0: [2, 5, 5, 5, 2],
  A: [2, 5, 7, 5, 5],
  '@': [2, 5, 7, 4, 3],
  B: [6, 5, 6, 5, 6],
  M: [5, 7, 7, 5, 5],
  '-': [0, 0, 7, 0, 0],
  '/': [1, 1, 2, 4, 4],
  '|': [2, 2, 2, 2, 2],
  '\\': [4, 4, 2, 1, 1],
};

// Classic 5 x 7 dot-matrix letters, for screens where a 5 x 8 cell would be too fine (~900 px tall).
const bits = (rows) => rows.map((r) => parseInt(r, 2));
const FONT_5X7 = {
  ' ': bits(['00000', '00000', '00000', '00000', '00000', '00000', '00000']),
  '.': bits(['00000', '00000', '00000', '00000', '00000', '01100', '01100']),
  ':': bits(['00000', '01100', '01100', '00000', '01100', '01100', '00000']),
  ';': bits(['00000', '01100', '01100', '00000', '01100', '00100', '01000']),
  "'": bits(['01100', '00100', '01000', '00000', '00000', '00000', '00000']),
  '!': bits(['00100', '00100', '00100', '00100', '00100', '00000', '00100']),
  i: bits(['00100', '00000', '01100', '00100', '00100', '00100', '01110']),
  v: bits(['00000', '00000', '10001', '10001', '10001', '01010', '00100']),
  r: bits(['00000', '00000', '10110', '11001', '10000', '10000', '10000']),
  0: bits(['01110', '10001', '10011', '10101', '11001', '10001', '01110']),
  1: bits(['00100', '01100', '00100', '00100', '00100', '00100', '01110']),
  2: bits(['01110', '10001', '00001', '00010', '00100', '01000', '11111']),
  3: bits(['11111', '00010', '00100', '00010', '00001', '10001', '01110']),
  4: bits(['00010', '00110', '01010', '10010', '11111', '00010', '00010']),
  5: bits(['11111', '10000', '11110', '00001', '00001', '10001', '01110']),
  6: bits(['00110', '01000', '10000', '11110', '10001', '10001', '01110']),
  7: bits(['11111', '00001', '00010', '00100', '01000', '01000', '01000']),
  8: bits(['01110', '10001', '10001', '01110', '10001', '10001', '01110']),
  9: bits(['01110', '10001', '10001', '01111', '00001', '00010', '01100']),
  A: bits(['01110', '10001', '10001', '10001', '11111', '10001', '10001']),
  '@': bits(['01110', '10001', '00001', '01101', '10101', '10101', '01110']),
  '-': bits(['00000', '00000', '00000', '11111', '00000', '00000', '00000']),
  '/': bits(['00001', '00001', '00010', '00100', '01000', '10000', '10000']),
  '|': bits(['00100', '00100', '00100', '00100', '00100', '00100', '00100']),
  '\\': bits(['10000', '10000', '01000', '00100', '00010', '00001', '00001']),
};

/**
 * The letters in three sets, one per brightness tier of a cell (art pass, wyrmCell): light glyphs for
 * the charcoal hide, digits for lit scales, round full digits for rims and lava. Inside a tier the
 * cell's own hash picks the letter, so a letter only changes when its cell changes tier. Digits
 * dominate, like the owner's reference. Every letter is in each of the three fonts.
 */
export const WYRM_SETS = { dim: '17iv!;r27', mid: '2345968017', bright: '96805A@3' };
/** Stroke glyphs after the sets, in screen-direction order: horizontal, rising, vertical, falling. */
export const WYRM_STROKES = '-/|\\';

/** The pixel fonts: glyph w x h px, its top offset in the cell, the cell cw x ch px (at scale 1). */
export const WYRM_FONTS = {
  f3x5: { w: 3, h: 5, top: 0, cw: 4, ch: 6, glyphs: FONT_3X5 },
  f4x6: { w: 4, h: 6, top: 1, cw: 5, ch: 8, glyphs: FONT_4X6 },
  f5x7: { w: 5, h: 7, top: 1, cw: 6, ch: 9, glyphs: FONT_5X7 },
};
// font / integer scale pairs, smallest cell first
const CHOICES = [['f3x5', 1], ['f4x6', 1], ['f5x7', 1], ['f4x6', 2], ['f5x7', 2], ['f4x6', 3], ['f5x7', 3]];

/**
 * The font and integer scale for a canvas H device px tall: the cell whose height is nearest H / 90
 * (5 x 8 at 720p, the owner's pick; 6 x 9 at 1080p; 4 x 6 on a 393 px phone; 10 x 16 at 1440p),
 * ties to the smaller. Returns { font, s, cell: [cw, ch] }.
 */
export function wyrmArtFont(H) {
  const want = Math.max(1, H) / 90;
  let best = CHOICES[0], bd = Infinity;
  for (const c of CHOICES) {
    const d = Math.abs(WYRM_FONTS[c[0]].ch * c[1] - want);
    if (d < bd - 1e-9) {
      bd = d;
      best = c;
    }
  }
  const f = WYRM_FONTS[best[0]];
  return { font: best[0], s: best[1], cell: [f.cw * best[1], f.ch * best[1]] };
}
/** Letter cell [w, h] in device px for a canvas H px tall (wyrmArtFont). */
export const wyrmArtCell = (H) => wyrmArtFont(H).cell;

/**
 * Pixel-exact single-row atlas of font `key` at integer scale `s`: a blank, the WYRM_SETS dim / mid /
 * bright letters, then the 4 WYRM_STROKES, each glyph `top` px down from its cell's top-left with a
 * soft 0.24 halo on its neighbours (never into the gap column, so letters stay apart). Returns
 * { texture, sets: [mid start, bright start, stroke start] (atlas columns; dim starts at 1), total }.
 */
export function createWyrmArtAtlas(key = 'f4x6', s = 1) {
  const F = WYRM_FONTS[key] ?? WYRM_FONTS.f4x6;
  s = Math.max(1, Math.round(s) || 1);
  const { w: gw, h: gh, top } = F;
  const cw = F.cw * s, ch = F.ch * s, msb = 1 << (gw - 1);
  const { dim, mid, bright } = WYRM_SETS;
  const glyphs = [' ', ...dim, ...mid, ...bright, ...WYRM_STROKES].map((c) => F.glyphs[c] ?? F.glyphs[' ']);
  const sets = [1 + dim.length, 1 + dim.length + mid.length, 1 + dim.length + mid.length + bright.length];
  const canvas = document.createElement('canvas');
  canvas.width = glyphs.length * cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  const on = (rows, x, y) => y >= 0 && y < gh && x >= 0 && x < gw && (rows[y] & (msb >> x)) !== 0;
  glyphs.forEach((rows, col) => {
    // a soft halo on the stroke's neighbours (the reference's letters are anti-aliased, not 1 px
    // hairlines: at 0.12 the hide read as sparse wire text, at 0.24 as the reference's soft digit field)
    ctx.fillStyle = 'rgba(255,255,255,0.24)';
    for (let y = -top; y <= gh; y++) {
      for (let x = 0; x < gw; x++) {
        if (on(rows, x, y) || y + top >= F.ch) continue;
        if (on(rows, x - 1, y) || on(rows, x + 1, y) || on(rows, x, y - 1) || on(rows, x, y + 1)) ctx.fillRect(col * cw + x * s, (y + top) * s, s, s);
      }
    }
    ctx.fillStyle = '#fff';
    rows.forEach((b, y) => {
      for (let x = 0; x < gw; x++) if (b & (msb >> x)) ctx.fillRect(col * cw + x * s, (y + top) * s, s, s);
    });
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return { texture: tex, sets, total: glyphs.length };
}
