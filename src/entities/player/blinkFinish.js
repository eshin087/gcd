// Hit 5 of the instant light chain as ONE fixed finisher (`?lights=blink&fin=a|b|c`, combat.js setFin;
// ADR-237). The owner (2026-11-26): "Make the 5th light attack combo finisher be one strike that looks
// cooler and more powerful." Three options to pick from; each is one stroke (no variants), on hit 5's
// own clock (combat.js LIGHT[4]: windup 0.28 s, active 0.13 s, recovery 0.42 s), a plain blade hit (no
// shards). Clip format: swings.js. Data only.

export const FINISH_BLINK = {};

/** The looks of hit 5 per option (`null`: the blink set's own last hit, until the clip is written). */
export const FIN_LOOKS = { a: null, b: null, c: null };
