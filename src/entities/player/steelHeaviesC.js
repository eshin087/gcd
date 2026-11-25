// The steel look set (`?lights=steel`, combat.js setLights; ADR-202): the lone heavy, the heavy after one light, and the charged heavy.
// Every clip here follows the owner's reference footage pose for pose (both arms, the body, the feet),
// fitted to this game's own clock: no number of any attack changes. Clip format: swings.js.

export const STEEL_HEAVIES_C = {};

/** The looks of HEAVY[0] and HEAVY[1] (`null`: today's look, until the clip is written). */
export const HEAVY_STEEL_C = [null, null];
/** The charged heavy's look. */
export const SPECIAL_STEEL_C = { cleave: null };
