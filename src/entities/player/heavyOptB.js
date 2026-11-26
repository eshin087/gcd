// The instant heavies, option b (`?lights=blink&hv=b`, combat.js setHv; ADR-238). The owner
// (2026-11-26): "The heavy attack swing arc needs to be more visible. From the back it looks awkward and
// seems like he is cutting at a very steep angle and doesn't look like a 2h heavy attack animation."
// The five heavy branches (combat.js HEAVY[0..4]) as clearly two-handed blows whose arcs read from the
// game camera behind him. Clip format: swings.js; the heavy beats: heaviesBlink.js. Data only.

export const HEAVY_OPT_B = {};

/** The looks of HEAVY[0..4] (`null`: the blink set's own heavy, until the clip is written). */
export const HEAVY_LOOKS_B = [null, null, null, null, null];
