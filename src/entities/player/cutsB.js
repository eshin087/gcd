// Instant-cut light combo, variant b (`?lights=blink&cuts=b`, combat.js setCuts; ADR-215): lunging draws.
// Hits 1-5 only; the heavies and the specials stay the blink set's. Clip format: swings.js. Data only.

export const CUTS_B = {};

/** The looks of hits 1-5 (`null`: the blink set's own look for that hit, until the clip is written). */
export const LIGHT_CUTS_B = [null, null, null, null, null];
