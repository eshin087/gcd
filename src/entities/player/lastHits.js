// The blink chain's LAST HIT (hit 5 of `?lights=blink`; combat.js LIGHT_BLINK[4]). The owner (2026-11-25):
// "make the last 5th attack just be a more stronger light attack but have it always be a different
// stroke to make it look dynamic and random". Data only (no imports).
// STUB: nothing here yet, so combat.js still plays the finisher pick (finishers.js).

/** The last hit's clips (swings.js format), spread into SWINGS. */
export const LAST_HITS_BLINK = {};

/** The look hit 5 wears under `?lights=blink` (combat.js setLights `wear`): `{ anim, variants, ... }`.
 *  The animator picks among `anim` and `variants` at random, never the same one twice in a row
 *  (anim.js _pickVariant). `null`: the finisher pick (finishers.js), as before. */
export const LAST_HIT_BLINK = null;
