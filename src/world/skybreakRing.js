import { createCourtyard, COURTYARD } from './courtyard.js';

// The Skybreak Ring: an open-air tournament ring on the badlands (`?level=ring`).
//
// STUB: until the set is built this is the Ashfall Courtyard's set under the ring's layout names,
// so the level loads and the boss can be worked on. The set's own builder replaces this whole file.

/** The ring's layout (levels/skybreak.js reads it). `half`: the platform is |x|, |z| <= half. */
export const RING = {
  half: COURTYARD.half,
  entryZ: COURTYARD.gateZ, // where the hero steps onto the platform (its south edge)
  bonfire: { x: COURTYARD.bonfire.x, z: COURTYARD.bonfire.z },
  floor: { r: COURTYARD.half - 1.8 }, // the circle the boss keeps to
  wait: { x: 0, z: -3, yaw: 0 }, // where the boss waits for the hero
};

export function createSkybreakRing(U, colliders) {
  return createCourtyard(U, colliders);
}
