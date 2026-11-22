// THE IMPACT STAMP: a landed cut as a short ASCII animation printed in the letter grid at the drawn
// contact (the fire field's `steel` letters; STYLE.md "The fire field"). STUB: the interface is
// fixed (PlayerFx.contact calls it; see combat/impact.js for the record), the drawing is to come.

/** Every loose glyph the stamp spawns as a particle (the world atlas: tests/glyphcheck.mjs reads this). */
export const STAMP_GLYPHS = [];

/** The last stamp's counts (tests read it; reused, never reallocated). `n` counts the stamps drawn. */
export const STAMP_LAST = { blobs: 0, frames: 0, n: 0 };

/**
 * One landed cut at (x, y, z), the drawn contact. `o`: combat/impact.js (tier, cut, edge, hilt, crit,
 * power, low, target). `k`: the piece's strength (impactK('stamp')). Returns what it spawned; never throws.
 */
export function stampHit(game, x, y, z, o, k = 1) {
  return 0;
}

/** Per frame (fx time: it runs on through a hit-stop). Never throws. */
export function stampUpdate(game, dt) {}

/** Drop every running stamp (a level reset). */
export function stampClear(game) {}
