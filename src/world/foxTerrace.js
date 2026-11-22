import { createCourtyard } from './courtyard.js';

// The Foxfire Terrace (levels/foxfire.js; ADR-131): a moonlit hill shrine. STUB: the courtyard's set
// until the terrace is built (the round paving, the lanterns, the stone foxes, the charm posts, the
// great fox and the spirit gate).

/** Layout numbers (world metres). The level's CONFIG.world overrides match these (levels/foxfire.js). */
export const TERRACE = {
  r: 14, // the round paving's radius, centred on the origin
  cell: 1.45, // paving slab pitch (the courtyard's)
  lanternR: 14.8, lanterns: 10,
  statueR: 13.2, statues: 6,
  postR: 16.5, posts: 8,
  pathTo: 32, // the flagstone path runs from the terrace's south rim to here
  bonfire: { x: 0, z: 34 },
};

export function createFoxTerrace(U, colliders) {
  return createCourtyard(U, colliders);
}
