// The steel look set's standing pose (`?lights=steel`, ADR-202): how the hero stands with the sword,
// after the owner's reference footage. anim.js stand() calls steelStand in place of the two stances
// (stances.js) while the look set is on (STEEL.on: combat.js setLights flips it).
/** on: the steel look set is the one worn. */
export const STEEL = { on: false };

/** Write the standing pose over guard()'s (p: the pose, P: anim.js's channel map, A: the animator).
 *  Returns false while it is not written: stand() then uses today's stances. */
export function steelStand(p, P, A) {
  return false;
}
